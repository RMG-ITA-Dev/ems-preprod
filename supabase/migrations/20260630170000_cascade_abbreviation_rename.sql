-- 0513-114 (follow-up): cascade abbreviation rename to linked activity codes.
--
-- When an admin changes services.abbreviation (e.g. AUD → ADT), all activity_codes
-- whose service_id matches that service are updated to use the new prefix:
--   AUD-A1 → ADT-A1,  AUD-AX → ADT-AX, etc.
--
-- Implementation: AFTER UPDATE trigger on public.services.
-- The trigger function runs SECURITY DEFINER so it can write activity_codes
-- regardless of the caller's RLS context (the guard is: abbreviation must
-- actually change between non-null values).

-- ────────────────────────────────────────────────────────────────────────────
-- Trigger function
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cascade_service_abbreviation_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only act when abbreviation actually changes between two non-null values.
  IF OLD.abbreviation IS DISTINCT FROM NEW.abbreviation
     AND OLD.abbreviation IS NOT NULL
     AND NEW.abbreviation IS NOT NULL THEN

    UPDATE public.activity_codes
       SET activity_code = NEW.abbreviation
                        || substring(activity_code FROM length(OLD.abbreviation) + 1)
     WHERE service_id    = OLD.service_id
       AND activity_code LIKE OLD.abbreviation || '-%';

  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Trigger
-- ────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cascade_abbreviation_rename ON public.services;

-- ────────────────────────────────────────────────────────────────────────────
-- R11 fix: deactivate_service_activity — add service-row lock to prevent
-- race condition with concurrent create_service_activity calls.
--
-- create_service_activity locks services FOR UPDATE before counting actives.
-- The original deactivate only locked the target activity_codes row, so a
-- concurrent create could read a stale count and generate a duplicate ordinal.
-- Fix: lock services (same resource, same order as create) so the two
-- operations serialize correctly.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deactivate_service_activity(
  p_activity_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_id  uuid;
  v_entity_type text;
  v_abbrev      text;
  v_old_code    text;
  v_old_ordinal integer;
  rec           RECORD;
  v_ordinal     integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock and fetch the target activity (and its service row) atomically.
  -- Locking services here ensures create_service_activity (which also locks
  -- services FOR UPDATE before counting) cannot interleave with this renumber.
  SELECT ac.service_id, ac.entity_type, ac.activity_code, s.abbreviation
    INTO v_service_id, v_entity_type, v_old_code, v_abbrev
    FROM public.activity_codes ac
    JOIN public.services s USING (service_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = true
   FOR UPDATE OF ac, s;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found, already inactive, or not service-linked';
  END IF;

  -- Extract current ordinal from code (e.g. AUD-A3 → 3, AUD-A10 → 10).
  v_old_ordinal := (regexp_replace(v_old_code, '^.*[A-Z](\d+)$', '\1'))::integer;

  -- Mark target as inactive with AX code.
  UPDATE public.activity_codes
     SET is_active = false,
         activity_code = v_abbrev || '-' || v_entity_type || 'X'
   WHERE activity_id = p_activity_id;

  -- Renumber actives with ordinal > old_ordinal (shift back by 1).
  v_ordinal := v_old_ordinal;
  FOR rec IN
    SELECT activity_id
      FROM public.activity_codes
     WHERE service_id  = v_service_id
       AND entity_type = v_entity_type
       AND is_active   = true
       AND substring(activity_code FROM '[0-9]+$')::int > v_old_ordinal
     ORDER BY substring(activity_code FROM '[0-9]+$')::int
     FOR UPDATE
  LOOP
    UPDATE public.activity_codes
       SET activity_code = v_abbrev || '-' || v_entity_type || v_ordinal::text
     WHERE activity_id = rec.activity_id;
    v_ordinal := v_ordinal + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_service_activity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_service_activity(uuid) TO authenticated;

CREATE TRIGGER trg_cascade_abbreviation_rename
  AFTER UPDATE OF abbreviation ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_service_abbreviation_rename();
