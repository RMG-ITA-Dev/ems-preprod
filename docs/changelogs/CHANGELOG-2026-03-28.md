# Changelog — 2026-03-28

## Fix: Timesheet Mid-Week Hire/Termination Proration (BUG 0306-74)

### Summary

When a staff member's `hire_date` or `termination_date` falls mid-week, the system previously demanded the full 40h `WEEKLY_MIN` to submit. This blocked submission for partial weeks (e.g., a user hired on Friday who logged 8h could not submit because 8 < 40). The fix prorates weekly min/max limits by the ratio of workable days to total work days, accounting for hire date, termination date, and holidays. Defense-in-depth: both frontend and backend enforce the prorated limits.

---

### File Changes

#### 1. `src/lib/timesheetUtils.ts`

- **Line 2**: Added `startOfDay` to date-fns imports.
- **Lines 187-224**: Added new exported function `getEffectiveWeeklyLimits()` that calculates prorated weekly limits based on workable days (excluding pre-hire, post-termination, and holiday days). Uses `parseDateLocal()` for date-only strings (BUG 0220-59 compliance).

#### 2. `src/pages/TimeSheet.tsx`

- **Line 42**: Added `getEffectiveWeeklyLimits` to import from `@/lib/timesheetUtils`.
- **Lines 157-180**: Moved holiday data hooks before validation. Added `holidayDateSet` and `effectiveWeeklyMin`/`effectiveWeeklyMax`/`workableDays` via `useMemo` calling `getEffectiveWeeklyLimits`.
- **Lines 157-159** (validation): Replaced `weeklyMin`/`weeklyMax` with `effectiveWeeklyMin`/`effectiveWeeklyMax`.
- **Lines 584-594** (weeklyMinNotMet alert): When `workableDays < workDays`, uses new i18n key `timesheet.weeklyMinNotMetPartial` with `{ total, min, days }`. Otherwise uses existing key with prorated `min`.
- **Lines 610-612** (weeklyMaxExceeded alert): Uses `effectiveWeeklyMax` instead of `weeklyMax`.
- **Lines 635-636** (TimesheetGrid props): Passes `effectiveWeeklyMin`/`effectiveWeeklyMax` instead of raw values.

#### 3. New migration — `submit_timesheet_safe()` proration

- `CREATE OR REPLACE` of the entire `submit_timesheet_safe()` function.
- Added new DECLARE variables for hire/term dates, week boundaries, and workday counts.
- Inserted proration block between `v_weekly_max` fetch and `v_actual_hours` query:
  - Fetches `hire_date` and `termination_date` from `staff`.
  - Fetches `week_start_date` from `timesheet_periods`.
  - Fetches `TS_WORK_DAYS` from `global_settings` (default 5).
  - Uses `generate_series` + `EXTRACT(ISODOW)` to count weekdays (matches `get_week_statuses()` pattern).
  - Subtracts holidays within the clamped range.
  - Prorates `v_weekly_min` and `v_weekly_max` proportionally.

#### 4. `src/locales/en.json`

- Added key `weeklyMinNotMetPartial` after `weeklyMinNotMet` (line 718).

#### 5. `src/locales/es.json`

- Added key `weeklyMinNotMetPartial` after `weeklyMinNotMet` (line 718).

#### 6. `src/lib/__tests__/timesheetUtils.test.ts`

- Added `describe('getEffectiveWeeklyLimits')` with 6 unit tests covering: full week, mid-week hire, mid-week termination, holiday subtraction, hire+holiday combination, and zero workable days.

#### 7. `src/pages/__tests__/TimeSheet.partial-week.test.tsx` (NEW)

- New integration test file (separate from `TimeSheet.submit-guards.test.tsx` due to module-level mock constraints).
- Tests that with `hire_date='2026-03-06'` and 8h logged, the `weeklyMinNotMet` alert does NOT appear.

---

### What is NOT changed

- Approval workflow
- Per-day cell locking
- Existing i18n keys (no modifications)
- Daily min/max validation
- Existing test file `TimeSheet.submit-guards.test.tsx`
