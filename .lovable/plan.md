

# Fix — Remove Duplicate i18n Keys Overriding Alert Messages

## Root Cause
Both `en.json` and `es.json` have **duplicate keys** at lines 774-778 inside the `timesheet` object. JSON keeps only the **last** occurrence, so the short labels (`"Over max!"` / `"¡Excede máximo!"`) silently overwrite the full alert messages defined at line 719. No application code references these short labels — they are dead keys.

## Code Changes

### 1. `src/locales/en.json` — Delete lines 774-778

**Remove these lines:**
```json
    "dailyLimitExceeded": "Over limit!",
    "dailyMaxExceeded": "Over max!",
    "weeklyLimitExceeded": "Over limit!",
    "weeklyMaxExceeded": "Over max!",
    "weeklyBelowMin": "Below min",
```

The correct definitions at lines 717-719 will then take effect:
```json
    "weeklyMinNotMet": "CANNOT SUBMIT: the total hours ({{total}}h) are below the weekly minimum ({{min}}h).",
    "weeklyMaxExceeded": "CANNOT SUBMIT: the total hours ({{total}}h) exceed the weekly maximum ({{max}}h).",
```

### 2. `src/locales/es.json` — Delete lines 774-778

**Remove these lines:**
```json
    "dailyLimitExceeded": "¡Excede límite!",
    "dailyMaxExceeded": "¡Excede máximo!",
    "weeklyLimitExceeded": "¡Excede límite!",
    "weeklyMaxExceeded": "¡Excede máximo!",
    "weeklyBelowMin": "Bajo mínimo",
```

The correct definitions at lines 717-719 will then take effect:
```json
    "weeklyMinNotMet": "NO SE PUEDE ENVIAR: el total de horas ({{total}}h) está por debajo del mínimo semanal ({{min}}h).",
    "weeklyMaxExceeded": "NO SE PUEDE ENVIAR: el total de horas ({{total}}h) excede el máximo semanal ({{max}}h).",
```

### 3. `src/pages/TimeSheet.tsx` — No changes needed

Bold wrapping is already in place from the previous edit (lines 567-568, 585-586).

## Files Modified
1. `src/locales/en.json` — remove 5 dead duplicate keys
2. `src/locales/es.json` — remove 5 dead duplicate keys

