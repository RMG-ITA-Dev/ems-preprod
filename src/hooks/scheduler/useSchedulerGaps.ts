// Phase 6 — gaps hooks (plan §4.3): four viewer-keyed queries, one per
// scheduler-gaps action, on the F-09 THROW model (useSchedulerL1's
// contract, NOT useStaffAssignmentSegments' advisory inversion — gap
// reporting is a primary surface, and an error must render as an error).
//
// Every query key includes the authenticated user.id and `enabled`
// requires it (I-P6-4; PR #224 P1-01): viewer-agnostic keys on
// privileged data survive an in-SPA account switch, because the
// module-level QueryClient outlives sign-out.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { SCHEDULER_GAPS_KEY } from "./keys";
import { SchedulerDataError, SchedulerUnavailableError } from "./schedulerData";
import {
  invokeSchedulerGaps,
  parseBenchResult,
  parseCategoryHeadcountGapResult,
  parseCategoryHoursGapResult,
  parseCompetencyShortageResult,
  windowDaysBetween,
  type BenchResult,
  type CategoryHeadcountGapResult,
  type CategoryHoursGapResult,
  type CompetencyShortageResult,
} from "./schedulerGapsData";

export interface GapsWindowInput {
  from: string; // yyyy-MM-dd
  to: string; // yyyy-MM-dd
  /** The page passes roleResolved && canView (D-P6-19): zero privileged
   *  calls while the role is loading, after a role-query error, or for a
   *  resolved-ineligible viewer. The server 403 remains the
   *  authoritative control (I-P6-2); this avoids firing known-doomed
   *  requests. */
  enabled: boolean;
}

// 5-min tier per docs/scheduler-objective.md "React Query staleTime":
// gap reports are expensive and don't change second-to-second.
const GAPS_STALE_TIME = 300_000;

// No retry on Unavailable (a missing deployment won't heal between
// attempts) NOR on deterministic failures. Classification is by ERROR
// CODE, not status presence (GPT-5.6 revalidation P2-01): errors born
// from a 2xx body — malformed_response from the validators, or a typed
// envelope inside a success body — carry no HTTP status, and retrying
// them fires up to 12 known-doomed privileged calls across the four
// report queries while delaying the terminal state by seconds. The
// status check stays as a belt for enveloped non-2xx errors.
const DETERMINISTIC_GAPS_CODES = new Set([
  "malformed_response",
  "forbidden",
  "bad_request",
  "schema_not_ready",
  // A revoked session won't heal between attempts — the session-recovery
  // boundary (App.tsx + src/lib/sessionRecovery.ts) handles it, and
  // retrying only pumps more doomed 401s while recovery runs.
  "unauthorized",
]);

const gapsRetry = (failureCount: number, error: Error) =>
  !(error instanceof SchedulerUnavailableError) &&
  !(
    error instanceof SchedulerDataError &&
    (DETERMINISTIC_GAPS_CODES.has(error.code) ||
      error.status === 403 ||
      error.status === 401 ||
      error.status === 400)
  ) &&
  failureCount < 2;

export function useCategoryHeadcountGap(input: GapsWindowInput) {
  const { user } = useAuth();
  const viewerId = user?.id;
  return useQuery<CategoryHeadcountGapResult, Error>({
    queryKey: [SCHEDULER_GAPS_KEY, "category-headcount-gap", viewerId, input.from, input.to],
    queryFn: async () =>
      parseCategoryHeadcountGapResult(
        await invokeSchedulerGaps({
          action: "category-headcount-gap",
          startDate: input.from,
          endDate: input.to,
        }),
        windowDaysBetween(input.from, input.to)
      ),
    enabled: input.enabled && !!viewerId && !!input.from && !!input.to,
    staleTime: GAPS_STALE_TIME,
    retry: gapsRetry,
  });
}

export function useCategoryHoursGap(input: GapsWindowInput) {
  const { user } = useAuth();
  const viewerId = user?.id;
  return useQuery<CategoryHoursGapResult, Error>({
    queryKey: [SCHEDULER_GAPS_KEY, "category-hours-gap", viewerId, input.from, input.to],
    queryFn: async () =>
      parseCategoryHoursGapResult(
        await invokeSchedulerGaps({
          action: "category-hours-gap",
          startDate: input.from,
          endDate: input.to,
        })
      ),
    enabled: input.enabled && !!viewerId && !!input.from && !!input.to,
    staleTime: GAPS_STALE_TIME,
    retry: gapsRetry,
  });
}

export function useCompetencyShortage(input: GapsWindowInput) {
  const { user } = useAuth();
  const viewerId = user?.id;
  return useQuery<CompetencyShortageResult, Error>({
    queryKey: [SCHEDULER_GAPS_KEY, "competency-shortage", viewerId, input.from, input.to],
    queryFn: async () =>
      parseCompetencyShortageResult(
        await invokeSchedulerGaps({
          action: "competency-shortage",
          startDate: input.from,
          endDate: input.to,
        })
      ),
    enabled: input.enabled && !!viewerId && !!input.from && !!input.to,
    staleTime: GAPS_STALE_TIME,
    retry: gapsRetry,
  });
}

/** Bench takes no window (D-P6-6 — computed as of today). */
export function useBenchVsPipeline(input: { enabled: boolean }) {
  const { user } = useAuth();
  const viewerId = user?.id;
  return useQuery<BenchResult, Error>({
    queryKey: [SCHEDULER_GAPS_KEY, "bench-vs-pipeline", viewerId],
    queryFn: async () =>
      parseBenchResult(await invokeSchedulerGaps({ action: "bench-vs-pipeline" })),
    enabled: input.enabled && !!viewerId,
    staleTime: GAPS_STALE_TIME,
    retry: gapsRetry,
  });
}
