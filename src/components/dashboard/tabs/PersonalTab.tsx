import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { useDashboard } from "@/contexts/DashboardContext";
import { useAuthorization } from "@/hooks/useAuthorization";
import { usePersonalOverview } from "@/hooks/usePersonalOverview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown, Clock, Wallet, Briefcase, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeNumber } from "@/lib/queryHelpers";
import {
  toPersonalViewModel,
  remainingHours,
  groupByFunction,
  nextAssignment,
  buildAttentionItems,
  primaryFundAttention,
  expenseIssuesCount,
  buildUpcomingDeadlines,
  buildCurrencyProgress,
  formatDDMMYYYY,
  type AttentionItem,
  type DeadlineItem,
} from "./personalOverviewAggregation";
import type {
  PersonalComplianceWeek,
  ComplianceWeekStatus,
  PersonalFundRequest,
} from "./personalOverviewTypes";

// dash_personal (bugs/dashboard/personal/plan_v2.md §5.4): pestaña Personal -- reescritura
// completa. Un solo hook/RPC (usePersonalOverview -> personal_overview()) alimenta acciones
// pendientes, 3 KPI, carga planificada vs. guardada, carga por encargo/función, cumplimiento
// de timesheets (12 semanas), fondos/gastos y próximos vencimientos. Reemplaza las 6 queryFns
// directas de la versión anterior + PendingHoursAlert (7ma), que se elimina.

const CARD_CLASS = "bg-card/80 backdrop-blur-sm border-border";

const COMPLIANCE_STATUS_KEY: Record<ComplianceWeekStatus, string> = {
  APPROVED: "dashboard.personal.compliance.status.approved",
  PENDING: "dashboard.personal.compliance.status.pending",
  REJECTED: "dashboard.personal.compliance.status.rejected",
  DRAFT: "dashboard.personal.compliance.status.draft",
  NOT_SUBMITTED: "dashboard.personal.compliance.status.notSubmitted",
  NOT_LOGGED: "dashboard.personal.compliance.status.notLogged",
  FUTURE: "dashboard.personal.compliance.status.future",
};

const COMPLIANCE_STATUS_CLASSES: Record<ComplianceWeekStatus, string> = {
  APPROVED: "bg-success/10 text-success border-success/30",
  PENDING: "bg-warning/10 text-warning border-warning/30",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/30",
  DRAFT: "bg-primary/10 text-primary border-primary/30",
  NOT_SUBMITTED: "bg-destructive/10 text-destructive border-destructive/30",
  NOT_LOGGED: "bg-muted text-muted-foreground border-border",
  FUTURE: "bg-muted/50 text-muted-foreground border-border",
};

const FUNCTION_LABEL_KEY: Record<string, string> = {
  "0": "dashboard.personal.function.administrative",
  "1": "dashboard.personal.function.client",
  "2": "dashboard.personal.function.training",
  "3": "dashboard.personal.function.quality",
  null: "dashboard.personal.function.unclassified",
};

// Un solo mapa para gastos y solicitudes: decisiones.md §3, aprobado_gerente se etiqueta
// "Pendiente de contabilidad" en AMBOS dominios (fund_request_expenses.status y
// fund_requests.status), y ningún valor real de ambos enums choca entre sí.
const FUND_STATUS_KEY: Record<string, string> = {
  borrador: "dashboard.personal.funds.status.draft",
  pendiente_aprobacion: "dashboard.personal.funds.status.pendingApproval",
  aprobado_gerente: "dashboard.personal.funds.status.pendingAccounting",
  observado: "dashboard.personal.funds.status.observed",
  rechazado: "dashboard.personal.funds.status.rejected",
  revisado_asistente: "dashboard.personal.funds.status.reviewed",
  fondos_entregados: "dashboard.personal.funds.status.delivered",
  en_liquidacion: "dashboard.personal.funds.status.inSettlement",
  cerrado: "dashboard.personal.funds.status.reviewed",
};

export function PersonalTab() {
  const { t } = useTranslation();
  const { startDateStr, endDateStr } = useDashboard();
  const { can } = useAuthorization();
  const { data, isLoading, isError, error } = usePersonalOverview(startDateStr, endDateStr);
  const [attentionExpanded, setAttentionExpanded] = useState(false);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(null);
  const [historicalOpen, setHistoricalOpen] = useState(false);

  if (isError) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);
    throw new Error(message);
  }

  const payload = useMemo(() => toPersonalViewModel(data), [data]);
  const attentionItems = useMemo(() => buildAttentionItems(payload), [payload]);
  const deadlines = useMemo(() => buildUpcomingDeadlines(payload), [payload]);
  const functionGroups = useMemo(() => groupByFunction(payload.current_week_engagements), [payload]);
  const nextAssign = useMemo(() => nextAssignment(payload.assignments, payload.meta.today), [payload]);
  const fundAttention = useMemo(() => primaryFundAttention(attentionItems), [attentionItems]);
  const expenseIssues = useMemo(() => expenseIssuesCount(payload), [payload]);
  const canApprove = can("timesheet_approval.approve");
  const currentWeekCompliance = useMemo(
    () => payload.compliance_weeks.find((w) => w.week_start === payload.meta.current_week_start) ?? null,
    [payload],
  );

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
        <Skeleton className="h-64 w-full lg:col-span-3" />
      </div>
    );
  }

  if (!payload.meta.has_staff_record) {
    return (
      <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-12 text-center">
        <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">{t("dashboard.personal.empty.noStaffRecord")}</p>
      </div>
    );
  }

  const chartData = payload.workload_weeks.map((w, index) => ({
    label:
      index === 0
        ? t("dashboard.personal.load.thisWeek")
        : t("dashboard.personal.load.weekPlus", { count: index }),
    planned: w.planned_hours,
    saved: w.saved_hours,
  }));

  const shownAttention = attentionExpanded ? attentionItems : attentionItems.slice(0, 5);
  const selectedWeek: PersonalComplianceWeek | null =
    selectedWeekIndex !== null ? payload.compliance_weeks[selectedWeekIndex] ?? null : null;

  return (
    <div className="space-y-4">
      {/* Encabezado ventana operativa/histórica */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs text-muted-foreground">
        <span>{t("dashboard.personal.header.operationalWindow")}</span>
        <span>
          {t("dashboard.personal.header.historicalPeriod", {
            start: formatDDMMYYYY(startDateStr),
            end: formatDDMMYYYY(endDateStr),
          })}
        </span>
      </div>

      {/* Acciones que requieren atención (antes que los KPI -- plan_v2.md §8.1) */}
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {t("dashboard.personal.attention.title")}
            </p>
            {attentionItems.length > 5 && (
              <Button variant="outline" size="sm" onClick={() => setAttentionExpanded((v) => !v)}>
                {attentionExpanded ? t("dashboard.personal.attention.showLess") : t("dashboard.personal.attention.viewAll")}
              </Button>
            )}
          </div>
          {attentionItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dashboard.personal.empty.noAttention")}</p>
          ) : (
            <ul className="space-y-2">
              {shownAttention.map((item, i) => (
                <AttentionRow key={`${item.kind}-${item.weekStart ?? item.code ?? i}`} item={item} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 3 KPI: Esta semana / Próxima asignación / Fondos y rendiciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className={CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t("dashboard.personal.kpi.thisWeek")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold font-mono text-foreground">
              {t("dashboard.personal.kpi.savedOfPlanned", {
                saved: Math.round(payload.current_week.saved_hours),
                planned: Math.round(payload.current_week.planned_hours),
              })}
            </p>
            {payload.current_week.forecast_hours > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("dashboard.personal.kpi.forecastHours", { hours: Math.round(payload.current_week.forecast_hours) })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("dashboard.personal.kpi.remaining", {
                hours: Math.round(remainingHours(payload.current_week.planned_hours, payload.current_week.saved_hours)),
              })}
            </p>
            {payload.current_week.approved_hours > 0 && (
              <p className="text-xs text-success">
                {t("dashboard.personal.kpi.approvedHours", { hours: Math.round(payload.current_week.approved_hours) })}
              </p>
            )}
            {currentWeekCompliance && (
              <p className="text-xs text-muted-foreground">
                {t("dashboard.personal.kpi.weeklyStatus", { status: t(COMPLIANCE_STATUS_KEY[currentWeekCompliance.status]) })}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className={CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              {t("dashboard.personal.kpi.nextAssignment")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {nextAssign ? (
              <>
                <p className="text-lg font-semibold text-foreground truncate">
                  {nextAssign.engagement_code ?? nextAssign.engagement_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.personal.kpi.startsOn", { date: formatDDMMYYYY(nextAssign.start_date) })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.personal.kpi.hoursPerWeek", { hours: Math.round(nextAssign.hours_per_week) })}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("dashboard.personal.kpi.noUpcomingAssignment")}</p>
            )}
          </CardContent>
        </Card>

        <Card className={CARD_CLASS}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              {t("dashboard.personal.kpi.funds")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {fundAttention ? (
              <FundAttentionKpi item={fundAttention} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("dashboard.personal.kpi.noFundActions")}</p>
            )}
            {expenseIssues > 0 && (
              <p className="text-xs text-warning">
                {t("dashboard.personal.kpi.expenseIssues", { count: expenseIssues })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Horas planificadas vs. guardadas */}
      <Card className={CARD_CLASS}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t("dashboard.personal.load.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(value: number, name: unknown) => [
                    t("dashboard.personal.units.hours", { hours: Math.round(value) }),
                    name === "planned" ? t("dashboard.personal.load.planned") : t("dashboard.personal.load.saved"),
                  ]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend
                  formatter={(value) =>
                    value === "planned" ? t("dashboard.personal.load.planned") : t("dashboard.personal.load.saved")
                  }
                  wrapperStyle={{ fontSize: "11px" }}
                />
                <Bar dataKey="planned" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saved" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Carga por encargo y función */}
      <Card className={CARD_CLASS}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t("dashboard.personal.assignments.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payload.current_week_engagements.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">{t("dashboard.personal.empty.noAssignments")}</p>
          ) : (
            <>
              {/* Tabla (>= md) */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">{t("dashboard.personal.assignments.engagement")}</TableHead>
                      <TableHead className="text-xs">{t("dashboard.personal.assignments.function")}</TableHead>
                      <TableHead className="text-xs text-right">{t("dashboard.personal.assignments.assigned")}</TableHead>
                      <TableHead className="text-xs text-right">{t("dashboard.personal.assignments.saved")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payload.current_week_engagements.map((e) => (
                      <TableRow key={e.engagement_id} className="text-sm">
                        <TableCell className="py-2">{e.engagement_code ?? e.engagement_name}</TableCell>
                        <TableCell className="py-2 text-muted-foreground">
                          {t(FUNCTION_LABEL_KEY[String(e.function_code)])}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono">{Math.round(e.assigned_hours)}</TableCell>
                        <TableCell className="py-2 text-right font-mono">{Math.round(e.saved_hours)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="text-sm font-medium">
                      <TableCell className="py-2">{t("dashboard.personal.assignments.total")}</TableCell>
                      <TableCell className="py-2" />
                      <TableCell className="py-2 text-right font-mono">{Math.round(functionGroups.grandTotal.assigned_hours)}</TableCell>
                      <TableCell className="py-2 text-right font-mono">{Math.round(functionGroups.grandTotal.saved_hours)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              {/* Tarjetas (< md) */}
              <div className="md:hidden space-y-2 p-4">
                {payload.current_week_engagements.map((e) => (
                  <div key={e.engagement_id} className="rounded-md border border-border p-2 text-sm">
                    <div className="flex justify-between font-medium">
                      <span className="truncate">{e.engagement_code ?? e.engagement_name}</span>
                      <span className="text-xs text-muted-foreground">{t(FUNCTION_LABEL_KEY[String(e.function_code)])}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>
                        {t("dashboard.personal.assignments.assigned")}: {Math.round(e.assigned_hours)}
                      </span>
                      <span>
                        {t("dashboard.personal.assignments.saved")}: {Math.round(e.saved_hours)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground px-4 pb-3">
                {t("dashboard.personal.assignments.clientTotal")}:{" "}
                {t("dashboard.personal.units.hours", { hours: Math.round(functionGroups.clientTotal.saved_hours) })} ·{" "}
                {t("dashboard.personal.assignments.nonClientTotal")}:{" "}
                {t("dashboard.personal.units.hours", { hours: Math.round(functionGroups.nonClientTotal.saved_hours) })}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cumplimiento de timesheets */}
      <Card className={CARD_CLASS}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t("dashboard.personal.compliance.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {payload.compliance_weeks.map((week, index) => (
              <button
                key={week.week_start}
                type="button"
                onClick={() => setSelectedWeekIndex(index === selectedWeekIndex ? null : index)}
                className="flex flex-col items-center gap-1"
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-1 cursor-pointer",
                    COMPLIANCE_STATUS_CLASSES[week.status],
                    index === selectedWeekIndex && "ring-2 ring-primary",
                  )}
                >
                  {formatDDMMYYYY(week.week_start)}
                </Badge>
              </button>
            ))}
          </div>
          {selectedWeek && (
            <div className="rounded-md border border-border p-3 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {formatDDMMYYYY(selectedWeek.week_start)} – {formatDDMMYYYY(selectedWeek.week_end)}
                </span>
                <Badge variant="outline" className={cn("text-[10px]", COMPLIANCE_STATUS_CLASSES[selectedWeek.status])}>
                  {t(COMPLIANCE_STATUS_KEY[selectedWeek.status])}
                </Badge>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>
                  {t("dashboard.personal.compliance.savedHours")}: {Math.round(selectedWeek.saved_hours)}
                </span>
                <span>
                  {t("dashboard.personal.compliance.approvedHours")}: {Math.round(selectedWeek.approved_hours)}
                </span>
                {selectedWeek.deadline && (
                  <span>
                    {t("dashboard.personal.compliance.deadline")}: {formatDDMMYYYY(selectedWeek.deadline)}
                  </span>
                )}
              </div>
              {selectedWeek.review_notes.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">{t("dashboard.personal.compliance.reviewNotes")}</p>
                  {selectedWeek.review_notes.map((note) => (
                    <p key={note.approval_id} className="text-xs text-muted-foreground">
                      {note.engagement_code ?? note.engagement_name} · {note.activity_code ?? ""}: {note.notes}
                    </p>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link to="/timesheet">{t("dashboard.personal.compliance.openTimesheet")}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fondos y rendiciones / Próximos vencimientos / Análisis histórico, una fila de 3 columnas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        <Card className={CARD_CLASS}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t("dashboard.personal.funds.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {payload.fund_requests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">{t("dashboard.personal.empty.noFunds")}</p>
            ) : (
              payload.fund_requests.map((fr) => (
                <FundRequestBlock key={fr.fund_request_id} fr={fr} t={t} today={payload.meta.today} />
              ))
            )}
          </CardContent>
        </Card>

        <Card className={CARD_CLASS}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              {t("dashboard.personal.deadlines.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deadlines.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">{t("dashboard.personal.empty.noDeadlines")}</p>
            ) : (
              <ul className="space-y-2">
                {deadlines.map((item, i) => (
                  <DeadlineRow key={`${item.kind}-${item.date}-${item.code ?? i}`} item={item} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Collapsible open={historicalOpen} onOpenChange={setHistoricalOpen}>
          <Card className={CARD_CLASS}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between p-4 text-left">
                <span className="text-sm font-medium">{t("dashboard.personal.historical.title")}</span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", historicalOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-2">
                <p className="text-sm">
                  {t("dashboard.personal.historical.savedHours")}:{" "}
                  {t("dashboard.personal.units.hours", { hours: Math.round(payload.historical.saved_hours) })}
                </p>
                {payload.historical.by_engagement.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("dashboard.personal.empty.noHistorical")}</p>
                ) : (
                  <>
                    <p className="text-xs font-medium text-muted-foreground">{t("dashboard.personal.historical.byEngagement")}</p>
                    <ul className="space-y-1">
                      {payload.historical.by_engagement.map((e) => (
                        <li key={e.engagement_id} className="flex justify-between text-xs">
                          <span className="truncate">{e.engagement_code ?? e.engagement_name}</span>
                          <span className="font-mono">
                            {t("dashboard.personal.units.hours", { hours: Math.round(e.saved_hours) })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      {/* Acción de gestión, separada de los KPI personales */}
      {canApprove && (
        <Card className={CARD_CLASS}>
          <CardContent className="py-4 flex items-center justify-between">
            <p className="text-sm font-medium">{t("dashboard.personal.management.title")}</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/timesheet/approvals">{t("dashboard.personal.management.approvals")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const { t } = useTranslation();
  const label = attentionLabel(item, t);
  const linkTo =
    item.kind === "timesheetRejected" || item.kind === "timesheetNotSubmitted"
      ? "/timesheet"
      : item.fundRequestId
        ? `/fund-requests/${item.fundRequestId}/expenses`
        : undefined;

  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-sm text-foreground">{label}</span>
      {linkTo && (
        <Button variant="submit" size="sm" asChild className="shrink-0">
          <Link to={linkTo}>{t("dashboard.personal.attention.resolve")}</Link>
        </Button>
      )}
    </li>
  );
}

function attentionLabel(item: AttentionItem, t: (key: string, opts?: Record<string, unknown>) => string): string {
  switch (item.kind) {
    case "timesheetRejected":
      return t("dashboard.personal.attention.timesheetRejected", { week: formatDDMMYYYY(item.weekStart) });
    case "timesheetNotSubmitted":
      return t("dashboard.personal.attention.timesheetNotSubmitted", {
        week: formatDDMMYYYY(item.weekStart),
        hours: Math.round(safeNumber(item.hours)),
      });
    case "expenseObserved":
      return t("dashboard.personal.attention.expenseObserved", { code: item.code, count: item.count });
    case "expenseRejected":
      return t("dashboard.personal.attention.expenseRejected", { code: item.code, count: item.count });
    case "missingReceipt":
      return t("dashboard.personal.attention.missingReceipt", { code: item.code, count: item.count });
    case "fundDueToday":
      return t("dashboard.personal.attention.fundDueToday", { code: item.code });
    case "fundOverdue":
      return t("dashboard.personal.attention.fundOverdue", { code: item.code });
    case "fundDueSoon":
      return t("dashboard.personal.attention.fundDueSoon", { code: item.code, date: formatDDMMYYYY(item.date) });
    default:
      return "";
  }
}

function FundAttentionKpi({ item }: { item: AttentionItem }) {
  const { t } = useTranslation();
  return <p className="text-sm font-semibold text-warning">{attentionLabel(item, t)}</p>;
}

function DeadlineRow({ item }: { item: DeadlineItem }) {
  const { t } = useTranslation();
  const date = formatDDMMYYYY(item.date);
  let label: string;
  switch (item.kind) {
    case "timesheetDue":
      label = t("dashboard.personal.deadlines.timesheetDue", { date });
      break;
    case "fundDueToday":
      label = t("dashboard.personal.deadlines.fundDueToday");
      break;
    case "fundDueSoon":
      label = t("dashboard.personal.deadlines.fundDueSoon", { date });
      break;
    case "fundOverdue":
      label = t("dashboard.personal.deadlines.fundOverdue");
      break;
    case "assignmentStarts":
      label = t("dashboard.personal.deadlines.assignmentStarts", { code: item.code, date });
      break;
    case "assignmentEnds":
      label = t("dashboard.personal.deadlines.assignmentEnds", { code: item.code, date });
      break;
    case "expenseCorrection":
      label = t("dashboard.personal.deadlines.expenseCorrection", { code: item.code });
      break;
    default:
      label = "";
  }
  return (
    <li className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span className="text-xs text-muted-foreground font-mono">{date}</span>
    </li>
  );
}

function FundRequestBlock({
  fr,
  t,
  today,
}: {
  fr: PersonalFundRequest;
  t: (key: string, opts?: Record<string, unknown>) => string;
  today: string;
}) {
  const blocks = buildCurrencyProgress(fr);
  const dueDateLabel = fr.due_back_date
    ? fr.due_back_date < today
      ? t("dashboard.personal.deadlines.fundOverdue")
      : fr.due_back_date === today
        ? t("dashboard.personal.deadlines.fundDueToday")
        : t("dashboard.personal.deadlines.fundDueSoon", { date: formatDDMMYYYY(fr.due_back_date) })
    : null;

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-2">
          {fr.request_number ?? fr.fund_request_id}
          {FUND_STATUS_KEY[fr.status] && (
            <Badge variant="secondary" className="text-[10px]">
              {t(FUND_STATUS_KEY[fr.status])}
            </Badge>
          )}
        </span>
        {dueDateLabel && (
          <span
            className={cn(
              "text-xs",
              fr.due_back_date && fr.due_back_date <= today ? "text-destructive font-medium" : "text-muted-foreground",
            )}
          >
            {dueDateLabel}
          </span>
        )}
      </div>
      {blocks.map((block) => (
        <div key={block.currency} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {block.currency === "BOB" ? t("dashboard.personal.funds.currency.bob") : t("dashboard.personal.funds.currency.usd")}
          </p>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {(
              [
                "dashboard.personal.funds.disbursed",
                "dashboard.personal.funds.loaded",
                "dashboard.personal.funds.pendingAccounting",
                "dashboard.personal.funds.reviewedAccounting",
              ] as const
            ).map((k) => (
              <span key={k} className="flex-1 text-right">
                {t(k)}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1 text-xs font-mono">
            {[
              block.disbursed_amount,
              block.expenses_loaded_amount,
              block.pending_accounting_amount,
              block.accounting_reviewed_amount,
            ].map((v, i) => (
              <span key={i} className="flex-1 text-right">
                {Math.round(v)}
              </span>
            ))}
          </div>
          <Progress
            value={
              block.expenses_loaded_amount > 0
                ? Math.min((block.accounting_reviewed_amount / block.expenses_loaded_amount) * 100, 100)
                : 0
            }
            className="h-1.5"
          />
        </div>
      ))}
      {fr.expenses.length > 0 && (
        <ul className="space-y-1">
          {fr.expenses.map((e) => (
            <li key={e.expense_id} className="flex items-center justify-between text-xs">
              <span className="truncate">{e.description ?? formatDDMMYYYY(e.expense_date)}</span>
              <span className="flex items-center gap-1 shrink-0">
                {!e.has_attachment && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t("dashboard.personal.funds.withoutReceipt")}
                  </Badge>
                )}
                <Badge
                  variant={e.status === "rechazado" || e.status === "observado" ? "destructive" : "secondary"}
                  className="text-[10px]"
                >
                  {t(FUND_STATUS_KEY[e.status] ?? "dashboard.personal.funds.status.pendingApproval")}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" asChild>
        <Link to={`/fund-requests/${fr.fund_request_id}/expenses`}>{t("dashboard.personal.funds.resolve")}</Link>
      </Button>
    </div>
  );
}
