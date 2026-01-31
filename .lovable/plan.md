

# Plan: Lock Worksheet When WO is Pending + Add Unsubmit Button

## Problem Summary

The user has identified two workflow issues:

1. **Worksheet Modification Issue**: The Worksheet (Matriz de Trabajo) can currently be modified even when its linked Work Order is in "Pending_Approval" status. This should not be allowed.

2. **No Way to Unsubmit**: There is no "Unsubmit" button on the Work Order to return it from "Pending_Approval" back to "Draft" status, which would unlock the Worksheet for modifications.

3. **Resync Button Disabled**: The Resync button on WorkOrderEdit is currently disabled for "Pending_Approval" status (by design, since we want strict control).

## Solution

### Part 1: Lock Worksheet When Linked WO is Pending/Approved

Update the `WorksheetEdit.tsx` page to:
1. Fetch the linked Work Order's `approval_status` via the `useWorksheetByEngagementId` hook (or create a new query)
2. Set `isReadOnly = true` if the linked Work Order is "Pending_Approval" or "Approved"
3. Display a message explaining why the worksheet is locked

### Part 2: Add Unsubmit Button on Work Order

Update the `WorkOrderEdit.tsx` page to:
1. Add a new `useUnsubmitWorkOrder` mutation to return status from "Pending_Approval" to "Draft"
2. Add an "Unsubmit" button that appears only when status is "Pending_Approval"
3. The Unsubmit button allows the user to recall the submission, enabling further edits

### Part 3: Add a New Hook to Get WO Status

Update `useWorksheetData.ts` to extend the `useWorksheetByEngagementId` query to include the linked Work Order's approval_status, or create a helper that fetches the WO status given the `wo_id`.

---

## Implementation Details

### Step 1: Update useWorksheetData.ts - Fetch WO Approval Status

Modify `useWorksheetByEngagementId` to also return the linked Work Order's `approval_status`:

```typescript
// Current query fetches: id, engagement_id, wo_id, status, version
// Add: JOIN to work_orders to get approval_status when wo_id exists

const { data, error } = await supabase
  .from("activity_worksheets")
  .select(`
    id, engagement_id, wo_id, status, version,
    work_order:work_orders!activity_worksheets_wo_id_fkey (
      wo_id,
      approval_status
    )
  `)
  ...
```

This allows the WorksheetEdit page to check the WO's approval_status.

### Step 2: Update WorksheetEdit.tsx - Lock When WO is Pending/Approved

```typescript
// Current logic:
const isReadOnly = worksheet?.status === "approved" || worksheet?.status === "archived";

// New logic - also lock if linked WO is not Draft:
const linkedWOStatus = worksheet?.work_order?.approval_status;
const isWOLocked = linkedWOStatus === "Pending_Approval" || linkedWOStatus === "Approved";
const isReadOnly = worksheet?.status === "approved" || worksheet?.status === "archived" || isWOLocked;
```

Also add a visual indicator showing the user WHY the worksheet is locked (e.g., a banner or badge).

### Step 3: Add useUnsubmitWorkOrder Mutation

Create a new mutation in `useWorkOrderMutations.ts`:

```typescript
export function useUnsubmitWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (woId: string) => {
      const { data: result, error } = await supabase
        .from("work_orders")
        .update({ approval_status: "Draft" })
        .eq("wo_id", woId)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_orders"] });
      queryClient.invalidateQueries({ queryKey: ["work_order"] });
      queryClient.invalidateQueries({ queryKey: ["worksheet-by-engagement"] });
      toast.success(i18n.t("workOrders.unsubmitted"));
    },
    onError: createMutationErrorHandler("unsubmitting work order"),
  });
}
```

### Step 4: Update WorkOrderEdit.tsx - Add Unsubmit Button

```typescript
// In the action buttons area:
{approvalStatus === "Pending_Approval" && (
  <Button
    variant="outline"
    onClick={handleUnsubmit}
    disabled={unsubmitWorkOrder.isPending}
  >
    <Undo2 className="h-4 w-4 mr-2" />
    {t("workOrders.unsubmit")}
  </Button>
)}
```

### Step 5: Add Translations

**English (en.json):**
```json
"workOrders": {
  ...
  "unsubmit": "Unsubmit",
  "unsubmitted": "Work order returned to draft"
}
```

**Spanish (es.json):**
```json
"workOrders": {
  ...
  "unsubmit": "Retirar",
  "unsubmitted": "Orden de trabajo devuelta a borrador"
}
```

**Also add for worksheet lock message:**

```json
"workMatrix": {
  ...
  "lockedByWorkOrder": "This worksheet is locked because the linked Work Order is pending approval or approved.",
  "lockedByWorkOrderTitle": "Worksheet Locked"
}
```

Spanish:
```json
"workMatrix": {
  ...
  "lockedByWorkOrder": "Esta matriz está bloqueada porque la Orden de Trabajo vinculada está pendiente de aprobación o aprobada.",
  "lockedByWorkOrderTitle": "Matriz Bloqueada"
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useWorksheetData.ts` | Extend `useWorksheetByEngagementId` to include WO approval_status |
| `src/pages/WorksheetEdit.tsx` | Add lock logic based on WO status, show locked message banner |
| `src/hooks/mutations/useWorkOrderMutations.ts` | Add `useUnsubmitWorkOrder` mutation |
| `src/hooks/mutations/index.ts` | Export new `useUnsubmitWorkOrder` |
| `src/pages/WorkOrderEdit.tsx` | Add "Unsubmit" button for Pending_Approval WOs |
| `src/locales/en.json` | Add `unsubmit`, `unsubmitted`, `lockedByWorkOrder` keys |
| `src/locales/es.json` | Add Spanish translations |

---

## User Workflow After Implementation

```
+----------------------------------------+
|  CORRECT WORKFLOW                      |
+----------------------------------------+
| 1. Create Worksheet with hours         |
| 2. Create Work Order from Worksheet    |
| 3. Submit WO for Approval              |
|    → Worksheet becomes LOCKED          |
|    → Resync button becomes DISABLED    |
|                                        |
| If changes needed:                     |
| 4. Go to Work Order                    |
| 5. Click "Unsubmit" (Retirar)          |
|    → WO returns to Draft               |
|    → Worksheet becomes EDITABLE        |
|    → Resync button becomes ENABLED     |
| 6. Modify Worksheet                    |
| 7. Click Resync on Work Order          |
| 8. Re-submit for Approval              |
+----------------------------------------+
```

---

## Testing Checklist

After implementation:
- [ ] When WO is "Pending_Approval", the Worksheet should be read-only with a lock message
- [ ] When WO is "Approved", the Worksheet should be read-only
- [ ] When WO is "Draft", the Worksheet should be editable
- [ ] "Unsubmit" button appears only when WO status is "Pending_Approval"
- [ ] Clicking "Unsubmit" returns WO to "Draft" and unlocks the Worksheet
- [ ] After unsubmit, the Resync button on WorkOrderEdit is enabled

