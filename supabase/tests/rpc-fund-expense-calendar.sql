-- Calendario de gastos de Solicitud de Fondos (docs/plan-contabilidad-gastos.md, Fase 3).
-- Run via supabase/tests/local/run-rls-tests.sh against the disposable scratch database.
-- Single transaction, ALWAYS rolls back.
--
-- "Hoy" se fija con el GUC app.fund_today (fund_today() solo lo respeta en una sesión de
-- superusuario, como la del harness). Mes elegido: noviembre 2026 → fecha fin 03/12/2026,
-- fin de revisión 05/12/2026. Desembolso: 10/11/2026.
--
-- Under test:
--   1. Ventana del solicitante: fecha del gasto entre el día del desembolso y hoy; nada después
--      de la fecha fin (registrar, editar, enviar, reenviar). Varios lotes.
--   2. Devolución de Contabilidad con edición completa; devolver solo hasta la fecha fin,
--      rechazar solo después; nada después del día 5.
--   3. Gerente: no decide después de la fecha fin.
--   4. Job fund_request_run_deadlines: aprobación automática del gerente (día 3), vencidos, y
--      aprobación automática de Contabilidad (día 5) sin penalidad; idempotente; bitácora con
--      actor NULL (Sistema).
--   5. Liquidación: vencido y rechazado (después de la fecha fin) no bloquean ni cuentan.
--   6. Desembolso con fecha fin vencida exige un mes nuevo válido; mes de la solicitud: el
--      actual o hasta 5 más adelante.
--
-- Success output ends with "FUND EXPENSE CALENDAR: ALL CHECKS PASSED (rolled back)".

BEGIN;

SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a7d00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'fund-cal-' || n || '@ruizmier.com', 'x', now(), now(), now(),
           '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 3) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 1 solicitante · 2 gerente de la OT · 3 Analista de Contabilidad
INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a7d00000-0000-4000-8000-000000000001', 'staff',   'assistant'),
  ('a7d00000-0000-4000-8000-000000000002', 'manager', 'manager'),
  ('a7d00000-0000-4000-8000-000000000003', 'senior',  'accounting_analyst')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id, weekly_capacity_hours, hire_date, city)
SELECT ('57d00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a7d00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'FCAL', 'Staff' || n, true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'
  FROM generate_series(1, 3) n;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c7d00000-0000-4000-8000-000000000001', 'FCAL Cliente SA', 'FCAL-7D01');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                manager_id, created_by_staff_id, fecha_cierre, society_id)
VALUES ('e7d00000-0000-4000-8000-000000000001', 'c7d00000-0000-4000-8000-000000000001',
        'FCAL Encargo', '7D01', '57d00000-0000-4000-8000-000000000002',
        '57d00000-0000-4000-8000-000000000002', '2027-12-31',
        (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status)
VALUES ('d7d00000-0000-4000-8000-000000000001', 'e7d00000-0000-4000-8000-000000000001',
        'BOB', 'High', 'Approved');

-- f..1: fondos entregados el 10/11, mes noviembre. f..2: aprobada sin desembolsar, mes octubre
-- (fecha fin 03/11, ya vencida el 04/12).
INSERT INTO public.fund_requests (fund_request_id, requester_staff_id, total_requested_amount,
                                  currency, status, expense_period_month, total_disbursed_amount,
                                  disbursed_at)
VALUES
  ('f7d00000-0000-4000-8000-000000000001', '57d00000-0000-4000-8000-000000000001', 1000, 'BOB',
   'fondos_entregados', '2026-11-01', 1000, '2026-11-10 15:20:00-04'),
  ('f7d00000-0000-4000-8000-000000000002', '57d00000-0000-4000-8000-000000000001', 300, 'BOB',
   'aprobado_gerente', '2026-10-01', 0, NULL);

INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount, approval_status)
VALUES ('f7d00000-0000-4000-8000-000000000001', 'd7d00000-0000-4000-8000-000000000001', 1000, 'aprobado'),
       ('f7d00000-0000-4000-8000-000000000002', 'd7d00000-0000-4000-8000-000000000001', 300, 'aprobado');

CREATE FUNCTION pg_temp.as_user(p_n int) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
           json_build_object('sub', 'a7d00000-0000-4000-8000-' || lpad(p_n::text, 12, '0'),
                             'role', 'authenticated')::text, true)
$$;

CREATE FUNCTION pg_temp.on_day(p_day text) RETURNS void
LANGUAGE sql AS $$ SELECT set_config('app.fund_today', p_day, true) $$;

-- Ejecuta la sentencia y devuelve el error (NULL si no falló).
CREATE FUNCTION pg_temp.err(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

CREATE FUNCTION pg_temp.expect_err(p_label text, p_sql text, p_like text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  m text := pg_temp.err(p_sql);
BEGIN
  IF m IS NULL OR m NOT LIKE p_like THEN
    RAISE EXCEPTION 'CALENDAR FAIL — %: se esperaba error "%", se obtuvo %', p_label, p_like, COALESCE(m, 'éxito');
  END IF;
END $$;

CREATE FUNCTION pg_temp.expect_ok(p_label text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  m text := pg_temp.err(p_sql);
BEGIN
  IF m IS NOT NULL THEN
    RAISE EXCEPTION 'CALENDAR FAIL — %: %', p_label, m;
  END IF;
END $$;

CREATE FUNCTION pg_temp.add_expense(p_id text, p_date text, p_end text DEFAULT NULL) RETURNS text
LANGUAGE sql AS $$
  SELECT format(
    $f$INSERT INTO public.fund_request_expenses (fre_id, fund_request_id, wo_id, expense_date,
         expense_date_end, amount, currency, status)
       VALUES (%L, 'f7d00000-0000-4000-8000-000000000001', 'd7d00000-0000-4000-8000-000000000001',
               %L, %L, 100, 'BOB', 'borrador')$f$, p_id, p_date, p_end)
$$;

DO $$
DECLARE
  c_fr CONSTANT uuid := 'f7d00000-0000-4000-8000-000000000001';
  v jsonb;
  r record;
  n int;
BEGIN
  -- ── 1. Ventana del solicitante (hoy 15/11) ───────────────────────────────
  PERFORM pg_temp.on_day('2026-11-15');
  PERFORM pg_temp.as_user(1);

  PERFORM pg_temp.expect_err('gasto anterior al desembolso',
    pg_temp.add_expense('b7d00000-0000-4000-8000-0000000000f1', '2026-11-09'),
    '%debe estar entre el 2026-11-10 y el 2026-11-15%');
  PERFORM pg_temp.expect_err('gasto con fecha futura',
    pg_temp.add_expense('b7d00000-0000-4000-8000-0000000000f2', '2026-11-16'),
    '%debe estar entre%');
  PERFORM pg_temp.expect_err('rango que termina en el futuro',
    pg_temp.add_expense('b7d00000-0000-4000-8000-0000000000f3', '2026-11-10', '2026-11-16'),
    '%debe estar entre%');
  PERFORM pg_temp.expect_ok('gasto del día del desembolso',
    pg_temp.add_expense('b7d00000-0000-4000-8000-000000000001', '2026-11-10'));
  RAISE NOTICE 'PASS — la fecha del gasto va del día del desembolso a hoy';

  -- Varios lotes: e1 enviado, e2 registrado y enviado mientras e1 sigue pendiente.
  UPDATE public.fund_request_expenses SET status = 'pendiente_aprobacion', submitted_at = now()
   WHERE fre_id = 'b7d00000-0000-4000-8000-000000000001';
  PERFORM pg_temp.expect_ok('segundo lote',
    pg_temp.add_expense('b7d00000-0000-4000-8000-000000000002', '2026-11-12'));
  UPDATE public.fund_request_expenses SET status = 'pendiente_aprobacion', submitted_at = now()
   WHERE fre_id = 'b7d00000-0000-4000-8000-000000000002';
  RAISE NOTICE 'PASS — se pueden enviar varios lotes';

  -- ── 2. Gerente aprueba; Contabilidad devuelve; el solicitante corrige TODO ──
  PERFORM pg_temp.as_user(2);
  UPDATE public.fund_request_expenses SET status = 'aprobado_gerente', manager_decided_at = now()
   WHERE fre_id IN ('b7d00000-0000-4000-8000-000000000001', 'b7d00000-0000-4000-8000-000000000002');

  PERFORM pg_temp.as_user(3);
  PERFORM pg_temp.expect_err('rechazar antes de la fecha fin',
    $q$SELECT public.fund_request_expense_review('b7d00000-0000-4000-8000-000000000002', 'reject', 'x')$q$,
    '%se devuelve al solicitante%');
  PERFORM public.fund_request_expense_review('b7d00000-0000-4000-8000-000000000002', 'return', 'NIT mal');

  PERFORM pg_temp.as_user(1);
  PERFORM pg_temp.expect_ok('corregir todos los campos de un gasto devuelto',
    $q$UPDATE public.fund_request_expenses
          SET amount = 80, supplier_tax_id = '999', expense_date = '2026-11-11'
        WHERE fre_id = 'b7d00000-0000-4000-8000-000000000002'$q$);
  UPDATE public.fund_request_expenses SET status = 'aprobado_gerente', returned_by_assistant = false
   WHERE fre_id = 'b7d00000-0000-4000-8000-000000000002';
  RAISE NOTICE 'PASS — el gasto devuelto se corrige completo y vuelve directo a Contabilidad';

  -- Gastos que quedan pendientes para el job: e3 enviado al gerente, e4 borrador,
  -- e5 devuelto sin reenviar.
  PERFORM pg_temp.on_day('2026-12-03');
  PERFORM pg_temp.expect_ok('gasto el día de la fecha fin',
    pg_temp.add_expense('b7d00000-0000-4000-8000-000000000003', '2026-12-03'));
  UPDATE public.fund_request_expenses SET status = 'pendiente_aprobacion', submitted_at = now()
   WHERE fre_id = 'b7d00000-0000-4000-8000-000000000003';
  PERFORM pg_temp.expect_ok('borrador', pg_temp.add_expense('b7d00000-0000-4000-8000-000000000004', '2026-12-01'));
  PERFORM pg_temp.expect_ok('e5', pg_temp.add_expense('b7d00000-0000-4000-8000-000000000005', '2026-12-02'));
  UPDATE public.fund_request_expenses SET status = 'pendiente_aprobacion', submitted_at = now()
   WHERE fre_id = 'b7d00000-0000-4000-8000-000000000005';
  PERFORM pg_temp.as_user(2);
  UPDATE public.fund_request_expenses SET status = 'aprobado_gerente', manager_decided_at = now()
   WHERE fre_id = 'b7d00000-0000-4000-8000-000000000005';
  PERFORM pg_temp.as_user(3);
  PERFORM public.fund_request_expense_review('b7d00000-0000-4000-8000-000000000005', 'return', 'sin respaldo');

  -- ── Avisos de plazo del día 3 (Fase 3.9): borrador e4 + devuelto e5 al solicitante; e3 al
  -- gerente; e1 y e2 (esperando revisión) a Contabilidad. Una sola vez por día.
  n := public.notif_emit_fund_deadline_reminders('2026-12-03');
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE type_key = 'fund.expense.deadline_reminder'
                    AND recipient_staff_id = '57d00000-0000-4000-8000-000000000001'
                    AND (payload->>'expense_count')::int = 2
                    AND payload->>'deadline_label' = '03/12/2026') THEN
    RAISE EXCEPTION 'CALENDAR FAIL — el solicitante no recibió el recordatorio de plazo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE type_key = 'fund.expense.approval_reminder'
                    AND recipient_staff_id = '57d00000-0000-4000-8000-000000000002'
                    AND (payload->>'expense_count')::int = 1) THEN
    RAISE EXCEPTION 'CALENDAR FAIL — el gerente no recibió el recordatorio de aprobación';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE type_key = 'fund.expense.review_reminder'
                    AND recipient_staff_id = '57d00000-0000-4000-8000-000000000003'
                    AND (payload->>'expense_count')::int = 2
                    AND payload->>'deadline_label' = '05/12/2026'
                    AND payload->>'context' IS NULL) THEN
    RAISE EXCEPTION 'CALENDAR FAIL — Contabilidad no recibió el recordatorio de revisión';
  END IF;
  IF public.notif_emit_fund_deadline_reminders('2026-12-03') <> 0 THEN
    RAISE EXCEPTION 'CALENDAR FAIL — los recordatorios se repitieron el mismo día';
  END IF;
  RAISE NOTICE 'PASS — recordatorios de plazo a solicitante, gerente y Contabilidad (sin repetir)';

  -- ── 3. Pasada la fecha fin (04/12) ───────────────────────────────────────
  PERFORM pg_temp.on_day('2026-12-04');
  PERFORM pg_temp.as_user(1);
  PERFORM pg_temp.expect_err('registrar después de la fecha fin',
    pg_temp.add_expense('b7d00000-0000-4000-8000-0000000000f4', '2026-12-02'), '%venció el 2026-12-03%');
  PERFORM pg_temp.expect_err('editar un borrador después de la fecha fin',
    $q$UPDATE public.fund_request_expenses SET description = 'x'
        WHERE fre_id = 'b7d00000-0000-4000-8000-000000000004'$q$, '%venció%');
  PERFORM pg_temp.expect_err('reenviar un devuelto después de la fecha fin',
    $q$UPDATE public.fund_request_expenses SET status = 'aprobado_gerente', returned_by_assistant = false
        WHERE fre_id = 'b7d00000-0000-4000-8000-000000000005'$q$, '%venció%');
  PERFORM pg_temp.as_user(2);
  PERFORM pg_temp.expect_err('el gerente decide después de la fecha fin',
    $q$UPDATE public.fund_request_expenses SET status = 'aprobado_gerente'
        WHERE fre_id = 'b7d00000-0000-4000-8000-000000000003'$q$, '%plazo para aprobar%');
  PERFORM pg_temp.as_user(3);
  PERFORM pg_temp.expect_err('devolver después de la fecha fin',
    $q$SELECT public.fund_request_expense_review('b7d00000-0000-4000-8000-000000000002', 'return', 'x')$q$,
    '%ya no se puede devolver%');
  PERFORM public.fund_request_expense_review('b7d00000-0000-4000-8000-000000000002', 'reject', 'factura de otro gasto');
  RAISE NOTICE 'PASS — después de la fecha fin: solicitante y gerente bloqueados; Contabilidad rechaza en vez de devolver';

  -- ── 4. Job de plazos ─────────────────────────────────────────────────────
  v := public.fund_request_run_deadlines('2026-12-04');
  IF (v->>'manager_auto_approved')::int <> 1 OR (v->>'expired')::int <> 2 OR (v->>'review_auto_approved')::int <> 0 THEN
    RAISE EXCEPTION 'CALENDAR FAIL — job del día 4: %', v;
  END IF;
  SELECT status, manager_auto_approved INTO r FROM public.fund_request_expenses
   WHERE fre_id = 'b7d00000-0000-4000-8000-000000000003';
  IF r.status <> 'aprobado_gerente' OR NOT r.manager_auto_approved THEN
    RAISE EXCEPTION 'CALENDAR FAIL — el lote de último momento no se aprobó solo: %', row_to_json(r);
  END IF;
  SELECT count(*) INTO n FROM public.fund_request_expenses
   WHERE fre_id IN ('b7d00000-0000-4000-8000-000000000004', 'b7d00000-0000-4000-8000-000000000005')
     AND status = 'vencido';
  IF n <> 2 THEN
    RAISE EXCEPTION 'CALENDAR FAIL — borrador y devuelto sin reenviar debían quedar vencidos (%)', n;
  END IF;
  -- Aunque la transacción tenga sesión (as_user 3), la bitácora lo atribuye al sistema.
  IF EXISTS (SELECT 1 FROM public.fund_request_events
              WHERE fund_request_id = c_fr
                AND action IN ('expense_manager_auto_approved', 'expense_expired')
                AND actor_staff_id IS NOT NULL) THEN
    RAISE EXCEPTION 'CALENDAR FAIL — un evento automático quedó con actor';
  END IF;
  SELECT count(*) INTO n FROM public.fund_request_events
   WHERE fund_request_id = c_fr AND action IN ('expense_manager_auto_approved', 'expense_expired');
  IF n <> 3 THEN
    RAISE EXCEPTION 'CALENDAR FAIL — se esperaban 3 eventos automáticos, hay %', n;
  END IF;
  -- Un vencido no se puede revivir.
  PERFORM pg_temp.as_user(1);
  PERFORM pg_temp.expect_err('revivir un vencido',
    $q$UPDATE public.fund_request_expenses SET status = 'pendiente_aprobacion'
        WHERE fre_id = 'b7d00000-0000-4000-8000-000000000004'$q$, '%');
  RAISE NOTICE 'PASS — día 4: el sistema aprueba lo del gerente y vence borradores/devueltos (actor Sistema)';

  -- Avisos del job: aprobación automática a las tres audiencias, vencidos al solicitante; y el
  -- rechazo de Contabilidad de más arriba al solicitante. Sin los avisos de a un gasto.
  SELECT count(*) INTO n FROM public.notifications
   WHERE type_key = 'fund.expense.manager_auto_approved' AND entity_id = c_fr::text
     AND (payload->>'expense_count')::int = 1
     AND ((recipient_staff_id = '57d00000-0000-4000-8000-000000000001' AND payload->>'context' = 'requester')
       OR (recipient_staff_id = '57d00000-0000-4000-8000-000000000002' AND payload->>'context' = 'manager')
       OR (recipient_staff_id = '57d00000-0000-4000-8000-000000000003' AND payload->>'context' = 'accounting'));
  IF n <> 3 THEN
    RAISE EXCEPTION 'CALENDAR FAIL — aviso de aprobación automática del gerente: % de 3 audiencias', n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications
              WHERE type_key IN ('fund.expense.decided', 'fund.expense.sent_to_support_review')
                AND entity_id = 'b7d00000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'CALENDAR FAIL — el job emitió avisos de a un gasto además del resumen';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE type_key = 'fund.expense.expired'
                    AND recipient_staff_id = '57d00000-0000-4000-8000-000000000001'
                    AND (payload->>'expense_count')::int = 2) THEN
    RAISE EXCEPTION 'CALENDAR FAIL — el solicitante no recibió el aviso de vencidos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE type_key = 'fund.expense.rejected_by_accounting'
                    AND recipient_staff_id = '57d00000-0000-4000-8000-000000000001'
                    AND entity_id = 'b7d00000-0000-4000-8000-000000000002'
                    AND payload->>'reason' = 'factura de otro gasto') THEN
    RAISE EXCEPTION 'CALENDAR FAIL — el solicitante no recibió el rechazo de Contabilidad';
  END IF;
  RAISE NOTICE 'PASS — avisos: aprobación automática (3 audiencias), vencidos y rechazo de Contabilidad';

  -- Día 5: el recordatorio a Contabilidad dice que hoy vence. (La deduplicación es por día real:
  -- se borra el del "día 3" porque en la prueba los dos caen en la misma fecha real.)
  DELETE FROM public.notifications WHERE type_key = 'fund.expense.review_reminder';
  PERFORM public.notif_emit_fund_deadline_reminders('2026-12-05');
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE type_key = 'fund.expense.review_reminder'
                    AND recipient_staff_id = '57d00000-0000-4000-8000-000000000003'
                    AND payload->>'context' = 'last_day'
                    AND (payload->>'expense_count')::int = 2) THEN
    RAISE EXCEPTION 'CALENDAR FAIL — el recordatorio del día 5 no avisa que hoy vence';
  END IF;
  -- Pasada la fecha fin ya no se recuerda nada al solicitante ni al gerente.
  IF EXISTS (SELECT 1 FROM public.notifications
              WHERE type_key IN ('fund.expense.deadline_reminder', 'fund.expense.approval_reminder')
                AND (payload->>'deadline_label') <> '03/12/2026') THEN
    RAISE EXCEPTION 'CALENDAR FAIL — recordatorio al solicitante o gerente fuera de la ventana';
  END IF;
  RAISE NOTICE 'PASS — el día 5 el recordatorio de Contabilidad avisa que hoy vence';

  -- Idempotente.
  v := public.fund_request_run_deadlines('2026-12-04');
  IF (v->>'manager_auto_approved')::int + (v->>'expired')::int + (v->>'review_auto_approved')::int <> 0 THEN
    RAISE EXCEPTION 'CALENDAR FAIL — el job no es idempotente: %', v;
  END IF;

  -- Día 5 todavía revisa Contabilidad; el 06 ya no.
  PERFORM pg_temp.on_day('2026-12-06');
  PERFORM pg_temp.as_user(3);
  PERFORM pg_temp.expect_err('revisar después del día 5',
    $q$SELECT public.fund_request_expense_review('b7d00000-0000-4000-8000-000000000001', 'correct', NULL)$q$,
    '%Venció el plazo de revisión%');
  v := public.fund_request_run_deadlines('2026-12-06');
  IF (v->>'review_auto_approved')::int <> 2 THEN
    RAISE EXCEPTION 'CALENDAR FAIL — job del día 6: %', v;
  END IF;
  SELECT count(*) INTO n FROM public.fund_request_expenses
   WHERE fre_id IN ('b7d00000-0000-4000-8000-000000000001', 'b7d00000-0000-4000-8000-000000000003')
     AND status = 'revisado_asistente' AND review_auto_approved AND iva_penalty_amount = 0
     AND reviewed_by_staff_id IS NULL;
  IF n <> 2 THEN
    RAISE EXCEPTION 'CALENDAR FAIL — la aprobación automática de Contabilidad no quedó como factura correcta sin penalidad';
  END IF;
  RAISE NOTICE 'PASS — día 6: el sistema aprueba lo de Contabilidad sin penalidad';

  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE type_key = 'fund.expense.review_auto_approved'
                    AND recipient_staff_id = '57d00000-0000-4000-8000-000000000003'
                    AND payload->>'context' = 'accounting'
                    AND (payload->>'expense_count')::int = 2) THEN
    RAISE EXCEPTION 'CALENDAR FAIL — Contabilidad no recibió el aviso de su aprobación automática';
  END IF;
  RAISE NOTICE 'PASS — aviso de aprobación automática de Contabilidad';

  -- El hito "todos revisados" al gerente: vencidos y rechazados (ya sin plazo) no lo frenan.
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                  WHERE type_key = 'fund.expenses.all_reviewed'
                    AND recipient_staff_id = '57d00000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'CALENDAR FAIL — el gerente no recibió fund.expenses.all_reviewed con vencidos/rechazados finales';
  END IF;
  RAISE NOTICE 'PASS — el hito "todos revisados" llega aunque haya vencidos y rechazados finales';

  -- ── 5. Liquidación: e1 + e3 revisados (200); e2 rechazado y e4/e5 vencidos no cuentan ──
  PERFORM public.fund_request_settle(c_fr, 'devolucion', 800, NULL);
  SELECT settlement_total_spent, settlement_balance INTO r FROM public.fund_requests WHERE fund_request_id = c_fr;
  IF r.settlement_total_spent <> 200 OR r.settlement_balance <> 800 THEN
    RAISE EXCEPTION 'CALENDAR FAIL — liquidación: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS — vencidos y rechazados no bloquean la liquidación ni cuentan como gastado';

  -- ── 6. Desembolso con fecha fin vencida y mes de la solicitud ───────────
  PERFORM pg_temp.on_day('2026-12-04');
  PERFORM pg_temp.expect_err('desembolsar con la fecha fin vencida',
    $q$SELECT public.fund_request_disburse('f7d00000-0000-4000-8000-000000000002', 300, NULL)$q$,
    '%ya venció; elija un mes nuevo%');
  PERFORM pg_temp.expect_err('desembolsar con un mes pasado',
    $q$SELECT public.fund_request_disburse('f7d00000-0000-4000-8000-000000000002', 300, NULL, '2026-11-01')$q$,
    '%no es válido%');
  PERFORM public.fund_request_disburse('f7d00000-0000-4000-8000-000000000002', 300, NULL, '2026-12-01');
  IF (SELECT expense_period_month FROM public.fund_requests
       WHERE fund_request_id = 'f7d00000-0000-4000-8000-000000000002') <> '2026-12-01' THEN
    RAISE EXCEPTION 'CALENDAR FAIL — el desembolso no guardó el mes nuevo';
  END IF;
  RAISE NOTICE 'PASS — con la fecha fin vencida solo se desembolsa eligiendo un mes válido';

  PERFORM pg_temp.as_user(1);
  PERFORM pg_temp.expect_err('mes de la solicitud 6 meses adelante',
    $q$INSERT INTO public.fund_requests (requester_staff_id, total_requested_amount, currency, status, expense_period_month)
        VALUES ('57d00000-0000-4000-8000-000000000001', 10, 'BOB', 'borrador', '2027-06-01')$q$,
    '%debe ser el actual o hasta 5 meses adelante%');
  PERFORM pg_temp.expect_ok('mes de la solicitud 5 meses adelante',
    $q$INSERT INTO public.fund_requests (requester_staff_id, total_requested_amount, currency, status, expense_period_month)
        VALUES ('57d00000-0000-4000-8000-000000000001', 10, 'BOB', 'borrador', '2027-05-01')$q$);
  RAISE NOTICE 'PASS — el mes de la solicitud es el actual o hasta 5 meses adelante';

  -- Cambio de año: diciembre 2026 → fecha fin 03/01/2027, revisión 05/01/2027.
  IF public.fund_request_deadline('2026-12-01') <> '2027-01-03'
     OR public.fund_request_review_deadline('2026-12-01') <> '2027-01-05'
     OR public.fund_request_deadline('2027-01-01') <> '2027-02-03' THEN
    RAISE EXCEPTION 'CALENDAR FAIL — fechas fin en el cambio de año';
  END IF;
  RAISE NOTICE 'PASS — fecha fin y fin de revisión en el cambio de año';

  RAISE NOTICE 'FUND EXPENSE CALENDAR: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
