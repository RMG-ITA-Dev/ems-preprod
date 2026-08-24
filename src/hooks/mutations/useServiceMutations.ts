import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      code: number;
      abbreviation?: string | null;
      allows_rates_activities: boolean;
      is_active: boolean;
    }) => {
      const { data: result, error } = await supabase
        .from("practicas")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["activity_codes"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.service") }));
    },
    onError: createMutationErrorHandler("creating service"),
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        name: string;
        abbreviation: string | null;
        allows_rates_activities: boolean;
        is_active: boolean;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("practicas")
        .update(data)
        .eq("practica_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["activity_codes"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.service") }));
    },
    onError: createMutationErrorHandler("updating service"),
  });
}
