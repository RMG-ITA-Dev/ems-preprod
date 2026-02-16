

# Add Missing Changelog Entry for BUG #0213-26

## What happened
The Plan v4 implementation covered all code changes but skipped the final documentation step: appending the BUG #0213-26 entry to `docs/CHANGELOG-2026-02-13.md`.

## What will be added

Append a new section after line 317 (end of BUG #0213-25) following the exact format used by all previous entries in the file.

### Content

**Section:** `## BUG #0213-26: Redesign "Cronometro" into "Registros de Tiempo"`

Documents:
- **Date, Priority, Version, Route** metadata
- **Problem**: The "Importar del Cronometro" feature had 6 functional defects (UTC date shift, missing period_id, no aggregation, no duplicate handling, no user feedback, no grid refresh) plus a UX mismatch with business workflow (S1-S5 requirements from Sergio).
- **Root Cause**: Duplicated import logic in 2 files, no aggregation, error-driven duplicate handling, no submission blocking, reactive architecture.
- **Solution**: Created shared `useTimesheetImport` hook with 9-step pipeline (date extraction, aggregation, rounding, week computation, deterministic period resolution, S5 submission block, SELECT-first upsert, selective marking, cache invalidation). Redesigned TrackerList with 3-button layout, checkbox selection, and inline ManualEntryDialog. Removed import from Timesheet page. Deleted TimerImportDialog.
- **Files Modified** table (8 files: CREATE useTimesheetImport, MODIFY TrackerList/TimeSheet/ManualEntryDialog/es.json/en.json/changelog, DELETE TimerImportDialog)
- **S1-S5 Requirement Mapping** table
- **Risk Assessment**

### File modified
| File | Action |
|------|--------|
| `docs/CHANGELOG-2026-02-13.md` | APPEND new section after BUG #0213-25 |

## Standing Rule (for all future plans)
Every plan's final step must be: **"Append changelog entry to `docs/CHANGELOG-2026-02-13.md`"** documenting the bug fix or feature using the established format.

