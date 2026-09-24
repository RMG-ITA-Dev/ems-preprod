import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  emptyPersonalOverviewPayload,
  type PersonalOverviewPayload,
} from "@/components/dashboard/tabs/personalOverviewTypes";

// dash_personal (bugs/dashboard/personal/plan_v2.md §5, §7): un solo RPC SQL
// `personal_overview` (SECURITY DEFINER, un round-trip) alimenta el detalle completo de la
// pestaña Personal -- reemplaza las 6 queryFns directas de PersonalTab.tsx + la 7ma de
// PendingHoursAlert.tsx. `personal_overview` aún no está en
// src/integrations/supabase/types.ts (se regenera tras aplicar la migración a un Supabase
// real) -- mismo escape `as never` que useEncargoOverview.ts/useCarteraOverview.ts.
//
// El RPC deriva staff_id de la sesión (get_my_staff_id()) -- este hook NUNCA envía staff_id
// ni p_as_of, solo los dos parámetros de rango histórico (plan_v2.md §4.1/§9.2). Un error se
// relanza (throw), nunca se degrada a un payload vacío -- eso lo distingue de `data: null`,
// que sí es un estado legítimo (aún sin datos) resuelto al factory
// `emptyPersonalOverviewPayload()`.

export function usePersonalOverview(startDateStr: string, endDateStr: string) {
  return useQuery({
    queryKey: ["dashboard", "personal", "overview", startDateStr, endDateStr],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc(
          "personal_overview" as never,
          {
            p_history_start: startDateStr,
            p_history_end: endDateStr,
          } as never,
        )
        .abortSignal(signal);
      if (error) throw error;
      if (!data) return emptyPersonalOverviewPayload();
      return data as unknown as PersonalOverviewPayload;
    },
    staleTime: 60_000,
    enabled: !!startDateStr && !!endDateStr,
  });
}
