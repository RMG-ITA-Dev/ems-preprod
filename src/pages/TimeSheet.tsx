import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Lock } from "lucide-react";
import { WeekNavigator } from "@/components/timesheet/WeekNavigator";
import { TimesheetGrid } from "@/components/timesheet/TimesheetGrid";
import { useTimesheetPolicies } from "@/hooks/useTimesheetPolicies";
import { useTimesheetWeek } from "@/hooks/useTimesheetWeek";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import {
  useSubmitTimesheet,
  useSaveTimesheetDraft,
} from "@/hooks/useTimesheetMutations";
import {
  getWeekInfo,
  getWeekMonday,
  getPreviousWeek,
  getNextWeek,
  calculateDeadline,
  isEditableStatus,
  type TimesheetStatus,
} from "@/lib/timesheetUtils";

const TimeSheet = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  // Get current staff
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();

  // Get policies
  const { data: policies } = useTimesheetPolicies();
  const workDays = policies?.workDays ?? 5;
  const monthEndRule = policies?.monthEndRule ?? "COMPLETE_SPANNING_WEEK";
  const autoSaveSeconds = policies?.autoSaveSeconds ?? 3;

  // Week navigation state - start with current week
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    getWeekMonday(new Date())
  );

  // Compute week info and deadline
  const weekInfo = useMemo(
    () => getWeekInfo(currentWeekStart, workDays, lang),
    [currentWeekStart, workDays, lang]
  );

  const deadlineInfo = useMemo(
    () => calculateDeadline(currentWeekStart, workDays, monthEndRule),
    [currentWeekStart, workDays, monthEndRule]
  );

  // Fetch timesheet data for the week
  const {
    period,
    entries,
    engagements,
    activities,
    isLoading,
    isError,
    error,
  } = useTimesheetWeek(currentWeekStart, workDays);

  // Mutations
  const submitTimesheet = useSubmitTimesheet();
  const saveDraft = useSaveTimesheetDraft();

  // Week navigation handlers
  const handlePreviousWeek = () => {
    setCurrentWeekStart(getPreviousWeek(currentWeekStart));
  };

  const handleNextWeek = () => {
    setCurrentWeekStart(getNextWeek(currentWeekStart));
  };

  // Check if timesheet is editable
  const periodStatus = (period?.status || "open") as TimesheetStatus;
  const isEditable = isEditableStatus(periodStatus) && !period?.is_period_locked;

  // Handle submit
  const handleSubmit = () => {
    if (period?.period_id) {
      submitTimesheet.mutate(period.period_id);
    }
  };

  // Handle save draft
  const handleSaveDraft = () => {
    if (period?.period_id) {
      saveDraft.mutate(period.period_id);
    }
  };

  // Loading state
  if (staffLoading || isLoading) {
    return (
      <AppLayout title={t("timesheet.title")}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // No staff record linked
  if (!staffRecord) {
    return (
      <AppLayout title={t("timesheet.title")}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("timesheet.noStaffRecord")}</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  // Error state
  if (isError) {
    return (
      <AppLayout title={t("timesheet.title")}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || "Error loading timesheet data"}
          </AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("timesheet.title")}>
      <div className="space-y-6">
        {/* Week Navigation */}
        <WeekNavigator
          weekInfo={weekInfo}
          deadlineInfo={deadlineInfo}
          currentWeekStart={currentWeekStart}
          onPreviousWeek={handlePreviousWeek}
          onNextWeek={handleNextWeek}
          onWeekSelect={setCurrentWeekStart}
        />

        {/* Locked indicator */}
        {!isEditable && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>{t("timesheet.periodLocked")}</AlertDescription>
          </Alert>
        )}

        {/* No engagements warning */}
        {engagements.length === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("timesheet.noEngagements")}</AlertDescription>
          </Alert>
        )}

        {/* Time Entry Grid */}
        <TimesheetGrid
          weekDates={weekInfo.weekDates}
          entries={entries}
          engagements={engagements}
          activities={activities}
          staffId={staffRecord.staff_id}
          periodId={period?.period_id || null}
          isLocked={!isEditable}
          autoSaveSeconds={autoSaveSeconds}
          lang={lang}
        />

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            className="btn-action"
            onClick={handleSaveDraft}
            disabled={!isEditable || saveDraft.isPending}
          >
            {saveDraft.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {t("timesheet.saveDraft")}
          </Button>
          <Button
            className="bg-brand-purple hover:bg-brand-purple/90 text-primary-foreground btn-action"
            onClick={handleSubmit}
            disabled={!isEditable || submitTimesheet.isPending}
          >
            {submitTimesheet.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {t("timesheet.submitWeek")}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default TimeSheet;
