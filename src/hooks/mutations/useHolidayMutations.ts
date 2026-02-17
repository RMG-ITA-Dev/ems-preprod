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
