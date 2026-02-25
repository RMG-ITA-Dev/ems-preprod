import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Engagement } from "@/hooks/useEmsData";

/**
 * Engagement list for the manual timer entry dialog.
 * Includes internal/ADMIN engagements (unlike useApprovedEngagements which is tracker-only).
 * Uses a dedicated query key to avoid cache coupling with the stopwatch hook.
 */
export function useManualEntryEngagements() {
  return useQuery({
    queryKey: ["engagements-for-manual-entry"],
    queryFn: async () => {
      // Group A: Engagements with approved WOs (including internal)
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
          // NO is_internal filter -- manual entry includes internal engagements
          .order("created_at", { ascending: false });
        if (error) throw error;
        groupA = (data || []) as Engagement[];
      }

      // Group B: work_order_required=false (including internal)
      const { data: isAdminResult } = await supabase.rpc("is_admin");
      const isAdmin = !!isAdminResult;
      const { data: myStaffId } = await supabase.rpc("get_my_staff_id");

      let groupBQuery = supabase
        .from("engagements")
        .select(`
          *,
          client:clients(*),
          partner:staff!engagements_partner_id_fkey(*),
          manager:staff!engagements_manager_id_fkey(*)
        `)
        .eq("work_order_required", false)
        .eq("status", "active")
        // NO is_internal filter -- manual entry includes internal engagements
        .order("created_at", { ascending: false });

      if (!isAdmin && myStaffId) {
        groupBQuery = groupBQuery.or(
          `is_internal.eq.true,partner_id.eq.${myStaffId},manager_id.eq.${myStaffId}`
        );
      }

      const { data: groupBData, error: groupBError } = await groupBQuery;
      if (groupBError) throw groupBError;
      const groupB = (groupBData || []) as Engagement[];

      // Merge and deduplicate
      const merged = new Map<string, Engagement>();
      for (const e of groupA) merged.set(e.engagement_id, e);
      for (const e of groupB) merged.set(e.engagement_id, e);

      return Array.from(merged.values());
    },
  });
}
