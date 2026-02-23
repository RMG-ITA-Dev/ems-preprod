

# Plan: Three Timesheet UI Fixes v4

**Plan ID:** Plan_Timesheet_Three_Fixes_v4
**Task ID:** TIMESHEET_THREE_FIXES

---

## What Was Added (vs. v3)

| ID | Addition |
|---|---|
| ADD-1 | Fixed daily target rule: at-target is exactly 8.0h (not proportional to dailyLimit). Precision-safe comparison required. Future workday policy changes require a separate change request. |
| ADD-2 | Test-separation rule: fiscal-week algorithm tests stay in `src/lib/__tests__/fiscalCalculations.test.ts`; UI behavior tests (CURRENT no-tint, daily totals styling) are manual-only since component test files for WeekNavigator and TimesheetGrid do not exist. |

## What Was Changed (vs. v3)

| ID | From | To |
|---|---|---|
| CHG-1 | `dailyTarget = dailyLimit * 0.8` | `dailyTarget = 8.0` (fixed business constant), precision-safe comparison |
| CHG-2 | CURRENT no-tint and daily totals tests in `src/lib/__tests__/timesheetUtils.test.ts` | Fiscal-week tests in utility test file; UI behavior checks are manual-only |
| CHG-3 | General AC-6 | Explicit: exactly 8.0h triggers green+dark style regardless of DAILY_LIMIT setting |

## What Was Removed (vs. v3)

| ID | Removal |
|---|---|
| DEL-1 | All references defining at-target as `dailyLimit * 0.8` or proportional |
| DEL-2 | All statements placing UI/component behavior tests inside utility test files |

---

## ISSUE 1: Fiscal Week Numbering

### Algorithm

1. **Fiscal year pivot (`getFiscalYearForDate`):** If date's month index >= 9 (October+), fiscal year = `date.year + 1`; otherwise fiscal year = `date.year`.

2. **Week 1 anchor (`getFiscalWeekOneMonday`):** Start with October 1 of `fiscalYear - 1`. If Oct 1 is Saturday, shift to Oct 3 (Monday). If Oct 1 is Sunday, shift to Oct 2 (Monday). Otherwise use Oct 1 as-is. Then get the Monday of the week containing that anchor date (`startOfWeek` with `weekStartsOn: 1`).

3. **Week number (`getFiscalWeekNumber`):** Get the Monday of the input date's week. Compute `daysDiff = (inputMonday - anchorMonday) / msPerDay`. If `daysDiff < 0`, the date falls before the current FY anchor -- pivot to the previous fiscal year (`fiscalYear - 1`), recompute the anchor, and recalculate. Result = `Math.floor(daysDiff / 7) + 1`.

### Algorithm Invariants

- **INV-1:** `getFiscalWeekNumber` always returns an integer >= 1 for any valid date.
- **INV-2:** Dates before the current FY Week 1 Monday automatically pivot to the previous FY anchor.
- **INV-3:** The fiscal week function is the single source of truth for all week numbering across display, period creation, and import.

### Boundary Rules

| Oct 1 Day | Anchor | Week 1 Monday | Week 1 Range |
|---|---|---|---|
| Oct 1, 2025 (Wed) | Oct 1 | Sep 29, 2025 | Sep 29 - Oct 3 |
| Oct 1, 2028 (Sun) | Shifts to Oct 2 | Oct 2, 2028 | Oct 2 - Oct 6 |
| Oct 1, 2033 (Sat) | Shifts to Oct 3 | Oct 3, 2033 | Oct 3 - Oct 7 |

### Pre-Anchor Pivot Example

Sep 28, 2025 (Sunday) belongs to FY2025 by pivot rule (month = Sep = index 8, so FY = 2025). FY2025 anchor: Oct 1, 2024 (Tuesday), Week 1 Monday = Sep 30, 2024. Sep 28, 2025 Monday = Sep 22, 2025. daysDiff = 357. Week = floor(357/7) + 1 = 52. Valid positive number.

### Worked Examples

| Date | FY | Anchor Monday | Days | Week |
|---|---|---|---|---|
| Sep 29, 2025 | 2026 | Sep 29, 2025 | 0 | 1 |
| Oct 1, 2025 | 2026 | Sep 29, 2025 | 2 | 1 |
| Oct 6, 2025 | 2026 | Sep 29, 2025 | 7 | 2 |
| Feb 9, 2026 | 2026 | Sep 29, 2025 | 133 | 20 |
| Feb 16, 2026 | 2026 | Sep 29, 2025 | 140 | 21 |

### Function Signatures (description only)

- `getFiscalYearForDate(date: Date): number` -- Returns fiscal year using October pivot.
- `getFiscalWeekOneMonday(fiscalYear: number): Date` -- Returns Monday starting fiscal Week 1, with Saturday/Sunday adjustment.
- `getFiscalWeekNumber(date: Date): number` -- Computes fiscal week number; pivots to prior FY if needed. Always returns >= 1.

### Compatibility Note

Existing `timesheet_periods.week_number` values in the database were computed using ISO week or manual January-based formula. This plan does NOT migrate historical values. Going forward, newly created/imported periods use the fiscal formula. Historical values remain as-is -- `week_number` is informational metadata; period lookup is by `staff_id + week_start_date`.

### Rollout Safety

No destructive data updates.

---

## ISSUE 2: Remove "Semana actual" Calendar Coloring

### CURRENT Status Rule

**CURRENT status must receive NO calendar tint.** The CURRENT status branch must be an explicit no-op skip -- it must NOT fall through to `notReported` or any other colored bucket.

### Exact Removals in `src/components/timesheet/WeekNavigator.tsx`

1. **Groups object (~lines 108-110):** Remove `currentWeekStart: []` and `currentWeek: []` entries.

2. **CURRENT status branch (~lines 131-134):** Replace with explicit skip: `else if (status === "CURRENT") { return; }` -- no fall-through.

3. **Modifiers return (~lines 144-145):** Remove `currentWeekStart` and `currentWeek` from modifiers object.

4. **modifiersClassNames (~lines 152-153):** Remove `currentWeekStart` and `currentWeek` entries.

5. **Legend markup (~lines 252-255):** Remove the "Semana actual" legend span (purple dot + label).

### What Remains Unchanged

- Today's cell styling (`day_today`) -- unaffected.
- Selected day primary highlight -- unaffected.
- All other status tints (approved/green, pending/yellow, rejected, notReported/red) -- unaffected.
- Month navigation and date selection -- unaffected.

---

## ISSUE 3: Daily Totals at-Target Styling

### Business Rule (Fixed 8.0h Target)

The daily "at target" threshold is **fixed at 8.0 hours** -- it represents a standard full workday. This value is NOT derived from `dailyLimit` (which is the overwork warning threshold, typically 10h). If the firm's standard workday policy changes in the future, updating this constant will be a separate change request.

### Style Precedence (Explicit)

| Priority | Condition | Classes | Visual |
|---|---|---|---|
| 1 (highest) | `overLimit`: total > dailyLimit | `text-destructive bg-destructive/10` | Red bg, red text (UNCHANGED) |
| 2 | `atTarget`: total rounds to 8.0h | `text-foreground bg-success/15` | Light green bg, dark/black text (NEW) |
| 3 | `nearLimit` and NOT `atTarget` | `text-warning-foreground bg-warning/10` | Yellow/warning (UNCHANGED logic) |
| 4 (default) | None of the above | No special classes | Default styling (UNCHANGED) |

### Precision-Safe Comparison

`Math.round(total * 100) === Math.round(8.0 * 100)` (i.e., `=== 800`)

This handles floating-point edge cases. The constant `8.0` can be extracted as `DAILY_TARGET_HOURS = 8` for clarity.

### Implementation Location

In `src/components/timesheet/TimesheetGrid.tsx`, Totals Row (lines 851-871):
- Define `const DAILY_TARGET_HOURS = 8;`
- Add `atTarget` check using precision-safe comparison against `DAILY_TARGET_HOURS`.
- Update `cn()` class list: overLimit first, then atTarget, then nearLimit.

### Future-Proofing Note

If the standard workday changes from 8h, update the `DAILY_TARGET_HOURS` constant. This is intentionally separate from `dailyLimit` which controls overwork warnings.

---

## File-by-File Plan

### 1. `src/lib/fiscalCalculations.ts`

Add three new exported functions: `getFiscalYearForDate`, `getFiscalWeekOneMonday`, `getFiscalWeekNumber`. No existing functions modified or removed.

### 2. `src/lib/timesheetUtils.ts`

In `getWeekInfo()` (~line 56): replace `getISOWeek(weekStartDate)` with `getFiscalWeekNumber(weekStartDate)`. Import from `fiscalCalculations.ts`. Remove `getISOWeek` import from date-fns if no longer used in this file.

### 3. `src/hooks/useTimesheetWeek.ts`

Lines 91-94: Replace manual `Math.ceil(...)` week calculation with `getFiscalWeekNumber(weekStartDate)`. Import from `@/lib/fiscalCalculations`.

### 4. `src/hooks/useTimesheetImport.ts`

Line 117: Replace `getISOWeek(weekDate)` with `getFiscalWeekNumber(weekDate)`. Update imports.

### 5. `src/components/timesheet/WeekNavigator.tsx`

Remove all CURRENT week tinting (5 deletion points listed above). Add explicit `return` for CURRENT status.

### 6. `src/components/timesheet/TimesheetGrid.tsx`

In Totals Row (lines 851-871): define `DAILY_TARGET_HOURS = 8`, add precision-safe `atTarget` check, update `cn()` with 4-level precedence.

### 7. `docs/CHANGELOG-2026-02-22.md`

Append implementation entry documenting all three fixes with exact file paths, before/after descriptions, and risk assessment.

---

## Test Strategy (by File Type)

### Utility Tests: `src/lib/__tests__/fiscalCalculations.test.ts` (new file)

Fiscal week algorithm tests only. No UI behavior tests here.

| Test Case | Input | Expected FY | Expected Week | Validates |
|---|---|---|---|---|
| Oct 1, 2025 (Wed) -- in Week 1 | 2025-10-01 | 2026 | 1 | AC-1 |
| Sep 29, 2025 (Mon) -- Week 1 Monday | 2025-09-29 | 2026 | 1 | AC-1 |
| Oct 6, 2025 (Mon) | 2025-10-06 | 2026 | 2 | AC-1 |
| Feb 9, 2026 (Mon) | 2026-02-09 | 2026 | 20 | AC-2 |
| Feb 16, 2026 (Mon) | 2026-02-16 | 2026 | 21 | AC-2 |
| Sep 28, 2026 (Mon) -- last week FY2026 | 2026-09-28 | 2026 | 53 | AC-1 |
| Oct 1, 2028 (Sun) -- shifts to Oct 2 | 2028-10-02 | 2029 | 1 | AC-1 |
| Oct 1, 2033 (Sat) -- shifts to Oct 3 | 2033-10-03 | 2034 | 1 | AC-1 |
| Pre-anchor pivot (Sep 28, 2025 Sun) | 2025-09-28 | 2025 | 52 | AC-3 |
| Invariant: all cases return >= 1 | all above | -- | >= 1 | AC-3 |

### UI Behavior Tests: Manual-Only

Component test files for `WeekNavigator` and `TimesheetGrid` do not exist in the project. The following checks are manual-only (included in the Manual Test Matrix below):

- CURRENT status produces no tint class in calendar (AC-4)
- "Semana actual" legend item absent (AC-5)
- Daily totals at 8.0h: light green bg + dark text (AC-6)
- Daily totals over limit: red styling unchanged (AC-7)

### Regression Guards

| Existing Behavior | Guard |
|---|---|
| `getWeekMonday` returns correct Monday | No change to function; existing tests remain |
| Calendar month navigation | No change to `displayedMonth` / `onMonthChange` logic |
| Today cell stays grey | `isSameDay(day, today) return` guard untouched |
| Selected day primary highlight | CSS rule untouched |
| Over-limit red styling | `overLimit` check remains highest priority |
| Weekend cells untinted | `day.getDay() === 0 || day.getDay() === 6` guard untouched |

---

## Files Summary

| File | Change |
|---|---|
| `src/lib/fiscalCalculations.ts` | Add `getFiscalYearForDate`, `getFiscalWeekOneMonday`, `getFiscalWeekNumber` |
| `src/lib/timesheetUtils.ts` | Use `getFiscalWeekNumber` in `getWeekInfo()` |
| `src/hooks/useTimesheetWeek.ts` | Use `getFiscalWeekNumber` for period creation |
| `src/hooks/useTimesheetImport.ts` | Use `getFiscalWeekNumber` for import |
| `src/components/timesheet/WeekNavigator.tsx` | Remove CURRENT tint (explicit no-op skip) + remove legend entry |
| `src/components/timesheet/TimesheetGrid.tsx` | Add at-target green styling with fixed 8.0h constant and precision-safe check |
| `src/lib/__tests__/fiscalCalculations.test.ts` | New file: fiscal week algorithm unit tests |
| `docs/CHANGELOG-2026-02-22.md` | Append implementation entry documenting all three fixes |

## Files NOT Modified

- No database migrations
- No approval workflow files
- No unrelated modules

---

## Acceptance Criteria

| AC | Criterion | Verification |
|---|---|---|
| AC-1 | Fiscal week display follows Oct-1 rule with weekend shift | Unit tests for Oct boundary dates pass |
| AC-2 | 2026-02-09 displays Week 20; 2026-02-16 displays Week 21 | Unit tests + navigate in UI |
| AC-3 | Fiscal week function returns >= 1 for all tested dates including pre-anchor pivot | Unit test asserts >= 1 on all cases |
| AC-4 | CURRENT status applies no tint class in calendar | Manual: open calendar on current week, no purple tint |
| AC-5 | "Semana actual" legend item removed | Manual: open calendar popover, verify 4 legend items |
| AC-6 | Daily totals exactly 8.0h renders light green bg + dark readable text, regardless of DAILY_LIMIT | Manual: log 8h on a day, verify styling |
| AC-7 | Over-limit red behavior unchanged | Manual: log 11h, verify red styling |
| AC-8 | No regression in Monday selection, month navigation, today/selected precedence | Manual: navigate weeks, select dates |

---

## Manual Test Matrix

| Case | Expected | Validates |
|---|---|---|
| Navigate to Feb 9, 2026 week | Displays "Semana 20" | AC-1, AC-2 |
| Navigate to Feb 16, 2026 week | Displays "Semana 21" | AC-1, AC-2 |
| Navigate to Oct 1, 2025 week | Displays "Semana 1" | AC-1 |
| Open calendar popover on current week | No purple tint on any day | AC-4 |
| Check calendar legend | 4 items: Approved, Pending, Rejected, Not Reported | AC-5 |
| Log exactly 8h on one day | Light green bg, dark readable numbers | AC-6 |
| Log 11h on one day | Red bg, red text | AC-7 |
| Log 9h on one day | Yellow/warning style | AC-7 |
| Click different dates in calendar | Correct Monday selected, navigation works | AC-8 |
| Check today cell in calendar | Grey highlight (unchanged) | AC-8 |

---

## Documentation

Implementation will be documented by appending a detailed entry to `docs/CHANGELOG-2026-02-22.md` covering all three fixes with exact file paths, before/after descriptions, and risk assessment.

---

**Implementation requires explicit Sergio approval after this plan review.**

