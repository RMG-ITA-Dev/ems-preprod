# Changelog — 2026-02-13

## Schema: Merge `staff_capacity` into `staff`

### Problem

The database had a separate `staff_capacity` table designed to track per-staff weekly capacity with historical date-range support (`effective_from`, `effective_to`). In practice:

- The table contained **zero rows** — every capacity lookup fell back to the hardcoded default of 40 hours/week.
- The date-range columns (`effective_from`, `effective_to`) were never used; the edge function always selected the single latest active record or defaulted to 40.
- The table added unnecessary complexity: its own RLS policies, indexes, triggers, and a join in the `dashboard-data` edge function — all for a value that could be a simple column on `staff`.
- Only **one file** outside of auto-generated types and documentation referenced the table: `supabase/functions/dashboard-data/index.ts`.

### Solution

Consolidate `staff_capacity` into the `staff` table by adding a single column.

### What Changed

#### Database Migration
- Added `weekly_capacity_hours NUMERIC NOT NULL DEFAULT 40` column to the `staff` table.
- Migrated any existing data from `staff_capacity` into the new column (0 rows at time of migration, but handled for safety).
- Dropped the `staff_capacity` table along with all its dependent objects:
  - RLS policies (`staff_capacity_admin_all`, `staff_capacity_self_read`)
  - Index (`idx_staff_capacity_staff_id`)
  - Trigger (`update_staff_capacity_updated_at`)

#### Edge Function (`supabase/functions/dashboard-data/index.ts`)
1. **Team utilization (lines ~574-600):** Removed the separate `staff_capacity` query and join. The existing staff query now includes `weekly_capacity_hours`, and `capacityByStaff` is built directly from the staff list.
2. **Individual capacity (lines ~803-813):** Removed the dedicated `staff_capacity` lookup. Capacity is now read from the staff record already fetched earlier in the function.
3. Removed the `StaffCapacity` interface (no longer needed).

#### Documentation
- `docs/database-schema.sql` — Removed `staff_capacity` table definition, policies, indexes, and trigger; added `weekly_capacity_hours` column to `staff`.
- `supabase/ems-er-diagram.md` — Removed `staff_capacity` entity and its relationship arrow to `staff`.

### Files Modified

| File | Action |
|------|--------|
| Migration SQL | Add column, migrate data, drop table + policies + trigger + indexes |
| `supabase/functions/dashboard-data/index.ts` | Replace 2 `staff_capacity` queries with reads from `staff.weekly_capacity_hours`; remove `StaffCapacity` interface |
| `docs/database-schema.sql` | Schema documentation update |
| `supabase/ems-er-diagram.md` | Remove entity from ER diagram |
| `docs/CHANGELOG-2026-02-13.md` | This changelog |

### Impact

- **Frontend:** None — no `src/` file ever referenced `staff_capacity`.
- **Data loss:** None — table had 0 rows; all capacity values defaulted to 40.
- **Performance:** Slight improvement — dashboard edge function eliminates one extra query/join per request.
- **Rollback:** The migration can be reversed by re-creating the table if needed.

---

## BUG #0206-3: Timesheet Buttons Not Available on Non-Current Weeks

**Date:** 2026-02-13  
**Priority:** Alta  
**Version:** v2.0.3 → v2.0.4  
**Route:** OPERACIONES → Hoja de Tiempo

### Problem

The "Copiar Semana Anterior", "Retirar Envío", and "Guardar Borrador" buttons disappeared when navigating to past or future weeks. Root cause: button visibility was coupled to the monolithic `isEditable` flag, which depends on `lineApprovals` data (`hasPendingLines`, `hasRejectedLines`, `isFullyApproved`). For non-current weeks where no `lineApprovals` records exist yet, these derived booleans evaluate to `false`, hiding the buttons.

### Root Cause Detail

1. `isEditable` requires `lineApprovals` to contain pending/rejected lines for submitted weeks — often empty for past/future weeks.
2. `canUnsubmit` required `hasPendingLines`, making it `false` while `lineApprovals` is loading or absent.
3. Button rules should be independent of line-approval record availability.

### Solution

Decoupled each button's visibility from `isEditable`/`lineApprovals` into three self-contained flags. Added a previous-week period query to gate "Copy Previous Week" correctly. `isEditable` remains unchanged (still controls grid cell editability and Import from Timer).

### Changes — `src/pages/TimeSheet.tsx`

| Change | Detail |
|--------|--------|
| **Import added** | `useQuery` from `@tanstack/react-query`; `toISODateString` from `@/lib/timesheetUtils` |
| **Previous-week period query** | New `useQuery` fetching `timesheet_periods` for the previous week (`previousWeekStart`). Derives `prevWeekSubmittedOrApproved` = `!!previousPeriod?.submitted_at`. |
| **`hasNonZeroEntry`** | New derived boolean: `entries.some((e) => e.hours_logged > 0)` |
| **`canCopyPreviousWeek`** | `!isBeforeHireDate && isWithinEditableWindow && !isSubmitted && !period?.is_period_locked && prevWeekSubmittedOrApproved` |
| **`canUnsubmit` (simplified)** | Old: `isSubmitted && hasPendingLines && !isFullyApproved && isWithinEditableWindow`. New: `isSubmitted && !isFullyApproved && isWithinEditableWindow && !period?.is_period_locked` (removed `hasPendingLines` dependency, added lock guard) |
| **`canSaveDraft`** | `!isBeforeHireDate && isWithinEditableWindow && !period?.is_period_locked && !isFullyApproved && hasNonZeroEntry` |
| **JSX: Copy button** | Condition changed from `isEditable && !isSubmitted` → `canCopyPreviousWeek` |
| **JSX: Unsubmit button** | Uses new `canUnsubmit` (unchanged variable name, simplified logic) |
| **JSX: Save Draft button** | Condition changed from `isEditable` → `canSaveDraft` |
| **Handler guards** | Added `if (!canCopyPreviousWeek) return;`, `if (!canUnsubmit) return;`, `if (!canSaveDraft) return;` at top of respective handlers |

### What Stays Unchanged

- `isEditable` — still controls grid cell editability and Import from Timer button
- `canSubmit` — unchanged
- No mutation logic changes
- No backend/database changes

---

## BUG #0206-19: Start Date Allows Values Before Engagement Creation Date

**Date:** 2026-02-16  
**Priority:** Alta  
**Version:** v2.0.3 → v2.0.4  
**Route:** PRINCIPAL → Encargos

### Problem

The Engagement form allowed users to select a Start Date earlier than the engagement's creation date. The `Engagement` interface lacked `created_at`, the Calendar picker had no date restrictions, and no save-time validation existed.

### Root Cause

1. `Engagement` interface missing `created_at` field — form couldn't reference creation date.
2. Start Date Calendar had no `disabled` prop — any past date was selectable.
3. No `onSubmit` guard to block invalid values.

### Solution

Added a `minStartDate` constraint (today for new engagements, `created_at` for edits) enforced via Calendar `disabled` prop + `onSubmit` validation guard. Also restricted End Date Calendar to not allow dates before the selected Start Date.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useEmsData.ts` | Added `created_at: string \| null` to `Engagement` interface |
| `src/components/forms/EngagementForm.tsx` | Added `useMemo`, `startOfDay`, `isBefore` imports; computed `minStartDate`; added `onSubmit` validation guard; added `disabled` prop to both Start Date and End Date Calendars |
| `src/locales/en.json` | Added `engagement.startDateBeforeCreation` key |
| `src/locales/es.json` | Added `engagement.startDateBeforeCreation` key |
| `docs/CHANGELOG-2026-02-13.md` | This changelog entry |

### Risk Assessment

- **Low risk** — adds constraint only; no existing data or mutations modified.
- Legacy engagements with `start_date < created_at` will still display but will be blocked on save unless corrected.

---

## BUG #0213-22: Auto-Logout After 30 Minutes of Inactivity

**Date:** 2026-02-16  
**Priority:** Baja  
**Version:** v2.0.4  
**Route:** PRINCIPAL → Panel de Control

### Problem

Sessions persisted indefinitely. A user left the system unattended for 4 hours and it remained active — a security risk for an audit/consulting firm.

### Solution

Created a `useInactivityTimeout` hook that monitors user activity (mouse, keyboard, touch, scroll, click) with throttled resets (once per minute). After the configured timeout (default 30 minutes from `global_settings.SESSION_TIMEOUT_MINUTES`), it signs the user out and redirects to `/auth`. A warning toast appears 2 minutes before logout. Cross-tab synchronization via `BroadcastChannel` ensures all tabs log out together. A `visibilitychange` listener refreshes timers when backgrounded tabs return to focus.

### Changes

| File | Change |
|------|--------|
| Migration SQL | Inserted `SESSION_TIMEOUT_MINUTES` = `30` into `global_settings` |
| `src/hooks/useInactivityTimeout.ts` | New hook: activity monitoring, throttle, warning toast, cross-tab sync, visibility handling |
| `src/components/ProtectedRoute.tsx` | Added `useSetting("SESSION_TIMEOUT_MINUTES")` + `useInactivityTimeout(timeoutMinutes)` |
| `src/locales/en.json` | Added `auth.sessionExpiredInactivity`, `auth.sessionWarningInactivity` |
| `src/locales/es.json` | Added `auth.sessionExpiredInactivity`, `auth.sessionWarningInactivity` |

### Risk Assessment

- **Low risk** — purely additive; no existing auth or session logic modified.
- `BroadcastChannel` falls back gracefully to single-tab behavior if unsupported.
- Time Tracker data persists in DB so no data loss on auto-logout.

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

---

## BUG #0213-25: Submitted Timesheet Remains Editable

**Date:** 2026-02-16
**Priority:** Alta
**Version:** v2.0.4
**Route:** OPERACIONES - Hoja de Tiempo

### Problem

After submitting a weekly timesheet for approval, the entire grid remained
fully editable: hour cells accepted input, engagement/activity dropdowns
were active, "Agregar Fila" and delete icons were visible, and autosave
continued to fire. The banner correctly showed "pendiente de aprobacion"
but nothing was actually locked.

### Root Cause

In `src/pages/TimeSheet.tsx`, the `isEditable` flag included a second
branch that re-enabled editing whenever the week was submitted but had
pending or rejected lines:

    (isSubmitted && !isFullyApproved && (hasPendingLines || hasRejectedLines))

Since every freshly submitted week has pending lines, the grid was never
locked after submission. Additionally, `canSaveDraft` did not guard on
`!isSubmitted`, and `canSubmit` allowed re-submission while already
submitted (for rejected lines), bypassing the recall workflow.

### Solution

Implemented strict locking: once submitted, the timesheet is fully
read-only. Corrections (including rejected lines) require the user to
click "Retirar Envio" (unsubmit) first, edit, then re-submit. Added
defensive `!isFullyApproved` guards alongside `!isSubmitted` for
belt-and-suspenders safety against data anomalies.

### Changes -- `src/pages/TimeSheet.tsx`

| Change | Detail |
|--------|--------|
| **`isEditable`** | Replaced two-branch OR with flat AND: `!isBeforeHireDate && isWithinEditableWindow && !isSubmitted && !isFullyApproved && !period?.is_period_locked` |
| **`canSaveDraft`** | Added `!isSubmitted` and kept `!isFullyApproved`; reordered conditions |
| **`canSubmit`** | Removed branch allowing re-submit while submitted with rejected lines; now requires `!isSubmitted && !period?.is_period_locked` |

### What Stays Unchanged

- `canUnsubmit` -- already correct (shows "Retirar Envio" when submitted + not fully approved)
- `TimesheetGrid.tsx` -- already respects `isLocked={!isEditable}` globally
- Import-from-timer and Copy Previous Week buttons -- already gated on `isEditable` or `!isSubmitted`
- No backend/database changes
- No mutation logic changes

### Risk Assessment

- **Low risk** -- removes permissive branches only; no new state or data paths.
- Autosave cannot fire when inputs are disabled via `isLocked`.
- Users with rejected lines must use "Retirar Envio" before editing, which matches audit integrity expectations.

---

## BUG #0213-26: Redesign "Cronometro" into "Registros de Tiempo"

**Date:** 2026-02-16  
**Priority:** Alta  
**Version:** v2.0.4  
**Route:** OPERACIONES → Registros de Tiempo / Hoja de Tiempo

### Problem

The "Importar del Cronómetro" feature had 6 functional defects plus a UX mismatch with business workflow (S1–S5 requirements):

1. **UTC date shift** — `new Date(started_at)` shifted Bolivia UTC-4 dates across day boundaries.
2. **Missing `period_id`** — Inserts left `period_id` null, creating orphaned time entries invisible to the Timesheet grid.
3. **No aggregation** — Each timer entry became a separate `time_entries` row, producing duplicates for the same engagement+activity+day.
4. **No duplicate handling** — Relied on DB constraint errors (23505) instead of deterministic SELECT-first logic.
5. **No user feedback** — No success/warning/error toasts after import; spinner had no completion state.
6. **No grid refresh** — TanStack Query cache was not invalidated after import; Timesheet showed stale data until manual refresh.

Additionally, the feature was accessible from both TrackerList and Timesheet pages with duplicated logic, and there was no submission blocking (S5) — users could import into already-submitted weeks.

### Root Cause

1. Import logic duplicated in `TrackerList.tsx` and `TimeSheet.tsx` with no shared abstraction.
2. No aggregation step before DB writes.
3. Error-driven duplicate handling (catch 23505) instead of deterministic SELECT-first.
4. No `submitted_at` check before inserting into a week's timesheet.
5. Reactive architecture — no cache invalidation after mutations.

### Solution

Created a shared `useTimesheetImport` hook (`src/hooks/useTimesheetImport.ts`) with a 9-step pipeline:

1. **Date extraction** — `format(parseISO(started_at), "yyyy-MM-dd")` avoids UTC shift.
2. **Aggregation** — Groups entries by `(engagement_id, activity_id, date_worked)` and sums `duration_minutes`.
3. **Rounding** — `Math.round((totalMinutes / 60) * 10) / 10` (1 decimal, matches Timesheet grid).
4. **Week computation** — `getWeekMonday` from `@/lib/timesheetUtils` (same Monday-based function used by Timesheet).
5. **Deterministic period resolution** — SELECT existing period or INSERT new one; if INSERT fails, week is blocked (not thrown).
6. **S5 submission block** — Checks `submitted_at` per period; blocks export for submitted weeks.
7. **SELECT-first upsert** — SELECT existing `time_entries` row; UPDATE (additive merge) if found, INSERT if not.
8. **Selective marking** — Only successfully exported timer entries are marked `is_imported = true`.
9. **Cache invalidation** — Prefix-level invalidation for `time-entries`, `timesheet-period`, `timer_entries`, `timer_entries_unimported`.

Redesigned TrackerList with 3-button layout, checkbox selection (desktop table + mobile cards with 44px touch targets), and inline ManualEntryDialog. Removed import from Timesheet page. Deleted TimerImportDialog.

### Files Modified

| File | Action |
|------|--------|
| `src/hooks/useTimesheetImport.ts` | CREATE — shared 9-step export hook |
| `src/pages/TrackerList.tsx` | MODIFY — 3-button layout, checkbox selection, ManualEntryDialog, export handler |
| `src/pages/TimeSheet.tsx` | MODIFY — removed import button, dialog, and ~60 lines of related state/hooks |
| `src/components/tracker/TimerImportDialog.tsx` | DELETE |
| `src/components/tracker/ManualEntryDialog.tsx` | MODIFY — fixed hardcoded purple background to use Tailwind token |
| `src/locales/es.json` | MODIFY — renamed nav/tracker keys, added 7 export feedback keys |
| `src/locales/en.json` | MODIFY — same |
| `docs/CHANGELOG-2026-02-13.md` | MODIFY — this entry |

### S1–S5 Requirement Mapping

| Req | Description | How Addressed |
|-----|-------------|---------------|
| S1 | Cronómetro is one input method; export records → timesheet | Shared hook handles export; list view is the single control plane |
| S2 | Sidebar "Registros de Tiempo"; 3 buttons in list | `nav.tracker` renamed; 3-button layout: Export, +Cronómetro, +Nuevo Registro |
| S3 | Manual entry equally valid; accessible from list | ManualEntryDialog opens via "+Nuevo Registro de Tiempo" button |
| S4 | Checkbox selection on list rows before export | Checkbox column on desktop table + mobile cards; "select all" header |
| S5 | Export multiple times until submitted, then block | Hook checks `submitted_at` per resolved period; blocked entries NOT marked imported |

### Risk Assessment

- **Low risk** — no database schema changes; purely frontend refactor with shared hook.
- Deterministic SELECT-first upsert avoids race conditions (single user on own data).
- Period auto-creation uses same INSERT pattern as `useTimesheetWeek` (already in production).
- Blocked timer entries remain selectable after "Retirar Envío" (unsubmit).

---

## PROGRAMER_REQUEST_FIX_#2: Registros de Tiempo UI Refinements (S6, S7, S8)

**Date:** 2026-02-16  
**Priority:** Alta  
**Version:** v2.0.4  
**Route:** OPERACIONES → Registros de Tiempo

### Problem

Three UI refinements needed for the "Registros de Tiempo" module:
1. (S6) The "Acciones" column with inline edit/copy/delete buttons cluttered the table and duplicated functionality now handled by row-click navigation.
2. (S7) No dedicated edit page existed for completed timer entries — users had no way to modify time, engagement, or activity after recording.
3. (S8) Button styling inconsistencies: "Usar Cronómetro" and "Nuevo Registro de Tiempo" lacked visual differentiation.

### Solution

1. **S6 — Remove Acciones column**: Deleted the 8%-width "Acciones" column and all inline action buttons (edit/copy/delete) from both desktop table and mobile cards. Redistributed width to Engagement (22%→26%), Description (13%→16%), Activity (15%→16%), Status (8%→10%). Cleaned up unused `handleEdit`, `handleDuplicate`, `handleDelete` functions and `Pencil`, `Copy`, `Trash2`, `FileText` imports.

2. **S7 — TrackerEdit page**: Created `src/pages/TrackerEdit.tsx` following the "Editar Encargo" layout pattern. Features:
   - Navigation guards via `useEffect` gated on `isFetched` (not-found → `/tracker`, running timer → `/tracker/new`)
   - Robust loading state: skeleton shown only when `!isFetched && !entries`
   - Read-only mode for imported entries (disabled inputs, hidden Save/Delete, Alert banner)
   - Save reconstructs `started_at`/`ended_at` from date+time inputs, recalculates `duration_minutes`
   - Delete via AlertDialog confirmation
   - Extended `useUpdateTimerEntry` mutation type to include `started_at?: string`

3. **S8 — Button styling**: "Usar Cronómetro" now uses warning color (yellow), "Nuevo Registro de Tiempo" uses default (purple) with Plus icon. Both preserve `variant="default"` for CVA base styles. ManualEntryDialog inline behavior preserved.

### Files Modified

| File | Action |
|------|--------|
| `src/pages/TrackerEdit.tsx` | CREATE — dedicated edit page |
| `src/pages/TrackerList.tsx` | MODIFY — remove Acciones column/buttons (S6), button styling (S8), cleanup |
| `src/hooks/useTimerEntries.ts` | MODIFY — add `started_at?: string` to update mutation type |
| `src/App.tsx` | MODIFY — add TrackerEdit lazy import, route `/tracker/:id` → TrackerEdit |
| `src/locales/es.json` | MODIFY — add 8 tracker keys |
| `src/locales/en.json` | MODIFY — add 8 tracker keys |
| `docs/CHANGELOG-2026-02-13.md` | MODIFY — this entry |

### Risk Assessment

- **Low risk** — S6 removes UI only (row click navigation already existed). S7 adds new page with safe guards. S8 changes only visual styling.
- `/tracker/new` still routes to TrackerRecord (stopwatch) — unchanged.
- "Nuevo Registro de Tiempo" button still opens ManualEntryDialog inline — no navigation change.

---

## Hours Field Enhancement for Add & Edit Time Records

### Problem

Users had to manually calculate hours from start/end times. No direct way to input the number of hours worked, and no maximum hour restriction was enforced at the UI level.

### Solution

Added a bidirectional "Horas" numeric input field to both the ManualEntryDialog (Add) and TrackerEdit (Edit) forms with three behaviors:

1. **Max 8 hours restriction** — input clamped to 0-8 range with toast feedback
2. **Default start time 08:00** — new entries default to 08:00 start, 1 hour duration
3. **Bidirectional sync** — changing start/end time recomputes hours; changing hours recomputes end time

### What Changed

#### `src/components/tracker/ManualEntryDialog.tsx`
- Added `hours` state (default: 1) and helper functions `addHoursToTime`, `computeHoursBetween`
- Changed default `startTime` from "09:00" to "08:00", `endTime` from "10:00" to "09:00"
- Changed time grid from `grid-cols-2` to `grid-cols-3` (Start Time | Hours | End Time)
- Added `handleHoursChange`, `handleStartTimeChange`, `handleEndTimeChange` with sync logic
- Reset now includes `hours = 1`

#### `src/pages/TrackerEdit.tsx`
- Added `hours` state and same helper functions
- Populate hours from entry data on load (computed from start/end interval, rounded to 0.5, clamped to 8)
- Changed time grid from `sm:grid-cols-3` to `sm:grid-cols-4` (Date | Start | Hours | End)
- Added same bidirectional sync handlers
- Hours field disabled when `isImported` is true

#### `src/locales/en.json` & `src/locales/es.json`
- Added keys: `tracker.hours`, `tracker.maxHoursExceeded`

### Files Changed

| File | Action |
|---|---|
| `src/components/tracker/ManualEntryDialog.tsx` | MODIFY — add Hours field, defaults, sync logic |
| `src/pages/TrackerEdit.tsx` | MODIFY — add Hours field, populate from entry, sync logic |
| `src/locales/en.json` | MODIFY — add 2 tracker keys |
| `src/locales/es.json` | MODIFY — add 2 tracker keys |
| `docs/CHANGELOG-2026-02-13.md` | MODIFY — this entry |

### Risk Assessment

- **None** — Hours field is UI-only convenience; save logic still uses startTime/endTime to compute duration_minutes.
- Imported entries have Hours field disabled (consistent with other fields).
- Clamping to 8h prevents unreasonable entries with toast feedback.

---

## FIX: Export Error Feedback for Unapproved Work Orders

**Date:** 2026-02-17  
**Priority:** Media  
**Version:** v2.0.4  
**Route:** OPERACIONES → Registros de Tiempo

### Problem

When exporting timer entries to the Hoja de Tiempo, a DB trigger (`check_wo_approved`) rejects inserts if the engagement's Work Order is not approved. The error was silently lumped into `blockedCount` and the user saw a misleading toast about "weeks already submitted" instead of the real reason.

### Root Cause

1. In `useTimesheetImport.ts`, insert/update error handlers incremented `blockedCount` without inspecting the error message.
2. `TrackerList.tsx` displayed a single `exportBlocked` toast referencing submitted weeks for all blocked entries, regardless of the actual block reason.

### Solution

1. **Resilient error detector** — Added `isWoNotApprovedError()` helper using case-insensitive partial matching on both "work order" and "not approved" to handle trigger wording variations.
2. **Separate WO-blocked tracking** — New `woBlockedCount` and `woBlockedEngagementsSet` track WO-specific failures with correct count semantics (`group.timerIds.length`).
3. **Engagement code pre-fetch** — Batch-fetches `engagement_code` from `engagements` table before the main loop; falls back to `engagement_id.slice(0, 8)` if lookup fails.
4. **Bounded engagement list** — Shows at most 3 engagement codes in the toast, appending "(+N más)" for larger sets.
5. **Ordered toasts** — WO-blocked toast (red/error) fires first, then generic week-submitted toast (yellow/warning). Both can appear in the same export run.

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useTimesheetImport.ts` | Added `isWoNotApprovedError()`, expanded `ImportResult`, pre-fetch engagement codes, separate WO-blocked tracking, bounded engagement list |
| `src/pages/TrackerList.tsx` | Ordered toast logic (WO error first, then generic warning) |
| `src/locales/es.json` | Added `exportBlockedWO` key |
| `src/locales/en.json` | Added `exportBlockedWO` key |

### Risk Assessment

- **None** — No database changes. Purely additive TypeScript fields and UI feedback. Backward-compatible since new `ImportResult` fields default to zero/empty.

---

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

### Pages Completed (Phase 2)

**Date:** 2026-02-17

The remaining pages from Phase 1 have been wired with Focus Mode and navigation locks:

| File | Action | Description |
|------|--------|-------------|
| `src/pages/WorksheetNew.tsx` | MODIFY | Added `focusMode`, `usePageLeaveLock` (isDirty: false), `LeavePageDialog`, wired Cancel/Create bypass |
| `src/pages/WorksheetEdit.tsx` | MODIFY | Added `focusMode`, `usePageLeaveLock` (isDirty: hasUnsavedChanges), `LeavePageDialog`, removed `window.confirm`, wired all `navigate()` calls including WO link |
| `src/pages/TrackerEdit.tsx` | MODIFY | Added `focusMode`, `usePageLeaveLock` with custom `isDirty` (useMemo comparing form vs entry), `LeavePageDialog`, wired Save/Cancel/Delete bypass |
| `src/pages/TrackerRecord.tsx` | MODIFY | Added stopwatch-specific `useBlocker` (NOT focusMode), "Run in Background" button with bypass ref, `LeaveStopwatchDialog` with "Don't ask again" |
| `src/locales/en.json` | MODIFY | Added 13 i18n keys: `common.leavePageDirtyTitle/Body/Title/LockedBody/leaveAnyway/stay` + `tracker.timerRunningTitle/Body/leave/dontAskAgain/runInBackground/timerStillRunning/stay` |
| `src/locales/es.json` | MODIFY | Same 13 i18n keys in Spanish |

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
| `src/locales/en.json` | MODIFY | Added keys: `woNotApproved`, `woNotApprovedSave`, `woNotApprovedEdit`, `noApprovedEngagements` |
| `src/locales/es.json` | MODIFY | Same 4 keys |

> **Note:** `src/hooks/useTimesheetWeek.ts` was previously listed here but removed after audit confirmed the approved-WO filter pre-existed in the prior stable snapshot (file was byte-identical between snapshots).

### Risk Assessment

- **Low risk** — no database schema changes; purely frontend filtering + validation
- DB trigger `check_wo_approved` remains the authoritative enforcement; UI filtering is a UX improvement that prevents confusing rejections
- Backward compatible: if an engagement's WO status changes after selection, save-time guards catch it gracefully

---

## Expense Ownership Tracking ("My Expenses" Toggle)

**Date:** 2026-02-17  
**Priority:** Baja  
**Version:** v2.0.5  

### Problem

All expense log entries were displayed in a single flat list with no indication of who logged each expense. Users had no way to quickly filter to their own entries, making it difficult to review personal expense submissions in a shared list.

### Solution

Added a `created_by_staff_id` field to expense log creation and a "My Expenses" toggle switch to the Expenses list page. When enabled, the toggle filters the table to only show expenses logged by the current user. A "Logged By" indicator was also added for attribution visibility.

### Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/pages/Expenses.tsx` | MODIFY | Added `useCurrentStaff` import, `Switch`/`Label` imports, `myExpensesOnly` state, `created_by_staff_id` filter logic, and a Switch toggle in the toolbar |
| `src/hooks/useExpenseLogMutations.ts` | MODIFY | Added `created_by_staff_id?: string \| null` to the create mutation type signature |
| `src/locales/en.json` | MODIFY | Added "My Expenses" key |
| `src/locales/es.json` | MODIFY | Added "Mis Gastos" key |

### Risk Assessment

- **Low risk** — additive UI filter with no schema changes; existing expense records unaffected
- Filter is client-side only; RLS policies unchanged

---

## UI Reorganization and Branding Consolidation

**Date:** 2026-02-17  
**Priority:** Media  
**Version:** v2.0.5  

### Problem

The application branding ("EMS 2.0") was inconsistently applied across the sidebar header, login page, reset-password page, and 404 page. Navigation icons for Clients and Engagements did not align with the Dashboard tab iconography. The mobile "More" drawer lacked user identity information.

### Solution

Consolidated branding to "RuizmierGroup - EMS 2.0" across all standalone/public pages. Moved the brand from the sidebar header to the AppHeader center zone. Aligned sidebar icons with Dashboard tab icons (Clients → `Briefcase`, Engagements → `FolderKanban`). Added staff identity display (name, initials, category badge) to the mobile "More" drawer.

### Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/components/layout/AppSidebar.tsx` | MODIFY | Removed `SidebarHeader` with "EMS 2.0" branding, changed Clients icon from `Building2` to `Briefcase`, changed Engagements icon from `Briefcase` to `FolderKanban`, removed `userName` computation, adjusted padding |
| `src/pages/Auth.tsx` | MODIFY | Changed "EMS 2.0" to "RuizmierGroup - EMS 2.0" |
| `src/pages/ResetPassword.tsx` | MODIFY | Added "RuizmierGroup - EMS 2.0" header to both password-reset views |
| `src/pages/Clients.tsx` | MODIFY | Removed `Building2` icon from client name cells (consistency with new `Briefcase` icon usage) |
| `src/components/layout/MobileMoreDrawer.tsx` | MODIFY | Added `useCurrentStaff`, user initials calculation, display name logic, `UserCheck`/`UserX` icons, `Badge` import for staff info display |

### Risk Assessment

- **Low risk** — purely visual/branding changes; no business logic or data access changes
- Icon changes are consistent with Dashboard tab iconography established earlier

---

## NotFound (404) Page Rewrite

**Date:** 2026-02-17  
**Priority:** Baja  
**Version:** v2.0.5  

### Problem

The 404 page was a simple static component with no authentication awareness, no application layout integration, and no i18n support. Authenticated users landing on a bad URL lost all navigation context (header, sidebar).

### Solution

Complete rewrite of `NotFound.tsx`: authenticated users now see the 404 content wrapped in `AppLayout` (preserving header and navigation), while unauthenticated users see a standalone branded page with "RuizmierGroup - EMS 2.0". All text uses i18n keys (`notFound.title`, `notFound.returnHome`).

### Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/pages/NotFound.tsx` | REWRITE | Added `useAuth` check, `AppLayout` wrapper for authenticated users, standalone branded page for guests, i18n support via `notFound.title` and `notFound.returnHome` keys |
| `src/locales/en.json` | MODIFY | Added `notFound.title`, `notFound.returnHome` keys |
| `src/locales/es.json` | MODIFY | Added `notFound.title`, `notFound.returnHome` keys |

### Risk Assessment

- **Low risk** — isolated page with no dependencies; purely additive UX improvement
- Authentication check uses existing `useAuth` hook; no new auth logic
