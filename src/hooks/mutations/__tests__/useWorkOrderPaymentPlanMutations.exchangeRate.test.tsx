import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useUpsertPaymentPlan,
  useBatchUpsertInstallments,
  useUpdateInstallmentStatus,
  useUpdateInstallmentExchangeRate,
} from "../useWorkOrderPaymentPlanMutations";

// 0722-156b (Fase 2): upsert incluye exchange_rate_mode; el batch de cuotas incluye los 2
// TCs nuevos; la transicion de estado incluye el snapshot de TC correspondiente en el MISMO
// update (atomico); el error EXCHANGE_RATE_LOCKED del trigger de freeze dispara un toast
// especifico en vez del generico de createMutationErrorHandler.

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useWorkOrderPaymentPlanMutations — exchange rate (0722-156b Fase 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useUpsertPaymentPlan", () => {
    it("PEX1: upsert payload includes exchange_rate_mode", async () => {
      const mockData = {
        plan_id: "plan-1",
        wo_id: "wo-1",
        exchange_rate: 6.96,
        payment_days: 30,
        exchange_rate_mode: "variable",
      };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as any);

      const { result } = renderHook(() => useUpsertPaymentPlan(), { wrapper: createWrapper() });
      result.current.mutate({
        wo_id: "wo-1",
        exchange_rate: 6.96,
        payment_days: 30,
        exchange_rate_mode: "variable",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ exchange_rate_mode: "variable" }),
        { onConflict: "wo_id" },
      );
    });

    it("PEX2: EXCHANGE_RATE_LOCKED error shows the specific translated toast, not the generic handler", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "EXCHANGE_RATE_LOCKED: el tipo de cambio del plan de pagos no puede modificarse" },
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as any);

      const { result } = renderHook(() => useUpsertPaymentPlan(), { wrapper: createWrapper() });
      result.current.mutate({ wo_id: "wo-1", exchange_rate: 7.0, payment_days: 30, exchange_rate_mode: "fijo" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("workOrders.paymentPlan.errorExchangeRateLocked");
    });
  });

  describe("useBatchUpsertInstallments", () => {
    it("PEX3: rows sent for upsert include invoice_exchange_rate and payment_exchange_rate", async () => {
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ error: null }) }),
      });
      const mockUpsertInst = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, upsert: mockUpsertInst } as any);

      const { result } = renderHook(() => useBatchUpsertInstallments(), { wrapper: createWrapper() });
      result.current.mutate({
        planId: "plan-1",
        woId: "wo-1",
        installments: [
          {
            installment_id: "inst-1",
            plan_id: "plan-1",
            wo_id: "wo-1",
            installment_number: 1,
            agreed_invoice_date: null,
            agreed_payment_date: null,
            collection_invoice_date: null,
            collection_payment_date: null,
            payment_date_actual: null,
            percentage: 100,
            amount: 1000,
            status: "Pending",
            invoice_exchange_rate: 6.96,
            payment_exchange_rate: 6.96,
          },
        ],
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockUpsertInst).toHaveBeenCalledWith(
        [expect.objectContaining({ invoice_exchange_rate: 6.96, payment_exchange_rate: 6.96 })],
        { onConflict: "installment_id" },
      );
    });
  });

  describe("useUpdateInstallmentStatus", () => {
    it("PEX4: transitioning to Invoiced writes status + invoice_exchange_rate in the SAME update call", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateInstallmentStatus(), { wrapper: createWrapper() });
      result.current.mutate({
        installmentId: "inst-1",
        newStatus: "Invoiced",
        prevStatus: "Pending",
        woId: "wo-1",
        paymentDays: 30,
        invoiceExchangeRate: 6.97,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "Invoiced", invoice_exchange_rate: 6.97 }),
      );
    });

    it("PEX5: transitioning to Completed writes status + payment_exchange_rate in the SAME update call", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateInstallmentStatus(), { wrapper: createWrapper() });
      result.current.mutate({
        installmentId: "inst-1",
        newStatus: "Completed",
        prevStatus: "Invoiced",
        woId: "wo-1",
        paymentExchangeRate: 7.01,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "Completed", payment_exchange_rate: 7.01 }),
      );
    });

    it("PEX6: a manual Invoiced->Overdue revert does NOT touch invoice_exchange_rate (stays frozen)", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateInstallmentStatus(), { wrapper: createWrapper() });
      result.current.mutate({
        installmentId: "inst-1",
        newStatus: "Overdue",
        prevStatus: "Invoiced",
        woId: "wo-1",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload).not.toHaveProperty("invoice_exchange_rate");
      expect(updatePayload).not.toHaveProperty("payment_exchange_rate");
    });

    it("PEX7: EXCHANGE_RATE_LOCKED error on a status update shows the specific translated toast", async () => {
      const mockEq = vi.fn().mockResolvedValue({
        error: { message: "EXCHANGE_RATE_LOCKED: el tipo de cambio de facturacion de esta cuota ya esta congelado" },
      });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateInstallmentStatus(), { wrapper: createWrapper() });
      result.current.mutate({
        installmentId: "inst-1",
        newStatus: "Invoiced",
        prevStatus: "Pending",
        woId: "wo-1",
        invoiceExchangeRate: 6.97,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("workOrders.paymentPlan.errorExchangeRateLocked");
    });
  });

  // Amendment 2026-09-07: TC Facturación/Pago solo se habilitan con la OT Aprobada,
  // momento en el que ya no hay boton "Guardar" de pagina — se persisten de inmediato
  // (mismo patron que useUpdateCollectionDate) para no quedar atrapados en memoria.
  describe("useUpdateInstallmentExchangeRate", () => {
    it("PEX8: persiste invoice_exchange_rate directo, sin pasar por otra columna", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateInstallmentExchangeRate(), { wrapper: createWrapper() });
      result.current.mutate({ installmentId: "inst-1", field: "invoice_exchange_rate", value: 6.97, woId: "wo-1" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockUpdate).toHaveBeenCalledWith({ invoice_exchange_rate: 6.97 });
      expect(mockEq).toHaveBeenCalledWith("installment_id", "inst-1");
    });

    it("PEX9: persiste payment_exchange_rate directo", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateInstallmentExchangeRate(), { wrapper: createWrapper() });
      result.current.mutate({ installmentId: "inst-1", field: "payment_exchange_rate", value: 7.01, woId: "wo-1" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockUpdate).toHaveBeenCalledWith({ payment_exchange_rate: 7.01 });
    });

    it("PEX10: EXCHANGE_RATE_LOCKED (ej. la cuota se congelo en otra pestaña) muestra el toast especifico", async () => {
      const mockEq = vi.fn().mockResolvedValue({
        error: { message: "EXCHANGE_RATE_LOCKED: el tipo de cambio de facturacion de esta cuota ya esta congelado" },
      });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateInstallmentExchangeRate(), { wrapper: createWrapper() });
      result.current.mutate({ installmentId: "inst-1", field: "invoice_exchange_rate", value: 6.97, woId: "wo-1" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("workOrders.paymentPlan.errorExchangeRateLocked");
    });
  });
});
