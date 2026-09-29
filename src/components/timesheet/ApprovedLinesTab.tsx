import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search, RotateCcw } from "lucide-react";
import { format, addDays } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { getWeekDisplayInfo } from "@/lib/timesheetWeekDisplay";
import {
  useApprovedApprovalGroups,
  useRequestTimesheetReversal,
  useExecuteTimesheetReversal,
  type ApprovedApprovalGroup,
} from "@/hooks/useTimesheetReversals";
import { TimesheetReversalDialog } from "./TimesheetReversalDialog";

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
  const { data: groups, isLoading } = useApprovedApprovalGroups();
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

  const formatWeekRange = (weekStartDate: string) => {
    const startDate = parseDateLocal(weekStartDate);
    const endDate = addDays(startDate, 4);
    return `${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`;
  };

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("approval.searchPlaceholder")}
            value={staffSearch}
            onChange={(e) => setStaffSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Input
          placeholder={t("timesheet.engagement")}
          value={engagementSearch}
          onChange={(e) => setEngagementSearch(e.target.value)}
          className="max-w-xs"
        />
        <Input
          type="date"
          value={weekFilter}
          onChange={(e) => setWeekFilter(e.target.value)}
          className="max-w-[180px]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t("approval.noPending")}</div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold text-center border-r border-border">{t("staff.name")}</TableHead>
                <TableHead className="font-semibold text-center border-r border-border">{t("timesheet.week")}</TableHead>
                <TableHead className="font-semibold text-center border-r border-border">{t("timesheet.engagement")}</TableHead>
                <TableHead className="font-semibold text-center border-r border-border">{t("approval.lines")}</TableHead>
                {(canRequestReversal || isAdmin) && (
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
                      <span className="text-sm">({formatWeekRange(group.week_start_date)})</span>
                    </TableCell>
                    <TableCell className="text-left border-r border-border">
                      {group.engagement.engagement_code ? `${group.engagement.engagement_code} - ` : ""}
                      {group.engagement.engagement_name}
                    </TableCell>
                    <TableCell className="text-center border-r border-border">
                      {group.approvedLineCount}
                    </TableCell>
                    {(canRequestReversal || isAdmin) && (
                      <TableCell className="text-center">
                        {isAdmin ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActiveGroup(group);
                              setDialogMode("revert");
                            }}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            {t("approval.revert")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActiveGroup(group);
                              setDialogMode("request");
                            }}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            {t("approval.requestReversal")}
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
      )}

      <TimesheetReversalDialog
        open={activeGroup !== null}
        onOpenChange={(next) => {
          if (!next) closeDialog();
        }}
        onConfirm={handleConfirm}
        isPending={requestReversal.isPending || executeReversal.isPending}
        confirmLabel={dialogMode === "revert" ? t("approval.revert") : t("approval.requestReversal")}
      />
    </div>
  );
}
