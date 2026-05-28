import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

// NOTE: fund_requests and fund_request_work_orders are NOT yet in the
// generated Supabase types. We cast the client to `any` for these calls
// so TypeScript stops complaining. Lovable regenerates types after the
// migration runs and we can drop these casts then.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface AllocationInput {
  wo_id: string;
  allocated_amount: number;
}

export interface FundRequestCreateInput {
  requester_staff_id: string;
  approver_manager_staff_id: string;
  total_requested_amount: number;
  currency: "BOB" | "USD";
  purpose?: string | null;
  due_back_date?: string | null;
  allocations: AllocationInput[];
}

export interface FundRequestUpdateInput {
  approver_manager_staff_id?: string;
  total_requested_amount?: number;
  currency?: "BOB" | "USD";
  purpose?: string | null;
  due_back_date?: string | null;
  allocations?: AllocationInput[];
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>, id?: string) => {
  qc.invalidateQueries({ queryKey: ["fund_requests"] });
  if (id) qc.invalidateQueries({ queryKey: ["fund_request", id] });
};

export function useCreateFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FundRequestCreateInput) => {
      const { allocations, ...frFields } = input;

      const { data: created, error } = await sb
        .from("fund_requests")
        .insert({ ...frFields, status: "borrador" })
        .select()
        .single();
      if (error) throw error;
      const fr = created as { fund_request_id: string };

      if (allocations.length > 0) {
        const rows = allocations.map((a) => ({
          fund_request_id: fr.fund_request_id,
          wo_id: a.wo_id,
          allocated_amount: a.allocated_amount,
        }));
        const { error: allocErr } = await sb
          .from("fund_request_work_orders")
          .insert(rows);
        if (allocErr) {
          // rollback: borrar la FR para no dejar huérfanos
          await sb.from("fund_requests").delete().eq("fund_request_id", fr.fund_request_id);
          throw allocErr;
        }
      }
      return fr;
    },
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.fundRequest") }));
    },
    onError: createMutationErrorHandler("creating fund request"),
  });
}

export function useUpdateFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FundRequestUpdateInput }) => {
      const { allocations, ...frFields } = data;

      if (Object.keys(frFields).length > 0) {
        const { error } = await sb
          .from("fund_requests")
          .update(frFields)
          .eq("fund_request_id", id);
        if (error) throw error;
      }

      if (allocations !== undefined) {
        const { error: delErr } = await sb
          .from("fund_request_work_orders")
          .delete()
          .eq("fund_request_id", id);
        if (delErr) throw delErr;

        if (allocations.length > 0) {
          const rows = allocations.map((a) => ({
            fund_request_id: id,
            wo_id: a.wo_id,
            allocated_amount: a.allocated_amount,
          }));
          const { error: insErr } = await sb
            .from("fund_request_work_orders")
            .insert(rows);
          if (insErr) throw insErr;
        }
      }
      return { fund_request_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidateAll(queryClient, id);
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.fundRequest") }));
    },
    onError: createMutationErrorHandler("updating fund request"),
  });
}

export function useSubmitFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("fund_requests")
        .update({ status: "pendiente_aprobacion", submitted_at: new Date().toISOString() })
        .eq("fund_request_id", id);
      if (error) throw error;
      return { fund_request_id: id };
    },
    onSuccess: (_, id) => {
      invalidateAll(queryClient, id);
      toast.success(i18n.t("fundRequest.messages.submittedSuccess"));
    },
    onError: createMutationErrorHandler("submitting fund request"),
  });
}

export function useApproveFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { error } = await sb
        .from("fund_requests")
        .update({
          status: "aprobado_gerente",
          manager_decided_at: new Date().toISOString(),
          manager_notes: notes?.trim() || null,
          rejection_reason: null,
        })
        .eq("fund_request_id", id);
      if (error) throw error;
      return { fund_request_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidateAll(queryClient, id);
      toast.success(i18n.t("fundRequest.messages.approvedSuccess"));
    },
    onError: createMutationErrorHandler("approving fund request"),
  });
}

export function useObserveFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await sb
        .from("fund_requests")
        .update({
          status: "observado",
          manager_decided_at: new Date().toISOString(),
          manager_notes: notes.trim(),
          rejection_reason: null,
        })
        .eq("fund_request_id", id);
      if (error) throw error;
      return { fund_request_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidateAll(queryClient, id);
      toast.success(i18n.t("fundRequest.messages.observedSuccess"));
    },
    onError: createMutationErrorHandler("observing fund request"),
  });
}

export function useRejectFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await sb
        .from("fund_requests")
        .update({
          status: "rechazado",
          manager_decided_at: new Date().toISOString(),
          rejection_reason: reason.trim(),
          manager_notes: null,
        })
        .eq("fund_request_id", id);
      if (error) throw error;
      return { fund_request_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidateAll(queryClient, id);
      toast.success(i18n.t("fundRequest.messages.rejectedSuccess"));
    },
    onError: createMutationErrorHandler("rejecting fund request"),
  });
}

export function useDisburseFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      amount,
      notes,
      disbursedByStaffId,
    }: {
      id: string;
      amount: number;
      notes?: string;
      disbursedByStaffId?: string | null;
    }) => {
      const { error } = await sb
        .from("fund_requests")
        .update({
          status: "fondos_entregados",
          total_disbursed_amount: amount,
          disbursed_at: new Date().toISOString(),
          disbursed_by_staff_id: disbursedByStaffId ?? null,
          accounting_notes: notes?.trim() || null,
        })
        .eq("fund_request_id", id);
      if (error) throw error;
      return { fund_request_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidateAll(queryClient, id);
      toast.success(i18n.t("fundRequest.messages.disbursedSuccess"));
    },
    onError: createMutationErrorHandler("disbursing fund request"),
  });
}

export function useStartSettlementFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const update: Record<string, unknown> = { status: "en_liquidacion" };
      if (notes && notes.trim()) update.accounting_notes = notes.trim();
      const { error } = await sb
        .from("fund_requests")
        .update(update)
        .eq("fund_request_id", id);
      if (error) throw error;
      return { fund_request_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidateAll(queryClient, id);
      toast.success(i18n.t("fundRequest.messages.settlementStartedSuccess"));
    },
    onError: createMutationErrorHandler("starting settlement"),
  });
}

export function useCloseFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const update: Record<string, unknown> = {
        status: "cerrado",
        closed_at: new Date().toISOString(),
      };
      if (notes && notes.trim()) update.accounting_notes = notes.trim();
      const { error } = await sb
        .from("fund_requests")
        .update(update)
        .eq("fund_request_id", id);
      if (error) throw error;
      return { fund_request_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidateAll(queryClient, id);
      toast.success(i18n.t("fundRequest.messages.closedSuccess"));
    },
    onError: createMutationErrorHandler("closing fund request"),
  });
}

export function useCancelFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await sb
        .from("fund_requests")
        .update({
          status: "cancelado",
          rejection_reason: reason.trim(),
        })
        .eq("fund_request_id", id);
      if (error) throw error;
      return { fund_request_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidateAll(queryClient, id);
      toast.success(i18n.t("fundRequest.messages.cancelledSuccess"));
    },
    onError: createMutationErrorHandler("cancelling fund request"),
  });
}

export function useDeleteFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("fund_requests")
        .delete()
        .eq("fund_request_id", id);
      if (error) throw error;
      return { fund_request_id: id };
    },
    onSuccess: () => {
      invalidateAll(queryClient);
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.fundRequest") }));
    },
    onError: createMutationErrorHandler("deleting fund request"),
  });
}
