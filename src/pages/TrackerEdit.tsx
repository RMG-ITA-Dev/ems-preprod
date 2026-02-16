import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { es } from "date-fns/locale";
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
import { useTimerEntries, useUpdateTimerEntry, useDeleteTimerEntry } from "@/hooks/useTimerEntries";
import { useEngagements, useActivityCodes } from "@/hooks/useEmsData";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TrackerEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentLanguage } = useLanguage();
  const { data: entries, isFetched } = useTimerEntries();
  const { data: engagements } = useEngagements();
  const { data: activityCodes } = useActivityCodes();
  const updateEntry = useUpdateTimerEntry();
  const deleteEntry = useDeleteTimerEntry();

  const entry = entries?.find(e => e.timer_id === id);
  const isImported = entry?.is_imported ?? false;

  // Form state
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [engagementId, setEngagementId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [description, setDescription] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

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
      setStartTime(format(start, "HH:mm"));
      if (entry.ended_at) {
        const end = new Date(entry.ended_at);
        setEndTime(format(end, "HH:mm"));
      }
      setEngagementId(entry.engagement_id);
      setActivityId(entry.activity_id);
      setDescription(entry.description || "");
    }
  }, [entry]);

  // Filter active engagements + include current even if inactive
  const activeEngagements = useMemo(() => {
    if (!engagements) return [];
    return engagements.filter(e => e.status === "active" || e.engagement_id === entry?.engagement_id);
  }, [engagements, entry?.engagement_id]);

  // Filter active activities + include current even if inactive
  const activeActivities = useMemo(() => {
    if (!activityCodes) return [];
    return activityCodes.filter(a => a.is_active || a.activity_id === entry?.activity_id);
  }, [activityCodes, entry?.activity_id]);

  const handleSave = async () => {
    if (!entry || !date || !startTime || !endTime) return;

    const [startHour, startMin] = startTime.split(":").map(Number);
    const [endHour, endMin] = endTime.split(":").map(Number);

    const startDate = new Date(date);
    startDate.setHours(startHour, startMin, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(endHour, endMin, 0, 0);

    if (endDate <= startDate) {
      toast.error(t("tracker.invalidTimeRange"));
      return;
    }

    const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

    try {
      await updateEntry.mutateAsync({
        timer_id: entry.timer_id,
        started_at: startDate.toISOString(),
        ended_at: endDate.toISOString(),
        duration_minutes: durationMinutes,
        engagement_id: engagementId,
        activity_id: activityId,
        description: description || undefined,
      });
      toast.success(t("tracker.recordSaved"));
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
      navigate("/tracker");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(t("common.error"));
    }
  };

  // Loading skeleton
  if (!isFetched && !entries) {
    return (
      <AppLayout title={t("tracker.editRecord")}>
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
    <AppLayout title={t("tracker.editRecord")}>
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
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
            <h3 className="font-medium text-lg">{t("tracker.sectionTime")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Date */}
              <div className="space-y-2">
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
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {/* Start Time */}
              <div className="space-y-2">
                <Label>{t("tracker.startTime")}</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={isImported}
                />
              </div>
              {/* End Time */}
              <div className="space-y-2">
                <Label>{t("tracker.endTime")}</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={isImported}
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
                variant="cancel"
                className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
                onClick={() => navigate("/tracker")}
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
    </AppLayout>
  );
};

export default TrackerEdit;
