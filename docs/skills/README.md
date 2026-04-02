# Ruizmier Skill Set (RSS) — UI/UX Skills Index

The Ruizmier Skill Set codifies the design system, page patterns, and component conventions used across all Ruizmier ERM applications (EMS, CRM, Quality/Risk, Resource Scheduling). Following these skills ensures a **unified look and feel** across the entire product suite.

---

## Available Skills

| Skill | Shared Doc | Claude Skill | Purpose |
|-------|-----------|-------------|---------|
| **Design System** | [design-system.md](./design-system.md) | `.claude/skills/ruizmier-design-system/` | Colors, typography, spacing, button rules, theming |
| **Page Patterns** | [page-patterns.md](./page-patterns.md) | `.claude/skills/ruizmier-page-patterns/` | Layout, List View, Add/Edit View, navigation, responsive |
| **Component Patterns** | [component-patterns.md](./component-patterns.md) | `.claude/skills/ruizmier-components/` | DataTable, buttons, forms, dialogs, custom components |
| **Lovable Bridge** | [lovable-prompts.md](./lovable-prompts.md) | `.claude/skills/ruizmier-lovable-bridge/` | Prompt templates for Lovable.dev |

---

## How to Use These Skills

### In Claude Code
Skills auto-trigger based on context. When you create or modify UI components, pages, or layouts, Claude will reference the appropriate skill. You can also invoke them explicitly:
- "Follow the Ruizmier design system"
- "Use the Ruizmier page pattern for a new Invoices module"

### In Lovable.dev
Reference the shared docs in your prompts. See [lovable-prompts.md](./lovable-prompts.md) for copy-paste templates. You can also point Lovable directly at these files:
- "Follow the conventions in `docs/skills/design-system.md` for colors and typography"
- "Use the page pattern from `docs/skills/page-patterns.md` for this new module"

### In Codex / GitHub Copilot
The `AGENTS.md` file at the repo root references these skills. Codex and Copilot will pick up the conventions automatically.

---

## Principles

1. **Unified Identity** — All ERM apps share the same color scheme, typography, layout structure, and interaction patterns
2. **High Information Density** — Spreadsheet-like interfaces with compact spacing (`space-y-2`, `p-4`, `text-xs` labels)
3. **Mobile-First Responsive** — Desktop tables become mobile cards; sidebar becomes bottom nav
4. **Bilingual by Default** — All text through i18n (react-i18next); DD/MM/YYYY dates; locale-aware numerics
5. **No Back Arrows** — Always use Cancel buttons for navigation reversal
6. **Semantic Colors Only** — Use design tokens, never hardcoded hex values

---

## Future Skills (Planned)

| Skill | Status | Scope |
|-------|--------|-------|
| Data Layer | Phase 2 | Hooks, mutations, Supabase patterns, error handling |
| Access Control | Phase 3 | RBAC + RLS dual-layer security |
| i18n Patterns | Phase 4 | Translation structure, Zod factory pattern |
| App Bootstrap | Phase 5 | `/bootstrap-app` command to scaffold new ERM apps |

---

*Last updated: April 1, 2026*
