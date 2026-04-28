Bug Fix Plan — 0306-80

  a. Context

  Bug restated: The Gestión de Roles de Usuario screen (Settings → Roles de
  Usuario tab) renders a plain, unsorted, unfiltered, unpaginated table of
  all system users. As the user list grows, finding and managing a specific
  user's role requires scrolling through the entire list. The screen
  provides no search bar, no column sorting, no role filter, and no
  pagination.

  Screenshot analysis: The capture shows the full flat list (~18 visible
  rows) with columns Correo, Nombre del Personal, Rol Actual, Cambiar Rol,
  and Acciones. All rows are visible simultaneously with no toolbar above
  the table and no pagination controls below. The pattern contrasts sharply
  with every other Settings tab (Industries, Tarifas, Códigos de Actividad,
  Tipos de Gasto), each of which already hosts a DataTable component
  complete with search, sort, column filters, and pagination.

  Files identified:

  ┌─────────────────────────────────────────────┬───────────────────────┐
  │                    File                     │         Role          │
  ├─────────────────────────────────────────────┼───────────────────────┤
  │                                             │ Primary file —        │
  │ src/components/settings/UserRolesManager.ts │ renders the raw       │
  │ x                                           │ <Table> that must be  │
  │                                             │ replaced              │
  ├─────────────────────────────────────────────┼───────────────────────┤
  │                                             │ Existing reusable     │
  │ src/components/data-table/DataTable.tsx     │ component with        │
  │                                             │ search/sort/filter/pa │
  │                                             │ gination              │
  ├─────────────────────────────────────────────┼───────────────────────┤
  │                                             │ Parent page; renders  │
  │ src/pages/Settings.tsx                      │ <UserRolesManager />  │
  │                                             │ inside the roles tab  │
  ├─────────────────────────────────────────────┼───────────────────────┤
  │                                             │ Data hook; exposes    │
  │ src/hooks/useUserRoles.ts                   │ useAllUserRoles,      │
  │                                             │ useUpdateUserRole,    │
  │                                             │ useDeleteAuthUser     │
  ├─────────────────────────────────────────────┼───────────────────────┤
  │                                             │ English strings (all  │
  │ src/locales/en.json                         │ required keys already │
  │                                             │  present)             │
  ├─────────────────────────────────────────────┼───────────────────────┤
  │                                             │ Spanish strings (all  │
  │ src/locales/es.json                         │ required keys already │
  │                                             │  present)             │
  ├─────────────────────────────────────────────┼───────────────────────┤
  │ src/pages/__tests__/Settings.global-focus-c │ Existing Settings     │
  │ ancel.test.tsx                              │ test (mocks           │
  │                                             │ UserRolesManager)     │
  └─────────────────────────────────────────────┴───────────────────────┘

  ---
  b. Root Cause Hypothesis

  UserRolesManager.tsx:121–229 constructs a raw shadcn <Table> inline inside
   a <Card>. Unlike every other Settings tab, this component never imports
  or uses DataTable. The original implementation predates the DataTable
  refactor that standardised search/sort/filter across the rest of the
  Settings page, and was never backfilled.

  There is no business logic missing — DataTable already handles real-time
  search, multi-key search, column sort (ascending/descending/none cycle),
  per-column filter popovers, pagination, rows-per-page selector, and a
  mobile card view. The UserRoleData interface already has all the fields
  needed for column definitions.

  ---
  c. Proposed Fix

  Smallest safe change: Refactor UserRolesManager.tsx to use
  DataTable<UserRoleData> instead of the raw <Table>. The Card header
  (title, "Admin Only" badge, description) is preserved. The CardContent
  inner table block is replaced entirely by a DataTable invocation with
  column definitions that use render callbacks for the interactive cells
  (role badge, inline role-change <Select>, orphan actions).

  No changes are required to:
  - Settings.tsx (the <UserRolesManager /> call site remains identical)
  - useUserRoles.ts (data shape is unchanged)
  - Locale files (all needed keys already exist: userRoles.*, common.search,
   common.actions, common.all, common.clear)
  - DataTable.tsx (no new capabilities needed)

  ---
  d. Files to Change

  1. src/components/settings/UserRolesManager.tsx

  Imports to add:
  import { DataTable, Column, FilterConfig } from
  "@/components/data-table/DataTable";

  Imports to remove (no longer needed after replacing raw table):
  import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
  } from "@/components/ui/table";
  (All other imports remain: Card, Badge,
  Select/SelectContent/SelectItem/SelectTrigger/SelectValue, Skeleton, icon
  imports, hooks, Button, Link, AlertDialog family.)

  State to add (inside UserRolesManager):

  No new useState calls are required — DataTable manages its own
  search/sort/filter/pagination state internally.

  Column definitions to add (before the if (isLoading) check):

  const ALL_ROLES: AppRole[] = [
    "admin","partner","director","manager","senior",
    "semisenior","staff","viewer","sqr","specialist_it","specialist_tax",
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
            <Button variant="ghost" size="icon" className="h-8 w-8
  text-primary" asChild
              title={t("userRoles.createStaff")}>
              <Link
  to={`/staff/new?email=${encodeURIComponent(row.email)}`}>
                <UserPlus className="h-4 w-4" />
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8
  text-destructive"
                  title={t("userRoles.deleteAccount")}>
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

  JSX replacement (inside CardContent):

  Remove the entire {!userRoles || userRoles.length === 0 ? ... : <div
  className="rounded-md border"><Table>...</Table></div>} block and replace
  with:

  <DataTable
    data={userRoles || []}
    columns={columns}
    searchKeys={["email", "staff_name"]}
    filters={[roleFilter]}
    isLoading={isLoading}
    getRowId={(row) => row.role_id}
  />

  ▎ Note: the isLoading skeleton is now handled by DataTable itself (when
  ▎ isLoading is true it shows skeleton rows), so the outer if (isLoading)
  ▎ guard that returns a bare <Card> with skeleton items can be removed — or
  ▎  kept as a page-level guard before the full <Card> renders. Keeping it
  ▎ as-is just shows a simpler card skeleton before the full DataTable
  ▎ skeleton; this is a minor UX detail. Safest choice: remove the early
  ▎ return and let DataTable handle loading state, simplifying the
  ▎ component.

  ---
  e. Tests to Add or Update

  New file: src/components/settings/__tests__/UserRolesManager.search-sort-f
  ilter.test.tsx

  This test file should assert:

  ┌───────┬─────────────────────────────────────────────────────────────┐
  │ Test  │                          Behaviour                          │
  │  ID   │                                                             │
  ├───────┼─────────────────────────────────────────────────────────────┤
  │ UR1   │ Search input is rendered; typing "susy" filters rows to     │
  │       │ only matching email                                         │
  ├───────┼─────────────────────────────────────────────────────────────┤
  │ UR2   │ Clearing the search restores all rows                       │
  ├───────┼─────────────────────────────────────────────────────────────┤
  │ UR3   │ Clicking the role column sort icon once sorts rows          │
  │       │ ascending by role string                                    │
  ├───────┼─────────────────────────────────────────────────────────────┤
  │ UR4   │ Role filter popover shows all 11 role options; selecting    │
  │       │ "admin" filters to admin rows only                          │
  ├───────┼─────────────────────────────────────────────────────────────┤
  │ UR5   │ Clearing the role filter restores all rows                  │
  ├───────┼─────────────────────────────────────────────────────────────┤
  │ UR6   │ Pagination controls appear when more than 20 users are      │
  │       │ present                                                     │
  ├───────┼─────────────────────────────────────────────────────────────┤
  │ UR7   │ Orphan rows (staff_name null) show AlertTriangle icon in    │
  │       │ the staff name cell                                         │
  ├───────┼─────────────────────────────────────────────────────────────┤
  │ UR8   │ Self-row shows "cannotChangeSelf" text instead of a Select  │
  ├───────┼─────────────────────────────────────────────────────────────┤
  │ UR9   │ Loading state renders skeletons (no table rows)             │
  └───────┴─────────────────────────────────────────────────────────────┘

  Mock strategy:
  - Mock useAllUserRoles with a controlled array of UserRoleData objects
  - Mock useUpdateUserRole and useDeleteAuthUser returning { mutate:
  vi.fn(), isPending: false }
  - Mock useAuth returning a user with a known id
  - Mock react-i18next → t: (k) => k
  - Mock react-router-dom → Link renders a plain <a>

  ---
  f. Verification Steps

  Reproduce the original symptom

  1. Run npm run dev and navigate to Configuración → Roles de Usuario tab.
  2. Confirm: no search input visible above the table, column headers are
  not clickable/sortable, no pagination controls below the table.

  Confirm the fix

  After applying the change:

  1. Navigate to Configuración → Roles de Usuario.
  2. Search: Type part of a known email (e.g., "susy") → only matching rows
  remain.
  3. Sort: Click the Correo column header → rows sort A→Z; click again →
  Z→A; click again → original order.
  4. Filter: Click the filter icon on the Rol Actual header → select
  "Administrador" → only admin rows shown; click "Limpiar" → all rows
  restored.
  5. Pagination: If there are > 20 users, confirm pagination controls appear
   at the bottom and page navigation works.
  6. Inline actions still work: Change a non-self user's role via the Select
   dropdown → toast success. For an orphan user, click the Trash icon →
  confirm dialog appears → confirm → account deleted.
  7. Run tests: npx vitest run src/components/settings/__tests__/UserRolesMa
  nager.search-sort-filter.test.tsx
  8. Run the full suite: npx vitest run — all existing tests must still
  pass.

  ---
  g. Regression Risks

  Risk: Inline Select inside DataTable cell — DataTable's desktop table
    renders rows with onClick={() => onRowClick?.(row)}. Since onRowClick is

    NOT passed, this is a no-op; Select click events bubble up safely.
  Mitigation: Confirmed: onRowClick is omitted in the proposed DataTable
    call.
  ────────────────────────────────────────
  Risk: AlertDialog inside DataTable cell — AlertDialogTrigger stops
    propagation internally; no conflict with DataTable row click.
  Mitigation: Same — no onRowClick means no conflict.
  ────────────────────────────────────────
  Risk: Mobile card view — DataTable wraps each row in a <Card> with a
    Collapsible for secondary columns. change_role and actions are
    mobilePriority: 'secondary', so they appear inside the collapsible. The
    Select and AlertDialog inside a Collapsible work correctly.
  Mitigation: Manual test on narrow viewport required.
  ────────────────────────────────────────
  Risk: Settings.tsx's existing test (Settings.global-focus-cancel.test.tsx)

    — already mocks UserRolesManager as a no-op div, so the internal
  refactor
     is completely invisible to it.
  Mitigation: No change needed; test will pass unchanged.
  ────────────────────────────────────────
  Risk: isLoading prop — DataTable receives isLoading and renders skeleton
    rows. The early-return skeleton inside UserRolesManager can be removed
  to
     avoid double-rendering. If kept, it shows a simpler card skeleton
  before
     the full DataTable mounts; this is harmless but redundant.
  Mitigation: Remove the early if (isLoading) return from UserRolesManager
  as
    part of the fix.
  ────────────────────────────────────────
  Risk: Role filter matching — DataTable.filters uses
    String(value).toLowerCase() === filterValue.toLowerCase(). row.role
    values are already lowercase strings matching the option value strings.
  Mitigation: Confirmed match; no issue.
  ────────────────────────────────────────
  Risk: Column key "change_role" / "actions" not real fields — DataTable
  uses
    key only for (a) React key in <TableHead>, (b) sort lookup (only when
    sortable, neither is), (c) render fallback (never reached when render is

    provided).
  Mitigation: Safe. Explicitly NOT marking these columns as sortable.

  ---
  h. Out of Scope

  - Adding bulk-select or bulk role-change actions.
  - Backend pagination (DataTable paginates client-side from the full
  get_all_user_roles RPC result; no server-side cursor needed at current
  scale).
  - Exporting the user-role list to CSV.
  - Modifying DataTable.tsx itself.
  - Any changes to the manage-auth-user Edge Function or the
  admin_set_user_role RPC.

  ---
  i. Open Questions

  1. Row click intent for normal (non-orphan) users: Should clicking a
  normal linked user row navigate to their Staff profile? The current design
   doesn't do this, and the fix preserves that behaviour (no onRowClick).
  Confirm this is acceptable.
  2. Rows-per-page default: DataTable defaults to 20 rows/page. With a firm
  currently at ~18 users (visible in screenshot), pagination won't appear
  immediately. As the list grows this will activate automatically. No action
   needed unless a different default is required.
  3. Column widths: The existing raw table used w-[150px] on the "Cambiar
  Rol" and "Acciones" columns. DataTable's column className prop can carry
  these constraints. Confirm whether fixed-width constraints should be
  preserved or left fluid.
  4. "Orphan" search behaviour: A null staff_name is searched as "" (empty
  string) — meaning it never matches any non-empty search query. This means
  orphan users only appear when the search box is empty or when the user
  explicitly searches an empty string. Is this the desired UX, or should
  orphans always be surfaced (e.g., by a dedicated filter option)?