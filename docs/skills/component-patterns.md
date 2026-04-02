# Ruizmier Component Patterns

Standard UI components and their usage conventions across all Ruizmier ERM apps.

**Component library**: shadcn/ui (Radix primitives) with custom extensions.

---

## DataTable

The primary data display component. Generic, responsive, and feature-complete.

**File**: `src/components/data-table/DataTable.tsx`

### Column Interface

```tsx
interface Column<T> {
  key: string;                           // Data key (supports dot notation: "industry.industry_name")
  label: string;                         // Column header (i18n)
  sortable?: boolean;                    // Enable click-to-sort
  filterable?: boolean;                  // Enable filter
  filterKey?: string;                    // Key for filter matching (if different from key)
  render?: (row: T) => React.ReactNode;  // Custom cell renderer
  className?: string;                    // Cell CSS class (e.g., "text-center", "text-right")
  mobilePriority?: 'primary' | 'secondary';  // Mobile visibility
}
```

### Mobile Priority System

| Priority | Mobile Behavior |
|----------|----------------|
| `'primary'` | Always visible on mobile card |
| `'secondary'` | Hidden in collapsible "Show More" section |
| `undefined` | Hidden on mobile entirely |

### Usage

```tsx
<DataTable
  data={items || []}
  columns={columns}
  searchPlaceholder={t("entity.searchPlaceholder")}
  searchKeys={["name", "code", "nested.field_name"]}
  isLoading={isLoading}
  newButtonLabel={t("entity.newEntity")}
  onNewClick={() => navigate("/entities/new")}
  onRowClick={(row) => navigate(`/entities/${row.id}`)}
  getRowId={(row) => row.id}
  filters={[
    { key: "category_id", label: t("entity.category"), options: categoryOptions },
  ]}
  statusFilter={{
    key: "is_active",
    options: [
      { value: "active", label: t("status.active") },
      { value: "inactive", label: t("status.inactive") },
    ],
  }}
/>
```

### Desktop vs Mobile

- **Desktop** (>= md): Full HTML table with sortable headers, filter dropdowns, pagination (20/50/100 rows)
- **Mobile** (< md): Card layout with primary columns visible, secondary in collapsible section

---

## Buttons

Seven variants defined in `src/components/ui/button.tsx`:

| Variant | When to Use | Visual |
|---------|------------|--------|
| `default` | Add, Save, Create — primary positive actions | Purple background |
| `destructive` | Delete, Remove — dangerous irreversible actions | Crimson background |
| `cancel` | Cancel, Close — navigation reversal | Gray border, white background |
| `submit` | Submit for approval — important but non-destructive | Light blue background |
| `outline` | Secondary actions, toggles | Border only, transparent |
| `ghost` | Icon buttons, subtle actions | No background, hover accent |
| `secondary` | Less prominent actions | Navy background |

### Button Bar Pattern

Buttons at the bottom of forms follow this layout:

```tsx
<div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-4">
  <Button type="button" variant="cancel" onClick={onCancel}
    className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
    {t("common.cancel")}
  </Button>
  <LoadingButton type="submit" variant="default"
    className="w-full sm:w-auto min-h-[44px] sm:min-h-0"
    loading={mutation.isPending}>
    {t("common.save")}
  </LoadingButton>
</div>
```

**Rules**:
- `flex-col-reverse` on mobile — Save appears above Cancel (thumb-friendly)
- `sm:flex-row` on desktop — Cancel left, Save right
- `justify-end` — buttons align right
- `min-h-[44px]` on mobile for touch targets
- Cancel is always `type="button"`, Save is `type="submit"`

---

## LoadingButton

Extends Button with async state (from `src/components/ui/loading-button.tsx`):

```tsx
<LoadingButton
  type="submit"
  variant="default"
  loading={createMutation.isPending || updateMutation.isPending}
  loadingText="Saving..."
>
  {isEdit ? t("common.saveChanges") : t("entity.create")}
</LoadingButton>
```

When `loading=true`: shows `<Loader2>` spinner, disables button, optionally shows `loadingText`.

---

## Forms

### Full Layout (New Page)

```tsx
<div className="space-y-6">
  {/* Page heading with optional delete button */}
  <div className="flex items-center justify-between">
    <h1 className="text-lg font-semibold">{title}</h1>
    {isEdit && canDelete && <DeleteButton />}
  </div>

  {/* Form card */}
  <div className="bg-card rounded-xl border border-border p-6">
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* Section */}
        <div className="space-y-4">
          <h3 className="font-medium text-lg">{t("common.basicInfo")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField ... />
            <FormField ... />
          </div>
        </div>

        {/* Another section */}
        <div className="space-y-4">
          <h3 className="font-medium text-lg">{t("common.details")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField ... />
          </div>
        </div>

        {/* Button bar */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-4">
          <Button variant="cancel" ...>{t("common.cancel")}</Button>
          <LoadingButton variant="default" ...>{t("common.save")}</LoadingButton>
        </div>
      </form>
    </Form>
  </div>
</div>
```

### Compact Layout (Edit Page)

Used when the form shares the page with a related data table:

```tsx
<div className="bg-card rounded-lg border border-border p-4">
  <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <FormField ... />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="cancel" size="sm" .../>
        <LoadingButton variant="default" size="sm" .../>
      </div>
    </form>
  </Form>
</div>
```

**Differences**: `rounded-lg` (smaller), `p-4` (less padding), `gap-3` (tighter), `size="sm"` buttons, more columns (`md:grid-cols-4`).

### Form Field Pattern

```tsx
<FormField
  control={form.control}
  name="field_name"
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t("entity.fieldName")} *</FormLabel>
      <FormControl>
        <Input placeholder={t("entity.fieldPlaceholder")} {...field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

- Required fields: asterisk `*` after label text
- Validation via Zod schema with `zodResolver`
- Dirty tracking via `form.formState.isDirty` → reported through `onDirtyChange` callback

---

## Dialogs

### Delete Confirmation

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">
      <Trash2 className="h-4 w-4 mr-2" />
      {t("common.delete")}
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("entity.deleteTitle")}</AlertDialogTitle>
      <AlertDialogDescription>
        {t("common.confirmDelete", { name: entity.name })}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
        {t("common.delete")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Leave Page (Unsaved Changes)

```tsx
<LeavePageDialog blocker={blocker} isDirty={isDirty} />
```

Automatically shows when the user tries to navigate away from a page with `usePageLeaveLock` active and the form has unsaved changes. Offers "Stay" and "Leave Anyway" options.

---

## NumericInput

Locale-aware numeric input for currencies and hours (from `src/components/ui/numeric-input.tsx`):

```tsx
<NumericInput
  value={amount}
  onChange={(num) => field.onChange(num)}
  decimals={2}          // 0 = integer, 1 = hours, 2 = currency
  locale="es"           // "es" = comma decimal, "en" = period decimal
  min={0}
  max={999999}
  placeholder="0,00"
/>
```

**Key behavior**: Allows intermediate input states (e.g., "0." while typing) without triggering validation until blur. Hides browser number spinners via `.hide-spinners`.

---

## ApprovalToggle

Three-state toggle for approval workflows (from `src/components/ui/approval-toggle.tsx`):

```tsx
<ApprovalToggle
  value="pending"       // "pending" | "approve" | "reject"
  onChange={(decision) => handleApproval(decision)}
  disabled={!canApprove}
/>
```

Colors: Pending = `bg-muted`, Approve = `bg-success`, Reject = `bg-destructive`.

---

## Status Badges

```tsx
// Active/Approved
<Badge variant="outline" className="bg-success/10 text-success border-success/20">
  {t("status.active")}
</Badge>

// Inactive/Pending
<Badge variant="outline" className="bg-muted text-muted-foreground">
  {t("status.inactive")}
</Badge>

// Count badge
<Badge variant="secondary">{count}</Badge>
```

---

## Display Conventions

| Data Type | Alignment | Format | Example |
|-----------|-----------|--------|---------|
| Text | Left | As-is | "Acme Corp" |
| Numbers | Right | Zero decimals, tabular figures | "1,250" |
| Currency | Right | No currency sign (sign in header) | "15,000" |
| Dates | Center | DD/MM/YYYY | "15/03/2026" |
| Status | Center | Badge component | Active/Inactive |
| Boolean | Center | Badge or switch | Yes/No |
| Missing data | — | Dash character | "-" |

---

## Icons

All icons from `lucide-react`:
- Standard size: `h-4 w-4` (16px)
- Header icons: `h-5 w-5` (20px)
- With text: `<Icon className="h-4 w-4 mr-2" />` (2-unit right margin)
- Button icon-only: Use `size="icon"` variant (`h-10 w-10`)
