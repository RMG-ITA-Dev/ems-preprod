

# Plan: Work Order UX Improvements

## Issues Summary

1. **Budget Lines**: Delete buttons (trash icons) and "Agregar Línea" should be removed - all budget line management is done in the Work Matrix
2. **Expense Lines**: Keep existing add/delete functionality (managed at WO level, not Matrix)
3. **Submit Button Behavior**: "Enviar para Aprobación" should be disabled when there are unsaved changes - user must Save first
4. **Currency & Season Locking**: Make Moneda and Temporada immutable after WO creation - can only be set once at creation time
5. **Temporada Dropdown**: Convert Season toggle to dropdown (like Currency)
6. **Confirmation Dialog**: Add popup when setting Moneda/Temporada during WO creation with warning they cannot be changed later
7. **Summary Currency Sign**: Add currency code to monetary values in the Resumen section for clarity

---

## Part 1: Remove Budget Line Management from WO

**Current State**: Budget lines table has delete trash icons and "Agregar Línea" button
**New State**: Budget lines are completely read-only (hours, categories, actions all locked) - managed only via Work Matrix + Resync

### Changes in `WorkOrderForm.tsx`

1. Remove the `addBudgetLine` function call button (lines 402-407)
2. Remove the delete trash icon for budget lines (lines 358-368)
3. Make Category dropdown read-only (display text only, no Select)

Since hours editing was already removed, these are the remaining editable elements that need to be locked for budget lines.

---

## Part 2: Disable "Submit for Approval" When Dirty

**Logic**: Track if form has unsaved changes. If dirty, disable "Enviar para Aprobación" button.

### Implementation

1. Add `isDirty` prop to `WorkOrderForm` interface
2. In `WorkOrderEdit.tsx`, compute `isDirty` by comparing current state to original loaded values
3. Pass `isDirty` to form and disable submit button accordingly
4. Show visual indicator when form has unsaved changes

### Dirty Check Logic
```typescript
const isDirty = useMemo(() => {
  if (!workOrder) return false;
  
  // Compare adjustment amount
  if (adjustmentAmount !== (Number(workOrder.adjustment_amount) || 0)) return true;
  
  // Compare expense budget count and values
  const originalExpIds = (workOrder.expense_budget || []).map(e => e.wo_exp_id).sort();
  const currentExpIds = expenseBudget.map(e => e.id).sort();
  if (JSON.stringify(originalExpIds) !== JSON.stringify(currentExpIds)) return true;
  
  // Compare expense values
  for (const exp of expenseBudget) {
    const orig = workOrder.expense_budget?.find(e => e.wo_exp_id === exp.id);
    if (orig && Number(orig.budgeted_amount) !== exp.budgeted_amount) return true;
  }
  
  return false;
}, [workOrder, adjustmentAmount, expenseBudget]);
```

---

## Part 3: Lock Currency & Season After Creation

**New Behavior**: 
- On **WorkOrderNew**: Currency and Season are editable with dropdowns
- On **WorkOrderEdit**: Currency and Season are read-only display text (not controls)

### WorkOrderForm Changes

1. Add new prop `isNew: boolean` to distinguish create vs edit mode
2. When `isNew = false`:
   - Currency: Display as Badge/text, not Select dropdown
   - Season: Display as Badge/text, not dropdown/toggle
3. When `isNew = true`:
   - Show editable dropdowns for both

---

## Part 4: Convert Season to Dropdown

**Current**: Switch toggle (High/Low)
**New**: Select dropdown with two options (like Currency)

### Changes

Replace the Switch component with a Select dropdown:
```tsx
<Select value={seasonMode} onValueChange={(v) => onSeasonChange(v as "High" | "Low")} disabled={!isNew}>
  <SelectTrigger className="w-24 h-8">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="High">{t("industry.high")}</SelectItem>
    <SelectItem value="Low">{t("industry.low")}</SelectItem>
  </SelectContent>
</Select>
```

---

## Part 5: Confirmation Dialog for Currency/Season

**When**: User is creating a new WO and changes Currency or Season
**Trigger**: Before submitting/saving the new WO
**Content**: "Are you sure these parameters are correct? Currency and Season cannot be changed after creation."

### Implementation

Add a confirmation dialog in `WorkOrderNew.tsx`:
- Show on first save/submit
- Require explicit confirmation
- Display selected Currency and Season values

---

## Part 6: Currency Code in Summary Section

**Current**: Numbers displayed without currency indicator
**New**: Add currency code to key totals (e.g., "61.060 BOB" or "8,580 USD")

### Changes in WorkOrderForm.tsx

Update the `formatCurrency` function for summary section to include currency code:
```typescript
const formatCurrencyWithCode = (amount: number) => {
  return `${formatNumber(amount)} ${currency}`;
};
```

Apply to:
- Hon. Std.
- Hon. Aj.
- Gastos
- IVA
- Honorario c/IVA

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/forms/WorkOrderForm.tsx` | 1. Add `isNew` prop. 2. Remove budget line delete buttons. 3. Remove "Agregar Línea" button. 4. Make Category column read-only text. 5. Convert Season to dropdown. 6. Lock Currency/Season on edit mode. 7. Add `isDirty` prop to disable submit. 8. Add currency code to summary values. |
| `src/pages/WorkOrderEdit.tsx` | Compute `isDirty` state and pass to form. Pass `isNew={false}`. |
| `src/pages/WorkOrderNew.tsx` | Pass `isNew={true}`. Add confirmation AlertDialog before saving. |
| `src/locales/en.json` | Add new translation keys for confirmation dialog |
| `src/locales/es.json` | Add new translation keys for confirmation dialog |

---

## New Translation Keys

**English (en.json)**:
```json
"workOrders": {
  ...
  "confirmParametersTitle": "Confirm Work Order Parameters",
  "confirmParametersDescription": "Currency and Season cannot be changed after creation. Please verify these settings are correct.",
  "selectedCurrency": "Currency",
  "selectedSeason": "Season",
  "confirmAndCreate": "Confirm & Create"
}
```

**Spanish (es.json)**:
```json
"workOrders": {
  ...
  "confirmParametersTitle": "Confirmar Parámetros de Orden de Trabajo",
  "confirmParametersDescription": "La Moneda y Temporada no se pueden cambiar después de la creación. Por favor verifique que estos parámetros sean correctos.",
  "selectedCurrency": "Moneda",
  "selectedSeason": "Temporada",
  "confirmAndCreate": "Confirmar y Crear"
}
```

---

## Visual Summary

### Budget Lines Table (After Changes)
```
+--------------------------------------------------+
| Líneas de Presupuesto                            |
+--------------------------------------------------+
| Categoría    | Horas | Tarifa | Total | ...     |
|              |       |        |       |         |
| Socio        | 6.0   | 1,530  | 9,180 | ...     | (no trash icon)
| Director     | 10.0  | 700    | 7,000 | ...     | (no trash icon)
| ...          |       |        |       |         |
+--------------------------------------------------+
| (no "Agregar Línea" button)                      |
+--------------------------------------------------+
```

### Header Card - Create Mode
```
+---------------------------------------------------------+
| [Borrador]    [Moneda: BOB ▼]  [Temporada: Alta ▼]     |
+---------------------------------------------------------+
```

### Header Card - Edit Mode (Locked)
```
+---------------------------------------------------------+
| [Borrador]    Moneda: BOB      Temporada: Alta          |
+---------------------------------------------------------+
```
(Currency and Season displayed as static text, not dropdowns)

### Summary Section (With Currency Code)
```
+-----------------------------------+
| Resumen                           |
+-----------------------------------+
| Hon. Std.         61.060 BOB     |
| Ajuste            [___________]   |
| Real. %                  100.0%   |
| Hon. Aj.          61.060 BOB     |
| Gastos               234 BOB     |
|-----------------------------------|
| IVA (13%)          9.159 BOB     |
|-----------------------------------|
| Honorario c/IVA   70.453 BOB     |
+-----------------------------------+
```

---

## Testing Checklist

After implementation:
- [ ] **Create WO**: Currency and Season dropdowns are visible and editable
- [ ] **Create WO**: Confirmation dialog appears before saving
- [ ] **Edit WO**: Currency and Season are read-only text (not controls)
- [ ] **Budget Lines**: No delete icons, no "Agregar Línea" button
- [ ] **Budget Lines**: Category column is read-only text
- [ ] **Expenses**: Add/delete still works (unchanged)
- [ ] **Dirty State**: Make a change → "Enviar para Aprobación" disabled
- [ ] **Dirty State**: Save → "Enviar para Aprobación" enabled
- [ ] **Summary**: All monetary values show currency code (e.g., "61.060 BOB")

