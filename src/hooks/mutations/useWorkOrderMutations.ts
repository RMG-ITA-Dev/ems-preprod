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
    }) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          approval_status: "Pending_Approval",
          // No se toca risk_status: las pistas son independientes, así el Aprobado de
          // Riesgos persiste tras un rechazo del Socio + Retirar + reenviar.
          // (notes tampoco se resetea — respeta fix 49c2ac5.)
          ceac_completed_at: ceacCompletedAt ?? null,
          ceac_notes: ceacNotes ?? null,
          san_completed_at: sanCompletedAt ?? null,
          san_notes: sanNotes ?? null,
          ceac_number: ceacNumber ?? null,
          san_approval_id: sanApprovalId ?? null,
          risk_level: riskLevel ?? null,
          emergency_justification: emergencyJustification ?? null,
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
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          emergency_partner_by: staffId,
          emergency_partner_at: new Date().toISOString(),
          risk_status: "Emergency_Approved",
          emergency_deadline_at: deadline.toISOString().split("T")[0],
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
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          risk_status: "Rejected",
          risk_notes: riskNotes ?? null,
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
    }: {
      woId: string;
      ceacCompletedAt?: string | null;
      ceacNotes?: string | null;
      sanCompletedAt?: string | null;
      sanNotes?: string | null;
      ceacNumber?: string | null;
      sanApprovalId?: string | null;
      riskLevel?: string | null;
    }) => {
      // Manager completes risk data on an emergency-approved OT.
      // approval_status is left untouched; risk_status returns to Pending for re-review.
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          ceac_completed_at: ceacCompletedAt ?? null,
          ceac_notes: ceacNotes ?? null,
          san_completed_at: sanCompletedAt ?? null,
          san_notes: sanNotes ?? null,
          ceac_number: ceacNumber ?? null,
          san_approval_id: sanApprovalId ?? null,
          risk_level: riskLevel ?? null,
          risk_status: "Pending",
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
    mutationFn: async (woId: string) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({ approval_status: "Draft" })
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
