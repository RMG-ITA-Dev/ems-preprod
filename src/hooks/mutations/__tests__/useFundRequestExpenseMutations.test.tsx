import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useReviewFundRequestExpense,
  useReturnFundRequestExpense,
  useResendReturnedExpense,
  useSubmitAllFundRequestExpenses,
  useDecideAllFundRequestExpenses,
} from "../useFundRequestExpenseMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Las mutaciones cierran con `.select("fre_id")` y verifican filas afectadas
// (assertAffected): RLS no lanza error al bloquear un UPDATE, así que sin esa
// verificación la mutación resolvía y la UI cantaba éxito sin cambio alguno.
// Los mocks devuelven filas para representar el camino permitido.

// `supabase.from(...).update(...).eq(...).select(...)` → { data, error }
function mockUpdateEq(rows: { fre_id: string }[] = [{ fre_id: "e1" }]) {
  const select = vi.fn().mockResolvedValue({ data: rows, error: null });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  vi.mocked(supabase.from).mockReturnValue({ update } as never);
  return { update, eq, select };
}

// `supabase.from(...).update(...).in(...).select(...)` → { data, error }
function mockUpdateIn(rows: { fre_id: string }[] = [{ fre_id: "e1" }, { fre_id: "e2" }]) {
  const select = vi.fn().mockResolvedValue({ data: rows, error: null });
  const inFn = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ in: inFn });
  vi.mocked(supabase.from).mockReturnValue({ update } as never);
  return { update, in: inFn, select };
}

describe("useFundRequestExpenseMutations", () => {
  beforeEach(() => vi.clearAllMocks());

  // La revisión contable va por la RPC fund_request_expense_review: el 13% de IVA, el
  // revisor y la validación de estado viven en el servidor (cubiertos por
  // supabase/tests/rls-fund-accounting-parity.sql).
  describe("useReviewFundRequestExpense", () => {
    it("sends 'incorrect' with the observation when the invoice has one", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
      const { result } = renderHook(() => useReviewFundRequestExpense(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "e1", hasObservation: true, observationNotes: "NIT incorrecto" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("fund_request_expense_review", {
        p_fre_id: "e1",
        p_decision: "incorrect",
        p_notes: "NIT incorrecto",
      });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("sends 'correct' without notes when the invoice is correct", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
      const { result } = renderHook(() => useReviewFundRequestExpense(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "e1", hasObservation: false, observationNotes: "ignorada" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("fund_request_expense_review", {
        p_fre_id: "e1",
        p_decision: "correct",
        p_notes: null,
      });
    });
  });

  describe("useReturnFundRequestExpense", () => {
    it("returns the expense to the requester through the RPC", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
      const { result } = renderHook(() => useReturnFundRequestExpense(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "e1", notes: "falta respaldo" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("fund_request_expense_review", {
        p_fre_id: "e1",
        p_decision: "return",
        p_notes: "falta respaldo",
      });
    });
  });

  describe("useResendReturnedExpense", () => {
    it("resends straight to accounting (aprobado_gerente) and clears the flag", async () => {
      const { update } = mockUpdateEq();
      const { result } = renderHook(() => useResendReturnedExpense(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "e1", attachmentUrl: "https://x/r.pdf" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(update).toHaveBeenCalledWith({
        attachment_url: "https://x/r.pdf",
        status: "aprobado_gerente",
        returned_by_assistant: false,
      });
    });
  });

  describe("useSubmitAllFundRequestExpenses", () => {
    it("submits the batch to pendiente_aprobacion via .in()", async () => {
      const { update, in: inFn } = mockUpdateIn();
      const { result } = renderHook(() => useSubmitAllFundRequestExpenses(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ fundRequestId: "fr1", ids: ["e1", "e2"] });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pendiente_aprobacion" }),
      );
      expect(inFn).toHaveBeenCalledWith("fre_id", ["e1", "e2"]);
    });

    it("does nothing when there are no ids", async () => {
      const { update } = mockUpdateIn();
      const { result } = renderHook(() => useSubmitAllFundRequestExpenses(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ fundRequestId: "fr1", ids: [] });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe("useDecideAllFundRequestExpenses", () => {
    it("maps the batch decision to the right status and clears the opposite note", async () => {
      const { update, in: inFn } = mockUpdateIn();
      const { result } = renderHook(() => useDecideAllFundRequestExpenses(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        fundRequestId: "fr1",
        ids: ["e1"],
        decision: "rechazado",
        notes: "no corresponde",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "rechazado",
          rejection_reason: "no corresponde",
          manager_notes: null,
        }),
      );
      expect(inFn).toHaveBeenCalledWith("fre_id", ["e1"]);
    });

    it("approves the batch storing the note as manager_notes", async () => {
      const { update } = mockUpdateIn();
      const { result } = renderHook(() => useDecideAllFundRequestExpenses(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        fundRequestId: "fr1",
        ids: ["e1", "e2"],
        decision: "aprobado_gerente",
        notes: "ok",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "aprobado_gerente",
          manager_notes: "ok",
          rejection_reason: null,
        }),
      );
    });
  });
});
