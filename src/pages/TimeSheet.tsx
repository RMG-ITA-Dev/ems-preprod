import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Lock, Save, RotateCcw, Check, AlertTriangle, Copy, ArrowLeft, Trash2, Info } from "lucide-react";
import { WeekNavigator } from "@/components/timesheet/WeekNavigator";
import { TimesheetGrid } from "@/components/timesheet/TimesheetGrid";
import { useHolidaysForWeek, useHolidayEngagementId } from "@/hooks/useHolidays";
import { useAdminActivityId } from "@/hooks/useAdminActivity";
import { useTimesheetPolicies } from "@/hooks/useTimesheetPolicies";
import { useTimesheetWeek } from "@/hooks/useTimesheetWeek";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useAuth } from "@/hooks/useAuth";
import { usePeriodLineApprovals } from "@/hooks/useTimesheetApprovals";
import { useSubmitTimesheet, useUnsubmitTimesheet, useCopyPreviousWeek, useCopyToCurrentWeek } from "@/hooks/useTimesheetMutations";
import { isTimesheetError } from "@/lib/timesheetErrors";
import { useStaffAssignmentSegments } from "@/hooks/scheduler/useStaffAssignmentSegments";
import { countUnauthorizedEntries } from "@/lib/timesheetAssignmentAdvisory";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useGlobalSettings } from "@/hooks/useEmsData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseISO, isBefore, startOfDay, format } from "date-fns";
import {
  getWeekInfo,
  getWeekMonday,
  getPreviousWeek,
  getNextWeek,
  calculateDeadline,
  toISODateString,
  getEffectiveWeeklyLimits,
  getDailyHourViolations,
  getLocale,
  type DailyHourViolation,
} from "@/lib/timesheetUtils";

type SaveStatus = "idle" | "saving" | "saved";

const TimeSheet = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const navigate = useNavigate();
  const handleBack = () => {
    navigate("/");
  };

  const handleDeleteAll = async () => {
    if (!staffRecord?.staff_id) return;
    setIsDeletingAll(true);
    try {
      const dateStrings = weekInfo.weekDates.map(d => toISODateString(d));
      const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('staff_id', staffRecord.staff_id)
        .in('date_worked', dateStrings)
        .eq('is_forecast', false);
      if (error) throw error;
      toast.success(t('timesheet.allEntriesDeleted'));
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
      queryClient.invalidateQueries({ queryKey: ['timesheet-period'] });
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('APPROVED_LINE_LOCKED')) {
        toast.error(t('timesheet.approvedLineCannotEdit'));
      } else {
        toast.error(t('timesheet.deleteAllFailed'));
      }
    } finally {
      setIsDeletingAll(false);
      setShowDeleteAllDialog(false);
    }
  };


  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  // Retirar una hoja YA APROBADA es la contracara de la auto-aprobación: si tus
  // horas se aprueban solas al enviar, retirar es la única forma de editarlas.
  // Ese concepto ya está modelado como `timesheet.self_approve` (admin,
  // senior_partner, director, partner) y la base lo consume en
  // is_auto_approved_category (redefinida en 20260724040000 — conserva el nombre
  // viejo pero ya no mira display_order).
  //
  // El `(isPartner || isAdmin)` del enum legacy no coincidía con ese conjunto:
  // dejaba afuera a `director`, que SÍ auto-aprueba y quedaba con una hoja
  // aprobada que no podía retirar ni editar; y en cambio incluía a `risk_partner`,
  // que mapea al enum `partner` sin ser auto-aprobador.
  const { can } = useAuthorization();
  const canSelfApprove = can("timesheet.self_approve");

  // Get policies
  const { data: policies, isPending: policiesPending } = useTimesheetPolicies();
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
  const [showCopyBlockedDialog, setShowCopyBlockedDialog] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
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

  // Holiday data for the current week
  const holidayMap = useHolidaysForWeek(weekInfo.weekDates);
  const holidayEngagementId = useHolidayEngagementId();
  const adminActivityId = useAdminActivityId();

  const holidayHoursLogged = useMemo(
    () =>
      holidayEngagementId
        ? entries
            .filter((e) => e.engagement_id === holidayEngagementId)
            .reduce((s, e) => s + Number(e.hours_logged ?? 0), 0)
        : 0,
    [entries, holidayEngagementId],
  );
  const holidayHoursRemaining = Math.max(
    0,
    holidayMap.size * dailyMin - holidayHoursLogged,
  );

  // BUG 0306-74: Prorate weekly limits for partial weeks
  const holidayDateSet = useMemo(() => {
    const set = new Set<string>();
    holidayMap.forEach((_, dateStr) => set.add(dateStr));
    return set;
  }, [holidayMap]);

  const { effectiveMin: effectiveWeeklyMin, effectiveMax: effectiveWeeklyMax, workableDays } = useMemo(
    () => getEffectiveWeeklyLimits(
      weekInfo.weekDates, weeklyMin, weeklyMax,
      staffRecord?.hire_date ?? null, staffRecord?.termination_date ?? null,
      holidayDateSet
    ),
    [weekInfo.weekDates, weeklyMin, weeklyMax, staffRecord?.hire_date, staffRecord?.termination_date, holidayDateSet]
  );

  const isBelowWeeklyMin = weeklyGrandTotal < effectiveWeeklyMin;
  const isAboveWeeklyMax = weeklyGrandTotal > effectiveWeeklyMax;
  const isWeeklyOutOfBounds = isBelowWeeklyMin || isAboveWeeklyMax;

  // Fase 6: advisory no bloqueante de asignaciones (bugs/scheduler/fase_6).
  // weekDates[0] es lunes canónico por construcción (getWeekMonday, arriba) -> satisface el
  // gate ISODOW=1 de la RPC. weekEnd = último día MOSTRADO (5 o 6) -> span <= 6.
  // Se retiene la query mientras policies esté pending: workDays decide el weekEnd, y disparar
  // antes provocaría una consulta con fin en viernes seguida de otra con fin en sábado.
  const weekStartStr = toISODateString(weekInfo.weekDates[0]);
  const weekEndStr = toISODateString(weekInfo.weekDates[weekInfo.weekDates.length - 1]);
  const assignmentSegments = useStaffAssignmentSegments(
    staffRecord?.staff_id,
    weekStartStr,
    policiesPending ? undefined : weekEndStr,
  );

  // entries ya excluye forecast en origen (useTimesheetWeek.ts).
  const unauthorizedCount = useMemo(
    () => countUnauthorizedEntries(entries, assignmentSegments.data),
    [entries, assignmentSegments.data],
  );
  // data === null solo ocurre tras un fetch resuelto en fail-open (denegado, no desplegado,
  // error, forma inesperada); undefined = aún no se consultó. Señal mínima y visible, sin
  // detalle técnico (decisión de producto, Open Question 3 de plan_v2.md).
  const isAssignmentAdvisoryUnavailable = assignmentSegments.data === null;

  const hasWeekHolidays = holidayMap.size > 0;

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
  const copyToCurrentWeek = useCopyToCurrentWeek();
  const queryClient = useQueryClient();

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
  }, [isCurrentWeek, isFutureWeek, policies?.employeeRetroDays, weekInfo.weekDates]);

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

  // BUG 0608-144: days workable by the employee (excludes hire/termination locked days)
  const workableWeekDates = useMemo(
    () => weekInfo.weekDates.filter(
      (_, i) => !lockedDaysBeforeHire.has(i) && !lockedDaysAfterTermination.has(i)
    ),
    [weekInfo.weekDates, lockedDaysBeforeHire, lockedDaysAfterTermination],
  );

  // BUG 0608-144: daily-limit submit gate (0h days included; caller pre-filters workable days)
  const dailyViolations: DailyHourViolation[] = useMemo(
    () => getDailyHourViolations(entries, workableWeekDates, dailyMin, dailyMax),
    [entries, workableWeekDates, dailyMin, dailyMax],
  );
  const hasDailyViolations = dailyViolations.length > 0;

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
    && !period?.is_period_locked
    && (
      (isFullyApproved && isCurrentWeek && isWithinEditableWindow && canSelfApprove)
      || (!isFullyApproved && ((isCurrentWeek && isWithinEditableWindow) || hasRejectedLines))
    );

  const canSaveDraft = !isBeforeHireDate
    && !isAfterTerminationDate
    && isWithinEditableWindow
    && !isSubmitted
    && !isFullyApproved
    && !period?.is_period_locked
    && hasNonZeroEntry;

  const canCopyToCurrentWeek = !isCurrentWeek && entries.length > 0 && !copyToCurrentWeek.isPending;

  const hasAnyApprovedLine = lineApprovals?.some(la => la.status === 'approved') ?? false;

  const canDeleteAll = !isSubmitted && !period?.is_period_locked && entries.length > 0
    && !isBeforeHireDate && !isAfterTerminationDate && isWithinEditableWindow
    && !hasAnyApprovedLine;

  // BUG #21: Separate "can submit" from "can edit cells"
  // BUG #0213-33: Also gate on weekly limit
  const canSubmit = !isBeforeHireDate && !isAfterTerminationDate && isWithinEditableWindow && entries.length > 0 &&
    !isSubmitted && !period?.is_period_locked && !isWeeklyOutOfBounds && !hasDailyViolations;

  // Handle submit
  const handleSubmit = async () => {
    // DEFENSE-IN-DEPTH: weekly + daily limit guard (do NOT rely only on canSubmit)
    if (isWeeklyOutOfBounds || hasDailyViolations) return;
    if (!period?.period_id || !staffRecord) return;

    // Get unique (engagement, activity) pairs from entries
    const engagementActivityPairs = [
      ...new Map(
        entries.map(e => [`${e.engagement_id}:${e.activity_id}`, {
          engagementId: e.engagement_id,
          activityId:   e.activity_id,
        }])
      ).values(),
    ];

    if (engagementActivityPairs.length === 0) return;

    // BUG 0227-67: Block submit if any activity-required engagement has empty/invalid activity
    const invalidActivityRow = entries.some(entry => {
      const eng = engagements.find(e => e.engagement_id === entry.engagement_id);
      const isActRequired = eng?.activity_required ?? true;
      return isActRequired && (!entry.activity_id || entry.activity_id === adminActivityId);
    });
    if (invalidActivityRow) {
      toast.error(t("timesheet.invalidActivityRow"));
      return;
    }

    // Check if staff is auto-approved (Partner/Director)
    const { data: isAutoApproved } = await supabase
      .rpc("is_auto_approved_category", { p_staff_id: staffRecord.staff_id });

    submitTimesheet.mutate({
      periodId:               period.period_id,
      staffId:                staffRecord.staff_id,
      engagementActivityPairs,
      isAutoApproved:         isAutoApproved || false,
      unauthorizedCount,
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

  // Handle copy to current week
  const handleCopyToCurrentWeek = () => {
    if (!canCopyToCurrentWeek || !staffRecord?.staff_id) return;
    copyToCurrentWeek.mutate({
      staffId: staffRecord.staff_id,
      staffCity: staffRecord.city,
      sourceWeekStart: currentWeekStart,
      workDays,
      hireDate: staffRecord.hire_date,
      terminationDate: staffRecord.termination_date,
      employeeRetroDays: policies?.employeeRetroDays,
    }, {
      onError: (error) => {
        if (isTimesheetError(error, "CURRENT_WEEK_HAS_ENTRIES")) {
          setShowCopyBlockedDialog(true);
        }
      }
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
      <Button variant="outline" onClick={handleBack} className="btn-action">
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

        {/* Holiday week hint — visible before the user hits the submit guard.
            Deliberately does NOT gate on entries.length: its purpose is to warn
            before any hours are logged for a holiday week (BUG 0526-122). */}
        {hasWeekHolidays &&
          holidayHoursRemaining > 0 &&
          !!holidayEngagementId &&
          !isBeforeHireDate &&
          !isAfterTerminationDate &&
          isWithinEditableWindow &&
          !isSubmitted &&
          !isFullyApproved &&
          !period?.is_period_locked && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {t("timesheet.holidayWeekHint", {
                  count: holidayMap.size,
                  hours: holidayHoursRemaining,
                })}
              </AlertDescription>
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
                <span className="font-bold">
                  {workableDays < workDays
                    ? t("timesheet.weeklyMinNotMetPartial", {
                        total: weeklyGrandTotal.toFixed(1),
                        min: effectiveWeeklyMin,
                        days: workableDays,
                      })
                    : t("timesheet.weeklyMinNotMet", {
                        total: weeklyGrandTotal.toFixed(1),
                        min: effectiveWeeklyMin,
                      })}
                </span>
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
                <span className="font-bold">
                  {t("timesheet.weeklyMaxExceeded", {
                    total: weeklyGrandTotal.toFixed(1),
                    max: effectiveWeeklyMax,
                  })}
                </span>
              </AlertDescription>
            </Alert>
        )}

        {/* BUG 0608-144: daily-limit blocking banner */}
        {hasDailyViolations &&
          !isWeeklyOutOfBounds &&
          !isBeforeHireDate &&
          isWithinEditableWindow &&
          entries.length > 0 &&
          !isSubmitted &&
          !period?.is_period_locked && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <span className="font-bold">
                  {t("timesheet.dailyLimitSubmitBlocked", {
                    days: dailyViolations
                      .map((v) => `${format(v.date, "EEE dd/MM", { locale: getLocale(lang) })} (${v.total}h)`)
                      .join(", "),
                    min: dailyMin,
                    max: dailyMax,
                  })}
                </span>
              </AlertDescription>
            </Alert>
        )}

        {/* Fase 6: assignment advisory banner — informational only, never gates Submit.
            Sin gate isEditable a propósito: visible también en semanas submitted/locked. */}
        {unauthorizedCount > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription>
              {t("timesheet.assignmentAdvisory.banner", { count: unauthorizedCount })}
            </AlertDescription>
          </Alert>
        )}

        {/* Fase 6: minimal, non-technical indicator when advisory data is unavailable
            (denied / not deployed / error / malformed) — the advisory itself stays silent
            everywhere else per the fail-open design. */}
        {isAssignmentAdvisoryUnavailable && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t("timesheet.assignmentAdvisory.unavailable")}
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
          weeklyMin={effectiveWeeklyMin}
          weeklyMax={effectiveWeeklyMax}
          lockedDaysBeforeHire={lockedDaysBeforeHire}
          lockedDaysAfterTermination={lockedDaysAfterTermination}
          holidayMap={holidayMap}
          holidayEngagementId={holidayEngagementId}
          activityNotRequiredIds={activityNotRequiredIds}
          adminActivityId={adminActivityId}
          isFullyApproved={isFullyApproved}
          assignmentWindows={assignmentSegments.data ?? undefined}
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
            {/* Cancel button — always leftmost */}
            <Button variant="cancel" onClick={handleBack}>
              {t("common.cancel")}
            </Button>

            {/* Copy to Current Week */}
            {canCopyToCurrentWeek && (
              <Button
                variant="outline"
                className="bg-brand-gold/70 text-foreground dark:text-white ring-1 ring-black/20 shadow-md hover:bg-brand-gold hover:text-foreground dark:hover:text-white hover:shadow-lg hover:-translate-y-px active:shadow-sm active:translate-y-px"
                onClick={handleCopyToCurrentWeek}
                disabled={copyToCurrentWeek.isPending}
              >
                {copyToCurrentWeek.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                <Copy className="h-4 w-4 mr-2" />
                {t("timesheet.copyToCurrentWeek")}
              </Button>
            )}

            {/* Delete all entries */}
            {canDeleteAll && (
              <Button
                variant="destructive"
                onClick={() => setShowDeleteAllDialog(true)}
                disabled={isDeletingAll}
              >
                {isDeletingAll && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Trash2 className="h-4 w-4 mr-2" />
                {t('timesheet.deleteAllEntries')}
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
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSaveDraft}
                disabled={saveStatus === "saving"}
              >
                <Save className="h-4 w-4 mr-2" />
                {t("timesheet.saveDraft")}
              </Button>
            )}

            {canSubmit && (
              <Button
                className="btn-action"
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

      <AlertDialog open={showCopyBlockedDialog} onOpenChange={setShowCopyBlockedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("timesheet.copyToCurrentWeekBlockedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("timesheet.copyToCurrentWeekBlocked")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowCopyBlockedDialog(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">{t('timesheet.deleteAllWarningTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-destructive">{t('timesheet.deleteAllWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive/70 text-destructive-foreground hover:bg-destructive"
              onClick={handleDeleteAll}
            >
              {t('timesheet.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default TimeSheet;

