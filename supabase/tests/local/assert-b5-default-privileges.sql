-- Carril B / B5 — verificación de los privilegios POR DEFECTO que deja 20261013160000_rls_carril_b5_privilegios.sql.
--
-- Lo ejecuta run-rls-tests.sh justo después de aplicar las migraciones y ANTES de restaurar EXECUTE por defecto a PUBLIC para los auxiliares
-- temporales de las suites (ver el runner). Aquí se comprueba el estado de PRODUCCIÓN: lo que `postgres` (el rol de las migraciones) cree desde
-- ahora en `public` nace sin privilegios para anon ni PUBLIC y sin TRUNCATE/REFERENCES/TRIGGER para authenticated.
-- Transacción única, SIEMPRE hace ROLLBACK. Éxito: "B5 DEFAULT PRIVILEGES: OK (rolled back)".
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_row text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'B5 DEFAULT FAIL — esta verificación exige current_user = postgres (es %)', current_user;
  END IF;

  -- 1. Catálogo: el default global de funciones del dueño existe y no incluye a PUBLIC; el de public no incluye a anon ─────────
  SELECT defaclacl::text INTO v_row FROM pg_default_acl
   WHERE defaclrole = 'postgres'::regrole AND defaclnamespace = 0 AND defaclobjtype = 'f';
  IF v_row IS NULL THEN
    RAISE EXCEPTION 'B5 DEFAULT FAIL — no hay default global de funciones para postgres (EXECUTE para PUBLIC sigue implícito)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_default_acl d, LATERAL aclexplode(d.defaclacl) a
              WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f' AND a.grantee = 0) THEN
    RAISE EXCEPTION 'B5 DEFAULT FAIL — el default global de funciones de postgres concede EXECUTE a PUBLIC (%)', v_row;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_default_acl d, LATERAL aclexplode(d.defaclacl) a
              WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype = 'f'
                AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')) THEN
    RAISE EXCEPTION 'B5 DEFAULT FAIL — el default de funciones en public concede EXECUTE a anon';
  END IF;
END $$;

-- 2. Funcional: lo que se crea ahora nace sin los privilegios de más ─────────────────────────────────────────────────────────
CREATE TABLE public.zz_b5_nueva (id int);
CREATE SEQUENCE public.zz_b5_seq;
CREATE FUNCTION public.zz_b5_fn() RETURNS int LANGUAGE sql STABLE SET search_path TO 'public' AS 'SELECT 1';

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.zz_b5_nueva', 'SELECT') OR has_table_privilege('anon', 'public.zz_b5_nueva', 'INSERT')
     OR has_table_privilege('anon', 'public.zz_b5_nueva', 'TRUNCATE') OR has_sequence_privilege('anon', 'public.zz_b5_seq', 'USAGE') THEN
    RAISE EXCEPTION 'B5 DEFAULT FAIL — una tabla o secuencia nueva nace con privilegios para anon';
  END IF;
  IF has_table_privilege('authenticated', 'public.zz_b5_nueva', 'TRUNCATE') OR has_table_privilege('authenticated', 'public.zz_b5_nueva', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.zz_b5_nueva', 'TRIGGER') THEN
    RAISE EXCEPTION 'B5 DEFAULT FAIL — una tabla nueva nace con TRUNCATE/REFERENCES/TRIGGER para authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.zz_b5_fn()', 'EXECUTE') OR has_function_privilege('public', 'public.zz_b5_fn()', 'EXECUTE') THEN
    RAISE EXCEPTION 'B5 DEFAULT FAIL — una función nueva nace ejecutable por anon o PUBLIC';
  END IF;
  -- no-vacuidad: authenticated y service_role SÍ pueden ejecutar lo nuevo (el default no es «nada»)
  IF NOT has_function_privilege('authenticated', 'public.zz_b5_fn()', 'EXECUTE') OR NOT has_function_privilege('service_role', 'public.zz_b5_fn()', 'EXECUTE') THEN
    RAISE EXCEPTION 'B5 DEFAULT FAIL — una función nueva no es ejecutable por authenticated o service_role (el default quedó en «nada»)';
  END IF;
  RAISE NOTICE 'B5 DEFAULT PRIVILEGES: OK (rolled back)';
END $$;

ROLLBACK;
