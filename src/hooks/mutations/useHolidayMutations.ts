import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";
import { getBoliviaNationalHolidays } from "@/lib/boliviaHolidays";

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

      const { data: existing, error: e1 } = await supabase
        .from("holidays")
        .select("holiday_date")
        .gte("holiday_date", `${year}-01-01`)
        .lte("holiday_date", `${year}-12-31`);
      if (e1) throw e1;

      const existingDates = new Set((existing ?? []).map((h) => h.holiday_date));

      const toInsert = generated
        .filter((g) => !existingDates.has(g.date))
        .map((g) => ({ holiday_date: g.date, holiday_name: g.name, created_by }));

      if (toInsert.length === 0)
        throw new Error(i18n.t("holiday.allNationalAlreadyExist", { year }));

      const { error: e2 } = await supabase.from("holidays").insert(toInsert);
      if (e2) throw e2;

      return {
        created: toInsert.length,
        skipped: generated.length - toInsert.length,
        total: generated.length,
        year,
      };
    },
    onSuccess: ({ created, skipped, year }) => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      queryClient.invalidateQueries({ queryKey: ["holidays-week"] });
      if (skipped > 0) {
        toast.success(
          i18n.t("messages.holidaysGeneratedPartial", { count: created, year, skipped })
        );
      } else {
        toast.success(i18n.t("messages.holidaysGenerated"));
      }
    },
    onError: createMutationErrorHandler("generating national holidays"),
  });
}
