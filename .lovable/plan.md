

# Plan — Move Cancel Button to Leftmost Position

## Problem
The Cancel button currently sits between "Delete All" and "Copy Previous Week". It should always be the first (leftmost) button in the footer bar.

## Fix

### File: `src/pages/TimeSheet.tsx` (lines 660–676)

Reorder the buttons so Cancel comes first, before Delete All:

```
1. Cancel (always visible)
2. Delete All (conditional)
3. Copy Previous Week (conditional)
4. Unsubmit (conditional)
5. Save Draft (conditional)
6. Submit / Resubmit (conditional)
```

Move lines 673–676 (the Cancel button) to before lines 660–671 (Delete All). No other changes needed.

