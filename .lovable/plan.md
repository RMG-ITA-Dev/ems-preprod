

# Bug #15: Prevent Multiple Simultaneous Running Timer Entries

## Problem

Users can start a new timer without the previous one being stopped, creating orphaned running entries (`ended_at IS NULL`) in the database. This happens when localStorage state is cleared (e.g., navigating to `/tracker/new`) while a DB entry remains open.

## Fix: Two layers

### 1. Auto-stop orphaned entries before starting a new timer (`TrackerRecord.tsx`)

In `handleStart`, before creating a new entry, query for any existing running entries (`ended_at IS NULL`) for this staff member and stop them with `ended_at = now` and calculated `duration_minutes` (rounded to nearest 5 minutes, matching existing `roundToNearest5` logic).

### 2. Database constraint (new migration)

Add a partial unique index to enforce at most one running entry per staff member at the DB level:

```sql
CREATE UNIQUE INDEX idx_timer_entries_one_running_per_staff
  ON public.timer_entries (staff_id)
  WHERE ended_at IS NULL;
```

This is defense-in-depth -- if the frontend logic fails, the DB rejects the duplicate.

## Files Modified

| File | Change |
|------|--------|
| `src/pages/TrackerRecord.tsx` | In `handleStart`: query and auto-stop running entries before creating new one |
| New migration | Partial unique index on `timer_entries(staff_id) WHERE ended_at IS NULL` |

## Not adding `useRunningTimerEntries` hook

The bug report suggests a dedicated hook, but a simple inline query in `handleStart` is sufficient and avoids unnecessary complexity -- it only needs to run once at start time, not as a reactive query.

