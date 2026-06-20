import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AlertRef {
  staff_id: string;
  entity_id: string;
  alert_type: string;
}

export function useMarkAlertsSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (alerts: AlertRef[]) => {
      if (!alerts.length) return;
      const { error } = await supabase
        .from("staff_alert_seen")
        .upsert(
          alerts.map((a) => ({ ...a, seen_at: new Date().toISOString() })),
          { onConflict: "staff_id,entity_id,alert_type", ignoreDuplicates: true }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staffing-alerts"] });
    },
  });
}
