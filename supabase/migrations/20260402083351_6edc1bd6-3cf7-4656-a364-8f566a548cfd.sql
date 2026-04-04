CREATE OR REPLACE FUNCTION public.submit_timesheet_safe(p_period_id uuid, p_staff_id uuid, p_engagement_ids uuid[], p_is_auto_approved boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period RECORD;
  v_existing RECORD;
  v_eng_id uuid;
  v_max_te_updated timestamptz;
  v_affected integer;

  -- Per-engagement approval policy (BUG 0220-61)
  v_skip_approval boolean;
  v_effective_auto boolean;
  v_upgraded_to_approved integer := 0;

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

  -- BUG 0306-74: Partial week proration
  v_hire_date date;
  v_term_date date;
  v_week_start date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_total_workdays integer;
  v_workable_days integer;
  v_work_days_setting integer;
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

  -- BUG 0306-74: Prorate weekly limits for partial weeks (hire/termination only)
  -- BUG 0402-XX: Holidays are NOT subtracted — staff must log 8h on holiday engagement
  SELECT s.hire_date, s.termination_date INTO v_hire_date, v_term_date FROM staff s WHERE s.staff_id = p_staff_id;
  SELECT tp.week_start_date INTO v_week_start FROM timesheet_periods tp WHERE tp.period_id = p_period_id;
  SELECT COALESCE((SELECT setting_value::int FROM global_settings WHERE setting_key = 'TS_WORK_DAYS'), 5) INTO v_work_days_setting;
  v_week_end := v_week_start + (v_work_days_setting - 1);

  -- Total weekdays in a full week
  SELECT COUNT(*) INTO v_total_workdays FROM generate_series(v_week_start, v_week_end, '1 day'::interval) d WHERE EXTRACT(ISODOW FROM d) <= v_work_days_setting;

  -- Clamp to hire/termination boundaries
  v_eff_start := v_week_start;
  v_eff_end := v_week_end;
  IF v_hire_date IS NOT NULL AND v_eff_start < v_hire_date THEN v_eff_start := v_hire_date; END IF;
  IF v_term_date IS NOT NULL AND v_eff_end > v_term_date THEN v_eff_end := v_term_date; END IF;

  -- Count workable weekdays in clamped range (hire/termination only, no holiday subtraction)
  SELECT COUNT(*) INTO v_workable_days FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d WHERE EXTRACT(ISODOW FROM d) <= v_work_days_setting;

  -- Proportional adjustment
  IF v_total_workdays > 0 AND v_workable_days < v_total_workdays THEN
    v_weekly_min := ROUND(v_weekly_min * v_workable_days::numeric / v_total_workdays::numeric, 1);
    v_weekly_max := ROUND(v_weekly_max * v_workable_days::numeric / v_total_workdays::numeric, 1);
  END IF;

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

  -- BUG 0220-63: Reject submission if any period entry violates engagement date window
  IF EXISTS (
    SELECT 1
    FROM time_entries te
    JOIN engagements e ON te.engagement_id = e.engagement_id
    WHERE te.period_id = p_period_id
      AND te.staff_id = p_staff_id
      AND te.is_forecast = false
      AND (
        (e.start_date IS NOT NULL AND te.date_worked < e.start_date)
        OR (e.end_date IS NOT NULL AND te.date_worked > e.end_date)
      )
  ) THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE_VIOLATION: Period contains entries outside engagement date range';
  END IF;

  -- 3. UPDATE PERIOD: Set submitted_at (fires trg_validate_submission_has_entries)
  UPDATE timesheet_periods
  SET submitted_at = now()
  WHERE period_id = p_period_id;

  -- 4-7. Process each engagement
  FOREACH v_eng_id IN ARRAY p_engagement_ids
  LOOP
    -- BUG 0220-61: Fetch per-engagement approval policy (fail-safe default true)
    SELECT NOT COALESCE(e.approval_required, true)
    INTO v_skip_approval
    FROM engagements e WHERE e.engagement_id = v_eng_id;

    v_effective_auto := p_is_auto_approved OR COALESCE(v_skip_approval, false);

    -- 4. Fetch existing line approval
    SELECT approval_id, status, updated_at
    INTO v_existing
    FROM timesheet_line_approvals
    WHERE period_id = p_period_id AND engagement_id = v_eng_id;

    IF FOUND THEN
      -- b. Approved: SKIP (never downgrade)
      IF v_existing.status = 'approved' THEN
        v_preserved_approved := v_preserved_approved + 1;
        CONTINUE;
      END IF;

      -- c. Pending: upgrade if effective auto-approve, otherwise skip
      IF v_existing.status = 'pending' THEN
        IF v_effective_auto THEN
          UPDATE timesheet_line_approvals
          SET status = 'approved',
              approved_by = p_staff_id,
              approved_at = now()
          WHERE period_id = p_period_id
            AND engagement_id = v_eng_id
            AND status = 'pending';
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          IF v_affected > 0 THEN
            v_upgraded_to_approved := v_upgraded_to_approved + 1;
          ELSE
            v_guarded_update_skips := v_guarded_update_skips + 1;
          END IF;
        END IF;
        CONTINUE;
      END IF;

      -- d. Rejected: auto-upgrade if effective auto, else check modified-since-rejection
      IF v_existing.status = 'rejected' THEN
        IF v_effective_auto THEN
          UPDATE timesheet_line_approvals
          SET status = 'approved',
              approved_by = p_staff_id,
              approved_at = now(),
              review_notes = NULL
          WHERE period_id = p_period_id
            AND engagement_id = v_eng_id
            AND status = 'rejected';
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          IF v_affected > 0 THEN
            v_upgraded_to_approved := v_upgraded_to_approved + 1;
          ELSE
            v_guarded_update_skips := v_guarded_update_skips + 1;
          END IF;
        ELSE
          SELECT MAX(te.updated_at)
          INTO v_max_te_updated
          FROM time_entries te
          WHERE te.period_id = p_period_id
            AND te.engagement_id = v_eng_id
            AND te.is_forecast = false;

          IF v_max_te_updated IS NOT NULL AND v_max_te_updated > v_existing.updated_at THEN
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
              v_guarded_update_skips := v_guarded_update_skips + 1;
              v_preserved_approved := v_preserved_approved + 1;
            ELSE
              v_reset_to_pending := v_reset_to_pending + 1;
            END IF;
          ELSE
            v_kept_rejected := v_kept_rejected + 1;
          END IF;
        END IF;

        CONTINUE;
      END IF;
    ELSE
      -- e. No existing row: INSERT
      IF v_effective_auto THEN
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
    'guarded_update_skips', v_guarded_update_skips,
    'upgraded_to_approved', v_upgraded_to_approved
  );
END;
$function$;