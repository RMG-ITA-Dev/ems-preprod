import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDashboard } from "@/contexts/DashboardContext";
import { useDashboardEngagements } from "@/hooks/useDashboardEngagements";
import { useEncargoOverview } from "@/hooks/useEncargoOverview";
import { EngagementSelector } from "@/components/dashboard/EngagementSelector";
import { EngagementStaffingDialog } from "@/components/dashboard/EngagementStaffingDialog";
import { StaffHoursDetailDialog } from "@/components/dashboard/StaffHoursDetailDialog";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  Users,
  FolderKanban,
  CalendarClock,
  CheckCircle2,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { safeNumber } from "@/lib/queryHelpers";
import {
  groupBreakdownByCategory,
  buildStaffingRows,
  buildTeamRows,
  formatDaysSince,
  staffingRatioLabel,
  approvalQueueSeverity,
  type TeamRoleKey,
} from "./encargoOverviewAggregation";
import { formatShortDate } from "./partnerOverviewAggregation";
import type { ExpenseItem, RequestDisplayStatus } from "./encargoOverviewTypes";

// dash_encargo (bugs/dashboard/encargo/plan_v2.md §5.4): pestaña Encargo -- 4 KPI sin
// montos, consumo de presupuesto, desglose Categoría->Actividad, equipo responsable,
// staffing (semana actual + modal de 9 semanas precargadas) y gastos, alimentados por un
// solo RPC `engagement_overview`. EncargoTab es el único dueño de datos de la pestaña --
// EngagementSelector pasa a ser presentacional (useDashboardEngagements() vive acá).

const TEAM_LABEL_KEY: Record<TeamRoleKey, string> = {
  partner: "dashboard.encargo.team.partner",
  manager: "dashboard.encargo.team.manager",
  encargado: "dashboard.encargo.team.encargado",
  specialist_it: "dashboard.encargo.team.specialistIt",
  specialist_tax: "dashboard.encargo.team.specialistTax",
  sqr: "dashboard.encargo.team.sqr",
};

const REQUEST_STATUS_KEY: Record<RequestDisplayStatus, string> = {
  pendiente_gerente: "dashboard.encargo.expenses.status.pendingManager",
  aprobado_pendiente_desembolso: "dashboard.encargo.expenses.status.pendingDisbursement",
  desembolsado: "dashboard.encargo.expenses.status.disbursed",
  observado: "dashboard.encargo.expenses.status.observed",
  rechazado: "dashboard.encargo.expenses.status.rejected",
};

const REQUEST_STATUS_VARIANT: Record<RequestDisplayStatus, "default" | "secondary" | "destructive"> = {
  pendiente_gerente: "secondary",
  aprobado_pendiente_desembolso: "secondary",
  desembolsado: "default",
  observado: "secondary",
  rechazado: "destructive",
};

export function EncargoTab() {
  const { t, i18n } = useTranslation();
  const { selectedEngagementId, setSelectedEngagementId, startDateStr, endDateStr } = useDashboard();
  const [detailOpen, setDetailOpen] = useState(false);
  const [staffingOpen, setStaffingOpen] = useState(false);
  const [accessChangedNotice, setAccessChangedNotice] = useState(false);

  const { data: engagements, isLoading: engagementsLoading } = useDashboardEngagements();
  const { data, isLoading, isError, error } = useEncargoOverview(selectedEngagementId, startDateStr, endDateStr);

  // selected_accessible=false (encargo fuera de alcance/inexistente): limpiar la selección
  // y avisar -- la lista sigue usable, NO es un error de pestaña ni una lista vacía
  // (plan_v2.md §4.5).
  useEffect(() => {
    if (data?.meta.selected_accessible === false && selectedEngagementId) {
      setSelectedEngagementId(null);
      setAccessChangedNotice(true);
    }
  }, [data, selectedEngagementId, setSelectedEngagementId]);

  // Autoselección (corrección post-ejecución acordada con el operador, no estaba en
  // decisiones.md original): al montar, si no hay selección y la lista de encargos ya
  // cargó, preselecciona el de `end_date` más próxima -- incluidos vencidos, NULL al final
  // (nunca se autoseleccionan si hay al menos uno con end_date no nulo). El orden visible
  // del selector (por engagement_code) no cambia -- este cálculo es aparte. Corre una sola
  // vez por montaje del componente: `autoSelectedRef` queda en true apenas ya hay una
  // selección (venía de otra pestaña/sesión) o apenas se autoselecciona, y el handler de
  // selección manual también lo marca, para no pelear con una deselección intencional del
  // usuario.
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (selectedEngagementId) {
      autoSelectedRef.current = true;
      return;
    }
    if (!engagements || engagements.length === 0) return;
    autoSelectedRef.current = true;

    const withEndDate = engagements.filter((e) => e.end_date !== null) as (typeof engagements[number] & {
      end_date: string;
    })[];
    if (withEndDate.length === 0) return;

    const earliest = withEndDate.reduce((min, e) => (e.end_date < min.end_date ? e : min));
    setSelectedEngagementId(earliest.engagement_id);
  }, [engagements, selectedEngagementId, setSelectedEngagementId]);

  const handleSelectEngagement = (id: string | null) => {
    autoSelectedRef.current = true;
    setAccessChangedNotice(false);
    setSelectedEngagementId(id);
  };

  // Un solo payload: un error del RPC no se degrada a ceros -- se propaga para que
  // TabErrorBoundary lo capture (mismo patrón que CarteraTab.tsx).
  if (isError) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);
    throw new Error(message);
  }

  const detail = data?.detail ?? null;

  return (
    <div className="space-y-4">
      <EngagementSelector
        options={engagements ?? []}
        value={selectedEngagementId}
        onChange={handleSelectEngagement}
        isLoading={engagementsLoading}
      />

      {accessChangedNotice && !selectedEngagementId && (
        <p className="text-sm text-warning">{t("dashboard.encargo.accessChanged")}</p>
      )}

      {!selectedEngagementId ? (
        <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-12 text-center">
          <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground">{t("dashboard.encargo.selectEngagement")}</h3>
          <p className="text-muted-foreground mt-2">{t("dashboard.encargo.noSelection")}</p>
        </div>
      ) : isLoading || !detail ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
          <Skeleton className="h-16 w-full sm:col-span-2 lg:col-span-4" />
          <Skeleton className="h-64 w-full lg:col-span-2" />
          <Skeleton className="h-64 w-full lg:col-span-2" />
        </div>
      ) : (
        <EncargoDetail
          detail={detail}
          today={data!.meta.today}
          alertWeeks={data!.meta.alert_weeks}
          locale={i18n.language}
          onViewHoursDetail={() => setDetailOpen(true)}
          onViewOtherWeeks={() => setStaffingOpen(true)}
        />
      )}

      <StaffHoursDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        engagementId={selectedEngagementId}
        engagementCode={data?.meta.engagement_code ?? ""}
      />
      {detail && (
        <EngagementStaffingDialog
          open={staffingOpen}
          onOpenChange={setStaffingOpen}
          people={detail.staffing.people}
          weeks={detail.staffing.weeks}
        />
      )}
    </div>
  );
}

function EncargoDetail({
  detail,
  alertWeeks,
  locale,
  onViewHoursDetail,
  onViewOtherWeeks,
}: {
  detail: NonNullable<ReturnType<typeof useEncargoOverview>["data"]>["detail"];
  today: string;
  alertWeeks: number;
  locale: string;
  onViewHoursDetail: () => void;
  onViewOtherWeeks: () => void;
}) {
  const { t } = useTranslation();
  if (!detail) return null;

  const { kpis, budget, breakdown, team, staffing, expenses, approval_queue } = detail;
  const consumedPercent = Math.round(safeNumber(budget.consumed_percent));
  const isOverBudget = consumedPercent > 100;

  const currentRatio = staffingRatioLabel(kpis.staffing.current.logged, kpis.staffing.current.assigned);
  const previousRatio = staffingRatioLabel(kpis.staffing.previous.logged, kpis.staffing.previous.assigned);

  const lastEntryLabel = formatDaysSince(kpis.last_time_entry.days);
  const lastApprovalLabel = formatDaysSince(kpis.last_approval.days);
  const formatKpiDate = (label: ReturnType<typeof formatDaysSince>) =>
    label.kind === "never"
      ? t("dashboard.encargo.kpis.never")
      : label.kind === "today"
        ? t("dashboard.encargo.kpis.today")
        : t("dashboard.encargo.kpis.daysAgo", { count: label.count });

  const groupedBreakdown = groupBreakdownByCategory(breakdown);
  const teamRows = buildTeamRows(team);
  const currentWeek = staffing.weeks.find((w) => w.offset === 0);
  const staffingRows = buildStaffingRows(staffing.people, currentWeek);

  // Cola de Aprobación (corrección post-ejecución #2): mismo patrón "top 5 + N más" que la
  // de dash_cartera (CarteraTab.tsx) -- "+N más" cuenta personas que quedaron fuera de las 5
  // mostradas, no líneas.
  const approvalItemsShown = approval_queue.items.slice(0, 5);
  const approvalRemaining = Math.max(approval_queue.distinct_people - approvalItemsShown.length, 0);
  const expensesPercent = Math.round(safeNumber(expenses.executed_percent));

  // Solo se llama para expenses.pending (pendiente_aprobacion | aprobado_gerente) --
  // revisado_asistente nunca llega acá, esos ítems viven en expenses.approved.
  const expenseStatusLabel = (status: ExpenseItem["status"]) =>
    status === "aprobado_gerente"
      ? t("dashboard.encargo.expenses.status.pendingAccounting")
      : t("dashboard.encargo.expenses.status.pendingManager");

  return (
    <>
      {/* 4 KPI cards, ninguna con montos (decisiones.md §4.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t("dashboard.encargo.kpis.staffing")}
          icon={<Users className="h-5 w-5" />}
          value={
            currentRatio.noAssignments
              ? t("dashboard.encargo.kpis.noAssignments")
              : `${currentRatio.logged}/${currentRatio.assigned}`
          }
          subtitle={`${t("dashboard.encargo.kpis.thisWeek")} · ${t("dashboard.encargo.kpis.lastWeek")}: ${
            previousRatio.noAssignments ? t("dashboard.encargo.kpis.noAssignments") : `${previousRatio.logged}/${previousRatio.assigned}`
          }`}
        />
        <StatCard
          title={t("dashboard.encargo.kpis.pendingApproval")}
          icon={<Clock className="h-5 w-5" />}
          value={`${Math.round(kpis.pending_approval.last_week_hours)}${t("dashboard.encargo.units.hours")}`}
          subtitle={t("dashboard.encargo.kpis.pendingLastWeek")}
          footer={
            kpis.pending_approval.aged_hours > 0 ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {t("dashboard.encargo.kpis.agedPending", {
                  hours: Math.round(kpis.pending_approval.aged_hours),
                  weeks: 3,
                })}
              </p>
            ) : undefined
          }
        />
        <StatCard
          title={t("dashboard.encargo.kpis.lastTimeEntry")}
          icon={<CalendarClock className="h-5 w-5" />}
          value={formatKpiDate(lastEntryLabel)}
        />
        <StatCard
          title={t("dashboard.encargo.kpis.lastApproval")}
          icon={<CheckCircle2 className="h-5 w-5" />}
          value={formatKpiDate(lastApprovalLabel)}
        />
      </div>

      {/* Consumo de presupuesto -- sin cambios funcionales (decisiones.md §4.2) */}
      <Card className="bg-card/80 backdrop-blur-sm border-border">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Progress
              value={Math.min(consumedPercent, 100)}
              className={cn(
                "h-4 flex-1",
                isOverBudget ? "[&>div]:bg-destructive" : consumedPercent > 80 ? "[&>div]:bg-warning" : "",
              )}
            />
            <span
              className={cn(
                "text-lg font-bold font-mono min-w-[60px] text-right",
                isOverBudget ? "text-destructive" : consumedPercent > 80 ? "text-warning" : "text-foreground",
              )}
            >
              {consumedPercent}%
            </span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>
              {Math.round(budget.actual_hours)}
              {t("dashboard.encargo.units.hours")} {t("dashboard.encargo.used")}
            </span>
            <span>
              {Math.round(budget.budget_hours)}
              {t("dashboard.encargo.units.hours")} {t("dashboard.encargo.budgeted")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Desglose Categoría->Actividad (2/3) + Equipo/Staffing (1/3 cada bloque, misma col) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/80 backdrop-blur-sm border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">{t("dashboard.encargo.categoryActivity.title")}</CardTitle>
            <Button variant="outline" size="sm" className="text-xs h-7 gap-1 shrink-0" onClick={onViewHoursDetail}>
              <Users className="h-3 w-3" />
              {t("dashboard.encargo.viewHoursDetail")}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {groupedBreakdown.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">{t("category.name")}</TableHead>
                    <TableHead className="text-xs text-right">{t("dashboard.encargo.budget")}</TableHead>
                    <TableHead className="text-xs text-right">{t("dashboard.encargo.actual")}</TableHead>
                    <TableHead className="text-xs text-right">{t("dashboard.encargo.variance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedBreakdown.map((group) => (
                    <Fragment key={group.category_id ?? "none"}>
                      <TableRow className="text-sm font-medium">
                        <TableCell className="py-2">{group.category_name ?? "—"}</TableCell>
                        <TableCell className="py-2 text-right font-mono">{Math.round(group.budget_hours)}</TableCell>
                        <TableCell className="py-2 text-right font-mono">{Math.round(group.actual_hours)}</TableCell>
                        <TableCell
                          className={cn(
                            "py-2 text-right font-mono",
                            group.variance_hours >= 0 ? "text-success" : "text-destructive",
                          )}
                        >
                          {group.variance_hours >= 0 ? "+" : ""}
                          {Math.round(group.variance_hours)}
                        </TableCell>
                      </TableRow>
                      {group.activities.map((activity) => (
                        <TableRow key={activity.activity_id} className="text-sm text-muted-foreground">
                          <TableCell className="py-1.5 pl-6">{activity.activity_description ?? activity.activity_code}</TableCell>
                          <TableCell className="py-1.5 text-right font-mono">{Math.round(activity.budget_hours)}</TableCell>
                          <TableCell className="py-1.5 text-right font-mono">{Math.round(activity.actual_hours)}</TableCell>
                          <TableCell
                            className={cn(
                              "py-1.5 text-right font-mono",
                              activity.variance_hours >= 0 ? "text-success" : "text-destructive",
                            )}
                          >
                            {activity.variance_hours >= 0 ? "+" : ""}
                            {Math.round(activity.variance_hours)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">{t("dashboard.encargo.noData")}</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-card/80 backdrop-blur-sm border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t("dashboard.encargo.team.title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {teamRows.map(({ role, member }) => (
                <div key={role} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t(TEAM_LABEL_KEY[role])}</span>
                  <span className="font-medium truncate">{member?.display_name ?? "—"}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card/80 backdrop-blur-sm border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">{t("dashboard.encargo.staffing.title")}</CardTitle>
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1 shrink-0" onClick={onViewOtherWeeks}>
                <Users className="h-3 w-3" />
                {t("dashboard.encargo.staffing.otherWeeks")}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {staffingRows.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">{t("dashboard.encargo.hoursDetail.staffName")}</TableHead>
                      <TableHead className="text-xs text-right">{t("dashboard.encargo.staffing.loaded")}</TableHead>
                      <TableHead className="text-xs text-right">{t("dashboard.encargo.staffing.utilized")}</TableHead>
                      <TableHead className="text-xs text-right">{t("dashboard.encargo.staffing.assigned")}</TableHead>
                      <TableHead className="text-xs text-center" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffingRows.map((row) => (
                      <TableRow key={row.staff_id} className="text-sm">
                        <TableCell className="py-2">{row.display_name}</TableCell>
                        <TableCell className="py-2 text-right font-mono">{Math.round(row.logged_hours)}</TableCell>
                        <TableCell className="py-2 text-right font-mono">{Math.round(row.used_hours)}</TableCell>
                        <TableCell className="py-2 text-right font-mono">{Math.round(row.assigned_hours)}</TableCell>
                        <TableCell className="py-2 text-center">
                          {row.zero_week_alert && (
                            <AlertTriangle
                              className="h-3.5 w-3.5 text-warning inline-block"
                              aria-label={t("dashboard.encargo.staffing.zeroWeekAlert")}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8 text-sm">{t("dashboard.encargo.staffing.noRows")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Gastos (2/3) + Cola de Aprobación por persona (1/3) -- corrección post-ejecución #2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-card/80 backdrop-blur-sm border-border lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            {t("dashboard.encargo.expenses.title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("dashboard.encargo.expenses.amountsInBob")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center gap-4">
              <Progress value={Math.min(expensesPercent, 100)} className={expensesPercent > 100 ? "[&>div]:bg-destructive" : undefined} />
              <span className="text-sm font-mono min-w-[48px] text-right">{expensesPercent}%</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>
                {t("dashboard.encargo.expenses.executed")}: {Math.round(expenses.executed_bob)}
              </span>
              <span>
                {t("dashboard.encargo.expenses.budgeted")}: {Math.round(expenses.budget_bob)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-medium mb-2">{t("dashboard.encargo.expenses.approvedRecent")}</p>
              {expenses.approved.length === 0 ? (
                <p className="text-muted-foreground text-xs">{t("dashboard.encargo.expenses.empty")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {expenses.approved.map((item) => (
                    <li key={item.fre_id} className="flex justify-between gap-2 text-xs">
                      <span className="truncate">{item.description ?? formatShortDate(item.expense_date, locale)}</span>
                      <span className="font-mono shrink-0">{Math.round(item.amount_bob)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="font-medium mb-2">{t("dashboard.encargo.expenses.requests")}</p>
              {expenses.requests.length === 0 ? (
                <p className="text-muted-foreground text-xs">{t("dashboard.encargo.expenses.empty")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {expenses.requests.map((item) => (
                    <li key={item.fr_wo_id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{item.request_number ?? formatShortDate(item.submitted_at, locale)}</span>
                      <Badge variant={REQUEST_STATUS_VARIANT[item.display_status]} className="text-[10px] shrink-0">
                        {t(REQUEST_STATUS_KEY[item.display_status])}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="font-medium mb-2">{t("dashboard.encargo.expenses.pendingExpenses")}</p>
              {expenses.pending.length === 0 ? (
                <p className="text-muted-foreground text-xs">{t("dashboard.encargo.expenses.empty")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {expenses.pending.map((item) => (
                    <li key={item.fre_id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{item.description ?? formatShortDate(item.expense_date, locale)}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {expenseStatusLabel(item.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 backdrop-blur-sm border-border lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t("dashboard.encargo.approvalQueue.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {approval_queue.items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-xs">{t("dashboard.encargo.approvalQueue.empty")}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t("dashboard.encargo.approvalQueue.summary", {
                  hours: Math.round(approval_queue.total_hours),
                  people: approval_queue.distinct_people,
                })}
              </p>
              {approvalItemsShown.map((item) => {
                const severity = approvalQueueSeverity(item.weeks_old, alertWeeks, item.alert);
                return (
                  <div key={item.staff_id} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                    <div className="text-xs font-medium truncate min-w-0">
                      {item.staff_name} · {Math.round(item.hours)}{t("dashboard.encargo.units.hours")}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {severity !== "ok" && (
                        <AlertTriangle
                          className={cn("h-3 w-3", severity === "critical" ? "text-destructive" : "text-warning")}
                          aria-hidden
                        />
                      )}
                      <Badge
                        variant={severity === "critical" ? "destructive" : "secondary"}
                        className="text-[10px]"
                        aria-label={severity === "critical" ? t("dashboard.encargo.approvalQueue.critical") : undefined}
                      >
                        {t("dashboard.encargo.approvalQueue.weeks", { count: item.weeks_old })}
                      </Badge>
                    </div>
                  </div>
                );
              })}
              {approvalRemaining > 0 && (
                <p className="text-[10px] text-muted-foreground text-center">
                  {t("dashboard.encargo.approvalQueue.more", { count: approvalRemaining })}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </>
  );
}
