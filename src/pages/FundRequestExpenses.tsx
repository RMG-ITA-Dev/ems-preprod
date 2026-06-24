import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Info, Download } from "lucide-react";
import { toast } from "sonner";
import {
  downloadExpenseReportXlsx,
  reportFilename,
  type ExpenseReportLabels,
} from "@/lib/fundRequestExpenseReportExport";
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
import { DataTable, Column } from "@/components/data-table/DataTable";
import { FundRequestExpenseStatusBadge } from "@/components/fund-requests/FundRequestExpenseStatusBadge";
import { FundRequestExpenseDialog } from "@/components/fund-requests/FundRequestExpenseDialog";
import {
  ApprovalDecisionDialog,
  type DecisionMode,
} from "@/components/fund-requests/ApprovalDecisionDialog";
import { useFundRequestById } from "@/hooks/useFundRequests";
import {
  useFundRequestExpenses,
  type FundRequestExpense,
} from "@/hooks/useFundRequestExpenses";
import {
  useSubmitAllFundRequestExpenses,
  useDecideAllFundRequestExpenses,
} from "@/hooks/mutations/useFundRequestExpenseMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useUserRole } from "@/hooks/useUserRole";
import { parseDateLocal } from "@/lib/timesheetUtils";

const formatCurrency = (n: number, currency: "BOB" | "USD") =>
  Number(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "-";
  // expense_date es un DATE (YYYY-MM-DD): parsear como fecha local para evitar
  // el corrimiento de un día que provoca new Date() al interpretarlo como UTC.
  return parseDateLocal(iso).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const FundRequestExpenses = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: fr, isLoading: frLoading } = useFundRequestById(id);
  const { data: expenses, isLoading: expLoading } = useFundRequestExpenses(id);
  const { staffRecord } = useCurrentStaff();
  const { isAdmin } = useUserRole();

  const submitAll = useSubmitAllFundRequestExpenses();
  const decideAll = useDecideAllFundRequestExpenses();

  // Modal: undefined = cerrado, null = crear, objeto = ver/editar
  const [dialogExpense, setDialogExpense] = useState<FundRequestExpense | null | undefined>(
    undefined,
  );
  const [showSubmitAll, setShowSubmitAll] = useState(false);
  const [decisionMode, setDecisionMode] = useState<DecisionMode | null>(null);

  const isRequester =
    !!staffRecord && !!fr && fr.requester_staff_id === staffRecord.staff_id;
  // Gerente de alguna OT de esta solicitud.
  const isManagerOfThisFr =
    !!staffRecord &&
    (fr?.fund_request_work_orders ?? []).some((o) => o.manager_staff_id === staffRecord.staff_id);
  // Solo los actores del flujo pueden descargar el reporte: solicitante, gerente
  // de OT, o admin (contabilidad por ahora). Y solo si hay gastos que reportar.
  const canExport =
    (isRequester || isManagerOfThisFr || isAdmin) && (expenses?.length ?? 0) > 0;
  // Hay gastos "bloqueados": enviados (pendiente), aprobados por el gerente o
  // revisados por contabilidad. Mientras exista alguno, el solicitante no puede
  // registrar/enviar nuevos gastos.
  const hasLockedExpenses = (expenses ?? []).some((e) =>
    ["pendiente_aprobacion", "aprobado_gerente", "revisado_asistente"].includes(e.status),
  );
  // Gastos devueltos por contabilidad (solo falta adjuntar respaldo): se
  // reenvían UNO POR UNO desde su modal, no en lote. Mientras exista alguno,
  // tampoco se agregan nuevos gastos (irían al gerente y aquí toca resolver
  // primero lo de contabilidad).
  const hasReturnedByAssistant = (expenses ?? []).some(
    (e) => e.status === "observado" && e.returned_by_assistant,
  );
  const canAddExpenses =
    isRequester &&
    fr?.status === "fondos_entregados" &&
    !hasLockedExpenses &&
    !hasReturnedByAssistant;

  // Gastos que se pueden enviar en lote al gerente (excluye los devueltos por
  // contabilidad, que se reenvían individualmente).
  const submittable = useMemo(
    () =>
      (expenses ?? []).filter(
        (e) =>
          ["borrador", "observado", "rechazado"].includes(e.status) &&
          !e.returned_by_assistant,
      ),
    [expenses],
  );
  // Reenviar correcciones (observado/rechazado) NO depende de poder agregar
  // gastos nuevos: aunque haya un gasto ya revisado (bloqueado), el solicitante
  // debe poder reenviar lo corregido. Solo se respeta el gate de los devueltos
  // por contabilidad (que se reenvían uno por uno).
  const canSubmitAll =
    isRequester &&
    fr?.status === "fondos_entregados" &&
    !hasReturnedByAssistant &&
    submittable.length > 0;

  const handleSubmitAll = async () => {
    if (!id) return;
    try {
      await submitAll.mutateAsync({ fundRequestId: id, ids: submittable.map((e) => e.fre_id) });
      setShowSubmitAll(false);
    } catch {
      /* toast por mutation */
    }
  };

  // Gastos pendientes que ESTE gerente debe decidir (sus OTs). El admin ve todos.
  const myPendingExpenses = useMemo(() => {
    const list = (expenses ?? []).filter((e) => e.status === "pendiente_aprobacion");
    if (isAdmin) return list;
    if (!staffRecord || !fr) return [];
    const myWoIds = new Set(
      (fr.fund_request_work_orders ?? [])
        .filter((o) => o.manager_staff_id === staffRecord.staff_id)
        .map((o) => o.wo_id),
    );
    return list.filter((e) => myWoIds.has(e.wo_id));
  }, [expenses, fr, staffRecord, isAdmin]);

  const canDecideAll = myPendingExpenses.length > 0;

  const handleDecideAll = async (notes: string) => {
    if (!id || !decisionMode) return;
    const decision =
      decisionMode === "approve"
        ? "aprobado_gerente"
        : decisionMode === "observe"
          ? "observado"
          : "rechazado";
    try {
      await decideAll.mutateAsync({
        fundRequestId: id,
        ids: myPendingExpenses.map((e) => e.fre_id),
        decision,
        notes,
      });
      setDecisionMode(null);
    } catch {
      /* toast por mutation */
    }
  };

  const currency = (fr?.currency ?? "BOB") as "BOB" | "USD";

  const totals = useMemo(() => {
    const list = expenses ?? [];
    const spent = list.reduce((s, e) => s + Number(e.amount || 0), 0);
    const ivaPenalty = list.reduce((s, e) => s + Number(e.iva_penalty_amount || 0), 0);
    const disbursed = Number(fr?.total_disbursed_amount ?? 0);
    const balance = disbursed - spent;
    return { spent, ivaPenalty, disbursed, balance };
  }, [expenses, fr]);

  const handleExport = async () => {
    if (!fr) return;
    const labels: ExpenseReportLabels = {
      title: t("fundRequestExpense.report.title"),
      sheetName: t("fundRequestExpense.report.sheetName"),
      summary: {
        requester: t("fundRequest.requester"),
        status: t("common.status"),
        disbursed: t("fundRequest.totalDisbursed"),
        spent: t("fundRequestExpense.totalSpent"),
        balance: t("fundRequestExpense.balance"),
        ivaTotal: t("fundRequestExpense.totalIvaPenalty"),
      },
      workOrders: {
        section: t("fundRequestExpense.report.workOrdersSection"),
        code: t("fundRequestExpense.workOrder"),
        engagement: t("fundRequestExpense.report.engagement"),
        manager: t("fundRequest.manager"),
        allocated: t("fundRequestExpense.report.allocated"),
        status: t("common.status"),
      },
      detail: {
        section: t("fundRequestExpense.report.detailSection"),
        date: t("fundRequestExpense.expenseDate"),
        workOrder: t("fundRequestExpense.workOrder"),
        expenseType: t("fundRequestExpense.expenseType"),
        description: t("fundRequestExpense.description"),
        documentNumber: t("fundRequestExpense.report.documentNumber"),
        supplier: t("fundRequestExpense.report.supplier"),
        supplierTaxId: t("fundRequestExpense.report.supplierTaxId"),
        amount: t("fundRequestExpense.amount"),
        currency: t("fundRequestExpense.report.currency"),
        iva: t("fundRequestExpense.report.iva"),
        status: t("common.status"),
        total: t("fundRequestExpense.report.total"),
      },
      frStatusLabel: (s) => t(`fundRequest.status.${s}`),
      otStatusLabel: (s) => t(`fundRequest.otApproval.status.${s}`),
      expenseStatusLabel: (s) => t(`fundRequestExpense.status.${s}`),
    };
    try {
      await downloadExpenseReportXlsx(
        { fr, expenses: expenses ?? [], totals },
        labels,
        reportFilename(fr.request_number),
      );
    } catch {
      toast.error(t("fundRequestExpense.report.exportError"));
    }
  };

  const columns: Column<FundRequestExpense>[] = [
    {
      key: "expense_date",
      label: t("fundRequestExpense.expenseDate"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => formatDate(row.expense_date),
    },
    {
      key: "work_order.engagement.engagement_code",
      label: t("fundRequestExpense.workOrder"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => (
        <span className="font-mono text-xs">
          {row.work_order?.engagement?.engagement_code ?? "-"}
        </span>
      ),
    },
    {
      key: "expense_type.expense_name",
      label: t("fundRequestExpense.expenseType"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => row.expense_type?.expense_name ?? "-",
    },
    {
      key: "description",
      label: t("fundRequestExpense.description"),
      mobilePriority: "secondary",
      render: (row) => (
        <span className="text-muted-foreground line-clamp-1">{row.description || "-"}</span>
      ),
    },
    {
      key: "amount",
      label: t("fundRequestExpense.amount"),
      sortable: true,
      mobilePriority: "primary",
      className: "text-right",
      render: (row) => (
        <span className="font-mono">
          {formatCurrency(Number(row.amount), row.currency)} {row.currency}
        </span>
      ),
    },
    {
      key: "status",
      label: t("common.status"),
      sortable: true,
      filterKey: "status",
      mobilePriority: "primary",
      render: (row) => <FundRequestExpenseStatusBadge status={row.status} />,
    },
  ];

  if (frLoading) {
    return (
      <AppLayout title={t("fundRequestExpense.title")} focusMode>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!fr) {
    return (
      <AppLayout title={t("fundRequestExpense.title")} focusMode>
        <div className="text-center py-12 text-muted-foreground">{t("common.noResults")}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`${t("fundRequestExpense.title")} — ${fr.request_number}`} focusMode>
      <div className="space-y-6">
        {/* Acciones + resumen de saldo */}
        <Card className="bg-muted/30">
          <CardContent className="py-4 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t("fundRequest.totalDisbursed")}</p>
                  <p className="font-mono font-semibold">
                    {formatCurrency(totals.disbursed, currency)} {currency}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("fundRequestExpense.totalSpent")}</p>
                  <p className="font-mono font-semibold">
                    {formatCurrency(totals.spent, currency)} {currency}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("fundRequestExpense.balance")}</p>
                  <p
                    className={
                      totals.balance < 0
                        ? "font-mono font-semibold text-destructive"
                        : "font-mono font-semibold text-success"
                    }
                  >
                    {formatCurrency(totals.balance, currency)} {currency}
                  </p>
                </div>
                {totals.ivaPenalty > 0 && (
                  <div>
                    <p className="text-muted-foreground">{t("fundRequestExpense.totalIvaPenalty")}</p>
                    <p className="font-mono font-semibold text-warning">
                      {formatCurrency(totals.ivaPenalty, currency)} {currency}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 flex-wrap justify-end">
                <Button variant="cancel" onClick={() => navigate(-1)}>
                  {t("common.back")}
                </Button>
                {canExport && (
                  <Button variant="outline" onClick={handleExport}>
                    <Download className="h-4 w-4 mr-1" />
                    {t("fundRequestExpense.report.exportButton")}
                  </Button>
                )}
                {canAddExpenses && (
                  <Button variant="outline" onClick={() => setDialogExpense(null)}>
                    {t("fundRequestExpense.newExpense")}
                  </Button>
                )}
                {canSubmitAll && (
                  <Button onClick={() => setShowSubmitAll(true)} disabled={submitAll.isPending}>
                    {t("fundRequestExpense.actions.submitAll")}
                  </Button>
                )}

                {canDecideAll && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => setDecisionMode("reject")}
                      disabled={decideAll.isPending}
                    >
                      {t("fundRequestExpense.actions.rejectAll")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setDecisionMode("observe")}
                      disabled={decideAll.isPending}
                    >
                      {t("fundRequestExpense.actions.observeAll")}
                    </Button>
                    <Button onClick={() => setDecisionMode("approve")} disabled={decideAll.isPending}>
                      {t("fundRequestExpense.actions.approveAll")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Banner: contabilidad devolvió gastos por falta de respaldo */}
        {isRequester && fr.status === "fondos_entregados" && hasReturnedByAssistant && (
          <Alert className="border-warning/30 bg-warning/5 text-warning [&>svg]:text-warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t("fundRequestExpense.returnedLockHint")}</AlertDescription>
          </Alert>
        )}

        {/* Banner: hay gastos en proceso, no se pueden registrar nuevos */}
        {isRequester &&
          fr.status === "fondos_entregados" &&
          hasLockedExpenses &&
          !hasReturnedByAssistant && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>{t("fundRequestExpense.pendingLockHint")}</AlertDescription>
            </Alert>
          )}

        <DataTable
          data={expenses ?? []}
          columns={columns}
          searchPlaceholder={t("fundRequestExpense.searchPlaceholder")}
          searchKeys={["description", "document_number", "supplier_name"]}
          isLoading={expLoading}
          onRowClick={(row) => setDialogExpense(row)}
          getRowId={(row) => row.fre_id}
          statusFilter={{
            key: "status",
            options: [
              { value: "borrador", label: t("fundRequestExpense.status.borrador") },
              { value: "pendiente_aprobacion", label: t("fundRequestExpense.status.pendiente_aprobacion") },
              { value: "aprobado_gerente", label: t("fundRequestExpense.status.aprobado_gerente") },
              { value: "observado", label: t("fundRequestExpense.status.observado") },
              { value: "rechazado", label: t("fundRequestExpense.status.rechazado") },
              { value: "revisado_asistente", label: t("fundRequestExpense.status.revisado_asistente") },
            ],
          }}
        />
      </div>

      {fr && dialogExpense !== undefined && (
        <FundRequestExpenseDialog
          open
          onOpenChange={(o) => !o && setDialogExpense(undefined)}
          fundRequest={fr}
          expense={dialogExpense}
        />
      )}

      <AlertDialog open={showSubmitAll} onOpenChange={setShowSubmitAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fundRequestExpense.confirmSubmitAll.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("fundRequestExpense.confirmSubmitAll.body", { count: submittable.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitAll.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmitAll} disabled={submitAll.isPending}>
              {t("fundRequestExpense.actions.submitAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Decisión en lote del gerente (aprobar/observar/rechazar todo) */}
      <ApprovalDecisionDialog
        open={decisionMode !== null}
        onOpenChange={(o) => !o && setDecisionMode(null)}
        mode={decisionMode ?? "approve"}
        entity="expense"
        isSubmitting={decideAll.isPending}
        onConfirm={handleDecideAll}
      />
    </AppLayout>
  );
};

export default FundRequestExpenses;
