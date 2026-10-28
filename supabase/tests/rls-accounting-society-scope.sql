-- Alcance por sociedad de Contabilidad y Cobranzas (2026-10-28) — Fase 1: politicas RLS y vistas.
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
--
-- Mundo (prefijo 5c):
--   Sociedad A = Ruizmier Pelaez, B = Ruizmier Jauregui (seed).
--   U1 collections_analyst A · U2 accounting_manager A · U3 accounting_analyst A · U4 manager A (control)
--   U5 accounting_manager B · U6 collections_analyst sin ficha
--   CA cliente solo A · CB solo B · CS compartido (encargo en A y en B) · CN sin encargos
--   EA (A, CA) · EB (B, CB, creado por U2) · ESA (A, CS) · ESB (B, CS) — U4 es gerente de los cuatro
--   WA OT de EA · WB OT de EB · FA solicitud sobre WA · FB sobre WB · FM mixta (WA + WB)

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
  ('c05c0000-0000-4000-8000-00000000000d', 'SOCSCOPE Cliente Sin Encargo','SOCSCOPE-D');

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
    ('e05c0000-0000-4000-8000-00000000001a', 'c05c0000-0000-4000-8000-00000000000c', 'SOCSCOPE ESA', '5C1A', '505c0000-0000-4000-8000-000000000004', 'Ruizmier Pelaez S.R.L.'),
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

  RAISE NOTICE 'SOCIETY SCOPE: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
