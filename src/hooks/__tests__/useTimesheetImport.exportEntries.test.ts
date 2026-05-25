import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTimesheetImport } from "@/hooks/useTimesheetImport";
import type { TimerEntry } from "@/hooks/useTimerEntries";

const {
  mockMaybeSinglePeriod,
  mockSinglePeriod,
  mockInEngagements,
  mockMaybeSingleTimeEntries,
  mockSingleTimeEntries,
  mockMutateAsync,
} = vi.hoisted(() => ({
  mockMaybeSinglePeriod: vi.fn(),
  mockSinglePeriod: vi.fn(),
  mockInEngagements: vi.fn(),
  mockMaybeSingleTimeEntries: vi.fn(),
  mockSingleTimeEntries: vi.fn(),
  mockMutateAsync: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "engagements") {
        return {
          select: () => ({ in: mockInEngagements }),
        };
      }
      if (table === "timesheet_periods") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: mockMaybeSinglePeriod,
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: mockSinglePeriod,
            }),
          }),
        };
      }
      // time_entries — 5 chained .eq() calls before .maybeSingle()
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: mockMaybeSingleTimeEntries,
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: mockSingleTimeEntries,
          }),
        }),
        update: () => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    },
  },
}));

vi.mock("@/hooks/useTimerEntries", async () => {
  const actual = await vi.importActual("@/hooks/useTimerEntries");
  return {
    ...actual,
    useMarkTimerEntriesImported: () => ({
      mutateAsync: mockMutateAsync,
    }),
  };
});

function makeEntry(
  overrides: Partial<TimerEntry> & {
    timer_id: string;
    engagement_id: string;
    activity_id: string;
    started_at: string;
  }
): TimerEntry {
  return {
    staff_id: "staff-1",
    description: null,
    ended_at: "2026-03-06T17:00:00Z",
    duration_minutes: 480,
    is_imported: false,
    imported_to_time_id: null,
    has_explicit_times: true,
    created_at: "2026-03-06T08:00:00Z",
    engagement: { engagement_name: "Test Eng", engagement_code: "TEST-01" },
    activity: { activity_code: "ACT-01", description: "Test Activity" },
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useTimesheetImport.exportEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInEngagements.mockResolvedValue({ data: [], error: null });
    mockMutateAsync.mockResolvedValue(undefined);
  });

  // E1: submitted period blocks correctly
  it("E1: submitted period → blockedCount=1, blockedWeeks=['02/03/2026'], dbErrorCount=0", async () => {
    mockMaybeSinglePeriod.mockResolvedValueOnce({
      data: { period_id: "p1", submitted_at: "2026-02-27T00:00:00Z" },
      error: null,
    });

    const { result } = renderHook(
      () => useTimesheetImport({ staffId: "staff-1" }),
      { wrapper: createWrapper() }
    );

    let exportResult: Awaited<ReturnType<typeof result.current.exportEntries>>;
    await act(async () => {
      exportResult = await result.current.exportEntries([
        makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-03-06T08:00:00Z" }),
      ]);
    });

    expect(exportResult!.blockedCount).toBe(1);
    expect(exportResult!.blockedWeeks).toEqual(["02/03/2026"]);
    expect(exportResult!.dbErrorCount).toBe(0);
    expect(exportResult!.dbErrorWeeks).toEqual([]);
    expect(exportResult!.dbErrorMessages).toEqual([]);
  });

  // E2: SELECT error on time_entries → dbErrorCount, week label, empty reason
  it("E2: SELECT error → dbErrorCount=1, formatted week, dbErrorMessages=['']", async () => {
    mockMaybeSinglePeriod.mockResolvedValueOnce({
      data: { period_id: "p1", submitted_at: null },
      error: null,
    });
    mockMaybeSingleTimeEntries.mockResolvedValueOnce({ data: null, error: { message: "" } });

    const { result } = renderHook(
      () => useTimesheetImport({ staffId: "staff-1" }),
      { wrapper: createWrapper() }
    );

    let exportResult: Awaited<ReturnType<typeof result.current.exportEntries>>;
    await act(async () => {
      exportResult = await result.current.exportEntries([
        makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-03-06T08:00:00Z" }),
      ]);
    });

    expect(exportResult!.dbErrorCount).toBe(1);
    expect(exportResult!.dbErrorWeeks).toEqual(["02/03/2026"]);
    expect(exportResult!.dbErrorMessages).toEqual([""]);
    expect(exportResult!.blockedCount).toBe(0);
  });

  // E3: INSERT error APPROVED_LINE_LOCKED → classified reason
  it("E3: INSERT APPROVED_LINE_LOCKED → dbErrorMessages=['approved_line_locked']", async () => {
    mockMaybeSinglePeriod.mockResolvedValueOnce({
      data: { period_id: "p1", submitted_at: null },
      error: null,
    });
    mockMaybeSingleTimeEntries.mockResolvedValueOnce({ data: null, error: null });
    mockSingleTimeEntries.mockResolvedValueOnce({ data: null, error: { message: "APPROVED_LINE_LOCKED" } });

    const { result } = renderHook(
      () => useTimesheetImport({ staffId: "staff-1" }),
      { wrapper: createWrapper() }
    );

    let exportResult: Awaited<ReturnType<typeof result.current.exportEntries>>;
    await act(async () => {
      exportResult = await result.current.exportEntries([
        makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-03-06T08:00:00Z" }),
      ]);
    });

    expect(exportResult!.dbErrorCount).toBe(1);
    expect(exportResult!.dbErrorMessages).toEqual(["approved_line_locked"]);
    expect(exportResult!.blockedCount).toBe(0);
  });

  // E4: INSERT error short raw message → passed through
  it("E4: INSERT error with short message → dbErrorMessages contains raw message", async () => {
    mockMaybeSinglePeriod.mockResolvedValueOnce({
      data: { period_id: "p1", submitted_at: null },
      error: null,
    });
    mockMaybeSingleTimeEntries.mockResolvedValueOnce({ data: null, error: null });
    mockSingleTimeEntries.mockResolvedValueOnce({
      data: null,
      error: { message: "violates check constraint chk_hours" },
    });

    const { result } = renderHook(
      () => useTimesheetImport({ staffId: "staff-1" }),
      { wrapper: createWrapper() }
    );

    let exportResult: Awaited<ReturnType<typeof result.current.exportEntries>>;
    await act(async () => {
      exportResult = await result.current.exportEntries([
        makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-03-06T08:00:00Z" }),
      ]);
    });

    expect(exportResult!.dbErrorMessages).toEqual(["violates check constraint chk_hours"]);
  });

  // E5: INSERT error long message (>120 chars) → fallback empty string
  it("E5: INSERT error with message > 120 chars → dbErrorMessages=['']", async () => {
    mockMaybeSinglePeriod.mockResolvedValueOnce({
      data: { period_id: "p1", submitted_at: null },
      error: null,
    });
    mockMaybeSingleTimeEntries.mockResolvedValueOnce({ data: null, error: null });
    mockSingleTimeEntries.mockResolvedValueOnce({
      data: null,
      error: { message: "x".repeat(121) },
    });

    const { result } = renderHook(
      () => useTimesheetImport({ staffId: "staff-1" }),
      { wrapper: createWrapper() }
    );

    let exportResult: Awaited<ReturnType<typeof result.current.exportEntries>>;
    await act(async () => {
      exportResult = await result.current.exportEntries([
        makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-03-06T08:00:00Z" }),
      ]);
    });

    expect(exportResult!.dbErrorMessages).toEqual([""]);
  });

  // E6: successful export
  it("E6: successful INSERT → newCount=1, dbErrorCount=0, markImported called with timer→time_id", async () => {
    mockMaybeSinglePeriod.mockResolvedValueOnce({
      data: { period_id: "p1", submitted_at: null },
      error: null,
    });
    mockMaybeSingleTimeEntries.mockResolvedValueOnce({ data: null, error: null });
    mockSingleTimeEntries.mockResolvedValueOnce({ data: { time_id: "time-x" }, error: null });

    const { result } = renderHook(
      () => useTimesheetImport({ staffId: "staff-1" }),
      { wrapper: createWrapper() }
    );

    let exportResult: Awaited<ReturnType<typeof result.current.exportEntries>>;
    await act(async () => {
      exportResult = await result.current.exportEntries([
        makeEntry({ timer_id: "timer-a", engagement_id: "e1", activity_id: "a1", started_at: "2026-03-06T08:00:00Z" }),
      ]);
    });

    expect(exportResult!.newCount).toBe(1);
    expect(exportResult!.blockedCount).toBe(0);
    expect(exportResult!.dbErrorCount).toBe(0);
    expect(exportResult!.dbErrorMessages).toEqual([]);
    expect(mockMutateAsync).toHaveBeenCalledWith([{ timer_id: "timer-a", time_id: "time-x" }]);
  });

  // E7: mixed — submitted week-A + APPROVED_LINE_LOCKED in different week-B
  it("E7: submitted week-A and APPROVED_LINE_LOCKED week-B → both counters populated", async () => {
    // Period lookup: first for "2026-03-02" (week of 2026-03-06), then "2026-02-09" (week of 2026-02-13)
    mockMaybeSinglePeriod
      .mockResolvedValueOnce({ data: { period_id: "p1", submitted_at: "2026-02-27T00:00:00Z" }, error: null })
      .mockResolvedValueOnce({ data: { period_id: "p2", submitted_at: null }, error: null });

    // SELECT for week-B (week-A is skipped due to submitted period)
    mockMaybeSingleTimeEntries.mockResolvedValueOnce({ data: null, error: null });
    // INSERT for week-B → APPROVED_LINE_LOCKED
    mockSingleTimeEntries.mockResolvedValueOnce({ data: null, error: { message: "APPROVED_LINE_LOCKED" } });

    const { result } = renderHook(
      () => useTimesheetImport({ staffId: "staff-1" }),
      { wrapper: createWrapper() }
    );

    let exportResult: Awaited<ReturnType<typeof result.current.exportEntries>>;
    await act(async () => {
      exportResult = await result.current.exportEntries([
        makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-03-06T08:00:00Z" }),
        makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a2", started_at: "2026-02-13T08:00:00Z" }),
      ]);
    });

    expect(exportResult!.blockedCount).toBe(1);
    expect(exportResult!.blockedWeeks).toEqual(["02/03/2026"]);
    expect(exportResult!.dbErrorCount).toBe(1);
    expect(exportResult!.dbErrorWeeks).toEqual(["09/02/2026"]);
    expect(exportResult!.dbErrorMessages).toEqual(["approved_line_locked"]);
  });
});
