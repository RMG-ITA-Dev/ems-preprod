-- 0817-177 (review follow-up): guard reorder_service_activity and
-- deactivate_service_activity against the 8 legacy activity codes.
--
-- 20260818120000_0817-177_require_activity_practice.sql backfilled the 8
-- pre-service_id codes (PLN/FLD/REV/DOC/ADM/MTG/TRV/TRN) to Auditoría so
-- activity_codes.service_id could become NOT NULL. Those codes predate the
-- {abbrev}-{entity_type}{n} ordinal scheme create_service_activity/
-- reorder_service_activity/deactivate_service_activity assume:
--
--   - deactivate_service_activity extracts the trailing ordinal with
--     regexp_replace(...)::integer; a code with no trailing digits (e.g.
--     'ADM') doesn't match, so the cast raises `invalid input syntax for
--     integer` instead of deactivating the row.
--   - reorder_service_activity renumbers every active sibling in the same
--     (service_id, entity_type) group to {abbrev}-{entity_type}{n}; since
--     these 8 rows now share Auditoría/'A' with real service-created
--     activities, reordering any of the latter would silently rename e.g.
--     'ADM' to 'AUD-A<n>'. useAdminActivityId (src/hooks/useAdminActivity.ts)
--     looks up activity_code = 'ADM' by literal value, so that rename breaks
--     the automatic administrative activity on non-chargeable engagements.
--
-- Fix: both RPCs now reject operating on a legacy (non-ordinal-scheme) code,
-- and exclude any legacy siblings from the renumbered set — so reordering a
-- real service-created activity in Auditoría never touches the legacy rows.

-- ────────────────────────────────────────────────────────────────────────────
-- deactivate_service_activity — reject legacy codes with a clear error
-- instead of an opaque integer-cast failure.
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
  SELECT ac.service_id, ac.entity_type, ac.activity_code, s.abbreviation
    INTO v_service_id, v_entity_type, v_old_code, v_abbrev
    FROM public.activity_codes ac
    JOIN public.services s USING (service_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = true
   FOR UPDATE OF ac, s;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found, already inactive, or not service-linked';
  END IF;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Service has no abbreviation';
  END IF;

  -- 0817-177: legacy codes (PLN/FLD/REV/DOC/ADM/MTG/TRV/TRN) predate the
  -- {abbrev}-{entity_type}{n} scheme and have no trailing ordinal to shift.
  IF v_old_code !~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$') THEN
    RAISE EXCEPTION 'Activity code % predates the ordinal scheme and cannot be deactivated through this action', v_old_code;
  END IF;

  -- Extract current ordinal from code (e.g. AUD-A3 → 3, AUD-A10 → 10).
  v_old_ordinal := (regexp_replace(v_old_code, '^.*[A-Z](\d+)$', '\1'))::integer;

  -- Mark target as inactive with AX code.
  UPDATE public.activity_codes
     SET is_active = false,
         activity_code = v_abbrev || '-' || v_entity_type || 'X'
   WHERE activity_id = p_activity_id;

  -- Renumber actives with ordinal > old_ordinal (shift back by 1). Legacy
  -- siblings have no trailing digits, so the substring/cast is NULL and the
  -- NULL > v_old_ordinal comparison excludes them from this set already.
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
-- reorder_service_activity — reject reordering a legacy code, and exclude
-- legacy siblings from the renumbered set.
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
  v_code        text;
  v_total       integer;
  v_ids         uuid[];
  i             integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Fetch and lock the target activity (and its service row) atomically.
  SELECT ac.service_id, ac.entity_type, ac.activity_code, s.abbreviation
    INTO v_service_id, v_entity_type, v_code, v_abbrev
    FROM public.activity_codes ac
    JOIN public.services s USING (service_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = true
   FOR UPDATE OF ac, s;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found or not an active service-linked activity';
  END IF;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Service has no abbreviation';
  END IF;

  -- 0817-177: legacy codes (PLN/FLD/REV/DOC/ADM/MTG/TRV/TRN) predate the
  -- {abbrev}-{entity_type}{n} scheme this RPC renumbers; renaming them (e.g.
  -- 'ADM' → 'AUD-A<n>') would break useAdminActivityId's literal lookup.
  IF v_code !~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$') THEN
    RAISE EXCEPTION 'Activity code % predates the ordinal scheme and cannot be reordered', v_code;
  END IF;

  -- Lock every active, ordinal-scheme sibling of this (service, entity_type)
  -- before reading the ordered set (FOR UPDATE cannot be combined with
  -- array_agg). Legacy siblings are excluded so they're never renumbered.
  PERFORM 1
    FROM public.activity_codes
   WHERE service_id  = v_service_id
     AND entity_type = v_entity_type
     AND is_active   = true
     AND activity_code ~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$')
   FOR UPDATE;

  SELECT array_agg(activity_id ORDER BY substring(activity_code FROM '[0-9]+$')::int)
    INTO v_ids
    FROM public.activity_codes
   WHERE service_id  = v_service_id
     AND entity_type = v_entity_type
     AND is_active   = true
     AND activity_code ~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$');

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
