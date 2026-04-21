import type { ApprovedEngagement } from "@/hooks/useTimesheetWeek";

export function sortEngagements(
  engagements: ApprovedEngagement[]
): ApprovedEngagement[] {
  return [...engagements].sort((a, b) => {
    const ca = a.client?.client_legal_name ?? "";
    const cb = b.client?.client_legal_name ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    const ea = a.engagement_code ?? a.engagement_name;
    const eb = b.engagement_code ?? b.engagement_name;
    return ea.localeCompare(eb);
  });
}
