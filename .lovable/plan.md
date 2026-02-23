# Plan: Approved Week Read-Only Display Fix (v2)

**Plan ID:** Plan_ApprovedWeek_ReadOnly_DisplayFix_v2
**Task ID:** APPROVED_WEEK_READONLY_DISPLAY_FIX

## Problem

When navigating to a fully approved week that has no time entries (e.g., Dec 1-5 2025 in the screenshot), the grid renders a blank placeholder row with "Seleccionar Encargo" and "Seleccionar Actividad" dropdowns -- making it look editable. Users need to review approved weeks but currently see a misleading empty state.

## Pre-Implementation Verification Step

Before making code changes, verify the scenario in-app:

1. Navigate to the week shown in the screenshot (Dec 1-5, 2025) for the affected staff member.
2. Confirm the alert banner reads "fully approved" (the `isFullyApproved` path).
3. Confirm the `entries` array passed to `TimesheetGrid` is empty (zero rows from the query).
4. Confirm the grid currently renders a single placeholder row with engagement/activity selectors.

**Hypothesis (pending verification):** The database has `timesheet_line_approvals` records with `status = 'approved'` for this period, but `time_entries` for the same period/staff are absent. This causes `isFullyApproved = true` (approvals exist and all are approved) while `entries.length === 0`. This hypothesis should be confirmed during implementation via console logging or DB inspection.

## What Was Added (vs. v1 plan)


| ID    | Addition                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADD-1 | Pre-implementation verification step (above) to confirm exact scenario before coding                                                                                                    |
| ADD-2 | Explicit rendering branch specification: when `isFullyApproved && rows.length === 0`, render a dedicated non-editable informational row in `tbody` instead of the placeholder input row |
| ADD-3 | Regression checklist and manual test matrix (see bottom)                                                                                                                                |


## What Was Changed (vs. v1 plan)


| ID    | From                                               | To                                                                 |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------ |
| CHG-1 | Root cause DB evidence presented as confirmed fact | Marked as hypothesis pending verification during implementation    |
| CHG-2 | File list included `docs/CHANGELOG-2026-02-22.md`  | Removed from scope; changelog updates only if explicitly requested |
| CHG-3 | Mixed wording around lock behavior                 | Explicit lock-chain documentation (see Behavioral Rules below)     |


## What Was Removed (vs. v1 plan)


| ID    | Removal                                                                         |
| ----- | ------------------------------------------------------------------------------- |
| DEL-1 | `docs/CHANGELOG-2026-02-22.md` removed from planned file modifications          |
| DEL-2 | Definitive DB query result statements removed; replaced with hypothesis framing |


---

## File-by-File Implementation Plan

### 1. `src/components/timesheet/TimesheetGrid.tsx`

**Approach decision: Add `isFullyApproved` as a new prop** (prop-plumbing from TimeSheet.tsx).

Rationale: While `lineApprovals` is already available as a prop and `isFullyApproved` could be derived inside TimesheetGrid, the parent (`TimeSheet.tsx`) already computes this flag and uses it for multiple decisions. Passing it as an explicit prop keeps the grid component simple and avoids duplicating the derivation logic.

**A. Add prop to interface** (line 46-73, `TimesheetGridProps`)

Add `isFullyApproved?: boolean` to the interface. Default to `false` in destructuring.

**B. Guard the empty-row fallback** (lines 131-140, `initialRows` useMemo)

Change the condition from:

```text
if (rows.length === 0) { rows.push({ ... blank row ... }); }
```

to:

```text
if (rows.length === 0 && !isFullyApproved) { rows.push({ ... blank row ... }); }
```

This prevents generating an editable-looking placeholder row when the week is fully approved.

**C. Render informational empty state** (inside `tbody`, before the "Add Row" button block, around line 817)

When `rows.length === 0` (which only happens when `isFullyApproved` is true, due to the guard above), render:

```text
<tr>
  <td colSpan={weekDates.length + 4} className="p-8 text-center text-muted-foreground">
    <Lock icon (h-5 w-5, centered, mb-2, opacity-50) />
    <p>{t("timesheet.approvedNoEntries")}</p>
  </td>
</tr>
```

This replaces the misleading blank engagement selector row with a clear, non-interactive message.

**D. No changes to existing lock logic**

The existing controls are already correctly gated:

- `isLocked` (from `!isEditable` in TimeSheet.tsx, where `isFullyApproved` contributes) disables all inputs, selectors, and hides the "Add Row" button (line 819: `{!isLocked && ...}`)
- Row-level locking via `isRowApproved` (derived from `lineApprovals` matching each row's engagement) disables per-row controls and replaces trash with lock icon
- The totals row renders unconditionally and will show 0h values correctly

### 2. `src/pages/TimeSheet.tsx`

**Single change at the `TimesheetGrid` callsite** (around line 440):

Add `isFullyApproved={isFullyApproved}` to the props passed to `<TimesheetGrid>`.

The `isFullyApproved` flag is already computed at lines 158-159:

```text
const isFullyApproved = lineApprovals?.length > 0 &&
  lineApprovals.every((la) => la.status === "approved");
```

No other changes needed in this file.

### 3. `src/locales/en.json`

Add under the `timesheet` key:

```text
"approvedNoEntries": "This approved week has no recorded time entries."
```

No other locale keys changed.

### 4. `src/locales/es.json`

Add under the `timesheet` key:

```text
"approvedNoEntries": "Esta semana aprobada no tiene registros de tiempo."
```

No other locale keys changed.

---

## Behavioral Rules (Lock Chain Documentation)


| Scenario                   | Lock source                                                                                         | Result                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Approved + entries exist   | `isLocked=true` (from `!isEditable` because `isFullyApproved=true`), plus row-level `isRowApproved` | All rows visible, read-only; no add/delete/edit                           |
| Approved + no entries      | `isLocked=true` + new empty-state guard                                                             | Informational message row; no editable controls rendered at all           |
| Editable + no entries      | `isLocked=false`, `isFullyApproved=false`                                                           | Normal blank placeholder row with selectors (existing behavior preserved) |
| Submitted/pending/rejected | `isLocked=true` (from `isSubmitted=true`)                                                           | Rows visible, read-only; existing behavior unchanged                      |


No changes to the lock computation logic itself. The only new code path is the empty-state rendering branch in TimesheetGrid.

---

## Files Modified


| File                                         | Change                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/components/timesheet/TimesheetGrid.tsx` | Add `isFullyApproved` prop; guard empty-row creation; add informational empty state row |
| `src/pages/TimeSheet.tsx`                    | Pass `isFullyApproved` to TimesheetGrid                                                 |
| `src/locales/en.json`                        | Add `timesheet.approvedNoEntries`                                                       |
| `src/locales/es.json`                        | Add `timesheet.approvedNoEntries`                                                       |


&nbsp;

lease document the implementation of this PLAN by appending it to the CHANGELOG-2026-02-2.md file In the Codebase

## Files NOT Modified

&nbsp;

- No backend files
- No calendar/WeekNavigator changes
- No other timesheet modules

---

## Acceptance Criteria


| AC   | Criterion                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| AC-1 | Fully approved week with entries displays all rows as readable and locked (no edits)                         |
| AC-2 | Fully approved week with no entries displays a non-editable informational empty state (no fake editable row) |
| AC-3 | Add row action is unavailable in approved weeks                                                              |
| AC-4 | Delete/edit controls are unavailable in approved weeks                                                       |
| AC-5 | Non-approved empty weeks continue to show normal editable starter row behavior                               |
| AC-6 | Totals row and table layout remain intact in all above states                                                |


## Manual Test Matrix


| Case                              | Expected                                                                 | Validates        |
| --------------------------------- | ------------------------------------------------------------------------ | ---------------- |
| Approved week + entries > 0       | Rows visible, all controls locked, values readable                       | AC-1, AC-3, AC-4 |
| Approved week + entries = 0       | Informational empty state shown, no editable selectors/inputs/add/delete | AC-2, AC-3, AC-4 |
| Editable week + entries = 0       | Existing editable blank row behavior preserved                           | AC-5             |
| Submitted/pending/rejected states | No regression in existing lock/edit logic                                | AC-1, AC-6       |
| All states                        | Totals row renders correctly with proper layout                          | AC-6             |
