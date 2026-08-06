import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler } from "@/lib/error-handler";
import i18n from "@/i18n";

// NOTE: fund_request_expenses is NOT yet in the generated Supabase types.
// Cast the client to `any` until Lovable regenerates types after the migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/**
 * Verifica que un UPDATE/DELETE haya afectado filas.
 *
 * Imprescindible en este archivo: cuando RLS bloquea un UPDATE o un DELETE,
 * Postgres NO lanza error — la sentencia afecta 0 filas y PostgREST responde 204
 * limpio, así que `error` viene null, la mutación resuelve y `onSuccess` canta
 * éxito sin que nada haya cambiado.
 *
 * Reportado 2026-07-31: el Gerente de Contabilidad revisaba una factura, veía
 * "Factura revisada" y el gasto seguía en "Aprobado Gerente" (le faltaba la policy
 * de UPDATE, que agrega 20260731010000). Las 11 mutaciones de este archivo tenían
 * el mismo patrón, así que la verificación se centraliza acá en vez de repetirse.
 *
 * @param affected filas devueltas por `.select(...)` tras el update/delete
 * @param expected cantidad esperada; si se omite, basta con que haya al menos una
 */
function assertAffected(affected: unknown, expected?: number): void {
  const rows = Array.isArray(affected) ? affected.length : 0;
  if (rows === 0 || (expected !== undefined && rows < expected)) {
    throw new Error(i18n.t("fundRequestExpense.errors.notPermittedOrChanged"));
  }
}

export interface FundRequestExpenseInput {
  fund_request_id: string;
  wo_id: string;
  expense_type_id?: string | null;
  expense_date: string;
  expense_date_end?: string | null;
  days?: number | null;
  amount: number;
  currency: "BOB" | "USD";
  description?: string | null;
  document_number?: string | null;
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  attachment_url?: string | null;
}

const invalidate = (
  qc: ReturnType<typeof useQueryClient>,
  fundRequestId?: string,
  expenseId?: string,
) => {
  qc.invalidateQueries({ queryKey: ["fund_request_expenses", fundRequestId] });
  if (expenseId) qc.invalidateQueries({ queryKey: ["fund_request_expense", expenseId] });
  // Indicadores de las listas (conteos por estado)
  qc.invalidateQueries({ queryKey: ["fund_request_expense_counts"] });
};

export function useCreateFundRequestExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FundRequestExpenseInput) => {
      const { data, error } = await sb
        .from("fund_request_expenses")
        .insert({ ...input, status: "borrador" })
        .select()
        .single();
      if (error) throw error;
      return data as { fre_id: string; fund_request_id: string };
    },
    onSuccess: (created) => {
      invalidate(queryClient, created.fund_request_id);
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.expense") }));
    },
    onError: createMutationErrorHandler("creating fund request expense"),
  });
}

export function useUpdateFundRequestExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<FundRequestExpenseInput>;
    }) => {
      const { data: affected, error } = await sb
        .from("fund_request_expenses")
        .update(data)
        .eq("fre_id", id)
        .select("fre_id");
      if (error) throw error;
      assertAffected(affected);
      return { fre_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidate(queryClient, undefined, id);
      queryClient.invalidateQueries({ queryKey: ["fund_request_expenses"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.expense") }));
    },
    onError: createMutationErrorHandler("updating fund request expense"),
  });
}

export function useSubmitFundRequestExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: affected, error } = await sb
        .from("fund_request_expenses")
        .update({ status: "pendiente_aprobacion", submitted_at: new Date().toISOString() })
        .eq("fre_id", id)
        .select("fre_id");
      if (error) throw error;
      assertAffected(affected);
      return { fre_id: id };
    },
    onSuccess: (_, id) => {
      invalidate(queryClient, undefined, id);
      queryClient.invalidateQueries({ queryKey: ["fund_request_expenses"] });
      toast.success(i18n.t("fundRequestExpense.messages.submittedSuccess"));
    },
    onError: createMutationErrorHandler("submitting fund request expense"),
  });
}

/**
 * Envío en LOTE: manda todos los gastos indicados a aprobación de una sola vez
 * (modelo "rendición": se envía el conjunto, no uno por uno).
 */
export function useSubmitAllFundRequestExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fundRequestId,
      ids,
    }: {
      fundRequestId: string;
      ids: string[];
    }) => {
      if (ids.length === 0) return { fundRequestId, count: 0 };
      const { data: affected, error } = await sb
        .from("fund_request_expenses")
        .update({
          status: "pendiente_aprobacion",
          submitted_at: new Date().toISOString(),
          // Limpia la decisión previa (al reenviar un gasto observado/rechazado
          // arranca un ciclo nuevo; el gerente no debe ver la nota vieja).
          manager_notes: null,
          rejection_reason: null,
          manager_decided_at: null,
        })
        .in("fre_id", ids)
        .select("fre_id");
      if (error) throw error;
      assertAffected(affected, ids.length);
      return { fundRequestId, count: ids.length };
    },
    onSuccess: ({ fundRequestId, count }) => {
      invalidate(queryClient, fundRequestId);
      queryClient.invalidateQueries({ queryKey: ["fund_request_expenses"] });
      toast.success(i18n.t("fundRequestExpense.messages.allSubmittedSuccess", { count }));
    },
    onError: createMutationErrorHandler("submitting fund request expenses"),
  });
}

/**
 * El solicitante reenvía DIRECTO a contabilidad un gasto que el asistente
 * había devuelto: adjunta el respaldo y vuelve a 'aprobado_gerente' (no pasa
 * por el gerente otra vez). Solo se cambia el respaldo; el resto queda igual.
 */
export function useResendReturnedExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, attachmentUrl }: { id: string; attachmentUrl: string | null }) => {
      const { data: affected, error } = await sb
        .from("fund_request_expenses")
        .update({
          attachment_url: attachmentUrl,
          status: "aprobado_gerente",
          returned_by_assistant: false,
        })
        .eq("fre_id", id)
        .select("fre_id");
      if (error) throw error;
      assertAffected(affected);
      return { fre_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidate(queryClient, undefined, id);
      queryClient.invalidateQueries({ queryKey: ["fund_request_expenses"] });
      toast.success(i18n.t("fundRequestExpense.messages.resentToAccountingSuccess"));
    },
    onError: createMutationErrorHandler("resending returned expense"),
  });
}

/**
 * Asistente devuelve un gasto por falta de respaldo: vuelve al solicitante
 * (observado) con el flag para que, al reenviar, regrese DIRECTO al asistente.
 */
export function useReturnFundRequestExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { data: affected, error } = await sb
        .from("fund_request_expenses")
        .update({
          status: "observado",
          returned_by_assistant: true,
          invoice_observation_notes: notes.trim(),
          has_invoice_observation: false,
          iva_penalty_amount: 0,
        })
        .eq("fre_id", id)
        .select("fre_id");
      if (error) throw error;
      assertAffected(affected);
      return { fre_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidate(queryClient, undefined, id);
      queryClient.invalidateQueries({ queryKey: ["fund_request_expenses"] });
      toast.success(i18n.t("fundRequestExpense.messages.returnedSuccess"));
    },
    onError: createMutationErrorHandler("returning fund request expense"),
  });
}

/**
 * Decisión en LOTE del gerente: aprueba / observa / rechaza TODOS los gastos
 * indicados de una sola vez (no uno por uno). RLS filtra por OT del gerente.
 */
export function useDecideAllFundRequestExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fundRequestId,
      ids,
      decision,
      notes,
    }: {
      fundRequestId: string;
      ids: string[];
      decision: "aprobado_gerente" | "observado" | "rechazado";
      notes?: string;
    }) => {
      if (ids.length === 0) return { fundRequestId, decision, count: 0 };
      const now = new Date().toISOString();
      const update: Record<string, unknown> =
        decision === "rechazado"
          ? {
              status: "rechazado",
              manager_decided_at: now,
              rejection_reason: notes?.trim() || null,
              manager_notes: null,
            }
          : {
              status: decision,
              manager_decided_at: now,
              manager_notes: notes?.trim() || null,
              rejection_reason: null,
            };
      const { data: affected, error } = await sb
        .from("fund_request_expenses")
        .update(update)
        .in("fre_id", ids)
        .select("fre_id");
      if (error) throw error;
      assertAffected(affected, ids.length);
      return { fundRequestId, decision, count: ids.length };
    },
    onSuccess: ({ fundRequestId, decision, count }) => {
      invalidate(queryClient, fundRequestId);
      queryClient.invalidateQueries({ queryKey: ["fund_request_expenses"] });
      const key =
        decision === "aprobado_gerente"
          ? "fundRequestExpense.messages.allApprovedSuccess"
          : decision === "observado"
            ? "fundRequestExpense.messages.allObservedSuccess"
            : "fundRequestExpense.messages.allRejectedSuccess";
      toast.success(i18n.t(key, { count }));
    },
    onError: createMutationErrorHandler("deciding fund request expenses"),
  });
}

export function useApproveFundRequestExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { data: affected, error } = await sb
        .from("fund_request_expenses")
        .update({
          status: "aprobado_gerente",
          manager_decided_at: new Date().toISOString(),
          manager_notes: notes?.trim() || null,
          rejection_reason: null,
        })
        .eq("fre_id", id)
        .select("fre_id");
      if (error) throw error;
      assertAffected(affected);
      return { fre_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidate(queryClient, undefined, id);
      queryClient.invalidateQueries({ queryKey: ["fund_request_expenses"] });
      toast.success(i18n.t("fundRequestExpense.messages.approvedSuccess"));
    },
    onError: createMutationErrorHandler("approving fund request expense"),
  });
}

export function useObserveFundRequestExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { data: affected, error } = await sb
        .from("fund_request_expenses")
        .update({
          status: "observado",
          manager_decided_at: new Date().toISOString(),
          manager_notes: notes.trim(),
          rejection_reason: null,
        })
        .eq("fre_id", id)
        .select("fre_id");
      if (error) throw error;
      assertAffected(affected);
      return { fre_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidate(queryClient, undefined, id);
      queryClient.invalidateQueries({ queryKey: ["fund_request_expenses"] });
      toast.success(i18n.t("fundRequestExpense.messages.observedSuccess"));
    },
    onError: createMutationErrorHandler("observing fund request expense"),
  });
}

export function useRejectFundRequestExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data: affected, error } = await sb
        .from("fund_request_expenses")
        .update({
          status: "rechazado",
          manager_decided_at: new Date().toISOString(),
          rejection_reason: reason.trim(),
          manager_notes: null,
        })
        .eq("fre_id", id)
        .select("fre_id");
      if (error) throw error;
      assertAffected(affected);
      return { fre_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidate(queryClient, undefined, id);
      queryClient.invalidateQueries({ queryKey: ["fund_request_expenses"] });
      toast.success(i18n.t("fundRequestExpense.messages.rejectedSuccess"));
    },
    onError: createMutationErrorHandler("rejecting fund request expense"),
  });
}

// Asistente de Contabilidad (admin por ahora): revisa la factura.
// Si hay observación de factura, aplica 13% IVA sobre el monto del gasto.
export function useReviewFundRequestExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      hasObservation,
      observationNotes,
      amount,
      reviewedByStaffId,
    }: {
      id: string;
      hasObservation: boolean;
      observationNotes?: string;
      amount: number;
      reviewedByStaffId?: string | null;
    }) => {
      const ivaPenalty = hasObservation ? Math.round(amount * 0.13 * 100) / 100 : 0;
      const { data: affected, error } = await sb
        .from("fund_request_expenses")
        .update({
          status: "revisado_asistente",
          reviewed_at: new Date().toISOString(),
          reviewed_by_staff_id: reviewedByStaffId ?? null,
          has_invoice_observation: hasObservation,
          invoice_observation_notes: hasObservation ? observationNotes?.trim() || null : null,
          iva_penalty_amount: ivaPenalty,
        })
        .eq("fre_id", id)
        .select("fre_id");
      if (error) throw error;
      assertAffected(affected);
      return { fre_id: id };
    },
    onSuccess: (_, { id }) => {
      invalidate(queryClient, undefined, id);
      queryClient.invalidateQueries({ queryKey: ["fund_request_expenses"] });
      toast.success(i18n.t("fundRequestExpense.messages.reviewedSuccess"));
    },
    onError: createMutationErrorHandler("reviewing fund request expense"),
  });
}

export function useDeleteFundRequestExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: affected, error } = await sb.from("fund_request_expenses").delete().eq("fre_id", id)
        .select("fre_id");
      if (error) throw error;
      assertAffected(affected);
      return { fre_id: id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund_request_expenses"] });
      queryClient.invalidateQueries({ queryKey: ["fund_request_expense_counts"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.expense") }));
    },
    onError: createMutationErrorHandler("deleting fund request expense"),
  });
}
