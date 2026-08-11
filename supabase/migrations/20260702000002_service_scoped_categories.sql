-- 0702-152: Scope categories/rates to a service.
--
-- 1. Add service_id (FK → services) to categories; backfill to Auditoría (code = 1).
-- 2. Normalize display_order to a gap-free 1..N sequence per service.
-- 3. Replace the global UNIQUE(category_name) with UNIQUE(service_id, category_name).
-- 4. Add UNIQUE(service_id, display_order) DEFERRABLE + CHECK(display_order >= 1).
-- 5. RPC: create_category_for_service — insert at a position, shifting siblings.
-- 6. RPC: update_category_for_service — edit fields + reorder (service immutable).
-- 7. RPC: move_category — position-based reorder within the service.
-- 8. RPC: copy_categories_between_services — copy full list to another service.
--
-- Categories use an order NUMBER only — never a generated code (unlike activities).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. CATEGORIES: service_id column + backfill
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS service_id uuid
    REFERENCES public.services (service_id) ON DELETE RESTRICT;

-- Backfill every existing category to Auditoría (services.code = 1). Code is
-- stable vs the accented / renameable name.
UPDATE public.categories
   SET service_id = (SELECT service_id FROM public.services WHERE code = 1)
 WHERE service_id IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. NORMALIZE display_order to 1..N per service (gap-free)
-- ────────────────────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT category_id,
         row_number() OVER (
           PARTITION BY service_id
           ORDER BY display_order, created_at
         ) AS rn
    FROM public.categories
)
UPDATE public.categories c
   SET display_order = ranked.rn
  FROM ranked
 WHERE c.category_id = ranked.category_id;

-- service_id is now mandatory.
ALTER TABLE public.categories
  ALTER COLUMN service_id SET NOT NULL;

-- The old free-form DEFAULT 0 would violate CHECK(display_order >= 1); drop it so
-- inserts must go through the RPCs (which always set a valid position).
ALTER TABLE public.categories
  ALTER COLUMN display_order DROP DEFAULT;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. SWAP name uniqueness: global → per service
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_category_name_key;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_service_name_unique UNIQUE (service_id, category_name);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Order uniqueness (deferrable so shifts run inside one txn) + range check
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.categories
  ADD CONSTRAINT categories_service_order_unique UNIQUE (service_id, display_order)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_display_order_positive CHECK (display_order >= 1);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RPC: create_category_for_service
--    Inserts a category at p_display_order (null → append), shifting siblings
--    with display_order >= position by +1 within the same service.
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
  v_active   boolean;
  v_max      integer;
  v_position integer;
  v_row      public.categories;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock the service row to serialize concurrent inserts for the same service.
  SELECT is_active INTO v_active
    FROM public.services
   WHERE service_id = p_service_id
   FOR UPDATE;

  IF v_active IS NULL THEN
    RAISE EXCEPTION 'Service not found';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Service is inactive';
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
-- 6. RPC: update_category_for_service
--    Edits fields and (optionally) reorders within the same service. The
--    service of an existing category can never change.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_category_for_service(
  p_category_id            uuid,
  p_category_name          text,
  p_display_order          integer,
  p_rate_high_bob          numeric,
  p_rate_low_bob           numeric,
  p_rate_high_usd          numeric,
  p_rate_low_usd           numeric,
  p_can_approve_wo         boolean,
  p_can_approve_timesheets boolean,
  p_default_app_role       public.app_role
) RETURNS public.categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_id uuid;
  v_old_pos    integer;
  v_total      integer;
  v_new_pos    integer;
  v_row        public.categories;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock the target category.
  SELECT service_id, display_order
    INTO v_service_id, v_old_pos
    FROM public.categories
   WHERE category_id = p_category_id
   FOR UPDATE;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM public.categories
   WHERE service_id = v_service_id;

  -- Clamp requested order to the valid range.
  v_new_pos := GREATEST(1, LEAST(COALESCE(p_display_order, v_old_pos), v_total));

  IF v_new_pos <> v_old_pos THEN
    IF v_new_pos < v_old_pos THEN
      -- Moving up: push the block [new, old-1] down by one.
      UPDATE public.categories
         SET display_order = display_order + 1
       WHERE service_id = v_service_id
         AND display_order >= v_new_pos
         AND display_order <  v_old_pos;
    ELSE
      -- Moving down: pull the block [old+1, new] up by one.
      UPDATE public.categories
         SET display_order = display_order - 1
       WHERE service_id = v_service_id
         AND display_order >  v_old_pos
         AND display_order <= v_new_pos;
    END IF;
  END IF;

  UPDATE public.categories
     SET category_name          = p_category_name,
         display_order          = v_new_pos,
         rate_high_bob          = p_rate_high_bob,
         rate_low_bob           = p_rate_low_bob,
         rate_high_usd          = p_rate_high_usd,
         rate_low_usd           = p_rate_low_usd,
         can_approve_wo         = p_can_approve_wo,
         can_approve_timesheets = p_can_approve_timesheets,
         default_app_role       = p_default_app_role,
         updated_at             = now()
   WHERE category_id = p_category_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_category_for_service(uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_category_for_service(uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. RPC: move_category
--    Position-based reorder within the category's service (mirrors
--    reorder_service_activity so the arrow UI is reused verbatim). Keeps 1..N.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.move_category(
  p_category_id  uuid,
  p_new_position integer   -- 1-based
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_id uuid;
  v_old_pos    integer;
  v_total      integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  SELECT service_id, display_order
    INTO v_service_id, v_old_pos
    FROM public.categories
   WHERE category_id = p_category_id
   FOR UPDATE;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM public.categories
   WHERE service_id = v_service_id;

  IF p_new_position < 1 OR p_new_position > v_total THEN
    RAISE EXCEPTION 'Position % out of range (1-%)', p_new_position, v_total;
  END IF;

  IF p_new_position = v_old_pos THEN
    RETURN;
  END IF;

  IF p_new_position < v_old_pos THEN
    UPDATE public.categories
       SET display_order = display_order + 1
     WHERE service_id = v_service_id
       AND display_order >= p_new_position
       AND display_order <  v_old_pos;
  ELSE
    UPDATE public.categories
       SET display_order = display_order - 1
     WHERE service_id = v_service_id
       AND display_order >  v_old_pos
       AND display_order <= p_new_position;
  END IF;

  UPDATE public.categories
     SET display_order = p_new_position
   WHERE category_id = p_category_id;
END;
$$;

REVOKE ALL ON FUNCTION public.move_category(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_category(uuid, integer) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RPC: copy_categories_between_services
--    Copies the full source list (rates + flags + role) into the target,
--    normalizing display_order 1..N.
--      * target empty            → copy (caller confirms).
--      * target non-empty +      → require p_replace; block if any target
--        p_replace                 category is referenced by staff / budget lines.
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

  -- Lock the target service so a concurrent copy/insert can't race us.
  PERFORM 1 FROM public.services WHERE service_id = p_target_service_id FOR UPDATE;

  SELECT COUNT(*) INTO v_target_count
    FROM public.categories
   WHERE service_id = p_target_service_id;

  IF v_target_count > 0 THEN
    IF NOT p_replace THEN
      RAISE EXCEPTION 'target_not_empty';
    END IF;

    -- Refuse to delete target categories that are still in use.
    SELECT COUNT(*) INTO v_referenced
      FROM public.categories c
     WHERE c.service_id = p_target_service_id
       AND (
         EXISTS (SELECT 1 FROM public.staff s WHERE s.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.wo_budget_lines b WHERE b.category_id = c.category_id)
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
