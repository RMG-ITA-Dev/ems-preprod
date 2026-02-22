# Changelog — 2026-02-22

## Session: 260222_EMS2.0.5_Debugg_Session

---

### Bug 0220-18: Prevent Duplicate Client Names

**Plan**: Plan_0220-18_v5
**Priority**: Baja
**Route**: PRINCIPAL - Clientes

#### Problem
Creating or editing a client allowed saving duplicate client names (e.g., multiple "PETROBRAS" entries with different NITs).

#### Root Cause
1. Frontend duplicate-name check used `maybeSingle()`, which silently returns `null` when multiple matches exist (PostgREST returns error for >1 row with `maybeSingle`).
2. No database-level unique constraint on normalized `client_legal_name`.
3. Update mutation used generic error handler, missing friendly duplicate-name messages.
4. Existing `handleClientError` used brittle message substring matching.

#### Solution

**Layer 0 — Frontend (`ClientForm.tsx`)**:
- Replaced `maybeSingle()` with `.limit(1)` for both NIT and name duplicate checks (returns array, avoids the >1 row footgun).
- Added `.trim()` normalization on `client_legal_name` before checks and save payload.
- Added error handling for failed duplicate-check queries (`errors.duplicateCheckFailed`).
- Name duplicates now use `errors.duplicateClientNameWithNit` key (includes NIT context).

**Layer 0B — i18n**:
- Split `errors.duplicateClientName` into two keys:
  - `errors.duplicateClientName` — no interpolation, safe for DB-level fallback.
  - `errors.duplicateClientNameWithNit` — includes `{{nit}}`, used by UI pre-check.
- Added `errors.duplicateCheckFailed` for connection-error scenarios.
- Fixed Spanish accent: "conexión" (was "conexion").
- Spanish duplicate-name text now matches requirement: "El nombre de cliente ya existe."

**Layer 1 — Database**:
- Created unique index `clients_client_legal_name_unique` on `LOWER(TRIM(client_legal_name))`.

**Layer 2 — Mutation Handler (`useClientMutations.ts`)**:
- `handleClientError` now uses structured constraint matching: checks `err.constraint` first, falls back to `err.message?.includes(...)`.
- Handles both `clients_client_legal_name_unique` and `clients_unique_tax_id_key` constraints.
- Applied `handleClientError` to `useUpdateClient` (was using generic handler).
- DB-level fallback uses `errors.duplicateClientName` (no nit interpolation needed).

#### Files Modified

| File | Change |
|------|--------|
| `src/components/forms/ClientForm.tsx` | Replace `maybeSingle()` → `.limit(1)`; trim name; error handling; use `duplicateClientNameWithNit` |
| `src/locales/en.json` | Add `duplicateCheckFailed`, `duplicateClientNameWithNit`; simplify `duplicateClientName` |
| `src/locales/es.json` | Add `duplicateCheckFailed`, `duplicateClientNameWithNit`; update `duplicateClientName`; fix accent |
| `src/hooks/mutations/useClientMutations.ts` | Structured constraint matching; apply to `useUpdateClient` |
| Database migration | Unique index on `LOWER(TRIM(client_legal_name))` |

#### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Existing duplicate names in production | None | Zero duplicates verified in current DB |
| Index creation lock time | None | Small table (<100 rows) |
| Return type change (`maybeSingle` → array) | Low | All consuming code updated in same change |
| UI vs DB normalization gap | Low | Documented as best-effort; DB is authoritative |
