import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

// Invalidates both the active-only and the all-codes admin caches.
function invalidateActivityCodes(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["activity_codes"] });
}

export function useCreateActivityCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      activity_code?: string;
      description: string;
      is_active?: boolean;
      service_id?: string | null;
      entity_type?: string;
    }) => {
      if (data.service_id) {
        // Vinculada: delegate code generation to the RPC.
        const { data: result, error } = await supabase.rpc(
          "create_service_activity",
          {
            p_service_id:  data.service_id,
            p_description: data.description,
            p_entity_type: data.entity_type ?? "A",
          }
        );
        if (error) throw error;
        return result;
      }
      // Heredada: direct insert (legacy path).
      const { data: result, error } = await supabase
        .from("activity_codes")
        .insert({
          activity_code: data.activity_code!,
          description:   data.description,
          is_active:     data.is_active ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      invalidateActivityCodes(queryClient);
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.activityCode") }));
    },
    onError: createMutationErrorHandler("creating activity code"),
  });
}

export function useUpdateActivityCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ activity_code: string; description: string; is_active: boolean }>;
    }) => {
      const { data: result, error } = await supabase
        .from("activity_codes")
        .update(data)
        .eq("activity_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      invalidateActivityCodes(queryClient);
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.activityCode") }));
    },
    onError: createMutationErrorHandler("updating activity code"),
  });
}

export function useDeleteActivityCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("activity_codes").delete().eq("activity_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateActivityCodes(queryClient);
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.activityCode") }));
    },
    onError: createMutationErrorHandler("deleting activity code"),
  });
}

export function useDeactivateServiceActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (activityId: string) => {
      const { error } = await supabase.rpc("deactivate_service_activity", {
        p_activity_id: activityId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateActivityCodes(queryClient);
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.activityCode") }));
    },
    onError: createMutationErrorHandler("deactivating service activity"),
  });
}
