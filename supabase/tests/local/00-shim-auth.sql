-- Local/CI harness shim: minimal Supabase-alike so the CONSOLIDATED migration set
-- (cero_01..cero_06) can apply on a scratch PostgreSQL that has no GoTrue/Storage —
-- just enough for auth.uid() and the 3 PostgREST roles. Everything else (every table,
-- function, policy and grant the assertion suites touch) comes straight from the
-- consolidated migrations themselves; this shim no longer fakes any business table
-- (that was necessary only when the harness applied a handful of historical migrations
-- in isolation — see git history for the old 00-shim-supabase.sql).
--
-- cero_07_auth_storage.sql is deliberately NOT applied in this lane: it adds triggers on
-- auth.users and policies on storage.objects/storage.buckets, none of which this bare
-- Postgres has. None of the assertion suites need it — they already guard their
-- auth.users inserts with `IF to_regclass('auth.users') IS NOT NULL` for exactly this
-- reason. NEVER run this shim against a real database — it creates schema auth from
-- scratch.

CREATE SCHEMA auth;

-- Minimal auth.users: solo lo que satisface las 2 FK reales (staff.auth_user_id,
-- user_roles.user_id, en cero_04) y las columnas que las suites de aserciones insertan
-- bajo `IF to_regclass('auth.users') IS NOT NULL` (mismas 11 columnas en las 6 suites que
-- lo usan). No es una réplica de GoTrue — cero_07 (triggers reales sobre auth.users) no se
-- aplica en este lane.
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  instance_id uuid,
  aud varchar,
  role varchar,
  email varchar,
  encrypted_password varchar,
  email_confirmed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb
);

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid
$$;

CREATE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb
$$;

-- Supabase API roles. Roles are cluster-global, not per-database, and the runner's
-- cleanup only drops the database — so guard creation to keep the shim re-runnable on
-- a persistent local scratch cluster.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;
