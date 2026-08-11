import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePendingApprovalSummaries, useStaffTimesheetForApproval } from "../useTimesheetApprovals";

vi.mock("../useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1" } }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Generic self-chaining query-builder mock: every filter method records its call and returns
// itself; the object resolves as a promise to `result` regardless of which method was last
// invoked (mirrors PostgrestFilterBuilder being thenable at any point in the chain).
function makeBuilder(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const calls: Record<string, unknown[][]> = {};
  const methods = [
    "select", "eq", "not", "in", "order", "gte", "lte", "is",
    "abortSignal", "single", "maybeSingle", "update", "insert", "delete",
  ];
  const builder: Record<string, unknown> = { __calls: calls };
  for (const m of methods) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls[m] = calls[m] || [];
      calls[m].push(args);
      return builder;
    });
  }
  (builder as { then: (resolve: (v: unknown) => void) => void }).then = (resolve) => resolve(result);
  return builder as typeof builder & { __calls: Record<string, unknown[][]> };
}

describe("usePendingApprovalSummaries — Fase 6 (is_forecast filter + abortSignal)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters time_entries by is_forecast=false, chains abortSignal, and keeps activity_id selected for aggregation", async () => {
    const approvalsBuilder = makeBuilder({
      data: [
        {
          approval_id: "ap-1",
          period_id: "p1",
          engagement_id: "eng-1",
          activity_id: "act-1",
          status: "pending",
          period: {
            period_id: "p1",
            week_start_date: "2026-02-16",
            week_number: 8,
            year: 2026,
            staff_id: "staff-2",
            submitted_at: "2026-02-20T00:00:00Z",
            staff: { staff_id: "staff-2", first_name: "A", last_name: "B", short_name: null },
          },
        },
      ],
      error: null,
    });
    const timeEntriesBuilder = makeBuilder({
      data: [{ period_id: "p1", engagement_id: "eng-1", activity_id: "act-1", hours_logged: 8 }],
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "timesheet_line_approvals") return approvalsBuilder as never;
      if (table === "time_entries") return timeEntriesBuilder as never;
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ period_id: "p1", engagement_id: "eng-1" }],
      error: null,
    } as never);

    const { result } = renderHook(() => usePendingApprovalSummaries(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(timeEntriesBuilder.__calls.eq).toContainEqual(["is_forecast", false]);
    expect(timeEntriesBuilder.__calls.abortSignal).toHaveLength(1);
    // The select column list still includes activity_id (used to key the eligibility pairs).
    const selectArg = String((timeEntriesBuilder.__calls.select as unknown[][])[0][0]);
    expect(selectArg).toContain("activity_id");

    expect(result.current.data?.[0]).toMatchObject({
      period_id: "p1",
      totalPendingHours: 8,
      pendingLineCount: 1,
    });
  });
});

describe("useStaffTimesheetForApproval — Fase 6 (is_forecast filter + abortSignal)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters time_entries by is_forecast=false, chains abortSignal, and preserves explicit column selection", async () => {
    const periodBuilder = makeBuilder({
      data: {
        period_id: "p1",
        week_start_date: "2026-02-16",
        week_number: 8,
        year: 2026,
        staff_id: "staff-2",
        staff: { staff_id: "staff-2", first_name: "A", last_name: "B", short_name: null },
      },
      error: null,
    });
    const timeEntriesBuilder = makeBuilder({
      data: [{
        time_id: "t1",
        date_worked: "2026-02-16",
        hours_logged: 8,
        description: null,
        engagement_id: "eng-1",
        activity_id: "act-1",
        engagement: { engagement_id: "eng-1", engagement_code: "E1", engagement_name: "Eng 1", client: null },
        activity: { activity_id: "act-1", activity_code: "A01", description: "Activity 1" },
      }],
      error: null,
    });
    const lineApprovalsBuilder = makeBuilder({ data: [], error: null });
    const workOrdersBuilder = makeBuilder({ data: [], error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "timesheet_periods") return periodBuilder as never;
      if (table === "time_entries") return timeEntriesBuilder as never;
      if (table === "timesheet_line_approvals") return lineApprovalsBuilder as never;
      if (table === "work_orders") return workOrdersBuilder as never;
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ period_id: "p1", engagement_id: "eng-1" }],
      error: null,
    } as never);

    const { result } = renderHook(() => useStaffTimesheetForApproval("p1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(timeEntriesBuilder.__calls.eq).toContainEqual(["is_forecast", false]);
    expect(timeEntriesBuilder.__calls.abortSignal).toHaveLength(1);
    expect(result.current.data?.timeEntries[0].activity_id).toBe("act-1");
    expect(result.current.data?.approvableEngagementIds).toEqual(["eng-1"]);
  });
});
