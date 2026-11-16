-- ETL F3 · D41 Parte I (13/11/2026): horas históricas APROBADAS dentro de EMS.
-- Contrato bajo prueba: public.import_historic_timesheets(text, jsonb, jsonb, jsonb) crea, en UNA transacción, períodos cerrados (is_period_locked) con procedencia
-- (import_batch / imported_at), las entradas vinculadas a ellos y las líneas nativas `approved` con el aprobador y la fecha que recibe (NULL si no hay evidencia). Solo el
-- propietario la ejecuta; no emite avisos de aprobación; no desactiva ningún trigger y los bloqueos normales de la aplicación siguen en pie. La Parte II (protección permanente,
-- reversión/desbloqueo, corte general) queda fuera y NO se prueba aquí.
--
-- DÓNDE CORRE: supabase/tests/local/run-rls-tests.sh (base scratch ems_rls_test_*). Transacción única, SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo y
-- "ETL F3 D41 HISTORY: ALL CHECKS PASSED (rolled back)".
BEGIN;

-- ── Fixture (prefijo d41): una persona que trabaja (S1), una que aprueba (S2), un encargo administrativo sin OT, dos actividades de sistema ─────────────────────────────
INSERT INTO public.clients (client_id, client_legal_name, tax_id) VALUES ('6d410000-0000-4000-8000-000000000001', 'Cliente D41', 'NIT-D41');
INSERT INTO auth.users (id) VALUES ('ad410000-0000-4000-8000-000000000001'), ('ad410000-0000-4000-8000-000000000002');
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id) VALUES
  ('5d410000-0000-4000-8000-000000000001', 'ad410000-0000-4000-8000-000000000001', 'D41', 'Trabaja', (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('5d410000-0000-4000-8000-000000000002', 'ad410000-0000-4000-8000-000000000002', 'D41', 'Aprueba', (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1));
-- Rol del DUEÑO (S1): sin rol notify_staff no emite nada; con `senior` la matriz le da `approval.line_approved` con alcance propio (lo usa el contraste del chequeo 4b).
INSERT INTO public.user_roles (user_id, role, role_key) VALUES ('ad410000-0000-4000-8000-000000000001', 'staff', 'senior');
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, status, work_order_required, engagement_state_override, start_date, end_date, fecha_cierre, society_id) VALUES
  ('7d410000-0000-4000-8000-000000000001', '6d410000-0000-4000-8000-000000000001', 'Encargo D41', 'D41-01', 'active', false, NULL, '2026-01-01', '2099-12-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1));
INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id) VALUES ('D41-A', 'Actividad D41 A', true, NULL), ('D41-B', 'Actividad D41 B', true, NULL);

-- Ayudantes: payloads y captura de errores (devuelve NULL si la sentencia entró o el SQLSTATE: mensaje si un trigger o la función la rechazó).
CREATE FUNCTION pg_temp.act(p_code text) RETURNS uuid LANGUAGE sql AS $$ SELECT activity_id FROM public.activity_codes WHERE activity_code = p_code AND is_active $$;
CREATE FUNCTION pg_temp.try(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN NULL; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || ': ' || SQLERRM; END $$;

-- Ejecuta una sentencia con el rol de la API (anon/authenticated/service_role) y el claim JWT dado; devuelve NULL si entró o el SQLSTATE: mensaje del rechazo.
CREATE FUNCTION pg_temp.try_as(p_role text, p_claims text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_err text;
BEGIN
  PERFORM set_config('request.jwt.claims', p_claims, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN EXECUTE p_sql; v_err := NULL; EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ': ' || SQLERRM; END;
  EXECUTE 'RESET ROLE';
  RETURN v_err;
END $$;

-- Lote de prueba: S1 trabaja jueves 04/06 (8 h en A, 3 h en B) y viernes 05/06 (2 h en A) = semana PARCIAL de 13 h; S2 trabaja 4,5 h en A.
-- Aprueban: S2 las líneas A de S1 (con fecha real), nadie conocido la B de S1 (NULL: sin evidencia), S1 la línea de S2.
CREATE FUNCTION pg_temp.payload(p_batch_week date, p_s1_period uuid, p_s2_period uuid, p_total_s1 text DEFAULT '13', p_late_date date DEFAULT NULL) RETURNS jsonb[] LANGUAGE sql AS $$
  SELECT ARRAY[
    jsonb_build_array(
      jsonb_build_object('periodId', p_s1_period, 'staffId', '5d410000-0000-4000-8000-000000000001', 'weekStart', p_batch_week, 'weekNumber', 36, 'year', 2026, 'totalHours', p_total_s1),
      jsonb_build_object('periodId', p_s2_period, 'staffId', '5d410000-0000-4000-8000-000000000002', 'weekStart', p_batch_week, 'weekNumber', 36, 'year', 2026, 'totalHours', '4.5')),
    jsonb_build_array(
      jsonb_build_object('timeId', gen_random_uuid(), 'dateWorked', p_batch_week + 3, 'hours', '8', 'staffId', '5d410000-0000-4000-8000-000000000001', 'engagementId', '7d410000-0000-4000-8000-000000000001', 'activityId', pg_temp.act('D41-A'), 'periodId', p_s1_period),
      jsonb_build_object('timeId', gen_random_uuid(), 'dateWorked', COALESCE(p_late_date, p_batch_week + 4), 'hours', '2', 'staffId', '5d410000-0000-4000-8000-000000000001', 'engagementId', '7d410000-0000-4000-8000-000000000001', 'activityId', pg_temp.act('D41-A'), 'periodId', p_s1_period),
      jsonb_build_object('timeId', gen_random_uuid(), 'dateWorked', p_batch_week + 3, 'hours', '3', 'staffId', '5d410000-0000-4000-8000-000000000001', 'engagementId', '7d410000-0000-4000-8000-000000000001', 'activityId', pg_temp.act('D41-B'), 'periodId', p_s1_period),
      jsonb_build_object('timeId', gen_random_uuid(), 'dateWorked', p_batch_week + 3, 'hours', '4.5', 'staffId', '5d410000-0000-4000-8000-000000000002', 'engagementId', '7d410000-0000-4000-8000-000000000001', 'activityId', pg_temp.act('D41-A'), 'periodId', p_s2_period)),
    jsonb_build_array(
      jsonb_build_object('approvalId', gen_random_uuid(), 'periodId', p_s1_period, 'engagementId', '7d410000-0000-4000-8000-000000000001', 'activityId', pg_temp.act('D41-A'), 'approvedBy', '5d410000-0000-4000-8000-000000000002', 'approvedAt', '2026-06-12T18:30:00-04:00'),
      jsonb_build_object('approvalId', gen_random_uuid(), 'periodId', p_s1_period, 'engagementId', '7d410000-0000-4000-8000-000000000001', 'activityId', pg_temp.act('D41-B'), 'approvedBy', NULL, 'approvedAt', NULL),
      jsonb_build_object('approvalId', gen_random_uuid(), 'periodId', p_s2_period, 'engagementId', '7d410000-0000-4000-8000-000000000001', 'activityId', pg_temp.act('D41-A'), 'approvedBy', '5d410000-0000-4000-8000-000000000001', 'approvedAt', '2026-06-11T09:30:00-04:00'))
  ]
$$;

DO $$
DECLARE
  c_batch  constant text := 'legacy:TimeControlDB_20261106_1600:d41';
  s1       constant uuid := '5d410000-0000-4000-8000-000000000001';
  s2       constant uuid := '5d410000-0000-4000-8000-000000000002';
  p1       constant uuid := 'bd410000-0000-4000-8000-000000000001';
  p2       constant uuid := 'bd410000-0000-4000-8000-000000000002';
  v_fn     constant regprocedure := 'public.import_historic_timesheets(text,jsonb,jsonb,jsonb)'::regprocedure;
  v_pl     jsonb[]; v_res jsonb; v_n bigint; v_err text; v_notif0 bigint; v_mail0 bigint; v_status text;
BEGIN
  -- 0. Esquema: columnas de procedencia SOLO en timesheet_periods (las entradas y las aprobaciones se identifican por period_id) y restricciones.
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'timesheet_periods' AND column_name IN ('import_batch', 'imported_at')) <> 2 THEN
    RAISE EXCEPTION 'FAIL (0a): timesheet_periods debe tener import_batch e imported_at'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('time_entries', 'timesheet_line_approvals') AND column_name IN ('import_batch', 'imported_at')) THEN
    RAISE EXCEPTION 'FAIL (0b): no se duplican import_batch/imported_at en time_entries ni en timesheet_line_approvals'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timesheet_periods_import_provenance_check') OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timesheet_periods_import_closed_check')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_timesheet_periods_import_batch') THEN RAISE EXCEPTION 'FAIL (0c): faltan las restricciones o el índice de procedencia'; END IF;
  RAISE NOTICE 'OK (0): procedencia import_batch/imported_at solo en timesheet_periods, con sus restricciones e índice';

  -- 1. Privilegios: solo el propietario (SECURITY INVOKER; sin EXECUTE para PUBLIC, anon, authenticated ni service_role).
  IF (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN RAISE EXCEPTION 'FAIL (1a): la función debe ser SECURITY INVOKER'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid = v_fn AND a.grantee = 0) THEN RAISE EXCEPTION 'FAIL (1b): PUBLIC conserva EXECUTE'; END IF;
  FOREACH v_status IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_function_privilege(v_status, v_fn, 'EXECUTE') THEN RAISE EXCEPTION 'FAIL (1c): % conserva EXECUTE', v_status; END IF;
  END LOOP;
  RAISE NOTICE 'OK (1): ejecutable solo por el propietario (sin PUBLIC, anon, authenticated ni service_role)';

  SELECT count(*) INTO v_notif0 FROM public.notifications WHERE type_key LIKE 'approval.%' OR type_key LIKE 'timesheet.%';
  SELECT count(*) INTO v_mail0 FROM public.notification_emails WHERE type_key LIKE 'approval.%' OR type_key LIKE 'timesheet.%';

  -- 2. Importación feliz: semana PARCIAL de 13 h, cerrada y aprobada, con procedencia y aprobador/fecha reales (NULL donde no hay evidencia).
  v_pl := pg_temp.payload('2026-06-01', p1, p2);
  v_res := public.import_historic_timesheets(c_batch, v_pl[1], v_pl[2], v_pl[3]);
  IF v_res <> jsonb_build_object('periods', 2, 'entries', 4, 'lines', 3, 'batch', c_batch) THEN RAISE EXCEPTION 'FAIL (2a): resultado inesperado %', v_res; END IF;
  IF (SELECT count(*) FROM public.timesheet_periods WHERE import_batch = c_batch AND is_period_locked IS TRUE AND submitted_at IS NOT NULL AND imported_at IS NOT NULL) <> 2 THEN RAISE EXCEPTION 'FAIL (2b): los 2 períodos deben quedar cerrados, con envío técnico y procedencia'; END IF;
  IF (SELECT total_hours FROM public.timesheet_periods WHERE period_id = p1) <> 13 THEN RAISE EXCEPTION 'FAIL (2c): la semana parcial conserva sus 13 h (no se completan 40)'; END IF;
  IF (SELECT count(*) FROM public.time_entries WHERE period_id IN (p1, p2)) <> 4 OR EXISTS (SELECT 1 FROM public.time_entries WHERE period_id IS NULL AND engagement_id = '7d410000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'FAIL (2d): las 4 entradas quedan vinculadas a su período'; END IF;
  IF (SELECT count(*) FROM public.timesheet_line_approvals WHERE period_id IN (p1, p2) AND status = 'approved') <> 3 THEN RAISE EXCEPTION 'FAIL (2e): las 3 líneas quedan approved'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.timesheet_line_approvals WHERE period_id = p1 AND activity_id = pg_temp.act('D41-A') AND approved_by = s2 AND approved_at = '2026-06-12T18:30:00-04:00'::timestamptz) THEN RAISE EXCEPTION 'FAIL (2f): aprobador y fecha reales de la línea A'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.timesheet_line_approvals WHERE period_id = p1 AND activity_id = pg_temp.act('D41-B') AND approved_by IS NULL AND approved_at IS NULL) THEN RAISE EXCEPTION 'FAIL (2g): sin evidencia, aprobador y fecha quedan NULL (no se atribuye a nadie)'; END IF;
  RAISE NOTICE 'OK (2): importación atómica: 2 períodos cerrados, 4 entradas vinculadas y 3 líneas approved; semana parcial de 13 h; aprobador/fecha reales o NULL';

  -- 3. Visualización: EMS muestra la semana importada como APROBADA aunque sea parcial.
  SELECT x->>'status' INTO v_status FROM jsonb_array_elements(public.get_week_statuses(s1, '2026-06-01', '2026-06-07')) x WHERE x->>'week_start' = '2026-06-01';
  IF v_status IS DISTINCT FROM 'APPROVED' THEN RAISE EXCEPTION 'FAIL (3): get_week_statuses debe dar APPROVED para la semana importada, dio %', v_status; END IF;
  IF (SELECT (x->>'is_submitted')::boolean FROM jsonb_array_elements(public.get_week_statuses(s1, '2026-06-01', '2026-06-07')) x WHERE x->>'week_start' = '2026-06-01') IS NOT TRUE THEN RAISE EXCEPTION 'FAIL (3b): la semana importada se ve cerrada (enviada)'; END IF;
  RAISE NOTICE 'OK (3): get_week_statuses = APPROVED y cerrada para una semana parcial importada';

  -- 4. Sin avisos ni correos de timesheet/aprobación por la importación; y el CONTRASTE: la misma aprobación fuera de la función sí avisaría (la marca es la que calla).
  IF (SELECT count(*) FROM public.notifications WHERE type_key LIKE 'approval.%' OR type_key LIKE 'timesheet.%') <> v_notif0 OR (SELECT count(*) FROM public.notification_emails WHERE type_key LIKE 'approval.%' OR type_key LIKE 'timesheet.%') <> v_mail0 THEN
    RAISE EXCEPTION 'FAIL (4a): la importación no debe generar avisos ni correos de timesheet/aprobación'; END IF;
  RAISE NOTICE 'OK (4a): 0 avisos y 0 correos de timesheet/aprobación por la importación';
  INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year) VALUES ('bd410000-0000-4000-8000-0000000000c1', s1, '2026-06-08', 37, 2026);
  INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked, hours_logged, period_id, is_forecast) VALUES (s1, '7d410000-0000-4000-8000-000000000001', pg_temp.act('D41-A'), '2026-06-09', 1, 'bd410000-0000-4000-8000-0000000000c1', false);
  INSERT INTO public.timesheet_line_approvals (period_id, engagement_id, activity_id, status, approved_by, approved_at) VALUES ('bd410000-0000-4000-8000-0000000000c1', '7d410000-0000-4000-8000-000000000001', pg_temp.act('D41-A'), 'approved', s2, now());
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE type_key = 'approval.line_approved' AND recipient_staff_id = s1) THEN RAISE EXCEPTION 'FAIL (4b): fuera de la función, una aprobación ajena SÍ debe avisar (contraste de la marca transaccional)'; END IF;
  RAISE NOTICE 'OK (4b): contraste: una aprobación normal sigue emitiendo su aviso; solo la importación lo calla';

  -- 5. Atomicidad y rigor: cada rechazo aborta TODA la llamada sin dejar nada.
  v_n := (SELECT count(*) FROM public.timesheet_periods) + (SELECT count(*) FROM public.time_entries) + (SELECT count(*) FROM public.timesheet_line_approvals);
  v_err := pg_temp.try(format('SELECT public.import_historic_timesheets(%L, %L, %L, %L)', 'legacy:X:d42', v_pl[1], v_pl[2], v_pl[3]));
  IF v_err IS NULL OR v_err NOT LIKE '22023: IMPORT_BATCH_INVALID%' THEN RAISE EXCEPTION 'FAIL (5a): un lote que no es D41 se rechaza (%)', v_err; END IF;
  v_err := pg_temp.try(format('SELECT public.import_historic_timesheets(%L, %L, %L, %L)', c_batch, v_pl[1], v_pl[2], v_pl[3]));
  IF v_err IS NULL OR v_err NOT LIKE '23505: IMPORT_BATCH_EXISTS%' THEN RAISE EXCEPTION 'FAIL (5b): un lote ya importado se rechaza (%)', v_err; END IF;
  v_pl := pg_temp.payload('2026-06-15', 'bd410000-0000-4000-8000-0000000000d1', 'bd410000-0000-4000-8000-0000000000d2', '13', '2026-06-25');
  v_err := pg_temp.try(format('SELECT public.import_historic_timesheets(%L, %L, %L, %L)', 'legacy:Prueba_D41_B:d41', v_pl[1], v_pl[2], v_pl[3]));
  IF v_err IS NULL OR v_err NOT LIKE '%IMPORT_ENTRY_OUTSIDE_PERIOD%' THEN RAISE EXCEPTION 'FAIL (5c): una entrada fuera de la semana de su período se rechaza (%)', v_err; END IF;
  v_pl := pg_temp.payload('2026-06-15', 'bd410000-0000-4000-8000-0000000000d1', 'bd410000-0000-4000-8000-0000000000d2', '12');
  v_err := pg_temp.try(format('SELECT public.import_historic_timesheets(%L, %L, %L, %L)', 'legacy:Prueba_D41_B:d41', v_pl[1], v_pl[2], v_pl[3]));
  IF v_err IS NULL OR v_err NOT LIKE '%IMPORT_PERIOD_TOTAL_MISMATCH%' THEN RAISE EXCEPTION 'FAIL (5d): un total distinto de la suma de las entradas se rechaza (%)', v_err; END IF;
  v_pl := pg_temp.payload('2026-06-15', 'bd410000-0000-4000-8000-0000000000d1', 'bd410000-0000-4000-8000-0000000000d2');
  v_err := pg_temp.try(format('SELECT public.import_historic_timesheets(%L, %L, %L, %L)', 'legacy:Prueba_D41_B:d41', v_pl[1], v_pl[2], (v_pl[3] - 2)));
  IF v_err IS NULL OR v_err NOT LIKE '%IMPORT_LINE_MISMATCH%' THEN RAISE EXCEPTION 'FAIL (5e): una entrada sin su línea aprobada se rechaza (%)', v_err; END IF;
  v_err := pg_temp.try(format('SELECT public.import_historic_timesheets(%L, %L, %L, %L)', 'legacy:Prueba_D41_B:d41', '[]', v_pl[2], v_pl[3]));
  IF v_err IS NULL OR v_err NOT LIKE '22023: IMPORT_PAYLOAD_INVALID%' THEN RAISE EXCEPTION 'FAIL (5f): un payload vacío se rechaza (%)', v_err; END IF;
  IF v_n <> (SELECT count(*) FROM public.timesheet_periods) + (SELECT count(*) FROM public.time_entries) + (SELECT count(*) FROM public.timesheet_line_approvals) THEN RAISE EXCEPTION 'FAIL (5g): un rechazo no deja ninguna fila'; END IF;
  RAISE NOTICE 'OK (5): 6 rechazos (lote inválido, repetido, entrada fuera de la semana, total distinto, línea faltante, payload vacío) sin dejar filas';

  -- 6. Restricciones del esquema: la procedencia va junta y un período importado queda cerrado.
  v_err := pg_temp.try($q$INSERT INTO public.timesheet_periods (staff_id, week_start_date, week_number, year, import_batch) VALUES ('5d410000-0000-4000-8000-000000000002', '2026-07-06', 28, 2026, 'legacy:X:d41')$q$);
  IF v_err IS NULL OR v_err NOT LIKE '23514%' THEN RAISE EXCEPTION 'FAIL (6a): import_batch sin imported_at se rechaza (%)', v_err; END IF;
  v_err := pg_temp.try($q$INSERT INTO public.timesheet_periods (staff_id, week_start_date, week_number, year, import_batch, imported_at, is_period_locked, submitted_at) VALUES ('5d410000-0000-4000-8000-000000000002', '2026-07-06', 28, 2026, 'legacy:X:d41', now(), false, now())$q$);
  IF v_err IS NULL OR v_err NOT LIKE '23514%' THEN RAISE EXCEPTION 'FAIL (6b): un período importado debe estar cerrado (%)', v_err; END IF;
  RAISE NOTICE 'OK (6): restricciones de procedencia y de cierre del período importado';

  -- 7. Bloqueos normales conservados (sin Parte II): no se agregan ni borran entradas de una línea aprobada, y el propio dueño no puede retirar el envío.
  v_err := pg_temp.try(format($q$INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked, hours_logged, period_id, is_forecast) VALUES (%L, '7d410000-0000-4000-8000-000000000001', %L, '2026-06-05', 1, %L, false)$q$, s1, pg_temp.act('D41-A'), p1));
  IF v_err IS NULL OR v_err NOT LIKE '%APPROVED_LINE_LOCKED%' THEN RAISE EXCEPTION 'FAIL (7a): no se agregan horas a una línea aprobada (%)', v_err; END IF;
  v_err := pg_temp.try(format($q$DELETE FROM public.time_entries WHERE period_id = %L AND activity_id = %L$q$, p1, pg_temp.act('D41-A')));
  IF v_err IS NULL OR v_err NOT LIKE '%APPROVED_LINE_LOCKED%' THEN RAISE EXCEPTION 'FAIL (7b): no se borran horas de una línea aprobada (%)', v_err; END IF;
  v_err := pg_temp.try_as('authenticated', json_build_object('sub', 'ad410000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, format('SELECT public.unsubmit_timesheet_safe(%L)', p1));
  IF v_err IS NULL OR v_err NOT LIKE '%UNSUBMIT_PERIOD_LOCKED%' THEN RAISE EXCEPTION 'FAIL (7c): el dueño no puede retirar el envío de un período cerrado (%)', v_err; END IF;
  RAISE NOTICE 'OK (7): bloqueos existentes conservados (APPROVED_LINE_LOCKED al agregar/borrar y UNSUBMIT_PERIOD_LOCKED)';

  -- 8. Ejecución por roles de la API: anon, authenticated y service_role reciben permission denied (42501), no entran por RLS ni por RPC.
  FOREACH v_status IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    v_err := pg_temp.try_as(v_status, json_build_object('role', v_status)::text, format('SELECT public.import_historic_timesheets(%L, %L, %L, %L)', 'legacy:Prueba_D41_C:d41', v_pl[1], v_pl[2], v_pl[3]));
    IF v_err IS NULL OR v_err NOT LIKE '42501%' THEN RAISE EXCEPTION 'FAIL (8): % no puede ejecutar la función (%)', v_status, v_err; END IF;
  END LOOP;
  RAISE NOTICE 'OK (8): anon, authenticated y service_role reciben permission denied';

  RAISE NOTICE 'ETL F3 D41 HISTORY: ALL CHECKS PASSED (rolled back)';
END
$$;

ROLLBACK;
