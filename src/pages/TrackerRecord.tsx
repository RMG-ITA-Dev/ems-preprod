import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { format, isWeekend } from "date-fns";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { TrackerBar } from "@/components/tracker/TrackerBar";
import { PomodoroPanel } from "@/components/tracker/PomodoroPanel";
import { ManualEntryDialog } from "@/components/tracker/ManualEntryDialog";
import { StopActionDialog } from "@/components/tracker/StopActionDialog";
import { useTimeTracker } from "@/hooks/useTimeTracker";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import {
  useTimerEntries,
  useCreateTimerEntry,
  useUpdateTimerEntry,
  useDeleteTimerEntry,
} from "@/hooks/useTimerEntries";
import { useGlobalSettings } from "@/hooks/useEmsData";

const TrackerRecord = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id && id !== "new";

  const tracker = useTimeTracker();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { data: entries } = useTimerEntries();
  const { data: globalSettings } = useGlobalSettings();
  const createEntry = useCreateTimerEntry();
  const updateEntry = useUpdateTimerEntry();
  const deleteEntry = useDeleteTimerEntry();

  const [isManualMode, setIsManualMode] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);

  // Get daily limit from global settings
  const dailyLimit = useMemo(() => {
    const setting = globalSettings?.find((s) => s.setting_key === "DAILY_LIMIT");
    return setting ? parseFloat(setting.setting_value) : 10;
  }, [globalSettings]);

  // Get weekend tracking setting
  const allowWeekendTracking = useMemo(() => {
    const setting = globalSettings?.find((s) => s.setting_key === "ALLOW_WEEKEND_TRACKING");
    return setting?.setting_value === "true";
  }, [globalSettings]);

  // Calculate today's tracked hours (including running timer)
  const todayTrackedHours = useMemo(() => {
    if (!entries) return 0;
    const today = format(new Date(), "yyyy-MM-dd");
    const todayEntries = entries.filter((e) => {
      const entryDate = format(new Date(e.started_at), "yyyy-MM-dd");
      return entryDate === today;
    });
    let totalMinutes = todayEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
    // Add current running timer if exists
    if (tracker.isRunning) {
      totalMinutes += Math.floor(tracker.elapsedSeconds / 60);
    }
    return totalMinutes / 60;
  }, [entries, tracker.isRunning, tracker.elapsedSeconds]);

  const remainingHours = Math.max(0, dailyLimit - todayTrackedHours);

  // If editing, load the entry data
  useEffect(() => {
    if (isEditMode && entries) {
      const entry = entries.find((e) => e.timer_id === id);
      if (entry) {
        tracker.setEngagement(entry.engagement_id);
        tracker.setActivity(entry.activity_id);
        tracker.setDescription(entry.description || "");
        setIsManualMode(true);
        setManualDialogOpen(true);
      }
    }
  }, [isEditMode, id, entries]);

  // Sync running entry on mount
  useEffect(() => {
    if (!staffRecord?.staff_id || !entries) return;
    if (tracker.runningEntryId && !tracker.isRunning && tracker.elapsedSeconds === 0) {
      const runningEntry = entries.find(
        (e) => e.timer_id === tracker.runningEntryId && !e.ended_at
      );
      if (runningEntry) {
        const startTime = new Date(runningEntry.started_at).getTime();
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        tracker.start(runningEntry.timer_id);
      }
    }
  }, [staffRecord?.staff_id, entries]);

  const isWeekendToday = isWeekend(new Date());

  const handleStart = async () => {
    if (!staffRecord?.staff_id || !tracker.engagementId || !tracker.activityId) {
      return;
    }

    // Check weekend restriction
    if (isWeekendToday && !allowWeekendTracking) {
      toast.error(t("tracker.weekendNotAllowed"));
      return;
    }

    // Check if we're resuming a paused timer
    if (tracker.runningEntryId && !tracker.isRunning && tracker.elapsedSeconds > 0) {
      tracker.start(tracker.runningEntryId);
      return;
    }

    // Check daily limit
    if (remainingHours <= 0) {
      toast.error(t("tracker.dailyLimitReached"));
      return;
    }

    try {
      const result = await createEntry.mutateAsync({
        staff_id: staffRecord.staff_id,
        engagement_id: tracker.engagementId,
        activity_id: tracker.activityId,
        description: tracker.description || undefined,
        started_at: new Date().toISOString(),
      });
      tracker.setRunningEntryId(result.timer_id);
      tracker.start(result.timer_id);
    } catch (error) {
      toast.error(t("tracker.errorStarting"));
    }
  };

  const handleStopClick = () => {
    setStopDialogOpen(true);
  };

  const handlePause = () => {
    tracker.stop();
  };

  const roundToNearest5 = (minutes: number) => {
    const rounded = Math.round(minutes / 5) * 5;
    return Math.max(5, rounded);
  };

  const handleLogAndReset = async () => {
    if (!tracker.runningEntryId) return;
    try {
      const durationMinutes = roundToNearest5(Math.floor(tracker.elapsedSeconds / 60));
      await updateEntry.mutateAsync({
        timer_id: tracker.runningEntryId,
        ended_at: new Date().toISOString(),
        duration_minutes: durationMinutes,
      });
      tracker.reset();
      tracker.clearRunningEntry();
      toast.success(t("tracker.entrySaved"));
      navigate("/tracker");
    } catch (error) {
      toast.error(t("tracker.errorStopping"));
    }
  };

  const handleManualSubmit = async (data: {
    date: Date;
    startTime: string;
    endTime: string;
    engagementId: string;
    activityId: string;
    description: string;
  }) => {
    if (!staffRecord?.staff_id) return;

    // Check weekend restriction
    if (isWeekend(data.date) && !allowWeekendTracking) {
      toast.error(t("tracker.weekendNotAllowed"));
      return;
    }

    const [startHour, startMin] = data.startTime.split(":").map(Number);
    const [endHour, endMin] = data.endTime.split(":").map(Number);

    const startDate = new Date(data.date);
    startDate.setHours(startHour, startMin, 0, 0);

    const endDate = new Date(data.date);
    endDate.setHours(endHour, endMin, 0, 0);

    if (endDate <= startDate) {
      toast.error(t("tracker.invalidTimeRange"));
      return;
    }

    const durationMinutes = roundToNearest5(Math.round((endDate.getTime() - startDate.getTime()) / 60000));

    // Check daily limit
    const entryHours = durationMinutes / 60;
    const dateStr = format(data.date, "yyyy-MM-dd");
    const existingHours = entries
      ?.filter((e) => format(new Date(e.started_at), "yyyy-MM-dd") === dateStr)
      .reduce((sum, e) => sum + (e.duration_minutes || 0), 0) || 0;

    if ((existingHours / 60) + entryHours > dailyLimit) {
      toast.error(t("tracker.dailyLimitExceeded"));
      return;
    }

    try {
      if (isEditMode && id) {
        await updateEntry.mutateAsync({
          timer_id: id,
          engagement_id: data.engagementId,
          activity_id: data.activityId,
          description: data.description || undefined,
          ended_at: endDate.toISOString(),
          duration_minutes: durationMinutes,
        });
        toast.success(t("tracker.entrySaved"));
      } else {
        await createEntry.mutateAsync({
          staff_id: staffRecord.staff_id,
          engagement_id: data.engagementId,
          activity_id: data.activityId,
          description: data.description || undefined,
          started_at: startDate.toISOString(),
          ended_at: endDate.toISOString(),
          duration_minutes: durationMinutes,
        });
        toast.success(t("tracker.entryAdded"));
      }
      setManualDialogOpen(false);
      navigate("/tracker");
    } catch (error) {
      toast.error(t("tracker.errorAdding"));
    }
  };

  if (staffLoading) {
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
          <AlertDescription>{t("timesheet.noStaffRecord")}</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={isEditMode ? t("tracker.editEntry") : t("tracker.newEntry")}>
      <div className="space-y-6">
        {isWeekendToday && !allowWeekendTracking && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("tracker.weekendNotAllowed")}</AlertDescription>
          </Alert>
        )}

        <TrackerBar
          isRunning={tracker.isRunning}
          formattedTime={tracker.formattedTime}
          engagementId={tracker.engagementId}
          activityId={tracker.activityId}
          description={tracker.description}
          pomodoroEnabled={tracker.pomodoroEnabled}
          remainingHours={remainingHours}
          isManualMode={isManualMode}
          onStart={handleStart}
          onStop={handleStopClick}
          onEngagementChange={tracker.setEngagement}
          onActivityChange={tracker.setActivity}
          onDescriptionChange={tracker.setDescription}
          onTogglePomodoro={tracker.togglePomodoro}
          onToggleMode={() => {
            setIsManualMode(!isManualMode);
            if (!isManualMode) {
              setManualDialogOpen(true);
            }
          }}
        />

        {tracker.pomodoroEnabled && (
          <PomodoroPanel
            isRunning={tracker.isRunning}
            phase={tracker.pomodoroPhase}
            pomodoroCount={tracker.pomodoroCount}
            progress={tracker.getProgress()}
            formattedRemaining={tracker.formattedRemaining}
            pomodoroDuration={tracker.pomodoroDuration}
            shortBreakDuration={tracker.shortBreakDuration}
            longBreakDuration={tracker.longBreakDuration}
            onSettingsChange={tracker.setPomodoroSettings}
          />
        )}

        <ManualEntryDialog
          open={manualDialogOpen}
          onOpenChange={(open) => {
            setManualDialogOpen(open);
            if (!open && !isEditMode) {
              navigate("/tracker");
            }
          }}
          onSubmit={(data) => handleManualSubmit({
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            engagementId: data.engagement_id,
            activityId: data.activity_id,
            description: data.description,
          })}
        />

        <StopActionDialog
          open={stopDialogOpen}
          onOpenChange={setStopDialogOpen}
          formattedTime={tracker.formattedTime}
          onPause={handlePause}
          onLogAndReset={handleLogAndReset}
        />
      </div>
    </AppLayout>
  );
};

export default TrackerRecord;
