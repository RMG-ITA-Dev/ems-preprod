

# Bug #17: Prevent Duplicate Engagement+Activity Rows in Timesheet

## Problem

The timesheet grid allows users to create multiple rows with the same engagement+activity combination. Hours get scattered across duplicate rows, causing data integrity issues and confusing totals.

## Fix

Three changes to `TimesheetGrid.tsx` plus i18n strings:

### 1. Duplicate detection in `handleEngagementChange` and `handleActivityChange`

When the user changes the engagement or activity on a row, check if another row already has the same combination. If so, merge the current row's hours into the existing row (summing per day) and remove the duplicate row. Show a toast warning.

### 2. Disable already-used activities in the dropdown

Add a `useMemo` that tracks which activity IDs are already used per engagement across all rows. In the activity `SelectContent`, disable items that are already in use for the same engagement (excluding the current row's own selection).

### 3. i18n strings

Add `timesheet.rowMerged` to both locale files.

## Files Modified

| File | Change |
|------|--------|
| `src/components/timesheet/TimesheetGrid.tsx` | Add duplicate detection + merge in `handleEngagementChange` (lines 229-235) and `handleActivityChange` (lines 237-243). Add `usedActivitiesByEngagement` memo. Disable used activities in dropdown (lines 468-475). |
| `src/locales/en.json` | Add `timesheet.rowMerged` |
| `src/locales/es.json` | Add `timesheet.rowMerged` |

## Technical Detail

- `handleEngagementChange`: Before updating the row, check `rows.find(r => r.id !== rowId && r.engagementId === engagementId && r.activityId === currentRow.activityId && currentRow.activityId !== '')`. If found, merge hours (sum per day), keep existing row's entryIds, remove duplicate, show toast.
- `handleActivityChange`: Same pattern with engagement held constant.
- `usedActivitiesByEngagement`: A `useMemo` building `Map<engagementId, Set<activityId>>` from current rows. Used to set `disabled` on `SelectItem` in the activity dropdown when the activity is already used for that engagement by another row.
- The merge approach is preferred over blocking because it handles the edge case where a user changes an engagement on a row that already has hours, inadvertently creating a duplicate. Merging preserves their data rather than losing it.

