import { safeNumber } from '@/lib/queryHelpers';

export interface PendingApprovalsTimeEntryRow {
  period_id: string;
  engagement_id: string;
  hours_logged: number | null;
}

export function compositeKey(periodId: string, engagementId: string): string {
  return `${periodId}:${engagementId}`;
}

export function aggregateHoursByPeriodAndEngagement(
  rows: PendingApprovalsTimeEntryRow[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    if (!row.period_id || !row.engagement_id) continue;
    const key = compositeKey(row.period_id, row.engagement_id);
    result.set(key, (result.get(key) ?? 0) + safeNumber(row.hours_logged));
  }
  return result;
}
