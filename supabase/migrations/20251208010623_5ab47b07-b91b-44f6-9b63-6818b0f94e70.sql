-- Drop legacy columns from timesheet_periods
-- These are replaced by line-level approval system in timesheet_line_approvals table

ALTER TABLE public.timesheet_periods 
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS review_notes;