import { describe, it, expect } from "vitest";
import {
  buildExpenseReportMatrix,
  reportFilename,
  type ExpenseReportInput,
  type ExpenseReportLabels,
} from "@/lib/fundRequestExpenseReportExport";
import type { FundRequest } from "@/hooks/useFundRequests";
import type { FundRequestExpense } from "@/hooks/useFundRequestExpenses";

// Etiquetas mínimas; los resolvers de estado usan identidad para asertar fácil.
const labels: ExpenseReportLabels = {
  title: "Reporte de Gastos",
  sheetName: "Gastos",
  summary: {
    requester: "Solicitante",
    status: "Estado",
    disbursed: "Entregado",
    spent: "Gastado",
    balance: "Saldo",
    ivaTotal: "IVA",
  },
  workOrders: {
    section: "OTs",
    code: "OT",
    engagement: "Engagement",
    manager: "Gerente",
    allocated: "Asignado",
    status: "Estado",
  },
  detail: {
    section: "Detalle",
    date: "Fecha",
    workOrder: "OT",
    expenseType: "Tipo",
    description: "Descripción",
    documentNumber: "Factura",
    supplier: "Proveedor",
    supplierTaxId: "NIT",
    amount: "Monto",
    currency: "Moneda",
    iva: "IVA",
    status: "Estado",
    total: "TOTAL",
  },
  frStatusLabel: (s) => `fr:${s}`,
  otStatusLabel: (s) => `ot:${s}`,
  expenseStatusLabel: (s) => `ex:${s}`,
};

const fr = {
  request_number: "FR-2026-0026",
  status: "fondos_entregados",
  currency: "BOB",
  requester: { first_name: "Gary", last_name: "Nu", short_name: "Gary N" },
  fund_request_work_orders: [
    {
      allocated_amount: 40,
      approval_status: "aprobado",
      manager: { first_name: "Ana", last_name: "Paz", short_name: "Ana P" },
      work_order: { engagement: { engagement_code: "12-06", engagement_name: "Auditoría X" } },
    },
  ],
} as unknown as FundRequest;

const expenses = [
  {
    expense_date: "2026-06-10",
    amount: 40,
    currency: "BOB",
    iva_penalty_amount: 0,
    status: "revisado_asistente",
    description: "Gasto prueba",
    document_number: "F-001",
    supplier_name: "Hotel ABC",
    supplier_tax_id: "123456",
    expense_type: { expense_name: "Hospedaje" },
    work_order: { engagement: { engagement_code: "12-06" } },
  },
  {
    expense_date: "2026-06-12",
    amount: 13.5,
    currency: "BOB",
    iva_penalty_amount: 1.75,
    status: "revisado_asistente",
    description: null,
    document_number: null,
    supplier_name: null,
    supplier_tax_id: null,
    expense_type: null,
    work_order: null,
  },
] as unknown as FundRequestExpense[];

const totals = { disbursed: 40, spent: 53.5, balance: -13.5, ivaPenalty: 1.75 };
const input: ExpenseReportInput = { fr, expenses, totals };

describe("buildExpenseReportMatrix", () => {
  const matrix = buildExpenseReportMatrix(input, labels);
  const flat = matrix.map((r) => r.join("|"));

  it("starts with the title including the request number", () => {
    expect(matrix[0][0]).toBe("Reporte de Gastos — FR-2026-0026");
  });

  it("includes the header summary with totals", () => {
    expect(matrix).toContainEqual(["Solicitante", "Gary N"]);
    expect(matrix).toContainEqual(["Estado", "fr:fondos_entregados"]);
    expect(matrix).toContainEqual(["Entregado", 40]);
    expect(matrix).toContainEqual(["Gastado", 53.5]);
    expect(matrix).toContainEqual(["Saldo", -13.5]);
    expect(matrix).toContainEqual(["IVA", 1.75]);
  });

  it("includes a work-order row with its manager and status", () => {
    expect(matrix).toContainEqual(["12-06", "Auditoría X", "Ana P", 40, "ot:aprobado"]);
  });

  it("maps each expense; dates use local parsing (no day shift)", () => {
    // 2026-06-10 debe quedar 10/06/2026 (no 09/06)
    expect(flat.some((r) => r.startsWith("10/06/2026|12-06|Hospedaje|Gasto prueba|F-001|Hotel ABC|123456|40|BOB|0|ex:revisado_asistente"))).toBe(true);
  });

  it("renders null fields as empty strings", () => {
    expect(flat.some((r) => r.startsWith("12/06/2026|||"))).toBe(true);
  });

  it("ends with a TOTAL row summing amounts and IVA", () => {
    const total = matrix[matrix.length - 1];
    expect(total[0]).toBe("TOTAL");
    expect(total[7]).toBe(53.5); // suma de montos
    expect(total[9]).toBe(1.75); // suma de IVA
  });
});

describe("reportFilename", () => {
  it("uses the localized prefix and sanitizes the request number", () => {
    expect(reportFilename("FR-2026-0026", "gastos", "solicitud")).toBe("gastos_FR-2026-0026.xlsx");
    expect(reportFilename("FR-2026-0026", "expenses", "request")).toBe("expenses_FR-2026-0026.xlsx");
  });
  it("falls back to the localized fallback when the request number is empty", () => {
    expect(reportFilename("", "gastos", "solicitud")).toBe("gastos_solicitud.xlsx");
    expect(reportFilename("", "expenses", "request")).toBe("expenses_request.xlsx");
  });
  it("sanitizes unsafe characters in prefix and base", () => {
    expect(reportFilename("FR 2026/26", "mis gastos", "x")).toBe("mis_gastos_FR_2026_26.xlsx");
  });
});

describe("buildExpenseReportMatrix — historial (bitácora)", () => {
  const history = {
    section: "Historial",
    dateTime: "Fecha y hora",
    action: "Acción",
    actor: "Realizado por",
    workOrder: "OT",
    notes: "Notas",
    amount: "Monto",
    system: "Sistema",
  };
  const frWithWo = {
    ...fr,
    fund_request_work_orders: [
      { ...(fr.fund_request_work_orders ?? [])[0], wo_id: "wo-1" },
    ],
  } as unknown as FundRequest;
  const events = [
    {
      event_id: "e1",
      seq: 1,
      fund_request_id: "fr1",
      entity: "work_order",
      fr_wo_id: "frwo-1",
      wo_id: "wo-1",
      fre_id: null,
      action: "wo_approved",
      from_status: "pendiente",
      to_status: "aprobado",
      actor_staff_id: "s1",
      notes: "ok",
      amount: null,
      created_at: new Date(2026, 9, 8, 14, 32).toISOString(),
      actor: { staff_id: "s1", first_name: "Ana", last_name: "Paz", short_name: "Ana P" },
    },
    {
      event_id: "e2",
      seq: 2,
      fund_request_id: "fr1",
      entity: "expense",
      fr_wo_id: null,
      wo_id: null,
      fre_id: "fre-1",
      action: "expense_reviewed",
      from_status: "aprobado_gerente",
      to_status: "revisado_asistente",
      actor_staff_id: null,
      notes: null,
      amount: 13,
      created_at: new Date(2026, 9, 9, 0, 5).toISOString(),
      actor: null,
    },
  ] as ExpenseReportInput["events"];

  it("adds the history section with actor, local date-time and action label", () => {
    const matrix = buildExpenseReportMatrix(
      { fr: frWithWo, expenses, totals, events },
      { ...labels, history, actionLabel: (a) => `act:${a}` },
    );
    expect(matrix).toContainEqual(["Historial"]);
    expect(matrix).toContainEqual(["08/10/2026 14:32", "act:wo_approved", "Ana P", "12-06", "ok", ""]);
  });

  it("shows the system as actor when the event has no actor", () => {
    const matrix = buildExpenseReportMatrix(
      { fr: frWithWo, expenses, totals, events },
      { ...labels, history, actionLabel: (a) => `act:${a}` },
    );
    expect(matrix).toContainEqual(["09/10/2026 00:05", "act:expense_reviewed", "Sistema", "", "", 13]);
  });

  it("omits the section when there are no events", () => {
    const matrix = buildExpenseReportMatrix({ fr, expenses, totals, events: [] }, { ...labels, history });
    expect(matrix).not.toContainEqual(["Historial"]);
  });
});
