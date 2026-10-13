-- Carril B / B4 y B4b — lectura de las vistas del dueño y las dos tablas sueltas
-- (20261013140000_rls_carril_b4_vistas.sql y 20261013150000_rls_carril_b4b_sueltas.sql)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de B3e. Transacción única, SIEMPRE hace ROLLBACK.
-- Salida de éxito: una NOTICE por chequeo, terminando en "B4 VISTAS Y SUELTAS: ALL CHECKS PASSED (rolled back)".
--
-- Lo que se prueba ES la RLS, el filtro de la vista y los privilegios: todo corre con `SET LOCAL ROLE authenticated` real más el
-- claim JWT del usuario, y los helpers LIMPIAN el claim al terminar.
--
-- Fixture world (ids con prefijo b4): A admin, M gerente del encargo E1, S asistente sin relación, X gerente que CREÓ E3 sin estar
--   asignado, H hr_manager, R asistente que pidió fondos (solicitud ENVIADA) sobre la OT de E4, D analista de cobranza (alcance
--   de departamento). S además tiene un BORRADOR de solicitud sobre la OT de E5: no debe darle visibilidad.
--   E1 cliente (gerente M), E2 administrativo (funcion 0), E3 cliente (lo creó X), E4 cliente (solicitud de R), E5 cliente
--   sin nadie. Cada encargo con su OT; la de E1 aprobada.
-- Cada rama del predicado de my_visible_engagement_ids() tiene su caso, y la suite compara el conjunto con la RLS REAL de engagements:
-- si alguien cambia las políticas de engagements y no la función, falla aquí.

BEGIN;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1b40000-0000-4000-8000-000000000001', 'B4 Cliente', 'B4-TAX-001');

INSERT INTO auth.users (id)
SELECT ('a0b40000-0000-4000-8000-00000000000' || n)::uuid FROM (VALUES ('1'), ('2'), ('3'), ('4'), ('5'), ('6'), ('7')) AS v(n);

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0b40000-0000-4000-8000-000000000001', 'admin',   'admin'),
  ('a0b40000-0000-4000-8000-000000000002', 'manager', 'manager'),
  ('a0b40000-0000-4000-8000-000000000003', 'staff',   'assistant'),
  ('a0b40000-0000-4000-8000-000000000004', 'manager', 'manager'),
  ('a0b40000-0000-4000-8000-000000000005', 'staff',   'hr_manager'),
  ('a0b40000-0000-4000-8000-000000000006', 'staff',   'assistant'),
  ('a0b40000-0000-4000-8000-000000000007', 'staff',   'collections_analyst')
-- handle_new_user puede haber creado ya la fila del usuario (según el ambiente): se pisa con el rol del fixture.
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, role_key = EXCLUDED.role_key;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
SELECT ('50b40000-0000-4000-8000-00000000000' || n)::uuid, ('a0b40000-0000-4000-8000-00000000000' || n)::uuid,
       'U' || n, 'B4',
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1)
FROM (VALUES ('1'), ('2'), ('3'), ('4'), ('5'), ('6'), ('7')) AS v(n);

SET LOCAL session_replication_role = replica;
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, funcion, practica, fecha_cierre,
                                work_order_required, approval_required, society_id, manager_id, created_by_staff_id)
SELECT ('e0b40000-0000-4000-8000-00000000000' || n)::uuid, 'c1b40000-0000-4000-8000-000000000001', 'B4 ' || n, f, 1, '2027-12-31',
       false, false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1), mg, cb
FROM (VALUES ('1', 1, '50b40000-0000-4000-8000-000000000002'::uuid, NULL::uuid),   -- E1: gerente M
             ('2', 0, NULL::uuid, NULL::uuid),                                       -- E2: administrativo
             ('3', 1, NULL::uuid, '50b40000-0000-4000-8000-000000000004'::uuid),     -- E3: lo creó X
             ('4', 1, NULL::uuid, NULL::uuid),                                       -- E4: solicitud enviada de R
             ('5', 1, NULL::uuid, NULL::uuid))                                       -- E5: nadie
     AS v(n, f, mg, cb);
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status)
SELECT ('40b40000-0000-4000-8000-00000000000' || n)::uuid, ('e0b40000-0000-4000-8000-00000000000' || n)::uuid, 'BOB', 'High',
       CASE WHEN n = '1' THEN 'Approved' ELSE 'Pending_Approval' END
FROM (VALUES ('1'), ('2'), ('3'), ('4'), ('5')) AS v(n);
-- Solicitud ENVIADA de R sobre la OT de E4 (rama d) y BORRADOR de S sobre la OT de E5 (no debe dar visibilidad). El gerente de la OT en
-- ambas líneas es el admin (A): otro gerente de la OT también vería el encargo, y aquí se aísla al solicitante.
INSERT INTO public.fund_requests (fund_request_id, request_number, requester_staff_id, total_requested_amount, currency, status) VALUES
  ('f3b40000-0000-4000-8000-000000000001', 'FR-B4-1', '50b40000-0000-4000-8000-000000000006', 100, 'BOB', 'pendiente_aprobacion'),
  ('f3b40000-0000-4000-8000-000000000002', 'FR-B4-2', '50b40000-0000-4000-8000-000000000003', 100, 'BOB', 'borrador');
INSERT INTO public.fund_request_work_orders (fr_wo_id, fund_request_id, wo_id, allocated_amount, manager_staff_id) VALUES
  ('f4b40000-0000-4000-8000-000000000001', 'f3b40000-0000-4000-8000-000000000001', '40b40000-0000-4000-8000-000000000004', 100, '50b40000-0000-4000-8000-000000000001'),
  ('f4b40000-0000-4000-8000-000000000002', 'f3b40000-0000-4000-8000-000000000002', '40b40000-0000-4000-8000-000000000005', 100, '50b40000-0000-4000-8000-000000000001');
SET LOCAL session_replication_role = origin;

-- Intento como `authenticated`: devuelve las filas alcanzadas o 'ERR <sqlstate>'; el claim se limpia siempre.
CREATE FUNCTION pg_temp.try_as(p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN 'ERR ' || SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN n::text;
END $$;

CREATE FUNCTION pg_temp.count_as(p_sub text, p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql INTO n;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN n;
END $$;

-- Conjunto de ids (ordenado) que devuelve `p_sql` como `authenticated` con el claim del usuario.
CREATE FUNCTION pg_temp.ids_as(p_sub text, p_sql text) RETURNS uuid[]
LANGUAGE plpgsql AS $$
DECLARE a uuid[];
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE format('SELECT coalesce(array_agg(x ORDER BY x), ''{}'') FROM (%s) q(x)', p_sql) INTO a;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN a;
END $$;

-- Lo que devuelve la FUNCIÓN para ese usuario (se ejecuta como dueño: solo importa el claim).
CREATE FUNCTION pg_temp.ids_fn(p_sub text) RETURNS uuid[]
LANGUAGE plpgsql AS $$
DECLARE a uuid[];
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO a FROM public.my_visible_engagement_ids() x;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN a;
END $$;

DO $$
DECLARE
  a constant text := 'a0b40000-0000-4000-8000-000000000001';  -- admin
  m constant text := 'a0b40000-0000-4000-8000-000000000002';  -- gerente de E1
  s constant text := 'a0b40000-0000-4000-8000-000000000003';  -- asistente sin relación (con un BORRADOR sobre E5)
  x constant text := 'a0b40000-0000-4000-8000-000000000004';  -- gerente que creó E3
  h constant text := 'a0b40000-0000-4000-8000-000000000005';  -- hr_manager
  r constant text := 'a0b40000-0000-4000-8000-000000000006';  -- asistente con solicitud ENVIADA sobre E4
  d constant text := 'a0b40000-0000-4000-8000-000000000007';  -- analista de cobranza (departamento)
  e1 constant uuid := 'e0b40000-0000-4000-8000-000000000001';
  e2 constant uuid := 'e0b40000-0000-4000-8000-000000000002';
  e3 constant uuid := 'e0b40000-0000-4000-8000-000000000003';
  e4 constant uuid := 'e0b40000-0000-4000-8000-000000000004';
  e5 constant uuid := 'e0b40000-0000-4000-8000-000000000005';
  fx uuid[] := ARRAY[e1, e2, e3, e4, e5];
  u text; v_rls uuid[]; v_fn uuid[]; v_view uuid[]; v_exp uuid[]; v_n bigint; v_ot bigint; v_v text; v_acl text; v_res text;
BEGIN
  -- 0. Premisas de los permisos (si cambian, la suite pierde sentido) ───────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'manager' AND permission_key = 'engagement.read' AND scope_key = 'assigned_engagements')
     OR NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'hr_manager' AND permission_key = 'engagement.read')
     OR NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'collections_analyst' AND permission_key = 'engagement.read' AND scope_key = 'department')
     OR NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'admin' AND permission_key = 'engagement.read' AND scope_key = 'firm')
     OR EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'assistant' AND permission_key = 'engagement.read') THEN
    RAISE EXCEPTION 'B4 FAIL — premisa de permisos: manager (assigned), hr_manager, collections_analyst (department) y admin (firm) con engagement.read; assistant sin él';
  END IF;
  RAISE NOTICE 'PASS — 0. premisas de permisos';

  -- 1. my_visible_engagement_ids() = lo que devuelve la RLS REAL de engagements, para los 7 perfiles (TODOS los encargos de la base) ─
  FOREACH u IN ARRAY ARRAY[a, m, s, x, h, r, d] LOOP
    v_rls := pg_temp.ids_as(u, 'SELECT engagement_id FROM public.engagements');
    v_fn  := pg_temp.ids_fn(u);
    IF v_rls IS DISTINCT FROM v_fn THEN
      RAISE EXCEPTION 'B4 FAIL — my_visible_engagement_ids() difiere de la RLS de engagements para % (RLS %, función %)', u, cardinality(v_rls), cardinality(v_fn);
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — 1. el conjunto de la función es idéntico a la RLS de engagements para admin, gerente, asistente, creador, hr_manager, solicitante y cobranza';

  -- 2. Cada rama del predicado, sobre los encargos del fixture (no-vacuidad: cada perfil ve exactamente lo suyo) ──────────
  FOR u, v_exp IN
    SELECT * FROM (VALUES (m, ARRAY[e1]),            -- a) gerente asignado
                          (x, ARRAY[e3]),            -- b) creador sin asignación
                          (h, ARRAY[e2]),            -- c) hr_manager: solo el administrativo
                          (r, ARRAY[e4]),            -- d) solicitud ENVIADA
                          (s, ARRAY[]::uuid[]),      -- el BORRADOR de S sobre E5 NO da visibilidad
                          (d, ARRAY[e1, e2, e3, e4, e5]),   -- departamento: todos
                          (a, ARRAY[e1, e2, e3, e4, e5])) AS t(u, e)
  LOOP
    v_rls := pg_temp.ids_as(u, format('SELECT engagement_id FROM public.engagements WHERE engagement_id = ANY(%L::uuid[])', fx));
    IF v_rls IS DISTINCT FROM (SELECT coalesce(array_agg(z ORDER BY z), '{}') FROM unnest(v_exp) z) THEN
      RAISE EXCEPTION 'B4 FAIL — rama del predicado: % esperaba % encargos del fixture y ve %', u, cardinality(v_exp), cardinality(v_rls);
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — 2. ramas a (asignado), b (creador), c (hr administrativo), d (solicitud enviada; el borrador no cuenta), departamento y firma';

  -- 3. engagement_wo_state: cada usuario recibe SOLO el estado de los encargos que ve ───────────────────────────────────
  SELECT count(*) INTO v_ot FROM public.work_orders;
  FOREACH u IN ARRAY ARRAY[a, m, s, x, h, r, d] LOOP
    v_view := pg_temp.ids_as(u, 'SELECT engagement_id FROM public.engagement_wo_state');
    -- work_orders tiene RLS: para comparar con el oráculo se calcula como dueño con el claim (visibles ∩ con OT)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    SELECT coalesce(array_agg(w.engagement_id ORDER BY w.engagement_id), '{}') INTO v_exp
      FROM public.work_orders w WHERE w.engagement_id IN (SELECT public.my_visible_engagement_ids());
    PERFORM set_config('request.jwt.claims', '', true);
    IF v_view IS DISTINCT FROM v_exp THEN
      RAISE EXCEPTION 'B4 FAIL — engagement_wo_state de % devuelve % filas y debería devolver % (los encargos que ve)', u, cardinality(v_view), cardinality(v_exp);
    END IF;
  END LOOP;
  -- no-vacuidad: la vista ya no entrega las OT ajenas
  IF pg_temp.count_as(s, 'SELECT count(*) FROM public.engagement_wo_state WHERE engagement_id = ANY(ARRAY[''e0b40000-0000-4000-8000-000000000001''::uuid, ''e0b40000-0000-4000-8000-000000000005''::uuid])') <> 0
     OR pg_temp.count_as(m, 'SELECT count(*) FROM public.engagement_wo_state WHERE engagement_id <> ''e0b40000-0000-4000-8000-000000000001''::uuid AND engagement_id::text LIKE ''e0b40000%''') <> 0
     OR pg_temp.count_as(m, 'SELECT count(*) FROM public.engagement_wo_state WHERE engagement_id = ''e0b40000-0000-4000-8000-000000000001''::uuid') <> 1 THEN
    RAISE EXCEPTION 'B4 FAIL — engagement_wo_state: el asistente ve OT ajenas o el gerente no ve la suya';
  END IF;
  -- el contenido es el de la OT (no un valor inventado)
  SELECT approval_status INTO v_v FROM public.engagement_wo_state WHERE engagement_id = e1;
  IF v_v IS DISTINCT FROM 'Approved' THEN
    RAISE EXCEPTION 'B4 FAIL — el estado de la OT de E1 debería ser Approved y es %', v_v;
  END IF;
  RAISE NOTICE 'PASS — 3. engagement_wo_state devuelve solo el estado de los encargos que cada perfil ve (7 perfiles, % OT en total), sin entregar OT ajenas', v_ot;

  -- 4. Sin sesión pasa todo (migraciones, service_role, SQL Editor); anon, nada ──────────────────────────────────────────
  IF (SELECT count(*) FROM public.engagement_wo_state) <> v_ot THEN
    RAISE EXCEPTION 'B4 FAIL — sin claims la vista debería devolver las % OT y devuelve otra cantidad', v_ot;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  IF (SELECT count(*) FROM public.engagement_wo_state) <> v_ot THEN
    RAISE EXCEPTION 'B4 FAIL — con claim service_role la vista debería devolver las % OT (las Edge Functions de scheduler dependen de eso)', v_ot;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  IF (SELECT count(*) FROM public.engagement_wo_state) <> 0 THEN
    RAISE EXCEPTION 'B4 FAIL — con claim anon la vista no debe devolver filas';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  IF has_table_privilege('anon', 'public.engagement_wo_state', 'SELECT') THEN
    RAISE EXCEPTION 'B4 FAIL — anon tiene SELECT sobre engagement_wo_state';
  END IF;
  RAISE NOTICE 'PASS — 4. sin sesión y service_role ven todo, anon nada';

  -- 5. Opciones de las vistas y privilegios de la función ────────────────────────────────────────────────────────────────
  IF coalesce((SELECT reloptions::text FROM pg_class WHERE oid = 'public.engagement_wo_state'::regclass), '') !~ 'security_barrier=(true|on)' THEN
    RAISE EXCEPTION 'B4 FAIL — engagement_wo_state debe tener security_barrier (su filtro es el mecanismo de seguridad)';
  END IF;
  IF coalesce((SELECT reloptions::text FROM pg_class WHERE oid = 'public.engagement_wo_state'::regclass), '') ~ 'security_invoker=(true|on)' THEN
    RAISE EXCEPTION 'B4 FAIL — engagement_wo_state debe seguir siendo del dueño (work_orders solo lo lee el equipo)';
  END IF;
  IF coalesce((SELECT reloptions::text FROM pg_class WHERE oid = 'public.staff_directory'::regclass), '') !~ 'security_invoker=(true|on)' THEN
    RAISE EXCEPTION 'B4 FAIL — staff_directory debe ser security_invoker';
  END IF;
  IF has_function_privilege('anon', 'public.my_visible_engagement_ids()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.my_visible_engagement_ids()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.my_visible_engagement_ids()', 'EXECUTE') THEN
    RAISE EXCEPTION 'B4 FAIL — my_visible_engagement_ids(): anon sin EXECUTE; authenticated y service_role con EXECUTE (PostgreSQL lo exige a quien consulta la vista)';
  END IF;
  RAISE NOTICE 'PASS — 5. engagement_wo_state con security_barrier y del dueño, staff_directory invoker, privilegios de la función';

  -- 6. staff_directory sigue dando lo mismo que staff (invoker: obedece su RLS y el SELECT por columna) ─────────────────────
  IF pg_temp.count_as(s, 'SELECT count(*) FROM public.staff_directory') <> (SELECT count(*) FROM public.staff WHERE deleted_at IS NULL) THEN
    RAISE EXCEPTION 'B4 FAIL — staff_directory como invoker debe devolver todo el personal no borrado';
  END IF;
  RAISE NOTICE 'PASS — 6. staff_directory como invoker devuelve todo el personal activo';

  -- 7. Privilegios de TODAS las vistas de public: authenticated solo SELECT; anon nada (ni MAINTAIN) ────────────────────────
  SELECT string_agg(c.relname || ':' || a.privilege_type || '->' || coalesce((SELECT rolname FROM pg_roles WHERE oid = a.grantee), 'PUBLIC'), ', ') INTO v_acl
    FROM pg_class c, LATERAL aclexplode(c.relacl) a
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
     AND ((a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated') AND a.privilege_type <> 'SELECT')
          OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')
          OR a.grantee = 0);
  IF v_acl IS NOT NULL THEN
    RAISE EXCEPTION 'B4 FAIL — privilegios sobrantes en vistas de public: %', v_acl;
  END IF;
  -- ninguna admite escritura (las vw_* retiran los privilegios; las demás ya no los tenían)
  FOREACH v_v IN ARRAY ARRAY['clients_directory', 'engagement_wo_state', 'fund_request_selectable_work_orders', 'staff_directory', 'work_order_summary',
                             'vw_staffing_alerts', 'vw_actual_hours_by_category_activity', 'vw_budget_vs_actual_hours_by_category_activity',
                             'vw_wo_budget_hours_by_category', 'vw_wo_budget_hours_by_category_activity'] LOOP
    IF has_table_privilege('authenticated', 'public.' || v_v, 'TRUNCATE') OR has_table_privilege('authenticated', 'public.' || v_v, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || v_v, 'INSERT') OR has_table_privilege('authenticated', 'public.' || v_v, 'DELETE') THEN
      RAISE EXCEPTION 'B4 FAIL — authenticated conserva privilegios de escritura sobre %', v_v;
    END IF;
  END LOOP;
  IF pg_temp.try_as(m, 'UPDATE public.engagement_wo_state SET risk_status = risk_status') <> 'ERR 42501' THEN
    RAISE EXCEPTION 'B4 FAIL — un UPDATE a engagement_wo_state debe dar 42501';
  END IF;
  RAISE NOTICE 'PASS — 7. las 10 vistas: authenticated solo SELECT, anon nada, sin escritura';

  -- 8. Las dos tablas sueltas: RLS activa, sin privilegios para la API ──────────────────────────────────────────────────
  FOREACH v_v IN ARRAY ARRAY['migration_run_log', 'user_roles_backup_0220_56_20260224'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_v)::regclass) THEN
      RAISE EXCEPTION 'B4b FAIL — % sin RLS', v_v;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = v_v) THEN
      RAISE EXCEPTION 'B4b FAIL — % no debe tener políticas (queda inaccesible para la API a propósito)', v_v;
    END IF;
    IF has_table_privilege('authenticated', 'public.' || v_v, 'SELECT') OR has_table_privilege('authenticated', 'public.' || v_v, 'INSERT')
       OR has_table_privilege('anon', 'public.' || v_v, 'SELECT') OR has_table_privilege('authenticated', 'public.' || v_v, 'TRUNCATE') THEN
      RAISE EXCEPTION 'B4b FAIL — % conserva privilegios para anon o authenticated', v_v;
    END IF;
    v_res := pg_temp.try_as(a, format('SELECT 1 FROM public.%I', v_v));
    IF v_res <> 'ERR 42501' THEN
      RAISE EXCEPTION 'B4b FAIL — ni el admin debe leer % por la API (esperaba 42501 y dio %)', v_v, v_res;
    END IF;
  END LOOP;
  -- el dueño sigue pudiendo escribirla (migraciones): sin FORCE
  INSERT INTO public.migration_run_log (migration_key, backup_table_name, executed_by) VALUES ('b4-suite', 'x', 'suite');
  RAISE NOTICE 'PASS — 8. migration_run_log y el respaldo de user_roles: RLS activa, sin políticas ni privilegios de API; el dueño sigue escribiendo';

  RAISE NOTICE 'B4 VISTAS Y SUELTAS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
