-- Carril B, etapa B5 del barrido RLS: privilegios de tablas y funciones, search_path y privilegios por defecto. BAR-017, BAR-018, BAR-008 (residual).
-- Resumen y decisiones: docs/seguridad/registro-seguridad-rls.md. Idempotente (REVOKE/GRANT repetibles, ALTER FUNCTION ... SET y ALTER DEFAULT
-- PRIVILEGES repetibles): se aplica primero a mano en Dev 2.0 para probar y después con `db push`.
--
-- Contexto (medido en Dev 2.0 el 13/10/2026, E-51 y E-52):
--   · La RLS es lo único que frenaba a `anon` en 24 tablas: conserva INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN y TRUNCATE no
--     consulta la RLS (VERIFICADO: `anon` ejecutó TRUNCATE sobre holidays en una transacción revertida). `authenticated` tiene TRUNCATE,
--     REFERENCES, TRIGGER y MAINTAIN en 42 a 44 tablas, que ningún flujo usa.
--   · Toda función nace con EXECUTE para PUBLIC y, por los privilegios por defecto de postgres en public, para `anon`: 120 de 236 funciones eran
--     ejecutables por `anon` y 37 (no de trigger) respondían sin error a una llamada anónima real. Doce son DEFINER sin guardia que aceptan un
--     id sin validar al llamador (tres devolvieron horas y estados reales; el resto, booleanos o NULL: get_week_statuses, get_my_pending_hours, check_pending_hours_before_termination, has_role,
--     get_timesheet_approvers, can_approve_timesheet*, get_line_approver, is_auto_approved_category, engagement_allows_hours_or_requests,
--     engagement_is_approved_state, fr_is_submitted). Las 9 funciones que nombraba el plan de B5 ya rechazaban a `anon` por dentro.
--   · 14 funciones INVOKER (10 de trigger) no fijaban search_path; las DEFINER ya lo fijan todas.
--   · Ningún flujo anterior al login usa tablas ni funciones de `anon`: el login pasa por Edge Functions con service_role y lo único que lee
--     `anon` por la API son tres claves de global_settings. Storage: buckets privados y políticas solo TO authenticated.
--
-- Qué cambia:
--   1. Tablas, vistas y secuencias de public: `anon` sin nada (salvo SELECT de global_settings); `authenticated` pierde TRUNCATE, REFERENCES,
--      TRIGGER y MAINTAIN y conserva SELECT/INSERT/UPDATE/DELETE (la RLS decide). NUNCA se hace REVOKE ALL a authenticated: el REVOKE a nivel de
--      tabla también retira los privilegios por columna, y staff protege su PII con SELECT por columna.
--   2. Funciones de public: primero se concede EXPLÍCITO a authenticated y a service_role lo que ya ejecutan (aunque fuera por PUBLIC) y después
--      se retiran PUBLIC y anon. authenticated y service_role ejecutan EXACTAMENTE el mismo conjunto que antes. service_role importa: secure-signin
--      falla en ABIERTO si check_login_allowed da error, así que perder ese EXECUTE desactivaría en silencio el bloqueo de cuentas.
--   3. search_path = public en toda función de public que no lo tuviera.
--   4. Privilegios por defecto del dueño (postgres) en public: lo que se cree desde ahora nace sin los privilegios de más. Cubre lo que crea
--      `postgres` (las migraciones); lo que cree otro rol lo vigila el check 19 de schema-convergence-assertions.sql.

-- 0. Guardas ────────────────────────────────────────────────────────────────────────────────────────────────────────
-- El SELECT de anon sobre global_settings solo es seguro con la RLS activa y la política que acota a tres claves.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.global_settings'::regclass) THEN
    RAISE EXCEPTION 'B5: public.global_settings no tiene RLS; conceder SELECT a anon expondria toda la configuracion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'global_settings'
                  AND policyname = 'anon reads login settings' AND cmd = 'SELECT') THEN
    RAISE EXCEPTION 'B5: falta la politica "anon reads login settings" en global_settings';
  END IF;
END $$;

-- 1. Tablas, vistas y secuencias ────────────────────────────────────────────────────────────────────────────────────
-- MAINTAIN es de PostgreSQL 17 (Supabase y el CI usan 17); en una versión anterior el privilegio no existe y no hay nada que retirar.
DO $$
DECLARE
  o record;
  v_priv text := CASE WHEN current_setting('server_version_num')::int >= 170000
                      THEN 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN' ELSE 'TRUNCATE, REFERENCES, TRIGGER' END;
BEGIN
  FOR o IN SELECT c.oid::regclass AS r, c.relkind FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'S') LOOP
    IF o.relkind = 'S' THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon', o.r);
    ELSIF o.relkind IN ('r', 'p') THEN
      EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon', o.r);
      EXECUTE format('REVOKE %s ON TABLE %s FROM authenticated', v_priv, o.r);
    ELSE
      EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon', o.r);
    END IF;
  END LOOP;
END $$;
-- La pantalla de login lee tres claves sin sesión (política «anon reads login settings»).
GRANT SELECT ON public.global_settings TO anon;

-- 2. Funciones ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- Una función nace con EXECUTE para PUBLIC. Se conserva lo que authenticated y service_role ya ejecutan ANTES de retirar PUBLIC y anon.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS r,
                  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS a,
                  has_function_privilege('service_role', p.oid, 'EXECUTE') AS s
             FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p') LOOP
    IF f.a THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.r); END IF;
    IF f.s THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.r); END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.r);
  END LOOP;
END $$;

-- 3. search_path fijo ───────────────────────────────────────────────────────────────────────────────────────────────
-- Una función sin search_path resuelve los nombres con el del llamador. Las DEFINER ya lo tienen; aquí quedan las INVOKER.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS r FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p')
              AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%') LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO ''public''', f.r);
  END LOOP;
END $$;

-- 4. Privilegios por defecto ────────────────────────────────────────────────────────────────────────────────────────
-- Lo que cree `postgres` en public nace sin TRUNCATE/REFERENCES/TRIGGER/MAINTAIN para authenticated, sin nada para anon y sin EXECUTE para
-- PUBLIC ni anon (authenticated y service_role conservan su entrada por defecto).
DO $$
DECLARE
  v_priv text := CASE WHEN current_setting('server_version_num')::int >= 170000
                      THEN 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN' ELSE 'TRUNCATE, REFERENCES, TRIGGER' END;
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE %s ON TABLES FROM authenticated', v_priv);
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
END $$;
