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

// Mock for `supabase.from(...).update(...).eq(...)` → returns { error }
function mockUpdateEq() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  vi.mocked(supabase.from).mockReturnValue({ update } as never);
  return { update, eq };
}

// Mock for `supabase.from(...).update(...).in(...)` → returns { error }
function mockUpdateIn() {
  const inFn = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ in: inFn });
  vi.mocked(supabase.from).mockReturnValue({ update } as never);
  return { update, in: inFn };
}

describe("useFundRequestExpenseMutations", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("useReviewFundRequestExpense", () => {
    it("applies a 13% IVA penalty when the invoice has an observation", async () => {
      const { update } = mockUpdateEq();
      const { result } = renderHook(() => useReviewFundRequestExpense(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        id: "e1",
        hasObservation: true,
        observationNotes: "NIT incorrecto",
        amount: 100,
        reviewedByStaffId: "s1",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "revisado_asistente",
          has_invoice_observation: true,
          iva_penalty_amount: 13,
        }),
      );
    });

    it("validates with zero penalty when the invoice is correct", async () => {
      const { update } = mockUpdateEq();
      const { result } = renderHook(() => useReviewFundRequestExpense(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "e1", hasObservation: false, amount: 100 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "revisado_asistente",
          has_invoice_observation: false,
          iva_penalty_amount: 0,
        }),
      );
    });

    it("rounds the 13% penalty to 2 decimals", async () => {
      const { update } = mockUpdateEq();
      const { result } = renderHook(() => useReviewFundRequestExpense(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "e1", hasObservation: true, amount: 33.33 });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // 33.33 * 0.13 = 4.3329 → 4.33
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ iva_penalty_amount: 4.33 }),
      );
    });
  });

  describe("useReturnFundRequestExpense", () => {
    it("returns to the requester as observado with the flag set", async () => {
      const { update } = mockUpdateEq();
      const { result } = renderHook(() => useReturnFundRequestExpense(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "e1", notes: "falta respaldo" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "observado",
          returned_by_assistant: true,
          has_invoice_observation: false,
          iva_penalty_amount: 0,
        }),
      );
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
