

# Bug #12: Prevent Duplicate Staff Emails and Warn on Linked Account Changes

## What's Already Fixed

- The database **already has a UNIQUE constraint** (`staff_email_key`) on `staff.email` -- no migration needed.
- The corrupted data (susymiranda / vpelaez emails) has been manually corrected.
- The `useStaffMutations.ts` already handles the `23505` unique constraint error (Bug #15 fix).

## What's Still Missing

The DB constraint catches duplicates, but the user gets a generic error. We need:

1. **A friendlier duplicate check** before saving -- so the error message says *who* already has that email
2. **A warning** when editing the email on a staff record that has a linked login account (`auth_user_id`), since changing the staff email does NOT change their login credentials

## Changes

### 1. `src/hooks/useEmsData.ts` -- Expose `auth_user_id` in `StaffFull`

Add `auth_user_id` to the `StaffFull` interface so the form can detect linked accounts. The DB query already returns it (uses `select(*)`), it's just missing from the TypeScript type.

### 2. `src/components/forms/StaffForm.tsx` -- Add pre-save email check and warning

- Import `supabase` client
- In `onSubmit`: before saving, query `staff` table for any other record with the same email. If found, show a toast with the name of the conflicting staff member and stop.
- Below the email field: if editing a staff member who has `auth_user_id` set, show a small warning text explaining that changing the email won't update their login credentials.

### 3. `src/locales/es.json` and `src/locales/en.json` -- Add translation keys

- `staff.emailAlreadyUsed`: "This email is already assigned to {{name}}."
- `staff.emailLinkedWarning`: "This member has a linked login account. Changing the email does not update their login credentials."

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useEmsData.ts` | Add `auth_user_id` to `StaffFull` interface |
| `src/components/forms/StaffForm.tsx` | Pre-save duplicate check + linked account warning |
| `src/locales/es.json` | 2 new translation keys |
| `src/locales/en.json` | 2 new translation keys |

## No database migration needed

The UNIQUE constraint already exists. No schema changes required.
