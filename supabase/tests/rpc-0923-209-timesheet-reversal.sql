-- BUG 0923-209 — Solicitar la reversión de boletas de horas aprobadas.
-- (20260929160000_0923-209_timesheet_reversal_requests.sql: tabla
--  timesheet_reversal_requests + request_timesheet_reversal/execute_timesheet_reversal/
--  reject_timesheet_reversal + 3 tipos de notificación approval.reversal_*.)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después del set consolidado, el
-- catálogo RBAC y las migraciones de notificaciones. Transacción única, SIEMPRE hace
-- ROLLBACK. Salida de éxito: una NOTICE por chequeo, terminando en
-- "0923-209 REVERSAL: ALL CHECKS PASSED (rolled back)".
--
-- Por qué la mayoría de los pasos NO usan `SET LOCAL ROLE authenticated`: las 3 RPC son
-- SECURITY DEFINER y auth.uid() lee el GUC request.jwt.claims directo (00-shim-auth.sql),
-- sin depender del rol de Postgres — y el owner de la sesión (quien aplicó las migraciones)
-- tiene privilegio EXECUTE implícito sobre sus propias funciones pese al REVOKE de la
-- migración. Sólo el chequeo 10 (RLS de la tabla) necesita el rol `authenticated` de
-- verdad, porque RLS se salta para el owner — por eso va al final.
--
-- Fixture world (ids con prefijo 0923209):
--   S_ADMIN    admin                          — ejecuta y rechaza
--   S_MGR      manager, manager_id de E1      — aprueba/solicita por el camino encargo
--   S_OMGR     manager, SIN relación con E1/E2 — negativo de autorización (check 2)
--   S_OWNER    assistant                       — dueño de PA/PB/PC/PD, solicita alcance semana
--   S_PARTNER  partner                         — dueño de PE, sólo para el check 12
--   E1/E2      encargos, ambos manager_id = S_MGR
--   PA  2 líneas aprobadas (E1, E2)             — checks 2, 4, 5, 6, 9, 10, 11
--   PB  1 línea aprobada (E1), semana MUY pasada — check 3 (alcance semana, sin ventana)
--   PC  1 línea aprobada (E1)                   — check 7 (cascada)
--   PD  1 línea aprobada (E1)                   — check 8 (rechazo)
--   PE  1 línea aprobada (E1), dueño S_PARTNER  — check 12 (unsubmit_timesheet_safe intacto)

BEGIN;

-- ── Fixtures (as owner; SECURITY DEFINER RPCs escalan igual, RLS no aplica al owner) ──

INSERT INTO public.practicas (practica_id, name, code, abbreviation)
VALUES ('5e923209-0000-4000-8000-000000000001', '0923-209 Test Practice', 9, 'REV')
ON CONFLICT (practica_id) DO NOTHING;

INSERT INTO public.society (society_id, name)
VALUES ('50c92320-9000-4000-8000-000000000001', '0923-209 Test Society')
ON CONFLICT (society_id) DO NOTHING;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c1923209-0000-4000-8000-000000000001', '0923-209 Test Client', '0923209-TAX-001');

INSERT INTO auth.users (id) VALUES
  ('a0923209-0000-4000-8000-000000000001'), -- admin
  ('a0923209-0000-4000-8000-000000000002'), -- manager (E1)
  ('a0923209-0000-4000-8000-000000000003'), -- manager (unrelated)
  ('a0923209-0000-4000-8000-000000000004'), -- owner (assistant)
  ('a0923209-0000-4000-8000-000000000005'); -- partner (check 12)

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0923209-0000-4000-8000-000000000001', 'admin',   'admin'),
  ('a0923209-0000-4000-8000-000000000002', 'manager', 'manager'),
  ('a0923209-0000-4000-8000-000000000003', 'manager', 'manager'),
  ('a0923209-0000-4000-8000-000000000004', 'staff',   'assistant'),
  ('a0923209-0000-4000-8000-000000000005', 'partner', 'partner');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id) VALUES
  ('50923209-0000-4000-8000-000000000001', 'a0923209-0000-4000-8000-000000000001', 'Admin',   'Rev', '5e923209-0000-4000-8000-000000000001', '50c92320-9000-4000-8000-000000000001'),
  ('50923209-0000-4000-8000-000000000002', 'a0923209-0000-4000-8000-000000000002', 'Manager', 'Rev', '5e923209-0000-4000-8000-000000000001', '50c92320-9000-4000-8000-000000000001'),
  ('50923209-0000-4000-8000-000000000003', 'a0923209-0000-4000-8000-000000000003', 'Other',   'Mgr', '5e923209-0000-4000-8000-000000000001', '50c92320-9000-4000-8000-000000000001'),
  ('50923209-0000-4000-8000-000000000004', 'a0923209-0000-4000-8000-000000000004', 'Owner',   'Rev', '5e923209-0000-4000-8000-000000000001', '50c92320-9000-4000-8000-000000000001'),
  ('50923209-0000-4000-8000-000000000005', 'a0923209-0000-4000-8000-000000000005', 'Partner', 'Rev', '5e923209-0000-4000-8000-000000000001', '50c92320-9000-4000-8000-000000000001');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id, fecha_cierre, work_order_required, society_id) VALUES
  ('e0923209-0000-4000-8000-000000000001', 'c1923209-0000-4000-8000-000000000001', '0923-209 E1', '50923209-0000-4000-8000-000000000002', '2027-12-31', false, '50c92320-9000-4000-8000-000000000001'),
  ('e0923209-0000-4000-8000-000000000002', 'c1923209-0000-4000-8000-000000000001', '0923-209 E2', '50923209-0000-4000-8000-000000000002', '2027-12-31', false, '50c92320-9000-4000-8000-000000000001');

INSERT INTO public.activity_codes (activity_id, activity_code, description, practica_id)
VALUES ('ac923209-0000-4000-8000-000000000001', 'REV-A1', '0923-209 Test Activity', '5e923209-0000-4000-8000-000000000001');

INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year, submitted_at, is_period_locked) VALUES
  ('b0923209-0000-4000-8000-000000000001', '50923209-0000-4000-8000-000000000004', '2021-01-04', 1, 2021, now(), false), -- PA
  ('b0923209-0000-4000-8000-000000000002', '50923209-0000-4000-8000-000000000004', '2020-01-06', 2, 2020, now(), false), -- PB
  ('b0923209-0000-4000-8000-000000000003', '50923209-0000-4000-8000-000000000004', '2020-02-03', 6, 2020, now(), false), -- PC
  ('b0923209-0000-4000-8000-000000000004', '50923209-0000-4000-8000-000000000004', '2020-03-02', 10, 2020, now(), false), -- PD
  ('b0923209-0000-4000-8000-000000000005', '50923209-0000-4000-8000-000000000005', '2020-04-06', 15, 2020, now(), false); -- PE

INSERT INTO public.timesheet_line_approvals (approval_id, period_id, engagement_id, activity_id, status, approved_by, approved_at) VALUES
  ('1a923209-0000-4000-8000-000000000001', 'b0923209-0000-4000-8000-000000000001', 'e0923209-0000-4000-8000-000000000001', 'ac923209-0000-4000-8000-000000000001', 'approved', '50923209-0000-4000-8000-000000000002', now()), -- PA/E1
  ('1a923209-0000-4000-8000-000000000002', 'b0923209-0000-4000-8000-000000000001', 'e0923209-0000-4000-8000-000000000002', 'ac923209-0000-4000-8000-000000000001', 'approved', '50923209-0000-4000-8000-000000000002', now()), -- PA/E2
  ('1a923209-0000-4000-8000-000000000003', 'b0923209-0000-4000-8000-000000000002', 'e0923209-0000-4000-8000-000000000001', 'ac923209-0000-4000-8000-000000000001', 'approved', '50923209-0000-4000-8000-000000000002', now()), -- PB/E1
  ('1a923209-0000-4000-8000-000000000004', 'b0923209-0000-4000-8000-000000000003', 'e0923209-0000-4000-8000-000000000001', 'ac923209-0000-4000-8000-000000000001', 'approved', '50923209-0000-4000-8000-000000000002', now()), -- PC/E1
  ('1a923209-0000-4000-8000-000000000005', 'b0923209-0000-4000-8000-000000000004', 'e0923209-0000-4000-8000-000000000001', 'ac923209-0000-4000-8000-000000000001', 'approved', '50923209-0000-4000-8000-000000000002', now()), -- PD/E1
  ('1a923209-0000-4000-8000-000000000006', 'b0923209-0000-4000-8000-000000000005', 'e0923209-0000-4000-8000-000000000001', 'ac923209-0000-4000-8000-000000000001', 'approved', '50923209-0000-4000-8000-000000000002', now()); -- PE/E1

-- ── Impersonation helper (temp; se va con la sesión) ──────────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  )
$$;

DO $$
DECLARE
  denied   boolean;
  errmsg   text;
  v_r1     uuid; -- request de MGR sobre PA/E1 (checks 4,5,6,11)
  v_r3     uuid; -- request de MGR sobre PC/E1 (check 7, cascada)
  v_r2     uuid; -- request de OWNER sobre PD, semana (check 8)
  v_result uuid;
  v_status text;
  v_notes  text;
  n        int;
BEGIN
  -- ── Check 1: un manager (no admin) no puede ejecutar → REVERSAL_NOT_ADMIN ──
  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000002');
  denied := false;
  BEGIN
    PERFORM public.execute_timesheet_reversal(
      'b0923209-0000-4000-8000-000000000001', 'engagement',
      'e0923209-0000-4000-8000-000000000001', 'reason', NULL);
  EXCEPTION WHEN raise_exception THEN
    denied := true; errmsg := SQLERRM;
  END;
  IF NOT denied OR errmsg <> 'REVERSAL_NOT_ADMIN' THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 1: un manager no-admin no fue rechazado con REVERSAL_NOT_ADMIN (denied=%, err=%)', denied, errmsg;
  END IF;
  RAISE NOTICE 'PASS — check 1: un manager no-admin no puede ejecutar (REVERSAL_NOT_ADMIN)';

  -- ── Check 2: un aprobador SIN relación con el encargo no puede solicitar ──
  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000003');
  denied := false;
  BEGIN
    PERFORM public.request_timesheet_reversal(
      'b0923209-0000-4000-8000-000000000001', 'engagement',
      'e0923209-0000-4000-8000-000000000001', 'reason');
  EXCEPTION WHEN raise_exception THEN
    denied := true; errmsg := SQLERRM;
  END;
  IF NOT denied OR errmsg <> 'REVERSAL_NOT_AUTHORIZED' THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 2: aprobador sin relación con el encargo no fue rechazado con REVERSAL_NOT_AUTHORIZED (denied=%, err=%)', denied, errmsg;
  END IF;
  RAISE NOTICE 'PASS — check 2: un aprobador que no es manager_id/partner_id del encargo no puede solicitar';

  -- ── Check 5: solicitud abierta bloquea una segunda sobre el mismo destino ──
  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000002');
  SELECT public.request_timesheet_reversal(
    'b0923209-0000-4000-8000-000000000001', 'engagement',
    'e0923209-0000-4000-8000-000000000001', 'motivo de solicitud') INTO v_r1;
  IF v_r1 IS NULL THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 5: la solicitud inicial no devolvió request_id';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.request_timesheet_reversal(
      'b0923209-0000-4000-8000-000000000001', 'engagement',
      'e0923209-0000-4000-8000-000000000001', 'segunda solicitud');
  EXCEPTION WHEN raise_exception THEN
    denied := true; errmsg := SQLERRM;
  END;
  IF NOT denied OR errmsg <> 'REVERSAL_ALREADY_REQUESTED' THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 5: la segunda solicitud sobre el mismo destino no fue rechazada con REVERSAL_ALREADY_REQUESTED (denied=%, err=%)', denied, errmsg;
  END IF;
  RAISE NOTICE 'PASS — check 5: una segunda solicitud abierta sobre el mismo destino da REVERSAL_ALREADY_REQUESTED';

  -- ── Check 4: alcance ENCARGO -- el período no se toca, el otro encargo sigue aprobado ──
  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000001');
  SELECT public.execute_timesheet_reversal(
    'b0923209-0000-4000-8000-000000000001', 'engagement',
    'e0923209-0000-4000-8000-000000000001', 'ejecuta encargo', v_r1) INTO v_result;
  IF v_result <> v_r1 THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 4: execute con p_request_id devolvió % en vez de %', v_result, v_r1;
  END IF;

  PERFORM 1 FROM public.timesheet_periods
   WHERE period_id = 'b0923209-0000-4000-8000-000000000001' AND submitted_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 4: submitted_at de PA se tocó en alcance encargo';
  END IF;

  PERFORM 1 FROM public.timesheet_line_approvals
   WHERE approval_id = '1a923209-0000-4000-8000-000000000001' AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 4: la línea del encargo objetivo (E1) no quedó pending';
  END IF;

  PERFORM 1 FROM public.timesheet_line_approvals
   WHERE approval_id = '1a923209-0000-4000-8000-000000000002' AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 4: la línea de OTRO encargo (E2) del mismo período dejó de estar approved (no-vacuidad)';
  END IF;
  RAISE NOTICE 'PASS — check 4: alcance encargo no toca el período y no afecta a otros encargos de la misma semana';

  -- ── Check 6: ejecutar dos veces la misma solicitud → REVERSAL_NOT_PENDING ──
  denied := false;
  BEGIN
    PERFORM public.execute_timesheet_reversal(
      'b0923209-0000-4000-8000-000000000001', 'engagement',
      'e0923209-0000-4000-8000-000000000001', 'segunda ejecución', v_r1);
  EXCEPTION WHEN raise_exception THEN
    denied := true; errmsg := SQLERRM;
  END;
  IF NOT denied OR errmsg <> 'REVERSAL_NOT_PENDING' THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 6: ejecutar dos veces la misma solicitud no dio REVERSAL_NOT_PENDING (denied=%, err=%)', denied, errmsg;
  END IF;
  RAISE NOTICE 'PASS — check 6: ejecutar dos veces la misma solicitud da REVERSAL_NOT_PENDING';

  -- ── Check 9: reversión DIRECTA del admin (sin solicitud previa) queda como bitácora ──
  SELECT public.execute_timesheet_reversal(
    'b0923209-0000-4000-8000-000000000001', 'engagement',
    'e0923209-0000-4000-8000-000000000002', 'reversión directa', NULL) INTO v_result;

  PERFORM 1 FROM public.timesheet_reversal_requests
   WHERE request_id = v_result AND is_direct = true AND status = 'executed'
     AND requested_by = '50923209-0000-4000-8000-000000000001';
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 9: la reversión directa no dejó una fila is_direct=true/executed a nombre del admin';
  END IF;

  PERFORM 1 FROM public.timesheet_line_approvals
   WHERE approval_id = '1a923209-0000-4000-8000-000000000002' AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 9: la reversión directa no dejó la línea de E2 en pending';
  END IF;
  RAISE NOTICE 'PASS — check 9: la reversión directa del admin (sin solicitud) deja fila is_direct=true/executed';

  -- ── Check 3: alcance SEMANA sobre una semana MUY pasada -- sin ventana ──
  SELECT public.execute_timesheet_reversal(
    'b0923209-0000-4000-8000-000000000002', 'week', NULL, 'ejecuta semana pasada', NULL) INTO v_result;

  PERFORM 1 FROM public.timesheet_periods
   WHERE period_id = 'b0923209-0000-4000-8000-000000000002' AND submitted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 3: submitted_at de PB no quedó NULL tras la reversión de semana';
  END IF;

  SELECT count(*) INTO n FROM public.timesheet_line_approvals
   WHERE period_id = 'b0923209-0000-4000-8000-000000000002' AND status = 'approved';
  IF n <> 0 THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 3: quedaron % líneas approved en PB tras la reversión de semana', n;
  END IF;
  RAISE NOTICE 'PASS — check 3: admin ejecuta alcance semana sobre una semana pasada sin APPROVED_WEEK_RECALL_WINDOW_CLOSED';

  -- ── Check 7: ejecución de alcance SEMANA cierra en cascada las solicitudes de encargo pending del período ──
  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000002');
  SELECT public.request_timesheet_reversal(
    'b0923209-0000-4000-8000-000000000003', 'engagement',
    'e0923209-0000-4000-8000-000000000001', 'solicitud sobre PC') INTO v_r3;

  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000001');
  PERFORM public.execute_timesheet_reversal(
    'b0923209-0000-4000-8000-000000000003', 'week', NULL, 'ejecuta semana PC', NULL);

  SELECT status, resolution_notes INTO v_status, v_notes
    FROM public.timesheet_reversal_requests WHERE request_id = v_r3;
  IF v_status <> 'executed' OR v_notes <> 'ejecuta semana PC' THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 7: la solicitud de encargo pending de PC no cerró en cascada (status=%, notes=%)', v_status, v_notes;
  END IF;
  RAISE NOTICE 'PASS — check 7: ejecutar alcance semana cierra en cascada las solicitudes de encargo pending del mismo período';

  -- ── Check 8: rechazo -- notas obligatorias, no toca línea ni período ──
  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000004');
  SELECT public.request_timesheet_reversal(
    'b0923209-0000-4000-8000-000000000004', 'week', NULL, 'solicitud del dueño') INTO v_r2;

  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000001');
  denied := false;
  BEGIN
    PERFORM public.reject_timesheet_reversal(v_r2, '');
  EXCEPTION WHEN raise_exception THEN
    denied := true; errmsg := SQLERRM;
  END;
  IF NOT denied OR errmsg <> 'REVERSAL_REJECT_NOTES_REQUIRED' THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 8: rechazar sin notas no dio REVERSAL_REJECT_NOTES_REQUIRED (denied=%, err=%)', denied, errmsg;
  END IF;

  PERFORM public.reject_timesheet_reversal(v_r2, 'no corresponde revertir');

  SELECT status INTO v_status FROM public.timesheet_reversal_requests WHERE request_id = v_r2;
  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 8: la solicitud rechazada no quedó en status=rejected (got %)', v_status;
  END IF;

  PERFORM 1 FROM public.timesheet_periods
   WHERE period_id = 'b0923209-0000-4000-8000-000000000004' AND submitted_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 8: rechazar una solicitud tocó submitted_at de PD';
  END IF;

  PERFORM 1 FROM public.timesheet_line_approvals
   WHERE approval_id = '1a923209-0000-4000-8000-000000000005' AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 8: rechazar una solicitud alteró la línea de PD/E1';
  END IF;
  RAISE NOTICE 'PASS — check 8: rechazar exige notas y no toca ninguna línea ni el período';

  -- ── Check 11: notificaciones creadas -- admin al solicitar, gerente al ejecutar, ──
  -- solicitante al rechazar -- y ninguna fila en la cola de correo (email_enabled=false) ──
  PERFORM 1 FROM public.notifications
   WHERE recipient_staff_id = '50923209-0000-4000-8000-000000000001'
     AND type_key = 'approval.reversal_requested'
     AND entity_id = v_r1::text;
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 11: el admin no recibió approval.reversal_requested por la solicitud de MGR sobre PA/E1';
  END IF;

  PERFORM 1 FROM public.notifications
   WHERE recipient_staff_id = '50923209-0000-4000-8000-000000000002'
     AND type_key = 'approval.reversal_executed'
     AND entity_id = 'b0923209-0000-4000-8000-000000000001'
     AND payload->>'reason' = 'ejecuta encargo';
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 11: el gerente de E1 no recibió approval.reversal_executed al ejecutarse la reversión de PA/E1';
  END IF;

  PERFORM 1 FROM public.notifications
   WHERE recipient_staff_id = '50923209-0000-4000-8000-000000000004'
     AND type_key = 'approval.reversal_rejected'
     AND entity_id = v_r2::text;
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 11: el solicitante (dueño) no recibió approval.reversal_rejected';
  END IF;

  SELECT count(*) INTO n FROM public.notification_emails
   WHERE type_key IN ('approval.reversal_requested', 'approval.reversal_executed', 'approval.reversal_rejected');
  IF n <> 0 THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 11: se encolaron % correos para tipos email_enabled=false', n;
  END IF;
  RAISE NOTICE 'PASS — check 11: se crearon las notificaciones esperadas (admin/gerente/solicitante) y ninguna fila de cola de correo';

  -- ── Check 12: unsubmit_timesheet_safe sigue existiendo con su comportamiento intacto ──
  -- (dueño = partner, boleta totalmente aprobada, semana MUY pasada -- debe seguir
  -- exigiendo la ventana de la semana en curso, prueba de que esta migración no la tocó).
  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000005');
  denied := false;
  BEGIN
    PERFORM public.unsubmit_timesheet_safe('b0923209-0000-4000-8000-000000000005');
  EXCEPTION WHEN raise_exception THEN
    denied := true; errmsg := SQLERRM;
  END;
  IF NOT denied OR errmsg <> 'APPROVED_WEEK_RECALL_WINDOW_CLOSED' THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 12: unsubmit_timesheet_safe no exigió más la ventana de semana en curso (denied=%, err=%) -- ¿se tocó la función?', denied, errmsg;
  END IF;

  PERFORM 1 FROM public.timesheet_periods
   WHERE period_id = 'b0923209-0000-4000-8000-000000000005' AND submitted_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 12: el intento fallido de unsubmit igual tocó submitted_at de PE';
  END IF;
  RAISE NOTICE 'PASS — check 12: unsubmit_timesheet_safe conserva su firma, su chequeo de dueño y su ventana de semana en curso';
END $$;

-- ── Check 10: RLS -- el solicitante ve su fila, el admin ve todas, un tercero ninguna ──
-- Único paso que necesita el rol `authenticated` de verdad: RLS se salta para el owner.
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  n int;
  v_total int;
BEGIN
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_total FROM public.timesheet_reversal_requests;
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- El solicitante (MGR) ve al menos su propia solicitud sobre PA/E1.
  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000002');
  SELECT count(*) INTO n FROM public.timesheet_reversal_requests
   WHERE requested_by = '50923209-0000-4000-8000-000000000002';
  IF n < 1 THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 10: el solicitante no ve su propia solicitud (n=%)', n;
  END IF;

  -- El admin ve todas las filas, sin excepción.
  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000001');
  SELECT count(*) INTO n FROM public.timesheet_reversal_requests;
  IF n <> v_total THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 10: el admin ve % filas en vez de las % totales', n, v_total;
  END IF;

  -- Un tercero sin relación (ni admin, ni solicitante, ni dueño del período, ni aprobador
  -- de ningún encargo involucrado) no ve ninguna.
  PERFORM pg_temp.impersonate('a0923209-0000-4000-8000-000000000003');
  SELECT count(*) INTO n FROM public.timesheet_reversal_requests;
  IF n <> 0 THEN
    RAISE EXCEPTION '0923-209 REVERSAL FAIL — check 10: un tercero sin relación ve % filas (fuga de RLS)', n;
  END IF;
  RAISE NOTICE 'PASS — check 10: RLS -- el solicitante ve su fila, el admin ve todas, un tercero no ve ninguna';
  RAISE NOTICE '0923-209 REVERSAL: ALL CHECKS PASSED (rolled back)';
END $$;

RESET ROLE;

ROLLBACK;
