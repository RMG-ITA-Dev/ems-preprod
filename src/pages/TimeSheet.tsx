import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Lock, Save, RotateCcw, Check, AlertTriangle, Copy, Upload } from "lucide-react";
import { TimerImportDialog } from "@/components/tracker/TimerImportDialog";
import { useUnimportedTimerEntries, useMarkTimerEntriesImported } from "@/hooks/useTimerEntries";
import { WeekNavigator } from "@/components/timesheet/WeekNavigator";
import { TimesheetGrid } from "@/components/timesheet/TimesheetGrid";
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

  // Get current staff
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();

  // Get policies
  const { data: policies } = useTimesheetPolicies();
  const { data: globalSettings } = useGlobalSettings();
  const workDays = policies?.workDays ?? 5;
  const monthEndRule = policies?.monthEndRule ?? "COMPLETE_SPANNING_WEEK";
  const autoSaveSeconds = policies?.autoSaveSeconds ?? 3;

  // BUG #13: Get hour limits from global settings
  const dailyLimit = useMemo(() => {
    const setting = globalSettings?.find((s) => s.setting_key === "DAILY_LIMIT");
    return setting ? parseFloat(setting.setting_value) : 10;
  }, [globalSettings]);

  const weeklyLimit = useMemo(() => {
    const setting = globalSettings?.find((s) => s.setting_key === "WEEKLY_LIMIT");
    return setting ? parseFloat(setting.setting_value) : 50;
  }, [globalSettings]);

  // Week navigation state - start with current week
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    getWeekMonday(new Date())
  );

  // Save status state (BUG #29)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

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

  // BUG #4b: Fetch unimported timer entries for current week
  const weekEnd = weekInfo.weekDates[weekInfo.weekDates.length - 1];
  const { data: unimportedTimerEntries } = useUnimportedTimerEntries(currentWeekStart, weekEnd);
  const markTimerImported = useMarkTimerEntriesImported();
  const [isTimerImporting, setIsTimerImporting] = useState(false);

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

  // BUG #5: Earliest navigable week based on hire date
  const earliestWeekStart = useMemo(() => {
    if (!staffRecord?.hire_date) return undefined;
    return getWeekMonday(parseISO(staffRecord.hire_date));
  }, [staffRecord?.hire_date]);

  // Editable if:
  // - Not submitted and not locked, OR
  // - Submitted but has pending/rejected lines AND is current week (can make corrections)
  // - AND not before hire date (BUG #22)
  const isEditable = !isBeforeHireDate && isWithinEditableWindow && (
    (!isSubmitted && !period?.is_period_locked) || 
    (isSubmitted && !isFullyApproved && (hasPendingLines || hasRejectedLines))
  );

  // BUG #0206-3: Dedicated button visibility flags (decoupled from isEditable/lineApprovals)
  const hasNonZeroEntry = entries.some((e) => e.hours_logged > 0);

  const canCopyPreviousWeek = !isBeforeHireDate
    && isWithinEditableWindow
    && !isSubmitted
    && !period?.is_period_locked
    && prevWeekSubmittedOrApproved;

  const canUnsubmit = isSubmitted
    && !isFullyApproved
    && isWithinEditableWindow
    && !period?.is_period_locked;

  const canSaveDraft = !isBeforeHireDate
    && isWithinEditableWindow
    && !period?.is_period_locked
    && !isFullyApproved
    && hasNonZeroEntry;

  // BUG #21: Separate "can submit" from "can edit cells"
  const canSubmit = !isBeforeHireDate && isWithinEditableWindow && entries.length > 0 && (
    (!isSubmitted && !period?.is_period_locked) ||
    (isSubmitted && hasRejectedLines && !isFullyApproved)
  );

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

  // Handle unsubmit (BUG #32, guard BUG #0206-3)
  const handleUnsubmit = () => {
    if (!canUnsubmit || !period?.period_id) return;
    unsubmitTimesheet.mutate({ periodId: period.period_id });
  };

  // BUG #12: Handle copy previous week (guard BUG #0206-3)
  const handleCopyPreviousWeek = () => {
    if (!canCopyPreviousWeek || !staffRecord?.staff_id) return;
    copyPreviousWeek.mutate({
      staffId: staffRecord.staff_id,
      currentWeekStart,
      periodId: period?.period_id || null,
      workDays,
    });
  };

  // Handle save draft (BUG #29, guard BUG #0206-3)
  const handleSaveDraft = useCallback(() => {
    if (!canSaveDraft) return;
    setSaveNowTrigger((prev) => prev + 1);
  }, [canSaveDraft]);

  // BUG #4b: Handle timer import from timesheet
  const handleTimerImport = async (selectedIds: string[]) => {
    if (!staffRecord?.staff_id || selectedIds.length === 0) return;
    setIsTimerImporting(true);
    try {
      const entriesToImport = unimportedTimerEntries?.filter(e => selectedIds.includes(e.timer_id)) || [];
      const importedMappings: { timer_id: string; time_id: string }[] = [];
      
      for (const timerEntry of entriesToImport) {
        const dateWorked = new Date(timerEntry.started_at).toISOString().split('T')[0];
        const hoursLogged = (timerEntry.duration_minutes || 0) / 60;
        
        const { data: timeEntry, error } = await supabase
          .from('time_entries')
          .insert({
            staff_id: staffRecord.staff_id,
            engagement_id: timerEntry.engagement_id,
            activity_id: timerEntry.activity_id,
            date_worked: dateWorked,
            hours_logged: hoursLogged,
            description: timerEntry.description,
          })
          .select()
          .single();
        
        if (error) throw error;
        importedMappings.push({ timer_id: timerEntry.timer_id, time_id: timeEntry.time_id });
      }
      
      await markTimerImported.mutateAsync(importedMappings);
      setImportDialogOpen(false);
    } catch (error) {
      console.error("Timer import error:", error);
    } finally {
      setIsTimerImporting(false);
    }
  };

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
          earliestWeekStart={earliestWeekStart}
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
          dailyLimit={dailyLimit}
          weeklyLimit={weeklyLimit}
          lockedDaysBeforeHire={lockedDaysBeforeHire}
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
            {/* BUG #4b: Import from Timer Button */}
            {isEditable && (unimportedTimerEntries?.length || 0) > 0 && (
              <Button
                variant="outline"
                onClick={() => setImportDialogOpen(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                {t("tracker.importFromTimer")}
                <Badge className="ml-2 bg-accent text-accent-foreground text-xs">
                  {unimportedTimerEntries!.length}
                </Badge>
              </Button>
            )}

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

        {/* BUG #4b: Timer Import Dialog */}
        <TimerImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          entries={unimportedTimerEntries || []}
          onImport={handleTimerImport}
          isLoading={isTimerImporting}
        />
      </div>
    </AppLayout>
  );
};

export default TimeSheet;
