import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardEngagementItem } from "@/components/dashboard/tabs/encargoOverviewTypes";

// dash_encargo (bugs/dashboard/encargo/plan_v2.md §5.3, §7.2): alimenta el selector de la
// pestaña Encargo con el alcance completo de decisiones.md §2 (encargado_id/specialist_it_id/
// specialist_tax_id incluidos, no solo partner_id/manager_id como el filtro legacy de
// EngagementSelector.tsx). `list_dashboard_engagements` aún no está en
// src/integrations/supabase/types.ts -- mismo escape `as never` que useEncargoOverview.ts.

export function useDashboardEngagements() {
  return useQuery({
    queryKey: ["dashboard", "encargo", "engagements"],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc("list_dashboard_engagements" as never)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as DashboardEngagementItem[];
    },
    staleTime: 5 * 60_000,
  });
}
