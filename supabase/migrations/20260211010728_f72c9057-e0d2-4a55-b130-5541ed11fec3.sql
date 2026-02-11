
-- Enforce at most one running timer entry per staff member (defense-in-depth)
CREATE UNIQUE INDEX idx_timer_entries_one_running_per_staff
  ON public.timer_entries (staff_id)
  WHERE ended_at IS NULL;
