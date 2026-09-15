-- Tests transaccionales del catálogo de notificaciones — Fases 1 a 3.h (18 grupos)
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
--   U_RPART  / S_RPART    risk_partner — el UNICO destinatario de wo.emergency.step1_done
--   U_HR     / S_HR       hr_manager — el contador de capacitacion (3.d)
--   U_SENIOR / S_SENIOR   senior — Encargado del encargo y dueno de la boleta (3.c/3.d)
--   U_SPART  / S_SPART    senior_partner — el alcance `global` del modulo Clientes (3.f)
--   S_ORPHAN              staff sin auth_user_id — nadie puede notificarle
--   E_ONE                 encargo con COT '9F01' y dos actividades pendientes (dedup de COT)
--   E_TWO                 encargo con COT '9F02', con Socio Y Gerente — el mundo de la 3.b
--   E_FOUR..E_SEVEN       uno por grupo desde el 7: `work_orders` es UNIQUE por encargo, asi
--                         que dos grupos no pueden compartirlo
--
-- CON QUE SESION CORRE CADA COSA. El harness corre como DUENO de las tablas, y varios guards
-- del esquema exigen permisos en cuanto hay `auth.uid()` (fondos, pista de Riesgos, alta de
-- encargos). Por eso cada grupo declara su sesion: `pg_temp.impersonate(<sub>)` para actuar
-- como alguien, y `set_config('request.jwt.claims','',true)` para cargar fixtures "sin
-- sesion", que es como los escribe el seed (service_role). RLS, en cambio, NO se evalua para
-- el dueno: el unico chequeo que la necesita baja a `authenticated` a mano (Grupo 3).

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

    -- Los dos actores que se sumaron con la FASE 3.d y con el Socio de Riesgos. Van con id
    -- explicito y fuera de la serie para no correr la numeracion de los seis de arriba, que
    -- esta cableada en las aserciones de todos los grupos.
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    VALUES ('a9f00000-0000-4000-8000-000000000008',
            '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'notif-test-8@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
           ('a9f00000-0000-4000-8000-00000000000a',
            '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'notif-test-a@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
           ('a9f00000-0000-4000-8000-00000000000b',
            '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'notif-test-b@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
           ('a9f00000-0000-4000-8000-00000000000c',
            '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'notif-test-c@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
           ('a9f00000-0000-4000-8000-00000000000f',
            '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'notif-test-f@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
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
  ('a9f00000-0000-4000-8000-000000000006', 'admin',   'admin'),
  -- Socio de Riesgos: es el UNICO que la matriz pone en `wo.emergency.step1_done`, asi que
  -- sin el ese evento no tenia destinatario posible y la asercion no podia pasar.
  ('a9f00000-0000-4000-8000-000000000008', 'partner', 'risk_partner'),
  -- FASE 3.d: Talento Humano recibe el contador de capacitacion (alcance `department`).
  ('a9f00000-0000-4000-8000-00000000000a', 'staff',   'hr_manager'),
  -- Senior: es el rol que la matriz habilita como ENCARGADO del encargo
  -- (`engagement.encargado_assigned` no llega a un Asistente) y el que reporta horas en la
  -- FASE 3.d.
  ('a9f00000-0000-4000-8000-00000000000b', 'senior',  'senior'),
  -- Seguridad TI: es el UNICO destinatario de `auth.account.deleted` (al ADM la matriz no
  -- se lo da), y comparte con el ADM la auditoria de cambios de rol (D-17).
  ('a9f00000-0000-4000-8000-00000000000c', 'staff',   'it_security_manager'),
  -- Senior Partner: el alcance `global` del modulo Clientes (alta e inactivacion) es suyo.
  ('a9f00000-0000-4000-8000-00000000000f', 'partner', 'senior_partner')
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
  ('59f00000-0000-4000-8000-000000000008', 'a9f00000-0000-4000-8000-000000000008',
   'NOTIF', 'RiskPartner', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  ('59f00000-0000-4000-8000-00000000000a', 'a9f00000-0000-4000-8000-00000000000a',
   'NOTIF', 'HrManager', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  ('59f00000-0000-4000-8000-00000000000f', 'a9f00000-0000-4000-8000-00000000000f',
   'NOTIF', 'SeniorPartner', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  ('59f00000-0000-4000-8000-00000000000c', 'a9f00000-0000-4000-8000-00000000000c',
   'NOTIF', 'ItSec', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  ('59f00000-0000-4000-8000-00000000000b', 'a9f00000-0000-4000-8000-00000000000b',
   'NOTIF', 'Senior', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'),
  -- S_ORPHAN: sin cuenta vinculada. Mismo criterio que get_engagement_team_candidates().
  ('59f00000-0000-4000-8000-000000000009', NULL,
   'NOTIF', 'Orphan', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz');

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c9f00000-0000-4000-8000-000000000001', 'NOTIF Cliente SA', 'NOTIF-9F01');

-- Una categoria: `engagement_assignments.category_id` es NOT NULL y el harness arranca con
-- la tabla vacia (en un ambiente con el seed real ya existirian las 9). El Grupo 10 la
-- buscaba con `LIMIT 1` y se llevaba un NULL.
-- Una competencia: la FASE 3.e notifica altas y bajas de `staff_skills`, que apunta aca.
INSERT INTO public.skills (skill_id, name, category)
VALUES ('c9f00000-0000-4000-8000-0000000000b1', 'NOTIF Competencia', 'tool');

INSERT INTO public.categories (category_id, category_name, practica_id, display_order)
VALUES ('c9f00000-0000-4000-8000-0000000000c1', 'NOTIF Categoria',
        (SELECT practica_id FROM public.practicas WHERE code = 1), 1);

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                manager_id, created_by_staff_id, fecha_cierre, society_id)
VALUES ('e9f00000-0000-4000-8000-000000000001', 'c9f00000-0000-4000-8000-000000000001',
        'NOTIF Encargo Uno', '9F01',
        '59f00000-0000-4000-8000-000000000002',
        '59f00000-0000-4000-8000-000000000002', '2026-12-31',
        (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

-- E_TWO: encargo aparte para la FASE 3.b, con Socio Y Gerente. No se le agrega partner_id a
-- E_ONE para no mover el piso de los grupos 3 y 5, que ya cuentan sobre ese encargo.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                partner_id, manager_id, created_by_staff_id, fecha_cierre,
                                society_id)
VALUES ('e9f00000-0000-4000-8000-000000000002', 'c9f00000-0000-4000-8000-000000000001',
        'NOTIF Encargo Dos', '9F02',
        '59f00000-0000-4000-8000-000000000004',
        '59f00000-0000-4000-8000-000000000002',
        '59f00000-0000-4000-8000-000000000002', '2026-12-31',
        (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

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

  -- 75 = los 71 originales + los 4 recordatorios periodicos que agrego D-44 (delivery='email').
  IF v_types <> 75 THEN
    RAISE EXCEPTION 'TEST FAIL — % tipos sembrados, se esperaban 75 (¿corriste el parser?)', v_types;
  END IF;
  IF v_grants <> 462 THEN
    RAISE EXCEPTION 'TEST FAIL — % concesiones, se esperaban 462', v_grants;
  END IF;
  IF v_roles <> 23 THEN
    RAISE EXCEPTION 'TEST FAIL — % roles con notificaciones, se esperaban los 23', v_roles;
  END IF;
  RAISE NOTICE 'PASS — seed converge a la matriz: 75 tipos, 462 concesiones, 23 roles';

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

  -- 1.e Tipo inactivo: sembrado pero no entregable. Se desactiva uno de verdad dentro de la
  -- transaccion (que hace ROLLBACK) en vez de depender de que el catalogo tenga alguno: el
  -- unico que habia, `??.sqr.pendiente`, se retiro al cerrar D-11.
  UPDATE public.notification_types SET is_active = false
   WHERE type_key = 'engagement.deleted';
  v_id := public.notify_staff('engagement.deleted',
                              '59f00000-0000-4000-8000-000000000002', NULL, '{}'::jsonb);
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL — un tipo con is_active=false entregó una notificación';
  END IF;
  UPDATE public.notification_types SET is_active = true
   WHERE type_key = 'engagement.deleted';
  RAISE NOTICE 'PASS — un tipo inactivo está en el catálogo pero no entrega';

  -- 1.e.2 EL ENLACE SE APAGA CUANDO LA PANTALLA LE QUEDA CERRADA.
  --
  -- El correo no tiene sesion contra la cual chequear permisos: lo arma un cron, horas despues
  -- y para otra persona. El unico momento con el rol del destinatario a la vista es este, asi
  -- que notify_staff marca el payload y `rutas.ts` obedece. Sin eso, el boton llevaba a "Sin
  -- acceso" a pantalla completa.
  --
  -- El manager SI tiene work_order.read, asi que su aviso sale con enlace.
  v_id := public.notify_staff('wo.rejected_partner',
                              '59f00000-0000-4000-8000-000000000002', 'wo-1', '{}'::jsonb);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL — el fixture del enlace no se creo';
  END IF;
  IF (SELECT payload ? 'sin_ruta' FROM public.notifications WHERE notification_id = v_id) THEN
    RAISE EXCEPTION 'TEST FAIL — se apago el enlace de un rol que SI puede abrir la pantalla';
  END IF;

  -- Seguridad TI NO lo tiene, y la matriz de notificaciones igual le da avisos de OT.
  INSERT INTO public.notification_role_types (role_key, type_key, scope_key)
  VALUES ('it_security_manager', 'wo.rejected_partner', 'firm')
  ON CONFLICT DO NOTHING;

  v_id := public.notify_staff('wo.rejected_partner',
                              '59f00000-0000-4000-8000-00000000000c', 'wo-1', '{}'::jsonb);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL — el aviso no se emitio; sin fila no hay enlace que medir';
  END IF;
  IF (SELECT payload->>'sin_ruta' FROM public.notifications WHERE notification_id = v_id)
     IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'TEST FAIL — no se apago el enlace de un rol sin work_order.read';
  END IF;
  RAISE NOTICE 'PASS — el enlace se apaga solo para quien no puede abrir la pantalla destino';

  -- Y se apaga el ENLACE, no el aviso: que no pueda abrir la pantalla no significa que el hecho
  -- no le importe. La fila existe, con su payload.
  DELETE FROM public.notification_role_types
   WHERE role_key = 'it_security_manager' AND type_key = 'wo.rejected_partner';
  DELETE FROM public.notifications WHERE entity_id = 'wo-1';

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
DECLARE v_res jsonb; v_marked int; v_n int;
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

  -- Un tipo que el operador desactiva sale de la bandeja Y del badge, y con el mismo filtro.
  -- Contar las no leídas aparte dejaba la campana con un número que el usuario no podía bajar:
  -- no hay fila que abrir ni que marcar leída.
  UPDATE public.notification_types SET is_active = false WHERE type_key = 'wo.rejected_partner';
  v_res := public.get_my_notifications();
  IF jsonb_array_length(v_res->'events') <> 0 OR (v_res->>'unread_count')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL — un tipo desactivado deja % eventos y unread_count = %',
      jsonb_array_length(v_res->'events'), v_res->>'unread_count';
  END IF;
  UPDATE public.notification_types SET is_active = true WHERE type_key = 'wo.rejected_partner';
  RAISE NOTICE 'PASS — desactivar un tipo lo saca de la bandeja y del badge a la vez';

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

  -- Una cola mas grande que el limite DRENA en vez de trancarse.
  --
  -- El panel pide 50 y marca leidas al cerrar las que recibio. Ordenando la ventana solo por
  -- fecha, un usuario con mas de 50 sin leer recibia siempre las 50 mas nuevas: las marcaba
  -- leidas, y la carga siguiente volvia a traer esas mismas —que siguen siendo las mas nuevas—.
  -- Las viejas sin leer no entraban nunca, no se marcaban nunca, y el badge no bajaba.
  DELETE FROM public.notifications;
  INSERT INTO public.notifications (recipient_staff_id, type_key, created_at)
  SELECT '59f00000-0000-4000-8000-000000000002', 'wo.rejected_partner',
         now() - make_interval(mins => n)
    FROM generate_series(1, 8) n;

  -- Limite de 5 sobre 8 sin leer: entran las 5 mas nuevas.
  v_res := public.get_my_notifications(5);
  IF jsonb_array_length(v_res->'events') <> 5 OR (v_res->>'unread_count')::int <> 8 THEN
    RAISE EXCEPTION 'TEST FAIL — la primera tanda dio % eventos y unread=%',
      jsonb_array_length(v_res->'events'), v_res->>'unread_count';
  END IF;

  -- El panel las marca al cerrar.
  v_marked := public.mark_notifications_read(
    ARRAY(SELECT (ev->>'notification_id')::uuid
            FROM jsonb_array_elements(v_res->'events') ev));
  IF v_marked <> 5 THEN
    RAISE EXCEPTION 'TEST FAIL — se marcaron % de 5', v_marked;
  END IF;

  -- LA ASERCION QUE IMPORTA: la tanda siguiente trae las 3 que faltaban, no las mismas 5.
  v_res := public.get_my_notifications(5);
  IF (v_res->>'unread_count')::int <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL — quedaron % sin leer, se esperaban 3', v_res->>'unread_count';
  END IF;
  SELECT COUNT(*) INTO v_n
    FROM jsonb_array_elements(v_res->'events') ev
   WHERE ev->>'read_at' IS NULL;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL — la segunda tanda trajo % sin leer, se esperaban 3', v_n;
  END IF;

  -- Y al marcarlas, el badge llega a cero: la cola drena entera.
  PERFORM public.mark_notifications_read(
    ARRAY(SELECT (ev->>'notification_id')::uuid
            FROM jsonb_array_elements(v_res->'events') ev));
  IF (public.get_my_notifications(5)->>'unread_count')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL — el badge no llego a cero con la cola drenada';
  END IF;
  RAISE NOTICE 'PASS — una cola mayor que el limite drena en vez de dejar el badge trancado';

  -- La lista sigue saliendo por fecha: lo no leido prioriza QUE entra, no en que orden se ve.
  DELETE FROM public.notifications;
  INSERT INTO public.notifications (recipient_staff_id, type_key, created_at, read_at) VALUES
    ('59f00000-0000-4000-8000-000000000002', 'wo.rejected_partner', now() - interval '1 min', now()),
    ('59f00000-0000-4000-8000-000000000002', 'wo.rejected_partner', now() - interval '9 min', NULL);
  v_res := public.get_my_notifications(50);
  IF (v_res->'events'->0->>'read_at') IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL — la mas nueva dejo de encabezar la lista';
  END IF;
  RAISE NOTICE 'PASS — priorizar lo no leido no reordena la lista que ve el usuario';

  DELETE FROM public.notifications;
END $$;

-- ── Grupo 3 — contadores: gateo por rol y el motivo del SECURITY DEFINER ────
DO $$
DECLARE v_agg jsonb; v_cots jsonb; v_visible int;
BEGIN
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000001');  -- assistant

  -- El caso que justifica todo el diseño: el assistant NO tiene engagement.read, así que
  -- un SELECT directo a engagements no le devuelve nada...
  --
  -- DOS COSAS QUE HAY QUE FORZAR PARA QUE ESTE CHEQUEO SIGNIFIQUE ALGO, y las dos son del
  -- entorno, no del diseño:
  --   1. `SET LOCAL ROLE authenticated` — RLS no se evalúa para el dueño de las tablas, que
  --      es con quien corre el harness (y el SQL Editor del proyecto). Se baja sólo acá y se
  --      vuelve enseguida: el resto de la suite escribe fixtures y necesita al dueño.
  --   2. `ENABLE ROW LEVEL SECURITY` — `engagements` es una de las 18 tablas que quedaron con
  --      RLS APAGADO por el drift de `20260115000154` (docs/hallazgo-rls-drift-ruta-a.md):
  --      tiene políticas y no las aplica. En una base con el drift, el SELECT devuelve la
  --      fila y esta aserción acusaba un cambio de premisa que no existía. Se enciende dentro
  --      de la transacción —que termina en ROLLBACK—, así que en un entorno ya arreglado es
  --      un no-op y en uno con drift prueba lo que dice probar.
  ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
  SET LOCAL ROLE authenticated;
  SELECT COUNT(*) INTO v_visible FROM public.engagements
   WHERE engagement_id = 'e9f00000-0000-4000-8000-000000000001';
  RESET ROLE;
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

-- ── Grupo 3b — el SECURITY DEFINER no es un endpoint público ────────────────
--
-- El Grupo 3 prueba que el helper VE lo que la RLS le esconde al usuario. Este prueba lo
-- otro: que el usuario no puede llamarlo. Las dos mitades juntas son el diseño; sólo la
-- primera es una fuga, y fue exactamente el estado del módulo hasta este PR:
-- `engagement_approval_bucket` contestaba código y nombre de encargo a cualquiera que
-- mandara un staff_id ajeno por /rest/v1/rpc/ con la anon key.
--
-- Se mira `has_function_privilege` y no se intenta la llamada: el harness corre como DUEÑO
-- de las funciones, así que un `SELECT engagement_approval_bucket(...)` acá pasaría siempre
-- y no probaría nada. El privilegio del rol es el dato, no el resultado de la llamada.
DO $$
DECLARE
  r record;
  v_abiertos text;
BEGIN
  -- Ningún helper del módulo puede ser ejecutado por el cliente. El barrido es por catálogo
  -- a propósito: una lista escrita a mano no atrapa el contador que alguien agregue mañana,
  -- que es justo como nació este bug.
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
    INTO v_abiertos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND p.prorettype <> 'pg_catalog.trigger'::regtype
     AND (p.proname LIKE 'notif\_%' OR p.proname = 'engagement_approval_bucket')
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('anon', p.oid, 'EXECUTE'));

  IF v_abiertos IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL — helpers ejecutables desde el cliente (PostgREST los publica): %',
      v_abiertos;
  END IF;
  RAISE NOTICE 'PASS — ningún helper del módulo es ejecutable por anon ni authenticated';

  -- El caso nombrado, aparte del barrido: es el que filtraba nombres de encargo y el que hay
  -- que ver fallar si alguien recrea la función sin el REVOKE.
  IF has_function_privilege('authenticated', 'public.engagement_approval_bucket(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST FAIL — engagement_approval_bucket volvió a quedar expuesta a authenticated';
  END IF;
  RAISE NOTICE 'PASS — engagement_approval_bucket cerrada';

  -- El reverso: cerrar de más deja el panel en blanco, y eso no lo acusa ninguna de las
  -- aserciones de arriba porque el harness corre como dueño.
  FOR r IN
    SELECT unnest(ARRAY[
      'public.get_my_notifications(integer)',
      'public.get_my_notification_aggregates()',
      'public.mark_notifications_read(uuid[])',
      'public.dismiss_notifications(uuid[])'
    ]) AS firma
  LOOP
    IF NOT has_function_privilege('authenticated', r.firma, 'EXECUTE') THEN
      RAISE EXCEPTION 'TEST FAIL — % quedó sin EXECUTE para authenticated: el panel no carga',
        r.firma;
    END IF;
    -- Sin sesión no hay bandeja: las cuatro derivan el staff de get_my_staff_id().
    IF has_function_privilege('anon', r.firma, 'EXECUTE') THEN
      RAISE EXCEPTION 'TEST FAIL — % ejecutable por anon', r.firma;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — las 4 RPC del panel abiertas a authenticated y cerradas a anon';
END $$;

-- ── Grupo 4 — la ventana de alarmas es configurable ─────────────────────────
DO $$
DECLARE v_agg jsonb; v_before int; v_after int; v_dia int;
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

  -- Y una fecha de arranque que NO cae lunes se adelanta al lunes siguiente.
  --
  -- Sin eso el recorte es de mentira: get_week_statuses() rebobina lo que recibe al lunes de esa
  -- semana y despues solo clampea contra hire/termination, asi que una fecha de mitad de semana
  -- deja entrar la semana ENTERA — y la alarma reclama horas de los dias anteriores a que la
  -- firma cargara en EMS, que es justo lo que este ajuste existe para evitar.
  FOR v_dia IN 0..6 LOOP
    -- Un dia de cada ISODOW, sobre una semana fija para que la prueba no dependa de hoy.
    UPDATE public.global_settings
       SET setting_value = to_char(DATE '2026-09-14' + v_dia, 'YYYY-MM-DD')
     WHERE setting_key = 'TS_TRACKING_START_DATE';

    IF EXTRACT(ISODOW FROM public.notif_timesheet_window_start())::int <> 1 THEN
      RAISE EXCEPTION 'TEST FAIL - con arranque % la ventana empieza en ISODOW %, y no en lunes',
        DATE '2026-09-14' + v_dia,
        EXTRACT(ISODOW FROM public.notif_timesheet_window_start())::int;
    END IF;
  END LOOP;

  -- Un lunes se respeta tal cual: adelantarlo se comeria una semana entera de alarmas.
  UPDATE public.global_settings SET setting_value = '2026-09-14'   -- lunes
   WHERE setting_key = 'TS_TRACKING_START_DATE';
  IF public.notif_timesheet_window_start() <> DATE '2026-09-14' THEN
    RAISE EXCEPTION 'TEST FAIL - un lunes se movio a %', public.notif_timesheet_window_start();
  END IF;

  -- Y el martes siguiente cae en el lunes de la semana QUE VIENE, no en el de la suya.
  UPDATE public.global_settings SET setting_value = '2026-09-15'   -- martes
   WHERE setting_key = 'TS_TRACKING_START_DATE';
  IF public.notif_timesheet_window_start() <> DATE '2026-09-21' THEN
    RAISE EXCEPTION 'TEST FAIL - el martes 15 se resolvio a % y no al lunes 21',
      public.notif_timesheet_window_start();
  END IF;
  RAISE NOTICE 'PASS - una fecha de arranque a mitad de semana se adelanta al lunes siguiente';

  -- Los settings vuelven a como los dejaba este grupo antes de estas aserciones: los que siguen
  -- cuentan con ese estado, y una fecha del 2000 no recorta nada caiga el dia que caiga.
  UPDATE public.global_settings SET setting_value = '2000-01-01'
   WHERE setting_key = 'TS_TRACKING_START_DATE';
  UPDATE public.global_settings SET setting_value = '1'
   WHERE setting_key = 'TS_ALERT_WINDOW_WEEKS';
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
  v_prev int;
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
  --
  -- Estas tres columnas las gatea `fr_guard_accounting_cols`, que exige
  -- `fund_disbursement.update` / `expense_settlement.update`: hay que ponerse en la piel de
  -- Contabilidad para escribirlas, igual que en la aplicacion. Sin esto el harness moria con
  -- "Solo contabilidad (desembolso) puede modificar estos campos" — el guard funcionando,
  -- no un bug de notificaciones.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000003');  -- accounting_manager

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
  -- Se compara ANTES contra DESPUES en vez de fijar un numero: el cierre le llega al
  -- solicitante Y a los gerentes de sus OT (OBS 2026-09-09, "cierre del circulo"), asi que
  -- el total depende de la audiencia. Lo que se prueba aca es que no CREZCA.
  SELECT COUNT(*) INTO v_prev FROM public.notifications
   WHERE type_key = 'fund.request.closed';
  UPDATE public.fund_requests SET closed_at = now() WHERE fund_request_id = v_fr;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'fund.request.closed';
  IF v_n <> v_prev THEN
    RAISE EXCEPTION 'TEST FAIL - re-guardar duplico la notificacion de cierre (% -> %)', v_prev, v_n;
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

  -- 5.g Los contadores del area de Contabilidad siguen el estado real, no el historial.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000003');

  -- La solicitud de este grupo quedo CERRADA, y "por cerrar" mide lo contrario (liquidada y
  -- sin cerrar): con el cierre puesto el contador tiene que estar en cero. La version
  -- anterior de esta asercion pedia >= 1 sobre una solicitud ya cerrada, que es justo lo que
  -- el contador NO debe contar.
  IF (public.get_my_notification_aggregates()->'fund.request.closure_pending'->>'count')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - una solicitud ya cerrada sigue contando como "por cerrar"';
  END IF;

  -- Y al reabrirla —lo que hace Contabilidad si se cerro por error— vuelve a aparecer.
  UPDATE public.fund_requests SET closed_at = NULL WHERE fund_request_id = v_fr;
  IF (public.get_my_notification_aggregates()->'fund.request.closure_pending'->>'count')::int < 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la solicitud liquidada y SIN cerrar no aparece en closure_pending';
  END IF;
  RAISE NOTICE 'PASS - el contador de cierres pendientes de Contabilidad sigue el estado real';
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
  v_acan  uuid := '59f00000-0000-4000-8000-000000000007';  -- accounting_analyst (id propio: el ...004 ya es S_PARTNER)
BEGIN
  -- Un Analista de Contabilidad, que el fixture base no tiene.
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    VALUES ('a9f00000-0000-4000-8000-000000000007',
            '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'notif-test-7@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  INSERT INTO public.user_roles (user_id, role, role_key)
  VALUES ('a9f00000-0000-4000-8000-000000000007', 'senior', 'accounting_analyst')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                            practica_id, society_id, weekly_capacity_hours, hire_date, city)
  VALUES (v_acan, 'a9f00000-0000-4000-8000-000000000007', 'NOTIF', 'AcAnalyst', true,
          (SELECT practica_id FROM public.practicas WHERE code = 1),
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz');

  -- Los fixtures se cargan SIN sesion, igual que los del arranque del archivo: los guards de
  -- `engagements` (enforce_engagement_profile_scope) y de fondos exigen permisos en cuanto
  -- hay `auth.uid()`, y el grupo anterior dejo puesto al Gerente de Contabilidad. Sin
  -- sesion equivale a service_role, que es como los crea el seed.
  PERFORM set_config('request.jwt.claims', '', true);

  -- Encargo propio del grupo: `work_orders` es UNIQUE por engagement_id y el Grupo 5 ya le
  -- puso una OT a E_ONE. Mismo gerente (S_MGR), que es quien tiene que recibir todo esto.
  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                  manager_id, created_by_staff_id, fecha_cierre, society_id)
  VALUES ('e9f00000-0000-4000-8000-000000000004', 'c9f00000-0000-4000-8000-000000000001',
          'NOTIF Encargo Cuatro', '9F04',
          '59f00000-0000-4000-8000-000000000002',
          '59f00000-0000-4000-8000-000000000002', '2026-12-31',
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

  INSERT INTO public.work_orders (engagement_id, currency, season_mode, approval_status)
  VALUES ('e9f00000-0000-4000-8000-000000000004', 'BOB', 'High', 'Approved')
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

  -- Piso limpio para este grupo (mismo patron que el Grupo 10): sus aserciones cuentan por
  -- tipo + destinatario sobre TODA la tabla, y el Grupo 5 ya le dejo al mismo gerente un
  -- `fund.expense.submitted_for_approval` de su propio gasto. Sin esto, "no notifico de
  -- mas" fallaba contando la fila de otro grupo.
  DELETE FROM public.notifications;

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
  --
  -- El gasto rechazado NO salta directo a revisado: `fre_validate_transition` solo admite
  -- rechazado -> pendiente_aprobacion (el solicitante corrige y reenvia) -> aprobado_gerente
  -- -> revisado_asistente. Se recorre el camino legal, que es tambien el real.
  UPDATE public.fund_request_expenses SET status = 'pendiente_aprobacion' WHERE fre_id = v_e2;
  UPDATE public.fund_request_expenses SET status = 'aprobado_gerente'     WHERE fre_id = v_e2;
  UPDATE public.fund_request_expenses SET status = 'revisado_asistente'   WHERE fre_id = v_e2;

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
  v_desc uuid;
  c_risk constant uuid := '59f00000-0000-4000-8000-000000000005';  -- S_RISK (risk_supervisor)
  c_rpart constant uuid := '59f00000-0000-4000-8000-000000000008'; -- S_RPART (risk_partner)
BEGIN
  -- Toda la pista de Riesgos esta gateada por `wo_guard_risk_approval` (can_approve_wo_risk):
  -- escribir `risk_status`, `risk_approved_by` o las firmas de emergencia exige una sesion
  -- autorizada. Se impersona al ADMIN, que pasa el guard y es ademas quien revierte
  -- aprobaciones (8.f). Sin esto el harness moria en 8.c con "Solo un aprobador de Riesgos
  -- autorizado puede aprobar o rechazar la seccion de Riesgos de esta OT" — el guard
  -- funcionando, no un bug de notificaciones.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000006');  -- S_ADMIN

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

  -- 8.h Emergencia: paso 1 al SOCIO de Riesgos, paso 2 (que enciende el plazo) al Gerente.
  -- El paso 1 es el unico evento del modulo que la matriz le da SOLO a `risk_partner` (el
  -- Supervisor no lo tiene): es el aviso de "falta tu firma", y quien firma el paso 2 es el
  -- Socio. Por eso se verifica sobre c_rpart y no sobre c_risk.
  UPDATE public.work_orders SET emergency_review_by = c_risk, emergency_review_at = now()
   WHERE wo_id = v_wo;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.emergency.step1_done' AND recipient_staff_id = c_rpart;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el Socio de Riesgos no recibio wo.emergency.step1_done';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.emergency.step1_done' AND recipient_staff_id = c_risk;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el Supervisor de Riesgos recibio un aviso que la matriz no le da';
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

  -- 8.j LA REGRESION: descartar el aviso no puede hacer que el cron lo repita.
  --
  -- Los emisores deduplican con NOT EXISTS sobre public.notifications, o sea que la fila es a
  -- la vez el aviso Y el registro de que ya salio. Mientras dismiss_notifications() la BORRABA,
  -- apretar la "x" borraba tambien el registro y el cron del dia siguiente lo volvia a crear,
  -- con un correo nuevo detras (dedupe_key = notification_id, y el recreado tiene otro).
  --
  -- wo.emergency.deadline_passed es el caso que no perdona: su condicion (deadline < hoy) no se
  -- apaga sola nunca, asi que el aviso volvia todos los dias para siempre.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000005');  -- S_RISK
  SELECT notification_id INTO v_desc FROM public.notifications
   WHERE type_key = 'wo.emergency.deadline_passed' AND recipient_staff_id = c_risk;
  IF public.dismiss_notifications(ARRAY[v_desc]) <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el dueno no pudo descartar su propio aviso';
  END IF;

  -- Sale de la bandeja. Se busca ESE aviso y no se exige una bandeja vacia: a esta altura del
  -- grupo el Supervisor de Riesgos ya acumulo otros avisos del flujo de la OT.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.get_my_notifications(50)->'events') ev
     WHERE ev->>'notification_id' = v_desc::text
  ) THEN
    RAISE EXCEPTION 'TEST FAIL - el aviso descartado sigue en la bandeja';
  END IF;

  -- ...pero la fila sobrevive como registro de emision.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE notification_id = v_desc AND dismissed_at IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la fila descartada se borro: el registro de emision no sobrevive';
  END IF;

  -- Y por eso el cron NO lo repite. Esta es la asercion que fallaba antes del arreglo.
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM public.notif_wo_daily_scheduled();
  PERFORM public.notif_wo_daily_scheduled();
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'wo.emergency.deadline_passed' AND recipient_staff_id = c_risk;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el cron recreo el aviso descartado (hay % filas)', v_n;
  END IF;

  -- Y tampoco encolo un correo nuevo: sin fila nueva no hay notification_id nuevo, que es de
  -- donde salia el dedupe_key duplicado.
  SELECT COUNT(*) INTO v_n FROM public.notification_emails
   WHERE type_key = 'wo.emergency.deadline_passed' AND recipient_staff_id = c_risk;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el aviso descartado volvio a encolar correo (% filas)', v_n;
  END IF;
  RAISE NOTICE 'PASS - descartar un aviso no hace que el cron lo repita al dia siguiente';
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
  -- Encargo propio, con Socio y Gerente: `work_orders` es UNIQUE por engagement_id y el
  -- Grupo 8 ya le puso su OT a E_TWO. Sin sesion, como el resto de los fixtures (el guard
  -- de `engagements` exige engagement.create en cuanto hay auth.uid()).
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                  partner_id, manager_id, created_by_staff_id, fecha_cierre,
                                  society_id)
  VALUES ('e9f00000-0000-4000-8000-000000000005', 'c9f00000-0000-4000-8000-000000000001',
          'NOTIF Encargo Cinco', '9F05', c_part, c_mgr, c_mgr, '2026-12-31',
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

  INSERT INTO public.work_orders (engagement_id, currency, season_mode, approval_status)
  VALUES ('e9f00000-0000-4000-8000-000000000005', 'BOB', 'High', 'Draft')
  RETURNING wo_id INTO v_wo;

  -- El plan de pagos SI necesita sesion, al reves que el resto de los fixtures: la rama
  -- 0722-156b agrego trg_wo_payment_plan_guard_exchange_rate, que exige ser el gerente del
  -- encargo o admin para crearlo (EXCHANGE_RATE_FORBIDDEN). Sin sesion, is_admin() y
  -- get_my_staff_id() son falsos los dos y el INSERT se rechaza.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000002');  -- S_MGR, gerente de E_FIVE

  INSERT INTO public.wo_payment_plan (wo_id, payment_days)
  VALUES (v_wo, 30) RETURNING plan_id INTO v_plan;

  -- De vuelta sin sesion: las cuotas y el resto del grupo se cargan como el resto de los
  -- fixtures, y el contador de mora se mide sin que auth.uid() lo filtre.
  PERFORM set_config('request.jwt.claims', '', true);

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
  --
  -- La OT pasa a 'Approved' antes: la rama 0722-156b agrego INSTALLMENT_LOCKED, que exige la
  -- orden aprobada para mover el estado de una cuota. Se escribe SOLO approval_status y no
  -- approved_at, asi que notify_work_order_events no emite nada por este UPDATE — ninguna de
  -- sus condiciones mira ese salto (Draft/Pending_Approval -> Approved sin firma).
  UPDATE public.work_orders SET approval_status = 'Approved' WHERE wo_id = v_wo;

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
  v_prev int;
  c_part constant uuid := '59f00000-0000-4000-8000-000000000004';
  c_mgr  constant uuid := '59f00000-0000-4000-8000-000000000002';
  -- El Encargado tiene que ser un SENIOR: `engagement.encargado_assigned` no llega a un
  -- Asistente (la matriz se lo da a Senior y Semi Senior, D-02). Con S_ASSIST aca, la
  -- asercion del alta no podia pasar nunca.
  c_sen  constant uuid := '59f00000-0000-4000-8000-00000000000b';  -- S_SENIOR (senior)
  -- El STAFFING lo lleva otra persona (el Asistente): el Encargado es uno de los 6 cargos
  -- del encargo, asi que recibe la finalizacion por conduccion y no por staffing. Con la
  -- misma persona en los dos papeles, "un staffing borrado no recibe la finalizacion" era
  -- imposible de probar.
  c_stf  constant uuid := '59f00000-0000-4000-8000-000000000001';  -- S_ASSIST (assistant)
  c_adm  constant uuid := '59f00000-0000-4000-8000-000000000006';
BEGIN
  DELETE FROM public.notifications;

  -- 10.a Alta con Socio, Gerente y Encargado ya elegidos.
  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                  partner_id, manager_id, encargado_id, created_by_staff_id,
                                  fecha_cierre, society_id)
  VALUES (v_eng, 'c9f00000-0000-4000-8000-000000000001', 'NOTIF Encargo Tres', '9F03',
          c_part, c_mgr, c_sen, c_mgr, '2026-12-31',
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

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

  -- Un UPDATE que no toca ningun responsable no vuelve a avisar. Se compara ANTES contra
  -- DESPUES: el cambio de responsables avisa al Admin (auditoria) Y a la conduccion
  -- resultante, asi que el total depende de la audiencia y fijarlo en 1 era contar de menos.
  SELECT COUNT(*) INTO v_prev FROM public.notifications
   WHERE type_key = 'engagement.owners.changed';
  UPDATE public.engagements SET engagement_name = 'NOTIF Encargo Tres bis'
   WHERE engagement_id = v_eng;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.owners.changed';
  IF v_n <> v_prev THEN
    RAISE EXCEPTION 'TEST FAIL - renombrar el encargo conto como cambio de responsables (% -> %)', v_prev, v_n;
  END IF;
  RAISE NOTICE 'PASS - renombrar el encargo no es un cambio de responsables';

  -- 10.c Staffing: el afectado y su gerente reciben el MISMO tipo con distinta redaccion.
  INSERT INTO public.engagement_assignments (engagement_id, staff_id, category_id,
                                             start_date, end_date, status)
  VALUES (v_eng, c_stf, (SELECT category_id FROM public.categories LIMIT 1),
          CURRENT_DATE, CURRENT_DATE + 30, 'CONFIRMED')
  RETURNING assignment_id INTO v_asg;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.staffing.changed' AND recipient_staff_id = c_stf
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
   WHERE type_key = 'engagement.staffing.changed' AND recipient_staff_id = c_stf
     AND payload->>'context' = 'unassigned';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la baja logica no aviso al desasignado (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el borrado logico cuenta como desasignacion';

  -- Y los cambios de fechas/horas NO avisan: el Scheduler los reescribe seguido.
  UPDATE public.engagement_assignments SET hours_per_week = 20 WHERE assignment_id = v_asg;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.staffing.changed' AND recipient_staff_id = c_stf;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - cambiar las horas de la asignacion notifico (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - mover horas o fechas de la asignacion no avisa';

  -- 10.e Finalizacion: baja hasta el staffing VIGENTE. La asignacion de arriba quedo borrada,
  -- asi que el staffing NO debe recibirla; se le devuelve la asignacion para comprobar que
  -- con staffing vivo si le llega.
  UPDATE public.engagements SET engagement_state_override = 7 WHERE engagement_id = v_eng;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.finalized' AND recipient_staff_id = c_stf;
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
   WHERE type_key = 'engagement.finalized' AND recipient_staff_id = c_stf;
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
   WHERE type_key = 'engagement.deleted' AND recipient_staff_id IN (c_part, c_mgr, c_sen, c_stf);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el borrado del encargo aviso a alguien fuera de auditoria';
  END IF;
  RAISE NOTICE 'PASS - el borrado del encargo es solo auditoria del Admin';

END $$;

-- -- Grupo 11 -- FASE 3.d: envio de boleta y veredictos sobre sus lineas -------
-- Las cuatro cosas que este grupo fija, y que son las que costaban un bug:
--   1. UN envio, TRES audiencias disjuntas: dueno / aprobador / conduccion (D-12);
--   2. la AUTOAPROBACION no notifica: `approved_by` = el dueno (D-30);
--   3. `rejected -> pending` (reenvio) NO es una solicitud de revision; `approved -> pending`
--      si lo es (D-33);
--   4. el retiro de la boleta es asunto del dueno y de nadie mas.
DO $$
DECLARE
  v_eng    uuid := 'e9f00000-0000-4000-8000-000000000006';
  v_per    uuid := '79f00000-0000-4000-8000-0000000000f2';
  v_appr   uuid;
  v_week   date := date_trunc('week', CURRENT_DATE)::date - 7;
  v_n      int;
  v_prev   int;
  c_own  constant uuid := '59f00000-0000-4000-8000-00000000000b';  -- S_SENIOR, dueno de la boleta
  c_part constant uuid := '59f00000-0000-4000-8000-000000000004';  -- S_PARTNER (conduccion)
  c_mgr  constant uuid := '59f00000-0000-4000-8000-000000000002';  -- S_MGR (aprobador real)
  c_act  constant uuid := '79f00000-0000-4000-8000-000000000001';
BEGIN
  -- Fixtures sin sesion, como el resto del archivo.
  PERFORM set_config('request.jwt.claims', '', true);

  -- Encargo propio con Socio Y Gerente: el reparto del envio se juega justamente entre esos
  -- dos papeles. `work_order_required = false` para que `check_wo_approved` deje cargar
  -- horas sin una OT aprobada, que no es lo que se prueba aca.
  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                  partner_id, manager_id, created_by_staff_id, fecha_cierre,
                                  society_id, work_order_required)
  VALUES (v_eng, 'c9f00000-0000-4000-8000-000000000001', 'NOTIF Encargo Seis', '9F06',
          c_part, c_mgr, c_mgr, '2026-12-31',
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1), false);

  -- El feriado se limpia para esta fecha: `enforce_holiday_blocking` manda las horas de un
  -- feriado al encargo de feriados, y aca se necesita una hora comun. La transaccion termina
  -- en ROLLBACK, asi que no toca los feriados de nadie.
  DELETE FROM public.holidays WHERE holiday_date = v_week + 1;

  INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number,
                                        year, total_hours)
  VALUES (v_per, c_own, v_week, 2, 2026, 40);

  INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked,
                                   hours_logged, period_id, is_forecast)
  VALUES (c_own, v_eng, c_act, v_week + 1, 8, v_per, false);

  DELETE FROM public.notifications;

  -- 11.a Envio: el dueno recibe SU acuse, con el contexto del envio.
  UPDATE public.timesheet_periods SET submitted_at = now() WHERE period_id = v_per;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'timesheet.own_submit_confirmed' AND recipient_staff_id = c_own
     AND payload->>'context' = 'submitted';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el dueno no recibio el acuse de su envio (hubo %)', v_n;
  END IF;

  -- El aprobador REAL (get_timesheet_approvers: gerente del encargo CON
  -- timesheet_approval.approve) recibe el aviso accionable.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'timesheet.team_submitted_for_approval' AND recipient_staff_id = c_mgr;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el aprobador no recibio la boleta enviada (hubo %)', v_n;
  END IF;

  -- Y el Socio —conduccion del encargo, pero sin permiso de aprobar horas— recibe el
  -- informativo. Es el alcance `assigned` que reemplazo al `firm` de la matriz (D-12).
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'timesheet.weekly_submitted' AND recipient_staff_id = c_part
     AND payload->>'staff_name' <> '';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el Socio no recibio el informativo de envio (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - un envio reparte tres avisos distintos: dueno, aprobador y conduccion';

  -- Nadie recibe DOS filas por el mismo envio: al aprobador no le llega el informativo, y al
  -- dueno tampoco (su celda `propio` salio de la matriz al cerrar D-12).
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'timesheet.weekly_submitted'
     AND recipient_staff_id IN (c_mgr, c_own);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el informativo se solapo con el acuse o con la aprobacion (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE recipient_staff_id = c_own;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el dueno recibio % filas por un solo envio', v_n;
  END IF;
  RAISE NOTICE 'PASS - un envio deja como maximo UNA fila por persona';

  -- 11.b Un UPDATE que no toca `submitted_at` no vuelve a avisar.
  SELECT COUNT(*) INTO v_prev FROM public.notifications;
  UPDATE public.timesheet_periods SET total_hours = 41 WHERE period_id = v_per;
  SELECT COUNT(*) INTO v_n FROM public.notifications;
  IF v_n <> v_prev THEN
    RAISE EXCEPTION 'TEST FAIL - tocar las horas del periodo notifico (% -> %)', v_prev, v_n;
  END IF;
  RAISE NOTICE 'PASS - guardar el periodo sin enviarlo no avisa';

  -- 11.c AUTOAPROBACION (D-30): la linea nace aprobada y firmada por el propio dueno, como
  -- la escribe submit_timesheet_safe en un encargo sin aprobacion. No debe avisar nada.
  INSERT INTO public.timesheet_line_approvals (period_id, engagement_id, activity_id, status,
                                               approved_by, approved_at)
  VALUES (v_per, v_eng, c_act, 'approved', c_own, now())
  RETURNING approval_id INTO v_appr;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'approval.line_approved' AND recipient_staff_id = c_own;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - la autoaprobacion aviso al dueno (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - la autoaprobacion no notifica: approved_by es el propio dueno';

  -- 11.d Solicitud de revision (D-33): approved -> pending, con la nota.
  UPDATE public.timesheet_line_approvals
     SET status = 'pending', approved_by = NULL, approved_at = NULL,
         review_notes = 'corregi las horas del jueves'
   WHERE approval_id = v_appr;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'approval.revision_requested' AND recipient_staff_id = c_own
     AND payload->>'notes' = 'corregi las horas del jueves'
     AND payload->>'engagement_code' = '9F06'
     AND payload->>'activity_code' <> '';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la solicitud de revision no llego con nota, COT y actividad (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - approved -> pending es solicitud de revision, con la nota en el payload';

  -- 11.e Rechazo: al dueno, con el motivo.
  UPDATE public.timesheet_line_approvals
     SET status = 'rejected', approved_by = c_mgr, approved_at = now(),
         review_notes = 'faltan detalles'
   WHERE approval_id = v_appr;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'approval.line_rejected' AND recipient_staff_id = c_own
     AND payload->>'notes' = 'faltan detalles'
     AND payload->>'reviewer' <> '';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el rechazo no llego al dueno con motivo y revisor (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el rechazo de una linea llega al dueno con el motivo y quien la reviso';

  -- 11.f REENVIO tras corregir (D-33): rejected -> pending es lo que hace
  -- submit_timesheet_safe, y NO es una solicitud de revision.
  SELECT COUNT(*) INTO v_prev FROM public.notifications
   WHERE type_key = 'approval.revision_requested';
  UPDATE public.timesheet_line_approvals
     SET status = 'pending', approved_by = NULL, approved_at = NULL, review_notes = NULL
   WHERE approval_id = v_appr;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'approval.revision_requested';
  IF v_n <> v_prev THEN
    RAISE EXCEPTION 'TEST FAIL - el reenvio tras corregir conto como revision (% -> %)', v_prev, v_n;
  END IF;
  RAISE NOTICE 'PASS - rejected -> pending es el reenvio del usuario, no una revision';

  -- 11.g Aprobacion de verdad: la firma OTRA persona.
  UPDATE public.timesheet_line_approvals
     SET status = 'approved', approved_by = c_mgr, approved_at = now()
   WHERE approval_id = v_appr;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'approval.line_approved' AND recipient_staff_id = c_own;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la aprobacion de un tercero no aviso al dueno (hubo %)', v_n;
  END IF;
  -- Y el veredicto es solo del dueno: el aprobador no se avisa a si mismo.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key IN ('approval.line_approved','approval.line_rejected',
                      'approval.revision_requested')
     AND recipient_staff_id <> c_own;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - un veredicto de linea salio del dueno de la boleta (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el veredicto de una linea es solo para el dueno de la boleta';

  -- 11.h Retiro de la boleta: acuse al dueno con el otro contexto, y a nadie mas.
  SELECT COUNT(*) INTO v_prev FROM public.notifications
   WHERE recipient_staff_id IN (c_mgr, c_part);
  UPDATE public.timesheet_periods SET submitted_at = NULL WHERE period_id = v_per;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'timesheet.own_submit_confirmed' AND recipient_staff_id = c_own
     AND payload->>'context' = 'withdrawn';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el retiro no le aviso al dueno (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE recipient_staff_id IN (c_mgr, c_part);
  IF v_n <> v_prev THEN
    RAISE EXCEPTION 'TEST FAIL - el retiro aviso al aprobador o a la conduccion (% -> %)', v_prev, v_n;
  END IF;
  RAISE NOTICE 'PASS - el retiro es asunto del dueno: no despierta al aprobador ni a la conduccion';

  -- 11.i El porton sigue mandando: el Gerente de Contabilidad no reporta horas y no tiene
  -- ninguno de estos tipos en la matriz.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE recipient_staff_id = '59f00000-0000-4000-8000-000000000003';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - un rol fuera de la matriz recibio avisos de timesheet (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - los disparadores de tiempos respetan la matriz';
END $$;

-- -- Grupo 12 -- FASE 3.d: cierre automatico del timer y cola de capacitacion --
-- Dos hechos que no nacen de una decision humana:
--   * el cronometro que se cierra solo a las 8 h (D-32), detectado por su MARCA;
--   * el contador de capacitacion (D-31), que mide la cola de un area y no algo del usuario.
DO $$
DECLARE
  v_eng    uuid := 'e9f00000-0000-4000-8000-000000000007';
  v_per    uuid := '79f00000-0000-4000-8000-0000000000f3';
  v_timer  uuid;
  v_week   date := date_trunc('week', CURRENT_DATE)::date - 21;
  v_n      int;
  v_agg    jsonb;
  c_own  constant uuid := '59f00000-0000-4000-8000-00000000000b';  -- S_SENIOR
  c_mgr  constant uuid := '59f00000-0000-4000-8000-000000000002';  -- S_MGR
  c_hr   constant uuid := '59f00000-0000-4000-8000-00000000000a';  -- S_HR (hr_manager)
  c_act  constant uuid := '79f00000-0000-4000-8000-000000000002';
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.notifications;

  -- 12.a Cierre AUTOMATICO: `finalize_all_stale_timers()` cierra a las 8 h exactas y esa
  -- igualdad es la marca que el disparador mira. Se usa la funcion real, no un UPDATE a
  -- mano: si alguien cambia como cierra el cron, este test se cae.
  INSERT INTO public.timer_entries (staff_id, engagement_id, activity_id, started_at,
                                    description)
  VALUES (c_own, 'e9f00000-0000-4000-8000-000000000001', c_act,
          now() - interval '9 hours', 'timer olvidado')
  RETURNING timer_id INTO v_timer;

  PERFORM public.finalize_all_stale_timers();

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'tracker.timer.auto_stopped' AND recipient_staff_id = c_own
     AND entity_id = v_timer::text
     AND (payload->>'duration_minutes')::int = 480;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el cierre automatico del timer no aviso a su dueno (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el timer cerrado por el cron avisa a su dueno, con el timer en entity_id';

  -- Y es solo del dueno: nadie mas se entera de un cronometro ajeno.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'tracker.timer.auto_stopped' AND recipient_staff_id <> c_own;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el cierre del timer aviso a alguien mas (hubo %)', v_n;
  END IF;

  -- 12.b Cierre MANUAL: `stop_timer_entry` pone `now()`, que nunca cae exactamente en las
  -- 8 h, asi que no lleva la marca y no debe avisar.
  INSERT INTO public.timer_entries (staff_id, engagement_id, activity_id, started_at,
                                    description)
  VALUES (c_own, 'e9f00000-0000-4000-8000-000000000001', c_act,
          now() - interval '2 hours', 'timer cerrado a mano')
  RETURNING timer_id INTO v_timer;

  UPDATE public.timer_entries
     SET ended_at = now(), duration_minutes = 120
   WHERE timer_id = v_timer;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'tracker.timer.auto_stopped';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - un cierre manual se conto como automatico (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - cerrar el cronometro a mano no dispara el aviso de cierre automatico';

  -- 12.c El contador de capacitacion (D-31): lineas pendientes de un encargo con
  -- funcion = 2, sobre un periodo YA ENVIADO.
  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                  manager_id, created_by_staff_id, fecha_cierre, society_id,
                                  funcion, work_order_required)
  VALUES (v_eng, 'c9f00000-0000-4000-8000-000000000001', 'NOTIF Capacitacion', '9F07',
          c_mgr, c_mgr, '2026-12-31',
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 2, false);

  INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number,
                                        year, total_hours, submitted_at)
  VALUES (v_per, c_own, v_week, 3, 2026, 40, now());

  INSERT INTO public.timesheet_line_approvals (period_id, engagement_id, activity_id, status)
  VALUES (v_per, v_eng, c_act, 'pending');

  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-00000000000a');  -- Talento Humano
  v_agg := public.get_my_notification_aggregates();
  IF (v_agg->'approval.training_pending'->>'count')::int <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - Talento Humano ve % capacitaciones por aprobar, se esperaba 1',
      v_agg->'approval.training_pending'->>'count';
  END IF;
  RAISE NOTICE 'PASS - el contador de capacitacion cuenta las lineas pendientes de funcion = 2';

  -- Una linea de un encargo de CLIENTE no entra en ese contador: si entrara, Talento Humano
  -- veria la cola de aprobaciones de toda la firma.
  INSERT INTO public.timesheet_line_approvals (period_id, engagement_id, activity_id, status)
  VALUES (v_per, 'e9f00000-0000-4000-8000-000000000001', c_act, 'pending');

  v_agg := public.get_my_notification_aggregates();
  IF (v_agg->'approval.training_pending'->>'count')::int <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - una linea de encargo de cliente entro al contador de capacitacion (%)',
      v_agg->'approval.training_pending'->>'count';
  END IF;

  -- Y al retirar la boleta deja de contar: una linea pendiente de un periodo sin enviar no
  -- espera a nadie (unsubmit_timesheet_safe borra las aprobadas y deja las pendientes).
  UPDATE public.timesheet_periods SET submitted_at = NULL WHERE period_id = v_per;
  v_agg := public.get_my_notification_aggregates();
  IF (v_agg->'approval.training_pending'->>'count')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - una boleta retirada sigue contando como capacitacion pendiente (%)',
      v_agg->'approval.training_pending'->>'count';
  END IF;
  RAISE NOTICE 'PASS - el contador solo mira encargos de capacitacion y periodos enviados';

  -- 12.d El porton, del lado de los contadores: el dueno de las horas NO recibe el contador
  -- de capacitacion (la matriz lo da solo a ADM y Talento Humano).
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-00000000000b');  -- S_SENIOR
  v_agg := public.get_my_notification_aggregates();
  IF v_agg ? 'approval.training_pending' THEN
    RAISE EXCEPTION 'TEST FAIL - el contador de capacitacion llego a un rol fuera de la matriz';
  END IF;
  RAISE NOTICE 'PASS - el contador de capacitacion esta gateado por la matriz, como los eventos';

END $$;

-- -- Grupo 13 -- FASE 3.e: cuentas, personal y competencias -------------------
-- Las cuatro cosas que fija este grupo:
--   1. las senales viven en `public` (user_roles / staff / staff_skills), no en `auth` (D-34);
--   2. alta y baja de personal combinan alcance `firm` con `practica` — un gerente de OTRA
--      linea de servicio no se entera;
--   3. la baja tiene tres formas y las tres cuentan una sola vez (D-35);
--   4. el borrado de cuenta es de Seguridad TI y NO del ADM: es la unica fila del catalogo
--      donde el ADM queda afuera.
DO $$
DECLARE
  v_new     uuid := '59f00000-0000-4000-8000-00000000000d';
  v_newuser uuid := 'a9f00000-0000-4000-8000-00000000000d';
  v_pending uuid := 'a9f00000-0000-4000-8000-00000000000e';  -- alta sin confirmar
  v_abort   uuid := 'a9f00000-0000-4000-8000-000000000011';  -- baja que no se concreta
  v_n       int;
  v_prev    int;
  v_res     jsonb;
  c_adm   constant uuid := '59f00000-0000-4000-8000-000000000006';
  c_itsec constant uuid := '59f00000-0000-4000-8000-00000000000c';
  c_hr    constant uuid := '59f00000-0000-4000-8000-00000000000a';
  c_mgr   constant uuid := '59f00000-0000-4000-8000-000000000002';
  c_own   constant uuid := '59f00000-0000-4000-8000-00000000000b';  -- S_SENIOR
  c_acct  constant uuid := '59f00000-0000-4000-8000-000000000003';  -- fuera de la matriz
  c_skill constant uuid := 'c9f00000-0000-4000-8000-0000000000b1';
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.notifications;

  -- 13.a Alta de personal: ADM y Talento Humano por `firm`, el Gerente por `practica`.
  INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                            practica_id, society_id, weekly_capacity_hours, hire_date, city)
  VALUES (v_new, NULL, 'NOTIF', 'Nuevo', true,
          (SELECT practica_id FROM public.practicas WHERE code = 1),
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2026-01-01', 'La Paz');

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'staff.created' AND recipient_staff_id IN (c_adm, c_hr, c_mgr);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - el alta de personal no llego a ADM, TH y Gerente (hubo %)', v_n;
  END IF;

  -- Ni al recien creado ni a un rol fuera de la matriz.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'staff.created' AND recipient_staff_id IN (v_new, c_acct);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el alta aviso a quien no le toca (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el alta de personal combina alcance firm (ADM/TH) con practica (Gerente)';

  -- El alcance `practica` es de verdad: un gerente de OTRA linea no lo recibe. Se mueve al
  -- nuevo a una practica distinta y se da de alta otro para comprobarlo.
  INSERT INTO public.practicas (practica_id, name, code, abbreviation)
  VALUES ('5e000000-0000-4000-8000-000000000009', 'NOTIF Otra Practica', 9, 'OTR')
  ON CONFLICT (code) DO NOTHING;

  DELETE FROM public.notifications;
  INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                            practica_id, society_id, weekly_capacity_hours, hire_date, city)
  VALUES ('59f00000-0000-4000-8000-00000000000e', NULL, 'NOTIF', 'OtraPractica', true,
          (SELECT practica_id FROM public.practicas WHERE code = 9),
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2026-01-01', 'La Paz');

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'staff.created' AND recipient_staff_id = c_mgr;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el Gerente recibio el alta de otra linea de servicio';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'staff.created' AND recipient_staff_id IN (c_adm, c_hr);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - ADM y TH deberian recibir cualquier alta (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - `practica` limita al gerente de esa linea; `firm` no';

  -- 13.b Baja: las tres senales en un solo UPDATE dejan UNA notificacion (D-35).
  DELETE FROM public.notifications;
  UPDATE public.staff
     SET termination_date = CURRENT_DATE, is_active = false, deleted_at = now()
   WHERE staff_id = v_new;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'staff.terminated' AND recipient_staff_id = c_adm;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la baja dejo % avisos al ADM, se esperaba 1', v_n;
  END IF;
  RAISE NOTICE 'PASS - fecha de baja, desactivacion y borrado logico son UN evento';

  -- 13.c Bloqueo de cuenta: ADM y Seguridad TI. Al bloqueado no (D-36).
  DELETE FROM public.notifications;
  UPDATE public.staff SET is_blocked = true WHERE staff_id = c_own;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'auth.account.blocked' AND recipient_staff_id IN (c_adm, c_itsec);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - el bloqueo no llego a ADM y Seguridad TI (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'auth.account.blocked' AND recipient_staff_id = c_own;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - se le aviso del bloqueo al propio bloqueado';
  END IF;

  -- Y el desbloqueo no emite: la matriz no le dio tipo.
  SELECT COUNT(*) INTO v_prev FROM public.notifications;
  UPDATE public.staff SET is_blocked = false WHERE staff_id = c_own;
  SELECT COUNT(*) INTO v_n FROM public.notifications;
  IF v_n <> v_prev THEN
    RAISE EXCEPTION 'TEST FAIL - el desbloqueo emitio algo (% -> %)', v_prev, v_n;
  END IF;
  RAISE NOTICE 'PASS - el bloqueo es auditoria de ADM/Seguridad TI; el desbloqueo no avisa';

  -- 13.d Alta de cuenta: INSERT en user_roles, auditoria del ADM (D-34).
  DELETE FROM public.notifications;
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    VALUES (v_newuser, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'notif-test-d@ruizmier.com', 'x', now(), now(), now(),
            '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  INSERT INTO public.user_roles (user_id, role, role_key)
  VALUES (v_newuser, 'staff', 'assistant');

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'auth.user.registered' AND recipient_staff_id = c_adm;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el ADM no recibio el alta de cuenta (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'auth.user.registered' AND recipient_staff_id = c_itsec;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - Seguridad TI recibio un alta que la matriz no le da';
  END IF;
  RAISE NOTICE 'PASS - el alta de cuenta se lee del INSERT de user_roles, sin tocar auth.users';

  -- 13.e Cambio de rol: al afectado con context=own, y a la auditoria sin duplicar.
  DELETE FROM public.notifications;
  UPDATE public.user_roles SET role_key = 'semisenior'
   WHERE user_id = 'a9f00000-0000-4000-8000-00000000000b';   -- S_SENIOR

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'auth.role.changed' AND recipient_staff_id = c_own
     AND payload->>'context' = 'own'
     AND payload->>'previous_role_key' = 'senior'
     AND payload->>'role_key' = 'semisenior';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el afectado no recibio su cambio de rol con el rol anterior (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'auth.role.changed' AND recipient_staff_id IN (c_adm, c_itsec);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - la auditoria de rol no llego a ADM y Seguridad TI (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el cambio de rol avisa al afectado y a la auditoria, una vez a cada uno';

  -- Un UPDATE que no toca el rol no avisa.
  SELECT COUNT(*) INTO v_prev FROM public.notifications;
  UPDATE public.user_roles SET created_at = created_at
   WHERE user_id = 'a9f00000-0000-4000-8000-00000000000b';
  SELECT COUNT(*) INTO v_n FROM public.notifications;
  IF v_n <> v_prev THEN
    RAISE EXCEPTION 'TEST FAIL - un UPDATE sin cambio de rol notifico (% -> %)', v_prev, v_n;
  END IF;
  RAISE NOTICE 'PASS - tocar user_roles sin cambiar el rol no avisa';

  -- Se devuelve el rol: la suite es UNA transaccion y los grupos siguientes cuentan con que
  -- S_SENIOR siga siendo `senior` (el modulo Hojas de Trabajo se lo concede, `semisenior` no).
  UPDATE public.user_roles SET role_key = 'senior'
   WHERE user_id = 'a9f00000-0000-4000-8000-00000000000b';

  -- 13.f Eliminacion de cuenta: SOLO Seguridad TI.
  DELETE FROM public.notifications;
  DELETE FROM public.user_roles WHERE user_id = v_newuser;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'auth.account.deleted' AND recipient_staff_id = c_itsec;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - Seguridad TI no recibio la eliminacion de cuenta (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'auth.account.deleted' AND recipient_staff_id = c_adm;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el ADM recibio la eliminacion, y la matriz se la da solo a Seguridad TI';
  END IF;
  RAISE NOTICE 'PASS - la eliminacion de cuenta es la unica fila donde el ADM queda afuera';

  -- 13.f.2 DESHACER UN ALTA NO ES UNA BAJA.
  --
  -- register-user borra la cuenta que acaba de crear cuando Microsoft Graph no logra mandar la
  -- confirmacion. Ese borrado llega a user_roles por el CASCADE de auth.users, o sea por el
  -- mismo camino que una baja de verdad — y sin distinguirlos, un 503 de Graph le dispara a
  -- Seguridad TI una alarma de cuenta eliminada. Las alarmas falsas en un canal de seguridad se
  -- pagan con que dejen de mirarse.
  DELETE FROM public.notifications;
  DELETE FROM public.notification_emails;

  IF to_regclass('auth.users') IS NOT NULL THEN
    -- SIN confirmar: es la condicion que la RPC exige para tocar nada.
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    VALUES (v_pending, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'notif-test-e@ruizmier.com', 'x', NULL, now(), now(),
            '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  INSERT INTO public.user_roles (user_id, role, role_key)
  VALUES (v_pending, 'staff', 'assistant');

  -- El alta dejo rastro: el aviso al ADM. Es lo que hay que limpiar.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'auth.user.registered' AND payload->>'user_id' = v_pending::text;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el fixture del alta sin confirmar no genero el aviso (hubo %)', v_n;
  END IF;

  v_res := public.rollback_unconfirmed_signup(v_pending);
  IF (v_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST FAIL - rollback_unconfirmed_signup se nego: %', v_res;
  END IF;

  -- LA ASERCION QUE IMPORTA: ninguna alarma de baja.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'auth.account.deleted';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - deshacer un alta reporto una baja de cuenta a Seguridad TI';
  END IF;

  -- Y el rastro del alta se fue con ella: el ADM no queda avisado de un registro que ya no
  -- existe, ni le sale el correo.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'auth.user.registered' AND payload->>'user_id' = v_pending::text;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - quedo el aviso de alta de una cuenta deshecha (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notification_emails
   WHERE type_key = 'auth.user.registered' AND status IN ('pending', 'failed');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - quedo encolado el correo del alta deshecha (hubo %)', v_n;
  END IF;

  -- Y la fila que dispara el CASCADE, para que el deleteUser posterior no tenga que borrarla.
  SELECT COUNT(*) INTO v_n FROM public.user_roles WHERE user_id = v_pending;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - la fila de user_roles sobrevivio al rollback';
  END IF;
  RAISE NOTICE 'PASS - deshacer un alta sin confirmar no alarma a Seguridad TI ni deja rastro';

  -- 13.f.3 La guarda: una cuenta YA CONFIRMADA no se toca. Hoy la RPC la llama un solo sitio y
  -- con una cuenta recien creada, pero el costo de equivocarse es sacarle el acceso a alguien
  -- que lo estaba usando, asi que la condicion se verifica en la funcion.
  IF to_regclass('auth.users') IS NOT NULL THEN
    DELETE FROM public.notifications;
    INSERT INTO public.user_roles (user_id, role, role_key)
    VALUES (v_newuser, 'staff', 'assistant')
    ON CONFLICT DO NOTHING;

    -- v_newuser se creo en 13.d con email_confirmed_at = now().
    v_res := public.rollback_unconfirmed_signup(v_newuser);
    IF (v_res->>'ok')::boolean IS NOT FALSE OR v_res->>'reason' <> 'ACCOUNT_CONFIRMED' THEN
      RAISE EXCEPTION 'TEST FAIL - el rollback acepto una cuenta ya confirmada: %', v_res;
    END IF;
    SELECT COUNT(*) INTO v_n FROM public.user_roles WHERE user_id = v_newuser;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'TEST FAIL - el rollback borro el rol de una cuenta confirmada';
    END IF;
    RAISE NOTICE 'PASS - el rollback se niega sobre una cuenta ya confirmada';

    -- Se limpia el fixture sin dejar el aviso de baja dando vueltas en el grupo siguiente.
    DELETE FROM public.user_roles WHERE user_id = v_newuser;
    DELETE FROM public.notifications;
  END IF;

  -- 13.f.4 EL CAMINO REAL DE UNA BAJA, que es el que 13.f NO ejerce.
  --
  -- 13.f borra la fila de `user_roles` a mano y por eso pasa. La baja de verdad no la borra:
  -- `manage-auth-user` llama a deleteUser() y la fila se va por el CASCADE de
  -- `user_roles.user_id -> auth.users`. El trigger corre entonces DENTRO del cascade, con la
  -- fila padre ya borrada, y `SELECT u.email FROM auth.users` no devuelve nada. El correo es el
  -- unico identificador que le queda al aviso —una cuenta con ficha de staff no se puede
  -- borrar— y el texto de la campana es 'Se elimino la cuenta {{email}}': a Seguridad TI le
  -- llegaba esa frase cortada, sin decir cual.
  --
  -- prepare_account_deletion() saca la fila ANTES, con auth.users todavia viva.
  IF to_regclass('auth.users') IS NOT NULL THEN
    -- OJO: 13.f.2 llamo a rollback_unconfirmed_signup(), que pone `ems.account_rollback` con
    -- set_config(..., true). Eso es transaction-local, y esta suite entera es UNA transaccion,
    -- asi que el marcador sigue puesto y silencia toda baja posterior. En produccion no pasa
    -- —cada llamada por PostgREST es su propia transaccion— pero aca hay que bajarlo a mano o
    -- este grupo prueba el silencio en vez del aviso.
    PERFORM set_config('ems.account_rollback', '', true);

    DELETE FROM public.notifications;
    -- v_pending ya tiene su fila en auth.users (13.f.2) y se quedo sin rol; se le repone.
    INSERT INTO public.user_roles (user_id, role, role_key)
    VALUES (v_pending, 'staff', 'assistant');
    DELETE FROM public.notifications;  -- el aviso de alta que acaba de emitir el INSERT

    v_res := public.prepare_account_deletion(v_pending);
    IF (v_res->>'ok')::boolean IS NOT TRUE OR (v_res->>'con_correo')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'TEST FAIL - prepare_account_deletion no preparo la baja: %', v_res;
    END IF;

    -- LA ASERCION QUE IMPORTA: el aviso identifica la cuenta.
    SELECT COUNT(*) INTO v_n FROM public.notifications
     WHERE type_key = 'auth.account.deleted'
       AND recipient_staff_id = c_itsec
       AND payload->>'email' = 'notif-test-e@ruizmier.com';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'TEST FAIL - el aviso de baja no salio con el correo de la cuenta (hubo %)', v_n;
    END IF;
    RAISE NOTICE 'PASS - la baja avisa a Seguridad TI con el correo de la cuenta borrada';

    -- Y cuando GoTrue borra la cuenta, el cascade ya no encuentra fila: el aviso sale UNA vez.
    DELETE FROM auth.users WHERE id = v_pending;
    SELECT COUNT(*) INTO v_n FROM public.notifications
     WHERE type_key = 'auth.account.deleted';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'TEST FAIL - el borrado de la cuenta duplico el aviso de baja (hubo %)', v_n;
    END IF;
    RAISE NOTICE 'PASS - preparar la baja no duplica el aviso cuando GoTrue borra la cuenta';

    -- 13.f.5 La guarda: una cuenta con ficha de staff vinculada no se toca. `manage-auth-user`
    -- ya lo verifica antes de llamar, pero sacarle el rol a alguien que esta trabajando es
    -- exactamente lo que no puede pasar por un error de quien llama.
    DELETE FROM public.notifications;
    v_res := public.prepare_account_deletion('a9f00000-0000-4000-8000-00000000000b');  -- S_SENIOR
    IF (v_res->>'ok')::boolean IS NOT FALSE OR v_res->>'reason' <> 'LINKED_STAFF' THEN
      RAISE EXCEPTION 'TEST FAIL - se preparo la baja de una cuenta con ficha vinculada: %', v_res;
    END IF;
    SELECT COUNT(*) INTO v_n FROM public.user_roles
     WHERE user_id = 'a9f00000-0000-4000-8000-00000000000b';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'TEST FAIL - la guarda se nego pero igual borro el rol';
    END IF;
    RAISE NOTICE 'PASS - preparar la baja se niega sobre una cuenta con ficha de staff';

    -- 13.f.6 UNA BAJA QUE NO SE CONCRETA SE DESHACE ENTERA.
    --
    -- Sacar el rol antes del borrado abre un estado que antes no existia: si GoTrue despues
    -- falla por algo transitorio, la cuenta sigue viva y sin rol, y el frontend es fail-closed
    -- —esa persona entra y no ve nada—. Mientras la fila se iba por el CASCADE eso no podia
    -- pasar, porque el CASCADE solo corria si la cuenta se habia borrado de verdad.
    DELETE FROM public.notifications;
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    VALUES (v_abort, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'notif-test-11@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role, role_key)
    VALUES (v_abort, 'staff', 'senior');
    DELETE FROM public.notifications;  -- el aviso de alta del INSERT

    v_res := public.prepare_account_deletion(v_abort);
    IF (v_res->>'ok')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'TEST FAIL - prepare_account_deletion se nego: %', v_res;
    END IF;
    SELECT COUNT(*) INTO v_n FROM public.notifications WHERE type_key = 'auth.account.deleted';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'TEST FAIL - el fixture no dejo el aviso de baja (hubo %)', v_n;
    END IF;

    -- GoTrue no pudo borrar la cuenta.
    v_res := public.abort_account_deletion(v_abort, v_res->'rol');
    IF (v_res->>'ok')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'TEST FAIL - no se pudo deshacer la baja: %', v_res;
    END IF;

    -- El rol vuelve TAL CUAL, no con un default: quien tenia `senior` no queda como `staff`.
    SELECT COUNT(*) INTO v_n FROM public.user_roles
     WHERE user_id = v_abort AND role_key = 'senior';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'TEST FAIL - el rol no volvio tal cual (hubo %)', v_n;
    END IF;

    -- Y la baja deja de estar anunciada: no ocurrio.
    SELECT COUNT(*) INTO v_n FROM public.notifications WHERE type_key = 'auth.account.deleted';
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'TEST FAIL - quedo anunciada a Seguridad TI una baja que no ocurrio (hubo %)', v_n;
    END IF;

    -- Ni se anuncia como un alta: la cuenta existia desde antes.
    SELECT COUNT(*) INTO v_n FROM public.notifications
     WHERE type_key = 'auth.user.registered' AND payload->>'user_id' = v_abort::text;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'TEST FAIL - reponer el rol se anuncio como un alta nueva (hubo %)', v_n;
    END IF;
    RAISE NOTICE 'PASS - una baja que no se concreta devuelve el rol y retira el aviso';

    -- 13.f.7 Y al reves: si la cuenta SI se borro no hay nada que deshacer. Reponer el rol
    -- dejaria una fila apuntando a una cuenta que ya no existe.
    PERFORM set_config('ems.account_rollback', '', true);
    DELETE FROM public.notifications;

    v_res := public.prepare_account_deletion(v_abort);
    DELETE FROM auth.users WHERE id = v_abort;

    v_res := public.abort_account_deletion(v_abort, v_res->'rol');
    IF (v_res->>'ok')::boolean IS NOT FALSE OR v_res->>'reason' <> 'NO_AUTH_USER' THEN
      RAISE EXCEPTION 'TEST FAIL - se deshizo una baja que si ocurrio: %', v_res;
    END IF;
    SELECT COUNT(*) INTO v_n FROM public.user_roles WHERE user_id = v_abort;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'TEST FAIL - se repuso el rol de una cuenta que ya no existe';
    END IF;
    RAISE NOTICE 'PASS - deshacer no repone nada cuando la baja si ocurrio';

    -- El marcador vuelve a bajarse: es transaction-local y la suite es una sola transaccion.
    PERFORM set_config('ems.account_rollback', '', true);
    DELETE FROM public.notifications;
  END IF;

  -- 13.g Competencias: dos tipos distintos (D-03), solo al afectado.
  DELETE FROM public.notifications;
  INSERT INTO public.staff_skills (staff_id, skill_id, proficiency_level)
  VALUES (c_own, c_skill, 'Intermediate');

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'staff.competency.assigned' AND recipient_staff_id = c_own
     AND payload->>'skill_name' = 'NOTIF Competencia'
     AND payload->>'proficiency_level' = 'Intermediate';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el alta de competencia no llego con nombre y nivel (hubo %)', v_n;
  END IF;

  -- Subir el nivel de una competencia que ya tenia NO avisa.
  SELECT COUNT(*) INTO v_prev FROM public.notifications;
  UPDATE public.staff_skills SET proficiency_level = 'Advanced'
   WHERE staff_id = c_own AND skill_id = c_skill;
  SELECT COUNT(*) INTO v_n FROM public.notifications;
  IF v_n <> v_prev THEN
    RAISE EXCEPTION 'TEST FAIL - reevaluar el nivel notifico (% -> %)', v_prev, v_n;
  END IF;

  DELETE FROM public.staff_skills WHERE staff_id = c_own AND skill_id = c_skill;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'staff.competency.removed' AND recipient_staff_id = c_own;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la baja de competencia no aviso (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key LIKE 'staff.competency.%' AND recipient_staff_id <> c_own;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - una competencia ajena le llego a alguien mas (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - competencia: alta y baja son tipos distintos, y solo del afectado';

END $$;

-- -- Grupo 14 -- FASE 3.f: modulo Clientes -------------------------------------
-- Las tres cosas que fija este grupo:
--   1. el alta le llega al Senior Partner Y al creador, porque `asignados` esta vacio el dia
--      del alta: el cliente todavia no tiene encargos (D-37);
--   2. "asignado a un cliente" se resuelve dando la vuelta por sus encargos;
--   3. la inactivacion NO cuenta ademas como edicion, aunque las dos sean el mismo UPDATE.
DO $$
DECLARE
  v_cli  uuid := 'c9f00000-0000-4000-8000-000000000002';
  v_eng  uuid := 'e9f00000-0000-4000-8000-000000000008';
  v_n    int;
  v_prev int;
  c_spart constant uuid := '59f00000-0000-4000-8000-00000000000f';  -- S_SPART (senior_partner)
  c_mgr   constant uuid := '59f00000-0000-4000-8000-000000000002';  -- S_MGR
  c_part  constant uuid := '59f00000-0000-4000-8000-000000000004';  -- S_PARTNER
BEGIN
  -- Este grupo corre CON sesion, y no sin ella como los demas: `created_by_staff_id` no la
  -- escribe el INSERT sino el trigger `set_client_created_by`, que la saca de
  -- get_my_staff_id(). Sin sesion la columna queda NULL y el aviso al creador —que es el
  -- punto de D-37— no tendria a quien ir.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000002');  -- S_MGR
  DELETE FROM public.notifications;

  -- 14.a Alta: Senior Partner (global) + el creador (D-37). El Gerente lo recibe por CREADOR,
  -- no por asignado: el cliente todavia no tiene ningun encargo suyo.
  INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
  VALUES (v_cli, 'NOTIF Cliente Dos', 'NOTIF-9F02');

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'client.created' AND recipient_staff_id = c_spart;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el Senior Partner no recibio el alta de cliente (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'client.created' AND recipient_staff_id = c_mgr
     AND payload->>'unique_tax_id' = 'NOTIF-9F02';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el creador no recibio el alta de su propio cliente (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el alta llega al Senior Partner y al creador, aun sin encargos';

  -- 14.b Edicion sin encargos: nadie esta asignado todavia, asi que no hay a quien avisar.
  DELETE FROM public.notifications;
  UPDATE public.clients SET contact_phone = '77712345' WHERE client_id = v_cli;

  SELECT COUNT(*) INTO v_n FROM public.notifications WHERE type_key = 'client.updated';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - la edicion aviso sin que nadie tenga encargos del cliente (hubo %)', v_n;
  END IF;

  -- El encargo se crea SIN sesion: `enforce_engagement_profile_scope` exige que sociedad,
  -- practica y oficina del encargo coincidan con la ficha del creador, y este fixture no
  -- llena esas tres columnas. Es un guard de otro modulo, no lo que se prueba aca.
  PERFORM set_config('request.jwt.claims', '', true);

  -- Con un encargo del cliente, el Gerente pasa a estar asignado y SI recibe la edicion.
  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                  partner_id, manager_id, created_by_staff_id, fecha_cierre,
                                  society_id)
  VALUES (v_eng, v_cli, 'NOTIF Encargo Ocho', '9F08', c_part, c_mgr, c_mgr, '2026-12-31',
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

  DELETE FROM public.notifications;
  UPDATE public.clients SET contact_email = 'nuevo@cliente.com' WHERE client_id = v_cli;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'client.updated' AND recipient_staff_id = c_mgr;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente del cliente no recibio la edicion (hubo %)', v_n;
  END IF;
  -- Y el Socio no: la matriz da `client.updated` solo a los gerentes.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'client.updated' AND recipient_staff_id = c_part;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el Socio recibio una edicion que la matriz no le da';
  END IF;
  RAISE NOTICE 'PASS - la edicion llega a los gerentes del cliente, y solo con encargo de por medio';

  -- 14.c Un UPDATE que no cambia nada no avisa.
  SELECT COUNT(*) INTO v_prev FROM public.notifications WHERE type_key = 'client.updated';
  UPDATE public.clients SET contact_email = 'nuevo@cliente.com' WHERE client_id = v_cli;
  SELECT COUNT(*) INTO v_n FROM public.notifications WHERE type_key = 'client.updated';
  IF v_n <> v_prev THEN
    RAISE EXCEPTION 'TEST FAIL - guardar sin cambiar nada conto como edicion (% -> %)', v_prev, v_n;
  END IF;
  RAISE NOTICE 'PASS - re-guardar la ficha sin tocar nada no es una edicion';

  -- 14.d Inactivacion: al Senior Partner y a los asignados, y NO cuenta como edicion.
  DELETE FROM public.notifications;
  UPDATE public.clients SET is_active = false WHERE client_id = v_cli;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'client.deactivated' AND recipient_staff_id IN (c_spart, c_part, c_mgr);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - la inactivacion no llego a Senior Partner, Socio y Gerente (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications WHERE type_key = 'client.updated';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - la inactivacion conto ademas como edicion (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - la inactivacion avisa a mas gente y no duplica con la edicion';

  -- 14.e El porton: un rol fuera de la matriz no recibe nada del modulo.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key LIKE 'client.%'
     AND recipient_staff_id = '59f00000-0000-4000-8000-000000000003';  -- accounting_manager
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - Contabilidad recibio eventos del modulo Clientes (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - los eventos de Clientes respetan la matriz';

END $$;

-- -- Grupo 15 -- FASES 3.g y 3.h: Hojas de Trabajo y cobertura del Scheduler ---
-- Los dos modulos que cierran el catalogo, y los dos con una particularidad:
--   * la hoja de trabajo tiene disparador pero el producto todavia no lo dispara (D-38):
--     aca se ejercita la transicion a mano, que es la unica forma de probarlo hoy;
--   * el gap de cobertura es la resta entre lo que la OT aprobada pidio y el staffing
--     vigente, con TRES alcances distintos segun el rol (D-40).
DO $$
DECLARE
  v_eng   uuid := 'e9f00000-0000-4000-8000-000000000009';
  v_wo    uuid;
  v_ws    uuid := 'a7f00000-0000-4000-8000-000000000001';
  v_cat   uuid := 'c9f00000-0000-4000-8000-0000000000c1';
  v_asg   uuid;
  v_n     int;
  v_agg   jsonb;
  c_part  constant uuid := '59f00000-0000-4000-8000-000000000004';  -- S_PARTNER (socio)
  c_mgr   constant uuid := '59f00000-0000-4000-8000-000000000002';  -- S_MGR
  c_sen   constant uuid := '59f00000-0000-4000-8000-00000000000b';  -- S_SENIOR (SQR del encargo)
  c_adm   constant uuid := '59f00000-0000-4000-8000-000000000006';  -- ADM (alcance firm)
  c_acct  constant uuid := '59f00000-0000-4000-8000-000000000003';  -- fuera de la matriz
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.notifications;

  -- Encargo propio con Socio, Gerente y SQR: los tres alcances del contador se juegan sobre
  -- los cargos del encargo.
  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                  partner_id, manager_id, sqr_id, created_by_staff_id,
                                  fecha_cierre, society_id)
  VALUES (v_eng, 'c9f00000-0000-4000-8000-000000000001', 'NOTIF Encargo Nueve', '9F09',
          c_part, c_mgr, c_sen, c_mgr, '2026-12-31',
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

  -- 15.a Hoja de trabajo: la transicion draft -> approved avisa a la conduccion (D-38).
  INSERT INTO public.activity_worksheets (id, engagement_id, status, created_by_staff_id)
  VALUES (v_ws, v_eng, 'draft', c_mgr);

  DELETE FROM public.notifications;
  UPDATE public.activity_worksheets SET status = 'approved' WHERE id = v_ws;

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'worksheet.sent_to_quality' AND recipient_staff_id IN (c_part, c_sen)
     AND payload->>'engagement_code' = '9F09';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - la hoja enviada a calidad no llego al Socio y al SQR (hubo %)', v_n;
  END IF;
  -- El Gerente NO: la matriz da esta fila a los cinco roles que pueden ocupar la funcion SQR,
  -- y el Gerente no es uno de ellos.
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'worksheet.sent_to_quality' AND recipient_staff_id IN (c_mgr, c_acct);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - la hoja aviso a un rol que la matriz no incluye (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - la hoja enviada a calidad avisa a quien la revisa, y a nadie mas';

  -- Volver a guardar la hoja ya aprobada no vuelve a avisar.
  UPDATE public.activity_worksheets SET notes = 'revisada' WHERE id = v_ws;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'worksheet.sent_to_quality';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - editar la hoja ya aprobada volvio a avisar (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - solo la transicion a approved avisa, no cada guardado';

  -- 15.b Cobertura: la OT aprobada pide 3 de una categoria y no hay nadie asignado (D-40).
  INSERT INTO public.work_orders (engagement_id, currency, season_mode, approval_status)
  VALUES (v_eng, 'BOB', 'High', 'Approved')
  RETURNING wo_id INTO v_wo;

  INSERT INTO public.wo_staffing_requirements (wo_id, category_id, staff_count)
  VALUES (v_wo, v_cat, 3);

  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000002');  -- S_MGR (assigned)
  v_agg := public.get_my_notification_aggregates();
  IF (v_agg->'scheduler.coverage_gap'->>'count')::int <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente ve % posiciones sin cubrir, se esperaban 3',
      v_agg->'scheduler.coverage_gap'->>'count';
  END IF;
  RAISE NOTICE 'PASS - sin nadie asignado, el gap es todo lo que pidio la OT';

  -- Con una persona asignada a esa categoria, el gap baja a 2.
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.engagement_assignments (engagement_id, staff_id, category_id,
                                             start_date, end_date, status)
  VALUES (v_eng, '59f00000-0000-4000-8000-000000000001', v_cat,
          CURRENT_DATE, CURRENT_DATE + 30, 'CONFIRMED')
  RETURNING assignment_id INTO v_asg;

  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000002');
  v_agg := public.get_my_notification_aggregates();
  IF (v_agg->'scheduler.coverage_gap'->>'count')::int <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - con una persona asignada el gap quedo en %, se esperaba 2',
      v_agg->'scheduler.coverage_gap'->>'count';
  END IF;

  -- Y el COT viaja en `items` para pintarse como chip (alcance `assigned`).
  IF (v_agg->'scheduler.coverage_gap'->'items'->0->>'engagement_code') <> '9F09' THEN
    RAISE EXCEPTION 'TEST FAIL - el contador no devolvio el COT del encargo con gap';
  END IF;
  RAISE NOTICE 'PASS - cada persona asignada baja el gap, y el COT viaja como chip';

  -- Una asignacion dada de baja NO cubre: el gap vuelve a 3.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.engagement_assignments SET deleted_at = now() WHERE assignment_id = v_asg;

  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000002');
  v_agg := public.get_my_notification_aggregates();
  IF (v_agg->'scheduler.coverage_gap'->>'count')::int <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - una asignacion borrada siguio cubriendo (gap %)',
      v_agg->'scheduler.coverage_gap'->>'count';
  END IF;
  RAISE NOTICE 'PASS - el staffing borrado deja de cubrir la posicion';

  -- 15.c Los tres alcances. El ADM lo tiene por `firm` y ve el mismo gap sin estar asignado.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000006');  -- ADM
  v_agg := public.get_my_notification_aggregates();
  IF (v_agg->'scheduler.coverage_gap'->>'count')::int < 3 THEN
    RAISE EXCEPTION 'TEST FAIL - el ADM no ve el gap de un encargo ajeno (alcance firm)';
  END IF;
  -- En `firm` no viajan items: la lista puede ser de cientos y el numero manda a la pantalla.
  IF jsonb_array_length(v_agg->'scheduler.coverage_gap'->'items') <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el alcance firm devolvio items, que pueden ser cientos';
  END IF;
  RAISE NOTICE 'PASS - `firm` ve toda la firma y sin lista de encargos';

  -- Y el porton sigue mandando: Contabilidad no tiene el contador en la matriz.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000003');  -- accounting_manager
  v_agg := public.get_my_notification_aggregates();
  IF v_agg ? 'scheduler.coverage_gap' THEN
    RAISE EXCEPTION 'TEST FAIL - el contador de cobertura llego a un rol fuera de la matriz';
  END IF;
  RAISE NOTICE 'PASS - el contador de cobertura esta gateado por la matriz';

  -- 15.d Un encargo finalizado deja de reclamar cobertura.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.engagements SET engagement_state_override = 7 WHERE engagement_id = v_eng;

  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000002');
  v_agg := public.get_my_notification_aggregates();
  IF (v_agg->'scheduler.coverage_gap'->>'count')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - un encargo finalizado sigue reclamando cobertura (gap %)',
      v_agg->'scheduler.coverage_gap'->>'count';
  END IF;
  RAISE NOTICE 'PASS - un encargo cerrado no reclama cobertura';

END $$;

-- -- Grupo 16 -- D-05: aviso previo a la fecha fin del encargo ------------------
-- El segundo cron del catalogo, y el mismo patron que el plazo de emergencia (D-09): UN tipo
-- con DOS disparos (7 dias y 1 dia), distinguidos por `days_left`, e idempotente por
-- destinatario para que correrlo dos veces el mismo dia no duplique.
DO $$
DECLARE
  v_eng  uuid := 'e9f00000-0000-4000-8000-00000000000a';
  v_n    int;
  v_sent int;
  c_part constant uuid := '59f00000-0000-4000-8000-000000000004';  -- S_PARTNER
  c_mgr  constant uuid := '59f00000-0000-4000-8000-000000000002';  -- S_MGR
  c_adm  constant uuid := '59f00000-0000-4000-8000-000000000006';  -- ADM (alcance firm)
  c_stf  constant uuid := '59f00000-0000-4000-8000-000000000001';  -- S_ASSIST (staffing)
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                  partner_id, manager_id, created_by_staff_id, fecha_cierre,
                                  society_id, end_date)
  VALUES (v_eng, 'c9f00000-0000-4000-8000-000000000001', 'NOTIF Encargo Diez', '9F10',
          c_part, c_mgr, c_mgr, '2026-12-31',
          (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
          (now() AT TIME ZONE 'America/La_Paz')::date + 7);

  -- El staffing del encargo NO recibe este aviso (a diferencia de `finalized`): un asistente
  -- no decide una prorroga.
  INSERT INTO public.engagement_assignments (engagement_id, staff_id, category_id,
                                             start_date, end_date, status)
  VALUES (v_eng, c_stf, 'c9f00000-0000-4000-8000-0000000000c1',
          CURRENT_DATE, CURRENT_DATE + 30, 'CONFIRMED');

  DELETE FROM public.notifications;

  -- 16.a A 7 dias: conduccion + ADM, con days_left en el payload.
  v_sent := public.notif_engagement_daily_scheduled();

  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.ending_soon'
     AND recipient_staff_id IN (c_part, c_mgr, c_adm)
     AND payload->>'days_left' = '7'
     AND payload->>'engagement_code' = '9F10';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - el aviso a 7 dias no llego a Socio, Gerente y ADM (hubo %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.ending_soon' AND recipient_staff_id = c_stf;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el aviso previo bajo al staffing, que no decide prorrogas';
  END IF;
  RAISE NOTICE 'PASS - a 7 dias avisa a la conduccion y al ADM, no al staffing';

  -- Correrlo otra vez el mismo dia no duplica.
  PERFORM public.notif_engagement_daily_scheduled();
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.ending_soon' AND payload->>'days_left' = '7';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - el cron duplico el aviso de 7 dias (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - re-ejecutar el cron el mismo dia no duplica';

  -- 16.b A 1 dia: segundo disparo del MISMO tipo, con su propia redaccion.
  UPDATE public.engagements
     SET end_date = (now() AT TIME ZONE 'America/La_Paz')::date + 1
   WHERE engagement_id = v_eng;

  PERFORM public.notif_engagement_daily_scheduled();
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.ending_soon'
     AND recipient_staff_id = c_mgr
     AND payload->>'days_left' = '1'
     AND payload->>'context' = 'last_day';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - falto el aviso del ultimo dia (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el ultimo dia es un segundo disparo del mismo tipo';

  -- 16.c A 3 dias no avisa: solo 7 y 1.
  DELETE FROM public.notifications;
  UPDATE public.engagements
     SET end_date = (now() AT TIME ZONE 'America/La_Paz')::date + 3
   WHERE engagement_id = v_eng;

  PERFORM public.notif_engagement_daily_scheduled();
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.ending_soon';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el cron aviso a 3 dias (hubo %)', v_n;
  END IF;

  -- Y un encargo ya finalizado tampoco, aunque su fecha caiga en la ventana.
  UPDATE public.engagements
     SET end_date = (now() AT TIME ZONE 'America/La_Paz')::date + 7,
         engagement_state_override = 7
   WHERE engagement_id = v_eng;

  PERFORM public.notif_engagement_daily_scheduled();
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE type_key = 'engagement.ending_soon';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - un encargo finalizado recibio el aviso previo (hubo %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - solo 7 y 1 dia, y solo sobre encargos vivos';

END $$;

-- -- Grupo 17 -- Descarte manual y retencion ----------------------------------
-- La "x" saca la fila de la VISTA; el cron es el unico que la saca de la TABLA. No es un
-- detalle de implementacion: la fila es a la vez el aviso y el registro de que el aviso ya
-- salio, y los emisores del cron viven del segundo. Si la "x" borrara, descartar un aviso lo
-- traeria de vuelta al dia siguiente (ver 8.j).
-- Lo descartado paga esa supervivencia con la ventana de retencion mas corta de las tres, y
-- contada desde el descarte.
DO $$
DECLARE
  v_mine  uuid;
  v_other uuid;
  v_n     int;
  v_del   int;
  c_mgr  constant uuid := '59f00000-0000-4000-8000-000000000002';  -- S_MGR
  c_part constant uuid := '59f00000-0000-4000-8000-000000000004';  -- S_PARTNER
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.notifications;

  -- Una notificacion de cada uno, del mismo tipo.
  v_mine  := public.notify_staff('wo.rejected_partner', c_mgr,  'wo-1', '{}'::jsonb);
  v_other := public.notify_staff('wo.rejected_risk',    c_part, 'wo-1', '{}'::jsonb);
  IF v_mine IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL - los fixtures del grupo no se crearon';
  END IF;

  -- 17.a El dueno descarta la suya: sale de la bandeja y la fila queda marcada.
  PERFORM pg_temp.impersonate('a9f00000-0000-4000-8000-000000000002');  -- S_MGR
  v_del := public.dismiss_notifications(ARRAY[v_mine]);
  IF v_del <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - dismiss_notifications descarto % filas, se esperaba 1', v_del;
  END IF;
  IF jsonb_array_length(public.get_my_notifications(50)->'events') <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - la notificacion descartada sigue en la bandeja';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE notification_id = v_mine AND dismissed_at IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la fila descartada no sobrevive marcada (registro de emision)';
  END IF;
  RAISE NOTICE 'PASS - la x saca el aviso de la bandeja y conserva el registro de emision';

  -- Descartar dos veces no mueve la marca: el plazo de retencion se cuenta desde el PRIMER
  -- descarte, asi que un doble click no le regala 30 dias mas de vida a la fila.
  IF public.dismiss_notifications(ARRAY[v_mine]) <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - descartar dos veces volvio a contar la fila';
  END IF;
  RAISE NOTICE 'PASS - descartar es idempotente';

  -- Tampoco cuenta como no leida: la campana no puede seguir mostrando lo que se descarto.
  IF (public.get_my_notifications(50)->>'unread_count')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - lo descartado sigue contando como no leido';
  END IF;
  RAISE NOTICE 'PASS - lo descartado no cuenta en el badge';

  -- 17.b Con el uuid de OTRO no pasa nada: el UPDATE filtra por destinatario.
  v_del := public.dismiss_notifications(ARRAY[v_other]);
  IF v_del <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - se descarto la notificacion de otro (marco %)', v_del;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE notification_id = v_other AND dismissed_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la notificacion ajena se descarto o desaparecio';
  END IF;
  RAISE NOTICE 'PASS - pasar el uuid de otro no descarta nada';

  -- Y sin ids no rompe: el panel puede llamar con la lista vacia.
  IF public.dismiss_notifications(ARRAY[]::uuid[]) <> 0
     OR public.dismiss_notifications(NULL) <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - dismiss_notifications con lista vacia o NULL no devolvio 0';
  END IF;
  RAISE NOTICE 'PASS - descartar sin ids es un no-op, no un error';

  -- 17.c Retencion: las ventanas son distintas para leidas y no leidas.
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.notifications;

  INSERT INTO public.notifications (recipient_staff_id, type_key, created_at, read_at) VALUES
    -- Leida y vieja (40 dias): se va, la ventana por defecto es 30.
    (c_mgr, 'wo.rejected_partner', now() - interval '40 days', now() - interval '39 days'),
    -- Leida y reciente (10 dias): se queda.
    (c_mgr, 'wo.rejected_partner', now() - interval '10 days', now() - interval '9 days'),
    -- SIN leer y de 40 dias: se queda. Todavia tiene algo que decir, y su ventana es 90.
    (c_mgr, 'wo.rejected_partner', now() - interval '40 days', NULL),
    -- SIN leer y de 100 dias: se va. A esa altura el hecho lo cuenta la pantalla del modulo.
    (c_mgr, 'wo.rejected_partner', now() - interval '100 days', NULL);

  v_del := public.purge_old_notifications();
  IF v_del <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - la retencion borro % filas, se esperaban 2', v_del;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - quedaron % filas tras la purga, se esperaban 2', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE read_at IS NULL AND created_at < now() - interval '30 days';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la purga se llevo una no leida dentro de su ventana';
  END IF;
  RAISE NOTICE 'PASS - retencion: 30 dias para las leidas, 90 para las que nadie miro';

  -- 17.c.2 La TERCERA ventana: lo descartado, contado desde el descarte y no desde que se creo.
  --        Es lo que separa "el cron no lo repite" de "la tabla crece sin fin": descartar le
  --        compra al cron 30 dias de silencio, ni cero (borrar) ni para siempre (conservar).
  DELETE FROM public.notifications;
  INSERT INTO public.notifications
    (recipient_staff_id, type_key, created_at, read_at, dismissed_at) VALUES
    -- Descartada hace 40 dias: se va.
    (c_mgr, 'wo.rejected_partner', now() - interval '200 days', NULL, now() - interval '40 days'),
    -- Descartada ANTEAYER pero creada hace 200: se QUEDA. Con la fecha base equivocada
    -- (created_at) caia en el brazo de "sin leer, 90 dias" y se borraba, y el cron volvia a
    -- avisar justo lo que el usuario acababa de silenciar.
    (c_mgr, 'wo.rejected_partner', now() - interval '200 days', NULL, now() - interval '2 days'),
    -- Descartada anteayer y ya leida antes: misma regla, manda el descarte.
    (c_mgr, 'wo.rejected_partner', now() - interval '200 days', now() - interval '199 days',
     now() - interval '2 days');

  v_del := public.purge_old_notifications();
  IF v_del <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la retencion de lo descartado borro % filas, se esperaba 1', v_del;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notifications
   WHERE dismissed_at > now() - interval '30 days';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - se borro un descarte reciente (quedaron %, se esperaban 2)', v_n;
  END IF;
  RAISE NOTICE 'PASS - lo descartado vive 30 dias contados DESDE el descarte, no desde su fecha';

  -- 17.d Las ventanas salen de global_settings, y un valor invertido no borra de mas.
  UPDATE public.global_settings SET setting_value = '60'
   WHERE setting_key = 'NOTIF_RETENTION_READ_DAYS';
  UPDATE public.global_settings SET setting_value = '5'
   WHERE setting_key = 'NOTIF_RETENTION_UNREAD_DAYS';

  DELETE FROM public.notifications;
  INSERT INTO public.notifications (recipient_staff_id, type_key, created_at, read_at) VALUES
    -- Leida de 40 dias: con la ventana en 60 ahora SOBREVIVE.
    (c_mgr, 'wo.rejected_partner', now() - interval '40 days', now() - interval '39 days'),
    -- Sin leer de 40 dias: la ventana invertida (5) NO puede borrarla, porque una no leida
    -- nunca vive menos que una leida.
    (c_mgr, 'wo.rejected_partner', now() - interval '40 days', NULL);

  v_del := public.purge_old_notifications();
  IF v_del <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - con las ventanas invertidas la purga borro % filas', v_del;
  END IF;
  RAISE NOTICE 'PASS - las ventanas son configurables y la invertida no borra de mas';

  -- Un valor basura cae al default en vez de romper el cron.
  UPDATE public.global_settings SET setting_value = 'treinta'
   WHERE setting_key = 'NOTIF_RETENTION_READ_DAYS';
  UPDATE public.global_settings SET setting_value = ''
   WHERE setting_key = 'NOTIF_RETENTION_UNREAD_DAYS';

  DELETE FROM public.notifications;
  INSERT INTO public.notifications (recipient_staff_id, type_key, created_at, read_at)
  VALUES (c_mgr, 'wo.rejected_partner', now() - interval '40 days', now() - interval '39 days');

  v_del := public.purge_old_notifications();
  IF v_del <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - con un valor no numerico la purga no cayo al default de 30 dias';
  END IF;
  RAISE NOTICE 'PASS - un valor mal tipeado cae al default y no rompe el cron';

  RAISE NOTICE 'NOTIFICACIONES FASE 1: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
