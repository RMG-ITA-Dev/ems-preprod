

# Plan: Merge `staff_capacity` into `staff`

## Why This Makes Sense

The `staff_capacity` table stores a single value (`weekly_capacity_hours`, default 40) per staff member. It currently has **zero rows** of data, meaning the system always falls back to the default of 40. It is only referenced in one file outside of auto-generated types and documentation: the `dashboard-data` edge function.

The date-range columns (`effective_from`, `effective_to`) were designed for historical capacity tracking but are unused in practice — the code always takes the latest active record or defaults to 40.

---

## What Changes

### Step 1 — Database Migration

- Add column `weekly_capacity_hours NUMERIC NOT NULL DEFAULT 40` to the `staff` table
- Copy any existing data from `staff_capacity` to `staff` (currently 0 rows, but handled for safety)
- Drop the `staff_capacity` table along with its RLS policies, indexes, and trigger

```text
staff table (after)
+---------------------------+
| ... existing columns ...  |
| weekly_capacity_hours (40)|  <-- NEW
+---------------------------+
```

### Step 2 — Update Edge Function

**File:** `supabase/functions/dashboard-data/index.ts`

Two changes:

1. **Lines 574-600 (team utilization):** Remove the separate `staff_capacity` query. Instead, add `weekly_capacity_hours` to the existing staff query on line 584. Build `capacityByStaff` directly from the staff list.

2. **Lines 803-813 (individual capacity):** Remove the separate `staff_capacity` query. Instead, read `weekly_capacity_hours` from the staff record already fetched earlier in the function (or add it to the staff query for that code path).

### Step 3 — Update Documentation

| File | Change |
|------|--------|
| `docs/database-schema.sql` | Remove `staff_capacity` table definition and policies; add column to `staff` |
| `supabase/ems-er-diagram.md` | Remove `staff_capacity` entity and its relationship arrow |
| `docs/CHANGELOG-2026-02-13.md` | Document the consolidation |

### Step 4 — No Frontend Changes Needed

No component, hook, or page in `src/` ever queries `staff_capacity`. The auto-generated `types.ts` will update automatically after the migration.

---

## Files Modified (Complete List)

| File | Action |
|------|--------|
| New migration `.sql` | Add column, migrate data, drop table + policies + trigger + indexes |
| `supabase/functions/dashboard-data/index.ts` | Replace 2 `staff_capacity` queries with reads from `staff` |
| `docs/database-schema.sql` | Schema documentation update |
| `supabase/ems-er-diagram.md` | Remove entity from ER diagram |
| `docs/CHANGELOG-2026-02-13.md` | New changelog entry |

---

## Risk Assessment

- **Data loss:** None. The table has 0 rows; all capacity values currently default to 40.
- **Frontend impact:** None. No frontend file references `staff_capacity`.
- **Rollback:** The migration can be reversed by re-creating the table if needed.

