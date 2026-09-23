import { describe, it, expect } from "vitest";
import {
  toPersonalViewModel,
  remainingHours,
  groupByFunction,
  nextAssignment,
  buildAttentionItems,
  primaryFundAttention,
  expenseIssuesCount,
  buildUpcomingDeadlines,
  buildCurrencyProgress,
  formatDDMMYYYY,
} from "../personalOverviewAggregation";
import { emptyPersonalOverviewPayload, type PersonalOverviewPayload } from "../personalOverviewTypes";

// dash_personal (bugs/dashboard/personal/plan_v2.md §9.3): pruebas puras de todas las reglas
// de agregación -- sin React/Supabase, mismo patrón que carteraOverviewAggregation.test.ts.

function basePayload(overrides: Partial<PersonalOverviewPayload> = {}): PersonalOverviewPayload {
  return {
    ...emptyPersonalOverviewPayload(),
    meta: {
      ...emptyPersonalOverviewPayload().meta,
      has_staff_record: true,
      today: "2026-09-21",
      current_week_start: "2026-09-21",
      operational_end: "2026-10-18",
    },
    ...overrides,
  };
}

describe("toPersonalViewModel", () => {
  it("null/undefined -> factory vacío", () => {
    expect(toPersonalViewModel(null)).toEqual(emptyPersonalOverviewPayload());
    expect(toPersonalViewModel(undefined)).toEqual(emptyPersonalOverviewPayload());
  });

  it("coerciona strings/NaN/Infinity con safeNumber, nunca propaga NaN/Infinity", () => {
    const payload = basePayload({
      current_week: {
        planned_hours: "32" as unknown as number,
        saved_hours: Number.NaN,
        forecast_hours: Number.POSITIVE_INFINITY,
        approved_hours: null as unknown as number,
      },
    });
    const vm = toPersonalViewModel(payload);
    expect(vm.current_week).toEqual({ planned_hours: 32, saved_hours: 0, forecast_hours: 0, approved_hours: 0 });
    expect(Number.isFinite(vm.current_week.planned_hours)).toBe(true);
  });
});

describe("remainingHours", () => {
  it("planificadas - guardadas cuando es positivo", () => {
    expect(remainingHours(32, 26)).toBe(6);
  });
  it("nunca negativo", () => {
    expect(remainingHours(20, 32)).toBe(0);
  });
  it("coerciona entradas no numéricas", () => {
    expect(remainingHours(Number.NaN, undefined as unknown as number)).toBe(0);
  });
});

describe("groupByFunction", () => {
  it("agrupa por 0/1/2/3/NULL y conserva las 4 funciones", () => {
    const grouped = groupByFunction([
      { engagement_id: "e1", engagement_code: "C1", engagement_name: "Cliente 1", function_code: 1, assigned_hours: 20, saved_hours: 18 },
      { engagement_id: "e2", engagement_code: "A1", engagement_name: "Admin", function_code: 0, assigned_hours: 4, saved_hours: 0 },
      { engagement_id: "e3", engagement_code: "T1", engagement_name: "Training", function_code: 2, assigned_hours: 2, saved_hours: 2 },
      { engagement_id: "e4", engagement_code: "Q1", engagement_name: "Quality", function_code: 3, assigned_hours: 1, saved_hours: 1 },
      { engagement_id: "e5", engagement_code: null, engagement_name: "Sin clasificar", function_code: null, assigned_hours: 0, saved_hours: 3 },
    ]);
    expect(grouped.rows.map((r) => r.function_code)).toEqual([1, 0, 2, 3, null]);
  });

  it("totales Cliente vs. no cliente", () => {
    const grouped = groupByFunction([
      { engagement_id: "e1", engagement_code: "C1", engagement_name: "Cliente 1", function_code: 1, assigned_hours: 20, saved_hours: 18 },
      { engagement_id: "e2", engagement_code: "A1", engagement_name: "Admin", function_code: 0, assigned_hours: 4, saved_hours: 4 },
    ]);
    expect(grouped.clientTotal).toEqual({ assigned_hours: 20, saved_hours: 18 });
    expect(grouped.nonClientTotal).toEqual({ assigned_hours: 4, saved_hours: 4 });
    expect(grouped.grandTotal).toEqual({ assigned_hours: 24, saved_hours: 22 });
  });

  it("lista vacía -> todas las funciones en cero", () => {
    const grouped = groupByFunction([]);
    expect(grouped.rows.every((r) => r.assigned_hours === 0 && r.saved_hours === 0)).toBe(true);
  });
});

describe("nextAssignment", () => {
  const today = "2026-09-21";

  it("selecciona la asignación futura con start_date más próximo", () => {
    const result = nextAssignment(
      [
        { assignment_id: "a1", engagement_id: "e1", engagement_code: "AUD-2", engagement_name: "n", function_code: 1, start_date: "2026-10-01", end_date: "2026-10-31", hours_per_week: 16, status: "CONFIRMED" },
        { assignment_id: "a2", engagement_id: "e2", engagement_code: "AUD-1", engagement_name: "n", function_code: 1, start_date: "2026-09-22", end_date: "2026-10-31", hours_per_week: 20, status: "CONFIRMED" },
      ],
      today,
    );
    expect(result?.assignment_id).toBe("a2");
  });

  it("desempate determinista por engagement_code", () => {
    const result = nextAssignment(
      [
        { assignment_id: "a1", engagement_id: "e1", engagement_code: "B", engagement_name: "n", function_code: 1, start_date: "2026-09-22", end_date: "2026-10-31", hours_per_week: 16, status: "CONFIRMED" },
        { assignment_id: "a2", engagement_id: "e2", engagement_code: "A", engagement_name: "n", function_code: 1, start_date: "2026-09-22", end_date: "2026-10-31", hours_per_week: 20, status: "CONFIRMED" },
      ],
      today,
    );
    expect(result?.assignment_id).toBe("a2");
  });

  it("sin asignaciones futuras -> null", () => {
    const result = nextAssignment(
      [{ assignment_id: "a1", engagement_id: "e1", engagement_code: "A", engagement_name: "n", function_code: 1, start_date: "2026-09-01", end_date: "2026-09-30", hours_per_week: 16, status: "CONFIRMED" }],
      today,
    );
    expect(result).toBeNull();
  });
});

describe("buildCurrencyProgress", () => {
  it("BOB siempre presente aunque no haya datos", () => {
    const blocks = buildCurrencyProgress({
      fund_request_id: "fr1", request_number: "SF-024", purpose: null, status: "aprobado_gerente",
      request_currency: "BOB", due_back_date: null, amounts_by_currency: [], expenses: [],
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].currency).toBe("BOB");
  });

  it("USD ausente cuando el RPC no entrega su bucket (sin solicitud/gasto USD)", () => {
    const blocks = buildCurrencyProgress({
      fund_request_id: "fr1", request_number: "SF-024", purpose: null, status: "aprobado_gerente",
      request_currency: "BOB", due_back_date: null,
      amounts_by_currency: [
        { currency: "BOB", requested_amount: 500, disbursed_amount: 500, expenses_loaded_amount: 300, manager_approved_amount: 300, accounting_reviewed_amount: 300 },
      ],
      expenses: [],
    });
    expect(blocks.map((b) => b.currency)).toEqual(["BOB"]);
  });

  // review.md Iteración 1, SHOULD FIX R1.3: el RPC ya solo agrega el bucket USD cuando
  // existe una solicitud o gasto en esa moneda -- su sola presencia (aunque todos los
  // importes vengan en cero, p.ej. una solicitud USD recién creada) es la señal real.
  it("USD visible si el RPC entrega su bucket, aunque todos los importes sean cero", () => {
    const blocks = buildCurrencyProgress({
      fund_request_id: "fr1", request_number: "SF-024", purpose: null, status: "borrador",
      request_currency: "USD", due_back_date: null,
      amounts_by_currency: [
        { currency: "USD", requested_amount: 0, disbursed_amount: 0, expenses_loaded_amount: 0, manager_approved_amount: 0, accounting_reviewed_amount: 0 },
      ],
      expenses: [],
    });
    expect(blocks.map((b) => b.currency)).toEqual(["BOB", "USD"]);
  });

  it("USD separado cuando existe algún importe distinto de cero -- nunca se mezcla con BOB", () => {
    const blocks = buildCurrencyProgress({
      fund_request_id: "fr1", request_number: "SF-024", purpose: null, status: "aprobado_gerente",
      request_currency: "BOB", due_back_date: null,
      amounts_by_currency: [
        { currency: "BOB", requested_amount: 500, disbursed_amount: 500, expenses_loaded_amount: 300, manager_approved_amount: 300, accounting_reviewed_amount: 100 },
        { currency: "USD", requested_amount: 0, disbursed_amount: 0, expenses_loaded_amount: 40, manager_approved_amount: 40, accounting_reviewed_amount: 0 },
      ],
      expenses: [],
    });
    expect(blocks.map((b) => b.currency)).toEqual(["BOB", "USD"]);
    const bob = blocks.find((b) => b.currency === "BOB")!;
    const usd = blocks.find((b) => b.currency === "USD")!;
    expect(bob.expenses_loaded_amount).toBe(300);
    expect(usd.expenses_loaded_amount).toBe(40);
  });

  it("pending_accounting_amount = manager_approved - accounting_reviewed, nunca negativo", () => {
    const blocks = buildCurrencyProgress({
      fund_request_id: "fr1", request_number: "SF-024", purpose: null, status: "aprobado_gerente",
      request_currency: "BOB", due_back_date: null,
      amounts_by_currency: [
        { currency: "BOB", requested_amount: 500, disbursed_amount: 500, expenses_loaded_amount: 300, manager_approved_amount: 200, accounting_reviewed_amount: 300 },
      ],
      expenses: [],
    });
    expect(blocks[0].pending_accounting_amount).toBe(0);
  });
});

describe("buildAttentionItems", () => {
  it("ordena por prioridad: rechazado > vencida > vence hoy > gasto > sin enviar > próxima", () => {
    const payload = basePayload({
      compliance_weeks: [
        { week_start: "2026-09-14", week_end: "2026-09-20", status: "REJECTED", saved_hours: 30, approved_hours: 0, period_id: "p1", deadline: null, submitted_at: "2026-09-20T00:00:00Z", review_notes: [] },
        { week_start: "2026-09-07", week_end: "2026-09-13", status: "NOT_SUBMITTED", saved_hours: 10, approved_hours: 0, period_id: null, deadline: null, submitted_at: null, review_notes: [] },
      ],
      fund_requests: [
        {
          fund_request_id: "fr-overdue", request_number: "SF-010", purpose: null, status: "aprobado_gerente",
          request_currency: "BOB", due_back_date: "2026-09-10",
          amounts_by_currency: [], expenses: [],
        },
        {
          fund_request_id: "fr-today", request_number: "SF-024", purpose: null, status: "aprobado_gerente",
          request_currency: "BOB", due_back_date: "2026-09-21",
          amounts_by_currency: [],
          expenses: [{ expense_id: "x1", expense_date: "2026-09-18", description: null, status: "observado", currency: "BOB", amount: 100, has_attachment: true, has_invoice_observation: true, invoice_observation_notes: null, returned_by_assistant: false, manager_notes: null, rejection_reason: null }],
        },
        {
          fund_request_id: "fr-soon", request_number: "SF-030", purpose: null, status: "aprobado_gerente",
          request_currency: "BOB", due_back_date: "2026-09-25",
          amounts_by_currency: [], expenses: [],
        },
      ],
    });
    const items = buildAttentionItems(payload);
    expect(items.map((i) => i.kind)).toEqual([
      "timesheetRejected",
      "fundOverdue",
      "fundDueToday",
      "expenseObserved",
      "timesheetNotSubmitted",
      "fundDueSoon",
    ]);
  });

  it("sin datos -> lista vacía", () => {
    expect(buildAttentionItems(basePayload())).toEqual([]);
  });

  // review.md Iteración 1, MUST FIX R1.1: fundRequestId (UUID) debe viajar separado de
  // code (etiqueta visible), para que el enlace de "Resolver" nunca use request_number.
  it("los ítems de fondos llevan fundRequestId (UUID) distinto de code (etiqueta visible)", () => {
    const payload = basePayload({
      fund_requests: [
        {
          fund_request_id: "fr-abc", request_number: "SF-050", purpose: null, status: "aprobado_gerente",
          request_currency: "BOB", due_back_date: "2026-09-21",
          amounts_by_currency: [], expenses: [],
        },
      ],
    });
    const item = buildAttentionItems(payload).find((i) => i.kind === "fundDueToday");
    expect(item?.code).toBe("SF-050");
    expect(item?.fundRequestId).toBe("fr-abc");
  });

  // review.md Iteración 1, MUST FIX R1.2: DRAFT (período creado, sin enviar) con horas
  // guardadas es "horas sin enviar" (decisiones.md) igual que NOT_SUBMITTED.
  it("DRAFT con saved_hours > 0 genera timesheetNotSubmitted", () => {
    const payload = basePayload({
      compliance_weeks: [
        { week_start: "2026-09-14", week_end: "2026-09-20", status: "DRAFT", saved_hours: 16, approved_hours: 0, period_id: "p1", deadline: null, submitted_at: null, review_notes: [] },
      ],
    });
    const items = buildAttentionItems(payload);
    expect(items).toEqual([{ kind: "timesheetNotSubmitted", weekStart: "2026-09-14", hours: 16 }]);
  });

  it("DRAFT con saved_hours = 0 no genera atención", () => {
    const payload = basePayload({
      compliance_weeks: [
        { week_start: "2026-09-14", week_end: "2026-09-20", status: "DRAFT", saved_hours: 0, approved_hours: 0, period_id: "p1", deadline: null, submitted_at: null, review_notes: [] },
      ],
    });
    expect(buildAttentionItems(payload)).toEqual([]);
  });
});

describe("primaryFundAttention / expenseIssuesCount", () => {
  it("primaryFundAttention devuelve el primer ítem de fondos en orden de prioridad", () => {
    const items = buildAttentionItems(
      basePayload({
        fund_requests: [
          {
            fund_request_id: "fr1", request_number: "SF-001", purpose: null, status: "aprobado_gerente",
            request_currency: "BOB", due_back_date: "2026-09-21",
            amounts_by_currency: [], expenses: [],
          },
        ],
      }),
    );
    expect(primaryFundAttention(items)?.kind).toBe("fundDueToday");
    expect(primaryFundAttention([])).toBeNull();
  });

  it("expenseIssuesCount cuenta cada gasto problemático una sola vez", () => {
    const payload = basePayload({
      fund_requests: [
        {
          fund_request_id: "fr1", request_number: "SF-001", purpose: null, status: "aprobado_gerente",
          request_currency: "BOB", due_back_date: null,
          amounts_by_currency: [],
          expenses: [
            { expense_id: "x1", expense_date: "2026-09-18", description: null, status: "observado", currency: "BOB", amount: 100, has_attachment: false, has_invoice_observation: true, invoice_observation_notes: null, returned_by_assistant: false, manager_notes: null, rejection_reason: null },
            { expense_id: "x2", expense_date: "2026-09-18", description: null, status: "revisado_asistente", currency: "BOB", amount: 100, has_attachment: true, has_invoice_observation: false, invoice_observation_notes: null, returned_by_assistant: false, manager_notes: null, rejection_reason: null },
          ],
        },
      ],
    });
    expect(expenseIssuesCount(payload)).toBe(1);
  });
});

describe("buildUpcomingDeadlines", () => {
  it("limita las fechas a operational_end", () => {
    const payload = basePayload({
      fund_requests: [
        {
          fund_request_id: "fr-out", request_number: "SF-999", purpose: null, status: "aprobado_gerente",
          request_currency: "BOB", due_back_date: "2026-11-01",
          amounts_by_currency: [], expenses: [],
        },
      ],
    });
    expect(buildUpcomingDeadlines(payload)).toEqual([]);
  });

  it("incluye timesheetDue para una semana DRAFT con deadline dentro de la ventana (review.md iteración 3, G-01)", () => {
    const payload = basePayload({
      compliance_weeks: [
        { week_start: "2026-09-14", week_end: "2026-09-20", status: "DRAFT", saved_hours: 16, approved_hours: 0, period_id: "p1", deadline: "2026-10-15", submitted_at: null, review_notes: [] },
      ],
    });
    const items = buildUpcomingDeadlines(payload);
    expect(items).toContainEqual({ kind: "timesheetDue", date: "2026-10-15", code: null });
  });

  it("NO incluye timesheetDue para una semana ya APPROVED, aunque tenga deadline en la ventana", () => {
    const payload = basePayload({
      compliance_weeks: [
        { week_start: "2026-09-14", week_end: "2026-09-20", status: "APPROVED", saved_hours: 16, approved_hours: 16, period_id: "p1", deadline: "2026-10-15", submitted_at: "2026-09-20T00:00:00Z", review_notes: [] },
      ],
    });
    expect(buildUpcomingDeadlines(payload).map((i) => i.kind)).not.toContain("timesheetDue");
  });

  it("incluye inicio/fin de asignaciones dentro de la ventana", () => {
    const payload = basePayload({
      assignments: [
        { assignment_id: "a1", engagement_id: "e1", engagement_code: "AUD-1", engagement_name: "n", function_code: 1, start_date: "2026-09-22", end_date: "2026-10-05", hours_per_week: 16, status: "CONFIRMED" },
      ],
    });
    const kinds = buildUpcomingDeadlines(payload).map((i) => i.kind);
    expect(kinds).toContain("assignmentStarts");
    expect(kinds).toContain("assignmentEnds");
  });

  it("orden ascendente por fecha", () => {
    const payload = basePayload({
      fund_requests: [
        { fund_request_id: "fr1", request_number: "SF-1", purpose: null, status: "aprobado_gerente", request_currency: "BOB", due_back_date: "2026-09-30", amounts_by_currency: [], expenses: [] },
        { fund_request_id: "fr2", request_number: "SF-2", purpose: null, status: "aprobado_gerente", request_currency: "BOB", due_back_date: "2026-09-21", amounts_by_currency: [], expenses: [] },
      ],
    });
    const dates = buildUpcomingDeadlines(payload).map((i) => i.date);
    expect(dates).toEqual([...dates].sort());
  });
});

describe("formatDDMMYYYY", () => {
  it("formatea YYYY-MM-DD como DD/MM/YYYY", () => {
    expect(formatDDMMYYYY("2026-09-21")).toBe("21/09/2026");
  });
  it("formatea un timestamp ISO completo", () => {
    expect(formatDDMMYYYY("2026-09-21T14:30:00Z")).toBe("21/09/2026");
  });
  it("null/undefined/mal formado -> em dash", () => {
    expect(formatDDMMYYYY(null)).toBe("—");
    expect(formatDDMMYYYY(undefined)).toBe("—");
    expect(formatDDMMYYYY("not-a-date")).toBe("—");
  });
});
