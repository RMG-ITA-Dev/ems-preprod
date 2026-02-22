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

---

### Bug 0220-45: Fix Deletion of Exported Time Entries in Timesheet

**Plan**: Plan_0220-45_v3
**Priority**: Baja
**Route**: OPERACIONES - Hoja de Tiempo / Registros de Tiempo

#### Problem
In OPERACIONES → Hoja de Tiempo, rows exported from "Registros de Tiempo" could not be deleted. Clicking the delete icon showed "Error al eliminar la fila. Se ha restaurado." Rows created directly in the timesheet deleted normally.

#### Root Cause
The FK constraint `timer_entries.imported_to_time_id → time_entries(time_id)` used the default `NO ACTION` delete rule. When a `time_entries` row was referenced by `timer_entries.imported_to_time_id`, PostgreSQL blocked the delete.

#### Solution

**Layer 1 — Database Migration**:
- Changed FK `timer_entries_imported_to_time_id_fkey` to `ON DELETE SET NULL`. Deleting a `time_entries` row now sets `timer_entries.imported_to_time_id = NULL` instead of failing.
- Added trigger `trg_reset_timer_import_on_unlink` (BEFORE UPDATE on `timer_entries`): when `imported_to_time_id` transitions from NOT NULL to NULL, sets `is_imported = false`. This "un-pushes" the timer entry back to Ready status for re-export.
- PostgreSQL's `ON DELETE SET NULL` fires BEFORE UPDATE triggers, so the un-push trigger fires automatically when a timesheet row is deleted.

**Layer 2 — Frontend (`TrackerEdit.tsx`)**:
- Changed `isImported` guard from `entry?.is_imported ?? false` to `Boolean(entry?.is_imported) || Boolean(entry?.imported_to_time_id)`.
- This ensures the Delete button is hidden and fields are disabled if **either** `is_imported` is true **or** `imported_to_time_id` is not null, covering edge cases where the two fields are temporarily out of sync.

#### Files Modified

| File | Change |
|------|--------|
| Database migration | Drop/re-add FK with `ON DELETE SET NULL`; add `trg_reset_timer_import_on_unlink` trigger |
| `src/pages/TrackerEdit.tsx` | Line 77: `isImported` now checks both `is_imported` and `imported_to_time_id` |

#### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Timer entries lose import tracking on deletion | None | Desired "un-push" behavior; entries return to Ready for re-export |
| ON DELETE SET NULL not firing UPDATE trigger | None | PostgreSQL fires BEFORE UPDATE triggers for ON DELETE SET NULL (verified) |
| `trg_prevent_imported_timer_delete` conflict | None | Checks `is_imported = true`; after un-push it's `false`, so deletion is allowed |
| FK constraint name mismatch | None | Verified via `pg_constraint` query |
| Edge case: fields out of sync | None | UI guards on both fields with OR logic |
| Approved timesheet lines | None | `trg_protect_approved_time_entries` still blocks independently |

---

### Feature: Hours-Only Toggle for Timer Entry Forms

**Plan**: Plan_HoursOnlyToggle_v2
**Priority**: Media
**Route**: OPERACIONES - Registros de Tiempo

#### Summary
Added a toggle switch ("Especificar horas" / "Specify times") to both the Manual Entry dialog and the Edit form for timer entries. When OFF (default for new entries), users only enter Date + Hours; Start/End Time fields are cleared and disabled. When ON, all four fields are active (current behavior).

#### Solution

**Layer 1 — Database**: Added `has_explicit_times boolean NOT NULL DEFAULT true` to `timer_entries`. Existing entries default to `true` (toggle ON when re-opened).

**Layer 2 — ManualEntryDialog.tsx**: Toggle defaults OFF for new entries. Start/End fields empty and disabled. `onSubmit` passes `has_explicit_times` and `hours`.

**Layer 3 — TrackerList.tsx**: `handleManualSubmit` computes synthetic `started_at` (midnight) and `ended_at` (midnight + hours) when `has_explicit_times = false`.

**Layer 4 — TrackerEdit.tsx**: Toggle initializes from `entry.has_explicit_times`. When OFF, start/end fields cleared and disabled; save uses synthetic timestamps.

**Layer 5 — useTimerEntries.ts**: Added `has_explicit_times` to `TimerEntry` interface and mutation input types.

**Layer 6 — i18n**: Added `tracker.useExplicitTimes` key (EN: "Specify times", ES: "Especificar horas").

#### Files Modified

| File | Change |
|------|--------|
| Database migration | Add `has_explicit_times boolean NOT NULL DEFAULT true` to `timer_entries` |
| `src/components/tracker/ManualEntryDialog.tsx` | Add toggle (default OFF), hours-only mode, pass `has_explicit_times` |
| `src/pages/TrackerList.tsx` | `handleManualSubmit` handles `has_explicit_times` + synthetic times |
| `src/pages/TrackerEdit.tsx` | Add toggle (init from entry), hours-only mode, save with synthetic times |
| `src/hooks/useTimerEntries.ts` | Add `has_explicit_times` to `TimerEntry` interface + mutation types |
| `src/locales/en.json` | Add `tracker.useExplicitTimes` |
| `src/locales/es.json` | Add `tracker.useExplicitTimes` |
