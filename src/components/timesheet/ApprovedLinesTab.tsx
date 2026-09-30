import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RotateCcw } from "lucide-react";
import { getWeekDisplayInfo } from "@/lib/timesheetWeekDisplay";
import {
  useApprovedApprovalGroups,
  useRequestTimesheetReversal,
  useExecuteTimesheetReversal,
  type ApprovedApprovalGroup,
} from "@/hooks/useTimesheetReversals";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { TimesheetReversalDialog } from "./TimesheetReversalDialog";
import { ReversalFiltersBar, ReversalErrorState, formatReversalWeekRange } from "./reversalShared";

interface ApprovedLinesTabProps {
  /** El usuario tiene timesheet_approval.approve: puede SOLICITAR reversión de encargo. */
  canRequestReversal: boolean;
  /** El usuario es admin: puede EJECUTAR (revertir directo) sin pasar por una solicitud. */
  isAdmin: boolean;
}

// 0923-209 §c.5: grupos (staff x encargo x semana) con >=1 línea aprobada. Tres perfiles:
// sólo lectura (ni canRequestReversal ni isAdmin), aprobador (Solicitar reversión), admin
// (Revertir directo). Filtros por usuario/semana/encargo aplican para los tres.
export function ApprovedLinesTab({ canRequestReversal, isAdmin }: ApprovedLinesTabProps) {
  const { t } = useTranslation();
  const { data: groups, isLoading, isError, refetch } = useApprovedApprovalGroups();
  const [staffSearch, setStaffSearch] = useState("");
  const [engagementSearch, setEngagementSearch] = useState("");
  const [weekFilter, setWeekFilter] = useState("");
  const [activeGroup, setActiveGroup] = useState<ApprovedApprovalGroup | null>(null);
  const [dialogMode, setDialogMode] = useState<"request" | "revert" | null>(null);

  const requestReversal = useRequestTimesheetReversal();
  const executeReversal = useExecuteTimesheetReversal();

  const filtered = (groups ?? []).filter((g) => {
    const staffName = g.staff.short_name || `${g.staff.first_name} ${g.staff.last_name}`;
    if (staffSearch && !staffName.toLowerCase().includes(staffSearch.toLowerCase())) return false;
    if (engagementSearch) {
      const engName = `${g.engagement.engagement_code ?? ""} ${g.engagement.engagement_name}`.toLowerCase();
      if (!engName.includes(engagementSearch.toLowerCase())) return false;
    }
    if (weekFilter && g.week_start_date !== weekFilter) return false;
    return true;
  });

  const showActions = canRequestReversal || isAdmin;

  // Elegibilidad por grupo (review iteración 10, hallazgo #2): request_timesheet_reversal delega
  // en can_approve_timesheet_line, que sólo autoriza al gerente/socio del encargo. El admin
  // (Revertir) no depende del encargo.
  const { staffRecord } = useCurrentStaff();
  const canActOnGroup = (group: ApprovedApprovalGroup) =>
    isAdmin ||
    (canRequestReversal &&
      !!staffRecord?.staff_id &&
      (group.engagement.manager_id === staffRecord.staff_id ||
        group.engagement.partner_id === staffRecord.staff_id));

  const closeDialog = () => {
    setActiveGroup(null);
    setDialogMode(null);
  };

  const handleConfirm = (reason: string) => {
    if (!activeGroup) return;
    if (dialogMode === "request") {
      requestReversal.mutate(
        {
          periodId: activeGroup.period_id,
          scope: "engagement",
          engagementId: activeGroup.engagement_id,
          reason,
        },
        { onSuccess: closeDialog }
      );
    } else if (dialogMode === "revert") {
      executeReversal.mutate(
        {
          periodId: activeGroup.period_id,
          scope: "engagement",
          engagementId: activeGroup.engagement_id,
          reason,
        },
        { onSuccess: closeDialog }
      );
    }
  };

  const openDialog = (group: ApprovedApprovalGroup) => {
    setActiveGroup(group);
    setDialogMode(isAdmin ? "revert" : "request");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return <ReversalErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      <ReversalFiltersBar
        staffSearch={staffSearch}
        setStaffSearch={setStaffSearch}
        engagementSearch={engagementSearch}
        setEngagementSearch={setEngagementSearch}
        weekFilter={weekFilter}
        setWeekFilter={setWeekFilter}
      />

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t("approval.noPending")}</div>
      ) : (
        <>
          {/* Desktop: tabla (>= md) */}
          <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold text-center border-r border-border">{t("staff.name")}</TableHead>
                  <TableHead className="font-semibold text-center border-r border-border">{t("timesheet.week")}</TableHead>
                  <TableHead className="font-semibold text-center border-r border-border">{t("timesheet.engagement")}</TableHead>
                  <TableHead className="font-semibold text-center border-r border-border">{t("approval.lines")}</TableHead>
                  {showActions && (
                    <TableHead className="w-10 text-center">{t("approval.actions")}</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((group) => {
                  const weekDisplay = getWeekDisplayInfo(group.week_start_date);
                  const key = `${group.period_id}:${group.engagement_id}`;
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium text-left border-r border-border">
                        {group.staff.short_name || `${group.staff.first_name} ${group.staff.last_name}`}
                      </TableCell>
                      <TableCell className="text-left border-r border-border">
                        <span className="text-muted-foreground mr-2">
                          {t("timesheet.week")} {weekDisplay.isValid ? weekDisplay.weekNumber : "—"}, {weekDisplay.isValid ? weekDisplay.fiscalYear : "—"}
                        </span>
                        <span className="text-sm">({formatReversalWeekRange(group.week_start_date)})</span>
                      </TableCell>
                      <TableCell className="text-left border-r border-border">
                        {group.engagement.engagement_code ? `${group.engagement.engagement_code} - ` : ""}
                        {group.engagement.engagement_name}
                      </TableCell>
                      <TableCell className="text-right font-mono border-r border-border">
                        {group.approvedLineCount}
                      </TableCell>
                      {showActions && (
                        <TableCell className="text-center">
                          {canActOnGroup(group) && (
                            <Button size="sm" variant="outline" onClick={() => openDialog(group)}>
                              <RotateCcw className="h-4 w-4 mr-1" />
                              {isAdmin ? t("approval.revert") : t("approval.requestReversal")}
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: tarjetas (< md) */}
          <div className="space-y-2 md:hidden">
            {filtered.map((group) => {
              const weekDisplay = getWeekDisplayInfo(group.week_start_date);
              const key = `${group.period_id}:${group.engagement_id}`;
              return (
                <Card key={key} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {group.staff.short_name || `${group.staff.first_name} ${group.staff.last_name}`}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t("timesheet.week")} {weekDisplay.isValid ? weekDisplay.weekNumber : "—"}, {weekDisplay.isValid ? weekDisplay.fiscalYear : "—"}
                        {" "}({formatReversalWeekRange(group.week_start_date)})
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {group.engagement.engagement_code ? `${group.engagement.engagement_code} - ` : ""}
                        {group.engagement.engagement_name}
                      </p>
                    </div>
                    <span className="font-mono text-sm text-foreground shrink-0">
                      {group.approvedLineCount} {t("approval.lines")}
                    </span>
                  </div>
                  {showActions && canActOnGroup(group) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => openDialog(group)}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      {isAdmin ? t("approval.revert") : t("approval.requestReversal")}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      <TimesheetReversalDialog
        open={activeGroup !== null}
        onOpenChange={(next) => {
          if (!next) closeDialog();
        }}
        onConfirm={handleConfirm}
        isPending={requestReversal.isPending || executeReversal.isPending}
        confirmLabel={dialogMode === "revert" ? t("approval.revert") : t("approval.requestReversal")}
        title={dialogMode === "revert" ? t("approval.revertDialogTitle") : undefined}
        description={dialogMode === "revert" ? t("approval.revertDialogDescription") : undefined}
      />
    </div>
  );
}
