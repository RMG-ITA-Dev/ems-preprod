# BUG 0220-57 — Searchable Engagement Selector in Timesheet

  ## Context

  The bug is on OPERACIONES > Hoja de Tiempo: the engagement picker in the
  timesheet grid is hard to use when the engagement list is long. The
  packet asks for two improvements: sort the list by client and
  engagement, and replace the plain dropdown with a searchable select.

  Files identified as relevant:

  - src/pages/TimeSheet.tsx — owns the page and passes engagements into
    the grid.
  - src/components/timesheet/TimesheetGrid.tsx — renders the current
    engagement selector in each row.
  - src/hooks/useTimesheetWeek.ts — fetches and merges the list of
    engagements available for time entry.
  - src/components/ui/select.tsx — shared Radix Select wrapper currently
    used by the timesheet grid.
  - src/components/tracker/EngagementCombobox.tsx — existing searchable
    engagement picker pattern already used in tracker flows.

  Screenshot read:

  - The image shows the timesheet grid with the Seleccionar Encargo
    dropdown open.
  - It confirms the current control is a long scrollable list with no
    visible search field.
  - It adds detail not explicit in the packet: each option already shows
    engagement_code, engagement_name, and a second client-name line, so
    the missing behavior is discoverability/search, not missing
    identifying data.
  - It also suggests the current ordering is not optimized for lookup by
    client; the visible options are not grouped in an obviously client-
    first way.

  ## Root Cause Hypothesis

  - src/components/timesheet/TimesheetGrid.tsx:761-788 uses a plain Radix
    Select for engagement selection. That control renders a static list of
    SelectItems and exposes no inline search/filter capability.
  - src/components/ui/select.tsx:61-88 confirms the shared select wrapper
    is only a dropdown/viewport shell; it has scroll buttons but no
    CommandInput-style filtering path.
  - src/hooks/useTimesheetWeek.ts:141-196 fetches two engagement groups,
    merges them in insertion order, and returns
    Array.from(merged.values()) without any explicit client/engagement
    sort. The final order therefore depends on backend fetch order plus
    merge order, which is not aligned with the bug report.
  - src/components/tracker/EngagementCombobox.tsx:36-101 already proves
    the repo has an accepted searchable pattern for engagement lookup, but
    the timesheet grid never adopted it.

  ## Proposed Fix

  Make the smallest safe UI-only change scoped to the timesheet page:

  - Replace the timesheet engagement Select with a timesheet-specific
    searchable combobox built from the same Popover + Command primitives
    already used in tracker.
  - Keep the existing option content model: engagement_code,
    engagement_name, and client name on a second line.
  - Sort the rendered options client-first, then engagement within client,
    before passing them to the combobox.
  - Preserve all existing timesheet behaviors:
      - disabled state for locked/approved rows,
      - current handleEngagementChange logic,
      - existing availableEngagements week-overlap filtering,
      - current badge rendering and row layout.
  - Add timesheet-scoped i18n keys for search placeholder and empty state
    instead of reusing tracker strings.

  Preferred implementation shape:

  - Add a new compact component for timesheet only, rather than reworking
    the tracker combobox.
  - Keep sorting local to the timesheet grid or a tiny timesheet-specific
    helper, not in shared tracker code.

  ## Files to Change

  - src/components/timesheet/TimesheetGrid.tsx
      - Replace the engagement Select block with the new searchable
        combobox.
      - Derive a deterministic sorted option list from
        availableEngagements.
      - Keep current renderApprovalBadge, lock handling, and
        handleEngagementChange unchanged apart from wiring the new
        control.
  - src/components/timesheet/TimesheetEngagementCombobox.tsx (new)
      - Render a compact combobox suitable for table cells.
      - Show search input, empty state, selected value, code/name/client
        display, and disabled state.
      - Accept engagements, value, onValueChange, disabled, and
        placeholder.
  - src/locales/en.json
      - Add timesheet.searchEngagement and
        timesheet.noMatchingEngagements.
  - src/locales/es.json
      - Add timesheet.searchEngagement and
        timesheet.noMatchingEngagements.
  - src/lib/timesheetEngagementOptions.ts (new, recommended)
      - Extract sorting/label normalization into a tiny pure helper so
        ordering is easy to test and stays out of JSX.

  ## Tests to Add or Update

  - src/lib/__tests__/timesheetEngagementOptions.test.ts (new)
      - Asserts sorting is by client name first, then engagement within
        client.
      - Asserts null client names sort after named clients or by chosen
        fallback consistently.
      - Asserts code-present and code-missing engagements sort
        deterministically.
  - src/components/timesheet/__tests__/
    TimesheetEngagementCombobox.test.tsx (new)
      - Asserts the search input is rendered when the picker opens.
      - Asserts filtering matches engagement code, engagement name, and
        client name.
      - Asserts the empty-state text appears when no option matches.
      - Asserts selecting an option calls onValueChange with the
        engagement id.
      - Asserts disabled mode blocks opening/interaction.
  - src/components/timesheet/__tests__/TimesheetGrid.engagement-
    selector.test.tsx (new or folded into the combobox test if the team
    wants fewer files)
      - Asserts the grid renders the searchable control in the engagement
        column.
      - Asserts the options presented to the user are in client-first
        order.
      - Asserts locked rows still disable the engagement control.

  ## Verification Steps

  Commands:

  - npx vitest run src/lib/__tests__/timesheetEngagementOptions.test.ts
    src/components/timesheet/__tests__/
    TimesheetEngagementCombobox.test.tsx
  - If a grid integration test is added: npx vitest run src/components/
    timesheet/__tests__/TimesheetGrid.engagement-selector.test.tsx

  Manual reproduction:

  1. Open Hoja de Tiempo.
  2. Add or edit a row and open Seleccionar Encargo.
  3. Confirm a search field appears at the top of the dropdown.
  4. Search by engagement code, engagement name, and client name; verify
     the expected option filters in each case.
  5. Clear search and confirm the list is ordered by client, then
     engagement.
  6. Select an engagement and verify the existing row-change behavior
     still works.
  7. Open a locked/submitted row and confirm the control is disabled.

  Regression checks:

  - Existing activity selection behavior still works after engagement
    selection.
  - Approval badge still renders next to the engagement field.
  - Week-overlap filtering still excludes non-overlapping unused
    engagements.
  - No new hardcoded UI text appears; all new copy resolves through i18n.

  ## Regression Risks

  - Replacing a cell-level Select with a popover/command control can
    change keyboard behavior and focus handling inside the timesheet grid.
  - If sorting is moved into shared data fetching instead of the grid,
    cross-module coupling and accidental tracker regressions.
  ## Out of Scope

  - Changing engagement eligibility rules, work-order approval logic, or
    week-overlap filtering.
  - Altering activity dropdown behavior.
  - Refactoring tracker comboboxes unless needed as a direct dependency of
    the timesheet fix.
  - Backend/database changes.

  ## Open Questions

  - The packet says “ordenar lista por Cliente y Encargo” but does not
    define whether “Encargo” means engagement_code, engagement_name, or
    the displayed combined label. Default recommendation: sort by
    client_legal_name, then engagement_code when present, then
    engagement_name.
  - The packet asks for a search-select box but does not say whether
    search should include the client subtitle. Default recommendation:
    yes, search across code, name, and client because the screenshot shows
    client name is an important disambiguator.

  ## Disagreement Targets

  - Shared vs timesheet-specific combobox: prefer a new src/components/
    timesheet/TimesheetEngagementCombobox.tsx so the fix stays local to
    the bug route and does not risk tracker regressions.
  - Sort in hook vs sort in grid/helper: prefer sorting in a timesheet-
    local helper or directly in TimesheetGrid, because the packet scope is
    only the timesheet UI and the order is a presentation concern.
  - Reuse tracker translation keys vs add timesheet keys: prefer timesheet
    keys, because the control lives in the timesheet module and should not
    depend on tracker copy.