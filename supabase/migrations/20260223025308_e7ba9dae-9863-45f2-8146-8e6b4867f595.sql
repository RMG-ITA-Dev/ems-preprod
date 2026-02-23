-- Phase 2: Preventive trigger to block submitting periods with zero entries
-- Idempotent: drops existing trigger/function first

DROP TRIGGER IF EXISTS trg_validate_submission_has_entries ON timesheet_periods;
DROP FUNCTION IF EXISTS validate_submission_has_entries();

CREATE OR REPLACE FUNCTION validate_submission_has_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entry_count integer;
BEGIN
  -- Only fires when submitted_at transitions NULL -> NOT NULL (via WHEN clause)
  SELECT COUNT(*) INTO v_entry_count
  FROM time_entries te
  WHERE te.staff_id = NEW.staff_id
    AND te.date_worked >= NEW.week_start_date
    AND te.date_worked <= NEW.week_start_date + 4  -- Monday through Friday inclusive
    AND te.is_forecast = false;

  IF v_entry_count = 0 THEN
    RAISE EXCEPTION 'SUBMIT_NO_ENTRIES: Cannot submit a timesheet with no time entries for week starting %', NEW.week_start_date;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_submission_has_entries
  BEFORE UPDATE ON timesheet_periods
  FOR EACH ROW
  WHEN (NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL)
  EXECUTE FUNCTION validate_submission_has_entries();