

# Plan v7 — Button Look & Feel Audit

Identical to Plan v6 with one clarification in Part A based on verified source code.

## Part A correction — verified source

Line 86 of `alert-dialog.tsx` **actually reads**:

```
className={cn(buttonVariants({ variant: "cancel" }), "border border-input mt-2 sm:mt-0 hover:bg-accent hover:text-accent-foreground", className)}
```

- The variant is already `"cancel"` (not `"outline"`)
- There ARE inline `border border-input` and `hover:bg-accent hover:text-accent-foreground` classes
- These inline classes are redundant once the cancel variant is redefined with its own border and hover states, and the `hover:bg-accent` actually conflicts with the new variant's `hover:bg-muted`

The Part A change for this file is therefore exactly as stated in Plans v5/v6:

```
FROM: className={cn(buttonVariants({ variant: "cancel" }), "border border-input mt-2 sm:mt-0 hover:bg-accent hover:text-accent-foreground", className)}
  TO: className={cn(buttonVariants({ variant: "cancel" }), "mt-2 sm:mt-0", className)}
```

## All other parts (A button.tsx, B, C, D, E, F, G, H)

Unchanged from Plan v6. Execute exactly as written.

## Summary

| Part | Change | Files | Instances |
|---|---|---|---|
| A | Redefine cancel variant + clean alert-dialog inline overrides | 2 | 2 |
| B | Cancel: outline → cancel | 16 | 22 |
| C | Save: remove hardcoded bg classes | 5 | 6 |
| D | Delete confirm: fix purple hover | 8 | 8 |
| E | HolidayForm LoadingButton | 1 | 1 |
| F | Responsive sizing added | 6 | ~12 buttons |
| G | Copy to Current Week token | 1 | 1 |
| H | Changelog | 1 | — |
| **Total unique files** | | **22** | |

