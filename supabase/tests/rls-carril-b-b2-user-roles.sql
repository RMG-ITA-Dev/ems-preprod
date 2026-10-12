-- Carril B / B2 — RLS de lectura de public.user_roles (BAR-001, lectura)
-- (20261012120000_rls_carril_b2_user_roles.sql)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de aplicar la migración de B2.
-- Transacción única, SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo, terminando
-- en "B2 USER_ROLES: ALL CHECKS PASSED (rolled back)".
--
-- A diferencia de B1 (RPC SECURITY DEFINER, que no depende del rol de Postgres), aquí lo que se prueba
-- ES la RLS, que se evalúa contra el rol de la sesión: las lecturas y escrituras de cada usuario
-- corren con `SET LOCAL ROLE authenticated` (o `anon`) de verdad, más el claim JWT del usuario.
-- La política decide por auth.uid(), que en el harness lee request.jwt.claims (00-shim-auth.sql).
--
-- Cada denegación tiene su contraparte de no-vacuidad: el MISMO usuario ve más filas al darle el
-- permiso, o el estado previo se verifica intacto después del rechazo, de modo que quitar la política
-- o cambiar su regla hace fallar la suite en vez de pasar en falso.
--
-- Fixture world (ids con prefijo b2):
--   U1 admin                role_key admin               — rol legacy admin; tiene user_role.read
--   U2 it_security_manager  role_key it_security_manager — NO es admin; tiene user_role.read
--   U3 assistant            role_key assistant           — sin user_role.read
--   U4 manager              role_key manager             — sin user_role.read
--   U5 risk_partner         role_key risk_partner        — sin user_role.read

BEGIN;

-- ── Fixtures (como owner) ─────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id) VALUES
  ('a0b20000-0000-4000-8000-000000000001'),
  ('a0b20000-0000-4000-8000-000000000002'),
  ('a0b20000-0000-4000-8000-000000000003'),
  ('a0b20000-0000-4000-8000-000000000004'),
  ('a0b20000-0000-4000-8000-000000000005');

-- role (enum legacy) y role_key (RBAC) se declaran por separado: is_admin() lee role,
-- has_permission() lee role_key. it_security_manager no existe en el enum: se mapea a 'manager',
-- como hace el catálogo del harness (40-fixture-rbac-catalog.sql).
INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0b20000-0000-4000-8000-000000000001', 'admin',   'admin'),
  ('a0b20000-0000-4000-8000-000000000002', 'manager', 'it_security_manager'),
  ('a0b20000-0000-4000-8000-000000000003', 'staff',   'assistant'),
  ('a0b20000-0000-4000-8000-000000000004', 'manager', 'manager'),
  ('a0b20000-0000-4000-8000-000000000005', 'partner', 'risk_partner');

-- ── Helpers (temp; se van con la sesión) ──────────────────────────────────────────────────────

-- Filas de user_roles que ve `p_sub` con el rol authenticated real. p_sub NULL = sin sesión
-- (claims vacíos, auth.uid() NULL).
CREATE FUNCTION pg_temp.ids_seen(p_sub text) RETURNS uuid[]
LANGUAGE plpgsql AS $$
DECLARE v uuid[];
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN ''
         ELSE json_build_object('sub', p_sub, 'role', 'authenticated')::text END, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT coalesce(array_agg(user_id ORDER BY user_id), '{}') INTO v FROM public.user_roles;
  EXECUTE 'RESET ROLE';
  RETURN v;
END $$;

-- Ejecuta una sentencia con el rol authenticated real y el claim de `p_sub`; devuelve el SQLERRM
-- con que falló (NULL si tuvo éxito). El sub-bloque EXCEPTION deshace cualquier efecto parcial.
CREATE FUNCTION pg_temp.try_as(p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql;
  EXECUTE 'RESET ROLE';
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  RETURN SQLERRM;
END $$;

DO $$
DECLARE
  u1 constant text := 'a0b20000-0000-4000-8000-000000000001';
  u2 constant text := 'a0b20000-0000-4000-8000-000000000002';
  u3 constant text := 'a0b20000-0000-4000-8000-000000000003';
  u4 constant text := 'a0b20000-0000-4000-8000-000000000004';
  u5 constant text := 'a0b20000-0000-4000-8000-000000000005';
  v_total  int;
  v_ids    uuid[];
  v_err    text;
  v_key    text;
  v_n      int;
BEGIN
  SELECT count(*) INTO v_total FROM public.user_roles;

  -- 1. Estructura: RLS activa sin FORCE y una sola política de lectura para authenticated ──────
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_roles'::regclass) THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — user_roles sin RLS';
  END IF;
  IF (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.user_roles'::regclass) THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — user_roles con FORCE RLS: las funciones SECURITY DEFINER dejarían de leerla';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — se esperaba 1 política en user_roles y hay %', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'user_roles'
                    AND policyname = 'user_roles_select' AND cmd = 'SELECT'
                    AND roles::text = '{authenticated}') THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — la política debe ser user_roles_select, SELECT, TO authenticated';
  END IF;
  RAISE NOTICE 'PASS — estructura: RLS activa, sin FORCE, una política SELECT TO authenticated';

  -- 2. Cada uno ve solo su fila ─────────────────────────────────────────────────────────────────
  FOREACH v_key IN ARRAY ARRAY[u3, u4, u5] LOOP
    v_ids := pg_temp.ids_seen(v_key);
    IF v_ids IS DISTINCT FROM ARRAY[v_key::uuid] THEN
      RAISE EXCEPTION 'B2 USER_ROLES FAIL — % debía ver solo su fila y ve % filas (%)',
        v_key, coalesce(array_length(v_ids, 1), 0), v_ids;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — assistant, manager y risk_partner ven únicamente su propia fila';

  -- 3. Admin y user_role.read ven todas ──────────────────────────────────────────────────────────
  IF coalesce(array_length(pg_temp.ids_seen(u1), 1), 0) <> v_total THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — el admin debía ver las % filas', v_total;
  END IF;
  IF coalesce(array_length(pg_temp.ids_seen(u2), 1), 0) <> v_total THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — it_security_manager (user_role.read) debía ver las % filas', v_total;
  END IF;
  RAISE NOTICE 'PASS — admin e it_security_manager (user_role.read) ven las % filas', v_total;

  -- 4. No-vacuidad: la visibilidad total sale del permiso (y del rol admin), no de la identidad ─
  -- Sin user_role.read, it_security_manager (que no es admin) pasa a ver solo la suya...
  DELETE FROM public.authorization_role_permissions
   WHERE role_key = 'it_security_manager' AND permission_key = 'user_role.read';
  IF pg_temp.ids_seen(u2) IS DISTINCT FROM ARRAY[u2::uuid] THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — sin user_role.read, it_security_manager debía ver solo su fila';
  END IF;
  -- ...y al devolvérselo vuelve a ver todas.
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  VALUES ('it_security_manager', 'user_role.read', 'none')
  ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;
  IF coalesce(array_length(pg_temp.ids_seen(u2), 1), 0) <> v_total THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — con user_role.read restituido debía volver a ver las % filas', v_total;
  END IF;
  -- El admin conserva la vista completa aunque su rol_key perdiera user_role.read: lo cubre is_admin().
  DELETE FROM public.authorization_role_permissions
   WHERE role_key = 'admin' AND permission_key = 'user_role.read';
  IF coalesce(array_length(pg_temp.ids_seen(u1), 1), 0) <> v_total THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — el admin debía conservar la vista completa vía is_admin()';
  END IF;
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  VALUES ('admin', 'user_role.read', 'none')
  ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;
  RAISE NOTICE 'PASS — la visibilidad total depende de user_role.read (o del rol admin), no de la identidad';

  -- 5. Sin sesión (authenticated con claims vacíos) no ve nada ─────────────────────────────────
  IF pg_temp.ids_seen(NULL) <> '{}'::uuid[] THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — authenticated sin sub (auth.uid() NULL) no debía ver filas';
  END IF;
  RAISE NOTICE 'PASS — sin sesión no se ve ninguna fila';

  -- 6. anon real: sin privilegio de lectura ──────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM count(*) FROM public.user_roles;
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — anon pudo leer user_roles';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
  END;
  RAISE NOTICE 'PASS — anon recibe permission denied';

  -- 7. Escritura: ni el propio usuario ni el admin escriben por la Data API ───────────────────────
  v_err := pg_temp.try_as(u3, format('UPDATE public.user_roles SET role_key = %L WHERE user_id = %L', 'admin', u3));
  IF v_err IS NULL OR v_err NOT ILIKE '%permission denied%' THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — el asistente pudo escribir su propio rol (err=%)', v_err;
  END IF;
  v_err := pg_temp.try_as(u1, format('UPDATE public.user_roles SET role_key = %L WHERE user_id = %L', 'admin', u3));
  IF v_err IS NULL OR v_err NOT ILIKE '%permission denied%' THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — el admin pudo escribir user_roles por la Data API (err=%)', v_err;
  END IF;
  v_err := pg_temp.try_as(u1, format('DELETE FROM public.user_roles WHERE user_id = %L', u3));
  IF v_err IS NULL OR v_err NOT ILIKE '%permission denied%' THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — el admin pudo borrar user_roles por la Data API (err=%)', v_err;
  END IF;
  IF (SELECT role_key FROM public.user_roles WHERE user_id = u3::uuid) IS DISTINCT FROM 'assistant' THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — el rol del asistente cambió pese al rechazo';
  END IF;
  RAISE NOTICE 'PASS — authenticated (incluido admin) no puede escribir user_roles; el rol del asistente sigue intacto';

  -- 8. Las funciones que leen user_roles siguen funcionando bajo RLS ───────────────────────────────
  -- Guarda estructural: toda función de public que lee user_roles es SECURITY DEFINER con el dueño
  -- de la tabla (y la tabla no usa FORCE). Una función INVOKER nueva que la lea vería solo la fila
  -- del llamador (fallo silencioso), y una DEFINER con otro dueño quedaría sujeta a RLS.
  SELECT count(*) INTO v_n
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
     AND p.prosrc ILIKE '%user_roles%' AND p.proname NOT ILIKE '%backup%'
     AND (NOT p.prosecdef
          OR p.proowner <> (SELECT relowner FROM pg_class WHERE oid = 'public.user_roles'::regclass));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — % función(es) de public leen user_roles sin ser SECURITY DEFINER del dueño de la tabla: %',
      v_n, (SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
              FROM pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
               AND p.prosrc ILIKE '%user_roles%' AND p.proname NOT ILIKE '%backup%'
               AND (NOT p.prosecdef
                    OR p.proowner <> (SELECT relowner FROM pg_class WHERE oid = 'public.user_roles'::regclass)));
  END IF;
  -- Runtime: desde un usuario que NO ve filas ajenas, has_permission()/is_admin() siguen leyendo su rol.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF NOT public.is_admin() OR NOT public.has_permission('user_role.read') THEN
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — is_admin()/has_permission() del admin dejaron de funcionar bajo RLS';
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF public.is_admin() OR public.has_permission('user_role.read') THEN
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'B2 USER_ROLES FAIL — el asistente no debía ser admin ni tener user_role.read';
  END IF;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS — funciones DEFINER intactas bajo RLS (0 INVOKER ni DEFINER con otro dueño); is_admin()/has_permission() correctos';

  RAISE NOTICE 'B2 USER_ROLES: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
