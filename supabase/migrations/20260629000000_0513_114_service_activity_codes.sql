-- 0513-114: Link activity_codes to services with auto-generated codes.
--
-- 1. Add abbreviation (2–5 uppercase letters) to services.
-- 2. Add service_id (nullable FK) + entity_type to activity_codes.
-- 3. Replace global UNIQUE on activity_code with partial index WHERE is_active.
-- 4. RPC: create_service_activity   — append an activity to a service.
-- 5. RPC: reorder_service_activity  — insert/move at position (UI not exposed yet).
-- 6. RPC: deactivate_service_activity — mark inactive → code becomes {ABREV}-AX.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. SERVICES: abbreviation column
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS abbreviation text
  CHECK (abbreviation ~ '^[A-Z]{2,5}$');

-- Unique partial index: at most one active service per abbreviation.
CREATE UNIQUE INDEX IF NOT EXISTS services_abbreviation_unique
  ON public.services (abbreviation)
  WHERE abbreviation IS NOT NULL;

-- Seed abbreviations for the five existing services.
UPDATE public.services SET abbreviation = 'FIR' WHERE name = 'Firmwide'         AND abbreviation IS NULL;
UPDATE public.services SET abbreviation = 'AUD' WHERE name = 'Auditoría'        AND abbreviation IS NULL;
UPDATE public.services SET abbreviation = 'CON' WHERE name = 'Consultoría'      AND abbreviation IS NULL;
UPDATE public.services SET abbreviation = 'TAX' WHERE name = 'Tax'              AND abbreviation IS NULL;
UPDATE public.services SET abbreviation = 'GYS' WHERE name = 'Growth & Strategy' AND abbreviation IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ACTIVITY_CODES: service_id + entity_type columns
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.activity_codes
  ADD COLUMN IF NOT EXISTS service_id uuid
    REFERENCES public.services (service_id) ON DELETE RESTRICT;

ALTER TABLE public.activity_codes
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'A'
    CHECK (entity_type IN ('A'));

-- ────────────────────────────────────────────────────────────────────────────
-- 3. SWAP UNIQUE CONSTRAINT → partial index WHERE is_active
--    Allows multiple AX codes (inactive) for the same service while keeping
--    active codes unique globally (including legacy ones without service_id).
-- ────────────────────────────────────────────────────────────────────────────

-- The original table was created with activity_code VARCHAR(10) NOT NULL UNIQUE
-- (migration 20251204045534_cf82aa30…). Drop that constraint.
ALTER TABLE public.activity_codes
  DROP CONSTRAINT IF EXISTS activity_codes_activity_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS activity_codes_active_code_unique
  ON public.activity_codes (activity_code)
  WHERE is_active = true;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC: create_service_activity
--    Appends a new active activity to a service with auto-generated code.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_service_activity(
  p_service_id  uuid,
  p_description text,
  p_entity_type text DEFAULT 'A'
) RETURNS public.activity_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_abbrev  text;
  v_count   integer;
  v_code    text;
  v_row     public.activity_codes;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  IF p_entity_type NOT IN ('A') THEN
    RAISE EXCEPTION 'Invalid entity_type: %', p_entity_type;
  END IF;

  -- Lock service row to prevent concurrent inserts for the same service.
  SELECT abbreviation INTO v_abbrev
    FROM public.services
   WHERE service_id = p_service_id AND is_active = true
   FOR UPDATE;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Service not found, inactive, or has no abbreviation';
  END IF;

  -- Count existing active activities for this (service, entity_type) pair.
  SELECT COUNT(*) INTO v_count
    FROM public.activity_codes
   WHERE service_id  = p_service_id
     AND entity_type = p_entity_type
     AND is_active   = true;

  IF v_count >= 9 THEN
    RAISE EXCEPTION 'max_activities_reached: at most 9 active activities per service per type';
  END IF;

  v_code := v_abbrev || '-' || p_entity_type || (v_count + 1)::text;

  INSERT INTO public.activity_codes (activity_code, description, is_active, service_id, entity_type)
  VALUES (v_code, p_description, true, p_service_id, p_entity_type)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_service_activity(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_service_activity(uuid, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RPC: reorder_service_activity
--    Moves an activity to a given ordinal position, cascading others.
--    Not exposed in UI for this issue; available for future use.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reorder_service_activity(
  p_activity_id    uuid,
  p_new_position   integer   -- 1-based
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_id  uuid;
  v_entity_type text;
  v_abbrev      text;
  v_old_pos     integer;
  v_total       integer;
  rec           RECORD;
  v_ordinal     integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Fetch and lock the target activity.
  SELECT ac.service_id, ac.entity_type, s.abbreviation
    INTO v_service_id, v_entity_type, v_abbrev
    FROM public.activity_codes ac
    JOIN public.services s USING (service_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = true
   FOR UPDATE OF ac;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found or not an active service-linked activity';
  END IF;

  -- Count total actives + current position (ordinal extracted from code).
  SELECT COUNT(*) INTO v_total
    FROM public.activity_codes
   WHERE service_id  = v_service_id
     AND entity_type = v_entity_type
     AND is_active   = true;

  IF p_new_position < 1 OR p_new_position > v_total THEN
    RAISE EXCEPTION 'Position % out of range (1–%)', p_new_position, v_total;
  END IF;

  -- Renumber all active activities by current ordinal order, skipping gaps.
  v_ordinal := 1;
  FOR rec IN
    SELECT activity_id, activity_code
      FROM public.activity_codes
     WHERE service_id  = v_service_id
       AND entity_type = v_entity_type
       AND is_active   = true
     ORDER BY activity_code
     FOR UPDATE
  LOOP
    IF rec.activity_id = p_activity_id THEN
      -- Assign the new position after the loop.
      NULL;
    ELSIF v_ordinal = p_new_position THEN
      v_ordinal := v_ordinal + 1;
      UPDATE public.activity_codes
         SET activity_code = v_abbrev || '-' || v_entity_type || v_ordinal::text
       WHERE activity_id = rec.activity_id;
      v_ordinal := v_ordinal + 1;
    ELSE
      UPDATE public.activity_codes
         SET activity_code = v_abbrev || '-' || v_entity_type || v_ordinal::text
       WHERE activity_id = rec.activity_id;
      v_ordinal := v_ordinal + 1;
    END IF;
  END LOOP;

  UPDATE public.activity_codes
     SET activity_code = v_abbrev || '-' || v_entity_type || p_new_position::text
   WHERE activity_id = p_activity_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_service_activity(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_service_activity(uuid, integer) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPC: deactivate_service_activity
--    Marks activity inactive → code → {ABREV}-AX; renumbers later actives.
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

  -- Lock and fetch the target activity.
  SELECT ac.service_id, ac.entity_type, ac.activity_code, s.abbreviation
    INTO v_service_id, v_entity_type, v_old_code, v_abbrev
    FROM public.activity_codes ac
    JOIN public.services s USING (service_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = true
   FOR UPDATE OF ac;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found, already inactive, or not service-linked';
  END IF;

  -- Extract current ordinal from code (e.g. AUD-A3 → 3).
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
       AND activity_code > v_abbrev || '-' || v_entity_type || v_old_ordinal::text
     ORDER BY activity_code
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
