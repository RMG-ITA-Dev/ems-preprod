# Changelog — 2026-02-13

## Schema: Merge `staff_capacity` into `staff`

### Problem

The database had a separate `staff_capacity` table designed to track per-staff weekly capacity with historical date-range support (`effective_from`, `effective_to`). In practice:

- The table contained **zero rows** — every capacity lookup fell back to the hardcoded default of 40 hours/week.
- The date-range columns (`effective_from`, `effective_to`) were never used; the edge function always selected the single latest active record or defaulted to 40.
- The table added unnecessary complexity: its own RLS policies, indexes, triggers, and a join in the `dashboard-data` edge function — all for a value that could be a simple column on `staff`.
- Only **one file** outside of auto-generated types and documentation referenced the table: `supabase/functions/dashboard-data/index.ts`.

### Solution

Consolidate `staff_capacity` into the `staff` table by adding a single column.

### What Changed

#### Database Migration
- Added `weekly_capacity_hours NUMERIC NOT NULL DEFAULT 40` column to the `staff` table.
- Migrated any existing data from `staff_capacity` into the new column (0 rows at time of migration, but handled for safety).
- Dropped the `staff_capacity` table along with all its dependent objects:
  - RLS policies (`staff_capacity_admin_all`, `staff_capacity_self_read`)
  - Index (`idx_staff_capacity_staff_id`)
  - Trigger (`update_staff_capacity_updated_at`)

#### Edge Function (`supabase/functions/dashboard-data/index.ts`)
1. **Team utilization (lines ~574-600):** Removed the separate `staff_capacity` query and join. The existing staff query now includes `weekly_capacity_hours`, and `capacityByStaff` is built directly from the staff list.
2. **Individual capacity (lines ~803-813):** Removed the dedicated `staff_capacity` lookup. Capacity is now read from the staff record already fetched earlier in the function.
3. Removed the `StaffCapacity` interface (no longer needed).

#### Documentation
- `docs/database-schema.sql` — Removed `staff_capacity` table definition, policies, indexes, and trigger; added `weekly_capacity_hours` column to `staff`.
- `supabase/ems-er-diagram.md` — Removed `staff_capacity` entity and its relationship arrow to `staff`.

### Files Modified

| File | Action |
|------|--------|
| Migration SQL | Add column, migrate data, drop table + policies + trigger + indexes |
| `supabase/functions/dashboard-data/index.ts` | Replace 2 `staff_capacity` queries with reads from `staff.weekly_capacity_hours`; remove `StaffCapacity` interface |
| `docs/database-schema.sql` | Schema documentation update |
| `supabase/ems-er-diagram.md` | Remove entity from ER diagram |
| `docs/CHANGELOG-2026-02-13.md` | This changelog |

### Impact

- **Frontend:** None — no `src/` file ever referenced `staff_capacity`.
- **Data loss:** None — table had 0 rows; all capacity values defaulted to 40.
- **Performance:** Slight improvement — dashboard edge function eliminates one extra query/join per request.
- **Rollback:** The migration can be reversed by re-creating the table if needed.
