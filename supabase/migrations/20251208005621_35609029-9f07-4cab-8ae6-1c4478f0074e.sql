-- ============================================
-- Phase B: Line-Level Timesheet Approval System
-- ============================================

-- Step 1: Create timesheet_line_approvals table
CREATE TABLE public.timesheet_line_approvals (
  approval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES public.timesheet_periods(period_id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id),
  status VARCHAR NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.staff(staff_id),
  approved_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(period_id, engagement_id)
);

-- Enable RLS
ALTER TABLE public.timesheet_line_approvals ENABLE ROW LEVEL SECURITY;

-- Step 2: Create helper function to determine line approver
CREATE OR REPLACE FUNCTION public.get_line_approver(p_staff_id UUID, p_engagement_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_display_order INTEGER;
  v_engagement RECORD;
BEGIN
  -- Get staff's category display_order
  SELECT c.display_order INTO v_staff_display_order
  FROM staff s
  JOIN categories c ON s.category_id = c.category_id
  WHERE s.staff_id = p_staff_id;

  -- If staff is Partner/Director (display_order <= 2), auto-approved (return NULL)
  IF v_staff_display_order IS NOT NULL AND v_staff_display_order <= 2 THEN
    RETURN NULL;
  END IF;

  -- Get engagement team
  SELECT manager_id, partner_id INTO v_engagement
  FROM engagements
  WHERE engagement_id = p_engagement_id;

  -- If staff is Manager (display_order 3-4), return partner_id
  IF v_staff_display_order IS NOT NULL AND v_staff_display_order <= 4 THEN
    RETURN v_engagement.partner_id;
  END IF;

  -- Otherwise (Staff/Junior/Senior), return manager_id first, fallback to partner_id
  IF v_engagement.manager_id IS NOT NULL THEN
    RETURN v_engagement.manager_id;
  END IF;

  RETURN v_engagement.partner_id;
END;
$$;

-- Step 3: Create function to check if user can approve a specific line
CREATE OR REPLACE FUNCTION public.can_approve_timesheet_line(
  p_approver_auth_id UUID, 
  p_period_id UUID, 
  p_engagement_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approver_staff_id UUID;
  v_period_staff_id UUID;
  v_expected_approver UUID;
  v_approver_display_order INTEGER;
BEGIN
  -- Get approver's staff_id
  SELECT staff_id INTO v_approver_staff_id
  FROM staff
  WHERE auth_user_id = p_approver_auth_id;

  IF v_approver_staff_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get approver's category display_order and check can_approve_timesheets
  SELECT c.display_order INTO v_approver_display_order
  FROM staff s
  JOIN categories c ON s.category_id = c.category_id
  WHERE s.staff_id = v_approver_staff_id
    AND c.can_approve_timesheets = TRUE;

  IF v_approver_display_order IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get the period's staff_id
  SELECT staff_id INTO v_period_staff_id
  FROM timesheet_periods
  WHERE period_id = p_period_id;

  IF v_period_staff_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Prevent self-approval
  IF v_approver_staff_id = v_period_staff_id THEN
    RETURN FALSE;
  END IF;

  -- Get expected approver for this line
  v_expected_approver := get_line_approver(v_period_staff_id, p_engagement_id);

  -- If auto-approved (NULL), no one should approve
  IF v_expected_approver IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if this approver matches the expected approver
  -- OR if approver is higher ranked (partner can approve manager's team)
  RETURN v_approver_staff_id = v_expected_approver
    OR v_approver_display_order < (
      SELECT c.display_order 
      FROM staff s 
      JOIN categories c ON s.category_id = c.category_id 
      WHERE s.staff_id = v_expected_approver
    );
END;
$$;

-- Step 4: RLS Policies for timesheet_line_approvals

-- Staff can view their own line approvals
CREATE POLICY "Staff can view own line approvals"
ON public.timesheet_line_approvals
FOR SELECT
USING (
  period_id IN (
    SELECT tp.period_id FROM timesheet_periods tp
    JOIN staff s ON tp.staff_id = s.staff_id
    WHERE s.auth_user_id = auth.uid()
  )
);

-- Staff can create pending approvals for their own periods
CREATE POLICY "Staff can create own line approvals"
ON public.timesheet_line_approvals
FOR INSERT
WITH CHECK (
  period_id IN (
    SELECT tp.period_id FROM timesheet_periods tp
    JOIN staff s ON tp.staff_id = s.staff_id
    WHERE s.auth_user_id = auth.uid()
  )
);

-- Approvers can view lines they're authorized to approve
CREATE POLICY "Approvers can view assigned line approvals"
ON public.timesheet_line_approvals
FOR SELECT
USING (
  can_approve_timesheet_line(auth.uid(), period_id, engagement_id)
);

-- Approvers can update (approve/reject) lines they're authorized for
CREATE POLICY "Approvers can update assigned line approvals"
ON public.timesheet_line_approvals
FOR UPDATE
USING (
  can_approve_timesheet_line(auth.uid(), period_id, engagement_id)
);

-- Partners/Directors can view all (firm-wide oversight)
CREATE POLICY "Leadership can view all line approvals"
ON public.timesheet_line_approvals
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff s
    JOIN categories c ON s.category_id = c.category_id
    WHERE s.auth_user_id = auth.uid()
      AND c.display_order <= 2
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_timesheet_line_approvals_updated_at
BEFORE UPDATE ON public.timesheet_line_approvals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();