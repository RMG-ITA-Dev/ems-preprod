import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

export function useCreateExpenseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { expense_name: string; default_unit_cost?: number }) => {
      const { data: result, error } = await supabase
        .from("expense_types")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense_types"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.expenseType") }));
    },
    onError: createMutationErrorHandler("creating expense type"),
  });
}

export function useUpdateExpenseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ expense_name: string; default_unit_cost: number }>;
    }) => {
      const { data: result, error } = await supabase
        .from("expense_types")
        .update(data)
        .eq("expense_type_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense_types"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.expenseType") }));
    },
    onError: createMutationErrorHandler("updating expense type"),
  });
}

export function useDeleteExpenseType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expense_types").delete().eq("expense_type_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense_types"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.expenseType") }));
    },
    onError: createMutationErrorHandler("deleting expense type"),
  });
}
