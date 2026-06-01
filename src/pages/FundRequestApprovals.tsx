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
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

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

type Tab = "pending" | "approved" | "returned";

const tabStatuses: Record<Tab, FundRequestStatus[]> = {
  pending: ["pendiente_aprobacion"],
  // "Aprobadas por mí" incluye todo lo que siguió fluyendo después de mi visto bueno
  approved: ["aprobado_gerente", "fondos_entregados", "en_liquidacion", "cerrado"],
  // Lo que yo regresé al solicitante o lo que se canceló después
  returned: ["observado", "rechazado", "cancelado"],
};

const FundRequestApprovals = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useFundRequests();
  const { data: expenseCounts } = useFundRequestExpenseCounts();
  const { staffRecord } = useCurrentStaff();
  const [tab, setTab] = useState<Tab>("pending");

  // Solo solicitudes donde yo soy el aprobador asignado.
  const myAssigned = useMemo(() => {
    if (!data || !staffRecord) return [];
    return data.filter((fr) => fr.approver_manager_staff_id === staffRecord.staff_id);
  }, [data, staffRecord]);

  const filtered = useMemo(() => {
    const allowed = tabStatuses[tab];
    return myAssigned.filter((fr) => allowed.includes(fr.status));
  }, [myAssigned, tab]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { pending: 0, approved: 0, returned: 0 };
    for (const fr of myAssigned) {
      (Object.keys(tabStatuses) as Tab[]).forEach((k) => {
        if (tabStatuses[k].includes(fr.status)) c[k] += 1;
      });
    }
    return c;
  }, [myAssigned]);

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
      key: tab === "pending" ? "submitted_at" : "manager_decided_at",
      label: tab === "pending" ? t("fundRequest.submittedAt") : t("fundRequest.managerDecidedAt"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) =>
        tab === "pending" ? formatDate(row.submitted_at) : formatDate(row.manager_decided_at),
    },
    {
      key: "expenses",
      label: t("fundRequestExpense.expensesColumn"),
      mobilePriority: "secondary",
      render: (row) => {
        const pending = expenseCounts?.[row.fund_request_id]?.pendiente_aprobacion ?? 0;
        return (
          <ExpenseActionBadge
            count={pending}
            label={t("fundRequestExpense.indicators.toApprove")}
            tone="warning"
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
    <AppLayout title={t("fundRequest.approvalsQueue")}>
      <div className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="pending">
              {t("fundRequest.tabs.pending")} ({counts.pending})
            </TabsTrigger>
            <TabsTrigger value="approved">
              {t("fundRequest.tabs.approved")} ({counts.approved})
            </TabsTrigger>
            <TabsTrigger value="returned">
              {t("fundRequest.tabs.returned")} ({counts.returned})
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

export default FundRequestApprovals;
