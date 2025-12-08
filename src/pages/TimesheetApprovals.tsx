import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search, ChevronRight } from "lucide-react";
import { usePendingApprovalSummaries } from "@/hooks/useTimesheetApprovals";
import { format, addDays } from "date-fns";

const TimesheetApprovals = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: summaries, isLoading } = usePendingApprovalSummaries();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredSummaries = summaries?.filter((summary) => {
    const staffName = summary.staff.short_name || 
      `${summary.staff.first_name} ${summary.staff.last_name}`;
    const searchLower = searchTerm.toLowerCase();
    return staffName.toLowerCase().includes(searchLower);
  });

  const handleRowClick = (periodId: string) => {
    navigate(`/timesheet/approvals/${periodId}`);
  };

  const formatWeekRange = (weekStartDate: string) => {
    const startDate = new Date(weekStartDate);
    const endDate = addDays(startDate, 4); // Monday to Friday
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
            {t("approval.pendingCount", { count: filteredSummaries?.length || 0 })}
          </Badge>
        </div>

        {/* Pending Timesheets List */}
        {filteredSummaries?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("approval.noPending")}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">{t("staff.name")}</TableHead>
                  <TableHead className="font-semibold">{t("timesheet.week")}</TableHead>
                  <TableHead className="font-semibold text-right">
                    {t("approval.horasPendientesAprobacion")}
                  </TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummaries?.map((summary) => (
                  <TableRow
                    key={summary.period_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(summary.period_id)}
                  >
                    <TableCell className="font-medium">
                      {summary.staff.short_name ||
                        `${summary.staff.first_name} ${summary.staff.last_name}`}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground mr-2">
                        {t("timesheet.week")} {summary.week_number}, {summary.year}
                      </span>
                      <span className="text-sm">
                        ({formatWeekRange(summary.week_start_date)})
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {summary.totalPendingHours}h
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TimesheetApprovals;
