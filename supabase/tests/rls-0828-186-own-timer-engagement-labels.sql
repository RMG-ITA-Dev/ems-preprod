-- Transactional tests for public.list_own_timer_engagement_labels(uuid[]) — BUG 0828-186
-- (review Iteración 4, bugs/0828-186/review.md).
--
-- A diferencia de list_loggable_engagements() (filtra por elegibilidad ACTUAL para cargar
-- horas), esta función resuelve el nombre/código de un encargo por PERTENENCIA del registro:
-- el caller ya tiene un timer_entries propio que referencia ese engagement_id. Sirve de
-- respaldo para Tracker History (useTimerEntries) cuando el embed normal `engagement:
-- engagements(...)` cae a null por la RLS de asignación, incluyendo el caso que
-- list_loggable_engagements() no cubre: un encargo que dejó de ser "cargable" (inactivo o
-- con override 6/7/8/9) DESPUÉS de que el caller ya había registrado la hora.
--
-- DÓNDE CORRE: supabase/tests/local/run-rls-tests.sh, después de aplicar el set consolidado
-- + 20260831013000_0828-186_list_loggable_engagements_rpc.sql +
-- 20260831020000_0828-186_list_own_timer_engagement_labels_rpc.sql sobre la base scratch.
--
-- A MANO: se puede pegar tal cual en el SQL Editor de un proyecto Supabase con el esquema al
-- día (transacción que SIEMPRE termina en ROLLBACK). Misma convención que
-- rls-0828-186-loggable-engagements-rpc.sql: un NOTICE por chequeo que pasa, y al final
-- "OWN TIMER ENGAGEMENT LABELS RPC: ALL CHECKS PASSED".
--
-- Fixture: ids con el prefijo reconocible 0828186, rango 0011+ para no pisar el fixture de
-- rls-0828-186-loggable-engagements-rpc.sql (cada suite corre en su propia transacción/
-- conexión, así que no hay colisión real, pero se mantiene el rango separado por legibilidad).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.society) THEN
    RAISE EXCEPTION 'FIXTURE: no hay filas en public.society y staff.society_id es NOT NULL.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.practicas WHERE code = 1) THEN
    RAISE EXCEPTION 'FIXTURE: falta el servicio code = 1 y staff.practica_id es NOT NULL.';
  END IF;
END $$;

-- ── Fixture: dos callers, ninguno necesita time_entry.create (esta función no lo exige --
-- la pertenencia del timer_entries ya prueba que el registro es legítimo) ──────────────────
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    VALUES
      ('a0828186-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'le-0828186-tracker-a@ruizmier.com', 'x',
       now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
      ('a0828186-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'le-0828186-tracker-b@ruizmier.com', 'x',
       now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id)
VALUES
  ('50828186-0000-4000-8000-000000000011', 'a0828186-0000-4000-8000-000000000011',
   'LE', 'TrackerCallerA0828186', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('50828186-0000-4000-8000-000000000012', 'a0828186-0000-4000-8000-000000000012',
   'LE', 'TrackerCallerB0828186', true,
   (SELECT practica_id FROM public.practicas WHERE code = 1),
   (SELECT society_id FROM public.society ORDER BY name LIMIT 1))
ON CONFLICT (staff_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_key) VALUES
  ('a0828186-0000-4000-8000-000000000011', 'senior'),
  ('a0828186-0000-4000-8000-000000000012', 'senior')
ON CONFLICT (user_id) DO UPDATE SET role_key = EXCLUDED.role_key;

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('60828186-0000-4000-8000-000000000011', 'Cliente Tracker 0828-186', 'NIT-0828186-B')
ON CONFLICT (client_id) DO NOTHING;

-- Encargos del fixture. Ninguno asignado al caller A -- la pertenencia viene solo del
-- timer_entries, no de engagement_assignments.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                 status, work_order_required, engagement_state_override,
                                 fecha_cierre) VALUES
  -- (a) Actualmente cargable (caso ya cubierto por list_loggable_engagements, control).
  ('70828186-0000-4000-8000-000000000011', '60828186-0000-4000-8000-000000000011',
   'Loggable Ahora 0828186', 'LE-11', 'active', false, NULL, '2026-12-31'),
  -- (b) YA NO cargable: override Finalizado (7) -- el caso que list_loggable_engagements()
  -- no cubre porque lo excluye del WHERE. El caller A ya tiene un timer_entries acá.
  ('70828186-0000-4000-8000-000000000012', '60828186-0000-4000-8000-000000000011',
   'Finalizado Post-Registro 0828186', 'LE-12', 'active', false, 7, '2026-12-31'),
  -- (c) status inactivo -- también fuera de list_loggable_engagements(). Caller A también
  -- tiene timer_entries acá.
  ('70828186-0000-4000-8000-000000000013', '60828186-0000-4000-8000-000000000011',
   'Inactivo Post-Registro 0828186', 'LE-13', 'inactive', false, NULL, '2026-12-31'),
  -- (d) Encargo que el caller A NUNCA registró -- no debe aparecer aunque exista y sea
  -- cargable (la función no es un sustituto del selector, solo resuelve pertenencia).
  ('70828186-0000-4000-8000-000000000014', '60828186-0000-4000-8000-000000000011',
   'Nunca Registrado 0828186', 'LE-14', 'active', false, NULL, '2026-12-31')
ON CONFLICT (engagement_id) DO NOTHING;

-- run-rls-tests.sh solo aplica cero_01..cero_06 (esquema), no cero_11 (seed de
-- practicas/activity_codes) -- ninguna otra suite del harness depende de activity_codes, así
-- que se siembra acá una fila mínima de sistema (is_system=true no exige practica_id, mismo
-- patrón que el activity_code 'ADM' de cero_11_seed_practicas.sql:142-144) para satisfacer el
-- NOT NULL de timer_entries.activity_id.
INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id)
VALUES ('LE-0828186', 'Harness Activity 0828186', true, NULL)
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;

-- timer_entries del caller A sobre (a), (b) y (c) -- no sobre (d).
INSERT INTO public.timer_entries (timer_id, staff_id, engagement_id, activity_id,
                                  started_at, ended_at, duration_minutes)
VALUES
  (gen_random_uuid(), '50828186-0000-4000-8000-000000000011',
   '70828186-0000-4000-8000-000000000011',
   (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'LE-0828186'),
   now() - interval '1 hour', now(), 60),
  (gen_random_uuid(), '50828186-0000-4000-8000-000000000011',
   '70828186-0000-4000-8000-000000000012',
   (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'LE-0828186'),
   now() - interval '1 hour', now(), 60),
  (gen_random_uuid(), '50828186-0000-4000-8000-000000000011',
   '70828186-0000-4000-8000-000000000013',
   (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'LE-0828186'),
   now() - interval '1 hour', now(), 60);

-- timer_entries del caller B sobre (d) -- prueba que la pertenencia es por-staff, no global.
INSERT INTO public.timer_entries (timer_id, staff_id, engagement_id, activity_id,
                                  started_at, ended_at, duration_minutes)
VALUES
  (gen_random_uuid(), '50828186-0000-4000-8000-000000000012',
   '70828186-0000-4000-8000-000000000014',
   (SELECT activity_id FROM public.activity_codes WHERE activity_code = 'LE-0828186'),
   now() - interval '1 hour', now(), 60);

CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count integer;
  v_ids uuid[] := ARRAY[
    '70828186-0000-4000-8000-000000000011'::uuid,
    '70828186-0000-4000-8000-000000000012'::uuid,
    '70828186-0000-4000-8000-000000000013'::uuid,
    '70828186-0000-4000-8000-000000000014'::uuid
  ];
BEGIN
  PERFORM pg_temp.impersonate('a0828186-0000-4000-8000-000000000011');  -- caller A

  -- ── (a) Encargo actualmente cargable, con timer_entries propio -- debe aparecer ─────────
  PERFORM 1 FROM public.list_own_timer_engagement_labels(v_ids) l
   WHERE l.engagement_id = '70828186-0000-4000-8000-000000000011';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL (a): encargo cargable con timer_entries propio no apareció';
  END IF;
  RAISE NOTICE 'OK (a): encargo actualmente cargable con timer_entries propio visible';

  -- ── (b) Encargo con override Finalizado (7) DESPUÉS del registro -- debe aparecer igual,
  -- a diferencia de list_loggable_engagements() que lo excluiría ───────────────────────────
  PERFORM 1 FROM public.list_own_timer_engagement_labels(v_ids) l
   WHERE l.engagement_id = '70828186-0000-4000-8000-000000000012'
     AND l.engagement_name = 'Finalizado Post-Registro 0828186';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL (b): encargo con override Finalizado post-registro no resolvió nombre (regresión que motivó esta función)';
  END IF;
  RAISE NOTICE 'OK (b): encargo que dejó de ser cargable (override 7) sigue resolviendo nombre por pertenencia';

  -- ── (c) Encargo con status inactivo DESPUÉS del registro -- debe aparecer igual ─────────
  PERFORM 1 FROM public.list_own_timer_engagement_labels(v_ids) l
   WHERE l.engagement_id = '70828186-0000-4000-8000-000000000013';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL (c): encargo inactivo post-registro no resolvió nombre';
  END IF;
  RAISE NOTICE 'OK (c): encargo inactivo post-registro sigue resolviendo nombre por pertenencia';

  -- ── (d) Encargo que el caller A nunca registró -- NO debe aparecer aunque exista y sea
  -- cargable (no es un sustituto del selector) ─────────────────────────────────────────────
  PERFORM 1 FROM public.list_own_timer_engagement_labels(v_ids) l
   WHERE l.engagement_id = '70828186-0000-4000-8000-000000000014';
  IF FOUND THEN
    RAISE EXCEPTION 'FAIL (d): encargo nunca registrado por el caller apareció igual';
  END IF;
  RAISE NOTICE 'OK (d): encargo nunca registrado por el caller queda excluido';

  -- ── Aislamiento: el timer_entries del caller B sobre (d) no le da acceso al caller A ─────
  SELECT count(*) INTO v_count FROM public.list_own_timer_engagement_labels(v_ids) l
   WHERE l.engagement_id = '70828186-0000-4000-8000-000000000014';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL (aislamiento): el timer_entries de OTRO staff filtró hacia el caller A';
  END IF;
  RAISE NOTICE 'OK (aislamiento): timer_entries de otro staff no se filtra entre callers';

  RAISE NOTICE 'OWN TIMER ENGAGEMENT LABELS RPC: ALL CHECKS PASSED (rolled back)';
END $$;

RESET ROLE;

ROLLBACK;
