-- Transactional tests for public.partner_overview() / public.partner_overview_engagements()
-- -- FEAT dash_socio (bugs/dashboard/socio/plan_v2.md §9.2 / decisiones.md).
--
-- DONDE CORRE: via supabase/tests/local/run-rls-tests.sh, contra la base scratch local con
-- el set consolidado + las migraciones incrementales + 20260915130000_dash_socio_partner_
-- overview.sql aplicados. Misma convencion que rpc-0828-185-engagement-portfolio.sql: una
-- sola transaccion que SIEMPRE termina en ROLLBACK, un NOTICE por chequeo que pasa, marcador
-- final "PARTNER OVERVIEW RPC: ALL CHECKS PASSED".
--
-- Fixture: todos los ids llevan el prefijo da5c10 reconocible. `categories`/`expense_types`/
-- `activity_codes` estan vacias en este harness (cero_10.._16 no se aplican aqui, solo el
-- fixture RBAC + el par sociedad/practica sembrado por run-rls-tests.sh), asi que este
-- archivo siembra las 3 categorias (Socio/SQR/Senior) y el resto del catalogo minimo que
-- necesita.
--
-- Los triggers de freeze de TC (0722-156b) validan transiciones de estado reales
-- (Pending->Invoiced->Completed) y exigen INSERT en 'Pending'; para poblar cuotas ya
-- facturadas/cobradas directamente (fixture historico, no un flujo real) se deshabilitan
-- puntualmente durante la carga del fixture, igual que 0828-185 deshabilita
-- trg_engagements_created_by para poder fijar created_by_staff_id a mano.

BEGIN;

-- ── Sociedades, industrias, clientes ─────────────────────────────────────────────────────
INSERT INTO public.society (society_id, name, is_active) VALUES
  ('5ada5c10-0000-4000-8000-000000000001', 'Sociedad Norte da5c10', true),
  ('5ada5c10-0000-4000-8000-000000000002', 'Sociedad Sur da5c10', true)
ON CONFLICT (society_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.practicas WHERE code = 1) THEN
    RAISE EXCEPTION 'FIXTURE: falta el servicio code = 1 (AUD) -- staff.practica_id es NOT NULL.';
  END IF;
END $$;

INSERT INTO public.industries (industry_id, industry_name, fiscal_year_end) VALUES
  ('90da5c10-0000-4000-8000-000000000001', 'Industria I1 da5c10', 'Diciembre'),
  ('90da5c10-0000-4000-8000-000000000002', 'Industria I2 da5c10', 'Diciembre')
ON CONFLICT (industry_id) DO NOTHING;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id, industry_id) VALUES
  ('60da5c10-0000-4000-8000-000000000001', 'Cliente C1 da5c10', 'NIT-DA5C10-1', '90da5c10-0000-4000-8000-000000000001'),
  ('60da5c10-0000-4000-8000-000000000002', 'Cliente C2 da5c10', 'NIT-DA5C10-2', '90da5c10-0000-4000-8000-000000000002'),
  ('60da5c10-0000-4000-8000-000000000003', 'Cliente C3 da5c10', 'NIT-DA5C10-3', '90da5c10-0000-4000-8000-000000000002')
ON CONFLICT (client_id) DO NOTHING;

-- ── Categorias (Socio/SQR/Senior, practica AUD code=1) -- tabla vacia en este harness ──────
INSERT INTO public.categories (category_id, category_name, practica_id, display_order,
                                rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd) VALUES
  ('c0da5c10-0000-4000-8000-000000000001', 'Socio',  (SELECT practica_id FROM public.practicas WHERE code = 1), 1, 1530, 1400, 153, 140),
  ('c0da5c10-0000-4000-8000-000000000002', 'Senior', (SELECT practica_id FROM public.practicas WHERE code = 1), 2, 350,  280,  35,  28),
  ('c0da5c10-0000-4000-8000-000000000003', 'SQR',    (SELECT practica_id FROM public.practicas WHERE code = 1), 3, 1050, 840, 145, 120)
ON CONFLICT (category_id) DO NOTHING;

-- ── expense_types + activity_codes (tambien vacias en este harness) ────────────────────────
INSERT INTO public.expense_types (expense_type_id, expense_name) VALUES
  ('9eda5c10-0000-4000-8000-000000000001', 'Viaticos da5c10')
ON CONFLICT (expense_type_id) DO NOTHING;

INSERT INTO public.activity_codes (activity_id, activity_code, description, practica_id) VALUES
  ('acda5c10-0000-4000-8000-000000000001', 'DA5C10', 'Actividad da5c10',
   (SELECT practica_id FROM public.practicas WHERE code = 1))
ON CONFLICT (activity_id) DO NOTHING;

-- ── Personal: un caller por rol + 3 workers para la valorizacion de horas ─────────────────
-- 01 senior_partner (firm) · 02 partner Norte · 03 director Norte (sqr_id de E6, YA NO le
-- alcanza para entrar a la cartera, correccion 2026-09-16) ·
-- 04 sqr Norte (partner_id de E6, la ve completa por ser partner_id, sin importar su rol) ·
-- 05 manager Norte (sin el permiso nuevo) ·
-- 06 admin Norte (mismo alcance que senior_partner, correccion 2026-09-16) ·
-- 07 senior (sin el permiso nuevo) · 08 worker Socio · 09 worker Senior · 10 worker SQR ·
-- 11 risk_partner Sur (partner_id de E8, correccion 2026-09-16: mismo predicado que
-- director/sqr -- scope 'assigned_engagements', NO firm-wide como en
-- dashboard.practice_financials.read/list_portfolio_engagements).
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a0da5c10-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'dash-socio-test-' || n || '@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 11) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, short_name, is_active,
                          practica_id, society_id, category_id)
SELECT ('50da5c10-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a0da5c10-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'DA5C10', 'Sujeto' || lpad(n::text, 2, '0'), 'DA5C10-' || lpad(n::text, 2, '0'),
       true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       CASE WHEN n IN (7, 11) THEN '5ada5c10-0000-4000-8000-000000000002'::uuid  -- senior/risk_partner: sociedad Sur
            ELSE '5ada5c10-0000-4000-8000-000000000001'::uuid END,               -- resto: sociedad Norte
       CASE n
         WHEN 8 THEN 'c0da5c10-0000-4000-8000-000000000001'::uuid   -- worker Socio
         WHEN 9 THEN 'c0da5c10-0000-4000-8000-000000000002'::uuid   -- worker Senior
         WHEN 10 THEN 'c0da5c10-0000-4000-8000-000000000003'::uuid  -- worker SQR
         ELSE NULL
       END
  FROM generate_series(1, 11) n;

INSERT INTO public.user_roles (user_id, role_key) VALUES
  ('a0da5c10-0000-4000-8000-000000000001', 'senior_partner'),
  ('a0da5c10-0000-4000-8000-000000000002', 'partner'),
  ('a0da5c10-0000-4000-8000-000000000003', 'director'),
  ('a0da5c10-0000-4000-8000-000000000004', 'sqr'),
  ('a0da5c10-0000-4000-8000-000000000005', 'manager'),
  ('a0da5c10-0000-4000-8000-000000000006', 'admin'),
  ('a0da5c10-0000-4000-8000-000000000007', 'senior'),
  ('a0da5c10-0000-4000-8000-000000000011', 'risk_partner')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

-- ── Encargos ────────────────────────────────────────────────────────────────────────────────
-- E1 Norte: OT Approved USD/High, TC fijo 6.96, partner=u2, manager=u5, anio_fiscal=2025.
-- E2 Sur: OT Approved, cuota "next 7 dias" para el test de la linea de tiempo estricta.
-- E3 Norte: OT Pending_Approval (state 1, fuera de cartera; cuenta en KPI5 OT por aprobar).
-- E4 Norte: override 7 Finalizado, end_date dentro del periodo (KPI1 finalizados).
-- E5 Norte: administrativo, sin OT (work_order_required = false) -> estado 4 por definicion.
-- E6 Norte: OT Approved BOB, partner_id=u4(sqr), sqr_id=u3(director) -- linea SQR a $0.
-- E7 Norte: OT Draft, manager=u5 -- fixture del prerrequisito de TC (assert 21).
-- E8 Sur: OT Approved BOB, partner_id=u11(risk_partner) -- correccion 2026-09-16: risk_partner
-- entra a la cartera por el mismo predicado que director/sqr (partner_id = yo). Client=C2 (Sur,
-- ya usado por E2) para no sumar un cliente/industria nuevo a filters.* de otras asserciones.
-- E9 Norte (2026-09-17): funcion=0 (Administrativo, NO Cliente), sin OT, partner_id=u2 (mismo
-- socio que E1/E5) -- deberia quedar EXCLUIDO de todo el tablero por funcion, aunque cumpla
-- estado 4 por definicion (sin OT) y coincida con partner_id de un caller real. E1-E8 son
-- funcion=1 (Cliente) explicito -- antes de esta columna quedaban en NULL (excluido tambien
-- por el nuevo chequeo `funcion = 1`), asi que hay que marcarlos para no romper el resto del
-- fixture.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, status, fecha_cierre,
                                society_id, partner_id, manager_id, sqr_id,
                                work_order_required, anio_fiscal, end_date, engagement_state_override,
                                funcion) VALUES
  ('70da5c10-0000-4000-8000-000000000001', '60da5c10-0000-4000-8000-000000000001',
   'DA5C10 E1 Norte', 'active', '2027-06-30',
   '5ada5c10-0000-4000-8000-000000000001', '50da5c10-0000-4000-8000-000000000002',
   '50da5c10-0000-4000-8000-000000000005', NULL, true, 2025, NULL, NULL, 1),
  ('70da5c10-0000-4000-8000-000000000002', '60da5c10-0000-4000-8000-000000000002',
   'DA5C10 E2 Sur', 'active', '2027-06-30',
   '5ada5c10-0000-4000-8000-000000000002', NULL, NULL, NULL, true, NULL, NULL, NULL, 1),
  ('70da5c10-0000-4000-8000-000000000003', '60da5c10-0000-4000-8000-000000000003',
   'DA5C10 E3 Norte pendiente', 'active', '2027-06-30',
   '5ada5c10-0000-4000-8000-000000000001', NULL, NULL, NULL, true, NULL, NULL, NULL, 1),
  ('70da5c10-0000-4000-8000-000000000004', '60da5c10-0000-4000-8000-000000000003',
   'DA5C10 E4 Norte finalizado', 'active', '2027-06-30',
   '5ada5c10-0000-4000-8000-000000000001', NULL, NULL, NULL, true, NULL, '2026-06-30', 7, 1),
  ('70da5c10-0000-4000-8000-000000000005', '60da5c10-0000-4000-8000-000000000003',
   'DA5C10 E5 Norte administrativo', 'active', '2027-06-30',
   '5ada5c10-0000-4000-8000-000000000001', NULL, NULL, NULL, false, NULL, NULL, NULL, 1),
  ('70da5c10-0000-4000-8000-000000000006', '60da5c10-0000-4000-8000-000000000003',
   'DA5C10 E6 Norte sqr', 'active', '2027-06-30',
   '5ada5c10-0000-4000-8000-000000000001', '50da5c10-0000-4000-8000-000000000004',
   NULL, '50da5c10-0000-4000-8000-000000000003', true, NULL, NULL, NULL, 1),
  ('70da5c10-0000-4000-8000-000000000007', '60da5c10-0000-4000-8000-000000000003',
   'DA5C10 E7 Norte TC prereq', 'active', '2027-06-30',
   '5ada5c10-0000-4000-8000-000000000001', NULL, '50da5c10-0000-4000-8000-000000000005',
   NULL, true, NULL, NULL, NULL, 1),
  ('70da5c10-0000-4000-8000-000000000008', '60da5c10-0000-4000-8000-000000000002',
   'DA5C10 E8 Sur risk_partner', 'active', '2027-06-30',
   '5ada5c10-0000-4000-8000-000000000002', '50da5c10-0000-4000-8000-000000000011',
   NULL, NULL, true, NULL, NULL, NULL, 1),
  ('70da5c10-0000-4000-8000-000000000009', '60da5c10-0000-4000-8000-000000000003',
   'DA5C10 E9 Norte no-cliente', 'active', '2027-06-30',
   '5ada5c10-0000-4000-8000-000000000001', '50da5c10-0000-4000-8000-000000000002',
   NULL, NULL, false, NULL, NULL, NULL, 0)
ON CONFLICT (engagement_id) DO NOTHING;

-- E10 Sur (review.md iteracion 1, MF-03): OT Approved BOB, sin partner_id/manager_id/sqr_id
-- (Sur, invisible para partner Norte y para director/sqr/risk_partner de este fixture) --
-- horas aprobadas+pendientes por debajo del presupuesto, pero con horas RECHAZADAS que
-- llevarian el total de "vida completa" por encima del presupuesto si el bug de MF-03
-- (rechazadas contando para sobregiro) no estuviera corregido. Cliente=C2 (ya usado por
-- E2/E8, no suma un cliente nuevo a filters.clients de otras aserciones).
-- E11 Norte (MF-02): mismas fechas explicitas 2025 (fuera del periodo de prueba 2026, asi
-- que NUNCA aparece en `scope`/`scope_all` de ninguna asercion existente), para probar que
-- `previous_total_bob` recalcula el alcance del anio anterior en vez de filtrar el `scope`
-- actual por approved_at (el bug: un encargo que solo estuvo en cartera el anio pasado
-- quedaba fuera de la comparacion). partner_id=NULL para no tocar my_partner_hours (u2).
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, status, fecha_cierre,
                                society_id, partner_id, manager_id, sqr_id,
                                work_order_required, anio_fiscal, end_date, engagement_state_override,
                                funcion, start_date) VALUES
  ('70da5c10-0000-4000-8000-000000000010', '60da5c10-0000-4000-8000-000000000002',
   'DA5C10 E10 Sur rechazadas', 'active', '2027-06-30',
   '5ada5c10-0000-4000-8000-000000000002', NULL, NULL, NULL, true, NULL, NULL, NULL, 1, NULL),
  ('70da5c10-0000-4000-8000-000000000011', '60da5c10-0000-4000-8000-000000000003',
   'DA5C10 E11 Norte anio anterior', 'active', '2026-06-30',
   '5ada5c10-0000-4000-8000-000000000001', NULL, NULL, NULL, true, NULL, '2025-06-30', NULL, 1, '2025-01-01')
ON CONFLICT (engagement_id) DO NOTHING;

-- ── Ordenes de trabajo ──────────────────────────────────────────────────────────────────────
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, tax_rate,
                                adjustment_amount, approval_status, approved_at, risk_status) VALUES
  ('d0da5c10-0000-4000-8000-000000000001', '70da5c10-0000-4000-8000-000000000001',
   'USD', 'High', 0.13, 0, 'Approved', '2026-03-01T00:00:00Z', 'Approved'),
  ('d0da5c10-0000-4000-8000-000000000002', '70da5c10-0000-4000-8000-000000000002',
   'BOB', 'High', 0.13, 0, 'Approved', '2026-03-01T00:00:00Z', 'Approved'),
  ('d0da5c10-0000-4000-8000-000000000003', '70da5c10-0000-4000-8000-000000000003',
   'BOB', 'High', 0.13, 0, 'Pending_Approval', NULL, 'Pending'),
  ('d0da5c10-0000-4000-8000-000000000006', '70da5c10-0000-4000-8000-000000000006',
   'BOB', 'High', 0.13, 0, 'Approved', '2026-03-01T00:00:00Z', 'Approved'),
  ('d0da5c10-0000-4000-8000-000000000007', '70da5c10-0000-4000-8000-000000000007',
   'USD', 'High', 0.13, 0, 'Draft', NULL, 'Pending'),
  ('d0da5c10-0000-4000-8000-000000000008', '70da5c10-0000-4000-8000-000000000008',
   'BOB', 'High', 0.13, 0, 'Approved', '2026-03-01T00:00:00Z', 'Approved'),
  ('d0da5c10-0000-4000-8000-000000000010', '70da5c10-0000-4000-8000-000000000010',
   'BOB', 'High', 0.13, 0, 'Approved', '2026-03-01T00:00:00Z', 'Approved'),
  ('d0da5c10-0000-4000-8000-000000000011', '70da5c10-0000-4000-8000-000000000011',
   'BOB', 'High', 0.13, 0, 'Approved', '2025-03-01T00:00:00Z', 'Approved')
ON CONFLICT (wo_id) DO NOTHING;

INSERT INTO public.wo_budget_lines (wo_line_id, wo_id, category_id, budgeted_hours, standard_rate) VALUES
  ('b1da5c10-0000-4000-8000-000000000001', 'd0da5c10-0000-4000-8000-000000000001', 'c0da5c10-0000-4000-8000-000000000001', 10, 100),  -- E1 Socio
  ('b1da5c10-0000-4000-8000-000000000002', 'd0da5c10-0000-4000-8000-000000000001', 'c0da5c10-0000-4000-8000-000000000002', 5, 50),    -- E1 Senior
  ('b1da5c10-0000-4000-8000-000000000006', 'd0da5c10-0000-4000-8000-000000000006', 'c0da5c10-0000-4000-8000-000000000003', 8, 0),     -- E6 SQR ($0, no aporta honorario)
  ('b1da5c10-0000-4000-8000-000000000010', 'd0da5c10-0000-4000-8000-000000000010', 'c0da5c10-0000-4000-8000-000000000001', 10, 50),   -- E10: presupuesto 10h, categoria Socio (matchea la de w1, asercion 12/13 predecible)
  ('b1da5c10-0000-4000-8000-000000000011', 'd0da5c10-0000-4000-8000-000000000011', 'c0da5c10-0000-4000-8000-000000000002', 5, 200)    -- E11: fee_net = 5*200 = 1000 BOB (MF-02)
ON CONFLICT (wo_line_id) DO NOTHING;

INSERT INTO public.wo_expense_budget (wo_exp_id, wo_id, expense_type_id, budgeted_amount) VALUES
  ('b2da5c10-0000-4000-8000-000000000001', 'd0da5c10-0000-4000-8000-000000000001', '9eda5c10-0000-4000-8000-000000000001', 200)
ON CONFLICT (wo_exp_id) DO NOTHING;

-- ── Planes de pago + cuotas -- se deshabilitan los triggers de freeze/transicion para poder
-- sembrar cuotas historicas ya facturadas/cobradas directamente (no es un flujo real de UI).
ALTER TABLE public.wo_payment_plan DISABLE TRIGGER trg_wo_payment_plan_guard_exchange_rate;
ALTER TABLE public.wo_payment_plan DISABLE TRIGGER trg_wo_payment_plan_sync_fixed_installments;
ALTER TABLE public.wo_payment_installments DISABLE TRIGGER trg_wo_payment_installments_guard_exchange_rate;
ALTER TABLE public.wo_payment_installments DISABLE TRIGGER trg_wo_payment_installments_guard_delete;

INSERT INTO public.wo_payment_plan (plan_id, wo_id, exchange_rate, exchange_rate_mode, payment_days) VALUES
  ('e0da5c10-0000-4000-8000-000000000001', 'd0da5c10-0000-4000-8000-000000000001', 6.96, 'fijo', 30),
  ('e0da5c10-0000-4000-8000-000000000002', 'd0da5c10-0000-4000-8000-000000000002', 6.96, 'fijo', 30)
ON CONFLICT (plan_id) DO NOTHING;

-- E1 (base con IVA = (1250 + 200) / 0.87 = 1666.666...): 3 cuotas 40/30/30.
--   i1 Completed  (cobrada, TC pago != TC factura para probar que collected usa payment_exchange_rate)
--   i2 Invoiced   (facturada hace > 90 dias -> vencido>90d; agreed_payment_date = hoy-2 -> chip vencidas)
--   i3 Pending    (agreed_invoice_date = hoy-1 -> en mora / Bloque C)
-- "hoy" aca es SIEMPRE ((now() AT TIME ZONE 'America/La_Paz')::date) -- el mismo calculo
-- exacto de la CTE now_ctx del RPC (linea 192 de la migracion). Usar CURRENT_DATE (UTC del
-- servidor) en vez de esto es un bug real de fixture: entre las 00:00 y las ~04:00 UTC,
-- Bolivia (UTC-4) todavia esta en el dia anterior, y un offset de "-1 dia" en UTC puede
-- coincidir con el "hoy" del RPC en vez de ser estrictamente anterior -- rompe la asercion
-- 16 (in_arrears) de forma intermitente, solo durante esa ventana horaria (detectado
-- corriendo test:rls de verdad por primera vez con esta ventana activa).
INSERT INTO public.wo_payment_installments (installment_id, plan_id, wo_id, installment_number,
    percentage, amount, status,
    agreed_invoice_date, agreed_payment_date, collection_invoice_date, collection_payment_date, payment_date_actual,
    invoice_exchange_rate, payment_exchange_rate) VALUES
  ('f0da5c10-0000-4000-8000-000000000001', 'e0da5c10-0000-4000-8000-000000000001', 'd0da5c10-0000-4000-8000-000000000001', 1,
   40, NULL, 'Completed',
   ((now() AT TIME ZONE 'America/La_Paz')::date) - 60, ((now() AT TIME ZONE 'America/La_Paz')::date) - 20,
   ((now() AT TIME ZONE 'America/La_Paz')::date) - 50, ((now() AT TIME ZONE 'America/La_Paz')::date) - 10,
   ((now() AT TIME ZONE 'America/La_Paz')::date) - 10,
   6.96, 6.90),
  ('f0da5c10-0000-4000-8000-000000000002', 'e0da5c10-0000-4000-8000-000000000001', 'd0da5c10-0000-4000-8000-000000000001', 2,
   30, NULL, 'Invoiced',
   ((now() AT TIME ZONE 'America/La_Paz')::date) - 100, ((now() AT TIME ZONE 'America/La_Paz')::date) - 2,
   ((now() AT TIME ZONE 'America/La_Paz')::date) - 100, NULL, NULL,
   6.96, NULL),
  ('f0da5c10-0000-4000-8000-000000000003', 'e0da5c10-0000-4000-8000-000000000001', 'd0da5c10-0000-4000-8000-000000000001', 3,
   30, NULL, 'Pending',
   ((now() AT TIME ZONE 'America/La_Paz')::date) - 1, ((now() AT TIME ZONE 'America/La_Paz')::date) + 29, NULL, NULL, NULL,
   NULL, NULL)
ON CONFLICT (installment_id) DO NOTHING;

-- E2: 1 cuota Invoiced con agreed_payment_date = hoy+3 (linea de 7 dias estricta, "cobrar").
INSERT INTO public.wo_payment_installments (installment_id, plan_id, wo_id, installment_number,
    percentage, amount, status,
    agreed_invoice_date, agreed_payment_date, collection_invoice_date, collection_payment_date, payment_date_actual,
    invoice_exchange_rate, payment_exchange_rate) VALUES
  ('f0da5c10-0000-4000-8000-000000000004', 'e0da5c10-0000-4000-8000-000000000002', 'd0da5c10-0000-4000-8000-000000000002', 1,
   100, NULL, 'Invoiced',
   ((now() AT TIME ZONE 'America/La_Paz')::date) - 10, ((now() AT TIME ZONE 'America/La_Paz')::date) + 3,
   ((now() AT TIME ZONE 'America/La_Paz')::date) - 5, NULL, NULL,
   6.96, NULL)
ON CONFLICT (installment_id) DO NOTHING;

ALTER TABLE public.wo_payment_plan ENABLE TRIGGER trg_wo_payment_plan_guard_exchange_rate;
ALTER TABLE public.wo_payment_plan ENABLE TRIGGER trg_wo_payment_plan_sync_fixed_installments;
ALTER TABLE public.wo_payment_installments ENABLE TRIGGER trg_wo_payment_installments_guard_exchange_rate;
ALTER TABLE public.wo_payment_installments ENABLE TRIGGER trg_wo_payment_installments_guard_delete;

-- ── Gastos: revisado_asistente cuenta, aprobado_gerente solo en tooltip, pendiente_aprobacion no cuenta ──
-- fund_requests.currency SIEMPRE es BOB (trigger tr_fund_requests_enforce_bob, cero_02).
-- Detectado corriendo test:rls de verdad (2026-09-17): un gasto ligado a una OT NUNCA puede
-- estar en USD -- ademas del enforce_bob de arriba, fr_wo_validate_approved() (el trigger de
-- fund_request_work_orders, requisito nuevo que este fixture tampoco cumplia) exige
-- explicitamente currency = 'BOB' para poder asignarle cualquier OT a la solicitud ("BUG
-- 0722-164 (2): la solicitud es el EFECTIVO entregado y se rinde con facturas bolivianas +
-- IVA 13%"), y fre_validate_wo_in_request() exige ademas que la moneda del gasto coincida
-- con la de su solicitud. Las tres reglas juntas hacen que la rama USD del CASE de
-- expenses_by_engagement en partner_overview() sea inalcanzable con el diseno actual --
-- confirmado con el operador 2026-09-17, no se toca el SQL de la RPC (el CASE es inofensivo
-- aunque nunca se ejercite), se ajusta el fixture a BOB (unico dato real posible) y queda
-- anotado en decisiones.md/plan_v2.md.
INSERT INTO public.fund_requests (fund_request_id, requester_staff_id, total_requested_amount, currency) VALUES
  ('b3da5c10-0000-4000-8000-000000000001', '50da5c10-0000-4000-8000-000000000005', 1000, 'BOB')
ON CONFLICT (fund_request_id) DO NOTHING;

INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount) VALUES
  ('b3da5c10-0000-4000-8000-000000000001', 'd0da5c10-0000-4000-8000-000000000001', 1000)
ON CONFLICT DO NOTHING;

INSERT INTO public.fund_request_expenses (fre_id, fund_request_id, wo_id, expense_type_id,
    expense_date, amount, currency, status) VALUES
  ('b4da5c10-0000-4000-8000-000000000001', 'b3da5c10-0000-4000-8000-000000000001',
   'd0da5c10-0000-4000-8000-000000000001', '9eda5c10-0000-4000-8000-000000000001',
   '2026-04-01', 500, 'BOB', 'revisado_asistente'),
  ('b4da5c10-0000-4000-8000-000000000002', 'b3da5c10-0000-4000-8000-000000000001',
   'd0da5c10-0000-4000-8000-000000000001', '9eda5c10-0000-4000-8000-000000000001',
   '2026-04-02', 300, 'BOB', 'aprobado_gerente'),
  ('b4da5c10-0000-4000-8000-000000000003', 'b3da5c10-0000-4000-8000-000000000001',
   'd0da5c10-0000-4000-8000-000000000001', '9eda5c10-0000-4000-8000-000000000001',
   '2026-04-03', 999, 'BOB', 'pendiente_aprobacion')
ON CONFLICT (fre_id) DO NOTHING;

-- ── Horas: periodos + entradas de tiempo para w1(Socio)/w2(Senior)/w3(SQR) sobre E1 ─────────
INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year) VALUES
  ('11da5c10-0000-4000-8000-000000000001', '50da5c10-0000-4000-8000-000000000008', '2026-03-02', 9, 2026),
  ('11da5c10-0000-4000-8000-000000000002', '50da5c10-0000-4000-8000-000000000009', '2026-03-02', 9, 2026),
  -- timesheet_periods tiene UNIQUE(staff_id, week_start_date) -- w1 necesita una fecha
  -- distinta para su 2do periodo (detectado corriendo test:rls de verdad: el fixture
  -- original repetia 2026-03-02, ya usado en la fila de arriba para el mismo staff_id).
  ('11da5c10-0000-4000-8000-000000000003', '50da5c10-0000-4000-8000-000000000008', '2026-03-09', 10, 2026),  -- w1, 2do periodo (para la linea rechazada)
  -- review.md iteracion 4, SF-01: periodo del propio partner (u2/s2) para probar que
  -- `funcion=1` tambien excluye KPI3/4 personales (my_partner_hours), no solo el scope
  -- general -- hueco de cobertura senalado en reporte_ejecucion.md, quinta correccion.
  ('11da5c10-0000-4000-8000-000000000004', '50da5c10-0000-4000-8000-000000000002', '2026-03-02', 9, 2026)  -- u2 (partner), para la linea sobre E9
ON CONFLICT (period_id) DO NOTHING;

-- Orden real: primero se cargan las horas, recien despues se aprueba la linea -- el trigger
-- protect_approved_time_entries() rechaza un INSERT de time_entries en una linea YA
-- aprobada (detectado corriendo test:rls de verdad: el fixture original aprobaba primero y
-- rechazaba el INSERT de te1/te2 con APPROVED_LINE_LOCKED). Las aprobaciones se insertan
-- despues del bloque de time_entries, mas abajo.
INSERT INTO public.time_entries (time_id, date_worked, hours_logged, staff_id, engagement_id,
                                 activity_id, period_id, is_forecast) VALUES
  -- te1: w1 Socio, periodo aprobado, 2h en el periodo -> aprobadas
  ('13da5c10-0000-4000-8000-000000000001', '2026-03-03', 2, '50da5c10-0000-4000-8000-000000000008',
   '70da5c10-0000-4000-8000-000000000001', 'acda5c10-0000-4000-8000-000000000001',
   '11da5c10-0000-4000-8000-000000000001', false),
  -- te1b: w1 Socio, SIN periodo (NULL) -> pendiente, 1h
  ('13da5c10-0000-4000-8000-000000000002', '2026-03-04', 1, '50da5c10-0000-4000-8000-000000000008',
   '70da5c10-0000-4000-8000-000000000001', 'acda5c10-0000-4000-8000-000000000001',
   NULL, false),
  -- te2: w2 Senior, periodo aprobado, 2h -> aprobadas (con wo_budget_lines: standard_rate=50)
  ('13da5c10-0000-4000-8000-000000000003', '2026-03-03', 2, '50da5c10-0000-4000-8000-000000000009',
   '70da5c10-0000-4000-8000-000000000001', 'acda5c10-0000-4000-8000-000000000001',
   '11da5c10-0000-4000-8000-000000000002', false),
  -- te3: w3 SQR, SIN aprobacion -> pendiente, 3h (SIN linea en wo_budget_lines -> fallback categories.rate_high_usd)
  ('13da5c10-0000-4000-8000-000000000004', '2026-03-05', 3, '50da5c10-0000-4000-8000-000000000010',
   '70da5c10-0000-4000-8000-000000000001', 'acda5c10-0000-4000-8000-000000000001',
   NULL, false),
  -- te4: w1 Socio, is_forecast = true -> NO cuenta en ningun lado (hours_logged es numeric(4,2), max 99.99)
  ('13da5c10-0000-4000-8000-000000000005', '2026-03-06', 9, '50da5c10-0000-4000-8000-000000000008',
   '70da5c10-0000-4000-8000-000000000001', 'acda5c10-0000-4000-8000-000000000001',
   NULL, true),
  -- te5: w1 Socio, fecha 2020 (fuera del periodo, cuenta solo en "vida completa") -> sobregiro
  ('13da5c10-0000-4000-8000-000000000006', '2020-01-01', 20, '50da5c10-0000-4000-8000-000000000008',
   '70da5c10-0000-4000-8000-000000000001', 'acda5c10-0000-4000-8000-000000000001',
   NULL, false),
  -- te6: w1 Socio, periodo rechazado, 1.5h -> rechazadas
  ('13da5c10-0000-4000-8000-000000000007', '2026-03-07', 1.5, '50da5c10-0000-4000-8000-000000000008',
   '70da5c10-0000-4000-8000-000000000001', 'acda5c10-0000-4000-8000-000000000001',
   '11da5c10-0000-4000-8000-000000000003', false),
  -- E10 (MF-03): 5h aprobadas + 3h pendientes (8h, DENTRO del presupuesto de 10h) + 6h
  -- RECHAZADAS -- 5+3+6=14h > 10h si las rechazadas contaran (bug), 8h < 10h si no cuentan
  -- (fix). Reutiliza los mismos period_id de w1 (0001=aprobado, 0003=rechazado); la
  -- aprobacion se resuelve por (period_id, engagement_id, activity_id), no por staff_id.
  ('13da5c10-0000-4000-8000-000000000010', '2026-03-03', 5, '50da5c10-0000-4000-8000-000000000008',
   '70da5c10-0000-4000-8000-000000000010', 'acda5c10-0000-4000-8000-000000000001',
   '11da5c10-0000-4000-8000-000000000001', false),
  ('13da5c10-0000-4000-8000-000000000011', '2026-03-04', 3, '50da5c10-0000-4000-8000-000000000008',
   '70da5c10-0000-4000-8000-000000000010', 'acda5c10-0000-4000-8000-000000000001',
   NULL, false),
  ('13da5c10-0000-4000-8000-000000000012', '2026-03-07', 6, '50da5c10-0000-4000-8000-000000000008',
   '70da5c10-0000-4000-8000-000000000010', 'acda5c10-0000-4000-8000-000000000001',
   '11da5c10-0000-4000-8000-000000000003', false),
  -- te13 (review.md iteracion 4, SF-01): u2 (partner, socio de E1/E5/E9) carga 4h sobre E9
  -- (funcion=0, Administrativo -- NO Cliente) y la linea queda aprobada mas abajo. Si el
  -- filtro `funcion=1` de my_partner_engagements (KPI3) no se aplicara, estas 4h apareceriran
  -- en kpis.my_partner_hours.approved -- la asercion 11b confirma que NO aparecen.
  ('13da5c10-0000-4000-8000-000000000013', '2026-03-03', 4, '50da5c10-0000-4000-8000-000000000002',
   '70da5c10-0000-4000-8000-000000000009', 'acda5c10-0000-4000-8000-000000000001',
   '11da5c10-0000-4000-8000-000000000004', false)
ON CONFLICT (time_id) DO NOTHING;

INSERT INTO public.timesheet_line_approvals (approval_id, period_id, engagement_id, activity_id, status) VALUES
  ('12da5c10-0000-4000-8000-000000000001', '11da5c10-0000-4000-8000-000000000001',
   '70da5c10-0000-4000-8000-000000000001', 'acda5c10-0000-4000-8000-000000000001', 'approved'),
  ('12da5c10-0000-4000-8000-000000000002', '11da5c10-0000-4000-8000-000000000002',
   '70da5c10-0000-4000-8000-000000000001', 'acda5c10-0000-4000-8000-000000000001', 'approved'),
  ('12da5c10-0000-4000-8000-000000000003', '11da5c10-0000-4000-8000-000000000003',
   '70da5c10-0000-4000-8000-000000000001', 'acda5c10-0000-4000-8000-000000000001', 'rejected'),
  ('12da5c10-0000-4000-8000-000000000010', '11da5c10-0000-4000-8000-000000000001',
   '70da5c10-0000-4000-8000-000000000010', 'acda5c10-0000-4000-8000-000000000001', 'approved'),
  ('12da5c10-0000-4000-8000-000000000011', '11da5c10-0000-4000-8000-000000000003',
   '70da5c10-0000-4000-8000-000000000010', 'acda5c10-0000-4000-8000-000000000001', 'rejected'),
  -- te13 (SF-01) queda aprobada -- el peor caso para probar la exclusion: si `funcion=1`
  -- no filtrara, esta linea aparecería como horas APROBADAS en my_partner_hours.
  ('12da5c10-0000-4000-8000-000000000012', '11da5c10-0000-4000-8000-000000000004',
   '70da5c10-0000-4000-8000-000000000009', 'acda5c10-0000-4000-8000-000000000001', 'approved')
ON CONFLICT (approval_id) DO NOTHING;

-- ── Helpers (patron de rpc-0828-185-engagement-portfolio.sql) ───────────────────────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'a0da5c10-0000-4000-8000-' || lpad(n::text, 12, '0')
$$;
CREATE FUNCTION pg_temp.s(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('50da5c10-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.e(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('70da5c10-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.has_eng(p_items jsonb, p_id uuid) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE (e->>'engagement_id')::uuid = p_id)
$$;

-- Periodo de prueba: FY 2026 completo.
-- (v_start/v_end se recalculan por bloque via variables psql-less: usamos literales directos)

SET LOCAL ROLE authenticated;

-- ── 1. Sin impersonar -> FORBIDDEN ───────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
    RAISE EXCEPTION 'FAIL: sin impersonar deberia lanzar FORBIDDEN';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FORBIDDEN%' THEN
      RAISE EXCEPTION 'FAIL: excepcion inesperada sin impersonar: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK 1: sin impersonar, partner_overview() lanza FORBIDDEN';
END $$;

-- ── 2. senior (sin permiso) / manager -> FORBIDDEN ──────────────────────────────────────────
DO $$
DECLARE v_role text; v_uid text;
BEGIN
  FOR v_role, v_uid IN
    SELECT * FROM (VALUES ('senior', pg_temp.u(7)), ('manager', pg_temp.u(5))) t(role_key, uid)
  LOOP
    PERFORM pg_temp.impersonate(v_uid);
    BEGIN
      PERFORM public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
      RAISE EXCEPTION 'FAIL: % deberia lanzar FORBIDDEN (no tiene dashboard.partner.read)', v_role;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'FORBIDDEN%' THEN
        RAISE EXCEPTION 'FAIL: % lanzo una excepcion inesperada: %', v_role, SQLERRM;
      END IF;
    END;
  END LOOP;
  RAISE NOTICE 'OK 2: senior/manager (sin dashboard.partner.read) -> FORBIDDEN';
END $$;

-- ── 2b. admin: mismo alcance que senior_partner (correccion del operador, 2026-09-16) ───────
-- decisiones.md §7 excluia a admin; el operador corrigio: admin ve la pestana Socio con el
-- MISMO alcance que senior_partner (toda la firma), ya no queda FORBIDDEN.
DO $$
DECLARE v jsonb; v_senior jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v_senior := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);

  PERFORM pg_temp.impersonate(pg_temp.u(6));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF v->'meta'->>'scope_kind' <> 'firm' THEN
    RAISE EXCEPTION 'FAIL: admin scope_kind esperado firm, obtuvo %', v->'meta'->>'scope_kind';
  END IF;
  IF (v->'meta'->>'unfiltered_scope_count')::int <> (v_senior->'meta'->>'unfiltered_scope_count')::int THEN
    RAISE EXCEPTION 'FAIL: admin unfiltered_scope_count debia igualar al de senior_partner (%), obtuvo %',
      v_senior->'meta'->>'unfiltered_scope_count', v->'meta'->>'unfiltered_scope_count';
  END IF;
  RAISE NOTICE 'OK 2b: admin ve scope_kind=firm y el mismo unfiltered_scope_count que senior_partner';
END $$;

-- ── 3. senior_partner: unfiltered_scope_count = 6 (E1,E2,E5,E6,E8,E10), scope_kind = firm ────
-- E8 (Sur, partner_id=u11 risk_partner, asercion 5b) cuenta aqui tambien: senior_partner ve
-- TODA la firma sin importar sociedad ni partner_id/sqr_id. E10 (Sur, MF-03, review.md
-- iteracion 1) se agrego 2026-09-17 y tambien cuenta (state 4, funcion=1). E11 (Norte,
-- MF-02) NO cuenta aqui -- sus fechas 2025 lo dejan fuera del periodo 2026 de esta asercion.
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'meta'->>'unfiltered_scope_count')::int <> 6 THEN
    RAISE EXCEPTION 'FAIL: senior_partner unfiltered_scope_count esperado 6, obtuvo %', v->'meta'->>'unfiltered_scope_count';
  END IF;
  IF v->'meta'->>'scope_kind' <> 'firm' THEN
    RAISE EXCEPTION 'FAIL: senior_partner scope_kind esperado firm, obtuvo %', v->'meta'->>'scope_kind';
  END IF;
  RAISE NOTICE 'OK 3: senior_partner ve unfiltered_scope_count=6, scope_kind=firm';
END $$;

-- ── 4. partner Norte: scope_count = 3 (E1,E5,E6), scope_kind=society, society_name, sin E2 ─
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'meta'->>'scope_count')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL: partner Norte scope_count esperado 3, obtuvo %', v->'meta'->>'scope_count';
  END IF;
  IF v->'meta'->>'scope_kind' <> 'society' THEN
    RAISE EXCEPTION 'FAIL: partner scope_kind esperado society, obtuvo %', v->'meta'->>'scope_kind';
  END IF;
  IF v->'meta'->>'society_name' <> 'Sociedad Norte da5c10' THEN
    RAISE EXCEPTION 'FAIL: partner society_name incorrecto: %', v->'meta'->>'society_name';
  END IF;
  RAISE NOTICE 'OK 4: partner Norte ve scope_count=3, scope_kind=society, society_name correcto';
END $$;

-- ── 5. director (solo sqr_id de E6): excluido de la cartera; sqr (partner_id de E6): incluido ──
-- Correccion del operador (2026-09-16): ser SQR de un encargo (sqr_id = yo) ya NO alcanza
-- para entrar a role_scope/scope_all (KPI1, Bloques A-H, KPI5) -- solo partner_id = yo. u3
-- (rol 'director') es sqr_id de E6 pero NUNCA partner_id de nada -> su scope queda vacio;
-- sus horas de SQR siguen disponibles via kpis.my_sqr_hours (asercion 11, sin cambios, esa
-- CTE nunca dependio de role_scope). u4 (rol 'sqr') es LITERALMENTE partner_id de E6 -> la
-- ve completa, porque el alcance lo decide la columna del encargo, no la etiqueta del rol.
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));  -- director, sqr_id de E6 (NO partner_id de nada)
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'meta'->>'scope_count')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: director (solo sqr_id de E6) scope_count esperado 0, obtuvo %', v->'meta'->>'scope_count';
  END IF;
  -- 2026-09-17: engagement_hours_preview se retiro de partner_overview() (Bloque F
  -- rediseñado); la presencia/ausencia de un encargo puntual se verifica ahora contra
  -- partner_overview_engagements(), unica fuente de filas de ese bloque.
  v := public.partner_overview_engagements('2026-01-01'::date, '2026-12-31'::date);
  IF pg_temp.has_eng(v->'items', pg_temp.e(6)) THEN
    RAISE EXCEPTION 'FAIL: director (solo sqr_id de E6) NO deberia ver E6 en partner_overview_engagements';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(4));  -- rol 'sqr', pero partner_id de E6
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'meta'->>'scope_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: sqr (partner_id de E6) scope_count esperado 1, obtuvo %', v->'meta'->>'scope_count';
  END IF;
  v := public.partner_overview_engagements('2026-01-01'::date, '2026-12-31'::date);
  IF NOT pg_temp.has_eng(v->'items', pg_temp.e(6)) THEN
    RAISE EXCEPTION 'FAIL: sqr (partner_id de E6) deberia ver E6 en partner_overview_engagements';
  END IF;
  RAISE NOTICE 'OK 5: director (solo sqr_id de E6) queda fuera de la cartera; sqr (partner_id de E6) la ve completa';
END $$;

-- ── 5b. risk_partner: mismo predicado que director/sqr -- ve E8 (partner_id=el) ────────────
-- Correccion del operador (2026-09-16): risk_partner entra al mismo bucket "own" que
-- director/sqr (role_scope), scope 'assigned_engagements' -- NO firm-wide como en
-- dashboard.practice_financials.read / list_portfolio_engagements (0828-185).
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(11));  -- risk_partner, partner_id de E8
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'meta'->>'scope_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: risk_partner scope_count esperado 1 (E8), obtuvo %', v->'meta'->>'scope_count';
  END IF;
  IF v->'meta'->>'scope_kind' <> 'own' THEN
    RAISE EXCEPTION 'FAIL: risk_partner scope_kind esperado own, obtuvo %', v->'meta'->>'scope_kind';
  END IF;
  v := public.partner_overview_engagements('2026-01-01'::date, '2026-12-31'::date);
  IF NOT pg_temp.has_eng(v->'items', pg_temp.e(8)) THEN
    RAISE EXCEPTION 'FAIL: risk_partner no vio E8 en partner_overview_engagements';
  END IF;
  RAISE NOTICE 'OK 5b: risk_partner (correccion 2026-09-16) ve E8 (partner_id=el), scope_kind=own, mismo predicado que director/sqr';
END $$;

-- ── 6. p_client_id del cliente de E1 -> scope_count=1; filters.clients no cambia ────────────
DO $$
DECLARE v_unfiltered jsonb; v_filtered jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v_unfiltered := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  v_filtered := public.partner_overview('2026-01-01'::date, '2026-12-31'::date, NULL,
    '60da5c10-0000-4000-8000-000000000001'::uuid);
  IF (v_filtered->'meta'->>'scope_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: filtro por cliente de E1 esperaba scope_count=1, obtuvo %', v_filtered->'meta'->>'scope_count';
  END IF;
  IF (v_filtered->'meta'->>'unfiltered_scope_count') <> (v_unfiltered->'meta'->>'unfiltered_scope_count') THEN
    RAISE EXCEPTION 'FAIL: unfiltered_scope_count no debia cambiar con el filtro de cliente';
  END IF;
  IF jsonb_array_length(v_filtered->'filters'->'clients') <> jsonb_array_length(v_unfiltered->'filters'->'clients') THEN
    RAISE EXCEPTION 'FAIL: filters.clients debia seguir listando los clientes de scope_all, no solo el filtrado';
  END IF;
  RAISE NOTICE 'OK 6: p_client_id reduce scope_count sin afectar unfiltered_scope_count ni filters.clients';
END $$;

-- ── 7. p_manager_id / p_industry_id reducen scope_count; filters acotados al alcance ───────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF jsonb_array_length(v->'filters'->'managers') <> 1 THEN
    RAISE EXCEPTION 'FAIL: filters.managers esperaba exactamente 1 gerente (solo E1 tiene manager_id), obtuvo %',
      jsonb_array_length(v->'filters'->'managers');
  END IF;

  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date, NULL, NULL,
    '50da5c10-0000-4000-8000-000000000005'::uuid);
  IF (v->'meta'->>'scope_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: filtro por gerente esperaba scope_count=1, obtuvo %', v->'meta'->>'scope_count';
  END IF;

  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date, NULL, NULL, NULL,
    '90da5c10-0000-4000-8000-000000000001'::uuid);
  IF (v->'meta'->>'scope_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: filtro por sector I1 esperaba scope_count=1, obtuvo %', v->'meta'->>'scope_count';
  END IF;
  RAISE NOTICE 'OK 7: p_manager_id/p_industry_id reducen scope_count; filters.managers acotado al alcance del rol';
END $$;

-- ── 7b. p_society_id (2026-09-17): filters.societies lista TODAS las sociedades activas del
-- catalogo (no solo las que tienen encargos en scope_all -- fix consolidado directo en
-- 20260915130000_dash_socio_partner_overview.sql, ver review.md iteracion 2 MF-01/MF-02);
-- filtrar por Sur reduce scope_count a los encargos Sur (E2, E8, E10; E1/E5/E6/E11 son
-- Norte, E9 es Sur pero funcion=0 --
-- no aporta) ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v jsonb; v_active_societies int;
BEGIN
  SELECT count(*) INTO v_active_societies FROM public.society WHERE is_active;

  PERFORM pg_temp.impersonate(pg_temp.u(1));  -- senior_partner: unico rol que ve el filtro en la UI
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF jsonb_array_length(v->'filters'->'societies') <> v_active_societies THEN
    RAISE EXCEPTION 'FAIL: filters.societies esperaba % (todas las sociedades activas del catalogo), obtuvo %',
      v_active_societies, jsonb_array_length(v->'filters'->'societies');
  END IF;

  -- E10 (Sur, MF-03, agregado 2026-09-17) suma a la Sociedad Sur junto con E2/E8.
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date, NULL, NULL, NULL, NULL,
    '5ada5c10-0000-4000-8000-000000000002'::uuid);  -- Sociedad Sur
  IF (v->'meta'->>'scope_count')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL: filtro por Sociedad Sur esperaba scope_count=3 (E2, E8, E10), obtuvo %', v->'meta'->>'scope_count';
  END IF;
  RAISE NOTICE 'OK 7b: filters.societies lista % (todas las activas); p_society_id=Sur acota scope_count a 3 (E2, E8, E10)', v_active_societies;
END $$;

-- ── 7c. filters.societies NO depende de scope_all (FIX 2026-09-17): con un
-- p_fiscal_year imposible (ningun encargo del fixture tiene anio_fiscal=1900), scope_all
-- queda vacio para TODAS las sociedades -- pero el selector de Sociedad debe seguir
-- listando el catalogo completo, exactamente como con datos en alcance. Esto es lo que el
-- bug real (revision visual del operador, 2026-09-17: "Ruizmier Jauregui S.R.L." no
-- aparecia en el selector) necesitaba y la asercion 7b sola no cubria -- 7b "pasaba" porque
-- el fixture tiene encargos en ambas sociedades dentro del rango de fechas que usa, sin
-- ejercitar el caso de una sociedad sin encargos calificados. ─────────────────────────────
DO $$
DECLARE v jsonb; v_active_societies int;
BEGIN
  SELECT count(*) INTO v_active_societies FROM public.society WHERE is_active;

  PERFORM pg_temp.impersonate(pg_temp.u(1));  -- senior_partner
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date, 1900);
  IF (v->'meta'->>'unfiltered_scope_count')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: p_fiscal_year=1900 deberia dejar unfiltered_scope_count en 0, obtuvo %',
      v->'meta'->>'unfiltered_scope_count';
  END IF;
  IF jsonb_array_length(v->'filters'->'societies') <> v_active_societies THEN
    RAISE EXCEPTION 'FAIL: filters.societies con scope_all vacio esperaba % (catalogo completo, sin depender del alcance), obtuvo %',
      v_active_societies, jsonb_array_length(v->'filters'->'societies');
  END IF;
  RAISE NOTICE 'OK 7c: filters.societies lista el catalogo completo (%) aun con scope_all vacio (p_fiscal_year=1900) -- no depende del alcance', v_active_societies;
END $$;

-- ── 8. p_fiscal_year: E1.anio_fiscal=2025 sale con 2026, entra con NULL (solapamiento) ──────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.partner_overview_engagements('2026-01-01'::date, '2026-12-31'::date, 2026);
  IF pg_temp.has_eng(v->'items', pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: con p_fiscal_year=2026, E1 (anio_fiscal=2025) no debia aparecer';
  END IF;

  v := public.partner_overview_engagements('2026-01-01'::date, '2026-12-31'::date, NULL);
  IF NOT pg_temp.has_eng(v->'items', pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: con p_fiscal_year NULL y solapamiento de fechas, E1 debia aparecer';
  END IF;
  RAISE NOTICE 'OK 8: p_fiscal_year=2026 excluye a E1 (anio_fiscal=2025); NULL + solapamiento lo incluye';
END $$;

-- ── 9. kpis.engagements.finalized_in_period = 1 (E4); total excluye E4 ──────────────────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'kpis'->'engagements'->>'finalized_in_period')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: finalized_in_period esperado 1 (E4), obtuvo %', v->'kpis'->'engagements'->>'finalized_in_period';
  END IF;
  IF (v->'kpis'->'engagements'->>'total')::int <> 6 THEN
    RAISE EXCEPTION 'FAIL: kpis.engagements.total esperado 6 (E1,E2,E5,E6,E8,E10 -- E4 excluido), obtuvo %',
      v->'kpis'->'engagements'->>'total';
  END IF;
  RAISE NOTICE 'OK 9: finalized_in_period=1 (E4), total=6 excluye E4';
END $$;

-- ── 9b. finalized_summary (fila resumen "Encargos finalizados", pedido del operador
-- 2026-09-19): E4 (override=7, end_date en el periodo) cuenta en finalized_summary.count;
-- sin OT, así que budget_hours/executed_hours/collected_bob quedan en 0 -- no crashea ────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'finalized_summary'->>'count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: finalized_summary.count esperado 1 (E4), obtuvo %', v->'finalized_summary'->>'count';
  END IF;
  IF (v->'finalized_summary'->>'budget_hours')::numeric <> 0
     OR (v->'finalized_summary'->>'executed_hours')::numeric <> 0
     OR (v->'finalized_summary'->>'collected_bob')::numeric <> 0 THEN
    RAISE EXCEPTION 'FAIL: E4 no tiene OT -- budget/executed/honorarios pagados debían ser 0, obtuvo %', v->'finalized_summary';
  END IF;
  RAISE NOTICE 'OK 9b: finalized_summary -- count=1 (E4); budget/executed/honorarios pagados=0 (sin OT, sin crash)';
END $$;

-- ── 10. kpis.fees.total_bob = fee_net(E1) * 6.96; E5 administrativo suma 0 ─────────────────
DO $$
DECLARE v jsonb; v_expected numeric;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));  -- partner Norte: E1,E5,E6 (E6 linea SQR a $0)
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  v_expected := (10*100 + 5*50) * 6.96;  -- 1250 * 6.96 = 8700
  IF abs((v->'kpis'->'fees'->>'total_bob')::numeric - v_expected) > 0.01 THEN
    RAISE EXCEPTION 'FAIL: kpis.fees.total_bob esperado % (solo E1; E5/E6 suman 0), obtuvo %',
      v_expected, v->'kpis'->'fees'->>'total_bob';
  END IF;
  RAISE NOTICE 'OK 10: kpis.fees.total_bob = % (solo E1 aporta, E5/E6 suman 0)', v_expected;
END $$;

-- ── 10b. previous_total_bob recalcula el alcance del ANIO ANTERIOR, no filtra el `scope`
-- actual por approved_at (review.md iteracion 1, MF-02). E11 (Norte, fechas 2025-01-01 a
-- 2025-06-30) nunca aparece en `scope`/`scope_all` de 2026 -- con el bug viejo,
-- previous_total_bob jamas lo hubiera contado (filtraba SOLO los encargos ya presentes en
-- el scope de 2026). Con el fix, scope_previous_year lo recalcula de forma independiente
-- para la ventana 2025 y SI lo cuenta. Delta esperado = fee_net de E11 = 5h*200 = 1000 BOB
-- (E1/E5/E6 tienen fechas NULL -> "siempre activos", entran igual en ambas ventanas, asi
-- que se cancelan en la resta).
DO $$
DECLARE v jsonb; v_delta numeric;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));  -- partner Norte: ve E1/E5/E6 en ambas ventanas + E11 solo en la anterior
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  v_delta := (v->'kpis'->'fees'->>'previous_total_bob')::numeric - (v->'kpis'->'fees'->>'total_bob')::numeric;
  IF abs(v_delta - 1000) > 0.01 THEN
    RAISE EXCEPTION 'FAIL: previous_total_bob - total_bob esperado 1000 (fee_net de E11, solo en el anio anterior), obtuvo % (previous=%, actual=%)',
      v_delta, v->'kpis'->'fees'->>'previous_total_bob', v->'kpis'->'fees'->>'total_bob';
  END IF;
  RAISE NOTICE 'OK 10b: previous_total_bob incluye a E11 (fee_net=1000, solo en cartera hace un anio) aunque E11 nunca este en el scope 2026 actual';
END $$;

-- ── 11. my_partner_hours.budget = Socio de E1; my_sqr_hours(director) = SQR de E6, count=1 ─
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'kpis'->'my_partner_hours'->>'budget')::numeric <> 10 THEN
    RAISE EXCEPTION 'FAIL: my_partner_hours.budget esperado 10 (Socio de E1), obtuvo %',
      v->'kpis'->'my_partner_hours'->>'budget';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(3));  -- director, sqr_id de E6
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'kpis'->'my_sqr_hours'->>'budget')::numeric <> 8 THEN
    RAISE EXCEPTION 'FAIL: my_sqr_hours.budget esperado 8 (SQR de E6), obtuvo %',
      v->'kpis'->'my_sqr_hours'->>'budget';
  END IF;
  IF (v->'kpis'->'my_sqr_hours'->>'engagement_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: my_sqr_hours.engagement_count esperado 1, obtuvo %',
      v->'kpis'->'my_sqr_hours'->>'engagement_count';
  END IF;
  RAISE NOTICE 'OK 11: my_partner_hours.budget=10 (Socio E1); my_sqr_hours(director).budget=8 (SQR E6), count=1';
END $$;

-- ── 11b. funcion=1 tambien excluye horas personales (KPI3): te13 (4h aprobadas de u2 sobre
-- E9, funcion=0) NO debe aparecer en my_partner_hours.approved, pese a que E9.partner_id=u2
-- (review.md iteracion 4, SF-01 -- hueco de cobertura senalado en reporte_ejecucion.md,
-- quinta correccion: "no hay un caso de fixture con horas cargadas contra un encargo
-- funcion≠1"). my_partner_engagements ya filtra funcion=1 por lectura del SQL; esta
-- asercion lo prueba con datos reales en vez de solo por inspeccion.
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'kpis'->'my_partner_hours'->>'approved')::numeric <> 0 THEN
    RAISE EXCEPTION 'FAIL: my_partner_hours.approved esperado 0 (las 4h de u2 sobre E9 son funcion=0, deben quedar excluidas), obtuvo %',
      v->'kpis'->'my_partner_hours'->>'approved';
  END IF;
  RAISE NOTICE 'OK 11b: my_partner_hours.approved=0 -- funcion=0 (E9) excluye tambien las horas personales de KPI3, pese a compartir partner_id con E1';
END $$;

-- ── 12. Horas: aprobadas/pendientes/rechazadas del fixture; period_id NULL=pendiente; forecast no cuenta ─
-- 2026-09-17 (MF-03, E10 agregado a la firma): senior_partner ve TODA la firma, asi que las
-- horas de E10 (Sur) se suman aca tambien: +5 aprobadas (te10a), +3 pendientes (te10b),
-- +6 rechazadas (te10c).
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'profitability'->'hours'->>'approved')::numeric <> 9 THEN
    RAISE EXCEPTION 'FAIL: hours.approved esperado 9 (te1 2h + te2 2h + E10.te10a 5h), obtuvo %', v->'profitability'->'hours'->>'approved';
  END IF;
  IF (v->'profitability'->'hours'->>'pending')::numeric <> 7 THEN
    RAISE EXCEPTION 'FAIL: hours.pending esperado 7 (te1b 1h + te3 3h + E10.te10b 3h), obtuvo %',
      v->'profitability'->'hours'->>'pending';
  END IF;
  IF (v->'profitability'->'hours'->>'rejected')::numeric <> 7.5 THEN
    RAISE EXCEPTION 'FAIL: hours.rejected esperado 7.5 (te6 1.5h + E10.te10c 6h), obtuvo %', v->'profitability'->'hours'->>'rejected';
  END IF;
  RAISE NOTICE 'OK 12: hours.approved=9, pending=7, rejected=7.5 (incluye E10, firm-wide para senior_partner); te4 (forecast) no cuenta';
END $$;

-- ── 13. Valorizacion: Senior con wo_budget_lines -> standard_rate; SQR sin linea -> fallback ─
-- E10 usa la misma categoria (Socio) que w1 -- su rate viene de wo_budget_lines (50/h),
-- sin caer al fallback de categories.
DO $$
DECLARE v jsonb; v_expected_approved numeric; v_expected_pending numeric;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  v_expected_approved := 2*100 + 2*50 + 5*50;   -- te1 (Socio@100) + te2 (Senior@50) + E10.te10a (Socio@50)
  v_expected_pending  := 1*100 + 3*145 + 3*50;  -- te1b (Socio@100) + te3 (SQR fallback@145) + E10.te10b (Socio@50)
  IF abs((v->'profitability'->'money_bob'->>'hours_valued_approved')::numeric - v_expected_approved) > 0.01 THEN
    RAISE EXCEPTION 'FAIL: hours_valued_approved esperado %, obtuvo %', v_expected_approved,
      v->'profitability'->'money_bob'->>'hours_valued_approved';
  END IF;
  IF abs((v->'profitability'->'money_bob'->>'hours_valued_pending')::numeric - v_expected_pending) > 0.01 THEN
    RAISE EXCEPTION 'FAIL: hours_valued_pending esperado % (incl. fallback SQR=145/h), obtuvo %', v_expected_pending,
      v->'profitability'->'money_bob'->>'hours_valued_pending';
  END IF;
  RAISE NOTICE 'OK 13: valorizacion usa wo_budget_lines.standard_rate cuando existe (Senior, E10) y categories.rate_high_usd cuando no (SQR)';
END $$;

-- ── 14. expenses_reviewed solo revisado_asistente; expenses_manager_approved solo aprobado_gerente ─
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  -- Los 3 gastos son BOB (un gasto ligado a una OT nunca puede ser USD -- ver la nota de
  -- arriba, junto al INSERT de fund_requests: fr_wo_validate_approved()/enforce_bob lo
  -- impiden por diseno), asi que no hay conversion de moneda que aplicar (montos literales).
  IF abs((v->'profitability'->'money_bob'->>'expenses_reviewed')::numeric - 500) > 0.01 THEN
    RAISE EXCEPTION 'FAIL: expenses_reviewed esperado % (BOB, sin conversion), obtuvo %', 500,
      v->'profitability'->'money_bob'->>'expenses_reviewed';
  END IF;
  IF abs((v->'profitability'->'money_bob'->>'expenses_manager_approved')::numeric - 300) > 0.01 THEN
    RAISE EXCEPTION 'FAIL: expenses_manager_approved esperado % (BOB, sin conversion), obtuvo %', 300,
      v->'profitability'->'money_bob'->>'expenses_manager_approved';
  END IF;
  RAISE NOTICE 'OK 14: expenses_reviewed=revisado_asistente, expenses_manager_approved=aprobado_gerente; pendiente_aprobacion (999) no aparece en ninguno';
END $$;

-- ── 15. economic_cycle: to_invoice (base c/IVA), invoiced usa invoice_rate, collected usa payment_rate, overdue_90 ─
DO $$
DECLARE v jsonb; v_base numeric;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));  -- partner Norte: solo E1 tiene installment_base valorizable en USD
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  v_base := (1250 + 200) / 0.87;  -- installment_base de E1
  IF abs((v->'economic_cycle'->>'to_invoice_bob')::numeric - v_base*6.96) > 0.05 THEN
    RAISE EXCEPTION 'FAIL: to_invoice_bob esperado ~% (base c/IVA * 6.96), obtuvo %', v_base*6.96,
      v->'economic_cycle'->>'to_invoice_bob';
  END IF;
  -- collected: cuota 1 (40%) a TC de PAGO (6.90), no al de factura (6.96)
  IF abs((v->'economic_cycle'->>'collected_bob')::numeric - (v_base*0.40*6.90)) > 0.05 THEN
    RAISE EXCEPTION 'FAIL: collected_bob debia usar payment_exchange_rate (6.90), obtuvo %',
      v->'economic_cycle'->>'collected_bob';
  END IF;
  -- overdue_90: solo la cuota 2 (30%), collection_invoice_date = hoy-100
  IF abs((v->'economic_cycle'->>'overdue_90_bob')::numeric - (v_base*0.30*6.96)) > 0.05 THEN
    RAISE EXCEPTION 'FAIL: overdue_90_bob esperado solo la cuota 2 (30%% a TC factura), obtuvo %',
      v->'economic_cycle'->>'overdue_90_bob';
  END IF;
  RAISE NOTICE 'OK 15: to_invoice_bob=base c/IVA*6.96, collected_bob usa TC de pago, overdue_90_bob solo la cuota vencida';
END $$;

-- ── 16. next_7_days incluye agreed_payment_date=hoy+3 y NO la vencida (hoy-2, que va en overdue); in_arrears ─
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));  -- senior_partner: ve E1 y E2
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v->'collections'->'next_7_days') it
     WHERE (it->>'installment_id')::uuid = 'f0da5c10-0000-4000-8000-000000000004'::uuid
  ) THEN
    RAISE EXCEPTION 'FAIL: next_7_days debia incluir la cuota de E2 con agreed_payment_date=hoy+3';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v->'collections'->'next_7_days') it
     WHERE (it->>'installment_id')::uuid = 'f0da5c10-0000-4000-8000-000000000002'::uuid
  ) THEN
    RAISE EXCEPTION 'FAIL: next_7_days NO debia incluir la cuota vencida (E1, agreed_payment_date=hoy-2)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v->'collections'->'overdue'->'items') it
     WHERE (it->>'installment_id')::uuid = 'f0da5c10-0000-4000-8000-000000000002'::uuid
  ) THEN
    RAISE EXCEPTION 'FAIL: la cuota vencida (E1, agreed_payment_date=hoy-2) debia estar en collections.overdue.items';
  END IF;
  IF (v->'collections'->'by_status'->'in_arrears'->>'count')::int < 1 THEN
    RAISE EXCEPTION 'FAIL: collections.by_status.in_arrears debia contar la cuota Pending con agreed_invoice_date=hoy-1';
  END IF;
  RAISE NOTICE 'OK 16: next_7_days estricto (7 dias), chip de vencidas separado, in_arrears cuenta la Pending vencida';
END $$;

-- ── 17. over_budget_count cuenta E1 por vida completa aunque el periodo no se exceda ────────
-- MF-03 (review.md iteracion 1): "vida completa" excluye rechazadas desde el fix -- E1 suma
-- 28h (2+1+2+3+20, aprobadas+pendientes) sin contar las 1.5h rechazadas de te6; sigue > 15h
-- presupuestadas, asi que esta asercion no cambia de resultado, solo de numero exacto.
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));  -- partner Norte
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'kpis'->'alerts'->>'over_budget_count')::int < 1 THEN
    RAISE EXCEPTION 'FAIL: over_budget_count debia contar E1 (vida completa 28h aprob+pend > presupuesto 15h)';
  END IF;
  v := public.partner_overview_engagements('2026-01-01'::date, '2026-12-31'::date);
  IF NOT pg_temp.has_eng(v->'items', pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: E1 debia aparecer en partner_overview_engagements';
  END IF;
  RAISE NOTICE 'OK 17: over_budget_count cuenta E1 por horas de vida completa aprobadas+pendientes (2+1+2+3+20=28h > 15h presupuestadas, rechazadas 1.5h NO cuentan), aunque el periodo solo tenga 8h';
END $$;

-- ── 17b. MF-03: horas rechazadas NO cuentan para sobregiro/orden (review.md iteracion 1) ────
-- E10 (Sur): 5h aprobadas + 3h pendientes = 8h, DENTRO del presupuesto de 10h. +6h
-- rechazadas -- con el bug viejo (lifetime_total sumaba TODOS los buckets), 5+3+6=14h >
-- 10h hubiera marcado a E10 como sobregirado. Con el fix, solo cuentan aprobadas+pendientes
-- (8h < 10h) -> over_budget debe ser false y E10 NO debe aparecer con p_over_budget_only=true.
DO $$
DECLARE v jsonb; v_item jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));  -- senior_partner: ve E10 (Sur)
  v := public.partner_overview_engagements('2026-01-01'::date, '2026-12-31'::date);
  SELECT it INTO v_item FROM jsonb_array_elements(v->'items') it
   WHERE (it->>'engagement_id')::uuid = pg_temp.e(10);
  IF v_item IS NULL THEN
    RAISE EXCEPTION 'FAIL: E10 debia aparecer en partner_overview_engagements (senior_partner ve toda la firma)';
  END IF;
  IF (v_item->>'approved_hours')::numeric <> 5 OR (v_item->>'pending_hours')::numeric <> 3
     OR (v_item->>'rejected_hours')::numeric <> 6 THEN
    RAISE EXCEPTION 'FAIL: E10 horas esperadas 5 aprob / 3 pend / 6 rechazadas, obtuvo % / % / %',
      v_item->>'approved_hours', v_item->>'pending_hours', v_item->>'rejected_hours';
  END IF;
  IF (v_item->>'over_budget')::boolean THEN
    RAISE EXCEPTION 'FAIL: E10 NO deberia estar sobregirado (8h aprob+pend < 10h presupuestadas; el bug viejo sumaba tambien las 6h rechazadas = 14h > 10h)';
  END IF;

  v := public.partner_overview_engagements(
    '2026-01-01'::date, '2026-12-31'::date, NULL, NULL, NULL, NULL, NULL, 'end_date', true, 50, 0);
  IF pg_temp.has_eng(v->'items', pg_temp.e(10)) THEN
    RAISE EXCEPTION 'FAIL: con p_over_budget_only=true, E10 NO deberia aparecer (no esta realmente sobregirado)';
  END IF;
  RAISE NOTICE 'OK 17b: E10 (5h aprob + 3h pend = 8h < 10h presupuesto) no queda sobregirado pese a 6h rechazadas adicionales';
END $$;

-- ── 18. pending_wo_count = 1 (E3) para partner Norte; 0 para director ───────────────────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'kpis'->'alerts'->>'pending_wo_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: partner Norte pending_wo_count esperado 1 (E3), obtuvo %', v->'kpis'->'alerts'->>'pending_wo_count';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF (v->'kpis'->'alerts'->>'pending_wo_count')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: director pending_wo_count esperado 0 (no es partner/sqr de E3), obtuvo %',
      v->'kpis'->'alerts'->>'pending_wo_count';
  END IF;
  RAISE NOTICE 'OK 18: pending_wo_count=1 (E3) para partner Norte (alcance por sociedad); 0 para director (alcance por asignacion)';
END $$;

-- ── 19. Sin PII: email/id_number/aud_reg_number/auth_user_id nunca aparecen; role_key solo en meta ─
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.partner_overview('2026-01-01'::date, '2026-12-31'::date);
  IF v::text ILIKE '%"email"%' OR v::text ILIKE '%"id_number"%'
     OR v::text ILIKE '%"aud_reg_number"%' OR v::text ILIKE '%"auth_user_id"%' THEN
    RAISE EXCEPTION 'FAIL: el payload expone una clave PII cruda: %', v;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'managers') m WHERE m ? 'role_key')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v->'filters'->'managers') m WHERE m ? 'role_key')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v->'kpis'->'my_sqr_hours'->'engagements') m WHERE m ? 'role_key') THEN
    RAISE EXCEPTION 'FAIL: un objeto de staff anidado expone role_key (solo meta.role_key -- el propio rol del llamante -- es aceptable)';
  END IF;
  RAISE NOTICE 'OK 19: sin email/id_number/aud_reg_number/auth_user_id en ningun nivel; role_key solo en meta (propio del llamante)';
END $$;

-- ── 20. partner_overview_engagements: paginado + p_over_budget_only ─────────────────────────
-- 2026-09-17: reescrita -- el viejo default (ORDER BY over_budget DESC, consumption_ratio
-- DESC) ya no existe. El orden por defecto ahora es p_sort_key='end_date' (sin "sobregirados
-- primero" implicito); filtrar por sobregirados es un flag explicito, p_over_budget_only.
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));  -- partner Norte: E1, E5, E6 (E9 excluido por funcion)
  v := public.partner_overview_engagements(
    '2026-01-01'::date, '2026-12-31'::date, NULL, NULL, NULL, NULL, NULL, 'end_date', false, 1, 0);
  IF (v->>'total')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL: partner_overview_engagements total esperado 3, obtuvo %', v->>'total';
  END IF;
  IF jsonb_array_length(v->'items') <> 1 THEN
    RAISE EXCEPTION 'FAIL: con p_limit=1 se esperaba 1 item, obtuvo %', jsonb_array_length(v->'items');
  END IF;

  v := public.partner_overview_engagements(
    '2026-01-01'::date, '2026-12-31'::date, NULL, NULL, NULL, NULL, NULL, 'end_date', false, 1, 1);
  IF jsonb_array_length(v->'items') <> 1 THEN
    RAISE EXCEPTION 'FAIL: con p_offset=1 (total=3) se esperaba 1 item, obtuvo %', jsonb_array_length(v->'items');
  END IF;

  -- De los 3 encargos de partner Norte, solo E1 esta sobregirado (28h de vida completa
  -- aprobadas+pendientes > 15h presupuestadas, ver asercion 17); E5 no tiene OT/horas, E6
  -- no tiene horas cargadas.
  v := public.partner_overview_engagements(
    '2026-01-01'::date, '2026-12-31'::date, NULL, NULL, NULL, NULL, NULL, 'end_date', true, 50, 0);
  IF (v->>'total')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: con p_over_budget_only=true total esperado 1 (solo E1), obtuvo %', v->>'total';
  END IF;
  IF (v->'items'->0->>'engagement_id')::uuid <> pg_temp.e(1) THEN
    RAISE EXCEPTION 'FAIL: con p_over_budget_only=true el unico item deberia ser E1, obtuvo %', v->'items'->0->>'engagement_id';
  END IF;
  RAISE NOTICE 'OK 20: partner_overview_engagements pagina bien (total=3, limit/offset), p_over_budget_only=true filtra a solo E1';
END $$;

-- ── 20b. funcion=1 (Cliente): E9 (funcion=0, partner_id=u2, mismo socio que E1/E5/E6) queda
-- excluido de TODO el tablero, aunque cumpla estado 4 por definicion (sin OT) y coincida con
-- el partner_id de un caller real. La asercion 4 (scope_count=3 para partner Norte) ya lo
-- prueba indirectamente -- si funcion no filtrara, E9 sumaria un 4to encargo -- pero se deja
-- explicito aca para que quede documentado que es funcion, no otra cosa, lo que lo excluye.
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));  -- partner Norte, partner_id de E9 tambien
  v := public.partner_overview_engagements('2026-01-01'::date, '2026-12-31'::date);
  IF pg_temp.has_eng(v->'items', pg_temp.e(9)) THEN
    RAISE EXCEPTION 'FAIL: E9 (funcion=0, Administrativo) NO deberia aparecer en partner_overview_engagements';
  END IF;
  RAISE NOTICE 'OK 20b: E9 (funcion=0, Administrativo) queda excluido del tablero pese a compartir partner_id con E1/E5/E6';
END $$;

RESET ROLE;

-- ── 21. Prerrequisito de TC: NOT NULL/CHECK/DEFAULT + fallback de latest_exchange_rate() ───
-- Nota: SET LOCAL ROLE / RESET ROLE son comandos de sesion -- no pueden invocarse dentro de
-- un bloque DO (plpgsql); por eso este chequeo intercala sentencias de nivel superior con
-- bloques DO cortos que solo hacen el trabajo que necesita PL/pgSQL (capturar excepciones).
DO $$
DECLARE v_is_nullable text; v_default text; v_has_check boolean;
BEGIN
  SELECT is_nullable, column_default INTO v_is_nullable, v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'wo_payment_plan' AND column_name = 'exchange_rate';
  IF v_is_nullable <> 'NO' THEN
    RAISE EXCEPTION 'FAIL: wo_payment_plan.exchange_rate deberia ser NOT NULL';
  END IF;
  IF v_default IS NULL OR v_default NOT LIKE '%latest_exchange_rate%' THEN
    RAISE EXCEPTION 'FAIL: wo_payment_plan.exchange_rate deberia tener DEFAULT latest_exchange_rate(), tiene %', v_default;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wo_payment_plan_exchange_rate_positive'
  ) INTO v_has_check;
  IF NOT v_has_check THEN
    RAISE EXCEPTION 'FAIL: falta el CHECK wo_payment_plan_exchange_rate_positive';
  END IF;
  RAISE NOTICE 'OK 21a: exchange_rate es NOT NULL, con DEFAULT latest_exchange_rate() y CHECK > 0';
END $$;

-- INSERT omitiendo exchange_rate (como el gerente del encargo, OT en Draft) -> toma el DEFAULT.
SET LOCAL ROLE authenticated;
SELECT pg_temp.impersonate(pg_temp.u(5));  -- manager, dueño de E7

INSERT INTO public.wo_payment_plan (plan_id, wo_id, exchange_rate_mode, payment_days)
VALUES ('e0da5c10-0000-4000-8000-000000000007', 'd0da5c10-0000-4000-8000-000000000007', 'fijo', 30);

DO $$
DECLARE v_rate numeric;
BEGIN
  SELECT exchange_rate INTO v_rate FROM public.wo_payment_plan
   WHERE plan_id = 'e0da5c10-0000-4000-8000-000000000007';
  IF v_rate IS NULL OR abs(v_rate - 10.99) > 0.001 THEN
    RAISE EXCEPTION 'FAIL: el DEFAULT deberia resolver a latest_exchange_rate() = 10.99 (sin historial BCB), obtuvo %', v_rate;
  END IF;
  RAISE NOTICE 'OK 21b: INSERT omitiendo exchange_rate toma el DEFAULT latest_exchange_rate() = 10.99';
END $$;

-- Libera el wo_id (UNIQUE) para poder reintentar el INSERT con valores explicitos invalidos.
-- El guard de UPDATE (no de INSERT) es el que bloquea NULL/0 vistos como "borrar un TC ya
-- establecido"; probar NULL/0 en un INSERT nuevo (como pide la asercion original) requiere
-- una fila fresca cada vez, no una fila ya existente.
DELETE FROM public.wo_payment_plan WHERE plan_id = 'e0da5c10-0000-4000-8000-000000000007';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.wo_payment_plan (plan_id, wo_id, exchange_rate, exchange_rate_mode, payment_days)
    VALUES ('e0da5c10-0000-4000-8000-000000000007', 'd0da5c10-0000-4000-8000-000000000007', NULL, 'fijo', 30);
    RAISE EXCEPTION 'FAIL: INSERT con exchange_rate = NULL explicito deberia fallar (NOT NULL)';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'OK 21c: INSERT con exchange_rate = NULL explicito falla con 23502 (NOT NULL)';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.wo_payment_plan (plan_id, wo_id, exchange_rate, exchange_rate_mode, payment_days)
    VALUES ('e0da5c10-0000-4000-8000-000000000007', 'd0da5c10-0000-4000-8000-000000000007', 0, 'fijo', 30);
    RAISE EXCEPTION 'FAIL: INSERT con exchange_rate = 0 deberia fallar (CHECK > 0)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 21d: INSERT con exchange_rate = 0 falla con el CHECK (> 0)';
  END;
END $$;

RESET ROLE;

-- Sin historial BCB y sin default_exchange_rate -> latest_exchange_rate() devuelve NULL.
DELETE FROM public.global_settings WHERE setting_key = 'default_exchange_rate';

DO $$
BEGIN
  IF public.latest_exchange_rate() IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: sin exchange_rate_history ni default_exchange_rate, latest_exchange_rate() deberia ser NULL';
  END IF;
  RAISE NOTICE 'OK 21e: sin ninguna fuente, latest_exchange_rate() = NULL';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'OK 21: NOT NULL + CHECK + DEFAULT en wo_payment_plan.exchange_rate; INSERT sin la columna toma latest_exchange_rate()=10.99; NULL/0 explicitos fallan; sin fuentes devuelve NULL';
END $$;

-- ── 22. effective_engagement_state(): tabla de casos de engagementStatus.ts ─────────────────
DO $$
BEGIN
  -- p_override es smallint; un literal entero sin cast se tipa como integer y Postgres no
  -- lo resuelve por implicit cast en la busqueda de funcion (detectado corriendo test:rls
  -- de verdad: "function ... does not exist"). Las demas llamadas de abajo pasan NULL, que
  -- no tiene este problema (matchea cualquier tipo).
  IF public.effective_engagement_state(6::smallint, true, 'd0da5c10-0000-4000-8000-000000000001'::uuid, 'Approved', 'Approved', now()) <> 6 THEN
    RAISE EXCEPTION 'FAIL: override 6 (Cancelado) debe ganar sobre una OT Approved';
  END IF;
  IF public.effective_engagement_state(NULL, false, NULL, NULL, NULL, NULL) <> 4 THEN
    RAISE EXCEPTION 'FAIL: administrativo (work_order_required=false) sin OT debe ser 4';
  END IF;
  IF public.effective_engagement_state(NULL, true, NULL, NULL, NULL, NULL) <> 1 THEN
    RAISE EXCEPTION 'FAIL: work_order_required=true sin OT debe ser 1 (Pendiente)';
  END IF;
  IF public.effective_engagement_state(NULL, true, 'd0da5c10-0000-4000-8000-000000000001'::uuid, 'Rejected', 'Pending', NULL) <> 8 THEN
    RAISE EXCEPTION 'FAIL: approval_status Rejected debe ser 8';
  END IF;
  IF public.effective_engagement_state(NULL, true, 'd0da5c10-0000-4000-8000-000000000001'::uuid, 'Approved', 'Emergency_Approved', now()) <> 5 THEN
    RAISE EXCEPTION 'FAIL: Approved + Emergency_Approved debe ser 5';
  END IF;
  IF public.effective_engagement_state(NULL, true, 'd0da5c10-0000-4000-8000-000000000001'::uuid, 'Approved', 'Approved', now()) <> 4 THEN
    RAISE EXCEPTION 'FAIL: Approved + Approved (sin emergencia) debe ser 4';
  END IF;
  IF public.effective_engagement_state(NULL, true, 'd0da5c10-0000-4000-8000-000000000001'::uuid, 'Pending_Approval', NULL, now()) <> 2 THEN
    RAISE EXCEPTION 'FAIL: approved_at presente sin approval_status Approved debe ser 2 (Aprobado Socio)';
  END IF;
  IF public.effective_engagement_state(NULL, true, 'd0da5c10-0000-4000-8000-000000000001'::uuid, 'Pending_Approval', 'Approved', NULL) <> 3 THEN
    RAISE EXCEPTION 'FAIL: risk_status Approved sin approved_at debe ser 3 (Aprobado Riesgos)';
  END IF;
  IF public.effective_engagement_state(NULL, true, 'd0da5c10-0000-4000-8000-000000000001'::uuid, 'Pending_Approval', 'Pending', NULL) <> 1 THEN
    RAISE EXCEPTION 'FAIL: sin ninguna aprobacion debe ser 1 (Pendiente)';
  END IF;
  RAISE NOTICE 'OK 22: effective_engagement_state() replica los 8 casos de engagementStatus.ts (override, administrativo, sin OT, rechazado, emergencia, aprobado, solo socio, solo riesgos, pendiente)';
END $$;

-- ── 23. verify-seed.sql (85/755/21) ──────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'INFO 23: verify-seed.sql (85 permisos / 757 concesiones / 21 global_settings) corre en un job de CI aparte (replay completo de seed) -- fuera del alcance de esta suite transaccional local. Verificado por lectura: supabase/tests/local/verify-seed.sql actualizado en el mismo commit.';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'PARTNER OVERVIEW RPC: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
