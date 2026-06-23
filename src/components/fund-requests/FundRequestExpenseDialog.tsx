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
import {
  useCreateFundRequestExpense,
  useUpdateFundRequestExpense,
  useReviewFundRequestExpense,
  useReturnFundRequestExpense,
  useResendReturnedExpense,
  useDeleteFundRequestExpense,
} from "@/hooks/mutations/useFundRequestExpenseMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useUserRole } from "@/hooks/useUserRole";
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
  const { isAdmin } = useUserRole();

  const createExpense = useCreateFundRequestExpense();
  const updateExpense = useUpdateFundRequestExpense();
  const reviewExpense = useReviewFundRequestExpense();
  const returnExpense = useReturnFundRequestExpense();
  const resendReturned = useResendReturnedExpense();
  const deleteExpense = useDeleteFundRequestExpense();

  const [values, setValues] = useState<FundRequestExpenseFormValues>(emptyValues);
  const [subPanel, setSubPanel] = useState<SubPanel>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Revisión del asistente (árbol): ¿tiene factura? → ¿correcta?
  const [hasInvoice, setHasInvoice] = useState<"yes" | "no" | null>(null);
  const [invoiceCorrect, setInvoiceCorrect] = useState<"yes" | "no" | null>(null);

  const isCreate = !expense;
  const currency = fundRequest.currency;

  const isRequester =
    !!staffRecord && fundRequest.requester_staff_id === staffRecord.staff_id;

  // El solicitante solo puede editar/registrar mientras la solicitud sigue en
  // fase de registro de gastos. Tras en_liquidacion/cerrado queda congelado
  // (si no, se podría editar un gasto rechazado y ensuciar la auditoría).
  const isEntryPhase = fundRequest.status === "fondos_entregados";

  // Gasto devuelto por contabilidad: el solicitante SOLO adjunta el respaldo y
  // lo reenvía directo a contabilidad (no edita el resto ni pasa por el gerente).
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
  const canReview = !isCreate && isAdmin && expense!.status === "aprobado_gerente";

  // Resetear estado al abrir / cambiar de gasto
  useEffect(() => {
    if (!open) return;
    setSubPanel(null);
    setNotes("");
    setHasInvoice(null);
    setInvoiceCorrect(null);
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

  // Reenvío directo a contabilidad (gasto devuelto por falta de respaldo)
  const handleResend = async () => {
    if (!expense) return;
    if (!values.attachment_url) {
      return toast.error(t("fundRequestExpense.errors.attachmentRequired"));
    }
    try {
      await resendReturned.mutateAsync({
        id: expense.fre_id,
        attachmentUrl: values.attachment_url,
      });
      onOpenChange(false);
    } catch {
      /* toast por mutation */
    }
  };

  // ── Sub-panel: revisión de factura del asistente ────────────
  const confirmReview = async () => {
    if (!expense) return;
    try {
      // Sin factura → se devuelve al solicitante (con flag para que vuelva
      // directo al asistente al reenviar).
      if (hasInvoice === "no") {
        if (notes.trim().length === 0) {
          setError(t("fundRequestExpense.errors.noInvoiceNotesRequired"));
          return;
        }
        await returnExpense.mutateAsync({ id: expense.fre_id, notes });
        onOpenChange(false);
        return;
      }
      // Con factura incorrecta → validar con devolución del 13%.
      if (invoiceCorrect === "no" && notes.trim().length === 0) {
        setError(t("fundRequestExpense.errors.observationNotesRequired"));
        return;
      }
      await reviewExpense.mutateAsync({
        id: expense.fre_id,
        hasObservation: invoiceCorrect === "no",
        observationNotes: notes,
        amount: Number(expense.amount),
        reviewedByStaffId: staffRecord?.staff_id ?? null,
      });
      onOpenChange(false);
    } catch {
      /* toast por mutation */
    }
  };

  // ¿La elección de revisión está completa para habilitar el confirmar?
  const reviewReady =
    hasInvoice === "no" || (hasInvoice === "yes" && invoiceCorrect !== null);

  const openSubPanel = (panel: SubPanel) => {
    setNotes("");
    setHasInvoice(null);
    setInvoiceCorrect(null);
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
      <DialogContent className="max-w-2xl">
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

        {/* ── Sub-panel: revisión de factura (asistente) ── */}
        {subPanel === "review" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("fundRequestExpense.dialog.reviewBody")}
            </p>

            {/* Paso 1: ¿tiene factura/respaldo? */}
            <div className="space-y-2">
              <Label>{t("fundRequestExpense.dialog.hasInvoiceQuestion")}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={hasInvoice === "yes" ? "default" : "outline"}
                  onClick={() => {
                    setHasInvoice("yes");
                    setInvoiceCorrect(null);
                    setNotes("");
                    setError(null);
                  }}
                >
                  {t("common.yes")}
                </Button>
                <Button
                  type="button"
                  variant={hasInvoice === "no" ? "destructive" : "outline"}
                  onClick={() => {
                    setHasInvoice("no");
                    setInvoiceCorrect(null);
                    setNotes("");
                    setError(null);
                  }}
                >
                  {t("common.no")}
                </Button>
              </div>
            </div>

            {/* Sin factura → se devuelve al solicitante */}
            {hasInvoice === "no" && (
              <div className="space-y-2">
                <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-sm text-warning">
                  {t("fundRequestExpense.dialog.noInvoiceWarning")}
                </div>
                <Label htmlFor="exp-noinvoice-notes">
                  {t("fundRequestExpense.dialog.returnReason")}
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <Textarea
                  id="exp-noinvoice-notes"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    if (error) setError(null);
                  }}
                  rows={3}
                  placeholder={t("fundRequestExpense.dialog.noInvoicePlaceholder")}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            )}

            {/* Paso 2: ¿la factura es correcta? */}
            {hasInvoice === "yes" && (
              <div className="space-y-2">
                <Label>{t("fundRequestExpense.dialog.invoiceCorrectQuestion")}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={invoiceCorrect === "yes" ? "default" : "outline"}
                    onClick={() => {
                      setInvoiceCorrect("yes");
                      setNotes("");
                      setError(null);
                    }}
                  >
                    {t("fundRequestExpense.dialog.invoiceCorrect")}
                  </Button>
                  <Button
                    type="button"
                    variant={invoiceCorrect === "no" ? "destructive" : "outline"}
                    onClick={() => {
                      setInvoiceCorrect("no");
                      setError(null);
                    }}
                  >
                    {t("fundRequestExpense.dialog.invoiceIncorrect")}
                  </Button>
                </div>
              </div>
            )}

            {/* Factura incorrecta → nota + devolución 13% */}
            {hasInvoice === "yes" && invoiceCorrect === "no" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="exp-observation-notes">
                    {t("fundRequestExpense.invoiceObservationNotes")}
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <Textarea
                    id="exp-observation-notes"
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
                <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-sm">
                  <p className="font-medium text-warning">
                    {t("fundRequestExpense.dialog.ivaWarning")}
                  </p>
                  <p className="font-mono mt-1">
                    {formatCurrency(ivaPenalty, currency)} {currency}
                  </p>
                </div>
              </>
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
              onlyAttachment={isReturnedByAssistant}
            />
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
              <Button onClick={confirmReview} disabled={anyPending || !reviewReady}>
                {anyPending
                  ? t("common.saving")
                  : hasInvoice === "no"
                    ? t("fundRequestExpense.actions.returnToRequester")
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
