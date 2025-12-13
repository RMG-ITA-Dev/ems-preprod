-- Step 1: Dashboard Foundation
-- 1.1 Add reporting_periods to global_settings
INSERT INTO global_settings (setting_key, setting_value, description)
VALUES ('reporting_periods', 
  '[{"id":"calendar","name":"Año Calendario","yearEndMonth":12,"yearEndDay":31,"isDefault":true},{"id":"tax-bolivia","name":"Año Fiscal Bolivia","yearEndMonth":3,"yearEndDay":31,"isDefault":false}]',
  'Fiscal year definitions for period selector (JSON)')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- 1.2 Create staff_capacity table for utilization calculations
CREATE TABLE IF NOT EXISTS public.staff_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(staff_id) ON DELETE CASCADE,
  weekly_capacity_hours NUMERIC(6,2) NOT NULL DEFAULT 40,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT staff_capacity_date_range_check CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_staff_capacity_staff_id ON public.staff_capacity(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_capacity_effective_dates ON public.staff_capacity(staff_id, effective_from, effective_to);

-- Enable RLS
ALTER TABLE public.staff_capacity ENABLE ROW LEVEL SECURITY;

-- RLS Policies for staff_capacity
CREATE POLICY "Authenticated users can read staff capacity"
ON public.staff_capacity
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can manage staff capacity"
ON public.staff_capacity
FOR ALL
USING (true)
WITH CHECK (true);

-- Add updated_at trigger
CREATE TRIGGER update_staff_capacity_updated_at
BEFORE UPDATE ON public.staff_capacity
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();