import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ApprovalToggle, type ApprovalDecision } from "@/components/ui/approval-toggle";
import { getDayName, formatDayMonth, toISODateString, getWorkDays } from "@/lib/timesheetUtils";
import { cn } from "@/lib/utils";
import { Check, Clock, X } from "lucide-react";
import type { LineApproval, TimeEntryForApproval } from "@/hooks/useTimesheetApprovals";

interface ApprovalTimesheetGridProps {
  weekStartDate: string;
  timeEntries: TimeEntryForApproval[];
  lineApprovals: LineApproval[];
  approvableEngagementIds: string[];
  approvalDecisions: Map<string, ApprovalDecision>;
  onDecisionChange: (approvalId: string, decision: ApprovalDecision) => void;
  lang: string;
}

interface EngagementGroup {
  engagementId: string;
  engagementCode: string | null;
  engagementName: string;
  approvalId: string | null;
  approvalStatus: "pending" | "approved" | "rejected" | null;
  reviewNotes: string | null;
  canApprove: boolean;
  totalHours: number;
  hoursByDate: { [dateStr: string]: number };
  activities: ActivityRow[];
}

interface ActivityRow {
  activityId: string;
  activityCode: string;
  activityDescription: string;
  hours: { [dateStr: string]: number };
  total: number;
}

export function ApprovalTimesheetGrid({
  weekStartDate,
  timeEntries,
  lineApprovals,
  approvableEngagementIds,
  approvalDecisions,
  onDecisionChange,
  lang,
}: ApprovalTimesheetGridProps) {
  const { t } = useTranslation();

  // Generate week dates (5 work days)
  const weekDates = useMemo(() => {
    return getWorkDays(new Date(weekStartDate), 5);
  }, [weekStartDate]);

  // Build engagement groups with activity sub-rows
  const engagementGroups = useMemo(() => {
    const groupMap = new Map<string, EngagementGroup>();

    timeEntries.forEach((entry) => {
      const engId = entry.engagement_id;
      
      if (!groupMap.has(engId)) {
        const approval = lineApprovals.find((la) => la.engagement_id === engId);
        const canApprove = approvableEngagementIds.includes(engId) && approval?.status === "pending";

        groupMap.set(engId, {
          engagementId: engId,
          engagementCode: entry.engagement?.engagement_code || null,
          engagementName: entry.engagement?.engagement_name || "",
          approvalId: approval?.approval_id || null,
          approvalStatus: approval?.status || null,
          reviewNotes: approval?.review_notes || null,
          canApprove,
          totalHours: 0,
          hoursByDate: {},
          activities: [],
        });
      }

      const group = groupMap.get(engId)!;
      
      // Update engagement totals
      group.hoursByDate[entry.date_worked] = (group.hoursByDate[entry.date_worked] || 0) + entry.hours_logged;
      group.totalHours += entry.hours_logged;

      // Find or create activity row
      let activity = group.activities.find((a) => a.activityId === entry.activity_id);
      if (!activity) {
        activity = {
          activityId: entry.activity_id,
          activityCode: entry.activity?.activity_code || "",
          activityDescription: entry.activity?.description || "",
          hours: {},
          total: 0,
        };
        group.activities.push(activity);
      }
      
      activity.hours[entry.date_worked] = (activity.hours[entry.date_worked] || 0) + entry.hours_logged;
      activity.total += entry.hours_logged;
    });

    // Sort activities within each group
    groupMap.forEach((group) => {
      group.activities.sort((a, b) => a.activityCode.localeCompare(b.activityCode));
    });

    // Sort groups by engagement code
    return Array.from(groupMap.values()).sort((a, b) => 
      (a.engagementCode || "").localeCompare(b.engagementCode || "")
    );
  }, [timeEntries, lineApprovals, approvableEngagementIds]);

  // Calculate column totals
  const calculateColumnTotal = (date: Date) => {
    const dateStr = toISODateString(date);
    return engagementGroups.reduce((sum, group) => sum + (group.hoursByDate[dateStr] || 0), 0);
  };

  const calculateGrandTotal = () => {
    return engagementGroups.reduce((sum, group) => sum + group.totalHours, 0);
  };

  const renderStatusBadge = (group: EngagementGroup) => {
    if (!group.approvalStatus || group.canApprove) return null;

    const statusConfig = {
      pending: { icon: Clock, className: "bg-warning/20 text-warning-foreground border-warning/30", label: t("approval.status.pending") },
      approved: { icon: Check, className: "bg-success/20 text-success-foreground border-success/30", label: t("approval.status.approved") },
      rejected: { icon: X, className: "bg-destructive/20 text-destructive border-destructive/30", label: t("approval.status.rejected") },
    };

    const config = statusConfig[group.approvalStatus];
    const Icon = config.icon;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("ml-2 text-xs py-0", config.className)}>
            <Icon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        {group.reviewNotes && (
          <TooltipContent>
            <p className="max-w-xs">{group.reviewNotes}</p>
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
              <th className="text-left p-4 font-semibold text-foreground min-w-[280px]">
                {t("timesheet.engagement")} / {t("timesheet.activity")}
              </th>
              {weekDates.map((date, index) => (
                <th
                  key={index}
                  className="text-center p-4 font-semibold text-foreground w-16"
                >
                  <div className="capitalize">{getDayName(date, lang)}</div>
                  <div className="text-xs text-muted-foreground font-normal font-mono">
                    {formatDayMonth(date, lang)}
                  </div>
                </th>
              ))}
              <th className="text-center p-4 font-semibold text-foreground w-16 bg-muted">
                {t("timesheet.total")}
              </th>
              <th className="text-center p-4 font-semibold text-foreground min-w-[160px]">
                {t("approval.decision.title")}
              </th>
            </tr>
          </thead>
          <tbody>
            {engagementGroups.map((group) => {
              const isApprovable = group.canApprove && group.approvalId;
              const currentDecision = group.approvalId 
                ? approvalDecisions.get(group.approvalId) || "pending" 
                : "pending";

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
                    <td className="p-3">
                      <div className="flex items-center">
                        <div className="font-medium">
                          <span className="font-mono text-xs mr-2">
                            {group.engagementCode}
                          </span>
                          <span className={cn(!isApprovable && "text-muted-foreground")}>
                            {group.engagementName}
                          </span>
                        </div>
                        {renderStatusBadge(group)}
                      </div>
                    </td>
                    {weekDates.map((date) => {
                      const dateStr = toISODateString(date);
                      const hours = group.hoursByDate[dateStr] || 0;

                      return (
                        <td
                          key={dateStr}
                          className={cn(
                            "p-3 text-center font-mono font-medium",
                            !isApprovable && "text-muted-foreground"
                          )}
                        >
                          {hours > 0 ? hours : "-"}
                        </td>
                      );
                    })}
                    <td className={cn(
                      "p-3 text-center font-semibold bg-muted/50 font-mono",
                      !isApprovable && "text-muted-foreground"
                    )}>
                      {group.totalHours}h
                    </td>
                    <td className="p-3 text-center">
                      {isApprovable && group.approvalId && (
                        <ApprovalToggle
                          value={currentDecision}
                          onChange={(decision) => onDecisionChange(group.approvalId!, decision)}
                        />
                      )}
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
                      <td className="p-3 pl-8">
                        <span className="font-mono text-xs mr-2 text-muted-foreground">
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
                            className="p-3 text-center font-mono text-sm text-muted-foreground"
                          >
                            {hours > 0 ? hours : "-"}
                          </td>
                        );
                      })}
                      <td className="p-3 text-center font-mono text-sm text-muted-foreground bg-muted/30">
                        {activity.total}h
                      </td>
                      <td></td>
                    </tr>
                  ))}
                </>
              );
            })}

            {/* Totals Row */}
            <tr className="bg-primary/5 font-semibold">
              <td className="p-4 text-foreground">
                {t("timesheet.dailyTotals")}
              </td>
              {weekDates.map((date) => (
                <td
                  key={toISODateString(date)}
                  className="p-4 text-center text-foreground font-mono"
                >
                  {calculateColumnTotal(date)}h
                </td>
              ))}
              <td className="p-4 text-center text-foreground bg-primary/10 font-mono">
                {calculateGrandTotal()}h
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
