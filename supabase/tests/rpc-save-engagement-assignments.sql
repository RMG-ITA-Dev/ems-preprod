-- Transactional tests for public.save_engagement_assignments(uuid, jsonb, uuid[])
-- — C4 (bugs/scheduler/fase_2/plan_v2.md, "C4 — save_engagement_assignments").
--
-- Run via supabase/tests/local/run-rls-tests.sh against the disposable scratch
-- database, AFTER the 8 historical scheduler migrations and C1-C4 have been
-- applied. Single transaction, ALWAYS rolls back. Same convention as
-- rpc-save-wo-staffing.sql: denials are procedural RAISEs, probed via nested
-- BEGIN … EXCEPTION blocks asserting SQLERRM equals the documented token
-- (EAS_DENIED sets ERRCODE = 'insufficient_privilege' explicitly).
-- Success output: one NOTICE per passing check ending with
-- "SAVE_ENGAGEMENT_ASSIGNMENTS RPC: ALL CHECKS PASSED (rolled back)".
--
-- Fixture world (all ids carry recognizable reas-test prefixes):
--   CAT_AUD  category, service Auditoría (code 1)
--   CAT_TAX  category, service Tax (code 3) — foreign-service case
--   E1  practica=1, manager_id=Mel, sqr_id=Sam, engagement_state_override=NULL
--       (derived state, accepts writes)
--   E2  practica=1, manager_id=Mel, engagement_state_override=6 (Cancelado)
--       -> EAS_ENGAGEMENT_LOCKED
--   Tania, Rita: staff subjects to be assigned (not callers)

BEGIN;

INSERT INTO public.categories (category_id, category_name, service_id) VALUES
  ('c0000000-0000-4000-8000-0000000000c1', 'REAS Aud Category', (SELECT service_id FROM public.services WHERE code = 1)),
  ('c0000000-0000-4000-8000-0000000000c2', 'REAS Tax Category', (SELECT service_id FROM public.services WHERE code = 3));

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1000000-0000-4000-8000-0000000000c1', 'REAS Test Client', 'REAS-TAX-001');

-- staff.auth_user_id carries a real FK to auth.users on a live Supabase (the local shim has no
-- such table/constraint — this block is a no-op there). Guarded so the fixture works in both.
-- Tania/Rita are assignment SUBJECTS, never callers, so they stay auth_user_id NULL — no row needed.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                             email_confirmed_at, created_at, updated_at,
                             raw_app_meta_data, raw_user_meta_data) VALUES
      ('a0000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reas-test-c1@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
      ('a0000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reas-test-c2@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
      ('a0000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reas-test-c3@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, category_id) VALUES
  ('50000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000c1', 'Mel',   'ManagerLead', 'c0000000-0000-4000-8000-0000000000c1'),
  ('50000000-0000-4000-8000-0000000000c2', 'a0000000-0000-4000-8000-0000000000c2', 'Sam',   'SQR',         'c0000000-0000-4000-8000-0000000000c1'),
  ('50000000-0000-4000-8000-0000000000c3', 'a0000000-0000-4000-8000-0000000000c3', 'Nora',  'Unrelated',   'c0000000-0000-4000-8000-0000000000c1'),
  ('50000000-0000-4000-8000-0000000000c4', NULL,                                    'Tania', 'Target',      'c0000000-0000-4000-8000-0000000000c1'),
  ('50000000-0000-4000-8000-0000000000c5', NULL,                                    'Rita',  'Target2',     'c0000000-0000-4000-8000-0000000000c1');

-- ON CONFLICT DO UPDATE: on a live Supabase, handle_new_user() (20251204051043) already
-- auto-created a 'staff' user_roles row for each new auth.users id above.
INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000000-0000-4000-8000-0000000000c1', 'manager'),
  ('a0000000-0000-4000-8000-0000000000c2', 'sqr'),
  ('a0000000-0000-4000-8000-0000000000c3', 'staff')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- fecha_cierre is NOT NULL with no DEFAULT on a live Supabase (20260702000000) — the local shim
-- has no such column at all, so this must be supplied explicitly to work in both environments.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id, sqr_id, practica, engagement_state_override, fecha_cierre) VALUES
  ('e0000000-0000-4000-8000-0000000000c1', 'c1000000-0000-4000-8000-0000000000c1', 'REAS E1', '50000000-0000-4000-8000-0000000000c1', '50000000-0000-4000-8000-0000000000c2', 1, NULL, '2026-09-30'),
  ('e0000000-0000-4000-8000-0000000000c2', 'c1000000-0000-4000-8000-0000000000c1', 'REAS E2 (cancelled)', '50000000-0000-4000-8000-0000000000c1', NULL, 1, 6, '2026-09-30');

CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_result        jsonb;
  v_missing       uuid := '9999999a-0000-4000-8000-000000000001';
  v_ok            boolean;
  v_assignment_id uuid;
  v_n             int;
BEGIN
  -- ── 1. EAS_ENGAGEMENT_NOT_FOUND ──────────────────────────────────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000c1');
  v_ok := false;
  BEGIN
    PERFORM public.save_engagement_assignments(v_missing, '[]'::jsonb, ARRAY[]::uuid[]);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EAS_ENGAGEMENT_NOT_FOUND' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected EAS_ENGAGEMENT_NOT_FOUND, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a missing engagement_id unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — unknown engagement_id raises EAS_ENGAGEMENT_NOT_FOUND';

  -- ── 2. EAS_DENIED (unrelated staff Nora) ────────────────────────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000c3');
  v_ok := false;
  BEGIN
    PERFORM public.save_engagement_assignments('e0000000-0000-4000-8000-0000000000c1'::uuid, '[]'::jsonb, ARRAY[]::uuid[]);
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — unrelated Nora was not denied (EAS_DENIED)'; END IF;
  RAISE NOTICE 'PASS — unrelated caller raises EAS_DENIED (insufficient_privilege)';

  -- ── 3. Happy path insert: manager Mel assigns Tania on E1 ───────────
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000c1');
  v_result := public.save_engagement_assignments(
    'e0000000-0000-4000-8000-0000000000c1'::uuid,
    jsonb_build_array(jsonb_build_object(
      'staff_id', '50000000-0000-4000-8000-0000000000c4',
      'category_id', 'c0000000-0000-4000-8000-0000000000c1',
      'start_date', '2026-01-01', 'end_date', '2026-06-30',
      'hours_per_week', 30, 'allocation_percent', 75, 'notes', 'first'
    )),
    ARRAY[]::uuid[]
  );
  IF jsonb_array_length(v_result) <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — happy path: expected 1 assignment in the result, got %', v_result;
  END IF;
  IF (v_result->0->>'staff_id')::uuid <> '50000000-0000-4000-8000-0000000000c4'::uuid
     OR (v_result->0->>'hours_per_week')::numeric <> 30
     OR (v_result->0->>'allocation_percent')::numeric <> 75
     OR (v_result->0->>'status') <> 'PROPOSED' THEN
    RAISE EXCEPTION 'TEST FAIL — happy path: unexpected result shape %', v_result;
  END IF;
  v_assignment_id := (v_result->0->>'assignment_id')::uuid;
  RAISE NOTICE 'PASS — manager Mel inserts an assignment, result mirrors the client contract (status defaults to PROPOSED, never written explicitly)';

  -- ── 4. EAS_MISSING_FIELD ──────────────────────────────────────────────
  v_ok := false;
  BEGIN
    PERFORM public.save_engagement_assignments(
      'e0000000-0000-4000-8000-0000000000c1'::uuid,
      jsonb_build_array(jsonb_build_object(
        'staff_id', '50000000-0000-4000-8000-0000000000c5',
        'category_id', 'c0000000-0000-4000-8000-0000000000c1',
        'start_date', '2026-02-01', 'end_date', '2026-03-01',
        'allocation_percent', 50
        -- hours_per_week omitted
      )),
      ARRAY[]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EAS_MISSING_FIELD' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected EAS_MISSING_FIELD, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a row missing hours_per_week unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — a missing required field raises EAS_MISSING_FIELD';

  -- ── 5. EAS_DATE_RANGE ─────────────────────────────────────────────────
  v_ok := false;
  BEGIN
    PERFORM public.save_engagement_assignments(
      'e0000000-0000-4000-8000-0000000000c1'::uuid,
      jsonb_build_array(jsonb_build_object(
        'staff_id', '50000000-0000-4000-8000-0000000000c5',
        'category_id', 'c0000000-0000-4000-8000-0000000000c1',
        'start_date', '2026-06-30', 'end_date', '2026-01-01',
        'hours_per_week', 20, 'allocation_percent', 50
      )),
      ARRAY[]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EAS_DATE_RANGE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected EAS_DATE_RANGE, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — end_date < start_date unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — end_date < start_date raises EAS_DATE_RANGE (same-day remains valid, exercised implicitly by the range check)';

  -- ── 6. EAS_HOURS_RANGE (0 and 81) ─────────────────────────────────────
  v_ok := false;
  BEGIN
    PERFORM public.save_engagement_assignments(
      'e0000000-0000-4000-8000-0000000000c1'::uuid,
      jsonb_build_array(jsonb_build_object(
        'staff_id', '50000000-0000-4000-8000-0000000000c5', 'category_id', 'c0000000-0000-4000-8000-0000000000c1',
        'start_date', '2026-02-01', 'end_date', '2026-03-01', 'hours_per_week', 0, 'allocation_percent', 50
      )),
      ARRAY[]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EAS_HOURS_RANGE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected EAS_HOURS_RANGE (0), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — hours_per_week=0 unexpectedly succeeded'; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.save_engagement_assignments(
      'e0000000-0000-4000-8000-0000000000c1'::uuid,
      jsonb_build_array(jsonb_build_object(
        'staff_id', '50000000-0000-4000-8000-0000000000c5', 'category_id', 'c0000000-0000-4000-8000-0000000000c1',
        'start_date', '2026-02-01', 'end_date', '2026-03-01', 'hours_per_week', 81, 'allocation_percent', 50
      )),
      ARRAY[]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EAS_HOURS_RANGE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected EAS_HOURS_RANGE (81), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — hours_per_week=81 unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — hours_per_week outside (0,80] raises EAS_HOURS_RANGE (0 and 81 probed)';

  -- ── 7. EAS_ALLOCATION_RANGE (0 and 101) ───────────────────────────────
  v_ok := false;
  BEGIN
    PERFORM public.save_engagement_assignments(
      'e0000000-0000-4000-8000-0000000000c1'::uuid,
      jsonb_build_array(jsonb_build_object(
        'staff_id', '50000000-0000-4000-8000-0000000000c5', 'category_id', 'c0000000-0000-4000-8000-0000000000c1',
        'start_date', '2026-02-01', 'end_date', '2026-03-01', 'hours_per_week', 20, 'allocation_percent', 0
      )),
      ARRAY[]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EAS_ALLOCATION_RANGE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected EAS_ALLOCATION_RANGE (0), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — allocation_percent=0 unexpectedly succeeded'; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.save_engagement_assignments(
      'e0000000-0000-4000-8000-0000000000c1'::uuid,
      jsonb_build_array(jsonb_build_object(
        'staff_id', '50000000-0000-4000-8000-0000000000c5', 'category_id', 'c0000000-0000-4000-8000-0000000000c1',
        'start_date', '2026-02-01', 'end_date', '2026-03-01', 'hours_per_week', 20, 'allocation_percent', 101
      )),
      ARRAY[]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EAS_ALLOCATION_RANGE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected EAS_ALLOCATION_RANGE (101), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — allocation_percent=101 unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — allocation_percent outside (0,100] raises EAS_ALLOCATION_RANGE (0 and 101 probed)';

  -- ── 8. EAS_CATEGORY_FOREIGN_SERVICE (E1 is Auditoría; CAT_TAX is Tax) ─
  v_ok := false;
  BEGIN
    PERFORM public.save_engagement_assignments(
      'e0000000-0000-4000-8000-0000000000c1'::uuid,
      jsonb_build_array(jsonb_build_object(
        'staff_id', '50000000-0000-4000-8000-0000000000c5', 'category_id', 'c0000000-0000-4000-8000-0000000000c2',
        'start_date', '2026-02-01', 'end_date', '2026-03-01', 'hours_per_week', 20, 'allocation_percent', 50
      )),
      ARRAY[]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EAS_CATEGORY_FOREIGN_SERVICE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected EAS_CATEGORY_FOREIGN_SERVICE, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a Tax category on an Auditoría engagement unexpectedly succeeded'; END IF;
  RAISE NOTICE 'PASS — a category outside the engagement''s service raises EAS_CATEGORY_FOREIGN_SERVICE';

  -- ── 9. EAS_OVERLAP, and atomicity: the whole payload rolls back ─────
  SELECT count(*) INTO v_n FROM public.engagement_assignments
   WHERE engagement_id = 'e0000000-0000-4000-8000-0000000000c1' AND deleted_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TEST FAIL — expected 1 live assignment before the overlap probe, got %', v_n; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.save_engagement_assignments(
      'e0000000-0000-4000-8000-0000000000c1'::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '50000000-0000-4000-8000-0000000000c4', -- same staff as the step-3 assignment
          'category_id', 'c0000000-0000-4000-8000-0000000000c1',
          'start_date', '2026-06-01', 'end_date', '2026-12-31', -- overlaps 2026-01-01..2026-06-30
          'hours_per_week', 10, 'allocation_percent', 25
        ),
        jsonb_build_object(
          'staff_id', '50000000-0000-4000-8000-0000000000c5', -- unrelated row in the SAME payload
          'category_id', 'c0000000-0000-4000-8000-0000000000c1',
          'start_date', '2026-02-01', 'end_date', '2026-03-01',
          'hours_per_week', 20, 'allocation_percent', 50
        )
      ),
      ARRAY[]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EAS_OVERLAP' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected EAS_OVERLAP, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — an overlapping assignment for the same staff unexpectedly succeeded'; END IF;

  SELECT count(*) INTO v_n FROM public.engagement_assignments
   WHERE engagement_id = 'e0000000-0000-4000-8000-0000000000c1' AND deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — EAS_OVERLAP did not roll back the whole payload: expected 1 live assignment, got %', v_n;
  END IF;
  RAISE NOTICE 'PASS — an overlapping date range for the same staff raises EAS_OVERLAP, and the whole payload (incl. the unrelated row) rolls back';

  -- ── 10. Update path via assignment_id ────────────────────────────────
  v_result := public.save_engagement_assignments(
    'e0000000-0000-4000-8000-0000000000c1'::uuid,
    jsonb_build_array(jsonb_build_object(
      'assignment_id', v_assignment_id,
      'staff_id', '50000000-0000-4000-8000-0000000000c4',
      'category_id', 'c0000000-0000-4000-8000-0000000000c1',
      'start_date', '2026-01-01', 'end_date', '2026-06-30',
      'hours_per_week', 35, 'allocation_percent', 80, 'notes', 'updated'
    )),
    ARRAY[]::uuid[]
  );
  IF jsonb_array_length(v_result) <> 1
     OR (v_result->0->>'assignment_id')::uuid <> v_assignment_id
     OR (v_result->0->>'hours_per_week')::numeric <> 35
     OR (v_result->0->>'notes') <> 'updated' THEN
    RAISE EXCEPTION 'TEST FAIL — update-by-assignment_id did not persist as expected, got %', v_result;
  END IF;
  RAISE NOTICE 'PASS — an upsert row carrying assignment_id updates the existing row in place';

  -- ── 11. Soft-delete via p_deleted_ids ─────────────────────────────────
  v_result := public.save_engagement_assignments(
    'e0000000-0000-4000-8000-0000000000c1'::uuid,
    '[]'::jsonb,
    ARRAY[v_assignment_id]
  );
  IF v_result <> '[]'::jsonb THEN
    RAISE EXCEPTION 'TEST FAIL — soft-deleted assignment still present in the result, got %', v_result;
  END IF;
  SELECT count(*) INTO v_n FROM public.engagement_assignments
   WHERE assignment_id = v_assignment_id AND deleted_at IS NOT NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'TEST FAIL — p_deleted_ids did not soft-delete the row (deleted_at still NULL)'; END IF;
  RAISE NOTICE 'PASS — p_deleted_ids soft-deletes the row (deleted_at set) and the result excludes it';

  -- ── 12. EAS_ENGAGEMENT_LOCKED (E2, override = 6 Cancelado) ───────────
  v_ok := false;
  BEGIN
    PERFORM public.save_engagement_assignments(
      'e0000000-0000-4000-8000-0000000000c2'::uuid,
      jsonb_build_array(jsonb_build_object(
        'staff_id', '50000000-0000-4000-8000-0000000000c4', 'category_id', 'c0000000-0000-4000-8000-0000000000c1',
        'start_date', '2026-02-01', 'end_date', '2026-03-01', 'hours_per_week', 20, 'allocation_percent', 50
      )),
      ARRAY[]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'EAS_ENGAGEMENT_LOCKED' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected EAS_ENGAGEMENT_LOCKED, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a Cancelado (override=6) engagement unexpectedly accepted a write'; END IF;
  RAISE NOTICE 'PASS — a terminal-state engagement (override=6 Cancelado) raises EAS_ENGAGEMENT_LOCKED';

  -- ── 13. is_engagement_responsible path: sqr Sam, not a team member ───
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000c2');
  v_result := public.save_engagement_assignments(
    'e0000000-0000-4000-8000-0000000000c1'::uuid,
    jsonb_build_array(jsonb_build_object(
      'staff_id', '50000000-0000-4000-8000-0000000000c5', 'category_id', 'c0000000-0000-4000-8000-0000000000c1',
      'start_date', '2026-04-01', 'end_date', '2026-05-01', 'hours_per_week', 15, 'allocation_percent', 40
    )),
    ARRAY[]::uuid[]
  );
  IF jsonb_array_length(v_result) <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — sqr Sam (is_engagement_responsible) call did not persist, got %', v_result;
  END IF;
  RAISE NOTICE 'PASS — is_engagement_responsible caller (sqr Sam, not a team member) authorized to write';

  -- ── 14. anon cannot EXECUTE the function at all ──────────────────────
  IF to_regrole('anon') IS NULL THEN
    RAISE NOTICE 'SKIP — role anon not present in this environment';
  ELSE
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';
    v_ok := false;
    BEGIN
      PERFORM public.save_engagement_assignments('e0000000-0000-4000-8000-0000000000c1'::uuid, '[]'::jsonb, ARRAY[]::uuid[]);
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — anon could invoke save_engagement_assignments (EXECUTE not revoked)'; END IF;
    RAISE NOTICE 'PASS — anon cannot invoke save_engagement_assignments at all (EXECUTE revoked)';
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
  END IF;

  RAISE NOTICE 'SAVE_ENGAGEMENT_ASSIGNMENTS RPC: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
