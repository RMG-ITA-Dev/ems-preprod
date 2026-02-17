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
