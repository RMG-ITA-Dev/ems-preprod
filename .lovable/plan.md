

# Plan v1 -- Hours Field Enhancement for Add & Edit Time Records

## Objective

Add a direct "Hours" input field to both the ManualEntryDialog (Add) and TrackerEdit (Edit) forms, with three behaviors:

1. **Max 8 hours restriction** on the hours field
2. **Default start time 08:00** and auto-compute end time from hours
3. **Bidirectional sync**: if the user touches start or end time fields, compute the interval and populate the hours field automatically

---

## How It Works

The new "Horas" field sits between the Start Time and End Time fields (or below the time range row in the dialog). It is a standard numeric input (type="number", step 0.5, min 0, max 8).

### Interaction Logic

- **User changes Hours**: End time = start time + hours. If no start time, default to 08:00 first.
- **User changes Start Time**: If hours is set, recompute end time = start + hours. If end time is already set, recompute hours = end - start.
- **User changes End Time**: Recompute hours = end - start. If result exceeds 8, clamp to 8 and adjust end time back.
- **Default state (Add dialog only)**: startTime = "08:00", hours = 1, endTime = "09:00" (instead of current 09:00/10:00).

### Validation

- Hours clamped to 0-8 range
- If computed hours from start/end exceeds 8, show toast error and clamp
- Save handler already validates end > start (existing logic, unchanged)

---

## File Changes

### 1. `src/components/tracker/ManualEntryDialog.tsx` (MODIFY)

**Add hours state:**
```typescript
const [hours, setHours] = useState<number>(1);
```

**Change defaults:**
- `startTime` default from `"09:00"` to `"08:00"`
- `endTime` default from `"10:00"` to `"09:00"`
- Reset also resets hours to 1

**Add "Horas" input** between Start Time and End Time in the grid (change from `grid-cols-2` to `grid-cols-3`):
```text
[ Hora inicio ]  [ Horas ]  [ Hora fin ]
```

The Horas field uses a standard `<Input type="number" min={0} max={8} step={0.5} />`.

**Add handler functions:**
- `handleHoursChange(newHours)`: clamp 0-8, compute endTime from startTime + hours
- `handleStartTimeChange(newStart)`: if hours is set, recompute endTime; else if endTime is set, recompute hours
- `handleEndTimeChange(newEnd)`: compute hours from start-end interval; if > 8, clamp and show toast

### 2. `src/pages/TrackerEdit.tsx` (MODIFY)

**Add hours state:**
```typescript
const [hours, setHours] = useState<number>(0);
```

**Populate hours from entry data** (in the existing useEffect that sets startTime/endTime):
```typescript
if (entry.ended_at) {
  const durationHours = (end.getTime() - start.getTime()) / 3600000;
  setHours(Math.min(8, Math.round(durationHours * 2) / 2)); // round to 0.5
}
```

**Change defaults for new entries**: startTime defaults to "08:00" when loaded.

**Add "Horas" input** in the Time section grid (change from `sm:grid-cols-3` with Date/Start/End to `sm:grid-cols-4` with Date/Start/Hours/End):
```text
[ Fecha ]  [ Hora inicio ]  [ Horas ]  [ Hora fin ]
```

**Add same handler functions** as ManualEntryDialog (handleHoursChange, handleStartTimeChange, handleEndTimeChange).

### 3. `src/locales/es.json` (MODIFY)

Add under `"tracker"`:
```json
"hours": "Horas",
"maxHoursExceeded": "El maximo permitido es 8 horas"
```

### 4. `src/locales/en.json` (MODIFY)

Add under `"tracker"`:
```json
"hours": "Hours",
"maxHoursExceeded": "Maximum allowed is 8 hours"
```

### 5. `docs/CHANGELOG-2026-02-13.md` (MODIFY)

Append entry documenting the hours field enhancement.

---

## Helper Function (shared logic)

Both components need the same time arithmetic. To avoid duplication, add a small utility function at the top of each file (or extract to a shared helper if preferred):

```typescript
function addHoursToTime(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = h * 60 + m + Math.round(hours * 60);
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function computeHoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = (eh * 60 + em - sh * 60 - sm) / 60;
  return Math.max(0, diff);
}
```

---

## Detailed Interaction Table

| User Action | Effect |
|---|---|
| Changes **Hours** (0-8) | endTime = startTime + hours. If startTime is empty, set startTime to "08:00" first. |
| Changes **Start Time** | If hours > 0, endTime = startTime + hours. If endTime already set and hours is 0, compute hours = end - start (clamped to 8). |
| Changes **End Time** | Compute hours = endTime - startTime. If > 8, clamp to 8, adjust endTime = startTime + 8h, show toast. |
| Form **opens (Add)** | startTime = "08:00", hours = 1, endTime = "09:00" |
| Form **loads (Edit)** | Populate from entry data, compute hours from actual start/end interval (clamped to 8) |

---

## File Summary

| File | Action |
|---|---|
| `src/components/tracker/ManualEntryDialog.tsx` | MODIFY -- add Hours field, change defaults to 08:00, sync logic |
| `src/pages/TrackerEdit.tsx` | MODIFY -- add Hours field, sync logic, populate from entry |
| `src/locales/es.json` | MODIFY -- add 2 keys (hours, maxHoursExceeded) |
| `src/locales/en.json` | MODIFY -- add 2 keys (hours, maxHoursExceeded) |
| `docs/CHANGELOG-2026-02-13.md` | MODIFY -- append documentation entry |

---

## Risk Assessment

| Area | Risk | Mitigation |
|---|---|---|
| Existing save logic | None | Save handler still uses startTime/endTime to compute duration_minutes. Hours field is UI-only convenience. |
| Clamping to 8h | Low | Toast feedback when exceeding 8h. End time adjusted automatically. |
| Half-hour precision | None | step=0.5 on input allows 0.5h increments. Rounded to nearest 0.5 when computing from time interval. |
| Imported entries (Edit) | None | Hours field is also disabled when isImported is true. |

---

## Acceptance Tests

1. **Add dialog defaults**: Open "Nuevo Registro de Tiempo". Start time is 08:00, Hours is 1, End time is 09:00.
2. **Hours changes end time**: Set hours to 4. End time updates to 12:00.
3. **Max 8h**: Try to type 10 in hours. Clamped to 8.
4. **Start time syncs**: Change start to 10:00 with hours=4. End time updates to 14:00.
5. **End time syncs**: Change end to 15:00 with start=08:00. Hours shows 7.
6. **End time over 8h**: Set start=08:00, end=18:00. Hours clamped to 8, end adjusted to 16:00, toast shown.
7. **Edit page**: Open existing record. Hours pre-populated from the actual interval.
8. **Imported read-only**: Hours field is disabled on imported entries.

