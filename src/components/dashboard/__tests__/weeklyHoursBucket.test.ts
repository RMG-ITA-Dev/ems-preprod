import { describe, it, expect } from 'vitest';
import { format, startOfWeek, subWeeks } from 'date-fns';
import {
  bucketHoursByWeek,
  getWeekRange,
  getWeekStamp,
  type HoursRow,
} from '../weeklyHoursBucket';

const REF = new Date(2026, 3, 25, 12, 0, 0); // April 25, 2026 (Saturday)

const weekKeyForOffset = (weeksAgo: number): string =>
  format(startOfWeek(subWeeks(REF, weeksAgo), { weekStartsOn: 1 }), 'yyyy-MM-dd');

const row = (date_worked: string, hours_logged: number | null): HoursRow => ({
  date_worked,
  hours_logged,
});

describe('weeklyHoursBucket', () => {
  describe('bucketHoursByWeek', () => {
    it('returns 8 buckets all at 0 when given empty rows', () => {
      const result = bucketHoursByWeek([], REF);
      expect(result).toHaveLength(8);
      expect(result.every((p) => p.value === 0)).toBe(true);
    });

    it('places a single entry into its matching week bucket', () => {
      const targetWeek = weekKeyForOffset(3); // 3 weeks ago
      const result = bucketHoursByWeek([row(targetWeek, 8)], REF);
      expect(result).toHaveLength(8);
      // weekKeys are oldest→newest; offset 7 = oldest, offset 0 = newest
      // 3 weeks ago lives at index (7 - 3) = 4
      expect(result[4].value).toBe(8);
      // All other buckets remain 0
      expect(result.filter((p) => p.value !== 0)).toHaveLength(1);
    });

    it('sparse-week input yields exactly the populated buckets non-zero', () => {
      const result = bucketHoursByWeek(
        [
          row(weekKeyForOffset(7), 5), // oldest week → index 0
          row(weekKeyForOffset(4), 10), // index 3
          row(weekKeyForOffset(0), 15), // newest week → index 7
        ],
        REF,
      );
      expect(result.map((p) => p.value)).toEqual([5, 0, 0, 10, 0, 0, 0, 15]);
    });

    it('sums multiple entries in the same week', () => {
      const sameWeek = weekKeyForOffset(2);
      const result = bucketHoursByWeek(
        [row(sameWeek, 3), row(sameWeek, 4.5), row(sameWeek, 1)],
        REF,
      );
      expect(result[5].value).toBe(8.5); // index (7 - 2) = 5
      expect(result.reduce((s, p) => s + p.value, 0)).toBe(8.5);
    });

    it('ignores rows whose date falls outside the 8-week window', () => {
      const tenWeeksAgo = format(
        startOfWeek(subWeeks(REF, 10), { weekStartsOn: 1 }),
        'yyyy-MM-dd',
      );
      const oneWeekAhead = format(
        startOfWeek(subWeeks(REF, -1), { weekStartsOn: 1 }),
        'yyyy-MM-dd',
      );
      const inWindow = weekKeyForOffset(2);
      const result = bucketHoursByWeek(
        [row(tenWeeksAgo, 99), row(oneWeekAhead, 77), row(inWindow, 6)],
        REF,
      );
      expect(result.reduce((s, p) => s + p.value, 0)).toBe(6);
    });

    it('coerces null and non-finite hours_logged to 0', () => {
      const target = weekKeyForOffset(1);
      const result = bucketHoursByWeek(
        [
          row(target, null),
          row(target, 5),
          row(target, Number.NaN as unknown as number),
        ],
        REF,
      );
      expect(result[6].value).toBe(5); // index (7 - 1) = 6
    });

    it('places Monday-of-week entries in that week, not the prior one', () => {
      // The Monday IS the week start, so an entry on that day belongs to the same week.
      const mondayKey = weekKeyForOffset(2);
      const result = bucketHoursByWeek([row(mondayKey, 4)], REF);
      expect(result[5].value).toBe(4); // index (7 - 2) = 5
      expect(result.filter((p) => p.value !== 0)).toHaveLength(1);
    });
  });

  describe('getWeekRange', () => {
    it('returns rangeStart aligned to Monday and 7 weeks back from reference', () => {
      const { rangeStart, rangeEnd } = getWeekRange(REF);
      expect(rangeStart.getDay()).toBe(1); // 1 = Monday
      // rangeStart should equal startOfWeek(subWeeks(REF, 7), { weekStartsOn: 1 })
      const expectedStart = startOfWeek(subWeeks(REF, 7), { weekStartsOn: 1 });
      expect(rangeStart.getTime()).toBe(expectedStart.getTime());
      // rangeEnd is end of REF's week (Sunday)
      expect(rangeEnd.getDay()).toBe(0); // 0 = Sunday
    });
  });

  describe('getWeekStamp', () => {
    it('returns the Monday-of-week key for the reference date as YYYY-MM-DD', () => {
      const stamp = getWeekStamp(REF);
      expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(stamp).toBe(weekKeyForOffset(0));
    });
  });
});
