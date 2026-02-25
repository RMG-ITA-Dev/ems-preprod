DO $$
DECLARE
  v_daily_limit numeric;
  v_weekly_limit numeric;
BEGIN
  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'DAILY_LIMIT'), 8
  ) INTO v_daily_limit;

  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_LIMIT'), 40
  ) INTO v_weekly_limit;

  INSERT INTO global_settings (setting_key, setting_value, description)
  VALUES ('DAILY_MIN', '8', 'Minimum hours per day (visual indicator in timesheet grid)')
  ON CONFLICT (setting_key) DO NOTHING;

  INSERT INTO global_settings (setting_key, setting_value, description)
  VALUES ('DAILY_MAX', v_daily_limit::text, 'Maximum hours per day (visual indicator and tracker guard)')
  ON CONFLICT (setting_key) DO NOTHING;

  INSERT INTO global_settings (setting_key, setting_value, description)
  VALUES ('WEEKLY_MIN', '40', 'Minimum weekly hours required to submit timesheet')
  ON CONFLICT (setting_key) DO NOTHING;

  INSERT INTO global_settings (setting_key, setting_value, description)
  VALUES ('WEEKLY_MAX', v_weekly_limit::text, 'Maximum weekly hours allowed to submit timesheet')
  ON CONFLICT (setting_key) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.update_timesheet_minmax_settings(
  p_daily_min numeric,
  p_daily_max numeric,
  p_weekly_min numeric,
  p_weekly_max numeric,
  p_work_days integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_daily_min > p_daily_max THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DAILY_MIN_EXCEEDS_MAX');
  END IF;

  IF p_weekly_min > p_weekly_max THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MIN_EXCEEDS_MAX');
  END IF;

  IF p_weekly_min > p_daily_max * p_work_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MIN_EXCEEDS_DAILY_MAX');
  END IF;

  IF p_weekly_max < p_daily_min * p_work_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MAX_BELOW_DAILY_MIN');
  END IF;

  UPDATE global_settings SET setting_value = p_daily_min::text, updated_at = now()
  WHERE setting_key = 'DAILY_MIN';
  UPDATE global_settings SET setting_value = p_daily_max::text, updated_at = now()
  WHERE setting_key = 'DAILY_MAX';
  UPDATE global_settings SET setting_value = p_weekly_min::text, updated_at = now()
  WHERE setting_key = 'WEEKLY_MIN';
  UPDATE global_settings SET setting_value = p_weekly_max::text, updated_at = now()
  WHERE setting_key = 'WEEKLY_MAX';

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_timesheet_safe(p_period_id uuid, p_staff_id uuid, p_engagement_ids uuid[], p_is_auto_approved boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- ARCHITECTURE NOTE (Plan 0220-50 Amendment A4):
  -- timesheet_periods.status is vestigial. Authoritative workflow state
  -- derives from submitted_at + timesheet_line_approvals rows.
  -- This function writes submitted_at (not status) and manages
  -- timesheet_line_approvals transitions directly.

  v_period RECORD;
  v_existing RECORD;
  v_eng_id uuid;
  v_max_te_updated timestamptz;
  v_affected integer;

  -- Counters
  v_preserved_approved integer := 0;
  v_reset_to_pending integer := 0;
  v_kept_rejected integer := 0;
  v_new_pending integer := 0;
  v_new_auto_approved integer := 0;
  v_guarded_update_skips integer := 0;

  -- Min/max validation
  v_weekly_min numeric;
  v_weekly_max numeric;
  v_actual_hours numeric;
BEGIN
  -- 1. SANITIZE: Remove NULLs and duplicates
  p_engagement_ids := ARRAY(
    SELECT DISTINCT unnest
    FROM unnest(p_engagement_ids)
    WHERE unnest IS NOT NULL
  );

  IF array_length(p_engagement_ids, 1) IS NULL OR array_length(p_engagement_ids, 1) = 0 THEN
    RAISE EXCEPTION 'EMPTY_ENGAGEMENTS: No valid engagement IDs after sanitization';
  END IF;

  -- 2. LOCK: Acquire row-level lock on period
  SELECT period_id, staff_id, submitted_at
  INTO v_period
  FROM timesheet_periods
  WHERE period_id = p_period_id AND staff_id = p_staff_id
  FOR UPDATE;

  IF v_period IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Period % does not exist or does not belong to staff %', p_period_id, p_staff_id;
  END IF;

  -- BUG 0213-36: Enforce weekly min/max (period-scoped)
  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_MIN'), 40
  ) INTO v_weekly_min;

  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_MAX'), 40
  ) INTO v_weekly_max;

  SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual_hours
  FROM time_entries te
  WHERE te.period_id = p_period_id
    AND te.staff_id = p_staff_id
    AND te.is_forecast = false;

  IF v_actual_hours < v_weekly_min THEN
    RAISE EXCEPTION 'WEEKLY_MIN_NOT_MET:actual=%,min=%', v_actual_hours, v_weekly_min;
  END IF;

  IF v_actual_hours > v_weekly_max THEN
    RAISE EXCEPTION 'WEEKLY_MAX_EXCEEDED:actual=%,max=%', v_actual_hours, v_weekly_max;
  END IF;

  -- 3. UPDATE PERIOD: Set submitted_at (fires trg_validate_submission_has_entries)
  UPDATE timesheet_periods
  SET submitted_at = now()
  WHERE period_id = p_period_id;

  -- 4-7. Process each engagement
  FOREACH v_eng_id IN ARRAY p_engagement_ids
  LOOP
    -- 4. Fetch existing line approval
    SELECT approval_id, status, updated_at
    INTO v_existing
    FROM timesheet_line_approvals
    WHERE period_id = p_period_id AND engagement_id = v_eng_id;

    IF FOUND THEN
      -- b. Approved: SKIP
      IF v_existing.status = 'approved' THEN
        v_preserved_approved := v_preserved_approved + 1;
        CONTINUE;
      END IF;

      -- c. Pending: SKIP
      IF v_existing.status = 'pending' THEN
        CONTINUE;
      END IF;

      -- d. Rejected: check modified-since-rejection
      IF v_existing.status = 'rejected' THEN
        SELECT MAX(te.updated_at)
        INTO v_max_te_updated
        FROM time_entries te
        WHERE te.period_id = p_period_id
          AND te.engagement_id = v_eng_id
          AND te.is_forecast = false;

        IF v_max_te_updated IS NOT NULL AND v_max_te_updated > v_existing.updated_at THEN
          -- Modified since rejection: reset to pending with guarded UPDATE
          v_affected := 0;
          UPDATE timesheet_line_approvals
          SET status = 'pending',
              approved_by = NULL,
              approved_at = NULL,
              review_notes = NULL
          WHERE period_id = p_period_id
            AND engagement_id = v_eng_id
            AND status = 'rejected';

          GET DIAGNOSTICS v_affected = ROW_COUNT;

          IF v_affected = 0 THEN
            -- Concurrent approval changed status between read and write
            v_guarded_update_skips := v_guarded_update_skips + 1;
            v_preserved_approved := v_preserved_approved + 1;
          ELSE
            v_reset_to_pending := v_reset_to_pending + 1;
          END IF;
        ELSE
          -- Not modified since rejection: keep rejected
          v_kept_rejected := v_kept_rejected + 1;
        END IF;

        CONTINUE;
      END IF;
    ELSE
      -- e. No existing row: INSERT
      IF p_is_auto_approved THEN
        INSERT INTO timesheet_line_approvals (period_id, engagement_id, status, approved_by, approved_at)
        VALUES (p_period_id, v_eng_id, 'approved', p_staff_id, now());
        v_new_auto_approved := v_new_auto_approved + 1;
      ELSE
        INSERT INTO timesheet_line_approvals (period_id, engagement_id, status)
        VALUES (p_period_id, v_eng_id, 'pending');
        v_new_pending := v_new_pending + 1;
      END IF;
    END IF;
  END LOOP;

  -- 7. Return summary
  RETURN jsonb_build_object(
    'period_id', p_period_id,
    'preserved_approved', v_preserved_approved,
    'reset_to_pending', v_reset_to_pending,
    'kept_rejected', v_kept_rejected,
    'new_pending', v_new_pending,
    'new_auto_approved', v_new_auto_approved,
    'guarded_update_skips', v_guarded_update_skips
  );
END;
$function$