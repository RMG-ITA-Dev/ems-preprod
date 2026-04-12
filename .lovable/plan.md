

# Plan v1: Fix Delete & Cancel Buttons Across All Sheet Forms

## Summary

Update all 5 Sheet-based forms to: (1) show Delete button with text label instead of icon-only, (2) use standard button sizing instead of `size="icon"`, and (3) reorder so Cancel is always the leftmost button.

## Affected Files (5)

| # | File | Current Issue |
|---|------|---------------|
| 1 | `src/components/forms/ActivityCodeForm.tsx` | Delete is icon-only; Cancel is not leftmost |
| 2 | `src/components/forms/SkillForm.tsx` | Delete is icon-only; Cancel is not leftmost |
| 3 | `src/components/forms/CategoryForm.tsx` | Delete is icon-only; Cancel is not leftmost |
| 4 | `src/components/forms/IndustryForm.tsx` | Delete is icon-only; Cancel is not leftmost |
| 5 | `src/components/forms/ExpenseTypeForm.tsx` | Delete is icon-only; Cancel is not leftmost |

## Changes Per File

Each file's `SheetFooter` currently renders buttons in this order:

```text
BEFORE:  [Delete (icon)] [Cancel] [Save/Create]
```

Change to:

```text
AFTER:   [Cancel] [Delete "Delete"/"Borrar"] [Save/Create]
```

### Specific edits per button:

**Cancel button** — Move to first position in the SheetFooter (before the Delete AlertDialog block). No other changes.

**Delete button** — Three changes:
1. Remove `size="icon"` 
2. Add text label: `<Trash2 className="h-4 w-4" /> {t("common.delete")}`
3. Ensure mobile classes `w-full sm:w-auto min-h-[44px] sm:min-h-0` are present (add to IndustryForm and ExpenseTypeForm which currently lack them)

**Save/Create button** — No changes (stays rightmost).

### Before/After code example (ActivityCodeForm pattern):

**Before:**
```tsx
<SheetFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
  {isEdit && (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="icon" className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      ...
    </AlertDialog>
  )}
  <Button type="button" variant="cancel" onClick={...} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
    {t("common.cancel")}
  </Button>
  <LoadingButton ...>
    {isEdit ? t("common.saveChanges") : t("activity.createActivity")}
  </LoadingButton>
</SheetFooter>
```

**After:**
```tsx
<SheetFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-4">
  <Button type="button" variant="cancel" onClick={...} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
    {t("common.cancel")}
  </Button>
  {isEdit && (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
          <Trash2 className="h-4 w-4" />
          {t("common.delete")}
        </Button>
      </AlertDialogTrigger>
      ...
    </AlertDialog>
  )}
  <LoadingButton ...>
    {isEdit ? t("common.saveChanges") : t("activity.createActivity")}
  </LoadingButton>
</SheetFooter>
```

## Additional Fixes for IndustryForm & ExpenseTypeForm

These two forms also need:
- `SheetFooter` class updated from `"flex gap-2 pt-4"` to `"flex flex-col-reverse sm:flex-row gap-2 pt-4"` (responsive stacking)
- Mobile touch-target classes `w-full sm:w-auto min-h-[44px] sm:min-h-0` added to all three buttons

## No i18n Changes

`t("common.delete")` already exists in both `en.json` ("Delete") and `es.json` ("Borrar").

## No Database Changes

Frontend-only.

