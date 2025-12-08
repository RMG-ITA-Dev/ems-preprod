import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { TrackerBar } from "@/components/tracker/TrackerBar";
import { PomodoroPanel } from "@/components/tracker/PomodoroPanel";
import { TrackerEntryList } from "@/components/tracker/TrackerEntryList";
import { ManualEntryDialog } from "@/components/tracker/ManualEntryDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { useTimeTracker } from "@/hooks/useTimeTracker";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
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
  const createEntry = useCreateTimerEntry();
  const updateEntry = useUpdateTimerEntry();
  const deleteEntry = useDeleteTimerEntry();

  const [isManualMode, setIsManualMode] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [runningEntryId, setRunningEntryId] = useState<string | null>(null);

  const tracker = useTimeTracker();

  // Request notification permission for Pomodoro
  useEffect(() => {
    if (tracker.pomodoroEnabled && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [tracker.pomodoroEnabled]);

  const handleStart = async () => {
    if (!staffRecord?.staff_id || !tracker.engagementId || !tracker.activityId) {
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
      setRunningEntryId(result.timer_id);
      tracker.start();
    } catch (error) {
      toast.error(t("tracker.errorStarting"));
    }
  };

  const handleStop = async () => {
    if (!runningEntryId) {
      tracker.stop();
      return;
    }

    const now = new Date();
    const durationMinutes = Math.ceil(tracker.elapsedSeconds / 60);

    try {
      await updateEntry.mutateAsync({
        timer_id: runningEntryId,
        ended_at: now.toISOString(),
        duration_minutes: durationMinutes,
      });
      tracker.stop();
      tracker.reset();
      setRunningEntryId(null);
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

    const durationMinutes = differenceInMinutes(endDate, startDate);

    if (durationMinutes <= 0) {
      toast.error(t("tracker.invalidTimeRange"));
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
      <div className="space-y-6">
        {/* Tracker Bar */}
        <TrackerBar
          isRunning={tracker.isRunning}
          formattedTime={tracker.formattedTime}
          engagementId={tracker.engagementId}
          activityId={tracker.activityId}
          description={tracker.description}
          pomodoroEnabled={tracker.pomodoroEnabled}
          onStart={handleStart}
          onStop={handleStop}
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
      </div>
    </AppLayout>
  );
}
