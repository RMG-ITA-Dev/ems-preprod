

# Plan: Implement Bug Fixes #4, #12, #15, #17 + Rewrite Changelog

## Overview

This plan has two parts:
1. **Implement missing code/DB changes** for bugs #4, #12, #15, and #17
2. **Rewrite `docs/CHANGELOG-2026-02-06.md`** to accurately reflect all 21 bugs (no hallucinations)

---

## Part 1: Code Changes

### Bug #4 — Timer Import Discoverability (2 changes)

**Current state:** The import button on TrackerList is conditionally hidden when no importable entries exist. The TimeSheet page has no import integration.

**Change 4a — TrackerList.tsx (lines 337-347):** Replace the conditional render `{(entries?.filter(...).length > 0) && (<Button>...)}` with an always-visible button that is disabled when no entries are importable. Add a Badge showing the count of importable entries.

```
Before:  {(entries?.filter(e => e.ended_at && !e.is_imported).length || 0) > 0 && (
           <Button ...>
After:   <Button disabled={entriesLoading || importableEntries.length === 0} ...>
           + Badge with importableEntries.length
```

**Change 4b — TimeSheet.tsx:** Add an "Import from Timer" button on the Timesheet page. This requires:
- Import `TimerImportDialog` and `useUnimportedTimerEntries`
- Add state for `importDialogOpen`
- Query unimported timer entries for the current week
- Render the import button (conditionally visible when there are entries) alongside existing action buttons
- Render the `TimerImportDialog` component
- Add a `handleTimerImport` function that creates time_entries and marks timer_entries as imported, then invalidates timesheet queries

Translation keys `tracker.importFromTimer` already exist in both locales.

### Bug #12 — Unique Email Constraint (1 DB migration)

**Current state:** StaffForm already has frontend duplicate email check and emailLinkedWarning. But there is no DB-level unique constraint, so concurrent requests can bypass the frontend guard.

**Change 12a — New DB migration:** Add a partial unique index on `staff.email` where email is not null:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_email_unique
  ON public.staff (email)
  WHERE email IS NOT NULL;
```

### Bug #15 — Running Timer Helper Hook (1 optional addition)

**Current state:** TrackerRecord already auto-stops orphaned running entries before starting a new one (lines 112-130). DB unique partial index already enforces one running timer per staff. The fix is complete.

**Change 15a — useTimerEntries.ts (optional):** Add a `useRunningTimerEntries` hook for future use. This is a convenience hook that queries timer_entries where `ended_at IS NULL` for the current staff. Not strictly required since TrackerRecord does inline queries, but improves code reuse.

### Bug #17 — Duplicate Row Merge (Already Complete)

**Current state:** All three changes from the spec are already implemented:
- `handleEngagementChange` and `handleActivityChange` have duplicate detection + merge logic (lines 230-286)
- `usedActivitiesByEngagement` map disables already-used activities in dropdown (lines 398-407, 524-531)
- `timesheet.rowMerged` translation keys exist in both locales

**No code changes needed for Bug #17.**

---

## Part 2: Changelog Rewrite

Complete rewrite of `docs/CHANGELOG-2026-02-06.md` with these corrections:

### Files to Remove from Claims (zero diff, pre-existing)
| File | Bug | Reason |
|------|-----|--------|
| `src/hooks/useTimesheetMutations.ts` | #3 | Already supported non-current-week |
| `src/components/tracker/TimerImportDialog.tsx` | #4 | Already fully implemented |
| `src/hooks/mutations/useStaffMutations.ts` | #12 | handleStaffError pre-existed |
| `src/lib/error-handler.ts` | #12, #18 | DB_DUPLICATE_KEY pre-existed |
| `src/components/tracker/TrackerBar.tsx` | #15 | disabled={isRunning} pre-existed |
| `src/components/ui/numeric-input.tsx` | #17 | intermediateValue pre-existed |
| `src/hooks/mutations/useClientMutations.ts` | #18 | handleClientError pre-existed |

### Files to Add to Claims (genuinely changed, previously omitted)
| File | Bug | Change |
|------|-----|--------|
| `src/components/ProtectedRoute.tsx` | #1 | Session guard: checks is_active, forces signOut |
| `src/hooks/useEmsData.ts` | #5 | Added hire_date to StaffFull interface |
| `src/pages/TrackerRecord.tsx` | #15 | handleStart auto-stops orphaned running entries |
| DB migration `20260211010034` | #13 | link_staff_to_auth_user reverse trigger |
| DB migration `20260211010728` | #15 | idx_timer_entries_one_running_per_staff |
| DB migration `20260211012646` | #19 | idx_engagements_code_unique |

### Per-Bug Description Corrections

- **Bug #1**: Add ProtectedRoute.tsx and email confirmation flow
- **Bug #3**: Remove useTimesheetMutations.ts claim
- **Bug #4**: Rewrite entirely — note that import dialog and button pre-existed; describe the new changes (always-visible button + TimeSheet import integration) being implemented now
- **Bug #8**: Remove false reference to `get_staff_assigned_engagements` RPC; describe the actual JS filter removal
- **Bug #12**: Remove useStaffMutations.ts and error-handler.ts claims; keep StaffForm.tsx (pre-save check + emailLinkedWarning are genuine); add new DB migration for unique index
- **Bug #14**: Correct styling description to opacity-60/opacity-70 (not text-muted-foreground)
- **Bug #15**: Remove TrackerBar.tsx claim; add TrackerRecord.tsx (orphan auto-stop) and DB migration
- **Bug #16**: Remove "Updated DB function" claim; describe the client-side RPC call fix
- **Bug #17**: Remove numeric-input.tsx and rowsRef claims; describe the actual new changes: duplicate row merge logic, usedActivitiesByEngagement map, rowMerged toast
- **Bug #18**: Remove useClientMutations.ts and error-handler.ts claims; add ClientForm.tsx (pre-save duplicate NIT + name checks)

### Translation Keys Corrections

Remove 6 keys claimed as new that already existed:
- errors.duplicateEmail, errors.duplicateNit, timesheet.noStaffRecord, timesheet.beforeHireDate, tracker.importTitle, tracker.importDescription

Add keys that are genuinely new but were omitted:
- staff.hireDate, staff.hireDateHelp, staff.emailLinkedWarning, engagement.duplicateCode, errors.duplicateClientName, timesheet.rowMerged, workOrders.seasonColumn/statusColumn/seasonHigh/seasonLow, auth.verifyYourEmail/auth.confirmationSent

### New Section: Database Migrations

Dedicated section documenting all 4 migrations from this session plus the new one for Bug #12:

| Migration | Content | Bug |
|-----------|---------|-----|
| 20260211004322 | ALTER TYPE app_role ADD VALUE x3 | #10 |
| 20260211010034 | link_staff_to_auth_user() reverse trigger | #13 |
| 20260211010728 | idx_timer_entries_one_running_per_staff | #15 |
| 20260211012646 | idx_engagements_code_unique | #19 |
| (new) | idx_staff_email_unique partial index | #12 |

### New Section: Missing DB Constraints (Recommendations)

Note that `clients.unique_tax_id` still relies on frontend-only guard. Recommend adding a unique constraint in a future session.

---

## Implementation Order

1. DB migration for Bug #12 (staff email unique index)
2. TrackerList.tsx changes for Bug #4a (always-visible import button)
3. TimeSheet.tsx changes for Bug #4b (import from timesheet)
4. (Optional) useTimerEntries.ts for Bug #15a (running entries hook)
5. Rewrite docs/CHANGELOG-2026-02-06.md

