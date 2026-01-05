import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

export function useCreateIndustry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { industry_name: string; fiscal_year_end: string }) => {
      const { data: result, error } = await supabase
        .from("industries")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["industries"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.industry") }));
    },
    onError: createMutationErrorHandler("creating industry"),
  });
}

export function useUpdateIndustry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { industry_name?: string; fiscal_year_end?: string } }) => {
      const { data: result, error } = await supabase
        .from("industries")
        .update(data)
        .eq("industry_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["industries"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.industry") }));
    },
    onError: createMutationErrorHandler("updating industry"),
  });
}

export function useDeleteIndustry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("industries").delete().eq("industry_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["industries"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.industry") }));
    },
    onError: createMutationErrorHandler("deleting industry"),
  });
}
