// dash_encargo: contrato de datos de la pestaña "Encargo" (payload de engagement_overview())
// + el factory "vacío seguro". Sigue el patrón de carteraOverviewTypes.ts (dash_cartera,
// bugs/dashboard/cartera/plan_v2.md §5.3): archivo sin imports de React ni de Supabase, para
// que cualquier módulo que importe solo tipos/el factory no arrastre esas dependencias.
// Contrato exacto: bugs/dashboard/encargo/plan_v2.md §7.3.

export interface DashboardEngagementItem {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  client_legal_name: string;
  end_date: string | null;
}

export interface EngagementOverviewMeta {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  client_legal_name: string;
  role_key: string;
  today: string; // YYYY-MM-DD (America/La_Paz)
  week_start: string;
  prev_week_start: string;
  period_start: string;
  period_end: string;
  alert_weeks: number;
  selected_accessible: boolean;
}

export interface TeamMember {
  staff_id: string;
  display_name: string;
}

export interface EngagementTeam {
  partner: TeamMember | null;
  manager: TeamMember | null;
  encargado: TeamMember | null;
  specialist_it: TeamMember | null;
  specialist_tax: TeamMember | null;
  sqr: TeamMember | null;
}

export interface EngagementBreakdownRow {
  category_id: string | null;
  category_name: string | null;
  category_display_order: number | null;
  activity_id: string;
  activity_code: string | null;
  activity_description: string | null;
  budget_hours: number;
  actual_hours: number;
  variance_hours: number;
}

export interface StaffingPerson {
  staff_id: string;
  display_name: string;
  category_name: string | null;
  assigned_hours: number;
  zero_week_alert: boolean;
}

export interface StaffingWeekRow {
  staff_id: string;
  logged_hours: number;
  used_hours: number;
}

export interface StaffingWeek {
  offset: number; // -4..4
  week_start: string;
  week_end: string;
  week_number: number;
  rows: StaffingWeekRow[];
}

export interface EngagementStaffing {
  people: StaffingPerson[];
  weeks: StaffingWeek[];
}

export type ExpenseStatus = "revisado_asistente" | "pendiente_aprobacion" | "aprobado_gerente";

export interface ExpenseItem {
  fre_id: string;
  expense_date: string;
  description: string | null;
  amount: number;
  currency: string;
  amount_bob: number;
  status: ExpenseStatus;
}

export type RequestDisplayStatus =
  | "pendiente_gerente"
  | "aprobado_pendiente_desembolso"
  | "desembolsado"
  | "observado"
  | "rechazado";

export interface RequestItem {
  fr_wo_id: string;
  fund_request_id: string;
  request_number: string | null;
  allocated_amount: number;
  currency: string;
  allocated_amount_bob: number;
  display_status: RequestDisplayStatus;
  decided_at: string | null;
  submitted_at: string;
}

export interface EngagementExpenses {
  budget_bob: number;
  executed_bob: number;
  executed_percent: number;
  approved: ExpenseItem[];
  pending: ExpenseItem[];
  requests: RequestItem[];
}

export interface ApprovalQueueItem {
  staff_id: string;
  staff_name: string;
  hours: number;
  weeks_old: number;
  alert: boolean;
}

export interface ApprovalQueue {
  total_hours: number;
  distinct_people: number;
  items: ApprovalQueueItem[];
}

export interface EngagementOverviewKpis {
  staffing: {
    current: { logged: number; assigned: number };
    previous: { logged: number; assigned: number };
  };
  pending_approval: { last_week_hours: number; aged_hours: number };
  last_time_entry: { date: string | null; days: number | null };
  last_approval: { date: string | null; days: number | null };
}

export interface EngagementOverviewDetail {
  kpis: EngagementOverviewKpis;
  budget: { budget_hours: number; actual_hours: number; consumed_percent: number };
  breakdown: EngagementBreakdownRow[];
  team: EngagementTeam;
  staffing: EngagementStaffing;
  expenses: EngagementExpenses;
  approval_queue: ApprovalQueue;
}

export interface EngagementOverviewPayload {
  meta: EngagementOverviewMeta;
  detail: EngagementOverviewDetail | null;
}

/** Payload "vacío seguro": usado mientras no hay datos (data: null) para que EncargoTab
 * pueda renderizar sin ramificar por null en cada bloque. */
export function emptyEngagementOverviewPayload(): EngagementOverviewPayload {
  return {
    meta: {
      engagement_id: "",
      engagement_code: null,
      engagement_name: "",
      client_legal_name: "",
      role_key: "",
      today: new Date().toISOString().slice(0, 10),
      week_start: "",
      prev_week_start: "",
      period_start: "",
      period_end: "",
      alert_weeks: 3,
      selected_accessible: false,
    },
    detail: null,
  };
}
