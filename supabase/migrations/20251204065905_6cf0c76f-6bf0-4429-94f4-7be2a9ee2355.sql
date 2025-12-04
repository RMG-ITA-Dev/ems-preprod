-- Drop and recreate view without security definer (standard invoker security)
DROP VIEW IF EXISTS work_order_summary;

CREATE VIEW work_order_summary 
WITH (security_invoker = true)
AS
SELECT 
  wo.*,
  COALESCE(SUM(bl.budgeted_hours * bl.standard_rate), 0) as total_standard_fee,
  CASE 
    WHEN COALESCE(SUM(bl.budgeted_hours * bl.standard_rate), 0) > 0 
    THEN (COALESCE(SUM(bl.budgeted_hours * bl.standard_rate), 0) + COALESCE(wo.adjustment_amount, 0)) 
         / COALESCE(SUM(bl.budgeted_hours * bl.standard_rate), 0)
    ELSE 1 
  END as realization_percent,
  (COALESCE(SUM(bl.budgeted_hours * bl.standard_rate), 0) + COALESCE(wo.adjustment_amount, 0)) 
    / (1 - COALESCE(wo.tax_rate, 0.13)) as fee_with_tax_gross_up
FROM work_orders wo
LEFT JOIN wo_budget_lines bl ON wo.wo_id = bl.wo_id
GROUP BY wo.wo_id;