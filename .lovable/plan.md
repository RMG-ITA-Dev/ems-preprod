

# Plan: Sort Budget Lines by Category Hierarchy

## Problem

In the Work Order "Lineas de Presupuesto" (Budget Lines) section, categories are displayed in the order they were inserted into the database, not by their hierarchy (display_order). 

**Current order shown:**
Senior → Semi-Senior → Socio → Asistente → Director → Gerente

**Expected order (by display_order):**
Socio (1) → SQR(if any) -> Director (2) → Gerente (4) → Senior (5) → Semi-Senior (6) → Asistente (9) -> IT -> TAX

## Solution

Sort the budget lines by category `display_order` when loading them into state in `WorkOrderEdit.tsx`. This ensures the lines are displayed in the correct hierarchical order.

---

## Implementation

### File: `src/pages/WorkOrderEdit.tsx`

**Current code (lines 83-91):**
```typescript
// Load budget lines
const lines: BudgetLineInput[] = (workOrder.budget_lines || []).map((bl) => ({
  id: bl.wo_line_id,
  category_id: bl.category_id,
  budgeted_hours: Number(bl.budgeted_hours),
  standard_rate: Number(bl.standard_rate),
}));
setBudgetLines(lines);
```

**Updated code:**
```typescript
// Load budget lines - sorted by category display_order
const lines: BudgetLineInput[] = (workOrder.budget_lines || [])
  .sort((a, b) => {
    const orderA = a.category?.display_order ?? 999;
    const orderB = b.category?.display_order ?? 999;
    return orderA - orderB;
  })
  .map((bl) => ({
    id: bl.wo_line_id,
    category_id: bl.category_id,
    budgeted_hours: Number(bl.budgeted_hours),
    standard_rate: Number(bl.standard_rate),
  }));
setBudgetLines(lines);
```

The embedded `category` object (from the Supabase join) contains the `display_order` field, so we can sort by it before mapping to the form input structure.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/WorkOrderEdit.tsx` | Add `.sort()` before `.map()` when loading budget lines from workOrder |

---

## Alternative Consideration

We could also add sorting directly in `WorkOrderForm.tsx` before rendering, but sorting at the load point (WorkOrderEdit) is cleaner because:
1. The sorted order is maintained in state
2. New lines added manually will appear at the end (natural behavior)
3. Resyncing from worksheet will also respect the order

---

## Testing Checklist

After implementation:
- [ ] Open any Work Order - budget lines should now display in hierarchy order (Socio, Director, Gerente, Senior, Semi-Senior, Asistente, etc.)
- [ ] Resync from worksheet should also maintain the correct order
- [ ] Adding a new budget line manually should append to the end (expected behavior)

