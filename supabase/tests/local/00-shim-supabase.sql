-- Local/CI harness shim: minimal Supabase-alike so the D5 RLS migration
-- and its leakage suite run on a scratch PostgreSQL 16 (see
-- run-rls-tests.sh). Mirrors only what the Phase 3 + D5 migrations and
-- supabase/tests/rls-engagement-assignments-d5.sql touch. NEVER run
-- against a real database — it recreates auth/roles/tables from scratch.

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid
$$;

-- Supabase API roles. Roles are cluster-global, not per-database, and
-- the runner's cleanup only drops the database — so guard creation to
-- keep the shim re-runnable on a persistent local scratch cluster.
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

CREATE TYPE public.app_role AS ENUM (
  'admin','staff','viewer','partner','director','manager',
  'senior','semisenior','sqr','specialist_it','specialist_tax'
);

CREATE TABLE public.categories (
  category_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_name VARCHAR NOT NULL,
  display_order INTEGER DEFAULT 0
);

CREATE TABLE public.clients (
  client_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_legal_name VARCHAR NOT NULL,
  unique_tax_id VARCHAR NOT NULL
);

CREATE TABLE public.staff (
  staff_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID,
  first_name VARCHAR NOT NULL,
  last_name VARCHAR NOT NULL,
  category_id UUID REFERENCES public.categories(category_id),
  weekly_capacity_hours NUMERIC NOT NULL DEFAULT 40,
  -- is_active: real column since before the scheduler shim existed (guarded by the
  -- reactivation trigger in 20260520000000). is_schedulable: added for real by
  -- 20260727110000_scheduler_fase2_convergencia_esquema.sql. Both were missing from this
  -- shim, and save_engagement_assignments()'s own staff-eligibility check (Fase 5 O7) reads
  -- both — 🟢 bug found live 2026-08-06 running the CI harness for dev-scheduler-fase_7.
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_schedulable BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  UNIQUE (user_id)
);

CREATE TABLE public.engagements (
  engagement_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(client_id),
  engagement_name VARCHAR NOT NULL,
  engagement_code VARCHAR,
  partner_id UUID REFERENCES public.staff(staff_id),
  manager_id UUID REFERENCES public.staff(staff_id),
  start_date DATE,
  end_date DATE,
  status VARCHAR DEFAULT 'active'
);

-- Helper functions exactly as documented in docs/database-schema.sql
CREATE OR REPLACE FUNCTION public.get_my_staff_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT staff_id FROM staff WHERE auth_user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_engagement_team_member(p_engagement_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM engagements e
    WHERE e.engagement_id = p_engagement_id
    AND (e.manager_id = get_my_staff_id() OR e.partner_id = get_my_staff_id())
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- PostgREST-style grants, deliberately as permissive as Supabase's
-- defaults (anon included) so the D5 migration's REVOKEs are exercised
-- for real: RLS/revocation must do the confining, not missing grants.
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;

-- Model Supabase's function-privilege default (PR #222 follow-up P2):
-- existing projects auto-grant EXECUTE on NEW functions directly to
-- anon / authenticated / service_role. Set the default here so the D5
-- helper functions created by the migration that runs AFTER this shim
-- receive those direct grants — the migration's REVOKE ... FROM anon /
-- service_role must then actually remove them, and the leakage suite's
-- has_function_privilege assertions verify the final ACL. Without this,
-- CI could not detect a migration that only revoked PUBLIC.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
