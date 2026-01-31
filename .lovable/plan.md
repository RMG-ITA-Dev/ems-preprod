

# Plan: Work Order UI/UX Refinements

## Issues to Address

1. **Currency/Season display looks ugly** - "Moneda BOB Temporada Alta" needs better visual grouping
2. **Badges size mismatch** - "Borrador" and "Sin guardar" badges have inconsistent sizes
3. **Resync and View Matrix buttons need color** - Add light blue and teal backgrounds
4. **Negative number entry in Ajuste** - NumericInput doesn't allow typing minus sign first
5. **Ajuste font size too small** - Should match "Honorario Standard" row size
6. **Currency sign position** - Place currency code to the LEFT of numbers so values align on right
7. **Negative adjustment in red** - Show negative Ajuste values in red text
8. **No abbreviations in Resumen** - Use "% Realizacion" instead of "Real. %", except on mobile
9. **Realization color coding** - Green if >= 75%, red if < 75%

---

## Implementation Details

### File 1: `src/components/forms/WorkOrderForm.tsx`

#### Change 1: Improve Currency/Season visual grouping (lines 224-261)

**Current**: Labels and values scattered without clear visual separation
**New**: Group with subtle background chips for better visual hierarchy

```tsx
// Before
<div className="flex items-center gap-2">
  <Label className="text-sm">{t("workOrders.currency")}</Label>
  <span className="text-sm font-medium px-2">{currency}</span>
</div>

// After - Read-only mode with styled chip
<div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2 py-1">
  <span className="text-xs text-muted-foreground">{t("workOrders.currency")}:</span>
  <span className="text-sm font-semibold">{currency}</span>
</div>
```

Apply same pattern to Season. This creates compact "Moneda: BOB" and "Temporada: Alta" chips.

#### Change 2: Standardize badge sizes (lines 213-222)

**Current**: Status badge uses `text-sm px-3 py-1`, dirty badge uses `text-xs px-2 py-0.5`
**New**: Both badges use consistent `text-xs px-2.5 py-1` sizing

```tsx
// Status badge
<Badge variant="outline" className={cn("text-xs px-2.5 py-1", statusColors[approvalStatus])}>

// Dirty badge  
<Badge variant="outline" className="text-xs px-2.5 py-1 bg-warning/10 text-warning border-warning/20">
```

#### Change 3: Update formatCurrencyWithCode to show currency on LEFT (line 187-189)

**Current**: `${formatNumber(amount)} ${currency}` → "61.060 BOB"
**New**: `${currency} ${formatNumber(amount)}` → "BOB 61.060"

This ensures all numbers align on the right side of the summary section.

#### Change 4: Increase Ajuste row font size and show negative in red (lines 437-447)

**Current**: Ajuste label uses generic styling
**New**: Match styling with standardFee row (same text size) + add conditional red color

```tsx
<div className="flex justify-between items-center">
  <span className="text-muted-foreground">{t("workOrders.adjustment")}</span>
  <div className="flex items-center gap-2">
    <span className="font-mono text-xs text-muted-foreground">{currency}</span>
    <NumericInput
      decimals={2}
      locale={currentLanguage as "es" | "en"}
      value={adjustmentAmount || ""}
      onChange={(val) => onAdjustmentChange(val)}
      className={cn(
        "w-28 text-right h-8",
        adjustmentAmount < 0 && "text-destructive"
      )}
      disabled={!isEditable}
    />
  </div>
</div>
```

#### Change 5: Full realization label with responsive text (line 448-453)

**Current**: Uses `t("workOrders.realization")` which is "Real. %"
**New**: Show full "% Realizacion" on desktop, abbreviated on mobile using responsive classes

```tsx
<div className="flex justify-between items-center">
  <span className="text-muted-foreground">
    <span className="hidden sm:inline">{t("workOrders.realizationFull")}</span>
    <span className="sm:hidden">{t("workOrders.realization")}</span>
  </span>
  <span className={cn(
    "font-mono font-medium",
    realizationPercent >= 75 ? "text-success" : "text-destructive"
  )}>
    {realizationPercent.toFixed(1)}%
  </span>
</div>
```

#### Change 6: Update all summary rows to show currency on left (lines 433-471)

Restructure summary rows with consistent layout:
- Label on left
- Currency code + value aligned right (currency as small prefix)

```tsx
<div className="flex justify-between items-center">
  <span className="text-muted-foreground">{t("workOrders.standardFee")}</span>
  <span className="font-mono">
    <span className="text-xs text-muted-foreground mr-1">{currency}</span>
    {formatNumber(totalStandardFee)}
  </span>
</div>
```

Apply to: standardFee, adjustedFee, expenses, IVA, feeWithTax.

---

### File 2: `src/components/ui/numeric-input.tsx`

#### Change 7: Fix negative number entry (lines 88-96)

**Current Issue**: Minus sign only allowed at position 0, but if the cursor isn't at position 0, it blocks entry.

The code at line 91 already allows minus at position 0. The issue is that when the input has a value like "900", the user can't type "-" at the start because the cursor isn't there.

**Fix**: Allow minus sign if the input is currently empty or if cursor is at position 0, regardless of whether there's already content.

Actually, looking at the code more carefully - the logic at line 91 should work. The issue is that when you type a number first (like "900"), the cursor is at the end, not at position 0. So when you try to type "-", it gets blocked because `input.selectionStart !== 0`.

The fix should handle the case where user types "-" while having a number: we should insert "-" at the beginning if cursor is not at position 0 but the field doesn't start with "-" yet.

```tsx
// Allow minus sign to be added
if (e.key === "-") {
  const input = e.currentTarget;
  const currentValue = input.value;
  
  // If min is set to 0 or positive, don't allow negative
  if (min !== undefined && min >= 0) {
    e.preventDefault();
    return;
  }
  
  // Allow typing minus at start
  if (input.selectionStart === 0 && !currentValue.startsWith("-")) {
    return;
  }
  
  // If cursor is not at start but value doesn't have minus, prepend minus
  if (!currentValue.startsWith("-")) {
    e.preventDefault();
    const newValue = "-" + currentValue;
    // Trigger change with new value
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    nativeInputValueSetter?.call(input, newValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    // Move cursor after the minus sign
    setTimeout(() => input.setSelectionRange(1, 1), 0);
    return;
  }
  
  e.preventDefault();
  return;
}
```

However, this is complex. A simpler approach: remove the `min={0}` constraint from the Ajuste input since it should accept negative values.

Looking at `WorkOrderForm.tsx` line 439-446:
```tsx
<NumericInput
  decimals={2}
  locale={currentLanguage as "es" | "en"}
  value={adjustmentAmount || ""}
  onChange={(val) => onAdjustmentChange(val)}
  className="w-36 text-right h-8"
  disabled={!isEditable}
/>
```

There's no `min` prop set! So the minus should work. The issue must be in the keydown handler - let me re-read.

Line 91: `if (input.selectionStart === 0 && (min === undefined || min < 0))`

Since `min` is undefined, the condition `(min === undefined || min < 0)` is true. So the minus should be allowed when cursor is at position 0.

The real issue: when you type "900" first, your cursor is at position 3 (end). When you press "-", `input.selectionStart === 3`, not 0, so the check fails.

**Better Fix**: When user types "-" and cursor is not at position 0, but the value doesn't start with "-", automatically prepend the minus sign.

---

### File 3: `src/pages/WorkOrderEdit.tsx`

#### Change 8: Add colored backgrounds to Resync and View Matrix buttons (lines 270-289)

**Current**: Both use `variant="outline"` with default styling
**New**: Add subtle colored backgrounds

```tsx
// Resync button - light info/blue background
<Button
  variant="outline"
  size="sm"
  onClick={() => setShowResyncDialog(true)}
  disabled={isLocked || resyncWorksheet.isPending}
  className="gap-2 bg-info/10 hover:bg-info/20 text-info border-info/30"
>

// View Matrix button - light teal/primary background
<Button
  variant="outline"
  size="sm"
  onClick={() => navigate(`/worksheets/${linkedWorksheet.id}`)}
  className="gap-2 bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
>
```

---

### File 4: Translation Files

#### `src/locales/en.json` - Add new key
```json
"workOrders": {
  ...
  "realizationFull": "Realization %"
}
```

#### `src/locales/es.json` - Add new key
```json
"workOrders": {
  ...
  "realizationFull": "% Realización"
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/forms/WorkOrderForm.tsx` | 1. Improve Currency/Season chip styling. 2. Standardize badge sizes. 3. Currency on left of amounts. 4. Ajuste font size + red for negative. 5. Full realization label (responsive). 6. Realization color coding (green >= 75%, red < 75%). |
| `src/components/ui/numeric-input.tsx` | Fix minus sign entry to allow prepending "-" when cursor is not at position 0 |
| `src/pages/WorkOrderEdit.tsx` | Add colored backgrounds to Resync (light blue) and View Matrix (light teal) buttons |
| `src/locales/en.json` | Add `realizationFull` translation key |
| `src/locales/es.json` | Add `realizationFull` translation key |

---

## Visual Summary

### Header Card (Edit Mode - After)
```
+---------------------------------------------------------------------------+
| [Borrador] [Sin guardar]    [Moneda: BOB] [Temporada: Alta]              |
|  (same size badges)          (styled chips)                               |
+---------------------------------------------------------------------------+
```

### Engagement Info Card (After)
```
+---------------------------------------------------------------------------+
| Encargo: ABC-2024-001 - Audit Fiscal                                      |
| Cliente: XYZ Corp                                                         |
|                                                                           |
|                        [Resincronizar] [Ver Matriz]                       |
|                         (light blue)   (light teal)                       |
+---------------------------------------------------------------------------+
```

### Summary Section (After)
```
+---------------------------------------+
| Resumen                               |
+---------------------------------------+
| Hon. Std.              BOB  61.060    |
| Ajuste                 BOB    -900    |  (red text for negative)
| % Realizacion              98.5%      |  (green, >= 75%)
| Hon. Aj.               BOB  60.160    |
| Gastos                 BOB     234    |
|---------------------------------------|
| IVA (13%)              BOB   9.059    |
|---------------------------------------|
| Honorario c/IVA        BOB  69.453    |
+---------------------------------------+
```

Currency code ("BOB") appears as small text on the left, numbers align on the right.

---

## Testing Checklist

After implementation:
- [ ] Badges "Borrador" and "Sin guardar" are same size
- [ ] Currency/Season display as clean chips (not scattered labels)
- [ ] Resincronizar button has light blue background
- [ ] Ver Matriz button has light teal background
- [ ] Can type "-900" directly in Ajuste field (negative number first)
- [ ] Negative Ajuste values show in red
- [ ] Ajuste text size matches other rows in Resumen
- [ ] Currency code appears to the left of all amounts in Resumen
- [ ] Full "% Realizacion" shown on desktop, abbreviated on mobile
- [ ] Realization >= 75% shows in green, < 75% in red

