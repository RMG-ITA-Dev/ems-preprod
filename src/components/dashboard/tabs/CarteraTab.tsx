import { type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useDashboard } from "@/contexts/DashboardContext";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Briefcase,
  Users,
  Clock,
  TrendingUp,
  AlertTriangle,
  CalendarCheck,
  Sparkles,
  FileCheck,
  ShieldCheck,
  DollarSign,
  Receipt,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import { useCarteraOverview } from "@/hooks/useCarteraOverview";
import {
  carteraFiscalYearParams,
  pctChange,
  buildActivityWaterfall,
  categoryBarRows,
  staffingRows,
  consumptionStatus,
  isApprovalStale,
  approvalAgeWeeks,
  consolidateApprovalQueue,
  groupMilestones,
  toCarteraViewModel,
  type CarteraWaterfallRow,
} from "./carteraOverviewAggregation";
import {
  formatBsCompact,
  emptyKind,
  engagementSegmentPct,
  alertCardTone,
  splitNext7Days,
  formatShortDate,
} from "./partnerOverviewAggregation";
import type { CarteraMilestoneKind } from "./carteraOverviewTypes";

// dash_cartera (bugs/dashboard/cartera/plan_v2.md §5.5): pestaña Cartera -- 5 KPI + 5 filas
// de bloques, alimentados por un solo RPC `portfolio_overview`. `CarteraFilters` se exporta
// aparte porque Index.tsx lo renderiza en la fila de pestañas (mismo patrón que
// PartnerFilters/PartnerTab.tsx); ambos comparten la misma queryKey vía React Query.
//
// BicolorBar/ChartContainer se COPIAN localmente desde PartnerTab.tsx (plan_v2.md §15): no
// se extraen a un módulo compartido para no tocar ese archivo, que tiene trabajo en curso
// sin commitear en esta misma rama.

const CHART_COLORS = {
  approved: "hsl(var(--success))",
  pending: "hsl(var(--warning))",
  info: "hsl(var(--info))",
};

/** ResponsiveContainer envuelto: jsdom (vitest) no implementa ResizeObserver y recharts no
 * lo detecta antes de instanciarlo -- sin este guard, cualquier gráfico crashea al montar
 * bajo test. En navegadores reales es un passthrough transparente. */
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

/** Barra bicolor aprobadas (verde) / pendientes (ámbar) sobre el presupuesto. */
function BicolorBar({ approved, pending, budget }: { approved: number; pending: number; budget: number }) {
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
                  {/* Cero decimales en horas (plan_v2.md §8.3) -- MF-05, review.md iteración 1. */}
                  <p>{t("dashboard.cartera.tooltip.approved")}: {Math.round(approved)}</p>
                  <p>{t("dashboard.cartera.tooltip.pending")}: {Math.round(pending)}</p>
                  <p>{t("dashboard.cartera.tooltip.budget")}: {Math.round(budget)}</p>
                  {pctConsumed !== null && <p>{pctConsumed}%</p>}
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

function useCarteraParams() {
  const { startDateStr, endDateStr, selectedYear, selectedCarteraClientId, selectedCarteraPracticaId } = useDashboard();
  const { fiscalYear, fyStart, fyEnd } = carteraFiscalYearParams(selectedYear);
  return { startDateStr, endDateStr, fiscalYear, fyStart, fyEnd, selectedCarteraClientId, selectedCarteraPracticaId };
}

function useScopedCarteraOverview() {
  const params = useCarteraParams();
  const query = useCarteraOverview(
    params.startDateStr,
    params.endDateStr,
    params.fiscalYear,
    params.fyStart,
    params.fyEnd,
    params.selectedCarteraClientId,
    params.selectedCarteraPracticaId,
  );
  return { ...query, ...params };
}

export function CarteraFilters() {
  const { t } = useTranslation();
  const { selectedCarteraClientId, setSelectedCarteraClientId, selectedCarteraPracticaId, setSelectedCarteraPracticaId } =
    useDashboard();
  const { data } = useScopedCarteraOverview();
  const clients = data?.filters.clients ?? [];
  const practicas = data?.filters.practicas ?? [];
  const isFirmWide = data?.meta.scope_kind === "firm";
  const scopeLabel = isFirmWide ? t("dashboard.cartera.scope.firm") : t("dashboard.cartera.scope.own");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary" className="text-[10px]">{scopeLabel}</Badge>
      {/* Selector de Práctica (2026-09-19): solo admin/senior_partner (scope_kind='firm') --
          para el resto, el alcance ya es efectivamente de una sola práctica, sin necesidad
          de filtrar. Post-alcance, mismo patrón que el selector de Cliente. */}
      {isFirmWide && (
        <Select
          value={selectedCarteraPracticaId ?? "__global__"}
          onValueChange={(v) => setSelectedCarteraPracticaId(v === "__global__" ? null : v)}
        >
          <SelectTrigger className="h-9 w-[180px] bg-card/80 backdrop-blur-sm">
            <SelectValue placeholder={t("dashboard.cartera.filters.practica")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__global__">{t("dashboard.cartera.filters.practicaGlobal")}</SelectItem>
            {practicas.map((p) => (
              <SelectItem key={p.practica_id} value={p.practica_id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select
        value={selectedCarteraClientId ?? "__global__"}
        onValueChange={(v) => setSelectedCarteraClientId(v === "__global__" ? null : v)}
      >
        <SelectTrigger className="h-9 w-[180px] bg-card/80 backdrop-blur-sm">
          <SelectValue placeholder={t("dashboard.cartera.filters.client")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__global__">{t("dashboard.cartera.filters.clientGlobal")}</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.client_id} value={c.client_id}>
              {c.client_legal_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CarteraTabSkeleton() {
  return (
    <div className="space-y-4" data-testid="cartera-tab-skeleton">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" data-testid="cartera-kpi-skeleton" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-56 w-full lg:col-span-2" />
        <Skeleton className="h-56 w-full" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-56 w-full lg:col-span-2" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}

const MILESTONE_ICONS: Record<CarteraMilestoneKind, typeof CalendarCheck> = {
  closing: CalendarCheck,
  new_engagement: Sparkles,
  wo_approved: FileCheck,
  risk_approved: ShieldCheck,
  assignment: Users,
  lock_deadline: AlertTriangle,
};

const MILESTONE_LABEL_KEY: Record<CarteraMilestoneKind, string> = {
  closing: "dashboard.cartera.blocks.milestones.kind.closing",
  new_engagement: "dashboard.cartera.blocks.milestones.kind.newEngagement",
  wo_approved: "dashboard.cartera.blocks.milestones.kind.woApproved",
  risk_approved: "dashboard.cartera.blocks.milestones.kind.riskApproved",
  assignment: "dashboard.cartera.blocks.milestones.kind.assignment",
  lock_deadline: "dashboard.cartera.blocks.milestones.kind.lockDeadline",
};

export function CarteraTab() {
  const { t } = useTranslation();
  const { setActiveTab, setSelectedEngagementId } = useDashboard();
  const { data, isLoading, isError, error, isPlaceholderData } = useScopedCarteraOverview();

  if (isLoading) {
    return <CarteraTabSkeleton />;
  }

  // Un solo payload: un error del RPC no se degrada a ceros -- se propaga para que
  // TabErrorBoundary lo capture (plan_v2.md §4.2).
  //
  // BUG reportado 2026-09-18: los errores de Supabase/Postgrest son objetos planos
  // ({ message, details, hint, code }), NO instancias de Error -- `String(error)` sobre un
  // objeto plano da literalmente "[object Object]" y se pierde el mensaje real (mismo
  // patrón de extracción que ya usa src/lib/error-handler.ts:142-146, replicado acá para no
  // arrastrar el toast/AppError de ese módulo a un throw de render).
  if (isError) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);
    throw new Error(message);
  }

  const vm = toCarteraViewModel(data);
  const kind = emptyKind(vm.meta);

  const handleDrillDown = (engagementId: string) => {
    setSelectedEngagementId(engagementId);
    setActiveTab("encargo");
  };

  // Los dos vacíos cortan el render del tablero (plan_v2.md §4.2: el cuerpo completo solo se
  // pinta con scope_count > 0). MF-02 de review.md iteración 1: "filters" antes solo agregaba
  // un mensaje ARRIBA del tablero y seguía pintando los 5 KPIs y todos los bloques en cero --
  // indistinguible de "no hay horas cargadas". El selector que permite deshacer el filtro vive
  // en Index.tsx (<CarteraFilters />), así que sigue visible con el cuerpo cortado.
  if (kind === "scope" || kind === "filters") {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        {t(kind === "scope" ? "dashboard.cartera.empty.scope" : "dashboard.cartera.empty.filters")}
      </div>
    );
  }

  // MF-03 de review.md iteración 1 (SF-03): alertCardTone() solo pondera 2 contadores y la
  // tarjeta muestra 3 -- con "0 · 0 · 3" (solo riesgos por aprobar) el ícono salía en verde.
  // El tono se calcula acá y no se cambia el helper, que es compartido con PartnerTab
  // (plan_v2.md §15: no tocar ese archivo desde esta feature).
  const kpi5Tone =
    vm.kpis.review.pending_risk_count > 0 && vm.kpis.review.over_budget_count === 0
      ? "warning"
      : alertCardTone(vm.kpis.review.over_budget_count, vm.kpis.review.pending_wo_count);
  const engagementsSegment = engagementSegmentPct(vm.kpis.engagements.approved, vm.kpis.engagements.emergency, 0);
  const servicesPct = pctChange(vm.kpis.clients_services.clients, vm.kpis.clients_services.previous_clients);

  const waterfall = buildActivityWaterfall(vm.activities.items, vm.activities.total_budget_hours);
  // BUG reportado 2026-09-18: con items.length > 0 pero total_budget_hours = 0 (horas
  // ejecutadas contra actividades sin matriz de trabajo aprobada), buildActivityWaterfall
  // pone todos los % en 0 (denom > 0 ? ... : 0) -- el gráfico quedaba en blanco sin mostrar
  // ni barras ni el mensaje vacío. hasActivities ahora exige presupuesto real.
  const hasActivities = vm.activities.items.length > 0 && vm.activities.total_budget_hours > 0;

  const catRows = categoryBarRows(vm.categories.items);
  const stfRows = staffingRows(vm.staffing);

  const next7 = splitNext7Days(vm.collections.next_7_days, vm.meta.today);
  const consolidatedApprovals = consolidateApprovalQueue(vm.approval_queue.items);
  const approvalsShown = consolidatedApprovals.slice(0, 5);
  // MF-03 (review.md iteración 1): el "+N más" cuenta PERSONAS distintas que quedaron fuera,
  // tomando el total del servidor (distinct_people, calculado sobre TODAS las líneas
  // pendientes) y no la longitud de la lista recibida -- que ya viene recortada a 20 filas y
  // por lo tanto nunca vería a las personas que el LIMIT dejó afuera.
  const approvalsRemaining = Math.max(vm.approval_queue.distinct_people - approvalsShown.length, 0);
  const finalizedPct =
    vm.finalized_summary.budget_hours > 0
      ? (vm.finalized_summary.executed_hours / vm.finalized_summary.budget_hours) * 100
      : null;
  const expensesPct = vm.expenses.budget_bob > 0 ? (vm.expenses.executed_bob / vm.expenses.budget_bob) * 100 : 0;

  const { past: pastMilestones, upcoming: upcomingMilestones } = groupMilestones(vm.milestones, vm.meta.today);

  return (
    <div className="space-y-6" aria-busy={isPlaceholderData}>
      {isPlaceholderData && (
        <p className="text-xs text-muted-foreground">{t("dashboard.cartera.updating")}</p>
      )}

      {/* Fila 1 -- 5 KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          title={t("dashboard.cartera.kpi.engagements.title")}
          value={vm.kpis.engagements.total}
          subtitle={t("dashboard.cartera.kpi.engagements.breakdown", {
            approved: vm.kpis.engagements.approved,
            emergency: vm.kpis.engagements.emergency,
          })}
          icon={<Briefcase className="h-5 w-5" />}
          footer={
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
              <div className="h-full bg-success" style={{ width: `${engagementsSegment.approved}%` }} />
              <div className="h-full bg-warning" style={{ width: `${engagementsSegment.emergency}%` }} />
            </div>
          }
        />
        <StatCard
          title={t("dashboard.cartera.kpi.clientsServices.title")}
          value={t("dashboard.cartera.kpi.clientsServices.value", {
            clients: vm.kpis.clients_services.clients,
            services: vm.kpis.clients_services.services,
          })}
          subtitle={
            servicesPct === null
              ? t("dashboard.cartera.kpi.clientsServices.noPriorYear")
              : t("dashboard.cartera.kpi.clientsServices.vsPriorYear", { pct: Math.round(servicesPct) })
          }
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          // El título sigue a la categoría de la ficha del llamante ("Horas como Socio",
          // "... como Gerente"); sin categoría asociada cae a un título genérico.
          title={
            vm.kpis.my_role_hours.role_label
              ? t("dashboard.cartera.kpi.roleHours.title", { role: vm.kpis.my_role_hours.role_label })
              : t("dashboard.cartera.kpi.roleHours.titleGeneric")
          }
          value={t("dashboard.cartera.kpi.hoursOfBudget", {
            logged: Math.round(vm.kpis.my_role_hours.approved + vm.kpis.my_role_hours.pending),
            budget: Math.round(vm.kpis.my_role_hours.budget),
          })}
          subtitle={t("dashboard.cartera.fullFiscalYear")}
          icon={<Clock className="h-5 w-5" />}
          footer={
            <BicolorBar
              approved={vm.kpis.my_role_hours.approved}
              pending={vm.kpis.my_role_hours.pending}
              budget={vm.kpis.my_role_hours.budget}
            />
          }
        />
        <StatCard
          title={t("dashboard.cartera.kpi.progress.title")}
          value={`${
            vm.kpis.portfolio_progress.budget > 0
              ? Math.round(((vm.kpis.portfolio_progress.approved + vm.kpis.portfolio_progress.pending) / vm.kpis.portfolio_progress.budget) * 100)
              : 0
          }%`}
          subtitle={t("dashboard.cartera.kpi.progress.subtitle", {
            logged: Math.round(vm.kpis.portfolio_progress.approved + vm.kpis.portfolio_progress.pending),
            budget: Math.round(vm.kpis.portfolio_progress.budget),
          })}
          icon={<TrendingUp className="h-5 w-5" />}
          footer={
            <BicolorBar
              approved={vm.kpis.portfolio_progress.approved}
              pending={vm.kpis.portfolio_progress.pending}
              budget={vm.kpis.portfolio_progress.budget}
            />
          }
        />
        <StatCard
          title={t("dashboard.cartera.kpi.review.title")}
          value={`${vm.kpis.review.over_budget_count} · ${vm.kpis.review.pending_wo_count} · ${vm.kpis.review.pending_risk_count}`}
          subtitle={t("dashboard.cartera.kpi.review.subtitle")}
          icon={<AlertTriangle className={`h-5 w-5 ${kpi5Tone === "destructive" ? "text-destructive" : kpi5Tone === "warning" ? "text-warning" : "text-success"}`} />}
        />
      </div>

      {/* Fila 2 -- Cascada de Actividades */}
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("dashboard.cartera.blocks.activities.title")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("dashboard.cartera.blocks.activities.subtitle")}</p>
          {vm.meta.scope_kind !== "firm" && vm.meta.practica_name && (
            <p className="text-xs text-muted-foreground">
              {t("dashboard.cartera.blocks.activities.practice", { name: vm.meta.practica_name })}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {!hasActivities ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t("dashboard.cartera.blocks.activities.empty")}
            </div>
          ) : (
            <>
              <div className="h-64 w-full" role="img" aria-label={t("dashboard.cartera.blocks.activities.title")}>
                <ActivityWaterfallChart rows={waterfall} t={t} totalBudgetHours={vm.activities.total_budget_hours} />
              </div>
              <table className="sr-only">
                <caption>{t("dashboard.cartera.blocks.activities.tableCaption")}</caption>
                <thead>
                  <tr>
                    <th>{t("dashboard.cartera.engagement")}</th>
                    <th>{t("dashboard.cartera.tooltip.budget")}</th>
                    <th>{t("dashboard.cartera.tooltip.approved")}</th>
                    <th>{t("dashboard.cartera.tooltip.pending")}</th>
                  </tr>
                </thead>
                <tbody>
                  {waterfall.map((row) => (
                    <tr key={row.activity_id}>
                      <td>{row.is_total ? t("dashboard.cartera.blocks.activities.total") : row.description}</td>
                      {/* La tabla es sr-only pero la LEE un lector de pantalla: mismas reglas
                          de formato que la versión visual (cero decimales, §8.3). */}
                      <td>{Math.round(row.budget_hours)}</td>
                      <td>{Math.round(row.approved_hours)}</td>
                      <td>{Math.round(row.pending_hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Fila 3 -- Horas por categoría (2/3) + Presupuesto de personal (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.cartera.blocks.categories.title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("dashboard.cartera.blocks.categories.subtitle")}</p>
          </CardHeader>
          <CardContent>
            {catRows.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t("dashboard.cartera.blocks.categories.empty")}
              </div>
            ) : (
              <div className="space-y-2">
                {catRows.map((row) => {
                  const scale = row.scale_max > 0 ? row.scale_max : 1;
                  const baseLabel = row.category_name ?? t("dashboard.cartera.blocks.categories.uncategorized");
                  // El sufijo solo llega cuando el mismo nombre se repite (varias prácticas
                  // en la vista "Todas"); con una práctica elegida la etiqueta va limpia.
                  const categoryLabel = row.practica_suffix ? `${baseLabel} · ${row.practica_suffix}` : baseLabel;
                  const rowTooltip = [
                    categoryLabel,
                    `${t("dashboard.cartera.tooltip.budget")}: ${Math.round(row.budget_hours)} h`,
                    `${t("dashboard.cartera.tooltip.approved")}: ${Math.round(row.approved_hours)} h`,
                    `${t("dashboard.cartera.tooltip.pending")}: ${Math.round(row.pending_hours)} h`,
                  ].join("\n");
                  return (
                    <div key={row.category_id ?? "uncategorized"} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium truncate">{categoryLabel}</span>
                      </div>
                      <div className="space-y-0.5" title={rowTooltip}>
                        {row.show_budget_row && (
                          <div
                            className="h-2 rounded-sm border border-dashed border-info"
                            style={{ width: `${Math.min(100, (row.budget_hours / scale) * 100)}%` }}
                          />
                        )}
                        <div className="h-2 rounded-sm overflow-hidden flex bg-muted/30" style={{ width: `${Math.min(100, ((row.approved_hours + row.pending_hours) / scale) * 100)}%` }}>
                          <div className="h-full bg-success" style={{ width: `${row.approved_hours + row.pending_hours > 0 ? (row.approved_hours / (row.approved_hours + row.pending_hours)) * 100 : 0}%` }} />
                          <div className="h-full bg-warning" style={{ width: `${row.approved_hours + row.pending_hours > 0 ? (row.pending_hours / (row.approved_hours + row.pending_hours)) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t text-xs font-medium text-muted-foreground">
                  {t("dashboard.cartera.blocks.categories.total", {
                    execPct: vm.categories.total_budget_hours > 0
                      ? Math.round(
                          (catRows.reduce((acc, r) => acc + r.approved_hours + r.pending_hours, 0) /
                            vm.categories.total_budget_hours) *
                            100,
                        )
                      : 0,
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.cartera.blocks.staffing.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("dashboard.cartera.blocks.staffing.columns.category")}</TableHead>
                  <TableHead className="text-xs text-right">{t("dashboard.cartera.blocks.staffing.columns.budgeted")}</TableHead>
                  <TableHead className="text-xs text-right">{t("dashboard.cartera.blocks.staffing.columns.executed")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stfRows.map((row) => (
                  <TableRow key={row.category_id ?? "uncategorized"}>
                    <TableCell className="text-xs">
                      {row.category_name ?? t("dashboard.cartera.blocks.categories.uncategorized")}
                      {row.practica_suffix ? ` · ${row.practica_suffix}` : ""}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {row.budgeted === null ? "—" : row.budgeted}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">{row.executed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {stfRows.some((r) => r.budgeted === null) && (
              <p className="text-[10px] text-muted-foreground mt-2">{t("dashboard.cartera.blocks.staffing.noBudgetNote")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fila 4 -- Facturación / Gastos / Cola, 1/3 cada una */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              {t("dashboard.cartera.blocks.collections.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between"><span>{t("dashboard.cartera.blocks.collections.collected")}</span><span className="font-mono">{formatBsCompact(vm.collections.by_status.collected.amount_bob)}</span></div>
            <div className="flex justify-between"><span>{t("dashboard.cartera.blocks.collections.invoiced")}</span><span className="font-mono">{formatBsCompact(vm.collections.by_status.invoiced.amount_bob)}</span></div>
            <div className="flex justify-between"><span>{t("dashboard.cartera.blocks.collections.inArrears")}</span><span className="font-mono text-destructive">{formatBsCompact(vm.collections.by_status.in_arrears.amount_bob)}</span></div>
            <div className="flex justify-between"><span>{t("dashboard.cartera.blocks.collections.upcoming")}</span><span className="font-mono">{formatBsCompact(vm.collections.by_status.upcoming.amount_bob)}</span></div>
            {vm.collections.avg_collection_days !== null && (
              <p className="text-muted-foreground">{t("dashboard.cartera.blocks.collections.avgDays", { days: Math.round(vm.collections.avg_collection_days) })}</p>
            )}
            <div className="pt-2 border-t">
              <p className="font-medium mb-1">{t("dashboard.cartera.blocks.collections.next7Days")}</p>
              {next7.length === 0 ? (
                <p className="text-muted-foreground">—</p>
              ) : (
                next7.map((item) => (
                  <div key={item.installment_id} className="flex justify-between">
                    <span className="truncate">{item.client_legal_name}</span>
                    <span className="font-mono shrink-0 ml-2">{formatBsCompact(item.amount_bob)}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              {t("dashboard.cartera.blocks.expenses.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <p>
              {t("dashboard.cartera.blocks.expenses.summary", {
                executed: formatBsCompact(vm.expenses.executed_bob),
                budget: formatBsCompact(vm.expenses.budget_bob),
                pct: Math.round(expensesPct),
              })}
            </p>
            <Progress value={Math.min(expensesPct, 100)} className={expensesPct > 100 ? "[&>div]:bg-destructive" : undefined} />
            <p className="text-muted-foreground">
              {t("dashboard.cartera.blocks.expenses.requests", {
                pending: vm.expenses.pending_count,
                approved: vm.expenses.approved_count,
              })}
            </p>
            <div className="pt-2 border-t">
              <p className="font-medium mb-1">{t("dashboard.cartera.blocks.expenses.top3")}</p>
              {vm.expenses.top3.map((item) => (
                <div key={item.engagement_id} className="flex items-center justify-between">
                  <span className="truncate">{item.engagement_code ?? item.client_legal_name}</span>
                  <Badge variant={item.pct > 100 ? "destructive" : "secondary"} className="text-[10px] shrink-0 ml-2">
                    {Math.round(item.pct)}%
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">{t("dashboard.cartera.blocks.expenses.noBudgetNote")}</p>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t("dashboard.cartera.approvalQueue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vm.approval_queue.items.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-xs">
                {t("dashboard.cartera.noApprovals")}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.cartera.blocks.approvalQueue.summary", {
                    hours: Math.round(vm.approval_queue.total_hours),
                    people: vm.approval_queue.distinct_people,
                  })}
                </p>
                {approvalsShown.map((item) => {
                  const weeks = approvalAgeWeeks(item.week_start_date, vm.meta.today);
                  const stale = isApprovalStale(item.week_start_date, vm.meta.today, vm.meta.retro_days);
                  return (
                    <div key={item.approval_id} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                      <div className="text-xs font-medium truncate min-w-0">
                        {item.staff_name} • {item.engagement_code}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {(item.alert || stale) && <AlertTriangle className="h-3 w-3 text-warning" aria-hidden />}
                        <Badge variant="secondary" className="text-[10px]">
                          {t("dashboard.cartera.blocks.approvalQueue.weeks", { count: weeks })}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                {approvalsRemaining > 0 && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    {t("dashboard.cartera.blocks.approvalQueue.more", { count: approvalsRemaining })}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fila 5 -- Horas por encargo (2/3) + Hitos (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.cartera.blocks.engagementHours.title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("dashboard.cartera.blocks.engagementHours.subtitle")}</p>
          </CardHeader>
          <CardContent>
            {vm.engagement_rows.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t("dashboard.cartera.noEngagements")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="table-dense">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("dashboard.cartera.blocks.engagementHours.columns.code")}</TableHead>
                      <TableHead className="text-xs">{t("dashboard.cartera.client")}</TableHead>
                      <TableHead className="text-xs text-right">{t("dashboard.cartera.blocks.engagementHours.columns.hours")}</TableHead>
                      <TableHead className="text-xs text-center">{t("dashboard.cartera.blocks.engagementHours.columns.consumption")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vm.engagement_rows.map((row) => {
                      const totalHours = row.approved_hours + row.pending_hours;
                      const pct = row.budget_hours > 0 ? (totalHours / row.budget_hours) * 100 : 0;
                      const status = row.over_budget ? "over_budget" : consumptionStatus(pct);
                      return (
                        <TableRow
                          key={row.engagement_id}
                          role="button"
                          tabIndex={0}
                          aria-label={t("dashboard.cartera.blocks.engagementHours.open", { name: row.engagement_code ?? row.engagement_name })}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleDrillDown(row.engagement_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") handleDrillDown(row.engagement_id);
                          }}
                        >
                          <TableCell className="text-xs font-medium">{row.engagement_code ?? row.engagement_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">{row.client_legal_name}</TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {Math.round(totalHours)} / {Math.round(row.budget_hours)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-xs font-mono">{Math.round(pct)}%</span>
                              <Badge
                                variant={status === "over_budget" ? "destructive" : status === "at_risk" ? "secondary" : "default"}
                                className="text-[10px] px-1.5"
                              >
                                {t(`dashboard.cartera.blocks.engagementHours.status.${status === "over_budget" ? "overBudget" : status === "at_risk" ? "atRisk" : "onTrack"}`)}
                              </Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.cartera.blocks.milestones.title")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("dashboard.cartera.blocks.milestones.subtitle")}</p>
          </CardHeader>
          <CardContent>
            {pastMilestones.length === 0 && upcomingMilestones.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-xs">
                {t("dashboard.cartera.blocks.milestones.empty")}
              </div>
            ) : (
              <div className="space-y-3">
                <MilestoneGroup titleKey="dashboard.cartera.blocks.milestones.past" items={pastMilestones} />
                <MilestoneGroup titleKey="dashboard.cartera.blocks.milestones.upcoming" items={upcomingMilestones} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fila 6 -- Encargos finalizados (resumen, pedido del operador 2026-09-19) */}
      <Card className="bg-card/80 backdrop-blur-sm">
        <CardContent className="py-4">
          {vm.finalized_summary.count === 0 ? (
            <p className="text-xs text-muted-foreground text-center">
              {t("dashboard.cartera.blocks.finalizedSummary.empty")}
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
              <span className="font-medium text-muted-foreground">
                {t("dashboard.cartera.blocks.finalizedSummary.title")}
              </span>
              <div className="flex flex-wrap items-center gap-6">
                <span>
                  {t("dashboard.cartera.blocks.finalizedSummary.count", { count: vm.finalized_summary.count })}
                </span>
                <span>
                  {finalizedPct === null
                    ? t("dashboard.cartera.blocks.finalizedSummary.noBudget")
                    : t("dashboard.cartera.blocks.finalizedSummary.compliance", { pct: Math.round(finalizedPct) })}
                </span>
                <span>
                  {t("dashboard.cartera.blocks.finalizedSummary.expenses", {
                    amount: formatBsCompact(vm.finalized_summary.executed_expenses_bob),
                  })}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MilestoneGroup({
  titleKey,
  items,
}: {
  titleKey: string;
  items: { kind: CarteraMilestoneKind; date: string; engagement_code: string | null; weeks: number | null }[];
}) {
  const { t, i18n } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{t(titleKey)}</p>
      <div className="space-y-1">
        {items.map((item, idx) => {
          const Icon = MILESTONE_ICONS[item.kind];
          return (
            <div key={`${item.kind}-${idx}`} className="flex items-center gap-2 text-xs">
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
              {/* MF-05 (review.md iteración 1): `date` se interpolaba CRUDO (ISO
                  "2026-10-20") dentro del texto, y además la misma fecha se repetía ya
                  formateada en el extremo derecho. Ahora la etiqueta no lleva fecha (la
                  clave lockDeadline dejó de usar {{date}}) y lo que se interpola, si alguna
                  clave futura lo necesita, ya viene en DD/MM/YYYY. */}
              <span className="truncate">
                {t(MILESTONE_LABEL_KEY[item.kind], {
                  code: item.engagement_code ?? "",
                  date: formatShortDate(item.date, i18n.language),
                })}
              </span>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                {formatShortDate(item.date, i18n.language)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Alto fijo del wrapper h-64 (Tailwind: 16rem = 256px) -- ver el div que envuelve este
 * componente en CarteraTab. Mantenerlos sincronizados si alguno cambia. */
const ACTIVITY_WATERFALL_HEIGHT = 256;

function ActivityWaterfallChart({
  rows,
  t,
  totalBudgetHours,
}: {
  rows: CarteraWaterfallRow[];
  t: (key: string, opts?: Record<string, unknown>) => string;
  totalBudgetHours: number;
}) {
  // BUG reportado 2026-09-18: Recharts ResponsiveContainer mide su contenedor vía
  // ResizeObserver dentro de un efecto -- bajo React.StrictMode (activo en main.tsx), el
  // doble-invocado de efectos en desarrollo puede perder esa primera medición y el
  // contenedor queda pegado en "sin medir" para siempre (el DOM real mostraba
  // <div class="recharts-responsive-container" style="width:100%;height:100%"></div>
  // completamente vacío, sin <svg>). Se mide el contenedor a mano con
  // useContainerWidth() (mismo hook que ya usa el Scheduler para esto, src/hooks/
  // useContainerWidth.ts) y se le pasan ancho/alto en píxeles reales a BarChart en vez de
  // depender de ResponsiveContainer -- determinístico, sin la carrera del ResizeObserver.
  const [containerRef, width] = useContainerWidth<HTMLDivElement>();
  const data = rows.map((r) => ({
    name: r.is_total ? t("dashboard.cartera.blocks.activities.total") : r.description,
    budget_offset: r.budget_offset_pct,
    budget_value: r.budget_pct,
    exec_offset: r.exec_offset_pct,
    approved_value: r.approved_pct,
    pending_value: r.pending_pct,
    raw: r,
  }));

  return (
    <div ref={containerRef} className="h-full w-full">
      {width !== null && width > 0 && (
    <BarChart width={width} height={ACTIVITY_WATERFALL_HEIGHT} data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
      <YAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
      <ReferenceLine x={data.length > 1 ? data[data.length - 2]?.name : undefined} stroke="hsl(var(--border))" />
      <Tooltip
        content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const row = (payload[0]?.payload as { raw: CarteraWaterfallRow })?.raw;
          if (!row) return null;
          return (
            <div className="rounded-md border bg-card px-2 py-1.5 text-xs shadow-md space-y-0.5">
              <p className="font-medium">{row.is_total ? t("dashboard.cartera.blocks.activities.total") : row.description}</p>
              <p>{t("dashboard.cartera.tooltip.approved")}: {Math.round(row.approved_hours)} h</p>
              <p>{t("dashboard.cartera.tooltip.pending")}: {Math.round(row.pending_hours)} h</p>
              <p>{t("dashboard.cartera.tooltip.budget")}: {Math.round(row.budget_hours)} h</p>
              <p>{t("dashboard.cartera.tooltip.ofPortfolio", { pct: Math.round(row.budget_pct) })}</p>
              {/* BUG reportado 2026-09-18: mostraba exec_offset_pct+approved_pct+pending_pct
                  (un %, 0-100) rotulado con sufijo "h" -- ahora usa cumulative_hours (horas
                  reales), coincide con el formato de decisiones.md §5.1.1 ("528 h / 1.200 h"). */}
              <p>{t("dashboard.cartera.tooltip.cumulative", { cum: Math.round(row.cumulative_hours), total: Math.round(totalBudgetHours) })}</p>
            </div>
          );
        }}
      />
      <Bar dataKey="budget_offset" stackId="budget" fill="transparent" isAnimationActive={false} />
      <Bar
        dataKey="budget_value"
        stackId="budget"
        fill="transparent"
        stroke={CHART_COLORS.info}
        strokeDasharray="4 2"
        isAnimationActive={false}
      />
      <Bar dataKey="exec_offset" stackId="exec" fill="transparent" isAnimationActive={false} />
      <Bar dataKey="approved_value" stackId="exec" fill={CHART_COLORS.approved} isAnimationActive={false} />
      <Bar dataKey="pending_value" stackId="exec" fill={CHART_COLORS.pending} isAnimationActive={false} />
    </BarChart>
      )}
    </div>
  );
}
