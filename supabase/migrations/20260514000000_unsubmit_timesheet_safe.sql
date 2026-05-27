-- Bug 0508-105: Allow Partners to withdraw auto-approved timesheets within the same week.
-- Creates a SECURITY DEFINER RPC so the caller can reset their own approved lines
-- (RLS blocks self-approval updates via the client).

CREATE OR REPLACE FUNCTION public.unsubmit_timesheet_safe(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id     uuid;
  v_period       record;
  v_all_approved boolean;
BEGIN
  -- 1. Resolve caller's staff_id via auth.uid()
  SELECT s.staff_id
    INTO v_staff_id
    FROM staff s
   WHERE s.auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_OWNER';
  END IF;

  -- 2. Load and row-lock the period
  SELECT tp.*
    INTO v_period
    FROM timesheet_periods tp
   WHERE tp.period_id = p_period_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_OWNER';
  END IF;

  -- 3. Caller must own the period
  IF v_period.staff_id IS DISTINCT FROM v_staff_id THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_OWNER';
  END IF;

  -- 4. Reject hard-locked periods
  IF v_period.is_period_locked THEN
    RAISE EXCEPTION 'UNSUBMIT_PERIOD_LOCKED';
  END IF;

  -- 5. Reject periods that were never submitted
  IF v_period.submitted_at IS NULL THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_SUBMITTED';
  END IF;

  -- 6. Detect fully-approved status
  SELECT bool_and(tla.status = 'approved')
    INTO v_all_approved
    FROM timesheet_line_approvals tla
   WHERE tla.period_id = p_period_id;

  -- 6b. Only partners can recall a fully-approved period
  IF v_all_approved THEN
    IF NOT EXISTS (
      SELECT 1 FROM user_roles
       WHERE user_id = auth.uid()
         AND role    = 'partner'
    ) THEN
      RAISE EXCEPTION 'UNSUBMIT_NOT_PARTNER';
    END IF;
  END IF;

  -- 7. Week-window guard (only for fully-approved periods)
  --    current_date is UTC; frontend provides the first enforcement layer.
  --    Decision OQ1: UTC-only (safe over-restriction near week boundaries).
  --    Decision OQ5: Mon–Sun inclusive (+6 days from week_start_date).
  IF v_all_approved THEN
    IF current_date NOT BETWEEN v_period.week_start_date
                             AND v_period.week_start_date + 6 THEN
      RAISE EXCEPTION 'APPROVED_WEEK_RECALL_WINDOW_CLOSED';
    END IF;
  END IF;

  -- 8. Clear submitted_at
  UPDATE timesheet_periods
     SET submitted_at = NULL
   WHERE period_id = p_period_id;

  -- 9. Reset approved line approvals so the APPROVED_LINE_LOCKED trigger
  --    no longer blocks edits to the underlying time entries.
  IF v_all_approved THEN
    UPDATE timesheet_line_approvals
       SET status       = 'pending',
           approved_by  = NULL,
           approved_at  = NULL,
           review_notes = NULL
     WHERE period_id = p_period_id
       AND status    = 'approved';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unsubmit_timesheet_safe(uuid) TO authenticated;
