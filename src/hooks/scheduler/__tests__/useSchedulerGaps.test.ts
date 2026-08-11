// Gaps hooks + transport contract.
//
// THROW model (not a fail-open inversion): gap reporting is a primary
// surface, so failures propagate as typed errors and a malformed 2xx
// throws malformed_response — never Empty, never NaN-contaminated KPIs.
// Viewer-keyed caching and wired role gating are the two lessons under
// test.
//
// Fase 3 (plan v2 §3, issue §11): los fixtures incluyen serviceId/
// serviceName/displayOrder (agrupación por servicio, homónimas distintas).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockInvoke = vi.fn();
const mockFrom = vi.fn();

const authState = vi.hoisted(() => ({ userId: "viewer-1" as string | undefined }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.userId ? { id: authState.userId } : null }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  SchedulerDataError,
  SchedulerUnavailableError,
} from "../schedulerData";
import {
  mapGapsInvokeFailure,
  parseBenchResult,
  parseCategoryHeadcountGapResult,
  parseCategoryHoursGapResult,
  parseCompetencyShortageResult,
} from "../schedulerGapsData";
import {
  useBenchVsPipeline,
  useCategoryHeadcountGap,
  useCategoryHoursGap,
  useCompetencyShortage,
} from "../useSchedulerGaps";
import { useUserRole } from "../../useUserRole";

const CAT_A = "11111111-1111-4111-8111-111111111111";
const SKILL_A = "22222222-2222-4222-8222-222222222222";
const STAFF_A = "33333333-3333-4333-8333-333333333333";
const SERVICE_A = "44444444-4444-4444-8444-444444444444";

const WINDOW = { from: "2026-06-01", to: "2026-06-30", enabled: true };

// Equation-consistent: gap = demand - supply; avgOpenSeats =
// gap / windowDays (the 30-day June WINDOW below).
const WINDOW_DAYS = 30;
const headcountRow = {
  categoryId: CAT_A,
  categoryName: "Senior",
  serviceId: SERVICE_A,
  serviceName: "Audit",
  displayOrder: 1,
  demandFteDays: 30,
  suppliedFteDays: 10,
  gapFteDays: 20,
  avgOpenSeats: 20 / 30,
};

const shortageRow = (deficit: number, overrides: Record<string, unknown> = {}) => ({
  categoryId: CAT_A,
  categoryName: "Senior",
  serviceId: SERVICE_A,
  serviceName: "Audit",
  displayOrder: 1,
  skillId: SKILL_A,
  skillName: "IFRS",
  minLevel: "Advanced",
  demandCount: deficit + 1,
  supplyCount: 1,
  deficit,
  ...overrides,
});

function createClient() {
  // Mimic the app-global QueryClient: retry 1 at the client level so the
  // hook's own retry predicate is what the call-count assertions exercise.
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, gcTime: Infinity, refetchOnWindowFocus: false },
    },
  });
}

function createWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

/** A FunctionsHttpError-shaped invoke outcome carrying an EMS envelope. */
const httpError = (status: number, code: string) => ({
  data: null,
  error: {
    name: "FunctionsHttpError",
    context: {
      status,
      json: async () => ({ error: { code, message: code } }),
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  authState.userId = "viewer-1";
});

// ── Transport mapping ──────────────────────────────────────────────────

describe("mapGapsInvokeFailure (on top of the base mapping)", () => {
  it("schema_not_ready envelope → SchedulerUnavailableError (pre-apply window renders Unavailable, not Error)", () => {
    const mapped = mapGapsInvokeFailure("FunctionsHttpError", 503, {
      error: { code: "schema_not_ready", message: "..." },
    });
    expect(mapped).toBeInstanceOf(SchedulerUnavailableError);
  });

  it("fetch failure and gateway 404 without envelope → Unavailable; enveloped errors → SchedulerDataError with status", () => {
    expect(mapGapsInvokeFailure("FunctionsFetchError", undefined, null)).toBeInstanceOf(
      SchedulerUnavailableError
    );
    expect(mapGapsInvokeFailure("FunctionsHttpError", 404, {})).toBeInstanceOf(
      SchedulerUnavailableError
    );
    const forbidden = mapGapsInvokeFailure("FunctionsHttpError", 403, {
      error: { code: "forbidden", message: "no" },
    });
    expect(forbidden).toBeInstanceOf(SchedulerDataError);
    expect((forbidden as SchedulerDataError).code).toBe("forbidden");
    expect((forbidden as SchedulerDataError).status).toBe(403);
  });
});

// ── Success-payload validators (a cast is not validation) ──

describe("runtime validators — hostile 2xx payloads throw malformed_response", () => {
  it.each([
    ["empty object", {}],
    ["null body", null],
    ["non-array rows", { rows: "nope" }],
    ["null-bearing row", { rows: [null] }],
    ["malformed UUID", { rows: [{ ...headcountRow, categoryId: "cat-1" }] }],
    ["string-typed numeric", { rows: [{ ...headcountRow, gapFteDays: "20" }] }],
    ["NaN numeric", { rows: [{ ...headcountRow, avgOpenSeats: NaN }] }],
    ["missing serviceId", { rows: [{ ...headcountRow, serviceId: undefined }] }],
  ])("headcount validator rejects %s", (_name, payload) => {
    expect(() => parseCategoryHeadcountGapResult(payload, WINDOW_DAYS)).toThrowError(
      expect.objectContaining({ code: "malformed_response" })
    );
  });

  it("a literal rows: [] is the ONLY authoritative-empty", () => {
    expect(parseCategoryHeadcountGapResult({ rows: [] }, WINDOW_DAYS)).toEqual({ rows: [] });
    expect(parseBenchResult({ rows: [] })).toEqual({ rows: [] });
  });

  it.each([
    ["error object without a code", { message: "partial upstream failure" }],
    ["error: null", null],
    ["error: {}", {}],
    ["error as string", "failed"],
    ["error with empty-string code", { code: "", message: "x" }],
  ])(
    "a success body carrying an `error` member (%s) is rejected — its PRESENCE is the defect",
    (_name, errorMember) => {
      expect(() =>
        parseCategoryHeadcountGapResult({ rows: [], error: errorMember }, WINDOW_DAYS)
      ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
      expect(() => parseBenchResult({ rows: [], error: errorMember })).toThrowError(
        expect.objectContaining({ code: "malformed_response" })
      );
    }
  );

  describe("response equations: contradictory metrics never render", () => {
    it("headcount: a false gap beside zero demand/supply rejects; a false-zero gap rejects; avgOpenSeats must match the window", () => {
      const eq = (over: Partial<typeof headcountRow>) => ({
        rows: [{ ...headcountRow, ...over }],
      });
      expect(() =>
        parseCategoryHeadcountGapResult(
          eq({ demandFteDays: 0, suppliedFteDays: 0, gapFteDays: 999, avgOpenSeats: 0.67 }),
          WINDOW_DAYS
        )
      ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
      // False negative: demand > supply but gap claims 0.
      expect(() =>
        parseCategoryHeadcountGapResult(
          eq({ gapFteDays: 0, avgOpenSeats: 0 }),
          WINDOW_DAYS
        )
      ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
      // avgOpenSeats inconsistent with the window.
      expect(() =>
        parseCategoryHeadcountGapResult(eq({ avgOpenSeats: 5 }), WINDOW_DAYS)
      ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
      // FP residue within tolerance is ACCEPTED (the server computes raw).
      const residue = parseCategoryHeadcountGapResult(
        eq({
          demandFteDays: 208.57142857142858,
          suppliedFteDays: 208.57142857142856,
          gapFteDays: 208.57142857142858 - 208.57142857142856,
          avgOpenSeats: (208.57142857142858 - 208.57142857142856) / WINDOW_DAYS,
        }),
        WINDOW_DAYS
      );
      expect(residue.rows).toHaveLength(1);
    });

    it("hours: gapHours must equal demandHours - projectedSupplyHours within tolerance", () => {
      const row = {
        categoryId: CAT_A,
        categoryName: "Senior",
        serviceId: SERVICE_A,
        serviceName: "Audit",
        displayOrder: 1,
        demandHours: 160,
        projectedSupplyHours: 60,
        gapHours: 100,
      };
      expect(parseCategoryHoursGapResult({ rows: [row] }).rows).toHaveLength(1);
      expect(() =>
        parseCategoryHoursGapResult({ rows: [{ ...row, gapHours: 999 }] })
      ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
    });

    it("competency: deficit must equal max(0, demandCount - supplyCount) exactly", () => {
      // Supply exceeds demand but a positive deficit is claimed.
      expect(() =>
        parseCompetencyShortageResult({
          rows: [shortageRow(1, { demandCount: 0, supplyCount: 5, deficit: 1 })],
          truncated: false,
          deficitRowCount: 1,
        })
      ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
      // False negative: real shortage reported as zero deficit.
      expect(() =>
        parseCompetencyShortageResult({
          rows: [shortageRow(0, { demandCount: 6, supplyCount: 5, deficit: 0 })],
          truncated: false,
          deficitRowCount: 0,
        })
      ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
    });
  });

  it("bench validator: valid rows pass; >3 topSkills or negative allocation rejects", () => {
    const row = {
      staffId: STAFF_A,
      staffName: "Ana Alfa",
      serviceId: null,
      serviceName: null,
      categoryName: null,
      currentAllocationPct: 20,
      topSkills: ["IFRS"],
    };
    expect(parseBenchResult({ rows: [row] }).rows).toHaveLength(1);
    expect(() =>
      parseBenchResult({ rows: [{ ...row, topSkills: ["a", "b", "c", "d"] }] })
    ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
    expect(() =>
      parseBenchResult({ rows: [{ ...row, currentAllocationPct: -1 }] })
    ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
  });
});

describe("parseCompetencyShortageResult — deficitRowCount + truncation-consistency invariant", () => {
  const okPayload = (rows: unknown[], truncated: boolean, deficitRowCount: unknown) => ({
    rows,
    truncated,
    deficitRowCount,
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["string-typed", "5"],
    ["negative", -1],
    ["fractional", 1.5],
    ["non-finite", Infinity],
  ])("deficitRowCount %s → malformed_response", (_name, count) => {
    expect(() =>
      parseCompetencyShortageResult(okPayload([shortageRow(1)], false, count))
    ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
  });

  it("non-truncated: deficitRowCount must equal the visible positive rows (less OR more rejects)", () => {
    expect(
      parseCompetencyShortageResult(okPayload([shortageRow(1)], false, 1)).deficitRowCount
    ).toBe(1);
    for (const wrong of [0, 2]) {
      expect(() =>
        parseCompetencyShortageResult(okPayload([shortageRow(1)], false, wrong))
      ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
    }
  });

  const fullPage = (positive: number) => [
    ...Array.from({ length: positive }, (_, i) =>
      shortageRow(1, { skillName: `S${i}` })
    ),
    ...Array.from({ length: 500 - positive }, (_, i) =>
      shortageRow(0, { skillName: `Z${i}` })
    ),
  ];

  it("the 500-row cap is UNCONDITIONAL: 501 rows reject with truncated: false AND with truncated: true", () => {
    const rows501 = Array.from({ length: 501 }, (_, i) =>
      shortageRow(0, { skillName: `S${i}` })
    );
    expect(() =>
      parseCompetencyShortageResult(okPayload(rows501, false, 0))
    ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
    expect(() =>
      parseCompetencyShortageResult(okPayload(rows501, true, 0))
    ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
  });

  it("truncation-consistency hostile cases", () => {
    // {rows: [], truncated: true, deficitRowCount: 999} → reject.
    expect(() => parseCompetencyShortageResult(okPayload([], true, 999))).toThrowError(
      expect.objectContaining({ code: "malformed_response" })
    );
    // <500 rows with truncated: true → reject.
    expect(() =>
      parseCompetencyShortageResult(okPayload([shortageRow(1)], true, 1))
    ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
    // 500 rows containing a visible zero-deficit row, count above the
    // visible positive count → reject.
    expect(() =>
      parseCompetencyShortageResult(okPayload(fullPage(499), true, 600))
    ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
    // 500 all-positive rows with count 500 → accept.
    expect(
      parseCompetencyShortageResult(okPayload(fullPage(500), true, 500)).deficitRowCount
    ).toBe(500);
    // 500 all-positive rows with count > 500 → accept (the only legal excess).
    expect(
      parseCompetencyShortageResult(okPayload(fullPage(500), true, 750)).deficitRowCount
    ).toBe(750);
    // 500 all-positive rows with count < 500 → reject.
    expect(() =>
      parseCompetencyShortageResult(okPayload(fullPage(500), true, 400))
    ).toThrowError(expect.objectContaining({ code: "malformed_response" }));
  });
});

// ── Hook behavior ──────────────────────────────────────────────────────

describe("useCategoryHeadcountGap — gating, retries, viewer keying", () => {
  it.each<[string, () => unknown]>([
    ["useCategoryHeadcountGap", () => useCategoryHeadcountGap({ ...WINDOW, enabled: false })],
    ["useCategoryHoursGap", () => useCategoryHoursGap({ ...WINDOW, enabled: false })],
    ["useCompetencyShortage", () => useCompetencyShortage({ ...WINDOW, enabled: false })],
    ["useBenchVsPipeline", () => useBenchVsPipeline({ enabled: false })],
  ])(
    "%s with enabled: false (role loading / role error / resolved-forbidden) → ZERO scheduler-gaps invocations (all four hooks)",
    async (_name, hook) => {
      const qc = createClient();
      renderHook(hook, { wrapper: createWrapper(qc) });
      await new Promise((r) => setTimeout(r, 20));
      expect(mockInvoke).not.toHaveBeenCalled();
    }
  );

  it("no authenticated viewer → disabled (enabled requires user.id)", async () => {
    authState.userId = undefined;
    const qc = createClient();
    renderHook(() => useCategoryHeadcountGap(WINDOW), { wrapper: createWrapper(qc) });
    await new Promise((r) => setTimeout(r, 20));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("missing window → disabled", async () => {
    const qc = createClient();
    renderHook(() => useCategoryHeadcountGap({ from: "", to: "2026-06-30", enabled: true }), {
      wrapper: createWrapper(qc),
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("errors PROPAGATE (no fail-open) and a validated 2xx returns typed rows", async () => {
    mockInvoke.mockResolvedValue({ data: { rows: [headcountRow] }, error: null });
    const qc = createClient();
    const { result } = renderHook(() => useCategoryHeadcountGap(WINDOW), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.rows[0].categoryId).toBe(CAT_A);
    expect(mockInvoke).toHaveBeenCalledWith("scheduler-gaps", {
      body: {
        action: "category-headcount-gap",
        startDate: WINDOW.from,
        endDate: WINDOW.to,
      },
    });
  });

  it("SchedulerUnavailableError is NOT retried (a missing deployment won't heal)", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { name: "FunctionsFetchError" },
    });
    const qc = createClient();
    const { result } = renderHook(() => useCategoryHeadcountGap(WINDOW), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(SchedulerUnavailableError);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it.each([
    [403, "forbidden"],
    [400, "bad_request"],
    // A revoked session is just as deterministic: the session-recovery
    // boundary resolves it, never a retry.
    [401, "unauthorized"],
  ])("deterministic %i %s is NOT retried", async (status, code) => {
    mockInvoke.mockResolvedValue(httpError(status, code));
    const qc = createClient();
    const { result } = renderHook(() => useCategoryHeadcountGap(WINDOW), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as SchedulerDataError).code).toBe(code);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("a transient 500 IS retried", async () => {
    mockInvoke.mockResolvedValue(httpError(500, "query_failed"));
    const qc = createClient();
    const { result } = renderHook(() => useCategoryHeadcountGap(WINDOW), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(mockInvoke.mock.calls.length).toBeGreaterThan(1);
  });

  it("a malformed 2xx surfaces as an ERROR (malformed_response) with exactly ONE invocation — deterministic, never retried", async () => {
    mockInvoke.mockResolvedValue({ data: { rows: [{ bad: true }] }, error: null });
    const qc = createClient();
    const { result } = renderHook(() => useCategoryHeadcountGap(WINDOW), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as SchedulerDataError).code).toBe("malformed_response");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("a 2xx body with a code-less error member surfaces as malformed_response through the full transport with ONE invocation, never Empty", async () => {
    mockInvoke.mockResolvedValue({
      data: { rows: [], error: { message: "partial upstream failure" } },
      error: null,
    });
    const qc = createClient();
    const { result } = renderHook(() => useCategoryHeadcountGap(WINDOW), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as SchedulerDataError).code).toBe("malformed_response");
    expect(result.current.data).toBeUndefined();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("a 2xx body with a WELL-FORMED envelope keeps its typed code and is NOT retried despite the missing status", async () => {
    mockInvoke.mockResolvedValue({
      data: { error: { code: "forbidden", message: "no" } },
      error: null,
    });
    const qc = createClient();
    const { result } = renderHook(() => useCategoryHeadcountGap(WINDOW), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as SchedulerDataError).code).toBe("forbidden");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("a 2xx body with a schema_not_ready envelope renders Unavailable with ONE invocation — same classification as its non-2xx counterpart", async () => {
    mockInvoke.mockResolvedValue({
      data: { error: { code: "schema_not_ready", message: "not yet" } },
      error: null,
    });
    const qc = createClient();
    const { result } = renderHook(() => useCategoryHeadcountGap(WINDOW), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(SchedulerUnavailableError);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("a schema_not_ready envelope renders Unavailable via the transport", async () => {
    mockInvoke.mockResolvedValue(httpError(503, "schema_not_ready"));
    const qc = createClient();
    const { result } = renderHook(() => useCategoryHeadcountGap(WINDOW), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(SchedulerUnavailableError);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});

describe("viewer-keyed cache — both directions on ONE QueryClient", () => {
  it("a privileged viewer's rows are NEVER served to a later denied viewer", async () => {
    const qc = createClient();
    authState.userId = "viewer-A";
    mockInvoke.mockResolvedValue({ data: { rows: [headcountRow] }, error: null });
    const a = renderHook(() => useCategoryHeadcountGap(WINDOW), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    a.unmount(); // sign-out — the QueryClient and its cache persist

    authState.userId = "viewer-B";
    mockInvoke.mockResolvedValue(httpError(403, "forbidden"));
    const b = renderHook(() => useCategoryHeadcountGap(WINDOW), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(b.result.current.isError).toBe(true));
    expect((b.result.current.error as SchedulerDataError).code).toBe("forbidden");
    expect(b.result.current.data).toBeUndefined(); // NOT viewer A's rows
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it("a denied viewer's error is NEVER served to a later privileged viewer (reverse isolation)", async () => {
    const qc = createClient();
    authState.userId = "viewer-B";
    mockInvoke.mockResolvedValue(httpError(403, "forbidden"));
    const b = renderHook(() => useBenchVsPipeline({ enabled: true }), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(b.result.current.isError).toBe(true));
    b.unmount();

    authState.userId = "viewer-A";
    mockInvoke.mockResolvedValue({
      data: {
        rows: [
          {
            staffId: STAFF_A,
            staffName: "Ana Alfa",
            serviceId: SERVICE_A,
            serviceName: "Audit",
            categoryName: "Senior",
            currentAllocationPct: 10,
            topSkills: [],
          },
        ],
      },
      error: null,
    });
    const a = renderHook(() => useBenchVsPipeline({ enabled: true }), {
      wrapper: createWrapper(qc),
    });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    expect(a.result.current.data!.rows).toHaveLength(1);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});

// ── useUserRole additive refetch ─────────────────────────────

describe("useUserRole exposes a working refetch (additive)", () => {
  it("refetch re-runs the role query so the page's role-error Retry is real", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { id: "r1", user_id: "viewer-1", role: "admin" }, error: null });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    });
    const qc = createClient();
    const { result } = renderHook(() => useUserRole(), { wrapper: createWrapper(qc) });
    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    expect(typeof result.current.refetch).toBe("function");
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    await result.current.refetch();
    await waitFor(() => expect(maybeSingle).toHaveBeenCalledTimes(2));
  });
});
