-- Bug 0922-190 — "Mis asignaciones": visibilidad de la policy aditiva `ea_select_own`
-- (20260924120000_0922-190_ea_select_own_policy.sql).
--
-- Corre DESPUÉS de esa migración (ya aplicada por run-rls-tests.sh junto con el resto del
-- esquema). Transacción única que SIEMPRE hace rollback: inserta fixtures descartables,
-- impersona cada staff vía request.jwt.claims, y verifica que cada uno ve únicamente su
-- propia fila — vigente Y histórica (soft-deleted), pero nunca la de otro staff, aunque
-- compartan el mismo encargo. También confirma que la policy es de SOLO LECTURA: no abre
-- ningún camino de escritura nuevo.
--
-- Fixture world:
--   E1  con dos staff SIN ningún rol/relación que las 4 policies existentes reconozcan
--       (ea_select_assigned/firmwide/lead/responsible) — así la única vía de visibilidad
--       posible es ea_select_own.
--     Ana  → fila vigente (CONFIRMED) + fila histórica propia (soft-deleted)
--     Beto → fila vigente (CONFIRMED)
--
-- Expected:
--   Ana  ve sus 2 filas (vigente + histórica), nunca la de Beto.
--   Beto ve su 1 fila, nunca las de Ana.
--   Ninguno de los dos puede escribir (UPDATE) ninguna fila — ni propia ni ajena: la
--   policy nueva es FOR SELECT, no toca las policies de escritura existentes.
--   anon sigue hard-denegado (grant de tabla no tocado por esta migración).
--
-- También cubre list_my_assignments() (review 2026-09-25, MUST FIX): el rol 'assistant' de
-- este fixture no tiene engagement.read/client.read, así que si la pantalla siguiera usando
-- el embed anidado de PostgREST (engagement:engagements(...), client:clients(...)) las
-- columnas de etiqueta llegarían NULL para Ana/Beto -- exactamente el bug que esta función
-- corrige haciendo su propio gate (staff_id = get_my_staff_id(), SECURITY DEFINER) en vez de
-- depender de esas policies. Se prueba que cada uno ve encargo/cliente/categoría de sus
-- propias filas (nunca en null) y nunca las de la otra persona, más el fail-closed de un
-- p_toggle inválido.

BEGIN;

-- ── Fixtures (as postgres; RLS no aplica al owner de la tabla) ────────
-- practicas.code CHECK (0-9) y .abbreviation CHECK ('^[A-Z]{2,5}$', sin dígitos).
INSERT INTO public.practicas (practica_id, name, code, abbreviation)
VALUES ('5e900000-0000-4000-8000-000000000001', '0922-190 Test Practice', 8, 'MYA');

INSERT INTO public.society (society_id, name)
VALUES ('50c90000-0000-4000-8000-000000000001', '0922-190 Test Society');

INSERT INTO auth.users (id) VALUES
  ('a0920000-0000-4000-8000-000000000001'), -- Ana
  ('a0920000-0000-4000-8000-000000000002'), -- Beto
  ('a0920000-0000-4000-8000-000000000003'); -- Lead (solo relleno de manager_id, irrelevante al test)

INSERT INTO public.categories (category_id, category_name, practica_id)
VALUES ('c0920000-0000-4000-8000-000000000001', '0922-190 Test Category', '5e900000-0000-4000-8000-000000000001');

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c1920000-0000-4000-8000-000000000001', '0922-190 Test Client', '0922190-TAX-001');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, category_id, practica_id, society_id) VALUES
  ('50920000-0000-4000-8000-000000000001', 'a0920000-0000-4000-8000-000000000001', 'Ana',  'Own',   'c0920000-0000-4000-8000-000000000001', '5e900000-0000-4000-8000-000000000001', '50c90000-0000-4000-8000-000000000001'),
  ('50920000-0000-4000-8000-000000000002', 'a0920000-0000-4000-8000-000000000002', 'Beto', 'Own',   'c0920000-0000-4000-8000-000000000001', '5e900000-0000-4000-8000-000000000001', '50c90000-0000-4000-8000-000000000001'),
  ('50920000-0000-4000-8000-000000000003', 'a0920000-0000-4000-8000-000000000003', 'Lead', 'Filler','c0920000-0000-4000-8000-000000000001', '5e900000-0000-4000-8000-000000000001', '50c90000-0000-4000-8000-000000000001');

-- 'assistant' está fuera de las 4 policies SELECT existentes: ninguna de ellas exige o
-- reconoce ese role_key, así que aísla ea_select_own como única vía de visibilidad posible.
-- ON CONFLICT DO NOTHING: run-rls-tests.sh ya sembró el catálogo RBAC real (23 roles).
INSERT INTO public.authorization_roles (role_key, label_key) VALUES
  ('assistant', 'authz.role.assistant'),
  ('manager', 'authz.role.manager')
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0920000-0000-4000-8000-000000000001', 'staff', 'assistant'),
  ('a0920000-0000-4000-8000-000000000002', 'staff', 'assistant'),
  ('a0920000-0000-4000-8000-000000000003', 'manager', 'manager');

-- Un solo encargo, liderado por Lead (ni Ana ni Beto figuran en ninguna de las 6 columnas
-- de responsables): si alguna de las 4 policies existentes les diera acceso, el test de
-- aislamiento de abajo (Ana no ve la fila de Beto) fallaría por una vía distinta a la que
-- se quiere probar.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id, fecha_cierre, society_id)
VALUES ('e0920000-0000-4000-8000-000000000001', 'c1920000-0000-4000-8000-000000000001', '0922-190 E1',
        '50920000-0000-4000-8000-000000000003', '2026-12-31',
        (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.engagement_assignments
  (assignment_id, engagement_id, staff_id, category_id, start_date, end_date, status, deleted_at) VALUES
  -- Ana: vigente
  ('aa920000-0000-4000-8000-000000000001', 'e0920000-0000-4000-8000-000000000001', '50920000-0000-4000-8000-000000000001', 'c0920000-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31', 'CONFIRMED', NULL),
  -- Ana: histórica (soft-deleted) — debe seguir siendo visible para ELLA (vigente + histórico).
  ('aa920000-0000-4000-8000-000000000002', 'e0920000-0000-4000-8000-000000000001', '50920000-0000-4000-8000-000000000001', 'c0920000-0000-4000-8000-000000000001', '2025-01-01', '2025-06-30', 'CONFIRMED', now()),
  -- Beto: vigente
  ('aa920000-0000-4000-8000-000000000003', 'e0920000-0000-4000-8000-000000000001', '50920000-0000-4000-8000-000000000002', 'c0920000-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31', 'CONFIRMED', NULL);

-- ── Impersonation helper (temp; vanishes with the session) ────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  )
$$;

-- ── Todo lo de abajo corre como `authenticated` (RLS activa) ──────────
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  n int;
BEGIN
  -- Ana: ve exactamente sus 2 filas (vigente + histórica), nunca la de Beto.
  PERFORM pg_temp.impersonate('a0920000-0000-4000-8000-000000000001');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id = 'e0920000-0000-4000-8000-000000000001';
  IF n <> 2 THEN RAISE EXCEPTION '0922-190 RLS FAIL — Ana: esperaba 2 filas propias (vigente+histórica), obtuvo %', n; END IF;

  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE assignment_id = 'aa920000-0000-4000-8000-000000000002';
  IF n <> 1 THEN RAISE EXCEPTION '0922-190 RLS FAIL — Ana: su fila histórica (soft-deleted) no es visible (vigente + histórico esperado)'; END IF;

  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE assignment_id = 'aa920000-0000-4000-8000-000000000003';
  IF n <> 0 THEN RAISE EXCEPTION '0922-190 RLS FAIL — Ana ve la fila de Beto (fuga entre staff del mismo encargo)'; END IF;
  RAISE NOTICE 'PASS — Ana ve sus 2 filas propias (vigente + histórica), nunca la de Beto';

  -- Beto: ve exactamente su 1 fila, nunca las de Ana.
  PERFORM pg_temp.impersonate('a0920000-0000-4000-8000-000000000002');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id = 'e0920000-0000-4000-8000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION '0922-190 RLS FAIL — Beto: esperaba 1 fila propia, obtuvo %', n; END IF;

  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE assignment_id IN ('aa920000-0000-4000-8000-000000000001', 'aa920000-0000-4000-8000-000000000002');
  IF n <> 0 THEN RAISE EXCEPTION '0922-190 RLS FAIL — Beto ve % fila(s) de Ana (fuga)', n; END IF;
  RAISE NOTICE 'PASS — Beto ve su 1 fila propia, nunca las de Ana';

  -- Solo-lectura: ea_select_own es FOR SELECT — no debe abrir ningún camino de escritura,
  -- ni siquiera sobre la fila propia. Las policies de escritura existentes (estructurales,
  -- equipo/responsable) siguen sin reconocer a Ana ni a Beto en este fixture.
  UPDATE public.engagement_assignments SET notes = '0922-190-probe'
   WHERE assignment_id = 'aa920000-0000-4000-8000-000000000001'; -- fila propia de Ana
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION '0922-190 RLS FAIL — Ana pudo escribir su propia fila: ea_select_own abrió escritura además de lectura'; END IF;
  RAISE NOTICE 'PASS — ea_select_own es solo-lectura: Ana no puede escribir ni su propia fila';

  -- list_my_assignments (review 2026-09-25, MUST FIX): resuelve encargo/cliente/categoría
  -- con su propio gate (staff_id = get_my_staff_id()), sin depender de engagement.read/
  -- client.read -- el rol 'assistant' de este fixture no tiene ninguno de los dos.
  PERFORM pg_temp.impersonate('a0920000-0000-4000-8000-000000000001'); -- Ana
  SELECT count(*) INTO n FROM public.list_my_assignments('all', '2000-01-01', '2100-01-01');
  IF n <> 2 THEN RAISE EXCEPTION '0922-190 RLS FAIL — list_my_assignments: Ana esperaba 2 filas propias, obtuvo %', n; END IF;

  SELECT count(*) INTO n FROM public.list_my_assignments('all', '2000-01-01', '2100-01-01')
   WHERE engagement_name IS NULL OR client_legal_name IS NULL OR category_name IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION '0922-190 RLS FAIL — list_my_assignments: Ana tiene % fila(s) con encargo/cliente/categoría en null (el bug que esta RPC corrige)', n; END IF;

  SELECT count(*) INTO n FROM public.list_my_assignments('all', '2000-01-01', '2100-01-01')
   WHERE assignment_id = 'aa920000-0000-4000-8000-000000000003'; -- fila de Beto
  IF n <> 0 THEN RAISE EXCEPTION '0922-190 RLS FAIL — list_my_assignments: Ana ve la fila de Beto (fuga)'; END IF;
  RAISE NOTICE 'PASS — list_my_assignments: Ana ve encargo/cliente/categoría de sus 2 filas propias (nunca null), nunca la de Beto';

  PERFORM pg_temp.impersonate('a0920000-0000-4000-8000-000000000002'); -- Beto
  SELECT count(*) INTO n FROM public.list_my_assignments('all', '2000-01-01', '2100-01-01');
  IF n <> 1 THEN RAISE EXCEPTION '0922-190 RLS FAIL — list_my_assignments: Beto esperaba 1 fila propia, obtuvo %', n; END IF;

  SELECT count(*) INTO n FROM public.list_my_assignments('all', '2000-01-01', '2100-01-01')
   WHERE engagement_name IS NULL OR client_legal_name IS NULL OR category_name IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION '0922-190 RLS FAIL — list_my_assignments: Beto tiene fila(s) con encargo/cliente/categoría en null'; END IF;

  SELECT count(*) INTO n FROM public.list_my_assignments('all', '2000-01-01', '2100-01-01')
   WHERE assignment_id IN ('aa920000-0000-4000-8000-000000000001', 'aa920000-0000-4000-8000-000000000002'); -- filas de Ana
  IF n <> 0 THEN RAISE EXCEPTION '0922-190 RLS FAIL — list_my_assignments: Beto ve % fila(s) de Ana (fuga)', n; END IF;
  RAISE NOTICE 'PASS — list_my_assignments: Beto ve encargo/cliente/categoría de su fila propia (nunca null), nunca las de Ana';

  -- Toggle inválido: fail-closed con una excepción explícita, nunca un resultado vacío
  -- silencioso (mismo principio que EA_SEGMENTS_DENIED en get_staff_assignment_segments).
  DECLARE
    v_rejected boolean := false;
  BEGIN
    BEGIN
      PERFORM 1 FROM public.list_my_assignments('bogus', '2000-01-01', '2100-01-01');
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'MY_ASSIGNMENTS_INVALID_TOGGLE' THEN
        RAISE EXCEPTION '0922-190 RLS FAIL — p_toggle inválido dio un error distinto al esperado: %', SQLERRM;
      END IF;
      v_rejected := true;
    END;
    IF NOT v_rejected THEN
      RAISE EXCEPTION '0922-190 RLS FAIL — list_my_assignments aceptó un p_toggle inválido sin error';
    END IF;
  END;
  RAISE NOTICE 'PASS — list_my_assignments rechaza p_toggle inválido (fail-closed)';

  -- Anon: sigue hard-denegado (el grant de tabla no lo toca esta migración).
  IF to_regrole('anon') IS NULL THEN
    RAISE NOTICE 'SKIP — role anon not present in this environment';
  ELSE
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';
    DECLARE
      denied boolean := false;
    BEGIN
      BEGIN
        SELECT count(*) INTO n FROM public.engagement_assignments;
      EXCEPTION WHEN insufficient_privilege THEN
        denied := true;
      END;
      IF NOT denied THEN
        RAISE EXCEPTION '0922-190 RLS FAIL — anon can still query engagement_assignments (% rows)', n;
      END IF;
      RAISE NOTICE 'PASS — anon hard-denied on engagement_assignments';
    END;
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
  END IF;

  RAISE NOTICE '0922-190 MY ASSIGNMENTS VISIBILITY: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
