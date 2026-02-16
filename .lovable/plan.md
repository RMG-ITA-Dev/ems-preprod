

# v3 Plan -- Bug 0213-25: Strict Locking of Submitted Timesheets

## Summary

Same strict-locking strategy as v2, with CODEX's recommended defensive improvement: keep `!isFullyApproved` alongside `!isSubmitted` in all three flags for belt-and-suspenders safety.

## File: `src/pages/TimeSheet.tsx` (only file changed)

### Change 1: `isEditable` (lines 197-200)

BEFORE:
```typescript
const isEditable = !isBeforeHireDate && isWithinEditableWindow && (
  (!isSubmitted && !period?.is_period_locked) || 
  (isSubmitted && !isFullyApproved && (hasPendingLines || hasRejectedLines))
);
```

AFTER:
```typescript
const isEditable = !isBeforeHireDate && isWithinEditableWindow &&
  !isSubmitted && !isFullyApproved && !period?.is_period_locked;
```

### Change 2: `canSaveDraft` (lines 216-220)

BEFORE:
```typescript
const canSaveDraft = !isBeforeHireDate
  && isWithinEditableWindow
  && !period?.is_period_locked
  && !isFullyApproved
  && hasNonZeroEntry;
```

AFTER:
```typescript
const canSaveDraft = !isBeforeHireDate
  && isWithinEditableWindow
  && !isSubmitted
  && !isFullyApproved
  && !period?.is_period_locked
  && hasNonZeroEntry;
```

### Change 3: `canSubmit` (lines 223-226)

BEFORE:
```typescript
const canSubmit = !isBeforeHireDate && isWithinEditableWindow && entries.length > 0 && (
  (!isSubmitted && !period?.is_period_locked) ||
  (isSubmitted && hasRejectedLines && !isFullyApproved)
);
```

AFTER:
```typescript
const canSubmit = !isBeforeHireDate && isWithinEditableWindow && entries.length > 0 &&
  !isSubmitted && !period?.is_period_locked;
```

## Why `!isFullyApproved` is kept (CODEX improvement)

- Logically, `isFullyApproved` implies `isSubmitted`, so `!isFullyApproved` should be redundant when `!isSubmitted` is present.
- However, keeping it is zero-cost defensive coding: if a data anomaly ever produces a period that is fully approved but has `submitted_at = null`, the extra guard prevents editing an approved week.
- Applied to `isEditable` and `canSaveDraft`. Not needed on `canSubmit` since submitting an already-approved week makes no sense and `entries.length > 0` plus UI flow already prevent it.

## No other files need changes

- `TimesheetGrid.tsx` already respects `isLocked` globally (inputs, selects, add/delete row all disabled).
- Import-from-timer, Copy Previous Week buttons are already gated on `isEditable` or `!isSubmitted`.
- `canUnsubmit` (lines 211-214) is already correct and unchanged.
- Autosave cannot fire when inputs are disabled.

## Manual Acceptance Tests

**Test 1: Submitted week is read-only**
1. Open a draft week with entries. Verify cells are editable.
2. Click "Enviar Semana". Verify banner shows pending approval.
3. Verify: hour cells locked, dropdowns disabled, Add Row hidden, delete icons hidden, Save Draft hidden, Submit hidden, no "Guardando..." appears.

**Test 2: Retirar Envio restores editing**
1. On submitted week, click "Retirar Envio".
2. Verify week becomes editable again. Edit a value, re-submit, verify it locks.

**Test 3: Rejected lines still require recall**
1. Have approver reject a line. As staff, open that week.
2. Verify week is still read-only despite rejection.
3. Click "Retirar Envio", edit, re-submit. Verify it locks again.

