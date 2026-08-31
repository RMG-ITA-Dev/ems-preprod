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
-- 2) El invariante: una categoría nunca puede sugerir `admin`
-- ---------------------------------------------------------------------
-- Sugerir `admin` por categoría convertiría un cambio de categoría en una vía de
-- escalada de privilegios. El filtro del desplegable y el guard de StaffForm son de
-- cliente: un bundle viejo, un RPC llamado a mano o un restore podrían saltárselos.
-- Esto no. Se crea ANTES del backfill (que vive en 20260825000100) a propósito: si ese
-- backfill intentara alguna vez asignar `admin`, la migración falla en vez de pasar.
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

-- ---------------------------------------------------------------------
-- 7) RPC de sincronización categoría→rol, con la precondición ATÓMICA
-- ---------------------------------------------------------------------
-- El invariante que promete este flujo es "la sincronización por categoría NUNCA degrada
-- a un administrador". Chequearlo en el cliente no alcanza: entre la lectura y la
-- escritura otro admin puede promover a esa persona, y `admin_set_user_role_key` protege
-- solo al ÚLTIMO admin, no a cualquiera. La precondición tiene que evaluarse dentro de la
-- misma transacción que escribe.
--
-- Esta función NO duplica la lógica de admin_set_user_role_key —delega en ella— para no
-- tener dos copias de los guards de NOT_ADMIN / SELF_CHANGE / LAST_ADMIN / validación de
-- catálogo / auditoría, que se irían separando con el tiempo. Y NO se le agrega un
-- parámetro a esa función porque es la que asigna TODOS los roles del sistema: Gestión de
-- Roles sí debe poder degradar a un admin, y tocar su firma pondría en riesgo eso.
--
-- La atomicidad sale de dos candados tomados ANTES de leer:
--   · el advisory lock 67890 — el mismo que toman admin_set_user_role y
--     admin_set_user_role_key como primera instrucción, así que cualquier cambio de rol
--     por RPC queda serializado con esta lectura. Es re-entrante en la misma transacción,
--     de modo que la llamada anidada de más abajo no se bloquea a sí misma.
--   · el FOR UPDATE sobre la fila — cubre además el UPDATE DIRECTO a user_roles que la
--     policy "Admins can manage all roles" permite, y que no pasa por ningún RPC.
CREATE OR REPLACE FUNCTION public.sync_user_role_from_category(
  p_staff_id uuid,
  p_expected_role_key text,
  p_reason text DEFAULT NULL::text
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_is_admin         boolean;
  v_auth_user_id     uuid;
  v_category_id      uuid;
  v_suggested        text;
  v_current_role_key text;
  v_current_role     app_role;
begin
  -- AUTORIZACIÓN PRIMERO, antes de tomar candados y antes de leer cualquier fila.
  --
  -- Es SECURITY DEFINER, así que saltea RLS: sin este guard un autenticado cualquiera
  -- —o `anon`, que también tiene el GRANT— podía usar las respuestas como oráculo.
  -- ADMIN_PROTECTED vs NOT_ADMIN revelaba si la cuenta de un staff es administradora, y
  -- STAFF_NOT_LINKED revelaba si tiene cuenta vinculada, dato que `staff_directory`
  -- excluye a propósito por ser PII. Encima los candados se tomaban antes de autorizar,
  -- así que cualquiera podía provocar contención llamando en loop.
  --
  -- El predicado replica el de admin_set_user_role_key (role_key O el enum legacy) en vez
  -- de usar is_admin(), que mira solo el enum: con is_admin() este guard sería MÁS
  -- estricto que la función a la que delega y rechazaría a un admin que todavía no tiene
  -- role_key. Acá solo debe cortar temprano a quien la delegación ya iba a rechazar.
  select exists (
    select 1 from user_roles
    where user_id = auth.uid()
      and (role_key = 'admin' or role = 'admin')
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object('success', false, 'code', 'NOT_ADMIN',
      'message', 'Only admins can change roles');
  end if;

  -- Recibe el STAFF, no el usuario ni el rol ya resueltos. Esa es la diferencia: el rol a
  -- aplicar tiene que ser el que la categoría VIGENTE de ese staff sugiere, verificado con
  -- las filas bloqueadas. Con la firma anterior —(user_id, role_key)— la función no miraba
  -- ninguna categoría, así que si otro admin cambiaba la categoría del staff, rompía el
  -- vínculo de cuenta o editaba la sugerencia de la categoría destino mientras el diálogo
  -- estaba abierto, se aplicaba igual un rol que ya no correspondía a nada.
  --
  -- `p_expected_role_key` es lo que el admin CONFIRMÓ en el diálogo. Si la sugerencia
  -- cambió en el medio, se rechaza en vez de aplicar la nueva: nadie debe terminar con un
  -- rol que no vio.

  -- `admin` no es un rol sugerible por categoría (ver categories_default_role_key_not_admin).
  -- El CHECK ya impide guardarlo, pero esta función es una entrada pública: se rechaza acá
  -- también, para que no exista ningún camino de escalada vía sincronización.
  if p_expected_role_key is null or p_expected_role_key = 'admin' then
    return jsonb_build_object('success', false, 'code', 'ADMIN_TARGET_FORBIDDEN',
      'message', 'A category may not suggest the admin role');
  end if;

  perform pg_advisory_xact_lock(67890);

  -- Se bloquea el staff: de acá en adelante nadie le cambia la categoría ni el vínculo de
  -- cuenta hasta que esta transacción termine.
  select auth_user_id, category_id
    into v_auth_user_id, v_category_id
    from staff
   where staff_id = p_staff_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'STAFF_NOT_FOUND',
      'message', 'Staff not found');
  end if;

  if v_auth_user_id is null then
    return jsonb_build_object('success', false, 'code', 'STAFF_NOT_LINKED',
      'message', 'Staff has no linked account');
  end if;

  -- Y se bloquea la categoría, porque su sugerencia es parte de la precondición.
  select default_role_key into v_suggested
    from categories
   where category_id = v_category_id
   for update;

  -- `is distinct from` cubre los tres casos de una vez: la categoría cambió, la sugerencia
  -- se editó, o la categoría dejó de sugerir algo (NULL).
  if v_suggested is distinct from p_expected_role_key then
    return jsonb_build_object('success', false, 'code', 'CATEGORY_SUGGESTION_CHANGED',
      'message', 'The category no longer suggests the confirmed role',
      'expected_role_key', p_expected_role_key, 'current_role_key', v_suggested);
  end if;

  select role_key, role into v_current_role_key, v_current_role
    from user_roles
   where user_id = v_auth_user_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'USER_NOT_FOUND',
      'message', 'User role not found');
  end if;

  -- El invariante, evaluado con las filas bloqueadas: de acá al UPDATE nadie puede
  -- promover a esta persona a admin sin esperar a que esta transacción termine.
  --
  -- Se miran LAS DOS representaciones, igual que el guard del llamante de más arriba. Un
  -- admin puede tener `role = 'admin'` con `role_key` nulo o desfasado: el RPC deprecado
  -- `admin_set_user_role` sigue concedido y escribe SOLO el enum. Mirar únicamente
  -- `role_key` lo dejaría fuera del guard, y la delegación pisaría ambas columnas — y el
  -- LAST_ADMIN de admin_set_user_role_key tampoco lo frenaría, porque cuenta por role_key.
  if v_current_role_key = 'admin' or v_current_role = 'admin' then
    return jsonb_build_object('success', false, 'code', 'ADMIN_PROTECTED',
      'message', 'Category sync never demotes an admin');
  end if;

  -- Delegación: los candados siguen tomados por esta transacción, así que la relectura de
  -- admin_set_user_role_key ve exactamente lo que se validó arriba.
  return public.admin_set_user_role_key(v_auth_user_id, p_expected_role_key, p_reason);
end;
$$;

COMMENT ON FUNCTION public.sync_user_role_from_category(uuid, text, text) IS
  'Aplica a un staff el rol que su categoría VIGENTE sugiere (BUG 0820-182). Recibe el staff, no el usuario ni el rol ya resueltos, y verifica con las filas bloqueadas que el vínculo de cuenta y la sugerencia de la categoría sigan siendo los que el admin confirmó. Delega en admin_set_user_role_key agregando dos precondiciones que esa función no tiene y que este flujo sí promete: nunca degradar a un admin, y nunca asignar admin. Todo con candados, de modo que las garantías son atómicas y no carreras del cliente.';

REVOKE ALL ON FUNCTION public.sync_user_role_from_category(uuid, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_user_role_from_category(uuid, text, text) TO anon;
GRANT ALL ON FUNCTION public.sync_user_role_from_category(uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.sync_user_role_from_category(uuid, text, text) TO service_role;
