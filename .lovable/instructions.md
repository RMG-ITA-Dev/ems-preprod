# Ruizmier ERM — Lovable Development Instructions

This project is part of the Ruizmier ERM suite. All UI/UX must follow the **Ruizmier Skill Set (RSS)** documented in `docs/skills/`.

## Design System Reference

Read `docs/skills/design-system.md` before making any visual changes. Key rules:

### Colors
- **Primary Teal** (`#008795`): Sidebar background, focus rings
- **Brand Purple** (`#7c3aed`): All primary action buttons (Add, Save, Create), user name display, switch toggles
- **Crimson** (destructive): Delete and reject actions
- **Light Blue** (info): Submit actions
- **Gray** (cancel): Cancel and close buttons
- All colors defined as HSL CSS variables in `src/index.css` — never hardcode hex values

### Typography
- IBM Plex Sans (regular) + IBM Plex Sans Condensed (mobile, auto-switches via CSS)
- Numbers: tabular figures, right-aligned, zero decimal places
- Labels: `text-xs` to `text-sm`
- Data: `text-sm`

### Spacing
- High information density — tighter than typical SaaS
- Page padding: `p-3 sm:p-4 md:p-6`
- Table cells: `py-1.5 px-2`
- Form sections: `space-y-6` between, `space-y-4` within

## Page Pattern Reference

Read `docs/skills/page-patterns.md` before creating pages. Key rules:

- **List pages**: `<AppLayout title="...">` + `<DataTable>` (no focusMode)
- **Form pages**: `<AppLayout title="..." focusMode>` + Form + `<LeavePageDialog>`
- **No back arrows** — always Cancel button
- **Routes**: `/{entities}`, `/{entities}/new`, `/{entities}/:id`

## Component Reference

Read `docs/skills/component-patterns.md` before creating components. Key rules:

- **DataTable**: Generic with `mobilePriority` on columns for responsive card view
- **Buttons**: 7 variants — see design system for color mapping
- **Forms**: react-hook-form + Zod, `bg-card rounded-xl border p-6`, dirty tracking
- **Dialogs**: AlertDialog for confirmations
- **Status badges**: Green=active, Gray=inactive, Red=rejected
- **Dates**: DD/MM/YYYY, center-aligned
- **Numbers**: Right-aligned, zero decimals, no currency signs in cells

## i18n

All visible text through `react-i18next`: `t("key")`. Translation files in `src/locales/en.json` and `src/locales/es.json`.

## Prompt Templates

See `docs/skills/lovable-prompts.md` for copy-paste prompt templates for common tasks.
