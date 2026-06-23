import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

export function useUpdateTimeEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      time_id,
      ...data
    }: {
      time_id: string;
      date_worked?: string;
      hours_logged?: number;
      description?: string | null;
    }) => {
      const { data: result, error } = await supabase
        .from("time_entries")
        .update(data)
        .eq("time_id", time_id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_time_entries"] });
      queryClient.invalidateQueries({ queryKey: ["time_entries"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("timesheet.entry") }));
    },
    onError: createMutationErrorHandler("updating time entry"),
  });
}
