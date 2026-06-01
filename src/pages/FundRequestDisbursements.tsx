import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FundRequestStatusBadge } from "@/components/fund-requests/FundRequestStatusBadge";
import { ExpenseActionBadge } from "@/components/fund-requests/ExpenseActionBadge";
import { useFundRequests, type FundRequest, type FundRequestStatus } from "@/hooks/useFundRequests";
import { useFundRequestExpenseCounts } from "@/hooks/useFundRequestExpenseCounts";
import { useUserRole } from "@/hooks/useUserRole";

const formatCurrency = (n: number, currency: "BOB" | "USD") =>
  Math.round(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    maximumFractionDigits: 0,
  });

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const staffName = (s?: { first_name?: string; last_name?: string; short_name?: string | null }) =>
  s ? s.short_name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : "-";

type Tab = "to_disburse" | "delivered" | "in_settlement" | "closed";

const tabStatuses: Record<Tab, FundRequestStatus[]> = {
  to_disburse: ["aprobado_gerente"],
  delivered: ["fondos_entregados"],
  in_settlement: ["en_liquidacion"],
  closed: ["cerrado", "cancelado"],
};

const FundRequestDisbursements = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useFundRequests();
  const { data: expenseCounts } = useFundRequestExpenseCounts();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [tab, setTab] = useState<Tab>("to_disburse");

  const filtered = useMemo(() => {
    if (!data) return [];
    const allowed = tabStatuses[tab];
    return data.filter((fr) => allowed.includes(fr.status));
  }, [data, tab]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { to_disburse: 0, delivered: 0, in_settlement: 0, closed: 0 };
    if (!data) return c;
    for (const fr of data) {
      (Object.keys(tabStatuses) as Tab[]).forEach((k) => {
        if (tabStatuses[k].includes(fr.status)) c[k] += 1;
      });
    }
    return c;
  }, [data]);

  if (!roleLoading && !isAdmin) {
    return (
      <AppLayout title={t("fundRequest.disbursementsQueue")}>
        <div className="text-muted-foreground">{t("common.noAccess") ?? "Sin acceso"}</div>
      </AppLayout>
    );
  }

  const columns: Column<FundRequest>[] = [
    {
      key: "request_number",
      label: t("fundRequest.requestNumber"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => <span className="font-mono font-medium">{row.request_number}</span>,
    },
    {
      key: "requester.last_name",
      label: t("fundRequest.requester"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => staffName(row.requester),
    },
    {
      key: "approver_manager.last_name",
      label: t("fundRequest.approver"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => staffName(row.approver_manager),
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
      key: "total_disbursed_amount",
      label: t("fundRequest.totalDisbursed"),
      sortable: true,
      mobilePriority: "secondary",
      className: "text-right",
      render: (row) => (
        <span className="font-mono">
          {Number(row.total_disbursed_amount) > 0
            ? `${formatCurrency(Number(row.total_disbursed_amount), row.currency)} ${row.currency}`
            : "-"}
        </span>
      ),
    },
    {
      key: "manager_decided_at",
      label: t("fundRequest.managerDecidedAt"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => formatDate(row.manager_decided_at),
    },
    {
      key: "expenses",
      label: t("fundRequestExpense.expensesColumn"),
      mobilePriority: "secondary",
      render: (row) => {
        const toReview = expenseCounts?.[row.fund_request_id]?.aprobado_gerente ?? 0;
        return (
          <ExpenseActionBadge
            count={toReview}
            label={t("fundRequestExpense.indicators.toReview")}
            tone="info"
          />
        );
      },
    },
    {
      key: "status",
      label: t("common.status"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => <FundRequestStatusBadge status={row.status} />,
    },
  ];

  return (
    <AppLayout title={t("fundRequest.disbursementsQueue")}>
      <div className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="to_disburse">
              {t("fundRequest.tabs.toDisburse")} ({counts.to_disburse})
            </TabsTrigger>
            <TabsTrigger value="delivered">
              {t("fundRequest.tabs.delivered")} ({counts.delivered})
            </TabsTrigger>
            <TabsTrigger value="in_settlement">
              {t("fundRequest.tabs.inSettlement")} ({counts.in_settlement})
            </TabsTrigger>
            <TabsTrigger value="closed">
              {t("fundRequest.tabs.closed")} ({counts.closed})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <DataTable
          data={filtered}
          columns={columns}
          searchPlaceholder={t("fundRequest.searchPlaceholder")}
          searchKeys={["request_number", "purpose"]}
          isLoading={isLoading}
          onRowClick={(row) => navigate(`/fund-requests/${row.fund_request_id}`)}
          getRowId={(row) => row.fund_request_id}
        />
      </div>
    </AppLayout>
  );
};

export default FundRequestDisbursements;
