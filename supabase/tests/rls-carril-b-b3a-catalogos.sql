-- Carril B / B3a — RLS en los cuatro catálogos de configuración
-- (20261012130000_rls_carril_b3a_catalogos.sql: activity_codes, categories, expense_types, industries)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de aplicar la migración de B3a.
-- Transacción única, SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo, terminando
-- en "B3a CATALOGOS: ALL CHECKS PASSED (rolled back)".
--
-- Lo que se prueba ES la RLS, que se evalúa contra el rol de la sesión: todo corre con
-- `SET LOCAL ROLE authenticated` (o `anon`) de verdad más el claim JWT del usuario (auth.uid() lee
-- request.jwt.claims en el harness, 00-shim-auth.sql).
--
-- Cada denegación tiene su contraparte de no-vacuidad: el MISMO usuario escribe al darle el permiso
-- (y deja de poder al quitárselo), y el estado previo se verifica intacto después del rechazo, de modo
-- que quitar la política o activar el permiso por defecto hace fallar la suite en vez de pasar en falso.
--
-- Fixture world (ids con prefijo b3a):
--   U1 admin               — is_admin() y todos los permisos de catálogo
--   U2 accounting_analyst  — expense_type.create/update/delete; SIN permisos de los otros tres
--   U3 assistant           — sin permisos de escritura de catálogos
--   U4 manager             — sin permisos de escritura de catálogos
--   Una fila semilla por tabla, para probar UPDATE/DELETE (RLS las oculta en vez de dar error)

BEGIN;

-- ── Fixtures (como owner) ─────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id) VALUES
  ('a0b3a000-0000-4000-8000-000000000001'),
  ('a0b3a000-0000-4000-8000-000000000002'),
  ('a0b3a000-0000-4000-8000-000000000003'),
  ('a0b3a000-0000-4000-8000-000000000004');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0b3a000-0000-4000-8000-000000000001', 'admin',   'admin'),
  ('a0b3a000-0000-4000-8000-000000000002', 'staff',   'accounting_analyst'),
  ('a0b3a000-0000-4000-8000-000000000003', 'staff',   'assistant'),
  ('a0b3a000-0000-4000-8000-000000000004', 'manager', 'manager');

-- La práctica code=1 la siembra el runner (varias suites la asumen). activity_codes y categories la
-- necesitan: activity_codes_practica_id_or_system y categories.practica_id NOT NULL.
INSERT INTO public.industries (industry_name, fiscal_year_end) VALUES ('B3a semilla industria', '31 de diciembre');
INSERT INTO public.expense_types (expense_name) VALUES ('B3a semilla gasto');
INSERT INTO public.activity_codes (activity_code, description, practica_id, entity_type)
SELECT 'B3A-S', 'B3a semilla actividad', practica_id, 'A' FROM public.practicas WHERE code = 1;
INSERT INTO public.categories (category_name, practica_id, display_order)
SELECT 'B3a semilla categoria', practica_id, 9000 FROM public.practicas WHERE code = 1;

-- ── Helpers (temp; se van con la sesión) ──────────────────────────────────────────────────────

-- Filas que ve `p_sub` en una tabla, con el rol authenticated real.
CREATE FUNCTION pg_temp.count_as(p_sub text, p_table text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO n;
  EXECUTE 'RESET ROLE';
  RETURN n;
END $$;

-- Ejecuta una sentencia con el rol authenticated real y el claim de `p_sub`; devuelve el SQLERRM con
-- que falló (NULL si tuvo éxito). El sub-bloque EXCEPTION deshace cualquier efecto parcial.
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

-- Filas que alcanza un UPDATE/DELETE de `p_sub`. RLS no da error: oculta las filas (0 afectadas).
-- Devuelve -1 si la sentencia falló (p. ej. por privilegio de tabla).
CREATE FUNCTION pg_temp.rows_as(p_sub text, p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  RETURN -1;
END $$;

DO $$
DECLARE
  u1 constant text := 'a0b3a000-0000-4000-8000-000000000001';
  u2 constant text := 'a0b3a000-0000-4000-8000-000000000002';
  u3 constant text := 'a0b3a000-0000-4000-8000-000000000003';
  u4 constant text := 'a0b3a000-0000-4000-8000-000000000004';
  v_pr    uuid := (SELECT practica_id FROM public.practicas WHERE code = 1);
  v_err   text;
  v_n     bigint;
  v_who   text;
  t       text;
  tablas  constant text[] := ARRAY['activity_codes', 'categories', 'expense_types', 'industries'];
  ins     jsonb;
  upd     jsonb;
  del     jsonb;
  v_tot   bigint;
BEGIN
  -- INSERT de prueba (nombres únicos por llamador) y UPDATE/DELETE sobre la fila semilla.
  ins := jsonb_build_object(
    'activity_codes', format('INSERT INTO public.activity_codes (activity_code, description, practica_id, entity_type) VALUES (%L, %L, %L, %L)', 'B3A-X', 'b3a insert', v_pr, 'A'),
    'categories',     format('INSERT INTO public.categories (category_name, practica_id, display_order) VALUES (%L, %L, 9001)', 'b3a insert categoria', v_pr),
    'expense_types',  format('INSERT INTO public.expense_types (expense_name) VALUES (%L)', 'b3a insert gasto'),
    'industries',     format('INSERT INTO public.industries (industry_name, fiscal_year_end) VALUES (%L, %L)', 'b3a insert industria', '31 de diciembre'));
  upd := jsonb_build_object(
    'activity_codes', 'UPDATE public.activity_codes SET description = ''b3a editada'' WHERE activity_code = ''B3A-S''',
    'categories',     'UPDATE public.categories SET category_name = ''b3a editada'' WHERE category_name = ''B3a semilla categoria''',
    'expense_types',  'UPDATE public.expense_types SET expense_name = ''b3a editada'' WHERE expense_name = ''B3a semilla gasto''',
    'industries',     'UPDATE public.industries SET industry_name = ''b3a editada'' WHERE industry_name = ''B3a semilla industria''');
  del := jsonb_build_object(
    'activity_codes', 'DELETE FROM public.activity_codes WHERE activity_code = ''B3A-S''',
    'categories',     'DELETE FROM public.categories WHERE category_name = ''B3a semilla categoria''',
    'expense_types',  'DELETE FROM public.expense_types WHERE expense_name = ''B3a semilla gasto''',
    'industries',     'DELETE FROM public.industries WHERE industry_name = ''B3a semilla industria''');

  -- 1. Estructura: RLS activa en las cuatro ─────────────────────────────────────────────────────
  FOREACH t IN ARRAY tablas LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass) THEN
      RAISE EXCEPTION 'B3a CATALOGOS FAIL — % sin RLS', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — RLS activa en activity_codes, categories, expense_types e industries';

  -- 2. La lectura NO cambió: todos los roles ven todas las filas ──────────────────────────────────
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_tot;
    FOREACH v_who IN ARRAY ARRAY[u1, u2, u3, u4] LOOP
      IF pg_temp.count_as(v_who, t) <> v_tot THEN
        RAISE EXCEPTION 'B3a CATALOGOS FAIL — % debía ver las % filas de % y ve %',
          v_who, v_tot, t, pg_temp.count_as(v_who, t);
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS — lectura intacta: admin, accounting_analyst, assistant y manager ven todas las filas de las cuatro';

  -- 3. Escritura denegada a quien no tiene el permiso ───────────────────────────────────────────
  FOREACH t IN ARRAY tablas LOOP
    FOREACH v_who IN ARRAY ARRAY[u3, u4] LOOP
      v_err := pg_temp.try_as(v_who, ins ->> t);
      IF v_err IS NULL OR v_err NOT ILIKE '%row-level security%' THEN
        RAISE EXCEPTION 'B3a CATALOGOS FAIL — % pudo insertar en % (err=%)', v_who, t, v_err;
      END IF;
      IF pg_temp.rows_as(v_who, upd ->> t) <> 0 THEN
        RAISE EXCEPTION 'B3a CATALOGOS FAIL — % alcanzó una fila de % con UPDATE', v_who, t;
      END IF;
      IF pg_temp.rows_as(v_who, del ->> t) <> 0 THEN
        RAISE EXCEPTION 'B3a CATALOGOS FAIL — % alcanzó una fila de % con DELETE', v_who, t;
      END IF;
    END LOOP;
  END LOOP;
  -- accounting_analyst solo escribe expense_types: en las otras tres queda denegado.
  FOREACH t IN ARRAY ARRAY['activity_codes', 'categories', 'industries'] LOOP
    v_err := pg_temp.try_as(u2, ins ->> t);
    IF v_err IS NULL OR v_err NOT ILIKE '%row-level security%' THEN
      RAISE EXCEPTION 'B3a CATALOGOS FAIL — accounting_analyst pudo insertar en % (err=%)', t, v_err;
    END IF;
    IF pg_temp.rows_as(u2, upd ->> t) <> 0 THEN
      RAISE EXCEPTION 'B3a CATALOGOS FAIL — accounting_analyst alcanzó una fila de % con UPDATE', t;
    END IF;
  END LOOP;
  -- Estado previo intacto tras los rechazos.
  IF NOT EXISTS (SELECT 1 FROM public.industries   WHERE industry_name = 'B3a semilla industria')
     OR NOT EXISTS (SELECT 1 FROM public.expense_types WHERE expense_name = 'B3a semilla gasto')
     OR NOT EXISTS (SELECT 1 FROM public.activity_codes WHERE activity_code = 'B3A-S' AND description = 'B3a semilla actividad')
     OR NOT EXISTS (SELECT 1 FROM public.categories WHERE category_name = 'B3a semilla categoria') THEN
    RAISE EXCEPTION 'B3a CATALOGOS FAIL — alguna fila semilla cambió pese a los rechazos';
  END IF;
  RAISE NOTICE 'PASS — assistant y manager no insertan, editan ni borran; accounting_analyst solo toca expense_types; semillas intactas';

  -- 4. Contraparte: quien tiene el permiso sí escribe ────────────────────────────────────────────
  FOREACH t IN ARRAY tablas LOOP
    v_err := pg_temp.try_as(u1, ins ->> t);
    IF v_err IS NOT NULL THEN
      RAISE EXCEPTION 'B3a CATALOGOS FAIL — el admin no pudo insertar en % (err=%)', t, v_err;
    END IF;
    IF pg_temp.rows_as(u1, upd ->> t) <> 1 THEN
      RAISE EXCEPTION 'B3a CATALOGOS FAIL — el admin debía editar la fila semilla de % (1 fila)', t;
    END IF;
  END LOOP;
  v_err := pg_temp.try_as(u2, format('INSERT INTO public.expense_types (expense_name) VALUES (%L)', 'b3a contable'));
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'B3a CATALOGOS FAIL — accounting_analyst (expense_type.create) no pudo insertar (err=%)', v_err;
  END IF;
  IF pg_temp.rows_as(u2, 'UPDATE public.expense_types SET expense_name = ''b3a contable editada'' WHERE expense_name = ''b3a contable''') <> 1 THEN
    RAISE EXCEPTION 'B3a CATALOGOS FAIL — accounting_analyst (expense_type.update) no pudo editar';
  END IF;
  RAISE NOTICE 'PASS — admin escribe las cuatro; accounting_analyst escribe expense_types';

  -- 5. No-vacuidad: la escritura sale del permiso, no de la identidad ────────────────────────────
  -- Un asistente sin permiso no edita industries...
  IF pg_temp.rows_as(u3, 'UPDATE public.industries SET fiscal_year_end = ''30 de junio'' WHERE industry_name = ''b3a insert industria''') <> 0 THEN
    RAISE EXCEPTION 'B3a CATALOGOS FAIL — el asistente editó industries sin permiso';
  END IF;
  -- ...al darle industry.update, sí...
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  VALUES ('assistant', 'industry.update', 'none')
  ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;
  IF pg_temp.rows_as(u3, 'UPDATE public.industries SET fiscal_year_end = ''30 de junio'' WHERE industry_name = ''b3a insert industria''') <> 1 THEN
    RAISE EXCEPTION 'B3a CATALOGOS FAIL — con industry.update el asistente debía poder editar industries';
  END IF;
  -- ...y al quitárselo, vuelve a no poder.
  DELETE FROM public.authorization_role_permissions WHERE role_key = 'assistant' AND permission_key = 'industry.update';
  IF pg_temp.rows_as(u3, 'UPDATE public.industries SET fiscal_year_end = ''31 de diciembre'' WHERE industry_name = ''b3a insert industria''') <> 0 THEN
    RAISE EXCEPTION 'B3a CATALOGOS FAIL — sin industry.update el asistente volvió a poder editar industries';
  END IF;
  -- Lo mismo para crear (WITH CHECK de INSERT).
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  VALUES ('assistant', 'industry.create', 'none')
  ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;
  v_err := pg_temp.try_as(u3, format('INSERT INTO public.industries (industry_name, fiscal_year_end) VALUES (%L, %L)', 'b3a asistente con permiso', '31 de diciembre'));
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'B3a CATALOGOS FAIL — con industry.create el asistente debía poder insertar (err=%)', v_err;
  END IF;
  DELETE FROM public.authorization_role_permissions WHERE role_key = 'assistant' AND permission_key = 'industry.create';
  RAISE NOTICE 'PASS — la escritura depende del permiso (se concede y se retira) y no de la identidad';

  -- 6. anon real: sin privilegio sobre las cuatro ────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t);
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION 'B3a CATALOGOS FAIL — anon pudo leer %', t;
    EXCEPTION WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
    END;
  END LOOP;
  RAISE NOTICE 'PASS — anon recibe permission denied en las cuatro';

  -- 7. Guarda estructural: ninguna función INVOKER escribe estos catálogos ─────────────────────────
  -- Las escrituras legítimas fuera de la Data API (create_category_for_practice, move_category,
  -- create_practice_activity...) son SECURITY DEFINER y saltan RLS. Una función INVOKER nueva que
  -- escriba aquí quedaría sujeta a las políticas por permiso y fallaría en silencio para quien no lo tenga.
  SELECT count(*) INTO v_n
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND NOT p.prosecdef
     AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?(activity_codes|expense_types|industries|categories)\M';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'B3a CATALOGOS FAIL — % función(es) INVOKER escriben catálogos: %', v_n,
      (SELECT string_agg(p.proname, ', ' ORDER BY p.proname) FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND NOT p.prosecdef
          AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?(activity_codes|expense_types|industries|categories)\M');
  END IF;
  RAISE NOTICE 'PASS — 0 funciones INVOKER escriben los catálogos';

  RAISE NOTICE 'B3a CATALOGOS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
