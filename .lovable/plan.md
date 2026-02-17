# Document Plan v2: Filter Tracker Engagement Dropdowns to Approved Work Orders Only

## What Needs to Be Done

Add a changelog entry to `docs/CHANGELOG-2026-02-13.md` documenting this previously undocumented plan. The entry will be appended after the existing "Focus Mode" entry.

## Changelog Entry Content

The entry will document the following implemented changes:

### Problem

Users could select engagements whose Work Orders were not yet approved when logging time via the Stopwatch, Manual Entry, or Edit Record forms. This led to database trigger rejections (`check_wo_approved`) at save/export time with confusing error messages, since the DB enforces that time entries can only be inserted against engagements with approved Work Orders.

### Solution

Created a shared `useApprovedEngagements` hook that pre-filters engagements to only those with an associated Work Order in `approval_status = 'Approved'`. Applied this filter to all Tracker engagement dropdowns (Stopwatch, Manual Entry, Edit Record) and the Timesheet engagement dropdown. Added defensive save-time validation and user-facing warnings for edge cases (e.g., an entry originally linked to a now-unapproved engagement).

### Files to Document


| File                                           | Action | Description                                                                                                                                     |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/useApprovedEngagements.ts`          | CREATE | Shared hook: 2-step query (work_orders -> engagements) filtered to approved + active                                                            |
| `src/components/tracker/TrackerBar.tsx`        | MODIFY | Switched from `useEngagements` to `useApprovedEngagements`; added "no approved engagements" alert; gated Start button on `isEngagementApproved` |
| `src/components/tracker/ManualEntryDialog.tsx` | MODIFY | Switched to `useApprovedEngagements`; added save-time guard rejecting unapproved selections                                                     |
| `src/pages/TrackerEdit.tsx`                    | MODIFY | Switched to `useApprovedEngagements`; added unapproved-engagement inline warning alert; added save-time block with toast                        |
| `src/hooks/useTimesheetWeek.ts`                | MODIFY | Engagement dropdown query filtered to approved WOs only (BUG #19)                                                                               |
| `src/locales/en.json`                          | MODIFY | Added keys: `woNotApproved`, `woNotApprovedSave`, `woNotApprovedEdit`, `noApprovedEngagements`                                                  |
| `src/locales/es.json`                          | MODIFY | Same 4 keys                                                                                                                                     |


### Technical Details

- **Two-step query pattern**: Step 1 fetches `engagement_id` from `work_orders` where `approval_status = 'Approved'`; Step 2 fetches full engagement records (with client, partner, manager joins) filtered by those IDs and `status = 'active'`
- **Graceful fallback in TrackerEdit**: If the current entry's engagement is no longer approved, it is still included in the dropdown (so the user sees what was selected) but a destructive alert warns them and save is blocked until they select an approved engagement
- **Timesheet uses same pattern**: `useTimesheetWeek` has its own inline approved-engagements query with the same two-step logic, cached for 5 minutes

## File to Modify


| File                           | Action                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY -- append new changelog entry after existing content |
