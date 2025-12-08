import { useTranslation } from "react-i18next";
import { Timer, Coffee, Armchair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
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
    { label: "55/5", work: 55, short: 5, long: 15 },
    { label: "25/5", work: 25, short: 5, long: 15 },
    { label: "50/10", work: 50, short: 10, long: 30 },
  ];

  const handleWorkChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0 && num <= 120) {
      onSettingsChange({ pomodoroDuration: num });
    }
  };

  const handleBreakChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0 && num <= 60) {
      onSettingsChange({ shortBreakDuration: num });
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-sm">
      <div className="flex flex-col md:flex-row gap-4 items-center">
        {/* Phase Indicator */}
        <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg", currentPhase.bgColor)}>
          <Icon className={cn("h-5 w-5", currentPhase.color)} />
          <div>
            <p className={cn("font-medium text-sm", currentPhase.color)}>{currentPhase.label}</p>
            <p className="text-xs text-muted-foreground">
              {t("tracker.pomodoro.cycle", { count: Math.floor(pomodoroCount / 4) + 1 })} • 
              Pomodoro {(pomodoroCount % 4) + 1}/4
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex-1 w-full md:w-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              {t("tracker.pomodoro.remaining")}
            </span>
            <span className="font-mono text-base font-semibold">{formattedRemaining}</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Custom Duration Inputs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">{t("tracker.pomodoro.work")}:</Label>
            <Input
              type="number"
              min={1}
              max={120}
              value={pomodoroDuration}
              onChange={(e) => handleWorkChange(e.target.value)}
              disabled={isRunning}
              className="h-7 w-14 text-xs text-center"
            />
            <span className="text-xs text-muted-foreground">m</span>
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">{t("tracker.pomodoro.break")}:</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={shortBreakDuration}
              onChange={(e) => handleBreakChange(e.target.value)}
              disabled={isRunning}
              className="h-7 w-14 text-xs text-center"
            />
            <span className="text-xs text-muted-foreground">m</span>
          </div>
        </div>

        {/* Presets */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">{t("tracker.pomodoro.presets")}:</span>
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
              className="text-xs h-7 px-2"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
