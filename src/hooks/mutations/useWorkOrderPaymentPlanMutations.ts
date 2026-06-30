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
      const baseRow = (inst: PaymentInstallmentInput) => ({
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
      });

      // Existing rows: update by installment_id (avoids renumber → PK conflict)
      const existingRows = installments
        .filter((inst) => inst.installment_id)
        .map((inst) => ({ installment_id: inst.installment_id!, ...baseRow(inst) }));

      // New rows: plain insert — Postgres generates the UUID
      const newRows = installments
        .filter((inst) => !inst.installment_id)
        .map((inst) => baseRow(inst));

      // Delete orphans FIRST so renumbered rows don't collide on UNIQUE (plan_id, installment_number).
      // When all rows are new (user cleared plan and rebuilt), purge all DB rows before inserting.
      if (existingRows.length > 0) {
        const keptIds = existingRows.map((r) => r.installment_id);
        const { error: deleteError } = await supabase
          .from("wo_payment_installments")
          .delete()
          .eq("plan_id", planId)
          .not("installment_id", "in", `(${keptIds.join(",")})`);
        if (deleteError) throw deleteError;
      } else if (newRows.length > 0) {
        const { error: deleteError } = await supabase
          .from("wo_payment_installments")
          .delete()
          .eq("plan_id", planId);
        if (deleteError) throw deleteError;
      }

      if (existingRows.length > 0) {
        const { error } = await supabase
          .from("wo_payment_installments")
          .upsert(existingRows, { onConflict: "installment_id" });
        if (error) throw error;
      }

      if (newRows.length > 0) {
        const { error } = await supabase
          .from("wo_payment_installments")
          .insert(newRows);
        if (error) throw error;
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
      prevStatus,
      woId,
      paymentDays,
    }: {
      installmentId: string;
      newStatus: PaymentInstallmentStatus;
      prevStatus?: PaymentInstallmentStatus;
      woId: string;
      paymentDays?: number;
    }) => {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
      const updates: Record<string, unknown> = { status: newStatus };

      if (newStatus === "Invoiced") {
        if (prevStatus !== "Overdue") {
          // First invoice (Pending/auto-Overdue): set collection dates
          updates.collection_invoice_date = today;
          if (paymentDays != null) {
            updates.collection_payment_date = computePaymentDate(today, paymentDays);
          }
        }
        // Manual Overdue→Invoiced revert: keep existing collection dates in DB
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

// Delete the payment plan header (cascades to all installments via FK).
export function useDeletePaymentPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, woId }: { planId: string; woId: string }) => {
      const { error } = await supabase
        .from("wo_payment_plan")
        .delete()
        .eq("plan_id", planId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
    },
    onError: createMutationErrorHandler("deleting payment plan"),
  });
}

// Correct the collection invoice date for a single installment (admin-only direct save).
// Also recalculates collection_payment_date from the new date + paymentDays.
export function useUpdateCollectionDate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      collectionInvoiceDate,
      paymentDays,
      woId,
    }: {
      installmentId: string;
      collectionInvoiceDate: string;
      paymentDays: number;
      woId: string;
    }) => {
      const collectionPaymentDate = computePaymentDate(collectionInvoiceDate, paymentDays);
      const { error } = await supabase
        .from("wo_payment_installments")
        .update({ collection_invoice_date: collectionInvoiceDate, collection_payment_date: collectionPaymentDate })
        .eq("installment_id", installmentId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
    },
    onError: createMutationErrorHandler("updating collection date"),
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
