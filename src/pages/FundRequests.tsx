import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { FundRequestStatusBadge } from "@/components/fund-requests/FundRequestStatusBadge";
import { useFundRequests, type FundRequest } from "@/hooks/useFundRequests";

const formatCurrency = (n: number, currency: "BOB" | "USD") =>
  Math.round(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    maximumFractionDigits: 0,
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
        data={data || []}
        columns={columns}
        searchPlaceholder={t("fundRequest.searchPlaceholder")}
        searchKeys={["request_number", "purpose"]}
        isLoading={isLoading}
        newButtonLabel={t("fundRequest.newRequest")}
        onNewClick={() => navigate("/fund-requests/new")}
        onRowClick={(row) => navigate(`/fund-requests/${row.fund_request_id}`)}
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
