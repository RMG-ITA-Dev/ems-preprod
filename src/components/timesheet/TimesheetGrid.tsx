import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NumericInput } from "@/components/ui/numeric-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Check, Clock, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getDayName, formatDayMonth, toISODateString } from "@/lib/timesheetUtils";
import type { TimeEntry, ApprovedEngagement, ActivityCode } from "@/hooks/useTimesheetWeek";
import { useUpsertTimeEntry } from "@/hooks/useTimesheetMutations";
import { cn } from "@/lib/utils";

interface LineApproval {
  approval_id: string;
  engagement_id: string;
  status: "pending" | "approved" | "rejected";
  review_notes: string | null;
}

interface GridRow {
  id: string;
  engagementId: string;
  activityId: string;
  hours: { [dateStr: string]: number };
  entryIds: { [dateStr: string]: string | null };
}

interface TimesheetGridProps {
  weekDates: Date[];
  entries: TimeEntry[];
  engagements: ApprovedEngagement[];
  activities: ActivityCode[];
  staffId: string;
  periodId: string | null;
  isLocked: boolean;
  autoSaveSeconds: number;
  lang: string;
  lineApprovals: LineApproval[];
}

export function TimesheetGrid({
  weekDates,
  entries,
  engagements,
  activities,
  staffId,
  periodId,
  isLocked,
  autoSaveSeconds,
  lang,
  lineApprovals,
}: TimesheetGridProps) {
  const { t } = useTranslation();
  const upsertEntry = useUpsertTimeEntry();
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [savedCells, setSavedCells] = useState<Set<string>>(new Set());
  const debounceTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Convert entries to grid rows
  const initialRows = useMemo(() => {
    const rowMap = new Map<string, GridRow>();

    entries.forEach((entry) => {
      const key = `${entry.engagement_id}-${entry.activity_id}`;
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          id: key,
          engagementId: entry.engagement_id,
          activityId: entry.activity_id,
          hours: {},
          entryIds: {},
        });
      }
      const row = rowMap.get(key)!;
      row.hours[entry.date_worked] = entry.hours_logged;
      row.entryIds[entry.date_worked] = entry.time_id;
    });

    const rows = Array.from(rowMap.values());
    // Add an empty row if no entries exist
    if (rows.length === 0) {
      rows.push({
        id: `new-${Date.now()}`,
        engagementId: "",
        activityId: "",
        hours: {},
        entryIds: {},
      });
    }
    return rows;
  }, [entries]);

  const [rows, setRows] = useState<GridRow[]>(initialRows);

  // Sync rows when entries change
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const addNewRow = () => {
    setRows([
      ...rows,
      {
        id: `new-${Date.now()}`,
        engagementId: "",
        activityId: "",
        hours: {},
        entryIds: {},
      },
    ]);
  };

  const removeRow = (rowId: string) => {
    setRows(rows.filter((r) => r.id !== rowId));
  };

  const handleEngagementChange = (rowId: string, engagementId: string) => {
    setRows(
      rows.map((row) =>
        row.id === rowId ? { ...row, engagementId, id: `${engagementId}-${row.activityId || 'new'}` } : row
      )
    );
  };

  const handleActivityChange = (rowId: string, activityId: string) => {
    setRows(
      rows.map((row) =>
        row.id === rowId ? { ...row, activityId, id: `${row.engagementId || 'new'}-${activityId}` } : row
      )
    );
  };

  const handleHoursChange = useCallback(
    (rowId: string, date: Date, value: string) => {
      const dateStr = toISODateString(date);
      const hours = parseFloat(value) || 0;
      const cellKey = `${rowId}-${dateStr}`;

      // Update local state immediately
      setRows((prevRows) =>
        prevRows.map((row) =>
          row.id === rowId
            ? { ...row, hours: { ...row.hours, [dateStr]: hours } }
            : row
        )
      );

      // Clear existing debounce timer
      if (debounceTimers.current[cellKey]) {
        clearTimeout(debounceTimers.current[cellKey]);
      }

      // Get current row data
      const row = rows.find((r) => r.id === rowId);
      if (!row || !row.engagementId || !row.activityId) return;

      // Set debounced save
      debounceTimers.current[cellKey] = setTimeout(() => {
        setSavingCells((prev) => new Set(prev).add(cellKey));
        setSavedCells((prev) => {
          const next = new Set(prev);
          next.delete(cellKey);
          return next;
        });

        upsertEntry.mutate(
          {
            staffId,
            engagementId: row.engagementId,
            activityId: row.activityId,
            dateWorked: date,
            hours,
            periodId,
            existingEntryId: row.entryIds[dateStr] || null,
          },
          {
            onSuccess: () => {
              setSavingCells((prev) => {
                const next = new Set(prev);
                next.delete(cellKey);
                return next;
              });
              setSavedCells((prev) => new Set(prev).add(cellKey));
              // Clear saved indicator after 2 seconds
              setTimeout(() => {
                setSavedCells((prev) => {
                  const next = new Set(prev);
                  next.delete(cellKey);
                  return next;
                });
              }, 2000);
            },
            onError: () => {
              setSavingCells((prev) => {
                const next = new Set(prev);
                next.delete(cellKey);
                return next;
              });
            },
          }
        );
      }, autoSaveSeconds * 1000);
    },
    [rows, staffId, periodId, autoSaveSeconds, upsertEntry]
  );

  const calculateRowTotal = (row: GridRow) => {
    return weekDates.reduce(
      (sum, date) => sum + (row.hours[toISODateString(date)] || 0),
      0
    );
  };

  const calculateColumnTotal = (date: Date) => {
    const dateStr = toISODateString(date);
    return rows.reduce((sum, row) => sum + (row.hours[dateStr] || 0), 0);
  };

  const calculateGrandTotal = () => {
    return rows.reduce((sum, row) => sum + calculateRowTotal(row), 0);
  };

  // Get approval status for an engagement
  const getApprovalStatus = (engagementId: string) => {
    return lineApprovals.find((la) => la.engagement_id === engagementId);
  };

  const renderApprovalBadge = (engagementId: string) => {
    const approval = getApprovalStatus(engagementId);
    if (!approval) return null;

    const statusConfig = {
      pending: { icon: Clock, className: "bg-warning/20 text-warning-foreground border-warning/30", label: t("approval.status.pending") },
      approved: { icon: Check, className: "bg-success/20 text-success-foreground border-success/30", label: t("approval.status.approved") },
      rejected: { icon: X, className: "bg-destructive/20 text-destructive border-destructive/30", label: t("approval.status.rejected") },
    };

    const config = statusConfig[approval.status];
    const Icon = config.icon;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("ml-2 text-xs py-0", config.className)}>
            <Icon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        {approval.review_notes && (
          <TooltipContent>
            <p className="max-w-xs">{approval.review_notes}</p>
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
              <th className="text-left p-4 font-semibold text-foreground min-w-[200px]">
                {t("timesheet.engagement")}
              </th>
              <th className="text-left p-4 font-semibold text-foreground min-w-[140px]">
                {t("timesheet.activity")}
              </th>
              {weekDates.map((date, index) => (
                <th
                  key={index}
                  className="text-center p-4 font-semibold text-foreground w-20"
                >
                  <div className="capitalize">{getDayName(date, lang)}</div>
                  <div className="text-xs text-muted-foreground font-normal font-mono">
                    {formatDayMonth(date, lang)}
                  </div>
                </th>
              ))}
              <th className="text-center p-4 font-semibold text-foreground w-20 bg-muted">
                {t("timesheet.total")}
              </th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border hover:bg-muted/30"
              >
                <td className="p-2">
                  <div className="flex items-center">
                    <Select
                      value={row.engagementId}
                      onValueChange={(val) => handleEngagementChange(row.id, val)}
                      disabled={isLocked}
                    >
                      <SelectTrigger className="border-0 bg-transparent focus:ring-1">
                        <SelectValue placeholder={t("timesheet.selectEngagement")} />
                      </SelectTrigger>
                      <SelectContent>
                        {engagements.map((eng) => (
                          <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                            <span className="font-mono text-xs text-muted-foreground mr-2">
                              {eng.engagement_code}
                            </span>
                            {eng.engagement_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {row.engagementId && renderApprovalBadge(row.engagementId)}
                  </div>
                </td>
                <td className="p-2">
                  <Select
                    value={row.activityId}
                    onValueChange={(val) => handleActivityChange(row.id, val)}
                    disabled={isLocked}
                  >
                    <SelectTrigger className="border-0 bg-transparent focus:ring-1">
                      <SelectValue placeholder={t("timesheet.selectActivity")} />
                    </SelectTrigger>
                    <SelectContent>
                      {activities.map((act) => (
                        <SelectItem key={act.activity_id} value={act.activity_id}>
                          <span className="font-mono text-xs text-muted-foreground mr-2">
                            {act.activity_code}
                          </span>
                          {act.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                {weekDates.map((date) => {
                  const dateStr = toISODateString(date);
                  const cellKey = `${row.id}-${dateStr}`;
                  const isSaving = savingCells.has(cellKey);
                  const isSaved = savedCells.has(cellKey);
                  const isDisabled =
                    isLocked || !row.engagementId || !row.activityId;

                  return (
                    <td key={dateStr} className="p-2 relative">
                      <div className="relative">
                        <NumericInput
                          decimals={1}
                          locale="en"
                          min={0}
                          max={24}
                          value={row.hours[dateStr] || ""}
                          onChange={(val) =>
                            handleHoursChange(row.id, date, String(val))
                          }
                          disabled={isDisabled}
                          className={cn(
                            "w-16 text-center mx-auto border-0 bg-transparent focus:bg-background focus:border font-mono",
                            isDisabled && "opacity-50"
                          )}
                        />
                        {isSaving && (
                          <Loader2 className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                        {isSaved && (
                          <Check className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-success" />
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="p-2 text-center font-semibold bg-muted/50 font-mono">
                  {calculateRowTotal(row)}h
                </td>
                <td className="p-2">
                  {rows.length > 1 && !isLocked && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {/* Add Row Button */}
            {!isLocked && (
              <tr className="border-b border-border">
                <td colSpan={weekDates.length + 4} className="p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addNewRow}
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t("timesheet.addRow")}
                  </Button>
                </td>
              </tr>
            )}
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
