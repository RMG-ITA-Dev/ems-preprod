

# Bug 0213-24: "Copy Previous Week" Error + `[object Object]` — Final Plan (v7)

## Problem

Clicking "Copiar Semana Anterior" shows error toast: `Error copying previous week [object Object]`. The feature fails regardless of source week status.

## Root Cause

1. **Missing unique constraint**: The `.upsert()` on line 295 uses `onConflict: "staff_id,engagement_id,activity_id,date_worked"` but no matching unique index exists on `time_entries`. PostgreSQL rejects the operation.
2. **Error display bug**: Supabase errors are plain objects (not `Error` instances). The error handler on line 142 of `error-handler.ts` calls `String(error)` producing `[object Object]`.
3. **Governance gap**: No mutation-level guard prevents copying into a submitted/locked destination week.
4. **Additional bugs in current code**: Copies hours (should be structure only), copies stale descriptions, falls back to day 0 on unmappable offsets (silent corruption), uses `select("*")` (wasteful).

## Solution Strategy

- **Deduplicated insert only** -- zero `.upsert()` calls in this mutation
- **Unique index as permanent safety net** -- not used for conflict resolution in this flow
- **Typed error class extending `Error`** -- proper stack traces + branded code checking
- **Unified destination guard helper** -- single function, no duplicated lock logic
- **Resolved `period_id`** -- prevents orphaned time entries when `periodId` is null

## Canonical Week Start Verification

Verified that `currentWeekStart` is always a canonical Monday:
- Initial state (`TimeSheet.tsx` line 60): `getWeekMonday(new Date())`
- Prev/Next navigation: `getPreviousWeek()` / `getNextWeek()` adds/subtracts exactly 7 days from a Monday
- Calendar picker (`WeekNavigator.tsx` line 59): `getWeekMonday(date)` before calling `onWeekSelect`

The `.eq("week_start_date", ...)` lookup in the destination guard will always match correctly.

---

## All Changes (7 files)

### 1. Database Migration

Add unique index (audit confirmed 0 existing duplicates -- safe to apply):

```sql
CREATE UNIQUE INDEX idx_time_entries_unique_entry 
ON public.time_entries (staff_id, engagement_id, activity_id, date_worked, is_forecast);
```

This enables permanent duplicate prevention across all code paths.

### 2. `src/lib/error-handler.ts` -- Fix line 142

**Current (line 142):**
```typescript
const originalMessage = error instanceof Error ? error.message : String(error);
```

**Replace with:**
```typescript
const originalMessage = error instanceof Error
  ? error.message
  : (typeof error === "object" && error !== null && "message" in error)
    ? String((error as { message: unknown }).message)
    : String(error);
```

Fixes `[object Object]` across ALL mutations globally. When Supabase returns a plain object with a `.message` property, this extracts the readable message instead of stringifying the whole object.

### 3. `src/lib/timesheetErrors.ts` -- New file

Typed error utility for timesheet mutations. Uses a class extending `Error` so it works correctly with generic error handlers, stack traces, and `instanceof` checks.

```typescript
// Typed error utility for timesheet mutations.
// Extends Error so it works correctly with generic error handlers,
// stack traces, and instanceof checks.

const TIMESHEET_ERROR_BRAND = "__timesheetError__" as const;

export type TimesheetErrorCode = "WEEK_LOCKED" | "NO_ENTRIES";

const messages: Record<TimesheetErrorCode, string> = {
  WEEK_LOCKED: "This week is locked and cannot be modified",
  NO_ENTRIES: "No entries found in the previous week to copy",
};

export class TimesheetAppError extends Error {
  readonly [TIMESHEET_ERROR_BRAND] = true as const;

  constructor(public readonly code: TimesheetErrorCode, message: string) {
    super(message);
    this.name = "TimesheetAppError";
  }
}

export function createTimesheetError(
  code: TimesheetErrorCode
): TimesheetAppError {
  return new TimesheetAppError(code, messages[code]);
}

export function isTimesheetError(
  error: unknown,
  code?: TimesheetErrorCode
): error is TimesheetAppError {
  if (!(error instanceof TimesheetAppError)) return false;
  if (code !== undefined) return error.code === code;
  return true;
}
```

Why `extends Error`:
- Has a proper stack trace
- Passes `instanceof Error` checks in the global error handler
- Has `.message` extracted correctly by both the improved handler and any standard catch
- Still supports branded `isTimesheetError()` code checks

### 4. `src/hooks/useTimesheetMutations.ts` -- Three changes

**4a. Add import (after line 5):**
```typescript
import { createTimesheetError, isTimesheetError } from "@/lib/timesheetErrors";
```

**4b. Add destination guard helper (after line 229, before `useCopyPreviousWeek`):**

```typescript
// Unified destination-period resolution + lock guard
// Fail closed: abort operation if status cannot be verified
async function resolveDestinationPeriod(
  periodId: string | null,
  staffId: string,
  weekStartDate: Date
): Promise<{ resolvedPeriodId: string | null; isLocked: boolean }> {
  const query = periodId
    ? supabase
        .from("timesheet_periods")
        .select("period_id, submitted_at, is_period_locked")
        .eq("period_id", periodId)
        .maybeSingle()
    : supabase
        .from("timesheet_periods")
        .select("period_id, submitted_at, is_period_locked")
        .eq("staff_id", staffId)
        .eq("week_start_date", toISODateString(weekStartDate))
        .maybeSingle();

  const { data, error } = await query;

  // Fail closed: abort operation if status cannot be verified
  if (error) throw error;

  if (!data) {
    // No period record exists -- week is brand new, not locked
    return { resolvedPeriodId: null, isLocked: false };
  }

  return {
    resolvedPeriodId: data.period_id,
    isLocked: !!data.submitted_at || !!data.is_period_locked,
  };
}
```

**4c. Replace `useCopyPreviousWeek` (lines 231-316) with:**

```typescript
// BUG #0213-24: Copy previous week structure to current week (deduplicated insert)
export function useCopyPreviousWeek() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      staffId,
      currentWeekStart,
      periodId,
      workDays,
    }: {
      staffId: string;
      currentWeekStart: Date;
      periodId: string | null;
      workDays: number;
    }) => {
      // 1. Resolve destination period + lock guard (unified, fail-closed)
      const { resolvedPeriodId, isLocked } = await resolveDestinationPeriod(
        periodId,
        staffId,
        currentWeekStart
      );

      if (isLocked) {
        throw createTimesheetError("WEEK_LOCKED");
      }

      // 2. Fetch previous week entries (only fields needed for structure copy)
      const previousWeekStart = getPreviousWeek(currentWeekStart);
      const prevWeekDates = getWorkDays(previousWeekStart, workDays);
      const prevWeekStartStr = toISODateString(prevWeekDates[0]);
      const prevWeekEndStr = toISODateString(
        prevWeekDates[prevWeekDates.length - 1]
      );

      const { data: prevEntries, error: fetchError } = await supabase
        .from("time_entries")
        .select("engagement_id, activity_id, date_worked")
        .eq("staff_id", staffId)
        .gte("date_worked", prevWeekStartStr)
        .lte("date_worked", prevWeekEndStr)
        .eq("is_forecast", false);

      if (fetchError) throw fetchError;
      if (!prevEntries || prevEntries.length === 0) {
        throw createTimesheetError("NO_ENTRIES");
      }

      // 3. Compute current week dates
      const currentWeekDates = getWorkDays(currentWeekStart, workDays);

      // 4. Fetch existing entries for current week to deduplicate
      const currentWeekStartStr = toISODateString(currentWeekDates[0]);
      const currentWeekEndStr = toISODateString(
        currentWeekDates[currentWeekDates.length - 1]
      );

      const { data: existingEntries, error: existingError } = await supabase
        .from("time_entries")
        .select("engagement_id, activity_id, date_worked, is_forecast")
        .eq("staff_id", staffId)
        .gte("date_worked", currentWeekStartStr)
        .lte("date_worked", currentWeekEndStr)
        .eq("is_forecast", false);

      if (existingError) throw existingError;

      // 5. Build existingKeys including is_forecast (matches unique index shape)
      const existingKeys = new Set(
        (existingEntries || []).map(
          (e) =>
            `${e.engagement_id}|${e.activity_id}|${e.date_worked}|${e.is_forecast}`
        )
      );

      // 6. Map previous -> current week, skip unmappable + duplicates
      const newEntries = prevEntries
        .map((entry) => {
          const dayIndex = prevWeekDates.findIndex(
            (d) => toISODateString(d) === entry.date_worked
          );
          if (dayIndex < 0) return null;

          const newDate = currentWeekDates[dayIndex];
          if (!newDate) return null; // Defensive: out-of-bounds guard

          const newDateStr = toISODateString(newDate);

          return {
            staff_id: staffId,
            engagement_id: entry.engagement_id,
            activity_id: entry.activity_id,
            date_worked: newDateStr,
            hours_logged: 0, // Structure only, not hours
            period_id: resolvedPeriodId, // Uses resolved period_id (no orphans)
            is_forecast: false,
            description: null, // No stale descriptions
          };
        })
        .filter(
          (entry): entry is NonNullable<typeof entry> =>
            entry !== null &&
            !existingKeys.has(
              `${entry.engagement_id}|${entry.activity_id}|${entry.date_worked}|${entry.is_forecast}`
            )
        );

      // 7. If nothing to insert, return early
      if (newEntries.length === 0) {
        return { copiedCount: 0 };
      }

      // 8. Insert only new entries (NOT upsert -- dedup already done)
      const { error: insertError } = await supabase
        .from("time_entries")
        .insert(newEntries);

      if (insertError) throw insertError;

      // 9. Return accurate count
      return { copiedCount: newEntries.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      if (data.copiedCount === 0) {
        toast.info(
          i18n.t("timesheet.previousWeekAlreadyCopied")
        );
      } else {
        toast.success(
          i18n.t("timesheet.copiedFromPreviousWeek", {
            count: data.copiedCount,
          })
        );
      }
    },
    onError: (error: unknown) => {
      if (isTimesheetError(error, "NO_ENTRIES")) {
        toast.error(i18n.t("timesheet.noPreviousEntries"));
      } else if (isTimesheetError(error, "WEEK_LOCKED")) {
        toast.error(i18n.t("timesheet.cannotModifyLockedWeek"));
      } else {
        createMutationErrorHandler("copying previous week")(error as Error);
      }
    },
  });
}
```

### 5. `src/locales/en.json` -- Add 2 keys (after line 565, before the `}` closing `timesheet`)

```json
    "previousWeekAlreadyCopied": "Previous week structure already exists in current week",
    "cannotModifyLockedWeek": "This week is locked and cannot be modified"
```

### 6. `src/locales/es.json` -- Add 2 keys (after line 565, before the `}` closing `timesheet`)

```json
    "previousWeekAlreadyCopied": "La estructura de la semana anterior ya existe en la semana actual",
    "cannotModifyLockedWeek": "Esta semana está bloqueada y no puede modificarse"
```

### 7. `docs/CHANGELOG-2026-02-13.md` -- Append entry after line 210

```markdown

---

## BUG #0213-24: Copy Previous Week Error + [object Object]

**Date:** 2026-02-16
**Priority:** Media
**Version:** v2.0.4
**Route:** OPERACIONES - Hoja de Tiempo

### Problem

Clicking "Copiar Semana Anterior" showed error toast:
"Error copying previous week [object Object]"

### Root Cause

1. Upsert used a conflict target with no matching unique index in the database.
2. Supabase errors (plain objects) were stringified as [object Object] by the
   error handler.

### Solution

1. DB: Added unique index on time_entries
   (staff_id, engagement_id, activity_id, date_worked, is_forecast).
2. Mutation: Rewrote Copy Previous Week as deduplicated insert (zero upsert
   calls). Structure-only copy (hours_logged = 0). Skips unmappable day
   offsets with double guard. Selects only needed columns. Uses resolved
   period_id to prevent orphaned time entries.
3. Governance: Added fail-closed destination guard via unified helper
   resolveDestinationPeriod(). Handles both periodId and natural-key
   lookup. Returns resolved period_id for inserts.
4. Error handler: Extract .message from plain objects globally.
5. Typed errors: New src/lib/timesheetErrors.ts with TimesheetAppError
   class extending Error. Provides branded createTimesheetError() /
   isTimesheetError() with proper stack traces.
6. Dedup keys include is_forecast to match unique index shape.

### Files Modified

| File | Change |
|------|--------|
| migration | Added idx_time_entries_unique_entry |
| src/lib/timesheetErrors.ts | New typed error utility (extends Error) |
| src/hooks/useTimesheetMutations.ts | Rewrote useCopyPreviousWeek + added helper |
| src/lib/error-handler.ts | Fixed plain-object error extraction |
| src/locales/en.json | Added 2 keys |
| src/locales/es.json | Added 2 keys |
```

---

## Files Summary

| # | File | Action | Lines affected |
|---|------|--------|----------------|
| 1 | Database migration | `CREATE UNIQUE INDEX idx_time_entries_unique_entry` | N/A |
| 2 | `src/lib/error-handler.ts` | Replace line 142 | 142 |
| 3 | `src/lib/timesheetErrors.ts` | New file | N/A |
| 4 | `src/hooks/useTimesheetMutations.ts` | Add import after line 5; add helper after line 229; replace lines 231-316 | 5, 229-316 |
| 5 | `src/locales/en.json` | Add 2 keys after line 565 | 565 |
| 6 | `src/locales/es.json` | Add 2 keys after line 565 | 565 |
| 7 | `docs/CHANGELOG-2026-02-13.md` | Append after line 210 | 210 |

## Post-Change Enforcement Checks

1. Search `useCopyPreviousWeek` for `.upsert(` -- must be 0 occurrences
2. Verify `resolveDestinationPeriod` helper exists and is the sole lock-check point
3. Verify mapping includes both `dayIndex < 0` and `!newDate` guards
4. Verify error handling uses `isTimesheetError()`, not `.message === ...`
5. Verify `TimesheetAppError extends Error` (`instanceof Error === true`)

## Risk Assessment

- **Low risk** -- unique index safe (0 duplicates confirmed by audit)
- Deduplicated insert is self-contained; no impact on auto-save or other timesheet flows
- Error handler fix is defensive and improves all error displays globally
- Destination guard fails closed via unified helper; `resolvedPeriodId` prevents orphaned rows
- `TimesheetAppError extends Error`: works with `instanceof`, stack traces, and all generic handlers
- `hours_logged: 0` aligns with documented business rule (copy structure only)
- Unmappable day entries are double-guarded (`dayIndex < 0` + `!newDate`)
- `date_worked` comparison is safe: column is `date` type, PostgREST returns `YYYY-MM-DD`
- `currentWeekStart` verified as always canonical Monday (three upstream paths confirmed)

## Testing

1. Previous week has entries (APPROVED), current week OPEN -- click Copy -- rows appear with 0 hours, success toast
2. Previous week has entries (SUBMITTED), current week OPEN -- click Copy -- same success
3. Click Copy again on same week -- info toast "already exists", no error
4. Previous week has no entries -- "no entries" toast
5. Current week is SUBMITTED or LOCKED -- Copy blocked with "locked" toast, no DB writes
6. Disconnect network, trigger any mutation error -- verify readable message, not `[object Object]`
7. Refresh after copy -- verify rows persisted with 0 hours and correct `period_id`
8. Verify auto-save and Save Draft still work independently (regression)
9. Test with `periodId = null` scenario if reproducible -- verify fallback resolves `period_id` and guard works
10. Verify dedup correctly handles entries when `is_forecast` dimension is considered

