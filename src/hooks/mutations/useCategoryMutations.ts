import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      category_name: string;
      display_order?: number;
      rate_high_bob: number;
      rate_low_bob: number;
      rate_high_usd: number;
      rate_low_usd: number;
      can_approve_wo?: boolean;
    }) => {
      const { data: result, error } = await supabase
        .from("categories")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.category") }));
    },
    onError: createMutationErrorHandler("creating category"),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        category_name: string;
        display_order: number;
        rate_high_bob: number;
        rate_low_bob: number;
        rate_high_usd: number;
        rate_low_usd: number;
        can_approve_wo: boolean;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("categories")
        .update(data)
        .eq("category_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.category") }));
    },
    onError: createMutationErrorHandler("updating category"),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("category_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.category") }));
    },
    onError: createMutationErrorHandler("deleting category"),
  });
}
