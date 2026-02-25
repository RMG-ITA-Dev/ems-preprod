

# Plan v4: Changelog Corrections for CHANGELOG-2026-02-24.md

## Problem

1. **Missing changelog**: The BUG 0220-52 regression fix (Plan v2: restore internal/ADMIN engagements in manual entry + fix build error) was appended to `docs/CHANGELOG-2026-02-22.md` but was NOT added to `docs/CHANGELOG-2026-02-24.md` where it belongs chronologically. It needs to be inserted into `CHANGELOG-2026-02-24.md` **before** the "Enhancement: Searchable Engagement Selector" entry.

2. **BUG 0213-36 lacks detail**: The first entry in `docs/CHANGELOG-2026-02-24.md` ("Replace DAILY_LIMIT/WEEKLY_LIMIT with Min/Max Model") is too sparse -- it's a bullet list without the detailed file-level, edit-level, and SQL-level breakdown that the project's documentation standard requires.

## Scope

- **Only** `docs/CHANGELOG-2026-02-24.md` is modified.
- No code, no DB, no RPC changes.

---

## Changes to `docs/CHANGELOG-2026-02-24.md`

### Change 1: Expand BUG 0213-36 Entry (lines 1-21)

Replace the existing sparse bullet list with a fully detailed changelog entry including:

**Root Cause section**: Explains that the old model used single DAILY_LIMIT and WEEKLY_LIMIT settings, with no minimum enforcement -- timesheets could be submitted with any number of hours below the max, and the system had no way to enforce a minimum threshold.

**Solution -- Detailed Edits** covering:

- **Edit 1 -- Database migration: Insert new global settings** (lines 1-29 of the migration SQL)
  - DAILY_MIN defaulting to 8, DAILY_MAX backfilled from existing DAILY_LIMIT, WEEKLY_MIN defaulting to 40, WEEKLY_MAX backfilled from existing WEEKLY_LIMIT.
  - Uses `ON CONFLICT (setting_key) DO NOTHING` for idempotent re-runs.
  - DAILY_LIMIT and WEEKLY_LIMIT left in DB as inert historical data.

- **Edit 2 -- Database migration: Create `update_timesheet_minmax_settings()` RPC** (lines 31-71 of the migration SQL)
  - Accepts `p_daily_min`, `p_daily_max`, `p_weekly_min`, `p_weekly_max`, `p_work_days` (default 5).
  - Server-side feasibility invariants: `DAILY_MIN_EXCEEDS_MAX`, `WEEKLY_MIN_EXCEEDS_MAX`, `WEEKLY_MIN_EXCEEDS_DAILY_MAX` (weekly_min > daily_max * work_days), `WEEKLY_MAX_BELOW_DAILY_MIN` (weekly_max < daily_min * work_days).
  - Atomic: writes all four settings in one transaction.
  - Returns `jsonb` with `success` boolean and optional `error_code`.

- **Edit 3 -- Database migration: Update `submit_timesheet_safe()` RPC** (lines 73-238 of the migration SQL)
  - Added weekly min/max validation block (lines 127-148): reads WEEKLY_MIN and WEEKLY_MAX from `global_settings`, sums `hours_logged` from `time_entries` scoped to `period_id + staff_id + is_forecast=false`.
  - Raises `WEEKLY_MIN_NOT_MET:actual=X,min=Y` if actual hours below minimum.
  - Raises `WEEKLY_MAX_EXCEEDED:actual=X,max=Y` if actual hours above maximum.
  - Validation happens after period lock acquisition but before `submitted_at` write.

- **Edit 4 -- `src/pages/Settings.tsx`: Replace old limit fields with 2x2 min/max grid**
  - Lines 127-130: Read DAILY_MIN, DAILY_MAX, WEEKLY_MIN, WEEKLY_MAX from `globalSettings` via `getSetting()`.
  - Lines 290-313: Save handler calls `update_timesheet_minmax_settings` RPC; maps returned `error_code` to i18n keys (`settings.dailyMinMaxError`, `settings.weeklyMinMaxError`, `settings.weeklyMinExceedsDailyMax`, `settings.weeklyMaxBelowDailyMin`).
  - Lines 582-621: Four `NumericInput` fields in a 2x2 grid layout for DAILY_MIN, DAILY_MAX, WEEKLY_MIN, WEEKLY_MAX with help text labels.

- **Edit 5 -- `src/pages/TimeSheet.tsx`: Submit gating with dual-bound check**
  - Lines 57-75: Four `useMemo` hooks read DAILY_MIN, DAILY_MAX, WEEKLY_MIN, WEEKLY_MAX from `globalSettings`.
  - Submit handler passes these to the RPC; error handler in `useTimesheetMutations` catches `WEEKLY_MIN_NOT_MET` and `WEEKLY_MAX_EXCEEDED`.

- **Edit 6 -- `src/components/timesheet/TimesheetGrid.tsx`: Daily coloring with min/max**
  - Props `dailyMin`, `dailyMax`, `weeklyMin`, `weeklyMax` (defaults: 8, 8, 40, 40).
  - `isDailyOverMax(date)`: column total > dailyMax (red).
  - `isDailyBelowMin(date)`: column total > 0 and < dailyMin (amber/warning).
  - `isDailyNearMax(date)`: total >= dailyMax * 0.8 and <= dailyMax (yellow).
  - Footer cell shows "Over max!" or "Below min" badges accordingly.

- **Edit 7 -- `src/pages/TrackerRecord.tsx`: Daily guard uses DAILY_MAX**
  - Line 126-130: `dailyMax` useMemo reads DAILY_MAX from globalSettings (default 8).
  - Used as the upper bound for the daily hours guard when starting/continuing timer entries.

- **Edit 8 -- `supabase/functions/dashboard-data/index.ts`: Uses WEEKLY_MAX for weekly_limit**
  - Lines 800-814: Reads WEEKLY_MAX from `global_settings`; maps to `weekly_limit` in the dashboard payload for the weekly capacity/utilization calculation.

- **Edit 9 -- `src/hooks/useTimesheetMutations.ts`: Error handler for min/max violations**
  - Lines 198-206: Catches `WEEKLY_MIN_NOT_MET` and `WEEKLY_MAX_EXCEEDED` in the submit mutation's `onError`, displaying localized toast messages.

- **Edit 10 -- `supabase/functions/test-minmax-settings/index.ts`: Backend integration tests**
  - Test 1: DAILY_MIN > DAILY_MAX returns `DAILY_MIN_EXCEEDS_MAX`.
  - Test 2: WEEKLY_MIN > WEEKLY_MAX returns `WEEKLY_MIN_EXCEEDS_MAX`.
  - Test 3: WEEKLY_MIN > DAILY_MAX * 5 returns `WEEKLY_MIN_EXCEEDS_DAILY_MAX`.
  - Test 4: Valid update returns `success: true`.

- **Edit 11 -- i18n keys added (EN/ES)**
  - `settings.dailyMin`, `settings.dailyMinHelp`, `settings.dailyMax`, `settings.dailyMaxHelp`
  - `settings.weeklyMin`, `settings.weeklyMinHelp`, `settings.weeklyMax`, `settings.weeklyMaxHelp`
  - `settings.dailyMinMaxError`, `settings.weeklyMinMaxError`, `settings.weeklyMinExceedsDailyMax`, `settings.weeklyMaxBelowDailyMin`
  - `timesheet.weeklyMinNotMet`, `timesheet.weeklyMaxExceeded`, `timesheet.dailyMaxExceeded`, `timesheet.weeklyBelowMin`

**Files Modified table** listing all affected files with lines and change description.

**Risk Assessment table** covering backward compatibility with existing DAILY_LIMIT/WEEKLY_LIMIT data, RPC atomicity, and migration idempotency.

### Change 2: Insert BUG 0220-52 Regression Fix Entry (between BUG 0213-36 and the Searchable Engagement Enhancement)

Insert the complete regression fix entry at line 23 (after the `---` separator following BUG 0213-36), with the following content from the approved Plan v2:

- **Plan reference**: BUG-0220-52-regression-hardening-v2
- **Related Bug**: 0220-52
- **Problem**: The 0220-52 stopwatch fix also affected ManualEntryDialog, which shared `useApprovedEngagements`. Internal/ADMIN engagements disappeared from manual entry.
- **Root Cause**: `ManualEntryDialog` consumed `useApprovedEngagements`, which hard-filters `is_internal = false`.
- **Fix details**:
  - Created `src/hooks/useManualEntryEngagements.ts` with query key `["engagements-for-manual-entry"]`, omitting `is_internal` filter. Group B non-admin `.or()` includes `is_internal.eq.true`.
  - Modified `src/components/tracker/ManualEntryDialog.tsx` to import and use `useManualEntryEngagements` instead of `useApprovedEngagements`.
  - `useApprovedEngagements` remains unchanged (tracker-only, excludes internal).
- **Build Fix**: Fixed `src/pages/__tests__/TimeSheet.submit-guards.test.tsx` compile error (replaced non-existent `TestWrapper` with project-standard `render` from `@/test/utils`).
- **Unchanged**: Stopwatch filtering, timesheet grid, no DB/RPC changes.
- **Files Modified table**: `useManualEntryEngagements.ts` (create), `ManualEntryDialog.tsx` (modify line 31, 74), `TimeSheet.submit-guards.test.tsx` (fix build).

### Change 3: Keep Existing Searchable Engagement Enhancement Entry (lines 25-43)

The existing "Enhancement: Searchable Engagement Selector with Unified Display" entry (Plan v3) remains as-is at the end of the file, unchanged.

---

## Final Document Structure

```text
docs/CHANGELOG-2026-02-24.md
  |-- BUG 0213-36: Replace DAILY_LIMIT/WEEKLY_LIMIT with Min/Max Model  (EXPANDED)
  |-- ---
  |-- BUG 0220-52 Regression Fix: Restore Internal Engagements in Manual Entry  (NEW)
  |-- ---
  |-- Enhancement: Searchable Engagement Selector with Unified Display  (EXISTING, unchanged)
```

---

## Execution Order

1. Rewrite BUG 0213-36 entry with full detail (lines 1-21 replaced)
2. Insert BUG 0220-52 regression fix entry between the `---` separator and the searchable engagement enhancement
3. Verify final document structure

---

## Acceptance Criteria

1. BUG 0213-36 entry contains detailed edit-level descriptions for all 11 edits (migration SQL, Settings UI, TimeSheet, TimesheetGrid, TrackerRecord, dashboard edge function, useTimesheetMutations, test edge function, i18n).
2. BUG 0220-52 regression fix entry is present between BUG 0213-36 and the searchable engagement enhancement.
3. Searchable engagement enhancement entry remains unchanged.
4. No code, DB, or RPC changes.

