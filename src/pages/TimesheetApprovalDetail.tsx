import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { Loader2, ArrowLeft, Save } from "lucide-react";
import {
  useStaffTimesheetForApproval,
  useBulkApproveTimesheetLines,
  useBulkRejectTimesheetLines,
} from "@/hooks/useTimesheetApprovals";
import { ApprovalTimesheetGrid } from "@/components/timesheet/ApprovalTimesheetGrid";
import type { ApprovalDecision } from "@/components/ui/approval-toggle";
import { format, addDays } from "date-fns";
import { useLanguage } from "@/hooks/useLanguage";
import { parseDateLocal } from "@/lib/timesheetUtils";

const TimesheetApprovalDetail = () => {
  const { periodId } = useParams<{ periodId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentLanguage } = useLanguage();
  const { data: timesheetData, isLoading } = useStaffTimesheetForApproval(periodId || null);
  const bulkApprove = useBulkApproveTimesheetLines();
  const bulkReject = useBulkRejectTimesheetLines();

  const [approvalDecisions, setApprovalDecisions] = useState<Map<string, ApprovalDecision>>(new Map());
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  const handleBack = () => {
    navigate("/timesheet/approvals");
  };

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

  const handleSaveDecisions = () => {
    if (summary.toReject.length > 0) {
      setRejectNotes("");
      setRejectDialogOpen(true);
    } else if (summary.toApprove.length > 0) {
      processDecisions("");
    }
  };

  const processDecisions = (notes: string) => {
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

    Promise.all(promises).then(() => {
      setApprovalDecisions(new Map());
      setRejectDialogOpen(false);
      // Navigate back if all decisions were made
      if (summary.stillPending === 0) {
        navigate("/timesheet/approvals");
      }
    });
  };

  const handleRejectConfirm = () => {
    processDecisions(rejectNotes);
  };

  const formatWeekRange = (weekStartDate: string) => {
    const startDate = parseDateLocal(weekStartDate);
    const endDate = addDays(startDate, 4);
    return `${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`;
  };

  if (isLoading) {
    return (
      <AppLayout title={t("approval.title")}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!timesheetData) {
    return (
      <AppLayout title={t("approval.title")}>
        <div className="text-center py-12 text-muted-foreground">
          {t("common.noResults")}
        </div>
      </AppLayout>
    );
  }

  const staffName = timesheetData.staff.short_name ||
    `${timesheetData.staff.first_name} ${timesheetData.staff.last_name}`;

  const isProcessing = bulkApprove.isPending || bulkReject.isPending;

  return (
    <AppLayout title={t("approval.title")}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="text-xl font-semibold text-foreground">{staffName}</h2>
              <p className="text-sm text-muted-foreground">
                {t("timesheet.week")} {timesheetData.period.week_number}, {timesheetData.period.year}
                {" • "}
                {formatWeekRange(timesheetData.period.week_start_date)}
              </p>
            </div>
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
              onClick={handleSaveDecisions}
              disabled={!hasDecisions || isProcessing}
              className="bg-primary hover:bg-primary/90"
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
    </AppLayout>
  );
};

export default TimesheetApprovalDetail;
