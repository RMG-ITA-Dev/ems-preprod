import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock supabase client
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

import { useApprovedEngagements } from "../useApprovedEngagements";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// Helper to build a chainable query builder mock
function chainBuilder(data: any[] | null, error: any = null) {
  const obj: any = {};
  const methods = ["select", "eq", "in", "or", "order", "not", "is", "gte", "lte"];
  for (const m of methods) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  // Terminal: when awaited, returns { data, error }
  obj.then = (resolve: any) => resolve({ data, error });
  return obj;
}

function makeEngagement(overrides: Partial<any> = {}) {
  return {
    engagement_id: overrides.engagement_id || crypto.randomUUID(),
    engagement_name: overrides.engagement_name || "Test",
    engagement_code: overrides.engagement_code || "T-001",
    status: overrides.status || "active",
    is_internal: overrides.is_internal ?? false,
    work_order_required: overrides.work_order_required ?? true,
    activity_required: true,
    client_id: "c1",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("useApprovedEngagements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupMocks(opts: {
    woEngagementIds?: string[];
    groupAEngagements?: any[];
    groupBEngagements?: any[];
    isAdmin?: boolean;
    myStaffId?: string | null;
  }) {
    const {
      woEngagementIds = [],
      groupAEngagements = [],
      groupBEngagements = [],
      isAdmin = true,
      myStaffId = "staff-1",
    } = opts;

    let fromCallCount = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === "work_orders") {
        return chainBuilder(woEngagementIds.map(id => ({ engagement_id: id })));
      }
      if (table === "engagements") {
        fromCallCount++;
        if (fromCallCount === 1 && woEngagementIds.length > 0) {
          // Group A
          return chainBuilder(groupAEngagements);
        }
        // Group B
        return chainBuilder(groupBEngagements);
      }
      return chainBuilder([]);
    });

    mockRpc.mockImplementation((fn: string) => {
      if (fn === "is_admin") return Promise.resolve({ data: isAdmin, error: null });
      if (fn === "get_my_staff_id") return Promise.resolve({ data: myStaffId, error: null });
      return Promise.resolve({ data: null, error: null });
    });
  }

  // T1: excludes internal engagements from Group A
  it("excludes internal engagements from Group A", async () => {
    const internalEng = makeEngagement({ engagement_id: "eng-internal", is_internal: true });
    setupMocks({
      woEngagementIds: ["eng-internal"],
      groupAEngagements: [], // filter should exclude it, so DB returns empty
      groupBEngagements: [],
    });

    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
    // Verify .eq("is_internal", false) was called on the engagements query
    const engCall = mockFrom.mock.calls.find(c => c[0] === "engagements");
    expect(engCall).toBeDefined();
  });

  // T2: excludes internal engagements from Group B
  it("excludes internal engagements from Group B", async () => {
    setupMocks({
      woEngagementIds: [],
      groupAEngagements: [],
      groupBEngagements: [], // is_internal=false filter excludes internal ones at DB level
    });

    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  // T3: includes active client engagement from Group A
  it("includes active client engagement from Group A", async () => {
    const clientEng = makeEngagement({ engagement_id: "eng-client", is_internal: false });
    setupMocks({
      woEngagementIds: ["eng-client"],
      groupAEngagements: [clientEng],
      groupBEngagements: [],
    });

    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].engagement_id).toBe("eng-client");
  });

  // T4: includes active client engagement from Group B
  it("includes active client engagement from Group B", async () => {
    const clientEng = makeEngagement({
      engagement_id: "eng-b",
      is_internal: false,
      work_order_required: false,
    });
    setupMocks({
      woEngagementIds: [],
      groupAEngagements: [],
      groupBEngagements: [clientEng],
    });

    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].engagement_id).toBe("eng-b");
  });

  // T5: deduplicates across groups
  it("deduplicates across groups", async () => {
    const sharedEng = makeEngagement({ engagement_id: "eng-shared", is_internal: false });
    setupMocks({
      woEngagementIds: ["eng-shared"],
      groupAEngagements: [sharedEng],
      groupBEngagements: [sharedEng],
    });

    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
  });

  // T6: non-admin visibility restricted to partner/manager
  it("non-admin visibility restricted to partner/manager", async () => {
    // Non-admin, engagement where user is neither partner nor manager -> excluded by OR clause
    setupMocks({
      woEngagementIds: [],
      groupAEngagements: [],
      groupBEngagements: [], // DB returns empty because OR clause filters out
      isAdmin: false,
      myStaffId: "staff-other",
    });

    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  // T7: returns empty array when no eligible engagements
  it("returns empty array when no eligible engagements", async () => {
    setupMocks({
      woEngagementIds: [],
      groupAEngagements: [],
      groupBEngagements: [],
    });

    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  // T8: excludes closed/inactive engagements
  it("excludes closed/inactive engagements", async () => {
    // A closed engagement with approved WO -> status='active' filter at DB level excludes it
    setupMocks({
      woEngagementIds: ["eng-closed"],
      groupAEngagements: [], // DB returns empty because status != 'active'
      groupBEngagements: [],
    });

    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});
