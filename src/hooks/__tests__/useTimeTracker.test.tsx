import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useTimeTracker } from "../useTimeTracker";

describe("useTimeTracker (form-state only)", () => {
  it("starts with null/empty state", () => {
    const { result } = renderHook(() => useTimeTracker());
    expect(result.current.engagementId).toBeNull();
    expect(result.current.activityId).toBeNull();
    expect(result.current.description).toBe("");
  });

  it("setEngagement clears activityId", () => {
    const { result } = renderHook(() => useTimeTracker());
    act(() => result.current.setActivity("act-1"));
    act(() => result.current.setEngagement("eng-1"));
    expect(result.current.engagementId).toBe("eng-1");
    expect(result.current.activityId).toBeNull();
  });

  it("setActivity works", () => {
    const { result } = renderHook(() => useTimeTracker());
    act(() => result.current.setActivity("act-1"));
    expect(result.current.activityId).toBe("act-1");
  });

  it("setDescription works", () => {
    const { result } = renderHook(() => useTimeTracker());
    act(() => result.current.setDescription("test desc"));
    expect(result.current.description).toBe("test desc");
  });

  it("resetForm clears all fields", () => {
    const { result } = renderHook(() => useTimeTracker());
    act(() => {
      result.current.setEngagement("eng-1");
      result.current.setActivity("act-1");
      result.current.setDescription("desc");
    });
    act(() => result.current.resetForm());
    expect(result.current.engagementId).toBeNull();
    expect(result.current.activityId).toBeNull();
    expect(result.current.description).toBe("");
  });

  it("formatTime formats correctly and clamps at 8h", () => {
    const { result } = renderHook(() => useTimeTracker());
    expect(result.current.formatTime(0)).toBe("00:00:00");
    expect(result.current.formatTime(3661)).toBe("01:01:01");
    expect(result.current.formatTime(28800)).toBe("08:00:00");
    expect(result.current.formatTime(30000)).toBe("08:00:00");
  });
});
