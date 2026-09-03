-- Transactional tests for public.list_portfolio_engagements()
-- — BUG 0828-185 (bugs/0828-185/plan_v2.md, sección e).
--
-- DÓNDE CORRE: via supabase/tests/local/run-rls-tests.sh, contra la base scratch local con el
-- set consolidado + 0817-180 + 0828-186 + 0828-185 aplicados. Misma convención que
-- rls-0828-186-*.sql: una sola transacción que SIEMPRE termina en ROLLBACK, un NOTICE por
-- chequeo que pasa, marcador final "PORTFOLIO ENGAGEMENTS RPC: ALL CHECKS PASSED".
--
-- Qué se cubre (plan_v2 §e):
--   1. Los 4 roles firm (admin, it_security_manager, senior_partner, risk_partner) ven TODOS
--      los encargos del fixture, incluidos los de otra sociedad.
--   2. partner (own_society) ve los encargos de SU sociedad incluidos los creados por otros,
--      y NO ve un encargo de otra sociedad aunque figure ahí como partner_id.
--   3. sqr sintético (own_society, sin holder real hoy) se comporta igual que partner: ve su
--      sociedad, no la otra.
--   4. director (own_society) ve el encargo de su sociedad — mismo bucket que partner/sqr.
--   5. manager (own_management) ve SOLO donde es manager_id + lo que creó; asignado nada más
--      que partner_id en un encargo ajeno NO le da visibilidad (la regresión exacta del bug).
--   6. hr_analyst ve únicamente lo que creó.
--   7. senior / risk_supervisor -> vacío (sin engagement.read en la matriz real).
--   8. Sin impersonar (auth.uid() NULL) -> arreglo vacío, sin error.
--   9. Forma del payload: client/society/work_order/staff anidados con los campos que la UI
--      necesita, y los seis staff embebidos SIN PII (email/id_number/aud_reg_number/
--      auth_user_id/role_key).
--  10. Orden determinístico: created_at DESC, engagement_id de desempate.
--  11. No-escalation: un SELECT directo a `engagements` como partner sigue mostrando solo lo
--      que la policy "engagements read" ya mostraba antes de este fix (no se tocó la RLS).
--
-- Fixture: todos los ids llevan el prefijo 828185 reconocible.

BEGIN;

-- ── Dos sociedades del fixture (own_society necesita comparar sociedades reales) ────────────
INSERT INTO public.society (society_id, name, is_active) VALUES
  ('5a828185-0000-4000-8000-000000000001', 'Sociedad Norte 0828185', true),
  ('5a828185-0000-4000-8000-000000000002', 'Sociedad Sur 0828185', true)
ON CONFLICT (society_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.practicas WHERE code = 1) THEN
    RAISE EXCEPTION 'FIXTURE: falta el servicio code = 1 y staff.practica_id es NOT NULL.';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a0828185-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'pep-test-' || n || '@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 13) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ── Personal: un caller por rol bajo prueba ─────────────────────────────────────────────────
-- 01 admin · 02 it_security_manager · 03 senior_partner · 04 risk_partner (todos firm-wide)
-- 05 partner (sociedad Norte) · 06 sqr SINTÉTICO (sociedad Norte, sin holder real hoy)
-- 07 manager (sociedad Sur, own_management) · 08 hr_analyst (solo creador)
-- 09 senior · 10 risk_supervisor (sin engagement.read en la matriz real -> vacío)
-- 11 third party (crea encargos que ningún caller bajo prueba debe heredar por asignación)
-- 12 director SINTÉTICO (sociedad Norte, mismo bucket que partner/sqr)
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id)
SELECT ('50828185-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a0828185-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'PEP', 'Sujeto' || lpad(n::text, 2, '0'),
       true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       CASE n
         WHEN 7 THEN '5a828185-0000-4000-8000-000000000002'::uuid  -- manager: sociedad Sur
         ELSE '5a828185-0000-4000-8000-000000000001'::uuid          -- resto: sociedad Norte
       END
  FROM generate_series(1, 12) n;

INSERT INTO public.user_roles (user_id, role_key) VALUES
  ('a0828185-0000-4000-8000-000000000001', 'admin'),
  ('a0828185-0000-4000-8000-000000000002', 'it_security_manager'),
  ('a0828185-0000-4000-8000-000000000003', 'senior_partner'),
  ('a0828185-0000-4000-8000-000000000004', 'risk_partner'),
  ('a0828185-0000-4000-8000-000000000005', 'partner'),
  ('a0828185-0000-4000-8000-000000000006', 'sqr'),
  ('a0828185-0000-4000-8000-000000000007', 'manager'),
  ('a0828185-0000-4000-8000-000000000008', 'hr_analyst'),
  ('a0828185-0000-4000-8000-000000000009', 'senior'),
  ('a0828185-0000-4000-8000-000000000010', 'risk_supervisor'),
  ('a0828185-0000-4000-8000-000000000011', 'assistant'),
  ('a0828185-0000-4000-8000-000000000012', 'director')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('60828185-0000-4000-8000-000000000001', 'Cliente Portfolio 0828185', 'NIT-0828185')
ON CONFLICT (client_id) DO NOTHING;

-- ── Encargos del fixture ─────────────────────────────────────────────────────────────────────
-- E1: sociedad Norte, creado por un tercero, SIN ningún campo de equipo asignado -- prueba pura
--     de own_society (si alguien lo ve, es solo por sociedad, nunca por asignación/creación).
-- E2: sociedad SUR, creado por un tercero, con partner_id = el partner de Norte (05) -- prueba
--     que own_society exige la SOCIEDAD, no basta con estar asignado (la fuga que reporta el bug,
--     invertida: acá NO debe verlo pese a la asignación).
-- E3: sociedad Norte, creado por el partner (05) y con los 6 campos de equipo + Orden de Trabajo
--     -- fixture de forma del payload.
-- E4: sociedad Sur, creado por un tercero, manager_id = manager (07) -- own_management.
-- E5: sociedad Sur, creado por un tercero, partner_id = manager (07) (NO manager_id) -- la
--     regresión exacta: asignado nada más que como partner NO da visibilidad de portafolio.
-- E6: sociedad Sur, creado por el manager (07) -- creator.
-- E7: sociedad Norte, creado por hr_analyst (08) -- creator, único que debe ver.
-- O1/O2/O3: sociedad Norte, creados por el partner (05) con created_at explícito y espaciado --
--     fixture de orden determinístico.
-- trg_engagements_created_by (BEFORE INSERT, set_engagement_created_by()) pisa
-- created_by_staff_id con get_my_staff_id() SIEMPRE -- a diferencia de
-- enforce_engagement_creator_team()/enforce_engagement_profile_scope() no tiene excepción
-- para auth.uid() IS NULL. Sin esto, el valor explícito de cada fila de abajo quedaría en
-- NULL (el fixture corre sin impersonar) y rompería el bucket "creator" (E6/E7). Mismo
-- patrón ya usado en rpc-worksheet-activity-practice-scope.sql:122-134.
ALTER TABLE public.engagements DISABLE TRIGGER trg_engagements_created_by;

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, status, fecha_cierre,
                                 society_id, created_by_staff_id,
                                 partner_id, manager_id, sqr_id, encargado_id,
                                 specialist_it_id, specialist_tax_id, created_at) VALUES
  ('70828185-0000-4000-8000-000000000001', '60828185-0000-4000-8000-000000000001',
   'PEP E1 Norte sin equipo', 'active', '2026-12-31',
   '5a828185-0000-4000-8000-000000000001', '50828185-0000-4000-8000-000000000011',
   NULL, NULL, NULL, NULL, NULL, NULL, now()),
  ('70828185-0000-4000-8000-000000000002', '60828185-0000-4000-8000-000000000001',
   'PEP E2 Sur con partner de Norte', 'active', '2026-12-31',
   '5a828185-0000-4000-8000-000000000002', '50828185-0000-4000-8000-000000000011',
   '50828185-0000-4000-8000-000000000005', NULL, NULL, NULL, NULL, NULL, now()),
  ('70828185-0000-4000-8000-000000000003', '60828185-0000-4000-8000-000000000001',
   'PEP E3 Norte payload completo', 'active', '2026-12-31',
   '5a828185-0000-4000-8000-000000000001', '50828185-0000-4000-8000-000000000005',
   '50828185-0000-4000-8000-000000000005', '50828185-0000-4000-8000-000000000005',
   '50828185-0000-4000-8000-000000000005', '50828185-0000-4000-8000-000000000005',
   '50828185-0000-4000-8000-000000000009', '50828185-0000-4000-8000-000000000010', now()),
  ('70828185-0000-4000-8000-000000000004', '60828185-0000-4000-8000-000000000001',
   'PEP E4 Sur manager', 'active', '2026-12-31',
   '5a828185-0000-4000-8000-000000000002', '50828185-0000-4000-8000-000000000011',
   NULL, '50828185-0000-4000-8000-000000000007', NULL, NULL, NULL, NULL, now()),
  ('70828185-0000-4000-8000-000000000005', '60828185-0000-4000-8000-000000000001',
   'PEP E5 Sur manager solo como partner', 'active', '2026-12-31',
   '5a828185-0000-4000-8000-000000000002', '50828185-0000-4000-8000-000000000011',
   '50828185-0000-4000-8000-000000000007', NULL, NULL, NULL, NULL, NULL, now()),
  ('70828185-0000-4000-8000-000000000006', '60828185-0000-4000-8000-000000000001',
   'PEP E6 Sur creado por manager', 'active', '2026-12-31',
   '5a828185-0000-4000-8000-000000000002', '50828185-0000-4000-8000-000000000007',
   NULL, NULL, NULL, NULL, NULL, NULL, now()),
  ('70828185-0000-4000-8000-000000000007', '60828185-0000-4000-8000-000000000001',
   'PEP E7 Norte creado por hr_analyst', 'active', '2026-12-31',
   '5a828185-0000-4000-8000-000000000001', '50828185-0000-4000-8000-000000000008',
   NULL, NULL, NULL, NULL, NULL, NULL, now()),
  ('70828185-0000-4000-8000-000000000011', '60828185-0000-4000-8000-000000000001',
   'PEP O1 orden', 'active', '2026-12-31',
   '5a828185-0000-4000-8000-000000000001', '50828185-0000-4000-8000-000000000005',
   NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-01T00:00:00Z'),
  ('70828185-0000-4000-8000-000000000012', '60828185-0000-4000-8000-000000000001',
   'PEP O2 orden', 'active', '2026-12-31',
   '5a828185-0000-4000-8000-000000000001', '50828185-0000-4000-8000-000000000005',
   NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-01T00:00:00Z'),
  ('70828185-0000-4000-8000-000000000013', '60828185-0000-4000-8000-000000000001',
   'PEP O3 orden', 'active', '2026-12-31',
   '5a828185-0000-4000-8000-000000000001', '50828185-0000-4000-8000-000000000005',
   NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-01T00:00:00Z');

ALTER TABLE public.engagements ENABLE TRIGGER trg_engagements_created_by;

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status,
                                approved_at, risk_status) VALUES
  ('80828185-0000-4000-8000-000000000003', '70828185-0000-4000-8000-000000000003',
   'BOB', 'High', 'Approved', '2026-06-01T00:00:00Z', 'Approved');

-- ── Helpers ────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

CREATE FUNCTION pg_temp.u(n integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'a0828185-0000-4000-8000-' || lpad(n::text, 12, '0')
$$;
CREATE FUNCTION pg_temp.s(n integer) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('70828185-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

CREATE FUNCTION pg_temp.has_eng(p_result jsonb, p_id uuid) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_result) e
     WHERE (e->>'engagement_id')::uuid = p_id
  )
$$;

SET LOCAL ROLE authenticated;

-- ── 1. Roles firm ven TODOS los encargos (10 en total en este fixture) ──────────────────────
DO $$
DECLARE
  v_result jsonb;
  v_role   text;
  v_uid    text;
BEGIN
  FOR v_role, v_uid IN
    SELECT * FROM (VALUES
      ('admin',               pg_temp.u(1)),
      ('it_security_manager', pg_temp.u(2)),
      ('senior_partner',      pg_temp.u(3)),
      ('risk_partner',        pg_temp.u(4))
    ) t(role_key, uid)
  LOOP
    PERFORM pg_temp.impersonate(v_uid);
    SELECT public.list_portfolio_engagements() INTO v_result;
    IF jsonb_array_length(v_result) <> 10 THEN
      RAISE EXCEPTION 'FAIL: role firm % debía ver los 10 encargos del fixture, vio %',
        v_role, jsonb_array_length(v_result);
    END IF;
    IF NOT pg_temp.has_eng(v_result, pg_temp.s(2)) THEN
      RAISE EXCEPTION 'FAIL: role firm % no vio E2 (otra sociedad) -- debía verlo (firm-wide)', v_role;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK 1: admin/it_security_manager/senior_partner/risk_partner ven los 10 encargos, incluida otra sociedad';
END $$;

-- ── 2. partner (own_society): su sociedad incluidos los creados por otros, NO la otra sociedad ─
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(5));
  SELECT public.list_portfolio_engagements() INTO v_result;

  IF NOT pg_temp.has_eng(v_result, pg_temp.s(1)) THEN
    RAISE EXCEPTION 'FAIL: partner debía ver E1 (su sociedad, creado por otro) vía own_society';
  END IF;
  IF NOT pg_temp.has_eng(v_result, pg_temp.s(7)) THEN
    RAISE EXCEPTION 'FAIL: partner debía ver E7 (su sociedad, creado por hr_analyst) vía own_society';
  END IF;
  IF pg_temp.has_eng(v_result, pg_temp.s(2)) THEN
    RAISE EXCEPTION 'FAIL: partner NO debía ver E2 (otra sociedad) pese a figurar como partner_id ahí';
  END IF;
  IF jsonb_array_length(v_result) <> 6 THEN
    RAISE EXCEPTION 'FAIL: partner debía ver 6 encargos (E1,E3,E7,O1,O2,O3 -- todos de su sociedad), vio %',
      jsonb_array_length(v_result);
  END IF;
  RAISE NOTICE 'OK 2: partner ve su sociedad (incl. creados por otros, incl. E7 creado por hr_analyst) y no la otra sociedad pese a estar asignado ahí';
END $$;

-- ── 3. sqr SINTÉTICO: mismo bucket own_society que partner ──────────────────────────────────
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(6));
  SELECT public.list_portfolio_engagements() INTO v_result;

  IF NOT pg_temp.has_eng(v_result, pg_temp.s(1)) THEN
    RAISE EXCEPTION 'FAIL: sqr (sintético, sin holder real hoy) debía ver E1 (su sociedad)';
  END IF;
  IF pg_temp.has_eng(v_result, pg_temp.s(2)) THEN
    RAISE EXCEPTION 'FAIL: sqr (sintético) NO debía ver E2 (otra sociedad)';
  END IF;
  RAISE NOTICE 'OK 3: sqr sintético cubre own_society igual que partner (sin holder real hoy)';
END $$;

-- ── 4. director: mismo bucket own_society ───────────────────────────────────────────────────
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(12));
  SELECT public.list_portfolio_engagements() INTO v_result;

  IF NOT pg_temp.has_eng(v_result, pg_temp.s(1)) THEN
    RAISE EXCEPTION 'FAIL: director debía ver E1 (su sociedad) vía own_society';
  END IF;
  RAISE NOTICE 'OK 4: director cubre own_society igual que partner/sqr';
END $$;

-- ── 5. manager (own_management): solo manager_id + lo creado -- la regresión exacta ─────────
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(7));
  SELECT public.list_portfolio_engagements() INTO v_result;

  IF NOT pg_temp.has_eng(v_result, pg_temp.s(4)) THEN
    RAISE EXCEPTION 'FAIL: manager debía ver E4 (manager_id = él mismo)';
  END IF;
  IF NOT pg_temp.has_eng(v_result, pg_temp.s(6)) THEN
    RAISE EXCEPTION 'FAIL: manager debía ver E6 (creado por él)';
  END IF;
  IF pg_temp.has_eng(v_result, pg_temp.s(5)) THEN
    RAISE EXCEPTION 'FAIL (REGRESIÓN 0828-185): manager asignado SOLO como partner_id (E5) no debía tener visibilidad de portafolio';
  END IF;
  IF jsonb_array_length(v_result) <> 2 THEN
    RAISE EXCEPTION 'FAIL: manager debía ver exactamente 2 encargos (E4, E6), vio %', jsonb_array_length(v_result);
  END IF;
  RAISE NOTICE 'OK 5: manager ve solo manager_id + lo creado; ser partner/sqr/encargado/especialista en otro encargo NO da visibilidad';
END $$;

-- ── 6. hr_analyst: solo lo que creó ──────────────────────────────────────────────────────────
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(8));
  SELECT public.list_portfolio_engagements() INTO v_result;

  IF jsonb_array_length(v_result) <> 1 OR NOT pg_temp.has_eng(v_result, pg_temp.s(7)) THEN
    RAISE EXCEPTION 'FAIL: hr_analyst debía ver únicamente E7 (lo que creó), vio % fila(s)', jsonb_array_length(v_result);
  END IF;
  RAISE NOTICE 'OK 6: hr_analyst ve únicamente lo que creó';
END $$;

-- ── 7. senior / risk_supervisor: sin engagement.read en la matriz real -> vacío ─────────────
DO $$
DECLARE
  v_result jsonb;
  v_role   text;
  v_uid    text;
BEGIN
  FOR v_role, v_uid IN
    SELECT * FROM (VALUES ('senior', pg_temp.u(9)), ('risk_supervisor', pg_temp.u(10))) t(role_key, uid)
  LOOP
    PERFORM pg_temp.impersonate(v_uid);
    SELECT public.list_portfolio_engagements() INTO v_result;
    IF jsonb_array_length(v_result) <> 0 THEN
      RAISE EXCEPTION 'FAIL: % no tiene engagement.read y debía ver 0 encargos, vio %',
        v_role, jsonb_array_length(v_result);
    END IF;
  END LOOP;
  RAISE NOTICE 'OK 7: senior/risk_supervisor (sin engagement.read) ven 0 encargos';
END $$;

-- ── 8. Sin impersonar: arreglo vacío, sin error ──────────────────────────────────────────────
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT public.list_portfolio_engagements() INTO v_result;
  IF v_result IS NULL OR jsonb_array_length(v_result) <> 0 OR jsonb_typeof(v_result) <> 'array' THEN
    RAISE EXCEPTION 'FAIL: sin auth.uid() el RPC debía devolver un arreglo jsonb vacío, devolvió %', v_result;
  END IF;
  RAISE NOTICE 'OK 8: sin impersonar, el RPC devuelve [] sin error (fail-closed)';
END $$;

-- ── 9. Forma del payload: nested client/society/work_order/staff, sin PII ───────────────────
DO $$
DECLARE
  v_result jsonb;
  v_e3     jsonb;
  v_staff  jsonb;
  v_field  text;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(5));  -- partner: ve E3 (creador + own_society)
  SELECT public.list_portfolio_engagements() INTO v_result;

  SELECT e INTO v_e3 FROM jsonb_array_elements(v_result) e
   WHERE (e->>'engagement_id')::uuid = pg_temp.s(3);
  IF v_e3 IS NULL THEN
    RAISE EXCEPTION 'FAIL: E3 no apareció en el resultado de partner (fixture roto)';
  END IF;

  IF v_e3->'client'->>'client_id' <> '60828185-0000-4000-8000-000000000001'
     OR v_e3->'client'->>'client_legal_name' <> 'Cliente Portfolio 0828185' THEN
    RAISE EXCEPTION 'FAIL: client anidado no trae client_id/client_legal_name correctos: %', v_e3->'client';
  END IF;

  IF v_e3->'society'->>'society_id' <> '5a828185-0000-4000-8000-000000000001'
     OR v_e3->'society'->>'name' <> 'Sociedad Norte 0828185' THEN
    RAISE EXCEPTION 'FAIL: society anidada no trae society_id/name correctos: %', v_e3->'society';
  END IF;

  IF v_e3->'work_order'->>'approval_status' <> 'Approved' THEN
    RAISE EXCEPTION 'FAIL: work_order anidado no trae approval_status correcto: %', v_e3->'work_order';
  END IF;

  FOREACH v_field IN ARRAY ARRAY['partner', 'manager', 'sqr', 'encargado', 'specialist_it', 'specialist_tax']
  LOOP
    v_staff := v_e3->v_field;
    IF v_staff IS NULL OR v_staff->>'staff_id' IS NULL THEN
      RAISE EXCEPTION 'FAIL: % anidado ausente o sin staff_id: %', v_field, v_staff;
    END IF;
    IF v_staff ? 'email' OR v_staff ? 'id_number' OR v_staff ? 'aud_reg_number'
       OR v_staff ? 'auth_user_id' OR v_staff ? 'role_key' THEN
      RAISE EXCEPTION 'FAIL: % anidado expone un campo PII/rol crudo: %', v_field, v_staff;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK 9: client/society/work_order/staff anidados traen los campos esperados, sin PII en los 6 staff';
END $$;

-- ── 10. Orden determinístico: created_at DESC ────────────────────────────────────────────────
DO $$
DECLARE
  v_result jsonb;
  v_pos_o1 integer;
  v_pos_o2 integer;
  v_pos_o3 integer;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(5));
  SELECT public.list_portfolio_engagements() INTO v_result;

  SELECT ord INTO v_pos_o1 FROM jsonb_array_elements(v_result) WITH ORDINALITY AS t(elem, ord)
   WHERE (elem->>'engagement_id')::uuid = pg_temp.s(11);
  SELECT ord INTO v_pos_o2 FROM jsonb_array_elements(v_result) WITH ORDINALITY AS t(elem, ord)
   WHERE (elem->>'engagement_id')::uuid = pg_temp.s(12);
  SELECT ord INTO v_pos_o3 FROM jsonb_array_elements(v_result) WITH ORDINALITY AS t(elem, ord)
   WHERE (elem->>'engagement_id')::uuid = pg_temp.s(13);

  IF v_pos_o1 IS NULL OR v_pos_o2 IS NULL OR v_pos_o3 IS NULL THEN
    RAISE EXCEPTION 'FAIL: O1/O2/O3 no aparecieron en el resultado (fixture roto): %/%/%', v_pos_o1, v_pos_o2, v_pos_o3;
  END IF;
  IF NOT (v_pos_o3 < v_pos_o2 AND v_pos_o2 < v_pos_o1) THEN
    RAISE EXCEPTION 'FAIL: orden esperado O3,O2,O1 (created_at DESC) -- posiciones O1=% O2=% O3=%',
      v_pos_o1, v_pos_o2, v_pos_o3;
  END IF;
  RAISE NOTICE 'OK 10: el orden es created_at DESC (O3 antes que O2 antes que O1)';
END $$;

RESET ROLE;

-- ── 11. No-escalation: la policy "engagements read" NO se tocó ──────────────────────────────
-- Se corre bajo el mismo caller (partner) para comparar contra §2: el RPC le mostró 6 encargos
-- (own_society), pero el SELECT directo -- gobernado por la policy real de la tabla, sin tocar
-- en este fix -- debe seguir mostrando solo lo que ya mostraba: E2 (asignado como partner_id,
-- aunque de otra sociedad -- bug preexistente y AJENO a este fix) y E3 (creador + asignado).
-- NUNCA E1 (ni asignado ni creador): si esto empezara a aparecer, "engagements read" se habría
-- ampliado -- justo lo que el RPC dedicado existe para evitar.
DO $$
DECLARE v_count integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.impersonate(pg_temp.u(5));

  SELECT count(*) INTO v_count FROM public.engagements
   WHERE engagement_id IN (pg_temp.s(1), pg_temp.s(2), pg_temp.s(3));
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL (NO-ESCALATION): el SELECT directo como partner debía ver 2 de los 3 (E2,E3), vio %', v_count;
  END IF;

  PERFORM 1 FROM public.engagements WHERE engagement_id = pg_temp.s(1);
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL (NO-ESCALATION): "engagements read" se amplió -- partner ve E1 por SELECT directo sin ser creador ni estar asignado';
  END IF;
  RAISE NOTICE 'OK 11: el SELECT directo a engagements sigue gobernado por la policy sin tocar -- no se amplió la RLS';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'PORTFOLIO ENGAGEMENTS RPC: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
