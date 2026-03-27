

# Plan v3 — BUG 0306-74: Timesheet mid-week hire/termination proration

## Problem

When `hire_date` or `termination_date` falls mid-week, the system demands the full 40h `WEEKLY_MIN`. A user hired on Friday who logs 8h cannot submit because 8 < 40.

## Solution

Prorate weekly min/max by ratio of workable days (excluding pre-hire, post-termination, and holidays) to total work days. Defense-in-depth: frontend + backend.

## Files (8 total, in order)

### 1. `src/lib/timesheetUtils.ts` — Add `startOfDay` import + utility function

- Add `startOfDay` to the date-fns import (line 1). It is NOT currently imported.
- Add exported function `getEffectiveWeeklyLimits()` before the `// ============== STATUS HELPERS ==============` comment (line 187).
- Signature: `(weekDates: Date[], weeklyMin: number, weeklyMax: number, hireDate: string | null, terminationDate: string | null, holidayDates: Set<string>) => { effectiveMin, effectiveMax, workableDays, totalDays }`
- Logic: iterate `weekDates`, skip days before hire (via `parseDateLocal` + `startOfDay` + `isBefore`), after termination, or in `holidayDates` set. Compute `ratio = workableDays / totalDays`. Round to 1 decimal.

### 2. `src/pages/TimeSheet.tsx` — Use prorated limits (5 changes)

**(2a)** Add `getEffectiveWeeklyLimits` to the import from `@/lib/timesheetUtils` (line 35-42).

**(2b)** After line 164 (`adminActivityId`), before line 166 (`activityNotRequiredIds`), add two `useMemo` blocks:
- `holidayDateSet`: `Set<string>` from `holidayMap` keys.
- Destructure `{ effectiveMin: effectiveWeeklyMin, effectiveMax: effectiveWeeklyMax, workableDays }` from `getEffectiveWeeklyLimits(weekInfo.weekDates, weeklyMin, weeklyMax, staffRecord?.hire_date ?? null, staffRecord?.termination_date ?? null, holidayDateSet)`.

**(2c)** Lines 157-158: replace `weeklyMin` → `effectiveWeeklyMin`, `weeklyMax` → `effectiveWeeklyMax`.

**(2d)** Lines 568-571 (weeklyMinNotMet alert): when `workableDays < workDays`, use i18n key `timesheet.weeklyMinNotMetPartial` with `{ total, min, days }`. Otherwise use existing key with prorated `min`. Lines 586-589: replace `max: weeklyMax` → `max: effectiveWeeklyMax`.

**(2e)** Lines 611-612: pass `weeklyMin={effectiveWeeklyMin}`, `weeklyMax={effectiveWeeklyMax}` to `<TimesheetGrid>`.

### 3. New migration — `submit_timesheet_safe()` proration

`CREATE OR REPLACE` the entire `submit_timesheet_safe()` function. Copy all existing logic verbatim from current definition. Insert a new block between the `v_weekly_max` fetch and the `v_actual_hours` query:

- Fetch `hire_date`, `termination_date` from `staff`.
- Fetch `week_start_date` from `timesheet_periods`.
- Fetch `TS_WORK_DAYS` from `global_settings` (default 5) — do NOT hardcode.
- Use `generate_series` + `EXTRACT(ISODOW)` to count total weekdays and workable weekdays (clamped to hire/term range).
- Subtract holidays within the clamped range.
- If `v_workable_days < v_total_workdays`, prorate `v_weekly_min` and `v_weekly_max`.

### 4. `src/locales/en.json` — Add 1 key

After `weeklyMinNotMet`: `"weeklyMinNotMetPartial": "CANNOT SUBMIT: the total hours ({{total}}h) are below the adjusted minimum ({{min}}h) for this partial week ({{days}} workable days)."`

### 5. `src/locales/es.json` — Add 1 key

After `weeklyMinNotMet`: `"weeklyMinNotMetPartial": "NO SE PUEDE ENVIAR: el total de horas ({{total}}h) está por debajo del mínimo ajustado ({{min}}h) para esta semana parcial ({{days}} días hábiles)."`

### 6. `src/lib/__tests__/timesheetUtils.test.ts` — Add 6 unit tests

Add `describe('getEffectiveWeeklyLimits')` using week Mon 2026-03-02 through Fri 2026-03-06:

| Test | hireDate | termDate | holidays | Expected min/max/workable |
|---|---|---|---|---|
| Full week, no boundaries | null | null | none | 40/40/5 |
| Mid-week hire (BUG 0306-74) | 2026-03-06 | null | none | 8/8/1 |
| Mid-week termination | null | 2026-03-04 | none | 24/24/3 |
| Holiday subtraction | null | null | Wed | 32/32/4 |
| Hire + holiday combined | 2026-03-05 | null | Fri | 8/8/1 |
| No workable days | 2026-03-09 | null | none | 0/0/0 |

### 7. `src/pages/__tests__/TimeSheet.partial-week.test.tsx` — NEW test file

**Why a new file**: The existing `TimeSheet.submit-guards.test.tsx` uses module-level `vi.mock()` with static factory functions returning `hire_date:'2020-01-01'` and `hours_logged:10`. These cannot be overridden per-test. The codebase already follows a separate-file-per-concern pattern.

- Copy the FULL mock setup from `TimeSheet.submit-guards.test.tsx` (matchMedia polyfill, ALL `vi.mock()` blocks, lazy import after mocks).
- Change ONLY these two mocks:
  - `useCurrentStaff`: return `{ staffRecord: { staff_id: 'staff-1', hire_date: '2026-03-06' }, isLoading: false }`
  - `useTimesheetWeek`: return entries with `hours_logged: 8`, `engagement_id: 'eng-1'`, `activity_id: 'act-1'`
- All other mocks stay identical.
- `describe('TimeSheet partial week hire date (BUG 0306-74)')` with test asserting `screen.queryByText(/weeklyMinNotMet/)` is NOT in the document.

**Do NOT modify** the existing `TimeSheet.submit-guards.test.tsx`.

### 8. `docs/changelogs/CHANGELOG-2026-03-28.md` — Create changelog

Document all changes for BUG 0306-74 following format from `CHANGELOG-2026-03-27.md`.

## What is NOT changed

- Approval workflow
- Per-day cell locking
- Existing i18n keys
- Daily min/max validation
- Existing test file `TimeSheet.submit-guards.test.tsx`

