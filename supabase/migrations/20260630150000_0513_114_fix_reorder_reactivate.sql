-- 0513-114 (follow-up): fix reorder + add reactivate for service-linked activities.
--
-- 1. reorder_service_activity — REPLACED. The original renumbered rows while the
--    target kept its old code, assigning a code another active row still held →
--    unique-violation on activity_codes_active_code_unique (WHERE is_active, not
--    deferrable). Rewritten with a two-phase renumber: first move every active
--    sibling to a temporary code (A11..A19, which cannot collide with the final
--    A1..A9), then assign the final codes in the desired order.
-- 2. reactivate_service_activity — NEW. Flips an inactive (AX) service-linked
--    activity back to active and assigns it the next free code (append, like new),
--    preserving its description.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. RPC: reorder_service_activity (two-phase, collision-safe)
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

  SELECT array_agg(activity_id ORDER BY activity_code)
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

  -- PHASE 1: temporary codes A11..A19 (2 digits, ≤ 9 chars, never collide with
  -- the final single-digit codes A1..A9).
  FOR i IN 1..v_total LOOP
    UPDATE public.activity_codes
       SET activity_code = v_abbrev || '-' || v_entity_type || (i + 10)::text
     WHERE activity_id = v_ids[i];
  END LOOP;

  -- PHASE 2: final codes A1..Av_total in the desired order.
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
-- 2. RPC: reactivate_service_activity
--    Inactive (AX) → active with the next free code {ABREV}-A{count+1}.
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

  IF v_count >= 9 THEN
    RAISE EXCEPTION 'max_activities_reached: at most 9 active activities per service per type';
  END IF;

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
