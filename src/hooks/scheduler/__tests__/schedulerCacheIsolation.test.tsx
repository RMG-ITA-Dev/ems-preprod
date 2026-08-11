// Scheduler L1/L2 authorization responses are viewer-scoped. The app-level
// QueryClient survives an in-SPA account switch, so these tests keep one
// client alive across identities and assert a fresh transport request.

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth: { user: { id: string } | null } = { user: { id: "viewer-a" } };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

const invokeMock = vi.fn();
vi.mock("../schedulerData", async () => {
  const actual = await vi.importActual<object>("../schedulerData");
  return { ...actual, invokeSchedulerData: (...args: unknown[]) => invokeMock(...args) };
});

import { useSchedulerL1Rows } from "../useSchedulerL1";
import { useStaffFirmwideAssignmentCounts } from "../useStaffFirmwideAssignmentCounts";

const WINDOW = { from: "2026-01-01", to: "2026-12-31" };

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("Scheduler L1/L2 viewer-keyed cache isolation", () => {
  let client: QueryClient;

  beforeEach(() => {
    invokeMock.mockReset();
    auth.user = { id: "viewer-a" };
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("L1 does not expose a prior viewer's rows after an account switch", async () => {
    const privileged = { rows: [{ engagement_id: "private-engagement" }], truncated: false };
    const restricted = { rows: [], truncated: false };
    invokeMock.mockResolvedValueOnce(privileged);
    const first = renderHook(() => useSchedulerL1Rows(WINDOW), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    auth.user = { id: "viewer-b" };
    invokeMock.mockResolvedValueOnce(restricted);
    const second = renderHook(() => useSchedulerL1Rows(WINDOW), { wrapper: wrapperFor(client) });
    expect(second.result.current.data).toBeUndefined();
    await waitFor(() => expect(second.result.current.data).toEqual(restricted));
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("L2 preflight does not reuse an authorized viewer's result", async () => {
    invokeMock.mockResolvedValueOnce({ rows: [{ staffId: "s-1", activeEngagementCount: 4 }] });
    const first = renderHook(() => useStaffFirmwideAssignmentCounts("engagement-1"), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    auth.user = { id: "viewer-b" };
    const restricted = { rows: [] };
    invokeMock.mockResolvedValueOnce(restricted);
    const second = renderHook(() => useStaffFirmwideAssignmentCounts("engagement-1"), {
      wrapper: wrapperFor(client),
    });
    expect(second.result.current.data).toBeUndefined();
    await waitFor(() => expect(second.result.current.data).toEqual(restricted));
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("does not request authorization-sensitive data without an authenticated viewer", () => {
    auth.user = null;
    const l1 = renderHook(() => useSchedulerL1Rows(WINDOW), { wrapper: wrapperFor(client) });
    const l2 = renderHook(() => useStaffFirmwideAssignmentCounts("engagement-1"), {
      wrapper: wrapperFor(client),
    });
    expect(l1.result.current.fetchStatus).toBe("idle");
    expect(l2.result.current.fetchStatus).toBe("idle");
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
