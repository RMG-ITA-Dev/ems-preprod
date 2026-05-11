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

// Category Breakdown Merge

export interface CategoryBudgetRow {
  category_id: string;
  category_name: string | null;
  total_budget_hours: number | null;
  category_display_order: number | null;
}

export interface CategoryBreakdownRow {
  category_id: string;
  category_name: string;
  budget_hours: number;
  actual_hours: number;
  variance: number;
  consumed_percent: number;
  display_order: number;
}

export function mergeCategoryBreakdown(
  categoryBudget: CategoryBudgetRow[],
  actualByCategory: ActualHoursByCategoryRow[],
): CategoryBreakdownRow[] {
  const budgetedIds = new Set(categoryBudget.map(b => b.category_id));

  const fromBudget: CategoryBreakdownRow[] = categoryBudget.map(budget => {
    const actual = actualByCategory.find(a => a.category_id === budget.category_id);
    const budgetHours = safeNumber(budget.total_budget_hours);
    const actualHours = safeNumber(actual?.actual_hours);
    return {
      category_id: budget.category_id,
      category_name: budget.category_name ?? '',
      budget_hours: budgetHours,
      actual_hours: actualHours,
      variance: budgetHours - actualHours,
      consumed_percent: budgetHours > 0 ? (actualHours / budgetHours) * 100 : 0,
      display_order: safeNumber(budget.category_display_order),
    };
  });

  const fromActualOnly: CategoryBreakdownRow[] = actualByCategory
    .filter(a => !budgetedIds.has(a.category_id))
    .map(a => {
      const actualHours = safeNumber(a.actual_hours);
      return {
        category_id: a.category_id,
        category_name: a.category_name,
        budget_hours: 0,
        actual_hours: actualHours,
        variance: -actualHours,
        consumed_percent: 0,
        display_order: safeNumber(a.display_order),
      };
    });

  return [...fromBudget, ...fromActualOnly].sort(
    (a, b) => a.display_order - b.display_order,
  );
}
