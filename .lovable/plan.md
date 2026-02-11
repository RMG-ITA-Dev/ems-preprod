

# Bug #9 Fix + Email Verification Feature

This plan covers two changes: (1) making staff form fields required (Bug #9), and (2) adding **email verification** (also called "email confirmation") to the signup flow.

---

## Part 1: Bug #9 — Required Fields in Staff Form

Single file: `src/components/forms/StaffForm.tsx`

### 1a. Zod schema (lines 47-50)

Change four fields from optional to required:

| Field | Current | New |
|-------|---------|-----|
| email | `.email().optional().or(z.literal(""))` | `.min(1, "Email is required").email("Invalid email")` |
| category_id | `.string().optional()` | `.string().min(1, "Category is required")` |
| city | `.string().optional()` | `.string().min(1, "City is required")` |
| id_number | `.string().optional()` | `.string().min(1, "ID number is required")` |

### 1b. Payload cleanup (lines ~170-180)

Remove `|| undefined` fallbacks for these four fields since they are now guaranteed non-empty.

### 1c. Label asterisks in JSX

Add ` *` to the `FormLabel` for email, city, id_number, and category_id fields.

---

## Part 2: Email Verification on Signup

This is the feature where after signing up, the user receives an email with a confirmation link. They must click it before they can sign in. Currently, auto-confirm is enabled and users are logged in immediately after signup.

### 2a. Disable auto-confirm

Use the configure-auth tool to disable auto-confirm for email signups. This makes the backend send a confirmation email automatically on signup.

### 2b. Update `signUp` in `useAuth.tsx` (line 96-118)

After disabling auto-confirm, `supabase.auth.signUp()` will return `data.user` but `data.session` will be `null` (user is not signed in until they confirm). The function needs to handle this:

- When `data.session` is `null` and `data.user` exists with `identities` array non-empty, it means signup succeeded and confirmation email was sent.
- Return a new flag like `{ error: null, emailConfirmationRequired: true }` so the Auth page can show the right message.
- Role assignment moves to sign-in (it already runs there on line 90), so removing it from signup is safe.

### 2c. Update `Auth.tsx` signup handler (lines 60-81)

Instead of navigating to `/` after signup, show a success screen/message telling the user to check their email inbox. The flow becomes:

- On successful signup: show a confirmation panel (replaces the form) with a mail icon, message like "Check your email", and a "Back to Sign In" button.
- No navigation to `/` -- the user is not authenticated yet.
- Add a state variable `emailSent: boolean` to toggle between the form and the confirmation message.

### 2d. Update `AuthContextType` interface

Add `emailConfirmationRequired` to the `signUp` return type:

```typescript
signUp: (...) => Promise<{
  error: Error | null;
  roleData?: RoleAssignmentResult;
  emailConfirmationRequired?: boolean;
}>;
```

### 2e. Add translations (en.json + es.json)

New keys under `auth`:
- `checkYourEmail`: "Check your email" / "Revisa tu correo electrónico"
- `confirmationSent`: "We've sent a confirmation link to {email}. Please open your email and click the link to activate your account." / "Hemos enviado un enlace de confirmación a {email}. Por favor abre tu correo y haz clic en el enlace para activar tu cuenta."
- `backToSignIn`: "Back to Sign In" / "Volver a Iniciar Sesión"

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/forms/StaffForm.tsx` | Zod validation, payload cleanup, label asterisks |
| `src/hooks/useAuth.tsx` | Handle null session on signup, return emailConfirmationRequired flag |
| `src/pages/Auth.tsx` | Show "check your email" screen after signup instead of navigating |
| `src/locales/en.json` | 3 new translation keys |
| `src/locales/es.json` | 3 new translation keys |
| Auth config | Disable auto-confirm via configure-auth tool |

## What Does NOT Change

- Sign-in flow (unchanged -- role assignment already happens on sign-in)
- Password reset flow
- First-user admin logic (moves entirely to sign-in, where it already runs)
- No database migrations

