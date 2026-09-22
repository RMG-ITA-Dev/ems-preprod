import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useAuthorization } from "@/hooks/useAuthorization";
import { AdministrativeEngagement, useAdministrativeEngagements } from "@/hooks/useAdministrativeEngagements";
import { parseDateLocal } from "@/lib/timesheetUtils";

const FUNCION_LABEL_KEYS: Record<number, string> = {
  0: "engagement.funcion_adm",
  2: "engagement.funcion_cap",
  3: "engagement.funcion_calidad",
};

const OFFICE_LABEL_KEYS: Record<number, string> = {
  0: "engagement.oficina_ambos",
  1: "engagement.oficina_laPaz",
  2: "engagement.oficina_santaCruz",
};

/**
 * Review fix (Codex): el año fiscal sale de la fecha en Bolivia, no de `new Date()` del
 * navegador. `list_administrative_engagements()` recorta su rama consultiva con
 * `(now() AT TIME ZONE 'America/La_Paz')`, y este filtro de cliente lo repite: con la fecha
 * local del dispositivo, alguien en Europa o Asia cruza el 1 de octubre horas antes que
 * La Paz, adelanta el FY y esconde justo las filas del FY vigente que el RPC acababa de
 * devolver. Mismo criterio que `workOrderPaymentPlan.ts` para "hoy en Bolivia".
 *
 * El mes se compara en base 1 (10 = octubre) para leerse igual que la regla del RPC
 * (`EXTRACT(MONTH ...) >= 10`), en vez del `getMonth()` 0-indexado de fiscalCalculations.
 */
export function currentBoliviaFiscalYear(now: Date = new Date()): number {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  return month >= 10 ? year + 1 : year;
}

/**
 * Quien crea encargos conserva el listado operativo completo. La consulta para
 * los demás es de consulta: sólo periodos fiscales vigentes o futuros, nunca
 * históricos. Se mantiene el futuro porque un encargo ya planificado para el
 * siguiente FY sigue siendo vigente; así no desaparece antes de iniciar.
 */
export function administrativeRowsForViewer(
  rows: AdministrativeEngagement[],
  canCreate: boolean,
  currentFiscalYear: number,
) {
  if (canCreate) return rows;
  return rows.filter((row) => row.anio_fiscal != null && row.anio_fiscal >= currentFiscalYear);
}

/**
 * Review fix (Codex): el resto de la superficie ya se gatea por `canCreate` (columnas, filtros,
 * alta, clic de fila). La búsqueda no lo hacía, así que la vista de consulta seguía matcheando
 * por cliente y sociedad — campos que esa vista no muestra.
 */
export function administrativeSearchKeys(canCreate: boolean): string[] {
  return canCreate
    ? ["engagement_code", "engagement_name", "client_name", "society_name"]
    : ["engagement_code", "engagement_name"];
}

const AdministrativeEngagements = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAuthorization();
  const { data, isLoading } = useAdministrativeEngagements();
  const canCreate = can("engagement.create");
  const [funcionFilter, setFuncionFilter] = useState("all");
  const rows = useMemo(() => {
    const visibleRows = administrativeRowsForViewer(
      data ?? [],
      canCreate,
      currentBoliviaFiscalYear(),
    );
    return funcionFilter === "all"
      ? visibleRows
      : visibleRows.filter((row) => String(row.funcion) === funcionFilter);
  }, [canCreate, data, funcionFilter]);

  const viewerColumns: Column<AdministrativeEngagement>[] = [
    {
      key: "engagement_name",
      label: t("engagement.name"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => (
        <div>
          <div className="font-medium">{row.engagement_name}</div>
          <div className="font-mono text-xs text-muted-foreground">{row.engagement_code ?? "-"}</div>
        </div>
      ),
    },
  ];

  const columns: Column<AdministrativeEngagement>[] = [
    {
      key: "engagement_name",
      label: t("engagement.name"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => (
        <div>
          <div className="font-medium">{row.engagement_name}</div>
          <div className="font-mono text-xs text-muted-foreground">{row.engagement_code ?? "-"}</div>
        </div>
      ),
    },
    {
      key: "funcion",
      label: t("engagement.funcion"),
      sortable: true,
      filterKey: "funcion",
      mobilePriority: "primary",
      render: (row) => t(FUNCION_LABEL_KEYS[row.funcion]),
    },
    {
      key: "society_name",
      label: t("engagement.society"),
      sortable: true,
      mobilePriority: "secondary",
    },
    {
      key: "client_name",
      label: t("engagement.client"),
      sortable: true,
      mobilePriority: "secondary",
    },
    {
      key: "oficina",
      label: t("engagement.oficina"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => row.oficina == null ? "-" : t(OFFICE_LABEL_KEYS[row.oficina]),
    },
    {
      key: "practica_name",
      label: t("engagement.practica"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => row.practica_name ?? "-",
    },
    {
      key: "anio_fiscal",
      label: t("engagement.anioFiscal"),
      sortable: true,
      className: "text-right font-mono",
      mobilePriority: "secondary",
      render: (row) => row.anio_fiscal ?? "-",
    },
    {
      key: "start_date",
      label: t("engagement.startDate"),
      sortable: true,
      className: "text-center",
      mobilePriority: "secondary",
      render: (row) => row.start_date ? format(parseDateLocal(row.start_date), "dd/MM/yyyy") : "-",
    },
    {
      key: "end_date",
      label: t("engagement.endDate"),
      sortable: true,
      className: "text-center",
      mobilePriority: "secondary",
      render: (row) => row.end_date ? format(parseDateLocal(row.end_date), "dd/MM/yyyy") : "-",
    },
    {
      key: "status",
      label: t("engagement.status"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => (
        <Badge variant="outline" className="bg-muted text-muted-foreground">
          {t(`status.${row.status}`)}
        </Badge>
      ),
    },
  ];

  return (
    <AppLayout title={t("nav.administrativeEngagements")}>
      <DataTable
        data={rows}
        columns={canCreate ? columns : viewerColumns}
        searchPlaceholder={t("engagement.searchPlaceholder")}
        searchKeys={administrativeSearchKeys(canCreate)}
        isLoading={isLoading}
        newButtonLabel={canCreate ? t("engagement.newAdministrativeEngagement") : undefined}
        onNewClick={canCreate ? () => navigate("/engagements/new?mode=administrative") : undefined}
        onRowClick={canCreate ? (row) => navigate(`/engagements/${row.engagement_id}`) : undefined}
        getRowId={(row) => row.engagement_id}
        filters={canCreate ? [
          {
            key: "funcion",
            label: t("engagement.funcion"),
            options: [0, 2, 3].map((funcion) => ({ value: String(funcion), label: t(FUNCION_LABEL_KEYS[funcion]) })),
          },
        ] : []}
        headerActions={!canCreate ? (
          <Select value={funcionFilter} onValueChange={setFuncionFilter}>
            <SelectTrigger className="w-full sm:w-52" aria-label={t("engagement.funcion")}>
              <SelectValue placeholder={t("engagement.funcion")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {[0, 2, 3].map((funcion) => (
                <SelectItem key={funcion} value={String(funcion)}>
                  {t(FUNCION_LABEL_KEYS[funcion])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : undefined}
      />
    </AppLayout>
  );
};

export default AdministrativeEngagements;
