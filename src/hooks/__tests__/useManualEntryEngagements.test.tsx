import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * BUG 0828-186: useManualEntryEngagements consumes the RPC list_loggable_engagements()
 * (SECURITY DEFINER, gated by time_entry.create, no assignment filter by design). Unlike
 * useApprovedEngagements (Tracker-only), the manual entry dialog INCLUDES internal/ADMIN
 * engagements.
 */

const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

import { useManualEntryEngagements } from "../useManualEntryEngagements";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
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

function setupMocks(rows: any[]) {
  mockRpc.mockImplementation((fn: string) => {
    if (fn === "list_loggable_engagements") return Promise.resolve({ data: rows, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

describe("useManualEntryEngagements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the list_loggable_engagements RPC", async () => {
    setupMocks([]);
    const { result } = renderHook(() => useManualEntryEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith("list_loggable_engagements");
  });

  it("includes internal engagements (unlike useApprovedEngagements)", async () => {
    setupMocks([makeRow({ engagement_id: "eng-internal", is_internal: true, work_order_required: false })]);
    const { result } = renderHook(() => useManualEntryEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].engagement_id).toBe("eng-internal");
  });

  it("includes a non-internal client engagement", async () => {
    setupMocks([makeRow({ engagement_id: "eng-client", is_internal: false })]);
    const { result } = renderHook(() => useManualEntryEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].engagement_id).toBe("eng-client");
  });

  it("excludes engagement with terminal override (Cancelado/Finalizado/Congelado)", async () => {
    setupMocks([makeRow({ engagement_id: "eng-frozen", engagement_state_override: 6 })]);
    const { result } = renderHook(() => useManualEntryEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("returns empty array when the RPC returns no rows", async () => {
    setupMocks([]);
    const { result } = renderHook(() => useManualEntryEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
