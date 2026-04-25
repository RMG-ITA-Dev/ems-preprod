import { safeNumber } from '@/lib/queryHelpers';

export interface PartnerRow {
  staff_id: string;
  first_name: string;
  last_name: string;
  short_name: string | null;
  initials: string | null;
}

export interface LeaderboardEngagementRow {
  engagement_id: string;
  partner_id: string;
}

export interface LeaderboardTimeEntryRow {
  engagement_id: string;
  hours_logged: number | null;
}

export interface LeaderboardWorkOrderRow {
  engagement_id: string;
  total_standard_fee: number | null;
  adjustment_amount: number | null;
}

export interface LeaderboardBudgetRow {
  engagement_id: string;
  total_budget_hours: number | null;
}

export interface PartnerMetrics {
  staffId: string;
  name: string;
  initials: string;
  totalHours: number;
  totalFees: number;
  engagementCount: number;
  atRiskCount: number;
  overBudgetCount: number;
}

interface AggregateInput {
  partners: PartnerRow[];
  engagements: LeaderboardEngagementRow[];
  timeEntries: LeaderboardTimeEntryRow[];
  workOrders: LeaderboardWorkOrderRow[];
  budgets: LeaderboardBudgetRow[];
}

const resolveName = (partner: PartnerRow): string =>
  partner.short_name && partner.short_name.length > 0
    ? partner.short_name
    : `${partner.first_name} ${partner.last_name}`;

const resolveInitials = (partner: PartnerRow): string => {
  if (partner.initials && partner.initials.length > 0) return partner.initials;
  const first = partner.first_name.charAt(0);
  const last = partner.last_name.charAt(0);
  return `${first}${last}`;
};

export function aggregatePartnerLeaderboard(input: AggregateInput): PartnerMetrics[] {
  const { partners, engagements, timeEntries, workOrders, budgets } = input;

  const partnerIdToEngagementIds = new Map<string, string[]>();
  for (const eng of engagements) {
    const list = partnerIdToEngagementIds.get(eng.partner_id);
    if (list) list.push(eng.engagement_id);
    else partnerIdToEngagementIds.set(eng.partner_id, [eng.engagement_id]);
  }

  const hoursByEng = new Map<string, number>();
  for (const te of timeEntries) {
    hoursByEng.set(te.engagement_id, (hoursByEng.get(te.engagement_id) ?? 0) + safeNumber(te.hours_logged));
  }

  const feesByEng = new Map<string, number>();
  for (const wo of workOrders) {
    const fee = safeNumber(wo.total_standard_fee) + safeNumber(wo.adjustment_amount);
    feesByEng.set(wo.engagement_id, (feesByEng.get(wo.engagement_id) ?? 0) + fee);
  }

  const budgetByEng = new Map<string, number>();
  for (const b of budgets) {
    budgetByEng.set(b.engagement_id, (budgetByEng.get(b.engagement_id) ?? 0) + safeNumber(b.total_budget_hours));
  }

  const metrics: PartnerMetrics[] = partners.map((partner) => {
    const engagementIds = partnerIdToEngagementIds.get(partner.staff_id) ?? [];

    let totalHours = 0;
    let totalFees = 0;
    let atRiskCount = 0;
    let overBudgetCount = 0;

    for (const engId of engagementIds) {
      const actual = hoursByEng.get(engId) ?? 0;
      const fees = feesByEng.get(engId) ?? 0;
      const budget = budgetByEng.get(engId) ?? 0;

      totalHours += actual;
      totalFees += fees;

      const consumption = budget > 0 ? (actual / budget) * 100 : 0;
      if (consumption > 100) {
        overBudgetCount += 1;
      } else if (consumption > 80) {
        atRiskCount += 1;
      }
    }

    return {
      staffId: partner.staff_id,
      name: resolveName(partner),
      initials: resolveInitials(partner),
      totalHours,
      totalFees,
      engagementCount: engagementIds.length,
      atRiskCount,
      overBudgetCount,
    };
  });

  metrics.sort((a, b) => {
    if (b.totalFees !== a.totalFees) return b.totalFees - a.totalFees;
    return a.staffId.localeCompare(b.staffId);
  });

  return metrics;
}
