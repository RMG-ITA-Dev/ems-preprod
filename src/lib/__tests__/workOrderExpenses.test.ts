import { describe, it, expect } from "vitest";
import {
  budgetUsage,
  buildWorkOrderReportMatrix,
  distinctOptions,
  filterWorkOrderExpenses,
  groupExpensesByRequest,
  workOrderExpenseTotals,
  type WorkOrderReportLabels,
} from "@/lib/workOrderExpenses";
import type { WorkOrderExpense, WorkOrderExpenseDetail } from "@/hooks/useWorkOrderExpenses";

const exp = (over: Partial<WorkOrderExpense>): WorkOrderExpense => ({
  fre_id: "e",
  fund_request_id: "fr1",
  request_number: "SF-1",
  requester_staff_id: "s1",
  requester_name: "Ana P",
  expense_date: "2026-10-05",
  expense_date_end: null,
  amount: 100,
  currency: "BOB",
  status: "revisado_asistente",
  expense_type_id: "t1",
  expense_type_name: "Pasajes",
  description: null,
  document_number: null,
  supplier_name: null,
  iva_penalty_amount: 0,
  manager_auto_approved: false,
  review_auto_approved: false,
  ...over,
});

// Mismo escenario que supabase/tests/rpc-fund-expenses-by-work-order.sql.
const list = [
  exp({ fre_id: "e1", amount: 500, expense_date: "2026-09-10" }),
  exp({ fre_id: "e2", fund_request_id: "fr2", request_number: "SF-2", amount: 120, expense_type_id: "t2", expense_type_name: "Viaticos" }),
  exp({ fre_id: "e3", fund_request_id: "fr2", request_number: "SF-2", amount: 30, status: "aprobado_gerente", requester_staff_id: "s2", requester_name: "Luis C" }),
  exp({ fre_id: "e4", fund_request_id: "fr2", request_number: "SF-2", amount: 50, status: "pendiente_aprobacion", expense_type_id: "t2", expense_type_name: "Viaticos" }),
];

describe("workOrderExpenses", () => {
  it("gastado = validado por Contabilidad; en proceso = enviado y todavía no final", () => {
    expect(workOrderExpenseTotals(list)).toEqual({ spent: 620, inProcess: 80 });
  });

  it("filtra por período, solicitante, tipo y estado", () => {
    expect(filterWorkOrderExpenses(list, { from: "2026-10-01" }).map((e) => e.fre_id)).toEqual(["e2", "e3", "e4"]);
    expect(filterWorkOrderExpenses(list, { to: "2026-09-30" }).map((e) => e.fre_id)).toEqual(["e1"]);
    expect(filterWorkOrderExpenses(list, { requesterId: "s2" }).map((e) => e.fre_id)).toEqual(["e3"]);
    expect(filterWorkOrderExpenses(list, { expenseTypeId: "t2" }).map((e) => e.fre_id)).toEqual(["e2", "e4"]);
    expect(filterWorkOrderExpenses(list, { status: "pendiente_aprobacion" }).map((e) => e.fre_id)).toEqual(["e4"]);
  });

  it("agrupa por solicitud con subtotales", () => {
    const groups = groupExpensesByRequest(list);
    expect(groups.map((g) => [g.requestNumber, g.expenses.length, g.spent, g.inProcess])).toEqual([
      ["SF-1", 1, 500, 0],
      ["SF-2", 3, 120, 80],
    ]);
  });

  it("calcula el uso del presupuesto (sin presupuesto → null)", () => {
    expect(budgetUsage(500, 2000)).toBe(25);
    expect(budgetUsage(1720, 1500)).toBe(115);
    expect(budgetUsage(30, 0)).toBeNull();
  });

  it("arma las opciones únicas de los filtros, ordenadas", () => {
    expect(distinctOptions(list, (e) => e.requester_staff_id, (e) => e.requester_name)).toEqual([
      { value: "s1", label: "Ana P" },
      { value: "s2", label: "Luis C" },
    ]);
  });

  it("arma el Excel con totales, presupuesto por tipo y detalle", () => {
    const detail: WorkOrderExpenseDetail = {
      work_order: { wo_id: "wo", engagement_code: "7F01", engagement_name: "Auditoría", client_name: "Cliente SA" },
      totals: { assigned: 1000, spent: 620, in_process: 80, budget: 3500 },
      requests: [],
      expenses: list,
      budget_by_type: [
        { expense_type_id: "t1", expense_type_name: "Pasajes", budgeted: 2000, spent: 500, in_process: 0 },
        { expense_type_id: null, expense_type_name: null, budgeted: 0, spent: 0, in_process: 30 },
      ],
    };
    const labels: WorkOrderReportLabels = {
      title: "Gastos por OT",
      sheetName: "OT",
      summary: { assigned: "Asignado", spent: "Gastado", inProcess: "En proceso", difference: "Diferencia", budget: "Presupuesto" },
      budget: { section: "Presupuesto", type: "Tipo", budgeted: "Presupuesto", spent: "Gastado", inProcess: "En proceso", usage: "%" },
      detail: { section: "Gastos", date: "Fecha", request: "Solicitud", requester: "Solicitante", type: "Tipo", description: "Desc", document: "Doc", amount: "Monto", status: "Estado" },
      noType: "Sin tipo",
      statusLabel: (s) => `st:${s}`,
    };
    const m = buildWorkOrderReportMatrix(detail, list, labels);
    expect(m[0][0]).toBe("Gastos por OT — 7F01 Auditoría");
    expect(m).toContainEqual(["Diferencia", 380]);
    expect(m).toContainEqual(["Pasajes", 2000, 500, 0, "25%"]);
    expect(m).toContainEqual(["Sin tipo", 0, 0, 30, ""]);
    expect(m).toContainEqual(["10/09/2026", "SF-1", "Ana P", "Pasajes", "", "", 500, "st:revisado_asistente"]);
  });
});
