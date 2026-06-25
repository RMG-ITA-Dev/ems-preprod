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
      const exactMatchDates = new Set(
        rows
          .filter(
            (h) =>
              generatedDates.has(h.holiday_date) &&
              NATIONAL_HOLIDAY_NAMES.has(normalizeHolidayName(h.holiday_name))
          )
          .map((h) => h.holiday_date)
      );
      const staleByName = rows.filter(
        (h) =>
          !generatedDates.has(h.holiday_date) &&
          NATIONAL_HOLIDAY_NAMES.has(normalizeHolidayName(h.holiday_name))
      );

      // All dates occupied in the target year — used to respect the UNIQUE(holiday_date) constraint.
      // A custom entry at a generated date blocks that national holiday; user must remove it manually.
      const allExistingDates = new Set(rows.map((h) => h.holiday_date));

      // Insert generated holidays that are not already at the correct date.
      const toInsert = generated
        .filter((g) => !allExistingDates.has(g.date))
        .map((g) => ({ holiday_date: g.date, holiday_name: g.name, created_by }));

      if (toInsert.length === 0 && staleByName.length === 0)
        throw new Error(i18n.t("holiday.allNationalAlreadyExist", { year }));

      // Insert first — if this fails, stale entries are preserved (no data loss).
      if (toInsert.length > 0) {
        const { error: e2 } = await supabase.from("holidays").insert(toInsert);
        if (e2) throw e2;
      }

      // Delete stale entries only after insert succeeds.
      if (staleByName.length > 0) {
        const { error: eDel } = await supabase
          .from("holidays")
          .delete()
          .in("holiday_id", staleByName.map((h) => h.holiday_id));
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
