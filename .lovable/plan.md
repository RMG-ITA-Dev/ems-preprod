

# Bug #1 Fix: Inactive Staff Can Still Log In

## Problem

A staff member created with `is_active = false` can still log in. The auth flow only validates email + password against the authentication system and never checks the `staff.is_active` flag.

## Fix Strategy: Two-Layer Defense

### Layer 1 — Block at Login (`useAuth.tsx`)

After successful `signInWithPassword`, query the staff table. If a linked staff record exists with `is_active === false`, immediately sign the user out and return an error.

**File: `src/hooks/useAuth.tsx`** (lines 76-79)

Current:
```tsx
if (!error && data.session) {
  await assignUserRole(data.session);
}
```

New:
```tsx
if (!error && data.session) {
  // Check if linked staff record is inactive
  const { data: staffCheck } = await supabase
    .from('staff')
    .select('is_active')
    .eq('auth_user_id', data.user.id)
    .maybeSingle();

  if (staffCheck && staffCheck.is_active === false) {
    await supabase.auth.signOut();
    return { error: new Error('ACCOUNT_INACTIVE') };
  }

  await assignUserRole(data.session);
}
```

Note: If no staff record exists (e.g., admin-only user), login proceeds normally.

---

### Layer 2 — Block Existing Sessions (`ProtectedRoute.tsx`)

If a user is already logged in and an admin deactivates their staff record, the next page load should force sign-out. Uses the existing `useCurrentStaff` hook which already fetches `is_active`.

**File: `src/components/ProtectedRoute.tsx`**

```tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }) {
  const { user, loading, signOut } = useAuth();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();

  if (loading || (user && staffLoading)) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (staffRecord && staffRecord.is_active === false) {
    signOut();
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
```

Note: `staffLoading` is only waited on when `user` exists, to avoid blocking the redirect for unauthenticated users.

---

### Layer 3 — User-Friendly Error Message (`Auth.tsx`)

**File: `src/pages/Auth.tsx`** (lines 84-89)

Add handling for the `ACCOUNT_INACTIVE` error before the existing credential check:

```tsx
if (error.message.includes('ACCOUNT_INACTIVE')) {
  toast.error(t('messages.accountInactive'));
} else if (error.message.includes("Invalid login credentials")) {
  toast.error(t("messages.invalidCredentials"));
} else {
  toast.error(error.message);
}
```

---

### Layer 4 — Translation Keys

**File: `src/locales/es.json`** — add to `messages` section:
```json
"accountInactive": "Su cuenta está inactiva. Contacte al administrador."
```

**File: `src/locales/en.json`** — add to `messages` section:
```json
"accountInactive": "Your account is inactive. Please contact an administrator."
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/hooks/useAuth.tsx` | Add `is_active` check after successful sign-in; sign out if inactive |
| `src/components/ProtectedRoute.tsx` | Add `useCurrentStaff` check; force sign-out if staff is inactive |
| `src/pages/Auth.tsx` | Handle `ACCOUNT_INACTIVE` error with friendly toast |
| `src/locales/es.json` | Add `accountInactive` translation |
| `src/locales/en.json` | Add `accountInactive` translation |

## Testing Checklist

- [ ] Inactive staff member cannot log in; sees "Su cuenta esta inactiva" message
- [ ] Active staff member logs in normally
- [ ] Admin-only user (no staff record) logs in normally
- [ ] Already-logged-in user gets kicked out after admin deactivates their staff record
- [ ] Sign-up flow is unaffected

