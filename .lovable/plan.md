

# Add Expense Ownership Tracking (`created_by_staff_id`)

## Problem

The `expense_logs` table has no `created_by_staff_id` column. There is no way to know which staff member logged an expense. All expenses visible via RLS (team or admin) appear in one undifferentiated list.

## Solution

Add a `created_by_staff_id` column to the database, auto-populate it on insert, include staff info in queries, and add a "My Expenses" toggle on the Gastos page. The form and edit pages will also pass the current staff ID when creating expenses.

---

## All Changes

### 1. Database Migration

```sql
-- Add created_by_staff_id column (nullable for existing rows)
ALTER TABLE public.expense_logs
  ADD COLUMN created_by_staff_id uuid REFERENCES public.staff(staff_id);

-- Backfill: no data available to backfill, existing rows stay NULL

-- Index for filtering by creator
CREATE INDEX idx_expense_logs_created_by ON public.expense_logs (created_by_staff_id);
```

No RLS changes needed -- existing policies already control row visibility via `is_engagement_team_member` and `is_admin`. The new column is purely informational.

### 2. `src/hooks/useEmsData.ts` -- Update types and queries

**2a. Update `ExpenseLogListItem` interface (lines 153-172):** Add `created_by_staff_id` field and a nested `created_by_staff` relation with `staff_id`, `first_name`, `last_name`, `initials`.

**2b. Update `ExpenseLog` interface (lines 138-150):** Add `created_by_staff_id` field.

**2c. Update `useAllExpenseLogs` query (lines 493-508):** Add `created_by_staff:staff!created_by_staff_id(staff_id, first_name, last_name, initials)` to the select.

**2d. Update `useExpenseLogById` query (lines 512-530):** Add `created_by_staff:staff!created_by_staff_id(staff_id, first_name, last_name, initials)` to the select.

### 3. `src/hooks/useExpenseLogMutations.ts` -- Include `created_by_staff_id` in insert

Add `created_by_staff_id?: string` to the mutation input type. The caller (ExpenseNew page) will pass the current staff ID.

### 4. `src/pages/ExpenseNew.tsx` -- Pass current staff ID

Import `useCurrentStaff`, get `staffRecord`, and include `created_by_staff_id: staffRecord.staff_id` in the data passed to `createExpenseLog.mutateAsync()`.

### 5. `src/components/forms/ExpenseLogForm.tsx` -- No changes needed

The form itself does not need to display or edit `created_by_staff_id`. It is set automatically by the calling page.

### 6. `src/pages/Expenses.tsx` -- Add "My Expenses" toggle + "Logged By" column

**6a. Add imports:** `useCurrentStaff` from hooks, `Switch` and `Label` from UI components.

**6b. Add state:** `const [myExpensesOnly, setMyExpensesOnly] = useState(false)` and get `staffRecord` from `useCurrentStaff()`.

**6c. Add filter in `filteredData` memo:** When `myExpensesOnly` is true, filter by `log.created_by_staff_id === staffRecord?.staff_id`.

**6d. Add toggle UI** in the toolbar area (next to search): A `Switch` with label "My Expenses" / "Mis Gastos".

**6e. Desktop table -- add "Logged By" column** showing `log.created_by_staff?.initials` or full name. This makes it clear who logged each expense when viewing team expenses.

**6f. Mobile cards -- add logged-by indicator** showing initials badge on each card.

### 7. `src/locales/en.json` -- Add keys (in `expenses` section, after line 592)

```json
"myExpenses": "My Expenses",
"loggedBy": "Logged By",
"allTeamExpenses": "All Team Expenses"
```

### 8. `src/locales/es.json` -- Add keys (in `expenses` section, after line 592)

```json
"myExpenses": "Mis Gastos",
"loggedBy": "Registrado Por",
"allTeamExpenses": "Todos los Gastos del Equipo"
```

---

## Files Summary

| # | File | Action |
|---|------|--------|
| 1 | Database migration | `ALTER TABLE` add column + index |
| 2 | `src/hooks/useEmsData.ts` | Update interfaces + queries |
| 3 | `src/hooks/useExpenseLogMutations.ts` | Add `created_by_staff_id` to insert |
| 4 | `src/pages/ExpenseNew.tsx` | Pass staff ID on create |
| 5 | `src/pages/Expenses.tsx` | Add toggle + "Logged By" column |
| 6 | `src/locales/en.json` | Add 3 keys |
| 7 | `src/locales/es.json` | Add 3 keys |

## Risk Assessment

- **Low risk** -- new nullable column, no breaking changes to existing data
- Existing rows will have `created_by_staff_id = NULL` (displayed as "-" or empty)
- Only new expenses going forward will have the creator tracked
- No RLS changes needed -- the column is informational, visibility is still controlled by existing engagement team / admin policies
- The "My Expenses" toggle gracefully handles NULL values (they won't match, so they'll be hidden when filtering -- which is correct since we can't attribute them)

## Testing

1. Create a new expense -- verify it saves with `created_by_staff_id` populated
2. View expense list -- verify "Logged By" column shows initials for new expenses and "-" for old ones
3. Toggle "My Expenses" on -- verify only expenses created by the current user are shown
4. Toggle off -- verify all team expenses are visible again
5. Edit an existing expense -- verify `created_by_staff_id` is preserved (not overwritten)
6. Check mobile view -- verify initials badge appears on cards

