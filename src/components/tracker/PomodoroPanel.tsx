import { useTranslation } from "react-i18next";
import { Timer, Coffee, Armchair } from "lucide-react";
import { NumericInput } from "@/components/ui/numeric-input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PomodoroPhase } from "@/hooks/useTimeTracker";

interface CyclesPanelProps {
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
  onSettingsChange,
}: CyclesPanelProps) {
  const { t } = useTranslation();

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

  const currentPhase = phaseConfig[phase];
  const Icon = currentPhase.icon;

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
              {t("tracker.cycles.cycle", { count: Math.floor(pomodoroCount / 4) + 1 })} • 
              {t("tracker.cycles.cycleNum", { num: (pomodoroCount % 4) + 1 })}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex-1 w-full md:w-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              {t("tracker.cycles.remaining")}
            </span>
            <span className="font-mono text-base font-semibold">{formattedRemaining}</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Custom Duration Inputs */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">{t("tracker.cycles.work")}:</Label>
            <NumericInput
              decimals={0}
              locale="en"
              min={1}
              max={120}
              value={pomodoroDuration}
              onChange={(val) => handleWorkChange(String(val))}
              disabled={isRunning}
              className="h-7 w-16 text-xs text-center"
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
              value={shortBreakDuration}
              onChange={(val) => handleBreakChange(String(val))}
              disabled={isRunning}
              className="h-7 w-16 text-xs text-center"
            />
            <span className="text-xs text-muted-foreground">m</span>
          </div>
        </div>
      </div>
    </div>
  );
}
