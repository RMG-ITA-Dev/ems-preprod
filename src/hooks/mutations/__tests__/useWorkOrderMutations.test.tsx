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
  useApproveEmergencyReview,
  useApproveEmergencyPartner,
  useRejectRisk,
  useRevertSocioApproval,
  useRevertRiskApproval,
  useCompleteRiskAssessment,
  useRejectWorkOrder,
  useUnsubmitWorkOrder,
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
        emergency_justification: null,
      });
      expect(mockEq).toHaveBeenCalledWith("wo_id", "wo-1");
      expect(toast.success).toHaveBeenCalled();
    });

    it("should not touch notes on resubmit (respeta fix 49c2ac5)", async () => {
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

      const payload = mockUpdate.mock.calls[0][0];
      expect(payload).toHaveProperty("approval_status", "Pending_Approval");
      expect(payload).not.toHaveProperty("notes");
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

      result.current.mutate({ woId: "wo-1", emergencyJustification: "Pedido por correo" });

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
        emergency_justification: "Pedido por correo",
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

      result.current.mutate({ woId: "wo-1", staffId: "admin-1" });
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

    it("does NOT write any emergency_* fields (those belong to the two-step hooks)", async () => {
      const { mockUpdate } = makeRiskMock({ wo_id: "wo-1" });

      const { result } = renderHook(() => useApproveRisk(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", staffId: "admin-1" });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const riskWrite = mockUpdate.mock.calls.map((c) => c[0]).find((a) => a.risk_status);
      expect("emergency_deadline_at" in riskWrite).toBe(false);
      expect("emergency_justification" in riskWrite).toBe(false);
    });
  });

  describe("useApproveEmergencyReview (emergency step 1: Riesgo)", () => {
    it("records the first sign-off only — no deadline, no close", async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: { wo_id: "wo-1" }, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useApproveEmergencyReview(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", staffId: "admin-1" });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const arg = mockUpdate.mock.calls[0][0];
      expect(arg.emergency_review_by).toBe("admin-1");
      expect(arg.emergency_review_at).toBeTruthy();
      expect("risk_status" in arg).toBe(false);
      expect("emergency_deadline_at" in arg).toBe(false);
      // Only one UPDATE — no conditional close.
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("useApproveEmergencyPartner (emergency step 2: Socio de Riesgos)", () => {
    it("sets Emergency_Approved + deadline (+7d) and closes when Socio track is done", async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: { wo_id: "wo-1" }, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockNot = vi.fn().mockResolvedValue({ error: null });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect, not: mockNot });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useApproveEmergencyPartner(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", staffId: "admin-2" });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const riskWrite = mockUpdate.mock.calls
        .map((c) => c[0])
        .find((arg) => arg.risk_status === "Emergency_Approved");
      expect(riskWrite).toBeTruthy();
      expect(riskWrite.emergency_partner_by).toBe("admin-2");
      const expected = new Date();
      expected.setDate(expected.getDate() + 7);
      expect(riskWrite.emergency_deadline_at).toBe(expected.toISOString().split("T")[0]);
      // Conditional close gated on the Socio track.
      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Approved" });
      expect(mockNot).toHaveBeenCalledWith("approved_at", "is", null);
    });
  });

  describe("useRejectRisk", () => {
    it("sets only risk_status=Rejected + notes; does NOT touch approval_status nor emergency_*", async () => {
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

      const arg = mockUpdate.mock.calls[0][0];
      expect(arg).toEqual({
        risk_status: "Rejected",
        risk_notes: "Falta documentación",
      });
      // Tracks independientes: no toca el Socio ni la emergencia.
      expect("approval_status" in arg).toBe(false);
      expect("emergency_deadline_at" in arg).toBe(false);
    });
  });

  describe("useRevertSocioApproval (admin)", () => {
    it("clears the Socio track and reopens the OT if it was Approved", async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: { wo_id: "wo-1" }, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      // First update: .eq().select().single(); second (reopen): .eq().eq()
      const mockEq2 = vi.fn().mockResolvedValue({ error: null });
      const mockEq1 = vi.fn().mockReturnValue({ select: mockSelect, eq: mockEq2 });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useRevertSocioApproval(), {
        wrapper: createWrapper(),
      });
      result.current.mutate({ woId: "wo-1" });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({ approved_by: null, approved_at: null });
      // Conditional reopen gated on approval_status='Approved'.
      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Pending_Approval" });
      expect(mockEq2).toHaveBeenCalledWith("approval_status", "Approved");
    });
  });

  describe("useRevertRiskApproval (admin)", () => {
    it("resets the Risk track to Pending and reopens the OT if it was Approved", async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: { wo_id: "wo-1" }, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq2 = vi.fn().mockResolvedValue({ error: null });
      const mockEq1 = vi.fn().mockReturnValue({ select: mockSelect, eq: mockEq2 });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useRevertRiskApproval(), {
        wrapper: createWrapper(),
      });
      result.current.mutate({ woId: "wo-1" });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const arg = mockUpdate.mock.calls[0][0];
      expect(arg.risk_status).toBe("Pending");
      expect(arg.risk_approved_at).toBeNull();
      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Pending_Approval" });
      expect(mockEq2).toHaveBeenCalledWith("approval_status", "Approved");
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

    it("should clear notes on the Socio approve write", async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: { wo_id: "wo-1" }, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockIn = vi.fn().mockResolvedValue({ error: null });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect, in: mockIn });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useApproveWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", staffId: "staff-1" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Dual-track: the Socio write records the approver and clears notes; the
      // approval_status close is a separate conditional UPDATE.
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ approved_by: "staff-1", notes: null })
      );
    });
  });

  describe("useUnsubmitWorkOrder", () => {
    it("writes ONLY { approval_status: 'Draft' } — no toca approved_at ni risk_status (contrato bug 0306-78)", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Draft" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUnsubmitWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("wo-1");
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const arg = mockUpdate.mock.calls[0][0];
      expect(arg).toEqual({ approval_status: "Draft" });
      // La pista Socio (approved_at) y la pista Riesgos (risk_status) deben permanecer.
      expect("approved_at" in arg).toBe(false);
      expect("risk_status" in arg).toBe(false);
      expect(mockEq).toHaveBeenCalledWith("wo_id", "wo-1");
    });
  });

  describe("useRejectWorkOrder", () => {
    it("should set approval_status to Rejected with notes: null when no note given", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Draft" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useRejectWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("work_orders");
      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Rejected", notes: null });
      expect(mockEq).toHaveBeenCalledWith("wo_id", "wo-1");
      expect(toast.success).toHaveBeenCalled();
    });

    it("should save trimmed notes when provided", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Draft" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useRejectWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", notes: "Falta CEAC" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Rejected", notes: "Falta CEAC" });
    });

    it("should set notes to null when note is whitespace-only", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Draft" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useRejectWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", notes: "   " });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({ approval_status: "Rejected", notes: null });
    });
  });
});
