import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { format, isWeekend } from "date-fns";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { TrackerBar } from "@/components/tracker/TrackerBar";
import { ManualEntryDialog } from "@/components/tracker/ManualEntryDialog";
import { useTimeTracker } from "@/hooks/useTimeTracker";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useAuth } from "@/hooks/useAuth";
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

  // Timer initialization happens synchronously in useState using URL check
  const { user } = useAuth();
  const tracker = useTimeTracker();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { data: entries } = useTimerEntries();
  const { data: globalSettings } = useGlobalSettings();
  const createEntry = useCreateTimerEntry();
  const updateEntry = useUpdateTimerEntry();
  const deleteEntry = useDeleteTimerEntry();

  const [manualDialogOpen, setManualDialogOpen] = useState(false);

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

  // If editing, open manual dialog with entry data
  useEffect(() => {
    if (isEditMode && entries) {
      const entry = entries.find((e) => e.timer_id === id);
      if (entry) {
        tracker.setEngagement(entry.engagement_id);
        tracker.setActivity(entry.activity_id);
        setManualDialogOpen(true);
      }
    }
  }, [isEditMode, id, entries]);

  const isWeekendToday = isWeekend(new Date());

  // Determine if timer is paused (has time but not running)
  const isPaused = !tracker.isRunning && tracker.elapsedSeconds > 0 && !!tracker.runningEntryId;

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
      // Auto-stop any orphaned running entries before starting a new one
      const { data: runningEntries } = await supabase
        .from('timer_entries')
        .select('timer_id, started_at')
        .eq('staff_id', staffRecord.staff_id)
        .is('ended_at', null);

      if (runningEntries && runningEntries.length > 0) {
        const now = new Date().toISOString();
        for (const running of runningEntries) {
          const durationMinutes = roundToNearest5(
            Math.floor((Date.now() - new Date(running.started_at).getTime()) / 60000)
          );
          await supabase
            .from('timer_entries')
            .update({ ended_at: now, duration_minutes: durationMinutes })
            .eq('timer_id', running.timer_id);
        }
      }

      const result = await createEntry.mutateAsync({
        staff_id: staffRecord.staff_id,
        engagement_id: tracker.engagementId,
        activity_id: tracker.activityId,
        started_at: new Date().toISOString(),
      });
      tracker.setRunningEntryId(result.timer_id);
      tracker.start(result.timer_id);
    } catch (error) {
      toast.error(t("tracker.errorStarting"));
    }
  };

  const handlePause = () => {
    tracker.stop();
  };

  const roundToNearest5 = (minutes: number) => {
    const rounded = Math.round(minutes / 5) * 5;
    return Math.max(5, rounded);
  };

  const handleSaveAndReset = async () => {
    if (!tracker.runningEntryId) {
      toast.error(t("tracker.noEntryToSave"));
      tracker.fullReset();
      return;
    }
    
    // Validate entry exists in DB before trying to update
    const entryExists = entries?.find(e => e.timer_id === tracker.runningEntryId);
    if (!entryExists) {
      toast.error(t("tracker.entryNotFound"));
      tracker.fullReset();
      return;
    }
    
    try {
      const durationMinutes = roundToNearest5(Math.floor(tracker.elapsedSeconds / 60));
      await updateEntry.mutateAsync({
        timer_id: tracker.runningEntryId,
        ended_at: new Date().toISOString(),
        duration_minutes: durationMinutes,
      });
      tracker.fullReset();
      toast.success(t("tracker.entrySaved"));
      navigate("/tracker");
    } catch (error) {
      toast.error(t("tracker.errorStopping"));
    }
  };

  const handleCancel = () => {
    // Discard current entry without saving
    if (tracker.runningEntryId) {
      // Only delete if entry actually exists in DB
      const entryExists = entries?.find(e => e.timer_id === tracker.runningEntryId);
      if (entryExists) {
        deleteEntry.mutate(tracker.runningEntryId);
      }
    }
    tracker.fullReset();
    navigate("/tracker");
  };

  const handleDelete = async () => {
    // Edit mode: delete the specific entry being edited
    if (isEditMode && id) {
      try {
        await deleteEntry.mutateAsync(id);
        toast.success(t("tracker.entryDeleted"));
        navigate("/tracker");
      } catch (error) {
        toast.error(t("tracker.errorDeleting"));
      }
      return;
    }
    
    // New entry mode: delete the running entry if exists in DB
    if (tracker.runningEntryId) {
      const entryExists = entries?.find(e => e.timer_id === tracker.runningEntryId);
      if (entryExists) {
        try {
          await deleteEntry.mutateAsync(tracker.runningEntryId);
          toast.success(t("tracker.entryDeleted"));
        } catch (error) {
          toast.error(t("tracker.errorDeleting"));
        }
      }
      tracker.fullReset();
      navigate("/tracker");
      return;
    }
    
    // No entry to delete, just reset and navigate back
    tracker.fullReset();
    navigate("/tracker");
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
          isPaused={isPaused}
          formattedTime={tracker.formattedTime}
          engagementId={tracker.engagementId}
          activityId={tracker.activityId}
          remainingHours={remainingHours}
          isEditMode={isEditMode}
          onStart={handleStart}
          onPause={handlePause}
          onSaveAndReset={handleSaveAndReset}
          onCancel={handleCancel}
          onDelete={handleDelete}
          onEngagementChange={tracker.setEngagement}
          onActivityChange={tracker.setActivity}
        />

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
      </div>
    </AppLayout>
  );
};

export default TrackerRecord;
