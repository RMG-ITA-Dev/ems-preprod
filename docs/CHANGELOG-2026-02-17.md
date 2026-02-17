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

---

## Focus Mode Layout + Hard Navigation Lock + Stopwatch Exception (Plan v3)

**Date:** 2026-02-17  
**Priority:** Alta  
**Version:** v2.0.5  

### Problem

Users could accidentally navigate away from ADD/EDIT screens via the sidebar, mobile bottom nav, browser back/forward, or programmatic navigation — losing unsaved work without warning. The stopwatch page needed special handling since users must be able to multitask while a timer runs.

### Solution

Implemented three complementary mechanisms:

1. **Focus Mode Layout** — ADD/EDIT pages render without sidebar and mobile nav, removing the primary accidental-exit vector.
2. **Hard Navigation Lock** — `useBlocker` from `react-router-dom` intercepts all SPA navigation (browser back/forward, programmatic `navigate()`, link clicks). A dialog forces an explicit "Stay" or "Leave anyway" choice. `beforeunload` handles tab close/refresh with a native browser warning.
3. **Stopwatch Exception** — The Stopwatch (`/tracker/new`) keeps the normal layout so users can work elsewhere while the timer runs. It features a "Run in Background" button, a leave-confirmation dialog with "Don't ask again" preference, and a global running-timer chip in the header.

### Technical Details

#### Navigation Lock Hook (`usePageLeaveLock`)
- `locked: true` blocks navigation **always** while the page is mounted (not just when dirty)
- `isDirty` is optional and only affects dialog messaging (dirty vs locked-but-clean)
- `allowNextNavigation()` uses `queueMicrotask` to reset the bypass ref after the synchronous `navigate()` call completes — prevents stale-render clearing (CODEX correction #1)
- Only blocks on `pathname` changes — query param / hash changes within the same route are allowed (CODEX correction #2)

#### Focus Mode
- `AppLayout` accepts `focusMode?: boolean` prop — when true, hides `AppSidebar`, `MobileBottomNav`, and `MobileMoreDrawer`
- `AppHeader` accepts `focusMode?: boolean` prop — when true, hides the `SidebarTrigger` button

#### Leave Page Dialog
- Two messaging variants: **dirty** ("You have unsaved changes") with destructive button styling, and **locked-but-clean** ("Use Save or Cancel to leave") with normal button styling
- "Stay" calls `blocker.reset()`, "Leave anyway" calls `blocker.proceed()`

#### Form Integration Pattern
- Forms (`ClientForm`, `StaffForm`, `EngagementForm`, `ExpenseLogForm`) expose `onDirtyChange`, `onCancel`, `onSaveSuccess` callbacks
- Parent page holds `isDirty` state and controls the lock via `usePageLeaveLock`
- Save/Cancel handlers call `allowNextNavigation()` before `navigate()`

#### Stopwatch Exception
- `RunningTimerChip` in the header shows live elapsed HH:MM:SS + engagement code when a timer is active; click navigates to `/tracker/new`
- `LeaveStopwatchDialog` with "Don't ask again" checkbox stored in `localStorage` key `ems_skipTimerLeaveConfirm`

### Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/usePageLeaveLock.ts` | CREATE | Hook: `useBlocker` + `beforeunload` + `queueMicrotask` bypass reset |
| `src/components/ui/leave-page-dialog.tsx` | CREATE | Reusable dialog: dirty vs locked-clean messaging |
| `src/components/tracker/RunningTimerChip.tsx` | CREATE | Global header chip: live elapsed + engagement code |
| `src/components/tracker/LeaveStopwatchDialog.tsx` | CREATE | Stopwatch-specific leave confirmation with "Don't ask again" |
| `src/components/layout/AppLayout.tsx` | MODIFY | Add `focusMode` prop to hide sidebar/mobile-nav |
| `src/components/layout/AppHeader.tsx` | MODIFY | Add `focusMode` prop to hide sidebar trigger; render `RunningTimerChip` |
| `src/components/forms/ClientForm.tsx` | MODIFY | Add `onDirtyChange`, `onCancel`, `onSaveSuccess` callbacks |
| `src/components/forms/StaffForm.tsx` | MODIFY | Add `onDirtyChange`, `onCancel`, `onSaveSuccess` callbacks |
| `src/components/forms/EngagementForm.tsx` | MODIFY | Add `onDirtyChange`, `onCancel`, `onSaveSuccess` callbacks |
| `src/components/forms/ExpenseLogForm.tsx` | MODIFY | Add internal dirty tracking + `onDirtyChange` callback |
| `src/pages/ClientNew.tsx` | MODIFY | Add `focusMode`, lock hook, dialog, wire callbacks |
| `src/pages/ClientEdit.tsx` | MODIFY | Same pattern |
| `src/pages/StaffNew.tsx` | MODIFY | Same pattern |
| `src/pages/StaffEdit.tsx` | MODIFY | Same pattern |
| `src/pages/EngagementNew.tsx` | MODIFY | Same pattern |
| `src/pages/EngagementEdit.tsx` | MODIFY | Same pattern |
| `src/pages/ExpenseNew.tsx` | MODIFY | Same pattern |
| `src/pages/ExpenseEdit.tsx` | MODIFY | Same pattern |
| `src/pages/WorkOrderNew.tsx` | MODIFY | Add `focusMode`, lock hook (custom dirty), dialog, wire bypass |
| `src/pages/WorkOrderEdit.tsx` | MODIFY | Add `focusMode`, lock hook (existing `isDirty`), wire bypass |
| `src/locales/en.json` | MODIFY | Add ~12 i18n keys (common.leavePageDirtyTitle/Body, tracker.timerRunningTitle/Body, etc.) |
| `src/locales/es.json` | MODIFY | Add ~12 i18n keys |

### Pages Pending (Phase 2)
- `WorksheetNew.tsx`, `WorksheetEdit.tsx`, `TrackerEdit.tsx`, `TrackerRecord.tsx` — to be wired with focus mode and lock in next implementation pass

### Risk Assessment

- **Low risk** — purely additive UI/UX layer; no database changes, no mutation logic changes
- `useBlocker` confirmed available in `react-router-dom@6.30.1`
- Forms that already handled their own navigation now delegate to parent page callbacks — backward compatible (callbacks are optional)
- Focus Mode is per-page (each ADD/EDIT page explicitly passes `focusMode`) — no central routing changes
