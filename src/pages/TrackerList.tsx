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
import { Plus, Search, Pencil, Copy, Trash2 } from "lucide-react";
import { useTimerEntries, TimerEntry, useDeleteTimerEntry, useCreateTimerEntry } from "@/hooks/useTimerEntries";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useEngagements } from "@/hooks/useEmsData";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const TrackerList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentLanguage } = useLanguage();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { data: entries, isLoading: entriesLoading } = useTimerEntries();
  const { data: engagements } = useEngagements();
  const deleteEntry = useDeleteTimerEntry();
  const createEntry = useCreateTimerEntry();

  const [searchQuery, setSearchQuery] = useState("");
  const [engagementFilter, setEngagementFilter] = useState<string>("all");

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

  const filteredEntries = useMemo(() => {
    return entries?.filter((entry) => {
      const matchesSearch =
        !searchQuery ||
        entry.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.engagement?.engagement_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.engagement?.engagement_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.activity?.activity_code?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesEngagement =
        engagementFilter === "all" || entry.engagement_id === engagementFilter;

      return matchesSearch && matchesEngagement;
    }) || [];
  }, [entries, searchQuery, engagementFilter]);

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
          <AlertDescription>{t("timesheet.noStaffRecord")}</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("tracker.listTitle")}>
      <div className="space-y-4">
        {/* Filters Row */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3 flex-1">
            <div className="relative min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("tracker.searchPlaceholder")}
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={engagementFilter} onValueChange={setEngagementFilter}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t("tracker.engagement")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")} {t("tracker.engagement")}</SelectItem>
                {engagementOptions.map((eng) => (
                  <SelectItem key={eng.id} value={eng.id}>
                    {eng.code} - {eng.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => navigate("/tracker/new")}
            className="btn-action"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("tracker.useTimer")}
          </Button>
        </div>

        {/* Data Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="table-dense">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-24">{t("tracker.date")}</TableHead>
                  <TableHead className="w-28">{t("tracker.time")}</TableHead>
                  <TableHead className="w-20 text-right">{t("tracker.duration")}</TableHead>
                  <TableHead className="min-w-[200px]">{t("tracker.engagement")}</TableHead>
                  <TableHead className="min-w-[160px]">{t("tracker.activity")}</TableHead>
                  <TableHead className="min-w-[120px]">{t("tracker.description")}</TableHead>
                  <TableHead className="w-24">{t("tracker.status")}</TableHead>
                  <TableHead className="w-24 text-center">{t("common.actions")}</TableHead>
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
                        <TableCell className="font-mono text-muted-foreground">
                          {format(date, "dd/MM/yyyy", { locale: currentLanguage === "es" ? es : undefined })}
                        </TableCell>
                        {/* Time Range */}
                        <TableCell className="font-mono">
                          {formatTimeRange(entry.started_at, entry.ended_at)}
                        </TableCell>
                        {/* Duration */}
                        <TableCell className="text-right font-mono">
                          {formatDuration(entry.duration_minutes)}
                        </TableCell>
                        {/* Engagement */}
                        <TableCell className="font-medium truncate max-w-[220px]">
                          {entry.engagement?.engagement_code || "—"} - {entry.engagement?.engagement_name || ""}
                        </TableCell>
                        {/* Activity */}
                        <TableCell className="truncate max-w-[180px]">
                          {entry.activity?.activity_code || "—"} - {entry.activity?.description || ""}
                        </TableCell>
                        {/* Description */}
                        <TableCell className="truncate max-w-[140px]">
                          {entry.description || "—"}
                        </TableCell>
                        {/* Status */}
                        <TableCell>
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

        {/* Footer Totals */}
        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border rounded-lg">
          <span className="text-sm font-medium text-muted-foreground">
            {t("tracker.totalTime")}
          </span>
          <span className="font-mono font-bold">
            {totalHours} {t("tracker.hours")}
          </span>
        </div>
      </div>
    </AppLayout>
  );
};

export default TrackerList;
