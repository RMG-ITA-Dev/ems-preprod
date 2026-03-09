

# Plan v2 -- BUG 0227-68: Rejected Line Activity Change Reverts Silently

## Objective

When a user changes the Activity on a rejected timesheet line, persist the change to the database so it survives query re-fetches. Show an error toast and rollback if the save fails.

## Root Cause

`handleActivityChange` (TimesheetGrid.tsx line 455) only updates local React state via `setRows`. When any cell save triggers `queryClient.invalidateQueries(['time-entries'])`, the DB refetch overwrites local state via the `useEffect` at line 155-157, silently reverting the activity. `useUpsertTimeEntry` only updates `hours_logged`, never `activity_id`.

## Changes

### File 1: `src/hooks/useTimesheetMutations.ts`

Add new export `useUpdateEntryActivity` after `useDeleteRowEntries` (after line 133):

```typescript
// BUG 0227-68: Bulk update activity_id for existing time entries
export function useUpdateEntryActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entryIds,
      newActivityId,
    }: {
      entryIds: string[];
      newActivityId: string;
    }) => {
      const { error } = await supabase
        .from("time_entries")
        .update({ activity_id: newActivityId })
        .in("time_id", entryIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
    },
    onError: (error: Error) => {
      const msg = error.message || '';
      if (msg.includes("APPROVED_LINE_LOCKED")) {
        toast.error(i18n.t("timesheet.approvedLineCannotEdit"));
        return;
      }
      createMutationErrorHandler("updating activity")(error);
    },
  });
}
```

### File 2: `src/components/timesheet/TimesheetGrid.tsx`

**Edit 1** — Line 21 import:
```typescript
// Before:
import { useUpsertTimeEntry, useDeleteRowEntries } from "@/hooks/useTimesheetMutations";
// After:
import { useUpsertTimeEntry, useDeleteRowEntries, useUpdateEntryActivity } from "@/hooks/useTimesheetMutations";
```

**Edit 2** — Instantiate after line 107:
```typescript
const updateEntryActivity = useUpdateEntryActivity();
```

**Edit 3** — In `handleActivityChange`, after the `setRows(...)` call (line 477-481), before the closing `}` at line 482, add:

```typescript
// BUG 0227-68: Persist activity change to DB for existing entries
const existingEntryIds = Object.values(currentRow.entryIds).filter(
  (id): id is string => !!id
);
if (existingEntryIds.length > 0) {
  updateEntryActivity.mutate(
    { entryIds: existingEntryIds, newActivityId: activityId },
    {
      onError: () => {
        // Rollback local state on failure
        setRows((prev) =>
          prev.map((row) =>
            row.id === `${engagementId}-${activityId}`
              ? { ...row, activityId: currentRow.activityId, id: currentRow.id }
              : row
          )
        );
        toast.error(t("timesheet.activityChangeError"));
      },
    }
  );
}
```

### File 3: `src/locales/en.json`

Add after `deleteRowError` key (line 778):
```json
"activityChangeError": "Failed to update activity. Change has been reverted.",
```

### File 4: `src/locales/es.json`

Same position:
```json
"activityChangeError": "Error al actualizar la actividad. El cambio fue revertido.",
```

### File 5: `docs/changelogs/CHANGELOG-2026-03-08.md`

Append:

```markdown
## BUG 0227-68 — Fix rejected line activity change reverts silently

**Priority:** High | **Route:** OPERACIONES-Hoja de Tiempo | **Status:** Fixed

**Root cause:** `handleActivityChange` in `TimesheetGrid.tsx` only updated local React state. When any cell save triggered query invalidation, the DB refetch overwrote the local state, silently reverting the activity. `useUpsertTimeEntry` only ever updated `hours_logged`, never `activity_id`.

**Fix:** New `useUpdateEntryActivity` mutation bulk-updates `activity_id` on existing `time_entries`. Called from `handleActivityChange` with local rollback and error toast on failure.

**Files modified:**
- `src/hooks/useTimesheetMutations.ts` — new `useUpdateEntryActivity` export
- `src/components/timesheet/TimesheetGrid.tsx` — import, instantiate, and call new mutation in `handleActivityChange`
- `src/locales/en.json` — add `activityChangeError` key
- `src/locales/es.json` — add `activityChangeError` key

**No backend, DB, or schema changes.**
```

## Summary

| File | Action |
|---|---|
| `src/hooks/useTimesheetMutations.ts` | Add `useUpdateEntryActivity` mutation |
| `src/components/timesheet/TimesheetGrid.tsx` | Import + instantiate + call mutation with rollback |
| `src/locales/en.json` | Add `activityChangeError` key |
| `src/locales/es.json` | Add `activityChangeError` key |
| `docs/changelogs/CHANGELOG-2026-03-08.md` | Append BUG 0227-68 entry |

**Not modified:** No backend, DB, or schema changes. The `time_entries.activity_id` column already exists and is updatable.

## Verification

1. Open a timesheet week with a rejected line that has hours logged
2. Change the Activity dropdown on the rejected line to a different activity
3. Trigger a save on any other cell to force query invalidation
4. Confirm the activity on the rejected line does NOT revert
5. Navigate away and back — activity shows the new value
6. Save Draft — entries persist with new activity
7. Simulate a DB failure — activity reverts and error toast appears
8. Approved lines remain locked and unaffected

