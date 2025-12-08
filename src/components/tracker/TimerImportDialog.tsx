import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { Import, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { TimerEntry } from "@/hooks/useTimerEntries";

interface TimerImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: TimerEntry[];
  onImport: (selectedIds: string[]) => void;
  isLoading: boolean;
}

export function TimerImportDialog({
  open,
  onOpenChange,
  entries,
  onImport,
  isLoading,
}: TimerImportDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "es" ? es : enUS;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map((e) => e.timer_id)));
    }
  };

  const totalMinutes = useMemo(() => {
    return entries
      .filter((e) => selectedIds.has(e.timer_id))
      .reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
  }, [entries, selectedIds]);

  const formatDuration = (minutes: number | null): string => {
    if (!minutes) return "0:00";
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hrs > 0
      ? `${hrs}:${mins.toString().padStart(2, "0")}`
      : `0:${mins.toString().padStart(2, "0")}`;
  };

  const handleImport = () => {
    onImport(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Import className="h-5 w-5" />
            {t("tracker.importTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("tracker.importDescription")}
          </DialogDescription>
        </DialogHeader>

        {entries.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {t("tracker.noEntriesToImport")}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto border rounded-md">
              <Table className="table-dense">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedIds.size === entries.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>{t("tracker.date")}</TableHead>
                    <TableHead>{t("tracker.duration")}</TableHead>
                    <TableHead>{t("tracker.engagement")}</TableHead>
                    <TableHead>{t("tracker.activity")}</TableHead>
                    <TableHead>{t("tracker.description")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow
                      key={entry.timer_id}
                      className={selectedIds.has(entry.timer_id) ? "bg-muted/50" : ""}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(entry.timer_id)}
                          onCheckedChange={() => toggleSelect(entry.timer_id)}
                        />
                      </TableCell>
                      <TableCell>
                        {format(parseISO(entry.started_at), "dd/MM", { locale })}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatDuration(entry.duration_minutes)}
                      </TableCell>
                      <TableCell>
                        {entry.engagement?.engagement_code ||
                          entry.engagement?.engagement_name}
                      </TableCell>
                      <TableCell>{entry.activity?.activity_code}</TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {entry.description || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {t("tracker.selectedEntries", { count: selectedIds.size })} •{" "}
                <span className="font-mono font-medium">
                  {formatDuration(totalMinutes)}
                </span>{" "}
                {t("tracker.hours")}
              </div>
              <Badge variant="outline" className="text-sm">
                {t("tracker.willAddToTimesheet")}
              </Badge>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedIds.size === 0 || isLoading}
            style={{ backgroundColor: "hsl(var(--brand-purple))" }}
          >
            <Check className="h-4 w-4 mr-2" />
            {t("tracker.importSelected")} ({selectedIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
