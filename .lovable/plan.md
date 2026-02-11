

# Bug #21: Prevent Re-submission of Already Submitted Timesheet

## Problem

The "Enviar Semana" button stays active after a week is submitted and pending approval. Clicking it again overwrites the `submitted_at` timestamp and could reset approval statuses. The root cause: `isEditable` (which controls grid cell editing) is also used to gate the Submit button -- these are two different concerns.

## Fix

### 1. Add `canSubmit` flag (`src/pages/TimeSheet.tsx`, after line 171)

A new flag separates "can submit" from "can edit cells":

```
canSubmit = !isBeforeHireDate && isWithinEditableWindow && entries.length > 0 && (
  (!isSubmitted && !period?.is_period_locked) ||
  (isSubmitted && hasRejectedLines && !isFullyApproved)
)
```

- Fresh (unsubmitted) week with entries: can submit
- Submitted with pending lines: CANNOT submit (this is the fix)
- Submitted with rejected lines: CAN resubmit (after corrections)
- Fully approved: cannot submit

### 2. Update Submit button (lines 407-416)

- Conditionally render with `{canSubmit && (...)}` instead of always showing
- Use `canSubmit`-based disabled logic (only `submitTimesheet.isPending`)
- Change label to "Resubmit Week" when resubmitting after rejections

### 3. Locale strings

| Key | en | es |
|-----|----|----|
| `timesheet.resubmitWeek` | Resubmit Week | Reenviar Semana |

## Files Modified

| File | Change |
|------|--------|
| `src/pages/TimeSheet.tsx` | Add `canSubmit` flag; conditionally render Submit button using it; dynamic label for resubmit |
| `src/locales/en.json` | Add `timesheet.resubmitWeek` |
| `src/locales/es.json` | Add `timesheet.resubmitWeek` |

## What stays unchanged

- `isEditable` remains as-is -- it correctly controls grid cell editing for correction scenarios
- `canUnsubmit` remains as-is -- allows withdrawing a submitted week
- Copy Previous Week and Save Draft buttons continue using `isEditable`

