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
