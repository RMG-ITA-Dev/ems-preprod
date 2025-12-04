-- Add approval workflow columns to work_orders
ALTER TABLE work_orders 
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'Draft' 
  CHECK (approval_status IN ('Draft', 'Pending_Approval', 'Approved', 'Rejected')),
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES staff(staff_id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Add can_approve_wo column to categories
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS can_approve_wo BOOLEAN DEFAULT false;

-- Create view for computed totals
CREATE OR REPLACE VIEW work_order_summary AS
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

-- Create function to check if WO is approved before time entry
CREATE OR REPLACE FUNCTION check_wo_approved()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to enforce WO approval for time entries
DROP TRIGGER IF EXISTS enforce_wo_approval ON time_entries;
CREATE TRIGGER enforce_wo_approval
BEFORE INSERT ON time_entries
FOR EACH ROW EXECUTE FUNCTION check_wo_approved();