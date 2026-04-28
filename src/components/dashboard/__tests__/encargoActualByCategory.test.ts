import { describe, it, expect } from 'vitest';
import {
  aggregateActualHoursByCategory,
  type ActualHoursTimeEntryRow,
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
