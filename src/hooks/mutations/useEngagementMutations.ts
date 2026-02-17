import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

export function useCreateEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      engagement_name: string;
      engagement_code?: string;
      client_id: string;
      partner_id?: string;
      manager_id?: string;
      start_date?: string;
      end_date?: string;
      status?: string;
      work_order_required?: boolean;
      activity_required?: boolean;
      is_internal?: boolean;
    }) => {
      const { data: result, error } = await supabase
        .from("engagements")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.engagement") }));
    },
    onError: createMutationErrorHandler("creating engagement"),
  });
}

export function useUpdateEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        engagement_name: string;
        engagement_code: string;
        client_id: string;
        partner_id: string;
        manager_id: string;
        start_date: string;
        end_date: string;
        status: string;
        work_order_required: boolean;
        activity_required: boolean;
        is_internal: boolean;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("engagements")
        .update(data)
        .eq("engagement_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.engagement") }));
    },
    onError: createMutationErrorHandler("updating engagement"),
  });
}

export function useDeleteEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("engagements").delete().eq("engagement_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.engagement") }));
    },
    onError: createMutationErrorHandler("deleting engagement"),
  });
}
