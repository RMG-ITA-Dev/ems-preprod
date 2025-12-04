-- =============================================
-- EMS 2.0 Database Schema
-- =============================================

-- 1. GLOBAL_SETTINGS - System-wide configuration
CREATE TABLE public.global_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. INDUSTRIES - Industry definitions with fiscal year end
CREATE TABLE public.industries (
  industry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_name VARCHAR(100) NOT NULL UNIQUE,
  fiscal_year_end VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. CATEGORIES - Staff categories with seasonal/currency rates
CREATE TABLE public.categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name VARCHAR(50) NOT NULL UNIQUE,
  rate_high_bob DECIMAL(10,2) NOT NULL DEFAULT 0,
  rate_low_bob DECIMAL(10,2) NOT NULL DEFAULT 0,
  rate_high_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
  rate_low_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. ACTIVITY_CODES - Time tracking activity types
CREATE TABLE public.activity_codes (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_code VARCHAR(10) NOT NULL UNIQUE,
  description VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. EXPENSE_TYPES - Expense categories
CREATE TABLE public.expense_types (
  expense_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_name VARCHAR(100) NOT NULL UNIQUE,
  default_unit_cost DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. STAFF - Staff members (links to auth.users)
CREATE TABLE public.staff (
  staff_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  category_id UUID REFERENCES public.categories(category_id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. CLIENTS - Client master data
CREATE TABLE public.clients (
  client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_legal_name VARCHAR(255) NOT NULL,
  unique_tax_id VARCHAR(50) NOT NULL UNIQUE,
  industry_id UUID REFERENCES public.industries(industry_id),
  contact_name VARCHAR(200),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  address TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. ENGAGEMENTS - Engagement/project definitions
CREATE TABLE public.engagements (
  engagement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(client_id) ON DELETE CASCADE,
  engagement_name VARCHAR(255) NOT NULL,
  engagement_code VARCHAR(50),
  partner_id UUID REFERENCES public.staff(staff_id),
  manager_id UUID REFERENCES public.staff(staff_id),
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. WORK_ORDERS - The Budget Engine (1 per Engagement)
CREATE TABLE public.work_orders (
  wo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL UNIQUE REFERENCES public.engagements(engagement_id) ON DELETE CASCADE,
  currency VARCHAR(3) NOT NULL CHECK (currency IN ('USD', 'BOB')),
  season_mode VARCHAR(4) NOT NULL CHECK (season_mode IN ('High', 'Low')),
  tax_rate DECIMAL(5,4) DEFAULT 0.13,
  adjustment_amount DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. WO_BUDGET_LINES - Budget line items per category
CREATE TABLE public.wo_budget_lines (
  wo_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID NOT NULL REFERENCES public.work_orders(wo_id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(category_id),
  budgeted_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
  standard_rate DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. WO_EXPENSE_BUDGET - Expense budgets per work order
CREATE TABLE public.wo_expense_budget (
  wo_exp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID NOT NULL REFERENCES public.work_orders(wo_id) ON DELETE CASCADE,
  expense_type_id UUID NOT NULL REFERENCES public.expense_types(expense_type_id),
  budgeted_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. TIME_ENTRIES - Actual time logged
CREATE TABLE public.time_entries (
  time_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_worked DATE NOT NULL,
  hours_logged DECIMAL(4,2) NOT NULL CHECK (hours_logged >= 0),
  staff_id UUID NOT NULL REFERENCES public.staff(staff_id),
  engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id),
  activity_id UUID NOT NULL REFERENCES public.activity_codes(activity_id),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. EXPENSE_LOGS - Actual expenses incurred
CREATE TABLE public.expense_logs (
  expense_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_incurred DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'BOB' CHECK (currency IN ('USD', 'BOB')),
  engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id),
  expense_type_id UUID NOT NULL REFERENCES public.expense_types(expense_type_id),
  description TEXT,
  receipt_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- Enable Row Level Security
-- =============================================
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_expense_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS Policies - Allow authenticated users full access
-- (In production, these should be more restrictive based on roles)
-- =============================================

-- Global Settings - Read only for authenticated
CREATE POLICY "Authenticated users can read settings" ON public.global_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage settings" ON public.global_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Industries - All authenticated can read/manage
CREATE POLICY "Authenticated users can read industries" ON public.industries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage industries" ON public.industries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Categories - All authenticated can read/manage
CREATE POLICY "Authenticated users can read categories" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage categories" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Activity Codes - All authenticated can read/manage
CREATE POLICY "Authenticated users can read activities" ON public.activity_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage activities" ON public.activity_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Expense Types - All authenticated can read/manage
CREATE POLICY "Authenticated users can read expense types" ON public.expense_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage expense types" ON public.expense_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Staff - All authenticated can read/manage
CREATE POLICY "Authenticated users can read staff" ON public.staff FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage staff" ON public.staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Clients - All authenticated can read/manage
CREATE POLICY "Authenticated users can read clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage clients" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Engagements - All authenticated can read/manage
CREATE POLICY "Authenticated users can read engagements" ON public.engagements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage engagements" ON public.engagements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Work Orders - All authenticated can read/manage
CREATE POLICY "Authenticated users can read work orders" ON public.work_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage work orders" ON public.work_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- WO Budget Lines - All authenticated can read/manage
CREATE POLICY "Authenticated users can read budget lines" ON public.wo_budget_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage budget lines" ON public.wo_budget_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- WO Expense Budget - All authenticated can read/manage
CREATE POLICY "Authenticated users can read expense budget" ON public.wo_expense_budget FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage expense budget" ON public.wo_expense_budget FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Time Entries - All authenticated can read/manage
CREATE POLICY "Authenticated users can read time entries" ON public.time_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage time entries" ON public.time_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Expense Logs - All authenticated can read/manage
CREATE POLICY "Authenticated users can read expense logs" ON public.expense_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage expense logs" ON public.expense_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================
-- Updated_at Trigger Function
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_global_settings_updated_at BEFORE UPDATE ON public.global_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_industries_updated_at BEFORE UPDATE ON public.industries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_engagements_updated_at BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_work_orders_updated_at BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- SEED DATA
-- =============================================

-- 1. Global Settings
INSERT INTO public.global_settings (setting_key, setting_value, description) VALUES
  ('TAX_RATE', '0.13', 'VAT tax rate (13%)'),
  ('DAILY_LIMIT', '10', 'Maximum hours per day'),
  ('WEEKLY_LIMIT', '50', 'Maximum hours per week');

-- 2. Industries
INSERT INTO public.industries (industry_name, fiscal_year_end) VALUES
  ('Mining', 'September 30'),
  ('Banking', 'December 31'),
  ('Oil & Gas', 'December 31'),
  ('Manufacturing', 'December 31'),
  ('Retail', 'December 31'),
  ('Services', 'December 31');

-- 3. Categories with rates
INSERT INTO public.categories (category_name, rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd, display_order) VALUES
  ('Partner', 1530, 1400, 153, 140, 1),
  ('Manager', 700, 600, 70, 60, 2),
  ('Senior', 350, 280, 35, 28, 3),
  ('Staff', 200, 170, 20, 17, 4),
  ('Junior', 100, 90, 10, 9, 5);

-- 4. Activity Codes
INSERT INTO public.activity_codes (activity_code, description) VALUES
  ('PLN', 'Planning'),
  ('FLD', 'Fieldwork'),
  ('REV', 'Review'),
  ('DOC', 'Documentation'),
  ('ADM', 'Administration'),
  ('MTG', 'Meetings'),
  ('TRV', 'Travel'),
  ('TRN', 'Training');

-- 5. Expense Types
INSERT INTO public.expense_types (expense_name, default_unit_cost) VALUES
  ('Transportation', 50),
  ('Meals', 35),
  ('Lodging', 350),
  ('Printing', 10),
  ('Communications', 25),
  ('Office Supplies', 20),
  ('Other', 0);

-- 6. Staff (Sample)
INSERT INTO public.staff (first_name, last_name, email, category_id) VALUES
  ('Carlos', 'Mendoza', 'cmendoza@firm.com', (SELECT category_id FROM public.categories WHERE category_name = 'Partner')),
  ('María', 'Torres', 'mtorres@firm.com', (SELECT category_id FROM public.categories WHERE category_name = 'Partner')),
  ('Ana', 'Gutiérrez', 'agutierrez@firm.com', (SELECT category_id FROM public.categories WHERE category_name = 'Manager')),
  ('Roberto', 'Silva', 'rsilva@firm.com', (SELECT category_id FROM public.categories WHERE category_name = 'Manager')),
  ('Luis', 'Vargas', 'lvargas@firm.com', (SELECT category_id FROM public.categories WHERE category_name = 'Senior')),
  ('Carmen', 'Rojas', 'crojas@firm.com', (SELECT category_id FROM public.categories WHERE category_name = 'Staff')),
  ('Diego', 'Flores', 'dflores@firm.com', (SELECT category_id FROM public.categories WHERE category_name = 'Junior'));

-- 7. Clients
INSERT INTO public.clients (client_legal_name, unique_tax_id, industry_id, contact_name, contact_email) VALUES
  ('Minera San Cristóbal S.A.', '1234567890', (SELECT industry_id FROM public.industries WHERE industry_name = 'Mining'), 'Juan Pérez', 'jperez@msc.com'),
  ('Banco Nacional de Bolivia', '9876543210', (SELECT industry_id FROM public.industries WHERE industry_name = 'Banking'), 'Laura Mamani', 'lmamani@bnb.com');

-- 8. Engagements
INSERT INTO public.engagements (client_id, engagement_name, engagement_code, partner_id, manager_id, status) VALUES
  (
    (SELECT client_id FROM public.clients WHERE unique_tax_id = '1234567890'),
    '2024 Financial Audit',
    'MSC-2024-AUD',
    (SELECT staff_id FROM public.staff WHERE email = 'cmendoza@firm.com'),
    (SELECT staff_id FROM public.staff WHERE email = 'agutierrez@firm.com'),
    'active'
  ),
  (
    (SELECT client_id FROM public.clients WHERE unique_tax_id = '9876543210'),
    'Q4 Tax Review',
    'BNB-2024-TAX',
    (SELECT staff_id FROM public.staff WHERE email = 'mtorres@firm.com'),
    (SELECT staff_id FROM public.staff WHERE email = 'rsilva@firm.com'),
    'active'
  );

-- 9. Work Order for Mining Client (USD, Low Season, with -$2,000 adjustment)
INSERT INTO public.work_orders (engagement_id, currency, season_mode, tax_rate, adjustment_amount) VALUES
  (
    (SELECT engagement_id FROM public.engagements WHERE engagement_code = 'MSC-2024-AUD'),
    'USD',
    'Low',
    0.13,
    -2000
  );

-- 10. Budget Lines for the Mining Work Order
INSERT INTO public.wo_budget_lines (wo_id, category_id, budgeted_hours, standard_rate)
SELECT 
  (SELECT wo_id FROM public.work_orders WHERE engagement_id = (SELECT engagement_id FROM public.engagements WHERE engagement_code = 'MSC-2024-AUD')),
  category_id,
  CASE category_name
    WHEN 'Partner' THEN 40
    WHEN 'Manager' THEN 80
    WHEN 'Senior' THEN 160
    WHEN 'Staff' THEN 120
    WHEN 'Junior' THEN 80
  END,
  rate_low_usd
FROM public.categories;

-- 11. Sample Time Entries
INSERT INTO public.time_entries (date_worked, hours_logged, staff_id, engagement_id, activity_id, description) VALUES
  (
    CURRENT_DATE - INTERVAL '2 days',
    8,
    (SELECT staff_id FROM public.staff WHERE email = 'lvargas@firm.com'),
    (SELECT engagement_id FROM public.engagements WHERE engagement_code = 'MSC-2024-AUD'),
    (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'FLD'),
    'Inventory count observation'
  ),
  (
    CURRENT_DATE - INTERVAL '1 day',
    6,
    (SELECT staff_id FROM public.staff WHERE email = 'crojas@firm.com'),
    (SELECT engagement_id FROM public.engagements WHERE engagement_code = 'MSC-2024-AUD'),
    (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'DOC'),
    'Workpaper documentation'
  ),
  (
    CURRENT_DATE,
    4,
    (SELECT staff_id FROM public.staff WHERE email = 'agutierrez@firm.com'),
    (SELECT engagement_id FROM public.engagements WHERE engagement_code = 'MSC-2024-AUD'),
    (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'REV'),
    'Review of fieldwork'
  );