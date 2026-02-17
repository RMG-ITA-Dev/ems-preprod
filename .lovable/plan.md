# Plan: Stopwatch Persistence, Single Running Timer, 8h Hard Cap (v4 -- Final)

## Overview

Transition the stopwatch from localStorage to a **database-first** architecture. The DB row (`timer_entries` with `ended_at IS NULL`) is the single source of truth. The UI derives elapsed time from `now() - started_at`. Four rules enforced with defense-in-depth.

## Rules

1. A running timer **persists** across refresh, tab close, and logout/login
2. Only **one running timer** per user, ever (DB-enforced)
3. A timer **cannot exceed 8 hours** -- auto-clamped even if the user disappears
4. Duration is **rounded to nearest 5 minutes** (min 5, max 480) on every stop/finalize path

Note on Rule 4: All finalize functions always finalize at exactly 8h (480 minutes), which inherently satisfies Rule 4 since 480 is already a multiple of 5.

## Non-blocking notes (recommended, not required)

1. **Index name / migrations idempotency**

- If this migration can run in environments where the index might already exist, consider `CREATE UNIQUE INDEX IF NOT EXISTS ...` (or guard with a DO block). Not required, but avoids failed deploys on replays.

2. **Rounding behavior consistency with existing system**

- PLAN_V4 enforces rounding in the RPC (good for Rule 4). Just ensure the UI never separately rounds, so you don’t get mismatches between displayed minutes vs saved minutes.

---

## Database Migration

File: `supabase/migrations/..._stopwatch_rules.sql`

### A) Pre-cleanup: Finalize existing orphaned timers

```sql
UPDATE timer_entries
SET ended_at = started_at + interval '8 hours',
    duration_minutes = 480
WHERE ended_at IS NULL
  AND started_at < now() - interval '8 hours';
```

### B) Partial unique index -- one running timer per user

```sql
CREATE UNIQUE INDEX idx_one_running_timer_per_staff
ON timer_entries (staff_id)
WHERE ended_at IS NULL;
```

### C) Validation trigger -- 8h cap on persisted entries

```sql
CREATE OR REPLACE FUNCTION validate_timer_entry_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL THEN
    IF NEW.ended_at > NEW.started_at + interval '8 hours' THEN
      RAISE EXCEPTION 'Timer entry cannot exceed 8 hours';
    END IF;
  END IF;
  IF NEW.duration_minutes IS NOT NULL AND NEW.duration_minutes > 480 THEN
    RAISE EXCEPTION 'Duration cannot exceed 480 minutes (8 hours)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_timer_duration
BEFORE INSERT OR UPDATE ON timer_entries
FOR EACH ROW
EXECUTE FUNCTION validate_timer_entry_duration();
```

### D) RPC: `start_timer_entry` (secure -- derives staff from auth.uid())

```sql
CREATE OR REPLACE FUNCTION start_timer_entry(
  p_engagement_id uuid,
  p_activity_id uuid,
  p_description text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_staff_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  SELECT staff_id INTO v_staff_id
  FROM staff WHERE auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'No staff record linked to current user';
  END IF;

  SELECT timer_id INTO v_existing_id
  FROM timer_entries
  WHERE staff_id = v_staff_id AND ended_at IS NULL;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'RUNNING_TIMER_EXISTS:%', v_existing_id;
  END IF;

  INSERT INTO timer_entries (staff_id, engagement_id, activity_id, description, started_at)
  VALUES (v_staff_id, p_engagement_id, p_activity_id, p_description, now())
  RETURNING timer_id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
```

### E) RPC: `stop_timer_entry` (secure + clamp + round per Rule 4)

```sql
CREATE OR REPLACE FUNCTION stop_timer_entry(
  p_timer_id uuid,
  p_ended_at timestamptz DEFAULT now()
) RETURNS TABLE(timer_id uuid, duration_minutes integer) AS $$
DECLARE
  v_staff_id uuid;
  v_started_at timestamptz;
  v_clamped_end timestamptz;
  v_raw_minutes numeric;
  v_duration integer;
BEGIN
  SELECT s.staff_id INTO v_staff_id
  FROM staff s WHERE s.auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'No staff record linked to current user';
  END IF;

  SELECT te.started_at INTO v_started_at
  FROM timer_entries te
  WHERE te.timer_id = p_timer_id
    AND te.staff_id = v_staff_id
    AND te.ended_at IS NULL;

  IF v_started_at IS NULL THEN
    RAISE EXCEPTION 'Timer not found, not yours, or already stopped';
  END IF;

  v_clamped_end := LEAST(p_ended_at, v_started_at + interval '8 hours');
  v_raw_minutes := EXTRACT(EPOCH FROM (v_clamped_end - v_started_at)) / 60;
  v_duration := LEAST(480, GREATEST(5, ROUND(v_raw_minutes / 5.0) * 5));

  UPDATE timer_entries te
  SET ended_at = v_clamped_end,
      duration_minutes = v_duration
  WHERE te.timer_id = p_timer_id;

  RETURN QUERY SELECT p_timer_id, v_duration;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
```

### F) RPC: `finalize_my_stale_timers` (user-scoped, no args)

Callable by any authenticated user. Only affects their own timers >8h.

```sql
CREATE OR REPLACE FUNCTION finalize_my_stale_timers()
RETURNS integer AS $$
DECLARE
  v_staff_id uuid;
  v_count integer;
BEGIN
  SELECT staff_id INTO v_staff_id
  FROM staff WHERE auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN RETURN 0; END IF;

  -- Always finalizes at 480 minutes, satisfying Rule 4
  UPDATE timer_entries
  SET ended_at = started_at + interval '8 hours',
      duration_minutes = 480
  WHERE ended_at IS NULL
    AND staff_id = v_staff_id
    AND started_at < now() - interval '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
```

### G) RPC: `finalize_all_stale_timers` (service-role only) + GRANT/REVOKE

```sql
CREATE OR REPLACE FUNCTION finalize_all_stale_timers()
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  -- Always finalizes at 480 minutes, satisfying Rule 4
  UPDATE timer_entries
  SET ended_at = started_at + interval '8 hours',
      duration_minutes = 480
  WHERE ended_at IS NULL
    AND started_at < now() - interval '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Lock down: only service_role can call this
REVOKE EXECUTE ON FUNCTION finalize_all_stale_timers() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION finalize_all_stale_timers() FROM authenticated;
REVOKE EXECUTE ON FUNCTION finalize_all_stale_timers() FROM anon;
GRANT EXECUTE ON FUNCTION finalize_all_stale_timers() TO service_role;
```

### H) Scheduled job (guarded -- safe if pg_cron unavailable)

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'finalize-stale-timers',
      '*/15 * * * *',
      $$SELECT finalize_all_stale_timers()$$
    );
  END IF;
END $$;
```

---

## Frontend Changes

### 1. MODIFY: `src/hooks/useTimerEntries.ts`

Add four new hooks (keep all existing hooks):

- `**useRunningTimerEntry()**` -- query returning the single running entry (or null) for current staff. Includes engagement/activity joins. Query key: `['running_timer', staffId]`.
- `**useStartTimerRPC()**` -- mutation calling `start_timer_entry` RPC with `engagement_id`, `activity_id`, `description`. On error containing `RUNNING_TIMER_EXISTS:`, extract existing timer_id and return it for reattach. Invalidates `running_timer` and `timer_entries`.
- `**useStopTimerRPC()**` -- mutation calling `stop_timer_entry` RPC. Invalidates both query keys.
- `**useFinalizeMyStaleTimers()**` -- imperative function calling `finalize_my_stale_timers` RPC. Returns count of finalized entries.

### 2. MODIFY: `src/hooks/useTimeTracker.ts`

Strip down to thin form-field state holder:

- **Remove**: all localStorage persistence, `isRunning`, `elapsedSeconds`, `formattedTime`, `start`, `stop`, `reset`, `fullReset`, `runningEntryId`
- **Keep**: `engagementId`, `activityId`, `description` with setters
- **Keep**: `formatTime` utility (pure function)

### 3. MODIFY: `src/pages/TrackerRecord.tsx`

Complete rewrite of timer lifecycle:

**On mount:**

1. Call `finalize_my_stale_timers()` to clean up any >8h entries
2. Fetch running timer via `useRunningTimerEntry()`
3. If running entry exists: populate engagement/activity from DB row, show live elapsed
4. If no running entry: show "ready to start" state

**Live elapsed display:**

- Derived from `Date.now() - new Date(runningEntry.started_at).getTime()` on 1-second interval
- Clamped to max 28800 seconds for display
- **Anti-double-fire guard (CODEX #2):** Use a `hasAutoStoppedRef = useRef(false)`. When `elapsedSeconds > 28800`:
  - Check `hasAutoStoppedRef.current` -- if true, skip
  - Set `hasAutoStoppedRef.current = true`
  - Clear the interval immediately
  - Call `stop_timer_entry` RPC
  - Show toast
- Reset `hasAutoStoppedRef.current = false` when a new timer starts

**Start:** Calls `useStartTimerRPC()`. On `RUNNING_TIMER_EXISTS` error, shows toast and refetches to reattach.

**Stop (Save):** Calls `stop_timer_entry` RPC. Navigate to `/tracker`.

**Cancel (Discard):** Explicit user action only. Deletes DB entry. Navigate to `/tracker`. Never triggers on navigation or logout (Rule 1, CODEX #6).

**Pause removal:** No pause concept. Timer is either running or stopped.

### 4. MODIFY: `src/components/tracker/TrackerBar.tsx`

- Replace `formattedTime: string` prop with `elapsedSeconds: number` -- formats internally with 8h clamp
- Remove `isPaused: boolean` prop and `onPause` handler
- Remove Pause button entirely
- Timer display: running = green, stopped = gray (no yellow/paused state)
- `canStart` logic unchanged (engagement approved + activity selected + remaining hours)

### 5. MODIFY: `src/hooks/useInactivityTimeout.ts`

In `doLogout`, before `signOut()`:

- Call `finalize_my_stale_timers()` RPC via direct supabase import
- This is a **no-op** unless the timer has been running >8h
- Timers under 8h continue running in DB and reattach on next login (Rule 1)

### 6. MODIFY: `src/pages/TrackerList.tsx`

When clicking a running entry (`ended_at IS NULL`), navigate to `/tracker/new` instead of `/tracker/${entry.timer_id}`:

- Line 418 (mobile cards): `onClick={() => entry.ended_at ? navigate(\`/tracker/${entry.timer_id}) : navigate("/tracker/new")}`
- Line 652 (desktop table): same pattern

### 7. MODIFY: `src/locales/en.json`

Add keys in tracker section:

```text
"timerAutoStopped": "Timer auto-stopped at 8 hours maximum."
"timerAlreadyRunning": "You already have a running timer. Resuming it."
"timerRecovered": "A previous timer was recovered."
"timerFinalized": "An expired timer was automatically closed at 8 hours."
```

### 8. MODIFY: `src/locales/es.json`

```text
"timerAutoStopped": "El cronometro se detuvo automaticamente al maximo de 8 horas."
"timerAlreadyRunning": "Ya tiene un cronometro en curso. Retomandolo."
"timerRecovered": "Se recupero un cronometro anterior."
"timerFinalized": "Un cronometro expirado fue cerrado automaticamente a 8 horas."
```

### 9. CREATE: `docs/CHANGELOG-2026-02-17.md`

Document all changes.

---

## File Summary


| File                                          | Action | Description                                                                                   |
| --------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `supabase/migrations/..._stopwatch_rules.sql` | CREATE | Cleanup, unique index, trigger, 4 RPCs, REVOKE/GRANT, guarded cron                            |
| `src/hooks/useTimerEntries.ts`                | MODIFY | Add `useRunningTimerEntry`, `useStartTimerRPC`, `useStopTimerRPC`, `useFinalizeMyStaleTimers` |
| `src/hooks/useTimeTracker.ts`                 | MODIFY | Strip to form-field state only (remove localStorage, timer logic)                             |
| `src/pages/TrackerRecord.tsx`                 | MODIFY | DB source of truth, reattach, finalize-on-enter, 8h clamp with anti-double-fire ref           |
| `src/components/tracker/TrackerBar.tsx`       | MODIFY | Remove pause, accept `elapsedSeconds`, format with 8h clamp                                   |
| `src/hooks/useInactivityTimeout.ts`           | MODIFY | Call `finalize_my_stale_timers` before logout (no-op if under 8h)                             |
| `src/pages/TrackerList.tsx`                   | MODIFY | Route running entries to `/tracker/new`                                                       |
| `src/locales/en.json`                         | MODIFY | Add 4 timer keys                                                                              |
| `src/locales/es.json`                         | MODIFY | Add 4 timer keys                                                                              |
| `docs/CHANGELOG-2026-02-17.md`                | CREATE | Document changes                                                                              |


---

## Security Model

- `start_timer_entry`, `stop_timer_entry`, `finalize_my_stale_timers`: Derive `staff_id` from `auth.uid()` internally. No `p_staff_id` exposed.
- `finalize_all_stale_timers`: **REVOKE from PUBLIC/authenticated/anon**, GRANT only to `service_role`. Not callable from client code.
- All RPCs: `SECURITY DEFINER SET search_path TO 'public'`.

## Boundary Semantics

- Timer at exactly 8:00:00 is still allowed (displays 08:00:00)
- UI auto-stop triggers only when `elapsedSeconds > 28800` (strictly greater)
- SQL uses `started_at < now() - interval '8 hours'` (strictly greater than 8h elapsed)

## Cancel Behavior (CODEX #6)

Cancel = explicit user action only. Deletes the running DB entry.

- Navigating away does NOT cancel or stop
- Logout does NOT cancel (only finalizes if >8h)
- On return, the timer reattaches with correct elapsed time

## Acceptance Tests

1. **Persistence (refresh)**: Start timer, refresh -- continues with correct elapsed
2. **Persistence (tab close)**: Start timer, close tab, reopen -- running, elapsed matches
3. **Persistence (logout/login)**: Start, logout, login, enter Tracker -- reattaches correctly
4. **Single timer (DB)**: Start in Tab A, try in Tab B -- Tab B gets toast and reattaches
5. **8h auto-stop (stale)**: `started_at` 9h ago, enter Tracker -- finalized to 8h/480min
6. **8h auto-stop (live)**: Watch timer cross 8h -- auto-stops at 08:00:00 exactly, fires only once
7. **Rounding short**: Stop at 1-2 min -- `duration_minutes = 5`
8. **Rounding near cap**: Stop at 7h59m (479 raw) -- rounds to 480
9. **Rounding exact cap**: Auto-stop at 8h -- `duration_minutes = 480`
10. **Cancel discards**: Start, cancel -- DB entry deleted
11. **No implicit cancel**: Navigate away -- timer keeps running; returning reattaches
12. **Logout under 8h**: Inactivity logout -- timer continues running; on return reattaches
13. **Scheduler (if enabled)**: Never return -- after 8h+15min max, finalized to 480
14. **Running row in list**: Click "En curso" -- goes to `/tracker/new`, reattaches
15. **Anti-double-fire**: Auto-stop at 8h boundary fires stop RPC exactly once