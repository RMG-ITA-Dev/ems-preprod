-- Transactional tests for public.save_wo_staffing(uuid, jsonb) — C3
-- (bugs/scheduler/fase_2/plan_v2.md, "C3 — save_wo_staffing").
--
-- Run via supabase/tests/local/run-rls-tests.sh against the disposable scratch
-- database, AFTER the 8 historical scheduler migrations and C1-C4 have been
-- applied. Single transaction, ALWAYS rolls back. Denials are procedural
-- RAISEs (not RLS insufficient_privilege, except WOS_DENIED which sets
-- ERRCODE = 'insufficient_privilege' explicitly) — probes use nested
-- BEGIN … EXCEPTION blocks asserting SQLERRM equals the documented token
-- (same convention as rls-timesheet-authorization-phase5.sql's RPC probes).
-- Success output: one NOTICE per passing check ending with
-- "SAVE_WO_STAFFING RPC: ALL CHECKS PASSED (rolled back)".
--
-- Fixture world (all ids carry recognizable rws-test prefixes):
--   CAT_AUD  category, service Auditoría (code 1)
--   CAT_TAX  category, service Tax (code 3) — used for the foreign-service case
--   E1  practica=1 (Auditoría), manager_id=Mel, sqr_id=Sam
--   WO1 on E1, approval_status = Draft (default)
--   WO2 on E1's sibling E2 (same manager Mel, so authorization is a
--       non-issue there), approval_status = Approved -> WOS_WO_LOCKED
--   SK1 skill

BEGIN;

INSERT INTO public.categories (category_id, category_name, service_id) VALUES
  ('c0000000-0000-4000-8000-0000000000b1', 'RWS Aud Category', (SELECT service_id FROM public.services WHERE code = 1)),
  ('c0000000-0000-4000-8000-0000000000b2', 'RWS Tax Category', (SELECT service_id FROM public.services WHERE code = 3));

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1000000-0000-4000-8000-0000000000b1', 'RWS Test Client', 'RWS-TAX-001');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, category_id) VALUES
  ('50000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-0000000000b1', 'Mel',  'ManagerLead', 'c0000000-0000-4000-8000-0000000000b1'),
  ('50000000-0000-4000-8000-0000000000b2', 'a0000000-0000-4000-8000-0000000000b2', 'Sam',  'SQR',         'c0000000-0000-4000-8000-0000000000b1'),
  ('50000000-0000-4000-8000-0000000000b3', 'a0000000-0000-4000-8000-0000000000b3', 'Nora', 'Unrelated',   'c0000000-0000-4000-8000-0000000000b1');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000000-0000-4000-8000-0000000000b1', 'manager'),
  ('a0000000-0000-4000-8000-0000000000b2', 'sqr'),
  ('a0000000-0000-4000-8000-0000000000b3', 'staff');

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id, sqr_id, practica) VALUES
  ('e0000000-0000-4000-8000-0000000000b1', 'c1000000-0000-4000-8000-0000000000b1', 'RWS E1', '50000000-0000-4000-8000-0000000000b1', '50000000-0000-4000-8000-0000000000b2', 1),
  ('e0000000-0000-4000-8000-0000000000b2', 'c1000000-0000-4000-8000-0000000000b1', 'RWS E2 (locked)', '50000000-0000-4000-8000-0000000000b1', NULL, 1);

INSERT INTO public.work_orders (wo_id, engagement_id, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', 'Draft'),
  ('40000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000b2', 'Approved');

INSERT INTO public.skills (skill_id, name, category) VALUES
  ('20000000-0000-4000-8000-0000000000b1', 'RWS Skill', 'framework');

CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_result   jsonb;
  v_missing  uuid := '9999999a-0000-4000-8000-000000000000';
  v_ok       boolean;
BEGIN
  -- ── 1. WOS_WO_NOT_FOUND ──────────────────────────────────────────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000b1');
  v_ok := false;
  BEGIN
    PERFORM public.save_wo_staffing(v_missing, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WOS_WO_NOT_FOUND' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WOS_WO_NOT_FOUND, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — save_wo_staffing on a missing wo_id unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — unknown wo_id raises WOS_WO_NOT_FOUND';

  -- ── 2. WOS_DENIED (unrelated staff Nora on WO1) ─────────────────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000b3');
  v_ok := false;
  BEGIN
    PERFORM public.save_wo_staffing('40000000-0000-4000-8000-0000000000b1'::uuid, '[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — unrelated Nora was not denied (WOS_DENIED)'; END IF;
  RAISE NOTICE 'PASS — unrelated caller raises WOS_DENIED (insufficient_privilege)';

  -- ── 3. Happy path: manager Mel, one requirement + one skill ─────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000b1');
  v_result := public.save_wo_staffing(
    '40000000-0000-4000-8000-0000000000b1'::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'category_id', 'c0000000-0000-4000-8000-0000000000b1',
        'staff_count', 2,
        'skills', jsonb_build_array(
          jsonb_build_object('skill_id', '20000000-0000-4000-8000-0000000000b1', 'min_proficiency_level', 'Advanced')
        )
      )
    )
  );
  IF jsonb_array_length(v_result) <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — happy path: expected 1 requirement in the result, got %', v_result;
  END IF;
  IF (v_result->0->>'staff_count')::int <> 2
     OR (v_result->0->>'category_id')::uuid <> 'c0000000-0000-4000-8000-0000000000b1'::uuid
     OR jsonb_array_length(v_result->0->'skills') <> 1
     OR (v_result->0->'skills'->0->>'min_proficiency_level') <> 'Advanced' THEN
    RAISE EXCEPTION 'TEST FAIL — happy path: unexpected result shape %', v_result;
  END IF;
  RAISE NOTICE 'PASS — manager Mel persists a requirement + skill, result mirrors the client contract';

  -- ── 4. is_engagement_responsible path: sqr Sam, not a team member ───
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000b2');
  v_result := public.save_wo_staffing(
    '40000000-0000-4000-8000-0000000000b1'::uuid,
    jsonb_build_array(
      jsonb_build_object('category_id', 'c0000000-0000-4000-8000-0000000000b1', 'staff_count', 3, 'skills', '[]'::jsonb)
    )
  );
  IF (v_result->0->>'staff_count')::int <> 3 THEN
    RAISE EXCEPTION 'TEST FAIL — sqr Sam call did not persist (expected staff_count=3), got %', v_result;
  END IF;
  -- State-complete contract: omitting the skill from this call deletes it.
  IF jsonb_array_length(v_result->0->'skills') <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL — sqr Sam call did not clear the omitted skill (state-complete contract), got %', v_result;
  END IF;
  RAISE NOTICE 'PASS — is_engagement_responsible caller (sqr Sam) authorized, state-complete payload clears omitted skill';

  -- ── 5. WOS_REQUIREMENT_DUPLICATE ─────────────────────────────────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000b1');
  v_ok := false;
  BEGIN
    PERFORM public.save_wo_staffing(
      '40000000-0000-4000-8000-0000000000b1'::uuid,
      jsonb_build_array(
        jsonb_build_object('category_id', 'c0000000-0000-4000-8000-0000000000b1', 'staff_count', 1, 'skills', '[]'::jsonb),
        jsonb_build_object('category_id', 'c0000000-0000-4000-8000-0000000000b1', 'staff_count', 2, 'skills', '[]'::jsonb)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WOS_REQUIREMENT_DUPLICATE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WOS_REQUIREMENT_DUPLICATE, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — duplicate category_id in payload unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — duplicate category_id in the payload raises WOS_REQUIREMENT_DUPLICATE';

  -- ── 6. WOS_STAFF_COUNT_RANGE (0 and 1000) ────────────────────────────
  v_ok := false;
  BEGIN
    PERFORM public.save_wo_staffing(
      '40000000-0000-4000-8000-0000000000b1'::uuid,
      jsonb_build_array(jsonb_build_object('category_id', 'c0000000-0000-4000-8000-0000000000b1', 'staff_count', 0, 'skills', '[]'::jsonb))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WOS_STAFF_COUNT_RANGE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WOS_STAFF_COUNT_RANGE (0), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — staff_count=0 unexpectedly succeeded'; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.save_wo_staffing(
      '40000000-0000-4000-8000-0000000000b1'::uuid,
      jsonb_build_array(jsonb_build_object('category_id', 'c0000000-0000-4000-8000-0000000000b1', 'staff_count', 1000, 'skills', '[]'::jsonb))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WOS_STAFF_COUNT_RANGE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WOS_STAFF_COUNT_RANGE (1000), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — staff_count=1000 unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — staff_count outside [1,999] raises WOS_STAFF_COUNT_RANGE (0 and 1000 probed)';

  -- ── 7. WOS_CATEGORY_FOREIGN_SERVICE (E1 is Auditoría; CAT_TAX is Tax) ─
  v_ok := false;
  BEGIN
    PERFORM public.save_wo_staffing(
      '40000000-0000-4000-8000-0000000000b1'::uuid,
      jsonb_build_array(jsonb_build_object('category_id', 'c0000000-0000-4000-8000-0000000000b2', 'staff_count', 1, 'skills', '[]'::jsonb))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WOS_CATEGORY_FOREIGN_SERVICE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WOS_CATEGORY_FOREIGN_SERVICE, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a Tax category on an Auditoría engagement unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — a category outside the engagement''s service raises WOS_CATEGORY_FOREIGN_SERVICE';

  -- ── 8. WOS_SKILL_DUPLICATE ────────────────────────────────────────────
  v_ok := false;
  BEGIN
    PERFORM public.save_wo_staffing(
      '40000000-0000-4000-8000-0000000000b1'::uuid,
      jsonb_build_array(jsonb_build_object(
        'category_id', 'c0000000-0000-4000-8000-0000000000b1', 'staff_count', 1,
        'skills', jsonb_build_array(
          jsonb_build_object('skill_id', '20000000-0000-4000-8000-0000000000b1', 'min_proficiency_level', 'Advanced'),
          jsonb_build_object('skill_id', '20000000-0000-4000-8000-0000000000b1', 'min_proficiency_level', 'Beginner')
        )
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WOS_SKILL_DUPLICATE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WOS_SKILL_DUPLICATE, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — duplicate skill_id within one requirement unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — duplicate skill_id within a requirement raises WOS_SKILL_DUPLICATE';

  -- ── 9. WOS_PROFICIENCY_INVALID ────────────────────────────────────────
  v_ok := false;
  BEGIN
    PERFORM public.save_wo_staffing(
      '40000000-0000-4000-8000-0000000000b1'::uuid,
      jsonb_build_array(jsonb_build_object(
        'category_id', 'c0000000-0000-4000-8000-0000000000b1', 'staff_count', 1,
        'skills', jsonb_build_array(
          jsonb_build_object('skill_id', '20000000-0000-4000-8000-0000000000b1', 'min_proficiency_level', 'Expert')
        )
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WOS_PROFICIENCY_INVALID' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WOS_PROFICIENCY_INVALID, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — an out-of-enum proficiency level unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — an out-of-enum min_proficiency_level raises WOS_PROFICIENCY_INVALID';

  -- ── 10. WOS_WO_LOCKED (WO2, approval_status = Approved) ──────────────
  v_ok := false;
  BEGIN
    PERFORM public.save_wo_staffing('40000000-0000-4000-8000-0000000000b2'::uuid, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WOS_WO_LOCKED' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WOS_WO_LOCKED, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — an Approved work order unexpectedly accepted a staffing write'; END IF;
  RAISE NOTICE 'PASS — a non-Draft work order (Approved) raises WOS_WO_LOCKED';

  -- ── 11. Deletion semantics: an empty payload clears everything ───────
  v_result := public.save_wo_staffing('40000000-0000-4000-8000-0000000000b1'::uuid, '[]'::jsonb);
  IF v_result <> '[]'::jsonb THEN
    RAISE EXCEPTION 'TEST FAIL — an empty payload did not clear all requirements, got %', v_result;
  END IF;
  RAISE NOTICE 'PASS — an empty payload deletes every previously-persisted requirement (state-complete contract)';

  -- ── 12. anon cannot EXECUTE the function at all (ACL, not the RPC's
  --     own authorization check) ───────────────────────────────────────
  IF to_regrole('anon') IS NULL THEN
    RAISE NOTICE 'SKIP — role anon not present in this environment';
  ELSE
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';
    v_ok := false;
    BEGIN
      PERFORM public.save_wo_staffing('40000000-0000-4000-8000-0000000000b1'::uuid, '[]'::jsonb);
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — anon could invoke save_wo_staffing (EXECUTE not revoked)'; END IF;
    RAISE NOTICE 'PASS — anon cannot invoke save_wo_staffing at all (EXECUTE revoked)';
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
  END IF;

  RAISE NOTICE 'SAVE_WO_STAFFING RPC: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
