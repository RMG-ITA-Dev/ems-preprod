import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  emptyEngagementOverviewPayload,
  type EngagementOverviewPayload,
} from "@/components/dashboard/tabs/encargoOverviewTypes";

// dash_encargo (bugs/dashboard/encargo/plan_v2.md §5.3, §7.3): un solo RPC SQL
// `engagement_overview` (SECURITY DEFINER, un round-trip) alimenta el detalle completo de
// la pestaña Encargo. `engagement_overview` aún no está en
// src/integrations/supabase/types.ts (se regenera tras aplicar la migración a un Supabase
// real) -- mismo escape `as never` que useCarteraOverview.ts:39-48.
//
// SIN `keepPreviousData` (a diferencia de useCarteraOverview): mostrar el staffing/gastos
// del encargo A bajo el nombre del encargo B, mientras se cambia de selección, sería
// desinformación (plan_v2.md §3.4). El error del RPC se propaga (throw), nunca se degrada a
// un payload vacío -- eso lo distingue de `data: null`, que sí es un estado legítimo
// (encargo sin datos aún) resuelto al factory `emptyEngagementOverviewPayload()`.

export function useEncargoOverview(
  engagementId: string | null,
  startDateStr: string,
  endDateStr: string,
) {
  return useQuery({
    queryKey: ["dashboard", "encargo", "overview", engagementId ?? "none", startDateStr, endDateStr],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc(
          "engagement_overview" as never,
          {
            p_engagement_id: engagementId,
            p_start: startDateStr,
            p_end: endDateStr,
          } as never,
        )
        .abortSignal(signal);
      if (error) throw error;
      if (!data) return emptyEngagementOverviewPayload();
      return data as unknown as EngagementOverviewPayload;
    },
    staleTime: 60_000,
    enabled: !!engagementId,
  });
}
