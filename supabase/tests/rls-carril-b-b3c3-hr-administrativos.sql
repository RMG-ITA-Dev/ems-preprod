-- Carril B / B3c-3 — hr_manager y hr_analyst ven y administran TODOS los encargos Administrativa, Capacitación y Calidad
-- (funcion <> 1) (20261012180000_rls_carril_b3c3_hr_encargos_administrativos.sql)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de B3c. Transacción única, SIEMPRE hace ROLLBACK.
-- Salida de éxito: una NOTICE por chequeo, terminando en "B3c-3 HR ADMINISTRATIVOS: ALL CHECKS PASSED (rolled back)".
--
-- Lo que se prueba ES la RLS y la RPC: todo corre con `SET LOCAL ROLE authenticated` real más el claim JWT del usuario.
-- Cada permiso tiene su contraparte de no-vacuidad: la visibilidad cambia al quitar y devolver el permiso, y un gerente
-- (control) no gana nada.
--
-- Fixture world (ids con prefijo b3c3): H1 hr_manager, H2 hr_analyst, M1 manager (control).
--   EA administrativo (funcion 0) y EC capacitación (2), creados por NADIE de los tres; EH administrativo que creó H1;
--   ECL encargo de CLIENTE (funcion 1), que NO debe cambiar.
-- Los encargos se insertan con los triggers de réplica apagados (el harness corre como superusuario): sus reglas
-- (cliente interno por sociedad, perfil) no son lo que se prueba aquí y exigirían un fixture de sociedades completo.

BEGIN;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1b3c300-0000-4000-8000-000000000001', 'B3c3 Cliente', 'B3C3-TAX-001');

INSERT INTO auth.users (id) VALUES
  ('a0b3c300-0000-4000-8000-000000000001'), ('a0b3c300-0000-4000-8000-000000000002'), ('a0b3c300-0000-4000-8000-000000000003');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0b3c300-0000-4000-8000-000000000001', 'staff',   'hr_manager'),
  ('a0b3c300-0000-4000-8000-000000000002', 'staff',   'hr_analyst'),
  ('a0b3c300-0000-4000-8000-000000000003', 'manager', 'manager');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
SELECT ('50b3c300-0000-4000-8000-00000000000' || n)::uuid, ('a0b3c300-0000-4000-8000-00000000000' || n)::uuid,
       'U' || n, 'B3c3',
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1)
FROM (VALUES ('1'), ('2'), ('3')) AS v(n);

SET LOCAL session_replication_role = replica;
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, funcion, practica, fecha_cierre,
                                work_order_required, approval_required, society_id, created_by_staff_id)
SELECT ('e0b3c300-0000-4000-8000-00000000000' || n)::uuid, 'c1b3c300-0000-4000-8000-000000000001', 'B3c3 ' || n, f, 1, '2027-12-31',
       false, false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1), cb
FROM (VALUES ('1', 0, NULL::uuid),                                              -- EA
             ('2', 2, NULL::uuid),                                              -- EC
             ('3', 0, '50b3c300-0000-4000-8000-000000000001'::uuid),            -- EH (lo creó H1)
             ('4', 1, NULL::uuid))                                              -- ECL (cliente)
     AS v(n, f, cb);
SET LOCAL session_replication_role = origin;

CREATE FUNCTION pg_temp.count_as(p_sub text, p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql INTO n;
  EXECUTE 'RESET ROLE';
  RETURN n;
END $$;

-- Filas que alcanza un UPDATE/DELETE (la RLS no da error: oculta las filas). -1 si falló.
CREATE FUNCTION pg_temp.rows_as(p_sub text, p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
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
  h1 constant text := 'a0b3c300-0000-4000-8000-000000000001';  -- hr_manager
  h2 constant text := 'a0b3c300-0000-4000-8000-000000000002';  -- hr_analyst
  m1 constant text := 'a0b3c300-0000-4000-8000-000000000003';  -- manager (control)
  v_who text;
  adm constant text := 'SELECT count(*) FROM public.engagements WHERE engagement_name LIKE ''B3c3 %'' AND funcion <> 1';
  cli constant text := 'SELECT count(*) FROM public.engagements WHERE engagement_name LIKE ''B3c3 %'' AND funcion = 1';
  por constant text := 'SELECT count(*) FROM (SELECT jsonb_array_elements(public.list_portfolio_engagements()) e) x WHERE x.e ->> ''engagement_name'' LIKE ''B3c3 %''';
BEGIN
  -- 1. Estructura ─────────────────────────────────────────────────────────────────────────────────
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'engagements'
        AND policyname IN ('engagements hr administrative read', 'engagements hr administrative update')) <> 2 THEN
    RAISE EXCEPTION 'B3c3 FAIL — faltan las políticas "engagements hr administrative read/update"';
  END IF;
  RAISE NOTICE 'PASS — políticas de HR para encargos administrativos presentes';

  -- 2. Lectura: HR ve los 3 administrativos (incluidos los que NO creó) y ningún encargo de cliente ───────────────
  FOREACH v_who IN ARRAY ARRAY[h1, h2] LOOP
    IF pg_temp.count_as(v_who, adm) <> 3 THEN
      RAISE EXCEPTION 'B3c3 FAIL — % debía leer los 3 administrativos y lee %', v_who, pg_temp.count_as(v_who, adm);
    END IF;
    IF pg_temp.count_as(v_who, cli) <> 0 THEN
      RAISE EXCEPTION 'B3c3 FAIL — % no debía leer el encargo de cliente', v_who;
    END IF;
  END LOOP;
  -- Control: un gerente sin relación con estos encargos no gana nada.
  IF pg_temp.count_as(m1, adm) <> 0 OR pg_temp.count_as(m1, cli) <> 0 THEN
    RAISE EXCEPTION 'B3c3 FAIL — el gerente de control no debía leer ningún encargo del fixture';
  END IF;
  RAISE NOTICE 'PASS — lectura: HR ve los 3 administrativos (también los ajenos) y ninguno de cliente; el gerente 0';

  -- 3. Edición: HR edita los 3 administrativos y ninguno de cliente; no borra ──────────────────────────────────────
  FOREACH v_who IN ARRAY ARRAY[h1, h2] LOOP
    IF pg_temp.rows_as(v_who, 'UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_name LIKE ''B3c3 %'' AND funcion <> 1') <> 3 THEN
      RAISE EXCEPTION 'B3c3 FAIL — % debía editar los 3 administrativos', v_who;
    END IF;
    IF pg_temp.rows_as(v_who, 'UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_name LIKE ''B3c3 %'' AND funcion = 1') <> 0 THEN
      RAISE EXCEPTION 'B3c3 FAIL — % editó un encargo de cliente', v_who;
    END IF;
    IF pg_temp.rows_as(v_who, 'DELETE FROM public.engagements WHERE engagement_name LIKE ''B3c3 %''') <> 0 THEN
      RAISE EXCEPTION 'B3c3 FAIL — % borró encargos (engagement.delete es solo de admin)', v_who;
    END IF;
  END LOOP;
  IF pg_temp.rows_as(m1, 'UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_name LIKE ''B3c3 %''') <> 0 THEN
    RAISE EXCEPTION 'B3c3 FAIL — el gerente de control editó encargos ajenos';
  END IF;
  -- Un HR no puede convertir un administrativo en encargo de cliente por la vía de la política (WITH CHECK).
  IF pg_temp.rows_as(h1, 'UPDATE public.engagements SET funcion = 1 WHERE engagement_name = ''B3c3 1''') > 0 THEN
    RAISE EXCEPTION 'B3c3 FAIL — HR convirtió un administrativo en encargo de cliente';
  END IF;
  RAISE NOTICE 'PASS — edición: HR edita los 3 administrativos, ninguno de cliente, no borra, no cambia funcion; el gerente 0';

  -- 4. Detalle y edición en pantalla: list_portfolio_engagements los incluye, y nada más ───────────────────────────
  FOREACH v_who IN ARRAY ARRAY[h1, h2] LOOP
    IF pg_temp.count_as(v_who, por) <> 3 THEN
      RAISE EXCEPTION 'B3c3 FAIL — list_portfolio_engagements debía dar 3 a %, da %', v_who, pg_temp.count_as(v_who, por);
    END IF;
  END LOOP;
  IF pg_temp.count_as(m1, por) <> 0 THEN
    RAISE EXCEPTION 'B3c3 FAIL — list_portfolio_engagements dio encargos al gerente de control';
  END IF;
  RAISE NOTICE 'PASS — list_portfolio_engagements: HR 3 (los de cliente no), gerente 0; espejo de la RLS';

  -- 5. No-vacuidad: la visibilidad sale del permiso ───────────────────────────────────────────────────────────────
  DELETE FROM public.authorization_role_permissions WHERE role_key = 'hr_analyst' AND permission_key = 'engagement.read';
  IF pg_temp.count_as(h2, adm) <> 0 OR pg_temp.count_as(h2, por) <> 0 THEN
    RAISE EXCEPTION 'B3c3 FAIL — sin engagement.read, hr_analyst debía perder la lectura y el listado';
  END IF;
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  VALUES ('hr_analyst', 'engagement.read', 'assigned_engagements')
  ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;
  IF pg_temp.count_as(h2, adm) <> 3 THEN
    RAISE EXCEPTION 'B3c3 FAIL — al devolver engagement.read, hr_analyst debía volver a ver los 3';
  END IF;
  DELETE FROM public.authorization_role_permissions WHERE role_key = 'hr_manager' AND permission_key = 'engagement.update';
  IF pg_temp.rows_as(h1, 'UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_name LIKE ''B3c3 %'' AND funcion <> 1') <> 0 THEN
    RAISE EXCEPTION 'B3c3 FAIL — sin engagement.update, hr_manager no debía editar ninguno (ni el que creó: la política del creador también exige el permiso)';
  END IF;
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  VALUES ('hr_manager', 'engagement.update', 'assigned_engagements')
  ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;
  IF pg_temp.rows_as(h1, 'UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_name LIKE ''B3c3 %'' AND funcion <> 1') <> 3 THEN
    RAISE EXCEPTION 'B3c3 FAIL — al devolver engagement.update, hr_manager debía volver a editar los 3';
  END IF;
  RAISE NOTICE 'PASS — la visibilidad sale de engagement.read y la edición de engagement.update (se quita y se devuelve)';

  -- 6. Privilegios de la RPC: sin EXECUTE para anon ni PUBLIC, DEFINER con search_path fijo ──────────────────────
  IF has_function_privilege('anon', 'public.list_portfolio_engagements()', 'EXECUTE')
     OR has_function_privilege('public', 'public.list_portfolio_engagements()', 'EXECUTE') THEN
    RAISE EXCEPTION 'B3c3 FAIL — anon o PUBLIC pueden ejecutar list_portfolio_engagements';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.list_portfolio_engagements()'::regprocedure
                  AND prosecdef AND 'search_path=public' = ANY (proconfig)) THEN
    RAISE EXCEPTION 'B3c3 FAIL — list_portfolio_engagements debe ser SECURITY DEFINER con search_path=public';
  END IF;
  RAISE NOTICE 'PASS — privilegios de list_portfolio_engagements';

  RAISE NOTICE 'B3c-3 HR ADMINISTRATIVOS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
