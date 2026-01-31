

# Plan: Work Order Summary UI Refinements

## Issues to Address

1. **Negative number input in Ajuste** - Cannot type minus sign first, must type number then move cursor back
2. **Monetary sign too close to Ajuste input box** - Need more spacing
3. **Ajuste input not aligned with other numbers** - The input box disrupts vertical alignment
4. **Monetary sign size** - Should match number font size (currently using `text-xs`)
5. **"Sin Guardar" badge color** - Should use purple (same as Guardar button) instead of warning/orange
6. **Gastos numbers** - Missing proper thousand separator (i18n)
7. **Spacing between currency and numbers** - Need more consistent gap throughout
8. **Realization percentage locale** - Spanish uses comma (",") for decimal separator
9. **"+ Agregar Gasto" button** - Should be light teal color

---

## Part 1: Fix Negative Number Input in NumericInput

**File:** `src/components/ui/numeric-input.tsx`

**Current Issue:** When user types "-" first in an empty field, it's allowed at position 0. But the issue is that when the field is empty and user presses "-", it works, but somehow the current implementation isn't working as expected.

Looking at the code:
- Line 106: `if (input.selectionStart === 0) { return; }` - This should allow minus at position 0
- But if cursor is at position 0 in an empty field and user types "-", it should work

**Investigation:** The issue is that the current logic allows minus at position 0, but there's a subtle issue. When the input is empty and you type "-", `input.selectionStart === 0` is true, so it should `return` and allow the minus. 

After reviewing, I see the logic handles:
1. If cursor is at position 0 → allow naturally
2. If cursor is NOT at position 0 → prepend minus via `onValueChange`

The issue might be in how `onValueChange` is being used. Looking at `WorkOrderForm.tsx`, the Ajuste input uses:
```tsx
onChange={(val) => onAdjustmentChange(val)}
```

It uses `onChange` (which provides numeric value) but NOT `onValueChange` (which provides string value). This means when we call `onValueChange?.("-")` to prepend the minus, nothing happens because there's no handler!

**Fix:** The `NumericInput` needs to handle the case where `onValueChange` is not provided. We should update the input's actual value directly when prepending minus.

---

## Part 2: Improve Summary Section Layout & Styling

**File:** `src/components/forms/WorkOrderForm.tsx`

### Change 1: Increase spacing between currency and numbers

**Current:** `mr-1.5` on currency span
**New:** `mr-2` for better visual separation

### Change 2: Make currency text same size as numbers

**Current:** `text-xs text-muted-foreground`
**New:** `text-sm text-muted-foreground` (same as number size)

### Change 3: Align Ajuste input with other values

**Current:** Input box right-aligned but visually misaligned with static values
**New:** Add consistent width and ensure the input aligns with other monetary values using proper layout

### Change 4: Format Gastos total with proper i18n thousand separators

**Current:** Using `formatNumber(totalExpenses)` which should already handle this
**Investigation:** Need to verify the `formatNumber` function handles locale correctly

Looking at line 178-184:
```tsx
const formatNumber = (amount: number) => {
  const rounded = Math.round(amount);
  if (currency === "BOB") {
    return rounded.toLocaleString("es-BO", { maximumFractionDigits: 0 });
  }
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 0 });
};
```

This should already work. The issue might be that the expense amounts themselves don't have thousand separators in the expense lines (lines 397-405).

### Change 5: Format realization percentage with locale-aware decimal

**Current:** `{realizationPercent.toFixed(1)}%`
**New:** Use `toLocaleString()` with appropriate locale for decimal separator

```tsx
// Spanish: 98,5%
// English: 98.5%
{realizationPercent.toLocaleString(currency === "BOB" ? "es-BO" : "en-US", { 
  minimumFractionDigits: 1, 
  maximumFractionDigits: 1 
})}%
```

---

## Part 3: Fix "Sin Guardar" Badge Color

**File:** `src/components/forms/WorkOrderForm.tsx`

**Current (line 218-222):**
```tsx
<Badge variant="outline" className="text-xs px-2.5 py-1 bg-warning/10 text-warning border-warning/20">
  {t("common.unsavedChanges")}
</Badge>
```

**New:** Use purple color (matching the Guardar button which uses `bg-brand-purple`)
```tsx
<Badge variant="outline" className="text-xs px-2.5 py-1 bg-brand-purple/10 text-brand-purple border-brand-purple/20">
  {t("common.unsavedChanges")}
</Badge>
```

---

## Part 4: Style "+ Agregar Gasto" Button with Light Teal

**File:** `src/components/forms/WorkOrderForm.tsx`

**Current (lines 418-422):**
```tsx
<Button variant="outline" onClick={addExpenseBudget} size="sm">
  <Plus className="h-4 w-4 mr-2" />
  {t("workOrders.addExpense")}
</Button>
```

**New:** Add light teal background (same as "Ver Matriz" button)
```tsx
<Button 
  variant="outline" 
  onClick={addExpenseBudget} 
  size="sm"
  className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
>
  <Plus className="h-4 w-4 mr-2" />
  {t("workOrders.addExpense")}
</Button>
```

---

## Implementation Summary

### File 1: `src/components/ui/numeric-input.tsx`

**Fix minus sign input:** Update the logic at lines 110-118 to properly update the input value when `onValueChange` is not provided by setting the value directly on the input element and triggering a proper change event.

```tsx
// If cursor is not at start, prepend minus to value
e.preventDefault();
const newValue = "-" + currentValue;

// Update via callbacks if available
if (onValueChange) {
  onValueChange(newValue);
  const numericValue = parseFloat(normalizeValue(newValue));
  onChange?.(isNaN(numericValue) ? 0 : numericValue);
} else {
  // Fallback: directly update input and trigger change
  input.value = newValue;
  const event = new Event('input', { bubbles: true });
  input.dispatchEvent(event);
}

// Move cursor after the minus sign
setTimeout(() => input.setSelectionRange(1, 1), 0);
```

### File 2: `src/components/forms/WorkOrderForm.tsx`

| Line Range | Change |
|------------|--------|
| 218-222 | Change "Sin Guardar" badge from warning/orange to brand-purple |
| 418-422 | Add light teal styling to "+ Agregar Gasto" button |
| 426-429, 444-448, 483-487, 490-495, 500-504, 509-513 | Change currency `text-xs` to `text-sm` and `mr-1.5` to `mr-2` |
| 451-466 | Improve Ajuste row layout with better alignment and spacing |
| 474-479 | Use locale-aware formatting for realization percentage |

---

## Visual Summary

### Before (Resumen Section)
```
Hon. Std.                    BOB 61.060   (BOB too small, close to number)
Ajuste                   BOB[   999  ]    (input misaligned)
% Realización               16377433.8%   (period used, should be comma in Spanish)
```

### After (Resumen Section)
```
Hon. Std.                  BOB  61.060    (BOB same size, proper spacing)
Ajuste                     BOB  [  -999]  (aligned with values above)
% Realización               16377433,8%   (comma used for Spanish)
```

### Badge Colors

| Before | After |
|--------|-------|
| "Sin guardar" - Orange/Warning | "Sin guardar" - Purple (matches Guardar button) |

### Button Colors

| Button | Before | After |
|--------|--------|-------|
| + Agregar Gasto | Gray outline | Light teal (bg-primary/10) |

---

## Testing Checklist

After implementation:
- [ ] Can type "-500" in Ajuste by pressing minus first, then digits
- [ ] Currency code (BOB/USD) is same font size as numbers
- [ ] There's proper spacing (~2 units) between currency and numbers
- [ ] Ajuste input box aligns vertically with other monetary values
- [ ] "Sin guardar" badge is purple (not orange)
- [ ] Gastos shows proper thousand separators (e.g., "1.234" for Spanish)
- [ ] Realization percentage uses comma for Spanish locale (e.g., "98,5%")
- [ ] "+ Agregar Gasto" button has light teal background

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/ui/numeric-input.tsx` | Fix negative number entry when `onValueChange` is not provided |
| `src/components/forms/WorkOrderForm.tsx` | 1. Purple "Sin guardar" badge. 2. Light teal "Agregar Gasto" button. 3. Larger currency text with more spacing. 4. Better Ajuste alignment. 5. Locale-aware realization % formatting. |

