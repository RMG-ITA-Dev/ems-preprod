-- Per-role leakage/authorization tests for the C1 wo_staffing_requirements /
-- wo_staffing_requirement_skills RLS matrix (bugs/scheduler/fase_2/plan_v2.md,
-- "C1 — RLS y grants canónicos", closes G2: the two historical
-- `FOR SELECT ... USING (true)` policies).
--
-- Run via supabase/tests/local/run-rls-tests.sh against the disposable scratch
-- database, AFTER the 8 historical scheduler migrations and C1-C4 have been
-- applied (see the harness's "Lane 4" section). The script is a single
-- transaction that ALWAYS rolls back: it inserts throwaway fixtures,
-- impersonates each persona via request.jwt.claims, asserts exactly what each
-- may see/write, and raises an exception on any leak or unexpected denial.
-- Success output: one NOTICE per passing check ending with
-- "WO STAFFING RLS: ALL CHECKS PASSED (rolled back)".
--
-- Fixture world (all ids carry recognizable wr-test prefixes):
--   E1  practica=1 (Auditoría), manager_id=Mel, sqr_id=Sam
--   E2  foreign engagement, unrelated manager, practica=1
--   WO1 on E1, WO2 on E2 (both Draft)
--   R1  on WO1 (category CAT_AUD); R2 on WO2 (category CAT_AUD)
--   SK1 skill on R1
--   Val holds a live engagement_assignments row on E1 (assigned, not
--     team member, not responsible) — exercises has_assignment_on_engagement,
--     the one persona the C1 wo_staffing_req_select/write matrix treats
--     asymmetrically (read-only: has_assignment_on_engagement grants SELECT
--     but is deliberately absent from the write policies).
--
-- Matrix under test (wo_staffing_req_select/insert/update/delete, mirrored by
-- the *_skills 2-hop join policies):
--   admin                                          -> read all, write all
--   partner (has_firmwide_assignment_visibility)   -> read all, write NONE
--   manager Mel (is_engagement_team_member of E1)  -> read E1, write E1
--   senior  Sam (is_engagement_responsible via sqr_id) -> read E1, write E1
--   senior  Val (has_assignment_on_engagement only)-> read E1, write NONE
--   staff   Nora (no relation)                     -> read/write NONE
--   anon                                            -> hard permission error

BEGIN;

-- ── Fixtures (as postgres; RLS does not bind the table owner) ─────────
INSERT INTO public.categories (category_id, category_name, service_id) VALUES
  ('c0000000-0000-4000-8000-0000000000a1', 'WR Test Category',
   (SELECT service_id FROM public.services WHERE code = 1));

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1000000-0000-4000-8000-0000000000a1', 'WR Test Client', 'WR-TAX-001');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, category_id) VALUES
  ('50000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000a1', 'Ann',  'Admin',      'c0000000-0000-4000-8000-0000000000a1'),
  ('50000000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-0000000000a2', 'Pat',  'Partner',    'c0000000-0000-4000-8000-0000000000a1'),
  ('50000000-0000-4000-8000-0000000000a3', 'a0000000-0000-4000-8000-0000000000a3', 'Mel',  'ManagerLead','c0000000-0000-4000-8000-0000000000a1'),
  ('50000000-0000-4000-8000-0000000000a4', 'a0000000-0000-4000-8000-0000000000a4', 'Sam',  'SQR',        'c0000000-0000-4000-8000-0000000000a1'),
  ('50000000-0000-4000-8000-0000000000a5', 'a0000000-0000-4000-8000-0000000000a5', 'Val',  'AssignedOnly','c0000000-0000-4000-8000-0000000000a1'),
  ('50000000-0000-4000-8000-0000000000a6', 'a0000000-0000-4000-8000-0000000000a6', 'Nora', 'Unrelated',  'c0000000-0000-4000-8000-0000000000a1'),
  ('50000000-0000-4000-8000-0000000000a7', NULL,                                    'Otto', 'ForeignLead','c0000000-0000-4000-8000-0000000000a1');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000000-0000-4000-8000-0000000000a1', 'admin'),
  ('a0000000-0000-4000-8000-0000000000a2', 'partner'),
  ('a0000000-0000-4000-8000-0000000000a3', 'manager'),
  ('a0000000-0000-4000-8000-0000000000a4', 'sqr'),
  ('a0000000-0000-4000-8000-0000000000a5', 'senior'),
  ('a0000000-0000-4000-8000-0000000000a6', 'staff');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id, sqr_id, practica) VALUES
  ('e0000000-0000-4000-8000-0000000000a1', 'c1000000-0000-4000-8000-0000000000a1', 'WR E1',
   '50000000-0000-4000-8000-0000000000a3', '50000000-0000-4000-8000-0000000000a4', 1),
  ('e0000000-0000-4000-8000-0000000000a2', 'c1000000-0000-4000-8000-0000000000a1', 'WR E2 (foreign)',
   '50000000-0000-4000-8000-0000000000a7', NULL, 1);

INSERT INTO public.work_orders (wo_id, engagement_id) VALUES
  ('40000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-0000000000a1'),
  ('40000000-0000-4000-8000-0000000000a2', 'e0000000-0000-4000-8000-0000000000a2');

INSERT INTO public.wo_staffing_requirements (id, wo_id, category_id, staff_count) VALUES
  ('30000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a1', 'c0000000-0000-4000-8000-0000000000a1', 2),
  ('30000000-0000-4000-8000-0000000000a2', '40000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-0000000000a1', 1);

INSERT INTO public.skills (skill_id, name, category) VALUES
  ('20000000-0000-4000-8000-0000000000a1', 'WR Test Skill', 'framework');

INSERT INTO public.wo_staffing_requirement_skills (requirement_id, skill_id, min_proficiency_level) VALUES
  ('30000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'Advanced');

-- Val: live assignment on E1, not a team member nor responsible.
INSERT INTO public.engagement_assignments
  (assignment_id, engagement_id, staff_id, category_id, start_date, end_date, deleted_at) VALUES
  ('aa000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-0000000000a1',
   '50000000-0000-4000-8000-0000000000a5', 'c0000000-0000-4000-8000-0000000000a1',
   '2026-01-01', '2026-12-31', NULL);

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
  denied boolean;
BEGIN
  -- All row-count assertions are scoped to the two fixture work orders, so
  -- the suite stays deterministic on a database that already has real rows.

  -- ── admin: reads everything, writes everything ──────────────────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000a1');
  SELECT count(*) INTO n FROM public.wo_staffing_requirements
   WHERE wo_id IN ('40000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000a2');
  IF n <> 2 THEN RAISE EXCEPTION 'WR RLS FAIL — admin: expected 2 fixture rows, got %', n; END IF;
  UPDATE public.wo_staffing_requirements SET staff_count = 3
   WHERE id = '30000000-0000-4000-8000-0000000000a2'; -- foreign requirement (R2)
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WR RLS FAIL — admin could not write a foreign-engagement requirement'; END IF;
  RAISE NOTICE 'PASS — admin reads all fixture rows and writes across engagements';

  -- ── partner: firmwide READ, but no write (not admin/team/responsible) ──
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000a2');
  SELECT count(*) INTO n FROM public.wo_staffing_requirements
   WHERE wo_id IN ('40000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000a2');
  IF n <> 2 THEN RAISE EXCEPTION 'WR RLS FAIL — partner: expected 2 fixture rows (firmwide read), got %', n; END IF;
  UPDATE public.wo_staffing_requirements SET staff_count = 9
   WHERE id = '30000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WR RLS FAIL — partner (non-admin, non-responsible) could write a requirement'; END IF;
  RAISE NOTICE 'PASS — partner reads firmwide but cannot write without admin/team/responsible';

  -- ── manager Mel: structural team member of E1 (no role gate on this
  --    matrix, unlike D5's lead rule) — reads and writes E1 only ────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000a3');
  SELECT count(*) INTO n FROM public.wo_staffing_requirements WHERE id = '30000000-0000-4000-8000-0000000000a1';
  IF n <> 1 THEN RAISE EXCEPTION 'WR RLS FAIL — manager Mel: expected to see R1 (E1), got %', n; END IF;
  SELECT count(*) INTO n FROM public.wo_staffing_requirements WHERE id = '30000000-0000-4000-8000-0000000000a2';
  IF n <> 0 THEN RAISE EXCEPTION 'WR RLS FAIL — manager Mel cross-engagement leakage: sees R2 (E2)'; END IF;
  UPDATE public.wo_staffing_requirements SET staff_count = 5 WHERE id = '30000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WR RLS FAIL — manager Mel could not write R1 (own engagement)'; END IF;
  UPDATE public.wo_staffing_requirements SET staff_count = 5 WHERE id = '30000000-0000-4000-8000-0000000000a2';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WR RLS FAIL — manager Mel wrote a foreign-engagement requirement (R2)'; END IF;
  RAISE NOTICE 'PASS — manager Mel (team member of E1) reads/writes E1 only';

  -- ── senior Sam: is_engagement_responsible via sqr_id — reads and writes
  --    E1 only (closes G7: sqr had no coverage before C1) ───────────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000a4');
  SELECT count(*) INTO n FROM public.wo_staffing_requirements WHERE id = '30000000-0000-4000-8000-0000000000a1';
  IF n <> 1 THEN RAISE EXCEPTION 'WR RLS FAIL — sqr Sam: expected to see R1 (E1, responsible), got %', n; END IF;
  SELECT count(*) INTO n FROM public.wo_staffing_requirements WHERE id = '30000000-0000-4000-8000-0000000000a2';
  IF n <> 0 THEN RAISE EXCEPTION 'WR RLS FAIL — sqr Sam cross-engagement leakage: sees R2 (E2)'; END IF;
  UPDATE public.wo_staffing_requirements SET staff_count = 4 WHERE id = '30000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WR RLS FAIL — sqr Sam could not write R1 (is_engagement_responsible)'; END IF;
  RAISE NOTICE 'PASS — sqr Sam (is_engagement_responsible on E1) reads/writes E1 only';

  -- ── senior Val: has_assignment_on_engagement ONLY — SELECT yes, write NO.
  --    This is the deliberate read/write asymmetry the C1 matrix carries:
  --    has_assignment_on_engagement appears in wo_staffing_req_select but
  --    NOT in the insert/update/delete policies. ────────────────────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000a5');
  SELECT count(*) INTO n FROM public.wo_staffing_requirements WHERE id = '30000000-0000-4000-8000-0000000000a1';
  IF n <> 1 THEN RAISE EXCEPTION 'WR RLS FAIL — assigned-only Val: expected to see R1 (own assignment''s engagement), got %', n; END IF;
  UPDATE public.wo_staffing_requirements SET staff_count = 7 WHERE id = '30000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WR RLS FAIL — assigned-only Val could write R1 (has_assignment_on_engagement must NOT grant write)'; END IF;
  RAISE NOTICE 'PASS — assigned-only Val reads via has_assignment_on_engagement but cannot write';

  -- ── staff Nora: no relation to E1 or E2 — denied entirely ───────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000a6');
  SELECT count(*) INTO n FROM public.wo_staffing_requirements
   WHERE wo_id IN ('40000000-0000-4000-8000-0000000000a1','40000000-0000-4000-8000-0000000000a2');
  IF n <> 0 THEN RAISE EXCEPTION 'WR RLS FAIL — unrelated Nora: expected 0 rows, got %', n; END IF;
  UPDATE public.wo_staffing_requirements SET staff_count = 1 WHERE id = '30000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WR RLS FAIL — unrelated Nora wrote a requirement'; END IF;
  RAISE NOTICE 'PASS — unrelated staff denied read and write';

  -- ── wo_staffing_requirement_skills: same matrix through the 2-hop join
  --    (requirement_id -> wo_staffing_requirements -> work_orders) ─────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000a3'); -- Mel
  SELECT count(*) INTO n FROM public.wo_staffing_requirement_skills
   WHERE requirement_id = '30000000-0000-4000-8000-0000000000a1';
  IF n <> 1 THEN RAISE EXCEPTION 'WR RLS FAIL — manager Mel: expected to see SK1 via 2-hop join, got %', n; END IF;
  UPDATE public.wo_staffing_requirement_skills SET min_proficiency_level = 'Intermediate'
   WHERE requirement_id = '30000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WR RLS FAIL — manager Mel could not write SK1 via 2-hop join'; END IF;

  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000a5'); -- Val, assigned-only
  SELECT count(*) INTO n FROM public.wo_staffing_requirement_skills
   WHERE requirement_id = '30000000-0000-4000-8000-0000000000a1';
  IF n <> 1 THEN RAISE EXCEPTION 'WR RLS FAIL — assigned-only Val: expected to see SK1 (read), got %', n; END IF;
  UPDATE public.wo_staffing_requirement_skills SET min_proficiency_level = 'Beginner'
   WHERE requirement_id = '30000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'WR RLS FAIL — assigned-only Val could write SK1 (2-hop join write must stay denied)'; END IF;

  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000a6'); -- Nora, unrelated
  SELECT count(*) INTO n FROM public.wo_staffing_requirement_skills
   WHERE requirement_id = '30000000-0000-4000-8000-0000000000a1';
  IF n <> 0 THEN RAISE EXCEPTION 'WR RLS FAIL — unrelated Nora sees SK1 via 2-hop join'; END IF;
  RAISE NOTICE 'PASS — wo_staffing_requirement_skills 2-hop join mirrors the parent matrix';

  -- ── anon: table grant revoked (C1 §4) → hard permission error ───────
  IF to_regrole('anon') IS NULL THEN
    RAISE NOTICE 'SKIP — role anon not present in this environment';
  ELSE
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';

    denied := false;
    BEGIN
      SELECT count(*) INTO n FROM public.wo_staffing_requirements;
    EXCEPTION WHEN insufficient_privilege THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'WR RLS FAIL — anon can still query wo_staffing_requirements (% rows)', n;
    END IF;

    denied := false;
    BEGIN
      SELECT count(*) INTO n FROM public.wo_staffing_requirement_skills;
    EXCEPTION WHEN insufficient_privilege THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'WR RLS FAIL — anon can still query wo_staffing_requirement_skills (% rows)', n;
    END IF;
    RAISE NOTICE 'PASS — anon hard-denied on both staffing tables';

    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
  END IF;

  -- ── G2 regression guard: zero USING(true)-shaped policies survive on
  --    either table (the historical #1/#5 leftovers C1 was written to
  --    replace) ──────────────────────────────────────────────────────
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('wo_staffing_requirements', 'wo_staffing_requirement_skills')
     AND qual = 'true';
  IF n <> 0 THEN
    RAISE EXCEPTION 'WR RLS FAIL — G2 regression: % USING(true)-shaped polic(y/ies) survive on the staffing tables', n;
  END IF;
  RAISE NOTICE 'PASS — G2 closed: zero USING(true) policies on wo_staffing_requirements/_skills';

  RAISE NOTICE 'WO STAFFING RLS: ALL CHECKS PASSED (rolled back)';
END $$;

-- ── C1 §3b regression: engagement_assignments write/read extension for
--    is_engagement_responsible (fixed live while designing this suite —
--    see 20260727100000_scheduler_fase2_rls_grants.sql for the bug this
--    guards against: is_engagement_responsible()=true but
--    can_read_engagement_assignments()=false made the original extension
--    dead code for a pure sqr/encargado/specialist_it/specialist_tax
--    responsible with no other qualifying role). ─────────────────────────
DO $$
DECLARE
  n int;
BEGIN
  -- Sam: role 'sqr', responsible via sqr_id on E1, NOT a team member, NOT
  -- (yet) senior-with-assignment — the exact persona the bug denied outright.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000a4');

  SELECT count(*) INTO n FROM public.engagement_assignments WHERE engagement_id = 'e0000000-0000-4000-8000-0000000000a1';
  IF n <> 1 THEN RAISE EXCEPTION 'WR RLS FAIL — sqr Sam: expected to see the 1 fixture assignment on E1 (ea_select_responsible), got %', n; END IF;

  INSERT INTO public.engagement_assignments (engagement_id, staff_id, category_id, start_date, end_date)
  VALUES ('e0000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-0000000000a4',
          'c0000000-0000-4000-8000-0000000000a1', '2026-02-01', '2026-05-31');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'WR RLS FAIL — sqr Sam could not insert their own assignment via is_engagement_responsible'; END IF;

  -- Cross-engagement: Sam is not responsible for E2 — must stay denied.
  SELECT count(*) INTO n FROM public.engagement_assignments WHERE engagement_id = 'e0000000-0000-4000-8000-0000000000a2';
  IF n <> 0 THEN RAISE EXCEPTION 'WR RLS FAIL — sqr Sam sees E2 assignments (not responsible there)'; END IF;

  RAISE NOTICE 'PASS — sqr-only responsible (Sam) reads and writes engagement_assignments on E1 via C1 §3b fix, denied on foreign E2';
END $$;

ROLLBACK;
