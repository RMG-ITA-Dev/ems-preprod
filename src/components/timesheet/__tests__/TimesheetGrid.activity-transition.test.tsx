import { describe, it, expect } from "vitest";
import { normalizeActivityForEngagement } from "@/lib/timesheetActivityRules";
import { filterActivitiesForEngagement } from "@/lib/activityFilters";

/**
 * Component-level transition tests for TimesheetGrid activity behavior.
 * These test the canonical helper with engagement-like scenarios that
 * mirror the rendered component's handleEngagementChange logic.
 */

const ADM_ID = "adm-activity-uuid";

// engagements.funcion: 0 administrativa, 1 cliente (0827-184). `activityRequired` below is
// derived the same way TimesheetGrid.handleEngagementChange does it — funcion == null || funcion
// === 1 — not read from a stored activity_required flag.
const INTERNAL_ENG = { engagement_id: "eng-internal", funcion: 0 };
const CLIENT_ENG = { engagement_id: "eng-client", funcion: 1 };

const activityRequiredFor = (funcion: number) => funcion == null || funcion === 1;

describe("TimesheetGrid activity transitions", () => {
  it("internal engagement auto-assigns admin activity", () => {
    const result = normalizeActivityForEngagement({
      engagementId: INTERNAL_ENG.engagement_id,
      currentActivityId: "",
      adminActivityId: ADM_ID,
      activityRequired: activityRequiredFor(INTERNAL_ENG.funcion),
    });
    expect(result.nextActivityId).toBe(ADM_ID);
  });

  it("switching Internal->Client clears stale admin activity", () => {
    // Row currently has ADM from internal selection
    const result = normalizeActivityForEngagement({
      engagementId: CLIENT_ENG.engagement_id,
      currentActivityId: ADM_ID,
      adminActivityId: ADM_ID,
      activityRequired: activityRequiredFor(CLIENT_ENG.funcion),
    });
    expect(result.nextActivityId).toBe("");
    expect(result.wasCleared).toBe(true);
  });

  it("required engagement with empty activity produces empty (disables hour cells)", () => {
    const result = normalizeActivityForEngagement({
      engagementId: CLIENT_ENG.engagement_id,
      currentActivityId: "",
      adminActivityId: ADM_ID,
      activityRequired: activityRequiredFor(CLIENT_ENG.funcion),
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
      activityRequired: activityRequiredFor(INTERNAL_ENG.funcion),
    });
    expect(result.nextActivityId).toBe(ADM_ID);
  });
});

// Review iteración 3 (0827-184): handleEngagementChange's full activity resolution is
// normalizeActivityForEngagement followed by a validity check against
// filterActivitiesForEngagement (without preserving the current selection) — the same combined
// check applied in TrackerBar/TrackerEdit's fix for the equivalent stale-activity bug. This
// mirrors that resolution to pin the regression a review caught: an activity carried over from
// the previous engagement was NOT cleared when the new engagement's funcion was null (legacy,
// unset) as long as its service happened to still match the new practica — defeating the
// fail-closed rule for legacy engagements even though the Select itself showed disabled.
describe("handleEngagementChange resolved activity validity (0827-184, iteración 3)", () => {
  const AUD_1 = { activity_id: "aud-1", is_system: false, service: { code: 1 } };
  const ADM = { activity_id: ADM_ID, is_system: true, service: null as { code: number } | null };
  const ACTIVITIES = [AUD_1, ADM];

  function resolveActivity(
    funcion: number | null,
    practica: number | null,
    currentActivityId: string,
  ): string {
    const { nextActivityId } = normalizeActivityForEngagement({
      engagementId: "eng-x",
      currentActivityId,
      adminActivityId: ADM_ID,
      activityRequired: funcion == null || funcion === 1,
    });
    if (!nextActivityId) return nextActivityId;
    const stillValid = filterActivitiesForEngagement(ACTIVITIES, funcion, practica).some(
      (a) => a.activity_id === nextActivityId,
    );
    return stillValid ? nextActivityId : "";
  }

  it("clears a practica-matching activity when the new engagement's funcion is null (legacy, unset)", () => {
    expect(resolveActivity(null, 1, "aud-1")).toBe("");
  });

  it("keeps a practica-matching activity when the new engagement is funcion === 1 (cliente)", () => {
    expect(resolveActivity(1, 1, "aud-1")).toBe("aud-1");
  });

  it("clears a practica-mismatching activity when the new engagement is funcion === 1 (cliente)", () => {
    expect(resolveActivity(1, 2, "aud-1")).toBe("");
  });

  it("keeps ADM when the new engagement is funcion 0/2/3 (administrativa/capacitación/calidad)", () => {
    expect(resolveActivity(0, null, ADM_ID)).toBe(ADM_ID);
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
