# Ruizmier ERM — Agent Instructions

This repository is part of the **Ruizmier ERM suite** — a family of bilingual (EN/ES) professional services management applications sharing a unified design system and component patterns.

## Tech Stack

React 18 + Vite + TypeScript, Tailwind CSS + shadcn/ui, Supabase (Lovable Cloud), TanStack Query v5, react-hook-form + Zod, react-i18next.

## Design System & UI/UX Skills

All UI/UX conventions are documented in `docs/skills/`:

| Document | Scope |
|----------|-------|
| `docs/skills/README.md` | Skill index and cross-platform usage |
| `docs/skills/design-system.md` | Colors, typography, spacing, button rules, theming |
| `docs/skills/page-patterns.md` | Layout, List View, Add/Edit View, navigation, responsive |
| `docs/skills/component-patterns.md` | DataTable, buttons, forms, dialogs, badges |
| `docs/skills/lovable-prompts.md` | Prompt templates for Lovable.dev |

## Critical Rules (Always Follow)

1. **Button colors**: Purple=Add/Save, Gray=Cancel, Light Blue=Submit, Crimson=Delete
2. **No back arrows** — always Cancel button for navigation reversal
3. **Date format**: DD/MM/YYYY throughout
4. **Numbers**: Right-aligned, zero decimals, no currency signs in cells (currency in column headers)
5. **All text through i18n**: `t("key")` — never hardcode English or Spanish strings
6. **High density**: `space-y-2`, `p-4`, `text-xs` labels, `text-sm` data
7. **Responsive**: `md` (768px) is the sidebar/mobile boundary; tables become cards on mobile
8. **Focus mode**: Form pages use `focusMode` to hide sidebar and mobile nav
9. **Page leave protection**: All form pages use `usePageLeaveLock` + `LeavePageDialog`
10. **Semantic colors only**: Use design tokens from CSS variables, never hardcode hex values

## File Conventions

- **Do not edit**: `src/integrations/supabase/types.ts` (auto-generated)
- **Do not edit**: `supabase/config.toml` (managed by Lovable Cloud)
- **Component library**: shadcn/ui with custom extensions in `src/components/ui/`
- **Icons**: `lucide-react` at `h-4 w-4` standard size
- **Font**: IBM Plex Sans (auto-switches to condensed on mobile via CSS variable)
