import { format } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";

import { useEngagements, Engagement } from "@/hooks/useEmsData";
import { useCategoryStaff } from "@/hooks/useCategoryStaff";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";

interface EngagementRow extends Engagement {
  start_date: string | null;
  end_date: string | null;
  is_internal: boolean;
}

const statusColors: Record<string, string> = {
  active: "bg-accent/10 text-accent border-accent/20",
  completed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const Engagements = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: engagements, isLoading } = useEngagements();
  const { partnerOptions, managerOptions } = useCategoryStaff();
  const { isAdmin, isPartner, isDirector, isManager, isSQR } = useUserRole();
  const canCreate = isAdmin || isPartner || isDirector || isManager || isSQR;

  const columns: Column<Engagement>[] = [
    {
      key: "engagement_code",
      label: t("engagement.code"),
      sortable: true,
      className: "w-42",
      mobilePriority: 'secondary',
      render: (row) => <span className="font-mono text-muted-foreground">{row.engagement_code || "-"}</span>,
    },
    {
      key: "engagement_name",
      label: t("engagement.name"),
      sortable: true,
      mobilePriority: 'primary',
      render: (row) => (
        <span className="font-medium">{row.engagement_name}</span>
      ),
    },
    {
      key: "client.client_legal_name",
      label: t("engagement.client"),
      sortable: true,
      mobilePriority: 'primary',
      render: (row) => row.client?.client_legal_name || "-",
    },
    {
      key: "partner.last_name",
      label: t("engagement.partner"),
      sortable: true,
      filterKey: "partner_id",
      mobilePriority: 'secondary',
      render: (row) => (row.partner ? row.partner.short_name || `${row.partner.first_name} ${row.partner.last_name}` : "-"),
    },
    {
      key: "manager.last_name",
      label: t("engagement.manager"),
      sortable: true,
      filterKey: "manager_id",
      mobilePriority: 'secondary',
      render: (row) => (row.manager ? row.manager.short_name || `${row.manager.first_name} ${row.manager.last_name}` : "-"),
    },
    {
      key: "start_date",
      label: t("engagement.startDate"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => {
        const engagement = row as EngagementRow;
        return engagement.start_date ? format(parseDateLocal(engagement.start_date), "dd/MM/yyyy") : "-";
      },
    },
    {
      key: "end_date",
      label: t("engagement.endDate"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => {
        const engagement = row as EngagementRow;
        return engagement.end_date ? format(parseDateLocal(engagement.end_date), "dd/MM/yyyy") : "-";
      },
    },
    {
      key: "status",
      label: t("engagement.status"),
      sortable: true,
      filterKey: "status",
      mobilePriority: 'primary',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={statusColors[row.status] || statusColors.pending}>
            {t(`status.${row.status}`)}
          </Badge>
          {(row as EngagementRow).is_internal && (
            <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 text-xs">
              {t("engagement.internal")}
            </Badge>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout title={t("nav.engagements")}>
      <DataTable
        data={engagements || []}
        columns={columns}
        searchPlaceholder={t("engagement.searchPlaceholder")}
        searchKeys={["engagement_code", "engagement_name", "client.client_legal_name"]}
        isLoading={isLoading}
        newButtonLabel={canCreate ? t("engagement.newEngagement") : undefined}
        onNewClick={canCreate ? () => navigate("/engagements/new") : undefined}
        onRowClick={(row) => navigate(`/engagements/${row.engagement_id}`)}
        getRowId={(row) => row.engagement_id}
        filters={[
          {
            key: "partner_id",
            label: t("engagement.partner"),
            options: partnerOptions,
          },
          {
            key: "manager_id",
            label: t("engagement.manager"),
            options: managerOptions,
          },
        ]}
        statusFilter={{
          key: "status",
          options: [
            { value: "active", label: t("status.active") },
            { value: "pending", label: t("status.pending") },
            { value: "completed", label: t("status.completed") },
            { value: "cancelled", label: t("status.cancelled") },
          ],
        }}
      />
    </AppLayout>
  );
};

export default Engagements;
