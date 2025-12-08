-- Phase A: Remove static supervisor_id from staff table

-- First, update the get_timesheet_approvers function to remove supervisor_id fallback
CREATE OR REPLACE FUNCTION public.get_timesheet_approvers(p_staff_id uuid, p_week_start date)
 RETURNS TABLE(approver_staff_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Get manager_id from engagements where staff logged time
    SELECT e.manager_id AS staff_id
    FROM time_entries te
    JOIN engagements e ON te.engagement_id = e.engagement_id
    WHERE te.staff_id = p_staff_id
      AND te.date_worked >= p_week_start
      AND te.date_worked < p_week_start + INTERVAL '7 days'
      AND e.manager_id IS NOT NULL
    
    UNION
    
    -- Get partner_id from engagements where staff logged time
    SELECT e.partner_id AS staff_id
    FROM time_entries te
    JOIN engagements e ON te.engagement_id = e.engagement_id
    WHERE te.staff_id = p_staff_id
      AND te.date_worked >= p_week_start
      AND te.date_worked < p_week_start + INTERVAL '7 days'
      AND e.partner_id IS NOT NULL
    
    -- NOTE: supervisor_id fallback removed - approvers now come ONLY from engagement team
  ) potential_approver
  JOIN staff approver_s ON potential_approver.staff_id = approver_s.staff_id
  JOIN categories approver_c ON approver_s.category_id = approver_c.category_id
  WHERE potential_approver.staff_id != p_staff_id  -- No self-approval
    AND approver_c.display_order < v_submitter_display_order  -- Must be higher rank
    AND approver_c.can_approve_timesheets = true;  -- Must have permission
END;
$function$;

-- Now drop the supervisor_id column from staff table
ALTER TABLE staff DROP COLUMN IF EXISTS supervisor_id;