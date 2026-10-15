-- Carril B / B5 — privilegios de tablas y funciones, search_path y privilegios por defecto
-- (20261013160000_rls_carril_b5_privilegios.sql)
--
-- Corre desde supabase/tests/local/run-rls-tests.sh, después de B4. Transacción única, SIEMPRE hace ROLLBACK.
-- Salida de éxito: una NOTICE por chequeo, terminando en "B5 PRIVILEGIOS: ALL CHECKS PASSED (rolled back)".
--
-- Qué se prueba: (a) la ACL estática de TODAS las relaciones y funciones de public; (b) el comportamiento real con `SET LOCAL ROLE anon`,
-- `authenticated` y `service_role`; (c) [los privilegios por defecto se verifican en el runner, antes de restaurar el default para los auxiliares pg_temp];
-- (d) que authenticated y service_role CONSERVAN lo que necesitan (no-vacuidad: el arreglo no es «quitar todo»): secure-signin falla en
-- abierto si service_role pierde check_login_allowed, y un REVOKE ALL a authenticated borraría el SELECT por columna de staff (PII).

BEGIN;

INSERT INTO auth.users (id) VALUES ('a0b50000-0000-4000-8000-000000000001');
INSERT INTO public.user_roles (user_id, role, role_key) VALUES ('a0b50000-0000-4000-8000-000000000001', 'admin', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, role_key = EXCLUDED.role_key;
INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, practica_id, society_id)
VALUES ('50b50000-0000-4000-8000-000000000001', 'a0b50000-0000-4000-8000-000000000001', 'U1', 'B5',
        (SELECT practica_id FROM public.practicas WHERE code = 1),
        (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

-- Intento como anon / authenticated / service_role: devuelve 'OK' o 'ERR <sqlstate>'; el claim se limpia siempre.
CREATE FUNCTION pg_temp.try_role(p_role text, p_sub text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN json_build_object('role', p_role)::text ELSE json_build_object('sub', p_sub, 'role', p_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN 'ERR ' || SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN 'OK';
END $$;

DO $$
DECLARE
  u constant text := 'a0b50000-0000-4000-8000-000000000001';
  v_list text; v_n bigint; v_r text; v_owner bigint; v_anon bigint; f text; v_ok boolean;
  v_anon_oid oid := (SELECT oid FROM pg_roles WHERE rolname = 'anon');
  v_auth_oid oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  -- 0. Premisa: la política que acota a anon a tres claves existe y global_settings tiene RLS ───────────────────────────
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.global_settings'::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'global_settings' AND policyname = 'anon reads login settings') THEN
    RAISE EXCEPTION 'B5 FAIL — premisa: global_settings con RLS y la política «anon reads login settings»';
  END IF;
  RAISE NOTICE 'PASS — 0. premisas';

  -- 1. ACL estática de las relaciones: anon solo SELECT de global_settings; nada para PUBLIC ───────────────────────────────
  SELECT string_agg(c.relname || ':' || a.privilege_type, ', ' ORDER BY c.relname) INTO v_list
    FROM pg_class c, LATERAL aclexplode(c.relacl) a
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
     AND (a.grantee = 0 OR a.grantee = v_anon_oid)
     AND NOT (c.relname = 'global_settings' AND a.privilege_type = 'SELECT' AND a.grantee = v_anon_oid);
  IF v_list IS NOT NULL THEN RAISE EXCEPTION 'B5 FAIL — anon o PUBLIC conservan privilegios sobre relaciones de public: %', v_list; END IF;
  SELECT string_agg(c.relname || '.' || at.attname, ', ') INTO v_list
    FROM pg_attribute at JOIN pg_class c ON c.oid = at.attrelid, LATERAL aclexplode(at.attacl) a
   WHERE c.relnamespace = 'public'::regnamespace AND at.attacl IS NOT NULL AND (a.grantee = 0 OR a.grantee = v_anon_oid);
  IF v_list IS NOT NULL THEN RAISE EXCEPTION 'B5 FAIL — anon o PUBLIC conservan privilegios por columna: %', v_list; END IF;
  IF NOT has_table_privilege('anon', 'public.global_settings', 'SELECT') THEN
    RAISE EXCEPTION 'B5 FAIL — anon perdió SELECT sobre global_settings (la pantalla de login lo lee sin sesión)';
  END IF;
  RAISE NOTICE 'PASS — 1. anon sin privilegios en public salvo SELECT de global_settings; PUBLIC sin nada';

  -- 2. authenticated: sin TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, pero conserva lo que la RLS administra ─────────────────────
  SELECT string_agg(c.relname || ':' || a.privilege_type, ', ' ORDER BY c.relname) INTO v_list
    FROM pg_class c, LATERAL aclexplode(c.relacl) a
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND a.grantee = v_auth_oid
     AND a.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN');
  IF v_list IS NOT NULL THEN RAISE EXCEPTION 'B5 FAIL — authenticated conserva privilegios de más en tablas: %', left(v_list, 300); END IF;
  FOREACH f IN ARRAY ARRAY['engagements', 'time_entries', 'work_orders', 'clients'] LOOP
    IF NOT (has_table_privilege('authenticated', 'public.' || f, 'SELECT') AND has_table_privilege('authenticated', 'public.' || f, 'INSERT')
            AND has_table_privilege('authenticated', 'public.' || f, 'UPDATE') AND has_table_privilege('authenticated', 'public.' || f, 'DELETE')) THEN
      RAISE EXCEPTION 'B5 FAIL — authenticated perdió SELECT/INSERT/UPDATE/DELETE sobre % (la RLS decide; el privilegio debe estar)', f;
    END IF;
  END LOOP;
  -- staff: el SELECT por columna sigue (un REVOKE ALL a authenticated lo habría borrado) y la PII sigue cerrada
  IF has_table_privilege('authenticated', 'public.staff', 'SELECT')
     OR has_column_privilege('authenticated', 'public.staff', 'id_number', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.staff', 'first_name', 'SELECT') THEN
    RAISE EXCEPTION 'B5 FAIL — staff: SELECT por columna de authenticated alterado (PII abierta o lectura básica perdida)';
  END IF;
  RAISE NOTICE 'PASS — 2. authenticated sin TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, con DML en las tablas con RLS y el SELECT por columna de staff intacto';

  -- 3. Funciones: anon y PUBLIC sin EXECUTE; authenticated y service_role conservan lo suyo ───────────────────────────────
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.proname) INTO v_list
    FROM pg_proc p, LATERAL aclexplode(p.proacl) a
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p') AND a.privilege_type = 'EXECUTE' AND (a.grantee = 0 OR a.grantee = v_anon_oid);
  IF v_list IS NOT NULL THEN RAISE EXCEPTION 'B5 FAIL — funciones de public con EXECUTE para anon o PUBLIC: %', left(v_list, 300); END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p') AND p.proacl IS NULL) THEN
    RAISE EXCEPTION 'B5 FAIL — hay funciones de public con ACL implícita (EXECUTE para PUBLIC)';
  END IF;
  -- lo que authenticated necesita (la app y las políticas lo llaman)
  FOREACH f IN ARRAY ARRAY['has_permission', 'is_admin', 'get_my_staff_id', 'current_role_key', 'permission_scope', 'get_my_authorization_context',
                           'list_loggable_engagements', 'get_week_statuses', 'get_my_pending_hours', 'my_visible_engagement_ids'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = f) THEN
      RAISE EXCEPTION 'B5 FAIL — la función % ya no existe (lista de la suite desactualizada)', f;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')) THEN
      RAISE EXCEPTION 'B5 FAIL — authenticated perdió EXECUTE sobre % (la app lo necesita)', f;
    END IF;
  END LOOP;
  -- lo que service_role necesita (secure-signin y las Edge Functions); ojo: secure-signin falla en ABIERTO si check_login_allowed da error
  FOREACH f IN ARRAY ARRAY['check_login_allowed', 'record_failed_login', 'claim_auth_email_slot', 'release_auth_email_slot', 'get_week_statuses',
                           'finalize_all_stale_timers', 'assign_user_role_atomic'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = f) THEN
      RAISE EXCEPTION 'B5 FAIL — la función % ya no existe (lista de la suite desactualizada)', f;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')) THEN
      RAISE EXCEPTION 'B5 FAIL — service_role perdió EXECUTE sobre % (secure-signin y las Edge Functions lo necesitan)', f;
    END IF;
  END LOOP;
  -- lo que ya NO podía authenticated sigue sin poder (B5 no abre nada)
  FOREACH f IN ARRAY ARRAY['check_login_allowed', 'record_failed_login', 'assign_user_role_atomic', 'claim_auth_email_slot', 'finalize_due_engagements'] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) THEN
      RAISE EXCEPTION 'B5 FAIL — authenticated ejecuta %, que era solo de service_role', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS — 3. ninguna función de public ejecutable por anon ni PUBLIC; authenticated y service_role conservan lo suyo y B5 no abre nada nuevo';

  -- 4. search_path fijo en TODA función de public ─────────────────────────────────────────────────────────────────────────
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_list FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p')
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');
  IF v_list IS NOT NULL THEN RAISE EXCEPTION 'B5 FAIL — funciones de public sin search_path fijo: %', left(v_list, 300); END IF;
  RAISE NOTICE 'PASS — 4. toda función de public tiene search_path fijo';

  -- 5. (Privilegios por defecto: se verifican en supabase/tests/local/assert-b5-default-privileges.sql, que el runner ejecuta justo después
  --     de las migraciones y ANTES de restaurar EXECUTE por defecto a PUBLIC para los auxiliares pg_temp de las suites. Aquí, con ese default
  --     restaurado, una función nueva nacería ejecutable por PUBLIC y la prueba no sería la de producción.)

  -- 6. anon real ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  -- global_settings: SOLO las tres claves del login (oráculo: filas con esas claves, calculadas como dueño)
  SELECT count(*) INTO v_owner FROM public.global_settings WHERE setting_key IN ('LANGUAGE', 'COMPACT_FONT', 'ALLOWED_EMAIL_DOMAIN');
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_anon FROM public.global_settings;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  IF v_anon <> v_owner THEN RAISE EXCEPTION 'B5 FAIL — anon lee % filas de global_settings y solo debería leer las % del login', v_anon, v_owner; END IF;
  FOREACH f IN ARRAY ARRAY['SELECT count(*) FROM public.holidays', 'TRUNCATE public.holidays', 'DELETE FROM public.holidays',
                           'INSERT INTO public.holidays DEFAULT VALUES', 'SELECT count(*) FROM public.work_orders', 'SELECT count(*) FROM public.staff_alert_seen',
                           'TRUNCATE public.global_settings', 'UPDATE public.global_settings SET setting_key = setting_key',
                           'SELECT public.is_admin()', 'SELECT public.has_permission(''x'')', 'SELECT public.get_my_staff_id()',
                           'SELECT public.has_role(gen_random_uuid(), ''admin''::public.app_role)',
                           'SELECT public.get_week_statuses(gen_random_uuid(), current_date - 7, current_date)',
                           'SELECT public.get_my_pending_hours(gen_random_uuid())',
                           'SELECT public.check_pending_hours_before_termination(gen_random_uuid(), current_date)',
                           'SELECT count(*) FROM public.list_loggable_engagements()'] LOOP
    v_r := pg_temp.try_role('anon', NULL, f);
    IF v_r <> 'ERR 42501' THEN RAISE EXCEPTION 'B5 FAIL — anon: % dio % (esperado ERR 42501)', left(f, 70), v_r; END IF;
  END LOOP;
  RAISE NOTICE 'PASS — 6. anon real: lee solo las claves del login (% filas) y recibe 42501 en tablas, TRUNCATE y funciones', v_anon;

  -- 7. authenticated real: lo legítimo funciona; TRUNCATE y la PII no ──────────────────────────────────────────────────────
  IF pg_temp.try_role('authenticated', u, 'SELECT public.has_permission(''engagement.read'')') <> 'OK'
     OR pg_temp.try_role('authenticated', u, 'SELECT public.get_my_authorization_context()') <> 'OK'
     OR pg_temp.try_role('authenticated', u, 'SELECT count(*) FROM public.engagements') <> 'OK'
     OR pg_temp.try_role('authenticated', u, 'SELECT count(*) FROM public.my_visible_engagement_ids()') <> 'OK'
     OR pg_temp.try_role('authenticated', u, 'SELECT first_name FROM public.staff LIMIT 1') <> 'OK' THEN
    RAISE EXCEPTION 'B5 FAIL — authenticated no puede ejecutar o leer algo legítimo (función, tabla con RLS o columna básica de staff)';
  END IF;
  FOREACH f IN ARRAY ARRAY['TRUNCATE public.holidays', 'TRUNCATE public.engagements', 'SELECT id_number FROM public.staff LIMIT 1',
                           'SELECT public.check_login_allowed(''x@example.invalid'')'] LOOP
    v_r := pg_temp.try_role('authenticated', u, f);
    IF v_r <> 'ERR 42501' THEN RAISE EXCEPTION 'B5 FAIL — authenticated: % dio % (esperado ERR 42501)', left(f, 70), v_r; END IF;
  END LOOP;
  RAISE NOTICE 'PASS — 7. authenticated real: ejecuta y lee lo legítimo; TRUNCATE, la PII de staff y las funciones solo de service_role dan 42501';

  -- 8. service_role real: el bloqueo de cuentas y las lecturas de las Edge Functions ────────────────────────────────────────
  FOREACH f IN ARRAY ARRAY['SELECT public.check_login_allowed(''x@example.invalid'')', 'SELECT public.record_failed_login(''x@example.invalid'')',
                           'SELECT count(*) FROM public.engagement_wo_state', 'SELECT count(*) FROM public.engagements'] LOOP
    v_r := pg_temp.try_role('service_role', NULL, f);
    IF v_r <> 'OK' THEN RAISE EXCEPTION 'B5 FAIL — service_role: % dio % (secure-signin y las Edge Functions lo necesitan)', left(f, 70), v_r; END IF;
  END LOOP;
  RAISE NOTICE 'PASS — 8. service_role ejecuta check_login_allowed y record_failed_login y lee las vistas y tablas de las Edge Functions';

  -- 9. Un trigger dispara aunque quien escribe no tenga EXECUTE sobre su función (así sigue funcionando handle_new_user para GoTrue) ─
  CREATE ROLE b5_probe NOLOGIN;
  EXECUTE format('GRANT b5_probe TO %I WITH SET TRUE', current_user);
  CREATE TABLE public.zz_b5_t (id int);
  CREATE TABLE public.zz_b5_log (msg text);
  CREATE FUNCTION public.zz_b5_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $f$ BEGIN INSERT INTO public.zz_b5_log VALUES ('disparo'); RETURN NEW; END $f$;
  CREATE TRIGGER zz_b5 AFTER INSERT ON public.zz_b5_t FOR EACH ROW EXECUTE FUNCTION public.zz_b5_trg();
  REVOKE ALL ON FUNCTION public.zz_b5_trg() FROM PUBLIC;
  GRANT INSERT ON public.zz_b5_t TO b5_probe;
  IF has_function_privilege('b5_probe', 'public.zz_b5_trg()', 'EXECUTE') THEN RAISE EXCEPTION 'B5 FAIL — premisa de la prueba del trigger'; END IF;
  EXECUTE 'SET LOCAL ROLE b5_probe';
  INSERT INTO public.zz_b5_t VALUES (1);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_n FROM public.zz_b5_log;
  IF v_n <> 1 THEN RAISE EXCEPTION 'B5 FAIL — el trigger no disparó para un rol sin EXECUTE sobre su función (% veces)', v_n; END IF;
  RAISE NOTICE 'PASS — 9. un trigger dispara aunque quien escribe no tenga EXECUTE sobre su función';

  RAISE NOTICE 'B5 PRIVILEGIOS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
