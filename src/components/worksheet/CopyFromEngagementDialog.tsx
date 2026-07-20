import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Search, Copy, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useWorksheets,
  useWorksheetById,
  WorksheetCell,
} from "@/hooks/useWorksheetData";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { cn } from "@/lib/utils";

interface CopyFromEngagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentWorksheetId: string;
  practica: number | null;
  onApply: (cells: WorksheetCell[]) => void;
}

export function CopyFromEngagementDialog({
  open,
  onOpenChange,
  currentWorksheetId,
  practica,
  onApply,
}: CopyFromEngagementDialogProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: worksheets, isLoading: loadingList } = useWorksheets(open);
  const { data: selectedWorksheet, isLoading: loadingCells } = useWorksheetById(
    selectedId ?? undefined,
  );
  const { staffRecord } = useCurrentStaff();

  const filteredWorksheets = useMemo(() => {
    if (!worksheets) return [];
    const q = search.toLowerCase();
    return worksheets
      .filter((w) => w.id !== currentWorksheetId)
      .filter((w) => w.created_by_staff_id === staffRecord?.staff_id)
      .filter((w) => (w.engagement?.practica ?? null) === practica)
      .filter((w) => {
        if (!q) return true;
        const name = w.engagement?.engagement_name?.toLowerCase() ?? "";
        const client =
          w.engagement?.client?.client_legal_name?.toLowerCase() ?? "";
        const code = w.engagement?.engagement_code?.toLowerCase() ?? "";
        const industry =
          w.engagement?.client?.industry?.industry_name?.toLowerCase() ?? "";
        const date = w.created_at
          ? format(new Date(w.created_at), "dd/MM/yyyy").toLowerCase()
          : "";
        return name.includes(q) || client.includes(q) || code.includes(q) || industry.includes(q) || date.includes(q);
      });
  }, [worksheets, currentWorksheetId, search, staffRecord?.staff_id, practica]);

  const totalHours = useMemo(
    () =>
      selectedWorksheet?.cells.reduce((sum, c) => sum + c.budget_hours, 0) ?? 0,
    [selectedWorksheet],
  );

  const activitiesWithHours = useMemo(() => {
    if (!selectedWorksheet?.cells) return 0;
    return new Set(
      selectedWorksheet.cells
        .filter((c) => c.budget_hours > 0)
        .map((c) => c.activity_id),
    ).size;
  }, [selectedWorksheet]);

  const handleApply = () => {
    if (!selectedWorksheet?.cells) return;
    onApply(selectedWorksheet.cells);
    handleClose();
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedId(null);
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("workMatrix.copyDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("workMatrix.copyDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("workMatrix.copySearchPlaceholder")}
              aria-label={t("workMatrix.copySearchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-64 border rounded-lg">
            {loadingList ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredWorksheets.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t("common.noResults")}
              </div>
            ) : (
              <div className="p-1">
                {filteredWorksheets.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedId(w.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-md text-sm hover:bg-muted transition-colors flex items-start gap-2",
                      selectedId === w.id &&
                        "bg-primary/10 hover:bg-primary/15",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium overflow-hidden text-ellipsis whitespace-nowrap w-full">
                        {w.engagement?.engagement_code
                          ? `${w.engagement.engagement_code} – ${w.engagement.engagement_name}`
                          : w.engagement?.engagement_name}{" "}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap justify-between">
                        <p className="text-xs text-muted-foreground truncate">
                          {w.engagement?.client?.client_legal_name}
                        </p>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 shrink-0"
                        >
                          {t(`workMatrix.status.${w.status}`)}
                        </Badge>
                      </div>
                    </div>
                    {selectedId === w.id && (
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {selectedId && (
            <div
              className={cn(
                "rounded-lg border px-4 py-3 text-sm",
                totalHours === 0 && !loadingCells
                  ? "border-warning bg-warning/10 text-warning"
                  : "bg-muted/30",
              )}
            >
              {loadingCells ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t("common.loading")}</span>
                </div>
              ) : totalHours === 0 ? (
                <p data-testid="copy-no-hours-alert">{t("workMatrix.copyNoHours")}</p>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <span>
                    <span className="font-semibold">
                      {totalHours.toFixed(1)}h
                    </span>{" "}
                    {t("workMatrix.copyTotalHoursLabel")}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">
                    {t("workMatrix.copyActivitiesLabel", {
                      count: activitiesWithHours,
                    })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="items-center shrink-0">
          <p className="text-xs text-muted-foreground mr-auto">
            {t("workMatrix.copyReplaceWarning")}
          </p>
          <Button variant="outline" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleApply}
            disabled={!selectedId || loadingCells || totalHours === 0}
          >
            <Copy className="h-4 w-4 mr-2" />
            {t("workMatrix.copyConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
