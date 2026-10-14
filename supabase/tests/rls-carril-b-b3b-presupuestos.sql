-- Carril B / B3b — RLS en los presupuestos de OT
-- (20261012150000_rls_carril_b3b_presupuestos.sql: wo_budget_lines, wo_expense_budget,
--  activity_worksheet_cells)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de las migraciones de B3b y de B3p (esta
-- última da work_order.read a cobranza y contabilidad, de la que depende parte de lo probado aquí).
-- Transacción única, SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo, terminando
-- en "B3b PRESUPUESTOS: ALL CHECKS PASSED (rolled back)".
--
-- Lo que se prueba ES la RLS: todo corre con `SET LOCAL ROLE authenticated` (o `anon`) de verdad más el
-- claim JWT del usuario. Cada denegación tiene su contraparte de no-vacuidad: la visibilidad cambia al
-- quitar y devolver el permiso, y al cambiar quién es el gerente del encargo.
--
-- Fixture world (ids con prefijo b3c):
--   U1 admin             U2 manager (gerente de E1)   U3 manager (gerente de E2, sin relación con E1)
--   U4 collections_analyst   U5 assistant   U6 risk_supervisor   U7 accounting_manager
--   E1/E2 encargos de U2/U3 · OT1/OT2 una OT por encargo · WS1/WS2 una hoja con una celda cada una
--   BL1/BL2 una línea de presupuesto por OT · EB1/EB2 un gasto presupuestado por OT

BEGIN;

-- ── Fixtures (como owner) ─────────────────────────────────────────────────────────────────────

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c1b3c000-0000-4000-8000-000000000001', 'B3b Test Client', 'B3B-TAX-001');

INSERT INTO auth.users (id) VALUES
  ('a0b3c000-0000-4000-8000-000000000001'), ('a0b3c000-0000-4000-8000-000000000002'),
  ('a0b3c000-0000-4000-8000-000000000003'), ('a0b3c000-0000-4000-8000-000000000004'),
  ('a0b3c000-0000-4000-8000-000000000005'), ('a0b3c000-0000-4000-8000-000000000006'),
  ('a0b3c000-0000-4000-8000-000000000007');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0b3c000-0000-4000-8000-000000000001', 'admin',   'admin'),
  ('a0b3c000-0000-4000-8000-000000000002', 'manager', 'manager'),
  ('a0b3c000-0000-4000-8000-000000000003', 'manager', 'manager'),
  ('a0b3c000-0000-4000-8000-000000000004', 'staff',   'collections_analyst'),
  ('a0b3c000-0000-4000-8000-000000000005', 'staff',   'assistant'),
  ('a0b3c000-0000-4000-8000-000000000006', 'manager', 'risk_supervisor'),
  ('a0b3c000-0000-4000-8000-000000000007', 'staff',   'accounting_manager');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
SELECT s.staff_id, s.auth_user_id, s.first_name, s.last_name,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1)
FROM (VALUES
  ('50b3c000-0000-4000-8000-000000000002'::uuid, 'a0b3c000-0000-4000-8000-000000000002'::uuid, 'Manager', 'Uno'),
  ('50b3c000-0000-4000-8000-000000000003'::uuid, 'a0b3c000-0000-4000-8000-000000000003'::uuid, 'Manager', 'Dos')
) AS s(staff_id, auth_user_id, first_name, last_name);

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id, practica, fecha_cierre,
                                work_order_required, approval_required, society_id) VALUES
  ('e0b3c000-0000-4000-8000-000000000001', 'c1b3c000-0000-4000-8000-000000000001', 'B3b E1', '50b3c000-0000-4000-8000-000000000002', 1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0b3c000-0000-4000-8000-000000000002', 'c1b3c000-0000-4000-8000-000000000001', 'B3b E2', '50b3c000-0000-4000-8000-000000000003', 1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.activity_codes (activity_id, activity_code, description, practica_id, is_system, is_active)
VALUES ('acb3c000-0000-4000-8000-000000000001', 'B3B-A1', 'B3b Test Activity', (SELECT practica_id FROM public.practicas WHERE code = 1), false, true);

INSERT INTO public.categories (category_id, category_name, display_order, rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd, practica_id)
SELECT c.category_id, c.category_name, c.display_order, 100, 50, 15, 7, (SELECT practica_id FROM public.practicas WHERE code = 1)
FROM (VALUES
  ('c0b3c000-0000-4000-8000-000000000001'::uuid, 'B3b Cat 1', 8001),
  ('c0b3c000-0000-4000-8000-000000000002'::uuid, 'B3b Cat 2', 8002)
) AS c(category_id, category_name, display_order);

INSERT INTO public.expense_types (expense_type_id, expense_name) VALUES ('ee3c0000-0000-4000-8000-000000000001', 'B3b gasto');

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40b3c000-0000-4000-8000-000000000001', 'e0b3c000-0000-4000-8000-000000000001', 'BOB', 'High', 'Draft'),
  ('40b3c000-0000-4000-8000-000000000002', 'e0b3c000-0000-4000-8000-000000000002', 'BOB', 'High', 'Draft');

INSERT INTO public.activity_worksheets (id, engagement_id, wo_id) VALUES
  ('30b3c000-0000-4000-8000-000000000001', 'e0b3c000-0000-4000-8000-000000000001', NULL),
  ('30b3c000-0000-4000-8000-000000000002', 'e0b3c000-0000-4000-8000-000000000002', NULL);

INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours) VALUES
  ('30b3c000-0000-4000-8000-000000000001', 'c0b3c000-0000-4000-8000-000000000001', 'acb3c000-0000-4000-8000-000000000001', 10),
  ('30b3c000-0000-4000-8000-000000000002', 'c0b3c000-0000-4000-8000-000000000001', 'acb3c000-0000-4000-8000-000000000001', 7);

INSERT INTO public.wo_budget_lines (wo_id, category_id, budgeted_hours, standard_rate) VALUES
  ('40b3c000-0000-4000-8000-000000000001', 'c0b3c000-0000-4000-8000-000000000001', 10, 100),
  ('40b3c000-0000-4000-8000-000000000002', 'c0b3c000-0000-4000-8000-000000000001', 7, 100);

INSERT INTO public.wo_expense_budget (wo_id, expense_type_id) VALUES
  ('40b3c000-0000-4000-8000-000000000001', 'ee3c0000-0000-4000-8000-000000000001'),
  ('40b3c000-0000-4000-8000-000000000002', 'ee3c0000-0000-4000-8000-000000000001');

-- ── Helpers (temp) ────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION pg_temp.count_as(p_sub text, p_table text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO n;
  EXECUTE 'RESET ROLE';
  RETURN n;
END $$;

-- SQLERRM con que falló la sentencia (NULL si tuvo éxito), con el rol authenticated real.
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
  RETURN SQLERRM;
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
  u1 constant text := 'a0b3c000-0000-4000-8000-000000000001';  -- admin
  u2 constant text := 'a0b3c000-0000-4000-8000-000000000002';  -- gerente de E1
  u3 constant text := 'a0b3c000-0000-4000-8000-000000000003';  -- gerente de E2
  u4 constant text := 'a0b3c000-0000-4000-8000-000000000004';  -- cobranza
  u5 constant text := 'a0b3c000-0000-4000-8000-000000000005';  -- asistente
  u6 constant text := 'a0b3c000-0000-4000-8000-000000000006';  -- risk_supervisor
  u7 constant text := 'a0b3c000-0000-4000-8000-000000000007';  -- contabilidad (gerente)
  wo1 constant text := '40b3c000-0000-4000-8000-000000000001';
  wo2 constant text := '40b3c000-0000-4000-8000-000000000002';
  tablas constant text[] := ARRAY['wo_budget_lines', 'wo_expense_budget', 'activity_worksheet_cells'];
  t text; v_who text; v_err text; v_n bigint; v_tot bigint; v_lines bigint;
BEGIN
  -- 1. Estructura ─────────────────────────────────────────────────────────────────────────────────
  FOREACH t IN ARRAY tablas LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass) THEN
      RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — % sin RLS', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — RLS activa en wo_budget_lines, wo_expense_budget y activity_worksheet_cells';

  -- 2. Lectura por rol ─────────────────────────────────────────────────────────────────────────────
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_tot;
    IF v_tot <> 2 THEN RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — fixture inesperado: % tiene % filas', t, v_tot; END IF;
    -- admin ve todo
    IF pg_temp.count_as(u1, t) <> 2 THEN RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — el admin debía ver las 2 filas de %', t; END IF;
    -- cada gerente ve solo las de su encargo
    IF pg_temp.count_as(u2, t) <> 1 OR pg_temp.count_as(u3, t) <> 1 THEN
      RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — cada gerente debía ver 1 fila de % (U2 %, U3 %)', t, pg_temp.count_as(u2, t), pg_temp.count_as(u3, t);
    END IF;
    -- el asistente no ve ninguna
    IF pg_temp.count_as(u5, t) <> 0 THEN RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — el asistente no debía ver filas de %', t; END IF;
  END LOOP;
  -- cobranza, contabilidad y risk_supervisor (work_order.read department): ven líneas y gastos, no celdas
  FOREACH v_who IN ARRAY ARRAY[u4, u6, u7] LOOP
    IF pg_temp.count_as(v_who, 'wo_budget_lines') <> 2 OR pg_temp.count_as(v_who, 'wo_expense_budget') <> 2 THEN
      RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — % debía ver las líneas y gastos de todas las OT (work_order.read department)', v_who;
    END IF;
    IF pg_temp.count_as(v_who, 'activity_worksheet_cells') <> 0 THEN
      RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — % no tiene worksheet.read y no debía ver celdas', v_who;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — lectura: admin todo; gerentes lo de su encargo; cobranza, contabilidad y riesgos ven líneas y gastos pero no celdas; asistente nada';

  -- 3. Escritura: solo admin y gerente/socio del encargo ───────────────────────────────────────────
  -- El gerente edita su línea y no la ajena.
  IF pg_temp.rows_as(u2, format('UPDATE public.wo_budget_lines SET budgeted_hours = 11 WHERE wo_id = %L', wo1)) <> 1 THEN
    RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — el gerente de E1 debía editar la línea de su OT';
  END IF;
  IF pg_temp.rows_as(u2, format('UPDATE public.wo_budget_lines SET budgeted_hours = 99 WHERE wo_id = %L', wo2)) <> 0 THEN
    RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — el gerente de E1 alcanzó la línea de la OT de otro encargo';
  END IF;
  -- El gerente inserta en su OT y no en la ajena.
  v_err := pg_temp.try_as(u2, format('INSERT INTO public.wo_budget_lines (wo_id, category_id, budgeted_hours, standard_rate) VALUES (%L, %L, 1, 100)', wo1, 'c0b3c000-0000-4000-8000-000000000002'));
  IF v_err IS NOT NULL THEN RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — el gerente debía insertar en su OT (err=%)', v_err; END IF;
  v_err := pg_temp.try_as(u2, format('INSERT INTO public.wo_budget_lines (wo_id, category_id, budgeted_hours, standard_rate) VALUES (%L, %L, 1, 100)', wo2, 'c0b3c000-0000-4000-8000-000000000002'));
  IF v_err IS NULL OR v_err NOT ILIKE '%row-level security%' THEN
    RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — el gerente de E1 pudo insertar en la OT de E2 (err=%)', v_err;
  END IF;
  -- Cobranza, contabilidad, riesgos y asistente no escriben nada.
  FOREACH v_who IN ARRAY ARRAY[u4, u5, u6, u7] LOOP
    IF pg_temp.rows_as(v_who, 'UPDATE public.wo_budget_lines SET budgeted_hours = 77') <> 0
       OR pg_temp.rows_as(v_who, 'UPDATE public.wo_expense_budget SET expense_type_id = expense_type_id') <> 0
       OR pg_temp.rows_as(v_who, 'UPDATE public.activity_worksheet_cells SET budget_hours = 77') <> 0 THEN
      RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — % pudo editar presupuestos', v_who;
    END IF;
    v_err := pg_temp.try_as(v_who, format('INSERT INTO public.wo_expense_budget (wo_id, expense_type_id) VALUES (%L, %L)', wo1, 'ee3c0000-0000-4000-8000-000000000001'));
    IF v_err IS NULL OR v_err NOT ILIKE '%row-level security%' THEN
      RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — % pudo insertar un gasto presupuestado (err=%)', v_who, v_err;
    END IF;
  END LOOP;
  -- Estado previo intacto: la línea de la OT ajena y los totales no cambiaron por los rechazos.
  IF (SELECT budgeted_hours FROM public.wo_budget_lines WHERE wo_id = wo2::uuid) <> 7 THEN
    RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — la línea de la OT de E2 cambió pese a los rechazos';
  END IF;
  -- Contraparte: el admin escribe todo.
  IF pg_temp.rows_as(u1, 'UPDATE public.wo_budget_lines SET standard_rate = standard_rate') < 2 THEN
    RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — el admin debía alcanzar todas las líneas';
  END IF;
  RAISE NOTICE 'PASS — escritura: admin todo; gerente solo su encargo; cobranza, contabilidad, riesgos y asistente, nada; estado previo intacto';

  -- 4. No-vacuidad: la visibilidad sale del permiso y de la relación con el encargo ────────────────
  -- El paso 3 insertó una línea más en E1: el total vigente ya no es 2.
  SELECT count(*) INTO v_lines FROM public.wo_budget_lines;
  DELETE FROM public.authorization_role_permissions WHERE role_key = 'collections_analyst' AND permission_key = 'work_order.read';
  IF pg_temp.count_as(u4, 'wo_budget_lines') <> 0 THEN
    RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — sin work_order.read cobranza debía dejar de ver las líneas';
  END IF;
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  VALUES ('collections_analyst', 'work_order.read', 'department')
  ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;
  IF pg_temp.count_as(u4, 'wo_budget_lines') <> v_lines THEN
    RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — al devolver work_order.read cobranza debía volver a ver las % líneas', v_lines;
  END IF;
  -- Si U3 pasa a ser también gerente de E1, ve y edita las líneas de E1 (y deja de ser exclusivo de E2).
  UPDATE public.engagements SET manager_id = '50b3c000-0000-4000-8000-000000000003' WHERE engagement_id = 'e0b3c000-0000-4000-8000-000000000001';
  IF pg_temp.count_as(u3, 'wo_budget_lines') <> v_lines THEN
    RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — al ser gerente de ambos encargos U3 debía ver las % líneas', v_lines;
  END IF;
  IF pg_temp.count_as(u2, 'wo_budget_lines') <> 0 THEN
    RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — U2 ya no es gerente de E1 y no debía ver líneas';
  END IF;
  RAISE NOTICE 'PASS — la visibilidad depende de work_order.read y de ser gerente del encargo (se quita, se devuelve y se reasigna)';

  -- 5. anon real ───────────────────────────────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t);
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — anon pudo leer %', t;
    EXCEPTION WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
    END;
  END LOOP;
  RAISE NOTICE 'PASS — anon recibe permission denied en las tres';

  -- 6. Guarda estructural: ninguna función INVOKER escribe estas tablas ────────────────────────────
  -- batch_upsert_worksheet_cells y sync_worksheet_to_wo_budget son SECURITY DEFINER y saltan RLS. Una
  -- función INVOKER nueva que escriba aquí quedaría sujeta a las políticas y fallaría en silencio.
  SELECT count(*) INTO v_n
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND NOT p.prosecdef
     AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?(wo_budget_lines|wo_expense_budget|activity_worksheet_cells)\M';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'B3b PRESUPUESTOS FAIL — % función(es) INVOKER escriben presupuestos: %', v_n,
      (SELECT string_agg(p.proname, ', ' ORDER BY p.proname) FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND NOT p.prosecdef
          AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?(wo_budget_lines|wo_expense_budget|activity_worksheet_cells)\M');
  END IF;
  RAISE NOTICE 'PASS — 0 funciones INVOKER escriben los presupuestos';

  RAISE NOTICE 'B3b PRESUPUESTOS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
