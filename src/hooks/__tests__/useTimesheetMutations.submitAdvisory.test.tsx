import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSubmitTimesheet } from "../useTimesheetMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const PAIRS = [
  { engagementId: "eng-1", activityId: "act-1" },
  { engagementId: "eng-1", activityId: "act-1" }, // duplicate — must be deduplicated
  { engagementId: "eng-2", activityId: "act-2" },
];

describe("useSubmitTimesheet — Fase 6 assignment advisory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the RPC with exactly 5 named keys, parallel arrays of equal length/order, unauthorizedCount never included, dedup preserved", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { new_pending: 0, reset_to_pending: 0 }, error: null } as never);
    const { result } = renderHook(() => useSubmitTimesheet(), { wrapper: createWrapper() });

    result.current.mutate({
      periodId: "p1",
      staffId: "staff-1",
      engagementActivityPairs: PAIRS,
      isAutoApproved: false,
      unauthorizedCount: 2,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(supabase.rpc).mock.calls[0];
    const keys = Object.keys(payload as Record<string, unknown>);
    expect(keys.sort()).toEqual([
      "p_activity_ids", "p_engagement_ids", "p_is_auto_approved", "p_period_id", "p_staff_id",
    ]);
    expect(keys).not.toContain("unauthorizedCount");

    const p = payload as unknown as { p_engagement_ids: string[]; p_activity_ids: string[] };
    expect(p.p_engagement_ids).toEqual(["eng-1", "eng-2"]);
    expect(p.p_activity_ids).toEqual(["act-1", "act-2"]);
    expect(p.p_engagement_ids.length).toBe(p.p_activity_ids.length);
  });

  it("unauthorizedCount: 0 shows only the success toast", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { new_pending: 0, reset_to_pending: 0 }, error: null } as never);
    const { result } = renderHook(() => useSubmitTimesheet(), { wrapper: createWrapper() });

    result.current.mutate({
      periodId: "p1", staffId: "staff-1", engagementActivityPairs: PAIRS, isAutoApproved: false, unauthorizedCount: 0,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("unauthorizedCount: 3 shows the success toast followed by an informational toast with the count", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { new_pending: 0, reset_to_pending: 0 }, error: null } as never);
    const { result } = renderHook(() => useSubmitTimesheet(), { wrapper: createWrapper() });

    result.current.mutate({
      periodId: "p1", staffId: "staff-1", engagementActivityPairs: PAIRS, isAutoApproved: false, unauthorizedCount: 3,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith("timesheet.assignmentAdvisory.submittedWithWarnings");
  });

  it("a failed submit with unauthorizedCount set never shows the informational toast", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error("SOME_OTHER_ERROR") } as never);
    const { result } = renderHook(() => useSubmitTimesheet(), { wrapper: createWrapper() });

    result.current.mutate({
      periodId: "p1", staffId: "staff-1", engagementActivityPairs: PAIRS, isAutoApproved: false, unauthorizedCount: 3,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("EMPTY_ENGAGEMENTS maps to the no-entries error toast", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error("EMPTY_ENGAGEMENTS") } as never);
    const { result } = renderHook(() => useSubmitTimesheet(), { wrapper: createWrapper() });

    result.current.mutate({
      periodId: "p1", staffId: "staff-1", engagementActivityPairs: PAIRS, isAutoApproved: false,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith("timesheet.submitNoEntries");
  });

  it("ARRAY_LENGTH_MISMATCH maps to the pair-mismatch error toast", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error("ARRAY_LENGTH_MISMATCH") } as never);
    const { result } = renderHook(() => useSubmitTimesheet(), { wrapper: createWrapper() });

    result.current.mutate({
      periodId: "p1", staffId: "staff-1", engagementActivityPairs: PAIRS, isAutoApproved: false,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith("timesheet.submitPairMismatch");
  });

  it.each([
    ["WEEKLY_MIN_NOT_MET", "timesheet.weeklyMinNotMet"],
    ["WEEKLY_MAX_EXCEEDED", "timesheet.weeklyMaxExceeded"],
    ["SUBMIT_NO_ENTRIES", "timesheet.submitNoEntries"],
    ["ENGAGEMENT_DATE_RANGE_VIOLATION", "timesheet.submitDateRangeViolation"],
  ])("existing error mapping for %s is unaffected by the new advisory branches", async (code, i18nKey) => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error(code) } as never);
    const { result } = renderHook(() => useSubmitTimesheet(), { wrapper: createWrapper() });

    result.current.mutate({
      periodId: "p1", staffId: "staff-1", engagementActivityPairs: PAIRS, isAutoApproved: false,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith(i18nKey);
  });
});
