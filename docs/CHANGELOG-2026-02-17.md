# Changelog — 2026-02-17

## Stopwatch Persistence, Single Running Timer, 8h Hard Cap (Plan v4)

### Rules Enforced
1. **Persistence**: Running timer survives refresh, tab close, logout/login (DB row is source of truth)
2. **Single timer**: Only one running timer per user (DB partial unique index)
3. **8h hard cap**: Timer cannot exceed 8 hours — auto-clamped server-side and client-side
4. **Rounding**: Duration rounded to nearest 5 minutes (min 5, max 480) on every stop/finalize path

### Database Changes
- Pre-cleanup of orphaned timers (>8h with no end time)
- `idx_one_running_timer_per_staff` — partial unique index preventing multiple concurrent timers
- `trg_validate_timer_duration` — trigger enforcing 8h/480min hard cap on persisted entries
- `start_timer_entry(engagement_id, activity_id, description)` — secure RPC, derives staff from auth.uid()
- `stop_timer_entry(timer_id)` — secure RPC with clamp + round (nearest 5 min, min 5, max 480)
- `finalize_my_stale_timers()` — user-scoped cleanup of own timers >8h
- `finalize_all_stale_timers()` — service-role only, for scheduled global cleanup
- Guarded pg_cron schedule (every 15 min) for global finalization

### Frontend Changes
- **useTimeTracker**: Stripped to thin form-state holder (removed localStorage, timer logic)
- **useTimerEntries**: Added `useRunningTimerEntry`, `useStartTimerRPC`, `useStopTimerRPC`, `useFinalizeMyStaleTimers`
- **TrackerRecord**: Complete rewrite — DB source of truth, reattach on mount, finalize-on-enter, 8h clamp with anti-double-fire guard
- **TrackerBar**: Removed pause concept (Start/Stop only), accepts `elapsedSeconds` instead of `formattedTime`
- **useInactivityTimeout**: Calls `finalize_my_stale_timers` before logout (no-op if timer <8h)
- **TrackerList**: Running entries navigate to `/tracker/new` for reattach instead of edit page
- **Locales**: Added 4 timer recovery/auto-stop keys (en + es)

### Security
- All RPCs derive staff identity from `auth.uid()` — no client-supplied staff_id
- `finalize_all_stale_timers` restricted to service_role via REVOKE/GRANT
