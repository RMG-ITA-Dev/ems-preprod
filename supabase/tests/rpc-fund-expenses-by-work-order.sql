-- Detalle de gastos por OT (docs/plan-contabilidad-gastos.md, Fase 5):
-- fund_work_order_expense_summary() y fund_work_order_expense_detail(wo_id).
-- Run via supabase/tests/local/run-rls-tests.sh against the disposable scratch database.
-- Single transaction, ALWAYS rolls back.
--
-- Under test:
--   1. Portón: solo con expense_settlement.read (Gerente y Analista de Contabilidad). Un Senior
--      y un Gerente de encargo reciben 42501.
--   2. Totales por OT a través de VARIAS solicitudes: asignado (solo solicitudes en la fase
--      contable, sin canceladas), gastado (revisado_asistente), en proceso (pendiente / aprobado
--      por el gerente / observado) y presupuesto de gastos de la OT.
--   3. Detalle: lista plana de gastos enviados (sin borradores ni vencidos) con su solicitud de
--      origen, y presupuesto vs gastado por tipo (tipos con presupuesto y tipos solo gastados).
--
-- Success output ends with "FUND EXPENSES BY WORK ORDER: ALL CHECKS PASSED (rolled back)".

BEGIN;

SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a7f00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'fund-wo-' || n || '@ruizmier.com', 'x', now(), now(), now(),
           '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 4) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 1 solicitante · 2 Analista de Contabilidad · 3 Senior ajeno · 4 gerente del encargo
INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a7f00000-0000-4000-8000-000000000001', 'staff',   'assistant'),
  ('a7f00000-0000-4000-8000-000000000002', 'senior',  'accounting_analyst'),
  ('a7f00000-0000-4000-8000-000000000003', 'senior',  'senior'),
  ('a7f00000-0000-4000-8000-000000000004', 'manager', 'manager')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id, weekly_capacity_hours, hire_date, city)
SELECT ('57f00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a7f00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'FWO', 'Staff' || n, true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society ORDER BY name LIMIT 1), 40, '2020-01-01', 'La Paz'
  FROM generate_series(1, 4) n;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c7f00000-0000-4000-8000-000000000001', 'FWO Cliente SA', 'FWO-7F01');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                manager_id, created_by_staff_id, fecha_cierre, society_id)
VALUES ('e7f00000-0000-4000-8000-000000000001', 'c7f00000-0000-4000-8000-000000000001',
        'FWO Auditoria', '7F01', '57f00000-0000-4000-8000-000000000004',
        '57f00000-0000-4000-8000-000000000004', '2027-12-31',
        (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status)
VALUES ('d7f00000-0000-4000-8000-000000000001', 'e7f00000-0000-4000-8000-000000000001',
        'BOB', 'High', 'Approved');

INSERT INTO public.expense_types (expense_type_id, expense_name) VALUES
  ('77f00000-0000-4000-8000-000000000001', 'FWO Pasajes'),
  ('77f00000-0000-4000-8000-000000000002', 'FWO Viaticos'),
  ('77f00000-0000-4000-8000-000000000003', 'FWO Taxis');

-- Presupuesto de la OT: pasajes 2000, viáticos 1500 (taxis sin presupuesto).
INSERT INTO public.wo_expense_budget (wo_id, expense_type_id, budgeted_amount) VALUES
  ('d7f00000-0000-4000-8000-000000000001', '77f00000-0000-4000-8000-000000000001', 2000),
  ('d7f00000-0000-4000-8000-000000000001', '77f00000-0000-4000-8000-000000000002', 1500);

-- Tres solicitudes sobre la misma OT: f1 cerrada (600), f2 con fondos (400), f3 cancelada (999,
-- no cuenta).
INSERT INTO public.fund_requests (fund_request_id, request_number, requester_staff_id,
                                  total_requested_amount, currency, status, total_disbursed_amount)
VALUES
  ('f7f00000-0000-4000-8000-000000000001', 'SF-FWO-1', '57f00000-0000-4000-8000-000000000001', 600, 'BOB', 'cerrado', 600),
  ('f7f00000-0000-4000-8000-000000000002', 'SF-FWO-2', '57f00000-0000-4000-8000-000000000001', 400, 'BOB', 'fondos_entregados', 400),
  ('f7f00000-0000-4000-8000-000000000003', 'SF-FWO-3', '57f00000-0000-4000-8000-000000000001', 999, 'BOB', 'cancelado', 0);

INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount, approval_status)
VALUES
  ('f7f00000-0000-4000-8000-000000000001', 'd7f00000-0000-4000-8000-000000000001', 600, 'aprobado'),
  ('f7f00000-0000-4000-8000-000000000002', 'd7f00000-0000-4000-8000-000000000001', 400, 'aprobado'),
  ('f7f00000-0000-4000-8000-000000000003', 'd7f00000-0000-4000-8000-000000000001', 999, 'aprobado');

-- Gastos: en f1 pasajes 500 revisado; en f2 viáticos 120 revisado, taxis 30 aprobado por el
-- gerente (en proceso), viáticos 50 pendiente (en proceso), un borrador 70 y un vencido 80 (no
-- aparecen). En f3 (cancelada) un gasto revisado 999 (no cuenta).
INSERT INTO public.fund_request_expenses (fre_id, fund_request_id, wo_id, expense_type_id,
                                          expense_date, amount, currency, status)
VALUES
  ('b7f00000-0000-4000-8000-000000000001', 'f7f00000-0000-4000-8000-000000000001', 'd7f00000-0000-4000-8000-000000000001', '77f00000-0000-4000-8000-000000000001', '2026-09-10', 500, 'BOB', 'revisado_asistente'),
  ('b7f00000-0000-4000-8000-000000000002', 'f7f00000-0000-4000-8000-000000000002', 'd7f00000-0000-4000-8000-000000000001', '77f00000-0000-4000-8000-000000000002', '2026-10-05', 120, 'BOB', 'revisado_asistente'),
  ('b7f00000-0000-4000-8000-000000000003', 'f7f00000-0000-4000-8000-000000000002', 'd7f00000-0000-4000-8000-000000000001', '77f00000-0000-4000-8000-000000000003', '2026-10-06', 30, 'BOB', 'aprobado_gerente'),
  ('b7f00000-0000-4000-8000-000000000004', 'f7f00000-0000-4000-8000-000000000002', 'd7f00000-0000-4000-8000-000000000001', '77f00000-0000-4000-8000-000000000002', '2026-10-07', 50, 'BOB', 'pendiente_aprobacion'),
  ('b7f00000-0000-4000-8000-000000000005', 'f7f00000-0000-4000-8000-000000000002', 'd7f00000-0000-4000-8000-000000000001', '77f00000-0000-4000-8000-000000000002', '2026-10-08', 70, 'BOB', 'borrador'),
  ('b7f00000-0000-4000-8000-000000000006', 'f7f00000-0000-4000-8000-000000000002', 'd7f00000-0000-4000-8000-000000000001', '77f00000-0000-4000-8000-000000000002', '2026-10-08', 80, 'BOB', 'vencido'),
  ('b7f00000-0000-4000-8000-000000000007', 'f7f00000-0000-4000-8000-000000000003', 'd7f00000-0000-4000-8000-000000000001', '77f00000-0000-4000-8000-000000000001', '2026-10-01', 999, 'BOB', 'revisado_asistente');

CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  c_wo CONSTANT uuid := 'd7f00000-0000-4000-8000-000000000001';
  r record;
  v jsonb;
  denied boolean;
  n int;
BEGIN
  -- ── 1. Portón ────────────────────────────────────────────────────────────
  FOREACH n IN ARRAY ARRAY[3, 4] LOOP
    PERFORM pg_temp.impersonate('a7f00000-0000-4000-8000-00000000000' || n);
    denied := false;
    BEGIN
      PERFORM * FROM public.fund_work_order_expense_summary();
    EXCEPTION WHEN insufficient_privilege THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'FUND WO FAIL — el usuario % (sin expense_settlement.read) vio el resumen', n;
    END IF;
    denied := false;
    BEGIN
      PERFORM public.fund_work_order_expense_detail(c_wo);
    EXCEPTION WHEN insufficient_privilege THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'FUND WO FAIL — el usuario % (sin expense_settlement.read) vio el detalle', n;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — un Senior y un Gerente de encargo no ven los gastos por OT';

  -- ── 2. Resumen (Analista de Contabilidad) ──────────────────────────────────
  PERFORM pg_temp.impersonate('a7f00000-0000-4000-8000-000000000002');
  SELECT * INTO r FROM public.fund_work_order_expense_summary() s WHERE s.wo_id = c_wo;
  IF r IS NULL OR r.engagement_code <> '7F01' OR r.client_name <> 'FWO Cliente SA'
     OR r.request_count <> 2 OR r.expense_count <> 4
     OR r.assigned <> 1000 OR r.spent <> 620 OR r.in_process <> 80 OR r.budget <> 3500 THEN
    RAISE EXCEPTION 'FUND WO FAIL — resumen de la OT: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS — resumen: asignado 1000, gastado 620, en proceso 80, presupuesto 3500 (2 solicitudes)';

  -- ── 3. Detalle ─────────────────────────────────────────────────────────────
  v := public.fund_work_order_expense_detail(c_wo);
  IF (v->'totals'->>'assigned')::numeric <> 1000 OR (v->'totals'->>'spent')::numeric <> 620
     OR (v->'totals'->>'in_process')::numeric <> 80 OR (v->'totals'->>'budget')::numeric <> 3500 THEN
    RAISE EXCEPTION 'FUND WO FAIL — totales del detalle: %', v->'totals';
  END IF;
  IF jsonb_array_length(v->'requests') <> 2 THEN
    RAISE EXCEPTION 'FUND WO FAIL — solicitudes del detalle: %', v->'requests';
  END IF;
  IF jsonb_array_length(v->'expenses') <> 4
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v->'expenses') e
                 WHERE e->>'status' IN ('borrador', 'vencido')
                    OR e->>'fund_request_id' = 'f7f00000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'FUND WO FAIL — gastos del detalle (sin borradores, vencidos ni canceladas): %', v->'expenses';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'expenses') e
                  WHERE e->>'fre_id' = 'b7f00000-0000-4000-8000-000000000001'
                    AND e->>'request_number' = 'SF-FWO-1'
                    AND e->>'requester_name' = 'FWO Staff1'
                    AND e->>'expense_type_name' = 'FWO Pasajes') THEN
    RAISE EXCEPTION 'FUND WO FAIL — un gasto no trae su solicitud de origen, solicitante o tipo';
  END IF;
  SELECT
    jsonb_object_agg(b->>'expense_type_name',
                     (b->>'budgeted') || '/' || (b->>'spent') || '/' || (b->>'in_process'))
    INTO v FROM jsonb_array_elements(v->'budget_by_type') b;
  IF v <> '{"FWO Pasajes": "2000.00/500/0", "FWO Viaticos": "1500.00/120/50", "FWO Taxis": "0/0/30"}'::jsonb THEN
    RAISE EXCEPTION 'FUND WO FAIL — presupuesto vs gastado por tipo: %', v;
  END IF;
  RAISE NOTICE 'PASS — detalle: lista plana con su solicitud y presupuesto vs gastado por tipo';

  -- ── 4. Tipo de gasto desactivado (Fase 1.7) ────────────────────────────────
  -- Como dueño: el portón es el trigger, no la RLS.
  EXECUTE 'RESET ROLE';
  UPDATE public.expense_types SET is_active = false
   WHERE expense_type_id = '77f00000-0000-4000-8000-000000000003';
  denied := false;
  BEGIN
    INSERT INTO public.fund_request_expenses (fund_request_id, wo_id, expense_type_id,
                                              expense_date, amount, currency, status)
    VALUES ('f7f00000-0000-4000-8000-000000000002', c_wo, '77f00000-0000-4000-8000-000000000003',
            '2026-10-09', 10, 'BOB', 'borrador');
  EXCEPTION WHEN raise_exception THEN
    denied := SQLERRM LIKE '%desactivado%';
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'FUND WO FAIL — se registró un gasto nuevo con un tipo desactivado';
  END IF;
  denied := false;
  BEGIN
    UPDATE public.wo_expense_budget SET expense_type_id = '77f00000-0000-4000-8000-000000000003'
     WHERE wo_id = c_wo AND expense_type_id = '77f00000-0000-4000-8000-000000000002';
  EXCEPTION WHEN raise_exception THEN
    denied := SQLERRM LIKE '%desactivado%';
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'FUND WO FAIL — un presupuesto pasó a un tipo desactivado';
  END IF;
  -- Lo ya registrado conserva su tipo: reescribir la fila sin cambiar el tipo no dispara la
  -- validación (sin sesión, como un proceso del sistema).
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.fund_request_expenses SET expense_type_id = expense_type_id
   WHERE fre_id = 'b7f00000-0000-4000-8000-000000000003';
  IF (SELECT expense_type_id FROM public.fund_request_expenses
       WHERE fre_id = 'b7f00000-0000-4000-8000-000000000003') <> '77f00000-0000-4000-8000-000000000003' THEN
    RAISE EXCEPTION 'FUND WO FAIL — el gasto existente perdió su tipo desactivado';
  END IF;
  RAISE NOTICE 'PASS — tipo desactivado: no entra en gastos ni presupuestos nuevos; lo registrado se conserva';

  RAISE NOTICE 'FUND EXPENSES BY WORK ORDER: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
