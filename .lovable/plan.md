

# Plan_0213-38_v1: Add Missing i18n Key for Partner Column Header

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-38 |
| Title | El titulo de la Tabla de Socios deberia indicar el nombre de la columna Socio en espanol |
| Priority | Baja |
| Route | PRINCIPAL - Panel de Control |

## Problem

In the Dashboard's Practica tab, the Partner Leaderboard table ("Tabla de Socios") shows the raw i18n key `common.partner` as the column header instead of the translated word "Socio". This happens because the key `common.partner` does not exist in either locale file.

## Root Cause

`PracticaTab.tsx` line 448 uses `t('common.partner')`, but neither `src/locales/es.json` nor `src/locales/en.json` defines a `partner` key inside the `common` block. When react-i18next cannot find a key, it renders the key path as-is.

## Solution

Add the missing `partner` key to the `common` block in both locale files. No component code changes needed.

## Changes

### 1. `src/locales/es.json` -- common block

Add after an existing key (e.g., after `"close"`):

```json
"partner": "Socio"
```

### 2. `src/locales/en.json` -- common block

Add in the same position:

```json
"partner": "Partner"
```

### 3. `docs/CHANGELOG-2026-02-17.md`

Append:

```text
---

## BUG #0213-38: Missing i18n Key for Partner Column Header

**Date:** 2026-02-18
**Priority:** Baja
**Version:** v2.0.10
**Route:** PRINCIPAL -> Panel de Control

### Report
The Partner Leaderboard table in the Practica dashboard tab displayed the raw key
`common.partner` instead of "Socio" as the column header.

### Fix
Added the missing `common.partner` key to both locale files (es: "Socio", en: "Partner").
No component code changes required.

| File | Change |
|------|--------|
| `src/locales/es.json` | Added `common.partner` = "Socio" |
| `src/locales/en.json` | Added `common.partner` = "Partner" |
| `docs/CHANGELOG-2026-02-17.md` | This entry |
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/locales/es.json` | MODIFY | Add `"partner": "Socio"` to `common` block |
| `src/locales/en.json` | MODIFY | Add `"partner": "Partner"` to `common` block |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-38 changelog entry |

## Acceptance Criteria

1. The Partner Leaderboard column header in the Practica tab displays "Socio" (in Spanish) or "Partner" (in English) instead of the raw key.
2. No other components are affected (this is a new key, not a rename).

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Key name collides with existing key | Confirmed: no `partner` key exists under `common` in either locale file |
| Other components use `common.partner` | This is the only reference; adding the key fixes it without side effects |

