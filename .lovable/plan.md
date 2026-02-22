# Plan_0220-18_v5: Prevent Duplicate Client Names (UI fix + DB constraint + mutation handler)

**Session**: 260222_EMS2.0.5_Debugg_Session
**Bug ID**: 0220-18
**Priority**: Baja
**Version**: v2.0.5
**Route**: PRINCIPAL - Clientes
**Previous version**: Plan_0220-18_v4

---

## Session Rules (Active for 260222 Session)

1. All plans use versioned naming: `Plan_MMDD-NN_vX`
2. Every implementation must append documentation to `docs/CHANGELOG-2026-02-22.md`

---

## Changes from v4 (CODEX Corrections Applied)


| #   | CODEX Directive                                                                    | Action Taken                                                                                             |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| F1  | Spanish accent still missing: "conexion" must be "conexion"                        | Fixed: ES string now reads `"problema de conexión"` with proper accent                                   |
| F2  | Layer 2 constraint matching should prefer structured fields over message substring | Added robustness: code will check `err.constraint` first, then fall back to `err.message?.includes(...)` |


---

## Problem

When creating or editing a client, the system allows saving duplicate client names. Screenshot shows multiple "PETROBRAS" entries with different NITs, which should not be permitted.

## Root Cause

1. **Frontend `maybeSingle()` footgun**: The duplicate-name check query uses `maybeSingle()`. When more than one row matches, `maybeSingle()` returns an error and `data` becomes `null`. Since the code only checks `if (existingByName)`, duplicates slip through silently.
2. **No DB-level unique constraint** on normalized `client_legal_name`, so concurrent saves or direct inserts can bypass the UI check entirely.
3. **Update mutation** uses the generic `createMutationErrorHandler` instead of `handleClientError`, so DB-level duplicate name violations produce an unhelpful generic error message.
4. **Existing `handleClientError**` uses brittle `message.includes("unique_tax_id")` substring matching instead of constraint name matching.

---

## Solution

### Layer 0: Fix Frontend Duplicate-Name Check (remove maybeSingle() footgun)

**File**: `src/components/forms/ClientForm.tsx`

**Changes to `onSubmit` function**:

1. Normalize the name before any checks:
  ```ts
   const trimmedName = data.client_legal_name.trim();
  ```
2. **NIT check**: Replace `.maybeSingle()` with `.limit(1)`:
  ```ts
   const { data: existingByNit, error: nitError } = await supabase
     .from("clients")
     .select("client_id, client_legal_name")
     .eq("unique_tax_id", data.unique_tax_id)
     .neq("client_id", client?.client_id || "")
     .limit(1);

   if (nitError) {
     toast.error(t("errors.duplicateCheckFailed"));
     return;
   }
   if (existingByNit && existingByNit.length > 0) {
     toast.error(t("errors.duplicateNit", { nit: data.unique_tax_id, name: existingByNit[0].client_legal_name }));
     return;
   }
  ```
3. **Name check**: Replace `.maybeSingle()` with `.limit(1)`, using `.ilike()` on already-trimmed input:
  ```ts
   const { data: existingByName, error: nameError } = await supabase
     .from("clients")
     .select("client_id, unique_tax_id")
     .ilike("client_legal_name", trimmedName)
     .neq("client_id", client?.client_id || "")
     .limit(1);

   if (nameError) {
     toast.error(t("errors.duplicateCheckFailed"));
     return;
   }
   if (existingByName && existingByName.length > 0) {
     toast.error(t("errors.duplicateClientNameWithNit", { nit: existingByName[0].unique_tax_id }));
     return;
   }
  ```
   **Note**: UI check is best-effort; the DB constraint (`LOWER(TRIM(...))`) is the source of truth for normalization.
4. **Use trimmed name in save payload**:
  ```ts
   const payload = {
     client_legal_name: trimmedName,
     // ... rest unchanged
   };
  ```

### Layer 0B: i18n Updates

**Files**: `src/locales/en.json`, `src/locales/es.json`

**New keys**:


| Key                                 | EN                                                                                              | ES                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `errors.duplicateCheckFailed`       | `"We couldn't check for duplicate client names (connection issue). Please try again."`          | `"No pudimos verificar si el nombre del cliente ya existe (problema de conexión). Intente nuevamente."` |
| `errors.duplicateClientNameWithNit` | `"A client with this name already exists (NIT: {{nit}}). Please verify it is not a duplicate."` | `"El nombre de cliente ya existe (NIT: {{nit}})."`                                                      |


**Updated keys** (remove `{{nit}}` dependency so DB fallback renders cleanly):


| Key                          | EN (new)                                    | ES (new)                            |
| ---------------------------- | ------------------------------------------- | ----------------------------------- |
| `errors.duplicateClientName` | `"A client with this name already exists."` | `"El nombre de cliente ya existe."` |


### Layer 1: Database Constraint (safety net)

**File**: Database migration

```sql
-- Pre-check (run manually on Live before publishing):
-- SELECT LOWER(TRIM(client_legal_name)) AS norm_name, COUNT(*)
-- FROM public.clients
-- WHERE client_legal_name IS NOT NULL
-- GROUP BY LOWER(TRIM(client_legal_name))
-- HAVING COUNT(*) > 1;
--
-- Result on Test DB: zero duplicates. Safe to apply.

CREATE UNIQUE INDEX clients_client_legal_name_unique
ON public.clients (LOWER(TRIM(client_legal_name)));
```

### Layer 2: Mutation Error Handler (structured constraint matching with message fallback)

**File**: `src/hooks/mutations/useClientMutations.ts`

Replace current `handleClientError` with robust constraint matching that prefers structured fields:

```ts
function handleClientError(error: Error, operation: string) {
  const err = error as unknown as {
    code?: string;
    message?: string;
    constraint?: string;
    details?: string;
  };

  if (err.code === "23505") {
    // Prefer err.constraint when available; fall back to message.includes()
    const constraintName = err.constraint || err.message || "";

    if (constraintName.includes("clients_client_legal_name_unique")) {
      toast.error(i18n.t("errors.duplicateClientName"));
      return;
    }
    if (constraintName.includes("clients_unique_tax_id_key")) {
      toast.error(i18n.t("errors.duplicateNit"));
      return;
    }
  }

  createMutationErrorHandler(operation)(error);
}
```

**Robustness note**: Supabase JS typically includes the constraint/index name in `message`. The code checks `err.constraint` first (if the error shape includes it), then falls back to `message.includes(...)`. This ensures compatibility if the error shape changes across Supabase versions.

Change `useUpdateClient` `onError`:

```ts
// FROM:
onError: createMutationErrorHandler("updating client"),
// TO:
onError: (error) => handleClientError(error, "updating client"),
```

### Layer 3: Changelog Documentation

**File**: `docs/CHANGELOG-2026-02-22.md` (CREATE)

Append entry for 0220-18 with standardized format (Problem, Root Cause, Solution, Files Modified, Risk Assessment).

---

## Files Modified


| File                                        | Action | Description                                                                                                                                                                |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/forms/ClientForm.tsx`       | EDIT   | Replace `maybeSingle()` with `.limit(1)` on NIT and name checks; add error handling; trim name; use `toast.error`; use `duplicateClientNameWithNit` key                    |
| `src/locales/en.json`                       | EDIT   | Add `duplicateCheckFailed` and `duplicateClientNameWithNit`; simplify `duplicateClientName` (remove nit)                                                                   |
| `src/locales/es.json`                       | EDIT   | Add `duplicateCheckFailed` and `duplicateClientNameWithNit`; simplify `duplicateClientName`; fix accent on "conexion"                                                      |
| Database migration                          | CREATE | Unique index on `LOWER(TRIM(client_legal_name))`                                                                                                                           |
| `src/hooks/mutations/useClientMutations.ts` | EDIT   | Structured constraint matching (`err.constraint` first, `message` fallback) in `handleClientError`; use generic `duplicateClientName` (no nit); apply to `useUpdateClient` |
| `docs/CHANGELOG-2026-02-22.md`              | CREATE | Session changelog with 0220-18 entry                                                                                                                                       |


---

## Acceptance Tests

1. Create client "PETROBRAS" -- save OK (if first instance).
2. Create client " petrobras " (spaces + different case) -- blocked with `errors.duplicateClientNameWithNit`.
3. Edit another client and change name to "PETROBRAS" -- blocked with `errors.duplicateClientNameWithNit`.
4. Simulate DB unique violation (23505) by bypassing UI -- UI shows `errors.duplicateClientName` (without nit, renders cleanly).
5. If duplicate-check query fails (forced network error), UI shows `errors.duplicateCheckFailed` and does not save.
6. Spanish locale shows "El nombre de cliente ya existe." for DB fallback and "El nombre de cliente ya existe (NIT: ...)." for UI pre-check.
7. Spanish `duplicateCheckFailed` renders with proper accent: "problema de conexión".

---

## Risk Assessment


| Risk                                                                    | Level | Mitigation                                                                                                         |
| ----------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| Existing duplicate names in production                                  | None  | Verified: zero duplicates in current DB. Pre-check query included in migration comments for Live verification.     |
| Index creation lock time                                                | None  | `clients` table is small (< 100 rows); standard CREATE INDEX completes in milliseconds.                            |
| `maybeSingle()` to `.limit(1)` changes return type from object to array | Low   | All consuming code updated in the same change; no external callers.                                                |
| NIT constraint name assumption (`clients_unique_tax_id_key`)            | Low   | Postgres auto-generated name for existing unique constraint on `unique_tax_id`. Will verify before implementation. |
| UI check vs DB normalization gap (internal extra spaces)                | Low   | Documented as best-effort; DB constraint is authoritative.                                                         |
| `err.constraint` field availability                                     | Low   | Code checks `err.constraint` first, falls back to `err.message`; works regardless of Supabase error shape.         |
