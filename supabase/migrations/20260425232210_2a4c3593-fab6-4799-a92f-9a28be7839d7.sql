-- time_entries — three composite indexes for the three distinct dashboard predicate shapes
CREATE INDEX IF NOT EXISTS idx_time_entries_engagement_date
  ON public.time_entries(engagement_id, date_worked);

CREATE INDEX IF NOT EXISTS idx_time_entries_staff_date
  ON public.time_entries(staff_id, date_worked);

CREATE INDEX IF NOT EXISTS idx_time_entries_period_engagement
  ON public.time_entries(period_id, engagement_id);

-- engagements — partner/manager lookups with status filter
CREATE INDEX IF NOT EXISTS idx_engagements_partner_status
  ON public.engagements(partner_id, status);

CREATE INDEX IF NOT EXISTS idx_engagements_manager_status
  ON public.engagements(manager_id, status);

-- timesheet_line_approvals — partial filtered index for pending, plus engagement+period composite
CREATE INDEX IF NOT EXISTS idx_tla_pending_engagement
  ON public.timesheet_line_approvals(engagement_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tla_engagement_period
  ON public.timesheet_line_approvals(engagement_id, period_id);