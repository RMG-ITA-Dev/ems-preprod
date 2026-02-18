

# Plan_0213-39_v2: Fix Status Tooltip Key Mapping for Work Orders

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-39 |
| Title | La bandera que identifica el estado de la Orden de Trabajo deberia estar en espanol |
| Priority | Baja |
| Route | PRINCIPAL - Ordenes de Trabajo |
| Base Plan | Plan_0213-39_v1 (with CODEX tweak for safer fallback) |

## Problem

In the Work Orders list page, hovering over the status dot for a `Pending_Approval` work order shows raw i18n keys (`workOrders.status.pendingapproval`) instead of translated text, because dynamic key construction via `.toLowerCase().replace("_", "")` produces the wrong suffix.

## Changes from v1

**CODEX tweak**: The fallback in v1 was `statusI18nKey[status] || status`, which would pass raw DB values like `On_Hold` directly into the i18n key. Updated to `statusI18nKey[status] ?? status.toLowerCase()` so unknown statuses at least get a lowercased key, which has a better chance of matching.

## Changes

### 1. `src/pages/WorkOrders.tsx`

**Add mapping constant** (near `statusDotColors`, around line 43):

```typescript
const statusI18nKey: Record<string, string> = {
  Draft: "draft",
  Pending_Approval: "pending",
  Approved: "approved",
  Rejected: "rejected",
};
```

**Update lines 688-689** from:

```typescript
<p className="font-medium">{t(`workOrders.status.${status.toLowerCase().replace("_", "")}`)}</p>
<p className="text-xs text-muted-foreground">{t(`workOrders.statusTooltip.${status.toLowerCase().replace("_", "")}`)}</p>
```

to:

```typescript
{(() => { const key = statusI18nKey[status] ?? status.toLowerCase(); return (
  <>
    <p className="font-medium">{t(`workOrders.status.${key}`)}</p>
    <p className="text-xs text-muted-foreground">{t(`workOrders.statusTooltip.${key}`)}</p>
  </>
); })()}
```

Or equivalently, compute `key` once before the JSX return and use it in both lines. The exact implementation will follow whichever pattern reads cleanest in context.

### 2. `docs/CHANGELOG-2026-02-17.md`

Append:

```text
---

## BUG #0213-39: Fix Status Tooltip Key Mapping for Work Orders

**Date:** 2026-02-18
**Priority:** Baja
**Version:** v2.0.10
**Route:** PRINCIPAL -> Ordenes de Trabajo

### Report
Hovering over the status dot for a Pending_Approval work order showed raw i18n keys
(`workOrders.status.pendingapproval`) instead of the translated text ("Pendiente Aprobacion").

### Root Cause
Dynamic key construction used `.toLowerCase().replace("_", "")`, which turned
`Pending_Approval` into `pendingapproval` instead of the correct key `pending`.

### Fix
Added a `statusI18nKey` lookup map to correctly map database status values to their
i18n key suffixes. Fallback uses `status.toLowerCase()` for unknown statuses.
No locale file changes needed.

| File | Change |
|------|--------|
| `src/pages/WorkOrders.tsx` | Added `statusI18nKey` map; updated tooltip key references |
| `docs/CHANGELOG-2026-02-17.md` | This entry |
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/pages/WorkOrders.tsx` | MODIFY | Add `statusI18nKey` map + fix tooltip key lookup with safe fallback |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-39 changelog entry |

## Acceptance Criteria

1. Hovering the status dot for a `Pending_Approval` WO shows "Pendiente Aprobacion" (es) / "Pending Approval" (en).
2. Tooltip description shows the full text from `statusTooltip.pending`.
3. All other statuses (Draft, Approved, Rejected) continue to display correctly.
4. Unknown future statuses fall back to `status.toLowerCase()` instead of raw DB values.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Unknown status still produces bad key | `toLowerCase()` fallback is best-effort; renders key string rather than crashing |
| Other places use same pattern | Searched codebase; this is the only instance of this dynamic key construction for WO statuses |

