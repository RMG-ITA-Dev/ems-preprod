// Bench tab table. Row navigation is ADMIN-ONLY: /staff/:id renders the
// mutation-capable StaffForm behind auth-only routing, so for
// partner/director the rows are inert — no click handler, no
// cursor-pointer, no tab stop — matching the staff list's admin-only
// navigation. For admins, rows are keyboard-focusable and carry the
// benchRowAria label on the focusable element itself (any icon
// aria-hidden; the datum lives in the accessible name). The muted caption
// surfaces the "as of today" basis. Below md the table renders as stacked
// cards.
//
// Fase 3 (plan v2 §3, issue §11): cada fila muestra categoría + servicio
// para que categorías homónimas de servicios distintos no se confundan.

import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BenchRow } from "@/hooks/scheduler/schedulerGapsData";

export interface BenchTableProps {
  rows: BenchRow[];
  /** ONLY admins navigate — partner/director rows are inert. */
  canNavigate: boolean;
}

function categoryLabel(r: BenchRow): string {
  if (!r.categoryName) return "—";
  return r.serviceName ? `${r.categoryName} · ${r.serviceName}` : r.categoryName;
}

export function BenchTable({ rows, canNavigate }: BenchTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const rowAria = (r: BenchRow) =>
    t("scheduler.gaps.benchRowAria", {
      name: r.staffName,
      allocation: Math.round(r.currentAllocationPct),
    });

  const interactiveProps = (r: BenchRow) =>
    canNavigate
      ? {
          role: "button" as const,
          tabIndex: 0,
          "aria-label": rowAria(r),
          // Token-based focus treatment: the shared TableRow/Card
          // primitives style hover/surface only, so the keyboard-
          // actionable rows must author their own :focus-visible ring —
          // same classes as the L1/L2 Gantt drill-ins; ring-inset keeps
          // it visible inside table-row geometry.
          className:
            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          onClick: () => navigate(`/staff/${r.staffId}`),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate(`/staff/${r.staffId}`);
            }
          },
        }
      : {};

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        {t("scheduler.gaps.benchAsOfToday")}
      </p>

      {/* Desktop: dense table (≥ md) */}
      <div className="hidden md:block">
        <Table className="table-dense text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>{t("scheduler.gaps.table.staff")}</TableHead>
              <TableHead>{t("scheduler.gaps.table.category")}</TableHead>
              <TableHead className="text-right">{t("scheduler.gaps.table.allocation")}</TableHead>
              <TableHead>{t("scheduler.gaps.table.topSkills")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.staffId} {...interactiveProps(r)}>
                <TableCell className="font-medium">{r.staffName}</TableCell>
                <TableCell>{categoryLabel(r)}</TableCell>
                <TableCell className="text-right font-mono">
                  {Math.round(r.currentAllocationPct)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.topSkills.length > 0 ? r.topSkills.join(", ") : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards (< md) */}
      <div className="space-y-2 md:hidden">
        {rows.map((r) => (
          <Card key={r.staffId} className="p-3" {...interactiveProps(r)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{r.staffName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {categoryLabel(r)}
                </p>
              </div>
              <span className="font-mono text-sm text-foreground">
                {Math.round(r.currentAllocationPct)}%
              </span>
            </div>
            {r.topSkills.length > 0 && (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {r.topSkills.join(", ")}
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
