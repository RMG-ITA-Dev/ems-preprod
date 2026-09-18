// dash_socio: contrato de datos del tablero "Práctica" (payload de partner_overview() /
// partner_overview_engagements()) + el factory "vacío seguro". Movido fuera de
// src/hooks/usePartnerOverview.ts (review.md iteración 2, MF-09): ese archivo importa
// React Query y el cliente de Supabase, así que cualquier módulo que le importara algo --
// aunque fuera solo un tipo o este factory sin lógica -- arrastraba esas dependencias con
// él. Este archivo no importa React, Supabase, ni nada de red (AGENTS.md "Dashboard PR Perf
// Checklist" regla #3) -- son solo formas de datos. `usePartnerOverview.ts` reexporta todo
// desde acá, así que ningún consumidor externo tuvo que cambiar su import.

export interface PartnerOverviewMeta {
  role_key: string;
  scope_kind: "firm" | "society" | "own";
  society_name: string | null;
  scope_count: number;
  unfiltered_scope_count: number;
  variable_rate_count: number;
  nonconvertible_count: number;
  today: string;
}

export interface PartnerOverviewFilterOption {
  clients: { client_id: string; client_legal_name: string }[];
  managers: { staff_id: string; short_name: string }[];
  industries: { industry_id: string; industry_name: string }[];
  // dash_socio (2026-09-17): opciones del filtro de Sociedad, solo consumido por
  // admin/senior_partner (los demás roles ya están acotados por sociedad o encargo).
  societies: { society_id: string; name: string }[];
}

export interface PartnerOverviewKpis {
  engagements: { total: number; approved: number; emergency: number; finalized_in_period: number };
  fees: {
    total_bob: number;
    previous_total_bob: number;
    sparkline: { month: string; value_bob: number }[];
  };
  my_partner_hours: { budget: number; approved: number; pending: number; rejected: number };
  my_sqr_hours: {
    budget: number;
    approved: number;
    pending: number;
    rejected: number;
    engagement_count: number;
    engagements: { engagement_id: string; engagement_name: string }[];
  };
  alerts: {
    over_budget_count: number;
    portfolio_count: number;
    pending_wo_count: number;
    pending_risk_count: number;
  };
}

export interface PartnerOverviewProfitability {
  hours: { budget: number; approved: number; pending: number; rejected: number; previous_logged: number };
  money_bob: {
    fee_net: number;
    expense_budget: number;
    hours_valued_approved: number;
    hours_valued_pending: number;
    expenses_reviewed: number;
    expenses_manager_approved: number;
    previous_executed: number;
  };
  nonconvertible: { engagement_id: string; currency: string; fee_native: number }[];
}

export interface PartnerOverviewEconomicCycle {
  to_invoice_bob: number;
  invoiced_bob: number;
  collected_bob: number;
  overdue_90_bob: number;
  avg_collection_days: number | null;
}

export interface PartnerOverviewCollectionsBucket {
  count: number;
  amount_bob: number;
}

export interface PartnerOverviewNext7DaysItem {
  installment_id: string;
  wo_id: string;
  engagement_id: string;
  client_legal_name: string;
  kind: "collect" | "invoice";
  date: string;
  amount_bob: number;
}

export interface PartnerOverviewCollections {
  by_status: {
    collected: PartnerOverviewCollectionsBucket;
    invoiced: PartnerOverviewCollectionsBucket;
    in_arrears: PartnerOverviewCollectionsBucket;
    upcoming: PartnerOverviewCollectionsBucket;
  };
  next_7_days: PartnerOverviewNext7DaysItem[];
  overdue: {
    count: number;
    amount_bob: number;
    items: {
      installment_id: string;
      wo_id: string;
      client_legal_name: string;
      agreed_payment_date: string;
      amount_bob: number;
    }[];
  };
}

export interface PartnerOverviewSector {
  industry_id: string;
  industry_name: string;
  engagement_count: number;
  fee_bob: number;
}

export interface PartnerOverviewManager {
  staff_id: string;
  short_name: string;
  engagement_count: number;
  budget_hours: number;
  approved_hours: number;
  pending_hours: number;
  pending_wo_count: number;
  // dash_socio (2026-09-16, bloque E rediseñado a tabla): fecha de inicio más
  // próxima y fecha fin más lejana entre los encargos 4/5 del gerente -- mismo
  // alcance que ya usa este bloque, sin ampliar a encargos finalizados.
  start_date: string;
  end_date: string;
}

export interface PartnerOverviewEngagementHoursRow {
  engagement_id: string;
  engagement_name: string;
  client_legal_name: string;
  manager_short_name: string | null;
  state: number;
  budget_hours: number;
  approved_hours: number;
  pending_hours: number;
  rejected_hours: number;
  over_budget: boolean;
  // dash_socio (2026-09-16, bloque F rediseñado a tabla): fechas del encargo --
  // hacen falta para el pp de cumplimiento (horas consumidas % vs. tiempo
  // transcurrido %). Mismo alcance de siempre (encargos 4/5), sin ampliar scope.
  start_date: string;
  end_date: string;
}

// dash_socio (2026-09-17): orden que el servidor aplica en partner_overview_engagements()
// -- fechas ascendente (más próxima primero), porcentajes descendente (más alto primero).
export type EngagementSortKey = "start_date" | "end_date" | "progress" | "pending_pct";

export interface PartnerOverviewTopClient {
  client_id: string;
  client_legal_name: string;
  fee_bob: number;
  engagement_count: number;
  margin_pct: number | null;
  collected_pct: number | null;
}

export interface PartnerOverviewAlerts {
  pending_wo: number;
  over_budget: number;
  in_arrears: number;
  overdue_90: number;
  closing_soon: number;
  risk_pending: number;
  draft_worksheets: number;
}

export interface PartnerOverviewPayload {
  meta: PartnerOverviewMeta;
  filters: PartnerOverviewFilterOption;
  kpis: PartnerOverviewKpis;
  profitability: PartnerOverviewProfitability;
  economic_cycle: PartnerOverviewEconomicCycle;
  collections: PartnerOverviewCollections;
  sectors: PartnerOverviewSector[];
  managers: PartnerOverviewManager[];
  top_clients: PartnerOverviewTopClient[];
  alerts: PartnerOverviewAlerts;
}

export interface PartnerOverviewEngagementsPage {
  total: number;
  items: PartnerOverviewEngagementHoursRow[];
}

export interface PartnerOverviewEngagementsParams {
  startDateStr: string;
  endDateStr: string;
  fiscalYear: number | null;
  clientId: string | null;
  managerId: string | null;
  industryId: string | null;
  societyId: string | null;
  sortKey: EngagementSortKey;
  overBudgetOnly: boolean;
  limit: number;
  offset?: number;
}

// Payload "vacío seguro": usado mientras no hay datos (data: null) para que
// PartnerTab pueda renderizar sin ramificar por null en cada bloque. Nunca se
// confunde con un error -- la ausencia real de datos (RLS/alcance vacío) también
// llega como counts en 0, no como null.
export function emptyPartnerOverviewPayload(): PartnerOverviewPayload {
  return {
    meta: {
      role_key: "",
      scope_kind: "own",
      society_name: null,
      scope_count: 0,
      unfiltered_scope_count: 0,
      variable_rate_count: 0,
      nonconvertible_count: 0,
      today: new Date().toISOString().slice(0, 10),
    },
    filters: { clients: [], managers: [], industries: [], societies: [] },
    kpis: {
      engagements: { total: 0, approved: 0, emergency: 0, finalized_in_period: 0 },
      fees: { total_bob: 0, previous_total_bob: 0, sparkline: [] },
      my_partner_hours: { budget: 0, approved: 0, pending: 0, rejected: 0 },
      my_sqr_hours: { budget: 0, approved: 0, pending: 0, rejected: 0, engagement_count: 0, engagements: [] },
      alerts: { over_budget_count: 0, portfolio_count: 0, pending_wo_count: 0, pending_risk_count: 0 },
    },
    profitability: {
      hours: { budget: 0, approved: 0, pending: 0, rejected: 0, previous_logged: 0 },
      money_bob: {
        fee_net: 0,
        expense_budget: 0,
        hours_valued_approved: 0,
        hours_valued_pending: 0,
        expenses_reviewed: 0,
        expenses_manager_approved: 0,
        previous_executed: 0,
      },
      nonconvertible: [],
    },
    economic_cycle: {
      to_invoice_bob: 0,
      invoiced_bob: 0,
      collected_bob: 0,
      overdue_90_bob: 0,
      avg_collection_days: null,
    },
    collections: {
      by_status: {
        collected: { count: 0, amount_bob: 0 },
        invoiced: { count: 0, amount_bob: 0 },
        in_arrears: { count: 0, amount_bob: 0 },
        upcoming: { count: 0, amount_bob: 0 },
      },
      next_7_days: [],
      overdue: { count: 0, amount_bob: 0, items: [] },
    },
    sectors: [],
    managers: [],
    top_clients: [],
    alerts: {
      pending_wo: 0,
      over_budget: 0,
      in_arrears: 0,
      overdue_90: 0,
      closing_soon: 0,
      risk_pending: 0,
      draft_worksheets: 0,
    },
  };
}
