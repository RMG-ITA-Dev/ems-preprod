
# Plan v4 -- Bug 0213-26: Redesign "Cronometro" into "Registros de Tiempo"

All GPTCODEX3 tightenings incorporated. This plan is implementation-ready with exact line references, verified icon availability, consistent i18n namespacing, deterministic period resolution (no null fallback), selective import marking, and explicit multi-week handling.

---

## Architecture

A new shared hook `useTimesheetImport` centralizes the entire export-to-timesheet pipeline. The TrackerList page is the single canonical place to export records. The Timesheet page's import button and `TimerImportDialog` component are removed. Toast responsibility is split cleanly: the hook returns a result object and throws only on unexpected failures; the caller (TrackerList) shows all toasts.

---

## New File: `src/hooks/useTimesheetImport.ts`

### Interface

```text
interface ImportResult {
  newCount: number;      // new time_entries rows created
  mergedCount: number;   // existing time_entries rows with hours added
  blockedCount: number;  // timer entries blocked because target week is submitted
  blockedWeeks: string[] // formatted week start dates (DD/MM/YYYY) for blocked weeks
}

useTimesheetImport({ staffId: string })
  -> { exportEntries(entries: TimerEntry[]): Promise<ImportResult>, isExporting: boolean }
```

### Execution Pipeline (9 steps)

**Step 1 -- Date extraction**: For each timer entry, extract local date using `format(parseISO(entry.started_at), "yyyy-MM-dd")` (avoids UTC shift for Bolivia UTC-4).

**Step 2 -- Aggregate**: Group entries by `(engagement_id, activity_id, date_worked)` key. Sum `duration_minutes` per group. Collect all `timer_id`s belonging to each group.

**Step 3 -- Round**: For each group: `hours = Math.round((totalMinutes / 60) * 10) / 10` (1 decimal, matches Timesheet grid precision).

**Step 4 -- Compute week starts**: For each unique `date_worked`, compute its week Monday using `getWeekMonday(parseDateLocal(dateWorked))` -- reusing the same `getWeekMonday` from `@/lib/timesheetUtils` that the Timesheet page uses (Monday-based, `startOfWeek` with `weekStartsOn: 1`).

**Step 5 -- Period resolution (deterministic, no null fallback)**: For each unique week start:
  1. `SELECT * FROM timesheet_periods WHERE staff_id = X AND week_start_date = weekStartStr` (using `.maybeSingle()`)
  2. If found, use its `period_id` and check `submitted_at`
  3. If NOT found, `INSERT` a new period (same fields as `useTimesheetWeek` lines 88-103: `staff_id`, `week_start_date`, `week_number`, `year`, `total_hours: 0`)
  4. If INSERT fails (any error), treat all entries for that week as **blocked** and add to `blockedWeeks`. Do NOT throw.

**Step 6 -- S5 submission block**: For each resolved period, check `submitted_at !== null`. If submitted, mark all entries for that week as **blocked**. Blocked timer entries are NOT inserted into `time_entries` and NOT marked as imported. They remain selectable in the list for future export after unsubmit.

**Step 7 -- Deterministic upsert (SELECT-first, not error-driven)**: For each non-blocked aggregated group:
  1. `SELECT time_id, hours_logged FROM time_entries WHERE staff_id=X AND engagement_id=Y AND activity_id=Z AND date_worked=D AND is_forecast=false` (`.maybeSingle()`)
  2. If row exists: `UPDATE SET hours_logged = existing.hours_logged + roundedHours` -> count as "merged"
  3. If no row: `INSERT` with `period_id` from step 5 -> count as "new"
  4. Collect the `time_id` for marking timer entries

**Step 8 -- Mark imported (selective)**: Only the `timer_id`s from successfully exported groups (not blocked) are passed to `useMarkTimerEntriesImported`. Blocked timer entries remain `is_imported = false`.

**Step 9 -- Cache invalidation**: Using prefix-level invalidation for multi-week support:
```text
queryClient.invalidateQueries({ queryKey: ["time-entries"] })
queryClient.invalidateQueries({ queryKey: ["timesheet-period"] })
queryClient.invalidateQueries({ queryKey: ["timer_entries"] })
queryClient.invalidateQueries({ queryKey: ["timer_entries_unimported"] })
```

### Toast responsibility

The hook does NOT toast. It returns `ImportResult` on success and throws on unexpected/technical failures. The caller (TrackerList) handles all toast logic based on the result.

### Key imports (all verified in codebase):
- `getWeekMonday`, `toISODateString`, `parseDateLocal` from `@/lib/timesheetUtils`
- `format`, `parseISO`, `getISOWeek`, `getYear` from `date-fns`
- `supabase` from `@/integrations/supabase/client`
- `useMarkTimerEntriesImported`, `TimerEntry` from `@/hooks/useTimerEntries`
- `useQueryClient` from `@tanstack/react-query`

---

## File Changes

### 1. `src/locales/es.json` -- i18n Updates

All keys under existing namespaces. Code calls them as `t("nav.tracker")` and `t("tracker.xxx")`.

| Key (path) | Line | Action | Old Value | New Value |
|------------|------|--------|-----------|-----------|
| `nav.tracker` | 64 | RENAME | `"Cronometro"` | `"Registros de Tiempo"` |
| `tracker.title` | 73 | RENAME | `"Cronometro"` | `"Registros de Tiempo"` |
| `tracker.importToTimesheet` | 132 | RENAME | `"Importar a Hoja de Tiempo"` | `"Exportar a la Hoja de Tiempo"` |

New keys to ADD inside `"tracker": { ... }` after line 134 (`importError`):
```json
"newManualEntry": "Nuevo Registro de Tiempo",
"exportSuccess": "{{count}} registros exportados a la hoja de tiempo",
"exportSuccessMerged": "{{newCount}} exportados, {{mergedCount}} combinados con existentes",
"exportError": "Error al exportar registros",
"exportBlockedSubmitted": "La semana del {{weekStart}} ya fue enviada. Debe retirar el envio antes de exportar.",
"exportBlocked": "{{blockedCount}} registros bloqueados (semanas ya enviadas: {{weeks}})",
"noPeriodForWeek": "No se pudo crear la hoja de tiempo para la semana del {{weekStart}}"
```

### 2. `src/locales/en.json` -- i18n Updates

Same pattern:

| Key (path) | Line | Action | Old Value | New Value |
|------------|------|--------|-----------|-----------|
| `nav.tracker` | 64 | RENAME | `"Time Tracker"` | `"Time Records"` |
| `tracker.title` | 73 | RENAME | `"Time Tracker"` | `"Time Records"` |
| `tracker.importToTimesheet` | 132 | RENAME | `"Import to Timesheet"` | `"Export to Timesheet"` |

New keys to ADD inside `"tracker": { ... }` after line 134:
```json
"newManualEntry": "New Time Record",
"exportSuccess": "{{count}} records exported to timesheet",
"exportSuccessMerged": "{{newCount}} exported, {{mergedCount}} merged with existing",
"exportError": "Error exporting records",
"exportBlockedSubmitted": "The week of {{weekStart}} is already submitted. You must unsubmit before exporting.",
"exportBlocked": "{{blockedCount}} records blocked (weeks already submitted: {{weeks}})",
"noPeriodForWeek": "Could not create timesheet period for the week of {{weekStart}}"
```

### 3. `src/pages/TrackerList.tsx` -- Major Redesign

**3a. Import changes (lines 1-44):**

REMOVE:
- Line 34: `TimerImportDialog` import
- Line 35: `useMarkTimerEntriesImported` from import (keep `useTimerEntries`, `TimerEntry`, `useDeleteTimerEntry`, `useCreateTimerEntry`)
- Line 36: `supabase` import (no longer needed directly)
- Line 33: `Upload` from lucide imports

ADD:
- `Checkbox` from `@/components/ui/checkbox`
- `ManualEntryDialog` from `@/components/tracker/ManualEntryDialog`
- `useTimesheetImport` from `@/hooks/useTimesheetImport`
- `ArrowUpFromLine`, `FileText` from `lucide-react` (both verified to exist in installed lucide version)
- `parseISO` from `date-fns`
- `format` is already imported (line 4)

**3b. State changes (lines 59-71):**

REMOVE:
- Line 59: `const markImported = useMarkTimerEntriesImported();`
- Line 60: `const [isImporting, setIsImporting] = useState(false);`
- Line 71: `const [importDialogOpen, setImportDialogOpen] = useState(false);`

ADD:
- `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());`
- `const [manualDialogOpen, setManualDialogOpen] = useState(false);`
- `const { exportEntries, isExporting } = useTimesheetImport({ staffId: staffRecord?.staff_id || "" });`

**3c. Selection helpers (new, after line 245):**

```text
const isSelectable = (entry: TimerEntry) => !!entry.ended_at && !entry.is_imported;

const selectableEntries = useMemo(
  () => filteredEntries.filter(isSelectable),
  [filteredEntries]
);

const toggleSelect = (timerId: string, e?: React.MouseEvent) => {
  e?.stopPropagation();
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(timerId)) next.delete(timerId);
    else next.add(timerId);
    return next;
  });
};

const toggleSelectAll = () => {
  if (selectedIds.size === selectableEntries.length && selectableEntries.length > 0) {
    setSelectedIds(new Set());
  } else {
    setSelectedIds(new Set(selectableEntries.map(e => e.timer_id)));
  }
};
```

NOTE on filter changes: when filters change, `selectableEntries` recomputes from `filteredEntries`. Selected IDs that no longer appear in the filtered view are harmless (they just won't render a checked checkbox). On export, we always pull from the FULL `entries` list using `entries?.filter(e => selectedIds.has(e.timer_id))` to avoid missing selected entries that were filtered out of view.

**3d. Export handler (replaces `handleImport` at lines 248-293):**

```text
const handleExport = async () => {
  const selected = entries?.filter(e => selectedIds.has(e.timer_id)) || [];
  if (selected.length === 0) return;

  try {
    const result = await exportEntries(selected);
    setSelectedIds(new Set());

    // Toast feedback (caller responsibility -- hook does not toast)
    if (result.mergedCount > 0) {
      toast.success(t("tracker.exportSuccessMerged", {
        newCount: result.newCount,
        mergedCount: result.mergedCount
      }));
    } else if (result.newCount > 0) {
      toast.success(t("tracker.exportSuccess", { count: result.newCount }));
    }
    if (result.blockedCount > 0) {
      toast.warning(t("tracker.exportBlocked", {
        blockedCount: result.blockedCount,
        weeks: result.blockedWeeks.join(", ")
      }));
    }
  } catch (error) {
    console.error("Export error:", error);
    toast.error(t("tracker.exportError"));
  }
};
```

**3e. Manual entry handler (new):**

Reuses same logic as `TrackerRecord.handleManualSubmit` (lines 231-303) but simplified (always creates, never edits):

```text
const handleManualSubmit = async (data: {
  engagement_id: string;
  activity_id: string;
  description: string;
  date: Date;
  startTime: string;
  endTime: string;
}) => {
  if (!staffRecord?.staff_id) return;

  const [startHour, startMin] = data.startTime.split(":").map(Number);
  const [endHour, endMin] = data.endTime.split(":").map(Number);

  const startDate = new Date(data.date);
  startDate.setHours(startHour, startMin, 0, 0);
  const endDate = new Date(data.date);
  endDate.setHours(endHour, endMin, 0, 0);

  if (endDate <= startDate) {
    toast.error(t("tracker.invalidTimeRange"));
    return;
  }

  const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

  try {
    await createEntry.mutateAsync({
      staff_id: staffRecord.staff_id,
      engagement_id: data.engagement_id,
      activity_id: data.activity_id,
      description: data.description || undefined,
      started_at: startDate.toISOString(),
      ended_at: endDate.toISOString(),
      duration_minutes: durationMinutes,
    });
    toast.success(t("tracker.entryAdded"));
    setManualDialogOpen(false);
  } catch (error) {
    toast.error(t("tracker.errorAdding"));
  }
};
```

NOTE: Unlike `TrackerRecord`, we do NOT apply `roundToNearest5` here because the manual entry is not a timer stop -- the user explicitly specified the time range.

**3f. Button bar redesign (replaces lines 336-361):**

Three buttons, left to right:

1. **"Exportar a la Hoja de Tiempo"** -- `ArrowUpFromLine` icon, `variant="outline"`, disabled when `selectedIds.size === 0 || isExporting`. Badge shows count of selected entries.

2. **"+ Usar Cronometro"** -- `Plus` icon, `variant="default"`, navigates to `/tracker/new`. Unchanged behavior.

3. **"+ Nuevo Registro de Tiempo"** -- `FileText` icon, `variant="outline"`, opens `ManualEntryDialog`.

**3g. Checkbox column in desktop table (lines 484-608):**

Add a new FIRST column (width `4%`):
- Header: `<Checkbox>` (select all selectable). `checked={selectedIds.size === selectableEntries.length && selectableEntries.length > 0}`. `indeterminate` state when partially selected.
- Each row: `<Checkbox>` if `isSelectable(entry)`, otherwise empty cell. `onClick` calls `e.stopPropagation()` to prevent row navigation. `onCheckedChange` calls `toggleSelect(entry.timer_id)`.

Adjust other column widths slightly to accommodate (reduce Engagement from 24% to 22%, Description from 15% to 13%).

**3h. Checkbox in mobile card view (lines 382-477):**

For each card where `isSelectable(entry)`, add a `<Checkbox>` in the top-left of the card's primary info row (before the engagement name). The checkbox gets `onClick={e => e.stopPropagation()}` and `min-h-[44px] min-w-[44px]` touch target wrapping.

**3i. Remove `TimerImportDialog` (lines 726-733):**

Delete the `TimerImportDialog` component entirely. Replace with:
```text
<ManualEntryDialog
  open={manualDialogOpen}
  onOpenChange={setManualDialogOpen}
  onSubmit={handleManualSubmit}
/>
```

### 4. `src/pages/TimeSheet.tsx` -- Remove Import Feature

Lines to REMOVE:
- Line 9: `TimerImportDialog` import
- Line 10: `useUnimportedTimerEntries, useMarkTimerEntriesImported` imports
- Line 8: `Upload` from lucide imports (keep all other icons)
- Line 67: `const [importDialogOpen, setImportDialogOpen] = useState(false);`
- Lines 117-121: `unimportedTimerEntries`, `markTimerImported`, `isTimerImporting` state/hooks
- Lines 269-305: `handleTimerImport` function
- Lines 456-468: Import button in the actions footer
- Lines 529-536: `TimerImportDialog` component

Net result: ~60 lines removed. No new lines. The page becomes simpler.

### 5. `src/components/tracker/TimerImportDialog.tsx` -- DELETE

Verified: only imported by `TrackerList.tsx` (line 34) and `TimeSheet.tsx` (line 9). Both usages removed in this plan. No barrel exports reference it. Safe to delete.

### 6. `src/components/tracker/ManualEntryDialog.tsx` -- Fix Styling

Line 196: Replace `style={{ backgroundColor: "hsl(var(--brand-purple))" }}` with `className="bg-brand-purple hover:bg-brand-purple/90 text-primary-foreground"`.

### 7. `docs/CHANGELOG-2026-02-13.md` -- Append Entry

Append a detailed BUG #0213-26 entry documenting the redesign, all defects, the shared hook architecture, and S1-S5 coverage.

---

## GPTCODEX3 Tightening Checklist

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | Define "week start" consistently | Uses `getWeekMonday` from `@/lib/timesheetUtils` (Monday-based via `startOfWeek` with `weekStartsOn: 1`). Same function used by `TimeSheet.tsx` line 61 and `useTimesheetWeek`. No re-implementation. |
| 2 | Toast responsibility unambiguous | Hook returns `ImportResult`, never toasts. TrackerList handles all success/warning toasts. Hook throws only on unexpected technical errors, which TrackerList catches and shows as `tracker.exportError`. |
| 3 | Period auto-create failure must not partially export | If period INSERT fails, that week is treated as blocked (added to `blockedWeeks`). Its timer entries are NOT marked imported. Other weeks still export normally. |
| 4 | Selection from full set, not filtered set | Export uses `entries?.filter(e => selectedIds.has(e.timer_id))` (full dataset). Checkboxes render against `filteredEntries` for display, but selection IDs persist across filter changes. |
| 5 | Verify icons exist in installed lucide | `ArrowUpFromLine` -- verified in `node_modules/lucide-react/dynamicIconImports.d.ts` line 24655. `FileText` -- verified at line 16206. `ClipboardEdit` does NOT exist -- not used. |
| 6 | TimerImportDialog deletion safe | Verified only 2 files import it: `TrackerList.tsx` line 34 and `TimeSheet.tsx` line 9. No barrel exports. Both removed in this plan. |

---

## S1-S5 Requirement Mapping

| Req | Description | How Addressed |
|-----|-------------|---------------|
| S1 | Cronometro is one input method; export records to timesheet | Shared hook handles export; list view is the control plane |
| S2 | Sidebar "Registros de Tiempo"; 3 buttons in list | `nav.tracker` renamed; 3-button layout: Export, +Cronometro, +Nuevo Registro de Tiempo |
| S3 | Manual entry equally valid; accessible from list | `ManualEntryDialog` opens via "+Nuevo Registro de Tiempo" button |
| S4 | Checkbox selection on list rows before export | Checkbox column on desktop table + mobile cards; "select all" header |
| S5 | Export multiple times until submitted, then block | Hook checks `submitted_at` per resolved period; blocks with error message; blocked entries NOT marked imported |

---

## Data Integrity Improvements

| Issue | Fix |
|-------|-----|
| UTC date shift (Bolivia UTC-4) | `format(parseISO(started_at), "yyyy-MM-dd")` |
| No aggregation (chatty DB) | Group by `(engagement, activity, date)` before DB operations |
| Floating-point drift | `Math.round((mins / 60) * 10) / 10` |
| Missing `period_id` | Deterministic lookup + auto-create; never null on success; blocked on failure |
| Silent duplicate failure | Deterministic SELECT-first then INSERT or UPDATE; no 23505 reliance |
| No submission block (S5) | Check `submitted_at` per period; block and report |
| No cache invalidation | Prefix-level invalidation for all relevant query keys |
| No user feedback | Caller shows success/warning/error toasts based on `ImportResult` |

---

## File Summary

| File | Action |
|------|--------|
| `src/hooks/useTimesheetImport.ts` | CREATE -- shared export hook |
| `src/pages/TrackerList.tsx` | MODIFY -- 3 buttons, checkboxes, ManualEntryDialog, use shared hook |
| `src/pages/TimeSheet.tsx` | MODIFY -- remove import button, dialog, and related state/hooks |
| `src/components/tracker/TimerImportDialog.tsx` | DELETE |
| `src/components/tracker/ManualEntryDialog.tsx` | MODIFY -- fix hardcoded button style |
| `src/locales/es.json` | MODIFY -- rename nav + tracker keys, add export feedback keys |
| `src/locales/en.json` | MODIFY -- same |
| `docs/CHANGELOG-2026-02-13.md` | MODIFY -- append BUG #0213-26 entry |

---

## Risk Assessment

| Area | Risk | Mitigation |
|------|------|------------|
| Shared hook complexity | Medium | Each step is isolated. No external API calls. Pipeline is sequential and debuggable. |
| Period auto-creation | Low | Same INSERT pattern as `useTimesheetWeek` (lines 93-103). Already works in production. |
| Multi-week export | Low | Groups independently per week. Blocking is per-week. Partial success is allowed. |
| Deterministic upsert (SELECT then UPDATE) | Low | Not perfectly atomic, but race conditions extremely unlikely (single user on own data). |
| Removing Timesheet import | Low | Product decision (single canonical flow). Shared hook reusable if needed later. |
| Checkbox touch targets on mobile | Medium | Wrap checkbox in 44x44px container. Test on 390px viewport. |

---

## Acceptance Tests

**Test 1: Sidebar shows "Registros de Tiempo"**
Verify sidebar (desktop) and bottom nav (mobile) display the new label in both ES and EN.

**Test 2: Three-button layout**
Open `/tracker`. Verify: "Exportar a la Hoja de Tiempo" (disabled, no selection), "+ Usar Cronometro", "+ Nuevo Registro de Tiempo".

**Test 3: Checkbox selection and export**
1. Create 3 completed timer entries for the current week.
2. Select 2 via checkboxes. Export button badge shows "2".
3. Click Export. Success toast appears. Entries now show "Importado" badge. Checkboxes disappear for them.
4. Open Timesheet. Entries appear in grid.

**Test 4: Aggregation + rounding**
1. Create 2 timer entries: same engagement, same activity, same day. Duration 23 min and 24 min.
2. Select both, export.
3. Verify: Timesheet shows 1 row with 0.8 hours (47 min / 60 = 0.7833 -> rounds to 0.8). Not 2 separate rows.

**Test 5: Additive merge with existing**
1. On Timesheet, manually enter 2.0h for Engagement X, Activity Y, Monday.
2. Create a timer entry for the same combo on Monday (30 min = 0.5h).
3. Export. Verify: Timesheet cell shows 2.5h.

**Test 6: S5 submission block**
1. Submit the timesheet for Week A.
2. Create a timer entry dated in Week A. Select it, click Export.
3. Verify: warning toast says the week is already submitted. Entry remains "Listo" (not imported). Entry stays selectable.

**Test 7: Multi-week export (mixed)**
1. Have entries spanning 2 weeks. Week A is submitted. Week B is not.
2. Select entries from both weeks. Export.
3. Verify: Week B entries exported (success toast). Week A entries blocked (warning toast listing blocked week). Week A entries remain "Listo".

**Test 8: Manual entry from list**
1. Click "+ Nuevo Registro de Tiempo". Fill engagement, activity, date, time range.
2. Submit. New entry appears in list with "Listo" badge.
3. Select it, export. Verify it lands on the Timesheet.

**Test 9: Timesheet page has no import button**
Open `/timesheet`. Confirm no "Importar del Cronometro" button anywhere.

**Test 10: Mobile responsive**
Verify checkboxes (44px touch targets), 3-button layout, and manual entry dialog work correctly on mobile (390px viewport).
