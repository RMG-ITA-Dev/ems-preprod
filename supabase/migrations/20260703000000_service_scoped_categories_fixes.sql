-- 0702-152 review fixes — hardening for service-scoped categories.
--
-- #4 delete_category_for_service — hard delete + compact display_order so the
--    per-service order stays gap-free 1..N (the direct client delete left holes).
-- #2 create_category_for_service — also require services.allows_rates_activities
--    (backend enforcement of the "active + rate-bearing" rule, not just the UI).
-- #3 copy_categories_between_services — validate that source AND target exist,
--    are active and rate-bearing, instead of silently returning 0.
-- #8 copy_categories_between_services — also check activity_worksheet_cells and
--    activity_codes.default_category_id before deleting the target's categories
--    in replace mode (docs/database-schema.sql lists 4 FKs to categories, not 2).

-- ────────────────────────────────────────────────────────────────────────────
-- #4. RPC: delete_category_for_service
--     Deletes the category and pulls every later sibling up by one so the
--     service keeps a gap-free 1..N order. FK violations (staff / budget lines)
--     still propagate as before.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_category_for_service(
  p_category_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_id uuid;
  v_pos        integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock the target row; capture its service + position for the compaction.
  SELECT service_id, display_order
    INTO v_service_id, v_pos
    FROM public.categories
   WHERE category_id = p_category_id
   FOR UPDATE;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  DELETE FROM public.categories WHERE category_id = p_category_id;

  -- Close the gap: everything after the removed position shifts up by one.
  -- The (service_id, display_order) unique is DEFERRABLE, so the bulk shift is
  -- safe within this transaction.
  UPDATE public.categories
     SET display_order = display_order - 1
   WHERE service_id = v_service_id
     AND display_order > v_pos;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_category_for_service(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_category_for_service(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- #2. RPC: create_category_for_service (replace)
--     Now also enforces services.allows_rates_activities so a category can never
--     be created on a non-rate-bearing service (e.g. Firmwide) by bypassing the UI.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_category_for_service(
  p_service_id             uuid,
  p_category_name          text,
  p_display_order          integer DEFAULT NULL,
  p_rate_high_bob          numeric DEFAULT 0,
  p_rate_low_bob           numeric DEFAULT 0,
  p_rate_high_usd          numeric DEFAULT 0,
  p_rate_low_usd           numeric DEFAULT 0,
  p_can_approve_wo         boolean DEFAULT false,
  p_can_approve_timesheets boolean DEFAULT false,
  p_default_app_role       public.app_role DEFAULT NULL
) RETURNS public.categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_active     boolean;
  v_allows     boolean;
  v_max        integer;
  v_position   integer;
  v_row        public.categories;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock the service row to serialize concurrent inserts for the same service.
  SELECT is_active, allows_rates_activities
    INTO v_active, v_allows
    FROM public.services
   WHERE service_id = p_service_id
   FOR UPDATE;

  IF v_active IS NULL THEN
    RAISE EXCEPTION 'Service not found';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Service is inactive';
  END IF;
  IF NOT v_allows THEN
    RAISE EXCEPTION 'Service does not allow rates/categories';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) INTO v_max
    FROM public.categories
   WHERE service_id = p_service_id;

  -- Null / out-of-range → append; otherwise clamp to [1, max+1] (gap-free).
  IF p_display_order IS NULL OR p_display_order > v_max + 1 THEN
    v_position := v_max + 1;
  ELSIF p_display_order < 1 THEN
    v_position := 1;
  ELSE
    v_position := p_display_order;
  END IF;

  -- Shift existing siblings from the target position onward.
  UPDATE public.categories
     SET display_order = display_order + 1
   WHERE service_id = p_service_id
     AND display_order >= v_position;

  INSERT INTO public.categories (
    service_id, category_name, display_order,
    rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd,
    can_approve_wo, can_approve_timesheets, default_app_role
  ) VALUES (
    p_service_id, p_category_name, v_position,
    p_rate_high_bob, p_rate_low_bob, p_rate_high_usd, p_rate_low_usd,
    p_can_approve_wo, p_can_approve_timesheets, p_default_app_role
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_category_for_service(uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_category_for_service(uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- #3. RPC: copy_categories_between_services (replace)
--     Validate that source and target both exist, are active and rate-bearing.
--     A missing/inactive/non-rate service now raises instead of silently
--     returning 0 copied rows.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.copy_categories_between_services(
  p_source_service_id uuid,
  p_target_service_id uuid,
  p_replace           boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_src_active   boolean;
  v_src_allows   boolean;
  v_tgt_active   boolean;
  v_tgt_allows   boolean;
  v_target_count integer;
  v_referenced   integer;
  v_inserted     integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  IF p_source_service_id = p_target_service_id THEN
    RAISE EXCEPTION 'same_service';
  END IF;

  -- Validate the source service.
  SELECT is_active, allows_rates_activities
    INTO v_src_active, v_src_allows
    FROM public.services
   WHERE service_id = p_source_service_id;

  IF v_src_active IS NULL THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;
  IF NOT v_src_active OR NOT v_src_allows THEN
    RAISE EXCEPTION 'source_invalid';
  END IF;

  -- Validate + lock the target service so a concurrent copy/insert can't race us.
  SELECT is_active, allows_rates_activities
    INTO v_tgt_active, v_tgt_allows
    FROM public.services
   WHERE service_id = p_target_service_id
   FOR UPDATE;

  IF v_tgt_active IS NULL THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;
  IF NOT v_tgt_active OR NOT v_tgt_allows THEN
    RAISE EXCEPTION 'target_invalid';
  END IF;

  SELECT COUNT(*) INTO v_target_count
    FROM public.categories
   WHERE service_id = p_target_service_id;

  IF v_target_count > 0 THEN
    IF NOT p_replace THEN
      RAISE EXCEPTION 'target_not_empty';
    END IF;

    -- Refuse to delete target categories that are still in use anywhere.
    SELECT COUNT(*) INTO v_referenced
      FROM public.categories c
     WHERE c.service_id = p_target_service_id
       AND (
         EXISTS (SELECT 1 FROM public.staff s WHERE s.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.wo_budget_lines b WHERE b.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.activity_worksheet_cells w WHERE w.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.activity_codes a WHERE a.default_category_id = c.category_id)
       );

    IF v_referenced > 0 THEN
      RAISE EXCEPTION 'target_referenced';
    END IF;

    DELETE FROM public.categories WHERE service_id = p_target_service_id;
  END IF;

  INSERT INTO public.categories (
    service_id, category_name, display_order,
    rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd,
    can_approve_wo, can_approve_timesheets, default_app_role
  )
  SELECT p_target_service_id,
         src.category_name,
         row_number() OVER (ORDER BY src.display_order, src.category_name),
         src.rate_high_bob, src.rate_low_bob, src.rate_high_usd, src.rate_low_usd,
         src.can_approve_wo, src.can_approve_timesheets, src.default_app_role
    FROM public.categories src
   WHERE src.service_id = p_source_service_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.copy_categories_between_services(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_categories_between_services(uuid, uuid, boolean) TO authenticated;
