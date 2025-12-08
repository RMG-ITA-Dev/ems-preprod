import { useTranslation } from "react-i18next";
import { format, parseISO, isToday, isYesterday, startOfDay } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { Trash2, Copy, Edit2, Check, Import } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TimerEntry } from "@/hooks/useTimerEntries";

interface TrackerEntryListProps {
  entries: TimerEntry[];
  onDelete: (id: string) => void;
  onDuplicate: (entry: TimerEntry) => void;
  onEdit: (entry: TimerEntry) => void;
}

export function TrackerEntryList({
  entries,
  onDelete,
  onDuplicate,
  onEdit,
}: TrackerEntryListProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "es" ? es : enUS;

  // Group entries by date
  const groupedEntries = entries.reduce((groups, entry) => {
    const date = startOfDay(parseISO(entry.started_at)).toISOString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
    return groups;
  }, {} as Record<string, TimerEntry[]>);

  const formatDateHeader = (dateStr: string): string => {
    const date = parseISO(dateStr);
    if (isToday(date)) return t("tracker.today");
    if (isYesterday(date)) return t("tracker.yesterday");
    return format(date, "EEEE, d MMMM", { locale });
  };

  const formatTimeRange = (entry: TimerEntry): string => {
    const start = format(parseISO(entry.started_at), "HH:mm");
    if (!entry.ended_at) return `${start} - ...`;
    const end = format(parseISO(entry.ended_at), "HH:mm");
    return `${start} - ${end}`;
  };

  const formatDuration = (minutes: number | null): string => {
    if (!minutes) return "0:00";
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hrs > 0 ? `${hrs}:${mins.toString().padStart(2, "0")}` : `0:${mins.toString().padStart(2, "0")}`;
  };

  if (entries.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <div className="max-w-sm mx-auto">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <Import className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">{t("tracker.emptyState.title")}</h3>
          <p className="text-muted-foreground text-sm">
            {t("tracker.emptyState.description")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedEntries)
        .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
        .map(([dateStr, dayEntries]) => {
          const totalMinutes = dayEntries.reduce(
            (sum, e) => sum + (e.duration_minutes || 0),
            0
          );

          return (
            <div key={dateStr} className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Date Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b border-border">
                <span className="font-medium">{formatDateHeader(dateStr)}</span>
                <span className="text-sm text-muted-foreground font-mono">
                  {t("tracker.totalTime")}: {formatDuration(totalMinutes)}
                </span>
              </div>

              {/* Entries Table */}
              <Table className="table-dense">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">{t("tracker.time")}</TableHead>
                    <TableHead className="w-[80px]">{t("tracker.duration")}</TableHead>
                    <TableHead>{t("tracker.engagement")}</TableHead>
                    <TableHead>{t("tracker.activity")}</TableHead>
                    <TableHead>{t("tracker.description")}</TableHead>
                    <TableHead className="w-[80px]">{t("tracker.status")}</TableHead>
                    <TableHead className="w-[100px] text-right">{t("tracker.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayEntries.map((entry) => (
                    <TableRow key={entry.timer_id}>
                      <TableCell className="font-mono text-xs">
                        {formatTimeRange(entry)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatDuration(entry.duration_minutes)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {entry.engagement?.engagement_code || entry.engagement?.engagement_name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{entry.activity?.activity_code}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
                          {entry.description || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {entry.is_imported ? (
                          <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                            <Check className="h-3 w-3 mr-1" />
                            {t("tracker.imported")}
                          </Badge>
                        ) : entry.ended_at ? (
                          <Badge variant="outline" className="text-xs">
                            {t("tracker.ready")}
                          </Badge>
                        ) : (
                          <Badge className="text-xs bg-success text-success-foreground animate-pulse">
                            {t("tracker.running")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {!entry.is_imported && entry.ended_at && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => onEdit(entry)}
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("common.edit")}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => onDuplicate(entry)}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("tracker.duplicate")}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => onDelete(entry.timer_id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("common.delete")}</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        })}
    </div>
  );
}
