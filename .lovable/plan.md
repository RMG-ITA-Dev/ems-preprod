# BUG: Holiday Proration Incorrectly Reduces Weekly Max

## Root Cause

The `getEffectiveWeeklyLimits()` function (line 215 of `timesheetUtils.ts`) treats holidays as non-workable days, subtracting them from the workable count. This reduces weekly min/max proportionally (e.g., 1 holiday in a 5-day week → 4/5 × 40 = 32h max).

**But this is wrong.** Staff are required to log 8h on holidays against the Holiday engagement (ADM_01 Feriado). Holidays are still full work days from a timesheet capacity perspective — they just restrict which engagement can be used. The proration was designed for mid-week hires and terminations, not holidays.

In your case: week 30/03-03/04 has Viernes Santo on 03/04. The system calculates 4 workable days × 8h = 32h max, but you correctly logged 40h (including 8h on the holiday engagement).

The same bug exists in the backend `submit_timesheet_safe()` RPC, which mirrors this proration logic.

## Fix

**Remove holidays from the proration calculation.** Holidays should only be subtracted from workable days for the purpose of proration when the staff member literally cannot log time (hire/termination). Holidays already have their own enforcement mechanism (the holiday-blocking trigger restricts entries to the holiday engagement).

### Frontend: `src/lib/timesheetUtils.ts`

Remove line 215 (`if (holidayDates.has(...)) continue;`) from `getEffectiveWeeklyLimits()`. The function signature keeps the `holidayDates` parameter for backward compatibility but stops using it for the workable-day count.

### Frontend: `src/pages/TimeSheet.tsx`

No changes needed — it already passes `holidayDateSet` to the function; the function just stops subtracting holidays.

### Backend: `submit_timesheet_safe()` migration

Update the proration block in `submit_timesheet_safe()` to stop subtracting holidays from the workable day count. The holiday count subtraction line in the RPC must be removed or set to zero.

### Tests: `src/lib/__tests__/timesheetUtils.test.ts`

Update the "holiday subtraction" and "hire+holiday combination" test cases to reflect that holidays no longer reduce workable days.

### Changelog

Append entry to `docs/changelogs/CHANGELOG-2026-04-01.md`.

## Files Summary


| Action    | File                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| Edit      | `src/lib/timesheetUtils.ts` — remove holiday subtraction from proration       |
| Migration | `submit_timesheet_safe()` — remove holiday subtraction from backend proration |
| Edit      | `src/lib/__tests__/timesheetUtils.test.ts` — update affected test cases       |
| Append    | `docs/changelogs/CHANGELOG-2026-04-01.md`                                     |


## What is NOT changed

- Holiday-blocking trigger (still enforces holiday engagement restriction)
- Hire/termination proration (still works correctly)
- Daily min/max validation
- Approval workflow
- Any UI layout or styling

**Changelog Append**

**File:** docs/changelogs/[CHANGELOG-2026-04-01.md](http://CHANGELOG-2026-04-01.md)

You need to append to the CHANGELOG a detailed description of the changes made while implementing this Plan. There needs to be sufficient detail to be able to verify if the changes to the codebase correspond to the CHANGELOG.