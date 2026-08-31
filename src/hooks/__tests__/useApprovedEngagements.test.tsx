import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * BUG 0828-186: useApprovedEngagements moved from two hand-rolled RLS-filtered queries
 * (Group A/B + partner/manager visibility OR-clause) to the RPC list_loggable_engagements()
 * (SECURITY DEFINER, gated by time_entry.create, no assignment filter by design). These
 * tests replace the old partner/manager-visibility assertions with: the hook calls the RPC,
 * excludes internal engagements (Tracker-only), maps the flat row into `client`, and
 * re-applies isLoggable client-side as a second line of defense alongside the RPC's own
 * override exclusion.
 */

const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
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

describe("useApprovedEngagements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the list_loggable_engagements RPC", async () => {
    setupMocks([]);
    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith("list_loggable_engagements");
  });

  it("excludes internal engagements (Tracker-only)", async () => {
    setupMocks([makeRow({ engagement_id: "eng-internal", is_internal: true })]);
    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("includes a non-internal active engagement returned by the RPC", async () => {
    setupMocks([makeRow({ engagement_id: "eng-client", is_internal: false })]);
    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].engagement_id).toBe("eng-client");
  });

  it("maps client_id/client_legal_name into a nested client object", async () => {
    setupMocks([makeRow({ engagement_id: "eng-1", client_id: "c9", client_legal_name: "Acme" })]);
    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].client).toEqual({ client_id: "c9", client_legal_name: "Acme" });
  });

  it("returns empty array when the RPC returns no rows (e.g. no time_entry.create)", async () => {
    setupMocks([]);
    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  // FEAT 0602-135: includes engagement approved via manual override 4/5 (no approved WO)
  it("includes engagement with manual override Aprobado/Emergencia (4/5)", async () => {
    setupMocks([makeRow({ engagement_id: "eng-ov4", engagement_state_override: 4 })]);
    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].engagement_id).toBe("eng-ov4");
  });

  // FEAT 0602-135: isLoggable excludes terminal/non-loggable overrides (6/7/9), re-applied
  // client-side alongside the RPC's own WHERE-clause exclusion.
  it("excludes engagement with terminal override (Cancelado/Finalizado/Congelado)", async () => {
    setupMocks([makeRow({ engagement_id: "eng-frozen", engagement_state_override: 9 })]);
    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("surfaces RPC errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("boom") });
    const { result } = renderHook(() => useApprovedEngagements(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
