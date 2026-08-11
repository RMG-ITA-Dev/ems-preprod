-- Per-role leakage tests for the D5 engagement_assignments RLS (#219).
-- Revised per PR #222 reviews: every assertion is scoped to the fixture
-- engagement ids, so the suite is safe AND deterministic on a live
-- database that already contains real assignments; adds the
-- non-manager structural-lead persona, anon probes, and probes of the
-- scheduler-v2 staffing views the migration hardens.
--
-- Run AFTER applying 20260717233000_engagement_assignments_d5_rls.sql,
-- in the Supabase SQL editor (or via a Lovable prompt: "Run the SQL in
-- supabase/tests/rls-engagement-assignments-d5.sql and report the
-- output"). The script is a single transaction that ALWAYS rolls back:
-- it inserts throwaway fixtures, impersonates each role via
-- request.jwt.claims, asserts exactly what each may see, and raises an
-- exception on any leak. Success output: one NOTICE per passing check
-- ending with "D5 RLS: ALL CHECKS PASSED (rolled back)".
--
-- Fixture world (all ids carry recognizable d5-test prefixes):
--   E1  led by manager-role staff Mel (manager_id)
--   E2  led by unrelated staff Olga
--   E3  led by SENIOR-role staff Sofia (structural lead, role outside
--       the lead rule — the PR #222 finding-2 persona)
--   Assignment rows:
--     E1 → Sam (senior, active), Max (manager-role staffed-but-not-
--          lead, active), Ximena (semisenior, active)
--     E2 → Olga (active), Sam (soft-DELETED — must grant nothing)
--     E3 → Olga (active)
--
-- Expected visibility over the SIX fixture rows (incl. soft-deleted):
--   admin / partner / director → 6 (firmwide)
--   manager Mel (lead of E1)   → 3 (E1 only)
--   manager Max (staffed, not lead) → 0
--   senior Sam                 → 3 (E1 only; deleted E2 row grants nothing)
--   senior Sofia (structural manager_id of E3, no assignment) → 0
--   semisenior Ximena          → 0 (role outside the D5 matrix)
--   no-role user               → 0
--   anon                       → hard permission error (grant revoked)

BEGIN;

-- ── Fixtures (as postgres; RLS does not bind the table owner) ─────────
INSERT INTO public.categories (category_id, category_name)
VALUES ('c0000000-0000-4000-8000-000000000001', 'D5 Test Category');

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c1000000-0000-4000-8000-000000000001', 'D5 Test Client', 'D5-TAX-001');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, category_id) VALUES
  ('50000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'Pat',  'Partner',       'c0000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-00000000000b', 'Dana', 'Director',      'c0000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-00000000000c', 'Mel',  'ManagerLead',   'c0000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000000d', 'Max',  'ManagerStaffed','c0000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-00000000000e', 'Sam',  'Senior',        'c0000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-00000000000f', 'a0000000-0000-4000-8000-00000000000f', 'Ximena','Semisenior',   'c0000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000010', NULL, 'Olga', 'OtherLead', 'c0000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000011', 'Sofia','SeniorLead',    'c0000000-0000-4000-8000-000000000001');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000000-0000-4000-8000-000000000009', 'admin'),
  ('a0000000-0000-4000-8000-00000000000a', 'partner'),
  ('a0000000-0000-4000-8000-00000000000b', 'director'),
  ('a0000000-0000-4000-8000-00000000000c', 'manager'),
  ('a0000000-0000-4000-8000-00000000000d', 'manager'),
  ('a0000000-0000-4000-8000-00000000000e', 'senior'),
  ('a0000000-0000-4000-8000-00000000000f', 'semisenior'),
  ('a0000000-0000-4000-8000-000000000011', 'senior');
-- 'a0000000-...-0000000000ff' (no-role user) gets no user_roles row.

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'D5 E1', '50000000-0000-4000-8000-00000000000c'),
  ('e0000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'D5 E2', '50000000-0000-4000-8000-000000000010'),
  ('e0000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'D5 E3', '50000000-0000-4000-8000-000000000011');

INSERT INTO public.engagement_assignments
  (assignment_id, engagement_id, staff_id, category_id, start_date, end_date, deleted_at) VALUES
  ('aa000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000e', 'c0000000-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31', NULL),
  ('aa000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000d', 'c0000000-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31', NULL),
  ('aa000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000f', 'c0000000-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31', NULL),
  ('aa000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31', NULL),
  ('aa000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000e', 'c0000000-0000-4000-8000-000000000001', '2026-01-01', '2026-06-30', now()),
  ('aa000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000001', '2026-01-01', '2026-12-31', NULL);

-- ── Impersonation helper (temp; vanishes with the session) ────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  )
$$;

-- ── Everything below runs as `authenticated` (RLS enforced) ───────────
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  n int;
  v text;
  denied boolean;
BEGIN
  -- All row-count assertions are scoped to the three fixture
  -- engagements: live rows outside this set never affect the counts.

  -- Firmwide roles
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000009');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003');
  IF n <> 6 THEN RAISE EXCEPTION 'D5 RLS FAIL — admin: expected 6 fixture rows, got %', n; END IF;
  RAISE NOTICE 'PASS — admin sees all fixture rows (6)';

  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-00000000000a');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003');
  IF n <> 6 THEN RAISE EXCEPTION 'D5 RLS FAIL — partner: expected 6 fixture rows, got %', n; END IF;
  RAISE NOTICE 'PASS — partner sees all fixture rows (6)';

  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-00000000000b');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003');
  IF n <> 6 THEN RAISE EXCEPTION 'D5 RLS FAIL — director: expected 6 fixture rows, got %', n; END IF;
  RAISE NOTICE 'PASS — director sees all fixture rows (6)';

  -- Manager: lead-only. This SELECT also proves no policy recursion —
  -- a recursive policy would abort here with SQLSTATE 42P17.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-00000000000c');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003');
  IF n <> 3 THEN RAISE EXCEPTION 'D5 RLS FAIL — lead manager: expected 3 rows (E1), got %', n; END IF;
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id IN ('e0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003');
  IF n <> 0 THEN RAISE EXCEPTION 'D5 RLS FAIL — manager cross-engagement leakage: % foreign rows visible', n; END IF;
  RAISE NOTICE 'PASS — manager (lead of E1) sees E1 only, E2/E3 hidden';

  -- Manager staffed-but-not-lead: nothing
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-00000000000d');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003');
  IF n <> 0 THEN RAISE EXCEPTION 'D5 RLS FAIL — staffed-but-not-lead manager: expected 0 rows, got %', n; END IF;
  RAISE NOTICE 'PASS — manager staffed-but-not-lead sees nothing';

  -- Senior: assigned-only; own soft-deleted E2 row grants nothing.
  -- Explicit senior recursion check from #219: the policy subqueries
  -- engagement_assignments via the SECURITY DEFINER helper.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-00000000000e');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003');
  IF n <> 3 THEN RAISE EXCEPTION 'D5 RLS FAIL — senior: expected 3 rows (E1), got %', n; END IF;
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id = 'e0000000-0000-4000-8000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION 'D5 RLS FAIL — senior cross-engagement leakage: % E2 rows visible (deleted assignment must grant nothing)', n; END IF;
  RAISE NOTICE 'PASS — senior sees assigned engagement (E1) only, deleted E2 assignment grants nothing';

  -- Non-manager structural lead (PR #222 finding 2): Sofia has role
  -- senior, holds NO assignment, but is E3's manager_id. Under Phase
  -- 3's ea_team_manage FOR ALL (or an un-gated lead rule) she would
  -- see E3's row; under D5 she must see nothing.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000011');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003');
  IF n <> 0 THEN RAISE EXCEPTION 'D5 RLS FAIL — non-manager structural lead: expected 0 rows, got % (FOR ALL / un-gated lead policy leaking)', n; END IF;
  RAISE NOTICE 'PASS — senior-role structural lead of E3 sees nothing';

  -- Roles outside the D5 matrix
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-00000000000f');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003');
  IF n <> 0 THEN RAISE EXCEPTION 'D5 RLS FAIL — semisenior: expected 0 rows, got %', n; END IF;
  RAISE NOTICE 'PASS — semisenior (assigned to E1) denied';

  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000ff');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003');
  IF n <> 0 THEN RAISE EXCEPTION 'D5 RLS FAIL — no-role user: expected 0 rows, got %', n; END IF;
  RAISE NOTICE 'PASS — user without user_roles row denied';

  -- Write policies: structural rule retained, now write-only.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-00000000000c');
  UPDATE public.engagement_assignments SET notes = 'd5-probe'
   WHERE assignment_id = 'aa000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'D5 RLS FAIL — lead manager could not update own-engagement row (Engagement Form write path broken)'; END IF;
  RAISE NOTICE 'PASS — lead manager write on own engagement still works';

  UPDATE public.engagement_assignments SET notes = 'd5-probe'
   WHERE assignment_id = 'aa000000-0000-4000-8000-000000000004';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'D5 RLS FAIL — manager updated a foreign-engagement row'; END IF;
  RAISE NOTICE 'PASS — manager write on foreign engagement matches zero rows';

  -- ── P1 escalation regression (PR #222 adversarial verification) ────
  -- Sofia: senior role, structural manager_id of E3, NO assignment.
  -- The reported exploit: (1) SELECT denied → (2) structural INSERT of
  -- an assignment for HERSELF → (3) has_assignment_on_engagement flips
  -- true → (4) full engagement visibility + row-referencing writes.
  -- The write policies now conjoin can_read_engagement_assignments(),
  -- so step (2) must fail and every later step must stay denied.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000011');

  -- (1) SELECT denied — already asserted above; re-checked after the
  --     attempts below.

  -- (2) Self-assignment INSERT must be rejected by RLS WITH CHECK.
  denied := false;
  BEGIN
    INSERT INTO public.engagement_assignments
      (assignment_id, engagement_id, staff_id, category_id, start_date, end_date)
    VALUES
      ('aa000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001', '2026-02-01', '2026-11-30');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'D5 RLS FAIL — self-grant escalation OPEN: read-denied structural lead inserted their own assignment';
  END IF;
  RAISE NOTICE 'PASS — self-assignment INSERT rejected for read-denied structural lead';

  -- (2b) The real client write shape (useEngagementAssignmentMutations):
  --      upsert keyed on assignment_id → INSERT ON CONFLICT DO UPDATE.
  --      Must be rejected the same way.
  denied := false;
  BEGIN
    INSERT INTO public.engagement_assignments
      (assignment_id, engagement_id, staff_id, category_id, start_date, end_date, deleted_at)
    VALUES
      ('aa000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001', '2026-02-01', '2026-11-30', NULL)
    ON CONFLICT (assignment_id) DO UPDATE SET deleted_at = NULL;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'D5 RLS FAIL — self-grant escalation OPEN via client upsert shape';
  END IF;
  RAISE NOTICE 'PASS — self-assignment upsert (client shape) rejected';

  -- (2c) Inserting anyone else is equally rejected — out-of-matrix
  --      structural leads cannot write at all (migration section E).
  denied := false;
  BEGIN
    INSERT INTO public.engagement_assignments
      (assignment_id, engagement_id, staff_id, category_id, start_date, end_date)
    VALUES
      ('aa000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000001', '2026-02-01', '2026-11-30');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'D5 RLS FAIL — out-of-matrix structural lead can still INSERT (escalation primitive intact)';
  END IF;
  RAISE NOTICE 'PASS — out-of-matrix structural lead cannot INSERT at all';

  -- (5) Post-attempt state: SELECT, UPDATE, DELETE all still denied.
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE engagement_id IN ('e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000003');
  IF n <> 0 THEN RAISE EXCEPTION 'D5 RLS FAIL — escalation attempts changed SELECT visibility (% rows)', n; END IF;
  UPDATE public.engagement_assignments SET notes = 'd5-probe'
   WHERE assignment_id = 'aa000000-0000-4000-8000-000000000006';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'D5 RLS FAIL — out-of-matrix structural lead updated a row post-attempt'; END IF;
  UPDATE public.engagement_assignments SET deleted_at = now()
   WHERE engagement_id = 'e0000000-0000-4000-8000-000000000003';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'D5 RLS FAIL — out-of-matrix structural lead blind soft-delete matched % rows', n; END IF;
  DELETE FROM public.engagement_assignments
   WHERE engagement_id = 'e0000000-0000-4000-8000-000000000003';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'D5 RLS FAIL — out-of-matrix structural lead deleted % rows', n; END IF;
  RAISE NOTICE 'PASS — escalation closed: SELECT/UPDATE/soft-delete/DELETE all denied after attempts';

  -- Positive control: the Engagement Form write path is intact for an
  -- in-matrix structural lead. Mel (manager role, lead of E1) inserts
  -- via the client upsert shape, then re-upserts the same id (the
  -- ON CONFLICT DO UPDATE branch).
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-00000000000c');
  INSERT INTO public.engagement_assignments
    (assignment_id, engagement_id, staff_id, category_id, start_date, end_date, deleted_at)
  VALUES
    ('aa000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000001', '2026-02-01', '2026-11-30', NULL)
  ON CONFLICT (assignment_id) DO UPDATE SET deleted_at = NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'D5 RLS FAIL — manager-lead upsert (insert branch) broken'; END IF;
  INSERT INTO public.engagement_assignments
    (assignment_id, engagement_id, staff_id, category_id, start_date, end_date, deleted_at)
  VALUES
    ('aa000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000001', '2026-02-01', '2026-11-30', NULL)
  ON CONFLICT (assignment_id) DO UPDATE SET notes = 'd5-upsert-probe';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'D5 RLS FAIL — manager-lead upsert (conflict-update branch) broken'; END IF;
  RAISE NOTICE 'PASS — manager-lead client-shape upsert works (insert + conflict-update)';

  -- Scheduler-v2 staffing views (PR #222 finding 1): API roles must be
  -- hard-denied. Probed as authenticated here; anon is probed below.
  FOREACH v IN ARRAY ARRAY[
    'vw_engagement_staffing_summary',
    'vw_staffing_alerts',
    'vw_staff_weekly_capacity'
  ] LOOP
    IF to_regclass('public.' || v) IS NULL THEN
      RAISE NOTICE 'SKIP — view % not present in this environment', v;
      CONTINUE;
    END IF;
    denied := false;
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', v) INTO n;
    EXCEPTION WHEN insufficient_privilege THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'D5 RLS FAIL — view % still readable by authenticated (% rows)', v, n;
    END IF;
    RAISE NOTICE 'PASS — view % denied to authenticated', v;
  END LOOP;

  -- Anon probes: table grant revoked → hard permission error; the
  -- staffing views likewise.
  IF to_regrole('anon') IS NULL THEN
    RAISE NOTICE 'SKIP — role anon not present in this environment';
  ELSE
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';

    denied := false;
    BEGIN
      SELECT count(*) INTO n FROM public.engagement_assignments;
    EXCEPTION WHEN insufficient_privilege THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'D5 RLS FAIL — anon can still query engagement_assignments (% rows)', n;
    END IF;
    RAISE NOTICE 'PASS — anon hard-denied on engagement_assignments';

    FOREACH v IN ARRAY ARRAY[
      'vw_engagement_staffing_summary',
      'vw_staffing_alerts',
      'vw_staff_weekly_capacity'
    ] LOOP
      IF to_regclass('public.' || v) IS NULL THEN
        CONTINUE;
      END IF;
      denied := false;
      BEGIN
        EXECUTE format('SELECT count(*) FROM public.%I', v) INTO n;
      EXCEPTION WHEN insufficient_privilege THEN
        denied := true;
      END;
      IF NOT denied THEN
        RAISE EXCEPTION 'D5 RLS FAIL — view % still readable by anon (% rows)', v, n;
      END IF;
      RAISE NOTICE 'PASS — view % denied to anon', v;
    END LOOP;

    -- Direct helper invocation as anon must be rejected outright, not
    -- merely evaluate false (PR #222 follow-up P2). Depends on the EXECUTE
    -- revoke, independent of the table grant.
    denied := false;
    BEGIN
      PERFORM public.can_read_engagement_assignments('e0000000-0000-4000-8000-000000000001');
    EXCEPTION WHEN insufficient_privilege THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'D5 RLS FAIL — anon can invoke can_read_engagement_assignments()';
    END IF;
    RAISE NOTICE 'PASS — anon cannot invoke D5 helper functions';

    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
  END IF;

  -- Helper function ACLs (PR #222 follow-up P2): the migration must
  -- leave EXECUTE with authenticated ONLY. Supabase grants EXECUTE on
  -- new functions directly to anon/authenticated/service_role, so a
  -- REVOKE ... FROM PUBLIC alone would NOT remove the anon grant — the
  -- shim models that default, so these assertions fail if the migration
  -- regresses to PUBLIC-only revocation.
  FOREACH v IN ARRAY ARRAY[
    'has_firmwide_assignment_visibility()',
    'has_assignment_on_engagement(uuid)',
    'can_read_engagement_assignments(uuid)'
  ] LOOP
    IF to_regrole('anon') IS NOT NULL
       AND has_function_privilege('anon', 'public.' || v, 'EXECUTE') THEN
      RAISE EXCEPTION 'D5 RLS FAIL — anon retains EXECUTE on public.%', v;
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.' || v, 'EXECUTE') THEN
      RAISE EXCEPTION 'D5 RLS FAIL — authenticated lost EXECUTE on public.%', v;
    END IF;
    IF to_regrole('service_role') IS NOT NULL
       AND has_function_privilege('service_role', 'public.' || v, 'EXECUTE') THEN
      RAISE EXCEPTION 'D5 RLS FAIL — service_role retains EXECUTE on public.% (least-privilege: authenticated only)', v;
    END IF;
    RAISE NOTICE 'PASS — % ACL: anon=false authenticated=true service_role=false', v;
  END LOOP;

  RAISE NOTICE 'D5 RLS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
