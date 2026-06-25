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
      created_by,
    }: {
      holiday_date: string;
      holiday_name: string;
      created_by: string;
    }) => {
      const { data, error } = await supabase
        .from("holidays")
        .insert({ holiday_date, holiday_name, created_by })
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
    }: {
      holiday_id: string;
      holiday_date: string;
      holiday_name: string;
    }) => {
      const { data, error } = await supabase
        .from("holidays")
        .update({ holiday_date, holiday_name })
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
        .select("holiday_id, holiday_date, holiday_name")
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
      //   → Must be deleted BEFORE insert: UNIQUE constraint prevents inserting the correct
      //     holiday while this row still occupies the same date.
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

      // Exclude crossed-stale dates from allExistingDates — they will be deleted before insert,
      // freeing those slots for the correct holidays.
      const staleAtGeneratedIds = new Set(staleAtGeneratedDates.map((h) => h.holiday_id));
      const allExistingDates = new Set(
        rows.filter((h) => !staleAtGeneratedIds.has(h.holiday_id)).map((h) => h.holiday_date)
      );

      // Insert generated holidays that are not already at the correct date.
      const toInsert = generated
        .filter((g) => !allExistingDates.has(g.date))
        .map((g) => ({ holiday_date: g.date, holiday_name: g.name, created_by }));

      if (toInsert.length === 0 && staleByName.length === 0)
        throw new Error(i18n.t("holiday.allNationalAlreadyExist", { year }));

      // Delete crossed stale BEFORE insert — UNIQUE constraint requires their slots to be free.
      if (staleAtGeneratedDates.length > 0) {
        const { error: eDelCrossed } = await supabase
          .from("holidays")
          .delete()
          .in("holiday_id", staleAtGeneratedDates.map((h) => h.holiday_id));
        if (eDelCrossed) throw eDelCrossed;
      }

      // Insert correct holidays — if this fails, only crossed-stale slots are lost (recoverable
      // by running the generator again); regular stale entries are still intact.
      if (toInsert.length > 0) {
        const { error: e2 } = await supabase.from("holidays").insert(toInsert);
        if (e2) throw e2;
      }

      // Delete regular stale AFTER insert (R10 safety: data never absent if insert fails).
      if (staleAtOtherDates.length > 0) {
        const { error: eDel } = await supabase
          .from("holidays")
          .delete()
          .in("holiday_id", staleAtOtherDates.map((h) => h.holiday_id));
        if (eDel) throw eDel;
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
