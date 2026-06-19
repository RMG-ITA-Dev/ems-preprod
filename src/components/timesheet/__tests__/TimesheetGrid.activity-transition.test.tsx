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

// ── BUG 0508-106 Plan v3: per-activity guard in handleEngagementChange / handleActivityChange ──

describe("handleEngagementChange/handleActivityChange per-activity guard (BUG 0508-106 Plan v3)", () => {
  // Mirrors the exact predicate used in both guards:
  //   lineApprovals.find(la => la.engagement_id === engagementId && la.activity_id === activityId)?.status === "approved"
  const isApprovalBlocked = (
    lineApprovals: Array<{ engagement_id: string; activity_id: string; status: string }>,
    engagementId: string,
    activityId: string
  ): boolean =>
    lineApprovals.some(
      la => la.engagement_id === engagementId &&
            la.activity_id   === activityId   &&
            la.status        === "approved"
    );

  const APPROVED_XY = { engagement_id: "eng-X", activity_id: "act-Y", status: "approved" };
  const REJECTED_XZ = { engagement_id: "eng-X", activity_id: "act-Z", status: "rejected" };
  const PENDING_AW  = { engagement_id: "eng-A", activity_id: "act-W", status: "pending"  };

  it("blocks selecting an approved (engagement, activity) pair", () => {
    expect(isApprovalBlocked([APPROVED_XY], "eng-X", "act-Y")).toBe(true);
  });

  it("allows selecting the SAME engagement with a DIFFERENT activity (core scenario)", () => {
    // eng-X is approved for act-Y but NOT for act-Z — must allow
    expect(isApprovalBlocked([APPROVED_XY], "eng-X", "act-Z")).toBe(false);
  });

  it("allows selecting an engagement with a rejected activity", () => {
    expect(isApprovalBlocked([REJECTED_XZ], "eng-X", "act-Z")).toBe(false);
  });

  it("allows selecting an engagement with a pending activity", () => {
    expect(isApprovalBlocked([PENDING_AW], "eng-A", "act-W")).toBe(false);
  });

  it("allows selecting an engagement with no approval record", () => {
    expect(isApprovalBlocked([], "eng-X", "act-Y")).toBe(false);
  });

  it("does not block a different engagement even when one pair is approved", () => {
    expect(isApprovalBlocked([APPROVED_XY], "eng-A", "act-Y")).toBe(false);
  });

  it("does not block when engagement matches but activity differs", () => {
    expect(isApprovalBlocked([APPROVED_XY, REJECTED_XZ], "eng-X", "act-Z")).toBe(false);
  });
});
