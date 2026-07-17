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

      // Composite key — the DB constraint is UNIQUE(holiday_date, oficina), so a
      // national (oficina=0) and a departmental (oficina=1|2) row may legitimately
      // share the same date. Keying by date alone would let one office's existing
      // row suppress another office's generated row.
      const holidayKey = (date: string, oficina: number) => `${date}:${oficina}`;

      // Query existing holidays for the year — need holiday_id for potential deletion.
      const { data: existing, error: e1 } = await supabase
        .from("holidays")
        .select("holiday_id, holiday_date, holiday_name, oficina")
        .gte("holiday_date", `${year}-01-01`)
        .lte("holiday_date", `${year}-12-31`);
      if (e1) throw e1;

      const rows = existing ?? [];

      // Partition into three groups:
      // exactMatch  — (date, oficina) already correct; skip insert
      // staleByName — wrong date but name matches a national holiday; delete then re-insert correctly
      // custom      — unrelated; leave untouched
      // Map from generated (date, oficina) → expected name, used to verify slot AND name match.
      const generatedByKey = new Map(generated.map((g) => [holidayKey(g.date, g.oficina), g.name]));

      const exactMatchKeys = new Set(
        rows
          .filter(
            (h) =>
              generatedByKey.get(holidayKey(h.holiday_date, h.oficina)) ===
              normalizeHolidayName(h.holiday_name)
          )
          .map((h) => holidayKey(h.holiday_date, h.oficina))
      );
      // Partition stale into two groups based on whether the occupied (date, oficina)
      // slot is a generated slot. NATIONAL_HOLIDAY_NAMES deliberately excludes
      // departmental names, so this never reclassifies a La Paz/Santa Cruz row.
      // Crossed stale: national name at a generated slot but wrong name for that slot.
      //   → Updated in-place (holiday_name only). Date stays occupied at all times — no window
      //     where the holiday disappears. UNIQUE constraint is never at risk.
      // Regular stale: national name at a non-generated slot (old wrong-year copy).
      //   → Deleted AFTER insert (R10 safety: insert first so data is never absent on failure).
      const staleAtGeneratedSlots = rows.filter((h) => {
        const n = normalizeHolidayName(h.holiday_name);
        const key = holidayKey(h.holiday_date, h.oficina);
        return (
          NATIONAL_HOLIDAY_NAMES.has(n) &&
          generatedByKey.has(key) &&
          generatedByKey.get(key) !== n
        );
      });
      const staleAtOtherSlots = rows.filter((h) => {
        const n = normalizeHolidayName(h.holiday_name);
        return NATIONAL_HOLIDAY_NAMES.has(n) && !generatedByKey.has(holidayKey(h.holiday_date, h.oficina));
      });
      const staleByName = [...staleAtGeneratedSlots, ...staleAtOtherSlots];

      // Crossed-stale slots remain in allExistingKeys — they are updated in-place, not re-inserted.
      const allExistingKeys = new Set(rows.map((h) => holidayKey(h.holiday_date, h.oficina)));

      // Insert generated holidays whose (date, oficina) slot isn't already occupied.
      // Includes both nationals (oficina=0) and departmentals (oficina=1|2) —
      // the generator produces both from the same source list.
      const toInsert = generated
        .filter((g) => !allExistingKeys.has(holidayKey(g.date, g.oficina)))
        .map((g) => ({ holiday_date: g.date, holiday_name: g.name, oficina: g.oficina, created_by }));

      if (toInsert.length === 0 && staleByName.length === 0)
        throw new Error(i18n.t("holiday.allHolidaysAlreadyExist", { year }));

      // Insert new holidays first (R10 safety: regular stale data never absent on insert failure).
      if (toInsert.length > 0) {
        const { error: e2 } = await supabase.from("holidays").insert(toInsert);
        if (e2) throw e2;
      }

      // Delete regular stale AFTER insert (R10 safety).
      if (staleAtOtherSlots.length > 0) {
        const { error: eDel } = await supabase
          .from("holidays")
          .delete()
          .in("holiday_id", staleAtOtherSlots.map((h) => h.holiday_id));
        if (eDel) throw eDel;
      }

      // Update crossed stale in-place — atomic, date never disappears, no constraint risk.
      for (const stale of staleAtGeneratedSlots) {
        const { error: eUpd } = await supabase
          .from("holidays")
          .update({ holiday_name: generatedByKey.get(holidayKey(stale.holiday_date, stale.oficina))! })
          .eq("holiday_id", stale.holiday_id);
        if (eUpd) throw eUpd;
      }

      return {
        created: toInsert.length,
        replaced: staleByName.length,
        skipped: exactMatchKeys.size,
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
