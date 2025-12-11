import { useTranslation } from "react-i18next";
import { Play, Pause, Save, X, Trash2, Timer, Coffee, Armchair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumericInput } from "@/components/ui/numeric-input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEngagements, useActivityCodes } from "@/hooks/useEmsData";
import { cn } from "@/lib/utils";
import type { PomodoroPhase } from "@/hooks/useTimeTracker";

interface TrackerBarProps {
  isRunning: boolean;
  isPaused: boolean;
  formattedTime: string;
  engagementId: string | null;
  activityId: string | null;
  cyclesEnabled: boolean;
  remainingHours: number | null;
  isEditMode?: boolean;
  // Cycles props
  cyclePhase: PomodoroPhase;
  cycleCount: number;
  cycleProgress: number;
  cycleRemaining: string;
  cycleDuration: number;
  breakDuration: number;
  // Handlers
  onStart: () => void;
  onPause: () => void;
  onSaveAndReset: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onEngagementChange: (id: string | null) => void;
  onActivityChange: (id: string | null) => void;
  onToggleCycles: () => void;
  onCycleSettingsChange: (settings: { pomodoroDuration?: number; shortBreakDuration?: number }) => void;
}

export function TrackerBar({
  isRunning,
  isPaused,
  formattedTime,
  engagementId,
  activityId,
  cyclesEnabled,
  remainingHours,
  isEditMode = false,
  cyclePhase,
  cycleCount,
  cycleProgress,
  cycleRemaining,
  cycleDuration,
  breakDuration,
  onStart,
  onPause,
  onSaveAndReset,
  onCancel,
  onDelete,
  onEngagementChange,
  onActivityChange,
  onToggleCycles,
  onCycleSettingsChange,
}: TrackerBarProps) {
  const { t } = useTranslation();
  const { data: engagements = [] } = useEngagements();
  const { data: activityCodes = [] } = useActivityCodes();

  const activeEngagements = engagements.filter((e) => e.status === "active");
  const activeActivities = activityCodes.filter((a) => a.is_active);

  const selectedEngagement = activeEngagements.find(e => e.engagement_id === engagementId);
  const selectedActivity = activeActivities.find(a => a.activity_id === activityId);

  const canStart = engagementId && activityId && (remainingHours === null || remainingHours > 0);
  const hasTime = formattedTime !== "00:00:00";

  // Determine button visibility based on state
  const showStartButton = !isRunning && !isPaused;
  const showPauseButton = isRunning;
  const showSaveButton = isPaused && hasTime;
  const showCancelButton = isPaused && hasTime;
  const showDeleteButton = isEditMode;

  const phaseConfig = {
    idle: {
      icon: Timer,
      label: t("tracker.cycles.ready"),
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
    work: {
      icon: Timer,
      label: t("tracker.cycles.focus"),
      color: "text-success",
      bgColor: "bg-success/10",
    },
    shortBreak: {
      icon: Coffee,
      label: t("tracker.cycles.shortBreak"),
      color: "text-info",
      bgColor: "bg-info/10",
    },
    longBreak: {
      icon: Armchair,
      label: t("tracker.cycles.longBreak"),
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
  };

  const currentPhase = phaseConfig[cyclePhase];
  const PhaseIcon = currentPhase.icon;

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-6">
      {/* ROW 1: Engagement + Activity Selectors + Ciclos Toggle */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
        {/* Engagement Selector */}
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground mb-1.5 block">{t("tracker.engagement")}</Label>
          <Select
            value={engagementId || ""}
            onValueChange={(val) => onEngagementChange(val || null)}
            disabled={isRunning}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder={t("tracker.selectEngagement")}>
                {selectedEngagement 
                  ? `${selectedEngagement.engagement_code} - ${selectedEngagement.engagement_name}` 
                  : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {activeEngagements.map((eng) => (
                <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                  <span className="font-medium">{eng.engagement_code}</span>
                  <span className="text-muted-foreground ml-2">- {eng.engagement_name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Activity Selector */}
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground mb-1.5 block">{t("tracker.activity")}</Label>
          <Select
            value={activityId || ""}
            onValueChange={(val) => onActivityChange(val || null)}
            disabled={isRunning}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder={t("tracker.selectActivity")}>
                {selectedActivity 
                  ? `${selectedActivity.activity_code} - ${selectedActivity.description}` 
                  : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {activeActivities.map((act) => (
                <SelectItem key={act.activity_id} value={act.activity_id}>
                  <span className="font-medium">{act.activity_code}</span>
                  <span className="text-muted-foreground ml-2">- {act.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Ciclos Toggle */}
        <div className="flex items-end gap-2 pb-0.5">
          <div className="flex items-center gap-2">
            <Switch
              checked={cyclesEnabled}
              onCheckedChange={onToggleCycles}
              disabled={isRunning}
            />
            <Label className="text-sm text-muted-foreground whitespace-nowrap">
              {t("tracker.cycles.title")}
            </Label>
          </div>
        </div>
      </div>

      {/* ROW 2: Ciclos Panel (when enabled) */}
      {cyclesEnabled && (
        <div className="flex flex-col md:flex-row gap-4 items-center p-4 bg-muted/30 rounded-lg">
          {/* Phase Indicator */}
          <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg", currentPhase.bgColor)}>
            <PhaseIcon className={cn("h-5 w-5", currentPhase.color)} />
            <div>
              <p className={cn("font-medium text-sm", currentPhase.color)}>{currentPhase.label}</p>
              <p className="text-xs text-muted-foreground">
                {t("tracker.cycles.cycle", { count: Math.floor(cycleCount / 4) + 1 })} • 
                {t("tracker.cycles.cycleNum", { num: (cycleCount % 4) + 1 })}
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex-1 w-full md:w-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">
                {t("tracker.cycles.remaining")}
              </span>
              <span className="font-mono text-base font-semibold">{cycleRemaining}</span>
            </div>
            <Progress value={cycleProgress} className="h-1.5" />
          </div>

          {/* Duration Inputs */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">{t("tracker.cycles.work")}:</Label>
              <NumericInput
                decimals={0}
                locale="en"
                min={1}
                max={120}
                value={cycleDuration}
                onChange={(val) => onCycleSettingsChange({ pomodoroDuration: Number(val) })}
                disabled={isRunning}
                className="h-7 w-14 text-xs text-center"
              />
              <span className="text-xs text-muted-foreground">m</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">{t("tracker.cycles.break")}:</Label>
              <NumericInput
                decimals={0}
                locale="en"
                min={1}
                max={60}
                value={breakDuration}
                onChange={(val) => onCycleSettingsChange({ shortBreakDuration: Number(val) })}
                disabled={isRunning}
                className="h-7 w-14 text-xs text-center"
              />
              <span className="text-xs text-muted-foreground">m</span>
            </div>
          </div>
        </div>
      )}

      {/* ROW 3: Timer Display + Control Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
        {/* Timer Display */}
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "font-mono text-4xl font-bold px-6 py-4 rounded-lg min-w-[200px] text-center",
              isRunning ? "bg-success/10 text-success" : 
              isPaused ? "bg-warning/10 text-warning" : 
              "bg-muted text-muted-foreground"
            )}
          >
            {formattedTime}
          </div>
          
          {/* Remaining Hours Indicator */}
          {remainingHours !== null && (
            <div className={cn(
              "text-sm px-3 py-2 rounded whitespace-nowrap",
              remainingHours <= 1 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            )}>
              {t("tracker.remainingToday")}: {remainingHours.toFixed(1)}h
            </div>
          )}
        </div>

        {/* Control Buttons */}
        <div className="flex items-center gap-3">
          {/* START Button - Teal #008795 */}
          {showStartButton && (
            <Button
              onClick={onStart}
              disabled={!canStart}
              className="h-12 px-6 text-base font-semibold bg-tracker-start hover:bg-tracker-start/90 text-primary-foreground"
            >
              <Play className="h-5 w-5 mr-2" />
              {t("tracker.start")}
            </Button>
          )}

          {/* PAUSE Button - Blue-gray #5e7eb9 */}
          {showPauseButton && (
            <Button
              onClick={onPause}
              className="h-12 px-6 text-base font-semibold bg-tracker-pause hover:bg-tracker-pause/90 text-primary-foreground"
            >
              <Pause className="h-5 w-5 mr-2" />
              {t("tracker.pause")}
            </Button>
          )}

          {/* SAVE & RESET Button - Gold #e7b952 */}
          {showSaveButton && (
            <Button
              onClick={onSaveAndReset}
              className="h-12 px-6 text-base font-semibold bg-tracker-save hover:bg-tracker-save/90 text-foreground"
            >
              <Save className="h-5 w-5 mr-2" />
              {t("tracker.saveAndReset")}
            </Button>
          )}

          {/* CANCEL Button - Gray #727176 */}
          {showCancelButton && (
            <Button
              onClick={onCancel}
              className="h-12 px-6 text-base font-semibold bg-tracker-cancel hover:bg-tracker-cancel/90 text-primary-foreground"
            >
              <X className="h-5 w-5 mr-2" />
              {t("common.cancel")}
            </Button>
          )}

          {/* DELETE Button - Crimson (edit mode only) */}
          {showDeleteButton && (
            <Button
              onClick={onDelete}
              className="h-12 px-6 text-base font-semibold bg-tracker-delete hover:bg-foreground text-primary-foreground transition-colors"
            >
              <Trash2 className="h-5 w-5 mr-2" />
              {t("common.delete")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
