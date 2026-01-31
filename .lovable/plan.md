

# Plan: Fix Ajuste Input Font Size to Match Other Numbers in Resumen

## Root Cause Analysis

The issue is a **CSS specificity conflict** in the NumericInput component.

### How NumericInput Works

The NumericInput component has **hardcoded base styles** (line 266-268 of `numeric-input.tsx`):

```tsx
className={cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background ... md:text-sm hide-spinners",
  className  // <-- Your custom classes get merged here
)}
```

The base styles include:
- **`text-base`** = 16px font size (mobile)
- **`md:text-sm`** = 14px font size (desktop)

### Why Your Custom Classes Don't Work

When you pass `font-mono` in the Ajuste field's className, the `cn()` utility (Tailwind Merge) merges them:
- ✅ `font-mono` is added correctly
- ❌ `text-base md:text-sm` from base styles **remain** because you didn't explicitly override them

The static `<span className="font-mono">` elements have **no explicit font size** - they inherit from their parent container. But the NumericInput has hardcoded `text-base md:text-sm`.

### The Result

| Element | Font Size | Font Family |
|---------|-----------|-------------|
| Static span (Honorario Standard) | Inherited (larger) | font-mono ✓ |
| NumericInput (Ajuste) | `md:text-sm` = 14px (smaller) | font-mono ✓ |
| Static span (Gastos) | Inherited (larger) | font-mono ✓ |

---

## Solution: Override Font Size with `!important`

Since Tailwind Merge doesn't remove the base `text-base md:text-sm` classes, we need to use Tailwind's `!` modifier to force our font size to take precedence.

### File: `src/components/forms/WorkOrderForm.tsx`

**Change the Ajuste NumericInput className (lines 468-471):**

**Current:**
```tsx
className={cn(
  "w-24 text-right h-8 font-mono border-0 bg-transparent px-0 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0",
  adjustmentAmount < 0 && "text-destructive"
)}
```

**New:**
```tsx
className={cn(
  "w-24 text-right h-8 font-mono border-0 bg-transparent px-0 !text-[length:inherit] focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0",
  adjustmentAmount < 0 && "text-destructive"
)}
```

The key addition is **`!text-[length:inherit]`**:
- `!` = Important modifier (overrides specificity)
- `text-[length:inherit]` = Sets `font-size: inherit` to match parent/sibling elements

---

## Alternative Solution (Cleaner Long-Term)

If `!text-[length:inherit]` doesn't work as expected, we can wrap the input value in a visually-hidden input approach, or modify the NumericInput component itself to accept a `variant="inline"` prop that removes the default sizing.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/forms/WorkOrderForm.tsx` | Add `!text-[length:inherit]` to Ajuste NumericInput className |

---

## Testing Checklist

After implementation:
- [ ] Ajuste number "-12345" is the same size as "61.060", "48.715", "234"
- [ ] All numbers use the same font family (IBM Plex Sans with tabular figures)
- [ ] Negative Ajuste still displays in red
- [ ] Focus ring is still thin and light grey

