-- Bitácora de Solicitud de Fondos (docs/plan-contabilidad-gastos.md, Fase 2): fund_request_events.
-- Run via supabase/tests/local/run-rls-tests.sh against the disposable scratch database.
-- Single transaction, ALWAYS rolls back.
--
-- Under test:
--   1. Los triggers fr_log_event / fr_wo_log_event / fre_log_event registran cada cambio de
--      estado de la solicitud, de cada OT y de cada gasto, en orden, con el actor de la SESIÓN
--      (get_my_staff_id()) — también cuando el cambio lo hace una RPC SECURITY DEFINER o el
--      rollup de OTs. Sin sesión, el actor queda NULL (= "Sistema").
--   2. El historial sobrevive a la corrección: un gasto devuelto por Contabilidad y reenviado
--      conserva el evento de devolución con su motivo.
--   3. RLS: el solicitante y Contabilidad ven la bitácora; cada gerente ve solo los eventos de
--      SU OT; un Senior ajeno no ve nada; nadie escribe la bitácora a mano.
--
-- El flujo corre como DUEÑO con la sesión impersonada (los triggers toman el actor de los
-- claims; RLS no se evalúa para el dueño). Las aserciones de RLS bajan a `authenticated`.
--
-- Success output ends with "FUND REQUEST EVENTS: ALL CHECKS PASSED (rolled back)".

BEGIN;

SELECT set_config('request.jwt.claims', '', true);

-- ── Fixtures ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a7e00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'fund-events-' || n || '@ruizmier.com', 'x', now(), now(), now(),
           '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 5) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 1 solicitante · 2 gerente OT-1 · 3 gerente OT-2 · 4 Analista de Contabilidad · 5 Senior ajeno
INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a7e00000-0000-4000-8000-000000000001', 'staff',   'assistant'),
  ('a7e00000-0000-4000-8000-000000000002', 'manager', 'manager'),
  ('a7e00000-0000-4000-8000-000000000003', 'manager', 'manager'),
  ('a7e00000-0000-4000-8000-000000000004', 'senior',  'accounting_analyst'),
  ('a7e00000-0000-4000-8000-000000000005', 'senior',  'senior')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id, weekly_capacity_hours, hire_date, city)
SELECT ('57e00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a7e00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'FEVT', 'Staff' || n, true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'
  FROM generate_series(1, 5) n;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c7e00000-0000-4000-8000-000000000001', 'FEVT Cliente SA', 'FEVT-7E01');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                manager_id, created_by_staff_id, fecha_cierre, society_id)
VALUES
  ('e7e00000-0000-4000-8000-000000000001', 'c7e00000-0000-4000-8000-000000000001',
   'FEVT Encargo Uno', '7E01', '57e00000-0000-4000-8000-000000000002',
   '57e00000-0000-4000-8000-000000000002', '2026-12-31',
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e7e00000-0000-4000-8000-000000000002', 'c7e00000-0000-4000-8000-000000000001',
   'FEVT Encargo Dos', '7E02', '57e00000-0000-4000-8000-000000000003',
   '57e00000-0000-4000-8000-000000000003', '2026-12-31',
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status)
VALUES ('d7e00000-0000-4000-8000-000000000001', 'e7e00000-0000-4000-8000-000000000001', 'BOB', 'High', 'Approved'),
       ('d7e00000-0000-4000-8000-000000000002', 'e7e00000-0000-4000-8000-000000000002', 'BOB', 'High', 'Approved');

CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

-- ── 1 + 2. Flujo completo con actores (como dueño, sesión impersonada) ─────
DO $$
DECLARE
  c_fr  CONSTANT uuid := 'f7e00000-0000-4000-8000-000000000001';
  c_fre CONSTANT uuid := 'b7e00000-0000-4000-8000-000000000001';
  c_req CONSTANT uuid := '57e00000-0000-4000-8000-000000000001';
  c_m1  CONSTANT uuid := '57e00000-0000-4000-8000-000000000002';
  c_m2  CONSTANT uuid := '57e00000-0000-4000-8000-000000000003';
  c_acc CONSTANT uuid := '57e00000-0000-4000-8000-000000000004';
  v_got text;
  v_want text;
  v_n int;
BEGIN
  -- Solicitante: crea, asigna dos OTs (una por gerente) y envía.
  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000001');
  INSERT INTO public.fund_requests (fund_request_id, requester_staff_id, total_requested_amount,
                                    currency, status)
  VALUES (c_fr, c_req, 1000, 'BOB', 'borrador');
  INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
  VALUES (c_fr, 'd7e00000-0000-4000-8000-000000000001', 600),
         (c_fr, 'd7e00000-0000-4000-8000-000000000002', 400);
  PERFORM public.fund_request_submit(c_fr);

  -- Cada gerente aprueba su OT; la segunda aprobación mueve la solicitud (rollup).
  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000002');
  UPDATE public.fund_request_work_orders SET approval_status = 'aprobado', manager_notes = 'ok OT1'
   WHERE fund_request_id = c_fr AND wo_id = 'd7e00000-0000-4000-8000-000000000001';
  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000003');
  UPDATE public.fund_request_work_orders SET approval_status = 'aprobado'
   WHERE fund_request_id = c_fr AND wo_id = 'd7e00000-0000-4000-8000-000000000002';

  -- Contabilidad desembolsa.
  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000004');
  PERFORM public.fund_request_disburse(c_fr, 1000, 'efectivo');

  -- Gasto: solicitante registra y envía; gerente OT-1 aprueba; Contabilidad devuelve;
  -- solicitante reenvía; Contabilidad valida con penalidad.
  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000001');
  INSERT INTO public.fund_request_expenses (fre_id, fund_request_id, wo_id, expense_date,
                                            amount, currency, status)
  -- Fecha del gasto = hoy: el calendario (Fase 3) exige que caiga entre el desembolso y hoy.
  VALUES (c_fre, c_fr, 'd7e00000-0000-4000-8000-000000000001', public.fund_today(), 100, 'BOB', 'borrador');
  UPDATE public.fund_request_expenses SET status = 'pendiente_aprobacion', submitted_at = now()
   WHERE fre_id = c_fre;

  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000002');
  UPDATE public.fund_request_expenses SET status = 'aprobado_gerente', manager_decided_at = now()
   WHERE fre_id = c_fre;

  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000004');
  PERFORM public.fund_request_expense_review(c_fre, 'return', 'falta la factura');

  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000001');
  UPDATE public.fund_request_expenses
     SET status = 'aprobado_gerente', returned_by_assistant = false,
         attachment_url = 'https://example.test/factura.pdf'
   WHERE fre_id = c_fre;

  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000004');
  PERFORM public.fund_request_expense_review(c_fre, 'incorrect', 'NIT equivocado');
  PERFORM public.fund_request_settle(c_fr, 'devolucion', 900, NULL);
  PERFORM public.fund_request_confirm_settlement(c_fr, 'REC-9', 'en caja');

  -- 1.a Solicitud + OTs, en orden.
  SELECT string_agg(action || ':' || COALESCE(actor_staff_id::text, 'SISTEMA'), ' > '
                    ORDER BY seq)
    INTO v_got
    FROM public.fund_request_events
   WHERE fund_request_id = c_fr AND entity IN ('request', 'work_order');
  SELECT count(*) INTO v_n FROM public.fund_request_events
   WHERE fund_request_id = c_fr AND entity IN ('request', 'work_order');
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'EVENTS FAIL — se esperaban 8 eventos de solicitud/OT, hay %: %', v_n, v_got;
  END IF;
  -- Orden real (seq): la decisión de la OT se registra antes que el rollup que aprueba la solicitud.
  SELECT string_agg(action, ' > ' ORDER BY seq) INTO v_want
    FROM public.fund_request_events
   WHERE fund_request_id = c_fr AND entity IN ('request', 'work_order');
  IF v_want <> 'created > submitted > wo_approved > wo_approved > approved > disbursed > settled > settlement_confirmed' THEN
    RAISE EXCEPTION 'EVENTS FAIL — orden inesperado: %', v_want;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fund_request_events WHERE fund_request_id = c_fr
                   AND action = 'created' AND actor_staff_id = c_req)
     OR NOT EXISTS (SELECT 1 FROM public.fund_request_events WHERE fund_request_id = c_fr
                   AND action = 'submitted' AND actor_staff_id = c_req)
     OR NOT EXISTS (SELECT 1 FROM public.fund_request_events WHERE fund_request_id = c_fr
                   AND action = 'wo_approved' AND actor_staff_id = c_m1
                   AND wo_id = 'd7e00000-0000-4000-8000-000000000001' AND notes = 'ok OT1')
     OR NOT EXISTS (SELECT 1 FROM public.fund_request_events WHERE fund_request_id = c_fr
                   AND action = 'wo_approved' AND actor_staff_id = c_m2
                   AND wo_id = 'd7e00000-0000-4000-8000-000000000002')
     OR NOT EXISTS (SELECT 1 FROM public.fund_request_events WHERE fund_request_id = c_fr
                   AND action = 'approved' AND actor_staff_id = c_m2)
     OR NOT EXISTS (SELECT 1 FROM public.fund_request_events WHERE fund_request_id = c_fr
                   AND action = 'disbursed' AND actor_staff_id = c_acc AND amount = 1000
                   AND notes = 'efectivo')
     OR NOT EXISTS (SELECT 1 FROM public.fund_request_events WHERE fund_request_id = c_fr
                   AND action = 'settled' AND actor_staff_id = c_acc AND amount = 900)
     OR NOT EXISTS (SELECT 1 FROM public.fund_request_events WHERE fund_request_id = c_fr
                   AND action = 'settlement_confirmed' AND actor_staff_id = c_acc
                   AND notes = 'REC-9 · en caja' AND amount = 900) THEN
    RAISE EXCEPTION 'EVENTS FAIL — eventos de solicitud/OT incompletos o con actor equivocado: %', v_got;
  END IF;
  -- El reset de OTs del envío NO genera eventos.
  IF EXISTS (SELECT 1 FROM public.fund_request_events WHERE fund_request_id = c_fr
               AND to_status = 'pendiente' AND entity = 'work_order') THEN
    RAISE EXCEPTION 'EVENTS FAIL — el reset de OTs del envío quedó registrado como evento';
  END IF;
  RAISE NOTICE 'PASS — solicitud y OTs: 8 eventos con el actor de la sesión (incluye RPC y rollup)';

  -- 1.b + 2. Gasto: la devolución y su motivo siguen ahí después del reenvío.
  SELECT string_agg(action || ':' || actor_staff_id::text || ':' || COALESCE(notes, '-') || ':'
                    || COALESCE(amount::text, '-'), ' | ' ORDER BY action)
    INTO v_got
    FROM public.fund_request_events WHERE fre_id = c_fre;
  v_want := concat_ws(' | ',
    'expense_manager_approved:' || c_m1 || ':-:-',
    'expense_resubmitted_to_accounting:' || c_req || ':-:-',
    'expense_returned_by_accounting:' || c_acc || ':falta la factura:-',
    'expense_reviewed:' || c_acc || ':NIT equivocado:13.00',
    'expense_submitted:' || c_req || ':-:-');
  IF v_got IS DISTINCT FROM v_want THEN
    RAISE EXCEPTION 'EVENTS FAIL — eventos del gasto: esperado [%], obtenido [%]', v_want, v_got;
  END IF;
  RAISE NOTICE 'PASS — gasto: 5 eventos; la devolución y su motivo sobreviven al reenvío';

  -- 1.c Sin sesión, el actor es NULL (= Sistema).
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.fund_requests SET status = 'cancelado'
   WHERE fund_request_id = 'f7e00000-0000-4000-8000-000000000001';
  IF NOT EXISTS (SELECT 1 FROM public.fund_request_events WHERE fund_request_id = c_fr
                   AND action = 'cancelled' AND actor_staff_id IS NULL) THEN
    RAISE EXCEPTION 'EVENTS FAIL — un cambio sin sesión no quedó con actor NULL';
  END IF;
  RAISE NOTICE 'PASS — sin sesión el actor queda NULL (Sistema)';
END $$;

-- ── 3. RLS (como `authenticated`) ──────────────────────────────────────────
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  c_fr CONSTANT uuid := 'f7e00000-0000-4000-8000-000000000001';
  v_total int;
  v_n int;
  denied boolean;
BEGIN
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_total FROM public.fund_request_events WHERE fund_request_id = c_fr;
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Solicitante: todo.
  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_n FROM public.fund_request_events WHERE fund_request_id = c_fr;
  IF v_n <> v_total THEN
    RAISE EXCEPTION 'EVENTS FAIL — el solicitante ve % de % eventos', v_n, v_total;
  END IF;

  -- Gerente OT-1: no ve la decisión del gerente OT-2.
  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_n FROM public.fund_request_events
   WHERE fund_request_id = c_fr AND wo_id = 'd7e00000-0000-4000-8000-000000000002'
     AND entity = 'work_order';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'EVENTS FAIL — el gerente de OT-1 ve la decisión de OT-2';
  END IF;
  SELECT count(*) INTO v_n FROM public.fund_request_events
   WHERE fund_request_id = c_fr AND wo_id = 'd7e00000-0000-4000-8000-000000000001'
     AND entity = 'work_order';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'EVENTS FAIL — el gerente de OT-1 no ve su propia decisión (%)', v_n;
  END IF;
  RAISE NOTICE 'PASS — cada gerente ve solo los eventos de su OT';

  -- Senior ajeno: nada.
  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000005');
  SELECT count(*) INTO v_n FROM public.fund_request_events WHERE fund_request_id = c_fr;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'EVENTS FAIL — un Senior ajeno ve % eventos', v_n;
  END IF;
  RAISE NOTICE 'PASS — un Senior ajeno no ve la bitácora';

  -- Nadie escribe la bitácora a mano (sin grant de escritura para authenticated).
  PERFORM pg_temp.impersonate('a7e00000-0000-4000-8000-000000000004');
  denied := false;
  BEGIN
    INSERT INTO public.fund_request_events (fund_request_id, entity, action)
    VALUES (c_fr, 'request', 'forjado');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'EVENTS FAIL — authenticated pudo insertar en la bitácora';
  END IF;
  denied := false;
  BEGIN
    DELETE FROM public.fund_request_events WHERE fund_request_id = c_fr;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'EVENTS FAIL — authenticated pudo borrar la bitácora';
  END IF;
  RAISE NOTICE 'PASS — la bitácora no se escribe ni se borra a mano';

  RAISE NOTICE 'FUND REQUEST EVENTS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
