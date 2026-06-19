import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import { FundRequestStatusBadge } from "@/components/fund-requests/FundRequestStatusBadge";
import {
  FundRequestForm,
  type FundRequestFormValues,
} from "@/components/fund-requests/FundRequestForm";
import { OtApprovalList } from "@/components/fund-requests/OtApprovalList";
import { DisbursementDialog } from "@/components/fund-requests/DisbursementDialog";
import { LiquidationDialog } from "@/components/fund-requests/LiquidationDialog";
import { SimpleConfirmDialog } from "@/components/fund-requests/SimpleConfirmDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Receipt } from "lucide-react";
import { useFundRequestById } from "@/hooks/useFundRequests";
import { useFundRequestExpenses } from "@/hooks/useFundRequestExpenses";
import {
  useUpdateFundRequest,
  useSubmitFundRequest,
  useDeleteFundRequest,
  useDisburseFundRequest,
  useSettleFundRequest,
  useCloseFundRequest,
  useCancelFundRequest,
} from "@/hooks/mutations/useFundRequestMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

const staffName = (s?: { first_name?: string; last_name?: string; short_name?: string | null }) =>
  s ? s.short_name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : "-";

const FundRequestEdit = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: fr, isLoading } = useFundRequestById(id);
  const { data: expenses } = useFundRequestExpenses(id);
  // Los gastos cargaron (data !== undefined). Mientras cargan, los totales de
  // liquidación dan 0 y no se debe permitir liquidar (condición de carrera).
  const expensesLoaded = expenses !== undefined;
  const { staffRecord } = useCurrentStaff();
  const { isAdmin } = useUserRole();
  const updateFr = useUpdateFundRequest();
  const submitFr = useSubmitFundRequest();
  const deleteFr = useDeleteFundRequest();
  const disburseFr = useDisburseFundRequest();
  const settleFr = useSettleFundRequest();
  const closeFr = useCloseFundRequest();
  const cancelFr = useCancelFundRequest();

  const [values, setValues] = useState<FundRequestFormValues | null>(null);
  const [original, setOriginal] = useState<FundRequestFormValues | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showDisburseDialog, setShowDisburseDialog] = useState(false);
  const [showLiquidationDialog, setShowLiquidationDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Cargar valores cuando llega la data
  useEffect(() => {
    if (!fr) return;
    const next: FundRequestFormValues = {
      total_requested_amount: Number(fr.total_requested_amount),
      currency: fr.currency,
      purpose: fr.purpose || "",
      due_back_date: fr.due_back_date || "",
      allocations: (fr.fund_request_work_orders || []).map((a) => ({
        wo_id: a.wo_id,
        allocated_amount: Number(a.allocated_amount),
      })),
    };
    setValues(next);
    setOriginal(JSON.parse(JSON.stringify(next)));
  }, [fr]);

  const isRequester = !!staffRecord && !!fr && fr.requester_staff_id === staffRecord.staff_id;
  // El solicitante edita/reenvía en borrador, observado o rechazado (vuelve a él).
  const isDraft =
    isRequester &&
    (fr?.status === "borrador" || fr?.status === "observado" || fr?.status === "rechazado");
  const isReadOnly = !isDraft;
  // Gerente de al menos una OT de esta solicitud
  const isManagerOfThisFr =
    !!staffRecord &&
    !!fr &&
    (fr.fund_request_work_orders ?? []).some((o) => o.manager_staff_id === staffRecord.staff_id);
  // ── Liquidación (Fase 7) ──
  // Gasto validado = revisado_asistente. Solo eso cuenta como "gastado".
  const settlementSpent = useMemo(
    () =>
      (expenses ?? [])
        .filter((e) => e.status === "revisado_asistente")
        .reduce((s, e) => s + Number(e.amount || 0), 0),
    [expenses],
  );
  const settlementIvaTotal = useMemo(
    () => (expenses ?? []).reduce((s, e) => s + Number(e.iva_penalty_amount || 0), 0),
    [expenses],
  );
  // Gastos a medio camino impiden liquidar (datos incompletos).
  const unfinishedExpenses = useMemo(
    () =>
      (expenses ?? []).filter((e) =>
        ["borrador", "pendiente_aprobacion", "aprobado_gerente", "observado"].includes(e.status),
      ),
    [expenses],
  );

  // Contabilidad / Asistente lo hace admin por ahora
  const canDisburse = isAdmin && fr?.status === "aprobado_gerente";
  const settlementBlocked = unfinishedExpenses.length > 0;
  // Asistente liquida (calcula + resuelve) cuando hay fondos entregados y no
  // quedan gastos a medio camino → envía al encargado (en_liquidacion).
  const canLiquidate =
    isAdmin && fr?.status === "fondos_entregados" && expensesLoaded && !settlementBlocked;
  // Encargado cierra (o cancela) una vez recibida la liquidación.
  const canCloseSettlement = isAdmin && fr?.status === "en_liquidacion";
  const canCancel =
    isAdmin &&
    !!fr &&
    !["borrador", "cerrado", "cancelado"].includes(fr.status);
  // Gastos: visibles desde que se entregan los fondos (Fase 4 en adelante),
  // para solicitante, gerente de la FR o admin.
  const canViewExpenses =
    !!fr &&
    ["fondos_entregados", "en_liquidacion", "cerrado"].includes(fr.status) &&
    (isRequester || isManagerOfThisFr || isAdmin);

  const isDirty = useMemo(() => {
    if (!values || !original) return false;
    return JSON.stringify(values) !== JSON.stringify(original);
  }, [values, original]);

  const { blocker, allowNextNavigation } = usePageLeaveLock({
    locked: !isReadOnly,
    isDirty,
  });

  const handleChange = (patch: Partial<FundRequestFormValues>) => {
    setValues((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const validate = (): string | null => {
    if (!values) return null;
    if (!values.total_requested_amount || values.total_requested_amount <= 0)
      return t("fundRequest.errors.amountRequired");
    if (values.allocations.length === 0) return t("fundRequest.errors.allocationsRequired");
    if (values.allocations.some((a) => !a.wo_id || a.allocated_amount <= 0))
      return t("fundRequest.errors.allocationIncomplete");
    const totalAlloc = values.allocations.reduce((s, a) => s + Number(a.allocated_amount || 0), 0);
    if (Math.abs(totalAlloc - values.total_requested_amount) > 0.01)
      return t("fundRequest.errors.allocationMismatch");
    return null;
  };

  const handleSave = async () => {
    if (!fr || !values) return;
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await updateFr.mutateAsync({
        id: fr.fund_request_id,
        data: {
          total_requested_amount: values.total_requested_amount,
          currency: values.currency,
          purpose: values.purpose || null,
          due_back_date: values.due_back_date || null,
          allocations: values.allocations,
        },
      });
      setOriginal(JSON.parse(JSON.stringify(values)));
    } catch {
      // toast por mutation
    }
  };

  const handleSubmit = async () => {
    if (!fr || !values) return;
    if (isDirty) {
      const err = validate();
      if (err) {
        toast.error(err);
        setShowSubmitDialog(false);
        return;
      }
      await updateFr.mutateAsync({
        id: fr.fund_request_id,
        data: {
          total_requested_amount: values.total_requested_amount,
          currency: values.currency,
          purpose: values.purpose || null,
          due_back_date: values.due_back_date || null,
          allocations: values.allocations,
        },
      });
    }
    await submitFr.mutateAsync(fr.fund_request_id);
    setShowSubmitDialog(false);
  };

  const handleDelete = async () => {
    if (!fr) return;
    await deleteFr.mutateAsync(fr.fund_request_id);
    allowNextNavigation();
    navigate("/fund-requests");
  };

  const accountingPending =
    disburseFr.isPending ||
    settleFr.isPending ||
    closeFr.isPending ||
    cancelFr.isPending;

  const handleDisburse = async ({ amount, notes }: { amount: number; notes: string }) => {
    if (!fr) return;
    try {
      await disburseFr.mutateAsync({
        id: fr.fund_request_id,
        amount,
        notes,
        disbursedByStaffId: staffRecord?.staff_id ?? null,
      });
      setShowDisburseDialog(false);
    } catch {
      // toast por mutation
    }
  };

  const handleClose = async (notes: string) => {
    if (!fr) return;
    try {
      await closeFr.mutateAsync({ id: fr.fund_request_id, notes });
      setShowCloseDialog(false);
    } catch {
      // toast por mutation
    }
  };

  const handleSettle = async ({
    resolution,
    amount,
    notes,
  }: {
    resolution: "sin_saldo" | "devolucion" | "descuento_planilla" | "pago_solicitante";
    amount: number;
    notes: string;
  }) => {
    if (!fr) return;
    const disbursed = Number(fr.total_disbursed_amount);
    try {
      await settleFr.mutateAsync({
        id: fr.fund_request_id,
        totalSpent: settlementSpent,
        balance: Math.round((disbursed - settlementSpent) * 100) / 100,
        ivaTotal: settlementIvaTotal,
        resolution,
        amount,
        notes,
        settledByStaffId: staffRecord?.staff_id ?? null,
      });
      setShowLiquidationDialog(false);
    } catch {
      // toast por mutation
    }
  };

  const handleCancel = async (reason: string) => {
    if (!fr) return;
    try {
      await cancelFr.mutateAsync({ id: fr.fund_request_id, reason });
      setShowCancelDialog(false);
    } catch {
      // toast por mutation
    }
  };

  if (isLoading || !values) {
    return (
      <AppLayout title={t("entities.fundRequest")} focusMode>
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!fr) {
    return (
      <AppLayout title={t("entities.fundRequest")} focusMode>
        <div className="text-center py-12 text-muted-foreground">{t("common.noResults")}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`${t("entities.fundRequest")} — ${fr.request_number}`} focusMode>
      <div className="space-y-6">
        {/* Header con info, estado y acciones */}
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="flex gap-6 flex-wrap">
                <div>
                  <p className="text-sm text-muted-foreground">{t("fundRequest.requester")}</p>
                  <p className="font-semibold">{staffName(fr.requester)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.status")}</p>
                  <FundRequestStatusBadge status={fr.status} />
                </div>
              </div>

              {/* Acciones — arriba para que el toast no las tape */}
              <div className="flex gap-2 flex-wrap justify-end">
                <Button
                  variant="cancel"
                  onClick={() => {
                    allowNextNavigation();
                    navigate(-1);
                  }}
                >
                  {t("common.back")}
                </Button>

                {canViewExpenses && (
                  <Button
                    variant="submit"
                    className="bg-brand-teal hover:bg-brand-teal/90"
                    onClick={() => navigate(`/fund-requests/${fr.fund_request_id}/expenses`)}
                  >
                    <Receipt className="mr-2 h-4 w-4" />
                    {t("fundRequestExpense.manageExpenses")}
                  </Button>
                )}

                {isDraft && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={deleteFr.isPending || fr.status !== "borrador"}
                    >
                      {t("common.delete")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSave}
                      disabled={!isDirty || updateFr.isPending}
                    >
                      {updateFr.isPending ? t("common.saving") : t("common.saveChanges")}
                    </Button>
                    <Button
                      onClick={() => setShowSubmitDialog(true)}
                      disabled={submitFr.isPending}
                    >
                      {t("fundRequest.actions.submit")}
                    </Button>
                  </>
                )}

                {canCancel && (
                  <Button
                    variant="destructive"
                    onClick={() => setShowCancelDialog(true)}
                    disabled={accountingPending}
                  >
                    {t("fundRequest.actions.cancel")}
                  </Button>
                )}

                {canDisburse && (
                  <Button onClick={() => setShowDisburseDialog(true)} disabled={accountingPending}>
                    {t("fundRequest.actions.disburse")}
                  </Button>
                )}

                {canLiquidate && (
                  <Button onClick={() => setShowLiquidationDialog(true)} disabled={accountingPending}>
                    {t("fundRequest.settlement.action")}
                  </Button>
                )}

                {canCloseSettlement && (
                  <Button onClick={() => setShowCloseDialog(true)} disabled={accountingPending}>
                    {t("fundRequest.actions.close")}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Guard: no se puede liquidar con gastos sin finalizar */}
        {isAdmin && fr.status === "fondos_entregados" && settlementBlocked && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t("fundRequest.settlement.blockedHint", { count: unfinishedExpenses.length })}
            </AlertDescription>
          </Alert>
        )}

        {/* Liquidación: resumen registrado por el asistente (visible en
            liquidación para el encargado, y al cerrar) */}
        {fr.settlement_resolution && (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="py-3 space-y-1">
              <p className="text-sm font-medium text-success">
                {t("fundRequest.settlement.summaryTitle")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{t("fundRequestExpense.totalSpent")}:</span>{" "}
                  <span className="font-mono">
                    {Number(fr.settlement_total_spent ?? 0).toLocaleString(
                      fr.currency === "BOB" ? "es-BO" : "en-US",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    )}{" "}
                    {fr.currency}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("fundRequestExpense.balance")}:</span>{" "}
                  <span className="font-mono">
                    {Number(fr.settlement_balance ?? 0).toLocaleString(
                      fr.currency === "BOB" ? "es-BO" : "en-US",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    )}{" "}
                    {fr.currency}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("fundRequest.settlement.resolutionLabel")}:</span>{" "}
                  {t(`fundRequest.settlement.resolution.${fr.settlement_resolution}`)}
                </div>
              </div>
              {fr.settlement_notes && (
                <p className="text-sm pt-1">
                  <span className="text-muted-foreground">{t("fundRequest.accountingNotes")}:</span>{" "}
                  {fr.settlement_notes}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {fr.status === "cancelado" && fr.rejection_reason && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="py-3">
              <p className="text-sm font-medium text-destructive">
                {t("fundRequest.cancellationReason")}
              </p>
              <p className="text-sm">{fr.rejection_reason}</p>
            </CardContent>
          </Card>
        )}

        {/* Notas del gerente cuando vuelve al solicitante para corregir (observado/rechazado) */}
        {isDraft &&
          (fr.status === "observado" || fr.status === "rechazado") &&
          (fr.fund_request_work_orders ?? []).some(
            (o) => o.rejection_reason || o.manager_notes,
          ) && (
            <Card
              className={
                fr.status === "rechazado"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-warning/30 bg-warning/5"
              }
            >
              <CardContent className="py-3 space-y-1">
                <p
                  className={
                    fr.status === "rechazado"
                      ? "text-sm font-medium text-destructive"
                      : "text-sm font-medium text-warning"
                  }
                >
                  {t("fundRequest.approvalNotes")}
                </p>
                {(fr.fund_request_work_orders ?? [])
                  .filter((o) => o.rejection_reason || o.manager_notes)
                  .map((o) => (
                    <p key={o.fr_wo_id} className="text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {o.work_order?.engagement?.engagement_code}
                      </span>{" "}
                      — {o.rejection_reason || o.manager_notes}
                    </p>
                  ))}
              </CardContent>
            </Card>
          )}

        {Number(fr.total_disbursed_amount) > 0 && (
          <Card className="border-info/30 bg-info/5">
            <CardContent className="py-3 space-y-1">
              <p className="text-sm font-medium text-info">
                {t("fundRequest.disbursementInfo")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    {t("fundRequest.totalDisbursed")}:
                  </span>{" "}
                  <span className="font-mono font-semibold">
                    {Math.round(Number(fr.total_disbursed_amount)).toLocaleString(
                      fr.currency === "BOB" ? "es-BO" : "en-US",
                      { maximumFractionDigits: 0 },
                    )}{" "}
                    {fr.currency}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("fundRequest.disbursedAt")}:
                  </span>{" "}
                  {fr.disbursed_at
                    ? new Date(fr.disbursed_at).toLocaleDateString("es-BO", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })
                    : "-"}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("fundRequest.disbursedBy")}:
                  </span>{" "}
                  {staffName(fr.disbursed_by)}
                </div>
              </div>
              {fr.accounting_notes && (
                <div className="text-sm pt-1">
                  <span className="text-muted-foreground">
                    {t("fundRequest.accountingNotes")}:
                  </span>{" "}
                  {fr.accounting_notes}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <FundRequestForm
          values={values}
          onChange={handleChange}
          disabled={isReadOnly}
          hideAllocations={isReadOnly}
        />

        {/* Aprobación por OT — única tabla en estados de lectura/aprobación
            (en estados editables se muestra "Distribución por OT" del formulario) */}
        {isReadOnly && fr.status !== "borrador" && (
          <OtApprovalList fr={fr} myStaffId={staffRecord?.staff_id} />
        )}
      </div>

      {/* Disbursement dialog */}
      <DisbursementDialog
        open={showDisburseDialog}
        onOpenChange={setShowDisburseDialog}
        requestedAmount={Number(fr.total_requested_amount)}
        currency={fr.currency}
        isSubmitting={disburseFr.isPending}
        onConfirm={handleDisburse}
      />

      {/* Close dialog (encargado cierra el flujo tras la liquidación) */}
      <SimpleConfirmDialog
        open={showCloseDialog}
        onOpenChange={setShowCloseDialog}
        title={t("fundRequest.dialog.closeTitle")}
        body={t("fundRequest.dialog.closeBody")}
        confirmLabel={t("fundRequest.actions.close")}
        notesLabel={t("fundRequest.accountingNotes")}
        notesRequired={false}
        isSubmitting={closeFr.isPending}
        onConfirm={handleClose}
      />

      {/* Liquidation dialog */}
      <LiquidationDialog
        open={showLiquidationDialog}
        onOpenChange={setShowLiquidationDialog}
        currency={fr.currency}
        disbursed={Number(fr.total_disbursed_amount)}
        spent={settlementSpent}
        ivaTotal={settlementIvaTotal}
        isSubmitting={settleFr.isPending}
        onConfirm={handleSettle}
      />

      {/* Cancel dialog */}
      <SimpleConfirmDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        title={t("fundRequest.dialog.cancelTitle")}
        body={t("fundRequest.dialog.cancelBody")}
        confirmLabel={t("fundRequest.actions.cancel")}
        notesLabel={t("fundRequest.cancellationReason")}
        notesRequired={true}
        destructive
        isSubmitting={cancelFr.isPending}
        onConfirm={handleCancel}
      />

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fundRequest.confirmDelete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("fundRequest.confirmDelete.body", { number: fr.request_number })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit confirmation */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fundRequest.confirmSubmit.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("fundRequest.confirmSubmit.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>
              {t("fundRequest.actions.submit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default FundRequestEdit;
