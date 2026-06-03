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
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          approval_status: "Pending_Approval",
          ceac_completed_at: ceacCompletedAt ?? null,
          ceac_notes: ceacNotes ?? null,
          san_completed_at: sanCompletedAt ?? null,
          san_notes: sanNotes ?? null,
          ceac_number: ceacNumber ?? null,
          san_approval_id: sanApprovalId ?? null,
          risk_level: riskLevel ?? null,
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
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({
          approval_status: "Approved",
          approved_by: staffId,
          approved_at: new Date().toISOString(),
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
      toast.success(i18n.t("workOrders.approved"));
    },
    onError: createMutationErrorHandler("approving work order"),
  });
}

export function useRejectWorkOrder() {
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
