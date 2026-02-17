
-- ============================================================
-- Plan_0213-27_v4: Holiday Management and Blocking System
-- ============================================================

-- 1A. Create holidays table
CREATE TABLE public.holidays (
  holiday_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  holiday_name text NOT NULL,
  created_by   uuid NOT NULL REFERENCES public.staff(staff_id),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- Reuse existing updated_at trigger
CREATE TRIGGER update_holidays_updated_at
  BEFORE UPDATE ON public.holidays
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read holidays"
  ON public.holidays FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert holidays"
  ON public.holidays FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "Admins can update holidays"
  ON public.holidays FOR UPDATE
  USING (is_admin());

CREATE POLICY "Admins can delete holidays"
  ON public.holidays FOR DELETE
  USING (is_admin());

-- 1B. Insert HOLIDAY_ENGAGEMENT_ID setting (idempotent)
INSERT INTO public.global_settings (setting_key, setting_value, description)
VALUES ('HOLIDAY_ENGAGEMENT_ID', '', 'Engagement ID allowed for time entries on holiday dates')
ON CONFLICT (setting_key) DO NOTHING;

-- 1C. Create enforce_holiday_blocking trigger function
-- NOTE: coexists with check_wo_approved trigger on time_entries
CREATE OR REPLACE FUNCTION public.enforce_holiday_blocking()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $func$
DECLARE
  v_holiday_name text;
  v_raw text;
  v_setting text;
  v_holiday_engagement_id uuid;
BEGIN
  -- Check if date_worked is a holiday
  SELECT holiday_name INTO v_holiday_name
  FROM holidays
  WHERE holiday_date = NEW.date_worked;

  IF NOT FOUND THEN
    RETURN NEW;  -- Not a holiday, allow
  END IF;

  -- Read the holiday engagement setting
  SELECT setting_value INTO v_raw
  FROM global_settings
  WHERE setting_key = 'HOLIDAY_ENGAGEMENT_ID';

  v_setting := NULLIF(TRIM(v_raw), '');

  IF v_setting IS NULL THEN
    RAISE EXCEPTION 'HOLIDAY_NOT_CONFIGURED';
  END IF;

  v_holiday_engagement_id := v_setting::uuid;

  IF NEW.engagement_id != v_holiday_engagement_id THEN
    RAISE EXCEPTION 'HOLIDAY_BLOCKED:%', v_holiday_name;
  END IF;

  RETURN NEW;
END;
$func$;

CREATE TRIGGER enforce_holiday_blocking
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_holiday_blocking();
