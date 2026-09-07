-- Transactional tests for `sync_user_role_from_category(uuid, text, text)` —
-- migration 20260825000000_category_default_role_key.sql (BUG 0820-182).
--
-- Por qué existe esta suite: el PR de 0820-182 acumuló cinco correcciones de seguridad y
-- las cinco viven en esta única función (guard de autorización, protección de admin,
-- atomicidad, revalidación de categoría, y reconocer al admin por cualquiera de sus dos
-- representaciones). La cobertura de Vitest que las acompaña PARSEA el texto del SQL: no
-- ejecuta Postgres, así que pasaría igual si la función fuera funcionalmente incorrecta.
-- Acá se ejecuta de verdad, contra la base scratch.
--
-- Run via supabase/tests/local/run-rls-tests.sh, después de las 6 migraciones
-- consolidadas, las incrementales de 0820-182 y el seed RBAC/practica-base. Transacción
-- única, SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo, terminando con
-- "SYNC USER ROLE FROM CATEGORY: ALL CHECKS PASSED (rolled back)".
--
-- Mundo de fixtures (ids con sufijo ...5c<n> reconocible):
--   U_ADMIN     usuario admin (role_key='admin') — el llamante autorizado
--   U_PLAIN     usuario sin privilegios (role_key='assistant') — el llamante NO autorizado
--   U_TARGET    destino normal (role_key='assistant'), staff S_TARGET vinculado
--   U_ADMIN_KEY destino admin por role_key — protegido
--   U_ADMIN_LEG destino admin SOLO por el enum legacy (role='admin', role_key='senior'):
--               ese estado lo produce el RPC deprecado admin_set_user_role, que escribe
--               `role` sin tocar `role_key`. Es el caso que el guard miraba mal.
--   S_ORPHAN    staff SIN auth_user_id — el caso STAFF_NOT_LINKED
--   CAT_SUGGEST categoría que sugiere 'ita_manager' — la sugerencia vigente
--   CAT_OTHER   categoría que sugiere 'tax_senior' — para el caso de sugerencia cambiada

BEGIN;

-- ── Fixtures ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a5c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'sync-test-' || n || '@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 5) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- role + role_key explícitos en todas: `role` tiene DEFAULT 'staff', y este suite depende
-- justamente de la relación entre ambas columnas.
INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a5c00000-0000-4000-8000-000000000001', 'admin',  'admin'),      -- U_ADMIN
  ('a5c00000-0000-4000-8000-000000000002', 'staff',  'assistant'),  -- U_PLAIN
  ('a5c00000-0000-4000-8000-000000000003', 'staff',  'assistant'),  -- U_TARGET
  ('a5c00000-0000-4000-8000-000000000004', 'admin',  'admin'),      -- U_ADMIN_KEY
  -- U_ADMIN_LEG: admin por el enum, NO por role_key. Producible hoy con admin_set_user_role.
  ('a5c00000-0000-4000-8000-000000000005', 'admin',  'senior');

-- Categorías con sugerencia. La práctica code=1 (Auditoría) la siembra el harness.
INSERT INTO public.categories (category_id, practica_id, category_name, display_order,
                               rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd,
                               default_role_key)
VALUES
  ('c5c00000-0000-4000-8000-000000000001',
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   'SYNC Cat Sugiere', 900, 0, 0, 0, 0, 'ita_manager'),
  ('c5c00000-0000-4000-8000-000000000002',
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   'SYNC Cat Otra', 901, 0, 0, 0, 0, 'tax_senior');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id, category_id)
VALUES
  -- S_TARGET → U_TARGET, categoría que sugiere ita_manager
  ('55c00000-0000-4000-8000-000000000001', 'a5c00000-0000-4000-8000-000000000003',
   'SYNC', 'Target', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
   'c5c00000-0000-4000-8000-000000000001'),
  -- S_ADMIN_KEY → U_ADMIN_KEY
  ('55c00000-0000-4000-8000-000000000002', 'a5c00000-0000-4000-8000-000000000004',
   'SYNC', 'AdminKey', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
   'c5c00000-0000-4000-8000-000000000001'),
  -- S_ADMIN_LEG → U_ADMIN_LEG
  ('55c00000-0000-4000-8000-000000000003', 'a5c00000-0000-4000-8000-000000000005',
   'SYNC', 'AdminLegacy', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
   'c5c00000-0000-4000-8000-000000000001'),
  -- S_ORPHAN: sin cuenta vinculada
  ('55c00000-0000-4000-8000-000000000004', NULL,
   'SYNC', 'Orphan', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
   'c5c00000-0000-4000-8000-000000000001');

CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

-- ── Grupo 0 — el CHECK de esquema, antes de tocar la función ────────────────
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    UPDATE public.categories SET default_role_key = 'admin'
     WHERE category_id = 'c5c00000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'TEST FAIL — categories.default_role_key aceptó ''admin'' (falta el CHECK categories_default_role_key_not_admin)';
  END IF;
  RAISE NOTICE 'PASS — el esquema impide que una categoría sugiera ''admin'' (CHECK), no solo la UI';
END $$;

-- ── Grupos 1..N — como usuario de la app ───────────────────────────────────
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_res         jsonb;
  v_res_admin   jsonb;
  v_role        app_role;
  v_role_key    text;
  v_audit_count integer;
BEGIN
  -- ── 1. Autorización: un no-admin no obtiene NADA, ni siquiera un oráculo ──
  -- La función es SECURITY DEFINER (saltea RLS) y está concedida a authenticated. Sin el
  -- guard, sus respuestas distinguían destino-admin (ADMIN_PROTECTED) de destino-normal
  -- (NOT_ADMIN), permitiendo enumerar administradores; y STAFF_NOT_LINKED delataba si un
  -- staff tiene cuenta, dato que staff_directory excluye por PII.
  PERFORM pg_temp.impersonate('a5c00000-0000-4000-8000-000000000002');  -- U_PLAIN

  v_res := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-000000000001', 'ita_manager', 'test');
  IF v_res->>'code' <> 'NOT_ADMIN' THEN
    RAISE EXCEPTION 'TEST FAIL — un no-admin obtuvo % en vez de NOT_ADMIN', v_res->>'code';
  END IF;

  v_res_admin := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-000000000002', 'ita_manager', 'test');
  IF v_res_admin->>'code' <> 'NOT_ADMIN' THEN
    RAISE EXCEPTION 'TEST FAIL — un no-admin obtuvo % contra un destino admin', v_res_admin->>'code';
  END IF;

  -- Lo que cierra la fuga: la respuesta es IDÉNTICA para un destino admin y uno normal.
  IF v_res->>'code' IS DISTINCT FROM v_res_admin->>'code' THEN
    RAISE EXCEPTION 'TEST FAIL — la respuesta distingue destino admin de destino normal: oráculo de enumeración';
  END IF;
  RAISE NOTICE 'PASS — un no-admin recibe NOT_ADMIN, y la respuesta NO revela si el destino es admin ni si tiene cuenta';

  -- Un staff inexistente responde igual: tampoco confirma existencia.
  v_res := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-0000000000ff', 'ita_manager', 'test');
  IF v_res->>'code' <> 'NOT_ADMIN' THEN
    RAISE EXCEPTION 'TEST FAIL — un no-admin obtuvo % para un staff inexistente (fuga de existencia)', v_res->>'code';
  END IF;
  RAISE NOTICE 'PASS — el guard corta antes de leer, así que un staff inexistente no se distingue de uno real';

  -- ── A partir de acá, el llamante es admin ────────────────────────────────
  PERFORM pg_temp.impersonate('a5c00000-0000-4000-8000-000000000001');  -- U_ADMIN

  -- ── 2. `admin` nunca es un rol sugerible, ni por esta puerta ─────────────
  v_res := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-000000000001', 'admin', 'test');
  IF v_res->>'code' <> 'ADMIN_TARGET_FORBIDDEN' THEN
    RAISE EXCEPTION 'TEST FAIL — se aceptó ''admin'' como rol sugerido (code=%)', v_res->>'code';
  END IF;
  RAISE NOTICE 'PASS — asignar ''admin'' por sincronización de categoría se rechaza (ADMIN_TARGET_FORBIDDEN)';

  -- ── 3. Staff inexistente / sin cuenta vinculada ─────────────────────────
  v_res := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-0000000000ff', 'ita_manager', 'test');
  IF v_res->>'code' <> 'STAFF_NOT_FOUND' THEN
    RAISE EXCEPTION 'TEST FAIL — staff inexistente devolvió %', v_res->>'code';
  END IF;
  RAISE NOTICE 'PASS — un staff inexistente devuelve STAFF_NOT_FOUND';

  v_res := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-000000000004', 'ita_manager', 'test');
  IF v_res->>'code' <> 'STAFF_NOT_LINKED' THEN
    RAISE EXCEPTION 'TEST FAIL — staff sin cuenta devolvió %', v_res->>'code';
  END IF;
  RAISE NOTICE 'PASS — un staff sin cuenta vinculada devuelve STAFF_NOT_LINKED';

  -- ── 4. La sugerencia vigente manda, no la que mandó el cliente ──────────
  -- Simula que otro admin editó la categoría (o movió al staff) mientras el diálogo
  -- estaba abierto: se RECHAZA en vez de aplicar la sugerencia nueva, porque el admin
  -- confirmó otra cosa y nadie debe terminar con un rol que no vio.
  v_res := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-000000000001', 'tax_senior', 'test');
  IF v_res->>'code' <> 'CATEGORY_SUGGESTION_CHANGED' THEN
    RAISE EXCEPTION 'TEST FAIL — un rol que la categoría NO sugiere devolvió %', v_res->>'code';
  END IF;
  RAISE NOTICE 'PASS — un rol distinto del que sugiere la categoría vigente se rechaza (CATEGORY_SUGGESTION_CHANGED)';

  UPDATE public.staff SET category_id = 'c5c00000-0000-4000-8000-000000000002'
   WHERE staff_id = '55c00000-0000-4000-8000-000000000001';
  v_res := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-000000000001', 'ita_manager', 'test');
  IF v_res->>'code' <> 'CATEGORY_SUGGESTION_CHANGED' THEN
    RAISE EXCEPTION 'TEST FAIL — con la categoría del staff cambiada se devolvió %', v_res->>'code';
  END IF;
  RAISE NOTICE 'PASS — si la CATEGORÍA del staff cambió, la sugerencia vieja ya no se aplica';
  UPDATE public.staff SET category_id = 'c5c00000-0000-4000-8000-000000000001'
   WHERE staff_id = '55c00000-0000-4000-8000-000000000001';

  -- ── 5. Nunca degrada a un admin — por CUALQUIERA de sus dos representaciones ──
  v_res := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-000000000002', 'ita_manager', 'test');
  IF v_res->>'code' <> 'ADMIN_PROTECTED' THEN
    RAISE EXCEPTION 'TEST FAIL — un admin por role_key se pudo degradar (code=%)', v_res->>'code';
  END IF;
  RAISE NOTICE 'PASS — un destino admin por role_key no se degrada (ADMIN_PROTECTED)';

  -- El caso que el guard miraba mal: role='admin' con role_key='senior'. Lo produce el
  -- RPC deprecado admin_set_user_role, que escribe el enum sin tocar role_key.
  v_res := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-000000000003', 'ita_manager', 'test');
  IF v_res->>'code' <> 'ADMIN_PROTECTED' THEN
    RAISE EXCEPTION 'TEST FAIL — un admin SOLO por el enum legacy se pudo degradar (code=%)', v_res->>'code';
  END IF;
  SELECT role, role_key INTO v_role, v_role_key
    FROM public.user_roles WHERE user_id = 'a5c00000-0000-4000-8000-000000000005';
  IF v_role <> 'admin' OR v_role_key <> 'senior' THEN
    RAISE EXCEPTION 'TEST FAIL — el rechazo alteró la fila del admin legacy (role=%, role_key=%)', v_role, v_role_key;
  END IF;
  RAISE NOTICE 'PASS — un destino admin SOLO por el enum legacy tampoco se degrada, y su fila queda intacta';

  -- ── 6. Camino feliz: escribe AMBAS columnas y deja auditoría ────────────
  SELECT count(*) INTO v_audit_count FROM public.user_lifecycle_audit_log;

  v_res := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-000000000001', 'ita_manager', 'Category change sync');
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST FAIL — el camino feliz falló con code=%', v_res->>'code';
  END IF;

  SELECT role, role_key INTO v_role, v_role_key
    FROM public.user_roles WHERE user_id = 'a5c00000-0000-4000-8000-000000000003';
  IF v_role_key <> 'ita_manager' THEN
    RAISE EXCEPTION 'TEST FAIL — role_key quedó en % en vez de ita_manager', v_role_key;
  END IF;
  -- El espejo legacy: ita_manager mapea a `manager` (nivel jerárquico), y de eso dependen
  -- las políticas RLS que todavía usan has_role().
  IF v_role <> 'manager' THEN
    RAISE EXCEPTION 'TEST FAIL — el enum legacy quedó en % en vez de manager', v_role;
  END IF;
  RAISE NOTICE 'PASS — el camino feliz escribe role_key Y espeja el enum legacy vía admin_set_user_role_key';

  IF (SELECT count(*) FROM public.user_lifecycle_audit_log) <> v_audit_count + 1 THEN
    RAISE EXCEPTION 'TEST FAIL — el cambio de rol no dejó exactamente una fila de auditoría';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_lifecycle_audit_log
     WHERE target_user_id = 'a5c00000-0000-4000-8000-000000000003'
       AND action = 'role_key_change'
       AND reason = 'Category change sync'
       AND new_role_key = 'ita_manager'
  ) THEN
    RAISE EXCEPTION 'TEST FAIL — la auditoría no registró el cambio con su motivo';
  END IF;
  RAISE NOTICE 'PASS — el cambio queda auditado como role_key_change con el motivo recibido';

  -- ── 7. Idempotencia: repetir no vuelve a escribir ni a auditar ──────────
  -- La categoría sigue sugiriendo ita_manager y el destino ya lo tiene: delega y
  -- admin_set_user_role_key responde ALREADY_SET sin tocar nada.
  SELECT count(*) INTO v_audit_count FROM public.user_lifecycle_audit_log;
  v_res := public.sync_user_role_from_category(
    '55c00000-0000-4000-8000-000000000001', 'ita_manager', 'Category change sync');
  IF v_res->>'code' <> 'ALREADY_SET' THEN
    RAISE EXCEPTION 'TEST FAIL — repetir la sincronización devolvió % en vez de ALREADY_SET', v_res->>'code';
  END IF;
  IF (SELECT count(*) FROM public.user_lifecycle_audit_log) <> v_audit_count THEN
    RAISE EXCEPTION 'TEST FAIL — repetir la sincronización agregó una fila de auditoría';
  END IF;
  RAISE NOTICE 'PASS — repetir la sincronización es un no-op (ALREADY_SET) y no ensucia la auditoría';

  RAISE NOTICE 'SYNC USER ROLE FROM CATEGORY: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
