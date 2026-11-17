-- BUG 0817-178 — un encargo 7 Finalizado es de solo lectura (bugs/0817-178/plan_v2.md).
--
-- Triggers de cero_04: trg_engagements_finalized_lock, trg_*_finalized_lock (OT, presupuesto, gasto presupuestado,
-- staffing de la OT, matriz y celdas, plan de pagos y cuotas), trg_fr_wo_finalized_approval_lock (Aprobar la OT en
-- fondos) y trg_engagement_assignments_terminal_lock (asignaciones, 6/7, también el admin).
--
-- Reglas que se prueban:
--   * No-admin con sesión: ninguna escritura sobre el encargo 7 ni sobre lo que cuelga de él (ENGAGEMENT_FINALIZED_LOCKED).
--   * Admin por role_key (aunque su espejo legacy no diga 'admin') y sin sesión (cron) pasan.
--   * Entrar a 7 es legal (4 -> 7 por recompute con sesión de Gerente; NULL -> 7 sin sesión).
--   * Plan de pagos: la estructura se congela; la cobranza (estado, fechas vigentes, confirmación, TC) y las filas de
--     gastos facturados siguen.
--   * Fondos: solo Aprobar la OT se bloquea; observar y rechazar pasan; fund_requests no lleva candado.
--   * Horas: time_entries / timer_entries no llevan el candado (1028-217; su suite cubre la carga en rango).
--
-- DÓNDE CORRE: supabase/tests/local/run-rls-tests.sh. Transacción única, SIEMPRE hace ROLLBACK. Corre como dueño (los
-- triggers no dependen de RLS); la identidad se simula con request.jwt.claims. Salida de éxito: una NOTICE por
-- chequeo, terminando en "FINALIZED WRITE LOCK 0817-178: ALL CHECKS PASSED (rolled back)".
--
-- Fechas: siempre el día de La Paz, nunca CURRENT_DATE. Las RPC de cobranza comparan contra el día de La Paz y
-- CI corre en UTC: entre las 20:00 y las 24:00 de La Paz, CURRENT_DATE ya es mañana y la fecha sale "futura".
--
-- Fixture: ids con prefijo 0817178. E7 Finalizado, E4 activo (control), E6 Cancelado, E0 override 4 (pasa a 7 por
-- fecha con sesión), E9 derivado (pasa a 7 sin sesión), E8 Finalizado para el borrado en cascada del admin.

BEGIN;

INSERT INTO public.clients (client_id, client_legal_name, tax_id) VALUES
  ('60817178-0000-4000-8000-000000000001', 'Cliente 0817-178', 'NIT-0817178');

INSERT INTO auth.users (id) VALUES
  ('a0817178-0000-4000-8000-000000000001'),  -- gerente del encargo (no admin)
  ('a0817178-0000-4000-8000-000000000002'),  -- admin por role_key, espejo legacy 'staff'
  ('a0817178-0000-4000-8000-000000000003'),  -- analista de cobranzas
  ('a0817178-0000-4000-8000-000000000004');  -- admin por role_key y legacy (reapertura usa is_admin())

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id, city) VALUES
  ('50817178-0000-4000-8000-000000000001', 'a0817178-0000-4000-8000-000000000001', 'FL', 'Manager0817178',
   (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 'La Paz'),
  ('50817178-0000-4000-8000-000000000002', 'a0817178-0000-4000-8000-000000000002', 'FL', 'Admin0817178',
   (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 'La Paz'),
  ('50817178-0000-4000-8000-000000000003', 'a0817178-0000-4000-8000-000000000003', 'FL', 'Cobranzas0817178',
   (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 'La Paz'),
  ('50817178-0000-4000-8000-000000000004', 'a0817178-0000-4000-8000-000000000004', 'FL', 'AdminLegacy0817178',
   (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 'La Paz');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0817178-0000-4000-8000-000000000001', 'staff', 'manager'),
  ('a0817178-0000-4000-8000-000000000002', 'staff', 'admin'),
  ('a0817178-0000-4000-8000-000000000003', 'staff', 'collections_analyst'),
  ('a0817178-0000-4000-8000-000000000004', 'admin', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, role_key = EXCLUDED.role_key;

-- El fixture se carga sin los triggers de negocio (alcance de práctica, firma, recompute): interesa el estado, no el
-- circuito que lo produce. Los candados nuevos dejan pasar la carga igual (sin sesión).
SET LOCAL session_replication_role = replica;

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, status, practica, funcion,
                                work_order_required, engagement_state_override, start_date, end_date, fecha_cierre,
                                society_id, manager_id) VALUES
  ('70817178-0000-4000-8000-000000000007', '60817178-0000-4000-8000-000000000001', 'Finalizado 0817178', 'FL-07', 'active', 1, 1,
   true, 7, '2026-01-01', '2026-03-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
   '50817178-0000-4000-8000-000000000001'),
  ('70817178-0000-4000-8000-000000000004', '60817178-0000-4000-8000-000000000001', 'Activo 0817178', 'FL-04', 'active', 1, 1,
   true, NULL, '2026-01-01', '2099-12-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
   '50817178-0000-4000-8000-000000000001'),
  ('70817178-0000-4000-8000-000000000006', '60817178-0000-4000-8000-000000000001', 'Cancelado 0817178', 'FL-06', 'active', 1, 1,
   true, 6, '2026-01-01', '2099-12-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
   '50817178-0000-4000-8000-000000000001'),
  ('70817178-0000-4000-8000-000000000000', '60817178-0000-4000-8000-000000000001', 'Override 4 0817178', 'FL-00', 'active', 1, 1,
   true, 4, '2026-01-01', '2099-12-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
   '50817178-0000-4000-8000-000000000001'),
  ('70817178-0000-4000-8000-000000000009', '60817178-0000-4000-8000-000000000001', 'Derivado 0817178', 'FL-09', 'active', 1, 1,
   true, NULL, '2026-01-01', '2099-12-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
   '50817178-0000-4000-8000-000000000001'),
  ('70817178-0000-4000-8000-000000000008', '60817178-0000-4000-8000-000000000001', 'Finalizado a borrar 0817178', 'FL-08', 'active', 1, 1,
   true, 7, '2026-01-01', '2026-03-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1),
   '50817178-0000-4000-8000-000000000001');

-- Las OT Aprobadas llevan la firma (approved_by/at): wo_guard_partner_signature la exige en cada UPDATE.
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status, risk_status, approved_by, approved_at) VALUES
  ('80817178-0000-4000-8000-000000000007', '70817178-0000-4000-8000-000000000007', 'BOB', 'High', 'Approved', 'Approved', '50817178-0000-4000-8000-000000000001', now()),
  ('80817178-0000-4000-8000-000000000004', '70817178-0000-4000-8000-000000000004', 'BOB', 'High', 'Draft',    'Pending', NULL, NULL),
  ('80817178-0000-4000-8000-000000000000', '70817178-0000-4000-8000-000000000000', 'BOB', 'High', 'Approved', 'Approved', '50817178-0000-4000-8000-000000000001', now()),
  ('80817178-0000-4000-8000-000000000009', '70817178-0000-4000-8000-000000000009', 'BOB', 'High', 'Approved', 'Approved', '50817178-0000-4000-8000-000000000001', now()),
  ('80817178-0000-4000-8000-000000000008', '70817178-0000-4000-8000-000000000008', 'BOB', 'High', 'Approved', 'Approved', '50817178-0000-4000-8000-000000000001', now());

INSERT INTO public.activity_codes (activity_id, activity_code, description, practica_id, is_system, is_active)
VALUES ('a1817178-0000-4000-8000-000000000001', 'FL-0817178', 'Actividad 0817178',
        (SELECT practica_id FROM public.practicas WHERE code = 1), false, true);
INSERT INTO public.categories (category_id, category_name, display_order, rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd, practica_id)
VALUES ('c0817178-0000-4000-8000-000000000001', 'Cat 0817178', 8178, 100, 50, 15, 7,
        (SELECT practica_id FROM public.practicas WHERE code = 1));
INSERT INTO public.expense_types (expense_type_id, expense_name) VALUES
  ('ee817178-0000-4000-8000-000000000001', 'Gasto 0817178');
INSERT INTO public.skills (skill_id, name, category) VALUES
  ('d0817178-0000-4000-8000-000000000001', 'Skill 0817178', 'framework');

INSERT INTO public.wo_budget_lines (wo_line_id, wo_id, category_id, budgeted_hours, standard_rate) VALUES
  ('b0817178-0000-4000-8000-000000000007', '80817178-0000-4000-8000-000000000007', 'c0817178-0000-4000-8000-000000000001', 10, 100),
  ('b0817178-0000-4000-8000-000000000004', '80817178-0000-4000-8000-000000000004', 'c0817178-0000-4000-8000-000000000001', 10, 100),
  ('b0817178-0000-4000-8000-000000000008', '80817178-0000-4000-8000-000000000008', 'c0817178-0000-4000-8000-000000000001', 10, 100);
INSERT INTO public.wo_expense_budget (wo_id, expense_type_id) VALUES
  ('80817178-0000-4000-8000-000000000007', 'ee817178-0000-4000-8000-000000000001');
INSERT INTO public.wo_staffing_requirements (id, wo_id, category_id, staff_count) VALUES
  ('30817178-0000-4000-8000-000000000007', '80817178-0000-4000-8000-000000000007', 'c0817178-0000-4000-8000-000000000001', 2);
INSERT INTO public.wo_staffing_requirement_skills (requirement_id, skill_id, min_proficiency_level) VALUES
  ('30817178-0000-4000-8000-000000000007', 'd0817178-0000-4000-8000-000000000001', 'Advanced');
INSERT INTO public.activity_worksheets (id, engagement_id, wo_id, version) VALUES
  ('90817178-0000-4000-8000-000000000007', '70817178-0000-4000-8000-000000000007', '80817178-0000-4000-8000-000000000007', 1);
INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours) VALUES
  ('90817178-0000-4000-8000-000000000007', 'c0817178-0000-4000-8000-000000000001', 'a1817178-0000-4000-8000-000000000001', 5);
INSERT INTO public.engagement_assignments (assignment_id, engagement_id, staff_id, start_date, end_date, category_id) VALUES
  ('f1817178-0000-4000-8000-000000000007', '70817178-0000-4000-8000-000000000007', '50817178-0000-4000-8000-000000000001',
   '2026-01-01', '2026-03-31', 'c0817178-0000-4000-8000-000000000001');

-- Plan de pagos de la OT del encargo 7: dos cuotas de honorarios y una fila de gastos facturados (Cobranzas Fase 7).
INSERT INTO public.wo_payment_plan (plan_id, wo_id, payment_days, exchange_rate, exchange_rate_mode) VALUES
  ('e0817178-0000-4000-8000-000000000007', '80817178-0000-4000-8000-000000000007', 30, 6.96, 'variable');
INSERT INTO public.wo_payment_installments
  (installment_id, plan_id, wo_id, installment_number, percentage, amount, status, installment_type,
   agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate) VALUES
  ('e1817178-0000-4000-8000-000000000001', 'e0817178-0000-4000-8000-000000000007', '80817178-0000-4000-8000-000000000007',
   1, 50, 500, 'Pending', 'fee', (now() AT TIME ZONE 'America/La_Paz')::date, (now() AT TIME ZONE 'America/La_Paz')::date + 30, 6.96, 6.96),
  ('e1817178-0000-4000-8000-000000000002', 'e0817178-0000-4000-8000-000000000007', '80817178-0000-4000-8000-000000000007',
   2, 50, 500, 'Pending', 'fee', (now() AT TIME ZONE 'America/La_Paz')::date + 30, (now() AT TIME ZONE 'America/La_Paz')::date + 60, 6.96, 6.96),
  ('e1817178-0000-4000-8000-000000000003', 'e0817178-0000-4000-8000-000000000007', '80817178-0000-4000-8000-000000000007',
   3, 0, 120, 'Pending', 'expense_reimbursement', (now() AT TIME ZONE 'America/La_Paz')::date, (now() AT TIME ZONE 'America/La_Paz')::date + 30, 6.96, 6.96);

-- E8 (el que borra el admin en 7k): plan de pagos con una cuota, para que la cascada recorra las tablas con candado.
INSERT INTO public.wo_payment_plan (plan_id, wo_id, payment_days, exchange_rate, exchange_rate_mode) VALUES
  ('e0817178-0000-4000-8000-000000000008', '80817178-0000-4000-8000-000000000008', 30, 6.96, 'variable');
INSERT INTO public.wo_payment_installments
  (plan_id, wo_id, installment_number, percentage, amount, status, installment_type, agreed_invoice_date, agreed_payment_date) VALUES
  ('e0817178-0000-4000-8000-000000000008', '80817178-0000-4000-8000-000000000008', 1, 100, 1000, 'Pending', 'fee', (now() AT TIME ZONE 'America/La_Paz')::date, (now() AT TIME ZONE 'America/La_Paz')::date + 30);

-- Solicitudes de fondos sobre la OT del encargo 7, pendientes de decisión: 1..3 las decide el Gerente; la 4 un admin
-- cargado como decisor (fr_wo_guard_approval_cols solo deja decidir al manager_staff_id de la fila).
INSERT INTO public.fund_requests (fund_request_id, requester_staff_id, total_requested_amount, currency, status)
SELECT ('f0817178-0000-4000-8000-00000000000' || n)::uuid, '50817178-0000-4000-8000-000000000001', 100, 'BOB', 'pendiente_aprobacion'
FROM (VALUES ('1'), ('2'), ('3'), ('4')) AS v(n);
INSERT INTO public.fund_request_work_orders (fr_wo_id, fund_request_id, wo_id, allocated_amount, manager_staff_id, approval_status)
SELECT ('f2817178-0000-4000-8000-00000000000' || n)::uuid, ('f0817178-0000-4000-8000-00000000000' || n)::uuid,
       '80817178-0000-4000-8000-000000000007', 100,
       CASE WHEN n = '4' THEN '50817178-0000-4000-8000-000000000002' ELSE '50817178-0000-4000-8000-000000000001' END::uuid,
       'pendiente'
FROM (VALUES ('1'), ('2'), ('3'), ('4')) AS v(n);

SET LOCAL session_replication_role = origin;

CREATE FUNCTION pg_temp.as_user(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
                    CASE WHEN p_sub IS NULL THEN '' ELSE json_build_object('sub', p_sub, 'role', 'authenticated')::text END,
                    true)
$$;

-- Ejecuta una sentencia; devuelve NULL si entró o el mensaje de error si algo la rechazó.
CREATE FUNCTION pg_temp.try(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

-- Exige que la sentencia falle con el prefijo dado.
CREATE FUNCTION pg_temp.expect_locked(p_label text, p_sql text, p_prefix text DEFAULT 'ENGAGEMENT_FINALIZED_LOCKED')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_err text := pg_temp.try(p_sql);
BEGIN
  IF v_err IS NULL OR v_err NOT LIKE p_prefix || '%' THEN
    RAISE EXCEPTION 'FAIL (%): debía fallar con %, dio: %', p_label, p_prefix, coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (%): rechazado con %', p_label, p_prefix;
END $$;

-- Exige que la sentencia entre.
CREATE FUNCTION pg_temp.expect_ok(p_label text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_err text := pg_temp.try(p_sql);
BEGIN
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (%): debía entrar, dio: %', p_label, v_err;
  END IF;
  RAISE NOTICE 'OK (%): entra', p_label;
END $$;

DO $$
DECLARE
  c_mgr    text := 'a0817178-0000-4000-8000-000000000001';
  c_admin  text := 'a0817178-0000-4000-8000-000000000002';
  c_coll   text := 'a0817178-0000-4000-8000-000000000003';
  c_admin2 text := 'a0817178-0000-4000-8000-000000000004';
  v_override smallint;
  v_n integer;
BEGIN
  -- ── 1. Gerente (no admin) sobre el encargo 7 y lo que cuelga de él ──────────────────────────────────────────
  PERFORM pg_temp.as_user(c_mgr);

  PERFORM pg_temp.expect_locked('1a encargo: editar nombre',
    $q$UPDATE public.engagements SET engagement_name = 'x' WHERE engagement_id = '70817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_locked('1b encargo: borrar',
    $q$DELETE FROM public.engagements WHERE engagement_id = '70817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_locked('1c OT: editar',
    $q$UPDATE public.work_orders SET currency = 'USD' WHERE wo_id = '80817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_locked('1d presupuesto: editar línea',
    $q$UPDATE public.wo_budget_lines SET budgeted_hours = 99 WHERE wo_line_id = 'b0817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_locked('1e presupuesto: mover una línea activa a la OT finalizada',
    $q$UPDATE public.wo_budget_lines SET wo_id = '80817178-0000-4000-8000-000000000007' WHERE wo_line_id = 'b0817178-0000-4000-8000-000000000004'$q$);
  PERFORM pg_temp.expect_locked('1f gasto presupuestado: alta',
    $q$INSERT INTO public.wo_expense_budget (wo_id, expense_type_id) VALUES ('80817178-0000-4000-8000-000000000007', 'ee817178-0000-4000-8000-000000000001')$q$);
  PERFORM pg_temp.expect_locked('1g staffing de la OT: editar',
    $q$UPDATE public.wo_staffing_requirements SET staff_count = 3 WHERE id = '30817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_locked('1h staffing de la OT: borrar skill',
    $q$DELETE FROM public.wo_staffing_requirement_skills WHERE requirement_id = '30817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_locked('1i matriz: editar',
    $q$UPDATE public.activity_worksheets SET version = 2 WHERE id = '90817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_locked('1j matriz: editar celda',
    $q$UPDATE public.activity_worksheet_cells SET budget_hours = 9 WHERE worksheet_id = '90817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_locked('1k matriz: alta de matriz',
    $q$INSERT INTO public.activity_worksheets (engagement_id, version) VALUES ('70817178-0000-4000-8000-000000000007', 3)$q$);
  PERFORM pg_temp.expect_locked('1l RPC SECURITY DEFINER batch_upsert_worksheet_cells no evade el candado',
    $q$SELECT public.batch_upsert_worksheet_cells('90817178-0000-4000-8000-000000000007',
         '[{"category_id":"c0817178-0000-4000-8000-000000000001","activity_id":"a1817178-0000-4000-8000-000000000001","budget_hours":7}]'::jsonb)$q$);
  PERFORM pg_temp.expect_locked('1m asignaciones: alta directa', format(
    $q$INSERT INTO public.engagement_assignments (engagement_id, staff_id, start_date, end_date, category_id)
       VALUES ('70817178-0000-4000-8000-000000000007', %L, '2026-01-01', '2026-01-31', 'c0817178-0000-4000-8000-000000000001')$q$,
    '50817178-0000-4000-8000-000000000001'), 'EAS_ENGAGEMENT_LOCKED');

  -- ── 2. Plan de pagos: la estructura se congela ───────────────────────────────────────────────────────────────
  PERFORM pg_temp.expect_locked('2a plan: cambiar días de pago',
    $q$UPDATE public.wo_payment_plan SET payment_days = 45 WHERE plan_id = 'e0817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_locked('2b plan: borrar',
    $q$DELETE FROM public.wo_payment_plan WHERE plan_id = 'e0817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_locked('2c cuota: cambiar porcentaje',
    $q$UPDATE public.wo_payment_installments SET percentage = 40 WHERE installment_id = 'e1817178-0000-4000-8000-000000000001'$q$);
  PERFORM pg_temp.expect_locked('2d cuota: cambiar fecha pactada',
    $q$UPDATE public.wo_payment_installments SET agreed_invoice_date = agreed_invoice_date + 1 WHERE installment_id = 'e1817178-0000-4000-8000-000000000001'$q$);
  PERFORM pg_temp.expect_locked('2e cuota: borrar',
    $q$DELETE FROM public.wo_payment_installments WHERE installment_id = 'e1817178-0000-4000-8000-000000000002'$q$);
  PERFORM pg_temp.expect_locked('2f cuota: alta de honorarios',
    $q$INSERT INTO public.wo_payment_installments (plan_id, wo_id, installment_number, percentage, amount, status, installment_type)
       VALUES ('e0817178-0000-4000-8000-000000000007', '80817178-0000-4000-8000-000000000007', 4, 0, 0, 'Pending', 'fee')$q$);
  -- Review de Codex (P1): el candado resuelve el encargo por wo_id, no por plan_id. Una cuota que apunte al plan
  -- finalizado con el wo_id de una OT ACTIVA pasaría ese chequeo; la cierra el guard previo
  -- wo_payment_installments_guard_exchange_rate (plan.wo_id debe ser igual a NEW.wo_id). Si ese invariante se
  -- pierde, este caso queda en rojo y el candado debe pasar a resolver por plan_id.
  PERFORM pg_temp.expect_locked('2g cuota: plan finalizado + wo_id de una OT activa (no evade el candado)',
    $q$INSERT INTO public.wo_payment_installments (plan_id, wo_id, installment_number, percentage, amount, status, installment_type)
       VALUES ('e0817178-0000-4000-8000-000000000007', '80817178-0000-4000-8000-000000000004', 5, 0, 0, 'Pending', 'fee')$q$,
    'INSTALLMENT_WO_MISMATCH');
  PERFORM pg_temp.expect_locked('2h cuota del plan finalizado: reasignar wo_id a una OT activa',
    $q$UPDATE public.wo_payment_installments SET wo_id = '80817178-0000-4000-8000-000000000004'
       WHERE installment_id = 'e1817178-0000-4000-8000-000000000001'$q$);

  -- ── 3. Cobranza sigue: columnas de cobranza y filas de gastos ────────────────────────────────────────────────
  PERFORM pg_temp.as_user(c_coll);
  PERFORM pg_temp.expect_ok('3a cobranza: invoice_installment como collections_analyst',
    $q$SELECT public.invoice_installment('e1817178-0000-4000-8000-000000000001', 'Pending', (now() AT TIME ZONE 'America/La_Paz')::date + 30, (now() AT TIME ZONE 'America/La_Paz')::date, 6.96)$q$);
  PERFORM pg_temp.expect_ok('3b cobranza: set_installment_overdue',
    $q$SELECT public.set_installment_overdue('e1817178-0000-4000-8000-000000000001', 'Invoiced', true)$q$);
  PERFORM pg_temp.expect_ok('3b2 cobranza: quitar la mora',
    $q$SELECT public.set_installment_overdue('e1817178-0000-4000-8000-000000000001', 'Overdue', false)$q$);
  PERFORM pg_temp.expect_ok('3c cobranza: collect_installment',
    $q$SELECT public.collect_installment('e1817178-0000-4000-8000-000000000001', 'Invoiced', (now() AT TIME ZONE 'America/La_Paz')::date, 6.97)$q$);
  PERFORM pg_temp.expect_ok('3d gastos facturados: ajustar monto de la fila de gastos (directo)',
    $q$UPDATE public.wo_payment_installments SET amount = 130 WHERE installment_id = 'e1817178-0000-4000-8000-000000000003'$q$);
  PERFORM pg_temp.as_user(c_mgr);
  PERFORM pg_temp.expect_ok('3e cobranza: reschedule_installment como gerente',
    $q$SELECT public.reschedule_installment('e1817178-0000-4000-8000-000000000002', (now() AT TIME ZONE 'America/La_Paz')::date + 40, (now() AT TIME ZONE 'America/La_Paz')::date + 70,
         'el cliente pidió más plazo', (now() AT TIME ZONE 'America/La_Paz')::date + 30)$q$);
  PERFORM pg_temp.expect_ok('3f cobranza: record_installment_confirmation como gerente',
    $q$SELECT public.record_installment_confirmation('e1817178-0000-4000-8000-000000000002', true, (now() AT TIME ZONE 'America/La_Paz')::date + 40)$q$);
  PERFORM pg_temp.expect_ok('3g cobranza: columna de cobranza directa (fecha vigente de pago)',
    $q$UPDATE public.wo_payment_installments SET current_payment_date = (now() AT TIME ZONE 'America/La_Paz')::date + 75
        WHERE installment_id = 'e1817178-0000-4000-8000-000000000002'$q$);

  -- ── 4. Fondos: solo Aprobar la OT se bloquea ─────────────────────────────────────────────────────────────────
  PERFORM pg_temp.expect_locked('4a fondos: aprobar la OT',
    $q$UPDATE public.fund_request_work_orders SET approval_status = 'aprobado', manager_decided_at = now()
        WHERE fr_wo_id = 'f2817178-0000-4000-8000-000000000001'$q$);
  PERFORM pg_temp.expect_ok('4b fondos: observar la OT',
    $q$UPDATE public.fund_request_work_orders SET approval_status = 'observado', manager_notes = 'falta respaldo', manager_decided_at = now()
        WHERE fr_wo_id = 'f2817178-0000-4000-8000-000000000002'$q$);
  PERFORM pg_temp.expect_ok('4c fondos: rechazar la OT',
    $q$UPDATE public.fund_request_work_orders SET approval_status = 'rechazado', rejection_reason = 'encargo cerrado', manager_decided_at = now()
        WHERE fr_wo_id = 'f2817178-0000-4000-8000-000000000003'$q$);
  -- Desembolso, rendición y liquidación escriben fund_requests / fund_request_expenses / fund_request_events, que no
  -- llevan candado (decisión del operador 2026-11-16).
  SELECT count(*) INTO v_n FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN ('public.fund_requests'::regclass, 'public.fund_request_expenses'::regclass,
                       'public.time_entries'::regclass, 'public.timer_entries'::regclass,
                       'public.timesheet_line_approvals'::regclass, 'public.wo_installment_notes'::regclass)
     AND t.tgfoid IN ('public.block_writes_on_finalized_engagement()'::regprocedure,
                      'public.block_finalized_payment_plan_structure()'::regprocedure,
                      'public.block_finalized_engagement_edit()'::regprocedure);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'FAIL (4d): fondos/horas/notas no deben llevar el candado de Finalizado, hay % trigger(s)', v_n;
  END IF;
  RAISE NOTICE 'OK (4d): desembolso/rendición/liquidación, horas (1028-217) y notas de cobranza sin candado';

  -- ── 5. Control: el encargo activo sigue editable por el Gerente ──────────────────────────────────────────────
  PERFORM pg_temp.expect_ok('5a activo: editar OT',
    $q$UPDATE public.work_orders SET currency = 'USD' WHERE wo_id = '80817178-0000-4000-8000-000000000004'$q$);
  PERFORM pg_temp.expect_ok('5b activo: editar línea de presupuesto',
    $q$UPDATE public.wo_budget_lines SET budgeted_hours = 12 WHERE wo_line_id = 'b0817178-0000-4000-8000-000000000004'$q$);

  -- ── 6. Entrar a 7 sigue siendo legal ─────────────────────────────────────────────────────────────────────────
  -- 6a. Con sesión de Gerente: acortar el fin de un encargo override 4 lo finaliza (recompute) y el candado no lo frena.
  PERFORM pg_temp.expect_ok('6a 4 -> 7 por fecha con sesión de Gerente',
    $q$UPDATE public.engagements SET end_date = (now() AT TIME ZONE 'America/La_Paz')::date - 1 WHERE engagement_id = '70817178-0000-4000-8000-000000000000'$q$);
  SELECT engagement_state_override INTO v_override FROM public.engagements WHERE engagement_id = '70817178-0000-4000-8000-000000000000';
  IF v_override IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'FAIL (6a): el encargo debía quedar en 7, quedó en %', v_override;
  END IF;
  PERFORM pg_temp.expect_locked('6b ya en 7: el Gerente no lo edita más',
    $q$UPDATE public.engagements SET engagement_name = 'y' WHERE engagement_id = '70817178-0000-4000-8000-000000000000'$q$);

  -- 6c. Sin sesión (cron / service_role): NULL -> 7 por fecha, y luego puede seguir escribiendo.
  PERFORM pg_temp.as_user(NULL);
  PERFORM pg_temp.expect_ok('6c NULL -> 7 sin sesión',
    $q$UPDATE public.engagements SET end_date = (now() AT TIME ZONE 'America/La_Paz')::date - 1 WHERE engagement_id = '70817178-0000-4000-8000-000000000009'$q$);
  SELECT engagement_state_override INTO v_override FROM public.engagements WHERE engagement_id = '70817178-0000-4000-8000-000000000009';
  IF v_override IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'FAIL (6c): el encargo debía quedar en 7, quedó en %', v_override;
  END IF;
  PERFORM pg_temp.expect_ok('6d sin sesión: editar un 7',
    $q$UPDATE public.engagements SET engagement_name = 'cron' WHERE engagement_id = '70817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_ok('6e sin sesión: editar la OT de un 7',
    $q$UPDATE public.work_orders SET currency = 'BOB' WHERE wo_id = '80817178-0000-4000-8000-000000000007'$q$);

  -- ── 7. Admin por role_key (espejo legacy 'staff') ────────────────────────────────────────────────────────────
  PERFORM pg_temp.as_user(c_admin);
  PERFORM pg_temp.expect_ok('7a admin: editar el encargo 7',
    $q$UPDATE public.engagements SET engagement_name = 'admin' WHERE engagement_id = '70817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_ok('7b admin: editar la OT del 7',
    $q$UPDATE public.work_orders SET currency = 'USD' WHERE wo_id = '80817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_ok('7c admin: estructura del plan del 7',
    $q$UPDATE public.wo_payment_plan SET payment_days = 45 WHERE plan_id = 'e0817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_ok('7d admin: matriz del 7',
    $q$UPDATE public.activity_worksheet_cells SET budget_hours = 9 WHERE worksheet_id = '90817178-0000-4000-8000-000000000007'$q$);
  PERFORM pg_temp.expect_ok('7e admin (decisor de la fila): aprobar la OT en fondos',
    $q$UPDATE public.fund_request_work_orders SET approval_status = 'aprobado', manager_decided_at = now()
        WHERE fr_wo_id = 'f2817178-0000-4000-8000-000000000004'$q$);

  -- 7f/7g. Asignaciones: espejo de la RPC (6/7 rechazan también al admin); el borrado del admin pasa.
  PERFORM pg_temp.expect_locked('7f admin: alta de asignación en el 7', format(
    $q$INSERT INTO public.engagement_assignments (engagement_id, staff_id, start_date, end_date, category_id)
       VALUES ('70817178-0000-4000-8000-000000000007', %L, '2026-01-01', '2026-01-31', 'c0817178-0000-4000-8000-000000000001')$q$,
    '50817178-0000-4000-8000-000000000002'), 'EAS_ENGAGEMENT_LOCKED');
  PERFORM pg_temp.expect_locked('7g admin: alta de asignación en un Cancelado', format(
    $q$INSERT INTO public.engagement_assignments (engagement_id, staff_id, start_date, end_date, category_id)
       VALUES ('70817178-0000-4000-8000-000000000006', %L, '2026-01-01', '2026-01-31', 'c0817178-0000-4000-8000-000000000001')$q$,
    '50817178-0000-4000-8000-000000000002'), 'EAS_ENGAGEMENT_LOCKED');
  PERFORM pg_temp.expect_ok('7h admin: borrar una asignación del 7',
    $q$DELETE FROM public.engagement_assignments WHERE assignment_id = 'f1817178-0000-4000-8000-000000000007'$q$);

  -- 7i. Reapertura: extender el fin de un 7 (admin con espejo legacy, que es lo que exige recompute) lo saca del 7.
  PERFORM pg_temp.as_user(c_admin2);
  PERFORM pg_temp.expect_ok('7i admin: reabrir extendiendo end_date',
    $q$UPDATE public.engagements SET end_date = '2099-12-31' WHERE engagement_id = '70817178-0000-4000-8000-000000000000'$q$);
  SELECT engagement_state_override INTO v_override FROM public.engagements WHERE engagement_id = '70817178-0000-4000-8000-000000000000';
  IF v_override = 7 THEN
    RAISE EXCEPTION 'FAIL (7i): la reapertura debía sacar al encargo del 7';
  END IF;
  PERFORM pg_temp.as_user(c_mgr);
  PERFORM pg_temp.expect_ok('7j reabierto: el Gerente vuelve a editar',
    $q$UPDATE public.engagements SET engagement_name = 'reabierto' WHERE engagement_id = '70817178-0000-4000-8000-000000000000'$q$);

  -- 7k. Borrado del admin de un encargo 7 con OT, presupuesto y plan: la cascada pasa.
  PERFORM pg_temp.as_user(c_admin);
  PERFORM pg_temp.expect_ok('7k admin: borrar un 7 con OT, presupuesto y plan (cascada)',
    $q$DELETE FROM public.engagements WHERE engagement_id = '70817178-0000-4000-8000-000000000008'$q$);
  IF EXISTS (SELECT 1 FROM public.work_orders WHERE wo_id = '80817178-0000-4000-8000-000000000008') THEN
    RAISE EXCEPTION 'FAIL (7k): la OT del encargo borrado debía irse en cascada';
  END IF;

  RAISE NOTICE 'FINALIZED WRITE LOCK 0817-178: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
