import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { safeNumber } from '@/lib/queryHelpers';
import type { SparklineDataPoint } from './Sparkline';

export interface HoursRow {
  date_worked: string;
  hours_logged: number | null;
}

export function getWeekRange(referenceDate: Date = new Date()): {
  rangeStart: Date;
  rangeEnd: Date;
} {
  const rangeStart = startOfWeek(subWeeks(referenceDate, 7), { weekStartsOn: 1 });
  const rangeEnd = endOfWeek(referenceDate, { weekStartsOn: 1 });
  return { rangeStart, rangeEnd };
}

export function getWeekStamp(referenceDate: Date = new Date()): string {
  return format(startOfWeek(referenceDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export function bucketHoursByWeek(
  rows: HoursRow[],
  referenceDate: Date = new Date(),
): SparklineDataPoint[] {
  const weekKeys: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const wk = startOfWeek(subWeeks(referenceDate, i), { weekStartsOn: 1 });
    weekKeys.push(format(wk, 'yyyy-MM-dd'));
  }

  const buckets = new Map<string, number>(weekKeys.map((k) => [k, 0]));

  for (const row of rows) {
    if (!row.date_worked) continue;
    const date = parseISO(row.date_worked);
    if (Number.isNaN(date.getTime())) continue;
    const wkStartKey = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (!buckets.has(wkStartKey)) continue;
    buckets.set(
      wkStartKey,
      (buckets.get(wkStartKey) ?? 0) + safeNumber(row.hours_logged),
    );
  }

  return weekKeys.map((k) => ({ value: buckets.get(k) ?? 0 }));
}
