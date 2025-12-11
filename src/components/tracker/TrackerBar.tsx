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

  // Button visibility - all visible based on state
  const showStartButton = !isRunning;
  const showPauseButton = isRunning;
  const showSaveButton = hasTime;
  const showCancelButton = true; // Always visible to go back
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
    <div className="space-y-4">
      {/* BOX A: SELECTORS */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4">
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
                    : t("tracker.selectEngagement")}
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
                    : t("tracker.selectActivity")}
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
        </div>
      </div>

      {/* BOX B: TIMER CONTROLS */}
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <div className="flex flex-col items-center gap-6">
          {/* Timer Display */}
          <div className="flex items-center gap-6">
            <div
              className={cn(
                "font-mono text-5xl font-bold px-8 py-6 rounded-lg min-w-[280px] text-center",
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
                "text-sm px-4 py-3 rounded-lg whitespace-nowrap",
                remainingHours <= 1 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
              )}>
                {t("tracker.remainingToday")}: <span className="font-semibold">{remainingHours.toFixed(1)}h</span>
              </div>
            )}
          </div>

          {/* Control Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3">
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

      {/* BOX C: CICLOS */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
        {/* Header with Toggle */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">{t("tracker.cycles.title")}</h3>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">{cyclesEnabled ? "ON" : "OFF"}</Label>
            <Switch
              checked={cyclesEnabled}
              onCheckedChange={onToggleCycles}
              disabled={isRunning}
            />
          </div>
        </div>

        {/* Ciclos Content (when enabled) */}
        {cyclesEnabled && (
          <div className="flex flex-col md:flex-row gap-4 items-center">
            {/* Phase Indicator */}
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg", currentPhase.bgColor)}>
              <PhaseIcon className={cn("h-5 w-5", currentPhase.color)} />
              <div>
                <p className={cn("font-medium text-sm", currentPhase.color)}>{currentPhase.label}</p>
                <p className="text-xs text-muted-foreground">
                  {t("tracker.cycles.cycleNum", { num: (cycleCount % 4) + 1 })}
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="flex-1 w-full md:w-auto">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">
                  {t("tracker.cycles.remaining")}
                </span>
                <span className="font-mono text-base font-semibold">{cycleRemaining}</span>
              </div>
              <Progress value={cycleProgress} className="h-3" />
            </div>

            {/* Duration Inputs */}
            <div className="flex items-center gap-4">
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
                  className="h-8 w-16 text-sm text-center"
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
                  className="h-8 w-16 text-sm text-center"
                />
                <span className="text-xs text-muted-foreground">m</span>
              </div>
            </div>
          </div>
        )}

        {/* Disabled state message */}
        {!cyclesEnabled && (
          <p className="text-xs text-muted-foreground italic">
            {t("tracker.cycles.disabled")}
          </p>
        )}
      </div>
    </div>
  );
}
