-- Carril B / B3d — RLS de las horas y sus aprobaciones: time_entries, timer_entries, timesheet_periods y
-- timesheet_line_approvals (20261012190000_rls_carril_b3d_horas.sql)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de B3c-3. Transacción única, SIEMPRE hace ROLLBACK.
-- Salida de éxito: una NOTICE por chequeo, terminando en "B3d HORAS: ALL CHECKS PASSED (rolled back)".
--
-- Lo que se prueba ES la RLS: todo corre con `SET LOCAL ROLE authenticated` real más el claim JWT del usuario.
-- Cada regla tiene su contraparte de no-vacuidad (la visibilidad cambia al quitar y devolver el campo o el permiso).
--
-- Fixture world (ids con prefijo b3d):
--   Personas: SP senior_partner, ADM admin, MGR manager, PTN partner, DIR director, SQR sqr, ENC assistant (encargado),
--             SPE ita_senior (especialista), WRK semisenior (quien carga horas), HR hr_manager.
--   Encargos: E1 (gerente MGR, socio PTN, encargado ENC, sqr SQR, especialista IT SPE), E2 (gerente MGR, socio DIR),
--             E3 (socio SQR: SQR figura como partner_id, no solo como sqr_id).
--   Boletas:  P1 de WRK (semana 02-mar: horas en E1 y E2; línea de E1 pendiente, línea de E2 aprobada),
--             P2 de WRK (semana 09-mar: borrador en E3, sin enviar y sin líneas),
--             P3 de PTN (semana 02-mar: 2 h en E1, línea pendiente; PTN se AUTOAPRUEBA: nadie la aprueba por asignación).
--   Timer:    uno de WRK en E1.

BEGIN;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1b3d000-0000-4000-8000-000000000001', 'B3d Cliente', 'B3D-TAX-001');

-- auth.users dispara handle_new_user en una base real (Dev 2.0): solo para este INSERT se apagan los triggers.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id)
SELECT ('a0b3d000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid FROM generate_series(1, 10) n;
SET LOCAL session_replication_role = origin;

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0b3d000-0000-4000-8000-000000000001', 'partner',  'senior_partner'),
  ('a0b3d000-0000-4000-8000-000000000002', 'admin',    'admin'),
  ('a0b3d000-0000-4000-8000-000000000003', 'manager',  'manager'),
  ('a0b3d000-0000-4000-8000-000000000004', 'partner',  'partner'),
  ('a0b3d000-0000-4000-8000-000000000005', 'director', 'director'),
  ('a0b3d000-0000-4000-8000-000000000006', 'sqr',      'sqr'),
  ('a0b3d000-0000-4000-8000-000000000007', 'staff',    'assistant'),
  ('a0b3d000-0000-4000-8000-000000000008', 'specialist_it', 'ita_senior'),
  ('a0b3d000-0000-4000-8000-000000000009', 'semisenior', 'semisenior'),
  ('a0b3d000-0000-4000-8000-000000000010', 'staff',    'hr_manager');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
SELECT ('50b3d000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       ('a0b3d000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'U' || n, 'B3d',
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1)
FROM generate_series(1, 10) n;

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, practica, fecha_cierre,
                                work_order_required, approval_required, society_id,
                                manager_id, partner_id, sqr_id, encargado_id, specialist_it_id)
SELECT e.id::uuid, 'c1b3d000-0000-4000-8000-000000000001', 'B3d ' || e.code, 'B3D-' || e.code, 1, '2027-12-31',
       false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
       e.mgr::uuid, e.ptn::uuid, e.sqr::uuid, e.enc::uuid, e.spe::uuid
FROM (VALUES
  ('e0b3d000-0000-4000-8000-000000000001', 'E1', '50b3d000-0000-4000-8000-000000000003', '50b3d000-0000-4000-8000-000000000004',
   '50b3d000-0000-4000-8000-000000000006', '50b3d000-0000-4000-8000-000000000007', '50b3d000-0000-4000-8000-000000000008'),
  ('e0b3d000-0000-4000-8000-000000000002', 'E2', '50b3d000-0000-4000-8000-000000000003', '50b3d000-0000-4000-8000-000000000005',
   NULL, NULL, NULL),
  ('e0b3d000-0000-4000-8000-000000000003', 'E3', NULL, '50b3d000-0000-4000-8000-000000000006', NULL, NULL, NULL)
) AS e(id, code, mgr, ptn, sqr, enc, spe);

-- end_date va en el FUTURO a propósito (ver la suite de B3c-2): con una fecha vencida el encargo pasa a override 7 y
-- check_wo_approved rechaza las horas del fixture según el día en que corra.
UPDATE public.engagements SET start_date = '2026-01-05', end_date = '2099-06-30' WHERE engagement_code LIKE 'B3D-%';

INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id)
VALUES ('B3D-ACT', 'Harness Activity B3d', true, NULL)
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;

INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year) VALUES
  ('b0b3d000-0000-4000-8000-000000000001', '50b3d000-0000-4000-8000-000000000009', '2026-03-02', 10, 2026),
  ('b0b3d000-0000-4000-8000-000000000002', '50b3d000-0000-4000-8000-000000000009', '2026-03-09', 11, 2026),
  ('b0b3d000-0000-4000-8000-000000000003', '50b3d000-0000-4000-8000-000000000004', '2026-03-02', 10, 2026);

INSERT INTO public.time_entries (time_id, staff_id, engagement_id, activity_id, date_worked, hours_logged, period_id, is_forecast)
SELECT v.tid::uuid, v.sid::uuid, v.eid::uuid, (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'B3D-ACT'),
       v.d::date, v.h, v.pid::uuid, false
FROM (VALUES
  ('d0b3d000-0000-4000-8000-000000000001', '50b3d000-0000-4000-8000-000000000009', 'e0b3d000-0000-4000-8000-000000000001', '2026-03-03', 4, 'b0b3d000-0000-4000-8000-000000000001'),  -- T1 WRK en E1
  ('d0b3d000-0000-4000-8000-000000000002', '50b3d000-0000-4000-8000-000000000009', 'e0b3d000-0000-4000-8000-000000000002', '2026-03-03', 3, 'b0b3d000-0000-4000-8000-000000000001'),  -- T2 WRK en E2
  ('d0b3d000-0000-4000-8000-000000000003', '50b3d000-0000-4000-8000-000000000009', 'e0b3d000-0000-4000-8000-000000000003', '2026-03-10', 5, 'b0b3d000-0000-4000-8000-000000000002'),  -- T3 WRK en E3 (borrador)
  ('d0b3d000-0000-4000-8000-000000000004', '50b3d000-0000-4000-8000-000000000004', 'e0b3d000-0000-4000-8000-000000000001', '2026-03-04', 2, 'b0b3d000-0000-4000-8000-000000000003')   -- T4 PTN en E1
) AS v(tid, sid, eid, d, h, pid);

INSERT INTO public.timesheet_line_approvals (approval_id, period_id, engagement_id, activity_id, status, approved_by, approved_at)
SELECT v.aid::uuid, v.pid::uuid, v.eid::uuid, (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'B3D-ACT'),
       v.st, v.ab::uuid, CASE WHEN v.st = 'approved' THEN now() END
FROM (VALUES
  ('f0b3d000-0000-4000-8000-000000000001', 'b0b3d000-0000-4000-8000-000000000001', 'e0b3d000-0000-4000-8000-000000000001', 'pending',  NULL),   -- L1
  ('f0b3d000-0000-4000-8000-000000000002', 'b0b3d000-0000-4000-8000-000000000001', 'e0b3d000-0000-4000-8000-000000000002', 'approved', '50b3d000-0000-4000-8000-000000000003'),  -- L2
  ('f0b3d000-0000-4000-8000-000000000003', 'b0b3d000-0000-4000-8000-000000000003', 'e0b3d000-0000-4000-8000-000000000001', 'pending',  NULL)    -- L3
) AS v(aid, pid, eid, st, ab);

UPDATE public.timesheet_periods SET submitted_at = now()
 WHERE period_id IN ('b0b3d000-0000-4000-8000-000000000001', 'b0b3d000-0000-4000-8000-000000000003');

INSERT INTO public.timer_entries (timer_id, staff_id, engagement_id, activity_id, started_at, ended_at, duration_minutes) VALUES
  ('c0b3d000-0000-4000-8000-000000000001', '50b3d000-0000-4000-8000-000000000009', 'e0b3d000-0000-4000-8000-000000000001',
   (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'B3D-ACT'), now() - interval '1 hour', now(), 60);

-- Filas que ve el usuario sobre las filas del fixture.
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

-- Filas que alcanza un UPDATE/INSERT/DELETE (la RLS no da error en UPDATE/DELETE: oculta las filas). -1 si falló.
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
  sp  constant text := 'a0b3d000-0000-4000-8000-000000000001';  -- senior_partner
  adm constant text := 'a0b3d000-0000-4000-8000-000000000002';  -- admin
  mgr constant text := 'a0b3d000-0000-4000-8000-000000000003';  -- manager (E1, E2)
  ptn constant text := 'a0b3d000-0000-4000-8000-000000000004';  -- partner (socio de E1)
  dir constant text := 'a0b3d000-0000-4000-8000-000000000005';  -- director (socio de E2)
  sqr constant text := 'a0b3d000-0000-4000-8000-000000000006';  -- sqr (sqr_id de E1, partner_id de E3)
  enc constant text := 'a0b3d000-0000-4000-8000-000000000007';  -- assistant (encargado de E1)
  spe constant text := 'a0b3d000-0000-4000-8000-000000000008';  -- ita_senior (especialista de E1)
  wrk constant text := 'a0b3d000-0000-4000-8000-000000000009';  -- semisenior (dueño de P1 y P2)
  hr  constant text := 'a0b3d000-0000-4000-8000-000000000010';  -- hr_manager
  -- Sin JOIN a engagements: bajo RLS ocultaría filas por la visibilidad del encargo y mediría otra cosa.
  te  constant text := 'SELECT count(*) FROM public.time_entries WHERE time_id::text LIKE ''d0b3d000-%''';
  pe  constant text := 'SELECT count(*) FROM public.timesheet_periods WHERE period_id::text LIKE ''b0b3d000-%''';
  li  constant text := 'SELECT count(*) FROM public.timesheet_line_approvals WHERE period_id::text LIKE ''b0b3d000-%''';
  ti  constant text := 'SELECT count(*) FROM public.timer_entries WHERE timer_id::text LIKE ''c0b3d000-%''';
  v bigint;
BEGIN
  -- 1. Estructura ─────────────────────────────────────────────────────────────────────────────────
  IF (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relrowsecurity
        AND relname IN ('time_entries', 'timer_entries', 'timesheet_periods', 'timesheet_line_approvals')) <> 4 THEN
    RAISE EXCEPTION 'B3d FAIL — las 4 tablas de horas deben tener RLS activa';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
        AND ((tablename = 'timesheet_periods'        AND policyname = 'Responsible read periods')
          OR (tablename = 'timesheet_line_approvals' AND policyname = 'Responsible read line approvals')
          OR (tablename = 'time_entries'             AND policyname = 'time_entries read' AND qual LIKE '%my_responsible_engagement_ids%')
          OR (tablename = 'timer_entries'            AND policyname = 'timer_entries read' AND qual LIKE '%is_admin%')
          OR (tablename = 'timesheet_periods'        AND policyname = 'Firm-wide read periods' AND qual LIKE '%is_firm_hours_reader%')
          OR (tablename = 'timesheet_line_approvals' AND policyname = 'Firm-wide read line approvals' AND qual LIKE '%is_firm_hours_reader%'))) <> 6 THEN
    RAISE EXCEPTION 'B3d FAIL — faltan las políticas de lectura de B3d (responsible read x2, firm-wide read x2, time_entries read, timer_entries read)';
  END IF;
  IF has_function_privilege('anon', 'public.my_responsible_engagement_ids()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.my_responsible_period_ids()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_firm_hours_reader()', 'EXECUTE') THEN
    RAISE EXCEPTION 'B3d FAIL — anon no debe poder ejecutar los helpers de B3d';
  END IF;
  RAISE NOTICE 'PASS — estructura: RLS en las 4 tablas, 6 políticas de lectura de B3d y helpers sin EXECUTE de anon';

  -- 2. time_entries: quién ve las horas de quién ───────────────────────────────────────────────
  -- Fixture: T1 (WRK en E1), T2 (WRK en E2), T3 (WRK en E3, borrador), T4 (PTN en E1).
  IF pg_temp.count_as(sp, te)  <> 4 THEN RAISE EXCEPTION 'B3d FAIL — senior_partner debía ver las 4 horas del fixture (incluida la de borrador)'; END IF;
  IF pg_temp.count_as(adm, te) <> 4 THEN RAISE EXCEPTION 'B3d FAIL — admin debía ver las 4 horas del fixture'; END IF;
  IF pg_temp.count_as(mgr, te) <> 3 THEN RAISE EXCEPTION 'B3d FAIL — el gerente de E1 y E2 debía ver T1, T2 y T4 (3), no las de E3'; END IF;
  IF pg_temp.count_as(ptn, te) <> 2 THEN RAISE EXCEPTION 'B3d FAIL — el socio de E1 debía ver T1 y T4 (2)'; END IF;
  IF pg_temp.count_as(dir, te) <> 1 THEN RAISE EXCEPTION 'B3d FAIL — el director, socio de E2, debía ver solo T2 (1)'; END IF;
  IF pg_temp.count_as(enc, te) <> 2 THEN RAISE EXCEPTION 'B3d FAIL — el encargado de E1 debía ver T1 y T4 (2)'; END IF;
  IF pg_temp.count_as(wrk, te) <> 3 THEN RAISE EXCEPTION 'B3d FAIL — el dueño debía ver sus 3 horas, incluida la guardada sin enviar'; END IF;
  RAISE NOTICE 'PASS — horas: firma (admin y senior_partner) ve todo; gerente, socio y encargado ven las de su encargo; el dueño ve las suyas';

  -- sqr: cuenta como socio SOLO donde figura como partner_id (E3), no por sqr_id (E1); el especialista no ve el equipo.
  IF pg_temp.count_as(sqr, te) <> 1 THEN RAISE EXCEPTION 'B3d FAIL — sqr debía ver solo T3 (socio de E3), no las de E1 por sqr_id'; END IF;
  IF pg_temp.count_as(spe, te) <> 0 THEN RAISE EXCEPTION 'B3d FAIL — el especialista de E1 no debía ver las horas del equipo por su campo'; END IF;
  IF pg_temp.count_as(hr, te)  <> 0 THEN RAISE EXCEPTION 'B3d FAIL — hr_manager no es responsable de ningún encargo del fixture y no debía ver horas'; END IF;
  RAISE NOTICE 'PASS — sqr solo como partner_id, el especialista y hr_manager sin responsabilidad no ven horas ajenas';

  -- 3. Decisión 3: el responsable ve solo SUS encargos de una boleta compartida (P1 tiene E1 y E2) ──
  IF pg_temp.count_as(dir, 'SELECT count(*) FROM public.time_entries WHERE period_id = ''b0b3d000-0000-4000-8000-000000000001''') <> 1 THEN
    RAISE EXCEPTION 'B3d FAIL — el socio de E2 debía ver solo la hora de E2 de la boleta P1';
  END IF;
  IF pg_temp.count_as(dir, 'SELECT count(*) FROM public.timesheet_line_approvals WHERE period_id = ''b0b3d000-0000-4000-8000-000000000001''') <> 1 THEN
    RAISE EXCEPTION 'B3d FAIL — el socio de E2 debía ver solo la línea de E2 de la boleta P1';
  END IF;
  RAISE NOTICE 'PASS — boleta compartida: el responsable ve solo las horas y líneas de sus encargos';

  -- 4. Períodos y líneas ──────────────────────────────────────────────────────────────────────
  -- Períodos: SP/ADM 3 (firma); MGR P1 y P3; PTN P1 y P3; DIR P1; SQR P2; ENC P1 y P3; WRK P1 y P2; SPE y HR 0.
  IF pg_temp.count_as(sp, pe) <> 3 OR pg_temp.count_as(adm, pe) <> 3 THEN
    RAISE EXCEPTION 'B3d FAIL — la firma debía ver los 3 períodos (senior_partner=%, admin=%)', pg_temp.count_as(sp, pe), pg_temp.count_as(adm, pe);
  END IF;
  IF pg_temp.count_as(mgr, pe) <> 2 THEN RAISE EXCEPTION 'B3d FAIL — el gerente debía ver P1 y P3'; END IF;
  IF pg_temp.count_as(ptn, pe) <> 2 THEN RAISE EXCEPTION 'B3d FAIL — el socio de E1 debía ver P1 (responsable) y P3 (propio)'; END IF;
  IF pg_temp.count_as(dir, pe) <> 1 THEN RAISE EXCEPTION 'B3d FAIL — el director, socio de E2, debía ver solo P1'; END IF;
  IF pg_temp.count_as(sqr, pe) <> 1 THEN RAISE EXCEPTION 'B3d FAIL — sqr (socio de E3) debía ver solo P2'; END IF;
  IF pg_temp.count_as(enc, pe) <> 2 THEN RAISE EXCEPTION 'B3d FAIL — el encargado de E1 debía ver P1 y P3'; END IF;
  IF pg_temp.count_as(wrk, pe) <> 2 THEN RAISE EXCEPTION 'B3d FAIL — el dueño debía ver sus 2 boletas'; END IF;
  IF pg_temp.count_as(spe, pe) <> 0 OR pg_temp.count_as(hr, pe) <> 0 THEN RAISE EXCEPTION 'B3d FAIL — especialista y hr_manager no debían ver boletas ajenas'; END IF;
  -- Líneas: SP/ADM 3; MGR 3; PTN L1 y L3; DIR L2; SQR 0 (E3 no tiene líneas); ENC L1 y L3; WRK L1 y L2; SPE y HR 0.
  IF pg_temp.count_as(sp, li) <> 3 OR pg_temp.count_as(adm, li) <> 3 THEN RAISE EXCEPTION 'B3d FAIL — la firma debía ver las 3 líneas'; END IF;
  IF pg_temp.count_as(mgr, li) <> 3 THEN RAISE EXCEPTION 'B3d FAIL — el gerente debía ver L1, L2 y L3'; END IF;
  IF pg_temp.count_as(ptn, li) <> 2 THEN RAISE EXCEPTION 'B3d FAIL — el socio de E1 debía ver L1 y L3'; END IF;
  IF pg_temp.count_as(dir, li) <> 1 THEN RAISE EXCEPTION 'B3d FAIL — el director debía ver solo L2'; END IF;
  IF pg_temp.count_as(sqr, li) <> 0 THEN RAISE EXCEPTION 'B3d FAIL — sqr no tiene líneas en E3 y no debía ver ninguna'; END IF;
  IF pg_temp.count_as(enc, li) <> 2 THEN RAISE EXCEPTION 'B3d FAIL — el encargado de E1 debía ver L1 y L3'; END IF;
  IF pg_temp.count_as(wrk, li) <> 2 THEN RAISE EXCEPTION 'B3d FAIL — el dueño debía ver L1 y L2'; END IF;
  IF pg_temp.count_as(spe, li) <> 0 OR pg_temp.count_as(hr, li) <> 0 THEN RAISE EXCEPTION 'B3d FAIL — especialista y hr_manager no debían ver líneas'; END IF;
  RAISE NOTICE 'PASS — períodos y líneas: firma, responsable por encargo, dueño; el resto no ve nada';

  -- Decisión 4: el responsable lee el período aunque NO pueda aprobarlo ni haya aprobador por asignación.
  -- P3 es de PTN, que se autoaprueba (timesheet.self_approve): get_timesheet_approvers devuelve vacío y nadie la aprueba por asignación.
  IF public.can_approve_timesheet('a0b3d000-0000-4000-8000-000000000003'::uuid, 'b0b3d000-0000-4000-8000-000000000003'::uuid) THEN
    RAISE EXCEPTION 'B3d FAIL (premisa) — P3 es de un socio que se autoaprueba: el gerente no debía poder aprobarla por asignación';
  END IF;
  IF public.can_approve_timesheet('a0b3d000-0000-4000-8000-000000000005'::uuid, 'b0b3d000-0000-4000-8000-000000000001'::uuid) THEN
    RAISE EXCEPTION 'B3d FAIL (premisa) — el director no aprueba horas (timesheet_approval.approve) y no debía poder aprobar P1';
  END IF;
  IF pg_temp.count_as(mgr, 'SELECT count(*) FROM public.timesheet_periods WHERE period_id = ''b0b3d000-0000-4000-8000-000000000003''') <> 1 THEN
    RAISE EXCEPTION 'B3d FAIL — el gerente de E1 debía leer la boleta autoaprobada P3 por ser responsable del encargo';
  END IF;
  IF pg_temp.count_as(dir, 'SELECT count(*) FROM public.timesheet_periods WHERE period_id = ''b0b3d000-0000-4000-8000-000000000001''') <> 1 THEN
    RAISE EXCEPTION 'B3d FAIL — el director de E2 debía leer P1 sin poder aprobarla';
  END IF;
  -- El embed de «Aprobadas» (period:timesheet_periods!inner) es un JOIN que respeta la RLS: nada se descarta.
  IF pg_temp.count_as(dir, 'SELECT count(*) FROM public.timesheet_line_approvals l JOIN public.timesheet_periods p USING (period_id) WHERE l.status = ''approved'' AND l.period_id::text LIKE ''b0b3d000-%''') <> 1 THEN
    RAISE EXCEPTION 'B3d FAIL — el director debía ver la línea aprobada de E2 con su período (lo que hace el embed !inner de Aprobadas)';
  END IF;
  RAISE NOTICE 'PASS — decisión 4: el responsable lee el período aunque no pueda aprobarlo (boleta autoaprobada, director)';

  -- 5. Timers: solo el dueño; admin además LEE (useDeleteStaff decide baja física o lógica mirando los timers) ──
  IF pg_temp.count_as(wrk, ti) <> 1 THEN RAISE EXCEPTION 'B3d FAIL — el dueño debía ver su timer'; END IF;
  IF pg_temp.count_as(adm, ti) <> 1 THEN RAISE EXCEPTION 'B3d FAIL — admin debía leer el timer (baja de personal)'; END IF;
  IF pg_temp.count_as(mgr, ti) <> 0 OR pg_temp.count_as(sp, ti) <> 0 OR pg_temp.count_as(ptn, ti) <> 0 THEN
    RAISE EXCEPTION 'B3d FAIL — los timers son personales: ni gerente, ni socio, ni senior_partner los ven';
  END IF;
  IF pg_temp.rows_as(adm, 'UPDATE public.timer_entries SET description = description WHERE timer_id::text LIKE ''c0b3d000-%''') <> 0 THEN
    RAISE EXCEPTION 'B3d FAIL — admin lee los timers pero no debe poder modificarlos';
  END IF;
  RAISE NOTICE 'PASS — timers: dueño; admin solo lectura; nadie más';

  -- 6. Escritura sin cambios: dueño, aprobador asignado y admin ──────────────────────────────────
  IF pg_temp.rows_as(mgr, 'UPDATE public.time_entries SET description = ''x'' WHERE time_id = ''d0b3d000-0000-4000-8000-000000000003''') <> 0 THEN
    RAISE EXCEPTION 'B3d FAIL — ver las horas del equipo no da derecho a modificarlas (gerente sobre T3 ajena)';
  END IF;
  IF pg_temp.rows_as(wrk, 'UPDATE public.time_entries SET description = ''x'' WHERE time_id = ''d0b3d000-0000-4000-8000-000000000003''') <> 1 THEN
    RAISE EXCEPTION 'B3d FAIL — el dueño debía poder modificar su hora guardada';
  END IF;
  IF pg_temp.rows_as(adm, 'UPDATE public.time_entries SET description = ''y'' WHERE time_id = ''d0b3d000-0000-4000-8000-000000000003''') <> 1 THEN
    RAISE EXCEPTION 'B3d FAIL — admin debía poder modificar la hora';
  END IF;
  IF pg_temp.rows_as(enc, 'INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked, hours_logged, period_id, is_forecast) '
      'SELECT staff_id, engagement_id, activity_id, ''2026-03-05'', 1, period_id, false FROM public.time_entries WHERE time_id = ''d0b3d000-0000-4000-8000-000000000001''') <> -1 THEN
    RAISE EXCEPTION 'B3d FAIL — nadie puede insertar horas a nombre de otra persona (el encargado sobre WRK)';
  END IF;
  -- Líneas: el aprobador asignado (gerente) sí; el socio, que ve la línea pero no aprueba, no.
  IF pg_temp.rows_as(ptn, 'UPDATE public.timesheet_line_approvals SET review_notes = ''x'' WHERE approval_id = ''f0b3d000-0000-4000-8000-000000000001''') <> 0 THEN
    RAISE EXCEPTION 'B3d FAIL — el socio (sin timesheet_approval.approve) lee la línea pero no debía poder modificarla';
  END IF;
  IF pg_temp.rows_as(mgr, 'UPDATE public.timesheet_line_approvals SET review_notes = ''x'' WHERE approval_id = ''f0b3d000-0000-4000-8000-000000000001''') <> 1 THEN
    RAISE EXCEPTION 'B3d FAIL — el gerente asignado debía poder actuar sobre la línea de E1';
  END IF;
  IF pg_temp.rows_as(dir, 'UPDATE public.timesheet_periods SET total_hours = total_hours WHERE period_id = ''b0b3d000-0000-4000-8000-000000000001''') <> 0 THEN
    RAISE EXCEPTION 'B3d FAIL — el director lee la boleta pero no debía poder modificarla';
  END IF;
  IF pg_temp.rows_as(wrk, 'UPDATE public.timesheet_periods SET total_hours = total_hours WHERE period_id = ''b0b3d000-0000-4000-8000-000000000002''') <> 1 THEN
    RAISE EXCEPTION 'B3d FAIL — el dueño debía poder actualizar su boleta no bloqueada';
  END IF;
  RAISE NOTICE 'PASS — escritura sin cambios: solo dueño, aprobador asignado o admin; ver no es modificar';

  -- 7. No-vacuidad: cada acceso depende del campo del encargo o del permiso ───────────────────
  UPDATE public.engagements SET partner_id = NULL WHERE engagement_code = 'B3D-E2';
  IF pg_temp.count_as(dir, te) <> 0 OR pg_temp.count_as(dir, pe) <> 0 OR pg_temp.count_as(dir, li) <> 0 THEN
    RAISE EXCEPTION 'B3d FAIL (no-vacuidad) — sin partner_id en E2 el director debía perder horas, boleta y línea';
  END IF;
  UPDATE public.engagements SET partner_id = '50b3d000-0000-4000-8000-000000000005' WHERE engagement_code = 'B3D-E2';
  IF pg_temp.count_as(dir, te) <> 1 THEN RAISE EXCEPTION 'B3d FAIL (no-vacuidad) — al devolver partner_id el director debía recuperar su hora'; END IF;

  UPDATE public.engagements SET encargado_id = NULL WHERE engagement_code = 'B3D-E1';
  IF pg_temp.count_as(enc, te) <> 0 OR pg_temp.count_as(enc, pe) <> 0 OR pg_temp.count_as(enc, li) <> 0 THEN
    RAISE EXCEPTION 'B3d FAIL (no-vacuidad) — sin encargado_id el asistente debía perder horas, boletas y líneas';
  END IF;
  -- «solo si además son encargado_id»: el especialista pasa a ver el equipo cuando ocupa ese campo.
  UPDATE public.engagements SET encargado_id = '50b3d000-0000-4000-8000-000000000008' WHERE engagement_code = 'B3D-E1';
  IF pg_temp.count_as(spe, te) <> 2 OR pg_temp.count_as(spe, pe) <> 2 OR pg_temp.count_as(spe, li) <> 2 THEN
    RAISE EXCEPTION 'B3d FAIL (no-vacuidad) — el especialista que además es encargado_id debía ver T1 y T4, P1 y P3, L1 y L3';
  END IF;
  UPDATE public.engagements SET encargado_id = '50b3d000-0000-4000-8000-000000000007' WHERE engagement_code = 'B3D-E1';

  -- sqr_id de E1 por sí solo no da acceso (ya se comprobó: sqr ve 1); con partner_id de E3 quitado, no ve nada.
  UPDATE public.engagements SET partner_id = NULL WHERE engagement_code = 'B3D-E3';
  IF pg_temp.count_as(sqr, te) <> 0 THEN RAISE EXCEPTION 'B3d FAIL (no-vacuidad) — sin partner_id en E3, sqr (que sigue siendo sqr_id de E1) no debía ver nada'; END IF;
  UPDATE public.engagements SET partner_id = '50b3d000-0000-4000-8000-000000000006' WHERE engagement_code = 'B3D-E3';

  -- El dueño necesita time_entry.read para ver las suyas (WRK no es responsable de nada).
  DELETE FROM public.authorization_role_permissions WHERE role_key = 'semisenior' AND permission_key = 'time_entry.read';
  IF pg_temp.count_as(wrk, te) <> 0 THEN RAISE EXCEPTION 'B3d FAIL (no-vacuidad) — sin time_entry.read el dueño (que no es responsable) no debía ver sus horas'; END IF;
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  SELECT 'semisenior', 'time_entry.read', scope_key FROM public.authorization_role_permissions WHERE role_key = 'senior' AND permission_key = 'time_entry.read'
  ON CONFLICT (role_key, permission_key) DO NOTHING;
  IF pg_temp.count_as(wrk, te) <> 3 THEN RAISE EXCEPTION 'B3d FAIL (no-vacuidad) — al devolver time_entry.read el dueño debía recuperar sus 3 horas'; END IF;
  RAISE NOTICE 'PASS — no-vacuidad: manager_id/partner_id/encargado_id y time_entry.read son lo que abre cada lectura';

  -- 8. anon: sin lectura en ninguna de las 4 tablas ───────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  FOR v IN 1..4 LOOP
    BEGIN
      EXECUTE 'SET LOCAL ROLE anon';
      EXECUTE 'SELECT count(*) FROM public.' || (ARRAY['time_entries', 'timer_entries', 'timesheet_periods', 'timesheet_line_approvals'])[v];
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION 'B3d FAIL — anon pudo leer %', (ARRAY['time_entries', 'timer_entries', 'timesheet_periods', 'timesheet_line_approvals'])[v];
    EXCEPTION WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
    END;
  END LOOP;
  RAISE NOTICE 'PASS — anon: 42501 en las 4 tablas';

  RAISE NOTICE 'B3d HORAS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
