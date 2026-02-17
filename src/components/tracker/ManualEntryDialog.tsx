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
import { useEngagements, useActivityCodes } from "@/hooks/useEmsData";
import { cn } from "@/lib/utils";
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
  }) => void;
}

export function ManualEntryDialog({
  open,
  onOpenChange,
  onSubmit,
}: ManualEntryDialogProps) {
  const { t } = useTranslation();
  const { data: engagements = [] } = useEngagements();
  const { data: activityCodes = [] } = useActivityCodes();

  const [engagementId, setEngagementId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [hours, setHours] = useState<number>(1);

  const activeEngagements = engagements.filter((e) => e.status === "active");
  const activeActivities = activityCodes.filter((a) => a.is_active);

  const handleHoursChange = (newHours: number) => {
    const clamped = Math.min(8, Math.max(0, newHours));
    if (newHours > 8) {
      toast.error(t("tracker.maxHoursExceeded"));
    }
    setHours(clamped);
    const start = startTime || "08:00";
    if (!startTime) setStartTime("08:00");
    setEndTime(addHoursToTime(start, clamped));
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
    if (!engagementId || !activityId) return;

    onSubmit({
      engagement_id: engagementId,
      activity_id: activityId,
      description,
      date,
      startTime,
      endTime,
    });

    // Reset form
    setEngagementId("");
    setActivityId("");
    setDescription("");
    setDate(new Date());
    setStartTime("08:00");
    setEndTime("09:00");
    setHours(1);
    onOpenChange(false);
  };

  const canSubmit = engagementId && activityId && startTime && endTime;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("tracker.manualEntry")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t("tracker.startTime")}</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
              />
            </div>
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
              <Label>{t("tracker.endTime")}</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => handleEndTimeChange(e.target.value)}
              />
            </div>
          </div>

          {/* Engagement */}
          <div className="space-y-2">
            <Label>{t("tracker.engagement")}</Label>
            <Select value={engagementId} onValueChange={setEngagementId}>
              <SelectTrigger>
                <SelectValue placeholder={t("tracker.selectEngagement")} />
              </SelectTrigger>
              <SelectContent>
                {activeEngagements.map((eng) => (
                  <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                    {eng.engagement_code || eng.engagement_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Activity */}
          <div className="space-y-2">
            <Label>{t("tracker.activity")}</Label>
            <Select value={activityId} onValueChange={setActivityId}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-brand-purple hover:bg-brand-purple/90 text-primary-foreground"
          >
            {t("tracker.addEntry")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
