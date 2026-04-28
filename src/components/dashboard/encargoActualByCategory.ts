import { safeNumber } from '@/lib/queryHelpers';

export interface ActualHoursTimeEntryRow {
  hours_logged: number | null;
  staff: {
    category: {
      category_id: string;
      category_name: string | null;
      display_order: number | null;
    } | null;
  } | null;
}

export interface ActualHoursByCategoryRow {
  category_id: string;
  category_name: string;
  actual_hours: number;
  display_order: number;
}

interface CategoryAccumulator {
  category_id: string;
  category_name: string;
  actual_hours: number;
  display_order: number;
}

export function aggregateActualHoursByCategory(
  rows: ActualHoursTimeEntryRow[],
): ActualHoursByCategoryRow[] {
  const byCategory = new Map<string, CategoryAccumulator>();

  for (const row of rows) {
    const category = row.staff?.category;
    if (!category || !category.category_id) continue;

    const safe = safeNumber(row.hours_logged);

    const existing = byCategory.get(category.category_id);
    if (existing) {
      existing.actual_hours += safe;
    } else {
      byCategory.set(category.category_id, {
        category_id: category.category_id,
        category_name: category.category_name ?? '',
        actual_hours: safe,
        display_order: category.display_order ?? 99,
      });
    }
  }

  return Array.from(byCategory.values()).sort(
    (a, b) => a.display_order - b.display_order,
  );
}
