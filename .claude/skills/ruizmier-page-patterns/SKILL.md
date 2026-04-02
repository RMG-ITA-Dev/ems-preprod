---
name: ruizmier-page-patterns
description: >
  Ruizmier ERM page layout patterns — AppLayout, List View, Add/Edit View, navigation, responsive design.
  Use when creating new pages, adding routes, setting up navigation, or implementing the list/edit pattern.
  Keywords: page, layout, sidebar, navigation, list, table, form, edit, new, route, responsive, mobile, focusMode.
---

# Ruizmier Page Patterns

Apply these patterns whenever you create or modify pages in a Ruizmier ERM app.

## The Two Page Types

Every entity module has exactly **two page types**:

### 1. LIST VIEW (Data Table Page)
```
AppLayout (title, NO focusMode)
  └── DataTable (search, sort, filter, pagination, "+ Add" button, row click)
```
- No `focusMode` — full navigation available
- DataTable handles everything (see ruizmier-components skill)
- Row click → navigate to Edit page
- "+ Add" button → navigate to New page

### 2. ADD/EDIT VIEW (Form Page)
```
AppLayout (title, focusMode=true)
  ├── Form component (onDirtyChange, onCancel, onSaveSuccess)
  └── LeavePageDialog (blocker, isDirty)
```
- Always `focusMode` — hides sidebar and mobile nav
- `usePageLeaveLock({ locked: true, isDirty })` for unsaved changes protection
- `allowNextNavigation()` before programmatic navigation
- Edit page: `compact` form + related data table below

## Routing Convention
```
/{entities}        → List page
/{entities}/new    → New page (focusMode)
/{entities}/:id    → Edit page (focusMode)
```

## Navigation Rules
- **No back arrows** — always Cancel button
- Sidebar: 3 groups (Main, Operations, Administration)
- Mobile: Fixed bottom nav (4 items + "More" drawer)
- Icons: `lucide-react`, `h-4 w-4`

## Responsive Summary
| Element | Mobile (< md) | Desktop (>= md) |
|---------|--------------|-----------------|
| Sidebar | Hidden | Visible |
| Bottom nav | Visible | Hidden |
| DataTable | Card view | Table view |
| Form buttons | Full-width stacked | Side-by-side |
| Form grid | 1 column | 2-4 columns |
| Page padding | `p-3` | `p-6` |
| Bottom padding | `pb-20` | `pb-6` |

## Loading States
- List: DataTable skeleton rows (built-in)
- Edit: `<Skeleton className="h-10 w-64" />` + `<Skeleton className="h-96 w-full" />`
- Form submit: `<LoadingButton loading={isPending}>` shows spinner

## Full Reference

See `docs/skills/page-patterns.md` for complete documentation including:
- Full code examples for List, New, and Edit pages
- AppLayout structure diagram
- Sidebar navigation groups and styling
- Mobile bottom nav specification
- Header 3-column grid layout
