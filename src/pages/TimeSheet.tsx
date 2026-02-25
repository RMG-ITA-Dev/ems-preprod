import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Lock, Save, RotateCcw, Check, AlertTriangle, Copy, ArrowLeft } from "lucide-react";
import { WeekNavigator } from "@/components/timesheet/WeekNavigator";
import { TimesheetGrid } from "@/components/timesheet/TimesheetGrid";
import { useHolidaysForWeek, useHolidayEngagementId } from "@/hooks/useHolidays";
import { useAdminActivityId } from "@/hooks/useAdminActivity";
import { useTimesheetPolicies } from "@/hooks/useTimesheetPolicies";
import { useTimesheetWeek } from "@/hooks/useTimesheetWeek";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useAuth } from "@/hooks/useAuth";
import { usePeriodLineApprovals } from "@/hooks/useTimesheetApprovals";
import { useSubmitTimesheet, useUnsubmitTimesheet, useCopyPreviousWeek } from "@/hooks/useTimesheetMutations";
import { useGlobalSettings } from "@/hooks/useEmsData";
import { supabase } from "@/integrations/supabase/client";
import { parseISO, isBefore, startOfDay } from "date-fns";
import {
  getWeekInfo,
  getWeekMonday,
  getPreviousWeek,
  getNextWeek,
  calculateDeadline,
  toISODateString,
} from "@/lib/timesheetUtils";

type SaveStatus = "idle" | "saving" | "saved";

const TimeSheet = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const navigate = useNavigate();
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  // Get current staff
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();

  // Get policies
  const { data: policies } = useTimesheetPolicies();
  const { data: globalSettings } = useGlobalSettings();
  const workDays = policies?.workDays ?? 5;
  const monthEndRule = policies?.monthEndRule ?? "COMPLETE_SPANNING_WEEK";
  const autoSaveSeconds = policies?.autoSaveSeconds ?? 3;

  // BUG #13: Get hour limits from global settings
  const dailyMin = useMemo(() => {
    const setting = globalSettings?.find((s) => s.setting_key === "DAILY_MIN");
    return setting ? parseFloat(setting.setting_value) : 8;
  }, [globalSettings]);

  const dailyMax = useMemo(() => {
    const setting = globalSettings?.find((s) => s.setting_key === "DAILY_MAX");
    return setting ? parseFloat(setting.setting_value) : 8;
  }, [globalSettings]);

  const weeklyMin = useMemo(() => {
    const setting = globalSettings?.find((s) => s.setting_key === "WEEKLY_MIN");
    return setting ? parseFloat(setting.setting_value) : 40;
  }, [globalSettings]);

  const weeklyMax = useMemo(() => {
    const setting = globalSettings?.find((s) => s.setting_key === "WEEKLY_MAX");
    return setting ? parseFloat(setting.setting_value) : 40;
  }, [globalSettings]);


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

  // BUG #0213-33: Weekly limit submission guard
  const weeklyGrandTotal = useMemo(() => {
    return entries.reduce((sum, e) => sum + Number(e.hours_logged ?? 0), 0);
  }, [entries]);

  const isBelowWeeklyMin = weeklyGrandTotal < weeklyMin;
  const isAboveWeeklyMax = weeklyGrandTotal > weeklyMax;
  const isWeeklyOutOfBounds = isBelowWeeklyMin || isAboveWeeklyMax;

  // Holiday data for the current week
  const holidayMap = useHolidaysForWeek(weekInfo.weekDates);
  const holidayEngagementId = useHolidayEngagementId();
  const adminActivityId = useAdminActivityId();

  // Compute activityNotRequiredIds from engagement data
  const activityNotRequiredIds = useMemo(() => {
    const ids = new Set<string>();
    engagements.forEach(e => {
      if (!e.activity_required) ids.add(e.engagement_id);
    });
    return ids;
  }, [engagements]);
  // Fetch line approvals for the current period
  const { data: lineApprovals } = usePeriodLineApprovals(period?.period_id || null);

  // BUG #0206-3: Check if previous week was submitted (for Copy button gating)
  const previousWeekStart = useMemo(() => getPreviousWeek(currentWeekStart), [currentWeekStart]);

  const { data: previousPeriod } = useQuery({
    queryKey: ["timesheet-period-prev", staffRecord?.staff_id, toISODateString(previousWeekStart)],
    queryFn: async () => {
      const { data } = await supabase
        .from("timesheet_periods")
        .select("period_id, submitted_at, is_period_locked")
        .eq("staff_id", staffRecord!.staff_id)
        .eq("week_start_date", toISODateString(previousWeekStart))
        .maybeSingle();
      return data;
    },
    enabled: !!staffRecord?.staff_id,
    staleTime: 5 * 60 * 1000,
  });

  const prevWeekSubmittedOrApproved = !!previousPeriod?.submitted_at;

  // (Timer import removed — export now happens from Registros de Tiempo list)

  // Mutations
  const submitTimesheet = useSubmitTimesheet();
  const unsubmitTimesheet = useUnsubmitTimesheet();
  const copyPreviousWeek = useCopyPreviousWeek();

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

  const isFutureWeek = useMemo(() => {
    const today = getWeekMonday(new Date());
    return currentWeekStart.getTime() > today.getTime();
  }, [currentWeekStart]);

  const isWithinEditableWindow = useMemo(() => {
    if (isCurrentWeek || isFutureWeek) return true;
    const retroDays = policies?.employeeRetroDays ?? 30;
    const today = new Date();
    const weekEnd = weekInfo.weekDates[weekInfo.weekDates.length - 1];
    const daysSinceWeekEnd = Math.floor(
      (today.getTime() - weekEnd.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceWeekEnd <= retroDays;
  }, [isCurrentWeek, isFutureWeek, currentWeekStart, policies?.employeeRetroDays, weekInfo.weekDates]);

  // BUG #22: Check if week is before staff's hire date
  const isBeforeHireDate = useMemo(() => {
    if (!staffRecord?.hire_date) return false;
    const hireDate = parseISO(staffRecord.hire_date);
    const weekEnd = weekInfo.weekDates[weekInfo.weekDates.length - 1];
    return isBefore(startOfDay(weekEnd), startOfDay(hireDate));
  }, [staffRecord?.hire_date, weekInfo.weekDates]);

  // BUG #5: Per-day lock map for mid-week hire dates
  const lockedDaysBeforeHire = useMemo(() => {
    if (!staffRecord?.hire_date) return new Set<number>();
    const hireDate = parseISO(staffRecord.hire_date);
    const locked = new Set<number>();
    weekInfo.weekDates.forEach((date, index) => {
      if (isBefore(startOfDay(date), startOfDay(hireDate))) {
        locked.add(index);
      }
    });
    return locked;
  }, [staffRecord?.hire_date, weekInfo.weekDates]);

  // Termination date: check if entire week is after termination_date
  const isAfterTerminationDate = useMemo(() => {
    if (!staffRecord?.termination_date) return false;
    const termDate = parseISO(staffRecord.termination_date);
    const weekStart = weekInfo.weekDates[0];
    return isBefore(startOfDay(termDate), startOfDay(weekStart));
  }, [staffRecord?.termination_date, weekInfo.weekDates]);

  // Per-day lock map for mid-week termination dates
  const lockedDaysAfterTermination = useMemo(() => {
    if (!staffRecord?.termination_date) return new Set<number>();
    const termDate = parseISO(staffRecord.termination_date);
    const locked = new Set<number>();
    weekInfo.weekDates.forEach((date, index) => {
      if (isBefore(startOfDay(termDate), startOfDay(date))) {
        locked.add(index);
      }
    });
    return locked;
  }, [staffRecord?.termination_date, weekInfo.weekDates]);

  // BUG #5: Earliest navigable week based on hire date
  const earliestWeekStart = useMemo(() => {
    if (!staffRecord?.hire_date) return undefined;
    return getWeekMonday(parseISO(staffRecord.hire_date));
  }, [staffRecord?.hire_date]);

  // Latest navigable week based on termination date
  const latestWeekStart = useMemo(() => {
    if (!staffRecord?.termination_date) return undefined;
    return getWeekMonday(parseISO(staffRecord.termination_date));
  }, [staffRecord?.termination_date]);

  // Editable if:
  // - Not submitted and not locked, OR
  // - Submitted but has pending/rejected lines AND is current week (can make corrections)
  // - AND not before hire date (BUG #22)
  const isEditable = !isBeforeHireDate && !isAfterTerminationDate && isWithinEditableWindow &&
    !isSubmitted && !isFullyApproved && !period?.is_period_locked;

  // BUG #0206-3: Dedicated button visibility flags (decoupled from isEditable/lineApprovals)
  const hasNonZeroEntry = entries.some((e) => e.hours_logged > 0);

  const canCopyPreviousWeek = !isBeforeHireDate
    && !isAfterTerminationDate
    && isWithinEditableWindow
    && !isSubmitted
    && !period?.is_period_locked
    && prevWeekSubmittedOrApproved;

  const canUnsubmit = isSubmitted
    && !isFullyApproved
    && isWithinEditableWindow
    && !period?.is_period_locked;

  const canSaveDraft = !isBeforeHireDate
    && !isAfterTerminationDate
    && isWithinEditableWindow
    && !isSubmitted
    && !isFullyApproved
    && !period?.is_period_locked
    && hasNonZeroEntry;

  // BUG #21: Separate "can submit" from "can edit cells"
  // BUG #0213-33: Also gate on weekly limit
  const canSubmit = !isBeforeHireDate && !isAfterTerminationDate && isWithinEditableWindow && entries.length > 0 &&
    !isSubmitted && !period?.is_period_locked && !isWeeklyOutOfBounds;

  // Handle submit
  const handleSubmit = async () => {
    // DEFENSE-IN-DEPTH: weekly limit guard (do NOT rely only on canSubmit)
    if (isWeeklyOutOfBounds) return;
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

  // Handle unsubmit (BUG #32, guard BUG #0206-3)
  const handleUnsubmit = () => {
    if (!canUnsubmit || !period?.period_id) return;
    unsubmitTimesheet.mutate({ periodId: period.period_id });
  };

  // BUG #12: Handle copy previous week (guard BUG #0206-3)
  const handleCopyPreviousWeek = () => {
    if (!canCopyPreviousWeek || !staffRecord?.staff_id) return;
    // Build holiday dates set for the target week
    const holidayDates = new Set<string>(holidayMap.keys());
    copyPreviousWeek.mutate({
      staffId: staffRecord.staff_id,
      currentWeekStart,
      periodId: period?.period_id || null,
      workDays,
      holidayDates: holidayDates.size > 0 ? holidayDates : undefined,
      holidayEngagementId,
    });
  };

  // Handle save draft (BUG #29, guard BUG #0206-3)
  const handleSaveDraft = useCallback(() => {
    if (!canSaveDraft) return;
    setSaveNowTrigger((prev) => prev + 1);
  }, [canSaveDraft]);

  // (Timer import handler removed — export now happens from Registros de Tiempo list)

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

  // Back button component for reuse across branches
  const BackButton = () => (
    <div className="flex items-center justify-between mb-4">
      <Button variant="cancel" onClick={handleBack} className="btn-action">
        <ArrowLeft className="h-4 w-4 mr-1" />
        {t("common.back")}
      </Button>
    </div>
  );

  // Loading state
  if (staffLoading || isLoading) {
    return (
      <AppLayout title={t("timesheet.title")} focusMode>
        <BackButton />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // No staff record linked
  if (!staffRecord) {
    return (
      <AppLayout title={t("timesheet.title")} focusMode>
        <BackButton />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t("timesheet.noStaffRecord")}
            <br />
            <span className="text-sm mt-1 block">
              {t("timesheet.noStaffRecordHelp", { email: user?.email })}
            </span>
          </AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  // Error state
  if (isError) {
    return (
      <AppLayout title={t("timesheet.title")} focusMode>
        <BackButton />
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
    <AppLayout title={t("timesheet.title")} focusMode>
      <div className="space-y-6">
        {/* Week Navigation */}
        <WeekNavigator
          weekInfo={weekInfo}
          deadlineInfo={deadlineInfo}
          currentWeekStart={currentWeekStart}
          onPreviousWeek={handlePreviousWeek}
          onNextWeek={handleNextWeek}
          onWeekSelect={setCurrentWeekStart}
          earliestWeekStart={earliestWeekStart}
          latestWeekStart={latestWeekStart}
          staffId={staffRecord.staff_id}
        />

        {/* BUG #22: Before hire date warning */}
        {isBeforeHireDate && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t("timesheet.beforeHireDate")}
            </AlertDescription>
          </Alert>
        )}

        {/* After termination date warning */}
        {isAfterTerminationDate && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t("timesheet.afterTerminationDate")}
            </AlertDescription>
          </Alert>
        )}

        {/* Locked/Submitted indicator */}
        {!isBeforeHireDate && (period?.is_period_locked || isSubmitted) && (
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

        {/* BUG #0213-36: Weekly limit alerts */}
        {isBelowWeeklyMin &&
          !isBeforeHireDate &&
          isWithinEditableWindow &&
          entries.length > 0 &&
          !isSubmitted &&
          !period?.is_period_locked && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t("timesheet.weeklyMinNotMet", {
                  total: weeklyGrandTotal.toFixed(1),
                  min: weeklyMin,
                })}
              </AlertDescription>
            </Alert>
        )}
        {isAboveWeeklyMax &&
          !isBeforeHireDate &&
          isWithinEditableWindow &&
          entries.length > 0 &&
          !isSubmitted &&
          !period?.is_period_locked && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t("timesheet.weeklyMaxExceeded", {
                  total: weeklyGrandTotal.toFixed(1),
                  max: weeklyMax,
                })}
              </AlertDescription>
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
          dailyMin={dailyMin}
          dailyMax={dailyMax}
          weeklyMin={weeklyMin}
          weeklyMax={weeklyMax}
          lockedDaysBeforeHire={lockedDaysBeforeHire}
          lockedDaysAfterTermination={lockedDaysAfterTermination}
          holidayMap={holidayMap}
          holidayEngagementId={holidayEngagementId}
          activityNotRequiredIds={activityNotRequiredIds}
          adminActivityId={adminActivityId}
          isFullyApproved={isFullyApproved}
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

          <div className="flex gap-3 flex-wrap">
            {/* Back button */}
            <Button variant="outline" onClick={handleBack}>
              {t("common.cancel")}
            </Button>

            {/* BUG #12 / BUG #0206-3: Copy Previous Week Button */}
            {canCopyPreviousWeek && (
              <Button
                variant="outline"
                onClick={handleCopyPreviousWeek}
                disabled={copyPreviousWeek.isPending}
              >
                {copyPreviousWeek.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                <Copy className="h-4 w-4 mr-2" />
                {t("timesheet.copyPreviousWeek")}
              </Button>
            )}

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

            {/* Save Draft Button (BUG #29 / BUG #0206-3) */}
            {canSaveDraft && (
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={saveStatus === "saving"}
              >
                <Save className="h-4 w-4 mr-2" />
                {t("timesheet.saveDraft")}
              </Button>
            )}

            {canSubmit && (
              <Button
                className="bg-brand-purple hover:bg-brand-purple/90 text-primary-foreground btn-action"
                onClick={handleSubmit}
                disabled={submitTimesheet.isPending}
              >
                {submitTimesheet.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {isSubmitted && hasRejectedLines
                  ? t("timesheet.resubmitWeek")
                  : t("timesheet.submitWeek")}
              </Button>
            )}
          </div>
        </div>

      </div>
    </AppLayout>
  );
};

export default TimeSheet;

