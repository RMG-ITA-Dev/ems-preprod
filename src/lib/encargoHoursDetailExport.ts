export interface RawTimeEntryRow {
  staff_id: string;
  hours_logged: number;
  period: { year: number; week_number: number; week_start_date: string } | null;
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
}

export interface CategoryGroup {
  categoryName: string;
  rows: StaffHoursReportRow[];
  subtotal: number;
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
      });
    }

    map.get(key)!.hoursLoaded += Number(entry.hours_logged);
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
  },
  filename: string
): Promise<void> {
  const XLSX = await import('xlsx');
  const data: (string | number)[][] = [
    [headers.staffName, headers.category, headers.year, headers.week, headers.loadedHours],
  ];

  let grandTotal = 0;
  for (const group of groupByCategory(rows)) {
    for (const row of group.rows) {
      data.push([
        row.staffName,
        row.categoryName,
        row.year !== null ? row.year : '—',
        row.weekNumber !== null ? row.weekNumber : '—',
        Number(row.hoursLoaded.toFixed(1)),
      ]);
    }
    data.push(['', `${group.categoryName} — ${headers.subtotal}`, '—', '—', Number(group.subtotal.toFixed(1))]);
    grandTotal += group.subtotal;
  }
  data.push(['', headers.grandTotal, '—', '—', Number(grandTotal.toFixed(1))]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Horas');
  XLSX.writeFile(wb, filename);
}
