

# Plan — Fix Cancel Button Navigation

## Problem
The "Cancelar" button uses `navigate(-1)` which doesn't reliably navigate away — especially when the user landed directly on `/timesheet` or the history stack loops back to the same page.

## Fix

**File: `src/pages/TimeSheet.tsx` (line 40-46)**

Replace the `handleBack` function to always navigate to the home route:

```tsx
const handleBack = () => {
  navigate("/");
};
```

This ensures a deterministic, always-working navigation regardless of browser history state. The same `handleBack` is used by both the Cancel button and the BackButton component rendered in loading/error states.

One-line change, one file.

