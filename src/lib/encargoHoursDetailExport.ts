// Estado de una hora para el desglose del detalle (B3d): «aprobada» y «pendiente» según su línea de aprobación;
// «guardada» = sin línea, con la línea rechazada (devuelta al dueño) o con la línea pendiente de un período retirado (sin enviar).
export type HoursStatus = 'approved' | 'pending' | 'saved';

export interface LineStatusRow {
  period_id: string;
  activity_id: string;
  status: string;
}

export interface RawTimeEntryRow {
  staff_id: string;
  hours_logged: number;
  activity_id?: string | null;
  period_id?: string | null;
  period: { year: number; week_number: number; week_start_date: string; submitted_at?: string | null } | null;
  hours_status?: HoursStatus;
  staff: {
    first_name: string;
    last_name: string;
    category: { category_name: string; display_order: number };
  } | null;
}

export interface StaffHoursReportRow {
  staffId: string;
  staffName: string;
  categoryName: string;
  categoryDisplayOrder: number;
  year: number | null;
  weekNumber: number | null;
  hoursLoaded: number;
  approvedHours: number;
  pendingHours: number;
  savedHours: number;
}

export interface CategoryGroup {
  categoryName: string;
  rows: StaffHoursReportRow[];
  subtotal: number;
  approvedSubtotal: number;
  pendingSubtotal: number;
  savedSubtotal: number;
}

// Mapa `period_id:activity_id` → status de la línea de aprobación (las líneas de UN encargo).
export function buildLineStatusMap(lines: LineStatusRow[]): Map<string, string> {
  return new Map(lines.map((l) => [`${l.period_id}:${l.activity_id}`, l.status]));
}

export function classifyHoursStatus(
  entry: { period_id?: string | null; activity_id?: string | null; period?: { submitted_at?: string | null } | null },
  lineStatus: Map<string, string>,
): HoursStatus {
  if (!entry.period_id || !entry.activity_id) return 'saved';
  const status = lineStatus.get(`${entry.period_id}:${entry.activity_id}`);
  // Una línea aprobada manda sobre submitted_at: unsubmit_timesheet_safe limpia submitted_at de una semana PARCIALMENTE aprobada
  // y conserva sus líneas aprobadas (solo las borra si todas lo estaban); esas horas siguen aprobadas.
  if (status === 'approved') return 'approved';
  // Pendiente exige el período enviado: una línea pendiente de una semana retirada es una hora guardada.
  if (status === 'pending' && entry.period?.submitted_at) return 'pending';
  return 'saved';
}

export function aggregateStaffHours(raw: RawTimeEntryRow[]): StaffHoursReportRow[] {
  const map = new Map<string, StaffHoursReportRow>();

  for (const entry of raw) {
    const year = entry.period?.year ?? null;
    const weekNumber = entry.period?.week_number ?? null;
    const key = `${entry.staff_id}_${year ?? 'null'}_${weekNumber ?? 'null'}`;

    if (!map.has(key)) {
      const firstName = entry.staff?.first_name ?? '';
      const lastName = entry.staff?.last_name ?? '';
      map.set(key, {
        staffId: entry.staff_id,
        staffName: `${firstName} ${lastName}`.trim(),
        categoryName: entry.staff?.category?.category_name ?? '',
        categoryDisplayOrder: entry.staff?.category?.display_order ?? 99,
        year,
        weekNumber,
        hoursLoaded: 0,
        approvedHours: 0,
        pendingHours: 0,
        savedHours: 0,
      });
    }

    const row = map.get(key)!;
    const hours = Number(entry.hours_logged);
    row.hoursLoaded += hours;
    if (entry.hours_status === 'approved') row.approvedHours += hours;
    else if (entry.hours_status === 'pending') row.pendingHours += hours;
    else row.savedHours += hours;
  }

  return Array.from(map.values()).sort((a, b) => {
    // year ASC NULLS LAST
    if (a.year !== b.year) {
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return a.year - b.year;
    }
    // weekNumber ASC NULLS LAST
    if (a.weekNumber !== b.weekNumber) {
      if (a.weekNumber === null) return 1;
      if (b.weekNumber === null) return -1;
      return a.weekNumber - b.weekNumber;
    }
    // categoryDisplayOrder ASC
    if (a.categoryDisplayOrder !== b.categoryDisplayOrder) {
      return a.categoryDisplayOrder - b.categoryDisplayOrder;
    }
    // staffName ASC
    return a.staffName.localeCompare(b.staffName);
  });
}

export function groupByCategory(rows: StaffHoursReportRow[]): CategoryGroup[] {
  const map = new Map<string, StaffHoursReportRow[]>();
  for (const row of rows) {
    const list = map.get(row.categoryName) ?? [];
    list.push(row);
    map.set(row.categoryName, list);
  }
  return Array.from(map.entries()).map(([categoryName, catRows]) => ({
    categoryName,
    rows: catRows,
    subtotal: catRows.reduce((s, r) => s + r.hoursLoaded, 0),
    approvedSubtotal: catRows.reduce((s, r) => s + (r.approvedHours ?? 0), 0),
    pendingSubtotal: catRows.reduce((s, r) => s + (r.pendingHours ?? 0), 0),
    savedSubtotal: catRows.reduce((s, r) => s + (r.savedHours ?? 0), 0),
  }));
}

export async function downloadXlsx(
  rows: StaffHoursReportRow[],
  headers: {
    staffName: string;
    category: string;
    year: string;
    week: string;
    loadedHours: string;
    subtotal: string;
    grandTotal: string;
    sheetName: string;
    approvedHours?: string;
    pendingHours?: string;
    savedHours?: string;
  },
  filename: string
): Promise<void> {
  const XLSX = await import('xlsx');
  const withBreakdown = !!(headers.approvedHours && headers.pendingHours && headers.savedHours);
  const num = (n: number | undefined) => Number((n ?? 0).toFixed(1));
  const data: (string | number)[][] = [
    [headers.staffName, headers.category, headers.year, headers.week, headers.loadedHours,
      ...(withBreakdown ? [headers.approvedHours!, headers.pendingHours!, headers.savedHours!] : [])],
  ];

  let grandTotal = 0;
  let grandApproved = 0;
  let grandPending = 0;
  let grandSaved = 0;
  for (const group of groupByCategory(rows)) {
    for (const row of group.rows) {
      data.push([
        row.staffName,
        row.categoryName,
        row.year !== null ? row.year : '—',
        row.weekNumber !== null ? row.weekNumber : '—',
        Number(row.hoursLoaded.toFixed(1)),
        ...(withBreakdown ? [num(row.approvedHours), num(row.pendingHours), num(row.savedHours)] : []),
      ]);
    }
    data.push(['', `${group.categoryName} — ${headers.subtotal}`, '—', '—', Number(group.subtotal.toFixed(1)),
      ...(withBreakdown ? [num(group.approvedSubtotal), num(group.pendingSubtotal), num(group.savedSubtotal)] : [])]);
    grandTotal += group.subtotal;
    grandApproved += group.approvedSubtotal;
    grandPending += group.pendingSubtotal;
    grandSaved += group.savedSubtotal;
  }
  data.push(['', headers.grandTotal, '—', '—', Number(grandTotal.toFixed(1)),
    ...(withBreakdown ? [num(grandApproved), num(grandPending), num(grandSaved)] : [])]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, headers.sheetName);
  XLSX.writeFile(wb, filename);
}
