-- Transactional tests for public.portfolio_overview() -- FEAT dash_cartera
-- (bugs/dashboard/cartera/plan_v2.md §9.3 / decisiones.md).
--
-- DONDE CORRE: via supabase/tests/local/run-rls-tests.sh, contra la base scratch local con
-- el set consolidado + las migraciones incrementales + 20260915130000_dash_socio_partner_
-- overview.sql + 20260917160000_dash_cartera_portfolio_overview.sql aplicados. Misma
-- convención que rpc-dash-socio-partner-overview.sql: una sola transacción que SIEMPRE
-- termina en ROLLBACK, un NOTICE por chequeo que pasa, marcador final
-- 'CARTERA OVERVIEW RPC: ALL CHECKS PASSED'.
--
-- Fixture: todos los ids llevan el prefijo ca27e0 reconocible. Reutiliza la sociedad/
-- práctica sembradas UNA VEZ por run-rls-tests.sh fuera de esta transacción
-- ('Harness Test Society' / 'Harness Test Practice', code=1) -- no las vuelve a crear.
--
-- Fechas relativas a "hoy" ((now() AT TIME ZONE 'America/La_Paz')::date, vía pg_temp.today()):
-- el fixture asume que "hoy" cae dentro del ejercicio fiscal 2026 (2025-10-01..2026-09-30),
-- igual que el resto del tablero -- si se re-ejecuta esta suite fuera de esa ventana, las
-- aserciones de KPI 1-4 (ancladas a p_fiscal_year=2026) dejarían de reflejar el fixture.
--
-- Los triggers de freeze de TC (0722-156b) y de protección de líneas aprobadas (protect_
-- approved_time_entries) se respetan cargando primero los datos (entries/cuotas) y recién
-- después las aprobaciones/estados que los "congelan" -- mismo orden que exige
-- rpc-dash-socio-partner-overview.sql.

BEGIN;

CREATE FUNCTION pg_temp.today() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/La_Paz')::date
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

-- ── Clientes ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('60ca27e0-0000-4000-8000-000000000001', 'Cliente C1 ca27e0', 'NIT-CA27E0-1'),
  ('60ca27e0-0000-4000-8000-000000000002', 'Cliente C2 ca27e0', 'NIT-CA27E0-2'),
  ('60ca27e0-0000-4000-8000-000000000003', 'Cliente C3 ca27e0', 'NIT-CA27E0-3')
ON CONFLICT (client_id) DO NOTHING;

-- El snapshot de authorization_roles que siembra el harness (40-fixture-rbac-catalog.sql,
-- 23 roles históricos) no incluye specialist_it/specialist_tax -- sí existen en el catálogo
-- real de producción (cero_11:88, citado por decisiones.md D-1). categories.default_role_key
-- tiene FK a authorization_roles.role_key, así que se agregan acá para poder ejercitar D-1
-- (aserción 11b) sin depender de otra migración.
INSERT INTO public.authorization_roles (role_key, label_key, display_order, is_system, legacy_app_role) VALUES
  ('specialist_it', 'authz.role.specialist_it', 90, false, 'specialist_it'),
  ('specialist_tax', 'authz.role.specialist_tax', 91, false, 'specialist_tax')
ON CONFLICT (role_key) DO NOTHING;

-- ── Categorías (D-1: Gerente / Gerente-LEG suman al KPI 3; los 2 especialistas no) ────────
INSERT INTO public.categories (category_id, category_name, practica_id, display_order,
                                rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd, default_role_key) VALUES
  ('c0ca27e0-0000-4000-8000-000000000001', 'Socio',                          (SELECT practica_id FROM public.practicas WHERE code = 1), 1, 1530, 1400, 153, 140, NULL),
  ('c0ca27e0-0000-4000-8000-000000000002', 'Gerente',                        (SELECT practica_id FROM public.practicas WHERE code = 1), 2, 900,  800,  90,  80,  'manager'),
  ('c0ca27e0-0000-4000-8000-000000000003', 'Senior',                         (SELECT practica_id FROM public.practicas WHERE code = 1), 3, 350,  280,  35,  28,  NULL),
  ('c0ca27e0-0000-4000-8000-000000000004', 'Gerente/Asociado Senior',        (SELECT practica_id FROM public.practicas WHERE code = 1), 4, 850,  750,  85,  75,  'manager'),
  ('c0ca27e0-0000-4000-8000-000000000005', 'Gerente - Especialista IT',      (SELECT practica_id FROM public.practicas WHERE code = 1), 5, 800,  700,  80,  70,  'specialist_it'),
  ('c0ca27e0-0000-4000-8000-000000000006', 'Gerente - Especialista Tax',     (SELECT practica_id FROM public.practicas WHERE code = 1), 6, 800,  700,  80,  70,  'specialist_tax'),
  ('c0ca27e0-0000-4000-8000-000000000007', 'Sin Categoria Presupuestada',    (SELECT practica_id FROM public.practicas WHERE code = 1), 7, 300,  250,  30,  25,  NULL)
ON CONFLICT (category_id) DO NOTHING;

-- ── Segunda práctica + su propio 'Socio' (BUG 2026-09-20, aserción 29) ───────────────────
-- El catálogo real siembra una fila 'Socio' por práctica (cero_11: 7 en total), y
-- UNIQUE (practica_id, category_name) impide que haya dos dentro de la misma. Para
-- reproducir el duplicado que vio el operador hace falta justamente eso: DOS categorías
-- homónimas de prácticas distintas, una con el presupuesto (la del encargo) y otra con las
-- horas (la de la ficha de quien las cargó). Todo se referencia por lookup (code=2 /
-- category_name) y no por el literal, para que la suite siga andando si el ambiente ya
-- trae el catálogo completo sembrado y el ON CONFLICT no inserta nada.
INSERT INTO public.practicas (practica_id, name, code, abbreviation, allows_rates_activities, is_active) VALUES
  ('5e000000-0000-4000-8000-000000000002', 'Harness Test Practice 2 ca27e0', 2, 'COM', true, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.categories (category_id, category_name, practica_id, display_order,
                                rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd, default_role_key)
SELECT 'c0ca27e0-0000-4000-8000-000000000008', 'Socio', p.practica_id, 1, 280, 280, 28, 28, NULL
  FROM public.practicas p WHERE p.code = 2
ON CONFLICT (practica_id, category_name) DO NOTHING;

-- ── Actividades + tipo de gasto + servicio (taxonomy) ─────────────────────────────────────
INSERT INTO public.activity_codes (activity_id, activity_code, description, practica_id) VALUES
  ('acca27e0-0000-4000-8000-000000000001', 'CA1', 'Actividad Uno ca27e0', (SELECT practica_id FROM public.practicas WHERE code = 1)),
  ('acca27e0-0000-4000-8000-000000000002', 'CA2', 'Actividad Dos ca27e0', (SELECT practica_id FROM public.practicas WHERE code = 1)),
  -- CA3 existe solo para colgarle la hora cruzada de u10 (aserción 29) sin tocar los
  -- números exactos de CA1/CA2 que verifica la aserción 14 (Cascada).
  ('acca27e0-0000-4000-8000-000000000003', 'CA3', 'Actividad Tres ca27e0', (SELECT practica_id FROM public.practicas WHERE code = 1))
ON CONFLICT (activity_id) DO NOTHING;

INSERT INTO public.expense_types (expense_type_id, expense_name) VALUES
  ('9eca27e0-0000-4000-8000-000000000001', 'Viaticos ca27e0')
ON CONFLICT (expense_type_id) DO NOTHING;

INSERT INTO public.servicios (taxonomy_id, code, name, practica_id) VALUES
  ('9aca27e0-0000-4000-8000-000000000001', 'SV1', 'Servicio Uno ca27e0', (SELECT practica_id FROM public.practicas WHERE code = 1))
ON CONFLICT (taxonomy_id) DO NOTHING;

-- ── Personal: 7 con rol (u1-u7) + 1 worker puro (u8, sin user_roles) ──────────────────────
-- u1 admin (firm) · u2 senior_partner (firm) · u3 partner (socio de E1/E2/E5/E6/E9, categoría
-- Socio) · u4 manager (gerente de E1/E3, categoría Gerente) · u5 ita_manager (gerente de E4,
-- funcion=0 -> scope_count=0) · u6 senior SIN el permiso nuevo (categoría "Sin Categoria
-- Presupuestada", worker que carga horas igual) · u7 risk_partner (socio de E7, categoría
-- Socio -- confirma que NO recibe alcance departamental) · u8 worker puro, categoría Senior.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a0ca27e0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'dash-cartera-test-' || n || '@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 9) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, short_name, is_active,
                          practica_id, society_id, category_id)
SELECT ('50ca27e0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a0ca27e0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'CA27E0', 'Sujeto' || lpad(n::text, 2, '0'), 'CA27E0-' || lpad(n::text, 2, '0'),
       true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
       CASE n
         WHEN 3 THEN 'c0ca27e0-0000-4000-8000-000000000001'::uuid  -- u3 partner: Socio
         WHEN 4 THEN 'c0ca27e0-0000-4000-8000-000000000002'::uuid  -- u4 manager: Gerente
         WHEN 5 THEN 'c0ca27e0-0000-4000-8000-000000000002'::uuid  -- u5 ita_manager: Gerente
         WHEN 6 THEN 'c0ca27e0-0000-4000-8000-000000000007'::uuid  -- u6 senior: Sin Categoria
         WHEN 7 THEN 'c0ca27e0-0000-4000-8000-000000000001'::uuid  -- u7 risk_partner: Socio
         WHEN 8 THEN 'c0ca27e0-0000-4000-8000-000000000003'::uuid  -- u8 worker: Senior
         ELSE NULL
       END
  FROM generate_series(1, 9) n;
-- u10: socio de la SEGUNDA práctica (code=2), staff puro sin auth.users -- nadie lo
-- impersona. Carga horas en E1, que es de la práctica 1: es el caso real que reportó el
-- operador (un socio de Compliance trabajando un encargo de Auditoría). Su category_id es
-- el 'Socio' de SU práctica, distinto del 'Socio' que presupuesta E1.
INSERT INTO public.staff (staff_id, first_name, last_name, short_name, is_active,
                          practica_id, society_id, category_id)
SELECT '50ca27e0-0000-4000-8000-000000000010', 'CA27E0', 'Sujeto10', 'CA27E0-10', true,
       p.practica_id,
       (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
       (SELECT c.category_id FROM public.categories c
         WHERE c.practica_id = p.practica_id AND c.category_name = 'Socio')
  FROM public.practicas p WHERE p.code = 2;

-- u9: staff puro (sin auth.users/user_roles) usado SOLO como manager_id "de utilería" de E8
-- (Gastos sobregirado) -- fund_request_work_orders exige que el encargo de la OT tenga
-- gerente asignado; ningún llamante impersona a u9, así que no altera ningún alcance probado.

INSERT INTO public.user_roles (user_id, role_key) VALUES
  ('a0ca27e0-0000-4000-8000-000000000001', 'admin'),
  ('a0ca27e0-0000-4000-8000-000000000002', 'senior_partner'),
  ('a0ca27e0-0000-4000-8000-000000000003', 'partner'),
  ('a0ca27e0-0000-4000-8000-000000000004', 'manager'),
  ('a0ca27e0-0000-4000-8000-000000000005', 'ita_manager'),
  ('a0ca27e0-0000-4000-8000-000000000006', 'senior'),
  ('a0ca27e0-0000-4000-8000-000000000007', 'risk_partner')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

-- ── Encargos ───────────────────────────────────────────────────────────────────────────────
-- E1 Norte: OT Approved BOB, partner=u3, manager=u4, anio_fiscal=2026, funcion=1, cierra en
--           "el mes que viene" (hito closing). E2: OT Approved BOB, partner=u3,
--           anio_fiscal=2025 (KPI2 previous_*), fecha_cierre hace 3 meses (NO debe aparecer en
--           Hitos). E3: OT Pending_Approval, manager=u4, risk_status='Approved' (para no
--           duplicar pending_risk con E6). E4: funcion=0 (Administrativo), manager=u5, sin OT
--           -> excluido de TODO el tablero pese a estado derivado 4. E5: override=7
--           (Finalizado), partner=u3 -> excluido de scope pese a compartir partner_id con E1.
--           E6: override=4 (fuerza estado 4 pese a OT real Pending_Approval/riesgo Pending) --
--           partner=u3, mismo patrón que R11 del plan (encargo 4/5 sin OT aprobada). E7: OT
--           Approved BOB, partner=u7 (risk_partner) -- ajeno a u3/u4, visible solo para
--           firm-wide y para u7 mismo. E9: OT Draft + risk_status='Pending', partner=u3 --
--           el "borrador" que NO debe cargar a KPI5.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                status, fecha_cierre, society_id, partner_id, manager_id,
                                work_order_required, anio_fiscal, engagement_state_override,
                                funcion, taxonomy_id, practica) VALUES
  ('70ca27e0-0000-4000-8000-000000000001', '60ca27e0-0000-4000-8000-000000000001',
   'CA27E0 E1', 'CA27E0-E1', 'active', pg_temp.today() + 15,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50ca27e0-0000-4000-8000-000000000003', '50ca27e0-0000-4000-8000-000000000004',
   -- practica=1 (código de la práctica sembrada por el harness): E1 es el único encargo con
   -- matriz de trabajo (activity_worksheets), y enforce_worksheet_cell_practice_scope()
   -- (0825-183) exige engagements.practica resuelto para aceptar cualquier celda.
   true, 2026, NULL, 1, '9aca27e0-0000-4000-8000-000000000001', 1),
  ('70ca27e0-0000-4000-8000-000000000002', '60ca27e0-0000-4000-8000-000000000002',
   'CA27E0 E2', 'CA27E0-E2', 'active', pg_temp.today() - 90,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50ca27e0-0000-4000-8000-000000000003', NULL,
   true, 2025, NULL, 1, '9aca27e0-0000-4000-8000-000000000001', NULL),
  ('70ca27e0-0000-4000-8000-000000000003', '60ca27e0-0000-4000-8000-000000000003',
   'CA27E0 E3', 'CA27E0-E3', 'active', pg_temp.today() + 300,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   NULL, '50ca27e0-0000-4000-8000-000000000004',
   true, 2026, NULL, 1, NULL, NULL),
  ('70ca27e0-0000-4000-8000-000000000004', '60ca27e0-0000-4000-8000-000000000003',
   'CA27E0 E4 no-cliente', 'CA27E0-E4', 'active', pg_temp.today() + 300,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   NULL, '50ca27e0-0000-4000-8000-000000000005',
   false, NULL, NULL, 0, NULL, NULL),
  ('70ca27e0-0000-4000-8000-000000000005', '60ca27e0-0000-4000-8000-000000000003',
   'CA27E0 E5 finalizado', 'CA27E0-E5', 'active', pg_temp.today() + 300,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50ca27e0-0000-4000-8000-000000000003', NULL,
   true, NULL, 7, 1, NULL, NULL),
  ('70ca27e0-0000-4000-8000-000000000006', '60ca27e0-0000-4000-8000-000000000003',
   'CA27E0 E6 override', 'CA27E0-E6', 'active', pg_temp.today() + 300,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50ca27e0-0000-4000-8000-000000000003', NULL,
   true, 2026, 4, 1, NULL, NULL),
  ('70ca27e0-0000-4000-8000-000000000007', '60ca27e0-0000-4000-8000-000000000003',
   'CA27E0 E7 ajeno', 'CA27E0-E7', 'active', pg_temp.today() + 300,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50ca27e0-0000-4000-8000-000000000007', NULL,
   true, 2026, NULL, 1, NULL, NULL),
  ('70ca27e0-0000-4000-8000-000000000009', '60ca27e0-0000-4000-8000-000000000003',
   'CA27E0 E9 borrador', 'CA27E0-E9', 'active', pg_temp.today() + 300,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50ca27e0-0000-4000-8000-000000000003', NULL,
   true, 2026, NULL, 1, NULL, NULL),
  -- E8: solo para el Top 3 de Gastos sobregirado -- partner=u6 (senior, sin el permiso del
  -- RPC y sin protagonismo en ningún otro alcance probado) para no alterar los conteos ya
  -- fijados de u3/u4/u5/u7; SÍ suma al unfiltered_scope_count firm-wide de admin/
  -- senior_partner (aserción 3, ajustado a 5).
  ('70ca27e0-0000-4000-8000-000000000008', '60ca27e0-0000-4000-8000-000000000003',
   'CA27E0 E8 gastos', 'CA27E0-E8', 'active', pg_temp.today() + 300,
   (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
   '50ca27e0-0000-4000-8000-000000000006', '50ca27e0-0000-4000-8000-000000000009',
   true, 2026, NULL, 1, NULL, NULL)
ON CONFLICT (engagement_id) DO NOTHING;

-- E5 finalizado: end_date dentro de la ventana de las aserciones de "hoy" (finalized_summary,
-- aserción 27) -- sin OT (a propósito, ver comentario de arriba), así que budget/executed/
-- gastos deben quedar en 0 pese a contar en finalized_summary.count. UUID literal (no
-- pg_temp.e()) porque ese helper todavía no está definido en este punto del archivo.
UPDATE public.engagements SET end_date = pg_temp.today()
WHERE engagement_id = '70ca27e0-0000-4000-8000-000000000005'::uuid;

-- ── Aserción 26: la tabla de bitácora arranca vacía (sin backfill) ───────────────────────
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.portfolio_events;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: portfolio_events debería estar vacía antes de cualquier UPDATE de partner_id/manager_id, tiene % filas', v_count;
  END IF;
  RAISE NOTICE 'OK 26: la migración no inserta filas de backfill en portfolio_events -- arranca vacía';
END $$;

-- ── Órdenes de Trabajo ────────────────────────────────────────────────────────────────────
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, tax_rate,
                                adjustment_amount, approval_status, approved_at, risk_status, risk_approved_at) VALUES
  ('d0ca27e0-0000-4000-8000-000000000001', '70ca27e0-0000-4000-8000-000000000001',
   'BOB', 'High', 0.13, 0, 'Approved', (pg_temp.today() - 10)::timestamptz, 'Approved', (pg_temp.today() - 10)::timestamptz),
  ('d0ca27e0-0000-4000-8000-000000000002', '70ca27e0-0000-4000-8000-000000000002',
   'BOB', 'High', 0.13, 0, 'Approved', '2025-03-01T00:00:00Z', 'Approved', '2025-03-01T00:00:00Z'),
  ('d0ca27e0-0000-4000-8000-000000000003', '70ca27e0-0000-4000-8000-000000000003',
   'BOB', 'High', 0.13, 0, 'Pending_Approval', NULL, 'Approved', (pg_temp.today() - 2)::timestamptz),
  ('d0ca27e0-0000-4000-8000-000000000006', '70ca27e0-0000-4000-8000-000000000006',
   'BOB', 'High', 0.13, 0, 'Pending_Approval', NULL, 'Pending', NULL),
  ('d0ca27e0-0000-4000-8000-000000000007', '70ca27e0-0000-4000-8000-000000000007',
   'BOB', 'High', 0.13, 0, 'Approved', (pg_temp.today() - 200)::timestamptz, 'Approved', (pg_temp.today() - 200)::timestamptz),
  ('d0ca27e0-0000-4000-8000-000000000009', '70ca27e0-0000-4000-8000-000000000009',
   'BOB', 'High', 0.13, 0, 'Draft', NULL, 'Pending', NULL),
  ('d0ca27e0-0000-4000-8000-000000000008', '70ca27e0-0000-4000-8000-000000000008',
   'BOB', 'High', 0.13, 0, 'Approved', (pg_temp.today() - 50)::timestamptz, 'Approved', (pg_temp.today() - 50)::timestamptz)
ON CONFLICT (wo_id) DO NOTHING;
-- E4/E5: sin OT (work_order_required=false en E4; override manda en E5 independientemente del wo_id).

-- ── wo_budget_lines: E1 con las 6 categorías (D-1/D-2), E2 con Senior ────────────────────
INSERT INTO public.wo_budget_lines (wo_line_id, wo_id, category_id, budgeted_hours, standard_rate) VALUES
  ('b1ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', 'c0ca27e0-0000-4000-8000-000000000001', 10, 100),  -- Socio
  ('b1ca27e0-0000-4000-8000-000000000002', 'd0ca27e0-0000-4000-8000-000000000001', 'c0ca27e0-0000-4000-8000-000000000002', 8, 80),    -- Gerente (D-1: manager)
  ('b1ca27e0-0000-4000-8000-000000000003', 'd0ca27e0-0000-4000-8000-000000000001', 'c0ca27e0-0000-4000-8000-000000000004', 4, 90),    -- Gerente/Asociado Senior (D-1: manager, LEG)
  ('b1ca27e0-0000-4000-8000-000000000004', 'd0ca27e0-0000-4000-8000-000000000001', 'c0ca27e0-0000-4000-8000-000000000005', 6, 70),    -- Especialista IT (NO manager)
  ('b1ca27e0-0000-4000-8000-000000000005', 'd0ca27e0-0000-4000-8000-000000000001', 'c0ca27e0-0000-4000-8000-000000000006', 5, 70),    -- Especialista Tax (NO manager)
  ('b1ca27e0-0000-4000-8000-000000000006', 'd0ca27e0-0000-4000-8000-000000000001', 'c0ca27e0-0000-4000-8000-000000000003', 20, 50),   -- Senior
  ('b1ca27e0-0000-4000-8000-000000000007', 'd0ca27e0-0000-4000-8000-000000000002', 'c0ca27e0-0000-4000-8000-000000000003', 5, 50)     -- E2 Senior
ON CONFLICT (wo_line_id) DO NOTHING;
-- E1 total budget = 10+8+4+6+5+20 = 53h; KPI3 (solo Gerente+LEG) = 8+4 = 12h.

-- ── wo_expense_budget: E1 1000 BOB, E8 100 BOB (para el Top 3 sobregirado) ────────────────
INSERT INTO public.wo_expense_budget (wo_exp_id, wo_id, expense_type_id, budgeted_amount) VALUES
  ('b2ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', '9eca27e0-0000-4000-8000-000000000001', 1000),
  ('b2ca27e0-0000-4000-8000-000000000002', 'd0ca27e0-0000-4000-8000-000000000008', '9eca27e0-0000-4000-8000-000000000001', 100)
ON CONFLICT (wo_exp_id) DO NOTHING;

-- ── wo_staffing_requirements: E1 Gerente=1 / Senior=2 ─────────────────────────────────────
INSERT INTO public.wo_staffing_requirements (id, wo_id, category_id, staff_count) VALUES
  ('f1ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', 'c0ca27e0-0000-4000-8000-000000000002', 1),
  ('f1ca27e0-0000-4000-8000-000000000002', 'd0ca27e0-0000-4000-8000-000000000001', 'c0ca27e0-0000-4000-8000-000000000003', 2)
ON CONFLICT (id) DO NOTHING;

-- ── Plan de pagos + cuotas de E1 (BOB, TC fijo=1 -> sin dependencia de exchange_rate_history) ─
ALTER TABLE public.wo_payment_plan DISABLE TRIGGER trg_wo_payment_plan_guard_exchange_rate;
ALTER TABLE public.wo_payment_plan DISABLE TRIGGER trg_wo_payment_plan_sync_fixed_installments;
ALTER TABLE public.wo_payment_installments DISABLE TRIGGER trg_wo_payment_installments_guard_exchange_rate;
ALTER TABLE public.wo_payment_installments DISABLE TRIGGER trg_wo_payment_installments_guard_delete;

INSERT INTO public.wo_payment_plan (plan_id, wo_id, exchange_rate, exchange_rate_mode, payment_days) VALUES
  ('e0ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', 1, 'fijo', 30)
ON CONFLICT (plan_id) DO NOTHING;

-- i1 Completed (cobrada hace 3 días, facturada hace 10 -> avg_collection_days = 7)
-- i2 Invoiced (a cobrar en today+3 -> next_7_days "collect")
-- i3 Pending (agreed_invoice_date=today-1 -> en mora)
-- i4 Pending (agreed_invoice_date=today+3 -> next_7_days "invoice")
INSERT INTO public.wo_payment_installments (installment_id, plan_id, wo_id, installment_number,
    amount, status,
    agreed_invoice_date, agreed_payment_date, collection_invoice_date, collection_payment_date, payment_date_actual,
    invoice_exchange_rate, payment_exchange_rate) VALUES
  ('f0ca27e0-0000-4000-8000-000000000001', 'e0ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', 1,
   300, 'Completed',
   pg_temp.today() - 10, pg_temp.today() - 5, pg_temp.today() - 10, pg_temp.today() - 4, pg_temp.today() - 3,
   1, 1),
  ('f0ca27e0-0000-4000-8000-000000000002', 'e0ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', 2,
   300, 'Invoiced',
   pg_temp.today() - 5, pg_temp.today() + 3, pg_temp.today() - 5, NULL, NULL,
   1, NULL),
  ('f0ca27e0-0000-4000-8000-000000000003', 'e0ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', 3,
   200, 'Pending',
   pg_temp.today() - 1, pg_temp.today() + 29, NULL, NULL, NULL,
   NULL, NULL),
  ('f0ca27e0-0000-4000-8000-000000000004', 'e0ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', 4,
   200, 'Pending',
   pg_temp.today() + 3, pg_temp.today() + 33, NULL, NULL, NULL,
   NULL, NULL)
ON CONFLICT (installment_id) DO NOTHING;

ALTER TABLE public.wo_payment_installments ENABLE TRIGGER trg_wo_payment_installments_guard_delete;
ALTER TABLE public.wo_payment_installments ENABLE TRIGGER trg_wo_payment_installments_guard_exchange_rate;
ALTER TABLE public.wo_payment_plan ENABLE TRIGGER trg_wo_payment_plan_sync_fixed_installments;
ALTER TABLE public.wo_payment_plan ENABLE TRIGGER trg_wo_payment_plan_guard_exchange_rate;

-- ── Gastos: E1 70% ejecutado (partner=u3), E8 150% (sobregirado, va primero en el Top 3;
-- E8 es ajeno a u3, así que esta pieza se verifica con admin -- firm-wide, aserción 18) ──
INSERT INTO public.fund_requests (fund_request_id, request_number, requester_staff_id, total_requested_amount, currency, status) VALUES
  ('f3ca27e0-0000-4000-8000-000000000001', 'FR-CA27E0-1', '50ca27e0-0000-4000-8000-000000000004', 800, 'BOB', 'borrador'),
  ('f3ca27e0-0000-4000-8000-000000000002', 'FR-CA27E0-2', '50ca27e0-0000-4000-8000-000000000009', 150, 'BOB', 'borrador')
ON CONFLICT (fund_request_id) DO NOTHING;

-- fre_validate_wo_in_request() exige que el wo_id de cada gasto esté enlazado a su fund
-- request via fund_request_work_orders antes de poder insertar el gasto.
INSERT INTO public.fund_request_work_orders (fr_wo_id, fund_request_id, wo_id, allocated_amount) VALUES
  ('f4ca27e0-0000-4000-8000-000000000001', 'f3ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', 800),
  ('f4ca27e0-0000-4000-8000-000000000002', 'f3ca27e0-0000-4000-8000-000000000002', 'd0ca27e0-0000-4000-8000-000000000008', 150)
ON CONFLICT (fr_wo_id) DO NOTHING;

INSERT INTO public.fund_request_expenses (fre_id, fund_request_id, wo_id, expense_type_id, expense_date, amount, currency, status) VALUES
  ('f2ca27e0-0000-4000-8000-000000000001', 'f3ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', '9eca27e0-0000-4000-8000-000000000001', pg_temp.today(), 400, 'BOB', 'revisado_asistente'),
  ('f2ca27e0-0000-4000-8000-000000000002', 'f3ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', '9eca27e0-0000-4000-8000-000000000001', pg_temp.today(), 300, 'BOB', 'aprobado_gerente'),
  ('f2ca27e0-0000-4000-8000-000000000003', 'f3ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', '9eca27e0-0000-4000-8000-000000000001', pg_temp.today(), 100, 'BOB', 'pendiente_aprobacion'),
  ('f2ca27e0-0000-4000-8000-000000000004', 'f3ca27e0-0000-4000-8000-000000000002', 'd0ca27e0-0000-4000-8000-000000000008', '9eca27e0-0000-4000-8000-000000000001', pg_temp.today(), 150, 'BOB', 'revisado_asistente')
ON CONFLICT (fre_id) DO NOTHING;
-- E1: executed=700/budget=1000 -> 70%. E8: executed=150/budget=100 -> 150% (sobregirado, primero en top3).

-- ── Matriz de trabajo de E1: v1 (10h) y v2 (53h, la que cuenta -- sin doble conteo) ───────
INSERT INTO public.activity_worksheets (id, engagement_id, wo_id, version, status, updated_at) VALUES
  ('a1ca27e0-0000-4000-8000-000000000001', '70ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', 1, 'approved', pg_temp.today() - 30),
  ('a1ca27e0-0000-4000-8000-000000000002', '70ca27e0-0000-4000-8000-000000000001', 'd0ca27e0-0000-4000-8000-000000000001', 2, 'approved', pg_temp.today() - 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.activity_worksheet_cells (id, worksheet_id, category_id, activity_id, budget_hours) VALUES
  ('a2ca27e0-0000-4000-8000-000000000001', 'a1ca27e0-0000-4000-8000-000000000001', 'c0ca27e0-0000-4000-8000-000000000002', 'acca27e0-0000-4000-8000-000000000001', 6),
  ('a2ca27e0-0000-4000-8000-000000000002', 'a1ca27e0-0000-4000-8000-000000000001', 'c0ca27e0-0000-4000-8000-000000000002', 'acca27e0-0000-4000-8000-000000000002', 4),
  ('a2ca27e0-0000-4000-8000-000000000003', 'a1ca27e0-0000-4000-8000-000000000002', 'c0ca27e0-0000-4000-8000-000000000002', 'acca27e0-0000-4000-8000-000000000001', 30),
  ('a2ca27e0-0000-4000-8000-000000000004', 'a1ca27e0-0000-4000-8000-000000000002', 'c0ca27e0-0000-4000-8000-000000000002', 'acca27e0-0000-4000-8000-000000000002', 23)
ON CONFLICT (id) DO NOTHING;
-- v1 total = 10h (vieja); v2 total = 53h (la vigente -- coincide a propósito con el
-- presupuesto total de E1 para probar la coherencia KPI4 = activities.total_budget_hours,
-- aserción 12b, con un llamante cuyo `scope` es exactamente {E1} (u4, manager único de E1)).

-- ── Periodos semanales (staff, week_start_date) ───────────────────────────────────────────
INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year) VALUES
  ('15ca27e0-0000-4000-8000-000000000001', '50ca27e0-0000-4000-8000-000000000004', pg_temp.today() - 7, 1, 2026),   -- P1 u4
  ('15ca27e0-0000-4000-8000-000000000002', '50ca27e0-0000-4000-8000-000000000004', '2025-10-06', 2, 2025),          -- P2 u4 (dentro del FY, fuera del periodo visible)
  ('15ca27e0-0000-4000-8000-000000000003', '50ca27e0-0000-4000-8000-000000000008', pg_temp.today() - 7, 1, 2026),   -- P3 u8
  ('15ca27e0-0000-4000-8000-000000000004', '50ca27e0-0000-4000-8000-000000000008', pg_temp.today() - 14, 2, 2026),  -- P4 u8 (rechazada)
  ('15ca27e0-0000-4000-8000-000000000006', '50ca27e0-0000-4000-8000-000000000008', pg_temp.today() - 35, 3, 2026)   -- P6 u8 (Cola: antigua, alert)
ON CONFLICT (period_id) DO NOTHING;

-- ── Horas cargadas sobre E1 (orden real: primero las horas, después las aprobaciones -- ver
-- protect_approved_time_entries()) ───────────────────────────────────────────────────────
INSERT INTO public.time_entries (time_id, date_worked, hours_logged, staff_id, engagement_id,
                                 activity_id, period_id, is_forecast) VALUES
  -- te1: u4, ACT1, P1 (aprobada más abajo), dentro del periodo y del FY -> 3h aprobadas
  ('16ca27e0-0000-4000-8000-000000000001', pg_temp.today() - 5, 3, '50ca27e0-0000-4000-8000-000000000004',
   '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001',
   '15ca27e0-0000-4000-8000-000000000001', false),
  -- te2: u4, ACT2, SIN periodo -> pendiente, 2h, dentro del periodo visible
  ('16ca27e0-0000-4000-8000-000000000002', pg_temp.today() - 5, 2, '50ca27e0-0000-4000-8000-000000000004',
   '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000002',
   NULL, false),
  -- te3: u4, ACT1, P2, dentro del FY pero FUERA del periodo visible -> 4h aprobadas
  -- (aserción 11: "la hora fuera del periodo pero dentro del FY sí cuenta" para KPI 3)
  ('16ca27e0-0000-4000-8000-000000000003', '2025-10-05', 4, '50ca27e0-0000-4000-8000-000000000004',
   '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001',
   '15ca27e0-0000-4000-8000-000000000002', false),
  -- te4: u8, ACT1, P3 (aprobada) -> 5h aprobadas, dentro del periodo
  ('16ca27e0-0000-4000-8000-000000000004', pg_temp.today() - 5, 5, '50ca27e0-0000-4000-8000-000000000008',
   '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001',
   '15ca27e0-0000-4000-8000-000000000003', false),
  -- te5: u8, ACT2, SIN periodo -> pendiente, 4h
  ('16ca27e0-0000-4000-8000-000000000005', pg_temp.today() - 5, 4, '50ca27e0-0000-4000-8000-000000000008',
   '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000002',
   NULL, false),
  -- te6: u8, ACT1, P4 (rechazada más abajo) -> 1.5h rechazadas, NO cuentan en ningún lado
  -- (fecha distinta de te4: mismo staff/engagement/activity con date_worked=today-5 ya lo usa
  -- te4, y hay un índice único (staff_id,engagement_id,activity_id,date_worked,is_forecast))
  ('16ca27e0-0000-4000-8000-000000000006', pg_temp.today() - 4, 1.5, '50ca27e0-0000-4000-8000-000000000008',
   '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001',
   '15ca27e0-0000-4000-8000-000000000004', false),
  -- te7: u8, ACT1, is_forecast=true -> excluida siempre, sea cual sea su bucket
  ('16ca27e0-0000-4000-8000-000000000007', pg_temp.today() - 5, 2, '50ca27e0-0000-4000-8000-000000000008',
   '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001',
   NULL, true),
  -- te8: u4, ACT2, P1 (pendiente explícita más abajo) -> 2.5h pendientes, dentro del periodo
  ('16ca27e0-0000-4000-8000-000000000008', pg_temp.today() - 6, 2.5, '50ca27e0-0000-4000-8000-000000000004',
   '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000002',
   '15ca27e0-0000-4000-8000-000000000001', false),
  -- te9: u8, ACT1, P6 (pendiente explícita, antigua) -> 6h, Cola con alerta (semana 5)
  ('16ca27e0-0000-4000-8000-000000000009', pg_temp.today() - 36, 6, '50ca27e0-0000-4000-8000-000000000008',
   '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001',
   '15ca27e0-0000-4000-8000-000000000006', false),
  -- te10: u6, ACT1, SIN periodo -> pendiente, categoría "Sin Categoria Presupuestada"
  -- (presupuesto 0 en esa categoría, aserción 15: sigue apareciendo)
  ('16ca27e0-0000-4000-8000-000000000010', pg_temp.today() - 5, 3, '50ca27e0-0000-4000-8000-000000000006',
   '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001',
   NULL, false),
  -- te_e6: u3, ACT1, sobre E6 (override=4, sin presupuesto real) -> sobregiro garantizado
  ('16ca27e0-0000-4000-8000-000000000011', pg_temp.today() - 5, 5, '50ca27e0-0000-4000-8000-000000000003',
   '70ca27e0-0000-4000-8000-000000000006', 'acca27e0-0000-4000-8000-000000000001',
   NULL, false),
  -- te12: u10 (Socio de la práctica 2) carga 7h en E1, que es de la práctica 1 -> pendiente,
  -- dentro del periodo visible, en CA3 para no mover los números de la Cascada. Aserción 29:
  -- estas horas deben caer en el MISMO 'Socio' que presupuesta E1 (el de la práctica 1), no
  -- abrir una segunda fila homónima.
  ('16ca27e0-0000-4000-8000-000000000012', pg_temp.today() - 5, 7, '50ca27e0-0000-4000-8000-000000000010',
   '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000003',
   NULL, false)
ON CONFLICT (time_id) DO NOTHING;

INSERT INTO public.timesheet_line_approvals (approval_id, period_id, engagement_id, activity_id, status) VALUES
  ('17ca27e0-0000-4000-8000-000000000001', '15ca27e0-0000-4000-8000-000000000001', '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001', 'approved'),  -- te1
  ('17ca27e0-0000-4000-8000-000000000002', '15ca27e0-0000-4000-8000-000000000002', '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001', 'approved'),  -- te3
  ('17ca27e0-0000-4000-8000-000000000003', '15ca27e0-0000-4000-8000-000000000003', '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001', 'approved'),  -- te4
  ('17ca27e0-0000-4000-8000-000000000004', '15ca27e0-0000-4000-8000-000000000004', '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001', 'rejected'),  -- te6
  ('17ca27e0-0000-4000-8000-000000000005', '15ca27e0-0000-4000-8000-000000000001', '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000002', 'pending'),   -- te8 (Cola: reciente, weeks_old=1)
  ('17ca27e0-0000-4000-8000-000000000006', '15ca27e0-0000-4000-8000-000000000006', '70ca27e0-0000-4000-8000-000000000001', 'acca27e0-0000-4000-8000-000000000001', 'pending')    -- te9 (Cola: antigua, weeks_old=5, alert)
ON CONFLICT (approval_id) DO NOTHING;

-- ── Helpers (patrón de rpc-dash-socio-partner-overview.sql) ──────────────────────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;
CREATE FUNCTION pg_temp.u(n integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'a0ca27e0-0000-4000-8000-' || lpad(n::text, 12, '0')
$$;
CREATE FUNCTION pg_temp.s(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('50ca27e0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.e(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('70ca27e0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.c(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('60ca27e0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.has_eng(p_items jsonb, p_id uuid) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE (e->>'engagement_id')::uuid = p_id)
$$;

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Aserciones 23-24: bitácora de asignaciones -- corren como dueño de la tabla, ANTES del
-- SET LOCAL ROLE authenticated (el trigger no depende del rol del llamante; se prueba
-- directo contra la tabla real, igual que cualquier otra migración de esquema).
-- ══════════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_before int; v_after int;
BEGIN
  SELECT COUNT(*) INTO v_before FROM public.portfolio_events;

  -- E2: manager_id NULL -> u3 (cambio real) -> exactamente 1 evento nuevo
  UPDATE public.engagements SET manager_id = pg_temp.s(3) WHERE engagement_id = pg_temp.e(2);
  SELECT COUNT(*) INTO v_after FROM public.portfolio_events;
  IF v_after - v_before <> 1 THEN
    RAISE EXCEPTION 'FAIL: cambiar manager_id de NULL a un valor debía generar exactamente 1 evento, generó %', v_after - v_before;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.portfolio_events
    WHERE engagement_id = pg_temp.e(2) AND event_type = 'manager_assigned'
      AND subject_staff_id = pg_temp.s(3) AND previous_staff_id IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL: el evento manager_assigned de E2 no tiene los valores esperados';
  END IF;

  -- Repetir el mismo valor -> sin evento nuevo
  UPDATE public.engagements SET manager_id = pg_temp.s(3) WHERE engagement_id = pg_temp.e(2);
  SELECT COUNT(*) INTO v_after FROM public.portfolio_events;
  IF v_after - v_before <> 1 THEN
    RAISE EXCEPTION 'FAIL: repetir el mismo manager_id no debía generar un evento nuevo';
  END IF;

  -- Cambiar otra columna cualquiera -> sin evento nuevo
  UPDATE public.engagements SET engagement_name = engagement_name || ' (editado)' WHERE engagement_id = pg_temp.e(2);
  SELECT COUNT(*) INTO v_after FROM public.portfolio_events;
  IF v_after - v_before <> 1 THEN
    RAISE EXCEPTION 'FAIL: cambiar engagement_name no debía generar un evento';
  END IF;

  RAISE NOTICE 'OK 23: la bitácora genera exactamente 1 evento manager_assigned por cambio real; no-op y otras columnas no generan eventos';
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE public.portfolio_events SET event_type = 'partner_assigned' WHERE engagement_id = pg_temp.e(2);
    RAISE EXCEPTION 'FAIL: UPDATE sobre portfolio_events debía fallar (append-only)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN
      RAISE EXCEPTION 'FAIL: UPDATE sobre portfolio_events falló con un error inesperado: %', SQLERRM;
    END IF;
  END;

  BEGIN
    DELETE FROM public.portfolio_events WHERE engagement_id = pg_temp.e(2);
    RAISE EXCEPTION 'FAIL: DELETE sobre portfolio_events debía fallar (append-only)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN
      RAISE EXCEPTION 'FAIL: DELETE sobre portfolio_events falló con un error inesperado: %', SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'OK 24: UPDATE y DELETE directos sobre portfolio_events fallan (append-only)';
END $$;

SET LOCAL ROLE authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Aserciones 1-22, 25: RPC portfolio_overview()
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Sin sesión -> FORBIDDEN: no session ────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.portfolio_overview(
      pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
    RAISE EXCEPTION 'FAIL: sin sesión debía lanzar FORBIDDEN: no session';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FORBIDDEN: no session%' THEN
      RAISE EXCEPTION 'FAIL: excepción inesperada sin sesión: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK 1: sin sesión (auth.uid() NULL), portfolio_overview() lanza FORBIDDEN: no session';
END $$;

-- ── 2. senior (u6, sin el permiso) -> FORBIDDEN: dashboard.portfolio.read ─────────────────
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(6));
  BEGIN
    PERFORM public.portfolio_overview(
      pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
    RAISE EXCEPTION 'FAIL: senior (sin dashboard.portfolio.read) debía lanzar FORBIDDEN';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FORBIDDEN: dashboard.portfolio.read%' THEN
      RAISE EXCEPTION 'FAIL: excepción inesperada para senior: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK 2: senior (u6), sin dashboard.portfolio.read -> FORBIDDEN: dashboard.portfolio.read';
END $$;

-- ── 3. admin / senior_partner: scope_kind=firm, mismo unfiltered_scope_count (5), incluye E7 ─
DO $$
DECLARE v_admin jsonb; v_sp jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v_admin := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  PERFORM pg_temp.impersonate(pg_temp.u(2));
  v_sp := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);

  IF v_admin->'meta'->>'scope_kind' <> 'firm' OR v_sp->'meta'->>'scope_kind' <> 'firm' THEN
    RAISE EXCEPTION 'FAIL: admin/senior_partner deben ver scope_kind=firm';
  END IF;
  IF (v_admin->'meta'->>'unfiltered_scope_count')::int <> 5 OR (v_sp->'meta'->>'unfiltered_scope_count')::int <> 5 THEN
    RAISE EXCEPTION 'FAIL: unfiltered_scope_count esperado 5 (E1,E2,E6,E7,E8), admin=%, senior_partner=%',
      v_admin->'meta'->>'unfiltered_scope_count', v_sp->'meta'->>'unfiltered_scope_count';
  END IF;
  IF NOT pg_temp.has_eng(v_admin->'engagement_rows', pg_temp.e(7)) THEN
    RAISE EXCEPTION 'FAIL: admin (firm-wide) debía ver E7 en engagement_rows';
  END IF;
  RAISE NOTICE 'OK 3: admin y senior_partner ven scope_kind=firm, unfiltered_scope_count=5, incluye E7';
END $$;

-- ── 4. partner (u3): scope_kind=own, ve E1/E2/E6; no ve E7/E4/E5/E3/E9. risk_partner (u7):
-- mismo predicado, ve SOLO E7 (sin alcance departamental) ────────────────────────────────
DO $$
DECLARE v_partner jsonb; v_risk jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v_partner := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF v_partner->'meta'->>'scope_kind' <> 'own' THEN
    RAISE EXCEPTION 'FAIL: partner scope_kind esperado own, obtuvo %', v_partner->'meta'->>'scope_kind';
  END IF;
  IF (v_partner->'meta'->>'unfiltered_scope_count')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL: partner unfiltered_scope_count esperado 3 (E1,E2,E6), obtuvo %', v_partner->'meta'->>'unfiltered_scope_count';
  END IF;
  IF NOT (pg_temp.has_eng(v_partner->'engagement_rows', pg_temp.e(1))
          AND pg_temp.has_eng(v_partner->'engagement_rows', pg_temp.e(2))
          AND pg_temp.has_eng(v_partner->'engagement_rows', pg_temp.e(6))) THEN
    RAISE EXCEPTION 'FAIL: partner debía ver E1, E2 y E6';
  END IF;
  IF pg_temp.has_eng(v_partner->'engagement_rows', pg_temp.e(7))
     OR pg_temp.has_eng(v_partner->'engagement_rows', pg_temp.e(4))
     OR pg_temp.has_eng(v_partner->'engagement_rows', pg_temp.e(5))
     OR pg_temp.has_eng(v_partner->'engagement_rows', pg_temp.e(3))
     OR pg_temp.has_eng(v_partner->'engagement_rows', pg_temp.e(9)) THEN
    RAISE EXCEPTION 'FAIL: partner NO debía ver E7 (ajeno), E4 (funcion 0), E5 (finalizado), E3 (pendiente) ni E9 (borrador)';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(7));
  v_risk := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF v_risk->'meta'->>'scope_kind' <> 'own' THEN
    RAISE EXCEPTION 'FAIL: risk_partner scope_kind esperado own, obtuvo %', v_risk->'meta'->>'scope_kind';
  END IF;
  IF (v_risk->'meta'->>'unfiltered_scope_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: risk_partner unfiltered_scope_count esperado 1 (solo E7), obtuvo %', v_risk->'meta'->>'unfiltered_scope_count';
  END IF;
  IF NOT pg_temp.has_eng(v_risk->'engagement_rows', pg_temp.e(7)) THEN
    RAISE EXCEPTION 'FAIL: risk_partner debía ver E7 (su propio partner_id)';
  END IF;
  IF pg_temp.has_eng(v_risk->'engagement_rows', pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: risk_partner NO debía ver E1 -- sin alcance departamental (mismo predicado que partner)';
  END IF;
  RAISE NOTICE 'OK 4: partner ve E1/E2/E6 (own), no ve E7/E4/E5/E3/E9; risk_partner ve SOLO E7 -- sin alcance departamental';
END $$;

-- ── 5. manager (u4) ve E1, no E3 (pendiente); ita_manager (u5), manager solo de E4
-- (funcion 0) -> scope_count = 0 ─────────────────────────────────────────────────────────
DO $$
DECLARE v_mgr jsonb; v_ita jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  v_mgr := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF (v_mgr->'meta'->>'unfiltered_scope_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: manager unfiltered_scope_count esperado 1 (solo E1), obtuvo %', v_mgr->'meta'->>'unfiltered_scope_count';
  END IF;
  IF NOT pg_temp.has_eng(v_mgr->'engagement_rows', pg_temp.e(1)) OR pg_temp.has_eng(v_mgr->'engagement_rows', pg_temp.e(3)) THEN
    RAISE EXCEPTION 'FAIL: manager debía ver E1 y no E3 (estado 1, pendiente)';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(5));
  v_ita := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF (v_ita->'meta'->>'scope_count')::int <> 0 OR (v_ita->'meta'->>'unfiltered_scope_count')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: ita_manager (manager solo de E4, funcion 0) debía tener scope_count=0, obtuvo %', v_ita->'meta'->>'scope_count';
  END IF;
  RAISE NOTICE 'OK 5: manager ve E1 (no E3); ita_manager (solo E4, funcion 0) -> scope_count=0';
END $$;

-- ── 6. p_client_id del cliente de E1 reduce scope_count sin afectar unfiltered_scope_count
-- ni filters.clients ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_unfiltered jsonb; v_filtered jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v_unfiltered := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date, NULL);
  v_filtered := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date, pg_temp.c(1));

  IF (v_filtered->'meta'->>'scope_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: filtrando por el cliente de E1, scope_count esperado 1, obtuvo %', v_filtered->'meta'->>'scope_count';
  END IF;
  IF (v_filtered->'meta'->>'unfiltered_scope_count')::int <> (v_unfiltered->'meta'->>'unfiltered_scope_count')::int THEN
    RAISE EXCEPTION 'FAIL: p_client_id no debía cambiar unfiltered_scope_count';
  END IF;
  IF jsonb_array_length(v_filtered->'filters'->'clients') <> jsonb_array_length(v_unfiltered->'filters'->'clients') THEN
    RAISE EXCEPTION 'FAIL: p_client_id no debía cambiar filters.clients';
  END IF;
  IF jsonb_array_length(v_unfiltered->'filters'->'clients') <> 3 THEN
    RAISE EXCEPTION 'FAIL: filters.clients de partner debía listar 3 clientes (C1,C2,C3), listó %', jsonb_array_length(v_unfiltered->'filters'->'clients');
  END IF;
  RAISE NOTICE 'OK 6: p_client_id reduce scope_count (3->1) sin afectar unfiltered_scope_count ni filters.clients';
END $$;

-- ── 7. p_client_id inexistente/fuera de alcance -> scope_count=0, unfiltered_scope_count>0 ─
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date, '00000000-0000-4000-8000-000000000000'::uuid);
  IF (v->'meta'->>'scope_count')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: cliente inexistente debía dar scope_count=0, obtuvo %', v->'meta'->>'scope_count';
  END IF;
  IF (v->'meta'->>'unfiltered_scope_count')::int <= 0 THEN
    RAISE EXCEPTION 'FAIL: unfiltered_scope_count debía seguir > 0 con un cliente inexistente';
  END IF;
  RAISE NOTICE 'OK 7: p_client_id inexistente -> scope_count=0, unfiltered_scope_count sin cambios';
END $$;

-- ── 8. Validaciones de rango ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  BEGIN
    PERFORM public.portfolio_overview(pg_temp.today() + 1, pg_temp.today(), 2026, '2025-10-01'::date, '2026-09-30'::date);
    RAISE EXCEPTION 'FAIL: p_start > p_end debía lanzar INVALID_RANGE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'INVALID_RANGE%' THEN RAISE EXCEPTION 'FAIL: excepción inesperada: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.portfolio_overview(pg_temp.today() - 1, pg_temp.today(), 2026, '2026-09-30'::date, '2025-10-01'::date);
    RAISE EXCEPTION 'FAIL: p_fy_start > p_fy_end debía lanzar INVALID_FISCAL_RANGE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'INVALID_FISCAL_RANGE%' THEN RAISE EXCEPTION 'FAIL: excepción inesperada: %', SQLERRM; END IF;
  END;
  BEGIN
    PERFORM public.portfolio_overview(pg_temp.today() - 1, pg_temp.today(), 1900, '2025-10-01'::date, '2026-09-30'::date);
    RAISE EXCEPTION 'FAIL: p_fiscal_year fuera de rango debía lanzar INVALID_FISCAL_YEAR';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'INVALID_FISCAL_YEAR%' THEN RAISE EXCEPTION 'FAIL: excepción inesperada: %', SQLERRM; END IF;
  END;
  RAISE NOTICE 'OK 8: p_start>p_end -> INVALID_RANGE; p_fy_start>p_fy_end -> INVALID_FISCAL_RANGE; p_fiscal_year fuera de rango -> INVALID_FISCAL_YEAR';
END $$;

-- ── 9. KPI 1 (u3, FY2026): cuenta E1 y E6, no E2 (anio_fiscal 2025) ───────────────────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF (v->'kpis'->'engagements'->>'total')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL: KPI1 total esperado 2 (E1,E6), obtuvo %', v->'kpis'->'engagements'->>'total';
  END IF;
  IF (v->'kpis'->'engagements'->>'approved')::int <> 2 OR (v->'kpis'->'engagements'->>'emergency')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: KPI1 approved/emergency inesperados: %', v->'kpis'->'engagements';
  END IF;
  RAISE NOTICE 'OK 9: KPI1 con p_fiscal_year=2026 cuenta E1 y E6 (total=2, approved=2), no E2 (anio_fiscal 2025)';
END $$;

-- ── 10. KPI 2: clientes/servicios de FY2026 vs FY2025 ────────────────────────────────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF (v->'kpis'->'clients_services'->>'clients')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL: KPI2 clients esperado 2 (C1,C3 via E1/E6), obtuvo %', v->'kpis'->'clients_services'->>'clients';
  END IF;
  IF (v->'kpis'->'clients_services'->>'services')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: KPI2 services esperado 1 (solo E1 tiene taxonomy_id), obtuvo %', v->'kpis'->'clients_services'->>'services';
  END IF;
  IF (v->'kpis'->'clients_services'->>'previous_clients')::int <> 1 OR (v->'kpis'->'clients_services'->>'previous_services')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: KPI2 previous_* esperado 1/1 (E2, FY2025), obtuvo %', v->'kpis'->'clients_services';
  END IF;
  RAISE NOTICE 'OK 10: KPI2 clients=2/services=1 (FY2026); previous_clients=1/previous_services=1 (FY2025, E2)';
END $$;

-- ── 11. KPI 3 (u4, categoría 'Gerente' con default_role_key='manager'): budget=12
-- (Gerente+LEG), approved incluye la hora fuera del periodo pero dentro del FY (D-1, D-2).
-- 2026-09-20: el KPI se adapta a la categoría del llamante, pero para un gerente el
-- resultado no cambia -- esta aserción es la que garantiza que la generalización no movió
-- el caso original (role_key='manager' agrupa igual que el literal de antes) ─────────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF v->'kpis'->'my_role_hours'->>'role_label' <> 'Gerente'
     OR v->'kpis'->'my_role_hours'->>'role_key' <> 'manager' THEN
    RAISE EXCEPTION 'FAIL: KPI3(u4) debía identificarse como Gerente/manager, obtuvo %', v->'kpis'->'my_role_hours';
  END IF;
  IF (v->'kpis'->'my_role_hours'->>'budget')::numeric <> 12 THEN
    RAISE EXCEPTION 'FAIL: KPI3 budget esperado 12 (Gerente 8 + LEG 4), obtuvo %', v->'kpis'->'my_role_hours'->>'budget';
  END IF;
  IF (v->'kpis'->'my_role_hours'->>'approved')::numeric <> 7 THEN
    RAISE EXCEPTION 'FAIL: KPI3 approved esperado 7 (te1=3 en periodo + te3=4 fuera del periodo pero dentro del FY), obtuvo %', v->'kpis'->'my_role_hours'->>'approved';
  END IF;
  IF (v->'kpis'->'my_role_hours'->>'pending')::numeric <> 4.5 THEN
    RAISE EXCEPTION 'FAIL: KPI3 pending esperado 4.5 (te2=2 + te8=2.5), obtuvo %', v->'kpis'->'my_role_hours'->>'pending';
  END IF;
  RAISE NOTICE 'OK 11: KPI3 (u4, Gerente/manager) budget=12, approved=7 (incluye horas fuera del periodo pero dentro del FY), pending=4.5 -- solo mis horas';
END $$;

-- ── 11c. KPI 3 adaptativo (decisión del operador 2026-09-20): u3 es SOCIO, nunca manager_id.
-- Con el KPI clavado en 'manager' le daba 0/0 por construcción -- el bug que reportó en vivo.
-- Ahora el conjunto son los encargos donde ocupa SU rol estructural (partner_id=u3 -> E1, E6)
-- y el presupuesto, las líneas de su categoría. La 'Socio' del fixture tiene
-- default_role_key NULL a propósito (cero_11 lo deja sin poblar cuando el default_app_role
-- mapea a más de un role_key), así que esto ejercita el RESPALDO POR NOMBRE ────────────────
DO $$
DECLARE v jsonb; v_k jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  v_k := v->'kpis'->'my_role_hours';

  IF v_k->>'role_label' <> 'Socio' OR v_k->'role_key' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL: KPI3(u3) debía identificarse como Socio con role_key NULL (respaldo por nombre), obtuvo %', v_k;
  END IF;
  IF (v_k->>'budget')::numeric <> 10 THEN
    RAISE EXCEPTION 'FAIL: KPI3(u3) budget esperado 10 (línea Socio de E1; E6 no tiene OT aprobada), obtuvo %', v_k->>'budget';
  END IF;
  IF (v_k->>'approved')::numeric <> 0 OR (v_k->>'pending')::numeric <> 5 THEN
    RAISE EXCEPTION 'FAIL: KPI3(u3) esperado approved=0/pending=5 (te_e6, sus únicas horas en el FY), obtuvo %', v_k;
  END IF;
  RAISE NOTICE 'OK 11c: KPI3 se adapta a la categoría del llamante -- u3 (Socio) ve 5/10 h sobre sus encargos como socio, ya no 0/0';
END $$;

-- ── 11b. KPI 3 · catálogo D-1: Gerente/Asociado Senior suma; especialistas IT/Tax no ──────
-- (verificado indirectamente: budget=12 = 8 (Gerente) + 4 (LEG); si sumara los 6h/5h de los
-- especialistas, budget sería 23 -- la aserción 11 ya lo cubre numéricamente)
DO $$
BEGIN
  RAISE NOTICE 'OK 11b: catálogo D-1 confirmado por la aserción 11 (budget=12 excluye 6h Especialista IT y 5h Especialista Tax de E1)';
END $$;

-- ── 12. KPI 4 (D-2): scope_fy completo (socio o gerente); u3 (nunca manager) tiene KPI4 > 0;
-- rechazadas/forecast no cuentan ─────────────────────────────────────────────────────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF (v->'kpis'->'portfolio_progress'->>'budget')::numeric <> 53 THEN
    RAISE EXCEPTION 'FAIL: KPI4(u3) budget esperado 53 (E1 completo; E6 sin OT aprobada aporta 0), obtuvo %', v->'kpis'->'portfolio_progress'->>'budget';
  END IF;
  IF (v->'kpis'->'portfolio_progress'->>'approved')::numeric <> 12 THEN
    RAISE EXCEPTION 'FAIL: KPI4(u3) approved esperado 12 (te1+te3+te4, todo el equipo), obtuvo %', v->'kpis'->'portfolio_progress'->>'approved';
  END IF;
  IF (v->'kpis'->'portfolio_progress'->>'pending')::numeric <> 29.5 THEN
    RAISE EXCEPTION 'FAIL: KPI4(u3) pending esperado 29.5 (te2+te8+te9+te5+te10+te12 de E1 + 5h de E6), obtuvo %', v->'kpis'->'portfolio_progress'->>'pending';
  END IF;
  IF (v->'kpis'->'portfolio_progress'->>'budget')::numeric <= 0 THEN
    RAISE EXCEPTION 'FAIL: KPI4(u3, nunca manager) debía ser > 0 (D-2: cuenta si es socio o gerente)';
  END IF;
  RAISE NOTICE 'OK 12: KPI4 (D-2) opera sobre scope_fy completo -- u3 (socio, nunca gerente) tiene budget=53>0, approved=12, pending=29.5 (rechazadas/forecast excluidas; incluye te12, la hora cruzada de otra práctica)';
END $$;

-- ── 12b. KPI 4 · coherencia con §5.3: budget = activities.total_budget_hours cuando el
-- periodo cubre el FY completo y el llamante tiene un único encargo en ambos conjuntos ────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  v := public.portfolio_overview('2025-10-01'::date, '2026-09-30'::date, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF (v->'kpis'->'portfolio_progress'->>'budget')::numeric <> (v->'activities'->>'total_budget_hours')::numeric THEN
    RAISE EXCEPTION 'FAIL: portfolio_progress.budget (%) debía igualar activities.total_budget_hours (%) para u4 con periodo=FY completo',
      v->'kpis'->'portfolio_progress'->>'budget', v->'activities'->>'total_budget_hours';
  END IF;
  IF (v->'activities'->>'total_budget_hours')::numeric <> 53 THEN
    RAISE EXCEPTION 'FAIL: activities.total_budget_hours esperado 53 (worksheet v2 de E1), obtuvo %', v->'activities'->>'total_budget_hours';
  END IF;
  RAISE NOTICE 'OK 12b: KPI4.budget = activities.total_budget_hours = 53 (u4, único encargo, periodo=FY completo)';
END $$;

-- ── 13. KPI 5: over_budget_count (vida completa); pending_wo_count / pending_risk_count
-- separados por llamante; el borrador (E9, Draft+Pending) no cuenta ──────────────────────
DO $$
DECLARE v_u3 jsonb; v_u4 jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v_u3 := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF (v_u3->'kpis'->'review'->>'over_budget_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: over_budget_count(u3) esperado 1 (E6: 5h sobre 0h de presupuesto), obtuvo %', v_u3->'kpis'->'review'->>'over_budget_count';
  END IF;
  IF (v_u3->'kpis'->'review'->>'pending_wo_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: pending_wo_count(u3) esperado 1 (E6), obtuvo %', v_u3->'kpis'->'review'->>'pending_wo_count';
  END IF;
  IF (v_u3->'kpis'->'review'->>'pending_risk_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: pending_risk_count(u3) esperado 1 (E6); el borrador E9 (Draft+Pending) NO debía contar. Obtuvo %', v_u3->'kpis'->'review'->>'pending_risk_count';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(4));
  v_u4 := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF (v_u4->'kpis'->'review'->>'pending_wo_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: pending_wo_count(u4) esperado 1 (E3), obtuvo %', v_u4->'kpis'->'review'->>'pending_wo_count';
  END IF;
  IF (v_u4->'kpis'->'review'->>'pending_risk_count')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL: pending_risk_count(u4) esperado 0 (E3 tiene risk_status=Approved), obtuvo %', v_u4->'kpis'->'review'->>'pending_risk_count';
  END IF;
  RAISE NOTICE 'OK 13: KPI5 -- over_budget_count(u3)=1 (E6, vida completa); pending_wo_count(u4)=1 (E3); pending_risk_count(u3)=1 (E6), el borrador E9 no cuenta';
END $$;

-- ── 14. Cascada: total_budget_hours = worksheet v2 de E1 (v1 no se duplica); ejecutado por
-- activity_id con split aprobado/pendiente en [p_start,p_end] ───────────────────────────
DO $$
DECLARE v jsonb; v_act1 jsonb; v_act2 jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF (v->'activities'->>'total_budget_hours')::numeric <> 53 THEN
    RAISE EXCEPTION 'FAIL: total_budget_hours esperado 53 (v2, sin duplicar v1=10), obtuvo %', v->'activities'->>'total_budget_hours';
  END IF;
  SELECT e INTO v_act1 FROM jsonb_array_elements(v->'activities'->'items') e WHERE e->>'activity_code' = 'CA1';
  SELECT e INTO v_act2 FROM jsonb_array_elements(v->'activities'->'items') e WHERE e->>'activity_code' = 'CA2';
  IF (v_act1->>'budget_hours')::numeric <> 30 OR (v_act1->>'approved_hours')::numeric <> 8 OR (v_act1->>'pending_hours')::numeric <> 3 THEN
    RAISE EXCEPTION 'FAIL: CA1 esperado budget=30/approved=8/pending=3, obtuvo %', v_act1;
  END IF;
  IF (v_act2->>'budget_hours')::numeric <> 23 OR (v_act2->>'approved_hours')::numeric <> 0 OR (v_act2->>'pending_hours')::numeric <> 8.5 THEN
    RAISE EXCEPTION 'FAIL: CA2 esperado budget=23/approved=0/pending=8.5, obtuvo %', v_act2;
  END IF;
  RAISE NOTICE 'OK 14: Cascada usa la worksheet v2 (53h, sin duplicar v1); split aprobado/pendiente por actividad en el periodo visible';
END $$;

-- ── 15. Horas por categoría: presupuesto desde wo_budget_lines; ejecutado por la categoría
-- homónima de la práctica del encargo (hours.exec_category_id -- para u4/u6/u8, de la misma
-- práctica, coincide con su propia categoría); categoría con horas y sin presupuesto sigue
-- apareciendo. El caso cruzado entre prácticas lo cubre la aserción 29 ───────────────────
DO $$
DECLARE v jsonb; v_ger jsonb; v_sen jsonb; v_sin jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  SELECT e INTO v_ger FROM jsonb_array_elements(v->'categories'->'items') e WHERE e->>'category_name' = 'Gerente';
  SELECT e INTO v_sen FROM jsonb_array_elements(v->'categories'->'items') e WHERE e->>'category_name' = 'Senior';
  SELECT e INTO v_sin FROM jsonb_array_elements(v->'categories'->'items') e WHERE e->>'category_name' = 'Sin Categoria Presupuestada';

  IF (v_ger->>'budget_hours')::numeric <> 8 OR (v_ger->>'approved_hours')::numeric <> 3 OR (v_ger->>'pending_hours')::numeric <> 4.5 THEN
    RAISE EXCEPTION 'FAIL: categoría Gerente esperada budget=8/approved=3/pending=4.5 (te2=2 + te8=2.5), obtuvo %', v_ger;
  END IF;
  IF (v_sen->>'budget_hours')::numeric <> 20 OR (v_sen->>'approved_hours')::numeric <> 5 OR (v_sen->>'pending_hours')::numeric <> 4 THEN
    RAISE EXCEPTION 'FAIL: categoría Senior esperada budget=20/approved=5/pending=4 (te5), obtuvo %', v_sen;
  END IF;
  IF v_sin IS NULL THEN
    RAISE EXCEPTION 'FAIL: la categoría "Sin Categoria Presupuestada" (sin línea en wo_budget_lines, con 3h pendientes de u6) debía aparecer igual';
  END IF;
  IF (v_sin->>'budget_hours')::numeric <> 0 OR (v_sin->>'pending_hours')::numeric <> 3 THEN
    RAISE EXCEPTION 'FAIL: "Sin Categoria Presupuestada" esperada budget=0/pending=3, obtuvo %', v_sin;
  END IF;
  RAISE NOTICE 'OK 15: Horas por categoría -- presupuesto de wo_budget_lines, ejecutado por la categoría de la práctica del encargo; categoría sin presupuesto (con ejecución) sigue apareciendo';
END $$;

-- ── 16. Presupuesto de personal: Gerente=1/Senior=2 (wo_staffing_requirements); ejecutado
-- cuenta personas distintas SIN filtrar por aprobación; categoría sin requisito -> NULL ───
DO $$
DECLARE v jsonb; v_ger jsonb; v_sen jsonb; v_sin jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  SELECT e INTO v_ger FROM jsonb_array_elements(v->'staffing') e WHERE e->>'category_name' = 'Gerente';
  SELECT e INTO v_sen FROM jsonb_array_elements(v->'staffing') e WHERE e->>'category_name' = 'Senior';
  SELECT e INTO v_sin FROM jsonb_array_elements(v->'staffing') e WHERE e->>'category_name' = 'Sin Categoria Presupuestada';

  IF (v_ger->>'budgeted')::int <> 1 OR (v_ger->>'executed')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: staffing Gerente esperado budgeted=1/executed=1 (u4), obtuvo %', v_ger;
  END IF;
  IF (v_sen->>'budgeted')::int <> 2 OR (v_sen->>'executed')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: staffing Senior esperado budgeted=2/executed=1 (u8, aunque tenga horas rechazadas también), obtuvo %', v_sen;
  END IF;
  IF v_sin IS NULL OR v_sin->'budgeted' <> 'null'::jsonb OR (v_sin->>'executed')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: staffing "Sin Categoria Presupuestada" esperado budgeted=NULL/executed=1 (u6), obtuvo %', v_sin;
  END IF;
  RAISE NOTICE 'OK 16: Presupuesto de personal -- Gerente=1/Senior=2 (staffing requirements); ejecutado sin filtrar por aprobación; categoría sin requisito -> budgeted NULL';
END $$;

-- ── 17. Facturación: by_status acotado al periodo por agreed_invoice_date; next_7_days
-- incluye la cuota a today+3 y excluye la vencida; conversión a BOB correcta (TC=1) ──────
DO $$
DECLARE v jsonb; v_next7 jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);

  IF (v->'collections'->'by_status'->'collected'->>'count')::int <> 1
     OR (v->'collections'->'by_status'->'collected'->>'amount_bob')::numeric <> 300 THEN
    RAISE EXCEPTION 'FAIL: collections.by_status.collected esperado count=1/amount_bob=300, obtuvo %', v->'collections'->'by_status'->'collected';
  END IF;
  IF (v->'collections'->'by_status'->'in_arrears'->>'count')::int <> 1
     OR (v->'collections'->'by_status'->'in_arrears'->>'amount_bob')::numeric <> 200 THEN
    RAISE EXCEPTION 'FAIL: collections.by_status.in_arrears esperado count=1/amount_bob=200 (i3, vencida), obtuvo %', v->'collections'->'by_status'->'in_arrears';
  END IF;
  IF (v->'collections'->>'avg_collection_days')::numeric <> 7 THEN
    RAISE EXCEPTION 'FAIL: avg_collection_days esperado 7, obtuvo %', v->'collections'->>'avg_collection_days';
  END IF;

  v_next7 := v->'collections'->'next_7_days';
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_next7) e WHERE e->>'installment_id' = 'f0ca27e0-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'FAIL: next_7_days debía incluir i2 (agreed_payment_date=today+3)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_next7) e WHERE e->>'installment_id' = 'f0ca27e0-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'FAIL: next_7_days debía incluir i4 (agreed_invoice_date=today+3)';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_next7) e WHERE e->>'installment_id' = 'f0ca27e0-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'FAIL: next_7_days NO debía incluir i3 (vencida, agreed_invoice_date=today-1)';
  END IF;
  RAISE NOTICE 'OK 17: Facturación -- by_status acotado al periodo, avg_collection_days=7, next_7_days incluye i2/i4 y excluye la vencida i3';
END $$;

-- ── 18. Gastos: executed_bob suma SOLO revisado_asistente en el periodo -- decisión del
-- operador 2026-09-18, corrige inconsistencia con partner_overview() (que ya distinguía
-- reviewed_bob de manager_approved_bob): un gasto cuenta como "ejecutado" solo cuando
-- concluye el flujo completo (Contabilidad revisa), no cuando el gerente lo aprueba.
-- pending_count cuenta pendiente_aprobacion + aprobado_gerente (sin periodo, son las de
-- hoy) -- aprobado_gerente sigue "pendiente" desde la óptica de Contabilidad; top3 ordena
-- sobregirados primero, luego pct desc, desempate por executed_bob desc; excluye
-- budget_bob=0. Se verifica con admin (firm-wide) porque E8 (el sobregirado) es ajeno a
-- u3/u4 a propósito (para no alterar los conteos de scope ya fijados en las aserciones
-- 3-21) ───────────────
DO $$
DECLARE v jsonb; v_top3 jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);

  IF (v->'expenses'->>'executed_bob')::numeric <> 550 THEN
    RAISE EXCEPTION 'FAIL: expenses.executed_bob esperado 550 (E1: 400 revisado_asistente + E8: 150 revisado_asistente -- aprobado_gerente de E1 NO cuenta), obtuvo %', v->'expenses'->>'executed_bob';
  END IF;
  IF (v->'expenses'->>'pending_count')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL: expenses.pending_count esperado 2 (E1: 1 pendiente_aprobacion + 1 aprobado_gerente), obtuvo %', v->'expenses'->>'pending_count';
  END IF;

  v_top3 := v->'expenses'->'top3';
  IF jsonb_array_length(v_top3) <> 2 THEN
    RAISE EXCEPTION 'FAIL: top3 esperado 2 encargos con presupuesto de gastos (E1,E8), obtuvo %', jsonb_array_length(v_top3);
  END IF;
  IF (v_top3->0->>'engagement_id')::uuid <> pg_temp.e(8) THEN
    RAISE EXCEPTION 'FAIL: top3[0] debía ser E8 (150%%, sobregirado), obtuvo %', v_top3->0;
  END IF;
  IF (v_top3->1->>'engagement_id')::uuid <> pg_temp.e(1) THEN
    RAISE EXCEPTION 'FAIL: top3[1] debía ser E1 (40%%, solo revisado_asistente), obtuvo %', v_top3->1;
  END IF;
  IF ROUND((v_top3->1->>'pct')::numeric) <> 40 THEN
    RAISE EXCEPTION 'FAIL: top3[1].pct esperado ~40 (400/1000, sin contar aprobado_gerente), obtuvo %', v_top3->1->>'pct';
  END IF;
  RAISE NOTICE 'OK 18: Gastos (admin, firm-wide) -- executed_bob=550 (solo revisado_asistente), pending_count=2; top3 ordena E8 (150%%, sobregirado) antes que E1 (40%%)';
END $$;

-- ── 19. Cola: agrupa sin duplicar horas; total_hours/distinct_people; antigüedad y alerta ─
DO $$
DECLARE v jsonb; v_old jsonb; v_recent jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);

  IF (v->'approval_queue'->>'total_hours')::numeric <> 8.5 THEN
    RAISE EXCEPTION 'FAIL: approval_queue.total_hours esperado 8.5 (2.5+6), obtuvo %', v->'approval_queue'->>'total_hours';
  END IF;
  IF (v->'approval_queue'->>'distinct_people')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL: approval_queue.distinct_people esperado 2 (u4,u8), obtuvo %', v->'approval_queue'->>'distinct_people';
  END IF;
  IF (v->'approval_queue'->>'total_count')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL: approval_queue.total_count esperado 2, obtuvo %', v->'approval_queue'->>'total_count';
  END IF;

  SELECT e INTO v_old FROM jsonb_array_elements(v->'approval_queue'->'items') e WHERE e->>'hours' = '6';
  SELECT e INTO v_recent FROM jsonb_array_elements(v->'approval_queue'->'items') e WHERE e->>'hours' = '2.5';
  IF (v_old->>'weeks_old')::int <> 5 OR (v_old->>'alert')::boolean <> true THEN
    RAISE EXCEPTION 'FAIL: la línea antigua (semana -35) esperaba weeks_old=5/alert=true, obtuvo %', v_old;
  END IF;
  IF (v_recent->>'weeks_old')::int <> 1 OR (v_recent->>'alert')::boolean <> false THEN
    RAISE EXCEPTION 'FAIL: la línea reciente (semana -7) esperaba weeks_old=1/alert=false, obtuvo %', v_recent;
  END IF;
  IF (v->'meta'->>'retro_days')::int <> 30 THEN
    RAISE EXCEPTION 'FAIL: meta.retro_days esperado 30 (default), obtuvo %', v->'meta'->>'retro_days';
  END IF;
  RAISE NOTICE 'OK 19: Cola -- total_hours=8.5, distinct_people=2, línea antigua weeks_old=5/alert; reciente weeks_old=1/sin alerta; retro_days=30';
END $$;

-- ── 20. Hitos: closing del mes siguiente (E1); wo_approved del último mes (E1); un
-- fecha_cierre de hace 3 meses (E2) NO aparece; lock_deadline derivado de la línea antigua;
-- ignoran el selector de periodo, respetan el filtro de Cliente ─────────────────────────
DO $$
DECLARE v jsonb; v_filtered jsonb; v_milestones jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  -- Periodo deliberadamente angosto (no cubre ninguna de las fechas de hitos) para probar
  -- que Hitos IGNORA el selector de periodo (decisiones.md §7.2/§7.4).
  v := public.portfolio_overview(pg_temp.today(), pg_temp.today(), 2026, '2025-10-01'::date, '2026-09-30'::date);
  v_milestones := v->'milestones';

  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_milestones) e
                 WHERE e->>'kind' = 'closing' AND (e->>'engagement_id')::uuid = pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: Hitos debía incluir el cierre de E1 (today+15, mes que viene)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_milestones) e
                 WHERE e->>'kind' = 'wo_approved' AND (e->>'engagement_id')::uuid = pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: Hitos debía incluir la OT aprobada de E1 (today-10, último mes)';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_milestones) e
             WHERE e->>'kind' = 'closing' AND (e->>'engagement_id')::uuid = pg_temp.e(2)) THEN
    RAISE EXCEPTION 'FAIL: Hitos NO debía incluir el cierre de E2 (hace 3 meses, fuera de la ventana)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_milestones) e
                 WHERE e->>'kind' = 'lock_deadline' AND (e->>'weeks')::int = 5) THEN
    RAISE EXCEPTION 'FAIL: Hitos debía incluir un lock_deadline derivado de la línea antigua (weeks=5)';
  END IF;

  -- Filtro de Cliente: el cliente de E2/E3/... (C2) no debe traer el cierre de E1 (cliente C1)
  v_filtered := (public.portfolio_overview(pg_temp.today(), pg_temp.today(), 2026, '2025-10-01'::date, '2026-09-30'::date, pg_temp.c(2)))->'milestones';
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_filtered) e
             WHERE e->>'kind' = 'closing' AND (e->>'engagement_id')::uuid = pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: Hitos con p_client_id=C2 NO debía traer el cierre de E1 (cliente C1) -- Hitos respeta el filtro de Cliente';
  END IF;
  RAISE NOTICE 'OK 20: Hitos -- closing (E1) y wo_approved (E1) presentes, cierre de E2 (3 meses) ausente, lock_deadline (semana 5) presente; ignora Periodo, respeta Cliente';
END $$;

-- ── 21. engagement_rows: E1 con budget/horas del periodo y over_budget de vida; excluye
-- E4/E5/E7/E9 para u3 ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE v jsonb; v_e1 jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  SELECT e INTO v_e1 FROM jsonb_array_elements(v->'engagement_rows') e WHERE (e->>'engagement_id')::uuid = pg_temp.e(1);
  IF v_e1 IS NULL THEN RAISE EXCEPTION 'FAIL: engagement_rows debía incluir E1'; END IF;
  IF (v_e1->>'budget_hours')::numeric <> 53 THEN
    RAISE EXCEPTION 'FAIL: engagement_rows[E1].budget_hours esperado 53, obtuvo %', v_e1->>'budget_hours';
  END IF;
  IF (v_e1->>'approved_hours')::numeric <> 8 OR (v_e1->>'pending_hours')::numeric <> 18.5 THEN
    RAISE EXCEPTION 'FAIL: engagement_rows[E1] horas del periodo esperadas approved=8/pending=18.5 (todo el equipo, periodo visible, incluye las 7h cruzadas de te12), obtuvo %', v_e1;
  END IF;
  IF (v_e1->>'over_budget')::boolean <> false THEN
    RAISE EXCEPTION 'FAIL: E1 no debía estar sobregirado (36.5h de vida vs 53h de presupuesto)';
  END IF;
  IF pg_temp.has_eng(v->'engagement_rows', pg_temp.e(4))
     OR pg_temp.has_eng(v->'engagement_rows', pg_temp.e(5))
     OR pg_temp.has_eng(v->'engagement_rows', pg_temp.e(7))
     OR pg_temp.has_eng(v->'engagement_rows', pg_temp.e(9)) THEN
    RAISE EXCEPTION 'FAIL: engagement_rows NO debía incluir E4/E5/E7/E9 para u3';
  END IF;
  RAISE NOTICE 'OK 21: engagement_rows -- E1 con budget=53/approved=8/pending=18.5 (periodo), sin sobregiro; excluye E4/E5/E7/E9';
END $$;

-- ── 22. Sin PII; role_key solo en meta ────────────────────────────────────────────────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF v::text ILIKE '%"email"%' OR v::text ILIKE '%"id_number"%'
     OR v::text ILIKE '%"aud_reg_number"%' OR v::text ILIKE '%"auth_user_id"%' THEN
    RAISE EXCEPTION 'FAIL: el payload expone una clave PII cruda: %', v;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'engagement_rows') e WHERE e ? 'role_key')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v->'approval_queue'->'items') e WHERE e ? 'role_key') THEN
    RAISE EXCEPTION 'FAIL: un objeto anidado expone role_key (solo meta.role_key es aceptable)';
  END IF;
  RAISE NOTICE 'OK 22: sin email/id_number/aud_reg_number/auth_user_id en ningún nivel; role_key solo en meta';
END $$;

-- ── 25. Bitácora: authenticated no puede SELECT directo; el hito "assignment" llega por el
-- RPC cuando el evento corresponde al llamante y a su alcance ────────────────────────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  BEGIN
    PERFORM COUNT(*) FROM public.portfolio_events;
    RAISE EXCEPTION 'FAIL: authenticated no debía poder hacer SELECT directo sobre portfolio_events';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- esperado
  END;

  v := public.portfolio_overview(pg_temp.today(), pg_temp.today(), 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v->'milestones') e
    WHERE e->>'kind' = 'assignment' AND (e->>'engagement_id')::uuid = pg_temp.e(2)
  ) THEN
    RAISE EXCEPTION 'FAIL: el hito "assignment" de E2 (manager_id NULL -> u3) debía llegar por el RPC a u3';
  END IF;
  RAISE NOTICE 'OK 25: authenticated no puede leer portfolio_events directo (insufficient_privilege); el hito "assignment" llega por el RPC al llamante correspondiente';
END $$;

-- ── 27. finalized_summary (fila resumen "Encargos finalizados", pedido del operador
-- 2026-09-19): E5 (override=7, end_date=hoy, partner=u3) cuenta en finalized_summary.count;
-- sin OT, así que budget_hours/executed_hours/executed_expenses_bob quedan en 0 -- no
-- crashea con NULL de por medio (LEFT/JOIN correctos) ────────────────────────────────────
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  v := public.portfolio_overview(pg_temp.today(), pg_temp.today(), 2026, '2025-10-01'::date, '2026-09-30'::date);
  IF (v->'finalized_summary'->>'count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: finalized_summary.count esperado 1 (E5, end_date=hoy), obtuvo %', v->'finalized_summary'->>'count';
  END IF;
  IF (v->'finalized_summary'->>'budget_hours')::numeric <> 0
     OR (v->'finalized_summary'->>'executed_hours')::numeric <> 0
     OR (v->'finalized_summary'->>'executed_expenses_bob')::numeric <> 0 THEN
    RAISE EXCEPTION 'FAIL: E5 no tiene OT -- budget/executed/gastos debían ser 0, obtuvo %', v->'finalized_summary';
  END IF;
  RAISE NOTICE 'OK 27: finalized_summary -- count=1 (E5, finalizado hoy); budget/executed/gastos=0 (sin OT, sin crash)';
END $$;

-- ── 28. p_practica_id (pedido del operador 2026-09-19, admin/senior_partner): filtra por el
-- código de práctica traducido desde el uuid del selector -- solución al problema de
-- categoría/actividad duplicada al mezclar varias prácticas. E1 (practica=1, código
-- sembrado por el harness) sigue visible; E6 (practica IS NULL) queda excluido de un
-- filtro específico. filters.practicas lista el catálogo activo (no derivado de scope) ──
DO $$
DECLARE v jsonb; v_practica_id uuid;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  SELECT practica_id INTO v_practica_id FROM public.practicas WHERE code = 1;

  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date, NULL, v_practica_id);
  IF NOT pg_temp.has_eng(v->'engagement_rows', pg_temp.e(1)) THEN
    RAISE EXCEPTION 'FAIL: con p_practica_id=code1, E1 (practica=1) debía seguir visible';
  END IF;
  IF pg_temp.has_eng(v->'engagement_rows', pg_temp.e(6)) THEN
    RAISE EXCEPTION 'FAIL: con p_practica_id=code1, E6 (practica NULL) debía quedar excluido';
  END IF;
  IF jsonb_array_length(v->'filters'->'practicas') < 1 THEN
    RAISE EXCEPTION 'FAIL: filters.practicas debía listar al menos la práctica sembrada por el harness';
  END IF;
  RAISE NOTICE 'OK 28: p_practica_id filtra por código (E1 visible, E6 sin práctica excluido); filters.practicas lista el catálogo activo';
END $$;

-- ── 29. BUG 2026-09-20 (categorías duplicadas): una persona de OTRA práctica trabajando el
-- encargo no abre una segunda fila homónima. u10 es 'Socio' de la práctica 2 y cargó 7h en
-- E1, que es de la práctica 1 y presupuesta 10h de su propio 'Socio'. Antes del fix, el
-- payload traía dos items 'Socio': uno con budget=10/exec=0 (el de la práctica 1) y otro con
-- budget=0/exec=7 (el de la práctica 2) -- la barra punteada y la barra naranja sueltas de la
-- captura del operador. Además: las horas cruzadas NUNCA se descartan (el filtro por práctica
-- que se probó antes las hacía desaparecer), y cada fila viaja con practica_abbr ─────────
DO $$
DECLARE v jsonb; v_socio jsonb; v_stf jsonb; v_cnt int; v_aud uuid; v_p2 uuid;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  SELECT practica_id INTO v_aud FROM public.practicas WHERE code = 1;
  SELECT practica_id INTO v_p2  FROM public.practicas WHERE code = 2;
  v := public.portfolio_overview(pg_temp.today() - 15, pg_temp.today() + 10, 2026, '2025-10-01'::date, '2026-09-30'::date);

  SELECT count(*) INTO v_cnt
    FROM jsonb_array_elements(v->'categories'->'items') e WHERE e->>'category_name' = 'Socio';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FAIL: se esperaba UNA sola fila "Socio" en categories.items (las 7h de u10, socio de otra práctica, van a la categoría de la práctica del encargo), obtuvo % filas: %',
      v_cnt, (SELECT jsonb_agg(e) FROM jsonb_array_elements(v->'categories'->'items') e WHERE e->>'category_name' = 'Socio');
  END IF;

  SELECT e INTO v_socio FROM jsonb_array_elements(v->'categories'->'items') e WHERE e->>'category_name' = 'Socio';
  IF (v_socio->>'category_id')::uuid <> (SELECT category_id FROM public.categories WHERE practica_id = v_aud AND category_name = 'Socio') THEN
    RAISE EXCEPTION 'FAIL: la fila "Socio" debía ser la de la práctica del encargo (code=1), obtuvo %', v_socio;
  END IF;
  IF (v_socio->>'budget_hours')::numeric <> 10 OR (v_socio->>'pending_hours')::numeric <> 7
     OR (v_socio->>'approved_hours')::numeric <> 0 THEN
    RAISE EXCEPTION 'FAIL: "Socio" esperado budget=10 (wo_budget_lines de E1) / pending=7 (te12, cruzada) / approved=0, obtuvo %', v_socio;
  END IF;
  IF v_socio->>'practica_abbr' <> 'AUD' THEN
    RAISE EXCEPTION 'FAIL: "Socio" debía traer practica_abbr=AUD (desambiguación de la vista "Todas"), obtuvo %', v_socio->>'practica_abbr';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'categories'->'items') e
              WHERE (e->>'category_id')::uuid = (SELECT category_id FROM public.categories WHERE practica_id = v_p2 AND category_name = 'Socio')) THEN
    RAISE EXCEPTION 'FAIL: la categoría "Socio" de la práctica 2 (la de la ficha de u10) no debía aparecer como fila propia';
  END IF;

  -- Presupuesto de personal: u10 cuenta como 1 persona en el 'Socio' de la práctica del
  -- encargo, sin requisito presupuestado (E1 solo pide Gerente=1/Senior=2).
  SELECT count(*) INTO v_cnt FROM jsonb_array_elements(v->'staffing') e WHERE e->>'category_name' = 'Socio';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'FAIL: staffing debía traer UNA sola fila "Socio", obtuvo %', v_cnt;
  END IF;
  SELECT e INTO v_stf FROM jsonb_array_elements(v->'staffing') e WHERE e->>'category_name' = 'Socio';
  IF v_stf->'budgeted' <> 'null'::jsonb OR (v_stf->>'executed')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL: staffing "Socio" esperado budgeted=NULL/executed=1 (u10), obtuvo %', v_stf;
  END IF;

  RAISE NOTICE 'OK 29: horas de otra práctica se atribuyen al "Socio" de la práctica DEL ENCARGO -- una sola fila (budget=10/pending=7), sin descartar las horas cruzadas, con practica_abbr para desambiguar';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'CARTERA OVERVIEW RPC: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
