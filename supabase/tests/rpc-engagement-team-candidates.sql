-- Transactional tests for public.get_engagement_team_candidates()
-- — BUG 0722-162 (bugs/0722-162/plan_v2.md, sección e).
--
-- Corre contra la base descartable local, DESPUÉS de aplicar
-- 20260817120000_0722-162_engagement_team_candidates.sql. Una sola transacción, SIEMPRE hace
-- ROLLBACK. Misma convención que rpc-save-engagement-assignments.sql: un NOTICE por chequeo que
-- pasa, y al final "ENGAGEMENT_TEAM_CANDIDATES RPC: ALL CHECKS PASSED (rolled back)".
--
-- Qué se cubre:
--   1. Los 11 role_key elegibles caen en su grupo (uno por rol).
--   2. Roles NO elegibles se excluyen: sqr, admin, assistant, senior_partner, risk_partner,
--      it_security_manager, accounting_manager, hr_manager, risk_supervisor y los *_analyst.
--   3. Personal inactivo / soft-deleted / sin auth_user_id / con role_key NULL se excluye.
--   4. Un authorization_roles con is_active = false deja de aportar candidatos.
--   5. El gate: engagement.create O engagement.update habilitan; sin ninguno → 0 filas.
--   6. La forma del resultado no expone email, auth_user_id ni role_key.
--
-- Fixture: todos los ids llevan el prefijo etc- reconocible (etc = engagement team candidates).

BEGIN;

-- ── Fixture: caller con permisos, caller sin permisos, y un candidato por rol ───────────────
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a1c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'etc-test-' || n || '@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 30) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 30 fichas de personal activas y vinculadas. El apellido lleva el número para que el ORDER BY
-- del RPC sea determinista y verificable.
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active, service_id)
SELECT ('51c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a1c00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'ETC', 'Sujeto' || lpad(n::text, 2, '0'),
       true,
       (SELECT service_id FROM public.services WHERE code = 1)
  FROM generate_series(1, 30) n;

-- Roles: 1..11 elegibles (en el orden de ROLE_KEY_TO_GROUP), 12..24 NO elegibles.
INSERT INTO public.user_roles (user_id, role_key)
VALUES
  -- elegibles
  ('a1c00000-0000-4000-8000-000000000001', 'partner'),
  ('a1c00000-0000-4000-8000-000000000002', 'director'),
  ('a1c00000-0000-4000-8000-000000000003', 'manager'),
  ('a1c00000-0000-4000-8000-000000000004', 'senior'),
  ('a1c00000-0000-4000-8000-000000000005', 'semisenior'),
  ('a1c00000-0000-4000-8000-000000000006', 'ita_manager'),
  ('a1c00000-0000-4000-8000-000000000007', 'ita_senior'),
  ('a1c00000-0000-4000-8000-000000000008', 'ita_assistant'),
  ('a1c00000-0000-4000-8000-000000000009', 'tax_manager'),
  ('a1c00000-0000-4000-8000-000000000010', 'tax_senior'),
  ('a1c00000-0000-4000-8000-000000000011', 'tax_assistant'),
  -- NO elegibles: cada uno estuvo considerado y quedó fuera por decisión explícita
  ('a1c00000-0000-4000-8000-000000000012', 'sqr'),
  ('a1c00000-0000-4000-8000-000000000013', 'admin'),
  ('a1c00000-0000-4000-8000-000000000014', 'assistant'),
  ('a1c00000-0000-4000-8000-000000000015', 'senior_partner'),
  ('a1c00000-0000-4000-8000-000000000016', 'risk_partner'),
  ('a1c00000-0000-4000-8000-000000000017', 'risk_supervisor'),
  ('a1c00000-0000-4000-8000-000000000018', 'it_security_manager'),
  ('a1c00000-0000-4000-8000-000000000019', 'accounting_manager'),
  ('a1c00000-0000-4000-8000-000000000020', 'accounting_analyst'),
  ('a1c00000-0000-4000-8000-000000000021', 'collections_analyst'),
  ('a1c00000-0000-4000-8000-000000000022', 'hr_manager'),
  ('a1c00000-0000-4000-8000-000000000023', 'hr_analyst'),
  -- 24: role_key NULL (backfill no lo alcanzó) → debe excluirse
  ('a1c00000-0000-4000-8000-000000000024', NULL)
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

-- Casos negativos de la ficha de personal (todos con rol elegible `partner`, para que lo único
-- que los excluya sea la condición bajo prueba):
--   25 inactivo · 26 soft-deleted · 27 sin auth_user_id
UPDATE public.staff SET is_active = false
  WHERE staff_id = '51c00000-0000-4000-8000-000000000025';
UPDATE public.staff SET deleted_at = now()
  WHERE staff_id = '51c00000-0000-4000-8000-000000000026';
UPDATE public.staff SET auth_user_id = NULL
  WHERE staff_id = '51c00000-0000-4000-8000-000000000027';
INSERT INTO public.user_roles (user_id, role_key) VALUES
  ('a1c00000-0000-4000-8000-000000000025', 'partner'),
  ('a1c00000-0000-4000-8000-000000000026', 'partner'),
  ('a1c00000-0000-4000-8000-000000000027', 'partner')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

-- Callers: 28 con engagement.create, 29 con engagement.update, 30 sin ninguno de los dos.
-- Se resuelven contra la matriz real en vez de hardcodear un rol, para que el test no se rompa
-- si la matriz cambia — y si no hubiera ningún rol con esos permisos, el test aborta avisando.
DO $$
DECLARE
  v_creator text;
  v_updater text;
  v_neither text;
BEGIN
  SELECT role_key INTO v_creator
    FROM public.authorization_role_permissions
   WHERE permission_key = 'engagement.create' AND role_key <> 'admin' LIMIT 1;
  SELECT role_key INTO v_updater
    FROM public.authorization_role_permissions
   WHERE permission_key = 'engagement.update' AND role_key <> 'admin' LIMIT 1;
  SELECT ar.role_key INTO v_neither
    FROM public.authorization_roles ar
   WHERE NOT EXISTS (
           SELECT 1 FROM public.authorization_role_permissions arp
            WHERE arp.role_key = ar.role_key
              AND arp.permission_key IN ('engagement.create', 'engagement.update'))
   LIMIT 1;

  IF v_creator IS NULL OR v_updater IS NULL OR v_neither IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: no se pudo resolver caller creator/updater/neither desde la matriz (% / % / %)',
      v_creator, v_updater, v_neither;
  END IF;

  INSERT INTO public.user_roles (user_id, role_key) VALUES
    ('a1c00000-0000-4000-8000-000000000028', v_creator),
    ('a1c00000-0000-4000-8000-000000000029', v_updater),
    ('a1c00000-0000-4000-8000-000000000030', v_neither)
  ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;
END $$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_group  text;
  v_count  integer;
  v_role   text;
  v_staff  uuid;
BEGIN
  PERFORM pg_temp.impersonate('a1c00000-0000-4000-8000-000000000028');  -- engagement.create

  -- ── 1. Los 11 role_key elegibles caen en su grupo ────────────────────────────────────────
  FOR v_role, v_staff, v_group IN
    SELECT * FROM (VALUES
      ('partner',       '51c00000-0000-4000-8000-000000000001'::uuid, 'partner_director'),
      ('director',      '51c00000-0000-4000-8000-000000000002'::uuid, 'partner_director'),
      ('manager',       '51c00000-0000-4000-8000-000000000003'::uuid, 'manager'),
      ('senior',        '51c00000-0000-4000-8000-000000000004'::uuid, 'encargado'),
      ('semisenior',    '51c00000-0000-4000-8000-000000000005'::uuid, 'encargado'),
      ('ita_manager',   '51c00000-0000-4000-8000-000000000006'::uuid, 'specialist_it'),
      ('ita_senior',    '51c00000-0000-4000-8000-000000000007'::uuid, 'specialist_it'),
      ('ita_assistant', '51c00000-0000-4000-8000-000000000008'::uuid, 'specialist_it'),
      ('tax_manager',   '51c00000-0000-4000-8000-000000000009'::uuid, 'specialist_tax'),
      ('tax_senior',    '51c00000-0000-4000-8000-000000000010'::uuid, 'specialist_tax'),
      ('tax_assistant', '51c00000-0000-4000-8000-000000000011'::uuid, 'specialist_tax')
    ) t(role_key, staff_id, expected_group)
  LOOP
    SELECT count(*) INTO v_count
      FROM public.get_engagement_team_candidates() c
     WHERE c.staff_id = v_staff AND c.candidate_group = v_group;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'FAIL: role_key % debía aparecer en el grupo % (filas: %)',
        v_role, v_group, v_count;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK 1: los 11 role_key elegibles caen en su grupo de candidatura';

  -- ── 2. Roles NO elegibles se excluyen ────────────────────────────────────────────────────
  FOR v_role, v_staff IN
    SELECT * FROM (VALUES
      ('sqr',                 '51c00000-0000-4000-8000-000000000012'::uuid),
      ('admin',               '51c00000-0000-4000-8000-000000000013'::uuid),
      ('assistant',           '51c00000-0000-4000-8000-000000000014'::uuid),
      ('senior_partner',      '51c00000-0000-4000-8000-000000000015'::uuid),
      ('risk_partner',        '51c00000-0000-4000-8000-000000000016'::uuid),
      ('risk_supervisor',     '51c00000-0000-4000-8000-000000000017'::uuid),
      ('it_security_manager', '51c00000-0000-4000-8000-000000000018'::uuid),
      ('accounting_manager',  '51c00000-0000-4000-8000-000000000019'::uuid),
      ('accounting_analyst',  '51c00000-0000-4000-8000-000000000020'::uuid),
      ('collections_analyst', '51c00000-0000-4000-8000-000000000021'::uuid),
      ('hr_manager',          '51c00000-0000-4000-8000-000000000022'::uuid),
      ('hr_analyst',          '51c00000-0000-4000-8000-000000000023'::uuid)
    ) t(role_key, staff_id)
  LOOP
    PERFORM 1 FROM public.get_engagement_team_candidates() c WHERE c.staff_id = v_staff;
    IF FOUND THEN
      RAISE EXCEPTION 'FAIL: role_key % NO es elegible y aun así aparece', v_role;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK 2: los 12 role_key no elegibles quedan fuera (incluidos sqr y admin)';

  -- ── 3. Casos negativos de la ficha de personal ───────────────────────────────────────────
  FOR v_role, v_staff IN
    SELECT * FROM (VALUES
      ('role_key NULL',      '51c00000-0000-4000-8000-000000000024'::uuid),
      ('is_active = false',  '51c00000-0000-4000-8000-000000000025'::uuid),
      ('deleted_at NOT NULL','51c00000-0000-4000-8000-000000000026'::uuid),
      ('auth_user_id NULL',  '51c00000-0000-4000-8000-000000000027'::uuid)
    ) t(caso, staff_id)
  LOOP
    PERFORM 1 FROM public.get_engagement_team_candidates() c WHERE c.staff_id = v_staff;
    IF FOUND THEN
      RAISE EXCEPTION 'FAIL: el caso "%" debía excluirse y aun así aparece', v_role;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK 3: inactivo / soft-deleted / sin login / sin role_key quedan fuera';

  -- ── 4. Un rol desactivado en el catálogo deja de aportar candidatos ──────────────────────
  UPDATE public.authorization_roles SET is_active = false WHERE role_key = 'tax_senior';
  PERFORM 1 FROM public.get_engagement_team_candidates() c
   WHERE c.staff_id = '51c00000-0000-4000-8000-000000000010';
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL: authorization_roles.is_active = false debía excluir al candidato';
  END IF;
  UPDATE public.authorization_roles SET is_active = true WHERE role_key = 'tax_senior';
  RAISE NOTICE 'OK 4: authorization_roles.is_active = false excluye a sus candidatos';

  -- ── 5. El gate de permisos ───────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_count FROM public.get_engagement_team_candidates();
  IF v_count <> 11 THEN
    RAISE EXCEPTION 'FAIL: un caller con engagement.create debía ver 11 candidatos, vio %', v_count;
  END IF;

  PERFORM pg_temp.impersonate('a1c00000-0000-4000-8000-000000000029');  -- engagement.update
  SELECT count(*) INTO v_count FROM public.get_engagement_team_candidates();
  IF v_count <> 11 THEN
    RAISE EXCEPTION 'FAIL: un caller con engagement.update debía ver 11 candidatos, vio %', v_count;
  END IF;

  PERFORM pg_temp.impersonate('a1c00000-0000-4000-8000-000000000030');  -- sin ninguno de los dos
  SELECT count(*) INTO v_count FROM public.get_engagement_team_candidates();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: sin engagement.create ni update debía ver 0 filas (fail-closed), vio %', v_count;
  END IF;
  RAISE NOTICE 'OK 5: create y update habilitan; sin ninguno, 0 filas (fail-closed)';

  RAISE NOTICE 'ENGAGEMENT_TEAM_CANDIDATES RPC: ALL CHECKS PASSED (rolled back)';
END $$;

RESET ROLE;

-- ── 6. Forma del resultado: nada de PII ni del rol crudo ───────────────────────────────────
-- Se verifica sobre el catálogo, no sobre las filas: si alguien agrega una columna sensible al
-- RETURNS TABLE, esto falla aunque los datos de prueba no la expongan.
DO $$
DECLARE
  v_cols text[];
BEGIN
  SELECT array_agg(p.name ORDER BY p.ord) INTO v_cols
    FROM pg_proc pr
    CROSS JOIN LATERAL unnest(pr.proargnames) WITH ORDINALITY AS p(name, ord)
   WHERE pr.oid = 'public.get_engagement_team_candidates()'::regprocedure;

  IF v_cols <> ARRAY['staff_id', 'display_name', 'candidate_group', 'service_id'] THEN
    RAISE EXCEPTION 'FAIL: la firma de salida cambió (%). No debe exponer email, auth_user_id ni role_key.', v_cols;
  END IF;
  RAISE NOTICE 'OK 6: la salida es exactamente staff_id/display_name/candidate_group/service_id';
END $$;

ROLLBACK;
