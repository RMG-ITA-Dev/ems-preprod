# 260308 _EMS2.0.7_Debugg_Session

**Date:** 2026-03-08
**Version:** EMS 2.0.7

---

## BUG 0227-65 — Fix Manager/Supervisor selector to exclude Partners and Directors

**Priority:** Medium | **Route:** PRINCIPAL-Encargos | **Status:** Fixed

**Root cause:** `managementOptions` filter in `src/hooks/useCategoryStaff.ts` used `displayOrder <= 4` instead of `>= 3 && <= 4`, which included the leadership tier (Partner display_order=1, Director display_order=2) in the management dropdown.

**Fix:** Single-line filter change in `useCategoryStaff.ts` line 55: `displayOrder <= 4` → `displayOrder >= 3 && displayOrder <= 4`. Two comment updates on lines 48 and 54 to reflect the corrected scope.

**Files modified:**
- `src/hooks/useCategoryStaff.ts` — 3 line edits (lines 48, 54, 55)

**No backend, DB, or schema changes.**

**Not modified:** `src/components/forms/EngagementForm.tsx` — consumes `managerOptions` (legacy alias of `managementOptions`); fixing the hook automatically fixes the dropdown everywhere it's used.

---

## BUG 0227-68 — Fix rejected line activity change reverts silently

**Priority:** High | **Route:** OPERACIONES-Hoja de Tiempo | **Status:** Fixed

**Root cause:** `handleActivityChange` in `src/components/timesheet/TimesheetGrid.tsx` (lines 455-482) only called `setRows()` with no DB write. When any cell save triggered `queryClient.invalidateQueries(['time-entries'])`, the DB refetch overwrote local React state via the `useEffect` at line 155-157, silently reverting the activity change. `useUpsertTimeEntry` only ever updated `hours_logged`, never `activity_id`.

**Fix:** New `useUpdateEntryActivity` mutation added to `src/hooks/useTimesheetMutations.ts` that bulk-updates `activity_id` on existing `time_entries` via `UPDATE ... WHERE time_id IN (entryIds)`. Called from `handleActivityChange` immediately after `setRows()`. On DB failure: local state rolls back (activity reverts to original) and an error toast is shown. On success: `time-entries` query is invalidated to refetch with the persisted value.

**Files modified:**
- `src/hooks/useTimesheetMutations.ts` — new `useUpdateEntryActivity` export after `useDeleteRowEntries`
- `src/components/timesheet/TimesheetGrid.tsx` — import + instantiate `updateEntryActivity`; add persistence + rollback block inside `handleActivityChange`
- `src/locales/en.json` — add `timesheet.activityChangeError` key after `deleteRowError`
- `src/locales/es.json` — add `timesheet.activityChangeError` key after `deleteRowError`

**No backend, DB, or schema changes.** `time_entries.activity_id` already exists and is updatable by staff RLS policy.

---

## BUG 0306-71 — Add client name to Approvals view engagement rows

**Priority:** Medium | **Route:** OPERACIONES-Aprobaciones | **Status:** Fixed

**Root cause:** The Supabase query in `useTimesheetApprovals.ts` did not join `clients`, so `client_legal_name` was unavailable. `ApprovalTimesheetGrid.tsx` only rendered engagement code and name, omitting the client.

**Fix:** Extended the engagement select to join `clients!client_id(client_id, client_legal_name)`. Added `clientName` field to `EngagementGroup` interface, populated it in `groupMap.set()`, and rendered it below the engagement name as a second line following the same two-line pattern as `TimesheetGrid.tsx` (line 779-784).

**Files modified:**
- `src/hooks/useTimesheetApprovals.ts` — extend interface + add client join to query
- `src/components/timesheet/ApprovalTimesheetGrid.tsx` — interface, populate, render

**No backend, DB, or schema changes.**
