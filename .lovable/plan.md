

# Bug #18: Duplicate Client Detection (Name + NIT)

## Current State

- The DB already has `UNIQUE` on `clients.unique_tax_id` (initial migration). No DB migration needed.
- `useClientMutations.ts` already catches the `23505` error for duplicate NIT and shows `errors.duplicateNit`. This works as a last-resort safety net.
- What is missing: **no frontend pre-save check** for duplicate NIT (friendlier UX) and **no duplicate name detection** at all. The reported "PETROBRAS" duplicates all have different NITs, so the DB constraint allowed them.

## Fix

One file changed + locale updates:

### 1. `src/components/forms/ClientForm.tsx` -- `onSubmit`

Before saving, run two checks against the database:

1. **Duplicate NIT check**: Query `clients` for matching `unique_tax_id` (excluding self in edit mode). If found, show error toast with the existing client's name and block save.
2. **Duplicate name check** (case-insensitive): Query `clients` using `.ilike()` for matching `client_legal_name` (excluding self). If found, show a warning toast with the existing client's NIT and block save.

Both checks run before the mutation, giving immediate feedback without waiting for a DB constraint error.

### 2. Locale files

Update the existing `errors.duplicateNit` message and add a new `errors.duplicateClientName` key:

| Key | es | en |
|-----|----|----|
| `errors.duplicateNit` | `Ya existe un cliente con NIT {{nit}}: {{name}}` | `A client with NIT {{nit}} already exists: {{name}}` |
| `errors.duplicateClientName` | `Ya existe un cliente con este nombre (NIT: {{nit}}). Verifique que no sea un duplicado.` | `A client with this name already exists (NIT: {{nit}}). Please verify it is not a duplicate.` |

## Files Modified

| File | Change |
|------|--------|
| `src/components/forms/ClientForm.tsx` | Add duplicate NIT and name checks in `onSubmit` before calling mutation |
| `src/locales/en.json` | Update `errors.duplicateNit`, add `errors.duplicateClientName` |
| `src/locales/es.json` | Update `errors.duplicateNit`, add `errors.duplicateClientName` |

## No DB migration needed

The UNIQUE constraint on `unique_tax_id` already exists. No schema changes required.

