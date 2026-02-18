# Plan_0213-42_v2: Make Hire Date Required on Staff Form

## Bug Reference


| Field    | Value                                                  |
| -------- | ------------------------------------------------------ |
| ID       | 0213-42                                                |
| Title    | Fecha de ingreso en blanco                             |
| Priority | Baja                                                   |
| Route    | ADMINISTRACION - Personal - Nuevo Miembro del Personal |
| Type     | Funcional                                              |


## Problem

The "Fecha de Ingreso" (Hire Date) field on the Staff form is optional, but business rules require it to be mandatory. The field gates timesheet entry restrictions (the helper text itself says "Restringe la carga de hojas de tiempo"). Without a hire date, the timesheet date-gating logic cannot function.

## Root Cause

In `src/components/forms/StaffForm.tsx`, the Zod schema defines `hire_date` as:

```typescript
hire_date: z.string().optional().or(z.literal("")),
```

The label lacks the `*` required indicator that all other mandatory fields display.

## Solution

Two changes in `StaffForm.tsx`: make `hire_date` required in the Zod schema and add the asterisk to the label. No component-level i18n for the validation message is needed because the existing codebase pattern uses hardcoded English strings in Zod (e.g., `"First name is required"`, `"City is required"`) -- these are shown via `<FormMessage />` which renders Zod's error string directly.

**DB hardening (NOT NULL constraint)** is noted as a recommended follow-up task but is out of scope for this bug. Existing staff with NULL hire_date will be prompted to fill it on their next edit, which is desirable forced cleanup.

## Changes

### 1. `src/components/forms/StaffForm.tsx`

**a) Update Zod schema** (line 54):

From:

```typescript
hire_date: z.string().optional().or(z.literal("")),
```

To:

```typescript
hire_date: z.string().min(1, "Hire date is required"),
```

**b) Add asterisk to label** (line 413):

From:

```tsx
<FormLabel>{t("staff.hireDate")}</FormLabel>
```

To:

```tsx
<FormLabel>{t("staff.hireDate")} *</FormLabel>
```

###  Ensure the date input actually writes a non-empty **string**

Your schema enforces `string().min(1)`. That’s perfect **if** the date picker stores `"YYYY-MM-DD"` or similar in the form state.  
If the date picker stores a `Date` object (or `undefined`) you’d need `z.date()` / preprocess. Your plan assumes string (consistent with the existing code), so just double-check that the current `hire_date` field is indeed a string in `react-hook-form`.

### 2) Keep changelog wording consistent with product naming

Minor: your changelog route says `ADMINISTRACION -> Personal -> Nuevo Miembro del Personal`. That’s fine; just keep accenting consistent elsewhere if you do (ADMINISTRACIÓN).

### 2. `docs/CHANGELOG-2026-02-17.md`

Append:

```text
---

## BUG #0213-42: Make Hire Date Required on Staff Form

**Date:** 2026-02-18
**Priority:** Baja
**Version:** v2.0.10
**Route:** ADMINISTRACION -> Personal -> Nuevo Miembro del Personal

### Report
The "Fecha de Ingreso" (Hire Date) field was optional, allowing staff to be created
without a hire date. Business rules require it because hire_date gates timesheet
entry restrictions.

### Root Cause
Zod schema defined `hire_date` as `z.string().optional().or(z.literal(""))`. The
label lacked the `*` required indicator.

### Fix
1. Changed Zod validation to `z.string().min(1, "Hire date is required")`.
2. Added `*` to the form label.
Existing staff with NULL hire_date will be prompted to fill it on next edit
(intentional forced cleanup).

**Note:** DB-level NOT NULL constraint recommended as a follow-up task.

| File | Change |
|------|--------|
| `src/components/forms/StaffForm.tsx` | Made `hire_date` required in Zod schema; added `*` to label |
| `docs/CHANGELOG-2026-02-17.md` | This entry |
```

## Files Summary


| File                                 | Action | Description                                               |
| ------------------------------------ | ------ | --------------------------------------------------------- |
| `src/components/forms/StaffForm.tsx` | MODIFY | Make `hire_date` required in Zod schema; add `*` to label |
| `docs/CHANGELOG-2026-02-17.md`       | MODIFY | Append BUG #0213-42 changelog entry                       |


## Acceptance Criteria

1. New Staff form: "Fecha de Ingreso" label shows `*`.
2. Submitting without a hire date shows a validation error.
3. Submitting with a valid date works normally.
4. Editing existing staff with a hire date loads and saves correctly.
5. Editing legacy staff with NULL hire_date: field is empty, user must fill it before saving (forced cleanup -- intentional).

## Test Checklist

- TC-01: Open "Nuevo Miembro del Personal" -- "Fecha de Ingreso" label shows asterisk (*).
- TC-02: Fill all required fields except Fecha de Ingreso -- click Save -- validation error appears.
- TC-03: Fill Fecha de Ingreso -- click Save -- staff created successfully.
- TC-04: Open existing staff with hire_date set -- field displays correctly, can be modified and saved.
- TC-05: If any legacy staff has NULL hire_date -- edit shows empty field, must fill before saving.

## Risk Assessment


| Risk                                 | Mitigation                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Legacy NULL hire_date blocks editing | Intentional -- forces data cleanup on next edit                                      |
| Validation message in English        | Consistent with all other Zod messages in this form (e.g., "First name is required") |
| DB still allows NULL                 | Frontend enforces; DB hardening recommended as separate follow-up                    |
