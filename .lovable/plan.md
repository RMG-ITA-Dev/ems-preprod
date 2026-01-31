
# Plan: Fix Resumen Section Number Sizes and Ajuste Focus Border

## Issues to Address

1. **Ajuste input focus border too thick and wrong color** - Currently shows thick teal ring on focus, should be light grey and thinner
2. **Number size inconsistency** - Honorario Standard, Ajuste, and Honorario Ajustado use `text-sm` but Gastos uses default size (larger). Need to make all numbers match Gastos (remove `text-sm`).

---

## Current State Analysis

Looking at the current code (lines 453-509):

| Row | Current Number Styling | Issue |
|-----|------------------------|-------|
| Honorario Standard | `text-sm font-mono` | Too small - should match Gastos |
| Ajuste | `text-sm font-mono` | Too small - should match Gastos |
| Honorario Ajustado | `text-sm font-mono` | Too small - should match Gastos |
| **Gastos** | `font-mono` (no text-sm) | **Correct - this is the target size** |
| IVA | `font-mono` | Correct |
| Honorario c/IVA | `font-mono font-bold` | Correct |

---

## Technical Changes

### File: `src/components/forms/WorkOrderForm.tsx`

#### Change 1: Fix Ajuste input focus styling (lines 468-471)

**Current:**
```tsx
className={cn(
  "w-24 text-right h-8 text-sm font-mono border-0 bg-transparent px-0",
  adjustmentAmount < 0 && "text-destructive"
)}
```

**New:**
```tsx
className={cn(
  "w-24 text-right h-8 font-mono border-0 bg-transparent px-0 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0",
  adjustmentAmount < 0 && "text-destructive"
)}
```

Changes:
- Remove `text-sm` to match Gastos size
- Add `focus-visible:ring-1` for thinner ring (was ring-2 from NumericInput defaults)
- Add `focus-visible:ring-border` for light grey color instead of teal
- Add `focus-visible:ring-offset-0` to remove the offset

#### Change 2: Remove text-sm from Honorario Standard (line 453)

**Current:**
```tsx
<span className="text-sm font-mono">
```

**New:**
```tsx
<span className="font-mono">
```

#### Change 3: Remove text-sm from currency in Ajuste row (line 462)

**Current:**
```tsx
<span className="text-sm text-muted-foreground mr-2">{currency}</span>
```

**New:**
```tsx
<span className="text-muted-foreground mr-2">{currency}</span>
```

#### Change 4: Remove text-sm from Honorario Ajustado (line 498)

**Current:**
```tsx
<span className="text-sm font-mono">
```

**New:**
```tsx
<span className="font-mono">
```

---

## Visual Summary

### Before
```
Honorario Standard    BOB  61.060   ← text-sm (smaller)
Ajuste               BOB  -12345   ← text-sm (smaller), thick teal ring
Honorario Ajustado   BOB  48.715   ← text-sm (smaller)
Gastos               BOB     234   ← default size (CORRECT)
```

### After
```
Honorario Standard    BOB  61.060   ← default size (matches Gastos)
Ajuste               BOB  -12345   ← default size, thin grey ring
Honorario Ajustado   BOB  48.715   ← default size (matches Gastos)
Gastos               BOB     234   ← default size
```

---

## Lines to Modify

| Line | Change |
|------|--------|
| 453 | Remove `text-sm` from span class |
| 462 | Remove `text-sm` from currency span class |
| 468-471 | Remove `text-sm`, add thin grey focus ring classes |
| 498 | Remove `text-sm` from span class |

---

## Testing Checklist

After implementation:
- [ ] All numbers in Resumen section are the same size as Gastos
- [ ] Ajuste input shows thin light grey ring on focus (not thick teal)
- [ ] Negative Ajuste still displays in red
- [ ] Currency codes (BOB/USD) are the same size as the numbers
