import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Check, X, Search } from "lucide-react";
import {
  usePendingApprovals,
  useApproveTimesheetLine,
  useRejectTimesheetLine,
  type LineApproval,
} from "@/hooks/useTimesheetApprovals";
import { format } from "date-fns";

const TimesheetApprovals = () => {
  const { t } = useTranslation();
  const { data: pendingApprovals, isLoading } = usePendingApprovals();
  const approveLine = useApproveTimesheetLine();
  const rejectLine = useRejectTimesheetLine();

  const [searchTerm, setSearchTerm] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<LineApproval | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const filteredApprovals = pendingApprovals?.filter((approval) => {
    const staffName = approval.period?.staff
      ? `${approval.period.staff.first_name} ${approval.period.staff.last_name}`
      : "";
    const engagementName = approval.engagement?.engagement_name || "";
    const engagementCode = approval.engagement?.engagement_code || "";
    const searchLower = searchTerm.toLowerCase();

    return (
      staffName.toLowerCase().includes(searchLower) ||
      engagementName.toLowerCase().includes(searchLower) ||
      engagementCode.toLowerCase().includes(searchLower)
    );
  });

  const handleApprove = (approvalId: string) => {
    approveLine.mutate(approvalId);
  };

  const handleRejectClick = (approval: LineApproval) => {
    setSelectedApproval(approval);
    setRejectNotes("");
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = () => {
    if (selectedApproval) {
      rejectLine.mutate(
        { approvalId: selectedApproval.approval_id, notes: rejectNotes },
        {
          onSuccess: () => {
            setRejectDialogOpen(false);
            setSelectedApproval(null);
            setRejectNotes("");
          },
        }
      );
    }
  };

  // Group approvals by staff and week
  const groupedApprovals = filteredApprovals?.reduce((acc, approval) => {
    const key = `${approval.period?.staff_id}-${approval.period?.week_start_date}`;
    if (!acc[key]) {
      acc[key] = {
        staff: approval.period?.staff,
        weekStart: approval.period?.week_start_date,
        weekNumber: approval.period?.week_number,
        year: approval.period?.year,
        lines: [],
      };
    }
    acc[key].lines.push(approval);
    return acc;
  }, {} as Record<string, { staff: any; weekStart: string | undefined; weekNumber: number | undefined; year: number | undefined; lines: LineApproval[] }>);

  if (isLoading) {
    return (
      <AppLayout title={t("approval.title")}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("approval.title")}>
      <div className="space-y-6">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("approval.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Stats */}
        <div className="flex gap-4">
          <Badge variant="secondary" className="text-sm py-1 px-3">
            {t("approval.pendingCount", { count: filteredApprovals?.length || 0 })}
          </Badge>
        </div>

        {/* Grouped Approvals */}
        {Object.entries(groupedApprovals || {}).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("approval.noPending")}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedApprovals || {}).map(([key, group]) => (
              <div key={key} className="bg-card rounded-xl border border-border overflow-hidden">
                {/* Group Header */}
                <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-foreground">
                      {group.staff?.short_name ||
                        `${group.staff?.first_name} ${group.staff?.last_name}`}
                    </span>
                    <span className="text-muted-foreground ml-3">
                      {t("timesheet.week")} {group.weekNumber}, {group.year}
                    </span>
                    {group.weekStart && (
                      <span className="text-muted-foreground ml-2 text-sm">
                        ({format(new Date(group.weekStart), "dd/MM/yyyy")})
                      </span>
                    )}
                  </div>
                  <Badge variant="outline">{group.lines.length} {t("approval.lines")}</Badge>
                </div>

                {/* Lines Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("approval.engagement")}</TableHead>
                      <TableHead className="text-right">{t("approval.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.lines.map((line) => (
                      <TableRow key={line.approval_id}>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground mr-2">
                            {line.engagement?.engagement_code}
                          </span>
                          {line.engagement?.engagement_name}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-success hover:text-success hover:bg-success/10"
                              onClick={() => handleApprove(line.approval_id)}
                              disabled={approveLine.isPending}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              {t("approval.approve")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleRejectClick(line)}
                              disabled={rejectLine.isPending}
                            >
                              <X className="h-4 w-4 mr-1" />
                              {t("approval.reject")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}

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
                disabled={rejectLine.isPending}
              >
                {rejectLine.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("approval.confirmReject")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default TimesheetApprovals;
