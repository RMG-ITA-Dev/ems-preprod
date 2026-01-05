import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimeTracker } from "../useTimeTracker";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("useTimeTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with default state", () => {
    const { result } = renderHook(() => useTimeTracker());

    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.engagementId).toBeNull();
    expect(result.current.activityId).toBeNull();
    expect(result.current.description).toBe("");
    expect(result.current.runningEntryId).toBeNull();
  });

  it("starts timer and increments elapsed time", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.start();
    });

    expect(result.current.isRunning).toBe(true);

    // Advance time by 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.elapsedSeconds).toBe(3);
  });

  it("stops timer and preserves elapsed time", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    act(() => {
      result.current.stop();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsedSeconds).toBe(5);

    // Time should not increase after stopping
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.elapsedSeconds).toBe(5);
  });

  it("resets timer to zero", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.start();
      vi.advanceTimersByTime(5000);
      result.current.stop();
    });

    expect(result.current.elapsedSeconds).toBe(5);

    act(() => {
      result.current.reset();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.engagementId).toBeNull();
    expect(result.current.activityId).toBeNull();
    expect(result.current.description).toBe("");
  });

  it("sets engagement and clears activity", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.setActivity("activity-1");
    });

    expect(result.current.activityId).toBe("activity-1");

    act(() => {
      result.current.setEngagement("engagement-1");
    });

    expect(result.current.engagementId).toBe("engagement-1");
    expect(result.current.activityId).toBeNull(); // Activity cleared
  });

  it("sets activity", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.setActivity("activity-123");
    });

    expect(result.current.activityId).toBe("activity-123");
  });

  it("sets description", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.setDescription("Working on audit");
    });

    expect(result.current.description).toBe("Working on audit");
  });

  it("formats time correctly", () => {
    const { result } = renderHook(() => useTimeTracker());

    // Test formatTime function
    expect(result.current.formatTime(0)).toBe("00:00:00");
    expect(result.current.formatTime(59)).toBe("00:00:59");
    expect(result.current.formatTime(60)).toBe("00:01:00");
    expect(result.current.formatTime(3661)).toBe("01:01:01");
    expect(result.current.formatTime(36000)).toBe("10:00:00");
  });

  it("returns formattedTime based on elapsedSeconds", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.start();
      vi.advanceTimersByTime(65000); // 1 minute 5 seconds
    });

    expect(result.current.formattedTime).toBe("00:01:05");
  });

  it("persists state to localStorage", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.setEngagement("eng-1");
      result.current.setActivity("act-1");
      result.current.setDescription("Test work");
    });

    expect(localStorageMock.setItem).toHaveBeenCalled();
    
    const savedState = JSON.parse(
      localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1][1]
    );
    expect(savedState.engagementId).toBe("eng-1");
    expect(savedState.activityId).toBe("act-1");
    expect(savedState.description).toBe("Test work");
  });

  it("fullReset clears localStorage", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.setEngagement("eng-1");
      result.current.start();
      vi.advanceTimersByTime(5000);
    });

    act(() => {
      result.current.fullReset();
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("ems_timer_state");
    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.engagementId).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });

  it("setRunningEntryId updates entry ID", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.setRunningEntryId("entry-123");
    });

    expect(result.current.runningEntryId).toBe("entry-123");
  });

  it("clearRunningEntry resets entry and elapsed time", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.setRunningEntryId("entry-123");
      result.current.start();
      vi.advanceTimersByTime(5000);
      result.current.stop();
    });

    expect(result.current.runningEntryId).toBe("entry-123");
    expect(result.current.elapsedSeconds).toBe(5);

    act(() => {
      result.current.clearRunningEntry();
    });

    expect(result.current.runningEntryId).toBeNull();
    expect(result.current.elapsedSeconds).toBe(0);
  });

  it("start with entryId sets runningEntryId", () => {
    const { result } = renderHook(() => useTimeTracker());

    act(() => {
      result.current.start("new-entry-id");
    });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.runningEntryId).toBe("new-entry-id");
  });
});
