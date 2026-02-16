

# Fix: "My Expenses" Toggle Shows Empty — Backfill `created_by_staff_id`

## Problem

The toggle works correctly in code, but all 41 existing expense records have `created_by_staff_id = NULL`. The filter finds zero matches because no expense is attributed to any staff member yet.

## Solution

Run a database migration to backfill existing expenses. Since there is no audit trail of who created each expense, we have two options:

**Option A (Recommended):** Backfill based on the engagement's manager. Since managers typically log expenses for their engagements, we attribute each expense to the engagement's `manager_id`. Expenses with no linked engagement or no manager stay NULL.

**Option B:** Leave existing data as-is and only track going forward. Add a visual indicator ("-" or "N/A") for un-attributed expenses so the toggle behavior is understood.

We will implement **Option A** with a single migration.

---

## Changes

### 1. Database Migration — Backfill `created_by_staff_id`

```sql
-- Backfill created_by_staff_id from engagement manager
UPDATE public.expense_logs el
SET created_by_staff_id = e.manager_id
FROM public.engagements e
WHERE el.engagement_id = e.engagement_id
  AND el.created_by_staff_id IS NULL
  AND e.manager_id IS NOT NULL;
```

This attributes existing expenses to their engagement's manager. Rows where the engagement has no manager remain NULL (shown as "-" in the UI).

---

## Files Summary

| # | File | Action |
|---|------|--------|
| 1 | Database migration | `UPDATE` to backfill from engagement manager |

No code changes needed — the toggle, filter logic, and "Logged By" column already work correctly.

## Risk Assessment

- **Low risk** — only fills NULL values, does not overwrite any existing data
- Expenses where the engagement has no manager stay NULL (safe)
- If the attribution is wrong for some rows, users can note it and it will self-correct as new expenses are created with accurate `created_by_staff_id`

## Testing

1. After migration, toggle "My Expenses" ON — verify expenses for engagements you manage appear
2. Toggle OFF — verify all team expenses are visible
3. Check "Logged By" column — verify initials now appear for backfilled rows
4. Create a new expense — verify it shows your initials correctly

