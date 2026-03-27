

# Plan — Standardize Weekly Min/Max Alert Text + Bold

## Changes

### 1. Update i18n strings (`en.json` + `es.json`)

**`weeklyMaxExceeded`** — match the uppercase prefix style of `weeklyMinNotMet`:

```
// en.json
"weeklyMaxExceeded": "CANNOT SUBMIT: the total hours ({{total}}h) exceed the weekly maximum ({{max}}h)."

// es.json  
"weeklyMaxExceeded": "NO SE PUEDE ENVIAR: el total de horas ({{total}}h) excede el máximo semanal ({{max}}h)."
```

`weeklyMinNotMet` already has the correct text from the previous change — no update needed.

### 2. Bold the alert text (`TimeSheet.tsx`)

Wrap both `AlertDescription` contents in `<span className="font-bold">` so the warning text renders bold.

### Files touched
- `src/locales/en.json` (1 key)
- `src/locales/es.json` (1 key)
- `src/pages/TimeSheet.tsx` (2 lines — add bold wrapper)

