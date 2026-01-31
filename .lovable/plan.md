

# Plan: Add "Resync from Worksheet" Feature to Work Orders

## Problem Analysis

When a user modifies the **Matriz de Trabajo (Worksheet)** to add hours for specialist categories (IT Specialist, Tax Specialist, SQP), there is currently no way to reload those changes into an existing Work Order. The Work Order shows only the categories that were present when it was originally created.

**Current Workflow:**
1. Worksheet is created and linked to a Work Order
2. If worksheet is modified later, there's no mechanism to push those changes to the Work Order

**Screenshots Analysis:**
- Image 1 (Work Order): Shows only Senior, Socio, Gerente - missing specialists
- Image 2 (Worksheet): Shows Especialista IT and Especialista TAX with hours (3, 8, 11 hours)

## Solution

Add a **"Resync from Worksheet"**  button on the Work Order Edit page (to the left of the {Ver Matriz} button, with the sale look and feel) that calls the existing `sync_worksheet_to_wo_budget` database function to repopulate the budget lines from the linked worksheet.

---

## Implementation Steps

### Step 1: Create New Mutation Hook

**File:** `src/hooks/useWorksheetMutations.ts`

Add a new mutation `useResyncWorksheetToWorkOrder` that:
1. Calls the existing `sync_worksheet_to_wo_budget` RPC function
2. Invalidates the `work_order` and `work_orders` query caches
3. Shows a success/error toast

```typescript
export function useResyncWorksheetToWorkOrder() {
  // Call supabase.rpc('sync_worksheet_to_wo_budget', { p_worksheet_id, p_wo_id })
  // On success: invalidate caches, show toast
}
```

### Step 2: Update Work Order Edit Page

**File:** `src/pages/WorkOrderEdit.tsx`

Add a "Resync from Worksheet" button next to the existing "View Worksheet" button in the engagement info card:
- Button appears only when the Work Order has a linked worksheet
- Button is disabled when the Work Order is in "Approved" or "Pending_Approval" status
- Clicking shows a confirmation dialog (destructive action - replaces existing budget lines)

Changes:
1. Import the new `useResyncWorksheetToWorkOrder` mutation
2. Add confirmation dialog state
3. Add "Resync" button with confirmation flow
4. Call mutation on confirmation

### Step 3: Add Translations

**Files:** `src/locales/en.json` and `src/locales/es.json`

Add new translation keys under `workMatrix`:
- `resyncToWorkOrder`: "Resync to Work Order" / "Resincronizar a Orden de Trabajo"
- `resyncConfirmTitle`: "Resync Budget Lines?" / "¿Resincronizar Líneas de Presupuesto?"
- `resyncConfirmDescription`: "This will replace all budget lines in the Work Order with the current worksheet data. This action cannot be undone." / "Esto reemplazará todas las líneas de presupuesto en la Orden de Trabajo con los datos actuales de la matriz. Esta acción no se puede deshacer."
- `resyncSuccess`: "Budget lines synced from worksheet" / "Líneas de presupuesto sincronizadas desde la matriz"

---

## Technical Details

### Database Function (Already Exists)

The `sync_worksheet_to_wo_budget(p_worksheet_id, p_wo_id)` function:
1. Links worksheet to work order by updating `activity_worksheets.wo_id`
2. Deletes existing `wo_budget_lines` for the work order
3. Inserts new budget lines aggregated by category from `activity_worksheet_cells`
4. Uses locked rates from `categories` table based on currency and season

This function already handles the specialist categories correctly - the issue was simply that it wasn't being called when the worksheet was updated.

### UI Flow

```
+------------------------------------------+
|  Work Order - PFIE 1                     |
+------------------------------------------+
| Engagement: PFIE 1 - Prueba FIE 1        |
|                          [Ver Matriz] [↻ Resincronizar] |
+------------------------------------------+
```

When "Resincronizar" is clicked:
1. Show confirmation dialog with warning
2. User confirms
3. Call `sync_worksheet_to_wo_budget` RPC
4. Refresh the page data
5. Show success toast
6. Budget lines grid now shows all categories including specialists

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useWorksheetMutations.ts` | Add `useResyncWorksheetToWorkOrder` mutation |
| `src/pages/WorkOrderEdit.tsx` | Add resync button, confirmation dialog, and hook integration |
| `src/locales/en.json` | Add 4 translation keys |
| `src/locales/es.json` | Add 4 translation keys |

---

## Edge Cases Handled

1. **Work Order is locked (Approved/Pending)**: Button disabled, cannot resync
2. **No linked worksheet**: Button does not appear
3. **Worksheet has no cells with hours > 0**: Existing budget lines are deleted, none inserted
4. **Network error during sync**: Error toast shown, no changes made (transaction)

---

## Testing Checklist

After implementation:
- [ ] Open the Work Order that's missing specialist hours
- [ ] Click "Resincronizar" (or "Resync to Work Order")
- [ ] Confirm the dialog
- [ ] Verify that Especialista IT, Especialista TAX, and SQP now appear in the budget grid
- [ ] Verify hours match the worksheet values
- [ ] Verify rates are correctly calculated based on currency/season

