import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import { useClients, useEngagements, Client } from "@/hooks/useEmsData";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useNavigate } from "react-router-dom";

const Clients = () => {
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClients();
  const { data: engagements } = useEngagements();

  const getEngagementCount = (clientId: string) => {
    return engagements?.filter((e) => e.client_id === clientId).length || 0;
  };

  const columns: Column<Client>[] = [
    {
      key: "client_legal_name",
      label: "Client Name",
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
      label: "NIT",
      sortable: true,
      render: (row) => <span className="font-mono text-muted-foreground">{row.unique_tax_id}</span>,
    },
    {
      key: "industry.industry_name",
      label: "Industry",
      sortable: true,
      render: (row) => row.industry?.industry_name || "-",
    },
    {
      key: "contact_name",
      label: "Contact",
      sortable: true,
      render: (row) => row.contact_name || "-",
    },
    {
      key: "contact_phone",
      label: "Phone",
      render: (row) => <span className="text-muted-foreground">{row.contact_phone || "-"}</span>,
    },
    {
      key: "is_active",
      label: "Status",
      sortable: true,
      render: (row) => (
        <Badge
          variant="outline"
          className={row.is_active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground"}
        >
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "engagements",
      label: "Engagements",
      className: "text-center w-28",
      render: (row) => <Badge variant="secondary">{getEngagementCount(row.client_id)}</Badge>,
    },
  ];

  return (
    <AppLayout title="Clients">
      <DataTable
        data={clients || []}
        columns={columns}
        searchPlaceholder="Search by client name, NIT, or contact..."
        searchKeys={["client_legal_name", "unique_tax_id", "contact_name"]}
        isLoading={isLoading}
        newButtonLabel="New Client"
        onNewClick={() => navigate("/clients/new")}
        onRowClick={(row) => navigate(`/clients/${row.client_id}`)}
        getRowId={(row) => row.client_id}
        statusFilter={{
          key: "is_active",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        }}
      />
    </AppLayout>
  );
};

export default Clients;
