-- =====================================================
-- SECURITY FIX: Staff table PII exposure
-- Create a non-sensitive view for general staff lookups
-- =====================================================

-- 1. Create the staff_directory view with only non-sensitive fields
CREATE VIEW public.staff_directory AS
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
FROM public.staff;

-- 2. Drop the overly permissive policy on the base table
DROP POLICY IF EXISTS "Authenticated users can read staff" ON public.staff;

-- 3. Add a new policy for admins to view all staff records
CREATE POLICY "Admins can view all staff" 
  ON public.staff 
  FOR SELECT 
  USING (is_admin());

-- 4. Grant SELECT on the view to authenticated users
GRANT SELECT ON public.staff_directory TO authenticated;

-- =====================================================
-- SECURITY FIX: work_order_summary view missing RLS
-- Recreate view with security_invoker = true
-- =====================================================

-- Drop and recreate view with SECURITY INVOKER
DROP VIEW IF EXISTS public.work_order_summary;

CREATE VIEW public.work_order_summary 
WITH (security_invoker = true)
AS
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
    COALESCE(sum(bl.budgeted_hours * bl.standard_rate), 0::numeric) AS total_standard_fee,
    CASE
        WHEN COALESCE(sum(bl.budgeted_hours * bl.standard_rate), 0::numeric) > 0::numeric 
        THEN (COALESCE(sum(bl.budgeted_hours * bl.standard_rate), 0::numeric) + COALESCE(wo.adjustment_amount, 0::numeric)) 
             / COALESCE(sum(bl.budgeted_hours * bl.standard_rate), 0::numeric)
        ELSE 1::numeric
    END AS realization_percent,
    (COALESCE(sum(bl.budgeted_hours * bl.standard_rate), 0::numeric) + COALESCE(wo.adjustment_amount, 0::numeric)) 
    / (1::numeric - COALESCE(wo.tax_rate, 0.13)) AS fee_with_tax_gross_up
FROM work_orders wo
LEFT JOIN wo_budget_lines bl ON wo.wo_id = bl.wo_id
GROUP BY wo.wo_id;

-- Grant appropriate permissions
GRANT SELECT ON public.work_order_summary TO authenticated;