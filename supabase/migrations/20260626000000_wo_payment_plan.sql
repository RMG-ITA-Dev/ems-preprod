-- 0625-150: Plan de Pagos en Orden de Trabajo
-- Adds wo_payment_plan (header) + wo_payment_installments (rows) tables.
-- Also widens work_orders.currency CHECK to allow USDT.
-- Fully idempotent: safe to re-paste in Supabase SQL Editor.

-- 1. Widen currency constraint on work_orders to include USDT
DO $$
DECLARE v_con TEXT;
BEGIN
  SELECT tc.constraint_name INTO v_con
  FROM information_schema.table_constraints tc
  JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
    AND tc.constraint_schema = cc.constraint_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name  = 'work_orders'
    AND cc.check_clause LIKE '%currency%'
    AND cc.check_clause NOT LIKE '%IS NOT NULL%';  -- exclude NOT NULL pseudo-constraints
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.work_orders DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'work_orders'
      AND constraint_name = 'work_orders_currency_check'
  ) THEN
    ALTER TABLE public.work_orders
      ADD CONSTRAINT work_orders_currency_check
      CHECK (currency IN ('USD', 'BOB', 'USDT'));
  END IF;
END $$;

-- 2. Payment plan header (one per WO, optional)
CREATE TABLE IF NOT EXISTS public.wo_payment_plan (
  plan_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id         UUID NOT NULL UNIQUE REFERENCES public.work_orders(wo_id) ON DELETE CASCADE,
  exchange_rate NUMERIC,          -- BOB per foreign unit; applies when currency = USD | USDT
  payment_days  INTEGER NOT NULL DEFAULT 30,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. Installment rows
CREATE TABLE IF NOT EXISTS public.wo_payment_installments (
  installment_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                 UUID NOT NULL REFERENCES public.wo_payment_plan(plan_id) ON DELETE CASCADE,
  wo_id                   UUID NOT NULL REFERENCES public.work_orders(wo_id) ON DELETE CASCADE,
  installment_number      INTEGER NOT NULL,
  agreed_invoice_date     DATE,         -- entered by manager: planned invoice date
  agreed_payment_date     DATE,         -- auto: agreed_invoice_date + payment_days business days
  collection_invoice_date DATE,         -- auto: date status changed to Invoiced
  collection_payment_date DATE,         -- auto: collection_invoice_date + payment_days business days
  payment_date_actual     DATE,         -- recorded when status → Completed
  percentage              NUMERIC NOT NULL DEFAULT 0,
  amount                  NUMERIC,      -- (percentage/100) × honorario_con_iva, stored for display
  status                  TEXT NOT NULL DEFAULT 'Pending'
                          CHECK (status IN ('Pending', 'Invoiced', 'Completed', 'Overdue')),
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE (plan_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_wo_payment_installments_wo_id ON public.wo_payment_installments (wo_id);

-- 3b. Patch existing table: add date columns if they were missing in an earlier run
ALTER TABLE public.wo_payment_installments
  ADD COLUMN IF NOT EXISTS agreed_invoice_date     DATE,
  ADD COLUMN IF NOT EXISTS agreed_payment_date     DATE,
  ADD COLUMN IF NOT EXISTS collection_invoice_date DATE,
  ADD COLUMN IF NOT EXISTS collection_payment_date DATE,
  ADD COLUMN IF NOT EXISTS payment_date_actual     DATE;

-- 3c. Ensure status CHECK includes Overdue (drop old constraint if it lacks it)
DO $$
DECLARE v_con TEXT;
BEGIN
  SELECT tc.constraint_name INTO v_con
  FROM information_schema.table_constraints tc
  JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
    AND tc.constraint_schema = cc.constraint_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name  = 'wo_payment_installments'
    AND cc.check_clause LIKE '%Pending%'   -- enum-style CHECK, not a NOT NULL constraint
    AND cc.check_clause NOT LIKE '%Overdue%';
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.wo_payment_installments DROP CONSTRAINT %I', v_con);
    ALTER TABLE public.wo_payment_installments
      ADD CONSTRAINT wo_payment_installments_status_check
      CHECK (status IN ('Pending', 'Invoiced', 'Completed', 'Overdue'));
  END IF;
END $$;

-- 4. RLS — mirror wo_expense_budget policies (admin + engagement team)
ALTER TABLE public.wo_payment_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_payment_installments ENABLE ROW LEVEL SECURITY;

-- Drop old permissive policy names (from earlier migration run) + current names for idempotency
DROP POLICY IF EXISTS "Authenticated users can read payment plans"    ON public.wo_payment_plan;
DROP POLICY IF EXISTS "Authenticated users can manage payment plans"  ON public.wo_payment_plan;
DROP POLICY IF EXISTS "Admins can manage payment plans"               ON public.wo_payment_plan;
DROP POLICY IF EXISTS "Admins can view all payment plans"             ON public.wo_payment_plan;
DROP POLICY IF EXISTS "Team can manage payment plans"                 ON public.wo_payment_plan;
DROP POLICY IF EXISTS "Team can view payment plans"                   ON public.wo_payment_plan;

CREATE POLICY "Admins can manage payment plans"
  ON public.wo_payment_plan FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can view all payment plans"
  ON public.wo_payment_plan FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY "Team can manage payment plans"
  ON public.wo_payment_plan FOR ALL TO authenticated
  USING  ((EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.wo_id = wo_payment_plan.wo_id AND is_engagement_team_member(wo.engagement_id))))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.wo_id = wo_payment_plan.wo_id AND is_engagement_team_member(wo.engagement_id))));
CREATE POLICY "Team can view payment plans"
  ON public.wo_payment_plan FOR SELECT TO authenticated
  USING  ((EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.wo_id = wo_payment_plan.wo_id AND is_engagement_team_member(wo.engagement_id))));

-- Installments
DROP POLICY IF EXISTS "Authenticated users can read payment installments"   ON public.wo_payment_installments;
DROP POLICY IF EXISTS "Authenticated users can manage payment installments" ON public.wo_payment_installments;
DROP POLICY IF EXISTS "Admins can manage payment installments"              ON public.wo_payment_installments;
DROP POLICY IF EXISTS "Admins can view all payment installments"            ON public.wo_payment_installments;
DROP POLICY IF EXISTS "Team can manage payment installments"                ON public.wo_payment_installments;
DROP POLICY IF EXISTS "Team can view payment installments"                  ON public.wo_payment_installments;

CREATE POLICY "Admins can manage payment installments"
  ON public.wo_payment_installments FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can view all payment installments"
  ON public.wo_payment_installments FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY "Team can manage payment installments"
  ON public.wo_payment_installments FOR ALL TO authenticated
  USING  ((EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.wo_id = wo_payment_installments.wo_id AND is_engagement_team_member(wo.engagement_id))))
  WITH CHECK ((EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.wo_id = wo_payment_installments.wo_id AND is_engagement_team_member(wo.engagement_id))));
CREATE POLICY "Team can view payment installments"
  ON public.wo_payment_installments FOR SELECT TO authenticated
  USING  ((EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.wo_id = wo_payment_installments.wo_id AND is_engagement_team_member(wo.engagement_id))));

-- 5. updated_at triggers
DROP TRIGGER IF EXISTS update_wo_payment_plan_updated_at         ON public.wo_payment_plan;
DROP TRIGGER IF EXISTS update_wo_payment_installments_updated_at ON public.wo_payment_installments;

CREATE TRIGGER update_wo_payment_plan_updated_at
  BEFORE UPDATE ON public.wo_payment_plan
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wo_payment_installments_updated_at
  BEFORE UPDATE ON public.wo_payment_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
