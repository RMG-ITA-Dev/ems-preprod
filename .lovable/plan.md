

# Plan_0213-28_C04_v5: No Staff Record = No Access + Bootstrap Screen + Default Inactive + Auto-Activate on Link

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-28 |
| Title | Log in de usuario con solo registro |
| Priority | Baja |
| Route | ADMINISTRACION - Personal |

## Changes from v4 (Mandatory Corrections Applied)

| Correction | What changed in v5 |
|------------|-------------------|
| MC #1 -- No signOut() during render | `ProtectedRoute` now computes `shouldSignOut` + target route as derived state, then calls `signOut()` inside a `useEffect` with a ref guard. Render path only returns `<Navigate>` or children -- no side effects. |
| MC #2 -- Soft-delete guard in `link_staff_to_auth_user` | Added early return `IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;` at the top. Added `AND deleted_at IS NULL` inside the `NOT EXISTS` duplicate check. Both link functions now consistently guard against soft-deleted records. |
| Optional (A) -- `user_roles` uniqueness | Confirmed: `user_roles_user_id_role_key` unique constraint on `(user_id, role)` exists. `.maybeSingle()` is safe. |
| Optional (B) -- BootstrapRoute loading | `BootstrapRoute` waits for `roleLoading` and `staffLoading` before enforcing any redirect, same pattern as `ProtectedRoute`. |

## Solution (5 Layers)

### Layer 1: ProtectedRoute -- No side effects during render (MC #1)

**`src/components/ProtectedRoute.tsx`** -- Complete rewrite of gating logic:

```text
ProtectedRoute logic:
  1. Import useUserRole (adds isAdmin, isLoading: roleLoading)
  2. Wait for ALL loading states: loading || (user && (staffLoading || roleLoading))
  3. Compute derived state (no side effects):
     - shouldSignOut = false, redirectTo = null
     - if (!user) -> redirectTo = "/auth"
     - else if (!staffRecord && isAdmin) -> redirectTo = "/bootstrap"
     - else if (!staffRecord && !isAdmin) -> shouldSignOut = true, redirectTo = "/auth"
     - else if (staffRecord.is_active === false) -> shouldSignOut = true, redirectTo = "/auth"
  4. useEffect: if shouldSignOut and not already done (ref guard) -> call signOut()
  5. Render: if redirectTo -> <Navigate to={redirectTo} replace />
            else -> children
```

Key points:
- `signOut()` is **never** called during render -- only inside `useEffect`
- A `hasSignedOut` ref prevents double-calls across StrictMode re-renders
- The `useEffect` dependency is `[shouldSignOut, signOut]`

### Layer 2: Block at login (belt + suspenders)

**`src/hooks/useAuth.tsx`** (signIn method, after existing `is_active` check around line 82):

```text
Current code checks: staffCheck && staffCheck.is_active === false -> sign out, return ACCOUNT_INACTIVE

New code adds (after the is_active check):
  if (!staffCheck):
    Query user_roles for specific admin role:
      .from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle()
    If no admin role found:
      sign out, return Error('NO_STAFF_RECORD')
    If admin: allow login (ProtectedRoute will redirect to /bootstrap)
```

### Layer 3: Auth page error handling

**`src/pages/Auth.tsx`** (line 86-91, inside the signIn error handling):

Add a new `else if` branch using strict equality:

```typescript
} else if (error.message === 'NO_STAFF_RECORD') {
  toast.error(t('messages.noStaffRecord'));
}
```

### Layer 4: Staff creation defaults + helper text

**`src/components/forms/StaffForm.tsx`**:

- Line 136: `is_active: true` changes to `is_active: false`
- Lines 461-463: Conditional description based on `isEdit` (which is `!!staff`, already defined at line 117):

```typescript
<FormDescription>
  {isEdit ? t("staff.activeDescription") : t("staff.activeDescriptionNew")}
</FormDescription>
```

### Layer 5: Database migration -- Auto-activate on link + email normalization + soft-delete guards

Single migration file with two `CREATE OR REPLACE FUNCTION` statements:

**`link_staff_to_auth_user()`** (BEFORE INSERT OR UPDATE ON staff, returns NEW):

```sql
CREATE OR REPLACE FUNCTION public.link_staff_to_auth_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Guard: skip soft-deleted staff records
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NOT NULL AND NEW.auth_user_id IS NULL THEN
    SELECT id INTO v_auth_user_id
    FROM auth.users
    WHERE lower(trim(email)) = lower(trim(NEW.email))
    LIMIT 1;

    IF v_auth_user_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.staff
        WHERE auth_user_id = v_auth_user_id
          AND staff_id != NEW.staff_id
          AND deleted_at IS NULL
      ) THEN
        NEW.auth_user_id := v_auth_user_id;
        NEW.is_active := true;  -- Auto-activate on link
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
```

**`link_auth_user_to_staff()`** (AFTER INSERT ON auth.users, uses UPDATE):

```sql
CREATE OR REPLACE FUNCTION public.link_auth_user_to_staff()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.staff
  SET auth_user_id = NEW.id,
      is_active = true,
      updated_at = now()
  WHERE lower(trim(email)) = lower(trim(NEW.email))
    AND auth_user_id IS NULL
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$function$;
```

### Layer 6: Bootstrap page + route

**New file: `src/pages/Bootstrap.tsx`**

A minimal page accessible only to admins without a staff record:
- Uses `useAuth()` to get the admin's email for pre-filling the StaffForm
- Renders a card with `bootstrap.title` heading and `bootstrap.description` text
- Embeds `StaffForm` in create mode with email pre-filled
- On successful save: `toast.success(t('bootstrap.complete'))` then `navigate('/')`

**New file: `src/components/BootstrapRoute.tsx`**

Guard component that waits for loading before enforcing (Optional B):
- Uses `useAuth`, `useCurrentStaff`, `useUserRole`
- While any of `loading`, `staffLoading`, `roleLoading` is true: show loading spinner
- If `!user`: redirect to `/auth`
- If `!isAdmin`: redirect to `/`
- If `staffRecord` exists: redirect to `/` (already bootstrapped)
- Otherwise: render children

**`src/App.tsx`** -- Add lazy import + route:

```typescript
const Bootstrap = lazy(() => import("./pages/Bootstrap"));
```

Add to router children (before the catch-all):

```typescript
{ path: "/bootstrap", element: <BootstrapRoute><Bootstrap /></BootstrapRoute> }
```

## i18n Keys

| Key | English | Spanish |
|-----|---------|---------|
| `messages.noStaffRecord` | No staff profile is linked to your account. Please contact an administrator. | No hay un perfil de personal vinculado a su cuenta. Contacte al administrador. |
| `staff.activeDescriptionNew` | New staff will be automatically activated when they complete account registration. | El nuevo personal se activara automaticamente cuando complete su registro de cuenta. |
| `bootstrap.title` | Complete Your Setup | Complete su Configuracion |
| `bootstrap.description` | As the first administrator, create your staff profile to continue. | Como primer administrador, cree su perfil de personal para continuar. |
| `bootstrap.complete` | Setup complete! Welcome to EMS. | Configuracion completa! Bienvenido a EMS. |

## Access Flow After Fix

```text
User signs up + verifies email
  |
  v
assign_user_role_atomic() gives them 'staff' role
link_auth_user_to_staff() trigger:
  if matching staff row exists (admin pre-created)
    AND deleted_at IS NULL
  --> sets auth_user_id + is_active = true (auto-activate)
  |
  v
User tries to log in
  |
  v
signIn() checks:
  1. Auth credentials valid?      --> No  --> "Invalid credentials"
  2. Staff.is_active = false?     --> Yes --> "Account inactive"
  3. No staff record at all?      --> Is admin? --> Yes --> allow (bootstrap)
                                              --> No  --> "No staff profile linked"
  4. All OK --> allow login
  |
  v
ProtectedRoute (waits for staffLoading + roleLoading):
  Computes shouldSignOut + redirectTo (NO side effects in render)
  useEffect: if shouldSignOut -> signOut() once (ref guard)
  Render:
    redirectTo="/bootstrap" if !staffRecord + isAdmin
    redirectTo="/auth"      if !staffRecord + !isAdmin (or inactive)
    children                if all OK

Admin bootstrap:
  First user signs up --> gets 'admin' role
  Logs in --> passes signIn (admin exception)
  ProtectedRoute --> no staff record + isAdmin --> /bootstrap
  Bootstrap page --> create staff profile (email pre-filled)
  link trigger fires --> auth_user_id set + is_active = true
  Toast: "Setup complete!" --> redirect to /

Normal staff onboarding:
  Admin creates staff in Personal (is_active defaults to false)
  Staff person registers + verifies email
  link_auth_user_to_staff trigger --> sets auth_user_id + is_active = true
  Staff logs in --> all gates pass --> app access
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/` (new) | CREATE | Update `link_staff_to_auth_user()` and `link_auth_user_to_staff()` with auto-activate, email normalization (`lower(trim())`), soft-delete guards (`deleted_at IS NULL`) |
| `src/components/ProtectedRoute.tsx` | MODIFY | Add `useUserRole`, wait for `roleLoading`, compute `shouldSignOut`/`redirectTo` as derived state, call `signOut()` in `useEffect` with ref guard -- no side effects during render |
| `src/components/BootstrapRoute.tsx` | CREATE | Guard: waits for loading, then only admin + no staff record can access `/bootstrap` |
| `src/pages/Bootstrap.tsx` | CREATE | Admin self-profile creation page with pre-filled email, toast + redirect on success |
| `src/hooks/useAuth.tsx` | MODIFY | Add `NO_STAFF_RECORD` check in `signIn` with admin-specific role query using `.eq("role", "admin")` |
| `src/pages/Auth.tsx` | MODIFY | Handle `NO_STAFF_RECORD` error with exact `===` match |
| `src/components/forms/StaffForm.tsx` | MODIFY | Default `is_active: false`; conditional helper text based on `isEdit` |
| `src/locales/en.json` | MODIFY | Add 5 i18n keys |
| `src/locales/es.json` | MODIFY | Add 5 i18n keys |
| `src/App.tsx` | MODIFY | Add lazy import for Bootstrap, add `/bootstrap` route with `BootstrapRoute` guard |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append C04_v5 entry |

## Correction Coverage

| Correction | Status | Implementation |
|------------|--------|----------------|
| MC #1 -- No signOut() during render | Fixed | Derived `shouldSignOut` boolean + `useEffect` with `hasSignedOut` ref; render path only returns JSX |
| MC #2 -- Soft-delete guard in `link_staff_to_auth_user` | Fixed | Early return for `NEW.deleted_at IS NOT NULL`; `AND deleted_at IS NULL` in `NOT EXISTS` sub-query |
| Optional A -- `user_roles` uniqueness for `.maybeSingle()` | Confirmed | `user_roles_user_id_role_key` unique constraint on `(user_id, role)` exists in DB |
| Optional B -- BootstrapRoute loading | Applied | `BootstrapRoute` waits for `loading`, `staffLoading`, `roleLoading` before enforcing redirects |

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Admin bootstrap locked out | Explicit admin exception in both `signIn` and `ProtectedRoute`; dedicated `/bootstrap` page |
| React StrictMode double-effects | `hasSignedOut` ref ensures `signOut()` is called exactly once |
| App crashes if admin reaches main app without staff record | `ProtectedRoute` redirects to `/bootstrap` before rendering children; admin never reaches main app without staff record |
| Soft-deleted staff accidentally re-linked | Both triggers guard with `deleted_at IS NULL`; `link_staff_to_auth_user` also exits early if `NEW.deleted_at IS NOT NULL` |
| Email case/whitespace mismatch prevents linking | `lower(trim())` normalization on both sides of comparison in both triggers |
| Auto-activate changes `is_active` semantics | `is_active` now means "has completed registration"; aligns with SUGERENCIA intent |
| Race condition: role not yet assigned when signIn checks | `signIn` calls `assignUserRole()` before the staff/role check |
| Edit form affected by `is_active` default change | No -- edit form loads actual DB values via `useEffect` reset (line 140) |

