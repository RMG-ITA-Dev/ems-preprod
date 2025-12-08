import { useTranslation } from "react-i18next";
import { Timer, Coffee, Armchair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { PomodoroPhase } from "@/hooks/useTimeTracker";

interface PomodoroPanelProps {
  isRunning: boolean;
  phase: PomodoroPhase;
  pomodoroCount: number;
  progress: number;
  formattedRemaining: string;
  pomodoroDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  onSettingsChange: (settings: {
    pomodoroDuration?: number;
    shortBreakDuration?: number;
    longBreakDuration?: number;
  }) => void;
}

export function PomodoroPanel({
  isRunning,
  phase,
  pomodoroCount,
  progress,
  formattedRemaining,
  pomodoroDuration,
  shortBreakDuration,
  longBreakDuration,
  onSettingsChange,
}: PomodoroPanelProps) {
  const { t } = useTranslation();

  const phaseConfig = {
    idle: {
      icon: Timer,
      label: t("tracker.pomodoro.ready"),
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
    work: {
      icon: Timer,
      label: t("tracker.pomodoro.focus"),
      color: "text-success",
      bgColor: "bg-success/10",
    },
    shortBreak: {
      icon: Coffee,
      label: t("tracker.pomodoro.shortBreak"),
      color: "text-info",
      bgColor: "bg-info/10",
    },
    longBreak: {
      icon: Armchair,
      label: t("tracker.pomodoro.longBreak"),
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
  };

  const currentPhase = phaseConfig[phase];
  const Icon = currentPhase.icon;

  const presets = [
    { label: "25/5", work: 25, short: 5, long: 15 },
    { label: "50/10", work: 50, short: 10, long: 30 },
    { label: "90/20", work: 90, short: 20, long: 45 },
  ];

  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
      <div className="flex flex-col md:flex-row gap-6 items-center">
        {/* Phase Indicator */}
        <div className={cn("flex items-center gap-3 px-4 py-3 rounded-lg", currentPhase.bgColor)}>
          <Icon className={cn("h-6 w-6", currentPhase.color)} />
          <div>
            <p className={cn("font-medium", currentPhase.color)}>{currentPhase.label}</p>
            <p className="text-xs text-muted-foreground">
              {t("tracker.pomodoro.cycle", { count: Math.floor(pomodoroCount / 4) + 1 })} • 
              Pomodoro {(pomodoroCount % 4) + 1}/4
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex-1 w-full md:w-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {t("tracker.pomodoro.remaining")}
            </span>
            <span className="font-mono text-lg font-semibold">{formattedRemaining}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Presets */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground mr-2">{t("tracker.pomodoro.presets")}:</span>
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant={
                pomodoroDuration === preset.work && shortBreakDuration === preset.short
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() =>
                onSettingsChange({
                  pomodoroDuration: preset.work,
                  shortBreakDuration: preset.short,
                  longBreakDuration: preset.long,
                })
              }
              disabled={isRunning}
              className="text-xs"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
