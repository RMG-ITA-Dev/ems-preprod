

## Add Changelog Entry for BUG #0213-25

Append a new section to `docs/CHANGELOG-2026-02-13.md` following the established format used by previous bug entries in the file.

### Entry to append after line 258 (end of file)

```markdown
---

## BUG #0213-25: Submitted Timesheet Remains Editable

**Date:** 2026-02-16
**Priority:** Alta
**Version:** v2.0.4
**Route:** OPERACIONES - Hoja de Tiempo

### Problem

After submitting a weekly timesheet for approval, the entire grid remained
fully editable: hour cells accepted input, engagement/activity dropdowns
were active, "Agregar Fila" and delete icons were visible, and autosave
continued to fire. The banner correctly showed "pendiente de aprobacion"
but nothing was actually locked.

### Root Cause

In `src/pages/TimeSheet.tsx`, the `isEditable` flag included a second
branch that re-enabled editing whenever the week was submitted but had
pending or rejected lines:

    (isSubmitted && !isFullyApproved && (hasPendingLines || hasRejectedLines))

Since every freshly submitted week has pending lines, the grid was never
locked after submission. Additionally, `canSaveDraft` did not guard on
`!isSubmitted`, and `canSubmit` allowed re-submission while already
submitted (for rejected lines), bypassing the recall workflow.

### Solution

Implemented strict locking: once submitted, the timesheet is fully
read-only. Corrections (including rejected lines) require the user to
click "Retirar Envio" (unsubmit) first, edit, then re-submit. Added
defensive `!isFullyApproved` guards alongside `!isSubmitted` for
belt-and-suspenders safety against data anomalies.

### Changes -- `src/pages/TimeSheet.tsx`

| Change | Detail |
|--------|--------|
| **`isEditable`** | Replaced two-branch OR with flat AND: `!isBeforeHireDate && isWithinEditableWindow && !isSubmitted && !isFullyApproved && !period?.is_period_locked` |
| **`canSaveDraft`** | Added `!isSubmitted` and kept `!isFullyApproved`; reordered conditions |
| **`canSubmit`** | Removed branch allowing re-submit while submitted with rejected lines; now requires `!isSubmitted && !period?.is_period_locked` |

### What Stays Unchanged

- `canUnsubmit` -- already correct (shows "Retirar Envio" when submitted + not fully approved)
- `TimesheetGrid.tsx` -- already respects `isLocked={!isEditable}` globally
- Import-from-timer and Copy Previous Week buttons -- already gated on `isEditable` or `!isSubmitted`
- No backend/database changes
- No mutation logic changes

### Risk Assessment

- **Low risk** -- removes permissive branches only; no new state or data paths.
- Autosave cannot fire when inputs are disabled via `isLocked`.
- Users with rejected lines must use "Retirar Envio" before editing, which matches audit integrity expectations.
```

### Files Modified

| File | Change |
|------|--------|
| `docs/CHANGELOG-2026-02-13.md` | Append BUG #0213-25 section at end of file |

