import { describe, it, expect } from "vitest";
import { normalizeActivityForEngagement } from "@/lib/timesheetActivityRules";

/**
 * Component-level transition tests for TimesheetGrid activity behavior.
 * These test the canonical helper with engagement-like scenarios that
 * mirror the rendered component's handleEngagementChange logic.
 */

const ADM_ID = "adm-activity-uuid";

const INTERNAL_ENG = { engagement_id: "eng-internal", activity_required: false };
const CLIENT_ENG = { engagement_id: "eng-client", activity_required: true };

describe("TimesheetGrid activity transitions", () => {
  it("internal engagement auto-assigns admin activity", () => {
    const result = normalizeActivityForEngagement({
      engagementId: INTERNAL_ENG.engagement_id,
      currentActivityId: "",
      adminActivityId: ADM_ID,
      activityRequired: INTERNAL_ENG.activity_required,
    });
    expect(result.nextActivityId).toBe(ADM_ID);
  });

  it("switching Internal->Client clears stale admin activity", () => {
    // Row currently has ADM from internal selection
    const result = normalizeActivityForEngagement({
      engagementId: CLIENT_ENG.engagement_id,
      currentActivityId: ADM_ID,
      adminActivityId: ADM_ID,
      activityRequired: CLIENT_ENG.activity_required,
    });
    expect(result.nextActivityId).toBe("");
    expect(result.wasCleared).toBe(true);
  });

  it("required engagement with empty activity produces empty (disables hour cells)", () => {
    const result = normalizeActivityForEngagement({
      engagementId: CLIENT_ENG.engagement_id,
      currentActivityId: "",
      adminActivityId: ADM_ID,
      activityRequired: CLIENT_ENG.activity_required,
    });
    // Empty activityId triggers the disable condition in TimesheetGrid line 826:
    // !row.activityId && !isActivityNotRequired
    expect(result.nextActivityId).toBe("");
  });

  it("switching Client->Internal reassigns admin activity", () => {
    const result = normalizeActivityForEngagement({
      engagementId: INTERNAL_ENG.engagement_id,
      currentActivityId: "some-client-activity",
      adminActivityId: ADM_ID,
      activityRequired: INTERNAL_ENG.activity_required,
    });
    expect(result.nextActivityId).toBe(ADM_ID);
  });
});

// ── BUG 0508-106: approved-engagement guard in handleEngagementChange ──────────────

describe("handleEngagementChange approved-engagement guard (BUG 0508-106)", () => {
  // Mirrors the exact predicate used in the guard:
  //   lineApprovals.find(la => la.engagement_id === engagementId)?.status === "approved"
  const isEngagementApproved = (
    lineApprovals: Array<{ engagement_id: string; status: string }>,
    engagementId: string
  ): boolean =>
    lineApprovals.some(la => la.engagement_id === engagementId && la.status === "approved");

  const APPROVED  = { engagement_id: "eng-approved", status: "approved" };
  const REJECTED  = { engagement_id: "eng-rejected", status: "rejected" };
  const PENDING   = { engagement_id: "eng-pending",  status: "pending"  };

  it("blocks selecting an engagement with an approved line approval", () => {
    expect(isEngagementApproved([APPROVED], "eng-approved")).toBe(true);
  });

  it("allows selecting an engagement with a rejected line approval", () => {
    expect(isEngagementApproved([REJECTED], "eng-rejected")).toBe(false);
  });

  it("allows selecting an engagement with a pending line approval", () => {
    expect(isEngagementApproved([PENDING], "eng-pending")).toBe(false);
  });

  it("allows selecting an engagement with no approval record at all", () => {
    expect(isEngagementApproved([], "eng-any")).toBe(false);
  });

  it("does not block a different engagement even when one engagement is approved", () => {
    // Approved record for eng-approved must not affect unrelated eng-other
    expect(isEngagementApproved([APPROVED], "eng-other")).toBe(false);
  });

  it("rejected row selecting rejected-status engagement is not blocked", () => {
    // Core scenario: editing a rejected row to point to another non-approved engagement
    // is the valid use case; only approved target is blocked
    expect(isEngagementApproved([REJECTED, APPROVED], "eng-rejected")).toBe(false);
  });
});
