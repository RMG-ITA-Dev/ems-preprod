import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

export function useStaffingAlerts() {
  const { data: staffRecord } = useCurrentStaff();

  return useQuery({
    queryKey: ["staffing-alerts", staffRecord?.staff_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_staffing_alerts")
        .select("*")
        .eq("staff_id", staffRecord!.staff_id)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!staffRecord?.staff_id,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
