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
