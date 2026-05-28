import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { FundRequestStatusBadge } from "@/components/fund-requests/FundRequestStatusBadge";
import { useFundRequests, type FundRequest } from "@/hooks/useFundRequests";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
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

const FundRequestApprovals = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useFundRequests();
  const { staffRecord } = useCurrentStaff();
  const { isAdmin } = useUserRole();

  // Filtro: pendientes donde soy el gerente designado (admin ve todas)
  const pending = useMemo(() => {
    if (!data) return [];
    return data.filter((fr) => {
      if (fr.status !== "pendiente_aprobacion") return false;
      if (isAdmin) return true;
      return fr.approver_manager_staff_id === staffRecord?.staff_id;
    });
  }, [data, isAdmin, staffRecord]);

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
      key: "submitted_at",
      label: t("fundRequest.submittedAt"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => formatDate(row.submitted_at),
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
      <DataTable
        data={pending}
        columns={columns}
        searchPlaceholder={t("fundRequest.searchPlaceholder")}
        searchKeys={["request_number", "purpose"]}
        isLoading={isLoading}
        onRowClick={(row) => navigate(`/fund-requests/${row.fund_request_id}`)}
        getRowId={(row) => row.fund_request_id}
      />
    </AppLayout>
  );
};

export default FundRequestApprovals;
