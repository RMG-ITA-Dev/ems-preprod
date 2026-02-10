

# Bug #3 Fix: Action Buttons Unavailable on Non-Current Weeks

## Problem

The "Copiar Semana Anterior", "Retirar Envio", and "Guardar Borrador" buttons are gated by `isCurrentWeek`, making them disappear on any past or future week -- even when business rules say they should be available.

## Root Cause

Two variables use `isCurrentWeek` as a hard gate:
- **`isEditable`** (line 128-131): The submitted-correction branch requires `isCurrentWeek`
- **`canUnsubmit`** (line 134): Requires `isCurrentWeek`

Since these gate all three buttons, navigating away from the current week hides them entirely.

## Fix (single file: `src/pages/TimeSheet.tsx`)

### Step 1: Add `isWithinEditableWindow` flag (after line 114)

Replace the hard `isCurrentWeek` gate with a policy-driven retro window check using the existing `employeeRetroDays` policy (default 30 days).

```typescript
const isFutureWeek = useMemo(() => {
  const today = getWeekMonday(new Date());
  return currentWeekStart.getTime() > today.getTime();
}, [currentWeekStart]);

const isWithinEditableWindow = useMemo(() => {
  if (isCurrentWeek || isFutureWeek) return true;
  const retroDays = policies?.employeeRetroDays ?? 30;
  const today = new Date();
  const weekEnd = weekInfo.weekDates[weekInfo.weekDates.length - 1];
  const daysSinceWeekEnd = Math.floor(
    (today.getTime() - weekEnd.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceWeekEnd <= retroDays;
}, [isCurrentWeek, isFutureWeek, currentWeekStart, policies?.employeeRetroDays, weekInfo.weekDates]);
```

### Step 2: Update `isEditable` (line 128-131)

Remove `isCurrentWeek` from the submitted-correction branch; add `isWithinEditableWindow` as the outer guard.

```typescript
const isEditable = !isBeforeHireDate && isWithinEditableWindow && (
  (!isSubmitted && !period?.is_period_locked) || 
  (isSubmitted && !isFullyApproved && (hasPendingLines || hasRejectedLines))
);
```

### Step 3: Update `canUnsubmit` (line 134)

Replace `isCurrentWeek` with `isWithinEditableWindow`.

```typescript
const canUnsubmit = isSubmitted && hasPendingLines && !isFullyApproved && isWithinEditableWindow;
```

### Step 4: Refine "Copy Previous Week" button visibility (~line 321)

Add `!isSubmitted` condition so it only shows on draft (unsubmitted) weeks -- copying structure into an already-submitted week makes no sense.

```tsx
{isEditable && !isSubmitted && (
  <Button ...>
    <Copy /> {t("timesheet.copyPreviousWeek")}
  </Button>
)}
```

## Business Rules After Fix

| Button | Available When |
|--------|---------------|
| Copy Previous Week | Week is editable AND not yet submitted |
| Save Draft | Week is editable (within retro window, not locked, not before hire date) |
| Unsubmit | Week is submitted, has pending lines, not fully approved, within retro window |
| Submit | Week is editable and has entries |

## What Does NOT Change

- No database changes
- No new dependencies or files
- `isCurrentWeek` kept for informational use (no removal)
- All other timesheet logic untouched

