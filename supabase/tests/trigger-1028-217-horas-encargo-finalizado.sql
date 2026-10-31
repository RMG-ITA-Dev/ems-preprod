-- BUG 1028-217 — check_wo_approved() acepta horas en un encargo Finalizado (7) dentro de su rango
-- (bugs/1028-217/plan_v2.md).
--
-- Regla: la fecha manda, no el estado. Un Finalizado (manual o por cron) que estuvo aprobado (OT
-- Aprobada o administrativo) admite horas en las fechas que cubre; check_time_entry_engagement_dates
-- sigue rechazando las fechas fuera del rango. Cancelado (6) y un 7 sin end_date siguen bloqueados.
--
-- DÓNDE CORRE: supabase/tests/local/run-rls-tests.sh. Transacción única, SIEMPRE hace ROLLBACK.
-- Corre como dueño (los triggers BEFORE de time_entries no dependen de RLS). Salida de éxito: una
-- NOTICE por chequeo, terminando en "HORAS ENCARGO FINALIZADO: ALL CHECKS PASSED (rolled back)".
--
-- Fixture: ids con prefijo 1028217; un solo día de encargo, martes 10/03/2026 (semana del 09/03).

BEGIN;

INSERT INTO public.clients (client_id, client_legal_name, tax_id) VALUES
  ('61028217-0000-4000-8000-000000000001', 'Cliente 1028-217', 'NIT-1028217');

INSERT INTO auth.users (id) VALUES ('a1028217-0000-4000-8000-000000000001');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id) VALUES
  ('51028217-0000-4000-8000-000000000001', 'a1028217-0000-4000-8000-000000000001', 'LE', 'Staff1028217',
   (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

-- E1 administrativo SIN override: como su fin ya pasó, recompute_engagement_finalization() lo deja en 7
-- al insertarlo (el camino real del bug). E2/E3 con OT, 7 fijado a mano. E4 Cancelado. E5 7 sin fechas.
-- E6 override 4 (regresión): fin en el FUTURO, si no recompute_engagement_finalization() lo pasa a 7 al insertarlo.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, status,
                                work_order_required, engagement_state_override, start_date, end_date,
                                fecha_cierre, society_id) VALUES
  ('71028217-0000-4000-8000-000000000001', '61028217-0000-4000-8000-000000000001', 'Capacitación 1028217', 'FD-01', 'active',
   false, NULL, '2026-03-10', '2026-03-10', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('71028217-0000-4000-8000-000000000002', '61028217-0000-4000-8000-000000000001', 'OT Aprobada 1028217', 'FD-02', 'active',
   true, 7, '2026-03-10', '2026-03-10', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('71028217-0000-4000-8000-000000000003', '61028217-0000-4000-8000-000000000001', 'OT Pendiente 1028217', 'FD-03', 'active',
   true, 7, '2026-03-10', '2026-03-10', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('71028217-0000-4000-8000-000000000004', '61028217-0000-4000-8000-000000000001', 'Cancelado 1028217', 'FD-04', 'active',
   false, 6, '2026-03-10', '2026-03-10', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('71028217-0000-4000-8000-000000000005', '61028217-0000-4000-8000-000000000001', 'Finalizado sin fechas 1028217', 'FD-05', 'active',
   false, 7, NULL, NULL, '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('71028217-0000-4000-8000-000000000006', '61028217-0000-4000-8000-000000000001', 'Override Aprobado 1028217', 'FD-06', 'active',
   true, 4, '2026-03-10', '2099-12-31', '2026-12-31', (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status, risk_status) VALUES
  ('81028217-0000-4000-8000-000000000002', '71028217-0000-4000-8000-000000000002', 'BOB', 'High', 'Approved', 'Approved'),
  ('81028217-0000-4000-8000-000000000003', '71028217-0000-4000-8000-000000000003', 'BOB', 'High', 'Pending_Approval', 'Pending');

INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id)
VALUES ('FD-1028217', 'Harness Activity 1028217', true, NULL)
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;

INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year) VALUES
  ('b1028217-0000-4000-8000-000000000001', '51028217-0000-4000-8000-000000000001', '2026-03-09', 11, 2026);

-- Intenta una hora; devuelve NULL si entró o el mensaje de error si un trigger la rechazó.
CREATE FUNCTION pg_temp.try_hour(p_engagement uuid, p_date date) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked, hours_logged, period_id, is_forecast)
  VALUES ('51028217-0000-4000-8000-000000000001', p_engagement,
          (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'FD-1028217' AND is_active),
          p_date, 1, 'b1028217-0000-4000-8000-000000000001', false);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

DO $$
DECLARE
  v_err text;
  v_override smallint;
BEGIN
  -- 0. El fixture reproduce el bug: el administrativo de un día nace Finalizado.
  SELECT engagement_state_override INTO v_override FROM public.engagements
   WHERE engagement_id = '71028217-0000-4000-8000-000000000001';
  IF v_override IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'FIXTURE: el encargo de un día con fin vencido debía nacer en 7, quedó en %', v_override;
  END IF;
  RAISE NOTICE 'OK (0): encargo de un día con fin vencido nace Finalizado (7)';

  -- 1. Finalizado administrativo: su único día entra.
  v_err := pg_temp.try_hour('71028217-0000-4000-8000-000000000001', '2026-03-10');
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (1): hora en el día del Finalizado administrativo rechazada: %', v_err;
  END IF;
  RAISE NOTICE 'OK (1): Finalizado administrativo acepta horas en su fecha';

  -- 2/3. Fuera del rango (día siguiente y día anterior) sigue rechazado por el rango.
  v_err := pg_temp.try_hour('71028217-0000-4000-8000-000000000001', '2026-03-11');
  IF v_err IS NULL OR v_err NOT LIKE 'ENGAGEMENT_DATE_RANGE%' THEN
    RAISE EXCEPTION 'FAIL (2): el día siguiente al fin debía fallar con ENGAGEMENT_DATE_RANGE, dio: %', coalesce(v_err, 'OK');
  END IF;
  v_err := pg_temp.try_hour('71028217-0000-4000-8000-000000000001', '2026-03-09');
  IF v_err IS NULL OR v_err NOT LIKE 'ENGAGEMENT_DATE_RANGE%' THEN
    RAISE EXCEPTION 'FAIL (3): el día anterior al inicio debía fallar con ENGAGEMENT_DATE_RANGE, dio: %', coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (2/3): fuera de su rango el Finalizado sigue rechazado';

  -- 4. Finalizado con OT Aprobada: entra.
  v_err := pg_temp.try_hour('71028217-0000-4000-8000-000000000002', '2026-03-10');
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (4): hora en Finalizado con OT Aprobada rechazada: %', v_err;
  END IF;
  RAISE NOTICE 'OK (4): Finalizado con OT Aprobada acepta horas en su fecha';

  -- 5. Finalizado que nunca se aprobó (OT Pendiente): rechazado por el chequeo de OT.
  v_err := pg_temp.try_hour('71028217-0000-4000-8000-000000000003', '2026-03-10');
  IF v_err IS NULL OR v_err NOT LIKE 'Cannot log time: Work Order is not approved%' THEN
    RAISE EXCEPTION 'FAIL (5): Finalizado con OT Pendiente debía rechazarse por OT, dio: %', coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (5): Finalizado sin OT aprobada sigue rechazado';

  -- 6. Cancelado (6): rechazado.
  v_err := pg_temp.try_hour('71028217-0000-4000-8000-000000000004', '2026-03-10');
  IF v_err IS NULL OR v_err NOT LIKE '%override 6%' THEN
    RAISE EXCEPTION 'FAIL (6): Cancelado debía rechazarse por estado, dio: %', coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (6): Cancelado sigue rechazado';

  -- 7. Finalizado sin end_date: rechazado (no hay rango que acote las horas).
  v_err := pg_temp.try_hour('71028217-0000-4000-8000-000000000005', '2026-03-10');
  IF v_err IS NULL OR v_err NOT LIKE '%override 7%' THEN
    RAISE EXCEPTION 'FAIL (7): Finalizado sin end_date debía rechazarse por estado, dio: %', coalesce(v_err, 'OK');
  END IF;
  RAISE NOTICE 'OK (7): Finalizado sin end_date sigue rechazado';

  -- 8. Regresión: override Aprobado (4) sigue entrando sin OT aprobada.
  v_err := pg_temp.try_hour('71028217-0000-4000-8000-000000000006', '2026-03-10');
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL (8): override 4 debía aceptar horas, dio: %', v_err;
  END IF;
  RAISE NOTICE 'OK (8): override Aprobado (4) sin cambios';

  RAISE NOTICE 'HORAS ENCARGO FINALIZADO: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
