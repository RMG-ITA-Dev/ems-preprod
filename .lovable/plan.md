

# Plan: Reorder Time Fields + Move Toggle Switch

**Scope**: `TrackerEdit.tsx` (edit form) + `ManualEntryDialog.tsx` (new entry dialog)

---

## Problem

Current field order: `[Fecha, Hora inicio, Horas, Hora fin]`
Required field order: `[Fecha, Horas, Hora inicio, Hora fin]`

The toggle switch is currently inline with the "Hora inicio" label. It should be moved to the right of the section title "Tiempo".

---

## Changes

### 1. TrackerEdit.tsx

**Section title + toggle (lines 365-366)**: Change the `<h3>` from plain text to a flex row with the toggle switch to its right:

```tsx
<div className="flex items-center justify-between">
  <h3 className="font-medium text-lg">{t("tracker.sectionTime")}</h3>
  {!isImported && (
    <div className="flex items-center gap-1.5">
      <Switch checked={useExplicitTimes} onCheckedChange={handleToggleExplicitTimes} className="scale-75" />
      <span className="text-xs text-muted-foreground">{t("tracker.useExplicitTimes")}</span>
    </div>
  )}
</div>
```

**Reorder grid columns (lines 367-446)**: Change order from `[Date, StartTime, Hours, EndTime]` to `[Date, Hours, StartTime, EndTime]`. Remove the toggle from the StartTime column (it moved to the title row). The StartTime label becomes a simple `<Label>` again.

### 2. ManualEntryDialog.tsx

**Same reorder (lines 224-266)**: Change the 3-column grid from `[StartTime (with toggle), Hours, EndTime]` to `[Hours, StartTime, EndTime]`. Move the toggle switch above the grid, inline with a small section label or just above the grid row. Since the dialog doesn't have a "Tiempo" section title, add a flex row with the toggle above the time grid.

---

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/pages/TrackerEdit.tsx` | EDIT | Move toggle to title row; reorder grid to [Fecha, Horas, Hora inicio, Hora fin] |
| `src/components/tracker/ManualEntryDialog.tsx` | EDIT | Reorder grid to [Horas, Hora inicio, Hora fin]; move toggle above grid |

No database, i18n, or logic changes needed -- purely layout reordering.

