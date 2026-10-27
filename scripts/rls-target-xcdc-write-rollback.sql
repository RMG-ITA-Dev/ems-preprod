-- Validación RLS de escrituras para el proyecto controlado xcdcxtduotwgwmhxvsiz.
-- Todas las mutaciones ocurren bajo el rol authenticated y terminan con ROLLBACK:
-- no persiste filas, no cambia los fixtures y no debe disparar notificaciones persistentes.
-- Precondición: rls-target-xcdc-fixture-{staff,business,hours,budgets}.sql aplicados.

BEGIN;
SET LOCAL ROLE authenticated;

-- Semisenior: puede crear, actualizar y borrar únicamente una hora propia.
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT auth_user_id::text FROM public.staff WHERE email = 'rls-xcdc-20261016-semisenior@ruizmier.com'),
  true
);
INSERT INTO public.time_entries (
  time_id, staff_id, engagement_id, activity_id, date_worked, hours_logged, period_id, is_forecast
) VALUES (
  'd9c0dc00-0000-4000-8000-000000000001',
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-semisenior@ruizmier.com'),
  'e0c0dc00-0000-4000-8000-000000000001',
  (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'RLSHRS'),
  DATE '2026-10-09', 1, 'b0c0dc00-0000-4000-8000-000000000001', false
);
DO $$
DECLARE v_rows int;
BEGIN
  UPDATE public.time_entries SET hours_logged = 1.5
   WHERE time_id = 'd9c0dc00-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS WRITE FAIL: SEMISENIOR no pudo actualizar su propia hora (% fila/s)', v_rows;
  END IF;
  DELETE FROM public.time_entries WHERE time_id = 'd9c0dc00-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS WRITE FAIL: SEMISENIOR no pudo borrar su propia hora (% fila/s)', v_rows;
  END IF;

  UPDATE public.time_entries SET hours_logged = 9
   WHERE time_id = 'd0c0dc00-0000-4000-8000-000000000003'; -- hora de SOCIO
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'RLS WRITE FAIL: SEMISENIOR modificó una hora ajena (% fila/s)', v_rows;
  END IF;
  RAISE NOTICE 'PASS write 1: SEMISENIOR administra su hora y no modifica hora ajena';
END $$;

-- El mismo dueño controla su timer; otro rol no puede tocarlo.
DO $$
DECLARE v_rows int;
BEGIN
  UPDATE public.timer_entries SET description = 'RLS-XCDC rollback mutation'
   WHERE timer_id = 'c0c0dc00-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS WRITE FAIL: SEMISENIOR no pudo actualizar su propio timer (% fila/s)', v_rows;
  END IF;
END $$;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT auth_user_id::text FROM public.staff WHERE email = 'rls-xcdc-20261016-partner@ruizmier.com'),
  true
);
DO $$
DECLARE v_rows int;
BEGIN
  UPDATE public.timer_entries SET description = 'no autorizado'
   WHERE timer_id = 'c0c0dc00-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'RLS WRITE FAIL: SOCIO modificó timer ajeno (% fila/s)', v_rows;
  END IF;
  RAISE NOTICE 'PASS write 2: timer solo modificable por su dueño';
END $$;

-- Gerente del Encargo Alfa: puede crear/borrar presupuesto y actualizar su hoja.
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT auth_user_id::text FROM public.staff WHERE email = 'rls-xcdc-20261016-manager@ruizmier.com'),
  true
);
INSERT INTO public.wo_budget_lines (wo_line_id, wo_id, category_id, budgeted_hours, standard_rate)
VALUES (
  'a9c0dc00-0000-4000-8000-000000000001',
  '40c0dc00-0000-4000-8000-000000000001',
  (SELECT c.category_id FROM public.categories c JOIN public.practicas p ON p.practica_id = c.practica_id
    WHERE p.code = 1 ORDER BY c.display_order, c.category_id LIMIT 1),
  1, 100
);
DO $$
DECLARE v_rows int;
BEGIN
  DELETE FROM public.wo_budget_lines WHERE wo_line_id = 'a9c0dc00-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS WRITE FAIL: GERENTE no pudo borrar su línea de presupuesto (% fila/s)', v_rows;
  END IF;
  UPDATE public.activity_worksheet_cells SET budget_hours = budget_hours + 1
   WHERE id = 'a1c0dc00-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS WRITE FAIL: GERENTE no pudo actualizar la hoja de su encargo (% fila/s)', v_rows;
  END IF;
  RAISE NOTICE 'PASS write 3: GERENTE administra presupuesto y hoja de su encargo';
END $$;

-- Asistente: incluso estando asignado al Encargo Alfa, no puede escribir presupuesto.
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT auth_user_id::text FROM public.staff WHERE email = 'rls-xcdc-20261016-assistant@ruizmier.com'),
  true
);
DO $$
BEGIN
  BEGIN
    INSERT INTO public.wo_budget_lines (wo_line_id, wo_id, category_id, budgeted_hours, standard_rate)
    VALUES (
      'a9c0dc00-0000-4000-8000-000000000003',
      '40c0dc00-0000-4000-8000-000000000001',
      (SELECT c.category_id FROM public.categories c JOIN public.practicas p ON p.practica_id = c.practica_id
        WHERE p.code = 1 ORDER BY c.display_order, c.category_id LIMIT 1),
      1, 100
    );
    RAISE EXCEPTION 'RLS WRITE FAIL: ASISTENTE pudo insertar presupuesto' USING ERRCODE = 'P0001';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS write 4: ASISTENTE no puede insertar presupuesto';
  END;
END $$;

-- Contabilidad gestiona el Encargo Beta pero no puede modificar el presupuesto del Alfa.
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT auth_user_id::text FROM public.staff WHERE email = 'rls-xcdc-20261016-accounting-manager@ruizmier.com'),
  true
);
DO $$
DECLARE v_rows int;
BEGIN
  UPDATE public.wo_budget_lines SET budgeted_hours = 99
   WHERE wo_line_id = 'a2c0dc00-0000-4000-8000-000000000001'; -- Alfa
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'RLS WRITE FAIL: GERENTE_CONTA modificó presupuesto ajeno (% fila/s)', v_rows;
  END IF;
  RAISE NOTICE 'PASS write 5: GERENTE_CONTA no modifica el presupuesto de otro encargo';
END $$;

-- Un analista sin alcance no puede modificar un período de otra persona.
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT auth_user_id::text FROM public.staff WHERE email = 'rls-xcdc-20261016-accounting@ruizmier.com'),
  true
);
DO $$
DECLARE v_rows int;
BEGIN
  UPDATE public.timesheet_periods SET total_hours = total_hours + 1
   WHERE period_id = 'b0c0dc00-0000-4000-8000-000000000001'; -- período de SEMISENIOR
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'RLS WRITE FAIL: ANALISTA_CONT modificó período ajeno (% fila/s)', v_rows;
  END IF;
  RAISE NOTICE 'PASS write 6: ANALISTA_CONT no modifica período ajeno';
END $$;

-- Administrador: conserva la facultad explícita de modificar una hora de otra persona.
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT auth_user_id::text FROM public.staff WHERE email = 'rls-xcdc-20261016-admin@ruizmier.com'),
  true
);
DO $$
DECLARE v_rows int;
BEGIN
  UPDATE public.time_entries SET hours_logged = 2.5
   WHERE time_id = 'd0c0dc00-0000-4000-8000-000000000003'; -- hora de SOCIO
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'RLS WRITE FAIL: ADMIN no pudo modificar una hora ajena (% fila/s)', v_rows;
  END IF;
  RAISE NOTICE 'PASS write 7: ADMIN conserva modificación de hora ajena';
END $$;

ROLLBACK;

\echo RLS WRITE ROLLBACK: ALL CHECKS PASSED; no se persistió ninguna mutación
