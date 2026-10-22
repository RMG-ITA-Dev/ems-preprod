-- Cobranzas Fases 8 y 9 — issue #352 / packet 0923-206. Plan: docs/plan-cobranzas-consolidado.md §3.
-- Se corre con supabase/tests/local/run-rls-tests.sh contra la base scratch desechable.
-- Una sola transaccion, SIEMPRE hace ROLLBACK.
--
-- Bajo prueba: list_collections_installments(), la RPC detras de la pantalla de Cobranzas.
--   * El rol: Gerente de Contabilidad y Analista de Cobranzas, mas admin. El Analista de
--     Contabilidad queda FUERA (decision Q58 / Q14).
--   * Las cuatro pestanas son DISJUNTAS y salen de la regla unica de mora: una cuota
--     facturada y vencida esta en "en_mora" y no en "por_cobrar". Si no fueran disjuntas, la
--     misma plata se contaria dos veces en la pantalla.
--   * Los totales de la cabecera van POR MONEDA y se calculan sobre el universo FILTRADO,
--     ignorando la pestana abierta: la cabecera describe la cartera, no la pestana.
--   * Los encargos administrativos no entran.
--   * Filtros, busqueda, paginacion y el interruptor de las filas de gastos (Fase 7).
--
-- Salida de exito: un NOTICE por chequeo y al final "COBRANZAS FASE 8: ALL CHECKS PASSED".

BEGIN;

-- La fecha se fija para que las pestanas no dependan del dia en que se corra la prueba.
SELECT set_config('app.fund_today', '2026-06-15', true);

-- ── Fixtures ──────────────────────────────────────────────────────────
INSERT INTO public.practicas (practica_id, name, code, abbreviation)
VALUES ('5e000000-0000-4000-8000-0000000000c1', 'CF8 Practice', 1, 'AUD')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.practicas (practica_id, name, code, abbreviation)
VALUES ('5e000000-0000-4000-8000-0000000000c2', 'CF8 Practice 2', 2, 'TAX')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.society (society_id, name) VALUES
  ('50c00000-0000-4000-8000-0000000000c1', 'CF8 Society A'),
  ('50c00000-0000-4000-8000-0000000000c2', 'CF8 Society B');

-- Un encargo administrativo solo se puede crear contra el cliente interno de SU sociedad
-- (enforce_administrative_engagement_rules, 0722-160), y ese par es dato real: la sociedad y el
-- NIT ya vienen sembrados. Se reusan en vez de inventar otros, que el trigger rechazaria.
INSERT INTO public.society (society_id, name)
VALUES ('50c00000-0000-4000-8000-0000000000c3', 'Ruizmier Pelaez S.R.L.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1000000-0000-4000-8000-0000000000c1', 'CF8 Cliente Uno', 'CF8-TAX-001'),
  ('c1000000-0000-4000-8000-0000000000c2', 'CF8 Cliente Dos', 'CF8-TAX-002');

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c1000000-0000-4000-8000-0000000000c3', 'Ruizmier Pelaez S.R.L.', '1006979026')
ON CONFLICT (unique_tax_id) DO NOTHING;

CREATE FUNCTION pg_temp.impersonate(p_sub uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) VALUES
  ('a1c00000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf8-admin@test.local',      '', now(), now(), now(), '{}', '{}'),
  ('a1c00000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf8-manager@test.local',    '', now(), now(), now(), '{}', '{}'),
  ('a1c00000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf8-collections@test.local','', now(), now(), now(), '{}', '{}'),
  ('a1c00000-0000-4000-8000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf8-acctmgr@test.local',    '', now(), now(), now(), '{}', '{}'),
  ('a1c00000-0000-4000-8000-0000000000c5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf8-acctanalyst@test.local','', now(), now(), now(), '{}', '{}'),
  ('a1c00000-0000-4000-8000-0000000000c6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf8-manager2@test.local',   '', now(), now(), now(), '{}', '{}');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active, practica_id, society_id) VALUES
  ('51c00000-0000-4000-8000-0000000000c1', 'a1c00000-0000-4000-8000-0000000000c1', 'CF8', 'Admin',       true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000c1'),
  ('51c00000-0000-4000-8000-0000000000c2', 'a1c00000-0000-4000-8000-0000000000c2', 'Ana',  'Gerente',    true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000c1'),
  ('51c00000-0000-4000-8000-0000000000c3', 'a1c00000-0000-4000-8000-0000000000c3', 'CF8', 'Collections', true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000c1'),
  ('51c00000-0000-4000-8000-0000000000c4', 'a1c00000-0000-4000-8000-0000000000c4', 'CF8', 'AcctMgr',     true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000c1'),
  ('51c00000-0000-4000-8000-0000000000c5', 'a1c00000-0000-4000-8000-0000000000c5', 'CF8', 'AcctAnalyst', true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000c1'),
  ('51c00000-0000-4000-8000-0000000000c6', 'a1c00000-0000-4000-8000-0000000000c6', 'Beto', 'Gerente2',   true, (SELECT practica_id FROM public.practicas WHERE code = 2), '50c00000-0000-4000-8000-0000000000c2');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a1c00000-0000-4000-8000-0000000000c1', 'admin', 'admin'),
  ('a1c00000-0000-4000-8000-0000000000c2', 'staff', 'manager'),
  ('a1c00000-0000-4000-8000-0000000000c3', 'staff', 'collections_analyst'),
  ('a1c00000-0000-4000-8000-0000000000c4', 'staff', 'accounting_manager'),
  ('a1c00000-0000-4000-8000-0000000000c5', 'staff', 'accounting_analyst'),
  ('a1c00000-0000-4000-8000-0000000000c6', 'staff', 'manager');

-- E1/E2: encargos normales de dos sociedades y practicas distintas, para los filtros.
-- E3: ADMINISTRATIVO (funcion <> 1). No deberia aparecer nunca, ni aunque le colguemos
-- cuotas a mano, que es justamente lo que hace esta prueba.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, practica, funcion, fecha_cierre, society_id, manager_id) VALUES
  ('e0000000-0000-4000-8000-0000000000c1', 'c1000000-0000-4000-8000-0000000000c1', 'CF8 Auditoria Uno', 'CF8-E1', 1, 1,    '2026-12-31', '50c00000-0000-4000-8000-0000000000c1', '51c00000-0000-4000-8000-0000000000c2'),
  ('e0000000-0000-4000-8000-0000000000c2', 'c1000000-0000-4000-8000-0000000000c2', 'CF8 Impuestos Dos', 'CF8-E2', 2, 1,    '2026-12-31', '50c00000-0000-4000-8000-0000000000c2', '51c00000-0000-4000-8000-0000000000c6'),
  ('e0000000-0000-4000-8000-0000000000c3',
   (SELECT client_id FROM public.clients WHERE unique_tax_id = '1006979026'),
   'CF8 Administrativo', 'CF8-E3', 1, 2, '2026-12-31',
   (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'),
   '51c00000-0000-4000-8000-0000000000c2'),
  -- E4 existe solo para colgarle la OT que se queda en Draft: cada encargo lleva UNA OT.
  ('e0000000-0000-4000-8000-0000000000c4', 'c1000000-0000-4000-8000-0000000000c1', 'CF8 Sin Aprobar', 'CF8-E4', 1, 1, '2026-12-31', '50c00000-0000-4000-8000-0000000000c1', '51c00000-0000-4000-8000-0000000000c2');

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-0000000000c1', 'BOB', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000c2', 'e0000000-0000-4000-8000-0000000000c2', 'USD', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000c3', 'e0000000-0000-4000-8000-0000000000c3', 'BOB', 'High', 'Draft'),
  -- Esta queda en Draft a proposito: una OT sin aprobar no se cobra, asi que no se lista.
  ('40000000-0000-4000-8000-0000000000c4', 'e0000000-0000-4000-8000-0000000000c4', 'BOB', 'High', 'Draft');

INSERT INTO public.client_contacts (client_id, contact_type, full_name, email, phone) VALUES
  ('c1000000-0000-4000-8000-0000000000c1', 'general',  'Contacto General Uno', 'general1@test.local', '111'),
  ('c1000000-0000-4000-8000-0000000000c1', 'cobranza', 'Contacto Cobranza Uno', 'cobranza1@test.local', '222'),
  -- El cliente dos SOLO tiene general: la RPC debe caer a ese.
  ('c1000000-0000-4000-8000-0000000000c2', 'general',  'Contacto General Dos', 'general2@test.local', '333');

DO $$
DECLARE
  c_admin       uuid := 'a1c00000-0000-4000-8000-0000000000c1';
  c_manager     uuid := 'a1c00000-0000-4000-8000-0000000000c2';
  c_collections uuid := 'a1c00000-0000-4000-8000-0000000000c3';
  c_acctmgr     uuid := 'a1c00000-0000-4000-8000-0000000000c4';
  c_acctanalyst uuid := 'a1c00000-0000-4000-8000-0000000000c5';
  c_wo1         uuid := '40000000-0000-4000-8000-0000000000c1';
  c_wo2         uuid := '40000000-0000-4000-8000-0000000000c2';
  c_wo3         uuid := '40000000-0000-4000-8000-0000000000c3';
  c_wo4         uuid := '40000000-0000-4000-8000-0000000000c4';
  c_soc_a       uuid := '50c00000-0000-4000-8000-0000000000c1';
  c_mgr2        uuid := '51c00000-0000-4000-8000-0000000000c6';
  c_cli1        uuid := 'c1000000-0000-4000-8000-0000000000c1';
  v_today  date := public.fund_today();
  v_plan1  uuid;
  v_plan2  uuid;
  v_plan3  uuid;
  v_plan4  uuid;
  v_exp    uuid;
  v_res    jsonb;
  v_n      integer;
  v_txt    text;
  v_rate   numeric;
  v_adj    public.wo_installment_adjustments;
  v_i_cobrar  uuid;   -- plan 1, cuota 2: facturada y en plazo
  v_i_cobrada uuid;   -- plan 1, cuota 4: ya cobrada
  v_i_usd     uuid;   -- plan 2, cuota 1: la unica en USD
  -- Seccion 11: una OT en USD con plan en modo fijo.
  c_wo5       uuid := '40000000-0000-4000-8000-0000000000c5';
  v_plan5     uuid;
  v_i51       uuid;
  v_i52       uuid;
  v_row       public.wo_payment_installments;
  denied   boolean;
  -- Seccion 8bis: paginar por orden de trabajo.
  v_total  integer;
  v_off    integer;
  v_ids    text[] := '{}';
  v_pairs  text[] := '{}';
  v_l      integer;
  v_pr     integer;
  v_sum    integer := 0;
BEGIN
  -- ── Plan 1 (OT BOB, sociedad A, practica 1, gerente Ana) ────────────
  -- Cuatro cuotas, una por pestana, para que cada chequeo tenga su caso:
  --   1. Pending con fecha de facturacion dentro del mes  -> por_facturar (y total del mes)
  --   2. Invoiced con vencimiento futuro                  -> por_cobrar
  --   3. Invoiced con vencimiento pasado                  -> en_mora (por fecha)
  --   4. Completed                                        -> cobradas
  PERFORM pg_temp.impersonate(c_manager);
  INSERT INTO public.wo_payment_plan (wo_id, payment_days, exchange_rate, exchange_rate_mode)
  VALUES (c_wo1, 30, 6.96, 'variable') RETURNING plan_id INTO v_plan1;
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES
    (v_plan1, c_wo1, 1, 25, 1000, 'Pending', v_today + 5,  v_today + 35, 6.96, 6.96),
    (v_plan1, c_wo1, 2, 25, 2000, 'Pending', v_today - 20, v_today + 10, 6.96, 6.96),
    (v_plan1, c_wo1, 3, 25, 3000, 'Pending', v_today - 40, v_today - 10, 6.96, 6.96),
    (v_plan1, c_wo1, 4, 25, 4000, 'Pending', v_today - 60, v_today - 30, 6.96, 6.96);

  -- Plan 2 (OT USD, sociedad B, practica 2, gerente Beto): una sola cuota en mora, para
  -- probar que los totales NO mezclan monedas.
  -- El plan lo crea el gerente DE ESE encargo, y el de E2 es Beto.
  PERFORM pg_temp.impersonate('a1c00000-0000-4000-8000-0000000000c6');
  INSERT INTO public.wo_payment_plan (wo_id, payment_days, exchange_rate, exchange_rate_mode)
  VALUES (c_wo2, 30, 6.96, 'variable') RETURNING plan_id INTO v_plan2;
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan2, c_wo2, 1, 100, 500, 'Pending', v_today - 40, v_today - 10, 6.96, 6.96);

  PERFORM pg_temp.impersonate(c_manager);

  -- El encargo ADMINISTRATIVO ni siquiera puede tener plan de pagos: la base lo prohibe
  -- (enforce_administrative_no_payment_plan, 0722-160). O sea que no hay por donde entrar a
  -- cobranzas. Se verifica aca, porque es la garantia real; el filtro por `funcion` de la RPC
  -- es la segunda cerradura, por si alguna fila heredada se saltó esta.
  denied := false;
  BEGIN
    INSERT INTO public.wo_payment_plan (wo_id, payment_days, exchange_rate, exchange_rate_mode)
    VALUES (c_wo3, 30, 6.96, 'variable') RETURNING plan_id INTO v_plan3;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%no admiten plan de pagos%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - un encargo administrativo acepto un plan de pagos';
  END IF;
  RAISE NOTICE 'PASS - un encargo administrativo no llega a tener cuotas que cobrar';

  -- Plan 4: OT que se queda en Draft.
  INSERT INTO public.wo_payment_plan (wo_id, payment_days, exchange_rate, exchange_rate_mode)
  VALUES (c_wo4, 30, 6.96, 'variable') RETURNING plan_id INTO v_plan4;
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan4, c_wo4, 1, 100, 7777, 'Pending', v_today + 5, v_today + 35, 6.96, 6.96);

  -- Se aprueban las tres primeras; la cuarta queda en Draft.
  PERFORM pg_temp.impersonate(c_admin);
  UPDATE public.work_orders SET approval_status = 'Approved'
   WHERE wo_id IN (c_wo1, c_wo2);

  -- Ahora Contabilidad mueve las cuotas a su estado final, por las RPC reales.
  PERFORM pg_temp.impersonate(c_collections);
  PERFORM public.invoice_installment(
    (SELECT installment_id FROM public.wo_payment_installments WHERE plan_id = v_plan1 AND installment_number = 2),
    'Pending', v_today + 10, v_today, 6.96);
  PERFORM public.invoice_installment(
    (SELECT installment_id FROM public.wo_payment_installments WHERE plan_id = v_plan1 AND installment_number = 3),
    'Pending', v_today - 10, v_today - 40, 6.96);
  PERFORM public.invoice_installment(
    (SELECT installment_id FROM public.wo_payment_installments WHERE plan_id = v_plan1 AND installment_number = 4),
    'Pending', v_today - 30, v_today - 60, 6.96);
  PERFORM public.collect_installment(
    (SELECT installment_id FROM public.wo_payment_installments WHERE plan_id = v_plan1 AND installment_number = 4),
    'Invoiced', v_today - 25, 6.96);
  PERFORM public.invoice_installment(
    (SELECT installment_id FROM public.wo_payment_installments WHERE plan_id = v_plan2 AND installment_number = 1),
    'Pending', v_today - 10, v_today - 40, 6.96);

  SELECT installment_id INTO v_i_cobrar  FROM public.wo_payment_installments WHERE plan_id = v_plan1 AND installment_number = 2;
  SELECT installment_id INTO v_i_cobrada FROM public.wo_payment_installments WHERE plan_id = v_plan1 AND installment_number = 4;
  SELECT installment_id INTO v_i_usd     FROM public.wo_payment_installments WHERE plan_id = v_plan2 AND installment_number = 1;

  -- ══════════════════════════════════════════════════════════════════
  -- 1. La puerta de entrada
  -- ══════════════════════════════════════════════════════════════════
  PERFORM pg_temp.impersonate(c_manager);
  denied := false;
  BEGIN
    PERFORM public.list_collections_installments('por_facturar');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'COLLECTIONS_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente del encargo entro a la vista de Cobranzas';
  END IF;

  -- El Analista de Contabilidad tampoco: solo trabaja solicitudes de fondos (Q14).
  PERFORM pg_temp.impersonate(c_acctanalyst);
  denied := false;
  BEGIN
    PERFORM public.list_collections_installments('por_facturar');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'COLLECTIONS_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Contabilidad entro a la vista de Cobranzas';
  END IF;

  -- Y los dos roles de cobranza ven exactamente lo mismo (Q58).
  PERFORM pg_temp.impersonate(c_collections);
  v_res := public.list_collections_installments('en_mora');
  PERFORM pg_temp.impersonate(c_acctmgr);
  IF public.list_collections_installments('en_mora') IS DISTINCT FROM v_res THEN
    RAISE EXCEPTION 'TEST FAIL - el Gerente de Contabilidad y el Analista de Cobranzas ven cosas distintas';
  END IF;
  RAISE NOTICE 'PASS - entran los dos roles de cobranza y nadie mas, y ven lo mismo';

  -- Una pestana inventada se rechaza en vez de devolver una lista vacia enganosa.
  denied := false;
  BEGIN
    PERFORM public.list_collections_installments('todas');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'COLLECTIONS_TAB_INVALID%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - una pestana desconocida devolvio resultados';
  END IF;
  RAISE NOTICE 'PASS - una pestana desconocida se rechaza';

  -- ══════════════════════════════════════════════════════════════════
  -- 2. Las cuatro pestanas, y que sean disjuntas
  -- ══════════════════════════════════════════════════════════════════
  PERFORM pg_temp.impersonate(c_collections);

  -- por_facturar: solo la cuota 1 del plan 1. La de la OT que se quedo en Draft tambien esta
  -- Pending, y tiene que quedar fuera: una OT sin aprobar no se cobra.
  v_res := public.list_collections_installments('por_facturar');
  IF (v_res->>'total_count')::int <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - por_facturar deberia traer 1 cuota, trajo %', v_res->>'total_count';
  END IF;
  IF (v_res->'rows'->0->>'amount')::numeric <> 1000 THEN
    RAISE EXCEPTION 'TEST FAIL - por_facturar trajo la cuota equivocada (monto %)', v_res->'rows'->0->>'amount';
  END IF;
  RAISE NOTICE 'PASS - por_facturar: la OT que no esta aprobada no se cuela';

  -- por_cobrar: facturada y todavia en plazo. La facturada y vencida NO esta aca.
  v_res := public.list_collections_installments('por_cobrar');
  IF (v_res->>'total_count')::int <> 1 OR (v_res->'rows'->0->>'amount')::numeric <> 2000 THEN
    RAISE EXCEPTION 'TEST FAIL - por_cobrar deberia traer solo la cuota de 2000, trajo % filas', v_res->>'total_count';
  END IF;

  -- en_mora: las dos vencidas, una en Bs y otra en USD.
  v_res := public.list_collections_installments('en_mora');
  IF (v_res->>'total_count')::int <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - en_mora deberia traer 2 cuotas, trajo %', v_res->>'total_count';
  END IF;

  -- cobradas: la que ya se cobro.
  v_res := public.list_collections_installments('cobradas');
  IF (v_res->>'total_count')::int <> 1 OR (v_res->'rows'->0->>'amount')::numeric <> 4000 THEN
    RAISE EXCEPTION 'TEST FAIL - cobradas deberia traer solo la cuota de 4000';
  END IF;
  RAISE NOTICE 'PASS - las cuatro pestanas son disjuntas: una cuota vencida esta en en_mora y no en por_cobrar';

  -- Los dias de atraso salen de la fecha de vencimiento VIGENTE, no de la del contrato.
  v_res := public.list_collections_installments('en_mora', p_currency := 'BOB');
  IF (v_res->'rows'->0->>'days_overdue')::int <> 10 THEN
    RAISE EXCEPTION 'TEST FAIL - la cuota vencio hace 10 dias, la RPC dice %', v_res->'rows'->0->>'days_overdue';
  END IF;
  RAISE NOTICE 'PASS - los dias de atraso se cuentan desde el vencimiento vigente';

  -- ══════════════════════════════════════════════════════════════════
  -- 3. Totales: por moneda, y sobre la cartera, no sobre la pestana
  -- ══════════════════════════════════════════════════════════════════
  v_res := public.list_collections_installments('cobradas');
  -- Aunque la pestana abierta sea "cobradas" (1 fila), los totales siguen describiendo todo.
  IF (v_res->'totals'->'por_facturar_mes'->>'BOB')::numeric <> 1000 THEN
    RAISE EXCEPTION 'TEST FAIL - por facturar este mes (BOB) deberia ser 1000, fue %', v_res->'totals'->'por_facturar_mes'->>'BOB';
  END IF;
  -- Facturado sin cobrar: 2000 (en plazo) + 3000 (vencida) en Bs; 500 en USD.
  IF (v_res->'totals'->'facturado_sin_cobrar'->>'BOB')::numeric <> 5000 THEN
    RAISE EXCEPTION 'TEST FAIL - facturado sin cobrar (BOB) deberia ser 5000, fue %', v_res->'totals'->'facturado_sin_cobrar'->>'BOB';
  END IF;
  IF (v_res->'totals'->'facturado_sin_cobrar'->>'USD')::numeric <> 500 THEN
    RAISE EXCEPTION 'TEST FAIL - facturado sin cobrar (USD) deberia ser 500, fue %', v_res->'totals'->'facturado_sin_cobrar'->>'USD';
  END IF;
  -- En mora: 3000 en Bs y 500 en USD, CADA UNO EN LO SUYO. Si en algun momento alguien los
  -- suma, este chequeo es el que lo caza.
  IF (v_res->'totals'->'en_mora'->>'BOB')::numeric <> 3000
     OR (v_res->'totals'->'en_mora'->>'USD')::numeric <> 500 THEN
    RAISE EXCEPTION 'TEST FAIL - los totales en mora se mezclaron entre monedas';
  END IF;
  RAISE NOTICE 'PASS - los totales van por moneda y describen la cartera, no la pestana abierta';

  -- La cuota 1 vence dentro del mes en curso; una del mes que viene no entra en ese total.
  PERFORM pg_temp.impersonate(c_admin);
  UPDATE public.wo_payment_installments
     SET agreed_invoice_date = (date_trunc('month', v_today) + interval '2 months')::date
   WHERE plan_id = v_plan1 AND installment_number = 1;
  PERFORM pg_temp.impersonate(c_collections);
  v_res := public.list_collections_installments('por_facturar');
  IF v_res->'totals'->'por_facturar_mes'->>'BOB' IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL - una cuota de otro mes entro en "por facturar este mes"';
  END IF;
  -- Pero sigue estando en la pestana: lo que cambia es el total del mes, no la lista.
  IF (v_res->>'total_count')::int <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la cuota salio de la pestana por_facturar al mover su fecha';
  END IF;
  RAISE NOTICE 'PASS - "por facturar este mes" mira el mes en curso, y no vacia la pestana';

  PERFORM pg_temp.impersonate(c_admin);
  UPDATE public.wo_payment_installments
     SET agreed_invoice_date = v_today + 5
   WHERE plan_id = v_plan1 AND installment_number = 1;
  PERFORM pg_temp.impersonate(c_collections);

  -- ══════════════════════════════════════════════════════════════════
  -- 4. Filtros y busqueda
  -- ══════════════════════════════════════════════════════════════════
  -- Sociedad: la OT en USD es de la sociedad B.
  v_res := public.list_collections_installments('en_mora', p_society_id := c_soc_a);
  IF (v_res->>'total_count')::int <> 1 OR (v_res->'rows'->0->>'currency') <> 'BOB' THEN
    RAISE EXCEPTION 'TEST FAIL - el filtro por sociedad no dejo solo la cuota de la sociedad A';
  END IF;
  -- Y el total de la cabecera sigue al filtro: ya no hay USD a la vista.
  IF v_res->'totals'->'en_mora'->>'USD' IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL - los totales no siguieron al filtro por sociedad';
  END IF;

  v_res := public.list_collections_installments('en_mora', p_practica := 2);
  IF (v_res->>'total_count')::int <> 1 OR (v_res->'rows'->0->>'currency') <> 'USD' THEN
    RAISE EXCEPTION 'TEST FAIL - el filtro por practica no funciono';
  END IF;

  v_res := public.list_collections_installments('en_mora', p_manager_id := c_mgr2);
  IF (v_res->>'total_count')::int <> 1 OR (v_res->'rows'->0->>'currency') <> 'USD' THEN
    RAISE EXCEPTION 'TEST FAIL - el filtro por gerente no funciono';
  END IF;

  v_res := public.list_collections_installments('en_mora', p_client_id := c_cli1);
  IF (v_res->>'total_count')::int <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el filtro por cliente no funciono';
  END IF;

  -- El buscador mira cliente, codigo y nombre del encargo, sin importar mayusculas.
  v_res := public.list_collections_installments('en_mora', p_search := 'cliente dos');
  IF (v_res->>'total_count')::int <> 1 OR (v_res->'rows'->0->>'currency') <> 'USD' THEN
    RAISE EXCEPTION 'TEST FAIL - el buscador por nombre de cliente no funciono';
  END IF;
  v_res := public.list_collections_installments('en_mora', p_search := 'cf8-e1');
  IF (v_res->>'total_count')::int <> 1 OR (v_res->'rows'->0->>'currency') <> 'BOB' THEN
    RAISE EXCEPTION 'TEST FAIL - el buscador por codigo de encargo no funciono';
  END IF;
  RAISE NOTICE 'PASS - filtros por sociedad, practica, gerente y cliente, y buscador';

  -- Rango de fechas: se aplica sobre la fecha relevante de cada etapa (facturacion antes de
  -- facturar, vencimiento despues).
  v_res := public.list_collections_installments('en_mora', p_date_from := v_today - 11, p_date_to := v_today - 9);
  IF (v_res->>'total_count')::int <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - el rango de fechas deberia dejar las 2 cuotas vencidas el mismo dia, dejo %', v_res->>'total_count';
  END IF;
  v_res := public.list_collections_installments('en_mora', p_date_from := v_today + 1);
  IF (v_res->>'total_count')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el rango de fechas no excluyo nada';
  END IF;
  RAISE NOTICE 'PASS - el rango de fechas mira la fecha que importa en cada etapa';

  -- ══════════════════════════════════════════════════════════════════
  -- 5. Contacto de cobranza en la fila
  -- ══════════════════════════════════════════════════════════════════
  v_res := public.list_collections_installments('en_mora', p_society_id := c_soc_a);
  IF v_res->'rows'->0->'contact'->>'full_name' <> 'Contacto Cobranza Uno' THEN
    RAISE EXCEPTION 'TEST FAIL - deberia venir el contacto de COBRANZA, vino %', v_res->'rows'->0->'contact'->>'full_name';
  END IF;
  -- El cliente dos no tiene contacto de cobranza: cae al general en vez de quedar sin nada.
  v_res := public.list_collections_installments('en_mora', p_practica := 2);
  IF v_res->'rows'->0->'contact'->>'full_name' <> 'Contacto General Dos' THEN
    RAISE EXCEPTION 'TEST FAIL - sin contacto de cobranza deberia caer al general, vino %', v_res->'rows'->0->'contact'->>'full_name';
  END IF;
  RAISE NOTICE 'PASS - la fila trae el contacto de cobranza, o el general como respaldo';

  -- ══════════════════════════════════════════════════════════════════
  -- 6. Las filas de gastos ejecutados (Fase 7)
  -- ══════════════════════════════════════════════════════════════════
  PERFORM pg_temp.impersonate(c_admin);
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, net_amount, status,
     installment_type, currency, agreed_invoice_date, agreed_payment_date)
  VALUES (v_plan1, c_wo1, 5, 0, 750, 750, 'Pending', 'expense_reimbursement', 'BOB',
          v_today + 3, v_today + 33)
  RETURNING installment_id INTO v_exp;

  PERFORM pg_temp.impersonate(c_collections);
  v_res := public.list_collections_installments('por_facturar');
  IF (v_res->>'total_count')::int <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - la fila de gastos deberia aparecer en por_facturar, hay % filas', v_res->>'total_count';
  END IF;
  -- Ordenan por fecha: la de gastos (hoy+3) va antes que la cuota (hoy+5).
  IF v_res->'rows'->0->>'installment_type' <> 'expense_reimbursement' THEN
    RAISE EXCEPTION 'TEST FAIL - la fila de gastos no viene marcada con su tipo';
  END IF;
  -- Y suma en el total del mes como cualquier otra: 1000 + 750.
  IF (v_res->'totals'->'por_facturar_mes'->>'BOB')::numeric <> 1750 THEN
    RAISE EXCEPTION 'TEST FAIL - la fila de gastos no sumo en el total del mes (fue %)', v_res->'totals'->'por_facturar_mes'->>'BOB';
  END IF;

  -- Con el interruptor apagado, desaparece de la lista Y de los totales.
  v_res := public.list_collections_installments('por_facturar', p_include_expense_rows := false);
  IF (v_res->>'total_count')::int <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el interruptor no saco la fila de gastos de la lista';
  END IF;
  IF (v_res->'totals'->'por_facturar_mes'->>'BOB')::numeric <> 1000 THEN
    RAISE EXCEPTION 'TEST FAIL - el interruptor no saco la fila de gastos de los totales';
  END IF;
  RAISE NOTICE 'PASS - las filas de gastos entran marcadas, y el interruptor las saca de la lista y de los totales';

  -- ══════════════════════════════════════════════════════════════════
  -- 7. Paginacion
  -- ══════════════════════════════════════════════════════════════════
  v_res := public.list_collections_installments('por_facturar', p_limit := 1, p_offset := 0);
  IF jsonb_array_length(v_res->'rows') <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la pagina deberia traer 1 fila, trajo %', jsonb_array_length(v_res->'rows');
  END IF;
  -- total_count es el total de la pestana, NO el de la pagina: es lo que necesita el paginador.
  IF (v_res->>'total_count')::int <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - total_count deberia contar toda la pestana, dijo %', v_res->>'total_count';
  END IF;
  v_txt := v_res->'rows'->0->>'installment_id';
  v_res := public.list_collections_installments('por_facturar', p_limit := 1, p_offset := 1);
  IF v_res->'rows'->0->>'installment_id' = v_txt THEN
    RAISE EXCEPTION 'TEST FAIL - la segunda pagina repitio la fila de la primera';
  END IF;
  IF jsonb_array_length(v_res->'rows') <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la segunda pagina no trajo su fila';
  END IF;
  -- Mas alla del final: lista vacia, no error.
  v_res := public.list_collections_installments('por_facturar', p_limit := 1, p_offset := 99);
  IF jsonb_array_length(v_res->'rows') <> 0 OR (v_res->>'total_count')::int <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - pasada la ultima pagina deberia venir una lista vacia con el total intacto';
  END IF;
  RAISE NOTICE 'PASS - la paginacion corta la lista y total_count sigue contando la pestana entera';

  -- Un limite absurdo se acota en vez de tumbar la base.
  v_res := public.list_collections_installments('por_facturar', p_limit := 100000);
  IF (v_res->>'limit')::int <> 200 THEN
    RAISE EXCEPTION 'TEST FAIL - el limite deberia acotarse a 200, quedo %', v_res->>'limit';
  END IF;
  RAISE NOTICE 'PASS - el limite se acota';

  -- ══════════════════════════════════════════════════════════════════
  -- 8. Mora manual y reprogramacion, como las ve la lista
  -- ══════════════════════════════════════════════════════════════════
  -- Mora MANUAL sobre una cuota en plazo (Q3): la lista la muestra en mora igual.
  v_res := public.list_collections_installments('por_cobrar');
  v_txt := v_res->'rows'->0->>'installment_id';
  PERFORM public.set_installment_overdue(v_txt::uuid, 'Invoiced', true);
  v_res := public.list_collections_installments('en_mora', p_society_id := c_soc_a);
  IF (v_res->>'total_count')::int <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - la mora manual no aparecio en la pestana en_mora';
  END IF;
  v_res := public.list_collections_installments('por_cobrar');
  IF (v_res->>'total_count')::int <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - la cuota en mora manual sigue contada en por_cobrar';
  END IF;
  RAISE NOTICE 'PASS - la mora manual mueve la cuota de pestana, sin contarla dos veces';

  -- Se deshace la mora manual: lo que sigue parte de la cuota facturada y en plazo.
  PERFORM public.set_installment_overdue(v_txt::uuid, 'Overdue', false);

  -- ══════════════════════════════════════════════════════════════════
  -- 8bis. El orden lo decide el servidor
  -- ══════════════════════════════════════════════════════════════════
  -- Agrupar por orden de trabajo en la pantalla solo sirve si el servidor devuelve juntas las
  -- cuotas de cada orden: la lista viene PAGINADA, asi que con un orden por fecha una orden de
  -- 12 cuotas puede quedar partida entre dos paginas y el grupo se ve cortado por la mitad.
  PERFORM pg_temp.impersonate(c_collections);

  -- Por 'ot', las dos cuotas del plan 1 que estan en mora salen consecutivas y en su orden de
  -- numeracion, aunque sus fechas digan otra cosa.
  v_res := public.list_collections_installments('por_facturar', p_order := 'ot');
  IF (v_res->'rows'->0->>'wo_id') IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL - el orden por OT no devolvio filas';
  END IF;
  IF (v_res->>'order') <> 'ot' THEN
    RAISE EXCEPTION 'TEST FAIL - la respuesta no informa el orden aplicado';
  END IF;

  -- Las filas de una misma OT quedan CONTIGUAS: ninguna aparece, se interrumpe y vuelve. Se
  -- cuentan los "tramos" (el truco clasico de restar dos ROW_NUMBER): si una OT estuviera
  -- partida, tendria mas de un tramo y el total daria mayor que la cantidad de OT distintas.
  SELECT COUNT(*) INTO v_n FROM (
    SELECT wo FROM (
      SELECT r.value->>'wo_id' AS wo,
             ROW_NUMBER() OVER (ORDER BY r.ordinality)
               - ROW_NUMBER() OVER (PARTITION BY r.value->>'wo_id' ORDER BY r.ordinality) AS grupo
        FROM jsonb_array_elements(v_res->'rows') WITH ORDINALITY AS r(value, ordinality)
    ) q GROUP BY wo, grupo
  ) t;
  IF v_n <> (SELECT COUNT(DISTINCT r.value->>'wo_id') FROM jsonb_array_elements(v_res->'rows') r) THEN
    RAISE EXCEPTION 'TEST FAIL - una orden de trabajo quedo partida en tramos separados';
  END IF;

  -- Contiguas no alcanza: el LIMIT/OFFSET igual cortaba la orden que caia en el borde de la
  -- pagina, y la pantalla la mostraba como dos grupos incompletos en dos paginas seguidas. Con
  -- paginas de UNA fila todo borde cae dentro de alguna orden, asi que es el peor caso: cada
  -- orden tiene que viajar entera en una sola pagina, y entre todas las paginas tienen que
  -- estar todas las filas, cada una una sola vez.
  v_total := (v_res->>'total_count')::int;
  IF v_total = (SELECT COUNT(DISTINCT r.value->>'wo_id') FROM jsonb_array_elements(v_res->'rows') r) THEN
    RAISE EXCEPTION 'TEST FAIL - fixture: ninguna orden tiene dos cuotas por facturar, el chequeo no prueba nada';
  END IF;
  FOR v_off IN 0 .. v_total - 1 LOOP
    v_res := public.list_collections_installments('por_facturar', p_order := 'ot', p_limit := 1, p_offset := v_off);
    v_ids := v_ids || ARRAY(SELECT r.value->>'installment_id' FROM jsonb_array_elements(v_res->'rows') r);
    v_pairs := v_pairs || ARRAY(SELECT DISTINCT (r.value->>'wo_id') || ':' || v_off FROM jsonb_array_elements(v_res->'rows') r);
  END LOOP;
  IF cardinality(v_ids) <> v_total OR (SELECT COUNT(DISTINCT x) FROM unnest(v_ids) x) <> v_total THEN
    RAISE EXCEPTION 'TEST FAIL - paginando por OT se perdieron o repitieron filas (% de %)', cardinality(v_ids), v_total;
  END IF;
  IF EXISTS (SELECT split_part(x, ':', 1) FROM unnest(v_pairs) x GROUP BY 1 HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'TEST FAIL - una orden de trabajo quedo repartida entre dos paginas';
  END IF;

  -- Y el paginador no anuncia paginas vacias. `total_count` cuenta filas, pero por 'ot' una
  -- orden que cruza el borde viaja entera en la pagina anterior: si la ultima lo hace, contar
  -- filas anunciaba una pagina final sin nada. `page_rows` es lo que el paginador cuenta. Se
  -- prueba con paginas del tamano de la orden mas grande, que es el caso que la RPC promete
  -- cubrir (con ordenes mas grandes que la pagina, si puede haber una intermedia vacia).
  v_res := public.list_collections_installments('por_facturar', p_order := 'ot');
  SELECT MAX(n) INTO v_l FROM (
    SELECT COUNT(*) AS n FROM jsonb_array_elements(v_res->'rows') r GROUP BY r.value->>'wo_id'
  ) q;
  v_res := public.list_collections_installments('por_facturar', p_order := 'ot', p_limit := v_l);
  v_pr := (v_res->>'page_rows')::int;
  IF v_pr > v_total THEN
    RAISE EXCEPTION 'TEST FAIL - page_rows (%) no puede superar las filas (%)', v_pr, v_total;
  END IF;
  FOR v_off IN 0 .. ((v_pr + v_l - 1) / v_l) - 1 LOOP
    v_res := public.list_collections_installments('por_facturar', p_order := 'ot', p_limit := v_l, p_offset := v_off * v_l);
    IF jsonb_array_length(v_res->'rows') = 0 THEN
      RAISE EXCEPTION 'TEST FAIL - el paginador anuncio la pagina % y vino vacia', v_off + 1;
    END IF;
    v_sum := v_sum + jsonb_array_length(v_res->'rows');
  END LOOP;
  IF v_sum <> v_total THEN
    RAISE EXCEPTION 'TEST FAIL - las paginas anunciadas suman % filas de %', v_sum, v_total;
  END IF;

  -- Por 'fecha' la pagina sigue siendo de exactamente `limit` filas.
  v_res := public.list_collections_installments('por_facturar', p_order := 'fecha', p_limit := 1);
  IF jsonb_array_length(v_res->'rows') <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - por fecha la pagina no respeta el limite';
  END IF;
  RAISE NOTICE 'PASS - por OT cada orden viaja entera en una sola pagina, sin perder ni repetir filas';

  -- Un orden inventado se rechaza, igual que una pestana inventada.
  denied := false;
  BEGIN
    PERFORM public.list_collections_installments('por_facturar', p_order := 'monto');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'COLLECTIONS_ORDER_INVALID%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se acepto un orden desconocido';
  END IF;
  RAISE NOTICE 'PASS - por OT las cuotas de una orden salen contiguas, y un orden inventado se rechaza';

  -- ══════════════════════════════════════════════════════════════════
  -- 9. Las opciones de los selectores
  -- ══════════════════════════════════════════════════════════════════
  -- Salen de lo que REALMENTE hay para cobrar, no del catalogo entero: un selector con las
  -- sociedades de toda la firma hace elegir una y encontrar la tabla vacia.
  PERFORM pg_temp.impersonate(c_manager);
  denied := false;
  BEGIN
    PERFORM public.collections_filter_options();
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'COLLECTIONS_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente del encargo leyo las opciones de Cobranzas';
  END IF;

  PERFORM pg_temp.impersonate(c_collections);
  v_res := public.collections_filter_options();
  -- Las dos sociedades con cuotas; la del encargo administrativo no tiene ninguna.
  IF jsonb_array_length(v_res->'societies') <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - deberian venir 2 sociedades con cuotas, vinieron %', jsonb_array_length(v_res->'societies');
  END IF;
  IF jsonb_array_length(v_res->'practicas') <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - deberian venir 2 practicas, vinieron %', jsonb_array_length(v_res->'practicas');
  END IF;
  IF jsonb_array_length(v_res->'managers') <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - deberian venir 2 gerentes, vinieron %', jsonb_array_length(v_res->'managers');
  END IF;
  IF NOT (v_res->'currencies' @> '["BOB"]'::jsonb AND v_res->'currencies' @> '["USD"]'::jsonb) THEN
    RAISE EXCEPTION 'TEST FAIL - faltan monedas en las opciones (%)', v_res->'currencies';
  END IF;
  RAISE NOTICE 'PASS - los selectores ofrecen solo lo que tiene cuotas por cobrar';


  -- ══════════════════════════════════════════════════════════════════
  -- 10. Fase 9: ajustes sobre una cuota
  -- ══════════════════════════════════════════════════════════════════
  -- Un ajuste NO pisa el monto de la cuota: es una linea aparte. Lo que el cliente debe es el
  -- monto MAS los ajustes vigentes, y la diferencia entre los dos es lo que despues hay que
  -- poder explicar.
  --
  -- Dos tipos, cada uno con su momento: el descuento se acuerda ANTES de cobrar, y la
  -- diferencia de cambio recien existe DESPUES, porque hasta entonces no hay un segundo TC.

  -- 10.a Los ajustes son de Contabilidad.
  PERFORM pg_temp.impersonate(c_manager);
  denied := false;
  BEGIN
    PERFORM public.add_installment_adjustment(v_i_cobrar, 'descuento', -100, 'rebaja acordada');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente del encargo cargo un ajuste';
  END IF;

  PERFORM pg_temp.impersonate(c_acctanalyst);
  denied := false;
  BEGIN
    PERFORM public.add_installment_adjustment(v_i_cobrar, 'descuento', -100, 'rebaja acordada');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Contabilidad cargo un ajuste';
  END IF;
  RAISE NOTICE 'PASS - los ajustes los carga Contabilidad, no el encargo';

  -- 10.b El motivo es obligatorio: un descuento sin motivo no se puede defender despues.
  PERFORM pg_temp.impersonate(c_collections);
  denied := false;
  BEGIN
    PERFORM public.add_installment_adjustment(v_i_cobrar, 'descuento', -100, '   ');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_REASON_REQUIRED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se cargo un descuento sin motivo';
  END IF;

  -- El signo lo fija el tipo: un "descuento" positivo seria un recargo disfrazado, y el
  -- operador confirmo que los recargos no se usan.
  denied := false;
  BEGIN
    PERFORM public.add_installment_adjustment(v_i_cobrar, 'descuento', 100, 'recargo encubierto');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_AMOUNT_INVALID%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - un descuento positivo entro como ajuste';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.add_installment_adjustment(v_i_cobrar, 'condonacion', -100, 'perdonada');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_TYPE_INVALID%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se acepto un tipo de ajuste que no existe';
  END IF;
  RAISE NOTICE 'PASS - motivo obligatorio, signo fijado por el tipo y solo los dos tipos que existen';

  -- 10.c El descuento NO pisa el monto de la cuota.
  v_adj := public.add_installment_adjustment(v_i_cobrar, 'descuento', -200, 'rebaja acordada con el socio');
  SELECT amount INTO v_rate FROM public.wo_payment_installments WHERE installment_id = v_i_cobrar;
  IF v_rate <> 2000 THEN
    RAISE EXCEPTION 'TEST FAIL - el descuento piso el monto de la cuota (quedo %)', v_rate;
  END IF;
  IF public.installment_adjustments_total(v_i_cobrar, 'BOB') <> -200 THEN
    RAISE EXCEPTION 'TEST FAIL - el total de ajustes deberia ser -200, fue %',
      public.installment_adjustments_total(v_i_cobrar, 'BOB');
  END IF;
  RAISE NOTICE 'PASS - el descuento va aparte: el monto de la cuota sigue siendo el contrato';

  -- 10.d Nunca por debajo de cero: dos descuentos no pueden pasarse del monto entre los dos.
  denied := false;
  BEGIN
    PERFORM public.add_installment_adjustment(v_i_cobrar, 'descuento', -1900, 'rebaja imposible');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_EXCEEDS_AMOUNT%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - los descuentos dejaron la cuota en negativo';
  END IF;
  -- Pero justo hasta el borde si: 2000 - 200 = 1800 es exactamente lo que queda.
  PERFORM public.add_installment_adjustment(v_i_cobrar, 'descuento', -1800, 'se condona el resto');
  IF public.installment_adjustments_total(v_i_cobrar, 'BOB') <> -2000 THEN
    RAISE EXCEPTION 'TEST FAIL - no se pudo descontar exactamente lo que quedaba';
  END IF;
  RAISE NOTICE 'PASS - los descuentos no dejan la cuota en negativo, pero llegan hasta cero';

  -- 10.e La Cobranzas muestra lo que queda por cobrar, no el monto del contrato.
  v_res := public.list_collections_installments('por_cobrar');
  IF (v_res->'rows'->0->>'amount')::numeric <> 2000 THEN
    RAISE EXCEPTION 'TEST FAIL - deberia seguir informando el monto del contrato (2000)';
  END IF;
  IF (v_res->'rows'->0->>'amount_effective')::numeric <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - con 2000 de descuentos no queda nada por cobrar, dijo %',
      v_res->'rows'->0->>'amount_effective';
  END IF;
  -- Y los totales de la cabecera siguen al descuento: antes esta cuota aportaba 2000 a
  -- "facturado sin cobrar". Si el total ignorara los ajustes, la pantalla diria que falta
  -- cobrar plata que ya se decidio no cobrar.
  IF (v_res->'totals'->'facturado_sin_cobrar'->>'BOB')::numeric <> 3000 THEN
    RAISE EXCEPTION 'TEST FAIL - facturado sin cobrar deberia bajar a 3000, fue %',
      v_res->'totals'->'facturado_sin_cobrar'->>'BOB';
  END IF;
  RAISE NOTICE 'PASS - la pantalla y los totales descuentan: informan el contrato Y lo que queda';

  -- 10.f Retirar un ajuste no lo borra, y la plata vuelve.
  v_adj := public.delete_installment_adjustment(v_adj.adjustment_id);
  IF v_adj.deleted_at IS NULL OR v_adj.deleted_by_staff_id IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL - retirar el ajuste no dejo constancia de quien y cuando';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.wo_installment_adjustments
   WHERE adjustment_id = v_adj.adjustment_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el ajuste retirado se borro de verdad';
  END IF;
  IF public.installment_adjustments_total(v_i_cobrar, 'BOB') <> -1800 THEN
    RAISE EXCEPTION 'TEST FAIL - al retirar el descuento de 200 el total deberia quedar en -1800, fue %',
      public.installment_adjustments_total(v_i_cobrar, 'BOB');
  END IF;
  -- Y no se retira dos veces.
  denied := false;
  BEGIN
    PERFORM public.delete_installment_adjustment(v_adj.adjustment_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_ALREADY_DELETED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se retiro dos veces el mismo ajuste';
  END IF;
  -- Los dos movimientos quedan en la bitacora de la cuota: es un cambio de plata, y el
  -- historial es el unico lugar donde queda el rastro ordenado.
  SELECT COUNT(*) INTO v_n FROM public.wo_installment_events
   WHERE installment_id = v_i_cobrar AND action = 'adjustment_removed'
     AND amount = v_adj.amount AND currency = v_adj.currency;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el retiro del ajuste no quedo en la bitacora (hay %)', v_n;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.wo_installment_events
   WHERE installment_id = v_i_cobrar AND action = 'adjustment' AND amount = v_adj.amount;
  IF v_n < 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el alta del ajuste no quedo en la bitacora';
  END IF;
  RAISE NOTICE 'PASS - retirar un ajuste lo marca, no lo borra, y devuelve la plata';

  -- 10.g Cada tipo, en su momento.
  -- Un descuento sobre una cuota YA COBRADA no: lo que el cliente pago ya esta.
  denied := false;
  BEGIN
    PERFORM public.add_installment_adjustment(v_i_cobrada, 'descuento', -100, 'tarde');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_LOCKED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se descontó una cuota que ya se habia cobrado';
  END IF;

  -- Y una diferencia de cambio sobre una cuota que todavia no se cobro tampoco: falta el
  -- segundo TC con el cual compararla.
  denied := false;
  BEGIN
    PERFORM public.add_installment_adjustment(v_i_cobrar, 'diferencia_cambio', 50, 'temprano');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_LOCKED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se cargo una diferencia de cambio antes de cobrar';
  END IF;

  -- Una cuota en Bs no tiene diferencia de cambio: no hay nada que convertir.
  denied := false;
  BEGIN
    PERFORM public.add_installment_adjustment(v_i_cobrada, 'diferencia_cambio', 50, 'sin conversion');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_TYPE_INVALID%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - una cuota en Bs acepto una diferencia de cambio';
  END IF;
  RAISE NOTICE 'PASS - el descuento antes de cobrar, la diferencia de cambio despues y solo si hubo conversion';

  -- 10.h La diferencia de cambio: se sugiere, no se asienta sola.
  -- La cuota en USD se facturo a 6.96 y se cobra a 7.05: 500 * 0.09 = 45 Bs de mas.
  PERFORM public.collect_installment(v_i_usd, 'Invoiced', v_today, 7.05);
  v_rate := public.suggest_exchange_difference(v_i_usd);
  IF v_rate <> 45 THEN
    RAISE EXCEPTION 'TEST FAIL - la diferencia sugerida deberia ser 45 Bs, fue %', v_rate;
  END IF;
  -- Sugerir no es cobrar: hasta que alguien la confirme, no hay ajuste.
  IF public.installment_adjustments_total(v_i_usd, 'BOB') <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - la sugerencia se asento sola';
  END IF;

  v_adj := public.add_installment_adjustment(v_i_usd, 'diferencia_cambio', v_rate, 'TC de cobro mayor al de factura');
  -- Va en Bs aunque la cuota sea en USD: una diferencia entre dos TC es un monto en bolivianos.
  IF v_adj.currency <> 'BOB' THEN
    RAISE EXCEPTION 'TEST FAIL - la diferencia de cambio deberia guardarse en Bs, se guardo en %', v_adj.currency;
  END IF;
  -- Y por eso NO se suma al monto en USD de la cuota: viaja aparte.
  v_res := public.list_collections_installments('cobradas', p_practica := 2);
  IF (v_res->'rows'->0->>'amount_effective')::numeric <> 500 THEN
    RAISE EXCEPTION 'TEST FAIL - la diferencia en Bs se mezclo con el monto en USD (quedo %)',
      v_res->'rows'->0->>'amount_effective';
  END IF;
  IF (v_res->'rows'->0->>'exchange_difference_bob')::numeric <> 45 THEN
    RAISE EXCEPTION 'TEST FAIL - la diferencia de cambio no viaja aparte (fue %)',
      v_res->'rows'->0->>'exchange_difference_bob';
  END IF;
  RAISE NOTICE 'PASS - la diferencia de cambio se sugiere, se confirma, y va en Bs sin mezclarse con la cuota';

  -- Una cuota en Bs no tiene nada que sugerir.
  IF public.suggest_exchange_difference(v_i_cobrada) IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL - una cuota en Bs no deberia sugerir diferencia de cambio';
  END IF;

  -- 10.i Los dos avisos, con su canal.
  SELECT COUNT(*) INTO v_n FROM public.notification_types
   WHERE type_key = 'wo.installment.adjustment_added' AND email_enabled;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el alta de un ajuste deberia salir tambien por correo';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notification_types
   WHERE type_key = 'wo.installment.adjustment_removed' AND email_enabled;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - retirar un ajuste deberia ser solo de campana';
  END IF;
  RAISE NOTICE 'PASS - el alta avisa por campana y correo; retirarlo, solo por campana';


  -- ══════════════════════════════════════════════════════════════════
  -- 11. Hallazgos de la revision previa al PR (2026-10-22)
  -- ══════════════════════════════════════════════════════════════════
  -- Cada bloque fija un bug real que una revision independiente encontro con el modulo ya
  -- "terminado" y probado a mano. Estan aca para que vuelvan a fallar si alguien los reintroduce.
  --
  -- Fixture propio: una OT en USD con plan en modo FIJO y dos cuotas, porque varios de estos
  -- bugs solo aparecen ahi.
  PERFORM pg_temp.impersonate(c_admin);
  INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, practica, funcion, fecha_cierre, society_id, manager_id)
  VALUES ('e0000000-0000-4000-8000-0000000000c5', c_cli1, 'CF8 Revision', 'CF8-E5', 1, 1, '2026-12-31',
          c_soc_a, '51c00000-0000-4000-8000-0000000000c2');
  INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status)
  VALUES (c_wo5, 'e0000000-0000-4000-8000-0000000000c5', 'USD', 'High', 'Draft');

  PERFORM pg_temp.impersonate(c_manager);
  INSERT INTO public.wo_payment_plan (wo_id, payment_days, exchange_rate, exchange_rate_mode)
  VALUES (c_wo5, 30, 6.96, 'fijo') RETURNING plan_id INTO v_plan5;
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan5, c_wo5, 1, 50, 1000, 'Pending', v_today + 5, v_today + 35, 6.96, 6.96)
  RETURNING installment_id INTO v_i51;
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan5, c_wo5, 2, 50, 1000, 'Pending', v_today + 10, v_today + 40, 6.96, 6.96)
  RETURNING installment_id INTO v_i52;

  -- 11.a La moneda de una cuota SE GUARDA al guardar el plan. La pantalla convertia el monto
  -- al cambiar la moneda y lo mandaba, pero la moneda no viajaba: una cuota de USD 1.000 pasada
  -- a Bs quedaba como USD 6.960, un error de 6,96 veces.
  PERFORM public.sync_wo_payment_installments(v_plan5, c_wo5, jsonb_build_array(
    jsonb_build_object('installment_id', v_i51, 'installment_number', 1, 'percentage', 50,
                       'amount', 6960, 'status', 'Pending', 'currency', 'BOB',
                       'agreed_invoice_date', to_char(v_today + 5, 'YYYY-MM-DD'),
                       'agreed_payment_date', to_char(v_today + 35, 'YYYY-MM-DD'),
                       'invoice_exchange_rate', 6.96, 'payment_exchange_rate', 6.96),
    jsonb_build_object('installment_id', v_i52, 'installment_number', 2, 'percentage', 50,
                       'amount', 1000, 'status', 'Pending',
                       'agreed_invoice_date', to_char(v_today + 10, 'YYYY-MM-DD'),
                       'agreed_payment_date', to_char(v_today + 40, 'YYYY-MM-DD'),
                       'invoice_exchange_rate', 6.96, 'payment_exchange_rate', 6.96)));
  SELECT currency INTO v_txt FROM public.wo_payment_installments WHERE installment_id = v_i51;
  IF v_txt IS DISTINCT FROM 'BOB' THEN
    RAISE EXCEPTION 'TEST FAIL - guardar el plan no persistio la moneda de la cuota (quedo %)', v_txt;
  END IF;
  -- Y la otra, que no se toco, sigue en la moneda de la OT (NULL).
  SELECT currency INTO v_txt FROM public.wo_payment_installments WHERE installment_id = v_i52;
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL - la cuota sin moneda propia quedo con %', v_txt;
  END IF;
  RAISE NOTICE 'PASS - guardar el plan persiste la moneda de cada cuota junto con su monto';

  -- Se vuelve a USD para lo que sigue.
  PERFORM public.sync_wo_payment_installments(v_plan5, c_wo5, jsonb_build_array(
    jsonb_build_object('installment_id', v_i51, 'installment_number', 1, 'percentage', 50,
                       'amount', 1000, 'status', 'Pending',
                       'agreed_invoice_date', to_char(v_today + 5, 'YYYY-MM-DD'),
                       'agreed_payment_date', to_char(v_today + 35, 'YYYY-MM-DD'),
                       'invoice_exchange_rate', 6.96, 'payment_exchange_rate', 6.96),
    jsonb_build_object('installment_id', v_i52, 'installment_number', 2, 'percentage', 50,
                       'amount', 1000, 'status', 'Pending',
                       'agreed_invoice_date', to_char(v_today + 10, 'YYYY-MM-DD'),
                       'agreed_payment_date', to_char(v_today + 40, 'YYYY-MM-DD'),
                       'invoice_exchange_rate', 6.96, 'payment_exchange_rate', 6.96)));

  PERFORM pg_temp.impersonate(c_admin);
  UPDATE public.work_orders SET approval_status = 'Approved' WHERE wo_id = c_wo5;

  -- 11.b Una cuota con un descuento vigente NO cambia de moneda. El descuento vive en la moneda
  -- de cuando se cargo y lo que queda por cobrar suma solo los de la moneda actual: cambiarla
  -- hacia desaparecer el descuento en silencio, de los totales y del tope.
  PERFORM pg_temp.impersonate(c_collections);
  v_adj := public.add_installment_adjustment(v_i52, 'descuento', -100, 'rebaja acordada');

  PERFORM pg_temp.impersonate(c_admin);
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET currency = 'BOB' WHERE installment_id = v_i52;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_CURRENCY_HAS_ADJUSTMENTS%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se cambio la moneda de una cuota con un descuento vigente';
  END IF;

  -- Retirado el descuento, el cambio si pasa: el orden queda explicito en el historial.
  PERFORM pg_temp.impersonate(c_collections);
  PERFORM public.delete_installment_adjustment(v_adj.adjustment_id);
  PERFORM pg_temp.impersonate(c_admin);
  UPDATE public.wo_payment_installments SET currency = 'BOB' WHERE installment_id = v_i52;
  UPDATE public.wo_payment_installments SET currency = NULL  WHERE installment_id = v_i52;
  RAISE NOTICE 'PASS - con un ajuste vigente la moneda no cambia; retirado, si';

  -- 11.c En modo FIJO, el TC de PAGO se puede corregir al cobrar -- la misma ventana que ya
  -- tenia el de facturacion (Q49). Antes el dialogo de cobro ofrecia un TC editable y cobrar
  -- con otro valor revento con EXCHANGE_RATE_LOCKED: la cuota no se podia cobrar.
  PERFORM pg_temp.impersonate(c_collections);

  -- 11.c-pre Una cuota en USD no se factura ni se cobra SIN TC: el que se congela al pasar de
  -- estado ya no se puede completar despues. Se le borran los TC sin los guards (subbloque que
  -- se deshace solo) y se intenta facturar sin mandar ninguno.
  denied := false;
  BEGIN
    PERFORM set_config('session_replication_role', 'replica', true);
    UPDATE public.wo_payment_installments
       SET invoice_exchange_rate = NULL, payment_exchange_rate = NULL
     WHERE installment_id = v_i51;
    PERFORM set_config('session_replication_role', 'origin', true);
    BEGIN
      PERFORM public.invoice_installment(v_i51, 'Pending', v_today + 30, v_today, NULL);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'EXCHANGE_RATE_REQUIRED%' THEN denied := true; ELSE RAISE; END IF;
    END;
    RAISE EXCEPTION USING ERRCODE = 'UE11C', MESSAGE = 'deshacer';
  EXCEPTION WHEN SQLSTATE 'UE11C' THEN
    NULL;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se facturo una cuota en USD sin tipo de cambio';
  END IF;
  -- Y cobrar tampoco: facturada con TC pero sin TC de pago ni uno nuevo.
  denied := false;
  BEGIN
    PERFORM public.invoice_installment(v_i51, 'Pending', v_today + 30, v_today, 6.96);
    PERFORM set_config('session_replication_role', 'replica', true);
    UPDATE public.wo_payment_installments SET payment_exchange_rate = NULL WHERE installment_id = v_i51;
    PERFORM set_config('session_replication_role', 'origin', true);
    BEGIN
      PERFORM public.collect_installment(v_i51, 'Invoiced', v_today, NULL);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'EXCHANGE_RATE_REQUIRED%' THEN denied := true; ELSE RAISE; END IF;
    END;
    RAISE EXCEPTION USING ERRCODE = 'UE11D', MESSAGE = 'deshacer';
  EXCEPTION WHEN SQLSTATE 'UE11D' THEN
    NULL;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se cobro una cuota en USD sin tipo de cambio de pago';
  END IF;
  RAISE NOTICE 'PASS - una cuota en moneda extranjera no se factura ni se cobra sin TC';

  PERFORM public.invoice_installment(v_i51, 'Pending', v_today + 30, v_today, 6.96);
  v_row := public.collect_installment(v_i51, 'Invoiced', v_today, 7.10);
  IF v_row.payment_exchange_rate <> 7.10 THEN
    RAISE EXCEPTION 'TEST FAIL - en modo fijo no se pudo cobrar con otro TC (quedo %)', v_row.payment_exchange_rate;
  END IF;

  -- Fuera de esa ventana, el modo fijo sigue mandando: el TC de pago de una cuota facturada no
  -- se mueve suelto.
  PERFORM public.invoice_installment(v_i52, 'Pending', v_today + 30, v_today, 6.96);
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET payment_exchange_rate = 7.20 WHERE installment_id = v_i52;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - en modo fijo se movio el TC de pago fuera del cobro';
  END IF;
  RAISE NOTICE 'PASS - en modo fijo el TC de pago se corrige al cobrar, y solo ahi';

  -- 11.d Los gastos facturables NO los lee cualquiera. La funcion es SECURITY DEFINER para
  -- saltar la RLS de fondos, y por eso mismo tiene que chequear el rol: sin el, cualquier
  -- usuario con sesion se llevaba los gastos aprobados de cualquier OT.
  PERFORM pg_temp.impersonate(c_manager);
  denied := false;
  BEGIN
    PERFORM public.wo_billable_expenses(c_wo1);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXPENSE_ROW_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - un usuario sin rol de cobranza leyo los gastos facturables';
  END IF;
  RAISE NOTICE 'PASS - los gastos por facturar solo los ve contabilidad';

  -- 11.e Una cuota en USD con descuento: la diferencia de cambio se sugiere sobre lo que el
  -- cliente REALMENTE pago. USD 1.000 - 100 de descuento = 900, facturada a 6,96 y cobrada a
  -- 7,10: 900 x 0,14 = 126 Bs. Sobre el monto del contrato habria dado 140, de mas.
  PERFORM pg_temp.impersonate(c_collections);
  v_adj := public.add_installment_adjustment(v_i52, 'descuento', -100, 'pronto pago');
  PERFORM public.collect_installment(v_i52, 'Invoiced', v_today, 7.10);
  v_rate := public.suggest_exchange_difference(v_i52);
  IF v_rate <> 126 THEN
    RAISE EXCEPTION 'TEST FAIL - la diferencia sugerida deberia ser 126 Bs (sobre 900), fue %', v_rate;
  END IF;
  RAISE NOTICE 'PASS - la diferencia de cambio se sugiere sobre lo cobrado, no sobre el contrato';

  -- 11.f Con la cuota cobrada, su descuento ya no se retira: subiria lo "cobrado" de una cuota
  -- cerrada. Es la misma regla que impide cargarlo despues de cobrar.
  denied := false;
  BEGIN
    PERFORM public.delete_installment_adjustment(v_adj.adjustment_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_LOCKED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se retiro el descuento de una cuota ya cobrada';
  END IF;

  -- La diferencia de cambio, en cambio, solo existe con la cuota cobrada: esa si se retira.
  v_adj := public.add_installment_adjustment(v_i52, 'diferencia_cambio', v_rate, 'TC de cobro');
  -- Una sola vigente: un segundo envio la sumaba dos veces en exchange_difference_bob.
  denied := false;
  BEGIN
    PERFORM public.add_installment_adjustment(v_i52, 'diferencia_cambio', v_rate, 'doble envio');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ADJUSTMENT_DUPLICATE%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se registraron dos diferencias de cambio vigentes en la misma cuota';
  END IF;
  v_adj := public.delete_installment_adjustment(v_adj.adjustment_id);
  IF v_adj.deleted_at IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL - no se pudo retirar la diferencia de cambio de una cuota cobrada';
  END IF;
  RAISE NOTICE 'PASS - cobrada la cuota, su descuento queda fijo; la diferencia de cambio se puede retirar';

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'COBRANZAS FASES 8 Y 9: ALL CHECKS PASSED';
END $$;

ROLLBACK;
