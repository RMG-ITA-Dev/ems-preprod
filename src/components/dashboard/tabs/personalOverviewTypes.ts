// dash_personal: contrato de datos de la pestaña "Personal" (payload de personal_overview())
// + el factory "vacío seguro". Sigue el patrón de encargoOverviewTypes.ts/carteraOverviewTypes.ts
// (bugs/dashboard/personal/plan_v2.md §5): archivo sin imports de React ni de Supabase, para
// que cualquier módulo que importe solo tipos/el factory no arrastre esas dependencias.
// Contrato exacto: bugs/dashboard/personal/plan_v2.md §3.2.

export type EngagementFunctionCode = 0 | 1 | 2 | 3 | null;

export interface PersonalOverviewMeta {
  has_staff_record: boolean;
  today: string; // YYYY-MM-DD (America/La_Paz)
  current_week_start: string;
  operational_end: string;
  history_start: string;
  history_end: string;
  generated_at: string;
}

export interface PersonalCurrentWeek {
  planned_hours: number;
  saved_hours: number;
  forecast_hours: number;
  approved_hours: number;
}

export interface PersonalWorkloadWeek {
  week_start: string;
  week_end: string;
  planned_hours: number;
  saved_hours: number;
}

export interface PersonalAssignment {
  assignment_id: string;
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  function_code: EngagementFunctionCode;
  start_date: string;
  end_date: string;
  hours_per_week: number;
  status: string;
}

export interface PersonalCurrentWeekEngagement {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  function_code: EngagementFunctionCode;
  assigned_hours: number;
  saved_hours: number;
}

export type ComplianceWeekStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "DRAFT"
  | "NOT_SUBMITTED"
  | "NOT_LOGGED"
  | "FUTURE";

export type ApprovalLineStatus = "pending" | "approved" | "rejected";

export interface PersonalReviewNote {
  approval_id: string;
  approval_status: ApprovalLineStatus;
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  activity_id: string;
  activity_code: string | null;
  notes: string;
}

export interface PersonalComplianceWeek {
  week_start: string;
  week_end: string;
  status: ComplianceWeekStatus;
  saved_hours: number;
  approved_hours: number;
  period_id: string | null;
  // review.md iteración 3, G-01 (2026-09-22): derivado en el RPC como week_end +
  // TS_EMPLOYEE_RETRO_DAYS -- siempre viene poblado, no depende de timesheet_periods.deadline
  // (columna real pero nunca escrita por el flujo de carga de horas).
  deadline: string | null;
  submitted_at: string | null;
  review_notes: PersonalReviewNote[];
}

export type PersonalCurrency = "BOB" | "USD";

export interface PersonalFundAmountsByCurrency {
  currency: PersonalCurrency;
  requested_amount: number;
  disbursed_amount: number;
  expenses_loaded_amount: number;
  manager_approved_amount: number;
  accounting_reviewed_amount: number;
}

export interface PersonalFundExpense {
  expense_id: string;
  expense_date: string;
  description: string | null;
  status: string;
  currency: PersonalCurrency;
  amount: number;
  has_attachment: boolean;
  has_invoice_observation: boolean;
  invoice_observation_notes: string | null;
  returned_by_assistant: boolean;
  manager_notes: string | null;
  rejection_reason: string | null;
}

export interface PersonalFundRequest {
  fund_request_id: string;
  request_number: string | null;
  purpose: string | null;
  status: string;
  request_currency: PersonalCurrency;
  due_back_date: string | null;
  amounts_by_currency: PersonalFundAmountsByCurrency[];
  expenses: PersonalFundExpense[];
}

export interface PersonalHistoricalByEngagement {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  function_code: EngagementFunctionCode;
  saved_hours: number;
}

export interface PersonalHistorical {
  saved_hours: number;
  by_engagement: PersonalHistoricalByEngagement[];
}

export interface PersonalOverviewPayload {
  meta: PersonalOverviewMeta;
  current_week: PersonalCurrentWeek;
  workload_weeks: PersonalWorkloadWeek[];
  assignments: PersonalAssignment[];
  current_week_engagements: PersonalCurrentWeekEngagement[];
  compliance_weeks: PersonalComplianceWeek[];
  fund_requests: PersonalFundRequest[];
  historical: PersonalHistorical;
}

/** Payload "vacío seguro": usado mientras no hay datos (data: null) para que PersonalTab
 * pueda renderizar sin ramificar por null en cada bloque. */
export function emptyPersonalOverviewPayload(): PersonalOverviewPayload {
  const today = new Date().toISOString().slice(0, 10);
  return {
    meta: {
      has_staff_record: false,
      today,
      current_week_start: today,
      operational_end: today,
      history_start: today,
      history_end: today,
      generated_at: today,
    },
    current_week: { planned_hours: 0, saved_hours: 0, forecast_hours: 0, approved_hours: 0 },
    workload_weeks: [],
    assignments: [],
    current_week_engagements: [],
    compliance_weeks: [],
    fund_requests: [],
    historical: { saved_hours: 0, by_engagement: [] },
  };
}
