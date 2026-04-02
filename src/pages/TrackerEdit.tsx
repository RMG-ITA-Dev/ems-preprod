import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import { es } from "date-fns/locale";
import { toast } from "sonner";

function addHoursToTime(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = h * 60 + m + Math.round(hours * 60);
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function computeHoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = (eh * 60 + em - sh * 60 - sm) / 60;
  return Math.max(0, diff);
}
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Trash2, CalendarIcon, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTimerEntries, useUpdateTimerEntry, useDeleteTimerEntry } from "@/hooks/useTimerEntries";
import { useEngagements, useActivityCodes } from "@/hooks/useEmsData";
import { useApprovedEngagements } from "@/hooks/useApprovedEngagements";
import { useLanguage } from "@/hooks/useLanguage";
// toast imported at top of file
import { cn } from "@/lib/utils";

const TrackerEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentLanguage } = useLanguage();
  const { data: entries, isFetched } = useTimerEntries();
  const { data: engagements } = useEngagements();
  const { data: approvedEngagements = [] } = useApprovedEngagements();
  const { data: activityCodes } = useActivityCodes();
  const updateEntry = useUpdateTimerEntry();
  const deleteEntry = useDeleteTimerEntry();

  const entry = entries?.find(e => e.timer_id === id);
  const isImported = Boolean(entry?.is_imported) || Boolean(entry?.imported_to_time_id);

  // Form state (must be declared before isDirty useMemo)
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hours, setHours] = useState<number>(0);
  const [engagementId, setEngagementId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [description, setDescription] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [useExplicitTimes, setUseExplicitTimes] = useState(true);

  // Dirty tracking: compare current form values against initial entry values
  const isDirty = useMemo(() => {
    if (!entry) return false;
    const origStart = new Date(entry.started_at);
    return (
      engagementId !== entry.engagement_id ||
      activityId !== entry.activity_id ||
      (description || "") !== (entry.description || "") ||
      startTime !== format(origStart, "HH:mm") ||
      (entry.ended_at ? endTime !== format(new Date(entry.ended_at), "HH:mm") : false)
    );
  }, [entry, engagementId, activityId, description, startTime, endTime]);

  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  const handleToggleExplicitTimes = (checked: boolean) => {
    setUseExplicitTimes(checked);
    if (checked) {
      setStartTime("08:00");
      setEndTime(addHoursToTime("08:00", hours));
    } else {
      setStartTime("");
      setEndTime("");
    }
  };

  const handleHoursChange = (newHours: number) => {
    const clamped = Math.min(8, Math.max(0, newHours));
    if (newHours > 8) {
      toast.error(t("tracker.maxHoursExceeded"));
    }
    setHours(clamped);
    if (useExplicitTimes) {
      const start = startTime || "08:00";
      if (!startTime) setStartTime("08:00");
      setEndTime(addHoursToTime(start, clamped));
    }
  };

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    if (hours > 0) {
      setEndTime(addHoursToTime(newStart, hours));
    } else if (endTime) {
      const computed = computeHoursBetween(newStart, endTime);
      if (computed > 8) {
        setHours(8);
        setEndTime(addHoursToTime(newStart, 8));
        toast.error(t("tracker.maxHoursExceeded"));
      } else {
        setHours(Math.round(computed * 2) / 2);
      }
    }
  };

  const handleEndTimeChange = (newEnd: string) => {
    const computed = computeHoursBetween(startTime, newEnd);
    if (computed > 8) {
      setHours(8);
      setEndTime(addHoursToTime(startTime, 8));
      toast.error(t("tracker.maxHoursExceeded"));
    } else {
      setHours(Math.round(computed * 2) / 2);
      setEndTime(newEnd);
    }
  };

  // Guard 1: Not found -- runs only after query settles
  useEffect(() => {
    if (isFetched && !entry) navigate("/tracker", { replace: true });
  }, [isFetched, entry, navigate]);

  // Guard 2: Running timer -- also gated on isFetched
  useEffect(() => {
    if (isFetched && entry && !entry.ended_at) navigate("/tracker/new", { replace: true });
  }, [isFetched, entry, navigate]);

  // Populate form when entry loads
  useEffect(() => {
    if (entry) {
      const start = new Date(entry.started_at);
      setDate(start);
      const hasExplicit = entry.has_explicit_times !== false;
      setUseExplicitTimes(hasExplicit);
      if (hasExplicit) {
        setStartTime(format(start, "HH:mm"));
        if (entry.ended_at) {
          const end = new Date(entry.ended_at);
          setEndTime(format(end, "HH:mm"));
          const durationHours = (end.getTime() - start.getTime()) / 3600000;
          setHours(Math.min(8, Math.round(durationHours * 2) / 2));
        }
      } else {
        setStartTime("");
        setEndTime("");
        if (entry.duration_minutes) {
          setHours(Math.min(8, Math.round((entry.duration_minutes / 60) * 2) / 2));
        }
      }
      setEngagementId(entry.engagement_id);
      setActivityId(entry.activity_id);
      setDescription(entry.description || "");
    }
  }, [entry]);

  // Filter to approved engagements + include current even if unapproved
  const activeEngagements = useMemo(() => {
    if (
      entry?.engagement_id &&
      !approvedEngagements.find(e => e.engagement_id === entry.engagement_id)
    ) {
      const currentEng = engagements?.find(
        e => e.engagement_id === entry.engagement_id
      );
      return currentEng
        ? [currentEng, ...approvedEngagements]
        : approvedEngagements;
    }
    return approvedEngagements;
  }, [approvedEngagements, entry?.engagement_id, engagements]);

  // Filter active activities + include current even if inactive
  const activeActivities = useMemo(() => {
    if (!activityCodes) return [];
    return activityCodes.filter(a => a.is_active || a.activity_id === entry?.activity_id);
  }, [activityCodes, entry?.activity_id]);

  const handleSave = async () => {
    if (!entry || !date) return;

    // Block save if selected engagement is not approved
    const isApproved = approvedEngagements.some(
      e => e.engagement_id === engagementId
    );
    if (!isApproved) {
      toast.error(t("tracker.woNotApprovedSave"));
      return;
    }

    let startDate: Date;
    let endDate: Date;
    let durationMinutes: number;

    if (useExplicitTimes) {
      if (!startTime || !endTime) return;
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);

      startDate = new Date(date);
      startDate.setHours(startHour, startMin, 0, 0);
      endDate = new Date(date);
      endDate.setHours(endHour, endMin, 0, 0);

      if (endDate <= startDate) {
        toast.error(t("tracker.invalidTimeRange"));
        return;
      }

      durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    } else {
      // Hours-only mode: synthetic timestamps
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      durationMinutes = Math.round(hours * 60);
      endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    }

    try {
      await updateEntry.mutateAsync({
        timer_id: entry.timer_id,
        started_at: startDate.toISOString(),
        ended_at: endDate.toISOString(),
        duration_minutes: durationMinutes,
        engagement_id: engagementId,
        activity_id: activityId,
        description: description || undefined,
        has_explicit_times: useExplicitTimes,
      });
      toast.success(t("tracker.recordSaved"));
      allowNextNavigation();
      navigate("/tracker");
    } catch (error) {
      console.error("Update error:", error);
      toast.error(t("common.error"));
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    try {
      await deleteEntry.mutateAsync(entry.timer_id);
      toast.success(t("tracker.recordDeleted"));
      allowNextNavigation();
      navigate("/tracker");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(t("common.error"));
    }
  };

  // Loading skeleton
  if (!isFetched && !entries) {
    return (
      <AppLayout title={t("tracker.editRecord")} focusMode>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="bg-card rounded-xl border border-border p-6 space-y-6">
            <Skeleton className="h-6 w-32" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-6 w-32" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </AppLayout>
    );
  }

  // Entry not yet found (guards will redirect)
  if (!entry) return null;

  return (
    <AppLayout title={t("tracker.editRecord")} focusMode>
      <div className="space-y-6">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{t("tracker.editRecord")}</h1>
          {!isImported && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("common.delete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("tracker.deleteRecordConfirm")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive/70 text-destructive-foreground hover:bg-destructive"
                  >
                    {t("common.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Imported alert */}
        {isImported && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("tracker.readOnlyImported")}</AlertDescription>
          </Alert>
        )}

        {/* Form card */}
        <div className="bg-card rounded-xl border border-border p-6 space-y-6">
          {/* Section: Time */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-lg">{t("tracker.sectionTime")}</h3>
              {!isImported && (
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={useExplicitTimes}
                    onCheckedChange={handleToggleExplicitTimes}
                    className="scale-75"
                  />
                  <span className="text-xs text-muted-foreground">
                    {t("tracker.useExplicitTimes")}
                  </span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {/* Date */}
              <div className="space-y-2 sm:max-w-[160px]">
                <Label>{t("tracker.date")}</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={isImported}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "dd/MM/yyyy", { locale: currentLanguage === "es" ? es : undefined }) : t("common.pickDate")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => {
                        setDate(d);
                        setDatePickerOpen(false);
                      }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {/* Hours */}
              <div className="space-y-2 sm:max-w-[120px]">
                <Label>{t("tracker.hours")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={8}
                  step={0.5}
                  value={hours}
                  onChange={(e) => handleHoursChange(parseFloat(e.target.value) || 0)}
                  disabled={isImported}
                />
              </div>
              {/* Start Time */}
              <div className="space-y-2">
                <Label>{t("tracker.startTime")}</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  disabled={isImported || !useExplicitTimes}
                />
              </div>
              {/* End Time */}
              <div className="space-y-2">
                <Label>{t("tracker.endTime")}</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  disabled={isImported || !useExplicitTimes}
                />
              </div>
            </div>
          </div>

          {/* Section: Engagement */}
          <div className="space-y-4">
            <h3 className="font-medium text-lg">{t("tracker.sectionEngagement")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Engagement */}
              <div className="space-y-2">
                <Label>{t("tracker.engagement")}</Label>
                <Select value={engagementId} onValueChange={setEngagementId} disabled={isImported}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("tracker.selectEngagement")} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeEngagements.map((eng) => (
                      <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                        {eng.engagement_code ? `${eng.engagement_code} - ` : ""}{eng.engagement_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {entry?.engagement_id &&
                  !approvedEngagements.some(e => e.engagement_id === engagementId) && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{t("tracker.woNotApprovedEdit")}</AlertDescription>
                  </Alert>
                )}
              </div>
              {/* Activity */}
              <div className="space-y-2">
                <Label>{t("tracker.activity")}</Label>
                <Select value={activityId} onValueChange={setActivityId} disabled={isImported}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("tracker.selectActivity")} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeActivities.map((act) => (
                      <SelectItem key={act.activity_id} value={act.activity_id}>
                        {act.activity_code} - {act.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Section: Detail */}
          <div className="space-y-4">
            <h3 className="font-medium text-lg">{t("tracker.sectionDetail")}</h3>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("tracker.descriptionPlaceholder")}
              disabled={isImported}
            />
          </div>

          {/* Footer buttons */}
          {!isImported && (
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-4">
              <Button
                variant="outline"
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                onClick={() => { allowNextNavigation(); navigate("/tracker"); }}
              >
                {t("common.cancel")}
              </Button>
              <LoadingButton
                variant="default"
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                loading={updateEntry.isPending}
                onClick={handleSave}
              >
                {t("common.saveChanges")}
              </LoadingButton>
            </div>
          )}
        </div>
      </div>
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default TrackerEdit;
