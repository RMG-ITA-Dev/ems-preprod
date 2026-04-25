import { describe, it, expect } from 'vitest';
import {
  aggregatePartnerLeaderboard,
  type PartnerRow,
  type LeaderboardEngagementRow,
  type LeaderboardTimeEntryRow,
  type LeaderboardWorkOrderRow,
  type LeaderboardBudgetRow,
} from '../practicaLeaderboard';

const partner = (overrides: Partial<PartnerRow> & { staff_id: string }): PartnerRow => ({
  first_name: 'First',
  last_name: 'Last',
  short_name: null,
  initials: null,
  ...overrides,
});

const eng = (engagement_id: string, partner_id: string): LeaderboardEngagementRow => ({
  engagement_id,
  partner_id,
});

const te = (engagement_id: string, hours_logged: number | null): LeaderboardTimeEntryRow => ({
  engagement_id,
  hours_logged,
});

const wo = (
  engagement_id: string,
  total_standard_fee: number | null,
  adjustment_amount: number | null,
): LeaderboardWorkOrderRow => ({
  engagement_id,
  total_standard_fee,
  adjustment_amount,
});

const bud = (engagement_id: string, total_budget_hours: number | null): LeaderboardBudgetRow => ({
  engagement_id,
  total_budget_hours,
});

const empty = {
  engagements: [] as LeaderboardEngagementRow[],
  timeEntries: [] as LeaderboardTimeEntryRow[],
  workOrders: [] as LeaderboardWorkOrderRow[],
  budgets: [] as LeaderboardBudgetRow[],
};

describe('aggregatePartnerLeaderboard', () => {
  it('returns [] when there are no partners', () => {
    const result = aggregatePartnerLeaderboard({ partners: [], ...empty });
    expect(result).toEqual([]);
  });

  it('emits a zeroed row for a partner with no engagements', () => {
    const result = aggregatePartnerLeaderboard({
      partners: [partner({ staff_id: 'p1', first_name: 'Alice', last_name: 'Anderson' })],
      ...empty,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      staffId: 'p1',
      totalHours: 0,
      totalFees: 0,
      engagementCount: 0,
      atRiskCount: 0,
      overBudgetCount: 0,
    });
  });

  it('zeroes out a partner whose engagements have no time/WO/budget rows', () => {
    const result = aggregatePartnerLeaderboard({
      partners: [partner({ staff_id: 'p1', first_name: 'Alice', last_name: 'Anderson' })],
      engagements: [eng('e1', 'p1')],
      timeEntries: [],
      workOrders: [],
      budgets: [],
    });
    expect(result[0]).toMatchObject({
      engagementCount: 1,
      totalHours: 0,
      totalFees: 0,
      atRiskCount: 0,
      overBudgetCount: 0,
    });
  });

  it('splits at-risk and over-budget into mutually exclusive buckets', () => {
    // 3 engagements: 50%, 90%, 110% consumption
    const result = aggregatePartnerLeaderboard({
      partners: [partner({ staff_id: 'p1', first_name: 'Alice', last_name: 'Anderson' })],
      engagements: [eng('e50', 'p1'), eng('e90', 'p1'), eng('e110', 'p1')],
      timeEntries: [te('e50', 50), te('e90', 90), te('e110', 110)],
      workOrders: [],
      budgets: [bud('e50', 100), bud('e90', 100), bud('e110', 100)],
    });
    expect(result[0].engagementCount).toBe(3);
    expect(result[0].atRiskCount).toBe(1);
    expect(result[0].overBudgetCount).toBe(1);
    // Sum of buckets must not exceed engagement count (mutual exclusivity)
    expect(result[0].atRiskCount + result[0].overBudgetCount).toBeLessThanOrEqual(
      result[0].engagementCount,
    );
  });

  it('respects boundary conditions at 80%, 100%, and just above 100%', () => {
    const result = aggregatePartnerLeaderboard({
      partners: [partner({ staff_id: 'p1', first_name: 'Alice', last_name: 'Anderson' })],
      engagements: [eng('e80', 'p1'), eng('e100', 'p1'), eng('e100p', 'p1')],
      timeEntries: [te('e80', 80), te('e100', 100), te('e100p', 100.0001)],
      workOrders: [],
      budgets: [bud('e80', 100), bud('e100', 100), bud('e100p', 100)],
    });
    // 80%: not counted (rule is strict > 80)
    // 100%: at-risk (rule is > 80 && <= 100)
    // 100.0001%: over-budget
    expect(result[0].atRiskCount).toBe(1);
    expect(result[0].overBudgetCount).toBe(1);
  });

  it('sorts partners by totalFees descending with stable tie-breaking by staffId', () => {
    const result = aggregatePartnerLeaderboard({
      partners: [
        partner({ staff_id: 'pA', first_name: 'A', last_name: 'A' }),
        partner({ staff_id: 'pB', first_name: 'B', last_name: 'B' }),
        partner({ staff_id: 'pC', first_name: 'C', last_name: 'C' }),
      ],
      engagements: [eng('e1', 'pA'), eng('e2', 'pB'), eng('e3', 'pC')],
      timeEntries: [],
      workOrders: [
        wo('e1', 1000, 0),
        wo('e2', 5000, 0),
        wo('e3', 1000, 0),
      ],
      budgets: [],
    });
    expect(result.map((r) => r.staffId)).toEqual(['pB', 'pA', 'pC']);
  });

  it('coerces null numerics to 0 across hours, fees, and budgets', () => {
    const result = aggregatePartnerLeaderboard({
      partners: [partner({ staff_id: 'p1', first_name: 'Alice', last_name: 'Anderson' })],
      engagements: [eng('e1', 'p1')],
      timeEntries: [te('e1', null), te('e1', 10)],
      workOrders: [wo('e1', null, null), wo('e1', 100, null), wo('e1', null, 50)],
      budgets: [bud('e1', null), bud('e1', 200)],
    });
    expect(result[0].totalHours).toBe(10);
    expect(result[0].totalFees).toBe(150);
    // consumption = 10 / 200 = 5% → neither bucket
    expect(result[0].atRiskCount).toBe(0);
    expect(result[0].overBudgetCount).toBe(0);
  });

  it('sums multi-category budget rows per engagement before computing consumption', () => {
    // vw_wo_budget_hours_by_category returns one row per (engagement_id, category)
    // Aggregator must sum to a single per-engagement budget total.
    const result = aggregatePartnerLeaderboard({
      partners: [partner({ staff_id: 'p1', first_name: 'Alice', last_name: 'Anderson' })],
      engagements: [eng('e1', 'p1')],
      timeEntries: [te('e1', 90)],
      workOrders: [],
      budgets: [
        bud('e1', 40), // category 1
        bud('e1', 60), // category 2 → total budget 100
      ],
    });
    // 90 / 100 = 90% → at-risk
    expect(result[0].atRiskCount).toBe(1);
    expect(result[0].overBudgetCount).toBe(0);
  });

  it('falls back for missing display name and initials', () => {
    const result = aggregatePartnerLeaderboard({
      partners: [
        partner({
          staff_id: 'p1',
          first_name: 'Alice',
          last_name: 'Anderson',
          short_name: null,
          initials: null,
        }),
        partner({
          staff_id: 'p2',
          first_name: 'Bob',
          last_name: 'Brown',
          short_name: 'Bobby',
          initials: 'BB',
        }),
      ],
      ...empty,
    });
    const p1 = result.find((r) => r.staffId === 'p1')!;
    const p2 = result.find((r) => r.staffId === 'p2')!;
    expect(p1.name).toBe('Alice Anderson');
    expect(p1.initials).toBe('AA');
    expect(p2.name).toBe('Bobby');
    expect(p2.initials).toBe('BB');
  });
});
