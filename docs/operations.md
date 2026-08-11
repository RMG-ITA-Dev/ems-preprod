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

### Scheduler feature flag

`VITE_SCHEDULER_ENABLED` (`src/lib/schedulerFeature.ts`) gates the entire Scheduler module — 4 routes, sidebar/mobile-drawer nav, the staffing sections of Engagement/Work Order forms, and the Timesheet advisory RPC. Fail-closed: only the exact literal `"true"` enables it; absent, empty, or any other value disables it. It is **not** an authorization mechanism — server-side role checks and RLS still gate everything when it's on.

| Environment | How it's set |
|---|---|
| Operator-managed environments (local dev, integration Supabase) | `.env.local` (gitignored, Vite gives it precedence) |
| Lovable-built environment | Lovable's own environment-variable mechanism, never the tracked `.env` |
| Fallback (only if Lovable offers no env-var mechanism) | One line in the tracked `.env`, accepted as fragile: a Lovable-triggered `.env` regeneration would silently drop it back to disabled — fail-closed, never fail-open |

Activation order: migrate the target Supabase → verify schema/RLS contract → deploy `scheduler-data` and `scheduler-gaps` there → smoke test → only then set the flag. Functional rollback is removing the variable — migrations are forward-only and are never rolled back to disable the feature. Full detail: `docs/scheduler/fase_7/scheduler-fase-7-habilitacion-y-rollback.md`.

---

## Backend (Lovable Cloud)

- Supabase project ID: `ugqxfnrxvksiltwxzist`
- 9 Edge Functions (inventory below)
- 177 timestamped migrations in `supabase/migrations/` (post-convergence: `dev-scheduler` + `feat/roles-permisos` + 3 RLS/RPC-drift fixes found during the convergence review, `merge/dev-scheduler-roles-permisos`; 131 on `development` before this merge lands, 143 on `dev-scheduler` alone — see `bugs/scheduler/plan_merge_sche_rolper.md`)
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

`development` is the integration branch — feature branches (e.g. `dev-scheduler`) merge there first via Pull Request, with CI required. `main` is production and is what Lovable Cloud actually watches; `development` reaching `main` is a separate, deliberate promotion step, not automatic.

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
npm test                    # Run all tests (alias for `npx vitest run`)
npx vitest run [file]        # Run a single test file
npm run lint                 # ESLint
npm run typecheck            # tsc -p tsconfig.app.json --noEmit
npm run test:rls             # SQL/RLS harness — requires the local Supabase stack (R-LOCAL), never R-APP
npm run verify:vendor        # SVAR gantt vendor bundle integrity (3 layers: origins, capability allowlist, sha256)
```

Prerequisites: Node.js 18+ and npm.

`npm run typecheck` currently reports a non-zero, pinned baseline (183 errors, all pre-existing debt unrelated to the Scheduler integration — see the CI ratchet in `.github/workflows/test.yml` and `docs/scheduler/fase_7/scheduler-fase-7-verificacion.md`). The count must never grow; driving it to zero is scoped to the joint merge with `feat/roles-permisos`, not to any single phase.

---

## UI/UX Conventions

UI/UX rules (design system, page patterns, components, Lovable prompt templates) live in `docs/skills/` — see `docs/skills/README.md` for the index. Those docs are the canonical source for visual conventions and are referenced by every agent instruction file; do not duplicate their content here.
