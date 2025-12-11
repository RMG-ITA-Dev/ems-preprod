import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "ems_timer_state";

interface TimerState {
  isRunning: boolean;
  startTime: number | null;
  elapsedSeconds: number;
  engagementId: string | null;
  activityId: string | null;
  description: string;
  runningEntryId: string | null;
}

const DEFAULT_STATE: TimerState = {
  isRunning: false,
  startTime: null,
  elapsedSeconds: 0,
  engagementId: null,
  activityId: null,
  description: "",
  runningEntryId: null,
};

export function useTimeTracker() {
  const [state, setState] = useState<TimerState>(() => {
    // BULLETPROOF: Check URL directly in initializer - runs synchronously before first render
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
        // IMPORTANT: Do NOT auto-resume timer on page load
        // Only restore elapsed time, require manual start to resume
        if (parsed.isRunning && parsed.startTime) {
          const now = Date.now();
          const additionalSeconds = Math.floor((now - parsed.startTime) / 1000);
          parsed.elapsedSeconds += additionalSeconds;
          // Stop the timer - user must manually restart
          parsed.isRunning = false;
          parsed.startTime = null;
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
        setState((prev) => ({
          ...prev,
          elapsedSeconds: prev.elapsedSeconds + 1,
        }));
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

  const start = useCallback((entryId?: string) => {
    setState((prev) => ({
      ...prev,
      isRunning: true,
      startTime: Date.now(),
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
      runningEntryId: null,
    }));
  }, []);

  // Full reset that also clears localStorage - use when creating new entry
  const fullReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(DEFAULT_STATE);
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
    setState((prev) => ({
      ...prev,
      engagementId: id,
      // ALWAYS clear activity when engagement changes or is cleared
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
    // State
    isRunning: state.isRunning,
    elapsedSeconds: state.elapsedSeconds,
    engagementId: state.engagementId,
    activityId: state.activityId,
    description: state.description,
    runningEntryId: state.runningEntryId,
    // Actions
    start,
    stop,
    reset,
    fullReset,
    clearRunningEntry,
    setRunningEntryId,
    setEngagement,
    setActivity,
    setDescription,
    // Helpers
    formatTime,
    formattedTime: formatTime(state.elapsedSeconds),
  };
}
