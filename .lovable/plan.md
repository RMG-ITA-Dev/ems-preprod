

# Plan_0213-35_v1: Make Adjustment Field Visually Identifiable as Editable

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-35 |
| Title | El campo Ajuste no es visualmente identificable como un campo de entrada editable |
| Priority | Baja |
| Route | PRINCIPAL - Ordenes de Trabajo |

## Problem

In the Work Order form summary section, the Adjustment (`NumericInput`) field uses `border-0 bg-transparent` classes, making it visually indistinguishable from the static text rows around it (e.g., "Honorario Standard", "% Realizacion"). Users cannot tell it is an editable input.

## Root Cause

Line 471 of `WorkOrderForm.tsx`:

```
"w-24 text-right h-8 font-mono border-0 bg-transparent px-0 ..."
```

The `border-0` and `bg-transparent` classes strip all visual affordance from the input.

## Solution

Replace the transparent/borderless styling with a subtle but visible input style **when the field is editable** (`isEditable === true`). When locked (`!isEditable`), keep the current transparent look since it is read-only.

This gives the user a clear visual cue (border + slight background) that the field accepts input, while maintaining the clean summary appearance when the Work Order is locked/approved.

## Changes

### 1. `src/components/forms/WorkOrderForm.tsx`

**Modify the NumericInput className** (lines 470-473):

Replace:
```typescript
className={cn(
  "w-24 text-right h-8 font-mono border-0 bg-transparent px-0 !text-[length:inherit] focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0",
  adjustmentAmount < 0 && "text-destructive"
)}
```

With:
```typescript
className={cn(
  "w-24 text-right h-8 font-mono !text-[length:inherit]",
  isEditable
    ? "border border-input bg-background px-2 rounded-md focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
    : "border-0 bg-transparent px-0",
  adjustmentAmount < 0 && "text-destructive"
)}
```

When editable: standard input border (`border-input`), background (`bg-background`), padding, and rounded corners -- matching the project's `Input` component styling.

When locked: transparent and borderless as before.

### 2. `docs/CHANGELOG-2026-02-17.md`

Append entry for BUG #0213-35.

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/forms/WorkOrderForm.tsx` | MODIFY | Conditional styling on Adjustment NumericInput: visible border when editable, transparent when locked |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-35 changelog entry |

## Acceptance Criteria

1. In Draft mode (editable), the Adjustment field displays with a visible border and background, clearly distinguishable as an input.
2. In locked/approved mode, the field remains transparent and borderless (read-only appearance).
3. Negative values still render in red (`text-destructive`).
4. No other summary row styling is affected.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Style mismatch with other inputs | Uses same semantic tokens as the project's `Input` component (`border-input`, `bg-background`) |
| Visual regression when locked | Conditional class: locked state retains existing `border-0 bg-transparent` |

