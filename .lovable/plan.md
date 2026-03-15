

# Plan — Fix CI Guard Failure: UTC date parsing in CarteraTab

## Problem

The CI "Guard against UTC date parsing on date-only fields" step fails because `CarteraTab.tsx` line 500 uses `new Date(approval.week_start_date)` instead of `parseDateLocal()`. This is the exact bug pattern (BUG 0220-59) the guard exists to catch.

## Fix

**File: `src/components/dashboard/tabs/CarteraTab.tsx` (line 500)**

Replace:
```tsx
{new Date(approval.week_start_date).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })}
```

With:
```tsx
{parseDateLocal(approval.week_start_date).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })}
```

Add `parseDateLocal` to the existing imports from `@/lib/timesheetUtils` at the top of the file (if not already imported).

One line change + one import update. No other files affected.

