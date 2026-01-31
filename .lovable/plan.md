

# Plan: Configurable Realization Limit for Color-Coding

## Current State

The Realization % color is currently hardcoded in `WorkOrderForm.tsx` (line 484):

```tsx
realizationPercent >= 75 ? "text-success" : "text-destructive"
```

This means:
- **Green** if realization >= 75%
- **Red** if realization < 75%

The user needs this threshold to be **configurable via Global Settings** so an Admin can adjust it based on business needs.

---

## Solution Overview

1. Add a new global setting `REALIZATION_LIMIT` in the database
2. Add UI controls in Settings page (Configuración Global tab)
3. Fetch and use this setting in WorkOrderForm for color logic

---

## Technical Changes

### Step 1: Database Migration

Create a new global setting record:

```sql
INSERT INTO global_settings (setting_key, setting_value, description)
VALUES (
  'REALIZATION_LIMIT',
  '75',
  'Realization percentage threshold for color coding (green >= X, red < X)'
);
```

---

### Step 2: Translation Files

#### File: `src/locales/es.json`

Add to the `settings` section:

```json
"realizationLimit": "Límite de Realización (%)",
"realizationLimitHelp": "Umbral para codificación por color: verde si R >= X%, rojo si R < X%"
```

#### File: `src/locales/en.json`

Add to the `settings` section:

```json
"realizationLimit": "Realization Limit (%)",
"realizationLimitHelp": "Threshold for color coding: green if R >= X%, red if R < X%"
```

---

### Step 3: Settings Page (`src/pages/Settings.tsx`)

#### Add state variable (around line 78):

```tsx
const [realizationLimit, setRealizationLimit] = useState<string>("");
```

#### Initialize from settings (in useEffect, around line 100):

```tsx
const realizationSetting = settings.find((s) => s.setting_key === "REALIZATION_LIMIT");
if (realizationSetting) {
  setRealizationLimit(realizationSetting.setting_value);
}
```

#### Add UI control after Tax Rate section (around line 458):

```tsx
{/* Realization Limit Setting */}
<div className="space-y-2 py-4 border-b border-border">
  <Label htmlFor="realizationLimit">{t("settings.realizationLimit")}</Label>
  <div className="flex items-center gap-2 max-w-[200px]">
    <NumericInput
      id="realizationLimit"
      value={realizationLimit || getSetting("REALIZATION_LIMIT") || "75"}
      onValueChange={(value) => setRealizationLimit(value)}
      placeholder="75"
      decimals={1}
    />
    <span className="text-muted-foreground">%</span>
  </div>
  <p className="text-sm text-muted-foreground">{t("settings.realizationLimitHelp")}</p>
</div>
```

#### Update save handler (in `handleSaveSettings`, around line 231):

```tsx
if (realizationLimit) {
  await updateSettingMutation.mutateAsync({ key: "REALIZATION_LIMIT", value: realizationLimit });
}
```

---

### Step 4: WorkOrderForm.tsx - Use Setting for Color Logic

#### Import `useSetting` (already imported on line 19)

Already imported: `import { useCategories, useExpenseTypes, useSetting, ... }`

#### Fetch the setting (add inside component, around line 113):

```tsx
const realizationLimitSetting = useSetting("REALIZATION_LIMIT");
const realizationLimit = parseFloat(realizationLimitSetting || "75");
```

#### Update color logic (line 484):

**Current:**
```tsx
realizationPercent >= 75 ? "text-success" : "text-destructive"
```

**New:**
```tsx
realizationPercent >= realizationLimit ? "text-success" : "text-destructive"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| **Database** | Insert `REALIZATION_LIMIT` setting with default value `75` |
| `src/locales/es.json` | Add `realizationLimit` and `realizationLimitHelp` translations |
| `src/locales/en.json` | Add `realizationLimit` and `realizationLimitHelp` translations |
| `src/pages/Settings.tsx` | Add state, initialization, UI control, and save logic for Realization Limit |
| `src/components/forms/WorkOrderForm.tsx` | Fetch `REALIZATION_LIMIT` setting and use it for color-coding logic |

---

## User Experience

### Settings Page (Configuración Global)
A new field "Límite de Realización (%)" will appear after the "Tasa de IVA" field:
- Input for entering the threshold percentage (default: 75)
- Help text explaining the color logic

### Work Order Form (Resumen)
- If Realization % >= configured limit → **Green**
- If Realization % < configured limit → **Red**

---

## Testing Checklist

After implementation:
- [ ] New setting appears in Configuración Global tab
- [ ] Default value is 75%
- [ ] Changing the value and saving persists correctly
- [ ] Work Order Resumen shows green for R >= limit
- [ ] Work Order Resumen shows red for R < limit
- [ ] Setting works correctly with decimal values (e.g., 74.5%)

