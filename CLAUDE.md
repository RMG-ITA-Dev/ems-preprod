# EMS v2.0 — Engagement Management System

Bilingual (English/Spanish) professional services management platform for accounting and
consulting firms. Manages the full lifecycle: client onboarding, engagements, work orders,
timesheets, expense tracking, approvals, and dashboards.

Built with Lovable.dev and deployed on Lovable Cloud.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| UI | Tailwind CSS + shadcn/ui (Radix primitives) |
| Backend | Supabase (Lovable Cloud) — project: `ugqxfnrxvksiltwxzist` |
| State | TanStack Query v5 + React Context |
| Forms | react-hook-form + Zod |
| i18n | react-i18next (EN/ES) |
| Testing | Vitest |

---

## Key Conventions

- **Date format**: DD/MM/YYYY (Spanish locale default throughout UI)
- **Numeric input**: locale-aware — Spanish uses commas as decimal separator
- **Currency**: Multi-currency support (USD and BOB)
- **Roles**: `admin | staff | viewer | partner | director | manager | senior | semisenior | sqr | specialist_it | specialist_tax`
- **Do not edit manually**: `src/integrations/supabase/types.ts` (auto-generated from schema)
- **Do not edit manually**: `supabase/config.toml` (managed by Lovable Cloud)

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

## Backend

- **Backend type**: Lovable Cloud (no direct Supabase dashboard access)
- **Edge Functions** (5): `manage-auth-user`, `assign-user-role`, `dashboard-data`, `test-minmax-settings`, `test-resubmission-state`
- **Migrations**: 67+ timestamped SQL files in `supabase/migrations/`
- **Key RPC functions**: `submit_timesheet_safe()`, `assign_user_role_atomic()`, `update_timesheet_minmax_settings()`

See `.claude/skills/lovable/SKILL.md` for the full deployment workflow — what syncs automatically vs what requires Lovable prompts.

---

## Lovable Deployment

This project uses Lovable Cloud. After pushing backend changes to `main`:

| Change | Lovable Prompt |
|--------|---------------|
| Edge Function edited | `"Deploy the [name] edge function"` |
| New migration file | `"Apply pending Supabase migrations"` |
| Need new table | `"Create a [name] table with columns: ..."` |

Full reference: `.claude/skills/lovable/SKILL.md`

---

## Running Locally

```bash
npm install
npm run dev          # Start dev server
npm run build        # Production build
npx vitest run       # Run all tests
npx vitest run [file] # Run single test file
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
