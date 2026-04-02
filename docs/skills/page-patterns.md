# Ruizmier Page Patterns

How every page in a Ruizmier ERM app is structured — from layout wrappers to the List View / Add-Edit pattern.

**Reference implementation**: EMS 2.0 Clients module (`src/pages/Clients.tsx`, `ClientNew.tsx`, `ClientEdit.tsx`)

---

## AppLayout Wrapper

Every page is wrapped in `<AppLayout>`:

```tsx
<AppLayout title="Page Title">
  {/* Page content */}
</AppLayout>

// Or for form pages:
<AppLayout title="Page Title" focusMode>
  {/* Form content */}
</AppLayout>
```

**Structure** (from `src/components/layout/AppLayout.tsx`):

```
+------------------------------------------------------------------+
|  AppHeader (h-16, border-b, 3-column grid)                       |
|  [Sidebar trigger + Title] [Brand Center] [Timer+Bell+User]      |
+----------+-------------------------------------------------------+
|          |                                                       |
| Sidebar  |  <main> — p-3 sm:p-4 md:p-6, pb-20 md:pb-6          |
| (hidden  |    {children}                                         |
|  on      |                                                       |
|  mobile) |                                                       |
|          |                                                       |
+----------+-------------------------------------------------------+
|  MobileBottomNav (fixed bottom, md:hidden)                       |
+------------------------------------------------------------------+
```

### Props

| Prop | Type | Effect |
|------|------|--------|
| `title` | `string` | Displayed in header left zone |
| `focusMode` | `boolean` | Hides sidebar AND mobile bottom nav (for form pages) |

### Focus Mode

When `focusMode` is `true`:
- Desktop: Sidebar hidden, content takes full width
- Mobile: Bottom nav hidden, no "More" drawer
- Purpose: Eliminates navigation distractions during data entry

---

## The Two Page Types

Every entity module has exactly two page types:

### 1. LIST VIEW — The Data Table Page

```tsx
// src/pages/{Entity}.tsx
const Clients = () => {
  const { data, isLoading } = useClients();
  const navigate = useNavigate();

  const columns: Column<Client>[] = [
    { key: "client_legal_name", label: t("client.name"), sortable: true, mobilePriority: 'primary' },
    { key: "unique_tax_id", label: t("client.nit"), sortable: true, mobilePriority: 'secondary' },
    // ...
  ];

  return (
    <AppLayout title={t("nav.clients")}>
      <DataTable
        data={data || []}
        columns={columns}
        searchPlaceholder={t("client.searchPlaceholder")}
        searchKeys={["client_legal_name", "unique_tax_id"]}
        isLoading={isLoading}
        newButtonLabel={t("client.newClient")}
        onNewClick={() => navigate("/clients/new")}
        onRowClick={(row) => navigate(`/clients/${row.client_id}`)}
        getRowId={(row) => row.client_id}
        filters={[/* dropdown filters */]}
        statusFilter={{ key: "is_active", options: [...] }}
      />
    </AppLayout>
  );
};
```

**Rules**:
- No `focusMode` — full navigation available
- `DataTable` handles everything: search, sort, filter, pagination, "+ Add" button
- Row click navigates to the Edit page
- "+ Add" button navigates to the New page

### 2. ADD/EDIT VIEW — The Form Page

**New Page** (`src/pages/{Entity}New.tsx`):
```tsx
const ClientNew = () => {
  const navigate = useNavigate();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  const handleCancel = () => { allowNextNavigation(); navigate("/clients"); };
  const handleSaveSuccess = () => { allowNextNavigation(); navigate("/clients"); };

  return (
    <AppLayout title="Clients" focusMode>
      <ClientForm
        onDirtyChange={setIsDirty}
        onCancel={handleCancel}
        onSaveSuccess={handleSaveSuccess}
      />
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};
```

**Edit Page** (`src/pages/{Entity}Edit.tsx`):
```tsx
const ClientEdit = () => {
  const { id } = useParams<{ id: string }>();
  const { data: clients, isLoading } = useClientsFull();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  const client = clients?.find((c) => c.client_id === id);

  if (isLoading) {
    return (
      <AppLayout title="Clients" focusMode>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Clients" focusMode>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Page header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">{t("client.editClient")}</h1>
        </div>

        {/* Form - compact mode */}
        <div className="mb-4">
          <ClientForm client={client} compact onDirtyChange={setIsDirty} onCancel={handleCancel} onSaveSuccess={handleSaveSuccess} />
        </div>

        {/* Related data table below */}
        <div className="flex-1 min-h-0">
          {id && <ClientEngagementsTable clientId={id} />}
        </div>
      </div>
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};
```

**Rules**:
- Always `focusMode` — sidebar and mobile nav hidden
- `usePageLeaveLock` + `LeavePageDialog` for unsaved changes protection
- Form reports dirty state via `onDirtyChange` callback
- `allowNextNavigation()` before programmatic navigation (cancel/save)
- Edit page uses `compact` prop on form — shows related data table below
- Loading state shows `Skeleton` placeholders

---

## Navigation Architecture

### No Back Arrows

**Never use back arrows or browser back navigation.** Always provide an explicit Cancel button that navigates to the parent list page.

### Routing Convention

```
/{entities}              → List page (DataTable)
/{entities}/new          → New page (Form, focusMode)
/{entities}/:id          → Edit page (Form + related data, focusMode)
```

### Sidebar (Desktop)

Three navigation groups (from `src/components/layout/AppSidebar.tsx`):

| Group | Items |
|-------|-------|
| **Main** | Dashboard, Clients, Engagements, Work Matrix, Work Orders |
| **Operations** | Tracker, Timesheet, Timesheet Approvals, Expenses |
| **Administration** | Staff, Settings |

Structure per item:
```tsx
<NavLink
  to={item.url}
  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
  activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
>
  <item.icon className="h-4 w-4" />
  <span>{item.title}</span>
</NavLink>
```

- Icons: `lucide-react` (h-4 w-4)
- Active state: `bg-sidebar-accent text-sidebar-foreground font-medium`
- Group labels: `text-sidebar-muted text-xs font-medium uppercase tracking-wider`
- Footer: Sign Out button with `LogOut` icon

### Mobile Bottom Nav

Fixed at bottom (from `src/components/layout/MobileBottomNav.tsx`):

```
[Dashboard] [Timesheet] [Tracker] [Expenses] [More]
```

- 5 items maximum (4 primary + "More" drawer)
- Icon + label layout: `h-5 w-5` icon + `text-[10px] font-medium` label
- Active: `text-sidebar-accent-foreground`
- Inactive: `text-sidebar-foreground/70`
- Background: `bg-sidebar` (teal)
- Safe area: `safe-area-bottom` for notched phones
- Hidden in `focusMode` and above `md` breakpoint

### Header

3-column grid layout (from `src/components/layout/AppHeader.tsx`):

| Zone | Content |
|------|---------|
| **Left** | Sidebar trigger (desktop) + page title (`text-sm md:text-base font-semibold`) |
| **Center** | Brand name ("RuizmierGroup - EMS 2.0") — hidden on mobile |
| **Right** | Running timer chip, notification bell, user display name (`text-brand-purple font-bold`), avatar dropdown |

Avatar dropdown includes:
- User name + email
- Staff linkage status (linked/not linked)
- Sign Out (destructive text)

---

## Responsive Behavior Summary

| Element | Mobile (< md) | Desktop (>= md) |
|---------|---------------|-----------------|
| Sidebar | Hidden | Visible, collapsible |
| Bottom nav | Visible | Hidden |
| Page padding | `p-3` | `p-6` |
| Bottom padding | `pb-20` (nav clearance) | `pb-6` |
| DataTable | Card view | Table view |
| Brand in header | Hidden | Visible |
| Font | IBM Plex Sans Condensed | IBM Plex Sans |
| Form buttons | Full-width stacked | Side-by-side, auto-width |
| Form grid | 1 column | 2-4 columns |

---

## Loading States

- **List page**: DataTable shows skeleton rows (built into DataTable component)
- **Edit page**: Full-page skeleton (`<Skeleton className="h-10 w-64" />` + `<Skeleton className="h-96 w-full" />`)
- **Form submit**: `<LoadingButton loading={isPending}>` shows spinner, disables button
