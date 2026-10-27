-- Carril B / B3c — RLS en clients y engagements, directorio de clientes y escritura por vistas
-- (20261012160000_rls_carril_b3c_clientes_encargos.sql)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de las migraciones de B3p (que da client.read,
-- engagement.read y work_order.read a cobranza y contabilidad) y de B3c.
-- Transacción única, SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo, terminando
-- en "B3c CLIENTES ENCARGOS: ALL CHECKS PASSED (rolled back)".
--
-- Lo que se prueba ES la RLS: todo corre con `SET LOCAL ROLE authenticated` (o `anon`) de verdad más el claim
-- JWT del usuario. Cada denegación tiene su contraparte de no-vacuidad: la visibilidad cambia al quitar y
-- devolver el permiso, o al cambiar quién gestiona el encargo.
--
-- No se prueba aquí la vía «solicitud de fondos» del asistente (política "Staff can view fund request
-- engagements"): B3c no la cambia y su fixture es grande; está medida en Dev 2.0 (el asistente ve 4 encargos).
--
-- Los totales («ven todos») se calculan como owner al empezar, NO se fijan: el harness ya trae clientes que no son de
-- esta suite (los 2 clientes internos que siembra 0722-160) y una migración futura puede sembrar más. Solo los
-- conteos de gerentes, socio, asistente, senior y supervisor dependen únicamente de las fixtures propias.
--
-- Fixture world (ids con prefijo b3cc):
--   U1 admin  U2 manager (gerente de E1)  U3 manager (gerente de E2)  U4 partner (socio de E1 y SQR de E2)
--   U5 assistant  U6 senior (encargado de E2, sin engagement.read)  U7 accounting_manager
--   U8 collections_analyst  U9 risk_supervisor  U10 risk_partner
--   C1 cliente de E1 · C2 cliente de E2 · OT1/OT2 una OT por encargo. C3 lo crea U2 durante la suite.

BEGIN;

-- ── Fixtures (como owner; sin claims, los triggers de perfil dejan pasar) ──────────────────────

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1b3cc00-0000-4000-8000-000000000001', 'B3cc Cliente Uno', 'B3CC-TAX-001'),
  ('c1b3cc00-0000-4000-8000-000000000002', 'B3cc Cliente Dos', 'B3CC-TAX-002');

INSERT INTO auth.users (id) VALUES
  ('a0b3cc00-0000-4000-8000-000000000001'), ('a0b3cc00-0000-4000-8000-000000000002'),
  ('a0b3cc00-0000-4000-8000-000000000003'), ('a0b3cc00-0000-4000-8000-000000000004'),
  ('a0b3cc00-0000-4000-8000-000000000005'), ('a0b3cc00-0000-4000-8000-000000000006'),
  ('a0b3cc00-0000-4000-8000-000000000007'), ('a0b3cc00-0000-4000-8000-000000000008'),
  ('a0b3cc00-0000-4000-8000-000000000009'), ('a0b3cc00-0000-4000-8000-00000000000a');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0b3cc00-0000-4000-8000-000000000001', 'admin',   'admin'),
  ('a0b3cc00-0000-4000-8000-000000000002', 'manager', 'manager'),
  ('a0b3cc00-0000-4000-8000-000000000003', 'manager', 'manager'),
  ('a0b3cc00-0000-4000-8000-000000000004', 'partner', 'partner'),
  ('a0b3cc00-0000-4000-8000-000000000005', 'staff',   'assistant'),
  ('a0b3cc00-0000-4000-8000-000000000006', 'staff',   'senior'),
  ('a0b3cc00-0000-4000-8000-000000000007', 'staff',   'accounting_manager'),
  ('a0b3cc00-0000-4000-8000-000000000008', 'staff',   'collections_analyst'),
  ('a0b3cc00-0000-4000-8000-000000000009', 'manager', 'risk_supervisor'),
  ('a0b3cc00-0000-4000-8000-00000000000a', 'partner', 'risk_partner');

-- Ficha de staff para U2..U10 (el directorio exige sesión con ficha: get_my_staff_id() IS NOT NULL).
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
SELECT ('50b3cc00-0000-4000-8000-00000000000' || n)::uuid, ('a0b3cc00-0000-4000-8000-00000000000' || n)::uuid,
       'U' || n, 'B3cc',
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1)
FROM (VALUES ('2'), ('3'), ('4'), ('5'), ('6'), ('7'), ('8'), ('9'), ('a')) AS v(n);

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id, partner_id, sqr_id, encargado_id,
                                practica, fecha_cierre, work_order_required, approval_required, society_id) VALUES
  ('e0b3cc00-0000-4000-8000-000000000001', 'c1b3cc00-0000-4000-8000-000000000001', 'B3cc E1',
   '50b3cc00-0000-4000-8000-000000000002', '50b3cc00-0000-4000-8000-000000000004', NULL, NULL,
   1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0b3cc00-0000-4000-8000-000000000002', 'c1b3cc00-0000-4000-8000-000000000002', 'B3cc E2',
   '50b3cc00-0000-4000-8000-000000000003', NULL, '50b3cc00-0000-4000-8000-000000000004',
   '50b3cc00-0000-4000-8000-000000000006',
   1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40b3cc00-0000-4000-8000-000000000001', 'e0b3cc00-0000-4000-8000-000000000001', 'BOB', 'High', 'Draft'),
  ('40b3cc00-0000-4000-8000-000000000002', 'e0b3cc00-0000-4000-8000-000000000002', 'BOB', 'High', 'Draft');

-- ── Helpers (temp) ────────────────────────────────────────────────────────────────────────────

-- Un escalar (count) de una consulta, con el rol authenticated real y el claim de `p_sub`.
CREATE FUNCTION pg_temp.scalar_as(p_sub text, p_sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql INTO n;
  EXECUTE 'RESET ROLE';
  RETURN n;
END $$;

CREATE FUNCTION pg_temp.count_as(p_sub text, p_table text) RETURNS bigint
LANGUAGE sql AS $$ SELECT pg_temp.scalar_as(p_sub, format('SELECT count(*) FROM public.%I', p_table)) $$;

-- «SQLSTATE: mensaje» con que falló la sentencia (NULL si tuvo éxito), con el rol authenticated real.
CREATE FUNCTION pg_temp.try_as(p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql;
  EXECUTE 'RESET ROLE';
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  RETURN SQLSTATE || ': ' || SQLERRM;
END $$;

-- Filas que alcanza un UPDATE/DELETE (RLS no da error: oculta las filas). -1 si falló.
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
  u1  constant text := 'a0b3cc00-0000-4000-8000-000000000001';  -- admin
  u2  constant text := 'a0b3cc00-0000-4000-8000-000000000002';  -- gerente de E1
  u3  constant text := 'a0b3cc00-0000-4000-8000-000000000003';  -- gerente de E2
  u4  constant text := 'a0b3cc00-0000-4000-8000-000000000004';  -- socio de E1, SQR de E2
  u5  constant text := 'a0b3cc00-0000-4000-8000-000000000005';  -- asistente
  u6  constant text := 'a0b3cc00-0000-4000-8000-000000000006';  -- senior, encargado de E2
  u7  constant text := 'a0b3cc00-0000-4000-8000-000000000007';  -- contabilidad (gerente)
  u8  constant text := 'a0b3cc00-0000-4000-8000-000000000008';  -- cobranza
  u9  constant text := 'a0b3cc00-0000-4000-8000-000000000009';  -- supervisor de riesgos
  u10 constant text := 'a0b3cc00-0000-4000-8000-00000000000a';  -- socio de riesgos
  s2  constant text := '50b3cc00-0000-4000-8000-000000000002';
  e1  constant text := 'e0b3cc00-0000-4000-8000-000000000001';
  e2  constant text := 'e0b3cc00-0000-4000-8000-000000000002';
  v_who text; v_err text; v_n bigint; v_tot bigint; v_cols text; v text;
  v_cli bigint; v_eng bigint; v_wo bigint;   -- totales como owner: fixtures propias + lo que ya trae el harness
BEGIN
  SELECT count(*) INTO v_cli FROM public.clients;
  SELECT count(*) INTO v_eng FROM public.engagements;
  SELECT count(*) INTO v_wo  FROM public.work_orders;

  -- 1. Estructura ─────────────────────────────────────────────────────────────────────────────────
  FOREACH v IN ARRAY ARRAY['clients', 'engagements'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', v)::regclass) THEN
      RAISE EXCEPTION 'B3c FAIL — % sin RLS', v;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — RLS activa en clients y engagements';

  -- 2. Clientes: lectura por rol ───────────────────────────────────────────────────────────────────
  -- Ven todos: admin, cobranza y socio de riesgos (client.read de alcance firma/departamento).
  FOREACH v_who IN ARRAY ARRAY[u1, u8, u10] LOOP
    IF pg_temp.count_as(v_who, 'clients') <> v_cli THEN
      RAISE EXCEPTION 'B3c FAIL — % debía ver los % clientes y ve %', v_who, v_cli, pg_temp.count_as(v_who, 'clients');
    END IF;
  END LOOP;
  -- Cada gerente, el cliente de su encargo; el socio, el de los dos (socio de E1 y SQR de E2).
  IF pg_temp.count_as(u2, 'clients') <> 1 OR pg_temp.count_as(u3, 'clients') <> 1 THEN
    RAISE EXCEPTION 'B3c FAIL — cada gerente debía ver 1 cliente (U2 %, U3 %)', pg_temp.count_as(u2, 'clients'), pg_temp.count_as(u3, 'clients');
  END IF;
  IF pg_temp.count_as(u4, 'clients') <> 2 THEN
    RAISE EXCEPTION 'B3c FAIL — el socio (socio de E1 y SQR de E2) debía ver 2 clientes y ve %', pg_temp.count_as(u4, 'clients');
  END IF;
  -- Sin client.read: asistente, senior, contabilidad y supervisor de riesgos no ven ninguno.
  FOREACH v_who IN ARRAY ARRAY[u5, u6, u7, u9] LOOP
    IF pg_temp.count_as(v_who, 'clients') <> 0 THEN
      RAISE EXCEPTION 'B3c FAIL — % no tiene client.read y no debía ver clientes', v_who;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — clientes: admin, cobranza y riesgos todos; gerentes y socio los de sus encargos; asistente, senior, contabilidad y supervisor de riesgos 0';

  -- No-vacuidad: la visibilidad sale del permiso y de la relación con el encargo.
  DELETE FROM public.authorization_role_permissions WHERE role_key = 'manager' AND permission_key = 'client.read';
  IF pg_temp.count_as(u2, 'clients') <> 0 THEN
    RAISE EXCEPTION 'B3c FAIL — sin client.read el gerente debía ver 0 clientes';
  END IF;
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  VALUES ('manager', 'client.read', 'assigned_clients')
  ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;
  IF pg_temp.count_as(u2, 'clients') <> 1 THEN
    RAISE EXCEPTION 'B3c FAIL — al devolver client.read el gerente debía volver a ver su cliente';
  END IF;
  UPDATE public.engagements SET manager_id = s2::uuid WHERE engagement_id = e2::uuid;   -- U3 deja de gestionar E2
  IF pg_temp.count_as(u3, 'clients') <> 0 OR pg_temp.count_as(u3, 'engagements') <> 0 THEN
    RAISE EXCEPTION 'B3c FAIL — U3 ya no gestiona E2 y no debía ver su cliente ni su encargo';
  END IF;
  IF pg_temp.count_as(u2, 'clients') <> 2 OR pg_temp.count_as(u2, 'engagements') <> 2 THEN
    RAISE EXCEPTION 'B3c FAIL — U2 gestiona ahora E1 y E2 y debía ver 2 clientes y 2 encargos';
  END IF;
  UPDATE public.engagements SET manager_id = '50b3cc00-0000-4000-8000-000000000003' WHERE engagement_id = e2::uuid;
  RAISE NOTICE 'PASS — la visibilidad de clientes depende de client.read y de gestionar un encargo del cliente (se quita, se devuelve y se reasigna)';

  -- 3. Encargos: lectura por rol ─────────────────────────────────────────────────────────────────
  -- Ven todos: admin, contabilidad, cobranza, supervisor y socio de riesgos (engagement.read firma/departamento).
  FOREACH v_who IN ARRAY ARRAY[u1, u7, u8, u9, u10] LOOP
    IF pg_temp.count_as(v_who, 'engagements') <> v_eng THEN
      RAISE EXCEPTION 'B3c FAIL — % debía ver los % encargos y ve %', v_who, v_eng, pg_temp.count_as(v_who, 'engagements');
    END IF;
  END LOOP;
  IF pg_temp.count_as(u2, 'engagements') <> 1 OR pg_temp.count_as(u3, 'engagements') <> 1 THEN
    RAISE EXCEPTION 'B3c FAIL — cada gerente debía ver solo su encargo';
  END IF;
  IF pg_temp.count_as(u4, 'engagements') <> 2 THEN
    RAISE EXCEPTION 'B3c FAIL — el socio (E1) y SQR (E2) debía ver los 2 encargos';
  END IF;
  -- Asistente: 0 (su vía son las solicitudes de fondos, no cubiertas aquí). Senior encargado de E2: 0 por permiso.
  IF pg_temp.count_as(u5, 'engagements') <> 0 THEN RAISE EXCEPTION 'B3c FAIL — el asistente no debía ver encargos sin solicitudes de fondos'; END IF;
  IF pg_temp.count_as(u6, 'engagements') <> 0 THEN
    RAISE EXCEPTION 'B3c FAIL — el senior no tiene engagement.read y no debía ver E2 aunque es su encargado';
  END IF;
  -- Contraparte: con engagement.read asignado, el senior sí ve el encargo del que es encargado.
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  VALUES ('senior', 'engagement.read', 'assigned_engagements')
  ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;
  IF pg_temp.count_as(u6, 'engagements') <> 1 THEN
    RAISE EXCEPTION 'B3c FAIL — con engagement.read asignado el senior debía ver E2 (es su encargado)';
  END IF;
  DELETE FROM public.authorization_role_permissions WHERE role_key = 'senior' AND permission_key = 'engagement.read';
  IF pg_temp.count_as(u6, 'engagements') <> 0 THEN
    RAISE EXCEPTION 'B3c FAIL — sin engagement.read el senior debía volver a ver 0';
  END IF;
  RAISE NOTICE 'PASS — encargos: roles de firma todos; gerentes lo suyo; socio los asignados; asistente y senior 0 (el senior, por permiso)';

  -- 4. Directorio de clientes ───────────────────────────────────────────────────────────────────────
  SELECT string_agg(column_name, ',' ORDER BY ordinal_position) INTO v_cols
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients_directory';
  IF v_cols IS DISTINCT FROM 'client_id,client_legal_name,is_active' THEN
    RAISE EXCEPTION 'B3c FAIL — clients_directory debe tener solo client_id, client_legal_name e is_active y tiene %', v_cols;
  END IF;
  -- Asistente y senior (sin client.read) leen el nombre de TODOS los clientes por el directorio...
  IF pg_temp.count_as(u5, 'clients_directory') <> v_cli OR pg_temp.count_as(u6, 'clients_directory') <> v_cli THEN
    RAISE EXCEPTION 'B3c FAIL — el directorio debía dar los % nombres a asistente (ve %) y senior (ve %)', v_cli,
      pg_temp.count_as(u5, 'clients_directory'), pg_temp.count_as(u6, 'clients_directory');
  END IF;
  -- ...pero no el contacto: la columna no existe.
  v_err := pg_temp.try_as(u5, 'SELECT contact_email FROM public.clients_directory');
  IF v_err IS NULL OR v_err NOT LIKE '42703%' THEN
    RAISE EXCEPTION 'B3c FAIL — contact_email no debía existir en el directorio (err=%)', v_err;
  END IF;
  -- Sin ficha de staff el directorio no devuelve filas (misma regla que fund_request_selectable_work_orders).
  IF pg_temp.count_as(u1, 'clients_directory') <> 0 THEN
    RAISE EXCEPTION 'B3c FAIL — el admin del fixture no tiene ficha de staff y no debía ver filas del directorio';
  END IF;
  -- Escritura por la vista: denegada a admin y a asistente, en las 3 operaciones.
  FOREACH v_who IN ARRAY ARRAY[u1, u5] LOOP
    FOREACH v IN ARRAY ARRAY[
        'UPDATE public.clients_directory SET client_legal_name = client_legal_name',
        'DELETE FROM public.clients_directory',
        'INSERT INTO public.clients_directory (client_id, client_legal_name) VALUES (gen_random_uuid(), ''x'')',
        'UPDATE public.engagement_wo_state SET risk_status = risk_status'] LOOP
      v_err := pg_temp.try_as(v_who, v);
      IF v_err IS NULL OR v_err NOT LIKE '42501%' THEN
        RAISE EXCEPTION 'B3c FAIL — % pudo escribir por una vista (%; err=%)', v_who, v, v_err;
      END IF;
    END LOOP;
  END LOOP;
  -- Privilegios: ninguna de las 5 vistas admite escritura a authenticated; todas conservan SELECT.
  FOREACH v IN ARRAY ARRAY['clients_directory', 'engagement_wo_state', 'staff_directory',
                           'fund_request_selectable_work_orders', 'work_order_summary'] LOOP
    IF has_table_privilege('authenticated', format('public.%I', v), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', v), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', v), 'DELETE')
       OR has_table_privilege('authenticated', format('public.%I', v), 'TRUNCATE') THEN
      RAISE EXCEPTION 'B3c FAIL — authenticated conserva escritura sobre la vista %', v;
    END IF;
    IF NOT has_table_privilege('authenticated', format('public.%I', v), 'SELECT') THEN
      RAISE EXCEPTION 'B3c FAIL — authenticated perdió SELECT sobre la vista % (la app la lee)', v;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.clients_directory', 'SELECT') THEN
    RAISE EXCEPTION 'B3c FAIL — anon puede leer clients_directory';
  END IF;
  -- anon real: 42501.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM count(*) FROM public.clients_directory;
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'B3c FAIL — anon pudo leer clients_directory';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
  END;
  RAISE NOTICE 'PASS — directorio: 3 columnas, nombre para todos con ficha, sin contacto, solo lectura, anon rechazado; 5 vistas sin escritura';

  -- 5. Alta de cliente ───────────────────────────────────────────────────────────────────────────────
  -- El gerente crea con RETURNING y lo ve (política "creator read"); el asistente no puede crear.
  v_err := pg_temp.try_as(u2, 'INSERT INTO public.clients (client_legal_name, unique_tax_id) VALUES (''B3cc Cliente Tres'', ''B3CC-TAX-003'') RETURNING client_id');
  IF v_err IS NOT NULL THEN RAISE EXCEPTION 'B3c FAIL — el gerente debía crear un cliente con RETURNING (err=%)', v_err; END IF;
  IF pg_temp.count_as(u2, 'clients') <> 2 THEN
    RAISE EXCEPTION 'B3c FAIL — el gerente debía ver el cliente que creó, además del de su encargo';
  END IF;
  v_err := pg_temp.try_as(u5, 'INSERT INTO public.clients (client_legal_name, unique_tax_id) VALUES (''B3cc Intruso'', ''B3CC-TAX-999'')');
  IF v_err IS NULL OR v_err NOT LIKE '42501%' THEN
    RAISE EXCEPTION 'B3c FAIL — el asistente pudo crear un cliente (err=%)', v_err;
  END IF;
  -- NIT de un cliente que el gerente NO ve: el chequeo previo no lo encuentra y la base responde 23505.
  IF pg_temp.scalar_as(u2, 'SELECT count(*) FROM public.clients WHERE unique_tax_id = ''B3CC-TAX-002''') <> 0 THEN
    RAISE EXCEPTION 'B3c FAIL — el gerente no debía ver el cliente de otro encargo al buscar por NIT';
  END IF;
  v_err := pg_temp.try_as(u2, 'INSERT INTO public.clients (client_legal_name, unique_tax_id) VALUES (''B3cc Otro Nombre'', ''B3CC-TAX-002'')');
  IF v_err IS NULL OR v_err NOT LIKE '23505%' THEN
    RAISE EXCEPTION 'B3c FAIL — el NIT duplicado debía dar 23505 aunque el cliente sea invisible (err=%)', v_err;
  END IF;
  RAISE NOTICE 'PASS — alta: el gerente crea y lo ve; el asistente no crea; un NIT ajeno invisible da 23505 (la app muestra el aviso sin variables)';

  -- 6. Escritura de clientes y encargos ───────────────────────────────────────────────────────────
  SELECT count(*) INTO v_tot FROM public.clients;
  IF pg_temp.rows_as(u2, 'UPDATE public.clients SET client_legal_name = client_legal_name') <> 0 THEN
    RAISE EXCEPTION 'B3c FAIL — el gerente no tiene client.update y no debía alcanzar ningún cliente';
  END IF;
  IF pg_temp.rows_as(u1, 'UPDATE public.clients SET client_legal_name = client_legal_name') <> v_tot THEN
    RAISE EXCEPTION 'B3c FAIL — el admin debía alcanzar los % clientes', v_tot;
  END IF;
  IF pg_temp.rows_as(u2, format('UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_id = %L', e1)) <> 1 THEN
    RAISE EXCEPTION 'B3c FAIL — el gerente de E1 debía editar su encargo';
  END IF;
  IF pg_temp.rows_as(u2, format('UPDATE public.engagements SET engagement_name = engagement_name WHERE engagement_id = %L', e2)) <> 0 THEN
    RAISE EXCEPTION 'B3c FAIL — el gerente de E1 alcanzó el encargo de otro gerente';
  END IF;
  FOREACH v_who IN ARRAY ARRAY[u4, u5, u7, u8, u9, u10] LOOP
    IF pg_temp.rows_as(v_who, 'UPDATE public.engagements SET engagement_name = engagement_name') <> 0 THEN
      RAISE EXCEPTION 'B3c FAIL — % no tiene engagement.update y editó encargos', v_who;
    END IF;
  END LOOP;
  IF pg_temp.rows_as(u1, 'UPDATE public.engagements SET engagement_name = engagement_name') <> v_eng THEN
    RAISE EXCEPTION 'B3c FAIL — el admin debía alcanzar los % encargos', v_eng;
  END IF;
  FOREACH v_who IN ARRAY ARRAY[u2, u5, u4] LOOP
    IF pg_temp.rows_as(v_who, 'DELETE FROM public.engagements') <> 0 OR pg_temp.rows_as(v_who, 'DELETE FROM public.clients') <> 0 THEN
      RAISE EXCEPTION 'B3c FAIL — % borró clientes o encargos sin ser admin', v_who;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — escritura: client.update y borrados solo admin; el gerente edita solo su encargo; nadie más edita encargos';

  -- 7. Dependientes: las políticas de OTRAS tablas que consultan engagements no se rompen ───────────
  IF pg_temp.count_as(u2, 'work_orders') <> 1 OR pg_temp.count_as(u3, 'work_orders') <> 1 THEN
    RAISE EXCEPTION 'B3c FAIL — cada gerente debía ver la OT de su encargo';
  END IF;
  IF pg_temp.count_as(u4, 'work_orders') <> 2 THEN
    RAISE EXCEPTION 'B3c FAIL — el socio/SQR debía ver las 2 OT con la RLS de engagements activa';
  END IF;
  IF pg_temp.count_as(u8, 'work_orders') <> v_wo OR pg_temp.count_as(u7, 'work_orders') <> v_wo THEN
    RAISE EXCEPTION 'B3c FAIL — cobranza y contabilidad debían ver las % OT (work_order.read department) y ven % / %', v_wo,
      pg_temp.count_as(u8, 'work_orders'), pg_temp.count_as(u7, 'work_orders');
  END IF;
  IF pg_temp.count_as(u5, 'work_orders') <> 0 THEN
    RAISE EXCEPTION 'B3c FAIL — el asistente sin solicitudes de fondos no debía ver OT';
  END IF;
  RAISE NOTICE 'PASS — work_orders (políticas con subconsulta a engagements) sin cambios con la RLS activa';

  -- 8. Guardas de regresión ─────────────────────────────────────────────────────────────────────────
  -- (a) Ninguna función INVOKER de public nombra clients/engagements: quedaría filtrada por la RLS del llamador.
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND NOT p.prosecdef
     AND p.prosrc ~* '\m(clients|engagements)\M';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'B3c FAIL — % función(es) INVOKER nombran clients/engagements: %', v_n,
      (SELECT string_agg(p.proname, ', ') FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND NOT p.prosecdef
          AND p.prosrc ~* '\m(clients|engagements)\M');
  END IF;
  -- (b) Las únicas vistas security_invoker que las nombran: vw_staffing_alerts (filtrada por staff_id propio).
  SELECT string_agg(v.viewname, ', ') INTO v_cols
    FROM pg_views v JOIN pg_class c ON c.oid = ('public.' || v.viewname)::regclass
   WHERE v.schemaname = 'public' AND v.definition ~* '\m(clients|engagements)\M'
     AND coalesce(c.reloptions::text, '') ~ 'security_invoker=(true|on)'
     AND v.viewname <> 'vw_staffing_alerts';
  IF v_cols IS NOT NULL THEN
    RAISE EXCEPTION 'B3c FAIL — vistas security_invoker nuevas sobre clients/engagements (su resultado dependería de la RLS): %', v_cols;
  END IF;
  -- (c) Las políticas de OTRAS tablas que nombran clients/engagements inline son exactamente las revisadas.
  -- D1 (20/10/2026): timesheet_line_approvals."Approvers can view assigned line approvals" NO consulta engagements: el match es el
  -- literal 'engagements' (un valor de my_line_approval_mode()); la pertenencia sale de my_team_engagement_ids() (SECURITY DEFINER).
  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname) INTO v_cols
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename NOT IN ('clients', 'engagements')
     AND (coalesce(qual, '') || coalesce(with_check, '')) ~* '\m(clients|engagements)\M'
     AND (tablename, policyname) NOT IN (
       ('work_orders', 'Assigned SQR can view work orders'), ('work_orders', 'Assigned SQR can update work orders'),
       ('wo_payment_plan', 'Manager can manage payment plans'), ('wo_payment_installments', 'Manager can manage payment installments'),
       ('timesheet_line_approvals', 'Approvers can view assigned line approvals'));
  IF v_cols IS NOT NULL THEN
    RAISE EXCEPTION 'B3c FAIL — política(s) nueva(s) con subconsulta inline a clients/engagements (se evaluarían con la RLS del usuario): %', v_cols;
  END IF;
  RAISE NOTICE 'PASS — guardas: 0 funciones INVOKER, solo vw_staffing_alerts como vista invoker, políticas inline conocidas';

  RAISE NOTICE 'B3c CLIENTES ENCARGOS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
