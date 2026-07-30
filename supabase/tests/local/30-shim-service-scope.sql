-- Local/CI harness shim: service-scoping surface (services, categories.service_id,
-- engagements.practica + responsible-personnel columns, work_orders, skills,
-- staff_skills) so C1-C4 (Fase 2 del Scheduler, 20260727100000-130000) and the 4
-- historical scheduler migrations that create/RLS wo_staffing_requirements /
-- wo_staffing_requirement_skills can run on the disposable scratch PostgreSQL,
-- alongside 00-shim-supabase.sql. Mirrors only what those migrations and
-- supabase/tests/rls-wo-staffing-requirements.sql /
-- supabase/tests/rpc-save-wo-staffing.sql /
-- supabase/tests/rpc-save-engagement-assignments.sql /
-- supabase/tests/schema-convergence-assertions.sql touch — NOT a full replay of
-- development's 59 migrations (G9 of bugs/scheduler/fase_2/plan_v2.md: that full
-- replay is what Rutas A/B/C already verify against real Docker Supabase; this
-- shim exists so the SAME assertions also run fast, in CI, without Docker).
-- NEVER run against a real database.

-- =====================================================================
-- 1. services + categories.service_id (0702-152 / 0625-149, condensed to
--    final shape — the shim does not replay the historical ALTER/backfill
--    sequence, same convention as 00-shim-supabase.sql for categories itself).
-- =====================================================================
CREATE TABLE public.services (
  service_id              uuid    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                    text    NOT NULL,
  code                    smallint NOT NULL UNIQUE CHECK (code BETWEEN 0 AND 9),
  allows_rates_activities boolean NOT NULL DEFAULT false,
  is_active               boolean NOT NULL DEFAULT true
);

INSERT INTO public.services (name, code, allows_rates_activities) VALUES
  ('Firmwide',          0, false),
  ('Auditoría',         1, true),
  ('Consultoría',       2, true),
  ('Tax',               3, true),
  ('Growth & Strategy', 4, true);

ALTER TABLE public.categories
  ADD COLUMN service_id uuid REFERENCES public.services (service_id);

-- =====================================================================
-- 2. engagements: practica (service link) + engagement_state_override
--    (estado_encargo_0602-135) + the 4 responsible-personnel columns
--    (0602-137, add_engagement_responsible_personnel).
-- =====================================================================
ALTER TABLE public.engagements
  ADD COLUMN practica                  smallint,
  ADD COLUMN engagement_state_override smallint
    CHECK (engagement_state_override IS NULL OR engagement_state_override BETWEEN 1 AND 9),
  ADD COLUMN sqr_id                    uuid REFERENCES public.staff (staff_id),
  ADD COLUMN encargado_id              uuid REFERENCES public.staff (staff_id),
  ADD COLUMN specialist_it_id          uuid REFERENCES public.staff (staff_id),
  ADD COLUMN specialist_tax_id         uuid REFERENCES public.staff (staff_id);

-- =====================================================================
-- 3. work_orders (base schema, 20251204045534) + approval_status
--    (20251204065852). engagement_id is NOT NULL UNIQUE in the real schema
--    (one work order per engagement) — kept here for fidelity since C3's
--    save_wo_staffing resolves the engagement through this FK.
-- =====================================================================
CREATE TABLE public.work_orders (
  wo_id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id   uuid NOT NULL UNIQUE REFERENCES public.engagements (engagement_id) ON DELETE CASCADE,
  currency        varchar(3) NOT NULL DEFAULT 'BOB' CHECK (currency IN ('USD', 'BOB')),
  season_mode     varchar(4) NOT NULL DEFAULT 'High' CHECK (season_mode IN ('High', 'Low')),
  approval_status varchar(20) NOT NULL DEFAULT 'Draft'
    CHECK (approval_status IN ('Draft', 'Pending_Approval', 'Approved', 'Rejected'))
);

-- =====================================================================
-- 4. skills taxonomy + staff_skills junction (20260412073936). Only the
--    columns the scheduler's own migrations/RPCs touch.
-- =====================================================================
CREATE TABLE public.skills (
  skill_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name     VARCHAR NOT NULL,
  category VARCHAR NOT NULL
);

CREATE TABLE public.staff_skills (
  staff_skill_id    UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id          UUID NOT NULL REFERENCES public.staff (staff_id) ON DELETE CASCADE,
  skill_id          UUID NOT NULL REFERENCES public.skills (skill_id) ON DELETE RESTRICT,
  proficiency_level VARCHAR NOT NULL CHECK (proficiency_level IN ('Beginner', 'Intermediate', 'Advanced')),
  UNIQUE (staff_id, skill_id)
);

-- New tables inherit the ALTER DEFAULT PRIVILEGES set by 00-shim-supabase.sql
-- (same role for the whole run) — no additional GRANT needed here.
