-- Phase 5: RLS Policy Redesign
-- Replace overly permissive "USING (true)" policies with proper role-based access control

-- =====================================================
-- HELPER FUNCTION: Get staff_id for current authenticated user
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_my_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT staff_id FROM staff WHERE auth_user_id = auth.uid()
$$;

-- =====================================================
-- HELPER FUNCTION: Check if user is admin
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

-- =====================================================
-- HELPER FUNCTION: Check if user is manager/partner of engagement
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_engagement_team_member(p_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

-- =====================================================
-- TIME_ENTRIES: Staff sees own, managers see team, admins see all
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage time entries" ON time_entries;
DROP POLICY IF EXISTS "Authenticated users can read time entries" ON time_entries;

-- SELECT: Staff own, team members for their engagements, admins all
CREATE POLICY "Staff can view own time entries" ON time_entries
  FOR SELECT TO authenticated
  USING (staff_id = get_my_staff_id());

CREATE POLICY "Team can view engagement time entries" ON time_entries
  FOR SELECT TO authenticated
  USING (is_engagement_team_member(engagement_id));

CREATE POLICY "Admins can view all time entries" ON time_entries
  FOR SELECT TO authenticated
  USING (is_admin());

-- INSERT: Staff can create their own entries only
CREATE POLICY "Staff can create own time entries" ON time_entries
  FOR INSERT TO authenticated
  WITH CHECK (staff_id = get_my_staff_id());

-- UPDATE: Staff can update own, admins can update all
CREATE POLICY "Staff can update own time entries" ON time_entries
  FOR UPDATE TO authenticated
  USING (staff_id = get_my_staff_id());

CREATE POLICY "Admins can update all time entries" ON time_entries
  FOR UPDATE TO authenticated
  USING (is_admin());

-- DELETE: Staff can delete own, admins can delete all
CREATE POLICY "Staff can delete own time entries" ON time_entries
  FOR DELETE TO authenticated
  USING (staff_id = get_my_staff_id());

CREATE POLICY "Admins can delete all time entries" ON time_entries
  FOR DELETE TO authenticated
  USING (is_admin());

-- =====================================================
-- EXPENSE_LOGS: Similar to time entries - own + team + admin
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage expense logs" ON expense_logs;
DROP POLICY IF EXISTS "Authenticated users can read expense logs" ON expense_logs;

CREATE POLICY "Team can view engagement expenses" ON expense_logs
  FOR SELECT TO authenticated
  USING (is_engagement_team_member(engagement_id));

CREATE POLICY "Admins can view all expenses" ON expense_logs
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Authenticated can create expenses" ON expense_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_engagement_team_member(engagement_id) OR is_admin());

CREATE POLICY "Team can update engagement expenses" ON expense_logs
  FOR UPDATE TO authenticated
  USING (is_engagement_team_member(engagement_id) OR is_admin());

CREATE POLICY "Team can delete engagement expenses" ON expense_logs
  FOR DELETE TO authenticated
  USING (is_engagement_team_member(engagement_id) OR is_admin());

-- =====================================================
-- STAFF_CAPACITY: Staff sees own, admins manage all
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage staff capacity" ON staff_capacity;
DROP POLICY IF EXISTS "Authenticated users can read staff capacity" ON staff_capacity;

CREATE POLICY "Staff can view own capacity" ON staff_capacity
  FOR SELECT TO authenticated
  USING (staff_id = get_my_staff_id());

CREATE POLICY "Admins can view all capacity" ON staff_capacity
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can manage all capacity" ON staff_capacity
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =====================================================
-- WORK_ORDERS: Team can view, admins manage
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage work orders" ON work_orders;
DROP POLICY IF EXISTS "Authenticated users can read work orders" ON work_orders;

CREATE POLICY "Team can view engagement work orders" ON work_orders
  FOR SELECT TO authenticated
  USING (is_engagement_team_member(engagement_id));

CREATE POLICY "Admins can view all work orders" ON work_orders
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can manage work orders" ON work_orders
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Team members with approval rights can also manage their WOs
CREATE POLICY "Team can manage engagement work orders" ON work_orders
  FOR ALL TO authenticated
  USING (is_engagement_team_member(engagement_id))
  WITH CHECK (is_engagement_team_member(engagement_id));

-- =====================================================
-- WO_BUDGET_LINES: Same as work_orders
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage budget lines" ON wo_budget_lines;
DROP POLICY IF EXISTS "Authenticated users can read budget lines" ON wo_budget_lines;

CREATE POLICY "Team can view budget lines" ON wo_budget_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_budget_lines.wo_id 
    AND is_engagement_team_member(wo.engagement_id)
  ));

CREATE POLICY "Admins can view all budget lines" ON wo_budget_lines
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can manage budget lines" ON wo_budget_lines
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Team can manage budget lines" ON wo_budget_lines
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_budget_lines.wo_id 
    AND is_engagement_team_member(wo.engagement_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_budget_lines.wo_id 
    AND is_engagement_team_member(wo.engagement_id)
  ));

-- =====================================================
-- WO_EXPENSE_BUDGET: Same as work_orders
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage expense budget" ON wo_expense_budget;
DROP POLICY IF EXISTS "Authenticated users can read expense budget" ON wo_expense_budget;

CREATE POLICY "Team can view expense budget" ON wo_expense_budget
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_expense_budget.wo_id 
    AND is_engagement_team_member(wo.engagement_id)
  ));

CREATE POLICY "Admins can view all expense budget" ON wo_expense_budget
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Team can manage expense budget" ON wo_expense_budget
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_expense_budget.wo_id 
    AND is_engagement_team_member(wo.engagement_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM work_orders wo 
    WHERE wo.wo_id = wo_expense_budget.wo_id 
    AND is_engagement_team_member(wo.engagement_id)
  ));

CREATE POLICY "Admins can manage expense budget" ON wo_expense_budget
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =====================================================
-- ENGAGEMENTS: All authenticated can read, admins manage
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage engagements" ON engagements;
-- Keep public read for dropdown selection
-- DROP POLICY IF EXISTS "Authenticated users can read engagements" ON engagements;

CREATE POLICY "Admins can manage engagements" ON engagements
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Team members can update their engagements
CREATE POLICY "Team can update engagements" ON engagements
  FOR UPDATE TO authenticated
  USING (is_engagement_team_member(engagement_id));

-- =====================================================
-- CLIENTS: All authenticated can read, admins manage
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage clients" ON clients;
-- Keep public read for dropdown selection

CREATE POLICY "Admins can manage clients" ON clients
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =====================================================
-- STAFF: All authenticated can read, admins manage, users update own
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage staff" ON staff;
-- Keep "Users can update their linked staff record" and "Authenticated users can read staff"

CREATE POLICY "Admins can manage staff" ON staff
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =====================================================
-- GLOBAL_SETTINGS: All can read, admins only can modify
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage settings" ON global_settings;
-- Keep read policy

CREATE POLICY "Admins can manage settings" ON global_settings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =====================================================
-- CATEGORIES, INDUSTRIES, EXPENSE_TYPES, ACTIVITY_CODES: 
-- All can read (reference data), admins manage
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage categories" ON categories;
DROP POLICY IF EXISTS "Authenticated users can manage industries" ON industries;
DROP POLICY IF EXISTS "Authenticated users can manage expense types" ON expense_types;
DROP POLICY IF EXISTS "Authenticated users can manage activities" ON activity_codes;

CREATE POLICY "Admins can manage categories" ON categories
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can manage industries" ON industries
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can manage expense types" ON expense_types
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can manage activities" ON activity_codes
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =====================================================
-- WORKSHEETS: Team can manage, admins see all
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage worksheets" ON activity_worksheets;
DROP POLICY IF EXISTS "Authenticated users can read worksheets" ON activity_worksheets;

CREATE POLICY "Team can view worksheets" ON activity_worksheets
  FOR SELECT TO authenticated
  USING (is_engagement_team_member(engagement_id));

CREATE POLICY "Admins can view all worksheets" ON activity_worksheets
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Team can manage worksheets" ON activity_worksheets
  FOR ALL TO authenticated
  USING (is_engagement_team_member(engagement_id))
  WITH CHECK (is_engagement_team_member(engagement_id));

CREATE POLICY "Admins can manage worksheets" ON activity_worksheets
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =====================================================
-- WORKSHEET_CELLS: Same access as parent worksheet
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can manage worksheet cells" ON activity_worksheet_cells;
DROP POLICY IF EXISTS "Authenticated users can read worksheet cells" ON activity_worksheet_cells;

CREATE POLICY "Team can view worksheet cells" ON activity_worksheet_cells
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM activity_worksheets aw 
    WHERE aw.id = activity_worksheet_cells.worksheet_id 
    AND is_engagement_team_member(aw.engagement_id)
  ));

CREATE POLICY "Admins can view all worksheet cells" ON activity_worksheet_cells
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Team can manage worksheet cells" ON activity_worksheet_cells
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM activity_worksheets aw 
    WHERE aw.id = activity_worksheet_cells.worksheet_id 
    AND is_engagement_team_member(aw.engagement_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM activity_worksheets aw 
    WHERE aw.id = activity_worksheet_cells.worksheet_id 
    AND is_engagement_team_member(aw.engagement_id)
  ));

CREATE POLICY "Admins can manage worksheet cells" ON activity_worksheet_cells
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());