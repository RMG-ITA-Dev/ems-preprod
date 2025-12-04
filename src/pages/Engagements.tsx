import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Briefcase } from "lucide-react";
import { useEngagements, useStaff, Engagement } from "@/hooks/useEmsData";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useNavigate } from "react-router-dom";

const statusColors: Record<string, string> = {
  active: "bg-accent/10 text-accent border-accent/20",
  completed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const Engagements = () => {
  const navigate = useNavigate();
  const { data: engagements, isLoading } = useEngagements();
  const { data: staff } = useStaff();

  const partnerOptions = (staff || [])
    .filter((s) => s.category?.category_name === "Partner")
    .map((s) => ({
      value: s.staff_id,
      label: `${s.first_name} ${s.last_name}`,
    }));

  const managerOptions = (staff || [])
    .filter((s) => s.category?.category_name === "Manager" || s.category?.category_name === "Partner")
    .map((s) => ({
      value: s.staff_id,
      label: `${s.first_name} ${s.last_name}`,
    }));

  const columns: Column<Engagement>[] = [
    {
      key: "engagement_code",
      label: "Code",
      sortable: true,
      className: "w-28",
      render: (row) => <span className="font-mono text-muted-foreground">{row.engagement_code || "-"}</span>,
    },
    {
      key: "engagement_name",
      label: "Engagement Name",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium">{row.engagement_name}</span>
        </div>
      ),
    },
    {
      key: "client.client_legal_name",
      label: "Client",
      sortable: true,
      render: (row) => row.client?.client_legal_name || "-",
    },
    {
      key: "partner.last_name",
      label: "Partner",
      sortable: true,
      render: (row) => (row.partner ? `${row.partner.first_name} ${row.partner.last_name}` : "-"),
    },
    {
      key: "manager.last_name",
      label: "Manager",
      sortable: true,
      render: (row) => (row.manager ? `${row.manager.first_name} ${row.manager.last_name}` : "-"),
    },
    {
      key: "start_date",
      label: "Start",
      sortable: true,
      render: (row) => {
        const engagement = row as any;
        return engagement.start_date ? format(new Date(engagement.start_date), "dd/MM/yyyy") : "-";
      },
    },
    {
      key: "end_date",
      label: "End",
      sortable: true,
      render: (row) => {
        const engagement = row as any;
        return engagement.end_date ? format(new Date(engagement.end_date), "dd/MM/yyyy") : "-";
      },
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => (
        <Badge variant="outline" className={statusColors[row.status] || statusColors.pending}>
          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </Badge>
      ),
    },
  ];

  return (
    <AppLayout title="Engagements">
      <DataTable
        data={engagements || []}
        columns={columns}
        searchPlaceholder="Search by code, name, or client..."
        searchKeys={["engagement_code", "engagement_name", "client.client_legal_name"]}
        isLoading={isLoading}
        newButtonLabel="New Engagement"
        onNewClick={() => navigate("/engagements/new")}
        onRowClick={(row) => navigate(`/engagements/${row.engagement_id}`)}
        getRowId={(row) => row.engagement_id}
        filters={[
          {
            key: "partner_id",
            label: "Partner",
            options: partnerOptions,
          },
          {
            key: "manager_id",
            label: "Manager",
            options: managerOptions,
          },
        ]}
        statusFilter={{
          key: "status",
          options: [
            { value: "active", label: "Active" },
            { value: "pending", label: "Pending" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ],
        }}
      />
    </AppLayout>
  );
};

export default Engagements;