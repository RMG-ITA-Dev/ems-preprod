# EMS v2.0 — Engagement Management System

Bilingual (English/Spanish) professional services management platform for accounting and
consulting firms. Manages the full lifecycle: client onboarding, engagements, work orders,
timesheets, expense tracking, approvals, and dashboards.

Built with Lovable.dev and deployed on Lovable Cloud.

---

## Operations Reference (single source of truth)

Tech stack, project conventions, edge function inventory, Lovable deployment workflow, and run commands live in **[`docs/operations.md`](./docs/operations.md)**. Read that file first; do not duplicate its content here.

The same file is linked from `AGENTS.md` (Codex / GitHub Copilot), `.lovable/instructions.md` (Lovable.dev), and `README.md` (human contributors), so every tool reads the same source.

---

## Architecture

```
src/
├── components/    # 14 feature directories (timesheet, forms, dashboard, layout, ui, ...)
├── contexts/      # DashboardContext
├── hooks/         # 25+ custom hooks (data fetching, mutations, business logic)
│   └── mutations/ # Per-entity mutation hooks
├── integrations/
│   └── supabase/  # client.ts (Supabase client) + types.ts (auto-generated)
├── lib/           # Utilities: fiscalCalculations, timesheetErrors, validation, logger
├── locales/       # en.json + es.json translation files
├── pages/         # 30 route pages
└── App.tsx        # React Router configuration
```

---

## Important Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | All React Router routes |
| `src/hooks/useTimesheetMutations.ts` | Core timesheet logic (large, complex) |
| `src/hooks/useTimesheetApprovals.ts` | Approval workflow logic |
| `src/components/timesheet/TimesheetGrid.tsx` | Main timesheet UI |
| `src/components/dashboard/tabs/` | Dashboard tab components |
| `supabase/functions/dashboard-data/index.ts` | 8 analytics actions (938 lines) |
| `docs/database-schema.sql` | Full database schema reference |

---

## Ruizmier Skill Set (RSS)

Reusable UI/UX skills shared across all Ruizmier ERM apps — design system, page patterns, components, Lovable prompt templates.

- **Canonical docs** (readable by every tool): `docs/skills/` — see `docs/skills/README.md` for the index
- **Claude Code auto-trigger skills**: `ruizmier-design-system`, `ruizmier-page-patterns`, `ruizmier-components`, `ruizmier-lovable-bridge`
- **Cross-tool bridge files**: `AGENTS.md` (Codex/Copilot), `.lovable/instructions.md` (Lovable), `CLAUDE.md` (this file)
