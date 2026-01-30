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
        // If timer was running, calculate elapsed time from startTime
        if (parsed.isRunning && parsed.startTime) {
          const now = Date.now();
          const additionalSeconds = Math.floor((now - parsed.startTime) / 1000);
          parsed.elapsedSeconds += additionalSeconds;
          // Keep running - we'll continue from current time
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

  // Calculate elapsed time from startTime - this fixes background tracking
  const calculateElapsedFromStart = useCallback(() => {
    if (state.isRunning && state.startTime) {
      const now = Date.now();
      const totalElapsed = state.elapsedSeconds + Math.floor((now - state.startTime) / 1000);
      return totalElapsed;
    }
    return state.elapsedSeconds;
  }, [state.isRunning, state.startTime, state.elapsedSeconds]);

  // Timer tick effect - uses timestamp-based calculation
  useEffect(() => {
    if (state.isRunning && state.startTime) {
      // Update display every second, but calculate from startTime
      intervalRef.current = setInterval(() => {
        setState((prev) => {
          if (!prev.isRunning || !prev.startTime) return prev;
          const now = Date.now();
          const newElapsed = Math.floor((now - prev.startTime) / 1000);
          return {
            ...prev,
            elapsedSeconds: prev.elapsedSeconds + newElapsed,
            startTime: now, // Reset startTime to now
          };
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

  // Visibility change handler - recalculate when tab becomes active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && state.isRunning && state.startTime) {
        setState((prev) => {
          if (!prev.isRunning || !prev.startTime) return prev;
          const now = Date.now();
          const additionalSeconds = Math.floor((now - prev.startTime) / 1000);
          return {
            ...prev,
            elapsedSeconds: prev.elapsedSeconds + additionalSeconds,
            startTime: now,
          };
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.isRunning, state.startTime]);

  const start = useCallback((entryId?: string) => {
    setState((prev) => ({
      ...prev,
      isRunning: true,
      startTime: Date.now(),
      runningEntryId: entryId || prev.runningEntryId,
    }));
  }, []);

  const stop = useCallback(() => {
    setState((prev) => {
      // Calculate final elapsed before stopping
      let finalElapsed = prev.elapsedSeconds;
      if (prev.isRunning && prev.startTime) {
        const now = Date.now();
        finalElapsed += Math.floor((now - prev.startTime) / 1000);
      }
      return {
        ...prev,
        isRunning: false,
        startTime: null,
        elapsedSeconds: finalElapsed,
      };
    });
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

  // Get current elapsed including any running time
  const currentElapsed = calculateElapsedFromStart();

  return {
    // State
    isRunning: state.isRunning,
    elapsedSeconds: currentElapsed,
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
    formattedTime: formatTime(currentElapsed),
  };
}
