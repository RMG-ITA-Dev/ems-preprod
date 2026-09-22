import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "@/contexts/DashboardContext";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderKanban,
  DollarSign,
  Briefcase,
  Search,
  AlertTriangle,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  ReferenceLine,
  LabelList,
} from "recharts";
import {
  usePartnerOverview,
  usePartnerOverviewEngagements,
  type EngagementSortKey,
} from "@/hooks/usePartnerOverview";
import {
  toViewModel,
  formatBsCompact,
  consumptionTone,
  alertCardTone,
  splitNext7Days,
  next7DayLabelFormat,
  sectorLegend,
  emptyKind,
  fiscalYearParam,
  hoursConsumptionPct,
  topManagersByEndDate,
  formatShortDate,
  engagementCompliancePp,
  complianceTone,
  engagementSegmentPct,
} from "./partnerOverviewAggregation";

// dash_socio (bugs/dashboard/socio/plan_v2.md §5.5): pestaña Socio -- 5 KPI +
// 8 bloques (A-H), alimentados por un solo RPC `partner_overview`. `PartnerFilters`
// se exporta aparte porque Index.tsx lo renderiza en la fila de pestañas (fuera
// del árbol que Radix desmonta al cambiar de tab); ambos comparten la misma
// queryKey vía React Query, así que no hay round-trip duplicado.

const CHART_COLORS = {
  approved: "hsl(var(--success))",
  pending: "hsl(var(--warning))",
  budget: "hsl(var(--muted-foreground))",
  destructive: "hsl(var(--destructive))",
  primary: "hsl(var(--primary))",
};

const SECTOR_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--info))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--accent))",
  "hsl(var(--muted-foreground))",
];

/** ResponsiveContainer envuelto: jsdom (vitest) no implementa ResizeObserver y
 * recharts no lo detecta antes de instanciarlo (mismo gap documentado en
 * src/hooks/useContainerWidth.ts) -- sin este guard, cualquier gráfico
 * crashea al montar bajo test. En navegadores reales (ResizeObserver siempre
 * presente) este wrapper es un passthrough transparente. */
function ChartContainer({ children, height = "100%" }: { children: ReactElement; height?: number | string }) {
  if (typeof ResizeObserver === "undefined") {
    return <div style={{ width: "100%", height }} />;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      {children}
    </ResponsiveContainer>
  );
}

function usePartnerOverviewParams() {
  const {
    startDateStr,
    endDateStr,
    periodType,
    selectedQuarter,
    selectedYear,
    selectedClientId,
    selectedIndustryId,
    selectedSocietyId,
  } = useDashboard();

  const fiscalYear = fiscalYearParam(periodType, selectedQuarter, selectedYear);

  return {
    startDateStr,
    endDateStr,
    fiscalYear,
    selectedClientId,
    // review.md iteración 1, NH-01: el filtro de Gerente no tiene control en la UI desde
    // 2026-09-16 -- se retiró el estado muerto `selectedManagerId` de DashboardContext y
    // se pasa `null` directo. `p_manager_id` sigue declarado en el contrato del RPC
    // (plan_v2.md §7.1), nadie lo setea desde acá por ahora.
    selectedManagerId: null as string | null,
    selectedIndustryId,
    selectedSocietyId,
  };
}

function useScopedPartnerOverview() {
  const params = usePartnerOverviewParams();
  const query = usePartnerOverview(
    params.startDateStr,
    params.endDateStr,
    params.fiscalYear,
    params.selectedClientId,
    params.selectedManagerId,
    params.selectedIndustryId,
    params.selectedSocietyId,
  );

  return { ...query, ...params };
}

/** Barra bicolor aprobadas (verde) / pendientes (ámbar) sobre el presupuesto,
 * como BarChart apilado horizontal con tooltip de desglose al hacer hover. */
function BicolorBar({
  approved,
  pending,
  budget,
}: {
  approved: number;
  pending: number;
  budget: number;
}) {
  const { t } = useTranslation();
  const total = budget > 0 ? budget : Math.max(approved + pending, 1);
  const data = [{ name: "hours", approved, pending }];
  const pctConsumed = budget > 0 ? Math.round(((approved + pending) / budget) * 100) : null;

  return (
    <div className="h-3 w-full" role="img">
      <ChartContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis type="number" domain={[0, total]} hide />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active }) =>
              active ? (
                <div className="rounded-md border bg-card px-2 py-1.5 text-xs shadow-md space-y-0.5">
                  <p>{t("dashboard.socio.tooltip.approved")}: {approved.toFixed(1)}</p>
                  <p>{t("dashboard.socio.tooltip.pending")}: {pending.toFixed(1)}</p>
                  <p>{t("dashboard.socio.tooltip.budget")}: {budget.toFixed(1)}</p>
                  {pctConsumed !== null && <p>{t("dashboard.socio.tooltip.consumed", { pct: pctConsumed })}</p>}
                </div>
              ) : null
            }
          />
          <Bar dataKey="approved" stackId="hours" fill={CHART_COLORS.approved} isAnimationActive={false} />
          <Bar dataKey="pending" stackId="hours" fill={CHART_COLORS.pending} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/** Bloque A: columna vertical de un solo valor (Honorario ajustado) -- sin
 * comparación, solo el número, con la etiqueta encima de la barra. */
function SingleColumnBar({ value, color, name }: { value: number; color: string; name: string }) {
  const data = [{ name, value }];
  const domainMax = Math.max(value, 1);

  return (
    <div className="h-full min-h-[8rem] w-full" role="img">
      <ChartContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 4 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
          <YAxis type="number" domain={[0, domainMax]} hide />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active }) =>
              active ? (
                <div className="rounded-md border bg-card px-2 py-1.5 text-xs shadow-md">
                  <p>{name}: {formatBsCompact(value)}</p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="value" fill={color} isAnimationActive={false} radius={[3, 3, 0, 0]}>
            <LabelList dataKey="value" position="top" formatter={(v: number) => formatBsCompact(v)} style={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/** Bloque A: columna de Gastos ejecutados vs. presupuestados -- "barra bala":
 * la línea punteada marca el presupuesto y la barra sólida el ejecutado; si el
 * ejecutado supera el presupuesto, la barra sobresale por encima de la línea Y
 * cambia a color destructivo, para que el exceso sea notorio sin leer números. */
function ExpensesColumnBar({
  executed,
  budgeted,
  managerApproved,
  name,
}: {
  executed: number;
  budgeted: number;
  managerApproved: number;
  name: string;
}) {
  const { t } = useTranslation();
  const overBudget = budgeted > 0 && executed > budgeted;
  const pct = budgeted > 0 ? Math.round((executed / budgeted) * 100) : null;
  const domainMax = Math.max(executed, budgeted, 1) * 1.15;
  const data = [{ name, executed }];

  return (
    <div className="h-full w-full" role="img">
      <div className="h-full min-h-[8rem]">
        <ChartContainer>
          <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 4 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <YAxis type="number" domain={[0, domainMax]} hide />
            {budgeted > 0 && (
              <ReferenceLine
                y={budgeted}
                stroke="hsl(var(--foreground))"
                strokeDasharray="3 3"
                label={{
                  value: formatBsCompact(budgeted),
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "hsl(var(--muted-foreground))",
                }}
              />
            )}
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))" }}
              content={({ active }) =>
                active ? (
                  <div className="rounded-md border bg-card px-2 py-1.5 text-xs shadow-md space-y-0.5">
                    <p>{t("dashboard.socio.blocks.profitability.expensesExecuted")}: {formatBsCompact(executed)}</p>
                    <p>{t("dashboard.socio.blocks.profitability.expensesBudgeted")}: {formatBsCompact(budgeted)}</p>
                    {pct !== null && <p>{t("dashboard.socio.tooltip.consumed", { pct })}</p>}
                    {overBudget && (
                      <p className="text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {t("dashboard.socio.blocks.profitability.expensesOverBudget", { pct })}
                      </p>
                    )}
                    {managerApproved > 0 && (
                      <p>{t("dashboard.socio.tooltip.managerApprovedExpenses", { amount: formatBsCompact(managerApproved) })}</p>
                    )}
                  </div>
                ) : null
              }
            />
            <Bar dataKey="executed" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              <Cell fill={overBudget ? CHART_COLORS.destructive : "hsl(var(--info))"} />
              <LabelList dataKey="executed" position="top" formatter={(v: number) => formatBsCompact(v)} style={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}

/** Bloque A: horas presupuestadas vs. ejecutadas como dos columnas sobre el
 * mismo eje -- la de ejecutadas queda apilada (aprobadas/pendientes) para que
 * la altura relativa muestre el % de consumo de un vistazo. */
function HoursColumnsBar({ budget, approved, pending }: { budget: number; approved: number; pending: number }) {
  const { t } = useTranslation();
  const total = approved + pending;
  const domainMax = Math.max(budget, total, 1);
  const pct = budget > 0 ? Math.round((total / budget) * 100) : null;
  const data = [
    { name: t("dashboard.socio.blocks.profitability.hoursBudgeted"), budget, approved: 0, pending: 0 },
    { name: t("dashboard.socio.blocks.profitability.hoursExecuted"), budget: 0, approved, pending },
  ];

  return (
    <div className="h-full min-h-[8rem] w-full" role="img">
      <ChartContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 4 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
          <YAxis type="number" domain={[0, domainMax]} hide />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active }) =>
              active ? (
                <div className="rounded-md border bg-card px-2 py-1.5 text-xs shadow-md space-y-0.5">
                  <p>{t("dashboard.socio.tooltip.budget")}: {budget.toFixed(1)}</p>
                  <p>{t("dashboard.socio.tooltip.approved")}: {approved.toFixed(1)}</p>
                  <p>{t("dashboard.socio.tooltip.pending")}: {pending.toFixed(1)}</p>
                  {pct !== null && <p>{t("dashboard.socio.tooltip.consumed", { pct })}</p>}
                </div>
              ) : null
            }
          />
          <Bar dataKey="budget" stackId="h" fill={CHART_COLORS.budget} isAnimationActive={false} radius={[3, 3, 0, 0]}>
            <LabelList dataKey="budget" position="top" formatter={(v: number) => (v > 0 ? `${v}h` : "")} style={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
          </Bar>
          <Bar dataKey="approved" stackId="h" fill={CHART_COLORS.approved} isAnimationActive={false} />
          <Bar dataKey="pending" stackId="h" fill={CHART_COLORS.pending} isAnimationActive={false} radius={[3, 3, 0, 0]}>
            <LabelList
              dataKey="pending"
              position="top"
              content={(props) => {
                const { x, y, width, index } = props as { x: number; width: number; y: number; index: number };
                if (index !== 1) return null;
                return (
                  <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={11} fill="hsl(var(--foreground))">
                    {`${total}h (${pct ?? 0}%)`}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/** Bloque F: barra bicolor por encargo con línea de referencia en el 100% del
 * presupuesto (permite ver el sobregiro incluso cuando la barra la sobrepasa). */
function EngagementHoursBar({ approved, pending, budget }: { approved: number; pending: number; budget: number }) {
  const { t } = useTranslation();
  const totalHours = approved + pending;
  const domainMax = Math.max(budget, totalHours, 1);
  const data = [{ name: "hours", approved, pending }];
  const consumptionPct = budget > 0 ? Math.round((totalHours / budget) * 100) : null;

  return (
    <div className="h-3 w-full" role="img">
      <ChartContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis type="number" domain={[0, domainMax]} hide />
          <YAxis type="category" dataKey="name" hide />
          {budget > 0 && <ReferenceLine x={budget} stroke="hsl(var(--foreground))" strokeDasharray="3 3" />}
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active }) =>
              active ? (
                <div className="rounded-md border bg-card px-2 py-1.5 text-xs shadow-md space-y-0.5">
                  <p>{t("dashboard.socio.tooltip.approved")}: {approved.toFixed(1)}</p>
                  <p>{t("dashboard.socio.tooltip.pending")}: {pending.toFixed(1)}</p>
                  <p>{t("dashboard.socio.tooltip.budget")}: {budget.toFixed(1)}</p>
                  {consumptionPct !== null && <p>{t("dashboard.socio.tooltip.consumed", { pct: consumptionPct })}</p>}
                </div>
              ) : null
            }
          />
          <Bar dataKey="approved" stackId="hours" fill={CHART_COLORS.approved} isAnimationActive={false} />
          <Bar dataKey="pending" stackId="hours" fill={CHART_COLORS.pending} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/** Filtros exclusivos de la pestaña Socio: Cliente, Sociedad (solo admin/senior_partner),
 * chip de Sector. Se renderiza en la fila de pestañas (Index.tsx), fuera del contenido
 * de la tab. 2026-09-16: el operador retiró el filtro de Gerente de la UI -- el estado
 * `selectedManagerId`/`setSelectedManagerId` y el parámetro `p_manager_id` del RPC
 * quedan sin usar desde acá por ahora. */
export function PartnerFilters() {
  const { t } = useTranslation();
  const {
    selectedClientId,
    setSelectedClientId,
    selectedIndustryId,
    setSelectedIndustryId,
    selectedSocietyId,
    setSelectedSocietyId,
  } = useDashboard();
  const { data } = useScopedPartnerOverview();
  const filters = data?.filters ?? { clients: [], managers: [], industries: [], societies: [] };
  const selectedIndustryName = filters.industries.find((i) => i.industry_id === selectedIndustryId)?.industry_name;
  // dash_socio (2026-09-17): filtro de Sociedad, exacto al predicado que ya usa el rol
  // `partner` (engagements.society_id = X) -- solo admin/senior_partner lo ven, porque
  // son los únicos roles con alcance "toda la firma" (decisiones.md §2).
  const showSocietyFilter = data?.meta.role_key === "admin" || data?.meta.role_key === "senior_partner";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={selectedClientId ?? "__global__"}
        onValueChange={(v) => setSelectedClientId(v === "__global__" ? null : v)}
      >
        <SelectTrigger className="h-9 w-[180px] bg-card/80 backdrop-blur-sm">
          <SelectValue placeholder={t("dashboard.socio.filters.client")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__global__">{t("dashboard.socio.filters.clientGlobal")}</SelectItem>
          {filters.clients.map((c) => (
            <SelectItem key={c.client_id} value={c.client_id}>
              {c.client_legal_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showSocietyFilter && (
        <Select
          value={selectedSocietyId ?? "__both__"}
          onValueChange={(v) => setSelectedSocietyId(v === "__both__" ? null : v)}
        >
          <SelectTrigger className="h-9 w-[220px] bg-card/80 backdrop-blur-sm">
            <SelectValue placeholder={t("dashboard.socio.filters.society")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__both__">{t("dashboard.socio.filters.societyBoth")}</SelectItem>
            {filters.societies.map((s) => (
              <SelectItem key={s.society_id} value={s.society_id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectedIndustryId && (
        <Badge
          variant="secondary"
          className="cursor-pointer gap-1"
          onClick={() => setSelectedIndustryId(null)}
          aria-label={t("dashboard.socio.filters.clearSector")}
        >
          {t("dashboard.socio.filters.sectorChip", { name: selectedIndustryName ?? selectedIndustryId })}
          <span aria-hidden>×</span>
        </Badge>
      )}
    </div>
  );
}

export function PartnerTabSkeleton() {
  return (
    <div className="space-y-4" data-testid="partner-tab-skeleton">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" data-testid="partner-kpi-skeleton" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" data-testid="partner-block-skeleton" />
        ))}
      </div>
    </div>
  );
}

export function PartnerTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { setSelectedIndustryId } = useDashboard();
  const {
    data,
    isLoading,
    isError,
    error,
    isPlaceholderData,
    startDateStr,
    endDateStr,
    fiscalYear,
    selectedClientId,
    selectedManagerId,
    selectedIndustryId,
    selectedSocietyId,
  } = useScopedPartnerOverview();
  const [showOverBudgetOnly, setShowOverBudgetOnly] = useState(false);
  // 2026-09-16: orden por defecto pedido por el operador -- fecha fin ascendente
  // (el compromiso más próximo por vencer primero, mismo criterio que Gerentes).
  const [engagementSort, setEngagementSort] = useState<EngagementSortKey>("end_date");
  // 2026-09-17: "Ver todos" ya no abre un panel aparte con otro formato -- sube el límite
  // de la misma consulta/tabla (mismo orden/filtro activo). ENGAGEMENTS_ALL_LIMIT coincide
  // con el tope que el RPC ya impone (LEAST(p_limit, 200)).
  const ENGAGEMENTS_TOP_N = 10;
  const ENGAGEMENTS_ALL_LIMIT = 200;
  const [showAllEngagements, setShowAllEngagements] = useState(false);
  const engagementsQuery = usePartnerOverviewEngagements({
    startDateStr,
    endDateStr,
    fiscalYear,
    clientId: selectedClientId,
    managerId: selectedManagerId,
    industryId: selectedIndustryId,
    societyId: selectedSocietyId,
    sortKey: engagementSort,
    overBudgetOnly: showOverBudgetOnly,
    limit: showAllEngagements ? ENGAGEMENTS_ALL_LIMIT : ENGAGEMENTS_TOP_N,
  });

  if (isLoading) {
    return <PartnerTabSkeleton />;
  }

  // Un solo payload: un error del RPC no se reintenta bloque por bloque
  // (decisiones.md §9.5) -- se propaga para que TabErrorBoundary lo capture.
  if (isError) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  const vm = toViewModel(data);
  const kind = emptyKind(vm.meta);

  const scopeLabel =
    vm.meta.scope_kind === "firm"
      ? t("dashboard.socio.scope.firm")
      : vm.meta.scope_kind === "society"
        ? t("dashboard.socio.scope.society", { name: vm.meta.society_name ?? "" })
        : t("dashboard.socio.scope.own");

  const kpi5Tone = alertCardTone(vm.kpis.alerts.over_budget_count, vm.kpis.alerts.pending_wo_count);
  // review.md iteracion 4, MF-01: el denominador es la suma de los 3 segmentos, no
  // kpis.engagements.total (que solo cuenta estado 4/5 y no incluye a "finalizados").
  const engagementsSegmentPct = engagementSegmentPct(
    vm.kpis.engagements.approved,
    vm.kpis.engagements.emergency,
    vm.kpis.engagements.finalized_in_period,
  );

  const engagementRows = engagementsQuery.data?.items ?? [];
  const engagementRowsTotal = engagementsQuery.data?.total ?? 0;

  const next7 = splitNext7Days(vm.collections.next_7_days, vm.meta.today);
  const next7ByDate = Object.entries(
    next7.reduce<Record<string, typeof next7>>((acc, item) => {
      (acc[item.date] ??= []).push(item);
      return acc;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));
  const shortDateLocale = i18n.language?.startsWith("es") ? "es-BO" : "en-US";
  // review.md iteración 7, G-03: si la ventana de 7 días cruza de mes, "vie 1" es
  // ambiguo -- se cambia a día + mes corto ("29 nov"), mismo largo aproximado que
  // "lun 15", para no desbordar el ancho fijo de la etiqueta (w-14 más abajo).
  const dateFormatter = new Intl.DateTimeFormat(
    shortDateLocale,
    next7DayLabelFormat(vm.meta.today) === "weekday"
      ? { weekday: "short", day: "numeric" }
      : { day: "numeric", month: "short" },
  );
  const legend = sectorLegend(vm.sectors, 6);
  // 2026-09-16: el operador bajó ambos topes de 10/3 a 5.
  const TOP_N = 5;
  const topManagers = topManagersByEndDate(vm.managers, TOP_N);
  const topClientsRows = vm.top_clients.slice(0, TOP_N);

  return (
    <div className="space-y-4" aria-busy={isPlaceholderData}>
      <p className="text-sm text-muted-foreground">{scopeLabel}</p>

      {kind === "scope" && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("dashboard.socio.empty.scope")}
          </CardContent>
        </Card>
      )}

      {kind === "filters" && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("dashboard.socio.empty.filters")}
          </CardContent>
        </Card>
      )}

      {kind === "none" && (
        <>
          {/* KPI 1-5 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <StatCard
              title={t("dashboard.socio.kpi.engagements.title")}
              value={vm.kpis.engagements.total}
              icon={<FolderKanban className="h-5 w-5" />}
              subtitle={t("dashboard.socio.kpi.engagements.breakdown", {
                approved: vm.kpis.engagements.approved,
                emergency: vm.kpis.engagements.emergency,
                finalized: vm.kpis.engagements.finalized_in_period,
              })}
              footer={
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                  {/* review.md iteracion 1, MF-04: anchos reales por segmento (antes fijos
                      70/15/15) y un destino de clic por segmento (antes todo el contenedor
                      navegaba a state=4). */}
                  <div
                    className="h-full bg-primary cursor-pointer"
                    style={{ width: `${engagementsSegmentPct.approved}%` }}
                    onClick={() => navigate("/engagements?state=4")}
                    title={t("dashboard.socio.kpi.engagements.segmentApproved", { count: vm.kpis.engagements.approved })}
                  />
                  <div
                    className="h-full bg-info cursor-pointer"
                    style={{ width: `${engagementsSegmentPct.emergency}%` }}
                    onClick={() => navigate("/engagements?state=5")}
                    title={t("dashboard.socio.kpi.engagements.segmentEmergency", { count: vm.kpis.engagements.emergency })}
                  />
                  <div
                    className="h-full bg-muted-foreground cursor-pointer"
                    style={{ width: `${engagementsSegmentPct.finalized}%` }}
                    onClick={() => navigate("/engagements?state=7")}
                    title={t("dashboard.socio.kpi.engagements.segmentFinalized", { count: vm.kpis.engagements.finalized_in_period })}
                  />
                </div>
              }
            />

            <StatCard
              title={t("dashboard.socio.kpi.fees.title")}
              value={formatBsCompact(vm.kpis.fees.total_bob)}
              icon={<DollarSign className="h-5 w-5" />}
              subtitle={t("dashboard.socio.kpi.fees.netNote")}
              sparklineData={vm.kpis.fees.sparkline.map((p) => ({ value: p.value_bob }))}
              trend={
                vm.kpis.fees.previous_total_bob > 0
                  ? {
                      value: Math.round(
                        ((vm.kpis.fees.total_bob - vm.kpis.fees.previous_total_bob) /
                          vm.kpis.fees.previous_total_bob) *
                          100,
                      ),
                      positive: vm.kpis.fees.total_bob >= vm.kpis.fees.previous_total_bob,
                    }
                  : undefined
              }
            />

            <StatCard
              title={t("dashboard.socio.kpi.partnerHours.title")}
              value={t("dashboard.socio.kpi.hoursOfBudget", {
                logged: vm.kpis.my_partner_hours.approved + vm.kpis.my_partner_hours.pending,
                budget: vm.kpis.my_partner_hours.budget,
              })}
              icon={<Briefcase className="h-5 w-5" />}
              footer={
                <BicolorBar
                  approved={vm.kpis.my_partner_hours.approved}
                  pending={vm.kpis.my_partner_hours.pending}
                  budget={vm.kpis.my_partner_hours.budget}
                />
              }
            />

            <StatCard
              title={t("dashboard.socio.kpi.sqrHours.title")}
              value={t("dashboard.socio.kpi.hoursOfBudget", {
                logged: vm.kpis.my_sqr_hours.approved + vm.kpis.my_sqr_hours.pending,
                budget: vm.kpis.my_sqr_hours.budget,
              })}
              icon={<Search className="h-5 w-5" />}
              subtitle={t("dashboard.socio.kpi.sqrHours.inEngagements", {
                count: vm.kpis.my_sqr_hours.engagement_count,
              })}
              footer={
                <BicolorBar
                  approved={vm.kpis.my_sqr_hours.approved}
                  pending={vm.kpis.my_sqr_hours.pending}
                  budget={vm.kpis.my_sqr_hours.budget}
                />
              }
            />

            <StatCard
              title={t("dashboard.socio.kpi.alerts.title")}
              value={`${vm.kpis.alerts.over_budget_count} · ${vm.kpis.alerts.pending_wo_count}`}
              icon={<AlertTriangle className="h-5 w-5" />}
              subtitle={t("dashboard.socio.kpi.alerts.target")}
              className={
                kpi5Tone === "success"
                  ? "border-success/40"
                  : kpi5Tone === "destructive"
                    ? "border-destructive/40"
                    : "border-warning/40"
              }
              footer={
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="text-left text-xs text-muted-foreground hover:underline"
                    onClick={() => setShowOverBudgetOnly(true)}
                  >
                    {t("dashboard.socio.blocks.alerts.overBudget", { count: vm.kpis.alerts.over_budget_count })}
                  </button>
                  <button
                    type="button"
                    className="text-left text-xs text-muted-foreground hover:underline"
                    onClick={() => navigate("/work-orders?status=Pending_Approval")}
                  >
                    {t("dashboard.socio.blocks.alerts.pendingWo", { count: vm.kpis.alerts.pending_wo_count })}
                  </button>
                  {vm.kpis.alerts.pending_risk_count > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t("dashboard.socio.kpi.alerts.riskPending", { count: vm.kpis.alerts.pending_risk_count })}
                    </span>
                  )}
                </div>
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bloque A: Rentabilidad de la cartera -- comparte fila con Bloque B+C. */}
            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {t("dashboard.socio.blocks.profitability.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                {/* review.md iteracion 1, MF-08: antes fijo en 4 columnas incluso en
                    movil -- checklist manual (plan_v2.md §12) exige "gráficas a una
                    columna" a ~400px. */}
                <div className="grid flex-1 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <SingleColumnBar
                    value={vm.profitability.money_bob.fee_net}
                    color={CHART_COLORS.primary}
                    name={t("dashboard.socio.blocks.profitability.feeAdjusted")}
                  />
                  <ExpensesColumnBar
                    executed={vm.profitability.money_bob.expenses_reviewed}
                    budgeted={vm.profitability.money_bob.expense_budget}
                    managerApproved={vm.profitability.money_bob.expenses_manager_approved}
                    name={t("dashboard.socio.blocks.profitability.expensesExecuted")}
                  />
                  <div className="col-span-2 h-full">
                    <HoursColumnsBar
                      budget={vm.profitability.hours.budget}
                      approved={vm.profitability.hours.approved}
                      pending={vm.profitability.hours.pending}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bloque B+C unificado (2026-09-16): Ciclo económico y cobranza. Bloque B
                (funnel A facturar/Facturado/Cobrado/Vencido>90d) se retira -- Facturado y
                Cobrado quedaban duplicados con la barra apilada de abajo (misma fuente,
                wo_payment_installments). Sobreviven como stats sueltos solo los dos datos
                de Bloque B sin equivalente en la barra: el promedio de cobro (fechas
                REALES, economic_cycle.avg_collection_days) y "vencido > 90 días" (mora
                dura por fecha real de factura, distinto del chip "N vencidas" de abajo,
                que es cualquier cuota pasada de su fecha PACTADA de cobro sin importar
                antigüedad -- se mantienen ambos "vencido" por separado a propósito, son
                alertas de severidad distinta). Comparte fila con Bloque A (2026-09-16:
                el operador pidió volver a emparejarlos en vez de ancho completo). */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span>{t("dashboard.socio.blocks.collections.title")}</span>
                  {vm.collections.overdue.count > 0 && (
                    <Badge variant="destructive">
                      {t("dashboard.socio.blocks.collections.overdueChip", {
                        count: vm.collections.overdue.count,
                        amount: formatBsCompact(vm.collections.overdue.amount_bob),
                      })}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{t("dashboard.socio.blocks.installmentBaseNote")}</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {vm.economic_cycle.avg_collection_days != null && (
                      <span>{t("dashboard.socio.blocks.economicCycle.avgDays", { days: Math.round(vm.economic_cycle.avg_collection_days) })}</span>
                    )}
                    {vm.economic_cycle.overdue_90_bob > 0 && (
                      <span className="text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {t("dashboard.socio.blocks.economicCycle.overdue90")}: {formatBsCompact(vm.economic_cycle.overdue_90_bob)}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="h-4 w-full" role="img">
                    <ChartContainer>
                      <BarChart
                        layout="vertical"
                        data={[
                          {
                            name: "status",
                            collected: vm.collections.by_status.collected.count,
                            invoiced: vm.collections.by_status.invoiced.count,
                            in_arrears: vm.collections.by_status.in_arrears.count,
                            upcoming: vm.collections.by_status.upcoming.count,
                          },
                        ]}
                        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                      >
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" hide />
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted))" }}
                          content={({ active }) =>
                            active ? (
                              <div className="rounded-md border bg-card px-2 py-1.5 text-xs shadow-md space-y-0.5">
                                <p>
                                  {t("dashboard.socio.blocks.collections.collected")}:{" "}
                                  {vm.collections.by_status.collected.count} · {formatBsCompact(vm.collections.by_status.collected.amount_bob)}
                                </p>
                                <p>
                                  {t("dashboard.socio.blocks.collections.invoiced")}:{" "}
                                  {vm.collections.by_status.invoiced.count} · {formatBsCompact(vm.collections.by_status.invoiced.amount_bob)}
                                </p>
                                <p>
                                  {t("dashboard.socio.blocks.collections.inArrears")}:{" "}
                                  {vm.collections.by_status.in_arrears.count} · {formatBsCompact(vm.collections.by_status.in_arrears.amount_bob)}
                                </p>
                                <p>
                                  {t("dashboard.socio.blocks.collections.upcoming")}:{" "}
                                  {vm.collections.by_status.upcoming.count} · {formatBsCompact(vm.collections.by_status.upcoming.amount_bob)}
                                </p>
                              </div>
                            ) : null
                          }
                        />
                        <Bar dataKey="collected" stackId="status" fill={CHART_COLORS.approved} isAnimationActive={false} />
                        <Bar dataKey="invoiced" stackId="status" fill={CHART_COLORS.pending} isAnimationActive={false} />
                        <Bar dataKey="in_arrears" stackId="status" fill={CHART_COLORS.destructive} isAnimationActive={false} />
                        <Bar dataKey="upcoming" stackId="status" fill="hsl(var(--muted-foreground))" isAnimationActive={false} />
                      </BarChart>
                    </ChartContainer>
                  </div>
                  {/* Leyenda visible (no solo al hover) -- "que sea notorio" pedido por el
                      operador; el tooltip de arriba se mantiene como respaldo con el mismo dato. */}
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {(
                      [
                        ["collected", CHART_COLORS.approved],
                        ["invoiced", CHART_COLORS.pending],
                        ["inArrears", CHART_COLORS.destructive],
                        ["upcoming", "hsl(var(--muted-foreground))"],
                      ] as const
                    ).map(([key, color]) => {
                      const statusKey = key === "inArrears" ? "in_arrears" : key;
                      const stat = vm.collections.by_status[statusKey];
                      return (
                        <span key={key} className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />
                          {stat.count} {t(`dashboard.socio.blocks.collections.${key}`)} · {formatBsCompact(stat.amount_bob)}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {t("dashboard.socio.blocks.collections.next7Days")}
                  </p>
                  <div className="space-y-1">
                    {next7.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    {next7ByDate.map(([date, items]) => (
                      <div key={date} className="flex items-start gap-2">
                        <span className="text-xs text-muted-foreground w-14 shrink-0 pt-1 capitalize">
                          {dateFormatter.format(new Date(`${date}T00:00:00`))}
                        </span>
                        <div className="flex flex-1 flex-wrap gap-1.5 border-l pl-2">
                          {items.map((item) => (
                            <button
                              key={item.installment_id}
                              type="button"
                              className="text-xs px-2 py-1 rounded-full border hover:bg-muted flex items-center gap-1"
                              onClick={() => navigate(`/work-orders/${item.wo_id}?tab=payment`)}
                            >
                              <span
                                className="h-2 w-2 rounded-full inline-block"
                                style={{
                                  backgroundColor: item.kind === "collect" ? CHART_COLORS.approved : "transparent",
                                  border: `1px solid ${CHART_COLORS.approved}`,
                                }}
                              />
                              {item.client_legal_name} · {formatBsCompact(item.amount_bob)}
                              {item.kind === "invoice" && ` (${t("dashboard.socio.blocks.collections.toInvoice")})`}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Fila D + E + G (2026-09-16, pedido del operador: las tres columnas
              juntas en una sola fila): Cartera por sector, Gerentes en mi cartera
              y Top clientes. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Bloque D: Cartera por sector -- dos donas (honorarios ajustados y
                cantidad de encargos) sobre los mismos segmentos/colores de `legend`,
                con una sola leyenda compartida debajo. Clic en cualquiera de las dos
                aplica el mismo filtro cruzado de sector. */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("dashboard.socio.blocks.sectors.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {legend.length > 0 ? (
                  <>
                    <div className="flex">
                      <div className="flex-1 space-y-1">
                        <p className="text-center text-xs text-muted-foreground">{t("dashboard.socio.blocks.sectors.byFee")}</p>
                        <div className="h-32 w-full" role="img">
                          <ChartContainer>
                            <PieChart>
                              <Pie
                                data={legend}
                                dataKey="fee_bob"
                                nameKey="industry_name"
                                innerRadius="55%"
                                outerRadius="80%"
                                paddingAngle={2}
                                isAnimationActive={false}
                                onClick={(_: unknown, index: number) => {
                                  const s = legend[index];
                                  if (s && s.industry_id !== "others") setSelectedIndustryId(s.industry_id);
                                }}
                              >
                                {legend.map((s, index) => (
                                  <Cell
                                    key={s.industry_id}
                                    fill={SECTOR_COLORS[index % SECTOR_COLORS.length]}
                                    cursor={s.industry_id === "others" ? "default" : "pointer"}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number, _name: string, props: { payload?: { industry_id: string; industry_name: string } }) => [
                                  formatBsCompact(value),
                                  props.payload?.industry_id === "others"
                                    ? t("dashboard.socio.blocks.sectors.others")
                                    : props.payload?.industry_name,
                                ]}
                                contentStyle={{
                                  backgroundColor: "hsl(var(--card))",
                                  border: "1px solid hsl(var(--border))",
                                  borderRadius: "8px",
                                  fontSize: "12px",
                                }}
                              />
                            </PieChart>
                          </ChartContainer>
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-center text-xs text-muted-foreground">{t("dashboard.socio.blocks.sectors.byCount")}</p>
                        <div className="h-32 w-full" role="img">
                          <ChartContainer>
                            <PieChart>
                              <Pie
                                data={legend}
                                dataKey="engagement_count"
                                nameKey="industry_name"
                                innerRadius="55%"
                                outerRadius="80%"
                                paddingAngle={2}
                                isAnimationActive={false}
                                onClick={(_: unknown, index: number) => {
                                  const s = legend[index];
                                  if (s && s.industry_id !== "others") setSelectedIndustryId(s.industry_id);
                                }}
                              >
                                {legend.map((s, index) => (
                                  <Cell
                                    key={s.industry_id}
                                    fill={SECTOR_COLORS[index % SECTOR_COLORS.length]}
                                    cursor={s.industry_id === "others" ? "default" : "pointer"}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number, _name: string, props: { payload?: { industry_id: string; industry_name: string } }) => [
                                  value,
                                  props.payload?.industry_id === "others"
                                    ? t("dashboard.socio.blocks.sectors.others")
                                    : props.payload?.industry_name,
                                ]}
                                contentStyle={{
                                  backgroundColor: "hsl(var(--card))",
                                  border: "1px solid hsl(var(--border))",
                                  borderRadius: "8px",
                                  fontSize: "12px",
                                }}
                              />
                            </PieChart>
                          </ChartContainer>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {legend.map((s, index) => (
                        <button
                          key={s.industry_id}
                          type="button"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:cursor-default"
                          disabled={s.industry_id === "others"}
                          onClick={() => setSelectedIndustryId(s.industry_id)}
                        >
                          <span
                            className="h-2 w-2 rounded-full inline-block"
                            style={{ backgroundColor: SECTOR_COLORS[index % SECTOR_COLORS.length] }}
                          />
                          {s.industry_id === "others" ? t("dashboard.socio.blocks.sectors.others") : s.industry_name}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>

            {/* Bloque E: Gerentes en mi cartera -- tabla (2026-09-16, reemplaza las
                barras dobles). Top 5, ordenados por fecha Fin ascendente. Solo
                encargos 4/5 (mismo alcance de siempre, decisión del operador de no
                mezclar con finalizados). */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span>{t("dashboard.socio.blocks.managers.title")}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("dashboard.socio.blocks.topN", { count: TOP_N })}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topManagers.length > 0 ? (
                  // review.md iteracion 1, MF-08: scroll horizontal contenido a la tabla
                  // (no a la página) en pantallas angostas -- checklist §12 exige "sin
                  // scroll horizontal" a nivel de página.
                  <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left font-medium py-1">{t("dashboard.socio.blocks.managers.columns.name")}</th>
                        <th className="text-right font-medium py-1">{t("dashboard.socio.blocks.managers.columns.engagements")}</th>
                        <th className="text-right font-medium py-1">{t("dashboard.socio.blocks.managers.columns.progress")}</th>
                        <th className="text-right font-medium py-1">{t("dashboard.socio.blocks.managers.columns.start")}</th>
                        <th className="text-right font-medium py-1">{t("dashboard.socio.blocks.managers.columns.end")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topManagers.map((m) => {
                        const pct = hoursConsumptionPct(m.approved_hours, m.pending_hours, m.budget_hours);
                        const tone = consumptionTone(pct);
                        return (
                          <tr
                            key={m.staff_id}
                            className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/engagements?manager=${m.staff_id}`)}
                          >
                            <td className="py-1.5 font-medium">{m.short_name}</td>
                            <td className="py-1.5 text-right text-muted-foreground">{m.engagement_count}</td>
                            <td
                              className={`py-1.5 text-right ${
                                tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : ""
                              }`}
                            >
                              {Math.round(pct)}%
                            </td>
                            <td className="py-1.5 text-right text-muted-foreground">{formatShortDate(m.start_date, shortDateLocale)}</td>
                            <td className="py-1.5 text-right text-muted-foreground">{formatShortDate(m.end_date, shortDateLocale)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>

            {/* Bloque G: Top clientes -- barra sobre el total (2026-09-16): el
                largo completo de cada fila representa kpis.fees.total_bob (el
                honorario total del alcance del rol); la parte pintada es el
                honorario del cliente. Comparte fila con D y E por pedido del
                operador. Top 5 (bajó de 3). */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span>{t("dashboard.socio.blocks.topClients.title")}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("dashboard.socio.blocks.topN", { count: TOP_N })}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topClientsRows.length > 0 ? (
                  <div style={{ height: Math.max(topClientsRows.length * 36, 72) }}>
                    <ChartContainer>
                      <BarChart
                        layout="vertical"
                        data={topClientsRows}
                        margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                      >
                        <XAxis type="number" domain={[0, Math.max(vm.kpis.fees.total_bob, 1)]} hide />
                        <YAxis
                          type="category"
                          dataKey="client_legal_name"
                          width={120}
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(name: string, index: number) => `${["🥇", "🥈", "🥉"][index] ?? `${index + 1}.`} ${name}`}
                        />
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted))" }}
                          formatter={(value: number, _name: string, props: { payload?: { fee_bob: number } }) => [
                            t("dashboard.socio.blocks.topClients.ofTotal", {
                              amount: formatBsCompact(props.payload?.fee_bob ?? value),
                              total: formatBsCompact(vm.kpis.fees.total_bob),
                            }),
                            t("dashboard.socio.blocks.topClients.title"),
                          ]}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <Bar dataKey="fee_bob" stackId="total" radius={[0, 0, 0, 0]} fill={CHART_COLORS.primary} isAnimationActive={false} />
                        <Bar
                          dataKey={(row: { fee_bob: number }) => Math.max(vm.kpis.fees.total_bob - row.fee_bob, 0)}
                          stackId="total"
                          radius={[0, 4, 4, 0]}
                          fill="hsl(var(--muted))"
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ChartContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Bloque F: Horas por encargo -- una EngagementHoursBar (BarChart bicolor
                + ReferenceLine al 100% del presupuesto) por fila. Fila propia (2026-09-16:
                dejó de compartir fila con Top clientes, que ahora va con D y E). */}
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <span>{t("dashboard.socio.blocks.engagementHours.title")}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("dashboard.socio.blocks.topN", { count: ENGAGEMENTS_TOP_N })}
                  </span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={engagementSort} onValueChange={(v) => setEngagementSort(v as EngagementSortKey)}>
                    <SelectTrigger className="h-8 w-[150px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="start_date">{t("dashboard.socio.blocks.engagementHours.sort.startDate")}</SelectItem>
                      <SelectItem value="end_date">{t("dashboard.socio.blocks.engagementHours.sort.endDate")}</SelectItem>
                      <SelectItem value="progress">{t("dashboard.socio.blocks.engagementHours.sort.progress")}</SelectItem>
                      <SelectItem value="pending_pct">{t("dashboard.socio.blocks.engagementHours.sort.pendingPct")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant={showOverBudgetOnly ? "default" : "outline"}
                    onClick={() => setShowOverBudgetOnly((v) => !v)}
                  >
                    {t("dashboard.socio.blocks.engagementHours.overBudgetOnly")}
                  </Button>
                  {!showAllEngagements && engagementRowsTotal > engagementRows.length && (
                    <Button size="sm" variant="ghost" onClick={() => setShowAllEngagements(true)}>
                      {t("dashboard.socio.blocks.engagementHours.viewAll")}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {engagementsQuery.isError ? (
                  // review.md iteracion 1, MF-06: antes un error de este 2do RPC quedaba
                  // indistinguible de "sin encargos" (isError nunca se verificaba).
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <p className="text-sm text-destructive">
                      {t("dashboard.socio.blocks.engagementHours.error")}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => engagementsQuery.refetch()}>
                      {t("dashboard.tabError.retry")}
                    </Button>
                  </div>
                ) : engagementRows.length > 0 ? (
                  // review.md iteracion 1, MF-08: overflow-x-auto siempre (antes solo
                  // scrolleaba verticalmente al expandir "Ver todos"), para que el ancho
                  // de la tabla nunca fuerce scroll horizontal de la página completa.
                  <div className={`overflow-x-auto ${showAllEngagements ? "max-h-[420px] overflow-y-auto" : ""}`}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="text-left font-medium py-1">{t("dashboard.socio.blocks.engagementHours.columns.engagement")}</th>
                          <th className="text-left font-medium py-1 min-w-[110px]">{t("dashboard.socio.blocks.engagementHours.columns.hours")}</th>
                          <th className="text-right font-medium py-1">{t("dashboard.socio.blocks.engagementHours.columns.executedPct")}</th>
                          <th className="text-right font-medium py-1">{t("dashboard.socio.blocks.engagementHours.columns.pendingPct")}</th>
                          <th className="text-right font-medium py-1">{t("dashboard.socio.blocks.engagementHours.columns.start")}</th>
                          <th className="text-right font-medium py-1">{t("dashboard.socio.blocks.engagementHours.columns.end")}</th>
                          <th
                            className="text-right font-medium py-1"
                            title={t("dashboard.socio.blocks.engagementHours.columns.complianceTooltip")}
                          >
                            {t("dashboard.socio.blocks.engagementHours.columns.compliance")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {engagementRows.map((r) => {
                          const consumptionPct = hoursConsumptionPct(r.approved_hours, r.pending_hours, r.budget_hours);
                          const executedPct = r.budget_hours > 0 ? (r.approved_hours / r.budget_hours) * 100 : 0;
                          const pendingPct = r.budget_hours > 0 ? (r.pending_hours / r.budget_hours) * 100 : 0;
                          const pp = engagementCompliancePp(
                            r.approved_hours,
                            r.pending_hours,
                            r.budget_hours,
                            r.start_date,
                            r.end_date,
                            vm.meta.today,
                          );
                          const tone = complianceTone(pp);
                          return (
                            <tr key={r.engagement_id} className="border-b last:border-0 align-top">
                              <td className="py-1.5 max-w-[220px]">
                                <span className="block truncate">{r.engagement_name} · {r.client_legal_name}</span>
                              </td>
                              <td className="py-1.5">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 min-w-[70px]">
                                    <EngagementHoursBar approved={r.approved_hours} pending={r.pending_hours} budget={r.budget_hours} />
                                  </div>
                                  <span className="text-muted-foreground shrink-0">{Math.round(consumptionPct)}%</span>
                                </div>
                              </td>
                              <td className="py-1.5 text-right text-muted-foreground">{Math.round(executedPct)}%</td>
                              <td className="py-1.5 text-right text-muted-foreground">{Math.round(pendingPct)}%</td>
                              <td className="py-1.5 text-right text-muted-foreground">{formatShortDate(r.start_date, shortDateLocale)}</td>
                              <td className="py-1.5 text-right text-muted-foreground">{formatShortDate(r.end_date, shortDateLocale)}</td>
                              <td
                                className={`py-1.5 text-right ${
                                  tone === "destructive"
                                    ? "text-destructive font-medium"
                                    : tone === "warning"
                                      ? "text-warning font-medium"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {pp > 0 ? "+" : ""}
                                {Math.round(pp)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>

            {/* Bloque H: Alertas */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {t("dashboard.socio.blocks.alerts.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {vm.alerts.pending_wo > 0 && (
                  <Badge variant="outline">{t("dashboard.socio.blocks.alerts.pendingWo", { count: vm.alerts.pending_wo })}</Badge>
                )}
                {vm.alerts.over_budget > 0 && (
                  <Badge variant="destructive">{t("dashboard.socio.blocks.alerts.overBudget", { count: vm.alerts.over_budget })}</Badge>
                )}
                {vm.alerts.in_arrears > 0 && (
                  <Badge variant="outline">{t("dashboard.socio.blocks.alerts.inArrears", { count: vm.alerts.in_arrears })}</Badge>
                )}
                {vm.alerts.overdue_90 > 0 && (
                  <Badge variant="outline">{t("dashboard.socio.blocks.alerts.overdue90", { count: vm.alerts.overdue_90 })}</Badge>
                )}
                {vm.alerts.closing_soon > 0 && (
                  <Badge variant="outline">{t("dashboard.socio.blocks.alerts.closingSoon", { count: vm.alerts.closing_soon })}</Badge>
                )}
                {vm.alerts.risk_pending > 0 && (
                  <Badge variant="outline">{t("dashboard.socio.blocks.alerts.riskPending", { count: vm.alerts.risk_pending })}</Badge>
                )}
                {vm.alerts.draft_worksheets > 0 && (
                  <Badge variant="outline">
                    {t("dashboard.socio.blocks.alerts.draftWorksheets", { count: vm.alerts.draft_worksheets })}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Fila resumen "Encargos finalizados" (pedido del operador 2026-09-19) */}
          <Card>
            <CardContent className="py-4">
              {vm.finalized_summary.count === 0 ? (
                <p className="text-xs text-muted-foreground text-center">
                  {t("dashboard.socio.blocks.finalizedSummary.empty")}
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
                  <span className="font-medium text-muted-foreground">
                    {t("dashboard.socio.blocks.finalizedSummary.title")}
                  </span>
                  <div className="flex flex-wrap items-center gap-6">
                    <span>
                      {t("dashboard.socio.blocks.finalizedSummary.count", { count: vm.finalized_summary.count })}
                    </span>
                    <span>
                      {vm.finalized_summary.budget_hours > 0
                        ? t("dashboard.socio.blocks.finalizedSummary.compliance", {
                            pct: Math.round((vm.finalized_summary.executed_hours / vm.finalized_summary.budget_hours) * 100),
                          })
                        : t("dashboard.socio.blocks.finalizedSummary.noBudget")}
                    </span>
                    <span>
                      {t("dashboard.socio.blocks.finalizedSummary.collected", {
                        amount: formatBsCompact(vm.finalized_summary.collected_bob),
                      })}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
