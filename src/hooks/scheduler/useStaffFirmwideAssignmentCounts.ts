// Firmwide active-engagement counts for the staff of ONE engagement
// (Phase 4 plan §4, narrowed §3.2 contract): the server derives the staff
// list from the engagement's own assignments and returns counts only —
// clients can never probe arbitrary staff workloads.

import { useQuery } from "@tanstack/react-query";
import { SCHEDULER_STAFF_LOAD_KEY } from "./keys";
import {
  invokeSchedulerData,
  isSchedulerAuthFailure,
  SchedulerUnavailableError,
  type StaffLoadRow,
} from "./schedulerData";

export function useStaffFirmwideAssignmentCounts(
  engagementId: string | undefined
) {
  return useQuery<{ rows: StaffLoadRow[] }, Error>({
    queryKey: [SCHEDULER_STAFF_LOAD_KEY, engagementId],
    queryFn: () =>
      invokeSchedulerData<{ rows: StaffLoadRow[] }>({
        action: "scheduler-staff-load",
        engagementId,
      }),
    enabled: Boolean(engagementId),
    staleTime: 60_000,
    // Neither a missing deployment nor a revoked session (the
    // session-recovery boundary resolves the latter) heals between retries.
    retry: (failureCount, error) =>
      !(error instanceof SchedulerUnavailableError) &&
      !isSchedulerAuthFailure(error) &&
      failureCount < 2,
  });
}
