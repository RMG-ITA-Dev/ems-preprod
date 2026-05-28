import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

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

export function useReplicateHolidaysToNextYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ created_by }: { created_by: string }) => {
      const now = new Date();
      const sourceYear = now.getFullYear();
      const targetYear = sourceYear + 1;

      const isLeapYear = (y: number) =>
        (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

      const { data: source, error: e1 } = await supabase
        .from("holidays")
        .select("holiday_date, holiday_name")
        .gte("holiday_date", `${sourceYear}-01-01`)
        .lte("holiday_date", `${sourceYear}-12-31`);
      if (e1) throw e1;
      if (!source || source.length === 0)
        throw new Error(i18n.t("holiday.noSourceHolidays", { year: sourceYear }));

      const { data: existing, error: e2 } = await supabase
        .from("holidays")
        .select("holiday_date")
        .gte("holiday_date", `${targetYear}-01-01`)
        .lte("holiday_date", `${targetYear}-12-31`);
      if (e2) throw e2;
      const existingDates = new Set((existing ?? []).map((h) => h.holiday_date));

      const toInsert: { holiday_date: string; holiday_name: string; created_by: string }[] = [];
      let skipped = 0;
      const invalidDates: string[] = [];

      for (const h of source) {
        const [, mm, dd] = h.holiday_date.split("-");
        if (mm === "02" && dd === "29" && !isLeapYear(targetYear)) {
          invalidDates.push(h.holiday_date);
          continue;
        }
        const targetDate = `${targetYear}-${mm}-${dd}`;
        if (existingDates.has(targetDate)) { skipped++; continue; }
        toInsert.push({ holiday_date: targetDate, holiday_name: h.holiday_name, created_by });
      }

      if (toInsert.length === 0) {
        const key =
          invalidDates.length > 0 && skipped === 0
            ? "holiday.allDatesLeapDay"
            : skipped > 0 && invalidDates.length === 0
              ? "holiday.allDatesAlreadyExist"
              : "holiday.allDatesLeapDayAndAlreadyExist";
        throw new Error(i18n.t(key, { year: targetYear }));
      }

      const { error: e3 } = await supabase.from("holidays").insert(toInsert);
      if (e3) throw e3;

      return { created: toInsert.length, skipped, invalidDates, targetYear };
    },
    onSuccess: ({ created, skipped, invalidDates, targetYear }) => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      queryClient.invalidateQueries({ queryKey: ["holidays-week"] });
      const hasPartial = skipped > 0 || invalidDates.length > 0;
      if (hasPartial) {
        toast.success(
          i18n.t("messages.holidaysReplicatedPartial", {
            count: created,
            year: targetYear,
            skipped: skipped + invalidDates.length,
          })
        );
      } else {
        toast.success(i18n.t("messages.holidaysReplicated"));
      }
    },
    onError: createMutationErrorHandler("replicating holidays"),
  });
}
