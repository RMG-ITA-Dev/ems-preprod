

# Plan: Fix "Identifier 'toast' has already been declared" Error

## Root Cause

The file `src/components/ui/sonner.tsx` imports `toast` from the `"sonner"` package and then re-exports it:

```typescript
import { Toaster as Sonner, toast } from "sonner";
// ...
export { Toaster, toast };
```

No file in the project actually imports `toast` from this component -- every file imports `toast` directly from `"sonner"`. However, Vite's bundler can merge this module into the same chunk as other modules that also import `toast` from `"sonner"`, causing two `toast` bindings in the same scope at runtime. This is a known bundler edge case with re-exports.

## Fix

**File: `src/components/ui/sonner.tsx`**

Remove the `toast` import and re-export since nothing uses it from this file:

- Change import from `import { Toaster as Sonner, toast } from "sonner"` to `import { Toaster as Sonner } from "sonner"`
- Change export from `export { Toaster, toast }` to `export { Toaster }`

This is a two-line change. No other files are affected because every consumer already imports `toast` directly from `"sonner"`.

## Files Changed

| File | Action |
|------|--------|
| `src/components/ui/sonner.tsx` | MODIFY -- remove unused `toast` import and re-export |

## Risk

None. The `toast` re-export from this file is unused across the entire codebase (verified via search).
