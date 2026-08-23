import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

export function useCreateTaxonomy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      code: string;
      name: string;
      practica_id: string | null;
      is_active: boolean;
    }) => {
      const { data: result, error } = await supabase
        .from("servicios")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taxonomies"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.taxonomy") }));
    },
    onError: createMutationErrorHandler("creating taxonomy"),
  });
}

export function useUpdateTaxonomy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        code: string;
        name: string;
        practica_id: string | null;
        is_active: boolean;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("servicios")
        .update(data)
        .eq("taxonomy_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taxonomies"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.taxonomy") }));
    },
    onError: createMutationErrorHandler("updating taxonomy"),
  });
}
