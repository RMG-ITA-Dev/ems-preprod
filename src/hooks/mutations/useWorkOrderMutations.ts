import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      engagement_id: string;
      currency: string;
      season_mode: string;
      tax_rate: number;
      adjustment_amount?: number;
      approval_status?: string;
    }) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.workOrder") }));
    },
    onError: createMutationErrorHandler("creating work order"),
  });
}

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        adjustment_amount: number;
        approval_status: string;
        approved_by: string;
        approved_at: string;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .update(data)
        .eq("wo_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.workOrder") }));
    },
    onError: createMutationErrorHandler("updating work order"),
  });
}

export function useSubmitWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      woId,
      ceacCompletedAt,
      ceacNotes,
      sanCompletedAt,
      sanNotes,
      ceacNumber,
      sanApprovalId,
      riskLevel,
      emergencyJustification,
      resetRiskToPending,
    }: {
      woId: string;
      ceacCompletedAt?: string | null;
      ceacNotes?: string | null;
      sanCompletedAt?: string | null;
      sanNotes?: string | null;
      ceacNumber?: string | null;
      sanApprovalId?: string | null;
      riskLevel?: string | null;
      // Captured by the Manager at submit time when sending with empty risk data
      // (emergency flow). Riesgos approvers never enter a justification.
      emergencyJustification?: string | null;
      // True when risk_status='Rejected' at submit time: resets the Risk track to
      // Pending so the Risk team gets a fresh review signal. Preserves Approved and
      // Emergency_Approved (independent tracks design, A1).
      resetRiskToPending?: boolean;
    }) => {
      // risk_status is intentionally not touched in the general case: the tracks are
      // independent, so an Approved Risk track persists across Socio-reject → Withdraw →
      // Resubmit cycles. Exception: when the Risk track was Rejected, it must be reset
      // to Pending so the Risk team receives a new review signal (see resetRiskToPending).
      // (notes are also not reset — respects fix 49c2ac5.)
      const submitPayload: Record<string, unknown> = {
        approval_status: "Pending_Approval",
        ceac_completed_at: ceacCompletedAt ?? null,
        ceac_notes: ceacNotes ?? null,
        san_completed_at: sanCompletedAt ?? null,
        san_notes: sanNotes ?? null,
        ceac_number: ceacNumber ?? null,
        san_approval_id: sanApprovalId ?? null,
        risk_level: riskLevel ?? null,
      };
      // undefined = re-submitting Socio track with Risk already Emergency_Approved;
      // skip the key entirely so the existing emergency_justification is preserved in DB.
      // null = normal submit or new emergency cleared — write to clear/set.
      if (emergencyJustification !== undefined) {
        submitPayload.emergency_justification = emergencyJustification;
      }
      if (resetRiskToPending) {
        submitPayload.risk_status = "Pending";
      }
      const { data: result, error } = await supabase
        .from("work_orders")
        .update(submitPayload)
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success(i18n.t("workOrders.submittedForApproval"));
    },
    onError: createMutationErrorHandler("submitting work order"),
  });
}

export function useApproveWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      woId,
      staffId,
    }: {
      woId: string;
      staffId: string;
    }) => {
      // Socio track: record the business approver.
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          approved_by: staffId,
          approved_at: new Date().toISOString(),
          notes: null,
        })
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      // Atomic close: flip to Approved only if the Risk track is already done.
      // Single conditional UPDATE (no read-then-write) avoids a lost-update race
      // between the Socio and Riesgos tracks.
      const { error: closeError } = await supabase
        .from("work_orders")
        .update({ approval_status: "Approved" })
        .eq("wo_id", woId)
        .in("risk_status", ["Approved", "Emergency_Approved"]);
      if (closeError) throw closeError;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success(i18n.t("workOrders.approved"));
    },
    onError: createMutationErrorHandler("approving work order"),
  });
}

// Normal Riesgos approval (single sign-off): used by the normal flow AND by the
// post-completion data review after an emergency OT completes its risk data.
export function useApproveRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      woId,
      staffId,
    }: {
      woId: string;
      staffId: string;
    }) => {
      // Riesgos track.
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          risk_approved_by: staffId,
          risk_approved_at: new Date().toISOString(),
          risk_status: "Approved",
        })
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      // Atomic close: flip to Approved only if the Socio track is already done.
      const { error: closeError } = await supabase
        .from("work_orders")
        .update({ approval_status: "Approved" })
        .eq("wo_id", woId)
        .not("approved_at", "is", null);
      if (closeError) throw closeError;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success(i18n.t("workOrders.approved"));
    },
    onError: createMutationErrorHandler("approving risk"),
  });
}

// Emergency step 1: Riesgo (assistant) sign-off. Does NOT start the deadline nor
// close the OT — it only records the first emergency approval.
export function useApproveEmergencyReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      woId,
      staffId,
    }: {
      woId: string;
      staffId: string;
    }) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          emergency_review_by: staffId,
          emergency_review_at: new Date().toISOString(),
        })
        .eq("wo_id", woId)
        .is("emergency_review_at", null) // first click wins; concurrent double-click fails instead of overwriting
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success(i18n.t("workOrders.riskReviewApproved"));
    },
    onError: createMutationErrorHandler("approving emergency risk review"),
  });
}

// Emergency step 2: Socio de Riesgos sign-off. With both emergency approvals in,
// risk_status becomes 'Emergency_Approved', the +7 calendar-day deadline starts,
// and the OT closes if the Socio (business) track is already done.
export function useApproveEmergencyPartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      woId,
      staffId,
    }: {
      woId: string;
      staffId: string;
    }) => {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7); // +7 calendar days (~5 business days)
      // Use local date components to avoid UTC offset shifting the stored DATE by one day
      // (toISOString() returns UTC, which can be ±1 day from local time in Bolivia/UTC-4).
      const deadlineStr = [
        deadline.getFullYear(),
        String(deadline.getMonth() + 1).padStart(2, "0"),
        String(deadline.getDate()).padStart(2, "0"),
      ].join("-");
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          emergency_partner_by: staffId,
          emergency_partner_at: new Date().toISOString(),
          risk_status: "Emergency_Approved",
          emergency_deadline_at: deadlineStr,
        })
        .eq("wo_id", woId)
        .not("emergency_review_at", "is", null)
        .is("emergency_partner_at", null)
        .select()
        .single();
      if (error) throw error;
      // Atomic close: flip to Approved only if the Socio track is already done.
      const { error: closeError } = await supabase
        .from("work_orders")
        .update({ approval_status: "Approved" })
        .eq("wo_id", woId)
        .not("approved_at", "is", null);
      if (closeError) throw closeError;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success(i18n.t("workOrders.approved"));
    },
    onError: createMutationErrorHandler("approving emergency risk"),
  });
}

export function useRejectRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      woId,
      riskNotes,
    }: {
      woId: string;
      riskNotes?: string | null;
    }) => {
      // Pistas independientes: el rechazo de Riesgos NO cambia approval_status
      // (la OT sigue Pending/Approved) ni toca la aprobación del Socio. Solo marca la
      // pista de Riesgos como rechazada con su nota; el Gerente corrige y reenvía a
      // Riesgos ("Enviar a aprobar a Riesgos" -> risk_status='Pending').
      // Limpia todas las marcas de emergencia para que un reenvío posterior
      // reinicie el flujo de dos firmas desde el paso 1.
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          risk_status: "Rejected",
          risk_notes: riskNotes ?? null,
          emergency_review_by: null,
          emergency_review_at: null,
          emergency_partner_by: null,
          emergency_partner_at: null,
          emergency_deadline_at: null,
          emergency_justification: null,
        })
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success(i18n.t("workOrders.rejected"));
    },
    onError: createMutationErrorHandler("rejecting risk"),
  });
}

// Admin-only: revert an accidental Socio approval. Clears the Socio track and, if the
// OT had closed to Approved, reopens it to Pending_Approval.
export function useRevertSocioApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ woId }: { woId: string }) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({ approved_by: null, approved_at: null })
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      // Reopen if it had been fully approved.
      const { error: reopenError } = await supabase
        .from("work_orders")
        .update({ approval_status: "Pending_Approval" })
        .eq("wo_id", woId)
        .eq("approval_status", "Approved");
      if (reopenError) throw reopenError;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success(i18n.t("workOrders.approvalReverted"));
    },
    onError: createMutationErrorHandler("reverting socio approval"),
  });
}

// Admin-only: revert an accidental Riesgos approval. Resets the Risk track to Pending
// and reopens the OT if it had closed to Approved.
export function useRevertRiskApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ woId }: { woId: string }) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          risk_status: "Pending",
          risk_approved_by: null,
          risk_approved_at: null,
          emergency_review_by: null,
          emergency_review_at: null,
          emergency_partner_by: null,
          emergency_partner_at: null,
          emergency_deadline_at: null,
        })
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      const { error: reopenError } = await supabase
        .from("work_orders")
        .update({ approval_status: "Pending_Approval" })
        .eq("wo_id", woId)
        .eq("approval_status", "Approved");
      if (reopenError) throw reopenError;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success(i18n.t("workOrders.approvalReverted"));
    },
    onError: createMutationErrorHandler("reverting risk approval"),
  });
}

export function useCompleteRiskAssessment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      woId,
      ceacCompletedAt,
      ceacNotes,
      sanCompletedAt,
      sanNotes,
      ceacNumber,
      sanApprovalId,
      riskLevel,
      emergencyJustification,
      resetSocioToPending,
    }: {
      woId: string;
      ceacCompletedAt?: string | null;
      ceacNotes?: string | null;
      sanCompletedAt?: string | null;
      sanNotes?: string | null;
      ceacNumber?: string | null;
      sanApprovalId?: string | null;
      riskLevel?: string | null;
      emergencyJustification?: string | null;
      // FEAT 0602-135: true cuando se reenvía la pista de Riesgos tras un RECHAZO de una OT que
      // estaba cerrada (Socio+Riesgos aprobados). Ver más abajo.
      resetSocioToPending?: boolean;
    }) => {
      // Manager completes risk data on an emergency-approved OT, or re-sends as emergency
      // after rejection. approval_status is left untouched; risk_status returns to Pending.
      const updatePayload: Record<string, unknown> = {
        ceac_completed_at: ceacCompletedAt ?? null,
        ceac_notes: ceacNotes ?? null,
        san_completed_at: sanCompletedAt ?? null,
        san_notes: sanNotes ?? null,
        ceac_number: ceacNumber ?? null,
        san_approval_id: sanApprovalId ?? null,
        risk_level: riskLevel ?? null,
        risk_status: "Pending",
      };
      // Solo escribe emergency_justification si el argumento está presente
      // (reenvío de emergencia). Los flujos sin argumento preservan el historial.
      if (emergencyJustification !== undefined) {
        updatePayload.emergency_justification = emergencyJustification;
      }
      // FEAT 0602-135: si esto es un reenvío TRAS RECHAZO de Riesgos de una OT que ya estaba
      // cerrada (approval_status='Approved'), bajar el Socio a 'Pending_Approval' (approved_at se
      // preserva). Así deriva a 'Aprobado Socio (2)' = NO cargable hasta que Riesgos vuelva a
      // aprobar (useApproveRisk cierra de nuevo a 'Approved' vía .not('approved_at','is',null)).
      // La compleción de EMERGENCIA (risk_status previo 'Emergency_Approved', no rechazo) NO pasa
      // este flag y permanece cargable como Aprobado(4) — decisión de diseño (emergencia 5→4).
      if (resetSocioToPending) {
        updatePayload.approval_status = "Pending_Approval";
      }
      const { data: result, error } = await supabase
        .from("work_orders")
        .update(updatePayload)
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.workOrder") }));
    },
    onError: createMutationErrorHandler("completing risk assessment"),
  });
}

export function useRejectWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ woId, notes }: { woId: string; notes?: string }) => {
      const trimmed = notes?.trim() || null;
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({ approval_status: "Rejected", notes: trimmed })
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      toast.success(i18n.t("workOrders.rejected"));
    },
    onError: createMutationErrorHandler("rejecting work order"),
  });
}

export function useUnsubmitWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      woId,
      currentRiskStatus,
    }: {
      woId: string;
      currentRiskStatus?: string | null;
    }) => {
      const updatePayload: Record<string, unknown> = { approval_status: "Draft" };
      // Only clear emergency signing timestamps when the risk track has NOT yet reached
      // Emergency_Approved. If it has (both signatures done), this withdrawal only
      // resets the Socio track — preserve the emergency audit record.
      if (currentRiskStatus !== "Emergency_Approved") {
        updatePayload.emergency_review_by = null;
        updatePayload.emergency_review_at = null;
        updatePayload.emergency_partner_by = null;
        updatePayload.emergency_partner_at = null;
        updatePayload.emergency_deadline_at = null;
        updatePayload.emergency_justification = null;
      }
      const { data: result, error } = await supabase
        .from("work_orders")
        .update(updatePayload)
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      queryClient.invalidateQueries({ queryKey: ["worksheet-by-engagement"] });
      toast.success(i18n.t("workOrders.unsubmitted"));
    },
    onError: createMutationErrorHandler("unsubmitting work order"),
  });
}
