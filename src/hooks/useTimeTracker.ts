import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "ems_timer_state";

export type PomodoroPhase = "work" | "shortBreak" | "longBreak" | "idle";

interface TimerState {
  isRunning: boolean;
  startTime: number | null;
  elapsedSeconds: number;
  engagementId: string | null;
  activityId: string | null;
  description: string;
  // Pomodoro state
  pomodoroEnabled: boolean;
  pomodoroPhase: PomodoroPhase;
  pomodoroCount: number;
  pomodoroDuration: number; // in minutes
  shortBreakDuration: number;
  longBreakDuration: number;
}

interface TimerStateWithEntry extends TimerState {
  runningEntryId: string | null;
}

const DEFAULT_STATE: TimerStateWithEntry = {
  isRunning: false,
  startTime: null,
  elapsedSeconds: 0,
  engagementId: null,
  activityId: null,
  description: "",
  pomodoroEnabled: false,
  pomodoroPhase: "idle",
  pomodoroCount: 0,
  pomodoroDuration: 55,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  runningEntryId: null,
};

export function useTimeTracker() {
  const [state, setState] = useState<TimerStateWithEntry>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Recalculate elapsed time if timer was running
        if (parsed.isRunning && parsed.startTime) {
          const now = Date.now();
          const additionalSeconds = Math.floor((now - parsed.startTime) / 1000);
          parsed.elapsedSeconds += additionalSeconds;
          parsed.startTime = now;
        }
        return { ...DEFAULT_STATE, ...parsed };
      } catch {
        return DEFAULT_STATE;
      }
    }
    return DEFAULT_STATE;
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Timer tick effect
  useEffect(() => {
    if (state.isRunning) {
      intervalRef.current = setInterval(() => {
        setState((prev) => {
          const newElapsed = prev.elapsedSeconds + 1;
          
          // Check if pomodoro phase is complete
          if (prev.pomodoroEnabled && prev.pomodoroPhase !== "idle") {
            const targetSeconds = getPhaseSeconds(prev);
            if (newElapsed >= targetSeconds) {
              // Phase complete - auto transition
              return handlePhaseComplete(prev);
            }
          }
          
          return { ...prev, elapsedSeconds: newElapsed };
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [state.isRunning]);

  const getPhaseSeconds = (s: TimerState): number => {
    switch (s.pomodoroPhase) {
      case "work":
        return s.pomodoroDuration * 60;
      case "shortBreak":
        return s.shortBreakDuration * 60;
      case "longBreak":
        return s.longBreakDuration * 60;
      default:
        return Infinity;
    }
  };

  const handlePhaseComplete = (prev: TimerStateWithEntry): TimerStateWithEntry => {
    if (prev.pomodoroPhase === "work") {
      const newCount = prev.pomodoroCount + 1;
      // After 4 pomodoros, take a long break
      const nextPhase: PomodoroPhase = newCount % 4 === 0 ? "longBreak" : "shortBreak";
      // Notify user
      if (Notification.permission === "granted") {
        new Notification("Pomodoro Complete!", {
          body: `Time for a ${nextPhase === "longBreak" ? "long" : "short"} break!`,
        });
      }
      return {
        ...prev,
        pomodoroPhase: nextPhase,
        pomodoroCount: newCount,
        elapsedSeconds: 0,
        startTime: Date.now(),
      };
    } else {
      // Break complete, start new work session
      if (Notification.permission === "granted") {
        new Notification("Break Over!", {
          body: "Ready to start another pomodoro?",
        });
      }
      return {
        ...prev,
        pomodoroPhase: "work",
        elapsedSeconds: 0,
        startTime: Date.now(),
      };
    }
  };

  const start = useCallback((entryId?: string) => {
    setState((prev) => ({
      ...prev,
      isRunning: true,
      startTime: Date.now(),
      pomodoroPhase: prev.pomodoroEnabled ? "work" : "idle",
      runningEntryId: entryId || prev.runningEntryId,
    }));
  }, []);

  const stop = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isRunning: false,
      startTime: null,
    }));
  }, []);

  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isRunning: false,
      startTime: null,
      elapsedSeconds: 0,
      engagementId: null,
      activityId: null,
      description: "",
      pomodoroPhase: "idle",
      pomodoroCount: 0,
      runningEntryId: null,
    }));
  }, []);

  const clearRunningEntry = useCallback(() => {
    setState((prev) => ({
      ...prev,
      runningEntryId: null,
      elapsedSeconds: 0,
    }));
  }, []);

  const setRunningEntryId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, runningEntryId: id }));
  }, []);

  const setEngagement = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, engagementId: id }));
  }, []);

  const setActivity = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, activityId: id }));
  }, []);

  const setDescription = useCallback((desc: string) => {
    setState((prev) => ({ ...prev, description: desc }));
  }, []);

  const togglePomodoro = useCallback(() => {
    setState((prev) => ({ ...prev, pomodoroEnabled: !prev.pomodoroEnabled }));
  }, []);

  const setPomodoroSettings = useCallback((settings: {
    pomodoroDuration?: number;
    shortBreakDuration?: number;
    longBreakDuration?: number;
  }) => {
    setState((prev) => ({ ...prev, ...settings }));
  }, []);

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getRemainingTime = (): number => {
    if (!state.pomodoroEnabled || state.pomodoroPhase === "idle") {
      return 0;
    }
    const target = getPhaseSeconds(state);
    return Math.max(0, target - state.elapsedSeconds);
  };

  const getProgress = (): number => {
    if (!state.pomodoroEnabled || state.pomodoroPhase === "idle") {
      return 0;
    }
    const target = getPhaseSeconds(state);
    return Math.min(100, (state.elapsedSeconds / target) * 100);
  };

  return {
    // State
    isRunning: state.isRunning,
    elapsedSeconds: state.elapsedSeconds,
    engagementId: state.engagementId,
    activityId: state.activityId,
    description: state.description,
    runningEntryId: state.runningEntryId,
    // Pomodoro
    pomodoroEnabled: state.pomodoroEnabled,
    pomodoroPhase: state.pomodoroPhase,
    pomodoroCount: state.pomodoroCount,
    pomodoroDuration: state.pomodoroDuration,
    shortBreakDuration: state.shortBreakDuration,
    longBreakDuration: state.longBreakDuration,
    // Actions
    start,
    stop,
    reset,
    clearRunningEntry,
    setRunningEntryId,
    setEngagement,
    setActivity,
    setDescription,
    togglePomodoro,
    setPomodoroSettings,
    // Helpers
    formatTime,
    getRemainingTime,
    getProgress,
    formattedTime: formatTime(state.elapsedSeconds),
    formattedRemaining: formatTime(getRemainingTime()),
  };
}
