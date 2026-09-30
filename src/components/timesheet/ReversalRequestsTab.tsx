import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Check, X } from "lucide-react";
import {
  useMyReversalRequests,
  useReversalRequests,
  useExecuteTimesheetReversal,
  useRejectTimesheetReversal,
  type ReversalRequest,
} from "@/hooks/useTimesheetReversals";
import { TimesheetReversalDialog } from "./TimesheetReversalDialog";
import { ReversalFiltersBar, ReversalErrorState, formatReversalWeekRange } from "./reversalShared";

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

function engagementLabel(r: ReversalRequest, weekScopeLabel: string) {
  return r.engagement
    ? `${r.engagement.engagement_code ? r.engagement.engagement_code + " - " : ""}${r.engagement.engagement_name}`
    : weekScopeLabel;
}

function MyRequestsView() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useMyReversalRequests();
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
        <div className="text-center py-12 text-muted-foreground">{t("approval.noReversalRequests")}</div>
      ) : (
        <>
          {/* Desktop: tabla (>= md) */}
          <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
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
                      {r.period ? formatReversalWeekRange(r.period.week_start_date) : "—"}
                    </TableCell>
                    <TableCell className="text-left border-r border-border">
                      {engagementLabel(r, t("approval.reversalScope.week"))}
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

          {/* Mobile: tarjetas (< md) */}
          <div className="space-y-2 md:hidden">
            {filtered.map((r) => (
              <Card key={r.request_id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {r.period ? formatReversalWeekRange(r.period.week_start_date) : "—"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {engagementLabel(r, t("approval.reversalScope.week"))}
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(r.status)} className="shrink-0">
                    {t(`approval.reversalStatus.${r.status}`)}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{r.reason}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function QueueView() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useReversalRequests({ status: "pending" });
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

  const openDialog = (request: ReversalRequest, mode: "execute" | "reject") => {
    setActiveRequest(request);
    setDialogMode(mode);
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

  if (isError) {
    return <ReversalErrorState onRetry={() => refetch()} />;
  }

  const actions = (r: ReversalRequest, layout: "row" | "stack") => (
    <div className={layout === "row" ? "space-x-2" : "flex gap-2 mt-2"}>
      <Button
        size="sm"
        variant="outline"
        className={layout === "stack" ? "flex-1" : undefined}
        onClick={() => openDialog(r, "execute")}
      >
        <Check className="h-4 w-4 mr-1" />
        {t("approval.executeRequest")}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        className={layout === "stack" ? "flex-1" : undefined}
        onClick={() => openDialog(r, "reject")}
      >
        <X className="h-4 w-4 mr-1" />
        {t("approval.rejectRequest")}
      </Button>
    </div>
  );

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
                      {r.period ? formatReversalWeekRange(r.period.week_start_date) : "—"}
                    </TableCell>
                    <TableCell className="text-left border-r border-border">
                      {engagementLabel(r, t("approval.reversalScope.week"))}
                    </TableCell>
                    <TableCell className="text-left border-r border-border">{r.reason}</TableCell>
                    <TableCell className="text-center">{actions(r, "row")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: tarjetas (< md) */}
          <div className="space-y-2 md:hidden">
            {filtered.map((r) => (
              <Card key={r.request_id} className="p-3">
                <p className="truncate text-sm font-medium text-foreground">
                  {r.period?.staff
                    ? r.period.staff.short_name || `${r.period.staff.first_name} ${r.period.staff.last_name}`
                    : "—"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.period ? formatReversalWeekRange(r.period.week_start_date) : "—"}
                  {" · "}
                  {engagementLabel(r, t("approval.reversalScope.week"))}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{r.reason}</p>
                {actions(r, "stack")}
              </Card>
            ))}
          </div>
        </>
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
