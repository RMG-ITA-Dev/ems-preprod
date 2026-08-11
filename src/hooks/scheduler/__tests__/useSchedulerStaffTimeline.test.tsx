// Viewer-keyed cache isolation + deterministic retry.
//
// The QueryClient here is deliberately ONE persistent instance across
// renders — the app-level client in App.tsx survives an in-SPA account
// switch (signOut does not clear it), which is exactly the leak scenario
// this test reproduces: with a viewer-agnostic key, viewer B would be
// served viewer A's privileged timeline without any new transport call.
//
// Fase 3 (plan v2 §1): engagement_status es el ESTADO EFECTIVO numérico.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EngagementState } from "@/lib/engagementStatus";

// Controllable auth identity (in-SPA account switches between renders).
const auth: { user: { id: string } | null } = { user: { id: "viewer-a" } };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

const invokeMock = vi.fn();
vi.mock("../schedulerData", async () => {
  const actual = await vi.importActual<object>("../schedulerData");
  return {
    ...actual,
    invokeSchedulerData: (...args: unknown[]) => invokeMock(...args),
  };
});

import {
  SchedulerDataError,
  SchedulerUnavailableError,
  type StaffTimelineResult,
} from "../schedulerData";
import {
  shouldRetryStaffTimeline,
  useSchedulerStaffTimeline,
} from "../useSchedulerStaffTimeline";

const WINDOW = { staffId: "s-1", from: "2026-01-01", to: "2026-12-31" };

const result = (over: Partial<StaffTimelineResult>): StaffTimelineResult => ({
  staff: {
    staff_id: "s-1",
    first_name: "Dana",
    last_name: "Linarez",
    short_name: "DL",
    weekly_capacity_hours: 40,
  },
  rows: [],
  hiddenEngagementCount: 0,
  truncated: false,
  utilization: [],
  ...over,
});

// The PRIVILEGED payload: engagement identities an admin may see.
const ADMIN_RESULT = result({
  rows: [
    {
      assignment_id: "a-1",
      engagement_id: "e-1",
      start_date: "2026-02-01",
      end_date: "2026-06-30",
      hours_per_week: 40,
      allocation_percent: 100,
      status: "PROPOSED",
      engagement_code: "A-001",
      engagement_name: "Audit One",
      engagement_status: EngagementState.Aprobado,
      client_name: "Cliente Uno",
      out_of_scope: false,
      manager_name: null,
    },
  ],
});

// The RESTRICTED payload: identities hidden, count only.
const RESTRICTED_RESULT = result({ rows: [], hiddenEngagementCount: 1 });

describe("useSchedulerStaffTimeline viewer-keyed cache isolation", () => {
  let client: QueryClient;
  let wrapper: ({ children }: { children: React.ReactNode }) => React.JSX.Element;

  beforeEach(() => {
    invokeMock.mockReset();
    auth.user = { id: "viewer-a" };
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  });

  it("privileged → restricted switch: the restricted viewer NEVER sees the cached privileged payload", async () => {
    invokeMock.mockResolvedValueOnce(ADMIN_RESULT);
    const first = renderHook(() => useSchedulerStaffTimeline(WINDOW), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(first.result.current.data).toEqual(ADMIN_RESULT);
    first.unmount(); // navigation/sign-out — the QueryClient survives

    auth.user = { id: "viewer-b" };
    invokeMock.mockResolvedValueOnce(RESTRICTED_RESULT);
    const second = renderHook(() => useSchedulerStaffTimeline(WINDOW), { wrapper });

    // The privileged payload must not be served from cache — not even as
    // a stale placeholder while revalidating.
    expect(second.result.current.data).toBeUndefined();
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(second.result.current.data).toEqual(RESTRICTED_RESULT);
    // Viewer B was REAUTHORIZED by a fresh transport call.
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("restricted → privileged switch: the privileged viewer is not narrowed by the cached restricted payload", async () => {
    auth.user = { id: "viewer-b" };
    invokeMock.mockResolvedValueOnce(RESTRICTED_RESULT);
    const first = renderHook(() => useSchedulerStaffTimeline(WINDOW), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    auth.user = { id: "viewer-a" };
    invokeMock.mockResolvedValueOnce(ADMIN_RESULT);
    const second = renderHook(() => useSchedulerStaffTimeline(WINDOW), { wrapper });
    expect(second.result.current.data).toBeUndefined();
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(second.result.current.data).toEqual(ADMIN_RESULT);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("same viewer remount within staleTime serves the cache without a new call (baseline)", async () => {
    invokeMock.mockResolvedValueOnce(ADMIN_RESULT);
    const first = renderHook(() => useSchedulerStaffTimeline(WINDOW), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useSchedulerStaffTimeline(WINDOW), { wrapper });
    expect(second.result.current.data).toEqual(ADMIN_RESULT);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("no authenticated viewer → query disabled, zero privileged calls", async () => {
    auth.user = null;
    const { result: r } = renderHook(() => useSchedulerStaffTimeline(WINDOW), { wrapper });
    expect(r.current.fetchStatus).toBe("idle");
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("shouldRetryStaffTimeline deterministic classification", () => {
  it("code-only deterministic errors (no HTTP status) never retry", () => {
    for (const code of ["bad_request", "forbidden", "not_found", "unauthorized"]) {
      expect(shouldRetryStaffTimeline(0, new SchedulerDataError(code, "x"))).toBe(false);
    }
  });

  it("status-only deterministic errors (envelope-less gateway 400/401/403/404) never retry", () => {
    for (const status of [400, 401, 403, 404]) {
      expect(
        shouldRetryStaffTimeline(0, new SchedulerDataError("unknown", "denied", status))
      ).toBe(false);
    }
  });

  it("a revoked session (typed 401 unauthorized) never retries — recovery, not repetition, resolves it", () => {
    expect(
      shouldRetryStaffTimeline(
        0,
        new SchedulerDataError("unauthorized", "Invalid token", 401)
      )
    ).toBe(false);
  });

  it("Unavailable never retries — a missing deployment will not heal between attempts", () => {
    expect(shouldRetryStaffTimeline(0, new SchedulerUnavailableError())).toBe(false);
  });

  it("transient failures retry twice, then stop", () => {
    const transient = new SchedulerDataError("query_failed", "boom", 500);
    expect(shouldRetryStaffTimeline(0, transient)).toBe(true);
    expect(shouldRetryStaffTimeline(1, transient)).toBe(true);
    expect(shouldRetryStaffTimeline(2, transient)).toBe(false);
    const statusless = new SchedulerDataError("unknown", "?");
    expect(shouldRetryStaffTimeline(0, statusless)).toBe(true);
    expect(shouldRetryStaffTimeline(2, statusless)).toBe(false);
  });
});
