import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Lock, Save, RotateCcw, Check } from "lucide-react";
import { WeekNavigator } from "@/components/timesheet/WeekNavigator";
import { TimesheetGrid } from "@/components/timesheet/TimesheetGrid";
import { useTimesheetPolicies } from "@/hooks/useTimesheetPolicies";
import { useTimesheetWeek } from "@/hooks/useTimesheetWeek";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { usePeriodLineApprovals } from "@/hooks/useTimesheetApprovals";
import { useSubmitTimesheet, useUnsubmitTimesheet } from "@/hooks/useTimesheetMutations";
import { supabase } from "@/integrations/supabase/client";
import {
  getWeekInfo,
  getWeekMonday,
  getPreviousWeek,
  getNextWeek,
  calculateDeadline,
} from "@/lib/timesheetUtils";

type SaveStatus = "idle" | "saving" | "saved";

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

  // Save status state (BUG #29)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Manual save trigger
  const [saveNowTrigger, setSaveNowTrigger] = useState(0);

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

  // Fetch line approvals for the current period
  const { data: lineApprovals } = usePeriodLineApprovals(period?.period_id || null);

  // Mutations
  const submitTimesheet = useSubmitTimesheet();
  const unsubmitTimesheet = useUnsubmitTimesheet();

  // Week navigation handlers
  const handlePreviousWeek = () => {
    setCurrentWeekStart(getPreviousWeek(currentWeekStart));
  };

  const handleNextWeek = () => {
    setCurrentWeekStart(getNextWeek(currentWeekStart));
  };

  // BUG #32: Updated editability logic
  const isSubmitted = !!period?.submitted_at;
  const hasRejectedLines = lineApprovals?.some((la) => la.status === "rejected");
  const hasPendingLines = lineApprovals?.some((la) => la.status === "pending");
  const isFullyApproved = lineApprovals?.length > 0 && 
    lineApprovals.every((la) => la.status === "approved");
  
  // Check if this is the current week
  const isCurrentWeek = useMemo(() => {
    const today = getWeekMonday(new Date());
    return currentWeekStart.getTime() === today.getTime();
  }, [currentWeekStart]);

  // Editable if:
  // - Not submitted and not locked, OR
  // - Submitted but has pending/rejected lines AND is current week (can make corrections)
  const isEditable = (!isSubmitted && !period?.is_period_locked) || 
    (isSubmitted && !isFullyApproved && isCurrentWeek && (hasPendingLines || hasRejectedLines));

  // Can unsubmit if submitted, has pending lines, and is current week
  const canUnsubmit = isSubmitted && hasPendingLines && isCurrentWeek && !isFullyApproved;

  // Handle submit
  const handleSubmit = async () => {
    if (!period?.period_id || !staffRecord) return;

    // Get unique engagement IDs from entries
    const uniqueEngagementIds = [...new Set(entries.map((e) => e.engagement_id))];
    
    if (uniqueEngagementIds.length === 0) return;

    // Check if staff is auto-approved (Partner/Director)
    const { data: isAutoApproved } = await supabase
      .rpc("is_auto_approved_category", { p_staff_id: staffRecord.staff_id });

    submitTimesheet.mutate({
      periodId: period.period_id,
      staffId: staffRecord.staff_id,
      engagementIds: uniqueEngagementIds,
      isAutoApproved: isAutoApproved || false,
    });
  };

  // Handle unsubmit (BUG #32)
  const handleUnsubmit = () => {
    if (!period?.period_id) return;
    unsubmitTimesheet.mutate({ periodId: period.period_id });
  };

  // Handle save draft (BUG #29)
  const handleSaveDraft = useCallback(() => {
    setSaveNowTrigger((prev) => prev + 1);
  }, []);

  // Callback from TimesheetGrid when save status changes
  const handleSaveStatusChange = useCallback((status: SaveStatus) => {
    setSaveStatus(status);
    if (status === "saved") {
      setLastSavedAt(new Date());
    }
  }, []);

  // Format last saved time
  const formatLastSaved = () => {
    if (!lastSavedAt) return null;
    return lastSavedAt.toLocaleTimeString(lang === "es" ? "es-BO" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
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

        {/* Locked/Submitted indicator */}
        {(period?.is_period_locked || isSubmitted) && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              {period?.is_period_locked 
                ? t("timesheet.periodLocked")
                : isFullyApproved 
                  ? t("timesheet.fullyApproved")
                  : hasRejectedLines
                    ? t("timesheet.hasRejections")
                    : t("timesheet.pendingApproval")}
            </AlertDescription>
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
          lineApprovals={lineApprovals || []}
          onSaveStatusChange={handleSaveStatusChange}
          saveNowTrigger={saveNowTrigger}
        />

        {/* Actions */}
        <div className="flex items-center justify-between">
          {/* Save Status Indicator (BUG #29) */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {saveStatus === "saving" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("timesheet.saving")}</span>
              </>
            )}
            {saveStatus === "saved" && lastSavedAt && (
              <>
                <Check className="h-4 w-4 text-success" />
                <span>{t("timesheet.saved")} {formatLastSaved()}</span>
              </>
            )}
            {saveStatus === "idle" && (
              <span className="text-xs">{t("timesheet.autoSaveHint")}</span>
            )}
          </div>

          <div className="flex gap-3">
            {/* Unsubmit Button (BUG #32) */}
            {canUnsubmit && (
              <Button
                variant="outline"
                onClick={handleUnsubmit}
                disabled={unsubmitTimesheet.isPending}
              >
                {unsubmitTimesheet.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                <RotateCcw className="h-4 w-4 mr-2" />
                {t("timesheet.unsubmit")}
              </Button>
            )}

            {/* Save Draft Button (BUG #29) */}
            {isEditable && (
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={saveStatus === "saving"}
              >
                <Save className="h-4 w-4 mr-2" />
                {t("timesheet.saveDraft")}
              </Button>
            )}

            <Button
              className="bg-brand-purple hover:bg-brand-purple/90 text-primary-foreground btn-action"
              onClick={handleSubmit}
              disabled={!isEditable || submitTimesheet.isPending || entries.length === 0}
            >
              {submitTimesheet.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {t("timesheet.submitWeek")}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default TimeSheet;
