import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ShieldAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRiskWorkOrders } from "@/hooks/useRiskWorkOrders";
import { formatDateDMY } from "@/lib/fundRequestCalendar";
import {
  RISK_LIST_FILTERS,
  defaultRiskFilter,
  filterRiskRows,
  riskListGroups,
  type RiskListFilter,
  type RiskWorkOrderRow,
} from "@/lib/workOrderRisk";

const dash = <span className="text-muted-foreground">—</span>;

/**
 * Estado de Riesgos de una fila (clave de i18n + color); Finalizado prevalece (D-12). Colores del
 * sistema (docs/skills/component-patterns.md, Status Badges): pendiente = warning, aprobado =
 * success, rechazado = destructive tenue, finalizado = muted.
 */
function statusBadge(row: RiskWorkOrderRow): { key: string; className: string } | null {
  const groups = riskListGroups(row);
  if (groups.has("finalized")) {
    return { key: "risks.filter.finalized", className: "bg-muted text-muted-foreground border-border" };
  }
  if (groups.has("pending")) {
    return { key: "risks.filter.pending", className: "bg-warning/10 text-warning border-warning/20" };
  }
  if (groups.has("rejected")) {
    return {
      key: "risks.filter.rejected",
      className: "bg-destructive/10 text-destructive border-destructive/20",
    };
  }
  if (groups.has("approved")) {
    return { key: "risks.filter.approved", className: "bg-success/10 text-success border-success/20" };
  }
  // Emergency_Approved: solo la etiqueta de Emergencia (D-46, no es "Aprobado por Riesgos").
  return null;
}

/** Emergencia: chip claro (borde y letra naranja sobre fondo tenue), el estilo original aprobado por el operador. */
const EMERGENCY_BADGE_CLASS = "border-orange-300 bg-orange-50 text-orange-800";

/** Chip pequeño con etiqueta, igual que el de sociedad en la lista de Encargos. */
const TEAM_CHIP_CLASS = "bg-muted text-muted-foreground font-normal text-[10px] px-1.5 py-0";

/**
 * Lista de Riesgos (1028-213): las OT enviadas a Riesgos, solo con campos de Riesgos (sin montos
 * ni horas), siempre en el orden del servidor (código de encargo, D-39). Es de consulta: aprobar
 * y rechazar se hace dentro del detalle (D-13). Solo admin, risk_partner y risk_supervisor
 * (`work_order.risk.read`): la ruta y la RPC lo exigen.
 */
const Risks = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useRiskWorkOrders();
  const rows = useMemo(() => data ?? [], [data]);

  // El filtro inicial sale de los datos (Emergencia si hay alguna; si no, Pendiente) y se fija UNA
  // sola vez tras la primera carga correcta: los refetch conservan lo que eligió la persona.
  const [filter, setFilter] = useState<RiskListFilter | null>(null);
  useEffect(() => {
    if (filter === null && data) setFilter(defaultRiskFilter(data));
  }, [data, filter]);
  const activeFilter: RiskListFilter = filter ?? (data ? defaultRiskFilter(data) : "pending");

  const visible = useMemo(() => filterRiskRows(rows, activeFilter), [rows, activeFilter]);

  const codeAndDate = (code: string | null, date: string | null) => (
    <div className="min-w-0">
      <p className="font-mono text-xs">{code || dash}</p>
      <p className="text-xs text-muted-foreground">{date ? formatDateDMY(date) : dash}</p>
    </div>
  );

  const columns: Column<RiskWorkOrderRow>[] = [
    {
      key: "engagement_code",
      label: t("risks.columns.engagement"),
      mobilePriority: "primary",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-xs">{row.engagement_code ?? "-"}</p>
          <p className="line-clamp-1">{row.engagement_name ?? "-"}</p>
        </div>
      ),
    },
    {
      key: "client_name",
      label: t("risks.columns.client"),
      mobilePriority: "primary",
      // Cliente + Socio y Gerente del encargo como chips (mismo patrón que la lista de Encargos).
      render: (row) => (
        <div className="min-w-0">
          <span className="line-clamp-1">{row.client_name ?? "-"}</span>
          {(row.partner_name || row.manager_name) && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {row.partner_name && (
                <Badge
                  variant="outline"
                  className={TEAM_CHIP_CLASS}
                  title={`${t("risks.partnerLabel")}: ${row.partner_name}`}
                >
                  <span className="opacity-70">{t("risks.partnerLabel")}</span>
                  <span className="mx-1 opacity-40">·</span>
                  {row.partner_name}
                </Badge>
              )}
              {row.manager_name && (
                <Badge
                  variant="outline"
                  className={TEAM_CHIP_CLASS}
                  title={`${t("risks.managerLabel")}: ${row.manager_name}`}
                >
                  <span className="opacity-70">{t("risks.managerLabel")}</span>
                  <span className="mx-1 opacity-40">·</span>
                  {row.manager_name}
                </Badge>
              )}
            </div>
          )}
        </div>
      ),
    },
    // D-04: SAN primero y CEAC segundo.
    {
      key: "san_approval_id",
      label: t("risks.columns.san"),
      mobilePriority: "secondary",
      render: (row) => codeAndDate(row.san_approval_id, row.san_completed_at),
    },
    {
      key: "ceac_number",
      label: t("risks.columns.ceac"),
      mobilePriority: "secondary",
      render: (row) => codeAndDate(row.ceac_number, row.ceac_completed_at),
    },
    {
      key: "risk_level",
      label: t("risks.columns.level"),
      mobilePriority: "secondary",
      render: (row) => (row.risk_level ? t(`workOrders.riskLevel${row.risk_level}`) : dash),
    },
    {
      key: "risk_status",
      label: t("risks.columns.status"),
      mobilePriority: "primary",
      render: (row) => {
        const status = statusBadge(row);
        const emergency = riskListGroups(row).has("emergency");
        return (
          // flex-wrap: con dos chips (estado + Emergencia con "vence …") el segundo baja de línea.
          <div className="flex flex-wrap items-center gap-1.5">
            {status && (
              <Badge variant="outline" className={status.className}>
                {t(status.key)}
              </Badge>
            )}
            {emergency && (
              <Badge
                variant="outline"
                className={`${EMERGENCY_BADGE_CLASS} whitespace-normal`}
              >
                <ShieldAlert className="mr-1 h-3 w-3" />
                {t("risks.emergency")}
                {row.emergency_deadline_at &&
                  ` · ${t("risks.dueOn", { date: formatDateDMY(row.emergency_deadline_at) })}`}
              </Badge>
            )}
          </div>
        );
      },
    },
  ];

  // Sin esto, una RPC caída se ve igual que "No hay resultados" y Riesgos concluye que no hay
  // nada pendiente.
  if (isError) {
    return (
      <AppLayout title={t("risks.title")}>
        <div className="space-y-2">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("risks.loadError")}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => refetch()}>
            {t("risks.retry")}
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("risks.title")}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("risks.subtitle")}</p>
        {/* key: el filtro de estado se aplica FUERA del DataTable (`visible`), que solo vuelve a la página 1
            cuando cambian sus propios filtros. Sin remontarlo, tras estar en la página 2 de «Todas» un filtro
            con pocas filas dejaba la tabla en una página inexistente, vacía (review 1028-213, R3-5). */}
        <DataTable
          key={activeFilter}
          data={visible}
          columns={columns}
          searchPlaceholder={t("risks.searchPlaceholder")}
          searchKeys={["engagement_code", "engagement_name", "client_name"]}
          isLoading={isLoading}
          getRowId={(row) => row.wo_id}
          onRowClick={(row) => navigate(`/risks/${row.wo_id}`)}
          headerActions={
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {t("risks.statusFilter")}
              </span>
              <Select
                value={activeFilter}
                onValueChange={(value) => setFilter(value as RiskListFilter)}
              >
                <SelectTrigger className="w-56" aria-label={t("risks.statusFilter")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_LIST_FILTERS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`risks.filter.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
      </div>
    </AppLayout>
  );
};

export default Risks;
