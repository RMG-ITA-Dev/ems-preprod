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
