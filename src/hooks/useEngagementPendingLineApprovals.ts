import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * 1110-220 (review de Codex): ¿el encargo tiene líneas de horas pendientes de aprobación? El formulario lo usa para no
 * dejar apagar "Requiere aprobación de horas" en ese caso (la base lo rechaza: enforce_engagement_partner_approval).
 * La RPC es DEFINER porque quien edita puede no ver esas líneas por RLS; devuelve solo un booleano. Aún no está en
 * types.ts (se regenera tras migrar): mismo escape `as never` que el resto de RPC nuevas.
 */
export function useEngagementPendingLineApprovals(engagementId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["engagement-pending-line-approvals", engagementId],
    enabled: enabled && !!engagementId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("engagement_has_pending_line_approvals" as never, {
        p_engagement_id: engagementId,
      } as never);
      if (error) throw error;
      return data === true;
    },
  });
}
