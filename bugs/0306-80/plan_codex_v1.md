 # Plan for Bug 0306-80

  ## Context

  The reported issue is that Configuración > Roles de Usuario shows a
  growing list of user-role assignments without the standard list-management
  tools used elsewhere in the app: no live search, no role filter, no
  sortable columns, and no pagination.

  Relevant files identified during read-only investigation:

  - bugs/0306-80/0306-80.json
  - src/pages/Settings.tsx:454-457
  - src/components/settings/UserRolesManager.tsx:68-233
  - src/hooks/useUserRoles.ts:18-27
  - src/components/data-table/DataTable.tsx:61-521
  - Existing comparable usage:
      - src/components/settings/HolidaysManager.tsx:149-165
      - src/pages/Clients.tsx:96-120
      - src/pages/Staff.tsx:140-164

  Screenshot assessment:

  - The screenshot shows the Roles de Usuario tab active inside
    Configuración, with a long desktop table containing email, staff name,
    current role, role-change select, and orphan-user actions.
  - It confirms the written description: there is no visible search input,
    no filter control, no sortable header affordance, and no pagination
    footer.
  - It adds detail that the table is already long enough to require
    scrolling and contains mixed record states such as orphaned users, which
    increases the practical need for find/filter tooling.

  ## Root Cause Hypothesis

  1. The user roles screen is implemented as a bespoke static Table, not the
     shared DataTable abstraction already used elsewhere in the repo for
     searchable/sortable/filterable/paginated list views.
      - Static table render: src/components/settings/
        UserRolesManager.tsx:121-229
      - Static headers only, with no sort/filter wiring: src/components/
        settings/UserRolesManager.tsx:125-129
      - Direct unpaginated userRoles.map(...): src/components/settings/
        UserRolesManager.tsx:133-226
  2. The missing behavior is not caused by the data hook. useAllUserRoles()
     already returns the full dataset; it simply does not add any UI
     behavior itself.
      - Data fetch only: src/hooks/useUserRoles.ts:18-27
  3. The repo already contains the needed list-management behavior in one
     place:
      - Search state: src/components/data-table/DataTable.tsx:76
      - Sort state: src/components/data-table/DataTable.tsx:77-78
      - Filter state: src/components/data-table/DataTable.tsx:79-83
      - Search/filter/sort processing: src/components/data-table/
        DataTable.tsx:153-214
      - Pagination: src/components/data-table/DataTable.tsx:216-221, 472-518
      - Desktop sortable/filterable headers: src/components/data-table/
        DataTable.tsx:332-405
      - Shared search bar: src/components/data-table/DataTable.tsx:447-466
  4. The Settings page itself is only hosting the component and is not
     suppressing these features.
      - Mount point only: src/pages/Settings.tsx:454-457

  ## Proposed Fix

  Make UserRolesManager use the shared DataTable instead of the raw Table,
  while preserving the current role badge, role-change select, orphan
  warning, and orphan actions.

  Smallest safe change:

  1. Keep useAllUserRoles() unchanged.
  2. In UserRolesManager, define Column<UserRoleRow>[] for:
      - email
      - staff name
      - current role
      - change role
      - actions
  3. Pass the rows into DataTable with:
      - searchKeys={["email", "staff_name", "roleLabel"]} or equivalent
        derived field
      - sortable email and staff columns
      - sortable current-role column
      - a filters entry keyed to role for role-based filtering
      - getRowId={(row) => row.role_id}
  4. Preserve current action logic and self-protection logic inside column
     renderers.
  5. Prefer sorting by a derived localized role label instead of raw enum
     value, so sorting matches the text users actually see.

  ## Files to Change

  - src/components/settings/UserRolesManager.tsx
      - Replace the bespoke Table implementation with DataTable
      - Define column configuration
      - Add search keys
      - Add role filter options
      - Add any small derived row fields needed for user-facing sorting/
        searching, such as localized roleLabel
  - src/components/settings/__tests__/UserRolesManager.test.tsx
      - Add focused tests for search, role filter, sorting, and pagination
        behavior on this screen
      - Mock useAllUserRoles, useAuth, useUpdateUserRole, and
        useDeleteAuthUser

  ## Tests to Add or Update

  - src/components/settings/__tests__/UserRolesManager.test.tsx
      - Assert that the search input is rendered
      - Assert that typing part of an email or staff name filters visible
        rows
      - Assert that the current-role column can be filtered to a specific
        role
      - Assert that sorting by a visible column changes row order
      - Assert that pagination appears when the dataset exceeds the default
        page size and that moving to the next page changes visible rows
      - Assert that existing interactive controls still render correctly:
          - self row shows “cannot change self”
          - orphan rows still expose create/delete actions
          - non-self rows still render role select

  Optional but lower priority:

  - If the test becomes too integration-heavy, split out one narrower test
    for role filter/sort behavior and one for preserving action controls.

  ## Verification Steps

  Commands to run after implementation:

  1. Targeted test:

     npx vitest run src/components/settings/__tests__/
  UserRolesManager.test.tsx
  2. Existing nearby regression test:

     npx vitest run src/pages/__tests__/Settings.global-focus-
  cancel.test.tsx
  3. Build:

     npm run build

  Manual verification:

  1. Open Configuración > Roles de Usuario.
  2. Confirm a search box is visible above the list.
  3. Search by email and by staff name; verify rows narrow in real time.
  4. Filter by role; verify only matching roles remain visible.
  5. Sort at least email and current-role columns; verify row order changes
     predictably.
  6. Confirm pagination footer appears when enough rows exist.
  7. Verify role-change selects still work for non-self rows.
  8. Verify self row still cannot change its own role.
  9. Verify orphan rows still show create-staff and delete-account actions.

  ## Regression Risks

  - Interactive cells inside DataTable may behave differently from the
    current raw table, especially the role Select and orphan action buttons.
  - If sorting is done on raw enum values instead of localized labels, the
    visible sort order may feel wrong in Spanish.
  - On mobile, DataTable already converts to cards, but its sort/filter
    affordances are weaker than desktop; this bug may be considered only
    partially solved if mobile parity is expected.
  - Very wide action-heavy rows may need minor layout tuning once rendered
    through DataTable.

  ## Out of Scope

  - Changing the backend RPC get_all_user_roles
  - Adding server-side pagination or server-side filtering
  - Redesigning the Settings tab structure
  - Expanding filtering beyond the reported role/list-management need
  - Refactoring the shared DataTable unless blocked by this component
    integration

  ## Open Questions

  - Does “filtros por rol” mean only filtering by current role, or should
    there also be filters for orphaned users and self/non-self rows?
  - Is mobile acceptance expected to include explicit sort/filter controls,
    or is desktop parity with other admin tables sufficient for this bug?
  - Should role sorting follow localized display labels or raw enum keys? I
    recommend localized labels.
  - The JSON suggestion mentions pagination explicitly; should the standard
    shared default page size of 20 be accepted, or is a different default
    required for this module?

  ## Disagreement Targets

  - Reuse DataTable vs. add custom controls around the existing raw Table.
      - Preference: reuse DataTable, because the repo already standardizes
        these behaviors there and this is the lowest-risk, lowest-scope fix.
  - Sort current role by raw enum vs. localized label.
      - Preference: sort by localized label, because users sort what they
        read, not internal enum names.
  - Add only search/pagination vs. full search + role filter + sortable
    headers in one pass.
      - Preference: implement all four together, because the bug report and
        suggestion explicitly call out the full standard toolset.
  - Treat mobile as out of scope vs. preserve the DataTable mobile card
    behavior.
      - Preference: preserve DataTable mobile behavior at minimum, because
        the design rules require responsive table/card handling even if
        desktop is the primary bug surface.