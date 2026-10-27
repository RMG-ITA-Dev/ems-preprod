import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSearch } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FundRequestExpenseStatusBadge } from "@/components/fund-requests/FundRequestExpenseStatusBadge";
import {
  FundRequestExpenseForm,
  type FundRequestExpenseFormValues,
} from "@/components/fund-requests/FundRequestExpenseForm";
import { computeExpenseDays } from "@/lib/fundRequest";
import type { FundRequest } from "@/hooks/useFundRequests";
import type { FundRequestExpense } from "@/hooks/useFundRequestExpenses";
import { useFundRequestEvents } from "@/hooks/useFundRequestEvents";
import { FundRequestTimeline } from "@/components/fund-requests/FundRequestTimeline";
import {
  expenseDateRange,
  formatDateDMY,
  fundRequestDeadline,
  isDeadlinePassed,
  isReviewDeadlinePassed,
  laPazToday,
} from "@/lib/fundRequestCalendar";
import {
  useCreateFundRequestExpense,
  useUpdateFundRequestExpense,
  useReviewFundRequestExpense,
  useReturnFundRequestExpense,
  useAccountingRejectFundRequestExpense,
  useResendReturnedExpense,
  useDeleteFundRequestExpense,
} from "@/hooks/mutations/useFundRequestExpenseMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useAuthorization } from "@/hooks/useAuthorization";
import { toast } from "sonner";

const emptyValues: FundRequestExpenseFormValues = {
  wo_id: "",
  expense_type_id: "",
  expense_date: "",
  expense_date_end: "",
  amount: 0,
  description: "",
  document_number: "",
  supplier_name: "",
  supplier_tax_id: "",
  attachment_url: "",
};

const formatCurrency = (n: number, currency: "BOB" | "USD") =>
  Number(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type SubPanel = "review" | null;

// Revisión de Contabilidad (Fase 3, U2): hasta la fecha fin Aprobar / Penalidad 13% / Devolver;
// en los días 4 y 5 Aprobar / Penalidad 13% / Rechazar (ya nadie podría corregirlo).
type ReviewAction = "approve" | "penalty" | "return" | "reject";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fundRequest: FundRequest;
  /** null = crear nuevo gasto */
  expense: FundRequestExpense | null;
}

export function FundRequestExpenseDialog({
  open,
  onOpenChange,
  fundRequest,
  expense,
}: Props) {
  const { t } = useTranslation();
  const { staffRecord } = useCurrentStaff();
  // La revisión por factura es tarea de Contabilidad (13% IVA), no de admin.
  // Con `isAdmin` del enum legacy, el Gerente y el Analista de Contabilidad no
  // podían revisar aunque la matriz les da Liquidación de Gastos.
  const { can } = useAuthorization();
  const { data: events } = useFundRequestEvents(open && expense ? fundRequest.fund_request_id : undefined);
  const expenseEvents = (events ?? []).filter((e) => !!expense && e.fre_id === expense.fre_id);
  const canSettleExpenses = can("expense_settlement.update");

  const createExpense = useCreateFundRequestExpense();
  const updateExpense = useUpdateFundRequestExpense();
  const reviewExpense = useReviewFundRequestExpense();
  const returnExpense = useReturnFundRequestExpense();
  const rejectExpense = useAccountingRejectFundRequestExpense();
  const resendReturned = useResendReturnedExpense();
  const deleteExpense = useDeleteFundRequestExpense();

  const [values, setValues] = useState<FundRequestExpenseFormValues>(emptyValues);
  const [subPanel, setSubPanel] = useState<SubPanel>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);

  const isCreate = !expense;
  const currency = fundRequest.currency;

  const isRequester =
    !!staffRecord && fundRequest.requester_staff_id === staffRecord.staff_id;

  // Calendario (Fase 3): el solicitante registra, edita y envía solo dentro de la ventana
  // (desde el desembolso hasta la fecha fin). Después todo queda congelado. Tras
  // en_liquidacion/cerrado también.
  const today = laPazToday();
  const month = fundRequest.expense_period_month;
  const deadline = fundRequestDeadline(month);
  const deadlinePassed = isDeadlinePassed(month, today);
  const dateRange = expenseDateRange(fundRequest.disbursed_at, month, today);
  const isEntryPhase = fundRequest.status === "fondos_entregados" && !!dateRange;

  // Gasto devuelto por contabilidad: el solicitante corrige TODOS los campos (decisión S3) y lo
  // reenvía directo a contabilidad, sin pasar por el gerente.
  const isReturnedByAssistant =
    isEntryPhase &&
    !isCreate &&
    isRequester &&
    expense!.status === "observado" &&
    expense!.returned_by_assistant;

  const isEditable =
    isEntryPhase &&
    (isCreate ||
      (isRequester && ["borrador", "observado", "rechazado"].includes(expense!.status)));
  // La decisión del gerente sobre los gastos se hace EN LOTE desde la página
  // (FundRequestExpenses), no por gasto individual: si uno está mal, se rechazan
  // todos juntos. Por eso aquí no hay botones de aprobar/observar/rechazar.
  // Contabilidad revisa hasta el día 5; después el sistema ya aprobó lo pendiente.
  // La solicitud debe seguir viva: una cancelada desde la fase contable sigue siendo visible
  // para Contabilidad (fr_accounting_sees), pero el RPC no admite revisar en ese estado.
  const canReview =
    !isCreate &&
    canSettleExpenses &&
    fundRequest.status === "fondos_entregados" &&
    expense!.status === "aprobado_gerente" &&
    !isReviewDeadlinePassed(month, today);
  // El tercer botón de la revisión depende del calendario.
  const closingAction: ReviewAction = deadlinePassed ? "reject" : "return";

  // Resetear estado al abrir / cambiar de gasto
  useEffect(() => {
    if (!open) return;
    setSubPanel(null);
    setNotes("");
    setReviewAction(null);
    setError(null);
    if (expense) {
      setValues({
        wo_id: expense.wo_id,
        expense_type_id: expense.expense_type_id || "",
        expense_date: expense.expense_date || "",
        expense_date_end: expense.expense_date_end || "",
        amount: Number(expense.amount),
        description: expense.description || "",
        document_number: expense.document_number || "",
        supplier_name: expense.supplier_name || "",
        supplier_tax_id: expense.supplier_tax_id || "",
        attachment_url: expense.attachment_url || "",
      });
    } else {
      setValues(emptyValues);
    }
  }, [open, expense]);

  const handleChange = (patch: Partial<FundRequestExpenseFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  };

  const validate = (): string | null => {
    if (!values.wo_id) return t("fundRequestExpense.errors.workOrderRequired");
    if (!values.expense_date) return t("fundRequestExpense.errors.dateRequired");
    if (!values.amount || values.amount <= 0) return t("fundRequestExpense.errors.amountRequired");
    // Rango inválido: hay fecha "Al" pero es anterior a "Del" (computeExpenseDays
    // devuelve null). Evita guardar un rango imposible con days null.
    if (
      values.expense_date_end &&
      computeExpenseDays(values.expense_date, values.expense_date_end) === null
    ) {
      return t("fundRequestExpense.errors.invalidDateRange");
    }
    // Calendario: misma regla que el trigger fre_enforce_window. "Del" va desde el día del
    // desembolso en adelante; "Al", desde "Del" en adelante (validado arriba).
    if (dateRange && values.expense_date < dateRange.min) {
      return t("fundRequestExpense.errors.dateOutOfRange", { min: formatDateDMY(dateRange.min) });
    }
    return null;
  };

  const payload = () => ({
    wo_id: values.wo_id,
    expense_type_id: values.expense_type_id || null,
    expense_date: values.expense_date,
    expense_date_end: values.expense_date_end || null,
    days: computeExpenseDays(values.expense_date, values.expense_date_end),
    amount: values.amount,
    description: values.description || null,
    document_number: values.document_number || null,
    supplier_name: values.supplier_name || null,
    supplier_tax_id: values.supplier_tax_id || null,
    attachment_url: values.attachment_url || null,
  });

  const anyPending =
    createExpense.isPending ||
    updateExpense.isPending ||
    reviewExpense.isPending ||
    returnExpense.isPending ||
    rejectExpense.isPending ||
    resendReturned.isPending ||
    deleteExpense.isPending;

  // ── Acciones del solicitante ────────────────────────────────
  const handleCreate = async () => {
    const err = validate();
    if (err) return toast.error(err);
    try {
      await createExpense.mutateAsync({
        fund_request_id: fundRequest.fund_request_id,
        currency,
        ...payload(),
      });
      onOpenChange(false);
    } catch {
      /* toast por mutation */
    }
  };

  const handleSave = async () => {
    if (!expense) return;
    const err = validate();
    if (err) return toast.error(err);
    try {
      await updateExpense.mutateAsync({ id: expense.fre_id, data: payload() });
      onOpenChange(false);
    } catch {
      /* toast por mutation */
    }
  };

  const handleDelete = async () => {
    if (!expense) return;
    try {
      await deleteExpense.mutateAsync(expense.fre_id);
      onOpenChange(false);
    } catch {
      /* toast por mutation */
    }
  };

  // Reenvío directo a contabilidad de un gasto devuelto, con todo lo corregido.
  const handleResend = async () => {
    if (!expense) return;
    const err = validate();
    if (err) return toast.error(err);
    if (!values.attachment_url) {
      return toast.error(t("fundRequestExpense.errors.attachmentRequired"));
    }
    try {
      await resendReturned.mutateAsync({ id: expense.fre_id, data: payload() });
      onOpenChange(false);
    } catch {
      /* toast por mutation */
    }
  };

  // ── Sub-panel: revisión de Contabilidad ────────────────────
  const confirmReview = async () => {
    if (!expense || !reviewAction) return;
    if (reviewAction !== "approve" && notes.trim().length === 0) {
      setError(t("fundRequestExpense.errors.reviewNotesRequired"));
      return;
    }
    try {
      if (reviewAction === "approve") {
        await reviewExpense.mutateAsync({ id: expense.fre_id, hasObservation: false });
      } else if (reviewAction === "penalty") {
        // Factura con observación: se valida igual, con penalidad del 13% (la calcula el servidor).
        await reviewExpense.mutateAsync({
          id: expense.fre_id,
          hasObservation: true,
          observationNotes: notes,
        });
      } else if (reviewAction === "return") {
        // Vuelve al solicitante, que lo corrige y lo reenvía directo a Contabilidad.
        await returnExpense.mutateAsync({ id: expense.fre_id, notes });
      } else {
        await rejectExpense.mutateAsync({ id: expense.fre_id, notes });
      }
      onOpenChange(false);
    } catch {
      /* toast por mutation */
    }
  };

  const chooseReviewAction = (action: ReviewAction) => {
    setReviewAction(action);
    setNotes("");
    setError(null);
  };

  const openSubPanel = (panel: SubPanel) => {
    setNotes("");
    setReviewAction(null);
    setError(null);
    setSubPanel(panel);
  };

  // ── Título dinámico ─────────────────────────────────────────
  const title = isCreate
    ? t("fundRequestExpense.newExpense")
    : subPanel === "review"
      ? t("fundRequestExpense.dialog.reviewTitle")
      : t("entities.expense");

  const ivaPenalty = expense ? Math.round(Number(expense.amount) * 0.13 * 100) / 100 : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !anyPending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {subPanel === "review" && <FileSearch className="h-5 w-5 text-info" />}
            {title}
          </DialogTitle>
          {!isCreate && !subPanel && (
            <DialogDescription className="flex items-center gap-2 pt-1">
              <FundRequestExpenseStatusBadge status={expense!.status} />
              <span className="font-mono">
                {formatCurrency(Number(expense!.amount), currency)} {currency}
              </span>
            </DialogDescription>
          )}
        </DialogHeader>

        {/* ── Sub-panel: revisión de Contabilidad ── */}
        {subPanel === "review" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("fundRequestExpense.dialog.reviewBody")}
            </p>

            <div className="space-y-2">
              <Label>{t("fundRequestExpense.dialog.reviewQuestion")}</Label>
              <div className="flex flex-wrap gap-2">
                {(["approve", "penalty", closingAction] as ReviewAction[]).map((action) => (
                  <Button
                    key={action}
                    type="button"
                    variant={
                      reviewAction === action
                        ? action === "return" || action === "reject"
                          ? "destructive"
                          : "default"
                        : "outline"
                    }
                    onClick={() => chooseReviewAction(action)}
                  >
                    {t(`fundRequestExpense.dialog.reviewActions.${action}`)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {deadlinePassed
                  ? t("fundRequestExpense.dialog.reviewAfterDeadlineHint", {
                      date: formatDateDMY(deadline),
                    })
                  : t("fundRequestExpense.dialog.reviewBeforeDeadlineHint", {
                      date: formatDateDMY(deadline),
                    })}
              </p>
            </div>

            {reviewAction && reviewAction !== "approve" && (
              <div className="space-y-2">
                <Label htmlFor="exp-review-notes">
                  {reviewAction === "penalty"
                    ? t("fundRequestExpense.invoiceObservationNotes")
                    : reviewAction === "return"
                      ? t("fundRequestExpense.dialog.returnReason")
                      : t("fundRequest.rejectionReason")}
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <Textarea
                  id="exp-review-notes"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    if (error) setError(null);
                  }}
                  rows={3}
                  placeholder={t("fundRequestExpense.dialog.observationPlaceholder")}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            )}

            {reviewAction === "penalty" && (
              <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-sm">
                <p className="font-medium text-warning">{t("fundRequestExpense.dialog.ivaWarning")}</p>
                <p className="font-mono mt-1">
                  {formatCurrency(ivaPenalty, currency)} {currency}
                </p>
              </div>
            )}
            {reviewAction === "return" && (
              <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-sm text-warning">
                {t("fundRequestExpense.dialog.returnWarning", { date: formatDateDMY(deadline) })}
              </div>
            )}
            {reviewAction === "reject" && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {t("fundRequestExpense.dialog.rejectWarning")}
              </div>
            )}
          </div>
        )}

        {/* ── Formulario (crear / ver / editar) ── */}
        {!subPanel && (
          <>
            {/* Banner: contabilidad devolvió por falta de respaldo */}
            {!isCreate &&
              expense!.returned_by_assistant &&
              expense!.invoice_observation_notes && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
                  <p className="text-sm font-medium text-warning">
                    {t("fundRequestExpense.dialog.returnReason")} ({t("entities.fundRequest")})
                  </p>
                  <p className="text-sm">{expense!.invoice_observation_notes}</p>
                </div>
              )}
            {/* Banner rechazado */}
            {!isCreate && expense!.status === "rechazado" && expense!.rejection_reason && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">
                  {t("fundRequest.rejectionReason")}
                </p>
                <p className="text-sm">{expense!.rejection_reason}</p>
              </div>
            )}
            {/* Banner notas del gerente */}
            {!isCreate && expense!.manager_notes && expense!.status !== "rechazado" && (
              <div
                className={
                  expense!.status === "observado"
                    ? "rounded-md border border-warning/30 bg-warning/5 p-3"
                    : "rounded-md border border-info/30 bg-info/5 p-3"
                }
              >
                <p
                  className={
                    expense!.status === "observado"
                      ? "text-sm font-medium text-warning"
                      : "text-sm font-medium text-info"
                  }
                >
                  {t("fundRequest.approvalNotes")}
                </p>
                <p className="text-sm">{expense!.manager_notes}</p>
              </div>
            )}
            {/* "Aprobado por: Sistema" (Fase 3): el plazo venció sin decisión */}
            {!isCreate && (expense!.manager_auto_approved || expense!.review_auto_approved) && (
              <div className="rounded-md border border-border bg-muted p-3 space-y-1 text-sm text-muted-foreground">
                {expense!.manager_auto_approved && <p>{t("fundRequestExpense.autoApproved.manager")}</p>}
                {expense!.review_auto_approved && <p>{t("fundRequestExpense.autoApproved.review")}</p>}
              </div>
            )}
            {/* Banner observación de factura + IVA */}
            {!isCreate && expense!.has_invoice_observation && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-1">
                <p className="text-sm font-medium text-warning">
                  {t("fundRequestExpense.invoiceObservationNotes")}
                </p>
                <p className="text-sm">{expense!.invoice_observation_notes}</p>
                <p className="text-sm font-mono">
                  {t("fundRequestExpense.ivaPenalty")}:{" "}
                  <span className="font-semibold text-warning">
                    {formatCurrency(Number(expense!.iva_penalty_amount), currency)} {currency}
                  </span>
                </p>
              </div>
            )}

            <FundRequestExpenseForm
              bare
              values={values}
              onChange={handleChange}
              workOrders={fundRequest.fund_request_work_orders ?? []}
              currency={currency}
              disabled={!isEditable}
              minDate={dateRange?.min}
            />

            {/* Historial del gasto (P5): quién lo envió, aprobó, devolvió o revisó. */}
            {expenseEvents.length > 0 && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-medium">{t("fundRequestEvent.title")}</p>
                <FundRequestTimeline events={expenseEvents} />
              </div>
            )}
          </>
        )}

        {/* ── Footer ── */}
        <DialogFooter className="gap-2">
          {subPanel ? (
            <>
              <Button variant="cancel" onClick={() => setSubPanel(null)} disabled={anyPending}>
                {t("common.cancel")}
              </Button>
              {/* Único subpanel: revisión del asistente */}
              <Button onClick={confirmReview} disabled={anyPending || !reviewAction}>
                {anyPending
                  ? t("common.saving")
                  : reviewAction === "return"
                    ? t("fundRequestExpense.actions.returnToRequester")
                    : reviewAction === "reject"
                      ? t("fundRequestExpense.actions.reject")
                      : t("fundRequestExpense.actions.validate")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="cancel" onClick={() => onOpenChange(false)} disabled={anyPending}>
                {isEditable || canReview ? t("common.cancel") : t("common.close")}
              </Button>

              {/* Solicitante: crear (solo guardar — el envío es en lote desde la lista) */}
              {isCreate && (
                <Button onClick={handleCreate} disabled={anyPending}>
                  {t("fundRequestExpense.actions.saveDraft")}
                </Button>
              )}

              {/* Solicitante: gasto devuelto por contabilidad → solo reenviar */}
              {isReturnedByAssistant && (
                <Button onClick={handleResend} disabled={anyPending}>
                  {t("fundRequestExpense.actions.resendToAccounting")}
                </Button>
              )}

              {/* Solicitante: editar normal (solo guardar) */}
              {!isCreate && isEditable && !isReturnedByAssistant && (
                <>
                  {expense!.status === "borrador" && (
                    <Button variant="destructive" onClick={handleDelete} disabled={anyPending}>
                      {t("common.delete")}
                    </Button>
                  )}
                  <Button onClick={handleSave} disabled={anyPending}>
                    {t("common.saveChanges")}
                  </Button>
                </>
              )}

              {/* Asistente/Admin: revisar factura */}
              {canReview && (
                <Button onClick={() => openSubPanel("review")} disabled={anyPending}>
                  {t("fundRequestExpense.actions.review")}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
