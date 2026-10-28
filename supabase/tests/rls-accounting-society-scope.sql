-- Alcance por sociedad de Contabilidad y Cobranzas (2026-10-28) — Fase 1: politicas RLS y vistas; Fase 2: RPC de lectura;
-- Fase 3: escrituras, regla de armado de solicitudes y cambio de sociedad del encargo.
-- Plan: docs/plan-alcance-sociedad-contabilidad-cobranzas-v1.md. Corre desde supabase/tests/local/run-rls-tests.sh.
-- Transaccion unica, SIEMPRE hace ROLLBACK. Salida de exito: "SOCIETY SCOPE: ALL CHECKS PASSED (rolled back)".
--
-- Bajo prueba (con SET LOCAL ROLE authenticated de verdad, no como dueno):
--   1. Las 17 politicas RESTRICTIVE "society scope" existen, FOR ALL, con el predicado de sociedad.
--   2. accounting_manager / accounting_analyst / collections_analyst ven solo encargos, OT, clientes, contactos y
--      solicitudes de fondos de SU sociedad. Ser creador del encargo ajeno no levanta el limite.
--   3. Una solicitud mixta (OT de las dos sociedades) no se ve, ni entera ni a medias.
--   4. Un rol con alcance por sociedad SIN ficha no ve nada.
--   5. Control: un gerente (sin alcance por sociedad) sigue viendo lo de ambas sociedades.
--   6. clients_directory aplica el mismo corte; my_visible_engagement_ids() coincide con la RLS real.
--   7. (Fase 2) RPC SECURITY DEFINER de lectura: Cobranzas (lista y opciones), gastos por OT (resumen y detalle),
--      gastos facturables, contactos de la OT, diferencia de cambio, Encargos Administrativos y portafolio.
--      Una OT ajena por id corta con SOCIETY_SCOPE_FORBIDDEN (o el porton propio de la RPC); los listados solo traen lo propio.
--   8. (Fase 3) Escrituras contables sobre cuotas, ajustes, reembolsos, notas (autor trasladado incluido) y fondos (la
--      solicitud se juzga entera). Regla de armado: una solicitud solo lleva OT de la sociedad de su solicitante, en alta,
--      cambio de OT, cambio de solicitud padre, cambio de solicitante y envio. Un encargo con solicitudes abiertas no
--      cambia de sociedad.
--
-- Mundo (prefijo 5c):
--   Sociedad A = Ruizmier Pelaez, B = Ruizmier Jauregui (seed).
--   U1 collections_analyst A · U2 accounting_manager A · U3 accounting_analyst A · U4 manager A (control)
--   U5 accounting_manager B · U6 collections_analyst sin ficha
--   CA cliente solo A · CB solo B · CS compartido (encargo en A y en B) · CN sin encargos
--   EA (A, CA) · EB (B, CB, creado por U2) · ESA (A, CS, creado por U2) · ESB (B, CS) — U4 es gerente de los cuatro
--   EAA / EAB: encargos administrativos (funcion 0) de A y de B
--   WA OT de EA · WB OT de EB, cada una con plan y una cuota por facturar
--   FA solicitud sobre WA · FB sobre WB · FM mixta (WA + WB); un gasto revisado en FA y otro en FB

BEGIN;

SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    SELECT ('a05c0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'society-scope-' || n || '@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 6) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a05c0000-0000-4000-8000-000000000001', 'staff',   'collections_analyst'),
  ('a05c0000-0000-4000-8000-000000000002', 'manager', 'accounting_manager'),
  ('a05c0000-0000-4000-8000-000000000003', 'senior',  'accounting_analyst'),
  ('a05c0000-0000-4000-8000-000000000004', 'manager', 'manager'),
  ('a05c0000-0000-4000-8000-000000000005', 'manager', 'accounting_manager'),
  ('a05c0000-0000-4000-8000-000000000006', 'staff',   'collections_analyst')
ON CONFLICT DO NOTHING;

-- U1..U4 en A, U5 en B. U6 no tiene ficha.
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id, weekly_capacity_hours, hire_date, city)
SELECT ('505c0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a05c0000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'SOCSCOPE', 'Staff' || n, true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society
         WHERE name = CASE WHEN n = 5 THEN 'Ruizmier Jauregui S.R.L.' ELSE 'Ruizmier Pelaez S.R.L.' END),
       40, '2020-01-01', 'La Paz'
  FROM generate_series(1, 5) n;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c05c0000-0000-4000-8000-00000000000a', 'SOCSCOPE Cliente A',          'SOCSCOPE-A'),
  ('c05c0000-0000-4000-8000-00000000000b', 'SOCSCOPE Cliente B',          'SOCSCOPE-B'),
  ('c05c0000-0000-4000-8000-00000000000c', 'SOCSCOPE Cliente Compartido', 'SOCSCOPE-C'),
  ('c05c0000-0000-4000-8000-00000000000d', 'SOCSCOPE Cliente Sin Encargo','SOCSCOPE-D'),
  -- Cliente de los encargos administrativos (fuera de las consultas de clientes de la Fase 1).
  ('c05c0000-0000-4000-8000-00000000000e', 'ADMSCOPE Cliente Interno',   'ADMSCOPE-E');

INSERT INTO public.client_contacts (client_id, contact_type, full_name) VALUES
  ('c05c0000-0000-4000-8000-00000000000a', 'cobranza', 'Contacto A'),
  ('c05c0000-0000-4000-8000-00000000000b', 'cobranza', 'Contacto B');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                manager_id, created_by_staff_id, fecha_cierre, society_id)
SELECT e.id::uuid, e.client::uuid, e.name, e.code,
       '505c0000-0000-4000-8000-000000000004', e.creator::uuid, '2027-12-31',
       (SELECT society_id FROM public.society WHERE name = e.soc)
  FROM (VALUES
    ('e05c0000-0000-4000-8000-00000000000a', 'c05c0000-0000-4000-8000-00000000000a', 'SOCSCOPE EA',  '5C0A', '505c0000-0000-4000-8000-000000000004', 'Ruizmier Pelaez S.R.L.'),
    ('e05c0000-0000-4000-8000-00000000000b', 'c05c0000-0000-4000-8000-00000000000b', 'SOCSCOPE EB',  '5C0B', '505c0000-0000-4000-8000-000000000002', 'Ruizmier Jauregui S.R.L.'),
    ('e05c0000-0000-4000-8000-00000000001a', 'c05c0000-0000-4000-8000-00000000000c', 'SOCSCOPE ESA', '5C1A', '505c0000-0000-4000-8000-000000000002', 'Ruizmier Pelaez S.R.L.'),
    ('e05c0000-0000-4000-8000-00000000001b', 'c05c0000-0000-4000-8000-00000000000c', 'SOCSCOPE ESB', '5C1B', '505c0000-0000-4000-8000-000000000004', 'Ruizmier Jauregui S.R.L.')
  ) AS e(id, client, name, code, creator, soc);

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('d05c0000-0000-4000-8000-00000000000a', 'e05c0000-0000-4000-8000-00000000000a', 'BOB', 'High', 'Approved'),
  ('d05c0000-0000-4000-8000-00000000000b', 'e05c0000-0000-4000-8000-00000000000b', 'BOB', 'High', 'Approved');

-- Solicitudes ya aprobadas por el gerente (fase contable), pedidas por el gerente U4.
INSERT INTO public.fund_requests (fund_request_id, requester_staff_id, total_requested_amount, currency, status) VALUES
  ('f05c0000-0000-4000-8000-00000000000a', '505c0000-0000-4000-8000-000000000004', 100, 'BOB', 'aprobado_gerente'),
  ('f05c0000-0000-4000-8000-00000000000b', '505c0000-0000-4000-8000-000000000004', 100, 'BOB', 'aprobado_gerente'),
  ('f05c0000-0000-4000-8000-00000000000c', '505c0000-0000-4000-8000-000000000004', 200, 'BOB', 'aprobado_gerente');

-- La mixta FM es un dato historico: la regla de armado por sociedad (Fase 3) no la dejaria crear, por eso los triggers de
-- usuario se apagan solo para este INSERT de fixture.
SET LOCAL session_replication_role = replica;
INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount, approval_status) VALUES
  ('f05c0000-0000-4000-8000-00000000000a', 'd05c0000-0000-4000-8000-00000000000a', 100, 'aprobado'),
  ('f05c0000-0000-4000-8000-00000000000b', 'd05c0000-0000-4000-8000-00000000000b', 100, 'aprobado'),
  ('f05c0000-0000-4000-8000-00000000000c', 'd05c0000-0000-4000-8000-00000000000a', 100, 'aprobado'),
  ('f05c0000-0000-4000-8000-00000000000c', 'd05c0000-0000-4000-8000-00000000000b', 100, 'aprobado');
-- El trigger de auditoria pone created_by_staff_id = sesion (vacia aqui): el creador se fija con los triggers apagados.
UPDATE public.engagements SET created_by_staff_id = '505c0000-0000-4000-8000-000000000002'
 WHERE engagement_id IN ('e05c0000-0000-4000-8000-00000000000b', 'e05c0000-0000-4000-8000-00000000001a');
-- Encargos administrativos (el trigger 0722-160 exige el cliente interno de la sociedad: fuera de lo que se prueba aqui).
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, manager_id, fecha_cierre,
                                society_id, funcion, anio_fiscal)
SELECT e.id::uuid, 'c05c0000-0000-4000-8000-00000000000e', e.name, e.code, '505c0000-0000-4000-8000-000000000004',
       '2027-12-31', (SELECT society_id FROM public.society WHERE name = e.soc), 0, 2099
  FROM (VALUES
    ('e05d0000-0000-4000-8000-00000000002a', 'ADMSCOPE EAA', '5C2A', 'Ruizmier Pelaez S.R.L.'),
    ('e05d0000-0000-4000-8000-00000000002b', 'ADMSCOPE EAB', '5C2B', 'Ruizmier Jauregui S.R.L.')
  ) AS e(id, name, code, soc);
-- Plan y cuota por facturar en cada OT (los guards de plan bloquean un plan sobre una OT ya aprobada).
INSERT INTO public.wo_payment_plan (plan_id, wo_id, payment_days, exchange_rate, exchange_rate_mode) VALUES
  ('105c0000-0000-4000-8000-00000000000a', 'd05c0000-0000-4000-8000-00000000000a', 30, 6.96, 'variable'),
  ('105c0000-0000-4000-8000-00000000000b', 'd05c0000-0000-4000-8000-00000000000b', 30, 6.96, 'variable');
INSERT INTO public.wo_payment_installments (installment_id, plan_id, wo_id, installment_number, percentage, amount, status,
                                            agreed_invoice_date, agreed_payment_date, invoice_exchange_rate, payment_exchange_rate) VALUES
  ('115c0000-0000-4000-8000-00000000000a', '105c0000-0000-4000-8000-00000000000a', 'd05c0000-0000-4000-8000-00000000000a',
   1, 100, 1000, 'Pending', current_date + 5, current_date + 35, 6.96, 6.96),
  ('115c0000-0000-4000-8000-00000000000b', '105c0000-0000-4000-8000-00000000000b', 'd05c0000-0000-4000-8000-00000000000b',
   1, 100, 2000, 'Pending', current_date + 5, current_date + 35, 6.96, 6.96);
-- Un gasto ya revisado por Contabilidad en FA y otro en FB (facturables).
INSERT INTO public.fund_request_expenses (fre_id, fund_request_id, wo_id, expense_date, amount, currency, status) VALUES
  ('b05c0000-0000-4000-8000-00000000000a', 'f05c0000-0000-4000-8000-00000000000a', 'd05c0000-0000-4000-8000-00000000000a',
   current_date, 50, 'BOB', 'revisado_asistente'),
  ('b05c0000-0000-4000-8000-00000000000b', 'f05c0000-0000-4000-8000-00000000000b', 'd05c0000-0000-4000-8000-00000000000b',
   current_date, 70, 'BOB', 'revisado_asistente');
SET LOCAL session_replication_role = origin;

-- ── Helpers ───────────────────────────────────────────────────────────────────────────────────

-- ids (como texto ordenado) que devuelve `p_sql` para el usuario p_sub, con el rol authenticated real.
CREATE FUNCTION pg_temp.seen(p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE 'SELECT COALESCE(string_agg(x::text, '','' ORDER BY x::text), '''') FROM (' || p_sql || ') q(x)' INTO v;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.expect(p_label text, p_got text, p_want text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'SOCIETY SCOPE FAIL — %: se esperaba [%] y se obtuvo [%]', p_label, p_want, p_got;
  END IF;
  RAISE NOTICE 'PASS — %', p_label;
END $$;

-- Sufijos legibles: EA=0a, EB=0b, ESA=1a, ESB=1b (ultimos 2 caracteres del id del fixture).
CREATE FUNCTION pg_temp.short(p_ids text) RETURNS text
LANGUAGE sql AS $$
  SELECT COALESCE(string_agg(right(x, 2), ',' ORDER BY right(x, 2)), '')
    FROM unnest(string_to_array(NULLIF(p_ids, ''), ',')) x
$$;

DO $$
DECLARE
  u1 constant text := 'a05c0000-0000-4000-8000-000000000001';
  u2 constant text := 'a05c0000-0000-4000-8000-000000000002';
  u3 constant text := 'a05c0000-0000-4000-8000-000000000003';
  u4 constant text := 'a05c0000-0000-4000-8000-000000000004';
  u5 constant text := 'a05c0000-0000-4000-8000-000000000005';
  u6 constant text := 'a05c0000-0000-4000-8000-000000000006';
  q_eng  constant text := 'SELECT engagement_id FROM public.engagements WHERE engagement_name LIKE ''SOCSCOPE%''';
  q_wo   constant text := 'SELECT wo_id FROM public.work_orders WHERE wo_id::text LIKE ''d05c%''';
  q_cli  constant text := 'SELECT client_id FROM public.clients WHERE client_legal_name LIKE ''SOCSCOPE%''';
  q_dir  constant text := 'SELECT client_id FROM public.clients_directory WHERE client_legal_name LIKE ''SOCSCOPE%''';
  q_ctc  constant text := 'SELECT client_id FROM public.client_contacts WHERE full_name LIKE ''Contacto %''';
  q_fr   constant text := 'SELECT fund_request_id FROM public.fund_requests WHERE fund_request_id::text LIKE ''f05c%''';
  q_frwo constant text := 'SELECT fund_request_id FROM public.fund_request_work_orders WHERE fund_request_id::text LIKE ''f05c%''';
  q_vis  constant text := 'SELECT id FROM public.my_visible_engagement_ids() id WHERE id::text LIKE ''e05c%''';
  v_n int;
BEGIN
  -- 1. Las politicas existen y son RESTRICTIVE FOR ALL ──────────────────────────────────────────
  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'public' AND policyname = 'society scope'
     AND permissive = 'RESTRICTIVE' AND cmd = 'ALL'
     AND qual LIKE '%is_society_scoped_role()%' AND with_check LIKE '%is_society_scoped_role()%'
     AND tablename IN ('engagements','clients','client_contacts','work_orders','wo_budget_lines','wo_expense_budget',
                       'wo_payment_plan','wo_payment_installments','wo_installment_adjustments','wo_installment_events',
                       'wo_installment_notes','wo_installment_expenses','wo_installment_note_versions',
                       'fund_requests','fund_request_events','fund_request_work_orders','fund_request_expenses');
  PERFORM pg_temp.expect('17 politicas RESTRICTIVE "society scope" FOR ALL', v_n::text, '17');

  -- 2. Encargos: solo los de mi sociedad; EB (creado por U2) tampoco ──────────────────────────────
  PERFORM pg_temp.expect('cobranza A ve encargos de A',          pg_temp.short(pg_temp.seen(u1, q_eng)), '0a,1a');
  PERFORM pg_temp.expect('gerente contable A ve encargos de A (ser creador de EB no levanta el limite)',
                                                                  pg_temp.short(pg_temp.seen(u2, q_eng)), '0a,1a');
  PERFORM pg_temp.expect('analista contable A ve encargos de A', pg_temp.short(pg_temp.seen(u3, q_eng)), '0a,1a');
  PERFORM pg_temp.expect('gerente contable B ve encargos de B',  pg_temp.short(pg_temp.seen(u5, q_eng)), '0b,1b');
  PERFORM pg_temp.expect('cobranza sin ficha no ve encargos',     pg_temp.seen(u6, q_eng), '');
  PERFORM pg_temp.expect('control: el gerente ve los cuatro',     pg_temp.short(pg_temp.seen(u4, q_eng)), '0a,0b,1a,1b');

  -- 3. OT ─────────────────────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.expect('cobranza A ve solo la OT de A',         pg_temp.short(pg_temp.seen(u1, q_wo)), '0a');
  PERFORM pg_temp.expect('analista contable A ve solo la OT de A', pg_temp.short(pg_temp.seen(u3, q_wo)), '0a');
  PERFORM pg_temp.expect('gerente contable B ve solo la OT de B', pg_temp.short(pg_temp.seen(u5, q_wo)), '0b');
  PERFORM pg_temp.expect('cobranza sin ficha no ve OT',           pg_temp.seen(u6, q_wo), '');
  PERFORM pg_temp.expect('control: el gerente ve ambas OT',       pg_temp.short(pg_temp.seen(u4, q_wo)), '0a,0b');

  -- 4. Clientes, contactos y directorio (CN sin encargos no es de nadie) ───────────────────────
  PERFORM pg_temp.expect('cobranza A: clientes A y compartido',   pg_temp.short(pg_temp.seen(u1, q_cli)), '0a,0c');
  PERFORM pg_temp.expect('cobranza A: contactos solo de A',       pg_temp.short(pg_temp.seen(u1, q_ctc)), '0a');
  PERFORM pg_temp.expect('directorio, gerente contable A',        pg_temp.short(pg_temp.seen(u2, q_dir)), '0a,0c');
  PERFORM pg_temp.expect('directorio, gerente contable B',        pg_temp.short(pg_temp.seen(u5, q_dir)), '0b,0c');
  PERFORM pg_temp.expect('directorio, cobranza sin ficha',        pg_temp.seen(u6, q_dir), '');
  PERFORM pg_temp.expect('control: directorio completo para el gerente',
                                                                  pg_temp.short(pg_temp.seen(u4, q_dir)), '0a,0b,0c,0d');

  -- 5. Solicitudes de fondos: FM (mixta) no aparece para nadie con alcance por sociedad ──────────
  PERFORM pg_temp.expect('gerente contable A: solo FA',           pg_temp.short(pg_temp.seen(u2, q_fr)), '0a');
  PERFORM pg_temp.expect('analista contable A: solo FA',          pg_temp.short(pg_temp.seen(u3, q_fr)), '0a');
  PERFORM pg_temp.expect('gerente contable B: solo FB',           pg_temp.short(pg_temp.seen(u5, q_fr)), '0b');
  PERFORM pg_temp.expect('gerente contable A: OT-solicitud solo de FA (FM no se ve a medias)',
                                                                  pg_temp.short(pg_temp.seen(u2, q_frwo)), '0a');
  PERFORM pg_temp.expect('control: el solicitante ve sus tres solicitudes',
                                                                  pg_temp.short(pg_temp.seen(u4, q_fr)), '0a,0b,0c');

  -- 6. my_visible_engagement_ids() = RLS real de engagements ─────────────────────────────────
  PERFORM pg_temp.expect('B4 = RLS para gerente contable A', pg_temp.seen(u2, q_vis), pg_temp.seen(u2, q_eng));
  PERFORM pg_temp.expect('B4 = RLS para gerente contable B', pg_temp.seen(u5, q_vis), pg_temp.seen(u5, q_eng));
  PERFORM pg_temp.expect('B4 = RLS para cobranza sin ficha', pg_temp.seen(u6, q_vis), pg_temp.seen(u6, q_eng));
  PERFORM pg_temp.expect('B4 = RLS para el gerente (control)', pg_temp.seen(u4, q_vis), pg_temp.seen(u4, q_eng));

  -- 7. Los conjuntos no enumeran nada a quien no tiene alcance por sociedad ──────────────────────
  PERFORM pg_temp.expect('my_society_engagement_ids vacio para el gerente',
    pg_temp.seen(u4, 'SELECT id FROM public.my_society_engagement_ids() id'), '');

END $$;

-- ══ Fase 2: RPC SECURITY DEFINER de lectura ════════════════════════════════════════════════════

-- Llama a la RPC como p_sub (las DEFINER deciden por auth.uid(), no por el rol de la sesion) y devuelve el
-- mensaje de error, o NULL si no hubo error.
CREATE FUNCTION pg_temp.rpc_error(p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN NULL;
END $$;

CREATE FUNCTION pg_temp.rpc_text(p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN COALESCE(v, '');
END $$;

CREATE FUNCTION pg_temp.expect_forbidden(p_label text, p_sub text, p_sql text, p_marker text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_err text := pg_temp.rpc_error(p_sub, p_sql);
BEGIN
  IF v_err IS NULL OR v_err NOT LIKE '%' || p_marker || '%' THEN
    RAISE EXCEPTION 'SOCIETY SCOPE FAIL — %: se esperaba un error con [%] y se obtuvo [%]', p_label, p_marker, COALESCE(v_err, 'sin error');
  END IF;
  RAISE NOTICE 'PASS — %', p_label;
END $$;

DO $$
DECLARE
  u1 constant text := 'a05c0000-0000-4000-8000-000000000001';  -- cobranza A
  u2 constant text := 'a05c0000-0000-4000-8000-000000000002';  -- gerente contable A
  u3 constant text := 'a05c0000-0000-4000-8000-000000000003';  -- analista contable A
  u4 constant text := 'a05c0000-0000-4000-8000-000000000004';  -- gerente (control)
  u5 constant text := 'a05c0000-0000-4000-8000-000000000005';  -- gerente contable B
  wa constant text := 'd05c0000-0000-4000-8000-00000000000a';
  wb constant text := 'd05c0000-0000-4000-8000-00000000000b';
  ib constant text := '115c0000-0000-4000-8000-00000000000b';
  soc_b uuid := (SELECT society_id FROM public.society WHERE name = 'Ruizmier Jauregui S.R.L.');
  q_coll constant text := $q$SELECT string_agg(r->>'engagement_code', ',' ORDER BY r->>'engagement_code')
                               FROM jsonb_array_elements(public.list_collections_installments('por_facturar')->'rows') r
                              WHERE r->>'engagement_code' LIKE '5C%'$q$;
BEGIN
  -- Cobranzas ───────────────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.expect('Cobranzas: cobranza A solo trae la cuota de A', pg_temp.rpc_text(u1, q_coll), '5C0A');
  PERFORM pg_temp.expect('Cobranzas: gerente contable B solo trae la cuota de B', pg_temp.rpc_text(u5, q_coll), '5C0B');
  PERFORM pg_temp.expect('Cobranzas: filtrar por la sociedad B no amplia el alcance de cobranza A',
    pg_temp.rpc_text(u1, format($q$SELECT (public.list_collections_installments('por_facturar', %L::uuid)->>'total_count')$q$, soc_b)), '0');
  PERFORM pg_temp.expect('Cobranzas: las opciones de cobranza A solo ofrecen su sociedad',
    pg_temp.rpc_text(u1, $q$SELECT string_agg(x->>'name', ',') FROM jsonb_array_elements(public.collections_filter_options()->'societies') x$q$),
    'Ruizmier Pelaez S.R.L.');

  -- Gastos facturables, contactos, diferencia de cambio ───────────────────────────────────────
  PERFORM pg_temp.expect('wo_billable_expenses: cobranza A ve el gasto de WA',
    pg_temp.rpc_text(u1, format('SELECT string_agg(amount::text, '','') FROM public.wo_billable_expenses(%L::uuid)', wa)), '50');
  PERFORM pg_temp.expect_forbidden('wo_billable_expenses: cobranza A no ve los gastos de WB por id', u1,
    format('SELECT 1 FROM public.wo_billable_expenses(%L::uuid)', wb), 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect('get_wo_client_contacts: cobranza A ve el contacto de WA',
    pg_temp.rpc_text(u1, format('SELECT string_agg(full_name, '','') FROM public.get_wo_client_contacts(%L::uuid)', wa)), 'Contacto A');
  PERFORM pg_temp.expect_forbidden('get_wo_client_contacts: cobranza A no ve el contacto de WB', u1,
    format('SELECT 1 FROM public.get_wo_client_contacts(%L::uuid)', wb), 'CONTACT_FORBIDDEN');
  PERFORM pg_temp.expect_forbidden('suggest_exchange_difference: cobranza A no consulta una cuota de B', u1,
    format('SELECT public.suggest_exchange_difference(%L::uuid)', ib), 'SOCIETY_SCOPE_FORBIDDEN');

  -- Gastos por OT (Contabilidad) ─────────────────────────────────────────────────────────────
  PERFORM pg_temp.expect('fund_work_order_expense_summary: analista contable A solo ve WA (FM mixta no suma)',
    pg_temp.rpc_text(u3, $q$SELECT string_agg(engagement_code || ':' || request_count || ':' || assigned, ',' ORDER BY engagement_code)
                              FROM public.fund_work_order_expense_summary() WHERE engagement_code LIKE '5C%'$q$), '5C0A:1:100');
  PERFORM pg_temp.expect('fund_work_order_expense_summary: gerente contable B solo ve WB',
    pg_temp.rpc_text(u5, $q$SELECT string_agg(engagement_code, ',') FROM public.fund_work_order_expense_summary() WHERE engagement_code LIKE '5C%'$q$), '5C0B');
  PERFORM pg_temp.expect_forbidden('fund_work_order_expense_detail: gerente contable A no abre WB', u2,
    format('SELECT public.fund_work_order_expense_detail(%L::uuid)', wb), 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect('fund_work_order_expense_detail: gerente contable A abre WA',
    pg_temp.rpc_error(u2, format('SELECT public.fund_work_order_expense_detail(%L::uuid)', wa)), NULL);

  -- Encargos Administrativos y portafolio ─────────────────────────────────────────────────────
  PERFORM pg_temp.expect('list_administrative_engagements: gerente contable A solo ve el de A',
    pg_temp.rpc_text(u2, $q$SELECT string_agg(x->>'engagement_code', ',') FROM jsonb_array_elements(public.list_administrative_engagements()) x
                              WHERE x->>'engagement_code' LIKE '5C%'$q$), '5C2A');
  PERFORM pg_temp.expect('list_administrative_engagements: control, el gerente ve los dos',
    pg_temp.rpc_text(u4, $q$SELECT string_agg(x->>'engagement_code', ',' ORDER BY x->>'engagement_code') FROM jsonb_array_elements(public.list_administrative_engagements()) x
                              WHERE x->>'engagement_code' LIKE '5C%'$q$), '5C2A,5C2B');
  PERFORM pg_temp.expect('list_portfolio_engagements: gerente contable A ve lo que creo en A, no EB (creado por el en B)',
    pg_temp.rpc_text(u2, $q$SELECT string_agg(x->>'engagement_code', ',') FROM jsonb_array_elements(public.list_portfolio_engagements()) x
                              WHERE x->>'engagement_code' LIKE '5C%'$q$), '5C1A');

  RAISE NOTICE 'SOCIETY SCOPE FASE 2: RPC checks passed';
END $$;

-- ══ Fase 3: escrituras, regla de armado de solicitudes y cambio de sociedad del encargo ═════════════

-- Borrador FD del gerente U4 (sociedad A) que quedo con una OT de B: dato historico, anterior a la regla.
SET LOCAL session_replication_role = replica;
INSERT INTO public.fund_requests (fund_request_id, requester_staff_id, total_requested_amount, currency, status) VALUES
  ('f05c0000-0000-4000-8000-00000000000d', '505c0000-0000-4000-8000-000000000004', 100, 'BOB', 'borrador');
INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount, approval_status) VALUES
  ('f05c0000-0000-4000-8000-00000000000d', 'd05c0000-0000-4000-8000-00000000000b', 100, 'pendiente');
SET LOCAL session_replication_role = origin;

-- Error (o NULL) de un DML ejecutado como dueno y sin sesion: los triggers aplican igual a todos.
CREATE FUNCTION pg_temp.owner_error(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
  END;
  RETURN NULL;
END $$;

CREATE FUNCTION pg_temp.expect_owner_forbidden(p_label text, p_sql text, p_marker text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_err text := pg_temp.owner_error(p_sql);
BEGIN
  IF v_err IS NULL OR v_err NOT LIKE '%' || p_marker || '%' THEN
    RAISE EXCEPTION 'SOCIETY SCOPE FAIL — %: se esperaba un error con [%] y se obtuvo [%]', p_label, p_marker, COALESCE(v_err, 'sin error');
  END IF;
  RAISE NOTICE 'PASS — %', p_label;
END $$;

DO $$
DECLARE
  u1 constant text := 'a05c0000-0000-4000-8000-000000000001';  -- cobranza A
  u2 constant text := 'a05c0000-0000-4000-8000-000000000002';  -- gerente contable A
  u3 constant text := 'a05c0000-0000-4000-8000-000000000003';  -- analista contable A
  u4 constant text := 'a05c0000-0000-4000-8000-000000000004';  -- gerente (control)
  u5 constant text := 'a05c0000-0000-4000-8000-000000000005';  -- gerente contable B
  wa constant text := 'd05c0000-0000-4000-8000-00000000000a';
  wb constant text := 'd05c0000-0000-4000-8000-00000000000b';
  ia constant text := '115c0000-0000-4000-8000-00000000000a';
  ib constant text := '115c0000-0000-4000-8000-00000000000b';
  fa constant text := 'f05c0000-0000-4000-8000-00000000000a';
  fb constant text := 'f05c0000-0000-4000-8000-00000000000b';
  fm constant text := 'f05c0000-0000-4000-8000-00000000000c';
  fd constant text := 'f05c0000-0000-4000-8000-00000000000d';
  soc_b uuid := (SELECT society_id FROM public.society WHERE name = 'Ruizmier Jauregui S.R.L.');
  v_adj_b uuid;
  v_note uuid;
BEGIN
  -- Cuotas ───────────────────────────────────────────────────────────────────────────────────
  PERFORM pg_temp.expect_forbidden('invoice_installment: cobranza A no factura una cuota de B', u1,
    format($q$SELECT public.invoice_installment(%L::uuid, 'Pending', current_date + 30, current_date, NULL::numeric, NULL::date)$q$, ib), 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect_forbidden('add_installment_adjustment: cobranza A no ajusta una cuota de B', u1,
    format($q$SELECT public.add_installment_adjustment(%L::uuid, 'descuento', -10, 'x')$q$, ib), 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect('add_installment_adjustment: cobranza A si ajusta una cuota de A',
    pg_temp.rpc_error(u1, format($q$SELECT public.add_installment_adjustment(%L::uuid, 'descuento', -10, 'x')$q$, ia)), NULL);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u5, 'role', 'authenticated')::text, true);
  v_adj_b := (public.add_installment_adjustment(ib::uuid, 'descuento', -10, 'de B')).adjustment_id;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.expect_forbidden('delete_installment_adjustment: cobranza A no retira un ajuste de B', u1,
    format('SELECT public.delete_installment_adjustment(%L::uuid)', v_adj_b), 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect_forbidden('create_expense_reimbursement_row: cobranza A no factura gastos de WB', u1,
    format('SELECT public.create_expense_reimbursement_row(%L::uuid)', wb), 'SOCIETY_SCOPE_FORBIDDEN');

  -- Notas: un autor trasladado de sociedad ya no edita ni borra lo que dejo en la anterior ───────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  v_note := (public.add_installment_note(wa::uuid, NULL, 'nota de A')).note_id;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.expect_forbidden('add_installment_note: cobranza A no anota en WB', u1,
    format($q$SELECT public.add_installment_note(%L::uuid, NULL, 'x')$q$, wb), 'NOTE');
  UPDATE public.staff SET society_id = soc_b WHERE staff_id = '505c0000-0000-4000-8000-000000000001';
  PERFORM pg_temp.expect_forbidden('edit_installment_note: el autor trasladado a B no edita su nota de A', u1,
    format($q$SELECT public.edit_installment_note(%L::uuid, 'editada')$q$, v_note), 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect_forbidden('delete_installment_note: el autor trasladado a B no borra su nota de A', u1,
    format('SELECT public.delete_installment_note(%L::uuid)', v_note), 'SOCIETY_SCOPE_FORBIDDEN');
  UPDATE public.staff SET society_id = (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.')
   WHERE staff_id = '505c0000-0000-4000-8000-000000000001';
  PERFORM pg_temp.expect('edit_installment_note: de vuelta en A, el autor si edita',
    pg_temp.rpc_error(u1, format($q$SELECT public.edit_installment_note(%L::uuid, 'editada')$q$, v_note)), NULL);

  -- Fondos: la solicitud se juzga entera ────────────────────────────────────────────────────────
  PERFORM pg_temp.expect_forbidden('fund_request_disburse: gerente contable A no desembolsa FB', u2,
    format('SELECT public.fund_request_disburse(%L::uuid, 100)', fb), 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect_forbidden('fund_request_disburse: gerente contable A no desembolsa la mixta FM', u2,
    format('SELECT public.fund_request_disburse(%L::uuid, 200)', fm), 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect_forbidden('fund_request_cancel: analista contable A no cancela FB', u3,
    format($q$SELECT public.fund_request_cancel(%L::uuid, 'x')$q$, fb), 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect_forbidden('fund_request_expense_review: gerente contable A no revisa un gasto de FB', u2,
    $q$SELECT public.fund_request_expense_review('b05c0000-0000-4000-8000-00000000000b'::uuid, 'aprobar')$q$, 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect_forbidden('fund_request_settle: gerente contable A no liquida FB', u2,
    format($q$SELECT public.fund_request_settle(%L::uuid, 'sin_saldo', 0)$q$, fb), 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect_forbidden('fund_request_confirm_settlement: gerente contable A no confirma FB', u2,
    format('SELECT public.fund_request_confirm_settlement(%L::uuid)', fb), 'SOCIETY_SCOPE_FORBIDDEN');
  PERFORM pg_temp.expect('fund_request_disburse: gerente contable A si desembolsa FA',
    pg_temp.rpc_error(u2, format('SELECT public.fund_request_disburse(%L::uuid, 100)', fa)), NULL);

  -- Regla de armado: OT de la sociedad del SOLICITANTE (todos los empleados, admin incluido) ──────────
  PERFORM pg_temp.expect('selector de OT para fondos: el gerente de A solo ve WA',
    pg_temp.seen(u4, $q$SELECT wo_id FROM public.fund_request_selectable_work_orders WHERE wo_id::text LIKE 'd05c%'$q$), wa);
  PERFORM pg_temp.expect('selector de OT para fondos: el gerente contable de B solo ve WB',
    pg_temp.seen(u5, $q$SELECT wo_id FROM public.fund_request_selectable_work_orders WHERE wo_id::text LIKE 'd05c%'$q$), wb);
  PERFORM pg_temp.expect_owner_forbidden('alta: no se agrega WB a una solicitud de un solicitante de A (aunque lo haga el dueno)',
    format('INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount) VALUES (%L, %L, 10)', fa, wb),
    'FUND_REQUEST_SOCIETY_MISMATCH');
  PERFORM pg_temp.expect_owner_forbidden('cambio de OT: FA no pasa a WB',
    format('UPDATE public.fund_request_work_orders SET wo_id = %L WHERE fund_request_id = %L', wb, fa), 'FUND_REQUEST_SOCIETY_MISMATCH');
  PERFORM pg_temp.expect_owner_forbidden('cambio de solicitud padre: la fila de WB no pasa a FA',
    format('UPDATE public.fund_request_work_orders SET fund_request_id = %L WHERE fund_request_id = %L', fa, fb), 'FUND_REQUEST_SOCIETY_MISMATCH');
  PERFORM pg_temp.expect_owner_forbidden('cambio de solicitante: FA no pasa a uno de B',
    format($q$UPDATE public.fund_requests SET requester_staff_id = '505c0000-0000-4000-8000-000000000005' WHERE fund_request_id = %L$q$, fa),
    'FUND_REQUEST_SOCIETY_MISMATCH');
  PERFORM pg_temp.expect_forbidden('fund_request_submit: el borrador historico FD (OT de B) no se envia', u4,
    format('SELECT public.fund_request_submit(%L::uuid)', fd), 'FUND_REQUEST_SOCIETY_MISMATCH');

  -- Cambio de sociedad del encargo ──────────────────────────────────────────────────────────────
  PERFORM pg_temp.expect_owner_forbidden('EA (con FA abierta) no cambia de sociedad',
    format($q$UPDATE public.engagements SET society_id = %L WHERE engagement_id = 'e05c0000-0000-4000-8000-00000000000a'$q$, soc_b),
    'ENGAGEMENT_SOCIETY_LOCKED');
  PERFORM pg_temp.expect('ESA (sin solicitudes) si cambia de sociedad',
    pg_temp.owner_error(format($q$UPDATE public.engagements SET society_id = %L WHERE engagement_id = 'e05c0000-0000-4000-8000-00000000001a'$q$, soc_b)), NULL);

  RAISE NOTICE 'SOCIETY SCOPE FASE 3: write checks passed';
END $$;

DO $$ BEGIN RAISE NOTICE 'SOCIETY SCOPE: ALL CHECKS PASSED (rolled back)'; END $$;

ROLLBACK;
