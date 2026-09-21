// dash_cartera: contrato de datos de la pestaña "Cartera" (payload de portfolio_overview())
// + el factory "vacío seguro". Sigue el patrón de partnerOverviewTypes.ts (dash_socio,
// bugs/dashboard/socio/plan_v2.md §5.3): archivo sin imports de React ni de Supabase, para
// que cualquier módulo que importe solo tipos/el factory no arrastre esas dependencias.
// Contrato exacto: bugs/dashboard/cartera/plan_v2.md §7.3.

export interface CarteraOverviewMeta {
  role_key: string;
  scope_kind: "firm" | "own";
  practica_name: string | null;
  scope_count: number;
  unfiltered_scope_count: number;
  fiscal_year: number;
  retro_days: number;
  today: string; // YYYY-MM-DD (America/La_Paz)
}

export interface CarteraOverviewFilters {
  clients: { client_id: string; client_legal_name: string }[];
  /** Selector de Práctica (2026-09-19): lista fija de prácticas activas de la firma, no
   * recortada por alcance -- útil sobre todo para admin/senior_partner (scope_kind='firm'),
   * donde mezclar varias prácticas produce nombres de categoría/actividad duplicados. */
  practicas: { practica_id: string; name: string }[];
}

export interface CarteraOverviewKpis {
  engagements: { total: number; approved: number; emergency: number };
  clients_services: { clients: number; services: number; previous_clients: number; previous_services: number };
  /** KPI 3, personal. `role_label` es el nombre de la categoría de la ficha del llamante
   * (Socio, Gerente, SQR, ...) y da el título de la tarjeta: antes estaba clavado en
   * "Horas como Gerente" y para un socio mostraba 0/0 siempre. Ambos campos son null si el
   * llamante no tiene staff o categoría asociada. */
  my_role_hours: {
    role_key: string | null;
    role_label: string | null;
    budget: number;
    approved: number;
    pending: number;
  };
  portfolio_progress: { budget: number; approved: number; pending: number };
  review: { over_budget_count: number; pending_wo_count: number; pending_risk_count: number };
}

export interface CarteraActivityItem {
  activity_id: string;
  activity_code: string;
  description: string;
  budget_hours: number;
  approved_hours: number;
  pending_hours: number;
}

export interface CarteraOverviewActivities {
  total_budget_hours: number;
  items: CarteraActivityItem[];
}

export interface CarteraCategoryItem {
  category_id: string | null;
  category_name: string | null;
  display_order: number | null;
  /** Abreviatura de la práctica dueña de la categoría (AUD, COM, ...). El catálogo repite
   * los mismos nombres en cada práctica (cero_11), así que en la vista "Todas" conviven
   * varios "Socio" legítimos; la UI usa esto para desambiguarlos. Opcional: un payload
   * servido por una versión anterior del RPC no la trae y la UI debe seguir andando. */
  practica_abbr?: string | null;
  budget_hours: number;
  approved_hours: number;
  pending_hours: number;
}

export interface CarteraOverviewCategories {
  total_budget_hours: number;
  items: CarteraCategoryItem[];
}

export interface CarteraStaffingRow {
  category_id: string | null;
  category_name: string | null;
  /** Ver CarteraCategoryItem.practica_abbr. */
  practica_abbr?: string | null;
  budgeted: number | null;
  executed: number;
}

export interface CarteraCollectionsBucket {
  count: number;
  amount_bob: number;
}

export interface CarteraNext7DaysItem {
  installment_id: string;
  wo_id: string;
  engagement_id: string;
  client_legal_name: string;
  kind: "collect" | "invoice";
  date: string;
  amount_bob: number;
}

export interface CarteraOverviewCollections {
  by_status: {
    collected: CarteraCollectionsBucket;
    invoiced: CarteraCollectionsBucket;
    in_arrears: CarteraCollectionsBucket;
    upcoming: CarteraCollectionsBucket;
  };
  next_7_days: CarteraNext7DaysItem[];
  avg_collection_days: number | null;
}

export interface CarteraExpenseTopItem {
  engagement_id: string;
  engagement_code: string | null;
  client_legal_name: string;
  budget_bob: number;
  executed_bob: number;
  pct: number;
}

export interface CarteraOverviewExpenses {
  budget_bob: number;
  executed_bob: number;
  pending_count: number;
  approved_count: number;
  top3: CarteraExpenseTopItem[];
}

export interface CarteraApprovalQueueItem {
  approval_id: string;
  staff_name: string;
  engagement_id: string;
  engagement_code: string | null;
  week_start_date: string;
  hours: number;
  weeks_old: number;
  alert: boolean;
}

export interface CarteraOverviewApprovalQueue {
  total_hours: number;
  distinct_people: number;
  total_count: number;
  items: CarteraApprovalQueueItem[];
}

export type CarteraMilestoneKind =
  | "closing"
  | "new_engagement"
  | "wo_approved"
  | "risk_approved"
  | "assignment"
  | "lock_deadline";

export interface CarteraMilestoneItem {
  kind: CarteraMilestoneKind;
  date: string;
  engagement_id: string | null;
  engagement_code: string | null;
  engagement_name: string | null;
  weeks: number | null;
}

export interface CarteraEngagementRow {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  client_legal_name: string;
  budget_hours: number;
  approved_hours: number;
  pending_hours: number;
  over_budget: boolean;
}

/** Fila resumen "Encargos finalizados" (pedido del operador 2026-09-19): encargos con
 * estado efectivo 7 cuyo end_date cae dentro del periodo visible. budget_hours/
 * executed_hours son de vida completa del encargo (desempeño final). */
export interface CarteraFinalizedSummary {
  count: number;
  budget_hours: number;
  executed_hours: number;
  executed_expenses_bob: number;
}

export interface CarteraOverviewPayload {
  meta: CarteraOverviewMeta;
  filters: CarteraOverviewFilters;
  kpis: CarteraOverviewKpis;
  activities: CarteraOverviewActivities;
  categories: CarteraOverviewCategories;
  staffing: CarteraStaffingRow[];
  collections: CarteraOverviewCollections;
  expenses: CarteraOverviewExpenses;
  approval_queue: CarteraOverviewApprovalQueue;
  milestones: CarteraMilestoneItem[];
  engagement_rows: CarteraEngagementRow[];
  finalized_summary: CarteraFinalizedSummary;
}

/** Payload "vacío seguro": usado mientras no hay datos (data: null) para que CarteraTab
 * pueda renderizar sin ramificar por null en cada bloque. La ausencia real de datos
 * (RLS/alcance vacío) también llega como counts en 0, no como null -- nunca se confunde
 * con un error. */
export function emptyCarteraOverviewPayload(): CarteraOverviewPayload {
  return {
    meta: {
      role_key: "",
      scope_kind: "own",
      practica_name: null,
      scope_count: 0,
      unfiltered_scope_count: 0,
      fiscal_year: new Date().getFullYear(),
      retro_days: 30,
      today: new Date().toISOString().slice(0, 10),
    },
    filters: { clients: [], practicas: [] },
    kpis: {
      engagements: { total: 0, approved: 0, emergency: 0 },
      clients_services: { clients: 0, services: 0, previous_clients: 0, previous_services: 0 },
      my_role_hours: { role_key: null, role_label: null, budget: 0, approved: 0, pending: 0 },
      portfolio_progress: { budget: 0, approved: 0, pending: 0 },
      review: { over_budget_count: 0, pending_wo_count: 0, pending_risk_count: 0 },
    },
    activities: { total_budget_hours: 0, items: [] },
    categories: { total_budget_hours: 0, items: [] },
    staffing: [],
    collections: {
      by_status: {
        collected: { count: 0, amount_bob: 0 },
        invoiced: { count: 0, amount_bob: 0 },
        in_arrears: { count: 0, amount_bob: 0 },
        upcoming: { count: 0, amount_bob: 0 },
      },
      next_7_days: [],
      avg_collection_days: null,
    },
    expenses: { budget_bob: 0, executed_bob: 0, pending_count: 0, approved_count: 0, top3: [] },
    approval_queue: { total_hours: 0, distinct_people: 0, total_count: 0, items: [] },
    milestones: [],
    engagement_rows: [],
    finalized_summary: { count: 0, budget_hours: 0, executed_hours: 0, executed_expenses_bob: 0 },
  };
}
