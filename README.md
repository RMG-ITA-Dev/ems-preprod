# EMS 2.0 — Engagement Management System

A comprehensive bilingual (English/Spanish) engagement management system designed for professional services firms, particularly accounting and consulting practices. Built on the Ruizmier brand identity.

![EMS 2.0](https://img.shields.io/badge/Version-2.0.5-blue) ![React](https://img.shields.io/badge/React-18.3-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6) ![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4)

---

## Overview

EMS 2.0 manages the complete lifecycle of professional engagements from client onboarding through work order budgeting, time tracking, expense management, and timesheet approval. The system supports multi-currency operations (USD/BOB) with seasonal rate variations.

---

## Key Features

### Core Modules

| Module | Description |
|--------|-------------|
| **Dashboard** | Tab-driven analytics (Práctica, Cartera, Encargo, Personal) with role-based access |
| **Clients** | Client management with industry classification and engagement history |
| **Engagements** | Engagement lifecycle with partner/manager assignments and policy flags |
| **Work Orders** | Budget management with multi-currency, seasonal rates, risk assessment (CEAC/SAN), and approval workflow |
| **Worksheets** | Activity planning matrices (category × activity) with budget hour allocation and WO sync |
| **Timesheets** | Weekly timesheet grid with auto-save, copy previous week, and line-level approval workflow |
| **Timesheet Approvals** | Batch approval interface with per-engagement approve/reject/revision actions |
| **Time Tracker** | Real-time stopwatch with aggregated import to timesheets |
| **Expenses** | Expense type configuration, expense logging per engagement, and receipt upload |
| **Staff** | Staff management with category-based roles, billing rates, and soft-delete |
| **Settings** | System configuration (categories, industries, activity codes, holidays, global settings, user roles) |

### Business Logic

- **Multi-Currency Support**: USD and BOB with automatic rate selection
- **Seasonal Rates**: High and Low season rate differentiation per category
- **Rate Locking**: Work Orders snapshot rates at creation (calculations use locked values)
- **Realization Calculation**: Adjustment amount affects fees, not hours; configurable threshold via `REALIZATION_LIMIT` setting
- **Approval Workflow**: Draft → Pending Approval → Approved/Rejected
- **Timesheet Approval**: Line-level (per engagement) approval by Manager/Partner
- **Auto-Approval**: Partners/Directors (display_order ≤ 2) are auto-approved
- **Approved Line Protection**: DB trigger prevents INSERT/UPDATE/DELETE on time entries linked to approved lines
- **Month-End Deadline Rule**: Week spanning month-end → deadline shifts to month-end date
- **Holiday Blocking**: Admin-configurable holidays with DB trigger enforcement; visual indicators in timesheet grid
- **Non-Chargeable Engagement Policies**: Three flags (`work_order_required`, `activity_required`, `is_internal`) control engagement behavior in timesheets
- **Weekly/Daily Limit Enforcement**: Configurable hour limits with visual warnings at 80% and hard warnings at limit
- **Hire Date Validation**: Prevents time entry before staff hire date (full-week block or per-day lock)
- **Per-Engagement Approval Policy**: `approval_required` flag on engagements; when false, timesheet lines auto-approve on submission regardless of staff category
- **Engagement Date Range Validation**: Four-layer defense (dropdown filtering, per-cell lock, DB trigger, submit gate) prevents time entry outside engagement `start_date`/`end_date`
- **Min/Max Timesheet Limits**: Dual-bound model (`DAILY_MIN`/`DAILY_MAX`/`WEEKLY_MIN`/`WEEKLY_MAX`) replaces legacy single-limit (`DAILY_LIMIT`/`WEEKLY_LIMIT`); atomic RPC with cross-field feasibility validation
- **Inactivity Timeout**: Auto-logout after configurable idle period with cross-tab synchronization
- **No Staff Record = No Access**: 5-layer defense requiring linked staff record for app access; admin bootstrap flow for first user
- **Role-Based Access**: Admin, Partner, Director, Manager, Senior, Semi-Senior, Staff, Viewer, SQR, Specialist IT, Specialist Tax

### Internationalization

- Full English and Spanish language support
- Language setting stored in `global_settings.LANGUAGE` (admin-configurable)
- Date format: DD/MM/YYYY throughout
- Locale-aware numeric inputs (Spanish uses comma decimals) via `<NumericInput />` component
- Validation message localization via Zod schema factory pattern (`createFormSchema(t)` + `useMemo`)

---

## Technical Architecture

### Frontend Stack

| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework |
| **TypeScript** | Type safety |
| **Vite** | Build tool & dev server |
| **Tailwind CSS** | Utility-first styling with semantic design tokens |
| **shadcn/ui** | Radix UI primitives component library |
| **TanStack Query v5** | Server state management |
| **react-hook-form + Zod** | Form handling and validation |
| **react-i18next** | Internationalization |
| **Recharts** | Data visualization |
| **date-fns** | Date utilities |
| **Sonner** | Toast notifications |

### Backend Stack

- **Lovable Cloud** (Supabase-powered) — project ID `ugqxfnrxvksiltwxzist`
- PostgreSQL database with Row Level Security (RLS)
- 5 Edge Functions for custom server logic
- 67+ timestamped migrations under `supabase/migrations/`
- Database functions and triggers for validation

> **Do not edit manually**: `src/integrations/supabase/types.ts` (auto-generated from schema) and `supabase/config.toml` (managed by Lovable Cloud).

### Design System

| Token | Value |
|-------|-------|
| Primary Teal | `#008795` |
| Secondary Navy | `#0f3c73` |
| Brand Purple | `#7c3aed` |
| Typography | IBM Plex Sans with tabular figures |
| Density | High-density, spreadsheet-like interfaces |

---

## Project Structure

```
src/
├── components/
│   ├── auth/           # Authentication components
│   ├── dashboard/      # Dashboard tabs and widgets
│   ├── data-table/     # Reusable DataTable component
│   ├── forms/          # Entity forms (Client, Engagement, WorkOrder, etc.)
│   ├── layout/         # AppLayout, Sidebar, Header, Mobile navigation
│   ├── settings/       # Settings page components (categories, holidays, roles)
│   ├── timesheet/      # Timesheet grid, week navigator, approval grid
│   ├── tracker/        # Time tracker (stopwatch, manual entry, import)
│   ├── ui/             # shadcn/ui primitives + custom (NumericInput, ApprovalToggle)
│   └── worksheet/      # Activity worksheet grid
├── contexts/           # React contexts (DashboardContext)
├── hooks/
│   ├── mutations/      # TanStack Query mutations (per entity)
│   └── *.ts            # Custom hooks (useAuth, useCurrentStaff, useHolidays, etc.)
├── integrations/
│   └── supabase/       # Supabase client and types (auto-generated)
├── lib/                # Utilities (fiscalCalculations, validation, timesheetErrors, etc.)
├── locales/            # Translation files (en.json, es.json)
├── pages/              # Route pages
└── test/               # Test setup and utilities

supabase/
├── functions/
│   ├── assign-user-role/        # Atomic first-user-admin role assignment
│   ├── dashboard-data/          # Dashboard analytics aggregation (8 actions)
│   ├── manage-auth-user/        # Auth user lifecycle (create/update/delete)
│   ├── test-minmax-settings/    # Backend integration tests for min/max RPC
│   └── test-resubmission-state/ # Backend integration tests for resubmission state
└── migrations/                  # 67+ timestamped SQL migration files
```

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `global_settings` | System configuration (LANGUAGE, TAX_RATE, REALIZATION_LIMIT, SESSION_TIMEOUT_MINUTES, etc.) |
| `industries` | Client industry classification with fiscal year end |
| `categories` | Staff categories with seasonal/currency billing rates and approval permissions |
| `activity_codes` | Time entry classification codes (includes system ADM code) |
| `expense_types` | Expense type definitions |
| `holidays` | Admin-managed holiday dates with blocking enforcement |
| `user_roles` | User role assignments (app_role enum) |
| `staff` | Employee records linked to auth.users; includes `weekly_capacity_hours`, `hire_date`, `deleted_at` |
| `clients` | Client company records |
| `engagements` | Projects/jobs with partner/manager assignments and policy flags (`work_order_required`, `activity_required`, `is_internal`, `approval_required`) |
| `work_orders` | Budget engine (strict 1:1 per engagement) with risk assessment fields (CEAC/SAN) |
| `wo_budget_lines` | Hours budget by category (aggregated from worksheet) |
| `wo_expense_budget` | Expense budget allocations |
| `activity_worksheets` | Planning matrices per engagement (versioned, status-tracked) |
| `activity_worksheet_cells` | Budget cells (category × activity) with hours allocation |
| `timesheet_periods` | Weekly timesheet headers with deadline and lock status |
| `timesheet_line_approvals` | Per-engagement approval status (pending/approved/rejected) |
| `time_entries` | Actual hours logged with period linkage |
| `timer_entries` | Real-time stopwatch staging with import tracking |
| `expense_logs` | Expenses incurred by engagement with receipt URLs |

### Key Views

| View | Purpose |
|------|---------|
| `work_order_summary` | Aggregated WO with calculated fees and realization |
| `vw_wo_budget_hours_by_category` | Budget hours rolled up by category |
| `vw_wo_budget_hours_by_category_activity` | Budget hours by category + activity |
| `vw_actual_hours_by_category_activity` | Actual logged hours by category + activity |
| `vw_budget_vs_actual_hours_by_category_activity` | Variance analysis view |
| `staff_directory` | Public staff info (excludes auth/PII, filters soft-deleted) |
| `clients_directory` | Public client info (excludes sensitive data) |

### Key Database Functions

| Function | Purpose |
|----------|---------|
| `get_my_staff_id()` | Returns staff_id for current authenticated user |
| `is_admin()` | Checks if current user has admin role |
| `has_role(uuid, app_role)` | Generic role check |
| `is_engagement_team_member(uuid)` | Checks if user is partner/manager of engagement |
| `is_auto_approved_category(uuid)` | Checks if staff is Partner/Director |
| `get_line_approver(uuid, uuid)` | Determines approver for timesheet line |
| `get_timesheet_approvers(uuid, date)` | Returns valid approvers for a week |
| `can_approve_timesheet(uuid, uuid)` | Validates timesheet approval permission |
| `can_approve_timesheet_line(uuid, uuid, uuid)` | Validates line approval permission |
| `get_approvable_pairs(uuid[], uuid[])` | Batch approval eligibility check (replaces N+1 RPCs) |
| `sync_worksheet_to_wo_budget(uuid, uuid)` | Syncs worksheet cells to WO budget lines |
| `assign_user_role_atomic(uuid)` | Atomic first-user-admin role assignment |
| `start_timer_entry(uuid, uuid, text?)` | Starts stopwatch with single-timer enforcement |
| `stop_timer_entry(uuid, timestamptz?)` | Stops timer and calculates duration |
| `finalize_my_stale_timers()` | Cleans up orphaned running timers |
| `submit_timesheet_safe(uuid, uuid, uuid[], boolean)` | Submit timesheet with line approval management, min/max validation, and engagement date range gate |
| `update_timesheet_minmax_settings(numeric, numeric, numeric, numeric, integer)` | Atomic update of DAILY/WEEKLY MIN/MAX settings with feasibility validation |
| `check_time_entry_engagement_dates()` | Trigger function: validates time entry dates against engagement date range |

### Key Database Triggers

| Trigger | Purpose |
|---------|---------|
| `check_wo_approved` | Prevents time entry on unapproved WO (bypassed when `work_order_required = false`) |
| `enforce_holiday_blocking` | Blocks time entry on holiday dates (except holiday engagement) |
| `enforce_activity_default` | Auto-assigns ADM activity when `activity_required = false` |
| `protect_approved_time_entries` | Prevents INSERT/UPDATE/DELETE on approved timesheet lines |
| `validate_timer_duration` | Caps timer duration at 8 hours |
| `prevent_imported_timer_delete` | Prevents deletion of imported timer entries |
| `link_auth_user_to_staff` | Auto-links auth user to staff by email on signup |
| `link_staff_to_auth_user` | Auto-links staff to auth user when staff email matches |
| `validate_email_domain` | Enforces allowed email domain on signup |
| `check_time_entry_engagement_dates` | Validates time entry dates fall within engagement `start_date`/`end_date` range |
| `enforce_termination_date` | Prevents time entry after staff termination date |
| `reset_timer_import_on_unlink` | Resets import tracking when timer entry is unlinked |
| `prevent_staff_reactivation` | Prevents reactivation of soft-deleted staff records |
| `validate_submission_has_entries` | Ensures timesheet has entries before submission |

---

## Global Settings

| Key | Default | Description |
|-----|---------|-------------|
| `LANGUAGE` | `en` | System language (en/es) |
| `TAX_RATE` | `0.13` | Default VAT/IVA rate (13%) |
| `REALIZATION_LIMIT` | `75` | Threshold for realization color coding (%) |
| `ALLOWED_EMAIL_DOMAIN` | *(empty)* | Restrict signup to specific email domain |
| `HOLIDAY_ENGAGEMENT_ID` | *(uuid)* | Engagement used for holiday time entries |
| `ADM_ACTIVITY_ID` | *(uuid)* | System activity code for non-chargeable engagements |
| `SESSION_TIMEOUT_MINUTES` | `30` | Auto-logout after inactivity (minutes) |
| `DAILY_MIN` | `8` | Minimum hours per day |
| `DAILY_MAX` | `8` | Maximum hours per day |
| `WEEKLY_MIN` | `40` | Minimum hours per week |
| `WEEKLY_MAX` | `40` | Maximum hours per week |
| `TS_MAX_BACKLOG_WEEKS` | `1` | Timesheet backlog window |
| `TS_EMPLOYEE_RETRO_DAYS` | `30` | Days staff can edit past timesheets |
| `TS_WORK_DAYS` | `5` | Work days per week |
| `TS_AUTO_SAVE_SECONDS` | `3` | Auto-save interval for timesheet grid |

---

## User Roles

The `app_role` enum supports hierarchical access:

| Role | Access Level |
|------|--------------|
| `admin` | Full system access, manage all data and settings |
| `partner` | Firm-wide visibility, approve work orders and timesheets |
| `director` | Firm-wide visibility, approve work orders and timesheets |
| `manager` | Portfolio visibility, manage assigned engagements |
| `senior` | Log time, view assigned engagements |
| `semisenior` | Log time, view assigned engagements |
| `staff` | Log time, view own data |
| `viewer` | Read-only access |
| `sqr` | Quality review specialist |
| `specialist_it` | IT specialist role |
| `specialist_tax` | Tax specialist role |

---

## Dashboard Architecture

Four role-gated tabs with shared PeriodSelector:

| Tab | Who Sees It | Purpose |
|-----|-------------|---------|
| **Práctica** | Partners/Directors | Firm-wide metrics and KPIs |
| **Cartera** | Managers+ | Portfolio view of assigned engagements |
| **Encargo** | All staff | Single engagement drill-down |
| **Personal** | All staff | Individual performance metrics |

---

## Fiscal Year Configuration

The firm's fiscal year runs **October 1 through September 30**:
- Fiscal Year 2025 = October 1, 2024 → September 30, 2025
- Constant: `FISCAL_YEAR_START_MONTH = 9` (zero-indexed October) in `src/lib/fiscalCalculations.ts`

Period types supported:
- Calendar Year (Jan 1 - Dec 31)
- Tax Year Bolivia (Apr 1 - Mar 31)
- Custom date ranges

---

## Design Consistency Rules

1. **No back arrows** — use Cancel button instead
2. **LIST VIEW / ADD-EDIT pattern**: LIST = DataTable with "+ Add" button; ADD-EDIT = full-screen with Cancel/Save
3. **Button colors**: Add/Save = purple, Cancel = gray, Submit = light blue, Delete = crimson
4. **High information density**: `space-y-2`, `p-4`, `text-xs` labels, `text-sm` data
5. **Numeric formatting**: Zero decimals, no currency signs (currency in column headers only)
6. **Alignment**: Text left, numbers right, dates/status center
7. **Semantic colors only**: Use design tokens from `index.css` and `tailwind.config.ts`

---

## Vite Dependency Optimization

Heavy dependencies are pre-bundled to prevent 504 timeout errors:

| Category | Packages |
|----------|----------|
| Date/Time | `date-fns`, `date-fns/locale` |
| Visualization | `recharts` |
| i18n | `i18next`, `react-i18next` |
| Radix UI | `@radix-ui/react-dialog`, `react-select`, `react-popover`, `react-tooltip`, `react-slot` |

**When to add to `optimizeDeps.include`:**
- Package size > 500KB
- Has locale/language sub-modules
- Uses deep imports
- Is a monorepo package
- Previously caused loading issues

---

## Edge Functions

| Function | Purpose |
|----------|---------|
| `assign-user-role` | Atomic first-user-admin role assignment during bootstrap |
| `dashboard-data` | Aggregates dashboard analytics (utilization, hours, budget vs actual) |
| `manage-auth-user` | Auth user management (create, update, delete) |
| `test-minmax-settings` | Backend integration tests for min/max settings RPC |
| `test-resubmission-state` | Backend integration tests for timesheet resubmission state |

---

## Development

### Prerequisites

- Node.js 18+
- npm

### Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run all tests
npx vitest run

# Run a single test file
npx vitest run path/to/file.test.ts
```

### Testing

- **Framework**: Vitest with React Testing Library
- **Coverage**: `npx vitest run --coverage`
- **Test files**: `*.test.ts` / `*.test.tsx` in `__tests__` directories

---

## Deployment

The application is deployed via Lovable Cloud:

- **Preview URL**: https://id-preview--4c32b93c-807f-40a7-9f84-3e06064e2b7d.lovable.app
- **Published URL**: https://aurora-engage-pro.lovable.app

---

## Lovable Workflow

This project is built with Lovable.dev and deployed on Lovable Cloud. Frontend code syncs automatically through the GitHub integration, but **backend changes require an explicit Lovable prompt** after the commit lands on `main`.

| Change | Auto-syncs? | Required Lovable Prompt |
|--------|-------------|--------------------------|
| Frontend (`src/**`) | Yes | — |
| Translations (`src/locales/*.json`) | Yes | — |
| Edge Function edited (`supabase/functions/<name>/`) | No | `"Deploy the <name> edge function"` |
| New migration (`supabase/migrations/*.sql`) | No | `"Apply pending Supabase migrations"` |
| New table / schema change | No | `"Create a <name> table with columns: ..."` |
| New secret / env var | No | `"Add a Supabase secret named <NAME>"` |

Full reference: `.claude/skills/lovable/SKILL.md`.

---

## Ruizmier Skill Set (RSS)

Reusable UI/UX skills that ensure a unified look and feel across all Ruizmier ERM apps. Two surfaces:

### Shared Docs (readable by Claude Code, Lovable, Codex)

| Document | Scope |
|----------|-------|
| `docs/skills/README.md` | Skill index and cross-platform usage |
| `docs/skills/design-system.md` | Colors, typography, spacing, button rules, theming |
| `docs/skills/page-patterns.md` | Layout, List View, Add/Edit View, navigation, responsive |
| `docs/skills/component-patterns.md` | DataTable, buttons, forms, dialogs, badges |
| `docs/skills/lovable-prompts.md` | Prompt templates for Lovable.dev |

### Claude Code Skills (auto-trigger on context)

| Skill | Trigger |
|-------|---------|
| `ruizmier-design-system` | Creating/modifying UI, styling, colors |
| `ruizmier-page-patterns` | Creating pages, routes, navigation |
| `ruizmier-components` | Creating components, tables, forms, dialogs |
| `ruizmier-lovable-bridge` | Preparing Lovable prompts |

### Cross-Tool Bridge Files

| File | Tool |
|------|------|
| `AGENTS.md` | Codex, GitHub Copilot |
| `.lovable/instructions.md` | Lovable.dev |
| `CLAUDE.md` | Claude Code |

---

## Contributing

### Branching

- `main` is the deployment branch — Lovable pulls from it.
- Feature work happens on short-lived branches off `main`, named `<author>/<topic>` (e.g., `claude/update-readme-i3XeM`).
- Open a PR against `main`; do not push directly.

### Commits

- Write present-tense, imperative subjects ("Add holiday blocking trigger", not "Added…").
- Keep the subject under ~70 characters; use the body to explain *why*, not *what*.
- One logical change per commit when practical.

### Before opening a PR

1. `npm run build` — ensure the production build compiles.
2. `npx vitest run` — all tests pass.
3. Confirm no edits to auto-generated files (`src/integrations/supabase/types.ts`, `supabase/config.toml`).
4. If the change touches backend (edge functions, migrations, schema), note the required Lovable prompt in the PR description.

### Code conventions

- Follow the patterns documented in `docs/skills/` and the Ruizmier Skill Set.
- Use design tokens from `index.css` / `tailwind.config.ts` — no raw hex colors in components.
- Localize all user-facing strings via `react-i18next` (both `en.json` and `es.json`).
- Use `<NumericInput />` for any locale-aware numeric input.

---

## Troubleshooting

| Symptom | Likely cause & fix |
|---------|--------------------|
| **504 timeout loading a route in dev** | Vite is bundling a heavy dep on demand. Add the package to `optimizeDeps.include` in `vite.config.ts` and restart `npm run dev`. |
| **"No staff record found" after sign-in** | The signed-in auth user is not linked to a `staff` row. Either match the user's email to a staff record, or run the admin bootstrap flow as the first user. |
| **Edge function changes not visible in production** | Edge functions don't auto-deploy. Push to `main`, then prompt Lovable: `"Deploy the <name> edge function"`. |
| **New migration not applied** | Migrations don't auto-run. Push to `main`, then prompt Lovable: `"Apply pending Supabase migrations"`. |
| **`types.ts` shows stale types after a schema change** | The file is regenerated by Lovable after migrations apply. Re-pull `main` once the migration prompt completes. |
| **Timesheet submit fails with "outside engagement date range"** | A time entry falls outside the engagement's `start_date`/`end_date`. Adjust the entry or the engagement dates. |
| **Cannot edit an existing time entry** | The line is approved — the `protect_approved_time_entries` trigger blocks writes. Have an approver revert the line to pending. |
| **Validation messages render in the wrong language** | The Zod schema was instantiated outside `useMemo` with `t`. Wrap it: `const schema = useMemo(() => createFormSchema(t), [t])`. |
| **Spanish numeric input rejects decimals** | Use `<NumericInput />` — native `<input type="number">` is not locale-aware. |
| **Min/Max settings update fails** | `update_timesheet_minmax_settings` validates cross-field feasibility (DAILY_MIN ≤ DAILY_MAX, etc.). Adjust the bounds together. |

---

## Documentation

| Document | Location |
|----------|----------|
| ER Diagram | `supabase/ems-er-diagram.md` |
| Database Schema | `docs/database-schema.sql` |
| Access Rules | `docs/access_rules.md` |
| Changelog (Jan 30) | `docs/CHANGELOG-2026-01-30.md` |
| Changelog (Feb 6) | `docs/CHANGELOG-2026-02-06.md` |
| Changelog (Feb 11) | `docs/CHANGELOG-2026-02-11.md` |
| Changelog (Feb 13) | `docs/CHANGELOG-2026-02-13.md` |
| Changelog (Feb 17) | `docs/CHANGELOG-2026-02-17.md` |
| Changelog (Feb 22) | `docs/CHANGELOG-2026-02-22.md` |
| Changelog (Feb 24) | `docs/CHANGELOG-2026-02-24.md` |
| Responsive QA | `RESPONSIVE_QA.md` |

---

## License

Proprietary — Ruizmier & Asociados

---

*Last Updated: May 13, 2026*
