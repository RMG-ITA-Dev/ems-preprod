

# Bug #19: Engagement Form Validation & Duplicate Code Prevention

## Problem

The engagement form accepts junk data: single-character names, no code required, no partner/manager required, no date validation, and no duplicate code check. This led to test records polluting master data.

## Fix

### 1. Stricter Zod schema (`src/components/forms/EngagementForm.tsx`)

- `engagement_name`: `.min(5)` + `.max(200)` -- prevents junk like "test" or "a"
- `engagement_code`: required, `.min(1)` + `.max(20)` + regex `/^[A-Za-z0-9._-]+$/` -- alphanumeric with dots/hyphens only
- `partner_id`: required `.min(1)` -- Socio/Director must be assigned
- `manager_id`: required `.min(1)` -- Gerente must be assigned
- `start_date`: required via `z.date({ required_error: ... })`
- `end_date`: required + `.refine()` cross-validation ensuring end >= start

### 2. Duplicate code check in `onSubmit`

Before saving, query `engagements` for matching `engagement_code` (excluding self in edit mode). Block save with error toast if duplicate found.

### 3. DB unique partial index

Add `CREATE UNIQUE INDEX idx_engagements_code_unique ON public.engagements (engagement_code) WHERE engagement_code IS NOT NULL` as a migration.

### 4. UI label updates

Add asterisks (*) to all newly-required field labels: code, partner, manager, start date, end date.

### 5. i18n strings

Add `engagement.duplicateCode` to both locale files.

## Files Modified

| File | Change |
|------|--------|
| `src/components/forms/EngagementForm.tsx` | Stricter schema, duplicate code check in onSubmit, required asterisks on labels, import supabase + toast |
| `src/locales/en.json` | Add `engagement.duplicateCode` |
| `src/locales/es.json` | Add `engagement.duplicateCode` |
| DB migration | Unique partial index on `engagement_code` |

## Notes

- Existing records with missing codes/partners/managers can still be edited (the form will require filling those fields to save, effectively forcing data cleanup on next edit).
- The `hasMissingCategories` guard already prevents creating engagements if Partner/Manager categories don't exist in the system; the new required fields complement this by ensuring they are selected.

