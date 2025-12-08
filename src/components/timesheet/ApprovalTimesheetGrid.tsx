import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getDayName, formatDayMonth, toISODateString, getWorkDays } from "@/lib/timesheetUtils";
import { cn } from "@/lib/utils";
import { Check, Clock, X } from "lucide-react";
import type { LineApproval, TimeEntryForApproval } from "@/hooks/useTimesheetApprovals";

interface ApprovalTimesheetGridProps {
  weekStartDate: string;
  timeEntries: TimeEntryForApproval[];
  lineApprovals: LineApproval[];
  approvableEngagementIds: string[];
  selectedApprovalIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
  lang: string;
}

interface GridRow {
  key: string;
  engagementId: string;
  activityId: string;
  engagementCode: string | null;
  engagementName: string;
  activityCode: string;
  activityDescription: string;
  hours: { [dateStr: string]: number };
  total: number;
  approvalId: string | null;
  approvalStatus: "pending" | "approved" | "rejected" | null;
  reviewNotes: string | null;
  canApprove: boolean;
}

export function ApprovalTimesheetGrid({
  weekStartDate,
  timeEntries,
  lineApprovals,
  approvableEngagementIds,
  selectedApprovalIds,
  onSelectionChange,
  lang,
}: ApprovalTimesheetGridProps) {
  const { t } = useTranslation();

  // Generate week dates (5 work days)
  const weekDates = useMemo(() => {
    return getWorkDays(new Date(weekStartDate), 5);
  }, [weekStartDate]);

  // Build grid rows grouped by engagement + activity
  const rows = useMemo(() => {
    const rowMap = new Map<string, GridRow>();

    timeEntries.forEach((entry) => {
      const key = `${entry.engagement_id}-${entry.activity_id}`;
      
      if (!rowMap.has(key)) {
        // Find the approval record for this engagement
        const approval = lineApprovals.find((la) => la.engagement_id === entry.engagement_id);
        const canApprove = approvableEngagementIds.includes(entry.engagement_id) &&
          approval?.status === "pending";

        rowMap.set(key, {
          key,
          engagementId: entry.engagement_id,
          activityId: entry.activity_id,
          engagementCode: entry.engagement?.engagement_code || null,
          engagementName: entry.engagement?.engagement_name || "",
          activityCode: entry.activity?.activity_code || "",
          activityDescription: entry.activity?.description || "",
          hours: {},
          total: 0,
          approvalId: approval?.approval_id || null,
          approvalStatus: approval?.status || null,
          reviewNotes: approval?.review_notes || null,
          canApprove,
        });
      }

      const row = rowMap.get(key)!;
      row.hours[entry.date_worked] = (row.hours[entry.date_worked] || 0) + entry.hours_logged;
      row.total += entry.hours_logged;
    });

    // Sort by engagement code, then activity code
    return Array.from(rowMap.values()).sort((a, b) => {
      const engCompare = (a.engagementCode || "").localeCompare(b.engagementCode || "");
      if (engCompare !== 0) return engCompare;
      return a.activityCode.localeCompare(b.activityCode);
    });
  }, [timeEntries, lineApprovals, approvableEngagementIds]);

  // Calculate column totals
  const calculateColumnTotal = (date: Date) => {
    const dateStr = toISODateString(date);
    return rows.reduce((sum, row) => sum + (row.hours[dateStr] || 0), 0);
  };

  const calculateGrandTotal = () => {
    return rows.reduce((sum, row) => sum + row.total, 0);
  };

  // Handle checkbox changes
  const handleCheckboxChange = (approvalId: string, checked: boolean) => {
    const newSelection = new Set(selectedApprovalIds);
    if (checked) {
      newSelection.add(approvalId);
    } else {
      newSelection.delete(approvalId);
    }
    onSelectionChange(newSelection);
  };

  // Select all approvable rows
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allApprovableIds = rows
        .filter((row) => row.canApprove && row.approvalId)
        .map((row) => row.approvalId!);
      onSelectionChange(new Set(allApprovableIds));
    } else {
      onSelectionChange(new Set());
    }
  };

  const approvableRows = rows.filter((row) => row.canApprove && row.approvalId);
  const allSelected = approvableRows.length > 0 && 
    approvableRows.every((row) => selectedApprovalIds.has(row.approvalId!));
  const someSelected = approvableRows.some((row) => selectedApprovalIds.has(row.approvalId!));

  const renderStatusBadge = (row: GridRow) => {
    if (!row.approvalStatus) return null;

    const statusConfig = {
      pending: { icon: Clock, className: "bg-warning/20 text-warning-foreground border-warning/30", label: t("approval.status.pending") },
      approved: { icon: Check, className: "bg-success/20 text-success-foreground border-success/30", label: t("approval.status.approved") },
      rejected: { icon: X, className: "bg-destructive/20 text-destructive border-destructive/30", label: t("approval.status.rejected") },
    };

    const config = statusConfig[row.approvalStatus];
    const Icon = config.icon;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("ml-2 text-xs py-0", config.className)}>
            <Icon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        {row.reviewNotes && (
          <TooltipContent>
            <p className="max-w-xs">{row.reviewNotes}</p>
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
              <th className="text-left p-4 font-semibold text-foreground min-w-[180px]">
                {t("timesheet.engagement")}
              </th>
              <th className="text-left p-4 font-semibold text-foreground min-w-[140px]">
                {t("timesheet.activity")}
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
              <th className="text-center p-4 font-semibold text-foreground w-20">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  disabled={approvableRows.length === 0}
                  className={someSelected && !allSelected ? "data-[state=checked]:bg-primary/50" : ""}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isApprovable = row.canApprove && row.approvalId;
              const isSelected = row.approvalId ? selectedApprovalIds.has(row.approvalId) : false;

              return (
                <tr
                  key={row.key}
                  className={cn(
                    "border-b border-border",
                    !isApprovable && "text-muted-foreground",
                    isSelected && "bg-primary/5"
                  )}
                >
                  <td className="p-3">
                    <div className="flex items-center">
                      <div>
                        <span className="font-mono text-xs mr-2">
                          {row.engagementCode}
                        </span>
                        <span className={cn(!isApprovable && "text-muted-foreground")}>
                          {row.engagementName}
                        </span>
                      </div>
                      {renderStatusBadge(row)}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-xs mr-2">
                      {row.activityCode}
                    </span>
                    <span className={cn(!isApprovable && "text-muted-foreground")}>
                      {row.activityDescription}
                    </span>
                  </td>
                  {weekDates.map((date) => {
                    const dateStr = toISODateString(date);
                    const hours = row.hours[dateStr] || 0;

                    return (
                      <td
                        key={dateStr}
                        className={cn(
                          "p-3 text-center font-mono",
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
                    {row.total}h
                  </td>
                  <td className="p-3 text-center">
                    {isApprovable && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => 
                          handleCheckboxChange(row.approvalId!, checked as boolean)
                        }
                      />
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Totals Row */}
            <tr className="bg-primary/5 font-semibold">
              <td colSpan={2} className="p-4 text-foreground">
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
