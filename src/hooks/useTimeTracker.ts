import { useState, useEffect, useCallback, useMemo } from "react";

const STORAGE_KEY = "ems_timer_state";

interface TimerState {
  isRunning: boolean;
  originalStartTime: number | null;
  accumulatedSeconds: number;
  engagementId: string | null;
  activityId: string | null;
  description: string;
  runningEntryId: string | null;
}

const DEFAULT_STATE: TimerState = {
  isRunning: false,
  originalStartTime: null,
  accumulatedSeconds: 0,
  engagementId: null,
  activityId: null,
  description: "",
  runningEntryId: null,
};

export function useTimeTracker() {
  const [state, setState] = useState<TimerState>(() => {
    const isNewEntry = typeof window !== 'undefined' && 
      window.location.pathname === '/tracker/new';
    
    if (isNewEntry) {
      localStorage.removeItem(STORAGE_KEY);
      return DEFAULT_STATE;
    }
    
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migrate legacy field names
        if ('startTime' in parsed && !('originalStartTime' in parsed)) {
          parsed.originalStartTime = parsed.startTime;
          delete parsed.startTime;
        }
        if ('elapsedSeconds' in parsed && !('accumulatedSeconds' in parsed)) {
          parsed.accumulatedSeconds = parsed.elapsedSeconds;
          delete parsed.elapsedSeconds;
        }
        // If timer was running, keep originalStartTime as-is.
        // Elapsed will be correctly derived from Date.now() - originalStartTime.
        return { ...DEFAULT_STATE, ...parsed };
      } catch {
        return DEFAULT_STATE;
      }
    }
    return DEFAULT_STATE;
  });

  // Re-render tick — does NOT mutate time state
  const [tick, setTick] = useState(0);

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Tick effect — only triggers re-renders
  useEffect(() => {
    if (!state.isRunning) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [state.isRunning]);

  // Pure derived elapsed — single source of truth
  const currentElapsed = useMemo(() => {
    if (state.isRunning && state.originalStartTime) {
      return state.accumulatedSeconds +
        Math.floor((Date.now() - state.originalStartTime) / 1000);
    }
    return state.accumulatedSeconds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isRunning, state.originalStartTime, state.accumulatedSeconds, tick]);

  const start = useCallback((entryId?: string) => {
    setState((prev) => ({
      ...prev,
      isRunning: true,
      originalStartTime: Date.now(),
      runningEntryId: entryId || prev.runningEntryId,
    }));
  }, []);

  const stop = useCallback(() => {
    setState((prev) => {
      let total = prev.accumulatedSeconds;
      if (prev.isRunning && prev.originalStartTime) {
        total += Math.floor((Date.now() - prev.originalStartTime) / 1000);
      }
      return {
        ...prev,
        isRunning: false,
        originalStartTime: null,
        accumulatedSeconds: total,
      };
    });
  }, []);

  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isRunning: false,
      originalStartTime: null,
      accumulatedSeconds: 0,
      engagementId: null,
      activityId: null,
      description: "",
      runningEntryId: null,
    }));
  }, []);

  const fullReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(DEFAULT_STATE);
  }, []);

  const clearRunningEntry = useCallback(() => {
    setState((prev) => ({
      ...prev,
      runningEntryId: null,
      accumulatedSeconds: 0,
    }));
  }, []);

  const setRunningEntryId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, runningEntryId: id }));
  }, []);

  const setEngagement = useCallback((id: string | null) => {
    setState((prev) => ({
      ...prev,
      engagementId: id,
      activityId: null,
    }));
  }, []);

  const setActivity = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, activityId: id }));
  }, []);

  const setDescription = useCallback((desc: string) => {
    setState((prev) => ({ ...prev, description: desc }));
  }, []);

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return {
    isRunning: state.isRunning,
    elapsedSeconds: currentElapsed,
    engagementId: state.engagementId,
    activityId: state.activityId,
    description: state.description,
    runningEntryId: state.runningEntryId,
    start,
    stop,
    reset,
    fullReset,
    clearRunningEntry,
    setRunningEntryId,
    setEngagement,
    setActivity,
    setDescription,
    formatTime,
    formattedTime: formatTime(currentElapsed),
  };
}
