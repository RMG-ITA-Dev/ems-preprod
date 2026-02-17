

# Merge Changelog Files

## What Will Happen

1. **Append** the entire contents of `docs/CHANGELOG-2026-02-17.md` (257 lines, 6 entries) to the end of `docs/CHANGELOG-2026-02-13.md` (currently 532 lines), preceded by a `---` separator for visual continuity.

2. **Verify** the merged file contains all entries from both files in the correct order (oldest to newest -- the 02-17 entries are already in chronological order and will appear after the existing 02-13 entries).

3. **Delete** `docs/CHANGELOG-2026-02-17.md`.

## Order of Entries in the Merged File

The final `docs/CHANGELOG-2026-02-13.md` will contain these entries top-to-bottom:

| # | Entry (from 02-13) |
|---|---|
| 1 | Schema: Merge `staff_capacity` into `staff` |
| 2 | BUG #0206-3: Timesheet Buttons Not Available on Non-Current Weeks |
| 3 | BUG #0206-19: Start Date Allows Values Before Engagement Creation Date |
| 4 | BUG #0213-22: Auto-Logout After 30 Minutes of Inactivity |
| 5 | BUG #0213-23: Timesheet "Save Draft" Stuck in Loading Loop |
| 6 | BUG #0213-24: Copy Previous Week Error + [object Object] |
| 7 | BUG #0213-25: Submitted Timesheet Remains Editable |
| 8 | BUG #0213-26: Redesign "Cronometro" into "Registros de Tiempo" |
| 9 | PROGRAMER_REQUEST_FIX_#2: Registros de Tiempo UI Refinements (S6, S7, S8) |
| 10 | Hours Field Enhancement for Add and Edit Time Records |
| 11 | FIX: Export Error Feedback for Unapproved Work Orders |

| # | Entry (appended from 02-17) |
|---|---|
| 12 | Stopwatch Persistence, Single Running Timer, 8h Hard Cap (Plan v4) |
| 13 | Focus Mode Layout + Hard Navigation Lock + Stopwatch Exception (Plan v3) |
| 14 | Filter Tracker and Timesheet Engagement Dropdowns to Approved Work Orders Only (Plan v2) |
| 15 | Expense Ownership Tracking ("My Expenses" Toggle) |
| 16 | UI Reorganization and Branding Consolidation |
| 17 | NotFound (404) Page Rewrite |

## Files

| File | Action |
|---|---|
| `docs/CHANGELOG-2026-02-13.md` | MODIFY -- append 02-17 content after line 532 |
| `docs/CHANGELOG-2026-02-17.md` | DELETE |

## Verification Step

After the append, I will read the merged file to confirm:
- All 17 entries are present
- No content was lost or duplicated
- The separator between old and new content is clean

Only after verification will I delete the 02-17 file.

