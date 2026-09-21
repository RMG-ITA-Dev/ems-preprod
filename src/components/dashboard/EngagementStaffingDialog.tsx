import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildStaffingRows } from "@/components/dashboard/tabs/encargoOverviewAggregation";
import { formatShortDate } from "@/components/dashboard/tabs/partnerOverviewAggregation";
import type { StaffingPerson, StaffingWeek } from "@/components/dashboard/tabs/encargoOverviewTypes";

// dash_encargo (bugs/dashboard/encargo/plan_v2.md §4.5/§5.3/§7.4): navega las 9 semanas YA
// PRECARGADAS en el payload de engagement_overview() -- offset en memoria, [-4, +4], sin
// ninguna llamada a Supabase al mover las flechas (elimina el 3er RPC de la síntesis v1).
// "Cargado"/"Utilizado" cambian con la semana vista; "Asignado" y la alerta de semana en
// cero son del total de la asignación y NUNCA cambian (decisiones.md §4.5) -- por eso viven
// en people[] separado de weeks[].rows[] y buildStaffingRows() los cruza sin duplicarlos.

interface EngagementStaffingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: StaffingPerson[];
  weeks: StaffingWeek[];
}

const MIN_OFFSET = -4;
const MAX_OFFSET = 4;

export function EngagementStaffingDialog({ open, onOpenChange, people, weeks }: EngagementStaffingDialogProps) {
  const { t, i18n } = useTranslation();
  const [offset, setOffset] = useState(0);

  // Abre siempre en la semana actual (offset=0), sin importar dónde quedó la última vez.
  useEffect(() => {
    if (open) setOffset(0);
  }, [open]);

  const week = weeks.find((w) => w.offset === offset);
  const rows = buildStaffingRows(people, week);
  const weekRangeLabel = week
    ? `${formatShortDate(week.week_start, i18n.language)} - ${formatShortDate(week.week_end, i18n.language)}`
    : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("dashboard.encargo.staffing.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dashboard.encargo.staffing.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={t("dashboard.encargo.staffing.previousWeek")}
            disabled={offset <= MIN_OFFSET}
            onClick={() => setOffset((o) => Math.max(MIN_OFFSET, o - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {t("dashboard.encargo.staffing.weekLabel", { week: week?.week_number ?? "—", range: weekRangeLabel })}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("dashboard.encargo.staffing.nextWeek")}
            disabled={offset >= MAX_OFFSET}
            onClick={() => setOffset((o) => Math.min(MAX_OFFSET, o + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs">{t("dashboard.encargo.hoursDetail.staffName")}</TableHead>
              <TableHead className="text-xs">{t("dashboard.encargo.hoursDetail.category")}</TableHead>
              <TableHead className="text-xs text-right">{t("dashboard.encargo.staffing.loaded")}</TableHead>
              <TableHead className="text-xs text-right">{t("dashboard.encargo.staffing.utilized")}</TableHead>
              <TableHead className="text-xs text-right">{t("dashboard.encargo.staffing.assigned")}</TableHead>
              <TableHead className="text-xs text-center" aria-label={t("dashboard.encargo.staffing.zeroWeekAlert")} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.staff_id} className="text-sm">
                  <TableCell className="py-2">{row.display_name}</TableCell>
                  <TableCell className="py-2 text-muted-foreground">{row.category_name ?? "—"}</TableCell>
                  <TableCell className="py-2 text-right font-mono">{Math.round(row.logged_hours)}</TableCell>
                  <TableCell className="py-2 text-right font-mono">{Math.round(row.used_hours)}</TableCell>
                  <TableCell className="py-2 text-right font-mono">
                    {row.assigned_hours === 0 ? (
                      <span title={t("dashboard.encargo.staffing.unassignedHours")}>0</span>
                    ) : (
                      Math.round(row.assigned_hours)
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    {row.zero_week_alert && (
                      <AlertTriangle
                        className="h-3.5 w-3.5 text-warning inline-block"
                        aria-label={t("dashboard.encargo.staffing.zeroWeekAlert")}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-4">
                  {t("dashboard.encargo.staffing.noRows")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
