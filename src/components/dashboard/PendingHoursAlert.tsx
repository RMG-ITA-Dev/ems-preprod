import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useDashboard } from "@/contexts/DashboardContext";
import { useWeekStatuses, type WeekStatus, type WeekStatusCode } from "@/hooks/useWeekStatuses";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { AlertCircle, ChevronDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";

const MAX_DETAIL = 12;

// Statuses that are actionable (show the alert)
const ACTIONABLE_STATUSES: WeekStatusCode[] = [
  'NOT_LOGGED', 'NOT_SUBMITTED', 'DRAFT', 'REJECTED', 'PENDING_APPROVAL'
];

// Red group
const RED_STATUSES: WeekStatusCode[] = ['NOT_LOGGED', 'NOT_SUBMITTED', 'DRAFT'];

function getStatusBadgeClasses(status: WeekStatusCode): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700';
    case 'PENDING_APPROVAL':
      return 'bg-warning/10 text-warning border-warning/30';
    case 'REJECTED':
      return 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-700';
    case 'CURRENT':
      return 'bg-primary/10 text-primary border-primary/30';
    case 'NOT_LOGGED':
    case 'NOT_SUBMITTED':
    case 'DRAFT':
      return 'bg-destructive/10 text-destructive border-destructive/30';
    default:
      return '';
  }
}

const STATUS_LABEL_KEYS: Record<WeekStatusCode, string> = {
  APPROVED: "dashboard.personal.pendingHours.statusApproved",
  PENDING_APPROVAL: "dashboard.personal.pendingHours.statusPending",
  REJECTED: "dashboard.personal.pendingHours.statusRejected",
  DRAFT: "dashboard.personal.pendingHours.statusDraft",
  NOT_SUBMITTED: "dashboard.personal.pendingHours.statusNotSubmitted",
  NOT_LOGGED: "dashboard.personal.pendingHours.statusNotLogged",
  CURRENT: "dashboard.personal.pendingHours.statusCurrent",
  FUTURE: "dashboard.personal.pendingHours.statusCurrent",
};

function getStatusLabel(status: WeekStatusCode, t: (key: string) => string): string {
  return t(STATUS_LABEL_KEYS[status]);
}

export function PendingHoursAlert() {
  const { t, i18n } = useTranslation();
  const { staffRecord } = useCurrentStaff();
  const { startDateStr, endDateStr } = useDashboard();
  const dateLocale = i18n.language === "es" ? es : enUS;
  const [open, setOpen] = useState(false);

  const { data: weekStatuses } = useWeekStatuses(
    staffRecord?.staff_id,
    startDateStr,
    endDateStr
  );

  if (!weekStatuses || weekStatuses.length === 0) return null;

  // Filter out FUTURE and CURRENT for counting
  const pastWeeks = weekStatuses.filter(
    w => w.status !== 'FUTURE' && w.status !== 'CURRENT'
  );

  // Count by group
  const redCount = pastWeeks.filter(w => RED_STATUSES.includes(w.status)).length;
  const rejectedCount = pastWeeks.filter(w => w.status === 'REJECTED').length;
  const pendingCount = pastWeeks.filter(w => w.status === 'PENDING_APPROVAL').length;
  const approvedCount = pastWeeks.filter(w => w.status === 'APPROVED').length;

  // Total missing hours from red group
  const totalMissingHours = pastWeeks
    .filter(w => RED_STATUSES.includes(w.status))
    .reduce((sum, w) => sum + w.missing_hours, 0);

  // If all past weeks are approved, don't show alert
  const hasActionable = pastWeeks.some(w => ACTIONABLE_STATUSES.includes(w.status));
  if (!hasActionable) return null;

  // Detail table: show non-FUTURE weeks, most recent first
  const detailWeeks = weekStatuses
    .filter(w => w.status !== 'FUTURE')
    .reverse()
    .slice(0, MAX_DETAIL);

  const moreCount = weekStatuses.filter(w => w.status !== 'FUTURE').length - MAX_DETAIL;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="py-4">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-start gap-3 text-left focus:outline-none"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-warning mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {t("dashboard.personal.pendingHours.title")}
                </p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {redCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive" />
                      {t("dashboard.personal.pendingHours.summaryNotLogged", {
                        count: redCount,
                        hours: totalMissingHours.toFixed(1),
                      })}
                    </span>
                  )}
                  {rejectedCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-violet-700 dark:text-violet-400 font-medium">
                      <span className="inline-block w-2 h-2 rounded-full bg-violet-500 dark:bg-violet-400" />
                      {t("dashboard.personal.pendingHours.summaryRejected", {
                        count: rejectedCount,
                      })}
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-warning font-medium">
                      <span className="inline-block w-2 h-2 rounded-full bg-warning" />
                      {t("dashboard.personal.pendingHours.summaryPending", {
                        count: pendingCount,
                      })}
                    </span>
                  )}
                  {approvedCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
                      <span className="inline-block w-2 h-2 rounded-full bg-success" />
                      {t("dashboard.personal.pendingHours.summaryApproved", {
                        count: approvedCount,
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/timesheet">
                    {t("dashboard.personal.pendingHours.goToTimesheet")}
                  </Link>
                </Button>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    open && "rotate-180"
                  )}
                />
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3">
            <div className="rounded-md border">
              <Table className="table-dense">
                <TableHeader>
                  <TableRow>
                    <TableHead>{i18n.language === "es" ? "Semana" : "Week"}</TableHead>
                    <TableHead>{t("dashboard.personal.pendingHours.status")}</TableHead>
                    <TableHead className="text-right">{t("dashboard.personal.pendingHours.expected")}</TableHead>
                    <TableHead className="text-right">{t("dashboard.personal.pendingHours.logged")}</TableHead>
                    <TableHead className="text-right">{t("dashboard.personal.pendingHours.missing")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailWeeks.map((week) => (
                    <TableRow key={week.week_start}>
                      <TableCell>
                        {t("dashboard.personal.pendingHours.weekOf", {
                          date: format(parseISO(week.week_start), "d MMM yyyy", { locale: dateLocale }),
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] px-1.5 py-0", getStatusBadgeClasses(week.status))}
                        >
                          {getStatusLabel(week.status, t)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {week.expected_hours.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {week.total_logged_hours.toFixed(1)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono font-semibold",
                        week.missing_hours > 0 ? "text-warning" : "text-muted-foreground"
                      )}>
                        {week.missing_hours.toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {moreCount > 0 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {t("dashboard.personal.pendingHours.andMore", { count: moreCount })}
              </p>
            )}
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}
