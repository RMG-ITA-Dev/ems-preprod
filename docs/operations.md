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

`supabase/config.toml`: no longer Lovable-managed (the team moved off Lovable as the
backend administrator, 2026-09). The top-level project settings are hand-maintained
directly in the repo; the per-function `[functions.<name>]` blocks (`dashboard-data`,
`manage-auth-user`, `secure-signin`, `exchange-rate-sync`, ...) have always been added by
hand alongside each function's own migration/commit — that was already the practice
before this note existed, it just wasn't documented here. Note that `project_id` still points
at the Lovable Cloud project, so every CLI command against a different environment needs an
explicit `--project-ref`.

### Scheduler feature flag

`VITE_SCHEDULER_ENABLED` (`src/lib/schedulerFeature.ts`) gates the entire Scheduler module — 4 routes, sidebar/mobile-drawer nav, the staffing sections of Engagement/Work Order forms, and the Timesheet advisory RPC. Fail-closed: only the exact literal `"true"` enables it; absent, empty, or any other value disables it. It is **not** an authorization mechanism — server-side role checks and RLS still gate everything when it's on.

| Environment | How it's set |
|---|---|
| Operator-managed environments (local dev, integration Supabase) | `.env.local` (gitignored, Vite gives it precedence) |
| Lovable-built environment | Lovable's own environment-variable mechanism, never the tracked `.env` |
| Fallback (only if Lovable offers no env-var mechanism) | One line in the tracked `.env`, accepted as fragile: a Lovable-triggered `.env` regeneration would silently drop it back to disabled — fail-closed, never fail-open |

Activation order: migrate the target Supabase → verify schema/RLS contract → deploy `scheduler-data` and `scheduler-gaps` there → smoke test → only then set the flag. Functional rollback is removing the variable — migrations are forward-only and are never rolled back to disable the feature. Full detail: `docs/scheduler/fase_7/scheduler-fase-7-habilitacion-y-rollback.md`.

---

## Backend (Supabase)

- Supabase project ID: `ugqxfnrxvksiltwxzist`
- 14 Edge Functions (inventory below)
- Migrations in `supabase/migrations/` (run `ls supabase/migrations | sort` for the current count/list — it grows with every incremental bug/feature branch, so it's not tracked as a fixed number here): 14 are the consolidated "migración cero" set (`bugs/migracion_cero/plan_v2.md`), which replaced the prior 184-migration history: 7 schema files (`20251204000001..7_cero_01..07_*.sql`, renamed `services→practicas` / `taxonomies→servicios`) + 7 production-seed files (`20251204001001..7_cero_10..16_*.sql`, no demo data). Verified against the pre-consolidation baseline fingerprint — see `docs/migraciones/legado-consolidacion.md` and `docs/migraciones/DIFF-INTENCIONAL-consolidacion.md` for the accepted diff and rationale. Everything else is an incremental migration applied on top of that set, one per bug/feature ID (e.g. `20260825120000_0825-183_worksheet_activity_practice_scope.sql`).
- Key RPC functions: `submit_timesheet_safe(p_period_id uuid, p_staff_id uuid, p_engagement_ids uuid[], p_activity_ids uuid[], p_is_auto_approved boolean) returns jsonb` (5-arg signature; the old 4-arg overload was dropped in `20260716000000`; errors include `EMPTY_ENGAGEMENTS` and `ARRAY_LENGTH_MISMATCH`), `get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date) returns table(engagement_id uuid, start_date date, end_date date)` (Scheduler Fase 2/5/6 — canonical Monday `week_start`, span ≤ 6 days, `SECURITY DEFINER`), `assign_user_role_atomic()`, `update_timesheet_minmax_settings()`

### Edge Function Inventory

| Function | Purpose |
|----------|---------|
| `assign-user-role` | Atomic first-user-admin role assignment during bootstrap |
| `dashboard-data` | Aggregates dashboard analytics (utilization, hours, budget vs actual) |
| `exchange-rate-sync` | Fetches the TC Ruizmier microservice (USD/BOB oficial BCB) and upserts `exchange_rate_history`; sync mode is unauthenticated by design (future Railway cron), test mode is admin-gated in-handler (BUG 0722-156, Fase 1) |
| `manage-auth-user` | Auth user management (create, update, delete) |
| `secure-signin` | Sole legitimate caller of the account-lockout RPCs (`check_login_allowed`, `record_failed_login`); fronts sign-in so `anon` can no longer trip lockout directly (BUG 0514-115) |
| `scheduler-data` | Scheduler L1/staff-load/staff-timeline read-only queries, scoped by role visibility and effective engagement state (Fase 3) |
| `scheduler-gaps` | Firmwide Gap Reporting aggregates (headcount/hours/competency/bench), firmwide roles only (Fase 3) |
| `test-minmax-settings` | Backend integration tests for the min/max settings RPC |
| `test-resubmission-state` | Backend integration tests for timesheet resubmission state |
| `unlock-account` | Admin manual account unlock — clears `staff.is_blocked` + sends password reset email (BUG 0601-132) |
| `auth-email-hook` | Supabase Auth Send Email Hook — renders the account emails (signup / recovery / admin unlock) and sends them through Microsoft Graph instead of Supabase's built-in mail service. Authenticated by the Standard Webhooks signature, not a JWT (`docs/plan-correos-notificaciones.md` §3) |
| `request-password-reset` | Public "forgot password" endpoint. Asks GoTrue for the recovery token with `generateLink()` (which sends no email) and delivers it through Microsoft Graph, so the flow is no longer capped by Supabase's built-in 2-emails/hour limit. Abuse control is `claim_auth_email_slot()`, and the response is identical whether or not the account exists |
| `register-user` | Public sign-up endpoint. Creates the account with `generateLink({type:"signup"})` (no email sent by GoTrue) and delivers the confirmation through Microsoft Graph. Enforces `ALLOWED_EMAIL_DOMAIN` server-side — the form is bypassable — and answers identically whether or not the address already has an account, mailing an "you already have an account" notice instead |
| `send-notification-emails` | Drains `public.notification_emails` and delivers through Microsoft Graph. Fired every 5 minutes by the `notif-email-drain` pg_cron job (scheduled in the notifications catalogue migration, section H.4.b), authenticated by the `x-cron-secret` header. That job needs `pg_net` and two vault secrets loaded per project — the migration warns instead of failing when they are missing, so check its output on a fresh deploy. Templates live in `supabase/functions/_shared/plantillas/` |

---

## Deployment

**Target model (decided 2026-09-11): frontend on Railway, backend on Supabase, no Lovable.**
The Lovable Cloud project (`ugqxfnrxvksiltwxzist`) is the environment that exists today; everything
below describes how the target model is operated, and it is already how the EMS-Test project
(`slkqdcwwvmjtcbakajib`) is driven.

`development` is the integration branch — feature branches merge there first via Pull Request, with
CI required. `main` is production; `development` reaching `main` is a separate, deliberate
promotion step, not automatic.

### What ships where

| Change | How it ships |
|--------|--------------|
| Frontend (`src/**`), translations (`src/locales/*.json`) | Railway builds from the branch it watches |
| Migrations (`supabase/migrations/*.sql`) | `supabase db push --project-ref <ref>` |
| Edge functions (`supabase/functions/<name>/`) | `supabase functions deploy <name> --project-ref <ref>` |
| Secrets / env vars for functions | `supabase secrets set --project-ref <ref> --env-file <file>` |
| Auth redirect allowlist, Site URL, Auth Hooks | Dashboard only — no CLI equivalent |

Nothing deploys itself: a migration merged to `main` is **not** applied until someone runs
`db push`, and an edited edge function keeps serving its previous version until it is redeployed.

### Bringing up a Supabase project from zero

```bash
supabase link --project-ref <ref>
supabase db push                                     # every migration, in order; creates the ledger
supabase secrets set --project-ref <ref> --env-file <secrets.env>
supabase functions deploy <name> --project-ref <ref> # one per function
```

`supabase db push` records what it applied in `supabase_migrations.schema_migrations`, so a second
run is a no-op. Projects populated by pasting SQL into the Studio editor have no such ledger and
re-run everything — see the migration-order rule in `AGENTS.md`.

Function deploys read `[functions.<name>]` from `supabase/config.toml`, so `verify_jwt` travels with
the repo. Setting it by hand in the dashboard is only needed for functions pasted into the web
editor.

### Manual, per project, in the dashboard

These have no CLI path and must be repeated on every environment:

1. **Authentication → URL Configuration** — Site URL, plus every frontend origin in Redirect URLs.
   GoTrue ignores a `redirect_to` that is not listed and silently falls back to the Site URL.
2. **Authentication → Auth Hooks → Send Email hook** — HTTPS, pointing at
   `https://<ref>.supabase.co/functions/v1/auth-email-hook`. It generates its own secret, which then
   has to be loaded as `AUTH_EMAIL_HOOK_SECRET`.

### Origins the frontend is served from

Three functions keep a hardcoded allowlist and reject anything else: `dashboard-data`,
`scheduler-data`, `scheduler-gaps` (plus `FRONTEND_URL` from the environment). A new frontend
domain has to be added there as well as to the Auth redirect list, or those endpoints answer with
the wrong `Access-Control-Allow-Origin` and the browser blocks the call.

`register-user` and `request-password-reset` also need `FRONTEND_URL`, for a different reason:
both are public (`verify_jwt = false`, CORS `*`) and both send mail, so the links in those
messages are built from that secret and never from the request's `Origin` header — which the
caller picks. Without the secret set they refuse to run rather than fall back to the `Origin`.
`send-notification-emails` needs it too, for the links in the catalogue mails.

### Build-time variables on Railway

Vite inlines `VITE_*` at build time, so these must exist **when Railway builds**, not just at
runtime: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`,
`VITE_SCHEDULER_ENABLED`.

### Regenerating `types.ts`

```bash
supabase gen types typescript --project-ref <ref> > src/integrations/supabase/types.ts
```

Needed after any migration that adds or changes an RPC. Until it is regenerated, new RPCs have to be
called through an `as never` cast, and there are several of those waiting to be removed.

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
