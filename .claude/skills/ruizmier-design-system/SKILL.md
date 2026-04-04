---
name: ruizmier-design-system
description: >
  Ruizmier ERM design system — colors, typography, spacing, button rules, and theming.
  Use when creating or modifying UI components, styling elements, choosing colors,
  or setting up the visual identity for a Ruizmier ERM application.
  Keywords: color, theme, style, button, font, spacing, brand, CSS, tailwind, token, design.
---

# Ruizmier Design System

Apply these rules whenever you create or modify visual elements in a Ruizmier ERM app.

## Quick Reference

### Button Colors (CRITICAL — enforce strictly)
- **Add / Save / Create**: `variant="default"` → Purple (`bg-brand-purple`)
- **Cancel / Close**: `variant="cancel"` → Gray border, visible in both themes
- **Delete / Reject**: `variant="destructive"` → Crimson, softened (`bg-destructive/70`)
- **Submit / Confirm**: `variant="submit"` → Light blue (`bg-info`)
- **Icon-only / Subtle**: `variant="ghost"` → Transparent
- **Raised Effect**: Solid-fill buttons have depth shadow + hover lift + active press. Ghost/link/outline stay flat.

### Brand Colors
- Primary Teal: `hsl(186 100% 29%)` = `#008795` — sidebar, focus rings
- Secondary Navy: `hsl(213 77% 25%)` = `#0f3c73` — text foreground
- Brand Purple: `hsl(255 82% 65%)` = `#7c3aed` — action buttons, user name, switches
- Brand Gold: `hsl(41 76% 61%)` = `#c9a040` — accent highlights

### Status Colors
- Success (green): `bg-success/10 text-success border-success/20` — active, approved
- Warning (amber): `bg-warning` — attention needed
- Destructive (crimson): `bg-destructive` — rejected, errors, delete
- Info (blue): `bg-info` — submit, informational
- Muted (gray): `bg-muted text-muted-foreground` — pending, inactive

### Typography
- Font: IBM Plex Sans (regular desktop, condensed on mobile via CSS variable)
- Numbers: tabular figures (`.font-mono` class), right-aligned, zero decimals
- Labels: `text-xs` to `text-sm`
- Data: `text-sm`
- Headings: `text-lg font-semibold`

### Spacing (High Density)
- Page padding: `p-3 sm:p-4 md:p-6`
- Form sections: `space-y-6` between, `space-y-4` within
- Form fields grid: `gap-4` (full) or `gap-3` (compact)
- Table cells: `py-1.5 px-2` (via `.table-dense`)
- Button bar: `gap-3 sm:gap-4 pt-4`

### Mobile Button Rules
- Full width: `w-full sm:w-auto`
- Touch target: `min-h-[44px] sm:min-h-0`
- Stacking: `flex flex-col-reverse sm:flex-row` (Save above Cancel on mobile)

### Key Breakpoint
- `md` (768px) = sidebar/mobile boundary
- Below: condensed font, bottom nav, card views
- Above: regular font, sidebar, table views

### Switches
- All Radix switches use Brand Purple when checked (enforced via CSS)

## Full Reference

See `docs/skills/design-system.md` for the complete design system documentation including:
- All CSS variables (light + dark mode)
- Sidebar theming
- Custom utility classes
- Animation definitions
- How to modify the color scheme for rebranding
