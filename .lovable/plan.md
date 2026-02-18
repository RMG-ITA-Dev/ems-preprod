# Plan_0213-43_v4: Localize Zod Validation Messages in StaffForm

## Bug Reference


| Field    | Value                                                  |
| -------- | ------------------------------------------------------ |
| ID       | 0213-43                                                |
| Title    | Cambiar títulos a español                              |
| Priority | Baja                                                   |
| Route    | ADMINISTRACION - Personal - Nuevo Miembro del Personal |
| Type     | Datos / i18n                                           |


## Problem

Validation error messages on the Staff form appear in English ("Last name is required", "City is required", etc.) even when the UI is set to Spanish.

## Root Cause

Zod schema defined at module level (line 44) with hardcoded English strings. No access to `t()` at schema creation time.

## v4 Changes Over v3


| Item           | v3                | v4                                                              |
| -------------- | ----------------- | --------------------------------------------------------------- |
| `useMemo` deps | `[i18n.language]` | `[t, i18n.language]` -- lint-safe, no ESLint suppression needed |


All other items from v3 remain unchanged (approved by CODEX).

&nbsp;

Comments



1. `TFunction` **import placement**
  - Fine as written. If your codebase already imports types elsewhere, keep style consistent.
2. **Locale JSON placement**
  - Ensure `"validation"` is added at the **top level** with correct commas/braces (your plan states this, just reinforcing).
3. **Changelog accuracy**
  - Looks good and matches the fix.

## Changes

### 1. `src/components/forms/StaffForm.tsx`

**a) Update imports** (line 1):

From:

```typescript
import { useEffect } from "react";
```

To:

```typescript
import { useEffect, useMemo } from "react";
```

**b) Add TFunction import** (after line 5):

```typescript
import type { TFunction } from "i18next";
```

**c) Replace static schema with factory function** (lines 44-58):

From:

```typescript
const formSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  short_name: z.string().optional(),
  initials: z.string().max(4, "Max 4 characters").optional(),
  email: z.string().min(1, "Email is required").email("Invalid email"),
  category_id: z.string().min(1, "Category is required"),
  city: z.string().min(1, "City is required"),
  id_number: z.string().min(1, "ID number is required"),
  aud_reg_number: z.string().optional(),
  hire_date: z.string().min(1, "Hire date is required"),
  is_active: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;
```

To:

```typescript
const createFormSchema = (t: TFunction) =>
  z.object({
    first_name: z.string().min(1, t("validation.firstNameRequired")),
    last_name: z.string().min(1, t("validation.lastNameRequired")),
    short_name: z.string().optional(),
    initials: z.string().max(4, t("validation.initialsMax4")).optional(),
    email: z.string().min(1, t("validation.emailRequired")).email(t("validation.emailInvalid")),
    category_id: z.string().min(1, t("validation.categoryRequired")),
    city: z.string().min(1, t("validation.cityRequired")),
    id_number: z.string().min(1, t("validation.idNumberRequired")),
    aud_reg_number: z.string().optional(),
    hire_date: z.string().min(1, t("validation.hireDateRequired")),
    is_active: z.boolean(),
  });

type FormSchema = ReturnType<typeof createFormSchema>;
type FormData = z.infer<FormSchema>;
```

**d) Update component internals** (lines 114-124):

From:

```typescript
export function StaffForm({ staff, onDirtyChange, onCancel, onSaveSuccess }: StaffFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isEdit = !!staff;
  const { data: categories } = useCategories();
  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const deleteMutation = useDeleteStaff();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
```

To:

```typescript
export function StaffForm({ staff, onDirtyChange, onCancel, onSaveSuccess }: StaffFormProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isEdit = !!staff;
  const { data: categories } = useCategories();
  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();
  const deleteMutation = useDeleteStaff();

  const formSchema = useMemo(() => createFormSchema(t), [t, i18n.language]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
```

### 2. `src/locales/es.json`

Add new top-level `validation` section:

```json
"validation": {
  "firstNameRequired": "El nombre es requerido",
  "lastNameRequired": "El apellido es requerido",
  "emailRequired": "El correo electrónico es requerido",
  "emailInvalid": "Correo electrónico inválido",
  "categoryRequired": "La categoría es requerida",
  "cityRequired": "La ciudad es requerida",
  "idNumberRequired": "El número de CI es requerido",
  "hireDateRequired": "La fecha de ingreso es requerida",
  "initialsMax4": "Máximo 4 caracteres"
}
```

### 3. `src/locales/en.json`

Add same `validation` section:

```json
"validation": {
  "firstNameRequired": "First name is required",
  "lastNameRequired": "Last name is required",
  "emailRequired": "Email is required",
  "emailInvalid": "Invalid email",
  "categoryRequired": "Category is required",
  "cityRequired": "City is required",
  "idNumberRequired": "ID number is required",
  "hireDateRequired": "Hire date is required",
  "initialsMax4": "Max 4 characters"
}
```

### 4. `docs/CHANGELOG-2026-02-17.md`

Append:

```text
---

## BUG #0213-43: Localize Validation Messages in Staff Form

**Date:** 2026-02-18
**Priority:** Baja
**Version:** v2.0.10
**Route:** ADMINISTRACION -> Personal -> Nuevo Miembro del Personal

### Report
Required-field validation errors appeared in English even when the UI was set to
Spanish. The tester flagged messages like "Last name is required" under "Apellido *".

### Root Cause
Zod schema was defined at module level with hardcoded English strings. No access
to the `t()` translation function at schema creation time.

### Fix
1. Converted static schema to factory function `createFormSchema(t: TFunction)`.
2. Schema built inside component with `useMemo(() => createFormSchema(t), [t, i18n.language])`.
3. Two-step type alias: `type FormSchema = ReturnType<typeof createFormSchema>; type FormData = z.infer<FormSchema>;`
4. Added `validation` section with 9 keys to both `es.json` and `en.json`.

**Note:** Other forms (EngagementForm, ClientForm, CategoryForm, etc.) have the
same pattern and should be addressed in a follow-up ticket.

| File | Change |
|------|--------|
| `src/components/forms/StaffForm.tsx` | Schema factory + useMemo + TFunction typing |
| `src/locales/es.json` | Added `validation` section (9 Spanish messages) |
| `src/locales/en.json` | Added `validation` section (9 English messages) |
| `docs/CHANGELOG-2026-02-17.md` | This entry |
```

## Files Summary


| File                                 | Action | Description                                 |
| ------------------------------------ | ------ | ------------------------------------------- |
| `src/components/forms/StaffForm.tsx` | MODIFY | Schema factory + useMemo + TFunction typing |
| `src/locales/es.json`                | MODIFY | Add `validation` section (9 keys)           |
| `src/locales/en.json`                | MODIFY | Add `validation` section (9 keys)           |
| `docs/CHANGELOG-2026-02-17.md`       | MODIFY | Append BUG #0213-43 entry                   |


## Acceptance Criteria

1. Spanish UI: all Staff form validation errors appear in Spanish.
2. English UI: all Staff form validation errors appear in English.
3. Form submission with valid data works normally.
4. Editing existing staff loads and saves correctly.

## Test Checklist

- TC-01: Set language to Spanish, open Nuevo Miembro del Personal, submit empty -- all messages in Spanish.
- TC-02: Verify: "El apellido es requerido", "El correo electrónico es requerido", "La ciudad es requerida", "El número de CI es requerido", "La categoría es requerida", "La fecha de ingreso es requerida".
- TC-03: Enter invalid email -- shows "Correo electrónico inválido" (ES).
- TC-04: Enter initials > 4 chars -- shows "Máximo 4 caracteres" (ES).
- TC-05: Set language to English, submit empty -- all messages in English.
- TC-06: Fill all fields correctly, submit -- staff created successfully.

## Systemic Note

This fix addresses StaffForm only. Other forms (EngagementForm, ClientForm, CategoryForm, ActivityCodeForm, IndustryForm) have the same hardcoded pattern and should be addressed in a follow-up ticket using the same `createFormSchema(t)` + `useMemo` approach established here.

## Risk Assessment


| Risk                                   | Mitigation                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `useMemo` staleness on language switch | `[t, i18n.language]` deps ensure rebuild; lint-safe                          |
| Type safety of `FormData`              | Two-step alias `FormSchema` then `FormData` avoids TS ambiguity              |
| JSON validity in locale files          | New `validation` key added at top level; no existing key conflict (verified) |
| Other forms still English              | Out of scope; follow-up ticket recommended                                   |
