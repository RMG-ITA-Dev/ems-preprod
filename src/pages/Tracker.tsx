import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO, differenceInMinutes, startOfDay, isToday } from "date-fns";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { TrackerBar } from "@/components/tracker/TrackerBar";
import { PomodoroPanel } from "@/components/tracker/PomodoroPanel";
import { TrackerEntryList } from "@/components/tracker/TrackerEntryList";
import { ManualEntryDialog } from "@/components/tracker/ManualEntryDialog";
import { StopActionDialog } from "@/components/tracker/StopActionDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { useTimeTracker } from "@/hooks/useTimeTracker";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useGlobalSettings } from "@/hooks/useEmsData";
import {
  useTimerEntries,
  useCreateTimerEntry,
  useUpdateTimerEntry,
  useDeleteTimerEntry,
  type TimerEntry,
} from "@/hooks/useTimerEntries";

export default function Tracker() {
  const { t } = useTranslation();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { data: entries = [], isLoading: entriesLoading } = useTimerEntries();
  const { data: globalSettings = [] } = useGlobalSettings();
  const createEntry = useCreateTimerEntry();
  const updateEntry = useUpdateTimerEntry();
  const deleteEntry = useDeleteTimerEntry();

  const [isManualMode, setIsManualMode] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);

  const tracker = useTimeTracker();

  // Get daily limit from global settings
  const dailyLimit = useMemo(() => {
    const setting = globalSettings.find(s => s.setting_key === "DAILY_LIMIT");
    return setting ? parseFloat(setting.setting_value) : 8;
  }, [globalSettings]);

  // Calculate today's tracked hours
  const todayTrackedHours = useMemo(() => {
    const todayEntries = entries.filter(e => {
      const entryDate = parseISO(e.started_at);
      return isToday(entryDate);
    });
    
    const totalMinutes = todayEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
    // Add current running timer if any
    const currentTimerMinutes = tracker.isRunning ? Math.ceil(tracker.elapsedSeconds / 60) : 0;
    
    return (totalMinutes + currentTimerMinutes) / 60;
  }, [entries, tracker.isRunning, tracker.elapsedSeconds]);

  const remainingHours = dailyLimit - todayTrackedHours;

  // Request notification permission for Pomodoro
  useEffect(() => {
    if (tracker.pomodoroEnabled && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [tracker.pomodoroEnabled]);

  // Sync running entry on page load
  useEffect(() => {
    if (tracker.runningEntryId && !tracker.isRunning) {
      // Check if the entry still exists and has no ended_at
      const runningEntry = entries.find(e => e.timer_id === tracker.runningEntryId && !e.ended_at);
      if (runningEntry) {
        // Calculate elapsed time from started_at
        const startedAt = parseISO(runningEntry.started_at);
        const elapsedSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
        tracker.start(runningEntry.timer_id);
      } else {
        tracker.clearRunningEntry();
      }
    }
  }, [entries]);

  const handleStart = async () => {
    if (!staffRecord?.staff_id || !tracker.engagementId || !tracker.activityId) {
      return;
    }

    // Check daily limit before starting
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
      tracker.start(result.timer_id);
    } catch (error) {
      toast.error(t("tracker.errorStarting"));
    }
  };

  const handleStopClick = () => {
    setStopDialogOpen(true);
  };

  const handleContinue = () => {
    // Just close dialog, timer keeps running
  };

  // Round duration to nearest 5 minutes (minimum 5)
  const roundToNearest5 = (minutes: number): number => {
    return Math.max(5, Math.round(minutes / 5) * 5);
  };

  const handleLogAndReset = async () => {
    if (!tracker.runningEntryId) {
      tracker.stop();
      return;
    }

    const now = new Date();
    const rawMinutes = Math.ceil(tracker.elapsedSeconds / 60);
    const durationMinutes = roundToNearest5(rawMinutes);

    // Check if logging would exceed daily limit
    const wouldExceed = (todayTrackedHours - (tracker.isRunning ? tracker.elapsedSeconds / 3600 : 0)) + (durationMinutes / 60) > dailyLimit;
    if (wouldExceed) {
      toast.error(t("tracker.dailyLimitExceeded"));
      return;
    }

    try {
      await updateEntry.mutateAsync({
        timer_id: tracker.runningEntryId,
        ended_at: now.toISOString(),
        duration_minutes: durationMinutes,
      });
      tracker.stop();
      tracker.reset();
      toast.success(t("tracker.entrySaved"));
    } catch (error) {
      toast.error(t("tracker.errorStopping"));
    }
  };

  const handleManualSubmit = async (data: {
    engagement_id: string;
    activity_id: string;
    description: string;
    date: Date;
    startTime: string;
    endTime: string;
  }) => {
    if (!staffRecord?.staff_id) return;

    const [startHour, startMin] = data.startTime.split(":").map(Number);
    const [endHour, endMin] = data.endTime.split(":").map(Number);

    const startDate = new Date(data.date);
    startDate.setHours(startHour, startMin, 0, 0);

    const endDate = new Date(data.date);
    endDate.setHours(endHour, endMin, 0, 0);

    const rawDuration = differenceInMinutes(endDate, startDate);
    const durationMinutes = roundToNearest5(rawDuration);

    if (durationMinutes <= 0) {
      toast.error(t("tracker.invalidTimeRange"));
      return;
    }

    // Check daily limit for the date of the entry
    const entryDate = startOfDay(data.date);
    const dateEntries = entries.filter(e => {
      const eDate = startOfDay(parseISO(e.started_at));
      return eDate.getTime() === entryDate.getTime();
    });
    const dateTotalMinutes = dateEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
    
    if ((dateTotalMinutes + durationMinutes) / 60 > dailyLimit) {
      toast.error(t("tracker.dailyLimitExceeded"));
      return;
    }

    try {
      await createEntry.mutateAsync({
        staff_id: staffRecord.staff_id,
        engagement_id: data.engagement_id,
        activity_id: data.activity_id,
        description: data.description || undefined,
        started_at: startDate.toISOString(),
        ended_at: endDate.toISOString(),
        duration_minutes: durationMinutes,
      });
      toast.success(t("tracker.entryAdded"));
    } catch (error) {
      toast.error(t("tracker.errorAdding"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEntry.mutateAsync(id);
      toast.success(t("tracker.entryDeleted"));
    } catch (error) {
      toast.error(t("tracker.errorDeleting"));
    }
  };

  const handleDuplicate = async (entry: TimerEntry) => {
    if (!staffRecord?.staff_id) return;

    // Check daily limit before duplicating
    if (remainingHours <= 0) {
      toast.error(t("tracker.dailyLimitReached"));
      return;
    }

    try {
      await createEntry.mutateAsync({
        staff_id: staffRecord.staff_id,
        engagement_id: entry.engagement_id,
        activity_id: entry.activity_id,
        description: entry.description || undefined,
        started_at: new Date().toISOString(),
      });
      toast.success(t("tracker.entryDuplicated"));
    } catch (error) {
      toast.error(t("tracker.errorDuplicating"));
    }
  };

  const handleEdit = (entry: TimerEntry) => {
    // For now, just open manual dialog - could enhance to pre-fill
    setManualDialogOpen(true);
  };

  if (staffLoading) {
    return (
      <AppLayout title={t("tracker.title")}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!staffRecord) {
    return (
      <AppLayout title={t("tracker.title")}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("timesheet.noStaffRecord")}</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("tracker.title")}>
      <div className="space-y-4">
        {/* Tracker Bar */}
        <TrackerBar
          isRunning={tracker.isRunning}
          formattedTime={tracker.formattedTime}
          engagementId={tracker.engagementId}
          activityId={tracker.activityId}
          description={tracker.description}
          pomodoroEnabled={tracker.pomodoroEnabled}
          remainingHours={remainingHours}
          onStart={handleStart}
          onStop={handleStopClick}
          onEngagementChange={tracker.setEngagement}
          onActivityChange={tracker.setActivity}
          onDescriptionChange={tracker.setDescription}
          onTogglePomodoro={tracker.togglePomodoro}
          isManualMode={isManualMode}
          onToggleMode={() => {
            if (!tracker.isRunning) {
              setIsManualMode(!isManualMode);
              if (!isManualMode) {
                setManualDialogOpen(true);
              }
            }
          }}
        />

        {/* Pomodoro Panel */}
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

        {/* Entry List */}
        {entriesLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TrackerEntryList
            entries={entries}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onEdit={handleEdit}
          />
        )}

        {/* Manual Entry Dialog */}
        <ManualEntryDialog
          open={manualDialogOpen}
          onOpenChange={setManualDialogOpen}
          onSubmit={handleManualSubmit}
        />

        {/* Stop Action Dialog */}
        <StopActionDialog
          open={stopDialogOpen}
          onOpenChange={setStopDialogOpen}
          formattedTime={tracker.formattedTime}
          onContinue={handleContinue}
          onLogAndReset={handleLogAndReset}
        />
      </div>
    </AppLayout>
  );
}
