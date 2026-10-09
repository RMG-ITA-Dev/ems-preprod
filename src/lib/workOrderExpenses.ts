import type { WorkOrderExpense, WorkOrderExpenseDetail } from "@/hooks/useWorkOrderExpenses";

// Detalle de gastos por OT (docs/plan-contabilidad-gastos.md, Fase 5). Lógica pura: filtros,
// totales, agrupación por solicitud y la matriz del Excel. Mismas definiciones que las RPC:
// gastado = revisado_asistente; en proceso = pendiente / aprobado por el gerente / observado.

const IN_PROCESS = new Set(["pendiente_aprobacion", "aprobado_gerente", "observado"]);

export interface WorkOrderExpenseFilters {
  from?: string; // 'YYYY-MM-DD'
  to?: string;
  requesterId?: string;
  expenseTypeId?: string;
  status?: string;
}

export function filterWorkOrderExpenses(
  expenses: WorkOrderExpense[],
  f: WorkOrderExpenseFilters,
): WorkOrderExpense[] {
  return expenses.filter(
    (e) =>
      (!f.from || e.expense_date >= f.from) &&
      (!f.to || e.expense_date <= f.to) &&
      (!f.requesterId || e.requester_staff_id === f.requesterId) &&
      (!f.expenseTypeId || e.expense_type_id === f.expenseTypeId) &&
      (!f.status || e.status === f.status),
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Gastado (validado) y en proceso de una lista de gastos. */
export function workOrderExpenseTotals(expenses: WorkOrderExpense[]) {
  let spent = 0;
  let inProcess = 0;
  for (const e of expenses) {
    if (e.status === "revisado_asistente") spent += Number(e.amount);
    else if (IN_PROCESS.has(e.status)) inProcess += Number(e.amount);
  }
  return { spent: round2(spent), inProcess: round2(inProcess) };
}

export interface ExpenseGroup {
  fundRequestId: string;
  requestNumber: string | null;
  requesterName: string;
  expenses: WorkOrderExpense[];
  spent: number;
  inProcess: number;
}

/** Agrupa los gastos por su solicitud de origen, en el orden en que aparece cada solicitud. */
export function groupExpensesByRequest(expenses: WorkOrderExpense[]): ExpenseGroup[] {
  const groups = new Map<string, ExpenseGroup>();
  for (const e of expenses) {
    let g = groups.get(e.fund_request_id);
    if (!g) {
      g = {
        fundRequestId: e.fund_request_id,
        requestNumber: e.request_number,
        requesterName: e.requester_name,
        expenses: [],
        spent: 0,
        inProcess: 0,
      };
      groups.set(e.fund_request_id, g);
    }
    g.expenses.push(e);
  }
  for (const g of groups.values()) {
    const t = workOrderExpenseTotals(g.expenses);
    g.spent = t.spent;
    g.inProcess = t.inProcess;
  }
  return [...groups.values()];
}

/** Porcentaje del presupuesto usado (null sin presupuesto). */
export function budgetUsage(spent: number, budgeted: number): number | null {
  if (!budgeted || budgeted <= 0) return null;
  return Math.round((spent / budgeted) * 100);
}

/** Opciones únicas (id → nombre) para los filtros de solicitante y tipo. */
export function distinctOptions(
  expenses: WorkOrderExpense[],
  id: (e: WorkOrderExpense) => string | null,
  label: (e: WorkOrderExpense) => string | null,
): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const e of expenses) {
    const v = id(e);
    if (v && !seen.has(v)) seen.set(v, label(e) ?? v);
  }
  return [...seen.entries()]
    .map(([value, l]) => ({ value, label: l }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── Excel ──────────────────────────────────────────────────────────────────

export interface WorkOrderReportLabels {
  title: string;
  sheetName: string;
  summary: { assigned: string; spent: string; inProcess: string; difference: string; budget: string };
  budget: { section: string; type: string; budgeted: string; spent: string; inProcess: string; usage: string };
  detail: {
    section: string;
    date: string;
    request: string;
    requester: string;
    type: string;
    description: string;
    document: string;
    amount: string;
    status: string;
  };
  noType: string;
  statusLabel: (s: string) => string;
}

function fmtDate(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

export function buildWorkOrderReportMatrix(
  detail: WorkOrderExpenseDetail,
  expenses: WorkOrderExpense[],
  labels: WorkOrderReportLabels,
): (string | number)[][] {
  const wo = detail.work_order;
  const t = detail.totals;
  const rows: (string | number)[][] = [];
  rows.push([`${labels.title} — ${wo?.engagement_code ?? ""} ${wo?.engagement_name ?? ""}`.trim()]);
  if (wo?.client_name) rows.push([wo.client_name]);
  rows.push([]);
  rows.push([labels.summary.assigned, Number(t.assigned)]);
  rows.push([labels.summary.spent, Number(t.spent)]);
  rows.push([labels.summary.inProcess, Number(t.in_process)]);
  rows.push([labels.summary.difference, round2(Number(t.assigned) - Number(t.spent))]);
  rows.push([labels.summary.budget, Number(t.budget)]);
  rows.push([]);

  rows.push([labels.budget.section]);
  rows.push([labels.budget.type, labels.budget.budgeted, labels.budget.spent, labels.budget.inProcess, labels.budget.usage]);
  for (const b of detail.budget_by_type) {
    const usage = budgetUsage(Number(b.spent), Number(b.budgeted));
    rows.push([
      b.expense_type_name ?? labels.noType,
      Number(b.budgeted),
      Number(b.spent),
      Number(b.in_process),
      usage === null ? "" : `${usage}%`,
    ]);
  }
  rows.push([]);

  rows.push([labels.detail.section]);
  rows.push([
    labels.detail.date,
    labels.detail.request,
    labels.detail.requester,
    labels.detail.type,
    labels.detail.description,
    labels.detail.document,
    labels.detail.amount,
    labels.detail.status,
  ]);
  for (const e of expenses) {
    rows.push([
      fmtDate(e.expense_date),
      e.request_number ?? "",
      e.requester_name,
      e.expense_type_name ?? labels.noType,
      e.description ?? "",
      e.document_number ?? "",
      Number(e.amount),
      labels.statusLabel(e.status),
    ]);
  }
  return rows;
}

export async function downloadWorkOrderReportXlsx(
  detail: WorkOrderExpenseDetail,
  expenses: WorkOrderExpense[],
  labels: WorkOrderReportLabels,
  filename: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(buildWorkOrderReportMatrix(detail, expenses, labels));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, labels.sheetName);
  XLSX.writeFile(wb, filename);
}
