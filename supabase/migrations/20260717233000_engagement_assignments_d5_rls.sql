-- Scheduler D5 — data-confidentiality RLS for engagement_assignments
-- Issue: #219 (hard production-release gate for the Scheduler)
-- Revised per PR #222 reviews (Greptile + adversarial): role-gated lead
-- SELECT, write-only team policies, least-privilege helpers, and
-- hardening of the scheduler-v2 era views that read the table.
--
-- Phase 3 shipped `ea_select ... USING (true)`: every authenticated user
-- could read every assignment row (staff identity, dates, weekly hours,
-- allocation, notes, status) via direct PostgREST access, regardless of
-- what the Scheduler UI shows. The owner decision recorded in PR #214 is
-- that the D5 visibility matrix is a data-confidentiality requirement,
-- so SELECT must mirror the server-side rule enforced by the
-- scheduler-data edge function (visibilityRuleFor in handler.ts):
--
--   admin / partner / director  → firmwide
--   manager (role)              → engagements where caller is manager_id
--                                 or partner_id (lead-only)
--   senior (role)               → engagements where caller holds a
--                                 non-deleted assignment
--   every other role            → denied — including users structurally
--                                 listed as manager_id/partner_id whose
--                                 app_role is outside the matrix (the
--                                 handler denies them; RLS must too)
--
-- Write semantics: admin (ea_admin_manage) OR Phase 3's structural
-- rule (is_engagement_team_member) CONJOINED with the D5 read matrix,
-- as INSERT/UPDATE/DELETE-only policies. Phase 3's `ea_team_manage
-- FOR ALL` implicitly granted SELECT to any structural lead (PR #222
-- adversarial finding 2), and an ungated structural INSERT let a
-- read-denied lead self-assign and thereby self-grant visibility
-- (PR #222 adversarial verification P1). Writers must already be
-- readers; a write can never manufacture read eligibility.
--
-- Recursion caution (#219): a SELECT policy on engagement_assignments
-- that subqueries engagement_assignments for the senior rule would
-- recurse. The senior check therefore lives in a SECURITY DEFINER
-- helper owned by postgres — the owner is exempt from RLS (the table
-- is not FORCE ROW LEVEL SECURITY), so the inner query never re-enters
-- the policy. Same pattern as get_my_staff_id() /
-- is_engagement_team_member().
--
-- Idempotent (CREATE OR REPLACE / DROP ... IF EXISTS / guarded DO
-- blocks) so re-runs are safe.

-- =====================================================================
-- A. Firmwide visibility helper: admin, partner, director
-- =====================================================================
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

-- =====================================================================
-- B. Assigned-engagement helper: does the caller hold a non-deleted
--    assignment on this engagement? Deliberately date-agnostic: a
--    senior keeps visibility over past/future segments of their own
--    engagements, matching the scheduler-data senior pre-resolution
--    (deleted_at IS NULL, no date filter). Distinct from Phase 5's
--    planned has_active_assignment(staff, engagement, date), which is
--    date-scoped and serves a different question.
-- =====================================================================
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

-- =====================================================================
-- B2. Complete D5 read matrix as one predicate. MUST stay the exact
--     disjunction of the three SELECT policies in section D — the
--     write policies in section E conjoin it so that no write path can
--     manufacture read eligibility (PR #222 adversarial verification
--     P1: a senior-role structural lead could otherwise INSERT an
--     assignment for THEMSELF, flip has_assignment_on_engagement to
--     true, and self-grant full engagement visibility plus row-
--     referencing UPDATE/DELETE).
-- =====================================================================
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

-- =====================================================================
-- C. Least privilege on the SECURITY DEFINER helpers (PR #222 finding 4
--    + follow-up P2). PostgreSQL grants EXECUTE to PUBLIC by default,
--    and Supabase additionally grants EXECUTE on new functions DIRECTLY
--    to anon / authenticated / service_role — a direct grant that
--    SURVIVES `REVOKE ... FROM PUBLIC`. These helpers are invoked ONLY
--    during RLS policy evaluation, which runs as the querying role
--    (authenticated), so authenticated is the sole role that needs
--    EXECUTE. Revoke PUBLIC unconditionally and anon/service_role where
--    present; grant only authenticated. (service_role bypasses RLS and
--    never invokes these through a policy; revoking it keeps the ACL
--    "authenticated only" rather than platform-default. Matches the
--    repo convention in 20260217035038_*.sql.)
-- =====================================================================
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

-- =====================================================================
-- D. Replace the permissive SELECT policy with the role/engagement-
--    aware set. Three permissive policies OR together; each names one
--    rule of the D5 matrix. Roles outside the matrix match no SELECT
--    policy → denied. ea_admin_manage (FOR ALL) already grants admin
--    SELECT; admin is kept in the firmwide helper so the SELECT rule
--    reads complete on its own.
--    The lead rule is role-gated (PR #222 reviews): structural
--    manager_id/partner_id membership alone no longer grants SELECT —
--    the caller's app_role must be 'manager' (partner/director role
--    holders are covered by the firmwide rule).
-- =====================================================================
DROP POLICY IF EXISTS ea_select ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select_firmwide ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select_lead     ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_select_assigned ON public.engagement_assignments;

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

-- =====================================================================
-- E. Split Phase 3's ea_team_manage (FOR ALL) into write-only policies
--    (PR #222 finding 2): FOR ALL includes SELECT, and permissive
--    policies OR together, so the structural rule was silently
--    re-opening reads for any manager_id/partner_id user regardless of
--    role.
--    Every write policy conjoins can_read_engagement_assignments()
--    (PR #222 adversarial verification P1): structural membership
--    alone allowed a read-denied structural lead to INSERT an
--    assignment for themself and thereby self-grant SELECT (and, once
--    visible, UPDATE/DELETE) over the whole engagement. Writers must
--    already pass the D5 read matrix — a write can never manufacture
--    read eligibility. The explicit conjunct on UPDATE/DELETE also
--    closes blind statements (e.g. a WHERE-less soft-delete UPDATE
--    reads no existing row, so SELECT-policy filtering alone would
--    not have stopped it).
--    Net write model: admin (ea_admin_manage) OR structural lead who
--    passes the D5 read matrix. Personas outside the matrix cannot
--    write at all; the client-side canEdit/canWrite mirrors agree.
-- =====================================================================
DROP POLICY IF EXISTS ea_team_manage ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_insert ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_update ON public.engagement_assignments;
DROP POLICY IF EXISTS ea_team_delete ON public.engagement_assignments;

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

-- =====================================================================
-- F. Defense in depth: anon holds no policy on this table; remove its
--    table grant too so unauthenticated PostgREST probes get a hard
--    permission error instead of an empty result.
-- =====================================================================
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON public.engagement_assignments FROM anon;
  END IF;
END $$;

-- =====================================================================
-- G. Scheduler-v2 era views over assignment/staff data (PR #222
--    adversarial finding 1). Views execute with the view OWNER's
--    privileges by default, so they bypassed the new RLS entirely —
--    an anonymous PostgREST probe read vw_engagement_staffing_summary
--    (client names, engagement details, staffing counts);
--    vw_staffing_alerts exposes staff names and assignment dates.
--    None of the three staffing views is referenced anywhere in the
--    app (verified: only the two budget views are queried, by the
--    dashboard tabs), so removing API-role access breaks nothing.
--    Both belts: revoke anon/authenticated AND set security_invoker,
--    so even a future re-grant would still be subject to base-table
--    RLS. Guarded per view — they were created via Lovable in the
--    scheduler-v2 era and may not exist in a fresh environment.
--    The budget views keep authenticated access (the dashboard uses
--    them) but lose anon access; their security semantics are
--    deliberately untouched to avoid changing dashboard behavior.
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
