# Bug Plan — 0220-57: Funcionalidad Buscar Encargo

## Context

**Bug restated:** In the Hoja de Tiempo (Timesheet) page, the "Seleccionar Encargo" dropdown
is a plain `<Select>` component with no search capability and no consistent ordering. As the
engagement list grows, users must scroll through the entire list to find the right engagement —
an increasingly painful UX problem.

**Screenshot analysis:** The screenshot confirms the problem clearly. The open dropdown shows
engagements from different clients (`Telefónica`, `CITSA S.A.`, `Itacamba Cemento`, etc.)
intermixed with no apparent sort order. There is no search input — just a scrollable list with
up/down arrows. A user looking for a specific engagement must visually scan the entire list.

**User suggestion (acceptance criteria):**
1. Sort list by Client then Engagement code/name.
2. Add a search-select (combobox) so users can filter by typing.

**Key finding:** A production-ready `EngagementCombobox` using `cmdk` + Radix Popover already
exists at `src/components/tracker/EngagementCombobox.tsx`. It handles search, keyboard
navigation, empty state, and check-icon selection. It only needs a minor extension to support
displaying the client name (which the current `<Select>` already shows).

---

## Root Cause Hypothesis

Two independent issues:

1. **No sorting** — `useTimesheetWeek.ts:196` returns `Array.from(merged.values())` with no
   `.sort()` call. Group A and B are fetched from Supabase without an ORDER BY, so order is
   arbitrary.

2. **No search** — `TimesheetGrid.tsx:761-789` uses Radix `<Select>` / `<SelectContent>` which
   has no built-in filter input. The correct primitive for a searchable dropdown is the
   `Command` / `Popover` pattern already used by `EngagementCombobox`.

---

## Proposed Fix

**Three-file change, minimum scope:**

### 1. Sort engagements at the data layer
`src/hooks/useTimesheetWeek.ts` line 196 — replace the bare `Array.from` with a sorted version:

```ts
return Array.from(merged.values()).sort((a, b) => {
  const ca = a.client?.client_legal_name ?? "";
  const cb = b.client?.client_legal_name ?? "";
  if (ca !== cb) return ca.localeCompare(cb);
  const ea = a.engagement_code ?? a.engagement_name;
  const eb = b.engagement_code ?? b.engagement_name;
  return ea.localeCompare(eb);
});
```

This ensures every consumer of the hook (timesheet and any future screens) receives a
consistently sorted list at no extra cost.

### 2. Extend `EngagementCombobox` to support client name + accept triggerClassName
`src/components/tracker/EngagementCombobox.tsx` — two additions, both backward-compatible:

- Add `client?: { client_legal_name: string } | null` to the per-item shape in the props
  interface (optional — existing tracker callers omit it; the component renders it only
  when present).
- Add `triggerClassName?: string` to `EngagementComboboxProps` so the timesheet can apply
  `"border-0 bg-transparent focus:ring-1"` to match the existing table-cell styling.
- Inside `<CommandItem>` rendering, add a `<span className="text-xs opacity-70">` for
  `eng.client?.client_legal_name` below the code/name line when available.
- Thread `triggerClassName` into the `<Button className={...}>` of the trigger.
- Change the search placeholder from `t("tracker.searchEngagement")` to a prop
  `searchPlaceholder?: string` defaulting to the same key — so the timesheet can pass its
  own i18n key if needed (currently the same value exists under `tracker.*`, so no new keys
  are required).

### 3. Replace `<Select>` with `<EngagementCombobox>` in `TimesheetGrid`
`src/components/timesheet/TimesheetGrid.tsx` lines 761-789 — swap out the `<Select>` block:

```tsx
<EngagementCombobox
  engagements={availableEngagements}   // ApprovedEngagement[] already has client field
  value={row.engagementId}
  onValueChange={(val) => handleEngagementChange(row.id, val)}
  disabled={isRowLocked}
  triggerClassName="border-0 bg-transparent focus:ring-1 h-auto min-h-[2rem]"
  placeholder={t("timesheet.selectEngagement")}
/>
```

Remove the now-unused `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`
imports if they are no longer used elsewhere in the file (check before removing).

---

## Files to Change

| File | Change |
|------|--------|
| `src/hooks/useTimesheetWeek.ts` | Add `.sort()` at line 196 (2-line change) |
| `src/components/tracker/EngagementCombobox.tsx` | Extend props interface + render client + add `triggerClassName` prop (≈15 lines) |
| `src/components/timesheet/TimesheetGrid.tsx` | Replace `<Select>` block (lines 761-789) with `<EngagementCombobox>` + add import |

**No new files required.** No DB changes. No i18n keys required (existing `tracker.*` keys
are reused; both EN and ES already have `searchEngagement` and `noMatchingEngagements`).

---

## Tests to Add or Update

### New test file
**`src/components/timesheet/__tests__/timesheetEngagementSort.test.ts`**

Pattern: pure-function test (matching the project style in `timesheetEngagementWeekOverlap.test.ts`).

```ts
// Extract and test the sort comparator as a standalone function
sortEngagements([...unsorted]) → [expected order]
```

Cases to assert:
1. Items with different clients sort alphabetically by `client_legal_name`.
2. Items with the same client sort by `engagement_code` (lexicographic).
3. Engagements with `client = null` sort before those with a client name (empty string < any name).
4. Engagements with `engagement_code = null` fall back to `engagement_name` for comparison.

No existing tests need to be updated (sorting is additive; week-overlap and activity-transition
tests use hard-coded engagement arrays that are not order-sensitive).

---

## Verification Steps

1. **Reproduce the original symptom:**
   - Navigate to OPERACIONES → Hoja de Tiempo.
   - Open a timesheet week and click "Seleccionar Encargo" on any row.
   - Observe: long unsorted list, no search input.

2. **After the fix:**
   - Same flow — the dropdown should now open as a combobox (Popover + CommandInput).
   - Typing part of a client name or engagement code should filter the list in real time.
   - The full list (when the search box is empty) should be sorted: client A–Z, then code A–Z
     within each client group.
   - Selecting an engagement should close the popover and display the selected engagement in the
     trigger button (code + name).
   - A locked row (`isRowLocked = true`) should render the trigger as disabled (greyed out,
     non-interactive) — same as the current `<Select disabled>` behavior.

3. **Run tests locally:**
   ```bash
   npx vitest run src/components/timesheet/__tests__/timesheetEngagementSort.test.ts
   npx vitest run src/components/timesheet/__tests__
   npx vitest run src/hooks/__tests__
   ```

---

## Regression Risks

| Risk | Guard |
|------|-------|
| Tracker page (`src/components/tracker/`) passes engagements to `EngagementCombobox` without a `client` field — should continue working since `client` is optional | Verify tracker combobox still renders and searches correctly after the interface change |
| Sorting in `useTimesheetWeek` changes the order of `groupA` items — the existing `availableEngagements` `useMemo` filter in `TimesheetGrid` is order-independent, so no functional impact | Covered by existing tests that use fixed arrays |
| Combobox popover z-index inside a `<table>` cell — some browsers clip `overflow: hidden` on `<td>` parents | Test manually in Chrome + Firefox; the existing `<SelectContent>` uses a portal so this is already solved; Radix `<PopoverContent>` also uses a portal by default |
| The timesheet mobile view — the combobox trigger uses `w-full`, which should adapt well; double-check on narrow viewports | Manual check on 375 px width |

---

## Out of Scope

- Sorting or searching the **"Seleccionar Actividad"** dropdown (separate issue if needed).
- Adding a search box to the tracker `EngagementCombobox` display label (it already has one).
- Pagination or virtual scrolling for very large lists.
- Any backend / Supabase / Edge Function changes.

---

## Open Questions

_None at this time. The bug report, screenshot, and codebase exploration are fully consistent._
