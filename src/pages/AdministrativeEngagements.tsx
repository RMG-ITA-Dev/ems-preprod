import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useIsMobile } from "@/hooks/useMobile";
import { AdministrativeEngagement, useAdministrativeEngagements } from "@/hooks/useAdministrativeEngagements";
import { parseDateLocal } from "@/lib/timesheetUtils";
import {
  ENGAGEMENT_STATES,
  EngagementState,
  effectiveEngagementState,
  engagementStateBadgeClass,
  engagementStateI18nKey,
} from "@/lib/engagementStatus";

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
/**
 * Estado efectivo de la fila (mismo cálculo que Engagements.tsx y el detalle), o `null` si la RPC
 * no trae los insumos. Pasa cuando el frontend se despliega antes que la versión de
 * `list_administrative_engagements()` que devuelve `work_order_required`: sin el campo,
 * `deriveEngagementState` lo lee como falsy y calcula "Aprobado" para TODAS las filas, aunque
 * el encargo exija OT y no la tenga. Con `null` la columna vuelve al `status` legacy, que es
 * menos preciso pero no miente.
 */
export function administrativeEffectiveState(row: AdministrativeEngagement): EngagementState | null {
  if (typeof row.work_order_required !== "boolean") return null;
  return effectiveEngagementState(row, row.work_order);
}

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
  // 1105-219 (review Codex): en móvil DataTable muestra cards y su embudo de estado vive solo en
  // la cabecera de escritorio. Un único estado controlado alimenta el embudo (escritorio) y el
  // Select de la barra (móvil): sin filtros contradictorios al cruzar los 768px, y DataTable
  // vuelve a la página 1 al cambiarlo porque es su propio filtro de estado.
  const isMobile = useIsMobile();
  const [stateFilter, setStateFilter] = useState("all");
  const rows = useMemo(() => {
    const visibleRows = administrativeRowsForViewer(
      data ?? [],
      canCreate,
      currentBoliviaFiscalYear(),
    );
    const filteredRows = funcionFilter === "all"
      ? visibleRows
      : visibleRows.filter((row) => String(row.funcion) === funcionFilter);
    // Estado efectivo, igual que Engagements.tsx y el detalle: `status` es el legacy ('active').
    return filteredRows.map((row) => ({
      ...row,
      effective_state: administrativeEffectiveState(row) ?? row.status,
    }));
  }, [canCreate, data, funcionFilter]);

  const stateOptions = ENGAGEMENT_STATES.map((s) => ({
    value: String(s),
    label: t(engagementStateI18nKey(s)),
  }));

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
      key: "effective_state",
      label: t("engagement.status"),
      sortable: true,
      // 1105-219: embudo de estado, igual que en Encargos (Engagements.tsx).
      filterKey: "effective_state",
      mobilePriority: "primary",
      render: (row) => {
        const state = administrativeEffectiveState(row);
        if (state === null) {
          return (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              {t(`status.${row.status}`)}
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className={engagementStateBadgeClass(state)}>
            {t(engagementStateI18nKey(state))}
          </Badge>
        );
      },
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
        onRowClick={canCreate ? (row) => navigate(`/engagements/${row.engagement_id}`, { state: { returnTo: "/administrative-engagements" } }) : undefined}
        getRowId={(row) => row.engagement_id}
        filters={canCreate ? [
          {
            key: "funcion",
            label: t("engagement.funcion"),
            options: [0, 2, 3].map((funcion) => ({ value: String(funcion), label: t(FUNCION_LABEL_KEYS[funcion]) })),
          },
        ] : []}
        // 1105-219: mismas 8 opciones que Encargos. `effective_state` ya viene en cada fila
        // (número de estado). Si la RPC no trae `work_order_required`, la fila guarda el
        // `status` legacy y solo aparece con "Todos". La vista de consulta no tiene la
        // columna Estado, así que no lleva el filtro. En móvil (sin cabecera de tabla) el
        // filtro es el Select de headerActions.
        statusFilter={canCreate ? { key: "effective_state", options: stateOptions } : undefined}
        statusFilterValue={canCreate ? stateFilter : undefined}
        onStatusFilterChange={canCreate ? setStateFilter : undefined}
        headerActions={canCreate ? (
          isMobile ? (
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-full min-h-[44px]" aria-label={t("engagement.status")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                {stateOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        ) : (
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
        )}
      />
    </AppLayout>
  );
};

export default AdministrativeEngagements;
