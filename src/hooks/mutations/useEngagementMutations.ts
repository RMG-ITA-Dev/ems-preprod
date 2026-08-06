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
      fecha_cierre: string;
      anio_fiscal_override?: boolean;
      sqr_id?: string | null;
      encargado_id?: string | null;
      specialist_it_id?: string | null;
      specialist_tax_id?: string | null;
      // BUG 0625-151 (Codex review): linked atomically inside the RPC instead of a separate
      // client-side update, which was subject to the "Team can update engagements" RLS policy
      // and could silently fail for a creator who isn't the assigned partner/manager/admin.
      contract_file_path?: string | null;
      taxonomy_id?: string | null;
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
        p_fecha_cierre:          data.fecha_cierre,
        p_anio_fiscal_override:  data.anio_fiscal_override ?? false,
        p_sqr_id:              data.sqr_id ?? null,
        p_encargado_id:        data.encargado_id ?? null,
        p_specialist_it_id:    data.specialist_it_id ?? null,
        p_specialist_tax_id:   data.specialist_tax_id ?? null,
        p_contract_file_path:  data.contract_file_path ?? null,
        p_taxonomy_id:         data.taxonomy_id ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as unknown as { data: any; error: any };
      if (error) throw error;
      return result as unknown as { engagement_id: string; engagement_code: string | null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      // BUG #0603-140: the new engagement is a candidate for the Work Matrix picker; invalidate
      // so the "Go to Work Matrix" shortcut doesn't land on a stale (60s-fresh) candidate cache.
      queryClient.invalidateQueries({ queryKey: ["engagements-without-worksheet"] });
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
        anio_fiscal: number;
        fecha_cierre: string;
        anio_fiscal_override: boolean;
        sqr_id: string | null;
        encargado_id: string | null;
        specialist_it_id: string | null;
        specialist_tax_id: string | null;
        // FEAT 0602-135: override manual del estado (1..9) o null para volver al derivado.
        engagement_state_override: number | null;
        taxonomy_id: string | null;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("engagements")
        // engagement_state_override lo agrega la migración 20260714000000 y aún no está en los
        // tipos generados; el cast puentea hasta regenerar types.ts tras el deploy.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(data as any)
        .eq("engagement_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      // FEAT 0602-135: esta mutación puede cambiar engagement_state_override, y los selectores
      // "activos" filtran por estado efectivo (ocultan 6/7/9). Sin invalidar sus cachés, un encargo
      // recién congelado/finalizado seguiría seleccionable hasta que el trigger rechace el guardado.
      // (Prefijo de key: invalida también las variantes con staffId, p. ej. ["approved-engagements", id].)
      queryClient.invalidateQueries({ queryKey: ["approved-engagements"] });
      queryClient.invalidateQueries({ queryKey: ["approved-engagements-for-tracker"] });
      queryClient.invalidateQueries({ queryKey: ["engagements-for-manual-entry"] });
      queryClient.invalidateQueries({ queryKey: ["engagements-without-worksheet"] });
      queryClient.invalidateQueries({ queryKey: ["encargo-engagements"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.engagement") }));
    },
    onError: createMutationErrorHandler("updating engagement"),
  });
}

export function useDeleteEngagement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // `.select()` devuelve las filas realmente borradas. Es imprescindible:
      // cuando RLS bloquea un DELETE, Postgres NO lanza error — la sentencia
      // afecta 0 filas y PostgREST responde 204 sin `error`. Sin esta
      // verificación la UI mostraba "eliminado exitosamente" con el encargo
      // intacto (reportado con el rol ita_manager, que no tiene engagement.delete).
      const { data, error } = await supabase
        .from("engagements")
        .delete()
        .eq("engagement_id", id)
        .select("engagement_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(i18n.t("messages.deleteBlockedNoPermission"));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.engagement") }));
    },
    onError: createMutationErrorHandler("deleting engagement"),
  });
}
