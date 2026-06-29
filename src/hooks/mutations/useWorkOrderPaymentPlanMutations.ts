import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createMutationErrorHandler } from "@/lib/error-handler";
import type { PaymentPlanInput, PaymentInstallmentInput, PaymentInstallmentStatus } from "@/types/workOrderPaymentPlan";
import { computePaymentDate } from "@/lib/workOrderPaymentPlan";

// Create or update the plan header row.
export function useUpsertPaymentPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: PaymentPlanInput) => {
      const { data, error } = await supabase
        .from("wo_payment_plan")
        .upsert(
          {
            ...(plan.plan_id ? { plan_id: plan.plan_id } : {}),
            wo_id: plan.wo_id,
            exchange_rate: plan.exchange_rate,
            payment_days: plan.payment_days,
          },
          { onConflict: "wo_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data as { plan_id: string; wo_id: string; exchange_rate: number | null; payment_days: number };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.wo_id] });
    },
    onError: createMutationErrorHandler("upserting payment plan"),
  });
}

// Upsert all installment rows for a plan in one batch.
// Rows without installment_id are inserted; rows with an id are updated.
export function useBatchUpsertInstallments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      planId,
      woId,
      installments,
    }: {
      planId: string;
      woId: string;
      installments: PaymentInstallmentInput[];
    }) => {
      const rows = installments.map((inst) => ({
        ...(inst.installment_id ? { installment_id: inst.installment_id } : {}),
        plan_id: planId,
        wo_id: woId,
        installment_number: inst.installment_number,
        agreed_invoice_date: inst.agreed_invoice_date,
        agreed_payment_date: inst.agreed_payment_date,
        collection_invoice_date: inst.collection_invoice_date,
        collection_payment_date: inst.collection_payment_date,
        payment_date_actual: inst.payment_date_actual,
        percentage: inst.percentage,
        amount: inst.amount,
        status: inst.status,
      }));

      const { error } = await supabase
        .from("wo_payment_installments")
        .upsert(rows, { onConflict: "plan_id,installment_number" });
      if (error) throw error;

      // Delete orphaned rows (installments the user removed from the plan)
      const keptIds = installments
        .filter((inst) => inst.installment_id)
        .map((inst) => inst.installment_id!);
      if (keptIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("wo_payment_installments")
          .delete()
          .eq("plan_id", planId)
          .not("installment_id", "in", `(${keptIds.join(",")})`);
        if (deleteError) throw deleteError;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
    },
    onError: createMutationErrorHandler("saving payment installments"),
  });
}

// Update a single installment's status with side-effects:
// - Invoiced: set collection_invoice_date = today, collection_payment_date = today + paymentDays
// - Pending (revert): clear collection_invoice_date + collection_payment_date
// - Completed: set payment_date_actual = today
// - Overdue: clear payment_date_actual
export function useUpdateInstallmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      newStatus,
      woId,
      paymentDays,
    }: {
      installmentId: string;
      newStatus: PaymentInstallmentStatus;
      woId: string;
      paymentDays?: number;
    }) => {
      const today = new Date().toISOString().slice(0, 10);
      const updates: Record<string, unknown> = { status: newStatus };

      if (newStatus === "Invoiced") {
        updates.collection_invoice_date = today;
        if (paymentDays != null) {
          updates.collection_payment_date = computePaymentDate(today, paymentDays);
        }
      }
      if (newStatus === "Pending") {
        updates.collection_invoice_date = null;
        updates.collection_payment_date = null;
      }
      if (newStatus === "Completed") {
        updates.payment_date_actual = today;
      }
      if (newStatus === "Overdue") {
        updates.payment_date_actual = null;
      }

      const { error } = await supabase
        .from("wo_payment_installments")
        .update(updates)
        .eq("installment_id", installmentId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
    },
    onError: createMutationErrorHandler("updating installment status"),
  });
}

// Delete a single installment row.
export function useDeleteInstallment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ installmentId, woId }: { installmentId: string; woId: string }) => {
      const { error } = await supabase
        .from("wo_payment_installments")
        .delete()
        .eq("installment_id", installmentId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
    },
    onError: createMutationErrorHandler("deleting installment"),
  });
}
