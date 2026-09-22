-- Transactional tests for public.personal_overview() -- FEAT dash_personal
-- (bugs/dashboard/personal/plan_v2.md §9.1 / decisiones.md).
--
-- DONDE CORRE: via supabase/tests/local/run-rls-tests.sh, contra la base scratch local con
-- el set consolidado + las migraciones incrementales + 20260921140000_dash_personal_overview.sql
-- aplicados. Misma convención que rpc-dash-encargo-engagement-overview.sql: una sola
-- transacción que SIEMPRE termina en ROLLBACK, un NOTICE por chequeo que pasa, marcador final
-- 'PERSONAL OVERVIEW RPC: ALL CHECKS PASSED (rolled back)'.
--
-- Fixture: todos los ids llevan el prefijo 902150 reconocible. Reutiliza la sociedad/práctica
-- sembradas UNA VEZ por run-rls-tests.sh fuera de esta transacción ('Harness Test Society' /
-- 'Harness Test Practice', code=1) -- no las vuelve a crear.
--
-- A diferencia de dash_encargo, `dashboard.personal.read` YA está concedido a los 22
-- role_key operativos reales (20251204001004_cero_13_seed_authorization_rbac.sql) -- no hay
-- ningún rol real del catálogo sin el permiso para probar el caso 2 (RAISE FORBIDDEN). Se
-- crea un role_key de utilería SIN esa concesión, exclusivamente dentro de esta transacción
-- (ROLLBACK lo elimina), para ejercitar ese camino.
--
-- Fechas relativas a "hoy" ((now() AT TIME ZONE 'America/La_Paz')::date, vía pg_temp.today())
-- y ANCLADAS POR OFFSET DE SEMANA (pg_temp.week(n) = lunes de la semana actual + 7*n días),
-- nunca por día de la semana literal -- lección de a1a1de96 (zona horaria).

BEGIN;

CREATE FUNCTION pg_temp.today() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/La_Paz')::date
$$;
CREATE FUNCTION pg_temp.week(n integer) RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (date_trunc('week', pg_temp.today())::date) + (n * 7)
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.practicas WHERE code = 1) THEN
    RAISE EXCEPTION 'FIXTURE: falta el servicio code = 1 (AUD) -- staff.practica_id es NOT NULL.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.society WHERE name = 'Harness Test Society') THEN
    RAISE EXCEPTION 'FIXTURE: falta la sociedad sembrada por run-rls-tests.sh.';
  END IF;
END $$;

-- ── Cliente / categoría / actividades / tipo de gasto ────────────────────────────────────
INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('60902150-0000-4000-8000-000000000001', 'Cliente 902150', 'NIT-902150-1')
ON CONFLICT (client_id) DO NOTHING;

INSERT INTO public.categories (category_id, category_name, practica_id, display_order,
                                rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd) VALUES
  ('c0902150-0000-4000-8000-000000000001', 'Categoria 902150', (SELECT practica_id FROM public.practicas WHERE code = 1), 1, 500, 400, 50, 40)
ON CONFLICT (category_id) DO NOTHING;

INSERT INTO public.activity_codes (activity_id, activity_code, description, practica_id) VALUES
  ('ac902150-0000-4000-8000-000000000001', 'PA1', 'Actividad Uno 902150', (SELECT practica_id FROM public.practicas WHERE code = 1)),
  ('ac902150-0000-4000-8000-000000000002', 'PA2', 'Actividad Dos 902150', (SELECT practica_id FROM public.practicas WHERE code = 1))
ON CONFLICT (activity_id) DO NOTHING;

INSERT INTO public.expense_types (expense_type_id, expense_name) VALUES
  ('9e902150-0000-4000-8000-000000000001', 'Viaticos 902150')
ON CONFLICT (expense_type_id) DO NOTHING;

-- ── Personal: u1/s1 sujeto principal, u2/s2 otra persona (aislamiento), u3 sin ficha,
-- u4/s4 con un role_key de utilería sin dashboard.personal.read, u5/s5 admin. ────────────
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a0902150-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'dash-personal-test-' || n || '@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 5) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, short_name, is_active,
                          practica_id, society_id, category_id)
SELECT ('50902150-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a0902150-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       '902150', 'Sujeto' || lpad(n::text, 2, '0'), '902150-' || lpad(n::text, 2, '0'),
       true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
       NULL
  FROM generate_series(1, 2) n  -- s1, s2
ON CONFLICT (staff_id) DO NOTHING;

-- s4 (u4, role de utilería) y s5 (u5, admin) -- ficha propia, aislada de s1/s2.
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, short_name, is_active,
                          practica_id, society_id, category_id) VALUES
  ('50902150-0000-4000-8000-000000000004', 'a0902150-0000-4000-8000-000000000004', '902150', 'Sujeto04', '902150-04', true,
    (SELECT practica_id FROM public.practicas WHERE code = 1),
    (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), NULL),
  ('50902150-0000-4000-8000-000000000005', 'a0902150-0000-4000-8000-000000000005', '902150', 'Sujeto05', '902150-05', true,
    (SELECT practica_id FROM public.practicas WHERE code = 1),
    (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), NULL)
ON CONFLICT (staff_id) DO NOTHING;

-- u3: usuario autenticado CON el permiso pero SIN ficha de personal (caso 3, has_staff_record=false).
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    VALUES ('a0902150-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'dash-personal-test-3@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- role_key de utilería SIN dashboard.personal.read -- exclusivamente dentro de esta
-- transacción (ROLLBACK la elimina); ningún role_key real del catálogo carece del permiso.
INSERT INTO public.authorization_roles (role_key, label_key, display_order, is_system, legacy_app_role)
VALUES ('dash_personal_test_denied', 'authz.role.dash_personal_test_denied', 999, false, 'staff')
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_key) VALUES
  ('a0902150-0000-4000-8000-000000000001', 'assistant'),
  ('a0902150-0000-4000-8000-000000000002', 'manager'),
  ('a0902150-0000-4000-8000-000000000003', 'assistant'),
  ('a0902150-0000-4000-8000-000000000004', 'dash_personal_test_denied'),
  ('a0902150-0000-4000-8000-000000000005', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

-- ── Encargos ──────────────────────────────────────────────────────────────────────────────
-- E1: principal, s1 asignado + horas. E2: solo asignación (sin horas, chequeo 17). E3: solo
-- horas (sin asignación, chequeo 18). E_OTHER: encargo ajeno, asignación de s2 (aislamiento).
-- E_FR: encargo de utilería para el work_order que exige fre_validate_wo_in_request().
-- work_order_required=false en las 5: check_wo_approved() (trigger BEFORE INSERT/UPDATE en
-- time_entries) exige una OT Approved por engagement salvo que este flag la desactive -- el
-- fixture no necesita ejercitar ese gate, solo horas guardadas/asignadas. E_FR lleva
-- manager_id: fr_wo_set_manager() (trigger en fund_request_work_orders) exige que la OT
-- tenga un gerente asignado en su engagement.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                status, fecha_cierre, society_id, funcion, practica,
                                work_order_required, manager_id) VALUES
  ('70902150-0000-4000-8000-000000000001', '60902150-0000-4000-8000-000000000001',
   '902150 E1 Principal', 'PERS-E1', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), 1, 1, false, NULL),
  ('70902150-0000-4000-8000-000000000002', '60902150-0000-4000-8000-000000000001',
   '902150 E2 SoloAsignado', 'PERS-E2', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), 0, 1, false, NULL),
  ('70902150-0000-4000-8000-000000000003', '60902150-0000-4000-8000-000000000001',
   '902150 E3 SoloRegistrado', 'PERS-E3', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), 1, 1, false, NULL),
  ('70902150-0000-4000-8000-000000000004', '60902150-0000-4000-8000-000000000001',
   '902150 E Other', 'PERS-EOTH', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), 1, 1, false, NULL),
  ('70902150-0000-4000-8000-000000000005', '60902150-0000-4000-8000-000000000001',
   '902150 E FundRequest', 'PERS-EFR', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), 1, 1, false,
   '50902150-0000-4000-8000-000000000002')
ON CONFLICT (engagement_id) DO NOTHING;

-- ── Asignaciones (decisiones.md §14: hours_per_week completo por fila solapada) ──────────
-- E1: a1 (20h) + a2 (5h) vigentes, se SUMAN (chequeo 14) -- semanas -1..+2 (v_operational_end
-- = semana actual + 3 siguientes). a3 (deleted_at) y a4 (CANCELLED) EXCLUIDAS (chequeos 12/13).
-- E2: a5 (4h), sin horas cargadas (chequeo 17). E_OTHER: a6 (staff s2, aislamiento chequeo 5).
INSERT INTO public.engagement_assignments (assignment_id, engagement_id, staff_id, start_date,
                                           end_date, hours_per_week, allocation_percent, status, category_id) VALUES
  ('ea902150-0000-4000-8000-000000000001', '70902150-0000-4000-8000-000000000001',
   '50902150-0000-4000-8000-000000000001', pg_temp.week(-1), pg_temp.week(2) + 6, 20, 100, 'CONFIRMED', 'c0902150-0000-4000-8000-000000000001'),
  ('ea902150-0000-4000-8000-000000000002', '70902150-0000-4000-8000-000000000001',
   '50902150-0000-4000-8000-000000000001', pg_temp.week(-1), pg_temp.week(2) + 6, 5, 100, 'CONFIRMED', 'c0902150-0000-4000-8000-000000000001'),
  ('ea902150-0000-4000-8000-000000000003', '70902150-0000-4000-8000-000000000001',
   '50902150-0000-4000-8000-000000000001', pg_temp.week(-1), pg_temp.week(2) + 6, 40, 100, 'CONFIRMED', 'c0902150-0000-4000-8000-000000000001'),
  ('ea902150-0000-4000-8000-000000000004', '70902150-0000-4000-8000-000000000001',
   '50902150-0000-4000-8000-000000000001', pg_temp.week(-1), pg_temp.week(2) + 6, 40, 100, 'CANCELLED', 'c0902150-0000-4000-8000-000000000001'),
  ('ea902150-0000-4000-8000-000000000005', '70902150-0000-4000-8000-000000000002',
   '50902150-0000-4000-8000-000000000001', pg_temp.week(0), pg_temp.week(0) + 6, 4, 100, 'CONFIRMED', 'c0902150-0000-4000-8000-000000000001'),
  ('ea902150-0000-4000-8000-000000000006', '70902150-0000-4000-8000-000000000004',
   '50902150-0000-4000-8000-000000000002', pg_temp.week(0), pg_temp.week(0) + 6, 30, 100, 'CONFIRMED', 'c0902150-0000-4000-8000-000000000001')
ON CONFLICT (assignment_id) DO NOTHING;

UPDATE public.engagement_assignments SET deleted_at = now()
  WHERE assignment_id = 'ea902150-0000-4000-8000-000000000003';

-- ── Cumplimiento de timesheets: 7 semanas con datos, dentro de las 12 (offset -9..2) ────
-- -9 NOT_LOGGED (sin período, sin horas) -- ningún dato, es el default.
-- -8 PENDING sin líneas de aprobación en absoluto (chequeo 20).
-- -7 PENDING con una línea 'pending' con review_notes no vacía (revisión solicitada, chequeo 24).
-- -6 NOT_LOGGED (idéntico a -9, sin datos).
-- -5 NOT_SUBMITTED (sin período, con horas -- chequeo 16/19).
-- -4 APPROVED (período enviado, línea aprobada -- chequeo 19/22).
-- -3 REJECTED (período enviado, una línea aprobada + una rechazada con review_notes -- el
--    rechazo prevalece, chequeo 21/23; approved_hours cuenta SOLO la línea aprobada, chequeo 22).
-- -2 DRAFT (período sin enviar, con horas -- chequeo 19).
-- current(0) APPROVED (current_week.approved_hours, chequeo separado de compliance) -- creado
-- ANTES del bloque de horas de la semana actual: time_entries.period_id tiene FK a
-- timesheet_periods.period_id, así que el período debe existir primero.
INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year, submitted_at) VALUES
  ('15902150-0000-4000-8000-000000000008', '50902150-0000-4000-8000-000000000001', pg_temp.week(-8), 1, 2026, now()),
  ('15902150-0000-4000-8000-000000000007', '50902150-0000-4000-8000-000000000001', pg_temp.week(-7), 2, 2026, now()),
  ('15902150-0000-4000-8000-000000000004', '50902150-0000-4000-8000-000000000001', pg_temp.week(-4), 3, 2026, now()),
  ('15902150-0000-4000-8000-000000000003', '50902150-0000-4000-8000-000000000001', pg_temp.week(-3), 4, 2026, now()),
  ('15902150-0000-4000-8000-000000000002', '50902150-0000-4000-8000-000000000001', pg_temp.week(-2), 5, 2026, NULL),
  ('15902150-0000-4000-8000-000000000000', '50902150-0000-4000-8000-000000000001', pg_temp.week(0), 6, 2026, now())
ON CONFLICT (period_id) DO NOTHING;

-- ── Horas guardadas / pronóstico de la semana actual (offset 0) ─────────────────────────
-- E1/PA1: 10h reales (is_forecast=false), vinculadas al período de la semana actual (arriba)
-- -- cuenta en saved_hours, current_week_engagements y current_week.approved_hours (línea
-- aprobada más abajo). E1/PA2 misma fecha: 50h PRONÓSTICO (is_forecast=true) -- SOLO
-- current_week.forecast_hours (chequeo 15); valor grande a propósito para que una fuga sea
-- inconfundible. E3/PA1: 6h reales SIN asignación, SIN período -- chequeo 18 (assigned_hours=0
-- en current_week_engagements); period_id=NULL a propósito, no participa de current_week.approved_hours.
INSERT INTO public.time_entries (time_id, date_worked, hours_logged, staff_id, engagement_id,
                                 activity_id, period_id, is_forecast) VALUES
  ('16902150-0000-4000-8000-000000000001', pg_temp.week(0), 10, '50902150-0000-4000-8000-000000000001',
   '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000001', '15902150-0000-4000-8000-000000000000', false),
  ('16902150-0000-4000-8000-000000000002', pg_temp.week(0), 50, '50902150-0000-4000-8000-000000000001',
   '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000002', NULL, true),
  ('16902150-0000-4000-8000-000000000003', pg_temp.week(0), 6, '50902150-0000-4000-8000-000000000001',
   '70902150-0000-4000-8000-000000000003', 'ac902150-0000-4000-8000-000000000001', NULL, false)
ON CONFLICT (time_id) DO NOTHING;

INSERT INTO public.time_entries (time_id, date_worked, hours_logged, staff_id, engagement_id,
                                 activity_id, period_id, is_forecast) VALUES
  ('16902150-0000-4000-8000-000000000008', pg_temp.week(-8) + 1, 5, '50902150-0000-4000-8000-000000000001', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000001', '15902150-0000-4000-8000-000000000008', false),
  ('16902150-0000-4000-8000-000000000007', pg_temp.week(-7) + 1, 4, '50902150-0000-4000-8000-000000000001', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000001', '15902150-0000-4000-8000-000000000007', false),
  ('16902150-0000-4000-8000-000000000005', pg_temp.week(-5) + 1, 7, '50902150-0000-4000-8000-000000000001', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000001', NULL, false),
  ('16902150-0000-4000-8000-000000000004', pg_temp.week(-4) + 1, 8, '50902150-0000-4000-8000-000000000001', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000001', '15902150-0000-4000-8000-000000000004', false),
  ('16902150-0000-4000-8000-00000000003a', pg_temp.week(-3) + 1, 3, '50902150-0000-4000-8000-000000000001', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000001', '15902150-0000-4000-8000-000000000003', false),
  ('16902150-0000-4000-8000-00000000003b', pg_temp.week(-3) + 1, 9, '50902150-0000-4000-8000-000000000001', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000002', '15902150-0000-4000-8000-000000000003', false),
  ('16902150-0000-4000-8000-000000000002', pg_temp.week(-2) + 1, 6, '50902150-0000-4000-8000-000000000001', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000001', '15902150-0000-4000-8000-000000000002', false)
ON CONFLICT (time_id) DO NOTHING;

INSERT INTO public.timesheet_line_approvals (approval_id, period_id, engagement_id, activity_id, status, approved_at, review_notes) VALUES
  -- -7: revisión solicitada -- status vuelto a 'pending' con review_notes no vacía (useRequestRevision).
  ('17902150-0000-4000-8000-000000000007', '15902150-0000-4000-8000-000000000007', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000001', 'pending', NULL, 'Falta detalle de horas, por favor corregir'),
  -- -4: APPROVED.
  ('17902150-0000-4000-8000-000000000004', '15902150-0000-4000-8000-000000000004', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000001', 'approved', pg_temp.today()::timestamptz, NULL),
  -- -3: una aprobada (PA1, 3h) + una rechazada con nota (PA2, 9h) -- REJECTED prevalece.
  ('17902150-0000-4000-8000-00000000003a', '15902150-0000-4000-8000-000000000003', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000001', 'approved', pg_temp.today()::timestamptz, NULL),
  ('17902150-0000-4000-8000-00000000003b', '15902150-0000-4000-8000-000000000003', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000002', 'rejected', pg_temp.today()::timestamptz, 'Falta respaldo de la actividad PA2'),
  -- current (0): 10h de PA1 aprobadas -- current_week.approved_hours = 10.
  ('17902150-0000-4000-8000-000000000000', '15902150-0000-4000-8000-000000000000', '70902150-0000-4000-8000-000000000001', 'ac902150-0000-4000-8000-000000000001', 'approved', pg_temp.today()::timestamptz, NULL)
ON CONFLICT (approval_id) DO NOTHING;
-- -8 (PENDING sin líneas en absoluto) y -2 (DRAFT) no llevan ninguna fila de aprobación.

-- ── Fondos y gastos ───────────────────────────────────────────────────────────────────────
-- Work order de utilería (fre_validate_wo_in_request() exige una fila en
-- fund_request_work_orders para el par fund_request_id/wo_id de cada gasto).
-- approval_status='Approved': fr_wo_validate_approved() (trigger en fund_request_work_orders)
-- exige que la OT esté Approved antes de poder asignarle una solicitud de fondos.
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, tax_rate, adjustment_amount, approval_status) VALUES
  ('d0902150-0000-4000-8000-000000000001', '70902150-0000-4000-8000-000000000005', 'BOB', 'High', 0.13, 0, 'Approved')
ON CONFLICT (wo_id) DO NOTHING;

-- FR1 (BOB): vence HOY (chequeo 32), 5 gastos que ejercitan revisado_asistente/aprobado_gerente/
-- observado/rechazado/sin-respaldo (chequeo 28) y la separación pendiente-de-contabilidad vs.
-- revisado (chequeos 26/27).
-- FR2 (BOB): vencida, sin gastos (array vacío soportado).
-- FR_CLOSED / FR_CANCELLED: excluidas del foco operativo (chequeo 29).
-- FR3 (USD legado): fund_requests.currency='USD' -- fixture creado únicamente dentro de esta
-- transacción, deshabilitando y restaurando tr_fund_requests_enforce_bob alrededor del INSERT
-- (la migración NO se toca). Ejercita separación BOB/USD sin total combinado (chequeos 30/31).
INSERT INTO public.fund_requests (fund_request_id, request_number, requester_staff_id,
                                  total_requested_amount, currency, status, due_back_date,
                                  submitted_at, total_disbursed_amount) VALUES
  ('f3902150-0000-4000-8000-000000000001', 'SF-PERS-1', '50902150-0000-4000-8000-000000000001', 500, 'BOB', 'aprobado_gerente', pg_temp.today(), (pg_temp.today() - 5)::timestamptz, 500),
  ('f3902150-0000-4000-8000-000000000002', 'SF-PERS-2', '50902150-0000-4000-8000-000000000001', 200, 'BOB', 'pendiente_aprobacion', pg_temp.today() - 3, (pg_temp.today() - 4)::timestamptz, 0),
  ('f3902150-0000-4000-8000-000000000009', 'SF-PERS-9', '50902150-0000-4000-8000-000000000001', 80, 'BOB', 'cerrado', pg_temp.today() - 20, (pg_temp.today() - 25)::timestamptz, 80),
  ('f3902150-0000-4000-8000-00000000000a', 'SF-PERS-A', '50902150-0000-4000-8000-000000000001', 60, 'BOB', 'cancelado', NULL, (pg_temp.today() - 25)::timestamptz, 0)
ON CONFLICT (fund_request_id) DO NOTHING;

ALTER TABLE public.fund_requests DISABLE TRIGGER tr_fund_requests_enforce_bob;
INSERT INTO public.fund_requests (fund_request_id, request_number, requester_staff_id,
                                  total_requested_amount, currency, status, due_back_date,
                                  submitted_at, total_disbursed_amount) VALUES
  ('f3902150-0000-4000-8000-000000000003', 'SF-PERS-3', '50902150-0000-4000-8000-000000000001', 1000, 'USD', 'fondos_entregados', pg_temp.today() + 5, (pg_temp.today() - 10)::timestamptz, 1000)
ON CONFLICT (fund_request_id) DO NOTHING;
ALTER TABLE public.fund_requests ENABLE TRIGGER tr_fund_requests_enforce_bob;

INSERT INTO public.fund_request_work_orders (fr_wo_id, fund_request_id, wo_id, allocated_amount, approval_status) VALUES
  ('f4902150-0000-4000-8000-000000000001', 'f3902150-0000-4000-8000-000000000001', 'd0902150-0000-4000-8000-000000000001', 500, 'aprobado'),
  ('f4902150-0000-4000-8000-000000000002', 'f3902150-0000-4000-8000-000000000002', 'd0902150-0000-4000-8000-000000000001', 200, 'pendiente')
ON CONFLICT (fr_wo_id) DO NOTHING;

-- FR3 (USD legado): fr_wo_validate_approved() exige currency='BOB' en la solicitud para
-- asignarle una OT -- solo alcanzable en datos reales por una fila legada de antes de ese
-- trigger. Igual que con tr_fund_requests_enforce_bob más arriba, se deshabilita y restaura
-- SOLO alrededor de esta inserción puntual; la migración real no se toca.
ALTER TABLE public.fund_request_work_orders DISABLE TRIGGER tr_fr_wo_validate_approved;
INSERT INTO public.fund_request_work_orders (fr_wo_id, fund_request_id, wo_id, allocated_amount, approval_status) VALUES
  ('f4902150-0000-4000-8000-000000000003', 'f3902150-0000-4000-8000-000000000003', 'd0902150-0000-4000-8000-000000000001', 1000, 'aprobado')
ON CONFLICT (fr_wo_id) DO NOTHING;
ALTER TABLE public.fund_request_work_orders ENABLE TRIGGER tr_fr_wo_validate_approved;

INSERT INTO public.fund_request_expenses (fre_id, fund_request_id, wo_id, expense_type_id,
                                          expense_date, amount, currency, status, attachment_url) VALUES
  ('f2902150-0000-4000-8000-000000000001', 'f3902150-0000-4000-8000-000000000001', 'd0902150-0000-4000-8000-000000000001', '9e902150-0000-4000-8000-000000000001', pg_temp.today() - 4, 300, 'BOB', 'revisado_asistente', 'https://x/1.pdf'),
  ('f2902150-0000-4000-8000-000000000002', 'f3902150-0000-4000-8000-000000000001', 'd0902150-0000-4000-8000-000000000001', '9e902150-0000-4000-8000-000000000001', pg_temp.today() - 3, 100, 'BOB', 'aprobado_gerente', 'https://x/2.pdf'),
  ('f2902150-0000-4000-8000-000000000003', 'f3902150-0000-4000-8000-000000000001', 'd0902150-0000-4000-8000-000000000001', '9e902150-0000-4000-8000-000000000001', pg_temp.today() - 2, 50, 'BOB', 'observado', 'https://x/3.pdf'),
  ('f2902150-0000-4000-8000-000000000004', 'f3902150-0000-4000-8000-000000000001', 'd0902150-0000-4000-8000-000000000001', '9e902150-0000-4000-8000-000000000001', pg_temp.today() - 1, 40, 'BOB', 'rechazado', 'https://x/4.pdf'),
  ('f2902150-0000-4000-8000-000000000005', 'f3902150-0000-4000-8000-000000000001', 'd0902150-0000-4000-8000-000000000001', '9e902150-0000-4000-8000-000000000001', pg_temp.today(), 20, 'BOB', 'pendiente_aprobacion', NULL),
  -- review.md Iteración 2, MUST FIX R2.1: attachment_url='' (cadena vacía, no NULL) debe
  -- contar igual que ausente -- checklist_verificacion.md PT-36 define "sin respaldo" así.
  ('f2902150-0000-4000-8000-000000000007', 'f3902150-0000-4000-8000-000000000001', 'd0902150-0000-4000-8000-000000000001', '9e902150-0000-4000-8000-000000000001', pg_temp.today(), 15, 'BOB', 'pendiente_aprobacion', '')
ON CONFLICT (fre_id) DO NOTHING;

INSERT INTO public.fund_request_expenses (fre_id, fund_request_id, wo_id, expense_type_id,
                                          expense_date, amount, currency, status, attachment_url) VALUES
  ('f2902150-0000-4000-8000-000000000006', 'f3902150-0000-4000-8000-000000000003', 'd0902150-0000-4000-8000-000000000001', '9e902150-0000-4000-8000-000000000001', pg_temp.today() - 6, 400, 'USD', 'revisado_asistente', 'https://x/6.pdf')
ON CONFLICT (fre_id) DO NOTHING;
-- expenses_loaded_amount(BOB) = 300+100+50+40+20+15 = 525; manager_approved_amount(BOB, aprobado_
-- gerente|revisado_asistente) = 300+100 = 400 (chequeo 26); accounting_reviewed_amount(BOB,
-- revisado_asistente) = 300 (chequeo 27). USD: expenses_loaded_amount=400, manager_approved=400,
-- accounting_reviewed=400 -- nunca se mezcla con los 525/400/300 de BOB (chequeo 31).

-- ── Helpers de sesión (patrón de rpc-dash-encargo-engagement-overview.sql) ──────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'a0902150-0000-4000-8000-' || lpad(n::text, 12, '0')
$$;

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Aserciones 1-3: corren COMO DUEÑO DE LA TABLA (mismo patrón que rpc-dash-encargo, las
-- aserciones que leen/escriben authorization_roles/authorization_role_permissions directo
-- deben correr antes del SET LOCAL ROLE authenticated -- bajo ese rol esas tablas quedan
-- detrás de RLS y un SELECT vería 0 filas SIN error).
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Sin sesión -> FORBIDDEN: no session ───────────────────────────────────────────────
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.personal_overview(pg_temp.today() - 90, pg_temp.today());
    RAISE EXCEPTION 'FAIL: sin sesión debía lanzar FORBIDDEN: no session';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FORBIDDEN: no session%' THEN
      RAISE EXCEPTION 'FAIL: excepción inesperada sin sesión: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK 1: sin sesión -> FORBIDDEN: no session';
END $$;

-- ── 2. Rol sin dashboard.personal.read (role_key de utilería) -> denegado ───────────────
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  BEGIN
    PERFORM public.personal_overview(pg_temp.today() - 90, pg_temp.today());
    RAISE EXCEPTION 'FAIL: rol sin el permiso debía lanzar FORBIDDEN';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FORBIDDEN: dashboard.personal.read%' THEN
      RAISE EXCEPTION 'FAIL: excepción inesperada para rol sin permiso: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK 2: role_key sin dashboard.personal.read -> FORBIDDEN: dashboard.personal.read';
END $$;

-- ── 3. La firma del RPC no contiene staff_id (chequeo 7) ────────────────────────────────
DO $$
DECLARE v_args text;
BEGIN
  SELECT pg_get_function_identity_arguments(oid) INTO v_args
  FROM pg_proc WHERE oid = 'public.personal_overview(date, date)'::regprocedure;
  IF v_args ILIKE '%staff_id%' THEN
    RAISE EXCEPTION 'FAIL: la firma del RPC no debe aceptar staff_id: %', v_args;
  END IF;
  IF v_args <> 'p_history_start date, p_history_end date' THEN
    RAISE EXCEPTION 'FAIL: firma inesperada: %', v_args;
  END IF;
  RAISE NOTICE 'OK 3: firma exacta (p_history_start date, p_history_end date), sin staff_id';
END $$;

SET LOCAL ROLE authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Aserciones 4+: RPC bajo el rol `authenticated` (valida el GRANT EXECUTE real, sin
-- privilegios de superusuario).
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ── 4. Rango nulo, invertido o incompleto -> INVALID_RANGE (chequeo 9) ──────────────────
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  BEGIN
    PERFORM public.personal_overview(NULL, pg_temp.today());
    RAISE EXCEPTION 'FAIL: p_history_start NULL debía lanzar INVALID_RANGE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'INVALID_RANGE%' THEN RAISE EXCEPTION 'FAIL: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.personal_overview(pg_temp.today(), NULL);
    RAISE EXCEPTION 'FAIL: p_history_end NULL debía lanzar INVALID_RANGE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'INVALID_RANGE%' THEN RAISE EXCEPTION 'FAIL: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.personal_overview(pg_temp.today(), pg_temp.today() - 10);
    RAISE EXCEPTION 'FAIL: rango invertido debía lanzar INVALID_RANGE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'INVALID_RANGE%' THEN RAISE EXCEPTION 'FAIL: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'OK 4: rango nulo/invertido -> INVALID_RANGE';
END $$;

-- ── 5. Usuario autenticado con permiso pero SIN ficha -> has_staff_record=false ─────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v := public.personal_overview(pg_temp.today() - 90, pg_temp.today());
  IF (v->'meta'->>'has_staff_record')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL: usuario sin ficha debía dar has_staff_record=false';
  END IF;
  IF jsonb_array_length(v->'assignments') <> 0
     OR jsonb_array_length(v->'workload_weeks') <> 0
     OR jsonb_array_length(v->'compliance_weeks') <> 0
     OR jsonb_array_length(v->'fund_requests') <> 0 THEN
    RAISE EXCEPTION 'FAIL: sin ficha, todos los bloques deben quedar vacíos: %', v;
  END IF;
  RAISE NOTICE 'OK 5: sin ficha -> has_staff_record=false y bloques vacíos';
END $$;

-- ── 6. Rol operativo básico obtiene sus propias asignaciones; NO las de otra persona
-- (chequeos 4/5); admin recibe únicamente sus propios datos, no los de s1 (chequeo 6) ────
DO $$
DECLARE v jsonb; v_ids uuid[];
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.personal_overview(pg_temp.today() - 90, pg_temp.today());
  SELECT array_agg((e->>'engagement_id')::uuid) INTO v_ids FROM jsonb_array_elements(v->'assignments') e;
  IF NOT ('70902150-0000-4000-8000-000000000001' = ANY(v_ids)) THEN
    RAISE EXCEPTION 'FAIL: s1 debía ver su propia asignación en E1';
  END IF;
  IF '70902150-0000-4000-8000-000000000004' = ANY(v_ids) THEN
    RAISE EXCEPTION 'FAIL: s1 NO debía ver la asignación de s2 en E_OTHER';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(5));  -- admin
  v := public.personal_overview(pg_temp.today() - 90, pg_temp.today());
  SELECT array_agg((e->>'engagement_id')::uuid) INTO v_ids FROM jsonb_array_elements(v->'assignments') e;
  IF '70902150-0000-4000-8000-000000000001' = ANY(v_ids) THEN
    RAISE EXCEPTION 'FAIL: admin NO debía ver la asignación de s1 -- el RPC nunca amplía alcance por rol';
  END IF;
  IF jsonb_array_length(v->'fund_requests') <> 0 THEN
    RAISE EXCEPTION 'FAIL: admin (s5, sin solicitudes propias) debía ver fund_requests=[]';
  END IF;
  RAISE NOTICE 'OK 6: cada rol ve SOLO sus propias asignaciones/solicitudes; admin no amplía alcance';
END $$;

-- ── 7. PUBLIC/anon sin privilegio de ejecución; authenticated/service_role sí (chequeo 8) ─
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL
     AND has_function_privilege('anon', 'public.personal_overview(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon NO debía tener EXECUTE sobre personal_overview';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.personal_overview(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated debía tener EXECUTE sobre personal_overview';
  END IF;
  IF to_regrole('service_role') IS NOT NULL
     AND NOT has_function_privilege('service_role', 'public.personal_overview(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: service_role debía tener EXECUTE sobre personal_overview';
  END IF;
  RAISE NOTICE 'OK 7: anon sin EXECUTE; authenticated/service_role con EXECUTE';
END $$;

-- ── 8. Cuatro buckets lunes-domingo exactos; asignaciones se suman (14); deleted_at/
-- CANCELLED excluidas (12/13); engagement solo-asignado y solo-registrado (17/18) ────────
DO $$
DECLARE v jsonb; v_w0 jsonb; v_planned numeric; v_cwe jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.personal_overview(pg_temp.today() - 90, pg_temp.today());

  IF jsonb_array_length(v->'workload_weeks') <> 4 THEN
    RAISE EXCEPTION 'FAIL: workload_weeks debía tener exactamente 4 elementos: %', jsonb_array_length(v->'workload_weeks');
  END IF;
  IF (v->'workload_weeks'->0->>'week_start')::date <> pg_temp.week(0) THEN
    RAISE EXCEPTION 'FAIL: primer bucket debía ser la semana actual';
  END IF;
  IF (v->'workload_weeks'->3->>'week_end')::date <> (pg_temp.week(3) + 6) THEN
    RAISE EXCEPTION 'FAIL: último bucket debía cerrar en la semana +3';
  END IF;

  v_w0 := v->'workload_weeks'->0;
  v_planned := (v_w0->>'planned_hours')::numeric;
  -- E1: a1 (20h) + a2 (5h) suman 25 -- a3 (deleted) y a4 (CANCELLED) quedan excluidas.
  -- E2: a5 (4h) también solapa la semana actual -- planned_hours es la suma de TODAS las
  -- asignaciones propias que solapan, sin importar el encargo -- 20+5+4 = 29.
  IF v_planned <> 29 THEN
    RAISE EXCEPTION 'FAIL: planned_hours semana actual debía ser 29 (20+5 en E1 + 4 en E2, sin deleted/CANCELLED): %', v_planned;
  END IF;

  -- current_week_engagements: E2 (solo asignado, 4h, sin horas) y E3 (solo registrado, 6h, sin asignación).
  SELECT jsonb_agg(e) INTO v_cwe FROM jsonb_array_elements(v->'current_week_engagements') e;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cwe) e
    WHERE (e->>'engagement_id')::uuid = '70902150-0000-4000-8000-000000000002'
      AND (e->>'assigned_hours')::numeric = 4 AND (e->>'saved_hours')::numeric = 0
  ) THEN
    RAISE EXCEPTION 'FAIL: E2 debía aparecer con assigned_hours=4, saved_hours=0 (chequeo 17)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cwe) e
    WHERE (e->>'engagement_id')::uuid = '70902150-0000-4000-8000-000000000003'
      AND (e->>'assigned_hours')::numeric = 0 AND (e->>'saved_hours')::numeric = 6
  ) THEN
    RAISE EXCEPTION 'FAIL: E3 debía aparecer con assigned_hours=0, saved_hours=6 (chequeo 18)';
  END IF;

  RAISE NOTICE 'OK 8: 4 buckets lunes-domingo; suma de asignaciones (29h = 20+5 en E1 + 4 en E2); deleted_at/CANCELLED excluidas; unión asignado/registrado';
END $$;

-- ── 9. Pronóstico SOLO en current_week.forecast_hours (chequeo 15) ──────────────────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.personal_overview(pg_temp.today() - 90, pg_temp.today());
  IF (v->'current_week'->>'forecast_hours')::numeric <> 50 THEN
    RAISE EXCEPTION 'FAIL: forecast_hours debía ser 50: %', v->'current_week'->>'forecast_hours';
  END IF;
  -- Las 50h de pronóstico NO deben sumarse a saved_hours (10 reales de E1 + 6 de E3 = 16).
  IF (v->'current_week'->>'saved_hours')::numeric <> 16 THEN
    RAISE EXCEPTION 'FAIL: saved_hours no debía incluir el pronóstico (esperado 16): %', v->'current_week'->>'saved_hours';
  END IF;
  -- current_week.approved_hours = 10 (línea PA1 aprobada hoy).
  IF (v->'current_week'->>'approved_hours')::numeric <> 10 THEN
    RAISE EXCEPTION 'FAIL: approved_hours de la semana actual debía ser 10: %', v->'current_week'->>'approved_hours';
  END IF;
  RAISE NOTICE 'OK 9: forecast_hours=50 aislado de saved_hours(16)/approved_hours(10)';
END $$;

-- ── 10. Doce semanas exactas (9 anteriores + actual + 2 futuras), estados completos
-- (chequeos 19/20/21/22/25), notas rechazada y de revisión visibles (23/24) ──────────────
DO $$
DECLARE
  v jsonb; v_weeks jsonb;
  v_status_m9 text; v_status_m8 text; v_status_m7 text; v_status_m5 text;
  v_status_m4 text; v_status_m3 text; v_status_m2 text; v_status_p1 text; v_status_p2 text;
  v_notes_m3 jsonb; v_notes_m7 jsonb; v_approved_m4 numeric; v_approved_m3 numeric;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.personal_overview(pg_temp.today() - 90, pg_temp.today());
  v_weeks := v->'compliance_weeks';

  IF jsonb_array_length(v_weeks) <> 12 THEN
    RAISE EXCEPTION 'FAIL: compliance_weeks debía tener 12 elementos: %', jsonb_array_length(v_weeks);
  END IF;
  IF (v_weeks->0->>'week_start')::date <> pg_temp.week(-9) THEN
    RAISE EXCEPTION 'FAIL: primera semana debía ser offset -9';
  END IF;
  IF (v_weeks->11->>'week_start')::date <> pg_temp.week(2) THEN
    RAISE EXCEPTION 'FAIL: última semana debía ser offset +2';
  END IF;

  SELECT e->>'status' INTO v_status_m9 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(-9);
  SELECT e->>'status' INTO v_status_m8 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(-8);
  SELECT e->>'status' INTO v_status_m7 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(-7);
  SELECT e->>'status' INTO v_status_m5 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(-5);
  SELECT e->>'status' INTO v_status_m4 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(-4);
  SELECT e->>'status' INTO v_status_m3 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(-3);
  SELECT e->>'status' INTO v_status_m2 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(-2);
  SELECT e->>'status' INTO v_status_p1 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(1);
  SELECT e->>'status' INTO v_status_p2 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(2);

  IF v_status_m9 <> 'NOT_LOGGED' THEN RAISE EXCEPTION 'FAIL: -9 debía ser NOT_LOGGED: %', v_status_m9; END IF;
  IF v_status_m8 <> 'PENDING' THEN RAISE EXCEPTION 'FAIL: -8 (enviada sin líneas) debía ser PENDING (chequeo 20): %', v_status_m8; END IF;
  IF v_status_m7 <> 'PENDING' THEN RAISE EXCEPTION 'FAIL: -7 (línea pending con nota) debía ser PENDING: %', v_status_m7; END IF;
  IF v_status_m5 <> 'NOT_SUBMITTED' THEN RAISE EXCEPTION 'FAIL: -5 debía ser NOT_SUBMITTED: %', v_status_m5; END IF;
  IF v_status_m4 <> 'APPROVED' THEN RAISE EXCEPTION 'FAIL: -4 debía ser APPROVED: %', v_status_m4; END IF;
  IF v_status_m3 <> 'REJECTED' THEN RAISE EXCEPTION 'FAIL: -3 (aprobada+rechazada) debía ser REJECTED -- el rechazo prevalece (chequeo 21): %', v_status_m3; END IF;
  IF v_status_m2 <> 'DRAFT' THEN RAISE EXCEPTION 'FAIL: -2 debía ser DRAFT: %', v_status_m2; END IF;
  IF v_status_p1 <> 'FUTURE' THEN RAISE EXCEPTION 'FAIL: +1 debía ser FUTURE: %', v_status_p1; END IF;
  IF v_status_p2 <> 'FUTURE' THEN RAISE EXCEPTION 'FAIL: +2 debía ser FUTURE: %', v_status_p2; END IF;

  SELECT (e->>'approved_hours')::numeric INTO v_approved_m4 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(-4);
  SELECT (e->>'approved_hours')::numeric INTO v_approved_m3 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(-3);
  IF v_approved_m4 <> 8 THEN RAISE EXCEPTION 'FAIL: -4 approved_hours debía ser 8: %', v_approved_m4; END IF;
  -- -3: solo la línea PA1 (3h) está aprobada; PA2 (9h) está rechazada y NO cuenta (chequeo 22).
  IF v_approved_m3 <> 3 THEN RAISE EXCEPTION 'FAIL: -3 approved_hours debía ser 3 (solo la línea aprobada, chequeo 22): %', v_approved_m3; END IF;

  SELECT e->'review_notes' INTO v_notes_m3 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(-3);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_notes_m3) n WHERE n->>'approval_status' = 'rejected' AND n->>'notes' = 'Falta respaldo de la actividad PA2') THEN
    RAISE EXCEPTION 'FAIL: nota de rechazo (-3) debía estar visible (chequeo 23): %', v_notes_m3;
  END IF;

  SELECT e->'review_notes' INTO v_notes_m7 FROM jsonb_array_elements(v_weeks) e WHERE (e->>'week_start')::date = pg_temp.week(-7);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_notes_m7) n WHERE n->>'approval_status' = 'pending' AND n->>'notes' = 'Falta detalle de horas, por favor corregir') THEN
    RAISE EXCEPTION 'FAIL: nota de revisión solicitada (-7, pending) debía estar visible (chequeo 24): %', v_notes_m7;
  END IF;

  RAISE NOTICE 'OK 10: 12 semanas exactas; estados FUTURE/NOT_LOGGED/NOT_SUBMITTED/DRAFT/PENDING/REJECTED/APPROVED; rechazo prevalece; approved_hours exacto; notas de rechazo y de revisión visibles';
END $$;

-- ── 11. Fondos: aprobado_gerente en pendiente de contabilidad, revisado en ambos, gastos
-- observado/rechazado/sin-respaldo, solicitudes cerrado/cancelado excluidas, BOB/USD nunca
-- mezcladas, vence hoy exacto (chequeos 26/27/28/29/30/31/32) ───────────────────────────
DO $$
DECLARE
  v jsonb; v_frs jsonb; v_fr1 jsonb; v_fr3 jsonb; v_amounts_bob jsonb; v_amounts_usd jsonb;
  v_expenses jsonb; v_ids uuid[];
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.personal_overview(pg_temp.today() - 90, pg_temp.today());
  v_frs := v->'fund_requests';

  SELECT array_agg((e->>'fund_request_id')::uuid) INTO v_ids FROM jsonb_array_elements(v_frs) e;
  IF 'f3902150-0000-4000-8000-000000000009' = ANY(v_ids) OR 'f3902150-0000-4000-8000-00000000000a' = ANY(v_ids) THEN
    RAISE EXCEPTION 'FAIL: solicitudes cerrado/cancelado debían quedar excluidas (chequeo 29): %', v_ids;
  END IF;

  SELECT e INTO v_fr1 FROM jsonb_array_elements(v_frs) e WHERE (e->>'fund_request_id')::uuid = 'f3902150-0000-4000-8000-000000000001';
  IF v_fr1 IS NULL THEN RAISE EXCEPTION 'FAIL: FR1 debía estar presente'; END IF;
  IF (v_fr1->>'due_back_date')::date <> pg_temp.today() THEN
    RAISE EXCEPTION 'FAIL: due_back_date de FR1 debía ser hoy (chequeo 32): %', v_fr1->>'due_back_date';
  END IF;

  SELECT a INTO v_amounts_bob FROM jsonb_array_elements(v_fr1->'amounts_by_currency') a WHERE a->>'currency' = 'BOB';
  IF (v_amounts_bob->>'manager_approved_amount')::numeric <> 400 THEN
    RAISE EXCEPTION 'FAIL: manager_approved_amount(BOB) debía ser 400 (aprobado_gerente+revisado_asistente, chequeo 26): %', v_amounts_bob;
  END IF;
  IF (v_amounts_bob->>'accounting_reviewed_amount')::numeric <> 300 THEN
    RAISE EXCEPTION 'FAIL: accounting_reviewed_amount(BOB) debía ser 300 (solo revisado_asistente, chequeo 27): %', v_amounts_bob;
  END IF;
  IF (v_amounts_bob->>'expenses_loaded_amount')::numeric <> 525 THEN
    RAISE EXCEPTION 'FAIL: expenses_loaded_amount(BOB) debía ser 525: %', v_amounts_bob;
  END IF;
  IF jsonb_array_length(v_fr1->'amounts_by_currency') <> 1 THEN
    RAISE EXCEPTION 'FAIL: FR1 es 100%% BOB -- no debía traer un bloque USD (chequeo 31): %', v_fr1->'amounts_by_currency';
  END IF;

  SELECT jsonb_agg(e) INTO v_expenses FROM jsonb_array_elements(v_fr1->'expenses') e;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_expenses) e WHERE e->>'status' = 'observado') THEN
    RAISE EXCEPTION 'FAIL: FR1 debía tener un gasto observado (chequeo 28)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_expenses) e WHERE e->>'status' = 'rechazado') THEN
    RAISE EXCEPTION 'FAIL: FR1 debía tener un gasto rechazado (chequeo 28)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_expenses) e WHERE (e->>'has_attachment')::boolean = false) THEN
    RAISE EXCEPTION 'FAIL: FR1 debía tener un gasto sin respaldo (chequeo 28)';
  END IF;
  -- review.md Iteración 2, MUST FIX R2.1: dos gastos sin respaldo -- uno con
  -- attachment_url NULL (fre ...0005) y otro con attachment_url='' (fre ...0007) -- ambos
  -- deben contar como has_attachment=false, no solo el NULL.
  IF (SELECT count(*) FROM jsonb_array_elements(v_expenses) e WHERE (e->>'has_attachment')::boolean = false) <> 2 THEN
    RAISE EXCEPTION 'FAIL: FR1 debía tener exactamente 2 gastos sin respaldo (NULL y '''', chequeo 28/R2.1): %', v_expenses;
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_expenses) e
    WHERE (e->>'expense_id')::uuid = 'f2902150-0000-4000-8000-000000000007'
      AND (e->>'has_attachment')::boolean <> false
  ) THEN
    RAISE EXCEPTION 'FAIL: attachment_url='''' (cadena vacía) debía dar has_attachment=false (chequeo 28/R2.1)';
  END IF;

  -- FR3 (USD legado): request_currency='USD', su bloque de importes queda SOLO en USD,
  -- nunca sumado ni confundido con los importes BOB de FR1 (chequeos 30/31).
  SELECT e INTO v_fr3 FROM jsonb_array_elements(v_frs) e WHERE (e->>'fund_request_id')::uuid = 'f3902150-0000-4000-8000-000000000003';
  IF v_fr3->>'request_currency' <> 'USD' THEN RAISE EXCEPTION 'FAIL: FR3 debía conservar request_currency=USD'; END IF;
  SELECT a INTO v_amounts_usd FROM jsonb_array_elements(v_fr3->'amounts_by_currency') a WHERE a->>'currency' = 'USD';
  IF (v_amounts_usd->>'expenses_loaded_amount')::numeric <> 400 THEN
    RAISE EXCEPTION 'FAIL: expenses_loaded_amount(USD, FR3) debía ser 400: %', v_amounts_usd;
  END IF;
  IF jsonb_array_length(v_fr3->'amounts_by_currency') <> 1 THEN
    RAISE EXCEPTION 'FAIL: FR3 es 100%% USD -- no debía traer un bloque BOB (chequeo 30/31)';
  END IF;

  -- Sin campo de total BOB+USD en ningún nivel del payload.
  IF v ? 'total_bob_usd' OR v_fr1 ? 'total_amount' OR v_fr3 ? 'total_amount' THEN
    RAISE EXCEPTION 'FAIL: no debe existir ningún campo de total BOB+USD combinado (chequeo 31)';
  END IF;

  RAISE NOTICE 'OK 11: aprobado_gerente/revisado_asistente exactos; observado/rechazado/sin-respaldo; cerrado/cancelado excluidas; BOB/USD nunca mezcladas; vence hoy exacto';
END $$;

-- ── 12. Histórico respeta exactamente los parámetros; cambiarlo no cambia lo operativo
-- (chequeos 33/34) ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v1 jsonb; v2 jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v1 := public.personal_overview(pg_temp.week(-8), pg_temp.week(-7) + 6);
  v2 := public.personal_overview(pg_temp.week(-3), pg_temp.week(-3) + 6);

  IF (v1->'meta'->>'history_start')::date <> pg_temp.week(-8) OR (v1->'meta'->>'history_end')::date <> (pg_temp.week(-7) + 6) THEN
    RAISE EXCEPTION 'FAIL: meta.history_start/end debía reflejar los parámetros exactos (v1)';
  END IF;
  -- v1 cubre las semanas -8 (5h) y -7 (4h) -> historical.saved_hours = 9.
  IF (v1->'historical'->>'saved_hours')::numeric <> 9 THEN
    RAISE EXCEPTION 'FAIL: historical.saved_hours(v1) debía ser 9: %', v1->'historical'->>'saved_hours';
  END IF;
  -- v2 cubre solo la semana -3 (3h PA1 + 9h PA2 = 12h).
  IF (v2->'historical'->>'saved_hours')::numeric <> 12 THEN
    RAISE EXCEPTION 'FAIL: historical.saved_hours(v2) debía ser 12: %', v2->'historical'->>'saved_hours';
  END IF;

  -- Cambiar el histórico NO debe alterar current_week/workload_weeks/compliance_weeks/assignments.
  IF v1->'current_week' <> v2->'current_week' THEN RAISE EXCEPTION 'FAIL: current_week no debía cambiar con el histórico'; END IF;
  IF v1->'workload_weeks' <> v2->'workload_weeks' THEN RAISE EXCEPTION 'FAIL: workload_weeks no debía cambiar con el histórico'; END IF;
  IF v1->'compliance_weeks' <> v2->'compliance_weeks' THEN RAISE EXCEPTION 'FAIL: compliance_weeks no debía cambiar con el histórico'; END IF;
  IF v1->'assignments' <> v2->'assignments' THEN RAISE EXCEPTION 'FAIL: assignments no debía cambiar con el histórico'; END IF;

  RAISE NOTICE 'OK 12: historical respeta exactamente los parámetros; los bloques operativos no cambian (chequeos 33/34)';
END $$;

-- ── 13. El payload no contiene email, documento ni auth_user_id (chequeo 35) ────────────
DO $$
DECLARE v jsonb; v_text text;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.personal_overview(pg_temp.today() - 90, pg_temp.today());
  v_text := v::text;
  IF v_text ILIKE '%ruizmier.com%' OR v_text ILIKE '%auth_user_id%' OR v_text ILIKE '%id_number%' THEN
    RAISE EXCEPTION 'FAIL: el payload no debe exponer email/auth_user_id/id_number';
  END IF;
  RAISE NOTICE 'OK 13: el payload no contiene email, documento ni auth_user_id (chequeo 35)';
END $$;

RESET ROLE;

DO $$
BEGIN
  RAISE NOTICE 'PERSONAL OVERVIEW RPC: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
