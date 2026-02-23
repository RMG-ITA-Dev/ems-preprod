
-- Bug 0220-51: submit_timesheet_safe RPC
-- Replaces client-side blind upsert with server-side state machine

CREATE OR REPLACE FUNCTION public.submit_timesheet_safe(
  p_period_id uuid,
  p_staff_id uuid,
  p_engagement_ids uuid[],
  p_is_auto_approved boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;
