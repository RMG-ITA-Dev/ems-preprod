

# Bug #6 Fix: Add Legends for Work Order Icon Columns

## Problem

The Work Orders table has two icon-only columns (Season and Status) with no headers, no legend, and season icons lack tooltips. Users must hover individual status dots to understand their meaning.

## Changes (single file: `src/pages/WorkOrders.tsx` + translations)

### 1. Add a compact legend strip between the search bar and the table (line ~245)

A single-line strip showing all icon meanings:

```
Temporada: [sun] Alta  [snowflake] Baja  |  Estado: [orange dot] Borrador  [blue dot] Pendiente  [green dot] Aprobada  [red dot] Rechazada
```

- Uses `text-xs text-muted-foreground` for minimal visual weight
- Renders only on desktop (legend is unnecessary on mobile cards which already show text labels)

### 2. Add abbreviated column headers with tooltips (lines 365-366)

Replace empty `<TableHead>` cells with single-letter headers ("T" for Temporada, "E" for Estado) wrapped in tooltips showing the full word on hover.

### 3. Add tooltips to season icons in table body (lines 604-610)

Wrap Sun/Snowflake icons with `TooltipProvider > Tooltip` showing "Temporada Alta" / "Temporada Baja" on hover, matching the existing status dot tooltip pattern.

### 4. Add translations (`en.json` and `es.json`)

Under the `workOrders` namespace:
- `seasonColumn`: "Season" / "Temporada"
- `statusColumn`: "Status" / "Estado"
- `season`: "Season" / "Temporada"
- `seasonHigh`: "High Season" / "Temporada Alta"
- `seasonLow`: "Low Season" / "Temporada Baja"

## Files Modified

| File | Change |
|------|--------|
| `src/pages/WorkOrders.tsx` | Legend strip, column headers, season tooltips |
| `src/locales/en.json` | Add 5 translation keys |
| `src/locales/es.json` | Add 5 translation keys |

## What Does NOT Change

- Mobile card view (already shows text labels for status/season)
- Status dot tooltips (already working)
- Table structure, sorting, filtering logic
- No database changes
