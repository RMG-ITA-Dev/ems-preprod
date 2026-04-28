
# Plan v1: Polish Competencies Section in StaffForm

## Issues to Fix

1. **Competency display**: Currently the Combobox only shows the skill name. User wants `Name — Category` format both in the dropdown options AND in the selected/closed state of the combobox.
2. **"Add Competency" button**: The current button is oversized/awkward. Replace with the same pattern used by **Gastos** in `WorkOrderForm` — an inline `+ Agregar Gasto` link-style button (ghost/teal text, small icon, sits flush-left below the rows).

## Reference Pattern (from WorkOrderForm — Gastos section)

Looking at the Gastos screenshots:
- Each expense row is a flat horizontal layout: `[Type Combobox] [Amount Input] [Trash icon]`
- Below the rows: a small `[+ Agregar Gasto]` button — `variant="ghost"`, teal text, `size="sm"`, with `Plus` icon
- Total line below with separator
- No oversized "+" button at the top-right

## Changes

### 1. `src/components/forms/StaffForm.tsx` — Competencies section

**A. Move "Add Competency" button**
- Remove the current top-right `[+ Agregar Competencia]` button from the section header.
- Add a small ghost-style button **below the rows**, matching Gastos:
  ```tsx
  <Button type="button" variant="ghost" size="sm" onClick={() => setAddOpen(true)}
    className="text-info hover:text-info hover:bg-info/10">
    <Plus className="h-4 w-4 mr-2" />
    {t("staff.addCompetency")}
  </Button>
  ```
- Section header keeps just the title `Competencias` (no button on the right).

**B. Show "Name — Category" in Combobox**
- In the Add Competency dialog's Combobox:
  - Each option's display label: `${skill.name} — ${categoryLabel}` where `categoryLabel` is the i18n-resolved category (e.g., `t('skills.categories.framework')` → "Normas y Marcos").
  - The trigger (selected value) also shows `Name — Category`.
- Use the existing `skills.category` field + the i18n category map already used in the Skills settings tab.

**C. Empty state polish**
- When no competencies exist, show only the empty-state message + the small `[+ Agregar Competencia]` ghost button below it (same button, single instance).

### 2. No changes to
- Mutations, query hook, Zod schema, table columns (Competencia / Categoría / Nivel / Fecha / 🗑) — these stay.
- The Add Competency Sheet/Dialog itself (only the Combobox label format changes inside it).
- i18n keys (no new keys needed — category labels already exist).

### 3. Changelog
Append the polish entry to `docs/changelogs/CHANGELOG-2026-04-19.md`:
- Combobox label format updated to `Name — Category`
- "Add Competency" button restyled to match Gastos pattern (ghost teal, small, below rows)
- Section header simplified (button removed from top-right)

## Files Touched

| File | Change |
|---|---|
| `src/components/forms/StaffForm.tsx` | Restyle Add button + Combobox label format |
| `docs/changelogs/CHANGELOG-2026-04-19.md` | Append polish entry |

## No DB / no i18n / no new dependencies.
