import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Engagement } from "@/hooks/useEmsData";
import { canLogHours, type EngagementState } from "@/lib/engagementStatus";

/**
 * FEAT 0602-135: excluye encargos cuyo override manual (6 Cancelado, 7 Finalizado,
 * 9 Congelado, u otro no-cargable) impide cargar horas. Los de esta lista ya son
 * OT-aprobados o administrativos (estado derivado 4/5, cargable); solo un override
 * manual puede volverlos no-cargables. El trigger de DB lo refuerza en el backend.
 */
function isLoggable(e: Engagement): boolean {
  const override = e.engagement_state_override;
  return override == null || canLogHours(override as EngagementState);
}

export function useApprovedEngagements() {
  return useQuery({
    queryKey: ["approved-engagements-for-tracker"],
    queryFn: async () => {
      // Group A: Engagements with approved WOs
      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select("engagement_id")
        .eq("approval_status", "Approved");
      if (woError) throw woError;

      const approvedIds = [...new Set(
        (workOrders || []).map(wo => wo.engagement_id)
      )];

      let groupA: Engagement[] = [];
      if (approvedIds.length > 0) {
        const { data, error } = await supabase
          .from("engagements")
          .select(`
            *,
            client:clients(*),
            partner:staff!engagements_partner_id_fkey(*),
            manager:staff!engagements_manager_id_fkey(*)
          `)
          .in("engagement_id", approvedIds)
          .eq("status", "active")
          .eq("is_internal", false)
          .order("created_at", { ascending: false });
        if (error) throw error;
        groupA = (data || []) as Engagement[];
      }

      // Group B: work_order_required=false, visibility filter
      const { data: isAdminResult } = await supabase.rpc("is_admin");
      const isAdmin = !!isAdminResult;

      // Get current staff_id for visibility filter
      const { data: myStaffId } = await supabase.rpc("get_my_staff_id");

      let groupBQuery = supabase
        .from("engagements")
        .select(`
          *,
          client:clients(*),
          partner:staff!engagements_partner_id_fkey(*),
          manager:staff!engagements_manager_id_fkey(*)
        `)
        // FEAT 0602-135: administrativos (sin OT) O con override manual Aprobado/Emergencia (4/5),
        // que también permiten cargar horas aunque su OT no esté aprobada. isLoggable filtra el resto.
        .or("work_order_required.eq.false,engagement_state_override.in.(4,5)")
        .eq("status", "active")
        .eq("is_internal", false)
        .order("created_at", { ascending: false });

      if (!isAdmin && myStaffId) {
        // FEAT 0602-135: los override 4/5 (aprobados manualmente) son visibles para todo el staff,
        // igual que una OT aprobada (Group A). Los administrativos siguen restringidos a partner/manager.
        groupBQuery = groupBQuery.or(
          `partner_id.eq.${myStaffId},manager_id.eq.${myStaffId},engagement_state_override.in.(4,5)`
        );
      }

      const { data: groupBData, error: groupBError } = await groupBQuery;
      if (groupBError) throw groupBError;
      const groupB = (groupBData || []) as Engagement[];

      // Merge and deduplicate
      const merged = new Map<string, Engagement>();
      for (const e of groupA) merged.set(e.engagement_id, e);
      for (const e of groupB) merged.set(e.engagement_id, e);

      return Array.from(merged.values()).filter(isLoggable);
    },
  });
}
