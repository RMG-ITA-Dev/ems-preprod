import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTimesheetImport } from "@/hooks/useTimesheetImport";
import type { TimerEntry } from "@/hooks/useTimerEntries";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { period_id: "p1" }, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      in: () => Promise.resolve({ data: [], error: null }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

// Mock the mark imported mutation
vi.mock("@/hooks/useTimerEntries", async () => {
  const actual = await vi.importActual("@/hooks/useTimerEntries");
  return {
    ...actual,
    useMarkTimerEntriesImported: () => ({
      mutateAsync: vi.fn(),
    }),
  };
});

function makeEntry(overrides: Partial<TimerEntry> & { timer_id: string; engagement_id: string; activity_id: string; started_at: string }): TimerEntry {
  return {
    staff_id: "staff-1",
    description: null,
    ended_at: "2026-02-20T18:00:00Z",
    duration_minutes: 60,
    is_imported: false,
    imported_to_time_id: null,
    has_explicit_times: true,
    created_at: "2026-02-20T08:00:00Z",
    engagement: { engagement_name: "Test", engagement_code: "ENG-01" },
    activity: { activity_code: "ACT-01", description: "Test" },
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useTimesheetImport.analyzeExport", () => {
  // H1
  it("returns utility-consistent PreflightAnalysis", () => {
    const { result } = renderHook(() => useTimesheetImport({ staffId: "staff-1" }), {
      wrapper: createWrapper(),
    });

    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z" }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T10:00:00Z" }),
      makeEntry({ timer_id: "t3", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T14:00:00Z" }),
    ];
    const selectedIds = new Set(["t1", "t2"]);
    const analysis = result.current.analyzeExport(entries, selectedIds);

    expect(analysis.hasConflicts).toBe(true);
    expect(analysis.conflicts).toHaveLength(1);
    expect(analysis.groups.size).toBe(1);
  });

  // H2
  it("defensive re-filter excludes ineligible entries", () => {
    const { result } = renderHook(() => useTimesheetImport({ staffId: "staff-1" }), {
      wrapper: createWrapper(),
    });

    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z", ended_at: null }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T10:00:00Z", is_imported: true }),
      makeEntry({ timer_id: "t3", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T14:00:00Z" }),
    ];
    const selectedIds = new Set(["t1", "t2", "t3"]);
    const analysis = result.current.analyzeExport(entries, selectedIds);

    expect(analysis.eligibleIds.size).toBe(1);
    expect(analysis.eligibleIds.has("t3")).toBe(true);
  });

  // H3
  it("populates eligibleIds and selectedIdsSnapshot", () => {
    const { result } = renderHook(() => useTimesheetImport({ staffId: "staff-1" }), {
      wrapper: createWrapper(),
    });

    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z" }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T10:00:00Z" }),
    ];
    const selectedIds = new Set(["t1"]);
    const analysis = result.current.analyzeExport(entries, selectedIds);

    expect(analysis.eligibleIds).toEqual(new Set(["t1", "t2"]));
    expect(analysis.selectedIdsSnapshot).toEqual(new Set(["t1"]));
  });
});
