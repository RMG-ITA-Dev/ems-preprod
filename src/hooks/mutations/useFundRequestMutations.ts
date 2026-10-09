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
  total_requested_amount: number;
  currency: "BOB" | "USD";
  purpose?: string | null;
  due_back_date?: string | null;
  allocations: AllocationInput[];
}

export interface FundRequestUpdateInput {
  total_requested_amount?: number;
  currency?: "BOB" | "USD";
  purpose?: string | null;
  due_back_date?: string | null;
  allocations?: AllocationInput[];
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>, id?: string) => {
  qc.invalidateQueries({ queryKey: ["fund_requests"] });
  if (id) qc.invalidateQueries({ queryKey: ["fund_request", id] });
  // La bitácora la escriben triggers: cualquier cambio de estado agrega eventos.
  qc.invalidateQueries({ queryKey: ["fund_request_events"] });
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

      // Header + OTs en UNA sola transacción (RPC): si el reemplazo de OTs falla,
      // se revierte también el header y la solicitud queda intacta.
      const { error } = await sb.rpc("fund_request_save_edit", {
        p_fund_request_id: id,
        p_fields: frFields,
        p_allocations:
          allocations === undefined
            ? null
            : allocations.map((a) => ({
                wo_id: a.wo_id,
                allocated_amount: a.allocated_amount,
              })),
      });
      if (error) throw error;
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
      // Reset de OTs + estado de la solicitud en UNA transacción (RPC). Hacerlo
      // en el cliente fallaba: el reset de OTs dispara el rollup que ya mueve la
      // solicitud a 'pendiente_aprobacion', y el update posterior quedaba
      // filtrado por RLS (submitted_at sin fijar). El RPC lo resuelve atómico.
      const { error } = await sb.rpc("fund_request_submit", {
        p_fund_request_id: id,
      });
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

/**
 * Decisión del gerente sobre UNA OT (aprobar / observar / rechazar).
 * El trigger de rollup recalcula el estado de la solicitud automáticamente.
 */
export function useDecideWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      frWoId,
      fundRequestId,
      decision,
      notes,
    }: {
      frWoId: string;
      fundRequestId: string;
      decision: "aprobado" | "observado" | "rechazado";
      notes?: string;
    }) => {
      const update: Record<string, unknown> = {
        approval_status: decision,
        manager_decided_at: new Date().toISOString(),
        manager_notes: decision === "rechazado" ? null : notes?.trim() || null,
        rejection_reason: decision === "rechazado" ? notes?.trim() || null : null,
      };
      const { error } = await sb
        .from("fund_request_work_orders")
        .update(update)
        .eq("fr_wo_id", frWoId);
      if (error) throw error;
      return { fundRequestId };
    },
    onSuccess: ({ fundRequestId }) => {
      invalidateAll(queryClient, fundRequestId);
      toast.success(i18n.t("fundRequest.messages.otDecisionSaved"));
    },
    onError: createMutationErrorHandler("deciding work order"),
  });
}

// Las acciones contables (desembolsar, liquidar, cerrar, cancelar) van por RPC
// SECURITY DEFINER: validan permiso y estado en el servidor, y el actor sale de la
// sesión (get_my_staff_id()), nunca del cliente. No hay policy UPDATE contable,
// así que un UPDATE directo por API no pasa.

export function useDisburseFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount, notes }: { id: string; amount: number; notes?: string }) => {
      const { error } = await sb.rpc("fund_request_disburse", {
        p_fund_request_id: id,
        p_amount: amount,
        p_notes: notes ?? null,
      });
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

export interface SettlementInput {
  id: string;
  resolution: "sin_saldo" | "devolucion" | "descuento_planilla" | "pago_solicitante";
  amount: number;
  notes?: string;
}

/**
 * Liquidar (Contabilidad): el servidor calcula el snapshot (entregado − gastado
 * validado, IVA) y valida que la resolución corresponda al saldo; pasa a
 * en_liquidacion. No cierra todavía.
 */
export function useSettleFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SettlementInput) => {
      const { error } = await sb.rpc("fund_request_settle", {
        p_fund_request_id: input.id,
        p_resolution: input.resolution,
        p_amount: input.amount,
        p_notes: input.notes ?? null,
      });
      if (error) throw error;
      return { fund_request_id: input.id };
    },
    onSuccess: (_, { id }) => {
      invalidateAll(queryClient, id);
      toast.success(i18n.t("fundRequest.messages.settledSuccess"));
    },
    onError: createMutationErrorHandler("settling fund request"),
  });
}

/** Cerrar (Contabilidad): cierra el flujo una vez registrada la liquidación. */
export function useCloseFundRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { error } = await sb.rpc("fund_request_close", {
        p_fund_request_id: id,
        p_notes: notes ?? null,
      });
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
      const { error } = await sb.rpc("fund_request_cancel", {
        p_fund_request_id: id,
        p_reason: reason,
      });
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
