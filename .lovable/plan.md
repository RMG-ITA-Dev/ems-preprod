# Plan v5 -- PROGRAMER_REQUEST_FIX_#2: Registros de Tiempo UI Refinements (S6, S7, S8)

Three UI changes to the "Registros de Tiempo" module plus a new dedicated edit page following the exact "Editar Encargo" layout pattern.

---

## CODEX v5 Corrections Applied


| #   | Issue                                                | Resolution                                                                         |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A   | Loading condition: don't rely solely on `!isFetched` | Skeleton shown when `!isFetched && !entries` (robust against refetch/error states) |
| B   | Guard #2 should also depend on `isFetched`           | Both guards now gated on `isFetched` before acting                                 |


---

## S6: Remove "Acciones" Column and All Inline Action Buttons

**File: `src/pages/TrackerList.tsx**`

**Desktop table:**

- Delete the "Acciones" `<TableHead>` (lines 681-684, width 8%)
- Delete the "Actions" `<TableCell>` with edit/copy/delete buttons (lines 763-793)
- Reduce skeleton column count from 9 to 8 (line 691)
- Reduce `colSpan` from 9 to 8 (line 698)
- Redistribute freed 8% width: Engagement 22% to 26%, Description 13% to 16%
- Remove `canEdit` variable (line 705)

**Mobile cards:**

- Remove the action buttons section inside `CollapsibleContent` (lines 512-541: the `canEdit &&` block with edit/duplicate/delete buttons). Keep description display.
- Remove `canEdit` variable (line 440)

**Cleanup:**

- Remove `handleEdit`, `handleDuplicate`, `handleDelete` functions (lines 296-329)
- Remove `Pencil`, `Copy`, `Trash2`, `FileText` from lucide imports (line 34)

**Checkpoint -- checkbox isolation:**
Checkbox click already uses `e.stopPropagation()` at lines 457 (mobile) and 715 (desktop). No changes needed.

---

## S7: New Dedicated Edit Page (`TrackerEdit.tsx`)

### Layout (matching EngagementForm / "Editar Encargo" screenshot exactly)

```text
+----------------------------------------------------------+
| Editar Registro de Tiempo              [Eliminar] (red)  |
+----------------------------------------------------------+
| Card (bg-card rounded-xl border border-border p-6):      |
|                                                           |
|   Section: "Tiempo"                                       |
|     Date picker  |  Start Time  |  End Time              |
|                                                           |
|   Section: "Encargo"                                      |
|     Engagement (select)  |  Activity (select)             |
|                                                           |
|   Section: "Detalle"                                      |
|     Description (textarea, full width)                    |
|                                                           |
|                           [Cancelar]  [Guardar Cambios]   |
+----------------------------------------------------------+
```

### Guards (all via useEffect, both gated on isFetched)

```typescript
const { data: entries, isFetched } = useTimerEntries();
const entry = entries?.find(e => e.timer_id === id);

// Guard 1: Not found -- runs only after query settles
useEffect(() => {
  if (isFetched && !entry) navigate("/tracker", { replace: true });
}, [isFetched, entry, navigate]);

// Guard 2: Running timer -- also gated on isFetched to avoid transient redirects
useEffect(() => {
  if (isFetched && entry && !entry.ended_at) navigate("/tracker/new", { replace: true });
}, [isFetched, entry, navigate]);
```

### Loading state (robust)

```typescript
// Skeleton shown only when query hasn't settled AND we have no data
if (!isFetched && !entries) {
  return <LoadingSkeleton />;
}
```

This avoids flicker during background refetches (where `isFetched` stays `true` and data is already available) and handles error states gracefully.

### Imported entry handling

- **Imported entry** (`is_imported === true`): Render the edit page with all inputs disabled, Save and Delete buttons hidden. Show an `Alert` component with `t("tracker.readOnlyImported")`.

### Data loading

- `useTimerEntries()` returns ALL entries for the current staff (no pagination, no filters) -- confirmed from hook code (lines 27-50). Direct URL load is safe.
- Find entry: `entries?.find(e => e.timer_id === id)`
- If `isFetched && !entry`, redirect via useEffect (Guard 1)

### Save handler

- Reconstruct `started_at` and `ended_at` from date + startTime + endTime (ISO strings)
- Recalculate `duration_minutes = Math.round((end - start) / 60000)`
- Call `useUpdateTimerEntry` with `{ timer_id, started_at, ended_at, duration_minutes, engagement_id, activity_id, description }`
- On success: `toast.success(t("tracker.recordSaved"))`, `navigate("/tracker")`

### Delete handler

- `AlertDialog` confirmation (same pattern as EngagementForm lines 197-220)
- Confirmation text uses `t("tracker.deleteRecordConfirm")`
- Call `useDeleteTimerEntry` with `timer_id`
- On success: `toast.success(t("tracker.recordDeleted"))`, `navigate("/tracker")`

### Key implementation details (matching EngagementForm exactly)

- **Header row**: `<div className="flex items-center justify-between">` (EngagementForm line 193)
  - `<h1 className="text-lg font-semibold">` with `t("tracker.editRecord")`
  - `<Button variant="destructive">` with `<Trash2>` icon inside `AlertDialog` (EngagementForm lines 197-220)
- **Form card**: `<div className="bg-card rounded-xl border border-border p-6">` (EngagementForm line 232)
- **Section headers**: `<h3 className="font-medium text-lg">` (EngagementForm line 236)
- **Footer buttons**: `<div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:gap-4 pt-4">` (EngagementForm line 458)
  - `<Button variant="cancel" className="w-full sm:w-auto min-h-[44px] sm:min-h-0">` using `t("common.cancel")` (EngagementForm line 459)
  - `<LoadingButton variant="default" className="w-full sm:w-auto min-h-[44px] sm:min-h-0">` using `t("common.saveChanges")` (EngagementForm line 462-470)

### Hooks used

- `useTimerEntries`, `useUpdateTimerEntry`, `useDeleteTimerEntry` from `@/hooks/useTimerEntries`
- `useEngagements`, `useActivityCodes` from `@/hooks/useEmsData` (for select dropdowns)
- Active filtering: engagements `status === "active"`, activities `is_active === true`

### Route change in `App.tsx`

- Add lazy import at line 38: `const TrackerEdit = lazy(() => import("./pages/TrackerEdit"));`
- Line 79: Change `<TrackerRecord />` to `<TrackerEdit />`
- `/tracker/new` (line 78) remains `TrackerRecord` (stopwatch) -- unchanged

### Mutation extension in `useTimerEntries.ts`

- Line 113: Add `started_at?: string` to the `useUpdateTimerEntry` mutation type (currently missing)

## One tiny implementation note (non-scope, just don’t miss it)

- In `TrackerEdit.tsx`, make sure `LoadingSkeleton` refers to an existing component (or replace with your standard `<Skeleton />` layout). In the plan it’s a placeholder name, which is fine as long as you implement/replace it consistently.

---

## S8: Button Icon and Color Changes

**File: `src/pages/TrackerList.tsx**` button bar (lines 398-415)


| Button                                   | Before                                    | After                                                                                                             |
| ---------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Usar Cronometro (lines 399-406)          | `variant="default"` (purple), `Plus` icon | `variant="default" className="bg-warning text-warning-foreground hover:bg-warning/90"` (yellow), keep `Plus` icon |
| Nuevo Registro de Tiempo (lines 408-415) | `variant="outline"`, `FileText` icon      | `variant="default"` (purple), `Plus` icon                                                                         |


**Critical preservation**: "Nuevo Registro de Tiempo" continues to call `setManualDialogOpen(true)` (line 410). Only icon and style change. No navigation change.

Button order unchanged (left to right):

1. Exportar a la Hoja de Tiempo (outline)
2. Usar Cronometro (yellow/warning)
3. Nuevo Registro de Tiempo (purple/default)

---

## i18n Keys

### Existing keys confirmed present (reuse, NO additions):

- `common.cancel` = "Cancel" / "Cancelar"
- `common.delete` = "Delete" / "Eliminar"
- `common.saveChanges` = "Save Changes" / "Guardar Cambios"
- `common.confirmDelete` = exists (uses `{{name}}` interpolation)
- `common.deleteWarning` = exists

### New keys under `"tracker": { ... }` (8 keys per locale):

**EN (`src/locales/en.json`):**

```json
"editRecord": "Edit Time Record",
"deleteRecordConfirm": "This will permanently delete this time record.",
"readOnlyImported": "This record has been exported and cannot be modified.",
"sectionTime": "Time",
"sectionEngagement": "Engagement",
"sectionDetail": "Detail",
"recordSaved": "Record updated successfully",
"recordDeleted": "Record deleted successfully"
```

**ES (`src/locales/es.json`):**

```json
"editRecord": "Editar Registro de Tiempo",
"deleteRecordConfirm": "Esta accion eliminara este registro de tiempo permanentemente.",
"readOnlyImported": "Este registro ya fue exportado y no puede ser modificado.",
"sectionTime": "Tiempo",
"sectionEngagement": "Encargo",
"sectionDetail": "Detalle",
"recordSaved": "Registro actualizado exitosamente",
"recordDeleted": "Registro eliminado exitosamente"
```

---

## File Summary


| File                           | Action                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `src/pages/TrackerEdit.tsx`    | CREATE -- dedicated edit page following EngagementForm pattern                                                     |
| `src/pages/TrackerList.tsx`    | MODIFY -- remove Acciones column + mobile actions (S6), change button icons/colors (S8), clean up handlers/imports |
| `src/hooks/useTimerEntries.ts` | MODIFY -- add `started_at?: string` to `useUpdateTimerEntry` type (line 113)                                       |
| `src/App.tsx`                  | MODIFY -- add TrackerEdit lazy import, change `/tracker/:id` route                                                 |
| `src/locales/es.json`          | MODIFY -- add 8 tracker keys                                                                                       |
| `src/locales/en.json`          | MODIFY -- add 8 tracker keys                                                                                       |
| `docs/CHANGELOG-2026-02-13.md` | MODIFY -- append PROGRAMER_REQUEST_FIX_#2 entry                                                                    |


---

## Column Width After Removing Acciones


| Column      | Before | After   |
| ----------- | ------ | ------- |
| Checkbox    | 4%     | 4%      |
| Fecha       | 10%    | 10%     |
| Hora        | 10%    | 10%     |
| Duracion    | 8%     | 8%      |
| Encargo     | 22%    | 26%     |
| Actividad   | 15%    | 16%     |
| Descripcion | 13%    | 16%     |
| Estado      | 8%     | 10%     |
| Acciones    | 8%     | removed |


---

## Risk Assessment


| Area                               | Risk | Mitigation                                                                                                                                                      |
| ---------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route change `/tracker/:id`        | Low  | `/tracker/new` still uses TrackerRecord for stopwatch. TrackerEdit handles completed entries only, redirecting running ones via useEffect.                      |
| Removing mobile action buttons     | Low  | Users tap the card row to navigate to edit page -- same pattern as Engagements list.                                                                            |
| Warning color on button            | None | `variant="default"` preserved for CVA base styles (h-10 px-4 py-2); only color overridden. `--warning` and `--warning-foreground` confirmed in `src/index.css`. |
| Imported entry guard               | Low  | Read-only state (disabled inputs, hidden Save/Delete, Alert message). Not a redirect.                                                                           |
| "Nuevo Registro" button regression | None | `onClick={() => setManualDialogOpen(true)}` explicitly preserved. Only icon/style change.                                                                       |
| Mutation type extension            | None | Adding optional `started_at` field to existing mutation; backward compatible.                                                                                   |
| Loading/guard flicker              | None | Skeleton gated on `!isFetched && !entries`. Both guards gated on `isFetched`. No transient redirects.                                                           |


---

## Acceptance Tests

1. **S6 -- Desktop**: Open `/tracker`. No "Acciones" column. No edit/copy/delete icons in table rows.
2. **S6 -- Mobile**: Open `/tracker` on mobile. No action buttons in collapsible card section.
3. **S7 -- Edit page**: Click completed entry row. Full edit page: title "Editar Registro de Tiempo", red "Eliminar" top-right, form pre-filled, "Cancelar"/"Guardar Cambios" bottom-right.
4. **S7 -- Save**: Edit description, click "Guardar Cambios". Toast success, redirects to list, data updated.
5. **S7 -- Delete**: Click "Eliminar", confirm in AlertDialog. Entry removed, redirects to list.
6. **S7 -- Imported guard**: Navigate to imported entry. Inputs disabled, no Save/Delete, Alert shown.
7. **S7 -- Running guard**: Navigate to running entry via URL. Redirects to `/tracker/new`.
8. **S8 -- Purple button**: "+ Nuevo Registro de Tiempo" has Plus icon, is purple, opens ManualEntryDialog.
9. **S8 -- Yellow button**: "+ Usar Cronometro" is yellow (warning color).
10. **Checkbox**: Clicking checkbox does NOT navigate (stopPropagation already in place).

---

## Documentation Step

Append **PROGRAMER_REQUEST_FIX_#2** entry to `docs/CHANGELOG-2026-02-13.md` documenting S6/S7/S8 changes, file modifications, and risk assessment following the established changelog format.