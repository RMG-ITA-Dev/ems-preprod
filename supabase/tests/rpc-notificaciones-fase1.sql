-- Tests transaccionales del catálogo de notificaciones — Fases 1 a 3.c (11 grupos)
-- (20260911100000_..._01_catalogo.sql + 20260911100100_..._02_seed.sql +
--  20260911100200_..._03_disparadores.sql).
--
-- Por qué existe esta suite: la propiedad central del diseño es que `notify_staff()` es el
-- ÚNICO portón de escritura y que la matriz sembrada decide sola quién recibe qué. Si ese
-- portón se abre de más, cada disparador de Fase 3+ hereda el agujero. Y la segunda
-- propiedad —que los contadores lleguen a roles SIN `engagement.read`— es justamente la
-- razón de que todo esto sea SECURITY DEFINER en vez de una vista: un refactor bienintencionado
-- a SECURITY INVOKER rompería la campana para senior/semisenior/assistant en silencio.
--
-- Se corre desde supabase/tests/local/run-rls-tests.sh, después de las 6 migraciones
-- consolidadas, el seed RBAC y las incrementales de notificaciones. Transacción única,
-- SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo, terminando en
-- "NOTIFICACIONES FASE 1: ALL CHECKS PASSED (rolled back)".
--
-- Mundo de fixtures (ids con sufijo ...9f<n>):
--   U_ASSIST / S_ASSIST   assistant — reporta horas, NO tiene engagement.read
--   U_MGR    / S_MGR      manager   — recibe eventos de OT y contadores de encargo
--   U_ACCT   / S_ACCT     accounting_manager — NO reporta horas: sin contadores de timesheet
--   U_PARTNER/ S_PARTNER  partner   — recibe la pista del Socio y el plan de pagos (3.b)
--   U_RISK   / S_RISK     risk_supervisor — la cola de Riesgos (3.b)
--   S_ORPHAN              staff sin auth_user_id — nadie puede notificarle
--   E_ONE                 encargo con COT '9F01' y dos actividades pendientes (dedup de COT)
--   E_TWO                 encargo con COT '9F02', con Socio Y Gerente — el mundo de la 3.b

BEGIN;

-- ── Fixtures ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a9f00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'notif-test-' || n || '@ruizmier.com', 'x', now(), now(), now(),
           '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 6) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a9f00000-0000-4000-8000-000000000001', 'staff',   'assistant'),
  ('a9f00000-0000-4000-8000-000000000002', 'manager', 'manager'),
  ('a9f00000-0000-4000-8000-000000000003', 'manager', 'accounting_manager'),
  -- FASE 3.b. `role` es el enum legacy y `role_key` la autoridad: risk_supervisor no existe
  -- como valor del enum, y no hace falta que exista.
  ('a9f00000-0000-4000-8000-000000000004', 'partner', 'partner'),
  ('a9f00000-0000-4000-8000-000000000005', 'staff',   'risk_supervisor'),
  -- FASE 3.c. `role = 'admin'` ademas del role_key: los eventos de auditoria del modulo
  -- Encargos (borrado, cambio de responsables) van al alcance `firm` de ADM.
  ('a9f00000-0000-4000-8000-000000000006', 'admin',   'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id, weekly_capacity_hours, hire_date, city)
VALUES
  ('59f00000-0000-4000-8000-000000000001', 'a9f00000-0000-4000-8000-000000000001',
   'NOTIF', 'Assist', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  ('59f00000-0000-4000-8000-000000000002', 'a9f00000-0000-4000-8000-000000000002',
   'NOTIF', 'Manager', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  ('59f00000-0000-4000-8000-000000000003', 'a9f00000-0000-4000-8000-000000000003',
   'NOTIF', 'Acct', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  ('59f00000-0000-4000-8000-000000000004', 'a9f00000-0000-4000-8000-000000000004',
   'NOTIF', 'Partner', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  ('59f00000-0000-4000-8000-000000000006', 'a9f00000-0000-4000-8000-000000000006',
   'NOTIF', 'Admin', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  ('59f00000-0000-4000-8000-000000000005', 'a9f00000-0000-4000-8000-000000000005',
   'NOTIF', 'Risk', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  -- S_ORPHAN: sin cuenta vinculada. Mismo criterio que get_engagement_team_candidates().
  ('59f00000-0000-4000-8000-000000000009', NULL,
   'NOTIF', 'Orphan', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz');

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c9f00000-0000-4000-8000-000000000001', 'NOTIF Cliente SA', 'NOTIF-9F01');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                manager_id, created_by_staff_id, fecha_cierre)
VALUES ('e9f00000-0000-4000-8000-000000000001', 'c9f00000-0000-4000-8000-000000000001',
        'NOTIF Encargo Uno', '9F01',
        '59f00000-0000-4000-8000-000000000002',
        '59f00000-0000-4000-8000-000000000002', '2026-12-31');

-- E_TWO: encargo aparte para la FASE 3.b, con Socio Y Gerente. No se le agrega partner_id a
-- E_ONE para no mover el piso de los grupos 3 y 5, que ya cuentan sobre ese encargo.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                partner_id, manager_id, created_by_staff_id, fecha_cierre)
VALUES ('e9f00000-0000-4000-8000-000000000002', 'c9f00000-0000-4000-8000-000000000001',
        'NOTIF Encargo Dos', '9F02',
        '59f00000-0000-4000-8000-000000000004',
        '59f00000-0000-4000-8000-000000000002',
        '59f00000-0000-4000-8000-000000000002', '2026-12-31');

INSERT INTO public.activity_codes (activity_id, activity_code, description, is_system)
VALUES ('79f00000-0000-4000-8000-000000000001', '9F1', 'NOTIF Actividad Uno', true),
       ('79f00000-0000-4000-8000-000000000002', '9F2', 'NOTIF Actividad Dos', true);

-- Semana enviada con DOS líneas pendientes del MISMO encargo (una por actividad).
-- El UNIQUE (period_id, engagement_id, activity_id) hace que este caso sea normal, no raro:
-- sin DISTINCT, el COT '9F01' se contaría dos veces.
INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year,
                                      submitted_at)
VALUES ('79f00000-0000-4000-8000-0000000000f1', '59f00000-0000-4000-8000-000000000001',
        (date_trunc('week', CURRENT_DATE)::date - 14), 1, 2026, now());

INSERT INTO public.timesheet_line_approvals (period_id, engagement_id, activity_id, status,
                                             approved_by)
VALUES ('79f00000-0000-4000-8000-0000000000f1', 'e9f00000-0000-4000-8000-000000000001',
        '79f00000-0000-4000-8000-000000000001', 'pending',
        '59f00000-0000-4000-8000-000000000002'),
       ('79f00000-0000-4000-8000-0000000000f1', 'e9f00000-0000-4000-8000-000000000001',
        '79f00000-0000-4000-8000-000000000002', 'pending',
        '59f00000-0000-4000-8000-000000000002');

-- Los fixtures de arriba YA disparan notificaciones: desde la FASE 3.c hay un trigger AFTER
-- INSERT en `engagements`, asi que E_ONE y E_TWO emiten `engagement.created` y compania al
-- crearse. Se limpian para que cada grupo cuente desde cero y las aserciones no dependan de
-- cuantos encargos tenga el fixture.
DELETE FROM public.notifications;

CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

-- ── Grupo 0 — el seed converge a la matriz ──────────────────────────────────
DO $$
DECLARE v_types int; v_grants int; v_roles int; v_orphan int;
BEGIN
  SELECT COUNT(*) INTO v_types  FROM public.notification_types;
  SELECT COUNT(*) INTO v_grants FROM public.notification_role_types;
  SELECT COUNT(DISTINCT role_key) INTO v_roles FROM public.notification_role_types;

  IF v_types <> 70 THEN
    RAISE EXCEPTION 'TEST FAIL — % tipos sembrados, se esperaban 70 (¿corriste el parser?)', v_types;
  END IF;
  IF v_grants <> 416 THEN
    RAISE EXCEPTION 'TEST FAIL — % concesiones, se esperaban 416', v_grants;
  END IF;
  IF v_roles <> 23 THEN
    RAISE EXCEPTION 'TEST FAIL — % roles con notificaciones, se esperaban los 23', v_roles;
  END IF;
  RAISE NOTICE 'PASS — seed converge a la matriz: 70 tipos, 416 concesiones, 23 roles';

  -- La FK a authorization_roles ya lo garantiza, pero un seed mal generado podría
  -- referenciar un role_key que exista y no corresponda: esto lo hace explícito.
  SELECT COUNT(*) INTO v_orphan
    FROM public.notification_role_types nrt
   WHERE NOT EXISTS (SELECT 1 FROM public.authorization_roles ar
                      WHERE ar.role_key = nrt.role_key);
  IF v_orphan > 0 THEN
    RAISE EXCEPTION 'TEST FAIL — % concesiones apuntan a un role_key inexistente', v_orphan;
  END IF;
  RAISE NOTICE 'PASS — ninguna concesión huérfana de rol';
END $$;

-- ── Grupo 1 — notify_staff(): el portón ─────────────────────────────────────
DO $$
DECLARE v_id uuid; v_before int; v_after int;
BEGIN
  SELECT COUNT(*) INTO v_before FROM public.notifications;

  -- 1.a El caso feliz: manager SÍ tiene wo.rejected_partner en la matriz.
  v_id := public.notify_staff('wo.rejected_partner',
                              '59f00000-0000-4000-8000-000000000002',
                              'e9f00000-0000-4000-8000-000000000001',
                              '{"engagement_code":"9F01"}'::jsonb);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL — notify_staff no creó la notificación de un destinatario elegible';
  END IF;
  RAISE NOTICE 'PASS — notify_staff crea la notificación cuando la matriz concede el tipo';

  -- 1.b El portón: assistant NO tiene wo.rejected_partner. Debe devolver NULL, sin error,
  -- para que un disparador pueda barrer candidatos sin envolver cada llamada en un IF.
  v_id := public.notify_staff('wo.rejected_partner',
                              '59f00000-0000-4000-8000-000000000001', NULL, '{}'::jsonb);
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL — notify_staff notificó a un rol que la matriz NO incluye';
  END IF;
  RAISE NOTICE 'PASS — un rol sin ese tipo en la matriz no recibe nada (NULL, sin error)';

  -- 1.c Los contadores no se persisten: son estado, no sucesos.
  v_id := public.notify_staff('timesheet.overdue',
                              '59f00000-0000-4000-8000-000000000001', NULL, '{}'::jsonb);
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL — se persistió un tipo delivery=aggregate';
  END IF;
  RAISE NOTICE 'PASS — un tipo aggregate nunca crea filas en notifications';

  -- 1.d type_key con typo: no revienta ni crea filas huérfanas.
  v_id := public.notify_staff('wo.rejected_partnerr',
                              '59f00000-0000-4000-8000-000000000002', NULL, '{}'::jsonb);
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL — un type_key inexistente creó una notificación';
  END IF;
  RAISE NOTICE 'PASS — un type_key inexistente devuelve NULL sin romper al llamante';

  -- 1.e Tipo inactivo (??.sqr.pendiente, D-11 sin definir): sembrado pero no entregable.
  v_id := public.notify_staff('??.sqr.pendiente',
                              '59f00000-0000-4000-8000-000000000002', NULL, '{}'::jsonb);
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL — un tipo con is_active=false entregó una notificación';
  END IF;
  RAISE NOTICE 'PASS — un tipo inactivo está en el catálogo pero no entrega';

  -- 1.f Staff sin cuenta vinculada: sin rol no hay elegibilidad que evaluar.
  v_id := public.notify_staff('wo.rejected_partner',
                              '59f00000-0000-4000-8000-000000000009', NULL, '{}'::jsonb);
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL — se notificó a un staff sin auth_user_id';
  END IF;
  RAISE NOTICE 'PASS — un staff sin cuenta vinculada no recibe notificaciones';

  SELECT COUNT(*) INTO v_after FROM public.notifications;
  IF v_after - v_before <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — se crearon % filas, se esperaba exactamente 1', v_after - v_before;
  END IF;
  RAISE NOTICE 'PASS — de 6 llamadas sólo la elegible dejó fila';
END $$;

-- ── Grupo 2 — la bandeja es privada ─────────────────────────────────────────
DO $$
DECLARE v_res jsonb; v_marked int;
BEGIN
  -- El manager ve la suya.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000002');
  v_res := public.get_my_notifications();
  IF jsonb_array_length(v_res->'events') <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — el destinatario ve % eventos, se esperaba 1',
      jsonb_array_length(v_res->'events');
  END IF;
  IF (v_res->>'unread_count')::int <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — unread_count = %, se esperaba 1', v_res->>'unread_count';
  END IF;
  RAISE NOTICE 'PASS — el destinatario ve su notificación y cuenta 1 sin leer';

  -- El assistant NO ve la del manager.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000001');
  v_res := public.get_my_notifications();
  IF jsonb_array_length(v_res->'events') <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL — un tercero ve % eventos ajenos',
      jsonb_array_length(v_res->'events');
  END IF;
  RAISE NOTICE 'PASS — la bandeja de otro no se ve, ni siquiera contada';

  -- Y no puede marcarla leída aunque tenga el uuid: el UPDATE filtra por destinatario.
  v_marked := public.mark_notifications_read(
    ARRAY(SELECT notification_id FROM public.notifications
           WHERE recipient_staff_id = '59f00000-0000-4000-8000-000000000002'));
  IF v_marked <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL — un tercero marcó % notificaciones ajenas como leídas', v_marked;
  END IF;
  RAISE NOTICE 'PASS — mark_notifications_read ignora ids ajenos aunque se los pasen';

  -- El dueño sí, y sólo una vez.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000002');
  v_marked := public.mark_notifications_read(
    ARRAY(SELECT notification_id FROM public.notifications
           WHERE recipient_staff_id = '59f00000-0000-4000-8000-000000000002'));
  IF v_marked <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — el dueño marcó %, se esperaba 1', v_marked;
  END IF;
  v_marked := public.mark_notifications_read(
    ARRAY(SELECT notification_id FROM public.notifications
           WHERE recipient_staff_id = '59f00000-0000-4000-8000-000000000002'));
  IF v_marked <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL — re-marcar devolvió % en vez de 0', v_marked;
  END IF;
  RAISE NOTICE 'PASS — el dueño marca leído una vez; repetir es no-op';
END $$;

-- ── Grupo 3 — contadores: gateo por rol y el motivo del SECURITY DEFINER ────
DO $$
DECLARE v_agg jsonb; v_cots jsonb; v_visible int;
BEGIN
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000001');  -- assistant

  -- El caso que justifica todo el diseño: el assistant NO tiene engagement.read, así que
  -- un SELECT directo a engagements no le devuelve nada...
  SELECT COUNT(*) INTO v_visible FROM public.engagements
   WHERE engagement_id = 'e9f00000-0000-4000-8000-000000000001';
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL — el assistant VE engagements por RLS; la premisa del diseño cambió (revisar el seed de engagement.read)';
  END IF;
  RAISE NOTICE 'PASS — el assistant no puede leer engagements directamente (RLS)';

  -- ...pero el RPC sí le entrega el COT, porque es SECURITY DEFINER. Si alguien lo pasa a
  -- SECURITY INVOKER "para simplificar", este chequeo lo atrapa.
  v_agg := public.get_my_notification_aggregates();
  IF NOT (v_agg ? 'timesheet.pending_approval') THEN
    RAISE EXCEPTION 'TEST FAIL — el assistant no recibió el contador timesheet.pending_approval';
  END IF;
  IF (v_agg->'timesheet.pending_approval'->>'count')::int <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — count = %, se esperaba 1 (una semana pendiente)',
      v_agg->'timesheet.pending_approval'->>'count';
  END IF;
  RAISE NOTICE 'PASS — el contador con COT llega igual: por eso el RPC es SECURITY DEFINER';

  -- Dedup: dos actividades pendientes del mismo encargo son UN código, no dos.
  v_cots := v_agg->'timesheet.pending_approval'->'items'->0->'cots';
  IF jsonb_array_length(v_cots) <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — % COT devueltos para un solo encargo (falta el DISTINCT)',
      jsonb_array_length(v_cots);
  END IF;
  IF v_cots->>0 <> '9F01' THEN
    RAISE EXCEPTION 'TEST FAIL — COT devuelto %, se esperaba 9F01', v_cots->>0;
  END IF;
  RAISE NOTICE 'PASS — un encargo con dos actividades pendientes rinde un solo COT';

  -- Gateo por rol: accounting_manager no reporta horas, así que no recibe contadores de
  -- timesheet. Es la regla del packet ("los perfiles administrativos no reciben estas alarmas")
  -- aplicada desde la misma matriz que gobierna los eventos.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000003');
  v_agg := public.get_my_notification_aggregates();
  IF v_agg ? 'timesheet.overdue' OR v_agg ? 'timesheet.pending_approval' THEN
    RAISE EXCEPTION 'TEST FAIL — accounting_manager recibió contadores de timesheet';
  END IF;
  RAISE NOTICE 'PASS — los contadores están gateados por la misma matriz que los eventos';
END $$;

-- ── Grupo 4 — la ventana de alarmas es configurable ─────────────────────────
DO $$
DECLARE v_agg jsonb; v_before int; v_after int;
BEGIN
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000001');  -- assistant

  -- El fixture tiene su semana pendiente 2 semanas atras (week_start = lunes - 14 dias).
  UPDATE public.global_settings SET setting_value = '4'
   WHERE setting_key = 'TS_ALERT_WINDOW_WEEKS';
  v_agg := public.get_my_notification_aggregates();
  v_before := (v_agg->'timesheet.pending_approval'->>'count')::int;
  IF v_before <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — con ventana de 4 semanas se esperaba 1, hubo %', v_before;
  END IF;
  RAISE NOTICE 'PASS — con la ventana en 4 semanas la semana de hace 2 entra';

  -- Con la ventana en 1 semana, la de hace 2 queda afuera.
  UPDATE public.global_settings SET setting_value = '1'
   WHERE setting_key = 'TS_ALERT_WINDOW_WEEKS';
  v_agg := public.get_my_notification_aggregates();
  v_after := (v_agg->'timesheet.pending_approval'->>'count')::int;
  IF v_after <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL — con ventana de 1 semana se esperaba 0, hubo %', v_after;
  END IF;
  RAISE NOTICE 'PASS — acortar la ventana saca de la alarma las semanas mas viejas';

  -- Basura en el setting: cae al default (4), no revienta la campana.
  UPDATE public.global_settings SET setting_value = 'cuatro'
   WHERE setting_key = 'TS_ALERT_WINDOW_WEEKS';
  v_agg := public.get_my_notification_aggregates();
  IF (v_agg->'timesheet.pending_approval'->>'count')::int <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — un valor no numerico no cayo al default de 4 semanas';
  END IF;
  RAISE NOTICE 'PASS — un valor invalido cae al default en vez de tumbar la campana';

  -- TS_TRACKING_START_DATE acorta aunque la ventana sea amplia.
  UPDATE public.global_settings SET setting_value = '12'
   WHERE setting_key = 'TS_ALERT_WINDOW_WEEKS';
  UPDATE public.global_settings SET setting_value = to_char(CURRENT_DATE, 'YYYY-MM-DD')
   WHERE setting_key = 'TS_TRACKING_START_DATE';
  v_agg := public.get_my_notification_aggregates();
  IF (v_agg->'timesheet.pending_approval'->>'count')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL — TS_TRACKING_START_DATE no recorto la ventana';
  END IF;
  RAISE NOTICE 'PASS — la fecha de arranque del sistema recorta la ventana';

  -- Una fecha de arranque VIEJA no debe ALARGAR la ventana.
  UPDATE public.global_settings SET setting_value = '2000-01-01'
   WHERE setting_key = 'TS_TRACKING_START_DATE';
  UPDATE public.global_settings SET setting_value = '1'
   WHERE setting_key = 'TS_ALERT_WINDOW_WEEKS';
  v_agg := public.get_my_notification_aggregates();
  IF (v_agg->'timesheet.pending_approval'->>'count')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL — una fecha de arranque vieja alargo la ventana';
  END IF;
  RAISE NOTICE 'PASS - la fecha de arranque solo acorta, nunca alarga';
END $$;

-- -- Grupo 5 -- FASE 3.a: los disparadores de Fondos emiten de verdad ---------
-- Es el grupo que prueba que el catalogo dejo de ser decorativo. Cada asercion sigue una
-- transicion real del flujo y verifica el DESTINATARIO, no solo que exista una fila.
DO $$
DECLARE
  v_fr   uuid := 'f9f00000-0000-4000-8000-000000000001';
  v_wo   uuid;
  v_fre  uuid;
  v_n    int;
BEGIN
  -- Una OT aprobada del encargo del fixture: fr_wo_validate_approved() la exige.
  INSERT INTO public.work_orders (engagement_id, currency, season_mode, approval_status)
  VALUES ('e9f00000-0000-4000-8000-000000000001', 'BOB', 'High', 'Approved')
  RETURNING wo_id INTO v_wo;

  -- Solicitud del ASSISTANT (solicitante), sobre una OT cuyo gerente es S_MGR.
  INSERT INTO public.fund_requests (fund_request_id, requester_staff_id,
                                    total_requested_amount, currency, status)
  VALUES (v_fr, '59f00000-0000-4000-8000-000000000001', 500, 'BOB', 'borrador');

  INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
  VALUES (v_fr, v_wo, 500);

  -- fr_wo_set_manager() debe haber resuelto el gerente desde engagements.manager_id.
  SELECT COUNT(*) INTO v_n FROM public.fund_request_work_orders
   WHERE fund_request_id = v_fr
     AND manager_staff_id = '59f00000-0000-4000-8000-000000000002';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - fr_wo_set_manager no resolvio el gerente de la OT';
  END IF;

  -- 5.a Envio a aprobacion: le llega AL GERENTE, no al solicitante.
  UPDATE public.fund_requests SET status = 'pendiente_aprobacion'
   WHERE fund_request_id = v_fr;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.request.submitted_for_approval'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000002';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente de la OT no recibio fund.request.submitted_for_approval (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - enviar la solicitud notifica al gerente de la OT';

  -- El solicitante NO recibe la del aprobador: no esta en la matriz para assistant.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.request.submitted_for_approval'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000001';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el solicitante recibio una notificacion que no le toca';
  END IF;
  RAISE NOTICE 'PASS - el solicitante no recibe la notificacion del aprobador';

  -- El payload lleva el numero de solicitud, que es lo que el usuario reconoce.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.request.submitted_for_approval'
     AND payload->>'request_number' IS NOT NULL
     AND payload->>'currency' = 'BOB';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el payload no viaja completo';
  END IF;
  RAISE NOTICE 'PASS - el payload lleva numero, monto y moneda';

  -- 5.a-bis REENVIO: observada -> corregida -> reenviada debe notificar OTRA VEZ al gerente.
  -- Bug real encontrado por el operador (2026-09-09): la condicion original era
  -- OLD.status='borrador', y un reenvio sale de 'observado'. Ademas quien mueve el estado
  -- cambia segun el camino: desde borrador lo mueve el UPDATE explicito del RPC, desde
  -- observado lo mueve fr_wo_rollup_status(). De ahi que la condicion mire la ENTRADA a
  -- pendiente_aprobacion y no la salida de un estado concreto.
  UPDATE public.fund_requests SET status = 'observado' WHERE fund_request_id = v_fr;
  UPDATE public.fund_requests SET status = 'pendiente_aprobacion' WHERE fund_request_id = v_fr;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.request.submitted_for_approval'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000002';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - el reenvio desde observado no volvio a notificar al gerente (hubo %, se esperaban 2)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el reenvio desde observado vuelve a notificar al gerente';

  -- Y no dispara de mas: un UPDATE que NO cambia el estado no notifica.
  UPDATE public.fund_requests SET purpose = 'toque sin cambio de estado'
   WHERE fund_request_id = v_fr;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.request.submitted_for_approval'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000002';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - un UPDATE sin cambio de estado notifico (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - editar sin cambiar el estado no notifica';

  -- 5.b Decision del gerente: le llega AL SOLICITANTE.
  UPDATE public.fund_requests SET status = 'aprobado_gerente'
   WHERE fund_request_id = v_fr;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.request.decided'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000001'
     AND payload->>'decision' = 'aprobado_gerente';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el solicitante no recibio fund.request.decided';
  END IF;
  RAISE NOTICE 'PASS - la decision del gerente vuelve al solicitante, con la decision en el payload';

  -- 5.c Desembolso, liquidacion y cierre: hitos por timestamp, no por status.
  UPDATE public.fund_requests
     SET disbursed_at = now(), total_disbursed_amount = 500, status = 'fondos_entregados'
   WHERE fund_request_id = v_fr;
  UPDATE public.fund_requests SET settled_at = now(), status = 'en_liquidacion'
   WHERE fund_request_id = v_fr;
  UPDATE public.fund_requests SET closed_at = now(), status = 'cerrado'
   WHERE fund_request_id = v_fr;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE recipient_staff_id = '59f00000-0000-4000-8000-000000000001'
     AND type_key IN ('fund.disbursement.done','fund.settlement.recorded','fund.request.closed');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - se esperaban 3 hitos al solicitante, hubo %', v_n;
  END IF;
  RAISE NOTICE 'PASS - desembolso, liquidacion y cierre notifican al solicitante';

  -- Repetir el UPDATE no re-notifica: los hitos miran la transicion NULL -> not null.
  UPDATE public.fund_requests SET closed_at = now() WHERE fund_request_id = v_fr;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.request.closed';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - re-guardar duplico la notificacion de cierre (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - re-guardar sin cambiar el hito no duplica la notificacion';

  -- 5.d Gasto: enviado al gerente de SU OT.
  INSERT INTO public.fund_request_expenses (fund_request_id, wo_id, expense_date, amount,
                                            currency, status)
  VALUES (v_fr, v_wo, CURRENT_DATE, 100, 'BOB', 'borrador')
  RETURNING fre_id INTO v_fre;

  UPDATE public.fund_request_expenses SET status = 'pendiente_aprobacion' WHERE fre_id = v_fre;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expense.submitted_for_approval'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000002';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el gasto enviado no notifico al gerente de su OT';
  END IF;
  RAISE NOTICE 'PASS - el gasto enviado notifica al gerente de SU OT';

  -- 5.e Multa IVA: al solicitante, con el monto.
  UPDATE public.fund_request_expenses SET iva_penalty_amount = 13 WHERE fre_id = v_fre;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expense.iva_penalty'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000001'
     AND (payload->>'penalty')::numeric = 13;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la multa IVA no notifico al solicitante con el monto';
  END IF;
  RAISE NOTICE 'PASS - la multa IVA notifica al solicitante con el monto en el payload';

  -- 5.f El porton sigue mandando: accounting_manager NO tiene ese tipo en la matriz.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE recipient_staff_id = '59f00000-0000-4000-8000-000000000003'
     AND type_key = 'fund.expense.submitted_for_approval';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - un rol fuera de la matriz recibio la notificacion';
  END IF;
  RAISE NOTICE 'PASS - los disparadores respetan la matriz: notify_staff sigue filtrando';

  -- 5.g Los contadores del area de Contabilidad cuentan.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000003');
  IF (public.get_my_notification_aggregates()->'fund.request.closure_pending'->>'count')::int < 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la solicitud liquidada y cerrada no aparece en closure_pending';
  END IF;
  RAISE NOTICE 'PASS - los contadores de Fondos llegan al area de Contabilidad';
END $$;

-- -- Grupo 6 -- set_fund_request_number(): lpad truncaba y duplicaba -----------
-- Bug real encontrado por el operador probando el flujo (2026-09-10). No es de
-- notificaciones, pero se prueba aca porque es el mismo modulo y el mismo harness.
-- lpad(s, 4, '0') TRUNCA por la derecha cuando s ya mide mas de 4: con la secuencia en
-- 20260058, todo valor 2026xxxx daba el mismo 'FR-2026-2026'.
DO $$
DECLARE
  v_staff uuid;
  v_a     text;
  v_b     text;
BEGIN
  SELECT staff_id INTO v_staff FROM public.staff
   WHERE staff_id = '59f00000-0000-4000-8000-000000000001';

  -- Se fuerza la secuencia al rango que rompia.
  PERFORM setval('public.fund_request_number_seq', 20260057, true);

  INSERT INTO public.fund_requests (requester_staff_id, total_requested_amount, currency, status)
  VALUES (v_staff, 10, 'BOB', 'borrador')
  RETURNING request_number INTO v_a;

  INSERT INTO public.fund_requests (requester_staff_id, total_requested_amount, currency, status)
  VALUES (v_staff, 20, 'BOB', 'borrador')
  RETURNING request_number INTO v_b;

  IF v_a = v_b THEN
    RAISE EXCEPTION 'TEST FAIL - dos solicitudes seguidas obtuvieron el mismo numero (%): lpad sigue truncando', v_a;
  END IF;
  IF v_a !~ '^FR-[0-9]{4}-20260058$' OR v_b !~ '^FR-[0-9]{4}-20260059$' THEN
    RAISE EXCEPTION 'TEST FAIL - el numero se trunco: % y %', v_a, v_b;
  END IF;
  RAISE NOTICE 'PASS - con la secuencia en 8 digitos el numero NO se trunca (% / %)', v_a, v_b;

  -- Y por debajo de 10.000 se conserva el formato historico de 4 digitos.
  PERFORM setval('public.fund_request_number_seq', 54, true);
  INSERT INTO public.fund_requests (requester_staff_id, total_requested_amount, currency, status)
  VALUES (v_staff, 30, 'BOB', 'borrador')
  RETURNING request_number INTO v_a;
  IF v_a !~ '^FR-[0-9]{4}-0055$' THEN
    RAISE EXCEPTION 'TEST FAIL - se perdio el relleno a 4 digitos: %', v_a;
  END IF;
  RAISE NOTICE 'PASS - por debajo de 10.000 se conserva el formato 0055';

  -- El limite exacto: 9999 rellena, 10000 no trunca.
  PERFORM setval('public.fund_request_number_seq', 9998, true);
  INSERT INTO public.fund_requests (requester_staff_id, total_requested_amount, currency, status)
  VALUES (v_staff, 40, 'BOB', 'borrador')
  RETURNING request_number INTO v_a;
  INSERT INTO public.fund_requests (requester_staff_id, total_requested_amount, currency, status)
  VALUES (v_staff, 50, 'BOB', 'borrador')
  RETURNING request_number INTO v_b;
  IF v_a !~ '9999$' OR v_b !~ '10000$' THEN
    RAISE EXCEPTION 'TEST FAIL - el cruce de 9999 a 10000 no es correcto: % / %', v_a, v_b;
  END IF;
  RAISE NOTICE 'PASS - el cruce 9999 -> 10000 no trunca ni duplica';
END $$;

-- -- Grupo 7 -- Revision contable: por gasto al solicitante, consolidado al gerente -----
-- Cubre lo que se agrego despues del Grupo 5 (observaciones del operador, 2026-09-09/10):
-- el reenvio a contabilidad, fund.expense.reviewed, fund.expenses.all_reviewed, el Gerente
-- de Contabilidad en la bandeja de revision, y el contador "Gastos por revisar".
DO $$
DECLARE
  v_fr    uuid := 'f9f00000-0000-4000-8000-000000000007';
  v_wo    uuid;
  v_e1    uuid;
  v_e2    uuid;
  v_n     int;
  v_acan  uuid := '59f00000-0000-4000-8000-000000000004';  -- accounting_analyst
BEGIN
  -- Un Analista de Contabilidad, que el fixture base no tiene.
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    VALUES ('a9f00000-0000-4000-8000-000000000004',
            '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'notif-test-4@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  INSERT INTO public.user_roles (user_id, role, role_key)
  VALUES ('a9f00000-0000-4000-8000-000000000004', 'senior', 'accounting_analyst')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                            practica_id, society_id, weekly_capacity_hours, hire_date, city)
  VALUES (v_acan, 'a9f00000-0000-4000-8000-000000000004', 'NOTIF', 'AcAnalyst', true,
          (SELECT practica_id FROM public.practicas WHERE code = 1),
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz');

  INSERT INTO public.work_orders (engagement_id, currency, season_mode, approval_status)
  VALUES ('e9f00000-0000-4000-8000-000000000001', 'BOB', 'High', 'Approved')
  RETURNING wo_id INTO v_wo;

  INSERT INTO public.fund_requests (fund_request_id, requester_staff_id,
                                    total_requested_amount, currency, status, disbursed_at)
  VALUES (v_fr, '59f00000-0000-4000-8000-000000000001', 300, 'BOB', 'fondos_entregados', now());
  INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
  VALUES (v_fr, v_wo, 300);

  -- DOS gastos: el consolidado no debe salir hasta que los dos esten revisados.
  INSERT INTO public.fund_request_expenses (fund_request_id, wo_id, expense_date, amount,
                                            currency, status)
  VALUES (v_fr, v_wo, CURRENT_DATE, 100, 'BOB', 'pendiente_aprobacion')
  RETURNING fre_id INTO v_e1;
  INSERT INTO public.fund_request_expenses (fund_request_id, wo_id, expense_date, amount,
                                            currency, status)
  VALUES (v_fr, v_wo, CURRENT_DATE, 200, 'BOB', 'pendiente_aprobacion')
  RETURNING fre_id INTO v_e2;

  -- 7.a El gerente aprueba: la bandeja de revision va al Analista Y al Gerente de Contabilidad.
  UPDATE public.fund_request_expenses SET status = 'aprobado_gerente' WHERE fre_id = v_e1;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expense.sent_to_support_review'
     AND recipient_staff_id = v_acan;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Contabilidad no recibio sent_to_support_review';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expense.sent_to_support_review'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000003';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el GERENTE de Contabilidad no recibio sent_to_support_review';
  END IF;
  RAISE NOTICE 'PASS - la bandeja de revision llega al Analista Y al Gerente de Contabilidad';

  -- 7.b El contador "Gastos por revisar" cuenta lo mismo que el tab expenses_review.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000003');
  IF (public.get_my_notification_aggregates()->'fund.expense.review_pending'->>'count')::int < 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el contador de gastos por revisar no cuenta la solicitud';
  END IF;
  RAISE NOTICE 'PASS - el contador "Gastos por revisar" ve la solicitud en revision';

  -- 7.c Contabilidad devuelve por respaldo y el solicitante reenvia: vuelve a contabilidad,
  -- NO al gerente de la OT.
  UPDATE public.fund_request_expenses
     SET status = 'observado', returned_by_assistant = true WHERE fre_id = v_e1;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expense.returned_no_support'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000001';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la devolucion por respaldo no llego al solicitante';
  END IF;

  UPDATE public.fund_request_expenses
     SET status = 'aprobado_gerente', returned_by_assistant = false WHERE fre_id = v_e1;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expense.resubmitted' AND recipient_staff_id = v_acan;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el reenvio con factura no llego a contabilidad';
  END IF;
  -- Y NO volvio al gerente de la OT: useResendReturnedExpense no lo hace pasar por el.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expense.submitted_for_approval'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000002';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el reenvio a contabilidad notifico de mas al gerente de la OT';
  END IF;
  RAISE NOTICE 'PASS - el reenvio con factura vuelve a contabilidad y NO al gerente de la OT';

  -- 7.d Contabilidad aprueba el PRIMERO: al solicitante, y NADA al gerente todavia.
  UPDATE public.fund_request_expenses SET status = 'revisado_asistente' WHERE fre_id = v_e1;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expense.reviewed'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000001';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el solicitante no recibio fund.expense.reviewed';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expense.reviewed'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000002';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente recibio el aviso POR GASTO (deberia ser solo el consolidado)';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expenses.all_reviewed';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el consolidado salio con un gasto todavia sin revisar';
  END IF;
  RAISE NOTICE 'PASS - el aviso por gasto va solo al solicitante, y el consolidado espera';

  -- 7.e Un gasto RECHAZADO bloquea el consolidado: sigue siendo corregible (expensePhase).
  UPDATE public.fund_request_expenses SET status = 'rechazado' WHERE fre_id = v_e2;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expenses.all_reviewed';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el consolidado salio con un gasto rechazado pendiente';
  END IF;
  RAISE NOTICE 'PASS - un gasto rechazado (aun corregible) no dispara el consolidado';

  -- 7.f Con el ULTIMO revisado, el consolidado sale UNA vez y va al gerente de la OT.
  UPDATE public.fund_request_expenses SET status = 'revisado_asistente' WHERE fre_id = v_e2;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expenses.all_reviewed'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000002';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el consolidado al gerente salio % veces, se esperaba 1', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.expenses.all_reviewed'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000001';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el consolidado le llego al solicitante (es solo del gerente)';
  END IF;
  RAISE NOTICE 'PASS - el consolidado sale UNA vez, al gerente, cuando cae el ultimo gasto';

  -- 7.g Desembolso / liquidacion / cierre tambien al gerente (no solo al solicitante).
  UPDATE public.fund_requests SET settled_at = now(), status = 'en_liquidacion'
   WHERE fund_request_id = v_fr;
  UPDATE public.fund_requests SET closed_at = now(), status = 'cerrado'
   WHERE fund_request_id = v_fr;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE recipient_staff_id = '59f00000-0000-4000-8000-000000000002'
     AND type_key IN ('fund.settlement.recorded', 'fund.request.closed');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente recibio % de los 2 hitos de cierre', v_n;
  END IF;
  RAISE NOTICE 'PASS - liquidacion y cierre tambien llegan al gerente';
END $$;

-- -- Grupo 8 -- FASE 3.b: work_orders, las dos pistas y sus tres trampas ------
-- Las tres cosas que costaban un bug y que este grupo fija:
--   1. la aprobacion se escribe en DOS sentencias, asi que el trigger corre dos veces;
--   2. tres caminos distintos llegan a 'Pending_Approval' y solo uno es un envio;
--   3. el reenvio tras un rechazo de Riesgos cumple a la vez "entra a la cola" y "reenvia".
DO $$
DECLARE
  v_wo   uuid;
  v_n    int;
  c_part constant uuid := '59f00000-0000-4000-8000-000000000004';  -- S_PARTNER
  c_mgr  constant uuid := '59f00000-0000-4000-8000-000000000002';  -- S_MGR
  c_risk constant uuid := '59f00000-0000-4000-8000-000000000005';  -- S_RISK (risk_supervisor)
BEGIN
  INSERT INTO public.work_orders (engagement_id, currency, season_mode, approval_status)
  VALUES ('e9f00000-0000-4000-8000-000000000002', 'BOB', 'High', 'Draft')
  RETURNING wo_id INTO v_wo;

  -- 8.a Envio a aprobacion: al Socio del encargo, y a Riesgos por la otra pista.
  UPDATE public.work_orders SET approval_status = 'Pending_Approval' WHERE wo_id = v_wo;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.submitted_partner' AND recipient_staff_id = c_part;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el Socio no recibio wo.submitted_partner (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.submitted_risk' AND recipient_staff_id = c_risk;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - Riesgos no recibio wo.submitted_risk (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el envio despierta las dos pistas: Socio y Riesgos';

  -- Sin plan de pagos no hay aviso de plan de pagos: Cobranzas no recibe ruido.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.payment_plan.pending_approval';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - salio el aviso de plan de pagos sin cuotas cargadas';
  END IF;
  RAISE NOTICE 'PASS - una OT sin cuotas no anuncia plan de pagos';

  -- 8.b Firma del Socio: es la PRIMERA de las dos sentencias. El aviso sale ahi, no en el
  -- cierre, y el cierre no debe duplicarlo.
  UPDATE public.work_orders SET approved_by = c_part, approved_at = now() WHERE wo_id = v_wo;
  UPDATE public.work_orders SET approval_status = 'Approved'
   WHERE wo_id = v_wo AND risk_status IN ('Approved', 'Emergency_Approved');  -- no cierra: Riesgos sigue Pending

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.approved_partner' AND recipient_staff_id = c_mgr;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - wo.approved_partner llego % veces al gerente, se esperaba 1', v_n;
  END IF;
  RAISE NOTICE 'PASS - la firma del Socio avisa UNA vez, aunque el cierre sea otra sentencia';

  -- 8.c Riesgos rechaza: sube al Socio Y al Gerente, porque frena la OT entera.
  UPDATE public.work_orders SET risk_status = 'Rejected', risk_notes = 'faltan datos'
   WHERE wo_id = v_wo;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.rejected_risk' AND recipient_staff_id IN (c_part, c_mgr);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - wo.rejected_risk no llego a Socio y Gerente (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el rechazo de Riesgos sube al Socio ademas del Gerente';

  -- 8.d Reenvio de los datos: es REENVIO, no una entrada nueva. Sin el `NOT v_resubmit` del
  -- disparador, Riesgos recibiria los dos avisos por el mismo hecho.
  UPDATE public.work_orders SET risk_status = 'Pending', risk_level = 'Bajo' WHERE wo_id = v_wo;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.risk.resubmitted' AND recipient_staff_id = c_risk;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - Riesgos no recibio wo.risk.resubmitted (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.submitted_risk' AND recipient_staff_id = c_risk;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el reenvio tambien conto como entrada a la cola (hubo % submitted_risk)', v_n;
  END IF;

  -- Y el caso que obliga al `NOT v_resubmit` del disparador: retirar y volver a enviar con la
  -- pista de Riesgos en Rejected (useSubmitWorkOrder con resetRiskToPending) mueve las DOS
  -- cosas en una sola sentencia, asi que cumple "entra a la cola" y "reenvia" a la vez.
  UPDATE public.work_orders SET risk_status = 'Rejected' WHERE wo_id = v_wo;
  UPDATE public.work_orders SET approval_status = 'Draft' WHERE wo_id = v_wo;
  UPDATE public.work_orders SET approval_status = 'Pending_Approval', risk_status = 'Pending'
   WHERE wo_id = v_wo;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.submitted_risk' AND recipient_staff_id = c_risk;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - envio+reenvio simultaneos contaron como entrada (hubo % submitted_risk)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.risk.resubmitted' AND recipient_staff_id = c_risk;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - el segundo reenvio no aviso a Riesgos (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - reenviar los datos es reenvio, no una entrada nueva a la cola';

  -- 8.e Riesgos aprueba y la OT cierra (segunda sentencia). Un solo wo.approved_risk.
  UPDATE public.work_orders SET risk_status = 'Approved', risk_approved_by = c_risk,
                                risk_approved_at = now()
   WHERE wo_id = v_wo;
  UPDATE public.work_orders SET approval_status = 'Approved'
   WHERE wo_id = v_wo AND approved_at IS NOT NULL;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.approved_risk' AND recipient_staff_id = c_mgr;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - wo.approved_risk llego % veces, se esperaba 1', v_n;
  END IF;
  RAISE NOTICE 'PASS - la aprobacion de Riesgos avisa UNA vez y el cierre no la duplica';

  -- 8.f Reversion de Admin de la pista de Riesgos: avisa la reversion Y devuelve la OT a la
  -- cola de Riesgos (D-23). Son audiencias disjuntas, nadie recibe dos veces lo mismo.
  UPDATE public.work_orders
     SET risk_status = 'Pending', risk_approved_by = NULL, risk_approved_at = NULL
   WHERE wo_id = v_wo;
  UPDATE public.work_orders SET approval_status = 'Pending_Approval'
   WHERE wo_id = v_wo AND approval_status = 'Approved';

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.approval_reverted'
     AND recipient_staff_id IN (c_part, c_mgr)
     AND payload->>'context' = 'risk';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - wo.approval_reverted no llego a Socio y Gerente (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.submitted_risk' AND recipient_staff_id = c_risk;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - la reversion no devolvio la OT a la cola de Riesgos (hubo % submitted_risk)', v_n;
  END IF;
  -- Y la reapertura de la segunda sentencia NO se cuenta como un envio nuevo: los dos
  -- wo.submitted_partner de este grupo son los dos envios reales (8.a y el reenvio de 8.d).
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.submitted_partner' AND recipient_staff_id = c_part;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - reabrir a Pending_Approval conto como envio (hubo %, se esperaban 2)', v_n;
  END IF;
  RAISE NOTICE 'PASS - la reversion avisa y reabre la cola de Riesgos, sin contar como envio';

  -- 8.g Rechazo del Socio: al Gerente, con el motivo en el payload.
  UPDATE public.work_orders SET approval_status = 'Rejected', notes = 'presupuesto alto'
   WHERE wo_id = v_wo;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.rejected_partner' AND recipient_staff_id = c_mgr
     AND payload->>'reason' = 'presupuesto alto';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente no recibio wo.rejected_partner con el motivo';
  END IF;
  RAISE NOTICE 'PASS - el rechazo del Socio llega al Gerente con el motivo';

  -- 8.h Emergencia: paso 1 a Riesgos, paso 2 (que enciende el plazo) al Gerente.
  UPDATE public.work_orders SET emergency_review_by = c_risk, emergency_review_at = now()
   WHERE wo_id = v_wo;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.emergency.step1_done' AND recipient_staff_id = c_risk;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - Riesgos no recibio wo.emergency.step1_done';
  END IF;

  UPDATE public.work_orders
     SET emergency_partner_by = c_part, emergency_partner_at = now(),
         risk_status = 'Emergency_Approved',
         emergency_deadline_at = (now() AT TIME ZONE 'America/La_Paz')::date + 7
   WHERE wo_id = v_wo;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.emergency.created' AND recipient_staff_id = c_mgr;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente no recibio wo.emergency.created';
  END IF;

  -- D-25: la aprobacion de emergencia TAMBIEN es una aprobacion de Riesgos. El gerente
  -- recibe los dos avisos, y el de la pista lleva el estado real para que el badge no
  -- diga "Aprobada" a secas. Sumado al de 8.e, van 2.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.approved_risk' AND recipient_staff_id = c_mgr;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - la aprobacion de emergencia no conto como aprobacion de Riesgos (hubo %, se esperaban 2)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.approved_risk' AND recipient_staff_id = c_mgr
     AND payload->>'status' = 'Emergency_Approved';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el aviso de la emergencia no lleva el estado real en el payload';
  END IF;
  RAISE NOTICE 'PASS - las dos firmas de emergencia avisan, y la emergencia cuenta como aprobacion de Riesgos';

  -- 8.i El cron: a 7 dias no avisa; a 3 si, y correrlo dos veces el mismo dia no duplica.
  PERFORM public.notif_wo_daily_scheduled();
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.emergency.deadline_near';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el cron aviso con 7 dias de plazo (hubo %)', v_n;
  END IF;

  UPDATE public.work_orders
     SET emergency_deadline_at = (now() AT TIME ZONE 'America/La_Paz')::date + 3
   WHERE wo_id = v_wo;
  PERFORM public.notif_wo_daily_scheduled();
  PERFORM public.notif_wo_daily_scheduled();

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.emergency.deadline_near' AND recipient_staff_id = c_mgr
     AND payload->>'days_left' = '3';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el aviso de plazo salio % veces con 3 dias, se esperaba 1', v_n;
  END IF;
  RAISE NOTICE 'PASS - el cron avisa a 3 dias y es idempotente en el dia';

  -- El ultimo dia es OTRO disparo del MISMO tipo, distinguido por days_left (D-09).
  UPDATE public.work_orders
     SET emergency_deadline_at = (now() AT TIME ZONE 'America/La_Paz')::date
   WHERE wo_id = v_wo;
  PERFORM public.notif_wo_daily_scheduled();

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.emergency.deadline_near' AND recipient_staff_id = c_mgr
     AND payload->>'context' = 'last_day';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - falto el aviso del ultimo dia (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el ultimo dia es un segundo disparo del mismo tipo';

  -- Y una vez vencido, el aviso de vencimiento va a Riesgos, una sola vez.
  UPDATE public.work_orders
     SET emergency_deadline_at = (now() AT TIME ZONE 'America/La_Paz')::date - 1
   WHERE wo_id = v_wo;
  PERFORM public.notif_wo_daily_scheduled();
  PERFORM public.notif_wo_daily_scheduled();

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.emergency.deadline_passed' AND recipient_staff_id = c_risk;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el vencimiento aviso % veces a Riesgos, se esperaba 1', v_n;
  END IF;
  RAISE NOTICE 'PASS - el plazo vencido avisa a Riesgos una sola vez';
END $$;

-- -- Grupo 9 -- FASE 3.b: plan de pagos, cuotas y sus dos contadores ----------
DO $$
DECLARE
  v_wo    uuid;
  v_plan  uuid;
  v_inst  uuid;
  v_inst2 uuid;
  v_n     int;
  v_agg   jsonb;
  c_part constant uuid := '59f00000-0000-4000-8000-000000000004';
  c_mgr  constant uuid := '59f00000-0000-4000-8000-000000000002';
  c_acct constant uuid := '59f00000-0000-4000-8000-000000000003';
BEGIN
  INSERT INTO public.work_orders (engagement_id, currency, season_mode, approval_status)
  VALUES ('e9f00000-0000-4000-8000-000000000002', 'BOB', 'High', 'Draft')
  RETURNING wo_id INTO v_wo;

  INSERT INTO public.wo_payment_plan (wo_id, payment_days)
  VALUES (v_wo, 30) RETURNING plan_id INTO v_plan;

  -- OJO CON LA MAQUINA DE ESTADOS DE LA CUOTA. La rama 0722-156b (tipo de cambio por cuota,
  -- aplicada al mirror antes de mergear a development) agrega dos guards sobre esta tabla:
  --   * una cuota NUEVA sólo puede nacer en 'Pending';
  --   * las transiciones legales son Pending->Invoiced, Overdue->Invoiced e
  --     Invoiced->{Completed, Overdue}. NADA vuelve a 'Pending';
  --   * con status <> 'Pending', percentage/amount/installment_number quedan congelados.
  -- Este grupo respeta las tres reglas a propósito: cuando esa rama entre a development, la
  -- suite tiene que seguir pasando sin tocarla.
  --
  -- Cuota 1: vencida hace una semana. Alimenta el contador de mora. Nace 'Pending' — con la
  -- fecha de pago ya pasada el contador la cuenta igual, sin necesidad del estado 'Overdue'.
  INSERT INTO public.wo_payment_installments (plan_id, wo_id, installment_number, percentage,
                                              amount, status, agreed_invoice_date,
                                              agreed_payment_date)
  VALUES (v_plan, v_wo, 1, 60, 600, 'Pending',
          (now() AT TIME ZONE 'America/La_Paz')::date - 14,
          (now() AT TIME ZONE 'America/La_Paz')::date - 7)
  RETURNING installment_id INTO v_inst;

  -- Cuota 2: se queda en 'Pending' toda la prueba, con la fecha de facturación de ESTA
  -- semana. Es la única forma de probar `wo.client.billing_week` (9.e), que exige
  -- status='Pending': como ninguna transición vuelve a ese estado, una cuota ya facturada
  -- no puede reusarse para eso.
  INSERT INTO public.wo_payment_installments (plan_id, wo_id, installment_number, percentage,
                                              amount, status, agreed_invoice_date,
                                              agreed_payment_date)
  VALUES (v_plan, v_wo, 2, 40, 400, 'Pending',
          date_trunc('week', (now() AT TIME ZONE 'America/La_Paz')::date)::date + 2,
          (now() AT TIME ZONE 'America/La_Paz')::date + 30)
  RETURNING installment_id INTO v_inst2;

  -- 9.a Ahora SI hay cuotas: el envio anuncia el plan de pagos al Socio.
  UPDATE public.work_orders SET approval_status = 'Pending_Approval' WHERE wo_id = v_wo;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.payment_plan.pending_approval' AND recipient_staff_id = c_part;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el Socio no recibio wo.payment_plan.pending_approval (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - con cuotas cargadas, el envio anuncia tambien el plan de pagos';

  -- 9.b Cambio de estado de una cuota: a Contabilidad, con el estado en el payload.
  -- Pending -> Invoiced es la única salida legal de 'Pending'.
  UPDATE public.wo_payment_installments SET status = 'Invoiced' WHERE installment_id = v_inst;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.installment.status_changed' AND recipient_staff_id = c_acct
     AND payload->>'status' = 'Invoiced';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - Contabilidad no recibio wo.installment.status_changed';
  END IF;

  -- Un UPDATE que no toca el estado no avisa. Se mueve una FECHA y no el monto: con la
  -- cuota ya facturada, percentage/amount/installment_number están congelados por el guard
  -- de 0722-156b y tocarlos aborta la transacción en vez de probar lo que se quiere probar.
  UPDATE public.wo_payment_installments
     SET collection_invoice_date = (now() AT TIME ZONE 'America/La_Paz')::date
   WHERE installment_id = v_inst;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.installment.status_changed' AND recipient_staff_id = c_acct;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - editar una fecha de la cuota notifico (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - la cuota avisa al cambiar de estado, y solo entonces';

  -- 9.c El contador de mora respeta el scope. El GERENTE lo tiene en `assigned`: cuenta su
  -- encargo y trae el COT como item.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000002');
  v_agg := public.get_my_notification_aggregates();
  IF COALESCE((v_agg->'wo.installment.overdue'->>'count')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente ve % cuotas vencidas, se esperaba 1',
                    COALESCE((v_agg->'wo.installment.overdue'->>'count')::int, -1);
  END IF;
  IF jsonb_array_length(v_agg->'wo.installment.overdue'->'items') <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el alcance assigned no trajo el encargo como item';
  END IF;
  RAISE NOTICE 'PASS - el gerente ve la mora de SUS encargos, con el encargo como item';

  -- Contabilidad lo tiene en `department`: cuenta igual, pero sin lista (puede ser enorme).
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000003');
  v_agg := public.get_my_notification_aggregates();
  IF COALESCE((v_agg->'wo.installment.overdue'->>'count')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - Contabilidad no ve la cuota vencida';
  END IF;
  IF jsonb_array_length(v_agg->'wo.installment.overdue'->'items') <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el alcance department devolvio items (deberia venir vacio)';
  END IF;
  RAISE NOTICE 'PASS - Contabilidad ve la mora de toda la firma, sin lista';

  -- Y el assistant no tiene el tipo en la matriz: la clave ni aparece.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000001');
  v_agg := public.get_my_notification_aggregates();
  IF v_agg ? 'wo.installment.overdue' THEN
    RAISE EXCEPTION 'TEST FAIL - un rol sin el contador en la matriz lo recibio igual';
  END IF;
  RAISE NOTICE 'PASS - el contador de mora no le llega a quien la matriz no se lo concede';
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- 9.d Los dos contadores NO se solapan: una cuota vencida no cuenta como "por vencer".
  IF (public.notif_agg_wo_installment_due_this_week()->>'count')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - una cuota vencida se conto como por vencer esta semana';
  END IF;

  -- Movida a HOY cambia de contador (y deja de ser mora). Se usa hoy y no un dia fijo de la
  -- semana porque el contador cuenta de hoy al domingo: con "viernes" fijo, la suite fallaria
  -- los sabados y domingos. Solo se mueve la FECHA: el estado ya es 'Invoiced' y volver a
  -- escribirlo no aportaria nada (y las fechas no las congela el guard).
  UPDATE public.wo_payment_installments
     SET agreed_payment_date = (now() AT TIME ZONE 'America/La_Paz')::date
   WHERE installment_id = v_inst;

  IF (public.notif_agg_wo_installment_due_this_week()->>'count')::int <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la cuota de esta semana no entro en el contador';
  END IF;
  RAISE NOTICE 'PASS - vencida y por vencer son contadores disjuntos';

  -- 9.e Semana de facturacion: el cron avisa al gerente una vez por cuota. La protagonista
  -- es la CUOTA 2, que nunca salio de 'Pending'; la 1 ya esta facturada y por eso queda
  -- fuera, que es justo lo que el tipo tiene que hacer.
  PERFORM public.notif_wo_daily_scheduled();
  PERFORM public.notif_wo_daily_scheduled();

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.client.billing_week' AND recipient_staff_id = c_mgr
     AND payload->>'installment_id' = v_inst2::text;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la semana de facturacion aviso % veces, se esperaba 1', v_n;
  END IF;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.client.billing_week'
     AND payload->>'installment_id' = v_inst::text;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - una cuota ya facturada entro en la semana de facturacion';
  END IF;
  RAISE NOTICE 'PASS - la semana de facturacion avisa una vez por cuota, y solo por las no facturadas';
END $$;

-- -- Grupo 10 -- FASE 3.c: modulo Encargos ------------------------------------
-- Los tres puntos donde este modulo se sale del molde de los anteriores:
--   1. el alta tambien asigna: un encargo nace con SQR y Encargado elegidos;
--   2. la finalizacion es el unico evento que baja hasta el staffing (engagement_assignments),
--      porque seniors/semis/asistentes no se atan al encargo por columna;
--   3. el mismo type_key de staffing se redacta distinto para el afectado y para su gerente.
DO $$
DECLARE
  v_eng  uuid := 'e9f00000-0000-4000-8000-000000000003';
  v_asg  uuid;
  v_n    int;
  c_part constant uuid := '59f00000-0000-4000-8000-000000000004';
  c_mgr  constant uuid := '59f00000-0000-4000-8000-000000000002';
  c_sen  constant uuid := '59f00000-0000-4000-8000-000000000001';  -- S_ASSIST (assistant)
  c_adm  constant uuid := '59f00000-0000-4000-8000-000000000006';
BEGIN
  DELETE FROM public.notifications;

  -- 10.a Alta con Socio, Gerente y Encargado ya elegidos.
  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                  partner_id, manager_id, encargado_id, created_by_staff_id,
                                  fecha_cierre)
  VALUES (v_eng, 'c9f00000-0000-4000-8000-000000000001', 'NOTIF Encargo Tres', '9F03',
          c_part, c_mgr, c_sen, c_mgr, '2026-12-31');

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.created' AND recipient_staff_id IN (c_part, c_mgr);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - engagement.created no llego a Socio y Gerente (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el alta avisa a la conduccion del encargo';

  -- El Encargado NO recibe engagement.created (columna Asistente/Senior en `no`): si el alta
  -- no disparara ademas `encargado_assigned`, no se enteraria nunca de su primer encargo.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.created' AND recipient_staff_id = c_sen;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el Encargado recibio engagement.created, que no le toca';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.encargado_assigned' AND recipient_staff_id = c_sen;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el Encargado no recibio su asignacion en el alta (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el alta tambien asigna: el Encargado se entera aunque no reciba el alta';

  -- 10.b Cambio de responsables: auditoria al Admin + la conduccion resultante.
  UPDATE public.engagements SET sqr_id = c_part WHERE engagement_id = v_eng;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.owners.changed' AND recipient_staff_id = c_adm;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el Admin no recibio engagement.owners.changed';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.sqr_assigned' AND recipient_staff_id = c_part;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el nuevo SQR no recibio su asignacion';
  END IF;
  RAISE NOTICE 'PASS - el cambio de responsables audita y avisa al asignado';

  -- Un UPDATE que no toca ningun responsable no vuelve a avisar.
  UPDATE public.engagements SET engagement_name = 'NOTIF Encargo Tres bis'
   WHERE engagement_id = v_eng;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.owners.changed';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - renombrar el encargo conto como cambio de responsables (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - renombrar el encargo no es un cambio de responsables';

  -- 10.c Staffing: el afectado y su gerente reciben el MISMO tipo con distinta redaccion.
  INSERT INTO public.engagement_assignments (engagement_id, staff_id, category_id,
                                             start_date, end_date, status)
  VALUES (v_eng, c_sen, (SELECT category_id FROM public.categories LIMIT 1),
          CURRENT_DATE, CURRENT_DATE + 30, 'CONFIRMED')
  RETURNING assignment_id INTO v_asg;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.staffing.changed' AND recipient_staff_id = c_sen
     AND payload->>'context' = 'assigned';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el asignado no recibio su aviso de staffing (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.staffing.changed' AND recipient_staff_id = c_mgr
     AND payload->>'context' = 'team_assigned'
     AND payload->>'staff_name' <> '';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente no recibio la version de equipo, con el nombre';
  END IF;
  RAISE NOTICE 'PASS - staffing: el afectado y el gerente reciben redacciones distintas';

  -- 10.d Baja por borrado logico (lo que escribe save_engagement_assignments).
  UPDATE public.engagement_assignments SET deleted_at = now() WHERE assignment_id = v_asg;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.staffing.changed' AND recipient_staff_id = c_sen
     AND payload->>'context' = 'unassigned';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la baja logica no aviso al desasignado (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el borrado logico cuenta como desasignacion';

  -- Y los cambios de fechas/horas NO avisan: el Scheduler los reescribe seguido.
  UPDATE public.engagement_assignments SET hours_per_week = 20 WHERE assignment_id = v_asg;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.staffing.changed' AND recipient_staff_id = c_sen;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - cambiar las horas de la asignacion notifico (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - mover horas o fechas de la asignacion no avisa';

  -- 10.e Finalizacion: baja hasta el staffing VIGENTE. La asignacion de arriba quedo borrada,
  -- asi que el asistente NO debe recibirla; se le devuelve la asignacion para comprobar que
  -- con staffing vivo si le llega.
  UPDATE public.engagements SET engagement_state_override = 7 WHERE engagement_id = v_eng;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.finalized' AND recipient_staff_id = c_sen;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - un staffing borrado recibio la finalizacion';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.finalized' AND recipient_staff_id IN (c_part, c_mgr, c_adm);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - la finalizacion no llego a Socio, Gerente y Admin (hubo %)', v_n;
  END IF;

  UPDATE public.engagement_assignments SET deleted_at = NULL WHERE assignment_id = v_asg;
  UPDATE public.engagements SET engagement_state_override = NULL WHERE engagement_id = v_eng;
  UPDATE public.engagements SET engagement_state_override = 7 WHERE engagement_id = v_eng;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.finalized' AND recipient_staff_id = c_sen;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - con staffing vigente el asistente no recibio la finalizacion (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - la finalizacion baja al staffing vigente, y solo al vigente';

  -- 10.f Borrado del encargo: solo auditoria.
  DELETE FROM public.engagement_assignments WHERE assignment_id = v_asg;
  DELETE FROM public.engagements WHERE engagement_id = v_eng;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.deleted' AND recipient_staff_id = c_adm;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el Admin no recibio engagement.deleted (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.deleted' AND recipient_staff_id IN (c_part, c_mgr, c_sen);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el borrado del encargo aviso a alguien fuera de auditoria';
  END IF;
  RAISE NOTICE 'PASS - el borrado del encargo es solo auditoria del Admin';

  RAISE NOTICE 'NOTIFICACIONES FASE 1: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
