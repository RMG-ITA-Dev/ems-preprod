import { describe, it, expect } from "vitest";
import { normalizeActivityForEngagement } from "../timesheetActivityRules";

const ADM_ID = "adm-activity-id";
const CLIENT_ACT = "client-activity-123";

describe("normalizeActivityForEngagement", () => {
  it("assigns adminActivityId when activity not required", () => {
    const result = normalizeActivityForEngagement({
      engagementId: "eng-internal",
      currentActivityId: "",
      adminActivityId: ADM_ID,
      activityRequired: false,
    });
    expect(result).toEqual({ nextActivityId: ADM_ID, wasCleared: false });
  });

  it("clears activity when required and current is admin", () => {
    const result = normalizeActivityForEngagement({
      engagementId: "eng-client",
      currentActivityId: ADM_ID,
      adminActivityId: ADM_ID,
      activityRequired: true,
    });
    expect(result).toEqual({ nextActivityId: "", wasCleared: true });
  });

  it("preserves non-admin activity when required", () => {
    const result = normalizeActivityForEngagement({
      engagementId: "eng-client",
      currentActivityId: CLIENT_ACT,
      adminActivityId: ADM_ID,
      activityRequired: true,
    });
    expect(result).toEqual({ nextActivityId: CLIENT_ACT, wasCleared: false });
  });

  it("returns empty when required and current is empty", () => {
    const result = normalizeActivityForEngagement({
      engagementId: "eng-client",
      currentActivityId: "",
      adminActivityId: ADM_ID,
      activityRequired: true,
    });
    expect(result).toEqual({ nextActivityId: "", wasCleared: false });
  });

  it("falls back safely when adminActivityId is null", () => {
    const result = normalizeActivityForEngagement({
      engagementId: "eng-internal",
      currentActivityId: "",
      adminActivityId: null,
      activityRequired: false,
    });
    expect(result).toEqual({ nextActivityId: "", wasCleared: false });
  });

  it("handles internal->client->internal transition sequence", () => {
    // Step 1: Select internal engagement (not required)
    const step1 = normalizeActivityForEngagement({
      engagementId: "eng-internal",
      currentActivityId: "",
      adminActivityId: ADM_ID,
      activityRequired: false,
    });
    expect(step1.nextActivityId).toBe(ADM_ID);

    // Step 2: Switch to client engagement (required) — should clear ADM
    const step2 = normalizeActivityForEngagement({
      engagementId: "eng-client",
      currentActivityId: step1.nextActivityId,
      adminActivityId: ADM_ID,
      activityRequired: true,
    });
    expect(step2.nextActivityId).toBe("");
    expect(step2.wasCleared).toBe(true);

    // Step 3: Switch back to internal — should reassign ADM
    const step3 = normalizeActivityForEngagement({
      engagementId: "eng-internal",
      currentActivityId: step2.nextActivityId,
      adminActivityId: ADM_ID,
      activityRequired: false,
    });
    expect(step3.nextActivityId).toBe(ADM_ID);
  });
});
