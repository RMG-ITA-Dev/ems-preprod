

# Plan v1: Fix HolidayForm — Convert to Sheet Pattern with Delete Button

## Problem

The HolidayForm uses a `Dialog` while every other Settings form (ActivityCode, Industry, Category, Skill, ExpenseType) uses a `Sheet`. It also lacks a Delete button — the delete AlertDialog exists in `HolidaysManager` but is never triggered (dead code with no UI path to `setDeleteTarget`).

## Changes

### 1. `src/components/forms/HolidayForm.tsx` — Rewrite to Sheet pattern

Convert from Dialog to Sheet, matching the ActivityCodeForm pattern exactly:

- Replace `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` with `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`/`SheetFooter`
- Add `useDeleteHoliday` mutation import
- Add delete `AlertDialog` inside the SheetFooter (same pattern as ActivityCodeForm)
- Button order: `[Cancel] [Delete "Delete"/"Borrar"] [Save]`
- All buttons get `w-full sm:w-auto min-h-[44px] sm:min-h-0`
- SheetFooter class: `flex flex-col-reverse sm:flex-row gap-2 pt-4`
- Delete button: `variant="destructive"` with `<Trash2>` icon + `t("common.delete")` text
- Delete confirmation dialog uses `bg-destructive/70 text-destructive-foreground hover:bg-destructive/90`
- Delete only shown when editing (`holiday !== null`)

### 2. `src/components/settings/HolidaysManager.tsx` — Remove dead delete code

- Remove the `deleteTarget` state, `handleDelete` function, `useDeleteHoliday` import, and the orphaned `AlertDialog` block (lines 44, 53-58, 173-187)
- Delete is now handled inside HolidayForm itself

### 3. i18n — Verify keys exist

- `common.delete`, `common.cancel`, `common.save`, `holiday.editHoliday`, `holiday.addHoliday`, `holiday.deleteHoliday`, `holiday.deleteConfirm` — all already exist in en.json/es.json (no changes needed)

## No database changes

Frontend-only refactor.

