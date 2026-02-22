
-- 1a. Add termination_date column
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS termination_date date;

-- 1b. CHECK constraint: termination_date >= hire_date (idempotent)
DO $$
BEGIN
  ALTER TABLE public.staff
    ADD CONSTRAINT chk_termination_after_hire
    CHECK (termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- 1c. Trigger: block time entry after termination date
CREATE OR REPLACE FUNCTION public.enforce_termination_date()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_term date;
BEGIN
  SELECT termination_date INTO v_term
  FROM staff WHERE staff_id = NEW.staff_id;
  IF v_term IS NOT NULL AND NEW.date_worked > v_term THEN
    RAISE EXCEPTION 'TERMINATION_DATE_BLOCKED: Cannot log time after termination date %', v_term;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_termination_date ON public.time_entries;
CREATE TRIGGER trg_enforce_termination_date
BEFORE INSERT OR UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_termination_date();

-- 1d. Trigger: prevent staff reactivation (No-Reingreso DB guard)
CREATE OR REPLACE FUNCTION public.prevent_staff_reactivation()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.is_active = false AND NEW.is_active = true THEN
    RAISE EXCEPTION 'REACTIVATION_BLOCKED: Staff reactivation is not permitted. Delete the record and create a new one.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_staff_reactivation ON public.staff;
CREATE TRIGGER trg_prevent_staff_reactivation
  BEFORE UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_staff_reactivation();

-- 1e. Update unique indexes to exclude soft-deleted records
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_email_key;
DROP INDEX IF EXISTS idx_staff_email_unique;
CREATE UNIQUE INDEX idx_staff_email_unique
  ON public.staff (LOWER(TRIM(email)))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

DROP INDEX IF EXISTS idx_staff_id_number_unique;
CREATE UNIQUE INDEX idx_staff_id_number_unique
  ON public.staff (id_number)
  WHERE id_number IS NOT NULL AND TRIM(id_number) != '' AND deleted_at IS NULL;

-- 1f. RPC: check_pending_hours_before_termination
CREATE OR REPLACE FUNCTION public.check_pending_hours_before_termination(
  p_staff_id uuid,
  p_termination_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hire_date date;
  v_capacity numeric;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_gap numeric;
  v_result jsonb := '[]'::jsonb;
BEGIN
  SELECT hire_date, weekly_capacity_hours
  INTO v_hire_date, v_capacity
  FROM staff WHERE staff_id = p_staff_id;

  IF v_hire_date IS NULL THEN
    v_hire_date := p_termination_date;
  END IF;

  v_daily := COALESCE(v_capacity, 40) / 5.0;

  v_cursor := v_hire_date - (EXTRACT(ISODOW FROM v_hire_date)::int - 1);

  WHILE v_cursor <= p_termination_date LOOP
    v_week_end := v_cursor + 4;

    v_eff_start := GREATEST(v_cursor, v_hire_date);
    v_eff_end := LEAST(v_week_end, p_termination_date);

    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(*) INTO v_holiday_count
    FROM holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5;

    v_working_days := v_working_days - v_holiday_count;

    IF v_working_days > 0 THEN
      v_expected := v_working_days * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_gap := v_expected - v_actual;

      IF v_gap > 0 THEN
        v_result := v_result || jsonb_build_object(
          'week_start', v_cursor,
          'effective_start', v_eff_start,
          'effective_end', v_eff_end,
          'expected_hours', v_expected,
          'actual_hours', v_actual,
          'gap', v_gap
        );
      END IF;
    END IF;

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;
