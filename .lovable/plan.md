

# Plan_0213-31_C05_v1: Legacy Data Cleanup for Oversized Timer/Time Entries

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-31 |
| Title | El cronometro contabiliza y permite registrar mas de ocho horas por proceso |
| Priority | Media |
| Route | OPERACIONES - Cronometro |

## Problem

Legacy timer entries created before the 8-hour cap was implemented (migration 20260217) still contain inflated durations (19h 15m, 99h 20m). These entries already had `ended_at` set, so the original migration's pre-cleanup (which only targeted `ended_at IS NULL`) did not fix them. Additionally, 7 `time_entries` rows have `hours_logged > 8`, likely from the same era.

All forward-looking protections are already in place (DB trigger, RPCs, frontend clamps). This fix is a **one-time data cleanup migration only** -- no frontend changes needed.

## Data Impact (Verified)

| Table | Affected Rows | Details |
|-------|--------------|---------|
| `timer_entries` | 1 | duration_minutes = 1155 (19h 15m), already imported |
| `time_entries` | 7 | hours_logged = 9.00 or 10.00, across multiple staff |
| `timesheet_periods` | 2 | period_id `371aa...` and `8913c...` need total_hours recalculated |

## Solution

### Single DB Migration

A one-time cleanup migration that:

1. **Disables blocking triggers** temporarily:
   - `trg_validate_timer_duration` on `timer_entries` (would reject UPDATE of rows already exceeding 8h)
   - `trg_protect_approved_time_entries` on `time_entries` (one oversized `time_entries` row belongs to an approved line -- the trigger would block the cleanup UPDATE)

2. **Caps `timer_entries`**: Sets `ended_at = started_at + 8h` and `duration_minutes = 480` for all entries where duration exceeds 480 minutes or elapsed time exceeds 8h.

3. **Caps `time_entries`**: Sets `hours_logged = 8` for all entries where `hours_logged > 8`.

4. **Re-enables triggers** immediately after cleanup.

5. **Recalculates `timesheet_periods.total_hours`** for the 2 affected periods.

6. **Adds a function comment** documenting the legacy cleanup.

```sql
-- ============================================================
-- ONE-TIME CLEANUP: Cap legacy entries exceeding 8 hours
-- Bug 0213-31
-- ============================================================

-- Step 1: Temporarily disable blocking triggers
ALTER TABLE timer_entries DISABLE TRIGGER trg_validate_timer_duration;
ALTER TABLE time_entries DISABLE TRIGGER trg_protect_approved_time_entries;

-- Step 2: Cap timer_entries
UPDATE timer_entries
SET ended_at = started_at + INTERVAL '8 hours',
    duration_minutes = 480
WHERE ended_at IS NOT NULL
  AND (
    duration_minutes > 480
    OR EXTRACT(EPOCH FROM (ended_at - started_at)) / 60 > 480
  );

-- Step 3: Cap time_entries
UPDATE time_entries
SET hours_logged = 8,
    updated_at = now()
WHERE hours_logged > 8;

-- Step 4: Re-enable triggers
ALTER TABLE timer_entries ENABLE TRIGGER trg_validate_timer_duration;
ALTER TABLE time_entries ENABLE TRIGGER trg_protect_approved_time_entries;

-- Step 5: Recalculate affected timesheet_periods
UPDATE timesheet_periods tp
SET total_hours = (
  SELECT COALESCE(SUM(te.hours_logged), 0)
  FROM time_entries te
  WHERE te.period_id = tp.period_id
),
updated_at = now()
WHERE tp.period_id IN (
  SELECT DISTINCT period_id
  FROM time_entries
  WHERE period_id IS NOT NULL
    AND hours_logged = 8
);

-- Step 6: Document
COMMENT ON FUNCTION validate_timer_entry_duration() IS
  'Validates 8h max on timer_entries. Legacy data cleaned by migration (Bug 0213-31).';
```

### Documentation

Append entry to `docs/CHANGELOG-2026-02-17.md`:

```text
---

## BUG #0213-31: Legacy Data Cleanup for Oversized Timer Entries

**Date:** 2026-02-18
**Priority:** Media
**Version:** v2.0.9
**Route:** OPERACIONES -> Cronometro

### Problem

Legacy timer entries created before the 8-hour cap (migration 20260217) still contained inflated durations (19h 15m, 99h 20m). These entries already had `ended_at` set, so the original migration's pre-cleanup (targeting only `ended_at IS NULL`) did not fix them. Additionally, 7 `time_entries` rows had `hours_logged > 8`.

### Root Cause

The pre-cleanup in migration 20260217035038 only targeted entries with `ended_at IS NULL`. Entries that were already stopped (status 'Listo' or 'Importado') with oversized durations were not affected.

### Solution

One-time data cleanup migration:
1. Temporarily disabled `trg_validate_timer_duration` and `trg_protect_approved_time_entries` triggers (they would block UPDATE of already-oversized rows)
2. Capped all `timer_entries` with duration > 480 min to 480 min and `ended_at` to `started_at + 8h`
3. Capped all `time_entries` with `hours_logged > 8` to 8
4. Re-enabled triggers
5. Recalculated `timesheet_periods.total_hours` for affected periods
6. No frontend changes -- all forward-looking protections were already in place

### Database Migration

| Object | Detail |
|--------|--------|
| `timer_entries` cleanup | 1 row: duration 1155 -> 480, ended_at clamped |
| `time_entries` cleanup | 7 rows: hours_logged 9-10 -> 8 |
| `timesheet_periods` recalc | 2 periods with updated totals |
| Trigger disable/re-enable | `trg_validate_timer_duration`, `trg_protect_approved_time_entries` |

### Files Modified

| File | Change |
|------|--------|
| Migration SQL | One-time cleanup of legacy oversized entries |
| `docs/CHANGELOG-2026-02-17.md` | This entry |

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Data modification is irreversible | Only 8 rows affected; values are clearly erroneous (19h, 99h) |
| Trigger disabled during migration | Re-enabled immediately after; migration runs in single transaction |
| Approved line updated | `trg_protect_approved_time_entries` temporarily disabled; re-enabled after |
| Timesheet period totals wrong after cap | Explicitly recalculated in Step 5 |
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| DB Migration | CREATE | One-time cleanup: cap oversized timer_entries and time_entries, recalculate period totals |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-31 changelog entry |

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Data modification is irreversible | Only 8 total rows affected; all have clearly erroneous values (19h, 99h, 9h, 10h) |
| Triggers disabled during migration | Re-enabled immediately; migration runs atomically |
| Approved line entry gets capped | Correct behavior -- 9h on an approved line is still invalid data |
| Timesheet period totals recalculation | Scoped to affected periods only |
| No frontend changes needed | All forward-looking protections (DB trigger, RPCs, frontend clamps) already in place |

