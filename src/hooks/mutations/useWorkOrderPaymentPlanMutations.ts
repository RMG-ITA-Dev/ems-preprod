import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createMutationErrorHandler, handleError } from "@/lib/error-handler";
import i18n from "@/i18n";
import type { PaymentPlanInput, PaymentInstallmentInput, PaymentInstallmentStatus } from "@/types/workOrderPaymentPlan";
import { computePaymentDate, todayInLaPaz } from "@/lib/workOrderPaymentPlan";
import { rpcUntyped } from "@/lib/rpcUntyped";

// 0722-156b (Fase 2): trg_wo_payment_plan_guard_exchange_rate / trg_wo_payment_
// installments_guard_exchange_rate (migración 20260905172820) rechazan un cambio de
// TC fuera de su ventana editable con un mensaje que empieza con este token —
// mapeado a un toast traducido en vez del genérico de createMutationErrorHandler,
// para una carrera entre pestañas (ej. la OT se aprobó en otra pestaña mientras esta
// tenía el plan abierto para edición).
const EXCHANGE_RATE_LOCKED_TOKEN = "EXCHANGE_RATE_LOCKED";
// review iteracion 2 #1/#3: trg_wo_payment_installments_guard_delete (BEFORE DELETE) y
// el guard de percentage/amount/installment_number en trg_wo_payment_installments_
// guard_exchange_rate rechazan tocar una cuota ya facturada con este mismo token.
const INSTALLMENT_LOCKED_TOKEN = "INSTALLMENT_LOCKED";
// Decision del operador 2026-09-10: el TC inicial (solo gerente del encargo o admin,
// migracion 20260908150000) y la captura por cuota en modo Variable (solo
// collections_analyst o admin, migracion 20260910090000) rechazan con este token
// cuando quien escribe no tiene el rol correcto — distinto de "LOCKED" (que es sobre
// el momento/estado), este es sobre quién puede hacerlo.
const EXCHANGE_RATE_FORBIDDEN_TOKEN = "EXCHANGE_RATE_FORBIDDEN";
// Cobranzas Fase 1: tokens de las RPC invoice_installment/collect_installment/
// set_installment_overdue.
// STALE es el caso de concurrencia — alguien más ya movió la cuota — y necesita su propio
// mensaje: el genérico ("error al actualizar") hacía pensar en una falla del sistema cuando
// en realidad hay que recargar para ver el estado real.
const INSTALLMENT_STALE_TOKEN = "INSTALLMENT_STALE";
const INSTALLMENT_FORBIDDEN_TOKEN = "INSTALLMENT_FORBIDDEN";
// Cobranzas Fase 3: la nota y la fecha nueva son obligatorias cuando el cliente no confirma.
// La UI ya las exige, pero el servidor es el que manda y su mensaje merece traduccion propia.
const INSTALLMENT_REASON_REQUIRED_TOKEN = "INSTALLMENT_REASON_REQUIRED";
const INSTALLMENT_DATE_REQUIRED_TOKEN = "INSTALLMENT_DATE_REQUIRED";
// Fase 4: autoria de la nota y nota vacia.
const NOTE_FORBIDDEN_TOKEN = "NOTE_FORBIDDEN";
const NOTE_BODY_REQUIRED_TOKEN = "NOTE_BODY_REQUIRED";
// Fase 7: la fila con la que se le cobran al cliente los gastos ya ejecutados.
// FORBIDDEN es de rol (solo Contabilidad), EMPTY es que no quedan gastos por facturar — el
// caso normal cuando alguien vuelve a pulsar el boton — e INVALID es haber apuntado a una
// cuota de honorarios por esta via.
const EXPENSE_ROW_FORBIDDEN_TOKEN = "EXPENSE_ROW_FORBIDDEN";
const EXPENSE_ROW_EMPTY_TOKEN = "EXPENSE_ROW_EMPTY";
const EXPENSE_ROW_INVALID_TOKEN = "EXPENSE_ROW_INVALID";
const EXPENSE_ROW_AMOUNT_INVALID_TOKEN = "EXPENSE_ROW_AMOUNT_INVALID";
// Fase 9: ajustes sobre una cuota. FORBIDDEN es de rol; LOCKED es de momento (un descuento se
// acuerda antes de cobrar, una diferencia de cambio recien existe despues); EXCEEDS es el
// descuento que dejaria la cuota en negativo.
const ADJUSTMENT_FORBIDDEN_TOKEN = "ADJUSTMENT_FORBIDDEN";
const ADJUSTMENT_LOCKED_TOKEN = "ADJUSTMENT_LOCKED";
const ADJUSTMENT_EXCEEDS_TOKEN = "ADJUSTMENT_EXCEEDS_AMOUNT";
const ADJUSTMENT_REASON_REQUIRED_TOKEN = "ADJUSTMENT_REASON_REQUIRED";

function errorMessageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : String(error);
}

function isExchangeRateLockedError(error: unknown): boolean {
  return errorMessageOf(error).includes(EXCHANGE_RATE_LOCKED_TOKEN);
}

function isInstallmentLockedError(error: unknown): boolean {
  return errorMessageOf(error).includes(INSTALLMENT_LOCKED_TOKEN);
}

function isExchangeRateForbiddenError(error: unknown): boolean {
  return errorMessageOf(error).includes(EXCHANGE_RATE_FORBIDDEN_TOKEN);
}

function isInstallmentStaleError(error: unknown): boolean {
  return errorMessageOf(error).includes(INSTALLMENT_STALE_TOKEN);
}

function isInstallmentForbiddenError(error: unknown): boolean {
  return errorMessageOf(error).includes(INSTALLMENT_FORBIDDEN_TOKEN);
}

function isInstallmentReasonRequiredError(error: unknown): boolean {
  return errorMessageOf(error).includes(INSTALLMENT_REASON_REQUIRED_TOKEN);
}

function isInstallmentDateRequiredError(error: unknown): boolean {
  return errorMessageOf(error).includes(INSTALLMENT_DATE_REQUIRED_TOKEN);
}

function isNoteForbiddenError(error: unknown): boolean {
  return errorMessageOf(error).includes(NOTE_FORBIDDEN_TOKEN);
}

function isNoteBodyRequiredError(error: unknown): boolean {
  return errorMessageOf(error).includes(NOTE_BODY_REQUIRED_TOKEN);
}

function isExpenseRowForbiddenError(error: unknown): boolean {
  return errorMessageOf(error).includes(EXPENSE_ROW_FORBIDDEN_TOKEN);
}

function isExpenseRowEmptyError(error: unknown): boolean {
  return errorMessageOf(error).includes(EXPENSE_ROW_EMPTY_TOKEN);
}

function isAdjustmentForbiddenError(error: unknown): boolean {
  return errorMessageOf(error).includes(ADJUSTMENT_FORBIDDEN_TOKEN);
}

function isAdjustmentLockedError(error: unknown): boolean {
  return errorMessageOf(error).includes(ADJUSTMENT_LOCKED_TOKEN);
}

function isAdjustmentExceedsError(error: unknown): boolean {
  return errorMessageOf(error).includes(ADJUSTMENT_EXCEEDS_TOKEN);
}

function isAdjustmentReasonRequiredError(error: unknown): boolean {
  return errorMessageOf(error).includes(ADJUSTMENT_REASON_REQUIRED_TOKEN);
}

function isExpenseRowInvalidError(error: unknown): boolean {
  return errorMessageOf(error).includes(EXPENSE_ROW_INVALID_TOKEN)
    || errorMessageOf(error).includes(EXPENSE_ROW_AMOUNT_INVALID_TOKEN);
}

// dash_socio: wo_payment_plan.exchange_rate pasa a NOT NULL DEFAULT
// latest_exchange_rate(); si latest_exchange_rate() devuelve NULL (historial BCB
// vacío y sin default_exchange_rate configurado) y el caller manda un `null`
// explícito (o el DEFAULT resuelve a NULL), Postgres rechaza el INSERT/UPDATE con
// 23502 (NOT NULL violation). Se distingue por código, no por token de mensaje,
// porque este es un error nativo de Postgres, no un RAISE EXCEPTION propio.
function isExchangeRateUnavailableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23502" && errorMessageOf(error).includes("exchange_rate");
}

function handlePaymentPlanError(error: unknown, operation: string): void {
  if (isInstallmentStaleError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorInstallmentStale"));
    return;
  }
  if (isInstallmentForbiddenError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorInstallmentForbidden"));
    return;
  }
  if (isInstallmentReasonRequiredError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorReasonRequired"));
    return;
  }
  if (isInstallmentDateRequiredError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorNewDateRequired"));
    return;
  }
  if (isNoteForbiddenError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorNoteForbidden"));
    return;
  }
  if (isNoteBodyRequiredError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorNoteBodyRequired"));
    return;
  }
  if (isAdjustmentForbiddenError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorAdjustmentForbidden"));
    return;
  }
  if (isAdjustmentLockedError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorAdjustmentLocked"));
    return;
  }
  if (isAdjustmentExceedsError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorAdjustmentExceeds"));
    return;
  }
  if (isAdjustmentReasonRequiredError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorAdjustmentReasonRequired"));
    return;
  }
  if (isExpenseRowForbiddenError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorExpenseRowForbidden"));
    return;
  }
  if (isExpenseRowEmptyError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorExpenseRowEmpty"));
    return;
  }
  if (isExpenseRowInvalidError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorExpenseRowInvalid"));
    return;
  }
  if (isExchangeRateLockedError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorExchangeRateLocked"));
    return;
  }
  if (isInstallmentLockedError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorInstallmentLocked"));
    return;
  }
  if (isExchangeRateForbiddenError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorExchangeRateForbidden"));
    return;
  }
  if (isExchangeRateUnavailableError(error)) {
    toast.error(i18n.t("workOrders.paymentPlan.errorExchangeRateUnavailable"));
    return;
  }
  handleError(error, {
    toastTitle: `Error ${operation}`,
    context: { operation },
  });
}

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
            // dash_socio: la columna es NOT NULL DEFAULT latest_exchange_rate();
            // supabase-js omite claves undefined y PostgREST aplica el DEFAULT
            // (payload de un solo objeto).
            exchange_rate: plan.exchange_rate ?? undefined,
            payment_days: plan.payment_days,
            exchange_rate_mode: plan.exchange_rate_mode,
          },
          { onConflict: "wo_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data as unknown as {
        plan_id: string;
        wo_id: string;
        exchange_rate: number | null;
        payment_days: number;
        exchange_rate_mode: PaymentPlanInput["exchange_rate_mode"];
      };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.wo_id] });
      // dashboard: cartera/encargo/personal/socio leen plan de pagos/cuotas de OT --
      // invalidación aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "upserting payment plan"),
  });
}

// Upsert all installment rows for a plan in one batch.
// Rows without installment_id are inserted; rows with an id are updated.
//
// MUST FIX 0722-156b review iteracion 4 #4: antes, esto borraba huerfanos y despues
// hacia el upsert en 2 llamadas HTTP separadas a PostgREST -- cada una es su propia
// transaccion, asi que si el DELETE tenia exito y el upsert posterior fallaba (ej.
// INSTALLMENT_LOCKED por un feeWithTax que recalculaba el amount de una cuota ya
// facturada), el DELETE quedaba committeado igual. sync_wo_payment_installments (migracion
// 20260905172820) hace ambos pasos en una sola funcion -- una sola transaccion, revierte
// todo si cualquier paso falla -- y corre SECURITY INVOKER, asi que las mismas RLS
// policies de la tabla siguen aplicando exactamente igual.
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
        installment_id: inst.installment_id ?? null,
        installment_number: inst.installment_number,
        agreed_invoice_date: inst.agreed_invoice_date,
        agreed_payment_date: inst.agreed_payment_date,
        collection_invoice_date: inst.collection_invoice_date,
        collection_payment_date: inst.collection_payment_date,
        payment_date_actual: inst.payment_date_actual,
        percentage: inst.percentage,
        amount: inst.amount,
        status: inst.status,
        invoice_exchange_rate: inst.invoice_exchange_rate,
        payment_exchange_rate: inst.payment_exchange_rate,
      }));

      // NOTA: sync_wo_payment_installments aún no está en
      // src/integrations/supabase/types.ts (se regenera tras aplicar la migración desde
      // el Supabase real) — mismo escape que usa useTimerEntries() con
      // list_own_timer_engagement_labels.
      const { error } = await supabase.rpc("sync_wo_payment_installments" as never, {
        p_plan_id: planId,
        p_wo_id: woId,
        p_installments: rows,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      // dashboard: cartera/encargo/personal/socio leen plan de pagos/cuotas de OT --
      // invalidación aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "saving payment installments"),
  });
}

// Cambia el estado de UNA cuota. Cobranzas Fase 1 (issue #352): ya no arma un UPDATE
// directo sobre wo_payment_installments, sino que llama a la RPC que corresponde a la
// transición. Lo que gana el flujo:
//   * el servidor verifica el ROL (Contabilidad o admin) y que la OT esté aprobada, en
//     vez de confiar en que la pantalla lo haya escondido;
//   * `prevStatus` pasa a ser obligatorio y viaja como `p_expected_status`: si otra
//     persona ya aplicó la transición, la segunda llamada falla con INSTALLMENT_STALE en
//     vez de pisarla en silencio (el UPDATE anterior no encadenaba .select(), así que un
//     cambio de 0 filas se veía como éxito);
//   * las fechas las decide la base (fund_today()), no el reloj del navegador;
//   * el cambio queda registrado en wo_installment_events.
// El snapshot de TC sigue viajando en la misma llamada porque el guard de freeze evalúa
// OLD.status: una vez facturada/cobrada la cuota, su TC ya no se puede escribir.
//
// `paymentDays` sigue haciendo falta: el vencimiento se calcula con el calendario de días
// hábiles de TypeScript (src/lib/boliviaHolidays.ts). La tabla public.holidays no sirve
// como fuente — sólo está sembrada 2026-2027 y además trae 2 feriados "puente" que el
// generador no produce — así que la RPC lo recibe y lo valida en vez de recalcularlo, para
// no crear un segundo calendario divergente.

export function useUpdateInstallmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      newStatus,
      prevStatus,
      paymentDays,
      invoiceExchangeRate,
      invoiceExchangeRateDate,
      paymentExchangeRate,
    }: {
      installmentId: string;
      newStatus: PaymentInstallmentStatus;
      prevStatus: PaymentInstallmentStatus;
      woId: string;
      paymentDays?: number;
      invoiceExchangeRate?: number | null;
      /** Cobranzas Fase 6: de qué fecha salió el TC; null = se escribió a mano (Q49). */
      invoiceExchangeRateDate?: string | null;
      paymentExchangeRate?: number | null;
    }) => {
      if (newStatus === "Invoiced" && prevStatus === "Pending") {
        const today = todayInLaPaz();
        const dueDate = computePaymentDate(today, paymentDays ?? 30);
        const { error } = await rpcUntyped("invoice_installment", {
          p_installment_id: installmentId,
          p_expected_status: prevStatus,
          p_payment_due_date: dueDate,
          p_invoice_date: today,
          p_invoice_exchange_rate: invoiceExchangeRate ?? null,
          p_invoice_exchange_rate_date: invoiceExchangeRateDate ?? null,
        });
        if (error) throw error;
        return;
      }

      if (newStatus === "Completed") {
        const { error } = await rpcUntyped("collect_installment", {
          p_installment_id: installmentId,
          p_expected_status: prevStatus,
          p_payment_date: todayInLaPaz(),
          p_payment_exchange_rate: paymentExchangeRate ?? null,
        });
        if (error) throw error;
        return;
      }

      // Mora manual en los dos sentidos: Invoiced -> Overdue y la vuelta atrás
      // Overdue -> Invoiced, que conserva las fechas de cobranza ya registradas.
      if (newStatus === "Overdue" || (newStatus === "Invoiced" && prevStatus === "Overdue")) {
        const { error } = await rpcUntyped("set_installment_overdue", {
          p_installment_id: installmentId,
          p_expected_status: prevStatus,
          p_overdue: newStatus === "Overdue",
        });
        if (error) throw error;
        return;
      }

      throw new Error(`INVALID_STATUS_TRANSITION: ${prevStatus} -> ${newStatus}`);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      // dashboard: cartera/encargo/personal/socio leen plan de pagos/cuotas de OT --
      // invalidación aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "updating installment status"),
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
      // dashboard: cartera/encargo/personal/socio leen plan de pagos/cuotas de OT --
      // invalidación aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: createMutationErrorHandler("deleting payment plan"),
  });
}

// Correct the collection invoice date for a single installment (admin-only direct save).
// Also recalculates collection_payment_date from the new date + paymentDays.
// ── Cobranzas Fase 3 (issue #352) ────────────────────────────────────────────────────────
// Confirmación con el cliente y reprogramación. Las dos son del GERENTE del encargo (o un
// admin), no de Contabilidad: mover la fecha pactada es del contrato, no de la cobranza
// (decisiones del operador Q11 y Q42). El servidor lo verifica; esto solo lo refleja.
//
// Las dos mandan `expectedInvoiceDate` (la fecha vigente que la pantalla tenía al abrir el
// diálogo) como control de concurrencia: si alguien ya reprogramó mientras tanto, la RPC
// responde INSTALLMENT_STALE en vez de pisar la fecha nueva con una vieja.
//
// `paymentDays` hace falta porque la fecha de pago prevista se calcula acá: el calendario de
// días hábiles vive en TypeScript (src/lib/boliviaHolidays.ts). La RPC la valida, no la
// recalcula, para no crear un segundo calendario divergente.

export function useRescheduleInstallment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      newInvoiceDate,
      reason,
      expectedInvoiceDate,
      paymentDays,
    }: {
      installmentId: string;
      newInvoiceDate: string;
      reason: string;
      expectedInvoiceDate: string | null;
      paymentDays: number;
      woId: string;
    }) => {
      const { error } = await rpcUntyped("reschedule_installment", {
        p_installment_id: installmentId,
        p_new_invoice_date: newInvoiceDate,
        p_new_payment_due_date: computePaymentDate(newInvoiceDate, paymentDays),
        p_reason: reason,
        p_expected_invoice_date: expectedInvoiceDate,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "rescheduling installment"),
  });
}

export function useRecordInstallmentConfirmation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      confirmed,
      expectedInvoiceDate,
      note,
      newInvoiceDate,
      paymentDays,
    }: {
      installmentId: string;
      confirmed: boolean;
      expectedInvoiceDate: string | null;
      // Obligatorios cuando el cliente NO confirma: sin motivo y sin fecha nueva, la cuota
      // quedaría marcada como problemática sin decir qué pasa ni para cuándo.
      note?: string;
      newInvoiceDate?: string;
      paymentDays: number;
      woId: string;
    }) => {
      const { error } = await rpcUntyped("record_installment_confirmation", {
        p_installment_id: installmentId,
        p_confirmed: confirmed,
        p_expected_invoice_date: expectedInvoiceDate,
        p_note: note ?? null,
        p_new_invoice_date: newInvoiceDate ?? null,
        p_new_payment_due_date: newInvoiceDate
          ? computePaymentDate(newInvoiceDate, paymentDays)
          : null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "recording installment confirmation"),
  });
}

// ── Cobranzas Fase 4 (issue #352): notas del hilo ────────────────────────────────────────
// Escriben y leen los cinco que participan del hilo (decisión Q16): gerente y socio del
// encargo, Gerente de Contabilidad, Analista de Cobranzas y admin. Editar y borrar, en cambio,
// sólo el autor o un admin (Q51) — una nota es de quien la escribió. El servidor lo verifica.
//
// Las tres invalidan `installment_notes` además de la OT: el banner del plan, los contadores
// por fila y el bloque de los diálogos de facturar y cobrar salen todos de esa consulta.

function invalidateNotes(queryClient: ReturnType<typeof useQueryClient>, woId: string) {
  queryClient.invalidateQueries({ queryKey: ["installment_notes", woId] });
}

export function useAddInstallmentNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      woId,
      installmentId,
      body,
    }: {
      woId: string;
      /** null = nota del plan entero, no de una cuota (decisión Q33). */
      installmentId: string | null;
      body: string;
    }) => {
      const { error } = await rpcUntyped("add_installment_note", {
        p_wo_id: woId,
        p_installment_id: installmentId,
        p_body: body,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateNotes(queryClient, v.woId),
    onError: (error: unknown) => handlePaymentPlanError(error, "adding note"),
  });
}

export function useEditInstallmentNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, body }: { noteId: string; body: string; woId: string }) => {
      const { error } = await rpcUntyped("edit_installment_note", {
        p_note_id: noteId,
        p_body: body,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateNotes(queryClient, v.woId),
    onError: (error: unknown) => handlePaymentPlanError(error, "editing note"),
  });
}

export function useDeleteInstallmentNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId }: { noteId: string; woId: string }) => {
      const { error } = await rpcUntyped("delete_installment_note", { p_note_id: noteId });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateNotes(queryClient, v.woId),
    onError: (error: unknown) => handlePaymentPlanError(error, "deleting note"),
  });
}

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
      // dashboard: cartera/encargo/personal/socio leen plan de pagos/cuotas de OT --
      // invalidación aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: createMutationErrorHandler("updating collection date"),
  });
}

// 0722-156b (Fase 2, Amendment 2026-09-07): TC Facturación/Pago por cuota solo se
// habilitan (isStatusEditable) una vez que la OT está Approved — momento en el que ya
// no existe un botón "Guardar" de página (WorkOrderForm solo lo renderiza en Draft /
// socioCorrecting). Sin un guardado directo, un valor tecleado ahí quedaba atrapado en
// memoria para siempre (bug reportado 2026-09-07: "Sin guardar" pegado sin salida).
// Mismo patrón que useUpdateCollectionDate: persiste una sola columna, de inmediato.
export function useUpdateInstallmentExchangeRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      field,
      value,
      woId,
    }: {
      installmentId: string;
      field: "invoice_exchange_rate" | "payment_exchange_rate";
      value: number | null;
      woId: string;
    }) => {
      const { error } = await supabase
        .from("wo_payment_installments")
        .update({ [field]: value })
        .eq("installment_id", installmentId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      // dashboard: cartera/encargo/personal/socio leen plan de pagos/cuotas de OT --
      // invalidación aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    // review iteración 16 #3: onChange ya actualizó paymentInstallments de forma
    // optimista antes de que este onBlur dispare la mutación -- si falla (red,
    // INSTALLMENT_LOCKED/EXCHANGE_RATE_LOCKED/FORBIDDEN por una carrera de estado o
    // rol), el toast solo informa el error pero el valor no persistido seguía en
    // pantalla; en una OT Approved (sin botón de Guardar de página) quedaba sin forma
    // de corregirse hasta recargar. Invalidar fuerza un refetch que trae el valor real.
    onError: (error: unknown, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      // dashboard: cartera/encargo/personal/socio leen plan de pagos/cuotas de OT --
      // invalidación aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      handlePaymentPlanError(error, "updating installment exchange rate");
    },
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
      // dashboard: cartera/encargo/personal/socio leen plan de pagos/cuotas de OT --
      // invalidación aditiva (review.md dash_socio iteración 8, G-01, 2026-09-22).
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "deleting installment"),
  });
}

// ── Cobranzas Fase 7 (issue #352): los gastos ejecutados se le cobran al cliente ──────────
// Las cuotas del plan reparten SOLO honorarios. Los gastos van en su propia fila
// (`installment_type = 'expense_reimbursement'`), con lo que REALMENTE se ejecutó y ya revisó
// Contabilidad — no con el presupuesto, que es lo que se estimó antes de empezar.
//
// Las dos RPC las ejecuta sólo Contabilidad (decisión Q24). El servidor lo verifica; estos
// hooks sólo traducen el rechazo.

export function useCreateExpenseReimbursementRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ woId }: { woId: string }) => {
      const { error } = await rpcUntyped("create_expense_reimbursement_row", {
        p_wo_id: woId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      queryClient.invalidateQueries({ queryKey: ["billable_expenses", variables.woId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "billing executed expenses"),
  });
}

export function useSetExpenseReimbursementAmount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      amount,
    }: {
      installmentId: string;
      amount: number;
      woId: string;
    }) => {
      const { error } = await rpcUntyped("set_expense_reimbursement_amount", {
        p_installment_id: installmentId,
        p_amount: amount,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "adjusting billed expenses"),
  });
}

// ── Cobranzas Fase 9 (issue #352): ajustes sobre una cuota ───────────────────────────────
// Los carga y los retira Contabilidad (decisión del operador 2026-10-20). El gerente y el
// socio del encargo se enteran por el aviso y responden por el hilo de notas de la Fase 4.
//
// Las tres invalidan `installment_adjustments` además de la OT: el total por fila, el banner
// del plan y el monto que queda por cobrar salen todos de esa consulta.

function invalidateAdjustments(queryClient: ReturnType<typeof useQueryClient>, woId: string) {
  queryClient.invalidateQueries({ queryKey: ["installment_adjustments", woId] });
}

export function useAddInstallmentAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      type,
      amount,
      reason,
    }: {
      installmentId: string;
      type: "descuento" | "diferencia_cambio";
      /** Firmado: un descuento es negativo; una diferencia de cambio puede ir en cualquier sentido. */
      amount: number;
      reason: string;
      woId: string;
    }) => {
      const { error } = await rpcUntyped("add_installment_adjustment", {
        p_installment_id: installmentId,
        p_type: type,
        p_amount: amount,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      invalidateAdjustments(queryClient, variables.woId);
      // La pantalla de Cobranzas muestra lo que queda por cobrar: un ajuste la cambia.
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "adding installment adjustment"),
  });
}

export function useDeleteInstallmentAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ adjustmentId }: { adjustmentId: string; woId: string }) => {
      const { error } = await rpcUntyped("delete_installment_adjustment", {
        p_adjustment_id: adjustmentId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      invalidateAdjustments(queryClient, variables.woId);
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "removing installment adjustment"),
  });
}

/**
 * Cuánto daría la diferencia de cambio de una cuota ya cobrada. Es una SUGERENCIA: el sistema
 * guarda los dos TC y puede hacer la cuenta, pero que esa diferencia se le cobre al cliente —o
 * se le devuelva— lo decide Contabilidad. Por eso el número se propone en el diálogo y recién
 * se guarda cuando alguien lo confirma.
 *
 * Devuelve null cuando no hay cuenta que hacer: la cuota no está cobrada, va en Bs, o le falta
 * alguno de los dos TC.
 */
export async function fetchSuggestedExchangeDifference(installmentId: string): Promise<number | null> {
  const { data, error } = await rpcUntyped<number | null>("suggest_exchange_difference", {
    p_installment_id: installmentId,
  });
  if (error) return null;
  return data == null ? null : Number(data);
}

/**
 * Cobranzas Fase 7 (decisión del operador 2026-10-20): la moneda de la fila de gastos
 * ejecutados. Nace en Bs, que es la moneda en la que los gastos se rinden, pero se puede
 * cobrar en otra; al facturarla, el diálogo de la Fase 6 ya deja elegir el TC por fecha.
 *
 * Va por la tabla y no por una RPC porque el guard de cuotas ya impone las dos reglas que
 * importan: después de facturar la moneda queda congelada junto con el monto, y USDT no se
 * mezcla con otras monedas.
 */
export function useSetInstallmentCurrency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      currency,
    }: {
      installmentId: string;
      currency: "BOB" | "USD" | "USDT";
      woId: string;
    }) => {
      const { error } = await supabase
        .from("wo_payment_installments")
        .update({ currency } as never)
        .eq("installment_id", installmentId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "changing installment currency"),
  });
}
