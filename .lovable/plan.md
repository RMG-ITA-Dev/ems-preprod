

# Plan_0213-37_v3: Status-Aware Worksheet Lock Banner with Direct Navigation

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-37 |
| Title | El boton mencionado en el mensaje para desbloquear no esta visible en el modulo de Ordenes de Trabajo |
| Priority | Baja |
| Route | PRINCIPAL - Ordenes de Trabajo |
| Base Plan | Plan_0213-37_v2 (approved with 3 tweaks via CODEX) |

## Problem

The worksheet lock banner shows a single generic message mentioning "Retirar" for both `Pending_Approval` and `Approved` Work Order statuses. This is misleading because:

1. The "Retirar de Aprobacion" action only exists when the WO is in `Pending_Approval`.
2. When a WO is `Approved`, there is no withdraw action -- the status must be changed by other means.
3. The banner has no direct link to the Work Order page.

## Changes from v2

Three tweaks requested in the CODEX review:

1. **Explicit status branching** -- render banner only for known states (`Pending_Approval` or `Approved`), no fallback to wrong message on unexpected status.
2. **Wording alignment** -- Pending message references "Retirar de Aprobacion" (matching the actual UI button label). Approved message says "Para desbloquearla" instead of "Para modificarla".
3. **Old key removal confirmed safe** -- `lockedByWorkOrder` is only referenced in `WorksheetEdit.tsx` line 356. No other components, tests, or docs use it.

## Changes

### 1. `src/pages/WorksheetEdit.tsx` (lines 350-359)

Replace the static lock banner with a status-aware version. The outer guard ensures the banner only renders for the two expected statuses:

```typescript
{/* Locked by Work Order Banner */}
{isWOLocked && worksheet.wo_id &&
 (linkedWOStatus === "Pending_Approval" || linkedWOStatus === "Approved") && (
  <Alert variant="default" className="border-warning bg-warning/10">
    <Lock className="h-4 w-4" />
    <AlertTitle>{t("workMatrix.lockedByWorkOrderTitle")}</AlertTitle>
    <AlertDescription className="flex items-center justify-between gap-4">
      <span>
        {linkedWOStatus === "Pending_Approval"
          ? t("workMatrix.lockedByWorkOrderPending")
          : t("workMatrix.lockedByWorkOrderApproved")}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 border-warning text-warning-foreground hover:bg-warning/20"
        onClick={() => { allowNextNavigation(); navigate(`/work-orders/${worksheet.wo_id}`); }}
      >
        {t("workMatrix.goToWorkOrder")}
      </Button>
    </AlertDescription>
  </Alert>
)}
```

`linkedWOStatus` is already defined on line 191. No new imports needed (Button, Alert, Lock are all in scope).

### 2. `src/locales/es.json` -- workMatrix block

**Remove:**
```json
"lockedByWorkOrder": "Esta matriz está bloqueada porque la Orden de Trabajo vinculada está pendiente de aprobación o aprobada. Use el botón Retirar en la Orden de Trabajo para desbloquear."
```

**Add (after `lockedByWorkOrderTitle`):**
```json
"lockedByWorkOrderPending": "Esta matriz está bloqueada porque la Orden de Trabajo vinculada está pendiente de aprobación. Para desbloquearla, use el botón \"Retirar de Aprobación\" en la Orden de Trabajo.",
"lockedByWorkOrderApproved": "Esta matriz está bloqueada porque la Orden de Trabajo vinculada fue aprobada. Para desbloquearla, la OT debe cambiar de estado.",
"goToWorkOrder": "Ir a Orden de Trabajo"
```

Note: The Pending message now references "Retirar de Aprobacion" exactly as the WO button label reads (`workOrders.unsubmit` = `"Retirar de Aprobación"`).

### 3. `src/locales/en.json` -- workMatrix block

**Remove:**
```json
"lockedByWorkOrder": "This worksheet is locked because the linked Work Order is pending approval or approved. Use the Unsubmit button on the Work Order to unlock."
```

**Add (after `lockedByWorkOrderTitle`):**
```json
"lockedByWorkOrderPending": "This worksheet is locked because the linked Work Order is pending approval. To unlock it, use the \"Withdraw from Approval\" button on the Work Order.",
"lockedByWorkOrderApproved": "This worksheet is locked because the linked Work Order has been approved. To unlock it, the Work Order status must be changed.",
"goToWorkOrder": "Go to Work Order"
```

### 4. `docs/CHANGELOG-2026-02-17.md`

Append:

```text
---

## BUG #0213-37: Worksheet Lock Banner — Actionable & Status-Aware

**Date:** 2026-02-18
**Priority:** Baja
**Version:** v2.0.10
**Route:** PRINCIPAL -> Ordenes de Trabajo

### Report
The worksheet lock banner mentioned a "Retirar" button that users could not see from the
worksheet page, and used the same message for both Pending_Approval and Approved statuses.

### Fix
- Banner now shows status-specific messages: Pending_Approval references "Retirar de Aprobación";
  Approved explains the WO must change status.
- Added "Ir a Orden de Trabajo" / "Go to Work Order" button inside the banner for direct navigation.
- Banner only renders for the two expected locked states (Pending_Approval, Approved).
- Removed the old combined-state i18n key `lockedByWorkOrder` (confirmed no other references).

| File | Change |
|------|--------|
| `src/pages/WorksheetEdit.tsx` | Status-aware banner with navigation button |
| `src/locales/es.json` | Split i18n keys + goToWorkOrder |
| `src/locales/en.json` | Split i18n keys + goToWorkOrder |
| `docs/CHANGELOG-2026-02-17.md` | This entry |
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/pages/WorksheetEdit.tsx` | MODIFY | Explicit status branching + navigation button in lock banner |
| `src/locales/es.json` | MODIFY | Remove `lockedByWorkOrder`, add 3 new keys |
| `src/locales/en.json` | MODIFY | Remove `lockedByWorkOrder`, add 3 new keys |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-37 changelog entry |

## Acceptance Criteria

1. Banner only appears when `linkedWOStatus` is `Pending_Approval` or `Approved`.
2. Pending banner references "Retirar de Aprobacion" (matching the actual WO button label).
3. Approved banner says "la OT debe cambiar de estado" (no mention of Retirar).
4. "Ir a Orden de Trabajo" button navigates to `/work-orders/{wo_id}` without leave-page prompt.
5. Old `lockedByWorkOrder` key is fully removed from both locale files.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Unexpected WO status hides banner | Acceptable: `isWOLocked` only triggers for these two states; other statuses should not lock the worksheet |
| Old key removal breaks something | Confirmed single reference in `WorksheetEdit.tsx` only |
| Navigation loses data | Worksheet is read-only when locked; no unsaved changes possible |

