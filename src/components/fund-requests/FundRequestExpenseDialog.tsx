import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Eye, XCircle, FileSearch } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { FundRequestExpenseStatusBadge } from "@/components/fund-requests/FundRequestExpenseStatusBadge";
import {
  FundRequestExpenseForm,
  type FundRequestExpenseFormValues,
} from "@/components/fund-requests/FundRequestExpenseForm";
import type { FundRequest } from "@/hooks/useFundRequests";
import type { FundRequestExpense } from "@/hooks/useFundRequestExpenses";
import {
  useCreateFundRequestExpense,
  useUpdateFundRequestExpense,
  useSubmitFundRequestExpense,
  useApproveFundRequestExpense,
  useObserveFundRequestExpense,
  useRejectFundRequestExpense,
  useReviewFundRequestExpense,
  useDeleteFundRequestExpense,
} from "@/hooks/mutations/useFundRequestExpenseMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

const emptyValues: FundRequestExpenseFormValues = {
  wo_id: "",
  expense_type_id: "",
  expense_date: "",
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

type SubPanel = "approve" | "observe" | "reject" | "review" | null;

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
  const submitExpense = useSubmitFundRequestExpense();
  const approveExpense = useApproveFundRequestExpense();
  const observeExpense = useObserveFundRequestExpense();
  const rejectExpense = useRejectFundRequestExpense();
  const reviewExpense = useReviewFundRequestExpense();
  const deleteExpense = useDeleteFundRequestExpense();

  const [values, setValues] = useState<FundRequestExpenseFormValues>(emptyValues);
  const [subPanel, setSubPanel] = useState<SubPanel>(null);
  const [notes, setNotes] = useState("");
  const [hasObservation, setHasObservation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCreate = !expense;
  const currency = fundRequest.currency;

  const isRequester =
    !!staffRecord && fundRequest.requester_staff_id === staffRecord.staff_id;
  const isManager =
    !!staffRecord && fundRequest.approver_manager_staff_id === staffRecord.staff_id;

  const isEditable =
    isCreate ||
    (isRequester && ["borrador", "observado", "rechazado"].includes(expense!.status));
  const canDecide =
    !isCreate && expense!.status === "pendiente_aprobacion" && (isManager || isAdmin);
  const canReview = !isCreate && isAdmin && expense!.status === "aprobado_gerente";

  // Resetear estado al abrir / cambiar de gasto
  useEffect(() => {
    if (!open) return;
    setSubPanel(null);
    setNotes("");
    setHasObservation(false);
    setError(null);
    if (expense) {
      setValues({
        wo_id: expense.wo_id,
        expense_type_id: expense.expense_type_id || "",
        expense_date: expense.expense_date || "",
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
    submitExpense.isPending ||
    approveExpense.isPending ||
    observeExpense.isPending ||
    rejectExpense.isPending ||
    reviewExpense.isPending ||
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

  const handleSaveAndSubmit = async () => {
    if (!expense) return;
    const err = validate();
    if (err) return toast.error(err);
    try {
      await updateExpense.mutateAsync({ id: expense.fre_id, data: payload() });
      await submitExpense.mutateAsync(expense.fre_id);
      onOpenChange(false);
    } catch {
      /* toast por mutation */
    }
  };

  const handleCreateAndSubmit = async () => {
    const err = validate();
    if (err) return toast.error(err);
    try {
      const created = await createExpense.mutateAsync({
        fund_request_id: fundRequest.fund_request_id,
        currency,
        ...payload(),
      });
      await submitExpense.mutateAsync(created.fre_id);
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

  // ── Sub-panel: decisión del gerente ─────────────────────────
  const confirmDecision = async () => {
    if (!expense) return;
    const requiresNotes = subPanel === "observe" || subPanel === "reject";
    if (requiresNotes && notes.trim().length === 0) {
      setError(t("fundRequest.errors.notesRequired"));
      return;
    }
    try {
      if (subPanel === "approve") {
        await approveExpense.mutateAsync({ id: expense.fre_id, notes });
      } else if (subPanel === "observe") {
        await observeExpense.mutateAsync({ id: expense.fre_id, notes });
      } else if (subPanel === "reject") {
        await rejectExpense.mutateAsync({ id: expense.fre_id, reason: notes });
      }
      onOpenChange(false);
    } catch {
      /* toast por mutation */
    }
  };

  // ── Sub-panel: revisión de factura del asistente ────────────
  const confirmReview = async () => {
    if (!expense) return;
    if (hasObservation && notes.trim().length === 0) {
      setError(t("fundRequestExpense.errors.observationNotesRequired"));
      return;
    }
    try {
      await reviewExpense.mutateAsync({
        id: expense.fre_id,
        hasObservation,
        observationNotes: notes,
        amount: Number(expense.amount),
        reviewedByStaffId: staffRecord?.staff_id ?? null,
      });
      onOpenChange(false);
    } catch {
      /* toast por mutation */
    }
  };

  const openSubPanel = (panel: SubPanel) => {
    setNotes("");
    setHasObservation(false);
    setError(null);
    setSubPanel(panel);
  };

  // ── Título dinámico ─────────────────────────────────────────
  const title = isCreate
    ? t("fundRequestExpense.newExpense")
    : subPanel === "approve"
      ? t("fundRequest.dialog.approveTitle")
      : subPanel === "observe"
        ? t("fundRequest.dialog.observeTitle")
        : subPanel === "reject"
          ? t("fundRequest.dialog.rejectTitle")
          : subPanel === "review"
            ? t("fundRequestExpense.dialog.reviewTitle")
            : t("entities.expense");

  const ivaPenalty = expense ? Math.round(Number(expense.amount) * 0.13 * 100) / 100 : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !anyPending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {subPanel === "approve" && <CheckCircle2 className="h-5 w-5 text-success" />}
            {subPanel === "observe" && <Eye className="h-5 w-5 text-warning" />}
            {subPanel === "reject" && <XCircle className="h-5 w-5 text-destructive" />}
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

        {/* ── Sub-panel: decisión del gerente ── */}
        {subPanel && subPanel !== "review" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {subPanel === "approve"
                ? t("fundRequest.dialog.approveBody")
                : subPanel === "observe"
                  ? t("fundRequest.dialog.observeBody")
                  : t("fundRequest.dialog.rejectBody")}
            </p>
            {subPanel !== "approve" && (
              <div className="space-y-2">
                <Label htmlFor="exp-decision-notes">
                  {subPanel === "reject"
                    ? t("fundRequest.rejectionReason")
                    : t("fundRequest.approvalNotes")}
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <Textarea
                  id="exp-decision-notes"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    if (error) setError(null);
                  }}
                  rows={4}
                  placeholder={t("fundRequest.dialog.notesPlaceholderRequired")}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            )}
          </div>
        )}

        {/* ── Sub-panel: revisión de factura ── */}
        {subPanel === "review" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("fundRequestExpense.dialog.reviewBody")}
            </p>
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                id="exp-invoice-observation"
                checked={hasObservation}
                onCheckedChange={(c) => {
                  setHasObservation(c === true);
                  if (error) setError(null);
                }}
              />
              <div className="space-y-1">
                <Label htmlFor="exp-invoice-observation" className="cursor-pointer">
                  {t("fundRequestExpense.dialog.hasObservation")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("fundRequestExpense.dialog.hasObservationHelp")}
                </p>
              </div>
            </div>
            {hasObservation && (
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
              {subPanel === "review" ? (
                <Button onClick={confirmReview} disabled={anyPending}>
                  {anyPending ? t("common.saving") : t("fundRequestExpense.actions.review")}
                </Button>
              ) : (
                <Button
                  onClick={confirmDecision}
                  disabled={anyPending}
                  className={
                    subPanel === "reject"
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : undefined
                  }
                >
                  {anyPending
                    ? t("common.saving")
                    : subPanel === "approve"
                      ? t("fundRequest.actions.approve")
                      : subPanel === "observe"
                        ? t("fundRequest.actions.observe")
                        : t("fundRequest.actions.reject")}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="cancel" onClick={() => onOpenChange(false)} disabled={anyPending}>
                {isEditable || canDecide || canReview ? t("common.cancel") : t("common.close")}
              </Button>

              {/* Solicitante: crear */}
              {isCreate && (
                <>
                  <Button variant="outline" onClick={handleCreate} disabled={anyPending}>
                    {t("fundRequestExpense.actions.saveDraft")}
                  </Button>
                  <Button onClick={handleCreateAndSubmit} disabled={anyPending}>
                    {t("fundRequestExpense.actions.submit")}
                  </Button>
                </>
              )}

              {/* Solicitante: editar */}
              {!isCreate && isEditable && (
                <>
                  {expense!.status === "borrador" && (
                    <Button variant="destructive" onClick={handleDelete} disabled={anyPending}>
                      {t("common.delete")}
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleSave} disabled={anyPending}>
                    {t("common.saveChanges")}
                  </Button>
                  <Button onClick={handleSaveAndSubmit} disabled={anyPending}>
                    {t("fundRequestExpense.actions.submit")}
                  </Button>
                </>
              )}

              {/* Gerente: decisión */}
              {canDecide && (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => openSubPanel("reject")}
                    disabled={anyPending}
                  >
                    {t("fundRequest.actions.reject")}
                  </Button>
                  <Button variant="outline" onClick={() => openSubPanel("observe")} disabled={anyPending}>
                    {t("fundRequest.actions.observe")}
                  </Button>
                  <Button onClick={() => openSubPanel("approve")} disabled={anyPending}>
                    {t("fundRequest.actions.approve")}
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
