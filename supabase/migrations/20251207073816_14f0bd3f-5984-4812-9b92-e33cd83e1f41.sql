-- Step 2.2: Hierarchical Timesheet Approval Schema Changes

-- 1. Add supervisor_id to staff table (fallback for non-engagement time)
ALTER TABLE staff 
ADD COLUMN supervisor_id UUID REFERENCES staff(staff_id);

-- 2. Add can_approve_timesheets to categories table
ALTER TABLE categories 
ADD COLUMN can_approve_timesheets BOOLEAN DEFAULT false;

-- Set can_approve_timesheets for Senior and above (display_order <= 4)
UPDATE categories 
SET can_approve_timesheets = true 
WHERE display_order <= 4;

-- 3. Create helper function to check if staff category is auto-approved (Socio/Director)
CREATE OR REPLACE FUNCTION public.is_auto_approved_category(p_staff_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM staff s
    JOIN categories c ON s.category_id = c.category_id
    WHERE s.staff_id = p_staff_id
      AND c.display_order <= 2
  )
$$;

-- 4. Create function to get valid timesheet approvers for a staff member and week
CREATE OR REPLACE FUNCTION public.get_timesheet_approvers(p_staff_id UUID, p_week_start DATE)
RETURNS TABLE(approver_staff_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submitter_display_order INTEGER;
BEGIN
  -- Get the submitter's display_order
  SELECT c.display_order INTO v_submitter_display_order
  FROM staff s
  JOIN categories c ON s.category_id = c.category_id
  WHERE s.staff_id = p_staff_id;

  -- If submitter has no category or display_order, return empty
  IF v_submitter_display_order IS NULL THEN
    RETURN;
  END IF;

  -- Return approvers from engagements where staff logged time that week
  -- Approvers must have LOWER display_order (higher rank) and not be self
  RETURN QUERY
  SELECT DISTINCT potential_approver.staff_id
  FROM (
    -- Get manager_id and partner_id from engagements where staff logged time
    SELECT e.manager_id AS staff_id
    FROM time_entries te
    JOIN engagements e ON te.engagement_id = e.engagement_id
    WHERE te.staff_id = p_staff_id
      AND te.date_worked >= p_week_start
      AND te.date_worked < p_week_start + INTERVAL '7 days'
      AND e.manager_id IS NOT NULL
    
    UNION
    
    SELECT e.partner_id AS staff_id
    FROM time_entries te
    JOIN engagements e ON te.engagement_id = e.engagement_id
    WHERE te.staff_id = p_staff_id
      AND te.date_worked >= p_week_start
      AND te.date_worked < p_week_start + INTERVAL '7 days'
      AND e.partner_id IS NOT NULL
    
    UNION
    
    -- Also include the staff's supervisor as fallback
    SELECT s.supervisor_id AS staff_id
    FROM staff s
    WHERE s.staff_id = p_staff_id
      AND s.supervisor_id IS NOT NULL
  ) potential_approver
  JOIN staff approver_s ON potential_approver.staff_id = approver_s.staff_id
  JOIN categories approver_c ON approver_s.category_id = approver_c.category_id
  WHERE potential_approver.staff_id != p_staff_id  -- No self-approval
    AND approver_c.display_order < v_submitter_display_order  -- Must be higher rank
    AND approver_c.can_approve_timesheets = true;  -- Must have permission
END;
$$;

-- 5. Create RLS helper function to check if user can approve a specific timesheet period
CREATE OR REPLACE FUNCTION public.can_approve_timesheet(p_approver_auth_id UUID, p_period_id UUID)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_approver_staff_id UUID;
BEGIN
  -- Get the approver's staff_id
  SELECT staff_id INTO v_approver_staff_id
  FROM staff
  WHERE auth_user_id = p_approver_auth_id;

  IF v_approver_staff_id IS NULL THEN
    RETURN false;
  END IF;

  -- Get the period details
  SELECT tp.staff_id, tp.week_start_date
  INTO v_period
  FROM timesheet_periods tp
  WHERE tp.period_id = p_period_id;

  IF v_period IS NULL THEN
    RETURN false;
  END IF;

  -- Check if the approver is in the list of valid approvers
  RETURN EXISTS (
    SELECT 1 
    FROM get_timesheet_approvers(v_period.staff_id, v_period.week_start_date) gta
    WHERE gta.approver_staff_id = v_approver_staff_id
  );
END;
$$;

-- 6. Add new RLS policies for timesheet approval
-- Approvers can view timesheets they're assigned to approve
CREATE POLICY "Approvers can view assigned timesheets"
ON timesheet_periods
FOR SELECT
USING (can_approve_timesheet(auth.uid(), period_id));

-- Approvers can update timesheets they're assigned to approve (for approval/rejection)
CREATE POLICY "Approvers can update assigned timesheets"
ON timesheet_periods
FOR UPDATE
USING (can_approve_timesheet(auth.uid(), period_id));