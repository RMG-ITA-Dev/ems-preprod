-- RLS/RPC assertions: paridad de Contabilidad en Solicitud de Fondos
-- (docs/plan-contabilidad-gastos.md, Fase 1). Run via supabase/tests/local/run-rls-tests.sh
-- against the disposable scratch database. Single transaction, ALWAYS rolls back.
--
-- Decisión de negocio (Q2/Q3): `accounting_manager` y `accounting_analyst` tienen los MISMOS
-- permisos en el módulo: desembolsar, revisar gastos, liquidar, cerrar y cancelar.
--
-- Under test:
--   1. Cada rol contable recorre el flujo completo por las RPC (fund_request_disburse →
--      fund_request_expense_review → fund_request_settle → fund_request_close) y ve la
--      solicitud en cada estado. El actor lo pone el servidor (get_my_staff_id()).
--   2. Las escrituras contables van SOLO por RPC: un UPDATE directo de Contabilidad no afecta
--      filas (no hay policy UPDATE contable).
--   3. Las RPC validan permiso, estado y datos: el solicitante no desembolsa; no se desembolsa
--      más de lo solicitado; no se liquida con gastos sin finalizar; la resolución debe
--      corresponder al saldo que calcula el servidor; la revisión aplica el 13% de IVA.
--   4. Cancelar: Contabilidad cancela en la fase contable y sigue viendo la cancelada; no
--      cancela fuera de esa fase. Un Senior ajeno no ve ni cancela.
--
-- Success output ends with "FUND ACCOUNTING PARITY RLS: ALL CHECKS PASSED (rolled back)".

BEGIN;

-- ── Fixtures (como dueño, sin sesión: así los escribe el seed) ─────────────
SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a7c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'fund-acct-' || n || '@ruizmier.com', 'x', now(), now(), now(),
           '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 5) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 1 solicitante · 2 Gerente de Contabilidad · 3 Analista de Contabilidad · 4 Senior ajeno
-- 5 gerente del encargo (gerente de la OT)
INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a7c00000-0000-4000-8000-000000000001', 'staff',   'assistant'),
  ('a7c00000-0000-4000-8000-000000000002', 'manager', 'accounting_manager'),
  ('a7c00000-0000-4000-8000-000000000003', 'senior',  'accounting_analyst'),
  ('a7c00000-0000-4000-8000-000000000004', 'senior',  'senior'),
  ('a7c00000-0000-4000-8000-000000000005', 'manager', 'manager')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id, weekly_capacity_hours, hire_date, city)
SELECT ('57c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a7c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'FACCT', 'Staff' || n, true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'
  FROM generate_series(1, 5) n;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c7c00000-0000-4000-8000-000000000001', 'FACCT Cliente SA', 'FACCT-7C01');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                manager_id, created_by_staff_id, fecha_cierre, society_id)
VALUES ('e7c00000-0000-4000-8000-000000000001', 'c7c00000-0000-4000-8000-000000000001',
        'FACCT Encargo', '7C01',
        '57c00000-0000-4000-8000-000000000005',
        '57c00000-0000-4000-8000-000000000005', '2026-12-31',
        (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status)
VALUES ('d7c00000-0000-4000-8000-000000000001', 'e7c00000-0000-4000-8000-000000000001',
        'BOB', 'High', 'Approved');

-- f..2 / f..3: una por rol contable, recorren el flujo completo (500 solicitados).
-- f..4: fondos_entregados, para el Senior ajeno y la cancelación.
-- f..5: fondos_entregados con un gasto sin finalizar (bloquea liquidar).
-- f..6: pendiente_aprobacion (fuera de la fase contable).
INSERT INTO public.fund_requests (fund_request_id, requester_staff_id,
                                  total_requested_amount, currency, status,
                                  total_disbursed_amount)
VALUES
  ('f7c00000-0000-4000-8000-000000000002', '57c00000-0000-4000-8000-000000000001', 500, 'BOB', 'aprobado_gerente', 0),
  ('f7c00000-0000-4000-8000-000000000003', '57c00000-0000-4000-8000-000000000001', 500, 'BOB', 'aprobado_gerente', 0),
  ('f7c00000-0000-4000-8000-000000000004', '57c00000-0000-4000-8000-000000000001', 500, 'BOB', 'fondos_entregados', 500),
  ('f7c00000-0000-4000-8000-000000000005', '57c00000-0000-4000-8000-000000000001', 500, 'BOB', 'fondos_entregados', 500),
  ('f7c00000-0000-4000-8000-000000000006', '57c00000-0000-4000-8000-000000000001', 500, 'BOB', 'pendiente_aprobacion', 0);

INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount, approval_status)
SELECT ('f7c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'd7c00000-0000-4000-8000-000000000001', 500,
       CASE WHEN n = 6 THEN 'pendiente' ELSE 'aprobado' END::public.fr_wo_approval_status
  FROM generate_series(2, 6) n;

-- Gastos ya aprobados por el gerente, esperando a Contabilidad: 300 en f..2 y 300 en f..3
-- (saldo 200 a favor de la firma). En f..5, uno todavía pendiente del gerente.
INSERT INTO public.fund_request_expenses (fre_id, fund_request_id, wo_id, expense_date,
                                          amount, currency, status)
VALUES
  ('b7c00000-0000-4000-8000-000000000002', 'f7c00000-0000-4000-8000-000000000002',
   'd7c00000-0000-4000-8000-000000000001', '2026-10-01', 300, 'BOB', 'aprobado_gerente'),
  ('b7c00000-0000-4000-8000-000000000003', 'f7c00000-0000-4000-8000-000000000003',
   'd7c00000-0000-4000-8000-000000000001', '2026-10-01', 300, 'BOB', 'aprobado_gerente'),
  ('b7c00000-0000-4000-8000-000000000005', 'f7c00000-0000-4000-8000-000000000005',
   'd7c00000-0000-4000-8000-000000000001', '2026-10-01', 100, 'BOB', 'pendiente_aprobacion');

-- ── Helpers (temp; vanish with the session) ───────────────────────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  )
$$;

-- Recorre el flujo contable completo por las RPC, como el usuario dado.
CREATE FUNCTION pg_temp.assert_full_flow(p_label text, p_sub text, p_staff uuid, p_fr uuid, p_fre uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  n int;
  r record;
BEGIN
  PERFORM pg_temp.impersonate(p_sub);

  SELECT count(*) INTO n FROM public.fund_requests WHERE fund_request_id = p_fr;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no ve la solicitud en aprobado_gerente', p_label;
  END IF;

  -- Desembolsar.
  BEGIN
    PERFORM public.fund_request_disburse(p_fr, 500, '  nota  ');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no puede desembolsar (%)', p_label, SQLERRM;
  END;
  SELECT status, total_disbursed_amount, disbursed_by_staff_id, accounting_notes INTO r
    FROM public.fund_requests WHERE fund_request_id = p_fr;
  IF r.status <> 'fondos_entregados' OR r.total_disbursed_amount <> 500
     OR r.disbursed_by_staff_id IS DISTINCT FROM p_staff OR r.accounting_notes <> 'nota' THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: desembolso mal registrado (%)', p_label, row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS — % desembolsa (actor = sesión)', p_label;

  -- Revisar el gasto: factura incorrecta → validado con 13% de IVA.
  BEGIN
    PERFORM public.fund_request_expense_review(p_fre, 'incorrect', 'NIT equivocado');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no puede revisar el gasto (%)', p_label, SQLERRM;
  END;
  SELECT status, iva_penalty_amount, reviewed_by_staff_id, has_invoice_observation INTO r
    FROM public.fund_request_expenses WHERE fre_id = p_fre;
  IF r.status <> 'revisado_asistente' OR r.iva_penalty_amount <> 39
     OR r.reviewed_by_staff_id IS DISTINCT FROM p_staff OR NOT r.has_invoice_observation THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: revisión mal registrada (%)', p_label, row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS — % revisa el gasto (13%% IVA = 39)', p_label;

  -- Liquidar: saldo 200 a favor de la firma → sin_saldo no corresponde.
  BEGIN
    PERFORM public.fund_request_settle(p_fr, 'sin_saldo', 0, NULL);
    RAISE EXCEPTION 'FUND ACCT FAIL — %: liquidó con una resolución que no corresponde al saldo', p_label;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FUND ACCT FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.fund_request_settle(p_fr, 'devolucion', 200, 'devuelve en caja');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no puede liquidar (%)', p_label, SQLERRM;
  END;
  SELECT status, settlement_total_spent, settlement_balance, settlement_iva_total,
         settlement_resolution, settled_by_staff_id INTO r
    FROM public.fund_requests WHERE fund_request_id = p_fr;
  IF r.status <> 'en_liquidacion' OR r.settlement_total_spent <> 300 OR r.settlement_balance <> 200
     OR r.settlement_iva_total <> 39 OR r.settlement_resolution <> 'devolucion'
     OR r.settled_by_staff_id IS DISTINCT FROM p_staff THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: liquidación mal registrada (%)', p_label, row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS — % liquida (snapshot calculado por el servidor)', p_label;

  SELECT count(*) INTO n FROM public.fund_requests WHERE fund_request_id = p_fr;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no ve la solicitud en en_liquidacion', p_label;
  END IF;

  -- Cerrar.
  BEGIN
    PERFORM public.fund_request_close(p_fr, NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: no puede cerrar (%)', p_label, SQLERRM;
  END;
  SELECT status, closed_by_staff_id INTO r FROM public.fund_requests WHERE fund_request_id = p_fr;
  IF r.status <> 'cerrado' OR r.closed_by_staff_id IS DISTINCT FROM p_staff THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — %: cierre mal registrado (%)', p_label, row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS — % cierra y ve la solicitud cerrada', p_label;
END $$;

-- Espera que la sentencia falle; devuelve el mensaje.
CREATE FUNCTION pg_temp.expect_error(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

-- ── Todo lo que sigue corre como `authenticated` (RLS evaluada) ───────────
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  n int;
  msg text;
BEGIN
  -- 1. Flujo completo, los dos roles contables.
  PERFORM pg_temp.assert_full_flow('Gerente de Contabilidad',
    'a7c00000-0000-4000-8000-000000000002', '57c00000-0000-4000-8000-000000000002',
    'f7c00000-0000-4000-8000-000000000002', 'b7c00000-0000-4000-8000-000000000002');

  PERFORM pg_temp.assert_full_flow('Analista de Contabilidad',
    'a7c00000-0000-4000-8000-000000000003', '57c00000-0000-4000-8000-000000000003',
    'f7c00000-0000-4000-8000-000000000003', 'b7c00000-0000-4000-8000-000000000003');

  -- 2. Escritura directa: sin policy UPDATE contable, no afecta filas.
  PERFORM pg_temp.impersonate('a7c00000-0000-4000-8000-000000000003');
  UPDATE public.fund_requests SET accounting_notes = 'directo'
   WHERE fund_request_id = 'f7c00000-0000-4000-8000-000000000004';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — un UPDATE directo de Contabilidad afectó % filas', n;
  END IF;
  RAISE NOTICE 'PASS — Contabilidad no escribe por UPDATE directo (solo RPC)';

  -- 3. Validaciones de las RPC.
  -- 3.a liquidar con un gasto sin finalizar.
  msg := pg_temp.expect_error($q$SELECT public.fund_request_settle('f7c00000-0000-4000-8000-000000000005', 'devolucion', 500, NULL)$q$);
  IF msg IS NULL OR msg NOT LIKE '%gastos sin finalizar%' THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — liquidó con un gasto sin finalizar (%)', msg;
  END IF;
  RAISE NOTICE 'PASS — no se liquida con gastos sin finalizar';

  -- 3.b el solicitante no desembolsa.
  PERFORM pg_temp.impersonate('a7c00000-0000-4000-8000-000000000001');
  msg := pg_temp.expect_error($q$SELECT public.fund_request_disburse('f7c00000-0000-4000-8000-000000000004', 100, NULL)$q$);
  IF msg IS NULL OR msg NOT LIKE '%No autorizado%' THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — el solicitante pudo llamar a fund_request_disburse (%)', msg;
  END IF;
  RAISE NOTICE 'PASS — el solicitante no desembolsa';

  -- 4. Cancelar.
  PERFORM pg_temp.impersonate('a7c00000-0000-4000-8000-000000000003');
  -- 4.a fuera de la fase contable: no.
  msg := pg_temp.expect_error($q$SELECT public.fund_request_cancel('f7c00000-0000-4000-8000-000000000006', 'x')$q$);
  IF msg IS NULL OR msg NOT LIKE '%no se puede cancelar%' THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — Contabilidad canceló una solicitud pendiente de aprobación (%)', msg;
  END IF;
  -- 4.b sin motivo: no.
  msg := pg_temp.expect_error($q$SELECT public.fund_request_cancel('f7c00000-0000-4000-8000-000000000004', '  ')$q$);
  IF msg IS NULL OR msg NOT LIKE '%motivo%' THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — se canceló sin motivo (%)', msg;
  END IF;
  -- 4.c Senior ajeno: no ve ni cancela.
  PERFORM pg_temp.impersonate('a7c00000-0000-4000-8000-000000000004');
  SELECT count(*) INTO n FROM public.fund_requests
   WHERE fund_request_id = 'f7c00000-0000-4000-8000-000000000004';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — un Senior ajeno ve una solicitud en fondos_entregados';
  END IF;
  msg := pg_temp.expect_error($q$SELECT public.fund_request_cancel('f7c00000-0000-4000-8000-000000000004', 'x')$q$);
  IF msg IS NULL OR msg NOT LIKE '%No autorizado%' THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — un Senior ajeno pudo cancelar (%)', msg;
  END IF;
  RAISE NOTICE 'PASS — un Senior ajeno no ve ni cancela';
  -- 4.d en fase contable, con motivo: sí, y la sigue viendo.
  PERFORM pg_temp.impersonate('a7c00000-0000-4000-8000-000000000003');
  PERFORM public.fund_request_cancel('f7c00000-0000-4000-8000-000000000004', 'pedido duplicado');
  SELECT count(*) INTO n FROM public.fund_requests
   WHERE fund_request_id = 'f7c00000-0000-4000-8000-000000000004'
     AND status = 'cancelado' AND cancelled_from_status = 'fondos_entregados'
     AND cancelled_by_staff_id = '57c00000-0000-4000-8000-000000000003';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FUND ACCT FAIL — la cancelación no quedó registrada o Contabilidad no la ve';
  END IF;
  RAISE NOTICE 'PASS — Contabilidad cancela en la fase contable y sigue viendo la cancelada';

  RAISE NOTICE 'FUND ACCOUNTING PARITY RLS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
