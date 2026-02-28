/**
 * Canonical normalization helper for engagement/activity transitions.
 * Single source of truth for determining which activity to assign
 * when a user changes the engagement on a timesheet row.
 *
 * BUG 0227-67: Prevents stale ADM activity from carrying over
 * when switching from an internal to a client engagement.
 */

export interface NormalizeActivityInput {
  engagementId: string;
  currentActivityId: string;
  adminActivityId: string | null;
  activityRequired: boolean;
}

export interface NormalizeActivityResult {
  nextActivityId: string;
  wasCleared: boolean;
}

export function normalizeActivityForEngagement(input: NormalizeActivityInput): NormalizeActivityResult {
  const { currentActivityId, adminActivityId, activityRequired } = input;

  if (!activityRequired && adminActivityId) {
    return { nextActivityId: adminActivityId, wasCleared: false };
  }

  if (activityRequired && adminActivityId && currentActivityId === adminActivityId) {
    return { nextActivityId: "", wasCleared: true };
  }

  return { nextActivityId: currentActivityId, wasCleared: false };
}
