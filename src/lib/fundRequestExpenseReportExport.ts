import type { FundRequest } from "@/hooks/useFundRequests";
import type { FundRequestExpense } from "@/hooks/useFundRequestExpenses";
import type { FundRequestEvent } from "@/hooks/useFundRequestEvents";
import { parseDateLocal } from "@/lib/timesheetUtils";

// Reporte Excel de los gastos de una solicitud de fondos. Sigue el patrón de
// `encargoHoursDetailExport.ts` (import dinámico de `xlsx` + writeFile).
// El builder de la matriz es puro (testeable); la descarga vive aparte.

export interface ExpenseReportTotals {
  disbursed: number;
  spent: number;
  balance: number;
  ivaPenalty: number;
}

export interface ExpenseReportInput {
  fr: FundRequest;
  expenses: FundRequestExpense[];
  totals: ExpenseReportTotals;
  /** Bitácora (P5): si viene, se agrega la sección de historial con quién hizo qué y cuándo. */
  events?: FundRequestEvent[];
}

export interface ExpenseReportLabels {
  title: string;
  sheetName: string;
  summary: {
    requester: string;
    status: string;
    disbursed: string;
    spent: string;
    balance: string;
    ivaTotal: string;
  };
  workOrders: {
    section: string;
    code: string;
    engagement: string;
    manager: string;
    allocated: string;
    status: string;
  };
  detail: {
    section: string;
    date: string;
    workOrder: string;
    expenseType: string;
    description: string;
    documentNumber: string;
    supplier: string;
    supplierTaxId: string;
    amount: string;
    currency: string;
    iva: string;
    status: string;
    total: string;
  };
  history?: {
    section: string;
    dateTime: string;
    action: string;
    actor: string;
    workOrder: string;
    notes: string;
    amount: string;
    /** Nombre que se muestra cuando el actor es NULL (lo hizo el sistema). */
    system: string;
  };
  // Resolutores de etiquetas de estado (el caller los conecta a i18n).
  frStatusLabel: (status: string) => string;
  otStatusLabel: (status: string) => string;
  expenseStatusLabel: (status: string) => string;
  actionLabel?: (action: string) => string;
}

type NamedStaff = {
  first_name?: string;
  last_name?: string;
  short_name?: string | null;
} | null | undefined;

function staffName(s: NamedStaff): string {
  if (!s) return "-";
  return s.short_name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "-";
}

// dd/mm/yyyy en hora local (parseDateLocal evita el corrimiento de un día que
// provoca interpretar un DATE 'YYYY-MM-DD' como UTC).
// dd/mm/yyyy hh:mm en hora local, para timestamps (created_at de la bitácora).
function fmtDateTime(iso: string): string {
  const dt = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const dt = parseDateLocal(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

/**
 * Construye la matriz (array de arrays) de la hoja Excel: título + resumen de
 * cabecera + detalle de OTs/gerentes + detalle de gastos + fila total.
 */
export function buildExpenseReportMatrix(
  input: ExpenseReportInput,
  labels: ExpenseReportLabels,
): (string | number)[][] {
  const { fr, expenses, totals } = input;
  const rows: (string | number)[][] = [];

  rows.push([`${labels.title} — ${fr.request_number}`]);
  rows.push([]);

  // Resumen de cabecera
  rows.push([labels.summary.requester, staffName(fr.requester)]);
  rows.push([labels.summary.status, labels.frStatusLabel(fr.status)]);
  rows.push([labels.summary.disbursed, totals.disbursed]);
  rows.push([labels.summary.spent, totals.spent]);
  rows.push([labels.summary.balance, totals.balance]);
  rows.push([labels.summary.ivaTotal, totals.ivaPenalty]);
  rows.push([]);

  // Detalle de OTs + gerentes
  rows.push([labels.workOrders.section]);
  rows.push([
    labels.workOrders.code,
    labels.workOrders.engagement,
    labels.workOrders.manager,
    labels.workOrders.allocated,
    labels.workOrders.status,
  ]);
  for (const ot of fr.fund_request_work_orders ?? []) {
    rows.push([
      ot.work_order?.engagement?.engagement_code ?? "",
      ot.work_order?.engagement?.engagement_name ?? "",
      staffName(ot.manager),
      Number(ot.allocated_amount ?? 0),
      labels.otStatusLabel(ot.approval_status),
    ]);
  }
  rows.push([]);

  // Detalle de gastos
  rows.push([labels.detail.section]);
  rows.push([
    labels.detail.date,
    labels.detail.workOrder,
    labels.detail.expenseType,
    labels.detail.description,
    labels.detail.documentNumber,
    labels.detail.supplier,
    labels.detail.supplierTaxId,
    labels.detail.amount,
    labels.detail.currency,
    labels.detail.iva,
    labels.detail.status,
  ]);
  for (const e of expenses) {
    rows.push([
      fmtDate(e.expense_date),
      e.work_order?.engagement?.engagement_code ?? "",
      e.expense_type?.expense_name ?? "",
      e.description ?? "",
      e.document_number ?? "",
      e.supplier_name ?? "",
      e.supplier_tax_id ?? "",
      Number(e.amount ?? 0),
      e.currency,
      Number(e.iva_penalty_amount ?? 0),
      labels.expenseStatusLabel(e.status),
    ]);
  }

  // Fila total
  const totalAmount = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalIva = expenses.reduce((s, e) => s + Number(e.iva_penalty_amount || 0), 0);
  rows.push([
    labels.detail.total,
    "",
    "",
    "",
    "",
    "",
    "",
    Math.round(totalAmount * 100) / 100,
    fr.currency,
    Math.round(totalIva * 100) / 100,
    "",
  ]);

  // Historial (bitácora): quién hizo qué y cuándo, incluidas las acciones del sistema.
  if (input.events && input.events.length > 0 && labels.history) {
    const h = labels.history;
    const woCode = (woId: string | null) =>
      woId
        ? ((fr.fund_request_work_orders ?? []).find((o) => o.wo_id === woId)?.work_order?.engagement
            ?.engagement_code ?? "")
        : "";
    rows.push([]);
    rows.push([h.section]);
    rows.push([h.dateTime, h.action, h.actor, h.workOrder, h.notes, h.amount]);
    for (const ev of input.events) {
      rows.push([
        fmtDateTime(ev.created_at),
        labels.actionLabel ? labels.actionLabel(ev.action) : ev.action,
        ev.actor ? staffName(ev.actor) : h.system,
        woCode(ev.wo_id),
        ev.notes ?? "",
        ev.amount != null ? Number(ev.amount) : "",
      ]);
    }
  }

  return rows;
}

/**
 * Nombre de archivo del reporte. `prefix` y `fallback` llegan localizados desde
 * el caller (i18n); se sanean para que el nombre sea seguro en el filesystem.
 */
export function reportFilename(requestNumber: string, prefix: string, fallback: string): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const safePrefix = sanitize(prefix || "report");
  const safeBase = sanitize(requestNumber || fallback || "export");
  return `${safePrefix}_${safeBase}.xlsx`;
}

/** Genera y descarga el .xlsx (import dinámico de xlsx, igual que el resto del sistema). */
export async function downloadExpenseReportXlsx(
  input: ExpenseReportInput,
  labels: ExpenseReportLabels,
  filename: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const data = buildExpenseReportMatrix(input, labels);
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, labels.sheetName);
  XLSX.writeFile(wb, filename);
}
