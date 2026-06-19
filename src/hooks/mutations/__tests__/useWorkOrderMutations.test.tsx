import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateWorkOrder,
  useSubmitWorkOrder,
  useApproveWorkOrder,
  useApproveRisk,
  useRejectRisk,
  useCompleteRiskAssessment,
  useRejectWorkOrder,
} from "../useWorkOrderMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useWorkOrderMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateWorkOrder", () => {
    it("should create a work order with required fields", async () => {
      const mockData = {
        wo_id: "wo-1",
        engagement_id: "eng-1",
        currency: "USD",
        season_mode: "high",
        tax_rate: 13,
      };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateWorkOrder(), {
        wrapper: createWrapper(),
      });

      const inputData = {
        engagement_id: "eng-1",
        currency: "USD",
        season_mode: "high",
        tax_rate: 13,
      };

      result.current.mutate(inputData);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("work_orders");
      expect(mockInsert).toHaveBeenCalledWith(inputData);
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useSubmitWorkOrder", () => {
    it("should update approval_status to Pending_Approval and persist risk fields", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Pending_Approval" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useSubmitWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        woId: "wo-1",
        ceacCompletedAt: "2026-05-01",
        ceacNotes: "OK",
        sanCompletedAt: "2026-04-15",
        sanNotes: null,
        ceacNumber: "1234567890",
        sanApprovalId: "12345-67890",
        riskLevel: "Bajo",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("work_orders");
      expect(mockUpdate).toHaveBeenCalledWith({
        approval_status: "Pending_Approval",
        ceac_completed_at: "2026-05-01",
        ceac_notes: "OK",
        san_completed_at: "2026-04-15",
        san_notes: null,
        ceac_number: "1234567890",
        san_approval_id: "12345-67890",
        risk_level: "Bajo",
      });
      expect(mockEq).toHaveBeenCalledWith("wo_id", "wo-1");
      expect(toast.success).toHaveBeenCalled();
    });

    it("should persist null risk fields when not provided (emergency submit)", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Pending_Approval" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useSubmitWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({
        approval_status: "Pending_Approval",
        ceac_completed_at: null,
        ceac_notes: null,
        san_completed_at: null,
        san_notes: null,
        ceac_number: null,
        san_approval_id: null,
        risk_level: null,
      });
    });
  });

  describe("useApproveWorkOrder (Socio track)", () => {
    // Builds a mock whose update().eq() supports both the Socio write
    // (.select().single()) and the conditional close (.in(...)).
    function makeApproveMock(singleData: unknown) {
      const mockSingle = vi.fn().mockResolvedValue({ data: singleData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockIn = vi.fn().mockResolvedValue({ error: null });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect, in: mockIn });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);
      return { mockUpdate, mockEq, mockIn };
    }

    it("writes the Socio approver, then closes only via a conditional UPDATE gated on risk_status", async () => {
      const { mockUpdate, mockIn } = makeApproveMock({ wo_id: "wo-1" });

      const { result } = renderHook(() => useApproveWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", staffId: "staff-1" });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // 1) Socio track: approver info, NO approval_status, NO risk fields.
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ approved_by: "staff-1" })
      );
      expect(mockUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({ ceac_completed_at: expect.anything() })
      );
      // 2) Atomic close: approval_status='Approved' gated on risk_status already approved.
      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Approved" });
      expect(mockIn).toHaveBeenCalledWith("risk_status", [
        "Approved",
        "Emergency_Approved",
      ]);
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useApproveRisk (Riesgos track)", () => {
    function makeRiskMock(singleData: unknown) {
      const mockSingle = vi.fn().mockResolvedValue({ data: singleData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockNot = vi.fn().mockResolvedValue({ error: null });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect, not: mockNot });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);
      return { mockUpdate, mockNot };
    }

    it("normal approval sets risk_status=Approved and closes when Socio track is done", async () => {
      const { mockUpdate, mockNot } = makeRiskMock({ wo_id: "wo-1" });

      const { result } = renderHook(() => useApproveRisk(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", staffId: "admin-1", isEmergency: false });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          risk_status: "Approved",
          risk_approved_by: "admin-1",
        })
      );
      // Conditional close gated on the Socio track (approved_at IS NOT NULL).
      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Approved" });
      expect(mockNot).toHaveBeenCalledWith("approved_at", "is", null);
    });

    it("emergency approval sets Emergency_Approved with deadline (+7d) and justification", async () => {
      const { mockUpdate } = makeRiskMock({ wo_id: "wo-1" });

      const { result } = renderHook(() => useApproveRisk(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        woId: "wo-1",
        staffId: "admin-1",
        isEmergency: true,
        emergencyJustification: "Solicitado a Riesgos por correo",
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const riskWrite = mockUpdate.mock.calls
        .map((c) => c[0])
        .find((arg) => arg.risk_status === "Emergency_Approved");
      expect(riskWrite).toBeTruthy();
      expect(riskWrite.emergency_justification).toBe("Solicitado a Riesgos por correo");
      // +7 calendar days from today, formatted YYYY-MM-DD.
      const expected = new Date();
      expected.setDate(expected.getDate() + 7);
      expect(riskWrite.emergency_deadline_at).toBe(
        expected.toISOString().split("T")[0]
      );
    });
  });

  describe("useRejectRisk", () => {
    it("sets risk_status=Rejected with notes and returns the OT to Draft", async () => {
      const mockData = { wo_id: "wo-1", risk_status: "Rejected" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useRejectRisk(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", riskNotes: "Falta documentación" });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({
        risk_status: "Rejected",
        risk_notes: "Falta documentación",
        approval_status: "Draft",
      });
    });
  });

  describe("useCompleteRiskAssessment", () => {
    it("writes the 5 risk fields, resets risk_status=Pending, and leaves approval_status untouched", async () => {
      const mockData = { wo_id: "wo-1", risk_status: "Pending" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useCompleteRiskAssessment(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        woId: "wo-1",
        ceacCompletedAt: "2026-06-01",
        ceacNumber: "1234567890",
        sanCompletedAt: "2026-05-20",
        sanApprovalId: "12345-67890",
        riskLevel: "Moderado",
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const arg = mockUpdate.mock.calls[0][0];
      expect(arg.risk_status).toBe("Pending");
      expect(arg.ceac_completed_at).toBe("2026-06-01");
      expect(arg.risk_level).toBe("Moderado");
      expect("approval_status" in arg).toBe(false);
    });
  });

  describe("useRejectWorkOrder", () => {
    it("should set approval_status back to Draft", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Draft" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useRejectWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("wo-1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("work_orders");
      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Draft" });
      expect(toast.success).toHaveBeenCalled();
    });
  });
});
