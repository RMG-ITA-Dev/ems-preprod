

# Bug #5 Fix: Hire Date Control for Timesheets

## Problem

Users can navigate to and log hours in weeks before their hire/incorporation date. While a `hire_date` column exists in the database and a basic `isBeforeHireDate` check exists in `TimeSheet.tsx`, two gaps remain:
1. **No UI to set hire_date**: The StaffForm has no date picker for admins to enter the hire date
2. **No per-day cell locking**: When a hire date falls mid-week (e.g., Wednesday), Monday/Tuesday cells should be locked but currently the entire week is either fully blocked or fully open
3. **No navigation restriction**: Users can freely browse to weeks before their hire date

## Changes

### 1. StaffForm -- Add hire_date field (`src/components/forms/StaffForm.tsx`)

- Add `hire_date: z.string().optional().or(z.literal(""))` to the Zod schema
- Add the field to `defaultValues` and `form.reset()` in the edit path
- Add the field to the `onSubmit` payload
- Render a date `<Input type="date">` in the Personal Info section (alongside city/id_number)

### 2. StaffFull interface -- Add hire_date (`src/hooks/useEmsData.ts`)

- Add `hire_date: string | null` to `StaffFull` so the form can read/write it

### 3. TimeSheet -- Per-day locking (`src/pages/TimeSheet.tsx`)

- Add a `lockedDaysBeforeHire` Set computed via `useMemo`: for each day in `weekInfo.weekDates`, check if it's before the hire date
- Pass this set down to `TimesheetGrid`

### 4. TimesheetGrid -- Accept and apply per-day lock (`src/components/timesheet/TimesheetGrid.tsx`)

- Add `lockedDaysBeforeHire?: Set<number>` prop
- In the cell rendering loop (~line 481), add day-index check to `isDisabled`: `isLocked || lockedDaysBeforeHire?.has(dayIndex) || !row.engagementId || !row.activityId`
- Add visual indicator (muted background) for pre-hire locked cells

### 5. WeekNavigator -- Restrict backward navigation (`src/components/timesheet/WeekNavigator.tsx`)

- Add optional `earliestWeekStart?: Date` prop
- Disable the "Previous" button when `currentWeekStart <= earliestWeekStart`
- Add `fromDate` prop to the Calendar picker to prevent selecting dates before hire date

### 6. Translations (`src/locales/en.json`, `src/locales/es.json`)

- Add `"hireDate": "Hire Date"` / `"Fecha de Ingreso"` and help text under the `staff` namespace

## Technical Details

**Per-day locking logic (TimeSheet.tsx):**
```typescript
const lockedDaysBeforeHire = useMemo(() => {
  if (!staffRecord?.hire_date) return new Set<number>();
  const hireDate = parseISO(staffRecord.hire_date);
  const locked = new Set<number>();
  weekInfo.weekDates.forEach((date, index) => {
    if (isBefore(startOfDay(date), startOfDay(hireDate))) {
      locked.add(index);
    }
  });
  return locked;
}, [staffRecord?.hire_date, weekInfo.weekDates]);
```

**Navigation restriction (WeekNavigator.tsx):**
```typescript
const canGoPrevious = !earliestWeekStart || 
  currentWeekStart.getTime() > earliestWeekStart.getTime();
```
The calendar picker gets `fromDate={earliestWeekStart}` to grey out earlier dates.

**No database migration needed** -- the `hire_date` column already exists in the `staff` table.

## Files Modified

| File | Change |
|------|--------|
| `src/components/forms/StaffForm.tsx` | Add hire_date date picker field |
| `src/hooks/useEmsData.ts` | Add `hire_date` to `StaffFull` interface |
| `src/pages/TimeSheet.tsx` | Add `lockedDaysBeforeHire` set, pass to grid and navigator |
| `src/components/timesheet/TimesheetGrid.tsx` | Accept and apply per-day cell locking |
| `src/components/timesheet/WeekNavigator.tsx` | Add `earliestWeekStart` prop, restrict navigation |
| `src/locales/en.json` | Add hire date translations |
| `src/locales/es.json` | Add hire date translations |

## What Does NOT Change

- Database schema (column already exists)
- The existing `isBeforeHireDate` whole-week block continues to work
- Staff with no hire_date set have no restrictions (backward compatible)
