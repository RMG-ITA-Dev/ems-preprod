-- 1028-213 — alcance de la OT: solo el socio y el gerente del encargo (más admin y los roles de firma/departamento)
-- leen la OT y sus datos hijos (presupuesto, gastos presupuestados, matriz de trabajo y sus celdas); crear la OT, crear la
-- matriz y sincronizar la matriz con la OT lo hace solo el gerente del encargo (o admin).
-- (20261020000000_rls_d1_lecturas_por_conjunto.sql, 20251204000005_cero_05_rls_policies.sql,
--  20261009120000_rls_carril_b.sql: sync_worksheet_to_wo_budget y la matriz de permisos B1.2;
--  decisiones D-20, D-21, D-24, D-25, D-42, H-2, H-3; criterios AC-22…AC-27 y AC-37.)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh. Transacción única, SIEMPRE hace ROLLBACK. Salida de éxito: una
-- NOTICE por chequeo, terminando en "WO SCOPE 1028-213: ALL CHECKS PASSED (rolled back)".
--
-- Lo que se prueba ES la RLS: las lecturas y los INSERT corren con `SET LOCAL ROLE authenticated` de verdad más el claim
-- JWT del usuario; sync_worksheet_to_wo_budget es SECURITY DEFINER y mira auth.uid(), así que se prueba con el claim. Cada
-- denegación tiene su contraparte de no-vacuidad: el mismo rol (con work_order.read / work_order.create en alcance asignado)
-- ve o escribe donde SÍ es socio o gerente, de modo que una política que vuelva a abrir el acceso hace fallar la suite.
--
-- Fixture world (ids con prefijo 2131):
--   U1 admin · U2 partner (socio de E1) · U3 manager (gerente de E1, E2 y E4) · U4 director (SQR de E1)
--   U5 director (encargado de E1) · U6 risk_partner (socio de E2) · U7 risk_supervisor · U8 ita_manager (gerente de E3)
--   U9 manager (SQR de E4) · U10 manager (encargado de E4) · U11 manager (socio de E4)
--   E1/E2/E3: una OT, un presupuesto, un gasto presupuestado y una matriz con una celda cada uno.
--   E4: equipo U3/U9/U10/U11 con OT4 y matriz WS4 sin vincular (blanco de la sincronización).
--   E5/E6: el mismo equipo, sin OT ni matriz (blanco de los INSERT).

BEGIN;

-- ── Fixtures (como owner) ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.clients (client_id, client_legal_name, tax_id)
VALUES ('c2131000-0000-4000-8000-000000000001', 'Cliente 1028-213 alcance', 'NIT-2131');

INSERT INTO auth.users (id)
SELECT ('a2131000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid FROM generate_series(1, 11) AS n;

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a2131000-0000-4000-8000-000000000001', 'admin',    'admin'),
  ('a2131000-0000-4000-8000-000000000002', 'partner',  'partner'),
  ('a2131000-0000-4000-8000-000000000003', 'manager',  'manager'),
  ('a2131000-0000-4000-8000-000000000004', 'director', 'director'),
  ('a2131000-0000-4000-8000-000000000005', 'director', 'director'),
  ('a2131000-0000-4000-8000-000000000006', 'partner',  'risk_partner'),
  ('a2131000-0000-4000-8000-000000000007', 'staff',    'risk_supervisor'),
  ('a2131000-0000-4000-8000-000000000008', 'manager',  'ita_manager'),
  ('a2131000-0000-4000-8000-000000000009', 'manager',  'manager'),
  ('a2131000-0000-4000-8000-000000000010', 'manager',  'manager'),
  ('a2131000-0000-4000-8000-000000000011', 'manager',  'manager')
-- handle_new_user puede haber creado ya la fila del usuario (según el ambiente): se pisa con el rol del fixture.
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, role_key = EXCLUDED.role_key;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
SELECT ('52131000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       ('a2131000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'U' || n, 'Staff2131',
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1)
FROM generate_series(1, 11) AS n;

-- Encargos con triggers apagados: el fixture asigna cargos (socio, gerente, SQR, encargado) sin pasar por las guardas de equipo.
SET LOCAL session_replication_role = replica;
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, funcion, practica,
                                fecha_cierre, work_order_required, approval_required, society_id,
                                partner_id, manager_id, sqr_id, encargado_id)
SELECT ('e2131000-0000-4000-8000-00000000000' || e.n)::uuid, 'c2131000-0000-4000-8000-000000000001',
       'Alcance 2131 ' || e.n, '2131-E' || e.n, 1, 1, '2027-12-31', false, false,
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
       e.partner, e.manager, e.sqr, e.encargado
FROM (VALUES
  ('1', '52131000-0000-4000-8000-000000000002'::uuid, '52131000-0000-4000-8000-000000000003'::uuid, '52131000-0000-4000-8000-000000000004'::uuid, '52131000-0000-4000-8000-000000000005'::uuid),
  ('2', '52131000-0000-4000-8000-000000000006'::uuid, '52131000-0000-4000-8000-000000000003'::uuid, NULL::uuid, NULL::uuid),
  ('3', NULL::uuid,                                   '52131000-0000-4000-8000-000000000008'::uuid, NULL::uuid, NULL::uuid),
  ('4', '52131000-0000-4000-8000-000000000011'::uuid, '52131000-0000-4000-8000-000000000003'::uuid, '52131000-0000-4000-8000-000000000009'::uuid, '52131000-0000-4000-8000-000000000010'::uuid),
  ('5', '52131000-0000-4000-8000-000000000011'::uuid, '52131000-0000-4000-8000-000000000003'::uuid, '52131000-0000-4000-8000-000000000009'::uuid, '52131000-0000-4000-8000-000000000010'::uuid),
  ('6', '52131000-0000-4000-8000-000000000011'::uuid, '52131000-0000-4000-8000-000000000003'::uuid, '52131000-0000-4000-8000-000000000009'::uuid, '52131000-0000-4000-8000-000000000010'::uuid)
) AS e(n, partner, manager, sqr, encargado);

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status)
SELECT ('42131000-0000-4000-8000-00000000000' || n)::uuid, ('e2131000-0000-4000-8000-00000000000' || n)::uuid, 'BOB', 'High', 'Draft'
FROM (VALUES ('1'), ('2'), ('3'), ('4')) AS v(n);
SET LOCAL session_replication_role = origin;

INSERT INTO public.activity_codes (activity_id, activity_code, description, practica_id, is_system, is_active)
VALUES ('a1213100-0000-4000-8000-000000000001', 'S2131-A1', 'Alcance 2131 actividad',
        (SELECT practica_id FROM public.practicas WHERE code = 1), false, true);

INSERT INTO public.categories (category_id, category_name, display_order, rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd, practica_id)
VALUES ('c0213100-0000-4000-8000-000000000001', 'Alcance 2131 Cat', 8131, 100, 50, 15, 7,
        (SELECT practica_id FROM public.practicas WHERE code = 1));

INSERT INTO public.expense_types (expense_type_id, expense_name) VALUES ('ee213100-0000-4000-8000-000000000001', 'Alcance 2131 gasto');

-- Presupuesto y gasto presupuestado de OT1..OT3.
INSERT INTO public.wo_budget_lines (wo_id, category_id, budgeted_hours, standard_rate)
SELECT ('42131000-0000-4000-8000-00000000000' || n)::uuid, 'c0213100-0000-4000-8000-000000000001', 10, 100
FROM (VALUES ('1'), ('2'), ('3')) AS v(n);
INSERT INTO public.wo_expense_budget (wo_id, expense_type_id)
SELECT ('42131000-0000-4000-8000-00000000000' || n)::uuid, 'ee213100-0000-4000-8000-000000000001'
FROM (VALUES ('1'), ('2'), ('3')) AS v(n);

-- Matrices: WS1..WS3 vinculadas a su OT; WS4 (E4) sin vincular, blanco de sync_worksheet_to_wo_budget.
INSERT INTO public.activity_worksheets (id, engagement_id, wo_id, version) VALUES
  ('32131000-0000-4000-8000-000000000001', 'e2131000-0000-4000-8000-000000000001', '42131000-0000-4000-8000-000000000001', 1),
  ('32131000-0000-4000-8000-000000000002', 'e2131000-0000-4000-8000-000000000002', '42131000-0000-4000-8000-000000000002', 1),
  ('32131000-0000-4000-8000-000000000003', 'e2131000-0000-4000-8000-000000000003', '42131000-0000-4000-8000-000000000003', 1),
  ('32131000-0000-4000-8000-000000000004', 'e2131000-0000-4000-8000-000000000004', NULL,                                   1);
INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
SELECT ('32131000-0000-4000-8000-00000000000' || n)::uuid, 'c0213100-0000-4000-8000-000000000001',
       'a1213100-0000-4000-8000-000000000001', 5
FROM (VALUES ('1'), ('2'), ('3'), ('4')) AS v(n);

-- ── Helpers (temp) ────────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION pg_temp.u(p_n int) RETURNS text
LANGUAGE sql AS $$ SELECT 'a2131000-0000-4000-8000-0000000000' || lpad(p_n::text, 2, '0') $$;

-- Filas visibles para el usuario U<n> en la tabla, con el rol authenticated real, acotadas a las filas del fixture E1..E3.
CREATE FUNCTION pg_temp.count_as(p_n int, p_table text, p_filter text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE c bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p_n), 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', p_table, p_filter) INTO c;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN c;
END $$;

-- SQLERRM con que falló la sentencia (NULL si tuvo éxito), con el rol authenticated real. Los cambios que prosperan se conservan
-- (dentro de la transacción) y el claim se limpia siempre.
CREATE FUNCTION pg_temp.try_as(p_n int, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p_n), 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN SQLERRM;
END $$;

-- Igual, pero sin cambiar de rol de Postgres: para las funciones SECURITY DEFINER que leen auth.uid() del claim.
CREATE FUNCTION pg_temp.try_claim(p_n int, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p_n), 'role', 'authenticated')::text, true);
  EXECUTE p_sql;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN SQLERRM;
END $$;

DO $$
DECLARE
  -- Filtros que acotan cada tabla a las filas de E1..E3 (OT1..OT3 / WS1..WS3), para que el conteo no dependa de otras filas del harness.
  f_wo constant text := $f$wo_id IN ('42131000-0000-4000-8000-000000000001', '42131000-0000-4000-8000-000000000002', '42131000-0000-4000-8000-000000000003')$f$;
  f_ws constant text := $f$id IN ('32131000-0000-4000-8000-000000000001', '32131000-0000-4000-8000-000000000002', '32131000-0000-4000-8000-000000000003')$f$;
  f_ce constant text := $f$worksheet_id IN ('32131000-0000-4000-8000-000000000001', '32131000-0000-4000-8000-000000000002', '32131000-0000-4000-8000-000000000003')$f$;
  f_en constant text := $f$engagement_id IN ('e2131000-0000-4000-8000-000000000001', 'e2131000-0000-4000-8000-000000000002', 'e2131000-0000-4000-8000-000000000003')$f$;
  e4   constant text := 'e2131000-0000-4000-8000-000000000004';
  e5   constant text := 'e2131000-0000-4000-8000-000000000005';
  e6   constant text := 'e2131000-0000-4000-8000-000000000006';
  ot4  constant text := '42131000-0000-4000-8000-000000000004';
  ws4  constant text := '32131000-0000-4000-8000-000000000004';
  err  text;
  who  int;
  c    bigint;
  expected bigint;
BEGIN
  -- ═════════════════════════════════════════════════════════════════
  -- Lectura: OT, presupuesto, gastos presupuestados, matriz y celdas
  -- ═════════════════════════════════════════════════════════════════
  FOREACH who IN ARRAY ARRAY[1, 2, 3, 4, 5, 6, 7, 8] LOOP
    -- Las cinco tablas deben mostrar al usuario exactamente el mismo número de filas (cada OT tiene un presupuesto, un gasto, una matriz y una celda).
    c := pg_temp.count_as(who, 'work_orders', f_wo);
    IF pg_temp.count_as(who, 'wo_budget_lines', f_wo)        <> c
    OR pg_temp.count_as(who, 'wo_expense_budget', f_wo)      <> c
    OR pg_temp.count_as(who, 'activity_worksheets', f_ws)    <> c
    OR pg_temp.count_as(who, 'activity_worksheet_cells', f_ce) <> c THEN
      RAISE EXCEPTION 'WO SCOPE FAIL — U%: OT (%), presupuesto (%), gastos (%), matrices (%) y celdas (%) no coinciden', who, c,
        pg_temp.count_as(who, 'wo_budget_lines', f_wo), pg_temp.count_as(who, 'wo_expense_budget', f_wo),
        pg_temp.count_as(who, 'activity_worksheets', f_ws), pg_temp.count_as(who, 'activity_worksheet_cells', f_ce);
    END IF;
    -- El esperado va en una variable: dentro de un IF de plpgsql el primer THEN de nivel superior cierra la condición, y el CASE trae los suyos.
    expected := CASE who
              WHEN 1 THEN 3   -- admin: todo
              WHEN 2 THEN 1   -- socio de E1 (AC-29)
              WHEN 3 THEN 2   -- gerente de E1 y E2 (AC-29)
              WHEN 4 THEN 0   -- director que es SOLO SQR de E1 (AC-25)
              WHEN 5 THEN 0   -- director que es SOLO encargado de E1 (AC-26)
              WHEN 6 THEN 1   -- risk_partner: solo la OT/matriz donde es socio (E2) (AC-23, H-3)
              WHEN 7 THEN 0   -- risk_supervisor: ninguna (AC-22, D-24)
              WHEN 8 THEN 1   -- ITA: solo el encargo donde es gerente (AC-27)
            END;
    IF c <> expected THEN
      RAISE EXCEPTION 'WO SCOPE FAIL — U% ve % de las 3 filas de OT/presupuesto/gastos/matriz/celdas de E1..E3', who, c;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — lectura: admin 3; socio E1 1; gerente E1+E2 2; SQR 0; encargado 0; RP solo donde es socio 1; RS 0; ITA solo donde es gerente 1 (OT, presupuesto, gastos, matriz y celdas)';

  -- R2 (AC-25): el SQR y el encargado SÍ ven el encargo (lo que alimenta "Mis asignaciones"): no es una denegación por tabla vacía.
  FOREACH who IN ARRAY ARRAY[4, 5] LOOP
    IF pg_temp.count_as(who, 'engagements', f_en) <> 1 THEN
      RAISE EXCEPTION 'WO SCOPE FAIL — U% debía seguir viendo exactamente el encargo E1 (ve %)', who, pg_temp.count_as(who, 'engagements', f_en);
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — R2: el SQR y el encargado conservan el encargo (1 fila de engagements) aunque no ven la OT';

  -- R3: el catálogo de permisos que sostiene lo anterior (si cambia, la suite pierde sentido: que falle aquí y no en silencio).
  IF NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'director' AND permission_key = 'work_order.read' AND scope_key = 'assigned_engagements')
     OR NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'manager' AND permission_key = 'work_order.create' AND scope_key = 'assigned_engagements')
     OR NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'manager' AND permission_key = 'worksheet.create' AND scope_key = 'assigned_engagements')
     OR EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'risk_supervisor' AND permission_key = 'work_order.read')
     OR NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'risk_partner' AND permission_key = 'work_order.read' AND scope_key = 'assigned_engagements')
     OR NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'risk_partner' AND permission_key = 'worksheet.read' AND scope_key = 'assigned_engagements') THEN
    RAISE EXCEPTION 'WO SCOPE FAIL — R3: premisa de permisos (director con work_order.read assigned; manager con work_order/worksheet.create assigned; RS sin work_order.read; RP con work_order.read y worksheet.read assigned)';
  END IF;
  RAISE NOTICE 'PASS — R3: premisas de permisos (los roles probados SÍ tienen el permiso y el alcance asignado; la denegación sale de la relación con el encargo)';

  -- ═════════════════════════════════════════════════════════════════
  -- Crear la OT y la matriz: solo el gerente del encargo (y admin) — AC-37
  -- ═════════════════════════════════════════════════════════════════

  -- C1: el SQR, el encargado y el socio que no es gerente (los tres con rol manager: work_order.create / worksheet.create assigned) no crean.
  FOREACH who IN ARRAY ARRAY[9, 10, 11] LOOP
    err := pg_temp.try_as(who, format('INSERT INTO public.work_orders (engagement_id, currency, season_mode) VALUES (%L, ''BOB'', ''High'')', e5));
    IF err IS NULL OR err NOT ILIKE '%row-level security%' THEN
      RAISE EXCEPTION 'WO SCOPE FAIL — C1: U% creó una OT en E5 sin ser gerente (err=%)', who, err;
    END IF;
    err := pg_temp.try_as(who, format('INSERT INTO public.activity_worksheets (id, engagement_id, version) VALUES (gen_random_uuid(), %L, 1)', e5));
    IF err IS NULL OR err NOT ILIKE '%row-level security%' THEN
      RAISE EXCEPTION 'WO SCOPE FAIL — C1: U% creó una matriz en E5 sin ser gerente (err=%)', who, err;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.work_orders WHERE engagement_id = e5::uuid)
     OR EXISTS (SELECT 1 FROM public.activity_worksheets WHERE engagement_id = e5::uuid) THEN
    RAISE EXCEPTION 'WO SCOPE FAIL — C1: un INSERT rechazado dejó una OT o una matriz en E5';
  END IF;
  -- El socio con rol partner (sin work_order.create) tampoco: no es un permiso de socio.
  err := pg_temp.try_as(2, format('INSERT INTO public.work_orders (engagement_id, currency, season_mode) VALUES (%L, ''BOB'', ''High'')', e5));
  IF err IS NULL OR err NOT ILIKE '%row-level security%' THEN
    RAISE EXCEPTION 'WO SCOPE FAIL — C1: el socio (rol partner) creó una OT (err=%)', err;
  END IF;

  -- C2 (contraparte): el gerente del encargo y el admin sí crean la OT y la matriz.
  err := pg_temp.try_as(3, format('INSERT INTO public.work_orders (engagement_id, currency, season_mode) VALUES (%L, ''BOB'', ''High'')', e5));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'WO SCOPE FAIL — C2: el gerente de E5 no pudo crear la OT (err=%)', err; END IF;
  err := pg_temp.try_as(3, format('INSERT INTO public.activity_worksheets (id, engagement_id, version) VALUES (gen_random_uuid(), %L, 1)', e5));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'WO SCOPE FAIL — C2: el gerente de E5 no pudo crear la matriz (err=%)', err; END IF;
  err := pg_temp.try_as(1, format('INSERT INTO public.work_orders (engagement_id, currency, season_mode) VALUES (%L, ''BOB'', ''High'')', e6));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'WO SCOPE FAIL — C2: el admin no pudo crear la OT (err=%)', err; END IF;
  err := pg_temp.try_as(1, format('INSERT INTO public.activity_worksheets (id, engagement_id, version) VALUES (gen_random_uuid(), %L, 1)', e6));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'WO SCOPE FAIL — C2: el admin no pudo crear la matriz (err=%)', err; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.work_orders WHERE engagement_id = e5::uuid)
     OR NOT EXISTS (SELECT 1 FROM public.work_orders WHERE engagement_id = e6::uuid)
     OR NOT EXISTS (SELECT 1 FROM public.activity_worksheets WHERE engagement_id = e5::uuid)
     OR NOT EXISTS (SELECT 1 FROM public.activity_worksheets WHERE engagement_id = e6::uuid) THEN
    RAISE EXCEPTION 'WO SCOPE FAIL — C2: las altas del gerente y del admin no quedaron';
  END IF;
  RAISE NOTICE 'PASS — C1/C2: crear OT y matriz solo el gerente del encargo y el admin; SQR, encargado, socio-no-gerente y socio (rol partner) no';

  -- ═════════════════════════════════════════════════════════════════
  -- Sincronizar la matriz con la OT (sync_worksheet_to_wo_budget) — AC-37
  -- ═════════════════════════════════════════════════════════════════

  -- S1: el SQR, el encargado y el socio que no es gerente reciben NOT_AUTHORIZED y la matriz queda sin vincular, sin líneas de presupuesto.
  FOREACH who IN ARRAY ARRAY[9, 10, 11] LOOP
    err := pg_temp.try_claim(who, format('SELECT public.sync_worksheet_to_wo_budget(%L, %L)', ws4, ot4));
    IF err IS DISTINCT FROM 'NOT_AUTHORIZED' THEN
      RAISE EXCEPTION 'WO SCOPE FAIL — S1: U% sincronizó o no recibió NOT_AUTHORIZED (err=%)', who, err;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.activity_worksheets WHERE id = ws4::uuid AND wo_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.wo_budget_lines WHERE wo_id = ot4::uuid) THEN
    RAISE EXCEPTION 'WO SCOPE FAIL — S1: una sincronización rechazada vinculó la matriz o escribió presupuesto';
  END IF;

  -- S2 (contraparte): el gerente sincroniza y deja la matriz vinculada con su línea de presupuesto; el admin también.
  err := pg_temp.try_claim(3, format('SELECT public.sync_worksheet_to_wo_budget(%L, %L)', ws4, ot4));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'WO SCOPE FAIL — S2: el gerente de E4 no pudo sincronizar (err=%)', err; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activity_worksheets WHERE id = ws4::uuid AND wo_id = ot4::uuid)
     OR (SELECT count(*) FROM public.wo_budget_lines WHERE wo_id = ot4::uuid) <> 1 THEN
    RAISE EXCEPTION 'WO SCOPE FAIL — S2: la sincronización del gerente no vinculó la matriz ni creó la línea de presupuesto';
  END IF;
  err := pg_temp.try_claim(1, format('SELECT public.sync_worksheet_to_wo_budget(%L, %L)', ws4, ot4));
  IF err IS NOT NULL THEN RAISE EXCEPTION 'WO SCOPE FAIL — S2: el admin no pudo sincronizar (err=%)', err; END IF;
  RAISE NOTICE 'PASS — S1/S2: sincronizar matriz y OT solo el gerente del encargo y el admin; SQR, encargado y socio-no-gerente reciben NOT_AUTHORIZED';

  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'WO SCOPE 1028-213: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
