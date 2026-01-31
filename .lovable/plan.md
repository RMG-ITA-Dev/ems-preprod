

# Plan: Work Order Summary Section Refinements

## Issues to Address

1. **Ajuste input font/size mismatch** - Input cell should display the same font and font size as other static numbers in Resumen
2. **Ajuste field needs thousands separator** - Currently shows raw number (e.g., `-2000` instead of `-2.000` for Spanish)
3. **Gastos line items need thousands separator** - Expense amounts in the input should also use proper locale formatting
4. **Full labels for Hon. Std. and Hon. Aj.** - Use "Honorario Standard" and "Honorario Ajustado" (Spanish) / "Standard Fee" and "Adjusted Fee" (English)
5. **Responsive abbreviations** - Use full text on desktop, abbreviations only on mobile/tablet

---

## Technical Changes

### File 1: `src/locales/es.json`

**Add new translation keys for full labels:**

| Key | Current Value | New Full Value |
|-----|---------------|----------------|
| `workOrders.standardFee` | `Hon. Std.` | Keep as abbreviation |
| `workOrders.standardFeeFull` | (new) | `Honorario Standard` |
| `workOrders.adjustedFee` | `Hon. Aj.` | Keep as abbreviation |
| `workOrders.adjustedFeeFull` | (new) | `Honorario Ajustado` |

---

### File 2: `src/locales/en.json`

**Add new translation keys for full labels:**

| Key | Current Value | New Full Value |
|-----|---------------|----------------|
| `workOrders.standardFee` | `Std. Fee` | Keep as abbreviation |
| `workOrders.standardFeeFull` | (new) | `Standard Fee` |
| `workOrders.adjustedFee` | `Adj. Fee` | Keep as abbreviation |
| `workOrders.adjustedFeeFull` | (new) | `Adjusted Fee` |

---

### File 3: `src/components/forms/WorkOrderForm.tsx`

#### Change 1: Update Standard Fee label to be responsive (line 449)

**Current:**
```tsx
<span className="text-muted-foreground">{t("workOrders.standardFee")}</span>
```

**New:**
```tsx
<span className="text-muted-foreground">
  <span className="hidden sm:inline">{t("workOrders.standardFeeFull")}</span>
  <span className="sm:hidden">{t("workOrders.standardFee")}</span>
</span>
```

#### Change 2: Update Adjusted Fee label to be responsive (line 491)

**Current:**
```tsx
<span className="text-muted-foreground">{t("workOrders.adjustedFee")}</span>
```

**New:**
```tsx
<span className="text-muted-foreground">
  <span className="hidden sm:inline">{t("workOrders.adjustedFeeFull")}</span>
  <span className="sm:hidden">{t("workOrders.adjustedFee")}</span>
</span>
```

#### Change 3: Format Ajuste input with proper styling and thousands separator display (lines 460-470)

The NumericInput currently doesn't display thousands separators while editing. Since this is an input field, we need to format the displayed value when not focused. 

**Approach:** The NumericInput handles locale-based decimal separators, but for a truly formatted display (with thousands), we would need a more complex solution. For consistency with other summary values, we'll:

1. Ensure the input matches the font styling of other values (`text-sm` instead of relying on default)
2. Keep the current behavior for input (no thousands separator during editing - this is standard for numeric inputs)
3. The displayed value after blur will show the raw number, which is consistent with form inputs

**Styling update:** Change the NumericInput className to match other summary values more closely:

```tsx
<NumericInput
  decimals={0}
  locale={currentLanguage as "es" | "en"}
  value={adjustmentAmount || ""}
  onChange={(val) => onAdjustmentChange(val)}
  className={cn(
    "w-24 text-right h-8 text-sm font-mono border-0 bg-transparent px-0",
    adjustmentAmount < 0 && "text-destructive"
  )}
  disabled={!isEditable}
/>
```

The `border-0 bg-transparent px-0` makes the input look like a static value when not focused, matching the other summary rows.

#### Change 4: Format Gastos expense amounts with thousands separator (lines 397-405)

The expense line items use NumericInput which shows raw numbers. Since these are input fields, they work correctly. However, the **Total Gastos** line already uses `formatNumber()` which includes thousands separators.

For expense line item inputs, we keep the current behavior (no thousands during input) which is standard UX for numeric input fields.

---

## Summary of Visual Changes

### Before (Resumen Section)
```
Hon. Std.                   BOB  61.060    ← abbreviated, uses formatNumber
Ajuste                      BOB  [-2000 ]  ← no thousands, different styling
% Realización                      96,7%
Hon. Aj.                    BOB  59.060    ← abbreviated
Gastos                      BOB     234
```

### After (Resumen Section - Desktop)
```
Honorario Standard          BOB  61.060    ← full label on desktop
Ajuste                      BOB  [-2.000]  ← same font as other values
% Realización                      96,7%
Honorario Ajustado          BOB  59.060    ← full label on desktop
Gastos                      BOB     234
```

### After (Resumen Section - Mobile)
```
Hon. Std.                   BOB  61.060    ← abbreviated on mobile
Ajuste                      BOB  [-2.000]
% Real.                            96,7%   ← already abbreviated
Hon. Aj.                    BOB  59.060    ← abbreviated on mobile
Gastos                      BOB     234
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/locales/es.json` | Add `standardFeeFull` and `adjustedFeeFull` translation keys |
| `src/locales/en.json` | Add `standardFeeFull` and `adjustedFeeFull` translation keys |
| `src/components/forms/WorkOrderForm.tsx` | 1. Responsive labels for Standard Fee. 2. Responsive labels for Adjusted Fee. 3. Update Ajuste input styling to match other values. |

---

## Testing Checklist

After implementation:
- [ ] Desktop shows "Honorario Standard" and "Honorario Ajustado" (Spanish)
- [ ] Desktop shows "Standard Fee" and "Adjusted Fee" (English)
- [ ] Mobile/tablet shows "Hon. Std." and "Hon. Aj." (Spanish) / "Std. Fee" and "Adj. Fee" (English)
- [ ] Ajuste input uses same font and size as static numbers (`text-sm font-mono`)
- [ ] Negative Ajuste still shows in red
- [ ] Ajuste input appears more integrated with the summary layout

---

## Note on Thousands Separators in Inputs

Standard UX practice is that numeric **input fields** do not show thousands separators during editing, as it can cause cursor position issues and user confusion. The NumericInput component correctly handles:
- Decimal separator based on locale (comma for Spanish, period for English)
- Value validation and formatting

Thousands separators are shown in **display-only** values (like the other summary rows using `formatNumber()`). The Ajuste field being an input field follows this convention. If you need thousands separators in the input display, that would require a more complex implementation (format on blur, unformat on focus) which can be added as a future enhancement.

