--
-- PostgreSQL database dump
--

\restrict w4uXMruUdDQEs1GJbZ5gXP58DIdGNteN2CzBStn7HNDAeX0nXoTgJsg8GBM9OLb

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: _realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA _realtime;


--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: pg_cron; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;


--
-- Name: EXTENSION pg_cron; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL';


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_net; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_net IS 'Async HTTP';


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: supabase_functions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_functions;


--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- Name: EXTENSION pg_graphql; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_graphql IS 'pg_graphql: GraphQL support';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'staff',
    'viewer',
    'partner',
    'director',
    'manager',
    'senior',
    'semisenior',
    'sqr',
    'specialist_it',
    'specialist_tax'
);


--
-- Name: fr_wo_approval_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fr_wo_approval_status AS ENUM (
    'pendiente',
    'aprobado',
    'observado',
    'rechazado'
);


--
-- Name: fund_request_expense_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fund_request_expense_status AS ENUM (
    'borrador',
    'pendiente_aprobacion',
    'aprobado_gerente',
    'observado',
    'rechazado',
    'revisado_asistente'
);


--
-- Name: fund_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fund_request_status AS ENUM (
    'borrador',
    'pendiente_aprobacion',
    'aprobado_gerente',
    'observado',
    'rechazado',
    'fondos_entregados',
    'en_liquidacion',
    'cerrado',
    'cancelado'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
    ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

    ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
    ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

    REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

    GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
begin
    raise debug 'PgBouncer auth request: %', p_usename;

    return query
    select 
        rolname::text, 
        case when rolvaliduntil < now() 
            then null 
            else rolpassword::text 
        end 
    from pg_authid 
    where rolname=$1 and rolcanlogin;
end;
$_$;


--
-- Name: admin_set_user_role(uuid, public.app_role, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_user_role(p_target_user_id uuid, p_new_role public.app_role, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_old_role app_role; v_admin_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(67890);
  IF NOT has_role(v_caller_id, 'admin') THEN
    RETURN jsonb_build_object('success',false,'code','NOT_ADMIN','message','Only admins can change roles');
  END IF;
  IF v_caller_id = p_target_user_id THEN
    RETURN jsonb_build_object('success',false,'code','SELF_CHANGE','message','Cannot change own role');
  END IF;
  SELECT role INTO v_old_role FROM user_roles WHERE user_id = p_target_user_id FOR UPDATE;
  IF v_old_role IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','USER_NOT_FOUND','message','User role not found');
  END IF;
  IF v_old_role = p_new_role THEN
    RETURN jsonb_build_object('success',true,'code','ALREADY_SET','message','Role already set',
      'old_role',v_old_role::text,'new_role',p_new_role::text);
  END IF;
  IF v_old_role = 'admin' AND p_new_role != 'admin' THEN
    SELECT count(*) INTO v_admin_count FROM user_roles WHERE role = 'admin';
    IF v_admin_count <= 1 THEN
      RETURN jsonb_build_object('success',false,'code','LAST_ADMIN','message','Cannot remove the last admin');
    END IF;
  END IF;
  UPDATE user_roles SET role = p_new_role WHERE user_id = p_target_user_id;
  INSERT INTO user_lifecycle_audit_log (actor_user_id, target_user_id, action, old_role, new_role, reason)
  VALUES (v_caller_id, p_target_user_id, 'role_change', v_old_role, p_new_role, p_reason);
  RETURN jsonb_build_object('success',true,'code','UPDATED','message','Role updated',
    'old_role',v_old_role::text,'new_role',p_new_role::text);
END; $$;


--
-- Name: admin_set_user_role_key(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_user_role_key(p_target_user_id uuid, p_new_role_key text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_caller_id      uuid := auth.uid();
  v_is_admin       boolean;
  v_old_role       app_role;
  v_old_role_key   text;
  v_new_legacy     app_role;
  v_admin_count    integer;
begin
  -- Serializa con admin_set_user_role (mismo lock) para que el guard de
  -- "último admin" no pueda ser sorteado por dos cambios concurrentes.
  perform pg_advisory_xact_lock(67890);

  -- Admin por role_key (autoridad actual) o por el enum legacy, para no
  -- quedar bloqueados si algún admin aún no tiene role_key.
  select exists (
    select 1 from user_roles
    where user_id = v_caller_id
      and (role_key = 'admin' or role = 'admin')
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object('success', false, 'code', 'NOT_ADMIN',
      'message', 'Only admins can change roles');
  end if;

  if v_caller_id = p_target_user_id then
    return jsonb_build_object('success', false, 'code', 'SELF_CHANGE',
      'message', 'Cannot change own role');
  end if;

  -- El rol destino debe existir en el catálogo, estar activo y declarar su
  -- espejo legacy (si no, no sabríamos qué poner en user_roles.role).
  select legacy_app_role into v_new_legacy
  from authorization_roles
  where role_key = p_new_role_key and is_active;

  if not found then
    return jsonb_build_object('success', false, 'code', 'INVALID_ROLE',
      'message', format('Unknown or inactive role_key: %s', p_new_role_key));
  end if;

  if v_new_legacy is null then
    return jsonb_build_object('success', false, 'code', 'ROLE_NOT_MAPPED',
      'message', format('role_key %s has no legacy_app_role mapping', p_new_role_key));
  end if;

  select role, role_key into v_old_role, v_old_role_key
  from user_roles
  where user_id = p_target_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'USER_NOT_FOUND',
      'message', 'User role not found');
  end if;

  if v_old_role_key = p_new_role_key then
    return jsonb_build_object('success', true, 'code', 'ALREADY_SET',
      'message', 'Role already set',
      'old_role_key', v_old_role_key, 'new_role_key', p_new_role_key);
  end if;

  -- Guard de último admin, ahora sobre role_key (la autoridad del motor).
  if v_old_role_key = 'admin' and p_new_role_key <> 'admin' then
    select count(*) into v_admin_count from user_roles where role_key = 'admin';
    if v_admin_count <= 1 then
      return jsonb_build_object('success', false, 'code', 'LAST_ADMIN',
        'message', 'Cannot remove the last admin');
    end if;
  end if;

  update user_roles
  set role_key = p_new_role_key,
      role     = v_new_legacy
  where user_id = p_target_user_id;

  insert into user_lifecycle_audit_log
    (actor_user_id, target_user_id, action, old_role, new_role,
     old_role_key, new_role_key, reason)
  values
    (v_caller_id, p_target_user_id, 'role_key_change', v_old_role, v_new_legacy,
     v_old_role_key, p_new_role_key, p_reason);

  return jsonb_build_object('success', true, 'code', 'UPDATED',
    'message', 'Role updated',
    'old_role_key', v_old_role_key, 'new_role_key', p_new_role_key,
    'legacy_role', v_new_legacy::text);
end;
$$;


--
-- Name: FUNCTION admin_set_user_role_key(p_target_user_id uuid, p_new_role_key text, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_set_user_role_key(p_target_user_id uuid, p_new_role_key text, p_reason text) IS 'Asigna un role_key del catálogo (23 roles) y espeja el enum legacy. Reemplaza a admin_set_user_role, que solo escribía el enum.';


--
-- Name: admin_unblock_account(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_unblock_account(p_staff_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email text;
BEGIN
  -- Resolve email from staff record.
  SELECT lower(trim(email)) INTO v_email
  FROM public.staff
  WHERE staff_id = p_staff_id
    AND deleted_at IS NULL;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'STAFF_NOT_FOUND');
  END IF;

  -- Clear the persistent blocked flag. Authorize the write past
  -- prevent_self_blocked_change() (this RPC is service_role-only, so auth.uid()
  -- is already NULL, but the flag keeps the trusted-writer contract uniform).
  PERFORM set_config('app.allow_blocked_change', 'on', true);
  UPDATE public.staff
  SET is_blocked = false
  WHERE staff_id = p_staff_id;

  -- Clear the lockout row so the user is not stuck behind locked_until.
  DELETE FROM public.auth_login_attempts
  WHERE email_normalized = v_email;

  RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$$;


--
-- Name: assign_user_role_atomic(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_user_role_atomic(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_role_count integer;
  v_assigned_role text;
  v_assigned_role_key text;
  v_existing_role text;
begin
  -- Lock para evitar carrera en el chequeo de primer-usuario.
  perform pg_advisory_xact_lock(12345);

  select role::text into v_existing_role
  from user_roles
  where user_id = p_user_id;

  if v_existing_role is not null then
    return jsonb_build_object(
      'role', v_existing_role,
      'isFirstUser', false,
      'message', 'Role already assigned'
    );
  end if;

  select count(*) into v_role_count from user_roles;

  -- Primer usuario = admin (bootstrap); el resto = staff/assistant.
  if v_role_count = 0 then
    v_assigned_role     := 'admin';
    v_assigned_role_key := 'admin';
  else
    v_assigned_role     := 'staff';
    v_assigned_role_key := 'assistant';   -- role_key equivalente (Fase 1 backfill)
  end if;

  -- Ahora setea AMBOS: role (enum legacy) y role_key (motor de autorización).
  insert into user_roles (user_id, role, role_key)
  values (p_user_id, v_assigned_role::app_role, v_assigned_role_key);

  return jsonb_build_object(
    'role', v_assigned_role,
    'role_key', v_assigned_role_key,
    'isFirstUser', v_role_count = 0
  );
end;
$$;


--
-- Name: authorize_engagement_state_override(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.authorize_engagement_state_override() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Sistema (cron/service_role/definer sin sesión): sin auth.uid() → permitir.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.engagement_state_override is not null and not public.is_admin() then
      raise exception 'No autorizado a fijar el estado del encargo';
    end if;
    return new;
  end if;

  -- Decisión A: bloqueo server-side de edición de fechas por no-admin cuando el
  -- estado actual es terminal (override 6/7). Se evalúa aunque el override no
  -- cambie. 0817-179: el 9 salió de la lista junto con el estado.
  if not public.is_admin()
     and old.engagement_state_override in (6, 7)
     and (
       new.start_date    is distinct from old.start_date
       or new.end_date   is distinct from old.end_date
       or new.fecha_cierre is distinct from old.fecha_cierre
     )
  then
    raise exception 'No autorizado a editar fechas de un encargo Cancelado/Finalizado';
  end if;

  -- UPDATE: validación del override solo si cambia.
  if new.engagement_state_override is not distinct from old.engagement_state_override then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  -- 0817-179: acá vivía la única excepción para no-admin (Gerente DEL encargo congelando o
  -- descongelando, null<->9). Retirado el estado 9, no queda ningún cambio de override
  -- permitido a un no-admin, así que se cae directo al rechazo.
  raise exception 'No autorizado a cambiar el estado del encargo (override)';
end;
$$;


--
-- Name: FUNCTION authorize_engagement_state_override(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.authorize_engagement_state_override() IS 'Guard del estado del encargo. Admin: control total. No-admin: no puede fijar ni cambiar el override, ni editar fechas de un encargo Cancelado/Finalizado (6/7). BUG 0817-179: se retiró el estado 9 Congelado y con él la excepción de congelar/descongelar del Gerente.';


--
-- Name: batch_upsert_worksheet_cells(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch_upsert_worksheet_cells(p_worksheet_id uuid, p_cells jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_engagement_id uuid;
  v_practica      smallint;
  v_practica_id   uuid;
  v_invalid_count integer;
begin
  select aw.engagement_id, e.practica
    into v_engagement_id, v_practica
    from public.activity_worksheets aw
    join public.engagements e on e.engagement_id = aw.engagement_id
   where aw.id = p_worksheet_id;

  if v_engagement_id is null then
    raise exception 'Worksheet not found: %', p_worksheet_id;
  end if;

  if not (public.is_admin() or public.is_engagement_team_member(v_engagement_id)) then
    raise exception 'Permission denied: not a team member of this engagement'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_array_length(p_cells) > 0 then
    if v_practica is null then
      raise exception using
        message = 'WORKSHEET_PRACTICE_REQUIRED',
        detail = format('worksheet_id=%s reason=no_practica', p_worksheet_id);
    end if;

    select practica_id into v_practica_id
      from public.practicas
     where code = v_practica;

    -- Same precedence as the trigger: an unresolved practica code is treated
    -- the same as no practica at all (review.md iteración 1, #3).
    if v_practica_id is null then
      raise exception using
        message = 'WORKSHEET_PRACTICE_REQUIRED',
        detail = format('worksheet_id=%s reason=unresolved_practica_code practica_code=%s', p_worksheet_id, v_practica);
    end if;

    select count(*) into v_invalid_count
      from jsonb_array_elements(p_cells) as elem
      left join public.categories c on c.category_id = (elem->>'category_id')::uuid
     where c.practica_id is distinct from v_practica_id;

    if v_invalid_count > 0 then
      raise exception using
        message = 'WORKSHEET_CATEGORY_OUT_OF_SCOPE',
        detail = format('worksheet_id=%s', p_worksheet_id);
    end if;

    -- is_system is checked independently of practica_id, same rule as the
    -- trigger (review.md iteración 1, #2).
    select count(*) into v_invalid_count
      from jsonb_array_elements(p_cells) as elem
      left join public.activity_codes a on a.activity_id = (elem->>'activity_id')::uuid
     where a.practica_id is distinct from v_practica_id
        or a.is_system is not false;

    if v_invalid_count > 0 then
      raise exception using
        message = 'WORKSHEET_ACTIVITY_OUT_OF_SCOPE',
        detail = format('worksheet_id=%s', p_worksheet_id);
    end if;
  end if;

  delete from public.activity_worksheet_cells where worksheet_id = p_worksheet_id;

  insert into public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
  select
    p_worksheet_id,
    (elem->>'category_id')::uuid,
    (elem->>'activity_id')::uuid,
    (elem->>'budget_hours')::numeric
  from jsonb_array_elements(p_cells) as elem
  where (elem->>'budget_hours')::numeric > 0;
end;
$$;


--
-- Name: begin_notification_email_attempt(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.begin_notification_email_attempt(p_email_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_intentos integer;
BEGIN
  IF p_email_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Sólo sobre un arriendo vigente. Si la fila ya no está en `sending` es que otra corrida la
  -- cerró o el barrido la dio por perdida, y sumarle un intento a eso no describe nada.
  UPDATE public.notification_emails
     SET attempts = attempts + 1, claimed_at = now()
   WHERE email_id = p_email_id
     AND status = 'sending'
  RETURNING attempts INTO v_intentos;

  RETURN v_intentos;
END;
$$;


--
-- Name: FUNCTION begin_notification_email_attempt(p_email_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.begin_notification_email_attempt(p_email_id uuid) IS 'Gasta un intento de esa fila y refresca su arriendo. La llama el drenaje justo antes de entregarle el correo a Graph, para que el intento cuente un envio de verdad y no una fila que solo estuvo en el lote. Devuelve el numero de intento, o NULL si la fila ya no esta en sending.';


--
-- Name: can_approve_timesheet(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_approve_timesheet(p_approver_auth_id uuid, p_period_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_approver_staff uuid;
  v_period record;
begin
  select staff_id into v_approver_staff from staff where auth_user_id = p_approver_auth_id;
  if v_approver_staff is null then
    return false;
  end if;

  -- admin aprueba cualquier periodo
  if exists (select 1 from user_roles where user_id = p_approver_auth_id and role_key = 'admin') then
    return true;
  end if;

  select tp.staff_id, tp.week_start_date into v_period
  from timesheet_periods tp where tp.period_id = p_period_id;
  if v_period is null then
    return false;
  end if;

  return exists (
    select 1 from get_timesheet_approvers(v_period.staff_id, v_period.week_start_date) g
    where g.approver_staff_id = v_approver_staff
  );
end;
$$;


--
-- Name: can_approve_timesheet_line(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_approve_timesheet_line(p_approver_auth_id uuid, p_period_id uuid, p_engagement_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_approver_staff uuid;
begin
  select staff_id into v_approver_staff from staff where auth_user_id = p_approver_auth_id;
  if v_approver_staff is null then
    return false;
  end if;

  -- admin aprueba todo
  if exists (select 1 from user_roles where user_id = p_approver_auth_id and role_key = 'admin') then
    return true;
  end if;

  -- debe tener el permiso de aprobar
  if not exists (
    select 1 from user_roles ur
    join authorization_role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = p_approver_auth_id
      and rp.permission_key = 'timesheet_approval.approve'
  ) then
    return false;
  end if;

  -- y ser el Gerente o Socio asignado del encargo (aprueba cualquier línea, incl. la propia)
  return exists (
    select 1 from engagements e
    where e.engagement_id = p_engagement_id
      and (e.manager_id = v_approver_staff or e.partner_id = v_approver_staff)
  );
end;
$$;


--
-- Name: can_approve_wo_risk(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_approve_wo_risk(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_admin()
    or (
      public.has_permission('work_order.risk.approve')
      and (
        -- department / firm -> cualquier encargo (igual que las olas de lectura).
        public.permission_scope('work_order.risk.approve') is distinct from 'assigned_engagements'
        -- assigned_engagements -> SOLO el SQR asignado del encargo.
        or public.get_my_staff_id() = (
          select e.sqr_id from public.engagements e
          where e.engagement_id = p_engagement_id
        )
      )
    );
$$;


--
-- Name: can_read_engagement_assignments(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_engagement_assignments(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT has_firmwide_assignment_visibility()
    OR (has_role(auth.uid(),'manager'::app_role) AND is_engagement_team_member(p_engagement_id))
    OR (has_role(auth.uid(),'senior'::app_role)  AND has_assignment_on_engagement(p_engagement_id))
$$;


--
-- Name: can_read_engagement_dashboard(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_engagement_dashboard(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.has_permission('dashboard.engagement.read')
    AND EXISTS (
      SELECT 1
      FROM public.engagements e
      WHERE e.engagement_id = p_engagement_id
        AND (
          public.current_role_key() IN ('admin', 'senior_partner')
          OR (
            public.get_my_staff_id() IS NOT NULL
            AND CASE public.current_role_key()
                  WHEN 'partner'      THEN e.partner_id = public.get_my_staff_id()
                  WHEN 'director'     THEN e.partner_id = public.get_my_staff_id()
                  WHEN 'risk_partner' THEN e.partner_id = public.get_my_staff_id()
                  WHEN 'sqr'          THEN e.partner_id = public.get_my_staff_id()
                  WHEN 'manager'      THEN e.manager_id = public.get_my_staff_id()
                  WHEN 'ita_manager'  THEN e.manager_id = public.get_my_staff_id()
                  WHEN 'tax_manager'  THEN e.manager_id = public.get_my_staff_id()
                  WHEN 'senior'       THEN e.encargado_id = public.get_my_staff_id()
                  WHEN 'semisenior'   THEN e.encargado_id = public.get_my_staff_id()
                  WHEN 'ita_senior'   THEN e.specialist_it_id = public.get_my_staff_id()
                  WHEN 'tax_senior'   THEN e.specialist_tax_id = public.get_my_staff_id()
                  ELSE false
                END
          )
        )
    );
$$;


--
-- Name: FUNCTION can_read_engagement_dashboard(p_engagement_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.can_read_engagement_dashboard(p_engagement_id uuid) IS 'dash_encargo (decisiones.md §2, plan_v2.md §7.1): única materialización del alcance por rol de la pestaña Encargo. Fail-closed (ELSE false); NUNCA lee authorization_role_permissions.scope_key -- risk_partner se trata igual que partner/director. sqr entra SOLO por partner_id (ser sqr_id de un encargo no da acceso aqui, esas horas ya se ven en Práctica).';


--
-- Name: cascade_practice_abbreviation_rename(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cascade_practice_abbreviation_rename() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only act when abbreviation actually changes between two non-null values.
  IF OLD.abbreviation IS DISTINCT FROM NEW.abbreviation
     AND OLD.abbreviation IS NOT NULL
     AND NEW.abbreviation IS NOT NULL THEN

    UPDATE public.activity_codes
       SET activity_code = NEW.abbreviation
                        || substring(activity_code FROM length(OLD.abbreviation) + 1)
     WHERE practica_id    = OLD.practica_id
       AND activity_code LIKE OLD.abbreviation || '-%';

  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: check_login_allowed(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_login_allowed(p_email text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email   text := lower(trim(p_email));
  v_locked  timestamptz;
  v_remaining integer;
BEGIN
  SELECT locked_until INTO v_locked
  FROM public.auth_login_attempts
  WHERE email_normalized = v_email;

  IF v_locked IS NOT NULL AND v_locked > now() THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_locked - now()))::integer);
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining_seconds', v_remaining
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining_seconds', 0
  );
END;
$$;


--
-- Name: check_pending_hours_before_termination(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_pending_hours_before_termination(p_staff_id uuid, p_termination_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_hire_date date;
  v_capacity numeric;
  v_staff_city text;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_gap numeric;
  v_result jsonb := '[]'::jsonb;
BEGIN
  SELECT hire_date, weekly_capacity_hours, city
  INTO v_hire_date, v_capacity, v_staff_city
  FROM staff WHERE staff_id = p_staff_id;

  IF v_hire_date IS NULL THEN
    v_hire_date := p_termination_date;
  END IF;

  v_daily := COALESCE(v_capacity, 40) / 5.0;

  v_cursor := v_hire_date - (EXTRACT(ISODOW FROM v_hire_date)::int - 1);

  WHILE v_cursor <= p_termination_date LOOP
    v_week_end := v_cursor + 4;

    v_eff_start := GREATEST(v_cursor, v_hire_date);
    v_eff_end := LEAST(v_week_end, p_termination_date);

    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(DISTINCT h.holiday_date) INTO v_holiday_count
    FROM holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5
      AND (
        h.oficina = 0
        OR (h.oficina = 1 AND v_staff_city = 'La Paz')
        OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
      );

    v_working_days := v_working_days - v_holiday_count;

    IF v_working_days > 0 THEN
      v_expected := v_working_days * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_gap := v_expected - v_actual;

      IF v_gap > 0 THEN
        v_result := v_result || jsonb_build_object(
          'week_start', v_cursor,
          'effective_start', v_eff_start,
          'effective_end', v_eff_end,
          'expected_hours', v_expected,
          'actual_hours', v_actual,
          'gap', v_gap
        );
      END IF;
    END IF;

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;


--
-- Name: check_time_entry_engagement_dates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_time_entry_engagement_dates() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_start date;
  v_end   date;
BEGIN
  SELECT e.start_date, e.end_date
  INTO v_start, v_end
  FROM engagements e
  WHERE e.engagement_id = NEW.engagement_id;

  IF v_start IS NOT NULL AND NEW.date_worked < v_start THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE: date_worked % is before engagement start_date %',
      NEW.date_worked, v_start
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_end IS NOT NULL AND NEW.date_worked > v_end THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE: date_worked % is after engagement end_date %',
      NEW.date_worked, v_end
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: check_wo_approved(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_wo_approved() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_wo_required boolean;
  v_override    smallint;
BEGIN
  SELECT work_order_required, engagement_state_override
    INTO v_wo_required, v_override
  FROM engagements WHERE engagement_id = NEW.engagement_id;

  -- FEAT 0602-135: el override manual manda. Solo 4/5 permiten cargar; el resto bloquea.
  IF v_override IS NOT NULL THEN
    IF v_override NOT IN (4, 5) THEN
      RAISE EXCEPTION 'Cannot log time: engagement state (override %) does not allow logging', v_override;
    END IF;
    RETURN NEW;  -- override 4/5: aprobado manualmente, salta el chequeo de OT
  END IF;

  -- Sin override → estado derivado de la OT.
  -- Non-WO-required engagements bypass the WO approval check
  IF v_wo_required IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- WO approval check. FEAT 0602-135: excluye OT con Riesgos rechazado — useRejectRisk deja
  -- approval_status='Approved' pero risk_status='Rejected', que la máquina trata como estado 8
  -- Rechazado (no cargable). Sin este filtro el gate permitiría horas en un encargo rechazado.
  IF NOT EXISTS (
    SELECT 1 FROM work_orders wo
    WHERE wo.engagement_id = NEW.engagement_id
    AND wo.approval_status = 'Approved'
    AND wo.risk_status IS DISTINCT FROM 'Rejected'
  ) THEN
    RAISE EXCEPTION 'Cannot log time: Work Order is not approved';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: claim_auth_email_slot(text, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_auth_email_slot(p_email text, p_max_por_hora integer DEFAULT 5, p_min_segundos integer DEFAULT 60, p_max_global integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_email       text := lower(trim(coalesce(p_email, '')));
  v_ahora       timestamp with time zone := now();
  v_fila        public.auth_email_throttle%ROWTYPE;
  v_global      public.auth_email_throttle%ROWTYPE;
  v_max_global  integer := p_max_global;
  v_raw         text;
  v_venc_email  boolean;
  v_venc_global boolean;
  c_global      constant text := '*';
BEGIN
  -- El '@' no es cosmético: es lo que garantiza que un destinatario no pueda hacerse pasar por
  -- la fila global. Quien llama ya validó la dirección; acá alcanza con que no sea la clave
  -- reservada.
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN false;
  END IF;

  IF v_max_global IS NULL THEN
    -- Se valida con regex en vez de castear a ciegas: `global_settings` es texto libre y un
    -- valor mal tipeado por el admin no puede dejar sin correos de cuenta a la firma entera.
    v_max_global := 120;
    SELECT setting_value INTO v_raw
      FROM public.global_settings WHERE setting_key = 'AUTH_EMAIL_GLOBAL_MAX_PER_HOUR';
    -- `{1,9}`: el cast a integer revienta antes que el clamp con un numero de 20 digitos, y
    -- esta funcion es la que decide si sale un correo de recuperacion de contrasena.
    IF v_raw ~ '^[0-9]{1,9}$' THEN
      v_max_global := LEAST(GREATEST(v_raw::integer, 1), 100000);
    END IF;
  END IF;

  -- Asegura las filas sin pisarlas si ya existen, para poder bloquearlas en el paso siguiente.
  INSERT INTO public.auth_email_throttle (email_normalized, window_start, sent_count, last_sent_at)
  VALUES (c_global, v_ahora, 0, NULL), (v_email, v_ahora, 0, NULL)
  ON CONFLICT (email_normalized) DO NOTHING;

  SELECT * INTO v_global
    FROM public.auth_email_throttle
   WHERE email_normalized = c_global
     FOR UPDATE;

  SELECT * INTO v_fila
    FROM public.auth_email_throttle
   WHERE email_normalized = v_email
     FOR UPDATE;

  v_venc_email  := v_fila.window_start   < v_ahora - interval '1 hour';
  v_venc_global := v_global.window_start < v_ahora - interval '1 hour';

  -- Los topes del destinatario. Con la ventana vencida no hay nada que chequear: el contador
  -- arranca de cero y este correo es el primero.
  IF NOT v_venc_email THEN
    -- Demasiado seguido al mismo destinatario.
    IF v_fila.last_sent_at IS NOT NULL
       AND v_fila.last_sent_at > v_ahora - make_interval(secs => p_min_segundos) THEN
      RETURN false;
    END IF;

    -- Tope de la ventana en curso.
    IF v_fila.sent_count >= p_max_por_hora THEN
      RETURN false;
    END IF;
  END IF;

  -- El tope de la firma. Sin mínimo entre correos: ese freno es contra la casilla de una
  -- persona, y uno global convertiría el formulario en una fila de a uno por minuto.
  IF NOT v_venc_global AND v_global.sent_count >= v_max_global THEN
    RETURN false;
  END IF;

  UPDATE public.auth_email_throttle
     SET window_start = CASE WHEN v_venc_global THEN v_ahora ELSE window_start END,
         sent_count   = CASE WHEN v_venc_global THEN 1 ELSE v_global.sent_count + 1 END,
         last_sent_at = v_ahora
   WHERE email_normalized = c_global;

  UPDATE public.auth_email_throttle
     SET window_start = CASE WHEN v_venc_email THEN v_ahora ELSE window_start END,
         sent_count   = CASE WHEN v_venc_email THEN 1 ELSE v_fila.sent_count + 1 END,
         last_sent_at = v_ahora
   WHERE email_normalized = v_email;

  RETURN true;
END;
$_$;


--
-- Name: FUNCTION claim_auth_email_slot(p_email text, p_max_por_hora integer, p_min_segundos integer, p_max_global integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_auth_email_slot(p_email text, p_max_por_hora integer, p_min_segundos integer, p_max_global integer) IS 'Consume un cupo de correo de cuenta: el del destinatario y el de la firma. Devuelve true si se puede mandar (y ya descontó los dos), false si está dentro del mínimo entre correos, pasó el tope por destinatario de la ventana de una hora, o la firma agotó AUTH_EMAIL_GLOBAL_MAX_PER_HOUR. Cuando devuelve false no descuenta nada.';


--
-- Name: claim_notification_emails(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_notification_emails(p_limit integer DEFAULT 50) RETURNS TABLE(email_id uuid, to_email text, to_name text, type_key text, entity_id text, payload jsonb, attempts integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  c_arriendo constant interval := interval '15 minutes';
BEGIN
  -- Primero los arriendos vencidos que ya gastaron los tres intentos. Van a `failed` y no
  -- vuelven a la cola: sin este barrido, una fila cuyo envío mata al proceso cada vez se
  -- reclamaría para siempre, porque el tope de intentos lo aplica
  -- mark_notification_email_result() y a esa fila nadie llega a marcarla nunca.
  UPDATE public.notification_emails e
     SET status     = 'failed',
         last_error = COALESCE(e.last_error,
                        'El drenaje no cerro el envio: arriendo vencido tras 3 intentos.')
   WHERE e.status = 'sending'
     -- COALESCE y no `claimed_at < ...` a secas: un `sending` SIN estampa daria NULL, o sea
     -- FALSE, y la fila quedaria enterrada — que es justo el bug que esto arregla.
     AND COALESCE(e.claimed_at, e.created_at) < now() - c_arriendo
     AND e.attempts >= 3;

  RETURN QUERY
  WITH tomadas AS (
    SELECT e.email_id
      FROM public.notification_emails e
     WHERE e.status = 'pending'
        OR (e.status = 'sending'
            AND COALESCE(e.claimed_at, e.created_at) < now() - c_arriendo)
     ORDER BY e.created_at
     LIMIT GREATEST(COALESCE(p_limit, 50), 0)
       FOR UPDATE SKIP LOCKED
  )
  -- Reclamar NO gasta intento. Un claim toma hasta 50 filas y el drenaje las manda de a una:
  -- cobrarle el intento al lote entero se lo cobra también a las que la invocación nunca llegó a
  -- tocar, y una corrida cortada a mitad de lote se las lleva puestas. Tres cortes y el barrido
  -- de arriba las manda a `failed` sin que Graph las haya visto nunca.
  --
  -- El intento lo gasta `begin_notification_email_attempt()`, fila por fila y justo antes de
  -- llamar a Graph. Eso conserva lo que el conteo en el claim protegía —una fila cuyo envío mata
  -- al proceso SÍ pasa por ahí, así que sigue gastando intentos y no da vueltas para siempre— y
  -- deja fuera a las que sólo estuvieron en la cola.
  UPDATE public.notification_emails e
     SET status = 'sending', claimed_at = now()
    FROM tomadas t
   WHERE e.email_id = t.email_id
  RETURNING e.email_id, e.to_email, e.to_name, e.type_key, e.entity_id, e.payload, e.attempts;
END;
$$;


--
-- Name: FUNCTION claim_notification_emails(p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_notification_emails(p_limit integer) IS 'Reclama hasta p_limit correos y los marca sending con claimed_at, SIN gastar intento (eso lo hace begin_notification_email_attempt() por fila). Toma lo pending y tambien lo sending con arriendo vencido (15 min), que es una invocacion que murio sin cerrar; con 3 intentos gastados eso pasa a failed. FOR UPDATE SKIP LOCKED: dos drenajes simultaneos no toman la misma fila.';


--
-- Name: clear_account_deletion_mark(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_account_deletion_mark(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_filas integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NULL_USER_ID');
  END IF;

  UPDATE public.user_roles
     SET deletion_email = NULL
   WHERE user_id = p_user_id
     AND deletion_email IS NOT NULL;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'limpiadas', v_filas);
END;
$$;


--
-- Name: FUNCTION clear_account_deletion_mark(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.clear_account_deletion_mark(p_user_id uuid) IS 'Borra user_roles.deletion_email cuando el borrado de la cuenta no llego a concretarse. Reemplaza a abort_account_deletion(): desde que prepare_account_deletion() no borra ni anuncia, no hay fila que reponer ni aviso que retirar.';


--
-- Name: copy_categories_between_practices(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.copy_categories_between_practices(p_source_practice_id uuid, p_target_practice_id uuid, p_replace boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_src_active   boolean;
  v_src_allows   boolean;
  v_tgt_active   boolean;
  v_tgt_allows   boolean;
  v_target_count integer;
  v_referenced   integer;
  v_inserted     integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  IF p_source_practice_id = p_target_practice_id THEN
    RAISE EXCEPTION 'same_practice';
  END IF;

  SELECT is_active, allows_rates_activities
    INTO v_src_active, v_src_allows
    FROM public.practicas
   WHERE practica_id = p_source_practice_id;

  IF v_src_active IS NULL THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;
  IF NOT v_src_active OR NOT v_src_allows THEN
    RAISE EXCEPTION 'source_invalid';
  END IF;

  SELECT is_active, allows_rates_activities
    INTO v_tgt_active, v_tgt_allows
    FROM public.practicas
   WHERE practica_id = p_target_practice_id
   FOR UPDATE;

  IF v_tgt_active IS NULL THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;
  IF NOT v_tgt_active OR NOT v_tgt_allows THEN
    RAISE EXCEPTION 'target_invalid';
  END IF;

  SELECT COUNT(*) INTO v_target_count
    FROM public.categories
   WHERE practica_id = p_target_practice_id;

  IF v_target_count > 0 THEN
    IF NOT p_replace THEN
      RAISE EXCEPTION 'target_not_empty';
    END IF;

    SELECT COUNT(*) INTO v_referenced
      FROM public.categories c
     WHERE c.practica_id = p_target_practice_id
       AND (
         EXISTS (SELECT 1 FROM public.staff s WHERE s.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.wo_budget_lines b WHERE b.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.activity_worksheet_cells w WHERE w.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.activity_codes a WHERE a.default_category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.wo_staffing_requirements r WHERE r.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.engagement_assignments ea WHERE ea.category_id = c.category_id)
       );

    IF v_referenced > 0 THEN
      RAISE EXCEPTION 'target_referenced';
    END IF;

    DELETE FROM public.categories WHERE practica_id = p_target_practice_id;
  END IF;

  INSERT INTO public.categories (
    practica_id, category_name, display_order,
    rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd,
    can_approve_wo, can_approve_timesheets, default_app_role, default_role_key
  )
  SELECT p_target_practice_id,
         src.category_name,
         row_number() OVER (ORDER BY src.display_order, src.category_name),
         src.rate_high_bob, src.rate_low_bob, src.rate_high_usd, src.rate_low_usd,
         src.can_approve_wo, src.can_approve_timesheets, src.default_app_role, src.default_role_key
    FROM public.categories src
   WHERE src.practica_id = p_source_practice_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    category_id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_name character varying(50) NOT NULL,
    rate_high_bob numeric(10,2) DEFAULT 0 NOT NULL,
    rate_low_bob numeric(10,2) DEFAULT 0 NOT NULL,
    rate_high_usd numeric(10,2) DEFAULT 0 NOT NULL,
    rate_low_usd numeric(10,2) DEFAULT 0 NOT NULL,
    display_order integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    can_approve_wo boolean DEFAULT false,
    can_approve_timesheets boolean DEFAULT false,
    default_app_role public.app_role,
    practica_id uuid NOT NULL,
    default_role_key text,
    CONSTRAINT categories_default_role_key_not_admin CHECK ((default_role_key IS DISTINCT FROM 'admin'::text)),
    CONSTRAINT categories_display_order_positive CHECK ((display_order >= 1))
);


--
-- Name: COLUMN categories.default_role_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.default_role_key IS 'Rol del catálogo authorization_roles que esta categoría SUGIERE al vincular un usuario. Es una sugerencia, no una asignación: el rol efectivo se gestiona en Configuración → Roles de Usuario y siempre puede diferir. NULL = ninguno.';


--
-- Name: create_category_for_practice(uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_category_for_practice(p_practice_id uuid, p_category_name text, p_display_order integer DEFAULT NULL::integer, p_rate_high_bob numeric DEFAULT 0, p_rate_low_bob numeric DEFAULT 0, p_rate_high_usd numeric DEFAULT 0, p_rate_low_usd numeric DEFAULT 0, p_can_approve_wo boolean DEFAULT false, p_can_approve_timesheets boolean DEFAULT false, p_default_app_role public.app_role DEFAULT NULL::public.app_role, p_default_role_key text DEFAULT NULL::text) RETURNS public.categories
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_active     boolean;
  v_allows     boolean;
  v_max        integer;
  v_position   integer;
  v_row        public.categories;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock the practice row to serialize concurrent inserts for the same practice.
  SELECT is_active, allows_rates_activities
    INTO v_active, v_allows
    FROM public.practicas
   WHERE practica_id = p_practice_id
   FOR UPDATE;

  IF v_active IS NULL THEN
    RAISE EXCEPTION 'Practice not found';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Practice is inactive';
  END IF;
  IF NOT v_allows THEN
    RAISE EXCEPTION 'Practice does not allow rates/categories';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) INTO v_max
    FROM public.categories
   WHERE practica_id = p_practice_id;

  -- Null / out-of-range → append; otherwise clamp to [1, max+1] (gap-free).
  IF p_display_order IS NULL OR p_display_order > v_max + 1 THEN
    v_position := v_max + 1;
  ELSIF p_display_order < 1 THEN
    v_position := 1;
  ELSE
    v_position := p_display_order;
  END IF;

  -- Shift existing siblings from the target position onward.
  UPDATE public.categories
     SET display_order = display_order + 1
   WHERE practica_id = p_practice_id
     AND display_order >= v_position;

  INSERT INTO public.categories (
    practica_id, category_name, display_order,
    rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd,
    can_approve_wo, can_approve_timesheets, default_app_role, default_role_key
  ) VALUES (
    p_practice_id, p_category_name, v_position,
    p_rate_high_bob, p_rate_low_bob, p_rate_high_usd, p_rate_low_usd,
    p_can_approve_wo, p_can_approve_timesheets, p_default_app_role, p_default_role_key
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: engagements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagements (
    engagement_id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    engagement_name character varying(255) NOT NULL,
    engagement_code character varying(50),
    partner_id uuid,
    manager_id uuid,
    start_date date,
    end_date date,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    work_order_required boolean DEFAULT true NOT NULL,
    activity_required boolean DEFAULT true NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    approval_required boolean DEFAULT true NOT NULL,
    oficina smallint,
    practica smallint,
    anio_fiscal integer,
    funcion smallint,
    sqr_id uuid,
    encargado_id uuid,
    specialist_it_id uuid,
    specialist_tax_id uuid,
    fecha_cierre date NOT NULL,
    anio_fiscal_override boolean DEFAULT false NOT NULL,
    contract_file_path text,
    taxonomy_id uuid,
    engagement_state_override smallint,
    created_by_staff_id uuid,
    society_id uuid NOT NULL,
    CONSTRAINT chk_engagements_funcion CHECK ((funcion = ANY (ARRAY[0, 1, 2, 3]))),
    CONSTRAINT chk_engagements_manager_not_specialist CHECK (((manager_id IS NULL) OR ((manager_id IS DISTINCT FROM specialist_it_id) AND (manager_id IS DISTINCT FROM specialist_tax_id)))),
    CONSTRAINT chk_engagements_oficina CHECK ((oficina = ANY (ARRAY[0, 1, 2]))),
    CONSTRAINT chk_engagements_practica CHECK (((practica >= 0) AND (practica <= 9))),
    CONSTRAINT engagements_state_override_check CHECK (((engagement_state_override IS NULL) OR ((engagement_state_override >= 1) AND (engagement_state_override <= 8)))),
    CONSTRAINT engagements_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'pending'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: COLUMN engagements.engagement_state_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.engagements.engagement_state_override IS 'FEAT 0602-135: override manual del estado del encargo (1..8). NULL = derivado de la OT. 6 Cancelado / 7 Finalizado son terminales; 7 lo escribe el cron finalize-engagements. BUG 0817-179: el 9 Congelado se retiró del sistema.';


--
-- Name: COLUMN engagements.created_by_staff_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.engagements.created_by_staff_id IS 'Staff que creó el encargo. La puebla un trigger desde get_my_staff_id(); no la envía el cliente HTTP. Da a su autor lectura y edición aunque no figure entre los 4 campos de asignación. NULL en las filas previas a esta migración.';


--
-- Name: CONSTRAINT chk_engagements_manager_not_specialist ON engagements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_engagements_manager_not_specialist ON public.engagements IS 'BUG 0828-185 (plan_v0 §5b): la misma persona no puede ser a la vez manager_id y specialist_it_id/specialist_tax_id del mismo encargo. Validado contra los datos existentes (remediados arriba en esta misma migración), no NOT VALID.';


--
-- Name: create_engagement_with_code(text, uuid, uuid, uuid, date, date, text, smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean, date, boolean, uuid, uuid, uuid, uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_engagement_with_code(p_engagement_name text, p_client_id uuid, p_partner_id uuid, p_manager_id uuid, p_start_date date, p_end_date date, p_status text, p_oficina smallint, p_practica smallint, p_funcion smallint, p_anio_fiscal integer, p_work_order_required boolean, p_activity_required boolean, p_is_internal boolean, p_approval_required boolean, p_fecha_cierre date, p_anio_fiscal_override boolean, p_society_id uuid, p_sqr_id uuid DEFAULT NULL::uuid, p_encargado_id uuid DEFAULT NULL::uuid, p_specialist_it_id uuid DEFAULT NULL::uuid, p_specialist_tax_id uuid DEFAULT NULL::uuid, p_contract_file_path text DEFAULT NULL::text, p_taxonomy_id uuid DEFAULT NULL::uuid) RETURNS public.engagements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_correlativo integer;
  v_code        text;
  v_engagement  public.engagements;
  v_date_begin  date;
  v_date_end    date;
  v_tipo        text;
  v_derived_fy  integer;
BEGIN
  IF p_oficina IS NULL OR p_oficina NOT IN (0, 1, 2) THEN
    RAISE EXCEPTION 'Oficina inválida: %', p_oficina;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.practicas WHERE code = p_practica AND is_active) THEN
    RAISE EXCEPTION 'Práctica inválida: %', p_practica;
  END IF;

  IF p_funcion IS NULL OR p_funcion NOT IN (0, 1, 2, 3) THEN
    RAISE EXCEPTION 'Función inválida: %', p_funcion;
  END IF;

  IF p_anio_fiscal IS NULL OR p_anio_fiscal < 2020 OR p_anio_fiscal > 2100 THEN
    RAISE EXCEPTION 'Año fiscal inválido: %', p_anio_fiscal;
  END IF;

  IF p_fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'Fecha de cierre requerida';
  END IF;

  -- FEAT 0714-155: sociedad interna del encargo — obligatoria y debe estar activa.
  IF p_society_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.society WHERE society_id = p_society_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Sociedad inválida o inactiva: %', p_society_id;
  END IF;

  -- Servicio is optional, but if provided it must reference an active row.
  IF p_taxonomy_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.servicios WHERE taxonomy_id = p_taxonomy_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Servicio inválido o inactivo: %', p_taxonomy_id;
  END IF;

  -- Mirrors getFiscalYearForDate (src/lib/fiscalCalculations.ts): fiscal year runs Oct 1 -> Sep 30,
  -- named by the ending year.
  v_derived_fy := CASE
    WHEN EXTRACT(MONTH FROM p_fecha_cierre) >= 10 THEN EXTRACT(YEAR FROM p_fecha_cierre)::integer + 1
    ELSE EXTRACT(YEAR FROM p_fecha_cierre)::integer
  END;

  IF p_anio_fiscal_override THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'FORBIDDEN: el override manual del año fiscal requiere rol administrador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_anio_fiscal IS DISTINCT FROM v_derived_fy THEN
    RAISE EXCEPTION 'Año fiscal % no coincide con el derivado de la fecha de cierre % (esperado %)',
      p_anio_fiscal, p_fecha_cierre, v_derived_fy;
  END IF;

  v_date_begin := ((p_anio_fiscal - 1)::text || '-10-01')::date;
  v_date_end   := (p_anio_fiscal::text        || '-09-30')::date;

  v_tipo := CASE p_funcion
    WHEN 0 THEN 'administrativa'
    WHEN 1 THEN 'cliente'
    WHEN 2 THEN 'capacitacion'
    WHEN 3 THEN 'calidad'
  END;

  INSERT INTO public.parametro (nombre, periodo, date_begin, date_end, valor, descripcion, tipo)
  VALUES (
    'Correlativo OT',
    p_anio_fiscal,
    v_date_begin,
    v_date_end,
    1,
    'Correlativo encargos FY ' || p_anio_fiscal::text || ' - ' || v_tipo,
    v_tipo
  )
  ON CONFLICT (nombre, periodo, tipo) DO NOTHING;

  UPDATE public.parametro
    SET valor = valor + 1
  WHERE nombre  = 'Correlativo OT'
    AND periodo = p_anio_fiscal
    AND tipo    = v_tipo
  RETURNING valor - 1 INTO v_correlativo;

  IF v_correlativo IS NULL THEN
    RAISE EXCEPTION 'No se pudo obtener el correlativo para FY % tipo %', p_anio_fiscal, v_tipo;
  END IF;

  v_code := p_anio_fiscal::text
    || '.' || p_oficina::text || p_practica::text || p_funcion::text
    || '.' || LPAD(v_correlativo::text, 3, '0');

  INSERT INTO public.engagements (
    engagement_name, engagement_code, client_id, partner_id, manager_id,
    start_date, end_date, status, oficina, practica, funcion, anio_fiscal,
    work_order_required, activity_required, is_internal, approval_required,
    sqr_id, encargado_id, specialist_it_id, specialist_tax_id,
    fecha_cierre, anio_fiscal_override, contract_file_path, taxonomy_id, society_id
  ) VALUES (
    p_engagement_name, v_code, p_client_id, p_partner_id, p_manager_id,
    p_start_date, p_end_date, p_status, p_oficina, p_practica, p_funcion, p_anio_fiscal,
    p_work_order_required, p_activity_required, p_is_internal, p_approval_required,
    p_sqr_id, p_encargado_id, p_specialist_it_id, p_specialist_tax_id,
    p_fecha_cierre, p_anio_fiscal_override, p_contract_file_path, p_taxonomy_id, p_society_id
  ) RETURNING * INTO v_engagement;

  RETURN v_engagement;
END;
$$;


--
-- Name: activity_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_codes (
    activity_id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_code character varying(10) NOT NULL,
    description character varying(100) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    default_category_id uuid,
    practica_id uuid,
    entity_type text DEFAULT 'A'::text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    CONSTRAINT activity_codes_entity_type_check CHECK ((entity_type = 'A'::text)),
    CONSTRAINT activity_codes_practica_id_or_system CHECK ((is_system OR (practica_id IS NOT NULL)))
);


--
-- Name: create_practice_activity(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_practice_activity(p_practice_id uuid, p_description text, p_entity_type text DEFAULT 'A'::text) RETURNS public.activity_codes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_abbrev       text;
  v_max_ordinal  integer;
  v_code         text;
  v_row          public.activity_codes;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  IF p_entity_type NOT IN ('A') THEN
    RAISE EXCEPTION 'Invalid entity_type: %', p_entity_type;
  END IF;

  -- Lock practice row to prevent concurrent inserts for the same practice.
  SELECT abbreviation INTO v_abbrev
    FROM public.practicas
   WHERE practica_id = p_practice_id AND is_active = true
   FOR UPDATE;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Practice not found, inactive, or has no abbreviation';
  END IF;

  -- Highest existing ordinal among active, ordinal-scheme activities for
  -- this (practice, entity_type) pair. System activities (is_system=true,
  -- e.g. ADM) never have a practica_id, so they can never match p_practice_id
  -- here regardless of code shape. Using MAX (not COUNT) also survives any
  -- gap left by an environment where a real activity was already created
  -- under an unfiltered count before this guard existed — the next code
  -- always beats the highest one on record, so it can never collide.
  SELECT COALESCE(MAX(substring(activity_code FROM '[0-9]+$')::int), 0) INTO v_max_ordinal
    FROM public.activity_codes
   WHERE practica_id  = p_practice_id
     AND entity_type = p_entity_type
     AND is_active   = true
     AND is_system   = false
     AND activity_code ~ ('^' || v_abbrev || '-' || p_entity_type || '[0-9]+$');

  -- No hard cap: 1–9 is a UI recommendation only.
  v_code := v_abbrev || '-' || p_entity_type || (v_max_ordinal + 1)::text;

  INSERT INTO public.activity_codes (activity_code, description, is_active, practica_id, entity_type)
  VALUES (v_code, p_description, true, p_practice_id, p_entity_type)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$_$;


--
-- Name: current_role_key(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_role_key() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role_key from public.user_roles where user_id = auth.uid() limit 1;
$$;


--
-- Name: deactivate_practice_activity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deactivate_practice_activity(p_activity_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_practica_id  uuid;
  v_entity_type text;
  v_abbrev      text;
  v_old_code    text;
  v_old_ordinal integer;
  rec           RECORD;
  v_ordinal     integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock and fetch the target activity (and its practice row) atomically.
  SELECT ac.practica_id, ac.entity_type, ac.activity_code, s.abbreviation
    INTO v_practica_id, v_entity_type, v_old_code, v_abbrev
    FROM public.activity_codes ac
    JOIN public.practicas s USING (practica_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = true AND ac.is_system = false
   FOR UPDATE OF ac, s;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found, already inactive, or not practice-linked';
  END IF;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Practice has no abbreviation';
  END IF;

  -- Extract current ordinal from code (e.g. AUD-A3 → 3, AUD-A10 → 10).
  v_old_ordinal := (regexp_replace(v_old_code, '^.*[A-Z](\d+)$', '\1'))::integer;

  -- Mark target as inactive with AX code.
  UPDATE public.activity_codes
     SET is_active = false,
         activity_code = v_abbrev || '-' || v_entity_type || 'X'
   WHERE activity_id = p_activity_id;

  -- Renumber actives with ordinal > old_ordinal (shift back by 1). Legacy
  -- siblings have no trailing digits, so the substring/cast is NULL and the
  -- NULL > v_old_ordinal comparison excludes them from this set already.
  v_ordinal := v_old_ordinal;
  FOR rec IN
    SELECT activity_id
      FROM public.activity_codes
     WHERE practica_id  = v_practica_id
       AND entity_type = v_entity_type
       AND is_active   = true
       AND substring(activity_code FROM '[0-9]+$')::int > v_old_ordinal
     ORDER BY substring(activity_code FROM '[0-9]+$')::int
     FOR UPDATE
  LOOP
    UPDATE public.activity_codes
       SET activity_code = v_abbrev || '-' || v_entity_type || v_ordinal::text
     WHERE activity_id = rec.activity_id;
    v_ordinal := v_ordinal + 1;
  END LOOP;
END;
$_$;


--
-- Name: delete_category_for_practice(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_category_for_practice(p_category_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica_id uuid;
  v_pos        integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock the target row; capture its practice + position for the compaction.
  SELECT practica_id, display_order
    INTO v_practica_id, v_pos
    FROM public.categories
   WHERE category_id = p_category_id
   FOR UPDATE;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  DELETE FROM public.categories WHERE category_id = p_category_id;

  -- Close the gap: everything after the removed position shifts up by one.
  -- The (practica_id, display_order) unique is DEFERRABLE, so the bulk shift is
  -- safe within this transaction.
  UPDATE public.categories
     SET display_order = display_order - 1
   WHERE practica_id = v_practica_id
     AND display_order > v_pos;
END;
$$;


--
-- Name: dismiss_notifications(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dismiss_notifications(p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff uuid := public.get_my_staff_id();
  v_count integer;
BEGIN
  IF v_staff IS NULL OR p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- El filtro por recipient_staff_id es lo que impide descartar la notificación de otro
  -- pasando su uuid, igual que en mark_notifications_read().
  --
  -- `dismissed_at IS NULL` en el WHERE hace la operación idempotente: descartar dos veces la
  -- misma fila no mueve la marca, así que el plazo de retención se cuenta desde el PRIMER
  -- descarte y un doble click no lo estira.
  UPDATE public.notifications
     SET dismissed_at = now()
   WHERE notification_id = ANY (p_ids)
     AND recipient_staff_id = v_staff
     AND dismissed_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: FUNCTION dismiss_notifications(p_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.dismiss_notifications(p_ids uuid[]) IS 'Descarta notificaciones propias marcando dismissed_at; NO borra la fila, que sigue siendo el registro de que el aviso ya salio (sin ella el cron lo repite al dia siguiente). Ignora ids ajenos: el UPDATE filtra por recipient_staff_id = get_my_staff_id(). No hay policy de UPDATE para authenticated — esta es la unica via.';


--
-- Name: effective_engagement_state(smallint, boolean, uuid, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.effective_engagement_state(p_override smallint, p_wo_required boolean, p_wo_id uuid, p_approval_status text, p_risk_status text, p_approved_at timestamp with time zone) RETURNS smallint
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_override BETWEEN 1 AND 8 THEN p_override
    WHEN NOT p_wo_required THEN 4
    WHEN p_wo_id IS NULL THEN 1
    WHEN p_approval_status = 'Rejected' OR p_risk_status = 'Rejected' THEN 8
    WHEN p_approval_status = 'Approved' THEN CASE WHEN p_risk_status = 'Emergency_Approved' THEN 5 ELSE 4 END
    WHEN p_approved_at IS NOT NULL THEN 2
    WHEN p_risk_status IN ('Approved','Emergency_Approved') THEN 3
    ELSE 1 END;
$$;


--
-- Name: FUNCTION effective_engagement_state(p_override smallint, p_wo_required boolean, p_wo_id uuid, p_approval_status text, p_risk_status text, p_approved_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.effective_engagement_state(p_override smallint, p_wo_required boolean, p_wo_id uuid, p_approval_status text, p_risk_status text, p_approved_at timestamp with time zone) IS 'dash_socio (decisiones.md §2/§8 obs.8, plan_v2.md §6.6): espejo SQL exacto de effectiveEngagementState()/deriveEngagementState() en src/lib/engagementStatus.ts. Usado por partner_overview()/partner_overview_engagements() para derivar el conjunto "cartera" (estado 4/5). Mantener sincronizado con el TS -- ver comentario cruzado alla.';


--
-- Name: enforce_activity_default(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_activity_default() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_activity_required boolean;
  v_raw text;
  v_adm_id uuid;
BEGIN
  -- Check if engagement requires activity selection
  SELECT activity_required INTO v_activity_required
  FROM engagements WHERE engagement_id = NEW.engagement_id;

  -- If activity is required (default), no auto-assignment
  IF v_activity_required IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  -- Read ADM activity ID from global_settings
  SELECT setting_value INTO v_raw
  FROM global_settings
  WHERE setting_key = 'ADM_ACTIVITY_ID';

  IF v_raw IS NULL OR TRIM(v_raw) = '' THEN
    RAISE EXCEPTION 'ADM_ACTIVITY_NOT_CONFIGURED';
  END IF;

  v_adm_id := TRIM(v_raw)::uuid;

  -- Force activity to ADM regardless of what was sent
  NEW.activity_id := v_adm_id;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_administrative_engagement_rules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_administrative_engagement_rules() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_client_nit text;
  v_society_name text;
BEGIN
  -- Review fix (Codex, 3ra vuelta): `funcion` es inmutable despues de crear. EngagementForm
  -- ya lo trata asi (el payload de update la omite a proposito), pero la base no lo exigia y
  -- la policy "Team can update engagements" deja hacer el PATCH directo por PostgREST. Sin
  -- este guard, convertir un encargo Cliente ya aprobado a 0/2/3 pasaba sin tocar sus OTs:
  -- los triggers de work_orders y de plan de pagos son BEFORE INSERT OR UPDATE sobre SUS
  -- tablas, asi que la aprobacion de Riesgos, el plan y las cuotas quedaban vivas (Cobranzas
  -- las sigue viendo) mientras la UI ya escondia Riesgos y facturacion por la funcion nueva.
  -- Se bloquea el cambio en vez de cascadearlo: ademas, `funcion` va dentro de
  -- engagement_code (FY.[oficina][practica][funcion].[correlativo]), asi que moverla
  -- desincroniza el codigo ya emitido.
  --
  -- Unica excepcion: NULL -> 1. Las filas legacy tienen funcion NULL y todo el sistema las
  -- lee como Cliente (COALESCE(funcion, 1) = 1), asi que clasificarlas explicitamente no
  -- cambia nada. NULL -> 0/2/3 si es una conversion real y cae en el mismo bloqueo.
  IF TG_OP = 'UPDATE'
     AND OLD.funcion IS DISTINCT FROM NEW.funcion
     AND NOT (OLD.funcion IS NULL AND NEW.funcion = 1) THEN
    RAISE EXCEPTION '0722-160: la funcion del encargo no se puede cambiar despues de crearlo';
  END IF;

  IF NEW.funcion IS NULL OR NEW.funcion = 1 THEN
    RETURN NEW;
  END IF;

  -- Do not make historical administrative rows uneditable merely because their
  -- original client/society predates this flow. A new administrative row, or a
  -- change to its function/client/society, must use the controlled mapping.
  IF TG_OP = 'UPDATE'
     AND OLD.funcion = NEW.funcion
     AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id
     AND OLD.society_id IS NOT DISTINCT FROM NEW.society_id THEN
    NEW.is_internal := true;
    NEW.activity_required := false;
    RETURN NEW;
  END IF;

  SELECT c.unique_tax_id, s.name
    INTO v_client_nit, v_society_name
    FROM public.clients c
    JOIN public.society s ON s.society_id = NEW.society_id
   WHERE c.client_id = NEW.client_id;

  IF (v_society_name = 'Ruizmier Pelaez S.R.L.' AND v_client_nit = '1006979026')
     OR (v_society_name = 'Ruizmier Jauregui S.R.L.' AND v_client_nit = '184046021') THEN
    NEW.is_internal := true;
    NEW.activity_required := false;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '0722-160: el cliente interno debe corresponder a la sociedad del encargo';
END;
$$;


--
-- Name: FUNCTION enforce_administrative_engagement_rules(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enforce_administrative_engagement_rules() IS '0722-160: para funciones Administrativa/Capacitacion/Calidad exige el cliente interno de su sociedad y fuerza interno=true/activity_required=false. Ademas hace `funcion` inmutable tras crear (unica excepcion NULL -> 1), porque cambiarla dejaria las OTs del encargo sin normalizar y desincronizaria engagement_code.';


--
-- Name: enforce_administrative_no_payment_installments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_administrative_no_payment_installments() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_funcion smallint;
BEGIN
  -- Se resuelve por NEW.wo_id y NO por NEW.plan_id -> wo_payment_plan.wo_id, aunque la fila
  -- lleve las dos referencias denormalizadas y la policy "Manager can manage payment
  -- installments" autorice solo por plan_id. Alcanza porque la igualdad entre las dos ya es
  -- invariante de la tabla: wo_payment_installments_guard_exchange_rate() rechaza todo INSERT
  -- con `plan.wo_id IS DISTINCT FROM NEW.wo_id` (INSTALLMENT_WO_MISMATCH,
  -- 20260910090000_0722-156b_fixed_mode_rate_guard.sql) y congela plan_id/wo_id en todo UPDATE.
  -- La suite cubre las dos entradas -- cuota cruzada y wo_id administrativo directo -- para que
  -- el dia que ese guard cambie, esto falle en vez de degradarse en silencio.
  SELECT e.funcion INTO v_funcion
    FROM public.work_orders wo
    JOIN public.engagements e ON e.engagement_id = wo.engagement_id
   WHERE wo.wo_id = NEW.wo_id;

  IF v_funcion IS NOT NULL AND v_funcion <> 1 THEN
    RAISE EXCEPTION '0722-160: las OTs administrativas no facturan; no admiten cuotas de plan de pagos';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION enforce_administrative_no_payment_installments(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enforce_administrative_no_payment_installments() IS '0722-160: defensa en profundidad, simetrica a enforce_administrative_no_payment_plan pero sobre wo_payment_installments -- cierra el camino de sync_wo_payment_installments() y de un plan administrativo preexistente al que ya no se le pueden agregar cuotas nuevas. Resuelve la funcion por NEW.wo_id; la igualdad con wo_payment_plan.wo_id ya la garantiza wo_payment_installments_guard_exchange_rate() (INSTALLMENT_WO_MISMATCH).';


--
-- Name: enforce_administrative_no_payment_plan(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_administrative_no_payment_plan() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_funcion smallint;
BEGIN
  SELECT e.funcion INTO v_funcion
    FROM public.work_orders wo
    JOIN public.engagements e ON e.engagement_id = wo.engagement_id
   WHERE wo.wo_id = NEW.wo_id;

  IF v_funcion IS NOT NULL AND v_funcion <> 1 THEN
    RAISE EXCEPTION '0722-160: las OTs administrativas no facturan; no admiten plan de pagos';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION enforce_administrative_no_payment_plan(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enforce_administrative_no_payment_plan() IS '0722-160: defensa en profundidad -- bloquea a nivel de base la escritura de wo_payment_plan para OTs administrativas; hasta ahora solo la UI ocultaba la pestana.';


--
-- Name: enforce_administrative_work_order_rules(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_administrative_work_order_rules() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_funcion smallint;
BEGIN
  SELECT funcion INTO v_funcion
    FROM public.engagements
   WHERE engagement_id = NEW.engagement_id;

  IF v_funcion IS NOT NULL AND v_funcion <> 1 THEN
    -- Las OTs administrativas pueden presupuestar gastos, pero no facturan ni
    -- pasan por Riesgos. Pending representa una pista no aplicable, no aprobada.
    NEW.risk_status := 'Pending';
    NEW.risk_approved_by := NULL;
    NEW.risk_approved_at := NULL;
    NEW.ceac_completed_at := NULL;
    NEW.ceac_notes := NULL;
    NEW.ceac_number := NULL;
    NEW.san_completed_at := NULL;
    NEW.san_notes := NULL;
    NEW.san_approval_id := NULL;
    NEW.risk_level := NULL;
    NEW.risk_notes := NULL;
    NEW.emergency_deadline_at := NULL;
    NEW.emergency_justification := NULL;
    NEW.emergency_review_by := NULL;
    NEW.emergency_review_at := NULL;
    NEW.emergency_partner_by := NULL;
    NEW.emergency_partner_at := NULL;

    -- Review fix (Codex, 3ra vuelta): volver a Draft (retiro) limpia la firma del Socio. Para
    -- una OT administrativa esa firma es lo UNICO que la cierra: useApproveWorkOrder deja el
    -- cierre a este trigger porque su UPDATE condicional filtra por
    -- risk_status IN ('Approved','Emergency_Approved') y aca risk_status queda clavado en
    -- 'Pending'. Si la firma vieja sobrevive al retiro, la re-aprobacion ya no es la transicion
    -- NULL -> no NULL de mas abajo y la OT queda varada en Pending_Approval sin forma de
    -- cerrarse. Hoy la UI evita llegar ahi (WorkOrderForm fuerza riskPending=false para
    -- administrativas, con ese mismo razonamiento escrito), pero la invariante no puede depender
    -- de un flag del frontend: useUnsubmitWorkOrder escribe approval_status='Draft' por
    -- PostgREST sin tocar approved_at.
    IF TG_OP = 'UPDATE'
       AND NEW.approval_status = 'Draft'
       AND OLD.approval_status IS DISTINCT FROM 'Draft' THEN
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;

    -- Para administrativas, la firma del Socio cierra la OT sin una segunda
    -- aprobación. Cliente conserva el motor de dos pistas.
    --
    -- Review fix (Codex, 5ta vuelta): la transicion exige que la OT ESTE en Pending_Approval.
    -- Sin `OLD.approval_status = 'Pending_Approval'` alcanzaba con escribir approved_at sobre una
    -- OT en Draft para que saliera Approved de una, saltandose el envio y la aprobacion del
    -- Socio. Esa puerta la abre este cierre automatico y no existe en Cliente, donde
    -- approval_status lo escribe una sentencia aparte. Se mira OLD y no NEW porque lo que
    -- autoriza el cierre es el estado del que se viene: un UPDATE que traiga Draft y
    -- approval_status='Approved' juntos no puede usar este atajo.
    IF TG_OP = 'UPDATE'
       AND NEW.approved_at IS NOT NULL
       AND OLD.approved_at IS NULL
       AND OLD.approval_status = 'Pending_Approval' THEN
      NEW.approval_status := 'Approved';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION enforce_administrative_work_order_rules(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enforce_administrative_work_order_rules() IS '0722-160: OTs administrativas omiten Riesgos; la aprobación del Socio las cierra.';


--
-- Name: enforce_assignment_practice_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_assignment_practice_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica    smallint;
  v_practica_id  uuid;
  v_cat_practica uuid;
BEGIN
  SELECT e.practica INTO v_practica
    FROM public.engagements e
   WHERE e.engagement_id = NEW.engagement_id;

  IF v_practica IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT practica_id INTO v_practica_id
    FROM public.practicas
   WHERE code = v_practica;

  SELECT practica_id INTO v_cat_practica
    FROM public.categories
   WHERE category_id = NEW.category_id;

  IF v_cat_practica IS DISTINCT FROM v_practica_id THEN
    RAISE EXCEPTION 'Category % does not belong to the engagement''s practice', NEW.category_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_engagement_creator_team(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_engagement_creator_team() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role  text;
  v_staff uuid;
BEGIN
  -- Sin identidad autenticada no hay a quién asignar: seeds, imports, migraciones de backfill y
  -- cualquier operación con service_role pasan intactas.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Espejo EXACTO del `isAdmin` del formulario (`roleKey === "admin"` vía
  -- get_my_authorization_context). A PROPÓSITO no se usa public.is_admin(): esa helper lee el enum
  -- LEGACY `user_roles.role` (20260107032620, nunca redefinida), no `role_key`. Un usuario con
  -- role_key = 'admin' cuyo espejo legacy no diga 'admin' vería su elección reescrita pese a que la
  -- UI se la ofrece editable.
  v_role := public.current_role_key();
  IF v_role IS NULL OR v_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Sin staff vinculado no hay `staff_id` que canonizar. Se deja el payload intacto: escribir NULL
  -- en un campo que el negocio considera obligatorio sería peor, y rechazar dejaría al usuario sin
  -- forma de crear nada. Es el mismo criterio fail-open que aplica la UI, que en ese caso tampoco
  -- bloquea el campo.
  v_staff := public.get_my_staff_id();
  IF v_staff IS NULL THEN
    RETURN NEW;
  END IF;

  -- ESPEJO de src/lib/engagementSelfAssignment.ts (SELF_ASSIGN_PARTNER_ROLE_KEYS /
  -- SELF_ASSIGN_MANAGER_ROLE_KEYS). Si se toca uno, tocar el otro.
  --
  -- BUG 0828-185: ita_manager/tax_manager se agregan al campo Gerente/Supervisor -- ya tienen
  -- engagement.create y ya eran candidatos de Especialista; ahora también se autoasignan como
  -- manager_id igual que Gerente/hr_manager. Quedan deliberadamente FUERA del campo Socio/
  -- Director (sin cambios): senior_partner, risk_partner, risk_supervisor, it_security_manager,
  -- accounting_*, hr_analyst, sqr, senior, semisenior y assistant.
  IF v_role IN ('partner', 'director') THEN
    NEW.partner_id := v_staff;
  ELSIF v_role IN ('manager', 'hr_manager', 'ita_manager', 'tax_manager') THEN
    NEW.manager_id := v_staff;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION enforce_engagement_creator_team(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enforce_engagement_creator_team() IS 'BUG 0810-172 (actualizado 0817-180 y 0828-185): en la CREACIÓN de un encargo canoniza partner_id/manager_id al staff del llamante según su role_key (partner/director -> partner_id; manager/hr_manager/ita_manager/tax_manager -> manager_id). Exentos: role_key admin, inserts sin auth.uid() (seeds/service_role) y llamantes sin staff vinculado. Espejo de src/lib/engagementSelfAssignment.ts. Solo INSERT: el UPDATE no aplica esta regla.';


--
-- Name: enforce_engagement_fiscal_year_invariant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_engagement_fiscal_year_invariant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_derived_fy integer;
BEGIN
  -- Only re-validate when a field this invariant governs actually changes; unrelated updates
  -- (status, name, personnel, dates, etc.) pass through untouched.
  IF NEW.fecha_cierre IS NOT DISTINCT FROM OLD.fecha_cierre
     AND NEW.anio_fiscal IS NOT DISTINCT FROM OLD.anio_fiscal
     AND NEW.anio_fiscal_override IS NOT DISTINCT FROM OLD.anio_fiscal_override THEN
    RETURN NEW;
  END IF;

  IF NEW.fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'Fecha de cierre requerida';
  END IF;

  -- Mirrors getFiscalYearForDate (src/lib/fiscalCalculations.ts) and the check added to
  -- create_engagement_with_code: fiscal year runs Oct 1 -> Sep 30, named by the ending year.
  v_derived_fy := CASE
    WHEN EXTRACT(MONTH FROM NEW.fecha_cierre) >= 10 THEN EXTRACT(YEAR FROM NEW.fecha_cierre)::integer + 1
    ELSE EXTRACT(YEAR FROM NEW.fecha_cierre)::integer
  END;

  -- Admin required to: (a) change the override flag in either direction, or
  -- (b) change anio_fiscal while override is already active.
  -- Non-admins (Manager/Partner/Director) may update fecha_cierre while both the flag and
  -- anio_fiscal stay unchanged (their UI payload carries the same admin-set value).
  IF NEW.anio_fiscal_override IS DISTINCT FROM OLD.anio_fiscal_override
     OR (NEW.anio_fiscal_override AND NEW.anio_fiscal IS DISTINCT FROM OLD.anio_fiscal) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'FORBIDDEN: el override manual del año fiscal requiere rol administrador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NOT NEW.anio_fiscal_override AND NEW.anio_fiscal IS DISTINCT FROM v_derived_fy THEN
    RAISE EXCEPTION 'Año fiscal % no coincide con el derivado de la fecha de cierre % (esperado %)',
      NEW.anio_fiscal, NEW.fecha_cierre, v_derived_fy;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_engagement_profile_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_engagement_profile_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role          text;
  v_staff_id      uuid;
  v_society_id    uuid;
  v_practica_id   uuid;
  v_city          text;
  v_practica_code smallint;
  v_oficina       smallint;
BEGIN
  -- Sin identidad autenticada no hay perfil que comparar: seeds, imports, migraciones y
  -- cualquier operación con service_role pasan intactas.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.current_role_key();

  IF TG_OP = 'INSERT' THEN
    -- El RPC create_engagement_with_code es SECURITY DEFINER y saltea la RLS de INSERT
    -- ("engagements write insert" exige engagement.create); replicar el mismo chequeo acá cierra
    -- ese hueco tanto para el RPC como para un INSERT REST directo.
    IF NOT public.has_permission('engagement.create') THEN
      RAISE EXCEPTION 'FORBIDDEN: falta el permiso engagement.create'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Super Admin (role_key = 'admin') y Senior Partner eligen sociedad/practica/oficina libres.
    -- senior_partner no tiene engagement.create en el seed vigente (decisión del operador,
    -- 0817-180 OQ2/OQ6): el chequeo de arriba ya lo rechaza antes de llegar acá, pero la exención
    -- queda escrita por corrección — cumple la letra del bug aunque hoy sea inalcanzable.
    IF v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'senior_partner' THEN
      SELECT s.staff_id, s.society_id, s.practica_id, s.city
        INTO v_staff_id, v_society_id, v_practica_id, v_city
        FROM public.staff s
       WHERE s.staff_id = public.get_my_staff_id();

      IF v_staff_id IS NULL OR v_society_id IS NULL OR v_practica_id IS NULL OR v_city IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: tu ficha de personal no tiene sociedad, practica u oficina configuradas — no se puede crear el encargo'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      SELECT p.code INTO v_practica_code
        FROM public.practicas p
       WHERE p.practica_id = v_practica_id AND p.is_active;

      IF v_practica_code IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: la practica de tu ficha de personal no esta activa en el catalogo'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      v_oficina := CASE v_city WHEN 'La Paz' THEN 1 WHEN 'Santa Cruz' THEN 2 ELSE NULL END;

      IF NEW.society_id IS DISTINCT FROM v_society_id
         OR NEW.practica  IS DISTINCT FROM v_practica_code
         OR NEW.oficina   IS DISTINCT FROM v_oficina
      THEN
        RAISE EXCEPTION 'FORBIDDEN: sociedad/practica/oficina del encargo deben coincidir exactamente con tu ficha de personal'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'. Solo se inspecciona el CAMBIO de estas tres columnas (IS DISTINCT FROM
  -- contra OLD) — un update que no las toca (nombre, fechas, equipo, etc.) nunca entra acá, así
  -- que no bloquea actualizaciones legítimas de encargos ajenos.

  -- 0722-157, sin cambios: society_id lo sigue editando solo admin tras la creación.
  IF NEW.society_id IS DISTINCT FROM OLD.society_id AND v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: solo Admin puede modificar la sociedad de un encargo existente'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ninguna UI ha ofrecido nunca editar oficina/practica a nadie (disabled={isEdit} sin
  -- excepción de rol) — el guard de BD no abre una vía nueva que la UI nunca tuvo, ni siquiera
  -- para admin: cambiarlas desincronizaría engagement_code de sus dígitos.
  IF NEW.oficina IS DISTINCT FROM OLD.oficina OR NEW.practica IS DISTINCT FROM OLD.practica THEN
    RAISE EXCEPTION 'FORBIDDEN: oficina y practica son inmutables una vez creado el encargo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION enforce_engagement_profile_scope(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enforce_engagement_profile_scope() IS 'BUG 0817-180: en INSERT exige engagement.create y, para role_key distinto de admin/senior_partner, que society_id/practica/oficina coincidan con la ficha del creador (staff.society_id/practica_id->code/city->1|2); perfil incompleto o practica inactiva rechaza (fail-closed). En UPDATE, asimetrico: society_id solo lo edita admin (0722-157); oficina/practica quedan inmutables para todos. Exento: auth.uid() IS NULL (seeds/migraciones/service_role).';


--
-- Name: enforce_holiday_blocking(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_holiday_blocking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_holiday_name text;
  v_raw text;
  v_setting text;
  v_holiday_engagement_id uuid;
  v_staff_city text;
BEGIN
  SELECT city INTO v_staff_city FROM staff WHERE staff_id = NEW.staff_id;

  -- Check if date_worked is a holiday applicable to this staff's office
  SELECT holiday_name INTO v_holiday_name
  FROM holidays
  WHERE holiday_date = NEW.date_worked
    AND (
      oficina = 0
      OR (oficina = 1 AND v_staff_city = 'La Paz')
      OR (oficina = 2 AND v_staff_city = 'Santa Cruz')
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;  -- Not a holiday applicable to this staff's office, allow
  END IF;

  -- Read the holiday engagement setting
  SELECT setting_value INTO v_raw
  FROM global_settings
  WHERE setting_key = 'HOLIDAY_ENGAGEMENT_ID';

  v_setting := NULLIF(TRIM(v_raw), '');

  IF v_setting IS NULL THEN
    RAISE EXCEPTION 'HOLIDAY_NOT_CONFIGURED';
  END IF;

  v_holiday_engagement_id := v_setting::uuid;

  IF NEW.engagement_id != v_holiday_engagement_id THEN
    RAISE EXCEPTION 'HOLIDAY_BLOCKED:%', v_holiday_name;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_termination_date(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_termination_date() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_term date;
BEGIN
  SELECT termination_date INTO v_term
  FROM staff WHERE staff_id = NEW.staff_id;
  IF v_term IS NOT NULL AND NEW.date_worked > v_term THEN
    RAISE EXCEPTION 'TERMINATION_DATE_BLOCKED: Cannot log time after termination date %', v_term;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: enforce_wo_staffing_practice_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_wo_staffing_practice_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica    smallint;
  v_practica_id  uuid;
  v_cat_practica uuid;
BEGIN
  SELECT e.practica INTO v_practica
    FROM public.work_orders wo
    JOIN public.engagements e ON e.engagement_id = wo.engagement_id
   WHERE wo.wo_id = NEW.wo_id;

  -- Engagement sin servicio asignado: sin scope, igual que el precedente.
  IF v_practica IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT practica_id INTO v_practica_id
    FROM public.practicas
   WHERE code = v_practica;

  SELECT practica_id INTO v_cat_practica
    FROM public.categories
   WHERE category_id = NEW.category_id;

  IF v_cat_practica IS DISTINCT FROM v_practica_id THEN
    RAISE EXCEPTION 'Category % does not belong to the work order''s engagement practice', NEW.category_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_worksheet_cell_practice_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_worksheet_cell_practice_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica       smallint;
  v_practica_id    uuid;
  v_cat_practica   uuid;
  v_act_practica   uuid;
  v_act_is_system  boolean;
BEGIN
  SELECT e.practica INTO v_practica
    FROM public.activity_worksheets aw
    JOIN public.engagements e ON e.engagement_id = aw.engagement_id
   WHERE aw.id = NEW.worksheet_id;

  -- A worksheet whose engagement has no assigned practice accepts no cells at
  -- all (the frontend keeps the grid empty and purges any payload — 0825-183).
  IF v_practica IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'WORKSHEET_PRACTICE_REQUIRED',
      DETAIL = format('worksheet_id=%s reason=no_practica', NEW.worksheet_id);
  END IF;

  SELECT practica_id INTO v_practica_id
    FROM public.practicas
   WHERE code = v_practica;

  -- A practica code that doesn't resolve to any practicas row is just as
  -- unusable as no practica at all — same precedence, same code (review.md
  -- iteración 1, #3).
  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'WORKSHEET_PRACTICE_REQUIRED',
      DETAIL = format('worksheet_id=%s reason=unresolved_practica_code practica_code=%s', NEW.worksheet_id, v_practica);
  END IF;

  SELECT practica_id INTO v_cat_practica
    FROM public.categories
   WHERE category_id = NEW.category_id;

  IF v_cat_practica IS DISTINCT FROM v_practica_id THEN
    RAISE EXCEPTION USING
      MESSAGE = 'WORKSHEET_CATEGORY_OUT_OF_SCOPE',
      DETAIL = format('worksheet_id=%s category_id=%s', NEW.worksheet_id, NEW.category_id);
  END IF;

  SELECT practica_id, is_system INTO v_act_practica, v_act_is_system
    FROM public.activity_codes
   WHERE activity_id = NEW.activity_id;

  -- Global/system activities (practica_id IS NULL, e.g. ADM) no longer qualify
  -- as valid for any practice, and is_system is checked independently of
  -- practica_id so a hypothetical system activity carrying the engagement's own
  -- practica_id is still rejected (0825-183; review.md iteración 1, #2).
  IF v_act_practica IS DISTINCT FROM v_practica_id OR v_act_is_system IS NOT FALSE THEN
    RAISE EXCEPTION USING
      MESSAGE = 'WORKSHEET_ACTIVITY_OUT_OF_SCOPE',
      DETAIL = format('worksheet_id=%s activity_id=%s', NEW.worksheet_id, NEW.activity_id);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: engagement_accepts_assignment_writes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_accepts_assignment_writes(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT engagement_state_override NOT IN (6, 7)
       FROM public.engagements
      WHERE engagement_id = p_engagement_id),
    true)  -- override NULL (estado derivado 1..5/8) o engagement inexistente ⇒ escribible
$$;


--
-- Name: engagement_allows_hours_or_requests(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_allows_hours_or_requests(p_engagement_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_override    smallint;
  v_wo_required boolean;
  v_approval    text;
  v_risk        text;
BEGIN
  SELECT e.engagement_state_override, e.work_order_required
    INTO v_override, v_wo_required
  FROM public.engagements e WHERE e.engagement_id = p_engagement_id;

  -- Override manual manda: solo 4/5 permiten.
  IF v_override IS NOT NULL THEN
    RETURN v_override IN (4, 5);
  END IF;
  -- Administrativo (sin OT) = Aprobado.
  IF v_wo_required = false THEN
    RETURN true;
  END IF;
  -- Derivado: OT aprobada y NO risk-rejected (=8 Rechazado).
  SELECT approval_status, risk_status INTO v_approval, v_risk
  FROM public.work_orders WHERE engagement_id = p_engagement_id;
  RETURN v_approval = 'Approved' AND v_risk IS DISTINCT FROM 'Rejected';
END;
$$;


--
-- Name: engagement_approval_bucket(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_approval_bucket(p_staff_id uuid, p_status text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
           'count', COUNT(*),
           'items', COALESCE(jsonb_agg(jsonb_build_object(
                      'engagement_id',   e.engagement_id,
                      'engagement_code', e.engagement_code,
                      'engagement_name', e.engagement_name)
                    ORDER BY e.engagement_code), '[]'::jsonb))
    FROM public.engagements e
    JOIN public.work_orders wo ON wo.engagement_id = e.engagement_id
   WHERE e.created_by_staff_id = p_staff_id
     AND wo.approval_status = p_status
     AND (e.engagement_state_override IS NULL
          OR e.engagement_state_override NOT IN (6, 7));
$$;


--
-- Name: FUNCTION engagement_approval_bucket(p_staff_id uuid, p_status text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.engagement_approval_bucket(p_staff_id uuid, p_status text) IS 'Helper de get_my_notification_aggregates(): encargos creados por p_staff_id cuya OT está en p_status, excluyendo Cancelado (6) y Finalizado (7).';


--
-- Name: engagement_in_my_fund_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_in_my_fund_request(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.fund_request_work_orders frwo
    join public.fund_requests fr on fr.fund_request_id = frwo.fund_request_id
    join public.work_orders  wo on wo.wo_id = frwo.wo_id
    where wo.engagement_id = p_engagement_id
      and fr.status <> 'borrador'
      and (
        fr.requester_staff_id = get_my_staff_id()
        or frwo.manager_staff_id = get_my_staff_id()
        -- Contabilidad, con el MISMO corte que fr_select_accounting (Ola D):
        --   Gerente (fund_disbursement.read)  -> toda la fase contable.
        --   Analista (expense_settlement.read) -> hasta 'fondos_entregados'; queda
        --   fuera de 'en_liquidacion' y 'cerrado'.
        or (public.has_permission('fund_disbursement.read')
            and fr.status = any (array['aprobado_gerente','fondos_entregados',
                                       'en_liquidacion','cerrado']::fund_request_status[]))
        or (public.has_permission('expense_settlement.read')
            and fr.status = any (array['aprobado_gerente','fondos_entregados']::fund_request_status[]))
      )
  );
$$;


--
-- Name: FUNCTION engagement_in_my_fund_request(p_engagement_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.engagement_in_my_fund_request(p_engagement_id uuid) IS 'True si el encargo pertenece a una OT incluida en una solicitud de fondos ENVIADA donde el usuario es solicitante o gerente de esa OT. Espejo de wo_in_my_fund_request para el nivel encargo (embed anidado del select de fondos).';


--
-- Name: engagement_is_approved_state(uuid, smallint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_is_approved_state(p_engagement_id uuid, p_override smallint, p_wo_required boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Override manual gana: solo el 4 (Aprobado) cuenta como aprobado.
  IF p_override IS NOT NULL THEN
    RETURN p_override = 4;
  END IF;
  -- Derivado: administrativo (sin OT) = Aprobado.
  IF p_wo_required = false THEN
    RETURN true;
  END IF;
  -- Derivado: estado 4 Aprobado = OT aprobada, NO en emergencia (sería 5) y NO risk-rejected
  -- (sería 8 Rechazado). Ambos se excluyen del auto-cierre.
  RETURN EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.engagement_id = p_engagement_id
      AND wo.approval_status = 'Approved'
      AND wo.risk_status IS DISTINCT FROM 'Emergency_Approved'
      AND wo.risk_status IS DISTINCT FROM 'Rejected'
  );
END;
$$;


--
-- Name: engagement_overview(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_overview(p_engagement_id uuid, p_start date, p_end date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_today           date;
  v_week_start      date;
  v_prev_week_start date;
  v_alert_weeks     int;
  v_role            text;
  v_result          jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: no session';
  END IF;
  IF NOT public.has_permission('dashboard.engagement.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.engagement.read';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  v_today := ((now() AT TIME ZONE 'America/La_Paz')::date);
  v_week_start := date_trunc('week', v_today)::date;
  v_prev_week_start := v_week_start - 7;
  v_role := public.current_role_key();

  -- Lectura tolerante del setting (plan_v2.md §6.2, R-5): vacío/no numérico/fuera de
  -- [1,52] -> 3. Nunca lanza (::int sobre 'abc' sí lanzaría sin el regexp_replace).
  v_alert_weeks := COALESCE(
    NULLIF(regexp_replace(
      COALESCE((SELECT setting_value FROM public.global_settings
                 WHERE setting_key = 'DASH_ENGAGEMENT_PENDING_ALERT_WEEKS'), ''),
      '[^0-9]', '', 'g'), '')::int, 3);
  IF v_alert_weeks < 1 OR v_alert_weeks > 52 THEN
    v_alert_weeks := 3;
  END IF;

  IF NOT public.can_read_engagement_dashboard(p_engagement_id) THEN
    RETURN jsonb_build_object(
      'meta', jsonb_build_object(
        'engagement_id', p_engagement_id,
        'selected_accessible', false,
        'today', v_today,
        'alert_weeks', v_alert_weeks
      ),
      'detail', null
    );
  END IF;

  v_result := (
  WITH
  -- ── Encargo + cliente ─────────────────────────────────────────────────────────────────
  eng AS (
    SELECT e.*, cl.client_legal_name
    FROM public.engagements e
    JOIN public.clients cl ON cl.client_id = e.client_id
    WHERE e.engagement_id = p_engagement_id
  ),

  -- ── KPI Staffing (§4.1/§7.3): fracción de asignados con Cargado > 0, semana actual y
  -- semana pasada. Asignaciones vigentes = deleted_at IS NULL, status <> 'CANCELLED', con
  -- solape [start_date,end_date] contra la semana (D-2). ────────────────────────────────
  assigned_current AS (
    SELECT DISTINCT ea.staff_id
    FROM public.engagement_assignments ea
    WHERE ea.engagement_id = p_engagement_id
      AND ea.deleted_at IS NULL AND ea.status <> 'CANCELLED'
      AND ea.start_date <= (v_week_start + 6) AND ea.end_date >= v_week_start
  ),
  assigned_previous AS (
    SELECT DISTINCT ea.staff_id
    FROM public.engagement_assignments ea
    WHERE ea.engagement_id = p_engagement_id
      AND ea.deleted_at IS NULL AND ea.status <> 'CANCELLED'
      AND ea.start_date <= (v_prev_week_start + 6) AND ea.end_date >= v_prev_week_start
  ),
  logged_current AS (
    SELECT te.staff_id, SUM(te.hours_logged) AS hours
    FROM public.time_entries te
    WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
      AND date_trunc('week', te.date_worked) = v_week_start
    GROUP BY te.staff_id
  ),
  logged_previous AS (
    SELECT te.staff_id, SUM(te.hours_logged) AS hours
    FROM public.time_entries te
    WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
      AND date_trunc('week', te.date_worked) = v_prev_week_start
    GROUP BY te.staff_id
  ),
  kpi_staffing AS (
    SELECT
      (SELECT COUNT(*) FROM assigned_current) AS current_assigned,
      (SELECT COUNT(*) FROM assigned_current ac JOIN logged_current lc ON lc.staff_id = ac.staff_id WHERE lc.hours > 0) AS current_logged,
      (SELECT COUNT(*) FROM assigned_previous) AS previous_assigned,
      (SELECT COUNT(*) FROM assigned_previous ap JOIN logged_previous lp ON lp.staff_id = ap.staff_id WHERE lp.hours > 0) AS previous_logged
  ),

  -- ── KPI Horas pendientes de aprobación (§4.1): join a timesheet_line_approvals
  -- status='pending' -- horas sin fila de aprobación NUNCA cuentan acá (R-4). staff_id viaja
  -- acá (corrección post-ejecución #2) para alimentar approval_queue_* más abajo sin un
  -- segundo barrido de timesheet_line_approvals -- no cambia kpi_pending, que sigue leyendo
  -- exactamente las mismas columnas que ya usaba. ─────────────────────────────────────────
  pending_lines AS (
    SELECT tla.approval_id, tp.week_start_date, tp.staff_id, tesum.hours
    FROM public.timesheet_line_approvals tla
    JOIN public.timesheet_periods tp ON tp.period_id = tla.period_id
    LEFT JOIN LATERAL (
      SELECT SUM(te.hours_logged) AS hours
      FROM public.time_entries te
      WHERE te.period_id = tla.period_id AND te.engagement_id = tla.engagement_id
        AND te.activity_id = tla.activity_id AND COALESCE(te.is_forecast, false) = false
    ) tesum ON true
    WHERE tla.engagement_id = p_engagement_id AND tla.status = 'pending'
  ),
  kpi_pending AS (
    SELECT
      COALESCE(SUM(hours) FILTER (WHERE week_start_date = v_prev_week_start), 0) AS last_week_hours,
      COALESCE(SUM(hours) FILTER (WHERE FLOOR((v_today - week_start_date) / 7.0) >= v_alert_weeks), 0) AS aged_hours
    FROM pending_lines
  ),

  -- ── Cola de Aprobación por persona (corrección post-ejecución #2, acordada con el
  -- operador): a diferencia del KPI de arriba (agregado, sin desglose), acá se consolida
  -- pending_lines POR PERSONA -- horas totales pendientes de esa persona en este encargo
  -- (suma de TODAS sus líneas pendientes, no solo la más vieja) y weeks_old de su línea más
  -- antigua (MAX, ya que week_start_date más chico = más vieja = days_old/weeks_old más
  -- grande). `alert` reutiliza v_alert_weeks -- MISMO umbral que ya usa aged_hours arriba,
  -- ninguna fuente de verdad nueva (review.md iteración 1, MF-05, decisión del operador:
  -- "crítico" en el frontend es exactamente este `alert` -- sin un segundo escalón más
  -- severo; encargoOverviewAggregation.ts no recibe ni calcula ningún umbral adicional).
  -- ─────────────────────────────────────────────────────────────────────────────────────
  approval_queue_staff AS (
    SELECT pl.staff_id, COALESCE(SUM(pl.hours), 0) AS hours,
      MAX(FLOOR((v_today - pl.week_start_date) / 7.0))::int AS weeks_old
    FROM pending_lines pl
    WHERE pl.staff_id IS NOT NULL
    GROUP BY pl.staff_id
  ),
  approval_queue_rows AS (
    SELECT
      aqs.staff_id,
      COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))) AS staff_name,
      aqs.hours, aqs.weeks_old,
      (aqs.weeks_old >= v_alert_weeks) AS alert
    FROM approval_queue_staff aqs
    LEFT JOIN public.staff s ON s.staff_id = aqs.staff_id
  ),
  approval_queue_json AS (
    SELECT
      COALESCE(SUM(hours), 0) AS total_hours,
      COUNT(*) AS distinct_people,
      COALESCE(jsonb_agg(jsonb_build_object(
        'staff_id', staff_id, 'staff_name', staff_name, 'hours', hours,
        'weeks_old', weeks_old, 'alert', alert
      ) ORDER BY weeks_old DESC, hours DESC, staff_name), '[]'::jsonb) AS items
    FROM approval_queue_rows
  ),

  -- ── KPI Última carga / Última aprobación (§4.1) ─────────────────────────────────────
  kpi_last_entry AS (
    SELECT MAX(te.date_worked) AS last_date
    FROM public.time_entries te
    WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
  ),
  kpi_last_approval AS (
    SELECT MAX(tla.approved_at) AS last_at
    FROM public.timesheet_line_approvals tla
    WHERE tla.engagement_id = p_engagement_id AND tla.status = 'approved'
  ),

  -- ── Consumo de presupuesto (§4.2, sin cambios) -- mismas fuentes que EncargoTab hoy ──
  budget_hours_cte AS (
    SELECT COALESCE(SUM(total_budget_hours), 0) AS hours
    FROM public.vw_wo_budget_hours_by_category
    WHERE engagement_id = p_engagement_id
  ),
  actual_hours_cte AS (
    SELECT COALESCE(SUM(te.hours_logged), 0) AS hours
    FROM public.time_entries te
    WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
      AND te.date_worked BETWEEN p_start AND p_end
  ),

  -- ── Desglose Categoría->Actividad unificado (§4.3): fuente única, sin filtro de fecha,
  -- ocultando filas 0/0. ──────────────────────────────────────────────────────────────
  breakdown_rows AS (
    SELECT category_id, category_name, category_display_order, activity_id, activity_code,
           activity_description, budget_hours, actual_hours, variance_hours
    FROM public.vw_budget_vs_actual_hours_by_category_activity
    WHERE engagement_id = p_engagement_id
      AND NOT (budget_hours = 0 AND actual_hours = 0)
  ),
  breakdown_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'category_id', category_id, 'category_name', category_name,
      'category_display_order', category_display_order,
      'activity_id', activity_id, 'activity_code', activity_code,
      'activity_description', activity_description,
      'budget_hours', budget_hours, 'actual_hours', actual_hours, 'variance_hours', variance_hours
    ) ORDER BY category_display_order NULLS LAST, category_name, activity_code, activity_id), '[]'::jsonb) AS items
    FROM breakdown_rows
  ),

  -- ── Equipo responsable (§4.4): 6 roles formales, NULL -> "-" en el frontend. ────────
  team_raw AS (
    SELECT
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.partner_id) AS partner,
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.manager_id) AS manager,
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.encargado_id) AS encargado,
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.specialist_it_id) AS specialist_it,
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.specialist_tax_id) AS specialist_tax,
      (SELECT jsonb_build_object('staff_id', s.staff_id, 'display_name', COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))))
         FROM public.staff s WHERE s.staff_id = eng.sqr_id) AS sqr
    FROM eng
  ),

  -- ── Staffing (§4.5/§7.4): universo = FULL JOIN conceptual asignados <-> quienes cargaron
  -- horas. Una fila por persona. ──────────────────────────────────────────────────────
  assignments AS (
    SELECT ea.staff_id, ea.start_date, ea.end_date, ea.hours_per_week, ea.allocation_percent,
           ea.category_id, ea.updated_at
    FROM public.engagement_assignments ea
    WHERE ea.engagement_id = p_engagement_id
      AND ea.deleted_at IS NULL AND ea.status <> 'CANCELLED'
  ),
  staffing_universe AS (
    SELECT staff_id FROM assignments
    UNION
    SELECT te.staff_id
    FROM public.time_entries te
    WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
  ),
  -- D-1: "semanas del rango" = semanas calendario tocadas, lunes a lunes.
  -- review.md dash_encargo iteración 3, G-01 (2026-09-22): hours_per_week YA es el
  -- compromiso semanal real de la asignación, no una tasa nominal a prorratear -- confirmado
  -- por personal_overview() ("hours_per_week completo... sin prorrateo") y por
  -- computeUtilizationBands() del scheduler (suma hours_per_week directo entre asignaciones
  -- superpuestas). Multiplicar por allocation_percent/100 aquí contaba la dedicación parcial
  -- dos veces (una asignación real de 20 h/semana al 50% quedaba en 10 h/semana).
  assignment_hours AS (
    SELECT staff_id,
      SUM(hours_per_week *
        (((date_trunc('week', end_date)::date - date_trunc('week', start_date)::date) / 7) + 1)
      ) AS assigned_hours
    FROM assignments
    GROUP BY staff_id
  ),
  -- Alerta binaria de "semana en cero" (§4.5.a): recorre cada semana calendario tocada por
  -- CUALQUIERA de las asignaciones de la persona (hasta hoy, sin evaluar semanas futuras) y
  -- marca si esa semana tuvo cero horas cargadas en este encargo.
  assignment_weeks AS (
    SELECT a.staff_id, gw.week_start::date AS week_start
    FROM assignments a
    CROSS JOIN LATERAL generate_series(
      date_trunc('week', a.start_date),
      LEAST(date_trunc('week', a.end_date), date_trunc('week', v_today)),
      interval '7 days'
    ) AS gw(week_start)
  ),
  zero_week_flags AS (
    SELECT aw.staff_id, bool_or(COALESCE(wk.hours, 0) = 0) AS has_zero_week
    FROM assignment_weeks aw
    LEFT JOIN LATERAL (
      SELECT SUM(te.hours_logged) AS hours
      FROM public.time_entries te
      WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
        AND te.staff_id = aw.staff_id AND date_trunc('week', te.date_worked) = aw.week_start
    ) wk ON true
    GROUP BY aw.staff_id
  ),
  -- Categoría: staff.category_id primero (coincide con el desglose de la misma pantalla);
  -- fallback a la categoría de la asignación no cancelada más reciente (staff.category_id
  -- es nullable).
  staff_category AS (
    SELECT su.staff_id, COALESCE(cat_own.category_name, cat_fallback.category_name) AS category_name
    FROM staffing_universe su
    LEFT JOIN public.staff s ON s.staff_id = su.staff_id
    LEFT JOIN public.categories cat_own ON cat_own.category_id = s.category_id
    LEFT JOIN LATERAL (
      SELECT c.category_name
      FROM public.engagement_assignments ea2
      JOIN public.categories c ON c.category_id = ea2.category_id
      WHERE ea2.staff_id = su.staff_id AND ea2.engagement_id = p_engagement_id
        AND ea2.status <> 'CANCELLED' AND ea2.deleted_at IS NULL
      ORDER BY ea2.updated_at DESC
      LIMIT 1
    ) cat_fallback ON true
  ),
  people_rows AS (
    SELECT
      su.staff_id,
      COALESCE(s.short_name, TRIM(BOTH FROM (COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')))) AS display_name,
      sc.category_name,
      COALESCE(ah.assigned_hours, 0) AS assigned_hours,
      COALESCE(zwf.has_zero_week, false) AS zero_week_alert
    FROM staffing_universe su
    LEFT JOIN public.staff s ON s.staff_id = su.staff_id
    LEFT JOIN staff_category sc ON sc.staff_id = su.staff_id
    LEFT JOIN assignment_hours ah ON ah.staff_id = su.staff_id
    LEFT JOIN zero_week_flags zwf ON zwf.staff_id = su.staff_id
  ),
  people_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'staff_id', staff_id, 'display_name', display_name, 'category_name', category_name,
      'assigned_hours', assigned_hours, 'zero_week_alert', zero_week_alert
    ) ORDER BY display_name, staff_id), '[]'::jsonb) AS items
    FROM people_rows
  ),
  -- Las 9 semanas: offset -4..+4 respecto de la semana actual, precargadas en el payload
  -- (plan_v2.md §3.1/§4.5: cero requests al navegar el modal).
  staff_earliest AS (
    SELECT su.staff_id,
      COALESCE(
        (SELECT MIN(date_trunc('week', a.start_date))::date FROM assignments a WHERE a.staff_id = su.staff_id),
        (SELECT MIN(date_trunc('week', te.date_worked))::date FROM public.time_entries te
           WHERE te.staff_id = su.staff_id AND te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false)
      ) AS earliest_start
    FROM staffing_universe su
  ),
  weeks_base AS (
    SELECT gs AS week_offset,
           (v_week_start + (gs * 7)) AS week_start,
           (v_week_start + (gs * 7) + 6) AS week_end,
           EXTRACT(WEEK FROM (v_week_start + (gs * 7)))::int AS week_number
    FROM generate_series(-4, 4) gs
  ),
  week_rows AS (
    SELECT
      wb.week_offset, wb.week_start,
      su.staff_id,
      COALESCE(lw.hours, 0) AS logged_hours,
      COALESCE(uw.hours, 0) AS used_hours
    FROM weeks_base wb
    CROSS JOIN staffing_universe su
    LEFT JOIN staff_earliest se ON se.staff_id = su.staff_id
    LEFT JOIN LATERAL (
      SELECT SUM(te.hours_logged) AS hours
      FROM public.time_entries te
      WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
        AND te.staff_id = su.staff_id AND date_trunc('week', te.date_worked) = wb.week_start
    ) lw ON true
    LEFT JOIN LATERAL (
      SELECT SUM(te.hours_logged) AS hours
      FROM public.time_entries te
      WHERE te.engagement_id = p_engagement_id AND COALESCE(te.is_forecast, false) = false
        AND te.staff_id = su.staff_id
        AND te.date_worked <= wb.week_end
        AND (se.earliest_start IS NULL OR te.date_worked >= se.earliest_start)
    ) uw ON true
  ),
  weeks_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'offset', wb.week_offset, 'week_start', wb.week_start, 'week_end', wb.week_end,
        'week_number', wb.week_number,
        'rows', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('staff_id', wr.staff_id, 'logged_hours', wr.logged_hours, 'used_hours', wr.used_hours) ORDER BY wr.staff_id)
          FROM week_rows wr WHERE wr.week_offset = wb.week_offset
        ), '[]'::jsonb)
      ) ORDER BY wb.week_offset
    ), '[]'::jsonb) AS items
    FROM weeks_base wb
  ),

  -- ── Gastos (§4.6/§7.5): normalizado a BOB, mismo rate_to_bob que dash_cartera/dash_socio.
  -- Presupuesto solo de OT Approved (D-3); gastos reales de todas las OT del encargo. ────
  wo_scope AS (
    SELECT wo.wo_id, wo.currency, wo.approval_status, p.exchange_rate AS plan_exchange_rate
    FROM public.work_orders wo
    LEFT JOIN public.wo_payment_plan p ON p.wo_id = wo.wo_id
    WHERE wo.engagement_id = p_engagement_id
  ),
  wo_rate AS (
    SELECT wo_id, approval_status,
      CASE WHEN currency = 'BOB' THEN 1
           WHEN plan_exchange_rate IS NOT NULL THEN plan_exchange_rate
           WHEN currency = 'USD' THEN public.latest_exchange_rate()
           ELSE NULL END AS rate_to_bob
    FROM wo_scope
  ),
  expense_budget_bob AS (
    SELECT COALESCE(SUM(web.budgeted_amount * wr.rate_to_bob), 0) AS budget_bob
    FROM wo_rate wr
    JOIN public.wo_expense_budget web ON web.wo_id = wr.wo_id
    WHERE wr.approval_status = 'Approved'
  ),
  expense_amount_bob AS (
    SELECT fre.fre_id, fre.expense_date, fre.description, fre.amount, fre.currency, fre.status,
      (fre.amount * CASE fre.currency WHEN 'BOB' THEN 1 ELSE COALESCE(wr.rate_to_bob, public.latest_exchange_rate()) END) AS amount_bob
    FROM public.fund_request_expenses fre
    JOIN wo_rate wr ON wr.wo_id = fre.wo_id
  ),
  executed_bob_cte AS (
    SELECT COALESCE(SUM(amount_bob) FILTER (WHERE status = 'revisado_asistente'), 0) AS executed_bob
    FROM expense_amount_bob
  ),
  approved_expenses_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fre_id', fre_id, 'expense_date', expense_date, 'description', description,
      'amount', amount, 'currency', currency, 'amount_bob', amount_bob, 'status', status
    ) ORDER BY expense_date DESC, fre_id DESC), '[]'::jsonb) AS items
    FROM (SELECT * FROM expense_amount_bob WHERE status = 'revisado_asistente' ORDER BY expense_date DESC, fre_id DESC LIMIT 5) t
  ),
  pending_expenses_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fre_id', fre_id, 'expense_date', expense_date, 'description', description,
      'amount', amount, 'currency', currency, 'amount_bob', amount_bob, 'status', status
    ) ORDER BY expense_date DESC, fre_id DESC), '[]'::jsonb) AS items
    FROM (SELECT * FROM expense_amount_bob WHERE status IN ('pendiente_aprobacion', 'aprobado_gerente') ORDER BY expense_date DESC, fre_id DESC LIMIT 5) t
  ),
  -- display_status (§4.6/§5.3): pendiente_gerente / aprobado_pendiente_desembolso /
  -- desembolsado / observado / rechazado. Excluye solicitudes padre en borrador (D-4:
  -- approval_status='pendiente' por default ahi, y aparecerian falsamente como pendientes).
  requests_raw AS (
    SELECT frwo.fr_wo_id, frwo.fund_request_id, fr.request_number, frwo.allocated_amount,
      fr.currency,
      CASE fr.currency WHEN 'BOB' THEN 1 ELSE COALESCE(wr.rate_to_bob, public.latest_exchange_rate()) END AS rate_to_bob,
      CASE
        WHEN frwo.approval_status = 'pendiente' THEN 'pendiente_gerente'
        WHEN frwo.approval_status = 'aprobado' AND fr.status NOT IN ('fondos_entregados', 'en_liquidacion', 'cerrado') THEN 'aprobado_pendiente_desembolso'
        WHEN frwo.approval_status = 'aprobado' AND fr.status IN ('fondos_entregados', 'en_liquidacion', 'cerrado') THEN 'desembolsado'
        WHEN frwo.approval_status = 'observado' THEN 'observado'
        WHEN frwo.approval_status = 'rechazado' THEN 'rechazado'
      END AS display_status,
      frwo.manager_decided_at,
      COALESCE(fr.submitted_at, fr.created_at) AS submitted_at
    FROM public.fund_request_work_orders frwo
    JOIN wo_rate wr ON wr.wo_id = frwo.wo_id
    JOIN public.fund_requests fr ON fr.fund_request_id = frwo.fund_request_id
    WHERE fr.status <> 'borrador'
  ),
  requests_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fr_wo_id', fr_wo_id, 'fund_request_id', fund_request_id, 'request_number', request_number,
      'allocated_amount', allocated_amount, 'currency', currency,
      'allocated_amount_bob', allocated_amount * rate_to_bob,
      'display_status', display_status, 'decided_at', manager_decided_at, 'submitted_at', submitted_at
    ) ORDER BY submitted_at DESC, fr_wo_id DESC), '[]'::jsonb) AS items
    FROM (SELECT * FROM requests_raw ORDER BY submitted_at DESC, fr_wo_id DESC LIMIT 5) t
  )

  -- ── Ensamblado final (plan_v2.md §7.3: forma exacta del payload) ────────────────────
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'engagement_id', eng.engagement_id,
      'engagement_code', eng.engagement_code,
      'engagement_name', eng.engagement_name,
      'client_legal_name', eng.client_legal_name,
      'role_key', v_role,
      'today', v_today,
      'week_start', v_week_start,
      'prev_week_start', v_prev_week_start,
      'period_start', p_start,
      'period_end', p_end,
      'alert_weeks', v_alert_weeks,
      'selected_accessible', true
    ),
    'detail', jsonb_build_object(
      'kpis', jsonb_build_object(
        'staffing', jsonb_build_object(
          'current', jsonb_build_object('logged', ks.current_logged, 'assigned', ks.current_assigned),
          'previous', jsonb_build_object('logged', ks.previous_logged, 'assigned', ks.previous_assigned)
        ),
        'pending_approval', jsonb_build_object('last_week_hours', kp.last_week_hours, 'aged_hours', kp.aged_hours),
        'last_time_entry', jsonb_build_object(
          'date', kle.last_date,
          'days', CASE WHEN kle.last_date IS NULL THEN NULL ELSE (v_today - kle.last_date) END
        ),
        'last_approval', jsonb_build_object(
          'date', kla.last_at::date,
          'days', CASE WHEN kla.last_at IS NULL THEN NULL ELSE (v_today - kla.last_at::date) END
        )
      ),
      'budget', jsonb_build_object(
        'budget_hours', bh.hours, 'actual_hours', ah.hours,
        'consumed_percent', CASE WHEN bh.hours > 0 THEN (ah.hours / bh.hours) * 100 ELSE 0 END
      ),
      'breakdown', bj.items,
      'team', jsonb_build_object(
        'partner', tr.partner, 'manager', tr.manager, 'encargado', tr.encargado,
        'specialist_it', tr.specialist_it, 'specialist_tax', tr.specialist_tax, 'sqr', tr.sqr
      ),
      'staffing', jsonb_build_object('people', pj.items, 'weeks', wj.items),
      'expenses', jsonb_build_object(
        'budget_bob', ebb.budget_bob, 'executed_bob', ebc.executed_bob,
        'executed_percent', CASE WHEN ebb.budget_bob > 0 THEN (ebc.executed_bob / ebb.budget_bob) * 100 ELSE 0 END,
        'approved', aej.items, 'pending', pej.items, 'requests', rj.items
      ),
      'approval_queue', jsonb_build_object(
        'total_hours', aqj.total_hours, 'distinct_people', aqj.distinct_people, 'items', aqj.items
      )
    )
  )
  FROM eng
  CROSS JOIN kpi_staffing ks
  CROSS JOIN kpi_pending kp
  CROSS JOIN kpi_last_entry kle
  CROSS JOIN kpi_last_approval kla
  CROSS JOIN budget_hours_cte bh
  CROSS JOIN actual_hours_cte ah
  CROSS JOIN breakdown_json bj
  CROSS JOIN team_raw tr
  CROSS JOIN people_json pj
  CROSS JOIN weeks_json wj
  CROSS JOIN expense_budget_bob ebb
  CROSS JOIN executed_bob_cte ebc
  CROSS JOIN approved_expenses_json aej
  CROSS JOIN pending_expenses_json pej
  CROSS JOIN requests_json rj
  CROSS JOIN approval_queue_json aqj
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


--
-- Name: FUNCTION engagement_overview(p_engagement_id uuid, p_start date, p_end date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.engagement_overview(p_engagement_id uuid, p_start date, p_end date) IS 'dash_encargo (decisiones.md §4, plan_v2.md §7.3-§7.5; corrección post-ejecución #2): payload completo de la pestaña Encargo (4 KPI sin montos, consumo de presupuesto, desglose Categoría->Actividad, equipo responsable, staffing con 9 semanas precargadas, gastos normalizados a BOB, cola de aprobación por persona) en un único round-trip/instantánea MVCC. Un encargo fuera de alcance o inexistente devuelve selected_accessible=false + detail=null, SIN excepción (no distingue "no existe" de "no es tuyo"). R-1: las vistas vw_* que usa son security_invoker=on pero corren sin RLS dentro de este SECURITY DEFINER -- por eso can_read_engagement_dashboard() corre antes de cualquier CTE y cada CTE que toca una vista filtra por engagement_id. R-3 (heredado, sin cambios): vw_wo_budget_hours_by_category no filtra por version/status de la worksheet, puede doble-contar si un WO tiene mas de una hoja -- mismo comportamiento que la pestaña actual. R-4 (deliberado, decisiones.md §4.1): horas cargadas sin fila en timesheet_line_approvals NUNCA cuentan como "pendientes", pero sí como Cargado/consumo -- también aplica a approval_queue, que se alimenta de la misma pending_lines. D-1: "semanas del rango" para Asignado = semanas calendario tocadas (lunes a lunes), no fracciones. Gastos: "ejecutado" = SOLO revisado_asistente (decisiones.md §4.6, corrige la inconsistencia de portfolio_overview() que sí cuenta aprobado_gerente -- ese bug de Cartera queda fuera de alcance de esta migración). Solicitudes excluyen fund_requests.status=borrador. approval_queue: consolida pending_lines POR PERSONA (staff_id) -- hours es la SUMA de todas sus líneas pendientes en este encargo (no solo la más vieja, a diferencia de portfolio_overview() en dash_cartera), weeks_old es el de su línea más antigua, alert reutiliza el mismo v_alert_weeks que aged_hours (ninguna fuente de verdad nueva); "crítico" en el frontend (review.md iteración 1, MF-05) es exactamente este alert, sin un segundo escalón más severo -- encargoOverviewAggregation.ts no calcula ningún umbral adicional.';


--
-- Name: execute_timesheet_reversal(uuid, text, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.execute_timesheet_reversal(p_period_id uuid, p_scope text, p_engagement_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin_staff        uuid;
  v_period             record;
  v_request            record;
  v_stale_week_request record;
  v_reason             text;
  v_scope              text;
  v_period_id          uuid;
  v_engagement_id      uuid;
  v_request_id         uuid;
  v_recipients         uuid[];
  v_recipient          uuid;
  v_affected           integer;
  v_all_approved       boolean;
  -- Token de sistema, no texto libre (review iteración 4, hallazgo #5): antes era una oración
  -- fija en español, así que un destinatario en inglés la veía sin traducir tanto en la
  -- notificación como en "Mis solicitudes". El frontend traduce este token con
  -- `approval.reversalCascadeNote` en cada lugar donde se muestre (REVERSAL_CASCADE_NOTE_TOKEN
  -- en src/lib/notifications.ts) -- a diferencia de un motivo/nota real de una persona, que sí
  -- debe quedar en el idioma en que se escribió.
  v_cascade_note       text := 'SYSTEM_CASCADE_WEEK_STALE';
BEGIN
  -- quien_ejecuta: SOLO el admin, sin excepción. El aprobador ya no auto-ejecuta lo que
  -- él mismo aprobó -- sólo solicita.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'REVERSAL_NOT_ADMIN';
  END IF;

  v_admin_staff := public.get_my_staff_id();

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'REVERSAL_REASON_REQUIRED';
  END IF;

  IF p_request_id IS NOT NULL THEN
    -- Espiar el destino SIN bloquear todavía la solicitud (review iteración 3, hallazgo #2):
    -- request_timesheet_reversal bloquea período -> (choca con el índice único al insertar);
    -- si acá bloqueáramos la solicitud antes que el período, dos transacciones concurrentes
    -- sobre el mismo destino podrían esperarse en un ciclo (deadlock) en vez de serializar
    -- limpio. Bloquear el período PRIMERO, en las dos RPC, evita el ciclo.
    SELECT period_id, scope, engagement_id INTO v_period_id, v_scope, v_engagement_id
      FROM public.timesheet_reversal_requests
     WHERE request_id = p_request_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'REVERSAL_NOT_PENDING';
    END IF;
  ELSE
    -- Reversión directa (botón "Revertir" en "Aprobadas", sin solicitud previa).
    IF p_scope NOT IN ('engagement', 'week') THEN
      RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
    END IF;
    IF p_scope = 'engagement' AND p_engagement_id IS NULL THEN
      RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
    END IF;
    IF p_scope = 'week' AND p_engagement_id IS NOT NULL THEN
      RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
    END IF;

    v_scope         := p_scope;
    v_period_id     := p_period_id;
    v_engagement_id := p_engagement_id;
  END IF;

  SELECT tp.* INTO v_period
    FROM public.timesheet_periods tp
   WHERE tp.period_id = v_period_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVERSAL_NOT_SUBMITTED';
  END IF;

  IF v_period.is_period_locked THEN
    RAISE EXCEPTION 'REVERSAL_PERIOD_LOCKED';
  END IF;

  IF p_request_id IS NOT NULL THEN
    -- Ahora sí bloquear y revalidar la solicitud, con el período ya bloqueado (mismo orden
    -- que request_timesheet_reversal). Re-derivar del row bloqueado, no de la espiada arriba:
    -- es la fuente de verdad una vez que ya no puede cambiar bajo nuestros pies.
    SELECT * INTO v_request
      FROM public.timesheet_reversal_requests
     WHERE request_id = p_request_id
       FOR UPDATE;

    IF NOT FOUND OR v_request.status <> 'pending' THEN
      RAISE EXCEPTION 'REVERSAL_NOT_PENDING';
    END IF;

    v_scope         := v_request.scope;
    v_period_id     := v_request.period_id;
    v_engagement_id := v_request.engagement_id;
  END IF;

  IF v_scope = 'engagement' THEN
    -- El período NO se toca: sigue enviado. Sólo las líneas del encargo objetivo vuelven a
    -- pending -- el resto de encargos de esa semana sigue aprobado.
    --
    -- Revalidación tras el lock (review iteración 3, hallazgo #3): un unsubmit PARCIAL
    -- (unsubmit_timesheet_safe sólo borra las líneas approved cuando v_all_approved) puede
    -- dejar el período en Draft con líneas approved sueltas -- sin este chequeo, esta rama
    -- las revertiría igual sobre un período que el dueño ya retiró.
    IF v_period.submitted_at IS NULL THEN
      RAISE EXCEPTION 'REVERSAL_NOT_SUBMITTED';
    END IF;

    UPDATE public.timesheet_line_approvals
       SET status = 'pending', approved_by = NULL, approved_at = NULL, review_notes = v_reason
     WHERE period_id = v_period_id AND engagement_id = v_engagement_id AND status = 'approved';

    -- Revalidación tras el lock (review iteración 1, hallazgo #5 / riesgo G7): una solicitud
    -- desactualizada -- las líneas ya se revirtieron por otra vía entre el pedido y esta
    -- ejecución -- no puede quedar marcada `executed` sin haber revertido nada.
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected = 0 THEN
      RAISE EXCEPTION 'REVERSAL_NOTHING_APPROVED';
    END IF;

    -- Cierre en cascada simétrico (review iteración 3, hallazgo #4): en cuanto una línea de
    -- este período vuelve a pending, el período deja de estar "totalmente aprobado" -- así
    -- que cualquier solicitud de alcance SEMANA pending sobre el mismo período ya NUNCA podrá
    -- ejecutarse (la revalidación de la rama SEMANA la bloquearía con
    -- REVERSAL_NOT_FULLY_APPROVED). A diferencia del cierre en cascada de la rama SEMANA (que
    -- sí logra lo que la solicitud de encargo pedía, y por eso se marca `executed`), acá el
    -- pedido de revertir TODA la semana no se cumplió -- sólo se marca `rejected`, con aviso
    -- real al solicitante, para no hacerle creer que su solicitud se ejecutó.
    FOR v_stale_week_request IN
      SELECT request_id, requested_by
        FROM public.timesheet_reversal_requests
       WHERE period_id = v_period_id AND scope = 'week' AND status = 'pending'
         FOR UPDATE
    LOOP
      UPDATE public.timesheet_reversal_requests
         SET status = 'rejected', resolved_by = v_admin_staff, resolved_at = now(),
             resolution_notes = v_cascade_note
       WHERE request_id = v_stale_week_request.request_id;

      PERFORM public.notify_staff('approval.reversal_rejected', v_stale_week_request.requested_by,
        v_stale_week_request.request_id::text,
        jsonb_build_object('notes', v_cascade_note, 'scope', 'week'));
    END LOOP;

    -- Cierre en cascada del MISMO destino (review iteración 5, hallazgo #2): si además de esta
    -- ejecución (directa o por otra solicitud) hay OTRA solicitud `pending` de alcance ENCARGO
    -- sobre el mismo (período, encargo), ya se cumplió lo que pedía -- sin esto quedaba
    -- `pending` para siempre, porque el próximo intento de ejecutarla encuentra 0 líneas
    -- `approved` y falla con REVERSAL_NOTHING_APPROVED. El índice único `uq_trr_open_engagement`
    -- garantiza a lo sumo una fila. Mismo criterio que el cierre en cascada de la rama SEMANA de
    -- abajo (:414-420): se marca `executed`, sin aviso aparte, porque el pedido sí se cumplió.
    UPDATE public.timesheet_reversal_requests
       SET status = 'executed', resolved_by = v_admin_staff, resolved_at = now(),
           resolution_notes = v_reason
     WHERE period_id = v_period_id AND engagement_id = v_engagement_id AND scope = 'engagement'
       AND status = 'pending' AND (p_request_id IS NULL OR request_id <> p_request_id);

    SELECT ARRAY(
      SELECT DISTINCT sid FROM (
        SELECT manager_id AS sid FROM public.engagements WHERE engagement_id = v_engagement_id
        UNION
        SELECT partner_id AS sid FROM public.engagements WHERE engagement_id = v_engagement_id
      ) x WHERE sid IS NOT NULL AND sid IS DISTINCT FROM v_admin_staff
    ) INTO v_recipients;
  ELSE
    -- Alcance SEMANA: replica LITERALMENTE los pasos 8/9 de unsubmit_timesheet_safe (cero_02,
    -- borra -- no pasa a pending -- las líneas approved, para que el reenvío re-dispare la
    -- auto-aprobación), sin el chequeo de dueño (paso 1-3), el rol legacy (paso 6b) ni la
    -- ventana de la semana en curso (paso 7): eso es justo lo que esta función admin-only
    -- releva (decisión `alcance_de_semanas`).
    --
    -- Revalidación tras el lock (review iteración 1, hallazgo #5 / riesgo G7): entre el pedido
    -- y esta ejecución el período pudo volver a Draft por otra vía (p.ej. unsubmit_timesheet_safe
    -- del propio dueño, o una ejecución concurrente de alcance semana) o una línea pudo
    -- reabrirse por el bypass de RLS documentado en G6 -- ambos casos dejan de cumplir lo que
    -- ya se validó en request_timesheet_reversal.
    IF v_period.submitted_at IS NULL THEN
      RAISE EXCEPTION 'REVERSAL_NOT_SUBMITTED';
    END IF;

    SELECT COALESCE(bool_and(tla.status = 'approved'), false)
      INTO v_all_approved
      FROM public.timesheet_line_approvals tla
     WHERE tla.period_id = v_period_id;

    IF NOT v_all_approved THEN
      RAISE EXCEPTION 'REVERSAL_NOT_FULLY_APPROVED';
    END IF;

    -- Los destinatarios se capturan ANTES del DELETE, que es lo que borra las filas que
    -- identifican los encargos afectados.
    SELECT ARRAY(
      SELECT DISTINCT sid FROM (
        SELECT e.manager_id AS sid
          FROM public.timesheet_line_approvals tla
          JOIN public.engagements e ON e.engagement_id = tla.engagement_id
         WHERE tla.period_id = v_period_id
        UNION
        SELECT e.partner_id AS sid
          FROM public.timesheet_line_approvals tla
          JOIN public.engagements e ON e.engagement_id = tla.engagement_id
         WHERE tla.period_id = v_period_id
      ) x WHERE sid IS NOT NULL AND sid IS DISTINCT FROM v_admin_staff
    ) INTO v_recipients;

    UPDATE public.timesheet_periods
       SET submitted_at = NULL
     WHERE period_id = v_period_id;

    DELETE FROM public.timesheet_line_approvals
     WHERE period_id = v_period_id AND status = 'approved';

    -- Cierre en cascada: las solicitudes `pending` de este período quedan sobre líneas que ya se
    -- borraron -- sin esto, la cola del admin las mostraría como accionables. Sin filtro de
    -- `scope` (review iteración 10, hallazgo #1): una reversión DIRECTA de semana
    -- (p_request_id NULL) también deja inviable una solicitud SEMANA pendiente del mismo período
    -- (volvería a fallar con REVERSAL_NOT_SUBMITTED); `uq_trr_open_week` garantiza a lo sumo una.
    -- La propia solicitud que se está ejecutando (p_request_id) se excluye: se cierra más abajo.
    UPDATE public.timesheet_reversal_requests
       SET status = 'executed', resolved_by = v_admin_staff, resolved_at = now(),
           resolution_notes = v_reason
     WHERE period_id = v_period_id AND status = 'pending'
       AND (p_request_id IS NULL OR request_id <> p_request_id);
  END IF;

  -- notificacion_al_ejecutar_admin: la razón a los gerentes/socios de los encargos
  -- afectados (todos los del período en alcance SEMANA, sólo uno en alcance ENCARGO),
  -- excluyendo al admin ejecutor.
  FOREACH v_recipient IN ARRAY v_recipients LOOP
    PERFORM public.notify_staff('approval.reversal_executed', v_recipient, v_period_id::text,
      jsonb_build_object('reason', v_reason, 'scope', v_scope, 'engagement_id', v_engagement_id));
  END LOOP;

  IF p_request_id IS NULL THEN
    -- Bitácora de la reversión directa: nace ya ejecutada (is_direct = true).
    INSERT INTO public.timesheet_reversal_requests
      (period_id, scope, engagement_id, requested_by, reason, status, is_direct,
       resolved_by, resolved_at, resolution_notes)
    VALUES
      (v_period_id, v_scope, v_engagement_id, v_admin_staff, v_reason, 'executed', true,
       v_admin_staff, now(), v_reason)
    RETURNING request_id INTO v_request_id;
  ELSE
    UPDATE public.timesheet_reversal_requests
       SET status = 'executed', resolved_by = v_admin_staff, resolved_at = now(),
           resolution_notes = v_reason
     WHERE request_id = p_request_id
     RETURNING request_id INTO v_request_id;
  END IF;

  RETURN v_request_id;
END;
$$;


--
-- Name: finalize_all_stale_timers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_all_stale_timers() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE timer_entries
  SET ended_at = started_at + interval '8 hours',
      duration_minutes = 480
  WHERE ended_at IS NULL
    AND started_at < now() - interval '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: finalize_due_engagements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_due_engagements() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.engagements e
     SET engagement_state_override = 7,   -- 7 Finalizado
         updated_at = now()
   WHERE e.end_date IS NOT NULL
     AND e.end_date < (now() AT TIME ZONE 'America/La_Paz')::date
     -- Solo estado efectivo Aprobado (4). Un override 7 ya fijado devuelve false → idempotente.
     AND public.engagement_is_approved_state(e.engagement_id, e.engagement_state_override, e.work_order_required);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: finalize_my_stale_timers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_my_stale_timers() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id uuid;
  v_count integer;
BEGIN
  SELECT staff_id INTO v_staff_id
  FROM staff WHERE auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN RETURN 0; END IF;

  UPDATE timer_entries
  SET ended_at = started_at + interval '8 hours',
      duration_minutes = 480
  WHERE ended_at IS NULL
    AND staff_id = v_staff_id
    AND started_at < now() - interval '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: fr_guard_accounting_cols(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_guard_accounting_cols() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if is_admin() then
    return new;
  end if;

  -- Columnas de DESEMBOLSO / cierre: requieren fund_disbursement.update.
  if (
    new.total_disbursed_amount is distinct from old.total_disbursed_amount or
    new.disbursed_at is distinct from old.disbursed_at or
    new.disbursed_by_staff_id is distinct from old.disbursed_by_staff_id or
    new.accounting_notes is distinct from old.accounting_notes or
    new.closed_at is distinct from old.closed_at
  ) and not public.has_permission('fund_disbursement.update') then
    raise exception 'Solo contabilidad (desembolso) puede modificar estos campos';
  end if;

  -- Columnas de LIQUIDACIÓN: requieren expense_settlement.update.
  if (
    new.settlement_total_spent is distinct from old.settlement_total_spent or
    new.settlement_balance is distinct from old.settlement_balance or
    new.settlement_iva_total is distinct from old.settlement_iva_total or
    new.settlement_resolution is distinct from old.settlement_resolution or
    new.settlement_amount is distinct from old.settlement_amount or
    new.settlement_notes is distinct from old.settlement_notes or
    new.settled_at is distinct from old.settled_at or
    new.settled_by_staff_id is distinct from old.settled_by_staff_id
  ) and not public.has_permission('expense_settlement.update') then
    raise exception 'Solo contabilidad (liquidacion) puede modificar estos campos';
  end if;

  return new;
end;
$$;


--
-- Name: fr_is_ot_manager(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_is_ot_manager(p_fr_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fund_request_work_orders frwo
    WHERE frwo.fund_request_id = p_fr_id
      AND frwo.manager_staff_id = get_my_staff_id()
  );
$$;


--
-- Name: fr_is_requester(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_is_requester(p_fr_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fund_requests fr
    WHERE fr.fund_request_id = p_fr_id
      AND fr.requester_staff_id = get_my_staff_id()
  );
$$;


--
-- Name: fr_is_submitted(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_is_submitted(p_fr_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fund_requests fr
    WHERE fr.fund_request_id = p_fr_id
      AND fr.status <> 'borrador'
  );
$$;


--
-- Name: fr_wo_guard_approval_cols(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_wo_guard_approval_cols() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_me UUID := get_my_staff_id();
  v_parent_status public.fund_request_status;
  v_decision_changed BOOLEAN;
  v_alloc_changed BOOLEAN;
  v_submit_reset BOOLEAN;
  v_manager_decision BOOLEAN;
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- ¿Cambian las columnas de asignación / identidad de la OT?
  v_alloc_changed :=
       NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount
    OR NEW.wo_id            IS DISTINCT FROM OLD.wo_id
    OR NEW.fund_request_id  IS DISTINCT FROM OLD.fund_request_id
    OR NEW.manager_staff_id IS DISTINCT FROM OLD.manager_staff_id;

  -- NINGÚN no-admin puede cambiar la asignación/identidad por UPDATE: las
  -- allocations se editan vía RPC (delete+insert) y manager_staff_id lo fija el
  -- setter. Esto cierra que el solicitante se ponga como gerente de su OT
  -- (manager_staff_id) para luego auto-aprobarse.
  IF v_alloc_changed THEN
    RAISE EXCEPTION 'No se puede modificar la asignación de la OT (monto/OT/gerente) por esta vía';
  END IF;

  v_decision_changed :=
       NEW.approval_status   IS DISTINCT FROM OLD.approval_status
    OR NEW.manager_notes     IS DISTINCT FROM OLD.manager_notes
    OR NEW.rejection_reason  IS DISTINCT FROM OLD.rejection_reason
    OR NEW.manager_decided_at IS DISTINCT FROM OLD.manager_decided_at;

  IF v_decision_changed THEN
    -- Reset del reenvío: SOLO desde el RPC fund_request_submit (lleva el flag
    -- transaccional). Un UPDATE directo por API no puede resetear las OTs y
    -- brincarse las validaciones del submit (suma de OTs, submitted_at,
    -- limpieza de notas).
    v_submit_reset :=
      NEW.approval_status = 'pendiente'
      AND NEW.manager_notes IS NULL
      AND NEW.rejection_reason IS NULL
      AND NEW.manager_decided_at IS NULL
      AND COALESCE(current_setting('app.fr_submitting', true) = 'on', false);

    IF v_submit_reset THEN
      RETURN NEW;
    END IF;

    SELECT status INTO v_parent_status
    FROM public.fund_requests
    WHERE fund_request_id = OLD.fund_request_id;

    -- Decisión legítima del gerente: solo durante la fase pendiente_aprobacion,
    -- desde una OT pendiente hacia uno de los estados finales de decisión.
    v_manager_decision :=
      OLD.manager_staff_id IS NOT DISTINCT FROM v_me
      AND v_parent_status = 'pendiente_aprobacion'
      AND OLD.approval_status = 'pendiente'
      AND NEW.approval_status IN ('aprobado', 'observado', 'rechazado');

    IF v_manager_decision THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Las columnas de decisión de la OT solo pueden cambiarse por el gerente durante la aprobación pendiente o mediante la acción de enviar la solicitud';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fr_wo_rollup_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_wo_rollup_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_fr_id uuid;
  v_total int; v_aprobado int; v_observado int; v_rechazado int;
  v_new public.fund_request_status;
  v_current public.fund_request_status;
BEGIN
  v_fr_id := COALESCE(NEW.fund_request_id, OLD.fund_request_id);

  SELECT status INTO v_current FROM public.fund_requests WHERE fund_request_id = v_fr_id;

  -- Solo recalcular durante la fase de aprobación del gerente.
  IF v_current IS NULL OR v_current NOT IN
     ('pendiente_aprobacion','observado','rechazado','aprobado_gerente') THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE approval_status = 'aprobado'),
    count(*) FILTER (WHERE approval_status = 'observado'),
    count(*) FILTER (WHERE approval_status = 'rechazado')
  INTO v_total, v_aprobado, v_observado, v_rechazado
  FROM public.fund_request_work_orders
  WHERE fund_request_id = v_fr_id;

  IF v_rechazado > 0 THEN
    v_new := 'rechazado';
  ELSIF v_observado > 0 THEN
    v_new := 'observado';
  ELSIF v_total > 0 AND v_aprobado = v_total THEN
    v_new := 'aprobado_gerente';
  ELSE
    v_new := 'pendiente_aprobacion';
  END IF;

  IF v_new <> v_current THEN
    UPDATE public.fund_requests
    SET status = v_new,
        manager_decided_at = CASE WHEN v_new = 'aprobado_gerente' THEN now() ELSE manager_decided_at END
    WHERE fund_request_id = v_fr_id;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: fr_wo_set_manager(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_wo_set_manager() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_mgr uuid;
BEGIN
  SELECT e.manager_id INTO v_mgr
  FROM public.work_orders wo
  JOIN public.engagements e ON e.engagement_id = wo.engagement_id
  WHERE wo.wo_id = NEW.wo_id;

  IF v_mgr IS NULL THEN
    RAISE EXCEPTION 'La OT % no tiene gerente asignado en su engagement; no puede usarse en una solicitud de fondos', NEW.wo_id;
  END IF;

  NEW.manager_staff_id := v_mgr;
  RETURN NEW;
END;
$$;


--
-- Name: fr_wo_validate_approved(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_wo_validate_approved() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
  v_wo_currency text;
  v_fr_currency text;
  v_engagement_id uuid;
BEGIN
  SELECT approval_status, currency, engagement_id
    INTO v_status, v_wo_currency, v_engagement_id
  FROM public.work_orders WHERE wo_id = NEW.wo_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Work order % does not exist', NEW.wo_id;
  END IF;
  IF v_status <> 'Approved' THEN
    RAISE EXCEPTION 'Work order % must be Approved to be allocated (current: %)', NEW.wo_id, v_status;
  END IF;

  -- FEAT 0602-135: el estado efectivo del encargo debe admitir solicitudes (4/5). Bloquea
  -- Congelado(9)/Finalizado(7)/Cancelado(6)/Rechazado(8) y overrides no-cargables.
  IF NOT public.engagement_allows_hours_or_requests(v_engagement_id) THEN
    RAISE EXCEPTION 'El encargo no admite solicitudes de fondos en su estado actual';
  END IF;

  -- BUG 0722-164 (1): la moneda de la OT ya no tiene que coincidir con la de la
  -- solicitud (el monto asignado va en la moneda de la solicitud), pero sí debe
  -- ser una que el módulo de fondos modela.
  IF v_wo_currency NOT IN ('BOB', 'USD') THEN
    RAISE EXCEPTION 'La moneda de la OT (%) no está habilitada para solicitudes de fondos', v_wo_currency;
  END IF;

  -- BUG 0722-164 (2): la solicitud es el EFECTIVO entregado y se rinde con
  -- facturas bolivianas + IVA 13 %, así que debe estar en BOB. Reemplaza el freno
  -- accidental que daba la igualdad de monedas (ver cabecera).
  SELECT currency INTO v_fr_currency
  FROM public.fund_requests WHERE fund_request_id = NEW.fund_request_id;
  -- IS DISTINCT FROM y no <>: con NULL, `<>` devuelve NULL y el IF no dispararía.
  IF v_fr_currency IS DISTINCT FROM 'BOB' THEN
    RAISE EXCEPTION 'La solicitud debe estar en BOB para asignarle OTs (actual: %)', v_fr_currency;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fre_validate_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fre_validate_transition() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_me UUID := get_my_staff_id();
  v_is_requester BOOLEAN;
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- (P1a) Solo Contabilidad puede ENCENDER el flag de devolución.
  -- 2026-07-31: antes bastaba con "no-admin" para bloquear, porque el asistente
  -- contable se modelaba como admin y salía por el RETURN de arriba. Con los roles
  -- reales, devolver un gasto por falta de respaldo lanzaba esta excepción.
  IF NEW.returned_by_assistant AND NOT OLD.returned_by_assistant
     AND NOT public.has_permission('expense_settlement.update') THEN
    RAISE EXCEPTION 'No autorizado a marcar el gasto como devuelto por contabilidad';
  END IF;

  -- Campos de revisión contable: SOLO Contabilidad los toca. Ni gerente ni
  -- solicitante pueden cambiarlos (un iva_penalty_amount forjado se colaría en el
  -- total de la liquidación).
  --
  -- 2026-07-31: antes exigía is_admin(), que se escribió cuando "asistente
  -- contable" se modelaba como admin. Con los roles reales del catálogo, el
  -- Gerente y el Analista de Contabilidad quedaban bloqueados: revisar una factura
  -- lanzaba esta excepción. Ahora se gatea por el permiso de la matriz
  -- (expense_settlement.update = admin, accounting_manager, accounting_analyst).
  IF NOT public.has_permission('expense_settlement.update')
     AND (NEW.reviewed_at          IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by_staff_id      IS DISTINCT FROM OLD.reviewed_by_staff_id
     OR NEW.has_invoice_observation   IS DISTINCT FROM OLD.has_invoice_observation
     OR NEW.invoice_observation_notes IS DISTINCT FROM OLD.invoice_observation_notes
     OR NEW.iva_penalty_amount        IS DISTINCT FROM OLD.iva_penalty_amount) THEN
    RAISE EXCEPTION 'Solo contabilidad puede modificar los campos de revisión del gasto';
  END IF;

  -- El gasto NO se puede mover a otra solicitud por UPDATE (ni el solicitante ni
  -- el gerente): cambiaría conteos/liquidación de ambas. El solicitante sí puede
  -- reasignar el `wo_id` dentro de la MISMA solicitud (se valida aparte).
  IF NEW.fund_request_id IS DISTINCT FROM OLD.fund_request_id THEN
    RAISE EXCEPTION 'No se puede mover el gasto a otra solicitud de fondos';
  END IF;

  -- ¿El que actúa es el solicitante (dueño) de la solicitud?
  SELECT (fr.requester_staff_id = v_me) INTO v_is_requester
  FROM public.fund_requests fr
  WHERE fr.fund_request_id = NEW.fund_request_id;

  -- (P1b) Si NO es el solicitante (=> gerente), solo puede tocar columnas de
  -- decisión; los DATOS del gasto quedan inmutables para él.
  IF NOT COALESCE(v_is_requester, false) THEN
    IF NEW.amount           IS DISTINCT FROM OLD.amount
       OR NEW.wo_id            IS DISTINCT FROM OLD.wo_id
       OR NEW.expense_type_id  IS DISTINCT FROM OLD.expense_type_id
       OR NEW.expense_date     IS DISTINCT FROM OLD.expense_date
       OR NEW.expense_date_end IS DISTINCT FROM OLD.expense_date_end
       OR NEW.days             IS DISTINCT FROM OLD.days
       OR NEW.description      IS DISTINCT FROM OLD.description
       OR NEW.document_number  IS DISTINCT FROM OLD.document_number
       OR NEW.supplier_name    IS DISTINCT FROM OLD.supplier_name
       OR NEW.supplier_tax_id  IS DISTINCT FROM OLD.supplier_tax_id
       OR NEW.attachment_url   IS DISTINCT FROM OLD.attachment_url
       OR NEW.currency         IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'El gerente no puede modificar los datos del gasto, solo aprobar/observar/rechazar';
    END IF;
  END IF;

  -- En un gasto devuelto por contabilidad (returned_by_assistant) el solicitante
  -- SOLO puede re-adjuntar el respaldo; cambiar datos exige reenviar al gerente.
  -- Aplica AUNQUE no cambie el status: si no, editaría datos con status observado
  -- y luego reenviaría a aprobado_gerente sin que el guard del reenvío (que
  -- compara contra la fila ya mutada) detecte la diferencia.
  IF OLD.returned_by_assistant AND OLD.status = 'observado' THEN
    IF NEW.amount           IS DISTINCT FROM OLD.amount
       OR NEW.wo_id            IS DISTINCT FROM OLD.wo_id
       OR NEW.expense_type_id  IS DISTINCT FROM OLD.expense_type_id
       OR NEW.expense_date     IS DISTINCT FROM OLD.expense_date
       OR NEW.expense_date_end IS DISTINCT FROM OLD.expense_date_end
       OR NEW.days             IS DISTINCT FROM OLD.days
       OR NEW.description      IS DISTINCT FROM OLD.description
       OR NEW.document_number  IS DISTINCT FROM OLD.document_number
       OR NEW.supplier_name    IS DISTINCT FROM OLD.supplier_name
       OR NEW.supplier_tax_id  IS DISTINCT FROM OLD.supplier_tax_id
       OR NEW.currency         IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'En un gasto devuelto por contabilidad solo se puede actualizar el respaldo (adjunto); para cambiar datos reenvíe al gerente';
    END IF;
  END IF;

  -- ── Validación de transiciones de estado ──
  -- En una edición SIN cambio de estado, un no-admin no puede tocar la metadata
  -- de decisión/envío: esos campos solo cambian en transiciones legítimas (la
  -- decisión del gerente o el reenvío, que SÍ cambian el status). Evita que el
  -- solicitante forje o borre el rastro de aprobación por un UPDATE directo.
  IF NEW.status = OLD.status THEN
    IF NEW.manager_notes      IS DISTINCT FROM OLD.manager_notes
       OR NEW.rejection_reason   IS DISTINCT FROM OLD.rejection_reason
       OR NEW.manager_decided_at IS DISTINCT FROM OLD.manager_decided_at
       OR NEW.submitted_at       IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'No autorizado a modificar la metadata de aprobación/envío del gasto';
    END IF;
    RETURN NEW;
  END IF;

  -- Reenvío del solicitante hacia el gerente
  IF NEW.status = 'pendiente_aprobacion'
     AND OLD.status IN ('borrador', 'observado', 'rechazado') THEN
    RETURN NEW;
  END IF;

  -- Reenvío del solicitante DIRECTO al asistente (solo si fue devuelto por él).
  -- La inmutabilidad de datos ya se validó arriba (guard de returned_by_assistant),
  -- así que aquí solo se permite la transición.
  IF NEW.status = 'aprobado_gerente'
     AND OLD.status = 'observado'
     AND OLD.returned_by_assistant THEN
    RETURN NEW;
  END IF;

  -- Decisión del gerente sobre un gasto pendiente
  IF OLD.status = 'pendiente_aprobacion'
     AND NEW.status IN ('aprobado_gerente', 'observado', 'rechazado') THEN
    RETURN NEW;
  END IF;

  -- Decisión de CONTABILIDAD sobre un gasto ya aprobado por el gerente.
  -- 2026-07-31: estas dos transiciones nunca estuvieron en la lista porque solo
  -- las hacía el admin, y el `IF is_admin() THEN RETURN NEW` del inicio se saltaba
  -- toda la validación. Con los roles reales del catálogo hay que declararlas:
  --   revisado_asistente -> factura correcta (useReviewFundRequestExpense)
  --   observado          -> devuelta por falta de respaldo, con returned_by_assistant
  --                         (useReturnFundRequestExpense; el flag lo autoriza P1a)
  IF OLD.status = 'aprobado_gerente'
     AND NEW.status IN ('revisado_asistente', 'observado')
     AND public.has_permission('expense_settlement.update') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transición de estado no permitida para el gasto: % -> %', OLD.status, NEW.status;
END;
$$;


--
-- Name: fre_validate_wo_in_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fre_validate_wo_in_request() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_fr_currency text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fund_request_work_orders frwo
    WHERE frwo.fund_request_id = NEW.fund_request_id
      AND frwo.wo_id = NEW.wo_id
  ) THEN
    RAISE EXCEPTION 'Work order % is not associated with fund request %', NEW.wo_id, NEW.fund_request_id;
  END IF;

  -- La moneda del gasto debe coincidir con la de la solicitud (la liquidación
  -- suma montos como números planos bajo fr.currency; mezclar monedas corrompe
  -- el saldo). El form siempre manda la moneda de la solicitud, pero por API no.
  SELECT currency INTO v_fr_currency
  FROM public.fund_requests WHERE fund_request_id = NEW.fund_request_id;
  IF NEW.currency IS DISTINCT FROM v_fr_currency THEN
    RAISE EXCEPTION 'La moneda del gasto (%) no coincide con la de la solicitud (%)', NEW.currency, v_fr_currency;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fund_request_expenses_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_request_expenses_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: fund_request_save_edit(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_request_save_edit(p_fund_request_id uuid, p_fields jsonb, p_allocations jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Header: solo las columnas presentes en el jsonb (las demás se conservan).
  IF p_fields IS NOT NULL AND p_fields <> '{}'::jsonb THEN
    UPDATE public.fund_requests SET
      total_requested_amount =
        CASE WHEN p_fields ? 'total_requested_amount'
             THEN (p_fields->>'total_requested_amount')::NUMERIC
             ELSE total_requested_amount END,
      currency =
        CASE WHEN p_fields ? 'currency'
             THEN p_fields->>'currency'
             ELSE currency END,
      purpose =
        CASE WHEN p_fields ? 'purpose'
             THEN p_fields->>'purpose'
             ELSE purpose END,
      due_back_date =
        CASE WHEN p_fields ? 'due_back_date'
             THEN NULLIF(p_fields->>'due_back_date', '')::DATE
             ELSE due_back_date END
    WHERE fund_request_id = p_fund_request_id;
  END IF;

  -- OTs: reemplazo completo (delete + insert) solo si se proveen.
  IF p_allocations IS NOT NULL THEN
    DELETE FROM public.fund_request_work_orders
    WHERE fund_request_id = p_fund_request_id;

    IF jsonb_array_length(p_allocations) > 0 THEN
      INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
      SELECT
        p_fund_request_id,
        (a->>'wo_id')::UUID,
        (a->>'allocated_amount')::NUMERIC
      FROM jsonb_array_elements(p_allocations) AS a;
    END IF;
  END IF;
END;
$$;


--
-- Name: fund_request_submit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_request_submit(p_fund_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_requester UUID;
  v_status public.fund_request_status;
  v_total NUMERIC;
  v_alloc NUMERIC;
BEGIN
  SELECT requester_staff_id, status, total_requested_amount
  INTO v_requester, v_status, v_total
  FROM public.fund_requests
  WHERE fund_request_id = p_fund_request_id;

  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'Solicitud de fondos % no encontrada', p_fund_request_id;
  END IF;

  -- Solo el solicitante (o admin) puede enviar.
  IF NOT (is_admin() OR v_requester = get_my_staff_id()) THEN
    RAISE EXCEPTION 'No autorizado a enviar esta solicitud';
  END IF;

  -- Solo desde un estado editable (borrador / observado / rechazado).
  IF v_status NOT IN ('borrador', 'observado', 'rechazado') THEN
    RAISE EXCEPTION 'La solicitud no se puede enviar en su estado actual (%)', v_status;
  END IF;

  -- Debe tener al menos una OT; si no, nadie podría aprobarla.
  SELECT COALESCE(SUM(allocated_amount), 0)
  INTO v_alloc
  FROM public.fund_request_work_orders
  WHERE fund_request_id = p_fund_request_id;

  IF v_alloc = 0 AND NOT EXISTS (
    SELECT 1 FROM public.fund_request_work_orders
    WHERE fund_request_id = p_fund_request_id
  ) THEN
    RAISE EXCEPTION 'La solicitud no tiene OTs asignadas; no se puede enviar a aprobación';
  END IF;

  -- La suma de las asignaciones por OT debe cuadrar con el monto solicitado.
  -- (El form ya lo valida, pero por API directa podría enviarse descuadrada.)
  IF round(v_alloc, 2) <> round(COALESCE(v_total, 0), 2) THEN
    RAISE EXCEPTION 'La suma de las OTs (%) no coincide con el monto solicitado (%)', v_alloc, v_total;
  END IF;

  -- Todas las OTs asignadas deben estar en estado 'Approved'; si alguna fue
  -- des-aprobada o rechazada después de haber sido asignada, se rechaza el envío.
  IF EXISTS (
    SELECT 1
    FROM public.fund_request_work_orders frwo
    JOIN public.work_orders wo ON wo.wo_id = frwo.wo_id
    WHERE frwo.fund_request_id = p_fund_request_id
      AND wo.approval_status IS DISTINCT FROM 'Approved'
  ) THEN
    RAISE EXCEPTION 'Una o más OTs asignadas ya no estan en estado Approved; no se puede enviar a aprobacion';
  END IF;

  -- FEAT 0602-135: el estado efectivo del encargo debe seguir admitiendo solicitudes
  -- (4 Aprobado / 5 Emergencia) al momento de ENVIAR. El trigger de INSERT ya bloquea
  -- asignaciones nuevas, pero una asignación creada mientras el encargo estaba activo y
  -- luego Congelado(9)/Finalizado(7)/Cancelado(6)/Rechazado(8) llegaría hasta aquí.
  IF EXISTS (
    SELECT 1
    FROM public.fund_request_work_orders frwo
    JOIN public.work_orders wo ON wo.wo_id = frwo.wo_id
    WHERE frwo.fund_request_id = p_fund_request_id
      AND NOT public.engagement_allows_hours_or_requests(wo.engagement_id)
  ) THEN
    RAISE EXCEPTION 'Una o más OTs pertenecen a un encargo que ya no admite solicitudes (congelado/finalizado/cancelado)';
  END IF;

  -- Reset de las OTs a 'pendiente' (en reenvío todas vuelven a requerir
  -- aprobación). Dispara el rollup, que puede mover la solicitud a
  -- 'pendiente_aprobacion'; el update siguiente fija submitted_at y limpia.
  -- Marca transaccional para que el guard `fr_wo_guard_approval_cols` permita
  -- el reset SOLO desde este RPC (un UPDATE directo por API no lleva el flag).
  PERFORM set_config('app.fr_submitting', 'on', true);

  UPDATE public.fund_request_work_orders
  SET approval_status = 'pendiente',
      manager_notes = NULL,
      rejection_reason = NULL,
      manager_decided_at = NULL
  WHERE fund_request_id = p_fund_request_id;

  UPDATE public.fund_requests
  SET status = 'pendiente_aprobacion',
      submitted_at = now(),
      rejection_reason = NULL,
      manager_notes = NULL
  WHERE fund_request_id = p_fund_request_id;
END;
$$;


--
-- Name: fund_requests_enforce_bob(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_requests_enforce_bob() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.currency IS DISTINCT FROM 'BOB' THEN
      RAISE EXCEPTION 'Las solicitudes de fondos se registran en BOB (recibido: %)', NEW.currency;
    END IF;
  -- En UPDATE solo se valida cuando la moneda CAMBIA: así una fila legacy en USD
  -- puede seguir aprobándose, desembolsándose, liquidándose y cerrándose.
  ELSIF NEW.currency IS DISTINCT FROM OLD.currency
        AND NEW.currency IS DISTINCT FROM 'BOB' THEN
    RAISE EXCEPTION 'No se puede cambiar la moneda de la solicitud a % (solo BOB)', NEW.currency;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fund_requests_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_requests_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: get_all_user_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_user_roles() RETURNS TABLE(role_id uuid, user_id uuid, email text, role public.app_role, role_key text, staff_name text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    ur.id AS role_id,
    ur.user_id,
    au.email::text,
    ur.role,
    ur.role_key,
    COALESCE(s.first_name || ' ' || s.last_name, NULL) AS staff_name,
    ur.created_at
  FROM user_roles ur
  JOIN auth.users au ON ur.user_id = au.id
  LEFT JOIN staff s ON s.auth_user_id = au.id
  WHERE public.has_permission('user_role.read')
  ORDER BY ur.created_at DESC;
$$;


--
-- Name: get_approvable_pairs(uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_approvable_pairs(p_period_ids uuid[], p_engagement_ids uuid[]) RETURNS TABLE(period_id uuid, engagement_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_count integer;
  i integer;
begin
  v_count := array_length(p_period_ids, 1);
  if v_count is null or v_count <> coalesce(array_length(p_engagement_ids, 1), 0) then
    return;
  end if;

  for i in 1..v_count loop
    if public.can_approve_timesheet_line(auth.uid(), p_period_ids[i], p_engagement_ids[i]) then
      period_id := p_period_ids[i];
      engagement_id := p_engagement_ids[i];
      return next;
    end if;
  end loop;
end;
$$;


--
-- Name: get_engagement_team_candidates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_engagement_team_candidates() RETURNS TABLE(staff_id uuid, display_name text, candidate_group text, practica_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT s.staff_id,
         (s.first_name || ' ' || s.last_name)::text AS display_name,
         g.candidate_group,
         s.practica_id
    FROM public.staff s
    -- INNER JOIN: excluye al personal sin cuenta vinculada (staff.auth_user_id es nullable
    -- por diseño) y, junto con el JOIN de mapeo de abajo, a quien tenga role_key NULL o no
    -- elegible. Espejo de src/lib/engagementTeamCandidates.ts (ROLE_KEY_TO_GROUPS); si se
    -- toca uno, tocar el otro.
    JOIN public.user_roles ur          ON ur.user_id  = s.auth_user_id
    JOIN public.authorization_roles ar ON ar.role_key = ur.role_key
    JOIN (VALUES
           ('partner',        'partner_director'),
           ('director',       'partner_director'),
           -- BUG 0828-185: amplía el pool de Socio/Director/SQR -- antes excluidos pese a
           -- visibilidad firm-wide.
           ('senior_partner', 'partner_director'),
           ('risk_partner',   'partner_director'),
           ('manager',        'manager'),
           ('hr_manager',     'manager'),
           ('senior',         'encargado'),
           ('semisenior',     'encargado'),
           -- BUG 0828-185: ita_manager/tax_manager quedan en DOS grupos -- su propia
           -- especialidad y, además, Gerente/Supervisor.
           ('ita_manager',    'specialist_it'),
           ('ita_manager',    'manager'),
           ('ita_senior',     'specialist_it'),
           ('ita_assistant',  'specialist_it'),
           ('tax_manager',    'specialist_tax'),
           ('tax_manager',    'manager'),
           ('tax_senior',     'specialist_tax'),
           ('tax_assistant',  'specialist_tax')
         ) AS g(role_key, candidate_group) ON g.role_key = ur.role_key
   WHERE (public.has_permission('engagement.create')
          OR public.has_permission('engagement.update'))
     AND s.is_active
     AND s.deleted_at IS NULL
     AND ar.is_active
   ORDER BY s.last_name, s.first_name;
$$;


--
-- Name: FUNCTION get_engagement_team_candidates(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_engagement_team_candidates() IS 'BUG 0722-162 (actualizado 0817-180 y 0828-185): candidatos elegibles por campo del bloque Equipo del encargo. Agrupa role_key en 5 grupos de candidatura (partner_director, manager, encargado, specialist_it, specialist_tax) vía un mapeo (role_key, candidate_group) que admite MÚLTIPLES grupos por rol -- ita_manager/tax_manager caen en su especialidad Y en manager; senior_partner/risk_partner se agregaron a partner_director. NO expone email, auth_user_id ni el role_key crudo. Gateada por engagement.create OR engagement.update.';


--
-- Name: get_line_approver(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_line_approver(p_staff_id uuid, p_engagement_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_engagement record;
begin
  if public.is_auto_approved_category(p_staff_id) then
    return null;
  end if;

  select manager_id, partner_id into v_engagement
  from engagements
  where engagement_id = p_engagement_id;

  return coalesce(v_engagement.manager_id, v_engagement.partner_id);
end;
$$;


--
-- Name: get_my_authorization_context(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_authorization_context() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'role_key', (select role_key from public.user_roles where user_id = auth.uid() limit 1),
    'permissions', coalesce((
      select jsonb_object_agg(rp.permission_key, rp.scope_key)
      from public.user_roles ur
      join public.authorization_role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = auth.uid()
    ), '{}'::jsonb)
  );
$$;


--
-- Name: get_my_notification_aggregates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_notification_aggregates() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff    uuid := public.get_my_staff_id();
  v_role     text;
  v_types    text[];
  v_weeks    jsonb;
  v_out      jsonb := '{}'::jsonb;
  v_from     date;
  v_scope_overdue text;
  v_scope_gap     text;
BEGIN
  IF v_staff IS NULL THEN
    RETURN v_out;
  END IF;

  SELECT ur.role_key INTO v_role
    FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
   WHERE s.staff_id = v_staff;

  IF v_role IS NULL THEN
    RETURN v_out;
  END IF;

  SELECT array_agg(nrt.type_key) INTO v_types
    FROM public.notification_role_types nrt
    JOIN public.notification_types nt ON nt.type_key = nrt.type_key
   WHERE nrt.role_key = v_role
     AND nt.is_active
     AND nt.delivery = 'aggregate';

  IF v_types IS NULL THEN
    RETURN v_out;
  END IF;

  -- ── Ventana de las alarmas de timesheet ──
  v_from := public.notif_timesheet_window_start();

  -- ── Timesheets ──
  IF v_types && ARRAY['timesheet.overdue','timesheet.reverted','timesheet.pending_approval'] THEN
    -- La fecha de corte va en hora local: CURRENT_DATE es UTC y a partir de las 20:00 en
    -- Bolivia ya es manana (ver 20260911100600_fecha_local_current_date.sql).
    v_weeks := public.get_week_statuses(v_staff, v_from, (now() AT TIME ZONE 'America/La_Paz')::date);
  END IF;

  IF 'timesheet.overdue' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('timesheet.overdue',
               public.notif_agg_timesheet_overdue(v_weeks));
  END IF;

  IF 'timesheet.reverted' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('timesheet.reverted',
               public.notif_agg_timesheet_reverted(v_weeks));
  END IF;

  IF 'timesheet.pending_approval' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('timesheet.pending_approval',
               public.notif_agg_timesheet_pending_approval(v_staff, v_from));
  END IF;

  -- ── Encargos generados: estado actual de la OT, no una ventana ──
  IF 'engagement.rejected_by_partner' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('engagement.rejected_by_partner',
                        public.engagement_approval_bucket(v_staff, 'Rejected'));
  END IF;
  IF 'engagement.pending_partner_approval' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('engagement.pending_partner_approval',
                        public.engagement_approval_bucket(v_staff, 'Pending_Approval'));
  END IF;

  -- ── Solicitudes de Fondos: cola de trabajo de Contabilidad ──
  IF 'fund.disbursement.pending' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('fund.disbursement.pending',
                        public.notif_agg_fund_disbursement_pending());
  END IF;
  IF 'fund.expense.review_pending' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('fund.expense.review_pending',
                        public.notif_agg_fund_expense_review_pending());
  END IF;
  IF 'fund.settlement.pending' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('fund.settlement.pending',
                        public.notif_agg_fund_settlement_pending());
  END IF;
  IF 'fund.request.closure_pending' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('fund.request.closure_pending',
                        public.notif_agg_fund_closure_pending());
  END IF;

  -- ── Órdenes de Trabajo: cuotas del plan de pagos (FASE 3.b) ──
  IF 'wo.installment.due_this_week' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('wo.installment.due_this_week',
                        public.notif_agg_wo_installment_due_this_week());
  END IF;
  IF 'wo.installment.overdue' = ANY (v_types) THEN
    -- El scope viene de la matriz, no de una constante: el mismo contador vale `assigned`
    -- para un gerente y `department` para Contabilidad.
    SELECT nrt.scope_key INTO v_scope_overdue
      FROM public.notification_role_types nrt
     WHERE nrt.role_key = v_role
       AND nrt.type_key = 'wo.installment.overdue';

    v_out := v_out || jsonb_build_object('wo.installment.overdue',
                        public.notif_agg_wo_installment_overdue(v_staff, v_scope_overdue));
  END IF;

  -- ── Aprobaciones de Timesheet: capacitación (FASE 3.d) ──
  IF 'approval.training_pending' = ANY (v_types) THEN
    v_out := v_out || jsonb_build_object('approval.training_pending',
                        public.notif_agg_approval_training_pending());
  END IF;

  -- ── Scheduler: cobertura (FASE 3.h) ──
  -- Segundo contador que necesita el scope de la matriz, y el primero con TRES alcances
  -- distintos (firm / society / assigned).
  IF 'scheduler.coverage_gap' = ANY (v_types) THEN
    SELECT nrt.scope_key INTO v_scope_gap
      FROM public.notification_role_types nrt
     WHERE nrt.role_key = v_role
       AND nrt.type_key = 'scheduler.coverage_gap';

    v_out := v_out || jsonb_build_object('scheduler.coverage_gap',
                        public.notif_agg_scheduler_coverage_gap(v_staff, v_scope_gap));
  END IF;

  RETURN v_out;
END;
$$;


--
-- Name: FUNCTION get_my_notification_aggregates(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_notification_aggregates() IS 'Contadores (delivery=aggregate) del usuario actual, gateados por notification_role_types. Timesheet respeta TS_ALERT_WINDOW_WEEKS/TS_TRACKING_START_DATE; wo.installment.overdue respeta el scope_key de la matriz; approval.training_pending cuenta la cola de capacitacion (funcion=2); scheduler.coverage_gap respeta firm/society/assigned. Definido una sola vez: no hay una version anterior que pisar.';


--
-- Name: get_my_notifications(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_notifications(p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff  uuid := public.get_my_staff_id();
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_events jsonb;
  v_unread integer;
BEGIN
  -- Fail-closed: una cuenta sin ficha de staff no ve nada, igual que
  -- get_my_authorization_context() con un usuario sin rol.
  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('events', '[]'::jsonb,
                              'aggregates', '{}'::jsonb,
                              'unread_count', 0);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'notification_id', n.notification_id,
           'type_key',        n.type_key,
           'module_key',      nt.module_key,
           'label_key',       nt.label_key,
           'entity_id',       n.entity_id,
           'payload',         n.payload,
           'created_at',      n.created_at,
           'read_at',         n.read_at) ORDER BY n.created_at DESC), '[]'::jsonb)
    INTO v_events
    FROM (
      SELECT * FROM public.notifications n0
       WHERE n0.recipient_staff_id = v_staff
         -- Lo descartado no vuelve a la bandeja. Sigue en la tabla, pero como registro de que
         -- el aviso ya salió (ver H.2), no como algo que el usuario tenga que volver a ver.
         AND n0.dismissed_at IS NULL
         -- El tipo desactivado se descarta ACÁ y no después del LIMIT: filtrar sobre el
         -- resultado del LIMIT devuelve menos de v_limit avisos aunque haya más activos.
         AND EXISTS (SELECT 1 FROM public.notification_types t
                      WHERE t.type_key = n0.type_key AND t.is_active)
       -- LO NO LEÍDO PRIMERO, y este orden es de SELECCIÓN, no de presentación: decide cuáles
       -- de todos los avisos entran en la ventana de v_limit. Ordenando sólo por fecha, un
       -- usuario con más de v_limit sin leer quedaba trancado: el panel recibía las 50 más
       -- nuevas, las marcaba leídas al cerrar, y la carga siguiente volvía a traer ESAS MISMAS
       -- —que siguen siendo las más nuevas, ahora leídas—. Las viejas sin leer nunca entraban,
       -- nunca se marcaban, y `unread_count` las seguía contando: badge que no baja hasta que
       -- la purga se lleve el historial nuevo, 90 días después.
       --
       -- Así cada apertura se lleva hasta v_limit pendientes y la cola drena sola.
       ORDER BY (n0.read_at IS NULL) DESC, n0.created_at DESC
       LIMIT v_limit
    ) n
    JOIN public.notification_types nt ON nt.type_key = n.type_key;

  -- El mismo predicado que los eventos, y no uno más flojo: un tipo desactivado no aparece en
  -- la bandeja, así que contarlo deja la campana con un número que el usuario no puede bajar —
  -- no hay fila que abrir ni que marcar leída.
  SELECT COUNT(*) INTO v_unread
    FROM public.notifications n
   WHERE n.recipient_staff_id = v_staff
     AND n.read_at IS NULL
     AND n.dismissed_at IS NULL
     AND EXISTS (SELECT 1 FROM public.notification_types t
                  WHERE t.type_key = n.type_key AND t.is_active);

  RETURN jsonb_build_object(
    'events',       v_events,
    'aggregates',   public.get_my_notification_aggregates(),
    'unread_count', v_unread);
END;
$$;


--
-- Name: FUNCTION get_my_notifications(p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_notifications(p_limit integer) IS 'Bandeja del usuario actual: eventos (public.notifications, sin lo descartado ni los tipos inactivos) + contadores (get_my_notification_aggregates) + no leidas, contadas con ese mismo filtro. La ventana de p_limit se llena priorizando lo no leido, para que una cola mayor que p_limit drene en vez de trancarse; la lista sale igual por fecha. Fail-closed sin ficha de staff.';


--
-- Name: get_my_pending_hours(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_pending_hours(p_staff_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_hire_date date;
  v_end_date date;
  v_capacity numeric;
  v_staff_city text;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_gap numeric;
  v_result jsonb := '[]'::jsonb;
  -- Se calcula UNA vez, igual que get_week_statuses con su v_today: repetir la expresion en cada
  -- uso abre la puerta a que queden dos fechas distintas en la misma llamada.
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
BEGIN
  SELECT s.hire_date, s.weekly_capacity_hours, s.termination_date, s.city
  INTO v_hire_date, v_capacity, v_end_date, v_staff_city
  FROM public.staff s WHERE s.staff_id = p_staff_id;

  IF v_hire_date IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_end_date := LEAST(COALESCE(v_end_date, v_today), v_today);
  v_daily := COALESCE(v_capacity, 40) / 5.0;

  -- Start from Monday of hire_date's week
  v_cursor := v_hire_date - (EXTRACT(ISODOW FROM v_hire_date)::int - 1);

  WHILE v_cursor <= v_end_date LOOP
    v_week_end := v_cursor + 4;  -- Friday

    -- Skip current/incomplete week (ascending order, so EXIT is safe)
    IF v_week_end >= v_today THEN
      EXIT;
    END IF;

    v_eff_start := GREATEST(v_cursor, v_hire_date);
    v_eff_end := LEAST(v_week_end, v_end_date);

    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(DISTINCT h.holiday_date) INTO v_holiday_count
    FROM public.holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5
      AND (
        h.oficina = 0
        OR (h.oficina = 1 AND v_staff_city = 'La Paz')
        OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
      );

    v_working_days := v_working_days - v_holiday_count;

    IF v_working_days > 0 THEN
      v_expected := v_working_days * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM public.time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_gap := v_expected - v_actual;

      IF v_gap > 0 THEN
        v_result := v_result || jsonb_build_object(
          'week_start', v_cursor,
          'expected_hours', v_expected,
          'actual_hours', v_actual,
          'gap', v_gap
        );
      END IF;
    END IF;

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;


--
-- Name: FUNCTION get_my_pending_hours(p_staff_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_pending_hours(p_staff_id uuid) IS 'Semanas cerradas con horas faltantes. La fecha de corte se calcula en America/La_Paz: con CURRENT_DATE (UTC) la semana en curso se excluia un dia antes a partir de las 20:00 hora local.';


--
-- Name: get_my_staff_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_staff_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT staff_id FROM staff WHERE auth_user_id = auth.uid()
$$;


--
-- Name: get_staff_assignment_segments(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date) RETURNS TABLE(engagement_id uuid, start_date date, end_date date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_staff_id uuid := public.get_my_staff_id();
  v_is_self      boolean;
  v_is_firmwide  boolean;
  v_is_approver  boolean;
  v_authorized   boolean;
BEGIN
  IF p_staff_id IS NULL OR p_week_start IS NULL OR p_week_end IS NULL
     OR p_week_end < p_week_start
     OR (p_week_end - p_week_start) > 6              -- one timesheet week max
     OR EXTRACT(ISODOW FROM p_week_start) <> 1 THEN  -- canonical Monday only (D5-2 halo gate)
    RAISE EXCEPTION 'EA_SEGMENTS_INVALID_RANGE';
  END IF;

  v_is_self     := (v_caller_staff_id IS NOT NULL AND p_staff_id = v_caller_staff_id);   -- (1)
  v_is_firmwide := public.has_firmwide_assignment_visibility();                          -- (2)
  v_is_approver := EXISTS (                                                              -- (3)
    SELECT 1
    FROM public.get_timesheet_approvers(p_staff_id, p_week_start) g
    WHERE g.approver_staff_id = v_caller_staff_id
  );
  v_authorized := v_is_self OR v_is_firmwide OR v_is_approver;

  -- NULL-safe deny (Greptile r3607763303): anything that is not TRUE is denied.
  IF v_authorized IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'EA_SEGMENTS_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    ea.engagement_id,
    GREATEST(ea.start_date, p_week_start)::date AS start_date,  -- clamp to the requested week:
    LEAST(ea.end_date,   p_week_end)::date      AS end_date     -- never disclose out-of-week endpoints
  FROM public.engagement_assignments ea
  WHERE ea.staff_id = p_staff_id
    AND ea.deleted_at IS NULL
    AND ea.start_date <= p_week_end       -- overlap probe; uses
    AND ea.end_date   >= p_week_start     -- idx_eng_assign_staff_dates_active
    AND (
          v_is_self
          OR v_is_firmwide
          -- Approver arm (minimum-necessary): return an engagement's window ONLY
          -- when the caller leads it AND the target logged POSITIVE hours on it
          -- inside the REQUESTED [p_week_start, p_week_end] interval — i.e. a cell
          -- the approver actually renders. Three guards, each closing a distinct
          -- escape:
          --   * is_engagement_team_member (== the time_entries team SELECT policy,
          --     migration 20260107032620:54-70) — bounds disclosure to engagements
          --     whose hours the approver already reads; excludes UNLED engagements.
          --   * date_worked <= p_week_end (the REQUESTED end, NOT +7 days) — with a
          --     Friday p_week_end a Sat/Sun entry must NOT authorize a Mon-Fri
          --     window; the evidence window equals the rendered interval
          --     (PR #223 rev.3 P1-01). Adapts automatically to 5- or 6-day config.
          --   * hours_logged > 0 — matches the UI's hours>0 flag, so a zero-hour
          --     row (schema allows CHECK hours_logged >= 0) can neither authorize
          --     nor return a window (PR #223 rev.3 P2-03).
          --   * is_forecast = false — the evidence must be ACTUAL logged time, the
          --     same set the whole authorization domain uses: submit_timesheet_safe
          --     (schema :1133/:1147/:1205), the self grid (useTimesheetWeek :126),
          --     and every dashboard read all filter is_forecast = false. A forecast
          --     PLAN is not logged work and must never disclose a segment boundary
          --     (PR #224 P1-01).
          --   * period_id IN (the timesheet_period for this staff+week) — binds the
          --     evidence to EXACTLY the rendered approval dataset, which the approval
          --     detail fetches with `.eq("period_id", periodId)`
          --     (useTimesheetApprovals :299). date_worked-in-week alone let an
          --     actual entry ORPHANED from the viewed period (in-week date, wrong/NULL
          --     period_id) disclose a segment for an engagement absent from the grid.
          --     The client passes the viewed period's week_start_date as p_week_start,
          --     so the canonical period here == the rendered period; a missing period
          --     yields no match (fail-closed) (PR #224 P1-01).
          -- get_timesheet_approvers stays the TOP-LEVEL staff-week eligibility gate
          -- (it may admit via a Sat/Sun, zero-hour, forecast, or wrong-period entry —
          -- that only decides whether the caller may ASK; the RETURN above discloses
          -- nothing beyond the rendered, positive-hours, actual, in-period cells).
          -- Excludes entry-less led engagements (rev.2 P1-01), out-of-interval / zero-
          -- hour rows (rev.3), and forecast / orphan-period rows (PR #224).
          OR (
               public.is_engagement_team_member(ea.engagement_id)
               AND EXISTS (
                 SELECT 1
                 FROM public.time_entries te
                 WHERE te.staff_id      = p_staff_id
                   AND te.engagement_id = ea.engagement_id
                   AND te.date_worked  >= p_week_start
                   AND te.date_worked  <= p_week_end     -- requested interval, not +7d (P1-01)
                   AND te.hours_logged  > 0              -- match UI hours>0 flag (P2-03)
                   AND te.is_forecast   = false          -- actuals only (PR #224 P1-01)
                   AND te.period_id IN (                 -- belongs to the rendered approval period
                     SELECT tp.period_id
                     FROM public.timesheet_periods tp
                     WHERE tp.staff_id = p_staff_id
                       AND tp.week_start_date = p_week_start
                   )
               )
             )
        )
  ORDER BY ea.engagement_id, ea.start_date;
END;
$$;


--
-- Name: FUNCTION get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date) IS 'Phase 5 advisory: active assignment segments for one staff member across one timesheet week. Admit: self OR firmwide (admin/partner/director) OR eligible timesheet approver for (staff, week) per get_timesheet_approvers; deny raises EA_SEGMENTS_DENIED (never a silent empty result). RETURN scoped per-engagement for the approver arm to engagements the caller leads (is_engagement_team_member) AND on which the target logged POSITIVE, NON-FORECAST hours inside the REQUESTED [p_week_start, p_week_end] interval AND in the timesheet_period for (staff, p_week_start) — exactly the rendered approval-grid cells (which the detail fetches by period_id), nothing more — with endpoints clamped to the probed week for all arms; success + zero rows = authoritatively unassigned. Returns only (engagement_id, start_date, end_date). Span capped at 6 days; p_week_start must be the canonical Monday (ISODOW = 1).';


--
-- Name: get_staff_full(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_staff_full() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(fila order by fila->>'last_name'), '[]'::jsonb)
  from (
    select to_jsonb(s) || jsonb_build_object(
      'category',
        (select to_jsonb(c) from categories c where c.category_id = s.category_id),
      'staff_skills',
        (select coalesce(jsonb_agg(jsonb_build_object(
            'staff_skill_id',       ss.staff_skill_id,
            'skill_id',             ss.skill_id,
            'proficiency_level',    ss.proficiency_level,
            'last_evaluated_date',  ss.last_evaluated_date,
            'skill', (select jsonb_build_object(
                        'skill_id',  sk.skill_id,
                        'name',      sk.name,
                        'category',  sk.category,
                        'is_active', sk.is_active)
                      from skills sk where sk.skill_id = ss.skill_id)
          )), '[]'::jsonb)
         from staff_skills ss where ss.staff_id = s.staff_id)
    ) as fila
    from staff s
    -- El gate: sin staff.read no devuelve nada. Antes de esta migración,
    -- CUALQUIER usuario con ficha obtenía PII del personal activo por `select *`.
    where public.has_permission('staff.read')
  ) t;
$$;


--
-- Name: FUNCTION get_staff_full(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_staff_full() IS 'Personal con PII (documento, registro de auditor) para la pantalla de Personal y StaffForm. Gated por has_permission(''staff.read''). Reemplaza el select * directo, que exponía PII a cualquier usuario con ficha.';


--
-- Name: get_timesheet_approvers(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_timesheet_approvers(p_staff_id uuid, p_week_start date) RETURNS TABLE(approver_staff_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if public.is_auto_approved_category(p_staff_id) then
    return;
  end if;

  return query
  select distinct app.staff_id
  from (
    select e.manager_id as staff_id
    from time_entries te
    join engagements e on te.engagement_id = e.engagement_id
    where te.staff_id = p_staff_id
      and te.date_worked >= p_week_start
      and te.date_worked < p_week_start + interval '7 days'
      and e.manager_id is not null
    union
    select e.partner_id
    from time_entries te
    join engagements e on te.engagement_id = e.engagement_id
    where te.staff_id = p_staff_id
      and te.date_worked >= p_week_start
      and te.date_worked < p_week_start + interval '7 days'
      and e.partner_id is not null
  ) app
  join staff app_s on app_s.staff_id = app.staff_id
  join user_roles ur on ur.user_id = app_s.auth_user_id
  join authorization_role_permissions rp on rp.role_key = ur.role_key
  where rp.permission_key = 'timesheet_approval.approve';
end;
$$;


--
-- Name: get_week_statuses(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_week_statuses(p_staff_id uuid, p_start_date date, p_end_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_hire_date date;
  v_term_date date;
  v_capacity numeric;
  v_staff_city text;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_missing numeric;
  v_period_id uuid;
  v_submitted_at timestamptz;
  v_status text;
  v_is_current boolean;
  v_approval_total integer;
  v_approval_approved integer;
  v_approval_rejected integer;
  v_result jsonb := '[]'::jsonb;
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
BEGIN
  -- Get staff info
  SELECT s.hire_date, s.termination_date, s.weekly_capacity_hours, s.city
  INTO v_hire_date, v_term_date, v_capacity, v_staff_city
  FROM public.staff s WHERE s.staff_id = p_staff_id;

  v_daily := COALESCE(v_capacity, 40) / 5.0;

  -- Start from Monday of p_start_date's week
  v_cursor := p_start_date - (EXTRACT(ISODOW FROM p_start_date)::int - 1);

  WHILE v_cursor <= p_end_date LOOP
    v_week_end := v_cursor + 4;  -- Friday

    -- Clamp to hire/termination boundaries
    v_eff_start := v_cursor;
    v_eff_end := v_week_end;

    IF v_hire_date IS NOT NULL AND v_eff_start < v_hire_date THEN
      v_eff_start := v_hire_date;
    END IF;
    IF v_term_date IS NOT NULL AND v_eff_end > v_term_date THEN
      v_eff_end := v_term_date;
    END IF;

    -- Skip weeks entirely outside employment
    IF v_hire_date IS NOT NULL AND v_week_end < v_hire_date THEN
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;
    IF v_term_date IS NOT NULL AND v_cursor > v_term_date THEN
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;

    -- Determine if current week
    v_is_current := (v_cursor <= v_today AND v_week_end >= v_today);

    -- CURRENT week (Amendment A2: return it, don't exit)
    IF v_is_current THEN
      -- Still compute hours for informational purposes
      SELECT COUNT(*) INTO v_working_days
      FROM generate_series(v_eff_start, LEAST(v_eff_end, v_today), '1 day'::interval) d
      WHERE EXTRACT(ISODOW FROM d) <= 5;

      SELECT COUNT(DISTINCT h.holiday_date) INTO v_holiday_count
      FROM public.holidays h
      WHERE h.holiday_date BETWEEN v_eff_start AND LEAST(v_eff_end, v_today)
        AND EXTRACT(ISODOW FROM h.holiday_date) <= 5
        AND (
          h.oficina = 0
          OR (h.oficina = 1 AND v_staff_city = 'La Paz')
          OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
        );

      v_working_days := v_working_days - v_holiday_count;
      v_expected := GREATEST(v_working_days, 0) * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM public.time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_result := v_result || jsonb_build_object(
        'week_start', v_cursor,
        'week_end', v_week_end,
        'status', 'CURRENT',
        'total_logged_hours', v_actual,
        'expected_hours', v_expected,
        'missing_hours', GREATEST(v_expected - v_actual, 0),
        'is_submitted', false,
        'is_current_week', true
      );
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;

    -- FUTURE weeks
    IF v_cursor > v_today THEN
      v_result := v_result || jsonb_build_object(
        'week_start', v_cursor,
        'week_end', v_week_end,
        'status', 'FUTURE',
        'total_logged_hours', 0,
        'expected_hours', 0,
        'missing_hours', 0,
        'is_submitted', false,
        'is_current_week', false
      );
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;

    -- Past weeks: compute expected hours (holiday-aware)
    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(DISTINCT h.holiday_date) INTO v_holiday_count
    FROM public.holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5
      AND (
        h.oficina = 0
        OR (h.oficina = 1 AND v_staff_city = 'La Paz')
        OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
      );

    v_working_days := v_working_days - v_holiday_count;
    v_expected := GREATEST(v_working_days, 0) * v_daily;

    -- Sum actual logged hours
    SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
    FROM public.time_entries te
    WHERE te.staff_id = p_staff_id
      AND te.date_worked BETWEEN v_eff_start AND v_eff_end
      AND te.is_forecast = false;

    v_missing := GREATEST(v_expected - v_actual, 0);

    -- Look up timesheet_period
    SELECT tp.period_id, tp.submitted_at
    INTO v_period_id, v_submitted_at
    FROM public.timesheet_periods tp
    WHERE tp.staff_id = p_staff_id
      AND tp.week_start_date = v_cursor;

    -- Determine status
    IF v_period_id IS NULL THEN
      -- No period row
      IF v_actual > 0 THEN
        v_status := 'NOT_SUBMITTED';  -- Amendment A3
      ELSE
        v_status := 'NOT_LOGGED';
      END IF;
    ELSIF v_submitted_at IS NULL THEN
      v_status := 'DRAFT';
    ELSE
      -- Period submitted: check line approvals
      SELECT COUNT(*),
             COUNT(*) FILTER (WHERE tla.status = 'approved'),
             COUNT(*) FILTER (WHERE tla.status = 'rejected')
      INTO v_approval_total, v_approval_approved, v_approval_rejected
      FROM public.timesheet_line_approvals tla
      WHERE tla.period_id = v_period_id;

      IF v_approval_total = 0 THEN
        v_status := 'PENDING_APPROVAL';  -- Amendment A6
      ELSIF v_approval_approved = v_approval_total THEN
        v_status := 'APPROVED';
      ELSIF v_approval_rejected > 0 THEN
        v_status := 'REJECTED';
      ELSE
        v_status := 'PENDING_APPROVAL';
      END IF;
    END IF;

    v_result := v_result || jsonb_build_object(
      'week_start', v_cursor,
      'week_end', v_week_end,
      'status', v_status,
      'total_logged_hours', v_actual,
      'expected_hours', v_expected,
      'missing_hours', v_missing,
      'is_submitted', (v_submitted_at IS NOT NULL),
      'is_current_week', false
    );

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;


--
-- Name: FUNCTION get_week_statuses(p_staff_id uuid, p_start_date date, p_end_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_week_statuses(p_staff_id uuid, p_start_date date, p_end_date date) IS 'Estado semana a semana de la hoja de tiempo. El dia de hoy se calcula en America/La_Paz: con CURRENT_DATE (UTC) la semana marcada como actual saltaba a la siguiente el domingo a las 20:00 hora local.';


--
-- Name: guard_auth_lockout_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_auth_lockout_settings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.setting_key IN ('AUTH_MAX_FAILED_ATTEMPTS', 'AUTH_LOCKOUT_MINUTES')
     AND auth.uid() IS NOT NULL          -- not service_role / postgres
     AND NOT public.is_admin() THEN      -- not an administrator
    RAISE EXCEPTION 'FORBIDDEN: % can only be changed by an administrator', NEW.setting_key
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_role_count integer;
begin
  -- Guard de reentrada: si otra vía ya asignó el rol, no se toca.
  if exists (select 1 from public.user_roles where user_id = new.id) then
    return new;
  end if;

  select count(*) into v_role_count from public.user_roles;

  if v_role_count = 0 then
    -- Primer usuario = admin (bootstrap)
    insert into public.user_roles (user_id, role, role_key)
    values (new.id, 'admin', 'admin');
  else
    insert into public.user_roles (user_id, role, role_key)
    values (new.id, 'staff', 'assistant');
  end if;

  return new;
end;
$$;


--
-- Name: has_assignment_on_engagement(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_assignment_on_engagement(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM engagement_assignments ea WHERE ea.engagement_id = p_engagement_id AND ea.staff_id = get_my_staff_id() AND ea.deleted_at IS NULL)
$$;


--
-- Name: has_firmwide_assignment_visibility(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_firmwide_assignment_visibility() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role_key IN ('admin', 'senior_partner', 'partner', 'director')
  )
$$;


--
-- Name: has_permission(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_permission(p_permission_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.authorization_role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = auth.uid()
      and rp.permission_key = p_permission_key
  );
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;


--
-- Name: is_assigned_to_client(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_assigned_to_client(p_client_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Cliente asignado = tengo >=1 encargo (en cualquier estado) donde ocupo uno de los seis
  -- cargos del bloque Equipo. Las tres columnas de gerencia —general, ITA y TAX— se mueven
  -- siempre juntas en el formulario del encargo y valen lo mismo para ver a su cliente.
  select exists (
    select 1 from engagements e
    where e.client_id = p_client_id
      and get_my_staff_id() in (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id,
                                e.specialist_it_id, e.specialist_tax_id)
  )
$$;


--
-- Name: FUNCTION is_assigned_to_client(p_client_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_assigned_to_client(p_client_id uuid) IS 'True si el usuario actual ocupa algun cargo del bloque Equipo (partner/manager/sqr/encargado/specialist_it/specialist_tax) en algun encargo de este cliente, sin importar el estado del encargo. Los dos especialistas se sumaron el 2026-09-16 para que coincida con notif_client_assigned(): sin eso, un aviso de cliente podia linkear a una ficha que la policy "clients read" le escondia.';


--
-- Name: is_assigned_to_engagement(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_assigned_to_engagement(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from engagements e
    where e.engagement_id = p_engagement_id
      and get_my_staff_id() in (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id)
  )
$$;


--
-- Name: is_auto_approved_category(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_auto_approved_category(p_staff_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from staff s
    join user_roles ur on ur.user_id = s.auth_user_id
    join authorization_role_permissions rp on rp.role_key = ur.role_key
    where s.staff_id = p_staff_id
      and rp.permission_key = 'timesheet.self_approve'
  )
$$;


--
-- Name: is_engagement_responsible(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_engagement_responsible(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engagements e
    WHERE e.engagement_id = p_engagement_id
      AND public.get_my_staff_id() IN (e.manager_id, e.partner_id,
                                        e.sqr_id, e.encargado_id,
                                        e.specialist_it_id, e.specialist_tax_id)
  )
$$;


--
-- Name: is_engagement_team_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_engagement_team_member(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM engagements e
    WHERE e.engagement_id = p_engagement_id
    AND (
      e.manager_id = get_my_staff_id()
      OR e.partner_id = get_my_staff_id()
    )
  )
$$;


--
-- Name: latest_exchange_rate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.latest_exchange_rate() RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT compra FROM public.exchange_rate_history ORDER BY fecha_vigencia DESC LIMIT 1),
    (SELECT setting_value::numeric FROM public.global_settings WHERE setting_key = 'default_exchange_rate')
  );
$$;


--
-- Name: FUNCTION latest_exchange_rate(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.latest_exchange_rate() IS 'dash_socio (decisiones.md §4.1): TC de respaldo para wo_payment_plan.exchange_rate DEFAULT y para convertir honorarios/cuotas a Bs. Mismo orden que el navbar (useExchangeRate.ts:28): compra mas reciente de exchange_rate_history, si no hay historial cae a global_settings.default_exchange_rate. Devuelve NULL si ninguna fuente existe -- el INSERT que dependa del DEFAULT falla entonces con NOT NULL, nunca guarda basura.';


--
-- Name: link_auth_user_to_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_auth_user_to_staff() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.staff
  SET auth_user_id = NEW.id,
      is_active = true,
      updated_at = now()
  WHERE lower(trim(email)) = lower(trim(NEW.email))
    AND auth_user_id IS NULL
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;


--
-- Name: link_staff_to_auth_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_staff_to_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Guard: skip soft-deleted staff records
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NOT NULL AND NEW.auth_user_id IS NULL THEN
    SELECT id INTO v_auth_user_id
    FROM auth.users
    WHERE lower(trim(email)) = lower(trim(NEW.email))
    LIMIT 1;

    IF v_auth_user_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.staff
        WHERE auth_user_id = v_auth_user_id
          AND staff_id != NEW.staff_id
          AND deleted_at IS NULL
      ) THEN
        NEW.auth_user_id := v_auth_user_id;
        NEW.is_active := true;  -- Auto-activate on link
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: list_administrative_engagements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_administrative_engagements() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_can_see_history boolean;
  v_current_fiscal_year int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_can_see_history := public.has_permission('engagement.create');

  -- Espejo de getCurrentFiscalPeriod() (src/lib/fiscalCalculations.ts): el año
  -- fiscal corre de octubre a septiembre; de octubre en adelante ya es el
  -- fiscal del año calendario siguiente.
  --
  -- Review fix (Codex): en America/La_Paz y no en now() a secas. Supabase deja la base en UTC
  -- (ninguna migracion cambia el GUC TimeZone) y La Paz es UTC-4, asi que el 30 de septiembre
  -- entre las 20:00 y la medianoche hora local now() ya esta en octubre: el servidor adelantaba
  -- el corte cuatro horas y dejaba de devolver las filas del FY vigente mientras el navegador
  -- —que resuelve getCurrentFiscalPeriod() en hora local— seguia en el anterior. Mismo problema
  -- y misma solucion que 20260911100600_fecha_local_current_date.sql.
  v_current_fiscal_year := CASE
    WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'America/La_Paz')) >= 10
      THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/La_Paz'))::int + 1
    ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/La_Paz'))::int
  END;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'engagement_id', e.engagement_id,
          'engagement_code', e.engagement_code,
          'engagement_name', e.engagement_name,
          'funcion', e.funcion,
          'society_id', e.society_id,
          'society_name', s.name,
          'client_id', e.client_id,
          'client_name', c.client_legal_name,
          'oficina', e.oficina,
          'practica', e.practica,
          'practica_name', p.name,
          'anio_fiscal', e.anio_fiscal,
          'start_date', e.start_date,
          'end_date', e.end_date,
          'status', e.status
        )
        ORDER BY e.created_at DESC NULLS LAST, e.engagement_id
      )
        FROM public.engagements e
        JOIN public.clients c ON c.client_id = e.client_id
        JOIN public.society s ON s.society_id = e.society_id
        LEFT JOIN public.practicas p ON p.code = e.practica
       WHERE e.funcion <> 1
         AND (v_can_see_history OR (e.anio_fiscal IS NOT NULL AND e.anio_fiscal >= v_current_fiscal_year))
    ),
    '[]'::jsonb
  );
END;
$$;


--
-- Name: FUNCTION list_administrative_engagements(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_administrative_engagements() IS '0722-160: listado minimo de encargos Administrativa/Capacitacion/Calidad. Quien tiene engagement.create ve todo el historico; el resto solo ve anio_fiscal vigente o futuro (espejo server-side del filtro que antes vivia solo en el frontend). El corte del anio fiscal se calcula en America/La_Paz: con now() en UTC se adelantaba cuatro horas el 30 de septiembre. No concede acceso al detalle.';


--
-- Name: list_administrative_internal_clients(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_administrative_internal_clients() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'client_id', c.client_id,
        'client_legal_name', c.client_legal_name,
        'unique_tax_id', c.unique_tax_id,
        'is_active', c.is_active
      )
      ORDER BY c.client_legal_name
    ),
    '[]'::jsonb
  )
    FROM public.clients c
   WHERE c.unique_tax_id IN ('1006979026', '184046021')
     AND c.is_active
     AND public.has_permission('engagement.create');
$$;


--
-- Name: FUNCTION list_administrative_internal_clients(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_administrative_internal_clients() IS '0722-160: expone unicamente los dos clientes internos de sociedad (Pelaez/Jauregui) a quien tiene engagement.create, sin depender de client.read -- hr_manager/hr_analyst tienen engagement.create para este flujo pero no client.read, y otorgarles client.read general expondria la cartera completa en vez de solo los dos clientes controlados. Review fix (Greptile): filtra is_active ademas del NIT -- defensa en profundidad, independiente de que el DO block de arriba ya deba haber reactivado ambas filas canonicas.';


--
-- Name: list_dashboard_engagements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_dashboard_engagements() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role   text;
  v_staff  uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: no session';
  END IF;
  IF NOT public.has_permission('dashboard.engagement.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.engagement.read';
  END IF;

  v_role := public.current_role_key();
  v_staff := public.get_my_staff_id();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'engagement_id', e.engagement_id,
    'engagement_code', e.engagement_code,
    'engagement_name', e.engagement_name,
    'client_legal_name', cl.client_legal_name,
    'end_date', e.end_date
  ) ORDER BY e.engagement_code NULLS LAST, e.engagement_id), '[]'::jsonb)
  INTO v_result
  FROM public.engagements e
  JOIN public.clients cl ON cl.client_id = e.client_id
  WHERE e.status = 'active'
    AND COALESCE(e.engagement_state_override, 0) NOT IN (6, 7)
    AND e.funcion = 1
    AND (
      v_role IN ('admin', 'senior_partner')
      OR (
        v_staff IS NOT NULL
        AND CASE v_role
              WHEN 'partner'      THEN e.partner_id = v_staff
              WHEN 'director'     THEN e.partner_id = v_staff
              WHEN 'risk_partner' THEN e.partner_id = v_staff
              WHEN 'sqr'          THEN e.partner_id = v_staff
              WHEN 'manager'      THEN e.manager_id = v_staff
              WHEN 'ita_manager'  THEN e.manager_id = v_staff
              WHEN 'tax_manager'  THEN e.manager_id = v_staff
              WHEN 'senior'       THEN e.encargado_id = v_staff
              WHEN 'semisenior'   THEN e.encargado_id = v_staff
              WHEN 'ita_senior'   THEN e.specialist_it_id = v_staff
              WHEN 'tax_senior'   THEN e.specialist_tax_id = v_staff
              ELSE false
            END
      )
    );

  RETURN v_result;
END;
$$;


--
-- Name: FUNCTION list_dashboard_engagements(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_dashboard_engagements() IS 'dash_encargo (plan_v2.md §7.2; corrección post-ejecución): alimenta EngagementSelector con el alcance completo de decisiones.md §2 (encargado_id/specialist_it_id/specialist_tax_id incluidos, no solo partner_id/manager_id como el filtro legacy de EngagementSelector.tsx). Mismo mapeo rol->campo que can_read_engagement_dashboard(), inline por rendimiento. Filtro de "activo" idéntico al legacy: status=active y engagement_state_override NOT IN (6,7). Agrega funcion=1 (Cliente, no en can_read_engagement_dashboard() a propósito -- ver comentario en el CREATE) para no listar encargos administrativos, y devuelve end_date (nullable) para que el frontend autoseleccione el encargo con fecha de fin más próxima.';


--
-- Name: list_loggable_engagements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_loggable_engagements() RETURNS TABLE(engagement_id uuid, engagement_code character varying, engagement_name character varying, activity_required boolean, work_order_required boolean, is_internal boolean, practica smallint, funcion smallint, start_date date, end_date date, engagement_state_override smallint, client_id uuid, client_legal_name character varying)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- funcion (0827-184, mergeado tras crear este RPC): 0 administrativa, 1 cliente,
  -- 2 capacitación, 3 calidad. Los selectores de actividad (filterActivitiesForEngagement)
  -- lo necesitan para decidir si el encargo requiere actividad -- viajaba en el SELECT
  -- directo a `engagements` que este RPC reemplazó, así que debe seguir viajando aquí.
  SELECT e.engagement_id, e.engagement_code, e.engagement_name,
         e.activity_required, e.work_order_required, e.is_internal,
         e.practica, e.funcion, e.start_date, e.end_date, e.engagement_state_override,
         e.client_id, c.client_legal_name
    FROM public.engagements e
    LEFT JOIN public.clients c ON c.client_id = e.client_id
   WHERE public.has_permission('time_entry.create')
     AND e.status = 'active'
     -- Regla de check_wo_approved()/engagement_allows_hours_or_requests(): con override manual
     -- presente, SOLO 4 (Aprobado) y 5 (Aprobado Emergencia) permiten cargar horas -- el resto
     -- (1 Pendiente, 2 AprobadoSocio, 3 AprobadoRiesgos, 6/7/8/9) bloquea, sin importar OT.
     AND (e.engagement_state_override IS NULL OR e.engagement_state_override IN (4, 5))
     AND (
       -- Group A: encargo con Orden de Trabajo Aprobada (y Riesgos no Rechazado).
       EXISTS (
         SELECT 1 FROM public.work_orders wo
          WHERE wo.engagement_id = e.engagement_id
            AND wo.approval_status = 'Approved'
            AND COALESCE(wo.risk_status, '') <> 'Rejected'
       )
       -- Group B: administrativo (sin OT requerida).
       OR e.work_order_required = false
       -- Group B: override manual Aprobado/Emergencia (4/5), cargable aunque la OT no lo esté.
       OR e.engagement_state_override IN (4, 5)
     )
   -- Paridad con las queries que reemplaza (Tracker/Carga Manual ordenaban created_at DESC).
   ORDER BY e.created_at DESC, e.engagement_id
$$;


--
-- Name: FUNCTION list_loggable_engagements(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_loggable_engagements() IS 'BUG 0828-186: encargos elegibles para cargar horas (Hoja de Tiempo/Tracker/Carga Manual), sin filtrar por asignación -- alcance decidido por el operador. Gateado por time_entry.create. No sustituye is_assigned_to_engagement/is_assigned_to_client (fuera de alcance de este issue).';


--
-- Name: list_my_assignments(text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_my_assignments(p_toggle text, p_date_from date, p_date_to date) RETURNS TABLE(assignment_id uuid, engagement_id uuid, category_id uuid, start_date date, end_date date, hours_per_week numeric, allocation_percent numeric, notes text, status text, deleted_at timestamp with time zone, engagement_code text, engagement_name text, client_id uuid, client_legal_name text, category_name text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  -- Review 2026-09-28 (MUST FIX): "hoy" en America/La_Paz, no UTC -- mismo criterio que
  -- get_week_statuses/get_my_pending_hours (20260911100600_fecha_local_current_date.sql),
  -- para no adelantar el día a partir de las 20:00 hora local.
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
BEGIN
  IF p_toggle NOT IN ('current', 'historical', 'all') THEN
    RAISE EXCEPTION 'MY_ASSIGNMENTS_INVALID_TOGGLE';
  END IF;

  RETURN QUERY
  SELECT
    ea.assignment_id, ea.engagement_id, ea.category_id, ea.start_date, ea.end_date,
    ea.hours_per_week, ea.allocation_percent, ea.notes, ea.status, ea.deleted_at,
    e.engagement_code::text, e.engagement_name::text,
    e.client_id, cl.client_legal_name::text,
    cat.category_name::text
  FROM public.engagement_assignments ea
  LEFT JOIN public.engagements e ON e.engagement_id = ea.engagement_id
  LEFT JOIN public.clients cl ON cl.client_id = e.client_id
  LEFT JOIN public.categories cat ON cat.category_id = ea.category_id
  WHERE ea.staff_id = public.get_my_staff_id()  -- único gate de autorización: RLS no aplica dentro de un SECURITY DEFINER
    AND (
      -- Review 2026-09-28 (MUST FIX): "vigente" también exige end_date >= hoy -- no hay
      -- ningún trigger que mueva status a COMPLETED cuando el período termina, así que sin
      -- este chequeo una fila CONFIRMED vencida hace meses seguía apareciendo como vigente.
      -- "historical" es el complemento exacto de "current" (mismas 3 condiciones, OR en vez
      -- de AND) para que ninguna fila quede fuera de los dos toggles.
      (p_toggle = 'current' AND ea.deleted_at IS NULL AND ea.status <> 'CANCELLED' AND ea.end_date >= v_today)
      OR (p_toggle = 'historical'
          AND (ea.deleted_at IS NOT NULL OR ea.status = 'CANCELLED' OR ea.end_date < v_today)
          AND ea.end_date >= p_date_from AND ea.start_date <= p_date_to)
      OR (p_toggle = 'all' AND ea.end_date >= p_date_from AND ea.start_date <= p_date_to)
    )
  ORDER BY ea.start_date DESC;
END;
$$;


--
-- Name: FUNCTION list_my_assignments(p_toggle text, p_date_from date, p_date_to date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_my_assignments(p_toggle text, p_date_from date, p_date_to date) IS '0922-190 "Mis asignaciones": único gate de autorización es staff_id = get_my_staff_id() (SECURITY DEFINER bypassa RLS, así que este WHERE reemplaza a ea_select_own dentro de la función). Devuelve solo columnas de etiqueta (engagement_code/name, client_legal_name, category_name) para la fila propia -- nunca las tablas engagements/clients completas, que exigen engagement.read/client.read que la población objetivo de este ticket no siempre tiene. p_toggle: "current" exige deleted_at IS NULL AND status <> CANCELLED AND end_date >= hoy (America/La_Paz), sin acotar por [p_date_from, p_date_to]; "historical" es el complemento exacto de current (deleted_at IS NOT NULL OR status = CANCELLED OR end_date < hoy) Y solapa [p_date_from, p_date_to]; "all" solo exige solape de fecha, sin filtrar por histórico/vigente -- mismo criterio que el filtro cliente de MyAssignments.tsx (review 2026-09-28, MUST FIX).';


--
-- Name: list_own_timer_engagement_labels(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_own_timer_engagement_labels(p_engagement_ids uuid[]) RETURNS TABLE(engagement_id uuid, engagement_code character varying, engagement_name character varying)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT e.engagement_id, e.engagement_code, e.engagement_name
    FROM public.engagements e
   WHERE e.engagement_id = ANY(p_engagement_ids)
     AND EXISTS (
       SELECT 1 FROM public.timer_entries te
        WHERE te.engagement_id = e.engagement_id
          AND te.staff_id = public.get_my_staff_id()
     )
$$;


--
-- Name: FUNCTION list_own_timer_engagement_labels(p_engagement_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_own_timer_engagement_labels(p_engagement_ids uuid[]) IS 'BUG 0828-186 (Iteración 4): resuelve engagement_name/engagement_code por pertenencia (el caller ya tiene un timer_entries propio con ese engagement_id), sin filtrar por elegibilidad actual -- a diferencia de list_loggable_engagements(). Respaldo para Tracker History cuando el embed normal cae a null por RLS de asignación.';


--
-- Name: list_portfolio_engagements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_portfolio_engagements() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH caller AS (
    SELECT public.get_my_staff_id() AS staff_id,
           public.current_role_key() AS role_key
  ),
  caller_staff AS (
    SELECT s.society_id
      FROM public.staff s, caller c
     WHERE s.staff_id = c.staff_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'engagement_id',              e.engagement_id,
        'client_id',                  e.client_id,
        'engagement_name',            e.engagement_name,
        'engagement_code',            e.engagement_code,
        'partner_id',                 e.partner_id,
        'manager_id',                 e.manager_id,
        'status',                     e.status,
        'start_date',                 e.start_date,
        'end_date',                   e.end_date,
        'created_at',                 e.created_at,
        'work_order_required',        e.work_order_required,
        'activity_required',          e.activity_required,
        'is_internal',                e.is_internal,
        'approval_required',          e.approval_required,
        'oficina',                    e.oficina,
        'practica',                   e.practica,
        'anio_fiscal',                e.anio_fiscal,
        'funcion',                    e.funcion,
        'fecha_cierre',               e.fecha_cierre,
        'anio_fiscal_override',       e.anio_fiscal_override,
        'sqr_id',                     e.sqr_id,
        'encargado_id',               e.encargado_id,
        'specialist_it_id',           e.specialist_it_id,
        'specialist_tax_id',          e.specialist_tax_id,
        'contract_file_path',         e.contract_file_path,
        'created_by_staff_id',        e.created_by_staff_id,
        'engagement_state_override',  e.engagement_state_override,
        'taxonomy_id',                e.taxonomy_id,
        'society_id',                 e.society_id,
        'client', jsonb_build_object(
          'client_id',          c.client_id,
          'client_legal_name',  c.client_legal_name
        ),
        'partner',        CASE WHEN sp.staff_id   IS NULL THEN NULL ELSE to_jsonb(sp)   END,
        'manager',        CASE WHEN sm.staff_id   IS NULL THEN NULL ELSE to_jsonb(sm)   END,
        'sqr',            CASE WHEN sq.staff_id   IS NULL THEN NULL ELSE to_jsonb(sq)   END,
        'encargado',      CASE WHEN se.staff_id   IS NULL THEN NULL ELSE to_jsonb(se)   END,
        'specialist_it',  CASE WHEN sit.staff_id  IS NULL THEN NULL ELSE to_jsonb(sit)  END,
        'specialist_tax', CASE WHEN stax.staff_id IS NULL THEN NULL ELSE to_jsonb(stax) END,
        'society',        CASE WHEN soc.society_id IS NULL THEN NULL ELSE jsonb_build_object(
          'society_id',  soc.society_id,
          'name',        soc.name,
          'is_active',   soc.is_active,
          'created_at',  soc.created_at
        ) END,
        'work_order',     CASE WHEN wo.engagement_id IS NULL THEN NULL ELSE jsonb_build_object(
          'approval_status', wo.approval_status,
          'approved_at',     wo.approved_at,
          'risk_status',     wo.risk_status
        ) END
      )
      ORDER BY e.created_at DESC NULLS LAST, e.engagement_id
    ),
    '[]'::jsonb
  )
    FROM public.engagements e
    CROSS JOIN caller
    LEFT JOIN caller_staff cs ON true
    JOIN public.clients c ON c.client_id = e.client_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) sp   ON sp.staff_id   = e.partner_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) sm   ON sm.staff_id   = e.manager_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) sq   ON sq.staff_id   = e.sqr_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) se   ON se.staff_id   = e.encargado_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) sit  ON sit.staff_id  = e.specialist_it_id
    LEFT JOIN (SELECT staff_id, first_name, last_name, short_name, initials, category_id, city, is_active FROM public.staff) stax ON stax.staff_id = e.specialist_tax_id
    LEFT JOIN public.society soc ON soc.society_id = e.society_id
    LEFT JOIN public.work_orders wo ON wo.engagement_id = e.engagement_id
   WHERE public.has_permission('engagement.read')
     AND (
       -- 1. firm: ve todos los encargos.
       caller.role_key IN ('admin', 'it_security_manager', 'senior_partner', 'risk_partner')
       -- 2. own_society: mismos encargos de SU sociedad, incluidos los creados por otros.
       OR (caller.role_key IN ('partner', 'sqr', 'director')
           AND e.society_id IS NOT NULL
           AND e.society_id = cs.society_id)
       -- 3. own_management: donde figura como manager_id, incluidos los creados por otros.
       OR (caller.role_key IN ('manager', 'ita_manager', 'tax_manager', 'hr_manager')
           AND caller.staff_id IS NOT NULL
           AND e.manager_id = caller.staff_id)
       -- 4. creator: cualquier rol ve lo que creó (paridad con la policy "engagements creator read").
       OR (caller.staff_id IS NOT NULL AND e.created_by_staff_id = caller.staff_id)
     )
$$;


--
-- Name: FUNCTION list_portfolio_engagements(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_portfolio_engagements() IS 'BUG 0828-185: encargos visibles en Encargos.tsx/EngagementEdit.tsx/ClientEngagementsTable.tsx bajo la regla "por ahora, solo lo que creé", salvo los roles firm-wide (todos) y own_society/own_management (partner/sqr/director por sociedad; manager/ita_manager/tax_manager/hr_manager por manager_id) -- ver plan_v2 bugs/0828-185. Buckets HARDCODEADOS por role_key, sin nuevo permission_key/scope_key. NO reemplaza is_assigned_to_engagement()/is_assigned_to_client() ni la policy "engagements read": nunca debe ampliarse a firm-wide sin pasar por la RLS real.';


--
-- Name: log_engagement_assignment_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_engagement_assignment_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
    INSERT INTO public.portfolio_events (engagement_id, event_type, subject_staff_id, previous_staff_id, actor_user_id)
    VALUES (NEW.engagement_id, 'partner_assigned', NEW.partner_id, OLD.partner_id, auth.uid());
  END IF;
  IF NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
    INSERT INTO public.portfolio_events (engagement_id, event_type, subject_staff_id, previous_staff_id, actor_user_id)
    VALUES (NEW.engagement_id, 'manager_assigned', NEW.manager_id, OLD.manager_id, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION log_engagement_assignment_change(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.log_engagement_assignment_change() IS 'dash_cartera (decisiones.md §7.2, plan_v2.md §6.2): inserta en portfolio_events cuando partner_id/manager_id cambian de valor (IS DISTINCT FROM, cubre NULL). AFTER UPDATE OF esas 2 columnas -> un UPDATE de engagements que no las toque nunca dispara este trigger. RETURN NULL (AFTER trigger, el valor de retorno se ignora). SECURITY DEFINER porque portfolio_events no tiene ninguna policy de INSERT para authenticated.';


--
-- Name: mark_notification_email_result(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_notification_email_result(p_email_id uuid, p_ok boolean, p_error text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_intentos integer;
BEGIN
  IF p_email_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_ok THEN
    UPDATE public.notification_emails
       SET status = 'sent', sent_at = now(), last_error = NULL, claimed_at = NULL
     WHERE email_id = p_email_id;
    RETURN FOUND;
  END IF;

  SELECT attempts INTO v_intentos
    FROM public.notification_emails
   WHERE email_id = p_email_id;

  IF v_intentos IS NULL THEN
    RETURN false;
  END IF;

  -- Se suelta el arriendo al cerrar: la fila ya no está en manos de nadie, y dejar el
  -- `claimed_at` viejo haría que un `pending` pareciera un reclamo vencido.
  UPDATE public.notification_emails
     SET status     = CASE WHEN v_intentos >= 3 THEN 'failed' ELSE 'pending' END,
         last_error = p_error,
         claimed_at = NULL
   WHERE email_id = p_email_id;

  RETURN true;
END;
$$;


--
-- Name: FUNCTION mark_notification_email_result(p_email_id uuid, p_ok boolean, p_error text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mark_notification_email_result(p_email_id uuid, p_ok boolean, p_error text) IS 'Cierra un correo reclamado y suelta el arriendo (claimed_at = NULL): sent si salio, de vuelta a pending para reintentar, o failed al tercer intento.';


--
-- Name: mark_notifications_read(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_notifications_read(p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff uuid := public.get_my_staff_id();
  v_count integer;
BEGIN
  IF v_staff IS NULL OR p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- El filtro por recipient_staff_id es lo que impide marcar como leída la notificación de
  -- otro pasando su uuid. No se re-marca lo ya leído (read_at IS NULL).
  UPDATE public.notifications
     SET read_at = now()
   WHERE notification_id = ANY (p_ids)
     AND recipient_staff_id = v_staff
     AND read_at IS NULL
     -- Una fila descartada ya no se ve, así que tampoco se "lee". El panel nunca manda su id,
     -- pero el filtro va igual: es el mismo criterio que el resto de las lecturas.
     AND dismissed_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: FUNCTION mark_notifications_read(p_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mark_notifications_read(p_ids uuid[]) IS 'Marca como leídas las notificaciones propias. Ignora ids ajenos: el UPDATE filtra por recipient_staff_id = get_my_staff_id().';


--
-- Name: move_category(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_category(p_category_id uuid, p_new_position integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica_id uuid;
  v_old_pos    integer;
  v_total      integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  SELECT practica_id, display_order
    INTO v_practica_id, v_old_pos
    FROM public.categories
   WHERE category_id = p_category_id
   FOR UPDATE;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM public.categories
   WHERE practica_id = v_practica_id;

  IF p_new_position < 1 OR p_new_position > v_total THEN
    RAISE EXCEPTION 'Position % out of range (1-%)', p_new_position, v_total;
  END IF;

  IF p_new_position = v_old_pos THEN
    RETURN;
  END IF;

  IF p_new_position < v_old_pos THEN
    UPDATE public.categories
       SET display_order = display_order + 1
     WHERE practica_id = v_practica_id
       AND display_order >= p_new_position
       AND display_order <  v_old_pos;
  ELSE
    UPDATE public.categories
       SET display_order = display_order - 1
     WHERE practica_id = v_practica_id
       AND display_order >  v_old_pos
       AND display_order <= p_new_position;
  END IF;

  UPDATE public.categories
     SET display_order = p_new_position
   WHERE category_id = p_category_id;
END;
$$;


--
-- Name: notif_agg_approval_training_pending(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_agg_approval_training_pending() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.timesheet_line_approvals tla
    JOIN public.timesheet_periods tp ON tp.period_id = tla.period_id
    JOIN public.engagements e        ON e.engagement_id = tla.engagement_id
   WHERE tla.status = 'pending'
     AND tp.submitted_at IS NOT NULL
     AND e.funcion = 2;
$$;


--
-- Name: FUNCTION notif_agg_approval_training_pending(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_agg_approval_training_pending() IS 'Contador "Solicitudes de aprobacion de entrenamiento pendientes" (D-31): lineas de timesheet en pending, de periodos ya enviados, sobre encargos de capacitacion (engagements.funcion = 2). Sin filtro por persona: la matriz lo concede solo con alcance firm/department.';


--
-- Name: notif_agg_fund_closure_pending(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_agg_fund_closure_pending() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Liquidada pero sin cerrar: el segundo paso manual pendiente.
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.fund_requests
   WHERE settled_at IS NOT NULL AND closed_at IS NULL AND status <> 'cancelado';
$$;


--
-- Name: notif_agg_fund_disbursement_pending(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_agg_fund_disbursement_pending() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Aprobadas por el gerente y todavía sin desembolsar.
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.fund_requests
   WHERE status = 'aprobado_gerente' AND disbursed_at IS NULL;
$$;


--
-- Name: notif_agg_fund_expense_review_pending(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_agg_fund_expense_review_pending() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.fund_requests fr
   WHERE fr.status = 'fondos_entregados'
     AND EXISTS (
       SELECT 1 FROM public.fund_request_expenses e
        WHERE e.fund_request_id = fr.fund_request_id
          AND e.status = 'aprobado_gerente'
     );
$$;


--
-- Name: FUNCTION notif_agg_fund_expense_review_pending(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_agg_fund_expense_review_pending() IS 'Contador "Gastos por revisar": solicitudes en fondos_entregados con algun gasto en aprobado_gerente. Mismo predicado que el tab expenses_review de FundRequestDisbursements (tabOf + expensePhase).';


--
-- Name: notif_agg_fund_settlement_pending(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_agg_fund_settlement_pending() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- En liquidación y sin liquidación registrada. La liquidación es de dos pasos manuales,
  -- así que `en_liquidacion` con settled_at NULL es exactamente "falta registrarla".
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.fund_requests
   WHERE status = 'en_liquidacion' AND settled_at IS NULL;
$$;


--
-- Name: notif_agg_scheduler_coverage_gap(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_agg_scheduler_coverage_gap(p_staff_id uuid, p_scope text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH req AS (
    SELECT w.engagement_id,
           r.category_id,
           SUM(r.staff_count) AS required
      FROM public.wo_staffing_requirements r
      JOIN public.work_orders w ON w.wo_id = r.wo_id
      JOIN public.engagements e ON e.engagement_id = w.engagement_id
     WHERE w.approval_status = 'Approved'
       -- Encargo vivo: sin override, o en los dos estados que permiten trabajar (4 Aprobado,
       -- 5 Aprobado Emergencia). Cancelado/Finalizado/Rechazado no tienen cobertura que
       -- reclamar.
       AND (e.engagement_state_override IS NULL
            OR e.engagement_state_override IN (4, 5))
       AND (p_scope = 'firm'
            OR (p_scope = 'society'
                AND e.society_id = (SELECT s.society_id FROM public.staff s
                                     WHERE s.staff_id = p_staff_id))
            OR (p_scope NOT IN ('firm', 'society')
                AND p_staff_id IN (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id,
                                   e.specialist_it_id, e.specialist_tax_id)))
     GROUP BY w.engagement_id, r.category_id
  ), asignados AS (
    SELECT a.engagement_id,
           a.category_id,
           COUNT(DISTINCT a.staff_id) AS cubiertas
      FROM public.engagement_assignments a
     WHERE a.deleted_at IS NULL
       AND a.status <> 'CANCELLED'
       -- Y con vida por delante. Hay una TERCERA forma de que una asignación deje de cubrir, y
       -- no deja marca: que llegue a su `end_date`. Nadie escribe 'COMPLETED' (el estado existe
       -- en el CHECK y ninguna vía lo asigna), así que una asignación vencida se queda en
       -- CONFIRMED con deleted_at NULL para siempre — y este contador la contaba como cobertura.
       -- Resultado: decía "0 gaps" sobre un encargo VIVO cuyo equipo ya se fue.
       --
       -- Es el mismo predicado que usa el Scheduler (scheduler-gaps/handler.ts: `.lte(start_date,
       -- endDate).gte(end_date, startDate)`), que es un SOLAPAMIENTO contra la ventana que el
       -- usuario elige en pantalla. Este contador no tiene ventana elegible: la suya es "de hoy
       -- en adelante", y solapar con [hoy, ∞) se reduce a esto.
       --
       -- NO se agrega `a.start_date <= hoy`. Eso cerraría la ventana a [hoy, hoy] —un punto, que
       -- el Scheduler no usa en ningún lado— y contradiría la definición del contador: segun D-40
       -- el gap son POSICIONES COMPROMETIDAS sin cubrir, y una asignación que arranca el mes que
       -- viene SÍ cubre una posición comprometida. Excluirla convertiría cada encargo por empezar
       -- en un gap completo aunque el equipo ya esté armado.
       AND a.end_date >= (now() AT TIME ZONE 'America/La_Paz')::date
     GROUP BY a.engagement_id, a.category_id
  ), gap AS (
    SELECT r.engagement_id,
           GREATEST(r.required - COALESCE(a.cubiertas, 0), 0) AS faltan
      FROM req r
      LEFT JOIN asignados a
             ON a.engagement_id = r.engagement_id
            AND a.category_id   = r.category_id
  )
  SELECT jsonb_build_object(
           'count', COALESCE(SUM(g.faltan), 0),
           -- `items` sólo en el alcance `assigned`, mismo criterio que wo.installment.overdue:
           -- son pocos encargos y se pintan como chips de COT. En `firm`/`society` la lista
           -- puede ser de cientos y el número ya manda a la pantalla, que tiene filtros.
           'items', CASE WHEN p_scope NOT IN ('firm', 'society')
                    THEN COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                           'engagement_id',   g.engagement_id,
                           'engagement_code', COALESCE(e.engagement_code, '—'))
                         ) FILTER (WHERE g.faltan > 0), '[]'::jsonb)
                    ELSE '[]'::jsonb END)
    FROM gap g
    JOIN public.engagements e ON e.engagement_id = g.engagement_id;
$$;


--
-- Name: FUNCTION notif_agg_scheduler_coverage_gap(p_staff_id uuid, p_scope text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_agg_scheduler_coverage_gap(p_staff_id uuid, p_scope text) IS 'Contador "Gap de cobertura" (D-40): posiciones que la OT aprobada pidio (wo_staffing_requirements.staff_count) y que el staffing no cubre, por encargo y categoria. Cuenta como cobertura la asignacion que todavia tiene vida por delante (end_date >= hoy), no la que ya vencio: vencer no deja marca de estado y esas filas hacian que el contador dijera 0 sobre un encargo vivo sin equipo. Una asignacion que arranca en el futuro SI cuenta, porque la posicion esta comprometida. Respeta el scope_key de la matriz: firm / society / assigned. No son los 4 gaps analiticos de la edge function scheduler-gaps.';


--
-- Name: notif_agg_timesheet_overdue(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_agg_timesheet_overdue(p_weeks jsonb) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
           'count', COUNT(*),
           'missing_hours', COALESCE(SUM((w->>'missing_hours')::numeric), 0),
           'items', COALESCE(jsonb_agg(jsonb_build_object(
                      'week_start',    w->>'week_start',
                      'missing_hours', (w->>'missing_hours')::numeric
                    ) ORDER BY w->>'week_start' DESC), '[]'::jsonb))
    FROM jsonb_array_elements(COALESCE(p_weeks, '[]'::jsonb)) w
   WHERE w->>'status' IN ('NOT_LOGGED', 'NOT_SUBMITTED', 'DRAFT');
$$;


--
-- Name: FUNCTION notif_agg_timesheet_overdue(p_weeks jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_agg_timesheet_overdue(p_weeks jsonb) IS 'Semanas sin cargar o sin enviar, sobre la salida de get_week_statuses(). Lo consumen el despachador de la campana y el recordatorio diario.';


--
-- Name: notif_agg_timesheet_pending_approval(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_agg_timesheet_pending_approval(p_staff_id uuid, p_from date) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- DISTINCT obligatorio: timesheet_line_approvals es UNIQUE (period_id, engagement_id,
  -- activity_id), asi que sin el el COT se repetiria una vez por actividad.
  SELECT jsonb_build_object(
           'count', COUNT(*),
           'items', COALESCE(jsonb_agg(jsonb_build_object(
                      'week_start', week_start, 'cots', cots) ORDER BY week_start DESC),
                    '[]'::jsonb))
    FROM (
      SELECT tp.week_start_date AS week_start,
             COALESCE(jsonb_agg(DISTINCT e.engagement_code)
                      FILTER (WHERE e.engagement_code IS NOT NULL), '[]'::jsonb) AS cots
        FROM public.timesheet_periods tp
        JOIN public.timesheet_line_approvals tla ON tla.period_id = tp.period_id
        JOIN public.engagements e ON e.engagement_id = tla.engagement_id
       WHERE tp.staff_id = p_staff_id
         AND tp.submitted_at IS NOT NULL
         AND tla.status = 'pending'
         AND tp.week_start_date >= p_from
       GROUP BY tp.week_start_date
    ) q;
$$;


--
-- Name: FUNCTION notif_agg_timesheet_pending_approval(p_staff_id uuid, p_from date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_agg_timesheet_pending_approval(p_staff_id uuid, p_from date) IS 'Semanas enviadas por p_staff_id con lineas todavia en pending, desde p_from.';


--
-- Name: notif_agg_timesheet_reverted(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_agg_timesheet_reverted(p_weeks jsonb) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
           'count', COUNT(*),
           'items', COALESCE(jsonb_agg(jsonb_build_object('week_start', w->>'week_start')
                      ORDER BY w->>'week_start' DESC), '[]'::jsonb))
    FROM jsonb_array_elements(COALESCE(p_weeks, '[]'::jsonb)) w
   WHERE w->>'status' = 'REJECTED';
$$;


--
-- Name: FUNCTION notif_agg_timesheet_reverted(p_weeks jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_agg_timesheet_reverted(p_weeks jsonb) IS 'Semanas devueltas al colaborador, sobre la salida de get_week_statuses().';


--
-- Name: notif_agg_wo_installment_due_this_week(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_agg_wo_installment_due_this_week() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object('count', COUNT(*), 'items', '[]'::jsonb)
    FROM public.wo_payment_installments i
   -- `Overdue` sale de acá, y no alcanza con el filtro de fechas para dejarlo afuera. Ese estado
   -- se marca A MANO y la guarda de transiciones no mira el calendario
   -- (`WHEN 'Invoiced' THEN NEW.status IN ('Completed', 'Overdue')`, migración 0722-156b), así
   -- que una cuota puede estar marcada vencida y tener su fecha de pago el viernes DE ESTA
   -- semana. Sin esta exclusión caía en los dos contadores a la vez —acá por la fecha, y en
   -- notif_agg_wo_installment_overdue() por el brazo `status = 'Overdue'`— y Contabilidad la
   -- veía dos veces, en la campana y en el correo del lunes.
   --
   -- Gana el estado más específico, mismo criterio que usa este módulo cuando
   -- `client.deactivated` le gana a `client.updated`: si ya está vencida, no está por vencer.
   WHERE i.status NOT IN ('Completed', 'Overdue')
     AND i.agreed_payment_date IS NOT NULL
     AND i.agreed_payment_date >= (now() AT TIME ZONE 'America/La_Paz')::date
     AND i.agreed_payment_date <=
         (date_trunc('week', (now() AT TIME ZONE 'America/La_Paz')::date)::date + 6);
$$;


--
-- Name: FUNCTION notif_agg_wo_installment_due_this_week(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_agg_wo_installment_due_this_week() IS 'Contador "Cuotas por vencer esta semana": cuotas cuya fecha de pago acordada cae entre hoy y el domingo, excluyendo Completed y tambien Overdue. Lo segundo mantiene los dos contadores disjuntos: Overdue se marca a mano sin mirar fechas, asi que una cuota vencida con fecha de pago esta semana entraba en los dos. Solo la matriz de Contabilidad lo recibe (alcance department), asi que no filtra por staff.';


--
-- Name: notif_agg_wo_installment_overdue(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_agg_wo_installment_overdue(p_staff_id uuid, p_scope text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Único contador del catálogo que la matriz reparte con DOS alcances: `assigned` para los
  -- gerentes (sus encargos) y `department` para Contabilidad y Cobranzas (todo). Por eso
  -- recibe el scope: sin él, un gerente vería la mora de toda la firma.
  --
  -- `items` sólo se llena en el caso `assigned`, que son pocas filas y se pintan como chips
  -- de COT en el panel. Para Contabilidad la lista puede ser de cientos y no aporta: el
  -- número manda a la pantalla, y la pantalla tiene los filtros.
  SELECT jsonb_build_object(
           'count', COUNT(*),
           'items', CASE WHEN p_scope = 'assigned'
                    THEN COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                           'engagement_id',   q.engagement_id,
                           'engagement_code', q.engagement_code)), '[]'::jsonb)
                    ELSE '[]'::jsonb END)
    FROM (
      SELECT e.engagement_id,
             COALESCE(e.engagement_code, '—') AS engagement_code
        FROM public.wo_payment_installments i
        JOIN public.work_orders w  ON w.wo_id = i.wo_id
        JOIN public.engagements e  ON e.engagement_id = w.engagement_id
       WHERE i.status <> 'Completed'
         AND (i.status = 'Overdue'
              OR (i.agreed_payment_date IS NOT NULL
                  AND i.agreed_payment_date < (now() AT TIME ZONE 'America/La_Paz')::date))
         AND (p_scope <> 'assigned'
              OR p_staff_id IN (e.manager_id, e.specialist_it_id, e.specialist_tax_id))
    ) q;
$$;


--
-- Name: FUNCTION notif_agg_wo_installment_overdue(p_staff_id uuid, p_scope text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_agg_wo_installment_overdue(p_staff_id uuid, p_scope text) IS 'Contador "Cuotas vencidas". Respeta el scope_key de la matriz: `assigned` limita a los encargos donde el staff es gerente (general o especialista); cualquier otro alcance cuenta toda la firma.';


--
-- Name: notif_client_assigned(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_client_assigned(p_client_id uuid) RETURNS TABLE(staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Espejo de `is_assigned_to_client()`, del revés: esa función pregunta "¿estoy asignado a
  -- este cliente?" y ésta responde "¿quiénes lo están?". Se suman los dos especialistas, que
  -- la original no mira: para la matriz de notificaciones son gerentes del encargo igual que
  -- el general, y las tres columnas se mueven siempre juntas.
  --
  -- Sin filtrar por estado del encargo, igual que la original: un cliente con un encargo
  -- cerrado sigue siendo "tu cliente" a los efectos de enterarte de que lo inactivaron.
  SELECT DISTINCT s FROM (
    SELECT e.partner_id        AS s FROM public.engagements e WHERE e.client_id = p_client_id
    UNION SELECT e.manager_id        FROM public.engagements e WHERE e.client_id = p_client_id
    UNION SELECT e.sqr_id            FROM public.engagements e WHERE e.client_id = p_client_id
    UNION SELECT e.encargado_id      FROM public.engagements e WHERE e.client_id = p_client_id
    UNION SELECT e.specialist_it_id  FROM public.engagements e WHERE e.client_id = p_client_id
    UNION SELECT e.specialist_tax_id FROM public.engagements e WHERE e.client_id = p_client_id
  ) q WHERE s IS NOT NULL
$$;


--
-- Name: FUNCTION notif_client_assigned(p_client_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_client_assigned(p_client_id uuid) IS 'Staff asignado a un cliente: quienes ocupan un cargo en alguno de sus encargos, en cualquier estado. Espejo de is_assigned_to_client() en sentido inverso, incluidos los dos especialistas.';


--
-- Name: notif_contador(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_contador(p_payload jsonb, p_clave text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  -- Espejo de `conteoDeConcepto` en
  -- supabase/functions/_shared/plantillas/constants/recordatorios.ts: un bucket es
  -- `{"count": n}`, y lo que no sea un número cuenta como cero. El `trunc` y el `GREATEST`
  -- están para que un payload raro no haga fallar un INSERT de notificación.
  SELECT CASE
    WHEN jsonb_typeof(COALESCE(p_payload, '{}'::jsonb) -> p_clave -> 'count')
           IS DISTINCT FROM 'number'
      THEN 0
    ELSE GREATEST(trunc((p_payload -> p_clave ->> 'count')::numeric)::integer, 0)
  END;
$$;


--
-- Name: FUNCTION notif_contador(p_payload jsonb, p_clave text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_contador(p_payload jsonb, p_clave text) IS 'Lee el contador de un bucket de recordatorio (`{"count": n}`) del payload. Cero si el bucket falta o no trae numero. Espejo de conteoDeConcepto en plantillas/constants/recordatorios.ts.';


--
-- Name: notif_emit_approval_reminder_weekly(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_emit_approval_reminder_weekly() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_from      date := public.notif_timesheet_window_start();
  v_semana    text := to_char((now() AT TIME ZONE 'America/La_Paz')::date, 'IYYY-"W"IW');
  v_lineas    jsonb;
  v_capac     jsonb;
  v_encargos  jsonb;
  v_total     integer;
  v_avisados  integer := 0;
  v_rec       record;
BEGIN
  FOR v_rec IN
    SELECT s.staff_id, ur.role_key
      FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
      JOIN public.notification_role_types nrt ON nrt.role_key = ur.role_key
     WHERE nrt.type_key = 'approval.reminder.weekly'
       AND s.is_active
       AND s.deleted_at IS NULL
       AND s.email IS NOT NULL
       AND btrim(s.email) <> ''
  LOOP
    -- Cada pieza del resumen se incluye SOLO si la matriz le concede ese contador. Sumarlos
    -- todos le mostraria a un gerente la cola de capacitacion de Talento Humano.
    v_lineas := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'timesheet.pending_approval')
                     THEN public.notif_agg_timesheet_pending_approval(v_rec.staff_id, v_from)
                     ELSE NULL END;
    v_capac  := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'approval.training_pending')
                     THEN public.notif_agg_approval_training_pending()
                     ELSE NULL END;
    v_encargos := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'engagement.pending_partner_approval')
                       THEN public.engagement_approval_bucket(v_rec.staff_id, 'Pending_Approval')
                       ELSE NULL END;

    v_total := COALESCE((v_lineas->>'count')::integer, 0)
             + COALESCE((v_capac->>'count')::integer, 0)
             + COALESCE((v_encargos->>'count')::integer, 0);
    CONTINUE WHEN v_total = 0;

    PERFORM public.notify_staff('approval.reminder.weekly', v_rec.staff_id, NULL,
              jsonb_build_object('dedupe',    v_semana,
                                 'total',     v_total,
                                 'lineas',    v_lineas,
                                 'capacitacion', v_capac,
                                 'encargos',  v_encargos));
    v_avisados := v_avisados + 1;
  END LOOP;

  RETURN v_avisados;
END;
$$;


--
-- Name: FUNCTION notif_emit_approval_reminder_weekly(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_emit_approval_reminder_weekly() IS 'Recordatorio semanal de aprobaciones: lineas de timesheet, cola de capacitacion y encargos esperando al Socio. Cada pieza entra solo si la matriz le concede ese contador al rol.';


--
-- Name: notif_emit_fund_reminder_weekly(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_emit_fund_reminder_weekly() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_semana   text := to_char((now() AT TIME ZONE 'America/La_Paz')::date, 'IYYY-"W"IW');
  v_revision jsonb;
  v_desemb   jsonb;
  v_liquid   jsonb;
  v_cierre   jsonb;
  -- Los mismos cuatro contadores recortados a lo que la matriz le concede a CADA destinatario.
  v_rev_rol  jsonb;
  v_des_rol  jsonb;
  v_liq_rol  jsonb;
  v_cie_rol  jsonb;
  v_total    integer;
  v_avisados integer := 0;
  v_rec      record;
BEGIN
  -- Los cuatro contadores de fondos no reciben staff: son de toda la firma, y la matriz se los
  -- concede a Contabilidad con alcance `department`. Se calculan una sola vez.
  v_revision := public.notif_agg_fund_expense_review_pending();
  v_desemb   := public.notif_agg_fund_disbursement_pending();
  v_liquid   := public.notif_agg_fund_settlement_pending();
  v_cierre   := public.notif_agg_fund_closure_pending();

  FOR v_rec IN
    SELECT s.staff_id, ur.role_key
      FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
      JOIN public.notification_role_types nrt ON nrt.role_key = ur.role_key
     WHERE nrt.type_key = 'fund.reminder.weekly'
       AND s.is_active
       AND s.deleted_at IS NULL
       AND s.email IS NOT NULL
       AND btrim(s.email) <> ''
  LOOP
    -- El recorte por rol tiene que pasar ANTES de armar el payload y no sólo dentro de v_total:
    -- gatear el total decide bien a quién se le manda y mal qué lee. `detallesDeRecordatorio()`
    -- (plantillas/notificaciones.ts) renderiza todo bucket con count > 0, así que un
    -- accounting_analyst —que tiene `fund.reminder.weekly` y de los cuatro contadores sólo
    -- `fund.expense.review_pending`— recibía los otros tres, que son de Contabilidad.
    -- Mismo patrón que notif_emit_approval_reminder_weekly: la pieza no concedida viaja NULL.
    v_rev_rol := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'fund.expense.review_pending')
                      THEN v_revision ELSE NULL END;
    v_des_rol := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'fund.disbursement.pending')
                      THEN v_desemb ELSE NULL END;
    v_liq_rol := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'fund.settlement.pending')
                      THEN v_liquid ELSE NULL END;
    v_cie_rol := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'fund.request.closure_pending')
                      THEN v_cierre ELSE NULL END;

    v_total := COALESCE((v_rev_rol->>'count')::integer, 0)
             + COALESCE((v_des_rol->>'count')::integer, 0)
             + COALESCE((v_liq_rol->>'count')::integer, 0)
             + COALESCE((v_cie_rol->>'count')::integer, 0);
    CONTINUE WHEN v_total = 0;

    PERFORM public.notify_staff('fund.reminder.weekly', v_rec.staff_id, NULL,
              jsonb_build_object('dedupe', v_semana,
                                 'total',  v_total,
                                 'revision_gastos', v_rev_rol,
                                 'desembolsos',     v_des_rol,
                                 'liquidaciones',   v_liq_rol,
                                 'cierres',         v_cie_rol));
    v_avisados := v_avisados + 1;
  END LOOP;

  RETURN v_avisados;
END;
$$;


--
-- Name: FUNCTION notif_emit_fund_reminder_weekly(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_emit_fund_reminder_weekly() IS 'Recordatorio semanal de fondos: gastos por revisar, solicitudes por desembolsar, por liquidar y por cerrar. Cada contador entra al payload solo si la matriz se lo concede al rol del destinatario.';


--
-- Name: notif_emit_timesheet_reminder_daily(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_emit_timesheet_reminder_daily() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_from     date := public.notif_timesheet_window_start();
  v_hoy      text := to_char((now() AT TIME ZONE 'America/La_Paz')::date, 'YYYY-MM-DD');
  v_weeks    jsonb;
  v_overdue  jsonb;
  v_reverted jsonb;
  v_avisados integer := 0;
  v_rec      record;
BEGIN
  FOR v_rec IN
    SELECT s.staff_id, ur.role_key
      FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
      JOIN public.notification_role_types nrt ON nrt.role_key = ur.role_key
     WHERE nrt.type_key = 'timesheet.reminder.daily'
       AND s.is_active
       AND s.deleted_at IS NULL
       AND s.email IS NOT NULL
       AND btrim(s.email) <> ''
  LOOP
    -- Hora local, no CURRENT_DATE (UTC): ver 20260911100600_fecha_local_current_date.sql.
    v_weeks    := public.get_week_statuses(v_rec.staff_id, v_from, (now() AT TIME ZONE 'America/La_Paz')::date);
    v_overdue  := public.notif_agg_timesheet_overdue(v_weeks);
    v_reverted := public.notif_agg_timesheet_reverted(v_weeks);

    -- Sin nada pendiente no se manda nada. Un recordatorio que dice "cero" todos los días
    -- enseña a ignorarlo.
    CONTINUE WHEN COALESCE((v_overdue->>'count')::integer, 0)
                + COALESCE((v_reverted->>'count')::integer, 0) = 0;

    PERFORM public.notify_staff('timesheet.reminder.daily', v_rec.staff_id, NULL,
              jsonb_build_object('dedupe',   v_hoy,
                                 'overdue',  v_overdue,
                                 'reverted', v_reverted));
    v_avisados := v_avisados + 1;
  END LOOP;

  RETURN v_avisados;
END;
$$;


--
-- Name: FUNCTION notif_emit_timesheet_reminder_daily(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_emit_timesheet_reminder_daily() IS 'Recordatorio diario de horas: semanas sin cargar y semanas devueltas. Devuelve a cuantas personas se les emitio (el dedupe puede descartar alguna si el cron corre dos veces el mismo dia).';


--
-- Name: notif_emit_wo_installment_reminder_weekly(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_emit_wo_installment_reminder_weekly() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_semana   text := to_char((now() AT TIME ZONE 'America/La_Paz')::date, 'IYYY-"W"IW');
  v_semana_actual jsonb := public.notif_agg_wo_installment_due_this_week();
  v_mora     jsonb;
  -- `v_semana_actual` es de toda la firma; esta es su version recortada al destinatario.
  v_por_venc jsonb;
  v_total    integer;
  v_avisados integer := 0;
  v_rec      record;
BEGIN
  FOR v_rec IN
    SELECT s.staff_id, ur.role_key,
           -- El alcance del contador de mora, que la matriz reparte con DOS: `assigned` para los
           -- gerentes (sus encargos) y `department` para Contabilidad (todo). Sin esto un gerente
           -- veria la mora de toda la firma.
           (SELECT n2.scope_key FROM public.notification_role_types n2
             WHERE n2.role_key = ur.role_key
               AND n2.type_key = 'wo.installment.overdue') AS scope_mora
      FROM public.staff s
      JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
      JOIN public.notification_role_types nrt ON nrt.role_key = ur.role_key
     WHERE nrt.type_key = 'wo.installment.reminder.weekly'
       AND s.is_active
       AND s.deleted_at IS NULL
       AND s.email IS NOT NULL
       AND btrim(s.email) <> ''
  LOOP
    v_mora := CASE WHEN v_rec.scope_mora IS NOT NULL
                   THEN public.notif_agg_wo_installment_overdue(v_rec.staff_id, v_rec.scope_mora)
                   ELSE NULL END;

    -- Igual que la mora de arriba: el contador entra al payload sólo si la matriz se lo concede.
    -- `wo.installment.due_this_week` es de Contabilidad (alcance `department`) y los gerentes no
    -- lo tienen, así que mandárselo les entregaba las cuotas por vencer de toda la firma —
    -- exactamente lo que `scope_mora` se cuida de no hacer con las vencidas.
    v_por_venc := CASE WHEN public.notif_role_tiene(v_rec.role_key, 'wo.installment.due_this_week')
                       THEN v_semana_actual ELSE NULL END;

    v_total := COALESCE((v_mora->>'count')::integer, 0)
             + COALESCE((v_por_venc->>'count')::integer, 0);
    CONTINUE WHEN v_total = 0;

    PERFORM public.notify_staff('wo.installment.reminder.weekly', v_rec.staff_id, NULL,
              jsonb_build_object('dedupe', v_semana,
                                 'total',  v_total,
                                 'vencidas',   v_mora,
                                 'por_vencer', v_por_venc));
    v_avisados := v_avisados + 1;
  END LOOP;

  RETURN v_avisados;
END;
$$;


--
-- Name: FUNCTION notif_emit_wo_installment_reminder_weekly(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_emit_wo_installment_reminder_weekly() IS 'Recordatorio semanal de cuotas: vencidas (con el alcance que la matriz le da al rol) y por vencer esta semana (solo si la matriz le concede ese contador). Reemplaza al correo por cuota de wo.client.billing_week (D-44).';


--
-- Name: notif_engagement_daily_scheduled(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_engagement_daily_scheduled() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
  v_rec   record;
  v_sent  integer := 0;
BEGIN
  FOR v_rec IN
    SELECT e.engagement_id, e.end_date,
           COALESCE(e.engagement_code, '') AS engagement_code,
           COALESCE(e.engagement_name, '') AS engagement_name,
           (e.end_date - v_today) AS days_left,
           r.staff_id
      FROM public.engagements e
      CROSS JOIN LATERAL (
        SELECT staff_id FROM public.notif_engagement_owners(e.engagement_id)
        UNION
        SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
      ) r
     WHERE e.end_date IS NOT NULL
       AND (e.end_date - v_today) IN (7, 1)
       -- Un encargo ya finalizado, cancelado o rechazado no tiene fecha fin que avisar. El
       -- mismo criterio de `finalize_due_engagements()`: sólo los estados que siguen vivos.
       AND (e.engagement_state_override IS NULL
            OR e.engagement_state_override NOT IN (6, 7, 8))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.type_key = 'engagement.ending_soon'
         AND n.entity_id = v_rec.engagement_id::text
         AND n.recipient_staff_id = v_rec.staff_id
         AND n.payload->>'days_left' = v_rec.days_left::text
    ) THEN
      IF public.notify_staff('engagement.ending_soon', v_rec.staff_id,
           v_rec.engagement_id::text,
           jsonb_build_object('engagement_id',   v_rec.engagement_id,
                              'engagement_code', v_rec.engagement_code,
                              'engagement_name', v_rec.engagement_name,
                              'end_date',        v_rec.end_date,
                              'days_left',       v_rec.days_left)
           -- El último día no se anuncia como "quedan 1 días": `context` de i18next le da su
           -- propia redacción sin gastar un tipo del catálogo.
           || CASE WHEN v_rec.days_left = 1
                   THEN jsonb_build_object('context', 'last_day')
                   ELSE '{}'::jsonb END) IS NOT NULL THEN
        v_sent := v_sent + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$$;


--
-- Name: FUNCTION notif_engagement_daily_scheduled(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_engagement_daily_scheduled() IS 'FASE 3.c (D-05): aviso previo a la fecha fin del encargo, a 7 dias y a 1 dia, a la conduccion + ADM. Idempotente por destinatario y por days_left contra public.notifications. Devuelve cuantas notificaciones emitio.';


--
-- Name: notif_engagement_managers(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_engagement_managers(p_engagement_id uuid) RETURNS TABLE(staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Los tres gerentes del encargo: el general y los dos especialistas. En la matriz las
  -- columnas Gerente / Gerente ESPECIALISTA ITA / Gerente ESPECIALISTA TAX se mueven siempre
  -- juntas, así que se resuelven juntas.
  SELECT s FROM (
    SELECT e.manager_id        AS s FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION
    SELECT e.specialist_it_id  FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION
    SELECT e.specialist_tax_id FROM public.engagements e WHERE e.engagement_id = p_engagement_id
  ) q WHERE s IS NOT NULL
$$;


--
-- Name: FUNCTION notif_engagement_managers(p_engagement_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_engagement_managers(p_engagement_id uuid) IS 'Alcance `assigned` de la banda gerencial de un encargo: manager_id + specialist_it_id + specialist_tax_id. Lo usan los disparadores de notificación del módulo Órdenes de Trabajo.';


--
-- Name: notif_engagement_owners(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_engagement_owners(p_engagement_id uuid) RETURNS TABLE(staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Los 6 cargos del encargo. `notif_engagement_partners` + `notif_engagement_managers`
  -- (PARTE 2) cubren 5 de estos 6 entre las dos; acá se suma `encargado_id`, que en el
  -- módulo OT no hacía falta y en éste sí.
  SELECT s FROM (
    SELECT e.partner_id        AS s FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION SELECT e.manager_id        FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION SELECT e.sqr_id            FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION SELECT e.encargado_id      FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION SELECT e.specialist_it_id  FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION SELECT e.specialist_tax_id FROM public.engagements e WHERE e.engagement_id = p_engagement_id
  ) q WHERE s IS NOT NULL
$$;


--
-- Name: FUNCTION notif_engagement_owners(p_engagement_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_engagement_owners(p_engagement_id uuid) IS 'Los 6 cargos de un encargo: partner, manager, sqr, encargado y los dos especialistas. Alcance `assigned` de la conduccion, para el modulo Encargos.';


--
-- Name: notif_engagement_partners(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_engagement_partners(p_engagement_id uuid) RETURNS TABLE(staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- sqr_id incluido a propósito (D-19): la función SQR la ocupan Socio, Senior Partner,
  -- Senior o Director, y para ellos "asignados" significa justamente "el encargo donde soy
  -- el SQR". Quien la ocupe con un rol que la matriz no contempla lo filtra notify_staff().
  SELECT s FROM (
    SELECT e.partner_id AS s FROM public.engagements e WHERE e.engagement_id = p_engagement_id
    UNION
    SELECT e.sqr_id     FROM public.engagements e WHERE e.engagement_id = p_engagement_id
  ) q WHERE s IS NOT NULL
$$;


--
-- Name: FUNCTION notif_engagement_partners(p_engagement_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_engagement_partners(p_engagement_id uuid) IS 'Alcance `assigned` de la banda alta de un encargo: partner_id + sqr_id. Lo usan los disparadores de notificación del módulo Órdenes de Trabajo.';


--
-- Name: notif_engagement_staffed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_engagement_staffed(p_engagement_id uuid) RETURNS TABLE(staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Staffing VIGENTE AL CIERRE (decisión del operador 2026-09-10): "quien salió del encargo
  -- hace tres meses no tiene por qué enterarse de que terminó".
  --
  -- Hay TRES formas de salir y antes se miraban dos. El borrado lógico y el `CANCELLED` son las
  -- dos salidas ANTICIPADAS; la tercera es la normal —la asignación llega a su `end_date`— y no
  -- deja ninguna marca de estado: `end_date` es NOT NULL, nadie en el repositorio escribe
  -- `'COMPLETED'` (el estado existe en el CHECK y ninguna vía lo asigna), así que una asignación
  -- vencida se queda en `CONFIRMED` con `deleted_at` NULL para siempre. Sin mirar la fecha, esta
  -- función devolvía a quien estuvo en enero para un encargo que cierra en septiembre.
  --
  -- LA COMPARACIÓN ES CONTRA `engagements.end_date` Y NO CONTRA HOY, y eso no es un detalle: el
  -- encargo se finaliza DESPUÉS de que su fecha de fin pasó, así que a esa altura todas las
  -- asignaciones ya vencieron y un filtro contra `now()` dejaría la lista VACÍA — convertiría un
  -- aviso de más en un aviso de menos, que es peor.
  --
  -- Con `e.end_date` NULL no se filtra nada: un dato faltante no puede vaciar la audiencia.
  --
  -- Achicar esto no puede silenciar el evento: `notify_engagement_events` une admin + los 6
  -- cargos + este helper, así que la finalización siempre llega a la conducción.
  SELECT DISTINCT a.staff_id
    FROM public.engagement_assignments a
    JOIN public.engagements e ON e.engagement_id = a.engagement_id
   WHERE a.engagement_id = p_engagement_id
     AND a.deleted_at IS NULL
     AND a.status <> 'CANCELLED'
     AND (e.end_date IS NULL
          OR (a.start_date <= e.end_date AND a.end_date >= e.end_date))
$$;


--
-- Name: FUNCTION notif_engagement_staffed(p_engagement_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_engagement_staffed(p_engagement_id uuid) IS 'Staff cuya asignacion seguia viva AL CIERRE del encargo: sin deleted_at, status <> CANCELLED, y abarcando engagements.end_date. La tercera condicion es la que excluye a quien se fue por vencimiento normal de su asignacion, que no deja marca de estado. Se compara contra end_date del encargo y no contra hoy, porque la finalizacion ocurre cuando esa fecha ya paso y filtrar por hoy vaciaria la lista. Con end_date NULL no filtra. Es la unica via por la que seniors/semis/asistentes se atan a un encargo.';


--
-- Name: notif_fund_request_managers(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_fund_request_managers(p_fund_request_id uuid) RETURNS TABLE(staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT DISTINCT frw.manager_staff_id
    FROM public.fund_request_work_orders frw
   WHERE frw.fund_request_id = p_fund_request_id
     AND frw.manager_staff_id IS NOT NULL
$$;


--
-- Name: FUNCTION notif_fund_request_managers(p_fund_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_fund_request_managers(p_fund_request_id uuid) IS 'Gerentes de las OT de una solicitud de fondos (multi-gerente: cada uno aprueba su parte). Lo usan los disparadores de notificacion del modulo.';


--
-- Name: notif_origen_cambio_rol(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_origen_cambio_rol() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT COALESCE(NULLIF(current_setting('ems.role_change_source', true), ''), 'direct');
$$;


--
-- Name: FUNCTION notif_origen_cambio_rol(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_origen_cambio_rol() IS 'De donde vino el cambio de rol en curso: category si lo escribio sync_user_role_from_category, direct en cualquier otro caso. Lo consume el payload de auth.role.changed para elegir el texto del correo.';


--
-- Name: notif_permiso_de_ruta(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_permiso_de_ruta(p_type_key text, p_module_key text, p_payload jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    -- Los dos avisos de envío AJENO van al detalle de aprobación, no a la hoja propia.
    WHEN p_type_key IN ('timesheet.weekly_submitted', 'timesheet.team_submitted_for_approval')
      THEN 'timesheet_approval.read'
    -- El recordatorio de aprobaciones resume TRES colas que viven en pantallas distintas, y el
    -- botón apunta a la del primer contador con número (`DESTINOS_POR_CONCEPTO`, en
    -- supabase/functions/_shared/plantillas/constants/recordatorios.ts). El permiso tiene que
    -- salir del MISMO contador: gatear el tipo entero por el permiso de su módulo mandaba a
    -- todos a `timesheet.read`, y `hr_manager` —que por la matriz sólo recibe el bucket de
    -- capacitación— no lo tiene. Perdía el botón a `/timesheet/approvals`, que SÍ puede
    -- abrir: tiene `timesheet_approval.read` con alcance `assigned_engagements` desde 0817-180.
    --
    -- El orden de los WHEN es el orden de prioridad de allá, y tiene que seguir siéndolo: si
    -- divergen, el correo gatea por una pantalla y linkea a otra.
    WHEN p_type_key = 'approval.reminder.weekly' THEN
      CASE
        WHEN public.notif_contador(p_payload, 'capacitacion') > 0 THEN 'timesheet_approval.read'
        WHEN public.notif_contador(p_payload, 'encargos')     > 0 THEN 'engagement.read'
        WHEN public.notif_contador(p_payload, 'lineas')       > 0 THEN 'timesheet.read'
        -- Sin ningún contador poblado el destino cae a `RUTAS_RECORDATORIO`, que para este tipo
        -- es `/timesheet/approvals`. `notif_emit_approval_reminder_weekly` no emite con total 0,
        -- así que esto es una red, no un caso esperado.
        ELSE 'timesheet_approval.read'
      END
    -- El recordatorio semanal de fondos NO va a la lista de solicitudes: sus cuatro contadores
    -- son colas de Contabilidad y viven en /fund-requests/disbursements, que exige su propio
    -- permiso. `accounting_analyst` recibe el recordatorio y NO lo tiene, asi que sin esta
    -- excepcion el correo le ofrecia un boton a "Sin acceso".
    WHEN p_type_key = 'fund.reminder.weekly' THEN 'fund_disbursement.read'
    WHEN p_module_key = 'fund_request'       THEN 'fund_request.read'
    WHEN p_module_key = 'work_order'         THEN 'work_order.read'
    WHEN p_module_key = 'engagement'         THEN 'engagement.read'
    -- `worksheet.sent_to_quality` es campana pura (email_enabled = false), asi que este
    -- WHEN no apaga ningun boton hoy: esta para que el espejo con
    -- MODULE_ROUTE_PERMISSION no quede cojo si el tipo pasa a mandar correo.
    WHEN p_module_key = 'worksheet'          THEN 'worksheet.read'
    -- El destino de estos tres es la pantalla PROPIA (su hoja, su cronómetro), no una bandeja
    -- de otros: por eso `timesheet.read` / `time_entry.read`, que sí tienen los 17 roles que
    -- reportan horas, con alcance `own`.
    --
    -- `timesheet_approval` cae acá sólo para lo que queda del módulo después de las dos
    -- excepciones de arriba: hoy, nada que se encole. Sus tipos son `approval.reminder.weekly`
    -- (resuelto por contador) y `approval.training_pending`, que es `aggregate` y nunca llega a
    -- `notify_staff`. Se deja porque el default correcto para una bandeja de aprobación de UN
    -- tipo nuevo no es obvio, y fallar hacia el permiso más común avisa sin enlace en vez de
    -- linkear a "Sin acceso".
    WHEN p_module_key = 'timesheet'          THEN 'timesheet.read'
    WHEN p_module_key = 'timesheet_approval' THEN 'timesheet.read'
    WHEN p_module_key = 'tracker'            THEN 'time_entry.read'
    WHEN p_module_key = 'client'             THEN 'client.read'
    -- El módulo `auth` cubre cuentas Y personal, y las dos mitades terminan en la ficha de staff.
    WHEN p_module_key = 'auth'               THEN 'staff.read'
    ELSE NULL
  END;
$$;


--
-- Name: FUNCTION notif_permiso_de_ruta(p_type_key text, p_module_key text, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_permiso_de_ruta(p_type_key text, p_module_key text, p_payload jsonb) IS 'Permiso que exige la pantalla destino de un aviso, espejo de MODULE_ROUTE_PERMISSION/TYPE_ROUTE_PERMISSION en src/lib/notifications.ts. NULL si esa pantalla no exige ninguno. Para approval.reminder.weekly sale del contador poblado del payload, igual que su ruta (DESTINOS_POR_CONCEPTO). Lo usa notify_staff() para apagar el enlace del correo cuando el destinatario no puede abrirla.';


--
-- Name: notif_role_tiene(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_role_tiene(p_role_key text, p_type_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.notification_role_types
     WHERE role_key = p_role_key AND type_key = p_type_key);
$$;


--
-- Name: FUNCTION notif_role_tiene(p_role_key text, p_type_key text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_role_tiene(p_role_key text, p_type_key text) IS 'Si la matriz le concede ese tipo a ese rol. Helper de los emisores de recordatorio.';


--
-- Name: notif_scope_of(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_scope_of(p_type_key text, p_staff_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- El alcance con el que la matriz le concede ese tipo al rol del destinatario, o NULL si
  -- no se lo concede. `user_roles` es UNIQUE por usuario y la PK de la matriz es
  -- (role_key, type_key), así que devuelve una fila como máximo.
  SELECT nrt.scope_key
    FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
    JOIN public.notification_role_types nrt ON nrt.role_key = ur.role_key
   WHERE s.staff_id = p_staff_id
     AND nrt.type_key = p_type_key
$$;


--
-- Name: FUNCTION notif_scope_of(p_type_key text, p_staff_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_scope_of(p_type_key text, p_staff_id uuid) IS 'Alcance (scope_key) con el que la matriz de notificaciones le concede un type_key al rol de un staff; NULL si no se lo concede. Lo usan los disparadores cuando el mismo tipo se reparte con alcances distintos segun el rol.';


--
-- Name: notif_staff_by_practice(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_staff_by_practice(p_practica_id uuid, p_role_keys text[]) RETURNS TABLE(staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Alcance `practica`: los roles indicados, pero sólo los de esa línea de servicio. Con
  -- `p_practica_id` NULL no devuelve a nadie — una ficha sin práctica no le corresponde a
  -- ningún gerente en particular, y mandarlo a todos sería el alcance `firm`, que la matriz
  -- reserva para ADM y Talento Humano.
  SELECT DISTINCT s.staff_id
    FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
   WHERE ur.role_key = ANY (p_role_keys)
     AND s.practica_id = p_practica_id
     AND s.is_active
     AND s.deleted_at IS NULL
$$;


--
-- Name: FUNCTION notif_staff_by_practice(p_practica_id uuid, p_role_keys text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_staff_by_practice(p_practica_id uuid, p_role_keys text[]) IS 'Alcance `practica` de la matriz de notificaciones: staff activo con esos role_key dentro de una misma linea de servicio (staff.practica_id). NULL no devuelve a nadie.';


--
-- Name: notif_staff_by_roles(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_staff_by_roles(p_role_keys text[]) RETURNS TABLE(staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT DISTINCT s.staff_id
    FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
   WHERE ur.role_key = ANY (p_role_keys)
     AND s.is_active
     AND s.deleted_at IS NULL
$$;


--
-- Name: FUNCTION notif_staff_by_roles(p_role_keys text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_staff_by_roles(p_role_keys text[]) IS 'Traduce una lista de role_key a los staff_id activos que los tienen. Lo usan los disparadores para los alcances firm/department de la matriz de notificaciones.';


--
-- Name: notif_timesheet_period_leads(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_timesheet_period_leads(p_period_id uuid) RETURNS TABLE(staff_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- La conducción de los encargos donde esa boleta cargó horas reales. Se resuelve por
  -- `period_id` porque es la misma columna que mira `submit_timesheet_safe` para decidir qué
  -- líneas de aprobación crear: si un encargo no está ahí, no formó parte de este envío.
  --
  -- `encargado_id` queda AFUERA a propósito: lo ocupa un Senior o un Semi Senior, y la
  -- matriz no les da `weekly_submitted` (su celda era el acuse propio, que tiene tipo
  -- aparte). Los dos conjuntos que sí entran son los de PARTE 2, reutilizados tal cual.
  SELECT DISTINCT r.staff_id
    FROM (
      SELECT DISTINCT te.engagement_id
        FROM public.time_entries te
       WHERE te.period_id = p_period_id
         AND te.is_forecast = false
    ) g
    CROSS JOIN LATERAL (
      SELECT staff_id FROM public.notif_engagement_partners(g.engagement_id)
      UNION
      SELECT staff_id FROM public.notif_engagement_managers(g.engagement_id)
    ) r
   WHERE r.staff_id IS NOT NULL
$$;


--
-- Name: FUNCTION notif_timesheet_period_leads(p_period_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_timesheet_period_leads(p_period_id uuid) IS 'Conduccion (socio/SQR/gerentes) de los encargos con horas reales en un periodo de timesheet. Alcance `assigned` del aviso informativo de envio; excluye encargado_id, que la matriz no incluye en ese tipo.';


--
-- Name: notif_timesheet_window_start(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_timesheet_window_start() RETURNS date
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_raw    text;
  v_window integer := 4;
  v_start  date;
  v_from   date;
BEGIN
  -- Se valida con regex en vez de castear a ciegas: global_settings es texto libre y un valor
  -- mal tipeado por el admin no debe tumbar la campana entera.
  --
  -- El `{1,9}` no es cosmetico: '^[0-9]+$' aceptaba 20 digitos, y el cast a integer revienta
  -- ANTES de que el LEAST/GREATEST pueda acotar nada. Nueve digitos siempre entran en integer.
  SELECT setting_value INTO v_raw
    FROM public.global_settings WHERE setting_key = 'TS_ALERT_WINDOW_WEEKS';
  IF v_raw ~ '^[0-9]{1,9}$' THEN
    v_window := LEAST(GREATEST(v_raw::integer, 1), 52);
  END IF;

  SELECT setting_value INTO v_raw
    FROM public.global_settings WHERE setting_key = 'TS_TRACKING_START_DATE';
  -- El regex da la FORMA; el cast va en su propio bloque porque la forma no alcanza. '2026-02-31'
  -- pasa `\d{4}-\d{2}-\d{2}` y revienta al castear, y esta funcion no tiene manejo de excepcion:
  -- la de adentro subia hasta get_my_notifications() y dejaba la campana en blanco para todos, que
  -- es exactamente lo que el comentario de arriba dice que no puede pasar.
  IF btrim(COALESCE(v_raw, '')) ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      v_start := btrim(v_raw)::date;
    EXCEPTION WHEN OTHERS THEN
      -- Cae al default documentado del ajuste: vacio = sin recorte.
      v_start := NULL;
    END;
  END IF;

  -- Hora local, no CURRENT_DATE (UTC): ver 20260911100600_fecha_local_current_date.sql.
  v_from := (now() AT TIME ZONE 'America/La_Paz')::date - (v_window * 7);

  IF v_start IS NOT NULL THEN
    -- La fecha de arranque tiene que caer LUNES para recortar de verdad. Quien consume esto es
    -- `get_week_statuses()`, que rebobina lo que reciba al lunes de esa semana y después sólo
    -- clampea contra hire/termination: con una fecha de arranque a mitad de semana, esa semana
    -- entra ENTERA y la alarma termina reclamando horas de los días anteriores a que la firma
    -- cargara en EMS — exactamente lo que este ajuste existe para evitar.
    --
    -- Se adelanta al lunes siguiente, o sea a la primera semana COMPLETA. Sí, así la semana
    -- parcial del arranque tampoco alarma, y es a propósito: `get_week_statuses()` calcula las
    -- horas esperadas sobre el lunes-viernes entero y no sabe arrancar a mitad, así que la única
    -- alternativa es reclamar horas de días que no existían. Alarmar de menos una semana en el
    -- cutover es el lado barato del error.
    IF EXTRACT(ISODOW FROM v_start)::integer <> 1 THEN
      v_start := v_start + (8 - EXTRACT(ISODOW FROM v_start)::integer);
    END IF;

    -- Y sólo puede ACORTAR la ventana, nunca alargarla.
    IF v_start > v_from THEN
      v_from := v_start;
    END IF;
  END IF;

  RETURN v_from;
END;
$_$;


--
-- Name: FUNCTION notif_timesheet_window_start(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_timesheet_window_start() IS 'Inicio de la ventana de las alarmas de timesheet: TS_ALERT_WINDOW_WEEKS semanas atras, recortada por TS_TRACKING_START_DATE. La fecha de arranque se adelanta al lunes siguiente si no cae lunes, porque get_week_statuses() rebobina al lunes de esa semana y una semana parcial terminaria reclamando horas anteriores al arranque. Un valor mal tipeado cae al default de 4 semanas.';


--
-- Name: notif_wo_daily_scheduled(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notif_wo_daily_scheduled() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
  v_rec   record;
  v_sent  integer := 0;
  c_riesgos constant text[] := ARRAY['risk_partner', 'risk_supervisor'];
BEGIN
  -- ── 1. Plazo de emergencia por vencer (D-09: dos disparos del mismo tipo) ──
  -- `risk_status = 'Emergency_Approved'` es la condición de "todavía debe los datos": en
  -- cuanto el gerente los completa, useCompleteRiskAssessment lo devuelve a 'Pending' y el
  -- recordatorio se apaga solo.
  FOR v_rec IN
    SELECT w.wo_id, w.engagement_id, w.currency, w.emergency_deadline_at,
           COALESCE(e.engagement_code, '') AS engagement_code,
           (w.emergency_deadline_at - v_today) AS days_left,
           r.staff_id
      FROM public.work_orders w
      JOIN public.engagements e ON e.engagement_id = w.engagement_id
      CROSS JOIN LATERAL (
        SELECT staff_id FROM public.notif_engagement_managers(w.engagement_id)
        UNION
        SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
      ) r
     WHERE w.risk_status = 'Emergency_Approved'
       AND w.emergency_deadline_at IS NOT NULL
       AND (w.emergency_deadline_at - v_today) IN (3, 0)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.type_key = 'wo.emergency.deadline_near'
         AND n.entity_id = v_rec.wo_id::text
         AND n.recipient_staff_id = v_rec.staff_id
         AND n.payload->>'days_left' = v_rec.days_left::text
    ) THEN
      IF public.notify_staff('wo.emergency.deadline_near', v_rec.staff_id,
           v_rec.wo_id::text,
           jsonb_build_object('engagement_code', v_rec.engagement_code,
                              'engagement_id',   v_rec.engagement_id,
                              'currency',        v_rec.currency,
                              'deadline',        v_rec.emergency_deadline_at,
                              'days_left',       v_rec.days_left)
           -- El último día no se anuncia como "quedan 0 días": `context` de i18next le da
           -- su propio texto sin gastar un tipo del catálogo (D-09).
           || CASE WHEN v_rec.days_left = 0
                   THEN jsonb_build_object('context', 'last_day')
                   ELSE '{}'::jsonb END) IS NOT NULL THEN
        v_sent := v_sent + 1;
      END IF;
    END IF;
  END LOOP;

  -- ── 2. Plazo de emergencia vencido ──
  -- Un solo aviso por OT y destinatario, sin `days_left`: el hecho no cambia con los días.
  FOR v_rec IN
    SELECT w.wo_id, w.engagement_id, w.currency, w.emergency_deadline_at,
           COALESCE(e.engagement_code, '') AS engagement_code,
           r.staff_id
      FROM public.work_orders w
      JOIN public.engagements e ON e.engagement_id = w.engagement_id
      CROSS JOIN LATERAL (
        SELECT staff_id FROM public.notif_staff_by_roles(c_riesgos)
      ) r
     WHERE w.risk_status = 'Emergency_Approved'
       AND w.emergency_deadline_at IS NOT NULL
       AND w.emergency_deadline_at < v_today
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.type_key = 'wo.emergency.deadline_passed'
         AND n.entity_id = v_rec.wo_id::text
         AND n.recipient_staff_id = v_rec.staff_id
    ) THEN
      IF public.notify_staff('wo.emergency.deadline_passed', v_rec.staff_id,
           v_rec.wo_id::text,
           jsonb_build_object('engagement_code', v_rec.engagement_code,
                              'engagement_id',   v_rec.engagement_id,
                              'currency',        v_rec.currency,
                              'deadline',        v_rec.emergency_deadline_at)) IS NOT NULL THEN
        v_sent := v_sent + 1;
      END IF;
    END IF;
  END LOOP;

  -- ── 3. Semana de facturación del cliente (D-22) ──
  -- Una cuota entra en su semana de facturación cuando `agreed_invoice_date` cae en la semana
  -- corriente (lunes a domingo) y todavía no se facturó. El dedup lleva installment_id porque
  -- una OT puede tener dos cuotas facturables en la misma semana y el entity_id es la OT.
  FOR v_rec IN
    SELECT i.installment_id, i.installment_number, i.amount, i.agreed_invoice_date,
           w.wo_id, w.engagement_id, w.currency,
           COALESCE(e.engagement_code, '') AS engagement_code,
           r.staff_id
      FROM public.wo_payment_installments i
      JOIN public.work_orders w ON w.wo_id = i.wo_id
      JOIN public.engagements e ON e.engagement_id = w.engagement_id
      CROSS JOIN LATERAL (
        SELECT staff_id FROM public.notif_engagement_managers(w.engagement_id)
      ) r
     WHERE i.status = 'Pending'
       AND i.agreed_invoice_date IS NOT NULL
       AND i.agreed_invoice_date >= date_trunc('week', v_today)::date
       AND i.agreed_invoice_date <= date_trunc('week', v_today)::date + 6
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.type_key = 'wo.client.billing_week'
         AND n.entity_id = v_rec.wo_id::text
         AND n.recipient_staff_id = v_rec.staff_id
         AND n.payload->>'installment_id' = v_rec.installment_id::text
    ) THEN
      IF public.notify_staff('wo.client.billing_week', v_rec.staff_id,
           v_rec.wo_id::text,
           jsonb_build_object('engagement_code',    v_rec.engagement_code,
                              'engagement_id',      v_rec.engagement_id,
                              'currency',           v_rec.currency,
                              'installment_id',     v_rec.installment_id,
                              'installment_number', v_rec.installment_number,
                              'amount',             v_rec.amount,
                              'invoice_date',       v_rec.agreed_invoice_date)) IS NOT NULL THEN
        v_sent := v_sent + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_sent;
END;
$$;


--
-- Name: FUNCTION notif_wo_daily_scheduled(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notif_wo_daily_scheduled() IS 'FASE 3.b: los 3 eventos del modulo OT que dependen del calendario (plazo de emergencia por vencer / vencido, semana de facturacion). Idempotente por destinatario contra public.notifications: re-ejecutarla el mismo dia no duplica nada. Devuelve cuantas notificaciones emitio.';


--
-- Name: notify_client_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_client_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_base        jsonb;
  v_rec         record;
  v_deactivated boolean;
  c_firma constant text[] := ARRAY['senior_partner'];
BEGIN
  v_base := jsonb_build_object(
    'client_id',         NEW.client_id,
    'client_legal_name', COALESCE(NEW.client_legal_name, ''),
    'unique_tax_id',     COALESCE(NEW.unique_tax_id, ''));

  -- ── Alta (D-37) ──
  IF TG_OP = 'INSERT' THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(c_firma)
      UNION
      -- El creador. Va por UNION y no con un IF aparte para que no reciba dos filas si
      -- además es el Senior Partner.
      SELECT NEW.created_by_staff_id WHERE NEW.created_by_staff_id IS NOT NULL
    LOOP
      PERFORM public.notify_staff('client.created', v_rec.staff_id,
                                  NEW.client_id::text, v_base);
    END LOOP;
    RETURN NULL;
  END IF;

  -- ── Inactivación ──
  -- `is_active` es NULLABLE con DEFAULT true, así que se compara con COALESCE: un NULL
  -- heredado no debe leerse como "estaba inactivo" y tragarse el aviso.
  v_deactivated := COALESCE(OLD.is_active, true) AND NOT COALESCE(NEW.is_active, true);

  IF v_deactivated THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(c_firma)
      UNION
      SELECT staff_id FROM public.notif_client_assigned(NEW.client_id)
    LOOP
      PERFORM public.notify_staff('client.deactivated', v_rec.staff_id,
                                  NEW.client_id::text, v_base);
    END LOOP;

    -- La inactivación NO cuenta además como edición: es el mismo UPDATE y el aviso
    -- específico ya salió, con más audiencia que el genérico.
    RETURN NULL;
  END IF;

  -- ── Edición (D-04) ──
  -- Cualquier cambio de la ficha, sin filtrar por campo: la matriz se lo da sólo a los
  -- gerentes del cliente, que son pocos y para quienes el dato es de trabajo. Se exige un
  -- cambio real —no basta con que corra el UPDATE— porque un "guardar sin tocar nada" no es
  -- una edición y el formulario permite guardar sin cambios.
  --
  -- `updated_at` SE EXCLUYE DE LA COMPARACIÓN, y es la mitad que hace falta para que la frase
  -- de arriba sea cierta. `update_clients_updated_at` es un trigger BEFORE UPDATE que le pone
  -- `now()` en CADA update, así que para cuando corre este AFTER la fila nueva SIEMPRE difiere
  -- de la vieja: `NEW IS DISTINCT FROM OLD` a secas da true siempre y le manda un aviso a cada
  -- gerente por cada guardado, cambie algo o no.
  --
  -- Se compara sobre jsonb menos esa clave en vez de enumerar columnas: la lista se
  -- desactualiza en cuanto alguien agrega un campo a `clients`, y el modo de fallar es
  -- silencioso — dejaría de avisar de un campo nuevo sin que nada lo acuse.
  IF to_jsonb(NEW) - 'updated_at' IS DISTINCT FROM to_jsonb(OLD) - 'updated_at' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_client_assigned(NEW.client_id)
    LOOP
      PERFORM public.notify_staff('client.updated', v_rec.staff_id,
                                  NEW.client_id::text, v_base);
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_client_events fallo para % : %', NEW.client_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_client_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_client_events() IS 'FASE 3.f: alta, edicion e inactivacion de un cliente. El alta suma al creador porque el alcance `assigned` esta vacio ese dia (D-37); la inactivacion no cuenta ademas como edicion. Degrada a WARNING.';


--
-- Name: notify_engagement_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_engagement_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row      record;
  v_base     jsonb;
  v_rec      record;
  v_owners   boolean;
  v_finished boolean;
  v_cliente  text;
BEGIN
  -- OLD en el borrado, NEW en todo lo demás: así el resto del cuerpo no repite el CASE.
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  -- El CLIENTE viaja en el payload porque es lo que ubica al encargo: "Auditoria Externa 2026"
  -- se repite entre clientes, y el correo de `engagement.specialist_assigned` sale SIN BOTÓN
  -- —el portafolio de 0828-185 no contempla a los especialistas—, así que el texto es lo único
  -- que el destinatario tiene para saber de qué encargo le hablan. `client_id` es NOT NULL, así que
  -- esto sólo queda vacío si el cliente se borró en la misma transacción.
  SELECT c.client_legal_name INTO v_cliente
    FROM public.clients c
   WHERE c.client_id = v_row.client_id;

  v_base := jsonb_build_object(
    'engagement_code', COALESCE(v_row.engagement_code, ''),
    'engagement_name', COALESCE(v_row.engagement_name, ''),
    'client_name',     COALESCE(v_cliente, ''),
    'engagement_id',   v_row.engagement_id);

  -- ── Borrado: sólo auditoría (la matriz se lo da a ADM con alcance firm) ──
  IF TG_OP = 'DELETE' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
    LOOP
      PERFORM public.notify_staff('engagement.deleted', v_rec.staff_id,
                                  v_row.engagement_id::text, v_base);
    END LOOP;
    RETURN NULL;
  END IF;

  -- ── Alta ──
  IF TG_OP = 'INSERT' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_owners(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('engagement.created', v_rec.staff_id,
                                  NEW.engagement_id::text, v_base);
    END LOOP;
  END IF;

  -- ── Cambio de responsables ──
  -- En el alta NO se emite: "cambiaron los responsables" de un encargo que acaba de nacer no
  -- es un hecho — para eso está `engagement.created`.
  IF TG_OP = 'UPDATE' THEN
    v_owners := NEW.partner_id        IS DISTINCT FROM OLD.partner_id
             OR NEW.manager_id        IS DISTINCT FROM OLD.manager_id
             OR NEW.sqr_id            IS DISTINCT FROM OLD.sqr_id
             OR NEW.encargado_id      IS DISTINCT FROM OLD.encargado_id
             OR NEW.specialist_it_id  IS DISTINCT FROM OLD.specialist_it_id
             OR NEW.specialist_tax_id IS DISTINCT FROM OLD.specialist_tax_id;

    IF v_owners THEN
      -- Admins por auditoría (firm) + la conducción nueva. Se notifica a la conducción
      -- RESULTANTE, no a la anterior: al que sacaron ya no le corresponde el encargo.
      FOR v_rec IN
        SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
        UNION
        SELECT staff_id FROM public.notif_engagement_owners(NEW.engagement_id)
      LOOP
        PERFORM public.notify_staff('engagement.owners.changed', v_rec.staff_id,
                                    NEW.engagement_id::text, v_base);
      END LOOP;
    END IF;
  END IF;

  -- ── "Te asignaron como SQR / Encargado" (alcance `own`) ──
  -- Se emiten TAMBIÉN en el alta (decisión del operador 2026-09-10): el formulario pide las
  -- dos personas al crear el encargo, y si sólo se emitieran al reasignar, un Encargado no se
  -- enteraría nunca de su primer encargo — en `engagement.created` la columna Senior está en
  -- `no`, así que ese aviso no le llega.
  IF NEW.sqr_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.sqr_id IS DISTINCT FROM OLD.sqr_id) THEN
    PERFORM public.notify_staff('engagement.sqr_assigned', NEW.sqr_id,
                                NEW.engagement_id::text, v_base);
  END IF;

  IF NEW.encargado_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.encargado_id IS DISTINCT FROM OLD.encargado_id) THEN
    PERFORM public.notify_staff('engagement.encargado_assigned', NEW.encargado_id,
                                NEW.engagement_id::text, v_base);
  END IF;

  -- Y lo mismo para los dos gerentes ESPECIALISTAS (D-43). Sin esto, al Gerente ESPECIALISTA
  -- ITA/TAX solo le llegaba `engagement.owners.changed` —"Cambiaron los responsables del
  -- encargo"—, el mismo aviso generico que recibe cuando cambian al Socio o al SQR: tenia que
  -- abrir el encargo para saber si el cambio era sobre el.
  --
  -- UN tipo y no dos, con la especialidad en `context`: el hecho es identico y lo unico que
  -- cambia es la palabra. Mismo criterio que D-09 con `days_left`.
  IF NEW.specialist_it_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.specialist_it_id IS DISTINCT FROM OLD.specialist_it_id) THEN
    PERFORM public.notify_staff('engagement.specialist_assigned', NEW.specialist_it_id,
              NEW.engagement_id::text, v_base || jsonb_build_object('context', 'it'));
  END IF;

  IF NEW.specialist_tax_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.specialist_tax_id IS DISTINCT FROM OLD.specialist_tax_id) THEN
    PERFORM public.notify_staff('engagement.specialist_assigned', NEW.specialist_tax_id,
              NEW.engagement_id::text, v_base || jsonb_build_object('context', 'tax'));
  END IF;

  -- ── Finalización ──
  -- La señal es el override llegando a 7, venga del cron nocturno
  -- (finalize_due_engagements) o del trigger BEFORE recompute_engagement_finalization, que
  -- lo fija en cualquier UPDATE cuya fecha fin ya pasó. Las dos vías terminan acá.
  v_finished := NEW.engagement_state_override = 7
            AND (TG_OP = 'INSERT' OR OLD.engagement_state_override IS DISTINCT FROM 7);

  IF v_finished THEN
    -- Conducción + equipo vigente. Es el único evento del módulo que baja hasta los
    -- asistentes, y por eso el único que necesita la tabla de staffing.
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
      UNION
      SELECT staff_id FROM public.notif_engagement_owners(NEW.engagement_id)
      UNION
      SELECT staff_id FROM public.notif_engagement_staffed(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('engagement.finalized', v_rec.staff_id,
                NEW.engagement_id::text,
                v_base || jsonb_build_object('end_date', NEW.end_date));
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_engagement_events fallo para % : %', v_row.engagement_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_engagement_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_engagement_events() IS 'FASE 3.c: 5 eventos de engagements (alta, cambio de responsables, asignacion de SQR/Encargado/especialista, finalizacion y borrado). La finalizacion baja hasta el staffing vigente porque es el unico evento que la matriz concede a seniors/semis/asistentes. Degrada a WARNING.';


--
-- Name: notify_engagement_staffing_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_engagement_staffing_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_viva_antes boolean;
  v_viva_ahora boolean;
  v_alta       boolean;
  v_baja       boolean;
  v_reemplazo  boolean;
  v_avisos     jsonb;
  v_aviso      jsonb;
  v_staff      uuid;
  v_eng        uuid;
  v_es_alta    boolean;
  v_code       text;
  v_name       text;
  v_who        text;
  v_base       jsonb;
  v_rec        record;
BEGIN
  -- TRES FORMAS DE SACAR A ALGUIEN, y las tres cuentan (decisión del operador 2026-09-10).
  -- Durante un tiempo el comentario decía "tres" y el código miraba dos: el borrado lógico
  -- (`deleted_at`, que es lo que escribe save_engagement_assignments) y el paso a CANCELLED.
  --
  -- La tercera es el REEMPLAZO: `save_engagement_assignments` cambia `staff_id` en la fila que ya
  -- existe, sin tocar `deleted_at` ni `status`. No es un caso raro —esa función tiene una
  -- validación dedicada para él (cero_02, "reasignar la fila a un staff DISTINTO exige la misma
  -- elegibilidad que un insert nuevo")— y sin embargo no encendía ninguno de los dos predicados,
  -- así que la reasignación no le avisaba a NADIE: ni a quien salía, ni a quien entraba, ni a los
  -- gerentes.
  --
  -- Un reemplazo son DOS hechos y se emiten los dos, en ese orden: se fue uno, entró otro.
  --
  -- Los cambios de fechas/horas/porcentaje siguen sin avisar: el Scheduler reescribe esas
  -- columnas seguido y sería puro ruido.
  --
  -- "Viva" se calcula una vez y las tres condiciones se leen de ahí. Antes cada predicado
  -- enumeraba sus combinaciones de `deleted_at` y `status` por separado, y de paso eso hacía que
  -- borrar una fila que YA estaba CANCELLED contara como una baja nueva.
  IF TG_OP = 'INSERT' THEN
    v_viva_antes := false;
    v_viva_ahora := NEW.deleted_at IS NULL AND NEW.status <> 'CANCELLED';
  ELSE
    v_viva_antes := OLD.deleted_at IS NULL AND OLD.status <> 'CANCELLED';
    v_viva_ahora := NEW.deleted_at IS NULL AND NEW.status <> 'CANCELLED';
  END IF;

  v_alta      := NOT v_viva_antes AND v_viva_ahora;
  v_baja      := v_viva_antes AND NOT v_viva_ahora;
  v_reemplazo := TG_OP <> 'INSERT'
             AND v_viva_antes AND v_viva_ahora
             AND NEW.staff_id IS DISTINCT FROM OLD.staff_id;

  -- Cada aviso es (a quién, de qué encargo, si es alta). El reemplazo produce dos; el resto, uno.
  --
  -- La baja lleva el encargo VIEJO y el alta el nuevo, y no es una precaución vacía: nada en la
  -- base impide que un UPDATE directo mueva `engagement_id` —`save_engagement_assignments` no lo
  -- toca y su WHERE lo fija, pero eso es la aplicación, no una restricción—. Con los dos avisos
  -- armados sobre `NEW`, un movimiento entre encargos le decía al que sale que lo sacaron de un
  -- encargo donde nunca estuvo, y dejaba a los gerentes del encargo viejo sin enterarse.
  IF v_reemplazo THEN
    v_avisos := jsonb_build_array(
      jsonb_build_object('staff', OLD.staff_id, 'eng', OLD.engagement_id, 'alta', false),
      jsonb_build_object('staff', NEW.staff_id, 'eng', NEW.engagement_id, 'alta', true));
  ELSIF v_alta OR v_baja THEN
    v_avisos := jsonb_build_array(
      jsonb_build_object('staff', NEW.staff_id, 'eng', NEW.engagement_id, 'alta', v_alta));
  ELSE
    RETURN NULL;
  END IF;

  FOR v_aviso IN SELECT * FROM jsonb_array_elements(v_avisos)
  LOOP
    v_staff   := (v_aviso->>'staff')::uuid;
    v_eng     := (v_aviso->>'eng')::uuid;
    v_es_alta := (v_aviso->>'alta')::boolean;

    -- Encargo y persona se resuelven POR AVISO. En un reemplazo cada mitad nombra a una persona
    -- distinta —el texto que leen los gerentes es "asignaron a Fulano" / "sacaron a Mengano"— y,
    -- si además cambió el encargo, cada mitad habla del suyo.
    SELECT COALESCE(e.engagement_code, ''), COALESCE(e.engagement_name, '')
      INTO v_code, v_name
      FROM public.engagements e
     WHERE e.engagement_id = v_eng;

    SELECT COALESCE(s.first_name || ' ' || s.last_name, '')
      INTO v_who
      FROM public.staff s WHERE s.staff_id = v_staff;

    v_base := jsonb_build_object(
      'engagement_code', v_code,
      'engagement_name', v_name,
      'engagement_id',   v_eng,
      'staff_name',      v_who);

    -- El MISMO type_key con dos redacciones, porque el hecho se lee distinto según de qué lado
    -- estés: "te asignaron a X" vs "asignaron a Fulano a X". `context` es la clave reservada de
    -- i18next y el panel hace t(label_key, {...payload}), así que cada destinatario recibe su
    -- propia variante sin que el catálogo necesite cuatro tipos.
    PERFORM public.notify_staff('engagement.staffing.changed', v_staff,
              v_eng::text,
              v_base || jsonb_build_object('context',
                CASE WHEN v_es_alta THEN 'assigned' ELSE 'unassigned' END));

    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_managers(v_eng)
    LOOP
      -- Al propio afectado no se le manda dos veces si además es gerente del encargo.
      IF v_rec.staff_id IS DISTINCT FROM v_staff THEN
        PERFORM public.notify_staff('engagement.staffing.changed', v_rec.staff_id,
                  v_eng::text,
                  v_base || jsonb_build_object('context',
                    CASE WHEN v_es_alta THEN 'team_assigned' ELSE 'team_unassigned' END));
      END IF;
    END LOOP;
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_engagement_staffing_events fallo para % : %', NEW.assignment_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_engagement_staffing_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_engagement_staffing_events() IS 'FASE 3.c: alta, baja y REEMPLAZO de staffing. Baja = deleted_at o status CANCELLED; reemplazo = cambia staff_id en la fila viva, que es como save_engagement_assignments reasigna una posicion y antes no avisaba a nadie. Un reemplazo emite dos hechos: baja del anterior y alta del nuevo. Los cambios de fechas/horas no avisan. El afectado y los gerentes reciben el mismo type_key con redaccion distinta via el `context` de i18next. Degrada a WARNING.';


--
-- Name: notify_fund_expense_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_fund_expense_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_requester uuid;
  v_manager   uuid;
  v_number    text;
  v_payload   jsonb;
  v_rec       record;
  v_faltan    integer;
  -- La bandeja de revision contable. Los dos eventos de abajo deben repartirse SIEMPRE al
  -- mismo conjunto; tenerlos como constante evita que vuelvan a separarse.
  c_contabilidad constant text[] := ARRAY['accounting_analyst', 'accounting_manager'];
BEGIN
  SELECT fr.requester_staff_id, COALESCE(fr.request_number, '')
    INTO v_requester, v_number
    FROM public.fund_requests fr
   WHERE fr.fund_request_id = NEW.fund_request_id;

  -- El gerente que aprueba ESTE gasto es el de su OT, no el de toda la solicitud.
  SELECT frw.manager_staff_id INTO v_manager
    FROM public.fund_request_work_orders frw
   WHERE frw.fund_request_id = NEW.fund_request_id
     AND frw.wo_id = NEW.wo_id;

  -- fund_request_id: lo consume notificationRoute() para armar /fund-requests/<id>/expenses.
  v_payload := jsonb_build_object(
    'fund_request_id', NEW.fund_request_id,
    'request_number',  v_number,
    'amount',          NEW.amount,
    'currency',        NEW.currency,
    'description',     COALESCE(NEW.description, ''));

  -- Entro a aprobacion: al gerente de su OT (envio inicial y reenvios).
  IF NEW.status = 'pendiente_aprobacion'
     AND OLD.status IS DISTINCT FROM 'pendiente_aprobacion'
     AND v_manager IS NOT NULL THEN
    PERFORM public.notify_staff('fund.expense.submitted_for_approval',
                                v_manager, NEW.fre_id::text, v_payload);
  END IF;

  -- Decision del gerente sobre el gasto: al solicitante.
  IF OLD.status = 'pendiente_aprobacion'
     AND NEW.status IN ('aprobado_gerente', 'observado', 'rechazado') THEN
    PERFORM public.notify_staff('fund.expense.decided',
              v_requester, NEW.fre_id::text,
              v_payload || jsonb_build_object('decision', NEW.status::text));
  END IF;

  -- El gerente aprobo: el gasto entra a la bandeja de revision de contabilidad.
  IF OLD.status = 'pendiente_aprobacion' AND NEW.status = 'aprobado_gerente' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_contabilidad)
    LOOP
      PERFORM public.notify_staff('fund.expense.sent_to_support_review',
                                  v_rec.staff_id, NEW.fre_id::text, v_payload);
    END LOOP;
  END IF;

  -- Contabilidad devuelve por falta de respaldo: al solicitante. El flag solo lo puede
  -- encender quien tenga expense_settlement.update (fre_validate_transition), asi que este
  -- ES el rechazo de contabilidad, no el del gerente.
  IF OLD.returned_by_assistant = false AND NEW.returned_by_assistant = true THEN
    PERFORM public.notify_staff('fund.expense.returned_no_support',
              v_requester, NEW.fre_id::text,
              v_payload || jsonb_build_object(
                'reason', COALESCE(NEW.invoice_observation_notes, '')));
  END IF;

  -- El solicitante subio la factura y reenvia: vuelve DIRECTO a contabilidad, sin pasar por
  -- el gerente. La senal es el flag apagandose y no un cambio de status, porque
  -- useResendReturnedExpense() devuelve el status a 'aprobado_gerente' (de donde salio).
  IF OLD.returned_by_assistant = true AND NEW.returned_by_assistant = false THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_contabilidad)
    LOOP
      PERFORM public.notify_staff('fund.expense.resubmitted',
                                  v_rec.staff_id, NEW.fre_id::text, v_payload);
    END LOOP;
  END IF;

  -- Contabilidad aprobo ESTE gasto: solo al solicitante (uno por gasto).
  IF NEW.status = 'revisado_asistente'
     AND OLD.status IS DISTINCT FROM 'revisado_asistente' THEN
    PERFORM public.notify_staff('fund.expense.reviewed',
              v_requester, NEW.fre_id::text, v_payload);

    -- Y si con este quedaron TODOS revisados, el consolidado al gerente.
    --
    -- 'rechazado' SI cuenta como pendiente, alineado con expensePhase() (src/lib/fundRequest.ts):
    -- "rechazado sigue siendo corregible/reenviable -> no esta finalizado". Excluirlo
    -- disparaba el hito "todos aprobados" mientras quedaba un gasto que el solicitante
    -- todavia puede corregir, y la solicitud no aparecia como lista para liquidar.
    SELECT COUNT(*) INTO v_faltan
      FROM public.fund_request_expenses e
     WHERE e.fund_request_id = NEW.fund_request_id
       AND e.status <> 'revisado_asistente';

    IF v_faltan = 0 THEN
      FOR v_rec IN SELECT staff_id
                     FROM public.notif_fund_request_managers(NEW.fund_request_id)
      LOOP
        PERFORM public.notify_staff('fund.expenses.all_reviewed',
                  v_rec.staff_id, NEW.fund_request_id::text,
                  jsonb_build_object('request_number', v_number,
                                     'fund_request_id', NEW.fund_request_id));
      END LOOP;
    END IF;
  END IF;

  -- Multa IVA: al solicitante.
  IF COALESCE(OLD.iva_penalty_amount, 0) = 0 AND COALESCE(NEW.iva_penalty_amount, 0) > 0 THEN
    PERFORM public.notify_staff('fund.expense.iva_penalty',
              v_requester, NEW.fre_id::text,
              v_payload || jsonb_build_object('penalty', NEW.iva_penalty_amount));
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_fund_expense_events fallo para % : %', NEW.fre_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_fund_expense_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_fund_expense_events() IS 'FASE 3.a: 8 eventos de fund_request_expenses. Contabilidad revisa gasto por gasto: el solicitante recibe uno por gasto (fund.expense.reviewed) y el gerente UNO solo cuando quedan todos revisados (fund.expenses.all_reviewed), que es el hito previo a la liquidacion. Degrada a WARNING: nunca bloquea la operacion.';


--
-- Name: notify_fund_request_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_fund_request_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_payload jsonb;
  v_rec     record;
BEGIN
  v_payload := jsonb_build_object(
    'request_number', COALESCE(NEW.request_number, ''),
    'amount',         NEW.total_requested_amount,
    'currency',       NEW.currency);

  -- Entro a aprobacion: a CADA gerente de las OT. "Entro", no "salio de borrador": cubre el
  -- envio inicial y los reenvios desde observado/rechazado por igual.
  IF NEW.status = 'pendiente_aprobacion'
     AND OLD.status IS DISTINCT FROM 'pendiente_aprobacion' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.request.submitted_for_approval',
                                  v_rec.staff_id, NEW.fund_request_id::text, v_payload);
    END LOOP;
  END IF;

  -- Decision del gerente: al solicitante.
  IF OLD.status = 'pendiente_aprobacion'
     AND NEW.status IN ('aprobado_gerente', 'observado', 'rechazado') THEN
    PERFORM public.notify_staff('fund.request.decided',
              NEW.requester_staff_id, NEW.fund_request_id::text,
              v_payload || jsonb_build_object('decision', NEW.status::text));
  END IF;

  -- Desembolso / liquidacion / cierre: al solicitante Y a los gerentes. Se miran los
  -- timestamps y no el status: son hitos independientes de la maquina de estados (la
  -- liquidacion es de dos pasos manuales) y el status puede no moverse.
  --
  -- El UNION no es cosmetico y el DISTINCT de notif_fund_request_managers() no alcanza: el
  -- solicitante PUEDE ser tambien gerente de la OT. `manager` tiene `fund_request.create`, y
  -- `fr_wo_set_manager()` copia `manager_staff_id` desde `engagements.manager_id`, asi que un
  -- Gerente que pide fondos contra una OT de su propio encargo cae en las dos listas. Como
  -- notify_staff() no deduplica --inserta una fila por llamada, y el dedupe_key del correo es
  -- el notification_id, distinto en cada INSERT-- recibia dos campanas y dos correos por hito.
  -- Es el mismo patron que ya usaba la cancelacion, mas abajo.
  IF OLD.disbursed_at IS NULL AND NEW.disbursed_at IS NOT NULL THEN
    FOR v_rec IN
      SELECT NEW.requester_staff_id AS staff_id
      UNION
      SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.disbursement.done',
                v_rec.staff_id, NEW.fund_request_id::text,
                v_payload || jsonb_build_object('disbursed', NEW.total_disbursed_amount));
    END LOOP;
  END IF;

  IF OLD.settled_at IS NULL AND NEW.settled_at IS NOT NULL THEN
    FOR v_rec IN
      SELECT NEW.requester_staff_id AS staff_id
      UNION
      SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.settlement.recorded',
                v_rec.staff_id, NEW.fund_request_id::text,
                v_payload || jsonb_build_object('balance', NEW.settlement_balance));
    END LOOP;
  END IF;

  IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL THEN
    FOR v_rec IN
      SELECT NEW.requester_staff_id AS staff_id
      UNION
      SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.request.closed',
                v_rec.staff_id, NEW.fund_request_id::text, v_payload);
    END LOOP;
  END IF;

  -- Cancelacion: admins (alcance firm) + los gerentes que la autorizaron.
  IF NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado' THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
      UNION
      SELECT staff_id FROM public.notif_fund_request_managers(NEW.fund_request_id)
    LOOP
      PERFORM public.notify_staff('fund.request.cancelled',
                                  v_rec.staff_id, NEW.fund_request_id::text, v_payload);
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_fund_request_events fallo para % : %', NEW.fund_request_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: notify_staff(text, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_staff(p_type_key text, p_recipient_staff_id uuid, p_entity_id text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_delivery        text;
  v_email_enabled   boolean;
  v_module_key      text;
  v_permiso         text;
  v_payload         jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_role_key        text;
  v_scope_key       text;
  v_notification_id uuid;
  v_email           text;
  v_nombre          text;
  v_dedupe          text;
BEGIN
  IF p_type_key IS NULL OR p_recipient_staff_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- El tipo debe existir y estar activo. Un type_key con typo no crea filas huérfanas.
  SELECT nt.delivery, nt.email_enabled, nt.module_key
    INTO v_delivery, v_email_enabled, v_module_key
    FROM public.notification_types nt
   WHERE nt.type_key = p_type_key
     AND nt.is_active;

  -- Los `aggregate` se calculan al vuelo: no se persisten ni se mandan.
  IF v_delivery IS NULL OR v_delivery = 'aggregate' THEN
    RETURN NULL;
  END IF;

  -- Rol del DESTINATARIO (no del que dispara). Sin cuenta vinculada o sin rol, no hay aviso.
  -- El correo se trae acá mismo: es la misma fila.
  SELECT ur.role_key, s.email,
         btrim(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''))
    INTO v_role_key, v_email, v_nombre
    FROM public.staff s
    JOIN public.user_roles ur ON ur.user_id = s.auth_user_id
   WHERE s.staff_id = p_recipient_staff_id
     AND s.is_active
     AND s.deleted_at IS NULL;

  IF v_role_key IS NULL THEN
    RETURN NULL;
  END IF;

  -- El portón: la matriz decide, y de paso dice con qué alcance.
  SELECT nrt.scope_key INTO v_scope_key
    FROM public.notification_role_types nrt
   WHERE nrt.role_key = v_role_key
     AND nrt.type_key = p_type_key;

  IF v_scope_key IS NULL THEN
    RETURN NULL;
  END IF;

  -- El enlace se apaga ACÁ y no al renderizar: el correo no tiene sesión contra la cual chequear
  -- permisos, así que la única oportunidad de saber si el destinatario puede abrir la pantalla es
  -- este momento, donde ya está resuelto su rol. `rutas.ts` sólo obedece la marca.
  --
  -- Marcarlo, y no omitir el aviso: que no pueda abrir la pantalla no significa que el hecho no
  -- le importe. El correo sale igual, con su resumen, y el botón lleva al inicio de EMS.
  v_permiso := public.notif_permiso_de_ruta(p_type_key, v_module_key, v_payload);
  IF v_permiso IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.authorization_role_permissions arp
        WHERE arp.role_key = v_role_key
          AND arp.permission_key = v_permiso
     ) THEN
    v_payload := v_payload || jsonb_build_object('sin_ruta', true);
  END IF;

  -- La campana, sólo para los tipos que viven ahí.
  IF v_delivery = 'event' THEN
    INSERT INTO public.notifications (recipient_staff_id, type_key, entity_id, payload)
    VALUES (p_recipient_staff_id, p_type_key, p_entity_id, v_payload)
    RETURNING notification_id INTO v_notification_id;
  END IF;

  -- El correo. Tres condiciones, y las tres tienen que darse:
  --
  --   * el tipo está marcado en la matriz (D-44),
  --   * el destinatario tiene correo cargado — sin `staff.email` no hay a dónde mandarlo, y
  --   * el alcance no es `firm`, SALVO que sea un recordatorio.
  --
  -- Lo último es la regla que reemplaza a marcar 419 celdas: `firm` significa "ve toda la firma".
  -- Por campana eso es una lista; por correo POR SUCESO sería un mensaje por cada hecho de la
  -- empresa. La excepción es el recordatorio (`delivery = 'email'`), que es justamente el formato
  -- que le sirve a ese destinatario: un resumen por semana en vez de cien avisos sueltos.
  -- Excluirlo de los dos lo dejaría sin ninguna vía de correo, que no es lo que se decidió.
  IF v_email_enabled
     AND v_email IS NOT NULL
     AND btrim(v_email) <> ''
     AND (v_scope_key <> 'firm' OR v_delivery = 'email') THEN

    -- Para un evento alcanza el notification_id. Un recordatorio (delivery='email') no tiene, y
    -- su unicidad la define quien llama: pasa la ventana en el payload (`dedupe`), y si no la
    -- pasa cae a la fecha, que es la cadencia más fina que tiene sentido para un recordatorio.
    v_dedupe := COALESCE(
      v_notification_id::text,
      p_type_key || '|' || p_recipient_staff_id::text || '|' ||
        COALESCE(v_payload->>'dedupe', to_char(now(), 'YYYY-MM-DD')));

    INSERT INTO public.notification_emails
      (dedupe_key, notification_id, recipient_staff_id, to_email, to_name, type_key,
       entity_id, payload)
    VALUES
      (v_dedupe, v_notification_id, p_recipient_staff_id, btrim(v_email),
       NULLIF(v_nombre, ''), p_type_key, p_entity_id, v_payload)
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  RETURN v_notification_id;
END;
$$;


--
-- Name: FUNCTION notify_staff(p_type_key text, p_recipient_staff_id uuid, p_entity_id text, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_staff(p_type_key text, p_recipient_staff_id uuid, p_entity_id text, p_payload jsonb) IS 'Porton unico de escritura. Inserta en la campana si delivery=event, y encola correo si el tipo tiene email_enabled, el destinatario tiene staff.email y su alcance no es firm (D-44). Marca el payload con sin_ruta=true cuando el rol del destinatario no tiene el permiso que exige la pantalla destino (notif_permiso_de_ruta), para que el correo no le ofrezca un boton a "Sin acceso". Devuelve el notification_id, o NULL si no corresponde (tambien cuando solo se encolo correo).';


--
-- Name: notify_staff_competency_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_staff_competency_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row   record;
  v_skill text;
  v_base  jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  SELECT COALESCE(sk.name, '') INTO v_skill
    FROM public.skills sk WHERE sk.skill_id = v_row.skill_id;

  v_base := jsonb_build_object(
    'staff_id',          v_row.staff_id,
    'skill_id',          v_row.skill_id,
    'skill_name',        v_skill,
    'proficiency_level', COALESCE(v_row.proficiency_level, ''));

  -- Dos tipos y no uno con `context` (D-03): ganar una competencia y perderla son hechos
  -- distintos. Sólo al afectado, que es el único alcance que la matriz le da a esta fila.
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_staff('staff.competency.assigned', NEW.staff_id,
                                NEW.staff_id::text, v_base);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.notify_staff('staff.competency.removed', OLD.staff_id,
                                OLD.staff_id::text, v_base);
  END IF;

  -- El UPDATE (subir o bajar el nivel de una competencia que ya tenías) no avisa: la matriz
  -- tiene la asignación y la baja, no la reevaluación.
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_staff_competency_events fallo para % : %', v_row.staff_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_staff_competency_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_staff_competency_events() IS 'FASE 3.e: alta y baja de una competencia (staff_skills), al afectado. Dos type_key distintos (D-03); cambiar el nivel de una competencia existente no avisa. Degrada a WARNING.';


--
-- Name: notify_staff_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_staff_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_baja  boolean;
  v_base  jsonb;
  v_rec   record;
  c_firma    constant text[] := ARRAY['admin', 'hr_manager', 'hr_analyst'];
  c_gerentes constant text[] := ARRAY['manager', 'ita_manager', 'tax_manager'];
  c_seguridad constant text[] := ARRAY['admin', 'it_security_manager'];
BEGIN
  v_base := jsonb_build_object(
    'staff_id',    NEW.staff_id,
    'staff_name',  COALESCE(NEW.first_name || ' ' || NEW.last_name, ''),
    'email',       COALESCE(NEW.email, ''),
    'practica_id', NEW.practica_id);

  -- ── Alta de personal ──
  -- Va al ADM y a Talento Humano (alcance `firm`) y a los gerentes de SU práctica (alcance
  -- `practica`). Al recién dado de alta no: la matriz no le da la fila, y todavía no tiene
  -- cuenta con la que mirar la campana.
  IF TG_OP = 'INSERT' THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(c_firma)
      UNION
      SELECT staff_id FROM public.notif_staff_by_practice(NEW.practica_id, c_gerentes)
    LOOP
      PERFORM public.notify_staff('staff.created', v_rec.staff_id,
                                  NEW.staff_id::text, v_base);
    END LOOP;
    RETURN NULL;
  END IF;

  -- ── Baja de personal: tres señales, un solo evento (D-35) ──
  --
  -- La primera señal es cargar `termination_date`, y esa fecha puede ser FUTURA: StaffForm sólo
  -- exige la fecha cuando `is_active` pasa a false, no al revés, así que se puede registrar la
  -- salida de alguien que sigue trabajando. El aviso sale igual —es lo que D-35 decidió, y a
  -- Talento Humano le sirve saberlo cuando se registra, no el último día— pero por eso el texto
  -- dice "Se registró la baja de X" y no "X dejó la firma": la fecha efectiva viaja en el payload.
  --
  -- Hacer que la fecha avise recién el día que llega pediría un emisor por calendario, como los
  -- de plazo de emergencia. Hoy no existe, y sin él sacar esta señal dejaría la baja sin avisar
  -- hasta que alguien apague `is_active` a mano.
  -- La UI usa una u otra según la pantalla (fecha de baja, desactivar, borrado lógico) y el
  -- hecho de negocio es uno. Hacer las tres en el mismo UPDATE deja UNA notificación.
  v_baja := (OLD.termination_date IS NULL AND NEW.termination_date IS NOT NULL)
         OR (COALESCE(OLD.is_active, true) AND NOT COALESCE(NEW.is_active, true))
         OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL);

  IF v_baja THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_staff_by_roles(c_firma)
      UNION
      SELECT staff_id FROM public.notif_staff_by_practice(NEW.practica_id, c_gerentes)
    LOOP
      PERFORM public.notify_staff('staff.terminated', v_rec.staff_id,
                NEW.staff_id::text,
                v_base || jsonb_build_object('termination_date', NEW.termination_date));
    END LOOP;
  END IF;

  -- ── Bloqueo de cuenta por seguridad (D-36) ──
  -- Lo enciende record_failed_login() al agotarse los intentos. Al bloqueado NO se le avisa:
  -- no puede entrar a ver la campana, y la pantalla de login ya se lo dice. El desbloqueo
  -- tampoco emite — la matriz no le dio tipo.
  IF NOT COALESCE(OLD.is_blocked, false) AND COALESCE(NEW.is_blocked, false) THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_seguridad)
    LOOP
      PERFORM public.notify_staff('auth.account.blocked', v_rec.staff_id,
                                  NEW.staff_id::text, v_base);
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_staff_events fallo para % : %', NEW.staff_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_staff_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_staff_events() IS 'FASE 3.e: alta de personal, baja (termination_date / is_active / deleted_at, D-35) y bloqueo de cuenta (D-36). Alta y baja combinan alcance firm (ADM + Talento Humano) con practica (los gerentes de esa linea de servicio). Degrada a WARNING.';


--
-- Name: notify_timer_auto_stop_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_timer_auto_stop_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_code     text;
  v_activity text;
BEGIN
  -- El cronómetro se cerró recién.
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
    RETURN NULL;
  END IF;

  -- LA MARCA DEL CIERRE AUTOMÁTICO (D-32): `finalize_all_stale_timers()` —el cron cada 15
  -- min— y `finalize_my_stale_timers()` escriben `ended_at = started_at + 8h` EXACTAS. Un
  -- cierre manual no puede producir esa igualdad: `stop_timer_entry()` pasa `now()`, y
  -- `validate_timer_entry_duration` rechaza con excepción cualquier `ended_at` posterior a
  -- las 8 h, así que ese borde superior sólo lo alcanza el cierre automático. Se mira la
  -- marca y no quién escribió, porque el cron corre sin sesión.
  IF NEW.ended_at IS DISTINCT FROM NEW.started_at + interval '8 hours' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(e.engagement_code, '') INTO v_code
    FROM public.engagements e WHERE e.engagement_id = NEW.engagement_id;
  SELECT COALESCE(a.activity_code, '') INTO v_activity
    FROM public.activity_codes a WHERE a.activity_id = NEW.activity_id;

  PERFORM public.notify_staff('tracker.timer.auto_stopped', NEW.staff_id,
            NEW.timer_id::text,
            jsonb_build_object(
              'engagement_code',  v_code,
              'engagement_id',    NEW.engagement_id,
              'activity_code',    v_activity,
              'started_at',       NEW.started_at,
              'ended_at',         NEW.ended_at,
              'duration_minutes', NEW.duration_minutes,
              'description',      COALESCE(NEW.description, '')));

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_timer_auto_stop_events fallo para % : %', NEW.timer_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_timer_auto_stop_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_timer_auto_stop_events() IS 'FASE 3.d: cronometro cerrado automaticamente por inactividad, a su dueno. Se detecta por la marca del cierre automatico (ended_at = started_at + 8h exactas, D-32) y no por el actor: el cron corre sin sesion. Degrada a WARNING.';


--
-- Name: notify_timesheet_line_approval_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_timesheet_line_approval_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_owner    uuid;
  v_week     date;
  v_code     text;
  v_activity text;
  v_reviewer text;
  v_base     jsonb;
  v_prev     text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END;
BEGIN
  -- El destinatario es siempre el dueño de la boleta (alcance `own`): el veredicto es sobre
  -- SU línea. Quien aprueba ya lo sabe, y su gerencia no está en esta fila de la matriz.
  SELECT tp.staff_id, tp.week_start_date
    INTO v_owner, v_week
    FROM public.timesheet_periods tp
   WHERE tp.period_id = NEW.period_id;

  IF v_owner IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(e.engagement_code, '') INTO v_code
    FROM public.engagements e WHERE e.engagement_id = NEW.engagement_id;
  SELECT COALESCE(a.activity_code, '') INTO v_activity
    FROM public.activity_codes a WHERE a.activity_id = NEW.activity_id;
  SELECT COALESCE(s.first_name || ' ' || s.last_name, '') INTO v_reviewer
    FROM public.staff s WHERE s.staff_id = NEW.approved_by;

  v_base := jsonb_build_object(
    'engagement_code', v_code,
    'engagement_id',   NEW.engagement_id,
    'activity_code',   v_activity,
    'week_start',      v_week,
    'reviewer',        v_reviewer,
    'notes',           COALESCE(NEW.review_notes, ''));

  -- ── Aprobación de una línea ──
  -- `approved_by <> dueño` es el filtro de la autoaprobación (D-30): submit_timesheet_safe
  -- firma con el staff_id del propio dueño, y devolverle N filas "tu línea fue aprobada" en
  -- cada envío habría vaciado de significado al evento.
  IF NEW.status = 'approved'
     AND v_prev IS DISTINCT FROM 'approved'
     AND NEW.approved_by IS DISTINCT FROM v_owner THEN
    PERFORM public.notify_staff('approval.line_approved', v_owner,
                                NEW.approval_id::text, v_base);
  END IF;

  -- ── Rechazo ──
  -- Sin filtro por `approved_by`: ningún camino automático escribe 'rejected', así que
  -- siempre es la decisión de una persona.
  IF NEW.status = 'rejected'
     AND v_prev IS DISTINCT FROM 'rejected' THEN
    PERFORM public.notify_staff('approval.line_rejected', v_owner,
                                NEW.approval_id::text, v_base);
  END IF;

  -- ── Solicitud de revisión (D-33) ──
  -- `approved -> pending` lo escribe solamente useRequestRevision. El otro camino a
  -- `pending` —el reset de `rejected` que hace submit_timesheet_safe cuando el usuario
  -- corrige y reenvía— no es una solicitud de revisión: avisaría al usuario de su propio
  -- reenvío.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'approved'
     AND NEW.status = 'pending' THEN
    PERFORM public.notify_staff('approval.revision_requested', v_owner,
                                NEW.approval_id::text, v_base);
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_timesheet_line_approval_events fallo para % : %', NEW.approval_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_timesheet_line_approval_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_timesheet_line_approval_events() IS 'FASE 3.d: los 3 veredictos sobre una linea de timesheet (aprobada, rechazada, revision solicitada), al dueno de la boleta. Calla la autoaprobacion (approved_by = el dueno, D-30) y el reset rejected->pending del reenvio (D-33). Degrada a WARNING.';


--
-- Name: notify_timesheet_period_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_timesheet_period_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_submitted boolean;
  v_withdrawn boolean;
  v_who       text;
  v_base      jsonb;
  v_approvers uuid[];
  v_rec       record;
  v_id        uuid;
BEGIN
  -- Sólo AFTER UPDATE: el período existe desde que el usuario carga la primera hora
  -- (`submit_timesheet_safe` falla con PERIOD_NOT_FOUND si no está), así que el envío es
  -- siempre un UPDATE. Un INSERT con `submitted_at` ya puesto es carga de datos, no un envío.
  v_submitted := OLD.submitted_at IS NULL     AND NEW.submitted_at IS NOT NULL;
  v_withdrawn := OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS NULL;

  IF NOT (v_submitted OR v_withdrawn) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(s.first_name || ' ' || s.last_name, '')
    INTO v_who
    FROM public.staff s WHERE s.staff_id = NEW.staff_id;

  v_base := jsonb_build_object(
    'period_id',   NEW.period_id,
    'week_start',  NEW.week_start_date,
    'week_number', NEW.week_number,
    'year',        NEW.year,
    'total_hours', NEW.total_hours,
    'staff_name',  v_who);

  -- ── Acuse al dueño: el mismo tipo para el envío y para el retiro ──
  -- Dos redacciones vía el `context` de i18next, mismo criterio que
  -- `engagement.staffing.changed`: es el mismo hecho ("mi boleta cambió de estado") y
  -- partirlo en dos tipos habría duplicado la fila de la matriz para siete roles.
  PERFORM public.notify_staff('timesheet.own_submit_confirmed', NEW.staff_id,
            NEW.period_id::text,
            v_base || jsonb_build_object('context',
              CASE WHEN v_submitted THEN 'submitted' ELSE 'withdrawn' END));

  IF v_withdrawn THEN
    RETURN NULL;
  END IF;

  -- ── A quien le toca aprobar ──
  -- `get_timesheet_approvers()` es la autoridad, y no las columnas del encargo: descarta a
  -- las categorías autoaprobadas y exige `timesheet_approval.approve` en el rol, así que un
  -- Socio puesto como `partner_id` sin ese permiso no entra (hoy es el caso: el permiso lo
  -- tienen admin y los tres gerentes). La lista se guarda para no volver a avisarles abajo.
  SELECT COALESCE(array_agg(g.approver_staff_id), '{}'::uuid[])
    INTO v_approvers
    FROM public.get_timesheet_approvers(NEW.staff_id, NEW.week_start_date) g;

  FOREACH v_id IN ARRAY v_approvers
  LOOP
    PERFORM public.notify_staff('timesheet.team_submitted_for_approval', v_id,
                                NEW.period_id::text, v_base);
  END LOOP;

  -- ── Informativo a la conducción que NO aprueba ──
  FOR v_rec IN SELECT staff_id FROM public.notif_timesheet_period_leads(NEW.period_id)
  LOOP
    -- Nadie recibe dos filas por el mismo envío (D-12): el dueño ya tiene su acuse, y el
    -- aprobador su aviso accionable, que es el más específico de los dos.
    IF v_rec.staff_id = NEW.staff_id OR v_rec.staff_id = ANY (v_approvers) THEN
      CONTINUE;
    END IF;

    -- Y el alcance de la matriz manda: este tipo sólo se entrega como `assigned`. Sin el
    -- chequeo, un Senior que ocupe `manager_id` recibiría la boleta de un colega.
    IF public.notif_scope_of('timesheet.weekly_submitted', v_rec.staff_id)
       IS DISTINCT FROM 'assigned' THEN
      CONTINUE;
    END IF;

    PERFORM public.notify_staff('timesheet.weekly_submitted', v_rec.staff_id,
                                NEW.period_id::text, v_base);
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_timesheet_period_events fallo para % : %', NEW.period_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_timesheet_period_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_timesheet_period_events() IS 'FASE 3.d: envio y retiro de la boleta semanal. Reparte el mismo hecho en tres audiencias disjuntas (dueno / aprobador / conduccion) y respeta el scope_key de la matriz via notif_scope_of, porque weekly_submitted solo se entrega como `assigned`. Degrada a WARNING: nunca bloquea el envio.';


--
-- Name: notify_user_account_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_user_account_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row      record;
  v_staff    uuid;
  v_name     text;
  v_email    text;
  v_base     jsonb;
  v_rec      record;
  v_rol_prev  text;
  v_rol_nuevo text;
  c_auditoria constant text[] := ARRAY['admin', 'it_security_manager'];
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  SELECT s.staff_id, COALESCE(s.first_name || ' ' || s.last_name, '')
    INTO v_staff, v_name
    FROM public.staff s
   WHERE s.auth_user_id = v_row.user_id
     AND s.deleted_at IS NULL;

  -- El correo es el único identificador que existe siempre: en el alta la ficha todavía no
  -- está vinculada, y en el borrado ya no la hay. Se lee con guarda porque el harness local
  -- monta un `auth` mínimo y otros entornos podrían no exponerlo.
  BEGIN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_row.user_id;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  -- La marca gana sobre la lectura. En un DELETE por CASCADE `auth.users` ya se borro y el SELECT
  -- de arriba no devuelve nada; `deletion_email` es lo que prepare_account_deletion() dejo ahi
  -- justo para este momento (ver A.3). Fuera de un borrado en curso la marca es NULL y manda la
  -- lectura, asi que el COALESCE no necesita saber en que operacion esta.
  v_email := COALESCE(v_row.deletion_email, v_email);

  v_base := jsonb_build_object(
    'user_id',    v_row.user_id,
    'staff_id',   v_staff,
    'staff_name', COALESCE(v_name, ''),
    'email',      COALESCE(v_email, ''),
    'role_key',   COALESCE(v_row.role_key, ''));

  -- ── Alta de cuenta: auditoría del ADM ──
  IF TG_OP = 'INSERT' THEN
    -- Salvo que sea una baja que se está deshaciendo. `manage-auth-user` repone la fila cuando
    -- GoTrue no pudo borrar la cuenta, y eso no es un alta: la cuenta existía desde antes. Mismo
    -- marcador y mismo motivo que la rama del DELETE de más abajo.
    IF COALESCE(current_setting('ems.account_rollback', true), '') = '1' THEN
      RETURN NULL;
    END IF;

    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
    LOOP
      PERFORM public.notify_staff('auth.user.registered', v_rec.staff_id,
                                  COALESCE(v_staff::text, NEW.user_id::text), v_base);
    END LOOP;
    RETURN NULL;
  END IF;

  -- ── Eliminación de cuenta: sólo Seguridad TI (la matriz no se lo da al ADM) ──
  IF TG_OP = 'DELETE' THEN
    -- Salvo que sea un alta que se está deshaciendo. `register-user` borra la cuenta que acaba
    -- de crear cuando el correo de confirmación no sale, y ese borrado llega hasta acá por el
    -- CASCADE de user_roles.user_id -> auth.users. Avisarle a Seguridad TI de una "cuenta
    -- eliminada" por un 503 de Microsoft Graph es una alarma falsa, y las alarmas falsas en un
    -- canal de seguridad se pagan con que dejen de mirarse.
    --
    -- El marcador lo pone rollback_unconfirmed_signup() con `set_config(..., true)`: es
    -- transaction-local, así que no puede quedarse pegado ni filtrarse a otra sesión del pool.
    -- Mismo mecanismo que `ems.role_change_source` (ver notif_origen_cambio_rol).
    IF COALESCE(current_setting('ems.account_rollback', true), '') = '1' THEN
      RETURN NULL;
    END IF;

    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['it_security_manager'])
    LOOP
      PERFORM public.notify_staff('auth.account.deleted', v_rec.staff_id,
                                  OLD.user_id::text, v_base);
    END LOOP;
    RETURN NULL;
  END IF;

  -- ── Cambio de rol ──
  -- `role_key` es la autoridad y `role` el espejo legacy, pero se miran los dos, y el enum NO es
  -- cosmético: `is_admin()` y `has_role()` (cero_02) leen `user_roles.role`, así que mover sólo
  -- el enum da o quita admin en todas las policies que las llaman. Es justamente el cambio que
  -- más merece auditoría, no uno para ignorar.
  --
  -- Por eso los dos roles del payload salen de la columna QUE CAMBIÓ y no siempre de `role_key`:
  -- `admin_set_user_role()` hace `UPDATE user_roles SET role = ...` y deja `role_key` intacto.
  -- Está deprecado y ningún componente lo llama, pero sigue con GRANT a `authenticated`
  -- (cero_06), o sea que se alcanza directo por PostgREST. Leyendo `role_key` de los dos lados,
  -- ese camino mandaba un aviso de auditoría que decía "de X a X" — sin delta, que es peor que
  -- no mandarlo: el lector concluye que no pasó nada justo cuando alguien ganó admin.
  --
  -- Si cambian las dos, manda `role_key`: es la autoridad, y el enum es su espejo.
  IF NEW.role_key IS DISTINCT FROM OLD.role_key THEN
    v_rol_prev  := COALESCE(OLD.role_key, '');
    v_rol_nuevo := COALESCE(NEW.role_key, '');
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    v_rol_prev  := COALESCE(OLD.role::text, '');
    v_rol_nuevo := COALESCE(NEW.role::text, '');
  END IF;

  IF v_rol_nuevo IS NOT NULL THEN
    -- Al afectado (alcance `own`), con el rol anterior para que el texto pueda decir de qué
    -- a qué. Sin ficha de staff no hay a quién notificar: notify_staff necesita un staff_id.
    IF v_staff IS NOT NULL THEN
      PERFORM public.notify_staff('auth.role.changed', v_staff,
                COALESCE(v_staff::text, NEW.user_id::text),
                v_base || jsonb_build_object('role_key',          v_rol_nuevo,
                                             'previous_role_key', v_rol_prev,
                                             -- De donde vino el cambio: `category` si lo escribio
                                             -- sync_user_role_from_category, `direct` si no. El
                                             -- correo elige el texto con esto (D-44); el trigger
                                             -- ve el resultado y no la causa, asi que la causa la
                                             -- anota quien la conoce.
                                             'source', public.notif_origen_cambio_rol(),
                                             'context', 'own'));
    END IF;

    -- Y a la auditoría (ADM + Seguridad TI, alcance `firm`, D-17). Al propio afectado no se
    -- le manda dos veces si además es uno de ellos.
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_auditoria)
    LOOP
      IF v_rec.staff_id IS DISTINCT FROM v_staff THEN
        PERFORM public.notify_staff('auth.role.changed', v_rec.staff_id,
                  COALESCE(v_staff::text, NEW.user_id::text),
                  v_base || jsonb_build_object('role_key',          v_rol_nuevo,
                                               'previous_role_key', v_rol_prev));
      END IF;
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_user_account_events fallo para % : %', v_row.user_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_user_account_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_user_account_events() IS 'FASE 3.e: alta de cuenta, cambio de rol y eliminacion, leidos desde public.user_roles y no desde auth.users (D-34). El cambio de rol va al afectado con context=own y a la auditoria (ADM + Seguridad TI) sin duplicar, con role_key/previous_role_key tomados de la columna que cambio (role_key manda; si solo se movio el enum legacy `role`, van sus valores, porque is_admin()/has_role() lo leen). El borrado NO avisa si ems.account_rollback = 1 (alta deshecha, no baja real). Degrada a WARNING.';


--
-- Name: notify_wo_installment_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_wo_installment_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_code text;
  v_curr text;
  v_rec  record;
  c_contabilidad constant text[] := ARRAY['accounting_manager', 'accounting_analyst'];
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(e.engagement_code, ''), w.currency
    INTO v_code, v_curr
    FROM public.work_orders w
    JOIN public.engagements e ON e.engagement_id = w.engagement_id
   WHERE w.wo_id = NEW.wo_id;

  -- entity_id = wo_id, no installment_id: la cuota no tiene pantalla propia, se edita dentro
  -- de la pestaña "Plan de pagos" de su OT.
  FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_contabilidad)
  LOOP
    PERFORM public.notify_staff('wo.installment.status_changed', v_rec.staff_id,
              NEW.wo_id::text,
              jsonb_build_object(
                'engagement_code',     v_code,
                'currency',            v_curr,
                'installment_id',      NEW.installment_id,
                'installment_number',  NEW.installment_number,
                'amount',              NEW.amount,
                'agreed_payment_date', NEW.agreed_payment_date,
                'status',              NEW.status));
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_wo_installment_events fallo para % : %', NEW.installment_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_wo_installment_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_wo_installment_events() IS 'FASE 3.b: cambio de estado de una cuota del plan de pagos, a la bandeja de Contabilidad. Degrada a WARNING: nunca bloquea la operacion.';


--
-- Name: notify_work_order_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_work_order_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_code       text;
  v_funcion    smallint;
  v_is_client  boolean;
  v_base       jsonb;
  v_rec        record;
  v_submitted  boolean;
  v_rev_socio  boolean;
  v_rev_risk   boolean;
  v_resubmit   boolean;
  v_to_risk    boolean;
  v_emergency  boolean;
  v_has_plan   boolean;
  c_riesgos   constant text[] := ARRAY['risk_partner', 'risk_supervisor'];
  c_cobranzas constant text[] := ARRAY['collections_analyst'];
BEGIN
  SELECT COALESCE(e.engagement_code, ''), e.funcion INTO v_code, v_funcion
    FROM public.engagements e
   WHERE e.engagement_id = NEW.engagement_id;

  -- engagement_code lo pinta el panel como chip (notificationMeta); engagement_id no se usa
  -- hoy en la ruta —el destino es /work-orders/<wo_id>— pero deja el encargo a mano para
  -- cuando la Fase 3.c linkee al detalle del encargo.
  v_base := jsonb_build_object(
    'engagement_code', v_code,
    'engagement_id',   NEW.engagement_id,
    'currency',        NEW.currency);

  -- 0722-160: Cliente es la unica funcion con pista de Riesgos. COALESCE trata funcion NULL
  -- como Cliente, que es el default historico de la columna.
  v_is_client := COALESCE(v_funcion, 1) = 1;

  -- ── Discriminadores ──
  v_submitted := NEW.approval_status = 'Pending_Approval'
             AND OLD.approval_status IN ('Draft', 'Rejected');

  -- La reversión se detecta por la marca de la pista APAGÁNDOSE, no por approval_status:
  -- useRevertSocioApproval/useRevertRiskApproval limpian la firma en la primera sentencia y
  -- reabren la OT en la segunda, y sólo la primera distingue una reversión de un rechazo.
  v_rev_socio := OLD.approved_at      IS NOT NULL AND NEW.approved_at      IS NULL;
  v_rev_risk  := v_is_client AND OLD.risk_approved_at IS NOT NULL AND NEW.risk_approved_at IS NULL;

  -- Reenvío de datos de riesgo tras un veredicto (rechazo, o compleción de los datos que
  -- quedaron pendientes de una aprobación de emergencia).
  v_resubmit := v_is_client
            AND NEW.risk_status = 'Pending'
            AND OLD.risk_status IN ('Rejected', 'Emergency_Approved');

  -- Entrada a la cola de Riesgos. Dos caminos, y ninguno es una transición de risk_status:
  --   * el envío inicial —risk_status ya venía en 'Pending' por DEFAULT, así que no cambia—;
  --   * la reversión de la aprobación de Riesgos (D-23), que devuelve trabajo a esa cola.
  --
  -- `NOT v_resubmit` es obligatorio y no una precaución: useSubmitWorkOrder con
  -- `resetRiskToPending` (reenvío tras un rechazo de Riesgos) cumple las dos condiciones a la
  -- vez, y sin esto el Supervisor recibiría el aviso de entrada Y el de reenvío por el mismo
  -- hecho. Gana el más específico.
  -- El COALESCE no es cosmético: es el único NOT de los discriminadores, y un NULL bajo un
  -- NOT vuelve NULL toda la condición y se traga un aviso legítimo. Los demás se evalúan en
  -- positivo, donde NULL ya se comporta como false (que es lo que queremos: fail-closed).
  --
  -- 0722-160: en una OT administrativa `risk_status = 'Pending'` significa "no aplica", no
  -- "en cola". enforce_administrative_work_order_rules() es BEFORE y lo fuerza a 'Pending'
  -- antes de que este trigger (AFTER) lo lea, asi que sin `v_is_client` TODO envio
  -- administrativo avisaba por panel y correo a risk_partner/risk_supervisor sobre una pista
  -- que la feature elimino y que la UI ni siquiera muestra.
  --
  -- Review fix (Codex, 2da vuelta): el gate NO alcanza con ponerlo aca. `v_resubmit` y
  -- `v_rev_risk` alimentan wo.risk.resubmitted y wo.approval_reverted, y las reparaciones de
  -- datos de mas abajo (bajan risk_status a 'Pending' y limpian risk_approved_at en OTs
  -- administrativas historicas) cumplen las dos condiciones. Por eso los tres discriminadores
  -- de la pista de Riesgos llevan `v_is_client`, no solo este.
  v_to_risk := v_is_client
           AND NEW.risk_status = 'Pending'
           AND (v_submitted OR v_rev_risk)
           AND NOT COALESCE(v_resubmit, false);

  -- Emergencia = el gerente envió SIN datos de riesgo, justificando. Es la misma condición
  -- que habilita el flujo de dos firmas en el frontend.
  v_emergency := NEW.risk_level IS NULL
             AND NULLIF(btrim(COALESCE(NEW.emergency_justification, '')), '') IS NOT NULL;

  -- ── Envío a aprobación del Socio ──
  IF v_submitted THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_partners(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.submitted_partner', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('status', NEW.approval_status));
    END LOOP;

    -- Plan de pagos (D-24): no tiene aprobación propia, viaja con la de la OT. Sólo se avisa
    -- si hay cuotas cargadas — sin cuotas no hay nada que revisar y Cobranzas recibiría ruido.
    SELECT EXISTS (SELECT 1 FROM public.wo_payment_installments i WHERE i.wo_id = NEW.wo_id)
      INTO v_has_plan;

    IF v_has_plan THEN
      FOR v_rec IN
        SELECT staff_id FROM public.notif_engagement_partners(NEW.engagement_id)
        UNION
        SELECT staff_id FROM public.notif_staff_by_roles(c_cobranzas)
      LOOP
        PERFORM public.notify_staff('wo.payment_plan.pending_approval', v_rec.staff_id,
                  NEW.wo_id::text, v_base);
      END LOOP;
    END IF;
  END IF;

  -- ── Entrada a la cola de Riesgos (absorbe assessment_assigned/emergency, D-10) ──
  IF v_to_risk THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_riesgos)
    LOOP
      -- `context` no es un dato mas: es la clave reservada de i18next. El panel hace
      -- t(label_key, {...payload}), asi que un payload con context='emergency' resuelve
      -- `notifications.types.wo.submitted_risk_emergency` y, si esa clave no existe, cae
      -- sola a la base. Asi una variante de texto no necesita un tipo nuevo en la matriz.
      PERFORM public.notify_staff('wo.submitted_risk', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('risk_level', NEW.risk_level)
                       || CASE WHEN v_emergency
                               THEN jsonb_build_object('context', 'emergency')
                               ELSE '{}'::jsonb END);
    END LOOP;
  END IF;

  -- ── Reenvío de los datos de evaluación ──
  IF v_resubmit THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_riesgos)
    LOOP
      PERFORM public.notify_staff('wo.risk.resubmitted', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('risk_level', NEW.risk_level));
    END LOOP;
  END IF;

  -- ── Firma del Socio ──
  -- Se compara el timestamp y no `IS NULL -> IS NOT NULL`: un rechazo NO limpia approved_at,
  -- así que tras rechazar y reenviar la segunda firma dejaría la marca ya no-nula y un
  -- chequeo de nulidad se la perdería.
  IF NEW.approved_at IS NOT NULL AND OLD.approved_at IS DISTINCT FROM NEW.approved_at THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.approved_partner', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('status', 'Approved'));
    END LOOP;
  END IF;

  -- ── Rechazo del Socio ──
  IF NEW.approval_status = 'Rejected'
     AND OLD.approval_status IS DISTINCT FROM 'Rejected' THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.rejected_partner', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('status', 'Rejected',
                                             'reason', COALESCE(NEW.notes, '')));
    END LOOP;
  END IF;

  -- ── Veredicto de Riesgos ──
  -- Cubre las DOS formas de aprobar: la normal ('Approved') y la de emergencia
  -- ('Emergency_Approved', las dos firmas). Decisión del operador 2026-09-10 (D-25): en la
  -- rama de emergencia el Gerente recibe los dos avisos —"Riesgos aprobó la OT" y
  -- "Emergencia aprobada: 7 días para completar"— porque son dos hechos distintos: uno
  -- desbloquea la OT, el otro le abre un plazo con trabajo pendiente.
  --
  -- El `status` va desde la columna y no como literal: así el badge del panel dice
  -- "Aprobada por emergencia" y no miente diciendo "Aprobada" a secas.
  IF NEW.risk_status IN ('Approved', 'Emergency_Approved')
     AND OLD.risk_status IS DISTINCT FROM NEW.risk_status THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.approved_risk', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('status', NEW.risk_status));
    END LOOP;
  END IF;

  -- El rechazo de Riesgos sube más arriba que la aprobación: la matriz se lo manda también a
  -- socios y directores, porque frena la OT entera.
  IF NEW.risk_status = 'Rejected' AND OLD.risk_status IS DISTINCT FROM 'Rejected' THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_engagement_partners(NEW.engagement_id)
      UNION
      SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.rejected_risk', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('status', 'Rejected',
                                             'reason', COALESCE(NEW.risk_notes, '')));
    END LOOP;
  END IF;

  -- ── Reversión de Admin (cualquiera de las dos pistas) ──
  IF v_rev_socio OR v_rev_risk THEN
    FOR v_rec IN
      SELECT staff_id FROM public.notif_engagement_partners(NEW.engagement_id)
      UNION
      SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      -- `context` = la pista revertida, para que el texto diga cual (ver la nota de
      -- submitted_risk). Si algun dia se revierten las dos en una sola sentencia gana
      -- 'partner'; la clave base es generica y sirve igual.
      PERFORM public.notify_staff('wo.approval_reverted', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object(
                  'context', CASE WHEN v_rev_socio THEN 'partner' ELSE 'risk' END,
                  'status',  NEW.approval_status));
    END LOOP;
  END IF;

  -- ── Emergencia: paso 1 (firma de Riesgos) ──
  IF NEW.emergency_review_at IS NOT NULL
     AND OLD.emergency_review_at IS DISTINCT FROM NEW.emergency_review_at THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_staff_by_roles(c_riesgos)
    LOOP
      PERFORM public.notify_staff('wo.emergency.step1_done', v_rec.staff_id, NEW.wo_id::text,
                v_base);
    END LOOP;
  END IF;

  -- ── Emergencia: paso 2 firmado -> arranca el plazo de 7 días ──
  -- La señal es `emergency_deadline_at` encendiéndose, que es lo que escribe la segunda firma
  -- (useApproveEmergencyPartner). El aviso dice "tenés 7 días para completar los datos", así
  -- que su dueño es el reloj, no la firma.
  IF NEW.emergency_deadline_at IS NOT NULL
     AND OLD.emergency_deadline_at IS DISTINCT FROM NEW.emergency_deadline_at THEN
    FOR v_rec IN SELECT staff_id FROM public.notif_engagement_managers(NEW.engagement_id)
    LOOP
      PERFORM public.notify_staff('wo.emergency.created', v_rec.staff_id, NEW.wo_id::text,
                v_base || jsonb_build_object('deadline', NEW.emergency_deadline_at,
                                             'status',   NEW.risk_status));
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_work_order_events fallo para % : %', NEW.wo_id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_work_order_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_work_order_events() IS 'FASE 3.b: 11 eventos de work_orders. Las aprobaciones se detectan por la marca de cada pista (approved_at / risk_status) y no por approval_status, porque la aprobacion se escribe en dos sentencias y el trigger corre dos veces. Degrada a WARNING: nunca bloquea la operacion. 0722-160: las OTs de encargos administrativos (funcion <> 1) no tienen pista de Riesgos, asi que no disparan wo.submitted_risk, wo.risk.resubmitted ni la reversion de Riesgos.';


--
-- Name: notify_worksheet_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_worksheet_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_code text;
  v_name text;
  v_base jsonb;
  v_rec  record;
BEGIN
  -- La transición, y sólo esa. `archived` no es una revisión y volver a `draft` tampoco.
  IF NOT (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved') THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(e.engagement_code, ''), COALESCE(e.engagement_name, '')
    INTO v_code, v_name
    FROM public.engagements e
   WHERE e.engagement_id = NEW.engagement_id;

  -- `engagement_id` en el payload y `worksheet_id` en entity_id: el destino es la hoja
  -- (/worksheets/<id>), y el COT viaja como chip.
  v_base := jsonb_build_object(
    'worksheet_id',    NEW.id,
    'engagement_id',   NEW.engagement_id,
    'engagement_code', v_code,
    'engagement_name', v_name,
    'version',         NEW.version);

  -- Los 6 cargos del encargo. Los que la matriz no contempla —los dos especialistas y el
  -- Encargado— los descarta notify_staff(); mandar de más es explícitamente aceptable, y
  -- así este disparador no repite la lista de roles que ya vive en la matriz.
  FOR v_rec IN SELECT staff_id FROM public.notif_engagement_owners(NEW.engagement_id)
  LOOP
    PERFORM public.notify_staff('worksheet.sent_to_quality', v_rec.staff_id,
                                NEW.id::text, v_base);
  END LOOP;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_worksheet_events fallo para % : %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;


--
-- Name: FUNCTION notify_worksheet_events(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.notify_worksheet_events() IS 'FASE 3.g: hoja de trabajo enviada a revision de calidad (activity_worksheets.status draft -> approved), a la conduccion del encargo. Hoy ninguna via del producto escribe ese status: el disparador queda montado para cuando exista el paso (D-38). Degrada a WARNING.';


--
-- Name: partner_overview(date, date, integer, uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.partner_overview(p_start date, p_end date, p_fiscal_year integer DEFAULT NULL::integer, p_client_id uuid DEFAULT NULL::uuid, p_manager_id uuid DEFAULT NULL::uuid, p_industry_id uuid DEFAULT NULL::uuid, p_society_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_permission('dashboard.partner.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.partner.read';
  END IF;

  v_result := (
  WITH
  -- ── 1. Llamante ──────────────────────────────────────────────────────────────────────
  caller AS (
    SELECT public.get_my_staff_id() AS staff_id,
           public.current_role_key() AS role_key
  ),
  caller_staff AS (
    SELECT s.staff_id AS resolved_staff_id, s.society_id, soc.name AS society_name
    FROM caller c
    LEFT JOIN public.staff s ON s.staff_id = c.staff_id
    LEFT JOIN public.society soc ON soc.society_id = s.society_id
  ),
  now_ctx AS (
    SELECT ((now() AT TIME ZONE 'America/La_Paz')::date) AS today
  ),
  default_rate AS (
    SELECT public.latest_exchange_rate() AS rate
  ),

  -- ── 2. Estado efectivo por encargo ───────────────────────────────────────────────────
  eng_state AS (
    SELECT
      e.engagement_id, e.client_id, e.engagement_name, e.partner_id, e.manager_id, e.sqr_id,
      e.society_id, e.start_date, e.end_date, e.anio_fiscal, e.fecha_cierre, e.funcion,
      e.work_order_required, e.engagement_state_override,
      cl.industry_id,
      wo.wo_id, wo.currency, wo.season_mode, wo.tax_rate, wo.adjustment_amount,
      wo.approval_status, wo.risk_status, wo.approved_at,
      public.effective_engagement_state(
        e.engagement_state_override, e.work_order_required, wo.wo_id,
        wo.approval_status, wo.risk_status, wo.approved_at
      ) AS state
    FROM public.engagements e
    JOIN public.clients cl ON cl.client_id = e.client_id
    LEFT JOIN public.work_orders wo ON wo.engagement_id = e.engagement_id
  ),

  -- ── 3. Alcance por rol (decisiones.md §2), SIN filtrar por estado todavia ───────────
  -- Correccion del operador (2026-09-16): director/sqr/risk_partner solo entran a la
  -- cartera principal (este CTE, y todo lo que se arma sobre scope_all/scope: KPI1, Bloques
  -- A-H, KPI5) por ser SOCIO del encargo (partner_id = yo). Ser SQR de un encargo (sqr_id =
  -- yo) YA NO alcanza aqui -- ese encargo no cuenta como "de tu cartera", sos parte del
  -- equipo. Las horas de SQR siguen visibles, pero SOLO via kpis.my_sqr_hours (CTEs
  -- my_sqr_engagements/my_sqr_budget/my_sqr_hours mas abajo, seccion 12), que ya eran
  -- siempre personales y NUNCA dependieron de este CTE -- no requieren cambio.
  role_scope AS (
    SELECT es.*
    FROM eng_state es
    CROSS JOIN caller c
    LEFT JOIN caller_staff cs ON true
    WHERE
      c.role_key IN ('senior_partner', 'admin')
      OR (c.role_key = 'partner' AND es.society_id IS NOT NULL AND cs.society_id IS NOT NULL
          AND es.society_id = cs.society_id)
      OR (c.role_key IN ('director', 'sqr', 'risk_partner') AND c.staff_id IS NOT NULL
          AND es.partner_id = c.staff_id)
  ),

  -- ── 4. scope_all: + estado 4/5 + funcion Cliente + filtro de periodo ────────────────
  -- 2026-09-17: revertido el intento de usar fecha_cierre para el filtro de periodo --
  -- vuelve al solapamiento start_date/end_date original (con anio_fiscal cuando el
  -- selector es FY completo). Motivo: start_date/end_date son la vida real del encargo
  -- (overlap con el rango elegido, no exige que empiece o termine adentro); fecha_cierre
  -- sola excluiria encargos activos cuyo cierre cae fuera del rango aunque hayan tenido
  -- horas/facturacion durante el periodo. fecha_cierre sigue usandose para KPI 1
  -- "finalizados en el periodo" y para el pp de cumplimiento del Bloque F (client-side).
  -- 2026-09-17: se agrega `funcion = 1` (Cliente) a la regla base de cartera -- los
  -- encargos con funcion Administrativo(0)/Capacitacion(2)/Calidad(3) NO entran a NINGUN
  -- bloque de este tablero (decision del operador: "toda esta grafica de Practica" es
  -- solo cartera de clientes). `funcion = 1` ya excluye NULL (dato legacy sin clasificar)
  -- sin necesidad de una clausula aparte -- la columna no es NOT NULL hoy (queda para
  -- otro issue), asi que un encargo sin clasificar queda afuera, igual que decidio el
  -- operador para las otras funciones.
  scope_all AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state IN (4, 5)
      AND rs.funcion = 1
      AND (
        CASE WHEN p_fiscal_year IS NOT NULL THEN rs.anio_fiscal = p_fiscal_year
             ELSE COALESCE(rs.start_date, p_start) <= p_end AND COALESCE(rs.end_date, p_end) >= p_start
        END
      )
  ),

  -- ── 5. Opciones de filtro (desde scope_all, antes de aplicar Cliente/Gerente/Sector) ─
  filters_clients AS (
    SELECT DISTINCT cl.client_id, cl.client_legal_name
    FROM scope_all sa JOIN public.clients cl ON cl.client_id = sa.client_id
  ),
  filters_managers AS (
    SELECT DISTINCT s.staff_id, s.short_name
    FROM scope_all sa JOIN public.staff s ON s.staff_id = sa.manager_id
    WHERE sa.manager_id IS NOT NULL
  ),
  filters_industries AS (
    SELECT DISTINCT i.industry_id, i.industry_name
    FROM scope_all sa JOIN public.industries i ON i.industry_id = sa.industry_id
    WHERE sa.industry_id IS NOT NULL
  ),
  -- 2026-09-17: opciones del filtro de Sociedad. Solo lo consume la UI para
  -- admin/senior_partner, pero se arma igual para cualquier rol (barato: 2 filas fijas).
  -- FIX 2026-09-17 (consolidado en review.md iteracion 2, MF-02): filters_societies NO se
  -- deriva de scope_all. Es un selector cerrado de las sociedades reales de la firma
  -- (decisiones.md §2) -- debe listar siempre las mismas opciones, tenga o no encargos
  -- calificados en el periodo/alcance actual (antes: `SELECT DISTINCT ... FROM scope_all sa
  -- JOIN public.society soc ...` -- una sociedad sin encargos en cartera desaparecia del
  -- selector, hallazgo real de revision visual del operador). Este fix vivia en una
  -- migracion incremental separada (20260917150000) que quedo retirada: como ninguna
  -- migracion de este feature esta aplicada a un ambiente real todavia (confirmado por el
  -- operador, review.md iteracion 2, MF-01), se consolido de vuelta aca en vez de mantener
  -- dos copias completas de partner_overview() (memoria del proyecto: minimizar archivos de
  -- migracion).
  filters_societies AS (
    SELECT soc.society_id, soc.name
    FROM public.society soc
    WHERE soc.is_active
  ),
  filters_agg AS (
    SELECT
      COALESCE((SELECT jsonb_agg(jsonb_build_object('client_id', client_id, 'client_legal_name', client_legal_name)
                                 ORDER BY client_legal_name) FROM filters_clients), '[]'::jsonb) AS clients,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('staff_id', staff_id, 'short_name', short_name)
                                 ORDER BY short_name) FROM filters_managers), '[]'::jsonb) AS managers,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('industry_id', industry_id, 'industry_name', industry_name)
                                 ORDER BY industry_name) FROM filters_industries), '[]'::jsonb) AS industries,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('society_id', society_id, 'name', name)
                                 ORDER BY name) FROM filters_societies), '[]'::jsonb) AS societies
  ),

  -- ── 6. scope: + filtros Cliente/Gerente/Sector/Sociedad del encabezado ──────────────
  scope AS (
    SELECT sa.*
    FROM scope_all sa
    WHERE (p_client_id IS NULL OR sa.client_id = p_client_id)
      AND (p_manager_id IS NULL OR sa.manager_id = p_manager_id)
      AND (p_industry_id IS NULL OR sa.industry_id = p_industry_id)
      AND (p_society_id IS NULL OR sa.society_id = p_society_id)
  ),

  -- ── 6b. scope_previous_year: MISMO alcance/filtros que `scope`, pero para el periodo
  -- desplazado un anio (review.md iteracion 1, MF-02). Antes, `previous_total_bob` sumaba
  -- sobre el `scope` ACTUAL filtrando approved_at al anio pasado -- un encargo que solo
  -- estuvo en cartera el anio pasado (y ya no esta en `scope` hoy) quedaba afuera de la
  -- comparacion. Mismo criterio de "periodo anterior" que ya usa hours_totals.prior_period_*
  -- mas abajo: siempre por solapamiento de fechas desplazado, sin distinguir FY completo
  -- (ninguna otra comparacion "vs anterior" del tablero lo distingue tampoco).
  scope_previous_year AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state IN (4, 5)
      AND rs.funcion = 1
      -- mismo default "sin fechas = siempre activo" que scope_all, pero contra la
      -- ventana desplazada (NO contra p_start/p_end actuales -- ese era el bug: con
      -- COALESCE(..., p_end) cualquier encargo con start_date/end_date NULL quedaba
      -- excluido siempre, porque p_end > p_end-1y nunca es <= p_end-1y).
      AND COALESCE(rs.start_date, (p_start - interval '1 year')::date) <= (p_end - interval '1 year')::date
      AND COALESCE(rs.end_date, (p_end - interval '1 year')::date) >= (p_start - interval '1 year')::date
      AND (p_client_id IS NULL OR rs.client_id = p_client_id)
      AND (p_manager_id IS NULL OR rs.manager_id = p_manager_id)
      AND (p_industry_id IS NULL OR rs.industry_id = p_industry_id)
      AND (p_society_id IS NULL OR rs.society_id = p_society_id)
  ),

  -- ── 7. wo: OT aprobada por encargo -- honorario, gastos, TC, bases neta/con IVA ─────
  -- Condicion 4.1/4.2: solo cuenta el fee/gastos/horas presupuestadas de una OT con
  -- approval_status = 'Approved' (un override manual puede forzar estado 4/5 aunque la
  -- OT real siga en Draft/Pending_Approval; esa OT no debe aportar dinero al tablero).
  wo_raw AS (
    SELECT
      s.engagement_id, s.wo_id, s.currency, s.season_mode,
      COALESCE(s.tax_rate, 0.13) AS tax_rate,
      COALESCE(s.adjustment_amount, 0) AS adjustment_amount,
      s.approval_status, s.approved_at,
      COALESCE(bl.fee, 0) AS total_standard_fee,
      COALESCE(eb.amt, 0) AS expense_budget,
      p.plan_id, p.exchange_rate AS plan_exchange_rate, p.exchange_rate_mode AS plan_exchange_rate_mode
    FROM scope s
    LEFT JOIN LATERAL (
      SELECT SUM(bl.budgeted_hours * bl.standard_rate) AS fee
      FROM public.wo_budget_lines bl
      WHERE bl.wo_id = s.wo_id AND s.approval_status = 'Approved'
    ) bl ON true
    LEFT JOIN LATERAL (
      SELECT SUM(eb.budgeted_amount) AS amt
      FROM public.wo_expense_budget eb
      WHERE eb.wo_id = s.wo_id AND s.approval_status = 'Approved'
    ) eb ON true
    LEFT JOIN public.wo_payment_plan p ON p.wo_id = s.wo_id
  ),
  wo_rate AS (
    SELECT
      w.*,
      (w.total_standard_fee + w.adjustment_amount) AS fee_net,
      CASE
        WHEN w.currency = 'BOB' THEN 1
        WHEN w.plan_exchange_rate IS NOT NULL THEN w.plan_exchange_rate
        WHEN w.currency = 'USD' THEN (SELECT rate FROM default_rate)
        ELSE NULL
      END AS rate_to_bob
    FROM wo_raw w
  ),
  wo AS (
    SELECT
      w.*,
      (w.fee_net + w.expense_budget) / NULLIF(1 - w.tax_rate, 0) AS installment_base
    FROM wo_rate w
  ),

  -- ── 8. budget_hours: horas presupuestadas por encargo y por categoria (4.2, KPI 3/4) ─
  budget_hours AS (
    SELECT s.engagement_id, cat.category_name, SUM(bl.budgeted_hours) AS hours
    FROM scope s
    JOIN public.wo_budget_lines bl ON bl.wo_id = s.wo_id AND s.approval_status = 'Approved'
    JOIN public.categories cat ON cat.category_id = bl.category_id
    GROUP BY s.engagement_id, cat.category_name
  ),
  budget_hours_total AS (
    SELECT engagement_id, SUM(hours) AS total_budget_hours
    FROM budget_hours GROUP BY engagement_id
  ),

  -- ── 9. hours: UN solo scan de time_entries (obs.9), 3 FILTER (periodo/anterior/vida) ─
  hours AS (
    SELECT
      s.engagement_id,
      CASE WHEN tla.status = 'approved' THEN 'approved'
           WHEN tla.status = 'rejected' THEN 'rejected'
           ELSE 'pending' END AS bucket,
      te.hours_logged,
      te.date_worked,
      CASE WHEN s.wo_id IS NULL THEN 0
        ELSE COALESCE(bl.standard_rate,
          CASE WHEN s.currency = 'BOB' THEN
                 CASE s.season_mode WHEN 'High' THEN cat.rate_high_bob ELSE cat.rate_low_bob END
               ELSE
                 CASE s.season_mode WHEN 'High' THEN cat.rate_high_usd ELSE cat.rate_low_usd END
          END, 0)
      END AS rate
    FROM scope s
    JOIN public.time_entries te ON te.engagement_id = s.engagement_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
    LEFT JOIN public.staff st ON st.staff_id = te.staff_id
    LEFT JOIN public.wo_budget_lines bl
      ON bl.wo_id = s.wo_id AND bl.category_id = st.category_id AND s.approval_status = 'Approved'
    LEFT JOIN public.categories cat ON cat.category_id = st.category_id
  ),
  hours_totals AS (
    SELECT
      engagement_id,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end) AS period_total,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'approved') AS period_approved,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'pending') AS period_pending,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'rejected') AS period_rejected,
      SUM(hours_logged) FILTER (
        WHERE date_worked BETWEEN (p_start - interval '1 year')::date AND (p_end - interval '1 year')::date
      ) AS prior_period_total,
      -- review.md iteracion 1, MF-03: excluye 'rejected' del total de vida usado para
      -- sobregiro (decisiones.md §4.3: rechazadas solo van al tooltip, nunca cuentan como
      -- "cargado"). Antes este total sumaba TODOS los buckets.
      SUM(hours_logged) FILTER (WHERE bucket IN ('approved', 'pending')) AS lifetime_consumed,
      SUM(hours_logged * rate) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'approved') AS period_value_approved,
      SUM(hours_logged * rate) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'pending') AS period_value_pending,
      SUM(hours_logged * rate) FILTER (
        WHERE date_worked BETWEEN (p_start - interval '1 year')::date AND (p_end - interval '1 year')::date
      ) AS prior_period_value
    FROM hours
    GROUP BY engagement_id
  ),

  -- ── 10. expenses: 4.6, revisado_asistente (gastado) + aprobado_gerente (tooltip) ────
  expenses_by_engagement AS (
    SELECT
      w.engagement_id,
      COALESCE(SUM(fre.amount * CASE fre.currency WHEN 'BOB' THEN 1 ELSE COALESCE(w.rate_to_bob, (SELECT rate FROM default_rate)) END)
        FILTER (WHERE fre.status = 'revisado_asistente' AND fre.expense_date BETWEEN p_start AND p_end), 0) AS reviewed_bob,
      COALESCE(SUM(fre.amount * CASE fre.currency WHEN 'BOB' THEN 1 ELSE COALESCE(w.rate_to_bob, (SELECT rate FROM default_rate)) END)
        FILTER (WHERE fre.status = 'aprobado_gerente' AND fre.expense_date BETWEEN p_start AND p_end), 0) AS manager_approved_bob
    FROM wo w
    LEFT JOIN public.fund_request_expenses fre ON fre.wo_id = w.wo_id
    GROUP BY w.engagement_id
  ),

  -- ── 11. installments: Bloque B (fechas reales) + Bloque C (fechas pactadas) ─────────
  installments_full AS (
    SELECT
      i.installment_id, w.wo_id, w.engagement_id, w.plan_id,
      i.status, i.agreed_invoice_date, i.agreed_payment_date,
      i.collection_invoice_date, i.collection_payment_date, i.payment_date_actual,
      COALESCE(i.amount, i.percentage * w.installment_base / 100) AS amount_native,
      w.rate_to_bob,
      COALESCE(i.invoice_exchange_rate, w.rate_to_bob) AS invoice_rate,
      COALESCE(i.payment_exchange_rate, i.invoice_exchange_rate, w.rate_to_bob) AS payment_rate
    FROM wo w
    JOIN public.wo_payment_installments i ON i.wo_id = w.wo_id
  ),
  economic_cycle AS (
    SELECT
      COALESCE(SUM(inst.amount_native * inst.rate_to_bob), 0) AS to_invoice_bob,
      COALESCE(SUM(inst.amount_native * inst.invoice_rate) FILTER (
        WHERE inst.status IN ('Invoiced', 'Completed', 'Overdue')
          AND inst.collection_invoice_date BETWEEN p_start AND p_end
      ), 0) AS invoiced_bob,
      COALESCE(SUM(inst.amount_native * inst.payment_rate) FILTER (
        WHERE inst.status = 'Completed'
          AND COALESCE(inst.payment_date_actual, inst.collection_payment_date) BETWEEN p_start AND p_end
      ), 0) AS collected_bob,
      COALESCE(SUM(inst.amount_native * inst.invoice_rate) FILTER (
        WHERE inst.status IN ('Invoiced', 'Overdue')
          AND inst.collection_invoice_date < (SELECT today FROM now_ctx) - 90
      ), 0) AS overdue_90_bob,
      COUNT(*) FILTER (
        WHERE inst.status IN ('Invoiced', 'Overdue')
          AND inst.collection_invoice_date < (SELECT today FROM now_ctx) - 90
      ) AS overdue_90_count,
      AVG(COALESCE(inst.payment_date_actual, inst.collection_payment_date) - inst.collection_invoice_date) FILTER (
        WHERE inst.status = 'Completed'
          AND COALESCE(inst.payment_date_actual, inst.collection_payment_date) BETWEEN p_start AND p_end
      ) AS avg_collection_days
    FROM installments_full inst
  ),
  collections_by_status AS (
    SELECT jsonb_build_object(
      'collected', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status = 'Completed'),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.payment_rate) FILTER (WHERE inst.status = 'Completed'), 0)),
      'invoiced', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status IN ('Invoiced', 'Overdue')),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.invoice_rate) FILTER (WHERE inst.status IN ('Invoiced', 'Overdue')), 0)),
      'in_arrears', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status = 'Pending' AND inst.agreed_invoice_date < (SELECT today FROM now_ctx)),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.rate_to_bob) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date < (SELECT today FROM now_ctx)), 0)),
      'upcoming', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status = 'Pending' AND inst.agreed_invoice_date >= (SELECT today FROM now_ctx)),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.rate_to_bob) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date >= (SELECT today FROM now_ctx)), 0))
    ) AS by_status
    FROM installments_full inst
  ),
  next7 AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'installment_id', inst.installment_id, 'wo_id', inst.wo_id, 'engagement_id', inst.engagement_id,
        'client_legal_name', cl.client_legal_name,
        'kind', CASE WHEN inst.status IN ('Invoiced', 'Overdue') THEN 'collect' ELSE 'invoice' END,
        'date', CASE WHEN inst.status IN ('Invoiced', 'Overdue') THEN inst.agreed_payment_date ELSE inst.agreed_invoice_date END,
        -- review.md dash_socio iteración 9, G-01 (2026-09-22): una cuota ya facturada
        -- (Invoiced/Overdue) se valora al TC congelado de su factura (invoice_rate), NO al
        -- TC del plan (rate_to_bob) -- consistente con collections_by_status.invoiced, unas
        -- lineas mas arriba. Solo las Pending (aun sin facturar, kind='invoice') usan
        -- rate_to_bob, porque todavia no hay TC congelado.
        'amount_bob', CASE WHEN inst.status IN ('Invoiced', 'Overdue')
                        THEN inst.amount_native * inst.invoice_rate
                        ELSE inst.amount_native * inst.rate_to_bob END
      ) ORDER BY CASE WHEN inst.status IN ('Invoiced', 'Overdue') THEN inst.agreed_payment_date ELSE inst.agreed_invoice_date END
    ), '[]'::jsonb) AS items
    FROM installments_full inst
    JOIN public.engagements e ON e.engagement_id = inst.engagement_id
    JOIN public.clients cl ON cl.client_id = e.client_id
    WHERE
      (inst.status IN ('Invoiced', 'Overdue')
        AND inst.agreed_payment_date BETWEEN (SELECT today FROM now_ctx) AND (SELECT today FROM now_ctx) + 7)
      OR
      (inst.status = 'Pending'
        AND inst.agreed_invoice_date BETWEEN (SELECT today FROM now_ctx) AND (SELECT today FROM now_ctx) + 7)
  ),
  overdue_list AS (
    SELECT
      COUNT(*) AS cnt,
      COALESCE(SUM(inst.amount_native * inst.rate_to_bob), 0) AS amt,
      COALESCE(jsonb_agg(jsonb_build_object(
        'installment_id', inst.installment_id, 'wo_id', inst.wo_id,
        'client_legal_name', cl.client_legal_name,
        'agreed_payment_date', inst.agreed_payment_date,
        'amount_bob', inst.amount_native * inst.rate_to_bob
      ) ORDER BY inst.agreed_payment_date), '[]'::jsonb) AS items
    FROM installments_full inst
    JOIN public.engagements e ON e.engagement_id = inst.engagement_id
    JOIN public.clients cl ON cl.client_id = e.client_id
    WHERE inst.status IN ('Invoiced', 'Overdue') AND inst.agreed_payment_date < (SELECT today FROM now_ctx)
  ),

  -- ── 12. my_engagements/my_budget/my_hours: KPI 3/4, SIEMPRE personales ──────────────
  -- 2026-09-17: KPI 3/4 son personales y no pasan por scope_all, pero tambien se
  -- acotan a funcion=1 (Cliente) -- decision del operador ("si a las horas tambien,
  -- solo si es para cliente").
  my_partner_engagements AS (
    SELECT es.* FROM eng_state es CROSS JOIN caller c
    WHERE es.state IN (4, 5) AND es.funcion = 1 AND c.staff_id IS NOT NULL AND es.partner_id = c.staff_id
  ),
  my_sqr_engagements AS (
    SELECT es.* FROM eng_state es CROSS JOIN caller c
    WHERE es.state IN (4, 5) AND es.funcion = 1 AND c.staff_id IS NOT NULL AND es.sqr_id = c.staff_id
  ),
  my_partner_budget AS (
    SELECT COALESCE(SUM(bl.budgeted_hours), 0) AS hours
    FROM my_partner_engagements mpe
    JOIN public.wo_budget_lines bl ON bl.wo_id = mpe.wo_id AND mpe.approval_status = 'Approved'
    JOIN public.categories cat ON cat.category_id = bl.category_id AND cat.category_name = 'Socio'
  ),
  my_sqr_budget AS (
    SELECT COALESCE(SUM(bl.budgeted_hours), 0) AS hours
    FROM my_sqr_engagements mse
    JOIN public.wo_budget_lines bl ON bl.wo_id = mse.wo_id AND mse.approval_status = 'Approved'
    JOIN public.categories cat ON cat.category_id = bl.category_id AND cat.category_name = 'SQR'
  ),
  my_partner_hours AS (
    SELECT
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND tla.status = 'approved'), 0) AS approved,
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND (tla.status IS NULL OR tla.status = 'pending')), 0) AS pending,
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND tla.status = 'rejected'), 0) AS rejected
    FROM my_partner_engagements mpe
    CROSS JOIN caller c
    JOIN public.time_entries te
      ON te.engagement_id = mpe.engagement_id AND te.staff_id = c.staff_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
  ),
  my_sqr_hours AS (
    SELECT
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND tla.status = 'approved'), 0) AS approved,
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND (tla.status IS NULL OR tla.status = 'pending')), 0) AS pending,
      COALESCE(SUM(te.hours_logged) FILTER (WHERE te.date_worked BETWEEN p_start AND p_end AND tla.status = 'rejected'), 0) AS rejected
    FROM my_sqr_engagements mse
    CROSS JOIN caller c
    JOIN public.time_entries te
      ON te.engagement_id = mse.engagement_id AND te.staff_id = c.staff_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
  ),
  my_sqr_engagement_list AS (
    SELECT
      COUNT(*) AS cnt,
      COALESCE(jsonb_agg(jsonb_build_object('engagement_id', engagement_id, 'engagement_name', engagement_name)), '[]'::jsonb) AS items
    FROM my_sqr_engagements
  ),

  -- ── 13. wo_pending: OT pendientes/riesgo pendiente, TODOS los estados (KPI 5) ───────
  wo_pending_scope AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.funcion = 1  -- 2026-09-17: solo cartera de clientes, igual que scope_all
      AND (p_client_id IS NULL OR rs.client_id = p_client_id)
      AND (p_manager_id IS NULL OR rs.manager_id = p_manager_id)
      AND (p_industry_id IS NULL OR rs.industry_id = p_industry_id)
      AND (p_society_id IS NULL OR rs.society_id = p_society_id)
  ),
  wo_pending AS (
    SELECT
      COUNT(*) FILTER (WHERE approval_status = 'Pending_Approval') AS pending_wo_count,
      COUNT(*) FILTER (WHERE risk_status = 'Pending' AND approval_status = 'Approved') AS pending_risk_count
    FROM wo_pending_scope
  ),

  -- ── 14. finalizados en el periodo (KPI 1, obs.8: end_date como proxy) ───────────────
  finalized_scope AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state = 7
      AND rs.funcion = 1  -- 2026-09-17: solo cartera de clientes, igual que scope_all
      AND rs.end_date BETWEEN p_start AND p_end
      AND (p_client_id IS NULL OR rs.client_id = p_client_id)
      AND (p_manager_id IS NULL OR rs.manager_id = p_manager_id)
      AND (p_industry_id IS NULL OR rs.industry_id = p_industry_id)
      AND (p_society_id IS NULL OR rs.society_id = p_society_id)
  ),

  -- ── 15. alertas adicionales (Bloque H) ──────────────────────────────────────────────
  alerts_extra AS (
    SELECT
      COUNT(*) FILTER (WHERE s.fecha_cierre BETWEEN (SELECT today FROM now_ctx) AND (SELECT today FROM now_ctx) + 30) AS closing_soon,
      COUNT(*) FILTER (WHERE s.risk_status = 'Pending' AND s.approval_status = 'Approved') AS risk_pending
    FROM scope s
  ),
  draft_worksheets_agg AS (
    SELECT COUNT(*) AS cnt
    FROM public.activity_worksheets aw
    JOIN scope s ON s.engagement_id = aw.engagement_id
    WHERE aw.status = 'draft' AND aw.wo_id IS NULL
  ),

  -- ── 16. filas por encargo (Bloque F, sobregiro de KPI 5, Bloque E) ──────────────────
  engagement_rows AS (
    SELECT
      s.engagement_id, s.engagement_name, s.client_id, s.manager_id, s.industry_id,
      s.approval_status, s.risk_status, s.state,
      cl.client_legal_name,
      mgr.short_name AS manager_short_name,
      COALESCE(bt.total_budget_hours, 0) AS budget_hours,
      COALESCE(ht.period_approved, 0) AS approved_hours,
      COALESCE(ht.period_pending, 0) AS pending_hours,
      COALESCE(ht.period_rejected, 0) AS rejected_hours,
      COALESCE(ht.lifetime_consumed, 0) AS lifetime_hours,
      (COALESCE(ht.lifetime_consumed, 0) > COALESCE(bt.total_budget_hours, 0)) AS over_budget,
      CASE WHEN COALESCE(bt.total_budget_hours, 0) > 0
           THEN COALESCE(ht.lifetime_consumed, 0) / bt.total_budget_hours
           ELSE 0 END AS consumption_ratio
    FROM scope s
    JOIN public.clients cl ON cl.client_id = s.client_id
    LEFT JOIN public.staff mgr ON mgr.staff_id = s.manager_id
    LEFT JOIN budget_hours_total bt ON bt.engagement_id = s.engagement_id
    LEFT JOIN hours_totals ht ON ht.engagement_id = s.engagement_id
  ),
  -- 2026-09-17: se retira engagement_hours_agg (preview fijo de 20, ordenado siempre
  -- igual). El Bloque F ya no lee un preview de este payload -- consulta siempre
  -- partner_overview_engagements() (mismos filtros + p_sort_key + p_over_budget_only),
  -- que ahora también sirve la vista "top 10" además de "Ver todos". engagement_rows se
  -- mantiene solo para over_budget_agg (KPI 5 / Bloque H).
  over_budget_agg AS (
    SELECT COUNT(*) FILTER (WHERE over_budget) AS cnt FROM engagement_rows
  ),

  -- ── 17. sectores, gerentes, top clientes ────────────────────────────────────────────
  sectors AS (
    SELECT s.industry_id, ind.industry_name,
      COUNT(*) AS engagement_count,
      COALESCE(SUM(w.fee_net * w.rate_to_bob), 0) AS fee_bob
    FROM scope s
    LEFT JOIN public.industries ind ON ind.industry_id = s.industry_id
    LEFT JOIN wo w ON w.engagement_id = s.engagement_id
    GROUP BY s.industry_id, ind.industry_name
  ),
  sectors_agg AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'industry_id', industry_id, 'industry_name', industry_name,
        'engagement_count', engagement_count, 'fee_bob', fee_bob
      ) ORDER BY fee_bob DESC), '[]'::jsonb) AS items
    FROM sectors
  ),
  managers AS (
    SELECT s.manager_id AS staff_id, st.short_name,
      COUNT(*) AS engagement_count,
      COALESCE(SUM(bt.total_budget_hours), 0) AS budget_hours,
      COALESCE(SUM(ht.period_approved), 0) AS approved_hours,
      COALESCE(SUM(ht.period_pending), 0) AS pending_hours,
      COUNT(*) FILTER (WHERE s.approval_status = 'Pending_Approval') AS pending_wo_count,
      -- 2026-09-17 (Bloque E rediseñado a tabla): fecha de inicio más próxima y fecha fin
      -- más lejana entre los encargos 4/5 del gerente (mismo alcance de siempre).
      MIN(s.start_date) AS start_date,
      MAX(s.end_date) AS end_date
    FROM scope s
    LEFT JOIN public.staff st ON st.staff_id = s.manager_id
    LEFT JOIN budget_hours_total bt ON bt.engagement_id = s.engagement_id
    LEFT JOIN hours_totals ht ON ht.engagement_id = s.engagement_id
    WHERE s.manager_id IS NOT NULL
    GROUP BY s.manager_id, st.short_name
  ),
  managers_agg AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'staff_id', staff_id, 'short_name', short_name, 'engagement_count', engagement_count,
        'budget_hours', budget_hours, 'approved_hours', approved_hours, 'pending_hours', pending_hours,
        'pending_wo_count', pending_wo_count, 'start_date', start_date, 'end_date', end_date
      ) ORDER BY (CASE WHEN budget_hours > 0 THEN (approved_hours + pending_hours) / budget_hours ELSE 0 END) DESC),
      '[]'::jsonb) AS items
    FROM managers
  ),
  top_clients_base AS (
    SELECT
      s.client_id, cl.client_legal_name,
      COUNT(*) AS engagement_count,
      COALESCE(SUM(w.fee_net * w.rate_to_bob), 0) AS fee_bob,
      COALESCE(SUM(w.fee_net * w.rate_to_bob), 0)
        - (COALESCE(SUM(ht.period_value_approved), 0) + COALESCE(SUM(ht.period_value_pending), 0) + COALESCE(SUM(eb.reviewed_bob), 0)) AS margin_abs,
      COALESCE(SUM(ifull.to_invoice_bob), 0) AS to_invoice_bob,
      COALESCE(SUM(ifull.collected_bob), 0) AS collected_bob
    FROM scope s
    JOIN public.clients cl ON cl.client_id = s.client_id
    LEFT JOIN wo w ON w.engagement_id = s.engagement_id
    LEFT JOIN hours_totals ht ON ht.engagement_id = s.engagement_id
    LEFT JOIN expenses_by_engagement eb ON eb.engagement_id = s.engagement_id
    LEFT JOIN (
      SELECT engagement_id,
        SUM(amount_native * rate_to_bob) AS to_invoice_bob,
        SUM(amount_native * payment_rate) FILTER (WHERE status = 'Completed') AS collected_bob
      FROM installments_full GROUP BY engagement_id
    ) ifull ON ifull.engagement_id = s.engagement_id
    GROUP BY s.client_id, cl.client_legal_name
  ),
  top_clients_agg AS (
    SELECT COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'client_id', client_id, 'client_legal_name', client_legal_name, 'fee_bob', fee_bob,
          'engagement_count', engagement_count,
          'margin_pct', CASE WHEN fee_bob > 0 THEN round((margin_abs / fee_bob) * 100, 2) ELSE NULL END,
          'collected_pct', CASE WHEN to_invoice_bob > 0 THEN round((collected_bob / to_invoice_bob) * 100, 2) ELSE NULL END
        ) ORDER BY fee_bob DESC)
       FROM (SELECT * FROM top_clients_base ORDER BY fee_bob DESC LIMIT 5) t5),  -- 2026-09-17: 3 -> 5
      '[]'::jsonb
    ) AS items
  ),

  -- ── 18. rentabilidad (Bloque A) + honorarios/sparkline (KPI 2) ──────────────────────
  profitability_agg AS (
    SELECT
      COALESCE(SUM(bt.total_budget_hours), 0) AS hours_budget,
      COALESCE(SUM(ht.period_approved), 0) AS hours_approved,
      COALESCE(SUM(ht.period_pending), 0) AS hours_pending,
      COALESCE(SUM(ht.period_rejected), 0) AS hours_rejected,
      COALESCE(SUM(ht.prior_period_total), 0) AS hours_previous_logged,
      COALESCE(SUM(w.fee_net * w.rate_to_bob), 0) AS money_fee_net,
      COALESCE(SUM(w.expense_budget * w.rate_to_bob), 0) AS money_expense_budget,
      COALESCE(SUM(ht.period_value_approved), 0) AS money_hours_valued_approved,
      COALESCE(SUM(ht.period_value_pending), 0) AS money_hours_valued_pending,
      COALESCE(SUM(eb.reviewed_bob), 0) AS money_expenses_reviewed,
      COALESCE(SUM(eb.manager_approved_bob), 0) AS money_expenses_manager_approved,
      COALESCE(SUM(ht.prior_period_value), 0) AS money_previous_executed,
      COUNT(*) FILTER (WHERE w.wo_id IS NOT NULL AND w.plan_exchange_rate_mode = 'variable') AS variable_rate_count,
      COUNT(*) FILTER (WHERE w.wo_id IS NOT NULL AND w.rate_to_bob IS NULL) AS nonconvertible_count
    FROM scope s
    LEFT JOIN budget_hours_total bt ON bt.engagement_id = s.engagement_id
    LEFT JOIN hours_totals ht ON ht.engagement_id = s.engagement_id
    LEFT JOIN wo w ON w.engagement_id = s.engagement_id
    LEFT JOIN expenses_by_engagement eb ON eb.engagement_id = s.engagement_id
  ),
  nonconvertible_agg AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'engagement_id', w.engagement_id, 'currency', w.currency, 'fee_native', w.fee_net
      )), '[]'::jsonb) AS items
    FROM wo w
    WHERE w.wo_id IS NOT NULL AND w.rate_to_bob IS NULL
  ),
  -- prev_wo_fee (MF-02): honorario neto en Bs de los encargos que estaban en cartera
  -- HACE UN ANIO (scope_previous_year), no de los de hoy. Reimplementa solo lo que
  -- fees_agg necesita de wo_raw/wo_rate (fee_net + TC) porque `wo` esta atado a `scope`.
  prev_wo_fee AS (
    SELECT
      spy.engagement_id,
      (COALESCE(bl.fee, 0) + COALESCE(spy.adjustment_amount, 0)) AS fee_net,
      CASE
        WHEN spy.currency = 'BOB' THEN 1
        WHEN p.exchange_rate IS NOT NULL THEN p.exchange_rate
        WHEN spy.currency = 'USD' THEN (SELECT rate FROM default_rate)
        ELSE NULL
      END AS rate_to_bob
    FROM scope_previous_year spy
    LEFT JOIN LATERAL (
      SELECT SUM(bl.budgeted_hours * bl.standard_rate) AS fee
      FROM public.wo_budget_lines bl
      WHERE bl.wo_id = spy.wo_id AND spy.approval_status = 'Approved'
    ) bl ON true
    LEFT JOIN public.wo_payment_plan p ON p.wo_id = spy.wo_id
  ),
  fees_agg AS (
    SELECT
      COALESCE(SUM(w.fee_net * w.rate_to_bob), 0) AS total_bob,
      (SELECT COALESCE(SUM(pf.fee_net * pf.rate_to_bob), 0) FROM prev_wo_fee pf) AS previous_total_bob
    FROM scope s
    LEFT JOIN wo w ON w.engagement_id = s.engagement_id
  ),
  fees_monthly AS (
    SELECT date_trunc('month', w.approved_at)::date AS month, SUM(w.fee_net * w.rate_to_bob) AS value_bob
    FROM scope s
    LEFT JOIN wo w ON w.engagement_id = s.engagement_id
    WHERE w.approved_at BETWEEN p_start AND p_end
    GROUP BY date_trunc('month', w.approved_at)
  ),
  fees_monthly_agg AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'value_bob', value_bob)
      ORDER BY month), '[]'::jsonb) AS items
    FROM fees_monthly
  ),

  -- ── 19. conteos de alcance (meta) ────────────────────────────────────────────────────
  scope_counts AS (
    SELECT
      (SELECT COUNT(*) FROM scope_all) AS unfiltered_scope_count,
      (SELECT COUNT(*) FROM scope) AS scope_count,
      (SELECT COUNT(*) FILTER (WHERE state = 4) FROM scope) AS approved_count,
      (SELECT COUNT(*) FILTER (WHERE state = 5) FROM scope) AS emergency_count
  ),
  finalized_count AS (
    SELECT COUNT(*) AS cnt FROM finalized_scope
  ),

  -- ── 19b. Fila resumen "Encargos finalizados" (pedido del operador 2026-09-19): extiende
  -- finalized_scope/finalized_count (arriba, ya usado por kpis.engagements.finalized_in_period)
  -- con presupuesto/ejecutado/honorarios pagados. budget_hours/executed_hours son de VIDA
  -- COMPLETA del encargo (desempeño final, no solo lo cargado durante la ventana de
  -- cierre); collected_bob usa el mismo criterio "Completed" que collections_by_status.
  finalized_wo_raw AS (
    SELECT
      fs.engagement_id, wo.wo_id, wo.currency, wo.season_mode,
      COALESCE(wo.tax_rate, 0.13) AS tax_rate,
      COALESCE(wo.adjustment_amount, 0) AS adjustment_amount,
      COALESCE(bl.fee, 0) AS total_standard_fee,
      COALESCE(eb.amt, 0) AS expense_budget,
      p.exchange_rate AS plan_exchange_rate
    FROM finalized_scope fs
    JOIN public.work_orders wo ON wo.engagement_id = fs.engagement_id AND wo.approval_status = 'Approved'
    LEFT JOIN LATERAL (
      SELECT SUM(bl.budgeted_hours * bl.standard_rate) AS fee
      FROM public.wo_budget_lines bl WHERE bl.wo_id = wo.wo_id
    ) bl ON true
    LEFT JOIN LATERAL (
      SELECT SUM(eb.budgeted_amount) AS amt
      FROM public.wo_expense_budget eb WHERE eb.wo_id = wo.wo_id
    ) eb ON true
    LEFT JOIN public.wo_payment_plan p ON p.wo_id = wo.wo_id
  ),
  finalized_wo AS (
    SELECT
      fwr.*,
      (fwr.total_standard_fee + fwr.adjustment_amount) AS fee_net,
      CASE
        WHEN fwr.currency = 'BOB' THEN 1
        WHEN fwr.plan_exchange_rate IS NOT NULL THEN fwr.plan_exchange_rate
        WHEN fwr.currency = 'USD' THEN (SELECT rate FROM default_rate)
        ELSE NULL
      END AS rate_to_bob
    FROM finalized_wo_raw fwr
  ),
  finalized_budget AS (
    SELECT COALESCE(SUM(bl.budgeted_hours), 0) AS budget_hours
    FROM finalized_wo fw
    JOIN public.wo_budget_lines bl ON bl.wo_id = fw.wo_id
  ),
  finalized_hours AS (
    SELECT COALESCE(SUM(te.hours_logged), 0) AS executed_hours
    FROM finalized_scope fs
    JOIN public.time_entries te ON te.engagement_id = fs.engagement_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
    WHERE tla.status IS DISTINCT FROM 'rejected'
  ),
  finalized_collected AS (
    SELECT COALESCE(SUM(
      COALESCE(i.amount, i.percentage * ((fw.fee_net + fw.expense_budget) / NULLIF(1 - fw.tax_rate, 0)) / 100)
      * COALESCE(i.payment_exchange_rate, i.invoice_exchange_rate, fw.rate_to_bob)
    ) FILTER (WHERE i.status = 'Completed'), 0) AS collected_bob
    FROM finalized_wo fw
    JOIN public.wo_payment_installments i ON i.wo_id = fw.wo_id
  )

  -- ── 20. Ensamblado final ─────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'role_key', c.role_key,
      'scope_kind', CASE c.role_key
                      WHEN 'senior_partner' THEN 'firm'
                      WHEN 'admin' THEN 'firm'
                      WHEN 'partner' THEN 'society'
                      WHEN 'director' THEN 'own'
                      WHEN 'sqr' THEN 'own'
                      WHEN 'risk_partner' THEN 'own'
                      ELSE 'none' END,
      'society_name', cs.society_name,
      'scope_count', sc.scope_count,
      'unfiltered_scope_count', sc.unfiltered_scope_count,
      'variable_rate_count', pa.variable_rate_count,
      'nonconvertible_count', pa.nonconvertible_count,
      'today', nc.today
    ),
    'filters', jsonb_build_object(
      'clients', fa.clients, 'managers', fa.managers, 'industries', fa.industries, 'societies', fa.societies
    ),
    'kpis', jsonb_build_object(
      'engagements', jsonb_build_object(
        'total', sc.scope_count, 'approved', sc.approved_count, 'emergency', sc.emergency_count,
        'finalized_in_period', fc.cnt
      ),
      'fees', jsonb_build_object(
        'total_bob', fe.total_bob, 'previous_total_bob', fe.previous_total_bob, 'sparkline', fma.items
      ),
      'my_partner_hours', jsonb_build_object(
        'budget', mpb.hours, 'approved', mph.approved, 'pending', mph.pending, 'rejected', mph.rejected
      ),
      'my_sqr_hours', jsonb_build_object(
        'budget', msb.hours, 'approved', msh.approved, 'pending', msh.pending, 'rejected', msh.rejected,
        'engagement_count', msel.cnt, 'engagements', msel.items
      ),
      'alerts', jsonb_build_object(
        'over_budget_count', oba.cnt, 'portfolio_count', sc.scope_count,
        'pending_wo_count', wp.pending_wo_count, 'pending_risk_count', wp.pending_risk_count
      )
    ),
    'profitability', jsonb_build_object(
      'hours', jsonb_build_object(
        'budget', pa.hours_budget, 'approved', pa.hours_approved, 'pending', pa.hours_pending,
        'rejected', pa.hours_rejected, 'previous_logged', pa.hours_previous_logged
      ),
      'money_bob', jsonb_build_object(
        'fee_net', pa.money_fee_net, 'expense_budget', pa.money_expense_budget,
        'hours_valued_approved', pa.money_hours_valued_approved, 'hours_valued_pending', pa.money_hours_valued_pending,
        'expenses_reviewed', pa.money_expenses_reviewed, 'expenses_manager_approved', pa.money_expenses_manager_approved,
        'previous_executed', pa.money_previous_executed
      ),
      'nonconvertible', nca.items
    ),
    'economic_cycle', jsonb_build_object(
      'to_invoice_bob', ec.to_invoice_bob, 'invoiced_bob', ec.invoiced_bob, 'collected_bob', ec.collected_bob,
      'overdue_90_bob', ec.overdue_90_bob, 'avg_collection_days', ec.avg_collection_days
    ),
    'collections', jsonb_build_object(
      'by_status', cbs.by_status,
      'next_7_days', n7.items,
      'overdue', jsonb_build_object('count', ol.cnt, 'amount_bob', ol.amt, 'items', ol.items)
    ),
    'sectors', sa.items,
    'managers', ma.items,
    'top_clients', tca.items,
    'alerts', jsonb_build_object(
      'pending_wo', wp.pending_wo_count, 'over_budget', oba.cnt, 'in_arrears', (cbs.by_status->'in_arrears'->>'count')::int,
      'overdue_90', ec.overdue_90_count, 'closing_soon', ae.closing_soon, 'risk_pending', ae.risk_pending,
      'draft_worksheets', dwa.cnt
    ),
    'finalized_summary', jsonb_build_object(
      'count', fc.cnt, 'budget_hours', fzb.budget_hours,
      'executed_hours', fzh.executed_hours, 'collected_bob', fzcol.collected_bob
    )
  )
  FROM caller c
  CROSS JOIN caller_staff cs
  CROSS JOIN now_ctx nc
  CROSS JOIN scope_counts sc
  CROSS JOIN finalized_count fc
  CROSS JOIN filters_agg fa
  CROSS JOIN fees_agg fe
  CROSS JOIN fees_monthly_agg fma
  CROSS JOIN my_partner_budget mpb
  CROSS JOIN my_partner_hours mph
  CROSS JOIN my_sqr_budget msb
  CROSS JOIN my_sqr_hours msh
  CROSS JOIN my_sqr_engagement_list msel
  CROSS JOIN wo_pending wp
  CROSS JOIN over_budget_agg oba
  CROSS JOIN profitability_agg pa
  CROSS JOIN nonconvertible_agg nca
  CROSS JOIN economic_cycle ec
  CROSS JOIN collections_by_status cbs
  CROSS JOIN next7 n7
  CROSS JOIN overdue_list ol
  CROSS JOIN sectors_agg sa
  CROSS JOIN managers_agg ma
  CROSS JOIN top_clients_agg tca
  CROSS JOIN alerts_extra ae
  CROSS JOIN draft_worksheets_agg dwa
  CROSS JOIN finalized_budget fzb
  CROSS JOIN finalized_hours fzh
  CROSS JOIN finalized_collected fzcol
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


--
-- Name: FUNCTION partner_overview(p_start date, p_end date, p_fiscal_year integer, p_client_id uuid, p_manager_id uuid, p_industry_id uuid, p_society_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.partner_overview(p_start date, p_end date, p_fiscal_year integer, p_client_id uuid, p_manager_id uuid, p_industry_id uuid, p_society_id uuid) IS 'dash_socio (decisiones.md, plan_v2.md §7.1): payload unico del tablero "Practica" (re-etiquetado 2026-09-16, reemplaza visualmente al viejo tab practica/dashboard.practice_financials.read -- ver Index.tsx) con 5 KPI + bloques A-H en un round-trip. Gateado por dashboard.partner.read; alcance por role_key (senior_partner/admin=firma, partner=sociedad, director/sqr/risk_partner=SOLO partner_id = yo -- ser sqr_id ya no basta, ver comentario en role_scope), conjunto base = estado efectivo 4/5 + funcion=1/Cliente (2026-09-17: excluye Administrativo/Capacitacion/Calidad de TODO el tablero, incl. KPI 3/4), filtrado por periodo via solapamiento start_date/end_date u anio_fiscal si el selector es FY completo (revertido 2026-09-17, ver comentario en scope_all). p_society_id (2026-09-17) angosta por sociedad, solo lo setea la UI para admin/senior_partner. El Bloque F ya no viaja en este payload -- ver partner_overview_engagements(). Ver bugs/dashboard/socio/plan_v2.md §7.3 para el contrato exacto del payload.';


--
-- Name: partner_overview_engagements(date, date, integer, uuid, uuid, uuid, uuid, text, boolean, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.partner_overview_engagements(p_start date, p_end date, p_fiscal_year integer DEFAULT NULL::integer, p_client_id uuid DEFAULT NULL::uuid, p_manager_id uuid DEFAULT NULL::uuid, p_industry_id uuid DEFAULT NULL::uuid, p_society_id uuid DEFAULT NULL::uuid, p_sort_key text DEFAULT 'end_date'::text, p_over_budget_only boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 0), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_sort_key text := CASE WHEN p_sort_key IN ('start_date', 'end_date', 'progress', 'pending_pct')
                          THEN p_sort_key ELSE 'end_date' END;
BEGIN
  IF NOT public.has_permission('dashboard.partner.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.partner.read';
  END IF;

  v_result := (
  WITH
  caller AS (
    SELECT public.get_my_staff_id() AS staff_id,
           public.current_role_key() AS role_key
  ),
  caller_staff AS (
    SELECT s.staff_id AS resolved_staff_id, s.society_id
    FROM caller c
    LEFT JOIN public.staff s ON s.staff_id = c.staff_id
  ),
  eng_state AS (
    SELECT
      e.engagement_id, e.client_id, e.engagement_name, e.partner_id, e.manager_id, e.sqr_id,
      e.society_id, e.start_date, e.end_date, e.anio_fiscal, e.fecha_cierre, e.funcion,
      e.work_order_required, e.engagement_state_override,
      cl.industry_id,
      wo.wo_id, wo.currency, wo.season_mode, wo.approval_status, wo.risk_status, wo.approved_at,
      public.effective_engagement_state(
        e.engagement_state_override, e.work_order_required, wo.wo_id,
        wo.approval_status, wo.risk_status, wo.approved_at
      ) AS state
    FROM public.engagements e
    JOIN public.clients cl ON cl.client_id = e.client_id
    LEFT JOIN public.work_orders wo ON wo.engagement_id = e.engagement_id
  ),
  role_scope AS (
    SELECT es.*
    FROM eng_state es
    CROSS JOIN caller c
    LEFT JOIN caller_staff cs ON true
    WHERE
      c.role_key IN ('senior_partner', 'admin')
      OR (c.role_key = 'partner' AND es.society_id IS NOT NULL AND cs.society_id IS NOT NULL
          AND es.society_id = cs.society_id)
      OR (c.role_key IN ('director', 'sqr', 'risk_partner') AND c.staff_id IS NOT NULL
          AND es.partner_id = c.staff_id)
  ),
  -- 2026-09-17: revertido el intento de usar fecha_cierre (mismo motivo que
  -- partner_overview() -- ver comentario ahi). Vuelve al solapamiento start_date/end_date
  -- original, con anio_fiscal si el selector es FY completo. Se agrega funcion=1
  -- (Cliente): decision del operador, excluye Administrativo/Capacitacion/Calidad de
  -- TODO el tablero, tambien de este bloque.
  scope_all AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state IN (4, 5)
      AND rs.funcion = 1
      AND (
        CASE WHEN p_fiscal_year IS NOT NULL THEN rs.anio_fiscal = p_fiscal_year
             ELSE COALESCE(rs.start_date, p_start) <= p_end AND COALESCE(rs.end_date, p_end) >= p_start
        END
      )
  ),
  scope AS (
    SELECT sa.*
    FROM scope_all sa
    WHERE (p_client_id IS NULL OR sa.client_id = p_client_id)
      AND (p_manager_id IS NULL OR sa.manager_id = p_manager_id)
      AND (p_industry_id IS NULL OR sa.industry_id = p_industry_id)
      AND (p_society_id IS NULL OR sa.society_id = p_society_id)
  ),
  budget_hours AS (
    SELECT s.engagement_id, SUM(bl.budgeted_hours) AS hours
    FROM scope s
    JOIN public.wo_budget_lines bl ON bl.wo_id = s.wo_id AND s.approval_status = 'Approved'
    GROUP BY s.engagement_id
  ),
  hours AS (
    SELECT
      s.engagement_id,
      CASE WHEN tla.status = 'approved' THEN 'approved'
           WHEN tla.status = 'rejected' THEN 'rejected'
           ELSE 'pending' END AS bucket,
      te.hours_logged,
      te.date_worked
    FROM scope s
    JOIN public.time_entries te ON te.engagement_id = s.engagement_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
  ),
  hours_totals AS (
    SELECT
      engagement_id,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'approved') AS period_approved,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'pending') AS period_pending,
      SUM(hours_logged) FILTER (WHERE date_worked BETWEEN p_start AND p_end AND bucket = 'rejected') AS period_rejected,
      -- review.md iteracion 1, MF-03: excluye 'rejected' -- decisiones.md §4.3 dice que las
      -- rechazadas solo van al tooltip, nunca cuentan como "cargado" (ni para sobregiro ni
      -- para el % de avance que se muestra en la tabla).
      SUM(hours_logged) FILTER (WHERE bucket IN ('approved', 'pending')) AS lifetime_consumed
    FROM hours
    GROUP BY engagement_id
  ),
  engagement_rows AS (
    SELECT
      s.engagement_id, s.engagement_name, s.state, s.start_date, s.end_date,
      cl.client_legal_name,
      mgr.short_name AS manager_short_name,
      COALESCE(bh.hours, 0) AS budget_hours,
      COALESCE(ht.period_approved, 0) AS approved_hours,
      COALESCE(ht.period_pending, 0) AS pending_hours,
      COALESCE(ht.period_rejected, 0) AS rejected_hours,
      (COALESCE(ht.lifetime_consumed, 0) > COALESCE(bh.hours, 0)) AS over_budget,
      CASE WHEN COALESCE(bh.hours, 0) > 0
           THEN COALESCE(ht.lifetime_consumed, 0) / bh.hours
           ELSE 0 END AS consumption_ratio,
      CASE WHEN COALESCE(bh.hours, 0) > 0
           THEN COALESCE(ht.period_pending, 0) / bh.hours
           ELSE 0 END AS pending_ratio
    FROM scope s
    JOIN public.clients cl ON cl.client_id = s.client_id
    LEFT JOIN public.staff mgr ON mgr.staff_id = s.manager_id
    LEFT JOIN budget_hours bh ON bh.engagement_id = s.engagement_id
    LEFT JOIN hours_totals ht ON ht.engagement_id = s.engagement_id
  ),
  -- p_over_budget_only filtra ANTES de contar/paginar, para que 'total' refleje el filtro
  -- activo (el botón "Ver todos" decide si mostrarse comparando total vs. items.length).
  filtered_rows AS (
    SELECT * FROM engagement_rows
    WHERE (NOT p_over_budget_only OR over_budget)
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM filtered_rows),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'engagement_id', engagement_id, 'engagement_name', engagement_name,
        'client_legal_name', client_legal_name, 'manager_short_name', manager_short_name,
        'state', state, 'budget_hours', budget_hours, 'approved_hours', approved_hours,
        'pending_hours', pending_hours, 'rejected_hours', rejected_hours, 'over_budget', over_budget,
        'start_date', start_date, 'end_date', end_date
      ) ORDER BY
          CASE WHEN v_sort_key = 'start_date' THEN start_date END ASC,
          CASE WHEN v_sort_key = 'end_date' THEN end_date END ASC,
          CASE WHEN v_sort_key = 'progress' THEN consumption_ratio END DESC,
          CASE WHEN v_sort_key = 'pending_pct' THEN pending_ratio END DESC,
          engagement_id)
      FROM (
        SELECT * FROM filtered_rows
        ORDER BY
          CASE WHEN v_sort_key = 'start_date' THEN start_date END ASC,
          CASE WHEN v_sort_key = 'end_date' THEN end_date END ASC,
          CASE WHEN v_sort_key = 'progress' THEN consumption_ratio END DESC,
          CASE WHEN v_sort_key = 'pending_pct' THEN pending_ratio END DESC,
          engagement_id
        LIMIT v_limit OFFSET v_offset
      ) paged
    ), '[]'::jsonb)
  )
  );

  RETURN v_result;
END;
$$;


--
-- Name: FUNCTION partner_overview_engagements(p_start date, p_end date, p_fiscal_year integer, p_client_id uuid, p_manager_id uuid, p_industry_id uuid, p_society_id uuid, p_sort_key text, p_over_budget_only boolean, p_limit integer, p_offset integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.partner_overview_engagements(p_start date, p_end date, p_fiscal_year integer, p_client_id uuid, p_manager_id uuid, p_industry_id uuid, p_society_id uuid, p_sort_key text, p_over_budget_only boolean, p_limit integer, p_offset integer) IS 'dash_socio (plan_v2.md §7.2, reescrito 2026-09-17): fuente única del Bloque F -- misma llamada sirve la vista compacta (p_limit=10) y "Ver todos" (p_limit mayor); p_sort_key (start_date|end_date|progress|pending_pct) y p_over_budget_only controlan orden/filtro del lado del servidor para que el top-N sea real sobre toda la cartera, no solo sobre un preview recortado. Mismo alcance que partner_overview(): estado 4/5 + funcion=1/Cliente, periodo por solapamiento start_date/end_date o anio_fiscal.';


--
-- Name: permission_scope(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.permission_scope(p_permission_key text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select rp.scope_key
  from public.user_roles ur
  join public.authorization_role_permissions rp on rp.role_key = ur.role_key
  where ur.user_id = auth.uid()
    and rp.permission_key = p_permission_key
  limit 1;
$$;


--
-- Name: personal_overview(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.personal_overview(p_history_start date, p_history_end date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id        uuid;
  v_today           date;
  v_week_start      date;
  v_operational_end date;
  v_result          jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: no session';
  END IF;
  IF NOT public.has_permission('dashboard.personal.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.personal.read';
  END IF;
  IF p_history_start IS NULL OR p_history_end IS NULL OR p_history_start > p_history_end THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;

  v_today           := ((now() AT TIME ZONE 'America/La_Paz')::date);
  v_week_start      := date_trunc('week', v_today)::date;
  v_operational_end := v_week_start + 27; -- semana actual + 3 siguientes (lunes-domingo, decisiones.md)
  v_staff_id        := public.get_my_staff_id();

  -- Sesión autenticada sin ficha de personal asociada: estado vacío explícito
  -- (has_staff_record=false), sin excepción -- plan_v2.md §6.1. El factory TypeScript
  -- (emptyPersonalOverviewPayload / toPersonalViewModel) completa el resto de forma segura.
  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object(
      'meta', jsonb_build_object(
        'has_staff_record', false,
        'today', v_today,
        'current_week_start', v_week_start,
        'operational_end', v_operational_end,
        'history_start', p_history_start,
        'history_end', p_history_end,
        'generated_at', now()
      ),
      'current_week', '{}'::jsonb,
      'workload_weeks', '[]'::jsonb,
      'assignments', '[]'::jsonb,
      'current_week_engagements', '[]'::jsonb,
      'compliance_weeks', '[]'::jsonb,
      'fund_requests', '[]'::jsonb,
      'historical', '{}'::jsonb
    );
  END IF;

  v_result := (
  WITH
  -- review.md dash_personal iteración 3, G-01 (2026-09-22): timesheet_periods.deadline
  -- nunca se puebla (el INSERT de useTimesheetWeek.ts la omite) -- el vencimiento real de
  -- envío se deriva del mismo ajuste que ya usa portfolio_overview() para su Cola de
  -- aprobación (TS_EMPLOYEE_RETRO_DAYS, 20260917160000:196-200), NO de esa columna.
  retro_days_ctx AS (
    SELECT COALESCE(
      (SELECT setting_value::int FROM public.global_settings WHERE setting_key = 'TS_EMPLOYEE_RETRO_DAYS'),
      30
    ) AS retro_days
  ),
  -- ── Asignaciones propias que solapan la ventana operativa (semana actual + 3 siguientes,
  -- inclusive) -- decisiones.md §14: hours_per_week completo por cada fila que solape,
  -- ningún prorrateo. Filtra deleted_at/CANCELLED, igual que dash_encargo. ──────────────────
  assignments_window AS (
    SELECT ea.assignment_id, ea.engagement_id, ea.start_date, ea.end_date,
           ea.hours_per_week, ea.status,
           e.engagement_code, e.engagement_name, e.funcion AS function_code
    FROM public.engagement_assignments ea
    JOIN public.engagements e ON e.engagement_id = ea.engagement_id
    WHERE ea.staff_id = v_staff_id
      AND ea.deleted_at IS NULL
      AND ea.status <> 'CANCELLED'
      AND ea.start_date <= v_operational_end
      AND ea.end_date >= v_week_start
  ),
  assignments_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'assignment_id', assignment_id, 'engagement_id', engagement_id,
      'engagement_code', engagement_code, 'engagement_name', engagement_name,
      'function_code', function_code, 'start_date', start_date, 'end_date', end_date,
      'hours_per_week', hours_per_week, 'status', status
    ) ORDER BY start_date, engagement_code NULLS LAST, assignment_id), '[]'::jsonb) AS items
    FROM assignments_window
  ),

  -- ── Horas planificadas vs. guardadas -- 4 semanas lunes-domingo (offset 0..3) ───────────
  workload_weeks_base AS (
    SELECT gs AS week_offset,
           (v_week_start + (gs * 7)) AS week_start,
           (v_week_start + (gs * 7) + 6) AS week_end
    FROM generate_series(0, 3) gs
  ),
  workload_planned AS (
    SELECT wb.week_offset, COALESCE(SUM(aw.hours_per_week), 0) AS planned_hours
    FROM workload_weeks_base wb
    LEFT JOIN assignments_window aw
      ON aw.start_date <= wb.week_end AND aw.end_date >= wb.week_start
    GROUP BY wb.week_offset
  ),
  workload_saved AS (
    SELECT wb.week_offset, COALESCE(SUM(te.hours_logged), 0) AS saved_hours
    FROM workload_weeks_base wb
    LEFT JOIN public.time_entries te
      ON te.staff_id = v_staff_id AND te.is_forecast = false
     AND te.date_worked BETWEEN wb.week_start AND wb.week_end
    GROUP BY wb.week_offset
  ),
  workload_weeks_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'week_start', wb.week_start, 'week_end', wb.week_end,
      'planned_hours', wp.planned_hours, 'saved_hours', ws.saved_hours
    ) ORDER BY wb.week_offset), '[]'::jsonb) AS items
    FROM workload_weeks_base wb
    JOIN workload_planned wp ON wp.week_offset = wb.week_offset
    JOIN workload_saved ws ON ws.week_offset = wb.week_offset
  ),

  -- ── Semana actual: pronóstico (is_forecast=true, SOLO semana actual -- decisiones.md §18)
  -- y horas aprobadas (claves period_id+engagement_id+activity_id con una aprobación
  -- 'approved'). planned_hours/saved_hours reutilizan workload_planned/workload_saved
  -- offset=0 -- misma fuente, sin recalcular. ─────────────────────────────────────────────
  current_week_forecast AS (
    SELECT COALESCE(SUM(te.hours_logged), 0) AS forecast_hours
    FROM public.time_entries te
    WHERE te.staff_id = v_staff_id AND te.is_forecast = true
      AND te.date_worked BETWEEN v_week_start AND (v_week_start + 6)
  ),
  current_week_approved AS (
    SELECT COALESCE(SUM(te.hours_logged), 0) AS approved_hours
    FROM public.timesheet_periods tp
    JOIN public.time_entries te ON te.period_id = tp.period_id AND te.is_forecast = false
    WHERE tp.staff_id = v_staff_id AND tp.week_start_date = v_week_start
      AND EXISTS (
        SELECT 1 FROM public.timesheet_line_approvals tla
        WHERE tla.period_id = te.period_id AND tla.engagement_id = te.engagement_id
          AND tla.activity_id = te.activity_id AND tla.status = 'approved'
      )
  ),
  current_week_summary AS (
    SELECT
      (SELECT planned_hours FROM workload_planned WHERE week_offset = 0) AS planned_hours,
      (SELECT saved_hours FROM workload_saved WHERE week_offset = 0) AS saved_hours,
      (SELECT forecast_hours FROM current_week_forecast) AS forecast_hours,
      (SELECT approved_hours FROM current_week_approved) AS approved_hours
  ),

  -- ── Carga por encargo (semana actual): unión de asignadas y guardadas, decisiones.md §15 --
  -- un encargo con carga pero sin asignación no desaparece, uno solo asignado muestra
  -- saved_hours=0. ─────────────────────────────────────────────────────────────────────────
  current_week_assigned_by_eng AS (
    SELECT aw.engagement_id, aw.engagement_code, aw.engagement_name, aw.function_code,
      SUM(aw.hours_per_week) AS assigned_hours
    FROM assignments_window aw
    WHERE aw.start_date <= (v_week_start + 6) AND aw.end_date >= v_week_start
    GROUP BY aw.engagement_id, aw.engagement_code, aw.engagement_name, aw.function_code
  ),
  current_week_saved_by_eng AS (
    SELECT te.engagement_id, e.engagement_code, e.engagement_name, e.funcion AS function_code,
      SUM(te.hours_logged) AS saved_hours
    FROM public.time_entries te
    JOIN public.engagements e ON e.engagement_id = te.engagement_id
    WHERE te.staff_id = v_staff_id AND te.is_forecast = false
      AND te.date_worked BETWEEN v_week_start AND (v_week_start + 6)
    GROUP BY te.engagement_id, e.engagement_code, e.engagement_name, e.funcion
  ),
  current_week_engagements_union AS (
    SELECT
      COALESCE(a.engagement_id, s.engagement_id) AS engagement_id,
      COALESCE(a.engagement_code, s.engagement_code) AS engagement_code,
      COALESCE(a.engagement_name, s.engagement_name) AS engagement_name,
      COALESCE(a.function_code, s.function_code) AS function_code,
      COALESCE(a.assigned_hours, 0) AS assigned_hours,
      COALESCE(s.saved_hours, 0) AS saved_hours
    FROM current_week_assigned_by_eng a
    FULL OUTER JOIN current_week_saved_by_eng s ON s.engagement_id = a.engagement_id
  ),
  current_week_engagements_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'engagement_id', engagement_id, 'engagement_code', engagement_code,
      'engagement_name', engagement_name, 'function_code', function_code,
      'assigned_hours', assigned_hours, 'saved_hours', saved_hours
    ) ORDER BY engagement_code NULLS LAST, engagement_id), '[]'::jsonb) AS items
    FROM current_week_engagements_union
  ),

  -- ── Cumplimiento de timesheets: 12 semanas totales, 9 anteriores + actual + 2 futuras
  -- (decisiones.md §13, offset -9..2). Máquina de estados exacta de plan_v2.md §4.2. ───────
  compliance_base AS (
    SELECT gs AS week_offset,
           (v_week_start + (gs * 7)) AS week_start,
           (v_week_start + (gs * 7) + 6) AS week_end
    FROM generate_series(-9, 2) gs
  ),
  compliance_period AS (
    -- review.md iteración 3, G-01: deadline derivado (week_end + retro_days), no
    -- tp.deadline (columna real pero nunca poblada por el flujo de carga de horas).
    SELECT cb.week_offset, tp.period_id, tp.submitted_at,
           cb.week_end + (SELECT retro_days FROM retro_days_ctx) AS deadline
    FROM compliance_base cb
    LEFT JOIN public.timesheet_periods tp
      ON tp.staff_id = v_staff_id AND tp.week_start_date = cb.week_start
  ),
  compliance_saved AS (
    SELECT cb.week_offset, COALESCE(SUM(te.hours_logged), 0) AS saved_hours
    FROM compliance_base cb
    LEFT JOIN public.time_entries te
      ON te.staff_id = v_staff_id AND te.is_forecast = false
     AND te.date_worked BETWEEN cb.week_start AND cb.week_end
    GROUP BY cb.week_offset
  ),
  compliance_approved AS (
    SELECT cp.week_offset, COALESCE(SUM(te.hours_logged), 0) AS approved_hours
    FROM compliance_period cp
    LEFT JOIN public.time_entries te
      ON te.period_id = cp.period_id AND te.is_forecast = false
     AND EXISTS (
        SELECT 1 FROM public.timesheet_line_approvals tla
        WHERE tla.period_id = te.period_id AND tla.engagement_id = te.engagement_id
          AND tla.activity_id = te.activity_id AND tla.status = 'approved'
      )
    WHERE cp.period_id IS NOT NULL
    GROUP BY cp.week_offset
  ),
  compliance_approval_flags AS (
    SELECT cp.week_offset,
      bool_or(tla.status = 'rejected') AS has_rejected,
      COUNT(tla.approval_id) AS approval_count,
      bool_and(tla.status = 'approved') AS all_approved
    FROM compliance_period cp
    LEFT JOIN public.timesheet_line_approvals tla ON tla.period_id = cp.period_id
    WHERE cp.period_id IS NOT NULL
    GROUP BY cp.week_offset
  ),
  -- Toda review_notes no vacía viaja con su estado real, incluida una línea que volvió a
  -- 'pending' por useRequestRevision -- decisiones.md §4/plan_v2.md §4.2 R-4: nunca se
  -- etiqueta "Observado", la etiqueta sigue siendo la del estado real de la línea.
  compliance_review_notes AS (
    SELECT cp.week_offset,
      COALESCE(jsonb_agg(jsonb_build_object(
        'approval_id', tla.approval_id,
        'approval_status', tla.status,
        'engagement_id', tla.engagement_id,
        'engagement_code', e.engagement_code,
        'engagement_name', e.engagement_name,
        'activity_id', tla.activity_id,
        'activity_code', ac.activity_code,
        'notes', tla.review_notes
      ) ORDER BY tla.updated_at DESC NULLS LAST, tla.approval_id)
        FILTER (WHERE tla.review_notes IS NOT NULL AND tla.review_notes <> ''), '[]'::jsonb) AS items
    FROM compliance_period cp
    LEFT JOIN public.timesheet_line_approvals tla ON tla.period_id = cp.period_id
    LEFT JOIN public.engagements e ON e.engagement_id = tla.engagement_id
    LEFT JOIN public.activity_codes ac ON ac.activity_id = tla.activity_id
    WHERE cp.period_id IS NOT NULL
    GROUP BY cp.week_offset
  ),
  compliance_rows AS (
    SELECT
      cb.week_offset, cb.week_start, cb.week_end,
      cp.period_id, cp.deadline, cp.submitted_at,
      COALESCE(cs.saved_hours, 0) AS saved_hours,
      COALESCE(ca.approved_hours, 0) AS approved_hours,
      COALESCE(crn.items, '[]'::jsonb) AS review_notes,
      CASE
        WHEN cb.week_start > v_week_start THEN 'FUTURE'
        WHEN cp.period_id IS NULL AND COALESCE(cs.saved_hours, 0) = 0 THEN 'NOT_LOGGED'
        WHEN cp.period_id IS NULL AND COALESCE(cs.saved_hours, 0) > 0 THEN 'NOT_SUBMITTED'
        WHEN cp.period_id IS NOT NULL AND cp.submitted_at IS NULL THEN 'DRAFT'
        WHEN cp.period_id IS NOT NULL AND cp.submitted_at IS NOT NULL
             AND COALESCE(caf.has_rejected, false) THEN 'REJECTED'
        WHEN cp.period_id IS NOT NULL AND cp.submitted_at IS NOT NULL
             AND COALESCE(caf.approval_count, 0) > 0 AND COALESCE(caf.all_approved, false) THEN 'APPROVED'
        ELSE 'PENDING'
      END AS status
    FROM compliance_base cb
    LEFT JOIN compliance_period cp ON cp.week_offset = cb.week_offset
    LEFT JOIN compliance_saved cs ON cs.week_offset = cb.week_offset
    LEFT JOIN compliance_approved ca ON ca.week_offset = cb.week_offset
    LEFT JOIN compliance_approval_flags caf ON caf.week_offset = cb.week_offset
    LEFT JOIN compliance_review_notes crn ON crn.week_offset = cb.week_offset
  ),
  compliance_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'week_start', week_start, 'week_end', week_end, 'status', status,
      'saved_hours', saved_hours, 'approved_hours', approved_hours,
      'period_id', period_id, 'deadline', deadline, 'submitted_at', submitted_at,
      'review_notes', review_notes
    ) ORDER BY week_offset), '[]'::jsonb) AS items
    FROM compliance_rows
  ),

  -- ── Fondos y gastos: solicitudes propias, excluidas 'cerrado'/'cancelado' (decisiones.md
  -- §3.3). Cada importe se agrupa por SU PROPIA moneda de fuente -- solicitud/desembolso por
  -- fund_requests.currency, gastos por fund_request_expenses.currency -- nunca se suman BOB
  -- y USD (decisiones.md §4/plan_v2.md §4.3). No se toca ningún trigger de moneda. ─────────
  fund_requests_scope AS (
    SELECT fr.*
    FROM public.fund_requests fr
    WHERE fr.requester_staff_id = v_staff_id
      AND fr.status NOT IN ('cerrado', 'cancelado')
  ),
  fr_currencies AS (
    SELECT frs.fund_request_id, frs.currency AS c FROM fund_requests_scope frs
    UNION
    SELECT fre.fund_request_id, fre.currency
    FROM public.fund_request_expenses fre
    JOIN fund_requests_scope frs2 ON frs2.fund_request_id = fre.fund_request_id
  ),
  fr_amounts AS (
    SELECT
      fc.fund_request_id, fc.c AS currency,
      CASE WHEN frs.currency = fc.c THEN frs.total_requested_amount ELSE 0 END AS requested_amount,
      CASE WHEN frs.currency = fc.c THEN frs.total_disbursed_amount ELSE 0 END AS disbursed_amount,
      COALESCE((SELECT SUM(fre.amount) FROM public.fund_request_expenses fre
         WHERE fre.fund_request_id = fc.fund_request_id AND fre.currency = fc.c), 0) AS expenses_loaded_amount,
      COALESCE((SELECT SUM(fre.amount) FROM public.fund_request_expenses fre
         WHERE fre.fund_request_id = fc.fund_request_id AND fre.currency = fc.c
           AND fre.status IN ('aprobado_gerente', 'revisado_asistente')), 0) AS manager_approved_amount,
      COALESCE((SELECT SUM(fre.amount) FROM public.fund_request_expenses fre
         WHERE fre.fund_request_id = fc.fund_request_id AND fre.currency = fc.c
           AND fre.status = 'revisado_asistente'), 0) AS accounting_reviewed_amount
    FROM fr_currencies fc
    JOIN fund_requests_scope frs ON frs.fund_request_id = fc.fund_request_id
  ),
  fr_amounts_json AS (
    SELECT fund_request_id,
      jsonb_agg(jsonb_build_object(
        'currency', currency, 'requested_amount', requested_amount, 'disbursed_amount', disbursed_amount,
        'expenses_loaded_amount', expenses_loaded_amount, 'manager_approved_amount', manager_approved_amount,
        'accounting_reviewed_amount', accounting_reviewed_amount
      ) ORDER BY currency) AS items
    FROM fr_amounts
    GROUP BY fund_request_id
  ),
  fr_expenses_json AS (
    SELECT fund_request_id,
      COALESCE(jsonb_agg(jsonb_build_object(
        'expense_id', fre_id, 'expense_date', expense_date, 'description', description,
        'status', status, 'currency', currency, 'amount', amount,
        -- review.md Iteración 2, MUST FIX R2.1: attachment_url no tiene CHECK contra
        -- cadena vacía; checklist_verificacion.md PT-36 define "sin respaldo" como
        -- attachment_url vacío, no solo NULL.
        'has_attachment', (NULLIF(btrim(attachment_url), '') IS NOT NULL),
        'has_invoice_observation', has_invoice_observation,
        'invoice_observation_notes', invoice_observation_notes,
        'returned_by_assistant', returned_by_assistant,
        'manager_notes', manager_notes,
        'rejection_reason', rejection_reason
      ) ORDER BY expense_date DESC, fre_id), '[]'::jsonb) AS items
    FROM public.fund_request_expenses
    WHERE fund_request_id IN (SELECT fund_request_id FROM fund_requests_scope)
    GROUP BY fund_request_id
  ),
  fund_requests_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fund_request_id', frs.fund_request_id,
      'request_number', frs.request_number,
      'purpose', frs.purpose,
      'status', frs.status,
      'request_currency', frs.currency,
      'due_back_date', frs.due_back_date,
      'amounts_by_currency', COALESCE(faj.items, '[]'::jsonb),
      'expenses', COALESCE(fej.items, '[]'::jsonb)
    ) ORDER BY COALESCE(frs.submitted_at, frs.created_at) DESC, frs.fund_request_id), '[]'::jsonb) AS items
    FROM fund_requests_scope frs
    LEFT JOIN fr_amounts_json faj ON faj.fund_request_id = frs.fund_request_id
    LEFT JOIN fr_expenses_json fej ON fej.fund_request_id = frs.fund_request_id
  ),

  -- ── Histórico: SOLO horas guardadas por los parámetros del selector global -- no
  -- reconstruye asignaciones históricas (decisiones.md §16/plan_v2.md §3.3). ──────────────
  historical_saved AS (
    SELECT COALESCE(SUM(te.hours_logged), 0) AS saved_hours
    FROM public.time_entries te
    WHERE te.staff_id = v_staff_id AND te.is_forecast = false
      AND te.date_worked BETWEEN p_history_start AND p_history_end
  ),
  historical_by_engagement AS (
    SELECT te.engagement_id, e.engagement_code, e.engagement_name, e.funcion AS function_code,
      SUM(te.hours_logged) AS saved_hours
    FROM public.time_entries te
    JOIN public.engagements e ON e.engagement_id = te.engagement_id
    WHERE te.staff_id = v_staff_id AND te.is_forecast = false
      AND te.date_worked BETWEEN p_history_start AND p_history_end
    GROUP BY te.engagement_id, e.engagement_code, e.engagement_name, e.funcion
  ),
  historical_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'engagement_id', engagement_id, 'engagement_code', engagement_code,
      'engagement_name', engagement_name, 'function_code', function_code,
      'saved_hours', saved_hours
    ) ORDER BY saved_hours DESC, engagement_code NULLS LAST), '[]'::jsonb) AS items
    FROM historical_by_engagement
  )

  -- ── Ensamblado final (plan_v2.md §3.2: forma exacta del payload) ────────────────────────
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'has_staff_record', true,
      'today', v_today,
      'current_week_start', v_week_start,
      'operational_end', v_operational_end,
      'history_start', p_history_start,
      'history_end', p_history_end,
      'generated_at', now()
    ),
    'current_week', jsonb_build_object(
      'planned_hours', cws.planned_hours,
      'saved_hours', cws.saved_hours,
      'forecast_hours', cws.forecast_hours,
      'approved_hours', cws.approved_hours
    ),
    'workload_weeks', wwj.items,
    'assignments', aj.items,
    'current_week_engagements', cwej.items,
    'compliance_weeks', cj.items,
    'fund_requests', frj.items,
    'historical', jsonb_build_object(
      'saved_hours', hs.saved_hours,
      'by_engagement', hbe.items
    )
  )
  FROM current_week_summary cws
  CROSS JOIN workload_weeks_json wwj
  CROSS JOIN assignments_json aj
  CROSS JOIN current_week_engagements_json cwej
  CROSS JOIN compliance_json cj
  CROSS JOIN fund_requests_json frj
  CROSS JOIN historical_saved hs
  CROSS JOIN historical_json hbe
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


--
-- Name: FUNCTION personal_overview(p_history_start date, p_history_end date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.personal_overview(p_history_start date, p_history_end date) IS 'dash_personal (decisiones.md, plan_v2.md §3/§6): vista propia operativa e histórica de la pestaña Personal en un único payload/round-trip. staff_id SIEMPRE derivado de get_my_staff_id() -- la función no acepta un identificador de empleado y no crea ni depende de ninguna policy nueva de autovisualización sobre engagement_assignments. Sin ficha de personal -> has_staff_record=false, sin excepción. Horas planificadas = hours_per_week completo por cada asignación propia (no eliminada, no CANCELLED) que solape inclusivamente la ventana operativa (semana actual + 3 siguientes) -- sin prorrateo. Horas guardadas = time_entries.is_forecast=false, independientes del estado de envío/aprobación. Pronóstico (is_forecast=true) se devuelve SOLO en current_week.forecast_hours, exclusivamente semana actual -- nunca cuenta como guardada, aprobada, de cumplimiento ni histórica. compliance_weeks: 12 semanas exactas (9 anteriores + actual + 2 futuras), máquina de estados de plan_v2.md §4.2 (REJECTED prevalece sobre APPROVED/PENDING; una semana enviada sin aprobaciones nunca es APPROVED); toda review_notes no vacía viaja con su estado real, incluida una línea vuelta a pending por revisión solicitada -- nunca se inventa un estado Observado. Fondos: aprobado_gerente se deja tal cual (el frontend lo presenta como Pendiente de contabilidad); cada importe se agrupa por su propia moneda de fuente (solicitud/desembolso por fund_requests.currency, gastos por fund_request_expenses.currency) -- nunca se suman BOB y USD, y no se toca fre_validate_wo_in_request()/fund_requests_enforce_bob(). Excluye solicitudes cerrado/cancelado. historical solo trae horas guardadas para los parámetros p_history_start/p_history_end -- no reconstruye asignaciones históricas.';


--
-- Name: portfolio_events_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.portfolio_events_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'portfolio_events es append-only';
END;
$$;


--
-- Name: portfolio_overview(date, date, integer, date, date, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.portfolio_overview(p_start date, p_end date, p_fiscal_year integer, p_fy_start date, p_fy_end date, p_client_id uuid DEFAULT NULL::uuid, p_practica_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: no session';
  END IF;
  IF NOT public.has_permission('dashboard.portfolio.read') THEN
    RAISE EXCEPTION 'FORBIDDEN: dashboard.portfolio.read';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;
  IF p_fy_start IS NULL OR p_fy_end IS NULL OR p_fy_start > p_fy_end THEN
    RAISE EXCEPTION 'INVALID_FISCAL_RANGE';
  END IF;
  IF p_fiscal_year IS NULL OR p_fiscal_year < 2000 OR p_fiscal_year > 2100 THEN
    RAISE EXCEPTION 'INVALID_FISCAL_YEAR';
  END IF;

  v_result := (
  WITH
  -- ── 1. Llamante ──────────────────────────────────────────────────────────────────────
  caller AS (
    SELECT public.get_my_staff_id() AS staff_id,
           public.current_role_key() AS role_key
  ),
  -- ── 1b. Práctica del llamante (subtítulo de la Cascada, §5.4 de decisiones) ─────────
  caller_staff AS (
    SELECT s.staff_id AS resolved_staff_id, s.practica_id, pr.name AS practica_name
    FROM caller c
    LEFT JOIN public.staff s ON s.staff_id = c.staff_id
    LEFT JOIN public.practicas pr ON pr.practica_id = s.practica_id
  ),
  -- ── 1c. Categoría del llamante -- KPI 3 (decisión del operador 2026-09-20) ──────────
  -- Antes el KPI 3 era "Horas como Gerente" fijo: presupuesto de las categorías con
  -- default_role_key='manager' sobre los encargos donde el llamante es manager_id. Para un
  -- socio daba 0/0 SIEMPRE, por construcción (nunca es manager_id) -- reportado en vivo por
  -- el operador. Ahora el KPI se adapta a la categoría de la ficha de quien mira: el título
  -- lo pone role_label y el cálculo lo dirige role_key.
  -- LEFT JOIN en toda la cadena: este CTE DEBE devolver exactamente 1 fila (va en un CROSS
  -- JOIN del ensamblado final; 0 filas anularían el payload entero).
  caller_category AS (
    SELECT cat.category_name AS role_label, cat.default_role_key AS role_key
    FROM caller c
    LEFT JOIN public.staff s ON s.staff_id = c.staff_id
    LEFT JOIN public.categories cat ON cat.category_id = s.category_id
  ),
  now_ctx AS (
    SELECT ((now() AT TIME ZONE 'America/La_Paz')::date) AS today
  ),
  retro_days_ctx AS (
    SELECT COALESCE(
      (SELECT setting_value::int FROM public.global_settings WHERE setting_key = 'TS_EMPLOYEE_RETRO_DAYS'),
      30
    ) AS retro_days
  ),
  default_rate AS (
    SELECT public.latest_exchange_rate() AS rate
  ),
  milestone_window AS (
    SELECT
      (date_trunc('month', (SELECT today FROM now_ctx)) - interval '1 month')::date AS win_start,
      (date_trunc('month', (SELECT today FROM now_ctx)) + interval '2 months' - interval '1 day')::date AS win_end
  ),

  -- ── 2. Estado efectivo por encargo (★ dash_socio :199-214, + columnas de Cartera) ──────
  eng_state AS (
    SELECT
      e.engagement_id, e.client_id, e.engagement_name, e.engagement_code::text AS engagement_code,
      e.partner_id, e.manager_id, e.sqr_id, e.society_id, e.start_date, e.end_date, e.anio_fiscal,
      e.fecha_cierre, e.funcion, e.taxonomy_id, e.created_at, e.work_order_required,
      e.engagement_state_override, e.practica,
      cl.client_legal_name,
      wo.wo_id, wo.currency, wo.season_mode, wo.tax_rate, wo.adjustment_amount,
      wo.approval_status, wo.risk_status, wo.approved_at, wo.risk_approved_at,
      public.effective_engagement_state(
        e.engagement_state_override, e.work_order_required, wo.wo_id,
        wo.approval_status, wo.risk_status, wo.approved_at
      ) AS state
    FROM public.engagements e
    JOIN public.clients cl ON cl.client_id = e.client_id
    LEFT JOIN public.work_orders wo ON wo.engagement_id = e.engagement_id
  ),

  -- ── 3. Alcance por rol (decisiones.md §2): admin/senior_partner=firma; el resto SOLO
  -- donde es partner_id o manager_id del encargo -- sin excepción por rol (a diferencia de
  -- dash_socio, acá los 8 role_key comparten el mismo predicado). El scope_key
  -- ('department' de risk_partner) NUNCA se lee -- decisiones.md §2 nota + §3.
  role_scope AS (
    SELECT es.*
    FROM eng_state es
    CROSS JOIN caller c
    WHERE
      c.role_key IN ('admin', 'senior_partner')
      OR (c.staff_id IS NOT NULL AND (es.partner_id = c.staff_id OR es.manager_id = c.staff_id))
  ),

  -- ── 4. scope_all: + estado 4/5 + funcion=1 (Cliente). SIN filtro de fecha a nivel
  -- encargo (plan_v2.md §3.2): los bloques por periodo filtran horas/cuotas/gastos, no
  -- encargos.
  scope_all AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state IN (4, 5)
      AND rs.funcion = 1
  ),

  -- ── 5. Opciones del filtro de Cliente (desde scope_all, antes de aplicar p_client_id) ──
  filters_clients AS (
    SELECT DISTINCT sa.client_id, sa.client_legal_name FROM scope_all sa
  ),
  -- Selector de Práctica (solo tiene sentido visualmente para admin/senior_partner, cuyo
  -- alcance abarca varias prácticas a la vez -- decisiones.md §5.2 -- pero se arma para
  -- cualquier rol, es barato: catálogo fijo). Lista TODAS las prácticas activas de la
  -- firma, no derivada de scope_all -- mismo criterio "selector cerrado" que
  -- filters_societies en partner_overview() (una práctica sin encargos en cartera hoy no
  -- debe desaparecer del selector).
  filters_practicas AS (
    SELECT pr.practica_id, pr.name
    FROM public.practicas pr
    WHERE pr.is_active
  ),
  filters_agg AS (
    SELECT
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('client_id', client_id, 'client_legal_name', client_legal_name)
                           ORDER BY client_legal_name) FROM filters_clients),
        '[]'::jsonb
      ) AS clients,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('practica_id', practica_id, 'name', name)
                           ORDER BY name) FROM filters_practicas),
        '[]'::jsonb
      ) AS practicas
  ),

  -- ── 6. scope: + filtro de Cliente y Práctica del encabezado (aplicados DESPUÉS del
  -- alcance -- p_practica_id traduce el uuid del selector al code smallint que guarda
  -- engagements.practica; un encargo sin práctica asignada (NULL) queda afuera de
  -- cualquier filtro específico, nunca de "Todas") ────────────────────────────────────
  scope AS (
    SELECT sa.*
    FROM scope_all sa
    WHERE (p_client_id IS NULL OR sa.client_id = p_client_id)
      AND (p_practica_id IS NULL OR sa.practica = (SELECT code FROM public.practicas WHERE practica_id = p_practica_id))
  ),

  -- ── 7. scope_fy / scope_fy_prev / manager_scope_fy ──────────────────────────────────
  scope_fy AS (
    SELECT s.* FROM scope s WHERE s.anio_fiscal = p_fiscal_year
  ),
  scope_fy_prev AS (
    SELECT s.* FROM scope s WHERE s.anio_fiscal = p_fiscal_year - 1
  ),
  -- Solo KPI 3 (personal, "como <mi categoría>"). KPI 4 usa scope_fy completo (D-2).
  -- 2026-09-20: el conjunto ya no es fijo "donde soy manager_id" -- depende del rol que mi
  -- categoría implica. engagements solo tiene columna estructural para partner/manager/sqr;
  -- cualquier otra categoría (Director, Senior, Asistente, especialistas...) o una sin
  -- default_role_key poblado cae al ELSE: los encargos donde ocupo CUALQUIER rol estructural.
  -- No se cae a "toda la cartera" a propósito -- para un admin firm-wide eso compararía sus
  -- horas personales contra el presupuesto de toda la firma.
  my_role_scope_fy AS (
    SELECT sf.*
    FROM scope_fy sf
    CROSS JOIN caller c
    CROSS JOIN caller_category cc
    WHERE c.staff_id IS NOT NULL
      AND CASE cc.role_key
            WHEN 'partner' THEN sf.partner_id = c.staff_id
            WHEN 'manager' THEN sf.manager_id = c.staff_id
            WHEN 'sqr'     THEN sf.sqr_id = c.staff_id
            ELSE (sf.partner_id = c.staff_id OR sf.manager_id = c.staff_id OR sf.sqr_id = c.staff_id)
          END
  ),

  -- ── 7b. pending_wo_scope: KPI 5 -- TODOS los estados (una OT pendiente no puede estar
  -- en cartera 4/5), pero SÍ funcion=1 y filtro de Cliente.
  pending_wo_scope AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.funcion = 1
      AND (p_client_id IS NULL OR rs.client_id = p_client_id)
      AND (p_practica_id IS NULL OR rs.practica = (SELECT code FROM public.practicas WHERE practica_id = p_practica_id))
  ),

  -- ── 8. wo: OT Approved por encargo de scope -- honorario, gastos, TC, base con IVA ────
  wo_raw AS (
    SELECT
      s.engagement_id, s.wo_id, s.currency, s.season_mode,
      COALESCE(s.tax_rate, 0.13) AS tax_rate,
      COALESCE(s.adjustment_amount, 0) AS adjustment_amount,
      s.approval_status,
      COALESCE(bl.fee, 0) AS total_standard_fee,
      COALESCE(eb.amt, 0) AS expense_budget,
      p.plan_id, p.exchange_rate AS plan_exchange_rate
    FROM scope s
    LEFT JOIN LATERAL (
      SELECT SUM(bl.budgeted_hours * bl.standard_rate) AS fee
      FROM public.wo_budget_lines bl
      WHERE bl.wo_id = s.wo_id AND s.approval_status = 'Approved'
    ) bl ON true
    LEFT JOIN LATERAL (
      SELECT SUM(eb.budgeted_amount) AS amt
      FROM public.wo_expense_budget eb
      WHERE eb.wo_id = s.wo_id AND s.approval_status = 'Approved'
    ) eb ON true
    LEFT JOIN public.wo_payment_plan p ON p.wo_id = s.wo_id
  ),
  wo_rate AS (
    SELECT
      w.*,
      (w.total_standard_fee + w.adjustment_amount) AS fee_net,
      CASE
        WHEN w.currency = 'BOB' THEN 1
        WHEN w.plan_exchange_rate IS NOT NULL THEN w.plan_exchange_rate
        WHEN w.currency = 'USD' THEN (SELECT rate FROM default_rate)
        ELSE NULL
      END AS rate_to_bob
    FROM wo_raw w
  ),
  wo AS (
    SELECT
      w.*,
      (w.fee_net + w.expense_budget) / NULLIF(1 - w.tax_rate, 0) AS installment_base
    FROM wo_rate w
  ),

  -- ── 9. budget_lines: horas presupuestadas por encargo y categoría (OT Approved) ───────
  budget_lines AS (
    SELECT
      s.engagement_id, cat.category_id, cat.category_name, cat.default_role_key, cat.display_order,
      SUM(bl.budgeted_hours) AS hours
    FROM scope s
    JOIN public.wo_budget_lines bl ON bl.wo_id = s.wo_id AND s.approval_status = 'Approved'
    JOIN public.categories cat ON cat.category_id = bl.category_id
    GROUP BY s.engagement_id, cat.category_id, cat.category_name, cat.default_role_key, cat.display_order
  ),

  -- ── 10. hours: UN solo scan de time_entries para scope (obs. de rendimiento) ─────────
  -- Conserva activity_id en el join con timesheet_line_approvals -- no repite horas de un
  -- mismo (period_id, engagement_id) en varias actividades (plan_v2.md §3.3).
  --
  -- BUG 2026-09-20 (categorías duplicadas -- confirmado con datos reales del operador):
  -- `staff.category_id` está atado por FK compuesto a la práctica DE LA PERSONA
  -- (staff_practica_category_fk, cero_04:841), mientras que `wo_budget_lines.category_id`
  -- trae la categoría de la práctica DEL ENCARGO. Cada práctica siembra su propia fila
  -- 'Socio'/'Gerente'/... (cero_11: 7 'Socio' distintos; UNIQUE (practica_id, category_name)
  -- garantiza que no haya dos dentro de una misma práctica), así que un socio de Compliance
  -- que carga horas en un encargo de Auditoría producía DOS barras 'Socio': una
  -- solo-presupuesto (la de AUD) y otra solo-ejecutado (la de COM). Medido en Test: 40h de
  -- un socio COM sobre encargos AUD y 40h de un socio AUD sobre un encargo COM -- trabajo
  -- cruzado entre prácticas, normal en la firma, no un dato mal cargado (las líneas de
  -- presupuesto sí respetan la práctica del encargo en los 2 casos reales).
  --
  -- exec_category_id re-mapea la hora a la categoría homónima de la práctica DEL ENCARGO,
  -- que es contra cuyo presupuesto se la está comparando. Si esa práctica no tiene homónima
  -- (o el encargo no tiene práctica, o la persona no tiene categoría) cae a la categoría
  -- propia y la fila aparece igual: NUNCA se descarta una hora. La comparación de nombres
  -- ignora mayúsculas y separadores ('Semi-Senior' de AUD == 'Semi Senior' del resto del
  -- catálogo, cero_11), con el match exacto primero para que sea determinista.
  hours AS (
    SELECT
      s.engagement_id, te.activity_id, te.staff_id,
      COALESCE(engcat.category_id, st.category_id) AS exec_category_id,
      CASE WHEN tla.status = 'approved' THEN 'approved'
           WHEN tla.status = 'rejected' THEN 'rejected'
           ELSE 'pending' END AS bucket,
      te.hours_logged, te.date_worked, te.period_id
    FROM scope s
    JOIN public.time_entries te ON te.engagement_id = s.engagement_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
    LEFT JOIN public.staff st ON st.staff_id = te.staff_id
    LEFT JOIN public.categories stcat ON stcat.category_id = st.category_id
    LEFT JOIN public.practicas engpr ON engpr.code = s.practica
    LEFT JOIN LATERAL (
      SELECT ec.category_id
      FROM public.categories ec
      WHERE ec.practica_id = engpr.practica_id
        AND regexp_replace(lower(ec.category_name), '[^a-z0-9]', '', 'g')
          = regexp_replace(lower(stcat.category_name), '[^a-z0-9]', '', 'g')
      ORDER BY (ec.category_name = stcat.category_name) DESC, ec.display_order
      LIMIT 1
    ) engcat ON true
  ),
  engagement_budget_total AS (
    SELECT engagement_id, SUM(hours) AS budget_hours FROM budget_lines GROUP BY engagement_id
  ),
  engagement_lifetime_hours AS (
    SELECT engagement_id, SUM(hours_logged) FILTER (WHERE bucket IN ('approved', 'pending')) AS lifetime_hours
    FROM hours GROUP BY engagement_id
  ),
  engagement_period_hours AS (
    SELECT
      engagement_id,
      SUM(hours_logged) FILTER (WHERE bucket = 'approved' AND date_worked BETWEEN p_start AND p_end) AS approved_hours,
      SUM(hours_logged) FILTER (WHERE bucket = 'pending' AND date_worked BETWEEN p_start AND p_end) AS pending_hours
    FROM hours GROUP BY engagement_id
  ),

  -- ── 11. KPI 1: Encargos (scope_fy) ───────────────────────────────────────────────────
  kpi_engagements AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE state = 4) AS approved,
      COUNT(*) FILTER (WHERE state = 5) AS emergency
    FROM scope_fy
  ),

  -- ── 12. KPI 2: Clientes/Servicios (scope_fy vs scope_fy_prev) ────────────────────────
  kpi_clients_services AS (
    SELECT
      (SELECT COUNT(DISTINCT sf.client_id) FROM scope_fy sf) AS clients,
      (SELECT COUNT(DISTINCT sf.taxonomy_id) FROM scope_fy sf
         JOIN public.servicios sv ON sv.taxonomy_id = sf.taxonomy_id) AS services,
      (SELECT COUNT(DISTINCT sfp.client_id) FROM scope_fy_prev sfp) AS previous_clients,
      (SELECT COUNT(DISTINCT sfp.taxonomy_id) FROM scope_fy_prev sfp
         JOIN public.servicios sv ON sv.taxonomy_id = sfp.taxonomy_id) AS previous_services
  ),

  -- ── 13. KPI 3: Horas como <mi categoría> (solo mis horas, FY completo, sin scheduler) ─
  -- D-1 se conserva como mecanismo, pero generalizado: el presupuesto son las líneas cuya
  -- categoría comparte MI default_role_key -- para un gerente eso sigue cubriendo 'Gerente'
  -- y 'Gerente/Asociado Senior' (LEG) y excluyendo los especialistas, exactamente como
  -- antes; para un socio son todas las variantes 'Socio' del catálogo. El match por role_key
  -- también cruza prácticas gratis (el 'Socio' de cada práctica comparte role_key).
  -- Respaldo por NOMBRE cuando mi categoría no tiene default_role_key: el backfill de
  -- 20260825000100 deja la columna NULL si el default_app_role mapea a más de un role_key,
  -- y sin este respaldo el KPI volvería a 0/0 justo para las categorías no mapeadas.
  kpi_role_budget AS (
    SELECT COALESCE(SUM(bl.hours), 0) AS budget
    FROM my_role_scope_fy msf
    JOIN budget_lines bl ON bl.engagement_id = msf.engagement_id
    CROSS JOIN caller_category cc
    WHERE CASE
            WHEN cc.role_key IS NOT NULL THEN bl.default_role_key = cc.role_key
            ELSE regexp_replace(lower(bl.category_name), '[^a-z0-9]', '', 'g')
               = regexp_replace(lower(cc.role_label), '[^a-z0-9]', '', 'g')
          END
  ),
  kpi_role_exec AS (
    SELECT
      COALESCE(SUM(h.hours_logged) FILTER (WHERE h.bucket = 'approved'), 0) AS approved,
      COALESCE(SUM(h.hours_logged) FILTER (WHERE h.bucket = 'pending'), 0) AS pending
    FROM hours h
    CROSS JOIN caller c
    WHERE h.staff_id = c.staff_id
      AND h.date_worked BETWEEN p_fy_start AND p_fy_end
      AND h.engagement_id IN (SELECT engagement_id FROM my_role_scope_fy)
  ),

  -- ── 14. KPI 4: Avance de cartera (D-2: scope_fy completo -- socio O gerente; todo el
  -- equipo, FY completo). Coincide con activities.total_budget_hours cuando el periodo
  -- visible cubre el FY completo (§5.3 de decisiones).
  kpi_portfolio_budget AS (
    SELECT COALESCE(SUM(bl.hours), 0) AS budget
    FROM scope_fy sf
    JOIN budget_lines bl ON bl.engagement_id = sf.engagement_id
  ),
  kpi_portfolio_exec AS (
    SELECT
      COALESCE(SUM(h.hours_logged) FILTER (WHERE h.bucket = 'approved'), 0) AS approved,
      COALESCE(SUM(h.hours_logged) FILTER (WHERE h.bucket = 'pending'), 0) AS pending
    FROM hours h
    WHERE h.date_worked BETWEEN p_fy_start AND p_fy_end
      AND h.engagement_id IN (SELECT engagement_id FROM scope_fy)
  ),

  -- ── 15. KPI 5: Revisión -- sobregirados (vida completa) · OT por aprobar · Riesgo
  -- pendiente (risk_status='Pending' AND approval_status='Pending_Approval', decisiones.md
  -- §4.2 -- un borrador Draft+Pending NO cuenta) ──────────────────────────────────────
  kpi_review AS (
    SELECT
      (SELECT COUNT(*) FROM scope s
         WHERE COALESCE((SELECT lifetime_hours FROM engagement_lifetime_hours elh WHERE elh.engagement_id = s.engagement_id), 0)
             > COALESCE((SELECT budget_hours FROM engagement_budget_total ebt WHERE ebt.engagement_id = s.engagement_id), 0)
      ) AS over_budget_count,
      (SELECT COUNT(*) FROM pending_wo_scope WHERE approval_status = 'Pending_Approval') AS pending_wo_count,
      (SELECT COUNT(*) FROM pending_wo_scope
         WHERE risk_status = 'Pending' AND approval_status = 'Pending_Approval') AS pending_risk_count
  ),

  -- ── 16. Cascada de Actividades: última worksheet approved por encargo (sin doble
  -- conteo, R2) ─────────────────────────────────────────────────────────────────────────
  worksheet_latest AS (
    SELECT DISTINCT ON (aw.engagement_id) aw.id AS worksheet_id, aw.engagement_id
    FROM public.activity_worksheets aw
    WHERE aw.engagement_id IN (SELECT engagement_id FROM scope) AND aw.status = 'approved'
    ORDER BY aw.engagement_id, aw.version DESC, aw.updated_at DESC, aw.id DESC
  ),
  activity_budget AS (
    SELECT c.activity_id, SUM(c.budget_hours) AS budget_hours
    FROM worksheet_latest wl
    JOIN public.activity_worksheet_cells c ON c.worksheet_id = wl.worksheet_id
    GROUP BY c.activity_id
  ),
  activity_exec AS (
    SELECT
      h.activity_id,
      SUM(h.hours_logged) FILTER (WHERE h.bucket = 'approved') AS approved_hours,
      SUM(h.hours_logged) FILTER (WHERE h.bucket = 'pending') AS pending_hours
    FROM hours h
    WHERE h.activity_id IS NOT NULL AND h.date_worked BETWEEN p_start AND p_end
    GROUP BY h.activity_id
  ),
  activities_joined AS (
    SELECT
      COALESCE(ab.activity_id, ae.activity_id) AS activity_id,
      COALESCE(ab.budget_hours, 0) AS budget_hours,
      COALESCE(ae.approved_hours, 0) AS approved_hours,
      COALESCE(ae.pending_hours, 0) AS pending_hours
    FROM activity_budget ab
    FULL OUTER JOIN activity_exec ae ON ae.activity_id = ab.activity_id
  ),
  activities_rows AS (
    SELECT aj.activity_id, ac.activity_code, ac.description, aj.budget_hours, aj.approved_hours, aj.pending_hours
    FROM activities_joined aj
    JOIN public.activity_codes ac ON ac.activity_id = aj.activity_id
  ),
  activities_total AS (
    SELECT COALESCE(SUM(budget_hours), 0) AS total_budget_hours FROM activities_rows
  ),
  activities_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'activity_id', activity_id, 'activity_code', activity_code, 'description', description,
      'budget_hours', budget_hours, 'approved_hours', approved_hours, 'pending_hours', pending_hours
    ) ORDER BY budget_hours DESC, description), '[]'::jsonb) AS items
    FROM activities_rows
  ),

  -- ── 17-18. Horas por categoría (sin acumulado, sin matriz -- directo de wo_budget_lines) ──
  category_budget AS (
    SELECT category_id, category_name, display_order, SUM(hours) AS budget_hours
    FROM budget_lines
    GROUP BY category_id, category_name, display_order
  ),
  -- Agrupa por hours.exec_category_id (categoría de la práctica DEL ENCARGO, ver el
  -- comentario largo del CTE `hours`), NO por staff.category_id -- si no, una misma
  -- categoría aparece dos veces cuando alguien de otra práctica trabaja el encargo.
  -- Tampoco se filtra por p_practica_id acá: ese filtro descartaba las horas cruzadas en
  -- silencio (el total ejecutado dejaba de cuadrar con Horas por encargo).
  category_exec AS (
    SELECT
      h.exec_category_id AS category_id,
      SUM(h.hours_logged) FILTER (WHERE h.bucket = 'approved' AND h.date_worked BETWEEN p_start AND p_end) AS approved_hours,
      SUM(h.hours_logged) FILTER (WHERE h.bucket = 'pending' AND h.date_worked BETWEEN p_start AND p_end) AS pending_hours
    FROM hours h
    GROUP BY h.exec_category_id
  ),
  categories_joined AS (
    SELECT
      COALESCE(cb.category_id, ce.category_id) AS category_id,
      cb.category_name AS cb_category_name,
      cb.display_order AS cb_display_order,
      COALESCE(cb.budget_hours, 0) AS budget_hours,
      COALESCE(ce.approved_hours, 0) AS approved_hours,
      COALESCE(ce.pending_hours, 0) AS pending_hours
    FROM category_budget cb
    FULL OUTER JOIN category_exec ce ON ce.category_id = cb.category_id
  ),
  -- practica_abbr (2026-09-20): con el re-mapeo de arriba ya no hay filas repetidas dentro
  -- de una práctica, pero en la vista "Todas" siguen conviviendo legítimamente el 'Socio' de
  -- cada práctica. La UI usa esta abreviatura para desambiguar SOLO cuando un mismo nombre
  -- aparece más de una vez -- con una práctica elegida, la etiqueta queda limpia.
  categories_rows AS (
    SELECT
      cj.category_id,
      COALESCE(cj.cb_category_name, cat.category_name) AS category_name,
      COALESCE(cj.cb_display_order, cat.display_order) AS display_order,
      pr.abbreviation AS practica_abbr,
      cj.budget_hours, cj.approved_hours, cj.pending_hours
    FROM categories_joined cj
    LEFT JOIN public.categories cat ON cat.category_id = cj.category_id
    LEFT JOIN public.practicas pr ON pr.practica_id = cat.practica_id
  ),
  categories_total AS (
    SELECT COALESCE(SUM(budget_hours), 0) AS total_budget_hours FROM categories_rows
  ),
  categories_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'category_id', category_id, 'category_name', category_name, 'display_order', display_order,
      'practica_abbr', practica_abbr,
      'budget_hours', budget_hours, 'approved_hours', approved_hours, 'pending_hours', pending_hours
    ) ORDER BY budget_hours DESC NULLS LAST), '[]'::jsonb) AS items
    FROM categories_rows
  ),

  -- ── 19. Presupuesto de personal: wo_staffing_requirements vs distintos que cargaron
  -- horas, sin filtrar por aprobación (§6.3 de decisiones) ────────────────────────────
  staffing_budget AS (
    SELECT wsr.category_id, SUM(wsr.staff_count) AS staff_count
    FROM scope s
    JOIN public.wo_staffing_requirements wsr ON wsr.wo_id = s.wo_id AND s.approval_status = 'Approved'
    GROUP BY wsr.category_id
  ),
  -- Mismo re-mapeo que category_exec (ver el comentario del CTE `hours`): la persona cuenta
  -- en la categoría homónima de la práctica del encargo que trabajó, no en la de su ficha.
  staffing_exec AS (
    SELECT h.exec_category_id AS category_id, COUNT(DISTINCT h.staff_id) AS executed
    FROM hours h
    WHERE h.date_worked BETWEEN p_start AND p_end
    GROUP BY h.exec_category_id
  ),
  staffing_joined AS (
    SELECT
      COALESCE(sb.category_id, se.category_id) AS category_id,
      sb.staff_count AS budgeted,
      COALESCE(se.executed, 0) AS executed
    FROM staffing_budget sb
    FULL OUTER JOIN staffing_exec se ON se.category_id = sb.category_id
  ),
  staffing_rows AS (
    SELECT sj.category_id, cat.category_name, pr.abbreviation AS practica_abbr, sj.budgeted, sj.executed
    FROM staffing_joined sj
    LEFT JOIN public.categories cat ON cat.category_id = sj.category_id
    LEFT JOIN public.practicas pr ON pr.practica_id = cat.practica_id
  ),
  staffing_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'category_id', category_id, 'category_name', category_name, 'practica_abbr', practica_abbr,
      'budgeted', budgeted, 'executed', executed
    ) ORDER BY budgeted DESC NULLS LAST), '[]'::jsonb) AS items
    FROM staffing_rows
  ),

  -- ── 20. Facturación: installments_full (★ dash_socio), by_status acotado al periodo
  -- por agreed_invoice_date (a diferencia de dash_socio, que no lo acota) ────────────────
  installments_full AS (
    SELECT
      i.installment_id, w.wo_id, w.engagement_id, w.plan_id,
      i.status, i.agreed_invoice_date, i.agreed_payment_date,
      i.collection_invoice_date, i.collection_payment_date, i.payment_date_actual,
      COALESCE(i.amount, i.percentage * w.installment_base / 100) AS amount_native,
      w.rate_to_bob,
      COALESCE(i.invoice_exchange_rate, w.rate_to_bob) AS invoice_rate,
      COALESCE(i.payment_exchange_rate, i.invoice_exchange_rate, w.rate_to_bob) AS payment_rate
    FROM wo w
    JOIN public.wo_payment_installments i ON i.wo_id = w.wo_id
  ),
  collections_by_status AS (
    SELECT jsonb_build_object(
      'collected', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status = 'Completed' AND inst.agreed_invoice_date BETWEEN p_start AND p_end),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.payment_rate) FILTER (
          WHERE inst.status = 'Completed' AND inst.agreed_invoice_date BETWEEN p_start AND p_end), 0)),
      'invoiced', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE inst.status IN ('Invoiced', 'Overdue') AND inst.agreed_invoice_date BETWEEN p_start AND p_end),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.invoice_rate) FILTER (
          WHERE inst.status IN ('Invoiced', 'Overdue') AND inst.agreed_invoice_date BETWEEN p_start AND p_end), 0)),
      'in_arrears', jsonb_build_object(
        'count', COUNT(*) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date < (SELECT today FROM now_ctx)
            AND inst.agreed_invoice_date BETWEEN p_start AND p_end),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.rate_to_bob) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date < (SELECT today FROM now_ctx)
            AND inst.agreed_invoice_date BETWEEN p_start AND p_end), 0)),
      'upcoming', jsonb_build_object(
        'count', COUNT(*) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date >= (SELECT today FROM now_ctx)
            AND inst.agreed_invoice_date BETWEEN p_start AND p_end),
        'amount_bob', COALESCE(SUM(inst.amount_native * inst.rate_to_bob) FILTER (
          WHERE inst.status = 'Pending' AND inst.agreed_invoice_date >= (SELECT today FROM now_ctx)
            AND inst.agreed_invoice_date BETWEEN p_start AND p_end), 0))
    ) AS by_status
    FROM installments_full inst
  ),
  collections_next7 AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'installment_id', inst.installment_id, 'wo_id', inst.wo_id, 'engagement_id', inst.engagement_id,
        'client_legal_name', cl.client_legal_name,
        'kind', CASE WHEN inst.status IN ('Invoiced', 'Overdue') THEN 'collect' ELSE 'invoice' END,
        'date', CASE WHEN inst.status IN ('Invoiced', 'Overdue') THEN inst.agreed_payment_date ELSE inst.agreed_invoice_date END,
        -- review.md dash_cartera iteración 4, G-01 (2026-09-22): igual que dash_socio --
        -- una cuota ya facturada (Invoiced/Overdue) se valora al TC congelado de su factura
        -- (invoice_rate), NO al TC del plan (rate_to_bob).
        'amount_bob', CASE WHEN inst.status IN ('Invoiced', 'Overdue')
                        THEN inst.amount_native * inst.invoice_rate
                        ELSE inst.amount_native * inst.rate_to_bob END
      ) ORDER BY CASE WHEN inst.status IN ('Invoiced', 'Overdue') THEN inst.agreed_payment_date ELSE inst.agreed_invoice_date END
    ), '[]'::jsonb) AS items
    FROM installments_full inst
    JOIN public.engagements e ON e.engagement_id = inst.engagement_id
    JOIN public.clients cl ON cl.client_id = e.client_id
    WHERE
      (inst.status IN ('Invoiced', 'Overdue')
        AND inst.agreed_payment_date BETWEEN (SELECT today FROM now_ctx) AND (SELECT today FROM now_ctx) + 7)
      OR
      (inst.status = 'Pending'
        AND inst.agreed_invoice_date BETWEEN (SELECT today FROM now_ctx) AND (SELECT today FROM now_ctx) + 7)
  ),
  avg_collection_days_agg AS (
    SELECT AVG(COALESCE(inst.payment_date_actual, inst.collection_payment_date) - inst.collection_invoice_date)
             FILTER (WHERE inst.status = 'Completed'
                       AND COALESCE(inst.payment_date_actual, inst.collection_payment_date) BETWEEN p_start AND p_end
             ) AS avg_days
    FROM installments_full inst
  ),

  -- ── 21. Gastos de la cartera: solo revisado_asistente = ejecutado -- decisión del
  -- operador 2026-09-18, corrige inconsistencia con partner_overview() (★ dash_socio
  -- :450-461, donde ya distinguía reviewed_bob=revisado_asistente de
  -- manager_approved_bob=aprobado_gerente "solo tooltip"): un gasto se considera "ejecutado"
  -- únicamente cuando concluye el flujo completo (Contabilidad revisa, revisado_asistente),
  -- NO cuando el gerente lo aprueba (aprobado_gerente es un paso intermedio, todavía puede
  -- ser observado/rechazado por Contabilidad). pending_count ahora incluye aprobado_gerente
  -- (sigue "pendiente" desde la óptica de Contabilidad, aunque el gerente ya lo aprobó) para
  -- que ningún gasto no rechazado/no observado desaparezca del resumen. top3 por encargo,
  -- sobregirados primero (decisiones.md §7) ──────────────────────────────────
  expenses_by_engagement AS (
    SELECT
      w.engagement_id,
      COALESCE(w.expense_budget * w.rate_to_bob, 0) AS budget_bob,
      COALESCE(SUM(fre.amount * CASE fre.currency WHEN 'BOB' THEN 1 ELSE COALESCE(w.rate_to_bob, (SELECT rate FROM default_rate)) END)
        FILTER (WHERE fre.status = 'revisado_asistente' AND fre.expense_date BETWEEN p_start AND p_end), 0) AS executed_bob,
      COUNT(*) FILTER (WHERE fre.status IN ('pendiente_aprobacion', 'aprobado_gerente')) AS pending_count,
      COUNT(*) FILTER (WHERE fre.status = 'revisado_asistente' AND fre.expense_date BETWEEN p_start AND p_end) AS approved_count
    FROM wo w
    LEFT JOIN public.fund_request_expenses fre ON fre.wo_id = w.wo_id
    GROUP BY w.engagement_id, w.expense_budget, w.rate_to_bob
  ),
  expenses_totals AS (
    SELECT
      COALESCE(SUM(budget_bob), 0) AS budget_bob,
      COALESCE(SUM(executed_bob), 0) AS executed_bob,
      COALESCE(SUM(pending_count), 0) AS pending_count,
      COALESCE(SUM(approved_count), 0) AS approved_count
    FROM expenses_by_engagement
  ),
  expenses_top3_base AS (
    SELECT
      ebe.engagement_id, s.engagement_code, s.client_legal_name,
      ebe.budget_bob, ebe.executed_bob,
      (ebe.executed_bob / NULLIF(ebe.budget_bob, 0)) * 100 AS pct
    FROM expenses_by_engagement ebe
    JOIN scope s ON s.engagement_id = ebe.engagement_id
    WHERE ebe.budget_bob > 0
  ),
  expenses_top3 AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'engagement_id', engagement_id, 'engagement_code', engagement_code, 'client_legal_name', client_legal_name,
      'budget_bob', budget_bob, 'executed_bob', executed_bob, 'pct', pct
    ) ORDER BY (pct > 100) DESC, pct DESC, executed_bob DESC), '[]'::jsonb) AS items
    FROM (
      SELECT * FROM expenses_top3_base
      ORDER BY (pct > 100) DESC, pct DESC, executed_bob DESC
      LIMIT 3
    ) t3
  ),

  -- ── 22. Cola de aprobación (enriquecida, §7.1 de decisiones): horas totales, personas
  -- distintas, antigüedad en semanas, alerta a partir de retro_days ────────────────────
  approval_queue_rows AS (
    SELECT
      tla.approval_id, tla.engagement_id, s.engagement_code, tp.week_start_date, tp.staff_id,
      COALESCE(st.short_name, TRIM(BOTH FROM (COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')))) AS staff_name,
      COALESCE(h.hours, 0) AS hours,
      ((SELECT today FROM now_ctx) - tp.week_start_date) AS days_old
    FROM public.timesheet_line_approvals tla
    JOIN scope s ON s.engagement_id = tla.engagement_id
    JOIN public.timesheet_periods tp ON tp.period_id = tla.period_id
    LEFT JOIN public.staff st ON st.staff_id = tp.staff_id
    LEFT JOIN LATERAL (
      SELECT SUM(te.hours_logged) AS hours FROM public.time_entries te
      WHERE te.period_id = tla.period_id AND te.engagement_id = tla.engagement_id AND te.activity_id = tla.activity_id
    ) h ON true
    WHERE tla.status = 'pending'
  ),
  approval_queue_derived AS (
    SELECT aqr.*,
      FLOOR(aqr.days_old / 7.0)::int AS weeks_old,
      (aqr.days_old >= (SELECT retro_days FROM retro_days_ctx)) AS alert
    FROM approval_queue_rows aqr
  ),
  approval_queue_agg AS (
    SELECT
      COALESCE(SUM(hours), 0) AS total_hours,
      COUNT(DISTINCT staff_id) AS distinct_people,
      COUNT(*) AS total_count
    FROM approval_queue_derived
  ),
  -- MF-03 (review.md iteración 1): la consolidación por persona va ANTES del LIMIT. Cuando
  -- el recorte se hacía sobre líneas crudas, una sola persona con 20 líneas pendientes
  -- agotaba el cupo y TODAS las demás desaparecían del payload -- el frontend, que agrupa
  -- después, no tenía forma de saberlo y el "+N más" tampoco las contaba. Se conserva la
  -- línea MÁS ANTIGUA de cada persona (mayor days_old), que es la que decide la alerta.
  approval_queue_per_person AS (
    SELECT DISTINCT ON (aqd.staff_id) aqd.*
    FROM approval_queue_derived aqd
    ORDER BY aqd.staff_id, aqd.days_old DESC, aqd.week_start_date ASC, aqd.approval_id
  ),
  approval_queue_items AS (
    -- staff_id viaja para que el cliente deduplique por identidad y no por nombre visible.
    -- No es PII: la aserción #22 de la suite prohíbe email / id_number / auth_user_id.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'approval_id', approval_id, 'staff_id', staff_id, 'staff_name', staff_name,
      'engagement_id', engagement_id,
      'engagement_code', engagement_code, 'week_start_date', week_start_date, 'hours', hours,
      'weeks_old', weeks_old, 'alert', alert
    ) ORDER BY week_start_date ASC), '[]'::jsonb) AS items
    FROM (SELECT * FROM approval_queue_per_person ORDER BY week_start_date ASC LIMIT 20) t
  ),

  -- ── 23. Hitos: ventana fija ±1 mes (decisiones.md §7.2); ignoran Periodo, respetan
  -- Cliente ───────────────────────────────────────────────────────────────────────────
  milestones_closing AS (
    SELECT 'closing'::text AS kind, s.fecha_cierre AS date, s.engagement_id,
           s.engagement_code, s.engagement_name, NULL::int AS weeks
    FROM scope s CROSS JOIN milestone_window mw
    WHERE s.fecha_cierre BETWEEN mw.win_start AND mw.win_end
  ),
  milestones_new_engagement AS (
    SELECT 'new_engagement'::text, s.created_at::date, s.engagement_id, s.engagement_code, s.engagement_name, NULL::int
    FROM scope s CROSS JOIN now_ctx nc
    WHERE s.created_at::date BETWEEN (nc.today - interval '1 month')::date AND nc.today
  ),
  milestones_wo_approved AS (
    SELECT 'wo_approved'::text, s.approved_at::date, s.engagement_id, s.engagement_code, s.engagement_name, NULL::int
    FROM scope s CROSS JOIN now_ctx nc
    WHERE s.approved_at IS NOT NULL AND s.approved_at::date BETWEEN (nc.today - interval '1 month')::date AND nc.today
  ),
  milestones_risk_approved AS (
    SELECT 'risk_approved'::text, s.risk_approved_at::date, s.engagement_id, s.engagement_code, s.engagement_name, NULL::int
    FROM scope s CROSS JOIN now_ctx nc
    WHERE s.risk_approved_at IS NOT NULL AND s.risk_approved_at::date BETWEEN (nc.today - interval '1 month')::date AND nc.today
  ),
  milestones_assignment AS (
    SELECT 'assignment'::text, pe.occurred_at::date, pe.engagement_id, s.engagement_code, s.engagement_name, NULL::int
    FROM public.portfolio_events pe
    JOIN scope s ON s.engagement_id = pe.engagement_id
    CROSS JOIN caller c
    CROSS JOIN now_ctx nc
    WHERE pe.subject_staff_id = c.staff_id
      AND pe.occurred_at::date BETWEEN (nc.today - interval '1 month')::date AND nc.today
  ),
  milestones_lock_deadline AS (
    SELECT 'lock_deadline'::text,
           (aqd.week_start_date + 6 + (SELECT retro_days FROM retro_days_ctx)),
           NULL::uuid, NULL::text, NULL::text, aqd.weeks_old
    FROM approval_queue_derived aqd
    CROSS JOIN milestone_window mw
    CROSS JOIN now_ctx nc
    WHERE (aqd.week_start_date + 6 + (SELECT retro_days FROM retro_days_ctx)) BETWEEN nc.today AND mw.win_end
  ),
  milestones_all AS (
    SELECT * FROM milestones_closing
    UNION ALL SELECT * FROM milestones_new_engagement
    UNION ALL SELECT * FROM milestones_wo_approved
    UNION ALL SELECT * FROM milestones_risk_approved
    UNION ALL SELECT * FROM milestones_assignment
    UNION ALL SELECT * FROM milestones_lock_deadline
  ),
  milestones_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'kind', kind, 'date', date, 'engagement_id', engagement_id, 'engagement_code', engagement_code,
      'engagement_name', engagement_name, 'weeks', weeks
    ) ORDER BY date), '[]'::jsonb) AS items
    FROM (SELECT * FROM milestones_all ORDER BY date LIMIT 40) m
  ),

  -- ── 24. Horas por encargo: tabla simple, reacciona a Cliente y Periodo ───────────────
  engagement_rows_agg AS (
    SELECT
      s.engagement_id, s.engagement_code, s.engagement_name, s.client_legal_name,
      COALESCE(ebt.budget_hours, 0) AS budget_hours,
      COALESCE(eph.approved_hours, 0) AS approved_hours,
      COALESCE(eph.pending_hours, 0) AS pending_hours,
      (COALESCE(elh.lifetime_hours, 0) > COALESCE(ebt.budget_hours, 0)) AS over_budget,
      CASE WHEN COALESCE(ebt.budget_hours, 0) > 0
           THEN (COALESCE(eph.approved_hours, 0) + COALESCE(eph.pending_hours, 0)) / ebt.budget_hours
           ELSE 0 END AS consumption_ratio
    FROM scope s
    LEFT JOIN engagement_budget_total ebt ON ebt.engagement_id = s.engagement_id
    LEFT JOIN engagement_period_hours eph ON eph.engagement_id = s.engagement_id
    LEFT JOIN engagement_lifetime_hours elh ON elh.engagement_id = s.engagement_id
  ),
  engagement_rows_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'engagement_id', engagement_id, 'engagement_code', engagement_code, 'engagement_name', engagement_name,
      'client_legal_name', client_legal_name, 'budget_hours', budget_hours, 'approved_hours', approved_hours,
      'pending_hours', pending_hours, 'over_budget', over_budget
    ) ORDER BY consumption_ratio DESC), '[]'::jsonb) AS items
    FROM (SELECT * FROM engagement_rows_agg ORDER BY consumption_ratio DESC LIMIT 200) t
  ),

  -- ── 25. Conteos de alcance (meta) ────────────────────────────────────────────────────
  scope_counts AS (
    SELECT
      (SELECT COUNT(*) FROM scope_all) AS unfiltered_scope_count,
      (SELECT COUNT(*) FROM scope) AS scope_count
  ),

  -- ── 26. Fila resumen "Encargos finalizados" (pedido del operador 2026-09-19): encargos
  -- que cerraron (estado efectivo 7) DENTRO del periodo visible ([p_start, p_end], por
  -- end_date -- mismo criterio que ya usa finalized_scope en partner_overview() para
  -- "finalizados en el periodo"), acotados a role_scope + funcion=1 + filtro de Cliente
  -- (NO por año fiscal: un encargo se cierra en una fecha real, no en un ejercicio
  -- seleccionable). budget_hours/executed_hours son de VIDA COMPLETA del encargo (para
  -- reflejar el desempeño final, no solo lo cargado durante la ventana de cierre);
  -- executed_expenses_bob usa la misma regla recién corregida en el bloque de Gastos
  -- (solo revisado_asistente = ejecutado, aprobado_gerente no cuenta).
  finalized_scope AS (
    SELECT rs.*
    FROM role_scope rs
    WHERE rs.state = 7
      AND rs.funcion = 1
      AND rs.end_date BETWEEN p_start AND p_end
      AND (p_client_id IS NULL OR rs.client_id = p_client_id)
      AND (p_practica_id IS NULL OR rs.practica = (SELECT code FROM public.practicas WHERE practica_id = p_practica_id))
  ),
  finalized_wo AS (
    SELECT
      fs.engagement_id, wo.wo_id, wo.currency,
      CASE
        WHEN wo.currency = 'BOB' THEN 1
        WHEN p.exchange_rate IS NOT NULL THEN p.exchange_rate
        WHEN wo.currency = 'USD' THEN (SELECT rate FROM default_rate)
        ELSE NULL
      END AS rate_to_bob
    FROM finalized_scope fs
    JOIN public.work_orders wo ON wo.engagement_id = fs.engagement_id AND wo.approval_status = 'Approved'
    LEFT JOIN public.wo_payment_plan p ON p.wo_id = wo.wo_id
  ),
  finalized_count AS (
    SELECT COUNT(*) AS cnt FROM finalized_scope
  ),
  finalized_budget AS (
    SELECT COALESCE(SUM(bl.budgeted_hours), 0) AS budget_hours
    FROM finalized_wo fw
    JOIN public.wo_budget_lines bl ON bl.wo_id = fw.wo_id
  ),
  finalized_hours AS (
    SELECT COALESCE(SUM(te.hours_logged), 0) AS executed_hours
    FROM finalized_scope fs
    JOIN public.time_entries te ON te.engagement_id = fs.engagement_id AND COALESCE(te.is_forecast, false) = false
    LEFT JOIN public.timesheet_line_approvals tla
      ON tla.engagement_id = te.engagement_id AND tla.period_id = te.period_id AND tla.activity_id = te.activity_id
    WHERE tla.status IS DISTINCT FROM 'rejected'
  ),
  finalized_expenses AS (
    SELECT COALESCE(SUM(
      fre.amount * CASE fre.currency WHEN 'BOB' THEN 1 ELSE COALESCE(fw.rate_to_bob, (SELECT rate FROM default_rate)) END
    ) FILTER (WHERE fre.status = 'revisado_asistente'), 0) AS executed_bob
    FROM finalized_wo fw
    JOIN public.fund_request_expenses fre ON fre.wo_id = fw.wo_id
  )

  -- ── 27. Ensamblado final (§7.3 del plan: forma exacta del payload) ───────────────────
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'role_key', c.role_key,
      'scope_kind', CASE WHEN c.role_key IN ('admin', 'senior_partner') THEN 'firm' ELSE 'own' END,
      'practica_name', cs.practica_name,
      'scope_count', sc.scope_count,
      'unfiltered_scope_count', sc.unfiltered_scope_count,
      'fiscal_year', p_fiscal_year,
      'retro_days', rd.retro_days,
      'today', nc.today
    ),
    'filters', jsonb_build_object('clients', fa.clients, 'practicas', fa.practicas),
    'kpis', jsonb_build_object(
      'engagements', jsonb_build_object('total', ke.total, 'approved', ke.approved, 'emergency', ke.emergency),
      'clients_services', jsonb_build_object(
        'clients', kcs.clients, 'services', kcs.services,
        'previous_clients', kcs.previous_clients, 'previous_services', kcs.previous_services
      ),
      'my_role_hours', jsonb_build_object(
        'role_key', cc.role_key, 'role_label', cc.role_label,
        'budget', krb.budget, 'approved', kre.approved, 'pending', kre.pending
      ),
      'portfolio_progress', jsonb_build_object('budget', kpb.budget, 'approved', kpe.approved, 'pending', kpe.pending),
      'review', jsonb_build_object(
        'over_budget_count', kr.over_budget_count, 'pending_wo_count', kr.pending_wo_count,
        'pending_risk_count', kr.pending_risk_count
      )
    ),
    'activities', jsonb_build_object('total_budget_hours', atot.total_budget_hours, 'items', aj.items),
    'categories', jsonb_build_object('total_budget_hours', ctot.total_budget_hours, 'items', cj.items),
    'staffing', stf.items,
    'collections', jsonb_build_object(
      'by_status', cbs.by_status, 'next_7_days', n7.items, 'avg_collection_days', acd.avg_days
    ),
    'expenses', jsonb_build_object(
      'budget_bob', et.budget_bob, 'executed_bob', et.executed_bob,
      'pending_count', et.pending_count, 'approved_count', et.approved_count, 'top3', et3.items
    ),
    'approval_queue', jsonb_build_object(
      'total_hours', aqa.total_hours, 'distinct_people', aqa.distinct_people,
      'total_count', aqa.total_count, 'items', aqi.items
    ),
    'milestones', mj.items,
    'engagement_rows', erj.items,
    'finalized_summary', jsonb_build_object(
      'count', fzc.cnt, 'budget_hours', fzb.budget_hours,
      'executed_hours', fzh.executed_hours, 'executed_expenses_bob', fze.executed_bob
    )
  )
  FROM caller c
  CROSS JOIN caller_staff cs
  CROSS JOIN caller_category cc
  CROSS JOIN now_ctx nc
  CROSS JOIN retro_days_ctx rd
  CROSS JOIN scope_counts sc
  CROSS JOIN filters_agg fa
  CROSS JOIN kpi_engagements ke
  CROSS JOIN kpi_clients_services kcs
  CROSS JOIN kpi_role_budget krb
  CROSS JOIN kpi_role_exec kre
  CROSS JOIN kpi_portfolio_budget kpb
  CROSS JOIN kpi_portfolio_exec kpe
  CROSS JOIN kpi_review kr
  CROSS JOIN activities_total atot
  CROSS JOIN activities_json aj
  CROSS JOIN categories_total ctot
  CROSS JOIN categories_json cj
  CROSS JOIN staffing_json stf
  CROSS JOIN collections_by_status cbs
  CROSS JOIN collections_next7 n7
  CROSS JOIN avg_collection_days_agg acd
  CROSS JOIN expenses_totals et
  CROSS JOIN expenses_top3 et3
  CROSS JOIN approval_queue_agg aqa
  CROSS JOIN approval_queue_items aqi
  CROSS JOIN milestones_json mj
  CROSS JOIN engagement_rows_json erj
  CROSS JOIN finalized_count fzc
  CROSS JOIN finalized_budget fzb
  CROSS JOIN finalized_hours fzh
  CROSS JOIN finalized_expenses fze
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


--
-- Name: FUNCTION portfolio_overview(p_start date, p_end date, p_fiscal_year integer, p_fy_start date, p_fy_end date, p_client_id uuid, p_practica_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.portfolio_overview(p_start date, p_end date, p_fiscal_year integer, p_fy_start date, p_fy_end date, p_client_id uuid, p_practica_id uuid) IS 'dash_cartera (decisiones.md §4-§8, plan_v2.md §7.1-§7.3): payload único de la pestaña Cartera (5 KPI + 5 filas de bloques) en un round-trip. Gateado por dashboard.portfolio.read (ya concedido a admin/senior_partner/partner/director/manager/ita_manager/tax_manager/risk_partner, cero_13:323-330 -- esta migración no toca esa tabla). Alcance: admin/senior_partner ven toda la firma; el resto SOLO donde es partner_id o manager_id del encargo (role_scope), sin distinción de rol y SIN leer authorization_role_permissions.scope_key -- risk_partner nunca recibe alcance departamental. Base = estado efectivo 4/5 + funcion=1 (Cliente), SIN filtro de fecha a nivel encargo -- los bloques por periodo filtran horas/cuotas/gastos, no encargos. KPI 3 (2026-09-20, decisión del operador) dejó de ser "Horas como Gerente" fijo -- que para un socio daba 0/0 por construcción -- y se adapta a la categoría de la ficha del llamante: my_role_hours.role_label da el título y role_key dirige el cálculo (encargos donde ocupo ese rol estructural + líneas de presupuesto que comparten mi default_role_key, con respaldo por nombre si la categoría no lo tiene poblado). D-1 sobrevive como mecanismo: un gerente sigue sumando ''Gerente'' + ''Gerente/Asociado Senior'' y excluyendo los especialistas. KPI 4 (Avance de cartera) opera sobre scope_fy completo, contando el encargo si el llamante es su socio O su gerente (D-2). p_practica_id (2026-09-19): filtro de Práctica post-alcance, pedido del operador para admin/senior_partner -- NO es un cambio de autorización, role_scope no lo usa. "Horas por categoría"/"Presupuesto de personal" atribuyen cada hora a la categoría homónima de la práctica DEL ENCARGO (hours.exec_category_id), no a la de la ficha de quien la cargó: sin eso, alguien de otra práctica trabajando el encargo abría una segunda fila con el mismo nombre (BUG 2026-09-20, ver el comentario del CTE `hours`). Cada fila viaja con practica_abbr para que la UI desambigüe los homónimos legítimos de la vista "Todas". La Cola de aprobación se consolida por persona (una fila por staff_id, la línea más antigua) ANTES de su LIMIT 20 y emite staff_id: cortando líneas crudas, una sola persona con 20 pendientes escondía a todas las demás del payload (review.md iteración 1, MF-03). Depende de public.effective_engagement_state() y public.latest_exchange_rate(), creadas por 20260915130000_dash_socio_partner_overview.sql -- debe aplicarse después de esa migración. Ver bugs/dashboard/cartera/plan_v2.md §7.3 para el contrato exacto del payload.';


--
-- Name: prepare_account_deletion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prepare_account_deletion(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff   uuid;
  v_email   text;
  v_existe  boolean;
  v_filas   integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NULL_USER_ID');
  END IF;

  -- GUARDA. Esto anuncia una baja, y la única razón para anunciarla es que se esté borrando la
  -- cuenta. `manage-auth-user` ya lo verifica antes de llamar; si igual llega una cuenta con ficha
  -- vinculada, alguien se equivocó y no se toca.
  SELECT s.staff_id INTO v_staff
    FROM public.staff s
   WHERE s.auth_user_id = p_user_id
     AND s.deleted_at IS NULL;

  IF v_staff IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'LINKED_STAFF');
  END IF;

  -- Se leen las DOS cosas por separado, y no se deduce una de la otra: "no hay correo" y "no hay
  -- cuenta" no son lo mismo, y quien llama necesita distinguirlas. Si `deleteUser()` despues
  -- falla, `existe_auth = false` dice que la cuenta ya no estaba —el borrado es idempotente y la
  -- baja es real—; `true` dice que el borrado fallo de verdad.
  BEGIN
    SELECT u.email, true INTO v_email, v_existe
      FROM auth.users u WHERE u.id = p_user_id;
    v_existe := COALESCE(v_existe, false);
  EXCEPTION WHEN OTHERS THEN
    -- El harness local monta un `auth` mínimo: no se puede afirmar nada, y NULL lo dice.
    v_email  := NULL;
    v_existe := NULL;
  END;

  -- UPDATE, no DELETE. Es toda la diferencia: esto no borra ni anuncia nada, así que no hay
  -- estado intermedio que reponer si lo que viene después no llega a pasar.
  UPDATE public.user_roles
     SET deletion_email = NULLIF(btrim(COALESCE(v_email, '')), '')
   WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  RETURN jsonb_build_object('ok', true,
                            'marcado', v_filas,
                            -- NULL cuando no se pudo mirar `auth` (harness local).
                            'existe_auth', v_existe,
                            -- false = el aviso va a salir sin dirección. No es un error: el
                            -- borrado igual tiene que seguir.
                            'con_correo', COALESCE(btrim(v_email), '') <> '');
END;
$$;


--
-- Name: FUNCTION prepare_account_deletion(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.prepare_account_deletion(p_user_id uuid) IS 'Copia el correo de la cuenta a user_roles.deletion_email y devuelve en existe_auth si la cuenta seguia en auth.users para que el aviso auth.account.deleted identifique la cuenta cuando el CASCADE borre la fila con auth.users ya vacia. NO borra ni anuncia nada: el aviso lo dispara el borrado real, asi que una invocacion interrumpida no deja ni una cuenta sin rol ni una alarma falsa. Se niega si la cuenta tiene ficha de staff vinculada.';


--
-- Name: prevent_imported_timer_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_imported_timer_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.is_imported = true THEN
    RAISE EXCEPTION 'Cannot delete imported timer entry (timer_id: %)', OLD.timer_id;
  END IF;
  RETURN OLD;
END;
$$;


--
-- Name: prevent_self_blocked_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_self_blocked_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Reject only a genuine change to the flag that did NOT come from a trusted
  -- lockout function. Those functions (record_failed_login /
  -- reset_login_attempts / admin_unblock_account) set this transaction-local
  -- flag before touching the row. This indirection is required because
  -- reset_login_attempts runs with the *user's own JWT* (so secure-signin can
  -- enforce its jwt-email guard on a successful login), which auth.uid() alone
  -- cannot tell apart from a self-service UPDATE. A direct PostgREST UPDATE on
  -- the staff table cannot set the flag, so self-service tampering is rejected
  -- while the auto-unlock-on-login path keeps working.
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     AND current_setting('app.allow_blocked_change', true) IS DISTINCT FROM 'on'
     AND auth.uid() IS NOT NULL          -- not service_role / postgres (edge fns, Studio)
     AND NOT public.is_admin() THEN      -- not an administrator
    RAISE EXCEPTION 'FORBIDDEN: is_blocked can only be changed by an administrator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_staff_reactivation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_staff_reactivation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Reactivation block intentionally removed for BUG 0526-123.
  -- (Previously raised REACTIVATION_BLOCKED on the OLD.is_active=false ->
  --  NEW.is_active=true transition when termination_date or deleted_at
  --  was set. Admins must now be able to reactivate to regularize
  --  prior-period timesheets.)

  -- termination_date immutability — protects audit evidence on inactive
  -- rows (0511-109/110) AND prevents clearing the date as part of the
  -- reactivation flow (0526-123 criterion 2: reactivation must preserve
  -- the date so trg_enforce_termination_date on time_entries keeps
  -- blocking post-exit hour entries).
  --
  -- The only case where clearing termination_date is allowed is on a
  -- row that was already active and stays active (TD-4 cleanup path):
  -- an admin may fix a stray/erroneous date on a still-active employee.
  IF OLD.termination_date IS NOT NULL
     AND NEW.termination_date IS NULL
     AND NOT (OLD.is_active = true AND NEW.is_active = true) THEN
    RAISE EXCEPTION 'TERMINATION_DATE_IMMUTABLE: Cannot clear termination_date except on an already-active staff row.';
  END IF;

  -- Soft-deleted rows cannot be reactivated. The 0526-123 policy change
  -- only lifted the block for rows that were terminated but NOT deleted.
  IF OLD.deleted_at IS NOT NULL
     AND OLD.is_active = false
     AND NEW.is_active = true THEN
    RAISE EXCEPTION 'REACTIVATION_BLOCKED: Cannot reactivate a soft-deleted staff row. Create a new record instead.';
  END IF;

  -- deleted_at is never reversible. Soft-deletes are one-way regardless
  -- of is_active state (aligned with the errors.deletedAtImmutable toast:
  -- "create a new record instead").
  IF OLD.deleted_at IS NOT NULL
     AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'DELETED_AT_IMMUTABLE: Cannot clear deleted_at on a staff row. Soft-deleted records cannot be restored; create a new record instead.';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: protect_approved_time_entries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_approved_time_entries() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  old_period     uuid;
  old_engagement uuid;
  old_activity   uuid;
  new_period     uuid;
  new_engagement uuid;
  new_activity   uuid;
BEGIN
  -- ── DELETE ──────────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    old_period     := OLD.period_id;
    old_engagement := OLD.engagement_id;
    old_activity   := OLD.activity_id;

    IF old_period IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.timesheet_line_approvals tla
      WHERE tla.period_id    = old_period
        AND tla.engagement_id = old_engagement
        AND tla.activity_id   = old_activity
        AND tla.status        = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot delete time entries on an approved line';
    END IF;
    RETURN OLD;
  END IF;

  -- ── INSERT ──────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    new_period     := NEW.period_id;
    new_engagement := NEW.engagement_id;
    new_activity   := NEW.activity_id;

    IF new_period IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.timesheet_line_approvals tla
      WHERE tla.period_id    = new_period
        AND tla.engagement_id = new_engagement
        AND tla.activity_id   = new_activity
        AND tla.status        = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot insert time entries into an approved line';
    END IF;
    RETURN NEW;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────
  old_period     := OLD.period_id;
  old_engagement := OLD.engagement_id;
  old_activity   := OLD.activity_id;
  new_period     := COALESCE(NEW.period_id,    OLD.period_id);
  new_engagement := COALESCE(NEW.engagement_id, OLD.engagement_id);
  new_activity   := COALESCE(NEW.activity_id,  OLD.activity_id);

  IF old_period IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.timesheet_line_approvals tla
    WHERE tla.period_id    = old_period
      AND tla.engagement_id = old_engagement
      AND tla.activity_id   = old_activity
      AND tla.status        = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot modify time entries on an approved line';
  END IF;

  IF new_period IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.timesheet_line_approvals tla
    WHERE tla.period_id    = new_period
      AND tla.engagement_id = new_engagement
      AND tla.activity_id   = new_activity
      AND tla.status        = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot move time entries into an approved line';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: purge_old_auth_email_throttle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_old_auth_email_throttle() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_borradas integer;
BEGIN
  DELETE FROM public.auth_email_throttle
   WHERE window_start < now() - interval '1 day';
  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$$;


--
-- Name: FUNCTION purge_old_auth_email_throttle(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.purge_old_auth_email_throttle() IS 'Borra las filas de auth_email_throttle cuya ventana venció hace más de un día. Devuelve cuántas borró.';


--
-- Name: purge_old_notification_emails(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_old_notification_emails() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_borrados integer;
BEGIN
  DELETE FROM public.notification_emails
   WHERE status = 'sent'
     AND COALESCE(sent_at, created_at) < now() - interval '30 days';
  GET DIAGNOSTICS v_borrados = ROW_COUNT;
  RETURN v_borrados;
END;
$$;


--
-- Name: FUNCTION purge_old_notification_emails(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.purge_old_notification_emails() IS 'Borra los correos enviados hace mas de 30 dias. Conserva los failed: son el registro de lo que no llego.';


--
-- Name: purge_old_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_old_notifications() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_raw    text;
  v_read   integer := 30;
  v_unread integer := 90;
  v_count  integer;
BEGIN
  SELECT setting_value INTO v_raw
    FROM public.global_settings WHERE setting_key = 'NOTIF_RETENTION_READ_DAYS';
  IF v_raw ~ '^[0-9]{1,9}$' THEN
    v_read := LEAST(GREATEST(v_raw::integer, 1), 3650);
  END IF;

  SELECT setting_value INTO v_raw
    FROM public.global_settings WHERE setting_key = 'NOTIF_RETENTION_UNREAD_DAYS';
  IF v_raw ~ '^[0-9]{1,9}$' THEN
    v_unread := LEAST(GREATEST(v_raw::integer, 1), 3650);
  END IF;

  -- Una no leída nunca vive MENOS que una leída: si el admin invierte los valores, gana el
  -- más conservador en vez de borrar avisos que nadie vio todavía.
  v_unread := GREATEST(v_unread, v_read);

  -- El descarte se evalúa PRIMERO y con su propia fecha base. Sin este brazo, una fila
  -- descartada caía en el de "no leída" —90 días contados desde que se creó— y una descartada
  -- que ya estaba leída, en el de 30: ninguno de los dos mide lo que importa acá, que es cuánto
  -- silencio le compró el descarte al cron.
  DELETE FROM public.notifications n
   WHERE ((n.dismissed_at IS NOT NULL AND n.dismissed_at < now() - make_interval(days => v_read))
       OR (n.dismissed_at IS NULL AND n.read_at IS NOT NULL
           AND n.created_at < now() - make_interval(days => v_read))
       OR (n.dismissed_at IS NULL AND n.read_at IS NULL
           AND n.created_at < now() - make_interval(days => v_unread)))
     -- ...SALVO que la fila todavía esté haciendo de registro de emisión.
     --
     -- Los emisores del cron deduplican con NOT EXISTS contra esta tabla: la fila es a la vez el
     -- aviso Y la constancia de que ya salió. Borrarla mientras el hecho sigue vigente devuelve
     -- el NOT EXISTS a verdadero y el cron reemite, con un correo nuevo detrás. Es exactamente
     -- lo que ya arregló `dismiss_notifications` marcando en vez de borrar (ver su comentario);
     -- la retención abría la misma puerta un poco más tarde.
     --
     -- Sin esto, la ventana de retención pasaba a gobernar la CADENCIA de una alarma:
     -- NOTIF_RETENTION_READ_DAYS acepta hasta 1, y con ese valor el aviso volvía todos los días.
     -- Ni siquiera hacía falta descartarlo; alcanzaba con leerlo.
     --
     -- NINGUNA de las dos exenciones es permanente. Las dos preguntan por el hecho, no por el
     -- type_key: cuando el hecho deja de ser cierto, la fila vuelve a envejecer con las reglas
     -- normales y se va. Por eso esto no hace crecer la tabla sin fin.
     --
     -- De los cuatro dedupes del cron, los otros dos (`wo.emergency.deadline_near` y
     -- `engagement.ending_soon`) no necesitan exención: llevan `days_left` en el payload, y esa
     -- condición es cierta dos días del calendario y nunca más. Ya vencidos, que se borre la
     -- fila no reabre nada.
     AND NOT (
       -- 1) El plazo de emergencia vencido. Es el que no perdona: mientras la OT siga en
       --    Emergency_Approved con el plazo pasado, la condición es cierta PARA SIEMPRE, así que
       --    con cualquier retención la alarma se repetía indefinidamente. Se apaga cuando el
       --    Gerente completa los datos de riesgo y `risk_status` vuelve a 'Pending'.
       n.type_key = 'wo.emergency.deadline_passed'
       AND EXISTS (
         SELECT 1 FROM public.work_orders w
          WHERE w.wo_id::text = n.entity_id
            AND w.risk_status = 'Emergency_Approved'
            AND w.emergency_deadline_at IS NOT NULL
            AND w.emergency_deadline_at < (now() AT TIME ZONE 'America/La_Paz')::date
       )
     )
     AND NOT (
       -- 2) La semana de facturación. Acá la condición SÍ muere sola —el domingo—, así que sólo
       --    se rompe con la retención por debajo de 7 días: la fila se purgaba el martes y el
       --    cron del miércoles volvía a avisar la misma cuota. Más angosto que el caso 1, misma
       --    causa, y el arreglo es el mismo.
       --
       --    El dedupe de este tipo va por `installment_id` del payload y no por entity_id: el
       --    entity_id es la OT, y una OT puede tener dos cuotas facturables en la misma semana.
       n.type_key = 'wo.client.billing_week'
       AND EXISTS (
         SELECT 1 FROM public.wo_payment_installments i
          WHERE i.installment_id::text = n.payload->>'installment_id'
            AND i.status = 'Pending'
            AND i.agreed_invoice_date IS NOT NULL
            AND i.agreed_invoice_date
                  >= date_trunc('week', (now() AT TIME ZONE 'America/La_Paz')::date)::date
            AND i.agreed_invoice_date
                  <= date_trunc('week', (now() AT TIME ZONE 'America/La_Paz')::date)::date + 6
       )
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$_$;


--
-- Name: FUNCTION purge_old_notifications(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.purge_old_notifications() IS 'Retencion de public.notifications, tres ventanas: las DESCARTADAS mas de NOTIF_RETENTION_READ_DAYS (30) dias atras contados desde dismissed_at, las leidas mas viejas que ese mismo plazo desde created_at, y las no leidas mas viejas que NOTIF_RETENTION_UNREAD_DAYS (90). Una no leida nunca vive menos que una leida. EXCEPCION: no borra las filas que todavia sirven de dedupe a un emisor del cron cuyo hecho sigue vigente (wo.emergency.deadline_passed con la OT en Emergency_Approved y plazo vencido; wo.client.billing_week con la cuota Pending dentro de su semana), porque sin ellas la alarma se repetiria cada vez que vence la retencion. Las exenciones preguntan por el hecho, no por el type_key: al apagarse el hecho la fila caduca normal. Devuelve cuantas borro.';


--
-- Name: reactivate_practice_activity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reactivate_practice_activity(p_activity_id uuid) RETURNS public.activity_codes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_practica_id   uuid;
  v_entity_type  text;
  v_abbrev       text;
  v_old_code     text;
  v_max_ordinal  integer;
  v_code         text;
  v_row          public.activity_codes;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock and fetch the target (and its practice row) atomically.
  SELECT ac.practica_id, ac.entity_type, ac.activity_code, s.abbreviation
    INTO v_practica_id, v_entity_type, v_old_code, v_abbrev
    FROM public.activity_codes ac
    JOIN public.practicas s USING (practica_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = false AND ac.is_system = false
   FOR UPDATE OF ac, s;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found, already active, or not practice-linked';
  END IF;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Practice has no abbreviation';
  END IF;

  -- Highest existing ordinal among active, ordinal-scheme activities for
  -- this (practice, entity_type) pair — same MAX-based derivation as
  -- create_practice_activity, so a code assigned before this guard existed
  -- can never collide with the one generated here.
  SELECT COALESCE(MAX(substring(activity_code FROM '[0-9]+$')::int), 0) INTO v_max_ordinal
    FROM public.activity_codes
   WHERE practica_id  = v_practica_id
     AND entity_type = v_entity_type
     AND is_active   = true
     AND activity_code ~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$');

  -- No hard cap: 1–9 is a UI recommendation only.
  v_code := v_abbrev || '-' || v_entity_type || (v_max_ordinal + 1)::text;

  UPDATE public.activity_codes
     SET is_active = true,
         activity_code = v_code
   WHERE activity_id = p_activity_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$_$;


--
-- Name: recompute_engagement_finalization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_engagement_finalization() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Recalcular si cambia end_date O el override. (Codex P2: limpiar/cambiar el override de un
  -- encargo cuya fecha fin ya pasó debía re-evaluar la finalización, no esperar al cron.)
  IF TG_OP = 'UPDATE'
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
     AND NEW.engagement_state_override IS NOT DISTINCT FROM OLD.engagement_state_override THEN
    RETURN NEW;
  END IF;

  -- (a) Forward → Finalizado
  IF NEW.end_date IS NOT NULL
     AND NEW.end_date < (now() AT TIME ZONE 'America/La_Paz')::date
     AND public.engagement_is_approved_state(NEW.engagement_id, NEW.engagement_state_override, NEW.work_order_required)
  THEN
    NEW.engagement_state_override := 7;  -- Finalizado
    RETURN NEW;
  END IF;

  -- (b) Reapertura → Aprobado (solo Admin, y solo si el estado sigue marcado Finalizado)
  IF TG_OP = 'UPDATE'
     AND OLD.engagement_state_override = 7
     AND NEW.engagement_state_override = 7
     AND (NEW.end_date IS NULL OR NEW.end_date >= (now() AT TIME ZONE 'America/La_Paz')::date)
     AND public.is_admin()
  THEN
    IF public.engagement_is_approved_state(NEW.engagement_id, NULL, NEW.work_order_required) THEN
      NEW.engagement_state_override := NULL;  -- vínculo con la OT (derivado = Aprobado)
    ELSE
      NEW.engagement_state_override := 4;     -- fijar Aprobado
    END IF;
  END IF;

  -- (c) Reactivar el `status` legacy al SALIR de un estado terminal legacy-mapeado (override 6/7).
  -- El backfill dejó status='cancelled'/'completed' en las filas que mapeó a override 6/7. Al reabrir
  -- (override final → NULL o 1..5, sea por extensión de fecha (b) o por cambio manual del Admin), esos
  -- encargos seguirían excluidos por el gate `status='active'` de los selectores operativos
  -- (timesheet/manual-entry/dashboard), quedando invisibles/inusables. Se evalúa con el override FINAL
  -- porque este trigger corre último; si (a) forward-finalize ya hizo RETURN, no llega aquí (correcto).
  IF TG_OP = 'UPDATE'
     AND OLD.engagement_state_override IN (6, 7)
     AND (NEW.engagement_state_override IS NULL OR NEW.engagement_state_override BETWEEN 1 AND 5)
     AND NEW.status IS DISTINCT FROM 'active'
  THEN
    NEW.status := 'active';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: record_failed_login(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_failed_login(p_email text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_email        text        := lower(trim(p_email));
  v_max          integer;
  v_lockout      interval;
  v_reset        interval    := interval '15 minutes';
  v_now          timestamptz := now();
  v_existing     public.auth_login_attempts%ROWTYPE;
  v_new_count    integer;
  v_locked_until timestamptz;
  v_remaining    integer;
  v_raw          text;
BEGIN
  -- Read configurable thresholds with defensive parsing.
  -- Regex guard (^[1-9][0-9]*$) ensures the value is a positive integer, and
  -- the numeric upper-bound guard rejects values that would overflow the
  -- ::integer cast (and, for the interval, blow past a sane maximum). Any
  -- non-numeric, zero, or out-of-range value falls back to the original
  -- hardcoded default so a bad setting can never disable lockout.

  SELECT setting_value INTO v_raw
  FROM public.global_settings
  WHERE setting_key = 'AUTH_MAX_FAILED_ATTEMPTS'
  LIMIT 1;
  IF v_raw ~ '^[1-9][0-9]*$' AND v_raw::numeric <= 1000 THEN
    v_max := v_raw::integer;
  ELSE
    v_max := 5;
  END IF;

  SELECT setting_value INTO v_raw
  FROM public.global_settings
  WHERE setting_key = 'AUTH_LOCKOUT_MINUTES'
  LIMIT 1;
  -- 525600 minutes = 1 year; a generous ceiling that stays well within int range.
  IF v_raw ~ '^[1-9][0-9]*$' AND v_raw::numeric <= 525600 THEN
    v_lockout := make_interval(mins => v_raw::integer);
  ELSE
    v_lockout := interval '15 minutes';
  END IF;

  -- Atomic upsert so two parallel first-failures don't race on the PK.
  INSERT INTO public.auth_login_attempts (email_normalized, attempts_count, last_attempt_at)
  VALUES (v_email, 0, v_now)
  ON CONFLICT (email_normalized) DO NOTHING;

  SELECT * INTO v_existing
  FROM public.auth_login_attempts
  WHERE email_normalized = v_email
  FOR UPDATE;

  -- Already locked and still in force: report remaining time, don't bump.
  IF v_existing.locked_until IS NOT NULL AND v_existing.locked_until > v_now THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_existing.locked_until - v_now))::integer);
    RETURN jsonb_build_object('locked', true, 'remaining_seconds', v_remaining);
  END IF;

  -- Inactivity reset: if last failure is older than v_reset, start over at 1.
  IF v_existing.last_attempt_at < (v_now - v_reset) THEN
    v_new_count := 1;
  ELSE
    v_new_count := v_existing.attempts_count + 1;
  END IF;

  IF v_new_count >= v_max THEN
    v_locked_until := v_now + v_lockout;
  ELSE
    v_locked_until := NULL;
  END IF;

  UPDATE public.auth_login_attempts
  SET attempts_count  = v_new_count,
      last_attempt_at = v_now,
      locked_until    = v_locked_until
  WHERE email_normalized = v_email;

  -- BUG 0601-132: propagate is_blocked to the staff row.
  IF v_locked_until IS NOT NULL THEN
    BEGIN
      PERFORM set_config('app.allow_blocked_change', 'on', true);
      UPDATE public.staff
      SET is_blocked = true
      WHERE lower(trim(email)) = v_email
        AND is_blocked = false;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[0601-132] record_failed_login: could not set staff.is_blocked: %', SQLERRM;
    END;

    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - v_now))::integer);
    RETURN jsonb_build_object('locked', true, 'remaining_seconds', v_remaining);
  END IF;

  -- BUG 0625-146: include attempts_remaining so the caller can surface the
  -- countdown to the user without a separate query.
  RETURN jsonb_build_object(
    'locked', false,
    'remaining_seconds', 0,
    'attempts_remaining', GREATEST(0, v_max - v_new_count)
  );
END;
$_$;


--
-- Name: reject_engagement_assignment_move(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_engagement_assignment_move() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.engagement_id IS DISTINCT FROM OLD.engagement_id THEN
    RAISE EXCEPTION
      'ASSIGNMENT_ENGAGEMENT_IMMUTABLE: una asignacion no cambia de encargo (% -> %). Cerrar la asignacion en el encargo actual y crear una nueva en el destino.',
      OLD.engagement_id, NEW.engagement_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION reject_engagement_assignment_move(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reject_engagement_assignment_move() IS 'Rechaza cambiarle el engagement_id a una asignacion existente. La fila lleva datos atados a su encargo —requirement_id (sin FK), fechas, horas, categoria, y el solapamiento validado contra ese encargo— que un movimiento deja apuntando a otro lado sin que nada se queje. La via soportada es cerrar la asignacion y abrir otra.';


--
-- Name: reject_timesheet_reversal(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_timesheet_reversal(p_request_id uuid, p_notes text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin   uuid;
  v_request record;
  v_notes   text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'REVERSAL_NOT_ADMIN';
  END IF;

  v_notes := btrim(COALESCE(p_notes, ''));
  IF v_notes = '' THEN
    RAISE EXCEPTION 'REVERSAL_REJECT_NOTES_REQUIRED';
  END IF;

  v_admin := public.get_my_staff_id();

  SELECT * INTO v_request
    FROM public.timesheet_reversal_requests
   WHERE request_id = p_request_id
     FOR UPDATE;

  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'REVERSAL_NOT_PENDING';
  END IF;

  UPDATE public.timesheet_reversal_requests
     SET status = 'rejected', resolved_by = v_admin, resolved_at = now(), resolution_notes = v_notes
   WHERE request_id = p_request_id;

  -- rechazo_de_solicitud: notifica al solicitante, mismo patrón que el rechazo de líneas.
  PERFORM public.notify_staff('approval.reversal_rejected', v_request.requested_by,
    -- `scope` decide a dónde lleva el aviso (review iteración 12, hallazgo #2): SEMANA es la
    -- boleta propia del dueño (/timesheet); ENCARGO lo piden gerentes/socios sobre la boleta de
    -- OTRA persona, así que el destino es su "Mis solicitudes".
    p_request_id::text, jsonb_build_object('notes', v_notes, 'scope', v_request.scope));
END;
$$;


--
-- Name: reject_work_order_engagement_move(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_work_order_engagement_move() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.engagement_id IS DISTINCT FROM OLD.engagement_id THEN
    RAISE EXCEPTION
      'WO_ENGAGEMENT_IMMUTABLE: una orden de trabajo no cambia de encargo (% -> %). Crear la OT en el encargo destino.',
      OLD.engagement_id, NEW.engagement_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION reject_work_order_engagement_move(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reject_work_order_engagement_move() IS '0722-160: rechaza cambiarle el engagement_id a una OT existente. Las tablas de facturacion (wo_payment_plan, wo_payment_installments) y las aprobaciones cuelgan de wo_id, asi que un movimiento a un encargo administrativo las dejaba vivas y facturables fuera del alcance de los guards por funcion. Mismo patron que reject_engagement_assignment_move().';


--
-- Name: release_auth_email_slot(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_auth_email_slot(p_email text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_filas  integer;
  c_global constant text := '*';
BEGIN
  -- Mismo guard que el claim: la fila global no es un destinatario y no se devuelve por nombre.
  IF v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN false;
  END IF;

  -- Mismo orden de candados que claim_auth_email_slot(): global primero. Acá se toma con un
  -- SELECT ... FOR UPDATE y no con el UPDATE directo para que el orden sea el mismo aunque el
  -- destinatario no tenga nada que devolver y el UPDATE global no llegue a ejecutarse.
  PERFORM 1 FROM public.auth_email_throttle
   WHERE email_normalized = c_global
     FOR UPDATE;

  UPDATE public.auth_email_throttle
     SET sent_count   = GREATEST(sent_count - 1, 0),
         last_sent_at = NULL
   WHERE email_normalized = v_email
     -- Sin cupo consumido no hay nada que devolver, y restar igual regalaría cupo de más.
     AND sent_count > 0;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas = 0 THEN
    RETURN false;
  END IF;

  -- `last_sent_at` de la fila global NO se limpia: no gobierna ningún chequeo (el mínimo entre
  -- correos es por destinatario) y borrarlo perdería el único rastro de cuándo se movió.
  UPDATE public.auth_email_throttle
     SET sent_count = GREATEST(sent_count - 1, 0)
   WHERE email_normalized = c_global
     AND sent_count > 0;

  RETURN true;
END;
$$;


--
-- Name: FUNCTION release_auth_email_slot(p_email text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.release_auth_email_slot(p_email text) IS 'Devuelve los cupos que claim_auth_email_slot() ya descontó —el del destinatario y el de la firma—, para cuando el correo no llegó a salir (falla de Graph). Devuelve true si había algo que devolver. NO se usa cuando el correo sí salió.';


--
-- Name: reorder_practice_activity(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_practice_activity(p_activity_id uuid, p_new_position integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_practica_id  uuid;
  v_entity_type text;
  v_abbrev      text;
  v_code        text;
  v_total       integer;
  v_ids         uuid[];
  i             integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Fetch and lock the target activity (and its practice row) atomically.
  SELECT ac.practica_id, ac.entity_type, ac.activity_code, s.abbreviation
    INTO v_practica_id, v_entity_type, v_code, v_abbrev
    FROM public.activity_codes ac
    JOIN public.practicas s USING (practica_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = true AND ac.is_system = false
   FOR UPDATE OF ac, s;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found or not an active practice-linked activity';
  END IF;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Practice has no abbreviation';
  END IF;

  -- Lock every active, ordinal-scheme sibling of this (practice, entity_type)
  -- before reading the ordered set (FOR UPDATE cannot be combined with
  -- array_agg). Legacy siblings are excluded so they're never renumbered.
  PERFORM 1
    FROM public.activity_codes
   WHERE practica_id  = v_practica_id
     AND entity_type = v_entity_type
     AND is_active   = true
     AND activity_code ~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$')
   FOR UPDATE;

  SELECT array_agg(activity_id ORDER BY substring(activity_code FROM '[0-9]+$')::int)
    INTO v_ids
    FROM public.activity_codes
   WHERE practica_id  = v_practica_id
     AND entity_type = v_entity_type
     AND is_active   = true
     AND activity_code ~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$');

  v_total := array_length(v_ids, 1);

  IF p_new_position < 1 OR p_new_position > v_total THEN
    RAISE EXCEPTION 'Position % out of range (1-%)', p_new_position, v_total;
  END IF;

  -- Remove the target, then reinsert it at the requested 1-based position.
  v_ids := array_remove(v_ids, p_activity_id);
  v_ids := v_ids[1:p_new_position - 1]
           || ARRAY[p_activity_id]
           || v_ids[p_new_position:array_length(v_ids, 1)];

  -- PHASE 1: temporary codes A{v_total+1}..A{2*v_total}. Always greater than any
  -- current final code (A1..A{v_total}), so they never collide — for any count.
  FOR i IN 1..v_total LOOP
    UPDATE public.activity_codes
       SET activity_code = v_abbrev || '-' || v_entity_type || (v_total + i)::text
     WHERE activity_id = v_ids[i];
  END LOOP;

  -- PHASE 2: final codes A1..A{v_total} in the desired order.
  FOR i IN 1..v_total LOOP
    UPDATE public.activity_codes
       SET activity_code = v_abbrev || '-' || v_entity_type || i::text
     WHERE activity_id = v_ids[i];
  END LOOP;
END;
$_$;


--
-- Name: request_timesheet_reversal(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_timesheet_reversal(p_period_id uuid, p_scope text, p_engagement_id uuid, p_reason text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id     uuid;
  v_period       record;
  v_reason       text;
  v_all_approved boolean;
  v_has_approved boolean;
  v_request_id   uuid;
  v_admin        uuid;
BEGIN
  v_staff_id := public.get_my_staff_id();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'REVERSAL_NOT_AUTHORIZED';
  END IF;

  IF p_scope NOT IN ('engagement', 'week') THEN
    RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
  END IF;
  IF p_scope = 'engagement' AND p_engagement_id IS NULL THEN
    RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
  END IF;
  IF p_scope = 'week' AND p_engagement_id IS NOT NULL THEN
    RAISE EXCEPTION 'REVERSAL_BAD_SCOPE';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'REVERSAL_REASON_REQUIRED';
  END IF;

  SELECT tp.* INTO v_period
    FROM public.timesheet_periods tp
   WHERE tp.period_id = p_period_id
     FOR UPDATE;

  IF NOT FOUND OR v_period.submitted_at IS NULL THEN
    RAISE EXCEPTION 'REVERSAL_NOT_SUBMITTED';
  END IF;

  IF v_period.is_period_locked THEN
    RAISE EXCEPTION 'REVERSAL_PERIOD_LOCKED';
  END IF;

  IF p_scope = 'week' THEN
    -- El colaborador siempre solicita alcance SEMANA sobre su propia boleta (decisión del
    -- operador, §i.1): la pantalla /timesheet no ofrece selector de alcance.
    IF v_period.staff_id IS DISTINCT FROM v_staff_id THEN
      RAISE EXCEPTION 'REVERSAL_NOT_AUTHORIZED';
    END IF;

    -- Mismo umbral que la UI ("boleta aprobada" = isFullyApproved).
    SELECT COALESCE(bool_and(tla.status = 'approved'), false)
      INTO v_all_approved
      FROM public.timesheet_line_approvals tla
     WHERE tla.period_id = p_period_id;

    IF NOT v_all_approved THEN
      RAISE EXCEPTION 'REVERSAL_NOT_FULLY_APPROVED';
    END IF;
  ELSE
    -- Alcance ENCARGO: sólo quien puede aprobar esas líneas puede solicitar su reversión.
    IF NOT public.can_approve_timesheet_line(auth.uid(), p_period_id, p_engagement_id) THEN
      RAISE EXCEPTION 'REVERSAL_NOT_AUTHORIZED';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.timesheet_line_approvals
       WHERE period_id = p_period_id AND engagement_id = p_engagement_id AND status = 'approved'
    ) INTO v_has_approved;

    IF NOT v_has_approved THEN
      RAISE EXCEPTION 'REVERSAL_NOTHING_APPROVED';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.timesheet_reversal_requests
      (period_id, scope, engagement_id, requested_by, reason)
    VALUES (p_period_id, p_scope, p_engagement_id, v_staff_id, v_reason)
    RETURNING request_id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'REVERSAL_ALREADY_REQUESTED';
  END;

  FOR v_admin IN SELECT staff_id FROM public.notif_staff_by_roles(ARRAY['admin'])
  LOOP
    PERFORM public.notify_staff('approval.reversal_requested', v_admin, v_request_id::text,
      jsonb_build_object('reason', v_reason, 'scope', p_scope, 'period_id', p_period_id));
  END LOOP;

  RETURN v_request_id;
END;
$$;


--
-- Name: reset_login_attempts(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_login_attempts(p_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email     text := lower(trim(p_email));
  v_jwt_email text := lower(trim(coalesce((auth.jwt() ->> 'email'), '')));
BEGIN
  -- When a JWT is present (authenticated user), the email must match.
  -- When no JWT is present (postgres / service_role from Studio), allow.
  IF auth.jwt() IS NOT NULL AND v_jwt_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'RESET_FORBIDDEN: caller email mismatch';
  END IF;

  DELETE FROM public.auth_login_attempts
  WHERE email_normalized = v_email;

  -- BUG 0601-132: clear the admin-visible blocked flag at the same time.
  -- This covers the auto-unlock path: 15 min pass → user logs in
  -- successfully → secure-signin calls this RPC (with the user's own JWT) →
  -- admin switch goes to OFF. The transaction-local flag authorizes the write
  -- past prevent_self_blocked_change(), which otherwise can't distinguish this
  -- trusted reset from a self-service UPDATE (both carry the user's JWT).
  BEGIN
    PERFORM set_config('app.allow_blocked_change', 'on', true);
    UPDATE public.staff
    SET is_blocked = false
    WHERE lower(trim(email)) = v_email
      AND is_blocked = true;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[0601-132] reset_login_attempts: could not clear staff.is_blocked: %', SQLERRM;
  END;
END;
$$;


--
-- Name: reset_timer_import_on_unlink(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_timer_import_on_unlink() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.imported_to_time_id IS NULL AND OLD.imported_to_time_id IS NOT NULL THEN
    NEW.is_imported := false;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: resolve_wo_engagement_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_wo_engagement_id(p_wo_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT wo.engagement_id FROM public.work_orders wo WHERE wo.wo_id = p_wo_id
$$;


--
-- Name: resolve_wo_req_skill_engagement_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_wo_req_skill_engagement_id(p_requirement_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT wo.engagement_id
    FROM public.wo_staffing_requirements r
    JOIN public.work_orders wo ON wo.wo_id = r.wo_id
   WHERE r.id = p_requirement_id
$$;


--
-- Name: rollback_unconfirmed_signup(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rollback_unconfirmed_signup(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_confirmado boolean;
  v_avisos     uuid[];
  v_correos    integer := 0;
  v_roles      integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NULL_USER_ID');
  END IF;

  -- GUARDA. Esto solo puede tocar una cuenta que nunca se confirmo. Es service_role y hoy la
  -- llama un unico sitio, pero el costo de equivocarse es borrarle el acceso a alguien que lo
  -- estaba usando, asi que la condicion se verifica aca y no se confia en quien llama.
  BEGIN
    SELECT u.email_confirmed_at IS NOT NULL INTO v_confirmado
      FROM auth.users u WHERE u.id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    -- El harness local monta un `auth` minimo. Ahi no hay nada que proteger.
    v_confirmado := NULL;
  END;

  IF v_confirmado THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ACCOUNT_CONFIRMED');
  END IF;

  -- Transaction-local: vale para todo lo que siga en ESTA transaccion y para nada mas.
  PERFORM set_config('ems.account_rollback', '1', true);

  -- Los avisos de alta que el trigger emitio a los ADM. Se buscan por `payload->>'user_id'` y
  -- no por `entity_id`, que en un alta es el user_id pero pasaria a ser el staff_id si alguna
  -- vez la ficha llegara a estar vinculada a tiempo.
  SELECT COALESCE(array_agg(notification_id), ARRAY[]::uuid[]) INTO v_avisos
    FROM public.notifications
   WHERE type_key = 'auth.user.registered'
     AND payload->>'user_id' = p_user_id::text;

  -- El correo primero: solo lo que TODAVIA no salio. Un correo ya enviado es un hecho y su fila
  -- es el registro de ese hecho — borrarla no lo desmiente, solo esconde que paso.
  --
  -- `<> 'sent'` y no `IN ('pending','failed')`, porque falta el tercer estado: `sending`. El
  -- drenaje corre cada 5 minutos y puede haber RECLAMADO el correo del alta mientras register-user
  -- todavia peleaba con Graph. Esa fila no entraba en el filtro viejo, y el DELETE de
  -- `notifications` que viene abajo solo le pone `notification_id` en NULL (la FK es ON DELETE SET
  -- NULL): el drenaje seguia y le mandaba al ADM el aviso de un alta que se acababa de deshacer.
  --
  -- Borrarla la cancela sin mecanismo nuevo: `begin_notification_email_attempt` solo actualiza
  -- `WHERE status = 'sending'`, asi que devuelve NULL, y el drenaje ya sabe saltear ese caso
  -- ("La fila dejo de estar arrendada entre el claim y esto").
  --
  -- No cierra la ventana ENTERA, y conviene saberlo: si el drenaje ya paso ese punto y esta dentro
  -- de la llamada a Graph, el correo sale igual. Eso no lo arregla ninguna bandera — el mensaje
  -- salio o no salio. Lo que se cierra del todo es el caso "reclamado y todavia sin intentar".
  DELETE FROM public.notification_emails
   WHERE notification_id = ANY (v_avisos)
     AND status <> 'sent';
  GET DIAGNOSTICS v_correos = ROW_COUNT;

  DELETE FROM public.notifications WHERE notification_id = ANY (v_avisos);

  -- Y la fila que dispara el CASCADE. Borrarla aca, con el marcador puesto, es lo que evita el
  -- `auth.account.deleted` cuando despues GoTrue borre la cuenta: para entonces ya no queda
  -- nada que cascadear.
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_roles = ROW_COUNT;

  RETURN jsonb_build_object('ok', true,
                            'notificaciones', COALESCE(array_length(v_avisos, 1), 0),
                            'correos', v_correos,
                            'roles', v_roles);
END;
$$;


--
-- Name: FUNCTION rollback_unconfirmed_signup(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rollback_unconfirmed_signup(p_user_id uuid) IS 'Deshace el rastro en public de un alta que quedo a medias (el correo de confirmacion no salio): borra los avisos auth.user.registered, sus correos que no llegaron a salir —incluidos los ya reclamados por el drenaje, que se cancelan solos porque begin_notification_email_attempt deja de encontrarlos en sending— y la fila de user_roles, con ems.account_rollback puesto para que el trigger no reporte una baja de cuenta a Seguridad TI. Rechaza cuentas ya confirmadas. La cuenta en auth la borra GoTrue por su API.';


--
-- Name: save_engagement_assignments(uuid, jsonb, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_engagement_assignments(p_engagement_id uuid, p_upserts jsonb, p_deleted_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_state_override smallint;
  v_practica        smallint;
  v_eng_start       date;
  v_eng_end         date;
  v_practica_id      uuid;
  v_cat_practica     uuid;
  v_row             jsonb;
  v_assignment_id   uuid;
  v_staff_id        uuid;
  v_category_id     uuid;
  v_start_date      date;
  v_end_date        date;
  v_hours           numeric;
  v_allocation      numeric;
  v_exists          boolean;
  v_persisted_staff_id uuid;
  v_staff_active    boolean;
  v_staff_schedulable boolean;
  v_result          jsonb;
BEGIN
  p_upserts     := COALESCE(p_upserts, '[]'::jsonb);
  p_deleted_ids := COALESCE(p_deleted_ids, ARRAY[]::uuid[]);

  -- 1-3. Resolver + bloquear el engagement (serializa escrituras concurrentes, hace correcto el
  --      chequeo de overlaps del paso 6), autorizar, y confirmar que acepta escrituras.
  SELECT engagement_state_override, practica, start_date, end_date
    INTO v_state_override, v_practica, v_eng_start, v_eng_end
    FROM public.engagements
   WHERE engagement_id = p_engagement_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EAS_ENGAGEMENT_NOT_FOUND'
      USING DETAIL = jsonb_build_object('engagement_id', p_engagement_id)::text;
  END IF;

  IF NOT (public.is_admin() OR public.is_engagement_responsible(p_engagement_id)) THEN
    RAISE EXCEPTION 'EAS_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.engagement_accepts_assignment_writes(p_engagement_id) THEN
    RAISE EXCEPTION 'EAS_ENGAGEMENT_LOCKED'
      USING DETAIL = jsonb_build_object(
              'engagement_id', p_engagement_id,
              'engagement_state_override', v_state_override)::text;
  END IF;

  IF v_practica IS NOT NULL THEN
    SELECT practica_id INTO v_practica_id FROM public.practicas WHERE code = v_practica;
  END IF;

  -- 4. Validar TODO el payload antes de escribir nada.
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_upserts)
  LOOP
    v_assignment_id := (v_row->>'assignment_id')::uuid;
    v_staff_id    := (v_row->>'staff_id')::uuid;
    v_category_id := (v_row->>'category_id')::uuid;
    v_start_date  := (v_row->>'start_date')::date;
    v_end_date    := (v_row->>'end_date')::date;
    v_hours       := (v_row->>'hours_per_week')::numeric;
    v_allocation  := (v_row->>'allocation_percent')::numeric;

    -- Fase 5 O1: assignment_id ahora es SIEMPRE requerido — lo genera el cliente una sola vez
    -- (insert idempotente) y lo conserva para updates.
    IF v_assignment_id IS NULL OR v_staff_id IS NULL OR v_category_id IS NULL
       OR v_start_date IS NULL OR v_end_date IS NULL OR v_hours IS NULL OR v_allocation IS NULL THEN
      RAISE EXCEPTION 'EAS_MISSING_FIELD'
        USING DETAIL = jsonb_build_object('row', v_row)::text;
    END IF;

    -- Mismo día es válido (intersección inclusiva, mismo criterio que el overlap del paso 6).
    IF v_end_date < v_start_date THEN
      RAISE EXCEPTION 'EAS_DATE_RANGE'
        USING DETAIL = jsonb_build_object('start_date', v_start_date, 'end_date', v_end_date)::text;
    END IF;

    -- Fase 5 O4: el segmento debe caer dentro del rango inclusivo del engagement (si el
    -- engagement tiene fechas — un legado sin fechas queda sin cota).
    IF (v_eng_start IS NOT NULL AND v_start_date < v_eng_start)
       OR (v_eng_end IS NOT NULL AND v_end_date > v_eng_end) THEN
      RAISE EXCEPTION 'EAS_ENGAGEMENT_RANGE'
        USING DETAIL = jsonb_build_object(
                'start_date', v_start_date, 'end_date', v_end_date,
                'engagement_start_date', v_eng_start, 'engagement_end_date', v_eng_end)::text;
    END IF;

    IF v_hours <= 0 OR v_hours > 80 THEN
      RAISE EXCEPTION 'EAS_HOURS_RANGE'
        USING DETAIL = jsonb_build_object('hours_per_week', v_hours)::text;
    END IF;

    IF v_allocation <= 0 OR v_allocation > 100 THEN
      RAISE EXCEPTION 'EAS_ALLOCATION_RANGE'
        USING DETAIL = jsonb_build_object('allocation_percent', v_allocation)::text;
    END IF;

    IF v_practica_id IS NOT NULL THEN
      SELECT practica_id INTO v_cat_practica FROM public.categories WHERE category_id = v_category_id;
      IF v_cat_practica IS DISTINCT FROM v_practica_id THEN
        RAISE EXCEPTION 'EAS_CATEGORY_FOREIGN_PRACTICE'
          USING DETAIL = jsonb_build_object('category_id', v_category_id)::text;
      END IF;
    END IF;

    -- Fase 5 O7 (enmienda del review #4): elegibilidad de staff para inserts nuevos Y para
    -- updates que CAMBIAN el staff_id de una fila existente — una fila que conserva su staff_id
    -- histórico está exenta (permite staff inactivo/no-schedulable ya asignado sin re-validar en
    -- cada guardado no relacionado), pero reasignar la fila a un staff DISTINTO exige la misma
    -- elegibilidad que un insert nuevo.
    SELECT EXISTS (
      SELECT 1 FROM public.engagement_assignments
       WHERE assignment_id = v_assignment_id AND engagement_id = p_engagement_id
    ) INTO v_exists;

    v_persisted_staff_id := NULL;
    IF v_exists THEN
      SELECT staff_id INTO v_persisted_staff_id
        FROM public.engagement_assignments
       WHERE assignment_id = v_assignment_id AND engagement_id = p_engagement_id;
    END IF;

    IF NOT v_exists OR v_persisted_staff_id IS DISTINCT FROM v_staff_id THEN
      SELECT is_active, is_schedulable INTO v_staff_active, v_staff_schedulable
        FROM public.staff
       WHERE staff_id = v_staff_id;
      IF v_staff_active IS NOT TRUE OR v_staff_schedulable IS NOT TRUE THEN
        RAISE EXCEPTION 'EAS_STAFF_INELIGIBLE'
          USING DETAIL = jsonb_build_object('staff_id', v_staff_id)::text;
      END IF;
    END IF;
  END LOOP;

  -- 5. Aplicar el diff explícito: soft-delete -> update -> insert (en ese orden). status nunca se
  --    escribe (el DEFAULT de la BD gobierna — decisión de negocio Q1, F2 solo verifica PROPOSED
  --    en C2); created_by tampoco (paridad con el cliente, que igual lo omite hoy).
  IF cardinality(p_deleted_ids) > 0 THEN
    UPDATE public.engagement_assignments
       SET deleted_at = now()
     WHERE assignment_id = ANY(p_deleted_ids)
       AND engagement_id = p_engagement_id
       AND deleted_at IS NULL;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_upserts)
  LOOP
    v_assignment_id := (v_row->>'assignment_id')::uuid;

    -- Fase 5 O1: idempotencia por UUID cliente — la fila YA existe en este engagement -> UPDATE;
    -- si no -> INSERT con ese mismo id (un reintento tras un commit no-acusado encuentra la fila
    -- en la segunda llamada y actualiza en vez de duplicar).
    SELECT EXISTS (
      SELECT 1 FROM public.engagement_assignments
       WHERE assignment_id = v_assignment_id AND engagement_id = p_engagement_id
    ) INTO v_exists;

    IF v_exists THEN
      UPDATE public.engagement_assignments
         SET staff_id           = (v_row->>'staff_id')::uuid,
             category_id        = (v_row->>'category_id')::uuid,
             start_date         = (v_row->>'start_date')::date,
             end_date           = (v_row->>'end_date')::date,
             hours_per_week     = (v_row->>'hours_per_week')::numeric,
             allocation_percent = (v_row->>'allocation_percent')::numeric,
             notes              = v_row->>'notes'
       WHERE assignment_id = v_assignment_id
         AND engagement_id = p_engagement_id;
    ELSE
      INSERT INTO public.engagement_assignments (
        assignment_id, engagement_id, staff_id, category_id,
        start_date, end_date, hours_per_week, allocation_percent, notes
      ) VALUES (
        v_assignment_id,
        p_engagement_id,
        (v_row->>'staff_id')::uuid,
        (v_row->>'category_id')::uuid,
        (v_row->>'start_date')::date,
        (v_row->>'end_date')::date,
        (v_row->>'hours_per_week')::numeric,
        (v_row->>'allocation_percent')::numeric,
        v_row->>'notes'
      );
    END IF;
  END LOOP;

  -- 6. Overlap detection: contra el estado YA persistido (preexistentes intocados + actualizados +
  --    nuevos), tras aplicar el diff completo del paso 5 — verifica tanto contra preexistentes como
  --    dentro del propio payload de una sola pasada. '[]' reproduce la intersección inclusiva del
  --    cliente. El RAISE revierte TODA la transacción (incluido el paso 5) si dispara.
  IF EXISTS (
    SELECT 1 FROM public.engagement_assignments a
    JOIN public.engagement_assignments b
      ON b.engagement_id = a.engagement_id
     AND b.staff_id = a.staff_id
     AND b.assignment_id <> a.assignment_id
     AND daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]')
    WHERE a.engagement_id = p_engagement_id
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'EAS_OVERLAP';
  END IF;

  -- 7. Devolver el estado final persistido, con la forma que lee useEngagementAssignments.
  --    No renombrar engagement_assignments_staff_id_fkey.
  SELECT jsonb_agg(
           jsonb_build_object(
             'assignment_id', a.assignment_id,
             'staff_id', a.staff_id,
             'category_id', a.category_id,
             'start_date', a.start_date,
             'end_date', a.end_date,
             'hours_per_week', a.hours_per_week,
             'allocation_percent', a.allocation_percent,
             'status', a.status,
             'notes', a.notes
           )
         )
    INTO v_result
    FROM public.engagement_assignments a
   WHERE a.engagement_id = p_engagement_id
     AND a.deleted_at IS NULL;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


--
-- Name: save_wo_staffing(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_wo_staffing(p_wo_id uuid, p_requirements jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_engagement_id uuid;
  v_status        text;
  v_practica      smallint;
  v_practica_id    uuid;
  v_cat_practica   uuid;
  v_category_id   uuid;
  v_staff_count   int;
  v_req           jsonb;
  v_skill         jsonb;
  v_result        jsonb;
BEGIN
  p_requirements := COALESCE(p_requirements, '[]'::jsonb);

  -- 1-2. Resolver + bloquear el work order (serializa transacciones concurrentes), autorizar,
  --      y exigir Draft (solo Draft editable — WorkOrderEdit.tsx:296-297 trata Approved/
  --      Pending_Approval/Rejected como bloqueados; cierra el bloqueo de G8).
  SELECT wo.engagement_id, wo.approval_status
    INTO v_engagement_id, v_status
    FROM public.work_orders wo
   WHERE wo.wo_id = p_wo_id
   FOR UPDATE;

  IF v_engagement_id IS NULL THEN
    RAISE EXCEPTION 'WOS_WO_NOT_FOUND'
      USING DETAIL = jsonb_build_object('wo_id', p_wo_id)::text;
  END IF;

  IF NOT (
    public.is_admin()
    OR public.is_engagement_team_member(v_engagement_id)
    OR public.is_engagement_responsible(v_engagement_id)
  ) THEN
    RAISE EXCEPTION 'WOS_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'Draft' THEN
    RAISE EXCEPTION 'WOS_WO_LOCKED'
      USING DETAIL = jsonb_build_object('wo_id', p_wo_id, 'status', v_status)::text;
  END IF;

  -- 3. practica del engagement, para el chequeo de categoría cruzada (omitido si NULL — engagement
  --    legado sin servicio asignado, mismo precedente que los triggers de C2).
  SELECT e.practica INTO v_practica FROM public.engagements e WHERE e.engagement_id = v_engagement_id;
  IF v_practica IS NOT NULL THEN
    SELECT practica_id INTO v_practica_id FROM public.practicas WHERE code = v_practica;
  END IF;

  -- 4. Validar TODO el payload antes de tocar ninguna fila (todo-o-nada).
  IF EXISTS (
    SELECT 1 FROM (
      SELECT (elem->>'category_id')::uuid AS category_id
        FROM jsonb_array_elements(p_requirements) elem
    ) dup
    GROUP BY category_id
   HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'WOS_REQUIREMENT_DUPLICATE';
  END IF;

  FOR v_req IN SELECT * FROM jsonb_array_elements(p_requirements)
  LOOP
    v_category_id := (v_req->>'category_id')::uuid;
    v_staff_count := (v_req->>'staff_count')::int;

    IF v_staff_count IS NULL OR v_staff_count < 1 OR v_staff_count > 999 THEN
      RAISE EXCEPTION 'WOS_STAFF_COUNT_RANGE'
        USING DETAIL = jsonb_build_object('category_id', v_category_id, 'staff_count', v_staff_count)::text;
    END IF;

    IF v_practica_id IS NOT NULL THEN
      SELECT practica_id INTO v_cat_practica FROM public.categories WHERE category_id = v_category_id;
      IF v_cat_practica IS DISTINCT FROM v_practica_id THEN
        RAISE EXCEPTION 'WOS_CATEGORY_FOREIGN_PRACTICE'
          USING DETAIL = jsonb_build_object('category_id', v_category_id)::text;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM (
        SELECT (s->>'skill_id')::uuid AS skill_id
          FROM jsonb_array_elements(COALESCE(v_req->'skills', '[]'::jsonb)) s
      ) dup
      GROUP BY skill_id
     HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'WOS_SKILL_DUPLICATE'
        USING DETAIL = jsonb_build_object('category_id', v_category_id)::text;
    END IF;

    FOR v_skill IN SELECT * FROM jsonb_array_elements(COALESCE(v_req->'skills', '[]'::jsonb))
    LOOP
      IF (v_skill->>'min_proficiency_level') NOT IN ('Beginner', 'Intermediate', 'Advanced') THEN
        RAISE EXCEPTION 'WOS_PROFICIENCY_INVALID'
          USING DETAIL = jsonb_build_object(
                  'category_id', v_category_id,
                  'skill_id', v_skill->>'skill_id',
                  'min_proficiency_level', v_skill->>'min_proficiency_level')::text;
      END IF;
    END LOOP;
  END LOOP;

  -- 5. Aplicar en el orden del cliente: borrar skills ausentes -> borrar requisitos ausentes
  --    (CASCADE, redundante con lo anterior pero explícito) -> upsert requisitos -> upsert skills.

  DELETE FROM public.wo_staffing_requirement_skills rs
   USING public.wo_staffing_requirements r
   WHERE rs.requirement_id = r.id
     AND r.wo_id = p_wo_id
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(p_requirements) req
         JOIN jsonb_array_elements(COALESCE(req->'skills', '[]'::jsonb)) sk ON true
        WHERE (req->>'category_id')::uuid = r.category_id
          AND (sk->>'skill_id')::uuid = rs.skill_id
     );

  DELETE FROM public.wo_staffing_requirements r
   WHERE r.wo_id = p_wo_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_requirements) req
        WHERE (req->>'category_id')::uuid = r.category_id
     );

  INSERT INTO public.wo_staffing_requirements (wo_id, category_id, staff_count)
  SELECT p_wo_id, (req->>'category_id')::uuid, (req->>'staff_count')::int
    FROM jsonb_array_elements(p_requirements) req
  ON CONFLICT (wo_id, category_id) DO UPDATE
    SET staff_count = EXCLUDED.staff_count,
        updated_at  = now();

  INSERT INTO public.wo_staffing_requirement_skills (requirement_id, skill_id, min_proficiency_level)
  SELECT r.id, (sk->>'skill_id')::uuid, sk->>'min_proficiency_level'
    FROM jsonb_array_elements(p_requirements) req
    JOIN public.wo_staffing_requirements r
      ON r.wo_id = p_wo_id AND r.category_id = (req->>'category_id')::uuid
    JOIN jsonb_array_elements(COALESCE(req->'skills', '[]'::jsonb)) sk ON true
  ON CONFLICT (requirement_id, skill_id) DO UPDATE
    SET min_proficiency_level = EXCLUDED.min_proficiency_level;

  -- 6. Devolver el estado final persistido.
  SELECT jsonb_agg(
           jsonb_build_object(
             'id', r.id,
             'category_id', r.category_id,
             'staff_count', r.staff_count,
             'skills', COALESCE(sk.skills, '[]'::jsonb)
           )
         )
    INTO v_result
    FROM public.wo_staffing_requirements r
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
               jsonb_build_object('skill_id', rs.skill_id, 'min_proficiency_level', rs.min_proficiency_level)
             ) AS skills
        FROM public.wo_staffing_requirement_skills rs
       WHERE rs.requirement_id = r.id
    ) sk ON true
   WHERE r.wo_id = p_wo_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


--
-- Name: set_authz_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_authz_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: set_client_created_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_client_created_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.created_by_staff_id := get_my_staff_id();
  else
    new.created_by_staff_id := old.created_by_staff_id;
  end if;
  return new;
end;
$$;


--
-- Name: set_engagement_created_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_engagement_created_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.created_by_staff_id := get_my_staff_id();
  else
    new.created_by_staff_id := old.created_by_staff_id;
  end if;
  return new;
end;
$$;


--
-- Name: set_fund_request_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_fund_request_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_seq bigint;
BEGIN
  IF NEW.request_number IS NULL THEN
    v_seq := nextval('public.fund_request_number_seq');
    NEW.request_number := 'FR-' || to_char(now(), 'YYYY') || '-' ||
      CASE WHEN v_seq < 10000
           THEN lpad(v_seq::text, 4, '0')   -- 0001..9999, formato historico
           ELSE v_seq::text                 -- 10000+, sin truncar
      END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION set_fund_request_number(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_fund_request_number() IS 'Numera las solicitudes de fondos como FR-<anio>-<secuencia>. La secuencia se rellena a 4 digitos SOLO mientras entre: lpad() trunca por la derecha y con valores mas largos generaba numeros duplicados (hallazgo 2026-09-10).';


--
-- Name: staff_id_number_conflict(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_id_number_conflict(p_id_number text, p_exclude_staff_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_first text;
  v_last  text;
begin
  if not (public.has_permission('staff.create') or public.has_permission('staff.update')) then
    raise exception 'Permission denied: staff.create or staff.update required'
      using errcode = 'insufficient_privilege';
  end if;

  if p_id_number is null or btrim(p_id_number) = '' then
    return jsonb_build_object('conflict', false);
  end if;

  select first_name, last_name into v_first, v_last
  from staff
  where id_number = btrim(p_id_number)
    and deleted_at is null
    and (p_exclude_staff_id is null or staff_id <> p_exclude_staff_id)
  limit 1;

  if v_first is null then
    return jsonb_build_object('conflict', false);
  end if;

  return jsonb_build_object('conflict', true, 'first_name', v_first, 'last_name', v_last);
end;
$$;


--
-- Name: start_timer_entry(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_timer_entry(p_engagement_id uuid, p_activity_id uuid, p_description text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  SELECT staff_id INTO v_staff_id
  FROM staff WHERE auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'No staff record linked to current user';
  END IF;

  SELECT timer_id INTO v_existing_id
  FROM timer_entries
  WHERE staff_id = v_staff_id AND ended_at IS NULL;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'RUNNING_TIMER_EXISTS:%', v_existing_id;
  END IF;

  INSERT INTO timer_entries (staff_id, engagement_id, activity_id, description, started_at)
  VALUES (v_staff_id, p_engagement_id, p_activity_id, p_description, now())
  RETURNING timer_id INTO v_new_id;

  RETURN v_new_id;
END;
$$;


--
-- Name: stop_timer_entry(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stop_timer_entry(p_timer_id uuid, p_ended_at timestamp with time zone DEFAULT now()) RETURNS TABLE(timer_id uuid, duration_minutes integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id uuid;
  v_started_at timestamptz;
  v_clamped_end timestamptz;
  v_raw_minutes numeric;
  v_duration integer;
BEGIN
  SELECT s.staff_id INTO v_staff_id
  FROM staff s WHERE s.auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'No staff record linked to current user';
  END IF;

  SELECT te.started_at INTO v_started_at
  FROM timer_entries te
  WHERE te.timer_id = p_timer_id
    AND te.staff_id = v_staff_id
    AND te.ended_at IS NULL;

  IF v_started_at IS NULL THEN
    RAISE EXCEPTION 'Timer not found, not yours, or already stopped';
  END IF;

  v_clamped_end := LEAST(p_ended_at, v_started_at + interval '8 hours');
  v_raw_minutes := EXTRACT(EPOCH FROM (v_clamped_end - v_started_at)) / 60;
  v_duration := LEAST(480, GREATEST(5, ROUND(v_raw_minutes / 5.0) * 5));

  UPDATE timer_entries te
  SET ended_at = v_clamped_end,
      duration_minutes = v_duration
  WHERE te.timer_id = p_timer_id;

  RETURN QUERY SELECT p_timer_id, v_duration;
END;
$$;


--
-- Name: submit_timesheet_safe(uuid, uuid, uuid[], uuid[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_timesheet_safe(p_period_id uuid, p_staff_id uuid, p_engagement_ids uuid[], p_activity_ids uuid[], p_is_auto_approved boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_period                    RECORD;
  v_existing                  RECORD;
  v_max_te_updated            timestamptz;
  v_affected                  integer;
  v_pair_count                integer;
  i                           integer;
  v_eng_id                    uuid;
  v_act_id                    uuid;

  -- Per-engagement approval policy (BUG 0220-61)
  v_skip_approval             boolean;
  v_effective_auto            boolean;
  v_upgraded_to_approved      integer := 0;

  v_preserved_approved        integer := 0;
  v_reset_to_pending          integer := 0;
  v_kept_rejected             integer := 0;
  v_new_pending                integer := 0;
  v_new_auto_approved         integer := 0;
  v_guarded_update_skips      integer := 0;

  -- Min/max validation (BUG 0213-36)
  v_weekly_min                numeric;
  v_weekly_max                numeric;
  v_actual_hours              numeric;

  -- BUG 0306-74: Partial week proration
  v_hire_date                 date;
  v_term_date                 date;
  v_week_start                date;
  v_week_end                  date;
  v_eff_start                 date;
  v_eff_end                   date;
  v_total_workdays            integer;
  v_workable_days             integer;
  v_work_days_setting         integer;

  -- BUG 0526-122: Holiday engagement dynamic approval
  v_holiday_engagement_id     uuid;
  v_staff_city                text;
BEGIN
  -- 1. VALIDATE: Arrays must be same length and non-empty
  v_pair_count := array_length(p_engagement_ids, 1);
  IF v_pair_count IS NULL OR v_pair_count = 0 THEN
    RAISE EXCEPTION 'EMPTY_ENGAGEMENTS: No valid engagement/activity pairs after sanitization';
  END IF;
  IF COALESCE(array_length(p_activity_ids, 1), 0) <> v_pair_count THEN
    RAISE EXCEPTION 'ARRAY_LENGTH_MISMATCH: p_engagement_ids and p_activity_ids must be the same length';
  END IF;

  -- 2. LOCK: Acquire row-level lock on period
  SELECT period_id, staff_id, submitted_at
  INTO v_period
  FROM timesheet_periods
  WHERE period_id = p_period_id AND staff_id = p_staff_id
  FOR UPDATE;

  IF v_period IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Period % does not exist or does not belong to staff %', p_period_id, p_staff_id;
  END IF;

  -- BUG 0526-122: Resolve the holiday engagement and this staff's office once,
  -- used by the per-pair loop below to override its approval policy.
  SELECT NULLIF(TRIM(setting_value), '')::uuid INTO v_holiday_engagement_id
  FROM global_settings WHERE setting_key = 'HOLIDAY_ENGAGEMENT_ID';

  SELECT city INTO v_staff_city FROM staff WHERE staff_id = p_staff_id;

  -- BUG 0213-36: Enforce weekly min/max (period-scoped)
  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_MIN'), 40
  ) INTO v_weekly_min;

  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_MAX'), 40
  ) INTO v_weekly_max;

  -- BUG 0306-74: Prorate weekly limits for partial weeks (hire/termination only)
  -- BUG 0402-XX: Holidays are NOT subtracted — staff must log 8h on holiday engagement
  SELECT s.hire_date, s.termination_date INTO v_hire_date, v_term_date FROM staff s WHERE s.staff_id = p_staff_id;
  SELECT tp.week_start_date INTO v_week_start FROM timesheet_periods tp WHERE tp.period_id = p_period_id;
  SELECT COALESCE((SELECT setting_value::int FROM global_settings WHERE setting_key = 'TS_WORK_DAYS'), 5) INTO v_work_days_setting;
  v_week_end := v_week_start + (v_work_days_setting - 1);

  SELECT COUNT(*) INTO v_total_workdays
  FROM generate_series(v_week_start, v_week_end, '1 day'::interval) d
  WHERE EXTRACT(ISODOW FROM d) <= v_work_days_setting;

  v_eff_start := v_week_start;
  v_eff_end   := v_week_end;
  IF v_hire_date IS NOT NULL AND v_eff_start < v_hire_date THEN v_eff_start := v_hire_date; END IF;
  IF v_term_date IS NOT NULL AND v_eff_end   > v_term_date THEN v_eff_end   := v_term_date; END IF;

  SELECT COUNT(*) INTO v_workable_days
  FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
  WHERE EXTRACT(ISODOW FROM d) <= v_work_days_setting;

  IF v_total_workdays > 0 AND v_workable_days < v_total_workdays THEN
    v_weekly_min := ROUND(v_weekly_min * v_workable_days::numeric / v_total_workdays::numeric, 1);
    v_weekly_max := ROUND(v_weekly_max * v_workable_days::numeric / v_total_workdays::numeric, 1);
  END IF;

  SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual_hours
  FROM time_entries te
  WHERE te.period_id   = p_period_id
    AND te.staff_id    = p_staff_id
    AND te.is_forecast = false;

  IF v_actual_hours < v_weekly_min THEN
    RAISE EXCEPTION 'WEEKLY_MIN_NOT_MET:actual=%,min=%', v_actual_hours, v_weekly_min;
  END IF;

  IF v_actual_hours > v_weekly_max THEN
    RAISE EXCEPTION 'WEEKLY_MAX_EXCEEDED:actual=%,max=%', v_actual_hours, v_weekly_max;
  END IF;

  -- BUG 0220-63: Reject submission if any entry violates engagement date window
  IF EXISTS (
    SELECT 1
    FROM time_entries te
    JOIN engagements e ON te.engagement_id = e.engagement_id
    WHERE te.period_id   = p_period_id
      AND te.staff_id    = p_staff_id
      AND te.is_forecast = false
      AND (
        (e.start_date IS NOT NULL AND te.date_worked < e.start_date)
        OR (e.end_date IS NOT NULL AND te.date_worked > e.end_date)
      )
  ) THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE_VIOLATION: Period contains entries outside engagement date range';
  END IF;

  -- 3. UPDATE PERIOD: Set submitted_at
  UPDATE timesheet_periods
  SET submitted_at = now()
  WHERE period_id = p_period_id;

  -- 3b. DELETE orphaned pending/rejected rows for pairs that no longer have entries.
  -- This prevents stale rejected rows (from a changed activity) from keeping
  -- hasRejectedLines=true or blocking isFullyApproved in the frontend.
  -- Approved rows are intentionally excluded: the protect_approved_time_entries trigger
  -- prevents deleting entries on approved lines, so approved rows always have entries.
  DELETE FROM timesheet_line_approvals tla
  WHERE tla.period_id = p_period_id
    AND tla.status IN ('pending', 'rejected')
    AND NOT EXISTS (
      SELECT 1 FROM time_entries te
      WHERE te.period_id     = p_period_id
        AND te.engagement_id = tla.engagement_id
        AND te.activity_id   = tla.activity_id
        AND te.is_forecast   = false
    );

  -- 4-7. Process each (engagement, activity) pair
  FOR i IN 1 .. v_pair_count LOOP
    v_eng_id := p_engagement_ids[i];
    v_act_id := p_activity_ids[i];

    -- Skip NULLs
    IF v_eng_id IS NULL OR v_act_id IS NULL THEN CONTINUE; END IF;

    IF v_holiday_engagement_id IS NOT NULL AND v_eng_id = v_holiday_engagement_id THEN
      -- BUG 0526-122: dynamic per-date validation replaces both approval_required
      -- and p_is_auto_approved for this line — all-or-nothing per line, no bypass.
      SELECT NOT EXISTS (
        SELECT 1
        FROM time_entries te
        WHERE te.period_id     = p_period_id
          AND te.engagement_id = v_eng_id
          AND te.activity_id   = v_act_id
          AND te.is_forecast   = false
          AND NOT EXISTS (
            SELECT 1 FROM holidays h
            WHERE h.holiday_date = te.date_worked
              AND (
                h.oficina = 0
                OR (h.oficina = 1 AND v_staff_city = 'La Paz')
                OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
              )
          )
      )
      INTO v_effective_auto;
    ELSE
      -- BUG 0220-61: Fetch per-engagement approval policy (fail-safe default true)
      SELECT NOT COALESCE(e.approval_required, true)
      INTO v_skip_approval
      FROM engagements e WHERE e.engagement_id = v_eng_id;

      v_effective_auto := p_is_auto_approved OR COALESCE(v_skip_approval, false);
    END IF;

    -- 4. Fetch existing line approval for this (period, engagement, activity)
    SELECT approval_id, status, updated_at
    INTO v_existing
    FROM timesheet_line_approvals
    WHERE period_id     = p_period_id
      AND engagement_id = v_eng_id
      AND activity_id   = v_act_id;

    IF FOUND THEN
      -- b. Approved: SKIP
      IF v_existing.status = 'approved' THEN
        v_preserved_approved := v_preserved_approved + 1;
        CONTINUE;
      END IF;

      -- c. Pending: upgrade if effective auto-approve, otherwise skip
      IF v_existing.status = 'pending' THEN
        IF v_effective_auto THEN
          UPDATE timesheet_line_approvals
          SET status      = 'approved',
              approved_by = p_staff_id,
              approved_at = now()
          WHERE period_id     = p_period_id
            AND engagement_id = v_eng_id
            AND activity_id   = v_act_id
            AND status        = 'pending';
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          IF v_affected > 0 THEN
            v_upgraded_to_approved := v_upgraded_to_approved + 1;
          ELSE
            v_guarded_update_skips := v_guarded_update_skips + 1;
          END IF;
        END IF;
        CONTINUE;
      END IF;

      -- d. Rejected: auto-upgrade if effective auto, else check modified-since-rejection
      IF v_existing.status = 'rejected' THEN
        IF v_effective_auto THEN
          UPDATE timesheet_line_approvals
          SET status       = 'approved',
              approved_by  = p_staff_id,
              approved_at  = now(),
              review_notes = NULL
          WHERE period_id     = p_period_id
            AND engagement_id = v_eng_id
            AND activity_id   = v_act_id
            AND status        = 'rejected';
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          IF v_affected > 0 THEN
            v_upgraded_to_approved := v_upgraded_to_approved + 1;
          ELSE
            v_guarded_update_skips := v_guarded_update_skips + 1;
          END IF;
        ELSE
          SELECT MAX(te.updated_at)
          INTO v_max_te_updated
          FROM time_entries te
          WHERE te.period_id     = p_period_id
            AND te.engagement_id = v_eng_id
            AND te.activity_id   = v_act_id
            AND te.is_forecast   = false;

          IF v_max_te_updated IS NOT NULL AND v_max_te_updated > v_existing.updated_at THEN
            v_affected := 0;
            UPDATE timesheet_line_approvals
            SET status       = 'pending',
                approved_by  = NULL,
                approved_at  = NULL,
                review_notes = NULL
            WHERE period_id     = p_period_id
              AND engagement_id = v_eng_id
              AND activity_id   = v_act_id
              AND status        = 'rejected';

            GET DIAGNOSTICS v_affected = ROW_COUNT;

            IF v_affected = 0 THEN
              v_guarded_update_skips := v_guarded_update_skips + 1;
              v_preserved_approved   := v_preserved_approved + 1;
            ELSE
              v_reset_to_pending := v_reset_to_pending + 1;
            END IF;
          ELSE
            v_kept_rejected := v_kept_rejected + 1;
          END IF;
        END IF;

        CONTINUE;
      END IF;
    ELSE
      -- e. No existing row: INSERT
      IF v_effective_auto THEN
        INSERT INTO timesheet_line_approvals
          (period_id, engagement_id, activity_id, status, approved_by, approved_at)
        VALUES
          (p_period_id, v_eng_id, v_act_id, 'approved', p_staff_id, now());
        v_new_auto_approved := v_new_auto_approved + 1;
      ELSE
        INSERT INTO timesheet_line_approvals
          (period_id, engagement_id, activity_id, status)
        VALUES
          (p_period_id, v_eng_id, v_act_id, 'pending');
        v_new_pending := v_new_pending + 1;
      END IF;
    END IF;
  END LOOP;

  -- 7. Return summary
  RETURN jsonb_build_object(
    'period_id',              p_period_id,
    'preserved_approved',     v_preserved_approved,
    'reset_to_pending',       v_reset_to_pending,
    'kept_rejected',          v_kept_rejected,
    'new_pending',            v_new_pending,
    'new_auto_approved',      v_new_auto_approved,
    'guarded_update_skips',   v_guarded_update_skips,
    'upgraded_to_approved',   v_upgraded_to_approved
  );
END;
$$;


--
-- Name: sync_user_role_from_category(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_user_role_from_category(p_staff_id uuid, p_expected_role_key text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_is_admin         boolean;
  v_auth_user_id     uuid;
  v_category_id      uuid;
  v_suggested        text;
  v_current_role_key text;
  v_current_role     app_role;
begin
  -- AUTORIZACIÓN PRIMERO, antes de tomar candados y antes de leer cualquier fila.
  --
  -- Es SECURITY DEFINER, así que saltea RLS: sin este guard un autenticado cualquiera
  -- —o `anon`, que también tiene el GRANT— podía usar las respuestas como oráculo.
  -- ADMIN_PROTECTED vs NOT_ADMIN revelaba si la cuenta de un staff es administradora, y
  -- STAFF_NOT_LINKED revelaba si tiene cuenta vinculada, dato que `staff_directory`
  -- excluye a propósito por ser PII. Encima los candados se tomaban antes de autorizar,
  -- así que cualquiera podía provocar contención llamando en loop.
  --
  -- El predicado replica el de admin_set_user_role_key (role_key O el enum legacy) en vez
  -- de usar is_admin(), que mira solo el enum: con is_admin() este guard sería MÁS
  -- estricto que la función a la que delega y rechazaría a un admin que todavía no tiene
  -- role_key. Acá solo debe cortar temprano a quien la delegación ya iba a rechazar.
  select exists (
    select 1 from user_roles
    where user_id = auth.uid()
      and (role_key = 'admin' or role = 'admin')
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object('success', false, 'code', 'NOT_ADMIN',
      'message', 'Only admins can change roles');
  end if;

  -- Recibe el STAFF, no el usuario ni el rol ya resueltos. Esa es la diferencia: el rol a
  -- aplicar tiene que ser el que la categoría VIGENTE de ese staff sugiere, verificado con
  -- las filas bloqueadas. Con la firma anterior —(user_id, role_key)— la función no miraba
  -- ninguna categoría, así que si otro admin cambiaba la categoría del staff, rompía el
  -- vínculo de cuenta o editaba la sugerencia de la categoría destino mientras el diálogo
  -- estaba abierto, se aplicaba igual un rol que ya no correspondía a nada.
  --
  -- `p_expected_role_key` es lo que el admin CONFIRMÓ en el diálogo. Si la sugerencia
  -- cambió en el medio, se rechaza en vez de aplicar la nueva: nadie debe terminar con un
  -- rol que no vio.

  -- `admin` no es un rol sugerible por categoría (ver categories_default_role_key_not_admin).
  -- El CHECK ya impide guardarlo, pero esta función es una entrada pública: se rechaza acá
  -- también, para que no exista ningún camino de escalada vía sincronización.
  if p_expected_role_key is null or p_expected_role_key = 'admin' then
    return jsonb_build_object('success', false, 'code', 'ADMIN_TARGET_FORBIDDEN',
      'message', 'A category may not suggest the admin role');
  end if;

  perform pg_advisory_xact_lock(67890);

  -- Se bloquea el staff: de acá en adelante nadie le cambia la categoría ni el vínculo de
  -- cuenta hasta que esta transacción termine.
  select auth_user_id, category_id
    into v_auth_user_id, v_category_id
    from staff
   where staff_id = p_staff_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'STAFF_NOT_FOUND',
      'message', 'Staff not found');
  end if;

  if v_auth_user_id is null then
    return jsonb_build_object('success', false, 'code', 'STAFF_NOT_LINKED',
      'message', 'Staff has no linked account');
  end if;

  -- Y se bloquea la categoría, porque su sugerencia es parte de la precondición.
  select default_role_key into v_suggested
    from categories
   where category_id = v_category_id
   for update;

  -- `is distinct from` cubre los tres casos de una vez: la categoría cambió, la sugerencia
  -- se editó, o la categoría dejó de sugerir algo (NULL).
  if v_suggested is distinct from p_expected_role_key then
    return jsonb_build_object('success', false, 'code', 'CATEGORY_SUGGESTION_CHANGED',
      'message', 'The category no longer suggests the confirmed role',
      'expected_role_key', p_expected_role_key, 'current_role_key', v_suggested);
  end if;

  select role_key, role into v_current_role_key, v_current_role
    from user_roles
   where user_id = v_auth_user_id
   for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'USER_NOT_FOUND',
      'message', 'User role not found');
  end if;

  -- El invariante, evaluado con las filas bloqueadas: de acá al UPDATE nadie puede
  -- promover a esta persona a admin sin esperar a que esta transacción termine.
  --
  -- Se miran LAS DOS representaciones, igual que el guard del llamante de más arriba. Un
  -- admin puede tener `role = 'admin'` con `role_key` nulo o desfasado: el RPC deprecado
  -- `admin_set_user_role` sigue concedido y escribe SOLO el enum. Mirar únicamente
  -- `role_key` lo dejaría fuera del guard, y la delegación pisaría ambas columnas — y el
  -- LAST_ADMIN de admin_set_user_role_key tampoco lo frenaría, porque cuenta por role_key.
  if v_current_role_key = 'admin' or v_current_role = 'admin' then
    return jsonb_build_object('success', false, 'code', 'ADMIN_PROTECTED',
      'message', 'Category sync never demotes an admin');
  end if;

  -- Delegación: los candados siguen tomados por esta transacción, así que la relectura de
  -- admin_set_user_role_key ve exactamente lo que se validó arriba.
  return public.admin_set_user_role_key(v_auth_user_id, p_expected_role_key, p_reason);
end;
$$;


--
-- Name: FUNCTION sync_user_role_from_category(p_staff_id uuid, p_expected_role_key text, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sync_user_role_from_category(p_staff_id uuid, p_expected_role_key text, p_reason text) IS 'Aplica a un staff el rol que su categoría VIGENTE sugiere (BUG 0820-182). Recibe el staff, no el usuario ni el rol ya resueltos, y verifica con las filas bloqueadas que el vínculo de cuenta y la sugerencia de la categoría sigan siendo los que el admin confirmó. Delega en admin_set_user_role_key agregando dos precondiciones que esa función no tiene y que este flujo sí promete: nunca degradar a un admin, y nunca asignar admin. Todo con candados, de modo que las garantías son atómicas y no carreras del cliente.';


--
-- Name: wo_payment_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_payment_installments (
    installment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    wo_id uuid NOT NULL,
    installment_number integer NOT NULL,
    agreed_invoice_date date,
    agreed_payment_date date,
    collection_invoice_date date,
    collection_payment_date date,
    payment_date_actual date,
    percentage numeric DEFAULT 0 NOT NULL,
    amount numeric,
    status text DEFAULT 'Pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    invoice_exchange_rate numeric,
    payment_exchange_rate numeric,
    CONSTRAINT wo_payment_installments_invoice_exchange_rate_check CHECK (((invoice_exchange_rate IS NULL) OR (invoice_exchange_rate > (0)::numeric))),
    CONSTRAINT wo_payment_installments_payment_exchange_rate_check CHECK (((payment_exchange_rate IS NULL) OR (payment_exchange_rate > (0)::numeric))),
    CONSTRAINT wo_payment_installments_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Invoiced'::text, 'Completed'::text, 'Overdue'::text])))
);


--
-- Name: sync_wo_payment_installments(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_wo_payment_installments(p_plan_id uuid, p_wo_id uuid, p_installments jsonb) RETURNS SETOF public.wo_payment_installments
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_kept_ids uuid[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.wo_payment_plan
    WHERE plan_id = p_plan_id AND wo_id = p_wo_id
  ) THEN
    RAISE EXCEPTION 'PLAN_WO_MISMATCH: el plan de pagos indicado no pertenece a la orden de trabajo indicada';
  END IF;

  SELECT array_agg((row_data->>'installment_id')::uuid)
  INTO v_kept_ids
  FROM jsonb_array_elements(p_installments) AS row_data
  WHERE row_data->>'installment_id' IS NOT NULL;

  IF v_kept_ids IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.wo_payment_installments existing
    WHERE existing.installment_id = ANY (v_kept_ids)
      AND existing.plan_id <> p_plan_id
  ) THEN
    RAISE EXCEPTION 'INSTALLMENT_PLAN_MISMATCH: una o mas cuotas del payload no pertenecen al plan de pagos indicado';
  END IF;

  -- Borra huerfanos PRIMERO, para que una fila renumerada no choque contra el UNIQUE
  -- (plan_id, installment_number) de una fila vieja que todavia no se borro -- mismo
  -- orden que ya usaba useBatchUpsertInstallments, ahora atomico con el paso de abajo.
  IF v_kept_ids IS NOT NULL AND array_length(v_kept_ids, 1) > 0 THEN
    DELETE FROM public.wo_payment_installments
    WHERE plan_id = p_plan_id AND installment_id <> ALL (v_kept_ids);
  ELSE
    DELETE FROM public.wo_payment_installments
    WHERE plan_id = p_plan_id;
  END IF;

  RETURN QUERY
  INSERT INTO public.wo_payment_installments AS w (
    installment_id, plan_id, wo_id, installment_number,
    agreed_invoice_date, agreed_payment_date,
    collection_invoice_date, collection_payment_date, payment_date_actual,
    percentage, amount, status, invoice_exchange_rate, payment_exchange_rate
  )
  SELECT
    COALESCE((row_data->>'installment_id')::uuid, gen_random_uuid()),
    p_plan_id,
    p_wo_id,
    (row_data->>'installment_number')::integer,
    (row_data->>'agreed_invoice_date')::date,
    (row_data->>'agreed_payment_date')::date,
    (row_data->>'collection_invoice_date')::date,
    (row_data->>'collection_payment_date')::date,
    (row_data->>'payment_date_actual')::date,
    (row_data->>'percentage')::numeric,
    (row_data->>'amount')::numeric,
    row_data->>'status',
    (row_data->>'invoice_exchange_rate')::numeric,
    (row_data->>'payment_exchange_rate')::numeric
  FROM jsonb_array_elements(p_installments) AS row_data
  ON CONFLICT (installment_id) DO UPDATE SET
    installment_number = EXCLUDED.installment_number,
    agreed_invoice_date = EXCLUDED.agreed_invoice_date,
    agreed_payment_date = EXCLUDED.agreed_payment_date,
    collection_invoice_date = EXCLUDED.collection_invoice_date,
    collection_payment_date = EXCLUDED.collection_payment_date,
    payment_date_actual = EXCLUDED.payment_date_actual,
    percentage = EXCLUDED.percentage,
    amount = EXCLUDED.amount,
    status = EXCLUDED.status,
    invoice_exchange_rate = EXCLUDED.invoice_exchange_rate,
    payment_exchange_rate = EXCLUDED.payment_exchange_rate
  RETURNING w.*;
END;
$$;


--
-- Name: sync_worksheet_to_wo_budget(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_worksheet_to_wo_budget(p_worksheet_id uuid, p_wo_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_wo RECORD;
BEGIN
    -- Get work order details for rate calculation
    SELECT wo_id, currency, season_mode INTO v_wo
    FROM work_orders
    WHERE wo_id = p_wo_id;

    IF v_wo IS NULL THEN
        RAISE EXCEPTION 'Work order not found: %', p_wo_id;
    END IF;

    -- Link worksheet to work order
    UPDATE activity_worksheets
    SET wo_id = p_wo_id, updated_at = now()
    WHERE id = p_worksheet_id;

    -- Delete existing budget lines for this work order
    DELETE FROM wo_budget_lines WHERE wo_id = p_wo_id;

    -- Insert aggregated budget lines from worksheet cells
    INSERT INTO wo_budget_lines (wo_id, category_id, budgeted_hours, standard_rate)
    SELECT
        p_wo_id,
        awc.category_id,
        SUM(awc.budget_hours),
        -- Calculate rate based on currency and season
        CASE
            WHEN v_wo.currency = 'USD' AND v_wo.season_mode = 'High' THEN c.rate_high_usd
            WHEN v_wo.currency = 'USD' AND v_wo.season_mode = 'Low' THEN c.rate_low_usd
            WHEN v_wo.currency = 'BOB' AND v_wo.season_mode = 'High' THEN c.rate_high_bob
            ELSE c.rate_low_bob
        END
    FROM activity_worksheet_cells awc
    JOIN categories c ON c.category_id = awc.category_id
    WHERE awc.worksheet_id = p_worksheet_id
      AND awc.budget_hours > 0
    GROUP BY awc.category_id, c.rate_high_usd, c.rate_low_usd, c.rate_high_bob, c.rate_low_bob;
END;
$$;


--
-- Name: unsubmit_timesheet_safe(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unsubmit_timesheet_safe(p_period_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id     uuid;
  v_period       record;
  v_all_approved boolean;
BEGIN
  -- 1. Resolve caller's staff_id via auth.uid()
  SELECT s.staff_id
    INTO v_staff_id
    FROM staff s
   WHERE s.auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_OWNER';
  END IF;

  -- 2. Load and row-lock the period
  SELECT tp.*
    INTO v_period
    FROM timesheet_periods tp
   WHERE tp.period_id = p_period_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_OWNER';
  END IF;

  -- 3. Caller must own the period
  IF v_period.staff_id IS DISTINCT FROM v_staff_id THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_OWNER';
  END IF;

  -- 4. Reject hard-locked periods
  IF v_period.is_period_locked THEN
    RAISE EXCEPTION 'UNSUBMIT_PERIOD_LOCKED';
  END IF;

  -- 5. Reject periods that were never submitted
  IF v_period.submitted_at IS NULL THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_SUBMITTED';
  END IF;

  -- 6. Detect fully-approved status (COALESCE: bool_and on empty set returns NULL, not false)
  SELECT COALESCE(bool_and(tla.status = 'approved'), false)
    INTO v_all_approved
    FROM timesheet_line_approvals tla
   WHERE tla.period_id = p_period_id;

  -- 6b. Only admin or partner roles can recall a fully-approved period
  IF v_all_approved THEN
    IF NOT EXISTS (
      SELECT 1 FROM user_roles
       WHERE user_id = auth.uid()
         AND role IN ('partner', 'admin')
    ) THEN
      RAISE EXCEPTION 'UNSUBMIT_NOT_PARTNER';
    END IF;
  END IF;

  -- 7. Week-window guard (only for fully-approved periods)
  --    current_date is UTC; frontend provides the first enforcement layer.
  --    Decision OQ1: UTC-only (safe over-restriction near week boundaries).
  --    Decision OQ5: Mon–Sun inclusive (+6 days from week_start_date).
  IF v_all_approved THEN
    IF current_date NOT BETWEEN v_period.week_start_date
                             AND v_period.week_start_date + 6 THEN
      RAISE EXCEPTION 'APPROVED_WEEK_RECALL_WINDOW_CLOSED';
    END IF;
  END IF;

  -- 8. Clear submitted_at
  UPDATE timesheet_periods
     SET submitted_at = NULL
   WHERE period_id = p_period_id;

  -- 9. Delete approved line approval rows so the APPROVED_LINE_LOCKED trigger
  --    no longer blocks edits, and so re-submit's INSERT path re-fires auto-approval.
  IF v_all_approved THEN
    DELETE FROM timesheet_line_approvals
     WHERE period_id = p_period_id
       AND status    = 'approved';
  END IF;
END;
$$;


--
-- Name: update_category_for_practice(uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_category_for_practice(p_category_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role, p_default_role_key text) RETURNS public.categories
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica_id uuid;
  v_old_pos    integer;
  v_total      integer;
  v_new_pos    integer;
  v_row        public.categories;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock the target category.
  SELECT practica_id, display_order
    INTO v_practica_id, v_old_pos
    FROM public.categories
   WHERE category_id = p_category_id
   FOR UPDATE;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM public.categories
   WHERE practica_id = v_practica_id;

  -- Clamp requested order to the valid range.
  v_new_pos := GREATEST(1, LEAST(COALESCE(p_display_order, v_old_pos), v_total));

  IF v_new_pos <> v_old_pos THEN
    IF v_new_pos < v_old_pos THEN
      -- Moving up: push the block [new, old-1] down by one.
      UPDATE public.categories
         SET display_order = display_order + 1
       WHERE practica_id = v_practica_id
         AND display_order >= v_new_pos
         AND display_order <  v_old_pos;
    ELSE
      -- Moving down: pull the block [old+1, new] up by one.
      UPDATE public.categories
         SET display_order = display_order - 1
       WHERE practica_id = v_practica_id
         AND display_order >  v_old_pos
         AND display_order <= v_new_pos;
    END IF;
  END IF;

  UPDATE public.categories
     SET category_name          = p_category_name,
         display_order          = v_new_pos,
         rate_high_bob          = p_rate_high_bob,
         rate_low_bob           = p_rate_low_bob,
         rate_high_usd          = p_rate_high_usd,
         rate_low_usd           = p_rate_low_usd,
         can_approve_wo         = p_can_approve_wo,
         can_approve_timesheets = p_can_approve_timesheets,
         default_app_role       = p_default_app_role,
         default_role_key       = p_default_role_key,
         updated_at             = now()
   WHERE category_id = p_category_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: update_timesheet_minmax_settings(numeric, numeric, numeric, numeric, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_timesheet_minmax_settings(p_daily_min numeric, p_daily_max numeric, p_weekly_min numeric, p_weekly_max numeric, p_work_days integer DEFAULT 5) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_daily_min > p_daily_max THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DAILY_MIN_EXCEEDS_MAX');
  END IF;

  IF p_weekly_min > p_weekly_max THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MIN_EXCEEDS_MAX');
  END IF;

  IF p_weekly_min > p_daily_max * p_work_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MIN_EXCEEDS_DAILY_MAX');
  END IF;

  IF p_weekly_max < p_daily_min * p_work_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MAX_BELOW_DAILY_MIN');
  END IF;

  UPDATE global_settings SET setting_value = p_daily_min::text, updated_at = now()
  WHERE setting_key = 'DAILY_MIN';
  UPDATE global_settings SET setting_value = p_daily_max::text, updated_at = now()
  WHERE setting_key = 'DAILY_MAX';
  UPDATE global_settings SET setting_value = p_weekly_min::text, updated_at = now()
  WHERE setting_key = 'WEEKLY_MIN';
  UPDATE global_settings SET setting_value = p_weekly_max::text, updated_at = now()
  WHERE setting_key = 'WEEKLY_MAX';

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: validate_email_domain(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_email_domain() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  allowed_domain TEXT;
  user_domain TEXT;
BEGIN
  -- Get allowed domain from global_settings
  SELECT setting_value INTO allowed_domain
  FROM public.global_settings
  WHERE setting_key = 'ALLOWED_EMAIL_DOMAIN';

  -- If no setting found or empty, allow all domains
  IF allowed_domain IS NULL OR allowed_domain = '' THEN
    RETURN NEW;
  END IF;

  -- Extract domain from email
  user_domain := split_part(NEW.email, '@', 2);

  -- Check if domain matches (case-insensitive)
  IF lower(user_domain) != lower(allowed_domain) THEN
    RAISE EXCEPTION 'Registration restricted to @% emails only', allowed_domain;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_submission_has_entries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_submission_has_entries() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_entry_count integer;
BEGIN
  -- Only fires when submitted_at transitions NULL -> NOT NULL (via WHEN clause)
  SELECT COUNT(*) INTO v_entry_count
  FROM time_entries te
  WHERE te.staff_id = NEW.staff_id
    AND te.date_worked >= NEW.week_start_date
    AND te.date_worked <= NEW.week_start_date + 4  -- Monday through Friday inclusive
    AND te.is_forecast = false;

  IF v_entry_count = 0 THEN
    RAISE EXCEPTION 'SUBMIT_NO_ENTRIES: Cannot submit a timesheet with no time entries for week starting %', NEW.week_start_date;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_timer_entry_duration(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_timer_entry_duration() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL THEN
    IF NEW.ended_at > NEW.started_at + interval '8 hours' THEN
      RAISE EXCEPTION 'Timer entry cannot exceed 8 hours';
    END IF;
  END IF;
  IF NEW.duration_minutes IS NOT NULL AND NEW.duration_minutes > 480 THEN
    RAISE EXCEPTION 'Duration cannot exceed 480 minutes (8 hours)';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_timer_entry_duration(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_timer_entry_duration() IS 'Validates 8h max on timer_entries. Legacy data cleaned by migration (Bug 0213-31).';


--
-- Name: wo_guard_risk_approval(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wo_guard_risk_approval() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.engagements e
     WHERE e.engagement_id = NEW.engagement_id
       AND e.funcion IS NOT NULL
       AND e.funcion <> 1
  ) THEN
    RETURN NEW;
  END IF;

  IF (
    (NEW.risk_approved_by IS DISTINCT FROM OLD.risk_approved_by AND NEW.risk_approved_by IS NOT NULL)
    OR (NEW.risk_status IS DISTINCT FROM OLD.risk_status
        AND NEW.risk_status IN ('Approved', 'Rejected', 'Emergency_Approved'))
    OR (NEW.emergency_review_by IS DISTINCT FROM OLD.emergency_review_by AND NEW.emergency_review_by IS NOT NULL)
    OR (NEW.emergency_partner_by IS DISTINCT FROM OLD.emergency_partner_by AND NEW.emergency_partner_by IS NOT NULL)
  ) AND NOT public.can_approve_wo_risk(NEW.engagement_id) THEN
    RAISE EXCEPTION 'Solo un aprobador de Riesgos autorizado puede aprobar o rechazar la seccion de Riesgos de esta OT';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: wo_in_my_fund_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wo_in_my_fund_request(p_wo_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.fund_request_work_orders frwo
    join public.fund_requests fr on fr.fund_request_id = frwo.fund_request_id
    where frwo.wo_id = p_wo_id
      -- Solo solicitudes YA ENVIADAS: un borrador no debe conceder lectura de la
      -- OT base (en borrador la info viene de la vista segura
      -- fund_request_selectable_work_orders).
      and fr.status <> 'borrador'
      and (
        fr.requester_staff_id = get_my_staff_id()
        or frwo.manager_staff_id = get_my_staff_id()
        -- Contabilidad, con el MISMO corte que fr_select_accounting (Ola D):
        --   Gerente (fund_disbursement.read)  -> toda la fase contable.
        --   Analista (expense_settlement.read) -> hasta 'fondos_entregados'; queda
        --   fuera de 'en_liquidacion' y 'cerrado'.
        or (public.has_permission('fund_disbursement.read')
            and fr.status = any (array['aprobado_gerente','fondos_entregados',
                                       'en_liquidacion','cerrado']::fund_request_status[]))
        or (public.has_permission('expense_settlement.read')
            and fr.status = any (array['aprobado_gerente','fondos_entregados']::fund_request_status[]))
      )
  );
$$;


--
-- Name: FUNCTION wo_in_my_fund_request(p_wo_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.wo_in_my_fund_request(p_wo_id uuid) IS 'True si la OT está incluida en una solicitud de fondos ENVIADA donde el usuario es solicitante, gerente de esa OT, o Contabilidad (expense_settlement.read) con la solicitud en fase contable. Habilita el embed work_order de los selects de fondos sin abrir la tabla base work_orders.';


--
-- Name: wo_payment_installments_guard_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wo_payment_installments_guard_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status <> 'Pending' THEN
    RAISE EXCEPTION 'INSTALLMENT_LOCKED: esta cuota ya fue facturada y no puede eliminarse';
  END IF;
  RETURN OLD;
END;
$$;


--
-- Name: wo_payment_installments_guard_exchange_rate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wo_payment_installments_guard_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approval_status text;
  v_exchange_rate_mode text;
  v_plan_exchange_rate numeric;
  v_plan_wo_id uuid;
  v_legal_transition boolean;
  v_is_accounting_or_admin boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.wo_payment_installments WHERE installment_id = NEW.installment_id) THEN
      -- No es una insercion real -- resolvera como UPDATE por conflicto; el BEFORE
      -- UPDATE real que Postgres dispara a continuacion para esta misma fila aplica
      -- el resto de este guard con el OLD correcto.
      RETURN NEW;
    END IF;
    IF NEW.status <> 'Pending' THEN
      RAISE EXCEPTION 'INSTALLMENT_LOCKED: una cuota nueva debe crearse en estado Pending';
    END IF;

    -- MUST FIX review iteracion 18 #1: se resuelve el plan por NEW.plan_id (la
    -- referencia que la fila declara), no por NEW.wo_id -- un wo_id que no coincida
    -- con el wo_id real del plan se rechaza explicitamente en el chequeo de abajo,
    -- en vez de dejar que la fila quede insertada con una referencia inconsistente.
    SELECT p.wo_id, p.exchange_rate_mode, p.exchange_rate, wo.approval_status
    INTO v_plan_wo_id, v_exchange_rate_mode, v_plan_exchange_rate, v_approval_status
    FROM public.wo_payment_plan p
    JOIN public.work_orders wo ON wo.wo_id = p.wo_id
    WHERE p.plan_id = NEW.plan_id;

    IF v_plan_wo_id IS DISTINCT FROM NEW.wo_id THEN
      RAISE EXCEPTION 'INSTALLMENT_WO_MISMATCH: el wo_id de la cuota no coincide con el de su plan de pagos';
    END IF;

    -- MUST FIX review iteracion 19 #2 (codex): nada en el branch de INSERT
    -- consultaba approval_status -- en modo Variable, un gerente podia insertar
    -- directamente una cuota Pending con invoice_exchange_rate/payment_exchange_rate
    -- arbitrarios en un plan YA Aprobado; los chequeos de rol/aprobacion de esas 2
    -- columnas (mas abajo) solo corren cuando CAMBIAN en un UPDATE posterior, asi
    -- que un collections_analyst que solo transiciona status despues nunca los
    -- dispara -- bypass completo del modelo de autorizacion de la Iteracion 13 por
    -- una via nunca cubierta. No rompe ningun flujo legitimo: isEditable &&
    -- canEditPaymentPlan ya le impide a la UI agregar cuotas una vez Aprobada.
    --
    -- MUST FIX review iteracion 20 #1 (greptile): el chequeo original solo
    -- comparaba contra 'Approved' -- una OT en 'Pending_Approval' (enviada a
    -- revision, esperando al socio) quedaba con el plan de pagos "de solo
    -- lectura" segun el mismo criterio ya usado en wo_payment_plan_guard_exchange_rate
    -- (que si bloquea INSERT/DELETE del plan en ambos estados), pero el INSERT de
    -- una cuota nueva se colaba igual durante esa ventana.
    IF NOT public.is_admin() AND v_approval_status IN ('Approved', 'Pending_Approval') THEN
      RAISE EXCEPTION 'INSTALLMENT_LOCKED: no se pueden agregar cuotas nuevas a un plan de pagos cuya orden de trabajo ya fue aprobada o esta en revision';
    END IF;

    IF v_exchange_rate_mode = 'fijo' AND (
      NEW.invoice_exchange_rate IS DISTINCT FROM v_plan_exchange_rate
      OR NEW.payment_exchange_rate IS DISTINCT FROM v_plan_exchange_rate
    ) THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: en modo fijo, el tipo de cambio de una cuota nueva debe coincidir con el del plan';
    END IF;

    RETURN NEW;
  END IF;

  -- MUST FIX review iteracion 18 #1 (greptile): plan_id/wo_id de una cuota nunca eran
  -- inmutables para nadie que no fuera collections_analyst (el chequeo de abajo solo
  -- restringe ESE rol) -- un gerente (o cualquier team member con UPDATE) podia
  -- reasignar wo_id a una OT Approved ajena en el mismo UPDATE que factura la cuota;
  -- el chequeo de aprobacion de mas abajo resolvia la OT via el NEW.wo_id ya
  -- manipulado, no via el plan real, y pasaba. Se congela plan_id/wo_id para TODO
  -- rol, sin excepcion de is_admin() -- mismo criterio que WO_ID_IMMUTABLE en
  -- wo_payment_plan_guard_exchange_rate: no hay motivo legitimo para reasignar una
  -- cuota a otro plan/OT (el flujo real borra la fila huerfana e inserta una nueva
  -- via sync_wo_payment_installments).
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.wo_id IS DISTINCT FROM OLD.wo_id THEN
    RAISE EXCEPTION 'INSTALLMENT_PLAN_IMMUTABLE: una cuota no puede reasignarse a otro plan de pagos ni a otra orden de trabajo';
  END IF;

  -- MUST FIX review iteracion 16 #1 (greptile + codex): la policy RLS "Accounting can
  -- update payment installments" (mas abajo en este archivo) autoriza a
  -- collections_analyst a hacer UPDATE de la fila COMPLETA -- ningun chequeo de este
  -- trigger restringia por columna para ese rol especificamente. Sin este guard, un
  -- collections_analyst podia reasignar la cuota a otro plan/OT (plan_id/wo_id) o
  -- tocar fechas/porcentaje/monto "acordados" -- campos que la decision del operador
  -- 2026-09-10 (ver plan_v2.md, Amendment del mismo dia) reservo exclusivamente al
  -- gerente del encargo. Se rechaza cualquier cambio a esas columnas hecho por un
  -- collections_analyst no-admin; status, fechas de Cobranza
  -- (collection_invoice_date/collection_payment_date/payment_date_actual) e
  -- invoice_exchange_rate/payment_exchange_rate (ya gateadas mas abajo) quedan sin
  -- restriccion adicional por este chequeo -- son exactamente las columnas que ese rol
  -- SI debe poder tocar.
  -- plan_id/wo_id ya no estan en esta lista: el guard universal de arriba (review
  -- iteracion 18 #1) los congela para todo rol, incluido collections_analyst.
  -- MUST FIX review iteracion 18 #5 (greptile + codex): created_at no estaba en el
  -- allowlist -- a diferencia de updated_at (restaurado por
  -- update_wo_payment_installments_updated_at en cada UPDATE), nada impedia que
  -- collections_analyst falsificara la fecha de creacion de una cuota via un UPDATE
  -- directo.
  IF NOT public.is_admin() AND public.current_role_key() = 'collections_analyst' THEN
    IF NEW.agreed_invoice_date IS DISTINCT FROM OLD.agreed_invoice_date
       OR NEW.agreed_payment_date IS DISTINCT FROM OLD.agreed_payment_date
       OR NEW.percentage IS DISTINCT FROM OLD.percentage
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'INSTALLMENT_FIELD_FORBIDDEN: contabilidad solo puede modificar estado, fechas de cobranza y tipo de cambio por cuota';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_legal_transition := CASE OLD.status
      WHEN 'Pending'   THEN NEW.status = 'Invoiced'
      WHEN 'Overdue'   THEN NEW.status = 'Invoiced'
      WHEN 'Invoiced'  THEN NEW.status IN ('Completed', 'Overdue')
      ELSE false
    END;
    IF NOT v_legal_transition THEN
      RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: % -> % no es una transicion de estado permitida', OLD.status, NEW.status;
    END IF;

    -- Iteración 17 #2 (codex): la UI (isStatusEditable) exige la OT Aprobada para
    -- transicionar el estado de una cuota -- la base de datos nunca lo replicaba,
    -- solo validaba que la transicion fuera legal. Sin esto, un collections_analyst
    -- (o cualquiera con RLS de escritura sobre esta tabla) podia facturar/completar
    -- una cuota de una OT todavia en Draft o en revision via un UPDATE directo.
    -- MUST FIX review iteracion 18 #1: se resuelve la OT dueña via NEW.plan_id -> el
    -- wo_id real del plan, no via NEW.wo_id directamente -- defensa en profundidad
    -- ademas del guard de inmutabilidad de arriba (si ese guard alguna vez cambiara,
    -- este chequeo sigue mirando la OT correcta, nunca una que el propio UPDATE haya
    -- intentado falsificar).
    IF NOT public.is_admin() THEN
      SELECT wo.approval_status INTO v_approval_status
      FROM public.wo_payment_plan p
      JOIN public.work_orders wo ON wo.wo_id = p.wo_id
      WHERE p.plan_id = NEW.plan_id;

      IF v_approval_status IS DISTINCT FROM 'Approved' THEN
        RAISE EXCEPTION 'INSTALLMENT_LOCKED: la transicion de estado de una cuota solo puede hacerse con la orden de trabajo aprobada';
      END IF;
    END IF;
  END IF;

  -- MUST FIX review iteracion 19 #1 (codex): la UI (isStatusEditable) exige OT
  -- Aprobada para TODA la seccion de Cobranza (estado + fechas + TC) -- la base de
  -- datos solo lo replicaba para la transicion de estado (arriba, Iteracion 17 #2)
  -- y las 2 columnas de TC (mas abajo), nunca para estas 3 fechas cuando cambian
  -- solas (sin cambiar status en el mismo UPDATE). Un collections_analyst podia
  -- registrar fechas de facturacion/pago/cobro de una cuota de una OT todavia en
  -- Draft o en revision via useUpdateCollectionDate.
  IF NEW.collection_invoice_date IS DISTINCT FROM OLD.collection_invoice_date
     OR NEW.collection_payment_date IS DISTINCT FROM OLD.collection_payment_date
     OR NEW.payment_date_actual IS DISTINCT FROM OLD.payment_date_actual THEN
    IF NOT public.is_admin() THEN
      SELECT wo.approval_status INTO v_approval_status
      FROM public.wo_payment_plan p
      JOIN public.work_orders wo ON wo.wo_id = p.wo_id
      WHERE p.plan_id = NEW.plan_id;

      IF v_approval_status IS DISTINCT FROM 'Approved' THEN
        RAISE EXCEPTION 'INSTALLMENT_LOCKED: las fechas de cobranza de una cuota solo pueden registrarse con la orden de trabajo aprobada';
      END IF;
    END IF;
  END IF;

  -- MUST FIX review iteracion 2 #1/#3 (decision del operador 2026-09-07: "si una cuota
  -- ya esta facturada, no se puede modificar o eliminar de ninguna manera"): una vez
  -- que status sale de 'Pending', percentage/amount/installment_number tambien quedan
  -- congelados -- no solo las 2 columnas de TC. Sin esto, agregar/quitar cuotas del
  -- plan podia redistribuir el porcentaje de una cuota ya facturada, desalineandolo
  -- del TC ya congelado (que se calculo sobre el porcentaje original).
  IF OLD.status <> 'Pending' AND (
    NEW.percentage IS DISTINCT FROM OLD.percentage
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
  ) THEN
    RAISE EXCEPTION 'INSTALLMENT_LOCKED: esta cuota ya fue facturada y no puede modificarse (porcentaje/monto/numero)';
  END IF;

  IF NEW.invoice_exchange_rate IS DISTINCT FROM OLD.invoice_exchange_rate
     OR NEW.payment_exchange_rate IS DISTINCT FROM OLD.payment_exchange_rate THEN
    -- review iteracion 18 #1: resuelto via NEW.plan_id (mismo criterio que el resto
    -- de este trigger tras el fix), no via NEW.wo_id directamente.
    SELECT wo.approval_status, p.exchange_rate_mode, p.exchange_rate
    INTO v_approval_status, v_exchange_rate_mode, v_plan_exchange_rate
    FROM public.wo_payment_plan p
    JOIN public.work_orders wo ON wo.wo_id = p.wo_id
    WHERE p.plan_id = NEW.plan_id;
  END IF;

  IF NEW.invoice_exchange_rate IS DISTINCT FROM OLD.invoice_exchange_rate THEN
    IF OLD.status <> 'Pending' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de facturacion de esta cuota ya esta congelado';
    END IF;
    IF v_exchange_rate_mode = 'variable' THEN
      IF v_approval_status IS DISTINCT FROM 'Approved' THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de facturacion solo puede capturarse una vez que la orden de trabajo fue aprobada';
      END IF;
      SELECT is_admin() OR COALESCE(current_role_key() = 'collections_analyst', false) INTO v_is_accounting_or_admin;
      IF NOT v_is_accounting_or_admin THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_FORBIDDEN: solo contabilidad (o un administrador) puede capturar el tipo de cambio de facturacion por cuota';
      END IF;
    END IF;
    IF v_exchange_rate_mode = 'fijo' AND NEW.invoice_exchange_rate IS DISTINCT FROM v_plan_exchange_rate THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: en modo fijo, el tipo de cambio de facturacion de la cuota debe coincidir con el del plan';
    END IF;
  END IF;

  IF NEW.payment_exchange_rate IS DISTINCT FROM OLD.payment_exchange_rate THEN
    IF OLD.status = 'Completed' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de pago de esta cuota ya esta congelado';
    END IF;
    IF v_exchange_rate_mode = 'variable' THEN
      IF OLD.status = 'Pending' THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de pago solo puede capturarse una vez facturada la cuota';
      END IF;
      IF v_approval_status IS DISTINCT FROM 'Approved' THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de pago solo puede capturarse una vez que la orden de trabajo fue aprobada';
      END IF;
      SELECT is_admin() OR COALESCE(current_role_key() = 'collections_analyst', false) INTO v_is_accounting_or_admin;
      IF NOT v_is_accounting_or_admin THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_FORBIDDEN: solo contabilidad (o un administrador) puede capturar el tipo de cambio de pago por cuota';
      END IF;
    END IF;
    IF v_exchange_rate_mode = 'fijo' AND NEW.payment_exchange_rate IS DISTINCT FROM v_plan_exchange_rate THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: en modo fijo, el tipo de cambio de pago de la cuota debe coincidir con el del plan';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: wo_payment_plan_guard_exchange_rate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wo_payment_plan_guard_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approval_status text;
  v_has_locked_installment boolean;
  v_is_manager_or_admin boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT approval_status INTO v_approval_status
    FROM public.work_orders
    WHERE wo_id = OLD.wo_id;

    IF v_approval_status IN ('Approved', 'Pending_Approval') THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: no se puede eliminar el plan de pagos: la orden de trabajo ya fue aprobada o esta en revision';
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT approval_status INTO v_approval_status
    FROM public.work_orders
    WHERE wo_id = NEW.wo_id;

    IF v_approval_status IN ('Approved', 'Pending_Approval') THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: no se puede crear un plan de pagos: la orden de trabajo ya fue aprobada o esta en revision';
    END IF;

    SELECT is_admin() OR EXISTS (
      SELECT 1 FROM public.work_orders wo
      JOIN public.engagements e ON e.engagement_id = wo.engagement_id
      WHERE wo.wo_id = NEW.wo_id AND e.manager_id = get_my_staff_id()
    ) INTO v_is_manager_or_admin;

    IF NOT v_is_manager_or_admin THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_FORBIDDEN: solo el gerente del encargo (o un administrador) puede crear el plan de pagos y su tipo de cambio inicial';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.wo_id IS DISTINCT FROM OLD.wo_id THEN
    RAISE EXCEPTION 'WO_ID_IMMUTABLE: un plan de pagos no puede reasignarse a otra orden de trabajo';
  END IF;

  -- Iteración 17/18 (decisión del operador 2026-09-10): NULL solo es valido mientras
  -- el plan NUNCA tuvo un TC real (exchange_rate_history vacia, Decision #7 de
  -- plan_v2.md) -- una vez que tiene un valor real, no puede borrarse a NULL (para
  -- corregirlo se sobreescribe con el numero nuevo, nunca hace falta pasar por NULL).
  -- Sin esto, un plan con cuotas ya sincronizadas a un TC podia quedar en NULL
  -- mientras las cuotas se quedaban con el TC viejo -- reemplaza el fix original
  -- (propagar NULL en wo_payment_plan_sync_fixed_installments) por prevenirlo en el
  -- origen. Sin excepcion de rol, ni siquiera admin -- mismo criterio que
  -- WO_ID_IMMUTABLE arriba: no hay motivo legitimo para necesitarlo.
  IF OLD.exchange_rate IS NOT NULL AND NEW.exchange_rate IS NULL THEN
    RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio del plan de pagos no puede borrarse una vez establecido';
  END IF;

  IF NEW.exchange_rate IS NOT DISTINCT FROM OLD.exchange_rate
     AND NEW.exchange_rate_mode IS NOT DISTINCT FROM OLD.exchange_rate_mode THEN
    RETURN NEW;
  END IF;

  SELECT is_admin() OR EXISTS (
    SELECT 1 FROM public.work_orders wo
    JOIN public.engagements e ON e.engagement_id = wo.engagement_id
    WHERE wo.wo_id = NEW.wo_id AND e.manager_id = get_my_staff_id()
  ) INTO v_is_manager_or_admin;

  IF NOT v_is_manager_or_admin THEN
    RAISE EXCEPTION 'EXCHANGE_RATE_FORBIDDEN: solo el gerente del encargo (o un administrador) puede modificar el tipo de cambio inicial del plan de pagos';
  END IF;

  SELECT approval_status INTO v_approval_status
  FROM public.work_orders
  WHERE wo_id = NEW.wo_id;

  IF v_approval_status = 'Approved' THEN
    RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio del plan de pagos no puede modificarse: la orden de trabajo ya fue aprobada';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.wo_payment_installments
    WHERE plan_id = NEW.plan_id AND status <> 'Pending'
  ) INTO v_has_locked_installment;

  IF v_has_locked_installment THEN
    RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio del plan de pagos no puede modificarse: ya existe una cuota facturada con un tipo de cambio congelado';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: wo_payment_plan_sync_fixed_installments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wo_payment_plan_sync_fixed_installments() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.exchange_rate_mode = 'fijo' AND NEW.exchange_rate IS NOT NULL AND (
    NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
    OR NEW.exchange_rate_mode IS DISTINCT FROM OLD.exchange_rate_mode
  ) THEN
    UPDATE public.wo_payment_installments
    SET invoice_exchange_rate = NEW.exchange_rate,
        payment_exchange_rate = NEW.exchange_rate
    WHERE plan_id = NEW.plan_id
      AND status = 'Pending'
      AND (invoice_exchange_rate IS DISTINCT FROM NEW.exchange_rate
           OR payment_exchange_rate IS DISTINCT FROM NEW.exchange_rate);
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_
        -- Filter by action early - only get subscriptions interested in this action
        -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
        and (subs.action_filter = '*' or subs.action_filter = action::text);

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL AND ppt.tablename NOT LIKE '% %'),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
         pg_logical_slot_get_changes(
           slot_name, null, max_changes,
           'include-pk', 'true',
           'include-transaction', 'false',
           'include-timestamp', 'true',
           'include-type-oids', 'true',
           'format-version', '2',
           'actions', pub.w2j_actions,
           'add-tables', pub.w2j_add_tables
         ) x
  ),
  -- Count raw slot entries before apply_rls/subscription filter
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  -- Apply RLS and filter as before
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  -- Real rows with slot count attached
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  -- Sentinel row: always returned when no real rows exist so Elixir can
  -- always read slot_changes_count. Identified by wal IS NULL.
  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
$$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
    declare
        col_names text[] = coalesce(
                array_agg(c.column_name order by c.ordinal_position),
                '{}'::text[]
            )
            from
                information_schema.columns c
            where
                format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    format('%I.%I', c.table_schema, c.table_name)::regclass,
                    c.column_name,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
    begin
        for filter in select * from unnest(new.filters) loop
            -- Filtered column is valid
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            -- Type is sanitized and safe for string interpolation
            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            -- Set maximum number of entries for in filter
            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            else
                -- raises an exception if value is not coercable to type
                perform realtime.cast(filter.value, col_type);
            end if;

        end loop;

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: allow_any_operation(text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_any_operation(expected_operations text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


--
-- Name: allow_only_operation(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.allow_only_operation(expected_operation text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
_filename text;
BEGIN
	select string_to_array(name, '/') into _parts;
	select _parts[array_length(_parts,1)] into _filename;
	-- @todo return the last part instead of 2
	return reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[1:array_length(_parts,1)-1];
END
$$;


--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::int) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


--
-- Name: http_request(); Type: FUNCTION; Schema: supabase_functions; Owner: -
--

CREATE FUNCTION supabase_functions.http_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'supabase_functions'
    AS $$
  DECLARE
    request_id bigint;
    payload jsonb;
    url text := TG_ARGV[0]::text;
    method text := TG_ARGV[1]::text;
    headers jsonb DEFAULT '{}'::jsonb;
    params jsonb DEFAULT '{}'::jsonb;
    timeout_ms integer DEFAULT 1000;
  BEGIN
    IF url IS NULL OR url = 'null' THEN
      RAISE EXCEPTION 'url argument is missing';
    END IF;

    IF method IS NULL OR method = 'null' THEN
      RAISE EXCEPTION 'method argument is missing';
    END IF;

    IF TG_ARGV[2] IS NULL OR TG_ARGV[2] = 'null' THEN
      headers = '{"Content-Type": "application/json"}'::jsonb;
    ELSE
      headers = TG_ARGV[2]::jsonb;
    END IF;

    IF TG_ARGV[3] IS NULL OR TG_ARGV[3] = 'null' THEN
      params = '{}'::jsonb;
    ELSE
      params = TG_ARGV[3]::jsonb;
    END IF;

    IF TG_ARGV[4] IS NULL OR TG_ARGV[4] = 'null' THEN
      timeout_ms = 1000;
    ELSE
      timeout_ms = TG_ARGV[4]::integer;
    END IF;

    CASE
      WHEN method = 'GET' THEN
        SELECT http_get INTO request_id FROM net.http_get(
          url,
          params,
          headers,
          timeout_ms
        );
      WHEN method = 'POST' THEN
        payload = jsonb_build_object(
          'old_record', OLD,
          'record', NEW,
          'type', TG_OP,
          'table', TG_TABLE_NAME,
          'schema', TG_TABLE_SCHEMA
        );

        SELECT http_post INTO request_id FROM net.http_post(
          url,
          payload,
          params,
          headers,
          timeout_ms
        );
      ELSE
        RAISE EXCEPTION 'method argument % is invalid', method;
    END CASE;

    INSERT INTO supabase_functions.hooks
      (hook_table_id, hook_name, request_id)
    VALUES
      (TG_RELID, TG_NAME, request_id);

    RETURN NEW;
  END
$$;


--
-- Name: extensions; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.extensions (
    id uuid NOT NULL,
    type text,
    settings jsonb,
    tenant_external_id text,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: tenants; Type: TABLE; Schema: _realtime; Owner: -
--

CREATE TABLE _realtime.tenants (
    id uuid NOT NULL,
    name text,
    external_id text,
    jwt_secret text,
    max_concurrent_users integer DEFAULT 200 NOT NULL,
    inserted_at timestamp(0) without time zone NOT NULL,
    updated_at timestamp(0) without time zone NOT NULL,
    max_events_per_second integer DEFAULT 100 NOT NULL,
    postgres_cdc_default text DEFAULT 'postgres_cdc_rls'::text,
    max_bytes_per_second integer DEFAULT 100000 NOT NULL,
    max_channels_per_client integer DEFAULT 100 NOT NULL,
    max_joins_per_second integer DEFAULT 500 NOT NULL,
    suspend boolean DEFAULT false,
    jwt_jwks jsonb,
    notify_private_alpha boolean DEFAULT false,
    private_only boolean DEFAULT false NOT NULL,
    migrations_ran integer DEFAULT 0,
    broadcast_adapter character varying(255) DEFAULT 'gen_rpc'::character varying,
    max_presence_events_per_second integer DEFAULT 1000,
    max_payload_size_in_kb integer DEFAULT 3000,
    max_client_presence_events_per_window integer,
    client_presence_window_ms integer,
    presence_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT jwt_secret_or_jwt_jwks_required CHECK (((jwt_secret IS NOT NULL) OR (jwt_jwks IS NOT NULL)))
);


--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: activity_worksheet_cells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_worksheet_cells (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    worksheet_id uuid NOT NULL,
    category_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    budget_hours numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_worksheet_cells_budget_hours_check CHECK ((budget_hours >= (0)::numeric))
);


--
-- Name: activity_worksheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_worksheets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    wo_id uuid,
    version integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    notes text,
    created_by_staff_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_worksheets_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'approved'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: auth_email_throttle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_email_throttle (
    email_normalized text NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    last_sent_at timestamp with time zone
);


--
-- Name: TABLE auth_email_throttle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.auth_email_throttle IS 'Freno de los correos de cuenta emitidos por la app (recuperación, alta). Una fila por destinatario, más la fila "*" que lleva el contador de toda la firma. Se escribe únicamente vía claim_auth_email_slot() / release_auth_email_slot().';


--
-- Name: COLUMN auth_email_throttle.email_normalized; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_email_throttle.email_normalized IS 'Destinatario en minúsculas y sin espacios, o "*" para el contador global. Los dos conviven en la misma tabla sin poder pisarse: un correo válido siempre lleva "@", y las dos funciones rechazan lo que no lo tenga.';


--
-- Name: COLUMN auth_email_throttle.window_start; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_email_throttle.window_start IS 'Inicio de la ventana móvil de una hora. Se reinicia cuando la ventana vence.';


--
-- Name: COLUMN auth_email_throttle.sent_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.auth_email_throttle.sent_count IS 'Correos concedidos dentro de la ventana en curso.';


--
-- Name: auth_login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_login_attempts (
    email_normalized text NOT NULL,
    attempts_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone
);


--
-- Name: authorization_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authorization_permissions (
    permission_key text NOT NULL,
    module_key text NOT NULL,
    action_key text NOT NULL,
    label_key text NOT NULL,
    description text,
    is_sensitive boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE authorization_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.authorization_permissions IS 'Catálogo de permisos atómicos. permission_key = "<modulo>.<accion>" (p.ej. client.read).';


--
-- Name: authorization_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authorization_role_permissions (
    role_key text NOT NULL,
    permission_key text NOT NULL,
    scope_key text DEFAULT 'none'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT authz_rp_scope_chk CHECK ((scope_key = ANY (ARRAY['firm'::text, 'assigned_clients'::text, 'assigned_engagements'::text, 'own'::text, 'department'::text, 'none'::text])))
);


--
-- Name: TABLE authorization_role_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.authorization_role_permissions IS 'Matriz rol x permiso con scope_key (ABAC). Una fila = una concesión. Objetivo: 737 filas.';


--
-- Name: COLUMN authorization_role_permissions.scope_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.authorization_role_permissions.scope_key IS 'Alcance del dato: firm | assigned_clients | assigned_engagements | own | department | none.';


--
-- Name: authorization_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authorization_roles (
    role_key text NOT NULL,
    label_key text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_app_role public.app_role
);


--
-- Name: TABLE authorization_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.authorization_roles IS 'Catálogo de roles de negocio (reemplaza el enum app_role). role_key = identificador técnico.';


--
-- Name: COLUMN authorization_roles.legacy_app_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.authorization_roles.legacy_app_role IS 'Valor del enum app_role con el que se espeja este rol para las políticas RLS legacy que aún usan has_role(). Es el NIVEL jerárquico equivalente, no el rol de negocio: varios role_key comparten el mismo legacy_app_role.';


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    client_id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_legal_name character varying(255) NOT NULL,
    unique_tax_id character varying(50) NOT NULL,
    industry_id uuid,
    contact_name character varying(200),
    contact_email character varying(255),
    contact_phone character varying(50),
    address text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by_staff_id uuid
);


--
-- Name: COLUMN clients.created_by_staff_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.created_by_staff_id IS 'Staff que creó el cliente. La puebla un trigger desde get_my_staff_id(); no la envía el cliente HTTP. Habilita que el creador vea el cliente antes de tener un encargo que lo haga "asignado". NULL en las filas previas a esta migración.';


--
-- Name: clients_directory; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.clients_directory AS
 SELECT client_id,
    client_legal_name,
    industry_id,
    contact_name,
    contact_email,
    contact_phone,
    address,
    is_active,
    created_at,
    updated_at
   FROM public.clients;


--
-- Name: engagement_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagement_assignments (
    assignment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    hours_per_week numeric DEFAULT 40 NOT NULL,
    allocation_percent numeric DEFAULT 100 NOT NULL,
    status text DEFAULT 'PROPOSED'::text NOT NULL,
    notes text,
    requirement_id uuid,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    category_id uuid NOT NULL,
    CONSTRAINT chk_assignment_allocation CHECK (((allocation_percent > (0)::numeric) AND (allocation_percent <= (100)::numeric))),
    CONSTRAINT chk_assignment_hours CHECK (((hours_per_week > (0)::numeric) AND (hours_per_week <= (80)::numeric))),
    CONSTRAINT chk_assignment_status CHECK ((status = ANY (ARRAY['PROPOSED'::text, 'PROVISIONAL'::text, 'CONFIRMED'::text, 'COMPLETED'::text, 'CANCELLED'::text]))),
    CONSTRAINT engagement_assignments_dates_chk CHECK ((end_date >= start_date))
);


--
-- Name: work_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_orders (
    wo_id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    currency text NOT NULL,
    season_mode character varying(4) NOT NULL,
    tax_rate numeric(5,4) DEFAULT 0.13,
    adjustment_amount numeric(15,2) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    approval_status character varying(20) DEFAULT 'Draft'::character varying,
    approved_by uuid,
    approved_at timestamp with time zone,
    ceac_completed_at date,
    ceac_notes text,
    san_completed_at date,
    san_notes text,
    ceac_number text,
    san_approval_id text,
    risk_level text,
    risk_status text DEFAULT 'Pending'::text,
    risk_approved_by uuid,
    risk_approved_at timestamp with time zone,
    risk_notes text,
    emergency_deadline_at date,
    emergency_justification text,
    emergency_review_by uuid,
    emergency_review_at timestamp with time zone,
    emergency_partner_by uuid,
    emergency_partner_at timestamp with time zone,
    CONSTRAINT work_orders_approval_status_check CHECK (((approval_status)::text = ANY ((ARRAY['Draft'::character varying, 'Pending_Approval'::character varying, 'Approved'::character varying, 'Rejected'::character varying])::text[]))),
    CONSTRAINT work_orders_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'BOB'::text, 'USDT'::text]))),
    CONSTRAINT work_orders_risk_level_check CHECK (((risk_level IS NULL) OR (risk_level = ANY (ARRAY['Bajo'::text, 'Moderado'::text, 'Alto'::text])))),
    CONSTRAINT work_orders_risk_status_check CHECK ((risk_status = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Emergency_Approved'::text, 'Rejected'::text]))),
    CONSTRAINT work_orders_season_mode_check CHECK (((season_mode)::text = ANY ((ARRAY['High'::character varying, 'Low'::character varying])::text[])))
);


--
-- Name: engagement_wo_state; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.engagement_wo_state WITH (security_invoker='false') AS
 SELECT engagement_id,
    approval_status,
    approved_at,
    risk_status
   FROM public.work_orders;


--
-- Name: exchange_rate_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rate_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fecha_vigencia date NOT NULL,
    compra numeric NOT NULL,
    venta numeric NOT NULL,
    moneda text DEFAULT 'USD/BOB'::text NOT NULL,
    fuente text NOT NULL,
    regimen text,
    version_metodologia text,
    canal text NOT NULL,
    fecha_publicacion date,
    actualizado_en timestamp with time zone NOT NULL,
    estado text NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exchange_rate_history_canal_check CHECK ((canal = ANY (ARRAY['bcb-web'::text, 'bcb-soap'::text]))),
    CONSTRAINT exchange_rate_history_compra_check CHECK ((compra > (0)::numeric)),
    CONSTRAINT exchange_rate_history_estado_check CHECK ((estado = ANY (ARRAY['vigente'::text, 'stale'::text]))),
    CONSTRAINT exchange_rate_history_venta_check CHECK ((venta > (0)::numeric))
);


--
-- Name: expense_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_types (
    expense_type_id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_name character varying(100) NOT NULL,
    default_unit_cost numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fund_request_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_request_expenses (
    fre_id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_request_id uuid NOT NULL,
    wo_id uuid NOT NULL,
    expense_type_id uuid,
    expense_date date NOT NULL,
    amount numeric NOT NULL,
    currency character varying NOT NULL,
    description text,
    document_number character varying,
    supplier_name character varying,
    supplier_tax_id character varying,
    attachment_url text,
    status public.fund_request_expense_status DEFAULT 'borrador'::public.fund_request_expense_status NOT NULL,
    submitted_at timestamp with time zone,
    manager_decided_at timestamp with time zone,
    manager_notes text,
    rejection_reason text,
    reviewed_at timestamp with time zone,
    reviewed_by_staff_id uuid,
    has_invoice_observation boolean DEFAULT false NOT NULL,
    invoice_observation_notes text,
    iva_penalty_amount numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expense_date_end date,
    days integer,
    returned_by_assistant boolean DEFAULT false NOT NULL,
    CONSTRAINT fund_request_expenses_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT fund_request_expenses_currency_check CHECK (((currency)::text = ANY ((ARRAY['BOB'::character varying, 'USD'::character varying])::text[])))
);


--
-- Name: fund_request_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fund_request_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    staff_id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255),
    category_id uuid,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    city character varying,
    id_number character varying,
    aud_reg_number character varying,
    short_name character varying(50),
    initials character varying(4),
    deleted_at timestamp with time zone,
    hire_date date,
    weekly_capacity_hours numeric DEFAULT 40 NOT NULL,
    termination_date date,
    is_blocked boolean DEFAULT false NOT NULL,
    is_schedulable boolean DEFAULT true NOT NULL,
    society_id uuid NOT NULL,
    practica_id uuid NOT NULL,
    target_utilization_percent numeric DEFAULT 85 NOT NULL,
    CONSTRAINT chk_termination_after_hire CHECK (((termination_date IS NULL) OR (hire_date IS NULL) OR (termination_date >= hire_date))),
    CONSTRAINT staff_city_check CHECK (((city)::text = ANY ((ARRAY['La Paz'::character varying, 'Santa Cruz'::character varying])::text[])))
);


--
-- Name: COLUMN staff.id_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.staff.id_number IS 'Documento de identidad. SELECT revocado a `authenticated`: se lee solo por get_staff_full() / staff_id_number_conflict() (SECURITY DEFINER, gated por permiso).';


--
-- Name: COLUMN staff.aud_reg_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.staff.aud_reg_number IS 'Registro de auditor. SELECT revocado a `authenticated` — ver id_number.';


--
-- Name: fund_request_selectable_work_orders; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.fund_request_selectable_work_orders WITH (security_invoker='false') AS
 SELECT wo.wo_id,
    wo.currency,
    wo.approval_status,
    e.engagement_id,
    e.engagement_code,
    e.engagement_name,
    e.manager_id,
    s.staff_id AS manager_staff_id,
    s.short_name AS manager_short_name,
    s.first_name AS manager_first_name,
    s.last_name AS manager_last_name
   FROM ((public.work_orders wo
     JOIN public.engagements e ON ((e.engagement_id = wo.engagement_id)))
     LEFT JOIN public.staff s ON ((s.staff_id = e.manager_id)))
  WHERE (((wo.approval_status)::text = 'Approved'::text) AND (public.get_my_staff_id() IS NOT NULL) AND public.engagement_allows_hours_or_requests(e.engagement_id));


--
-- Name: fund_request_work_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_request_work_orders (
    fr_wo_id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_request_id uuid NOT NULL,
    wo_id uuid NOT NULL,
    allocated_amount numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    manager_staff_id uuid,
    approval_status public.fr_wo_approval_status DEFAULT 'pendiente'::public.fr_wo_approval_status NOT NULL,
    manager_notes text,
    rejection_reason text,
    manager_decided_at timestamp with time zone,
    CONSTRAINT fund_request_work_orders_allocated_amount_check CHECK ((allocated_amount > (0)::numeric))
);


--
-- Name: fund_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_requests (
    fund_request_id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_number character varying,
    requester_staff_id uuid NOT NULL,
    approver_manager_staff_id uuid,
    total_requested_amount numeric NOT NULL,
    currency character varying NOT NULL,
    status public.fund_request_status DEFAULT 'borrador'::public.fund_request_status NOT NULL,
    purpose text,
    due_back_date date,
    submitted_at timestamp with time zone,
    manager_decided_at timestamp with time zone,
    manager_notes text,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    total_disbursed_amount numeric DEFAULT 0 NOT NULL,
    disbursed_at timestamp with time zone,
    disbursed_by_staff_id uuid,
    accounting_notes text,
    closed_at timestamp with time zone,
    settlement_total_spent numeric,
    settlement_balance numeric,
    settlement_iva_total numeric,
    settlement_resolution text,
    settlement_amount numeric,
    settlement_notes text,
    settled_at timestamp with time zone,
    settled_by_staff_id uuid,
    CONSTRAINT fund_requests_currency_check CHECK (((currency)::text = ANY ((ARRAY['BOB'::character varying, 'USD'::character varying])::text[]))),
    CONSTRAINT fund_requests_disbursed_nonneg CHECK ((total_disbursed_amount >= (0)::numeric)),
    CONSTRAINT fund_requests_settlement_resolution_check CHECK (((settlement_resolution IS NULL) OR (settlement_resolution = ANY (ARRAY['sin_saldo'::text, 'devolucion'::text, 'descuento_planilla'::text, 'pago_solicitante'::text])))),
    CONSTRAINT fund_requests_total_requested_amount_check CHECK ((total_requested_amount > (0)::numeric))
);


--
-- Name: global_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_settings (
    setting_key character varying(100) NOT NULL,
    setting_value character varying(255) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holidays (
    holiday_id uuid DEFAULT gen_random_uuid() NOT NULL,
    holiday_date date NOT NULL,
    holiday_name text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    oficina smallint DEFAULT 0 NOT NULL,
    CONSTRAINT chk_holidays_oficina CHECK ((oficina = ANY (ARRAY[0, 1, 2])))
);


--
-- Name: industries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.industries (
    industry_id uuid DEFAULT gen_random_uuid() NOT NULL,
    industry_name character varying(100) NOT NULL,
    fiscal_year_end character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: migration_run_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_run_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    migration_key text NOT NULL,
    backup_table_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    executed_by text DEFAULT CURRENT_USER
);


--
-- Name: notification_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_emails (
    email_id uuid DEFAULT gen_random_uuid() NOT NULL,
    dedupe_key text NOT NULL,
    notification_id uuid,
    recipient_staff_id uuid NOT NULL,
    to_email text NOT NULL,
    to_name text,
    type_key text NOT NULL,
    entity_id text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    claimed_at timestamp with time zone,
    CONSTRAINT notification_emails_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'failed'::text, 'sent'::text])))
);


--
-- Name: TABLE notification_emails; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_emails IS 'Bandeja de salida de correos. Se escribe UNICAMENTE via notify_staff(); la drena la edge function send-notification-emails. Sin policies: no se lee desde el cliente.';


--
-- Name: COLUMN notification_emails.dedupe_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_emails.dedupe_key IS 'Clave de idempotencia. Derivado de un suceso: el notification_id. Recordatorio: type_key|staff_id|ventana.';


--
-- Name: COLUMN notification_emails.notification_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_emails.notification_id IS 'La fila de la campana que lo origino, si la hay. NULL en los recordatorios (delivery=email) y cuando la notificacion se descarta: el correo ya mandado sigue siendo un hecho.';


--
-- Name: COLUMN notification_emails.claimed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_emails.claimed_at IS 'Cuando el drenaje reclamo la fila. Vence a los 15 minutos: un sending mas viejo que eso es una invocacion que murio sin cerrar, y el claim siguiente lo vuelve a tomar. NULL cuando la fila no esta en manos de nadie.';


--
-- Name: notification_role_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_role_types (
    role_key text NOT NULL,
    type_key text NOT NULL,
    scope_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_role_types_scope_check CHECK ((scope_key = ANY (ARRAY['own'::text, 'assigned'::text, 'practice'::text, 'department'::text, 'society'::text, 'firm'::text])))
);


--
-- Name: TABLE notification_role_types; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_role_types IS 'Matriz rol x tipo de notificación (una fila = una concesión). Las siembra la migración 02, que es un archivo generado: no editarlas a mano.';


--
-- Name: COLUMN notification_role_types.scope_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_role_types.scope_key IS 'Qué registros disparan la notificación para ese rol. Lo consume el disparador de cada módulo; notify_staff() no lo evalúa.';


--
-- Name: notification_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_types (
    type_key text NOT NULL,
    module_key text NOT NULL,
    label_key text NOT NULL,
    delivery text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    email_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_types_delivery_check CHECK ((delivery = ANY (ARRAY['event'::text, 'aggregate'::text, 'email'::text]))),
    CONSTRAINT notification_types_key_not_empty CHECK ((btrim(type_key) <> ''::text))
);


--
-- Name: TABLE notification_types; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_types IS 'Catálogo de tipos de notificación. Las filas las siembra la migración 02, que es un archivo generado: no editarlas a mano.';


--
-- Name: COLUMN notification_types.label_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_types.label_key IS 'Clave i18n: notifications.types.<type_key>, en src/locales/{es,en}.json.';


--
-- Name: COLUMN notification_types.delivery; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_types.delivery IS 'event = una fila por suceso en public.notifications; aggregate = contador calculado al vuelo, nunca se persiste; email = solo correo, sin fila en la campana (los recordatorios periodicos).';


--
-- Name: COLUMN notification_types.email_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_types.email_enabled IS 'Si el tipo ademas sale por correo (D-44). Independiente de delivery: un event puede mandar los dos, y un email solo correo.';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    notification_id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_staff_id uuid NOT NULL,
    type_key text NOT NULL,
    entity_id text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    dismissed_at timestamp with time zone
);


--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notifications IS 'Instancias de notificación de tipo event. Se escriben ÚNICAMENTE vía notify_staff(); no hay policy de INSERT para authenticated. Una fila descartada (dismissed_at) NO se borra: es el registro de que el aviso ya salió, y sin ella los emisores del cron lo repiten.';


--
-- Name: COLUMN notifications.dismissed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.dismissed_at IS 'Cuando el usuario apreto la "x". La fila deja de verse pero sobrevive como registro de emision, para que el cron no vuelva a avisar lo mismo. La borra el cron de retencion.';


--
-- Name: parametro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametro (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    periodo integer NOT NULL,
    date_begin date NOT NULL,
    date_end date NOT NULL,
    valor integer DEFAULT 1 NOT NULL,
    descripcion text,
    created_at timestamp with time zone DEFAULT now(),
    tipo text
);


--
-- Name: portfolio_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_events (
    event_id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    event_type text NOT NULL,
    subject_staff_id uuid,
    previous_staff_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT portfolio_events_type_check CHECK ((event_type = ANY (ARRAY['partner_assigned'::text, 'manager_assigned'::text])))
);


--
-- Name: TABLE portfolio_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.portfolio_events IS 'dash_cartera (decisiones.md §7.2, plan_v2.md §6.2): bitácora append-only de cambios de partner_id/manager_id en engagements -- únicos 2 eventos de Hitos que no se pueden derivar de una columna real ya existente. RLS activo SIN policies (nadie la lee/escribe directo) + trigger anti-UPDATE/DELETE. Arranca vacía -- SIN backfill retroactivo (decisiones.md §7.2 lo prohíbe explícitamente); hasta que acumule datos, el hito "assignment" no tiene qué mostrar.';


--
-- Name: practicas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practicas (
    practica_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code smallint NOT NULL,
    allows_rates_activities boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    abbreviation text,
    CONSTRAINT practicas_abbreviation_check CHECK ((abbreviation ~ '^[A-Z]{2,5}$'::text)),
    CONSTRAINT practicas_code_check CHECK (((code >= 0) AND (code <= 9)))
);


--
-- Name: servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicios (
    taxonomy_id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(10) NOT NULL,
    name text NOT NULL,
    practica_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT servicios_code_check CHECK (((char_length(TRIM(BOTH FROM code)) >= 1) AND (char_length(TRIM(BOTH FROM code)) <= 10))),
    CONSTRAINT servicios_name_check CHECK ((TRIM(BOTH FROM name) <> ''::text))
);


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    skill_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    category character varying NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_skills_category_code CHECK (((category)::text = ANY ((ARRAY['framework'::character varying, 'industry'::character varying, 'tool'::character varying, 'language'::character varying, 'certification'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT chk_skills_category_not_empty CHECK ((TRIM(BOTH FROM category) <> ''::text)),
    CONSTRAINT chk_skills_name_not_empty CHECK ((TRIM(BOTH FROM name) <> ''::text))
);


--
-- Name: society; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society (
    society_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_alert_seen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_alert_seen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    entity_id text NOT NULL,
    alert_type text NOT NULL,
    seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_directory; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.staff_directory AS
 SELECT staff_id,
    first_name,
    last_name,
    short_name,
    initials,
    category_id,
    city,
    is_active,
    created_at,
    updated_at
   FROM public.staff
  WHERE (deleted_at IS NULL);


--
-- Name: staff_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_skills (
    staff_skill_id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    proficiency_level character varying NOT NULL,
    last_evaluated_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT staff_skills_proficiency_level_check CHECK (((proficiency_level)::text = ANY ((ARRAY['Beginner'::character varying, 'Intermediate'::character varying, 'Advanced'::character varying])::text[])))
);


--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entries (
    time_id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_worked date NOT NULL,
    hours_logged numeric(4,2) NOT NULL,
    staff_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    period_id uuid,
    is_forecast boolean DEFAULT false,
    CONSTRAINT time_entries_hours_logged_check CHECK ((hours_logged >= (0)::numeric))
);


--
-- Name: timer_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timer_entries (
    timer_id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    description text,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    duration_minutes integer,
    is_imported boolean DEFAULT false NOT NULL,
    imported_to_time_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    has_explicit_times boolean DEFAULT true NOT NULL
);


--
-- Name: timesheet_line_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheet_line_approvals (
    approval_id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    review_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    activity_id uuid NOT NULL,
    CONSTRAINT timesheet_line_approvals_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: timesheet_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheet_periods (
    period_id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    week_start_date date NOT NULL,
    week_number integer NOT NULL,
    year integer NOT NULL,
    deadline date,
    is_period_locked boolean DEFAULT false,
    total_hours numeric(6,2) DEFAULT 0,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: timesheet_reversal_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheet_reversal_requests (
    request_id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    scope text NOT NULL,
    engagement_id uuid,
    requested_by uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    is_direct boolean DEFAULT false NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    resolution_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trr_direct_is_executed CHECK (((NOT is_direct) OR (status = 'executed'::text))),
    CONSTRAINT trr_reason_not_empty CHECK ((btrim(reason) <> ''::text)),
    CONSTRAINT trr_reject_needs_notes CHECK (((status <> 'rejected'::text) OR (btrim(COALESCE(resolution_notes, ''::text)) <> ''::text))),
    CONSTRAINT trr_scope_check CHECK ((scope = ANY (ARRAY['engagement'::text, 'week'::text]))),
    CONSTRAINT trr_scope_engagement_coherence CHECK ((((scope = 'engagement'::text) AND (engagement_id IS NOT NULL)) OR ((scope = 'week'::text) AND (engagement_id IS NULL)))),
    CONSTRAINT trr_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'executed'::text, 'rejected'::text])))
);


--
-- Name: TABLE timesheet_reversal_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.timesheet_reversal_requests IS '0923-209: solicitudes (y bitácora de reversiones directas del admin) para revertir líneas ya aprobadas de una boleta. El único escritor es la RPC SECURITY DEFINER de este archivo -- sin GRANT de INSERT/UPDATE/DELETE a authenticated.';


--
-- Name: user_lifecycle_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_lifecycle_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    action text NOT NULL,
    old_role public.app_role,
    new_role public.app_role,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    old_role_key text,
    new_role_key text
);


--
-- Name: COLUMN user_lifecycle_audit_log.old_role_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_lifecycle_audit_log.old_role_key IS 'role_key previo. Las columnas old_role/new_role (enum) quedan como espejo legacy.';


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'staff'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    role_key text,
    deletion_email text
);


--
-- Name: COLUMN user_roles.deletion_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_roles.deletion_email IS 'Correo de la cuenta, copiado por prepare_account_deletion() justo antes de que GoTrue la borre. Lo lee el trigger en el DELETE por CASCADE, cuando auth.users ya no existe y el aviso a Seguridad TI se quedaria sin identificar la cuenta. NULL fuera de un borrado en curso.';


--
-- Name: user_roles_backup_0220_56_20260224; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles_backup_0220_56_20260224 (
    id uuid,
    user_id uuid,
    role public.app_role,
    created_at timestamp with time zone
);


--
-- Name: vw_actual_hours_by_category_activity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_actual_hours_by_category_activity WITH (security_invoker='on') AS
 SELECT te.engagement_id,
    s.category_id,
    c.category_name,
    c.display_order AS category_display_order,
    te.activity_id,
    ac.activity_code,
    ac.description AS activity_description,
    sum(te.hours_logged) AS actual_hours
   FROM (((public.time_entries te
     JOIN public.staff s ON ((s.staff_id = te.staff_id)))
     JOIN public.categories c ON ((c.category_id = s.category_id)))
     JOIN public.activity_codes ac ON ((ac.activity_id = te.activity_id)))
  WHERE (te.is_forecast = false)
  GROUP BY te.engagement_id, s.category_id, c.category_name, c.display_order, te.activity_id, ac.activity_code, ac.description;


--
-- Name: vw_wo_budget_hours_by_category_activity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_wo_budget_hours_by_category_activity WITH (security_invoker='on') AS
 SELECT wo.wo_id,
    wo.engagement_id,
    aw.id AS worksheet_id,
    awc.category_id,
    c.category_name,
    c.display_order AS category_display_order,
    awc.activity_id,
    ac.activity_code,
    ac.description AS activity_description,
    awc.budget_hours
   FROM ((((public.work_orders wo
     JOIN public.activity_worksheets aw ON ((aw.wo_id = wo.wo_id)))
     JOIN public.activity_worksheet_cells awc ON ((awc.worksheet_id = aw.id)))
     JOIN public.categories c ON ((c.category_id = awc.category_id)))
     JOIN public.activity_codes ac ON ((ac.activity_id = awc.activity_id)))
  WHERE (awc.budget_hours > (0)::numeric);


--
-- Name: vw_budget_vs_actual_hours_by_category_activity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_budget_vs_actual_hours_by_category_activity WITH (security_invoker='on') AS
 SELECT COALESCE(b.wo_id, wo.wo_id) AS wo_id,
    COALESCE(b.engagement_id, a.engagement_id) AS engagement_id,
    COALESCE(b.category_id, a.category_id) AS category_id,
    COALESCE(b.category_name, a.category_name) AS category_name,
    COALESCE(b.category_display_order, a.category_display_order) AS category_display_order,
    COALESCE(b.activity_id, a.activity_id) AS activity_id,
    COALESCE(b.activity_code, a.activity_code) AS activity_code,
    COALESCE(b.activity_description, a.activity_description) AS activity_description,
    COALESCE(b.budget_hours, (0)::numeric) AS budget_hours,
    COALESCE(a.actual_hours, (0)::numeric) AS actual_hours,
    (COALESCE(b.budget_hours, (0)::numeric) - COALESCE(a.actual_hours, (0)::numeric)) AS variance_hours
   FROM ((public.vw_wo_budget_hours_by_category_activity b
     FULL JOIN public.vw_actual_hours_by_category_activity a ON (((b.engagement_id = a.engagement_id) AND (b.category_id = a.category_id) AND (b.activity_id = a.activity_id))))
     LEFT JOIN public.work_orders wo ON ((wo.engagement_id = a.engagement_id)));


--
-- Name: vw_staffing_alerts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_staffing_alerts WITH (security_invoker='true') AS
 WITH base AS (
         SELECT 'timesheet_pending_approval'::text AS alert_type,
            c.category_name,
            (((((s_sub.first_name)::text || ' '::text) || (s_sub.last_name)::text) || ' — '::text) || (e.engagement_name)::text) AS description,
            tla.created_at AS detected_at,
            e.engagement_id,
            e.engagement_name,
            e.engagement_code,
            (tla.approval_id)::text AS entity_id,
                CASE
                    WHEN (tla.created_at < (now() - '3 days'::interval)) THEN 'high'::text
                    ELSE 'medium'::text
                END AS priority_level,
            tla.approved_by AS staff_id,
            (((s_apr.first_name)::text || ' '::text) || (s_apr.last_name)::text) AS staff_name,
            (1)::numeric AS required_count,
            tp.week_start_date AS start_date,
            (tp.week_start_date + 6) AS end_date
           FROM (((((public.timesheet_line_approvals tla
             JOIN public.timesheet_periods tp ON ((tp.period_id = tla.period_id)))
             JOIN public.engagements e ON ((e.engagement_id = tla.engagement_id)))
             JOIN public.staff s_sub ON ((s_sub.staff_id = tp.staff_id)))
             JOIN public.categories c ON ((c.category_id = s_sub.category_id)))
             JOIN public.staff s_apr ON ((s_apr.staff_id = tla.approved_by)))
          WHERE (((tla.status)::text = 'pending'::text) AND (tla.approved_by IS NOT NULL) AND (tp.submitted_at IS NOT NULL))
        UNION ALL
         SELECT 'work_order_pending_approval'::text AS alert_type,
            NULL::character varying AS category_name,
            ('WO pendiente de aprobación — '::text || (e.engagement_name)::text) AS description,
            wo.created_at AS detected_at,
            e.engagement_id,
            e.engagement_name,
            e.engagement_code,
            (wo.wo_id)::text AS entity_id,
            'medium'::text AS priority_level,
            e.partner_id AS staff_id,
            (((s_partner.first_name)::text || ' '::text) || (s_partner.last_name)::text) AS staff_name,
            (1)::numeric AS required_count,
            e.start_date,
            e.end_date
           FROM ((public.work_orders wo
             JOIN public.engagements e ON ((e.engagement_id = wo.engagement_id)))
             JOIN public.staff s_partner ON ((s_partner.staff_id = e.partner_id)))
          WHERE (((wo.approval_status)::text = 'Pending_Approval'::text) AND (e.partner_id IS NOT NULL))
        UNION ALL
         SELECT 'engagement_created'::text AS alert_type,
            NULL::character varying AS category_name,
            cl.client_legal_name AS description,
            e.created_at AS detected_at,
            e.engagement_id,
            e.engagement_name,
            e.engagement_code,
            (e.engagement_id)::text AS entity_id,
            'medium'::text AS priority_level,
            e.partner_id AS staff_id,
            (((s.first_name)::text || ' '::text) || (s.last_name)::text) AS staff_name,
            (1)::numeric AS required_count,
            e.start_date,
            e.end_date
           FROM ((public.engagements e
             JOIN public.clients cl ON ((cl.client_id = e.client_id)))
             JOIN public.staff s ON ((s.staff_id = e.partner_id)))
          WHERE ((e.partner_id IS NOT NULL) AND (e.created_at >= (now() - '7 days'::interval)))
        UNION ALL
         SELECT 'engagement_created'::text AS alert_type,
            NULL::character varying AS category_name,
            cl.client_legal_name AS description,
            e.created_at AS detected_at,
            e.engagement_id,
            e.engagement_name,
            e.engagement_code,
            (e.engagement_id)::text AS entity_id,
            'medium'::text AS priority_level,
            e.manager_id AS staff_id,
            (((s.first_name)::text || ' '::text) || (s.last_name)::text) AS staff_name,
            (1)::numeric AS required_count,
            e.start_date,
            e.end_date
           FROM ((public.engagements e
             JOIN public.clients cl ON ((cl.client_id = e.client_id)))
             JOIN public.staff s ON ((s.staff_id = e.manager_id)))
          WHERE ((e.manager_id IS NOT NULL) AND (e.manager_id IS DISTINCT FROM e.partner_id) AND (e.created_at >= (now() - '7 days'::interval)))
        UNION ALL
         SELECT 'new_user_registered'::text AS alert_type,
            c.category_name,
            (((s_new.first_name)::text || ' '::text) || (s_new.last_name)::text) AS description,
            s_new.created_at AS detected_at,
            NULL::uuid AS engagement_id,
            NULL::character varying AS engagement_name,
            NULL::character varying AS engagement_code,
            (s_new.staff_id)::text AS entity_id,
            'medium'::text AS priority_level,
            s_admin.staff_id,
            (((s_admin.first_name)::text || ' '::text) || (s_admin.last_name)::text) AS staff_name,
            (1)::numeric AS required_count,
            NULL::date AS start_date,
            NULL::date AS end_date
           FROM ((public.staff s_new
             JOIN public.categories c ON ((c.category_id = s_new.category_id)))
             CROSS JOIN ( SELECT s.staff_id,
                    s.first_name,
                    s.last_name
                   FROM (public.staff s
                     JOIN public.user_roles ur ON ((ur.user_id = s.auth_user_id)))
                  WHERE ((ur.role = 'admin'::public.app_role) AND (s.is_active = true) AND (s.auth_user_id IS NOT NULL))) s_admin)
          WHERE ((s_new.is_active = true) AND (s_new.created_at >= (now() - '30 days'::interval)) AND (s_new.staff_id <> s_admin.staff_id))
        )
 SELECT b.alert_type,
    b.category_name,
    b.description,
    b.detected_at,
    b.engagement_id,
    b.engagement_name,
    b.engagement_code,
    b.entity_id,
    b.priority_level,
    b.staff_id,
    b.staff_name,
    b.required_count,
    b.start_date,
    b.end_date,
    sas.seen_at
   FROM (base b
     LEFT JOIN public.staff_alert_seen sas ON (((sas.staff_id = b.staff_id) AND (sas.entity_id = b.entity_id) AND (sas.alert_type = b.alert_type))));


--
-- Name: VIEW vw_staffing_alerts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.vw_staffing_alerts IS 'Feed legacy de alertas de la campana. `seen_at` viene de staff_alert_seen (LEFT JOIN): NULL = no vista. Se reemplaza por el catálogo de notificaciones (notification_types/notifications) en la Fase 3.';


--
-- Name: vw_wo_budget_hours_by_category; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_wo_budget_hours_by_category WITH (security_invoker='on') AS
 SELECT wo.wo_id,
    wo.engagement_id,
    awc.category_id,
    c.category_name,
    c.display_order AS category_display_order,
    sum(awc.budget_hours) AS total_budget_hours
   FROM (((public.work_orders wo
     JOIN public.activity_worksheets aw ON ((aw.wo_id = wo.wo_id)))
     JOIN public.activity_worksheet_cells awc ON ((awc.worksheet_id = aw.id)))
     JOIN public.categories c ON ((c.category_id = awc.category_id)))
  WHERE (awc.budget_hours > (0)::numeric)
  GROUP BY wo.wo_id, wo.engagement_id, awc.category_id, c.category_name, c.display_order;


--
-- Name: wo_budget_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_budget_lines (
    wo_line_id uuid DEFAULT gen_random_uuid() NOT NULL,
    wo_id uuid NOT NULL,
    category_id uuid NOT NULL,
    budgeted_hours numeric(10,2) DEFAULT 0 NOT NULL,
    standard_rate numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: wo_expense_budget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_expense_budget (
    wo_exp_id uuid DEFAULT gen_random_uuid() NOT NULL,
    wo_id uuid NOT NULL,
    expense_type_id uuid NOT NULL,
    budgeted_amount numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: wo_payment_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_payment_plan (
    plan_id uuid DEFAULT gen_random_uuid() NOT NULL,
    wo_id uuid NOT NULL,
    exchange_rate numeric DEFAULT public.latest_exchange_rate() NOT NULL,
    payment_days integer DEFAULT 30 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    exchange_rate_mode text DEFAULT 'fijo'::text NOT NULL,
    CONSTRAINT wo_payment_plan_exchange_rate_mode_check CHECK ((exchange_rate_mode = ANY (ARRAY['fijo'::text, 'variable'::text]))),
    CONSTRAINT wo_payment_plan_exchange_rate_positive CHECK ((exchange_rate > (0)::numeric))
);


--
-- Name: wo_staffing_requirement_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_staffing_requirement_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requirement_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    min_proficiency_level text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_staffing_requirement_skills_min_proficiency_level_check CHECK ((min_proficiency_level = ANY (ARRAY['Beginner'::text, 'Intermediate'::text, 'Advanced'::text])))
);


--
-- Name: wo_staffing_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_staffing_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wo_id uuid NOT NULL,
    category_id uuid NOT NULL,
    staff_count integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_staffing_requirements_staff_count_check CHECK (((staff_count >= 1) AND (staff_count <= 999)))
);


--
-- Name: work_order_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.work_order_summary AS
SELECT
    NULL::uuid AS wo_id,
    NULL::uuid AS engagement_id,
    NULL::text AS currency,
    NULL::character varying(4) AS season_mode,
    NULL::numeric(5,4) AS tax_rate,
    NULL::numeric(15,2) AS adjustment_amount,
    NULL::text AS notes,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS updated_at,
    NULL::character varying(20) AS approval_status,
    NULL::uuid AS approved_by,
    NULL::timestamp with time zone AS approved_at,
    NULL::numeric AS total_standard_fee,
    NULL::numeric AS realization_percent,
    NULL::numeric AS fee_with_tax_gross_up;


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: messages_2026_10_01; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_01 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_10_02; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_02 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_10_03; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_03 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_10_04; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_04 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_10_05; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_10_05 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: iceberg_namespaces; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.iceberg_namespaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_name text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    catalog_id uuid NOT NULL
);


--
-- Name: iceberg_tables; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.iceberg_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    namespace_id uuid NOT NULL,
    bucket_name text NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    location text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    remote_table_id text,
    shard_key text,
    shard_id text,
    catalog_id uuid NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hooks; Type: TABLE; Schema: supabase_functions; Owner: -
--

CREATE TABLE supabase_functions.hooks (
    id bigint NOT NULL,
    hook_table_id integer NOT NULL,
    hook_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    request_id bigint
);


--
-- Name: TABLE hooks; Type: COMMENT; Schema: supabase_functions; Owner: -
--

COMMENT ON TABLE supabase_functions.hooks IS 'Supabase Functions Hooks: Audit trail for triggered hooks.';


--
-- Name: hooks_id_seq; Type: SEQUENCE; Schema: supabase_functions; Owner: -
--

CREATE SEQUENCE supabase_functions.hooks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hooks_id_seq; Type: SEQUENCE OWNED BY; Schema: supabase_functions; Owner: -
--

ALTER SEQUENCE supabase_functions.hooks_id_seq OWNED BY supabase_functions.hooks.id;


--
-- Name: migrations; Type: TABLE; Schema: supabase_functions; Owner: -
--

CREATE TABLE supabase_functions.migrations (
    version text NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text
);


--
-- Name: messages_2026_10_01; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_01 FOR VALUES FROM ('2026-10-01 00:00:00') TO ('2026-10-02 00:00:00');


--
-- Name: messages_2026_10_02; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_02 FOR VALUES FROM ('2026-10-02 00:00:00') TO ('2026-10-03 00:00:00');


--
-- Name: messages_2026_10_03; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_03 FOR VALUES FROM ('2026-10-03 00:00:00') TO ('2026-10-04 00:00:00');


--
-- Name: messages_2026_10_04; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_04 FOR VALUES FROM ('2026-10-04 00:00:00') TO ('2026-10-05 00:00:00');


--
-- Name: messages_2026_10_05; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_10_05 FOR VALUES FROM ('2026-10-05 00:00:00') TO ('2026-10-06 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: hooks id; Type: DEFAULT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.hooks ALTER COLUMN id SET DEFAULT nextval('supabase_functions.hooks_id_seq'::regclass);


--
-- Name: extensions extensions_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.extensions
    ADD CONSTRAINT extensions_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: activity_codes activity_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_pkey PRIMARY KEY (activity_id);


--
-- Name: activity_worksheet_cells activity_worksheet_cells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheet_cells
    ADD CONSTRAINT activity_worksheet_cells_pkey PRIMARY KEY (id);


--
-- Name: activity_worksheet_cells activity_worksheet_cells_worksheet_id_category_id_activity__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheet_cells
    ADD CONSTRAINT activity_worksheet_cells_worksheet_id_category_id_activity__key UNIQUE (worksheet_id, category_id, activity_id);


--
-- Name: activity_worksheets activity_worksheets_engagement_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheets
    ADD CONSTRAINT activity_worksheets_engagement_id_version_key UNIQUE (engagement_id, version);


--
-- Name: activity_worksheets activity_worksheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheets
    ADD CONSTRAINT activity_worksheets_pkey PRIMARY KEY (id);


--
-- Name: auth_email_throttle auth_email_throttle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_email_throttle
    ADD CONSTRAINT auth_email_throttle_pkey PRIMARY KEY (email_normalized);


--
-- Name: auth_login_attempts auth_login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_login_attempts
    ADD CONSTRAINT auth_login_attempts_pkey PRIMARY KEY (email_normalized);


--
-- Name: authorization_permissions authorization_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_permissions
    ADD CONSTRAINT authorization_permissions_pkey PRIMARY KEY (permission_key);


--
-- Name: authorization_role_permissions authorization_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_role_permissions
    ADD CONSTRAINT authorization_role_permissions_pkey PRIMARY KEY (role_key, permission_key);


--
-- Name: authorization_roles authorization_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_roles
    ADD CONSTRAINT authorization_roles_pkey PRIMARY KEY (role_key);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (category_id);


--
-- Name: categories categories_practica_category_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_practica_category_unique UNIQUE (practica_id, category_id);


--
-- Name: categories categories_practica_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_practica_name_unique UNIQUE (practica_id, category_name);


--
-- Name: categories categories_practica_order_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_practica_order_unique UNIQUE (practica_id, display_order) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (client_id);


--
-- Name: clients clients_unique_tax_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_unique_tax_id_key UNIQUE (unique_tax_id);


--
-- Name: engagement_assignments engagement_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_assignments
    ADD CONSTRAINT engagement_assignments_pkey PRIMARY KEY (assignment_id);


--
-- Name: engagements engagements_contract_file_path_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_contract_file_path_unique UNIQUE (contract_file_path);


--
-- Name: engagements engagements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_pkey PRIMARY KEY (engagement_id);


--
-- Name: exchange_rate_history exchange_rate_history_fecha_vigencia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rate_history
    ADD CONSTRAINT exchange_rate_history_fecha_vigencia_key UNIQUE (fecha_vigencia);


--
-- Name: exchange_rate_history exchange_rate_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rate_history
    ADD CONSTRAINT exchange_rate_history_pkey PRIMARY KEY (id);


--
-- Name: expense_types expense_types_expense_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_types
    ADD CONSTRAINT expense_types_expense_name_key UNIQUE (expense_name);


--
-- Name: expense_types expense_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_types
    ADD CONSTRAINT expense_types_pkey PRIMARY KEY (expense_type_id);


--
-- Name: fund_request_expenses fund_request_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_expenses
    ADD CONSTRAINT fund_request_expenses_pkey PRIMARY KEY (fre_id);


--
-- Name: fund_request_work_orders fund_request_work_orders_fund_request_id_wo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_work_orders
    ADD CONSTRAINT fund_request_work_orders_fund_request_id_wo_id_key UNIQUE (fund_request_id, wo_id);


--
-- Name: fund_request_work_orders fund_request_work_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_work_orders
    ADD CONSTRAINT fund_request_work_orders_pkey PRIMARY KEY (fr_wo_id);


--
-- Name: fund_requests fund_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_pkey PRIMARY KEY (fund_request_id);


--
-- Name: fund_requests fund_requests_request_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_request_number_key UNIQUE (request_number);


--
-- Name: global_settings global_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_settings
    ADD CONSTRAINT global_settings_pkey PRIMARY KEY (setting_key);


--
-- Name: holidays holidays_holiday_date_oficina_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_holiday_date_oficina_key UNIQUE (holiday_date, oficina);


--
-- Name: holidays holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_pkey PRIMARY KEY (holiday_id);


--
-- Name: industries industries_industry_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industries
    ADD CONSTRAINT industries_industry_name_key UNIQUE (industry_name);


--
-- Name: industries industries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industries
    ADD CONSTRAINT industries_pkey PRIMARY KEY (industry_id);


--
-- Name: migration_run_log migration_run_log_migration_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_run_log
    ADD CONSTRAINT migration_run_log_migration_key_key UNIQUE (migration_key);


--
-- Name: migration_run_log migration_run_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_run_log
    ADD CONSTRAINT migration_run_log_pkey PRIMARY KEY (id);


--
-- Name: notification_emails notification_emails_dedupe_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_emails
    ADD CONSTRAINT notification_emails_dedupe_key_key UNIQUE (dedupe_key);


--
-- Name: notification_emails notification_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_emails
    ADD CONSTRAINT notification_emails_pkey PRIMARY KEY (email_id);


--
-- Name: notification_role_types notification_role_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_role_types
    ADD CONSTRAINT notification_role_types_pkey PRIMARY KEY (role_key, type_key);


--
-- Name: notification_types notification_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_types
    ADD CONSTRAINT notification_types_pkey PRIMARY KEY (type_key);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (notification_id);


--
-- Name: parametro parametro_nombre_periodo_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametro
    ADD CONSTRAINT parametro_nombre_periodo_tipo_key UNIQUE (nombre, periodo, tipo);


--
-- Name: parametro parametro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametro
    ADD CONSTRAINT parametro_pkey PRIMARY KEY (id);


--
-- Name: portfolio_events portfolio_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_events
    ADD CONSTRAINT portfolio_events_pkey PRIMARY KEY (event_id);


--
-- Name: practicas practicas_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practicas
    ADD CONSTRAINT practicas_code_key UNIQUE (code);


--
-- Name: practicas practicas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practicas
    ADD CONSTRAINT practicas_pkey PRIMARY KEY (practica_id);


--
-- Name: servicios servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_pkey PRIMARY KEY (taxonomy_id);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (skill_id);


--
-- Name: society society_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society
    ADD CONSTRAINT society_name_key UNIQUE (name);


--
-- Name: society society_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society
    ADD CONSTRAINT society_pkey PRIMARY KEY (society_id);


--
-- Name: staff_alert_seen staff_alert_seen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_alert_seen
    ADD CONSTRAINT staff_alert_seen_pkey PRIMARY KEY (id);


--
-- Name: staff_alert_seen staff_alert_seen_staff_id_entity_id_alert_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_alert_seen
    ADD CONSTRAINT staff_alert_seen_staff_id_entity_id_alert_type_key UNIQUE (staff_id, entity_id, alert_type);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (staff_id);


--
-- Name: staff_skills staff_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_skills
    ADD CONSTRAINT staff_skills_pkey PRIMARY KEY (staff_skill_id);


--
-- Name: staff_skills staff_skills_staff_id_skill_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_skills
    ADD CONSTRAINT staff_skills_staff_id_skill_id_key UNIQUE (staff_id, skill_id);


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (time_id);


--
-- Name: timer_entries timer_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_entries
    ADD CONSTRAINT timer_entries_pkey PRIMARY KEY (timer_id);


--
-- Name: timesheet_line_approvals timesheet_line_approvals_period_engagement_activity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_period_engagement_activity_key UNIQUE (period_id, engagement_id, activity_id);


--
-- Name: timesheet_line_approvals timesheet_line_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_pkey PRIMARY KEY (approval_id);


--
-- Name: timesheet_periods timesheet_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_periods
    ADD CONSTRAINT timesheet_periods_pkey PRIMARY KEY (period_id);


--
-- Name: timesheet_periods timesheet_periods_staff_id_week_start_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_periods
    ADD CONSTRAINT timesheet_periods_staff_id_week_start_date_key UNIQUE (staff_id, week_start_date);


--
-- Name: timesheet_reversal_requests timesheet_reversal_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_reversal_requests
    ADD CONSTRAINT timesheet_reversal_requests_pkey PRIMARY KEY (request_id);


--
-- Name: user_lifecycle_audit_log user_lifecycle_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lifecycle_audit_log
    ADD CONSTRAINT user_lifecycle_audit_log_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);


--
-- Name: wo_budget_lines wo_budget_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_budget_lines
    ADD CONSTRAINT wo_budget_lines_pkey PRIMARY KEY (wo_line_id);


--
-- Name: wo_expense_budget wo_expense_budget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_expense_budget
    ADD CONSTRAINT wo_expense_budget_pkey PRIMARY KEY (wo_exp_id);


--
-- Name: wo_payment_installments wo_payment_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_installments
    ADD CONSTRAINT wo_payment_installments_pkey PRIMARY KEY (installment_id);


--
-- Name: wo_payment_installments wo_payment_installments_plan_id_installment_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_installments
    ADD CONSTRAINT wo_payment_installments_plan_id_installment_number_key UNIQUE (plan_id, installment_number);


--
-- Name: wo_payment_plan wo_payment_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_plan
    ADD CONSTRAINT wo_payment_plan_pkey PRIMARY KEY (plan_id);


--
-- Name: wo_payment_plan wo_payment_plan_wo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_plan
    ADD CONSTRAINT wo_payment_plan_wo_id_key UNIQUE (wo_id);


--
-- Name: wo_staffing_requirement_skills wo_staffing_requirement_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirement_skills
    ADD CONSTRAINT wo_staffing_requirement_skills_pkey PRIMARY KEY (id);


--
-- Name: wo_staffing_requirement_skills wo_staffing_requirement_skills_requirement_id_skill_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirement_skills
    ADD CONSTRAINT wo_staffing_requirement_skills_requirement_id_skill_id_key UNIQUE (requirement_id, skill_id);


--
-- Name: wo_staffing_requirements wo_staffing_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirements
    ADD CONSTRAINT wo_staffing_requirements_pkey PRIMARY KEY (id);


--
-- Name: wo_staffing_requirements wo_staffing_requirements_wo_id_category_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirements
    ADD CONSTRAINT wo_staffing_requirements_wo_id_category_id_key UNIQUE (wo_id, category_id);


--
-- Name: work_orders work_orders_engagement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_engagement_id_key UNIQUE (engagement_id);


--
-- Name: work_orders work_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_pkey PRIMARY KEY (wo_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_01 messages_2026_10_01_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_01
    ADD CONSTRAINT messages_2026_10_01_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_02 messages_2026_10_02_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_02
    ADD CONSTRAINT messages_2026_10_02_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_03 messages_2026_10_03_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_03
    ADD CONSTRAINT messages_2026_10_03_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_04 messages_2026_10_04_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_04
    ADD CONSTRAINT messages_2026_10_04_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_10_05 messages_2026_10_05_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_10_05
    ADD CONSTRAINT messages_2026_10_05_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: iceberg_namespaces iceberg_namespaces_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_namespaces
    ADD CONSTRAINT iceberg_namespaces_pkey PRIMARY KEY (id);


--
-- Name: iceberg_tables iceberg_tables_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_tables
    ADD CONSTRAINT iceberg_tables_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: hooks hooks_pkey; Type: CONSTRAINT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.hooks
    ADD CONSTRAINT hooks_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: supabase_functions; Owner: -
--

ALTER TABLE ONLY supabase_functions.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (version);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: extensions_tenant_external_id_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE INDEX extensions_tenant_external_id_index ON _realtime.extensions USING btree (tenant_external_id);


--
-- Name: extensions_tenant_external_id_type_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE UNIQUE INDEX extensions_tenant_external_id_type_index ON _realtime.extensions USING btree (tenant_external_id, type);


--
-- Name: tenants_external_id_index; Type: INDEX; Schema: _realtime; Owner: -
--

CREATE UNIQUE INDEX tenants_external_id_index ON _realtime.tenants USING btree (external_id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: activity_codes_active_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX activity_codes_active_code_unique ON public.activity_codes USING btree (activity_code) WHERE (is_active = true);


--
-- Name: clients_client_legal_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clients_client_legal_name_unique ON public.clients USING btree (lower(TRIM(BOTH FROM client_legal_name)));


--
-- Name: idx_activity_worksheet_cells_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_worksheet_cells_activity ON public.activity_worksheet_cells USING btree (activity_id);


--
-- Name: idx_activity_worksheet_cells_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_worksheet_cells_category ON public.activity_worksheet_cells USING btree (category_id);


--
-- Name: idx_activity_worksheet_cells_worksheet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_worksheet_cells_worksheet ON public.activity_worksheet_cells USING btree (worksheet_id);


--
-- Name: idx_activity_worksheets_engagement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_worksheets_engagement ON public.activity_worksheets USING btree (engagement_id);


--
-- Name: idx_activity_worksheets_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_worksheets_wo ON public.activity_worksheets USING btree (wo_id);


--
-- Name: idx_authz_perms_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authz_perms_module ON public.authorization_permissions USING btree (module_key);


--
-- Name: idx_authz_rp_permission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authz_rp_permission ON public.authorization_role_permissions USING btree (permission_key);


--
-- Name: idx_clients_created_by_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_created_by_staff ON public.clients USING btree (created_by_staff_id) WHERE (created_by_staff_id IS NOT NULL);


--
-- Name: idx_eng_assign_category_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eng_assign_category_active ON public.engagement_assignments USING btree (category_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_eng_assign_engagement_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eng_assign_engagement_active ON public.engagement_assignments USING btree (engagement_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_eng_assign_staff_dates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eng_assign_staff_dates_active ON public.engagement_assignments USING btree (staff_id, start_date, end_date) WHERE (deleted_at IS NULL);


--
-- Name: idx_engagements_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_engagements_code_unique ON public.engagements USING btree (engagement_code) WHERE (engagement_code IS NOT NULL);


--
-- Name: idx_engagements_created_by_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagements_created_by_staff ON public.engagements USING btree (created_by_staff_id) WHERE (created_by_staff_id IS NOT NULL);


--
-- Name: idx_engagements_manager_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagements_manager_status ON public.engagements USING btree (manager_id, status);


--
-- Name: idx_engagements_partner_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagements_partner_status ON public.engagements USING btree (partner_id, status);


--
-- Name: idx_engagements_society; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagements_society ON public.engagements USING btree (society_id);


--
-- Name: idx_fr_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_created_at ON public.fund_requests USING btree (created_at DESC);


--
-- Name: idx_fr_manager_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_manager_status ON public.fund_requests USING btree (approver_manager_staff_id, status);


--
-- Name: idx_fr_requester_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_requester_status ON public.fund_requests USING btree (requester_staff_id, status);


--
-- Name: idx_fr_wo_manager; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_wo_manager ON public.fund_request_work_orders USING btree (manager_staff_id);


--
-- Name: idx_fr_wo_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_wo_request ON public.fund_request_work_orders USING btree (fund_request_id);


--
-- Name: idx_fr_wo_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_wo_wo ON public.fund_request_work_orders USING btree (wo_id);


--
-- Name: idx_fre_fund_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fre_fund_request ON public.fund_request_expenses USING btree (fund_request_id);


--
-- Name: idx_fre_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fre_status ON public.fund_request_expenses USING btree (status);


--
-- Name: idx_fre_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fre_wo ON public.fund_request_expenses USING btree (wo_id);


--
-- Name: idx_notification_emails_reclamables; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_emails_reclamables ON public.notification_emails USING btree (created_at) WHERE (status = ANY (ARRAY['pending'::text, 'sending'::text]));


--
-- Name: idx_notification_role_types_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_role_types_type ON public.notification_role_types USING btree (type_key);


--
-- Name: idx_notifications_emitidas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_emitidas ON public.notifications USING btree (type_key, entity_id, recipient_staff_id);


--
-- Name: idx_notifications_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_inbox ON public.notifications USING btree (recipient_staff_id, created_at DESC) WHERE (dismissed_at IS NULL);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (recipient_staff_id) WHERE ((read_at IS NULL) AND (dismissed_at IS NULL));


--
-- Name: idx_one_running_timer_per_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_running_timer_per_staff ON public.timer_entries USING btree (staff_id) WHERE (ended_at IS NULL);


--
-- Name: idx_portfolio_events_engagement_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portfolio_events_engagement_occurred ON public.portfolio_events USING btree (engagement_id, occurred_at DESC);


--
-- Name: idx_servicios_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_servicios_code_unique ON public.servicios USING btree (lower(TRIM(BOTH FROM code)));


--
-- Name: idx_servicios_practica_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicios_practica_id ON public.servicios USING btree (practica_id);


--
-- Name: idx_skills_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_skills_name_unique ON public.skills USING btree (lower(TRIM(BOTH FROM name)));


--
-- Name: idx_staff_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_staff_email_unique ON public.staff USING btree (lower(TRIM(BOTH FROM email))) WHERE ((email IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_staff_id_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_staff_id_number_unique ON public.staff USING btree (id_number) WHERE ((id_number IS NOT NULL) AND (TRIM(BOTH FROM id_number) <> ''::text) AND (deleted_at IS NULL));


--
-- Name: idx_staff_skills_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_skills_skill ON public.staff_skills USING btree (skill_id);


--
-- Name: idx_staff_skills_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_skills_staff ON public.staff_skills USING btree (staff_id);


--
-- Name: idx_time_entries_engagement_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_engagement_date ON public.time_entries USING btree (engagement_id, date_worked);


--
-- Name: idx_time_entries_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_period ON public.time_entries USING btree (period_id);


--
-- Name: idx_time_entries_period_engagement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_period_engagement ON public.time_entries USING btree (period_id, engagement_id);


--
-- Name: idx_time_entries_staff_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_staff_date ON public.time_entries USING btree (staff_id, date_worked);


--
-- Name: idx_time_entries_unique_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_time_entries_unique_entry ON public.time_entries USING btree (staff_id, engagement_id, activity_id, date_worked, is_forecast);


--
-- Name: idx_timer_entries_is_imported; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timer_entries_is_imported ON public.timer_entries USING btree (is_imported);


--
-- Name: idx_timer_entries_one_running_per_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_timer_entries_one_running_per_staff ON public.timer_entries USING btree (staff_id) WHERE (ended_at IS NULL);


--
-- Name: idx_timer_entries_staff_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timer_entries_staff_id ON public.timer_entries USING btree (staff_id);


--
-- Name: idx_timer_entries_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timer_entries_started_at ON public.timer_entries USING btree (started_at);


--
-- Name: idx_timesheet_periods_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timesheet_periods_deadline ON public.timesheet_periods USING btree (deadline);


--
-- Name: idx_timesheet_periods_staff_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timesheet_periods_staff_date ON public.timesheet_periods USING btree (staff_id, week_start_date);


--
-- Name: idx_tla_engagement_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tla_engagement_period ON public.timesheet_line_approvals USING btree (engagement_id, period_id);


--
-- Name: idx_tla_pending_engagement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tla_pending_engagement ON public.timesheet_line_approvals USING btree (engagement_id) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_trr_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trr_queue ON public.timesheet_reversal_requests USING btree (status, requested_at DESC);


--
-- Name: idx_trr_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trr_requester ON public.timesheet_reversal_requests USING btree (requested_by, requested_at DESC);


--
-- Name: idx_user_roles_role_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role_key ON public.user_roles USING btree (role_key);


--
-- Name: idx_wo_budget_lines_wo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_budget_lines_wo_id ON public.wo_budget_lines USING btree (wo_id);


--
-- Name: idx_wo_expense_budget_wo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_expense_budget_wo_id ON public.wo_expense_budget USING btree (wo_id);


--
-- Name: idx_wo_payment_installments_wo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_payment_installments_wo_id ON public.wo_payment_installments USING btree (wo_id);


--
-- Name: idx_wo_req_skills_req; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_req_skills_req ON public.wo_staffing_requirement_skills USING btree (requirement_id);


--
-- Name: idx_wo_req_skills_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_req_skills_skill ON public.wo_staffing_requirement_skills USING btree (skill_id);


--
-- Name: idx_wo_staffing_requirements_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_staffing_requirements_cat ON public.wo_staffing_requirements USING btree (category_id);


--
-- Name: idx_wo_staffing_requirements_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_staffing_requirements_wo ON public.wo_staffing_requirements USING btree (wo_id);


--
-- Name: practicas_abbreviation_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX practicas_abbreviation_unique ON public.practicas USING btree (abbreviation) WHERE (abbreviation IS NOT NULL);


--
-- Name: uq_trr_open_engagement; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_trr_open_engagement ON public.timesheet_reversal_requests USING btree (period_id, engagement_id) WHERE ((status = 'pending'::text) AND (scope = 'engagement'::text));


--
-- Name: uq_trr_open_week; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_trr_open_week ON public.timesheet_reversal_requests USING btree (period_id) WHERE ((status = 'pending'::text) AND (scope = 'week'::text));


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_01_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_01_inserted_at_topic_idx ON realtime.messages_2026_10_01 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_02_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_02_inserted_at_topic_idx ON realtime.messages_2026_10_02 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_03_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_03_inserted_at_topic_idx ON realtime.messages_2026_10_03 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_04_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_04_inserted_at_topic_idx ON realtime.messages_2026_10_04 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_10_05_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_10_05_inserted_at_topic_idx ON realtime.messages_2026_10_05 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_key ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_iceberg_namespaces_bucket_id; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_iceberg_namespaces_bucket_id ON storage.iceberg_namespaces USING btree (catalog_id, name);


--
-- Name: idx_iceberg_tables_location; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_iceberg_tables_location ON storage.iceberg_tables USING btree (location);


--
-- Name: idx_iceberg_tables_namespace_id; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX idx_iceberg_tables_namespace_id ON storage.iceberg_tables USING btree (catalog_id, namespace_id, name);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: supabase_functions_hooks_h_table_id_h_name_idx; Type: INDEX; Schema: supabase_functions; Owner: -
--

CREATE INDEX supabase_functions_hooks_h_table_id_h_name_idx ON supabase_functions.hooks USING btree (hook_table_id, hook_name);


--
-- Name: supabase_functions_hooks_request_id_idx; Type: INDEX; Schema: supabase_functions; Owner: -
--

CREATE INDEX supabase_functions_hooks_request_id_idx ON supabase_functions.hooks USING btree (request_id);


--
-- Name: messages_2026_10_01_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_01_inserted_at_topic_idx;


--
-- Name: messages_2026_10_01_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_01_pkey;


--
-- Name: messages_2026_10_02_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_02_inserted_at_topic_idx;


--
-- Name: messages_2026_10_02_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_02_pkey;


--
-- Name: messages_2026_10_03_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_03_inserted_at_topic_idx;


--
-- Name: messages_2026_10_03_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_03_pkey;


--
-- Name: messages_2026_10_04_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_04_inserted_at_topic_idx;


--
-- Name: messages_2026_10_04_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_04_pkey;


--
-- Name: messages_2026_10_05_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_10_05_inserted_at_topic_idx;


--
-- Name: messages_2026_10_05_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_10_05_pkey;


--
-- Name: work_order_summary _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.work_order_summary WITH (security_invoker='true') AS
 SELECT wo.wo_id,
    wo.engagement_id,
    wo.currency,
    wo.season_mode,
    wo.tax_rate,
    wo.adjustment_amount,
    wo.notes,
    wo.created_at,
    wo.updated_at,
    wo.approval_status,
    wo.approved_by,
    wo.approved_at,
    COALESCE(sum((bl.budgeted_hours * bl.standard_rate)), (0)::numeric) AS total_standard_fee,
        CASE
            WHEN (COALESCE(sum((bl.budgeted_hours * bl.standard_rate)), (0)::numeric) > (0)::numeric) THEN ((COALESCE(sum((bl.budgeted_hours * bl.standard_rate)), (0)::numeric) + COALESCE(wo.adjustment_amount, (0)::numeric)) / COALESCE(sum((bl.budgeted_hours * bl.standard_rate)), (0)::numeric))
            ELSE (1)::numeric
        END AS realization_percent,
    ((COALESCE(sum((bl.budgeted_hours * bl.standard_rate)), (0)::numeric) + COALESCE(wo.adjustment_amount, (0)::numeric)) / ((1)::numeric - COALESCE(wo.tax_rate, 0.13))) AS fee_with_tax_gross_up
   FROM (public.work_orders wo
     LEFT JOIN public.wo_budget_lines bl ON ((wo.wo_id = bl.wo_id)))
  GROUP BY wo.wo_id;


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: users on_auth_user_created_link_staff; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created_link_staff AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.link_auth_user_to_staff();


--
-- Name: users validate_email_domain_trigger; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER validate_email_domain_trigger BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.validate_email_domain();


--
-- Name: time_entries enforce_holiday_blocking; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_holiday_blocking BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_holiday_blocking();


--
-- Name: engagements engagements_fiscal_year_invariant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engagements_fiscal_year_invariant BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.enforce_engagement_fiscal_year_invariant();


--
-- Name: fund_requests tr_fr_guard_accounting_cols; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fr_guard_accounting_cols BEFORE UPDATE ON public.fund_requests FOR EACH ROW EXECUTE FUNCTION public.fr_guard_accounting_cols();


--
-- Name: fund_request_work_orders tr_fr_wo_guard_approval; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fr_wo_guard_approval BEFORE UPDATE ON public.fund_request_work_orders FOR EACH ROW EXECUTE FUNCTION public.fr_wo_guard_approval_cols();


--
-- Name: fund_request_work_orders tr_fr_wo_rollup; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fr_wo_rollup AFTER UPDATE OF approval_status ON public.fund_request_work_orders FOR EACH ROW EXECUTE FUNCTION public.fr_wo_rollup_status();


--
-- Name: fund_request_work_orders tr_fr_wo_set_manager; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fr_wo_set_manager BEFORE INSERT OR UPDATE OF wo_id ON public.fund_request_work_orders FOR EACH ROW EXECUTE FUNCTION public.fr_wo_set_manager();


--
-- Name: fund_request_work_orders tr_fr_wo_validate_approved; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fr_wo_validate_approved BEFORE INSERT OR UPDATE OF wo_id ON public.fund_request_work_orders FOR EACH ROW EXECUTE FUNCTION public.fr_wo_validate_approved();


--
-- Name: fund_request_expenses tr_fre_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fre_touch BEFORE UPDATE ON public.fund_request_expenses FOR EACH ROW EXECUTE FUNCTION public.fund_request_expenses_touch_updated_at();


--
-- Name: fund_request_expenses tr_fre_validate_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fre_validate_transition BEFORE UPDATE ON public.fund_request_expenses FOR EACH ROW EXECUTE FUNCTION public.fre_validate_transition();


--
-- Name: fund_request_expenses tr_fre_validate_wo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fre_validate_wo BEFORE INSERT OR UPDATE OF wo_id, fund_request_id, currency ON public.fund_request_expenses FOR EACH ROW EXECUTE FUNCTION public.fre_validate_wo_in_request();


--
-- Name: fund_requests tr_fund_requests_enforce_bob; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fund_requests_enforce_bob BEFORE INSERT OR UPDATE ON public.fund_requests FOR EACH ROW EXECUTE FUNCTION public.fund_requests_enforce_bob();


--
-- Name: fund_requests tr_fund_requests_set_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fund_requests_set_number BEFORE INSERT ON public.fund_requests FOR EACH ROW EXECUTE FUNCTION public.set_fund_request_number();


--
-- Name: fund_requests tr_fund_requests_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fund_requests_touch BEFORE UPDATE ON public.fund_requests FOR EACH ROW EXECUTE FUNCTION public.fund_requests_touch_updated_at();


--
-- Name: clients tr_notify_client; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_client AFTER INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.notify_client_events();


--
-- Name: engagements tr_notify_engagement; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_engagement AFTER INSERT OR DELETE OR UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.notify_engagement_events();


--
-- Name: engagement_assignments tr_notify_engagement_staffing; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_engagement_staffing AFTER INSERT OR UPDATE ON public.engagement_assignments FOR EACH ROW EXECUTE FUNCTION public.notify_engagement_staffing_events();


--
-- Name: fund_request_expenses tr_notify_fund_expense; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_fund_expense AFTER UPDATE ON public.fund_request_expenses FOR EACH ROW EXECUTE FUNCTION public.notify_fund_expense_events();


--
-- Name: fund_requests tr_notify_fund_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_fund_request AFTER UPDATE ON public.fund_requests FOR EACH ROW EXECUTE FUNCTION public.notify_fund_request_events();


--
-- Name: staff tr_notify_staff; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_staff AFTER INSERT OR UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.notify_staff_events();


--
-- Name: staff_skills tr_notify_staff_competency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_staff_competency AFTER INSERT OR DELETE ON public.staff_skills FOR EACH ROW EXECUTE FUNCTION public.notify_staff_competency_events();


--
-- Name: timer_entries tr_notify_timer_auto_stop; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_timer_auto_stop AFTER UPDATE ON public.timer_entries FOR EACH ROW EXECUTE FUNCTION public.notify_timer_auto_stop_events();


--
-- Name: timesheet_line_approvals tr_notify_timesheet_line_approval; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_timesheet_line_approval AFTER INSERT OR UPDATE ON public.timesheet_line_approvals FOR EACH ROW EXECUTE FUNCTION public.notify_timesheet_line_approval_events();


--
-- Name: timesheet_periods tr_notify_timesheet_period; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_timesheet_period AFTER UPDATE ON public.timesheet_periods FOR EACH ROW EXECUTE FUNCTION public.notify_timesheet_period_events();


--
-- Name: user_roles tr_notify_user_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_user_account AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.notify_user_account_events();


--
-- Name: wo_payment_installments tr_notify_wo_installment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_wo_installment AFTER UPDATE ON public.wo_payment_installments FOR EACH ROW EXECUTE FUNCTION public.notify_wo_installment_events();


--
-- Name: work_orders tr_notify_work_order; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_work_order AFTER UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.notify_work_order_events();


--
-- Name: activity_worksheets tr_notify_worksheet; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_notify_worksheet AFTER UPDATE ON public.activity_worksheets FOR EACH ROW EXECUTE FUNCTION public.notify_worksheet_events();


--
-- Name: engagement_assignments tr_reject_engagement_assignment_move; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_reject_engagement_assignment_move BEFORE UPDATE ON public.engagement_assignments FOR EACH ROW EXECUTE FUNCTION public.reject_engagement_assignment_move();


--
-- Name: work_orders tr_reject_work_order_engagement_move; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_reject_work_order_engagement_move BEFORE UPDATE OF engagement_id ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.reject_work_order_engagement_move();


--
-- Name: work_orders tr_wo_guard_risk_approval; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_wo_guard_risk_approval BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.wo_guard_risk_approval();


--
-- Name: engagements trg_authorize_engagement_state_override; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_authorize_engagement_state_override BEFORE INSERT OR UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.authorize_engagement_state_override();


--
-- Name: authorization_permissions trg_authz_perms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_authz_perms_updated_at BEFORE UPDATE ON public.authorization_permissions FOR EACH ROW EXECUTE FUNCTION public.set_authz_updated_at();


--
-- Name: authorization_roles trg_authz_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_authz_roles_updated_at BEFORE UPDATE ON public.authorization_roles FOR EACH ROW EXECUTE FUNCTION public.set_authz_updated_at();


--
-- Name: practicas trg_cascade_abbreviation_rename; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cascade_abbreviation_rename AFTER UPDATE OF abbreviation ON public.practicas FOR EACH ROW EXECUTE FUNCTION public.cascade_practice_abbreviation_rename();


--
-- Name: time_entries trg_check_engagement_dates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_engagement_dates BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.check_time_entry_engagement_dates();


--
-- Name: time_entries trg_check_wo_approved; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_wo_approved BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.check_wo_approved();


--
-- Name: clients trg_clients_created_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_clients_created_by BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_client_created_by();


--
-- Name: time_entries trg_enforce_activity_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_activity_default BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_default();


--
-- Name: engagements trg_enforce_administrative_engagement_rules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_administrative_engagement_rules BEFORE INSERT OR UPDATE OF funcion, client_id, society_id, is_internal, activity_required ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.enforce_administrative_engagement_rules();


--
-- Name: wo_payment_installments trg_enforce_administrative_no_payment_installments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_administrative_no_payment_installments BEFORE INSERT OR UPDATE ON public.wo_payment_installments FOR EACH ROW EXECUTE FUNCTION public.enforce_administrative_no_payment_installments();


--
-- Name: wo_payment_plan trg_enforce_administrative_no_payment_plan; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_administrative_no_payment_plan BEFORE INSERT OR UPDATE ON public.wo_payment_plan FOR EACH ROW EXECUTE FUNCTION public.enforce_administrative_no_payment_plan();


--
-- Name: work_orders trg_enforce_administrative_work_order_rules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_administrative_work_order_rules BEFORE INSERT OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.enforce_administrative_work_order_rules();


--
-- Name: engagement_assignments trg_enforce_assignment_practice_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_assignment_practice_scope BEFORE INSERT OR UPDATE ON public.engagement_assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_practice_scope();


--
-- Name: time_entries trg_enforce_termination_date; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_termination_date BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_termination_date();


--
-- Name: wo_staffing_requirements trg_enforce_wo_staffing_practice_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_wo_staffing_practice_scope BEFORE INSERT OR UPDATE ON public.wo_staffing_requirements FOR EACH ROW EXECUTE FUNCTION public.enforce_wo_staffing_practice_scope();


--
-- Name: activity_worksheet_cells trg_enforce_worksheet_cell_practice_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_worksheet_cell_practice_scope BEFORE INSERT OR UPDATE ON public.activity_worksheet_cells FOR EACH ROW EXECUTE FUNCTION public.enforce_worksheet_cell_practice_scope();


--
-- Name: engagements trg_engagements_created_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_engagements_created_by BEFORE INSERT OR UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.set_engagement_created_by();


--
-- Name: engagements trg_engagements_creator_team; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_engagements_creator_team BEFORE INSERT ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.enforce_engagement_creator_team();


--
-- Name: engagements trg_engagements_log_assignment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_engagements_log_assignment AFTER UPDATE OF partner_id, manager_id ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.log_engagement_assignment_change();


--
-- Name: engagements trg_engagements_profile_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_engagements_profile_scope BEFORE INSERT OR UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.enforce_engagement_profile_scope();


--
-- Name: global_settings trg_guard_auth_lockout_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_auth_lockout_settings BEFORE INSERT OR UPDATE ON public.global_settings FOR EACH ROW EXECUTE FUNCTION public.guard_auth_lockout_settings();


--
-- Name: staff trg_link_staff_to_auth_user; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_link_staff_to_auth_user BEFORE INSERT OR UPDATE OF email ON public.staff FOR EACH ROW EXECUTE FUNCTION public.link_staff_to_auth_user();


--
-- Name: portfolio_events trg_portfolio_events_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_portfolio_events_append_only BEFORE DELETE OR UPDATE ON public.portfolio_events FOR EACH ROW EXECUTE FUNCTION public.portfolio_events_append_only();


--
-- Name: timer_entries trg_prevent_imported_timer_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_imported_timer_delete BEFORE DELETE ON public.timer_entries FOR EACH ROW EXECUTE FUNCTION public.prevent_imported_timer_delete();


--
-- Name: staff trg_prevent_self_blocked_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_self_blocked_change BEFORE UPDATE OF is_blocked ON public.staff FOR EACH ROW EXECUTE FUNCTION public.prevent_self_blocked_change();


--
-- Name: staff trg_prevent_staff_reactivation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_staff_reactivation BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.prevent_staff_reactivation();


--
-- Name: time_entries trg_protect_approved_time_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_approved_time_entries BEFORE INSERT OR DELETE OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.protect_approved_time_entries();


--
-- Name: engagements trg_recompute_engagement_finalization; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recompute_engagement_finalization BEFORE INSERT OR UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.recompute_engagement_finalization();


--
-- Name: timer_entries trg_reset_timer_import_on_unlink; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reset_timer_import_on_unlink BEFORE UPDATE ON public.timer_entries FOR EACH ROW EXECUTE FUNCTION public.reset_timer_import_on_unlink();


--
-- Name: timesheet_periods trg_validate_submission_has_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_submission_has_entries BEFORE UPDATE ON public.timesheet_periods FOR EACH ROW WHEN (((new.submitted_at IS NOT NULL) AND (old.submitted_at IS NULL))) EXECUTE FUNCTION public.validate_submission_has_entries();


--
-- Name: timer_entries trg_validate_timer_duration; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_timer_duration BEFORE INSERT OR UPDATE ON public.timer_entries FOR EACH ROW EXECUTE FUNCTION public.validate_timer_entry_duration();


--
-- Name: wo_payment_installments trg_wo_payment_installments_guard_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_wo_payment_installments_guard_delete BEFORE DELETE ON public.wo_payment_installments FOR EACH ROW EXECUTE FUNCTION public.wo_payment_installments_guard_delete();


--
-- Name: wo_payment_installments trg_wo_payment_installments_guard_exchange_rate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_wo_payment_installments_guard_exchange_rate BEFORE INSERT OR UPDATE ON public.wo_payment_installments FOR EACH ROW EXECUTE FUNCTION public.wo_payment_installments_guard_exchange_rate();


--
-- Name: wo_payment_plan trg_wo_payment_plan_guard_exchange_rate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_wo_payment_plan_guard_exchange_rate BEFORE INSERT OR DELETE OR UPDATE ON public.wo_payment_plan FOR EACH ROW EXECUTE FUNCTION public.wo_payment_plan_guard_exchange_rate();


--
-- Name: wo_payment_plan trg_wo_payment_plan_sync_fixed_installments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_wo_payment_plan_sync_fixed_installments AFTER UPDATE ON public.wo_payment_plan FOR EACH ROW EXECUTE FUNCTION public.wo_payment_plan_sync_fixed_installments();


--
-- Name: activity_worksheet_cells update_activity_worksheet_cells_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_activity_worksheet_cells_updated_at BEFORE UPDATE ON public.activity_worksheet_cells FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: activity_worksheets update_activity_worksheets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_activity_worksheets_updated_at BEFORE UPDATE ON public.activity_worksheets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: categories update_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: engagement_assignments update_engagement_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_engagement_assignments_updated_at BEFORE UPDATE ON public.engagement_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: engagements update_engagements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_engagements_updated_at BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: global_settings update_global_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_global_settings_updated_at BEFORE UPDATE ON public.global_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: holidays update_holidays_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_holidays_updated_at BEFORE UPDATE ON public.holidays FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: industries update_industries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_industries_updated_at BEFORE UPDATE ON public.industries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: skills update_skills_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_skills_updated_at BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: staff_skills update_staff_skills_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_staff_skills_updated_at BEFORE UPDATE ON public.staff_skills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: staff update_staff_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: time_entries update_time_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timesheet_line_approvals update_timesheet_line_approvals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timesheet_line_approvals_updated_at BEFORE UPDATE ON public.timesheet_line_approvals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timesheet_periods update_timesheet_periods_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timesheet_periods_updated_at BEFORE UPDATE ON public.timesheet_periods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: timesheet_reversal_requests update_timesheet_reversal_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timesheet_reversal_requests_updated_at BEFORE UPDATE ON public.timesheet_reversal_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: wo_payment_installments update_wo_payment_installments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_wo_payment_installments_updated_at BEFORE UPDATE ON public.wo_payment_installments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: wo_payment_plan update_wo_payment_plan_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_wo_payment_plan_updated_at BEFORE UPDATE ON public.wo_payment_plan FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: wo_staffing_requirements update_wo_staffing_requirements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_wo_staffing_requirements_updated_at BEFORE UPDATE ON public.wo_staffing_requirements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: work_orders update_work_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_work_orders_updated_at BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: extensions extensions_tenant_external_id_fkey; Type: FK CONSTRAINT; Schema: _realtime; Owner: -
--

ALTER TABLE ONLY _realtime.extensions
    ADD CONSTRAINT extensions_tenant_external_id_fkey FOREIGN KEY (tenant_external_id) REFERENCES _realtime.tenants(external_id) ON DELETE CASCADE;


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: activity_codes activity_codes_default_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_default_category_id_fkey FOREIGN KEY (default_category_id) REFERENCES public.categories(category_id);


--
-- Name: activity_codes activity_codes_practica_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_practica_id_fkey FOREIGN KEY (practica_id) REFERENCES public.practicas(practica_id) ON DELETE RESTRICT;


--
-- Name: activity_worksheet_cells activity_worksheet_cells_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheet_cells
    ADD CONSTRAINT activity_worksheet_cells_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity_codes(activity_id);


--
-- Name: activity_worksheet_cells activity_worksheet_cells_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheet_cells
    ADD CONSTRAINT activity_worksheet_cells_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id);


--
-- Name: activity_worksheet_cells activity_worksheet_cells_worksheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheet_cells
    ADD CONSTRAINT activity_worksheet_cells_worksheet_id_fkey FOREIGN KEY (worksheet_id) REFERENCES public.activity_worksheets(id) ON DELETE CASCADE;


--
-- Name: activity_worksheets activity_worksheets_created_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheets
    ADD CONSTRAINT activity_worksheets_created_by_staff_id_fkey FOREIGN KEY (created_by_staff_id) REFERENCES public.staff(staff_id);


--
-- Name: activity_worksheets activity_worksheets_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheets
    ADD CONSTRAINT activity_worksheets_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id) ON DELETE CASCADE;


--
-- Name: activity_worksheets activity_worksheets_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheets
    ADD CONSTRAINT activity_worksheets_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE SET NULL;


--
-- Name: authorization_role_permissions authorization_role_permissions_permission_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_role_permissions
    ADD CONSTRAINT authorization_role_permissions_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.authorization_permissions(permission_key) ON DELETE CASCADE;


--
-- Name: authorization_role_permissions authorization_role_permissions_role_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_role_permissions
    ADD CONSTRAINT authorization_role_permissions_role_key_fkey FOREIGN KEY (role_key) REFERENCES public.authorization_roles(role_key) ON DELETE CASCADE;


--
-- Name: categories categories_default_role_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_default_role_key_fkey FOREIGN KEY (default_role_key) REFERENCES public.authorization_roles(role_key) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: categories categories_practica_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_practica_id_fkey FOREIGN KEY (practica_id) REFERENCES public.practicas(practica_id) ON DELETE RESTRICT;


--
-- Name: clients clients_created_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_created_by_staff_id_fkey FOREIGN KEY (created_by_staff_id) REFERENCES public.staff(staff_id);


--
-- Name: clients clients_industry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_industry_id_fkey FOREIGN KEY (industry_id) REFERENCES public.industries(industry_id);


--
-- Name: engagement_assignments engagement_assignments_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_assignments
    ADD CONSTRAINT engagement_assignments_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE RESTRICT;


--
-- Name: engagement_assignments engagement_assignments_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_assignments
    ADD CONSTRAINT engagement_assignments_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id) ON DELETE CASCADE;


--
-- Name: engagement_assignments engagement_assignments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_assignments
    ADD CONSTRAINT engagement_assignments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id);


--
-- Name: engagements engagements_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(client_id) ON DELETE CASCADE;


--
-- Name: engagements engagements_created_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_created_by_staff_id_fkey FOREIGN KEY (created_by_staff_id) REFERENCES public.staff(staff_id);


--
-- Name: engagements engagements_encargado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_encargado_id_fkey FOREIGN KEY (encargado_id) REFERENCES public.staff(staff_id);


--
-- Name: engagements engagements_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.staff(staff_id);


--
-- Name: engagements engagements_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.staff(staff_id);


--
-- Name: engagements engagements_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.society(society_id) ON DELETE RESTRICT;


--
-- Name: engagements engagements_specialist_it_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_specialist_it_id_fkey FOREIGN KEY (specialist_it_id) REFERENCES public.staff(staff_id);


--
-- Name: engagements engagements_specialist_tax_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_specialist_tax_id_fkey FOREIGN KEY (specialist_tax_id) REFERENCES public.staff(staff_id);


--
-- Name: engagements engagements_sqr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_sqr_id_fkey FOREIGN KEY (sqr_id) REFERENCES public.staff(staff_id);


--
-- Name: engagements engagements_taxonomy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_taxonomy_id_fkey FOREIGN KEY (taxonomy_id) REFERENCES public.servicios(taxonomy_id);


--
-- Name: fund_request_expenses fund_request_expenses_expense_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_expenses
    ADD CONSTRAINT fund_request_expenses_expense_type_id_fkey FOREIGN KEY (expense_type_id) REFERENCES public.expense_types(expense_type_id);


--
-- Name: fund_request_expenses fund_request_expenses_fund_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_expenses
    ADD CONSTRAINT fund_request_expenses_fund_request_id_fkey FOREIGN KEY (fund_request_id) REFERENCES public.fund_requests(fund_request_id) ON DELETE CASCADE;


--
-- Name: fund_request_expenses fund_request_expenses_reviewed_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_expenses
    ADD CONSTRAINT fund_request_expenses_reviewed_by_staff_id_fkey FOREIGN KEY (reviewed_by_staff_id) REFERENCES public.staff(staff_id);


--
-- Name: fund_request_expenses fund_request_expenses_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_expenses
    ADD CONSTRAINT fund_request_expenses_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id);


--
-- Name: fund_request_work_orders fund_request_work_orders_fund_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_work_orders
    ADD CONSTRAINT fund_request_work_orders_fund_request_id_fkey FOREIGN KEY (fund_request_id) REFERENCES public.fund_requests(fund_request_id) ON DELETE CASCADE;


--
-- Name: fund_request_work_orders fund_request_work_orders_manager_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_work_orders
    ADD CONSTRAINT fund_request_work_orders_manager_staff_id_fkey FOREIGN KEY (manager_staff_id) REFERENCES public.staff(staff_id);


--
-- Name: fund_request_work_orders fund_request_work_orders_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_work_orders
    ADD CONSTRAINT fund_request_work_orders_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id);


--
-- Name: fund_requests fund_requests_approver_manager_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_approver_manager_staff_id_fkey FOREIGN KEY (approver_manager_staff_id) REFERENCES public.staff(staff_id);


--
-- Name: fund_requests fund_requests_disbursed_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_disbursed_by_staff_id_fkey FOREIGN KEY (disbursed_by_staff_id) REFERENCES public.staff(staff_id);


--
-- Name: fund_requests fund_requests_requester_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_requester_staff_id_fkey FOREIGN KEY (requester_staff_id) REFERENCES public.staff(staff_id);


--
-- Name: fund_requests fund_requests_settled_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_settled_by_staff_id_fkey FOREIGN KEY (settled_by_staff_id) REFERENCES public.staff(staff_id);


--
-- Name: holidays holidays_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(staff_id);


--
-- Name: notification_emails notification_emails_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_emails
    ADD CONSTRAINT notification_emails_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(notification_id) ON DELETE SET NULL;


--
-- Name: notification_emails notification_emails_recipient_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_emails
    ADD CONSTRAINT notification_emails_recipient_staff_id_fkey FOREIGN KEY (recipient_staff_id) REFERENCES public.staff(staff_id) ON DELETE CASCADE;


--
-- Name: notification_emails notification_emails_type_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_emails
    ADD CONSTRAINT notification_emails_type_key_fkey FOREIGN KEY (type_key) REFERENCES public.notification_types(type_key) ON DELETE CASCADE;


--
-- Name: notification_role_types notification_role_types_role_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_role_types
    ADD CONSTRAINT notification_role_types_role_key_fkey FOREIGN KEY (role_key) REFERENCES public.authorization_roles(role_key) ON DELETE CASCADE;


--
-- Name: notification_role_types notification_role_types_type_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_role_types
    ADD CONSTRAINT notification_role_types_type_key_fkey FOREIGN KEY (type_key) REFERENCES public.notification_types(type_key) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_staff_id_fkey FOREIGN KEY (recipient_staff_id) REFERENCES public.staff(staff_id) ON DELETE CASCADE;


--
-- Name: notifications notifications_type_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_type_key_fkey FOREIGN KEY (type_key) REFERENCES public.notification_types(type_key) ON DELETE CASCADE;


--
-- Name: servicios servicios_practica_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_practica_id_fkey FOREIGN KEY (practica_id) REFERENCES public.practicas(practica_id) ON DELETE SET NULL;


--
-- Name: staff_alert_seen staff_alert_seen_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_alert_seen
    ADD CONSTRAINT staff_alert_seen_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id) ON DELETE CASCADE;


--
-- Name: staff staff_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: staff staff_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id);


--
-- Name: staff staff_practica_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_practica_category_fk FOREIGN KEY (practica_id, category_id) REFERENCES public.categories(practica_id, category_id);


--
-- Name: staff staff_practica_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_practica_id_fkey FOREIGN KEY (practica_id) REFERENCES public.practicas(practica_id) ON DELETE RESTRICT;


--
-- Name: staff_skills staff_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_skills
    ADD CONSTRAINT staff_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id) ON DELETE RESTRICT;


--
-- Name: staff_skills staff_skills_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_skills
    ADD CONSTRAINT staff_skills_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id) ON DELETE CASCADE;


--
-- Name: staff staff_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.society(society_id) ON DELETE RESTRICT;


--
-- Name: time_entries time_entries_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity_codes(activity_id);


--
-- Name: time_entries time_entries_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id);


--
-- Name: time_entries time_entries_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.timesheet_periods(period_id);


--
-- Name: time_entries time_entries_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id);


--
-- Name: timer_entries timer_entries_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_entries
    ADD CONSTRAINT timer_entries_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity_codes(activity_id);


--
-- Name: timer_entries timer_entries_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_entries
    ADD CONSTRAINT timer_entries_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id);


--
-- Name: timer_entries timer_entries_imported_to_time_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_entries
    ADD CONSTRAINT timer_entries_imported_to_time_id_fkey FOREIGN KEY (imported_to_time_id) REFERENCES public.time_entries(time_id) ON DELETE SET NULL;


--
-- Name: timer_entries timer_entries_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_entries
    ADD CONSTRAINT timer_entries_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id);


--
-- Name: timesheet_line_approvals timesheet_line_approvals_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity_codes(activity_id);


--
-- Name: timesheet_line_approvals timesheet_line_approvals_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.staff(staff_id);


--
-- Name: timesheet_line_approvals timesheet_line_approvals_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id);


--
-- Name: timesheet_line_approvals timesheet_line_approvals_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.timesheet_periods(period_id) ON DELETE CASCADE;


--
-- Name: timesheet_periods timesheet_periods_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_periods
    ADD CONSTRAINT timesheet_periods_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id) ON DELETE CASCADE;


--
-- Name: timesheet_reversal_requests timesheet_reversal_requests_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_reversal_requests
    ADD CONSTRAINT timesheet_reversal_requests_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id);


--
-- Name: timesheet_reversal_requests timesheet_reversal_requests_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_reversal_requests
    ADD CONSTRAINT timesheet_reversal_requests_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.timesheet_periods(period_id) ON DELETE CASCADE;


--
-- Name: timesheet_reversal_requests timesheet_reversal_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_reversal_requests
    ADD CONSTRAINT timesheet_reversal_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.staff(staff_id);


--
-- Name: timesheet_reversal_requests timesheet_reversal_requests_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_reversal_requests
    ADD CONSTRAINT timesheet_reversal_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.staff(staff_id);


--
-- Name: user_roles user_roles_role_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_key_fkey FOREIGN KEY (role_key) REFERENCES public.authorization_roles(role_key);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wo_budget_lines wo_budget_lines_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_budget_lines
    ADD CONSTRAINT wo_budget_lines_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id);


--
-- Name: wo_budget_lines wo_budget_lines_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_budget_lines
    ADD CONSTRAINT wo_budget_lines_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE CASCADE;


--
-- Name: wo_expense_budget wo_expense_budget_expense_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_expense_budget
    ADD CONSTRAINT wo_expense_budget_expense_type_id_fkey FOREIGN KEY (expense_type_id) REFERENCES public.expense_types(expense_type_id);


--
-- Name: wo_expense_budget wo_expense_budget_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_expense_budget
    ADD CONSTRAINT wo_expense_budget_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE CASCADE;


--
-- Name: wo_payment_installments wo_payment_installments_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_installments
    ADD CONSTRAINT wo_payment_installments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.wo_payment_plan(plan_id) ON DELETE CASCADE;


--
-- Name: wo_payment_installments wo_payment_installments_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_installments
    ADD CONSTRAINT wo_payment_installments_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE CASCADE;


--
-- Name: wo_payment_plan wo_payment_plan_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_plan
    ADD CONSTRAINT wo_payment_plan_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE CASCADE;


--
-- Name: wo_staffing_requirement_skills wo_staffing_requirement_skills_requirement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirement_skills
    ADD CONSTRAINT wo_staffing_requirement_skills_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES public.wo_staffing_requirements(id) ON DELETE CASCADE;


--
-- Name: wo_staffing_requirement_skills wo_staffing_requirement_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirement_skills
    ADD CONSTRAINT wo_staffing_requirement_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id) ON DELETE RESTRICT;


--
-- Name: wo_staffing_requirements wo_staffing_requirements_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirements
    ADD CONSTRAINT wo_staffing_requirements_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE RESTRICT;


--
-- Name: wo_staffing_requirements wo_staffing_requirements_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirements
    ADD CONSTRAINT wo_staffing_requirements_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE CASCADE;


--
-- Name: work_orders work_orders_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.staff(staff_id);


--
-- Name: work_orders work_orders_emergency_partner_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_emergency_partner_by_fkey FOREIGN KEY (emergency_partner_by) REFERENCES public.staff(staff_id);


--
-- Name: work_orders work_orders_emergency_review_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_emergency_review_by_fkey FOREIGN KEY (emergency_review_by) REFERENCES public.staff(staff_id);


--
-- Name: work_orders work_orders_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id) ON DELETE CASCADE;


--
-- Name: work_orders work_orders_risk_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_risk_approved_by_fkey FOREIGN KEY (risk_approved_by) REFERENCES public.staff(staff_id);


--
-- Name: iceberg_namespaces iceberg_namespaces_catalog_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_namespaces
    ADD CONSTRAINT iceberg_namespaces_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES storage.buckets_analytics(id) ON DELETE CASCADE;


--
-- Name: iceberg_tables iceberg_tables_catalog_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_tables
    ADD CONSTRAINT iceberg_tables_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES storage.buckets_analytics(id) ON DELETE CASCADE;


--
-- Name: iceberg_tables iceberg_tables_namespace_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.iceberg_tables
    ADD CONSTRAINT iceberg_tables_namespace_id_fkey FOREIGN KEY (namespace_id) REFERENCES storage.iceberg_namespaces(id) ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: wo_payment_installments Accounting can update payment installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Accounting can update payment installments" ON public.wo_payment_installments FOR UPDATE TO authenticated USING ((public.current_role_key() = 'collections_analyst'::text)) WITH CHECK ((public.current_role_key() = 'collections_analyst'::text));


--
-- Name: timesheet_periods Admin can update all periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update all periods" ON public.timesheet_periods FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role_key = 'admin'::text)))));


--
-- Name: holidays Admins can delete holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete holidays" ON public.holidays FOR DELETE USING (public.is_admin());


--
-- Name: holidays Admins can insert holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert holidays" ON public.holidays FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: practicas Admins can insert practicas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert practicas" ON public.practicas FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: servicios Admins can insert servicios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert servicios" ON public.servicios FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: user_roles Admins can manage all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all roles" ON public.user_roles USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: wo_budget_lines Admins can manage budget lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage budget lines" ON public.wo_budget_lines TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: categories Admins can manage categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage categories" ON public.categories TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: wo_expense_budget Admins can manage expense budget; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage expense budget" ON public.wo_expense_budget TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: expense_types Admins can manage expense types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage expense types" ON public.expense_types TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: industries Admins can manage industries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage industries" ON public.industries TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: wo_payment_installments Admins can manage payment installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage payment installments" ON public.wo_payment_installments TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: wo_payment_plan Admins can manage payment plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage payment plans" ON public.wo_payment_plan TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: global_settings Admins can manage settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage settings" ON public.global_settings TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: skills Admins can manage skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage skills" ON public.skills TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: work_orders Admins can manage work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage work orders" ON public.work_orders TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: activity_worksheet_cells Admins can manage worksheet cells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage worksheet cells" ON public.activity_worksheet_cells TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: activity_worksheets Admins can manage worksheets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage worksheets" ON public.activity_worksheets TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: holidays Admins can update holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update holidays" ON public.holidays FOR UPDATE USING (public.is_admin());


--
-- Name: practicas Admins can update practicas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update practicas" ON public.practicas FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: servicios Admins can update servicios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update servicios" ON public.servicios FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: wo_budget_lines Admins can view all budget lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all budget lines" ON public.wo_budget_lines FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: wo_expense_budget Admins can view all expense budget; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all expense budget" ON public.wo_expense_budget FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: wo_payment_installments Admins can view all payment installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all payment installments" ON public.wo_payment_installments FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: wo_payment_plan Admins can view all payment plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all payment plans" ON public.wo_payment_plan FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: work_orders Admins can view all work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all work orders" ON public.work_orders FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: activity_worksheet_cells Admins can view all worksheet cells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all worksheet cells" ON public.activity_worksheet_cells FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: activity_worksheets Admins can view all worksheets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all worksheets" ON public.activity_worksheets FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: user_lifecycle_audit_log Admins can view lifecycle audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view lifecycle audit" ON public.user_lifecycle_audit_log FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: timesheet_line_approvals Approvers can update assigned line approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can update assigned line approvals" ON public.timesheet_line_approvals FOR UPDATE USING (public.can_approve_timesheet_line(auth.uid(), period_id, engagement_id));


--
-- Name: timesheet_periods Approvers can update assigned timesheets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can update assigned timesheets" ON public.timesheet_periods FOR UPDATE USING (public.can_approve_timesheet(auth.uid(), period_id));


--
-- Name: timesheet_line_approvals Approvers can view assigned line approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can view assigned line approvals" ON public.timesheet_line_approvals FOR SELECT USING (public.can_approve_timesheet_line(auth.uid(), period_id, engagement_id));


--
-- Name: timesheet_periods Approvers can view assigned timesheets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can view assigned timesheets" ON public.timesheet_periods FOR SELECT USING (public.can_approve_timesheet(auth.uid(), period_id));


--
-- Name: work_orders Assigned SQR can update work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned SQR can update work orders" ON public.work_orders FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE ((e.engagement_id = work_orders.engagement_id) AND (e.sqr_id = public.get_my_staff_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE ((e.engagement_id = work_orders.engagement_id) AND (e.sqr_id = public.get_my_staff_id())))));


--
-- Name: work_orders Assigned SQR can view work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned SQR can view work orders" ON public.work_orders FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE ((e.engagement_id = work_orders.engagement_id) AND (e.sqr_id = public.get_my_staff_id())))));


--
-- Name: staff Authenticated staff can view active staff directory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated staff can view active staff directory" ON public.staff FOR SELECT TO authenticated USING (((is_active = true) AND (public.get_my_staff_id() IS NOT NULL)));


--
-- Name: activity_codes Authenticated users can read activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read activities" ON public.activity_codes FOR SELECT TO authenticated USING (true);


--
-- Name: categories Authenticated users can read categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read categories" ON public.categories FOR SELECT TO authenticated USING (true);


--
-- Name: exchange_rate_history Authenticated users can read exchange rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read exchange rates" ON public.exchange_rate_history FOR SELECT TO authenticated USING (true);


--
-- Name: expense_types Authenticated users can read expense types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read expense types" ON public.expense_types FOR SELECT TO authenticated USING (true);


--
-- Name: holidays Authenticated users can read holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read holidays" ON public.holidays FOR SELECT TO authenticated USING (true);


--
-- Name: industries Authenticated users can read industries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read industries" ON public.industries FOR SELECT TO authenticated USING (true);


--
-- Name: practicas Authenticated users can read practicas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read practicas" ON public.practicas FOR SELECT TO authenticated USING (true);


--
-- Name: servicios Authenticated users can read servicios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read servicios" ON public.servicios FOR SELECT TO authenticated USING (true);


--
-- Name: global_settings Authenticated users can read settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read settings" ON public.global_settings FOR SELECT TO authenticated USING (true);


--
-- Name: society Authenticated users can read society; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read society" ON public.society FOR SELECT TO authenticated USING (true);


--
-- Name: staff Authenticated users can read staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read staff" ON public.staff FOR SELECT TO authenticated USING (true);


--
-- Name: staff_skills Authenticated users can read staff skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read staff skills" ON public.staff_skills FOR SELECT TO authenticated USING (true);


--
-- Name: timesheet_line_approvals Firm-wide read line approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Firm-wide read line approvals" ON public.timesheet_line_approvals FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.user_roles ur
     JOIN public.authorization_role_permissions rp ON ((rp.role_key = ur.role_key)))
  WHERE ((ur.user_id = auth.uid()) AND (rp.permission_key = 'timesheet_approval.read'::text) AND (rp.scope_key = 'firm'::text)))));


--
-- Name: timesheet_periods Firm-wide read periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Firm-wide read periods" ON public.timesheet_periods FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.user_roles ur
     JOIN public.authorization_role_permissions rp ON ((rp.role_key = ur.role_key)))
  WHERE ((ur.user_id = auth.uid()) AND (rp.permission_key = 'timesheet_approval.read'::text) AND (rp.scope_key = 'firm'::text)))));


--
-- Name: wo_payment_installments Manager can manage payment installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Manager can manage payment installments" ON public.wo_payment_installments TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.wo_payment_plan p
     JOIN public.work_orders wo ON ((wo.wo_id = p.wo_id)))
     JOIN public.engagements e ON ((e.engagement_id = wo.engagement_id)))
  WHERE ((p.plan_id = wo_payment_installments.plan_id) AND (e.manager_id = public.get_my_staff_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.wo_payment_plan p
     JOIN public.work_orders wo ON ((wo.wo_id = p.wo_id)))
     JOIN public.engagements e ON ((e.engagement_id = wo.engagement_id)))
  WHERE ((p.plan_id = wo_payment_installments.plan_id) AND (e.manager_id = public.get_my_staff_id())))));


--
-- Name: wo_payment_plan Manager can manage payment plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Manager can manage payment plans" ON public.wo_payment_plan TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.work_orders wo
     JOIN public.engagements e ON ((e.engagement_id = wo.engagement_id)))
  WHERE ((wo.wo_id = wo_payment_plan.wo_id) AND (e.manager_id = public.get_my_staff_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.work_orders wo
     JOIN public.engagements e ON ((e.engagement_id = wo.engagement_id)))
  WHERE ((wo.wo_id = wo_payment_plan.wo_id) AND (e.manager_id = public.get_my_staff_id())))));


--
-- Name: timesheet_line_approvals Staff can create own line approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can create own line approvals" ON public.timesheet_line_approvals FOR INSERT WITH CHECK ((period_id IN ( SELECT tp.period_id
   FROM (public.timesheet_periods tp
     JOIN public.staff s ON ((tp.staff_id = s.staff_id)))
  WHERE (s.auth_user_id = auth.uid()))));


--
-- Name: timesheet_periods Staff can create own periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can create own periods" ON public.timesheet_periods FOR INSERT WITH CHECK ((staff_id IN ( SELECT s.staff_id
   FROM public.staff s
  WHERE (s.auth_user_id = auth.uid()))));


--
-- Name: timesheet_periods Staff can update own unlocked periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update own unlocked periods" ON public.timesheet_periods FOR UPDATE USING (((staff_id IN ( SELECT s.staff_id
   FROM public.staff s
  WHERE (s.auth_user_id = auth.uid()))) AND (is_period_locked = false)));


--
-- Name: engagements Staff can view fund request engagements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view fund request engagements" ON public.engagements FOR SELECT TO authenticated USING (public.engagement_in_my_fund_request(engagement_id));


--
-- Name: work_orders Staff can view fund request work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view fund request work orders" ON public.work_orders FOR SELECT TO authenticated USING (public.wo_in_my_fund_request(wo_id));


--
-- Name: timesheet_line_approvals Staff can view own line approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view own line approvals" ON public.timesheet_line_approvals FOR SELECT USING ((period_id IN ( SELECT tp.period_id
   FROM (public.timesheet_periods tp
     JOIN public.staff s ON ((tp.staff_id = s.staff_id)))
  WHERE (s.auth_user_id = auth.uid()))));


--
-- Name: timesheet_periods Staff can view own periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view own periods" ON public.timesheet_periods FOR SELECT USING ((staff_id IN ( SELECT s.staff_id
   FROM public.staff s
  WHERE (s.auth_user_id = auth.uid()))));


--
-- Name: wo_budget_lines Team can manage budget lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can manage budget lines" ON public.wo_budget_lines TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_budget_lines.wo_id) AND public.is_engagement_team_member(wo.engagement_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_budget_lines.wo_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
-- Name: wo_expense_budget Team can manage expense budget; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can manage expense budget" ON public.wo_expense_budget TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_expense_budget.wo_id) AND public.is_engagement_team_member(wo.engagement_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_expense_budget.wo_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
-- Name: activity_worksheet_cells Team can manage worksheet cells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can manage worksheet cells" ON public.activity_worksheet_cells TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.activity_worksheets aw
  WHERE ((aw.id = activity_worksheet_cells.worksheet_id) AND public.is_engagement_team_member(aw.engagement_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.activity_worksheets aw
  WHERE ((aw.id = activity_worksheet_cells.worksheet_id) AND public.is_engagement_team_member(aw.engagement_id)))));


--
-- Name: wo_budget_lines Team can view budget lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view budget lines" ON public.wo_budget_lines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_budget_lines.wo_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
-- Name: work_orders Team can view engagement work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view engagement work orders" ON public.work_orders FOR SELECT TO authenticated USING (public.is_engagement_team_member(engagement_id));


--
-- Name: wo_expense_budget Team can view expense budget; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view expense budget" ON public.wo_expense_budget FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_expense_budget.wo_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
-- Name: wo_payment_installments Team can view payment installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view payment installments" ON public.wo_payment_installments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.wo_payment_plan p
     JOIN public.work_orders wo ON ((wo.wo_id = p.wo_id)))
  WHERE ((p.plan_id = wo_payment_installments.plan_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
-- Name: wo_payment_plan Team can view payment plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view payment plans" ON public.wo_payment_plan FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_payment_plan.wo_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
-- Name: activity_worksheet_cells Team can view worksheet cells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view worksheet cells" ON public.activity_worksheet_cells FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.activity_worksheets aw
  WHERE ((aw.id = activity_worksheet_cells.worksheet_id) AND public.is_engagement_team_member(aw.engagement_id)))));


--
-- Name: activity_worksheets Team can view worksheets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view worksheets" ON public.activity_worksheets FOR SELECT TO authenticated USING (public.is_engagement_team_member(engagement_id));


--
-- Name: staff Users can update their linked staff record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their linked staff record" ON public.staff FOR UPDATE USING ((auth_user_id = auth.uid())) WITH CHECK ((auth_user_id = auth.uid()));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: activity_codes activity_codes write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "activity_codes write delete" ON public.activity_codes FOR DELETE TO authenticated USING (public.has_permission('activity_code.delete'::text));


--
-- Name: activity_codes activity_codes write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "activity_codes write insert" ON public.activity_codes FOR INSERT TO authenticated WITH CHECK (public.has_permission('activity_code.create'::text));


--
-- Name: activity_codes activity_codes write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "activity_codes write update" ON public.activity_codes FOR UPDATE TO authenticated USING (public.has_permission('activity_code.update'::text)) WITH CHECK (public.has_permission('activity_code.update'::text));


--
-- Name: activity_worksheets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_worksheets ENABLE ROW LEVEL SECURITY;

--
-- Name: global_settings anon reads login settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anon reads login settings" ON public.global_settings FOR SELECT TO anon USING (((setting_key)::text = ANY ((ARRAY['LANGUAGE'::character varying, 'COMPACT_FONT'::character varying, 'ALLOWED_EMAIL_DOMAIN'::character varying])::text[])));


--
-- Name: auth_email_throttle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_email_throttle ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_login_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: authorization_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.authorization_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: authorization_role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.authorization_role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: authorization_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.authorization_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: authorization_permissions authz_perms_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authz_perms_select ON public.authorization_permissions FOR SELECT TO authenticated USING (true);


--
-- Name: authorization_roles authz_roles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authz_roles_select ON public.authorization_roles FOR SELECT TO authenticated USING (true);


--
-- Name: authorization_role_permissions authz_rp_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authz_rp_select_admin ON public.authorization_role_permissions FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: wo_budget_lines budget_lines assigned read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "budget_lines assigned read" ON public.wo_budget_lines FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = 'assigned_engagements'::text) AND (EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_budget_lines.wo_id) AND public.is_assigned_to_engagement(wo.engagement_id))))));


--
-- Name: wo_budget_lines budget_lines firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "budget_lines firm read" ON public.wo_budget_lines FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
-- Name: categories categories write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categories write delete" ON public.categories FOR DELETE TO authenticated USING (public.has_permission('category_rate.delete'::text));


--
-- Name: categories categories write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categories write insert" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.has_permission('category_rate.create'::text));


--
-- Name: categories categories write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categories write update" ON public.categories FOR UPDATE TO authenticated USING (public.has_permission('category_rate.update'::text)) WITH CHECK (public.has_permission('category_rate.update'::text));


--
-- Name: clients clients creator read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients creator read" ON public.clients FOR SELECT TO authenticated USING ((public.has_permission('client.read'::text) AND (created_by_staff_id IS NOT NULL) AND (created_by_staff_id = public.get_my_staff_id())));


--
-- Name: clients clients read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients read" ON public.clients FOR SELECT TO authenticated USING ((public.has_permission('client.read'::text) AND ((public.permission_scope('client.read'::text) <> 'assigned_clients'::text) OR public.is_assigned_to_client(client_id))));


--
-- Name: clients clients write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients write delete" ON public.clients FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: clients clients write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients write insert" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.has_permission('client.create'::text));


--
-- Name: clients clients write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients write update" ON public.clients FOR UPDATE TO authenticated USING (public.has_permission('client.update'::text)) WITH CHECK (public.has_permission('client.update'::text));


--
-- Name: engagement_assignments ea_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_admin_manage ON public.engagement_assignments TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: engagement_assignments ea_select_assigned; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_select_assigned ON public.engagement_assignments FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'senior'::public.app_role) AND public.has_assignment_on_engagement(engagement_id)));


--
-- Name: engagement_assignments ea_select_firmwide; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_select_firmwide ON public.engagement_assignments FOR SELECT TO authenticated USING (public.has_firmwide_assignment_visibility());


--
-- Name: engagement_assignments ea_select_lead; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_select_lead ON public.engagement_assignments FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'manager'::public.app_role) AND public.is_engagement_team_member(engagement_id)));


--
-- Name: engagement_assignments ea_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_select_own ON public.engagement_assignments FOR SELECT TO authenticated USING ((staff_id = public.get_my_staff_id()));


--
-- Name: engagement_assignments ea_select_responsible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_select_responsible ON public.engagement_assignments FOR SELECT TO authenticated USING (public.is_engagement_responsible(engagement_id));


--
-- Name: engagement_assignments ea_team_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_team_delete ON public.engagement_assignments FOR DELETE TO authenticated USING (((public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id)) AND (public.can_read_engagement_assignments(engagement_id) OR public.is_engagement_responsible(engagement_id))));


--
-- Name: engagement_assignments ea_team_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_team_insert ON public.engagement_assignments FOR INSERT TO authenticated WITH CHECK (((public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id)) AND (public.can_read_engagement_assignments(engagement_id) OR public.is_engagement_responsible(engagement_id))));


--
-- Name: engagement_assignments ea_team_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_team_update ON public.engagement_assignments FOR UPDATE TO authenticated USING (((public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id)) AND (public.can_read_engagement_assignments(engagement_id) OR public.is_engagement_responsible(engagement_id)))) WITH CHECK (((public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id)) AND (public.can_read_engagement_assignments(engagement_id) OR public.is_engagement_responsible(engagement_id))));


--
-- Name: engagement_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engagement_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: engagements engagements creator read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements creator read" ON public.engagements FOR SELECT TO authenticated USING ((public.has_permission('engagement.read'::text) AND (created_by_staff_id IS NOT NULL) AND (created_by_staff_id = public.get_my_staff_id())));


--
-- Name: engagements engagements creator update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements creator update" ON public.engagements FOR UPDATE TO authenticated USING ((public.has_permission('engagement.update'::text) AND (created_by_staff_id IS NOT NULL) AND (created_by_staff_id = public.get_my_staff_id()))) WITH CHECK ((public.has_permission('engagement.update'::text) AND (created_by_staff_id IS NOT NULL) AND (created_by_staff_id = public.get_my_staff_id())));


--
-- Name: engagements engagements read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements read" ON public.engagements FOR SELECT TO authenticated USING ((public.has_permission('engagement.read'::text) AND ((public.permission_scope('engagement.read'::text) <> 'assigned_engagements'::text) OR public.is_assigned_to_engagement(engagement_id))));


--
-- Name: engagements engagements write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements write delete" ON public.engagements FOR DELETE TO authenticated USING (public.has_permission('engagement.delete'::text));


--
-- Name: engagements engagements write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements write insert" ON public.engagements FOR INSERT TO authenticated WITH CHECK (public.has_permission('engagement.create'::text));


--
-- Name: engagements engagements write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements write update" ON public.engagements FOR UPDATE TO authenticated USING ((public.has_permission('engagement.update'::text) AND ((public.permission_scope('engagement.update'::text) = 'firm'::text) OR public.is_engagement_team_member(engagement_id)))) WITH CHECK ((public.has_permission('engagement.update'::text) AND ((public.permission_scope('engagement.update'::text) = 'firm'::text) OR public.is_engagement_team_member(engagement_id))));


--
-- Name: exchange_rate_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rate_history ENABLE ROW LEVEL SECURITY;

--
-- Name: wo_expense_budget expense_budget assigned read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expense_budget assigned read" ON public.wo_expense_budget FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = 'assigned_engagements'::text) AND (EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_expense_budget.wo_id) AND public.is_assigned_to_engagement(wo.engagement_id))))));


--
-- Name: wo_expense_budget expense_budget firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expense_budget firm read" ON public.wo_expense_budget FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
-- Name: expense_types expense_types write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expense_types write delete" ON public.expense_types FOR DELETE TO authenticated USING (public.has_permission('expense_type.delete'::text));


--
-- Name: expense_types expense_types write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expense_types write insert" ON public.expense_types FOR INSERT TO authenticated WITH CHECK (public.has_permission('expense_type.create'::text));


--
-- Name: expense_types expense_types write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expense_types write update" ON public.expense_types FOR UPDATE TO authenticated USING (public.has_permission('expense_type.update'::text)) WITH CHECK (public.has_permission('expense_type.update'::text));


--
-- Name: fund_requests fr_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_delete_admin ON public.fund_requests FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: fund_requests fr_delete_requester_draft; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_delete_requester_draft ON public.fund_requests FOR DELETE TO authenticated USING (((requester_staff_id = public.get_my_staff_id()) AND (status = 'borrador'::public.fund_request_status)));


--
-- Name: fund_requests fr_insert_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_insert_requester ON public.fund_requests FOR INSERT TO authenticated WITH CHECK (((requester_staff_id = public.get_my_staff_id()) AND (status = 'borrador'::public.fund_request_status) AND (EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.staff_id = public.get_my_staff_id()) AND (staff.is_active = true))))));


--
-- Name: fund_requests fr_select_accounting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_select_accounting ON public.fund_requests FOR SELECT TO authenticated USING (((public.has_permission('fund_disbursement.read'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status]))) OR (public.has_permission('expense_settlement.read'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status])))));


--
-- Name: fund_requests fr_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_select_admin ON public.fund_requests FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: fund_requests fr_select_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_select_manager ON public.fund_requests FOR SELECT TO authenticated USING (((status <> 'borrador'::public.fund_request_status) AND public.fr_is_ot_manager(fund_request_id)));


--
-- Name: fund_requests fr_select_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_select_requester ON public.fund_requests FOR SELECT TO authenticated USING ((requester_staff_id = public.get_my_staff_id()));


--
-- Name: fund_requests fr_update_accounting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_update_accounting ON public.fund_requests FOR UPDATE TO authenticated USING (((public.has_permission('fund_disbursement.update'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status]))) OR (public.has_permission('expense_settlement.update'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status]))))) WITH CHECK (((public.has_permission('fund_disbursement.update'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status]))) OR (public.has_permission('expense_settlement.update'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status])))));


--
-- Name: fund_requests fr_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_update_admin ON public.fund_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: fund_requests fr_update_requester_draft; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_update_requester_draft ON public.fund_requests FOR UPDATE TO authenticated USING (((requester_staff_id = public.get_my_staff_id()) AND (status = ANY (ARRAY['borrador'::public.fund_request_status, 'observado'::public.fund_request_status, 'rechazado'::public.fund_request_status])))) WITH CHECK (((requester_staff_id = public.get_my_staff_id()) AND (status = ANY (ARRAY['borrador'::public.fund_request_status, 'observado'::public.fund_request_status, 'rechazado'::public.fund_request_status]))));


--
-- Name: fund_request_work_orders fr_wo_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_admin ON public.fund_request_work_orders TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: fund_request_work_orders fr_wo_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_delete ON public.fund_request_work_orders FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = ANY (ARRAY['borrador'::public.fund_request_status, 'observado'::public.fund_request_status, 'rechazado'::public.fund_request_status])) AND ((fr.requester_staff_id = public.get_my_staff_id()) OR public.is_admin())))));


--
-- Name: fund_request_work_orders fr_wo_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_insert ON public.fund_request_work_orders FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = ANY (ARRAY['borrador'::public.fund_request_status, 'observado'::public.fund_request_status, 'rechazado'::public.fund_request_status])) AND ((fr.requester_staff_id = public.get_my_staff_id()) OR public.is_admin())))));


--
-- Name: fund_request_work_orders fr_wo_manager_decide; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_manager_decide ON public.fund_request_work_orders FOR UPDATE TO authenticated USING (((manager_staff_id = public.get_my_staff_id()) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = 'pendiente_aprobacion'::public.fund_request_status)))))) WITH CHECK ((manager_staff_id = public.get_my_staff_id()));


--
-- Name: fund_request_work_orders fr_wo_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_select ON public.fund_request_work_orders FOR SELECT TO authenticated USING ((((manager_staff_id = public.get_my_staff_id()) AND public.fr_is_submitted(fund_request_id)) OR public.fr_is_requester(fund_request_id) OR public.is_admin()));


--
-- Name: fund_request_work_orders fr_wo_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_update ON public.fund_request_work_orders FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = ANY (ARRAY['borrador'::public.fund_request_status, 'observado'::public.fund_request_status, 'rechazado'::public.fund_request_status])) AND ((fr.requester_staff_id = public.get_my_staff_id()) OR public.is_admin())))));


--
-- Name: fund_request_expenses fre_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_delete_admin ON public.fund_request_expenses FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: fund_request_expenses fre_delete_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_delete_requester ON public.fund_request_expenses FOR DELETE TO authenticated USING (((status = 'borrador'::public.fund_request_expense_status) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.requester_staff_id = public.get_my_staff_id()))))));


--
-- Name: fund_request_expenses fre_insert_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_insert_requester ON public.fund_request_expenses FOR INSERT TO authenticated WITH CHECK (((status = 'borrador'::public.fund_request_expense_status) AND (returned_by_assistant = false) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.requester_staff_id = public.get_my_staff_id()) AND (fr.status = 'fondos_entregados'::public.fund_request_status))))));


--
-- Name: fund_request_expenses fre_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_select ON public.fund_request_expenses FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND ((fr.requester_staff_id = public.get_my_staff_id()) OR public.is_admin())))) OR ((status <> 'borrador'::public.fund_request_expense_status) AND (EXISTS ( SELECT 1
   FROM public.fund_request_work_orders frwo
  WHERE ((frwo.fund_request_id = fund_request_expenses.fund_request_id) AND (frwo.wo_id = fund_request_expenses.wo_id) AND (frwo.manager_staff_id = public.get_my_staff_id())))))));


--
-- Name: fund_request_expenses fre_select_accounting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_select_accounting ON public.fund_request_expenses FOR SELECT TO authenticated USING ((public.has_permission('expense_settlement.read'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.status = ANY (ARRAY['fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status])))))));


--
-- Name: fund_request_expenses fre_update_accounting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_update_accounting ON public.fund_request_expenses FOR UPDATE TO authenticated USING (((public.has_permission('fund_disbursement.update'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status])))))) OR (public.has_permission('expense_settlement.update'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status])))))))) WITH CHECK (((public.has_permission('fund_disbursement.update'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status])))))) OR (public.has_permission('expense_settlement.update'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status]))))))));


--
-- Name: fund_request_expenses fre_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_update_admin ON public.fund_request_expenses FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: fund_request_expenses fre_update_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_update_manager ON public.fund_request_expenses FOR UPDATE TO authenticated USING (((status = 'pendiente_aprobacion'::public.fund_request_expense_status) AND (EXISTS ( SELECT 1
   FROM (public.fund_request_work_orders frwo
     JOIN public.fund_requests fr ON ((fr.fund_request_id = frwo.fund_request_id)))
  WHERE ((frwo.fund_request_id = fund_request_expenses.fund_request_id) AND (frwo.wo_id = fund_request_expenses.wo_id) AND (frwo.manager_staff_id = public.get_my_staff_id()) AND (fr.status = 'fondos_entregados'::public.fund_request_status)))))) WITH CHECK (((status = ANY (ARRAY['aprobado_gerente'::public.fund_request_expense_status, 'observado'::public.fund_request_expense_status, 'rechazado'::public.fund_request_expense_status])) AND (EXISTS ( SELECT 1
   FROM (public.fund_request_work_orders frwo
     JOIN public.fund_requests fr ON ((fr.fund_request_id = frwo.fund_request_id)))
  WHERE ((frwo.fund_request_id = fund_request_expenses.fund_request_id) AND (frwo.wo_id = fund_request_expenses.wo_id) AND (frwo.manager_staff_id = public.get_my_staff_id()) AND (fr.status = 'fondos_entregados'::public.fund_request_status))))));


--
-- Name: fund_request_expenses fre_update_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_update_requester ON public.fund_request_expenses FOR UPDATE TO authenticated USING (((status = ANY (ARRAY['borrador'::public.fund_request_expense_status, 'observado'::public.fund_request_expense_status, 'rechazado'::public.fund_request_expense_status])) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.requester_staff_id = public.get_my_staff_id()) AND (fr.status = 'fondos_entregados'::public.fund_request_status)))))) WITH CHECK (((status = ANY (ARRAY['borrador'::public.fund_request_expense_status, 'observado'::public.fund_request_expense_status, 'rechazado'::public.fund_request_expense_status, 'pendiente_aprobacion'::public.fund_request_expense_status, 'aprobado_gerente'::public.fund_request_expense_status])) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.requester_staff_id = public.get_my_staff_id()) AND (fr.status = 'fondos_entregados'::public.fund_request_status))))));


--
-- Name: fund_request_work_orders frwo_select_accounting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY frwo_select_accounting ON public.fund_request_work_orders FOR SELECT TO authenticated USING (((public.has_permission('fund_disbursement.read'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status])))))) OR (public.has_permission('expense_settlement.read'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status]))))))));


--
-- Name: fund_request_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fund_request_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: fund_request_work_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fund_request_work_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: fund_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fund_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: global_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: global_settings global_settings write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "global_settings write" ON public.global_settings TO authenticated USING (public.has_permission('global_settings.update'::text)) WITH CHECK (public.has_permission('global_settings.update'::text));


--
-- Name: holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

--
-- Name: holidays holidays write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "holidays write delete" ON public.holidays FOR DELETE TO authenticated USING (public.has_permission('holiday.delete'::text));


--
-- Name: holidays holidays write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "holidays write insert" ON public.holidays FOR INSERT TO authenticated WITH CHECK (public.has_permission('holiday.create'::text));


--
-- Name: holidays holidays write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "holidays write update" ON public.holidays FOR UPDATE TO authenticated USING (public.has_permission('holiday.update'::text)) WITH CHECK (public.has_permission('holiday.update'::text));


--
-- Name: industries industries write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "industries write delete" ON public.industries FOR DELETE TO authenticated USING (public.has_permission('industry.delete'::text));


--
-- Name: industries industries write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "industries write insert" ON public.industries FOR INSERT TO authenticated WITH CHECK (public.has_permission('industry.create'::text));


--
-- Name: industries industries write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "industries write update" ON public.industries FOR UPDATE TO authenticated USING (public.has_permission('industry.update'::text)) WITH CHECK (public.has_permission('industry.update'::text));


--
-- Name: notification_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_role_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_role_types ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_role_types notification_role_types_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_role_types_read ON public.notification_role_types FOR SELECT TO authenticated USING (true);


--
-- Name: notification_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_types ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_types notification_types_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_types_read ON public.notification_types FOR SELECT TO authenticated USING (true);


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING (((recipient_staff_id = public.get_my_staff_id()) AND (dismissed_at IS NULL)));


--
-- Name: parametro; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parametro ENABLE ROW LEVEL SECURITY;

--
-- Name: wo_payment_installments payment_installments firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payment_installments firm read" ON public.wo_payment_installments FOR SELECT TO authenticated USING ((public.has_permission('work_order.payment_plan.approve'::text) AND (public.permission_scope('work_order.payment_plan.approve'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
-- Name: wo_payment_plan payment_plan firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payment_plan firm read" ON public.wo_payment_plan FOR SELECT TO authenticated USING ((public.has_permission('work_order.payment_plan.approve'::text) AND (public.permission_scope('work_order.payment_plan.approve'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
-- Name: portfolio_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.portfolio_events ENABLE ROW LEVEL SECURITY;

--
-- Name: practicas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practicas ENABLE ROW LEVEL SECURITY;

--
-- Name: servicios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

--
-- Name: skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

--
-- Name: skills skills read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "skills read" ON public.skills FOR SELECT TO authenticated USING (public.has_permission('competency.read'::text));


--
-- Name: skills skills write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "skills write delete" ON public.skills FOR DELETE TO authenticated USING (public.has_permission('competency.delete'::text));


--
-- Name: skills skills write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "skills write insert" ON public.skills FOR INSERT TO authenticated WITH CHECK (public.has_permission('competency.create'::text));


--
-- Name: skills skills write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "skills write update" ON public.skills FOR UPDATE TO authenticated USING (public.has_permission('competency.update'::text)) WITH CHECK (public.has_permission('competency.update'::text));


--
-- Name: society; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.society ENABLE ROW LEVEL SECURITY;

--
-- Name: staff staff read personnel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read personnel" ON public.staff FOR SELECT TO authenticated USING (public.has_permission('staff.read'::text));


--
-- Name: staff staff write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff write delete" ON public.staff FOR DELETE TO authenticated USING (public.has_permission('staff.delete'::text));


--
-- Name: staff staff write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff write insert" ON public.staff FOR INSERT TO authenticated WITH CHECK (public.has_permission('staff.create'::text));


--
-- Name: staff staff write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff write update" ON public.staff FOR UPDATE TO authenticated USING (public.has_permission('staff.update'::text)) WITH CHECK (public.has_permission('staff.update'::text));


--
-- Name: staff_alert_seen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_alert_seen ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_alert_seen staff_alert_seen_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_alert_seen_insert ON public.staff_alert_seen FOR INSERT WITH CHECK ((staff_id IN ( SELECT staff.staff_id
   FROM public.staff
  WHERE (staff.auth_user_id = auth.uid()))));


--
-- Name: staff_alert_seen staff_alert_seen_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_alert_seen_select ON public.staff_alert_seen FOR SELECT USING ((staff_id IN ( SELECT staff.staff_id
   FROM public.staff
  WHERE (staff.auth_user_id = auth.uid()))));


--
-- Name: staff_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_skills staff_skills write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff_skills write" ON public.staff_skills TO authenticated USING (public.has_permission('staff.update'::text)) WITH CHECK (public.has_permission('staff.update'::text));


--
-- Name: time_entries time_entries delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "time_entries delete" ON public.time_entries FOR DELETE TO authenticated USING ((public.is_admin() OR (public.has_permission('time_entry.delete'::text) AND (staff_id = public.get_my_staff_id()))));


--
-- Name: time_entries time_entries insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "time_entries insert" ON public.time_entries FOR INSERT TO authenticated WITH CHECK ((public.has_permission('time_entry.create'::text) AND (staff_id = public.get_my_staff_id())));


--
-- Name: time_entries time_entries read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "time_entries read" ON public.time_entries FOR SELECT TO authenticated USING ((public.is_admin() OR public.is_engagement_team_member(engagement_id) OR (public.has_permission('time_entry.read'::text) AND (staff_id = public.get_my_staff_id()))));


--
-- Name: time_entries time_entries update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "time_entries update" ON public.time_entries FOR UPDATE TO authenticated USING ((public.is_admin() OR (public.has_permission('time_entry.update'::text) AND (staff_id = public.get_my_staff_id())))) WITH CHECK ((public.is_admin() OR (public.has_permission('time_entry.update'::text) AND (staff_id = public.get_my_staff_id()))));


--
-- Name: timer_entries timer_entries delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "timer_entries delete" ON public.timer_entries FOR DELETE TO authenticated USING ((public.has_permission('timer.use'::text) AND (staff_id = public.get_my_staff_id())));


--
-- Name: timer_entries timer_entries insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "timer_entries insert" ON public.timer_entries FOR INSERT TO authenticated WITH CHECK ((public.has_permission('timer.use'::text) AND (staff_id = public.get_my_staff_id())));


--
-- Name: timer_entries timer_entries read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "timer_entries read" ON public.timer_entries FOR SELECT TO authenticated USING ((public.has_permission('timer.use'::text) AND (staff_id = public.get_my_staff_id())));


--
-- Name: timer_entries timer_entries update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "timer_entries update" ON public.timer_entries FOR UPDATE TO authenticated USING ((public.has_permission('timer.use'::text) AND (staff_id = public.get_my_staff_id()))) WITH CHECK ((public.has_permission('timer.use'::text) AND (staff_id = public.get_my_staff_id())));


--
-- Name: timesheet_reversal_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timesheet_reversal_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: timesheet_reversal_requests trr_select_visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trr_select_visible ON public.timesheet_reversal_requests FOR SELECT TO authenticated USING ((public.is_admin() OR (requested_by = public.get_my_staff_id()) OR (EXISTS ( SELECT 1
   FROM public.timesheet_periods tp
  WHERE ((tp.period_id = timesheet_reversal_requests.period_id) AND (tp.staff_id = public.get_my_staff_id())))) OR ((scope = 'engagement'::text) AND public.can_approve_timesheet_line(auth.uid(), period_id, engagement_id))));


--
-- Name: user_lifecycle_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_lifecycle_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: work_orders wo_create_by_permission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_create_by_permission ON public.work_orders FOR INSERT TO authenticated WITH CHECK ((public.has_permission('work_order.create'::text) AND ((public.permission_scope('work_order.create'::text) IS DISTINCT FROM 'assigned_engagements'::text) OR public.is_assigned_to_engagement(engagement_id))));


--
-- Name: wo_payment_installments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_payment_installments ENABLE ROW LEVEL SECURITY;

--
-- Name: wo_payment_plan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_payment_plan ENABLE ROW LEVEL SECURITY;

--
-- Name: wo_staffing_requirements wo_staffing_req_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_delete ON public.wo_staffing_requirements FOR DELETE TO authenticated USING ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_engagement_id(wo_id)) OR public.is_engagement_responsible(public.resolve_wo_engagement_id(wo_id))));


--
-- Name: wo_staffing_requirements wo_staffing_req_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_insert ON public.wo_staffing_requirements FOR INSERT TO authenticated WITH CHECK ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_engagement_id(wo_id)) OR public.is_engagement_responsible(public.resolve_wo_engagement_id(wo_id))));


--
-- Name: wo_staffing_requirements wo_staffing_req_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_select ON public.wo_staffing_requirements FOR SELECT TO authenticated USING ((public.is_admin() OR public.has_firmwide_assignment_visibility() OR public.is_engagement_team_member(public.resolve_wo_engagement_id(wo_id)) OR public.is_engagement_responsible(public.resolve_wo_engagement_id(wo_id)) OR public.has_assignment_on_engagement(public.resolve_wo_engagement_id(wo_id))));


--
-- Name: wo_staffing_requirement_skills wo_staffing_req_skills_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_skills_delete ON public.wo_staffing_requirement_skills FOR DELETE TO authenticated USING ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.is_engagement_responsible(public.resolve_wo_req_skill_engagement_id(requirement_id))));


--
-- Name: wo_staffing_requirement_skills wo_staffing_req_skills_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_skills_insert ON public.wo_staffing_requirement_skills FOR INSERT TO authenticated WITH CHECK ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.is_engagement_responsible(public.resolve_wo_req_skill_engagement_id(requirement_id))));


--
-- Name: wo_staffing_requirement_skills wo_staffing_req_skills_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_skills_select ON public.wo_staffing_requirement_skills FOR SELECT TO authenticated USING ((public.is_admin() OR public.has_firmwide_assignment_visibility() OR public.is_engagement_team_member(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.is_engagement_responsible(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.has_assignment_on_engagement(public.resolve_wo_req_skill_engagement_id(requirement_id))));


--
-- Name: wo_staffing_requirement_skills wo_staffing_req_skills_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_skills_update ON public.wo_staffing_requirement_skills FOR UPDATE TO authenticated USING ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.is_engagement_responsible(public.resolve_wo_req_skill_engagement_id(requirement_id)))) WITH CHECK ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.is_engagement_responsible(public.resolve_wo_req_skill_engagement_id(requirement_id))));


--
-- Name: wo_staffing_requirements wo_staffing_req_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_update ON public.wo_staffing_requirements FOR UPDATE TO authenticated USING ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_engagement_id(wo_id)) OR public.is_engagement_responsible(public.resolve_wo_engagement_id(wo_id)))) WITH CHECK ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_engagement_id(wo_id)) OR public.is_engagement_responsible(public.resolve_wo_engagement_id(wo_id))));


--
-- Name: wo_staffing_requirement_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_staffing_requirement_skills ENABLE ROW LEVEL SECURITY;

--
-- Name: wo_staffing_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_staffing_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: work_orders wo_team_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_team_update ON public.work_orders FOR UPDATE TO authenticated USING (public.is_engagement_team_member(engagement_id)) WITH CHECK (public.is_engagement_team_member(engagement_id));


--
-- Name: work_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: work_orders work_orders assigned read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "work_orders assigned read" ON public.work_orders FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = 'assigned_engagements'::text) AND public.is_assigned_to_engagement(engagement_id)));


--
-- Name: work_orders work_orders firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "work_orders firm read" ON public.work_orders FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
-- Name: activity_worksheet_cells worksheet cells assigned read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worksheet cells assigned read" ON public.activity_worksheet_cells FOR SELECT TO authenticated USING ((public.has_permission('worksheet.read'::text) AND (public.permission_scope('worksheet.read'::text) = 'assigned_engagements'::text) AND (EXISTS ( SELECT 1
   FROM public.activity_worksheets w
  WHERE ((w.id = activity_worksheet_cells.worksheet_id) AND public.is_assigned_to_engagement(w.engagement_id))))));


--
-- Name: activity_worksheet_cells worksheet cells firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worksheet cells firm read" ON public.activity_worksheet_cells FOR SELECT TO authenticated USING ((public.has_permission('worksheet.read'::text) AND (public.permission_scope('worksheet.read'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
-- Name: activity_worksheets worksheet_create_by_permission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worksheet_create_by_permission ON public.activity_worksheets FOR INSERT TO authenticated WITH CHECK ((public.has_permission('worksheet.create'::text) AND ((public.permission_scope('worksheet.create'::text) IS DISTINCT FROM 'assigned_engagements'::text) OR public.is_assigned_to_engagement(engagement_id))));


--
-- Name: activity_worksheets worksheet_team_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worksheet_team_update ON public.activity_worksheets FOR UPDATE TO authenticated USING (public.is_engagement_team_member(engagement_id)) WITH CHECK (public.is_engagement_team_member(engagement_id));


--
-- Name: activity_worksheets worksheets assigned read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worksheets assigned read" ON public.activity_worksheets FOR SELECT TO authenticated USING ((public.has_permission('worksheet.read'::text) AND (public.permission_scope('worksheet.read'::text) = 'assigned_engagements'::text) AND public.is_assigned_to_engagement(engagement_id)));


--
-- Name: activity_worksheets worksheets firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worksheets firm read" ON public.activity_worksheets FOR SELECT TO authenticated USING ((public.has_permission('worksheet.read'::text) AND (public.permission_scope('worksheet.read'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: objects Authenticated users can delete expense receipts; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can delete expense receipts" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = 'expense-receipts'::text));


--
-- Name: objects Authenticated users can update their expense receipts; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can update their expense receipts" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = 'expense-receipts'::text));


--
-- Name: objects Authenticated users can upload engagement contracts; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can upload engagement contracts" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'engagement-contracts'::text));


--
-- Name: objects Authenticated users can upload expense receipts; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Authenticated users can upload expense receipts" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'expense-receipts'::text));


--
-- Name: objects Engagement team can view their contract; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Engagement team can view their contract" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'engagement-contracts'::text) AND (EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE ((e.contract_file_path = objects.name) AND (public.is_engagement_team_member(e.engagement_id) OR public.is_admin()))))));


--
-- Name: objects Expense receipts: admin or uploader; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Expense receipts: admin or uploader" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'expense-receipts'::text) AND (public.is_admin() OR (owner = auth.uid()))));


--
-- Name: objects Uploader can remove unlinked engagement contract; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Uploader can remove unlinked engagement contract" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'engagement-contracts'::text) AND ((owner = auth.uid()) OR (owner_id = (auth.uid())::text)) AND (NOT (EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE (e.contract_file_path = objects.name))))));


--
-- Name: objects Uploader can view their unlinked engagement contract; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Uploader can view their unlinked engagement contract" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'engagement-contracts'::text) AND ((owner = auth.uid()) OR (owner_id = (auth.uid())::text)) AND (NOT (EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE (e.contract_file_path = objects.name))))));


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: iceberg_namespaces; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.iceberg_namespaces ENABLE ROW LEVEL SECURITY;

--
-- Name: iceberg_tables; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.iceberg_tables ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime notifications; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.notifications;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict w4uXMruUdDQEs1GJbZ5gXP58DIdGNteN2CzBStn7HNDAeX0nXoTgJsg8GBM9OLb

