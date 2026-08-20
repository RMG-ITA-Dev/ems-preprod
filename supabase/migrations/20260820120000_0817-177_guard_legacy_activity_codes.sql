-- 0817-177 (review follow-up): guard all four activity_codes ordinal RPCs
-- against the 8 legacy activity codes.
--
-- 20260818120000_0817-177_require_activity_practice.sql backfilled the 8
-- pre-service_id codes (PLN/FLD/REV/DOC/ADM/MTG/TRV/TRN) to Auditoría so
-- activity_codes.service_id could become NOT NULL. Those codes predate the
-- {abbrev}-{entity_type}{n} ordinal scheme create_service_activity/
-- reactivate_service_activity/reorder_service_activity/
-- deactivate_service_activity assume:
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
--   - create_service_activity/reactivate_service_activity count *every*
--     active row in (service_id, entity_type) to pick the next ordinal.
--     On a from-scratch install the 8 legacy rows inflate that count, so the
--     first real activity created in Auditoría gets 'AUD-A9' instead of
--     'AUD-A1'. reorder_service_activity's temp-code phase assumes the
--     ordinal-scheme siblings occupy a contiguous 1..v_total range — once a
--     9th real activity exists, its first temporary rename ('AUD-A9' →
--     'AUD-A10') collides with an already-active 'AUD-A10', violating
--     activity_codes_active_code_unique.
--   - reactivate_service_activity never validated the *previous* code of the
--     row being reactivated, so it would rename a legacy code the same way a
--     brand-new activity gets one — same 'ADM' → 'AUD-A<n>' risk as reorder.
--   - Filtering create/reactivate's count to ordinal-scheme rows (first pass
--     of this migration) only prevents *future* inflation. On an environment
--     where the legacy codes were already linked to a práctica before this
--     migration (every deployed environment, per 20260818120000's own
--     rationale), a real activity may already have been created under the
--     old, unfiltered count — e.g. 'AUD-A9' as the first real one. Deriving
--     the next code from COUNT(*) + 1 over the filtered set doesn't know
--     about that gap: it fills 'AUD-A2'..'AUD-A8' and then re-derives
--     'AUD-A9', colliding with the already-active row from before this fix.
--
-- Fix: all four RPCs now either reject operating on a legacy
-- (non-ordinal-scheme) code, or exclude legacy rows from whatever count/set
-- they compute — so the ordinal scheme stays contiguous from 1 regardless of
-- how many legacy rows share a (service_id, entity_type), and reordering a
-- real service-created activity in Auditoría never touches the legacy rows.
-- create_service_activity/reactivate_service_activity derive the next code
-- from the highest existing ordinal (MAX), not a row count, so any gap or
-- inflation left over from before this guard can never produce a collision.

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

-- ────────────────────────────────────────────────────────────────────────────
-- create_service_activity — derive the next ordinal from the highest
-- existing one (MAX), scoped to ordinal-scheme siblings only, so neither a
-- legacy row nor a pre-existing gap/inflation can ever produce a collision.
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
  v_abbrev       text;
  v_max_ordinal  integer;
  v_code         text;
  v_row          public.activity_codes;
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

  -- Highest existing ordinal among active, ordinal-scheme activities for
  -- this (service, entity_type) pair. 0817-177: legacy codes (PLN/FLD/REV/
  -- DOC/ADM/MTG/TRV/TRN) don't match the {abbrev}-{entity_type}{n} pattern
  -- and are excluded. Using MAX (not COUNT) also survives any gap left by an
  -- environment where a real activity was already created under the old,
  -- unfiltered count before this guard existed — the next code always beats
  -- the highest one on record, so it can never collide.
  SELECT COALESCE(MAX(substring(activity_code FROM '[0-9]+$')::int), 0) INTO v_max_ordinal
    FROM public.activity_codes
   WHERE service_id  = p_service_id
     AND entity_type = p_entity_type
     AND is_active   = true
     AND activity_code ~ ('^' || v_abbrev || '-' || p_entity_type || '[0-9]+$');

  -- No hard cap: 1–9 is a UI recommendation only.
  v_code := v_abbrev || '-' || p_entity_type || (v_max_ordinal + 1)::text;

  INSERT INTO public.activity_codes (activity_code, description, is_active, service_id, entity_type)
  VALUES (v_code, p_description, true, p_service_id, p_entity_type)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_service_activity(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_service_activity(uuid, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- reactivate_service_activity — reject reactivating a legacy code (its old
-- code must be preserved, not renumbered), and derive the next ordinal from
-- the highest existing one (MAX), same fix as create_service_activity above.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reactivate_service_activity(
  p_activity_id uuid
) RETURNS public.activity_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_id   uuid;
  v_entity_type  text;
  v_abbrev       text;
  v_old_code     text;
  v_max_ordinal  integer;
  v_code         text;
  v_row          public.activity_codes;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock and fetch the target (and its service row) atomically.
  SELECT ac.service_id, ac.entity_type, ac.activity_code, s.abbreviation
    INTO v_service_id, v_entity_type, v_old_code, v_abbrev
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

  -- 0817-177: legacy codes (PLN/FLD/REV/DOC/ADM/MTG/TRV/TRN) predate the
  -- {abbrev}-{entity_type}{n} scheme; reactivating one must never assign it
  -- a fresh ordinal code (e.g. 'ADM' → 'AUD-A<n>' would break
  -- useAdminActivityId's literal lookup), so reject it with a clear error
  -- instead — same posture as deactivate_service_activity/
  -- reorder_service_activity for these codes.
  IF v_old_code !~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$') THEN
    RAISE EXCEPTION 'Activity code % predates the ordinal scheme and cannot be reactivated through this action', v_old_code;
  END IF;

  -- Highest existing ordinal among active, ordinal-scheme activities for
  -- this (service, entity_type) pair — same MAX-based derivation as
  -- create_service_activity, so a code assigned before this guard existed
  -- can never collide with the one generated here.
  SELECT COALESCE(MAX(substring(activity_code FROM '[0-9]+$')::int), 0) INTO v_max_ordinal
    FROM public.activity_codes
   WHERE service_id  = v_service_id
     AND entity_type = v_entity_type
     AND is_active   = true
     AND activity_code ~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$');

  -- No hard cap: 1–9 is a UI recommendation only.
  v_code := v_abbrev || '-' || v_entity_type || (v_max_ordinal + 1)::text;

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
