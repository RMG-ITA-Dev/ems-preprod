-- Fixture de horas sintético para completar la validación RLS por Data API de xcdcxtduotwgwmhxvsiz.
-- No envía boletas, no crea solicitudes de fondo y no actualiza ninguna fila: evita disparadores
-- de notificación. Precondición: rls-target-xcdc-fixture-business.sql aplicado con éxito.

BEGIN;

INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id)
VALUES ('RLSHRS', 'Actividad sintética de regresión RLS', true, NULL)
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;

-- P1: semisenior, dos encargos; P2: socio, un encargo. Ambos sin submitted_at.
INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year) VALUES
  ('b0c0dc00-0000-4000-8000-000000000001',
   (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-semisenior@ruizmier.com'),
   DATE '2026-10-05', 41, 2026),
  ('b0c0dc00-0000-4000-8000-000000000002',
   (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-partner@ruizmier.com'),
   DATE '2026-10-05', 41, 2026)
ON CONFLICT DO NOTHING;

INSERT INTO public.time_entries (
  time_id, staff_id, engagement_id, activity_id, date_worked, hours_logged, period_id, is_forecast
)
VALUES
(
  'd0c0dc00-0000-4000-8000-000000000001',
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-semisenior@ruizmier.com'),
  'e0c0dc00-0000-4000-8000-000000000001',
  (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'RLSHRS'),
  DATE '2026-10-06', 4, 'b0c0dc00-0000-4000-8000-000000000001', false
),
(
  'd0c0dc00-0000-4000-8000-000000000002',
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-semisenior@ruizmier.com'),
  'e0c0dc00-0000-4000-8000-000000000002',
  (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'RLSHRS'),
  DATE '2026-10-07', 3, 'b0c0dc00-0000-4000-8000-000000000001', false
),
(
  'd0c0dc00-0000-4000-8000-000000000003',
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-partner@ruizmier.com'),
  'e0c0dc00-0000-4000-8000-000000000001',
  (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'RLSHRS'),
  DATE '2026-10-08', 2, 'b0c0dc00-0000-4000-8000-000000000002', false
)
ON CONFLICT DO NOTHING;

INSERT INTO public.timesheet_line_approvals (
  approval_id, period_id, engagement_id, activity_id, status, approved_by, approved_at
)
VALUES
(
  'f0c0dc00-0000-4000-8000-000000000001',
  'b0c0dc00-0000-4000-8000-000000000001', 'e0c0dc00-0000-4000-8000-000000000001',
  (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'RLSHRS'),
  'pending', NULL, NULL
),
(
  'f0c0dc00-0000-4000-8000-000000000002',
  'b0c0dc00-0000-4000-8000-000000000001', 'e0c0dc00-0000-4000-8000-000000000002',
  (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'RLSHRS'),
  'approved',
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-accounting-manager@ruizmier.com'), now()
),
(
  'f0c0dc00-0000-4000-8000-000000000003',
  'b0c0dc00-0000-4000-8000-000000000002', 'e0c0dc00-0000-4000-8000-000000000001',
  (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'RLSHRS'),
  'pending', NULL, NULL
)
ON CONFLICT DO NOTHING;

INSERT INTO public.timer_entries (
  timer_id, staff_id, engagement_id, activity_id, started_at, ended_at, duration_minutes
)
VALUES (
  'c0c0dc00-0000-4000-8000-000000000001',
  (SELECT staff_id FROM public.staff WHERE email = 'rls-xcdc-20261016-semisenior@ruizmier.com'),
  'e0c0dc00-0000-4000-8000-000000000001',
  (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'RLSHRS'),
  now() - interval '30 minutes', now(), 30
)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_entries int;
  v_periods int;
  v_lines int;
  v_timers int;
  v_pending int;
BEGIN
  SELECT count(*) INTO v_entries FROM public.time_entries WHERE time_id::text LIKE 'd0c0dc00-%';
  SELECT count(*) INTO v_periods FROM public.timesheet_periods WHERE period_id::text LIKE 'b0c0dc00-%';
  SELECT count(*) INTO v_lines FROM public.timesheet_line_approvals WHERE approval_id::text LIKE 'f0c0dc00-%';
  SELECT count(*) INTO v_timers FROM public.timer_entries WHERE timer_id::text LIKE 'c0c0dc00-%';
  SELECT count(*) INTO v_pending FROM public.timesheet_periods WHERE period_id::text LIKE 'b0c0dc00-%' AND submitted_at IS NOT NULL;
  IF v_entries <> 3 OR v_periods <> 2 OR v_lines <> 3 OR v_timers <> 1 OR v_pending <> 0 THEN
    RAISE EXCEPTION 'RLS hours fixture FAIL: horas %, períodos %, líneas %, timers %, períodos enviados %',
      v_entries, v_periods, v_lines, v_timers, v_pending;
  END IF;
  RAISE NOTICE 'RLS hours fixture PASS: 3 horas, 2 períodos no enviados, 3 líneas y 1 timer sintéticos';
END $$;

COMMIT;
