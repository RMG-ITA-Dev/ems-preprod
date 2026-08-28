import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { useActivityCodes } from "@/hooks/useEmsData";
import { useManualEntryEngagements } from "@/hooks/useManualEntryEngagements";
import { useAdminActivityId } from "@/hooks/useAdminActivity";
import { filterActivitiesForEngagement } from "@/lib/activityFilters";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EngagementCombobox } from "@/components/tracker/EngagementCombobox";

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

interface ManualEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (entry: {
    engagement_id: string;
    activity_id: string;
    description: string;
    date: Date;
    startTime: string;
    endTime: string;
    has_explicit_times: boolean;
    hours: number;
  }) => void;
}

export function ManualEntryDialog({
  open,
  onOpenChange,
  onSubmit,
}: ManualEntryDialogProps) {
  const { t } = useTranslation();
  const { data: engagements = [] } = useManualEntryEngagements();
  const { data: activityCodes = [] } = useActivityCodes();
  const adminActivityId = useAdminActivityId();

  const [engagementId, setEngagementId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hours, setHours] = useState<number>(1);
  const [useExplicitTimes, setUseExplicitTimes] = useState(false);

  const activeActivities = activityCodes.filter((a) => a.is_active);

  const handleToggleExplicitTimes = (checked: boolean) => {
    setUseExplicitTimes(checked);
    if (checked) {
      // Activate times: set defaults
      setStartTime("08:00");
      setEndTime(addHoursToTime("08:00", hours));
    } else {
      // Deactivate times: clear
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

  const handleSubmit = () => {
    const selectedEng = engagements.find(e => e.engagement_id === engagementId);
    // 0827-184: anchored on funcion, not activity_required. funcion == null (legacy, unset)
    // fails closed like funcion === 1 (activity required) — it must not auto-assign ADM.
    const isActNotReq = !!selectedEng && selectedEng.funcion != null && selectedEng.funcion !== 1;
    const effectiveActivityId = isActNotReq && adminActivityId ? adminActivityId : activityId;
    if (!engagementId || !effectiveActivityId) return;
    if (!engagements.some(e => e.engagement_id === engagementId)) {
      toast.error(t("tracker.woNotApproved"));
      return;
    }

    onSubmit({
      engagement_id: engagementId,
      activity_id: effectiveActivityId,
      description,
      date,
      startTime,
      endTime,
      has_explicit_times: useExplicitTimes,
      hours,
    });

    // Reset form
    setEngagementId("");
    setActivityId("");
    setDescription("");
    setDate(new Date());
    setStartTime("");
    setEndTime("");
    setHours(1);
    setUseExplicitTimes(false);
    onOpenChange(false);
  };

  const selectedEng = engagements.find(e => e.engagement_id === engagementId);
  const isActNotReq = !!selectedEng && selectedEng.funcion != null && selectedEng.funcion !== 1;
  const visibleActivities = filterActivitiesForEngagement(
    activeActivities,
    selectedEng?.funcion,
    selectedEng?.practica,
    activityId || undefined,
  );
  const canSubmit = engagementId && (activityId || (isActNotReq && adminActivityId)) && hours > 0 && (!useExplicitTimes || (startTime && endTime));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
          className="sm:max-w-[700px]"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
        <DialogHeader>
          <DialogTitle>{t("tracker.manualEntry")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Empty-state alert */}
          {engagements.length === 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{t("tracker.noApprovedEngagements")}</AlertDescription>
            </Alert>
          )}
          {/* Date */}
          <div className="space-y-2">
            <Label>{t("tracker.date")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "dd/MM/yyyy") : t("common.pickDate")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Range */}
          <div className="flex items-center justify-between mb-2">
            <Label className="font-medium">{t("tracker.sectionTime")}</Label>
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
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t("tracker.hours")}</Label>
              <Input
                type="number"
                min={0}
                max={8}
                step={0.5}
                value={hours}
                onChange={(e) => handleHoursChange(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tracker.startTime")}</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                disabled={!useExplicitTimes}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tracker.endTime")}</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => handleEndTimeChange(e.target.value)}
                disabled={!useExplicitTimes}
              />
            </div>
          </div>

          {/* Engagement */}
          <div className="space-y-2">
            <Label>{t("tracker.engagement")}</Label>
            <EngagementCombobox
              engagements={engagements}
              value={engagementId}
              onValueChange={(val) => {
                setEngagementId(val);
                const eng = engagements.find(e => e.engagement_id === val);
                const engIsActivityNotRequired = !!eng && eng.funcion != null && eng.funcion !== 1;
                if (engIsActivityNotRequired && adminActivityId) {
                  setActivityId(adminActivityId);
                } else {
                  setActivityId("");
                }
              }}
              placeholder={t("tracker.selectEngagement")}
            />
          </div>

          {/* Activity */}
          <div className="space-y-2">
            <Label>{t("tracker.activity")}</Label>
            <Select value={activityId} onValueChange={setActivityId} disabled={isActNotReq}>
              <SelectTrigger>
                <SelectValue placeholder={t("tracker.selectActivity")} />
              </SelectTrigger>
              <SelectContent>
                {visibleActivities.map((act) => (
                  <SelectItem key={act.activity_id} value={act.activity_id}>
                    {act.activity_code} - {act.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>{t("tracker.description")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("tracker.descriptionPlaceholder")}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="cancel" onClick={() => onOpenChange(false)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
          >
            {t("tracker.addEntry")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
