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