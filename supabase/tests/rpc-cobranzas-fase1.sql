-- Cobranzas Fases 1 a 7 — issue #352 / packet 0923-206. Plan: docs/plan-cobranzas-consolidado.md §3.
-- Se corre con supabase/tests/local/run-rls-tests.sh contra la base scratch desechable.
-- Una sola transaccion, SIEMPRE hace ROLLBACK.
--
-- Bajo prueba:
--   * installment_calendar_state(): la REGLA UNICA de mora que reemplaza a los cinco
--     criterios distintos que convivian (pantalla, indicador de la pestana, contador de
--     avisos, dashboards y una funcion muerta), ninguno de los cuales miraba la fecha de
--     vencimiento real. Decision del operador Q4: la mora se cuenta desde la fecha de
--     facturacion REAL mas los dias habiles del plan (collection_payment_date), y antes de
--     facturar NO hay mora, como mucho "facturacion atrasada".
--   * is_collections_role(): paridad entre accounting_manager (Gerente de Contabilidad) y
--     collections_analyst (Analista de Cobranzas) -- decision del operador Q58. El
--     accounting_analyst (Analista de Contabilidad) queda FUERA de cobranzas.
--   * Las 3 RPC de cobranza (invoice_installment / collect_installment /
--     set_installment_overdue): rol, OT aprobada, estado esperado (concurrencia), fechas
--     validas, y el congelado del TC en la misma sentencia que la transicion.
--   * wo_installment_events: la bitacora se escribe sola y nadie la puede editar.
--
-- Salida de exito: un NOTICE por chequeo y al final
-- "COBRANZAS FASES 1 A 7: ALL CHECKS PASSED".

BEGIN;

-- ── Fixtures ──────────────────────────────────────────────────────────
INSERT INTO public.practicas (practica_id, name, code, abbreviation)
VALUES ('5e000000-0000-4000-8000-0000000000f1', 'CF1 Practice', 1, 'AUD')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.society (society_id, name)
VALUES ('50c00000-0000-4000-8000-0000000000f1', 'CF1 Society');

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c1000000-0000-4000-8000-0000000000f1', 'CF1 Client', 'CF1-TAX-001');

CREATE FUNCTION pg_temp.impersonate(p_sub uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) VALUES
  ('a1c00000-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf1-admin@test.local',      '', now(), now(), now(), '{}', '{}'),
  ('a1c00000-0000-4000-8000-0000000000f2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf1-manager@test.local',    '', now(), now(), now(), '{}', '{}'),
  ('a1c00000-0000-4000-8000-0000000000f3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf1-collections@test.local','', now(), now(), now(), '{}', '{}'),
  ('a1c00000-0000-4000-8000-0000000000f4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf1-acctmgr@test.local',    '', now(), now(), now(), '{}', '{}'),
  ('a1c00000-0000-4000-8000-0000000000f5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf1-acctanalyst@test.local','', now(), now(), now(), '{}', '{}'),
  ('a1c00000-0000-4000-8000-0000000000f6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf1-partner@test.local',     '', now(), now(), now(), '{}', '{}');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active, practica_id, society_id) VALUES
  ('51c00000-0000-4000-8000-0000000000f1', 'a1c00000-0000-4000-8000-0000000000f1', 'CF1', 'Admin',       true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000f1'),
  ('51c00000-0000-4000-8000-0000000000f2', 'a1c00000-0000-4000-8000-0000000000f2', 'CF1', 'Manager',     true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000f1'),
  ('51c00000-0000-4000-8000-0000000000f3', 'a1c00000-0000-4000-8000-0000000000f3', 'CF1', 'Collections', true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000f1'),
  ('51c00000-0000-4000-8000-0000000000f4', 'a1c00000-0000-4000-8000-0000000000f4', 'CF1', 'AcctMgr',     true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000f1'),
  ('51c00000-0000-4000-8000-0000000000f5', 'a1c00000-0000-4000-8000-0000000000f5', 'CF1', 'AcctAnalyst', true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000f1'),
  ('51c00000-0000-4000-8000-0000000000f6', 'a1c00000-0000-4000-8000-0000000000f6', 'CF1', 'Partner',     true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000f1');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a1c00000-0000-4000-8000-0000000000f1', 'admin', 'admin'),
  ('a1c00000-0000-4000-8000-0000000000f2', 'staff', 'manager'),
  ('a1c00000-0000-4000-8000-0000000000f3', 'staff', 'collections_analyst'),
  ('a1c00000-0000-4000-8000-0000000000f4', 'staff', 'accounting_manager'),
  ('a1c00000-0000-4000-8000-0000000000f5', 'staff', 'accounting_analyst'),
  ('a1c00000-0000-4000-8000-0000000000f6', 'staff', 'partner');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id, manager_id, partner_id) VALUES
  ('e0000000-0000-4000-8000-0000000000f1', 'c1000000-0000-4000-8000-0000000000f1', 'CF1 E1', 1, '2026-12-31', '50c00000-0000-4000-8000-0000000000f1', '51c00000-0000-4000-8000-0000000000f2', '51c00000-0000-4000-8000-0000000000f6'),
  ('e0000000-0000-4000-8000-0000000000f2', 'c1000000-0000-4000-8000-0000000000f1', 'CF1 E2', 1, '2026-12-31', '50c00000-0000-4000-8000-0000000000f1', '51c00000-0000-4000-8000-0000000000f2', '51c00000-0000-4000-8000-0000000000f6'),
  -- Fase 6: dos encargos mas, para el modo fijo y para el resincronizado del plan.
  ('e0000000-0000-4000-8000-0000000000f3', 'c1000000-0000-4000-8000-0000000000f1', 'CF1 E3', 1, '2026-12-31', '50c00000-0000-4000-8000-0000000000f1', '51c00000-0000-4000-8000-0000000000f2', '51c00000-0000-4000-8000-0000000000f6'),
  ('e0000000-0000-4000-8000-0000000000f4', 'c1000000-0000-4000-8000-0000000000f1', 'CF1 E4', 1, '2026-12-31', '50c00000-0000-4000-8000-0000000000f1', '51c00000-0000-4000-8000-0000000000f2', '51c00000-0000-4000-8000-0000000000f6'),
  -- Fase 7: uno con plan de honorarios y otro sin plan, para facturar los gastos ejecutados.
  ('e0000000-0000-4000-8000-0000000000f5', 'c1000000-0000-4000-8000-0000000000f1', 'CF1 E5', 1, '2026-12-31', '50c00000-0000-4000-8000-0000000000f1', '51c00000-0000-4000-8000-0000000000f2', '51c00000-0000-4000-8000-0000000000f6'),
  ('e0000000-0000-4000-8000-0000000000f6', 'c1000000-0000-4000-8000-0000000000f1', 'CF1 E6', 1, '2026-12-31', '50c00000-0000-4000-8000-0000000000f1', '51c00000-0000-4000-8000-0000000000f2', '51c00000-0000-4000-8000-0000000000f6');

-- Las OT nacen en Draft: el guard del plan (20260908150000) solo permite CREAR el plan
-- mientras la OT no este aprobada. Se aprueban despues, como en el flujo real.
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000f1', 'e0000000-0000-4000-8000-0000000000f1', 'BOB', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000f2', 'e0000000-0000-4000-8000-0000000000f2', 'BOB', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000f3', 'e0000000-0000-4000-8000-0000000000f3', 'BOB', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000f4', 'e0000000-0000-4000-8000-0000000000f4', 'BOB', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000f5', 'e0000000-0000-4000-8000-0000000000f5', 'BOB', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000f6', 'e0000000-0000-4000-8000-0000000000f6', 'BOB', 'High', 'Draft');

DO $$
DECLARE
  c_admin       uuid := 'a1c00000-0000-4000-8000-0000000000f1';
  c_manager     uuid := 'a1c00000-0000-4000-8000-0000000000f2';
  c_collections uuid := 'a1c00000-0000-4000-8000-0000000000f3';
  c_acctmgr     uuid := 'a1c00000-0000-4000-8000-0000000000f4';
  c_acctanalyst uuid := 'a1c00000-0000-4000-8000-0000000000f5';
  c_partner     uuid := 'a1c00000-0000-4000-8000-0000000000f6';
  c_wo1         uuid := '40000000-0000-4000-8000-0000000000f1';
  c_wo2         uuid := '40000000-0000-4000-8000-0000000000f2';
  c_wo3         uuid := '40000000-0000-4000-8000-0000000000f3';
  c_wo4         uuid := '40000000-0000-4000-8000-0000000000f4';
  c_wo5         uuid := '40000000-0000-4000-8000-0000000000f5';
  c_wo6         uuid := '40000000-0000-4000-8000-0000000000f6';
  v_today  date := public.fund_today();
  v_plan1  uuid;
  v_plan2  uuid;
  v_i1     uuid;
  v_i2     uuid;
  v_i3     uuid;
  v_draft  uuid;
  v_row    public.wo_payment_installments;
  v_n      integer;
  v_txt    text;
  v_note   uuid;
  v_i3x    uuid;
  v_i4     uuid;
  v_plan3  uuid;
  v_plan4  uuid;
  v_rate   numeric;
  v_plan5  uuid;
  v_i5     uuid;
  v_i6     uuid;
  v_fr1    uuid := 'f4000000-0000-4000-8000-0000000000f1';
  v_fr2    uuid := 'f4000000-0000-4000-8000-0000000000f2';
  denied   boolean;
BEGIN
  -- ══════════════════════════════════════════════════════════════════
  -- 1. installment_calendar_state(): la regla unica
  -- ══════════════════════════════════════════════════════════════════

  -- El bug central de #352: una cuota SIN FACTURAR con su fecha pasada NO es mora.
  IF public.installment_calendar_state('Pending', '2026-10-01', NULL, '2026-10-15') <> 'billing_late' THEN
    RAISE EXCEPTION 'TEST FAIL - una cuota sin facturar y atrasada deberia ser billing_late';
  END IF;
  IF public.installment_calendar_state('Pending', '2026-10-20', NULL, '2026-10-15') <> 'billing_due_soon' THEN
    RAISE EXCEPTION 'TEST FAIL - una cuota a 5 dias de facturarse deberia ser billing_due_soon';
  END IF;
  IF public.installment_calendar_state('Pending', '2026-11-30', NULL, '2026-10-15') <> 'on_track' THEN
    RAISE EXCEPTION 'TEST FAIL - una cuota lejana deberia estar en plazo';
  END IF;
  RAISE NOTICE 'PASS - sin facturar: atraso de facturacion, nunca mora';

  -- Decision Q4: la mora se mide contra el vencimiento REAL, no contra el pactado.
  IF public.installment_calendar_state('Invoiced', '2026-09-01', '2026-10-30', '2026-10-15') <> 'on_track' THEN
    RAISE EXCEPTION 'TEST FAIL - facturada tarde, con vencimiento real futuro, no es mora';
  END IF;
  IF public.installment_calendar_state('Invoiced', '2026-09-01', '2026-10-14', '2026-10-15') <> 'overdue' THEN
    RAISE EXCEPTION 'TEST FAIL - facturada y pasada su fecha de vencimiento real deberia ser mora';
  END IF;
  IF public.installment_calendar_state('Invoiced', NULL, '2026-10-15', '2026-10-15') <> 'payment_due_soon' THEN
    RAISE EXCEPTION 'TEST FAIL - el dia del vencimiento todavia no es mora';
  END IF;
  RAISE NOTICE 'PASS - la mora se cuenta desde el vencimiento real (Q4)';

  -- Q3: la mora MANUAL se mantiene, y manda aunque la fecha no haya pasado.
  IF public.installment_calendar_state('Overdue', NULL, '2026-12-31', '2026-10-15') <> 'overdue' THEN
    RAISE EXCEPTION 'TEST FAIL - la mora manual deberia seguir siendo mora';
  END IF;
  IF public.installment_calendar_state('Completed', '2026-01-01', '2026-02-01', '2026-10-15') <> 'closed' THEN
    RAISE EXCEPTION 'TEST FAIL - una cuota cobrada deberia quedar cerrada';
  END IF;
  RAISE NOTICE 'PASS - mora manual y cuota cobrada';

  -- El envoltorio resuelve las fechas vigentes: reprogramar saca a la cuota del atraso
  -- SIN tocar el contrato (lo que #352 pide para no confundir las dos cosas).
  IF public.wo_installment_calendar_state('Pending', '2026-10-01', NULL, NULL, NULL, '2026-10-15') <> 'billing_late' THEN
    RAISE EXCEPTION 'TEST FAIL - sin reprogramar deberia valer la fecha del contrato';
  END IF;
  IF public.wo_installment_calendar_state('Pending', '2026-10-01', '2026-11-01', NULL, NULL, '2026-10-15') <> 'on_track' THEN
    RAISE EXCEPTION 'TEST FAIL - reprogramada al mes siguiente deberia salir del atraso';
  END IF;
  RAISE NOTICE 'PASS - la fecha vigente manda sobre la pactada, sin perderla';

  -- ══════════════════════════════════════════════════════════════════
  -- 2. is_collections_role(): paridad de los dos roles de Contabilidad (Q58)
  -- ══════════════════════════════════════════════════════════════════
  PERFORM pg_temp.impersonate(c_collections);
  IF NOT public.is_collections_role() THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Cobranzas deberia ser rol de cobranza';
  END IF;
  PERFORM pg_temp.impersonate(c_acctmgr);
  IF NOT public.is_collections_role() THEN
    RAISE EXCEPTION 'TEST FAIL - el Gerente de Contabilidad deberia ser rol de cobranza (Q58)';
  END IF;
  PERFORM pg_temp.impersonate(c_acctanalyst);
  IF public.is_collections_role() THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Contabilidad NO hace cobranzas (Q14)';
  END IF;
  PERFORM pg_temp.impersonate(c_manager);
  IF public.is_collections_role() THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente del encargo no es rol de cobranza';
  END IF;
  RAISE NOTICE 'PASS - is_collections_role: Gerente de Contabilidad y Analista de Cobranzas, nadie mas';

  -- ══════════════════════════════════════════════════════════════════
  -- Fixtures de plan y cuotas (como gerente del encargo, que es quien arma el plan)
  -- ══════════════════════════════════════════════════════════════════
  PERFORM pg_temp.impersonate(c_manager);
  -- Modo 'variable': el TC se captura por cuota al facturar y al cobrar, que es el camino
  -- que ejercitan las RPC. En modo 'fijo' el guard exige que coincida con el del plan, asi
  -- que no habria nada que capturar.
  INSERT INTO public.wo_payment_plan (wo_id, payment_days, exchange_rate, exchange_rate_mode)
  VALUES (c_wo1, 30, 6.96, 'variable') RETURNING plan_id INTO v_plan1;
  INSERT INTO public.wo_payment_plan (wo_id, payment_days, exchange_rate)
  VALUES (c_wo2, 30, 6.96) RETURNING plan_id INTO v_plan2;

  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan1, c_wo1, 1, 50, 500, 'Pending', v_today - 10, v_today + 20, 6.96, 6.96)
  RETURNING installment_id INTO v_i1;
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan1, c_wo1, 2, 50, 500, 'Pending', v_today + 30, v_today + 60, 6.96, 6.96)
  RETURNING installment_id INTO v_i2;
  -- La de la OT que se queda en Draft, para el chequeo de "OT no aprobada".
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan2, c_wo2, 1, 100, 900, 'Pending', v_today, v_today + 30, 6.96, 6.96)
  RETURNING installment_id INTO v_draft;

  -- Aprobar la OT va como ADMIN: wo_guard_partner_signature (Carril B / B3e-2) exige la
  -- firma del socio como invariante de "Aprobada", y deja pasar solo a admin. Aca interesa
  -- el estado de la OT, no el circuito de firma.
  PERFORM pg_temp.impersonate(c_admin);
  -- Fase 6: una cuota mas de c_wo1 que queda Pendiente a proposito, para probar la moneda.
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan1, c_wo1, 3, 0, 0, 'Pending', v_today + 90, v_today + 120, 6.96, 6.96)
  RETURNING installment_id INTO v_i3x;

  UPDATE public.work_orders SET approval_status = 'Approved' WHERE wo_id = c_wo1;

  -- ══════════════════════════════════════════════════════════════════
  -- 3. invoice_installment(): rol, aprobacion, fechas y concurrencia
  -- ══════════════════════════════════════════════════════════════════

  -- 3.a El gerente del encargo NO factura: facturar es de Contabilidad.
  PERFORM pg_temp.impersonate(c_manager);
  denied := false;
  BEGIN
    PERFORM public.invoice_installment(v_i1, 'Pending', v_today + 30, v_today, 6.96);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente del encargo pudo facturar una cuota';
  END IF;

  -- 3.b El Analista de Contabilidad tampoco (Q14).
  PERFORM pg_temp.impersonate(c_acctanalyst);
  denied := false;
  BEGIN
    PERFORM public.invoice_installment(v_i1, 'Pending', v_today + 30, v_today, 6.96);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Contabilidad pudo facturar una cuota';
  END IF;
  RAISE NOTICE 'PASS - facturar es solo de Contabilidad (gerente y analista contable rechazados)';

  -- 3.c Con la OT todavia en Draft, nadie factura.
  PERFORM pg_temp.impersonate(c_collections);
  denied := false;
  BEGIN
    PERFORM public.invoice_installment(v_draft, 'Pending', v_today + 30, v_today, 6.96);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_LOCKED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se pudo facturar una cuota de una OT sin aprobar';
  END IF;
  RAISE NOTICE 'PASS - facturar exige la OT aprobada';

  -- 3.d Fecha futura y vencimiento incoherente: rechazados.
  denied := false;
  BEGIN
    PERFORM public.invoice_installment(v_i1, 'Pending', v_today + 30, v_today + 1, 6.96);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_DATE_FUTURE%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se acepto una fecha de facturacion futura';
  END IF;

  denied := false;
  BEGIN
    -- 400 dias de vencimiento no corresponden a un plan de 30 dias de pago.
    PERFORM public.invoice_installment(v_i1, 'Pending', v_today + 400, v_today, 6.96);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_DUE_DATE_INVALID%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se acepto un vencimiento arbitrario';
  END IF;
  RAISE NOTICE 'PASS - fechas validadas (ni futura ni vencimiento inventado)';

  -- 3.e Camino feliz, como Analista de Cobranzas. Congela el TC en la misma sentencia.
  v_row := public.invoice_installment(v_i1, 'Pending', v_today + 30, v_today, 7.01);
  IF v_row.status <> 'Invoiced'
     OR v_row.collection_invoice_date <> v_today
     OR v_row.collection_payment_date <> v_today + 30
     OR v_row.invoice_exchange_rate <> 7.01 THEN
    RAISE EXCEPTION 'TEST FAIL - facturar no dejo la cuota como corresponde: %', v_row;
  END IF;
  RAISE NOTICE 'PASS - facturar registra estado, fechas y TC en una sola escritura';

  -- 3.f Concurrencia: la segunda persona que llega con la pantalla vieja no pisa nada.
  denied := false;
  BEGIN
    PERFORM public.invoice_installment(v_i1, 'Pending', v_today + 30, v_today, 7.01);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_STALE%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - una segunda facturacion concurrente no fue rechazada';
  END IF;
  RAISE NOTICE 'PASS - el estado esperado protege de la doble aplicacion';

  -- 3.g Y el Gerente de Contabilidad puede exactamente lo mismo (Q58).
  PERFORM pg_temp.impersonate(c_acctmgr);
  v_row := public.invoice_installment(v_i2, 'Pending', v_today + 25, v_today, 6.96);
  IF v_row.status <> 'Invoiced' THEN
    RAISE EXCEPTION 'TEST FAIL - el Gerente de Contabilidad no pudo facturar';
  END IF;
  RAISE NOTICE 'PASS - el Gerente de Contabilidad factura igual que el Analista de Cobranzas';

  -- ══════════════════════════════════════════════════════════════════
  -- 4. Mora manual y cobro
  -- ══════════════════════════════════════════════════════════════════
  PERFORM pg_temp.impersonate(c_collections);

  v_row := public.set_installment_overdue(v_i1, 'Invoiced', true);
  IF v_row.status <> 'Overdue' THEN
    RAISE EXCEPTION 'TEST FAIL - no se pudo marcar la mora manual';
  END IF;
  -- Volver atras conserva las fechas de cobranza: la cuota siguio facturada todo el tiempo.
  v_row := public.set_installment_overdue(v_i1, 'Overdue', false);
  IF v_row.status <> 'Invoiced' OR v_row.collection_invoice_date IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL - revertir la mora perdio las fechas de cobranza: %', v_row;
  END IF;
  RAISE NOTICE 'PASS - la mora manual va y vuelve sin perder las fechas';

  -- Cobrar: fecha real, nunca futura ni anterior a la factura.
  denied := false;
  BEGIN
    PERFORM public.collect_installment(v_i1, 'Invoiced', v_today + 1);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_DATE_FUTURE%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se acepto una fecha de pago futura';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.collect_installment(v_i1, 'Invoiced', v_today - 5);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_DATE_BEFORE_INVOICE%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se acepto un pago anterior a la facturacion';
  END IF;

  v_row := public.collect_installment(v_i1, 'Invoiced', v_today, 7.05);
  IF v_row.status <> 'Completed'
     OR v_row.payment_date_actual <> v_today
     OR v_row.payment_exchange_rate <> 7.05 THEN
    RAISE EXCEPTION 'TEST FAIL - cobrar no dejo la cuota como corresponde: %', v_row;
  END IF;
  RAISE NOTICE 'PASS - cobrar valida la fecha real y congela el TC de pago';

  -- Cobrada es terminal.
  denied := false;
  BEGIN
    PERFORM public.set_installment_overdue(v_i1, 'Completed', true);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INVALID_STATUS_TRANSITION%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - una cuota cobrada acepto volver a mora';
  END IF;
  RAISE NOTICE 'PASS - cobrada es terminal';

  -- ══════════════════════════════════════════════════════════════════
  -- 5. Invariantes: ningun camino deja una cuota sin sus fechas
  -- ══════════════════════════════════════════════════════════════════
  PERFORM pg_temp.impersonate(c_admin);
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments
       SET status = 'Invoiced' WHERE installment_id = v_draft;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_DATES_REQUIRED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - un UPDATE directo facturo una cuota sin fechas de cobranza';
  END IF;
  RAISE NOTICE 'PASS - ni un admin por UPDATE directo deja una cuota facturada sin vencimiento';

  -- ══════════════════════════════════════════════════════════════════
  -- 6. Contabilidad no toca el contrato ni reprograma (Q42)
  -- ══════════════════════════════════════════════════════════════════
  PERFORM pg_temp.impersonate(c_acctmgr);
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments
       SET current_invoice_date = v_today + 45 WHERE installment_id = v_i2;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_FIELD_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - Contabilidad pudo reprogramar una cuota (es del gerente, Q42)';
  END IF;
  RAISE NOTICE 'PASS - reprogramar no es de Contabilidad';

  -- ══════════════════════════════════════════════════════════════════
  -- 7. Bitacora: se escribe sola y nadie la edita
  -- ══════════════════════════════════════════════════════════════════
  SELECT COUNT(*) INTO v_n FROM public.wo_installment_events
   WHERE installment_id = v_i1 AND action = 'status_change';
  -- Pending->Invoiced, Invoiced->Overdue, Overdue->Invoiced, Invoiced->Completed.
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'TEST FAIL - la bitacora registro % cambios de estado, se esperaban 4', v_n;
  END IF;

  SELECT to_status INTO v_txt FROM public.wo_installment_events
   WHERE installment_id = v_i1 AND action = 'status_change' ORDER BY seq DESC LIMIT 1;
  IF v_txt <> 'Completed' THEN
    RAISE EXCEPTION 'TEST FAIL - el ultimo evento deberia ser el cobro, fue %', v_txt;
  END IF;

  SELECT COUNT(*) INTO v_n FROM public.wo_installment_events
   WHERE installment_id = v_i1 AND actor_staff_id IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - % eventos quedaron sin autor', v_n;
  END IF;
  RAISE NOTICE 'PASS - la bitacora registra cada transicion, en orden y con autor';

  -- La reprogramacion tambien queda registrada, con la fecha anterior y la nueva.
  PERFORM pg_temp.impersonate(c_manager);
  UPDATE public.wo_payment_installments
     SET current_invoice_date = v_today + 45 WHERE installment_id = v_i2;
  SELECT COUNT(*) INTO v_n FROM public.wo_installment_events
   WHERE installment_id = v_i2 AND action = 'rescheduled'
     AND old_date = v_today + 30 AND new_date = v_today + 45;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la reprogramacion no quedo en la bitacora con sus dos fechas';
  END IF;
  RAISE NOTICE 'PASS - la reprogramacion deja la fecha anterior y la nueva';

  -- Nadie tiene policy de escritura sobre la bitacora: ni INSERT, ni UPDATE, ni DELETE.
  SELECT COUNT(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'wo_installment_events' AND cmd <> 'SELECT';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - la bitacora tiene % policies de escritura; deberia ser inmutable', v_n;
  END IF;
  RAISE NOTICE 'PASS - la bitacora es de solo lectura para todos';

  -- ══════════════════════════════════════════════════════════════════
  -- 8. Fase 2: los avisos de CUOTAS son del circuito de cobranza (Q14/Q46)
  -- ══════════════════════════════════════════════════════════════════
  -- El Analista de Contabilidad solo hace solicitudes de fondos: no debe recibir ninguno de
  -- los cuatro avisos de cuotas. El Analista de Cobranzas, que factura y cobra, debe
  -- recibirlos todos -- antes se perdia justo los dos que avisan movimiento.
  SELECT COUNT(*) INTO v_n FROM public.notification_role_types
   WHERE role_key = 'accounting_analyst' AND type_key LIKE 'wo.installment.%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Contabilidad conserva % avisos de cuotas', v_n;
  END IF;
  -- El LIKE de arriba alcanza para el, que no debe tener NINGUNO. Para los otros dos roles se
  -- nombran los cuatro avisos uno por uno: la Fase 3 agrego tres tipos mas con el mismo
  -- prefijo, y un conteo por LIKE pasaria a medir otra cosa sin avisar.

  SELECT COUNT(*) INTO v_n FROM public.notification_role_types
   WHERE role_key = 'collections_analyst'
     AND type_key IN ('wo.installment.status_changed', 'wo.installment.due_this_week',
                      'wo.installment.overdue', 'wo.installment.reminder.weekly');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Cobranzas recibe % de los 4 avisos de cuotas', v_n;
  END IF;

  SELECT COUNT(*) INTO v_n FROM public.notification_role_types
   WHERE role_key = 'accounting_manager'
     AND type_key IN ('wo.installment.status_changed', 'wo.installment.due_this_week',
                      'wo.installment.overdue', 'wo.installment.reminder.weekly');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'TEST FAIL - el Gerente de Contabilidad recibe % de los 4 avisos de cuotas', v_n;
  END IF;
  RAISE NOTICE 'PASS - los avisos de cuotas quedaron en los dos roles de cobranza';

  -- El correo de esos avisos ya puede llevar boton: B3p le dio work_order.read a los tres
  -- roles contables, y es justo el permiso que notif_permiso_de_ruta exige para el modulo.
  SELECT COUNT(*) INTO v_n FROM public.authorization_role_permissions
   WHERE role_key IN ('collections_analyst', 'accounting_manager')
     AND permission_key = 'work_order.read';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - sin work_order.read el correo de cobranza sigue sin enlace (% de 2)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el correo de cobranza ya puede incluir el enlace a la OT';


  -- ══════════════════════════════════════════════════════════════════
  -- 9. Fase 3: confirmacion con el cliente y reprogramacion (issue #352)
  -- ══════════════════════════════════════════════════════════════════
  -- v_i3 es la cuota 1 de la OT en Draft (c_wo2): confirmar y reprogramar NO exigen la OT
  -- aprobada -- son justamente lo que se hace antes de facturar.
  v_i3 := v_draft;

  -- 9.a Solo el gerente del encargo. Contabilidad no reprograma (decision Q42), aunque sea
  -- quien despues va a facturar esa misma cuota.
  PERFORM pg_temp.impersonate(c_collections);
  denied := false;
  BEGIN
    PERFORM public.reschedule_installment(v_i3, v_today + 60, v_today + 90, 'el cliente pidio mas plazo', v_today);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - contabilidad pudo reprogramar una cuota';
  END IF;

  -- El socio tampoco: sigue vigente "el socio no escribe el plan".
  PERFORM pg_temp.impersonate(c_acctmgr);
  denied := false;
  BEGIN
    PERFORM public.record_installment_confirmation(v_i3, true, v_today);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el Gerente de Contabilidad pudo gestionar la confirmacion';
  END IF;
  RAISE NOTICE 'PASS - confirmar y reprogramar son del gerente del encargo, no de contabilidad';

  -- 9.b El motivo es obligatorio: sin el, la bitacora no distingue una reprogramacion
  -- acordada con el cliente de una fecha movida por error.
  PERFORM pg_temp.impersonate(c_manager);
  denied := false;
  BEGIN
    PERFORM public.reschedule_installment(v_i3, v_today + 60, v_today + 90, '   ', v_today);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_REASON_REQUIRED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se pudo reprogramar sin motivo';
  END IF;

  -- Y el vencimiento tiene que corresponder a la fecha nueva, no ser un numero cualquiera.
  denied := false;
  BEGIN
    PERFORM public.reschedule_installment(v_i3, v_today + 60, v_today + 500, 'motivo', v_today);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_DUE_DATE_INVALID%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se acepto un vencimiento que no corresponde a la fecha nueva';
  END IF;
  RAISE NOTICE 'PASS - reprogramar exige motivo y un vencimiento coherente';

  -- 9.c Camino feliz. La fecha ACORDADA no se toca: es el contrato, y #352 pide no perderla.
  v_row := public.reschedule_installment(v_i3, v_today + 60, v_today + 85, 'el cliente pidio pasar al mes siguiente', v_today);
  IF v_row.current_invoice_date <> v_today + 60 THEN
    RAISE EXCEPTION 'TEST FAIL - la fecha vigente no quedo en la nueva';
  END IF;
  IF v_row.agreed_invoice_date <> v_today THEN
    RAISE EXCEPTION 'TEST FAIL - la reprogramacion piso la fecha ACORDADA (%), que es el contrato', v_row.agreed_invoice_date;
  END IF;

  -- La bitacora guarda las dos fechas y el motivo: eso es lo que permite distinguir una
  -- reprogramacion autorizada de una cuota vencida.
  SELECT COUNT(*) INTO v_n FROM public.wo_installment_events
   WHERE installment_id = v_i3 AND action = 'rescheduled'
     AND old_date = v_today AND new_date = v_today + 60
     AND reason = 'el cliente pidio pasar al mes siguiente';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la bitacora no guardo la reprogramacion con sus dos fechas y el motivo';
  END IF;
  RAISE NOTICE 'PASS - reprogramar mueve la fecha vigente, conserva el contrato y deja motivo';

  -- 9.d Concurrencia: quien llego con la pantalla vieja no pisa la fecha nueva.
  denied := false;
  BEGIN
    PERFORM public.reschedule_installment(v_i3, v_today + 70, v_today + 95, 'otro motivo', v_today);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_STALE%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - una reprogramacion concurrente no fue rechazada';
  END IF;
  RAISE NOTICE 'PASS - la fecha esperada protege de dos reprogramaciones a la vez';

  -- 9.e Confirmar: queda registrado para QUE fecha se comprometio el cliente.
  v_row := public.record_installment_confirmation(v_i3, true, v_today + 60);
  IF v_row.confirmation_status <> 'confirmada' OR v_row.confirmed_for_date <> v_today + 60 THEN
    RAISE EXCEPTION 'TEST FAIL - la confirmacion no quedo registrada: %', v_row;
  END IF;

  -- Y reprogramar DESPUES invalida esa confirmacion: el cliente se comprometio con la fecha
  -- vieja, asi que la cuota vuelve a necesitar gestion.
  v_row := public.reschedule_installment(v_i3, v_today + 90, v_today + 115, 'se volvio a correr', v_today + 60);
  IF v_row.confirmation_status <> 'sin_gestionar' OR v_row.confirmed_for_date IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL - reprogramar dejo viva una confirmacion de la fecha anterior: %', v_row;
  END IF;
  RAISE NOTICE 'PASS - confirmar registra la fecha, y reprogramar despues la invalida';

  -- 9.f "El cliente no confirma": un solo paso -- nota, fecha nueva y reprogramacion.
  denied := false;
  BEGIN
    PERFORM public.record_installment_confirmation(v_i3, false, v_today + 90, NULL, v_today + 120, v_today + 145);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_REASON_REQUIRED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - "no confirma" se acepto sin motivo';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.record_installment_confirmation(v_i3, false, v_today + 90, 'sin liquidez este mes', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_DATE_REQUIRED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - "no confirma" se acepto sin fecha nueva';
  END IF;

  v_row := public.record_installment_confirmation(v_i3, false, v_today + 90, 'sin liquidez este mes', v_today + 120, v_today + 145);
  IF v_row.confirmation_status <> 'no_confirmada' THEN
    RAISE EXCEPTION 'TEST FAIL - la cuota no quedo marcada como no confirmada: %', v_row;
  END IF;
  IF v_row.current_invoice_date <> v_today + 120 THEN
    RAISE EXCEPTION 'TEST FAIL - "no confirma" no reprogramo a la fecha nueva';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.wo_installment_events
   WHERE installment_id = v_i3 AND action = 'confirmation' AND reason = 'sin liquidez este mes';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la bitacora no guardo el motivo de la no confirmacion';
  END IF;
  RAISE NOTICE 'PASS - "no confirma" registra motivo, reprograma y marca la cuota, en un paso';

  -- 9.g Una cuota ya facturada no se reprograma: su fecha de facturacion ya es un hecho.
  PERFORM pg_temp.impersonate(c_manager);
  denied := false;
  BEGIN
    PERFORM public.reschedule_installment(v_i2, v_today + 60, v_today + 85, 'tarde', v_today + 45);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_LOCKED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se pudo reprogramar una cuota ya facturada';
  END IF;
  RAISE NOTICE 'PASS - una cuota facturada ya no se reprograma';

  -- 9.h La matriz de avisos de la Fase 3.
  SELECT COUNT(*) INTO v_n FROM public.notification_types
   WHERE type_key IN ('wo.installment.confirmation_pending', 'wo.installment.billing_late',
                      'wo.installment.rescheduled');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL - faltan tipos de aviso de la Fase 3 (hay %)', v_n;
  END IF;

  -- confirmation_pending y billing_late van por campana Y correo (Q12/Q56, Q32);
  -- rescheduled es solo campana (Q45).
  SELECT COUNT(*) INTO v_n FROM public.notification_types
   WHERE type_key IN ('wo.installment.confirmation_pending', 'wo.installment.billing_late')
     AND email_enabled;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - los recordatorios de la Fase 3 deberian salir tambien por correo';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notification_types
   WHERE type_key = 'wo.installment.rescheduled' AND email_enabled;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - el aviso de reprogramacion deberia ser solo de campana';
  END IF;

  -- El recordatorio de confirmacion le llega TAMBIEN al gerente, que es quien marca el check:
  -- avisarle solo a Contabilidad dejaba el recordatorio en manos de quien no puede resolverlo.
  SELECT COUNT(*) INTO v_n FROM public.notification_role_types
   WHERE type_key = 'wo.installment.confirmation_pending' AND role_key = 'manager';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente no recibe el recordatorio de confirmacion';
  END IF;
  RAISE NOTICE 'PASS - los tres avisos de la Fase 3, con su canal y sus destinatarios';


  -- ══════════════════════════════════════════════════════════════════
  -- 10. Fase 4: notas entre el encargo y Contabilidad (issue #352)
  -- ══════════════════════════════════════════════════════════════════
  -- Lo que el requisito C2 llamaba "excepcion para revisar gerente y socio" resulto ser esto
  -- (decision del operador Q6): notas, no un flujo de aprobacion. C2 y C4 son lo mismo.

  -- 10.a El SOCIO escribe notas. Es el punto: sigue sin poder tocar el plan de pagos, y esta
  -- es la via que tiene para dejar constancia de algo que Contabilidad debe leer al facturar.
  PERFORM pg_temp.impersonate(c_partner);
  SELECT note_id INTO v_note FROM public.add_installment_note(c_wo1, v_i2, 'el cliente pidio factura separada por servicio');
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL - el socio no pudo escribir una nota';
  END IF;

  -- Y lo que NO puede sigue igual: escribir una nota no le abre el plan.
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET percentage = 99 WHERE installment_id = v_i2;
  EXCEPTION WHEN OTHERS THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el socio escribio el plan de pagos; solo deberia poder notas';
  END IF;
  RAISE NOTICE 'PASS - el socio escribe notas pero sigue sin tocar el plan';

  -- 10.b Contabilidad tambien escribe: el hilo tiene dos lados.
  PERFORM pg_temp.impersonate(c_collections);
  PERFORM public.add_installment_note(c_wo1, v_i2, 'facturamos con la observacion del socio');
  RAISE NOTICE 'PASS - Contabilidad responde en el mismo hilo';

  -- 10.c Nota del PLAN entero (installment_id NULL, decision Q33).
  PERFORM pg_temp.impersonate(c_manager);
  PERFORM public.add_installment_note(c_wo1, NULL, 'este cliente paga siempre a 60 dias');
  SELECT COUNT(*) INTO v_n FROM public.wo_installment_notes
   WHERE wo_id = c_wo1 AND installment_id IS NULL AND deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - la nota del plan no quedo registrada';
  END IF;
  RAISE NOTICE 'PASS - hay notas de cuota y notas del plan entero';

  -- 10.d Quien no participa del hilo no escribe. El Analista de Contabilidad esta fuera de
  -- cobranzas (Q14) y no es parte del encargo.
  PERFORM pg_temp.impersonate(c_acctanalyst);
  denied := false;
  BEGIN
    PERFORM public.add_installment_note(c_wo1, v_i2, 'no deberia poder');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NOTE_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Contabilidad escribio en el hilo';
  END IF;

  -- Y tampoco lo lee. Se afirma sobre wo_notes_participant(), que es LA MISMA funcion que usa
  -- la policy de SELECT, y no contando filas: este harness corre como dueno de las tablas, y
  -- para el dueno la RLS no se evalua (BYPASSRLS implicito). Contar filas aca daria siempre
  -- todas, pase lo que pase con la policy, o sea un test que no puede fallar.
  IF public.wo_notes_participant(c_wo1) THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Contabilidad figura como participante del hilo';
  END IF;
  PERFORM pg_temp.impersonate(c_partner);
  IF NOT public.wo_notes_participant(c_wo1) THEN
    RAISE EXCEPTION 'TEST FAIL - el socio del encargo no figura como participante del hilo';
  END IF;
  PERFORM pg_temp.impersonate(c_collections);
  IF NOT public.wo_notes_participant(c_wo1) THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Cobranzas no figura como participante del hilo';
  END IF;
  PERFORM pg_temp.impersonate(c_acctanalyst);
  RAISE NOTICE 'PASS - quien no participa del hilo ni escribe ni lee';

  -- 10.e Una nota vacia no es una nota.
  PERFORM pg_temp.impersonate(c_manager);
  denied := false;
  BEGIN
    PERFORM public.add_installment_note(c_wo1, v_i2, '   ');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NOTE_BODY_REQUIRED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se acepto una nota vacia';
  END IF;

  -- Ni una nota colgada de una cuota de OTRA orden de trabajo.
  denied := false;
  BEGIN
    PERFORM public.add_installment_note(c_wo1, v_draft, 'cuota de otra OT');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NOTE_WO_MISMATCH%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se acepto una nota sobre una cuota de otra OT';
  END IF;
  RAISE NOTICE 'PASS - la nota exige texto y una cuota de la misma OT';

  -- 10.f Editar: solo el autor. Ni la otra parte del hilo, aunque la lea.
  PERFORM pg_temp.impersonate(c_collections);
  denied := false;
  BEGIN
    PERFORM public.edit_installment_note(v_note, 'reescrita por otro');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NOTE_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - Contabilidad edito una nota del socio';
  END IF;

  -- El autor si, y la version anterior queda guardada: quien facturo leyendo la vieja tiene
  -- que poder demostrar que decia.
  PERFORM pg_temp.impersonate(c_partner);
  PERFORM public.edit_installment_note(v_note, 'el cliente pidio factura separada por servicio y por mes');
  SELECT COUNT(*) INTO v_n FROM public.wo_installment_note_versions
   WHERE note_id = v_note AND body = 'el cliente pidio factura separada por servicio';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - no se guardo el texto anterior de la nota editada';
  END IF;

  -- Reenviar el mismo texto no ensucia el historial.
  PERFORM public.edit_installment_note(v_note, 'el cliente pidio factura separada por servicio y por mes');
  SELECT COUNT(*) INTO v_n FROM public.wo_installment_note_versions WHERE note_id = v_note;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - una edicion identica genero una version (hay %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - edita solo el autor, y la version anterior se conserva';

  -- 10.g Borrar es logico: la nota deja de verse pero la fila sobrevive, porque alguien pudo
  -- haber facturado leyendola.
  PERFORM public.delete_installment_note(v_note);
  -- Mismo motivo que arriba: la policy filtra por deleted_at, pero el dueno no la evalua. Se
  -- afirma el hecho que la policy mira -- que la fila quedo marcada como borrada y NO
  -- desaparecio -- que es lo que hace util al borrado logico.
  SELECT COUNT(*) INTO v_n FROM public.wo_installment_notes
   WHERE note_id = v_note AND deleted_at IS NOT NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - borrar la nota no la marco como borrada, o la borro de verdad';
  END IF;
  RAISE NOTICE 'PASS - borrar una nota la oculta sin perderla';

  -- 10.h El aviso es solo de campana y va a la otra parte (Q35).
  SELECT COUNT(*) INTO v_n FROM public.notification_types
   WHERE type_key = 'wo.installment.note_added' AND NOT email_enabled;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el aviso de nota deberia existir y ser solo de campana';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notification_role_types
   WHERE type_key = 'wo.installment.note_added'
     AND role_key IN ('manager', 'partner', 'accounting_manager', 'collections_analyst');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'TEST FAIL - las dos partes del hilo no reciben el aviso de nota (hay %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - el aviso de nota nueva es de campana y llega a las dos partes';

  -- ══════════════════════════════════════════════════════════════════
  -- 11. Fase 5: contactos del cliente (issue #352)
  -- ══════════════════════════════════════════════════════════════════
  -- El cliente tenia UN contacto suelto; Cobranzas necesita ademas el de FINANZAS, que es a
  -- quien se le reclama una factura (decisiones Q20/Q52).

  -- 11.a El minimo es uno ACTIVO de cada tipo, y se valida sobre el payload: un CHECK de tabla
  -- no puede expresar "al menos uno en el conjunto", y al reemplazar el unico contacto de un
  -- tipo la tabla queda un instante sin ninguno.
  PERFORM pg_temp.impersonate(c_admin);
  denied := false;
  BEGIN
    PERFORM public.save_client_contacts('c1000000-0000-4000-8000-0000000000f1', jsonb_build_array(
      jsonb_build_object('contact_type', 'general', 'full_name', 'Ana Perez', 'email', 'ana@cliente.com')));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'CONTACT_COBRANZA_REQUIRED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se guardo un cliente sin contacto de cobranza';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.save_client_contacts('c1000000-0000-4000-8000-0000000000f1', jsonb_build_array(
      jsonb_build_object('contact_type', 'cobranza', 'full_name', 'Luis Finanzas')));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'CONTACT_GENERAL_REQUIRED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se guardo un cliente sin contacto general';
  END IF;
  -- Y los dos necesitan CORREO (decision del operador 2026-10-20): el cobro se reclama por
  -- correo, asi que un contacto sin correo no sirve para lo unico que tiene que servir.
  denied := false;
  BEGIN
    PERFORM public.save_client_contacts('c1000000-0000-4000-8000-0000000000f1', jsonb_build_array(
      jsonb_build_object('contact_type', 'general',  'full_name', 'Ana Perez', 'email', 'ana@cliente.com'),
      jsonb_build_object('contact_type', 'cobranza', 'full_name', 'Luis Finanzas')));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'CONTACT_COBRANZA_REQUIRED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se guardo un contacto de cobranza sin correo';
  END IF;
  RAISE NOTICE 'PASS - hacen falta los dos contactos, con nombre y correo';

  -- 11.b Camino feliz.
  PERFORM public.save_client_contacts('c1000000-0000-4000-8000-0000000000f1', jsonb_build_array(
    jsonb_build_object('contact_type', 'general',  'full_name', 'Ana Perez',     'email', 'ana@cliente.com'),
    jsonb_build_object('contact_type', 'cobranza', 'full_name', 'Luis Finanzas', 'email', 'luis@cliente.com')));
  SELECT COUNT(*) INTO v_n FROM public.client_contacts
   WHERE client_id = 'c1000000-0000-4000-8000-0000000000f1' AND is_active;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - se esperaban 2 contactos activos, hay %', v_n;
  END IF;
  IF NOT public.client_has_required_contacts('c1000000-0000-4000-8000-0000000000f1') THEN
    RAISE EXCEPTION 'TEST FAIL - el cliente deberia tener los contactos que el plan exige';
  END IF;
  RAISE NOTICE 'PASS - se guardan los dos contactos y el cliente queda completo';

  -- 11.c Varios del mismo tipo (Q52), y lo que no viene en el payload se DESACTIVA, no se
  -- borra: una nota o una gestion pudo haberlo nombrado.
  PERFORM public.save_client_contacts('c1000000-0000-4000-8000-0000000000f1', jsonb_build_array(
    jsonb_build_object('contact_type', 'general',  'full_name', 'Ana Perez',       'email', 'ana@cliente.com'),
    jsonb_build_object('contact_type', 'cobranza', 'full_name', 'Luis Finanzas',   'email', 'luis@cliente.com'),
    jsonb_build_object('contact_type', 'cobranza', 'full_name', 'Marta Tesoreria', 'email', 'marta@cliente.com')));
  SELECT COUNT(*) INTO v_n FROM public.client_contacts
   WHERE client_id = 'c1000000-0000-4000-8000-0000000000f1' AND is_active AND contact_type = 'cobranza';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - deberia haber 2 contactos de cobranza activos, hay %', v_n;
  END IF;

  -- El juego anterior (los que se cargaron en 11.b, con otros contact_id) quedo desactivado.
  SELECT COUNT(*) INTO v_n FROM public.client_contacts
   WHERE client_id = 'c1000000-0000-4000-8000-0000000000f1' AND NOT is_active;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'TEST FAIL - los contactos reemplazados se borraron en vez de desactivarse';
  END IF;
  RAISE NOTICE 'PASS - varios contactos por tipo, y el reemplazado se desactiva sin perderse';

  -- 11.d Quien no mantiene al cliente no toca sus contactos. El Analista de Cobranzas los LEE
  -- (los necesita para cobrar) pero no los edita: el dato es del cliente.
  PERFORM pg_temp.impersonate(c_collections);
  denied := false;
  BEGIN
    PERFORM public.save_client_contacts('c1000000-0000-4000-8000-0000000000f1', jsonb_build_array(
      jsonb_build_object('contact_type', 'general',  'full_name', 'Intruso'),
      jsonb_build_object('contact_type', 'cobranza', 'full_name', 'Intruso')));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'CONTACT_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - Cobranzas edito los contactos del cliente';
  END IF;

  -- El GERENTE del encargo si: es el caso que permite completarlos desde el plan de pagos,
  -- que es donde se descubre que falta el de finanzas (decision Q21/Q22).
  PERFORM pg_temp.impersonate(c_manager);
  PERFORM public.save_client_contacts('c1000000-0000-4000-8000-0000000000f1', jsonb_build_array(
    jsonb_build_object('contact_type', 'general',  'full_name', 'Ana Perez',     'email', 'ana@cliente.com'),
    jsonb_build_object('contact_type', 'cobranza', 'full_name', 'Luis Finanzas', 'email', 'luis@cliente.com')));
  RAISE NOTICE 'PASS - los edita quien mantiene al cliente o el gerente del encargo, no Cobranzas';

  -- 11.e Contabilidad ve los contactos DESDE el plan, sin tener client.read (decision Q57).
  PERFORM pg_temp.impersonate(c_acctmgr);
  SELECT COUNT(*) INTO v_n FROM public.get_wo_client_contacts(c_wo1);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - el Gerente de Contabilidad vio % contactos desde el plan', v_n;
  END IF;

  -- Y es el acceso al PLAN lo que lo habilita, no el cliente: quien no participa del plan no
  -- los ve ni por esta via.
  PERFORM pg_temp.impersonate(c_acctanalyst);
  denied := false;
  BEGIN
    PERFORM COUNT(*) FROM public.get_wo_client_contacts(c_wo1);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'CONTACT_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el Analista de Contabilidad leyo los contactos del plan';
  END IF;
  RAISE NOTICE 'PASS - Contabilidad ve los contactos desde el plan, sin abrir la ficha del cliente';

  -- 11.f Los contact_* ya no existen en la ficha ni en el directorio.
  SELECT COUNT(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'clients'
     AND column_name IN ('contact_name', 'contact_email', 'contact_phone');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - quedaron % columnas contact_* en clients', v_n;
  END IF;
  RAISE NOTICE 'PASS - la ficha del cliente ya no tiene los contactos sueltos';

  -- ══════════════════════════════════════════════════════════════════
  -- 12. Fase 6: moneda por cuota y TC al facturar (issue #352)
  -- ══════════════════════════════════════════════════════════════════
  -- "Tipo de cambio MIX" resulto ser cuotas en MONEDAS DISTINTAS dentro del mismo plan
  -- (decision Q29). Y el modo del plan dejo de decidir SI se puede tocar el TC: solo decide con
  -- que valor se autocompleta (decision Q49).

  -- 12.a exchange_rate_on(): el TC de una fecha. Si esa fecha no tiene cotizacion vale la
  -- ultima anterior -- un viernes es la cotizacion vigente el sabado.
  INSERT INTO public.exchange_rate_history (fecha_vigencia, compra, venta, fuente, canal, actualizado_en, estado)
  VALUES ('2026-10-02', 6.80, 6.86, 'test', 'bcb-web', now(), 'vigente'),
         ('2026-10-09', 6.90, 6.96, 'test', 'bcb-web', now(), 'vigente')
  ON CONFLICT (fecha_vigencia) DO NOTHING;

  IF public.exchange_rate_on('2026-10-09') <> 6.90 THEN
    RAISE EXCEPTION 'TEST FAIL - el TC de una fecha con cotizacion deberia ser el de ese dia';
  END IF;
  IF public.exchange_rate_on('2026-10-11') <> 6.90 THEN
    RAISE EXCEPTION 'TEST FAIL - una fecha sin cotizacion deberia caer a la ultima anterior';
  END IF;
  IF public.exchange_rate_on('2020-01-01') IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAIL - sin ninguna cotizacion anterior deberia devolver NULL';
  END IF;
  RAISE NOTICE 'PASS - el TC por fecha cae a la ultima cotizacion anterior, y avisa cuando no hay';

  -- 12.b Una cuota puede ir en otra moneda que la OT (c_wo1 esta en BOB).
  PERFORM pg_temp.impersonate(c_manager);
  UPDATE public.wo_payment_installments SET currency = 'USD' WHERE installment_id = v_i3x;
  IF (SELECT currency FROM public.wo_payment_installments WHERE installment_id = v_i3x) <> 'USD' THEN
    RAISE EXCEPTION 'TEST FAIL - no se pudo poner la cuota en otra moneda';
  END IF;

  -- USDT no se mezcla: el proyecto no lo convierte en ningun lado.
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET currency = 'USDT' WHERE installment_id = v_i3x;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_CURRENCY_INVALID%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - una OT en BOB acepto una cuota en USDT';
  END IF;
  RAISE NOTICE 'PASS - la cuota puede ir en otra moneda, pero USDT no se mezcla';

  -- 12.c Una vez facturada, la moneda queda congelada con el monto y el TC.
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET currency = 'USD' WHERE installment_id = v_i1;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_LOCKED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se cambio la moneda de una cuota ya facturada';
  END IF;
  RAISE NOTICE 'PASS - la moneda de una cuota facturada ya no se cambia';

  -- 12.d En modo FIJO, el TC se puede apartar del TC del plan AL FACTURAR (decision Q49), que
  -- antes estaba prohibido siempre.
  PERFORM pg_temp.impersonate(c_admin);
  INSERT INTO public.wo_payment_plan (wo_id, payment_days, exchange_rate, exchange_rate_mode)
  VALUES (c_wo3, 30, 6.96, 'fijo') RETURNING plan_id INTO v_plan3;
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan3, c_wo3, 1, 100, 700, 'Pending', v_today, v_today + 30, 6.96, 6.96)
  RETURNING installment_id INTO v_i4;
  UPDATE public.work_orders SET approval_status = 'Approved' WHERE wo_id = c_wo3;

  -- Mientras sigue Pendiente NO: el resincronizado del plan se lo volveria a pisar.
  PERFORM pg_temp.impersonate(c_collections);
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET invoice_exchange_rate = 7.10 WHERE installment_id = v_i4;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - en modo fijo se cambio el TC de una cuota que sigue Pendiente';
  END IF;

  -- Al facturar SI, y queda registrado de que fecha salio.
  v_row := public.invoice_installment(v_i4, 'Pending', v_today + 30, v_today, 7.10, '2026-10-09');
  IF v_row.invoice_exchange_rate <> 7.10 THEN
    RAISE EXCEPTION 'TEST FAIL - no se pudo corregir el TC al facturar en modo fijo (quedo %)', v_row.invoice_exchange_rate;
  END IF;
  IF v_row.invoice_exchange_rate_date <> '2026-10-09' THEN
    RAISE EXCEPTION 'TEST FAIL - no se guardo de que fecha salio el TC';
  END IF;
  RAISE NOTICE 'PASS - en modo fijo el TC se corrige al facturar, y solo ahi';

  -- 12.e El resincronizado del plan sigue funcionando: corre con la OT en Draft y sin rol de
  -- cobranza, y los chequeos nuevos no lo pueden romper.
  PERFORM pg_temp.impersonate(c_manager);
  INSERT INTO public.wo_payment_plan (wo_id, payment_days, exchange_rate, exchange_rate_mode)
  VALUES (c_wo4, 30, 6.50, 'fijo') RETURNING plan_id INTO v_plan4;
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan4, c_wo4, 1, 100, 500, 'Pending', v_today + 10, v_today + 40, 6.50, 6.50);

  UPDATE public.wo_payment_plan SET exchange_rate = 6.75 WHERE plan_id = v_plan4;
  SELECT invoice_exchange_rate INTO v_rate FROM public.wo_payment_installments
   WHERE plan_id = v_plan4 AND installment_number = 1;
  IF v_rate <> 6.75 THEN
    RAISE EXCEPTION 'TEST FAIL - editar el TC del plan dejo de resincronizar las cuotas (quedo %)', v_rate;
  END IF;
  RAISE NOTICE 'PASS - editar el TC del plan sigue resincronizando las cuotas pendientes';

  -- ══════════════════════════════════════════════════════════════════
  -- 13. Fase 7: los gastos ejecutados se le facturan al cliente (Q37-Q41)
  -- ══════════════════════════════════════════════════════════════════
  -- Las cuotas reparten SOLO honorarios, y los gastos se cobran aparte, por lo EJECUTADO.
  -- Antes el presupuesto de gastos iba dentro del monto que las cuotas repartian, asi que
  -- agregar una fila de gastos encima habria cobrado los gastos dos veces.
  --
  -- Fixture: wo5 nace con plan de honorarios (el guard solo deja crear el plan en Draft) y se
  -- aprueba despues; wo6 llega aprobada y SIN plan.
  PERFORM pg_temp.impersonate(c_manager);
  INSERT INTO public.wo_payment_plan (wo_id, payment_days, exchange_rate, exchange_rate_mode)
  VALUES (c_wo5, 30, 6.96, 'variable') RETURNING plan_id INTO v_plan5;
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan5, c_wo5, 1, 100, 1000, 'Pending', v_today + 10, v_today + 40, 6.96, 6.96)
  RETURNING installment_id INTO v_i5;

  PERFORM pg_temp.impersonate(c_admin);
  UPDATE public.work_orders SET approval_status = 'Approved' WHERE wo_id IN (c_wo5, c_wo6);

  INSERT INTO public.fund_requests (fund_request_id, requester_staff_id, total_requested_amount, currency, status, expense_period_month) VALUES
    (v_fr1, '51c00000-0000-4000-8000-0000000000f2', 1500, 'BOB', 'fondos_entregados', date_trunc('month', v_today)::date),
    (v_fr2, '51c00000-0000-4000-8000-0000000000f2',  400, 'BOB', 'fondos_entregados', date_trunc('month', v_today)::date);

  INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount) VALUES
    (v_fr1, c_wo5, 1500),
    (v_fr2, c_wo6,  400);

  -- Dos gastos ya revisados por Contabilidad y uno que sigue en revision.
  INSERT INTO public.fund_request_expenses (fre_id, fund_request_id, wo_id, expense_date, amount, currency, status) VALUES
    ('f5000000-0000-4000-8000-00000000000a', v_fr1, c_wo5, v_today, 300, 'BOB', 'revisado_asistente'),
    ('f5000000-0000-4000-8000-00000000000b', v_fr1, c_wo5, v_today, 200, 'BOB', 'revisado_asistente'),
    ('f5000000-0000-4000-8000-00000000000c', v_fr1, c_wo5, v_today, 999, 'BOB', 'pendiente_aprobacion'),
    ('f5000000-0000-4000-8000-00000000000d', v_fr2, c_wo6, v_today, 400, 'BOB', 'revisado_asistente');

  -- 13.a Solo se le facturan al cliente los gastos que terminaron el proceso (Q37). El que
  -- sigue en revision no entra: todavia puede cambiar de monto o caerse.
  SELECT COALESCE(SUM(amount), 0) INTO v_rate FROM public.wo_billable_expenses(c_wo5);
  IF v_rate <> 500 THEN
    RAISE EXCEPTION 'TEST FAIL - facturables esperados 500 (300+200), obtuvo %', v_rate;
  END IF;
  RAISE NOTICE 'PASS - solo se facturan los gastos que ya reviso Contabilidad';

  -- 13.b La fila la crea Contabilidad, no el gerente del encargo (Q24).
  PERFORM pg_temp.impersonate(c_manager);
  denied := false;
  BEGIN
    PERFORM public.create_expense_reimbursement_row(c_wo5);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXPENSE_ROW_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente del encargo creo la fila de gastos';
  END IF;

  -- Y se crea con la OT ya APROBADA. Ese es el punto de toda la fase: los gastos ejecutados
  -- aparecen DESPUES de aprobar, asi que el bloqueo normal de cuotas nuevas los dejaria sin
  -- facturar para siempre.
  PERFORM pg_temp.impersonate(c_collections);
  v_row := public.create_expense_reimbursement_row(c_wo5);
  IF v_row.installment_type <> 'expense_reimbursement' THEN
    RAISE EXCEPTION 'TEST FAIL - la fila no quedo marcada como de gastos (quedo %)', v_row.installment_type;
  END IF;
  -- Anexo A: se factura SUBIENDO el monto para cubrir el IVA (574.71 = 500 / 0.87). Asi la
  -- firma recupera los 500 que gasto; con 500 a secas se quedaba con 435. net_amount guarda lo
  -- gastado y amount lo que se factura: la diferencia entre los dos ES el impuesto.
  IF v_row.net_amount <> 500 THEN
    RAISE EXCEPTION 'TEST FAIL - net_amount deberia ser lo gastado (500), fue %', v_row.net_amount;
  END IF;
  IF v_row.amount <> 574.71 THEN
    RAISE EXCEPTION 'TEST FAIL - se deberia facturar 574.71 (500/0.87), se facturo %', v_row.amount;
  END IF;
  -- percentage 0: la fila NO participa del reparto del 100% de los honorarios.
  IF v_row.percentage <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - la fila de gastos entro en el reparto de porcentajes';
  END IF;
  -- Los gastos se rinden en BOB (fund_requests_enforce_bob), asi que se cobran en BOB.
  IF v_row.currency <> 'BOB' THEN
    RAISE EXCEPTION 'TEST FAIL - la fila de gastos deberia ir en BOB, fue %', v_row.currency;
  END IF;
  v_i6 := v_row.installment_id;
  RAISE NOTICE 'PASS - la crea Contabilidad, con la OT aprobada, y fuera del reparto de honorarios';

  -- 13.c Un gasto NO se cobra dos veces. Es la garantia central de la fase: el UNIQUE sobre
  -- fre_id la sostiene aunque dos personas pulsen el boton a la vez.
  denied := false;
  BEGIN
    PERFORM public.create_expense_reimbursement_row(c_wo5);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXPENSE_ROW_EMPTY%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se creo una segunda fila con los mismos gastos';
  END IF;

  SELECT COUNT(*) INTO v_n FROM public.wo_installment_expenses WHERE installment_id = v_i6;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - la fila deberia tener vinculados los 2 gastos, tiene %', v_n;
  END IF;

  -- Pero un gasto que termina su revision DESPUES si entra en una fila nueva (Q39).
  PERFORM pg_temp.impersonate(c_admin);
  UPDATE public.fund_request_expenses SET status = 'revisado_asistente'
   WHERE fre_id = 'f5000000-0000-4000-8000-00000000000c';
  PERFORM pg_temp.impersonate(c_collections);
  v_row := public.create_expense_reimbursement_row(c_wo5);
  IF v_row.net_amount <> 999 THEN
    RAISE EXCEPTION 'TEST FAIL - la segunda fila deberia traer solo el gasto nuevo (999), trajo %', v_row.net_amount;
  END IF;
  IF v_row.amount <> 1148.28 THEN
    RAISE EXCEPTION 'TEST FAIL - la segunda fila deberia facturarse en 1148.28 (999/0.87), fue %', v_row.amount;
  END IF;
  RAISE NOTICE 'PASS - cada gasto entra en UNA sola fila, y los que se revisan despues van a otra';

  -- 13.d Una OT aprobada SIN plan: la RPC crea el encabezado. Sin esto, una OT que solo tuvo
  -- gastos no se podria cobrar nunca, porque el guard del plan no deja crearlo ya aprobada.
  v_row := public.create_expense_reimbursement_row(c_wo6);
  IF v_row.net_amount <> 400 OR v_row.amount <> 459.77 THEN
    RAISE EXCEPTION 'TEST FAIL - la fila de la OT sin plan deberia ser 400 gastados / 459.77 facturados (fue % / %)', v_row.net_amount, v_row.amount;
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.wo_payment_plan WHERE wo_id = c_wo6;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - no se creo el encabezado del plan para la OT sin plan';
  END IF;
  RAISE NOTICE 'PASS - una OT aprobada sin plan igual puede facturar sus gastos';

  -- 13.e El monto lo corrige SOLO Contabilidad, y net_amount queda como referencia de lo que
  -- realmente se gasto.
  PERFORM pg_temp.impersonate(c_manager);
  denied := false;
  BEGIN
    PERFORM public.set_expense_reimbursement_amount(v_i6, 450);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXPENSE_ROW_FORBIDDEN%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - el gerente corrigio el monto de la fila de gastos';
  END IF;

  PERFORM pg_temp.impersonate(c_collections);
  v_row := public.set_expense_reimbursement_amount(v_i6, 450);
  IF v_row.amount <> 450 OR v_row.net_amount <> 500 THEN
    RAISE EXCEPTION 'TEST FAIL - corregir el monto deberia dejar net_amount intacto (monto=% neto=%)', v_row.amount, v_row.net_amount;
  END IF;

  -- Y una cuota de honorarios no se corrige por esta puerta.
  denied := false;
  BEGIN
    PERFORM public.set_expense_reimbursement_amount(v_i5, 450);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXPENSE_ROW_INVALID%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - se corrigio una cuota de honorarios como si fuera de gastos';
  END IF;
  RAISE NOTICE 'PASS - el monto lo corrige Contabilidad, y lo gastado queda como referencia';

  -- 13.f Las filas de gastos SOBREVIVEN a guardar el plan de honorarios. Sin esto, el gerente
  -- guardaba el plan y borraba en silencio lo que Contabilidad acababa de facturar.
  PERFORM pg_temp.impersonate(c_manager);
  PERFORM public.sync_wo_payment_installments(v_plan5, c_wo5, jsonb_build_array(
    jsonb_build_object('installment_id', v_i5, 'installment_number', 1, 'percentage', 100,
                       'amount', 1000, 'status', 'Pending',
                       'agreed_invoice_date', to_char(v_today + 10, 'YYYY-MM-DD'),
                       'agreed_payment_date', to_char(v_today + 40, 'YYYY-MM-DD'),
                       'invoice_exchange_rate', 6.96,
                       'payment_exchange_rate', 6.96)));
  SELECT COUNT(*) INTO v_n FROM public.wo_payment_installments
   WHERE plan_id = v_plan5 AND installment_type = 'expense_reimbursement';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL - guardar el plan borro las filas de gastos (quedaron %)', v_n;
  END IF;
  RAISE NOTICE 'PASS - guardar el plan de honorarios no toca las filas de gastos';

  -- 13.g Una fila no cambia de tipo: convertirla descuadraria el plan en cualquier direccion.
  PERFORM pg_temp.impersonate(c_admin);
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET installment_type = 'fee' WHERE installment_id = v_i6;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_TYPE_IMMUTABLE%' THEN denied := true; ELSE RAISE; END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'TEST FAIL - una fila de gastos se convirtio en una de honorarios';
  END IF;
  RAISE NOTICE 'PASS - el tipo de una fila no se puede cambiar';

  -- 13.h Los dos avisos de la fase, cada uno por su canal (Q40).
  SELECT COUNT(*) INTO v_n FROM public.notification_types
   WHERE type_key = 'wo.installment.expense_row_created' AND email_enabled;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL - el alta de la fila de gastos deberia salir tambien por correo';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.notification_types
   WHERE type_key = 'wo.installment.expense_row_amount_changed' AND email_enabled;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL - la correccion del monto deberia ser solo de campana';
  END IF;
  RAISE NOTICE 'PASS - el alta avisa por campana y correo; la correccion, solo por campana';

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'COBRANZAS FASES 1 A 7: ALL CHECKS PASSED';
END $$;

ROLLBACK;
