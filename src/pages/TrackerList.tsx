import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
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
import { Plus, Search, Pencil, Copy, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Filter, ChevronDown, Upload } from "lucide-react";
import { TimerImportDialog } from "@/components/tracker/TimerImportDialog";
import { useTimerEntries, TimerEntry, useDeleteTimerEntry, useCreateTimerEntry, useMarkTimerEntriesImported } from "@/hooks/useTimerEntries";
import { supabase } from "@/integrations/supabase/client";
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
  const deleteEntry = useDeleteTimerEntry();
  const createEntry = useCreateTimerEntry();
  const markImported = useMarkTimerEntriesImported();
  const [isImporting, setIsImporting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  // Filter states
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [engagementFilter, setEngagementFilter] = useState<string>("all");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [engagementFilterOpen, setEngagementFilterOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

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

    // Apply search filter
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

    // Apply date filter
    if (dateFilter) {
      const filterDateStr = format(dateFilter, "yyyy-MM-dd");
      result = result.filter((entry) => {
        const entryDate = format(new Date(entry.started_at), "yyyy-MM-dd");
        return entryDate === filterDateStr;
      });
    }

    // Apply engagement filter
    if (engagementFilter && engagementFilter !== "all") {
      result = result.filter((entry) => entry.engagement_id === engagementFilter);
    }

    // Apply sorting
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
          case "encargo":
            const engA = a.engagement?.engagement_name || "";
            const engB = b.engagement?.engagement_name || "";
            comparison = engA.localeCompare(engB);
            break;
          case "actividad":
            const actA = a.activity?.description || "";
            const actB = b.activity?.description || "";
            comparison = actA.localeCompare(actB);
            break;
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [entries, searchQuery, dateFilter, engagementFilter, sortColumn, sortDirection]);

  // Calculate totals for footer
  const totalMinutes = filteredEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  const handleDelete = async (entry: TimerEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.is_imported) return;
    
    try {
      await deleteEntry.mutateAsync(entry.timer_id);
      toast.success(t("common.deleted"));
    } catch (error) {
      toast.error(t("common.error"));
    }
  };

  const handleDuplicate = async (entry: TimerEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.is_imported) return;

    try {
      await createEntry.mutateAsync({
        staff_id: entry.staff_id,
        engagement_id: entry.engagement_id,
        activity_id: entry.activity_id,
        description: entry.description,
        started_at: new Date().toISOString(),
      });
      toast.success(t("common.duplicated"));
    } catch (error) {
      toast.error(t("common.error"));
    }
  };

  const handleEdit = (entry: TimerEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/tracker/${entry.timer_id}`);
  };

  const clearDateFilter = () => {
    setDateFilter(undefined);
    setDateFilterOpen(false);
  };

  const clearEngagementFilter = () => {
    setEngagementFilter("all");
    setEngagementFilterOpen(false);
  };

  // Get entries that are ready to import (completed and not already imported)
  const importableEntries = useMemo(() => {
    return entries?.filter(e => e.ended_at && !e.is_imported) || [];
  }, [entries]);

  // Handle import - creates time_entries and marks timer entries as imported
  const handleImport = async (selectedIds: string[]) => {
    if (!staffRecord?.staff_id || selectedIds.length === 0) return;
    
    setIsImporting(true);
    try {
      const entriesToImport = entries?.filter(e => selectedIds.includes(e.timer_id)) || [];
      const importedMappings: { timer_id: string; time_id: string }[] = [];
      
      for (const timerEntry of entriesToImport) {
        // Create time entry
        const dateWorked = format(new Date(timerEntry.started_at), "yyyy-MM-dd");
        const hoursLogged = (timerEntry.duration_minutes || 0) / 60;
        
        const { data: timeEntry, error } = await supabase
          .from('time_entries')
          .insert({
            staff_id: staffRecord.staff_id,
            engagement_id: timerEntry.engagement_id,
            activity_id: timerEntry.activity_id,
            date_worked: dateWorked,
            hours_logged: hoursLogged,
            description: timerEntry.description,
          })
          .select()
          .single();
        
        if (error) throw error;
        
        importedMappings.push({
          timer_id: timerEntry.timer_id,
          time_id: timeEntry.time_id,
        });
      }
      
      // Mark timer entries as imported
      await markImported.mutateAsync(importedMappings);
      
      toast.success(t("tracker.importSuccess", { count: selectedIds.length }));
      setImportDialogOpen(false);
    } catch (error) {
      console.error("Import error:", error);
      toast.error(t("tracker.importError"));
    } finally {
      setIsImporting(false);
    }
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
        {/* Filters Row - only search + button */}
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
          <div className="flex gap-2 w-full sm:w-auto">
            {/* Import to Timesheet button - visible when there are ready entries */}
            {(entries?.filter(e => e.ended_at && !e.is_imported).length || 0) > 0 && (
              <Button
                variant="outline"
                onClick={() => setImportDialogOpen(true)}
                className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0"
              >
                <Upload className="h-4 w-4 mr-2" />
                {t("tracker.importToTimesheet")}
              </Button>
            )}
            <Button
              variant="default"
              onClick={() => navigate("/tracker/new")}
              className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0"
          >
              <Plus className="h-4 w-4 mr-2" />
              {t("tracker.useTimer")}
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
                const canEdit = !entry.is_imported && entry.ended_at;
                
                return (
                  <Card 
                    key={entry.timer_id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/tracker/${entry.timer_id}`)}
                  >
                    <CardContent className="p-4">
                      {/* Primary Info */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {entry.engagement?.engagement_code || "—"} - {entry.engagement?.engagement_name || ""}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {entry.activity?.activity_code || "—"} - {entry.activity?.description || ""}
                          </p>
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
                          {canEdit && (
                            <div className="flex gap-2 pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 min-h-[44px]"
                                onClick={(e) => handleEdit(entry, e)}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                {t("common.edit")}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 min-h-[44px]"
                                onClick={(e) => handleDuplicate(entry, e)}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                {t("common.duplicate")}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="min-h-[44px]"
                                onClick={(e) => handleDelete(entry, e)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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
                    {/* Actividad - 17% */}
                    <TableHead style={{ width: "17%" }} className="text-center border-r border-border">
                      <span 
                        className="cursor-pointer hover:text-foreground flex items-center justify-center gap-1"
                        onClick={() => handleSort("actividad")}
                      >
                        {t("tracker.activity")}
                        {getSortIcon("actividad")}
                      </span>
                    </TableHead>
                    {/* Descripción - 15% */}
                    <TableHead style={{ width: "15%" }} className="text-center border-r border-border">
                      {t("tracker.description")}
                    </TableHead>
                    {/* Estado - 8% */}
                    <TableHead style={{ width: "8%" }} className="text-center border-r border-border">
                      {t("tracker.status")}
                    </TableHead>
                    {/* Acciones - 8% */}
                    <TableHead style={{ width: "8%" }} className="text-center">
                      {t("common.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entriesLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {t("common.noResults")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((entry) => {
                      const date = new Date(entry.started_at);
                      const canEdit = !entry.is_imported && entry.ended_at;

                      return (
                        <TableRow
                          key={entry.timer_id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/tracker/${entry.timer_id}`)}
                        >
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
                            {entry.engagement?.engagement_code || "—"} - {entry.engagement?.engagement_name || ""}
                          </TableCell>
                          {/* Activity */}
                          <TableCell className="truncate max-w-[180px] text-left border-r border-border">
                            {entry.activity?.activity_code || "—"} - {entry.activity?.description || ""}
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
                          {/* Actions */}
                          <TableCell className="text-center">
                            {canEdit && (
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => handleEdit(entry, e)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => handleDuplicate(entry, e)}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={(e) => handleDelete(entry, e)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
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

        {/* Import Dialog */}
        <TimerImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          entries={importableEntries}
          onImport={handleImport}
          isLoading={isImporting}
        />
      </div>
    </AppLayout>
  );
};

export default TrackerList;
