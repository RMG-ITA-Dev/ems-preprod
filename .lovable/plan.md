

# Bug #11: Add Show/Hide Password Toggle on Auth Page

## Summary

Add an eye icon button inside the password field on the login and signup forms so users can toggle password visibility before submitting.

## Changes

### 1. `src/pages/Auth.tsx`

- Add `Eye` and `EyeOff` to the lucide-react imports (line 11)
- Add `showPassword` state: `const [showPassword, setShowPassword] = useState(false)`
- Wrap the password `<Input>` in a `<div className="relative">` and add a toggle button with the eye icon
- Toggle `type` between `"password"` and `"text"` based on state
- Reset `showPassword` to `false` when switching between sign-in and sign-up modes

### 2. `src/locales/es.json` and `src/locales/en.json`

Add two translation keys under `auth`:
- `"showPassword"` / `"hidePassword"` for the button's `aria-label` (accessibility)

## Files Modified

| File | Change |
|------|--------|
| `src/pages/Auth.tsx` | Import icons, add state, wrap password field with toggle button |
| `src/locales/es.json` | Add `showPassword` and `hidePassword` keys |
| `src/locales/en.json` | Add `showPassword` and `hidePassword` keys |

## No other files affected

No database, hook, or component changes needed -- this is purely a UI enhancement on the Auth page.

