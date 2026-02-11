

# Bug #13: Auto-Link Staff Records by Email (Self-Healing)

## Problem

When a staff record is created **after** a user signs up, the `link_auth_user_to_staff()` trigger (which fires on auth signup) has already missed. The staff record's `auth_user_id` is never set, and the user sees "Su cuenta no esta vinculada a un registro de personal" with no way to fix it.

## Solution: Three layers of defense

### 1. Database Trigger (reverse direction) -- New Migration

Create a new trigger on the `staff` table that fires on INSERT or UPDATE of email. If the staff record has no `auth_user_id` and its email matches an existing auth user (who isn't already linked to another staff record), it auto-links them.

This is the **primary fix** -- it prevents the problem from occurring in the future.

### 2. Self-Healing Fallback in `useCurrentStaff.ts`

If the primary lookup by `auth_user_id` returns null, attempt a fallback:
- Look up `staff` by `email` (matching the logged-in user's email) where `auth_user_id IS NULL`
- If found, update the staff record to set `auth_user_id` to the current user
- Return the now-linked staff record

This heals **existing** broken links (like cinthyahuanca) on next login -- no manual DB intervention needed.

### 3. Better Error Message in TimeSheet, TrackerList, TrackerRecord

If the fallback still fails (no email match at all), show the user's login email so they or an admin can verify the staff record exists with the correct email.

## Files Modified

| File | Change |
|------|--------|
| New migration | `link_staff_to_auth_user()` function + trigger on `staff` table |
| `src/hooks/useCurrentStaff.ts` | Add email-based fallback with auto-link |
| `src/pages/TimeSheet.tsx` | Show user email in error message |
| `src/pages/TrackerList.tsx` | Show user email in error message |
| `src/pages/TrackerRecord.tsx` | Show user email in error message |
| `src/locales/es.json` | Add `noStaffRecordHelp` translation |
| `src/locales/en.json` | Add `noStaffRecordHelp` translation |

## Technical Details

**Database trigger** (`link_staff_to_auth_user`):
- Fires BEFORE INSERT OR UPDATE OF email on `public.staff`
- Only acts when `NEW.email IS NOT NULL AND NEW.auth_user_id IS NULL`
- Looks up `auth.users` by email match
- Checks no other staff record is already linked to that auth user (prevents double-linking)
- Uses SECURITY DEFINER to access `auth.users`

**Frontend fallback** (in `useCurrentStaff` queryFn):
- Only runs when the primary `auth_user_id` lookup returns null
- Uses `user.email` from the auth session
- Guards with `.is('auth_user_id', null)` to never overwrite existing links
- On successful link, returns the staff record immediately

**Error message improvement**:
- Adds a second line: "Your login email is {{email}}. Verify that a staff record exists with this email, or contact an administrator."
- Applied consistently to TimeSheet, TrackerList, and TrackerRecord pages

