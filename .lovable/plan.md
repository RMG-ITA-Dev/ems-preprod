

# Plan: Hours-Only Toggle for Timer Entry Forms (v2)

**Session**: 260222_EMS2.0.5_Debugg_Session
**Version**: v2.0.5
**Scope**: TrackerEdit.tsx (edit form) + ManualEntryDialog.tsx (new entry form) + TrackerList.tsx (submit handler)

---

## Feature Summary

Add a toggle switch above "Hora inicio" that lets users choose between two input modes:
- **Toggle ON**: All 4 fields active -- Fecha, Hora inicio, Horas, Hora fin (current behavior).
- **Toggle OFF (default for new entries)**: Hora inicio and Hora fin are cleared (empty) and disabled. User only enters Fecha + Horas.

---

## Key Decision: Default Toggle State

| Context | Default |
|---------|---------|
| **New entry** (ManualEntryDialog) | **OFF** (hours-only) |
| **Edit existing entry** | Derived from `has_explicit_times` column (existing entries default `true`, so toggle ON) |

---

## DB Constraint: `started_at` is NOT NULL

The `timer_entries.started_at` column has a `NOT NULL` constraint. When the toggle is OFF (hours-only mode), the system stores synthetic timestamps:
- `started_at` = midnight (00:00) of the selected date
- `ended_at` = midnight + hours
- `duration_minutes` = hours x 60
- `has_explicit_times` = false

This new boolean column lets the edit form know whether to initialize the toggle as ON or OFF.

---

## Solution

### Layer 1: Database Migration

```sql
ALTER TABLE public.timer_entries
  ADD COLUMN has_explicit_times boolean NOT NULL DEFAULT true;
```

All existing entries get `true` (toggle ON when re-opened). No RLS changes needed.

### Layer 2: ManualEntryDialog.tsx (New Entry Form)

- Add state: `useExplicitTimes`, default **`false`** (toggle OFF).
- Add a `Switch` component inline with the "Hora inicio" label.
- When toggle OFF:
  - `startTime` and `endTime` fields are empty (`""`) and `disabled`.
  - User only fills Fecha + Horas.
  - `startTime` / `endTime` default values removed (no "08:00" / "09:00" default).
- When toggle ON:
  - Fields become active. Start defaults to "08:00", End computed from hours.
- `onSubmit` now passes `has_explicit_times: boolean` alongside existing fields.
- Default hours value remains `1`.

### Layer 3: TrackerList.tsx (handleManualSubmit)

Update `handleManualSubmit` to accept `has_explicit_times` from the dialog:
- When `has_explicit_times = false`: compute synthetic `started_at` = midnight of date, `ended_at` = midnight + hours. Skip the `endDate <= startDate` validation (synthetic times are always valid).
- When `has_explicit_times = true`: current behavior (use real start/end times).
- Include `has_explicit_times` in the insert payload.

### Layer 4: TrackerEdit.tsx (Edit Form)

- Add state: `useExplicitTimes`, initialized from `entry.has_explicit_times` (defaults `true` for existing entries).
- Add a `Switch` component inline with the "Hora inicio" label.
- When toggle OFF:
  - Clear `startTime` and `endTime` to `""`, disable those fields.
  - Hours field remains active.
- When toggle ON:
  - Set `startTime` to "08:00", compute `endTime` from hours. Fields active.
- `handleSave`:
  - When toggle OFF: build synthetic `started_at`/`ended_at` from midnight + hours. Skip time range validation. Include `has_explicit_times: false`.
  - When toggle ON: current behavior + `has_explicit_times: true`.
- Update `useUpdateTimerEntry` mutation type to accept `has_explicit_times`.

### Layer 5: useTimerEntries.ts (Mutation Types)

- Add `has_explicit_times?: boolean` to the `useCreateTimerEntry` and `useUpdateTimerEntry` mutation input types.
- Add `has_explicit_times` to the `TimerEntry` interface.

### Layer 6: i18n

| Key | EN | ES |
|-----|----|----|
| `tracker.useExplicitTimes` | `"Specify times"` | `"Especificar horas"` |

### Layer 7: Changelog

Append entry to `docs/CHANGELOG-2026-02-22.md`.

---

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| Database migration | CREATE | Add `has_explicit_times` boolean column |
| `src/components/tracker/ManualEntryDialog.tsx` | EDIT | Add toggle (default OFF), hours-only mode, pass `has_explicit_times` |
| `src/pages/TrackerList.tsx` | EDIT | `handleManualSubmit` handles `has_explicit_times` + synthetic times |
| `src/pages/TrackerEdit.tsx` | EDIT | Add toggle (init from entry), hours-only mode, save with synthetic times |
| `src/hooks/useTimerEntries.ts` | EDIT | Add `has_explicit_times` to `TimerEntry` interface + mutation types |
| `src/locales/en.json` | EDIT | Add `tracker.useExplicitTimes` |
| `src/locales/es.json` | EDIT | Add `tracker.useExplicitTimes` |
| `docs/CHANGELOG-2026-02-22.md` | APPEND | Document feature |

---

## Acceptance Tests

1. **New entry dialog, default state**: Toggle is OFF. Start/End fields are empty and disabled. User enters only Date + Hours. Save succeeds with `has_explicit_times = false` and synthetic midnight-based times in DB.
2. **New entry dialog, toggle ON**: Start/End fields activate (Start defaults "08:00", End computed). Save succeeds with `has_explicit_times = true` and real times.
3. **Edit form, existing entry (has_explicit_times=true)**: Toggle initializes ON. All time fields populated. Current behavior preserved.
4. **Edit form, re-open hours-only entry**: Toggle initializes OFF. Start/End empty and disabled. Hours shows saved value.
5. **Edit form, toggle OFF then save**: Synthetic times stored, `has_explicit_times = false`.
6. **Toggle ON then OFF then ON**: Fields restore properly (start defaults to 08:00, end computed from hours).

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Existing entries lack `has_explicit_times` | None | Default `true`; all existing entries behave as before |
| Synthetic midnight times in reports | Low | Reports use `duration_minutes` / `hours_logged`, not raw timestamps |
| Export pipeline compatibility | None | Export uses `duration_minutes` to compute `hours_logged`; start/end not carried to `time_entries` |

