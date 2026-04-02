# Lovable Prompt Templates — Ruizmier Skill Set

Copy-paste prompt templates for building Ruizmier ERM apps in Lovable.dev. Each template references the skill docs in `docs/skills/` so Lovable has full context.

---

## How to Use

1. Copy the prompt template below
2. Replace the `[placeholders]` with your specifics
3. Paste into Lovable's chat
4. Lovable will read the referenced files from the repo for context

**Key**: Always include the reference to the relevant `docs/skills/*.md` file — this is how Lovable gets the design conventions.

---

## Template 1: New CRUD Module

Use when adding a complete new entity (list + add + edit pages).

```
I need a new [Entity] module. Follow the Ruizmier design system and page patterns documented in these files:
- docs/skills/design-system.md (colors, typography, spacing, button rules)
- docs/skills/page-patterns.md (layout, list view, add/edit view patterns)
- docs/skills/component-patterns.md (DataTable, forms, buttons, dialogs)

Create these files:
1. src/pages/[Entities].tsx — List page using DataTable with columns: [col1, col2, col3, ...]
2. src/pages/[Entity]New.tsx — New page with focusMode, usePageLeaveLock, LeavePageDialog
3. src/pages/[Entity]Edit.tsx — Edit page with compact form + related data table below
4. src/components/forms/[Entity]Form.tsx — Form with react-hook-form + Zod validation

Column details:
- [col1]: sortable, mobilePriority 'primary'
- [col2]: sortable, mobilePriority 'secondary'
- [status]: filterable via statusFilter, show as Badge (active=success, inactive=muted)

Form fields:
- [field1]: string, required
- [field2]: string, optional
- [field3]: select dropdown from [related_table]

Button colors: Save = purple (variant="default"), Cancel = gray (variant="cancel"), Delete = crimson (variant="destructive")

Add the route to src/App.tsx and add navigation to the sidebar in the [Main/Operations/Administration] group.
```

---

## Template 2: New List Page Only

Use when adding a read-only data view (no add/edit).

```
Create a list page at src/pages/[Entities].tsx following the patterns in:
- docs/skills/page-patterns.md (LIST VIEW pattern section)
- docs/skills/component-patterns.md (DataTable section)
- docs/skills/design-system.md (colors and spacing)

Use AppLayout with title "[Entities]". Use DataTable with these columns:
- [col1]: key="[field]", sortable, mobilePriority 'primary', render as font-medium
- [col2]: key="[field]", sortable, mobilePriority 'secondary'
- [col3]: key="[field]", className "text-right", render with tabular figures
- [status]: key="is_active", show as Badge (success/muted), filterable

Search across: [field1, field2]
Row click navigates to: /[entities]/[id]
No "+ Add" button for this page.

Add route to src/App.tsx.
```

---

## Template 3: Style a Form to Match the Design System

Use when an existing form needs visual alignment.

```
Update the form in src/components/forms/[Entity]Form.tsx to match the Ruizmier design system:
- Follow docs/skills/design-system.md for colors, spacing, and button rules
- Follow docs/skills/component-patterns.md (Forms section) for layout

Specifically:
- Wrap form in: bg-card rounded-xl border border-border p-6
- Group fields in sections with h3 headings (font-medium text-lg)
- Use grid: grid-cols-1 md:grid-cols-2 gap-4
- Button bar: flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-4
- Cancel button: variant="cancel", Save: variant="default" (purple)
- Mobile buttons: w-full sm:w-auto min-h-[44px] sm:min-h-0
- Required fields: asterisk after label text
- Use LoadingButton for submit with loading={mutation.isPending}
```

---

## Template 4: Add Sidebar Navigation Item

```
Add a new navigation item to the sidebar following docs/skills/page-patterns.md (Sidebar section):

In src/components/layout/AppSidebar.tsx:
- Add to the [Main/Operations/Administration] group
- Title: t("nav.[entityKey]")
- URL: "/[entities]"
- Icon: [IconName] from lucide-react (h-4 w-4)

Also add to MobileBottomNav if it's a primary action, or to MobileMoreDrawer if secondary.

Add the translation key "nav.[entityKey]" to both src/locales/en.json and src/locales/es.json.
```

---

## Template 5: Make a Component Responsive

```
Make [ComponentName] responsive following the patterns in:
- docs/skills/page-patterns.md (Responsive Behavior Summary table)
- docs/skills/component-patterns.md (Mobile Priority System)

Rules:
- Below md (768px): Use card layout, stack elements vertically, full-width buttons
- At/above md: Use table/grid layout, side-by-side elements, auto-width buttons
- Font switches automatically (IBM Plex Sans Condensed on mobile via CSS variable)
- Touch targets: min-h-[44px] on mobile
- Bottom padding: pb-20 if below mobile nav, pb-6 otherwise
- Use useIsMobile() hook for conditional rendering if needed
```

---

## Template 6: Add a Status Badge Column

```
Add a status column to the [Entity] DataTable following docs/skills/component-patterns.md (Status Badges section):

{
  key: "[status_field]",
  label: t("[entity].status"),
  sortable: true,
  filterKey: "[status_field]",
  mobilePriority: 'primary',
  render: (row) => (
    <Badge
      variant="outline"
      className={row.[status_field] === "[active_value]"
        ? "bg-success/10 text-success border-success/20"
        : "bg-muted text-muted-foreground"}
    >
      {row.[status_field] === "[active_value]" ? t("status.active") : t("status.inactive")}
    </Badge>
  ),
}

Add statusFilter with matching options.
```

---

## Template 7: Create a Confirmation Dialog

```
Add a confirmation dialog following docs/skills/component-patterns.md (Dialogs section):

Use AlertDialog from shadcn/ui:
- Trigger: Button with variant="[destructive/default]"
- Title: t("[entity].[actionTitle]")
- Description: t("common.confirm[Action]", { name: entity.name })
- Cancel button: AlertDialogCancel with t("common.cancel")
- Action button: AlertDialogAction with appropriate color:
  - Destructive: className="bg-destructive/70 text-destructive-foreground hover:bg-destructive"
  - Confirm: default styling
```

---

## General Rules for All Prompts

When giving any prompt to Lovable for a Ruizmier app, include these baseline instructions:

```
General rules (from docs/skills/design-system.md):
- Button colors: Purple=Add/Save, Gray=Cancel, Blue=Submit, Crimson=Delete
- No back arrows — use Cancel button
- Date format: DD/MM/YYYY
- Numbers: right-aligned, zero decimals, no currency signs in cells
- Text through i18n: t("key") for all visible strings
- High density spacing: space-y-2, p-4, text-xs labels, text-sm data
- Font: IBM Plex Sans (auto-condensed on mobile via CSS)
- Status badges: green=active, gray=inactive, red=rejected
```
