import { format } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";

import { useEngagements, Engagement } from "@/hooks/useEmsData";
import { useCategoryStaff } from "@/hooks/useCategoryStaff";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useNavigate } from "react-router-dom";
import { useAuthorization } from "@/hooks/useAuthorization";
import {
  effectiveEngagementState,
  engagementStateI18nKey,
  engagementStateBadgeClass,
  ENGAGEMENT_STATES,
} from "@/lib/engagementStatus";

// FEAT 0602-135: fila con el estado efectivo precalculado (string) para el badge y el filtro.
interface EngagementRow extends Engagement {
  start_date: string | null;
  end_date: string | null;
  is_internal: boolean;
  effective_state: string;
}

const Engagements = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: engagements, isLoading } = useEngagements();
  const { partnerOptions, managerOptions } = useCategoryStaff();
  const { can } = useAuthorization();
  const canCreate = can("engagement.create");

  const rows: EngagementRow[] = (engagements || []).map((e) => ({
    ...e,
    effective_state: String(effectiveEngagementState(e, e.work_order)),
  })) as EngagementRow[];

  const columns: Column<EngagementRow>[] = [
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
      key: "effective_state",
      label: t("engagement.status"),
      sortable: true,
      filterKey: "effective_state",
      mobilePriority: 'primary',
      render: (row) => {
        const state = Number(row.effective_state);
        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={engagementStateBadgeClass(state)}>
              {t(engagementStateI18nKey(state))}
            </Badge>
            {row.is_internal && (
              <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 text-xs">
                {t("engagement.internal")}
              </Badge>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <AppLayout title={t("nav.engagements")}>
      <DataTable
        data={rows}
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
          key: "effective_state",
          options: ENGAGEMENT_STATES.map((s) => ({
            value: String(s),
            label: t(engagementStateI18nKey(s)),
          })),
        }}
      />
    </AppLayout>
  );
};

export default Engagements;
