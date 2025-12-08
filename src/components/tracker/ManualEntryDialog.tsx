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
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  const activeEngagements = engagements.filter((e) => e.status === "active");
  const activeActivities = activityCodes.filter((a) => a.is_active);

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
    setStartTime("09:00");
    setEndTime("10:00");
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
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("tracker.startTime")}</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tracker.endTime")}</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
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
            style={{ backgroundColor: "hsl(var(--brand-purple))" }}
          >
            {t("tracker.addEntry")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
