Plan v2 — Bug 0306-80

  Comparison Matrix

  Section: Primary affected file
  Plan A position: UserRolesManager.tsx:121–229 (table block)
  Plan B position: UserRolesManager.tsx:68–233 (full component)
  Agreement?: Partial
  Chosen position: A — narrower range is the actual change target
  Reason: Precision; outer skeleton/Card are kept
  ────────────────────────────────────────
  Section: Root cause
  Plan A position: Raw <Table>, predates DataTable refactor, never
  backfilled
  Plan B position: Same; adds DataTable internal-line evidence
  Agreement?: ✓
  Chosen position: Both (merged)
  Reason: Full agreement
  ────────────────────────────────────────
  Section: Fix strategy
  Plan A position: Replace raw <Table> with DataTable<UserRoleData> in
    UserRolesManager.tsx
  Plan B position: Same
  Agreement?: ✓
  Chosen position: Both
  Reason: Full agreement
  ────────────────────────────────────────
  Section: Code concreteness
  Plan A position: Full column defs, import diff, JSX snippet provided
  Plan B position: Abstract description; column names only
  Agreement?: ✗
  Chosen position: A
  Reason: Plan must be executable without further planning
  ────────────────────────────────────────
  Section: Sort order for role column
  Plan A position: Sort by raw enum value ("admin", "staff")
  Plan B position: Sort by derived localized roleLabel field
  Agreement?: ✗
  Chosen position: A
  Reason: Smallest change; avoids computed field on data; enum order
    disagreement is an Open Question
  ────────────────────────────────────────
  Section: searchKeys
  Plan A position: ["email", "staff_name"]
  Plan B position: ["email", "staff_name", "roleLabel"]
  Agreement?: ✗
  Chosen position: A
  Reason: Avoids the derived field; role-based filtering is already covered
    by the role filter
  ────────────────────────────────────────
  Section: Test file name
  Plan A position: UserRolesManager.search-sort-filter.test.tsx
  Plan B position: UserRolesManager.test.tsx
  Agreement?: ✗
  Chosen position: B — shorter, matches repo convention
  Reason: Consistency with Settings.global-focus-cancel.test.tsx naming
  style
  ────────────────────────────────────────
  Section: Test concreteness
  Plan A position: 9 labeled cases (UR1–UR9) with full mock strategy
  Plan B position: Category-level descriptions, no mock strategy
  Agreement?: ✗
  Chosen position: A
  Reason: Executability requirement
  ────────────────────────────────────────
  Section: npm run build in verification
  Plan A position: Absent
  Plan B position: Present
  Agreement?: ✗
  Chosen position: Hybrid — add it
  Reason: Zero-cost safety net; catches import errors TypeScript misses at
    test time
  ────────────────────────────────────────
  Section: Regression risks
  Plan A position: 5 specific risks each with concrete mitigation
  Plan B position: 4 general risks, no mitigations
  Agreement?: ✗
  Chosen position: A
  Reason: Actionable format
  ────────────────────────────────────────
  Section: Remove early isLoading return
  Plan A position: Explicitly remove it
  Plan B position: Not mentioned
  Agreement?: N/A
  Chosen position: A
  Reason: Reduces component complexity; DataTable handles loading state
  ────────────────────────────────────────
  Section: Mobile scope
  Plan A position: Secondary columns in Collapsible; Select/AlertDialog
    tested
  Plan B position: Flagged as risk of "partial" fix
  Agreement?: Partial
  Chosen position: A's specific analysis
  Reason: More informative for the implementer
  ────────────────────────────────────────
  Section: Open Questions
  Plan A position: 4 questions
  Plan B position: 4 questions (partially overlapping)
  Agreement?: Partial
  Chosen position: Merged (5 total)
  Reason: Each question is a distinct human decision; no overlap dropped

  ---
  Context

  The Gestión de Roles de Usuario screen (Settings → Roles de Usuario tab,
  visible to admin users only) renders a plain, static, unsorted,
  unfiltered, unpaginated <Table> listing all registered users. As the user
  count grows, locating and managing a specific user's role requires
  scrolling through the entire list. The screen provides no search bar, no
  column sorting, no role filter, and no pagination.

  Screenshot description: The capture shows ~18 rows in a flat desktop table
   with columns Correo, Nombre del Personal, Rol Actual, Cambiar Rol, and
  Acciones. There is no toolbar above the table and no pagination footer
  below it. Mixed record states are visible (regular linked users, orphan
  users flagged with a warning icon). The absence of list-management tools
  contrasts directly with every other Settings tab — Industrias, Tarifas por
   Categoría, Códigos de Actividad, Tipos de Gasto — each of which uses the
  DataTable component with search, sort, column filter, and pagination.

  Files identified:

  File: src/components/settings/UserRolesManager.tsx
  Role: Primary file — contains the raw <Table> block to replace (lines
    121–229)
  ────────────────────────────────────────
  File: src/components/data-table/DataTable.tsx
  Role: Existing reusable component with search/sort/filter/pagination
  ────────────────────────────────────────
  File: src/pages/Settings.tsx
  Role: Parent page; mounts <UserRolesManager /> at lines 454–457
  ────────────────────────────────────────
  File: src/hooks/useUserRoles.ts
  Role: Data hook; useAllUserRoles (lines 18–27), useUpdateUserRole,
    useDeleteAuthUser
  ────────────────────────────────────────
  File: src/locales/en.json
  Role: All required keys already present
  ────────────────────────────────────────
  File: src/locales/es.json
  Role: All required keys already present
  ────────────────────────────────────────
  File: src/pages/__tests__/Settings.global-focus-cancel.test.tsx
  Role: Existing Settings test (mocks UserRolesManager as a no-op div)

  ---
  Root Cause Hypothesis

  UserRolesManager.tsx:121–229 constructs a raw shadcn <Table> inline inside
   a <Card>. Unlike every other Settings tab, this component never imports
  or uses DataTable. The original implementation predates the DataTable
  refactor that standardised search/sort/filter across the Settings page,
  and was never backfilled.

  DataTable already provides all the missing behavior internally:
  - Real-time search state: DataTable.tsx:76
  - Sort state (asc/desc/none cycle): DataTable.tsx:77–78
  - Filter state: DataTable.tsx:79–83
  - Search/filter/sort processing: DataTable.tsx:153–214
  - Pagination + rows-per-page: DataTable.tsx:216–221, 472–518
  - Desktop sortable/filterable column headers: DataTable.tsx:332–405
  - Shared search bar: DataTable.tsx:447–466
  - Mobile card view: DataTable.tsx:247–330

  The UserRoleData interface (useUserRoles.ts:9–16) already has all the
  fields required for column definitions. No data-layer or backend changes
  are needed.

  ---
  Proposed Fix

  Smallest safe change: Refactor UserRolesManager.tsx to use
  DataTable<UserRoleData> in place of the raw <Table>. The outer <Card> with
   its <CardHeader> (title, "Admin Only" badge, description) is preserved
  unchanged. The <CardContent> inner block is replaced in its entirety by a
  <DataTable> invocation with column definitions that use render callbacks
  for interactive cells (role badge, inline role-change <Select>, orphan
  actions). The early if (isLoading) guard that returns a bare card skeleton
   is removed — DataTable handles loading state itself via its isLoading
  prop.

  Files that require zero changes:
  - src/pages/Settings.tsx — <UserRolesManager /> call site is identical
  - src/hooks/useUserRoles.ts — data shape unchanged
  - src/locales/en.json / src/locales/es.json — all needed keys already
  exist (userRoles.*, common.search, common.actions, common.all,
  common.clear, common.cancel)
  - src/components/data-table/DataTable.tsx — no new capabilities needed

  ---
  Files to Change

  1. src/components/settings/UserRolesManager.tsx

  Imports to add:
  import { DataTable, Column, FilterConfig } from
  "@/components/data-table/DataTable";

  Imports to remove (shadcn table primitives no longer needed):
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "@/components/ui/table";

  All other existing imports remain:
  Card/CardContent/CardHeader/CardTitle/CardDescription, Badge,
  Select/SelectContent/SelectItem/SelectTrigger/SelectValue, Skeleton, icon
  imports (Shield, Crown, Briefcase, Users, Star, StarHalf, User, Eye,
  ShieldCheck, Monitor, Calculator, AlertTriangle, UserPlus, Trash2, Lock),
  useAllUserRoles/useUpdateUserRole/useDeleteAuthUser/UserRoleData, useAuth,
   Database, Button, Link, AlertDialog family.

  Remove the early isLoading return block (lines 87–103 — the bare <Card>
  with <Skeleton> items). DataTable renders its own skeleton rows when
  isLoading={true}.

  Add constant and column definitions inside UserRolesManager(), before the
  return statement:

  const ALL_ROLES: AppRole[] = [
    "admin", "partner", "director", "manager", "senior",
    "semisenior", "staff", "viewer", "sqr", "specialist_it",
  "specialist_tax",
  ];

  const roleFilter: FilterConfig = {
    key: "role",
    label: t("userRoles.currentRole"),
    options: ALL_ROLES.map((r) => ({ value: r, label: getRoleLabel(r) })),
  };

  const columns: Column<UserRoleData>[] = [
    {
      key: "email",
      label: t("userRoles.email"),
      sortable: true,
      mobilePriority: "primary",
    },
    {
      key: "staff_name",
      label: t("userRoles.staffName"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) =>
        row.staff_name ? (
          row.staff_name
        ) : (
          <div
            className="flex items-center text-amber-600 dark:text-amber-400
  gap-1.5"
            title={t("userRoles.orphanWarning")}
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs
  font-medium">{t("userRoles.orphan")}</span>
          </div>
        ),
    },
    {
      key: "role",
      label: t("userRoles.currentRole"),
      sortable: true,
      filterKey: "role",
      mobilePriority: "primary",
      render: (row) => (
        <Badge variant="outline" className={roleColors[row.role]}>
          {roleIcons[row.role]}
          <span className="ml-1">{getRoleLabel(row.role)}</span>
        </Badge>
      ),
    },
    {
      key: "change_role",
      label: t("userRoles.changeRole"),
      mobilePriority: "secondary",
      render: (row) => {
        const isSelf = user?.id === row.user_id;
        return isSelf ? (
          <span className="text-xs text-muted-foreground italic">
            {t("userRoles.cannotChangeSelf")}
          </span>
        ) : (
          <Select
            value={row.role}
            onValueChange={(value: AppRole) => handleRoleChange(row.user_id,
   value)}
            disabled={updateRoleMutation.isPending}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{getRoleLabel(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: "actions",
      label: t("common.actions"),
      className: "text-right",
      mobilePriority: "secondary",
      render: (row) => {
        const isSelf = user?.id === row.user_id;
        const isOrphan = !row.staff_name;
        if (!isOrphan || isSelf) return null;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary"
              asChild
              title={t("userRoles.createStaff")}
            >
              <Link
  to={`/staff/new?email=${encodeURIComponent(row.email)}`}>
                <UserPlus className="h-4 w-4" />
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  title={t("userRoles.deleteAccount")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>

  <AlertDialogTitle>{t("userRoles.deleteAccountTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("userRoles.confirmDeleteAccount", { email: row.email
  })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>

  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleDeleteAccount(row.user_id)}
                    className="bg-destructive/70 text-destructive-foreground
   hover:bg-destructive"
                  >
                    {t("userRoles.deleteAccount")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        );
      },
    },
  ];

  JSX replacement inside <CardContent>: Remove the entire conditional block:
  {!userRoles || userRoles.length === 0 ? (
    <p ...>{t("userRoles.noUsers")}</p>
  ) : (
    <div className="rounded-md border">
      <Table>...</Table>
    </div>
  )}
  Replace with:
  <DataTable
    data={userRoles || []}
    columns={columns}
    searchKeys={["email", "staff_name"]}
    filters={[roleFilter]}
    isLoading={isLoading}
    getRowId={(row) => row.role_id}
  />

  ▎ onRowClick is deliberately omitted — there is no row-level navigation or
  ▎  edit form for user roles.

  ---
  2. src/components/settings/__tests__/UserRolesManager.test.tsx (new file)

  Mock strategy:
  - useAllUserRoles → controlled UserRoleData[] array
  - useUpdateUserRole → { mutate: vi.fn(), isPending: false }
  - useDeleteAuthUser → { mutate: vi.fn(), isPending: false }
  - useAuth → { user: { id: "self-user-id" } }
  - react-i18next → { useTranslation: () => ({ t: (k: string) => k }) }
  - react-router-dom → spread actual module, override Link to <a>

  Test cases:

  ┌──────┬───────────────────────────────────────────────────────────────┐
  │  ID  │                      Behaviour to assert                      │
  ├──────┼───────────────────────────────────────────────────────────────┤
  │ UR1  │ Search input is rendered above the table                      │
  ├──────┼───────────────────────────────────────────────────────────────┤
  │ UR2  │ Typing part of a known email (e.g., "susy") filters visible   │
  │      │ rows to only the matching row                                 │
  ├──────┼───────────────────────────────────────────────────────────────┤
  │ UR3  │ Clearing the search input restores all rows                   │
  ├──────┼───────────────────────────────────────────────────────────────┤
  │ UR4  │ Clicking the role column sort control once renders rows       │
  │      │ sorted ascending by role enum string                          │
  ├──────┼───────────────────────────────────────────────────────────────┤
  │ UR5  │ Role filter popover lists all 11 role options; selecting one  │
  │      │ leaves only rows with that role                               │
  ├──────┼───────────────────────────────────────────────────────────────┤
  │ UR6  │ Clearing the role filter restores all rows                    │
  ├──────┼───────────────────────────────────────────────────────────────┤
  │ UR7  │ When the dataset has > 20 rows, pagination controls           │
  │      │ (previous/next buttons) are rendered                          │
  ├──────┼───────────────────────────────────────────────────────────────┤
  │ UR8  │ Orphan rows (where staff_name is null) render an              │
  │      │ AlertTriangle icon in the staff name cell                     │
  ├──────┼───────────────────────────────────────────────────────────────┤
  │ UR9  │ The row whose user_id matches the authenticated user shows    │
  │      │ the "cannotChangeSelf" text instead of a <Select>             │
  ├──────┼───────────────────────────────────────────────────────────────┤
  │ UR10 │ Loading state (isLoading: true from hook) renders skeleton    │
  │      │ elements and no data rows                                     │
  └──────┴───────────────────────────────────────────────────────────────┘

  ---
  Verification Steps

  Reproduce the original symptom

  1. Run npm run dev and navigate to Configuración → Roles de Usuario.
  2. Confirm: no search input visible above the table; column headers are
  plain text with no sort affordance; no pagination footer.

  Confirm the fix after implementation

  1. Navigate to Configuración → Roles de Usuario.
  2. Search: Type part of a known email (e.g., "susy") → only the matching
  row remains visible in real time.
  3. Search by staff name: Type part of a staff name → rows narrow
  correctly.
  4. Sort: Click the Correo column header → rows sort A→Z; click again →
  Z→A; click again → original order restored.
  5. Role filter: Click the filter icon on the Rol Actual column header →
  select "Administrador" → only admin rows shown; click "Limpiar" → all rows
   restored.
  6. Pagination: If the list has > 20 users, confirm previous/next controls
  appear and navigate pages correctly.
  7. Inline role change: Change a non-self user's role via the Select
  dropdown → confirm toast success appears.
  8. Self-protection: Confirm the authenticated user's own row shows the
  "cannotChangeSelf" label, not a Select.
  9. Orphan actions: Confirm orphan rows still show the UserPlus link and
  the Trash2 delete button with its confirm dialog.
  10. Mobile: Resize the viewport to < 640 px. Confirm the table collapses
  to mobile cards; Cambiar Rol and Acciones appear in the expandable
  secondary section.

  Commands

  # New test
  npx vitest run src/components/settings/__tests__/UserRolesManager.test.tsx

  # Existing regression test
  npx vitest run src/pages/__tests__/Settings.global-focus-cancel.test.tsx

  # Full suite
  npx vitest run

  # Build check
  npm run build

  ---
  Regression Risks

  Risk: Inline <Select> inside DataTable row — DataTable attaches
  onClick={()
    => onRowClick?.(row)} to each <TableRow>. Since onRowClick is not
  passed,
     this evaluates to a no-op; Select click events bubble safely without
    interference.
  Mitigation: Confirmed in DataTable.tsx:429. No onRowClick is passed in the

    proposed invocation.
  ────────────────────────────────────────
  Risk: <AlertDialog> inside DataTable row — AlertDialogTrigger stops
    propagation internally.
  Mitigation: Same as above — no onRowClick means no row-level conflict;
    dialog opens correctly.
  ────────────────────────────────────────
  Risk: Mobile card view — change_role and actions columns are marked
    mobilePriority: "secondary", so they render inside DataTable's
    <Collapsible>. Shadcn <Select> and <AlertDialog> function correctly
    inside a Collapsible.
  Mitigation: Manual verification step 10 covers this.
  ────────────────────────────────────────
  Risk: Settings.global-focus-cancel.test.tsx — already mocks
    UserRolesManager as a no-op div
    (vi.mock("@/components/settings/UserRolesManager", ...)), making the
    internal refactor invisible to it.
  Mitigation: No change needed; test passes unchanged.
  ────────────────────────────────────────
  Risk: Removed early isLoading return — the bare <Card> skeleton that
    previously guarded the render is deleted. DataTable's own isLoading path

    (skeleton rows inside the table) replaces it.
  Mitigation: UR10 test explicitly asserts loading state renders skeletons.
  ────────────────────────────────────────
  Risk: Role filter string matching — DataTable.filters uses
    String(value).toLowerCase() === filterValue.toLowerCase(). row.role
    values are already lowercase enum strings (e.g., "admin", "staff")
    matching the options[].value strings produced by ALL_ROLES.map(...).
  Mitigation: No transform needed; confirmed by inspection of
    DataTable.tsx:181–192 and useUserRoles.ts:9–16.
  ────────────────────────────────────────
  Risk: Non-data column keys ("change_role", "actions") — DataTable uses key

    for React keying in <TableHead>, sort lookup (neither column is
    sortable), and render fallback (never reached when render is provided).
  Mitigation: Safe. Neither column is marked sortable.

  ---
  Out of Scope

  - Bulk-select or bulk role-change actions.
  - Server-side pagination or filtering (DataTable paginates client-side
  from the full get_all_user_roles RPC response; no cursor changes needed at
   current scale).
  - CSV export of the user-role list.
  - Any modification to src/components/data-table/DataTable.tsx.
  - Any modification to the manage-auth-user Edge Function or the
  admin_set_user_role / get_all_user_roles RPCs.
  - Redesigning the Settings tab structure in src/pages/Settings.tsx.

  ---
  Open Questions

  1. Row click / Staff profile navigation (Plan A): Should clicking a normal
   (non-orphan) linked user row navigate to their Staff profile in
  /staff/:id? The current design does not do this, and the fix preserves
  that behaviour by omitting onRowClick. Confirm this is the intended UX
  before execution.
  2. Rows-per-page default (Plans A & B): DataTable defaults to 20 rows per
  page. With ~18 users visible in the screenshot, pagination will not appear
   until the list exceeds 20 users. Confirm whether the default of 20 is
  acceptable or whether a lower value (e.g., 10) should be used for this
  module.
  3. Column widths (Plan A): The original raw table applied w-[150px] to the
   Cambiar Rol and Acciones column headers. The proposed DataTable columns
  use className on the column definition. Confirm whether these fixed-width
  constraints should be carried over or left fluid.
  4. Orphan search behaviour (Plans A & B): A null staff_name is searched as
   "" (empty string, due to String(null || "")) and therefore never matches
  any non-empty search query. Orphan users only appear when the search box
  is blank. Confirm whether this is acceptable or whether orphan users
  should always remain visible regardless of the search term — which would
  require either a dedicated "Show orphans" filter option or an "orphan"
  synthetic search token.
  5. Role sort order: enum vs. localized label (Plan B, raised as risk in
  Plan A): Sorting the role column by raw enum key produces alphabetical
  order by internal name (e.g., admin < director < manager). In Spanish, the
   localized labels produce a different alphabetical order (e.g.,
  Administrador < Asistente < Director < Gerente). If sort-by-visible-text
  is required, implement a roleLabel derived field and pass it as a computed
   key — but this adds scope. Confirm whether enum-key sort order is
  acceptable for v2.

  ---
  Synthesis Notes

  Decision: Full column definitions with concrete JSX
  Source: Plan A
  Notes: Required for executability; Plan B's abstract description was
    insufficient
  ────────────────────────────────────────
  Decision: Sort by raw enum value (key: "role")
  Source: Plan A
  Notes: Smallest change; Plan B's localized-label sort is valid but
  requires
    a derived field — moved to Open Question 5
  ────────────────────────────────────────
  Decision: searchKeys: ["email", "staff_name"]
  Source: Plan A
  Notes: Plan B proposed adding "roleLabel" but that requires data
    transformation; role filtering already covers role-based narrowing
  ────────────────────────────────────────
  Decision: Test file name UserRolesManager.test.tsx
  Source: Plan B
  Notes: Shorter, consistent with repository's existing file naming
    conventions
  ────────────────────────────────────────
  Decision: 10 test cases (UR1–UR10, vs. Plan A's 9)
  Source: Hybrid
  Notes: UR1–UR9 from Plan A; UR10 (loading state) reworded for clarity;
  Plan
    B's suggestion to split tests if too heavy is acknowledged but the
  single
     file is preferred unless a test runner timeout occurs
  ────────────────────────────────────────
  Decision: npm run build added to verification
  Source: Plan B
  Notes: Zero-cost safety net; catches TypeScript import errors not caught
  at
    test time
  ────────────────────────────────────────
  Decision: 5 merged Open Questions
  Source: Hybrid
  Notes: Plan A's Q1–Q4 kept; Plan B's localized-sort question promoted from

    "Disagreement Targets" to Open Question 5; Plan B's mobile-acceptance
    question is covered by the regression risk entry and manual step 10, not

    duplicated as a separate open question
  ────────────────────────────────────────
  Decision: ALL_ROLES constant for Select items
  Source: Plan A
  Notes: Eliminates duplicated <SelectItem> enumeration; previously the
    component listed each role twice (badge render + Select options)