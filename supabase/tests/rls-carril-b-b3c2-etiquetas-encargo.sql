-- Carril B / B3c-2 — public.list_own_engagement_labels(uuid[]) (20261012170000_rls_carril_b3c2_etiquetas_encargo.sql)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de B3c (que activa RLS en engagements).
-- Transacción única, SIEMPRE hace ROLLBACK. Salida de éxito: una NOTICE por chequeo, terminando en
-- "B3c-2 ETIQUETAS DE ENCARGO: ALL CHECKS PASSED (rolled back)".
--
-- Lo que se prueba: quien NO puede leer un encargo (sin engagement.read, sin ser de su equipo) recibe su código y
-- nombre SOLO si tiene algo propio sobre él (una hora, un timer o una solicitud de reversión, como solicitante o
-- como dueño de la boleta), y nunca el de un encargo ajeno. Todo corre con `SET LOCAL ROLE authenticated` real.
--
-- Fixture world (ids con prefijo b3c2):
--   A y B: asistentes sin engagement.read. Encargos: EH (A tiene una hora), ET (A tiene un timer), ER (A pidió una
--   reversión), EO (la boleta de A, pero la pidió B), EN (nadie tiene nada), EB (B tiene una hora).

BEGIN;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1b3c200-0000-4000-8000-000000000001', 'B3c2 Cliente', 'B3C2-TAX-001');

INSERT INTO auth.users (id) VALUES
  ('a0b3c200-0000-4000-8000-00000000000a'), ('a0b3c200-0000-4000-8000-00000000000b');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0b3c200-0000-4000-8000-00000000000a', 'staff', 'assistant'),
  ('a0b3c200-0000-4000-8000-00000000000b', 'staff', 'assistant');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id) VALUES
  ('50b3c200-0000-4000-8000-00000000000a', 'a0b3c200-0000-4000-8000-00000000000a', 'A', 'B3c2',
   (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('50b3c200-0000-4000-8000-00000000000b', 'a0b3c200-0000-4000-8000-00000000000b', 'B', 'B3c2',
   (SELECT practica_id FROM public.practicas WHERE code = 1), (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, practica, fecha_cierre,
                                work_order_required, approval_required, society_id) VALUES
  ('e0b3c200-0000-4000-8000-000000000001', 'c1b3c200-0000-4000-8000-000000000001', 'B3c2 EH', 'B3C2-H', 1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0b3c200-0000-4000-8000-000000000002', 'c1b3c200-0000-4000-8000-000000000001', 'B3c2 ET', 'B3C2-T', 1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0b3c200-0000-4000-8000-000000000003', 'c1b3c200-0000-4000-8000-000000000001', 'B3c2 ER', 'B3C2-R', 1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0b3c200-0000-4000-8000-000000000004', 'c1b3c200-0000-4000-8000-000000000001', 'B3c2 EO', 'B3C2-O', 1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0b3c200-0000-4000-8000-000000000005', 'c1b3c200-0000-4000-8000-000000000001', 'B3c2 EN', 'B3C2-N', 1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0b3c200-0000-4000-8000-000000000006', 'c1b3c200-0000-4000-8000-000000000001', 'B3c2 EB', 'B3C2-B', 1, '2027-12-31', false, true, (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

-- Mismo patrón que rls-0828-186-own-timer-engagement-labels.sql: una actividad de sistema mínima.
INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id)
VALUES ('B3C2-ACT', 'Harness Activity B3c2', true, NULL)
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;

INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year) VALUES
  ('b0b3c200-0000-4000-8000-00000000000a', '50b3c200-0000-4000-8000-00000000000a', '2026-06-01', 23, 2026),
  ('b0b3c200-0000-4000-8000-00000000000b', '50b3c200-0000-4000-8000-00000000000b', '2026-06-01', 23, 2026);

-- (EH) hora propia de A; (EB) hora propia de B.
INSERT INTO public.time_entries (staff_id, engagement_id, activity_id, date_worked, hours_logged, period_id, is_forecast) VALUES
  ('50b3c200-0000-4000-8000-00000000000a', 'e0b3c200-0000-4000-8000-000000000001',
   (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'B3C2-ACT'), '2026-06-01', 8, 'b0b3c200-0000-4000-8000-00000000000a', false),
  ('50b3c200-0000-4000-8000-00000000000b', 'e0b3c200-0000-4000-8000-000000000006',
   (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'B3C2-ACT'), '2026-06-01', 8, 'b0b3c200-0000-4000-8000-00000000000b', false);

-- (ET) timer propio de A.
INSERT INTO public.timer_entries (timer_id, staff_id, engagement_id, activity_id, started_at, ended_at, duration_minutes) VALUES
  (gen_random_uuid(), '50b3c200-0000-4000-8000-00000000000a', 'e0b3c200-0000-4000-8000-000000000002',
   (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'B3C2-ACT'), now() - interval '1 hour', now(), 60);

-- (ER) A pidió la reversión sobre su boleta; (EO) B pidió una reversión sobre la boleta de A.
INSERT INTO public.timesheet_reversal_requests (period_id, scope, engagement_id, requested_by, reason) VALUES
  ('b0b3c200-0000-4000-8000-00000000000a', 'engagement', 'e0b3c200-0000-4000-8000-000000000003', '50b3c200-0000-4000-8000-00000000000a', 'b3c2 pidio A'),
  ('b0b3c200-0000-4000-8000-00000000000a', 'engagement', 'e0b3c200-0000-4000-8000-000000000004', '50b3c200-0000-4000-8000-00000000000b', 'b3c2 pidio B sobre la boleta de A');

CREATE FUNCTION pg_temp.labels_as(p_sub text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r text; v_ids uuid[];
BEGIN
  -- Los ids se arman como owner: con el rol authenticated la RLS ocultaría los encargos (es justo lo que se prueba).
  SELECT array_agg(e.engagement_id) INTO v_ids FROM public.engagements e WHERE e.engagement_code LIKE 'B3C2-%';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- La etiqueta se lee de la RPC (DEFINER), no de engagements.
  SELECT string_agg(l.engagement_code, ',' ORDER BY l.engagement_code) INTO r
    FROM public.list_own_engagement_labels(v_ids) l;
  EXECUTE 'RESET ROLE';
  RETURN coalesce(r, '');
END $$;

DO $$
DECLARE
  ua constant text := 'a0b3c200-0000-4000-8000-00000000000a';
  ub constant text := 'a0b3c200-0000-4000-8000-00000000000b';
  v text; v_n bigint; v_all uuid[];
BEGIN
  -- 0. Premisa: A no puede leer ningún encargo del fixture (si pudiera, la RPC no probaría nada).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.engagements WHERE engagement_code LIKE 'B3C2-%';
  EXECUTE 'RESET ROLE';
  IF v_n <> 0 THEN RAISE EXCEPTION 'B3c2 FAIL — A debía no ver encargos por RLS y ve %', v_n; END IF;
  RAISE NOTICE 'PASS — premisa: A no lee ningún encargo del fixture por RLS';

  -- 1. A recibe la etiqueta de los 4 encargos donde tiene algo propio (hora, timer, reversión pedida por A y
  --    reversión de B sobre su boleta) y NO la de EN (nadie) ni la de EB (hora de B).
  v := pg_temp.labels_as(ua);
  IF v <> 'B3C2-H,B3C2-O,B3C2-R,B3C2-T' THEN
    RAISE EXCEPTION 'B3c2 FAIL — A debía recibir H,O,R,T y recibe [%]', v;
  END IF;
  RAISE NOTICE 'PASS — hora propia, timer propio, reversión pedida y reversión sobre la boleta propia dan la etiqueta; el resto no';

  -- 2. Aislamiento: B recibe EB (hora propia) y EO (la pidió él), nunca lo de A.
  v := pg_temp.labels_as(ub);
  IF v <> 'B3C2-B,B3C2-O' THEN
    RAISE EXCEPTION 'B3c2 FAIL — B debía recibir B,O y recibe [%]', v;
  END IF;
  RAISE NOTICE 'PASS — aislamiento por persona: B no recibe lo de A';

  -- 3. No-vacuidad: al borrar la única hora de A sobre EH, EH deja de salir.
  DELETE FROM public.time_entries WHERE staff_id = '50b3c200-0000-4000-8000-00000000000a';
  v := pg_temp.labels_as(ua);
  IF v <> 'B3C2-O,B3C2-R,B3C2-T' THEN
    RAISE EXCEPTION 'B3c2 FAIL — sin su hora, A debía perder H y recibe [%]', v;
  END IF;
  RAISE NOTICE 'PASS — la etiqueta sale de la pertenencia: sin la hora propia desaparece';

  -- 4. Sin ficha de staff no se recibe nada.
  SELECT array_agg(engagement_id) INTO v_all FROM public.engagements;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'a0b3c200-0000-4000-8000-0000000000ff', 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.list_own_engagement_labels(v_all);
  EXECUTE 'RESET ROLE';
  IF v_n <> 0 THEN RAISE EXCEPTION 'B3c2 FAIL — una sesión sin ficha de staff recibió % etiquetas', v_n; END IF;
  RAISE NOTICE 'PASS — sin ficha de staff: 0 etiquetas';

  -- 5. Privilegios: anon y PUBLIC no ejecutan; authenticated sí; la función es DEFINER con search_path fijo.
  IF has_function_privilege('anon', 'public.list_own_engagement_labels(uuid[])', 'EXECUTE')
     OR has_function_privilege('public', 'public.list_own_engagement_labels(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'B3c2 FAIL — anon o PUBLIC pueden ejecutar list_own_engagement_labels';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.list_own_engagement_labels(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'B3c2 FAIL — authenticated no puede ejecutar list_own_engagement_labels';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.list_own_engagement_labels(uuid[])'::regprocedure
                  AND prosecdef AND 'search_path=public' = ANY (proconfig)) THEN
    RAISE EXCEPTION 'B3c2 FAIL — list_own_engagement_labels debe ser SECURITY DEFINER con search_path=public';
  END IF;
  RAISE NOTICE 'PASS — privilegios: sin EXECUTE para anon/PUBLIC, DEFINER con search_path fijo';

  RAISE NOTICE 'B3c-2 ETIQUETAS DE ENCARGO: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
