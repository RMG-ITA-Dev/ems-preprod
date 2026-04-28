import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";

import { useClients, useEngagements, useIndustries, Client } from "@/hooks/useEmsData";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useNavigate } from "react-router-dom";
import { formatFiscalYearEnd } from "@/lib/fiscalYearDisplay";
import { useUserRole } from "@/hooks/useUserRole";

const Clients = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin, isPartner, isDirector } = useUserRole();
  const canCreate = isAdmin || isPartner || isDirector;
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
      mobilePriority: 'primary',
      render: (row) => (
        <span className="font-medium">{row.client_legal_name}</span>
      ),
    },
    {
      key: "unique_tax_id",
      label: t("client.nit"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => <span className="text-muted-foreground">{row.unique_tax_id || "-"}</span>,
    },
    {
      key: "industry.industry_name",
      label: t("client.industry"),
      sortable: true,
      filterKey: "industry_id",
      mobilePriority: 'primary',
      render: (row) => row.industry?.industry_name || "-",
    },
    {
      key: "contact_name",
      label: t("client.contact"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => row.contact_name || "-",
    },
    {
      key: "industry.fiscal_year_end",
      label: t("client.closingDate"),
      sortable: true,
      mobilePriority: 'secondary',
      className: "text-center",
      render: (row) => (
        <span className="text-muted-foreground">
          {formatFiscalYearEnd(row.industry?.fiscal_year_end, i18n.language)}
        </span>
      ),
    },
    {
      key: "is_active",
      label: t("client.status"),
      sortable: true,
      filterKey: "is_active",
      mobilePriority: 'primary',
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
      mobilePriority: 'secondary',
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
        newButtonLabel={canCreate ? t("client.newClient") : undefined}
        onNewClick={canCreate ? () => navigate("/clients/new") : undefined}
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
