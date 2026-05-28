import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, Filter, ChevronDown, ArrowUpFromLine } from "lucide-react";
import { ManualEntryDialog } from "@/components/tracker/ManualEntryDialog";
import { ConsolidationDialog } from "@/components/tracker/ConsolidationDialog";
import { useTimerEntries, TimerEntry, useCreateTimerEntry, useRunningTimerEntry } from "@/hooks/useTimerEntries";
import { useTimesheetImport } from "@/hooks/useTimesheetImport";
import {
  resolveFinalExportSet,
  analysisEquals,
  type PreflightAnalysis,
} from "@/lib/timerExportUtils";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useAuth } from "@/hooks/useAuth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/useMobile";

type SortDirection = "asc" | "desc" | null;
type SortColumn = "fecha" | "hora" | "duracion" | "encargo" | "actividad" | null;

const TrackerList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentLanguage } = useLanguage();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { data: entries, isLoading: entriesLoading } = useTimerEntries();
  const createEntry = useCreateTimerEntry();
  const { data: runningEntry } = useRunningTimerEntry();
  const hasRunningTimer = !!runningEntry;

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [consolidationDialogOpen, setConsolidationDialogOpen] = useState(false);
  const [consolidationAnalysis, setConsolidationAnalysis] = useState<PreflightAnalysis | null>(null);
  const [previousAnalysis, setPreviousAnalysis] = useState<PreflightAnalysis | null>(null);

  // Shared export hook
  const { exportEntries, isExporting, analyzeExport } = useTimesheetImport({ staffId: staffRecord?.staff_id || "" });

  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  // Filter states
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [engagementFilter, setEngagementFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [engagementFilterOpen, setEngagementFilterOpen] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "—";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins.toString().padStart(2, "0")}m`;
    }
    return `${mins}m`;
  };

  const formatTimeRange = (startedAt: string, endedAt: string | null) => {
    const startDate = new Date(startedAt);
    const startTime = format(startDate, "HH:mm");
    if (!endedAt) return `${startTime} - ...`;
    const endDate = new Date(endedAt);
    const endTime = format(endDate, "HH:mm");
    return `${startTime} - ${endTime}`;
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    }
    if (sortDirection === "asc") {
      return <ArrowUp className="h-3 w-3 text-accent" />;
    }
    return <ArrowDown className="h-3 w-3 text-accent" />;
  };

  // Get unique engagements for filter
  const engagementOptions = useMemo(() => {
    const unique = new Map<string, { id: string; code: string; name: string }>();
    entries?.forEach((e) => {
      if (e.engagement) {
        unique.set(e.engagement_id, {
          id: e.engagement_id,
          code: e.engagement.engagement_code || "",
          name: e.engagement.engagement_name || "",
        });
      }
    });
    return Array.from(unique.values());
  }, [entries]);

  const filteredEntries = useMemo(() => {
    let result = entries || [];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((entry) => {
        return (
          entry.description?.toLowerCase().includes(query) ||
          entry.engagement?.engagement_name?.toLowerCase().includes(query) ||
          entry.engagement?.engagement_code?.toLowerCase().includes(query) ||
          entry.activity?.activity_code?.toLowerCase().includes(query)
        );
      });
    }

    if (dateFilter) {
      const filterDateStr = format(dateFilter, "yyyy-MM-dd");
      result = result.filter((entry) => {
        const entryDate = format(new Date(entry.started_at), "yyyy-MM-dd");
        return entryDate === filterDateStr;
      });
    }

    if (engagementFilter && engagementFilter !== "all") {
      result = result.filter((entry) => entry.engagement_id === engagementFilter);
    }

    if (statusFilter === "active") {
      result = result.filter((e) => !e.is_imported);
    } else if (statusFilter === "ready") {
      result = result.filter((e) => !!e.ended_at && !e.is_imported);
    } else if (statusFilter === "imported") {
      result = result.filter((e) => e.is_imported);
    } else if (statusFilter === "running") {
      result = result.filter((e) => !e.ended_at);
    }

    if (sortColumn && sortDirection) {
      result = [...result].sort((a, b) => {
        let comparison = 0;
        switch (sortColumn) {
          case "fecha":
            comparison = new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
            break;
          case "hora":
            comparison = new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
            break;
          case "duracion":
            comparison = (a.duration_minutes || 0) - (b.duration_minutes || 0);
            break;
          case "encargo": {
            const engA = a.engagement?.engagement_name || "";
            const engB = b.engagement?.engagement_name || "";
            comparison = engA.localeCompare(engB);
            break;
          }
          case "actividad": {
            const actA = a.activity?.description || "";
            const actB = b.activity?.description || "";
            comparison = actA.localeCompare(actB);
            break;
          }
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [entries, searchQuery, dateFilter, engagementFilter, statusFilter, sortColumn, sortDirection]);

  // Calculate totals for footer
  const totalMinutes = filteredEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  // Selection helpers
  const isSelectable = (entry: TimerEntry) => !!entry.ended_at && !entry.is_imported;

  const selectableEntries = useMemo(
    () => filteredEntries.filter(isSelectable),
    [filteredEntries]
  );

  const toggleSelect = (timerId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(timerId)) next.delete(timerId);
      else next.add(timerId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableEntries.length && selectableEntries.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableEntries.map(e => e.timer_id)));
    }
  };

  // Export handler
  const handleExport = async () => {
    const allEligible = (entries || []).filter(e => e.ended_at && !e.is_imported);
    const selected = allEligible.filter(e => selectedIds.has(e.timer_id));
    if (selected.length === 0) return;

    const analysis = analyzeExport(allEligible, selectedIds);

    if (!analysis.hasConsolidation && !analysis.hasConflicts) {
      // Direct export, no dialog needed
      try {
        const result = await exportEntries(selected);
        setSelectedIds(new Set());
        showExportToasts(result);
      } catch (error) {
        console.error("Export error:", error);
        toast.error(t("tracker.exportError"));
      }
      return;
    }

    // Open consolidation dialog
    setPreviousAnalysis(null);
    setConsolidationAnalysis(analysis);
    setConsolidationDialogOpen(true);
  };

  function resolveDbErrorReason(messages: string[], translate: ReturnType<typeof useTranslation>["t"]): string {
    if (messages.includes("approved_line_locked")) return translate("tracker.dbErrorReasonApprovedLine");
    const raw = messages.find((m) => m && m !== "approved_line_locked");
    return raw ?? translate("tracker.dbErrorReasonGeneric");
  }

  const showExportToasts = (result: {
    newCount: number; mergedCount: number;
    blockedCount: number; blockedWeeks: string[];
    woBlockedCount: number; woBlockedEngagements: string[];
    dbErrorCount: number; dbErrorWeeks: string[]; dbErrorMessages: string[];
  }) => {
    if (result.mergedCount > 0) {
      toast.success(t("tracker.exportSuccessMerged", {
        newCount: result.newCount,
        mergedCount: result.mergedCount
      }));
    } else if (result.newCount > 0) {
      toast.success(t("tracker.exportSuccess", { count: result.newCount }));
    }
    if (result.woBlockedCount > 0) {
      toast.error(t("tracker.exportBlockedWO", {
        count: result.woBlockedCount,
        engagements: result.woBlockedEngagements.join(", ")
      }));
    }
    if (result.blockedCount > 0) {
      toast.warning(t("tracker.exportBlocked", {
        blockedCount: result.blockedCount,
        weeks: result.blockedWeeks.join(", ")
      }));
    }
    if (result.dbErrorCount > 0) {
      const reason = resolveDbErrorReason(result.dbErrorMessages, t);
      toast.error(t("tracker.exportBlockedDbError", {
        count: result.dbErrorCount,
        weeks: result.dbErrorWeeks.join(", "),
        reason,
      }));
    }
  };

  const handleIncludeAllMatching = async () => {
    const allEligible = (entries || []).filter(e => e.ended_at && !e.is_imported);
    const freshAnalysis = analyzeExport(allEligible, selectedIds);
    if (consolidationAnalysis && !analysisEquals(consolidationAnalysis, freshAnalysis)) {
      setPreviousAnalysis(consolidationAnalysis);
      setConsolidationAnalysis(freshAnalysis);
      toast.warning(t("tracker.consolidation.dataChanged"));
      return;
    }
    const resolved = resolveFinalExportSet(allEligible, selectedIds, freshAnalysis.conflicts, "include_all_matching");
    try {
      const result = await exportEntries(resolved);
      setSelectedIds(new Set());
      setConsolidationDialogOpen(false);
      setConsolidationAnalysis(null);
      setPreviousAnalysis(null);
      showExportToasts(result);
    } catch (error) {
      console.error("Export error:", error);
      toast.error(t("tracker.exportError"));
    }
  };

  const handleExcludeConflicting = async () => {
    const allEligible = (entries || []).filter(e => e.ended_at && !e.is_imported);
    const freshAnalysis = analyzeExport(allEligible, selectedIds);
    if (consolidationAnalysis && !analysisEquals(consolidationAnalysis, freshAnalysis)) {
      setPreviousAnalysis(consolidationAnalysis);
      setConsolidationAnalysis(freshAnalysis);
      toast.warning(t("tracker.consolidation.dataChanged"));
      return;
    }
    const resolved = resolveFinalExportSet(allEligible, selectedIds, freshAnalysis.conflicts, "exclude_conflicting_groups");
    if (resolved.length === 0) {
      toast.info(t("tracker.consolidation.emptyAfterExclude"));
      setConsolidationDialogOpen(false);
      setConsolidationAnalysis(null);
      setPreviousAnalysis(null);
      setSelectedIds(new Set());
      return;
    }
    try {
      const result = await exportEntries(resolved);
      setSelectedIds(new Set());
      setConsolidationDialogOpen(false);
      setConsolidationAnalysis(null);
      setPreviousAnalysis(null);
      showExportToasts(result);
      const excludedCount = freshAnalysis.conflicts.reduce((s, c) => s + c.selectedEntries.length + c.unselectedEntries.length, 0);
      toast.info(t("tracker.consolidation.excludedToast", {
        excluded: excludedCount,
        groups: freshAnalysis.conflicts.length,
      }));
    } catch (error) {
      console.error("Export error:", error);
      toast.error(t("tracker.exportError"));
    }
  };

  const handleProceedExport = async () => {
    const allEligible = (entries || []).filter(e => e.ended_at && !e.is_imported);
    const freshAnalysis = analyzeExport(allEligible, selectedIds);
    if (consolidationAnalysis && !analysisEquals(consolidationAnalysis, freshAnalysis)) {
      setPreviousAnalysis(consolidationAnalysis);
      setConsolidationAnalysis(freshAnalysis);
      toast.warning(t("tracker.consolidation.dataChanged"));
      return;
    }
    const selected = (entries || []).filter(e => selectedIds.has(e.timer_id));
    try {
      const result = await exportEntries(selected);
      setSelectedIds(new Set());
      setConsolidationDialogOpen(false);
      setConsolidationAnalysis(null);
      setPreviousAnalysis(null);
      showExportToasts(result);
    } catch (error) {
      console.error("Export error:", error);
      toast.error(t("tracker.exportError"));
    }
  };

  const handleCancelExport = () => {
    setConsolidationDialogOpen(false);
    setConsolidationAnalysis(null);
    setPreviousAnalysis(null);
    // selectedIds preserved on cancel
  };

  // Manual entry handler
  const handleManualSubmit = async (data: {
    engagement_id: string;
    activity_id: string;
    description: string;
    date: Date;
    startTime: string;
    endTime: string;
    has_explicit_times: boolean;
    hours: number;
  }) => {
    if (!staffRecord?.staff_id) return;

    let startDate: Date;
    let endDate: Date;
    let durationMinutes: number;

    if (data.has_explicit_times) {
      const [startHour, startMin] = data.startTime.split(":").map(Number);
      const [endHour, endMin] = data.endTime.split(":").map(Number);

      startDate = new Date(data.date);
      startDate.setHours(startHour, startMin, 0, 0);
      endDate = new Date(data.date);
      endDate.setHours(endHour, endMin, 0, 0);

      if (endDate <= startDate) {
        toast.error(t("tracker.invalidTimeRange"));
        return;
      }

      durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    } else {
      // Hours-only mode: synthetic timestamps
      startDate = new Date(data.date);
      startDate.setHours(0, 0, 0, 0);
      durationMinutes = Math.round(data.hours * 60);
      endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    }

    try {
      await createEntry.mutateAsync({
        staff_id: staffRecord.staff_id,
        engagement_id: data.engagement_id,
        activity_id: data.activity_id,
        description: data.description || undefined,
        started_at: startDate.toISOString(),
        ended_at: endDate.toISOString(),
        duration_minutes: durationMinutes,
        has_explicit_times: data.has_explicit_times,
      });
      toast.success(t("tracker.entryAdded"));
      setManualDialogOpen(false);
    } catch (error) {
      toast.error(t("tracker.errorAdding"));
    }
  };

  const clearDateFilter = () => {
    setDateFilter(undefined);
    setDateFilterOpen(false);
  };

  const clearEngagementFilter = () => {
    setEngagementFilter("all");
    setEngagementFilterOpen(false);
  };

  const clearStatusFilter = () => {
    setStatusFilter("active");
    setStatusFilterOpen(false);
  };

  if (staffLoading) {
    return (
      <AppLayout title={t("tracker.listTitle")}>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </AppLayout>
    );
  }

  if (!staffRecord) {
    return (
      <AppLayout title={t("tracker.listTitle")}>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t("timesheet.noStaffRecord")}
            <br />
            <span className="text-sm mt-1 block">
              {t("timesheet.noStaffRecordHelp", { email: user?.email })}
            </span>
          </AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("tracker.listTitle")}>
      <div className="space-y-4">
        {/* Filters Row + Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="relative w-full sm:min-w-[200px] sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("tracker.searchPlaceholder")}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto flex-wrap">
            {/* Export to Timesheet */}
            <Button
              variant="outline"
              onClick={handleExport}
              className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 bg-teal-600 text-white border-teal-600 hover:bg-teal-700 hover:text-white"
              disabled={selectedIds.size === 0 || isExporting}
            >
              <ArrowUpFromLine className="h-4 w-4 mr-2" />
              {t("tracker.importToTimesheet")}
              {selectedIds.size > 0 && (
                <Badge className="ml-2 bg-accent text-accent-foreground text-xs">
                  {selectedIds.size}
                </Badge>
              )}
            </Button>
            {/* Use Timer - disabled when a timer is running */}
            <span
              className="inline-flex"
              title={hasRunningTimer ? t("tracker.timerAlreadyRunningHint") : undefined}
            >
              <Button
                variant="default"
                onClick={() => navigate("/tracker/new")}
                disabled={hasRunningTimer}
                className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 bg-warning text-warning-foreground hover:bg-warning/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("tracker.useTimer")}
              </Button>
            </span>
            {/* View active timer CTA - only when running */}
            {hasRunningTimer && (
              <Button
                variant="outline"
                onClick={() => navigate("/tracker/new")}
                className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0"
              >
                {t("tracker.viewActiveTimer")}
              </Button>
            )}
            {/* New Manual Record - S8: purple/default with Plus icon */}
            <Button
              variant="default"
              onClick={() => setManualDialogOpen(true)}
              className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("tracker.newManualEntry")}
            </Button>
          </div>
        </div>

        {/* Mobile Card View */}
        {isMobile ? (
          <div className="space-y-3">
            {entriesLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                  </CardContent>
                </Card>
              ))
            ) : filteredEntries.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  {t("common.noResults")}
                </CardContent>
              </Card>
            ) : (
              filteredEntries.map((entry) => {
                const date = new Date(entry.started_at);
                const selectable = isSelectable(entry);
                
                return (
                  <Card 
                    key={entry.timer_id} 
                    className={`cursor-pointer hover:bg-muted/50 transition-colors ${selectedIds.has(entry.timer_id) ? "ring-2 ring-accent" : ""}`}
                    onClick={() => entry.ended_at ? navigate(`/tracker/${entry.timer_id}`) : navigate("/tracker/new")}
                  >
                    <CardContent className="p-4">
                      {/* Primary Info */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {/* Checkbox */}
                          {selectable && (
                            <div 
                              className="min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Checkbox
                                checked={selectedIds.has(entry.timer_id)}
                                onCheckedChange={() => toggleSelect(entry.timer_id)}
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {entry.engagement?.engagement_code || "—"} - {entry.engagement?.engagement_name || ""}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {entry.activity?.activity_code || "—"} - {entry.activity?.description || ""}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono font-bold">{formatDuration(entry.duration_minutes)}</p>
                          {!entry.ended_at ? (
                            <Badge className="bg-success/10 text-success border-success/20 animate-pulse text-xs">
                              {t("tracker.running")}
                            </Badge>
                          ) : entry.is_imported ? (
                            <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">
                              {t("tracker.imported")}
                            </Badge>
                          ) : (
                            <Badge className="bg-info/10 text-info border-info/20 text-xs">
                              {t("tracker.ready")}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Secondary Info in Collapsible */}
                      <Collapsible>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="font-mono">{format(date, "dd/MM/yyyy", { locale: currentLanguage === "es" ? es : undefined })}</span>
                            <span>•</span>
                            <span className="font-mono">{formatTimeRange(entry.started_at, entry.ended_at)}</span>
                          </div>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => e.stopPropagation()}>
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                        <CollapsibleContent className="pt-3 space-y-2">
                          {entry.description && (
                            <p className="text-sm text-muted-foreground">
                              <span className="font-medium">{t("tracker.description")}:</span> {entry.description}
                            </p>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        ) : (
          /* Desktop Table View */
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="table-dense">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {/* Checkbox - 4% */}
                    <TableHead style={{ width: "4%" }} className="text-center border-r border-border">
                      <Checkbox
                        checked={selectedIds.size === selectableEntries.length && selectableEntries.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    {/* Fecha - 10% */}
                    <TableHead style={{ width: "10%" }} className="text-center border-r border-border">
                      <div className="flex items-center justify-center gap-1">
                        <span 
                          className="cursor-pointer hover:text-foreground flex items-center gap-1"
                          onClick={() => handleSort("fecha")}
                        >
                          {t("tracker.date")}
                          {getSortIcon("fecha")}
                        </span>
                        <Popover open={dateFilterOpen} onOpenChange={setDateFilterOpen}>
                          <PopoverTrigger asChild>
                            <button className="p-0.5 hover:bg-muted rounded">
                              <Filter className={`h-3 w-3 ${dateFilter ? "text-accent" : "opacity-50"}`} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dateFilter}
                              onSelect={(date) => {
                                setDateFilter(date);
                                setDateFilterOpen(false);
                              }}
                              initialFocus
                            />
                            {dateFilter && (
                              <div className="p-2 border-t">
                                <Button variant="ghost" size="sm" onClick={clearDateFilter} className="w-full">
                                  {t("common.clear")}
                                </Button>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableHead>
                    {/* Hora - 10% */}
                    <TableHead style={{ width: "10%" }} className="text-center border-r border-border">
                      <span 
                        className="cursor-pointer hover:text-foreground flex items-center justify-center gap-1"
                        onClick={() => handleSort("hora")}
                      >
                        {t("tracker.time")}
                        {getSortIcon("hora")}
                      </span>
                    </TableHead>
                    {/* Duración - 8% */}
                    <TableHead style={{ width: "8%" }} className="text-center border-r border-border">
                      <span 
                        className="cursor-pointer hover:text-foreground flex items-center justify-center gap-1"
                        onClick={() => handleSort("duracion")}
                      >
                        {t("tracker.duration")}
                        {getSortIcon("duracion")}
                      </span>
                    </TableHead>
                    {/* Encargo - 24% */}
                    <TableHead style={{ width: "24%" }} className="text-center border-r border-border">
                      <div className="flex items-center justify-center gap-1">
                        <span 
                          className="cursor-pointer hover:text-foreground flex items-center gap-1"
                          onClick={() => handleSort("encargo")}
                        >
                          {t("tracker.engagement")}
                          {getSortIcon("encargo")}
                        </span>
                        <Popover open={engagementFilterOpen} onOpenChange={setEngagementFilterOpen}>
                          <PopoverTrigger asChild>
                            <button className="p-0.5 hover:bg-muted rounded">
                              <Filter className={`h-3 w-3 ${engagementFilter !== "all" ? "text-accent" : "opacity-50"}`} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-2" align="start">
                            <Select value={engagementFilter} onValueChange={(val) => {
                              setEngagementFilter(val);
                              setEngagementFilterOpen(false);
                            }}>
                              <SelectTrigger>
                                <SelectValue placeholder={t("common.all")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t("common.all")}</SelectItem>
                                {engagementOptions.map((eng) => (
                                  <SelectItem key={eng.id} value={eng.id}>
                                    {eng.code} - {eng.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {engagementFilter !== "all" && (
                              <Button variant="ghost" size="sm" onClick={clearEngagementFilter} className="w-full mt-2">
                                {t("common.clear")}
                              </Button>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableHead>
                    {/* Actividad - 14% */}
                    <TableHead style={{ width: "14%" }} className="text-center border-r border-border">
                      <span 
                        className="cursor-pointer hover:text-foreground flex items-center justify-center gap-1"
                        onClick={() => handleSort("actividad")}
                      >
                        {t("tracker.activity")}
                        {getSortIcon("actividad")}
                      </span>
                    </TableHead>
                    {/* Descripción - 14% */}
                    <TableHead style={{ width: "14%" }} className="text-center border-r border-border">
                      {t("tracker.description")}
                    </TableHead>
                    {/* Estado - 8% */}
                    <TableHead style={{ width: "8%" }} className="text-center border-r border-border">
                      <div className="flex items-center justify-center gap-1">
                        <span>{t("tracker.status")}</span>
                        <Popover open={statusFilterOpen} onOpenChange={setStatusFilterOpen}>
                          <PopoverTrigger asChild>
                            <button className="p-0.5 hover:bg-muted rounded">
                              <Filter className={`h-3 w-3 ${statusFilter !== "active" ? "text-accent" : "opacity-50"}`} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2" align="start">
                            <Select value={statusFilter} onValueChange={(val) => {
                              setStatusFilter(val);
                              setStatusFilterOpen(false);
                            }}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">{t("tracker.statusActive")}</SelectItem>
                                <SelectItem value="all">{t("common.all")}</SelectItem>
                                <SelectItem value="ready">{t("tracker.ready")}</SelectItem>
                                <SelectItem value="imported">{t("tracker.imported")}</SelectItem>
                                <SelectItem value="running">{t("tracker.running")}</SelectItem>
                              </SelectContent>
                            </Select>
                            {statusFilter !== "active" && (
                              <Button variant="ghost" size="sm" onClick={clearStatusFilter} className="w-full mt-2">
                                {t("common.clear")}
                              </Button>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableHead>
                    {/* Horas - 6% */}
                    <TableHead style={{ width: "6%" }} className="text-center">
                      {t("tracker.hours")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entriesLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        {t("common.noResults")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((entry) => {
                      const date = new Date(entry.started_at);
                      const selectable = isSelectable(entry);

                      return (
                        <TableRow
                          key={entry.timer_id}
                          className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(entry.timer_id) ? "bg-muted/50" : ""}`}
                          onClick={() => entry.ended_at ? navigate(`/tracker/${entry.timer_id}`) : navigate("/tracker/new")}
                        >
                          {/* Checkbox */}
                          <TableCell className="text-center border-r border-border" onClick={(e) => e.stopPropagation()}>
                            {selectable && (
                              <Checkbox
                                checked={selectedIds.has(entry.timer_id)}
                                onCheckedChange={() => toggleSelect(entry.timer_id)}
                              />
                            )}
                          </TableCell>
                          {/* Date */}
                          <TableCell className="font-mono text-muted-foreground text-left border-r border-border">
                            {format(date, "dd/MM/yyyy", { locale: currentLanguage === "es" ? es : undefined })}
                          </TableCell>
                          {/* Time Range */}
                          <TableCell className="font-mono text-left border-r border-border">
                            {formatTimeRange(entry.started_at, entry.ended_at)}
                          </TableCell>
                          {/* Duration */}
                          <TableCell className="text-right font-mono border-r border-border">
                            {formatDuration(entry.duration_minutes)}
                          </TableCell>
                          {/* Engagement */}
                          <TableCell className="font-medium truncate max-w-[220px] text-left border-r border-border">
                            {entry.engagement?.engagement_code || "—"} - {entry.engagement?.engagement_name || "—"}
                          </TableCell>
                          {/* Activity */}
                          <TableCell className="truncate max-w-[180px] text-left border-r border-border">
                            {entry.activity?.activity_code || "—"} - {entry.activity?.description || "—"}
                          </TableCell>
                          {/* Description */}
                          <TableCell className="truncate max-w-[140px] text-left border-r border-border">
                            {entry.description || "—"}
                          </TableCell>
                          {/* Status */}
                          <TableCell className="text-center border-r border-border">
                            {!entry.ended_at ? (
                              <Badge className="bg-success/10 text-success border-success/20 animate-pulse">
                                {t("tracker.running")}
                              </Badge>
                            ) : entry.is_imported ? (
                              <Badge variant="outline" className="bg-muted text-muted-foreground">
                                {t("tracker.imported")}
                              </Badge>
                            ) : (
                              <Badge className="bg-info/10 text-info border-info/20">
                                {t("tracker.ready")}
                              </Badge>
                            )}
                          </TableCell>
                          {/* Hours (decimal) */}
                          <TableCell className="text-right font-mono">
                            {entry.duration_minutes ? (entry.duration_minutes / 60).toFixed(1) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Footer Totals */}
        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border rounded-lg">
          <span className="text-sm font-medium text-muted-foreground">
            {t("tracker.totalTime")}
          </span>
          <span className="font-mono font-bold">
            {totalHours} {t("tracker.hours")}
          </span>
        </div>

        {/* Manual Entry Dialog */}
        <ManualEntryDialog
          open={manualDialogOpen}
          onOpenChange={setManualDialogOpen}
          onSubmit={handleManualSubmit}
        />

        {/* Consolidation Dialog */}
        <ConsolidationDialog
          open={consolidationDialogOpen}
          analysis={consolidationAnalysis}
          previousAnalysis={previousAnalysis}
          onIncludeAllMatching={handleIncludeAllMatching}
          onExcludeConflicting={handleExcludeConflicting}
          onProceed={handleProceedExport}
          onCancel={handleCancelExport}
        />
      </div>
    </AppLayout>
  );
};

export default TrackerList;
