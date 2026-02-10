

# Bug #2 Fix: Timer Drifts Behind Real Time

## Problem

The EMS timer loses ~2.5 minutes over ~32 minutes because the current architecture double-counts elapsed time. The `setInterval` tick accumulates `elapsedSeconds` each second AND `calculateElapsedFromStart` adds `(now - startTime)` on top of the already-accumulated total. The `visibilitychange` handler compounds the issue further.

## Root Cause (lines 76-87 + lines 64-71)

1. **Tick callback** (L81-86): Computes `newElapsed = (now - startTime)/1000`, adds it to `elapsedSeconds`, resets `startTime = now`
2. **Display function** (L65-68): `calculateElapsedFromStart` returns `elapsedSeconds + (now - startTime)/1000` -- this double-counts the gap since last tick
3. **Visibility handler** (L107-115): Does the same accumulation again when tab regains focus -- potentially triple-counting

When the browser throttles the interval (backgrounded tabs), ticks are skipped entirely, causing time loss.

## Fix: Absolute Timestamp Architecture

Replace the hybrid approach with a clean design where elapsed time is **always derived, never accumulated incrementally**.

### New State Shape

```text
TimerState {
  isRunning: boolean
  originalStartTime: number | null   // Set once on START, never reset per tick
  accumulatedSeconds: number          // Only updated on STOP (freeze previous run)
  engagementId: string | null
  activityId: string | null
  description: string
  runningEntryId: string | null
}
```

### Key Principle

Displayed time = `accumulatedSeconds + (Date.now() - originalStartTime)`

The `setInterval` exists **only** to trigger re-renders. It never mutates time state.

## Changes (single file: `src/hooks/useTimeTracker.ts`)

### 1. State interface -- rename fields
- `startTime` becomes `originalStartTime` (semantic clarity)
- `elapsedSeconds` becomes `accumulatedSeconds` (only stores frozen time from pause cycles)

### 2. Initialization (lines 26-54)
- On localStorage restore: if timer was running, keep `originalStartTime` as-is (do NOT recalculate or reset it)
- Remove the `additionalSeconds` accumulation logic that currently corrupts state on restore

### 3. Tick effect (lines 73-101) -- simplify to render-only
```typescript
const [tick, setTick] = useState(0);

useEffect(() => {
  if (!state.isRunning) return;
  const id = setInterval(() => setTick(t => t + 1), 1000);
  return () => clearInterval(id);
}, [state.isRunning]);
```

### 4. Elapsed calculation -- pure derivation
```typescript
const currentElapsed = useMemo(() => {
  if (state.isRunning && state.originalStartTime) {
    return state.accumulatedSeconds +
      Math.floor((Date.now() - state.originalStartTime) / 1000);
  }
  return state.accumulatedSeconds;
}, [state.isRunning, state.originalStartTime, state.accumulatedSeconds, tick]);
```

### 5. `start()` -- set originalStartTime once
```typescript
const start = useCallback((entryId?: string) => {
  setState(prev => ({
    ...prev,
    isRunning: true,
    originalStartTime: Date.now(),
    runningEntryId: entryId || prev.runningEntryId,
  }));
}, []);
```

### 6. `stop()` -- freeze accumulated, clear startTime
```typescript
const stop = useCallback(() => {
  setState(prev => {
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
```

### 7. Remove `visibilitychange` handler (lines 103-124)
No longer needed. Since elapsed is always `Date.now() - originalStartTime`, returning to the tab auto-corrects on the next render tick.

### 8. Remove `calculateElapsedFromStart` function (lines 63-71)
Replaced by the `useMemo` derivation above.

### 9. `reset()` and `fullReset()` -- update field names
Replace `elapsedSeconds: 0` with `accumulatedSeconds: 0` and `startTime: null` with `originalStartTime: null`.

### 10. `clearRunningEntry` -- update field name
Replace `elapsedSeconds: 0` with `accumulatedSeconds: 0`.

### 11. localStorage persistence -- no change needed
The existing `useEffect` that writes `JSON.stringify(state)` to localStorage continues to work. The restore logic is simplified (step 2).

## What Does NOT Change

- The public API (`isRunning`, `elapsedSeconds`, `formattedTime`, `start`, `stop`, `reset`, etc.) stays identical -- no changes needed in `TrackerRecord.tsx`, `TrackerBar.tsx`, or any consumer.
- `formatTime` helper is unchanged.
- All action callbacks (`setEngagement`, `setActivity`, `setDescription`, etc.) are unchanged.

## Summary

| What | Before | After |
|------|--------|-------|
| Time source | Incremental accumulation per tick | `Date.now() - originalStartTime` |
| setInterval purpose | Mutates `elapsedSeconds` + resets `startTime` | Triggers re-render only |
| visibilitychange handler | Adds delta on tab focus | Removed (unnecessary) |
| Background tab accuracy | Drifts ~2.5min/30min | Zero drift |
| State fields | `startTime` + `elapsedSeconds` (entangled) | `originalStartTime` + `accumulatedSeconds` (independent) |

