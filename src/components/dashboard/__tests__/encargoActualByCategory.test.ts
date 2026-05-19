import { describe, it, expect } from 'vitest';
import {
  aggregateActualHoursByCategory,
  mergeCategoryBreakdown,
  type ActualHoursTimeEntryRow,
  type CategoryBudgetRow,
} from '../encargoActualByCategory';

const row = (
  hours_logged: number | null,
  category: { category_id: string; category_name?: string | null; display_order?: number | null } | null,
): ActualHoursTimeEntryRow => ({
  hours_logged,
  staff: category
    ? {
        category: {
          category_id: category.category_id,
          category_name: category.category_name ?? null,
          display_order: category.display_order ?? null,
        },
      }
    : null,
});

describe('aggregateActualHoursByCategory', () => {
  it('returns [] when given no rows', () => {
    expect(aggregateActualHoursByCategory([])).toEqual([]);
  });

  it('produces a single row for a single time entry', () => {
    const result = aggregateActualHoursByCategory([
      row(8, { category_id: 'c1', category_name: 'Senior', display_order: 3 }),
    ]);
    expect(result).toEqual([
      { category_id: 'c1', category_name: 'Senior', actual_hours: 8, display_order: 3 },
    ]);
  });

  it('sums multiple rows for the same category', () => {
    const result = aggregateActualHoursByCategory([
      row(3, { category_id: 'c1', category_name: 'Senior', display_order: 3 }),
      row(4.5, { category_id: 'c1', category_name: 'Senior', display_order: 3 }),
      row(0.5, { category_id: 'c1', category_name: 'Senior', display_order: 3 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].actual_hours).toBe(8);
  });

  it('sorts multiple categories ascending by display_order', () => {
    const result = aggregateActualHoursByCategory([
      row(10, { category_id: 'cZ', category_name: 'Partner', display_order: 1 }),
      row(20, { category_id: 'cA', category_name: 'Junior', display_order: 5 }),
      row(15, { category_id: 'cM', category_name: 'Manager', display_order: 2 }),
    ]);
    expect(result.map((r) => r.category_id)).toEqual(['cZ', 'cM', 'cA']);
    expect(result.map((r) => r.display_order)).toEqual([1, 2, 5]);
  });

  it('coerces null and non-finite hours_logged to 0', () => {
    const result = aggregateActualHoursByCategory([
      row(null, { category_id: 'c1', category_name: 'Senior', display_order: 3 }),
      row(Number.NaN as unknown as number, { category_id: 'c1', category_name: 'Senior', display_order: 3 }),
      row(7, { category_id: 'c1', category_name: 'Senior', display_order: 3 }),
    ]);
    expect(result[0].actual_hours).toBe(7);
  });

  it('drops rows whose staff or category is missing', () => {
    const result = aggregateActualHoursByCategory([
      row(99, null), // staff is null
      { hours_logged: 99, staff: { category: null } }, // category is null
      row(5, { category_id: 'c1', category_name: 'Senior', display_order: 3 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].actual_hours).toBe(5);
  });

  it('defaults missing display_order to 99 and missing category_name to empty string', () => {
    const result = aggregateActualHoursByCategory([
      row(4, { category_id: 'c1', category_name: null, display_order: null }),
    ]);
    expect(result[0].display_order).toBe(99);
    expect(result[0].category_name).toBe('');
  });
});

// Helper to build CategoryBudgetRow fixtures
const budgetRow = (
  category_id: string,
  category_name: string,
  total_budget_hours: number | null,
  category_display_order: number | null,
): CategoryBudgetRow => ({
  category_id,
  category_name,
  total_budget_hours,
  category_display_order,
});

const actualRow = (
  category_id: string,
  category_name: string,
  actual_hours: number,
  display_order: number,
) => ({ category_id, category_name, actual_hours, display_order });

describe('mergeCategoryBreakdown', () => {
  it('returns [] when both inputs are empty', () => {
    expect(mergeCategoryBreakdown([], [])).toEqual([]);
  });

  it('returns budget-only rows with actual_hours=0 when actuals are empty', () => {
    const result = mergeCategoryBreakdown(
      [budgetRow('c1', 'Senior', 70, 4)],
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category_id: 'c1',
      budget_hours: 70,
      actual_hours: 0,
      variance: 70,
      consumed_percent: 0,
    });
  });

  it('returns actual-only rows with budget_hours=0 when budget is empty — core bug scenario', () => {
    const result = mergeCategoryBreakdown(
      [],
      [actualRow('semi', 'Semi-Senior', 9.5, 3)],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category_id: 'semi',
      category_name: 'Semi-Senior',
      budget_hours: 0,
      actual_hours: 9.5,
      variance: -9.5,
      consumed_percent: 0,
    });
  });

  it('merges matching category — variance and consumed_percent are correct', () => {
    const result = mergeCategoryBreakdown(
      [budgetRow('c1', 'Gerente', 37, 2)],
      [actualRow('c1', 'Gerente', 40, 2)],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      budget_hours: 37,
      actual_hours: 40,
      variance: -3,
      consumed_percent: expect.closeTo((40 / 37) * 100, 5),
    });
  });

  it('includes both budgeted and unbudgeted categories — exact Semi-Senior scenario', () => {
    const result = mergeCategoryBreakdown(
      [
        budgetRow('socio', 'Socio', 7, 1),
        budgetRow('gerente', 'Gerente', 37, 2),
      ],
      [
        actualRow('socio', 'Socio', 30, 1),
        actualRow('semi', 'Semi-Senior', 9.5, 3),
      ],
    );
    const ids = result.map(r => r.category_id);
    expect(ids).toContain('semi');
    expect(ids).toContain('socio');
    expect(ids).toContain('gerente');
    const semi = result.find(r => r.category_id === 'semi')!;
    expect(semi.budget_hours).toBe(0);
    expect(semi.actual_hours).toBe(9.5);
    expect(semi.variance).toBe(-9.5);
  });

  it('sorts all rows ascending by display_order regardless of which side they come from', () => {
    const result = mergeCategoryBreakdown(
      [budgetRow('c5', 'Asistente', 75, 5)],
      [
        actualRow('c1', 'Socio', 30, 1),
        actualRow('c3', 'Semi-Senior', 9.5, 3),
      ],
    );
    expect(result.map(r => r.display_order)).toEqual([1, 3, 5]);
  });

  it('does not produce duplicate rows when the same category_id appears in both inputs', () => {
    const result = mergeCategoryBreakdown(
      [budgetRow('c1', 'Senior', 70, 4)],
      [actualRow('c1', 'Senior', 20, 4)],
    );
    expect(result.filter(r => r.category_id === 'c1')).toHaveLength(1);
  });

  it('coerces null numeric fields — budget/variance to 0, display_order defaults to 99', () => {
    const result = mergeCategoryBreakdown(
      [budgetRow('c1', 'Senior', null, null)],
      [],
    );
    expect(result[0].budget_hours).toBe(0);
    expect(result[0].display_order).toBe(99);
    expect(result[0].variance).toBe(0);
  });
});
