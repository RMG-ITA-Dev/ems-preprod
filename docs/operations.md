# Ruizmier ERM — Operations Reference

**Single source of truth** for tooling, project conventions, edge functions, and the Lovable deployment workflow. All agent instruction files and the README link here rather than duplicating this content.

| Consumer | Entry file | Reads this doc via |
|----------|------------|--------------------|
| Claude Code | `CLAUDE.md` | Link |
| Codex / GitHub Copilot | `AGENTS.md` | Link |
| Lovable.dev | `.lovable/instructions.md` | Link |
| Human contributors | `README.md` | Link |
| Greptile (PR review) | — | Reads this file directly |
| GitHub (rendered docs) | — | Reads this file directly |

> **Maintenance rule**: update this file only. The four pointer files above must not duplicate its content. When you add a new edge function, a new Lovable prompt, or change a do-not-edit rule, edit `docs/operations.md` — nothing else.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| UI | Tailwind CSS + shadcn/ui (Radix primitives) |
| Backend | Supabase (Lovable Cloud) — project ID `ugqxfnrxvksiltwxzist` |
| State | TanStack Query v5 + React Context |
| Forms | react-hook-form + Zod |
| i18n | react-i18next (EN/ES) |
| Testing | Vitest + React Testing Library |

---

## Key Conventions

- **Date format**: DD/MM/YYYY (Spanish locale default throughout the UI).
- **Numeric input**: locale-aware — Spanish uses commas as the decimal separator. Use `<NumericInput />`, never raw `<input type="number">`.
- **Currency**: multi-currency (USD and BOB). Cells show zero decimals and no currency sign; the currency lives in the column header.
- **Text**: every visible string goes through `react-i18next` (`t("key")`). Never hardcode English or Spanish.
- **Roles** (`app_role` enum): `admin | partner | director | manager | senior | semisenior | staff | viewer | sqr | specialist_it | specialist_tax`.

### Files that must never be hand-edited

| File | Why |
|------|-----|
| `src/integrations/supabase/types.ts` | Auto-generated from the Supabase schema |
| `supabase/config.toml` | Managed by Lovable Cloud |

---

## Backend (Lovable Cloud)

- Supabase project ID: `ugqxfnrxvksiltwxzist`
- 9 Edge Functions (inventory below)
- 139 timestamped migrations in `supabase/migrations/`
- Key RPC functions: `submit_timesheet_safe(p_period_id uuid, p_staff_id uuid, p_engagement_ids uuid[], p_activity_ids uuid[], p_is_auto_approved boolean) returns jsonb` (5-arg signature; the old 4-arg overload was dropped in `20260716000000`; errors include `EMPTY_ENGAGEMENTS` and `ARRAY_LENGTH_MISMATCH`), `get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date) returns table(engagement_id uuid, start_date date, end_date date)` (Scheduler Fase 2/5/6 — canonical Monday `week_start`, span ≤ 6 days, `SECURITY DEFINER`), `assign_user_role_atomic()`, `update_timesheet_minmax_settings()`

### Edge Function Inventory

| Function | Purpose |
|----------|---------|
| `assign-user-role` | Atomic first-user-admin role assignment during bootstrap |
| `dashboard-data` | Aggregates dashboard analytics (utilization, hours, budget vs actual) |
| `manage-auth-user` | Auth user management (create, update, delete) |
| `secure-signin` | Sole legitimate caller of the account-lockout RPCs (`check_login_allowed`, `record_failed_login`); fronts sign-in so `anon` can no longer trip lockout directly (BUG 0514-115) |
| `scheduler-data` | Scheduler L1/staff-load/staff-timeline read-only queries, scoped by role visibility and effective engagement state (Fase 3) |
| `scheduler-gaps` | Firmwide Gap Reporting aggregates (headcount/hours/competency/bench), firmwide roles only (Fase 3) |
| `test-minmax-settings` | Backend integration tests for the min/max settings RPC |
| `test-resubmission-state` | Backend integration tests for timesheet resubmission state |
| `unlock-account` | Admin manual account unlock — clears `staff.is_blocked` + sends password reset email (BUG 0601-132) |

---

## Lovable Deployment Workflow

Frontend code in `src/**` and translations in `src/locales/*.json` sync automatically through the GitHub integration. **Backend changes require an explicit Lovable prompt** after the commit lands on `main`.

| Change | Auto-syncs? | Required Lovable prompt |
|--------|-------------|--------------------------|
| Frontend (`src/**`) | Yes | — |
| Translations (`src/locales/*.json`) | Yes | — |
| Edge Function edited (`supabase/functions/<name>/`) | No | `"Deploy the <name> edge function"` |
| New migration (`supabase/migrations/*.sql`) | No | `"Apply pending Supabase migrations"` |
| New table / schema change | No | `"Create a <name> table with columns: ..."` |
| New secret / env var | No | `"Add a Supabase secret named <NAME>"` |

Deep reference: `.claude/skills/lovable/SKILL.md`.

---

## Running Locally

```bash
npm install
npm run dev            # Start dev server
npm run build          # Production build
npx vitest run         # Run all tests
npx vitest run [file]  # Run a single test file
```

Prerequisites: Node.js 18+ and npm.

---

## UI/UX Conventions

UI/UX rules (design system, page patterns, components, Lovable prompt templates) live in `docs/skills/` — see `docs/skills/README.md` for the index. Those docs are the canonical source for visual conventions and are referenced by every agent instruction file; do not duplicate their content here.
