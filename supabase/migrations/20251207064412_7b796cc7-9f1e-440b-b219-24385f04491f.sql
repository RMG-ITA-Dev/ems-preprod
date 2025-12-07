-- 1. CREATE TIMESHEET_PERIODS TABLE
CREATE TABLE public.timesheet_periods (
  period_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(staff_id) ON DELETE CASCADE,
  
  -- Week definition (ISO week, starts Monday)
  week_start_date DATE NOT NULL,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  
  -- Status workflow
  status VARCHAR(20) NOT NULL DEFAULT 'open' 
    CHECK (status IN ('open', 'draft', 'submitted', 'approved', 'rejected')),
  
  -- Deadline & locking
  deadline DATE,
  is_period_locked BOOLEAN DEFAULT false,
  
  -- Totals (denormalized for performance)
  total_hours NUMERIC(6,2) DEFAULT 0,
  
  -- Submission tracking
  submitted_at TIMESTAMPTZ,
  
  -- Approval tracking
  reviewed_by UUID REFERENCES public.staff(staff_id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique constraint: one period per staff per week
  UNIQUE(staff_id, week_start_date)
);

-- 2. ADD COLUMNS TO TIME_ENTRIES
ALTER TABLE public.time_entries 
  ADD COLUMN period_id UUID REFERENCES public.timesheet_periods(period_id),
  ADD COLUMN is_forecast BOOLEAN DEFAULT false;

-- 3. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX idx_timesheet_periods_staff_date ON public.timesheet_periods(staff_id, week_start_date);
CREATE INDEX idx_timesheet_periods_status ON public.timesheet_periods(status);
CREATE INDEX idx_timesheet_periods_deadline ON public.timesheet_periods(deadline);
CREATE INDEX idx_time_entries_period ON public.time_entries(period_id);

-- 4. ADD TRIGGER FOR UPDATED_AT
CREATE TRIGGER update_timesheet_periods_updated_at
  BEFORE UPDATE ON public.timesheet_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. ENABLE RLS ON TIMESHEET_PERIODS
ALTER TABLE public.timesheet_periods ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES FOR TIMESHEET_PERIODS
-- Staff can view their own periods
CREATE POLICY "Staff can view own periods"
  ON public.timesheet_periods
  FOR SELECT
  USING (
    staff_id IN (
      SELECT s.staff_id FROM public.staff s 
      WHERE s.auth_user_id = auth.uid()
    )
  );

-- Staff can insert their own periods
CREATE POLICY "Staff can create own periods"
  ON public.timesheet_periods
  FOR INSERT
  WITH CHECK (
    staff_id IN (
      SELECT s.staff_id FROM public.staff s 
      WHERE s.auth_user_id = auth.uid()
    )
  );

-- Staff can update their own periods (unless locked)
CREATE POLICY "Staff can update own unlocked periods"
  ON public.timesheet_periods
  FOR UPDATE
  USING (
    staff_id IN (
      SELECT s.staff_id FROM public.staff s 
      WHERE s.auth_user_id = auth.uid()
    )
    AND is_period_locked = false
  );

-- Approvers (categories with can_approve_wo) can view all periods
CREATE POLICY "Approvers can view all periods"
  ON public.timesheet_periods
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      JOIN public.categories c ON s.category_id = c.category_id
      WHERE s.auth_user_id = auth.uid()
      AND c.can_approve_wo = true
    )
  );

-- Approvers can update any period (for approval/rejection)
CREATE POLICY "Approvers can update all periods"
  ON public.timesheet_periods
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      JOIN public.categories c ON s.category_id = c.category_id
      WHERE s.auth_user_id = auth.uid()
      AND c.can_approve_wo = true
    )
  );

-- 7. INSERT TIMESHEET POLICY SETTINGS
INSERT INTO public.global_settings (setting_key, setting_value, description) VALUES
  ('TS_MAX_BACKLOG_WEEKS', '1', 'Maximum number of incomplete past weeks allowed before blocking new submissions'),
  ('TS_MONTH_END_RULE', 'COMPLETE_SPANNING_WEEK', 'Rule for month-end: weeks containing month-end must be submitted by that date'),
  ('TS_EMPLOYEE_RETRO_DAYS', '30', 'Number of days employees can edit past entries; beyond this only managers can modify'),
  ('TS_WORK_DAYS', '5', 'Number of work days per week (5 = Mon-Fri, 6 = Mon-Sat)'),
  ('TS_AUTO_SAVE_SECONDS', '3', 'Debounce delay for auto-saving time entries in seconds');