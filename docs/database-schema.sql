-- ============================================================================
-- EMS 2.0 Complete Database Schema
-- Generated: 2026-02-26
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
  'semisenior',
  'sqr',
  'specialist_it',
  'specialist_tax'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Activity Codes
CREATE TABLE public.activity_codes (
  activity_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_code VARCHAR NOT NULL,
  description VARCHAR NOT NULL,
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
  status VARCHAR NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by_staff_id UUID REFERENCES public.staff(staff_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categories (Staff Categories with Rates)
CREATE TABLE public.categories (
  category_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name VARCHAR NOT NULL,
  rate_high_bob NUMERIC NOT NULL DEFAULT 0,
  rate_low_bob NUMERIC NOT NULL DEFAULT 0,
  rate_high_usd NUMERIC NOT NULL DEFAULT 0,
  rate_low_usd NUMERIC NOT NULL DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  can_approve_wo BOOLEAN DEFAULT false,
  can_approve_timesheets BOOLEAN DEFAULT false,
  default_app_role app_role
  -- + CONSTRAINT categories_service_category_unique UNIQUE (service_id, category_id)
  --     (FEAT 0810-173) — target del FK compuesto de staff, ver arriba.
);

-- Society (FEAT 0810-173: catálogo interno de sociedades, sin ABM — solo lectura)
CREATE TABLE public.society (
  society_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: SELECT-only para authenticated (sin INSERT/UPDATE/DELETE — sin ABM).
-- Seed: 'Ruizmier Pelaez S.R.L.', 'Ruizmier Juaregui S.R.L.'.

-- Clients
CREATE TABLE public.clients (
  client_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_legal_name VARCHAR NOT NULL,
  unique_tax_id VARCHAR NOT NULL,
  industry_id UUID REFERENCES public.industries(industry_id),
  contact_name VARCHAR,
  contact_email VARCHAR,
  contact_phone VARCHAR,
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Engagements
CREATE TABLE public.engagements (
  engagement_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(client_id),
  engagement_name VARCHAR NOT NULL,
  engagement_code VARCHAR,
  partner_id UUID REFERENCES public.staff(staff_id),
  manager_id UUID REFERENCES public.staff(staff_id),
  start_date DATE,
  end_date DATE,
  status VARCHAR DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  work_order_required BOOLEAN NOT NULL DEFAULT true,
  activity_required BOOLEAN NOT NULL DEFAULT true,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  approval_required BOOLEAN NOT NULL DEFAULT true,
  sqr_id           UUID REFERENCES public.staff(staff_id),
  encargado_id     UUID REFERENCES public.staff(staff_id),
  specialist_it_id  UUID REFERENCES public.staff(staff_id),
  specialist_tax_id UUID REFERENCES public.staff(staff_id),
  -- FEAT 0625-151: ruta (no URL) del contrato escaneado en el bucket privado
  -- 'engagement-contracts' (PDF, 5MB). Nullable: obligatorio solo en el formulario de
  -- creación para encargos de cliente (is_internal = false), no a nivel de base de datos.
  contract_file_path TEXT,
  -- FEAT 0602-136: clasificación granular del servicio vendido al cliente, independiente
  -- de `practica`. Nullable: sin backfill de encargos legados; obligatoria en el formulario
  -- solo cuando funcion = Cliente (1), no a nivel de base de datos.
  taxonomy_id UUID REFERENCES public.taxonomies(taxonomy_id)
);

-- Expense Logs
CREATE TABLE public.expense_logs (
  expense_log_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date_incurred DATE NOT NULL,
  amount NUMERIC NOT NULL,
  currency VARCHAR DEFAULT 'BOB',
  engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id),
  expense_type_id UUID NOT NULL REFERENCES public.expense_types(expense_type_id),
  description TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by_staff_id UUID REFERENCES public.staff(staff_id)
);

-- Expense Types
CREATE TABLE public.expense_types (
  expense_type_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_name VARCHAR NOT NULL,
  default_unit_cost NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Global Settings
CREATE TABLE public.global_settings (
  setting_key VARCHAR NOT NULL PRIMARY KEY,
  setting_value VARCHAR NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Holidays
CREATE TABLE public.holidays (
  holiday_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday_date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.staff(staff_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Industries
CREATE TABLE public.industries (
  industry_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  industry_name VARCHAR NOT NULL,
  fiscal_year_end VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Migration Run Log
CREATE TABLE public.migration_run_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_key TEXT NOT NULL,
  backup_table_name TEXT NOT NULL,
  executed_by TEXT DEFAULT CURRENT_USER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff
CREATE TABLE public.staff (
  staff_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID,
  first_name VARCHAR NOT NULL,
  last_name VARCHAR NOT NULL,
  email VARCHAR,
  category_id UUID REFERENCES public.categories(category_id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  short_name VARCHAR,
  initials VARCHAR,
  city VARCHAR,
  id_number VARCHAR,
  aud_reg_number VARCHAR,
  weekly_capacity_hours NUMERIC NOT NULL DEFAULT 40,
  hire_date DATE,
  termination_date DATE,
  deleted_at TIMESTAMPTZ,
  is_blocked BOOLEAN NOT NULL DEFAULT false,  -- BUG 0601-132: admin-visible account lockout flag
  -- FEAT 0810-173: sociedad y práctica del staff. NOT NULL tras el backfill de la migración.
  society_id UUID NOT NULL REFERENCES public.society(society_id),
  service_id UUID NOT NULL REFERENCES public.services(service_id)
  -- + CONSTRAINT staff_service_category_fk FOREIGN KEY (service_id, category_id)
  --     REFERENCES public.categories (service_id, category_id) — garantiza que la
  --     categoría elegida pertenezca a la práctica (MATCH SIMPLE: filas con
  --     category_id NULL no se validan).
);

-- NOTE: staff_capacity table removed in 2026-02-13 migration.
-- weekly_capacity_hours is now a column on the staff table (DEFAULT 40).

-- Taxonomies (FEAT 0602-136: admin-managed catalog, independent of `services`/`practica`)
CREATE TABLE public.taxonomies (
  taxonomy_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(10) NOT NULL, -- CHECK char_length(trim(code)) BETWEEN 1 AND 10; unique index on lower(trim(code))
  name TEXT NOT NULL,
  service_id UUID REFERENCES public.services(service_id) ON DELETE SET NULL, -- NULL = global
  is_active BOOLEAN NOT NULL DEFAULT true, -- deactivate-only, no DELETE policy
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: `public.services` (the practica catalog) is not yet documented in this file
-- (added 2026-06-26, migration 20260626000000_create_services_catalog.sql) — pre-existing gap.

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
  imported_to_time_id UUID REFERENCES public.time_entries(time_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  has_explicit_times BOOLEAN NOT NULL DEFAULT true
);

-- Timesheet Line Approvals
CREATE TABLE public.timesheet_line_approvals (
  approval_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES public.timesheet_periods(period_id),
  engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id),
  approved_by UUID REFERENCES public.staff(staff_id),
  approved_at TIMESTAMPTZ,
  status VARCHAR NOT NULL DEFAULT 'pending',
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

-- User Lifecycle Audit Log
CREATE TABLE public.user_lifecycle_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_role app_role,
  new_role app_role,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Roles
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
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
  currency VARCHAR NOT NULL,
  season_mode VARCHAR NOT NULL,
  tax_rate NUMERIC DEFAULT 0.13,
  adjustment_amount NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  approval_status VARCHAR DEFAULT 'Draft',
  approved_by UUID REFERENCES public.staff(staff_id),
  approved_at TIMESTAMPTZ,
  ceac_completed_at DATE,
  san_completed_at DATE,
  ceac_notes TEXT,
  san_notes TEXT
);

-- Payment Plan (one per work order)
CREATE TABLE public.wo_payment_plan (
  plan_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wo_id UUID NOT NULL UNIQUE REFERENCES public.work_orders(wo_id) ON DELETE CASCADE,
  exchange_rate NUMERIC,
  payment_days INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Payment Installments (many per plan)
CREATE TABLE public.wo_payment_installments (
  installment_id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id                 UUID NOT NULL REFERENCES public.wo_payment_plan(plan_id) ON DELETE CASCADE,
  wo_id                   UUID NOT NULL REFERENCES public.work_orders(wo_id) ON DELETE CASCADE,
  installment_number      INTEGER NOT NULL,
  agreed_invoice_date     DATE,         -- entered by manager: planned invoice date
  agreed_payment_date     DATE,         -- auto: agreed_invoice_date + payment_days business days
  collection_invoice_date DATE,         -- auto: date status changed to Invoiced
  collection_payment_date DATE,         -- auto: collection_invoice_date + payment_days business days
  payment_date_actual     DATE,         -- recorded when status → Completed
  percentage              NUMERIC NOT NULL,
  amount                  NUMERIC,
  status                  TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Invoiced', 'Completed', 'Overdue')),
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE (plan_id, installment_number)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_activity_worksheet_cells_activity ON public.activity_worksheet_cells (activity_id);
CREATE INDEX idx_activity_worksheet_cells_category ON public.activity_worksheet_cells (category_id);
CREATE INDEX idx_activity_worksheet_cells_worksheet ON public.activity_worksheet_cells (worksheet_id);
CREATE INDEX idx_activity_worksheets_engagement ON public.activity_worksheets (engagement_id);
CREATE INDEX idx_activity_worksheets_wo ON public.activity_worksheets (wo_id);
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
  SELECT c.display_order INTO v_staff_display_order
  FROM staff s
  JOIN categories c ON s.category_id = c.category_id
  WHERE s.staff_id = p_staff_id;

  IF v_staff_display_order IS NOT NULL AND v_staff_display_order <= 2 THEN
    RETURN NULL;
  END IF;

  SELECT manager_id, partner_id INTO v_engagement
  FROM engagements
  WHERE engagement_id = p_engagement_id;

  IF v_staff_display_order IS NOT NULL AND v_staff_display_order <= 4 THEN
    RETURN v_engagement.partner_id;
  END IF;

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
  SELECT c.display_order INTO v_submitter_display_order
  FROM staff s
  JOIN categories c ON s.category_id = c.category_id
  WHERE s.staff_id = p_staff_id;

  IF v_submitter_display_order IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT potential_approver.staff_id
  FROM (
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
  ) potential_approver
  JOIN staff approver_s ON potential_approver.staff_id = approver_s.staff_id
  JOIN categories approver_c ON approver_s.category_id = approver_c.category_id
  WHERE potential_approver.staff_id != p_staff_id
    AND approver_c.display_order < v_submitter_display_order
    AND approver_c.can_approve_timesheets = true;
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
  SELECT staff_id INTO v_approver_staff_id
  FROM staff
  WHERE auth_user_id = p_approver_auth_id;

  IF v_approver_staff_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT tp.staff_id, tp.week_start_date
  INTO v_period
  FROM timesheet_periods tp
  WHERE tp.period_id = p_period_id;

  IF v_period IS NULL THEN
    RETURN false;
  END IF;

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
  SELECT staff_id INTO v_approver_staff_id
  FROM staff
  WHERE auth_user_id = p_approver_auth_id;

  IF v_approver_staff_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT c.display_order INTO v_approver_display_order
  FROM staff s
  JOIN categories c ON s.category_id = c.category_id
  WHERE s.staff_id = v_approver_staff_id
    AND c.can_approve_timesheets = TRUE;

  IF v_approver_display_order IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT staff_id INTO v_period_staff_id
  FROM timesheet_periods
  WHERE period_id = p_period_id;

  IF v_period_staff_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_approver_staff_id = v_period_staff_id THEN
    RETURN FALSE;
  END IF;

  v_expected_approver := get_line_approver(v_period_staff_id, p_engagement_id);

  IF v_expected_approver IS NULL THEN
    RETURN FALSE;
  END IF;

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
  PERFORM pg_advisory_xact_lock(12345);
  
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
  
  SELECT count(*) INTO v_role_count FROM user_roles;
  
  IF v_role_count = 0 THEN
    v_assigned_role := 'admin';
  ELSE
    v_assigned_role := 'staff';
  END IF;
  
  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, v_assigned_role::app_role);
  
  RETURN jsonb_build_object(
    'role', v_assigned_role,
    'isFirstUser', v_role_count = 0
  );
END;
$$;

-- Admin set user role (with audit logging)
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_target_user_id uuid, p_new_role app_role, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_old_role app_role; v_admin_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(67890);
  IF NOT has_role(v_caller_id, 'admin') THEN
    RETURN jsonb_build_object('success',false,'code','NOT_ADMIN','message','Only admins can change roles');
  END IF;
  IF v_caller_id = p_target_user_id THEN
    RETURN jsonb_build_object('success',false,'code','SELF_CHANGE','message','Cannot change own role');
  END IF;
  SELECT role INTO v_old_role FROM user_roles WHERE user_id = p_target_user_id FOR UPDATE;
  IF v_old_role IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','USER_NOT_FOUND','message','User role not found');
  END IF;
  IF v_old_role = p_new_role THEN
    RETURN jsonb_build_object('success',true,'code','ALREADY_SET','message','Role already set',
      'old_role',v_old_role::text,'new_role',p_new_role::text);
  END IF;
  IF v_old_role = 'admin' AND p_new_role != 'admin' THEN
    SELECT count(*) INTO v_admin_count FROM user_roles WHERE role = 'admin';
    IF v_admin_count <= 1 THEN
      RETURN jsonb_build_object('success',false,'code','LAST_ADMIN','message','Cannot remove the last admin');
    END IF;
  END IF;
  UPDATE user_roles SET role = p_new_role WHERE user_id = p_target_user_id;
  INSERT INTO user_lifecycle_audit_log (actor_user_id, target_user_id, action, old_role, new_role, reason)
  VALUES (v_caller_id, p_target_user_id, 'role_change', v_old_role, p_new_role, p_reason);
  RETURN jsonb_build_object('success',true,'code','UPDATED','message','Role updated',
    'old_role',v_old_role::text,'new_role',p_new_role::text);
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
    SELECT wo_id, currency, season_mode INTO v_wo
    FROM work_orders
    WHERE wo_id = p_wo_id;

    IF v_wo IS NULL THEN
        RAISE EXCEPTION 'Work order not found: %', p_wo_id;
    END IF;

    UPDATE activity_worksheets
    SET wo_id = p_wo_id, updated_at = now()
    WHERE id = p_worksheet_id;

    DELETE FROM wo_budget_lines WHERE wo_id = p_wo_id;

    INSERT INTO wo_budget_lines (wo_id, category_id, budgeted_hours, standard_rate)
    SELECT 
        p_wo_id,
        awc.category_id,
        SUM(awc.budget_hours),
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
  SELECT setting_value INTO allowed_domain
  FROM public.global_settings
  WHERE setting_key = 'ALLOWED_EMAIL_DOMAIN';
  
  IF allowed_domain IS NULL OR allowed_domain = '' THEN
    RETURN NEW;
  END IF;
  
  user_domain := split_part(NEW.email, '@', 2);
  
  IF lower(user_domain) != lower(allowed_domain) THEN
    RAISE EXCEPTION 'Registration restricted to @% emails only', allowed_domain;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Link auth user to staff record by email (trigger on auth.users)
CREATE OR REPLACE FUNCTION public.link_auth_user_to_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.staff
  SET auth_user_id = NEW.id,
      is_active = true,
      updated_at = now()
  WHERE lower(trim(email)) = lower(trim(NEW.email))
    AND auth_user_id IS NULL
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

-- Link staff to auth user by email (trigger on staff table)
CREATE OR REPLACE FUNCTION public.link_staff_to_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Guard: skip soft-deleted staff records
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NOT NULL AND NEW.auth_user_id IS NULL THEN
    SELECT id INTO v_auth_user_id
    FROM auth.users
    WHERE lower(trim(email)) = lower(trim(NEW.email))
    LIMIT 1;

    IF v_auth_user_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.staff
        WHERE auth_user_id = v_auth_user_id
          AND staff_id != NEW.staff_id
          AND deleted_at IS NULL
      ) THEN
        NEW.auth_user_id := v_auth_user_id;
        NEW.is_active := true;
      END IF;
    END IF;
  END IF;

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

-- Check if WO is approved before allowing time entry (with work_order_required bypass)
CREATE OR REPLACE FUNCTION public.check_wo_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wo_required boolean;
BEGIN
  SELECT work_order_required INTO v_wo_required
  FROM engagements WHERE engagement_id = NEW.engagement_id;

  IF v_wo_required IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

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

-- Handle new user signup (assign role)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'staff');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Atomically update timesheet min/max settings with feasibility validation
CREATE OR REPLACE FUNCTION public.update_timesheet_minmax_settings(
  p_daily_min numeric, p_daily_max numeric, p_weekly_min numeric, p_weekly_max numeric, p_work_days integer DEFAULT 5
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

  UPDATE global_settings SET setting_value = p_daily_min::text, updated_at = now() WHERE setting_key = 'DAILY_MIN';
  UPDATE global_settings SET setting_value = p_daily_max::text, updated_at = now() WHERE setting_key = 'DAILY_MAX';
  UPDATE global_settings SET setting_value = p_weekly_min::text, updated_at = now() WHERE setting_key = 'WEEKLY_MIN';
  UPDATE global_settings SET setting_value = p_weekly_max::text, updated_at = now() WHERE setting_key = 'WEEKLY_MAX';

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Submit timesheet safely (with line approval management, min/max validation, engagement date range gate)
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
  v_period RECORD;
  v_existing RECORD;
  v_eng_id uuid;
  v_max_te_updated timestamptz;
  v_affected integer;

  -- Per-engagement approval policy (BUG 0220-61)
  v_skip_approval boolean;
  v_effective_auto boolean;
  v_upgraded_to_approved integer := 0;

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
  -- 1. SANITIZE
  p_engagement_ids := ARRAY(
    SELECT DISTINCT unnest FROM unnest(p_engagement_ids) WHERE unnest IS NOT NULL
  );

  IF array_length(p_engagement_ids, 1) IS NULL OR array_length(p_engagement_ids, 1) = 0 THEN
    RAISE EXCEPTION 'EMPTY_ENGAGEMENTS: No valid engagement IDs after sanitization';
  END IF;

  -- 2. LOCK
  SELECT period_id, staff_id, submitted_at INTO v_period
  FROM timesheet_periods
  WHERE period_id = p_period_id AND staff_id = p_staff_id
  FOR UPDATE;

  IF v_period IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Period % does not exist or does not belong to staff %', p_period_id, p_staff_id;
  END IF;

  -- BUG 0213-36: Enforce weekly min/max
  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_MIN'), 40
  ) INTO v_weekly_min;

  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_MAX'), 40
  ) INTO v_weekly_max;

  SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual_hours
  FROM time_entries te
  WHERE te.period_id = p_period_id AND te.staff_id = p_staff_id AND te.is_forecast = false;

  IF v_actual_hours < v_weekly_min THEN
    RAISE EXCEPTION 'WEEKLY_MIN_NOT_MET:actual=%,min=%', v_actual_hours, v_weekly_min;
  END IF;

  IF v_actual_hours > v_weekly_max THEN
    RAISE EXCEPTION 'WEEKLY_MAX_EXCEEDED:actual=%,max=%', v_actual_hours, v_weekly_max;
  END IF;

  -- BUG 0220-63: Reject if entries outside engagement date window
  IF EXISTS (
    SELECT 1 FROM time_entries te
    JOIN engagements e ON te.engagement_id = e.engagement_id
    WHERE te.period_id = p_period_id AND te.staff_id = p_staff_id AND te.is_forecast = false
      AND ((e.start_date IS NOT NULL AND te.date_worked < e.start_date)
        OR (e.end_date IS NOT NULL AND te.date_worked > e.end_date))
  ) THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE_VIOLATION: Period contains entries outside engagement date range';
  END IF;

  -- 3. UPDATE PERIOD
  UPDATE timesheet_periods SET submitted_at = now() WHERE period_id = p_period_id;

  -- 4-7. Process each engagement
  FOREACH v_eng_id IN ARRAY p_engagement_ids LOOP
    -- BUG 0220-61: Per-engagement approval policy
    SELECT NOT COALESCE(e.approval_required, true)
    INTO v_skip_approval
    FROM engagements e WHERE e.engagement_id = v_eng_id;

    v_effective_auto := p_is_auto_approved OR COALESCE(v_skip_approval, false);

    SELECT approval_id, status, updated_at INTO v_existing
    FROM timesheet_line_approvals
    WHERE period_id = p_period_id AND engagement_id = v_eng_id;

    IF FOUND THEN
      IF v_existing.status = 'approved' THEN
        v_preserved_approved := v_preserved_approved + 1;
        CONTINUE;
      END IF;

      IF v_existing.status = 'pending' THEN
        IF v_effective_auto THEN
          UPDATE timesheet_line_approvals
          SET status = 'approved', approved_by = p_staff_id, approved_at = now()
          WHERE period_id = p_period_id AND engagement_id = v_eng_id AND status = 'pending';
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          IF v_affected > 0 THEN
            v_upgraded_to_approved := v_upgraded_to_approved + 1;
          ELSE
            v_guarded_update_skips := v_guarded_update_skips + 1;
          END IF;
        END IF;
        CONTINUE;
      END IF;

      IF v_existing.status = 'rejected' THEN
        IF v_effective_auto THEN
          UPDATE timesheet_line_approvals
          SET status = 'approved', approved_by = p_staff_id, approved_at = now(), review_notes = NULL
          WHERE period_id = p_period_id AND engagement_id = v_eng_id AND status = 'rejected';
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          IF v_affected > 0 THEN
            v_upgraded_to_approved := v_upgraded_to_approved + 1;
          ELSE
            v_guarded_update_skips := v_guarded_update_skips + 1;
          END IF;
        ELSE
          SELECT MAX(te.updated_at) INTO v_max_te_updated
          FROM time_entries te
          WHERE te.period_id = p_period_id AND te.engagement_id = v_eng_id AND te.is_forecast = false;

          IF v_max_te_updated IS NOT NULL AND v_max_te_updated > v_existing.updated_at THEN
            v_affected := 0;
            UPDATE timesheet_line_approvals
            SET status = 'pending', approved_by = NULL, approved_at = NULL, review_notes = NULL
            WHERE period_id = p_period_id AND engagement_id = v_eng_id AND status = 'rejected';
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
$$;

-- Get week statuses for a staff member across a date range
CREATE OR REPLACE FUNCTION public.get_week_statuses(p_staff_id uuid, p_start_date date, p_end_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hire_date date;
  v_term_date date;
  v_capacity numeric;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_missing numeric;
  v_period_id uuid;
  v_submitted_at timestamptz;
  v_status text;
  v_is_current boolean;
  v_approval_total integer;
  v_approval_approved integer;
  v_approval_rejected integer;
  v_result jsonb := '[]'::jsonb;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT s.hire_date, s.termination_date, s.weekly_capacity_hours
  INTO v_hire_date, v_term_date, v_capacity
  FROM public.staff s WHERE s.staff_id = p_staff_id;

  v_daily := COALESCE(v_capacity, 40) / 5.0;
  v_cursor := p_start_date - (EXTRACT(ISODOW FROM p_start_date)::int - 1);

  WHILE v_cursor <= p_end_date LOOP
    v_week_end := v_cursor + 4;
    v_eff_start := v_cursor;
    v_eff_end := v_week_end;

    IF v_hire_date IS NOT NULL AND v_eff_start < v_hire_date THEN
      v_eff_start := v_hire_date;
    END IF;
    IF v_term_date IS NOT NULL AND v_eff_end > v_term_date THEN
      v_eff_end := v_term_date;
    END IF;

    IF v_hire_date IS NOT NULL AND v_week_end < v_hire_date THEN
      v_cursor := v_cursor + 7; CONTINUE;
    END IF;
    IF v_term_date IS NOT NULL AND v_cursor > v_term_date THEN
      v_cursor := v_cursor + 7; CONTINUE;
    END IF;

    v_is_current := (v_cursor <= v_today AND v_week_end >= v_today);

    IF v_is_current THEN
      SELECT COUNT(*) INTO v_working_days
      FROM generate_series(v_eff_start, LEAST(v_eff_end, v_today), '1 day'::interval) d
      WHERE EXTRACT(ISODOW FROM d) <= 5;

      SELECT COUNT(*) INTO v_holiday_count
      FROM public.holidays h
      WHERE h.holiday_date BETWEEN v_eff_start AND LEAST(v_eff_end, v_today)
        AND EXTRACT(ISODOW FROM h.holiday_date) <= 5;

      v_working_days := v_working_days - v_holiday_count;
      v_expected := GREATEST(v_working_days, 0) * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM public.time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_result := v_result || jsonb_build_object(
        'week_start', v_cursor, 'week_end', v_week_end,
        'status', 'CURRENT', 'total_logged_hours', v_actual,
        'expected_hours', v_expected, 'missing_hours', GREATEST(v_expected - v_actual, 0),
        'is_submitted', false, 'is_current_week', true
      );
      v_cursor := v_cursor + 7; CONTINUE;
    END IF;

    IF v_cursor > v_today THEN
      v_result := v_result || jsonb_build_object(
        'week_start', v_cursor, 'week_end', v_week_end,
        'status', 'FUTURE', 'total_logged_hours', 0,
        'expected_hours', 0, 'missing_hours', 0,
        'is_submitted', false, 'is_current_week', false
      );
      v_cursor := v_cursor + 7; CONTINUE;
    END IF;

    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(*) INTO v_holiday_count
    FROM public.holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5;

    v_working_days := v_working_days - v_holiday_count;
    v_expected := GREATEST(v_working_days, 0) * v_daily;

    SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
    FROM public.time_entries te
    WHERE te.staff_id = p_staff_id
      AND te.date_worked BETWEEN v_eff_start AND v_eff_end
      AND te.is_forecast = false;

    v_missing := GREATEST(v_expected - v_actual, 0);

    SELECT tp.period_id, tp.submitted_at INTO v_period_id, v_submitted_at
    FROM public.timesheet_periods tp
    WHERE tp.staff_id = p_staff_id AND tp.week_start_date = v_cursor;

    IF v_period_id IS NULL THEN
      IF v_actual > 0 THEN v_status := 'NOT_SUBMITTED';
      ELSE v_status := 'NOT_LOGGED';
      END IF;
    ELSIF v_submitted_at IS NULL THEN
      v_status := 'DRAFT';
    ELSE
      SELECT COUNT(*), COUNT(*) FILTER (WHERE tla.status = 'approved'),
             COUNT(*) FILTER (WHERE tla.status = 'rejected')
      INTO v_approval_total, v_approval_approved, v_approval_rejected
      FROM public.timesheet_line_approvals tla WHERE tla.period_id = v_period_id;

      IF v_approval_total = 0 THEN v_status := 'PENDING_APPROVAL';
      ELSIF v_approval_approved = v_approval_total THEN v_status := 'APPROVED';
      ELSIF v_approval_rejected > 0 THEN v_status := 'REJECTED';
      ELSE v_status := 'PENDING_APPROVAL';
      END IF;
    END IF;

    v_result := v_result || jsonb_build_object(
      'week_start', v_cursor, 'week_end', v_week_end,
      'status', v_status, 'total_logged_hours', v_actual,
      'expected_hours', v_expected, 'missing_hours', v_missing,
      'is_submitted', (v_submitted_at IS NOT NULL), 'is_current_week', false
    );

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;

-- Get pending hours for a staff member
CREATE OR REPLACE FUNCTION public.get_my_pending_hours(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hire_date date;
  v_end_date date;
  v_capacity numeric;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_gap numeric;
  v_result jsonb := '[]'::jsonb;
BEGIN
  SELECT s.hire_date, s.weekly_capacity_hours, s.termination_date
  INTO v_hire_date, v_capacity, v_end_date
  FROM public.staff s WHERE s.staff_id = p_staff_id;

  IF v_hire_date IS NULL THEN RETURN '[]'::jsonb; END IF;

  v_end_date := LEAST(COALESCE(v_end_date, CURRENT_DATE), CURRENT_DATE);
  v_daily := COALESCE(v_capacity, 40) / 5.0;
  v_cursor := v_hire_date - (EXTRACT(ISODOW FROM v_hire_date)::int - 1);

  WHILE v_cursor <= v_end_date LOOP
    v_week_end := v_cursor + 4;
    IF v_week_end >= CURRENT_DATE THEN EXIT; END IF;

    v_eff_start := GREATEST(v_cursor, v_hire_date);
    v_eff_end := LEAST(v_week_end, v_end_date);

    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(*) INTO v_holiday_count
    FROM public.holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5;

    v_working_days := v_working_days - v_holiday_count;

    IF v_working_days > 0 THEN
      v_expected := v_working_days * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM public.time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_gap := v_expected - v_actual;

      IF v_gap > 0 THEN
        v_result := v_result || jsonb_build_object(
          'week_start', v_cursor, 'expected_hours', v_expected,
          'actual_hours', v_actual, 'gap', v_gap
        );
      END IF;
    END IF;

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;

-- Check pending hours before termination
CREATE OR REPLACE FUNCTION public.check_pending_hours_before_termination(p_staff_id uuid, p_termination_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hire_date date;
  v_capacity numeric;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_gap numeric;
  v_result jsonb := '[]'::jsonb;
BEGIN
  SELECT hire_date, weekly_capacity_hours INTO v_hire_date, v_capacity
  FROM staff WHERE staff_id = p_staff_id;

  IF v_hire_date IS NULL THEN v_hire_date := p_termination_date; END IF;
  v_daily := COALESCE(v_capacity, 40) / 5.0;
  v_cursor := v_hire_date - (EXTRACT(ISODOW FROM v_hire_date)::int - 1);

  WHILE v_cursor <= p_termination_date LOOP
    v_week_end := v_cursor + 4;
    v_eff_start := GREATEST(v_cursor, v_hire_date);
    v_eff_end := LEAST(v_week_end, p_termination_date);

    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(*) INTO v_holiday_count
    FROM holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5;

    v_working_days := v_working_days - v_holiday_count;

    IF v_working_days > 0 THEN
      v_expected := v_working_days * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_gap := v_expected - v_actual;

      IF v_gap > 0 THEN
        v_result := v_result || jsonb_build_object(
          'week_start', v_cursor, 'effective_start', v_eff_start,
          'effective_end', v_eff_end, 'expected_hours', v_expected,
          'actual_hours', v_actual, 'gap', v_gap
        );
      END IF;
    END IF;

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;

-- Get approvable (period, engagement) pairs for current user
CREATE OR REPLACE FUNCTION public.get_approvable_pairs(p_period_ids uuid[], p_engagement_ids uuid[])
RETURNS TABLE(period_id uuid, engagement_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_approver_auth_id UUID := auth.uid();
  v_approver_staff_id UUID;
  v_approver_display_order INTEGER;
  v_pair_count INTEGER;
  i INTEGER;
  v_period_staff_id UUID;
  v_expected_approver UUID;
  v_expected_display_order INTEGER;
BEGIN
  SELECT s.staff_id INTO v_approver_staff_id
  FROM staff s WHERE s.auth_user_id = v_approver_auth_id;
  IF v_approver_staff_id IS NULL THEN RETURN; END IF;

  SELECT c.display_order INTO v_approver_display_order
  FROM staff s JOIN categories c ON s.category_id = c.category_id
  WHERE s.staff_id = v_approver_staff_id AND c.can_approve_timesheets = TRUE;
  IF v_approver_display_order IS NULL THEN RETURN; END IF;

  v_pair_count := array_length(p_period_ids, 1);
  IF v_pair_count IS NULL OR v_pair_count != COALESCE(array_length(p_engagement_ids, 1), 0) THEN
    RETURN;
  END IF;

  FOR i IN 1..v_pair_count LOOP
    SELECT tp.staff_id INTO v_period_staff_id
    FROM timesheet_periods tp WHERE tp.period_id = p_period_ids[i];
    IF v_period_staff_id IS NULL THEN CONTINUE; END IF;
    IF v_approver_staff_id = v_period_staff_id THEN CONTINUE; END IF;

    v_expected_approver := get_line_approver(v_period_staff_id, p_engagement_ids[i]);
    IF v_expected_approver IS NULL THEN CONTINUE; END IF;

    IF v_approver_staff_id = v_expected_approver THEN
      period_id := p_period_ids[i];
      engagement_id := p_engagement_ids[i];
      RETURN NEXT;
    ELSE
      SELECT c.display_order INTO v_expected_display_order
      FROM staff s JOIN categories c ON s.category_id = c.category_id
      WHERE s.staff_id = v_expected_approver;

      IF v_expected_display_order IS NOT NULL AND v_approver_display_order < v_expected_display_order THEN
        period_id := p_period_ids[i];
        engagement_id := p_engagement_ids[i];
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Start a timer entry (ensures no concurrent running timer)
CREATE OR REPLACE FUNCTION public.start_timer_entry(p_engagement_id uuid, p_activity_id uuid, p_description text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  SELECT staff_id INTO v_staff_id FROM staff WHERE auth_user_id = auth.uid();
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'No staff record linked to current user'; END IF;

  SELECT timer_id INTO v_existing_id FROM timer_entries
  WHERE staff_id = v_staff_id AND ended_at IS NULL;
  IF v_existing_id IS NOT NULL THEN RAISE EXCEPTION 'RUNNING_TIMER_EXISTS:%', v_existing_id; END IF;

  INSERT INTO timer_entries (staff_id, engagement_id, activity_id, description, started_at)
  VALUES (v_staff_id, p_engagement_id, p_activity_id, p_description, now())
  RETURNING timer_id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Stop a timer entry (clamps to 8h, rounds to 5min)
CREATE OR REPLACE FUNCTION public.stop_timer_entry(p_timer_id uuid, p_ended_at timestamptz DEFAULT now())
RETURNS TABLE(timer_id uuid, duration_minutes integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff_id uuid;
  v_started_at timestamptz;
  v_clamped_end timestamptz;
  v_raw_minutes numeric;
  v_duration integer;
BEGIN
  SELECT s.staff_id INTO v_staff_id FROM staff s WHERE s.auth_user_id = auth.uid();
  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'No staff record linked to current user'; END IF;

  SELECT te.started_at INTO v_started_at FROM timer_entries te
  WHERE te.timer_id = p_timer_id AND te.staff_id = v_staff_id AND te.ended_at IS NULL;
  IF v_started_at IS NULL THEN RAISE EXCEPTION 'Timer not found, not yours, or already stopped'; END IF;

  v_clamped_end := LEAST(p_ended_at, v_started_at + interval '8 hours');
  v_raw_minutes := EXTRACT(EPOCH FROM (v_clamped_end - v_started_at)) / 60;
  v_duration := LEAST(480, GREATEST(5, ROUND(v_raw_minutes / 5.0) * 5));

  UPDATE timer_entries te SET ended_at = v_clamped_end, duration_minutes = v_duration
  WHERE te.timer_id = p_timer_id;

  RETURN QUERY SELECT p_timer_id, v_duration;
END;
$$;

-- Finalize stale timers for current user (>8h old)
CREATE OR REPLACE FUNCTION public.finalize_my_stale_timers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_staff_id uuid;
  v_count integer;
BEGIN
  SELECT staff_id INTO v_staff_id FROM staff WHERE auth_user_id = auth.uid();
  IF v_staff_id IS NULL THEN RETURN 0; END IF;

  UPDATE timer_entries
  SET ended_at = started_at + interval '8 hours', duration_minutes = 480
  WHERE ended_at IS NULL AND staff_id = v_staff_id AND started_at < now() - interval '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Finalize all stale timers (admin/system use)
CREATE OR REPLACE FUNCTION public.finalize_all_stale_timers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE timer_entries
  SET ended_at = started_at + interval '8 hours', duration_minutes = 480
  WHERE ended_at IS NULL AND started_at < now() - interval '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Trigger: Reset timer import flag when unlinked from time entry
CREATE OR REPLACE FUNCTION public.reset_timer_import_on_unlink()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.imported_to_time_id IS NULL AND OLD.imported_to_time_id IS NOT NULL THEN
    NEW.is_imported := false;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: Enforce termination date on time entries
CREATE OR REPLACE FUNCTION public.enforce_termination_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_term date;
BEGIN
  SELECT termination_date INTO v_term FROM staff WHERE staff_id = NEW.staff_id;
  IF v_term IS NOT NULL AND NEW.date_worked > v_term THEN
    RAISE EXCEPTION 'TERMINATION_DATE_BLOCKED: Cannot log time after termination date %', v_term;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: Prevent staff reactivation
-- BUG 0526-123: removed REACTIVATION_BLOCKED for terminated staff (admins
-- must be able to reactivate to regularize prior-period timesheets).
-- Soft-deleted rows remain non-reactivatable.
CREATE OR REPLACE FUNCTION public.prevent_staff_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- termination_date immutability — protects audit evidence on inactive
  -- rows AND prevents clearing the date during reactivation so
  -- trg_enforce_termination_date keeps blocking post-exit hour entries.
  -- TD-4 exception: active→active is allowed so admins can fix a stray date.
  IF OLD.termination_date IS NOT NULL
     AND NEW.termination_date IS NULL
     AND NOT (OLD.is_active = true AND NEW.is_active = true) THEN
    RAISE EXCEPTION 'TERMINATION_DATE_IMMUTABLE: Cannot clear termination_date except on an already-active staff row.';
  END IF;

  -- Soft-deleted rows cannot be reactivated regardless of termination_date.
  IF OLD.deleted_at IS NOT NULL
     AND OLD.is_active = false
     AND NEW.is_active = true THEN
    RAISE EXCEPTION 'REACTIVATION_BLOCKED: Cannot reactivate a soft-deleted staff row. Create a new record instead.';
  END IF;

  -- deleted_at is never reversible (soft-deletes are one-way).
  IF OLD.deleted_at IS NOT NULL
     AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'DELETED_AT_IMMUTABLE: Cannot clear deleted_at on a staff row. Soft-deleted records cannot be restored; create a new record instead.';
  END IF;

  RETURN NEW;
END;
$$;

-- BUG 0601-132: block non-admin self-updates of staff.is_blocked.
-- Trusted lockout functions (record_failed_login / reset_login_attempts /
-- admin_unblock_account) set the transaction-local flag app.allow_blocked_change
-- before touching the flag; a direct PostgREST UPDATE cannot, so a user cannot
-- clear their own lockout. See migration 20260602000000.
CREATE OR REPLACE FUNCTION public.prevent_self_blocked_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     AND current_setting('app.allow_blocked_change', true) IS DISTINCT FROM 'on'
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: is_blocked can only be changed by an administrator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- BUG 0601-132: restrict writes to the lockout threshold settings to admins.
-- record_failed_login() consumes AUTH_MAX_FAILED_ATTEMPTS / AUTH_LOCKOUT_MINUTES
-- from global_settings, so these rows are a security control. RLS on
-- global_settings is disabled (20260115000154), so this trigger — not RLS — is
-- what keeps an authenticated user from weakening the lockout policy via a
-- direct PostgREST write. See migration 20260602000001.
CREATE OR REPLACE FUNCTION public.guard_auth_lockout_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.setting_key IN ('AUTH_MAX_FAILED_ATTEMPTS', 'AUTH_LOCKOUT_MINUTES')
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: % can only be changed by an administrator', NEW.setting_key
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: Validate submission has entries
CREATE OR REPLACE FUNCTION public.validate_submission_has_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entry_count integer;
BEGIN
  SELECT COUNT(*) INTO v_entry_count
  FROM time_entries te
  WHERE te.staff_id = NEW.staff_id
    AND te.date_worked >= NEW.week_start_date
    AND te.date_worked <= NEW.week_start_date + 4
    AND te.is_forecast = false;

  IF v_entry_count = 0 THEN
    RAISE EXCEPTION 'SUBMIT_NO_ENTRIES: Cannot submit a timesheet with no time entries for week starting %', NEW.week_start_date;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: Enforce activity default for non-activity-required engagements
CREATE OR REPLACE FUNCTION public.enforce_activity_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_activity_required boolean;
  v_raw text;
  v_adm_id uuid;
BEGIN
  SELECT activity_required INTO v_activity_required
  FROM engagements WHERE engagement_id = NEW.engagement_id;

  IF v_activity_required IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  SELECT setting_value INTO v_raw
  FROM global_settings WHERE setting_key = 'ADM_ACTIVITY_ID';

  IF v_raw IS NULL OR TRIM(v_raw) = '' THEN
    RAISE EXCEPTION 'ADM_ACTIVITY_NOT_CONFIGURED';
  END IF;

  v_adm_id := TRIM(v_raw)::uuid;
  NEW.activity_id := v_adm_id;
  RETURN NEW;
END;
$$;

-- Trigger: Enforce holiday blocking on time entries
CREATE OR REPLACE FUNCTION public.enforce_holiday_blocking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_holiday_name text;
  v_raw text;
  v_setting text;
  v_holiday_engagement_id uuid;
BEGIN
  SELECT holiday_name INTO v_holiday_name FROM holidays WHERE holiday_date = NEW.date_worked;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT setting_value INTO v_raw FROM global_settings WHERE setting_key = 'HOLIDAY_ENGAGEMENT_ID';
  v_setting := NULLIF(TRIM(v_raw), '');

  IF v_setting IS NULL THEN RAISE EXCEPTION 'HOLIDAY_NOT_CONFIGURED'; END IF;

  v_holiday_engagement_id := v_setting::uuid;
  IF NEW.engagement_id != v_holiday_engagement_id THEN
    RAISE EXCEPTION 'HOLIDAY_BLOCKED:%', v_holiday_name;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: Validate time entry dates against engagement date range (BUG 0220-63)
CREATE OR REPLACE FUNCTION public.check_time_entry_engagement_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start date;
  v_end   date;
BEGIN
  SELECT e.start_date, e.end_date INTO v_start, v_end
  FROM engagements e WHERE e.engagement_id = NEW.engagement_id;

  IF v_start IS NOT NULL AND NEW.date_worked < v_start THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE: date_worked % is before engagement start_date %',
      NEW.date_worked, v_start USING ERRCODE = 'check_violation';
  END IF;

  IF v_end IS NOT NULL AND NEW.date_worked > v_end THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE: date_worked % is after engagement end_date %',
      NEW.date_worked, v_end USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: Validate timer entry duration (max 8h / 480min)
CREATE OR REPLACE FUNCTION public.validate_timer_entry_duration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL THEN
    IF NEW.ended_at > NEW.started_at + interval '8 hours' THEN
      RAISE EXCEPTION 'Timer entry cannot exceed 8 hours';
    END IF;
  END IF;
  IF NEW.duration_minutes IS NOT NULL AND NEW.duration_minutes > 480 THEN
    RAISE EXCEPTION 'Duration cannot exceed 480 minutes (8 hours)';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: Prevent deletion of imported timer entries
CREATE OR REPLACE FUNCTION public.prevent_imported_timer_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.is_imported = true THEN
    RAISE EXCEPTION 'Cannot delete imported timer entry (timer_id: %)', OLD.timer_id;
  END IF;
  RETURN OLD;
END;
$$;

-- Trigger: Protect approved time entries from modification
CREATE OR REPLACE FUNCTION public.protect_approved_time_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_period uuid;
  old_engagement uuid;
  new_period uuid;
  new_engagement uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_period := OLD.period_id;
    old_engagement := OLD.engagement_id;
    IF old_period IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.timesheet_line_approvals tla
      WHERE tla.period_id = old_period AND tla.engagement_id = old_engagement AND tla.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot delete time entries on an approved line';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    new_period := NEW.period_id;
    new_engagement := NEW.engagement_id;
    IF new_period IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.timesheet_line_approvals tla
      WHERE tla.period_id = new_period AND tla.engagement_id = new_engagement AND tla.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot insert time entries into an approved line';
    END IF;
    RETURN NEW;
  END IF;

  old_period := OLD.period_id;
  old_engagement := OLD.engagement_id;
  new_period := COALESCE(NEW.period_id, OLD.period_id);
  new_engagement := COALESCE(NEW.engagement_id, OLD.engagement_id);

  IF old_period IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.timesheet_line_approvals tla
    WHERE tla.period_id = old_period AND tla.engagement_id = old_engagement AND tla.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot modify time entries on an approved line';
  END IF;

  IF new_period IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.timesheet_line_approvals tla
    WHERE tla.period_id = new_period AND tla.engagement_id = new_engagement AND tla.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot move time entries into an approved line';
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
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.society ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_line_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_lifecycle_audit_log ENABLE ROW LEVEL SECURITY;
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

-- Holidays
CREATE POLICY "Admins can insert holidays" ON public.holidays 
  FOR INSERT TO authenticated 
  WITH CHECK (is_admin());
CREATE POLICY "Admins can update holidays" ON public.holidays 
  FOR UPDATE TO authenticated 
  USING (is_admin());
CREATE POLICY "Admins can delete holidays" ON public.holidays 
  FOR DELETE TO authenticated 
  USING (is_admin());
CREATE POLICY "Authenticated users can read holidays" ON public.holidays 
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

-- User Lifecycle Audit Log
CREATE POLICY "Admins can view lifecycle audit" ON public.user_lifecycle_audit_log 
  FOR SELECT TO authenticated 
  USING (has_role(auth.uid(), 'admin'));

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
-- GRANTS / REVOKES
-- ============================================================================

-- User Lifecycle Audit Log: restrict direct DML from regular users
REVOKE INSERT, UPDATE, DELETE ON public.user_lifecycle_audit_log FROM anon, authenticated;
GRANT INSERT ON public.user_lifecycle_audit_log TO service_role;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Time Entries triggers
CREATE TRIGGER trg_check_wo_approved BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.check_wo_approved();

CREATE TRIGGER trg_enforce_activity_default BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_default();

CREATE TRIGGER trg_enforce_holiday_blocking BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_holiday_blocking();

CREATE TRIGGER trg_enforce_termination_date BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_termination_date();

CREATE TRIGGER trg_check_engagement_dates BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.check_time_entry_engagement_dates();

CREATE TRIGGER trg_protect_approved_time_entries BEFORE INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.protect_approved_time_entries();

-- Timer Entries triggers
CREATE TRIGGER trg_validate_timer_duration BEFORE INSERT OR UPDATE ON public.timer_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_timer_entry_duration();

CREATE TRIGGER trg_prevent_imported_timer_delete BEFORE DELETE ON public.timer_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_imported_timer_delete();

CREATE TRIGGER trg_reset_timer_import_on_unlink BEFORE UPDATE ON public.timer_entries
  FOR EACH ROW EXECUTE FUNCTION public.reset_timer_import_on_unlink();

-- Staff triggers
CREATE TRIGGER trg_link_staff_to_auth_user BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.link_staff_to_auth_user();

CREATE TRIGGER trg_prevent_staff_reactivation BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staff_reactivation();

-- BUG 0601-132: block non-admin self-updates of is_blocked (see migration
-- 20260602000000). Only admins / no-JWT service_role + SECURITY DEFINER lockout
-- paths may flip the flag; the "Users can update their linked staff record"
-- policy would otherwise let a user clear their own lockout.
CREATE TRIGGER trg_prevent_self_blocked_change BEFORE UPDATE OF is_blocked ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_blocked_change();

-- Global Settings triggers
-- BUG 0601-132: restrict the lockout threshold keys to admin writers (see
-- migration 20260602000001). RLS on global_settings is disabled, so this
-- trigger is the actual guard against weakening the lockout policy via the API.
CREATE TRIGGER trg_guard_auth_lockout_settings BEFORE INSERT OR UPDATE ON public.global_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_auth_lockout_settings();

-- Timesheet Periods triggers
CREATE TRIGGER trg_validate_submission_has_entries BEFORE UPDATE ON public.timesheet_periods
  FOR EACH ROW WHEN (OLD.submitted_at IS NULL AND NEW.submitted_at IS NOT NULL)
  EXECUTE FUNCTION public.validate_submission_has_entries();

-- ============================================================================
-- SKILLS TRACKING (Scheduler Phase 1) — Added 2026-04-12
-- ============================================================================

-- Master skill taxonomy (admin-managed)
CREATE TABLE public.skills (
  skill_id   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       VARCHAR     NOT NULL,
  category   VARCHAR     NOT NULL,
  is_active  BOOLEAN     DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_skills_name_not_empty     CHECK (TRIM(name) <> ''),
  CONSTRAINT chk_skills_category_not_empty CHECK (TRIM(category) <> '')
);

-- Case-insensitive uniqueness
CREATE UNIQUE INDEX idx_skills_name_unique ON public.skills (LOWER(TRIM(name)));

-- Staff-to-skill junction table
CREATE TABLE public.staff_skills (
  staff_skill_id    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id          UUID        NOT NULL REFERENCES public.staff(staff_id)  ON DELETE CASCADE,
  skill_id          UUID        NOT NULL REFERENCES public.skills(skill_id) ON DELETE RESTRICT,
  proficiency_level VARCHAR     NOT NULL CHECK (proficiency_level IN ('Beginner', 'Intermediate', 'Advanced')),
  last_evaluated_date DATE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (staff_id, skill_id)
);

CREATE INDEX idx_staff_skills_staff ON public.staff_skills (staff_id);
CREATE INDEX idx_staff_skills_skill ON public.staff_skills (skill_id);

-- RLS: skills
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage skills" ON public.skills FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated users can read skills" ON public.skills FOR SELECT TO authenticated
  USING (true);

-- RLS: staff_skills
ALTER TABLE public.staff_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage staff skills" ON public.staff_skills FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated users can read staff skills" ON public.staff_skills FOR SELECT TO authenticated
  USING (true);

-- Triggers
CREATE TRIGGER update_skills_updated_at BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_staff_skills_updated_at BEFORE UPDATE ON public.staff_skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Account Lockout Policy (BUG 0514-115)
-- ============================================================================

CREATE TABLE public.auth_login_attempts (
  email_normalized text PRIMARY KEY,
  attempts_count   integer     NOT NULL DEFAULT 0,
  last_attempt_at  timestamptz NOT NULL DEFAULT now(),
  locked_until     timestamptz
);

ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_login_attempts FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.check_login_allowed(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email     text := lower(trim(p_email));
  v_locked    timestamptz;
  v_remaining integer;
BEGIN
  SELECT locked_until INTO v_locked
  FROM public.auth_login_attempts
  WHERE email_normalized = v_email;

  IF v_locked IS NOT NULL AND v_locked > now() THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_locked - now()))::integer);
    RETURN jsonb_build_object('allowed', false, 'remaining_seconds', v_remaining);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'remaining_seconds', 0);
END;
$$;

-- BUG 0601-132: thresholds now read from global_settings (AUTH_MAX_FAILED_ATTEMPTS,
-- AUTH_LOCKOUT_MINUTES) with defensive regex validation and fallback to 5/15.
-- Also propagates staff.is_blocked = true when lockout fires.
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email        text        := lower(trim(p_email));
  v_max          integer;
  v_lockout      interval;
  v_reset        interval    := interval '15 minutes';
  v_now          timestamptz := now();
  v_existing     public.auth_login_attempts%ROWTYPE;
  v_new_count    integer;
  v_locked_until timestamptz;
  v_remaining    integer;
  v_raw          text;
BEGIN
  SELECT setting_value INTO v_raw FROM public.global_settings WHERE setting_key = 'AUTH_MAX_FAILED_ATTEMPTS' LIMIT 1;
  IF v_raw ~ '^[1-9][0-9]*$' THEN v_max := v_raw::integer; ELSE v_max := 5; END IF;

  SELECT setting_value INTO v_raw FROM public.global_settings WHERE setting_key = 'AUTH_LOCKOUT_MINUTES' LIMIT 1;
  IF v_raw ~ '^[1-9][0-9]*$' THEN v_lockout := make_interval(mins => v_raw::integer); ELSE v_lockout := interval '15 minutes'; END IF;

  INSERT INTO public.auth_login_attempts (email_normalized, attempts_count, last_attempt_at)
  VALUES (v_email, 0, v_now)
  ON CONFLICT (email_normalized) DO NOTHING;

  SELECT * INTO v_existing FROM public.auth_login_attempts WHERE email_normalized = v_email FOR UPDATE;

  IF v_existing.locked_until IS NOT NULL AND v_existing.locked_until > v_now THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_existing.locked_until - v_now))::integer);
    RETURN jsonb_build_object('locked', true, 'remaining_seconds', v_remaining);
  END IF;

  IF v_existing.last_attempt_at < (v_now - v_reset) THEN v_new_count := 1;
  ELSE v_new_count := v_existing.attempts_count + 1;
  END IF;

  IF v_new_count >= v_max THEN v_locked_until := v_now + v_lockout;
  ELSE v_locked_until := NULL;
  END IF;

  UPDATE public.auth_login_attempts
  SET attempts_count = v_new_count, last_attempt_at = v_now, locked_until = v_locked_until
  WHERE email_normalized = v_email;

  IF v_locked_until IS NOT NULL THEN
    BEGIN
      UPDATE public.staff SET is_blocked = true WHERE lower(trim(email)) = v_email AND is_blocked = false;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[0601-132] record_failed_login: could not set staff.is_blocked: %', SQLERRM;
    END;
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - v_now))::integer);
    RETURN jsonb_build_object('locked', true, 'remaining_seconds', v_remaining);
  END IF;

  RETURN jsonb_build_object('locked', false, 'remaining_seconds', 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_login_attempts(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email     text := lower(trim(p_email));
  v_jwt_email text := lower(trim(coalesce((auth.jwt() ->> 'email'), '')));
BEGIN
  -- Authenticated callers may only reset their own counter.
  -- postgres/service_role (no JWT) is allowed for admin/Studio unblock.
  IF auth.jwt() IS NOT NULL AND v_jwt_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'RESET_FORBIDDEN: caller email mismatch';
  END IF;

  DELETE FROM public.auth_login_attempts
  WHERE email_normalized = v_email;

  -- BUG 0601-132: clear admin-visible blocked flag on successful login (auto-unlock path).
  BEGIN
    UPDATE public.staff SET is_blocked = false WHERE lower(trim(email)) = v_email AND is_blocked = true;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[0601-132] reset_login_attempts: could not clear staff.is_blocked: %', SQLERRM;
  END;
END;
$$;

-- BUG 0601-132: admin manual unlock RPC (service_role only).
-- Atomically clears staff.is_blocked and deletes auth_login_attempts row.
-- Returns { ok, email } so the caller (unlock-account edge function) can send the reset email.
CREATE OR REPLACE FUNCTION public.admin_unblock_account(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT lower(trim(email)) INTO v_email FROM public.staff WHERE staff_id = p_staff_id AND deleted_at IS NULL;
  IF v_email IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'STAFF_NOT_FOUND'); END IF;
  UPDATE public.staff SET is_blocked = false WHERE staff_id = p_staff_id;
  DELETE FROM public.auth_login_attempts WHERE email_normalized = v_email;
  RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unblock_account(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_account(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_login_allowed(text)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_login_attempts(text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.check_login_allowed(text)  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text)  TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_login_attempts(text) TO authenticated;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
