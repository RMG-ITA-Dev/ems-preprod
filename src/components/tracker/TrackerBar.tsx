import { useTranslation } from "react-i18next";
import { Play, Square, Timer, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useEngagements, useActivityCodes } from "@/hooks/useEmsData";
import { cn } from "@/lib/utils";

interface TrackerBarProps {
  isRunning: boolean;
  formattedTime: string;
  engagementId: string | null;
  activityId: string | null;
  description: string;
  pomodoroEnabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onEngagementChange: (id: string | null) => void;
  onActivityChange: (id: string | null) => void;
  onDescriptionChange: (desc: string) => void;
  onTogglePomodoro: () => void;
  isManualMode: boolean;
  onToggleMode: () => void;
}

export function TrackerBar({
  isRunning,
  formattedTime,
  engagementId,
  activityId,
  description,
  pomodoroEnabled,
  onStart,
  onStop,
  onEngagementChange,
  onActivityChange,
  onDescriptionChange,
  onTogglePomodoro,
  isManualMode,
  onToggleMode,
}: TrackerBarProps) {
  const { t } = useTranslation();
  const { data: engagements = [] } = useEngagements();
  const { data: activityCodes = [] } = useActivityCodes();

  const activeEngagements = engagements.filter((e) => e.status === "active");
  const activeActivities = activityCodes.filter((a) => a.is_active);

  const canStart = engagementId && activityId;

  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
        {/* Description Input */}
        <div className="flex-1">
          <Input
            placeholder={t("tracker.whatAreYouWorkingOn")}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            className="h-10"
            disabled={isRunning}
          />
        </div>

        {/* Engagement Selector */}
        <div className="w-full lg:w-48">
          <Select
            value={engagementId || ""}
            onValueChange={(val) => onEngagementChange(val || null)}
            disabled={isRunning}
          >
            <SelectTrigger className="h-10">
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

        {/* Activity Selector */}
        <div className="w-full lg:w-40">
          <Select
            value={activityId || ""}
            onValueChange={(val) => onActivityChange(val || null)}
            disabled={isRunning}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder={t("tracker.selectActivity")} />
            </SelectTrigger>
            <SelectContent>
              {activeActivities.map((act) => (
                <SelectItem key={act.activity_id} value={act.activity_id}>
                  {act.activity_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pomodoro Toggle */}
        <div className="flex items-center gap-2">
          <Switch
            checked={pomodoroEnabled}
            onCheckedChange={onTogglePomodoro}
            disabled={isRunning}
          />
          <Label className="text-sm text-muted-foreground">
            <Timer className="h-4 w-4 inline mr-1" />
            Pomodoro
          </Label>
        </div>

        {/* Timer Display */}
        <div
          className={cn(
            "font-mono text-2xl font-semibold px-4 py-2 rounded-md min-w-[120px] text-center",
            isRunning ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
          )}
        >
          {formattedTime}
        </div>

        {/* Start/Stop Button */}
        <Button
          onClick={isRunning ? onStop : onStart}
          disabled={!canStart && !isRunning}
          className={cn(
            "h-10 px-6 btn-action",
            isRunning
              ? "bg-destructive hover:bg-destructive/90"
              : "bg-brand-purple hover:bg-brand-purple/90"
          )}
          style={
            isRunning
              ? {}
              : { backgroundColor: "hsl(var(--brand-purple))" }
          }
        >
          {isRunning ? (
            <>
              <Square className="h-4 w-4 mr-2" />
              {t("tracker.stop")}
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              {t("tracker.start")}
            </>
          )}
        </Button>

        {/* Mode Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleMode}
          title={isManualMode ? t("tracker.timerMode") : t("tracker.manualMode")}
        >
          {isManualMode ? (
            <Timer className="h-5 w-5" />
          ) : (
            <Clock className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
}
