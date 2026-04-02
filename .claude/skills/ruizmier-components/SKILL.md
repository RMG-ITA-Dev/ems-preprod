---
name: ruizmier-components
description: >
  Ruizmier ERM component patterns — DataTable, buttons, forms, dialogs, NumericInput, status badges.
  Use when creating or modifying UI components, data tables, forms, confirmation dialogs, or display elements.
  Keywords: DataTable, table, button, form, dialog, modal, input, badge, status, card, mobile, responsive.
---

# Ruizmier Component Patterns

Apply these patterns whenever you create or modify components in a Ruizmier ERM app.

## DataTable

Generic, responsive data table: `<DataTable<T>>`.

### Column Interface
```tsx
interface Column<T> {
  key: string;                          // Supports dot notation: "industry.industry_name"
  label: string;                        // i18n label
  sortable?: boolean;
  filterKey?: string;                   // Key for filter matching
  render?: (row: T) => ReactNode;       // Custom cell renderer
  className?: string;                   // e.g., "text-center", "text-right"
  mobilePriority?: 'primary' | 'secondary';  // Mobile visibility
}
```

### Mobile Priority
- `'primary'` → Always visible on mobile card
- `'secondary'` → In collapsible "Show More" section
- `undefined` → Hidden on mobile

### Desktop: Full table. Mobile: Card layout with expandable sections.

## Button Variants
| Action | Variant | Color |
|--------|---------|-------|
| Add/Save/Create | `default` | Purple |
| Delete/Reject | `destructive` | Crimson |
| Cancel/Close | `cancel` | Gray |
| Submit/Confirm | `submit` | Light blue |
| Secondary | `outline` | Border only |
| Subtle | `ghost` | Transparent |

### Button Bar Layout
```tsx
<div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-4">
  <Button variant="cancel" className="w-full sm:w-auto min-h-[44px] sm:min-h-0">Cancel</Button>
  <LoadingButton variant="default" className="w-full sm:w-auto min-h-[44px] sm:min-h-0" loading={isPending}>Save</LoadingButton>
</div>
```

## Form Layout
- **Full**: `bg-card rounded-xl border border-border p-6`, `space-y-6`, `grid-cols-1 md:grid-cols-2 gap-4`
- **Compact**: `bg-card rounded-lg border border-border p-4`, `space-y-3`, `grid-cols-1 md:grid-cols-4 gap-3`, `size="sm"` buttons
- **Validation**: react-hook-form + Zod + zodResolver
- **Dirty tracking**: `form.formState.isDirty` → `onDirtyChange` callback
- **Required fields**: Asterisk `*` after label text

## Dialogs
- Use `AlertDialog` from shadcn/ui for confirmations
- Delete: `AlertDialogAction` with `bg-destructive text-destructive-foreground`
- Leave page: `<LeavePageDialog blocker={blocker} isDirty={isDirty} />`

## Display Conventions
| Data Type | Alignment | Format |
|-----------|-----------|--------|
| Text | Left | As-is |
| Numbers | Right | Zero decimals, tabular figures |
| Currency | Right | No sign (sign in header) |
| Dates | Center | DD/MM/YYYY |
| Status | Center | Badge component |
| Missing | — | Dash "-" |

## Status Badges
- Active/Approved: `bg-success/10 text-success border-success/20`
- Inactive/Pending: `bg-muted text-muted-foreground`
- Rejected: `bg-destructive/10 text-destructive border-destructive/20`

## Icons
- Library: `lucide-react`
- Standard: `h-4 w-4`
- With text: `className="h-4 w-4 mr-2"`

## Full Reference

See `docs/skills/component-patterns.md` for complete documentation including:
- Full DataTable usage example with all props
- LoadingButton and NumericInput patterns
- ApprovalToggle three-state component
- Complete form layout code examples (full and compact)
- Dialog code patterns (delete confirmation, leave page)
