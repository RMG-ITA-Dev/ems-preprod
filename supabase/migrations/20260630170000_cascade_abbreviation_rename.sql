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

-- ────────────────────────────────────────────────────────────────────────────
-- R17 fix: reactivate_service_activity — add service-row lock.
-- Same race condition as R11 (deactivate): only the target activity_codes row
-- was locked, allowing a concurrent create to read a stale active count and
-- assign the same next code. Fix: FOR UPDATE OF ac, s (same resource + order
-- as create_service_activity).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reactivate_service_activity(
  p_activity_id uuid
) RETURNS public.activity_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_id  uuid;
  v_entity_type text;
  v_abbrev      text;
  v_count       integer;
  v_code        text;
  v_row         public.activity_codes;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock and fetch the target (and its service row) atomically.
  SELECT ac.service_id, ac.entity_type, s.abbreviation
    INTO v_service_id, v_entity_type, v_abbrev
    FROM public.activity_codes ac
    JOIN public.services s USING (service_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = false
   FOR UPDATE OF ac, s;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found, already active, or not service-linked';
  END IF;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Service has no abbreviation';
  END IF;

  -- Count active activities for this (service, entity_type) pair.
  SELECT COUNT(*) INTO v_count
    FROM public.activity_codes
   WHERE service_id  = v_service_id
     AND entity_type = v_entity_type
     AND is_active   = true;

  -- No hard cap: 1–9 is a UI recommendation only.
  v_code := v_abbrev || '-' || v_entity_type || (v_count + 1)::text;

  UPDATE public.activity_codes
     SET is_active = true,
         activity_code = v_code
   WHERE activity_id = p_activity_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_service_activity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_service_activity(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- R18 fix: reorder_service_activity — add service-row lock.
-- Only the target and its active siblings in activity_codes were locked.
-- A concurrent create (which locks services first) could insert A{n+1} while
-- reorder works on the older set, causing a gap or collision. Fix: lock the
-- service row in the initial SELECT so create serializes behind reorder.
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
  v_total       integer;
  v_ids         uuid[];
  i             integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Fetch and lock the target activity (and its service row) atomically.
  SELECT ac.service_id, ac.entity_type, s.abbreviation
    INTO v_service_id, v_entity_type, v_abbrev
    FROM public.activity_codes ac
    JOIN public.services s USING (service_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = true
   FOR UPDATE OF ac, s;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found or not an active service-linked activity';
  END IF;

  -- Lock every active sibling of this (service, entity_type) before reading the
  -- ordered set (FOR UPDATE cannot be combined with array_agg).
  PERFORM 1
    FROM public.activity_codes
   WHERE service_id  = v_service_id
     AND entity_type = v_entity_type
     AND is_active   = true
   FOR UPDATE;

  SELECT array_agg(activity_id ORDER BY substring(activity_code FROM '[0-9]+$')::int)
    INTO v_ids
    FROM public.activity_codes
   WHERE service_id  = v_service_id
     AND entity_type = v_entity_type
     AND is_active   = true;

  v_total := array_length(v_ids, 1);

  IF p_new_position < 1 OR p_new_position > v_total THEN
    RAISE EXCEPTION 'Position % out of range (1-%)', p_new_position, v_total;
  END IF;

  -- Remove the target, then reinsert it at the requested 1-based position.
  v_ids := array_remove(v_ids, p_activity_id);
  v_ids := v_ids[1:p_new_position - 1]
           || ARRAY[p_activity_id]
           || v_ids[p_new_position:array_length(v_ids, 1)];

  -- PHASE 1: temporary codes A{v_total+1}..A{2*v_total}. Always greater than any
  -- current final code (A1..A{v_total}), so they never collide — for any count.
  FOR i IN 1..v_total LOOP
    UPDATE public.activity_codes
       SET activity_code = v_abbrev || '-' || v_entity_type || (v_total + i)::text
     WHERE activity_id = v_ids[i];
  END LOOP;

  -- PHASE 2: final codes A1..A{v_total} in the desired order.
  FOR i IN 1..v_total LOOP
    UPDATE public.activity_codes
       SET activity_code = v_abbrev || '-' || v_entity_type || i::text
     WHERE activity_id = v_ids[i];
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_service_activity(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_service_activity(uuid, integer) TO authenticated;

CREATE TRIGGER trg_cascade_abbreviation_rename
  AFTER UPDATE OF abbreviation ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_service_abbreviation_rename();
