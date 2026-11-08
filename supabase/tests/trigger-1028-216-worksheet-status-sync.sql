-- BUG 1028-216 — tr_sync_worksheet_status_from_wo: el estado de la Matriz de Trabajo sigue a las
-- aprobaciones de su OT (sync_worksheet_status_from_work_order en cero_02, el trigger en cero_04,
-- el REVOKE en cero_06; bugs/1028-216/plan_v2.md).
--
-- Regla: Aprobada <=> OT 'Approved' + firma del Socio + Riesgos vigente (Approved, Emergency_Approved,
-- o Pending tras completar los datos de emergencia, con emergency_partner_at conservado). Todo lo
-- demás es Borrador. archived y las matrices sin wo_id no se tocan. La sincronización no emite
-- worksheet.sent_to_quality.
--
-- DÓNDE CORRE: supabase/tests/local/run-rls-tests.sh. Transacción única, SIEMPRE hace ROLLBACK.
-- Salida de éxito: una NOTICE por chequeo, terminando en
-- "WORKSHEET STATUS SYNC 1028-216: ALL CHECKS PASSED (rolled back)".
--
-- Las escrituras de la OT van como `authenticated` con el claim JWT real (las guardas de firma y de
-- Riesgos miran auth.uid()), reproduciendo las sentencias de useWorkOrderMutations. Los helpers
-- LIMPIAN el claim al terminar.
--
-- Fixture (ids con prefijo 1028216): A admin, P socio y gerente del encargo, R risk_partner que es el
-- SQR asignado pero NO es socio ni gerente: no pasa worksheet_team_update. 1028-213 (D-21, D-37): el SQR
-- ya no tiene política de UPDATE sobre work_orders (se retiró "Assigned SQR can update work orders"), así
-- que R aprueba Riesgos por la función approve_wo_risk (SECURITY DEFINER); el resto de las escrituras de
-- Riesgos de la suite (rechazo, revisión/firma de emergencia) las hace el admin con la misma sentencia
-- de useWorkOrderMutations. E1..E4 encargos de cliente, una OT cada uno:
--   WO1 flujo normal (matrices WS1 draft y WS1A archived), WO2 aislamiento (WS2; WS0 sin wo_id en E2),
--   WO3 flujo de emergencia (WS3), WO4 estado forzado (WS4).
-- "No se reescribió" se mide con ctid: updated_at no sirve porque now() es fijo en la transacción.

BEGIN;

INSERT INTO public.clients (client_id, client_legal_name, tax_id) VALUES
  ('c1028216-0000-4000-8000-000000000001', 'Cliente 1028-216', 'NIT-1028216');

INSERT INTO auth.users (id) VALUES
  ('a1028216-0000-4000-8000-000000000001'),
  ('a1028216-0000-4000-8000-000000000002'),
  ('a1028216-0000-4000-8000-000000000003');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a1028216-0000-4000-8000-000000000001', 'admin',   'admin'),
  ('a1028216-0000-4000-8000-000000000002', 'partner', 'partner'),
  ('a1028216-0000-4000-8000-000000000003', 'partner', 'risk_partner')
-- handle_new_user puede haber creado ya la fila del usuario (según el ambiente): se pisa con el rol del fixture.
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, role_key = EXCLUDED.role_key;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
SELECT ('51028216-0000-4000-8000-00000000000' || n)::uuid, ('a1028216-0000-4000-8000-00000000000' || n)::uuid,
       'U' || n, 'Staff1028216',
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1)
FROM (VALUES ('1'), ('2'), ('3')) AS v(n);

SET LOCAL session_replication_role = replica;
-- Una OT por encargo (work_orders_engagement_id_key): E<n> lleva WO<n>.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, funcion, practica,
                                fecha_cierre, work_order_required, approval_required, society_id,
                                manager_id, partner_id, sqr_id)
SELECT ('e1028216-0000-4000-8000-00000000000' || n)::uuid, 'c1028216-0000-4000-8000-000000000001',
       'Matriz 1028216 ' || n, 'MT-1028216-' || n, 1, 1, '2027-12-31', true, false,
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
       '51028216-0000-4000-8000-000000000002', '51028216-0000-4000-8000-000000000002',
       '51028216-0000-4000-8000-000000000003'
FROM (VALUES ('1'), ('2'), ('3'), ('4')) AS v(n);

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status, risk_status)
SELECT ('01028216-0000-4000-8000-00000000000' || n)::uuid, ('e1028216-0000-4000-8000-00000000000' || n)::uuid,
       'BOB', 'High', 'Pending_Approval', 'Pending'
FROM (VALUES ('1'), ('2'), ('3'), ('4')) AS v(n);

INSERT INTO public.activity_worksheets (id, engagement_id, wo_id, version, status) VALUES
  ('f1028216-0000-4000-8000-000000000001', 'e1028216-0000-4000-8000-000000000001', '01028216-0000-4000-8000-000000000001', 1, 'draft'),
  ('f1028216-0000-4000-8000-00000000001a', 'e1028216-0000-4000-8000-000000000001', '01028216-0000-4000-8000-000000000001', 2, 'archived'),
  ('f1028216-0000-4000-8000-000000000002', 'e1028216-0000-4000-8000-000000000002', '01028216-0000-4000-8000-000000000002', 1, 'draft'),
  ('f1028216-0000-4000-8000-000000000003', 'e1028216-0000-4000-8000-000000000003', '01028216-0000-4000-8000-000000000003', 1, 'draft'),
  ('f1028216-0000-4000-8000-000000000004', 'e1028216-0000-4000-8000-000000000004', '01028216-0000-4000-8000-000000000004', 1, 'draft'),
  ('f1028216-0000-4000-8000-000000000000', 'e1028216-0000-4000-8000-000000000002', NULL,                                   2, 'draft');
-- WO1 llega con los cinco campos de Riesgos completos: approve_wo_risk los exige (1028-213). Con triggers
-- apagados (replica) este UPDATE no toca las matrices.
UPDATE public.work_orders
   SET ceac_completed_at = current_date, san_completed_at = current_date,
       ceac_number = 'C-1', san_approval_id = 'S-1', risk_level = 'Bajo'
 WHERE wo_id = '01028216-0000-4000-8000-000000000001';
SET LOCAL session_replication_role = origin;

-- Ejecuta como `authenticated` con el claim de p_sub. Si falla, limpia el claim y re-lanza.
CREATE FUNCTION pg_temp.exec_as(p_sub text, p_sql text) RETURNS bigint
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
    RAISE;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN n;
END $$;

-- Igual, pero devuelve 'ERR <sqlstate>' en vez de re-lanzar.
CREATE FUNCTION pg_temp.try_as(p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.exec_as(p_sub, p_sql)::text;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR ' || SQLSTATE;
END $$;

CREATE FUNCTION pg_temp.ws(p_id text) RETURNS text
LANGUAGE sql AS $$ SELECT status::text FROM public.activity_worksheets WHERE id = p_id::uuid $$;

CREATE FUNCTION pg_temp.ws_ctid(p_id text) RETURNS tid
LANGUAGE sql AS $$ SELECT ctid FROM public.activity_worksheets WHERE id = p_id::uuid $$;

CREATE FUNCTION pg_temp.expect(p_case text, p_ws text, p_expected text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v text := pg_temp.ws(p_ws);
BEGIN
  IF v IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL (%): matriz % quedó en %, se esperaba %', p_case, p_ws, coalesce(v, 'NULL'), p_expected;
  END IF;
  RAISE NOTICE 'OK (%): matriz en %', p_case, p_expected;
END $$;

DO $$
DECLARE
  a   constant text := 'a1028216-0000-4000-8000-000000000001';   -- admin
  p   constant text := 'a1028216-0000-4000-8000-000000000002';   -- socio del encargo
  r   constant text := 'a1028216-0000-4000-8000-000000000003';   -- risk_partner, SQR del encargo
  p_s constant text := '51028216-0000-4000-8000-000000000002';
  r_s constant text := '51028216-0000-4000-8000-000000000003';
  wo1 constant text := '01028216-0000-4000-8000-000000000001';
  wo2 constant text := '01028216-0000-4000-8000-000000000002';
  wo3 constant text := '01028216-0000-4000-8000-000000000003';
  wo4 constant text := '01028216-0000-4000-8000-000000000004';
  ws1  constant text := 'f1028216-0000-4000-8000-000000000001';
  ws1a constant text := 'f1028216-0000-4000-8000-00000000001a';
  ws2  constant text := 'f1028216-0000-4000-8000-000000000002';
  ws3  constant text := 'f1028216-0000-4000-8000-000000000003';
  ws4  constant text := 'f1028216-0000-4000-8000-000000000004';
  ws0  constant text := 'f1028216-0000-4000-8000-000000000000';
  -- Sentencias de useWorkOrderMutations (wo_id con %L).
  socio_sign    constant text := 'UPDATE public.work_orders SET approved_by = %L, approved_at = now(), notes = NULL WHERE wo_id = %L';
  socio_close   constant text := 'UPDATE public.work_orders SET approval_status = ''Approved'' WHERE wo_id = %L AND risk_status IN (''Approved'', ''Emergency_Approved'')';
  -- 1028-213: la aprobación de Riesgos del SQR/risk_partner va por la función (la única vía sin política de UPDATE).
  risk_rpc      constant text := 'SELECT public.approve_wo_risk(%L)';
  risk_approve  constant text := 'UPDATE public.work_orders SET risk_approved_by = %L, risk_approved_at = now(), risk_status = ''Approved'' WHERE wo_id = %L';
  risk_close    constant text := 'UPDATE public.work_orders SET approval_status = ''Approved'' WHERE wo_id = %L AND approved_at IS NOT NULL';
  risk_reject   constant text := 'UPDATE public.work_orders SET risk_status = ''Rejected'', emergency_review_by = NULL, emergency_review_at = NULL, emergency_partner_by = NULL, emergency_partner_at = NULL, emergency_deadline_at = NULL, emergency_justification = NULL WHERE wo_id = %L';
  risk_revert   constant text := 'UPDATE public.work_orders SET risk_status = ''Pending'', risk_approved_by = NULL, risk_approved_at = NULL, emergency_review_by = NULL, emergency_review_at = NULL, emergency_partner_by = NULL, emergency_partner_at = NULL, emergency_deadline_at = NULL WHERE wo_id = %L';
  reopen        constant text := 'UPDATE public.work_orders SET approval_status = ''Pending_Approval'' WHERE wo_id = %L AND approval_status = ''Approved''';
  emerg_review  constant text := 'UPDATE public.work_orders SET emergency_review_by = %L, emergency_review_at = now() WHERE wo_id = %L AND emergency_review_at IS NULL';
  emerg_partner constant text := 'UPDATE public.work_orders SET emergency_partner_by = %L, emergency_partner_at = now(), risk_status = ''Emergency_Approved'', emergency_deadline_at = current_date + 7 WHERE wo_id = %L AND emergency_review_at IS NOT NULL AND emergency_partner_at IS NULL';
  -- useCompleteRiskAssessment sin resetSocioToPending (compleción de emergencia).
  complete_risk constant text := 'UPDATE public.work_orders SET ceac_completed_at = current_date, san_completed_at = current_date, ceac_number = ''C-1'', san_approval_id = ''S-1'', risk_level = ''Bajo'', risk_status = ''Pending'' WHERE wo_id = %L';
  v_ctid tid;
  v_ctid2 tid;
  v_ctid0 tid;
  v_notif_before bigint;
  v_notif_after bigint;
  v_r text;
BEGIN
  -- 0. Instalación: trigger AFTER UPDATE sin columnas, función cerrada a anon/authenticated.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.work_orders'::regclass
                   AND tgname = 'tr_sync_worksheet_status_from_wo' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'FAIL (0): falta tr_sync_worksheet_status_from_wo en work_orders';
  END IF;
  IF has_function_privilege('anon', 'public.sync_worksheet_status_from_work_order()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sync_worksheet_status_from_work_order()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL (16): anon/authenticated tienen EXECUTE sobre sync_worksheet_status_from_work_order()';
  END IF;
  IF pg_get_functiondef('public.notify_worksheet_events()'::regprocedure) NOT LIKE '%ems.worksheet_status_sync%' THEN
    RAISE EXCEPTION 'FAIL (14): notify_worksheet_events() no respeta ems.worksheet_status_sync';
  END IF;
  RAISE NOTICE 'OK (0/16): trigger instalado, función sin EXECUTE para anon/authenticated, guarda en notify_worksheet_events';

  SELECT count(*) INTO v_notif_before FROM public.notifications WHERE type_key = 'worksheet.sent_to_quality';
  v_ctid2 := pg_temp.ws_ctid(ws2);
  v_ctid0 := pg_temp.ws_ctid(ws0);

  -- ── Flujo normal (WO1) ──────────────────────────────────────────────────────────────────────
  -- 1. Solo el Socio: firma, y el cierre condicional no alcanza filas (Riesgos pendiente).
  PERFORM pg_temp.exec_as(p, format(socio_sign, p_s, wo1));
  IF pg_temp.exec_as(p, format(socio_close, wo1)) <> 0 THEN
    RAISE EXCEPTION 'FAIL (1): el cierre del Socio no debía alcanzar filas con Riesgos pendiente';
  END IF;
  PERFORM pg_temp.expect('1 solo Socio', ws1, 'draft');

  -- 12. Riesgos aprueba el SQR (risk_partner), que no es del equipo de la matriz (no pasa worksheet_team_update).
  -- 1028-213: approve_wo_risk aprueba la pista Y cierra la OT en la misma transacción (el Socio ya firmó),
  -- así que ya no hay un paso intermedio "ambas pistas, OT sin cerrar" observable desde fuera.
  v_r := pg_temp.try_as(r, format(risk_rpc, wo1));
  IF v_r <> '1' THEN
    RAISE EXCEPTION 'FAIL (12): la aprobación de Riesgos del risk_partner por approve_wo_risk falló (sin 42501 por la matriz), dio %', v_r;
  END IF;
  PERFORM pg_temp.expect('3/12 Socio + Riesgos, cerrada por Riesgos', ws1, 'approved');
  PERFORM pg_temp.expect('9 archived intacta', ws1a, 'archived');

  -- 10. Aislamiento: la otra OT y la matriz sin wo_id no se reescribieron.
  IF pg_temp.ws_ctid(ws2) <> v_ctid2 OR pg_temp.ws_ctid(ws0) <> v_ctid0 THEN
    RAISE EXCEPTION 'FAIL (10): se reescribió una matriz de otra OT o sin wo_id';
  END IF;
  RAISE NOTICE 'OK (10): matrices de otra OT y sin wo_id intactas';

  -- 11. Escritura irrelevante (notes) y valor repetido: la matriz no se reescribe.
  v_ctid := pg_temp.ws_ctid(ws1);
  PERFORM pg_temp.exec_as(a, format('UPDATE public.work_orders SET notes = ''x'' WHERE wo_id = %L', wo1));
  PERFORM pg_temp.exec_as(a, format('UPDATE public.work_orders SET risk_status = ''Approved'' WHERE wo_id = %L', wo1));
  IF pg_temp.ws_ctid(ws1) <> v_ctid THEN
    RAISE EXCEPTION 'FAIL (11): una escritura que no cambia las pistas reescribió la matriz';
  END IF;
  RAISE NOTICE 'OK (11): escritura irrelevante o repetida no reescribe la matriz';

  -- 4. Deshacer el Socio (admin, dos sentencias como useRevertSocioApproval) y re-aprobar.
  PERFORM pg_temp.exec_as(a, format('UPDATE public.work_orders SET approved_by = NULL, approved_at = NULL WHERE wo_id = %L', wo1));
  PERFORM pg_temp.exec_as(a, format(reopen, wo1));
  PERFORM pg_temp.expect('4 Socio deshecho', ws1, 'draft');
  PERFORM pg_temp.exec_as(p, format(socio_sign, p_s, wo1));
  PERFORM pg_temp.exec_as(p, format(socio_close, wo1));
  PERFORM pg_temp.expect('4 Socio re-aprobado (cierra el Socio)', ws1, 'approved');

  -- 5. Deshacer Riesgos (admin, como useRevertRiskApproval) y re-aprobar.
  PERFORM pg_temp.exec_as(a, format(risk_revert, wo1));
  PERFORM pg_temp.exec_as(a, format(reopen, wo1));
  PERFORM pg_temp.expect('5 Riesgos deshecho', ws1, 'draft');
  PERFORM pg_temp.exec_as(r, format(risk_rpc, wo1));
  PERFORM pg_temp.expect('5 Riesgos re-aprobado', ws1, 'approved');

  -- 6. Riesgos rechaza una OT cerrada: approval_status sigue 'Approved' (pistas independientes).
  PERFORM pg_temp.exec_as(a, format(risk_reject, wo1));
  IF (SELECT approval_status FROM public.work_orders WHERE wo_id = wo1::uuid) <> 'Approved' THEN
    RAISE EXCEPTION 'FIXTURE (6): el rechazo de Riesgos no debía tocar approval_status';
  END IF;
  PERFORM pg_temp.expect('6 Riesgos rechaza con la OT Approved', ws1, 'draft');

  -- 8. OT Rejected y Draft con la firma del Socio conservada: Borrador.
  PERFORM pg_temp.exec_as(a, format('UPDATE public.work_orders SET risk_status = ''Approved'' WHERE wo_id = %L', wo1));
  PERFORM pg_temp.expect('8 pre: Riesgos re-aprobado', ws1, 'approved');
  PERFORM pg_temp.exec_as(a, format('UPDATE public.work_orders SET approval_status = ''Rejected'' WHERE wo_id = %L', wo1));
  PERFORM pg_temp.expect('8 OT Rejected', ws1, 'draft');
  PERFORM pg_temp.exec_as(a, format('UPDATE public.work_orders SET approval_status = ''Draft'' WHERE wo_id = %L', wo1));
  IF (SELECT approved_at FROM public.work_orders WHERE wo_id = wo1::uuid) IS NULL THEN
    RAISE EXCEPTION 'FIXTURE (8): la OT de cliente debía conservar approved_at al volver a Draft';
  END IF;
  PERFORM pg_temp.expect('8 OT Draft con firma conservada', ws1, 'draft');
  PERFORM pg_temp.expect('9 archived intacta tras todo el flujo normal', ws1a, 'archived');

  -- 13. Firma rechazada por autorización: el risk_partner no puede firmar como Socio. 1028-213: sin la política
  -- de UPDATE del SQR, la fila de WO2 ni siquiera le es visible a R, así que la sentencia alcanza 0 filas
  -- (antes llegaba al trigger y daba 42501); en ambos casos la firma no se registra.
  v_r := pg_temp.try_as(r, format(socio_sign, r_s, wo2));
  IF v_r <> '0' OR (SELECT approved_at FROM public.work_orders WHERE wo_id = wo2::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (13): la firma del Socio por un risk_partner debía alcanzar 0 filas y no registrarse, dio %', v_r;
  END IF;
  IF pg_temp.ws_ctid(ws2) <> v_ctid2 OR pg_temp.ws(ws2) <> 'draft' THEN
    RAISE EXCEPTION 'FAIL (13): la matriz cambió tras una aprobación rechazada';
  END IF;
  RAISE NOTICE 'OK (13): aprobación rechazada por autorización deja la matriz intacta';

  -- ── Flujo de emergencia (WO3) ───────────────────────────────────────────────────────────────
  PERFORM pg_temp.exec_as(a, format(emerg_review, r_s, wo3));
  PERFORM pg_temp.expect('7a firma de Riesgo', ws3, 'draft');
  PERFORM pg_temp.exec_as(a, format(emerg_partner, r_s, wo3));
  PERFORM pg_temp.exec_as(a, format(risk_close, wo3));   -- 0 filas: el Socio no firmó
  PERFORM pg_temp.expect('7b Emergency_Approved sin Socio', ws3, 'draft');
  PERFORM pg_temp.exec_as(p, format(socio_sign, p_s, wo3));
  PERFORM pg_temp.exec_as(p, format(socio_close, wo3));
  PERFORM pg_temp.expect('7b Emergency_Approved + Socio', ws3, 'approved');

  -- 7c. Compleción de datos: Riesgos vuelve a Pending, la OT sigue Approved, la matriz no se toca.
  v_ctid := pg_temp.ws_ctid(ws3);
  PERFORM pg_temp.exec_as(a, format(complete_risk, wo3));
  IF (SELECT approval_status FROM public.work_orders WHERE wo_id = wo3::uuid) <> 'Approved'
     OR (SELECT emergency_partner_at FROM public.work_orders WHERE wo_id = wo3::uuid) IS NULL THEN
    RAISE EXCEPTION 'FIXTURE (7c): la compleción debía dejar la OT Approved con emergency_partner_at';
  END IF;
  PERFORM pg_temp.expect('7c compleción de emergencia', ws3, 'approved');
  IF pg_temp.ws_ctid(ws3) <> v_ctid THEN
    RAISE EXCEPTION 'FAIL (7c): la compleción reescribió la matriz';
  END IF;

  -- 7d. Riesgos aprueba la revisión posterior.
  PERFORM pg_temp.exec_as(r, format(risk_rpc, wo3));
  PERFORM pg_temp.expect('7d revisión posterior aprobada', ws3, 'approved');

  -- 7e. Desde la compleción, Riesgos rechaza (limpia emergency_*).
  PERFORM pg_temp.exec_as(a, format('UPDATE public.work_orders SET risk_status = ''Emergency_Approved'' WHERE wo_id = %L', wo3));
  PERFORM pg_temp.exec_as(a, format(complete_risk, wo3));
  PERFORM pg_temp.expect('7e pre: de nuevo en compleción', ws3, 'approved');
  PERFORM pg_temp.exec_as(a, format(risk_reject, wo3));
  PERFORM pg_temp.expect('7e rechazo tras compleción', ws3, 'draft');

  -- 7f. Desde la compleción, el admin deshace Riesgos (limpia emergency_* y reabre).
  PERFORM pg_temp.exec_as(a, format('UPDATE public.work_orders SET emergency_review_by = %L, emergency_review_at = now(), emergency_partner_by = %L, emergency_partner_at = now(), risk_status = ''Emergency_Approved'' WHERE wo_id = %L', r_s, r_s, wo3));
  PERFORM pg_temp.expect('7f pre: Emergency_Approved de nuevo', ws3, 'approved');
  PERFORM pg_temp.exec_as(a, format(complete_risk, wo3));
  PERFORM pg_temp.expect('7f pre: en compleción', ws3, 'approved');
  PERFORM pg_temp.exec_as(a, format(risk_revert, wo3));
  PERFORM pg_temp.exec_as(a, format(reopen, wo3));
  PERFORM pg_temp.expect('7f Riesgos deshecho tras compleción', ws3, 'draft');

  -- 7g. Pending SIN la firma de emergencia sobre una OT Approved (estado forzado): Borrador.
  PERFORM pg_temp.exec_as(a, format('UPDATE public.work_orders SET approved_by = %L, approved_at = now(), risk_status = ''Approved'', approval_status = ''Approved'' WHERE wo_id = %L', p_s, wo4));
  PERFORM pg_temp.expect('7g pre: OT aprobada', ws4, 'approved');
  PERFORM pg_temp.exec_as(a, format('UPDATE public.work_orders SET risk_status = ''Pending'' WHERE wo_id = %L', wo4));
  PERFORM pg_temp.expect('7g Pending sin emergency_partner_at', ws4, 'draft');

  -- 14. La sincronización no emitió worksheet.sent_to_quality y la marca quedó limpia.
  SELECT count(*) INTO v_notif_after FROM public.notifications WHERE type_key = 'worksheet.sent_to_quality';
  IF v_notif_after <> v_notif_before THEN
    RAISE EXCEPTION 'FAIL (14): la sincronización emitió % aviso(s) worksheet.sent_to_quality', v_notif_after - v_notif_before;
  END IF;
  IF COALESCE(current_setting('ems.worksheet_status_sync', true), '') <> '' THEN
    RAISE EXCEPTION 'FAIL (14): ems.worksheet_status_sync quedó encendida en la sesión';
  END IF;
  -- Control: sin la marca, el mismo draft -> approved SÍ avisa (el fixture tiene destinatarios, así
  -- que el conteo de arriba no pasa en vacío).
  UPDATE public.activity_worksheets SET status = 'approved' WHERE id = ws2::uuid;
  IF (SELECT count(*) FROM public.notifications WHERE type_key = 'worksheet.sent_to_quality') <= v_notif_after THEN
    RAISE EXCEPTION 'FAIL (14): control — un draft -> approved directo debía emitir worksheet.sent_to_quality';
  END IF;
  RAISE NOTICE 'OK (14): sin avisos de revisión de calidad, marca restaurada; el envío directo sí avisa (control)';

  RAISE NOTICE 'WORKSHEET STATUS SYNC 1028-216: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
