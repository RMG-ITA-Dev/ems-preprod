import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Staff } from "@/hooks/useEmsData";

// NOTE: fund_request_events is not yet in the generated Supabase types.
// Cast the client until Lovable regenerates types after the migration runs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type FundRequestEventEntity = "request" | "work_order" | "expense";

/**
 * Un evento de la bitácora de una solicitud de fondos. Lo escriben solo los triggers
 * de la base (fr_log_event / fr_wo_log_event / fre_log_event); `actor_staff_id` NULL
 * significa que lo hizo el sistema (por ejemplo, una aprobación automática).
 */
export interface FundRequestEvent {
  event_id: string;
  seq: number;
  fund_request_id: string;
  entity: FundRequestEventEntity;
  fr_wo_id: string | null;
  wo_id: string | null;
  fre_id: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  actor_staff_id: string | null;
  notes: string | null;
  amount: number | null;
  created_at: string;
  actor?: Pick<Staff, "staff_id" | "first_name" | "last_name" | "short_name"> | null;
}

/** Bitácora completa de una solicitud, en orden cronológico. RLS recorta lo que no se puede ver. */
export function useFundRequestEvents(fundRequestId: string | undefined) {
  return useQuery({
    queryKey: ["fund_request_events", fundRequestId],
    queryFn: async () => {
      if (!fundRequestId) return [];
      const { data, error } = await sb
        .from("fund_request_events")
        .select(
          "*, actor:staff!fund_request_events_actor_staff_id_fkey(staff_id, first_name, last_name, short_name)",
        )
        .eq("fund_request_id", fundRequestId)
        .order("seq", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FundRequestEvent[];
    },
    enabled: !!fundRequestId,
  });
}
