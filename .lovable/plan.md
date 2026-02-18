

# Plan_0213-27_C03_v2: Estado Filter, Delete Guard for Imported Records, Default View

## Problem

Three issues with the "Registros de Tiempo" (TrackerList) page:

1. **No filter on "Estado" column**: The Estado column header has no funnel icon, unlike Date and Encargo.
2. **Imported records can be deleted**: The delete button in TrackerEdit is only hidden when `is_imported` is true, but there is no DB-level guard. The user wants imported records to be preserved for auditability -- but non-imported records should still allow **hard delete** (no soft-delete pattern).
3. **Default view shows everything**: All records appear on load. The default should show "En Curso" + "Listo" (running + ready), hiding "Importado" unless the user explicitly filters to see them.

## Clarifications Applied (vs C03_v1)

| C03_v1 | C03_v2 (user clarification) |
|--------|---------------------------|
| Soft-delete via `deleted_at` column | **Hard delete** stays -- no `deleted_at` column needed |
| Default filter: "Listo" only | Default filter: "Listo" + "En Curso" (both visible) |
| Imported records deletable | Imported records **cannot be deleted** (UI guard already exists; add DB-level guard) |

## Solution

### 1. Database: Prevent deletion of imported timer entries

A trigger `BEFORE DELETE ON timer_entries` that raises an exception if `is_imported = true`. This is the DB-level safety net -- the UI already hides the delete button for imported records, but this prevents any bypass.

```sql
CREATE OR REPLACE FUNCTION public.prevent_imported_timer_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.is_imported = true THEN
    RAISE EXCEPTION 'Cannot delete imported timer entry (timer_id: %)', OLD.timer_id;
  END IF;
  RETURN OLD;
END;
$function$;

CREATE TRIGGER trg_prevent_imported_timer_delete
  BEFORE DELETE ON public.timer_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_imported_timer_delete();
```

No other DB changes needed -- hard delete remains for non-imported records.

### 2. Frontend: Estado filter on TrackerList

#### New state (in `src/pages/TrackerList.tsx`):

```typescript
const [statusFilter, setStatusFilter] = useState<string>("active");
// "active" = Running + Ready (default)
// "all" = everything
// "ready" = Ready only
// "imported" = Imported only
// "running" = Running only
const [statusFilterOpen, setStatusFilterOpen] = useState(false);
```

#### Update `filteredEntries` memo to apply status filter:

```typescript
if (statusFilter === "active") {
  result = result.filter(e => !e.is_imported); // running + ready
} else if (statusFilter === "ready") {
  result = result.filter(e => !!e.ended_at && !e.is_imported);
} else if (statusFilter === "imported") {
  result = result.filter(e => e.is_imported);
} else if (statusFilter === "running") {
  result = result.filter(e => !e.ended_at);
}
// "all" = no filter
```

#### Update Estado column header (lines 618-621):

Replace the plain text header with an Excel-style funnel icon + Popover + Select, matching the pattern used by Fecha and Encargo columns. Options:

- **Activos** (Running + Ready) -- default, labeled "active"
- **Todos** (All)
- **Listo** (Ready)
- **Importado** (Imported)
- **En Curso** (Running)

Funnel icon shows accent color when filter is not "active" (since "active" is the default, it starts gray -- visually consistent with "no explicit filter applied").

Add a `clearStatusFilter` helper that resets to `"active"`.

#### Mobile card view:

Already handled -- both views consume `filteredEntries`.

### 3. i18n Keys

| Key | English | Spanish |
|-----|---------|---------|
| `tracker.statusActive` | Active | Activos |
| `tracker.statusAll` | All | Todos |

Existing keys reused: `tracker.ready`, `tracker.imported`, `tracker.running`, `common.all`.

### 4. Documentation

Append C03_v2 implementation entry to `docs/CHANGELOG-2026-02-17.md`.

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/` (new) | CREATE | `prevent_imported_timer_delete` trigger function + trigger |
| `src/pages/TrackerList.tsx` | MODIFY | Add `statusFilter` state (default "active"), filter logic, funnel icon + Popover on Estado header |
| `src/locales/en.json` | MODIFY | Add 2 i18n keys |
| `src/locales/es.json` | MODIFY | Add 2 i18n keys |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append C03_v2 entry |

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Default hides imported records | Users can switch to "Todos" or "Importado" to see them |
| DB trigger blocks legitimate admin cleanup | Only blocks `is_imported=true` rows; admin can still `UPDATE is_imported=false` first if truly needed |
| Existing delete functionality broken | No change -- `useDeleteTimerEntry` still does hard DELETE; UI already hides button for imported; DB trigger is a safety net |
| Export selects imported entries | `isSelectable` already excludes imported entries from checkboxes |

