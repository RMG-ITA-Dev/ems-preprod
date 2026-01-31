

# Plan: Fix Work Order Button Placement and Text

## Issues Identified

From analyzing the code and screenshots:

1. **"Retirar" button in wrong location**: Currently placed in the header card next to "Resincronizar" and "Ver Matriz" buttons. Should be at the BOTTOM of the form (where "Enviar para Aprobación" appears for Draft status), styled in red/destructive.

2. **Text should be "Retirar de Aprobación"**: Current translation key `workOrders.unsubmit` = "Retirar" should become "Retirar de Aprobación" (Spanish) / "Withdraw from Approval" (English).

3. **"Resincronizar" and "Ver Matriz" buttons inconsistent**: These buttons should ALWAYS appear in the same location in the header card, regardless of approval status.

---

## Solution Overview

### Visual Layout Goal

**Header Card (always the same):**
```
+--------------------------------------------------+
| Encargo: FIE 2025 - Auditoria EEFF 2025          |
| Banco FIE S.A.      [Resincronizar] [Ver Matriz] |
+--------------------------------------------------+
```

**Bottom Actions - Draft Status:**
```
[Cancelar]  [Guardar]  [Enviar para Aprobación] (blue)
```

**Bottom Actions - Pending Approval Status:**
```
[Cancelar]  [Retirar de Aprobación] (red)
```
(Note: Guardar not shown when locked, only Cancel and the withdraw button)

---

## Implementation Steps

### Step 1: Remove Unsubmit Button from Header Card

**File:** `src/pages/WorkOrderEdit.tsx`

Remove the separate "Retirar" button from the header card area (lines 276-288). The "Resincronizar" and "Ver Matriz" buttons will remain in their consistent position.

### Step 2: Pass Unsubmit Handler to WorkOrderForm

**File:** `src/pages/WorkOrderEdit.tsx`

Add `onUnsubmit={handleUnsubmit}` prop to the `WorkOrderForm` component so it can render the button at the bottom of the form.

### Step 3: Update WorkOrderForm to Show Unsubmit Button at Bottom

**File:** `src/components/forms/WorkOrderForm.tsx`

1. Add `onUnsubmit?: () => void` to the props interface
2. In the Actions section at the bottom (line 578-614), add a new condition for `isPending` status that shows the "Retirar de Aprobación" button with destructive styling

Current logic:
- Draft: Cancel + Save + Submit for Approval
- Pending + canApprove: Reject + Approve

New logic:
- Draft: Cancel + Save + Submit for Approval  
- Pending (any user): Cancel + Unsubmit (red)
- Pending + canApprove: (also) Reject + Approve

### Step 4: Update Translation Keys

**Files:** `src/locales/en.json` and `src/locales/es.json`

Update the `workOrders.unsubmit` key:
- Spanish: "Retirar de Aprobación"  
- English: "Withdraw from Approval"

---

## Technical Details

### WorkOrderEdit.tsx Changes

```typescript
// REMOVE lines 276-288 (Unsubmit button in header card)
// The header should ONLY contain Resincronizar + Ver Matriz buttons

// ADD onUnsubmit prop to WorkOrderForm (around line 310):
<WorkOrderForm
  ...existing props...
  onUnsubmit={handleUnsubmit}
/>
```

### WorkOrderForm.tsx Changes

```typescript
// ADD to interface (around line 60):
onUnsubmit?: () => void;

// ADD to function params:
onUnsubmit,

// UPDATE Actions section (lines 578-614):
{/* Actions */}
<div className="flex justify-end gap-3">
  {onCancel && (
    <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="btn-action">
      {t("common.cancel")}
    </Button>
  )}
  
  {isDraft && (
    <>
      <LoadingButton onClick={onSubmit} loading={isSubmitting} className="btn-action">
        {t("common.save")}
      </LoadingButton>
      {onSubmitForApproval && (
        <LoadingButton onClick={onSubmitForApproval} className="bg-info hover:bg-info/90 btn-action" loading={isSubmitting}>
          <Send className="h-4 w-4 mr-2" />
          {t("workOrders.submitForApproval")}
        </LoadingButton>
      )}
    </>
  )}
  
  {/* NEW: Unsubmit button for Pending status */}
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
  
  {isPending && canApprove && (
    <>
      {onReject && (
        <LoadingButton variant="outline" onClick={onReject} className="text-destructive border-destructive btn-action" loading={isSubmitting}>
          <XCircle className="h-4 w-4 mr-2" />
          {t("workOrders.reject")}
        </LoadingButton>
      )}
      {onApprove && (
        <LoadingButton onClick={onApprove} className="bg-success hover:bg-success/90 btn-action" loading={isSubmitting}>
          <CheckCircle className="h-4 w-4 mr-2" />
          {t("workOrders.approve")}
        </LoadingButton>
      )}
    </>
  )}
</div>
```

### Translation Updates

**en.json:**
```json
"unsubmit": "Withdraw from Approval"
```

**es.json:**
```json
"unsubmit": "Retirar de Aprobación"
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/WorkOrderEdit.tsx` | Remove Unsubmit button from header, pass `onUnsubmit` to form |
| `src/components/forms/WorkOrderForm.tsx` | Add `onUnsubmit` prop, render destructive button at bottom for Pending status |
| `src/locales/en.json` | Update `workOrders.unsubmit` to "Withdraw from Approval" |
| `src/locales/es.json` | Update `workOrders.unsubmit` to "Retirar de Aprobación" |

---

## Testing Checklist

After implementation:
- [ ] Draft WO: Header shows [Resincronizar] [Ver Matriz] buttons
- [ ] Draft WO: Footer shows [Cancelar] [Guardar] [Enviar para Aprobación]
- [ ] Pending WO: Header shows [Resincronizar] [Ver Matriz] buttons (same position)
- [ ] Pending WO: Footer shows [Cancelar] [Retirar de Aprobación] (red button)
- [ ] Pending WO + Approver: Footer also shows [Rechazar] [Aprobar]
- [ ] Clicking "Retirar de Aprobación" returns WO to Draft status

