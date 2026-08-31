import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * BUG 0828-186: the Hoja de Tiempo engagement selector moved from a hand-rolled Group A/B
 * query (OT-approved engagements + a JS `.or()` restricting administrative/Group B
 * engagements to partner/manager) to the RPC list_loggable_engagements() (SECURITY DEFINER,
 * gated by time_entry.create). These tests cover only the engagement-visibility slice of
 * useTimesheetWeek: no more is_admin/get_my_staff_id round-trips, no assignment filter, and
 * canLogHours still applied client-side.
 */

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

vi.mock("../useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1" }, isLoading: false }),
}));

import { useTimesheetWeek } from "../useTimesheetWeek";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// Chainable query-builder mock covering periodQuery/entriesQuery/activitiesQuery -- this
// suite only asserts on engagementsQuery (the RPC), so the other 3 just need to resolve.
function chainBuilder(data: any[] | Record<string, unknown> | null, error: any = null) {
  const obj: any = {};
  const methods = ["select", "eq", "in", "or", "order", "not", "is", "gte", "lte", "insert"];
  for (const m of methods) obj[m] = vi.fn().mockReturnValue(obj);
  obj.maybeSingle = vi.fn().mockResolvedValue({ data, error });
  obj.single = vi.fn().mockResolvedValue({ data, error });
  obj.then = (resolve: any) => resolve({ data, error });
  return obj;
}

function makeRow(overrides: Partial<any> = {}) {
  return {
    engagement_id: overrides.engagement_id || crypto.randomUUID(),
    engagement_code: "T-001",
    engagement_name: "Test",
    activity_required: true,
    work_order_required: overrides.work_order_required ?? true,
    is_internal: overrides.is_internal ?? false,
    practica: 1,
    start_date: null,
    end_date: null,
    engagement_state_override: overrides.engagement_state_override ?? null,
    client_id: "c1",
    client_legal_name: "Cliente Demo",
    ...overrides,
  };
}

function setupMocks(rpcRows: any[]) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "timesheet_periods") {
      return chainBuilder({
        period_id: "p1",
        staff_id: "staff-1",
        week_start_date: "2026-08-24",
        week_number: 35,
        year: 2026,
        total_hours: 0,
        deadline: null,
        is_period_locked: false,
        submitted_at: null,
      });
    }
    return chainBuilder([]);
  });

  mockRpc.mockImplementation((fn: string) => {
    if (fn === "list_loggable_engagements") return Promise.resolve({ data: rpcRows, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

describe("useTimesheetWeek — engagement visibility (BUG 0828-186)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches engagements via the list_loggable_engagements RPC", async () => {
    setupMocks([makeRow({ engagement_id: "eng-1" })]);
    const { result } = renderHook(() => useTimesheetWeek(new Date("2026-08-24")), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.engagements).toHaveLength(1));
    expect(mockRpc).toHaveBeenCalledWith("list_loggable_engagements");
  });

  it("does not call is_admin/get_my_staff_id -- no client-side assignment filter", async () => {
    setupMocks([makeRow({ engagement_id: "eng-1" })]);
    const { result } = renderHook(() => useTimesheetWeek(new Date("2026-08-24")), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.engagements).toHaveLength(1));
    expect(mockRpc).not.toHaveBeenCalledWith("is_admin");
    expect(mockRpc).not.toHaveBeenCalledWith("get_my_staff_id");
  });

  it("does not query the engagements table directly -- visibility comes only from the RPC", async () => {
    setupMocks([makeRow({ engagement_id: "eng-1" })]);
    const { result } = renderHook(() => useTimesheetWeek(new Date("2026-08-24")), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.engagements).toHaveLength(1));
    expect(mockFrom).not.toHaveBeenCalledWith("engagements");
    expect(mockFrom).not.toHaveBeenCalledWith("work_orders");
  });

  it("excludes engagements with a terminal/frozen override (6/7/8/9)", async () => {
    setupMocks([makeRow({ engagement_id: "eng-frozen", engagement_state_override: 7 })]);
    const { result } = renderHook(() => useTimesheetWeek(new Date("2026-08-24")), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.engagements).toEqual([]);
  });

  it("includes an engagement with manual override Aprobado (4)", async () => {
    setupMocks([makeRow({ engagement_id: "eng-ov4", engagement_state_override: 4 })]);
    const { result } = renderHook(() => useTimesheetWeek(new Date("2026-08-24")), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.engagements).toHaveLength(1));
    expect(result.current.engagements[0].engagement_id).toBe("eng-ov4");
  });

  // Review 0828-186: the previous Group A/B queries ordered by created_at DESC; the RPC now
  // owns that ordering (ORDER BY created_at DESC in the migration). This guards that the JS
  // layer (map/filter in useLoggableEngagements) doesn't reorder what the RPC returns.
  it("preserves the order returned by the RPC", async () => {
    setupMocks([
      makeRow({ engagement_id: "eng-newest" }),
      makeRow({ engagement_id: "eng-older" }),
    ]);
    const { result } = renderHook(() => useTimesheetWeek(new Date("2026-08-24")), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.engagements).toHaveLength(2));
    expect(result.current.engagements.map((e) => e.engagement_id)).toEqual([
      "eng-newest",
      "eng-older",
    ]);
  });
});
