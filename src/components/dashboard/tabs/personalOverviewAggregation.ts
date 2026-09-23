import { safeNumber } from "@/lib/queryHelpers";
import {
  emptyPersonalOverviewPayload,
  type PersonalOverviewPayload,
  type PersonalAssignment,
  type PersonalCurrentWeekEngagement,
  type PersonalFundRequest,
  type EngagementFunctionCode,
  type PersonalCurrency,
} from "./personalOverviewTypes";

// dash_personal (bugs/dashboard/personal/plan_v2.md §5.3): funciones puras sin React /
// Supabase / network imports (AGENTS.md "Dashboard PR Perf Checklist" regla #3). Todos los
// KPI, alertas, vencimientos y agrupaciones de UI se calculan acá; el RPC solo entrega sumas,
// conteos y filas. Sigue el patrón de carteraOverviewAggregation.ts/encargoOverviewAggregation.ts.

/** Coerción defensiva de todo el payload: cualquier número que llegue como string, null o
 * NaN se normaliza con safeNumber(); nunca se propaga NaN/Infinity a la UI. Orden de
 * semanas/asignaciones/solicitudes se conserva tal cual llega del servidor. */
export function toPersonalViewModel(payload: PersonalOverviewPayload | null | undefined): PersonalOverviewPayload {
  if (!payload) return emptyPersonalOverviewPayload();
  const n = safeNumber;
  const empty = emptyPersonalOverviewPayload();

  return {
    meta: {
      has_staff_record: Boolean(payload.meta?.has_staff_record),
      today: payload.meta?.today ?? empty.meta.today,
      current_week_start: payload.meta?.current_week_start ?? empty.meta.current_week_start,
      operational_end: payload.meta?.operational_end ?? empty.meta.operational_end,
      history_start: payload.meta?.history_start ?? empty.meta.history_start,
      history_end: payload.meta?.history_end ?? empty.meta.history_end,
      generated_at: payload.meta?.generated_at ?? empty.meta.generated_at,
    },
    current_week: {
      planned_hours: n(payload.current_week?.planned_hours),
      saved_hours: n(payload.current_week?.saved_hours),
      forecast_hours: n(payload.current_week?.forecast_hours),
      approved_hours: n(payload.current_week?.approved_hours),
    },
    workload_weeks: (payload.workload_weeks ?? []).map((w) => ({
      week_start: w.week_start,
      week_end: w.week_end,
      planned_hours: n(w.planned_hours),
      saved_hours: n(w.saved_hours),
    })),
    assignments: (payload.assignments ?? []).map((a) => ({
      assignment_id: a.assignment_id,
      engagement_id: a.engagement_id,
      engagement_code: a.engagement_code ?? null,
      engagement_name: a.engagement_name,
      function_code: (a.function_code ?? null) as EngagementFunctionCode,
      start_date: a.start_date,
      end_date: a.end_date,
      hours_per_week: n(a.hours_per_week),
      status: a.status,
    })),
    current_week_engagements: (payload.current_week_engagements ?? []).map((e) => ({
      engagement_id: e.engagement_id,
      engagement_code: e.engagement_code ?? null,
      engagement_name: e.engagement_name,
      function_code: (e.function_code ?? null) as EngagementFunctionCode,
      assigned_hours: n(e.assigned_hours),
      saved_hours: n(e.saved_hours),
    })),
    compliance_weeks: (payload.compliance_weeks ?? []).map((w) => ({
      week_start: w.week_start,
      week_end: w.week_end,
      status: w.status,
      saved_hours: n(w.saved_hours),
      approved_hours: n(w.approved_hours),
      period_id: w.period_id ?? null,
      deadline: w.deadline ?? null,
      submitted_at: w.submitted_at ?? null,
      review_notes: (w.review_notes ?? []).map((rn) => ({
        approval_id: rn.approval_id,
        approval_status: rn.approval_status,
        engagement_id: rn.engagement_id,
        engagement_code: rn.engagement_code ?? null,
        engagement_name: rn.engagement_name,
        activity_id: rn.activity_id,
        activity_code: rn.activity_code ?? null,
        notes: rn.notes,
      })),
    })),
    fund_requests: (payload.fund_requests ?? []).map((fr) => ({
      fund_request_id: fr.fund_request_id,
      request_number: fr.request_number ?? null,
      purpose: fr.purpose ?? null,
      status: fr.status,
      request_currency: fr.request_currency,
      due_back_date: fr.due_back_date ?? null,
      amounts_by_currency: (fr.amounts_by_currency ?? []).map((a) => ({
        currency: a.currency,
        requested_amount: n(a.requested_amount),
        disbursed_amount: n(a.disbursed_amount),
        expenses_loaded_amount: n(a.expenses_loaded_amount),
        manager_approved_amount: n(a.manager_approved_amount),
        accounting_reviewed_amount: n(a.accounting_reviewed_amount),
      })),
      expenses: (fr.expenses ?? []).map((e) => ({
        expense_id: e.expense_id,
        expense_date: e.expense_date,
        description: e.description ?? null,
        status: e.status,
        currency: e.currency,
        amount: n(e.amount),
        has_attachment: Boolean(e.has_attachment),
        has_invoice_observation: Boolean(e.has_invoice_observation),
        invoice_observation_notes: e.invoice_observation_notes ?? null,
        returned_by_assistant: Boolean(e.returned_by_assistant),
        manager_notes: e.manager_notes ?? null,
        rejection_reason: e.rejection_reason ?? null,
      })),
    })),
    historical: {
      saved_hours: n(payload.historical?.saved_hours),
      by_engagement: (payload.historical?.by_engagement ?? []).map((e) => ({
        engagement_id: e.engagement_id,
        engagement_code: e.engagement_code ?? null,
        engagement_name: e.engagement_name,
        function_code: (e.function_code ?? null) as EngagementFunctionCode,
        saved_hours: n(e.saved_hours),
      })),
    },
  };
}

/** decisiones.md: "las horas no desaparecen"; nunca negativo. */
export function remainingHours(plannedHours: number, savedHours: number): number {
  return Math.max(safeNumber(plannedHours) - safeNumber(savedHours), 0);
}

/** Orden fijo de exhibición: Cliente(1) primero, luego Administrativa(0)/Capacitación(2)/
 * Calidad(3)/Sin clasificar(null) -- plan_v2.md §3.3/§8.1. */
export const FUNCTION_ORDER: EngagementFunctionCode[] = [1, 0, 2, 3, null];

export interface FunctionGroupRow {
  function_code: EngagementFunctionCode;
  assigned_hours: number;
  saved_hours: number;
}

export interface FunctionGroupedTotals {
  rows: FunctionGroupRow[];
  clientTotal: { assigned_hours: number; saved_hours: number };
  nonClientTotal: { assigned_hours: number; saved_hours: number };
  grandTotal: { assigned_hours: number; saved_hours: number };
}

/** Agrupa current_week_engagements por engagements.funcion (0/1/2/3/NULL) -- plan_v2.md
 * §3.3: el resumen Cliente vs. no-cliente conserva las 4 funciones en el detalle. */
export function groupByFunction(engagements: PersonalCurrentWeekEngagement[]): FunctionGroupedTotals {
  const totals = new Map<EngagementFunctionCode, FunctionGroupRow>();
  for (const code of FUNCTION_ORDER) {
    totals.set(code, { function_code: code, assigned_hours: 0, saved_hours: 0 });
  }
  for (const e of engagements ?? []) {
    const code = (e.function_code ?? null) as EngagementFunctionCode;
    if (!totals.has(code)) totals.set(code, { function_code: code, assigned_hours: 0, saved_hours: 0 });
    const row = totals.get(code)!;
    row.assigned_hours += safeNumber(e.assigned_hours);
    row.saved_hours += safeNumber(e.saved_hours);
  }
  const rows = [...totals.keys()]
    .sort((a, b) => FUNCTION_ORDER.indexOf(a) - FUNCTION_ORDER.indexOf(b))
    .map((code) => totals.get(code)!);
  const clientRow = totals.get(1) ?? { function_code: 1 as EngagementFunctionCode, assigned_hours: 0, saved_hours: 0 };
  const nonClientTotal = rows
    .filter((r) => r.function_code !== 1)
    .reduce(
      (acc, r) => ({ assigned_hours: acc.assigned_hours + r.assigned_hours, saved_hours: acc.saved_hours + r.saved_hours }),
      { assigned_hours: 0, saved_hours: 0 },
    );
  const grandTotal = {
    assigned_hours: clientRow.assigned_hours + nonClientTotal.assigned_hours,
    saved_hours: clientRow.saved_hours + nonClientTotal.saved_hours,
  };
  return {
    rows,
    clientTotal: { assigned_hours: clientRow.assigned_hours, saved_hours: clientRow.saved_hours },
    nonClientTotal,
    grandTotal,
  };
}

/** KPI "Próxima asignación": la asignación propia con el start_date futuro más próximo
 * (empate: engagement_code). Selección determinista -- plan_v2.md §9.3. Solo mira
 * assignments[] (ya acotado a la ventana operativa por el RPC), nunca fechas pasadas. */
export function nextAssignment(assignments: PersonalAssignment[], today: string): PersonalAssignment | null {
  const upcoming = (assignments ?? []).filter((a) => a.start_date > today);
  if (upcoming.length === 0) return null;
  return [...upcoming].sort(
    (a, b) => a.start_date.localeCompare(b.start_date) || (a.engagement_code ?? "").localeCompare(b.engagement_code ?? ""),
  )[0];
}

export type AttentionItemKind =
  | "timesheetRejected"
  | "timesheetNotSubmitted"
  | "expenseObserved"
  | "expenseRejected"
  | "missingReceipt"
  | "fundDueToday"
  | "fundOverdue"
  | "fundDueSoon";

export interface AttentionItem {
  kind: AttentionItemKind;
  weekStart?: string;
  hours?: number;
  code?: string;
  /** UUID de navegación real hacia /fund-requests/:id/expenses -- nunca usar `code`
   * (etiqueta visible, puede ser request_number) para construir el enlace. Iteración 1
   * de review.md, MUST FIX R1.1. */
  fundRequestId?: string;
  count?: number;
  date?: string;
}

const ATTENTION_PRIORITY: Record<AttentionItemKind, number> = {
  timesheetRejected: 1,
  fundOverdue: 2,
  fundDueToday: 3,
  expenseObserved: 4,
  expenseRejected: 4,
  missingReceipt: 4,
  timesheetNotSubmitted: 5,
  fundDueSoon: 6,
};

/** Acciones que requieren atención, en el orden de prioridad de plan_v2.md §4.4: timesheet
 * rechazado > rendición vencida > rendición vence hoy > gasto observado/rechazado/sin
 * respaldo > timesheet sin enviar > rendición futura dentro de la ventana operativa. El
 * orden final es estable (Array.prototype.sort): dentro de la misma prioridad se conserva
 * el orden de aparición. */
export function buildAttentionItems(payload: PersonalOverviewPayload): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { today, operational_end: operationalEnd } = payload.meta;

  for (const week of payload.compliance_weeks ?? []) {
    if (week.status === "REJECTED") {
      items.push({ kind: "timesheetRejected", weekStart: week.week_start, hours: safeNumber(week.saved_hours) });
    }
  }

  for (const fr of payload.fund_requests ?? []) {
    if (!fr.due_back_date) continue;
    const code = fr.request_number ?? fr.fund_request_id;
    if (fr.due_back_date < today) {
      items.push({ kind: "fundOverdue", code, fundRequestId: fr.fund_request_id, date: fr.due_back_date });
    } else if (fr.due_back_date === today) {
      items.push({ kind: "fundDueToday", code, fundRequestId: fr.fund_request_id, date: fr.due_back_date });
    } else if (fr.due_back_date <= operationalEnd) {
      items.push({ kind: "fundDueSoon", code, fundRequestId: fr.fund_request_id, date: fr.due_back_date });
    }
  }

  for (const fr of payload.fund_requests ?? []) {
    const code = fr.request_number ?? fr.fund_request_id;
    const observed = fr.expenses.filter((e) => e.status === "observado").length;
    const rejected = fr.expenses.filter((e) => e.status === "rechazado").length;
    const missingReceipt = fr.expenses.filter((e) => !e.has_attachment).length;
    if (observed > 0) items.push({ kind: "expenseObserved", code, fundRequestId: fr.fund_request_id, count: observed });
    if (rejected > 0) items.push({ kind: "expenseRejected", code, fundRequestId: fr.fund_request_id, count: rejected });
    if (missingReceipt > 0) items.push({ kind: "missingReceipt", code, fundRequestId: fr.fund_request_id, count: missingReceipt });
  }

  // review.md Iteración 1, MUST FIX R1.2: DRAFT (período creado, sin enviar) con horas
  // guardadas también es "horas sin enviar" (decisiones.md principio) -- no solo
  // NOT_SUBMITTED (sin período). Mismo aviso, misma acción hacia /timesheet.
  for (const week of payload.compliance_weeks ?? []) {
    if (week.status === "NOT_SUBMITTED" || (week.status === "DRAFT" && week.saved_hours > 0)) {
      items.push({ kind: "timesheetNotSubmitted", weekStart: week.week_start, hours: safeNumber(week.saved_hours) });
    }
  }

  return items.sort((a, b) => ATTENTION_PRIORITY[a.kind] - ATTENTION_PRIORITY[b.kind]);
}

/** El primer ítem de atención asociado a fondos/gastos, en el mismo orden de prioridad que
 * buildAttentionItems() -- alimenta la tarjeta KPI "Fondos y rendiciones" (plan_v2.md §"Fila
 * de KPIs"). null cuando no hay ninguna acción de fondos pendiente. */
export function primaryFundAttention(items: AttentionItem[]): AttentionItem | null {
  const fundKinds: AttentionItemKind[] = [
    "fundOverdue",
    "fundDueToday",
    "expenseObserved",
    "expenseRejected",
    "missingReceipt",
    "fundDueSoon",
  ];
  return items.find((i) => fundKinds.includes(i.kind)) ?? null;
}

/** Cantidad de gastos propios con algún problema (observado, rechazado o sin respaldo) --
 * cada gasto cuenta una sola vez aunque coincida con más de una condición. */
export function expenseIssuesCount(payload: PersonalOverviewPayload): number {
  let count = 0;
  for (const fr of payload.fund_requests ?? []) {
    for (const e of fr.expenses ?? []) {
      if (e.status === "observado" || e.status === "rechazado" || !e.has_attachment) count += 1;
    }
  }
  return count;
}

export type DeadlineItemKind =
  | "timesheetDue"
  | "fundDueToday"
  | "fundDueSoon"
  | "fundOverdue"
  | "assignmentStarts"
  | "assignmentEnds"
  | "expenseCorrection";

export interface DeadlineItem {
  kind: DeadlineItemKind;
  date: string;
  code: string | null;
}

/** Próximos vencimientos (plan_v2.md §5/§4.4): timesheet (deadline de una semana aún no
 * enviada -- derivado en el RPC como week_end + TS_EMPLOYEE_RETRO_DAYS, review.md iteración
 * 3 G-01), fondos (due_back_date, incluye vencidos), inicio/fin de asignaciones y gastos
 * observados que requieren corrección -- todo dentro de "hoy..operational_end", salvo lo ya
 * vencido (fondos vencidos y correcciones de gastos, que se muestran igual porque siguen
 * pendientes de resolver "ahora"). Orden ascendente por fecha. */
export function buildUpcomingDeadlines(payload: PersonalOverviewPayload): DeadlineItem[] {
  const { today, operational_end: operationalEnd } = payload.meta;
  const items: DeadlineItem[] = [];

  for (const week of payload.compliance_weeks ?? []) {
    if (!week.deadline) continue;
    if (week.status !== "DRAFT" && week.status !== "NOT_SUBMITTED" && week.status !== "NOT_LOGGED") continue;
    if (week.deadline < today || week.deadline > operationalEnd) continue;
    items.push({ kind: "timesheetDue", date: week.deadline, code: null });
  }

  for (const fr of payload.fund_requests ?? []) {
    if (!fr.due_back_date) continue;
    const code = fr.request_number ?? fr.fund_request_id;
    if (fr.due_back_date < today) {
      items.push({ kind: "fundOverdue", date: fr.due_back_date, code });
    } else if (fr.due_back_date === today) {
      items.push({ kind: "fundDueToday", date: fr.due_back_date, code });
    } else if (fr.due_back_date <= operationalEnd) {
      items.push({ kind: "fundDueSoon", date: fr.due_back_date, code });
    }
  }

  for (const a of payload.assignments ?? []) {
    const code = a.engagement_code ?? a.engagement_id;
    if (a.start_date >= today && a.start_date <= operationalEnd) {
      items.push({ kind: "assignmentStarts", date: a.start_date, code });
    }
    if (a.end_date >= today && a.end_date <= operationalEnd) {
      items.push({ kind: "assignmentEnds", date: a.end_date, code });
    }
  }

  for (const fr of payload.fund_requests ?? []) {
    const code = fr.request_number ?? fr.fund_request_id;
    if (fr.expenses.some((e) => e.status === "observado")) {
      items.push({ kind: "expenseCorrection", date: today, code });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

export interface CurrencyProgressBlock {
  currency: PersonalCurrency;
  disbursed_amount: number;
  expenses_loaded_amount: number;
  /** aprobado_gerente aún no revisado por contabilidad -- manager_approved_amount (superset,
   * incluye revisado_asistente) menos accounting_reviewed_amount, nunca negativo. */
  pending_accounting_amount: number;
  accounting_reviewed_amount: number;
}

/** Barra de progreso de fondos (plan_v2.md §4.3/decisiones.md §4): BOB siempre presente
 * (con ceros si no hay datos); USD solo se agrega si algún importe USD es distinto de cero.
 * Nunca se suman ni convierten monedas -- cada bloque queda tal cual llega del RPC. */
export function buildCurrencyProgress(fr: PersonalFundRequest): CurrencyProgressBlock[] {
  const byCurrency = new Map(fr.amounts_by_currency.map((a) => [a.currency, a]));
  const toBlock = (currency: PersonalCurrency): CurrencyProgressBlock => {
    const a = byCurrency.get(currency);
    const managerApproved = safeNumber(a?.manager_approved_amount);
    const accountingReviewed = safeNumber(a?.accounting_reviewed_amount);
    return {
      currency,
      disbursed_amount: safeNumber(a?.disbursed_amount),
      expenses_loaded_amount: safeNumber(a?.expenses_loaded_amount),
      pending_accounting_amount: Math.max(managerApproved - accountingReviewed, 0),
      accounting_reviewed_amount: accountingReviewed,
    };
  };

  const blocks: CurrencyProgressBlock[] = [toBlock("BOB")];
  // review.md Iteración 1, SHOULD FIX R1.3: el RPC ya solo agrega el bucket USD cuando
  // existe una solicitud o un gasto en esa moneda (migración, CTE fr_currencies) -- su
  // sola presencia es la señal de "existe USD"; no volver a filtrar por importes != 0,
  // porque oculta una solicitud/gasto USD real con acumulados todavía en cero.
  if (byCurrency.has("USD")) {
    blocks.push(toBlock("USD"));
  }
  return blocks;
}

/** Fechas siempre DD/MM/YYYY, en ambos idiomas -- plan_v2.md §8.2. Acepta "YYYY-MM-DD" o un
 * timestamp ISO; nunca lanza sobre un valor mal formado (devuelve "—"). */
export function formatDDMMYYYY(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [datePart] = dateStr.split("T");
  const parts = (datePart ?? "").split("-");
  if (parts.length !== 3) return "—";
  const [y, m, d] = parts;
  if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return "—";
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}
