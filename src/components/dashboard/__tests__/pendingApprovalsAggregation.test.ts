import { describe, it, expect } from 'vitest';
import {
  aggregateHoursByPeriodAndEngagement,
  compositeKey,
  type PendingApprovalsTimeEntryRow,
} from '../pendingApprovalsAggregation';

const row = (
  period_id: string,
  engagement_id: string,
  hours_logged: number | null,
): PendingApprovalsTimeEntryRow => ({ period_id, engagement_id, hours_logged });

describe('pendingApprovalsAggregation', () => {
  describe('aggregateHoursByPeriodAndEngagement', () => {
    it('returns an empty map when given no rows', () => {
      const result = aggregateHoursByPeriodAndEngagement([]);
      expect(result.size).toBe(0);
    });

    it('emits a single key for a single row', () => {
      const result = aggregateHoursByPeriodAndEngagement([row('p1', 'e1', 8)]);
      expect(result.size).toBe(1);
      expect(result.get(compositeKey('p1', 'e1'))).toBe(8);
    });

    it('sums multiple rows for the same (period, engagement) pair', () => {
      const result = aggregateHoursByPeriodAndEngagement([
        row('p1', 'e1', 3),
        row('p1', 'e1', 4.5),
        row('p1', 'e1', 0.5),
      ]);
      expect(result.size).toBe(1);
      expect(result.get(compositeKey('p1', 'e1'))).toBe(8);
    });

    it('keeps distinct pairs in distinct buckets', () => {
      const result = aggregateHoursByPeriodAndEngagement([
        row('p1', 'e1', 5),
        row('p1', 'e2', 10),
        row('p2', 'e1', 7),
        row('p2', 'e2', 3),
        row('p1', 'e1', 2), // sums into the first
      ]);
      expect(result.size).toBe(4);
      expect(result.get(compositeKey('p1', 'e1'))).toBe(7);
      expect(result.get(compositeKey('p1', 'e2'))).toBe(10);
      expect(result.get(compositeKey('p2', 'e1'))).toBe(7);
      expect(result.get(compositeKey('p2', 'e2'))).toBe(3);
    });

    it('coerces null hours_logged to 0', () => {
      const result = aggregateHoursByPeriodAndEngagement([
        row('p1', 'e1', null),
        row('p1', 'e1', 5),
        row('p1', 'e1', null),
      ]);
      expect(result.get(compositeKey('p1', 'e1'))).toBe(5);
    });

    it('coerces NaN and non-finite hours_logged to 0', () => {
      const result = aggregateHoursByPeriodAndEngagement([
        row('p1', 'e1', Number.NaN as unknown as number),
        row('p1', 'e1', Number.POSITIVE_INFINITY),
        row('p1', 'e1', 6),
      ]);
      expect(result.get(compositeKey('p1', 'e1'))).toBe(6);
    });

    it('skips rows with missing period_id or engagement_id', () => {
      const result = aggregateHoursByPeriodAndEngagement([
        row('', 'e1', 99),
        row('p1', '', 99),
        row('p1', 'e1', 4),
      ]);
      expect(result.size).toBe(1);
      expect(result.get(compositeKey('p1', 'e1'))).toBe(4);
    });
  });

  describe('compositeKey', () => {
    it('joins period and engagement IDs with a colon separator', () => {
      expect(compositeKey('p1', 'e1')).toBe('p1:e1');
      expect(compositeKey('uuid-period-1', 'uuid-eng-1')).toBe('uuid-period-1:uuid-eng-1');
    });

    it('does not collide for normal-shaped IDs that differ only by split position', () => {
      // compositeKey('p1', 'e1') vs compositeKey('p1e', '1') would only collide if IDs
      // contained the colon separator. Verify that distinct logical pairs map to distinct keys
      // for typical UUID/string identifiers.
      expect(compositeKey('p1', 'e1')).not.toBe(compositeKey('p1e', '1'));
      expect(compositeKey('p1', 'e1')).not.toBe(compositeKey('p', '1e1'));
    });
  });
});
