import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { SCHEDULER_TIMESHEET_AUTHZ_KEY } from "../keys";
import { useStaffAssignmentSegments, buildSegmentMap } from "../useStaffAssignmentSegments";

const authState = vi.hoisted(() => ({ userId: "viewer-1" as string | undefined }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.userId ? { id: authState.userId } : null }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

function mockRpcResolves(data: unknown, error: { message?: string; code?: string } | null = null) {
  vi.mocked(supabase.rpc).mockReturnValue({
    abortSignal: () => Promise.resolve({ data, error }),
  } as never);
}

function mockRpcRejects(err: unknown) {
  vi.mocked(supabase.rpc).mockReturnValue({
    abortSignal: () => Promise.reject(err),
  } as never);
}

const ROW = (engagement_id: string, start_date: string, end_date: string) => ({
  engagement_id,
  start_date,
  end_date,
});

const ENG_1 = "11111111-1111-1111-1111-111111111111";
const ENG_2 = "22222222-2222-2222-2222-222222222222";

describe("buildSegmentMap", () => {
  it("groups rows by engagement_id, preserving multiple windows per engagement", () => {
    const map = buildSegmentMap([
      ROW(ENG_1, "2026-01-05", "2026-01-09"),
      ROW(ENG_1, "2026-01-19", "2026-01-23"),
      ROW(ENG_2, "2026-01-05", "2026-01-09"),
    ]);
    expect(map).not.toBeNull();
    expect(map!.get(ENG_1)).toHaveLength(2);
    expect(map!.get(ENG_2)).toHaveLength(1);
  });

  it("a valid empty array is an authoritative empty Map, not null", () => {
    expect(buildSegmentMap([])).toEqual(new Map());
  });

  it("a null body is not the same as an authoritative []: fails open", () => {
    expect(buildSegmentMap(null)).toBeNull();
  });

  it("a non-array payload fails open", () => {
    expect(buildSegmentMap({ foo: "bar" })).toBeNull();
  });

  it("a null row fails open, never a partial map", () => {
    expect(buildSegmentMap([ROW("eng-1", "2026-01-05", "2026-01-09"), null])).toBeNull();
  });

  it("a non-string / empty / non-UUID engagement_id fails open", () => {
    expect(buildSegmentMap([{ ...ROW("eng-1", "2026-01-05", "2026-01-09"), engagement_id: 123 }])).toBeNull();
    expect(buildSegmentMap([{ ...ROW("eng-1", "2026-01-05", "2026-01-09"), engagement_id: "" }])).toBeNull();
    expect(buildSegmentMap([ROW("not-a-uuid", "2026-01-05", "2026-01-09")])).toBeNull();
  });

  it("an invalid-format date fails open", () => {
    expect(buildSegmentMap([ROW("11111111-1111-1111-1111-111111111111", "01/05/2026", "2026-01-09")])).toBeNull();
  });

  it("an impossible calendar date fails open", () => {
    expect(buildSegmentMap([ROW("11111111-1111-1111-1111-111111111111", "2026-99-99", "2026-01-09")])).toBeNull();
  });

  it("an inverted range (end before start) fails open", () => {
    expect(buildSegmentMap([ROW("11111111-1111-1111-1111-111111111111", "2026-01-09", "2026-01-05")])).toBeNull();
  });

  it("a mix of one valid and one invalid row never returns a partial map", () => {
    const map = buildSegmentMap([
      ROW("11111111-1111-1111-1111-111111111111", "2026-01-05", "2026-01-09"),
      ROW("not-a-uuid", "2026-01-05", "2026-01-09"),
    ]);
    expect(map).toBeNull();
  });
});

describe("useStaffAssignmentSegments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.userId = "viewer-1";
  });

  it("calls the RPC with exactly the named args and builds the query key from viewer/staff/week", async () => {
    mockRpcResolves([ROW("11111111-1111-1111-1111-111111111111", "2026-01-05", "2026-01-09")]);
    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(
      () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("get_staff_assignment_segments", {
      p_staff_id: "staff-1",
      p_week_start: "2026-01-05",
      p_week_end: "2026-01-09",
    });
    const cached = queryClient.getQueryData([
      SCHEDULER_TIMESHEET_AUTHZ_KEY,
      "viewer-1",
      "staff-1",
      "2026-01-05",
      "2026-01-09",
    ]);
    expect(cached).toBeInstanceOf(Map);
  });

  it("does not call the RPC when there is no authenticated viewer", () => {
    authState.userId = undefined;
    mockRpcResolves([]);
    const { wrapper } = createWrapper();
    renderHook(() => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"), { wrapper });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("does not call the RPC when staffId is missing", () => {
    mockRpcResolves([]);
    const { wrapper } = createWrapper();
    renderHook(() => useStaffAssignmentSegments(undefined, "2026-01-05", "2026-01-09"), { wrapper });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("does not call the RPC when the week range is missing (e.g. policies still pending)", () => {
    mockRpcResolves([]);
    const { wrapper } = createWrapper();
    renderHook(() => useStaffAssignmentSegments("staff-1", "2026-01-05", undefined), { wrapper });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("a real empty [] response resolves to an authoritative empty Map (never null)", async () => {
    mockRpcResolves([]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(new Map());
    expect(result.current.data).not.toBeNull();
  });

  describe.each([
    ["RPC denied", { message: "permission denied", code: "EA_SEGMENTS_DENIED" }],
    ["non-canonical week (not Monday)", { message: "EA_SEGMENTS_INVALID_RANGE: week_start is not Monday", code: "P0001" }],
    ["span > 6 days", { message: "EA_SEGMENTS_INVALID_RANGE: span exceeds 6 days", code: "P0001" }],
    ["function not deployed (PGRST202)", { message: "function not found", code: "PGRST202" }],
    ["undefined function (42883)", { message: "function does not exist", code: "42883" }],
  ])("fail-open on RPC error: %s", (_label, error) => {
    it("resolves to null with isError=false, never throwing", async () => {
      mockRpcResolves(null, error);
      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
      expect(result.current.isError).toBe(false);
    });
  });

  it("a rejected promise (network error) fails open to null without throwing", async () => {
    mockRpcRejects(new Error("network down"));
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  describe.each([
    ["null body", null],
    ["non-array payload", { unexpected: "shape" }],
    ["a null row", [null]],
    ["invalid engagement_id", [ROW("not-a-uuid", "2026-01-05", "2026-01-09")]],
    ["invalid date format", [ROW("11111111-1111-1111-1111-111111111111", "01/05/2026", "2026-01-09")]],
    ["inverted range", [ROW("11111111-1111-1111-1111-111111111111", "2026-01-09", "2026-01-05")]],
  ])("fail-open on malformed response: %s", (_label, data) => {
    it("resolves to null, never a partial map", async () => {
      mockRpcResolves(data);
      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });
  });

  it("retry:false overrides the global client retry — exactly one call even when an error is returned", async () => {
    mockRpcResolves(null, { message: "denied", code: "EA_SEGMENTS_DENIED" });
    const { wrapper } = createWrapper(); // client configured with retry: 1
    const { result } = renderHook(
      () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("logs at debug level (not warn) for a non-canonical range rejection, without the raw payload", async () => {
    const debugSpy = vi.spyOn(logger, "debug");
    const warnSpy = vi.spyOn(logger, "warn");
    mockRpcResolves(null, { message: "EA_SEGMENTS_INVALID_RANGE: not Monday", code: "P0001" });
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(debugSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    const loggedArgs = debugSpy.mock.calls.flat();
    expect(loggedArgs.join(" ")).not.toContain("2026-01-05");
  });

  it("logs at warn level for other RPC errors and for malformed payloads", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    mockRpcResolves(null, { message: "denied", code: "EA_SEGMENTS_DENIED" });
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(warnSpy).toHaveBeenCalled();
  });

  it("never invokes a toast for any advisory failure", async () => {
    mockRpcResolves(null, { message: "denied", code: "EA_SEGMENTS_DENIED" });
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("a cancellation (unmount mid-flight) is never cached as null", async () => {
    let resolveFn: (v: unknown) => void = () => {};
    vi.mocked(supabase.rpc).mockReturnValue({
      abortSignal: () => new Promise((resolve) => { resolveFn = resolve; }),
    } as never);
    const { wrapper, queryClient } = createWrapper();
    const { unmount } = renderHook(
      () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
      { wrapper },
    );
    unmount();
    // Resolve after unmount to simulate the in-flight request settling post-cancellation.
    resolveFn({ data: [], error: null });
    await new Promise((r) => setTimeout(r, 0));

    const cached = queryClient.getQueryData([
      SCHEDULER_TIMESHEET_AUTHZ_KEY,
      "viewer-1",
      "staff-1",
      "2026-01-05",
      "2026-01-09",
    ]);
    expect(cached).toBeUndefined();
  });

  it("isolates cache by viewer on a single QueryClient — switching accounts never serves the previous viewer's map", async () => {
    const { wrapper, queryClient } = createWrapper();

    // Viewer A: privileged, gets a real window.
    authState.userId = "viewer-A";
    mockRpcResolves([ROW("11111111-1111-1111-1111-111111111111", "2026-01-05", "2026-01-09")]);
    const first = renderHook(
      () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
      { wrapper },
    );
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(first.result.current.data?.size).toBe(1);
    first.unmount();

    // Viewer B: denied.
    authState.userId = "viewer-B";
    mockRpcResolves(null, { message: "denied", code: "EA_SEGMENTS_DENIED" });
    const second = renderHook(
      () => useStaffAssignmentSegments("staff-1", "2026-01-05", "2026-01-09"),
      { wrapper },
    );
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(second.result.current.data).toBeNull();
    second.unmount();

    expect(supabase.rpc).toHaveBeenCalledTimes(2);

    const cachedForA = queryClient.getQueryData([
      SCHEDULER_TIMESHEET_AUTHZ_KEY, "viewer-A", "staff-1", "2026-01-05", "2026-01-09",
    ]) as Map<string, unknown>;
    expect(cachedForA.size).toBe(1);
  });
});
