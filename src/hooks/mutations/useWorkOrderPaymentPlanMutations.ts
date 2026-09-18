import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createMutationErrorHandler, handleError } from "@/lib/error-handler";
import i18n from "@/i18n";
import type { PaymentPlanInput, PaymentInstallmentInput, PaymentInstallmentStatus } from "@/types/workOrderPaymentPlan";
import { computePaymentDate } from "@/lib/workOrderPaymentPlan";

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
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "saving payment installments"),
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
      invoiceExchangeRate,
      paymentExchangeRate,
    }: {
      installmentId: string;
      newStatus: PaymentInstallmentStatus;
      prevStatus?: PaymentInstallmentStatus;
      woId: string;
      paymentDays?: number;
      // 0722-156b: snapshot de TC capturado en el mismo UPDATE que la transición de
      // estado (escritura atómica) — invoiceExchangeRate al llegar a "Invoiced",
      // paymentExchangeRate al llegar a "Completed". El trigger de freeze evalúa
      // OLD.status, así que sigue permitiendo este snapshot en la MISMA transición
      // que deja la cuota congelada.
      invoiceExchangeRate?: number | null;
      paymentExchangeRate?: number | null;
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
          updates.invoice_exchange_rate = invoiceExchangeRate ?? null;
        }
        // Manual Overdue→Invoiced revert: keep existing collection dates + invoice TC in DB
      }
      if (newStatus === "Pending") {
        updates.collection_invoice_date = null;
        updates.collection_payment_date = null;
      }
      if (newStatus === "Completed") {
        updates.payment_date_actual = today;
        updates.payment_exchange_rate = paymentExchangeRate ?? null;
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
    },
    // review iteración 16 #3: onChange ya actualizó paymentInstallments de forma
    // optimista antes de que este onBlur dispare la mutación -- si falla (red,
    // INSTALLMENT_LOCKED/EXCHANGE_RATE_LOCKED/FORBIDDEN por una carrera de estado o
    // rol), el toast solo informa el error pero el valor no persistido seguía en
    // pantalla; en una OT Approved (sin botón de Guardar de página) quedaba sin forma
    // de corregirse hasta recargar. Invalidar fuerza un refetch que trae el valor real.
    onError: (error: unknown, variables) => {
      queryClient.invalidateQueries({ queryKey: ["work_order", variables.woId] });
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
    },
    onError: (error: unknown) => handlePaymentPlanError(error, "deleting installment"),
  });
}
