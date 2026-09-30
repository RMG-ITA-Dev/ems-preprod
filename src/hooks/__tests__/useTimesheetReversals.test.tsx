import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const { mockUseCurrentStaff } = vi.hoisted(() => ({
  mockUseCurrentStaff: vi.fn(() => ({ staffRecord: { staff_id: "s-1" } })),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: mockUseCurrentStaff,
}));

import {
  useApprovedApprovalGroups,
  useRequestTimesheetReversal,
  useExecuteTimesheetReversal,
  useRejectTimesheetReversal,
  useMyReversalRequests,
  useReversalRequests,
} from "../useTimesheetReversals";

// Las 3 mutaciones invalidan el mismo set de queryKeys (invalidateReversalQueries en el hook);
// helper para no repetir la lista de 9 claves en cada test (review iteración 1, hallazgo #10).
const INVALIDATED_KEY_PREFIXES = [
  "pending-approvals",
  "dashboard",
  "pending-approval-summaries",
  "period-line-approvals",
  "staff-timesheet-for-approval",
  "timesheet-week",
  "timesheet-period",
  "reversal-requests",
  "approved-approval-groups",
  "notifications",
];

function expectAllReversalQueriesInvalidated(spy: ReturnType<typeof vi.spyOn>) {
  const invalidatedKeys = spy.mock.calls.map(([arg]: any) => arg.queryKey[0]);
  for (const prefix of INVALIDATED_KEY_PREFIXES) {
    expect(invalidatedKeys).toContain(prefix);
  }
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

// Fake de un query builder de supabase-js: cada método de filtro/orden devuelve el MISMO
// objeto (igual que el cliente real) y `.then()` resuelve con el resultado de esa página --
// necesario para probar la paginación por keyset (review iteración 4, hallazgo #3), donde
// `.gt()`/`.or()` se agregan condicionalmente DESPUÉS de `.limit()` sobre el mismo builder.
function makeQueryBuilder(result: { data: unknown[] | null; error: unknown }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "gte", "gt", "or", "not", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  return Object.assign(builder, {
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  });
}

// Encadena una página por llamada a `supabase.from(...)` -- el hook reconstruye la consulta
// completa en cada vuelta de `fetchAllPages`, así que cada página es un `.from()` nuevo.
function mockSupabaseFromPages(pages: Array<{ data: unknown[] | null; error: unknown }>) {
  const builders = pages.map(makeQueryBuilder);
  let call = 0;
  vi.mocked(supabase.from).mockImplementation(() => {
    const builder = builders[Math.min(call, builders.length - 1)];
    call++;
    return builder as any;
  });
  return builders;
}

describe("useTimesheetReversals (BUG 0923-209)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useApprovedApprovalGroups", () => {
    it("groups approved lines by (period, engagement) and counts lines per group", async () => {
      const rows = [
        {
          approval_id: "appr-1",
          period_id: "p1",
          engagement_id: "eng-1",
          status: "approved",
          period: {
            period_id: "p1",
            week_start_date: "2026-05-04",
            week_number: 19,
            year: 2026,
            staff_id: "staff-1",
            staff: { staff_id: "staff-1", first_name: "Ana", last_name: "Lopez", short_name: null },
          },
          engagement: { engagement_id: "eng-1", engagement_code: "E-1", engagement_name: "Engagement One" },
        },
        {
          // Second line, same (period, engagement) group -> approvedLineCount should be 2.
          approval_id: "appr-2",
          period_id: "p1",
          engagement_id: "eng-1",
          status: "approved",
          period: {
            period_id: "p1",
            week_start_date: "2026-05-04",
            week_number: 19,
            year: 2026,
            staff_id: "staff-1",
            staff: { staff_id: "staff-1", first_name: "Ana", last_name: "Lopez", short_name: null },
          },
          engagement: { engagement_id: "eng-1", engagement_code: "E-1", engagement_name: "Engagement One" },
        },
      ];
      const [builder] = mockSupabaseFromPages([{ data: rows, error: null }]);

      const { result } = renderHook(() => useApprovedApprovalGroups(), {
        wrapper: createWrapper().Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].approvedLineCount).toBe(2);
      expect(result.current.data?.[0].staff.first_name).toBe("Ana");
      // Una sola página: sólo 1 llamada a from() (review iteración 1, hallazgo #6).
      expect(supabase.from).toHaveBeenCalledTimes(1);
      // Orden estable por PK antes de paginar (review iteración 2, hallazgo #2).
      expect(builder.order).toHaveBeenCalledWith("approval_id", { ascending: true });
      // Primera página: sin cursor, no hay `.gt()` (review iteración 4, hallazgo #3).
      expect(builder.gt).not.toHaveBeenCalled();
      // Períodos retirados y bloqueados fuera (review iteración 5 #3 y iteración 9 #2).
      expect(builder.not).toHaveBeenCalledWith("period.submitted_at", "is", null);
      expect(builder.not).toHaveBeenCalledWith("period.is_period_locked", "is", true);
    });

    it("returns an empty array without throwing when there are no approved lines", async () => {
      mockSupabaseFromPages([{ data: [], error: null }]);

      const { result } = renderHook(() => useApprovedApprovalGroups(), {
        wrapper: createWrapper().Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });

    // Review iteración 1, hallazgo #6: PostgREST corta en silencio a 1000 filas por página;
    // sin paginar, un grupo con más de 1000 líneas aprobadas (o más de 1000 líneas repartidas
    // en varios grupos) perdía filas en silencio.
    it("pages by keyset until a page comes back short, merging a group split across pages", async () => {
      const PAGE_SIZE = 1000;
      const makeRow = (approvalId: string) => ({
        approval_id: approvalId,
        period_id: "p1",
        engagement_id: "eng-1",
        status: "approved",
        period: {
          period_id: "p1",
          week_start_date: "2026-05-04",
          week_number: 19,
          year: 2026,
          staff_id: "staff-1",
          staff: { staff_id: "staff-1", first_name: "Ana", last_name: "Lopez", short_name: null },
        },
        engagement: { engagement_id: "eng-1", engagement_code: "E-1", engagement_name: "Engagement One" },
      });
      const firstPage = Array.from({ length: PAGE_SIZE }, (_, i) => makeRow(`appr-${i}`));
      const secondPage = [makeRow("appr-last")]; // 1 fila más del MISMO grupo, en la 2da página.

      const [firstBuilder, secondBuilder] = mockSupabaseFromPages([
        { data: firstPage, error: null },
        { data: secondPage, error: null },
      ]);

      const { result } = renderHook(() => useApprovedApprovalGroups(), {
        wrapper: createWrapper().Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.from).toHaveBeenCalledTimes(2);
      // La 1ra página no tiene cursor; la 2da pide "lo que sigue" al `approval_id` de la
      // última fila de la 1ra -- no un offset (review iteración 4, hallazgo #3).
      expect(firstBuilder.gt).not.toHaveBeenCalled();
      expect(secondBuilder.gt).toHaveBeenCalledWith("approval_id", "appr-999");
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].approvedLineCount).toBe(PAGE_SIZE + 1);
    });
  });

  describe("useRequestTimesheetReversal", () => {
    it("calls request_timesheet_reversal with the exact RPC arguments and invalidates every reversal-related query", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: "req-1", error: null } as any);
      const { Wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useRequestTimesheetReversal(), {
        wrapper: Wrapper,
      });

      result.current.mutate({
        periodId: "p1",
        scope: "week",
        engagementId: null,
        reason: "necesito corregir horas",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("request_timesheet_reversal", {
        p_period_id: "p1",
        p_scope: "week",
        p_engagement_id: null,
        p_reason: "necesito corregir horas",
      });
      expect(toast.success).toHaveBeenCalledWith("timesheet.reversalRequested");
      expectAllReversalQueriesInvalidated(invalidateSpy);
    });

    it("maps REVERSAL_NOT_FULLY_APPROVED to its i18n key instead of the generic handler", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "REVERSAL_NOT_FULLY_APPROVED" },
      } as any);

      const { result } = renderHook(() => useRequestTimesheetReversal(), {
        wrapper: createWrapper().Wrapper,
      });

      result.current.mutate({ periodId: "p1", scope: "week", engagementId: null, reason: "x" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("approval.reversalErrors.notFullyApproved");
    });
  });

  describe("useExecuteTimesheetReversal", () => {
    it("calls execute_timesheet_reversal with the exact RPC arguments and invalidates every reversal-related query", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: "req-1", error: null } as any);
      const { Wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useExecuteTimesheetReversal(), {
        wrapper: Wrapper,
      });

      result.current.mutate({
        periodId: "p1",
        scope: "engagement",
        engagementId: "eng-1",
        reason: "reversion directa",
        requestId: null,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("execute_timesheet_reversal", {
        p_period_id: "p1",
        p_scope: "engagement",
        p_engagement_id: "eng-1",
        p_reason: "reversion directa",
        p_request_id: null,
      });
      expectAllReversalQueriesInvalidated(invalidateSpy);
    });

    it("maps REVERSAL_NOT_ADMIN to its i18n key", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "REVERSAL_NOT_ADMIN" },
      } as any);

      const { result } = renderHook(() => useExecuteTimesheetReversal(), {
        wrapper: createWrapper().Wrapper,
      });

      result.current.mutate({ periodId: "p1", scope: "week", reason: "x" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("approval.reversalErrors.notAdmin");
    });
  });

  describe("useRejectTimesheetReversal", () => {
    it("calls reject_timesheet_reversal with the exact RPC arguments and invalidates every reversal-related query", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
      const { Wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useRejectTimesheetReversal(), {
        wrapper: Wrapper,
      });

      result.current.mutate({ requestId: "req-1", notes: "no corresponde" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("reject_timesheet_reversal", {
        p_request_id: "req-1",
        p_notes: "no corresponde",
      });
      expectAllReversalQueriesInvalidated(invalidateSpy);
    });

    it("maps REVERSAL_REJECT_NOTES_REQUIRED to its i18n key", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "REVERSAL_REJECT_NOTES_REQUIRED" },
      } as any);

      const { result } = renderHook(() => useRejectTimesheetReversal(), {
        wrapper: createWrapper().Wrapper,
      });

      result.current.mutate({ requestId: "req-1", notes: "" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("approval.reversalErrors.rejectNotesRequired");
    });
  });

  // Review iteración 1, hallazgo #4: "Mis solicitudes" mostraba pedidos ajenos porque el query
  // no filtraba por `requested_by` -- se apoyaba sólo en la RLS, que también expone alcance
  // ENCARGO a cualquier aprobador del mismo encargo, no sólo a quien lo pidió.
  describe("useMyReversalRequests", () => {
    it("filters by the current user's staff_id, not just by whatever RLS allows", async () => {
      // Cadena: select().eq("requested_by").order("requested_at").order("request_id")
      // .limit() -- paginado (review iteración 3, hallazgo #9), keyset (review iteración 4,
      // hallazgo #3).
      const [builder] = mockSupabaseFromPages([{ data: [], error: null }]);

      const { result } = renderHook(() => useMyReversalRequests(), {
        wrapper: createWrapper().Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(builder.eq).toHaveBeenCalledWith("requested_by", "s-1");
      expect(builder.limit).toHaveBeenCalledWith(1000);
      expect(builder.or).not.toHaveBeenCalled();
    });

    it("stays disabled without hitting the network when the current staff record isn't loaded yet", () => {
      mockUseCurrentStaff.mockReturnValueOnce({ staffRecord: undefined });

      const { result } = renderHook(() => useMyReversalRequests(), {
        wrapper: createWrapper().Wrapper,
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(supabase.from).not.toHaveBeenCalled();
    });

    // Review iteración 4, hallazgo #3: `.range()` por offset puede correr una fila de página
    // si se crea/resuelve una solicitud entre el fetch de una página y la siguiente. El
    // keyset compuesto (`requested_at desc, request_id asc`) no depende de la posición.
    it("pages by the composite (requested_at, request_id) keyset, not by offset", async () => {
      const PAGE_SIZE = 1000;
      const makeRequest = (requestId: string, requestedAt: string) => ({
        request_id: requestId,
        requested_at: requestedAt,
        status: "pending",
      });
      const firstPage = Array.from({ length: PAGE_SIZE }, (_, i) =>
        makeRequest(`req-${String(i).padStart(4, "0")}`, "2026-09-30T10:00:00.000Z"),
      );
      const secondPage = [makeRequest("req-last", "2026-09-30T09:00:00.000Z")];
      const [, secondBuilder] = mockSupabaseFromPages([
        { data: firstPage, error: null },
        { data: secondPage, error: null },
      ]);

      const { result } = renderHook(() => useMyReversalRequests(), {
        wrapper: createWrapper().Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.from).toHaveBeenCalledTimes(2);
      const lastOfFirstPage = firstPage[firstPage.length - 1];
      expect(secondBuilder.or).toHaveBeenCalledWith(
        `requested_at.lt.${lastOfFirstPage.requested_at},and(requested_at.eq.${lastOfFirstPage.requested_at},request_id.gt.${lastOfFirstPage.request_id})`,
      );
      expect(result.current.data).toHaveLength(PAGE_SIZE + 1);
    });
  });

  describe("useReversalRequests", () => {
    it("defaults to the pending queue when no status filter is given", async () => {
      // Cadena: select().eq("status").order("requested_at").order("request_id").limit()
      // -- paginado (review iteración 3, hallazgo #9), keyset (review iteración 4, hallazgo #3).
      const [builder] = mockSupabaseFromPages([{ data: [], error: null }]);

      const { result } = renderHook(() => useReversalRequests(), {
        wrapper: createWrapper().Wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(builder.eq).toHaveBeenCalledWith("status", "pending");
      expect(builder.limit).toHaveBeenCalledWith(1000);
      expect(builder.or).not.toHaveBeenCalled();
    });
  });
});
