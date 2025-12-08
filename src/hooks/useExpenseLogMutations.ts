import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
      toast({ title: "Expense log created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating expense log", description: error.message, variant: "destructive" });
    },
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
      toast({ title: "Expense log deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error deleting expense log", description: error.message, variant: "destructive" });
    },
  });
}
