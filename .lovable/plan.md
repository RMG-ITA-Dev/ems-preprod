
# Plan_0213-33_v3: Block Timesheet Submission When Weekly Hour Limit Is Exceeded

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-33 |
| Title | El sistema permite enviar hojas de tiempo con total de horas mayor al limite semanal |
| Priority | Media |
| Route | OPERACIONES - Hoja de Tiempo |

## What Changed from v2

Two mandatory tweaks applied:

| Tweak | Description |
|-------|-------------|
| #1 Numeric coercion | Use `Number()` on `hours_logged` and `weeklyLimit` to prevent string concatenation bugs |
| #2 Alert eligibility | Mirror full base-eligibility checks in alert condition so it only shows when the user would otherwise be able to submit |

Plus one minor polish: use `isWeeklyLimitExceeded` in the `handleSubmit` guard for consistency.

## Changes

### 1. `src/pages/TimeSheet.tsx`

**A. Add `weeklyGrandTotal` and `isWeeklyLimitExceeded`** (after `weeklyLimit` memo, around line 57):

```typescript
const weeklyGrandTotal = useMemo(() => {
  return entries.reduce((sum, e) => sum + Number(e.hours_logged ?? 0), 0);
}, [entries]);

const isWeeklyLimitExceeded = weeklyGrandTotal > Number(weeklyLimit);
```

**B. Gate `canSubmit`** (line 231): append `&& !isWeeklyLimitExceeded`:

```typescript
const canSubmit = !isBeforeHireDate && isWithinEditableWindow && entries.length > 0 &&
  !isSubmitted && !period?.is_period_locked && !isWeeklyLimitExceeded;
```

**C. Add hard guard inside `handleSubmit`** (line 236, after the opening brace, before the existing `if (!period...)` check):

```typescript
// DEFENSE-IN-DEPTH: weekly limit guard (do NOT rely only on canSubmit)
if (isWeeklyLimitExceeded) return;
```

**D. Add inline alert** (after the "no engagements" alert block, around line 390). Uses full base-eligibility condition so it only appears when the user would otherwise be able to submit:

```typescript
{isWeeklyLimitExceeded &&
  !isBeforeHireDate &&
  isWithinEditableWindow &&
  entries.length > 0 &&
  !isSubmitted &&
  !period?.is_period_locked && (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        {t("timesheet.cannotSubmitWeeklyLimit", {
          total: weeklyGrandTotal.toFixed(1),
          limit: weeklyLimit,
        })}
      </AlertDescription>
    </Alert>
)}
```

### 2. `src/locales/en.json`

Inside the `"timesheet"` block, add:

```json
"cannotSubmitWeeklyLimit": "Cannot submit: total hours ({{total}}h) exceed the weekly limit ({{limit}}h). Please reduce hours before submitting."
```

### 3. `src/locales/es.json`

Inside the `"timesheet"` block, add:

```json
"cannotSubmitWeeklyLimit": "No se puede enviar: el total de horas ({{total}}h) excede el límite semanal ({{limit}}h). Reduzca las horas antes de enviar."
```

### 4. `docs/CHANGELOG-2026-02-17.md`

Append a new entry for BUG #0213-33 documenting both enforcement layers (UI gating + handleSubmit guard) and the numeric coercion safety measure.

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/pages/TimeSheet.tsx` | MODIFY | Add `weeklyGrandTotal` (with `Number()` coercion), `isWeeklyLimitExceeded`, gate `canSubmit`, add early-return guard in `handleSubmit`, add inline alert with full eligibility condition |
| `src/locales/en.json` | MODIFY | Add `timesheet.cannotSubmitWeeklyLimit` |
| `src/locales/es.json` | MODIFY | Add `timesheet.cannotSubmitWeeklyLimit` |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-33 changelog entry |

## Acceptance Criteria

1. When `weeklyGrandTotal > weeklyLimit`, the "Enviar Semana" button is disabled.
2. A red destructive alert is shown only when the limit is exceeded AND the user would otherwise be eligible to submit (all base checks pass).
3. Even if `handleSubmit` is triggered programmatically, submission is blocked (early return via `isWeeklyLimitExceeded`).
4. Once hours are reduced to within the limit, the button re-enables and the alert disappears.
5. `Number()` coercion prevents string concatenation bugs regardless of DB column type.
6. No daily-limit validation on submit. No "submit anyway" override dialog.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Client-side only | Sufficient for this priority; server guard is future scope |
| Entries array empty | `reduce` on empty returns 0; `canSubmit` already checks `entries.length > 0` |
| `hours_logged` as string | `Number()` coercion handles it safely |
| Alert showing in irrelevant states | Full eligibility condition prevents it |
