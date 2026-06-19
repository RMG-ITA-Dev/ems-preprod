import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateFundRequest,
  useUpdateFundRequest,
  useSubmitFundRequest,
  useDecideWorkOrder,
  useSettleFundRequest,
  useCloseFundRequest,
} from "../useFundRequestMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useFundRequestMutations", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("useCreateFundRequest", () => {
    it("inserts the request then its allocations", async () => {
      const single = vi.fn().mockResolvedValue({ data: { fund_request_id: "fr1" }, error: null });
      const frInsert = vi.fn().mockReturnValue({ select: () => ({ single }) });
      const woInsert = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockImplementation(
        (t: string) =>
          (t === "fund_requests" ? { insert: frInsert } : { insert: woInsert }) as never,
      );

      const { result } = renderHook(() => useCreateFundRequest(), { wrapper: createWrapper() });
      result.current.mutate({
        requester_staff_id: "s1",
        total_requested_amount: 100,
        currency: "BOB",
        allocations: [{ wo_id: "wo1", allocated_amount: 100 }],
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(frInsert).toHaveBeenCalledWith(expect.objectContaining({ status: "borrador" }));
      expect(woInsert).toHaveBeenCalledWith([
        { fund_request_id: "fr1", wo_id: "wo1", allocated_amount: 100 },
      ]);
    });

    it("rolls back (deletes the request) if allocations fail", async () => {
      const single = vi.fn().mockResolvedValue({ data: { fund_request_id: "fr1" }, error: null });
      const frInsert = vi.fn().mockReturnValue({ select: () => ({ single }) });
      const frDeleteEq = vi.fn().mockResolvedValue({ error: null });
      const frDelete = vi.fn().mockReturnValue({ eq: frDeleteEq });
      const woInsert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
      vi.mocked(supabase.from).mockImplementation(
        (t: string) =>
          (t === "fund_requests"
            ? { insert: frInsert, delete: frDelete }
            : { insert: woInsert }) as never,
      );

      const { result } = renderHook(() => useCreateFundRequest(), { wrapper: createWrapper() });
      result.current.mutate({
        requester_staff_id: "s1",
        total_requested_amount: 100,
        currency: "BOB",
        allocations: [{ wo_id: "wo1", allocated_amount: 100 }],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(frDelete).toHaveBeenCalled();
      expect(frDeleteEq).toHaveBeenCalledWith("fund_request_id", "fr1");
    });
  });

  describe("useUpdateFundRequest", () => {
    it("saves header + allocations atomically in one RPC (not separate writes)", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);

      const { result } = renderHook(() => useUpdateFundRequest(), { wrapper: createWrapper() });
      result.current.mutate({
        id: "fr1",
        data: {
          total_requested_amount: 200,
          allocations: [{ wo_id: "wo1", allocated_amount: 200 }],
        },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("fund_request_save_edit", {
        p_fund_request_id: "fr1",
        p_fields: { total_requested_amount: 200 },
        p_allocations: [{ wo_id: "wo1", allocated_amount: 200 }],
      });
      // El header ya NO se escribe por separado (todo va dentro del RPC).
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("passes null allocations when none are provided (header-only edit)", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);

      const { result } = renderHook(() => useUpdateFundRequest(), { wrapper: createWrapper() });
      result.current.mutate({ id: "fr1", data: { total_requested_amount: 200 } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("fund_request_save_edit", {
        p_fund_request_id: "fr1",
        p_fields: { total_requested_amount: 200 },
        p_allocations: null,
      });
    });
  });

  describe("useSubmitFundRequest", () => {
    it("resets the OTs to pendiente and sets the request to pendiente_aprobacion", async () => {
      const woEq = vi.fn().mockResolvedValue({ error: null });
      const woUpdate = vi.fn().mockReturnValue({ eq: woEq });
      const frEq = vi.fn().mockResolvedValue({ error: null });
      const frUpdate = vi.fn().mockReturnValue({ eq: frEq });
      vi.mocked(supabase.from).mockImplementation(
        (t: string) =>
          (t === "fund_request_work_orders"
            ? { update: woUpdate }
            : { update: frUpdate }) as never,
      );

      const { result } = renderHook(() => useSubmitFundRequest(), { wrapper: createWrapper() });
      result.current.mutate("fr1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(woUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ approval_status: "pendiente" }),
      );
      expect(frUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pendiente_aprobacion" }),
      );
    });
  });

  describe("useDecideWorkOrder", () => {
    it("rejecting stores the reason and clears manager notes", async () => {
      const eq = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ update } as never);

      const { result } = renderHook(() => useDecideWorkOrder(), { wrapper: createWrapper() });
      result.current.mutate({
        frWoId: "ot1",
        fundRequestId: "fr1",
        decision: "rechazado",
        notes: "no aplica",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          approval_status: "rechazado",
          rejection_reason: "no aplica",
          manager_notes: null,
        }),
      );
      expect(eq).toHaveBeenCalledWith("fr_wo_id", "ot1");
    });

    it("approving stores the optional note as manager_notes", async () => {
      const eq = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ update } as never);

      const { result } = renderHook(() => useDecideWorkOrder(), { wrapper: createWrapper() });
      result.current.mutate({ frWoId: "ot1", fundRequestId: "fr1", decision: "aprobado" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ approval_status: "aprobado", rejection_reason: null }),
      );
    });
  });

  describe("useSettleFundRequest", () => {
    it("saves the snapshot and moves to en_liquidacion (does not close)", async () => {
      const eq = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ update } as never);

      const { result } = renderHook(() => useSettleFundRequest(), { wrapper: createWrapper() });
      result.current.mutate({
        id: "fr1",
        totalSpent: 40,
        balance: 10,
        ivaTotal: 2.6,
        resolution: "devolucion",
        amount: 10,
        notes: "ok",
        settledByStaffId: "s1",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const arg = update.mock.calls[0][0];
      expect(arg).toEqual(
        expect.objectContaining({
          status: "en_liquidacion",
          settlement_total_spent: 40,
          settlement_balance: 10,
          settlement_resolution: "devolucion",
        }),
      );
      expect(arg).not.toHaveProperty("closed_at");
    });
  });

  describe("useCloseFundRequest", () => {
    it("closes the request setting closed_at", async () => {
      const eq = vi.fn().mockResolvedValue({ error: null });
      const update = vi.fn().mockReturnValue({ eq });
      vi.mocked(supabase.from).mockReturnValue({ update } as never);

      const { result } = renderHook(() => useCloseFundRequest(), { wrapper: createWrapper() });
      result.current.mutate({ id: "fr1" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "cerrado" }),
      );
      expect(update.mock.calls[0][0]).toHaveProperty("closed_at");
      expect(eq).toHaveBeenCalledWith("fund_request_id", "fr1");
    });
  });
});
