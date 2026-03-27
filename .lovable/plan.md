

# Plan — Append Changelog Entry for "Allow Deleting the Last Timesheet Row"

## What

Prepend a new section to `docs/changelogs/CHANGELOG-2026-03-27.md` (after the title line, before the existing "Delete All Week Entries" section) documenting the Plan v5 fix.

## Content to Insert

After line 1 (`# Changelog — 2026-03-27`), insert:

```markdown

## Fix: Allow Deleting the Last Timesheet Row (Plan v5)

### Summary

Removed the `rows.length > 1` guard that prevented users from deleting the last remaining row in the timesheet grid. This was needed after "Copy to Current Week" when copied rows need to be removed.

---

### File Changes

#### 1. `src/components/timesheet/TimesheetGrid.tsx`

**Line 899** — Lock icon condition:
- FROM: `{isRowApproved && rows.length > 1 ?`
- TO: `{isRowApproved ?`
- Rationale: Show the lock icon on approved rows even when it is the last remaining row.

**Line 908** — Trash button condition:
- FROM: `) : rows.length > 1 && !isLocked ? (`
- TO: `) : !isLocked ? (`
- Rationale: Allow deleting any row (including the last one) as long as the timesheet is not locked.

No other files were changed.

---
```

## Files Modified
1. `docs/changelogs/CHANGELOG-2026-03-27.md` — insert new section at top (after heading)

