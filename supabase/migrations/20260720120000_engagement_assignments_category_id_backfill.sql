-- Corrective migration — converge engagement_assignments to its canonical
-- shape (Phase 3 structure + D5 RLS), with category_id backfill.
--
-- Root cause
-- ----------
-- Phase 3 added the `category_id` select + `category:categories(*)` embed to
-- useEngagementAssignments (src/hooks/useEmsData.ts). That frontend change is
-- auto-synced to the live app through the Lovable GitHub integration, but the
-- matching schema migration (20260716120000_engagement_assignments_phase3.sql)
-- requires an explicit "Apply pending Supabase migrations" prompt and its
-- effects are absent from the live database — `engagement_assignments` has no
-- `category_id` column. PostgREST errors (42703 undefined column / PGRST200
-- unresolved embed), the hook's isSchemaNotReady guard swallows them and
-- returns [], and the scheduler renders its empty state even though the
-- seeded assignment rows exist.
--
-- Why a converge-to-canonical migration (adversarial review, 2026-07-20)
-- ----------------------------------------------------------------------
-- The live migration HISTORY cannot be inspected from this repository, and
-- observed live state is contradictory under a strict in-order model: the
-- 20260719044642 tables (wo_staffing_requirements) EXIST while the earlier
-- 20260716120000 effects (category_id) are ABSENT. Two worlds explain that:
--
--   world P (pending): 20260716120000 is still recorded as pending. "Apply
--     pending Supabase migrations" runs it (and D5, Phase 5) first, in
--     timestamp order; every step here then re-asserts the same end state
--     (no-ops for structure, identical re-creates for RLS).
--   world D (drifted): 20260716120000 is recorded as applied but its effects
--     are absent (e.g. a failed/partial apply, or history divergence across
--     branch switches). The runner will never re-run it — only a LATER
--     migration can repair the schema. This migration is that repair, and it
--     restores the FULL required shape, not just one column: structure from
--     Phase 3 (category_id + backfill + NOT NULL + FK, date-range CHECK,
--     the three partial indexes, updated_at trigger) and row security as the
--     CANONICAL FINAL state — the D5 matrix from
--     20260717233000_engagement_assignments_d5_rls.sql, NOT Phase 3's
--     permissive `ea_select USING (true)` / `ea_team_manage FOR ALL`, which
--     D5 deliberately replaced for data confidentiality. Re-creating the
--     Phase 3 RLS here would re-open the leaks D5 closed; asserting the D5
--     end state is idempotent in world P and corrective in world D.
--
-- Section order is deliberate: the RLS repair (sections A–B) runs BEFORE
-- every data-dependent abort point (sections C–J), so under a
-- statement-by-statement runner an abort on bad data (NULL category, bad
-- dates) can never leave the legacy permissive policies active — the
-- confidentiality repair is not held hostage by data quality. Under a
-- single-transaction apply the order is immaterial (all-or-nothing).
--
-- Every step is guarded on catalog state and deterministic, so the migration
-- is safe to re-run in any mode. Ordering: it carries the latest timestamp,
-- so a standard runner always applies it last; manual out-of-order
-- application is also safe — 20260716120000's permissive-policy section is
-- guarded to skip itself when the D5 matrix is already installed (see the
-- order-safety block there), so re-running Phase 3 AFTER this migration
-- cannot re-open the leak D5 closed. Section K self-verifies the final
-- state and raises if anything is missing — under a single-transaction
-- apply that rolls everything back; under a statement-by-statement runner
-- it halts the apply loudly, and every reachable partial state is
-- re-runnable and convergent (CI's failure-path lane proves both).
--
-- Scope note: the Phase 5 (20260718120000) and requirements (20260719044642)
-- domains are NOT restored here — each has its own idempotent migration to
-- re-apply if history proves drifted. This migration converges only the
-- engagement_assignments domain this bug is about (including the D5 view
-- hardening adjacent to it).
--
-- Operator runbook (after this lands on the Lovable-connected branch)
-- -------------------------------------------------------------------
-- 1. Run "Apply pending Supabase migrations" in Lovable (also regenerates
--    src/integrations/supabase/types.ts to include category_id).
-- 2. Verify with SQL, not the UI — the frontend guard masks schema errors,
--    so a visually empty scheduler proves nothing. Ask Lovable to run:
--      SELECT count(*) AS total,
--             count(*) FILTER (WHERE category_id IS NULL) AS uncategorized
--        FROM engagement_assignments;
--    Expect uncategorized = 0. Section K below already raises inside the
--    apply if the converged shape is incomplete.
-- 3. Confirm the PostgREST read path: the Scheduler L2 page (or a direct
--    /rest/v1/engagement_assignments?select=category_id,category:categories(*)
--    probe as an authorized user) returns rows without 42703 / PGRST200.
-- 4. Exercise the visibility matrix in the UI: open Scheduler L2 as an
--    authorized user (rows render) AND as a role outside the D5 matrix
--    via a deep link (empty state, no data leak), and confirm the gray
--    Cancel button returns to /scheduler in every state.
--
-- If section K aborts naming a NON-CANONICAL POLICY: the live table
-- carries a policy name this migration does not know (e.g. a
-- Lovable-created one). That abort is deliberate — dynamically dropping
-- unknown policies could remove a RESTRICTIVE policy and silently WIDEN
-- access. Review the named policy; if it is a permissive pre-D5
-- leftover, drop it manually and re-run the apply.

-- =====================================================================
-- A. Row security — assert the CANONICAL FINAL matrix (D5), verbatim
--    from 20260717233000_engagement_assignments_d5_rls.sql. In world P
--    this re-creates identical objects after D5 has run; in world D it
--    installs the matrix over whatever pre-D5 policies the live table
--    still carries. Helper bodies must stay the exact D5 definitions:
--    can_read_engagement_assignments is conjoined by every write policy
--    so a write can never manufacture read eligibility.
--    NOTE: deliberately NOT Phase 3's `ea_select USING (true)` /
--    `ea_team_manage FOR ALL` — D5 replaced those as a
--    data-confidentiality boundary; restoring them would be a security
--    regression.
-- =====================================================================
ALTER TABLE public.engagement_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_firmwide_assignment_visibility()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'partner', 'director')
  )
$$;

CREATE OR REPLACE FUNCTION public.has_assignment_on_engagement(p_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM engagement_assignments ea
    WHERE ea.engagement_id = p_engagement_id
      AND ea.staff_id = get_my_staff_id()
      AND ea.deleted_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.can_read_engagement_assignments(p_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    has_firmwide_assignment_visibility()
    OR (has_role(auth.uid(), 'manager'::app_role)
        AND is_engagement_team_member(p_engagement_id))
    OR (has_role(auth.uid(), 'senior'::app_role)
        AND has_assignment_on_engagement(p_engagement_id))
$$;

-- Least privilege on the helpers (D5 section C). CREATE OR REPLACE
-- preserves an existing ACL, but in world D the functions are created
-- fresh and Supabase's defaults grant EXECUTE directly to anon /
-- authenticated / service_role — so the full revoke/grant set must be
-- re-asserted here, not assumed.
REVOKE EXECUTE ON FUNCTION public.has_firmwide_assignment_visibility() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_assignment_on_engagement(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_engagement_assignments(uuid) FROM PUBLIC;
DO $$
DECLARE
  r text;
  f text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'service_role'] LOOP
    IF to_regrole(r) IS NULL THEN CONTINUE; END IF;
    FOREACH f IN ARRAY ARRAY[
      'has_firmwide_assignment_visibility()',
      'has_assignment_on_engagement(uuid)',
      'can_read_engagement_assignments(uuid)'
    ] LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM %I', f, r);
    END LOOP;
  END LOOP;
END $$;
GRANT  EXECUTE ON FUNCTION public.has_firmwide_assignment_visibility() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.has_assignment_on_engagement(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_read_engagement_assignments(uuid) TO authenticated;

-- Drop every historical policy generation by name (scheduler-v2 era,
-- Phase 3 era, and the canonical names ahead of deterministic
-- re-creation). Policy names are table-scoped, so this touches nothing
-- else.
DROP POLICY IF EXISTS "Authenticated can read assignments" ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership can insert assignments"  ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership can update assignments"  ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership can delete assignments"  ON public.engagement_assignments;
DROP POLICY IF EXISTS "Leadership manages assignments"     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select          ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_manage     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_admin_manage    ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select_firmwide ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select_lead     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select_assigned ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_insert     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_update     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_delete     ON public.engagement_assignments;

-- Canonical policy set: admin manage-all (Phase 3, kept by D5) + the
-- three D5 SELECT rules + the three D5 write-only team rules.
CREATE POLICY ea_admin_manage ON public.engagement_assignments
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY ea_select_firmwide ON public.engagement_assignments
  FOR SELECT TO authenticated
  USING (public.has_firmwide_assignment_visibility());

CREATE POLICY ea_select_lead ON public.engagement_assignments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::app_role)
    AND public.is_engagement_team_member(engagement_id)
  );

CREATE POLICY ea_select_assigned ON public.engagement_assignments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'senior'::app_role)
    AND public.has_assignment_on_engagement(engagement_id)
  );

CREATE POLICY ea_team_insert ON public.engagement_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_engagement_team_member(engagement_id)
    AND public.can_read_engagement_assignments(engagement_id)
  );

CREATE POLICY ea_team_update ON public.engagement_assignments
  FOR UPDATE TO authenticated
  USING (
    public.is_engagement_team_member(engagement_id)
    AND public.can_read_engagement_assignments(engagement_id)
  )
  WITH CHECK (
    public.is_engagement_team_member(engagement_id)
    AND public.can_read_engagement_assignments(engagement_id)
  );

CREATE POLICY ea_team_delete ON public.engagement_assignments
  FOR DELETE TO authenticated
  USING (
    public.is_engagement_team_member(engagement_id)
    AND public.can_read_engagement_assignments(engagement_id)
  );

-- Defense in depth (D5 section F): anon holds no policy on this table;
-- remove its table grant too.
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON public.engagement_assignments FROM anon;
  END IF;
END $$;

-- =====================================================================
-- B. Scheduler-v2 era view hardening (D5 section G, verbatim). Views
--    execute with owner privileges by default and bypass the matrix
--    above; in world D this exposure is still open. Guarded per view.
-- =====================================================================
DO $$
DECLARE
  v text;
  api_roles text;
BEGIN
  SELECT string_agg(quote_ident(r), ', ')
    INTO api_roles
    FROM unnest(ARRAY['anon', 'authenticated']) AS r
   WHERE to_regrole(r) IS NOT NULL;

  FOREACH v IN ARRAY ARRAY[
    'vw_engagement_staffing_summary',
    'vw_staffing_alerts',
    'vw_staff_weekly_capacity'
  ] LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v);
      IF api_roles IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM %s', v, api_roles);
      END IF;
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
    END IF;
  END LOOP;

  IF to_regrole('anon') IS NOT NULL THEN
    FOREACH v IN ARRAY ARRAY[
      'vw_actual_hours_by_category_activity',
      'vw_budget_vs_actual_hours_by_category_activity',
      'vw_wo_budget_hours_by_category',
      'vw_wo_budget_hours_by_category_activity'
    ] LOOP
      IF to_regclass('public.' || v) IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', v);
      END IF;
    END LOOP;
  END IF;
END $$;

-- =====================================================================
-- C. Column — Phase 3's only schema addition (idempotent)
-- =====================================================================
ALTER TABLE public.engagement_assignments
  ADD COLUMN IF NOT EXISTS category_id UUID;

-- =====================================================================
-- D. Backfill from staff.category_id for every un-categorized row.
--    Covers the 24 SEED-SCHED rows (seeded before the column existed)
--    and the 2 legacy assignments. staff.category_id is itself FK'd to
--    categories, so backfilled values always satisfy section G's FK.
-- =====================================================================
UPDATE public.engagement_assignments ea
   SET category_id = s.category_id
  FROM public.staff s
 WHERE ea.staff_id = s.staff_id
   AND ea.category_id IS NULL;

-- =====================================================================
-- E. Pre-flight before NOT NULL. A row can still be NULL here for two
--    reasons: (1) the assigned staff member's staff.category_id is NULL
--    (it is nullable), or (2) the assignment's staff_id has no matching
--    staff row, so section D's join skipped it. Fail loudly with
--    cleanup guidance for both cases instead of letting the ALTER below
--    abort with a generic constraint error.
-- =====================================================================
DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*)
    INTO missing_count
    FROM public.engagement_assignments
   WHERE category_id IS NULL;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce engagement_assignments.category_id NOT NULL: % row(s) remain NULL after staff.category_id backfill. Causes: staff.category_id is NULL for that member, or the assignment''s staff_id has no matching staff row. Fix those rows (populate staff.category_id, or set the assignment''s category_id directly), then re-run.',
      missing_count;
  END IF;
END $$;

-- =====================================================================
-- F. Enforce NOT NULL (idempotent — skip if already NOT NULL)
-- =====================================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'engagement_assignments'
       AND column_name  = 'category_id'
       AND is_nullable  = 'YES'
  ) THEN
    ALTER TABLE public.engagement_assignments
      ALTER COLUMN category_id SET NOT NULL;
  END IF;
END $$;

-- =====================================================================
-- G. Foreign key → categories (idempotent — skip if already present).
--    Same constraint name as the Phase 3 migration so the two never
--    collide regardless of apply order.
-- =====================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'engagement_assignments_category_id_fkey'
       AND table_schema    = 'public'
       AND table_name      = 'engagement_assignments'
  ) THEN
    ALTER TABLE public.engagement_assignments
      ADD CONSTRAINT engagement_assignments_category_id_fkey
      FOREIGN KEY (category_id)
      REFERENCES public.categories(category_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- =====================================================================
-- H. Date sanity (Phase 3 section F). Pre-flight violating rows first
--    so the ADD CONSTRAINT cannot abort with an unactionable error,
--    then converge to exactly one date constraint under the canonical
--    name (dropping the scheduler-v2 era spelling if present).
-- =====================================================================
DO $$
DECLARE
  bad_dates integer;
BEGIN
  SELECT count(*)
    INTO bad_dates
    FROM public.engagement_assignments
   WHERE end_date < start_date;

  IF bad_dates > 0 THEN
    RAISE EXCEPTION
      'Cannot add engagement_assignments date CHECK: % row(s) have end_date < start_date. Correct those rows, then re-run.',
      bad_dates;
  END IF;
END $$;

ALTER TABLE public.engagement_assignments
  DROP CONSTRAINT IF EXISTS chk_assignment_dates;
ALTER TABLE public.engagement_assignments
  DROP CONSTRAINT IF EXISTS engagement_assignments_dates_chk;
ALTER TABLE public.engagement_assignments
  ADD  CONSTRAINT engagement_assignments_dates_chk CHECK (end_date >= start_date);

-- =====================================================================
-- I. Partial indexes on the soft-delete hot read paths (Phase 3
--    section G — all three, not just the category one; Phase 5's
--    get_staff_assignment_segments explicitly relies on
--    idx_eng_assign_staff_dates_active). Same names as Phase 3.
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_eng_assign_engagement_active
  ON public.engagement_assignments (engagement_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_eng_assign_staff_dates_active
  ON public.engagement_assignments (staff_id, start_date, end_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_eng_assign_category_active
  ON public.engagement_assignments (category_id) WHERE deleted_at IS NULL;

-- =====================================================================
-- J. updated_at trigger (Phase 3 section H): column added defensively,
--    the scheduler-v2 era trigger name dropped, canonical name
--    (re)created so the row is touched exactly once per UPDATE.
-- =====================================================================
ALTER TABLE public.engagement_assignments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_engagement_assignments_updated_at
  ON public.engagement_assignments;
DROP TRIGGER IF EXISTS update_engagement_assignments_updated_at
  ON public.engagement_assignments;
CREATE TRIGGER update_engagement_assignments_updated_at
  BEFORE UPDATE ON public.engagement_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- K. Post-flight self-verification: assert the converged shape and
--    ABORT if anything is missing. The frontend guard converts schema
--    errors into an empty list, so a silent partial apply would look
--    exactly like "no assignments" — this block makes that impossible.
-- =====================================================================
DO $$
DECLARE
  problems text[] := ARRAY[]::text[];
  n integer;
BEGIN
  -- category_id present + NOT NULL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'engagement_assignments'
       AND column_name = 'category_id' AND is_nullable = 'NO'
  ) THEN
    problems := problems || 'category_id column missing or still nullable';
  END IF;

  -- FK to categories
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.engagement_assignments'::regclass
       AND conname  = 'engagement_assignments_category_id_fkey'
       AND contype  = 'f'
  ) THEN
    problems := problems || 'FK engagement_assignments_category_id_fkey missing';
  END IF;

  -- date CHECK
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.engagement_assignments'::regclass
       AND conname  = 'engagement_assignments_dates_chk'
       AND contype  = 'c'
  ) THEN
    problems := problems || 'CHECK engagement_assignments_dates_chk missing';
  END IF;

  -- the three partial indexes
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'engagement_assignments'
     AND indexname IN ('idx_eng_assign_engagement_active',
                       'idx_eng_assign_staff_dates_active',
                       'idx_eng_assign_category_active');
  IF n <> 3 THEN
    problems := problems || format('expected 3 partial indexes, found %s', n);
  END IF;

  -- updated_at trigger under the canonical name
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.engagement_assignments'::regclass
       AND tgname  = 'update_engagement_assignments_updated_at'
       AND NOT tgisinternal
  ) THEN
    problems := problems || 'trigger update_engagement_assignments_updated_at missing';
  END IF;

  -- RLS enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.engagement_assignments'::regclass AND relrowsecurity
  ) THEN
    problems := problems || 'row level security not enabled';
  END IF;

  -- exactly the canonical seven policies, none of the permissive ones
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'engagement_assignments'
     AND policyname IN ('ea_admin_manage', 'ea_select_firmwide', 'ea_select_lead',
                        'ea_select_assigned', 'ea_team_insert', 'ea_team_update',
                        'ea_team_delete');
  IF n <> 7 THEN
    problems := problems || format('expected the 7 canonical policies, found %s', n);
  END IF;
  DECLARE
    stray text;
  BEGIN
    SELECT string_agg(policyname, ', ') INTO stray FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'engagement_assignments'
       AND policyname NOT IN ('ea_admin_manage', 'ea_select_firmwide', 'ea_select_lead',
                              'ea_select_assigned', 'ea_team_insert', 'ea_team_update',
                              'ea_team_delete');
    IF stray IS NOT NULL THEN
      problems := problems || format('non-canonical policy(ies) present — manual review required (a permissive stray leaks; dropping a RESTRICTIVE stray would widen access — see runbook): %s', stray);
    END IF;
  END;

  -- D5 helpers present
  IF to_regprocedure('public.has_firmwide_assignment_visibility()') IS NULL
     OR to_regprocedure('public.has_assignment_on_engagement(uuid)') IS NULL
     OR to_regprocedure('public.can_read_engagement_assignments(uuid)') IS NULL THEN
    problems := problems || 'one or more D5 helper functions missing';
  END IF;

  -- View-hardening second belt: security_invoker must be set on every
  -- scheduler-v2 staffing view that exists (the revoke belt is proven
  -- behaviorally by the leakage suite, but WITHOUT this option a future
  -- re-grant would silently re-open the owner-privilege RLS bypass —
  -- and no behavioral probe can see the difference today).
  DECLARE
    v text;
  BEGIN
    FOREACH v IN ARRAY ARRAY[
      'vw_engagement_staffing_summary',
      'vw_staffing_alerts',
      'vw_staff_weekly_capacity'
    ] LOOP
      -- Nested IF: AND does not short-circuit in SQL expressions, and a
      -- ::regclass cast on a missing relation would throw. The option is
      -- parsed via pg_options_to_table rather than matched as a literal
      -- string: reloptions stores whatever boolean spelling the setter
      -- used (true/on/1/yes), and a literal match would false-negative
      -- on a spelling this repo's migrations did not write.
      IF to_regclass('public.' || v) IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_options_to_table(
                   (SELECT reloptions FROM pg_class WHERE oid = to_regclass('public.' || v)))
           WHERE option_name = 'security_invoker'
             AND lower(option_value) IN ('true', 'on', '1', 'yes')
        ) THEN
          problems := problems || format('view %s lacks security_invoker=true (owner-privilege RLS bypass one GRANT away)', v);
        END IF;
      END IF;
    END LOOP;
  END;

  IF array_length(problems, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'engagement_assignments convergence FAILED — rolling back. Problems: %',
      array_to_string(problems, '; ');
  END IF;

  RAISE NOTICE 'engagement_assignments converged: category_id NOT NULL + FK, date CHECK, 3 partial indexes, updated_at trigger, D5 RLS matrix (7 policies), helpers hardened';
END $$;
