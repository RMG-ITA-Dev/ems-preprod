import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NumericInput } from "@/components/ui/numeric-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Check, Clock, X, AlertTriangle, Calendar as CalendarIcon, Lock } from "lucide-react";
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
import { useUpsertTimeEntry, useDeleteRowEntries, useUpdateEntryActivity } from "@/hooks/useTimesheetMutations";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { normalizeActivityForEngagement } from "@/lib/timesheetActivityRules";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

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
  // BUG #29: Callbacks for save status
  onSaveStatusChange?: (status: "idle" | "saving" | "saved") => void;
  saveNowTrigger?: number;
  // BUG #13: Hour limit props
  dailyMin?: number;
  dailyMax?: number;
  weeklyMin?: number;
  weeklyMax?: number;
  // BUG #5: Per-day hire date locking
  lockedDaysBeforeHire?: Set<number>;
  // Per-day termination date locking
  lockedDaysAfterTermination?: Set<number>;
  // Holiday blocking
  holidayMap?: Map<string, string>;
  holidayEngagementId?: string | null;
  // Non-chargeable engagement policy
  activityNotRequiredIds?: Set<string>;
  adminActivityId?: string | null;
  // Approved-week empty state
  isFullyApproved?: boolean;
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
  onSaveStatusChange,
  saveNowTrigger,
  dailyMin = 8,
  dailyMax = 8,
  weeklyMin = 40,
  weeklyMax = 40,
  lockedDaysBeforeHire,
  lockedDaysAfterTermination,
  holidayMap,
  holidayEngagementId,
  activityNotRequiredIds,
  adminActivityId,
  isFullyApproved = false,
}: TimesheetGridProps) {
  const { t } = useTranslation();
  const upsertEntry = useUpsertTimeEntry();
  const deleteRowEntries = useDeleteRowEntries();
  const updateEntryActivity = useUpdateEntryActivity();
  const [deleteRowId, setDeleteRowId] = useState<string | null>(null);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [savedCells, setSavedCells] = useState<Set<string>>(new Set());
  const debounceTimers = useRef<{ [key: string]: ReturnType<typeof setTimeout> }>({});
  
  // Ref to access current rows inside debounced callbacks (fixes stale closure)
  const rowsRef = useRef<GridRow[]>([]);
  const isMountedRef = useRef(true);
  const isBatchSavingRef = useRef(false);

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
    // Add an empty row if no entries exist (skip when fully approved)
    if (rows.length === 0 && !isFullyApproved) {
      rows.push({
        id: `new-${Date.now()}`,
        engagementId: "",
        activityId: "",
        hours: {},
        entryIds: {},
      });
    }
    return rows;
  }, [entries, isFullyApproved]);

  const [rows, setRows] = useState<GridRow[]>(initialRows);

  // Sync rows when entries change
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  // Keep rowsRef in sync with current rows state
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Cleanup debounce timers on unmount to prevent memory leaks
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  // BUG 0220-63: Engagement date boundary lookup (must be before saveNowTrigger and handleHoursChange)
  const engagementDateMap = useMemo(() => {
    const map = new Map<string, { start: string | null; end: string | null }>();
    engagements.forEach(eng => {
      map.set(eng.engagement_id, { start: eng.start_date, end: eng.end_date });
    });
    return map;
  }, [engagements]);

  // BUG 0220-63: Week-overlap dropdown filtering (grid-owned)
  const weekStartStr = toISODateString(weekDates[0]);
  const weekEndStr = toISODateString(weekDates[weekDates.length - 1]);

  const availableEngagements = useMemo(() => {
    const usedIds = new Set(rows.map(r => r.engagementId).filter(Boolean));
    return engagements.filter(eng => {
      if (usedIds.has(eng.engagement_id)) return true;
      const startOk = !eng.start_date || eng.start_date <= weekEndStr;
      const endOk = !eng.end_date || eng.end_date >= weekStartStr;
      return startOk && endOk;
    });
  }, [engagements, rows, weekStartStr, weekEndStr]);

  // BUG #29: Notify parent of save status changes
  useEffect(() => {
    if (savingCells.size > 0) {
      onSaveStatusChange?.("saving");
    } else if (savedCells.size > 0) {
      onSaveStatusChange?.("saved");
    } else {
      onSaveStatusChange?.("idle");
    }
  }, [savingCells.size, savedCells.size, onSaveStatusChange]);

  // BUG #0213-23: Handle "Save Now" trigger from parent
  const BATCH_SIZE = 10;
  const prevSaveNowTrigger = useRef(0);
  useEffect(() => {
    if (saveNowTrigger && saveNowTrigger > prevSaveNowTrigger.current) {
      prevSaveNowTrigger.current = saveNowTrigger;

      // Double-click guard: ignore if a batch is already in progress
      if (isBatchSavingRef.current) return;

      // Clear all pending debounce timers and save immediately
      Object.entries(debounceTimers.current).forEach(([key, timer]) => {
        clearTimeout(timer);
        delete debounceTimers.current[key];
      });

      // 1. Collect all cells that need saving or deleting
      const cellsToSave: {
        cellKey: string;
        params: Parameters<typeof upsertEntry.mutateAsync>[0];
      }[] = [];

      rowsRef.current.forEach((row) => {
        if (!row.engagementId) return;
        // Approved line guard: skip approved rows in batch save
        const rowApproval = lineApprovals.find(la => la.engagement_id === row.engagementId);
        if (rowApproval?.status === "approved") return;
        const isActNotReq = activityNotRequiredIds?.has(row.engagementId);
        const effectiveActivityId = isActNotReq && adminActivityId ? adminActivityId : row.activityId;
        if (!effectiveActivityId) return;
        weekDates.forEach((date) => {
          const dateStr = toISODateString(date);
          const hours = row.hours[dateStr];
          const existingEntryId = row.entryIds[dateStr] || null;
          const hasHours = hours !== undefined && hours > 0;
          // Only treat explicit zero as deletion (not undefined)
          const needsDeletion = hours === 0 && !!existingEntryId;

          // BUG 0220-63: Engagement date range guard for batch save
          const batchEngDates = engagementDateMap.get(row.engagementId);
          if (batchEngDates && hasHours) {
            if ((batchEngDates.start && dateStr < batchEngDates.start) || (batchEngDates.end && dateStr > batchEngDates.end)) {
              return; // skip out-of-range cells silently in batch (inside forEach, not for-of)
            }
          }

          if (hasHours || needsDeletion) {
            cellsToSave.push({
              cellKey: `${row.id}-${dateStr}`,
              params: {
                staffId,
                engagementId: row.engagementId,
                activityId: effectiveActivityId,
                dateWorked: date,
                hours: hasHours ? hours : 0,
                periodId,
                existingEntryId,
              },
            });
          }
        });
      });

      if (cellsToSave.length === 0) return;

      // 2. Mark all cells as saving and lock the batch
      isBatchSavingRef.current = true;
      const allCellKeys = new Set(cellsToSave.map((c) => c.cellKey));
      setSavingCells((prev) => new Set([...prev, ...allCellKeys]));

      // 3. Execute batch with concurrency limit
      const executeBatch = async () => {
        try {
          const allResults: PromiseSettledResult<unknown>[] = [];

          for (let i = 0; i < cellsToSave.length; i += BATCH_SIZE) {
            const chunk = cellsToSave.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
              chunk.map((cell) => upsertEntry.mutateAsync(cell.params))
            );
            allResults.push(...results);
          }

          // Guard against unmount
          if (!isMountedRef.current) return;

          // Clear all saving indicators atomically
          setSavingCells((prev) => {
            const next = new Set(prev);
            allCellKeys.forEach((key) => next.delete(key));
            return next;
          });

          // Handle results
          const failCount = allResults.filter(
            (r) => r.status === "rejected"
          ).length;

          if (failCount > 0) {
            const errors = allResults
              .filter((r) => r.status === "rejected")
              .map((r) => (r as PromiseRejectedResult).reason);
            logger.error("Batch save partial failure", {
              failCount,
              total: allResults.length,
              errors,
            });
            toast.error(
              t("timesheet.saveDraftPartialError", { count: failCount })
            );
          } else {
            toast.success(t("timesheet.saveDraftSuccess"));
            // Mark successful cells with green checkmark
            const savedKeySet = new Set(cellsToSave.map((c) => c.cellKey));
            setSavedCells((prev) => new Set([...prev, ...savedKeySet]));
            setTimeout(() => {
              if (!isMountedRef.current) return;
              setSavedCells((prev) => {
                const next = new Set(prev);
                savedKeySet.forEach((key) => next.delete(key));
                return next;
              });
            }, 2000);
          }
        } finally {
          // Fail-safe: always clear savingCells and unlock batch flag
          if (isMountedRef.current) {
            setSavingCells((prev) => {
              const next = new Set(prev);
              allCellKeys.forEach((k) => next.delete(k));
              return next;
            });
          }
          isBatchSavingRef.current = false;
        }
      };

      executeBatch();
    }
  }, [saveNowTrigger, weekDates, staffId, periodId, upsertEntry, t, engagementDateMap]);

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
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;

    const entryIdsToDelete = Object.values(row.entryIds).filter(
      (id): id is string => !!id
    );

    // Empty/new row: remove locally, no DB call, no confirmation
    if (entryIdsToDelete.length === 0) {
      setRows((prev) => prev.filter((r) => r.id !== rowId));
      return;
    }

    // Row has saved entries: require confirmation
    setDeleteRowId(rowId);
  };

  const confirmDeleteRow = async () => {
    if (!deleteRowId) return;

    const row = rows.find((r) => r.id === deleteRowId);
    if (!row) {
      setDeleteRowId(null);
      return;
    }

    const entryIdsToDelete = Object.values(row.entryIds).filter(
      (id): id is string => !!id
    );

    if (entryIdsToDelete.length === 0) {
      setRows((prev) => prev.filter((r) => r.id !== deleteRowId));
      setDeleteRowId(null);
      return;
    }

    // Snapshot for rollback
    const previousRows = rows;

    // Optimistic UI removal
    setRows((prev) => prev.filter((r) => r.id !== deleteRowId));

    try {
      await deleteRowEntries.mutateAsync(entryIdsToDelete);
      setDeleteRowId(null);
    } catch (e) {
      // Deterministic logging + rollback
      logger.error("Failed to delete timesheet row entries", e);
      setRows(previousRows);
      setDeleteRowId(null);
      toast.error(t("timesheet.deleteRowError"));
    }
  };

  const handleEngagementChange = (rowId: string, engagementId: string) => {
    const currentRow = rows.find(r => r.id === rowId);
    if (!currentRow) return;

    // Auto-assign ADM activity for activity-not-required engagements
    const isActivityNotRequired = activityNotRequiredIds?.has(engagementId);
    const engagementObj = engagements.find(e => e.engagement_id === engagementId);
    const activityRequired = engagementObj?.activity_required ?? true;
    const { nextActivityId: activityId } = normalizeActivityForEngagement({
      engagementId,
      currentActivityId: currentRow.activityId,
      adminActivityId: adminActivityId ?? null,
      activityRequired,
    });

    // Check for duplicate — another row with same engagement+activity
    const existingRow = rows.find(r => r.id !== rowId && r.engagementId === engagementId && r.activityId === activityId && activityId !== '');
    if (existingRow) {
      const mergedHours = { ...existingRow.hours };
      const mergedEntryIds = { ...existingRow.entryIds };
      Object.entries(currentRow.hours).forEach(([dateStr, hrs]) => {
        mergedHours[dateStr] = (mergedHours[dateStr] || 0) + (hrs || 0);
      });
      setRows(
        rows
          .map(row => row.id === existingRow.id ? { ...row, hours: mergedHours, entryIds: mergedEntryIds } : row)
          .filter(r => r.id !== rowId)
      );
      toast.warning(t('timesheet.rowMerged'));
      return;
    }

    setRows(
      rows.map((row) =>
        row.id === rowId ? { ...row, engagementId, activityId, id: activityId ? `${engagementId}-${activityId}` : `${engagementId}-new` } : row
      )
    );
  };

  const handleActivityChange = (rowId: string, activityId: string) => {
    const currentRow = rows.find(r => r.id === rowId);
    if (!currentRow) return;
    const engagementId = currentRow.engagementId;

    // Check for duplicate
    const existingRow = rows.find(r => r.id !== rowId && r.engagementId === engagementId && r.activityId === activityId && engagementId !== '');
    if (existingRow) {
      const mergedHours = { ...existingRow.hours };
      const mergedEntryIds = { ...existingRow.entryIds };
      Object.entries(currentRow.hours).forEach(([dateStr, hrs]) => {
        mergedHours[dateStr] = (mergedHours[dateStr] || 0) + (hrs || 0);
      });
      setRows(
        rows
          .map(row => row.id === existingRow.id ? { ...row, hours: mergedHours, entryIds: mergedEntryIds } : row)
          .filter(r => r.id !== rowId)
      );
      toast.warning(t('timesheet.rowMerged'));
      return;
    }

    setRows(
      rows.map((row) =>
        row.id === rowId ? { ...row, activityId, id: engagementId ? `${engagementId}-${activityId}` : `new-${activityId}` } : row
      )
    );

    // BUG 0227-68: Persist activity change to DB for existing entries
    const existingEntryIds = Object.values(currentRow.entryIds).filter(
      (id): id is string => !!id
    );
    if (existingEntryIds.length > 0) {
      updateEntryActivity.mutate(
        { entryIds: existingEntryIds, newActivityId: activityId },
        {
          onError: () => {
            // Rollback local state on failure
            setRows((prev) =>
              prev.map((row) =>
                row.id === `${engagementId}-${activityId}`
                  ? { ...row, activityId: currentRow.activityId, id: currentRow.id }
                  : row
              )
            );
            toast.error(t("timesheet.activityChangeError"));
          },
        }
      );
    }
  };

  const handleHoursChange = useCallback(
    (rowId: string, date: Date, value: string) => {
      const dateStr = toISODateString(date);
      const hours = parseFloat(value) || 0;
      const cellKey = `${rowId}-${dateStr}`;

      // Holiday guard: check before saving
      const holidayName = holidayMap?.get(dateStr);
      if (holidayName && hours > 0) {
        const currentRow = rowsRef.current.find((r) => r.id === rowId);
        if (!holidayEngagementId) {
          toast.error(t("timesheet.holidayNotConfiguredAttempt"));
          return;
        }
        if (currentRow && currentRow.engagementId !== holidayEngagementId) {
          toast.error(t("timesheet.holidayBlocked", { name: holidayName }));
          return;
        }
      }

      // BUG 0220-63: Engagement date range guard
      const currentRowForDateCheck = rowsRef.current.find((r) => r.id === rowId);
      if (currentRowForDateCheck && hours > 0) {
        const engDates = engagementDateMap.get(currentRowForDateCheck.engagementId);
        if (engDates) {
          if ((engDates.start && dateStr < engDates.start) || (engDates.end && dateStr > engDates.end)) {
            toast.error(t("timesheet.dateOutsideEngagementRange"));
            return;
          }
        }
      }

      // Approved line guard
      const currentRowForApproval = rowsRef.current.find((r) => r.id === rowId);
      if (currentRowForApproval) {
        const rowApproval = lineApprovals.find(la => la.engagement_id === currentRowForApproval.engagementId);
        if (rowApproval?.status === "approved") return;
      }

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

      // Set debounced save - read from ref INSIDE callback to get current state
      debounceTimers.current[cellKey] = setTimeout(() => {
        // Access current rows via ref to avoid stale closure
        const currentRow = rowsRef.current.find((r) => r.id === rowId);
        if (!currentRow || !currentRow.engagementId) return;
        // For activity-not-required rows, use adminActivityId
        const effectiveActivityId = activityNotRequiredIds?.has(currentRow.engagementId) && adminActivityId
          ? adminActivityId
          : currentRow.activityId;
        if (!effectiveActivityId) return;

        setSavingCells((prev) => new Set(prev).add(cellKey));
        setSavedCells((prev) => {
          const next = new Set(prev);
          next.delete(cellKey);
          return next;
        });

        upsertEntry.mutate(
          {
            staffId,
            engagementId: currentRow.engagementId,
            activityId: effectiveActivityId,
            dateWorked: date,
            hours,
            periodId,
            existingEntryId: currentRow.entryIds[dateStr] || null,
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
              // Parse holiday errors from DB trigger
              // (handled generically by error handler toast)
            },
          }
        );
      }, autoSaveSeconds * 1000);
    },
    [staffId, periodId, autoSaveSeconds, upsertEntry, holidayMap, holidayEngagementId, t, lineApprovals, engagementDateMap]
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

  const isWeeklyAtTarget = () => {
    const total = calculateGrandTotal();
    return total > 0 && Math.round(total * 100) === Math.round(weeklyMin * 100);
  };

  // Track used activities per engagement for dropdown filtering
  const usedActivitiesByEngagement = useMemo(() => {
    const map = new Map<string, Set<string>>();
    rows.forEach(row => {
      if (row.engagementId && row.activityId) {
        if (!map.has(row.engagementId)) map.set(row.engagementId, new Set());
        map.get(row.engagementId)!.add(row.activityId);
      }
    });
    return map;
  }, [rows]);


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
      <>
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
        {approval.status === "rejected" && approval.review_notes?.trim() && (
          <p className="mt-1 text-xs text-destructive/90 italic leading-tight w-full">
            {t("approval.rejectionNote")} {approval.review_notes}
          </p>
        )}
      </>
    );
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-center p-4 font-semibold text-foreground min-w-[200px] border-r border-border">
                {t("timesheet.engagement")}
              </th>
              <th className="text-center p-4 font-semibold text-foreground min-w-[140px] border-r border-border">
                {t("timesheet.activity")}
              </th>
              {weekDates.map((date, index) => {
                const dateStr = toISODateString(date);
                const holidayName = holidayMap?.get(dateStr);
                return (
                  <th
                    key={index}
                    className={cn(
                      "text-center p-4 font-semibold text-foreground w-20 border-r border-border",
                      holidayName && "bg-warning/10"
                    )}
                  >
                    <div className="capitalize flex items-center justify-center gap-1">
                      {getDayName(date, lang)}
                      {holidayName && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <CalendarIcon className="h-3 w-3 text-warning-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t("timesheet.holidayTooltip", { name: holidayName })}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-normal font-mono">
                      {formatDayMonth(date, lang)}
                    </div>
                  </th>
                );
              })}
              <th className="text-center p-4 font-semibold text-foreground w-20 bg-muted border-r border-border">
                {t("timesheet.total")}
              </th>
              <th className="w-10 text-center"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowApproval = getApprovalStatus(row.engagementId);
              const isRowApproved = rowApproval?.status === "approved";
              const isRowLocked = isLocked || isRowApproved;
              return (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-border hover:bg-muted/30",
                  isRowApproved && !isLocked && "bg-success/5"
                )}
              >
              <td className="p-2 text-left border-r border-border">
                  <div className="flex flex-wrap items-center">
                    <Select
                      value={row.engagementId}
                      onValueChange={(val) => handleEngagementChange(row.id, val)}
                      disabled={isRowLocked}
                    >
                      <SelectTrigger className="border-0 bg-transparent focus:ring-1">
                        <SelectValue placeholder={t("timesheet.selectEngagement")} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableEngagements.map((eng) => (
                          <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                            <div className="flex flex-col">
                              <div className="flex items-center">
                                <span className="font-mono text-xs opacity-60 mr-2">
                                  {eng.engagement_code}
                                </span>
                                {eng.engagement_name}
                              </div>
                              {/* BUG #31: Show client name */}
                              {eng.client?.client_legal_name && (
                              <span className="text-xs opacity-70">
                                {eng.client.client_legal_name}
                              </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {row.engagementId && renderApprovalBadge(row.engagementId)}
                  </div>
                </td>
                <td className="p-2 text-left border-r border-border">
                  <Select
                    value={row.activityId}
                    onValueChange={(val) => handleActivityChange(row.id, val)}
                    disabled={isRowLocked || (activityNotRequiredIds?.has(row.engagementId) ?? false)}
                  >
                    <SelectTrigger className="border-0 bg-transparent focus:ring-1">
                      <SelectValue placeholder={
                        activityNotRequiredIds?.has(row.engagementId)
                          ? "ADM - Administrative"
                          : t("timesheet.selectActivity")
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {activities.map((act) => {
                        const isUsedElsewhere = usedActivitiesByEngagement
                          .get(row.engagementId)?.has(act.activity_id) && row.activityId !== act.activity_id;
                        return (
                          <SelectItem key={act.activity_id} value={act.activity_id} disabled={!!isUsedElsewhere}>
                            <span className={cn("font-mono text-xs text-muted-foreground mr-2", isUsedElsewhere && "opacity-50")}>
                              {act.activity_code}
                            </span>
                            <span className={cn(isUsedElsewhere && "opacity-50")}>{act.description}</span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </td>
                {weekDates.map((date, dayIndex) => {
                  const dateStr = toISODateString(date);
                  const cellKey = `${row.id}-${dateStr}`;
                  const isSaving = savingCells.has(cellKey);
                  const isSaved = savedCells.has(cellKey);
                  const isDayLockedByHire = lockedDaysBeforeHire?.has(dayIndex) ?? false;
                  const isDayLockedByTermination = lockedDaysAfterTermination?.has(dayIndex) ?? false;
                  const holidayName = holidayMap?.get(dateStr);
                  const isHolidayBlocked = !!holidayName && row.engagementId !== holidayEngagementId;
                  const isActivityNotRequired = activityNotRequiredIds?.has(row.engagementId);
                  const isAdmMissing = isActivityNotRequired && !adminActivityId;
                  // BUG 0220-63: Per-cell engagement date range lock
                  const engDates = engagementDateMap.get(row.engagementId);
                  const isBeforeEngStart = !!(engDates?.start && dateStr < engDates.start);
                  const isAfterEngEnd = !!(engDates?.end && dateStr > engDates.end);
                  const isOutOfEngagementRange = isBeforeEngStart || isAfterEngEnd;
                  const isDisabled =
                    isRowLocked || isDayLockedByHire || isDayLockedByTermination || isHolidayBlocked || isAdmMissing || isOutOfEngagementRange || !row.engagementId || (!row.activityId && !isActivityNotRequired);

                  return (
                    <td key={dateStr} className={cn("p-2 relative text-center border-r border-border", isDayLockedByHire && "bg-muted/40", isOutOfEngagementRange && "bg-muted/40", isHolidayBlocked && "bg-warning/5")}>
                      {isOutOfEngagementRange ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
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
                                disabled={true}
                                className={cn(
                                  "w-16 text-center mx-auto border-0 bg-transparent focus:bg-background focus:border font-mono opacity-50"
                                )}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t("timesheet.cellOutsideEngagementDates")}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
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
                      )}
                    </td>
                  );
                })}
                <td className="p-2 text-right font-semibold bg-muted/50 font-mono border-r border-border">
                  {calculateRowTotal(row)}h
                </td>
                <td className="p-2 text-center">
                  {isRowApproved && rows.length > 1 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Lock className="h-4 w-4 text-muted-foreground mx-auto" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("timesheet.lineApproved")}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : rows.length > 1 && !isLocked ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                      disabled={deleteRowEntries.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </td>
              </tr>
              );
            })}
            {/* Approved empty state */}
            {rows.length === 0 && isFullyApproved && (
              <tr>
                <td colSpan={weekDates.length + 4} className="p-8 text-center text-muted-foreground">
                  <Lock className="h-5 w-5 mx-auto mb-2 opacity-50" />
                  <p>{t("timesheet.approvedNoEntries")}</p>
                </td>
              </tr>
            )}
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
              {weekDates.map((date) => {
                const total = calculateColumnTotal(date);
                const hasHours = total > 0;
                const atTarget = hasHours && Math.round(total * 100) === Math.round(dailyMin * 100);
                return (
                  <td
                    key={toISODateString(date)}
                    className={cn(
                      "p-4 text-center font-mono",
                      hasHours && atTarget && "text-foreground bg-success/15",
                      hasHours && !atTarget && "text-destructive bg-destructive/10"
                    )}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {hasHours && !atTarget && <AlertTriangle className="h-3 w-3" />}
                      {total}h
                    </div>
                  </td>
                );
              })}
              <td className={cn(
                "p-4 text-center font-mono",
                calculateGrandTotal() > 0 && isWeeklyAtTarget() && "text-foreground bg-success/15",
                calculateGrandTotal() > 0 && !isWeeklyAtTarget() && "text-destructive bg-destructive/10"
              )}>
                <div className="flex items-center justify-center gap-1">
                  {calculateGrandTotal() > 0 && !isWeeklyAtTarget() && <AlertTriangle className="h-3 w-3" />}
                  {calculateGrandTotal()}h
                </div>
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={!!deleteRowId}
        onOpenChange={(open) => { if (!open) setDeleteRowId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("timesheet.deleteRowTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("timesheet.deleteRowDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRowEntries.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteRow}
              disabled={deleteRowEntries.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
