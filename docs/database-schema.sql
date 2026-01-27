-- ============================================================================
-- EMS 2.0 Complete Database Schema
-- Generated: 2026-01-27
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE public.app_role AS ENUM (
  'admin',
  'staff',
  'viewer',
  'partner',
  'director',
  'manager',
  'senior',
  'semisenior'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Activity Codes
CREATE TABLE public.activity_codes (
  activity_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_code VARCHAR(10) NOT NULL,
  description VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  default_category_id UUID REFERENCES public.categories(category_id)
);

-- Activity Worksheet Cells
CREATE TABLE public.activity_worksheet_cells (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worksheet_id UUID NOT NULL REFERENCES public.activity_worksheets(id),
  category_id UUID NOT NULL REFERENCES public.categories(category_id),
  activity_id UUID NOT NULL REFERENCES public.activity_codes(activity_id),
  budget_hours NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activity Worksheets
CREATE TABLE public.activity_worksheets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id),
  wo_id UUID REFERENCES public.work_orders(wo_id),
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by_staff_id UUID REFERENCES public.staff(staff_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categories (Staff Categories with Rates)
CREATE TABLE public.categories (
  category_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name VARCHAR(50) NOT NULL,
  rate_high_bob NUMERIC NOT NULL DEFAULT 0,
  rate_low_bob NUMERIC NOT NULL DEFAULT 0,
  rate_high_usd NUMERIC NOT NULL DEFAULT 0,
  rate_low_usd NUMERIC NOT NULL DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  can_approve_wo BOOLEAN DEFAULT false,
  can_approve_timesheets BOOLEAN DEFAULT false
);

-- Clients
CREATE TABLE public.clients (
  client_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_legal_name VARCHAR(255) NOT NULL,
  unique_tax_id VARCHAR(50) NOT NULL,
  industry_id UUID REFERENCES public.industries(industry_id),
  contact_name VARCHAR(200),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Engagements
CREATE TABLE public.engagements (
  engagement_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(client_id),
  engagement_name VARCHAR(255) NOT NULL,
  engagement_code VARCHAR(50),
  partner_id UUID REFERENCES public.staff(staff_id),
  manager_id UUID REFERENCES public.staff(staff_id),
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Expense Logs
CREATE TABLE public.expense_logs (
  expense_log_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date_incurred DATE NOT NULL,
  amount NUMERIC NOT NULL,
  currency VARCHAR(3) DEFAULT 'BOB',
  engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id),
  expense_type_id UUID NOT NULL REFERENCES public.expense_types(expense_type_id),
  description TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Expense Types
CREATE TABLE public.expense_types (
  expense_type_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_name VARCHAR(100) NOT NULL,
  default_unit_cost NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Global Settings
CREATE TABLE public.global_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Industries
CREATE TABLE public.industries (
  industry_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  industry_name VARCHAR(100) NOT NULL,
  fiscal_year_end VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Staff
CREATE TABLE public.staff (
  staff_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  category_id UUID REFERENCES public.categories(category_id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  short_name VARCHAR(50),
  initials VARCHAR(4),
  city VARCHAR(100),
  id_number VARCHAR(50),
  aud_reg_number VARCHAR(50)
);

-- Staff Capacity
CREATE TABLE public.staff_capacity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(staff_id),
  weekly_capacity_hours NUMERIC NOT NULL DEFAULT 40,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Time Entries
CREATE TABLE public.time_entries (
  time_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date_worked DATE NOT NULL,
  hours_logged NUMERIC NOT NULL,
  staff_id UUID NOT NULL REFERENCES public.staff(staff_id),
  engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id),
  activity_id UUID NOT NULL REFERENCES public.activity_codes(activity_id),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  period_id UUID REFERENCES public.timesheet_periods(period_id),
  is_forecast BOOLEAN DEFAULT false
);

-- Timer Entries
CREATE TABLE public.timer_entries (
  timer_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(staff_id),
  engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id),
  activity_id UUID NOT NULL REFERENCES public.activity_codes(activity_id),
  description TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  is_imported BOOLEAN NOT NULL DEFAULT false,
  imported_to_time_id UUID REFERENCES public.time_entries(time_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Timesheet Line Approvals
CREATE TABLE public.timesheet_line_approvals (
  approval_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES public.timesheet_periods(period_id),
  engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id),
  approved_by UUID REFERENCES public.staff(staff_id),
  approved_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Timesheet Periods
CREATE TABLE public.timesheet_periods (
  period_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(staff_id),
  week_start_date DATE NOT NULL,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  deadline DATE,
  is_period_locked BOOLEAN DEFAULT false,
  total_hours NUMERIC DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User Roles
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WO Budget Lines
CREATE TABLE public.wo_budget_lines (
  wo_line_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wo_id UUID NOT NULL REFERENCES public.work_orders(wo_id),
  category_id UUID NOT NULL REFERENCES public.categories(category_id),
  budgeted_hours NUMERIC NOT NULL DEFAULT 0,
  standard_rate NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WO Expense Budget
CREATE TABLE public.wo_expense_budget (
  wo_exp_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wo_id UUID NOT NULL REFERENCES public.work_orders(wo_id),
  expense_type_id UUID NOT NULL REFERENCES public.expense_types(expense_type_id),
  budgeted_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Work Orders
CREATE TABLE public.work_orders (
  wo_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID NOT NULL UNIQUE REFERENCES public.engagements(engagement_id),
  currency VARCHAR(3) NOT NULL,
  season_mode VARCHAR(4) NOT NULL,
  tax_rate NUMERIC DEFAULT 0.13,
  adjustment_amount NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  approval_status VARCHAR(20) DEFAULT 'Draft',
  approved_by UUID REFERENCES public.staff(staff_id),
  approved_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_activity_worksheet_cells_activity ON public.activity_worksheet_cells (activity_id);
CREATE INDEX idx_activity_worksheet_cells_category ON public.activity_worksheet_cells (category_id);
CREATE INDEX idx_activity_worksheet_cells_worksheet ON public.activity_worksheet_cells (worksheet_id);
CREATE INDEX idx_activity_worksheets_engagement ON public.activity_worksheets (engagement_id);
CREATE INDEX idx_activity_worksheets_wo ON public.activity_worksheets (wo_id);
CREATE INDEX idx_staff_capacity_effective_dates ON public.staff_capacity (staff_id, effective_from, effective_to);
CREATE INDEX idx_staff_capacity_staff_id ON public.staff_capacity (staff_id);
CREATE INDEX idx_time_entries_period ON public.time_entries (period_id);
CREATE INDEX idx_timer_entries_is_imported ON public.timer_entries (is_imported);
CREATE INDEX idx_timer_entries_staff_id ON public.timer_entries (staff_id);
CREATE INDEX idx_timer_entries_started_at ON public.timer_entries (started_at);
CREATE INDEX idx_timesheet_periods_deadline ON public.timesheet_periods (deadline);
CREATE INDEX idx_timesheet_periods_staff_date ON public.timesheet_periods (staff_id, week_start_date);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Clients Directory (excludes sensitive data like unique_tax_id)
CREATE OR REPLACE VIEW public.clients_directory AS
SELECT 
  client_id,
  client_legal_name,
  industry_id,
  contact_name,
  contact_email,
  contact_phone,
  address,
  is_active,
  created_at,
  updated_at
FROM clients;

-- Staff Directory (excludes sensitive data like auth_user_id, email, id_number)
CREATE OR REPLACE VIEW public.staff_directory AS
SELECT 
  staff_id,
  first_name,
  last_name,
  short_name,
  initials,
  category_id,
  city,
  is_active,
  created_at,
  updated_at
FROM staff;

-- Actual Hours by Category and Activity
CREATE OR REPLACE VIEW public.vw_actual_hours_by_category_activity AS
SELECT 
  te.engagement_id,
  s.category_id,
  c.category_name,
  c.display_order AS category_display_order,
  te.activity_id,
  ac.activity_code,
  ac.description AS activity_description,
  sum(te.hours_logged) AS actual_hours
FROM time_entries te
JOIN staff s ON s.staff_id = te.staff_id
JOIN categories c ON c.category_id = s.category_id
JOIN activity_codes ac ON ac.activity_id = te.activity_id
WHERE te.is_forecast = false
GROUP BY te.engagement_id, s.category_id, c.category_name, c.display_order, 
         te.activity_id, ac.activity_code, ac.description;

-- WO Budget Hours by Category
CREATE OR REPLACE VIEW public.vw_wo_budget_hours_by_category AS
SELECT 
  wo.wo_id,
  wo.engagement_id,
  awc.category_id,
  c.category_name,
  c.display_order AS category_display_order,
  sum(awc.budget_hours) AS total_budget_hours
FROM work_orders wo
JOIN activity_worksheets aw ON aw.wo_id = wo.wo_id
JOIN activity_worksheet_cells awc ON awc.worksheet_id = aw.id
JOIN categories c ON c.category_id = awc.category_id
WHERE awc.budget_hours > 0
GROUP BY wo.wo_id, wo.engagement_id, awc.category_id, c.category_name, c.display_order;

-- WO Budget Hours by Category and Activity
CREATE OR REPLACE VIEW public.vw_wo_budget_hours_by_category_activity AS
SELECT 
  wo.wo_id,
  wo.engagement_id,
  aw.id AS worksheet_id,
  awc.category_id,
  c.category_name,
  c.display_order AS category_display_order,
  awc.activity_id,
  ac.activity_code,
  ac.description AS activity_description,
  awc.budget_hours
FROM work_orders wo
JOIN activity_worksheets aw ON aw.wo_id = wo.wo_id
JOIN activity_worksheet_cells awc ON awc.worksheet_id = aw.id
JOIN categories c ON c.category_id = awc.category_id
JOIN activity_codes ac ON ac.activity_id = awc.activity_id
WHERE awc.budget_hours > 0;

-- Budget vs Actual Hours by Category and Activity
CREATE OR REPLACE VIEW public.vw_budget_vs_actual_hours_by_category_activity AS
SELECT 
  COALESCE(b.wo_id, wo.wo_id) AS wo_id,
  COALESCE(b.engagement_id, a.engagement_id) AS engagement_id,
  COALESCE(b.category_id, a.category_id) AS category_id,
  COALESCE(b.category_name, a.category_name) AS category_name,
  COALESCE(b.category_display_order, a.category_display_order) AS category_display_order,
  COALESCE(b.activity_id, a.activity_id) AS activity_id,
  COALESCE(b.activity_code, a.activity_code) AS activity_code,
  COALESCE(b.activity_description, a.activity_description) AS activity_description,
  COALESCE(b.budget_hours, 0) AS budget_hours,
  COALESCE(a.actual_hours, 0) AS actual_hours,
  (COALESCE(b.budget_hours, 0) - COALESCE(a.actual_hours, 0)) AS variance_hours
FROM vw_wo_budget_hours_by_category_activity b
FULL JOIN vw_actual_hours_by_category_activity a 
  ON b.engagement_id = a.engagement_id 
  AND b.category_id = a.category_id 
  AND b.activity_id = a.activity_id
LEFT JOIN work_orders wo ON wo.engagement_id = a.engagement_id;

-- Work Order Summary (with calculated fees)
CREATE OR REPLACE VIEW public.work_order_summary AS
SELECT 
  wo.wo_id,
  wo.engagement_id,
  wo.currency,
  wo.season_mode,
  wo.tax_rate,
  wo.adjustment_amount,
  wo.notes,
  wo.created_at,
  wo.updated_at,
  wo.approval_status,
  wo.approved_by,
  wo.approved_at,
  COALESCE(sum(bl.budgeted_hours * bl.standard_rate), 0) AS total_standard_fee,
  CASE
    WHEN COALESCE(sum(bl.budgeted_hours * bl.standard_rate), 0) > 0 
    THEN (COALESCE(sum(bl.budgeted_hours * bl.standard_rate), 0) + COALESCE(wo.adjustment_amount, 0)) 
         / COALESCE(sum(bl.budgeted_hours * bl.standard_rate), 0)
    ELSE 1
  END AS realization_percent,
  (COALESCE(sum(bl.budgeted_hours * bl.standard_rate), 0) + COALESCE(wo.adjustment_amount, 0)) 
    / (1 - COALESCE(wo.tax_rate, 0.13)) AS fee_with_tax_gross_up
FROM work_orders wo
LEFT JOIN wo_budget_lines bl ON wo.wo_id = bl.wo_id
GROUP BY wo.wo_id;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Get current user's staff_id
CREATE OR REPLACE FUNCTION public.get_my_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT staff_id FROM staff WHERE auth_user_id = auth.uid()
$$;

-- Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Check if current user is engagement team member (partner or manager)
CREATE OR REPLACE FUNCTION public.is_engagement_team_member(p_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM engagements e
    WHERE e.engagement_id = p_engagement_id
    AND (
      e.manager_id = get_my_staff_id() 
      OR e.partner_id = get_my_staff_id()
    )
  )
$$;

-- Check if staff is in auto-approved category (Partner/Director = display_order <= 2)
CREATE OR REPLACE FUNCTION public.is_auto_approved_category(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM staff s
    JOIN categories c ON s.category_id = c.category_id
    WHERE s.staff_id = p_staff_id
      AND c.display_order <= 2
  )
$$;

-- Get the line approver for a specific staff and engagement
CREATE OR REPLACE FUNCTION public.get_line_approver(p_staff_id uuid, p_engagement_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

-- Get valid timesheet approvers for a staff member's week
CREATE OR REPLACE FUNCTION public.get_timesheet_approvers(p_staff_id uuid, p_week_start date)
RETURNS TABLE(approver_staff_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
  ) potential_approver
  JOIN staff approver_s ON potential_approver.staff_id = approver_s.staff_id
  JOIN categories approver_c ON approver_s.category_id = approver_c.category_id
  WHERE potential_approver.staff_id != p_staff_id  -- No self-approval
    AND approver_c.display_order < v_submitter_display_order  -- Must be higher rank
    AND approver_c.can_approve_timesheets = true;  -- Must have permission
END;
$$;

-- Check if user can approve a timesheet period
CREATE OR REPLACE FUNCTION public.can_approve_timesheet(p_approver_auth_id uuid, p_period_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

-- Check if user can approve a specific timesheet line
CREATE OR REPLACE FUNCTION public.can_approve_timesheet_line(
  p_approver_auth_id uuid, 
  p_period_id uuid, 
  p_engagement_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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

-- Get all user roles (admin only)
CREATE OR REPLACE FUNCTION public.get_all_user_roles()
RETURNS TABLE(
  role_id uuid, 
  user_id uuid, 
  email text, 
  role app_role, 
  staff_name text, 
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    ur.id as role_id,
    ur.user_id,
    au.email::text,
    ur.role,
    COALESCE(s.first_name || ' ' || s.last_name, NULL) as staff_name,
    ur.created_at
  FROM user_roles ur
  JOIN auth.users au ON ur.user_id = au.id
  LEFT JOIN staff s ON s.auth_user_id = au.id
  WHERE has_role(auth.uid(), 'admin')
  ORDER BY ur.created_at DESC;
$$;

-- Atomic role assignment (prevents race condition for first user)
CREATE OR REPLACE FUNCTION public.assign_user_role_atomic(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_count integer;
  v_assigned_role text;
  v_existing_role text;
BEGIN
  -- Acquire advisory lock to prevent race condition
  PERFORM pg_advisory_xact_lock(12345);
  
  -- Check if user already has a role
  SELECT role::text INTO v_existing_role
  FROM user_roles
  WHERE user_id = p_user_id;
  
  IF v_existing_role IS NOT NULL THEN
    RETURN jsonb_build_object(
      'role', v_existing_role,
      'isFirstUser', false,
      'message', 'Role already assigned'
    );
  END IF;
  
  -- Count existing roles
  SELECT count(*) INTO v_role_count FROM user_roles;
  
  -- First user gets admin, others get staff
  IF v_role_count = 0 THEN
    v_assigned_role := 'admin';
  ELSE
    v_assigned_role := 'staff';
  END IF;
  
  -- Insert the role
  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, v_assigned_role::app_role);
  
  RETURN jsonb_build_object(
    'role', v_assigned_role,
    'isFirstUser', v_role_count = 0
  );
END;
$$;

-- Sync worksheet cells to WO budget lines with rate snapshot
CREATE OR REPLACE FUNCTION public.sync_worksheet_to_wo_budget(p_worksheet_id uuid, p_wo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_wo RECORD;
BEGIN
    -- Get work order details for rate calculation
    SELECT wo_id, currency, season_mode INTO v_wo
    FROM work_orders
    WHERE wo_id = p_wo_id;

    IF v_wo IS NULL THEN
        RAISE EXCEPTION 'Work order not found: %', p_wo_id;
    END IF;

    -- Link worksheet to work order
    UPDATE activity_worksheets
    SET wo_id = p_wo_id, updated_at = now()
    WHERE id = p_worksheet_id;

    -- Delete existing budget lines for this work order
    DELETE FROM wo_budget_lines WHERE wo_id = p_wo_id;

    -- Insert aggregated budget lines from worksheet cells
    INSERT INTO wo_budget_lines (wo_id, category_id, budgeted_hours, standard_rate)
    SELECT 
        p_wo_id,
        awc.category_id,
        SUM(awc.budget_hours),
        -- Calculate rate based on currency and season
        CASE 
            WHEN v_wo.currency = 'USD' AND v_wo.season_mode = 'High' THEN c.rate_high_usd
            WHEN v_wo.currency = 'USD' AND v_wo.season_mode = 'Low' THEN c.rate_low_usd
            WHEN v_wo.currency = 'BOB' AND v_wo.season_mode = 'High' THEN c.rate_high_bob
            ELSE c.rate_low_bob
        END
    FROM activity_worksheet_cells awc
    JOIN categories c ON c.category_id = awc.category_id
    WHERE awc.worksheet_id = p_worksheet_id
      AND awc.budget_hours > 0
    GROUP BY awc.category_id, c.rate_high_usd, c.rate_low_usd, c.rate_high_bob, c.rate_low_bob;
END;
$$;

-- Validate email domain on signup
CREATE OR REPLACE FUNCTION public.validate_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  allowed_domain TEXT;
  user_domain TEXT;
BEGIN
  -- Get allowed domain from global_settings
  SELECT setting_value INTO allowed_domain
  FROM public.global_settings
  WHERE setting_key = 'ALLOWED_EMAIL_DOMAIN';
  
  -- If no setting found or empty, allow all domains
  IF allowed_domain IS NULL OR allowed_domain = '' THEN
    RETURN NEW;
  END IF;
  
  -- Extract domain from email
  user_domain := split_part(NEW.email, '@', 2);
  
  -- Check if domain matches (case-insensitive)
  IF lower(user_domain) != lower(allowed_domain) THEN
    RAISE EXCEPTION 'Registration restricted to @% emails only', allowed_domain;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Link auth user to staff record by email
CREATE OR REPLACE FUNCTION public.link_auth_user_to_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Update staff record if email matches
  UPDATE public.staff
  SET auth_user_id = NEW.id,
      updated_at = now()
  WHERE email = NEW.email
    AND auth_user_id IS NULL;
  
  RETURN NEW;
END;
$$;

-- Update updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Check if WO is approved before allowing time entry
CREATE OR REPLACE FUNCTION public.check_wo_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM work_orders wo
    WHERE wo.engagement_id = NEW.engagement_id
    AND wo.approval_status = 'Approved'
  ) THEN
    RAISE EXCEPTION 'Cannot log time: Work Order is not approved';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.activity_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_worksheet_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_worksheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_line_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_expense_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Activity Codes
CREATE POLICY "Admins can manage activities" ON public.activity_codes 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated users can read activities" ON public.activity_codes 
  FOR SELECT TO authenticated 
  USING (true);

-- Activity Worksheet Cells
CREATE POLICY "Admins can manage worksheet cells" ON public.activity_worksheet_cells 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can view all worksheet cells" ON public.activity_worksheet_cells 
  FOR SELECT TO authenticated 
  USING (is_admin());
CREATE POLICY "Team can manage worksheet cells" ON public.activity_worksheet_cells 
  FOR ALL TO authenticated 
  USING ((EXISTS (SELECT 1 FROM activity_worksheets aw 
    WHERE aw.id = activity_worksheet_cells.worksheet_id 
    AND is_engagement_team_member(aw.engagement_id)))) 
  WITH CHECK ((EXISTS (SELECT 1 FROM activity_worksheets aw 
    WHERE aw.id = activity_worksheet_cells.worksheet_id 
    AND is_engagement_team_member(aw.engagement_id))));
CREATE POLICY "Team can view worksheet cells" ON public.activity_worksheet_cells 
  FOR SELECT TO authenticated 
  USING ((EXISTS (SELECT 1 FROM activity_worksheets aw 
    WHERE aw.id = activity_worksheet_cells.worksheet_id 
    AND is_engagement_team_member(aw.engagement_id))));

-- Activity Worksheets
CREATE POLICY "Admins can manage worksheets" ON public.activity_worksheets 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can view all worksheets" ON public.activity_worksheets 
  FOR SELECT TO authenticated 
  USING (is_admin());
CREATE POLICY "Team can manage worksheets" ON public.activity_worksheets 
  FOR ALL TO authenticated 
  USING (is_engagement_team_member(engagement_id)) 
  WITH CHECK (is_engagement_team_member(engagement_id));
CREATE POLICY "Team can view worksheets" ON public.activity_worksheets 
  FOR SELECT TO authenticated 
  USING (is_engagement_team_member(engagement_id));

-- Categories
CREATE POLICY "Admins can manage categories" ON public.categories 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated users can read categories" ON public.categories 
  FOR SELECT TO authenticated 
  USING (true);

-- Clients
CREATE POLICY "Admins can manage clients" ON public.clients 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated users can read clients" ON public.clients 
  FOR SELECT TO authenticated 
  USING (true);

-- Engagements
CREATE POLICY "Admins can manage engagements" ON public.engagements 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated users can read engagements" ON public.engagements 
  FOR SELECT TO authenticated 
  USING (true);
CREATE POLICY "Team can update engagements" ON public.engagements 
  FOR UPDATE TO authenticated 
  USING (is_engagement_team_member(engagement_id));

-- Expense Logs
CREATE POLICY "Admins can view all expenses" ON public.expense_logs 
  FOR SELECT TO authenticated 
  USING (is_admin());
CREATE POLICY "Authenticated can create expenses" ON public.expense_logs 
  FOR INSERT TO authenticated 
  WITH CHECK ((is_engagement_team_member(engagement_id) OR is_admin()));
CREATE POLICY "Team can delete engagement expenses" ON public.expense_logs 
  FOR DELETE TO authenticated 
  USING ((is_engagement_team_member(engagement_id) OR is_admin()));
CREATE POLICY "Team can update engagement expenses" ON public.expense_logs 
  FOR UPDATE TO authenticated 
  USING ((is_engagement_team_member(engagement_id) OR is_admin()));
CREATE POLICY "Team can view engagement expenses" ON public.expense_logs 
  FOR SELECT TO authenticated 
  USING (is_engagement_team_member(engagement_id));

-- Expense Types
CREATE POLICY "Admins can manage expense types" ON public.expense_types 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated users can read expense types" ON public.expense_types 
  FOR SELECT TO authenticated 
  USING (true);

-- Global Settings
CREATE POLICY "Admins can manage settings" ON public.global_settings 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated users can read settings" ON public.global_settings 
  FOR SELECT TO authenticated 
  USING (true);

-- Industries
CREATE POLICY "Admins can manage industries" ON public.industries 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated users can read industries" ON public.industries 
  FOR SELECT TO authenticated 
  USING (true);

-- Staff
CREATE POLICY "Admins can manage staff" ON public.staff 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated users can read staff" ON public.staff 
  FOR SELECT TO authenticated 
  USING (true);
CREATE POLICY "Users can update their linked staff record" ON public.staff 
  FOR UPDATE TO public 
  USING ((auth_user_id = auth.uid())) 
  WITH CHECK ((auth_user_id = auth.uid()));

-- Staff Capacity
CREATE POLICY "Admins can manage all capacity" ON public.staff_capacity 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can view all capacity" ON public.staff_capacity 
  FOR SELECT TO authenticated 
  USING (is_admin());
CREATE POLICY "Staff can view own capacity" ON public.staff_capacity 
  FOR SELECT TO authenticated 
  USING ((staff_id = get_my_staff_id()));

-- Time Entries
CREATE POLICY "Admins can delete all time entries" ON public.time_entries 
  FOR DELETE TO authenticated 
  USING (is_admin());
CREATE POLICY "Admins can update all time entries" ON public.time_entries 
  FOR UPDATE TO authenticated 
  USING (is_admin());
CREATE POLICY "Admins can view all time entries" ON public.time_entries 
  FOR SELECT TO authenticated 
  USING (is_admin());
CREATE POLICY "Staff can create own time entries" ON public.time_entries 
  FOR INSERT TO authenticated 
  WITH CHECK ((staff_id = get_my_staff_id()));
CREATE POLICY "Staff can delete own time entries" ON public.time_entries 
  FOR DELETE TO authenticated 
  USING ((staff_id = get_my_staff_id()));
CREATE POLICY "Staff can update own time entries" ON public.time_entries 
  FOR UPDATE TO authenticated 
  USING ((staff_id = get_my_staff_id()));
CREATE POLICY "Staff can view own time entries" ON public.time_entries 
  FOR SELECT TO authenticated 
  USING ((staff_id = get_my_staff_id()));
CREATE POLICY "Team can view engagement time entries" ON public.time_entries 
  FOR SELECT TO authenticated 
  USING (is_engagement_team_member(engagement_id));

-- Timer Entries
CREATE POLICY "Staff can create own timer entries" ON public.timer_entries 
  FOR INSERT TO public 
  WITH CHECK ((staff_id IN (SELECT s.staff_id FROM staff s WHERE s.auth_user_id = auth.uid())));
CREATE POLICY "Staff can delete own timer entries" ON public.timer_entries 
  FOR DELETE TO public 
  USING ((staff_id IN (SELECT s.staff_id FROM staff s WHERE s.auth_user_id = auth.uid())));
CREATE POLICY "Staff can update own timer entries" ON public.timer_entries 
  FOR UPDATE TO public 
  USING ((staff_id IN (SELECT s.staff_id FROM staff s WHERE s.auth_user_id = auth.uid())));
CREATE POLICY "Staff can view own timer entries" ON public.timer_entries 
  FOR SELECT TO public 
  USING ((staff_id IN (SELECT s.staff_id FROM staff s WHERE s.auth_user_id = auth.uid())));

-- Timesheet Line Approvals
CREATE POLICY "Approvers can update assigned line approvals" ON public.timesheet_line_approvals 
  FOR UPDATE TO public 
  USING (can_approve_timesheet_line(auth.uid(), period_id, engagement_id));
CREATE POLICY "Approvers can view assigned line approvals" ON public.timesheet_line_approvals 
  FOR SELECT TO public 
  USING (can_approve_timesheet_line(auth.uid(), period_id, engagement_id));
CREATE POLICY "Leadership can view all line approvals" ON public.timesheet_line_approvals 
  FOR SELECT TO public 
  USING ((EXISTS (SELECT 1 FROM staff s JOIN categories c ON s.category_id = c.category_id 
    WHERE s.auth_user_id = auth.uid() AND c.display_order <= 2)));
CREATE POLICY "Staff can create own line approvals" ON public.timesheet_line_approvals 
  FOR INSERT TO public 
  WITH CHECK ((period_id IN (SELECT tp.period_id FROM timesheet_periods tp 
    JOIN staff s ON tp.staff_id = s.staff_id WHERE s.auth_user_id = auth.uid())));
CREATE POLICY "Staff can view own line approvals" ON public.timesheet_line_approvals 
  FOR SELECT TO public 
  USING ((period_id IN (SELECT tp.period_id FROM timesheet_periods tp 
    JOIN staff s ON tp.staff_id = s.staff_id WHERE s.auth_user_id = auth.uid())));

-- Timesheet Periods
CREATE POLICY "Approvers can update all periods" ON public.timesheet_periods 
  FOR UPDATE TO public 
  USING ((EXISTS (SELECT 1 FROM staff s JOIN categories c ON s.category_id = c.category_id 
    WHERE s.auth_user_id = auth.uid() AND c.can_approve_wo = true)));
CREATE POLICY "Approvers can update assigned timesheets" ON public.timesheet_periods 
  FOR UPDATE TO public 
  USING (can_approve_timesheet(auth.uid(), period_id));
CREATE POLICY "Approvers can view all periods" ON public.timesheet_periods 
  FOR SELECT TO public 
  USING ((EXISTS (SELECT 1 FROM staff s JOIN categories c ON s.category_id = c.category_id 
    WHERE s.auth_user_id = auth.uid() AND c.can_approve_wo = true)));
CREATE POLICY "Approvers can view assigned timesheets" ON public.timesheet_periods 
  FOR SELECT TO public 
  USING (can_approve_timesheet(auth.uid(), period_id));
CREATE POLICY "Staff can create own periods" ON public.timesheet_periods 
  FOR INSERT TO public 
  WITH CHECK ((staff_id IN (SELECT s.staff_id FROM staff s WHERE s.auth_user_id = auth.uid())));
CREATE POLICY "Staff can update own unlocked periods" ON public.timesheet_periods 
  FOR UPDATE TO public 
  USING ((staff_id IN (SELECT s.staff_id FROM staff s WHERE s.auth_user_id = auth.uid())) 
    AND (is_period_locked = false));
CREATE POLICY "Staff can view own periods" ON public.timesheet_periods 
  FOR SELECT TO public 
  USING ((staff_id IN (SELECT s.staff_id FROM staff s WHERE s.auth_user_id = auth.uid())));

-- User Roles
CREATE POLICY "Admins can manage all roles" ON public.user_roles 
  FOR ALL TO public 
  USING (has_role(auth.uid(), 'admin')) 
  WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own roles" ON public.user_roles 
  FOR SELECT TO public 
  USING ((auth.uid() = user_id));

-- WO Budget Lines
CREATE POLICY "Admins can manage budget lines" ON public.wo_budget_lines 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can view all budget lines" ON public.wo_budget_lines 
  FOR SELECT TO authenticated 
  USING (is_admin());
CREATE POLICY "Team can manage budget lines" ON public.wo_budget_lines 
  FOR ALL TO authenticated 
  USING ((EXISTS (SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_budget_lines.wo_id AND is_engagement_team_member(wo.engagement_id)))) 
  WITH CHECK ((EXISTS (SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_budget_lines.wo_id AND is_engagement_team_member(wo.engagement_id))));
CREATE POLICY "Team can view budget lines" ON public.wo_budget_lines 
  FOR SELECT TO authenticated 
  USING ((EXISTS (SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_budget_lines.wo_id AND is_engagement_team_member(wo.engagement_id))));

-- WO Expense Budget
CREATE POLICY "Admins can manage expense budget" ON public.wo_expense_budget 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can view all expense budget" ON public.wo_expense_budget 
  FOR SELECT TO authenticated 
  USING (is_admin());
CREATE POLICY "Team can manage expense budget" ON public.wo_expense_budget 
  FOR ALL TO authenticated 
  USING ((EXISTS (SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_expense_budget.wo_id AND is_engagement_team_member(wo.engagement_id)))) 
  WITH CHECK ((EXISTS (SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_expense_budget.wo_id AND is_engagement_team_member(wo.engagement_id))));
CREATE POLICY "Team can view expense budget" ON public.wo_expense_budget 
  FOR SELECT TO authenticated 
  USING ((EXISTS (SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_expense_budget.wo_id AND is_engagement_team_member(wo.engagement_id))));

-- Work Orders
CREATE POLICY "Admins can manage work orders" ON public.work_orders 
  FOR ALL TO authenticated 
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can view all work orders" ON public.work_orders 
  FOR SELECT TO authenticated 
  USING (is_admin());
CREATE POLICY "Team can manage engagement work orders" ON public.work_orders 
  FOR ALL TO authenticated 
  USING (is_engagement_team_member(engagement_id)) 
  WITH CHECK (is_engagement_team_member(engagement_id));
CREATE POLICY "Team can view engagement work orders" ON public.work_orders 
  FOR SELECT TO authenticated 
  USING (is_engagement_team_member(engagement_id));

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
