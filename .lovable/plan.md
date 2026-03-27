

# Plan — Fix Cancel Button Position (Corrected)

## Diagnosis

The previous edit moved Cancel before "Delete All" but left it **after** "Copy to Current Week" (line 645). The `flex` container at line 643 renders buttons in DOM order, so "Copy to Current Week" still appears first when visible. The screenshot confirms this: `Copiar a Semana Actual | Cancelar | Borrar todos...`

## Fix

### File: `src/pages/TimeSheet.tsx`

Move the Cancel button block (lines 660–663) to be the **very first child** inside the `<div className="flex gap-3 flex-wrap">` at line 643, before the "Copy to Current Week" conditional block.

**Current order (lines 643–691):**
```
<div className="flex gap-3 flex-wrap">
  {/* Copy to Current Week */}        ← line 644
  {/* Cancel */}                       ← line 660
  {/* Delete All */}                   ← line 665
  {/* Copy Previous Week */}           ← line 678
  {/* Unsubmit */}                     ← line 693
  ...
```

**New order:**
```
<div className="flex gap-3 flex-wrap">
  {/* Cancel — always leftmost */}     ← MOVED HERE
  {/* Copy to Current Week */}
  {/* Delete All */}
  {/* Copy Previous Week */}
  {/* Unsubmit */}
  ...
```

### Concrete code change

Remove lines 660–663:
```tsx
            {/* Cancel button — always leftmost */}
            <Button variant="cancel" onClick={handleBack}>
              {t("common.cancel")}
            </Button>
```

Insert immediately after line 643 (`<div className="flex gap-3 flex-wrap">`):
```tsx
            {/* Cancel button — always leftmost */}
            <Button variant="cancel" onClick={handleBack}>
              {t("common.cancel")}
            </Button>
```

Single file change, 4 lines moved.

