-- Cobranzas Fase 1 — issue #352 / packet 0923-206. Plan: docs/plan-cobranzas-consolidado.md §3.
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
-- "COBRANZAS FASE 1: ALL CHECKS PASSED".

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
  ('a1c00000-0000-4000-8000-0000000000f5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cf1-acctanalyst@test.local','', now(), now(), now(), '{}', '{}');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active, practica_id, society_id) VALUES
  ('51c00000-0000-4000-8000-0000000000f1', 'a1c00000-0000-4000-8000-0000000000f1', 'CF1', 'Admin',       true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000f1'),
  ('51c00000-0000-4000-8000-0000000000f2', 'a1c00000-0000-4000-8000-0000000000f2', 'CF1', 'Manager',     true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000f1'),
  ('51c00000-0000-4000-8000-0000000000f3', 'a1c00000-0000-4000-8000-0000000000f3', 'CF1', 'Collections', true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000f1'),
  ('51c00000-0000-4000-8000-0000000000f4', 'a1c00000-0000-4000-8000-0000000000f4', 'CF1', 'AcctMgr',     true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000f1'),
  ('51c00000-0000-4000-8000-0000000000f5', 'a1c00000-0000-4000-8000-0000000000f5', 'CF1', 'AcctAnalyst', true, (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000f1');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a1c00000-0000-4000-8000-0000000000f1', 'admin', 'admin'),
  ('a1c00000-0000-4000-8000-0000000000f2', 'staff', 'manager'),
  ('a1c00000-0000-4000-8000-0000000000f3', 'staff', 'collections_analyst'),
  ('a1c00000-0000-4000-8000-0000000000f4', 'staff', 'accounting_manager'),
  ('a1c00000-0000-4000-8000-0000000000f5', 'staff', 'accounting_analyst');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id, manager_id) VALUES
  ('e0000000-0000-4000-8000-0000000000f1', 'c1000000-0000-4000-8000-0000000000f1', 'CF1 E1', 1, '2026-12-31', '50c00000-0000-4000-8000-0000000000f1', '51c00000-0000-4000-8000-0000000000f2'),
  ('e0000000-0000-4000-8000-0000000000f2', 'c1000000-0000-4000-8000-0000000000f1', 'CF1 E2', 1, '2026-12-31', '50c00000-0000-4000-8000-0000000000f1', '51c00000-0000-4000-8000-0000000000f2');

-- Las OT nacen en Draft: el guard del plan (20260908150000) solo permite CREAR el plan
-- mientras la OT no este aprobada. Se aprueban despues, como en el flujo real.
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000f1', 'e0000000-0000-4000-8000-0000000000f1', 'BOB', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000f2', 'e0000000-0000-4000-8000-0000000000f2', 'BOB', 'High', 'Draft');

DO $$
DECLARE
  c_admin       uuid := 'a1c00000-0000-4000-8000-0000000000f1';
  c_manager     uuid := 'a1c00000-0000-4000-8000-0000000000f2';
  c_collections uuid := 'a1c00000-0000-4000-8000-0000000000f3';
  c_acctmgr     uuid := 'a1c00000-0000-4000-8000-0000000000f4';
  c_acctanalyst uuid := 'a1c00000-0000-4000-8000-0000000000f5';
  c_wo1         uuid := '40000000-0000-4000-8000-0000000000f1';
  c_wo2         uuid := '40000000-0000-4000-8000-0000000000f2';
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

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'COBRANZAS FASE 1: ALL CHECKS PASSED';
END $$;

ROLLBACK;
