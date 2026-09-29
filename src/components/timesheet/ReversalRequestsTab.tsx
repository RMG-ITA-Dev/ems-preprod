import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
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
import { Loader2, Search, Check, X } from "lucide-react";
import { format, addDays } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";
import {
  useMyReversalRequests,
  useReversalRequests,
  useExecuteTimesheetReversal,
  useRejectTimesheetReversal,
  type ReversalRequest,
} from "@/hooks/useTimesheetReversals";
import { TimesheetReversalDialog } from "./TimesheetReversalDialog";

interface ReversalRequestsTabProps {
  /** "mine": seguimiento propio (aprobador). "queue": cola del admin (ejecutar/rechazar). */
  mode: "mine" | "queue";
}

function statusBadgeVariant(status: ReversalRequest["status"]): "secondary" | "default" | "destructive" {
  if (status === "executed") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
}

interface RequestFilters {
  staffSearch: string;
  engagementSearch: string;
  weekFilter: string;
}

function useFilteredRequests(requests: ReversalRequest[] | undefined, filters: RequestFilters) {
  return (requests ?? []).filter((r) => {
    if (filters.staffSearch && r.period?.staff) {
      const staffName =
        r.period.staff.short_name || `${r.period.staff.first_name} ${r.period.staff.last_name}`;
      if (!staffName.toLowerCase().includes(filters.staffSearch.toLowerCase())) return false;
    }
    if (filters.engagementSearch) {
      const engName = `${r.engagement?.engagement_code ?? ""} ${r.engagement?.engagement_name ?? ""}`.toLowerCase();
      if (!engName.includes(filters.engagementSearch.toLowerCase())) return false;
    }
    if (filters.weekFilter && r.period?.week_start_date !== filters.weekFilter) return false;
    return true;
  });
}

function RequestFiltersBar({
  staffSearch,
  setStaffSearch,
  engagementSearch,
  setEngagementSearch,
  weekFilter,
  setWeekFilter,
}: {
  staffSearch: string;
  setStaffSearch: (v: string) => void;
  engagementSearch: string;
  setEngagementSearch: (v: string) => void;
  weekFilter: string;
  setWeekFilter: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
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
  );
}

function formatWeekRange(weekStartDate: string) {
  const startDate = parseDateLocal(weekStartDate);
  const endDate = addDays(startDate, 4);
  return `${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`;
}

function MyRequestsView() {
  const { t } = useTranslation();
  const { data, isLoading } = useMyReversalRequests();
  const [staffSearch, setStaffSearch] = useState("");
  const [engagementSearch, setEngagementSearch] = useState("");
  const [weekFilter, setWeekFilter] = useState("");
  const filtered = useFilteredRequests(data, { staffSearch, engagementSearch, weekFilter });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RequestFiltersBar
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
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold text-center border-r border-border">{t("timesheet.week")}</TableHead>
                <TableHead className="font-semibold text-center border-r border-border">{t("timesheet.engagement")}</TableHead>
                <TableHead className="font-semibold text-center border-r border-border">{t("approval.rejectionNote")}</TableHead>
                <TableHead className="font-semibold text-center">{t("approval.decision.title")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.request_id}>
                  <TableCell className="text-left border-r border-border">
                    {r.period ? formatWeekRange(r.period.week_start_date) : "—"}
                  </TableCell>
                  <TableCell className="text-left border-r border-border">
                    {r.engagement
                      ? `${r.engagement.engagement_code ? r.engagement.engagement_code + " - " : ""}${r.engagement.engagement_name}`
                      : t("approval.reversalScope.week")}
                  </TableCell>
                  <TableCell className="text-left border-r border-border">{r.reason}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={statusBadgeVariant(r.status)}>
                      {t(`approval.reversalStatus.${r.status}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function QueueView() {
  const { t } = useTranslation();
  const { data, isLoading } = useReversalRequests({ status: "pending" });
  const [staffSearch, setStaffSearch] = useState("");
  const [engagementSearch, setEngagementSearch] = useState("");
  const [weekFilter, setWeekFilter] = useState("");
  const filtered = useFilteredRequests(data, { staffSearch, engagementSearch, weekFilter });

  const executeReversal = useExecuteTimesheetReversal();
  const rejectReversal = useRejectTimesheetReversal();
  const [activeRequest, setActiveRequest] = useState<ReversalRequest | null>(null);
  const [dialogMode, setDialogMode] = useState<"execute" | "reject" | null>(null);

  const closeDialog = () => {
    setActiveRequest(null);
    setDialogMode(null);
  };

  const handleConfirm = (reason: string) => {
    if (!activeRequest) return;
    if (dialogMode === "execute") {
      executeReversal.mutate(
        {
          periodId: activeRequest.period_id,
          scope: activeRequest.scope,
          engagementId: activeRequest.engagement_id,
          reason,
          requestId: activeRequest.request_id,
        },
        { onSuccess: closeDialog }
      );
    } else if (dialogMode === "reject") {
      rejectReversal.mutate(
        { requestId: activeRequest.request_id, notes: reason },
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
      <RequestFiltersBar
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
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold text-center border-r border-border">{t("staff.name")}</TableHead>
                <TableHead className="font-semibold text-center border-r border-border">{t("timesheet.week")}</TableHead>
                <TableHead className="font-semibold text-center border-r border-border">{t("timesheet.engagement")}</TableHead>
                <TableHead className="font-semibold text-center border-r border-border">{t("approval.rejectionNote")}</TableHead>
                <TableHead className="w-10 text-center">{t("approval.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.request_id}>
                  <TableCell className="font-medium text-left border-r border-border">
                    {r.period?.staff
                      ? r.period.staff.short_name || `${r.period.staff.first_name} ${r.period.staff.last_name}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-left border-r border-border">
                    {r.period ? formatWeekRange(r.period.week_start_date) : "—"}
                  </TableCell>
                  <TableCell className="text-left border-r border-border">
                    {r.engagement
                      ? `${r.engagement.engagement_code ? r.engagement.engagement_code + " - " : ""}${r.engagement.engagement_name}`
                      : t("approval.reversalScope.week")}
                  </TableCell>
                  <TableCell className="text-left border-r border-border">{r.reason}</TableCell>
                  <TableCell className="text-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActiveRequest(r);
                        setDialogMode("execute");
                      }}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {t("approval.executeRequest")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setActiveRequest(r);
                        setDialogMode("reject");
                      }}
                    >
                      <X className="h-4 w-4 mr-1" />
                      {t("approval.rejectRequest")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TimesheetReversalDialog
        open={activeRequest !== null}
        onOpenChange={(next) => {
          if (!next) closeDialog();
        }}
        onConfirm={handleConfirm}
        isPending={executeReversal.isPending || rejectReversal.isPending}
        confirmLabel={dialogMode === "reject" ? t("approval.rejectRequest") : t("approval.executeRequest")}
      />
    </div>
  );
}

export function ReversalRequestsTab({ mode }: ReversalRequestsTabProps) {
  return mode === "mine" ? <MyRequestsView /> : <QueueView />;
}
