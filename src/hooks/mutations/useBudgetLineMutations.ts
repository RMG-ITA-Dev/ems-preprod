import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createMutationErrorHandler } from "@/lib/error-handler";

export function useCreateBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      wo_id: string;
      category_id: string;
      budgeted_hours: number;
      standard_rate: number;
    }) => {
      const { data: result, error } = await supabase
        .from("wo_budget_lines")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      // dashboard: cartera/encargo/personal/socio leen presupuestos de OT -- invalidación
      // aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: createMutationErrorHandler("creating budget line"),
  });
}

export function useUpdateBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        category_id: string;
        budgeted_hours: number;
        standard_rate: number;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("wo_budget_lines")
        .update(data)
        .eq("wo_line_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      // dashboard: cartera/encargo/personal/socio leen presupuestos de OT -- invalidación
      // aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: createMutationErrorHandler("updating budget line"),
  });
}

export function useDeleteBudgetLine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("wo_budget_lines").delete().eq("wo_line_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      // dashboard: cartera/encargo/personal/socio leen presupuestos de OT -- invalidación
      // aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: createMutationErrorHandler("deleting budget line"),
  });
}
