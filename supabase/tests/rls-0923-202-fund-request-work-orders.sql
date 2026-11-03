-- Authorization assertions for BUG 0923-202: quien puede pedir fondos contra una OT. Se corre via
-- supabase/tests/local/run-rls-tests.sh sobre la base scratch desechable, DESPUES del set consolidado
-- (cero_01..cero_06), que ya trae can_request_funds_for_engagement(), la vista
-- fund_request_selectable_work_orders filtrada, el trigger tr_fr_wo_enforce_requester_engagement y
-- fund_request_submit() con la revalidacion. Una sola transaccion que SIEMPRE hace ROLLBACK.
--
-- Regla (decisiones del operador 2026-10-30):
--   * encargo de CLIENTE: solo las 6 posiciones del equipo o quien tenga una asignacion en
--     engagement_assignments no borrada y no CANCELLED, SIN importar fechas (PROPOSED cuenta);
--   * encargo ADMINISTRATIVO (funcion 0/2/3): cualquiera, como antes;
--   * admin: siempre.
-- La regla de sociedad se suma aparte (rls-accounting-society-scope.sql); aqui todo es de una sola sociedad.
--
-- Mundo de fixtures (prefijo 0923202):
--   E1  cliente, gerente Mel         + asignacion de Otto (CONFIRMED)
--   E2  cliente, gerente Mel, encargado Eva
--   E3  cliente, gerente Mel         + Sam CONFIRMED con fechas pasadas, Pia PROPOSED con fechas futuras,
--                                      Cam CANCELLED, Dan borrada
--   E4  cliente, gerente Mel, OT en Draft (el orden de validaciones no cambio)
--   E5  ADMINISTRATIVO, gerente Mel
--   Nadie: staff sin equipo ni asignacion.  Ada: admin.
--
-- Visibilidad esperada sobre las 4 OT aprobadas (E1, E2, E3, E5):
--   Mel 4 · Ada 4 · Eva 2 (E2+E5) · Sam 2 (E3+E5) · Pia 2 (E3+E5) · Otto 2 (E1+E5) · Cam / Dan / Nadie 1 (E5)
--
-- Salida de exito: un NOTICE por check, terminando en "0923-202 FUND REQUEST WO: ALL CHECKS PASSED".

BEGIN;

-- Fixtures (como postgres; RLS no ata al dueno de la tabla) --------------------
INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c0923202-0000-4000-8000-000000000001', 'Cliente 0923202', 'NIT-0923202')
ON CONFLICT (client_id) DO NOTHING;

INSERT INTO public.categories (category_id, category_name, practica_id, display_order,
                               rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd) VALUES
  ('ca923202-0000-4000-8000-000000000001', 'Categoria 0923202',
   (SELECT practica_id FROM public.practicas WHERE code = 1), 1, 500, 400, 50, 40)
ON CONFLICT (category_id) DO NOTHING;

-- staff.auth_user_id es FK a auth.users. to_hex(n) y no lpad(n): el decimo id termina en 'a'.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    SELECT ('a0923202-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           '0923202-test-' || n || '@ruizmier.com', 'x', now(), now(), now(),
           '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 10) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, is_active,
                          practica_id, society_id, weekly_capacity_hours, hire_date, city)
SELECT v.staff_id::uuid, v.auth_id::uuid, '0923202', v.nombre, true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'),
       40, '2020-01-01', 'La Paz'
FROM (VALUES
  ('5a923202-0000-4000-8000-000000000001', 'a0923202-0000-4000-8000-000000000001', 'Mel'),
  ('5a923202-0000-4000-8000-000000000002', 'a0923202-0000-4000-8000-000000000002', 'Eva'),
  ('5a923202-0000-4000-8000-000000000003', 'a0923202-0000-4000-8000-000000000003', 'Sam'),
  ('5a923202-0000-4000-8000-000000000004', 'a0923202-0000-4000-8000-000000000004', 'Pia'),
  ('5a923202-0000-4000-8000-000000000005', 'a0923202-0000-4000-8000-000000000005', 'Otto'),
  ('5a923202-0000-4000-8000-000000000006', 'a0923202-0000-4000-8000-000000000006', 'Cam'),
  ('5a923202-0000-4000-8000-000000000007', 'a0923202-0000-4000-8000-000000000007', 'Dan'),
  ('5a923202-0000-4000-8000-000000000009', 'a0923202-0000-4000-8000-000000000009', 'Nadie'),
  ('5a923202-0000-4000-8000-00000000000a', 'a0923202-0000-4000-8000-00000000000a', 'Ada')
) AS v(staff_id, auth_id, nombre)
ON CONFLICT (staff_id) DO NOTHING;

-- `role` ademas de `role_key`: la excepcion de admin mira user_roles.role (enum app_role), como is_admin().
INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0923202-0000-4000-8000-000000000001', 'manager', 'manager'),
  ('a0923202-0000-4000-8000-000000000002', 'senior',  'senior'),
  ('a0923202-0000-4000-8000-000000000003', 'staff',   'assistant'),
  ('a0923202-0000-4000-8000-000000000004', 'staff',   'assistant'),
  ('a0923202-0000-4000-8000-000000000005', 'staff',   'assistant'),
  ('a0923202-0000-4000-8000-000000000006', 'staff',   'assistant'),
  ('a0923202-0000-4000-8000-000000000007', 'staff',   'assistant'),
  ('a0923202-0000-4000-8000-000000000009', 'staff',   'assistant'),
  ('a0923202-0000-4000-8000-00000000000a', 'admin',   'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, role_key = EXCLUDED.role_key;

-- El trigger 0722-160 exige el cliente interno de la sociedad para E5: fuera de lo que se prueba aqui.
ALTER TABLE public.engagements DISABLE TRIGGER trg_enforce_administrative_engagement_rules;
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
                                fecha_cierre, society_id, funcion, manager_id, encargado_id) VALUES
  ('e0923202-0000-4000-8000-000000000001', 'c0923202-0000-4000-8000-000000000001', '0923202 E1', '923202-E1',
   '2027-12-31', (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), 1,
   '5a923202-0000-4000-8000-000000000001', NULL),
  ('e0923202-0000-4000-8000-000000000002', 'c0923202-0000-4000-8000-000000000001', '0923202 E2', '923202-E2',
   '2027-12-31', (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), 1,
   '5a923202-0000-4000-8000-000000000001', '5a923202-0000-4000-8000-000000000002'),
  ('e0923202-0000-4000-8000-000000000003', 'c0923202-0000-4000-8000-000000000001', '0923202 E3', '923202-E3',
   '2027-12-31', (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), 1,
   '5a923202-0000-4000-8000-000000000001', NULL),
  ('e0923202-0000-4000-8000-000000000004', 'c0923202-0000-4000-8000-000000000001', '0923202 E4', '923202-E4',
   '2027-12-31', (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), 1,
   '5a923202-0000-4000-8000-000000000001', NULL),
  ('e0923202-0000-4000-8000-000000000005', 'c0923202-0000-4000-8000-000000000001', '0923202 E5', '923202-E5',
   '2027-12-31', (SELECT society_id FROM public.society WHERE name = 'Harness Test Society'), 0,
   '5a923202-0000-4000-8000-000000000001', NULL)
ON CONFLICT (engagement_id) DO NOTHING;
ALTER TABLE public.engagements ENABLE TRIGGER trg_enforce_administrative_engagement_rules;

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('d0923202-0000-4000-8000-000000000001', 'e0923202-0000-4000-8000-000000000001', 'BOB', 'High', 'Approved'),
  ('d0923202-0000-4000-8000-000000000002', 'e0923202-0000-4000-8000-000000000002', 'BOB', 'High', 'Approved'),
  ('d0923202-0000-4000-8000-000000000003', 'e0923202-0000-4000-8000-000000000003', 'BOB', 'High', 'Approved'),
  ('d0923202-0000-4000-8000-000000000004', 'e0923202-0000-4000-8000-000000000004', 'BOB', 'High', 'Draft'),
  ('d0923202-0000-4000-8000-000000000005', 'e0923202-0000-4000-8000-000000000005', 'BOB', 'High', 'Approved')
ON CONFLICT (wo_id) DO NOTHING;

-- Asignaciones. Las fechas NO importan: Sam tiene una que ya termino y Pia una que todavia no empieza.
INSERT INTO public.engagement_assignments (assignment_id, engagement_id, staff_id, start_date,
                                           end_date, hours_per_week, allocation_percent,
                                           status, category_id, deleted_at) VALUES
  -- Otto: E1, CONFIRMED.
  ('ea923202-0000-4000-8000-000000000001', 'e0923202-0000-4000-8000-000000000001',
   '5a923202-0000-4000-8000-000000000005', current_date - 5, current_date + 30,
   20, 100, 'CONFIRMED', 'ca923202-0000-4000-8000-000000000001', NULL),
  -- Sam: E3, CONFIRMED, termino hace un mes.
  ('ea923202-0000-4000-8000-000000000002', 'e0923202-0000-4000-8000-000000000003',
   '5a923202-0000-4000-8000-000000000003', current_date - 90, current_date - 30,
   20, 100, 'CONFIRMED', 'ca923202-0000-4000-8000-000000000001', NULL),
  -- Pia: E3, PROPOSED (lo que crea la tarjeta de Asignaciones del encargo), empieza en un mes.
  ('ea923202-0000-4000-8000-000000000003', 'e0923202-0000-4000-8000-000000000003',
   '5a923202-0000-4000-8000-000000000004', current_date + 30, current_date + 60,
   20, 100, 'PROPOSED', 'ca923202-0000-4000-8000-000000000001', NULL),
  -- Cam: E3, CANCELLED.
  ('ea923202-0000-4000-8000-000000000004', 'e0923202-0000-4000-8000-000000000003',
   '5a923202-0000-4000-8000-000000000006', current_date - 5, current_date + 30,
   20, 100, 'CANCELLED', 'ca923202-0000-4000-8000-000000000001', NULL),
  -- Dan: E3, borrada.
  ('ea923202-0000-4000-8000-000000000005', 'e0923202-0000-4000-8000-000000000003',
   '5a923202-0000-4000-8000-000000000007', current_date - 5, current_date + 30,
   20, 100, 'CONFIRMED', 'ca923202-0000-4000-8000-000000000001', now())
ON CONFLICT (assignment_id) DO NOTHING;

-- Borradores: f1/f5/f6 de Nadie, f2 de Mel, f3/f4 de Sam, f7 de Ada.
INSERT INTO public.fund_requests (fund_request_id, requester_staff_id, total_requested_amount,
                                  currency, status) VALUES
  ('f0923202-0000-4000-8000-000000000001', '5a923202-0000-4000-8000-000000000009', 100, 'BOB', 'borrador'),
  ('f0923202-0000-4000-8000-000000000002', '5a923202-0000-4000-8000-000000000001', 100, 'BOB', 'borrador'),
  ('f0923202-0000-4000-8000-000000000003', '5a923202-0000-4000-8000-000000000003', 100, 'BOB', 'borrador'),
  ('f0923202-0000-4000-8000-000000000004', '5a923202-0000-4000-8000-000000000003', 100, 'BOB', 'borrador'),
  ('f0923202-0000-4000-8000-000000000005', '5a923202-0000-4000-8000-000000000009', 100, 'BOB', 'borrador'),
  ('f0923202-0000-4000-8000-000000000006', '5a923202-0000-4000-8000-000000000009', 100, 'BOB', 'borrador'),
  ('f0923202-0000-4000-8000-000000000007', '5a923202-0000-4000-8000-00000000000a', 100, 'BOB', 'borrador')
ON CONFLICT (fund_request_id) DO NOTHING;

-- Helpers (temp; mueren con la sesion) -----------------------------------------
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

-- Cuenta solo las OT del fixture: la base scratch puede tener otras.
CREATE FUNCTION pg_temp.visibles() RETURNS int
LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.fund_request_selectable_work_orders
   WHERE wo_id::text LIKE 'd0923202-%'
$$;

SET LOCAL ROLE authenticated;

-- 1..8 - La VISTA, que alimenta el selector de OT ------------------------------
DO $$
DECLARE
  n int;
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('a0923202-0000-4000-8000-000000000001', 4, 'el gerente de los cinco encargos (la OT Draft no cuenta)'),
      ('a0923202-0000-4000-8000-000000000002', 2, 'el encargado de E2 (posicion que no es gerente ni socio), mas la administrativa'),
      ('a0923202-0000-4000-8000-000000000003', 2, 'Sam, asignado a E3 con fechas ya pasadas, mas la administrativa'),
      ('a0923202-0000-4000-8000-000000000004', 2, 'Pia, asignada PROPOSED a E3 con fechas futuras, mas la administrativa'),
      ('a0923202-0000-4000-8000-000000000005', 2, 'Otto, asignado solo a E1 (no habilita E3), mas la administrativa'),
      ('a0923202-0000-4000-8000-000000000006', 1, 'Cam, con una asignacion CANCELLED: solo la administrativa'),
      ('a0923202-0000-4000-8000-000000000007', 1, 'Dan, con una asignacion borrada: solo la administrativa'),
      ('a0923202-0000-4000-8000-000000000009', 1, 'Nadie, sin equipo ni asignacion (el bug): solo la administrativa'),
      ('a0923202-0000-4000-8000-00000000000a', 4, 'el admin, sin relacion con ningun encargo')
    ) AS t(sub, esperado, caso)
  LOOP
    PERFORM pg_temp.impersonate(r.sub);
    SELECT pg_temp.visibles() INTO n;
    IF n <> r.esperado THEN
      RAISE EXCEPTION '0923-202 FAIL - % ve % OT del fixture, se esperaban %', r.caso, n, r.esperado;
    END IF;
    RAISE NOTICE 'PASS - vista: % ve %', r.caso, n;
  END LOOP;

  -- La que ve Nadie es justamente la del encargo administrativo.
  PERFORM pg_temp.impersonate('a0923202-0000-4000-8000-000000000009');
  IF NOT EXISTS (SELECT 1 FROM public.fund_request_selectable_work_orders
                  WHERE wo_id = 'd0923202-0000-4000-8000-000000000005') THEN
    RAISE EXCEPTION '0923-202 FAIL - la OT del encargo administrativo dejo de verse para todos';
  END IF;
  RAISE NOTICE 'PASS - vista: las OT administrativas siguen abiertas a la sociedad';
END $$;

-- 9..12 - El TRIGGER en el INSERT ----------------------------------------------
DO $$
DECLARE
  n int;
BEGIN
  -- 9 - Nadie intenta asignar la OT de cliente E1 a su borrador.
  PERFORM pg_temp.impersonate('a0923202-0000-4000-8000-000000000009');
  BEGIN
    INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
    VALUES ('f0923202-0000-4000-8000-000000000001', 'd0923202-0000-4000-8000-000000000001', 100);
    RAISE EXCEPTION '0923-202 FAIL - un no autorizado pudo asignarse una OT de cliente por API directa';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'FUND_REQUEST_ENGAGEMENT_FORBIDDEN%' THEN
      RAISE EXCEPTION '0923-202 FAIL - se esperaba FUND_REQUEST_ENGAGEMENT_FORBIDDEN y llego "%"', SQLERRM;
    END IF;
  END;
  SELECT count(*) INTO n FROM public.fund_request_work_orders
   WHERE fund_request_id = 'f0923202-0000-4000-8000-000000000001';
  IF n <> 0 THEN
    RAISE EXCEPTION '0923-202 FAIL - el INSERT rechazado dejo % filas', n;
  END IF;
  RAISE NOTICE 'PASS - alta: un no miembro no se asigna una OT de cliente (42501, sin fila)';

  -- 10 - Nadie si puede con la OT administrativa.
  INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
  VALUES ('f0923202-0000-4000-8000-000000000006', 'd0923202-0000-4000-8000-000000000005', 100);
  RAISE NOTICE 'PASS - alta: cualquiera asigna una OT administrativa';

  -- 11 - Gerente, asignado y admin: los caminos felices.
  PERFORM pg_temp.impersonate('a0923202-0000-4000-8000-000000000001');
  INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
  VALUES ('f0923202-0000-4000-8000-000000000002', 'd0923202-0000-4000-8000-000000000001', 100);
  PERFORM pg_temp.impersonate('a0923202-0000-4000-8000-000000000003');
  INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
  VALUES ('f0923202-0000-4000-8000-000000000003', 'd0923202-0000-4000-8000-000000000003', 100);
  INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
  VALUES ('f0923202-0000-4000-8000-000000000004', 'd0923202-0000-4000-8000-000000000003', 100);
  PERFORM pg_temp.impersonate('a0923202-0000-4000-8000-00000000000a');
  INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
  VALUES ('f0923202-0000-4000-8000-000000000007', 'd0923202-0000-4000-8000-000000000003', 100);
  RAISE NOTICE 'PASS - alta: el gerente, el asignado y el admin asignan la OT de cliente';

  -- 12 - fund_request_save_edit (delete + insert de las OT): Sam no puede cambiar su OT por la de E1.
  PERFORM pg_temp.impersonate('a0923202-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.fund_request_save_edit('f0923202-0000-4000-8000-000000000004', NULL,
      '[{"wo_id": "d0923202-0000-4000-8000-000000000001", "allocated_amount": 100}]'::jsonb);
    RAISE EXCEPTION '0923-202 FAIL - save_edit dejo poner una OT de un encargo ajeno';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'FUND_REQUEST_ENGAGEMENT_FORBIDDEN%' THEN
      RAISE EXCEPTION '0923-202 FAIL - save_edit: se esperaba FUND_REQUEST_ENGAGEMENT_FORBIDDEN y llego "%"', SQLERRM;
    END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.fund_request_work_orders
                  WHERE fund_request_id = 'f0923202-0000-4000-8000-000000000004'
                    AND wo_id = 'd0923202-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION '0923-202 FAIL - el save_edit rechazado no conservo la OT anterior';
  END IF;
  RAISE NOTICE 'PASS - edicion: save_edit con una OT ajena falla y conserva las OT previas';
END $$;

-- 13 - El dueno (RLS bypass) tampoco salta el trigger, y no se mueve una fila a otra solicitud --------
RESET ROLE;
DO $$
DECLARE
  movidas int;
BEGIN
  BEGIN
    INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
    VALUES ('f0923202-0000-4000-8000-000000000001', 'd0923202-0000-4000-8000-000000000002', 100);
    RAISE EXCEPTION '0923-202 FAIL - el dueno inserto una OT ajena en la solicitud de Nadie';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'FUND_REQUEST_ENGAGEMENT_FORBIDDEN%' THEN
      RAISE EXCEPTION '0923-202 FAIL - dueno: se esperaba FUND_REQUEST_ENGAGEMENT_FORBIDDEN y llego "%"', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'PASS - alta como dueno: el trigger valida al solicitante igual';

  -- fr_wo_guard_approval_cols ya prohibe tocar la OT fuera del RPC y puede disparar antes: cualquiera
  -- de los dos frenos sirve. Lo que importa es que la fila no se mueve a la solicitud de Nadie.
  BEGIN
    UPDATE public.fund_request_work_orders
       SET fund_request_id = 'f0923202-0000-4000-8000-000000000005'
     WHERE fund_request_id = 'f0923202-0000-4000-8000-000000000002';
    RAISE EXCEPTION '0923-202 FAIL - se movio una asignacion a la solicitud de un no miembro';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM LIKE '0923-202 FAIL%' THEN
        RAISE;
      END IF;
  END;
  SELECT count(*) INTO movidas FROM public.fund_request_work_orders
   WHERE fund_request_id = 'f0923202-0000-4000-8000-000000000005';
  IF movidas <> 0 THEN
    RAISE EXCEPTION '0923-202 FAIL - la asignacion termino en la solicitud del no miembro';
  END IF;
  RAISE NOTICE 'PASS - no se mueve una asignacion a la solicitud de un no miembro';
END $$;
SET LOCAL ROLE authenticated;

-- 14..15 - fund_request_submit(): revalidacion al ENVIAR ------------------------
DO $$
DECLARE
  estado text;
BEGIN
  PERFORM pg_temp.impersonate('a0923202-0000-4000-8000-000000000003');
  PERFORM public.fund_request_submit('f0923202-0000-4000-8000-000000000003');
  SELECT status::text INTO estado FROM public.fund_requests
   WHERE fund_request_id = 'f0923202-0000-4000-8000-000000000003';
  IF estado <> 'pendiente_aprobacion' THEN
    RAISE EXCEPTION '0923-202 FAIL - el envio legitimo dejo la solicitud en "%"', estado;
  END IF;
  RAISE NOTICE 'PASS - envio: el asignado envia su solicitud';
END $$;

-- Sam deja de estar asignado DESPUES de armar f4 (y de enviar f3).
RESET ROLE;
UPDATE public.engagement_assignments SET deleted_at = now()
 WHERE assignment_id = 'ea923202-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  estado text;
BEGIN
  PERFORM pg_temp.impersonate('a0923202-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.fund_request_submit('f0923202-0000-4000-8000-000000000004');
    RAISE EXCEPTION '0923-202 FAIL - se envio una solicitud de alguien que ya no esta asignado';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'FUND_REQUEST_ENGAGEMENT_FORBIDDEN%' THEN
      RAISE EXCEPTION '0923-202 FAIL - submit: se esperaba FUND_REQUEST_ENGAGEMENT_FORBIDDEN y llego "%"', SQLERRM;
    END IF;
  END;
  SELECT status::text INTO estado FROM public.fund_requests
   WHERE fund_request_id = 'f0923202-0000-4000-8000-000000000004';
  IF estado <> 'borrador' THEN
    RAISE EXCEPTION '0923-202 FAIL - el envio rechazado dejo la solicitud en "%"', estado;
  END IF;
  RAISE NOTICE 'PASS - envio: sin asignacion el borrador no llega a aprobacion y sigue en borrador';
END $$;

-- 16 - Lo ya enviado sigue su ciclo: el gerente aprueba la OT de f3 aunque Sam ya no este asignado ---
DO $$
DECLARE
  n int;
BEGIN
  PERFORM pg_temp.impersonate('a0923202-0000-4000-8000-000000000001');
  UPDATE public.fund_request_work_orders
     SET approval_status = 'aprobado', manager_decided_at = now()
   WHERE fund_request_id = 'f0923202-0000-4000-8000-000000000003';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION '0923-202 FAIL - el gerente no pudo aprobar la OT de una solicitud ya enviada (% filas)', n;
  END IF;
  RAISE NOTICE 'PASS - ciclo: la aprobacion del gerente no depende de la asignacion del solicitante';
END $$;

-- 17 - Las validaciones previas conservan su resultado --------------------------
DO $$
BEGIN
  -- La OT de E4 esta en Draft y Mel es gerente de E4: muere por "must be Approved", no por membresia.
  PERFORM pg_temp.impersonate('a0923202-0000-4000-8000-000000000001');
  BEGIN
    INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
    VALUES ('f0923202-0000-4000-8000-000000000002', 'd0923202-0000-4000-8000-000000000004', 100);
    RAISE EXCEPTION '0923-202 FAIL - se asigno una OT en Draft';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION '0923-202 FAIL - la OT en Draft del propio gerente murio por membresia: "%"', SQLERRM;
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%must be Approved%' THEN
        RAISE EXCEPTION '0923-202 FAIL - se esperaba el error de OT no aprobada y llego "%"', SQLERRM;
      END IF;
  END;
  RAISE NOTICE 'PASS - la regla nueva no tapa las validaciones que ya existian';
END $$;

-- 18 - Privilegios ---------------------------------------------------------------
RESET ROLE;
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.can_request_funds_for_engagement(uuid, uuid)',
                           'public.fund_request_assert_requester_engagement(uuid, uuid)',
                           'public.fr_wo_enforce_requester_engagement()'] LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION '0923-202 FAIL - % es ejecutable por authenticated o anon (sondeo de elegibilidad de terceros)', f;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('authenticated', 'public.can_request_funds_for_current_staff(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '0923-202 FAIL - authenticated no ejecuta el envoltorio: la vista fallaria con permission denied';
  END IF;
  IF has_function_privilege('anon', 'public.can_request_funds_for_current_staff(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '0923-202 FAIL - anon ejecuta can_request_funds_for_current_staff';
  END IF;
  RAISE NOTICE 'PASS - privilegios: helpers internos cerrados, envoltorio solo para authenticated';
END $$;

DO $$ BEGIN
  RAISE NOTICE '0923-202 FUND REQUEST WO: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
