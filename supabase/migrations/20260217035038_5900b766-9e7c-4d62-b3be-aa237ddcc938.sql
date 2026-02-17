
-- A) Pre-cleanup: Finalize existing orphaned timers
UPDATE timer_entries
SET ended_at = started_at + interval '8 hours',
    duration_minutes = 480
WHERE ended_at IS NULL
  AND started_at < now() - interval '8 hours';

-- B) Partial unique index -- one running timer per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_running_timer_per_staff
ON timer_entries (staff_id)
WHERE ended_at IS NULL;

-- C) Validation trigger -- 8h cap on persisted entries
CREATE OR REPLACE FUNCTION validate_timer_entry_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL THEN
    IF NEW.ended_at > NEW.started_at + interval '8 hours' THEN
      RAISE EXCEPTION 'Timer entry cannot exceed 8 hours';
    END IF;
  END IF;
  IF NEW.duration_minutes IS NOT NULL AND NEW.duration_minutes > 480 THEN
    RAISE EXCEPTION 'Duration cannot exceed 480 minutes (8 hours)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_timer_duration
BEFORE INSERT OR UPDATE ON timer_entries
FOR EACH ROW
EXECUTE FUNCTION validate_timer_entry_duration();

-- D) RPC: start_timer_entry
CREATE OR REPLACE FUNCTION start_timer_entry(
  p_engagement_id uuid,
  p_activity_id uuid,
  p_description text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_staff_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  SELECT staff_id INTO v_staff_id
  FROM staff WHERE auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'No staff record linked to current user';
  END IF;

  SELECT timer_id INTO v_existing_id
  FROM timer_entries
  WHERE staff_id = v_staff_id AND ended_at IS NULL;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'RUNNING_TIMER_EXISTS:%', v_existing_id;
  END IF;

  INSERT INTO timer_entries (staff_id, engagement_id, activity_id, description, started_at)
  VALUES (v_staff_id, p_engagement_id, p_activity_id, p_description, now())
  RETURNING timer_id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- E) RPC: stop_timer_entry
CREATE OR REPLACE FUNCTION stop_timer_entry(
  p_timer_id uuid,
  p_ended_at timestamptz DEFAULT now()
) RETURNS TABLE(timer_id uuid, duration_minutes integer) AS $$
DECLARE
  v_staff_id uuid;
  v_started_at timestamptz;
  v_clamped_end timestamptz;
  v_raw_minutes numeric;
  v_duration integer;
BEGIN
  SELECT s.staff_id INTO v_staff_id
  FROM staff s WHERE s.auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'No staff record linked to current user';
  END IF;

  SELECT te.started_at INTO v_started_at
  FROM timer_entries te
  WHERE te.timer_id = p_timer_id
    AND te.staff_id = v_staff_id
    AND te.ended_at IS NULL;

  IF v_started_at IS NULL THEN
    RAISE EXCEPTION 'Timer not found, not yours, or already stopped';
  END IF;

  v_clamped_end := LEAST(p_ended_at, v_started_at + interval '8 hours');
  v_raw_minutes := EXTRACT(EPOCH FROM (v_clamped_end - v_started_at)) / 60;
  v_duration := LEAST(480, GREATEST(5, ROUND(v_raw_minutes / 5.0) * 5));

  UPDATE timer_entries te
  SET ended_at = v_clamped_end,
      duration_minutes = v_duration
  WHERE te.timer_id = p_timer_id;

  RETURN QUERY SELECT p_timer_id, v_duration;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- F) RPC: finalize_my_stale_timers
CREATE OR REPLACE FUNCTION finalize_my_stale_timers()
RETURNS integer AS $$
DECLARE
  v_staff_id uuid;
  v_count integer;
BEGIN
  SELECT staff_id INTO v_staff_id
  FROM staff WHERE auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN RETURN 0; END IF;

  UPDATE timer_entries
  SET ended_at = started_at + interval '8 hours',
      duration_minutes = 480
  WHERE ended_at IS NULL
    AND staff_id = v_staff_id
    AND started_at < now() - interval '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- G) RPC: finalize_all_stale_timers (service-role only)
CREATE OR REPLACE FUNCTION finalize_all_stale_timers()
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE timer_entries
  SET ended_at = started_at + interval '8 hours',
      duration_minutes = 480
  WHERE ended_at IS NULL
    AND started_at < now() - interval '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

REVOKE EXECUTE ON FUNCTION finalize_all_stale_timers() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION finalize_all_stale_timers() FROM authenticated;
REVOKE EXECUTE ON FUNCTION finalize_all_stale_timers() FROM anon;
GRANT EXECUTE ON FUNCTION finalize_all_stale_timers() TO service_role;

-- H) Scheduled job (guarded)
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'finalize-stale-timers',
      '*/15 * * * *',
      'SELECT finalize_all_stale_timers()'
    );
  END IF;
END $outer$;
