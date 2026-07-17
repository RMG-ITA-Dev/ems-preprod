import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";
import { getBoliviaNationalHolidays, NATIONAL_HOLIDAY_NAMES, normalizeHolidayName } from "@/lib/boliviaHolidays";

export function useCreateHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      holiday_date,
      holiday_name,
      oficina,
      created_by,
    }: {
      holiday_date: string;
      holiday_name: string;
      oficina: number;
      created_by: string;
    }) => {
      const { data, error } = await supabase
        .from("holidays")
        .insert({ holiday_date, holiday_name, oficina, created_by })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      queryClient.invalidateQueries({ queryKey: ["holidays-week"] });
      toast.success(i18n.t("messages.holidayCreated"));
    },
    onError: createMutationErrorHandler("creating holiday"),
  });
}

export function useUpdateHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      holiday_id,
      holiday_date,
      holiday_name,
      oficina,
    }: {
      holiday_id: string;
      holiday_date: string;
      holiday_name: string;
      oficina: number;
    }) => {
      const { data, error } = await supabase
        .from("holidays")
        .update({ holiday_date, holiday_name, oficina })
        .eq("holiday_id", holiday_id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      queryClient.invalidateQueries({ queryKey: ["holidays-week"] });
      toast.success(i18n.t("messages.holidayUpdated"));
    },
    onError: createMutationErrorHandler("updating holiday"),
  });
}

export function useDeleteHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (holiday_id: string) => {
      const { error } = await supabase
        .from("holidays")
        .delete()
        .eq("holiday_id", holiday_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      queryClient.invalidateQueries({ queryKey: ["holidays-week"] });
      toast.success(i18n.t("messages.holidayDeleted"));
    },
    onError: createMutationErrorHandler("deleting holiday"),
  });
}

export function useGenerateNationalHolidays() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ created_by, year }: { created_by: string; year: number }) => {
      const generated = getBoliviaNationalHolidays(year);
      const generatedDates = new Set(generated.map((g) => g.date));

      // Query existing holidays for the year — need holiday_id for potential deletion.
      const { data: existing, error: e1 } = await supabase
        .from("holidays")
        .select("holiday_id, holiday_date, holiday_name, oficina")
        .gte("holiday_date", `${year}-01-01`)
        .lte("holiday_date", `${year}-12-31`);
      if (e1) throw e1;

      const rows = existing ?? [];

      // Partition into three groups:
      // exactMatch  — date already correct; skip insert
      // staleByName — wrong date but name matches a national holiday; delete then re-insert correctly
      // custom      — unrelated; leave untouched
      // Map from generated date → expected name, used to verify both date AND name match.
      const generatedByDate = new Map(generated.map((g) => [g.date, g.name]));

      const exactMatchDates = new Set(
        rows
          .filter(
            (h) => generatedByDate.get(h.holiday_date) === normalizeHolidayName(h.holiday_name)
          )
          .map((h) => h.holiday_date)
      );
      // Partition stale into two groups based on whether the occupied date is a generated date.
      // Crossed stale: national name at a generated date but wrong name for that slot.
      //   → Updated in-place (holiday_name only). Date stays occupied at all times — no window
      //     where the holiday disappears. UNIQUE constraint is never at risk.
      // Regular stale: national name at a non-generated date (old wrong-year copy).
      //   → Deleted AFTER insert (R10 safety: insert first so data is never absent on failure).
      const staleAtGeneratedDates = rows.filter((h) => {
        const n = normalizeHolidayName(h.holiday_name);
        return (
          NATIONAL_HOLIDAY_NAMES.has(n) &&
          generatedByDate.has(h.holiday_date) &&
          generatedByDate.get(h.holiday_date) !== n
        );
      });
      const staleAtOtherDates = rows.filter((h) => {
        const n = normalizeHolidayName(h.holiday_name);
        return NATIONAL_HOLIDAY_NAMES.has(n) && !generatedByDate.has(h.holiday_date);
      });
      const staleByName = [...staleAtGeneratedDates, ...staleAtOtherDates];

      // Crossed-stale dates remain in allExistingDates — they are updated in-place, not re-inserted.
      const allExistingDates = new Set(rows.map((h) => h.holiday_date));

      // Insert generated holidays that are not already at the correct date.
      // Includes both nationals (oficina=0) and departmentals (oficina=1|2) —
      // the generator produces both from the same source list.
      const toInsert = generated
        .filter((g) => !allExistingDates.has(g.date))
        .map((g) => ({ holiday_date: g.date, holiday_name: g.name, oficina: g.oficina, created_by }));

      if (toInsert.length === 0 && staleByName.length === 0)
        throw new Error(i18n.t("holiday.allNationalAlreadyExist", { year }));

      // Insert new holidays first (R10 safety: regular stale data never absent on insert failure).
      if (toInsert.length > 0) {
        const { error: e2 } = await supabase.from("holidays").insert(toInsert);
        if (e2) throw e2;
      }

      // Delete regular stale AFTER insert (R10 safety).
      if (staleAtOtherDates.length > 0) {
        const { error: eDel } = await supabase
          .from("holidays")
          .delete()
          .in("holiday_id", staleAtOtherDates.map((h) => h.holiday_id));
        if (eDel) throw eDel;
      }

      // Update crossed stale in-place — atomic, date never disappears, no constraint risk.
      for (const stale of staleAtGeneratedDates) {
        const { error: eUpd } = await supabase
          .from("holidays")
          .update({ holiday_name: generatedByDate.get(stale.holiday_date)! })
          .eq("holiday_id", stale.holiday_id);
        if (eUpd) throw eUpd;
      }

      return {
        created: toInsert.length,
        replaced: staleByName.length,
        skipped: exactMatchDates.size,
        total: generated.length,
        year,
      };
    },
    onSuccess: ({ created, replaced, skipped, year }) => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      queryClient.invalidateQueries({ queryKey: ["holidays-week"] });
      if (replaced > 0) {
        toast.success(i18n.t("messages.holidaysGeneratedWithReplacement", { created, year, replaced }));
      } else if (skipped > 0) {
        toast.success(i18n.t("messages.holidaysGeneratedPartial", { created, year, skipped }));
      } else {
        toast.success(i18n.t("messages.holidaysGenerated"));
      }
    },
    onError: createMutationErrorHandler("generating national holidays"),
  });
}
