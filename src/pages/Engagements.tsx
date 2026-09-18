import { useMemo } from "react";
import { format } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";

import { useSocieties, Engagement } from "@/hooks/useEmsData";
import { usePortfolioEngagements } from "@/hooks/usePortfolioEngagements";
import { useCategoryStaff } from "@/hooks/useCategoryStaff";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  // dash_socio: deep-links desde el tablero de Socio (KPI 1 por segmento, Bloque E
  // por gerente) -- /engagements?state=4 y /engagements?manager=<uuid>.
  const [searchParams] = useSearchParams();
  const { data: engagements, isLoading } = usePortfolioEngagements();
  const { data: societies } = useSocieties();
  const { partnerOptions, managerOptions } = useCategoryStaff();
  const { can } = useAuthorization();
  const canCreate = can("engagement.create");

  const rows: EngagementRow[] = (engagements || []).map((e) => ({
    ...e,
    effective_state: String(effectiveEngagementState(e, e.work_order)),
  })) as EngagementRow[];

  // REVIEW FIX (FEAT 0714-155): useSocieties() filters is_active=true server-side, so a
  // historical (now-inactive) society an engagement still points to would never appear as
  // a filter option — even though the column above already renders it. Merge in any
  // embedded society from the loaded engagements, same approach as EngagementForm's
  // societyOptions memo.
  const societyFilterOptions = useMemo(() => {
    const bySocietyId = new Map((societies ?? []).map((s) => [s.society_id, s]));
    (engagements ?? []).forEach((e) => {
      if (e.society && !bySocietyId.has(e.society.society_id)) {
        bySocietyId.set(e.society.society_id, e.society);
      }
    });
    return [...bySocietyId.values()].map((soc) => ({ value: soc.society_id, label: soc.name }));
  }, [societies, engagements]);

  // Bug 0722-158 (extension a Encargos): 9 columnas -> 7. Cada fusion conserva
  // TODOS sus ordenamientos y filtros via `secondary`, el campo opcional que
  // DataTable expone para apilar controles bajo el label.
  type StaffRef = { short_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined;
  const staffName = (person: StaffRef) =>
    person ? person.short_name || `${person.first_name} ${person.last_name}` : "-";

  const columns: Column<EngagementRow>[] = [
    {
      // Encargo = nombre (primario) + codigo debajo.
      key: "engagement_name",
      label: t("engagement.name"),
      sortable: true,
      className: "min-w-[220px]",
      mobilePriority: 'primary',
      secondary: [{ key: "engagement_code", label: t("engagement.code"), sortable: true }],
      render: (row) => (
        <div>
          <div className="font-medium">{row.engagement_name}</div>
          <div className="font-mono text-xs text-muted-foreground">{row.engagement_code || "-"}</div>
        </div>
      ),
    },
    {
      // Cliente + la sociedad del estudio como chip.
      key: "client.client_legal_name",
      label: t("engagement.client"),
      sortable: true,
      className: "min-w-[220px]",
      mobilePriority: 'primary',
      secondary: [{ key: "society.name", label: t("engagement.society"), sortable: true, filterKey: "society_id" }],
      render: (row) => (
        <div>
          <div>{row.client?.client_legal_name || "-"}</div>
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <Badge
              variant="outline"
              className="bg-muted text-muted-foreground font-normal text-[10px] px-1.5 py-0"
              title={`${t("engagement.society")}: ${row.society?.name || "-"}`}
            >
              <span className="opacity-70">{t("engagement.society")}</span>
              <span className="mx-1 opacity-40">·</span>
              {row.society?.name || "-"}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      // Socio y Gerente siguen siendo columnas propias: con cabecera que las
      // nombra, el nombre suelto ya se entiende y no hace falta chip etiquetado.
      key: "partner.last_name",
      label: t("common.partner"),
      sortable: true,
      filterKey: "partner_id",
      className: "w-32",
      mobilePriority: 'secondary',
      render: (row) => staffName(row.partner),
    },
    {
      key: "manager.last_name",
      label: t("common.manager"),
      sortable: true,
      filterKey: "manager_id",
      className: "w-32",
      mobilePriority: 'secondary',
      render: (row) => staffName(row.manager),
    },
    {
      // Inicio y Fin siguen siendo columnas propias.
      key: "start_date",
      label: t("engagement.startDate"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => (row.start_date ? format(parseDateLocal(row.start_date), "dd/MM/yyyy") : "-"),
    },
    {
      key: "end_date",
      label: t("engagement.endDate"),
      sortable: true,
      mobilePriority: 'secondary',
      render: (row) => (row.end_date ? format(parseDateLocal(row.end_date), "dd/MM/yyyy") : "-"),
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
            key: "society_id",
            label: t("engagement.society"),
            options: societyFilterOptions,
          },
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
        initialFilters={{
          effective_state: searchParams.get("state") ?? "",
          manager_id: searchParams.get("manager") ?? "",
        }}
      />
    </AppLayout>
  );
};

export default Engagements;
