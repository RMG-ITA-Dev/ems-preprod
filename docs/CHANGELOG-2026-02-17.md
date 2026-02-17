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
