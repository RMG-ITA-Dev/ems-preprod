import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { FundRequestStatusBadge } from "@/components/fund-requests/FundRequestStatusBadge";
import { ExpenseActionBadge } from "@/components/fund-requests/ExpenseActionBadge";
import { useFundRequests, type FundRequest } from "@/hooks/useFundRequests";
import { useFundRequestExpenseCounts } from "@/hooks/useFundRequestExpenseCounts";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

const formatCurrency = (n: number, currency: "BOB" | "USD") =>
  Number(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    maximumFractionDigits: 2,
  });

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const staffName = (s?: { first_name?: string; last_name?: string; short_name?: string | null }) => {
  if (!s) return "-";
  return s.short_name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "-";
};

const FundRequests = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useFundRequests();
  const { data: expenseCounts } = useFundRequestExpenseCounts();
  const { staffRecord } = useCurrentStaff();

  // Esta página muestra solo MIS solicitudes (las que yo creé).
  // El gerente ve las que debe aprobar en /fund-requests/approvals.
  // El admin ve la cola completa en /fund-requests/disbursements.
  const myRequests = useMemo(() => {
    if (!data || !staffRecord) return [];
    return data.filter((fr) => fr.requester_staff_id === staffRecord.staff_id);
  }, [data, staffRecord]);

  const columns: Column<FundRequest>[] = [
    {
      key: "request_number",
      label: t("fundRequest.requestNumber"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => <span className="font-mono font-medium">{row.request_number}</span>,
    },
    {
      key: "managers",
      label: t("fundRequest.managers"),
      mobilePriority: "secondary",
      render: (row) => {
        const names = Array.from(
          new Set(
            (row.fund_request_work_orders ?? [])
              .map((o) => staffName(o.manager))
              .filter((n) => n && n !== "-"),
          ),
        );
        return names.length ? names.join(", ") : "-";
      },
    },
    {
      key: "purpose",
      label: t("fundRequest.purpose"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => (
        <span className="text-muted-foreground line-clamp-1">{row.purpose || "-"}</span>
      ),
    },
    {
      key: "total_requested_amount",
      label: t("fundRequest.totalRequested"),
      sortable: true,
      mobilePriority: "primary",
      className: "text-right",
      render: (row) => (
        <span className="font-mono">
          {formatCurrency(Number(row.total_requested_amount), row.currency)} {row.currency}
        </span>
      ),
    },
    {
      key: "created_at",
      label: t("common.createdAt"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => formatDate(row.created_at),
    },
    {
      key: "expenses",
      label: t("fundRequestExpense.expensesColumn"),
      mobilePriority: "secondary",
      render: (row) => {
        const c = expenseCounts?.[row.fund_request_id];
        const toCorrect = (c?.observado ?? 0) + (c?.rechazado ?? 0);
        if (toCorrect > 0) {
          // Se muestra como un solo aviso ("Por corregir"), no el número de gastos.
          return (
            <ExpenseActionBadge
              label={t("fundRequestExpense.indicators.toCorrect")}
              tone="warning"
            />
          );
        }
        if (row.status === "fondos_entregados") {
          return (
            <ExpenseActionBadge label={t("fundRequestExpense.indicators.register")} tone="cta" />
          );
        }
        if (c?.total) {
          return (
            <ExpenseActionBadge
              count={c.total}
              label={t("fundRequestExpense.indicators.expenses")}
              tone="muted"
            />
          );
        }
        return null;
      },
    },
    {
      key: "status",
      label: t("common.status"),
      sortable: true,
      filterKey: "status",
      mobilePriority: "primary",
      render: (row) => <FundRequestStatusBadge status={row.status} />,
    },
  ];

  return (
    <AppLayout title={t("fundRequest.title")}>
      <DataTable
        data={myRequests}
        columns={columns}
        searchPlaceholder={t("fundRequest.searchPlaceholder")}
        searchKeys={["request_number", "purpose"]}
        isLoading={isLoading}
        newButtonLabel={staffRecord ? t("fundRequest.newRequest") : undefined}
        onNewClick={staffRecord ? () => navigate("/fund-requests/new") : undefined}
        onRowClick={(row) =>
          navigate(
            ["fondos_entregados", "en_liquidacion"].includes(row.status)
              ? `/fund-requests/${row.fund_request_id}/expenses`
              : `/fund-requests/${row.fund_request_id}`,
          )
        }
        getRowId={(row) => row.fund_request_id}
        statusFilter={{
          key: "status",
          options: [
            { value: "borrador", label: t("fundRequest.status.borrador") },
            { value: "pendiente_aprobacion", label: t("fundRequest.status.pendiente_aprobacion") },
            { value: "aprobado_gerente", label: t("fundRequest.status.aprobado_gerente") },
            { value: "observado", label: t("fundRequest.status.observado") },
            { value: "rechazado", label: t("fundRequest.status.rechazado") },
            { value: "fondos_entregados", label: t("fundRequest.status.fondos_entregados") },
            { value: "en_liquidacion", label: t("fundRequest.status.en_liquidacion") },
            { value: "cerrado", label: t("fundRequest.status.cerrado") },
            { value: "cancelado", label: t("fundRequest.status.cancelado") },
          ],
        }}
      />
    </AppLayout>
  );
};

export default FundRequests;
