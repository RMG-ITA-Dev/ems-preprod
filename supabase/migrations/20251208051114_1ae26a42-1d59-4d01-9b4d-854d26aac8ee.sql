-- Create timer_entries table for time tracking staging
CREATE TABLE public.timer_entries (
  timer_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(staff_id),
  engagement_id UUID NOT NULL REFERENCES public.engagements(engagement_id),
  activity_id UUID NOT NULL REFERENCES public.activity_codes(activity_id),
  description TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  is_imported BOOLEAN NOT NULL DEFAULT false,
  imported_to_time_id UUID REFERENCES public.time_entries(time_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.timer_entries ENABLE ROW LEVEL SECURITY;

-- Staff can view their own timer entries
CREATE POLICY "Staff can view own timer entries"
ON public.timer_entries
FOR SELECT
USING (
  staff_id IN (
    SELECT s.staff_id FROM staff s WHERE s.auth_user_id = auth.uid()
  )
);

-- Staff can create their own timer entries
CREATE POLICY "Staff can create own timer entries"
ON public.timer_entries
FOR INSERT
WITH CHECK (
  staff_id IN (
    SELECT s.staff_id FROM staff s WHERE s.auth_user_id = auth.uid()
  )
);

-- Staff can update their own timer entries
CREATE POLICY "Staff can update own timer entries"
ON public.timer_entries
FOR UPDATE
USING (
  staff_id IN (
    SELECT s.staff_id FROM staff s WHERE s.auth_user_id = auth.uid()
  )
);

-- Staff can delete their own timer entries
CREATE POLICY "Staff can delete own timer entries"
ON public.timer_entries
FOR DELETE
USING (
  staff_id IN (
    SELECT s.staff_id FROM staff s WHERE s.auth_user_id = auth.uid()
  )
);

-- Create index for common queries
CREATE INDEX idx_timer_entries_staff_id ON public.timer_entries(staff_id);
CREATE INDEX idx_timer_entries_started_at ON public.timer_entries(started_at);
CREATE INDEX idx_timer_entries_is_imported ON public.timer_entries(is_imported);