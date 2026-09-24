import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  emptyPartnerOverviewPayload,
  type PartnerOverviewPayload,
  type PartnerOverviewEngagementsPage,
  type PartnerOverviewEngagementsParams,
} from "@/components/dashboard/tabs/partnerOverviewTypes";

// dash_socio (bugs/dashboard/socio/plan_v2.md §5.3, §7.3): un solo RPC SQL
// `partner_overview` (SECURITY DEFINER, un round-trip) alimenta los 5 KPI + 8
// bloques de la pestaña Socio. `partner_overview` y `partner_overview_engagements`
// aún no están en src/integrations/supabase/types.ts (se regeneran tras aplicar la
// migración a un Supabase real) -- mismo escape `as never` que
// usePortfolioEngagements.ts:25 con list_portfolio_engagements.
//
// El contrato de datos (interfaces + emptyPartnerOverviewPayload()) vive en
// partnerOverviewTypes.ts (review.md iteración 2, MF-09) -- este archivo lo
// reexporta para que ningún consumidor existente tenga que cambiar su import.

export * from "@/components/dashboard/tabs/partnerOverviewTypes";

export function usePartnerOverview(
  startDateStr: string,
  endDateStr: string,
  fiscalYear: number | null,
  clientId: string | null,
  managerId: string | null,
  industryId: string | null,
  societyId: string | null,
) {
  return useQuery({
    queryKey: [
      "dashboard",
      "socio",
      "overview",
      startDateStr,
      endDateStr,
      fiscalYear ?? "range",
      clientId ?? "global",
      managerId ?? "all",
      industryId ?? "all",
      societyId ?? "both",
    ],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc(
          "partner_overview" as never,
          {
            p_start: startDateStr,
            p_end: endDateStr,
            p_fiscal_year: fiscalYear,
            p_client_id: clientId,
            p_manager_id: managerId,
            p_industry_id: industryId,
            p_society_id: societyId,
          } as never,
        )
        .abortSignal(signal);
      if (error) throw error;
      if (!data) return emptyPartnerOverviewPayload();
      return data as unknown as PartnerOverviewPayload;
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

// dash_socio (2026-09-17, reescrito): fuente única del Bloque F -- la misma llamada sirve
// tanto la vista compacta (limit=10) como "Ver todos" (limit mayor). Antes el payload
// principal traía un preview fijo de 20 (siempre en el mismo orden) y el Bloque F reordenaba
// del lado del cliente; con más de 20 encargos eso no daba el verdadero top-N de un criterio
// distinto al que uso el servidor para recortar. Ahora el orden/filtro (p_sort_key,
// p_over_budget_only) viaja al servidor en cada cambio.
export function usePartnerOverviewEngagements(params: PartnerOverviewEngagementsParams) {
  const {
    startDateStr, endDateStr, fiscalYear, clientId, managerId, industryId, societyId,
    sortKey, overBudgetOnly, limit,
  } = params;
  const offset = params.offset ?? 0;
  return useQuery({
    queryKey: [
      "dashboard",
      "socio",
      "engagements",
      startDateStr,
      endDateStr,
      fiscalYear ?? "range",
      clientId ?? "global",
      managerId ?? "all",
      industryId ?? "all",
      societyId ?? "both",
      sortKey,
      overBudgetOnly,
      limit,
      offset,
    ],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .rpc(
          "partner_overview_engagements" as never,
          {
            p_start: startDateStr,
            p_end: endDateStr,
            p_fiscal_year: fiscalYear,
            p_client_id: clientId,
            p_manager_id: managerId,
            p_industry_id: industryId,
            p_society_id: societyId,
            p_sort_key: sortKey,
            p_over_budget_only: overBudgetOnly,
            p_limit: limit,
            p_offset: offset,
          } as never,
        )
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? { total: 0, items: [] }) as unknown as PartnerOverviewEngagementsPage;
    },
    placeholderData: keepPreviousData,
  });
}
