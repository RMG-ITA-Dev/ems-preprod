-- Tests transaccionales de public.enforce_engagement_profile_scope() / trg_engagements_profile_scope
-- — BUG 0817-180 (bugs/0817-180/plan_v2.md, sección "Tests to Add or Update").
--
-- DÓNDE CORRE: cableado en supabase/tests/local/run-rls-tests.sh (después de cero_06 y la
-- migración 20260826162100). También se puede pegar a mano en el SQL Editor de un proyecto
-- Supabase con el esquema al día. Es UNA sola transacción que SIEMPRE termina en ROLLBACK.
-- Misma convención que trigger-engagement-creator-team.sql: un NOTICE por chequeo que pasa y al
-- final "PROFILE SCOPE: ALL CHECKS PASSED".
--
-- Qué se cubre:
--   1. Creador restringido con permiso crea SOLO con la combinación exacta de su ficha.
--   2. Sociedad distinta se rechaza (RPC).
--   3. Práctica distinta se rechaza (RPC).
--   4. Oficina distinta (incluida oficina=0 "Ambos") se rechaza (RPC).
--   5. Los mismos mismatches se rechazan en un INSERT autenticado directo a la tabla.
--   6. Sin ficha vinculada se rechaza.
--   7. Con city NULL en la ficha se rechaza.
--   8. Un rol sin engagement.create (senior_partner) no puede explotar el RPC SECURITY DEFINER.
--   9. anon no puede ejecutar el RPC (GRANT revocado).
--  10. admin crea con cualquier combinación activa válida, incluida práctica Firmwide (code 0).
--  11. senior_partner sigue sin poder crear (regresión de permisos, mismo chequeo que #8 con otro
--      propósito: confirma que la exención de rol del trigger es correcta pero inalcanzable).
--  12. Updates no relacionados (engagement_name) siguen funcionando para cualquier rol con permiso.
--  13. society_id: update se acepta solo para admin, se rechaza para cualquier otro rol.
--  14. oficina/practica: update se rechaza para todos los roles, incluido admin.
--  15. La ejecución sin identidad autenticada (seeds/migraciones/service_role) sigue siendo posible.
--  16. El RPC conserva exactamente una firma.
--  17. Una validación fallida no consume correlativo (la invocación revierte atómicamente).
--
-- Fixture: todos los ids llevan el prefijo eps- reconocible (eps = engagement profile scope).

BEGIN;

-- ── Guardas de fixture ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.society WHERE is_active) THEN
    RAISE EXCEPTION 'FIXTURE: no hay sociedad activa; el RPC la exige y staff.society_id es NOT NULL.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.practicas WHERE code = 1 AND is_active) THEN
    RAISE EXCEPTION 'FIXTURE: falta el servicio activo code = 1; el RPC valida la práctica contra él.';
  END IF;
END $$;

-- ── auth.users para los llamantes ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('ec900000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'eps-test-' || n || '@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 5) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ── Catálogo propio: dos sociedades, dos prácticas activas + una inactiva + Firmwide ───────────
INSERT INTO public.society (society_id, name, is_active) VALUES
  ('5ec90000-0000-4000-8000-00000000000a', 'EPS Sociedad A', true),
  ('5ec90000-0000-4000-8000-00000000000b', 'EPS Sociedad B', true);

INSERT INTO public.practicas (practica_id, name, code, abbreviation, is_active) VALUES
  ('5ec90000-0000-4000-8000-000000000001', 'EPS Auditoria',  1, 'EPA', true),
  ('5ec90000-0000-4000-8000-000000000003', 'EPS Tax',        3, 'EPT', true),
  ('5ec90000-0000-4000-8000-000000000005', 'EPS Inactiva',   5, 'EPI', false),
  ('5ec90000-0000-4000-8000-000000000000', 'EPS Firmwide',   0, 'EPF', true)
ON CONFLICT (code) DO NOTHING;

-- ── Personal ───────────────────────────────────────────────────────────────────────────────────
-- 1: manager con ficha COMPLETA y válida (Sociedad A, practica code=1, La Paz -> oficina 1).
-- 2: manager SIN ficha de personal.
-- 3: manager con ficha pero SIN ciudad (city NULL).
-- 4: admin.
-- 5: senior_partner (sin engagement.create en el seed real).
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id, city)
VALUES
  ('5ec80000-0000-4000-8000-000000000001', 'ec900000-0000-4000-8000-000000000001',
   'EPS', 'Sujeto01', true, '5ec90000-0000-4000-8000-000000000001',
   '5ec90000-0000-4000-8000-00000000000a', 'La Paz'),
  ('5ec80000-0000-4000-8000-000000000003', 'ec900000-0000-4000-8000-000000000003',
   'EPS', 'Sujeto03', true, '5ec90000-0000-4000-8000-000000000001',
   '5ec90000-0000-4000-8000-00000000000a', NULL),
  ('5ec80000-0000-4000-8000-000000000004', 'ec900000-0000-4000-8000-000000000004',
   'EPS', 'Sujeto04', true, '5ec90000-0000-4000-8000-000000000001',
   '5ec90000-0000-4000-8000-00000000000a', 'La Paz'),
  ('5ec80000-0000-4000-8000-000000000005', 'ec900000-0000-4000-8000-000000000005',
   'EPS', 'Sujeto05', true, '5ec90000-0000-4000-8000-000000000001',
   '5ec90000-0000-4000-8000-00000000000a', 'La Paz');
-- Sujeto 2 (subject sin ficha) deliberadamente NO tiene fila en staff.

INSERT INTO public.user_roles (user_id, role_key) VALUES
  ('ec900000-0000-4000-8000-000000000001', 'manager'),
  ('ec900000-0000-4000-8000-000000000002', 'manager'),
  ('ec900000-0000-4000-8000-000000000003', 'manager'),
  ('ec900000-0000-4000-8000-000000000004', 'admin'),
  ('ec900000-0000-4000-8000-000000000005', 'senior_partner')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

-- ── Cliente del fixture ────────────────────────────────────────────────────────────────────────
INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id, is_active)
VALUES ('5ec90000-0000-4000-8000-0000000000c1', 'EPS Cliente de Prueba', 'EPS-TAX-0817180', true);

-- ── Helpers ────────────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

-- fecha_cierre 2026-03-31 -> año fiscal derivado 2026 (sin override de admin necesario).
CREATE FUNCTION pg_temp.create_eng(
  p_name text, p_oficina smallint, p_practica smallint, p_society uuid
) RETURNS public.engagements
LANGUAGE sql AS $$
  SELECT public.create_engagement_with_code(
    p_engagement_name      := p_name,
    p_client_id            := '5ec90000-0000-4000-8000-0000000000c1'::uuid,
    p_partner_id           := NULL,
    p_manager_id           := NULL,
    p_start_date           := '2025-10-01'::date,
    p_end_date             := '2026-09-30'::date,
    p_status               := 'active',
    p_oficina              := p_oficina,
    p_practica             := p_practica,
    p_funcion              := 0::smallint,
    p_anio_fiscal          := 2026,
    p_work_order_required  := true,
    p_activity_required    := true,
    p_is_internal          := true,
    p_approval_required    := true,
    p_fecha_cierre         := '2026-03-31'::date,
    p_anio_fiscal_override := false,
    p_society_id           := p_society
  );
$$;

CREATE FUNCTION pg_temp.u(n integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'ec900000-0000-4000-8000-' || lpad(n::text, 12, '0')
$$;

-- Valores que coinciden EXACTAMENTE con la ficha del sujeto 1.
CREATE FUNCTION pg_temp.own_eng(p_name text) RETURNS public.engagements
LANGUAGE sql AS $$
  SELECT pg_temp.create_eng(p_name, 1::smallint, 1::smallint, '5ec90000-0000-4000-8000-00000000000a'::uuid);
$$;

-- ── #16: el RPC conserva exactamente una firma ────────────────────────────────────────────────
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc
   WHERE proname = 'create_engagement_with_code'
     AND pronamespace = 'public'::regnamespace;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CHECK 16: se esperaba 1 firma de create_engagement_with_code, hay %', v_count;
  END IF;
  RAISE NOTICE 'CHECK 16 OK: create_engagement_with_code sigue con una sola firma.';
END $$;

-- ── #9: anon no puede ejecutar el RPC ─────────────────────────────────────────────────────────
DO $$
DECLARE v_raised boolean := false;
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM pg_temp.own_eng('EPS anon no debe poder');
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    v_raised := true;
  END;
  RESET ROLE;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 9: anon no debía poder ejecutar el RPC tras el REVOKE.';
  END IF;
  RAISE NOTICE 'CHECK 9 OK: anon no puede ejecutar create_engagement_with_code (GRANT revocado).';
END $$;

SET LOCAL ROLE authenticated;

-- ── #1: creador restringido crea con la combinación exacta de su ficha ───────────────────────
DO $$
DECLARE v_eng public.engagements;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  v_eng := pg_temp.own_eng('EPS combinacion exacta');
  IF v_eng.society_id IS DISTINCT FROM '5ec90000-0000-4000-8000-00000000000a'::uuid
     OR v_eng.practica IS DISTINCT FROM 1 OR v_eng.oficina IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CHECK 1: la combinacion exacta de la ficha debia persistir tal cual.';
  END IF;
  RAISE NOTICE 'CHECK 1 OK: creador restringido crea con la combinacion exacta de su ficha.';
END $$;

-- ── #2: sociedad distinta se rechaza (RPC) ────────────────────────────────────────────────────
DO $$
DECLARE v_raised boolean := false;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  BEGIN
    PERFORM pg_temp.create_eng('EPS sociedad distinta', 1::smallint, 1::smallint, '5ec90000-0000-4000-8000-00000000000b'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 2: una sociedad distinta de la ficha debia rechazarse.';
  END IF;
  RAISE NOTICE 'CHECK 2 OK: sociedad distinta de la ficha se rechaza via RPC.';
END $$;

-- ── #3: práctica distinta se rechaza (RPC) ────────────────────────────────────────────────────
DO $$
DECLARE v_raised boolean := false;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  BEGIN
    PERFORM pg_temp.create_eng('EPS practica distinta', 1::smallint, 3::smallint, '5ec90000-0000-4000-8000-00000000000a'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 3: una practica distinta de la ficha debia rechazarse.';
  END IF;
  RAISE NOTICE 'CHECK 3 OK: practica distinta de la ficha se rechaza via RPC.';
END $$;

-- ── #4: oficina distinta (incluida "Ambos" = 0) se rechaza (RPC) ─────────────────────────────
DO $$
DECLARE v_raised boolean := false;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  BEGIN
    PERFORM pg_temp.create_eng('EPS oficina ambos', 0::smallint, 1::smallint, '5ec90000-0000-4000-8000-00000000000a'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 4: oficina=0 (Ambos) distinta de la ficha (1, La Paz) debia rechazarse.';
  END IF;
  RAISE NOTICE 'CHECK 4 OK: oficina distinta de la ficha (incluida Ambos=0) se rechaza via RPC.';
END $$;

-- ── #5: los mismos mismatches se rechazan en un INSERT autenticado directo ───────────────────
DO $$
DECLARE v_raised boolean := false;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  BEGIN
    INSERT INTO public.engagements (client_id, engagement_name, fecha_cierre, oficina, practica, society_id)
    VALUES ('5ec90000-0000-4000-8000-0000000000c1', 'EPS insert directo mismatch', '2026-03-31', 1, 3,
            '5ec90000-0000-4000-8000-00000000000a');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 5: un INSERT directo con practica distinta de la ficha debia rechazarse.';
  END IF;
  RAISE NOTICE 'CHECK 5 OK: el mismatch tambien se rechaza en un INSERT autenticado directo a la tabla.';
END $$;

-- ── #6: sin ficha vinculada se rechaza ────────────────────────────────────────────────────────
DO $$
DECLARE v_raised boolean := false;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(2));
  IF public.get_my_staff_id() IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE 6: el sujeto 2 no debia tener ficha de personal.';
  END IF;
  BEGIN
    PERFORM pg_temp.own_eng('EPS sin ficha');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 6: sin ficha vinculada la creacion debia rechazarse (fail-closed).';
  END IF;
  RAISE NOTICE 'CHECK 6 OK: sin ficha vinculada se rechaza la creacion.';
END $$;

-- ── #7: con city NULL en la ficha se rechaza ──────────────────────────────────────────────────
DO $$
DECLARE v_raised boolean := false;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(3));
  BEGIN
    PERFORM pg_temp.create_eng('EPS sin ciudad', 1::smallint, 1::smallint, '5ec90000-0000-4000-8000-00000000000a'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 7: con city NULL en la ficha la creacion debia rechazarse.';
  END IF;
  RAISE NOTICE 'CHECK 7 OK: ficha sin ciudad rechaza la creacion (no se puede derivar oficina).';
END $$;

-- ── #8 y #11: senior_partner sin engagement.create no puede crear (regresion de permisos) ────
DO $$
DECLARE v_raised boolean := false;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(5));
  IF public.has_permission('engagement.create') THEN
    RAISE EXCEPTION 'FIXTURE 8/11: senior_partner no deberia tener engagement.create en el seed vigente.';
  END IF;
  BEGIN
    PERFORM pg_temp.own_eng('EPS senior_partner sin permiso');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 8/11: senior_partner sin engagement.create no debia poder crear via RPC.';
  END IF;
  RAISE NOTICE 'CHECK 8/11 OK: senior_partner sigue sin poder crear (sin engagement.create) — la exencion de rol del trigger es correcta pero inalcanzable sin ese grant.';
END $$;

-- ── #10: admin crea con cualquier combinacion activa valida, incluida Firmwide (code 0) ──────
DO $$
DECLARE v_eng public.engagements;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  v_eng := pg_temp.create_eng('EPS admin combinacion libre', 0::smallint, 3::smallint, '5ec90000-0000-4000-8000-00000000000b'::uuid);
  IF v_eng.oficina IS DISTINCT FROM 0 OR v_eng.practica IS DISTINCT FROM 3
     OR v_eng.society_id IS DISTINCT FROM '5ec90000-0000-4000-8000-00000000000b'::uuid THEN
    RAISE EXCEPTION 'CHECK 10: admin debia poder crear con cualquier combinacion activa valida.';
  END IF;

  v_eng := pg_temp.create_eng('EPS admin firmwide', 1::smallint, 0::smallint, '5ec90000-0000-4000-8000-00000000000a'::uuid);
  IF v_eng.practica IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'CHECK 10: admin debia poder crear con practica Firmwide (code 0).';
  END IF;
  RAISE NOTICE 'CHECK 10 OK: admin crea con cualquier combinacion activa valida, incluida Firmwide.';
END $$;

-- ── #12: updates no relacionados (engagement_name) siguen funcionando ────────────────────────
DO $$
DECLARE v_name text;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  UPDATE public.engagements SET engagement_name = 'EPS combinacion exacta (renombrado)'
   WHERE engagement_name = 'EPS combinacion exacta'
  RETURNING engagement_name INTO v_name;
  IF v_name IS DISTINCT FROM 'EPS combinacion exacta (renombrado)' THEN
    RAISE EXCEPTION 'CHECK 12: un update no relacionado (engagement_name) no debia bloquearse.';
  END IF;
  RAISE NOTICE 'CHECK 12 OK: un update que no toca sociedad/oficina/practica sigue funcionando.';
END $$;

-- ── #13: society_id — update se acepta solo para admin ───────────────────────────────────────
DO $$
DECLARE v_raised boolean := false;
    v_society uuid;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(1));
  BEGIN
    UPDATE public.engagements SET society_id = '5ec90000-0000-4000-8000-00000000000b'
     WHERE engagement_name = 'EPS combinacion exacta (renombrado)';
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 13a: manager no debia poder editar society_id tras la creacion.';
  END IF;

  PERFORM pg_temp.impersonate(pg_temp.u(4));
  UPDATE public.engagements SET society_id = '5ec90000-0000-4000-8000-00000000000b'
   WHERE engagement_name = 'EPS combinacion exacta (renombrado)'
  RETURNING society_id INTO v_society;
  IF v_society IS DISTINCT FROM '5ec90000-0000-4000-8000-00000000000b'::uuid THEN
    RAISE EXCEPTION 'CHECK 13b: admin debia poder editar society_id tras la creacion (0722-157).';
  END IF;
  RAISE NOTICE 'CHECK 13 OK: society_id se edita solo por admin (0722-157), rechazado para el resto.';
END $$;

-- ── #14: oficina/practica — update se rechaza para todos, incluido admin ─────────────────────
DO $$
DECLARE v_raised boolean := false;
BEGIN
  PERFORM pg_temp.impersonate(pg_temp.u(4));
  BEGIN
    UPDATE public.engagements SET oficina = 2
     WHERE engagement_name = 'EPS combinacion exacta (renombrado)';
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'CHECK 14: ni siquiera admin debia poder editar oficina tras la creacion.';
  END IF;
  RAISE NOTICE 'CHECK 14 OK: oficina/practica quedan inmutables tras la creacion para todos, incluido admin.';
END $$;

RESET ROLE;

-- ── #15: ejecución sin identidad autenticada (seeds/migraciones/service_role) sigue posible ──
DO $$
DECLARE v_eng public.engagements;
BEGIN
  -- RESET ROLE + sin impersonate: auth.uid() es NULL, el mismatch de abajo no debe importar.
  v_eng := pg_temp.create_eng('EPS seed sin identidad', 2::smallint, 3::smallint, '5ec90000-0000-4000-8000-00000000000b'::uuid);
  IF v_eng.engagement_id IS NULL THEN
    RAISE EXCEPTION 'CHECK 15: la creacion sin auth.uid() (seeds/migraciones/service_role) debia funcionar.';
  END IF;
  RAISE NOTICE 'CHECK 15 OK: sin identidad autenticada el guard no interviene (seeds/migraciones/service_role).';
END $$;

-- ── #17: una validacion fallida no consume correlativo ────────────────────────────────────────
DO $$
DECLARE v_before public.engagements;
    v_after  public.engagements;
    v_corr_before integer;
    v_corr_after  integer;
    v_raised boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.impersonate(pg_temp.u(1));

  v_before := pg_temp.own_eng('EPS correlativo antes');
  v_corr_before := (regexp_match(v_before.engagement_code, '\.(\d+)$'))[1]::integer;

  BEGIN
    PERFORM pg_temp.create_eng('EPS correlativo fallido', 1::smallint, 3::smallint, '5ec90000-0000-4000-8000-00000000000a'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'FIXTURE 17: el intento fallido debia rechazarse para poder probar que no consume correlativo.';
  END IF;

  v_after := pg_temp.own_eng('EPS correlativo despues');
  v_corr_after := (regexp_match(v_after.engagement_code, '\.(\d+)$'))[1]::integer;

  IF v_corr_after IS DISTINCT FROM v_corr_before + 1 THEN
    RAISE EXCEPTION 'CHECK 17: se esperaba correlativo %, el intento fallido consumio uno (obtuvo %)',
      v_corr_before + 1, v_corr_after;
  END IF;
  RAISE NOTICE 'CHECK 17 OK: una invocacion fallida revierte atomicamente y no consume correlativo.';
  RESET ROLE;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'PROFILE SCOPE: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
