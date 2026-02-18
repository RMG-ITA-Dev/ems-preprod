# Changelog — 2026-02-17

## BUG #0213-27: Holiday Management and Blocking System

**Date:** 2026-02-17  
**Priority:** Alta  
**Version:** v2.0.5  
**Route:** CONFIGURACIÓN → Feriados / OPERACIONES → Hoja de Tiempo

### Problem

The system lacked any mechanism for managing holidays or blocking time entry on holiday dates. Staff could log time on national holidays for any engagement, with no admin controls or enforcement.

### Root Cause

Missing feature — no holidays table, no blocking logic, no admin UI.

### Solution

Implemented a complete holiday management and blocking system with:
- **Database:** `holidays` table with CRUD + RLS, `HOLIDAY_ENGAGEMENT_ID` global setting, `enforce_holiday_blocking` trigger on `time_entries` (BEFORE INSERT OR UPDATE)
- **Settings UI:** Admin-only "Holidays" tab with engagement selector card + holidays CRUD table
- **Timesheet integration:** Visual indicators (tinted headers, calendar icons, tooltips), cell-level blocking, client-side guards, and server-side trigger enforcement
- **Copy Previous Week:** Skips holiday-blocked entries with info toast

### Database Migration

| Object | Detail |
|--------|--------|
| `holidays` table | `holiday_id` (PK), `holiday_date` (UNIQUE), `holiday_name`, `created_by` (FK→staff), `created_at`, `updated_at` |
| RLS policies | SELECT: all authenticated; INSERT/UPDATE/DELETE: `is_admin()` |
| `update_holidays_updated_at` trigger | Reuses `update_updated_at_column()` |
| `HOLIDAY_ENGAGEMENT_ID` setting | Idempotent insert via `ON CONFLICT DO NOTHING` |
| `enforce_holiday_blocking()` function | UUID-to-UUID comparison; raises `HOLIDAY_NOT_CONFIGURED` or `HOLIDAY_BLOCKED:<name>` |
| `enforce_holiday_blocking` trigger | `BEFORE INSERT OR UPDATE ON time_entries` — coexists with `check_wo_approved` |

### Files Created

| File | Description |
|------|-------------|
| `src/hooks/useHolidays.ts` | `useHolidays()`, `useHolidaysForWeek()`, `useHolidayEngagementId()` |
| `src/hooks/mutations/useHolidayMutations.ts` | `useCreateHoliday()`, `useUpdateHoliday()`, `useDeleteHoliday()` |
| `src/components/settings/HolidaysManager.tsx` | Admin UI: engagement selector card + holidays DataTable |
| `src/components/forms/HolidayForm.tsx` | Add/edit holiday dialog with date picker + name input |
| `docs/CHANGELOG-2026-02-17.md` | This changelog |

### Files Modified

| File | Change |
|------|--------|
| `src/pages/Settings.tsx` | Added admin-gated "Holidays" tab + `HolidaysManager` import |
| `src/pages/TimeSheet.tsx` | Added `useHolidaysForWeek`, `useHolidayEngagementId`; passes holiday data to grid and copy mutation |
| `src/components/timesheet/TimesheetGrid.tsx` | Added `holidayMap`/`holidayEngagementId` props; header tint+icon+tooltip; cell blocking; `handleHoursChange` guard |
| `src/hooks/useTimesheetMutations.ts` | `useCopyPreviousWeek` accepts `holidayDates`/`holidayEngagementId`; skips blocked entries; shows info toast |
| `src/lib/timesheetErrors.ts` | Added `HOLIDAY_BLOCKED` and `HOLIDAY_NOT_CONFIGURED` error codes |
| `src/hooks/mutations/index.ts` | Re-exported holiday mutations |
| `src/locales/en.json` | Added ~15 i18n keys for holidays |
| `src/locales/es.json` | Added ~15 i18n keys for holidays |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| All holiday entries blocked if engagement not configured | Warning banner in Settings + `HOLIDAY_NOT_CONFIGURED` error |
| Copy previous week silently skips cells | Toast info with skipped count |
| Existing time entries on past holidays | Trigger only fires on INSERT/UPDATE, not retroactive |
| Trigger ordering with `check_wo_approved` | Documented; no functional dependency |
| Date key mismatch | `toISODateString()` everywhere + raw DB date strings |
| UUID/text comparison | Trigger casts to uuid before comparing |

---

## Plan_0213-27_C01_v5 + C02_v1: Non-Chargeable Engagement Policy System

**Date:** 2026-02-17  
**Priority:** Alta  
**Version:** v2.0.6  
**Route:** OPERACIONES → Encargos (edit) / Hoja de Tiempo / Tracker

### Problem

Internal/non-chargeable engagements (holidays, training, admin) could not be used in timesheets because:
1. The engagement dropdown only fetched engagements with approved Work Orders — internal engagements with no WO were invisible.
2. The `check_wo_approved` trigger rejected time entry INSERTs for engagements without an approved WO.
3. `time_entries.activity_id` is NOT NULL with a unique index — internal engagements should not require meaningful activity selection.

### Solution

Three independent policy flags on `engagements` + a DB-enforced default activity:

| Flag | Default | Controls |
|------|---------|----------|
| `work_order_required` | `true` | Must have approved WO to appear in dropdown and pass DB trigger |
| `activity_required` | `true` | Must select an activity code when logging time |
| `is_internal` | `false` | Visible to ALL active staff (not just assigned team) |

A system "ADM" activity code is auto-assigned by a trigger when `activity_required = false`, keeping the NOT NULL constraint and unique index intact.

### Database Migration

| Object | Detail |
|--------|--------|
| `engagements` columns | `work_order_required` (bool, default true), `activity_required` (bool, default true), `is_internal` (bool, default false) |
| `activity_codes` upsert | `ADM` code — self-healing `ON CONFLICT DO UPDATE SET is_active=true` |
| `ADM_ACTIVITY_ID` setting | Stored in `global_settings`; fail-loud DO block if ADM missing |
| `check_wo_approved()` update | `CREATE OR REPLACE` preserving `SECURITY DEFINER`; bypasses check when `work_order_required = false` |
| `enforce_activity_default()` | New trigger function — forces `activity_id` to ADM when `activity_required = false` |
| `trg_enforce_activity_default` | `BEFORE INSERT OR UPDATE ON time_entries` |

### Files Created

| File | Description |
|------|-------------|
| `src/hooks/useAdminActivity.ts` | `useAdminActivityId()` hook — queries `activity_codes` for ADM |

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/mutations/useEngagementMutations.ts` | Added `work_order_required`, `activity_required`, `is_internal` to create/update payloads |
| `src/components/forms/EngagementForm.tsx` | Added state, payload wiring, and admin-only "Timesheet Policy" Switch toggles section |
| `src/hooks/useTimesheetWeek.ts` | Two-filter query: Group A (approved WO) + Group B (`work_order_required=false`) with visibility `.or()` filter |
| `src/hooks/useApprovedEngagements.ts` | Same two-filter pattern for Tracker |
| `src/components/timesheet/TimesheetGrid.tsx` | Auto-assign ADM activity, disable activity selector, UI guard when `adminActivityId` null |
| `src/pages/TimeSheet.tsx` | Pass `activityNotRequiredIds` + `adminActivityId` to grid |
| `src/components/tracker/TrackerBar.tsx` | Handle activity-not-required engagements + null guard |
| `src/components/tracker/ManualEntryDialog.tsx` | Handle activity-not-required engagements + null guard |
| `src/pages/Engagements.tsx` | Show "Internal" badge |
| `src/lib/timesheetErrors.ts` | Added `ADM_ACTIVITY_NOT_CONFIGURED` error code |
| `src/locales/en.json` | Added ~9 i18n keys for policy toggles and errors |
| `src/locales/es.json` | Added ~9 i18n keys for policy toggles and errors |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Existing engagements affected | All flags default to current behavior (true/true/false) — zero regression |
| ADM activity deleted by admin | DB trigger fails with clear `ADM_ACTIVITY_NOT_CONFIGURED`; UI disables input |
| ADM_ACTIVITY_ID setting stale | Self-healing upsert + fail-loud migration; trigger validates at runtime |
| Unique index with ADM activity | `activity_id` stays NOT NULL; ADM provides a real value |
| Non-WO engagement visible to wrong users | `is_internal=false` engagements only visible to assigned team or admin (SQL `.or()` filter) |
| Trigger ordering | Four triggers coexist independently; no ordering dependency |

---

## Plan_0213-27_C03_v2: Estado Filter, Delete Guard, Default View

**Date:** 2026-02-17  
**Priority:** Media  
**Version:** v2.0.7  
**Route:** OPERACIONES → Registros de Tiempo

### Problem

Three issues with the TrackerList page:
1. No filter on "Estado" column — unlike Fecha and Encargo columns
2. Imported records could be hard-deleted — no DB-level guard
3. Default view showed all records, including already-imported ones

### Solution

1. **DB trigger** `trg_prevent_imported_timer_delete`: BEFORE DELETE on `timer_entries` raises exception if `is_imported = true`
2. **Estado filter**: Excel-style funnel icon on Estado column header with Popover + Select (Activos, Todos, Listo, Importado, En Curso)
3. **Default view**: `statusFilter` defaults to `"active"` showing Running + Ready entries; imported records hidden until user explicitly filters

### Database Migration

| Object | Detail |
|--------|--------|
| `prevent_imported_timer_delete()` | Trigger function — raises exception on DELETE of imported timer entries |
| `trg_prevent_imported_timer_delete` | BEFORE DELETE ON `timer_entries` FOR EACH ROW |

### Files Modified

| File | Change |
|------|--------|
| `src/pages/TrackerList.tsx` | Added `statusFilter` state (default "active"), filter logic in `filteredEntries`, funnel icon + Popover + Select on Estado column header |
| `src/locales/en.json` | Added `tracker.statusActive`, `tracker.statusAll` |
| `src/locales/es.json` | Added `tracker.statusActive`, `tracker.statusAll` |
| `docs/CHANGELOG-2026-02-17.md` | This entry |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Default hides imported records | Users can switch filter to "Todos" or "Importado" |
| DB trigger blocks admin cleanup | Only blocks `is_imported=true`; admin can UPDATE flag first if needed |
| Hard delete still works for non-imported | Intentional — only imported records are protected |

---

## Plan_0213-28_C04_v5: No Staff Record = No Access + Bootstrap + Auto-Activate

**Date:** 2026-02-18  
**Priority:** Baja  
**Version:** v2.0.8  
**Route:** AUTH / ADMINISTRACION → Personal

### Problem

A user who self-registers (signs up + verifies email) could access the app even without a linked staff record. The system only checked `is_active === false` on existing staff records but allowed access when no staff record existed at all.

### Solution

5-layer defense implementing "no staff record = no access":

1. **ProtectedRoute** — Waits for role+staff loading; gates on `!staffRecord` (admin → `/bootstrap`, non-admin → sign out); uses `useEffect` for sign-out (no side effects during render)
2. **signIn()** — Checks for staff record after auth; admin without staff allowed (bootstrap); non-admin gets `NO_STAFF_RECORD` error
3. **Auth.tsx** — Handles `NO_STAFF_RECORD` with exact `===` match and user-friendly message
4. **StaffForm** — Defaults `is_active: false` for new records; auto-activated when registration completes
5. **DB triggers** — `link_staff_to_auth_user` and `link_auth_user_to_staff` updated with auto-activate (`is_active = true`), email normalization (`lower(trim())`), and soft-delete guards (`deleted_at IS NULL`)

### Files Created

| File | Description |
|------|-------------|
| `src/pages/Bootstrap.tsx` | Admin self-profile creation page with pre-filled email |
| `src/components/BootstrapRoute.tsx` | Guard: only admin + no staff record can access `/bootstrap` |

### Files Modified

| File | Change |
|------|--------|
| `src/components/ProtectedRoute.tsx` | Added `useUserRole`, `useMemo` for derived state, `useEffect` for sign-out |
| `src/hooks/useAuth.tsx` | Added `NO_STAFF_RECORD` check with admin exception in `signIn` |
| `src/pages/Auth.tsx` | Handle `NO_STAFF_RECORD` error with exact match |
| `src/components/forms/StaffForm.tsx` | Default `is_active: false`; conditional helper text |
| `src/App.tsx` | Added `/bootstrap` route with `BootstrapRoute` guard |
| `src/locales/en.json` | Added bootstrap + noStaffRecord + activeDescriptionNew keys |
| `src/locales/es.json` | Added bootstrap + noStaffRecord + activeDescriptionNew keys |

---

## BUG #0213-29: Disable Timer Button When Running + Fix Stale Leave Dialog

**Date:** 2026-02-18
**Priority:** Media
**Version:** v2.0.9
**Route:** OPERACIONES -> Cronometro

### Problem

Two issues with the Tracker:
1. The "Usar cronometro" button on `/tracker` was always enabled, allowing users to click it repeatedly even when a timer was already running. Although the DB prevents duplicate running timers, the UI gave no indication.
2. After clicking "Guardar" on `/tracker/new`, the "Cronometro en curso" leave-confirmation dialog appeared incorrectly because the `useBlocker` navigation guard still evaluated stale `isRunning = true` from cached query data.

### Root Cause

1. `TrackerList.tsx` did not check for a running timer entry.
2. `handleSaveAndReset` in `TrackerRecord.tsx` called `navigate()` before the `running_timer` query cache updated, so the `useBlocker` condition was still true. The "Run in Background" button already solved this with `stopwatchBypassRef`, but the save/cancel/delete handlers did not use it.

### Solution

1. **TrackerList:** Import `useRunningTimerEntry()`, disable "Usar cronometro" button when `hasRunningTimer` is true (wrapped in `<span className="inline-flex">` for tooltip accessibility), and show a secondary "Ver cronometro activo" CTA.
2. **TrackerRecord:** Set `stopwatchBypassRef.current = true` in `handleSaveAndReset`, `handleCancel`, and `handleDelete` immediately after the async DB operation succeeds, before `resetForm()` or `navigate()`.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/TrackerList.tsx` | Import `useRunningTimerEntry`, disable button when running, add tooltip wrapper, add "Ver cronometro activo" CTA |
| `src/pages/TrackerRecord.tsx` | Add `stopwatchBypassRef.current = true` in `handleSaveAndReset`, `handleCancel`, `handleDelete` before navigation |
| `src/locales/en.json` | Added `tracker.timerAlreadyRunningHint`, `tracker.viewActiveTimer` |
| `src/locales/es.json` | Added `tracker.timerAlreadyRunningHint`, `tracker.viewActiveTimer` |
| `docs/CHANGELOG-2026-02-17.md` | This entry |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Extra query on TrackerList | Already cached by `RunningTimerChip` in header; no extra network request |
| Button re-enables after stop | `useStopTimerRPC` invalidates `running_timer` query key; instant re-enable |
| Disabled button tooltip not showing | Wrapped in `<span className="inline-flex" title=...>` |
| Bypass ref stays true | Component unmounts on navigation; ref is garbage-collected |

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

---

## BUG #0213-31: Legacy Data Cleanup for Oversized Timer Entries

**Date:** 2026-02-18
**Priority:** Media
**Version:** v2.0.9
**Route:** OPERACIONES -> Cronometro

### Problem

Legacy timer entries created before the 8-hour cap (migration 20260217) still contained inflated durations (19h 15m, 99h 20m). These entries already had `ended_at` set, so the original migration's pre-cleanup (targeting only `ended_at IS NULL`) did not fix them. Additionally, 7 `time_entries` rows had `hours_logged > 8`.

### Root Cause

The pre-cleanup in migration 20260217035038 only targeted entries with `ended_at IS NULL`. Entries that were already stopped (status 'Listo' or 'Importado') with oversized durations were not affected.

### Solution

One-time data cleanup migration:
1. Temporarily disabled `trg_validate_timer_duration` and `trg_protect_approved_time_entries` triggers (they would block UPDATE of already-oversized rows)
2. Capped all `timer_entries` with duration > 480 min to 480 min and `ended_at` to `started_at + 8h`
3. Capped all `time_entries` with `hours_logged > 8` to 8
4. Re-enabled triggers
5. Recalculated `timesheet_periods.total_hours` for affected periods
6. No frontend changes -- all forward-looking protections were already in place

### Database Migration

| Object | Detail |
|--------|--------|
| `timer_entries` cleanup | 1 row: duration 1155 -> 480, ended_at clamped |
| `time_entries` cleanup | 7 rows: hours_logged 9-10 -> 8 |
| `timesheet_periods` recalc | 2 periods with updated totals |
| Trigger disable/re-enable | `trg_validate_timer_duration`, `trg_protect_approved_time_entries` |

### Files Modified

| File | Change |
|------|--------|
| Migration SQL | One-time cleanup of legacy oversized entries |
| `docs/CHANGELOG-2026-02-17.md` | This entry |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Data modification is irreversible | Only 8 rows affected; values are clearly erroneous (19h, 99h) |
| Trigger disabled during migration | Re-enabled immediately after; migration runs in single transaction |
| Approved line updated | `trg_protect_approved_time_entries` temporarily disabled; re-enabled after |
| Timesheet period totals wrong after cap | Explicitly recalculated in Step 5 |

---

## BUG #0213-32: Fix Approval Persistence After Partial Approval

**Date:** 2026-02-18
**Priority:** Alta
**Version:** v2.0.9
**Route:** OPERACIONES -> Aprobaciones

### Problem

After partially approving timesheet lines (e.g., approving 1 of 2 engagement lines), the detail view showed all lines as pending again. Previously approved/rejected lines lost their visual status and displayed toggles as if no decision had been made.

### Root Cause

1. `processDecisions` cleared `approvalDecisions` state synchronously after mutations, but query refetch was async. During the gap, stale cached data (all pending) was rendered with empty decisions.
2. `useStaffTimesheetForApproval` had a 5-minute staleTime, potentially serving cached pre-approval data on re-entry.

### Solution

1. **Optimistic cache update:** Before firing mutations, the detail query cache is updated to reflect decided statuses immediately. No flash of stale "pending" data.
2. **Awaited refetch after mutations:** After mutations resolve, the detail query is invalidated and refetched before clearing local state. Replaces optimistic data with authoritative DB state.
3. **Conditional navigation:** User stays on the detail page after partial approval (can continue deciding). Navigates back only when all pending lines are resolved.
4. **Fresh data on mount:** `staleTime: 0` and `refetchOnMount: 'always'` on the detail query ensures fresh data every visit.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/TimesheetApprovalDetail.tsx` | Optimistic update + awaited refetch in processDecisions; import queryClient, useCurrentStaff, StaffTimesheetForApproval type |
| `src/hooks/useTimesheetApprovals.ts` | staleTime=0, refetchOnMount='always', refetchOnWindowFocus=true on detail query |
| `docs/CHANGELOG-2026-02-17.md` | This entry |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Optimistic state diverges from DB | Refetch immediately after mutations replaces optimistic data |
| No staleTime on detail query | Only used on one page; cost is one fetch per visit |
| User stays on page after partial save | Correct behavior per requirement; can continue or navigate back manually |

#### v3 Corrections (2026-02-18)

- **`isSaving` guard:** Added `isSaving` state to disable "Guardar Decisiones" button during async processing, preventing double-submit races.
- **Snapshot rollback + DB reconciliation:** On mutation failure, the optimistic cache update is immediately rolled back to a pre-save snapshot, then `invalidateQueries` + `refetchQueries(type: "all")` reconciles with partial DB changes. Error toast uses localized `common.saveError`.
- **`refetchQueries` type fix:** Changed from `type: "active"` to `type: "all"` to ensure cache sync regardless of query activity status.
- **i18n key added:** `common.saveError` in both `en.json` and `es.json`.

---

## BUG #0213-33: Block Timesheet Submission When Weekly Limit Exceeded

**Date:** 2026-02-18
**Priority:** Media
**Version:** v2.0.10
**Route:** OPERACIONES -> Hoja de Tiempo

### Problem

The system allowed submitting timesheets with total hours exceeding the configured weekly limit (e.g., 50h). Visual warnings existed in the grid (red cells, "Excede limite!" text) but did not prevent submission.

### Root Cause

No validation existed in the submit flow — neither in the `canSubmit` flag nor inside `handleSubmit`. The weekly limit was only enforced visually in the grid component.

### Solution

Two layers of enforcement (defense in depth):

1. **UI gating:** Computed `weeklyGrandTotal` (with `Number()` coercion to prevent string concatenation bugs) and `isWeeklyLimitExceeded`. Added `!isWeeklyLimitExceeded` to `canSubmit` flag, disabling the submit button. Added a destructive inline alert (shown only when all base eligibility checks pass).
2. **handleSubmit guard:** Early return at the top of `handleSubmit` using `isWeeklyLimitExceeded`, blocking submission even if `canSubmit` is bypassed programmatically.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/TimeSheet.tsx` | Added `weeklyGrandTotal` (with `Number()` coercion), `isWeeklyLimitExceeded`, gated `canSubmit`, added early-return guard in `handleSubmit`, added inline alert with full eligibility condition |
| `src/locales/en.json` | Added `timesheet.cannotSubmitWeeklyLimit` |
| `src/locales/es.json` | Added `timesheet.cannotSubmitWeeklyLimit` |
| `docs/CHANGELOG-2026-02-17.md` | This entry |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Client-side only (no server guard) | Sufficient for this priority; server-side trigger is future scope |
| Entries array empty | `reduce` on empty returns 0; `canSubmit` already checks `entries.length > 0` |
| `hours_logged` as string | `Number()` coercion handles it safely |
| Alert showing in irrelevant states | Full eligibility condition prevents it |

---

## BUG #0213-34: Fix Timesheet Row Deletion Persistence

**Date:** 2026-02-18
**Priority:** Alta
**Version:** v2.0.10
**Route:** OPERACIONES -> Hoja de Tiempo

### Problem
Deleting a timesheet row removed it only from local UI state (`setRows` filter). Because underlying `time_entries` were not deleted from the database, the row reappeared on autosave/refetch/reload.

### Root Cause
`removeRow` in `TimesheetGrid.tsx` only called `setRows(rows.filter(...))` without any database mutation.

### Solution
1. **Bulk DB delete:** New `useDeleteRowEntries` mutation deletes all `time_id` values via `.delete().in('time_id', ids)`.
2. **Confirmation dialog:** AlertDialog shown only when the row has saved DB entries. Empty/new rows removed instantly.
3. **Optimistic UI + rollback:** Row removed immediately; restored with error toast on failure.
4. **Double-click protection:** Trash button disabled while `deleteRowEntries.isPending`.
5. **Cache sync:** `["time-entries"]` query invalidated on success.
6. **Toast de-duplication:** `useDeleteRowEntries` omits `onError`; caller's `catch` handles toast.
7. **Deterministic logging:** `logger.error()` in `catch` block ensures errors are always logged regardless of React Query config.

### Files Modified
| File | Change |
|------|--------|
| `src/hooks/useTimesheetMutations.ts` | Added `useDeleteRowEntries` bulk delete mutation |
| `src/components/timesheet/TimesheetGrid.tsx` | Rewrote `removeRow` with confirmation, optimistic UI, rollback, `logger.error`, disabled trash |
| `src/locales/en.json` | Added `deleteRowTitle`, `deleteRowDescription`, `deleteRowError` |
| `src/locales/es.json` | Added Spanish equivalents |
| `docs/CHANGELOG-2026-02-17.md` | This entry |

---

## BUG #0213-35: Make Adjustment Field Visually Identifiable as Editable

**Date:** 2026-02-18
**Priority:** Baja
**Version:** v2.0.10
**Route:** PRINCIPAL -> Ordenes de Trabajo

### Problem
The Adjustment (`NumericInput`) field in the Work Order summary used `border-0 bg-transparent`, making it visually indistinguishable from static text rows.

### Solution
Conditional styling: when `isEditable`, the field shows a standard input border (`border-input`), background (`bg-background`), padding, and rounded corners. When locked, it retains the transparent borderless look.

### Files Modified
| File | Change |
|------|--------|
| `src/components/forms/WorkOrderForm.tsx` | Conditional className on Adjustment NumericInput |
| `docs/CHANGELOG-2026-02-17.md` | This entry |

---

## BUG #0213-36: Partner Timesheet Auto-Approval (Closed - Expected Behavior)

**Date:** 2026-02-18
**Priority:** Media
**Version:** v2.0.10
**Route:** OPERACIONES -> Hoja de Tiempo

### Report
Tester reported that Partner (Socio) timesheets are auto-approved without standard review.

### Resolution
Confirmed as **working as designed**. Business rule: Partners (display_order <= 2) do not require approval from other Partners. The `is_auto_approved_category()` DB function and `get_line_approver()` function implement this intentionally. The UI already shows a distinct toast ("Hoja de tiempo auto-aprobada") to communicate the auto-approval to the user.

**Status:** Closed - Expected Functionality. No code changes.
