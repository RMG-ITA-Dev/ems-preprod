

# Plan_0213-30_C05_v4: Block Editing/Deletion/Insertion of Approved Timesheet Lines (UI + DB)

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-30 |
| Title | El sistema permite que las horas aprobadas puedan editarse o borrarse |
| Priority | Alta |
| Route | OPERACIONES - Hoja de Tiempo |

## Changes from v3

| Change | Detail |
|--------|--------|
| DB trigger: INSERT protection | Extended trigger to fire on BEFORE INSERT OR UPDATE OR DELETE. INSERT path checks if the target `(period_id, engagement_id)` is approved and rejects with `APPROVED_LINE_LOCKED`. This closes the gap where a direct API INSERT could add rows to an approved line, changing approved totals. |
| Performance confirmation | Verified that `timesheet_line_approvals` already has a UNIQUE index on `(period_id, engagement_id)` -- trigger lookups are negligible. |

All UI, save-guard, error-handling, i18n, and changelog content is unchanged from v3 (only updated to mention INSERT protection).

## Problem

When a user unsubmits a week to correct rejected lines, the entire grid becomes editable -- including rows whose engagement lines have already been approved. Users can edit hours and delete rows on approved engagement lines, violating data integrity. There is no database-level protection either, meaning direct API calls could also modify or insert entries into approved lines.

## Root Cause

1. **UI:** `TimesheetGrid` applies a single `isLocked` boolean uniformly to all rows. No per-row check against `lineApprovals` status exists.
2. **DB:** No trigger prevents INSERT/UPDATE/DELETE on `time_entries` rows linked to approved `timesheet_line_approvals`.

## Solution

### Fix 1 -- DB Migration: Hard guard trigger (INSERT + UPDATE + DELETE)

```sql
CREATE OR REPLACE FUNCTION public.protect_approved_time_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_period uuid;
  old_engagement uuid;
  new_period uuid;
  new_engagement uuid;
BEGIN
  -- ── DELETE ────────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    old_period := OLD.period_id;
    old_engagement := OLD.engagement_id;

    IF old_period IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.timesheet_line_approvals tla
      WHERE tla.period_id = old_period
        AND tla.engagement_id = old_engagement
        AND tla.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot delete time entries on an approved line';
    END IF;

    RETURN OLD;
  END IF;

  -- ── INSERT ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    new_period := NEW.period_id;
    new_engagement := NEW.engagement_id;

    IF new_period IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.timesheet_line_approvals tla
      WHERE tla.period_id = new_period
        AND tla.engagement_id = new_engagement
        AND tla.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot insert time entries into an approved line';
    END IF;

    RETURN NEW;
  END IF;

  -- ── UPDATE ────────────────────────────────────────────────────────
  old_period := OLD.period_id;
  old_engagement := OLD.engagement_id;
  new_period := COALESCE(NEW.period_id, OLD.period_id);
  new_engagement := COALESCE(NEW.engagement_id, OLD.engagement_id);

  -- Block if OLD pair is approved (editing an approved line)
  IF old_period IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.timesheet_line_approvals tla
    WHERE tla.period_id = old_period
      AND tla.engagement_id = old_engagement
      AND tla.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot modify time entries on an approved line';
  END IF;

  -- Block if NEW pair is approved (moving into an approved line)
  IF new_period IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.timesheet_line_approvals tla
    WHERE tla.period_id = new_period
      AND tla.engagement_id = new_engagement
      AND tla.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot move time entries into an approved line';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_approved_time_entries ON public.time_entries;

CREATE TRIGGER trg_protect_approved_time_entries
  BEFORE INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_approved_time_entries();
```

Key behaviors:
- **DELETE:** checks OLD pair only (NEW unavailable in DELETE triggers).
- **INSERT:** checks NEW pair only (OLD unavailable in INSERT triggers).
- **UPDATE:** checks both OLD pair (modifying approved line) and NEW pair (moving into approved line).
- If `period_id` is NULL, no approval can exist, so the operation proceeds.
- Performance: `timesheet_line_approvals` has a UNIQUE index on `(period_id, engagement_id)` -- lookups are negligible.

### Fix 2 -- TimesheetGrid: Per-row locking based on approval status

In `src/components/timesheet/TimesheetGrid.tsx`, for each row in the render loop:

1. **Compute `isRowLocked`** at the start of each row render:
   ```typescript
   const rowApproval = getApprovalStatus(row.engagementId);
   const isRowApproved = rowApproval?.status === "approved";
   const isRowLocked = isLocked || isRowApproved;
   ```

2. **Engagement Select**: `disabled={isLocked}` becomes `disabled={isRowLocked}`

3. **Activity Select**: `disabled={isLocked || ...}` becomes `disabled={isRowLocked || ...}`

4. **Hour cells**: `isDisabled` uses `isRowLocked` instead of `isLocked`:
   ```typescript
   const isDisabled =
     isRowLocked || isDayLockedByHire || isHolidayBlocked || isAdmMissing
     || !row.engagementId || (!row.activityId && !isActivityNotRequired);
   ```

5. **Delete button**: `!isLocked` becomes `!isRowLocked`

6. **Row styling**: Subtle tint for approved rows:
   ```typescript
   <tr className={cn(
     "border-b border-border hover:bg-muted/30",
     isRowApproved && !isLocked && "bg-success/5"
   )}>
   ```

7. **Lock icon instead of trash** for approved rows:
   ```typescript
   <td className="p-2 text-center">
     {isRowApproved && rows.length > 1 ? (
       <Tooltip>
         <TooltipTrigger asChild>
           <Lock className="h-4 w-4 text-muted-foreground mx-auto" />
         </TooltipTrigger>
         <TooltipContent>
           <p>{t("timesheet.lineApproved")}</p>
         </TooltipContent>
       </Tooltip>
     ) : rows.length > 1 && !isLocked ? (
       <Button variant="ghost" size="icon" ... />
     ) : null}
   </td>
   ```

### Fix 3 -- Client-side save guards

**Auto-save (`handleHoursChange`):** Add guard to skip approved rows:
```typescript
const currentRowForApproval = rowsRef.current.find((r) => r.id === rowId);
if (currentRowForApproval) {
  const rowApproval = lineApprovals.find(la => la.engagement_id === currentRowForApproval.engagementId);
  if (rowApproval?.status === "approved") return;
}
```

Add `lineApprovals` to the `useCallback` dependency array.

**Batch "Save Now":** Add guard inside the loop:
```typescript
const rowApproval = lineApprovals.find(la => la.engagement_id === row.engagementId);
if (rowApproval?.status === "approved") return;
```

### Fix 4 -- Error handling for DB trigger

In `src/hooks/useTimesheetMutations.ts`, update `useUpsertTimeEntry`'s `onError`:

```typescript
onError: (error: Error) => {
  const errorMsg = error.message || '';
  const errorDetails = (error as any).details || '';
  if (errorMsg.includes("APPROVED_LINE_LOCKED") || errorDetails.includes("APPROVED_LINE_LOCKED")) {
    toast.error(i18n.t("timesheet.approvedLineCannotEdit"));
    return;
  }
  createMutationErrorHandler("saving time entry")(error);
},
```

### Fix 5 -- i18n keys

**`src/locales/en.json`** (in the `timesheet` section):
```json
"lineApproved": "This line is approved and cannot be modified.",
"approvedLineCannotEdit": "Cannot modify hours on an approved line. Only rejected lines can be edited."
```

**`src/locales/es.json`** (in the `timesheet` section):
```json
"lineApproved": "Esta línea fue aprobada y no puede modificarse.",
"approvedLineCannotEdit": "No se pueden modificar horas de una línea aprobada. Solo las líneas rechazadas pueden editarse."
```

### Fix 6 -- Documentation

Append entry to `docs/CHANGELOG-2026-02-17.md`:

```text
---

## BUG #0213-30: Block Editing/Deletion/Insertion of Approved Timesheet Lines

**Date:** 2026-02-18
**Priority:** Alta
**Version:** v2.0.9
**Route:** OPERACIONES -> Hoja de Tiempo

### Problem

When a user unsubmitted a week to correct rejected lines, all rows became editable -- including rows with approved engagement lines. Users could edit hours, change engagement/activity selections, and delete rows on already-approved lines. No database-level protection existed either, meaning direct API calls could also insert, modify, or delete entries on approved lines.

### Root Cause

1. `TimesheetGrid` applied a single `isLocked` boolean uniformly. No per-row check against `lineApprovals` existed.
2. No database trigger prevented INSERT/UPDATE/DELETE on `time_entries` linked to approved line approvals.

### Solution

1. **DB Trigger (hard guard):** Created `protect_approved_time_entries()` trigger on `time_entries`. Fires BEFORE INSERT OR UPDATE OR DELETE. DELETE checks OLD pair only. INSERT checks NEW pair only. UPDATE checks both OLD pair (editing approved line) and NEW pair (moving into approved line). Raises `APPROVED_LINE_LOCKED` exception. Performance verified: `timesheet_line_approvals` has UNIQUE index on `(period_id, engagement_id)`.
2. **Per-row UI locking:** Each row computes `isRowApproved` from `lineApprovals`. Approved rows have disabled selectors, disabled hour inputs, lock icon with tooltip, and subtle green tint.
3. **Client-side save guards:** `handleHoursChange` and batch "Save Now" skip approved rows.
4. **Error handling:** `useUpsertTimeEntry` catches `APPROVED_LINE_LOCKED` (message + details fallback) and shows localized toast.

### Files Modified

| File | Change |
|------|--------|
| Migration SQL | `protect_approved_time_entries()` function + trigger (INSERT + UPDATE + DELETE, explicit TG_OP branching, OLD+NEW pair checks) |
| `src/components/timesheet/TimesheetGrid.tsx` | Per-row `isRowLocked`, disabled controls, lock icon, row tint, save guards |
| `src/hooks/useTimesheetMutations.ts` | `APPROVED_LINE_LOCKED` error handling with details fallback |
| `src/locales/en.json` | Added `timesheet.lineApproved`, `timesheet.approvedLineCannotEdit` |
| `src/locales/es.json` | Added `timesheet.lineApproved`, `timesheet.approvedLineCannotEdit` |
| `docs/CHANGELOG-2026-02-17.md` | This entry |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Trigger blocks legitimate admin corrections | Admins can update line approval status to "pending" before correcting |
| Stale lineApprovals in UI | Query invalidated on submit/unsubmit |
| Performance of trigger | UNIQUE index on (period_id, engagement_id); negligible cost |
| period_id NULL entries | NULL check skips trigger; no approval can exist for NULL period |
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| DB Migration | CREATE | Trigger function + trigger on `time_entries` (INSERT + UPDATE + DELETE, explicit TG_OP branching, dual-pair UPDATE check) |
| `src/components/timesheet/TimesheetGrid.tsx` | MODIFY | Per-row locking, lock icon, row tint, save guards |
| `src/hooks/useTimesheetMutations.ts` | MODIFY | `APPROVED_LINE_LOCKED` error handling with details fallback |
| `src/locales/en.json` | MODIFY | Add 2 i18n keys |
| `src/locales/es.json` | MODIFY | Add 2 i18n keys |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append changelog entry |

## Acceptance Criteria

1. Approved rows are not editable, not deletable, and no new entries can be inserted into them -- even after unsubmit.
2. Attempting to INSERT, UPDATE, or DELETE a `time_entries` row linked to an approved `(period_id, engagement_id)` is rejected by the database with `APPROVED_LINE_LOCKED`.
3. Attempting to UPDATE a `time_entries` row to move it INTO an approved `(period_id, engagement_id)` is also rejected.
4. Rejected rows remain editable; pending/new rows remain editable after unsubmit.
5. UI clearly communicates locked approved rows (badge + lock icon + tooltip + subtle tint).
6. Changelog updated to reflect UI + DB protection including INSERT guard.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Trigger blocks legitimate admin corrections | Admins can update line approval status before correcting |
| INSERT guard blocks "Copy Previous Week" on approved lines | `useCopyPreviousWeek` inserts with `hours_logged: 0`; if the line is approved, the trigger correctly blocks it -- approved lines should not receive new structure entries |
| Stale lineApprovals in UI | Invalidated on submit/unsubmit |
| Performance of trigger | UNIQUE index on `(period_id, engagement_id)` confirmed; negligible |
| `period_id` NULL entries | NULL check skips trigger safely |
| Approved status changes after unsubmit | `useUnsubmitTimesheet` only deletes "pending" approvals; approved ones persist |
| Supabase error format variation | Error handler checks both `message` and `details` for `APPROVED_LINE_LOCKED` |

