
-- Plan_0213-27_C01_v5 Phase 1: Non-Chargeable Engagement Policy System

-- 1A. Add policy columns to engagements
ALTER TABLE public.engagements
  ADD COLUMN work_order_required boolean NOT NULL DEFAULT true,
  ADD COLUMN activity_required boolean NOT NULL DEFAULT true,
  ADD COLUMN is_internal boolean NOT NULL DEFAULT false;

-- 1B. Upsert system "ADM" activity code (self-healing)
INSERT INTO public.activity_codes (activity_code, description, is_active)
VALUES ('ADM', 'Administrative', true)
ON CONFLICT (activity_code) DO UPDATE
  SET is_active = true, description = EXCLUDED.description;

-- 1C. Store ADM activity ID in global_settings (self-healing + fail-loud)
DO $$
DECLARE
  v_adm_id uuid;
BEGIN
  SELECT activity_id INTO v_adm_id
  FROM public.activity_codes WHERE activity_code = 'ADM';

  IF v_adm_id IS NULL THEN
    RAISE EXCEPTION 'ADM activity code not found -- migration cannot proceed';
  END IF;

  INSERT INTO public.global_settings (setting_key, setting_value, description)
  VALUES (
    'ADM_ACTIVITY_ID',
    v_adm_id::text,
    'System activity ID for non-chargeable engagements (auto-assigned by trigger)'
  )
  ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value;
END $$;

-- 1D. Update check_wo_approved() -- preserve exact signature and security attributes
CREATE OR REPLACE FUNCTION public.check_wo_approved()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_wo_required boolean;
BEGIN
  -- Check if engagement requires a Work Order
  SELECT work_order_required INTO v_wo_required
  FROM engagements WHERE engagement_id = NEW.engagement_id;

  -- Non-WO-required engagements bypass the check
  IF v_wo_required IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- Original WO approval check (unchanged)
  IF NOT EXISTS (
    SELECT 1 FROM work_orders wo
    WHERE wo.engagement_id = NEW.engagement_id
    AND wo.approval_status = 'Approved'
  ) THEN
    RAISE EXCEPTION 'Cannot log time: Work Order is not approved';
  END IF;

  RETURN NEW;
END;
$function$;

-- 1E. Create enforce_activity_default() trigger function + trigger
-- NOTE: coexists with enforce_wo_approval, enforce_holiday_blocking, update_time_entries_updated_at triggers on time_entries
CREATE OR REPLACE FUNCTION public.enforce_activity_default()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_activity_required boolean;
  v_raw text;
  v_adm_id uuid;
BEGIN
  -- Check if engagement requires activity selection
  SELECT activity_required INTO v_activity_required
  FROM engagements WHERE engagement_id = NEW.engagement_id;

  -- If activity is required (default), no auto-assignment
  IF v_activity_required IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  -- Read ADM activity ID from global_settings
  SELECT setting_value INTO v_raw
  FROM global_settings
  WHERE setting_key = 'ADM_ACTIVITY_ID';

  IF v_raw IS NULL OR TRIM(v_raw) = '' THEN
    RAISE EXCEPTION 'ADM_ACTIVITY_NOT_CONFIGURED';
  END IF;

  v_adm_id := TRIM(v_raw)::uuid;

  -- Force activity to ADM regardless of what was sent
  NEW.activity_id := v_adm_id;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_enforce_activity_default
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_activity_default();
