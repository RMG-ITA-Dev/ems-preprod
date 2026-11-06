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
  useUpdateWorkOrder,
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
        emergencyJustification: null, // normal submit: WorkOrderEdit passes null to clear any stale value
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

    it("should include risk_status=Pending when resetRiskToPending=true (Rejected track reset)", async () => {
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
        ceacNumber: "1234567890",
        sanCompletedAt: "2026-04-15",
        sanApprovalId: "12345-67890",
        riskLevel: "Bajo",
        emergencyJustification: null,
        resetRiskToPending: true,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const payload = mockUpdate.mock.calls[0][0];
      expect(payload).toHaveProperty("risk_status", "Pending");
      expect(payload).toHaveProperty("approval_status", "Pending_Approval");
    });

    it("should NOT include risk_status when resetRiskToPending is false or omitted (Approved track preserved)", async () => {
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
        emergencyJustification: null,
        resetRiskToPending: false,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const payload = mockUpdate.mock.calls[0][0];
      expect(payload).not.toHaveProperty("risk_status");
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

  // 1028-213 (D-37): la escritura de Riesgos va por funciones del servidor. El cliente solo manda
  // el id de la OT (y las notas del rechazo): el actor sale de get_my_staff_id() en el servidor,
  // la precondición ("la primera gana") y las columnas escritas las decide la función.
  describe("Riesgos por RPC (1028-213)", () => {
    function renderWithSpy<T>(hook: () => T) {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const spy = vi.spyOn(queryClient, "invalidateQueries");
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      return { ...renderHook(hook, { wrapper }), spy };
    }
    const keysOf = (spy: ReturnType<typeof vi.spyOn>) =>
      spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);

    beforeEach(() => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
    });

    it.each([
      ["useApproveRisk", useApproveRisk, "approve_wo_risk", {}],
      ["useApproveEmergencyReview", useApproveEmergencyReview, "approve_wo_emergency_review", {}],
      ["useApproveEmergencyPartner", useApproveEmergencyPartner, "approve_wo_emergency_partner", {}],
      [
        "useRejectRisk",
        useRejectRisk,
        "reject_wo_risk",
        { p_risk_notes: "Falta documentación" },
      ],
    ] as const)(
      "%s llama a la RPC %s solo con el id de la OT, sin staffId ni UPDATE directo",
      async (_name, useHook, rpcName, extraArgs) => {
        const { result } = renderWithSpy(() => (useHook as () => any)());

        result.current.mutate({ woId: "wo-1", riskNotes: "Falta documentación" });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const expectedArgs =
          rpcName === "reject_wo_risk" ? { p_wo_id: "wo-1", ...extraArgs } : { p_wo_id: "wo-1" };
        expect(supabase.rpc).toHaveBeenCalledTimes(1);
        expect(supabase.rpc).toHaveBeenCalledWith(rpcName, expectedArgs);
        // Ya no hay UPDATE directo a work_orders ni se manda el actor.
        expect(supabase.from).not.toHaveBeenCalled();
        const sent = vi.mocked(supabase.rpc).mock.calls[0][1] as Record<string, unknown>;
        expect("staffId" in sent).toBe(false);
        expect("p_staff_id" in sent).toBe(false);
        expect(toast.success).toHaveBeenCalled();
      }
    );

    it("useRejectRisk manda p_risk_notes = null cuando no hay notas", async () => {
      const { result } = renderWithSpy(() => useRejectRisk());

      result.current.mutate({ woId: "wo-1" });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.rpc).toHaveBeenCalledWith("reject_wo_risk", {
        p_wo_id: "wo-1",
        p_risk_notes: null,
      });
    });

    it.each([
      ["useApproveRisk", useApproveRisk],
      ["useApproveEmergencyReview", useApproveEmergencyReview],
      ["useApproveEmergencyPartner", useApproveEmergencyPartner],
      ["useRejectRisk", useRejectRisk],
    ] as const)(
      "%s invalida la lista y el detalle de /risks además de las invalidaciones de la OT",
      async (_name, useHook) => {
        const { result, spy } = renderWithSpy(() => (useHook as () => any)());

        result.current.mutate({ woId: "wo-9" });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const keys = keysOf(spy);
        expect(keys).toContainEqual(["risk_work_orders"]);
        expect(keys).toContainEqual(["risk_work_order", "wo-9"]);
        for (const k of [["work_orders"], ["dashboard"], ["work_order"]]) {
          expect(keys).toContainEqual(k);
        }
      }
    );

    it.each([
      ["useApproveRisk", useApproveRisk],
      ["useApproveEmergencyReview", useApproveEmergencyReview],
      ["useApproveEmergencyPartner", useApproveEmergencyPartner],
      ["useRejectRisk", useRejectRisk],
    ] as const)(
      "%s: un error del servidor termina en error y pasa por el manejador de errores",
      async (_name, useHook) => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: null,
          error: { message: "FORBIDDEN", code: "P0001" },
        } as any);
        const { result, spy } = renderWithSpy(() => (useHook as () => any)());

        result.current.mutate({ woId: "wo-1" });
        await waitFor(() => expect(result.current.isError).toBe(true));

        expect(toast.success).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalled();
        // Sin éxito no se invalida la lista de /risks.
        expect(keysOf(spy)).not.toContainEqual(["risk_work_orders"]);
      }
    );

    // Review 1028-213, R1-4: las acciones que NO son RPC de Riesgos pero cambian lo que /risks lee
    // (envío, reenvío de Riesgos, retiro a Draft, reversión de la aprobación) también invalidan.
    describe("otras acciones sobre la OT invalidan /risks (R1-4)", () => {
      beforeEach(() => {
        // Cadena de PostgREST que sirve para update().eq()[.eq()].select().single() y se puede esperar.
        const chain: any = {};
        for (const m of ["update", "eq", "select", "single", "not", "is", "in"]) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: { wo_id: "wo-9" }, error: null });
        vi.mocked(supabase.from).mockReturnValue(chain as any);
      });

      it.each([
        ["useSubmitWorkOrder", useSubmitWorkOrder],
        ["useCompleteRiskAssessment", useCompleteRiskAssessment],
        ["useUnsubmitWorkOrder", useUnsubmitWorkOrder],
        ["useRevertRiskApproval", useRevertRiskApproval],
      ] as const)("%s invalida la lista y el detalle de /risks", async (_name, useHook) => {
        const { result, spy } = renderWithSpy(() => (useHook as () => any)());

        result.current.mutate({ woId: "wo-9" });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const keys = keysOf(spy);
        expect(keys).toContainEqual(["risk_work_orders"]);
        expect(keys).toContainEqual(["risk_work_order", "wo-9"]);
        // Y conserva las invalidaciones que ya tenía.
        for (const k of [["work_orders"], ["dashboard"], ["work_order"]]) {
          expect(keys).toContainEqual(k);
        }
      });

      // Review 1028-213, R5-2: el detalle de /risks muestra el estado del Socio (approval_status / approved_at),
      // así que aprobar, rechazar o revertir esa pista también invalida las consultas de Riesgos.
      it.each([
        ["useApproveWorkOrder", useApproveWorkOrder, { woId: "wo-9", staffId: "staff-1" }],
        ["useRejectWorkOrder", useRejectWorkOrder, { woId: "wo-9", notes: "faltan anexos" }],
        ["useRevertSocioApproval", useRevertSocioApproval, { woId: "wo-9" }],
      ] as const)("%s (pista del Socio) invalida la lista y el detalle de /risks", async (_name, useHook, vars) => {
        const { result, spy } = renderWithSpy(() => (useHook as () => any)());

        result.current.mutate(vars);
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const keys = keysOf(spy);
        expect(keys).toContainEqual(["risk_work_orders"]);
        expect(keys).toContainEqual(["risk_work_order", "wo-9"]);
        for (const k of [["work_orders"], ["dashboard"], ["work_order"]]) {
          expect(keys).toContainEqual(k);
        }
      });

      // Review 1028-213, R9-1: el reenvío de la pista del Socio tras un rechazo (Rejected -> Pending_Approval) usa el
      // hook genérico de actualización; el detalle de /risks muestra ese estado, así que también invalida.
      it("useUpdateWorkOrder (reenvío del Socio) invalida la lista y el detalle de /risks", async () => {
        const { result, spy } = renderWithSpy(() => useUpdateWorkOrder());

        result.current.mutate({ id: "wo-9", data: { approval_status: "Pending_Approval" } });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const keys = keysOf(spy);
        expect(keys).toContainEqual(["risk_work_orders"]);
        expect(keys).toContainEqual(["risk_work_order", "wo-9"]);
        for (const k of [["work_orders"], ["dashboard"], ["work_order"]]) {
          expect(keys).toContainEqual(k);
        }
      });

      it("reenviar solo Riesgos tras un rechazo hace que /risks vuelva a pedir la lista (caso del review)", async () => {
        const { result, spy } = renderWithSpy(() => useCompleteRiskAssessment());

        result.current.mutate({ woId: "wo-9" });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(keysOf(spy).filter((k) => k[0] === "risk_work_orders")).toHaveLength(1);
      });
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
      // Sin emergencyJustification en el argumento => la clave NO está en el payload.
      expect("emergency_justification" in arg).toBe(false);
    });

    it("con emergencyJustification escribe esa clave en el payload", async () => {
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
        emergencyJustification: "Facturación urgente por cierre fiscal",
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const arg = mockUpdate.mock.calls[0][0];
      expect(arg.risk_status).toBe("Pending");
      expect(arg.emergency_justification).toBe("Facturación urgente por cierre fiscal");
    });

    it("FEAT 0602-135: resetSocioToPending=true baja approval_status a Pending_Approval (reenvío tras rechazo)", async () => {
      const mockData = { wo_id: "wo-1", risk_status: "Pending" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useCompleteRiskAssessment(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", resetSocioToPending: true });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const arg = mockUpdate.mock.calls[0][0];
      expect(arg.risk_status).toBe("Pending");
      expect(arg.approval_status).toBe("Pending_Approval");
    });
  });

  // Pseudo-describe que el test original nombra incorrectamente como useCompleteRiskAssessment
  // pero prueba useApproveWorkOrder (notas del Socio). Mantenido para no perder cobertura.
  describe("useApproveWorkOrder — notas del Socio", () => {
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
    it("sets approval_status=Draft and nulls emergency signing timestamps when risk track is in-progress — no toca approved_at ni risk_status (contrato bug 0306-78)", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Draft" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUnsubmitWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", currentRiskStatus: "Pending" });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const arg = mockUpdate.mock.calls[0][0];
      expect(arg.approval_status).toBe("Draft");
      // Emergency signing timestamps must be cleared so a re-submit starts the
      // two-step flow from scratch (stale emergency_review_at would let the partner
      // skip the assistant review).
      expect(arg.emergency_review_by).toBeNull();
      expect(arg.emergency_review_at).toBeNull();
      expect(arg.emergency_partner_by).toBeNull();
      expect(arg.emergency_partner_at).toBeNull();
      expect(arg.emergency_deadline_at).toBeNull();
      expect(arg.emergency_justification).toBeNull();
      // Socio track (approved_at) and Risk track (risk_status) must NOT be touched.
      expect("approved_at" in arg).toBe(false);
      expect("risk_status" in arg).toBe(false);
      expect(mockEq).toHaveBeenCalledWith("wo_id", "wo-1");
    });

    it("preserves emergency audit columns when risk track is Emergency_Approved (Socio-only withdraw)", async () => {
      const mockData = { wo_id: "wo-1", approval_status: "Draft" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUnsubmitWorkOrder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ woId: "wo-1", currentRiskStatus: "Emergency_Approved" });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const arg = mockUpdate.mock.calls[0][0];
      expect(arg.approval_status).toBe("Draft");
      // Emergency columns must NOT be cleared: the risk track is fully signed off
      // and the audit record must be preserved.
      expect("emergency_review_by" in arg).toBe(false);
      expect("emergency_review_at" in arg).toBe(false);
      expect("emergency_partner_by" in arg).toBe(false);
      expect("emergency_partner_at" in arg).toBe(false);
      expect("emergency_deadline_at" in arg).toBe(false);
      expect("emergency_justification" in arg).toBe(false);
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

  // 1028-216: tr_sync_worksheet_status_from_wo mueve activity_worksheets.status en la misma
  // transacción que cada escritura de la OT. El hook solo tiene que refrescar las consultas de la
  // matriz, y en onSettled: la primera de las dos sentencias pudo confirmarse aunque la segunda falle.
  describe("invalidación de la Matriz de Trabajo (1028-216)", () => {
    const WORKSHEET_KEYS = [["worksheets"], ["worksheet"], ["worksheet-by-engagement"]];
    const WORK_ORDER_KEYS = [["work_orders"], ["dashboard"], ["work_order"]];

    // Cadena de PostgREST que acepta cualquier filtro y se resuelve (await) con `res`.
    function chainResolving(res: { data?: unknown; error: unknown }) {
      const chain: Record<string, unknown> = {};
      for (const m of ["update", "eq", "in", "not", "is", "select", "single"]) {
        chain[m] = vi.fn(() => chain);
      }
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(res).then(resolve, reject);
      return chain;
    }

    // Cada supabase.from() consume el siguiente resultado; el último se repite.
    function mockFromSequence(results: Array<{ data?: unknown; error: unknown }>) {
      let i = 0;
      vi.mocked(supabase.from).mockImplementation(
        () => chainResolving(results[Math.min(i++, results.length - 1)]) as any
      );
    }

    function renderWithSpy<T>(hook: () => T) {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const spy = vi.spyOn(queryClient, "invalidateQueries");
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      return { ...renderHook(hook, { wrapper }), spy };
    }

    function invalidatedKeys(spy: ReturnType<typeof vi.spyOn>) {
      return spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    }

    const OK = { data: { wo_id: "wo-1" }, error: null };

    it.each([
      ["useSubmitWorkOrder", useSubmitWorkOrder, { woId: "wo-1" }],
      ["useApproveWorkOrder", useApproveWorkOrder, { woId: "wo-1", staffId: "staff-1" }],
      ["useApproveRisk", useApproveRisk, { woId: "wo-1" }],
      ["useApproveEmergencyPartner", useApproveEmergencyPartner, { woId: "wo-1" }],
      ["useRejectRisk", useRejectRisk, { woId: "wo-1" }],
      ["useRevertSocioApproval", useRevertSocioApproval, { woId: "wo-1" }],
      ["useRevertRiskApproval", useRevertRiskApproval, { woId: "wo-1" }],
      ["useCompleteRiskAssessment", useCompleteRiskAssessment, { woId: "wo-1" }],
      ["useRejectWorkOrder", useRejectWorkOrder, { woId: "wo-1" }],
      ["useUnsubmitWorkOrder", useUnsubmitWorkOrder, { woId: "wo-1" }],
    ] as const)(
      "%s invalida la matriz y conserva las invalidaciones de la OT",
      async (_name, useHook, vars) => {
        mockFromSequence([OK]);
        // Los hooks de Riesgos (1028-213) van por RPC, no por supabase.from().
        vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
        const { result, spy } = renderWithSpy(() => (useHook as () => any)());

        result.current.mutate(vars);
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const keys = invalidatedKeys(spy);
        for (const k of [...WORKSHEET_KEYS, ...WORK_ORDER_KEYS]) {
          expect(keys).toContainEqual(k);
        }
        // La matriz la escribe el trigger: el hook nunca toca activity_worksheets.
        expect(supabase.from).not.toHaveBeenCalledWith("activity_worksheets");
      }
    );

    it.each([
      ["useApproveWorkOrder", useApproveWorkOrder, { woId: "wo-1", staffId: "staff-1" }],
      ["useRevertSocioApproval", useRevertSocioApproval, { woId: "wo-1" }],
    ] as const)(
      "%s: si la segunda sentencia falla, termina en error e invalida la matriz igual",
      async (_name, useHook, vars) => {
        mockFromSequence([OK, { error: { message: "boom" } }]);
        const { result, spy } = renderWithSpy(() => (useHook as () => any)());

        result.current.mutate(vars);
        await waitFor(() => expect(result.current.isError).toBe(true));

        const keys = invalidatedKeys(spy);
        for (const k of WORKSHEET_KEYS) {
          expect(keys).toContainEqual(k);
        }
      }
    );
  });
});
