# Plan: Timer Entries Consolidation on Export (Bug 0220-64) v8

**Supersedes:** v7

**Bug ID:** 0220-64 | **Priority:** Alta | **Route:** OPERACIONES - Registros de Tiempo

---

## Executive Summary

When pushing timer entries to the timesheet, entries sharing the same Date + Engagement + Activity are silently aggregated. The user is never informed. Unselected entries matching the same grouping key are ignored, allowing partial pushes that the bug explicitly forbids ("cannot push only part"). This plan introduces a two-phase export (preflight analysis, then user decision) enforcing an **ATOMIC_GROUP_EXPORT** policy with a **stale-preflight guard** and explicit post-action state management.

---

## Policy Decision: ATOMIC_GROUP_EXPORT (unchanged)

**Rule:** If a selected duplicate group has unselected matching eligible records, export cannot proceed until the user chooses one global option for all conflicts.


| Option                     | Key                          | Behavior                                                                                                                                                 |
| -------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Include All Matching       | `include_all_matching`       | Add all unselected eligible entries from conflict groups; export everything consolidated.                                                                |
| Exclude Conflicting Groups | `exclude_conflicting_groups` | Drop ALL selected records belonging to conflicted groups. Only non-conflicted entries are exported. If resolved set is empty, show info toast and abort. |
| Cancel                     | `cancel`                     | Abort entire export. Nothing pushed.                                                                                                                     |


**Forbidden:** "Selected Only" partial export within conflicting groups. Silent partial push of any kind.

---

## Concurrency and Determinism Policy

### Stale-Preflight Guard

Before calling `exportEntries`, the confirm handler MUST recompute analysis from the latest data and compare it to the displayed analysis using `analysisEquals`.

**Data source at confirm time:** The confirm handler reads the TanStack Query cache snapshot for `['timer_entries', staffId]`. It does NOT force a refetch. Rationale: cache read is synchronous and avoids async latency / race conditions in the confirm handler. The query cache is kept fresh by `useTimerEntries()` background refetch and invalidation from concurrent mutations.

**Optional stricter freshness mode (future):** If stricter freshness is later required, a `forceRefetch` flag can be introduced that awaits `queryClient.refetchQueries({ queryKey: ['timer_entries', staffId] })` before recomputing. This is NOT implemented in v8 to keep the confirm path synchronous and low-latency.

**Drift detection -- abort and refresh:** If `analysisEquals` returns false, the export call is aborted, the dialog state is updated with the fresh analysis, and a toast notifies the user: "Data changed. Please review and confirm again."

### analysisEquals Normalization

All compared ID collections are normalized before comparison:

1. `eligibleIds`: Sorted array of timer_id strings (deduped by Set construction, then `Array.from(...).sort()`)
2. Conflict key set: Sorted array of conflict `key` strings
3. Per-conflict-group membership: For each conflict key, sorted array of timer_id values from both selected and unselected partitions
4. `selectedIdsSnapshot`: Sorted array of timer_id strings

Comparison: Each pair of sorted arrays is compared element-by-element. All four fields must match for `analysisEquals` to return `true`.

### Deterministic Ordering

- `buildExportGroups` returns groups in a Map with entries inserted sorted by `dateWorked` asc, `engagementCode` asc, `activityCode` asc.
- `detectSplitSelectionConflicts` returns conflicts in the same deterministic order.
- In deterministic ordering, define tie-break fallback when `engagementCode` or `activityCode` is empty/null (e.g., fallback to IDs).

---

## Functional Contract


| Property                 | Rule                                                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Group Key**            | `(date_worked, engagement_id, activity_id)` where `date_worked = format(parseISO(entry.started_at), "yyyy-MM-dd")`                             |
| **Eligibility**          | `ended_at != null` AND `is_imported == false`                                                                                                  |
| **Selection-Source**     | Preflight uses ALL eligible entries from `entries` (full `useTimerEntries()` dataset, TrackerList line 57), NEVER `filteredEntries` (line 139) |
| **Consolidation Group**  | A group key mapping to 2+ entries in the final export set                                                                                      |
| **Split-Group Conflict** | At least one selected entry shares a group key with at least one unselected eligible entry                                                     |
| **Atomicity**            | No partial export of a conflicted duplicate group. Either all entries in the group are exported, or none are.                                  |
| **Blocking Rule**        | Export blocked until user chooses one of 3 options when conflicts exist                                                                        |
| **Global Policy**        | Chosen option applies to ALL conflict groups in a single export action                                                                         |
| **Empty Resolved Set**   | If `exclude_conflicting_groups` results in zero entries, show info toast and abort                                                             |
| **Stale Guard**          | Confirm handler revalidates analysis from query cache before executing; aborts on drift                                                        |


---

## UX / State Consistency

### selectedIds After Actions


| Action                                 | selectedIds Behavior                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **include_all_matching success**       | Clear to empty `new Set()`. All exported entries are now imported.                                 |
| **exclude_conflicting_groups success** | Clear to empty `new Set()`. Exported entries imported; conflicted entries excluded by user choice. |
| **cancel**                             | Preserve current `selectedIds` unchanged. User can adjust and retry.                               |
| **stale-abort refresh**                | Preserve current `selectedIds` unchanged. Dialog refreshes with new analysis.                      |


### Stale-Abort Dialog Refresh UX

When a stale-abort occurs and the dialog refreshes with updated analysis, conflict groups that changed (new conflicts added, existing conflicts resolved, or membership changed) should be visually indicated. Implementation: conflict rows in the dialog table that differ from the previous analysis receive a brief highlight animation (CSS `@keyframes` pulse on the table row, 2 seconds, using `bg-warning/20`). This aids re-confirmation by drawing attention to what changed.

---

## Architecture

### Pure Utility: `src/lib/timerExportUtils.ts` (NEW)

Pure functions, no React/hooks.

**Types:**

```text
ExportGroup {
  key: string                    // "engId|actId|date"
  engagementId: string
  engagementCode: string
  engagementName: string
  activityId: string
  activityCode: string
  dateWorked: string             // yyyy-MM-dd
  entries: TimerEntry[]
  totalMinutes: number
}

SplitConflict {
  key: string
  engagementCode: string
  activityCode: string
  dateWorked: string
  selectedEntries: TimerEntry[]
  selectedMinutes: number
  unselectedEntries: TimerEntry[]
  unselectedMinutes: number
}

ConflictPolicy = 'include_all_matching' | 'exclude_conflicting_groups' | 'cancel'

ConsolidationPreview {
  mergedGroups: { key, engagementCode, activityCode, dateWorked, entryCount, totalMinutes }[]
  resultingRowCount: number
  totalEntries: number
  totalHours: number
}

PreflightAnalysis {
  groups: Map<string, ExportGroup>
  conflicts: SplitConflict[]
  hasConsolidation: boolean
  hasConflicts: boolean
  preview: ConsolidationPreview
  eligibleIds: Set<string>         // for stale detection
  selectedIdsSnapshot: Set<string> // for stale detection
}
```

**Functions (exact signatures):**

```text
buildExportGroups(entries: TimerEntry[]): Map<string, ExportGroup>
  -- Groups by key; deterministic insertion order: dateWorked asc, engagementCode asc, activityCode asc

detectSplitSelectionConflicts(groups: Map<string, ExportGroup>, selectedIds: Set<string>): SplitConflict[]
  -- Returns conflicts in same deterministic order

resolveFinalExportSet(allEligible: TimerEntry[], selectedIds: Set<string>, conflicts: SplitConflict[], policy: ConflictPolicy): TimerEntry[]
  -- include_all_matching: selectedIds + all entries from conflict groups
  -- exclude_conflicting_groups: selectedIds minus all entries belonging to any conflicted group
  -- cancel: returns empty array

buildConsolidationPreview(groups: Map<string, ExportGroup>, finalIds: Set<string>): ConsolidationPreview

analysisEquals(a: PreflightAnalysis, b: PreflightAnalysis): boolean
  -- Normalization: sort + dedupe all ID lists before comparison
  -- Compares: eligibleIds (sorted), conflict key set (sorted), per-conflict-group sorted timer_id membership, selectedIdsSnapshot (sorted)
  -- Returns true only if all four match
```

### Hook: `src/hooks/useTimesheetImport.ts` (MODIFY)

**Add function:**

```text
analyzeExport(allEligibleEntries: TimerEntry[], selectedIds: Set<string>): PreflightAnalysis
  -- Defensive re-filter to eligible (ended_at != null, !is_imported)
  -- Calls buildExportGroups, detectSplitSelectionConflicts, buildConsolidationPreview
  -- Stores eligibleIds and selectedIdsSnapshot in result
  -- Returns PreflightAnalysis
```

**Return:** `{ exportEntries, isExporting }` becomes `{ exportEntries, isExporting, analyzeExport }`

`**exportEntries` body is NOT modified.**

### UI Orchestration: `src/pages/TrackerList.tsx` (MODIFY)

**Imports to add:** `ConsolidationDialog`, `resolveFinalExportSet`, `analysisEquals` from `timerExportUtils`

**New state (after line 63):**

- `consolidationAnalysis: PreflightAnalysis | null` (initially null)
- `consolidationDialogOpen: boolean` (initially false)

**Destructure change (line 67):** `{ exportEntries, isExporting, analyzeExport }`

**Rewrite `handleExport` (lines 238-272):**

```text
1. const allEligible = (entries || []).filter(e => e.ended_at && !e.is_imported)
   // Uses entries (line 57), NEVER filteredEntries
2. const analysis = analyzeExport(allEligible, selectedIds)
3. If !analysis.hasConsolidation && !analysis.hasConflicts:
   -- call exportEntries(selected) directly, then setSelectedIds(new Set()), show toasts
4. Else:
   -- setConsolidationAnalysis(analysis)
   -- setConsolidationDialogOpen(true)
```

**New confirm handlers (each with stale guard):**

```text
handleIncludeAllMatching():
  1. const allEligible = (entries || []).filter(e => e.ended_at && !e.is_imported)
  2. const freshAnalysis = analyzeExport(allEligible, selectedIds)
  3. If !analysisEquals(consolidationAnalysis, freshAnalysis):
     -- setConsolidationAnalysis(freshAnalysis)
     -- toast.warning(t("tracker.consolidation.dataChanged"))
     -- return (dialog stays open with fresh data; changed rows highlighted)
  4. const resolved = resolveFinalExportSet(allEligible, selectedIds, freshAnalysis.conflicts, 'include_all_matching')
  5. const result = await exportEntries(resolved)
  6. setSelectedIds(new Set())
  7. setConsolidationDialogOpen(false)
  8. Show result toast with consolidation summary + standard blocked/WO toasts

handleExcludeConflicting():
  1-3. Same stale guard as above
  4. const resolved = resolveFinalExportSet(allEligible, selectedIds, freshAnalysis.conflicts, 'exclude_conflicting_groups')
  5. If resolved.length === 0:
     -- toast.info(t("tracker.consolidation.emptyAfterExclude"))
     -- setConsolidationDialogOpen(false)
     -- setSelectedIds(new Set())
     -- return
  6. const result = await exportEntries(resolved)
  7. setSelectedIds(new Set())
  8. setConsolidationDialogOpen(false)
  9. Show result toast + excluded toast

handleProceedExport(): (info-only mode, no conflicts)
  1-3. Same stale guard
  4. const selected = (entries || []).filter(e => selectedIds.has(e.timer_id))
  5. const result = await exportEntries(selected)
  6. setSelectedIds(new Set())
  7. setConsolidationDialogOpen(false)
  8. Show result toast

handleCancelExport():
  -- setConsolidationDialogOpen(false)
  -- selectedIds preserved
  -- No export call
```

**JSX:** Render `<ConsolidationDialog>` after ManualEntryDialog in component tree.

### Dialog: `src/components/tracker/ConsolidationDialog.tsx` (NEW)

AlertDialog-based. Two modes:

**Info mode** (consolidation, no conflicts): Merge preview table (Date, Engagement, Activity, # Entries, Total Hours). Buttons: "Proceed" / "Cancel".

**Conflict mode** (split-group conflicts): Explanation that partial push is not allowed. Conflict table (Date, Engagement, Activity, Selected count/hours, Unselected count/hours). Buttons: "Include All Matching" / "Exclude Conflicting Groups" / "Cancel". NO "Selected Only" button.

**Stale-refresh highlight:** Accepts optional `previousAnalysis` prop. Conflict rows whose key was not present in `previousAnalysis.conflicts` or whose membership changed receive a CSS highlight animation (`animate-highlight-change` class, `bg-warning/20` pulse for 2s).

**Props:** `open`, `analysis: PreflightAnalysis`, `previousAnalysis?: PreflightAnalysis | null`, `onIncludeAllMatching`, `onExcludeConflicting`, `onProceed`, `onCancel`

---

## File-by-File Deltas


| #   | File                                                           | Action | Symbols                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/lib/timerExportUtils.ts`                                  | Create | `ExportGroup`, `SplitConflict`, `ConflictPolicy`, `ConsolidationPreview`, `PreflightAnalysis`, `buildExportGroups`, `detectSplitSelectionConflicts`, `resolveFinalExportSet`, `buildConsolidationPreview`, `analysisEquals` |
| 2   | `src/hooks/useTimesheetImport.ts`                              | Modify | Add `analyzeExport`; update return                                                                                                                                                                                          |
| 3   | `src/components/tracker/ConsolidationDialog.tsx`               | Create | `ConsolidationDialog` component with highlight animation for stale-refresh                                                                                                                                                  |
| 4   | `src/pages/TrackerList.tsx`                                    | Modify | Rewrite `handleExport` (L238-272), add state, 4 handlers with stale guard, `previousAnalysis` tracking, dialog JSX                                                                                                          |
| 5   | `src/locales/en.json`                                          | Modify | Add `tracker.consolidation.*` keys                                                                                                                                                                                          |
| 6   | `src/locales/es.json`                                          | Modify | Add `tracker.consolidation.*` keys                                                                                                                                                                                          |
| 7   | `src/lib/__tests__/timerExportUtils.test.ts`                   | Create | 14 unit tests                                                                                                                                                                                                               |
| 8   | `src/hooks/__tests__/useTimesheetImport.analyzeExport.test.ts` | Create | 3 hook contract tests                                                                                                                                                                                                       |
| 9   | `src/pages/__tests__/TrackerList.export-conflicts.test.tsx`    | Create | 6 UI/integration tests                                                                                                                                                                                                      |
| 10  | Latest `docs/CHANGELOG-*.md`                                   | Modify | Append bug section                                                                                                                                                                                                          |


---

## Localization Keys

### English (`tracker.consolidation.*`)

```text
title = "Entry Consolidation"
description = "Some selected entries share the same date, engagement, and activity. They will be combined into a single timesheet entry."
groupHeader = "Entries to consolidate"
entries = "{{count}} entries"
totalHours = "{{hours}}h total"
conflictTitle = "Unselected matching entries found"
conflictDescription = "Some entries you did not select share the same date, engagement, and activity as your selection. Partial export of a group is not allowed."
noPartialPush = "You cannot push only part of a duplicate group. Choose how to proceed for all conflicting groups."
includeAll = "Include All Matching"
includeAllHint = "Adds the unselected matching entries to your export. All entries in each group will be consolidated into one timesheet row."
excludeConflicting = "Exclude Conflicting Groups"
excludeConflictingHint = "Removes the conflicting groups from this export. Only non-conflicting entries will be pushed."
cancel = "Cancel"
cancelHint = "Abort the export. No entries will be pushed."
proceed = "Proceed"
reason = "Entries for the same task on the same day are combined into one timesheet row to avoid duplicates."
resultToast = "{{exported}} exported ({{merged}} groups consolidated into {{rows}} timesheet rows)"
excludedToast = "{{excluded}} entries from {{groups}} conflicting groups were excluded from this export."
emptyAfterExclude = "All selected entries belong to conflicting groups. Nothing to export."
dataChanged = "Data changed since you opened this dialog. Please review and confirm again."
date = "Date"
engagement = "Engagement"
activity = "Activity"
selected = "Selected"
unselected = "Not Selected"
```

### Spanish (`tracker.consolidation.*`)

```text
title = "Consolidacion de Registros"
description = "Algunos registros seleccionados comparten la misma fecha, encargo y actividad. Se combinaran en una sola entrada en la hoja de tiempo."
groupHeader = "Registros a consolidar"
entries = "{{count}} registros"
totalHours = "{{hours}}h total"
conflictTitle = "Registros no seleccionados coincidentes"
conflictDescription = "Algunos registros no seleccionados comparten la misma fecha, encargo y actividad que su seleccion. No se permite exportar solo parte de un grupo."
noPartialPush = "No puede exportar solo parte de un grupo duplicado. Elija como proceder para todos los grupos en conflicto."
includeAll = "Incluir Todos los Coincidentes"
includeAllHint = "Agrega los registros coincidentes no seleccionados a su exportacion. Todos los registros de cada grupo se consolidaran en una fila."
excludeConflicting = "Excluir Grupos en Conflicto"
excludeConflictingHint = "Elimina los grupos en conflicto de esta exportacion. Solo se exportaran los registros sin conflicto."
cancel = "Cancelar"
cancelHint = "Abortar la exportacion. No se exportara ningun registro."
proceed = "Continuar"
reason = "Los registros de la misma tarea en el mismo dia se combinan en una fila de la hoja de tiempo para evitar duplicados."
resultToast = "{{exported}} exportados ({{merged}} grupos consolidados en {{rows}} filas)"
excludedToast = "{{excluded}} registros de {{groups}} grupos en conflicto fueron excluidos de esta exportacion."
emptyAfterExclude = "Todos los registros seleccionados pertenecen a grupos en conflicto. Nada que exportar."
dataChanged = "Los datos cambiaron desde que abrio este dialogo. Revise y confirme nuevamente."
date = "Fecha"
engagement = "Encargo"
activity = "Actividad"
selected = "Seleccionados"
unselected = "No Seleccionados"
```

---

## Test Strategy

### Utility Tests: `src/lib/__tests__/timerExportUtils.test.ts` (14 tests)


| ID  | Name                                                    | Assertion                                                                                                                                   |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | Groups entries by (date, engagement, activity)          | 3 entries same key = 1 group with 3 entries                                                                                                 |
| U2  | Different dates produce different groups                | Same eng/act, different dates = 2 groups                                                                                                    |
| U3  | Different activities produce different groups           | Same date/eng, different activity = 2 groups                                                                                                |
| U4  | Detects split-group conflict                            | 2 selected + 1 unselected same key = 1 conflict                                                                                             |
| U5  | No conflict when all in group selected                  | Fully selected group = 0 conflicts                                                                                                          |
| U6  | No conflict when single-entry group                     | Single-entry group never a conflict                                                                                                         |
| U7  | include_all_matching expands final set                  | Unselected from conflict groups included                                                                                                    |
| U8  | exclude_conflicting_groups drops all conflicted entries | All selected entries from conflicted groups removed; non-conflicted preserved                                                               |
| U9  | cancel returns empty array                              | resolveFinalExportSet('cancel') = []                                                                                                        |
| U10 | Preview correct merge count                             | 5 entries in 2 groups = mergedGroups=2, resultingRowCount=2                                                                                 |
| U11 | Running entries excluded                                | ended_at=null not in any group                                                                                                              |
| U12 | Imported entries excluded                               | is_imported=true not in any group                                                                                                           |
| U13 | Groups returned in deterministic order                  | Groups sorted by dateWorked, engagementCode, activityCode                                                                                   |
| U14 | analysisEquals with normalization                       | Same data = true; changed eligible set (sorted) = false; changed conflict membership (sorted) = false; changed selectedIds (sorted) = false |


### Hook Contract Tests: `src/hooks/__tests__/useTimesheetImport.analyzeExport.test.ts` (3 tests)


| ID  | Name                                                          | Assertion                                                                      |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| H1  | analyzeExport returns utility-consistent PreflightAnalysis    | Mixed eligibility data + partial selection: result matches manual utility call |
| H2  | analyzeExport defensive re-filter excludes ineligible entries | Entries with ended_at=null or is_imported=true excluded from groups/conflicts  |
| H3  | analyzeExport populates eligibleIds and selectedIdsSnapshot   | Returned PreflightAnalysis contains correct Sets for stale detection           |


### UI/Integration Tests: `src/pages/__tests__/TrackerList.export-conflicts.test.tsx` (6 tests)


| ID  | Name                                                      | Assertion                                                                                                              |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| F1  | Conflict dialog opens when split groups exist             | Dialog visible with exactly 3 buttons (Include All Matching, Exclude Conflicting Groups, Cancel)                       |
| F2  | Include All Matching exports expanded set                 | `exportEntries` called with original + unselected match entries                                                        |
| F3  | Exclude Conflicting Groups removes all conflicted entries | `exportEntries` called without any entries from conflicted groups                                                      |
| F4  | Cancel performs no export                                 | `exportEntries` never called; dialog closes; selectedIds preserved                                                     |
| F5  | No dialog when no consolidation/conflicts                 | `exportEntries` called directly; no dialog rendered                                                                    |
| F6  | Stale preflight aborts export and refreshes dialog        | When recomputed analysis differs (via mock), `exportEntries` not called; dialog stays open; "Data changed" toast shown |


**Atomicity assertion:** No test permits partial export of a conflicted duplicate group. U8 verifies ALL entries from conflicted groups are dropped. F2/F3 verify atomic expansion/exclusion.

---

## Scenario Matrix


| ID  | Scenario                                     | Expected                                                                                                 | Test IDs     |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------ |
| S1  | Two selected same key, no unselected         | Info dialog; consolidated into 1 row on Proceed                                                          | U1           |
| S2  | Selected + unselected share key              | Conflict dialog; blocked until decision                                                                  | U4, F1       |
| S3  | Include All Matching chosen                  | Unselected auto-included; all exported consolidated; selectedIds cleared                                 | U7, F2       |
| S4  | Exclude Conflicting Groups chosen            | All conflicted group entries removed; rest exported; selectedIds cleared                                 | U8, F3       |
| S5  | Cancel chosen                                | No export; dialog closes; selectedIds preserved                                                          | U9, F4       |
| S6  | Filters hide matching entries                | Conflicts still detected (uses `entries` not `filteredEntries`)                                          | U4           |
| S7  | Running/imported match key                   | Excluded from eligibility                                                                                | U11, U12, H2 |
| S8  | All unique keys, no conflicts                | Direct export, no dialog                                                                                 | F5           |
| S9  | Exclude results in empty set                 | Info toast; no export call; selectedIds cleared                                                          | U8 variant   |
| S10 | Data changes between dialog open and confirm | Export aborted; dialog refreshed with fresh analysis and changed rows highlighted; selectedIds preserved | U14, F6      |


---

## Rollback Plan

### Files to Revert/Delete


| File                                                           | Action                                |
| -------------------------------------------------------------- | ------------------------------------- |
| `src/lib/timerExportUtils.ts`                                  | Delete                                |
| `src/lib/__tests__/timerExportUtils.test.ts`                   | Delete                                |
| `src/hooks/__tests__/useTimesheetImport.analyzeExport.test.ts` | Delete                                |
| `src/components/tracker/ConsolidationDialog.tsx`               | Delete                                |
| `src/pages/__tests__/TrackerList.export-conflicts.test.tsx`    | Delete                                |
| `src/pages/TrackerList.tsx`                                    | Revert to pre-change version          |
| `src/hooks/useTimesheetImport.ts`                              | Revert to pre-change version          |
| `src/locales/en.json`                                          | Remove `tracker.consolidation.*` keys |
| `src/locales/es.json`                                          | Remove `tracker.consolidation.*` keys |


### User-Visible Behavior After Rollback

Export returns to silent aggregation, no conflict detection, no stale guard.

### Post-Rollback Verification

- Export of single-entry selections works (no dialog)
- Export of multi-entry selections aggregates silently
- No console errors referencing timerExportUtils or ConsolidationDialog
- `useTimesheetImport` returns only `{ exportEntries, isExporting }`
- Locale files have no `tracker.consolidation.*` keys
- All existing tracker tests pass

---

## Risk Register


| ID  | Risk                                           | Likelihood | Impact | Mitigation                                                                                                                                                                                        |
| --- | ---------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Grouping logic drift between utility and hook  | Low        | High   | Single shared utility module; same key formula                                                                                                                                                    |
| R2  | Hidden filtered entries not considered         | Low        | High   | handleExport uses `entries` (L57), never `filteredEntries` (L139)                                                                                                                                 |
| R3  | Policy misinterpretation by users              | Medium     | Medium | Dialog states "partial push not allowed"; copy reviewed EN/ES                                                                                                                                     |
| R4  | Regression in export merge semantics           | Low        | High   | `exportEntries` body NOT modified                                                                                                                                                                 |
| R5  | Dialog blocks fast single-entry export         | Low        | Low    | Dialog only when consolidation/conflicts exist                                                                                                                                                    |
| R6  | Stale preflight due to concurrent data changes | Low        | Medium | Confirm-time revalidation via `analysisEquals` with normalized sort+dedupe comparison of eligibleIds, conflict keys, per-group membership, selectedIds; abort-on-drift with changed-row highlight |


---

## **Improvements**

1. Clarify whether `previousAnalysis` is reset to `null` on dialog close to avoid stale visual carry-over on next open.

&nbsp;

## Definition of Done

- `timerExportUtils.ts` created with 5 functions and types; `ConflictPolicy` has NO `selected_only` value
- `analysisEquals` uses normalized (sorted, deduped) comparison of eligibleIds, conflict key sets, per-group membership hashes, and selectedIdsSnapshot
- `analyzeExport` added to `useTimesheetImport` hook return; populates `eligibleIds` and `selectedIdsSnapshot`
- `ConsolidationDialog` created; conflict mode offers exactly 3 buttons; stale-refresh highlights changed conflict rows
- `TrackerList.handleExport` gates export using ALL eligible entries (not `filteredEntries`)
- Stale-preflight guard in all confirm handlers; aborts on drift with visual refresh
- `selectedIds` cleared after successful export; preserved on cancel and stale-abort
- No partial export of conflicted groups by design and by test
- Empty resolved set handled with info toast, no export call
- Info-only dialog for consolidation without conflicts
- No dialog when no consolidation and no conflicts
- Success/excluded toasts with consolidation summary
- All locale keys in EN and ES
- 14 utility tests pass (`src/lib/__tests__/timerExportUtils.test.ts`)
- 3 hook contract tests pass (`src/hooks/__tests__/useTimesheetImport.analyzeExport.test.ts`)
- 6 UI/integration tests pass (`src/pages/__tests__/TrackerList.export-conflicts.test.tsx`)
- `exportEntries` function body unchanged
- Changelog appended via adaptive rule: latest `docs/CHANGELOG-*.md` by filename sort; if none exist, create `docs/CHANGELOG-YYYY-MM-DD.md`

---

## Adaptive Changelog Rule

**Target:** Latest `docs/CHANGELOG-*.md` by filename sort. If no CHANGELOG files exist, create `docs/CHANGELOG-YYYY-MM-DD.md` with current date.

**Entry template:**

```text
### Bug 0220-64: Timer Entries Consolidation on Export

**Plan**: Bug_0220-64_v8 (supersedes v7)
**Priority**: Alta

#### Problem
Silent consolidation of timer entries sharing Date+Engagement+Activity. No conflict detection for unselected matching entries. Partial pushes possible despite business rule forbidding it.

#### Implementation
- NEW: src/lib/timerExportUtils.ts (pure utility, 5 functions incl. analysisEquals with normalized comparison)
- NEW: src/components/tracker/ConsolidationDialog.tsx (info + conflict modes, stale-refresh highlight)
- MODIFY: src/hooks/useTimesheetImport.ts (analyzeExport preflight with stale-detection fields)
- MODIFY: src/pages/TrackerList.tsx (two-phase export with stale guard + post-action selectedIds mgmt)
- MODIFY: src/locales/en.json, es.json (consolidation keys)

#### Tests
- 14 utility tests, 3 hook contract tests, 6 UI/integration tests
- Atomicity assertion: no partial export of conflicted groups
- Stale-preflight guard test: abort on drift with normalized comparison

#### Policy
ATOMIC_GROUP_EXPORT: Include All Matching | Exclude Conflicting Groups | Cancel
No "Selected Only" option. exportEntries body unchanged.
```