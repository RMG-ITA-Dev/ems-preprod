// By Skill tab table. shadcn Table primitives on the dashboard-dense
// idiom; right-aligned font-mono zero-decimal numerics. Default order is
// the server's total order and the defensive client re-sort mirrors the
// exact tie-breakers (the UI must not undo the server ordering). Below
// the md breakpoint the table renders as stacked cards.
//
// Fase 3 (plan v2 §3, issue §11): la categoría se muestra junto a su
// servicio para que homónimas de servicios distintos no se confundan.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
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
import {
  compareCompetencyShortageRows,
  type CompetencyShortageRow,
} from "@/hooks/scheduler/schedulerGapsData";

const LEVEL_LABEL_KEY: Record<CompetencyShortageRow["minLevel"], string> = {
  Beginner: "staff.competencies.levels.beginner",
  Intermediate: "staff.competencies.levels.intermediate",
  Advanced: "staff.competencies.levels.advanced",
};

export interface SkillShortageTableProps {
  rows: CompetencyShortageRow[];
  truncated: boolean;
}

function categoryLabel(r: CompetencyShortageRow): string {
  return r.serviceName ? `${r.categoryName} · ${r.serviceName}` : r.categoryName;
}

export function SkillShortageTable({ rows, truncated }: SkillShortageTableProps) {
  const { t } = useTranslation();
  const sorted = useMemo(
    () => [...rows].sort(compareCompetencyShortageRows),
    [rows]
  );

  const minLevelHeader = (
    <span className="inline-flex items-center gap-1">
      {t("scheduler.gaps.table.minLevel")}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("scheduler.gaps.minLevelThresholdTooltip")}
            className="text-muted-foreground"
          >
            <Info className="h-3 w-3" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          {t("scheduler.gaps.minLevelThresholdTooltip")}
        </TooltipContent>
      </Tooltip>
    </span>
  );

  return (
    <div>
      {/* Desktop: dense table (≥ md) */}
      <div className="hidden md:block">
        <Table className="table-dense text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>{t("scheduler.gaps.table.category")}</TableHead>
              <TableHead>{t("scheduler.gaps.table.skill")}</TableHead>
              <TableHead>{minLevelHeader}</TableHead>
              <TableHead className="text-right">{t("scheduler.gaps.table.demand")}</TableHead>
              <TableHead className="text-right">{t("scheduler.gaps.table.supply")}</TableHead>
              <TableHead className="text-right">{t("scheduler.gaps.table.deficit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={`${r.categoryId}-${r.skillId}-${r.minLevel}`}>
                <TableCell>{categoryLabel(r)}</TableCell>
                <TableCell>{r.skillName}</TableCell>
                <TableCell>{t(LEVEL_LABEL_KEY[r.minLevel])}</TableCell>
                <TableCell className="text-right font-mono">
                  {Math.round(r.demandCount)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {Math.round(r.supplyCount)}
                </TableCell>
                <TableCell
                  className={
                    r.deficit > 0
                      ? "text-right font-mono font-semibold text-destructive"
                      : "text-right font-mono"
                  }
                >
                  {Math.round(r.deficit)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards (< md) */}
      <div className="space-y-2 md:hidden">
        {sorted.map((r) => (
          <Card key={`${r.categoryId}-${r.skillId}-${r.minLevel}`} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.skillName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {categoryLabel(r)} · {t(LEVEL_LABEL_KEY[r.minLevel])}
                </p>
              </div>
              <span
                className={
                  r.deficit > 0
                    ? "font-mono text-sm font-semibold text-destructive"
                    : "font-mono text-sm text-muted-foreground"
                }
              >
                {Math.round(r.deficit)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("scheduler.gaps.table.demand")}:{" "}
              <span className="font-mono">{Math.round(r.demandCount)}</span>
              {" · "}
              {t("scheduler.gaps.table.supply")}:{" "}
              <span className="font-mono">{Math.round(r.supplyCount)}</span>
            </p>
          </Card>
        ))}
      </div>

      {truncated && (
        <Alert className="mt-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t("scheduler.gaps.truncated")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
