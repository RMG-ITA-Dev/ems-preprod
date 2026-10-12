-- Carril B / B1 — validación del llamador en tres RPC SECURITY DEFINER + matriz de permisos
-- (20261009120000_rls_carril_b.sql: BAR-009 sync_worksheet_to_wo_budget, BAR-014
--  update_timesheet_minmax_settings, BAR-015 submit_timesheet_safe, y la sección B1.2 de permisos:
--  timesheet.self_approve, lectura de OT para risk_partner/risk_supervisor, risk_partner sin
--  worksheet.create/update.)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de aplicar la migración del Carril B.
-- Transacción única, SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo, terminando
-- en "B1 CALLERS: ALL CHECKS PASSED (rolled back)".
--
-- Por qué casi todo corre como owner y no con `SET LOCAL ROLE authenticated`: las tres RPC son
-- SECURITY DEFINER y auth.uid()/auth.jwt() leen el GUC request.jwt.claims directo
-- (00-shim-auth.sql), sin depender del rol de Postgres. Lo que cambia entre un "empleado", un
-- "anon" y "sin sesión" es el claim, así que los tres se simulan con pg_temp.impersonate /
-- pg_temp.as_anon / pg_temp.no_session. Solo la sección final (ACL) cambia de rol de verdad,
-- porque EXECUTE se evalúa contra el rol de la sesión.
--
-- Cada denegación tiene su contraparte de no-vacuidad: la MISMA llamada por un llamador legítimo
-- tiene éxito (o el estado previo se verifica intacto después del rechazo), de modo que quitar el
-- chequeo de la función hace fallar la suite en vez de pasar en falso.
--
-- Fixture world (ids con prefijo b1):
--   U1 admin            role_key admin           — global_settings.update, work_order.*, self_approve
--   U2 partner          role_key partner         — self_approve; SIN work_order.create/update
--   U3 manager          role_key manager         — manager_id de E1; work_order.update/create (assigned)
--   U4 otro manager     role_key manager         — manager_id de E2; SIN relación con E1
--   U5 assistant        role_key assistant       — sin self_approve ni permisos de OT
--   U6 risk_partner     role_key risk_partner    — self_approve; OT solo lectura
--   U7 risk_supervisor  role_key risk_supervisor — OT solo lectura
--   E1/E2   encargos de práctica 1 (E1 de U3, E2 de U4), approval_required = true
--   WO1/WO2 una OT por encargo; WS1/WS2 una hoja por encargo con una celda cada una
--   P1 asistente 01-jun | P2 partner 01-jun | P3 manager 01-jun | P4 asistente 08-jun
--   P5 asistente 15-jun | P6 risk_partner 01-jun   (cada una: 5 días x 8 h = 40 h en E1)

BEGIN;

-- ── Fixtures (como owner; las RPC SECURITY DEFINER escalan igual) ─────────────────────────────

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c1b10000-0000-4000-8000-000000000001', 'B1 Test Client', 'B1-TAX-001');

INSERT INTO auth.users (id) VALUES
  ('a0b10000-0000-4000-8000-000000000001'),
  ('a0b10000-0000-4000-8000-000000000002'),
  ('a0b10000-0000-4000-8000-000000000003'),
  ('a0b10000-0000-4000-8000-000000000004'),
  ('a0b10000-0000-4000-8000-000000000005'),
  ('a0b10000-0000-4000-8000-000000000006'),
  ('a0b10000-0000-4000-8000-000000000007');

-- role (enum legacy) y role_key (RBAC) se declaran por separado: has_permission() lee role_key,
-- is_admin() lee role. risk_partner/risk_supervisor no existen en el enum, igual que en producción:
-- se mapean al valor legacy más cercano (partner / manager), como hace cero_13.
INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0b10000-0000-4000-8000-000000000001', 'admin',   'admin'),
  ('a0b10000-0000-4000-8000-000000000002', 'partner', 'partner'),
  ('a0b10000-0000-4000-8000-000000000003', 'manager', 'manager'),
  ('a0b10000-0000-4000-8000-000000000004', 'manager', 'manager'),
  ('a0b10000-0000-4000-8000-000000000005', 'staff',   'assistant'),
  ('a0b10000-0000-4000-8000-000000000006', 'partner', 'risk_partner'),
  ('a0b10000-0000-4000-8000-000000000007', 'manager', 'risk_supervisor');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
SELECT s.staff_id, s.auth_user_id, s.first_name, s.last_name,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1)
FROM (VALUES
  ('50b10000-0000-4000-8000-000000000001'::uuid, 'a0b10000-0000-4000-8000-000000000001'::uuid, 'Admin',   'B1'),
  ('50b10000-0000-4000-8000-000000000002'::uuid, 'a0b10000-0000-4000-8000-000000000002'::uuid, 'Partner', 'B1'),
  ('50b10000-0000-4000-8000-000000000003'::uuid, 'a0b10000-0000-4000-8000-000000000003'::uuid, 'Manager', 'B1'),
  ('50b10000-0000-4000-8000-000000000004'::uuid, 'a0b10000-0000-4000-8000-000000000004'::uuid, 'Other',   'Mgr'),
  ('50b10000-0000-4000-8000-000000000005'::uuid, 'a0b10000-0000-4000-8000-000000000005'::uuid, 'Assist',  'B1'),
  ('50b10000-0000-4000-8000-000000000006'::uuid, 'a0b10000-0000-4000-8000-000000000006'::uuid, 'RiskP',   'B1'),
  ('50b10000-0000-4000-8000-000000000007'::uuid, 'a0b10000-0000-4000-8000-000000000007'::uuid, 'RiskS',   'B1')
) AS s(staff_id, auth_user_id, first_name, last_name);

-- practica = 1 para que las celdas de la hoja pasen enforce_worksheet_cell_practice_scope
-- (la práctica code=1 la siembra el runner). work_order_required = false para que las horas de las
-- boletas no choquen con check_wo_approved: esta suite no prueba ese gate.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id, practica, fecha_cierre, work_order_required, approval_required, society_id) VALUES
  ('e0b10000-0000-4000-8000-000000000001', 'c1b10000-0000-4000-8000-000000000001', 'B1 E1', '50b10000-0000-4000-8000-000000000003', 1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0b10000-0000-4000-8000-000000000002', 'c1b10000-0000-4000-8000-000000000001', 'B1 E2', '50b10000-0000-4000-8000-000000000004', 1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.activity_codes (activity_id, activity_code, description, practica_id, is_system, is_active)
VALUES ('acb10000-0000-4000-8000-000000000001', 'B1-A1', 'B1 Test Activity', (SELECT practica_id FROM public.practicas WHERE code = 1), false, true);

INSERT INTO public.categories (category_id, category_name, display_order, rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd, practica_id)
VALUES ('c0b10000-0000-4000-8000-000000000001', 'B1 Category', 1, 100, 50, 15, 7, (SELECT practica_id FROM public.practicas WHERE code = 1));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40b10000-0000-4000-8000-000000000001', 'e0b10000-0000-4000-8000-000000000001', 'BOB', 'High', 'Draft'),
  ('40b10000-0000-4000-8000-000000000002', 'e0b10000-0000-4000-8000-000000000002', 'BOB', 'High', 'Draft');

INSERT INTO public.activity_worksheets (id, engagement_id, wo_id) VALUES
  ('30b10000-0000-4000-8000-000000000001', 'e0b10000-0000-4000-8000-000000000001', NULL),
  ('30b10000-0000-4000-8000-000000000002', 'e0b10000-0000-4000-8000-000000000002', NULL);

INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours) VALUES
  ('30b10000-0000-4000-8000-000000000001', 'c0b10000-0000-4000-8000-000000000001', 'acb10000-0000-4000-8000-000000000001', 10),
  ('30b10000-0000-4000-8000-000000000002', 'c0b10000-0000-4000-8000-000000000001', 'acb10000-0000-4000-8000-000000000001', 7);

-- Línea de presupuesto preexistente en WO2: marcador para detectar que una llamada rechazada NO la
-- reescribió (BAR-009: antes, una hoja de otro encargo reescribía el presupuesto de cualquier OT).
INSERT INTO public.wo_budget_lines (wo_id, category_id, budgeted_hours, standard_rate)
VALUES ('40b10000-0000-4000-8000-000000000002', 'c0b10000-0000-4000-8000-000000000001', 99, 1);

INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year) VALUES
  ('b0b10000-0000-4000-8000-000000000001', '50b10000-0000-4000-8000-000000000005', '2026-06-01', 23, 2026), -- P1 asistente
  ('b0b10000-0000-4000-8000-000000000002', '50b10000-0000-4000-8000-000000000002', '2026-06-01', 23, 2026), -- P2 partner
  ('b0b10000-0000-4000-8000-000000000003', '50b10000-0000-4000-8000-000000000003', '2026-06-01', 23, 2026), -- P3 manager
  ('b0b10000-0000-4000-8000-000000000004', '50b10000-0000-4000-8000-000000000005', '2026-06-08', 24, 2026), -- P4 asistente
  ('b0b10000-0000-4000-8000-000000000005', '50b10000-0000-4000-8000-000000000005', '2026-06-15', 25, 2026), -- P5 asistente
  ('b0b10000-0000-4000-8000-000000000006', '50b10000-0000-4000-8000-000000000006', '2026-06-01', 23, 2026); -- P6 risk_partner

-- 40 h por período (lunes a viernes, 8 h, E1): WEEKLY_MIN = WEEKLY_MAX = 40 pasa limpio.
INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked, hours_logged, period_id, is_forecast)
SELECT p.staff_id, 'e0b10000-0000-4000-8000-000000000001', 'acb10000-0000-4000-8000-000000000001',
       p.week_start_date + g, 8, p.period_id, false
FROM public.timesheet_periods p
CROSS JOIN generate_series(0, 4) g
WHERE p.period_id::text LIKE 'b0b10000-%';

-- global_settings no se siembra en el harness (cero_16 no corre aquí): se crean las cuatro claves
-- que lee y escribe update_timesheet_minmax_settings.
INSERT INTO public.global_settings (setting_key, setting_value) VALUES
  ('DAILY_MIN', '0'), ('DAILY_MAX', '12'), ('WEEKLY_MIN', '40'), ('WEEKLY_MAX', '40')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- ── Helpers (temp; se van con la sesión) ──────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

-- anon de PostgREST: JWT con role=anon y sin sub, así que auth.uid() es NULL.
CREATE FUNCTION pg_temp.as_anon() RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true)
$$;

-- Sin claims en absoluto: migraciones, SQL Editor, service_role sin JWT de usuario.
CREATE FUNCTION pg_temp.no_session() RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '', true)
$$;

-- Ejecuta una sentencia y devuelve el SQLERRM con que falló (NULL si tuvo éxito). El sub-bloque
-- EXCEPTION deshace cualquier efecto parcial de la llamada rechazada.
CREATE FUNCTION pg_temp.try(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

CREATE FUNCTION pg_temp.scope_of(p_role text, p_perm text) RETURNS text
LANGUAGE sql AS $$
  SELECT scope_key FROM public.authorization_role_permissions
   WHERE role_key = p_role AND permission_key = p_perm
$$;

DO $$
DECLARE
  err      text;
  n        int;
  v_status text;
  v_by     uuid;
  v_hours  numeric;
  v_rate   numeric;
  v_wo     uuid;
  v_res    jsonb;
  v_val    text;
  v_roles  text;
BEGIN
  -- ════════════════════════════════════════════════════════════════════════════════════════════
  -- submit_timesheet_safe (BAR-015)
  -- ════════════════════════════════════════════════════════════════════════════════════════════

  -- S1: enviar la hoja AJENA se rechaza (manager sobre la boleta de la asistente) y no deja rastro.
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000003');
  err := pg_temp.try($q$SELECT public.submit_timesheet_safe(
      'b0b10000-0000-4000-8000-000000000001', '50b10000-0000-4000-8000-000000000005',
      ARRAY['e0b10000-0000-4000-8000-000000000001']::uuid[], ARRAY['acb10000-0000-4000-8000-000000000001']::uuid[], false)$q$);
  IF err IS NULL OR err NOT LIKE 'NOT_OWNER%' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — S1: un manager pudo enviar la hoja de otra persona (err=%)', err;
  END IF;
  SELECT count(*) INTO n FROM public.timesheet_line_approvals WHERE period_id = 'b0b10000-0000-4000-8000-000000000001';
  IF n <> 0 OR EXISTS (SELECT 1 FROM public.timesheet_periods WHERE period_id = 'b0b10000-0000-4000-8000-000000000001' AND submitted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — S1: el envío rechazado dejó líneas (%) o marcó submitted_at', n;
  END IF;
  RAISE NOTICE 'PASS — S1: enviar la hoja de otra persona da NOT_OWNER y no deja líneas ni submitted_at';

  -- S2: el admin NO tiene bypass: tampoco puede enviar la hoja ajena.
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000001');
  err := pg_temp.try($q$SELECT public.submit_timesheet_safe(
      'b0b10000-0000-4000-8000-000000000001', '50b10000-0000-4000-8000-000000000005',
      ARRAY['e0b10000-0000-4000-8000-000000000001']::uuid[], ARRAY['acb10000-0000-4000-8000-000000000001']::uuid[], false)$q$);
  IF err IS NULL OR err NOT LIKE 'NOT_OWNER%' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — S2: el admin pudo enviar la hoja de otra persona (err=%)', err;
  END IF;
  RAISE NOTICE 'PASS — S2: el admin no tiene bypass sobre la hoja ajena (NOT_OWNER)';

  -- S3: anon (sin sub, role=anon) → NOT_AUTHORIZED, aunque algún día recupere EXECUTE.
  PERFORM pg_temp.as_anon();
  err := pg_temp.try($q$SELECT public.submit_timesheet_safe(
      'b0b10000-0000-4000-8000-000000000001', '50b10000-0000-4000-8000-000000000005',
      ARRAY['e0b10000-0000-4000-8000-000000000001']::uuid[], ARRAY['acb10000-0000-4000-8000-000000000001']::uuid[], true)$q$);
  IF err IS DISTINCT FROM 'NOT_AUTHORIZED' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — S3: anon no fue rechazado con NOT_AUTHORIZED (err=%)', err;
  END IF;
  RAISE NOTICE 'PASS — S3: anon da NOT_AUTHORIZED';

  -- S4: staff propio con la boleta de OTRA persona → el período se filtra por staff_id y no existe.
  -- (Conserva el comportamiento previo: la validación de dueño no reemplazó al scoping del período.)
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000003');
  err := pg_temp.try($q$SELECT public.submit_timesheet_safe(
      'b0b10000-0000-4000-8000-000000000001', '50b10000-0000-4000-8000-000000000003',
      ARRAY['e0b10000-0000-4000-8000-000000000001']::uuid[], ARRAY['acb10000-0000-4000-8000-000000000001']::uuid[], false)$q$);
  IF err IS NULL OR err NOT LIKE 'PERIOD_NOT_FOUND%' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — S4: su propio staff_id con el período de otra persona no dio PERIOD_NOT_FOUND (err=%)', err;
  END IF;
  RAISE NOTICE 'PASS — S4: el período ajeno sigue sin encontrarse aunque el staff_id sea el propio';

  -- S5 (BAR-015 núcleo): la asistente envía lo suyo pasando p_is_auto_approved = true y NO se
  -- autoaprueba: el servidor decide por timesheet.self_approve, que su rol no tiene.
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000005');
  v_res := public.submit_timesheet_safe(
    'b0b10000-0000-4000-8000-000000000001', '50b10000-0000-4000-8000-000000000005',
    ARRAY['e0b10000-0000-4000-8000-000000000001']::uuid[], ARRAY['acb10000-0000-4000-8000-000000000001']::uuid[], true);
  SELECT status, approved_by INTO v_status, v_by FROM public.timesheet_line_approvals
   WHERE period_id = 'b0b10000-0000-4000-8000-000000000001';
  IF v_status IS DISTINCT FROM 'pending' OR v_by IS NOT NULL OR (v_res->>'new_pending')::int <> 1 THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — S5: la asistente se autoaprobó con p_is_auto_approved=true (status=%, approved_by=%, res=%)', v_status, v_by, v_res;
  END IF;
  RAISE NOTICE 'PASS — S5: p_is_auto_approved=true de una asistente se ignora; la línea queda pending';

  -- S6: el partner (self_approve) envía con p_is_auto_approved = false y SÍ se autoaprueba,
  -- aprobada a su nombre. Contraparte de S5: demuestra que el parámetro no manda en ninguna dirección.
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000002');
  v_res := public.submit_timesheet_safe(
    'b0b10000-0000-4000-8000-000000000002', '50b10000-0000-4000-8000-000000000002',
    ARRAY['e0b10000-0000-4000-8000-000000000001']::uuid[], ARRAY['acb10000-0000-4000-8000-000000000001']::uuid[], false);
  SELECT status, approved_by INTO v_status, v_by FROM public.timesheet_line_approvals
   WHERE period_id = 'b0b10000-0000-4000-8000-000000000002';
  IF v_status IS DISTINCT FROM 'approved' OR v_by IS DISTINCT FROM '50b10000-0000-4000-8000-000000000002'::uuid
     OR (v_res->>'new_auto_approved')::int <> 1 THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — S6: el partner con self_approve no se autoaprobó (status=%, approved_by=%, res=%)', v_status, v_by, v_res;
  END IF;
  RAISE NOTICE 'PASS — S6: el partner se autoaprueba por timesheet.self_approve aunque pase p_is_auto_approved=false';

  -- S7: los gerentes NO se autoaprueban ("el resto pasa por Aprobaciones, gerentes incluidos").
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000003');
  PERFORM public.submit_timesheet_safe(
    'b0b10000-0000-4000-8000-000000000003', '50b10000-0000-4000-8000-000000000003',
    ARRAY['e0b10000-0000-4000-8000-000000000001']::uuid[], ARRAY['acb10000-0000-4000-8000-000000000001']::uuid[], true);
  SELECT status INTO v_status FROM public.timesheet_line_approvals WHERE period_id = 'b0b10000-0000-4000-8000-000000000003';
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — S7: un manager se autoaprobó su propia hoja (status=%)', v_status;
  END IF;
  RAISE NOTICE 'PASS — S7: un manager no se autoaprueba (pending, pese a p_is_auto_approved=true)';

  -- S8: risk_partner recibe self_approve en B1.2 → se autoaprueba.
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000006');
  PERFORM public.submit_timesheet_safe(
    'b0b10000-0000-4000-8000-000000000006', '50b10000-0000-4000-8000-000000000006',
    ARRAY['e0b10000-0000-4000-8000-000000000001']::uuid[], ARRAY['acb10000-0000-4000-8000-000000000001']::uuid[], false);
  SELECT status INTO v_status FROM public.timesheet_line_approvals WHERE period_id = 'b0b10000-0000-4000-8000-000000000006';
  IF v_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — S8: risk_partner no se autoaprobó pese a tener timesheet.self_approve (status=%)', v_status;
  END IF;
  RAISE NOTICE 'PASS — S8: risk_partner se autoaprueba (timesheet.self_approve sembrado en B1.2)';

  -- S9: sin sesión (migraciones, service_role) el parámetro se respeta, en las dos direcciones.
  PERFORM pg_temp.no_session();
  PERFORM public.submit_timesheet_safe(
    'b0b10000-0000-4000-8000-000000000004', '50b10000-0000-4000-8000-000000000005',
    ARRAY['e0b10000-0000-4000-8000-000000000001']::uuid[], ARRAY['acb10000-0000-4000-8000-000000000001']::uuid[], true);
  PERFORM public.submit_timesheet_safe(
    'b0b10000-0000-4000-8000-000000000005', '50b10000-0000-4000-8000-000000000005',
    ARRAY['e0b10000-0000-4000-8000-000000000001']::uuid[], ARRAY['acb10000-0000-4000-8000-000000000001']::uuid[], false);
  SELECT status INTO v_status FROM public.timesheet_line_approvals WHERE period_id = 'b0b10000-0000-4000-8000-000000000004';
  IF v_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — S9: sin sesión, p_is_auto_approved=true no se respetó (status=%)', v_status;
  END IF;
  SELECT status INTO v_status FROM public.timesheet_line_approvals WHERE period_id = 'b0b10000-0000-4000-8000-000000000005';
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — S9: sin sesión, p_is_auto_approved=false no se respetó (status=%)', v_status;
  END IF;
  RAISE NOTICE 'PASS — S9: sin sesión se respeta p_is_auto_approved (true → approved, false → pending); sin chequeo de dueño';

  -- ════════════════════════════════════════════════════════════════════════════════════════════
  -- sync_worksheet_to_wo_budget (BAR-009)
  -- ════════════════════════════════════════════════════════════════════════════════════════════

  -- W1: hoja de E1 hacia la OT de E2 → mismatch, para CUALQUIER llamador (admin, sin sesión) y sin
  -- tocar ni la OT ajena ni la hoja.
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000001');
  err := pg_temp.try($q$SELECT public.sync_worksheet_to_wo_budget('30b10000-0000-4000-8000-000000000001', '40b10000-0000-4000-8000-000000000002')$q$);
  IF err IS DISTINCT FROM 'WORKSHEET_WO_ENGAGEMENT_MISMATCH' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W1: el admin pudo cruzar una hoja de otro encargo (err=%)', err;
  END IF;
  PERFORM pg_temp.no_session();
  err := pg_temp.try($q$SELECT public.sync_worksheet_to_wo_budget('30b10000-0000-4000-8000-000000000001', '40b10000-0000-4000-8000-000000000002')$q$);
  IF err IS DISTINCT FROM 'WORKSHEET_WO_ENGAGEMENT_MISMATCH' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W1: sin sesión pudo cruzar una hoja de otro encargo (err=%)', err;
  END IF;
  SELECT count(*), COALESCE(sum(budgeted_hours), 0) INTO n, v_hours FROM public.wo_budget_lines
   WHERE wo_id = '40b10000-0000-4000-8000-000000000002';
  IF n <> 1 OR v_hours <> 99 THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W1: el cruce rechazado reescribió el presupuesto de WO2 (filas=%, horas=%)', n, v_hours;
  END IF;
  SELECT wo_id INTO v_wo FROM public.activity_worksheets WHERE id = '30b10000-0000-4000-8000-000000000001';
  IF v_wo IS NOT NULL THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W1: el cruce rechazado enlazó la hoja de E1 a una OT (wo_id=%)', v_wo;
  END IF;
  RAISE NOTICE 'PASS — W1: hoja de otro encargo → WORKSHEET_WO_ENGAGEMENT_MISMATCH para admin y sin sesión; WO2 y la hoja intactas';

  -- W2: ids inexistentes conservan sus mensajes.
  err := pg_temp.try($q$SELECT public.sync_worksheet_to_wo_budget('30b10000-0000-4000-8000-000000000001', '40b10000-0000-4000-8000-0000000000ff')$q$);
  IF err IS NULL OR err NOT LIKE 'Work order not found%' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W2: OT inexistente no dio "Work order not found" (err=%)', err;
  END IF;
  err := pg_temp.try($q$SELECT public.sync_worksheet_to_wo_budget('30b10000-0000-4000-8000-0000000000ff', '40b10000-0000-4000-8000-000000000001')$q$);
  IF err IS NULL OR err NOT LIKE 'Worksheet not found%' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W2: hoja inexistente no dio "Worksheet not found" (err=%)', err;
  END IF;
  RAISE NOTICE 'PASS — W2: OT u hoja inexistente conservan su mensaje de error';

  -- W3: sin permiso de OT, o con permiso pero sin estar asignado al encargo → NOT_AUTHORIZED, y
  -- WO1/hoja quedan como estaban. Cinco llamadores: otro manager (con work_order.update en alcance
  -- assigned_engagements pero no asignado a E1), asistente, partner, risk_partner, risk_supervisor.
  FOR n IN 4..7 LOOP
    PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-00000000000' || n);
    err := pg_temp.try($q$SELECT public.sync_worksheet_to_wo_budget('30b10000-0000-4000-8000-000000000001', '40b10000-0000-4000-8000-000000000001')$q$);
    IF err IS DISTINCT FROM 'NOT_AUTHORIZED' THEN
      RAISE EXCEPTION 'B1 CALLERS FAIL — W3: U% pudo sincronizar la hoja de E1 con la OT de E1 sin autorización (err=%)', n, err;
    END IF;
  END LOOP;
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000002');
  err := pg_temp.try($q$SELECT public.sync_worksheet_to_wo_budget('30b10000-0000-4000-8000-000000000001', '40b10000-0000-4000-8000-000000000001')$q$);
  IF err IS DISTINCT FROM 'NOT_AUTHORIZED' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W3: el partner (sin work_order.create/update) pudo sincronizar (err=%)', err;
  END IF;
  SELECT count(*) INTO n FROM public.wo_budget_lines WHERE wo_id = '40b10000-0000-4000-8000-000000000001';
  SELECT wo_id INTO v_wo FROM public.activity_worksheets WHERE id = '30b10000-0000-4000-8000-000000000001';
  IF n <> 0 OR v_wo IS NOT NULL THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W3: una sincronización rechazada dejó % líneas en WO1 / wo_id=% en la hoja', n, v_wo;
  END IF;
  RAISE NOTICE 'PASS — W3: otro manager, asistente, partner, risk_partner y risk_supervisor reciben NOT_AUTHORIZED y no tocan WO1';

  -- W4: contraparte de W3 — el manager del encargo (work_order.update, assigned_engagements, asignado
  -- a E1) sincroniza: 1 línea de 10 h a la tarifa alta en BOB (100), y la hoja queda enlazada.
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000003');
  PERFORM public.sync_worksheet_to_wo_budget('30b10000-0000-4000-8000-000000000001', '40b10000-0000-4000-8000-000000000001');
  SELECT count(*), COALESCE(sum(budgeted_hours), 0), COALESCE(max(standard_rate), 0) INTO n, v_hours, v_rate
    FROM public.wo_budget_lines WHERE wo_id = '40b10000-0000-4000-8000-000000000001';
  SELECT wo_id INTO v_wo FROM public.activity_worksheets WHERE id = '30b10000-0000-4000-8000-000000000001';
  IF n <> 1 OR v_hours <> 10 OR v_rate <> 100 OR v_wo IS DISTINCT FROM '40b10000-0000-4000-8000-000000000001'::uuid THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W4: el manager del encargo no pudo sincronizar bien (filas=%, horas=%, tarifa=%, wo_id=%)', n, v_hours, v_rate, v_wo;
  END IF;
  RAISE NOTICE 'PASS — W4: el manager asignado al encargo sincroniza (1 línea, 10 h, tarifa 100) y la hoja queda enlazada';

  -- W5: el admin también (idempotente: reemplaza, no duplica). El manager de E2 nunca vio WO1.
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000001');
  PERFORM public.sync_worksheet_to_wo_budget('30b10000-0000-4000-8000-000000000001', '40b10000-0000-4000-8000-000000000001');
  SELECT count(*) INTO n FROM public.wo_budget_lines WHERE wo_id = '40b10000-0000-4000-8000-000000000001';
  IF n <> 1 THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W5: re-sincronizar duplicó líneas de presupuesto (n=%)', n;
  END IF;
  -- ...y el manager de E2 sí puede sobre su propio encargo (WS2 → WO2), lo que reemplaza el marcador.
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000004');
  PERFORM public.sync_worksheet_to_wo_budget('30b10000-0000-4000-8000-000000000002', '40b10000-0000-4000-8000-000000000002');
  SELECT count(*), COALESCE(sum(budgeted_hours), 0) INTO n, v_hours FROM public.wo_budget_lines
   WHERE wo_id = '40b10000-0000-4000-8000-000000000002';
  IF n <> 1 OR v_hours <> 7 THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W5: el manager de E2 no pudo sincronizar su propio encargo (filas=%, horas=%)', n, v_hours;
  END IF;
  RAISE NOTICE 'PASS — W5: admin re-sincroniza sin duplicar; cada manager sincroniza solo su encargo';

  -- W6: anon → NOT_AUTHORIZED; sin sesión → permitido (migraciones como 0825-183).
  PERFORM pg_temp.as_anon();
  err := pg_temp.try($q$SELECT public.sync_worksheet_to_wo_budget('30b10000-0000-4000-8000-000000000001', '40b10000-0000-4000-8000-000000000001')$q$);
  IF err IS DISTINCT FROM 'NOT_AUTHORIZED' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W6: anon no fue rechazado con NOT_AUTHORIZED (err=%)', err;
  END IF;
  PERFORM pg_temp.no_session();
  err := pg_temp.try($q$SELECT public.sync_worksheet_to_wo_budget('30b10000-0000-4000-8000-000000000001', '40b10000-0000-4000-8000-000000000001')$q$);
  IF err IS NOT NULL THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — W6: sin sesión (ruta de migraciones) fue rechazado (err=%)', err;
  END IF;
  RAISE NOTICE 'PASS — W6: anon da NOT_AUTHORIZED; sin sesión sigue permitido';

  -- ════════════════════════════════════════════════════════════════════════════════════════════
  -- update_timesheet_minmax_settings (BAR-014)
  -- ════════════════════════════════════════════════════════════════════════════════════════════

  -- Fijación: solo admin tiene global_settings.update hoy. Si mañana otro rol lo recibe, esta
  -- suite lo avisa para decidir si es intencional.
  SELECT string_agg(role_key, ',' ORDER BY role_key) INTO v_roles
    FROM public.authorization_role_permissions WHERE permission_key = 'global_settings.update';
  IF v_roles IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — U0: global_settings.update ya no es solo de admin (roles=%)', v_roles;
  END IF;

  -- U1: manager, asistente y risk_supervisor → NOT_AUTHORIZED, valores intactos.
  FOREACH n IN ARRAY ARRAY[3, 5, 7] LOOP
    PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-00000000000' || n);
    err := pg_temp.try($q$SELECT public.update_timesheet_minmax_settings(1, 12, 35, 45, 5)$q$);
    IF err IS DISTINCT FROM 'NOT_AUTHORIZED' THEN
      RAISE EXCEPTION 'B1 CALLERS FAIL — U1: U% cambió los mínimos/máximos de horas sin global_settings.update (err=%)', n, err;
    END IF;
  END LOOP;
  -- Orden por setting_key: DAILY_MAX, DAILY_MIN, WEEKLY_MAX, WEEKLY_MIN (valores del fixture).
  SELECT string_agg(setting_value, ',' ORDER BY setting_key) INTO v_val FROM public.global_settings
   WHERE setting_key IN ('DAILY_MIN', 'DAILY_MAX', 'WEEKLY_MIN', 'WEEKLY_MAX');
  IF v_val IS DISTINCT FROM '12,0,40,40' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — U1: una llamada rechazada alteró global_settings (DAILY_MAX,DAILY_MIN,WEEKLY_MAX,WEEKLY_MIN = %)', v_val;
  END IF;
  RAISE NOTICE 'PASS — U1: manager, asistente y risk_supervisor reciben NOT_AUTHORIZED y global_settings no cambia';

  -- U2: anon → NOT_AUTHORIZED.
  PERFORM pg_temp.as_anon();
  err := pg_temp.try($q$SELECT public.update_timesheet_minmax_settings(1, 12, 35, 45, 5)$q$);
  IF err IS DISTINCT FROM 'NOT_AUTHORIZED' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — U2: anon no fue rechazado con NOT_AUTHORIZED (err=%)', err;
  END IF;
  RAISE NOTICE 'PASS — U2: anon da NOT_AUTHORIZED';

  -- U3: el admin pasa el chequeo y sigue sujeto a la validación de negocio (las reglas de rango
  -- no se saltaron al insertar el chequeo de llamador antes de ellas).
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000001');
  v_res := public.update_timesheet_minmax_settings(1, 12, 50, 45, 5);
  IF (v_res->>'success')::boolean IS DISTINCT FROM false OR v_res->>'error_code' IS DISTINCT FROM 'WEEKLY_MIN_EXCEEDS_MAX' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — U3: el admin no llegó a la validación de rango (res=%)', v_res;
  END IF;
  v_res := public.update_timesheet_minmax_settings(1, 12, 35, 45, 5);
  IF (v_res->>'success')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — U3: el admin no pudo actualizar los mínimos/máximos (res=%)', v_res;
  END IF;
  SELECT setting_value INTO v_val FROM public.global_settings WHERE setting_key = 'WEEKLY_MIN';
  IF v_val IS DISTINCT FROM '35' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — U3: WEEKLY_MIN no quedó en 35 tras la actualización del admin (valor=%)', v_val;
  END IF;
  RAISE NOTICE 'PASS — U3: el admin actualiza (WEEKLY_MIN=35) y las validaciones de rango siguen vigentes';

  -- U4: sin sesión → permitido (migraciones, SQL Editor).
  PERFORM pg_temp.no_session();
  v_res := public.update_timesheet_minmax_settings(0, 12, 40, 40, 5);
  IF (v_res->>'success')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — U4: sin sesión (ruta de migraciones) fue rechazado (res=%)', v_res;
  END IF;
  RAISE NOTICE 'PASS — U4: sin sesión sigue permitido';

  -- ════════════════════════════════════════════════════════════════════════════════════════════
  -- B1.2 — matriz de permisos
  -- ════════════════════════════════════════════════════════════════════════════════════════════

  -- P1: el permiso nuevo existe en el catálogo y lo tienen EXACTAMENTE estos cinco roles, con 'own'.
  IF NOT EXISTS (SELECT 1 FROM public.authorization_permissions WHERE permission_key = 'timesheet.self_approve') THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — P1: timesheet.self_approve no existe en authorization_permissions';
  END IF;
  SELECT string_agg(role_key || ':' || scope_key, ',' ORDER BY role_key) INTO v_roles
    FROM public.authorization_role_permissions WHERE permission_key = 'timesheet.self_approve';
  IF v_roles IS DISTINCT FROM 'admin:own,director:own,partner:own,risk_partner:own,senior_partner:own' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — P1: roles con timesheet.self_approve inesperados (%)', v_roles;
  END IF;
  RAISE NOTICE 'PASS — P1: timesheet.self_approve existe y lo tienen solo admin/senior_partner/director/partner/risk_partner (own)';

  -- P2: risk_partner — gana lectura de OT y los permisos de socio que le faltaban...
  IF pg_temp.scope_of('risk_partner', 'activity_code.read')              IS DISTINCT FROM 'none'
  OR pg_temp.scope_of('risk_partner', 'work_order.read')                 IS DISTINCT FROM 'department'
  OR pg_temp.scope_of('risk_partner', 'work_order.submit')               IS DISTINCT FROM 'assigned_engagements'
  OR pg_temp.scope_of('risk_partner', 'work_order.payment_plan.approve') IS DISTINCT FROM 'assigned_engagements'
  OR pg_temp.scope_of('risk_partner', 'client.create')                   IS DISTINCT FROM 'assigned_clients' THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — P2: risk_partner no tiene los permisos de socio sembrados en B1.2';
  END IF;
  -- ...pierde worksheet.create/update, pero conserva lectura/aprobación de hojas y la aprobación de riesgo.
  IF pg_temp.scope_of('risk_partner', 'worksheet.create') IS NOT NULL
  OR pg_temp.scope_of('risk_partner', 'worksheet.update') IS NOT NULL THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — P2: risk_partner conserva worksheet.create/update';
  END IF;
  IF pg_temp.scope_of('risk_partner', 'worksheet.read')        IS NULL
  OR pg_temp.scope_of('risk_partner', 'worksheet.approve')     IS NULL
  OR pg_temp.scope_of('risk_partner', 'work_order.risk.approve') IS NULL THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — P2: risk_partner perdió worksheet.read/approve o work_order.risk.approve (no-regresión)';
  END IF;
  -- Y NO se le dio escritura de OT: sigue sin work_order.create/update.
  IF pg_temp.scope_of('risk_partner', 'work_order.create') IS NOT NULL
  OR pg_temp.scope_of('risk_partner', 'work_order.update') IS NOT NULL THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — P2: risk_partner recibió work_order.create/update (la lectura no debía incluir escritura)';
  END IF;
  RAISE NOTICE 'PASS — P2: risk_partner gana lectura de OT/socio, pierde worksheet.create/update, sin escritura de OT';

  -- P3: risk_supervisor lee OT y el encargo de la OT; conserva su aprobación de riesgo.
  IF pg_temp.scope_of('risk_supervisor', 'work_order.read')         IS DISTINCT FROM 'department'
  OR pg_temp.scope_of('risk_supervisor', 'engagement.read')         IS DISTINCT FROM 'department'
  OR pg_temp.scope_of('risk_supervisor', 'work_order.risk.approve') IS NULL THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — P3: risk_supervisor no quedó con work_order.read/engagement.read (department) + risk.approve';
  END IF;
  RAISE NOTICE 'PASS — P3: risk_supervisor lee OT y encargo (department) y conserva work_order.risk.approve';

  -- P4: ningún otro rol cambió. Puntos de control sobre los que NO debían tocarse.
  IF pg_temp.scope_of('manager', 'worksheet.create')  IS DISTINCT FROM 'assigned_engagements'
  OR pg_temp.scope_of('manager', 'work_order.update') IS DISTINCT FROM 'assigned_engagements'
  OR pg_temp.scope_of('partner', 'work_order.create') IS NOT NULL
  OR pg_temp.scope_of('senior_partner', 'work_order.create') IS NOT NULL
  OR pg_temp.scope_of('manager', 'timesheet.self_approve')   IS NOT NULL
  OR pg_temp.scope_of('assistant', 'timesheet.self_approve') IS NOT NULL THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — P4: B1.2 alteró permisos de un rol que no debía cambiar (manager/partner/senior_partner/assistant)';
  END IF;
  RAISE NOTICE 'PASS — P4: manager/partner/senior_partner/assistant conservan su matriz (puntos de control)';

  -- P5: efecto real de la matriz por has_permission() con sesión, no solo por las filas.
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000006');
  IF NOT public.has_permission('work_order.read') OR public.has_permission('work_order.update') THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — P5: has_permission() de risk_partner no refleja lectura sí / escritura no de OT';
  END IF;
  PERFORM pg_temp.impersonate('a0b10000-0000-4000-8000-000000000007');
  IF NOT public.has_permission('work_order.read') OR NOT public.has_permission('engagement.read') THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — P5: has_permission() de risk_supervisor no ve OT/encargo';
  END IF;
  RAISE NOTICE 'PASS — P5: has_permission() con sesión coincide con la matriz para risk_partner y risk_supervisor';

  PERFORM pg_temp.no_session();
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- ACL — EXECUTE se evalúa contra el rol de la sesión, así que esta sección sí cambia de rol.
-- (CREATE OR REPLACE conserva los GRANT/REVOKE de cero_06: la migración no debe haberlos movido.)
-- ════════════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  f    text;
  denied boolean;
  v_res  jsonb;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.submit_timesheet_safe(uuid,uuid,uuid[],uuid[],boolean)',
    'public.sync_worksheet_to_wo_budget(uuid,uuid)',
    'public.update_timesheet_minmax_settings(numeric,numeric,numeric,numeric,integer)'
  ] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'B1 CALLERS FAIL — ACL: anon recuperó EXECUTE sobre %', f;
    END IF;
    IF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'B1 CALLERS FAIL — ACL: authenticated perdió EXECUTE sobre % (la app lo necesita)', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — ACL estática: anon sin EXECUTE y authenticated con EXECUTE en las tres RPC';

  -- Runtime: anon real recibe insufficient_privilege (antes de llegar a la función).
  EXECUTE 'SET LOCAL ROLE anon';
  denied := false;
  BEGIN
    PERFORM public.update_timesheet_minmax_settings(1, 12, 35, 45, 5);
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT denied THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — ACL: anon pudo invocar update_timesheet_minmax_settings en runtime';
  END IF;

  -- Runtime: el admin con el rol authenticated real sigue pudiendo (la ruta legítima de la app).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'a0b10000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.update_timesheet_minmax_settings(0, 12, 40, 40, 5);
  EXECUTE 'RESET ROLE';
  IF (v_res->>'success')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B1 CALLERS FAIL — ACL: el admin con rol authenticated no pudo actualizar (res=%)', v_res;
  END IF;
  RAISE NOTICE 'PASS — ACL runtime: anon rechazado por privilegio; admin como authenticated sigue funcionando';

  RAISE NOTICE 'B1 CALLERS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
