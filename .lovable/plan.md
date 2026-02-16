

# Show "Logged By" in Expense Edit View

## Problem

The expense edit form does not display who logged the expense. The `created_by_staff` data is already fetched by `useExpenseLogById` but is not passed to or displayed in the form.

## Solution

Add a read-only "Logged By" info line at the top of the form when editing an existing expense. This will show the staff member's name (or initials) who created the expense.

---

## Changes

### 1. `src/components/forms/ExpenseLogForm.tsx`

- Expand the `ExpenseLogFormData` interface (line 30) to include an optional `created_by_staff` object with `first_name`, `last_name`, `initials`.
- Add a read-only display row at the top of the form (before the grid, around line 216) that shows "Logged By: [Name]" when `initialData?.created_by_staff` is present. Styled as a subtle info line with muted text -- not an editable field.

### 2. `src/pages/ExpenseEdit.tsx`

- The `useExpenseLogById` query already fetches `created_by_staff`. No changes needed here since `expenseLog` is passed directly as `initialData` and already contains the nested relation.

### 3. Localization

- The key `expenses.loggedBy` ("Logged By" / "Registrado Por") was already added in the previous implementation. No new keys needed.

---

## Files Summary

| # | File | Action |
|---|------|--------|
| 1 | `src/components/forms/ExpenseLogForm.tsx` | Add `created_by_staff` to interface + read-only display |

