import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createMutationErrorHandler } from "@/lib/error-handler";

export function useCreateExpenseBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      wo_id: string;
      expense_type_id: string;
      budgeted_amount: number;
    }) => {
      const { data: result, error } = await supabase
        .from("wo_expense_budget")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      // dashboard: cartera/encargo/personal/socio leen gastos presupuestados de OT --
      // invalidación aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: createMutationErrorHandler("creating expense budget"),
  });
}

export function useUpdateExpenseBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        expense_type_id: string;
        budgeted_amount: number;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("wo_expense_budget")
        .update(data)
        .eq("wo_exp_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      // dashboard: cartera/encargo/personal/socio leen gastos presupuestados de OT --
      // invalidación aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: createMutationErrorHandler("updating expense budget"),
  });
}

export function useDeleteExpenseBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("wo_expense_budget").delete().eq("wo_exp_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      // dashboard: cartera/encargo/personal/socio leen gastos presupuestados de OT --
      // invalidación aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: createMutationErrorHandler("deleting expense budget"),
  });
}
