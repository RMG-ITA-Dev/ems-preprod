
## BUG 0213-36: Replace DAILY_LIMIT/WEEKLY_LIMIT with Min/Max Model

**Plan**: BUG-0213-36-minmax-model
**Migration**: `<timestamp>_bug_0213_36_replace_limits_with_minmax.sql`

### Root Cause

The previous timesheet validation model used two single-value global settings — `DAILY_LIMIT` and `WEEKLY_LIMIT` — which only enforced an upper ceiling. There was no minimum enforcement: timesheets could be submitted with any number of hours (including zero) below the maximum. The firm needed the ability to enforce both a minimum threshold (e.g., staff must log at least 40 hours/week) and a maximum cap, requiring a transition from a single-limit to a dual-bound (min/max) model.

### Solution — Detailed Edits

#### Edit 1 — Database migration: Insert new global settings (migration lines 1-29)

Inserted four new rows into `global_settings`:
- `DAILY_MIN` defaulting to `8`.
- `DAILY_MAX` backfilled from the existing `DAILY_LIMIT` value (default `8`).
- `WEEKLY_MIN` defaulting to `40`.
- `WEEKLY_MAX` backfilled from the existing `WEEKLY_LIMIT` value (default `40`).

Uses `ON CONFLICT (setting_key) DO NOTHING` for idempotent re-runs. The legacy `DAILY_LIMIT` and `WEEKLY_LIMIT` rows are left in the database as inert historical data — they are no longer read by any runtime code.

#### Edit 2 — Database migration: Create `update_timesheet_minmax_settings()` RPC (migration lines 31-71)

New PostgreSQL function accepting parameters `p_daily_min`, `p_daily_max`, `p_weekly_min`, `p_weekly_max`, and `p_work_days` (default `5`).

Server-side feasibility invariants enforced before write:
| Error Code | Condition |
|---|---|
| `DAILY_MIN_EXCEEDS_MAX` | `p_daily_min > p_daily_max` |
| `WEEKLY_MIN_EXCEEDS_MAX` | `p_weekly_min > p_weekly_max` |
| `WEEKLY_MIN_EXCEEDS_DAILY_MAX` | `p_weekly_min > p_daily_max * p_work_days` |
| `WEEKLY_MAX_BELOW_DAILY_MIN` | `p_weekly_max < p_daily_min * p_work_days` |

Atomic: writes all four settings in a single transaction. Returns `jsonb` with `success` boolean and optional `error_code`.

#### Edit 3 — Database migration: Update `submit_timesheet_safe()` RPC (migration lines 73-238)

Added weekly min/max validation block (lines 127-148 of the function body):
- Reads `WEEKLY_MIN` and `WEEKLY_MAX` from `global_settings`.
- Sums `hours_logged` from `time_entries` scoped to `period_id + staff_id + is_forecast=false`.
- Raises `WEEKLY_MIN_NOT_MET:actual=X,min=Y` if actual hours below minimum.
- Raises `WEEKLY_MAX_EXCEEDED:actual=X,max=Y` if actual hours above maximum.
- Validation happens after period lock acquisition but before `submitted_at` write.

#### Edit 4 — `src/pages/Settings.tsx`: Replace old limit fields with 2×2 min/max grid

- Lines 127-130: Read `DAILY_MIN`, `DAILY_MAX`, `WEEKLY_MIN`, `WEEKLY_MAX` from `globalSettings` via `getSetting()`.
- Lines 290-313: Save handler calls `update_timesheet_minmax_settings` RPC; maps returned `error_code` to i18n keys (`settings.dailyMinMaxError`, `settings.weeklyMinMaxError`, `settings.weeklyMinExceedsDailyMax`, `settings.weeklyMaxBelowDailyMin`).
- Lines 582-621: Four `NumericInput` fields in a 2×2 grid layout (`grid grid-cols-2 gap-4`) for DAILY_MIN, DAILY_MAX, WEEKLY_MIN, WEEKLY_MAX with help text labels beneath each input.

#### Edit 5 — `src/pages/TimeSheet.tsx`: Submit gating with dual-bound check

- Lines 57-75: Four `useMemo` hooks read `DAILY_MIN`, `DAILY_MAX`, `WEEKLY_MIN`, `WEEKLY_MAX` from `globalSettings`.
- Submit handler passes these to the RPC; error handler in `useTimesheetMutations` catches `WEEKLY_MIN_NOT_MET` and `WEEKLY_MAX_EXCEEDED` error codes.

#### Edit 6 — `src/components/timesheet/TimesheetGrid.tsx`: Daily coloring with min/max

- Added props: `dailyMin`, `dailyMax`, `weeklyMin`, `weeklyMax` (defaults: 8, 8, 40, 40).
- `isDailyOverMax(date)`: column total > `dailyMax` → red background.
- `isDailyBelowMin(date)`: column total > 0 and < `dailyMin` → amber/warning background.
- `isDailyNearMax(date)`: total >= `dailyMax * 0.8` and <= `dailyMax` → yellow background.
- Footer cell shows "Over max!" or "Below min" badges accordingly.

#### Edit 7 — `src/pages/TrackerRecord.tsx`: Daily guard uses DAILY_MAX

- Lines 126-130: `dailyMax` useMemo reads `DAILY_MAX` from `globalSettings` (default `8`).
- Used as the upper bound for the daily hours guard when starting/continuing timer entries.

#### Edit 8 — `supabase/functions/dashboard-data/index.ts`: Uses WEEKLY_MAX for weekly_limit

- Lines 800-814: Reads `WEEKLY_MAX` from `global_settings` table; maps to `weekly_limit` in the dashboard payload for the weekly capacity/utilization calculation.

#### Edit 9 — `src/hooks/useTimesheetMutations.ts`: Error handler for min/max violations

- Lines 198-206: Catches `WEEKLY_MIN_NOT_MET` and `WEEKLY_MAX_EXCEEDED` in the submit mutation's `onError` callback, displaying localized toast messages via `sonner`.

#### Edit 10 — `supabase/functions/test-minmax-settings/index.ts`: Backend integration tests

Four test cases:
| Test | Input | Expected |
|---|---|---|
| 1. DAILY_MIN > DAILY_MAX | `p_daily_min=10, p_daily_max=5` | `success=false, error_code=DAILY_MIN_EXCEEDS_MAX` |
| 2. WEEKLY_MIN > WEEKLY_MAX | `p_weekly_min=50, p_weekly_max=40` | `success=false, error_code=WEEKLY_MIN_EXCEEDS_MAX` |
| 3. WEEKLY_MIN > DAILY_MAX × 5 | `p_weekly_min=45, p_daily_max=8` | `success=false, error_code=WEEKLY_MIN_EXCEEDS_DAILY_MAX` |
| 4. Valid update | `8, 8, 40, 40` | `success=true` |

#### Edit 11 — i18n keys added (EN/ES)

Settings keys:
- `settings.dailyMin`, `settings.dailyMinHelp`, `settings.dailyMax`, `settings.dailyMaxHelp`
- `settings.weeklyMin`, `settings.weeklyMinHelp`, `settings.weeklyMax`, `settings.weeklyMaxHelp`
- `settings.dailyMinMaxError`, `settings.weeklyMinMaxError`, `settings.weeklyMinExceedsDailyMax`, `settings.weeklyMaxBelowDailyMin`

Timesheet keys:
- `timesheet.weeklyMinNotMet`, `timesheet.weeklyMaxExceeded`, `timesheet.dailyMaxExceeded`, `timesheet.weeklyBelowMin`

### Files Modified

| File | Lines | Change |
|---|---|---|
| Migration SQL | 1-238 | Insert settings, create `update_timesheet_minmax_settings` RPC, update `submit_timesheet_safe` RPC |
| `src/pages/Settings.tsx` | 127-130, 290-313, 582-621 | Read min/max settings, save handler with RPC call, 2×2 grid UI |
| `src/pages/TimeSheet.tsx` | 57-75 | Four `useMemo` hooks for min/max; submit gating |
| `src/components/timesheet/TimesheetGrid.tsx` | Props, footer | Daily coloring logic with min/max thresholds |
| `src/pages/TrackerRecord.tsx` | 126-130 | `dailyMax` useMemo for daily guard |
| `supabase/functions/dashboard-data/index.ts` | 800-814 | Read `WEEKLY_MAX` for `weekly_limit` payload |
| `src/hooks/useTimesheetMutations.ts` | 198-206 | Error handler for min/max violations |
| `supabase/functions/test-minmax-settings/index.ts` | Full file | Four backend integration tests |
| `src/locales/en.json` | tracker section | 12 new i18n keys |
| `src/locales/es.json` | tracker section | 12 new i18n keys (Spanish) |

### Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Backward compatibility with existing `DAILY_LIMIT`/`WEEKLY_LIMIT` data | Low | Legacy rows left inert in DB; new keys backfilled from existing values |
| RPC atomicity | Low | `update_timesheet_minmax_settings` writes all four settings in one transaction |
| Migration idempotency | Low | `ON CONFLICT DO NOTHING` on setting inserts; `CREATE OR REPLACE FUNCTION` on RPCs |
| Partner/Director auto-approval behavior | None | Unchanged; min/max validation is orthogonal to approval flow |

---

## BUG 0220-52 Regression Fix: Restore Internal Engagements in Manual Entry

**Plan**: BUG-0220-52-regression-hardening-v2
**Related Bug**: 0220-52

### Problem

The BUG 0220-52 stopwatch fix added `.eq("is_internal", false)` filters to `useApprovedEngagements` to prevent internal engagements from appearing in the stopwatch. However, `ManualEntryDialog` also consumed `useApprovedEngagements`, causing internal/ADMIN engagements (e.g., ADM, Feriados) to disappear from the manual entry dropdown. Manual entry is the only way to record time against internal/admin jobs in the tracker, making this a regression.

### Root Cause

`ManualEntryDialog` (line 74) called `useApprovedEngagements()`, which hard-filters `.eq("is_internal", false)` on both Group A (approved WO engagements, line 32) and Group B (no-WO-required engagements, line 55). The Group B non-admin `.or()` clause also no longer included `is_internal.eq.true`.

### Fix Details

#### Created `src/hooks/useManualEntryEngagements.ts`

- Dedicated hook with query key `["engagements-for-manual-entry"]` (no cache coupling with `useApprovedEngagements`).
- Mirrors the structure of `useApprovedEngagements` but omits all `.eq("is_internal", false)` filters.
- Group B non-admin `.or()` clause includes `is_internal.eq.true`, restoring pre-0220-52 behavior for manual entry.

#### Modified `src/components/tracker/ManualEntryDialog.tsx`

- Line 31: Replaced `import { useApprovedEngagements }` with `import { useManualEntryEngagements }`.
- Line 74: Replaced `useApprovedEngagements()` call with `useManualEntryEngagements()`.
- Existing stale-engagement guard on line 148 (`if (!engagements.some(...))`) continues to work against the new list.

#### Build Fix: `src/pages/__tests__/TimeSheet.submit-guards.test.tsx`

- Line 4: Replaced non-existent `TestWrapper` import with project-standard `render` from `@/test/utils`.
- Lines 44-48: Replaced `<TestWrapper><TimeSheet /></TestWrapper>` with `customRender(<TimeSheet />)`.

### Unchanged

- `src/hooks/useApprovedEngagements.ts` — tracker-specific, `is_internal = false` filters intact.
- `src/components/tracker/TrackerBar.tsx` — still uses `useApprovedEngagements`.
- Timesheet grid — separate data path (`useTimesheetWeek`).
- No database migrations or RPC changes.

### Files Modified

| File | Lines | Change |
|---|---|---|
| `src/hooks/useManualEntryEngagements.ts` | Full file (create) | Dedicated hook omitting `is_internal` filter; separate query key |
| `src/components/tracker/ManualEntryDialog.tsx` | 31, 74 | Swap hook import and call |
| `src/pages/__tests__/TimeSheet.submit-guards.test.tsx` | 4, 44-48 | Fix build error: replace `TestWrapper` with project `render` |

---

## Enhancement: Searchable Engagement Selector with Unified Display

**Plan**: BUG-0220-52-followup-search-display-v3

### Changes

- Created reusable `EngagementCombobox` component (`src/components/tracker/EngagementCombobox.tsx`) using existing `Popover` + `Command` (cmdk) UI primitives. The component accepts an array of engagements and renders a searchable dropdown with `CommandInput` for filtering and `CommandItem` for each engagement. Props: `engagements`, `value`, `onValueChange`, `disabled`, `placeholder`.
- Integrated `EngagementCombobox` into Stopwatch (`TrackerBar.tsx` lines 91-123), replacing the basic `Select` engagement dropdown. Activity selector remains as `Select`.
- Integrated `EngagementCombobox` into Manual Entry (`ManualEntryDialog.tsx` lines 270-292), replacing the basic `Select` engagement dropdown. This fixes the display format from `engagement_code || engagement_name` (showing only one) to the unified `CODE - Name` format (showing both). Activity selector remains as `Select`.
- Both selectors now support case-insensitive partial matching by engagement code or engagement name via cmdk's built-in filtering. The `CommandItem` value is set to `"code name"` string which cmdk filters against.
- Display format: `CODE - Name` with bold code (`font-medium`) and muted name text (`text-muted-foreground`). Falls back to Name only when code is null/missing.
- Trigger button shows selected engagement as `CODE - Name` or the placeholder text, with `ChevronsUpDown` icon. Selected item shows `Check` icon.
- Popover width matches trigger width via `w-[--radix-popover-trigger-width]`.
- Stopwatch eligibility unchanged: continues using `useApprovedEngagements` (excludes internal engagements).
- Manual Entry eligibility unchanged: continues using `useManualEntryEngagements` (includes internal/ADMIN engagements).
- Activity auto-assignment logic preserved in both selectors (auto-assigns ADM activity for engagements where `activity_required` is false).
- Disabled state during running timer preserved in Stopwatch via `disabled={isRunning}`.
- Added i18n keys `tracker.searchEngagement` (EN: "Search engagement...", ES: "Buscar encargo...") and `tracker.noMatchingEngagements` (EN: "No matching engagements.", ES: "No se encontraron encargos.").
- No database or RPC changes.
