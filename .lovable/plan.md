

# Plan_0213-41_v2: Add Missing `common.status` i18n Key for Dashboard Table Header

## Bug References

| Field | Value |
|-------|-------|
| Primary ID | 0213-41 |
| Title | Cartera tab Profitability table header shows raw key `common.status` |
| Priority | Baja |
| Route | PRINCIPAL - Panel de Control - Cartera |
| Type | UI |

| Field | Value |
|-------|-------|
| Batched ID | 0213-38 |
| Title | Practica tab Partner leaderboard header shows raw key `common.partner` |
| Status | **Already resolved** -- `common.partner` exists at line 51 in both locale files |

## Problem

The Cartera tab's "Tabla de Rentabilidad" renders the raw i18n key `common.status` as a column header because the `common` section in both locale files lacks a `status` entry. The component (`CarteraTab.tsx` line 362) correctly calls `t('common.status')`, but i18next falls back to the key string.

**BUG #0213-38 note:** CODEX requested batching `common.partner`, but this key already exists at line 51 in both `es.json` ("Socio") and `en.json` ("Partner"). If the tester still sees the raw key, it would be a different issue (caching, build artifact). No locale change needed for 0213-38.

## Root Cause

The `common` object (lines 11-59 in both locale files) does not contain a `status` key. The word "Estado"/"Status" exists in many other sections (`tracker.status`, `engagement.status`, `staff.status`, etc.) but not under `common`.

## Solution

Add `"status": "Estado"` / `"Status"` to the `common` section in both locale files. No component code changes needed -- `CarteraTab.tsx` already references `t('common.status')` correctly.

## Changes

### 1. `src/locales/es.json`

Add one key to the `common` object (after line 59, before the closing brace):

```json
"saveError": "Error al guardar los cambios. Intente nuevamente.",
"status": "Estado"
```

### 2. `src/locales/en.json`

Same addition to the `common` object (after line 59):

```json
"saveError": "Error saving changes. Please try again.",
"status": "Status"
```

### 3. `docs/CHANGELOG-2026-02-17.md`

Append:

```text
---

## BUG #0213-41: Add Missing common.status i18n Key

**Date:** 2026-02-18
**Priority:** Baja
**Version:** v2.0.10
**Route:** PRINCIPAL -> Panel de Control -> Cartera

### Report
The last column header in the "Tabla de Rentabilidad" on the Cartera tab displayed
the raw key `common.status` instead of the translated word "Estado" / "Status".

### Root Cause
The `common` section in both locale files did not contain a `status` key.
`t('common.status')` fell back to displaying the key string.

### Fix
Added `"status": "Estado"` / `"Status"` to the `common` section in both locale files.
Purely additive i18n key; no component code changes.

**Note on BUG #0213-38:** `common.partner` already existed in both locale files.
No change needed.

| File | Change |
|------|--------|
| `src/locales/es.json` | Added `common.status` = "Estado" |
| `src/locales/en.json` | Added `common.status` = "Status" |
| `docs/CHANGELOG-2026-02-17.md` | This entry |
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/locales/es.json` | MODIFY | Add `"status": "Estado"` to `common` section |
| `src/locales/en.json` | MODIFY | Add `"status": "Status"` to `common` section |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-41 changelog entry |

## Acceptance Criteria

1. Cartera tab Profitability table last column header shows "Estado" (ES) / "Status" (EN), not `common.status`.
2. Practica tab Partner leaderboard header shows "Socio" (ES) / "Partner" (EN) (already working -- regression check only).
3. Switching language ES/EN updates both headers correctly.
4. No other translations are affected.

## Test Checklist

- TC-01 (0213-41): Panel de Control -> Cartera -> Tabla de Rentabilidad -> last header shows "Estado" (ES) / "Status" (EN).
- TC-02 (0213-38): Panel de Control -> Practica -> Tabla de Socios -> header shows "Socio" (ES) / "Partner" (EN) -- confirm already working.
- TC-03: Switch language ES/EN and verify both headers update correctly.
- TC-04: Regression sanity -- table cell values still render normally.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Key collision | No existing `common.status` key; verified in both files |
| Other code using `common.status` | Any other references will now resolve correctly (net positive) |
| Purely additive change | Zero risk of breaking existing translations |

