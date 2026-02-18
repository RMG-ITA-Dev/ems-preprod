

# Plan_0213-34_v4: Fix Timesheet Row Deletion Persistence

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-34 |
| Title | La funcionalidad de eliminacion de registros en la Hoja de Tiempo no funciona correctamente |
| Priority | Alta |
| Route | OPERACIONES - Hoja de Tiempo |

## What Changed from v3

| Note | Resolution |
|------|-----------|
| Deterministic logging | Added `logger.error("Failed to delete timesheet row entries", e)` in the `catch` block of `confirmDeleteRow`, using the project's existing `logger` utility from `@/lib/logger`. This ensures errors are always logged to the console regardless of React Query configuration, without affecting UX (no duplicate toasts). |

All other changes remain identical to v3.

## Changes

### 1. `src/hooks/useTimesheetMutations.ts`

**Add `useDeleteRowEntries`** after the existing `useDeleteTimeEntry` (around line 109):

```typescript
// BUG #0213-34: Bulk delete all time entries for a row
export function useDeleteRowEntries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (timeIds: string[]) => {
      const { error } = await supabase
        .from("time_entries")
        .delete()
        .in("time_id", timeIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    // No onError here -- caller handles toast + logging to avoid duplicates
  });
}
```

### 2. `src/components/timesheet/TimesheetGrid.tsx`

**A. Add imports** (add to existing import lines):

- Add `useDeleteRowEntries` to the existing `useTimesheetMutations` import.
- Add AlertDialog components import.
- Add `import { logger } from "@/lib/logger";`
- `toast` from `sonner` is already imported at line 23.

```typescript
import { useUpsertTimeEntry, useDeleteRowEntries } from "@/hooks/useTimesheetMutations";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { logger } from "@/lib/logger";
```

**B. Add state and hook** (near line 91, after `upsertEntry`):

```typescript
const deleteRowEntries = useDeleteRowEntries();
const [deleteRowId, setDeleteRowId] = useState<string | null>(null);
```

**C. Replace `removeRow`** (lines 312-314) with `removeRow` + `confirmDeleteRow`:

```typescript
const removeRow = (rowId: string) => {
  const row = rows.find((r) => r.id === rowId);
  if (!row) return;

  const entryIdsToDelete = Object.values(row.entryIds).filter(
    (id): id is string => !!id
  );

  // Empty/new row: remove locally, no DB call, no confirmation
  if (entryIdsToDelete.length === 0) {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
    return;
  }

  // Row has saved entries: require confirmation
  setDeleteRowId(rowId);
};

const confirmDeleteRow = async () => {
  if (!deleteRowId) return;

  const row = rows.find((r) => r.id === deleteRowId);
  if (!row) {
    setDeleteRowId(null);
    return;
  }

  const entryIdsToDelete = Object.values(row.entryIds).filter(
    (id): id is string => !!id
  );

  if (entryIdsToDelete.length === 0) {
    setRows((prev) => prev.filter((r) => r.id !== deleteRowId));
    setDeleteRowId(null);
    return;
  }

  // Snapshot for rollback
  const previousRows = rows;

  // Optimistic UI removal
  setRows((prev) => prev.filter((r) => r.id !== deleteRowId));

  try {
    await deleteRowEntries.mutateAsync(entryIdsToDelete);
    setDeleteRowId(null);
  } catch (e) {
    // Deterministic logging + rollback
    logger.error("Failed to delete timesheet row entries", e);
    setRows(previousRows);
    setDeleteRowId(null);
    toast.error(t("timesheet.deleteRowError"));
  }
};
```

**D. Disable trash button while pending** (around lines 742-749):

```typescript
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8 text-muted-foreground hover:text-destructive"
  onClick={() => removeRow(row.id)}
  disabled={deleteRowEntries.isPending}
>
  <Trash2 className="h-4 w-4" />
</Button>
```

**E. Add AlertDialog JSX** (before the closing wrapper `</div>`, after the table):

```typescript
<AlertDialog
  open={!!deleteRowId}
  onOpenChange={(open) => { if (!open) setDeleteRowId(null); }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("timesheet.deleteRowTitle")}</AlertDialogTitle>
      <AlertDialogDescription>
        {t("timesheet.deleteRowDescription")}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={deleteRowEntries.isPending}>
        {t("common.cancel")}
      </AlertDialogCancel>
      <AlertDialogAction
        onClick={confirmDeleteRow}
        disabled={deleteRowEntries.isPending}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        {t("common.delete")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 3. `src/locales/en.json`

Inside the `"timesheet"` block, add:

```json
"deleteRowTitle": "Delete timesheet row",
"deleteRowDescription": "This will permanently delete all hours logged in this row for the current week. This action cannot be undone.",
"deleteRowError": "Failed to delete row. It has been restored."
```

### 4. `src/locales/es.json`

Inside the `"timesheet"` block, add:

```json
"deleteRowTitle": "Eliminar fila de la hoja de tiempo",
"deleteRowDescription": "Esto eliminará permanentemente todas las horas registradas en esta fila para la semana actual. Esta acción no se puede deshacer.",
"deleteRowError": "Error al eliminar la fila. Se ha restaurado."
```

### 5. `docs/CHANGELOG-2026-02-17.md`

Append entry for BUG #0213-34:

```text
## BUG #0213-34: Fix Timesheet Row Deletion Persistence

**Date:** 2026-02-18
**Priority:** Alta
**Version:** v2.0.10
**Route:** OPERACIONES -> Hoja de Tiempo

### Problem
Deleting a timesheet row removed it only from local UI state (`setRows` filter). Because underlying `time_entries` were not deleted from the database, the row reappeared on autosave/refetch/reload.

### Root Cause
`removeRow` in `TimesheetGrid.tsx` only called `setRows(rows.filter(...))` without any database mutation.

### Solution
1. **Bulk DB delete:** New `useDeleteRowEntries` mutation deletes all `time_id` values via `.delete().in('time_id', ids)`.
2. **Confirmation dialog:** AlertDialog shown only when the row has saved DB entries. Empty/new rows removed instantly.
3. **Optimistic UI + rollback:** Row removed immediately; restored with error toast on failure.
4. **Double-click protection:** Trash button disabled while `deleteRowEntries.isPending`.
5. **Cache sync:** `["time-entries"]` query invalidated on success.
6. **Toast de-duplication:** `useDeleteRowEntries` omits `onError`; caller's `catch` handles toast.
7. **Deterministic logging:** `logger.error()` in `catch` block ensures errors are always logged regardless of React Query config.

### Files Modified
| File | Change |
|------|--------|
| `src/hooks/useTimesheetMutations.ts` | Added `useDeleteRowEntries` bulk delete mutation |
| `src/components/timesheet/TimesheetGrid.tsx` | Rewrote `removeRow` with confirmation, optimistic UI, rollback, `logger.error`, disabled trash |
| `src/locales/en.json` | Added `deleteRowTitle`, `deleteRowDescription`, `deleteRowError` |
| `src/locales/es.json` | Added Spanish equivalents |
| `docs/CHANGELOG-2026-02-17.md` | This entry |
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useTimesheetMutations.ts` | MODIFY | Add `useDeleteRowEntries` bulk delete mutation (no `onError`) |
| `src/components/timesheet/TimesheetGrid.tsx` | MODIFY | Add imports (including `logger`), state, rewrite `removeRow` with confirmation + optimistic UI + rollback + `logger.error`, add AlertDialog, disable trash while pending |
| `src/locales/en.json` | MODIFY | Add `deleteRowTitle`, `deleteRowDescription`, `deleteRowError` |
| `src/locales/es.json` | MODIFY | Add Spanish equivalents |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-34 changelog entry |

## Acceptance Criteria

1. Deleting a row with saved entries prompts a confirmation dialog.
2. Confirming deletion removes the row immediately and deletes all associated `time_entries` in DB so it does not reappear after refetch/reload.
3. Deleting a new/empty row removes it immediately without confirmation and without DB calls.
4. If DB deletion fails, the row is restored, a single error toast is shown, and the error is logged via `logger.error`.
5. Trash action is disabled while deletion is pending.
6. Locked/approved rows remain protected (existing lock logic unchanged).

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Double-click | `isPending` disables the button |
| Double toast | `useDeleteRowEntries` has no `onError`; only `catch` toasts |
| Non-deterministic logging | Explicit `logger.error` in `catch` block |
| Rollback restores full snapshot | Acceptable; delete is fast, minimal concurrent-edit risk |
| Query key mismatch | Verified: `["time-entries"]` prefix matches `useTimesheetWeek.ts` |

