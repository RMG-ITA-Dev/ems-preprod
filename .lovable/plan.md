

# Plan v3 -- BUG 0227-66: Rejection Notes Not Visible to Staff

## Objective

Display approver rejection notes inline on rejected timesheet rows so staff can read them without hovering. Frontend display-only fix -- no backend, DB, or workflow changes.

## Root Cause

In `src/components/timesheet/TimesheetGrid.tsx`, `renderApprovalBadge` (lines 661-689) places `review_notes` exclusively inside a `TooltipContent`. Users must hover the small "Rejected" badge to see the note, which is undiscoverable. Most staff contact the approver instead.

## Scope

**In scope:** Add inline rejection note text below the rejected badge, add one i18n key per locale, append changelog.

**Out of scope:** Backend/DB changes, approval workflow changes, banner modifications, approver name display, tests for this display-only change.

## Implementation Steps

### Step 1: Add inline rejection note in renderApprovalBadge

**File: `src/components/timesheet/TimesheetGrid.tsx`** (lines 661-689)

Inside `renderApprovalBadge`, wrap the existing return in a fragment. After the existing `Tooltip` block, conditionally render an inline note paragraph when `approval.status === "rejected"` and `approval.review_notes?.trim()` is non-empty:

```text
return (
  <>
    <Tooltip>
      ...existing tooltip/badge unchanged...
    </Tooltip>
    {approval.status === "rejected" && approval.review_notes?.trim() && (
      <p className="mt-1 text-xs text-destructive/90 italic leading-tight">
        {t("approval.rejectionNote")} {approval.review_notes}
      </p>
    )}
  </>
);
```

The parent container at line 753 is `<div className="flex items-center">`. This needs to change to `flex flex-wrap items-center` so the note wraps below the badge+select row instead of overflowing horizontally.

Approved and pending badge rendering is completely unchanged -- the conditional only fires for rejected status with a non-empty trimmed note.

### Step 2: Add i18n keys

**File: `src/locales/en.json`** -- under `approval` section add:
```text
"rejectionNote": "Rejection note:"
```

**File: `src/locales/es.json`** -- under `approval` section add:
```text
"rejectionNote": "Nota de rechazo:"
```

### Step 3: Changelog append

**File: `docs/CHANGELOG-2026-02-27.md`**

Append BUG 0227-66 entry with:
- Root cause: rejection notes existed in DB and tooltip but were only visible via hover on the small rejected badge
- Files modified: `src/components/timesheet/TimesheetGrid.tsx`, `src/locales/en.json`, `src/locales/es.json`
- Before: staff had to hover the "Rejected" badge to see rejection reason; most never discovered this
- After: rejection note is displayed inline below the badge in `text-destructive` italic text; rows without a note show no extra text
- Scope: frontend display-only fix; no backend, DB schema, or approval workflow changes

## Target Files

| File | Action |
|---|---|
| `src/components/timesheet/TimesheetGrid.tsx` | Modify (renderApprovalBadge + parent div class) |
| `src/locales/en.json` | Modify (add 1 key under approval) |
| `src/locales/es.json` | Modify (add 1 key under approval) |
| `docs/CHANGELOG-2026-02-27.md` | Append |

## Validation Checks

1. Rejected rows with note: inline note visible without hover
2. Rejected rows without note (or empty/whitespace-only): no inline note block rendered
3. Approved/pending rows: completely unchanged
4. Locale keys `approval.rejectionNote` resolve correctly in EN and ES

## QA Checklist

1. Reject a timesheet line with a note as approver -- staff sees note inline below badge
2. Reject a line without a note -- no extra text appears
3. Long rejection notes wrap correctly within the cell (no horizontal overflow)
4. Approved and pending badges render identically to before
5. Mobile layout -- note text wraps within engagement column
6. Tooltip still works on hover for backward compatibility

## Acceptance Criteria

1. Staff can read rejection reason directly on rejected rows without hover
2. Rows without rejection notes show no extra UI elements
3. No regressions on approved/pending badge display
4. No backend or database changes
5. Changelog is detailed and diff-verifiable

## Changelog Append

**File:** `docs/CHANGELOG-2026-02-27.md`

You need to append to the CHANGELOG a detailed description of the changes made while implementing this Plan. There needs to be sufficient detail to be able to verify if the changes to the codebase correspond to the CHANGELOG.

