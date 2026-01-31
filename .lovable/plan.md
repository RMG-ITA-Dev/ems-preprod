

# Plan: Make WO Hours Read-Only and Style Unsubmit Button Orange

## Problem Summary

1. **Hours editable in WO**: The "Horas" (Hours) column in the Work Order budget lines table is currently editable. According to business rules, all hour planning must be done in the Work Matrix (Matriz de Trabajo), and the Work Order should only display the aggregated values (read-only).

2. **Unsubmit button color**: The "Retirar de Aprobacion" button is currently red (destructive variant). It should use the same orange/amber tone as the "Borrador" (Draft) badge for consistency.

---

## Solution

### Part 1: Make Hours Column Read-Only

In the Budget Lines table, the Hours column should display the value as read-only text (like the Rate column) instead of an editable input. Since edits must be done in the Work Matrix and resynced to the WO, there's no need for the hours input field in the WO at all.

**Current behavior:** NumericInput with `disabled={!isEditable}` condition
**New behavior:** Plain text display (like the Rate column)

### Part 2: Change Unsubmit Button to Orange (Warning Color)

The "Retirar de Aprobacion" button should use the warning color (`bg-warning`) instead of destructive (`variant="destructive"`). This matches the "Borrador" badge styling and indicates "caution/withdraw" rather than "delete/danger".

---

## Implementation Details

### File: `src/components/forms/WorkOrderForm.tsx`

#### Change 1: Make Hours column read-only (lines 337-347)

**Current code:**
```tsx
<td className="py-1.5 px-2 border-r border-border">
  <NumericInput
    decimals={1}
    locale={currentLanguage as "es" | "en"}
    min={0}
    value={line.budgeted_hours || ""}
    onChange={(val) => updateBudgetLine(line.id, "budgeted_hours", val)}
    className="text-right h-8"
    disabled={!isEditable}
  />
</td>
```

**New code:**
```tsx
<td className="py-1.5 px-2 text-right font-mono border-r border-border">
  {line.budgeted_hours.toLocaleString(currency === "BOB" ? "es-BO" : "en-US", { 
    minimumFractionDigits: 1, 
    maximumFractionDigits: 1 
  })}
</td>
```

This removes the NumericInput and displays hours as plain formatted text, matching the Rate column style.

#### Change 2: Style Unsubmit button with warning color (lines 601-611)

**Current code:**
```tsx
{isPending && onUnsubmit && (
  <LoadingButton
    variant="destructive"
    onClick={onUnsubmit}
    loading={isSubmitting}
    className="btn-action"
  >
    <Undo2 className="h-4 w-4 mr-2" />
    {t("workOrders.unsubmit")}
  </LoadingButton>
)}
```

**New code:**
```tsx
{isPending && onUnsubmit && (
  <LoadingButton
    variant="outline"
    onClick={onUnsubmit}
    loading={isSubmitting}
    className="bg-warning hover:bg-warning/90 text-warning-foreground btn-action"
  >
    <Undo2 className="h-4 w-4 mr-2" />
    {t("workOrders.unsubmit")}
  </LoadingButton>
)}
```

This uses the warning color (`bg-warning`) which is the same orange tone used for the "Borrador" badge.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/forms/WorkOrderForm.tsx` | 1. Replace Hours NumericInput with read-only text display. 2. Change Unsubmit button from destructive (red) to warning (orange) |

---

## Visual Result

**Budget Lines Table:**
- Category: Dropdown (editable only in Draft if needed for manual additions)
- Hours: **Read-only text** (value comes from Work Matrix via Resync)
- Rate: Read-only text (locked from category rates)
- All other columns: Calculated values (read-only)

**Unsubmit Button:**
- Color: Orange/amber (`--warning: 38 92% 50%`) - matches "Borrador" badge
- Text: "Retirar de Aprobacion" with Undo2 icon

---

## Testing Checklist

- [ ] Open a Draft Work Order - Hours column should be read-only (no input field)
- [ ] Open a Pending Approval Work Order - "Retirar de Aprobacion" button should be orange, not red
- [ ] Verify the orange color matches the "Borrador" badge color
- [ ] Confirm editing hours must be done via Work Matrix and Resync

