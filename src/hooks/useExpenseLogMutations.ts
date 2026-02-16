import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";
export function useCreateExpenseLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      engagement_id: string;
      expense_type_id: string;
      date_incurred: string;
      amount: number;
      currency: string;
      description?: string | null;
      receipt_url?: string | null;
      created_by_staff_id?: string | null;
    }) => {
      const { data: result, error } = await supabase
        .from("expense_logs")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense_logs"] });
      queryClient.invalidateQueries({ queryKey: ["all_expense_logs"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.expenseLog") }));
    },
    onError: createMutationErrorHandler("creating expense log"),
  });
}

export function useDeleteExpenseLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_logs").delete().eq("expense_log_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense_logs"] });
      queryClient.invalidateQueries({ queryKey: ["all_expense_logs"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.expenseLog") }));
    },
    onError: createMutationErrorHandler("deleting expense log"),
  });
}
