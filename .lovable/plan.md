
# Plan_0213-29_C05_v5: Disable "Usar Cronometro" When Running + Fix Stale Leave Dialog After Save

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-29 |
| Title | El usuario puede iniciar varios cronometros aunque estos no se listen |
| Priority | Media |
| Route | OPERACIONES - Cronometro |

## Changes from v4

| Change | Detail |
|--------|--------|
| Changelog | Added mandatory step to append implementation entry to `docs/CHANGELOG-2026-02-17.md` |

All other content is unchanged from v4.

## Problems

**Problem 1 (Bug 0213-29):** The "Usar cronometro" button on `/tracker` is always enabled even when a timer is running. DB prevents duplicates but UI gives no indication.

**Problem 2 (User-reported):** After clicking "Guardar" on `/tracker/new`, the "Cronometro en curso" leave dialog appears because the `useBlocker` still sees stale `isRunning = true` before the query cache updates.

## Solution

### Fix 1 -- TrackerList: Disable button + "Ver cronometro activo" CTA

**`src/pages/TrackerList.tsx`**

1. Add `useRunningTimerEntry` to the existing import on line 36:
   ```typescript
   import { useTimerEntries, TimerEntry, useCreateTimerEntry, useRunningTimerEntry } from "@/hooks/useTimerEntries";
   ```

2. Call the hook inside the component (near other hook calls around line 52):
   ```typescript
   const { data: runningEntry } = useRunningTimerEntry();
   const hasRunningTimer = !!runningEntry;
   ```

3. Replace the "Usar cronometro" button block (lines 387-395) with:
   ```typescript
   {/* Use Timer - disabled when a timer is running */}
   <span
     className="inline-flex"
     title={hasRunningTimer ? t("tracker.timerAlreadyRunningHint") : undefined}
   >
     <Button
       variant="default"
       onClick={() => navigate("/tracker/new")}
       disabled={hasRunningTimer}
       className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0 bg-warning text-warning-foreground hover:bg-warning/90"
     >
       <Plus className="h-4 w-4 mr-2" />
       {t("tracker.useTimer")}
     </Button>
   </span>
   {/* View active timer CTA - only when running */}
   {hasRunningTimer && (
     <Button
       variant="outline"
       onClick={() => navigate("/tracker/new")}
       className="flex-1 sm:flex-none min-h-[44px] sm:min-h-0"
     >
       {t("tracker.viewActiveTimer")}
     </Button>
   )}
   ```

### Fix 2 -- TrackerRecord: Bypass blocker before navigating

**`src/pages/TrackerRecord.tsx`**

Set `stopwatchBypassRef.current = true` immediately after the async operation succeeds, before `tracker.resetForm()`, `toast`, or `navigate()`.

**`handleSaveAndReset` (lines 203-207):**
```typescript
await stopRPC.mutateAsync({ timer_id: runningEntry.timer_id });
stopwatchBypassRef.current = true;
tracker.resetForm();
toast.success(t("tracker.entrySaved"));
navigate("/tracker");
```

**`handleCancel` (lines 213-222):**
```typescript
if (runningEntry) {
  try {
    await deleteEntry.mutateAsync(runningEntry.timer_id);
  } catch {
    // Entry may already be gone
  }
}
stopwatchBypassRef.current = true;
tracker.resetForm();
navigate("/tracker");
```

**`handleDelete` (lines 225-235):**
```typescript
if (runningEntry) {
  try {
    await deleteEntry.mutateAsync(runningEntry.timer_id);
    toast.success(t("tracker.entryDeleted"));
  } catch {
    toast.error(t("tracker.errorDeleting"));
  }
}
stopwatchBypassRef.current = true;
tracker.resetForm();
navigate("/tracker");
```

No `queueMicrotask` reset needed -- the component unmounts on navigation.

### Fix 3 -- i18n keys

**`src/locales/en.json`** (in the `tracker` section, after line 192):
```json
"timerAlreadyRunningHint": "A timer is already running. Stop it before starting a new one.",
"viewActiveTimer": "View active timer"
```

**`src/locales/es.json`** (in the `tracker` section, after line 192):
```json
"timerAlreadyRunningHint": "Ya hay un cronómetro en curso. Deténgalo antes de iniciar uno nuevo.",
"viewActiveTimer": "Ver cronómetro activo"
```

Existing key `tracker.timerAlreadyRunning` (line 190) is unchanged.

### Fix 4 -- Documentation

**`docs/CHANGELOG-2026-02-17.md`** -- Append the following entry at the end of the file:

```text
---

## BUG #0213-29: Disable Timer Button When Running + Fix Stale Leave Dialog

**Date:** 2026-02-18
**Priority:** Media
**Version:** v2.0.9
**Route:** OPERACIONES -> Cronometro

### Problem

Two issues with the Tracker:
1. The "Usar cronometro" button on `/tracker` was always enabled, allowing users to click it repeatedly even when a timer was already running. Although the DB prevents duplicate running timers, the UI gave no indication.
2. After clicking "Guardar" on `/tracker/new`, the "Cronometro en curso" leave-confirmation dialog appeared incorrectly because the `useBlocker` navigation guard still evaluated stale `isRunning = true` from cached query data.

### Root Cause

1. `TrackerList.tsx` did not check for a running timer entry.
2. `handleSaveAndReset` in `TrackerRecord.tsx` called `navigate()` before the `running_timer` query cache updated, so the `useBlocker` condition was still true. The "Run in Background" button already solved this with `stopwatchBypassRef`, but the save/cancel/delete handlers did not use it.

### Solution

1. **TrackerList:** Import `useRunningTimerEntry()`, disable "Usar cronometro" button when `hasRunningTimer` is true (wrapped in `<span className="inline-flex">` for tooltip accessibility), and show a secondary "Ver cronometro activo" CTA.
2. **TrackerRecord:** Set `stopwatchBypassRef.current = true` in `handleSaveAndReset`, `handleCancel`, and `handleDelete` immediately after the async DB operation succeeds, before `resetForm()` or `navigate()`.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/TrackerList.tsx` | Import `useRunningTimerEntry`, disable button when running, add tooltip wrapper, add "Ver cronometro activo" CTA |
| `src/pages/TrackerRecord.tsx` | Add `stopwatchBypassRef.current = true` in `handleSaveAndReset`, `handleCancel`, `handleDelete` before navigation |
| `src/locales/en.json` | Added `tracker.timerAlreadyRunningHint`, `tracker.viewActiveTimer` |
| `src/locales/es.json` | Added `tracker.timerAlreadyRunningHint`, `tracker.viewActiveTimer` |
| `docs/CHANGELOG-2026-02-17.md` | This entry |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Extra query on TrackerList | Already cached by `RunningTimerChip` in header; no extra network request |
| Button re-enables after stop | `useStopTimerRPC` invalidates `running_timer` query key; instant re-enable |
| Disabled button tooltip not showing | Wrapped in `<span className="inline-flex" title=...>` |
| Bypass ref stays true | Component unmounts on navigation; ref is garbage-collected |
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/pages/TrackerList.tsx` | MODIFY | Import `useRunningTimerEntry`, disable button when running, tooltip wrapper, "Ver cronometro activo" CTA |
| `src/pages/TrackerRecord.tsx` | MODIFY | Add `stopwatchBypassRef.current = true` in all three handlers before `resetForm`/`navigate` |
| `src/locales/en.json` | MODIFY | Add `tracker.timerAlreadyRunningHint` and `tracker.viewActiveTimer` |
| `src/locales/es.json` | MODIFY | Add `tracker.timerAlreadyRunningHint` and `tracker.viewActiveTimer` |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-29 changelog entry |

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Extra query on TrackerList | Already cached by `RunningTimerChip` in header; no extra network request |
| Button re-enables after stop | `useStopTimerRPC` invalidates `running_timer` query key; instant re-enable |
| Disabled button tooltip not showing | Wrapped in `<span className="inline-flex" title=...>` |
| Bypass ref stays true | Component unmounts on navigation; ref is garbage-collected |
| i18n key collision | `timerAlreadyRunningHint` is distinct from existing `timerAlreadyRunning` |
