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
      client_id: string;
      oficina: number;
      practica: number;
      funcion: number;
      anio_fiscal: number;
      partner_id?: string;
      manager_id?: string;
      start_date?: string;
      end_date?: string;
      status?: string;
      work_order_required?: boolean;
      activity_required?: boolean;
      approval_required?: boolean;
      is_internal?: boolean;
    }) => {
      const { data: result, error } = await supabase.rpc("create_engagement_with_code", {
        p_engagement_name:     data.engagement_name,
        p_client_id:           data.client_id,
        p_partner_id:          data.partner_id ?? null,
        p_manager_id:          data.manager_id ?? null,
        p_start_date:          data.start_date ?? null,
        p_end_date:            data.end_date ?? null,
        p_status:              data.status ?? "active",
        p_oficina:             data.oficina,
        p_practica:            data.practica,
        p_funcion:             data.funcion,
        p_anio_fiscal:         data.anio_fiscal,
        p_work_order_required: data.work_order_required ?? true,
        p_activity_required:   data.activity_required ?? true,
        p_is_internal:         data.is_internal ?? false,
        p_approval_required:   data.approval_required ?? true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as unknown as { data: any; error: any };
      if (error) throw error;
      return result as unknown as { engagement_id: string; engagement_code: string | null };
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
        approval_required: boolean;
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
