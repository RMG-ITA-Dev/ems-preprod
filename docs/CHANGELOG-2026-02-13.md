# Changelog — 2026-02-13

## Schema: Merge `staff_capacity` into `staff`

### What Changed
- Added `weekly_capacity_hours NUMERIC NOT NULL DEFAULT 40` column to `staff` table.
- Migrated any existing data from `staff_capacity` (0 rows at time of migration).
- Dropped `staff_capacity` table, its RLS policies, indexes, and triggers.

### Why
The `staff_capacity` table stored a single value per staff member with unused date-range columns. Consolidating into `staff` simplifies the schema without losing functionality.

### Files Modified
| File | Change |
|------|--------|
| Migration SQL | Add column, migrate data, drop table |
| `supabase/functions/dashboard-data/index.ts` | Replaced 2 `staff_capacity` queries with reads from `staff.weekly_capacity_hours` |
| `docs/database-schema.sql` | Removed `staff_capacity` definitions; added column to `staff` |
| `supabase/ems-er-diagram.md` | Removed `staff_capacity` entity and relationship |

### Impact
- **Frontend:** None — no `src/` file referenced `staff_capacity`.
- **Data loss:** None — table had 0 rows.
