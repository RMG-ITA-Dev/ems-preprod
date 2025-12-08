import { useState } from "react";
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
import { Loader2, ArrowLeft, Check, X } from "lucide-react";
import {
  useStaffTimesheetForApproval,
  useBulkApproveTimesheetLines,
  useBulkRejectTimesheetLines,
} from "@/hooks/useTimesheetApprovals";
import { ApprovalTimesheetGrid } from "@/components/timesheet/ApprovalTimesheetGrid";
import { format, addDays } from "date-fns";
import { useLanguage } from "@/hooks/useLanguage";

const TimesheetApprovalDetail = () => {
  const { periodId } = useParams<{ periodId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentLanguage } = useLanguage();
  const { data: timesheetData, isLoading } = useStaffTimesheetForApproval(periodId || null);
  const bulkApprove = useBulkApproveTimesheetLines();
  const bulkReject = useBulkRejectTimesheetLines();

  const [selectedApprovalIds, setSelectedApprovalIds] = useState<Set<string>>(new Set());
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  const handleBack = () => {
    navigate("/timesheet/approvals");
  };

  const handleApproveSelected = () => {
    if (selectedApprovalIds.size === 0) return;
    bulkApprove.mutate(Array.from(selectedApprovalIds), {
      onSuccess: () => {
        setSelectedApprovalIds(new Set());
        // Navigate back if all approvals are done
        if (timesheetData) {
          const remainingPending = timesheetData.lineApprovals.filter(
            (la) => la.status === "pending" && !selectedApprovalIds.has(la.approval_id)
          );
          if (remainingPending.length === 0) {
            navigate("/timesheet/approvals");
          }
        }
      },
    });
  };

  const handleRejectClick = () => {
    if (selectedApprovalIds.size === 0) return;
    setRejectNotes("");
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = () => {
    bulkReject.mutate(
      { approvalIds: Array.from(selectedApprovalIds), notes: rejectNotes },
      {
        onSuccess: () => {
          setRejectDialogOpen(false);
          setSelectedApprovalIds(new Set());
          // Navigate back if all approvals are done
          if (timesheetData) {
            const remainingPending = timesheetData.lineApprovals.filter(
              (la) => la.status === "pending" && !selectedApprovalIds.has(la.approval_id)
            );
            if (remainingPending.length === 0) {
              navigate("/timesheet/approvals");
            }
          }
        },
      }
    );
  };

  const formatWeekRange = (weekStartDate: string) => {
    const startDate = new Date(weekStartDate);
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

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRejectClick}
              disabled={selectedApprovalIds.size === 0 || bulkReject.isPending}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {bulkReject.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <X className="h-4 w-4 mr-1" />
              {t("approval.rejectSelected")}
            </Button>
            <Button
              onClick={handleApproveSelected}
              disabled={selectedApprovalIds.size === 0 || bulkApprove.isPending}
              className="bg-success hover:bg-success/90 text-success-foreground"
            >
              {bulkApprove.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Check className="h-4 w-4 mr-1" />
              {t("approval.approveSelected")}
            </Button>
          </div>
        </div>

        {/* Timesheet Grid */}
        <ApprovalTimesheetGrid
          weekStartDate={timesheetData.period.week_start_date}
          timeEntries={timesheetData.timeEntries}
          lineApprovals={timesheetData.lineApprovals}
          approvableEngagementIds={timesheetData.approvableEngagementIds}
          selectedApprovalIds={selectedApprovalIds}
          onSelectionChange={setSelectedApprovalIds}
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
                disabled={bulkReject.isPending}
              >
                {bulkReject.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
