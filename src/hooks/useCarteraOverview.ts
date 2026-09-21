import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  emptyCarteraOverviewPayload,
  type CarteraOverviewPayload,
} from "@/components/dashboard/tabs/carteraOverviewTypes";

// dash_cartera (bugs/dashboard/cartera/plan_v2.md §5.3, §7.3): un solo RPC SQL
// `portfolio_overview` (SECURITY DEFINER, un round-trip) alimenta los 5 KPI + 5 filas de
// bloques de la pestaña Cartera. `portfolio_overview` aún no está en
// src/integrations/supabase/types.ts (se regenera tras aplicar la migración a un Supabase
// real) -- mismo escape `as never` que usePartnerOverview.ts:48.

export function useCarteraOverview(
  startDateStr: string,
  endDateStr: string,
  fiscalYear: number,
  fyStart: string,
  fyEnd: string,
  clientId: string | null,
  practicaId: string | null,
) {
  return useQuery({
    queryKey: [
      "dashboard",
      "cartera",
      "overview",
      startDateStr,
      endDateStr,
      fiscalYear,
      fyStart,
      fyEnd,
      clientId ?? "global",
      practicaId ?? "global",
    ],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc(
          "portfolio_overview" as never,
          {
            p_start: startDateStr,
            p_end: endDateStr,
            p_fiscal_year: fiscalYear,
            p_fy_start: fyStart,
            p_fy_end: fyEnd,
            p_client_id: clientId,
            p_practica_id: practicaId,
          } as never,
        )
        .abortSignal(signal);
      if (error) throw error;
      if (!data) return emptyCarteraOverviewPayload();
      return data as unknown as CarteraOverviewPayload;
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
