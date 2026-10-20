import type { CollectionsRow } from "@/hooks/useCollections";

/**
 * Cobranzas Fase 8 — export a Excel de lo que la pantalla tiene a la vista.
 *
 * El Analista de Cobranzas todavía no entregó su planilla, así que esto es un export genérico
 * (decisión del operador 2026-10-20): las columnas de la fila más lo que hace falta para
 * conciliar fuera del sistema —NIT, las dos fechas, el estado y el contacto de cobranza—.
 * Cuando llegue la planilla real se contrasta contra esta lista.
 *
 * `buildCollectionsSheet` está separada de la escritura del archivo para poder probar el
 * contenido sin tocar el disco ni cargar `xlsx`.
 */
export interface CollectionsExportHeaders {
  client: string;
  taxId: string;
  engagement: string;
  manager: string;
  installment: string;
  type: string;
  amount: string;
  currency: string;
  agreedDate: string;
  currentDate: string;
  status: string;
  daysOverdue: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  sheetName: string;
  typeFee: string;
  typeExpense: string;
  statusLabel: (row: CollectionsRow) => string;
}

export type SheetCell = string | number;

/**
 * Las filas, tal cual se ven, en el orden en que se ven. No se reordena ni se agrupa: el
 * archivo tiene que poder contrastarse línea a línea con la pantalla que lo generó.
 */
export function buildCollectionsSheet(
  rows: CollectionsRow[],
  headers: CollectionsExportHeaders,
): SheetCell[][] {
  const data: SheetCell[][] = [[
    headers.client,
    headers.taxId,
    headers.engagement,
    headers.manager,
    headers.installment,
    headers.type,
    headers.amount,
    headers.currency,
    headers.agreedDate,
    headers.currentDate,
    headers.status,
    headers.daysOverdue,
    headers.contactName,
    headers.contactEmail,
    headers.contactPhone,
  ]];

  for (const row of rows) {
    data.push([
      row.client_legal_name ?? "",
      row.unique_tax_id ?? "",
      [row.engagement_code, row.engagement_name].filter(Boolean).join(" — "),
      row.manager_name ?? "",
      row.installment_number,
      row.installment_type === "expense_reimbursement" ? headers.typeExpense : headers.typeFee,
      // El monto va como NÚMERO: un texto obliga a reconvertir la columna entera en Excel
      // antes de poder sumarla, que es lo primero que alguien hace con este archivo.
      row.amount ?? 0,
      row.currency,
      // La acordada es el contrato; la vigente es lo que rige hoy. Van las dos, porque la
      // diferencia entre ambas es justamente lo que hay que explicar al conciliar.
      (row.status === "Pending" ? row.agreed_invoice_date : row.agreed_payment_date) ?? "",
      row.fecha_relevante ?? "",
      headers.statusLabel(row),
      row.days_overdue,
      row.contact?.full_name ?? "",
      row.contact?.email ?? "",
      row.contact?.phone ?? "",
    ]);
  }

  return data;
}

/** Escribe el archivo. `xlsx` se carga sólo acá, y sólo cuando alguien exporta. */
export async function exportCollectionsToExcel(
  rows: CollectionsRow[],
  headers: CollectionsExportHeaders,
  filename: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(buildCollectionsSheet(rows, headers));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, headers.sheetName);
  XLSX.writeFile(wb, filename);
}
