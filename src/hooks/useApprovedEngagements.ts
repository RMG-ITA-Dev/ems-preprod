import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Engagement } from "@/hooks/useEmsData";

export function useApprovedEngagements() {
  return useQuery({
    queryKey: ["approved-engagements-for-tracker"],
    queryFn: async () => {
      // Step 1: Get engagement IDs with approved WOs
      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select("engagement_id")
        .eq("approval_status", "Approved");
      if (woError) throw woError;

      const approvedIds = [...new Set(
        (workOrders || []).map(wo => wo.engagement_id)
      )];
      if (approvedIds.length === 0) return [];

      // Step 2: Fetch engagements -- same select shape as useEngagements()
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
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Engagement[];
    },
  });
}
