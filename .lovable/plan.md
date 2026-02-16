

# Bug 0213-23: Timesheet "Save Draft" Stuck in Loading Loop — Final Implementation Plan

## Problem

When clicking "Guardar Borrador" (Save Draft), the timesheet data saves to the database, but the UI spinner ("Guardando...") persists indefinitely. The user gets no confirmation that the save succeeded.

## Root Cause

The `saveNowTrigger` effect (TimesheetGrid.tsx, lines 151-211) calls `upsertEntry.mutate()` in a tight synchronous loop -- once per cell with hours > 0. TanStack Query's `useMutation` discards the per-call `onSuccess`/`onError` callbacks for all but the **last** `.mutate()` invocation. So if 10 cells are saved, only the 10th cell's callback fires. The other 9 `cellKey`s remain in `savingCells` forever, keeping the status stuck on "saving".

The auto-save (debounce) flow does NOT have this bug because it fires one `.mutate()` at a time via individual debounce timers.

## Solution

Replace the `.mutate()` loop with `.mutateAsync()` + `Promise.allSettled()`, plus six hardening improvements:

1. **Async batch pattern** -- guarantees every cell's completion is tracked via real Promises
2. **Concurrency limiter** -- processes 10 mutations at a time to avoid server spikes
3. **Zero-hours deletion** -- includes cells cleared to 0 that have existing entries (only explicit `hours === 0`, not `undefined`)
4. **Unmount guard** -- prevents React state-update warnings if user navigates away mid-batch
5. **Double-click guard** -- prevents overlapping batches via `isBatchSavingRef`
6. **Fail-safe state clearing** -- `finally` block always clears `savingCells` and resets the batch flag, even on unexpected errors
7. **Failure logging** -- logs rejected reasons via `logger.error` for debugging

No redundant query invalidation is added -- the hook-level `onSuccess` in `useUpsertTimeEntry` already handles `invalidateQueries`.

The "Guardar Borrador" button in `TimeSheet.tsx` already has `disabled={saveStatus === "saving"}`, so the consumed-click scenario is already covered at the UI level.

## All Changes

### 1. `src/components/timesheet/TimesheetGrid.tsx`

**a) Add import** (line 23 area, after `import { toast } from "sonner"`):

```typescript
import { logger } from "@/lib/logger";
```

**b) Add refs** (after line 85, near `rowsRef`):

```typescript
const isMountedRef = useRef(true);
const isBatchSavingRef = useRef(false);
```

**c) Add mount/unmount effect** (after line 138 cleanup effect):

```typescript
useEffect(() => {
  isMountedRef.current = true;
  return () => { isMountedRef.current = false; };
}, []);
```

**d) Replace lines 151-211** (the entire `saveNowTrigger` effect) with:

```typescript
// BUG #0213-23: Handle "Save Now" trigger from parent
const BATCH_SIZE = 10;
const prevSaveNowTrigger = useRef(0);
useEffect(() => {
  if (saveNowTrigger && saveNowTrigger > prevSaveNowTrigger.current) {
    prevSaveNowTrigger.current = saveNowTrigger;

    // Double-click guard: ignore if a batch is already in progress
    if (isBatchSavingRef.current) return;

    // Clear all pending debounce timers and save immediately
    Object.entries(debounceTimers.current).forEach(([key, timer]) => {
      clearTimeout(timer);
      delete debounceTimers.current[key];
    });

    // 1. Collect all cells that need saving or deleting
    const cellsToSave: {
      cellKey: string;
      params: Parameters<typeof upsertEntry.mutateAsync>[0];
    }[] = [];

    rowsRef.current.forEach((row) => {
      if (!row.engagementId || !row.activityId) return;
      weekDates.forEach((date) => {
        const dateStr = toISODateString(date);
        const hours = row.hours[dateStr];
        const existingEntryId = row.entryIds[dateStr] || null;
        const hasHours = hours !== undefined && hours > 0;
        // Only treat explicit zero as deletion (not undefined)
        const needsDeletion = hours === 0 && !!existingEntryId;

        if (hasHours || needsDeletion) {
          cellsToSave.push({
            cellKey: `${row.id}-${dateStr}`,
            params: {
              staffId,
              engagementId: row.engagementId,
              activityId: row.activityId,
              dateWorked: date,
              hours: hasHours ? hours : 0,
              periodId,
              existingEntryId,
            },
          });
        }
      });
    });

    if (cellsToSave.length === 0) return;

    // 2. Mark all cells as saving and lock the batch
    isBatchSavingRef.current = true;
    const allCellKeys = new Set(cellsToSave.map((c) => c.cellKey));
    setSavingCells((prev) => new Set([...prev, ...allCellKeys]));

    // 3. Execute batch with concurrency limit
    const executeBatch = async () => {
      try {
        const allResults: PromiseSettledResult<unknown>[] = [];

        for (let i = 0; i < cellsToSave.length; i += BATCH_SIZE) {
          const chunk = cellsToSave.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            chunk.map((cell) => upsertEntry.mutateAsync(cell.params))
          );
          allResults.push(...results);
        }

        // Guard against unmount
        if (!isMountedRef.current) return;

        // Clear all saving indicators atomically
        setSavingCells((prev) => {
          const next = new Set(prev);
          allCellKeys.forEach((key) => next.delete(key));
          return next;
        });

        // Handle results
        const failCount = allResults.filter(
          (r) => r.status === "rejected"
        ).length;

        if (failCount > 0) {
          const errors = allResults
            .filter((r) => r.status === "rejected")
            .map((r) => (r as PromiseRejectedResult).reason);
          logger.error("Batch save partial failure", {
            failCount,
            total: allResults.length,
            errors,
          });
          toast.error(
            t("timesheet.saveDraftPartialError", { count: failCount })
          );
        } else {
          toast.success(t("timesheet.saveDraftSuccess"));
          // Mark successful cells with green checkmark
          const savedKeySet = new Set(cellsToSave.map((c) => c.cellKey));
          setSavedCells((prev) => new Set([...prev, ...savedKeySet]));
          setTimeout(() => {
            if (!isMountedRef.current) return;
            setSavedCells((prev) => {
              const next = new Set(prev);
              savedKeySet.forEach((key) => next.delete(key));
              return next;
            });
          }, 2000);
        }
      } finally {
        // Fail-safe: always clear savingCells and unlock batch flag
        if (isMountedRef.current) {
          setSavingCells((prev) => {
            const next = new Set(prev);
            allCellKeys.forEach((k) => next.delete(k));
            return next;
          });
        }
        isBatchSavingRef.current = false;
      }
    };

    executeBatch();
  }
}, [saveNowTrigger, weekDates, staffId, periodId, upsertEntry, t]);
```

Key design decisions:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `mutateAsync()` + `Promise.allSettled()` | Core fix | Guarantees every cell's completion is observed via real Promises |
| `BATCH_SIZE = 10` | Concurrency limit | Prevents server spikes for large grids; adjustable constant |
| `needsDeletion = hours === 0` only | Safer deletion | Excludes `undefined` to prevent accidental deletions from re-render/initialization quirks |
| `try/finally` around executeBatch | Robustness | Guarantees `isBatchSavingRef` resets AND `savingCells` clears even on unexpected runtime errors |
| `isBatchSavingRef` | Double-click guard | Prevents overlapping batches (button also disabled via `saveStatus === "saving"`) |
| `isMountedRef` | Unmount guard | Prevents React state-update warnings on navigation mid-batch |
| `logger.error` on failure | Debugging | Logs rejected reasons with total/fail counts for support |
| No `useQueryClient` import | Cleanliness | Hook-level `onSuccess` in `useUpsertTimeEntry` already invalidates `["time-entries"]`; no redundant call needed |
| `savedKeySet` as `Set` | Correctness | Prevents duplicate keys in the saved cells indicator |
| `finally` clears `savingCells` | Fail-safe | Even if something throws before the normal clear, the spinner never stays stuck |

### 2. `src/locales/en.json` -- add 2 keys

Insert after line 563 (`"rowMerged"` line), before the closing `}` of the `timesheet` namespace. Ensure a comma is added after the `"rowMerged"` value:

```json
"saveDraftSuccess": "Draft saved successfully",
"saveDraftPartialError": "Failed to save {{count}} entries. Please try again."
```

### 3. `src/locales/es.json` -- add 2 keys

Insert after line 563 (`"rowMerged"` line), before the closing `}` of the `timesheet` namespace. Ensure a comma is added after the `"rowMerged"` value:

```json
"saveDraftSuccess": "Borrador guardado exitosamente",
"saveDraftPartialError": "Error al guardar {{count}} registros. Intente nuevamente."
```

### 4. `docs/CHANGELOG-2026-02-13.md` -- append entry after line 168

```markdown
---

## BUG #0213-23: Timesheet "Save Draft" Stuck in Loading Loop

**Date:** 2026-02-16
**Priority:** Baja
**Version:** v2.0.4
**Route:** OPERACIONES - Hoja de Tiempo

### Problem

The "Guardar Borrador" button saved data correctly but the UI spinner
("Guardando...") persisted indefinitely. Users had no confirmation that the
save completed.

### Root Cause

TanStack Query's `useMutation` discards per-call `onSuccess`/`onError`
callbacks for all but the last `.mutate()` invocation when called rapidly in
a loop. With N cells to save, only the Nth cell's callback fired, leaving
N-1 cell keys stuck in `savingCells`.

### Solution

Replaced the synchronous `.mutate()` loop with `mutateAsync()` +
`Promise.allSettled()` for reliable batch completion tracking. Added:
- Concurrency limiter (10 parallel mutations per chunk)
- Zero-hours deletion handling (cells cleared to 0 with existing entries)
- Unmount guard (`isMountedRef`) to prevent React state-update warnings
- Double-click guard (`isBatchSavingRef`) to prevent overlapping batches
- `try/finally` fail-safe to guarantee batch flag reset and `savingCells` clear on any error path
- Failure logging via `logger.error` for debugging
- Success/partial-error toasts for clear user feedback

### Files Modified

| File | Change |
|------|--------|
| `src/components/timesheet/TimesheetGrid.tsx` | Refactored `saveNowTrigger` effect |
| `src/locales/en.json` | Added `saveDraftSuccess`, `saveDraftPartialError` |
| `src/locales/es.json` | Added `saveDraftSuccess`, `saveDraftPartialError` |
```

## Files Summary

| File | Action |
|------|--------|
| `src/components/timesheet/TimesheetGrid.tsx` | Replace `saveNowTrigger` effect (lines 151-211); add `logger` import, `isMountedRef`, `isBatchSavingRef` refs, mount/unmount effect |
| `src/locales/en.json` | Add 2 keys after line 563 |
| `src/locales/es.json` | Add 2 keys after line 563 |
| `docs/CHANGELOG-2026-02-13.md` | Append entry after line 168 |

## Risk Assessment

- **Low risk** -- only the `saveNowTrigger` effect is replaced. Auto-save debounce flow is completely untouched.
- `Promise.allSettled` never throws, and `try/finally` guarantees the batch flag resets and savingCells clears.
- The concurrency limiter is conservative (10 parallel) and only affects batch saves.
- Zero-hours deletion uses existing mutation logic already tested in `useUpsertTimeEntry`.
- No database changes required.
- Button already disabled during saving (`disabled={saveStatus === "saving"}`), so no UI-level changes needed.

## Testing

1. Fill multiple rows/cells, click "Guardar Borrador" -- verify spinner clears and success toast appears
2. Click "Guardar Borrador" on an empty grid -- verify nothing happens (no spinner, no error)
3. Clear a previously saved cell to 0, click "Guardar Borrador" -- verify the entry is deleted from the database
4. Fill 20+ cells and save -- verify saves complete without server errors (concurrency limit working)
5. Double-click "Guardar Borrador" rapidly -- verify only one batch runs (no duplicate toasts)
6. Click save then navigate away immediately -- verify no React warnings in console
7. Verify auto-save still works independently (type hours, wait for debounce)
8. Refresh page after save -- verify data persists

