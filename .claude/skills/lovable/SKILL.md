---
name: lovable-integration
description: Work with Lovable.dev projects. Knows what auto-syncs via GitHub vs what requires Lovable deployment prompts. Use when user mentions Lovable, project has supabase/ directory with Edge Functions, user asks about deploying edge functions, applying migrations, RLS policies, storage, or secrets.
---

# Lovable Integration Skill

## Core Concept

Lovable uses **two-way GitHub sync on the `main` branch only**.

- **Frontend code** (React components, pages, hooks, config) → push to `main` → syncs automatically in 1-2 minutes
- **Backend operations** (deploying Edge Functions, applying migrations, configuring RLS, storage buckets, secrets) → push the files to `main`, then **provide a Lovable prompt** to trigger the action

The key distinction: pushing a file to GitHub makes it available to Lovable, but backend operations require an explicit Lovable instruction to execute.

---

## What Syncs Automatically (Push to `main` → Done)

| Path | Notes |
|------|-------|
| `src/` — all components, pages, hooks, lib, utils | Edit freely |
| `public/` — static assets | Edit freely |
| `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json` | Build config |
| `package.json` | Dependencies auto-installed by Lovable |
| `supabase/functions/*/index.ts` | Code file syncs — but **deployment** requires a Lovable prompt |
| `supabase/migrations/*.sql` | File syncs — but **applying** requires a Lovable prompt |

---

## What Requires Lovable Prompts (After Pushing)

After editing and pushing to `main`, provide the corresponding Lovable prompt:

| Change Made | Lovable Prompt to Provide |
|-------------|---------------------------|
| Edited one Edge Function | `"Deploy the [function-name] edge function"` |
| Edited multiple Edge Functions | `"Deploy all edge functions"` |
| Created a new migration `.sql` file | `"Apply pending Supabase migrations"` |
| Need a new table | `"Create a [name] table with columns: [col (type), ...]"` |
| Need RLS policy | `"Enable RLS on [table] allowing [who] to [what]"` |
| Need a storage bucket | `"Create a [public/private] storage bucket called [name]"` |
| Need a secret / env var | **Manual only** — Lovable Cloud UI: Cloud → Secrets → Add |

---

## Response Format

Whenever a backend deployment step is required, output:

```
📋 **LOVABLE PROMPT:**
> "[exact text to copy-paste into Lovable chat]"
```

For destructive or irreversible operations, prepend:

```
⚠️ **Warning**: [explanation of risk before proceeding]
```

---

## Lovable Cloud vs Own Supabase

### Detecting Which Type

| Signal | Lovable Cloud | Own Supabase |
|--------|--------------|--------------|
| No service_role key locally | Likely Lovable Cloud | — |
| `supabase` CLI configured with local access | — | Likely Own Supabase |
| Dashboard access at app.supabase.com | No | Yes |
| config.toml has Lovable-assigned project_id | Yes | — |

### Lovable Cloud (default for this project)
- All backend operations via Lovable prompts only
- Secrets managed at: Cloud → Secrets → Add (never in `.env` for production)
- `supabase/config.toml` is managed by Lovable — do not edit manually
- Cannot use `supabase functions deploy` directly

### Own Supabase
- Can use `supabase functions deploy [name]` directly from CLI
- Direct dashboard access for migrations, RLS, storage
- `supabase db push` applies migrations without Lovable prompts

---

## EMS 2.0 — Project-Specific Reference

### Edge Functions (5 total)

| Function | Purpose | JWT Config | Deploy Prompt |
|----------|---------|-----------|---------------|
| `manage-auth-user` | Admin-only user deletion with audit log | `verify_jwt = true` | `"Deploy the manage-auth-user edge function"` |
| `assign-user-role` | Atomic first-user → admin role assignment (race-condition safe) | `verify_jwt = true` | `"Deploy the assign-user-role edge function"` |
| `dashboard-data` | 8 analytics actions: time-value, engagement-kpis, staff-utilization, portfolio-risk, partner-leaderboard, my-week, timesheet-status, practice-pulse | Custom JWT validation (`verify_jwt = false`) | `"Deploy the dashboard-data edge function"` |
| `test-minmax-settings` | Validates timesheet min/max hour constraints via RPC | — | `"Deploy the test-minmax-settings edge function"` |
| `test-resubmission-state` | 10-scenario integration test suite for timesheet state machine | — | `"Deploy the test-resubmission-state edge function"` |

### Critical RPC Functions (PostgreSQL)

| Function | Purpose |
|----------|---------|
| `assign_user_role_atomic(p_user_id)` | Advisory-locked first-user detection (prevents dual-admin race condition) |
| `submit_timesheet_safe(p_period_id, p_staff_id, p_engagement_ids[], p_is_auto_approved)` | Transactional timesheet submission state machine |
| `update_timesheet_minmax_settings(...)` | Validates and persists DAILY/WEEKLY min/max hour constraints |
| `get_my_staff_id()` | Returns staff_id for authenticated user |
| `can_approve_timesheet(p_engagement_id)` | Returns whether current user can approve a given engagement |

### Key Tables

`staff`, `user_roles`, `engagements`, `clients`, `work_orders`, `wo_budget_lines`, `timesheet_periods`, `timesheet_line_approvals`, `time_entries`, `activity_codes`, `categories`, `global_settings`, `timer_entries`, `expense_logs`, `activity_worksheets`, `activity_worksheet_cells`, `user_lifecycle_audit_log`

### Role Enum
```sql
'admin' | 'staff' | 'viewer' | 'partner' | 'director' | 'manager' |
'senior' | 'semisenior' | 'sqr' | 'specialist_it' | 'specialist_tax'
```

### Files — Do Not Break

| File | Risk |
|------|------|
| `src/integrations/supabase/client.ts` | Contains Supabase URL and anon key — edit only if credentials change |
| `src/integrations/supabase/types.ts` | Auto-generated from schema — **never edit manually**; regenerate via Lovable |
| `supabase/config.toml` | Managed by Lovable Cloud — do not edit JWT settings manually |

---

## Branch Rules

- Only `main` syncs with Lovable — feature branches do not trigger any sync
- Lovable processes the sync within **1-2 minutes** of a push to `main`
- Always confirm you are on `main` before expecting changes to appear in Lovable

---

## Quick Prompts Reference

### Edge Functions
```
"Deploy all edge functions"
"Deploy the dashboard-data edge function"
"Deploy the manage-auth-user edge function"
"Show logs for the dashboard-data edge function"
"The assign-user-role edge function returns [error]. Fix it"
```

### Database
```
"Create a [name] table with columns: id (uuid), name (text), created_at (timestamp)"
"Add a [column] column of type [type] to the [table] table"
"Add a foreign key from [table1].[col] to [table2].id"
"Apply pending Supabase migrations"
```

### RLS Policies
```
"Enable RLS on [table]"
"Add RLS policy on [table] allowing authenticated users to read all rows"
"Add RLS policy on [table] allowing users to only access their own rows"
"Add RLS policy on [table] allowing admin role to read and write"
```

### Storage
```
"Create a public storage bucket called [name]"
"Create a private storage bucket called [name]"
"Allow authenticated users to upload to the [bucket] bucket"
```

### Auth
```
"Enable Google authentication"
"Enable GitHub authentication"
"When a user signs up, create a row in the profiles table"
```

---

## Debugging Checklist

### Frontend not updating?
- Are you on the `main` branch?
- Was the change pushed to remote?
- Wait 1-2 minutes for Lovable sync
- Check Lovable UI for sync errors

### Edge Function not working?
- Was it deployed via a Lovable prompt after the code was pushed?
- Are required secrets set in Cloud → Secrets?
- Check logs: `"Show logs for the [name] edge function"` in Lovable
- Verify JWT config matches `supabase/config.toml`

### Database query failing?
- Was the migration applied via Lovable (not just pushed to GitHub)?
- Do RLS policies allow the current role's action?
- Does the table exist? Was the migration file actually pushed to `main`?

### Supabase types out of sync with schema?
- Regenerate: ask Lovable to sync types, or trigger schema refresh
- Never edit `src/integrations/supabase/types.ts` manually
