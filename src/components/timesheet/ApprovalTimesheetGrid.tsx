import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ApprovalToggle, type ApprovalDecision } from "@/components/ui/approval-toggle";
import { getDayName, formatDayMonth, toISODateString, getWorkDays, parseDateLocal } from "@/lib/timesheetUtils";
import { cn } from "@/lib/utils";
import { Check, Clock, X } from "lucide-react";
import type { LineApproval, TimeEntryForApproval } from "@/hooks/useTimesheetApprovals";
import { compareActivityCodes } from "@/lib/activityFilters";

interface ApprovalTimesheetGridProps {
  weekStartDate: string;
  timeEntries: TimeEntryForApproval[];
  lineApprovals: LineApproval[];
  approvableEngagementIds: string[];
  approvalDecisions: Map<string, ApprovalDecision>;
  onDecisionChange: (approvalId: string, decision: ApprovalDecision) => void;
  lang: string;
  engagementBudgets?: Record<string, { budgetedHours: number | null }>;
}

interface EngagementGroup {
  engagementId: string;
  engagementCode: string | null;
  engagementName: string;
  canApprove: boolean;
  aggregateStatus: "approved" | "partial" | "pending" | "rejected" | null;
  totalHours: number;
  hoursByDate: { [dateStr: string]: number };
  activities: ActivityRow[];
  budgetedHours: number | null;
  remainingHours: number | null;
  clientName: string | null;
}

interface ActivityRow {
  activityId: string;
  activityCode: string;
  activityDescription: string;
  hours: { [dateStr: string]: number };
  total: number;
  approvalId: string | null;
  approvalStatus: "pending" | "approved" | "rejected" | null;
  reviewNotes: string | null;
}

export function ApprovalTimesheetGrid({
  weekStartDate,
  timeEntries,
  lineApprovals,
  approvableEngagementIds,
  approvalDecisions,
  onDecisionChange,
  lang,
  engagementBudgets = {},
}: ApprovalTimesheetGridProps) {
  const { t } = useTranslation();

  // Generate week dates (5 work days)
  const weekDates = useMemo(() => {
    return getWorkDays(parseDateLocal(weekStartDate), 5);
  }, [weekStartDate]);

  // Build engagement groups with activity sub-rows
  const engagementGroups = useMemo(() => {
    const groupMap = new Map<string, EngagementGroup>();

    timeEntries.forEach((entry) => {
      const engId = entry.engagement_id;

      if (!groupMap.has(engId)) {
        const canApprove = approvableEngagementIds.includes(engId);
        const budget = engagementBudgets[engId];
        const budgetedHours = budget?.budgetedHours ?? null;

        groupMap.set(engId, {
          engagementId: engId,
          engagementCode: entry.engagement?.engagement_code || null,
          engagementName: entry.engagement?.engagement_name || "",
          clientName: entry.engagement?.client?.client_legal_name || null,
          canApprove,
          aggregateStatus: null,
          totalHours: 0,
          hoursByDate: {},
          activities: [],
          budgetedHours,
          remainingHours: null,
        });
      }

      const group = groupMap.get(engId)!;

      // Update engagement totals
      group.hoursByDate[entry.date_worked] = (group.hoursByDate[entry.date_worked] || 0) + entry.hours_logged;
      group.totalHours += entry.hours_logged;

      // Find or create activity row
      let activity = group.activities.find((a) => a.activityId === entry.activity_id);
      if (!activity) {
        const actApproval = lineApprovals.find(
          la => la.engagement_id === engId && la.activity_id === entry.activity_id
        );
        activity = {
          activityId:          entry.activity_id,
          activityCode:        entry.activity?.activity_code || "",
          activityDescription: entry.activity?.description || "",
          hours:               {},
          total:               0,
          approvalId:          actApproval?.approval_id || null,
          approvalStatus:      actApproval?.status || null,
          reviewNotes:         actApproval?.review_notes || null,
        };
        group.activities.push(activity);
      }

      activity.hours[entry.date_worked] = (activity.hours[entry.date_worked] || 0) + entry.hours_logged;
      activity.total += entry.hours_logged;
    });

    // Sort activities within each group + compute aggregateStatus + remaining hours
    groupMap.forEach((group) => {
      group.activities.sort((a, b) => compareActivityCodes(a.activityCode, b.activityCode));

      const statuses = group.activities.map(a => a.approvalStatus).filter(Boolean) as string[];
      if (statuses.length === 0) {
        group.aggregateStatus = null;
      } else if (statuses.every(s => s === "approved")) {
        group.aggregateStatus = "approved";
      } else if (statuses.every(s => s === "rejected")) {
        group.aggregateStatus = "rejected";
      } else if (statuses.every(s => s === "pending")) {
        group.aggregateStatus = "pending";
      } else {
        group.aggregateStatus = "partial";
      }

      if (group.budgetedHours !== null) {
        group.remainingHours = group.budgetedHours - group.totalHours;
      }
    });

    // Sort groups by engagement code
    return Array.from(groupMap.values()).sort((a, b) => 
      (a.engagementCode || "").localeCompare(b.engagementCode || "")
    );
  }, [timeEntries, lineApprovals, approvableEngagementIds, engagementBudgets]);

  // Calculate column totals
  const calculateColumnTotal = (date: Date) => {
    const dateStr = toISODateString(date);
    return engagementGroups.reduce((sum, group) => sum + (group.hoursByDate[dateStr] || 0), 0);
  };

  const calculateGrandTotal = () => {
    return engagementGroups.reduce((sum, group) => sum + group.totalHours, 0);
  };

  const renderAggregateBadge = (status: EngagementGroup["aggregateStatus"]) => {
    if (!status || status === "pending") return null;
    const configs = {
      approved: { icon: Check, className: "bg-success/20 text-success-foreground border-success/30", label: t("approval.status.approved") },
      rejected: { icon: X,     className: "bg-destructive/20 text-destructive border-destructive/30", label: t("approval.status.rejected") },
      partial:  { icon: Clock, className: "bg-warning/20 text-warning-foreground border-warning/30", label: t("approval.status.partial") },
    };
    const config = configs[status];
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={cn("text-xs py-0", config.className)}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const renderActivityStatusBadge = (activity: ActivityRow) => {
    if (!activity.approvalStatus || activity.approvalStatus === "pending") return null;
    const configs = {
      approved: { icon: Check, className: "bg-success/20 text-success-foreground border-success/30", label: t("approval.status.approved") },
      rejected: { icon: X,     className: "bg-destructive/20 text-destructive border-destructive/30", label: t("approval.status.rejected") },
    };
    const config = configs[activity.approvalStatus as "approved" | "rejected"];
    const Icon = config.icon;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("text-xs py-0", config.className)}>
            <Icon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        {activity.reviewNotes && (
          <TooltipContent>
            <p className="max-w-xs">{activity.reviewNotes}</p>
          </TooltipContent>
        )}
      </Tooltip>
    );
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-center p-4 font-semibold text-foreground min-w-[280px] border-r border-border">
                {t("timesheet.engagement")} / {t("timesheet.activity")}
              </th>
              {weekDates.map((date, index) => (
                <th
                  key={index}
                  className="text-center p-4 font-semibold text-foreground w-16 border-r border-border"
                >
                  <div className="capitalize">{getDayName(date, lang)}</div>
                  <div className="text-xs text-muted-foreground font-normal font-mono">
                    {formatDayMonth(date, lang)}
                  </div>
                </th>
              ))}
              <th className="text-center p-4 font-semibold text-foreground w-16 bg-muted border-r border-border">
                {t("timesheet.total")}
              </th>
              <th className="text-center p-4 font-semibold text-foreground min-w-[160px]">
                {t("approval.decision.title")}
              </th>
            </tr>
          </thead>
          <tbody>
            {engagementGroups.map((group) => {
              const hasPendingActivities = group.activities.some(
                a => a.approvalStatus === "pending" && a.approvalId
              );
              const isApprovable = group.canApprove && hasPendingActivities;

              return (
                <>
                  {/* Engagement Header Row */}
                  <tr
                    key={group.engagementId}
                    className={cn(
                      "border-b border-border bg-muted/30",
                      !isApprovable && "text-muted-foreground"
                    )}
                  >
                    <td className="p-3 text-left border-r border-border">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">
                          <div>
                            <span className="text-xs mr-2">
                              {group.engagementCode}
                            </span>
                            <span className={cn(!isApprovable && "text-muted-foreground")}>
                              {group.engagementName}
                            </span>
                          </div>
                          {group.clientName && (
                            <div className="text-xs text-muted-foreground font-normal">
                              {group.clientName}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {weekDates.map((date) => {
                      const dateStr = toISODateString(date);
                      const hours = group.hoursByDate[dateStr] || 0;

                      return (
                        <td
                          key={dateStr}
                          className={cn(
                            "p-3 text-right font-mono font-medium border-r border-border",
                            !isApprovable && "text-muted-foreground"
                          )}
                        >
                          {hours > 0 ? hours : "-"}
                        </td>
                      );
                    })}
                    <td className={cn(
                      "p-3 text-right font-semibold bg-muted/50 font-mono border-r border-border",
                      !isApprovable && "text-muted-foreground"
                    )}>
                      <div>{group.totalHours}h</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {group.budgetedHours !== null ? (
                          <>
                            / {group.budgetedHours}h
                            {group.remainingHours !== null && (
                              <span className={cn(
                                "ml-1",
                                group.remainingHours < 0 && "text-destructive"
                              )}>
                                ({group.remainingHours}h {t("approval.remainingLabel")})
                              </span>
                            )}
                          </>
                        ) : (
                          <>/ {t("approval.budgetNA")}</>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {renderAggregateBadge(group.aggregateStatus)}
                    </td>
                  </tr>

                  {/* Activity Sub-Rows */}
                  {group.activities.map((activity) => (
                    <tr
                      key={`${group.engagementId}-${activity.activityId}`}
                      className={cn(
                        "border-b border-border/50",
                        !isApprovable && "text-muted-foreground"
                      )}
                    >
                      <td className="p-3 pl-8 text-left border-r border-border">
                        <span className="text-xs mr-2 text-muted-foreground">
                          {activity.activityCode}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {activity.activityDescription}
                        </span>
                      </td>
                      {weekDates.map((date) => {
                        const dateStr = toISODateString(date);
                        const hours = activity.hours[dateStr] || 0;

                        return (
                          <td
                            key={dateStr}
                            className="p-3 text-right font-mono text-sm text-muted-foreground border-r border-border"
                          >
                            {hours > 0 ? hours : "-"}
                          </td>
                        );
                      })}
                      <td className="p-3 text-right font-mono text-sm text-muted-foreground bg-muted/30 border-r border-border">
                        {activity.total}h
                      </td>
                      <td className="p-3 text-center">
                        {group.canApprove && activity.approvalStatus === "pending" && activity.approvalId ? (
                          <ApprovalToggle
                            value={approvalDecisions.get(activity.approvalId) || "pending"}
                            onChange={(decision) => onDecisionChange(activity.approvalId!, decision)}
                          />
                        ) : (
                          renderActivityStatusBadge(activity)
                        )}
                      </td>
                    </tr>
                  ))}
                </>
              );
            })}

            {/* Totals Row */}
            <tr className="bg-primary/5 font-semibold">
              <td className="p-4 text-left text-foreground border-r border-border">
                {t("timesheet.dailyTotals")}
              </td>
              {weekDates.map((date) => (
                <td
                  key={toISODateString(date)}
                  className="p-4 text-right text-foreground font-mono border-r border-border"
                >
                  {calculateColumnTotal(date)}h
                </td>
              ))}
              <td className="p-4 text-right text-foreground bg-primary/10 font-mono border-r border-border">
                {calculateGrandTotal()}h
              </td>
              <td className="text-center"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
