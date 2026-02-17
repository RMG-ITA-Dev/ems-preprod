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

---

## Filter Tracker & Timesheet Engagement Dropdowns to Approved Work Orders Only (Plan v2)

**Date:** 2026-02-17  
**Priority:** Alta  
**Version:** v2.0.5  

### Problem

Users could select engagements whose Work Orders were not yet approved when logging time via the Stopwatch, Manual Entry, or Edit Record forms. This led to database trigger rejections (`check_wo_approved`) at save/export time with confusing error messages, since the DB enforces that time entries can only be inserted against engagements with approved Work Orders.

### Solution

Created a shared `useApprovedEngagements` hook that pre-filters engagements to only those with an associated Work Order in `approval_status = 'Approved'`. Applied this filter to all Tracker engagement dropdowns (Stopwatch, Manual Entry, Edit Record) and the Timesheet engagement dropdown. Added defensive save-time validation and user-facing warnings for edge cases (e.g., an entry originally linked to a now-unapproved engagement).

### Technical Details

- **Two-step query pattern**: Step 1 fetches `engagement_id` from `work_orders` where `approval_status = 'Approved'`; Step 2 fetches full engagement records (with client, partner, manager joins) filtered by those IDs and `status = 'active'`
- **Graceful fallback in TrackerEdit**: If the current entry's engagement is no longer approved, it is still included in the dropdown (so the user sees what was selected) but a destructive alert warns them and save is blocked until they select an approved engagement
- **Timesheet uses same pattern**: `useTimesheetWeek` has its own inline approved-engagements query with the same two-step logic, cached for 5 minutes

### Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useApprovedEngagements.ts` | CREATE | Shared hook: 2-step query (work_orders → engagements) filtered to approved + active |
| `src/components/tracker/TrackerBar.tsx` | MODIFY | Switched from `useEngagements` to `useApprovedEngagements`; added "no approved engagements" alert; gated Start button on `isEngagementApproved` |
| `src/components/tracker/ManualEntryDialog.tsx` | MODIFY | Switched to `useApprovedEngagements`; added save-time guard rejecting unapproved selections |
| `src/pages/TrackerEdit.tsx` | MODIFY | Switched to `useApprovedEngagements`; added unapproved-engagement inline warning alert; added save-time block with toast |
| `src/hooks/useTimesheetWeek.ts` | MODIFY | Engagement dropdown query filtered to approved WOs only (BUG #19) |
| `src/locales/en.json` | MODIFY | Added keys: `woNotApproved`, `woNotApprovedSave`, `woNotApprovedEdit`, `noApprovedEngagements` |
| `src/locales/es.json` | MODIFY | Same 4 keys |

### Risk Assessment

- **Low risk** — no database schema changes; purely frontend filtering + validation
- DB trigger `check_wo_approved` remains the authoritative enforcement; UI filtering is a UX improvement that prevents confusing rejections
- Backward compatible: if an engagement's WO status changes after selection, save-time guards catch it gracefully
