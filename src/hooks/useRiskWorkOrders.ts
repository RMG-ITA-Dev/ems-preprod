import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RiskWorkOrderDetail, RiskWorkOrderRow } from "@/lib/workOrderRisk";

// 1028-213 (D-18): `/risks` lee SOLO por funciones SECURITY DEFINER que devuelven campos de
// Riesgos (sin montos ni horas) y llevan su propia guarda `work_order.risk.read`. Las firmas no
// están en src/integrations/supabase/types.ts (auto-generado, no se edita a mano): mismo escape
// `as never` que useWorkOrderPaymentPlanMutations.

/** Lista de OT enviadas a Riesgos, ya ordenada por código de encargo (D-39). */
export function useRiskWorkOrders() {
  return useQuery({
    queryKey: ["risk_work_orders"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_risk_work_orders" as never);
      if (error) throw error;
      return (data ?? []) as unknown as RiskWorkOrderRow[];
    },
  });
}

/** Detalle de una OT para `/risks/:woId`. El servidor responde NOT_FOUND si no aplica. */
export function useRiskWorkOrder(woId: string | undefined) {
  return useQuery({
    queryKey: ["risk_work_order", woId],
    enabled: !!woId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_risk_work_order" as never, {
        p_wo_id: woId,
      } as never);
      if (error) throw error;
      // RETURNS TABLE llega como arreglo de una fila.
      const result = data as unknown as RiskWorkOrderDetail[] | RiskWorkOrderDetail | null;
      return Array.isArray(result) ? (result[0] ?? null) : result;
    },
  });
}
