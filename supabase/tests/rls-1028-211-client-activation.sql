-- 1028-211 Fase 2 — Activación de clientes. Corre desde supabase/tests/local/run-rls-tests.sh.
-- Transacción única, SIEMPRE hace ROLLBACK. Salida de éxito: "CLIENT ACTIVATION 1028-211: ALL CHECKS PASSED (rolled back)".
--
-- Bajo prueba (con el JWT del usuario; el SET LOCAL ROLE authenticated solo donde importa la RLS):
--   1. Un alta de quien no tiene client.activate nace inactiva, por la RPC y por el INSERT directo; la de admin respeta
--      lo pedido. Cambiar is_active sin el permiso se rechaza.
--   2. Un cliente sin encargos es de la sociedad de su creador: lo ven Cobranzas/Contabilidad de esa sociedad y no los
--      de la otra. Con su primer encargo pasa a la sociedad del encargo.
--   3. set_client_active: permiso, alcance por sociedad, anon sin EXECUTE.
--   4. Encargos: no sobre un cliente inactivo (ni admin); sí el sistema sin sesión (ETL); editar otro campo de un
--      encargo de cliente inactivo sigue permitido; cambiar a un cliente inactivo no.
--   5. Notificaciones: el alta pendiente avisa a admin y a los activadores de la sociedad del creador (correo solo a los
--      de alcance society); la activación avisa al creador y a los activadores, solo por campana.
--
-- Mundo (prefijo 0211): Sociedad A = Ruizmier Pelaez, B = Ruizmier Jauregui (seed).
--   U1 manager A (crea) · U2 collections_analyst A · U3 accounting_manager A · U4 accounting_manager B · U5 admin A

BEGIN;

SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    SELECT ('a0211000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
           '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'activacion-' || n || '@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 5) n
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0211000-0000-4000-8000-000000000001', 'manager', 'manager'),
  ('a0211000-0000-4000-8000-000000000002', 'staff',   'collections_analyst'),
  ('a0211000-0000-4000-8000-000000000003', 'manager', 'accounting_manager'),
  ('a0211000-0000-4000-8000-000000000004', 'manager', 'accounting_manager'),
  ('a0211000-0000-4000-8000-000000000005', 'admin',   'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, email, is_active,
                          practica_id, society_id, weekly_capacity_hours, hire_date, city)
SELECT ('50211000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a0211000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'ACT0211', 'Staff' || n, 'activacion-' || n || '@ruizmier.com', true,
       (SELECT practica_id FROM public.practicas WHERE code = 1),
       (SELECT society_id FROM public.society
         WHERE name = CASE WHEN n = 4 THEN 'Ruizmier Jauregui S.R.L.' ELSE 'Ruizmier Pelaez S.R.L.' END),
       40, '2020-01-01', 'La Paz'
  FROM generate_series(1, 5) n;

-- Encargo ya existente sobre un cliente activo, para probar el cambio de cliente y la edición.
INSERT INTO public.clients (client_id, client_legal_name, tax_id) VALUES
  ('c0211000-0000-4000-8000-0000000000e0', 'ACT0211 Cliente Con Encargo', '99001');
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code, manager_id, fecha_cierre, society_id)
VALUES ('e0211000-0000-4000-8000-0000000000e0', 'c0211000-0000-4000-8000-0000000000e0', 'ACT0211 Encargo', '0211E',
        '50211000-0000-4000-8000-000000000001', '2027-12-31',
        (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.'));

-- ── Helpers (temp) ────────────────────────────────────────────────────────────────────────────

-- Mensaje de error de una sentencia con el JWT de p_sub (NULL si no falló). Corre como dueño: la RLS no cuenta.
CREATE FUNCTION pg_temp.err_as(p_sub text, p_sql text) RETURNS text
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

-- Lo mismo, pero con el rol authenticated real (la RLS sí cuenta).
CREATE FUNCTION pg_temp.err_rls(p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN NULL;
END $$;

-- Ids que ve p_sub con la RLS real, separados por coma y ordenados.
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
    RAISE EXCEPTION 'CLIENT ACTIVATION FAIL — %: se esperaba [%] y se obtuvo [%]', p_label, p_want, p_got;
  END IF;
  RAISE NOTICE 'PASS — %', p_label;
END $$;

CREATE FUNCTION pg_temp.expect_like(p_label text, p_got text, p_pattern text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS NULL OR p_got NOT LIKE p_pattern THEN
    RAISE EXCEPTION 'CLIENT ACTIVATION FAIL — %: se esperaba un error como [%] y se obtuvo [%]', p_label, p_pattern, p_got;
  END IF;
  RAISE NOTICE 'PASS — %', p_label;
END $$;

DO $$
DECLARE
  u1 constant text := 'a0211000-0000-4000-8000-000000000001';
  u2 constant text := 'a0211000-0000-4000-8000-000000000002';
  u3 constant text := 'a0211000-0000-4000-8000-000000000003';
  u4 constant text := 'a0211000-0000-4000-8000-000000000004';
  u5 constant text := 'a0211000-0000-4000-8000-000000000005';
  c1 constant text := 'c0211000-0000-4000-8000-000000000001';  -- alta por RPC del gerente
  c2 constant text := 'c0211000-0000-4000-8000-000000000002';  -- alta por INSERT directo del gerente
  c3 constant text := 'c0211000-0000-4000-8000-000000000003';  -- alta de admin
  ce constant text := 'c0211000-0000-4000-8000-0000000000e0';  -- cliente activo con encargo
  v_contacts constant text := $j$'[{"contact_type":"general","full_name":"Ana","email":"ana@x.com"},{"contact_type":"cobranza","full_name":"Luis","email":"luis@x.com"}]'::jsonb$j$;
  v_soc_a uuid := (SELECT society_id FROM public.society WHERE name = 'Ruizmier Pelaez S.R.L.');
  v_soc_b uuid := (SELECT society_id FROM public.society WHERE name = 'Ruizmier Jauregui S.R.L.');
  v_err text;
BEGIN
  -- ═════ 1. Alta y cambio de estado ═════════════════════════════════════════════════════════════
  v_err := pg_temp.err_as(u1, format(
    $q$SELECT public.save_client_with_contacts(%L, true, '{"client_legal_name":"ACT0211 Uno","tax_id":"99001","is_active":true}'::jsonb, %s)$q$,
    c1, v_contacts));
  PERFORM pg_temp.expect('el gerente crea por la RPC sin error', v_err, NULL);
  PERFORM pg_temp.expect('alta del gerente por la RPC: nace inactiva aunque pida activa',
    (SELECT is_active::text FROM public.clients WHERE client_id = c1::uuid), 'false');

  v_err := pg_temp.err_rls(u1, format(
    $q$INSERT INTO public.clients (client_id, client_legal_name, tax_id, is_active) VALUES (%L, 'ACT0211 Dos', '99001', true)$q$, c2));
  PERFORM pg_temp.expect('el gerente crea por INSERT directo sin error', v_err, NULL);
  PERFORM pg_temp.expect('alta del gerente por INSERT directo: nace inactiva',
    (SELECT is_active::text FROM public.clients WHERE client_id = c2::uuid), 'false');

  v_err := pg_temp.err_as(u5, format(
    $q$SELECT public.save_client_with_contacts(%L, true, '{"client_legal_name":"ACT0211 Tres","tax_id":"12345","is_active":true}'::jsonb, %s)$q$,
    c3, v_contacts));
  PERFORM pg_temp.expect('admin crea por la RPC sin error', v_err, NULL);
  PERFORM pg_temp.expect('alta de admin: respeta activo',
    (SELECT is_active::text FROM public.clients WHERE client_id = c3::uuid), 'true');
  PERFORM pg_temp.expect('alta activa de admin: queda registrado quién y cuándo',
    (SELECT (activated_by_staff_id = '50211000-0000-4000-8000-000000000005' AND activated_at IS NOT NULL)::text
       FROM public.clients WHERE client_id = c3::uuid), 'true');
  PERFORM pg_temp.expect('alta pendiente: sin datos de activación',
    (SELECT (activated_at IS NULL AND activated_by_staff_id IS NULL)::text FROM public.clients WHERE client_id = c1::uuid), 'true');

  PERFORM pg_temp.expect_like('cambiar is_active sin client.activate se rechaza',
    pg_temp.err_as(u1, format($q$UPDATE public.clients SET is_active = true WHERE client_id = %L$q$, c1)),
    'CLIENT_ACTIVATION_FORBIDDEN%');
  PERFORM pg_temp.expect('editar otro campo sin client.activate sí se permite',
    pg_temp.err_as(u1, format($q$UPDATE public.clients SET address = 'Calle 1' WHERE client_id = %L$q$, c1)), NULL);
  PERFORM pg_temp.expect('el sistema sin sesión (ETL) carga el estado tal cual',
    pg_temp.err_as(NULL, format($q$UPDATE public.clients SET is_active = is_active WHERE client_id = %L$q$, c1)), NULL);

  -- ═════ 2. Sociedad de un cliente sin encargos ════════════════════════════════════════════════
  PERFORM pg_temp.expect('Cobranzas A ve los dos pendientes del gerente A',
    pg_temp.seen(u2, $q$SELECT client_id FROM public.clients WHERE client_legal_name IN ('ACT0211 Uno', 'ACT0211 Dos')$q$),
    c1 || ',' || c2);
  PERFORM pg_temp.expect('Contabilidad A los ve',
    pg_temp.seen(u3, $q$SELECT client_id FROM public.clients WHERE client_legal_name IN ('ACT0211 Uno', 'ACT0211 Dos')$q$),
    c1 || ',' || c2);
  PERFORM pg_temp.expect('Contabilidad B no los ve',
    pg_temp.seen(u4, $q$SELECT client_id FROM public.clients WHERE client_legal_name IN ('ACT0211 Uno', 'ACT0211 Dos')$q$), '');
  PERFORM pg_temp.expect('el directorio aplica el mismo corte (Contabilidad B)',
    pg_temp.seen(u4, $q$SELECT client_id FROM public.clients_directory WHERE client_legal_name IN ('ACT0211 Uno', 'ACT0211 Dos')$q$), '');

  -- ═════ 3. set_client_active ══════════════════════════════════════════════════════════════════
  PERFORM pg_temp.expect_like('el gerente no puede activar',
    pg_temp.err_as(u1, format($q$SELECT public.set_client_active(%L, true)$q$, c1)), 'CLIENT_ACTIVATION_FORBIDDEN%');
  PERFORM pg_temp.expect_like('Contabilidad B no puede activar un cliente de A (no lo encuentra)',
    pg_temp.err_as(u4, format($q$SELECT public.set_client_active(%L, true)$q$, c1)), 'CLIENT_NOT_FOUND%');
  PERFORM pg_temp.expect('Cobranzas A activa',
    pg_temp.err_as(u2, format($q$SELECT public.set_client_active(%L, true)$q$, c1)), NULL);
  PERFORM pg_temp.expect('queda activo',
    (SELECT is_active::text FROM public.clients WHERE client_id = c1::uuid), 'true');
  PERFORM pg_temp.expect('queda registrado que lo activó Cobranzas A',
    (SELECT (activated_by_staff_id = '50211000-0000-4000-8000-000000000002' AND activated_at IS NOT NULL)::text
       FROM public.clients WHERE client_id = c1::uuid), 'true');
  -- Desactivar es solo de admin (2026-11-06): Cobranzas y Contabilidad solo activan.
  PERFORM pg_temp.expect_like('Contabilidad A no puede desactivar',
    pg_temp.err_as(u3, format($q$SELECT public.set_client_active(%L, false)$q$, c1)), 'CLIENT_DEACTIVATION_FORBIDDEN%');
  PERFORM pg_temp.expect_like('ni Cobranzas A',
    pg_temp.err_as(u2, format($q$SELECT public.set_client_active(%L, false)$q$, c1)), 'CLIENT_DEACTIVATION_FORBIDDEN%');
  PERFORM pg_temp.expect_like('tampoco por UPDATE directo (trigger)',
    pg_temp.err_as(u3, format($q$UPDATE public.clients SET is_active = false WHERE client_id = %L$q$, c1)), 'CLIENT_DEACTIVATION_FORBIDDEN%');
  PERFORM pg_temp.expect('admin desactiva y Contabilidad A vuelve a activar',
    COALESCE(pg_temp.err_as(u5, format($q$SELECT public.set_client_active(%L, false)$q$, c1)), '') ||
    COALESCE(pg_temp.err_as(u3, format($q$SELECT public.set_client_active(%L, true)$q$, c1)), ''), '');
  PERFORM pg_temp.expect('tras desactivar (admin) y reactivar (Contabilidad A), figuran los dos',
    (SELECT (activated_by_staff_id = '50211000-0000-4000-8000-000000000003'
             AND deactivated_by_staff_id = '50211000-0000-4000-8000-000000000005'
             AND deactivated_at IS NOT NULL AND activated_at >= deactivated_at)::text
       FROM public.clients WHERE client_id = c1::uuid), 'true');
  PERFORM pg_temp.expect('las columnas de trazabilidad no se escriben a mano',
    COALESCE(pg_temp.err_as(u5, format($q$UPDATE public.clients SET activated_by_staff_id = '50211000-0000-4000-8000-000000000001',
        activated_at = '2000-01-01' WHERE client_id = %L$q$, c1)), '') ||
    (SELECT (activated_by_staff_id = '50211000-0000-4000-8000-000000000003' AND activated_at > '2000-01-01')::text
       FROM public.clients WHERE client_id = c1::uuid), 'true');
  PERFORM pg_temp.expect('anon sin EXECUTE sobre set_client_active',
    has_function_privilege('anon', 'public.set_client_active(uuid, boolean)', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.expect('authenticated sin EXECUTE sobre las funciones de trigger',
    (has_function_privilege('authenticated', 'public.enforce_client_activation()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.enforce_engagement_client_active()', 'EXECUTE'))::text, 'false');

  -- ═════ 4. Encargos solo sobre clientes activos ═══════════════════════════════════════════════
  PERFORM pg_temp.expect_like('admin no crea un encargo sobre un cliente inactivo',
    pg_temp.err_as(u5, format($q$INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
        manager_id, fecha_cierre, society_id) VALUES ('e0211000-0000-4000-8000-000000000002', %L, 'ACT0211 E2', '0211X',
        '50211000-0000-4000-8000-000000000001', '2027-12-31', %L)$q$, c2, v_soc_a)),
    'ENGAGEMENT_CLIENT_INACTIVE%');
  PERFORM pg_temp.expect('el sistema sin sesión (ETL) sí crea un encargo sobre un cliente inactivo',
    pg_temp.err_as(NULL, format($q$INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
        manager_id, fecha_cierre, society_id) VALUES ('e0211000-0000-4000-8000-000000000003', %L, 'ACT0211 E3', '0211Y',
        '50211000-0000-4000-8000-000000000001', '2027-12-31', %L)$q$, c2, v_soc_a)), NULL);
  DELETE FROM public.engagements WHERE engagement_id = 'e0211000-0000-4000-8000-000000000003';
  PERFORM pg_temp.expect('admin crea un encargo de B sobre el cliente activo',
    pg_temp.err_as(u5, format($q$INSERT INTO public.engagements (engagement_id, client_id, engagement_name, engagement_code,
        manager_id, fecha_cierre, society_id) VALUES ('e0211000-0000-4000-8000-000000000001', %L, 'ACT0211 E1', '0211Z',
        '50211000-0000-4000-8000-000000000001', '2027-12-31', %L)$q$, c1, v_soc_b)), NULL);
  PERFORM pg_temp.expect_like('cambiar un encargo a un cliente inactivo se rechaza',
    pg_temp.err_as(u5, format($q$UPDATE public.engagements SET client_id = %L WHERE engagement_id = 'e0211000-0000-4000-8000-0000000000e0'$q$, c2)),
    'ENGAGEMENT_CLIENT_INACTIVE%');
  UPDATE public.clients SET is_active = false WHERE client_id = ce::uuid;  -- sin sesión
  PERFORM pg_temp.expect('editar otro campo de un encargo cuyo cliente se inactivó sigue permitido',
    pg_temp.err_as(u5, $q$UPDATE public.engagements SET engagement_name = 'ACT0211 Encargo editado' WHERE engagement_id = 'e0211000-0000-4000-8000-0000000000e0'$q$),
    NULL);

  -- Con su primer encargo (de B), el cliente pasa a la sociedad del encargo.
  PERFORM pg_temp.expect('con un encargo de B, Cobranzas A ya no ve el cliente',
    pg_temp.seen(u2, format($q$SELECT client_id FROM public.clients WHERE client_id = %L$q$, c1)), '');
  PERFORM pg_temp.expect('y Contabilidad B sí',
    pg_temp.seen(u4, format($q$SELECT client_id FROM public.clients WHERE client_id = %L$q$, c1)), c1);

  -- ═════ 5. Notificaciones ═════════════════════════════════════════════════════════════════════
  PERFORM pg_temp.expect('alta pendiente: admin y los activadores de A, no los de B ni el creador',
    (SELECT string_agg(right(n.recipient_staff_id::text, 1), ',' ORDER BY n.recipient_staff_id::text)
       FROM public.notifications n
      WHERE n.type_key = 'client.pending_activation' AND n.entity_id = c2),
    '2,3,5');
  PERFORM pg_temp.expect('alta pendiente: correo solo a los de alcance society (Cobranzas y Contabilidad A)',
    (SELECT string_agg(right(e.recipient_staff_id::text, 1), ',' ORDER BY e.recipient_staff_id::text)
       FROM public.notification_emails e JOIN public.notifications n ON n.notification_id = e.notification_id
      WHERE n.type_key = 'client.pending_activation' AND n.entity_id = c2),
    '2,3');
  PERFORM pg_temp.expect('el alta pendiente nombra a quien lo registró',
    (SELECT DISTINCT payload->>'creator_name' FROM public.notifications
      WHERE type_key = 'client.pending_activation' AND entity_id = c2), 'ACT0211 Staff1');
  PERFORM pg_temp.expect('el alta activa de admin no genera aviso de pendiente',
    (SELECT count(*)::text FROM public.notifications WHERE type_key = 'client.pending_activation' AND entity_id = c3), '0');
  -- c1 se activó dos veces (Cobranzas A y Contabilidad A), sin encargos todavía: sociedad del creador (A).
  PERFORM pg_temp.expect('activación: al creador, a los activadores de A y a admin; no a B',
    (SELECT string_agg(DISTINCT right(n.recipient_staff_id::text, 1), ',')
       FROM public.notifications n WHERE n.type_key = 'client.activated' AND n.entity_id = c1),
    '1,2,3,5');
  PERFORM pg_temp.expect('el aviso de activación nombra a quien activó',
    (SELECT string_agg(DISTINCT payload->>'activated_by_name', ',' ORDER BY payload->>'activated_by_name')
       FROM public.notifications WHERE type_key = 'client.activated' AND entity_id = c1),
    'ACT0211 Staff2,ACT0211 Staff3');
  PERFORM pg_temp.expect('activación: solo campana, sin correo',
    (SELECT count(*)::text FROM public.notification_emails e JOIN public.notifications n ON n.notification_id = e.notification_id
      WHERE n.type_key = 'client.activated'), '0');
END $$;

DO $$ BEGIN RAISE NOTICE 'CLIENT ACTIVATION 1028-211: ALL CHECKS PASSED (rolled back)'; END $$;

ROLLBACK;
