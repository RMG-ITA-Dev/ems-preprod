import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useBlocker } from "react-router-dom";
import { format, isWeekend } from "date-fns";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, PlayCircle } from "lucide-react";
import { TrackerBar } from "@/components/tracker/TrackerBar";
import { LeaveStopwatchDialog, shouldSkipTimerLeaveConfirm } from "@/components/tracker/LeaveStopwatchDialog";
import { useTimeTracker } from "@/hooks/useTimeTracker";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useAuth } from "@/hooks/useAuth";
import {
  useTimerEntries,
  useRunningTimerEntry,
  useStartTimerRPC,
  useStopTimerRPC,
  useDeleteTimerEntry,
  useFinalizeMyStaleTimers,
} from "@/hooks/useTimerEntries";
import { useGlobalSettings } from "@/hooks/useEmsData";

const MAX_SECONDS = 28800; // 8h

const TrackerRecord = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { user } = useAuth();
  const tracker = useTimeTracker();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { data: entries } = useTimerEntries();
  const { data: globalSettings } = useGlobalSettings();

  // DB-first hooks
  const { data: runningEntry, isLoading: runningLoading } = useRunningTimerEntry();
  const startRPC = useStartTimerRPC();
  const stopRPC = useStopTimerRPC();
  const deleteEntry = useDeleteTimerEntry();
  const finalizeStale = useFinalizeMyStaleTimers();

  // Anti-double-fire guard for auto-stop
  const hasAutoStoppedRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  // Live elapsed seconds derived from DB started_at
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Finalize stale timers on mount
  const hasFinalizedRef = useRef(false);
  useEffect(() => {
    if (!staffRecord || hasFinalizedRef.current) return;
    hasFinalizedRef.current = true;
    finalizeStale().then((count) => {
      if (count > 0) {
        toast.info(t("tracker.timerFinalized"));
      }
    });
  }, [staffRecord, finalizeStale, t]);

  // Populate form fields from running entry
  useEffect(() => {
    if (runningEntry) {
      tracker.setEngagement(runningEntry.engagement_id);
      tracker.setActivity(runningEntry.activity_id);
      hasAutoStoppedRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningEntry?.timer_id]);

  // Live elapsed tick
  useEffect(() => {
    if (!runningEntry?.started_at) {
      setElapsedSeconds(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const startMs = new Date(runningEntry.started_at).getTime();

    const tick = () => {
      const raw = Math.floor((Date.now() - startMs) / 1000);
      setElapsedSeconds(Math.min(raw, MAX_SECONDS));
    };

    tick(); // immediate
    intervalRef.current = window.setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runningEntry?.started_at]);

  // Auto-stop at 8h (strictly greater)
  const handleAutoStop = useCallback(async () => {
    if (!runningEntry || hasAutoStoppedRef.current) return;
    hasAutoStoppedRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    try {
      await stopRPC.mutateAsync({ timer_id: runningEntry.timer_id });
      toast.warning(t("tracker.timerAutoStopped"));
    } catch {
      // Already stopped or error
    }
  }, [runningEntry, stopRPC, t]);

  useEffect(() => {
    if (elapsedSeconds > MAX_SECONDS && runningEntry && !hasAutoStoppedRef.current) {
      void handleAutoStop();
    }
  }, [elapsedSeconds, runningEntry, handleAutoStop]);

  // Daily limit
  const dailyLimit = useMemo(() => {
    const setting = globalSettings?.find((s) => s.setting_key === "DAILY_LIMIT");
    return setting ? parseFloat(setting.setting_value) : 10;
  }, [globalSettings]);

  const allowWeekendTracking = useMemo(() => {
    const setting = globalSettings?.find((s) => s.setting_key === "ALLOW_WEEKEND_TRACKING");
    return setting?.setting_value === "true";
  }, [globalSettings]);

  const todayTrackedHours = useMemo(() => {
    if (!entries) return 0;
    const today = format(new Date(), "yyyy-MM-dd");
    const todayEntries = entries.filter((e) => {
      const entryDate = format(new Date(e.started_at), "yyyy-MM-dd");
      return entryDate === today && e.ended_at; // only completed entries
    });
    let totalMinutes = todayEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
    // Add current running timer elapsed
    if (runningEntry) {
      totalMinutes += Math.floor(elapsedSeconds / 60);
    }
    return totalMinutes / 60;
  }, [entries, runningEntry, elapsedSeconds]);

  const remainingHours = Math.max(0, dailyLimit - todayTrackedHours);
  const isWeekendToday = isWeekend(new Date());
  const isRunning = !!runningEntry;

  // Stopwatch-specific blocker (NOT focus mode)
  const skipConfirm = shouldSkipTimerLeaveConfirm();
  const stopwatchBypassRef = useRef(false);
  const stopwatchBlocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isRunning &&
      !skipConfirm &&
      !stopwatchBypassRef.current &&
      currentLocation.pathname !== nextLocation.pathname
  );

  // ─── Handlers ───────────────────────────────────────────────────

  const handleStart = async () => {
    if (!tracker.engagementId || !tracker.activityId) return;

    if (isWeekendToday && !allowWeekendTracking) {
      toast.error(t("tracker.weekendNotAllowed"));
      return;
    }

    if (remainingHours <= 0) {
      toast.error(t("tracker.dailyLimitReached"));
      return;
    }

    try {
      await startRPC.mutateAsync({
        engagement_id: tracker.engagementId,
        activity_id: tracker.activityId,
        description: tracker.description || undefined,
      });
      hasAutoStoppedRef.current = false;
    } catch (error: any) {
      if (error?.message === 'RUNNING_TIMER_EXISTS') {
        toast.info(t("tracker.timerAlreadyRunning"));
        // Query will auto-refetch and reattach
      } else {
        toast.error(t("tracker.errorStarting"));
      }
    }
  };

  const handleSaveAndReset = async () => {
    if (!runningEntry) {
      toast.error(t("tracker.noEntryToSave"));
      return;
    }

    try {
      await stopRPC.mutateAsync({ timer_id: runningEntry.timer_id });
      tracker.resetForm();
      toast.success(t("tracker.entrySaved"));
      navigate("/tracker");
    } catch {
      toast.error(t("tracker.errorStopping"));
    }
  };

  const handleCancel = async () => {
    if (runningEntry) {
      try {
        await deleteEntry.mutateAsync(runningEntry.timer_id);
      } catch {
        // Entry may already be gone
      }
    }
    tracker.resetForm();
    navigate("/tracker");
  };

  const handleDelete = async () => {
    if (runningEntry) {
      try {
        await deleteEntry.mutateAsync(runningEntry.timer_id);
        toast.success(t("tracker.entryDeleted"));
      } catch {
        toast.error(t("tracker.errorDeleting"));
      }
    }
    tracker.resetForm();
    navigate("/tracker");
  };

  // ─── Render ─────────────────────────────────────────────────────

  if (staffLoading || runningLoading) {
    return (
      <AppLayout title={t("tracker.title")}>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </AppLayout>
    );
  }

  if (!staffRecord) {
    return (
      <AppLayout title={t("tracker.title")}>
        <Alert>
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

  return (
    <AppLayout title={t("tracker.newEntry")}>
      <div className="space-y-6">
        {isWeekendToday && !allowWeekendTracking && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("tracker.weekendNotAllowed")}</AlertDescription>
          </Alert>
        )}

        <TrackerBar
          isRunning={isRunning}
          elapsedSeconds={elapsedSeconds}
          engagementId={tracker.engagementId}
          activityId={tracker.activityId}
          remainingHours={remainingHours}
          onStart={handleStart}
          onSaveAndReset={handleSaveAndReset}
          onCancel={handleCancel}
          onDelete={handleDelete}
          onEngagementChange={tracker.setEngagement}
          onActivityChange={tracker.setActivity}
        />

        {isRunning && (
          <Button
            variant="outline"
            onClick={() => {
              stopwatchBypassRef.current = true;
              queueMicrotask(() => { stopwatchBypassRef.current = false; });
              navigate("/tracker");
            }}
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            {t("tracker.runInBackground")}
          </Button>
        )}
      </div>
      <LeaveStopwatchDialog blocker={stopwatchBlocker} />
    </AppLayout>
  );
};

export default TrackerRecord;
