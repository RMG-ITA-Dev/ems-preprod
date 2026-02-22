

# Plan_0220-45_v3: Deletion + Un-push Exported Timer Entries; Delete Un-pushed Timer Entries from Edit Form

**Session**: 260222_EMS2.0.5_Debugg_Session
**Bug ID**: 0220-45
**Priority**: Baja
**Version**: v2.0.5
**Route**: OPERACIONES - Hoja de Tiempo / Registros de Tiempo
**Previous version**: Plan_0220-45_v2

---

## Session Rules (Active for 260222 Session)

1. All plans use versioned naming: `Plan_MMDD-NN_vX`
2. Every implementation must append documentation to `docs/CHANGELOG-2026-02-22.md`

---

## Changes from v2 (CODEX Corrections Applied)

| # | CODEX Directive | Action Taken |
|---|----------------|--------------|
| C1 | `isImported` must cover both `is_imported` and `imported_to_time_id` to avoid edge-case UX mismatches | Fixed: line 77 in `TrackerEdit.tsx` changes from `entry?.is_imported ?? false` to `Boolean(entry?.is_imported) \|\| Boolean(entry?.imported_to_time_id)` |
| C2 | Confirm FK constraint name exists exactly as written before dropping | Verified via DB query: constraint name is exactly `timer_entries_imported_to_time_id_fkey`. Confirmed. |

---

## Product Decision (Lock-in)

- **Pushed/Imported timer entry**: `timer_entries.imported_to_time_id IS NOT NULL` and `is_imported = true`.
- **Un-push behavior**: When a linked timesheet row is deleted, the system must set `imported_to_time_id = NULL` AND `is_imported = false` for the associated timer entries.
- **Deletion permission**: timer_entries rows are deletable only when `is_imported = false` (un-pushed / never pushed). Enforced by existing trigger `trg_prevent_imported_timer_delete`.
- **UI guard**: `isImported` computed as `Boolean(entry?.is_imported) || Boolean(entry?.imported_to_time_id)` to cover edge cases where one field is set but not the other.

---

## Problem

In OPERACIONES - Hoja de Tiempo, rows exported from "Registros de Tiempo" cannot be deleted. Clicking delete shows "Error al eliminar la fila. Se ha restaurado." The FK constraint `timer_entries.imported_to_time_id -> time_entries(time_id)` uses `NO ACTION`, blocking deletion of referenced `time_entries` rows.

## Root Cause

The FK `timer_entries_imported_to_time_id_fkey` uses the default `NO ACTION` delete rule. When a `time_entries` row is referenced by `timer_entries.imported_to_time_id`, PostgreSQL blocks the delete.

---

## Solution

### Layer 1: Database Migration -- Change FK to ON DELETE SET NULL + un-push trigger

**File**: Database migration

```sql
-- FK constraint name verified via pg_constraint query: timer_entries_imported_to_time_id_fkey

-- Step 1: Drop the existing FK
ALTER TABLE public.timer_entries
  DROP CONSTRAINT timer_entries_imported_to_time_id_fkey;

-- Step 2: Re-create with ON DELETE SET NULL
ALTER TABLE public.timer_entries
  ADD CONSTRAINT timer_entries_imported_to_time_id_fkey
  FOREIGN KEY (imported_to_time_id)
  REFERENCES public.time_entries(time_id)
  ON DELETE SET NULL;

-- Step 3: Trigger to reset is_imported when imported_to_time_id becomes NULL
-- Fires both when ON DELETE SET NULL nullifies the column
-- AND when an explicit UPDATE sets it to NULL.
-- PostgreSQL's ON DELETE SET NULL DOES fire BEFORE UPDATE triggers.
CREATE OR REPLACE FUNCTION public.reset_timer_import_on_unlink()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.imported_to_time_id IS NULL AND OLD.imported_to_time_id IS NOT NULL THEN
    NEW.is_imported := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reset_timer_import_on_unlink
  BEFORE UPDATE ON public.timer_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_timer_import_on_unlink();
```

### Layer 2: Frontend -- Fix isImported guard in TrackerEdit.tsx

**File**: `src/pages/TrackerEdit.tsx`

**Line 77** -- change:

```ts
// FROM:
const isImported = entry?.is_imported ?? false;

// TO:
const isImported = Boolean(entry?.is_imported) || Boolean(entry?.imported_to_time_id);
```

This ensures the Delete button is hidden and all fields are disabled if **either** `is_imported` is true **or** `imported_to_time_id` is not null, covering any transient state where the two fields are temporarily out of sync.

All other existing UX (Delete button visibility, confirmation dialog, imported alert, field disabling) remains unchanged -- it already uses this `isImported` variable throughout.

### Layer 3: Changelog Documentation

**File**: `docs/CHANGELOG-2026-02-22.md` (APPEND)

Append entry for 0220-45.

---

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| Database migration | CREATE | Drop/re-add FK with `ON DELETE SET NULL`; add `trg_reset_timer_import_on_unlink` trigger |
| `src/pages/TrackerEdit.tsx` | EDIT | Line 77: `isImported` now checks both `is_imported` and `imported_to_time_id` |
| `docs/CHANGELOG-2026-02-22.md` | APPEND | Add 0220-45 entry |

---

## Acceptance Tests

1. Create 2 timer entries (manual + stopwatch). Export to timesheet. In Hoja de Tiempo, delete one exported row: deletion succeeds, and the corresponding timer entry becomes un-pushed (`imported_to_time_id = NULL`, `is_imported = false`) and appears as Ready in Registros de Tiempo.
2. Re-export the un-pushed timer entry: export works and it becomes pushed again.
3. Create a timesheet row directly (not from timer export): deletion still works (no regression).
4. Open a pushed/imported timer entry in edit form: Delete button is hidden; read-only alert is shown.
5. Open an un-pushed timer entry in edit form: red Delete button appears; confirm deletion; record is deleted; list refreshes; success toast shown.

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Timer entries lose import tracking on timesheet row deletion | None | This is the desired "un-push" behavior |
| ON DELETE SET NULL not firing UPDATE trigger | None | PostgreSQL fires BEFORE UPDATE triggers for ON DELETE SET NULL (verified behavior) |
| Existing `trg_prevent_imported_timer_delete` conflict | None | Checks `is_imported = true`; after un-push sets it to `false`, deletion is allowed |
| FK constraint name mismatch | None | Verified via `pg_constraint` query: name is exactly `timer_entries_imported_to_time_id_fkey` |
| Edge case: `imported_to_time_id` set but `is_imported` false (or vice versa) | None | UI now guards on both fields with `Boolean(is_imported) \|\| Boolean(imported_to_time_id)` |
| Approved timesheet lines | None | `trg_protect_approved_time_entries` still blocks deletion independently |

