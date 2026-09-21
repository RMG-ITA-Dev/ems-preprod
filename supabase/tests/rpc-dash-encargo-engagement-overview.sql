-- Transactional tests for public.can_read_engagement_dashboard() / list_dashboard_engagements()
-- / engagement_overview() -- FEAT dash_encargo (bugs/dashboard/encargo/plan_v2.md §9.1 /
-- decisiones.md).
--
-- DONDE CORRE: via supabase/tests/local/run-rls-tests.sh, contra la base scratch local con
-- el set consolidado + las migraciones incrementales + 20260915130000_dash_socio_partner_
-- overview.sql + 20260918120000_dash_encargo_engagement_overview.sql aplicados. Misma
-- convención que rpc-dash-cartera-portfolio-overview.sql: una sola transacción que SIEMPRE
-- termina en ROLLBACK, un NOTICE por chequeo que pasa, marcador final
-- 'ENGAGEMENT OVERVIEW RPC: ALL CHECKS PASSED'.
--
-- Fixture: todos los ids llevan el prefijo e07a60 reconocible. Reutiliza la sociedad/
-- práctica sembradas UNA VEZ por run-rls-tests.sh fuera de esta transacción
-- ('Harness Test Society' / 'Harness Test Practice', code=1) -- no las vuelve a crear.
--
-- Fechas relativas a "hoy" ((now() AT TIME ZONE 'America/La_Paz')::date, vía pg_temp.today())
-- y ANCLADAS POR OFFSET DE SEMANA (pg_temp.week(n) = lunes de la semana actual + 7*n días),
-- nunca por día de la semana literal -- lección de a1a1de96 (zona horaria) más el cuidado
-- adicional de que "hoy" puede caer cualquier día dentro de la semana actual.

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

-- ── Cliente ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('60e07a60-0000-4000-8000-000000000001', 'Cliente E07A60', 'NIT-E07A60-1')
ON CONFLICT (client_id) DO NOTHING;

-- ── Categorías (CategoriaA presupuestada, CategoriaB sin presupuesto) ────────────────────
INSERT INTO public.categories (category_id, category_name, practica_id, display_order,
                                rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd) VALUES
  ('c0e07a60-0000-4000-8000-000000000001', 'CategoriaA E07A60', (SELECT practica_id FROM public.practicas WHERE code = 1), 1, 500, 400, 50, 40),
  ('c0e07a60-0000-4000-8000-000000000002', 'CategoriaB E07A60', (SELECT practica_id FROM public.practicas WHERE code = 1), 2, 300, 250, 30, 25)
ON CONFLICT (category_id) DO NOTHING;

-- ── Actividades + tipo de gasto ───────────────────────────────────────────────────────────
INSERT INTO public.activity_codes (activity_id, activity_code, description, practica_id) VALUES
  ('ace07a60-0000-4000-8000-000000000001', 'EA1', 'Actividad Uno e07a60', (SELECT practica_id FROM public.practicas WHERE code = 1)),
  ('ace07a60-0000-4000-8000-000000000002', 'EA2', 'Actividad Dos e07a60', (SELECT practica_id FROM public.practicas WHERE code = 1))
ON CONFLICT (activity_id) DO NOTHING;

INSERT INTO public.expense_types (expense_type_id, expense_name) VALUES
  ('9ee07a60-0000-4000-8000-000000000001', 'Viaticos e07a60')
ON CONFLICT (expense_type_id) DO NOTHING;

-- ── Personal: 14 con role_key (u1..u14, uno por fila de decisiones.md §2 + hr_analyst
-- denegado) + 4 workers de utilería para el bloque Staffing (s16..s19, sin auth.users). ────
-- u1 admin · u2 senior_partner · u3 partner (partner_id de E1) · u4 director (partner_id de
-- E_DIRECTOR) · u5 risk_partner (partner_id de E_RISKPARTNER) · u6 sqr (sqr_id de E1 -- SIN
-- acceso ahí -- y partner_id de E_SQRPARTNER -- CON acceso ahí) · u7 manager (manager_id de
-- E1) · u8 ita_manager (manager_id de E_ITAMANAGER) · u9 tax_manager (manager_id de
-- E_TAXMANAGER) · u10 senior (encargado_id de E1) · u11 semisenior (encargado_id de
-- E_SEMISENIOR) · u12 ita_senior (specialist_it_id de E1) · u13 tax_senior
-- (specialist_tax_id de E_TAXSENIOR) · u14 hr_analyst (SIN acceso a nada, aunque se le
-- otorgue el permiso a mano).
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a0e07a60-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'dash-encargo-test-' || n || '@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 14) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, short_name, is_active,
                          practica_id, society_id, category_id)
SELECT ('50e07a60-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a0e07a60-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'E07A60', 'Sujeto' || lpad(n::text, 2, '0'), 'E07A60-' || lpad(n::text, 2, '0'),
       true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
       NULL
  FROM generate_series(1, 14) n
ON CONFLICT (staff_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_key) VALUES
  ('a0e07a60-0000-4000-8000-000000000001', 'admin'),
  ('a0e07a60-0000-4000-8000-000000000002', 'senior_partner'),
  ('a0e07a60-0000-4000-8000-000000000003', 'partner'),
  ('a0e07a60-0000-4000-8000-000000000004', 'director'),
  ('a0e07a60-0000-4000-8000-000000000005', 'risk_partner'),
  ('a0e07a60-0000-4000-8000-000000000006', 'sqr'),
  ('a0e07a60-0000-4000-8000-000000000007', 'manager'),
  ('a0e07a60-0000-4000-8000-000000000008', 'ita_manager'),
  ('a0e07a60-0000-4000-8000-000000000009', 'tax_manager'),
  ('a0e07a60-0000-4000-8000-000000000010', 'senior'),
  ('a0e07a60-0000-4000-8000-000000000011', 'semisenior'),
  ('a0e07a60-0000-4000-8000-000000000012', 'ita_senior'),
  ('a0e07a60-0000-4000-8000-000000000013', 'tax_senior'),
  ('a0e07a60-0000-4000-8000-000000000014', 'hr_analyst')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

-- Workers de utilería para Staffing (s16 workerA, s17 workerB, s18 workerC sin asignación,
-- s19 workerD para D-1 -- asignación parcial martes->jueves). Sin auth.users: nadie los
-- impersona. s19 SIN category_id propio -- ejercita el fallback a la categoría de la
-- asignación (staff.category_id es nullable).
INSERT INTO public.staff (staff_id, first_name, last_name, short_name, is_active,
                          practica_id, society_id, category_id) VALUES
  ('50e07a60-0000-4000-8000-000000000016', 'E07A60', 'WorkerA', 'E07A60-WA', true,
    (SELECT practica_id FROM public.practicas WHERE code = 1),
    (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
    'c0e07a60-0000-4000-8000-000000000001'),
  ('50e07a60-0000-4000-8000-000000000017', 'E07A60', 'WorkerB', 'E07A60-WB', true,
    (SELECT practica_id FROM public.practicas WHERE code = 1),
    (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
    'c0e07a60-0000-4000-8000-000000000001'),
  ('50e07a60-0000-4000-8000-000000000018', 'E07A60', 'WorkerC', 'E07A60-WC', true,
    (SELECT practica_id FROM public.practicas WHERE code = 1),
    (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
    'c0e07a60-0000-4000-8000-000000000002'),
  ('50e07a60-0000-4000-8000-000000000019', 'E07A60', 'WorkerD', 'E07A60-WD', true,
    (SELECT practica_id FROM public.practicas WHERE code = 1),
    (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
    NULL)
ON CONFLICT (staff_id) DO NOTHING;

-- ── Encargos ──────────────────────────────────────────────────────────────────────────────
-- E1: equipo completo salvo specialist_tax_id (NULL a propósito, decisiones.md §9.1
-- fixture). Los demás encargos son de un solo campo, dedicados a probar que CADA rol
-- accede SOLO por el campo que le corresponde (decisiones.md §2/§3.3).
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                status, fecha_cierre, society_id, partner_id, manager_id,
                                sqr_id, encargado_id, specialist_it_id, specialist_tax_id,
                                work_order_required, anio_fiscal, engagement_state_override,
                                funcion, practica) VALUES
  ('70e07a60-0000-4000-8000-000000000001', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E1 Principal', 'E07A60-E1', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50e07a60-0000-4000-8000-000000000003', '50e07a60-0000-4000-8000-000000000007',
   '50e07a60-0000-4000-8000-000000000006', '50e07a60-0000-4000-8000-000000000010',
   '50e07a60-0000-4000-8000-000000000012', NULL,
   true, 2026, NULL, 1, 1),
  ('70e07a60-0000-4000-8000-000000000002', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E Director', 'E07A60-EDIR', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50e07a60-0000-4000-8000-000000000004', NULL, NULL, NULL, NULL, NULL,
   false, 2026, NULL, 1, NULL),
  ('70e07a60-0000-4000-8000-000000000003', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E RiskPartner', 'E07A60-ERP', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50e07a60-0000-4000-8000-000000000005', NULL, NULL, NULL, NULL, NULL,
   false, 2026, NULL, 1, NULL),
  ('70e07a60-0000-4000-8000-000000000004', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E SqrPartner', 'E07A60-ESQR', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50e07a60-0000-4000-8000-000000000006', NULL, NULL, NULL, NULL, NULL,
   false, 2026, NULL, 1, NULL),
  ('70e07a60-0000-4000-8000-000000000005', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E ItaManager', 'E07A60-EITM', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   NULL, '50e07a60-0000-4000-8000-000000000008', NULL, NULL, NULL, NULL,
   false, 2026, NULL, 1, NULL),
  ('70e07a60-0000-4000-8000-000000000006', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E TaxManager', 'E07A60-ETXM', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   NULL, '50e07a60-0000-4000-8000-000000000009', NULL, NULL, NULL, NULL,
   false, 2026, NULL, 1, NULL),
  ('70e07a60-0000-4000-8000-000000000007', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E Semisenior', 'E07A60-ESEM', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   NULL, NULL, NULL, '50e07a60-0000-4000-8000-000000000011', NULL, NULL,
   false, 2026, NULL, 1, NULL),
  ('70e07a60-0000-4000-8000-000000000008', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E TaxSenior', 'E07A60-ETXS', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   NULL, NULL, NULL, NULL, NULL, '50e07a60-0000-4000-8000-000000000013',
   false, 2026, NULL, 1, NULL),
  -- E_OTHER: partner_id de un tercero ajeno a todos los roles de arriba -- negativo para
  -- todos salvo admin/senior_partner.
  ('70e07a60-0000-4000-8000-000000000009', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E Other', 'E07A60-EOTH', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50e07a60-0000-4000-8000-000000000019', NULL, NULL, NULL, NULL, NULL,
   false, 2026, NULL, 1, NULL),
  -- E_CANCELLED / E_FINALIZED / E_INACTIVE: u3 (partner) SÍ tiene acceso vía
  -- can_read_engagement_dashboard() (no filtra por estado), pero NINGUNO debe aparecer en
  -- list_dashboard_engagements() (filtro "activo" idéntico al legacy).
  ('70e07a60-0000-4000-8000-000000000010', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E Cancelled', 'E07A60-ECAN', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50e07a60-0000-4000-8000-000000000003', NULL, NULL, NULL, NULL, NULL,
   false, 2026, 6, 1, NULL),
  ('70e07a60-0000-4000-8000-000000000011', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E Finalized', 'E07A60-EFIN', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50e07a60-0000-4000-8000-000000000003', NULL, NULL, NULL, NULL, NULL,
   false, 2026, 7, 1, NULL),
  ('70e07a60-0000-4000-8000-000000000012', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E Inactive', 'E07A60-EINA', 'pending', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50e07a60-0000-4000-8000-000000000003', NULL, NULL, NULL, NULL, NULL,
   false, 2026, NULL, 1, NULL),
  -- E_ADMIN (corrección post-ejecución): funcion=0 (Administrativo), partner_id = u3 --
  -- MISMO staff que le da a u3 acceso a E1, para probar que list_dashboard_engagements()
  -- lo excluye por funcion, no porque esté fuera del alcance por rol (can_read_engagement_
  -- dashboard() SI le daría acceso puntual -- el filtro de funcion es solo del selector).
  ('70e07a60-0000-4000-8000-000000000013', '60e07a60-0000-4000-8000-000000000001',
   'E07A60 E Admin', 'E07A60-EADM', 'active', pg_temp.today() + 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50e07a60-0000-4000-8000-000000000003', NULL, NULL, NULL, NULL, NULL,
   false, 2026, NULL, 0, NULL)
ON CONFLICT (engagement_id) DO NOTHING;

-- end_date (corrección post-ejecución): E1 con fecha de fin próxima, para la aserción del
-- campo en el payload de list_dashboard_engagements(); E_ADMIN también, para confirmar que
-- el campo viaja aunque la fila misma quede excluida por funcion=0. Resto del fixture
-- queda con end_date NULL (comportamiento no afectado por esta corrección).
UPDATE public.engagements SET end_date = pg_temp.today() + 45
  WHERE engagement_id = '70e07a60-0000-4000-8000-000000000001';
UPDATE public.engagements SET end_date = pg_temp.today() + 10
  WHERE engagement_id = '70e07a60-0000-4000-8000-000000000013';

-- ── Orden de Trabajo de E1: USD con TC de plan fijo (ejercita rate_to_bob del plan, no el
-- fallback a latest_exchange_rate()) ──────────────────────────────────────────────────────
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, tax_rate,
                                adjustment_amount, approval_status, approved_at) VALUES
  ('d0e07a60-0000-4000-8000-000000000001', '70e07a60-0000-4000-8000-000000000001',
   'USD', 'High', 0.13, 0, 'Approved', (pg_temp.today() - 30)::timestamptz)
ON CONFLICT (wo_id) DO NOTHING;

ALTER TABLE public.wo_payment_plan DISABLE TRIGGER trg_wo_payment_plan_guard_exchange_rate;
ALTER TABLE public.wo_payment_plan DISABLE TRIGGER trg_wo_payment_plan_sync_fixed_installments;

INSERT INTO public.wo_payment_plan (plan_id, wo_id, exchange_rate, exchange_rate_mode) VALUES
  ('b1e07a60-0000-4000-8000-000000000001', 'd0e07a60-0000-4000-8000-000000000001', 6.96, 'fijo')
ON CONFLICT (plan_id) DO NOTHING;

ALTER TABLE public.wo_payment_plan ENABLE TRIGGER trg_wo_payment_plan_sync_fixed_installments;
ALTER TABLE public.wo_payment_plan ENABLE TRIGGER trg_wo_payment_plan_guard_exchange_rate;

-- ── Matriz de trabajo de E1: CategoriaA presupuestada en EA1 (8h) y EA2 (5h); CategoriaB
-- SIN celda (probará el caso "sin presupuesto, con horas reales") ───────────────────────
INSERT INTO public.activity_worksheets (id, engagement_id, wo_id, version, status) VALUES
  ('a1e07a60-0000-4000-8000-000000000001', '70e07a60-0000-4000-8000-000000000001',
   'd0e07a60-0000-4000-8000-000000000001', 1, 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.activity_worksheet_cells (id, worksheet_id, category_id, activity_id, budget_hours) VALUES
  ('a2e07a60-0000-4000-8000-000000000001', 'a1e07a60-0000-4000-8000-000000000001',
   'c0e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000001', 8),
  ('a2e07a60-0000-4000-8000-000000000002', 'a1e07a60-0000-4000-8000-000000000001',
   'c0e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000002', 5)
ON CONFLICT (id) DO NOTHING;
-- Total presupuestado CategoriaA = 13h.

-- ── Solicitudes de fondos sobre E1 (5 no-borrador + 1 borrador excluido) -- ANTES de los
-- gastos: fre_validate_wo_in_request() exige que ya exista una fila en
-- fund_request_work_orders para el par (fund_request_id, wo_id) del gasto. ────────────────
-- Nota: fund_requests_enforce_bob() (trigger real) exige currency='BOB' en TODA fila de
-- fund_requests -- las solicitudes de fondos se registran siempre en BOB, a diferencia de
-- work_orders/fund_request_expenses. allocated_amount_bob = allocated_amount * 1 acá; la
-- normalización de moneda de §7.5 ya queda cubierta por el bloque de Gastos (USD, TC 6.96).
INSERT INTO public.fund_requests (fund_request_id, request_number, requester_staff_id,
                                  total_requested_amount, currency, status, submitted_at) VALUES
  ('f3e07a60-0000-4000-8000-000000000001', 'FR-E07A60-1', '50e07a60-0000-4000-8000-000000000003', 500, 'BOB', 'fondos_entregados', (pg_temp.today() - 20)::timestamptz),
  ('f3e07a60-0000-4000-8000-000000000002', 'FR-E07A60-2', '50e07a60-0000-4000-8000-000000000003', 200, 'BOB', 'pendiente_aprobacion', (pg_temp.today() - 19)::timestamptz),
  ('f3e07a60-0000-4000-8000-000000000003', 'FR-E07A60-3', '50e07a60-0000-4000-8000-000000000003', 150, 'BOB', 'pendiente_aprobacion', (pg_temp.today() - 18)::timestamptz),
  ('f3e07a60-0000-4000-8000-000000000004', 'FR-E07A60-4', '50e07a60-0000-4000-8000-000000000003', 120, 'BOB', 'observado', (pg_temp.today() - 17)::timestamptz),
  ('f3e07a60-0000-4000-8000-000000000005', 'FR-E07A60-5', '50e07a60-0000-4000-8000-000000000003', 90, 'BOB', 'rechazado', (pg_temp.today() - 16)::timestamptz),
  ('f3e07a60-0000-4000-8000-000000000006', 'FR-E07A60-6', '50e07a60-0000-4000-8000-000000000003', 60, 'BOB', 'borrador', NULL)
ON CONFLICT (fund_request_id) DO NOTHING;

INSERT INTO public.fund_request_work_orders (fr_wo_id, fund_request_id, wo_id, allocated_amount, approval_status) VALUES
  ('f4e07a60-0000-4000-8000-000000000001', 'f3e07a60-0000-4000-8000-000000000001', 'd0e07a60-0000-4000-8000-000000000001', 500, 'aprobado'),         -- desembolsado
  ('f4e07a60-0000-4000-8000-000000000002', 'f3e07a60-0000-4000-8000-000000000002', 'd0e07a60-0000-4000-8000-000000000001', 200, 'aprobado'),         -- aprobado_pendiente_desembolso
  ('f4e07a60-0000-4000-8000-000000000003', 'f3e07a60-0000-4000-8000-000000000003', 'd0e07a60-0000-4000-8000-000000000001', 150, 'pendiente'),        -- pendiente_gerente
  ('f4e07a60-0000-4000-8000-000000000004', 'f3e07a60-0000-4000-8000-000000000004', 'd0e07a60-0000-4000-8000-000000000001', 120, 'observado'),        -- observado
  ('f4e07a60-0000-4000-8000-000000000005', 'f3e07a60-0000-4000-8000-000000000005', 'd0e07a60-0000-4000-8000-000000000001', 90, 'rechazado'),         -- rechazado
  ('f4e07a60-0000-4000-8000-000000000006', 'f3e07a60-0000-4000-8000-000000000006', 'd0e07a60-0000-4000-8000-000000000001', 60, 'pendiente')          -- borrador padre -> excluido
ON CONFLICT (fr_wo_id) DO NOTHING;

-- ── Gastos de E1: presupuesto 1000 USD (-> 6960 BOB), 3 líneas en 3 estados distintos ────
INSERT INTO public.wo_expense_budget (wo_exp_id, wo_id, expense_type_id, budgeted_amount) VALUES
  ('b2e07a60-0000-4000-8000-000000000001', 'd0e07a60-0000-4000-8000-000000000001',
   '9ee07a60-0000-4000-8000-000000000001', 1000)
ON CONFLICT (wo_exp_id) DO NOTHING;

-- fre_validate_wo_in_request() (trigger real) exige que la moneda del gasto coincida con la
-- de su fund_request padre -- y fund_requests_enforce_bob() ya fuerza esa moneda a BOB, así
-- que todo gasto real del sistema termina en BOB (factor 1). El presupuesto (wo_expense_
-- budget, en la moneda de la OT, USD) sí sigue normalizándose con el TC del plan (6.96) --
-- ambos caminos de conversión quedan ejercitados por separado.
INSERT INTO public.fund_request_expenses (fre_id, fund_request_id, wo_id, expense_type_id,
                                          expense_date, amount, currency, status) VALUES
  ('f2e07a60-0000-4000-8000-000000000001', 'f3e07a60-0000-4000-8000-000000000001',
   'd0e07a60-0000-4000-8000-000000000001', '9ee07a60-0000-4000-8000-000000000001',
   pg_temp.today() - 5, 300, 'BOB', 'revisado_asistente'),
  ('f2e07a60-0000-4000-8000-000000000002', 'f3e07a60-0000-4000-8000-000000000001',
   'd0e07a60-0000-4000-8000-000000000001', '9ee07a60-0000-4000-8000-000000000001',
   pg_temp.today() - 4, 100, 'BOB', 'aprobado_gerente'),
  ('f2e07a60-0000-4000-8000-000000000003', 'f3e07a60-0000-4000-8000-000000000001',
   'd0e07a60-0000-4000-8000-000000000001', '9ee07a60-0000-4000-8000-000000000001',
   pg_temp.today() - 3, 50, 'BOB', 'pendiente_aprobacion')
ON CONFLICT (fre_id) DO NOTHING;
-- executed_bob = 300 (BOB, factor 1); budget_bob = 1000 * 6.96 = 6960 -> executed_percent ~4.3%.

-- ── Asignaciones de Staffing (D-1/D-2/§4.5) ──────────────────────────────────────────────
-- workerA: cubre semanas -3..0 (4 semanas tocadas), carga horas TODAS esas semanas ->
-- zero_week_alert=false. hours_per_week=40, allocation=100 -> assigned_hours=160.
-- workerB: cubre semanas -2..-1 (2 semanas), SOLO carga en -2 -> zero_week_alert=true.
-- hours_per_week=40, allocation=100 -> assigned_hours=80.
-- workerD: asignación PARCIAL martes->jueves dentro de la semana -2 (D-1: cuenta como 1
-- semana completa, no una fracción). hours_per_week=20, allocation=50 -> assigned_hours=10.
-- Sin category_id propio -> ejercita el fallback a la categoría de la asignación (CategoriaB).
INSERT INTO public.engagement_assignments (assignment_id, engagement_id, staff_id, start_date,
                                           end_date, hours_per_week, allocation_percent, status, category_id) VALUES
  ('ea0e07a6-0000-4000-8000-000000000001', '70e07a60-0000-4000-8000-000000000001',
   '50e07a60-0000-4000-8000-000000000016', pg_temp.week(-3), pg_temp.week(0) + 6, 40, 100, 'CONFIRMED', 'c0e07a60-0000-4000-8000-000000000001'),
  ('ea0e07a6-0000-4000-8000-000000000002', '70e07a60-0000-4000-8000-000000000001',
   '50e07a60-0000-4000-8000-000000000017', pg_temp.week(-2), pg_temp.week(-1) + 6, 40, 100, 'CONFIRMED', 'c0e07a60-0000-4000-8000-000000000001'),
  ('ea0e07a6-0000-4000-8000-000000000003', '70e07a60-0000-4000-8000-000000000001',
   '50e07a60-0000-4000-8000-000000000019', pg_temp.week(-2) + 1, pg_temp.week(-2) + 3, 20, 50, 'CONFIRMED', 'c0e07a60-0000-4000-8000-000000000002'),
  -- Asignación CANCELLED: NO debe contar en assigned_hours ni en el denominador de Staffing.
  ('ea0e07a6-0000-4000-8000-000000000004', '70e07a60-0000-4000-8000-000000000001',
   '50e07a60-0000-4000-8000-000000000018', pg_temp.week(-3), pg_temp.week(0) + 6, 40, 100, 'CANCELLED', 'c0e07a60-0000-4000-8000-000000000001')
ON CONFLICT (assignment_id) DO NOTHING;

-- SF-02 (review.md iteración 1): quinta asignación de workerD, MÁS RECIENTE (updated_at)
-- que la válida de arriba (...0003, CategoriaB) pero soft-deleted (deleted_at IS NOT NULL),
-- con OTRA categoría (CategoriaA). El fallback de categoría debe seguir devolviendo
-- CategoriaB -- si el filtro deleted_at faltara, el ORDER BY updated_at DESC la elegiría a
-- ella (CategoriaA) por error. now() es constante dentro de la transacción del harness, así
-- que "+ interval '1 second'" alcanza para quedar estrictamente después del DEFAULT now()
-- de la fila ...0003.
INSERT INTO public.engagement_assignments (assignment_id, engagement_id, staff_id, start_date,
                                           end_date, hours_per_week, allocation_percent, status,
                                           category_id, deleted_at, updated_at) VALUES
  ('ea0e07a6-0000-4000-8000-000000000005', '70e07a60-0000-4000-8000-000000000001',
   '50e07a60-0000-4000-8000-000000000019', pg_temp.week(-2) + 1, pg_temp.week(-2) + 3, 20, 50,
   'CONFIRMED', 'c0e07a60-0000-4000-8000-000000000001', now(), now() + interval '1 second')
ON CONFLICT (assignment_id) DO NOTHING;

-- ── Horas cargadas sobre E1 ───────────────────────────────────────────────────────────────
-- workerA: 10h/semana en EA1, semanas -3,-2,-1,0 (usado para KPI Staffing + used_hours
-- acumulado). workerB: 10h SOLO en semana -2 (semana -1 queda en cero -> alerta). workerC:
-- 6h en semana 0 SIN estar asignado (CategoriaB, EA2 -- sin presupuesto, variance negativa).
INSERT INTO public.time_entries (time_id, date_worked, hours_logged, staff_id, engagement_id,
                                 activity_id, period_id, is_forecast) VALUES
  ('16e07a60-0000-4000-8000-000000000001', pg_temp.week(-3) + 1, 10, '50e07a60-0000-4000-8000-000000000016', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000001', NULL, false),
  ('16e07a60-0000-4000-8000-000000000002', pg_temp.week(-2) + 1, 10, '50e07a60-0000-4000-8000-000000000016', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000001', NULL, false),
  ('16e07a60-0000-4000-8000-000000000003', pg_temp.week(-1) + 1, 10, '50e07a60-0000-4000-8000-000000000016', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000001', NULL, false),
  -- Semana 0: usar el lunes exacto (pg_temp.week(0)), NUNCA +N días -- "hoy" puede caer
  -- cualquier día de la semana actual (incluido el lunes mismo), y un +1/+2 empujaría la
  -- fecha al futuro, rompiendo is_forecast=false y el cálculo de "última carga" (=hoy).
  ('16e07a60-0000-4000-8000-000000000004', pg_temp.week(0),      10, '50e07a60-0000-4000-8000-000000000016', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000001', NULL, false),
  ('16e07a60-0000-4000-8000-000000000005', pg_temp.week(-2) + 1, 10, '50e07a60-0000-4000-8000-000000000017', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000001', NULL, false),
  ('16e07a60-0000-4000-8000-000000000006', pg_temp.week(0),       6, '50e07a60-0000-4000-8000-000000000018', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000002', NULL, false)
ON CONFLICT (time_id) DO NOTHING;

-- ── Periodos + aprobaciones (KPI pendientes / última aprobación) ─────────────────────────
-- P_recent (semana -1, workerA): 7h pendientes -> kpis.pending_approval.last_week_hours.
-- P_aged (semana -4, workerA): 4h pendientes, weeks_old=4 -> aged con alert_weeks=3
-- (default) pero NO con alert_weeks=5 (aserción del setting tolerante).
-- P_current (semana 0, workerA): 3h aprobadas HOY -> última aprobación = hoy (days=0).
INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year) VALUES
  ('15e07a60-0000-4000-8000-000000000001', '50e07a60-0000-4000-8000-000000000016', pg_temp.week(-1), 1, 2026),
  ('15e07a60-0000-4000-8000-000000000002', '50e07a60-0000-4000-8000-000000000016', pg_temp.week(-4), 2, 2026),
  ('15e07a60-0000-4000-8000-000000000003', '50e07a60-0000-4000-8000-000000000016', pg_temp.week(0), 3, 2026)
ON CONFLICT (period_id) DO NOTHING;

INSERT INTO public.time_entries (time_id, date_worked, hours_logged, staff_id, engagement_id,
                                 activity_id, period_id, is_forecast) VALUES
  ('16e07a60-0000-4000-8000-000000000007', pg_temp.week(-1) + 2, 7, '50e07a60-0000-4000-8000-000000000016', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000002', '15e07a60-0000-4000-8000-000000000001', false),
  ('16e07a60-0000-4000-8000-000000000008', pg_temp.week(-4) + 2, 4, '50e07a60-0000-4000-8000-000000000016', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000001', '15e07a60-0000-4000-8000-000000000002', false),
  -- ACT2 (no ACT1): workerA ya tiene una entrada en ACT1 fechada hoy si "hoy" cae lunes de
  -- la semana actual (pg_temp.week(0) == pg_temp.today() en ese caso) -- idx_time_entries_
  -- unique_entry es (staff_id, engagement_id, activity_id, date_worked, is_forecast).
  ('16e07a60-0000-4000-8000-000000000009', pg_temp.today(), 3, '50e07a60-0000-4000-8000-000000000016', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000002', '15e07a60-0000-4000-8000-000000000003', false),
  -- MF-01 (review.md iteración 1): hora Pronóstico en el MISMO period_id/engagement_id/
  -- activity_id que la línea pendiente 0007 (workerA, ACT2, semana -1, 7h) -- is_forecast=true
  -- no debe sumarse en kpis.pending_approval.last_week_hours ni en approval_queue. 50h para
  -- que, si el filtro faltara, la aserción 15 (esperado 7) fallara de forma inconfundible.
  ('16e07a60-0000-4000-8000-00000000000a', pg_temp.week(-1) + 2, 50, '50e07a60-0000-4000-8000-000000000016', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000002', '15e07a60-0000-4000-8000-000000000001', true)
ON CONFLICT (time_id) DO NOTHING;

INSERT INTO public.timesheet_line_approvals (approval_id, period_id, engagement_id, activity_id, status, approved_at) VALUES
  ('17e07a60-0000-4000-8000-000000000001', '15e07a60-0000-4000-8000-000000000001', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000002', 'pending', NULL),
  ('17e07a60-0000-4000-8000-000000000002', '15e07a60-0000-4000-8000-000000000002', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000001', 'pending', NULL),
  ('17e07a60-0000-4000-8000-000000000003', '15e07a60-0000-4000-8000-000000000003', '70e07a60-0000-4000-8000-000000000001', 'ace07a60-0000-4000-8000-000000000002', 'approved', pg_temp.today()::timestamptz)
ON CONFLICT (approval_id) DO NOTHING;

-- ── Helpers de sesión (patrón de rpc-dash-cartera-portfolio-overview.sql) ────────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'a0e07a60-0000-4000-8000-' || lpad(n::text, 12, '0')
$$;
CREATE FUNCTION pg_temp.e(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('70e07a60-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.has_eng(p_items jsonb, p_id uuid) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE (e->>'engagement_id')::uuid = p_id)
$$;

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Aserciones 1-3b: corren COMO DUEÑO DE LA TABLA, antes del SET LOCAL ROLE authenticated
-- (mismo patrón que las aserciones 23-24 de rpc-dash-cartera-portfolio-overview.sql): 1-2
-- llaman RPC SECURITY DEFINER (el rol de sesión les da igual), pero 3/3b leen/escriben
-- authorization_role_permissions/global_settings DIRECTO -- bajo el rol `authenticated`
-- esas tablas quedan detrás de RLS y un SELECT directo vería 0 filas SIN error, un falso
-- negativo indistinguible de "falta el dato". Orden importante: 2 prueba a hr_analyst SIN
-- el permiso; recién 3b se lo otorga a mano para probar que igual queda denegado.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Sin sesión -> FORBIDDEN: no session (ambos RPC) ───────────────────────────────────
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.engagement_overview(pg_temp.e(1), pg_temp.today() - 90, pg_temp.today() + 10);
    RAISE EXCEPTION 'FAIL: sin sesión debía lanzar FORBIDDEN: no session (engagement_overview)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FORBIDDEN: no session%' THEN
      RAISE EXCEPTION 'FAIL: excepción inesperada sin sesión (engagement_overview): %', SQLERRM;
    END IF;
  END;
  BEGIN
    PERFORM public.list_dashboard_engagements();
    RAISE EXCEPTION 'FAIL: sin sesión debía lanzar FORBIDDEN: no session (list_dashboard_engagements)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FORBIDDEN: no session%' THEN
      RAISE EXCEPTION 'FAIL: excepción inesperada sin sesión (list_dashboard_engagements): %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK 1: sin sesión, ambos RPC lanzan FORBIDDEN: no session';
END $$;

-- ── 2. Rol sin el permiso en absoluto (hr_analyst, catálogo real) -> FORBIDDEN: dashboard.engagement.read ─
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(14));
  BEGIN
    PERFORM public.engagement_overview(pg_temp.e(1), pg_temp.today() - 90, pg_temp.today() + 10);
    RAISE EXCEPTION 'FAIL: hr_analyst sin el permiso debía lanzar FORBIDDEN';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FORBIDDEN: dashboard.engagement.read%' THEN
      RAISE EXCEPTION 'FAIL: excepción inesperada para hr_analyst: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK 2: hr_analyst sin dashboard.engagement.read -> FORBIDDEN: dashboard.engagement.read';
END $$;

-- ── 3. semisenior tiene el permiso tras la migración; global_settings tiene el umbral ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.authorization_role_permissions WHERE role_key = 'semisenior' AND permission_key = 'dashboard.engagement.read') THEN
    RAISE EXCEPTION 'FAIL: falta dashboard.engagement.read para semisenior tras la migración';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.global_settings WHERE setting_key = 'DASH_ENGAGEMENT_PENDING_ALERT_WEEKS' AND setting_value = '3') THEN
    RAISE EXCEPTION 'FAIL: falta DASH_ENGAGEMENT_PENDING_ALERT_WEEKS=3 en global_settings';
  END IF;
  RAISE NOTICE 'OK 3: semisenior tiene dashboard.engagement.read; DASH_ENGAGEMENT_PENDING_ALERT_WEEKS=3 sembrado';
END $$;

-- ── 3b. hr_analyst, aunque se le otorgue el permiso a mano, sigue denegado (ELSE false) ──
DO $$
DECLARE v_ok boolean;
BEGIN
  INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key)
  VALUES ('hr_analyst', 'dashboard.engagement.read', 'assigned_engagements')
  ON CONFLICT (role_key, permission_key) DO NOTHING;

  PERFORM pg_temp.impersonate(pg_temp.u(14));
  v_ok := public.can_read_engagement_dashboard(pg_temp.e(1));
  IF v_ok THEN
    RAISE EXCEPTION 'FAIL: hr_analyst no está en la tabla de roles de decisiones.md §2 -- debía quedar en el ELSE false pese al permiso forzado';
  END IF;
  RAISE NOTICE 'OK 3b: hr_analyst con el permiso forzado a mano sigue sin acceso (rol fuera de la matriz, ELSE false)';
END $$;

SET LOCAL ROLE authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Aserciones 4+: RPC públicos, bajo el rol `authenticated` (valida también que el GRANT
-- EXECUTE sea el correcto y no dependa de privilegios de superusuario).
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ── 4. admin / senior_partner: ven TODO, incluidos encargos ajenos y cancelados/finalizados ─
DO $$
DECLARE v_admin jsonb; v_sp jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(9)) THEN  -- E_OTHER
    RAISE EXCEPTION 'FAIL: admin debía ver E_OTHER (override firm-wide)';
  END IF;
  v_admin := public.engagement_overview(pg_temp.e(9), pg_temp.today() - 90, pg_temp.today() + 10);
  IF (v_admin->'meta'->>'selected_accessible')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: engagement_overview(E_OTHER) para admin debía dar selected_accessible=true';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(2));
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(9)) THEN
    RAISE EXCEPTION 'FAIL: senior_partner debía ver E_OTHER (override firm-wide)';
  END IF;
  RAISE NOTICE 'OK 4: admin y senior_partner ven E_OTHER (encargo ajeno a cualquier rol) por override firm-wide';
END $$;

-- ── 5. partner/director/risk_partner: SOLO por partner_id, sin alcance departamental ─────
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));  -- partner, partner_id de E1
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: partner (u3) debía ver E1 (es partner_id)';
  END IF;
  IF public.can_read_engagement_dashboard(pg_temp.e(9)) THEN
    RAISE EXCEPTION 'FAIL: partner (u3) NO debía ver E_OTHER';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(4));  -- director, partner_id de E_DIRECTOR
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(2)) THEN
    RAISE EXCEPTION 'FAIL: director (u4) debía ver E_DIRECTOR (es partner_id)';
  END IF;
  IF public.can_read_engagement_dashboard(pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: director (u4) NO debía ver E1 (no es su partner_id)';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(5));  -- risk_partner, partner_id de E_RISKPARTNER
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(3)) THEN
    RAISE EXCEPTION 'FAIL: risk_partner (u5) debía ver E_RISKPARTNER (es partner_id)';
  END IF;
  IF public.can_read_engagement_dashboard(pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: risk_partner (u5) NO debía tener alcance departamental sobre E1';
  END IF;

  RAISE NOTICE 'OK 5: partner/director/risk_partner acceden SOLO donde son partner_id; risk_partner sin alcance departamental';
END $$;

-- ── 6. sqr: SOLO por partner_id; ser sqr_id NO da acceso (fila crítica de §2) ────────────
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(6));  -- sqr, sqr_id de E1, partner_id de E_SQRPARTNER
  IF public.can_read_engagement_dashboard(pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: sqr (u6) es sqr_id de E1 pero NO debía tener acceso -- ese campo no otorga alcance';
  END IF;
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(4)) THEN
    RAISE EXCEPTION 'FAIL: sqr (u6) es partner_id de E_SQRPARTNER -- debía tener acceso por ese campo';
  END IF;
  RAISE NOTICE 'OK 6: sqr accede SOLO por partner_id; ser sqr_id de un encargo no otorga acceso a ese encargo';
END $$;

-- ── 7. manager/ita_manager/tax_manager: SOLO por manager_id ──────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(7));  -- manager, manager_id de E1
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: manager (u7) debía ver E1 (es manager_id)';
  END IF;
  IF public.can_read_engagement_dashboard(pg_temp.e(9)) THEN
    RAISE EXCEPTION 'FAIL: manager (u7) NO debía ver E_OTHER';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(8));  -- ita_manager, manager_id de E_ITAMANAGER
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(5)) THEN
    RAISE EXCEPTION 'FAIL: ita_manager (u8) debía ver E_ITAMANAGER (es manager_id)';
  END IF;
  IF public.can_read_engagement_dashboard(pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: ita_manager (u8) NO debía ver E1';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(9));  -- tax_manager, manager_id de E_TAXMANAGER
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(6)) THEN
    RAISE EXCEPTION 'FAIL: tax_manager (u9) debía ver E_TAXMANAGER (es manager_id)';
  END IF;

  RAISE NOTICE 'OK 7: manager/ita_manager/tax_manager acceden SOLO donde son manager_id';
END $$;

-- ── 8. senior/semisenior: SOLO por encargado_id (antes veían el selector vacío) ──────────
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(10));  -- senior, encargado_id de E1
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: senior (u10) debía ver E1 (es encargado_id)';
  END IF;
  IF public.can_read_engagement_dashboard(pg_temp.e(9)) THEN
    RAISE EXCEPTION 'FAIL: senior (u10) NO debía ver E_OTHER';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(11));  -- semisenior, encargado_id de E_SEMISENIOR
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(7)) THEN
    RAISE EXCEPTION 'FAIL: semisenior (u11) debía ver E_SEMISENIOR (es encargado_id)';
  END IF;
  IF public.can_read_engagement_dashboard(pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: semisenior (u11) NO debía ver E1';
  END IF;

  RAISE NOTICE 'OK 8: senior/semisenior acceden SOLO donde son encargado_id';
END $$;

-- ── 9. ita_senior/tax_senior: SOLO por specialist_it_id/specialist_tax_id, cruzados niegan ─
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(12));  -- ita_senior, specialist_it_id de E1
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: ita_senior (u12) debía ver E1 (es specialist_it_id)';
  END IF;
  IF public.can_read_engagement_dashboard(pg_temp.e(8)) THEN
    RAISE EXCEPTION 'FAIL: ita_senior (u12) NO debía ver E_TAXSENIOR (cruzado)';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(13));  -- tax_senior, specialist_tax_id de E_TAXSENIOR
  IF NOT public.can_read_engagement_dashboard(pg_temp.e(8)) THEN
    RAISE EXCEPTION 'FAIL: tax_senior (u13) debía ver E_TAXSENIOR (es specialist_tax_id)';
  END IF;
  IF public.can_read_engagement_dashboard(pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: tax_senior (u13) NO debía ver E1 (specialist_tax_id de E1 es NULL, cruzado)';
  END IF;

  RAISE NOTICE 'OK 9: ita_senior/tax_senior acceden SOLO por su campo de especialista, cruzados se deniegan';
END $$;

-- ── 10. UUID inexistente y UUID fuera de alcance devuelven EXACTAMENTE lo mismo ──────────
DO $$
DECLARE v_missing jsonb; v_outscope jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));  -- partner (u3), no tiene relación con E_OTHER
  v_missing := public.engagement_overview('00000000-0000-4000-8000-000000000000'::uuid, pg_temp.today() - 90, pg_temp.today() + 10);
  v_outscope := public.engagement_overview(pg_temp.e(9), pg_temp.today() - 90, pg_temp.today() + 10);
  IF (v_missing->'meta'->>'selected_accessible')::boolean IS NOT FALSE
     OR (v_outscope->'meta'->>'selected_accessible')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL: UUID inexistente y fuera de alcance debían dar selected_accessible=false';
  END IF;
  IF v_missing->'detail' <> 'null'::jsonb OR v_outscope->'detail' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL: detail debía ser null en ambos casos';
  END IF;
  RAISE NOTICE 'OK 10: UUID inexistente y UUID fuera de alcance devuelven la misma forma (selected_accessible=false, detail=null), sin distinguir uno de otro';
END $$;

-- ── 11. p_start > p_end -> INVALID_RANGE ─────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  BEGIN
    PERFORM public.engagement_overview(pg_temp.e(1), pg_temp.today(), pg_temp.today() - 1);
    RAISE EXCEPTION 'FAIL: p_start > p_end debía lanzar INVALID_RANGE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'INVALID_RANGE%' THEN
      RAISE EXCEPTION 'FAIL: excepción inesperada con rango invertido: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK 11: p_start > p_end -> INVALID_RANGE';
END $$;

-- ── 12. list_dashboard_engagements(): cada rol ve exactamente lo suyo; excluye cancelado/
-- finalizado/inactivo aunque el rol sea partner ahí; excluye funcion=0 (Administrativo)
-- pese a que el rol sea partner ahí también; end_date viaja en el payload ─────────────────
DO $$
DECLARE v_list jsonb; v_e1 jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));  -- partner: E1 + (si no fueran excluidos) E_CANCELLED/E_FINALIZED/E_INACTIVE/E_ADMIN
  v_list := public.list_dashboard_engagements();
  IF NOT pg_temp.has_eng(v_list, pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: list_dashboard_engagements(partner) debía incluir E1';
  END IF;
  IF pg_temp.has_eng(v_list, pg_temp.e(10)) OR pg_temp.has_eng(v_list, pg_temp.e(11)) OR pg_temp.has_eng(v_list, pg_temp.e(12)) THEN
    RAISE EXCEPTION 'FAIL: list_dashboard_engagements(partner) NO debía incluir cancelado/finalizado/inactivo pese a ser partner_id ahí';
  END IF;
  -- Corrección post-ejecución: E_ADMIN (funcion=0) tiene partner_id = u3 (mismo campo que
  -- le da acceso a E1) -- si apareciera, sería porque el filtro de funcion se perdió, no un
  -- problema de alcance por rol (can_read_engagement_dashboard() SI le daría acceso puntual
  -- a E_ADMIN, ver aserción 6-9 en espíritu -- ese gate no lleva este filtro a propósito).
  IF pg_temp.has_eng(v_list, pg_temp.e(13)) THEN
    RAISE EXCEPTION 'FAIL: list_dashboard_engagements(partner) NO debía incluir E_ADMIN (funcion=0/Administrativo) pese a ser partner_id ahí';
  END IF;

  -- Corrección post-ejecución: end_date viaja en el payload -- E1 tiene end_date = hoy+45
  -- (fixture), el resto del fixture (salvo E_ADMIN, ya excluido arriba) queda NULL.
  SELECT e INTO v_e1 FROM jsonb_array_elements(v_list) e WHERE (e->>'engagement_id')::uuid = pg_temp.e(1);
  IF v_e1 IS NULL OR (v_e1->>'end_date')::date <> (pg_temp.today() + 45) THEN
    RAISE EXCEPTION 'FAIL: list_dashboard_engagements(partner) esperaba end_date=% para E1, obtuvo %', (pg_temp.today() + 45), v_e1->>'end_date';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(10));  -- senior: solo E1 (encargado_id)
  v_list := public.list_dashboard_engagements();
  IF NOT pg_temp.has_eng(v_list, pg_temp.e(1)) OR jsonb_array_length(v_list) <> 1 THEN
    RAISE EXCEPTION 'FAIL: list_dashboard_engagements(senior) debía ser exactamente {E1}, obtuvo %', v_list;
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(14));  -- hr_analyst: ninguno (pese al permiso forzado en 3b)
  BEGIN
    v_list := public.list_dashboard_engagements();
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: hr_analyst con el permiso ya tiene dashboard.engagement.read -- list_dashboard_engagements no debía lanzar, debía devolver []: %', SQLERRM;
  END;
  IF jsonb_array_length(v_list) <> 0 THEN
    RAISE EXCEPTION 'FAIL: list_dashboard_engagements(hr_analyst) debía ser [] (rol fuera de la matriz), obtuvo %', v_list;
  END IF;

  RAISE NOTICE 'OK 12: list_dashboard_engagements() respeta el alcance por rol, excluye cancelado/finalizado/inactivo/funcion=0 (Administrativo), y end_date viaja en el payload';
END $$;

-- ══════════════════════════════════════════════════════════════════════════════════════
-- A partir de acá, payload completo de engagement_overview(E1) como admin (firm-wide, sin
-- ambigüedad de alcance) -- rango amplio que cubre todo el fixture salvo donde se indique.
-- ══════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.engagement_overview(pg_temp.e(1), pg_temp.today() - 90, pg_temp.today() + 10);

  -- ── 13. alert_weeks default = 3; setting tolerante ante valores inválidos ──────────────
  IF (v->'meta'->>'alert_weeks')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL: alert_weeks default debía ser 3, obtuvo %', v->'meta'->>'alert_weeks';
  END IF;

  -- ── 14. KPI Staffing: semana actual 1 logueado/1 asignado; semana pasada 1/2 ──────────
  IF (v->'detail'->'kpis'->'staffing'->'current'->>'assigned')::int <> 1
     OR (v->'detail'->'kpis'->'staffing'->'current'->>'logged')::int <> 1
     OR (v->'detail'->'kpis'->'staffing'->'previous'->>'assigned')::int <> 2
     OR (v->'detail'->'kpis'->'staffing'->'previous'->>'logged')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: KPI Staffing esperado current=1/1, previous=1/2, obtuvo %', v->'detail'->'kpis'->'staffing';
  END IF;

  -- ── 15. KPI pendientes: last_week_hours=7 (semana -1), aged_hours=4 (semana -4, >=3) --
  -- este valor de 7, sin las 50h Pronóstico de la fixture 0x0a (MF-01, review.md iteración 1),
  -- es lo que prueba que pending_lines excluye is_forecast ──────────────────────────────────
  IF (v->'detail'->'kpis'->'pending_approval'->>'last_week_hours')::numeric <> 7
     OR (v->'detail'->'kpis'->'pending_approval'->>'aged_hours')::numeric <> 4 THEN
    RAISE EXCEPTION 'FAIL: KPI pendientes esperado last_week_hours=7/aged_hours=4, obtuvo %', v->'detail'->'kpis'->'pending_approval';
  END IF;

  -- ── 16. Última carga / última aprobación = hoy (days=0) ────────────────────────────────
  IF (v->'detail'->'kpis'->'last_time_entry'->>'date') <> pg_temp.today()::text
     OR (v->'detail'->'kpis'->'last_time_entry'->>'days')::int <> 0
     OR (v->'detail'->'kpis'->'last_approval'->>'date') <> pg_temp.today()::text
     OR (v->'detail'->'kpis'->'last_approval'->>'days')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: última carga/aprobación esperada hoy (days=0), obtuvo %', v->'detail'->'kpis';
  END IF;

  -- ── 17. Presupuesto: 13h presupuestadas (CategoriaA); actual >0 con rango amplio ───────
  IF (v->'detail'->'budget'->>'budget_hours')::numeric <> 13 THEN
    RAISE EXCEPTION 'FAIL: budget_hours esperado 13, obtuvo %', v->'detail'->'budget'->>'budget_hours';
  END IF;
  IF (v->'detail'->'budget'->>'actual_hours')::numeric <= 0 THEN
    RAISE EXCEPTION 'FAIL: actual_hours debía ser > 0 con el rango amplio';
  END IF;

  -- ── 18. Desglose: incluye CategoriaB/EA2 (sin presupuesto, 6h reales, varianza -6) ─────
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v->'detail'->'breakdown') b
    WHERE b->>'category_name' = 'CategoriaB E07A60' AND (b->>'budget_hours')::numeric = 0
      AND (b->>'actual_hours')::numeric = 6 AND (b->>'variance_hours')::numeric = -6
  ) THEN
    RAISE EXCEPTION 'FAIL: desglose debía incluir CategoriaB/EA2 con budget=0/actual=6/variance=-6, obtuvo %', v->'detail'->'breakdown';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'detail'->'breakdown') b WHERE (b->>'budget_hours')::numeric = 0 AND (b->>'actual_hours')::numeric = 0) THEN
    RAISE EXCEPTION 'FAIL: el desglose no debía traer filas 0/0';
  END IF;

  -- ── 19. Equipo: 6 claves, specialist_tax null, partner/manager/encargado/specialist_it
  -- resueltos a los staff correctos ──────────────────────────────────────────────────────
  IF v->'detail'->'team'->'specialist_tax' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL: team.specialist_tax debía ser null (E1 no tiene especialista Tax)';
  END IF;
  IF (v->'detail'->'team'->'partner'->>'staff_id')::uuid <> '50e07a60-0000-4000-8000-000000000003'::uuid
     OR (v->'detail'->'team'->'manager'->>'staff_id')::uuid <> '50e07a60-0000-4000-8000-000000000007'::uuid
     OR (v->'detail'->'team'->'encargado'->>'staff_id')::uuid <> '50e07a60-0000-4000-8000-000000000010'::uuid
     OR (v->'detail'->'team'->'specialist_it'->>'staff_id')::uuid <> '50e07a60-0000-4000-8000-000000000012'::uuid
     OR (v->'detail'->'team'->'sqr'->>'staff_id')::uuid <> '50e07a60-0000-4000-8000-000000000006'::uuid THEN
    RAISE EXCEPTION 'FAIL: team no resolvió los 6 roles formales correctamente: %', v->'detail'->'team';
  END IF;

  -- ── 20. Staffing.people: assigned_hours/zero_week_alert -- workerA 160/false, workerB
  -- 80/true, workerC (sin asignación) 0/false, workerD (D-1, parcial) 10/? ───────────────
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'detail'->'staffing'->'people') p
                 WHERE (p->>'staff_id')::uuid = '50e07a60-0000-4000-8000-000000000016'::uuid
                   AND (p->>'assigned_hours')::numeric = 160 AND (p->>'zero_week_alert')::boolean = false) THEN
    RAISE EXCEPTION 'FAIL: workerA esperada assigned_hours=160/zero_week_alert=false, obtuvo %', v->'detail'->'staffing'->'people';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'detail'->'staffing'->'people') p
                 WHERE (p->>'staff_id')::uuid = '50e07a60-0000-4000-8000-000000000017'::uuid
                   AND (p->>'assigned_hours')::numeric = 80 AND (p->>'zero_week_alert')::boolean = true) THEN
    RAISE EXCEPTION 'FAIL: workerB esperada assigned_hours=80/zero_week_alert=true, obtuvo %', v->'detail'->'staffing'->'people';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'detail'->'staffing'->'people') p
                 WHERE (p->>'staff_id')::uuid = '50e07a60-0000-4000-8000-000000000018'::uuid
                   AND (p->>'assigned_hours')::numeric = 0 AND (p->>'zero_week_alert')::boolean = false) THEN
    RAISE EXCEPTION 'FAIL: workerC (cargó sin estar asignado) esperada assigned_hours=0/zero_week_alert=false, obtuvo %', v->'detail'->'staffing'->'people';
  END IF;
  -- D-1: asignación parcial martes->jueves dentro de UNA semana calendario cuenta como 1
  -- semana completa: 20h/semana * 50% * 1 semana = 10h. Además la CANCELLED de workerC
  -- (asignación 4) no debía sumar nada (ya cubierto arriba: workerC da 0).
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'detail'->'staffing'->'people') p
                 WHERE (p->>'staff_id')::uuid = '50e07a60-0000-4000-8000-000000000019'::uuid
                   AND (p->>'assigned_hours')::numeric = 10) THEN
    RAISE EXCEPTION 'FAIL: workerD (D-1, asignación parcial) esperada assigned_hours=10 (1 semana completa), obtuvo %', v->'detail'->'staffing'->'people';
  END IF;
  -- SF-02 (review.md iteración 1): el fallback de categoría de workerD debe seguir
  -- resolviendo CategoriaB (asignación válida), NO CategoriaA (asignación ...0005, más
  -- reciente pero soft-deleted) -- prueba que el fallback excluye deleted_at IS NOT NULL.
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'detail'->'staffing'->'people') p
                 WHERE (p->>'staff_id')::uuid = '50e07a60-0000-4000-8000-000000000019'::uuid
                   AND p->>'category_name' = 'CategoriaB E07A60') THEN
    RAISE EXCEPTION 'FAIL: workerD (SF-02) esperada category_name=CategoriaB E07A60 (fallback debe ignorar la asignación soft-deleted), obtuvo %', v->'detail'->'staffing'->'people';
  END IF;

  -- ── 21. Staffing.weeks: exactamente 9, offsets -4..4, week_start consecutivos de 7 días ─
  IF jsonb_array_length(v->'detail'->'staffing'->'weeks') <> 9 THEN
    RAISE EXCEPTION 'FAIL: staffing.weeks debía tener exactamente 9 elementos, tiene %', jsonb_array_length(v->'detail'->'staffing'->'weeks');
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT (w->>'offset')::int AS off, (w->>'week_start')::date AS ws,
             row_number() OVER (ORDER BY (w->>'offset')::int) AS rn
      FROM jsonb_array_elements(v->'detail'->'staffing'->'weeks') w
    ) t
    WHERE t.off <> (t.rn - 5) OR t.ws <> pg_temp.week(t.off)
  ) THEN
    RAISE EXCEPTION 'FAIL: staffing.weeks debía ir de offset -4 a +4 con week_start consecutivos de 7 días';
  END IF;

  -- ── 22. used_hours: acumulado creciente para workerA a lo largo de las semanas -3..0,
  -- y las 9 semanas coinciden en staff_id/estructura (people[] separado de weeks[].rows[]) ─
  DECLARE
    v_m3 numeric; v_m2 numeric; v_m1 numeric; v_0 numeric; v_p1 numeric;
  BEGIN
    SELECT (r->>'used_hours')::numeric INTO v_m3 FROM jsonb_array_elements(v->'detail'->'staffing'->'weeks') w, jsonb_array_elements(w->'rows') r
      WHERE (w->>'offset')::int = -3 AND (r->>'staff_id')::uuid = '50e07a60-0000-4000-8000-000000000016'::uuid;
    SELECT (r->>'used_hours')::numeric INTO v_m2 FROM jsonb_array_elements(v->'detail'->'staffing'->'weeks') w, jsonb_array_elements(w->'rows') r
      WHERE (w->>'offset')::int = -2 AND (r->>'staff_id')::uuid = '50e07a60-0000-4000-8000-000000000016'::uuid;
    SELECT (r->>'used_hours')::numeric INTO v_m1 FROM jsonb_array_elements(v->'detail'->'staffing'->'weeks') w, jsonb_array_elements(w->'rows') r
      WHERE (w->>'offset')::int = -1 AND (r->>'staff_id')::uuid = '50e07a60-0000-4000-8000-000000000016'::uuid;
    SELECT (r->>'used_hours')::numeric INTO v_0 FROM jsonb_array_elements(v->'detail'->'staffing'->'weeks') w, jsonb_array_elements(w->'rows') r
      WHERE (w->>'offset')::int = 0 AND (r->>'staff_id')::uuid = '50e07a60-0000-4000-8000-000000000016'::uuid;
    SELECT (r->>'used_hours')::numeric INTO v_p1 FROM jsonb_array_elements(v->'detail'->'staffing'->'weeks') w, jsonb_array_elements(w->'rows') r
      WHERE (w->>'offset')::int = 1 AND (r->>'staff_id')::uuid = '50e07a60-0000-4000-8000-000000000016'::uuid;

    -- Acumulado de TODAS las horas de workerA en E1 (no solo las semanales de 10h): semana
    -- -1 suma también las 7h de te_recent (pendiente) y semana 0 las 3h de te_approved --
    -- used_hours no distingue actividad ni estado de aprobación (decisiones.md §4.5.b).
    -- te_aged (semana -4) queda ANTES de earliest_start (semana -3, inicio de la asignación
    -- más temprana) y por eso no acumula.
    IF v_m3 <> 10 OR v_m2 <> 20 OR v_m1 <> 37 OR v_0 <> 50 OR v_p1 <> 50 THEN
      RAISE EXCEPTION 'FAIL: used_hours de workerA esperado 10,20,37,50,50 (semanas -3..+1), obtuvo %,%,%,%,%', v_m3, v_m2, v_m1, v_0, v_p1;
    END IF;
  END;

  -- ── 23. Gastos: budget_bob = 1000 USD * 6.96 (TC del plan de la OT); executed_bob = 300
  -- BOB (solo revisado_asistente; los gastos siempre están en BOB por fund_requests_
  -- enforce_bob(), factor 1) ────────────────────────────────────────────────────────────
  IF (v->'detail'->'expenses'->>'budget_bob')::numeric <> 6960
     OR (v->'detail'->'expenses'->>'executed_bob')::numeric <> 300 THEN
    RAISE EXCEPTION 'FAIL: expenses esperado budget_bob=6960/executed_bob=300, obtuvo %', v->'detail'->'expenses';
  END IF;
  IF jsonb_array_length(v->'detail'->'expenses'->'approved') <> 1
     OR jsonb_array_length(v->'detail'->'expenses'->'pending') <> 2 THEN
    RAISE EXCEPTION 'FAIL: expenses.approved debía tener 1 ítem y pending 2, obtuvo approved=% pending=%',
      jsonb_array_length(v->'detail'->'expenses'->'approved'), jsonb_array_length(v->'detail'->'expenses'->'pending');
  END IF;

  -- ── 24. Solicitudes: 5 no-borrador (el 6to en borrador queda excluido), 5 display_status
  -- distintos correctamente derivados ─────────────────────────────────────────────────────
  IF jsonb_array_length(v->'detail'->'expenses'->'requests') <> 5 THEN
    RAISE EXCEPTION 'FAIL: requests debía tener exactamente 5 ítems (el borrador excluido), tiene %', jsonb_array_length(v->'detail'->'expenses'->'requests');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'detail'->'expenses'->'requests') r WHERE (r->>'request_number') = 'FR-E07A60-6') THEN
    RAISE EXCEPTION 'FAIL: la solicitud en borrador (FR-E07A60-6) NO debía aparecer';
  END IF;
  IF NOT (
    (SELECT count(*) FROM jsonb_array_elements(v->'detail'->'expenses'->'requests') r WHERE r->>'display_status' = 'desembolsado') = 1 AND
    (SELECT count(*) FROM jsonb_array_elements(v->'detail'->'expenses'->'requests') r WHERE r->>'display_status' = 'aprobado_pendiente_desembolso') = 1 AND
    (SELECT count(*) FROM jsonb_array_elements(v->'detail'->'expenses'->'requests') r WHERE r->>'display_status' = 'pendiente_gerente') = 1 AND
    (SELECT count(*) FROM jsonb_array_elements(v->'detail'->'expenses'->'requests') r WHERE r->>'display_status' = 'observado') = 1 AND
    (SELECT count(*) FROM jsonb_array_elements(v->'detail'->'expenses'->'requests') r WHERE r->>'display_status' = 'rechazado') = 1
  ) THEN
    RAISE EXCEPTION 'FAIL: requests debía traer exactamente 1 de cada display_status (desembolsado/aprobado_pendiente_desembolso/pendiente_gerente/observado/rechazado), obtuvo %', v->'detail'->'expenses'->'requests';
  END IF;
  -- Las solicitudes de fondos se registran siempre en BOB (fund_requests_enforce_bob()) ->
  -- allocated_amount_bob = allocated_amount * 1, sin depender del TC de la OT.
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'detail'->'expenses'->'requests') r
                 WHERE r->>'display_status' = 'desembolsado' AND (r->>'allocated_amount_bob')::numeric = 500) THEN
    RAISE EXCEPTION 'FAIL: allocated_amount_bob de la solicitud desembolsada debía ser 500 (BOB, factor 1), obtuvo %', v->'detail'->'expenses'->'requests';
  END IF;

  -- ── 25. Sin PII (email/id_number/aud_reg_number/auth_user_id) en ningún nivel ──────────
  IF v::text ILIKE '%ruizmier.com%' OR v::text ILIKE '%auth_user_id%' OR v::text ILIKE '%id_number%' OR v::text ILIKE '%aud_reg_number%' THEN
    RAISE EXCEPTION 'FAIL: el payload no debe exponer email/id_number/aud_reg_number/auth_user_id';
  END IF;

  RAISE NOTICE 'OK 13-25: payload completo de engagement_overview(E1) -- KPIs, presupuesto, desglose, equipo, staffing (9 semanas, D-1, D-2, used_hours acumulado), gastos normalizados a BOB, solicitudes (5 estados, borrador excluido), sin PII';
END $$;

-- ── 26. budget.actual_hours respeta p_start/p_end; budget.budget_hours NO (vida completa) ─
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.engagement_overview(pg_temp.e(1), pg_temp.today() - 5000, pg_temp.today() - 4000);  -- ventana sin ninguna hora
  IF (v->'detail'->'budget'->>'actual_hours')::numeric <> 0 THEN
    RAISE EXCEPTION 'FAIL: actual_hours en una ventana sin horas debía ser 0, obtuvo %', v->'detail'->'budget'->>'actual_hours';
  END IF;
  IF (v->'detail'->'budget'->>'budget_hours')::numeric <> 13 THEN
    RAISE EXCEPTION 'FAIL: budget_hours NO debía cambiar con el rango de fecha (sigue siendo 13), obtuvo %', v->'detail'->'budget'->>'budget_hours';
  END IF;
  RAISE NOTICE 'OK 26: budget.actual_hours respeta p_start/p_end; budget.budget_hours es de vida completa del encargo';
END $$;

-- ── 27. Setting tolerante: '5' cambia el umbral; valor inválido cae a 3; nunca lanza ─────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));

  UPDATE public.global_settings SET setting_value = '5' WHERE setting_key = 'DASH_ENGAGEMENT_PENDING_ALERT_WEEKS';
  v := public.engagement_overview(pg_temp.e(1), pg_temp.today() - 90, pg_temp.today() + 10);
  IF (v->'meta'->>'alert_weeks')::int <> 5 THEN
    RAISE EXCEPTION 'FAIL: alert_weeks debía reflejar el setting=5, obtuvo %', v->'meta'->>'alert_weeks';
  END IF;
  IF (v->'detail'->'kpis'->'pending_approval'->>'aged_hours')::numeric <> 0 THEN
    RAISE EXCEPTION 'FAIL: con alert_weeks=5, la línea de 4 semanas de antigüedad ya NO debía contar como aged (esperado 0), obtuvo %', v->'detail'->'kpis'->'pending_approval'->>'aged_hours';
  END IF;

  UPDATE public.global_settings SET setting_value = 'abc' WHERE setting_key = 'DASH_ENGAGEMENT_PENDING_ALERT_WEEKS';
  v := public.engagement_overview(pg_temp.e(1), pg_temp.today() - 90, pg_temp.today() + 10);
  IF (v->'meta'->>'alert_weeks')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL: un setting no numérico debía caer a 3 sin lanzar, obtuvo %', v->'meta'->>'alert_weeks';
  END IF;

  UPDATE public.global_settings SET setting_value = '99' WHERE setting_key = 'DASH_ENGAGEMENT_PENDING_ALERT_WEEKS';
  v := public.engagement_overview(pg_temp.e(1), pg_temp.today() - 90, pg_temp.today() + 10);
  IF (v->'meta'->>'alert_weeks')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL: un setting fuera de [1,52] debía caer a 3, obtuvo %', v->'meta'->>'alert_weeks';
  END IF;

  UPDATE public.global_settings SET setting_value = '3' WHERE setting_key = 'DASH_ENGAGEMENT_PENDING_ALERT_WEEKS';
  RAISE NOTICE 'OK 27: lectura tolerante del setting -- 5 cambia el umbral, valores no numéricos o fuera de [1,52] caen a 3, nunca lanza';
END $$;

-- ── 28. Horas sin fila de aprobación NUNCA cuentan como pendientes, pero sí como Cargado
-- (R-4) -- workerC cargó 6h sin ninguna fila en timesheet_line_approvals ───────────────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.engagement_overview(pg_temp.e(1), pg_temp.today() - 90, pg_temp.today() + 10);
  -- Ya cubierto por la aserción 15 (pending_approval no incluye las 6h de workerC) y por la
  -- 18 (el desglose SÍ las cuenta como actual_hours, categoría B). Se deja como assert
  -- explícito de que el total de pending_approval no se movió por esas 6h sueltas.
  IF (v->'detail'->'kpis'->'pending_approval'->>'last_week_hours')::numeric <> 7 THEN
    RAISE EXCEPTION 'FAIL: horas sin fila de aprobación no debían alterar pending_approval.last_week_hours (sigue en 7)';
  END IF;
  RAISE NOTICE 'OK 28: horas sin fila de aprobación (workerC, 6h) no cuentan como pendientes (R-4), pero sí como Cargado/actual (aserción 18)';
END $$;

-- ── 29. Idempotencia: engagement_overview() es de solo lectura -- 2 llamadas no cambian
-- el conteo de ninguna tabla tocada ─────────────────────────────────────────────────────
DO $$
DECLARE v_before_te int; v_after_te int; v_before_tla int; v_after_tla int;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  SELECT COUNT(*) INTO v_before_te FROM public.time_entries WHERE engagement_id = pg_temp.e(1);
  SELECT COUNT(*) INTO v_before_tla FROM public.timesheet_line_approvals WHERE engagement_id = pg_temp.e(1);
  PERFORM public.engagement_overview(pg_temp.e(1), pg_temp.today() - 90, pg_temp.today() + 10);
  PERFORM public.engagement_overview(pg_temp.e(1), pg_temp.today() - 90, pg_temp.today() + 10);
  SELECT COUNT(*) INTO v_after_te FROM public.time_entries WHERE engagement_id = pg_temp.e(1);
  SELECT COUNT(*) INTO v_after_tla FROM public.timesheet_line_approvals WHERE engagement_id = pg_temp.e(1);
  IF v_before_te <> v_after_te OR v_before_tla <> v_after_tla THEN
    RAISE EXCEPTION 'FAIL: engagement_overview() no debe escribir -- conteos cambiaron (te % -> %, tla % -> %)', v_before_te, v_after_te, v_before_tla, v_after_tla;
  END IF;
  RAISE NOTICE 'OK 29: engagement_overview() es de solo lectura -- llamarlo 2 veces no altera ninguna tabla';
END $$;

-- ── 30. approval_queue (corrección post-ejecución #2): consolida pending_lines POR
-- PERSONA -- workerA tiene 2 líneas pendientes (semana -1: 7h; semana -4: 4h, la misma
-- pareja usada por la aserción 15/26 para last_week_hours/aged_hours) que se consolidan en
-- UNA sola fila: hours=11 (suma de ambas, NO solo la más vieja -- a diferencia de
-- portfolio_overview() en dash_cartera), weeks_old=4 (el máximo, de la línea más vieja),
-- alert=true (4 >= alert_weeks=3, restaurado a su default por la aserción 27) ─────────────
DO $$
DECLARE v jsonb; v_item jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.engagement_overview(pg_temp.e(1), pg_temp.today() - 90, pg_temp.today() + 10);

  IF (v->'detail'->'approval_queue'->>'total_hours')::numeric <> 11
     OR (v->'detail'->'approval_queue'->>'distinct_people')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: approval_queue esperaba total_hours=11/distinct_people=1 (workerA consolidado), obtuvo %', v->'detail'->'approval_queue';
  END IF;

  IF jsonb_array_length(v->'detail'->'approval_queue'->'items') <> 1 THEN
    RAISE EXCEPTION 'FAIL: approval_queue.items esperaba exactamente 1 ítem (workerA consolidado, no 2 líneas sueltas), obtuvo %', v->'detail'->'approval_queue'->'items';
  END IF;

  SELECT i INTO v_item FROM jsonb_array_elements(v->'detail'->'approval_queue'->'items') i LIMIT 1;
  IF (v_item->>'staff_id')::uuid <> '50e07a60-0000-4000-8000-000000000016'::uuid
     OR (v_item->>'hours')::numeric <> 11
     OR (v_item->>'weeks_old')::int <> 4
     OR (v_item->>'alert')::boolean <> true THEN
    RAISE EXCEPTION 'FAIL: approval_queue.items[0] esperaba workerA con hours=11/weeks_old=4/alert=true, obtuvo %', v_item;
  END IF;

  RAISE NOTICE 'OK 30: approval_queue consolida por persona -- workerA con 2 líneas pendientes (semana -1: 7h, semana -4: 4h) da UNA fila hours=11/weeks_old=4 (el máximo)/alert=true';
END $$;

RESET ROLE;

DO $$
BEGIN
  RAISE NOTICE 'ENGAGEMENT OVERVIEW RPC: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
