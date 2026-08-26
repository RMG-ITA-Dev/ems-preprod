-- =====================================================================
-- BUG 0820-182 — Fase 1 (BD): rol predeterminado de categoría, modernizado
-- =====================================================================
-- El commit 750f15dd (FASE 3c) quitó de la UI el control del rol predeterminado
-- de la categoría, dejando `categories.default_app_role` escrita por nadie y
-- leída por nadie. La decisión P4 de docs/plan-roles-permisos.md (Opción A) es
-- restaurarlo con semántica de SUGERENCIA — pero apuntando al catálogo real
-- `authorization_roles` (23 roles), no al enum legacy `app_role` (11 valores),
-- que colapsa siete role_key distintos en `manager` (hallazgo del bug 0722-162).
--
-- Por eso se agrega una columna NUEVA (`default_role_key`) en vez de reutilizar
-- `default_app_role`: esta última se conserva intacta porque sigue siendo el
-- espejo que leen las políticas RLS vía has_role(). Su deprecación es otro tema.
--
-- No se aplica hasta correr en Lovable:
--   LOVABLE PROMPT: "Apply pending Supabase migrations"
-- Después de aplicar, recargar el caché de PostgREST:
--   NOTIFY pgrst, 'reload schema';
-- Sin eso, la firma nueva de las RPC no es visible y la UI falla con PGRST202.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columna + FK al catálogo
-- ---------------------------------------------------------------------
-- NULL = "Ninguno" (la categoría no sugiere rol). No se fuerza NOT NULL: es un
-- dato opcional que el admin llena por categoría cuando le sirve.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS default_role_key text;

COMMENT ON COLUMN public.categories.default_role_key IS
  'Rol del catálogo authorization_roles que esta categoría SUGIERE al vincular un usuario. Es una sugerencia, no una asignación: el rol efectivo se gestiona en Configuración → Roles de Usuario y siempre puede diferir. NULL = ninguno.';

-- Idempotente: DROP antes de ADD para poder re-aplicar la migración completa.
ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_default_role_key_fkey;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_default_role_key_fkey
  FOREIGN KEY (default_role_key)
  REFERENCES public.authorization_roles(role_key)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 2) Backfill conservador desde el enum legacy
-- ---------------------------------------------------------------------
-- Solo donde el mapeo legacy → catálogo es INEQUÍVOCO. El guard `= 1` es el
-- punto central: `manager` lo comparten 7 role_key, `senior` 6, `partner` 3 y
-- `staff` 3, así que para esas categorías NO se puede deducir la intención y se
-- dejan en NULL a propósito. Solo admin/director/sqr/semisenior son 1:1, de modo
-- que se espera que este UPDATE toque pocas filas — es el resultado correcto
-- para un campo de sugerencia opcional, no un backfill incompleto.
--
-- Nota de orden: depende de que authorization_roles.legacy_app_role esté
-- poblado. En el mirror lo está; en un replay desde cero lo restaura la
-- migración 20260825000100, que corre DESPUÉS, así que ahí este UPDATE es un
-- no-op deliberado.
-- `admin` se excluye explícitamente. El formulario ANTERIOR a FASE 3c sí permitía
-- elegirlo, así que una base actualizada puede tener categorías con
-- default_app_role = 'admin'; y como ningún otro role_key mapea a ese enum, el guard de
-- unicidad de abajo lo daría por inequívoco y lo backfillearía. Eso reintroduciría por
-- datos justo lo que la UI nueva prohíbe: sugerir `admin` por categoría convierte un
-- cambio de categoría en una vía de escalada de privilegios.
UPDATE public.categories c
   SET default_role_key = ar.role_key
  FROM public.authorization_roles ar
 WHERE ar.legacy_app_role = c.default_app_role
   AND c.default_role_key IS NULL
   AND ar.role_key <> 'admin'
   AND (SELECT count(*) FROM public.authorization_roles a2
         WHERE a2.legacy_app_role = c.default_app_role) = 1;

-- Saneamiento: limpia cualquier sugerencia `admin` que ya existiera. Importa para la
-- idempotencia — si una versión previa de esta migración llegó a correr con el backfill
-- sin excluir `admin`, esas filas están ahí y el CHECK de abajo fallaría al crearse.
UPDATE public.categories
   SET default_role_key = NULL
 WHERE default_role_key = 'admin';

-- El invariante, a nivel de esquema. El filtro del desplegable y el guard de StaffForm
-- son de cliente: un bundle viejo, un RPC llamado a mano o un restore podrían saltárselos.
-- Esto no.
ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_default_role_key_not_admin;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_default_role_key_not_admin
  CHECK (default_role_key IS DISTINCT FROM 'admin');

-- ---------------------------------------------------------------------
-- 3) RPC de creación — firma nueva
-- ---------------------------------------------------------------------
-- DROP + CREATE, NO "CREATE OR REPLACE": agregar un parámetro no reemplaza la
-- función, crea una SOBRECARGA. Con dos firmas visibles PostgREST no puede
-- resolver la llamada y devuelve PGRST203, rompiendo crear/editar CUALQUIER
-- categoría. El cuerpo es idéntico al de cero_02 salvo la columna nueva.
DROP FUNCTION IF EXISTS public.create_category_for_practice(
  uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role);

CREATE FUNCTION public.create_category_for_practice(
  p_practice_id uuid,
  p_category_name text,
  p_display_order integer DEFAULT NULL::integer,
  p_rate_high_bob numeric DEFAULT 0,
  p_rate_low_bob numeric DEFAULT 0,
  p_rate_high_usd numeric DEFAULT 0,
  p_rate_low_usd numeric DEFAULT 0,
  p_can_approve_wo boolean DEFAULT false,
  p_can_approve_timesheets boolean DEFAULT false,
  p_default_app_role public.app_role DEFAULT NULL::public.app_role,
  p_default_role_key text DEFAULT NULL::text
) RETURNS public.categories
    LANGUAGE plpgsql SECURITY DEFINER
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

  -- Lock the practice row to serialize concurrent inserts for the same practice.
  SELECT is_active, allows_rates_activities
    INTO v_active, v_allows
    FROM public.practicas
   WHERE practica_id = p_practice_id
   FOR UPDATE;

  IF v_active IS NULL THEN
    RAISE EXCEPTION 'Practice not found';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Practice is inactive';
  END IF;
  IF NOT v_allows THEN
    RAISE EXCEPTION 'Practice does not allow rates/categories';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) INTO v_max
    FROM public.categories
   WHERE practica_id = p_practice_id;

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
   WHERE practica_id = p_practice_id
     AND display_order >= v_position;

  INSERT INTO public.categories (
    practica_id, category_name, display_order,
    rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd,
    can_approve_wo, can_approve_timesheets, default_app_role, default_role_key
  ) VALUES (
    p_practice_id, p_category_name, v_position,
    p_rate_high_bob, p_rate_low_bob, p_rate_high_usd, p_rate_low_usd,
    p_can_approve_wo, p_can_approve_timesheets, p_default_app_role, p_default_role_key
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------
-- 4) RPC de actualización — firma nueva
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_category_for_practice(
  uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role);

CREATE FUNCTION public.update_category_for_practice(
  p_category_id uuid,
  p_category_name text,
  p_display_order integer,
  p_rate_high_bob numeric,
  p_rate_low_bob numeric,
  p_rate_high_usd numeric,
  p_rate_low_usd numeric,
  p_can_approve_wo boolean,
  p_can_approve_timesheets boolean,
  p_default_app_role public.app_role,
  -- SIN DEFAULT, a diferencia de la función de creación. Acá el parámetro es
  -- obligatorio como los otros diez: el contrato de esta RPC es de REEMPLAZO TOTAL
  -- (ni `p_default_app_role` tiene default).
  --
  -- Si tuviera `DEFAULT NULL`, un bundle viejo de navegador —abierto desde antes del
  -- deploy— seguiría mandando las 10 claves previas: PostgREST resolvería igual esta
  -- función, Postgres aplicaría el default y editar cualquier tarifa BORRARÍA la
  -- sugerencia de rol en silencio. Sin default, esa llamada falla ruidosamente con
  -- PGRST202 y el usuario recarga. Fallar fuerte es preferible a perder datos callado.
  --
  -- Tampoco se usa COALESCE(p_default_role_key, default_role_key) para "preservar":
  -- eso haría imposible volver a "Ninguno", que es una elección legítima.
  p_default_role_key text
) RETURNS public.categories
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica_id uuid;
  v_old_pos    integer;
  v_total      integer;
  v_new_pos    integer;
  v_row        public.categories;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock the target category.
  SELECT practica_id, display_order
    INTO v_practica_id, v_old_pos
    FROM public.categories
   WHERE category_id = p_category_id
   FOR UPDATE;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM public.categories
   WHERE practica_id = v_practica_id;

  -- Clamp requested order to the valid range.
  v_new_pos := GREATEST(1, LEAST(COALESCE(p_display_order, v_old_pos), v_total));

  IF v_new_pos <> v_old_pos THEN
    IF v_new_pos < v_old_pos THEN
      -- Moving up: push the block [new, old-1] down by one.
      UPDATE public.categories
         SET display_order = display_order + 1
       WHERE practica_id = v_practica_id
         AND display_order >= v_new_pos
         AND display_order <  v_old_pos;
    ELSE
      -- Moving down: pull the block [old+1, new] up by one.
      UPDATE public.categories
         SET display_order = display_order - 1
       WHERE practica_id = v_practica_id
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
         default_role_key       = p_default_role_key,
         updated_at             = now()
   WHERE category_id = p_category_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------
-- 5) Grants — DROP FUNCTION se lleva la ACL, hay que reponerla
-- ---------------------------------------------------------------------
-- Copia literal de cero_06 (líneas 182-188 y 1075-1081) con la firma nueva. Sin
-- esto, `authenticated` recibe "permission denied" al crear/editar categorías.
-- El gate real lo sigue haciendo is_admin() dentro de cada función.
REVOKE ALL ON FUNCTION public.create_category_for_practice(
  uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_category_for_practice(
  uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role, text) TO anon;
GRANT ALL ON FUNCTION public.create_category_for_practice(
  uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role, text) TO authenticated;
GRANT ALL ON FUNCTION public.create_category_for_practice(
  uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_category_for_practice(
  uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_category_for_practice(
  uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role, text) TO anon;
GRANT ALL ON FUNCTION public.update_category_for_practice(
  uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role, text) TO authenticated;
GRANT ALL ON FUNCTION public.update_category_for_practice(
  uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role, text) TO service_role;

-- ---------------------------------------------------------------------
-- 6) Copia entre prácticas — clonar también el rol sugerido
-- ---------------------------------------------------------------------
-- Misma firma, así que CREATE OR REPLACE basta. El INSERT..SELECT es explícito
-- por columnas: sin agregar default_role_key aquí, copiar una práctica perdería
-- silenciosamente el rol sugerido de cada categoría.
CREATE OR REPLACE FUNCTION public.copy_categories_between_practices(p_source_practice_id uuid, p_target_practice_id uuid, p_replace boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
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

  IF p_source_practice_id = p_target_practice_id THEN
    RAISE EXCEPTION 'same_practice';
  END IF;

  SELECT is_active, allows_rates_activities
    INTO v_src_active, v_src_allows
    FROM public.practicas
   WHERE practica_id = p_source_practice_id;

  IF v_src_active IS NULL THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;
  IF NOT v_src_active OR NOT v_src_allows THEN
    RAISE EXCEPTION 'source_invalid';
  END IF;

  SELECT is_active, allows_rates_activities
    INTO v_tgt_active, v_tgt_allows
    FROM public.practicas
   WHERE practica_id = p_target_practice_id
   FOR UPDATE;

  IF v_tgt_active IS NULL THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;
  IF NOT v_tgt_active OR NOT v_tgt_allows THEN
    RAISE EXCEPTION 'target_invalid';
  END IF;

  SELECT COUNT(*) INTO v_target_count
    FROM public.categories
   WHERE practica_id = p_target_practice_id;

  IF v_target_count > 0 THEN
    IF NOT p_replace THEN
      RAISE EXCEPTION 'target_not_empty';
    END IF;

    SELECT COUNT(*) INTO v_referenced
      FROM public.categories c
     WHERE c.practica_id = p_target_practice_id
       AND (
         EXISTS (SELECT 1 FROM public.staff s WHERE s.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.wo_budget_lines b WHERE b.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.activity_worksheet_cells w WHERE w.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.activity_codes a WHERE a.default_category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.wo_staffing_requirements r WHERE r.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.engagement_assignments ea WHERE ea.category_id = c.category_id)
       );

    IF v_referenced > 0 THEN
      RAISE EXCEPTION 'target_referenced';
    END IF;

    DELETE FROM public.categories WHERE practica_id = p_target_practice_id;
  END IF;

  INSERT INTO public.categories (
    practica_id, category_name, display_order,
    rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd,
    can_approve_wo, can_approve_timesheets, default_app_role, default_role_key
  )
  SELECT p_target_practice_id,
         src.category_name,
         row_number() OVER (ORDER BY src.display_order, src.category_name),
         src.rate_high_bob, src.rate_low_bob, src.rate_high_usd, src.rate_low_usd,
         src.can_approve_wo, src.can_approve_timesheets, src.default_app_role, src.default_role_key
    FROM public.categories src
   WHERE src.practica_id = p_source_practice_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;
