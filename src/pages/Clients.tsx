import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import { useClients, useEngagements, useIndustries, Client } from "@/hooks/useEmsData";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useNavigate } from "react-router-dom";

const Clients = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClients();
  const { data: engagements } = useEngagements();
  const { data: industries } = useIndustries();

  const getEngagementCount = (clientId: string) => {
    return engagements?.filter((e) => e.client_id === clientId).length || 0;
  };

  const industryOptions = (industries || []).map((ind) => ({
    value: ind.industry_id,
    label: ind.industry_name,
  }));

  const columns: Column<Client>[] = [
    {
      key: "client_legal_name",
      label: t("client.name"),
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium">{row.client_legal_name}</span>
        </div>
      ),
    },
    {
      key: "unique_tax_id",
      label: t("client.nit"),
      sortable: true,
      render: (row) => <span className="font-mono text-muted-foreground">{row.unique_tax_id}</span>,
    },
    {
      key: "industry.industry_name",
      label: t("client.industry"),
      sortable: true,
      filterKey: "industry_id",
      render: (row) => row.industry?.industry_name || "-",
    },
    {
      key: "contact_name",
      label: t("client.contact"),
      sortable: true,
      render: (row) => row.contact_name || "-",
    },
    {
      key: "industry.fiscal_year_end",
      label: t("client.closingDate"),
      sortable: true,
      render: (row) => <span className="text-muted-foreground">{row.industry?.fiscal_year_end || "-"}</span>,
    },
    {
      key: "is_active",
      label: t("client.status"),
      sortable: true,
      filterKey: "is_active",
      render: (row) => (
        <Badge
          variant="outline"
          className={row.is_active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground"}
        >
          {row.is_active ? t("status.active") : t("status.inactive")}
        </Badge>
      ),
    },
    {
      key: "engagements",
      label: t("client.engagements"),
      className: "text-center w-28",
      render: (row) => <Badge variant="secondary">{getEngagementCount(row.client_id)}</Badge>,
    },
  ];

  return (
    <AppLayout title={t("nav.clients")}>
      <DataTable
        data={clients || []}
        columns={columns}
        searchPlaceholder={t("client.searchPlaceholder")}
        searchKeys={["client_legal_name", "unique_tax_id", "contact_name"]}
        isLoading={isLoading}
        newButtonLabel={t("client.newClient")}
        onNewClick={() => navigate("/clients/new")}
        onRowClick={(row) => navigate(`/clients/${row.client_id}`)}
        getRowId={(row) => row.client_id}
        filters={[
          {
            key: "industry_id",
            label: t("client.industry"),
            options: industryOptions,
          },
        ]}
        statusFilter={{
          key: "is_active",
          options: [
            { value: "active", label: t("status.active") },
            { value: "inactive", label: t("status.inactive") },
          ],
        }}
      />
    </AppLayout>
  );
};

export default Clients;
