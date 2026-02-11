-- =============================================================================
-- Migration: Create batch approval eligibility function
-- Replaces N individual can_approve_timesheet_line RPCs with one call.
-- The existing scalar function is NOT dropped (still used by RLS policies).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_approvable_pairs(
  p_period_ids UUID[],
  p_engagement_ids UUID[]
)
RETURNS TABLE(period_id UUID, engagement_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approver_auth_id UUID := auth.uid();    -- server-enforced, unforgeable
  v_approver_staff_id UUID;
  v_approver_display_order INTEGER;
  v_pair_count INTEGER;
  i INTEGER;
  v_period_staff_id UUID;
  v_expected_approver UUID;
  v_expected_display_order INTEGER;
BEGIN
  -- ── INVARIANT: Resolve approver ONCE ──────────────────────────────

  -- Step 1: Get approver's staff_id from auth user
  SELECT s.staff_id INTO v_approver_staff_id
  FROM staff s
  WHERE s.auth_user_id = v_approver_auth_id;

  IF v_approver_staff_id IS NULL THEN
    RETURN;  -- No staff record → can't approve anything
  END IF;

  -- Step 2: Get approver's display_order (must have can_approve_timesheets)
  SELECT c.display_order INTO v_approver_display_order
  FROM staff s
  JOIN categories c ON s.category_id = c.category_id
  WHERE s.staff_id = v_approver_staff_id
    AND c.can_approve_timesheets = TRUE;

  IF v_approver_display_order IS NULL THEN
    RETURN;  -- Approver's category can't approve → empty result
  END IF;

  -- ── VALIDATE INPUTS ───────────────────────────────────────────────

  v_pair_count := array_length(p_period_ids, 1);

  -- Defensive: mismatched arrays or empty
  IF v_pair_count IS NULL
     OR v_pair_count != COALESCE(array_length(p_engagement_ids, 1), 0) THEN
    RETURN;
  END IF;

  -- ── LOOP THROUGH PAIRS ────────────────────────────────────────────

  FOR i IN 1..v_pair_count LOOP
    -- Step 3: Get this period's staff_id
    SELECT tp.staff_id INTO v_period_staff_id
    FROM timesheet_periods tp
    WHERE tp.period_id = p_period_ids[i];

    IF v_period_staff_id IS NULL THEN
      CONTINUE;  -- Invalid period, skip
    END IF;

    -- Step 4: Self-approval check
    IF v_approver_staff_id = v_period_staff_id THEN
      CONTINUE;  -- Can't approve own timesheet
    END IF;

    -- Step 5: Get expected approver for this (staff, engagement)
    v_expected_approver := get_line_approver(v_period_staff_id, p_engagement_ids[i]);

    -- Step 6: Auto-approved lines (NULL) → no one should approve
    IF v_expected_approver IS NULL THEN
      CONTINUE;
    END IF;

    -- Step 7: Direct match OR higher-ranked approver
    IF v_approver_staff_id = v_expected_approver THEN
      -- 7a: Direct match — this is the assigned approver
      period_id := p_period_ids[i];
      engagement_id := p_engagement_ids[i];
      RETURN NEXT;
    ELSE
      -- 7b: Higher-rank fallback — partner can approve manager's assignments
      SELECT c.display_order INTO v_expected_display_order
      FROM staff s
      JOIN categories c ON s.category_id = c.category_id
      WHERE s.staff_id = v_expected_approver;

      IF v_expected_display_order IS NOT NULL
         AND v_approver_display_order < v_expected_display_order THEN
        period_id := p_period_ids[i];
        engagement_id := p_engagement_ids[i];
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Grant execute to authenticated users (matches existing RPC pattern)
GRANT EXECUTE ON FUNCTION public.get_approvable_pairs(UUID[], UUID[])
  TO authenticated;