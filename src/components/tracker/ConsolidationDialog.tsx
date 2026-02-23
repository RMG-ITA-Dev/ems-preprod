import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PreflightAnalysis } from "@/lib/timerExportUtils";

interface ConsolidationDialogProps {
  open: boolean;
  analysis: PreflightAnalysis | null;
  previousAnalysis?: PreflightAnalysis | null;
  onIncludeAllMatching: () => void;
  onExcludeConflicting: () => void;
  onProceed: () => void;
  onCancel: () => void;
}

function isChangedConflict(
  key: string,
  previous: PreflightAnalysis | null | undefined
): boolean {
  if (!previous) return false;
  const prevConflict = previous.conflicts.find((c) => c.key === key);
  if (!prevConflict) return true; // new conflict
  return false; // simplified; full membership check handled by analysisEquals
}

export function ConsolidationDialog({
  open,
  analysis,
  previousAnalysis,
  onIncludeAllMatching,
  onExcludeConflicting,
  onProceed,
  onCancel,
}: ConsolidationDialogProps) {
  const { t } = useTranslation();

  if (!analysis) return null;

  const hasConflicts = analysis.hasConflicts;
  const formatDate = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return format(new Date(y, m - 1, day), "dd/MM/yyyy");
  };

  const formatHours = (minutes: number) =>
    (Math.round((minutes / 60) * 10) / 10).toString();

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasConflicts
              ? t("tracker.consolidation.conflictTitle")
              : t("tracker.consolidation.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasConflicts
              ? t("tracker.consolidation.conflictDescription")
              : t("tracker.consolidation.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Info mode: consolidation preview */}
        {!hasConflicts && analysis.preview.mergedGroups.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t("tracker.consolidation.groupHeader")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("tracker.consolidation.reason")}
            </p>
            <div className="border rounded-lg overflow-hidden">
              <Table className="table-dense">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t("tracker.consolidation.date")}</TableHead>
                    <TableHead>{t("tracker.consolidation.engagement")}</TableHead>
                    <TableHead>{t("tracker.consolidation.activity")}</TableHead>
                    <TableHead className="text-right">#</TableHead>
                    <TableHead className="text-right">
                      {t("tracker.hours")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.preview.mergedGroups.map((g) => (
                    <TableRow key={g.key}>
                      <TableCell className="font-mono">
                        {formatDate(g.dateWorked)}
                      </TableCell>
                      <TableCell>{g.engagementCode}</TableCell>
                      <TableCell>{g.activityCode}</TableCell>
                      <TableCell className="text-right font-mono">
                        {g.entryCount}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatHours(g.totalMinutes)}h
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Conflict mode: split-group conflicts table */}
        {hasConflicts && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-destructive">
              {t("tracker.consolidation.noPartialPush")}
            </p>
            <div className="border rounded-lg overflow-hidden">
              <Table className="table-dense">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t("tracker.consolidation.date")}</TableHead>
                    <TableHead>{t("tracker.consolidation.engagement")}</TableHead>
                    <TableHead>{t("tracker.consolidation.activity")}</TableHead>
                    <TableHead className="text-right">
                      {t("tracker.consolidation.selected")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("tracker.consolidation.unselected")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.conflicts.map((c) => {
                    const changed = isChangedConflict(c.key, previousAnalysis);
                    return (
                      <TableRow
                        key={c.key}
                        className={
                          changed
                            ? "animate-pulse bg-warning/20"
                            : ""
                        }
                      >
                        <TableCell className="font-mono">
                          {formatDate(c.dateWorked)}
                        </TableCell>
                        <TableCell>{c.engagementCode}</TableCell>
                        <TableCell>{c.activityCode}</TableCell>
                        <TableCell className="text-right font-mono">
                          {c.selectedEntries.length} ({formatHours(c.selectedMinutes)}h)
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {c.unselectedEntries.length} ({formatHours(c.unselectedMinutes)}h)
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          {hasConflicts ? (
            <>
              <Button
                onClick={onIncludeAllMatching}
                className="flex-1"
                title={t("tracker.consolidation.includeAllHint")}
              >
                {t("tracker.consolidation.includeAll")}
              </Button>
              <Button
                variant="outline"
                onClick={onExcludeConflicting}
                className="flex-1"
                title={t("tracker.consolidation.excludeConflictingHint")}
              >
                {t("tracker.consolidation.excludeConflicting")}
              </Button>
              <AlertDialogCancel onClick={onCancel}>
                {t("tracker.consolidation.cancel")}
              </AlertDialogCancel>
            </>
          ) : (
            <>
              <Button onClick={onProceed}>
                {t("tracker.consolidation.proceed")}
              </Button>
              <AlertDialogCancel onClick={onCancel}>
                {t("tracker.consolidation.cancel")}
              </AlertDialogCancel>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
