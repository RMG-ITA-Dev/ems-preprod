// Phase 7 — viewer-scoped cross-engagement timeline for ONE staff member
// (plan §2). Same F-09 contract as the L1 hook: failures throw typed
// errors, never swallow to [].
//
// VIEWER-KEYED (D-P7-9; adversarial review P1-01, the PR #224 P1-01
// heritage): the response is viewer-scoped, and the app-level QueryClient
// survives an in-SPA account switch — a viewer-agnostic key would replay
// viewer A's privileged timeline to viewer B during the fresh window.
// The key includes the authenticated user.id and `enabled` requires it,
// exactly like the Gaps hooks and useStaffAssignmentSegments.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { SCHEDULER_STAFF_TIMELINE_KEY } from "./keys";
import {
  invokeSchedulerData,
  SchedulerDataError,
  SchedulerUnavailableError,
  type StaffTimelineResult,
} from "./schedulerData";

export interface StaffTimelineInput {
  staffId: string | undefined;
  from: string; // yyyy-MM-dd
  to: string; // yyyy-MM-dd
}

const DETERMINISTIC_CODES = new Set([
  "bad_request",
  "forbidden",
  "not_found",
  "unauthorized",
]);
const DETERMINISTIC_STATUSES = new Set([400, 401, 403, 404]);

/**
 * Exported for unit tests (D-P7-13; adversarial review P2-02).
 * Deterministic outcomes must not retry whether classified by envelope
 * CODE or by bare HTTP STATUS: a gateway/auth 400/403/404 WITHOUT the EMS
 * envelope maps to SchedulerDataError("unknown", ..., status) — code-only
 * classification would retry it despite it being just as deterministic.
 * 401/unauthorized is deterministic too: a revoked session won't heal
 * between attempts — the session-recovery boundary (App.tsx +
 * src/lib/sessionRecovery.ts) handles it, and retrying only pumps more
 * doomed 401s while recovery runs.
 * Unavailable never retries (a missing deployment won't heal between
 * attempts); everything else (e.g. a transient 500) retries < 2.
 */
export function shouldRetryStaffTimeline(
  failureCount: number,
  error: Error
): boolean {
  if (error instanceof SchedulerUnavailableError) return false;
  if (
    error instanceof SchedulerDataError &&
    (DETERMINISTIC_CODES.has(error.code) ||
      (error.status !== undefined && DETERMINISTIC_STATUSES.has(error.status)))
  ) {
    return false;
  }
  return failureCount < 2;
}

export function useSchedulerStaffTimeline(input: StaffTimelineInput) {
  const { user } = useAuth();
  const viewerId = user?.id;
  return useQuery<StaffTimelineResult, Error>({
    queryKey: [
      SCHEDULER_STAFF_TIMELINE_KEY,
      viewerId,
      input.staffId,
      input.from,
      input.to,
    ],
    queryFn: () =>
      invokeSchedulerData<StaffTimelineResult>({
        action: "scheduler-staff-timeline",
        staffId: input.staffId,
        startDate: input.from,
        endDate: input.to,
      }),
    enabled: Boolean(viewerId && input.staffId && input.from && input.to),
    staleTime: 60_000,
    retry: shouldRetryStaffTimeline,
  });
}
