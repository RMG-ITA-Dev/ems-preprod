import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { FundRequestExpenseStatusBadge } from "@/components/fund-requests/FundRequestExpenseStatusBadge";
import { FundRequestExpenseDialog } from "@/components/fund-requests/FundRequestExpenseDialog";
import { useFundRequestById } from "@/hooks/useFundRequests";
import {
  useFundRequestExpenses,
  type FundRequestExpense,
} from "@/hooks/useFundRequestExpenses";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

const formatCurrency = (n: number, currency: "BOB" | "USD") =>
  Number(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("es-BO", {
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

  // Modal: undefined = cerrado, null = crear, objeto = ver/editar
  const [dialogExpense, setDialogExpense] = useState<FundRequestExpense | null | undefined>(
    undefined,
  );

  const isRequester =
    !!staffRecord && !!fr && fr.requester_staff_id === staffRecord.staff_id;
  // El solicitante registra gastos mientras la solicitud tenga fondos entregados.
  const canAddExpenses =
    isRequester && fr?.status === "fondos_entregados";

  const currency = (fr?.currency ?? "BOB") as "BOB" | "USD";

  const totals = useMemo(() => {
    const list = expenses ?? [];
    const spent = list.reduce((s, e) => s + Number(e.amount || 0), 0);
    const ivaPenalty = list.reduce((s, e) => s + Number(e.iva_penalty_amount || 0), 0);
    const disbursed = Number(fr?.total_disbursed_amount ?? 0);
    const balance = disbursed - spent;
    return { spent, ivaPenalty, disbursed, balance };
  }, [expenses, fr]);

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
                {canAddExpenses && (
                  <Button onClick={() => setDialogExpense(null)}>
                    {t("fundRequestExpense.newExpense")}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

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
    </AppLayout>
  );
};

export default FundRequestExpenses;
