## **Step 8 — S-08: Add DB indexes for dashboard predicates (BACKEND — Lovable to implement)**

&nbsp;

## Goal

Add a new Supabase migration file that creates 7 indexes on `time_entries`, `engagements`, and `timesheet_line_approvals` to accelerate dashboard tab queries.

## File to Create

`supabase/migrations/20260425000000_dashboard_perf_indexes.sql`

(Timestamp `20260425000000` chosen to match today's date 2026-04-25 and sort after all existing migrations.)

## Migration Contents

```sql
-- time_entries — three composite indexes for the three distinct dashboard predicate shapes
CREATE INDEX IF NOT EXISTS idx_time_entries_engagement_date
  ON public.time_entries(engagement_id, date_worked);

CREATE INDEX IF NOT EXISTS idx_time_entries_staff_date
  ON public.time_entries(staff_id, date_worked);

CREATE INDEX IF NOT EXISTS idx_time_entries_period_engagement
  ON public.time_entries(period_id, engagement_id);

-- engagements — partner/manager lookups with status filter
CREATE INDEX IF NOT EXISTS idx_engagements_partner_status
  ON public.engagements(partner_id, status);

CREATE INDEX IF NOT EXISTS idx_engagements_manager_status
  ON public.engagements(manager_id, status);

-- timesheet_line_approvals — partial filtered index for pending, plus engagement+period composite
CREATE INDEX IF NOT EXISTS idx_tla_pending_engagement
  ON public.timesheet_line_approvals(engagement_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tla_engagement_period
  ON public.timesheet_line_approvals(engagement_id, period_id);
```

## Index Summary


| #   | Index                                | Table                    | Columns                              | Type      | Purpose                                                 |
| --- | ------------------------------------ | ------------------------ | ------------------------------------ | --------- | ------------------------------------------------------- |
| 1   | `idx_time_entries_engagement_date`   | time_entries             | (engagement_id, date_worked)         | composite | Engagement-scoped period queries (Encargo/Cartera tabs) |
| 2   | `idx_time_entries_staff_date`        | time_entries             | (staff_id, date_worked)              | composite | Personal tab + my-week aggregations                     |
| 3   | `idx_time_entries_period_engagement` | time_entries             | (period_id, engagement_id)           | composite | Approval grid line aggregation                          |
| 4   | `idx_engagements_partner_status`     | engagements              | (partner_id, status)                 | composite | Partner leaderboard / portfolio                         |
| 5   | `idx_engagements_manager_status`     | engagements              | (manager_id, status)                 | composite | Manager portfolio queries                               |
| 6   | `idx_tla_pending_engagement`         | timesheet_line_approvals | engagement_id WHERE status='pending' | partial   | Pending approval counts (dominant filter)               |
| 7   | `idx_tla_engagement_period`          | timesheet_line_approvals | (engagement_id, period_id)           | composite | Approval status joins                                   |


## Validation Notes

- Verified all 7 referenced columns exist on the live tables (per schema in context):
  - `time_entries`: `engagement_id`, `date_worked`, `staff_id`, `period_id` ✓
  - `engagements`: `partner_id`, `manager_id`, `status` ✓
  - `timesheet_line_approvals`: `engagement_id`, `period_id`, `status` (default `'pending'`) ✓
- All statements use `IF NOT EXISTS` → idempotent, safe to re-run.
- No `CONCURRENTLY` used (cannot run inside a migration transaction); migrations are applied in a transaction by Lovable. Index builds will briefly hold ACCESS EXCLUSIVE locks on each table — acceptable for tables of this size.
- No data changes, no schema drift to `types.ts` (indexes are not reflected in the generated types).

## After Approval — Deployment

After the file is created and pushed to `main`, the following Lovable prompt is required to apply it:

📋 **LOVABLE PROMPT:**

> "Apply pending Supabase migrations"

## Out of Scope

- No application code changes (`src/**` untouched).
- No RLS / function / trigger changes.
- No removal of existing indexes.
- No `ANALYZE` statement (Postgres autovacuum will refresh stats; can be added later if measurement shows planner needs a nudge).

## Acceptance Criteria

- New file `supabase/migrations/20260425000000_dashboard_perf_indexes.sql` exists with the exact SQL above.
- Migration applies cleanly via Lovable prompt.
- `\d+ public.time_entries`, `\d+ public.engagements`, `\d+ public.timesheet_line_approvals` show the 7 new indexes.

**Changelog Append**

**File:** docs/changelogs/[CHANGELOG-2026-04-24.md](http://CHANGELOG-2026-04-24.md)

You need to append to the CHANGELOG a detailed description of the changes made while implementing this Plan. There needs to be sufficient detail to be able to verify if the changes to the codebase correspond to the CHANGELOG.