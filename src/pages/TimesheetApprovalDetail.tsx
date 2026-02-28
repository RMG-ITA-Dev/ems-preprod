import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import {
  useStaffTimesheetForApproval,
  useBulkApproveTimesheetLines,
  useBulkRejectTimesheetLines,
} from "@/hooks/useTimesheetApprovals";
import type { StaffTimesheetForApproval } from "@/hooks/useTimesheetApprovals";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { ApprovalTimesheetGrid } from "@/components/timesheet/ApprovalTimesheetGrid";
import type { ApprovalDecision } from "@/components/ui/approval-toggle";
import { format, addDays } from "date-fns";
import { useLanguage } from "@/hooks/useLanguage";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { getWeekDisplayInfo } from "@/lib/timesheetWeekDisplay";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";

const TimesheetApprovalDetail = () => {
  const { periodId } = useParams<{ periodId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const { staffRecord } = useCurrentStaff();
  const { data: timesheetData, isLoading } = useStaffTimesheetForApproval(periodId || null);
  const bulkApprove = useBulkApproveTimesheetLines();
  const bulkReject = useBulkRejectTimesheetLines();

  const [approvalDecisions, setApprovalDecisions] = useState<Map<string, ApprovalDecision>>(new Map());
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleDecisionChange = (approvalId: string, decision: ApprovalDecision) => {
    setApprovalDecisions((prev) => {
      const newMap = new Map(prev);
      if (decision === "pending") {
        newMap.delete(approvalId);
      } else {
        newMap.set(approvalId, decision);
      }
      return newMap;
    });
  };

  // Calculate summary
  const summary = useMemo(() => {
    const toApprove: string[] = [];
    const toReject: string[] = [];
    let stillPending = 0;

    if (timesheetData) {
      timesheetData.lineApprovals.forEach((la) => {
        if (la.status === "pending" && timesheetData.approvableEngagementIds.includes(la.engagement_id)) {
          const decision = approvalDecisions.get(la.approval_id);
          if (decision === "approve") {
            toApprove.push(la.approval_id);
          } else if (decision === "reject") {
            toReject.push(la.approval_id);
          } else {
            stillPending++;
          }
        }
      });
    }

    return { toApprove, toReject, stillPending };
  }, [approvalDecisions, timesheetData]);

  const hasDecisions = summary.toApprove.length > 0 || summary.toReject.length > 0;

  // Navigation lock - must be after hasDecisions
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty: hasDecisions });

  const handleBack = () => {
    allowNextNavigation();
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/timesheet/approvals");
    }
  };

  const handleSaveDecisions = () => {
    if (summary.toReject.length > 0) {
      setRejectNotes("");
      setRejectDialogOpen(true);
    } else if (summary.toApprove.length > 0) {
      processDecisions("");
    }
  };

  const processDecisions = async (notes: string) => {
    setIsSaving(true);
    const detailKey = ["staff-timesheet-for-approval", periodId, staffRecord?.staff_id];

    // Snapshot for rollback
    const previousData = queryClient.getQueryData(detailKey);

    // Step A: Optimistic cache update
    queryClient.setQueryData(detailKey, (prev: StaffTimesheetForApproval | null | undefined) => {
      if (!prev) return prev;
      return {
        ...prev,
        lineApprovals: prev.lineApprovals.map((la) => {
          const decision = approvalDecisions.get(la.approval_id);
          if (decision === "approve") return { ...la, status: "approved" as const };
          if (decision === "reject") return { ...la, status: "rejected" as const };
          return la;
        }),
      };
    });

    // Step B: Fire mutations
    const promises: Promise<void>[] = [];

    if (summary.toApprove.length > 0) {
      promises.push(
        new Promise((resolve, reject) => {
          bulkApprove.mutate(summary.toApprove, {
            onSuccess: () => resolve(),
            onError: reject,
          });
        })
      );
    }

    if (summary.toReject.length > 0) {
      promises.push(
        new Promise((resolve, reject) => {
          bulkReject.mutate(
            { approvalIds: summary.toReject, notes },
            {
              onSuccess: () => resolve(),
              onError: reject,
            }
          );
        })
      );
    }

    try {
      // Step C: Await mutations, then sync cache with DB
      await Promise.all(promises);
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.refetchQueries({ queryKey: detailKey, type: "all" });

      // Step D: Clear local state AFTER cache is synced
      setApprovalDecisions(new Map());
      setRejectDialogOpen(false);

      // Step E: Navigate only when all lines resolved
      if (summary.stillPending === 0) {
        allowNextNavigation();
        navigate("/timesheet/approvals");
      }
    } catch (error) {
      // Restore snapshot immediately, then reconcile with DB
      queryClient.setQueryData(detailKey, previousData);
      await queryClient.invalidateQueries({ queryKey: detailKey });
      await queryClient.refetchQueries({ queryKey: detailKey, type: "all" });
      toast.error(t("common.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectConfirm = () => {
    processDecisions(rejectNotes);
  };

  const formatWeekRange = (weekStartDate: string) => {
    const startDate = parseDateLocal(weekStartDate);
    const endDate = addDays(startDate, 4);
    return `${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`;
  };

  // Back button component for reuse across branches
  const BackButton = () => (
    <div className="flex items-center justify-between mb-4">
      <Button variant="outline" onClick={handleBack} className="btn-action">
        <ArrowLeft className="h-4 w-4 mr-1" />
        {t("common.back")}
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <AppLayout title={t("approval.title")} focusMode>
        <BackButton />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
        <LeavePageDialog blocker={blocker} isDirty={false} />
      </AppLayout>
    );
  }

  if (!timesheetData) {
    return (
      <AppLayout title={t("approval.title")} focusMode>
        <BackButton />
        <div className="text-center py-12 text-muted-foreground">
          {t("common.noResults")}
        </div>
        <LeavePageDialog blocker={blocker} isDirty={false} />
      </AppLayout>
    );
  }

  const staffName = timesheetData.staff.short_name ||
    `${timesheetData.staff.first_name} ${timesheetData.staff.last_name}`;

  // Canonical week display — DB week_number/year are non-authoritative for UI
  const weekDisplay = getWeekDisplayInfo(timesheetData.period.week_start_date);

  const isProcessing = bulkApprove.isPending || bulkReject.isPending;

  return (
    <AppLayout title={t("approval.title")} focusMode>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{staffName}</h2>
            <p className="text-sm text-muted-foreground">
              {t("timesheet.week")} {weekDisplay.isValid ? weekDisplay.weekNumber : "\u2014"}, {weekDisplay.isValid ? weekDisplay.fiscalYear : "\u2014"}
              {" • "}
              {formatWeekRange(timesheetData.period.week_start_date)}
            </p>
          </div>

          {/* Summary and Save Button */}
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              <span className="text-success font-medium">{summary.toApprove.length}</span> {t("approval.summary.toApprove")}
              {" • "}
              <span className="text-destructive font-medium">{summary.toReject.length}</span> {t("approval.summary.toReject")}
              {" • "}
              <span className="font-medium">{summary.stillPending}</span> {t("approval.summary.stillPending")}
            </div>
            <Button
              variant="outline"
              onClick={handleBack}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveDecisions}
              disabled={!hasDecisions || isProcessing || isSaving}
              variant="default"
              className="btn-action"
            >
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-1" />
              {t("approval.saveDecisions")}
            </Button>
          </div>
        </div>

        {/* Timesheet Grid */}
        <ApprovalTimesheetGrid
          weekStartDate={timesheetData.period.week_start_date}
          timeEntries={timesheetData.timeEntries}
          lineApprovals={timesheetData.lineApprovals}
          approvableEngagementIds={timesheetData.approvableEngagementIds}
          approvalDecisions={approvalDecisions}
          onDecisionChange={handleDecisionChange}
          lang={currentLanguage}
          engagementBudgets={timesheetData.engagementBudgets}
        />

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("approval.rejectTitle")}</DialogTitle>
              <DialogDescription>
                {t("approval.rejectDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Textarea
                placeholder={t("approval.notesPlaceholder")}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectConfirm}
                disabled={isProcessing}
              >
                {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("approval.confirmReject")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <LeavePageDialog blocker={blocker} isDirty={hasDecisions} />
    </AppLayout>
  );
};

export default TimesheetApprovalDetail;
