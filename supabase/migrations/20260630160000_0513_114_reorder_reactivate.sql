-- 0513-114 (follow-up, consolidated): reorder + reactivate + no hard cap.
--
-- Single follow-up migration on top of 20260629000000_0513_114_service_activity_codes.sql
-- (which created the columns, the partial unique index, and the original RPCs). All three
-- functions use CREATE OR REPLACE, so this brings them to their final form in one step:
--
-- 1. create_service_activity     — append an activity; NO hard cap (1–9 is a UI recommendation).
-- 2. reactivate_service_activity — NEW. Inactive (AX) → active with the next free code
--    {ABREV}-A{count+1} (append, like new), preserving its description. No hard cap.
-- 3. reorder_service_activity    — FIXED. Two-phase renumber with a DYNAMIC temp offset
--    (v_total + i). The temporaries A{n+1}..A{2n} can never overlap the final codes A1..An,
--    so it is collision-safe against the partial unique index for ANY number of activities.
--    (The original definition renumbered in place and violated the index; an earlier fix used
--    a fixed +10 offset that only held up to 10 rows.)
--
-- deactivate_service_activity is unchanged (its backward shift was already safe).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. create_service_activity — append, no upper limit
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

  -- No hard cap: 1–9 is a UI recommendation only.
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
-- 2. reactivate_service_activity — append, no upper limit
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

  -- Lock and fetch the target; must be inactive and service-linked.
  SELECT ac.service_id, ac.entity_type, s.abbreviation
    INTO v_service_id, v_entity_type, v_abbrev
    FROM public.activity_codes ac
    JOIN public.services s USING (service_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = false
   FOR UPDATE OF ac;

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
-- 3. reorder_service_activity — two-phase, dynamic temp offset (collision-safe)
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

-- ────────────────────────────────────────────────────────────────────────────
-- 4. deactivate_service_activity — numeric ordinal comparison (R1 fix)
--    Replaces the original definition from 20260629000000, which used lexicographic
--    comparison (activity_code > '…A9') and ORDER BY activity_code — both wrong
--    once ordinals exceed 9.
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

  -- Extract current ordinal from code (e.g. AUD-A3 → 3, AUD-A10 → 10).
  v_old_ordinal := (regexp_replace(v_old_code, '^.*[A-Z](\d+)$', '\1'))::integer;

  -- Mark target as inactive with AX code.
  UPDATE public.activity_codes
     SET is_active = false,
         activity_code = v_abbrev || '-' || v_entity_type || 'X'
   WHERE activity_id = p_activity_id;

  -- Renumber actives with ordinal > old_ordinal (shift back by 1).
  -- Uses numeric extraction to correctly handle ordinals > 9.
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
