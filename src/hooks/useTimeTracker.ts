import { useState, useCallback } from "react";

/**
 * Thin UI form-state holder for the stopwatch page.
 * The DB (timer_entries with ended_at IS NULL) is the source of truth for running state.
 * This hook only manages engagement/activity/description selection before starting.
 */
export function useTimeTracker() {
  const [engagementId, setEngagementIdState] = useState<string | null>(null);
  const [activityId, setActivityIdState] = useState<string | null>(null);
  const [description, setDescriptionState] = useState("");

  const setEngagement = useCallback((id: string | null) => {
    setEngagementIdState(id);
    setActivityIdState(null);
  }, []);

  const setActivity = useCallback((id: string | null) => {
    setActivityIdState(id);
  }, []);

  const setDescription = useCallback((desc: string) => {
    setDescriptionState(desc);
  }, []);

  const resetForm = useCallback(() => {
    setEngagementIdState(null);
    setActivityIdState(null);
    setDescriptionState("");
  }, []);

  const formatTime = (seconds: number): string => {
    const clamped = Math.min(seconds, 28800); // 8h cap for display
    const hrs = Math.floor(clamped / 3600);
    const mins = Math.floor((clamped % 3600) / 60);
    const secs = clamped % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return {
    engagementId,
    activityId,
    description,
    setEngagement,
    setActivity,
    setDescription,
    resetForm,
    formatTime,
  };
}
