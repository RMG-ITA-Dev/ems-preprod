import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HoursApproverCandidate } from "@/lib/hoursApproverCandidates";

// 1110-220 (plan_v5 §6.1) — candidatos a "Aprobador de horas" de un encargo no-Cliente.
//
// RPC propio y no `get_engagement_team_candidates()`: el selector elige primero el ROL, así que necesita el
// role_key (el otro RPC devuelve un grupo neutro a propósito). Gateado en la base: solo admin, hr_manager y
// hr_analyst con engagement.create/.update; sin email ni auth_user_id. Solo se consulta cuando el formulario
// edita un no-Cliente (`enabled`).
//
// Igual que useEngagementTeamCandidates: ante error, lista VACÍA (nunca la nómina completa), y quien consuma el
// hook trata `isFetching` como "todavía no resuelto" para no habilitar Guardar con opciones viejas.

export const HOURS_APPROVER_CANDIDATES_QUERY_KEY = ["hours-approver-candidates"] as const;

const EMPTY: HoursApproverCandidate[] = [];

export function useHoursApproverCandidates(enabled: boolean) {
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: HOURS_APPROVER_CANDIDATES_QUERY_KEY,
    enabled,
    queryFn: async () => {
      // get_hours_approver_candidates aún no está en types.ts (se regenera con la herramienta tras migrar).
      const { data, error } = await supabase.rpc("get_hours_approver_candidates" as never);
      if (error) throw error;
      return (data ?? []) as unknown as HoursApproverCandidate[];
    },
  });

  return {
    candidates: data ?? EMPTY,
    isLoading: enabled && isLoading,
    isFetching: enabled && isFetching,
    isError: enabled && isError,
  };
}
