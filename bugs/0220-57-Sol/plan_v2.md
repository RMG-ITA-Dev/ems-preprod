# Bug Plan v2 — 0220-57: Funcionalidad Buscar Encargo _Synthesized from plan_claude_v1.md (Plan A) and plan_codex_v1.md (Plan B)_
---
## Comparison Matrix

   | Section | Plan A position | Plan B position | Agreement? | Chosen
   position | Reason |
   |---------|----------------|-----------------|:----------:|-----------
   ------|--------|
   | **Sort location** | Add `.sort()` in `useTimesheetWeek.ts:196` (data
    layer) | New pure helper `src/lib/timesheetEngagementOptions.ts`;
   wired into `TimesheetGrid` useMemo | ❌ | **Plan B** | Sorting is a
   presentation concern. The hook serves multiple consumers; silently
   reordering its output risks unintended side-effects elsewhere. A pure
   helper is testable in isolation and stays out of shared state. |
   | **Component approach** | Extend existing tracker
   `EngagementCombobox` with optional `client` + `triggerClassName` props
    | New dedicated
   `src/components/timesheet/TimesheetEngagementCombobox.tsx` | ❌ |
   **Plan B** | New file = zero tracker regression risk. Optional props
   on shared components leak timesheet concerns into tracker module.
   Dedicated component is fully self-contained. |
   | **i18n keys** | Reuse `tracker.searchEngagement` /
   `tracker.noMatchingEngagements` | Add `timesheet.searchEngagement` /
   `timesheet.noMatchingEngagements` | ❌ | **Plan B** | Correct module
   boundary. Tracker and timesheet may evolve independently. Cost is
   negligible (4 lines across 2 files). |
   | **Sort algorithm** | `client_legal_name` → `engagement_code ??
   engagement_name` | Same (stated as default recommendation) | ✅ |
   **Both** | Directly matches JSON: "Ordenar lista por Cliente y
   Encargo". |
   | **Null-client sort order** | Nulls → `""` → sort first
   (internal/admin engagements at top) | Not specified | N/A | **Plan A
   default** | Internal engagements (ADM_*) are frequently used;
   appearing at top of the sorted list is desirable UX. |
   | **Search scope** | Not specified | Search across code + name +
   client name | N/A | **Plan B** | Client name is a primary
   disambiguator in the screenshot. `cmdk` `CommandItem.value` prop
   carries all three fields so no extra filter logic is needed. |
   | **Hook changes** | Modify `useTimesheetWeek.ts` | No hook changes |
   ❌ | **Plan B** | Smallest scope; hook is unchanged. |
   | **Tracker changes** | Modify `EngagementCombobox.tsx` | No tracker
   changes | ❌ | **Plan B** | Zero cross-module risk. |
   | **Test coverage** | 1 file: pure sort test | 3 files: sort helper +
   combobox component + grid integration | ❌ | **Hybrid** | Sort helper
   test + combobox component test (2 files). Grid integration test
   omitted — it adds complexity without meaningful incremental coverage
   given the component test already validates the key behaviors. |
   | **Open questions** | None declared | 2: definition of "Encargo" sort
    key; whether search includes client | ❌ | **Plan B defaults
   adopted** | Both defaults (sort by code-then-name; search includes
   client) are reasonable and unambiguous. No human decision needed
   before execution. |

   ---

   ## Context

   **Bug restated:** In OPERACIONES → Hoja de Tiempo, the "Seleccionar
   Encargo" cell in each
   timesheet row uses a plain Radix `<Select>`. As the engagement list
   grows, users must scroll
   through an unsorted wall of options with no way to filter. Reporter
   (lcandia) requests two
   improvements: (1) sort by Client then Engagement, and (2) replace the
   dropdown with a
   search-select combobox.

   **Screenshot analysis:** The open dropdown shows engagements from
   multiple clients
   (`Telefónica Celular de Bolivia S.A.`, `CITSA S.A.`, `Itacamba
   Cemento`, `Laboratorios ESFASA`,
   `Ruizmier Pelaez S.R.L. ADMIN`) in no deterministic order. Each item
   already renders
   `engagement_code`, `engagement_name`, and `client_legal_name` — the
   missing feature is purely
   discoverability via search and consistent ordering.

   **Acceptance criteria (from JSON packet):**
   1. List is sorted by Client (A–Z), then by Engagement code/name within
    each client.
   2. A search-select box is present so users can type to filter the
   list.

   ---

   ## Root Cause Hypothesis

   Two independent defects:

   1. **No sort** — `src/hooks/useTimesheetWeek.ts:196` returns
   `Array.from(merged.values())`
      with no `.sort()`. Supabase fetch order is non-deterministic, so
   displayed order is
      arbitrary.

   2. **No search** —
   `src/components/timesheet/TimesheetGrid.tsx:761-789` renders a Radix
      `<Select>` / `<SelectContent>`. This control provides scroll
   buttons but no inline
      `CommandInput`-style filtering. The `cmdk` + Popover pattern that
   enables search already
      exists in `src/components/tracker/EngagementCombobox.tsx` but was
   never adopted by the
      timesheet.

   ---

   ## Proposed Fix

   **Five targeted changes — no existing shared files modified:**

   ### 1. Pure sort helper
   **New file:** `src/lib/timesheetEngagementOptions.ts`

   ```ts
   import type { ApprovedEngagement } from "@/hooks/useTimesheetWeek";

   export function sortEngagements(
     engagements: ApprovedEngagement[]
   ): ApprovedEngagement[] {
     return [...engagements].sort((a, b) => {
       const ca = a.client?.client_legal_name ?? "";
       const cb = b.client?.client_legal_name ?? "";
       if (ca !== cb) return ca.localeCompare(cb);
       const ea = a.engagement_code ?? a.engagement_name;
       const eb = b.engagement_code ?? b.engagement_name;
       return ea.localeCompare(eb);
     });
   }
   ```

   Null-client engagements (empty string) sort before any named client —
   internal/admin
   engagements (ADM_*) therefore appear at the top of the list.

   ### 2. New timesheet-scoped combobox component
   **New file:**
   `src/components/timesheet/TimesheetEngagementCombobox.tsx`

   Uses the same Popover + Command + CommandInput primitives as the
   tracker combobox.
   Displays `engagement_code`, `engagement_name`, and `client_legal_name`
    (three-field display
   matching the current `<Select>`). Sets `CommandItem.value` to
   `"${engagement_code} ${engagement_name} ${client_legal_name}"` so that
    typing any of the
   three fields filters the list.

   Props interface:
   ```ts
   interface TimesheetEngagementComboboxProps {
     engagements: ApprovedEngagement[];
     value: string;
     onValueChange: (id: string) => void;
     disabled?: boolean;
     placeholder?: string;
   }
   ```

   Trigger button styling: `variant="ghost"` with `className="w-full
   justify-between border-0
   bg-transparent focus:ring-1 h-auto min-h-[2rem] font-normal px-2"` —
   matches the existing
   `SelectTrigger className="border-0 bg-transparent focus:ring-1"`
   visual style.

   i18n keys used: `t("timesheet.searchEngagement")` and
   `t("timesheet.noMatchingEngagements")`.

   ### 3. Wire sort + replace Select in TimesheetGrid
   `src/components/timesheet/TimesheetGrid.tsx`

   a. **Import** `sortEngagements` from
   `@/lib/timesheetEngagementOptions` and
      `TimesheetEngagementCombobox` from `./TimesheetEngagementCombobox`.

   b. **Update `availableEngagements` useMemo** (currently lines
   187-195): wrap the filtered
      result in `sortEngagements(...)`:
      ```ts
      const availableEngagements = useMemo(() => {
        const usedIds = new Set(rows.map(r =>
   r.engagementId).filter(Boolean));
        const filtered = engagements.filter(eng => {
          if (usedIds.has(eng.engagement_id)) return true;
          const startOk = !eng.start_date || eng.start_date <=
   weekEndStr;
          const endOk = !eng.end_date || eng.end_date >= weekStartStr;
          return startOk && endOk;
        });
        return sortEngagements(filtered);
      }, [engagements, rows, weekStartStr, weekEndStr]);
      ```

   c. **Replace `<Select>` block** (lines 761-789) with:
      ```tsx
      <TimesheetEngagementCombobox
        engagements={availableEngagements}
        value={row.engagementId}
        onValueChange={(val) => handleEngagementChange(row.id, val)}
        disabled={isRowLocked}
        placeholder={t("timesheet.selectEngagement")}
      />
      ```

   d. **Important:** Do NOT remove `Select*` imports — the activity
   dropdown at line 794 still
      uses `<Select>`. Only remove if confirmed unused by searching the
   full file.

   ### 4. Add i18n keys — English
   `src/locales/en.json` — inside the `"timesheet"` object, add:
   ```json
   "searchEngagement": "Search engagement...",
   "noMatchingEngagements": "No matching engagements."
   ```

   ### 5. Add i18n keys — Spanish
   `src/locales/es.json` — inside the `"timesheet"` object, add:
   ```json
   "searchEngagement": "Buscar encargo...",
   "noMatchingEngagements": "No se encontraron encargos."
   ```

   _(Text values validated: identical copy already exists under
   `tracker.*` in both locale files.)_

   ---

   ## Files to Change

   | # | File | Status | Change |
   |---|------|--------|--------|
   | 1 | `src/lib/timesheetEngagementOptions.ts` | **New** | Pure
   `sortEngagements` helper |
   | 2 | `src/components/timesheet/TimesheetEngagementCombobox.tsx` |
   **New** | Searchable combobox for timesheet rows |
   | 3 | `src/components/timesheet/TimesheetGrid.tsx` | Edit | Import new
    files; wrap filter with sort in useMemo (lines 187-195); replace
   `<Select>` block (lines 761-789) |
   | 4 | `src/locales/en.json` | Edit | 2 new keys inside `"timesheet"`
   object |
   | 5 | `src/locales/es.json` | Edit | 2 new keys inside `"timesheet"`
   object |

   **Not touched:** `src/hooks/useTimesheetWeek.ts`,
   `src/components/tracker/EngagementCombobox.tsx`,
   `src/pages/TimeSheet.tsx`, any Supabase migration, any Edge Function.

   ---

   ## Tests to Add or Update

   ### Test file 1 — Sort helper (pure function)
   **`src/lib/__tests__/timesheetEngagementOptions.test.ts`** (new)

   Pattern matches existing `src/lib/__tests__/timesheetUtils.test.ts`.

   Cases:
   1. Engagements with different clients → sorted A–Z by
   `client_legal_name`.
   2. Engagements with the same client → sorted A–Z by `engagement_code`.
   3. `client = null` → appears before engagements with a named client.
   4. `engagement_code = null` → falls back to `engagement_name` for
   intra-client order.
   5. Input array is not mutated (function returns a new array — original
    order unchanged).

   ### Test file 2 — Combobox component
   **`src/components/timesheet/__tests__/TimesheetEngagementCombobox.test
   .tsx`** (new)

   Cases:
   1. Renders the trigger button with placeholder text when `value = ""`.
   2. Renders the selected engagement's code + name when `value` is set.
   3. Opening the popover reveals a `CommandInput` search field.
   4. Typing part of `engagement_code` filters the list to matching items
    only.
   5. Typing part of `engagement_name` filters the list to matching items
    only.
   6. Typing part of `client_legal_name` filters the list to matching
   items only.
   7. No-match state shows `timesheet.noMatchingEngagements` text.
   8. Clicking an item calls `onValueChange` with the correct
   `engagement_id` and closes the popover.
   9. When `disabled = true`, the trigger button is disabled and the
   popover does not open.

   No existing tests require updates.

   ---

   ## Verification Steps

   **Reproduce the original bug:**
   1. Navigate to OPERACIONES → Hoja de Tiempo.
   2. Open any timesheet week, add a row, click "Seleccionar Encargo".
   3. Observe: long unsorted list, no search field.

   **Confirm the fix:**
   1. Same flow — the dropdown opens as a combobox with a search input at
    the top.
   2. Without typing: list is ordered by client name A–Z, then by
   engagement code within each client.
   3. Type a partial client name → list filters to matching items in real
    time.
   4. Type a partial engagement code → list filters correctly.
   5. Type a partial engagement name → list filters correctly.
   6. Select an engagement → popover closes, trigger shows the selected
   engagement's code + name.
   7. On a locked/approved row → trigger is disabled (greyed,
   non-interactive).
   8. Existing approval badge still renders next to the engagement field.
   9. Changing engagement on a non-locked row still triggers
   `handleEngagementChange` normally.
   10. Activity dropdown on the same row is unaffected.

   **Run tests:**
   ```bash
   npx vitest run src/lib/__tests__/timesheetEngagementOptions.test.ts
   npx vitest run src/components/timesheet/__tests__/TimesheetEngagementC
   ombobox.test.tsx
   npx vitest run src/components/timesheet/__tests__
   npx vitest run src/lib/__tests__
   ```

   ---

   ## Regression Risks

   | Risk | Likelihood | Guard |
   |------|-----------|-------|
   | Replacing cell-level `<Select>` with `<Popover>` changes keyboard
   tab/focus behavior inside the grid | Medium | Manual keyboard test:
   Tab through rows, Enter to open, Escape to close, arrow keys to
   navigate list |
   | Radix `<PopoverContent>` inside a `<table>` cell — `overflow:
   hidden` on ancestors can clip the popover | Low | Radix portals
   content to `document.body` by default (same as `SelectContent`);
   verify no z-index issues in Chrome and Firefox |
   | Removing `Select*` imports from `TimesheetGrid.tsx` if they are used
    elsewhere in the file | Low | Activity dropdown at line 794 still
   uses `<Select>` — do NOT remove imports |
   | `sortEngagements` mutating the input array | None | Implementation
   uses `[...engagements].sort(...)` spread copy; covered by test case 5
   |
   | Mobile viewport — combobox trigger at full width inside narrow
   `<td>` | Low | Manual check at 375 px; `w-full` is already the grid's
   standard pattern |
   | New i18n keys missing at runtime | None | Keys added in both
   `en.json` and `es.json` as part of this change |

   ---

   ## Out of Scope

   - Sorting or searching the "Seleccionar Actividad" dropdown.
   - Changes to the tracker `EngagementCombobox`.
   - Changes to `useTimesheetWeek.ts` data-fetching logic or eligibility
   rules.
   - Week-overlap filtering logic in `TimesheetGrid.tsx`.
   - Pagination or virtual scrolling.
   - Any Supabase migration, RLS policy, or Edge Function change.
   - Changes to `src/pages/TimeSheet.tsx`.

   ---

   ## Open Questions

   _No blocking questions remain. Plan B raised two; both resolved by
   adopting explicit defaults:_

   1. **"Encargo" sort key** → sort by `engagement_code` when present,
   fall back to
      `engagement_name`. Matches the displayed label and is
   deterministic.
   2. **Search scope** → search includes `engagement_code`,
   `engagement_name`, and
      `client_legal_name`. Client is a primary disambiguator visible in
   the screenshot.


   1. **"Encargo" sort key** → sort by `engagement_code` when present,
   fall back to
      `engagement_name`. Matches the displayed label and is
   deterministic.
   2. **Search scope** → search includes `engagement_code`,
   `engagement_name`, and
      `client_legal_name`. Client is a primary disambiguator visible in
   the screenshot.

   ---

   ## Synthesis Notes

   | Decision | Source | Notes |
   |----------|--------|-------|
   | Sort in pure helper (`timesheetEngagementOptions.ts`), not in hook |
    **Plan B** | Hook serves multiple consumers; presentation sort
   belongs in the view layer |
   | New `TimesheetEngagementCombobox` component | **Plan B** | Zero
   tracker regression risk; fully self-contained |
   | New `timesheet.*` i18n keys | **Plan B** | Module independence; text
    validated against existing `tracker.*` values |
   | Sort algorithm (`client_legal_name` → `engagement_code ??
   engagement_name`) | **Both** | No conflict; identical recommendation |
   | Null-client sort first (empty string before names) | **Plan A
   default** | Internal/admin engagements at top is the more useful UX |
   | Search includes client name via `CommandItem.value` concatenation |
   **Plan B** | Plan A did not address; Plan B's recommendation is
   correct and costs nothing extra |
   | 2 test files (sort helper + combobox), grid integration test skipped
    | **Hybrid** | Plan A: 1 file; Plan B: 3 files. Grid integration test
    adds complexity without meaningful incremental coverage |
   | `Select*` imports in `TimesheetGrid.tsx` must NOT be removed |
   **Plan A (noted explicitly)** | Activity dropdown at line 794 still
   uses `<Select>`; Plan B did not flag this |
   | No changes to `useTimesheetWeek.ts` | **Plan B** | Adopted over Plan
    A; data hook stays untouched |
   | No changes to tracker `EngagementCombobox.tsx` | **Plan B** |
   Adopted over Plan A; tracker module stays untouched |
   ENDOFPLAN
   Write synthesized plan_v2.md to bug directory