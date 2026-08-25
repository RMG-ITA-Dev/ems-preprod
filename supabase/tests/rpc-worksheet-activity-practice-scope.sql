-- Transactional tests for the 0825-183 hardening of
-- enforce_worksheet_cell_practice_scope (BEFORE INSERT/UPDATE trigger on
-- activity_worksheet_cells) and batch_upsert_worksheet_cells(uuid, jsonb), plus
-- the historical-cleanup query from migration 20260825120000_0825-183.
--
-- Run via supabase/tests/local/run-rls-tests.sh against the disposable scratch
-- database, after the 6 consolidated schema migrations, the 0825-183 incremental
-- migration, and the RBAC/practica-base seed. Single transaction, ALWAYS rolls
-- back. Denials are procedural RAISEs with bare-code messages (same convention as
-- rls-timesheet-authorization-phase5.sql / rpc-save-wo-staffing.sql's RPC probes):
-- probes use nested BEGIN … EXCEPTION blocks asserting SQLERRM equals the
-- documented token. Success output: one NOTICE per passing check ending with
-- "WORKSHEET ACTIVITY PRACTICE SCOPE: ALL CHECKS PASSED (rolled back)".
--
-- Fixture world (all ids carry recognizable ...ac<n> suffixes):
--   CAT_AUD    category, practice Auditoría (code 1, seeded globally by the harness)
--   CAT_OTHER  category, a second practice (code 5) — foreign-category case
--   ACT_AUD    activity, practica_id = Auditoría — the only valid activity
--   ACT_OTHER  activity, practica_id = the other practice — foreign-activity case
--   ACT_ADM    activity, practica_id NULL, is_system = true — global/system, like ADM
--   ACT_AUD_SYS activity, practica_id = Auditoría, is_system = true — a system
--               activity that happens to carry the engagement's own practica_id;
--               is_system must be rejected independently of practica_id matching
--               (review.md iteración 1, #2)
--   E1              engagement, practica = 1 (Auditoría), manager_id = Mel
--   E_NOPRACTICE    engagement, practica = NULL
--   E_BADPRACTICA   engagement, practica = 9 (passes the CHECK constraint but has
--                   no matching row in practicas) — the "unresolvable" case,
--                   same precedence as no practica at all (review.md iteración 1, #3)
--   WO_DRAFT / WO_APPROVED     work orders on E1 (Draft / Approved)
--   WO_DRAFT2 / WO_APPROVED2   a second Draft/Approved pair, used only by the
--                              historical-cleanup group (Group C) so its fixture
--                              cells don't interfere with Group A/B's counts
--   WS1 (E1, wo=WO_DRAFT), WS2 (E1, wo=WO_APPROVED), WS3 (E_NOPRACTICE, wo=NULL)
--   WS4 (E1, wo=WO_DRAFT2), WS5 (E1, wo=WO_APPROVED2), WS6 (E_BADPRACTICA, wo=NULL)
--
-- Group C re-sources the actual migration file (via \ir, resolved relative to this
-- script's own directory) after seeding stray rows, instead of duplicating its
-- cleanup predicate — so this suite exercises the real on-disk migration, not a
-- hand-copied stand-in that could silently drift from it (review.md iteración 1, #6).

BEGIN;

-- practicas.code is CHECK'd to [0,9]. code=5: a second practice distinct from
-- the harness-global code=1 (Auditoría) and from other suites' local code=3,
-- to avoid any cross-suite ambiguity.
INSERT INTO public.practicas (practica_id, name, code, abbreviation)
VALUES ('5e000000-0000-4000-8000-0000000000ac', 'WAP Test Practice (Other)', 5, 'OTR')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.society (society_id, name)
VALUES ('50c00000-0000-4000-8000-0000000000ac', 'WAP Test Society');

INSERT INTO public.categories (category_id, category_name, practica_id, display_order) VALUES
  ('c0000000-0000-4000-8000-0000000000ac', 'WAP Aud Category', (SELECT practica_id FROM public.practicas WHERE code = 1), 1),
  ('c0000000-0000-4000-8000-0000000000ad', 'WAP Other Category', (SELECT practica_id FROM public.practicas WHERE code = 5), 1);

INSERT INTO public.activity_codes (activity_id, activity_code, description, practica_id, is_system, is_active) VALUES
  ('a0100000-0000-4000-8000-0000000000ac', 'WAP-AUD', 'WAP Aud Activity', (SELECT practica_id FROM public.practicas WHERE code = 1), false, true),
  ('a0100000-0000-4000-8000-0000000000ad', 'WAP-OTR', 'WAP Other Activity', (SELECT practica_id FROM public.practicas WHERE code = 5), false, true),
  ('a0100000-0000-4000-8000-0000000000ae', 'WAP-ADM', 'WAP Admin (system)', NULL, true, true),
  ('a0100000-0000-4000-8000-0000000000af', 'WAP-AUDS', 'WAP Aud Activity (system, same practica)', (SELECT practica_id FROM public.practicas WHERE code = 1), true, true);

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1000000-0000-4000-8000-0000000000ac', 'WAP Test Client', 'WAP-TAX-001');

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                             email_confirmed_at, created_at, updated_at,
                             raw_app_meta_data, raw_user_meta_data) VALUES
      ('a0000000-0000-4000-8000-0000000000ac', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wap-test-ac@ruizmier.com', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, category_id, practica_id, society_id) VALUES
  ('50000000-0000-4000-8000-0000000000ac', 'a0000000-0000-4000-8000-0000000000ac', 'Mel', 'ManagerLead', 'c0000000-0000-4000-8000-0000000000ac', (SELECT practica_id FROM public.practicas WHERE code = 1), '50c00000-0000-4000-8000-0000000000ac');

INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0000000-0000-4000-8000-0000000000ac', 'manager', 'manager')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, role_key = EXCLUDED.role_key;

-- work_orders.engagement_id is UNIQUE (one WO per engagement), so each WO
-- fixture below needs its own engagement — all practica=1 (Auditoría),
-- manager_id=Mel, so Mel is a team member of every one of them.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id, practica, fecha_cierre) VALUES
  ('e0000000-0000-4000-8000-0000000000ac', 'c1000000-0000-4000-8000-0000000000ac', 'WAP E1 (Draft)', '50000000-0000-4000-8000-0000000000ac', 1, '2026-09-30'),
  ('e0000000-0000-4000-8000-0000000000ad', 'c1000000-0000-4000-8000-0000000000ac', 'WAP E2 (Approved)', '50000000-0000-4000-8000-0000000000ac', 1, '2026-09-30'),
  ('e0000000-0000-4000-8000-0000000000ae', 'c1000000-0000-4000-8000-0000000000ac', 'WAP E No Practice', '50000000-0000-4000-8000-0000000000ac', NULL, '2026-09-30'),
  ('e0000000-0000-4000-8000-0000000000af', 'c1000000-0000-4000-8000-0000000000ac', 'WAP E4 (Draft2)', '50000000-0000-4000-8000-0000000000ac', 1, '2026-09-30'),
  ('e0000000-0000-4000-8000-0000000000b0', 'c1000000-0000-4000-8000-0000000000ac', 'WAP E5 (Approved2)', '50000000-0000-4000-8000-0000000000ac', 1, '2026-09-30'),
  -- practica=9 passes chk_engagements_practica (range 0-9) but no practicas row
  -- has code=9 in this fixture world — the "unresolvable" case (review.md
  -- iteración 1, #3). Direct INSERT bypasses create_engagement_with_code's own
  -- "practica must exist and be active" validation, which is exactly the gap
  -- this suite needs to exercise at the trigger/RPC layer.
  ('e0000000-0000-4000-8000-0000000000b1', 'c1000000-0000-4000-8000-0000000000ac', 'WAP E Bad Practica', '50000000-0000-4000-8000-0000000000ac', 9, '2026-09-30');

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000ac', 'e0000000-0000-4000-8000-0000000000ac', 'BOB', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000ad', 'e0000000-0000-4000-8000-0000000000ad', 'BOB', 'High', 'Approved'),
  ('40000000-0000-4000-8000-0000000000ae', 'e0000000-0000-4000-8000-0000000000af', 'BOB', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000af', 'e0000000-0000-4000-8000-0000000000b0', 'BOB', 'High', 'Approved');

INSERT INTO public.activity_worksheets (id, engagement_id, wo_id) VALUES
  ('30000000-0000-4000-8000-0000000000ac', 'e0000000-0000-4000-8000-0000000000ac', '40000000-0000-4000-8000-0000000000ac'), -- WS1 / E1 / WO_DRAFT
  ('30000000-0000-4000-8000-0000000000ad', 'e0000000-0000-4000-8000-0000000000ad', '40000000-0000-4000-8000-0000000000ad'), -- WS2 / E2 / WO_APPROVED
  ('30000000-0000-4000-8000-0000000000ae', 'e0000000-0000-4000-8000-0000000000ae', NULL),                                   -- WS3 / E_NOPRACTICE
  ('30000000-0000-4000-8000-0000000000af', 'e0000000-0000-4000-8000-0000000000af', '40000000-0000-4000-8000-0000000000ae'), -- WS4 / E4 / WO_DRAFT2
  ('30000000-0000-4000-8000-0000000000b0', 'e0000000-0000-4000-8000-0000000000b0', '40000000-0000-4000-8000-0000000000af'), -- WS5 / E5 / WO_APPROVED2
  ('30000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b1', NULL);                                   -- WS6 / E_BADPRACTICA

-- ══ Group C — historical cleanup: seed stray rows, then re-source the real
--     migration file (steps 1-4) so this suite verifies its actual predicate
--     instead of a hand-copied duplicate (review.md iteración 1, #6). Runs as
--     the connecting (table-owner) role, before the Group A/B role switch below
--     — this is backend/migration-style verification, not an app-user action,
--     and seeding the "bad" historical rows requires bypassing the very trigger
--     under test. ═══════════════════════════════════════════════════════════
ALTER TABLE public.activity_worksheet_cells DISABLE TRIGGER trg_enforce_worksheet_cell_practice_scope;

INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours) VALUES
  -- WS4 / WO_DRAFT2: one valid cell, one stray (global/system activity), one
  -- stray (system activity carrying the engagement's own practica_id, #2).
  ('30000000-0000-4000-8000-0000000000af', 'c0000000-0000-4000-8000-0000000000ac', 'a0100000-0000-4000-8000-0000000000ac', 5),
  ('30000000-0000-4000-8000-0000000000af', 'c0000000-0000-4000-8000-0000000000ac', 'a0100000-0000-4000-8000-0000000000ae', 2),
  ('30000000-0000-4000-8000-0000000000af', 'c0000000-0000-4000-8000-0000000000ac', 'a0100000-0000-4000-8000-0000000000af', 4),
  -- WS5 / WO_APPROVED2: one valid cell, one stray (foreign-practice category).
  ('30000000-0000-4000-8000-0000000000b0', 'c0000000-0000-4000-8000-0000000000ac', 'a0100000-0000-4000-8000-0000000000ac', 7),
  ('30000000-0000-4000-8000-0000000000b0', 'c0000000-0000-4000-8000-0000000000ad', 'a0100000-0000-4000-8000-0000000000ac', 3);

ALTER TABLE public.activity_worksheet_cells ENABLE TRIGGER trg_enforce_worksheet_cell_practice_scope;

-- Re-run the actual on-disk migration's cleanup (step 1), resync (step 2), and
-- trigger/RPC redefinition (steps 3-4) against this fixture data. \ir (not
-- \i) resolves the relative path against this script's own directory rather
-- than the client's cwd — run-rls-tests.sh invokes psql from the repo root,
-- so \i's cwd-relative resolution sends it outside the repo entirely (CI
-- finding, 2026-08-25: "No such file or directory"). CREATE TEMP TABLE / DROP
-- TABLE / CREATE OR REPLACE FUNCTION are all safe to run again within a fresh
-- session — nothing here is scoped to just WS4/WS5, but at this point in the
-- suite no other activity_worksheet_cells rows exist yet (Groups A/B insert
-- theirs afterward), so the migration's DELETE only touches this fixture data.
\ir ../migrations/20260825120000_0825-183_worksheet_activity_practice_scope.sql

DO $$
DECLARE
  v_count integer;
  v_hours numeric;
BEGIN
  -- All three strays are gone; both valid cells remain.
  SELECT count(*) INTO v_count FROM public.activity_worksheet_cells WHERE worksheet_id = '30000000-0000-4000-8000-0000000000af';
  IF v_count <> 1 THEN RAISE EXCEPTION 'TEST FAIL — cleanup left % cells on WS4, expected 1 (the valid one)', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.activity_worksheet_cells WHERE worksheet_id = '30000000-0000-4000-8000-0000000000b0';
  IF v_count <> 1 THEN RAISE EXCEPTION 'TEST FAIL — cleanup left % cells on WS5, expected 1 (the valid one)', v_count; END IF;
  RAISE NOTICE 'PASS — cleanup removes stray out-of-scope cells (global/system activity, same-practica system activity, foreign-practice category) regardless of the linked work order''s status';

  -- Draft (WO_DRAFT2) was resynced: wo_budget_lines reflects the post-cleanup 5h.
  SELECT budgeted_hours INTO v_hours FROM public.wo_budget_lines
   WHERE wo_id = '40000000-0000-4000-8000-0000000000ae' AND category_id = 'c0000000-0000-4000-8000-0000000000ac';
  IF v_hours IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'TEST FAIL — Draft work order was not resynced to the post-cleanup 5h, got %', v_hours;
  END IF;
  RAISE NOTICE 'PASS — the Draft work order linked to the cleaned worksheet is resynced to the post-cleanup budget (5h)';

  -- Approved (WO_APPROVED2) was never synced, by design — nothing ever wrote
  -- its wo_budget_lines, so no row exists: its already-committed budget is
  -- left exactly as it was for manual review.
  SELECT count(*) INTO v_count FROM public.wo_budget_lines WHERE wo_id = '40000000-0000-4000-8000-0000000000af';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL — the locked (Approved) work order''s budget was touched by the cleanup, expected 0 rows, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS — a locked (Approved) work order''s budget is left untouched by the cleanup — only Draft work orders are auto-resynced';
END $$;

-- ══ Groups A/B — impersonate Mel (manager, team member of E1) and exercise the
--     trigger (direct writes) and the RPC as an app user would. ═══════════════
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_ok     boolean;
  v_count  integer;
  v_detail text;
BEGIN
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000ac');

  -- ══ Group A — direct writes go through the trigger ═══════════════════
  -- A1. A valid cell (own category, own-practice activity) is accepted.
  INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
  VALUES ('30000000-0000-4000-8000-0000000000ac', 'c0000000-0000-4000-8000-0000000000ac', 'a0100000-0000-4000-8000-0000000000ac', 5);
  RAISE NOTICE 'PASS — a cell whose category and activity match the engagement''s practice is accepted (direct write)';

  -- A2. Foreign-practice category -> WORKSHEET_CATEGORY_OUT_OF_SCOPE.
  v_ok := false;
  BEGIN
    INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
    VALUES ('30000000-0000-4000-8000-0000000000ac', 'c0000000-0000-4000-8000-0000000000ad', 'a0100000-0000-4000-8000-0000000000ac', 1);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WORKSHEET_CATEGORY_OUT_OF_SCOPE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WORKSHEET_CATEGORY_OUT_OF_SCOPE, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a foreign-practice category unexpectedly succeeded (direct write)'; END IF;
  RAISE NOTICE 'PASS — a foreign-practice category raises WORKSHEET_CATEGORY_OUT_OF_SCOPE (direct write)';

  -- A3. Foreign-practice activity -> WORKSHEET_ACTIVITY_OUT_OF_SCOPE. Also
  -- confirms MESSAGE stays the bare code while DETAIL carries the offending
  -- worksheet_id/activity_id (review.md iteración 1, #7).
  v_ok := false;
  BEGIN
    INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
    VALUES ('30000000-0000-4000-8000-0000000000ac', 'c0000000-0000-4000-8000-0000000000ac', 'a0100000-0000-4000-8000-0000000000ad', 1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    IF SQLERRM = 'WORKSHEET_ACTIVITY_OUT_OF_SCOPE'
       AND v_detail LIKE '%30000000-0000-4000-8000-0000000000ac%'
       AND v_detail LIKE '%a0100000-0000-4000-8000-0000000000ad%'
    THEN
      v_ok := true;
    ELSE
      RAISE EXCEPTION 'TEST FAIL — expected bare WORKSHEET_ACTIVITY_OUT_OF_SCOPE with worksheet_id/activity_id in DETAIL, got SQLERRM=% DETAIL=%', SQLERRM, v_detail;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a foreign-practice activity unexpectedly succeeded (direct write)'; END IF;
  RAISE NOTICE 'PASS — a foreign-practice activity raises WORKSHEET_ACTIVITY_OUT_OF_SCOPE with MESSAGE=bare code, DETAIL=worksheet_id/activity_id (direct write)';

  -- A4. Global/system activity (ADM-like) -> WORKSHEET_ACTIVITY_OUT_OF_SCOPE.
  v_ok := false;
  BEGIN
    INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
    VALUES ('30000000-0000-4000-8000-0000000000ac', 'c0000000-0000-4000-8000-0000000000ac', 'a0100000-0000-4000-8000-0000000000ae', 1);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WORKSHEET_ACTIVITY_OUT_OF_SCOPE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WORKSHEET_ACTIVITY_OUT_OF_SCOPE (global/system), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a global/system (ADM-like) activity unexpectedly succeeded (direct write)'; END IF;
  RAISE NOTICE 'PASS — a global/system activity (ADM-like, practica_id NULL) raises WORKSHEET_ACTIVITY_OUT_OF_SCOPE — no more "global is always valid" exception (direct write)';

  -- A5. Any cell on a no-practice engagement's worksheet -> WORKSHEET_PRACTICE_REQUIRED.
  v_ok := false;
  BEGIN
    INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
    VALUES ('30000000-0000-4000-8000-0000000000ae', 'c0000000-0000-4000-8000-0000000000ac', 'a0100000-0000-4000-8000-0000000000ac', 1);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WORKSHEET_PRACTICE_REQUIRED' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WORKSHEET_PRACTICE_REQUIRED, got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a cell on a no-practice engagement unexpectedly succeeded (direct write)'; END IF;
  RAISE NOTICE 'PASS — a worksheet whose engagement has no practica rejects every cell with WORKSHEET_PRACTICE_REQUIRED (direct write)';

  -- A6. A system activity carrying the engagement's own practica_id is still
  -- rejected — is_system is checked independently of practica_id matching
  -- (review.md iteración 1, #2).
  v_ok := false;
  BEGIN
    INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
    VALUES ('30000000-0000-4000-8000-0000000000ac', 'c0000000-0000-4000-8000-0000000000ac', 'a0100000-0000-4000-8000-0000000000af', 1);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WORKSHEET_ACTIVITY_OUT_OF_SCOPE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WORKSHEET_ACTIVITY_OUT_OF_SCOPE (same-practica system activity), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a system activity carrying the engagement''s own practica_id unexpectedly succeeded (direct write)'; END IF;
  RAISE NOTICE 'PASS — a system activity is rejected even when its practica_id matches the engagement''s practice (direct write)';

  -- A7. A cell on a worksheet whose engagement practica code has no matching
  -- practicas row -> WORKSHEET_PRACTICE_REQUIRED, same precedence as no
  -- practica at all (review.md iteración 1, #3).
  v_ok := false;
  BEGIN
    INSERT INTO public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
    VALUES ('30000000-0000-4000-8000-0000000000b1', 'c0000000-0000-4000-8000-0000000000ac', 'a0100000-0000-4000-8000-0000000000ac', 1);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WORKSHEET_PRACTICE_REQUIRED' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WORKSHEET_PRACTICE_REQUIRED (unresolved practica code), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a cell on an unresolved-practica-code engagement unexpectedly succeeded (direct write)'; END IF;
  RAISE NOTICE 'PASS — a worksheet whose engagement practica code has no matching practicas row raises WORKSHEET_PRACTICE_REQUIRED, same as no practica at all (direct write)';

  -- ══ Group B — batch_upsert_worksheet_cells RPC ═══════════════════════
  -- B1. Empty payload on a no-practice worksheet succeeds (no-op).
  PERFORM public.batch_upsert_worksheet_cells('30000000-0000-4000-8000-0000000000ae'::uuid, '[]'::jsonb);
  RAISE NOTICE 'PASS — an empty payload on a no-practice worksheet succeeds';

  -- B2. A valid payload on WS1 (Auditoría) succeeds and persists.
  PERFORM public.batch_upsert_worksheet_cells(
    '30000000-0000-4000-8000-0000000000ac'::uuid,
    jsonb_build_array(jsonb_build_object(
      'category_id', 'c0000000-0000-4000-8000-0000000000ac',
      'activity_id', 'a0100000-0000-4000-8000-0000000000ac',
      'budget_hours', 8
    ))
  );
  SELECT count(*) INTO v_count FROM public.activity_worksheet_cells WHERE worksheet_id = '30000000-0000-4000-8000-0000000000ac';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — valid RPC payload did not persist exactly 1 cell, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS — a valid payload on the Auditoría worksheet is persisted by the RPC (state-complete: 1 cell)';

  -- B3. A non-empty payload on a no-practice worksheet -> WORKSHEET_PRACTICE_REQUIRED.
  v_ok := false;
  BEGIN
    PERFORM public.batch_upsert_worksheet_cells(
      '30000000-0000-4000-8000-0000000000ae'::uuid,
      jsonb_build_array(jsonb_build_object(
        'category_id', 'c0000000-0000-4000-8000-0000000000ac',
        'activity_id', 'a0100000-0000-4000-8000-0000000000ac',
        'budget_hours', 1
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WORKSHEET_PRACTICE_REQUIRED' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WORKSHEET_PRACTICE_REQUIRED (RPC), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a non-empty payload on a no-practice worksheet unexpectedly succeeded (RPC)'; END IF;
  RAISE NOTICE 'PASS — a non-empty payload on a no-practice worksheet raises WORKSHEET_PRACTICE_REQUIRED (RPC)';

  -- B4. Mixed payload (valid cell + foreign-practice category) on WS1 is
  -- rejected AND leaves WS1 exactly as it was after B2 (rollback is whole,
  -- not partial — the RPC's own pre-delete validation never reaches the delete).
  v_ok := false;
  BEGIN
    PERFORM public.batch_upsert_worksheet_cells(
      '30000000-0000-4000-8000-0000000000ac'::uuid,
      jsonb_build_array(
        jsonb_build_object('category_id', 'c0000000-0000-4000-8000-0000000000ac', 'activity_id', 'a0100000-0000-4000-8000-0000000000ac', 'budget_hours', 99),
        jsonb_build_object('category_id', 'c0000000-0000-4000-8000-0000000000ad', 'activity_id', 'a0100000-0000-4000-8000-0000000000ac', 'budget_hours', 1)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WORKSHEET_CATEGORY_OUT_OF_SCOPE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WORKSHEET_CATEGORY_OUT_OF_SCOPE (mixed payload), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a mixed payload with a foreign-practice category unexpectedly succeeded (RPC)'; END IF;

  SELECT count(*) INTO v_count FROM public.activity_worksheet_cells WHERE worksheet_id = '30000000-0000-4000-8000-0000000000ac';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL — mixed-payload rejection was not atomic: expected the B2 cell (count=1) untouched, got %', v_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.activity_worksheet_cells
     WHERE worksheet_id = '30000000-0000-4000-8000-0000000000ac' AND budget_hours = 8
  ) THEN
    RAISE EXCEPTION 'TEST FAIL — mixed-payload rejection was not atomic: the pre-existing B2 cell (8h) is gone';
  END IF;
  RAISE NOTICE 'PASS — a mixed payload with one invalid cell rejects the whole batch (WORKSHEET_CATEGORY_OUT_OF_SCOPE) and leaves prior state untouched (RPC, atomic)';

  -- B5. Payload with a global/system (ADM-like) activity -> WORKSHEET_ACTIVITY_OUT_OF_SCOPE.
  v_ok := false;
  BEGIN
    PERFORM public.batch_upsert_worksheet_cells(
      '30000000-0000-4000-8000-0000000000ac'::uuid,
      jsonb_build_array(jsonb_build_object(
        'category_id', 'c0000000-0000-4000-8000-0000000000ac',
        'activity_id', 'a0100000-0000-4000-8000-0000000000ae',
        'budget_hours', 1
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WORKSHEET_ACTIVITY_OUT_OF_SCOPE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WORKSHEET_ACTIVITY_OUT_OF_SCOPE (RPC, global/system), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a global/system activity payload unexpectedly succeeded (RPC)'; END IF;
  RAISE NOTICE 'PASS — a payload targeting a global/system (ADM-like) activity raises WORKSHEET_ACTIVITY_OUT_OF_SCOPE (RPC)';

  -- B6. Payload with a system activity carrying the engagement's own
  -- practica_id -> WORKSHEET_ACTIVITY_OUT_OF_SCOPE (review.md iteración 1, #2).
  v_ok := false;
  BEGIN
    PERFORM public.batch_upsert_worksheet_cells(
      '30000000-0000-4000-8000-0000000000ac'::uuid,
      jsonb_build_array(jsonb_build_object(
        'category_id', 'c0000000-0000-4000-8000-0000000000ac',
        'activity_id', 'a0100000-0000-4000-8000-0000000000af',
        'budget_hours', 1
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WORKSHEET_ACTIVITY_OUT_OF_SCOPE' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WORKSHEET_ACTIVITY_OUT_OF_SCOPE (RPC, same-practica system activity), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a same-practica system activity payload unexpectedly succeeded (RPC)'; END IF;
  RAISE NOTICE 'PASS — a payload targeting a system activity is rejected even when its practica_id matches the worksheet''s practice (RPC)';

  -- B7. Non-empty payload on a worksheet whose engagement practica code has no
  -- matching practicas row -> WORKSHEET_PRACTICE_REQUIRED, same precedence as
  -- no practica at all (review.md iteración 1, #3).
  v_ok := false;
  BEGIN
    PERFORM public.batch_upsert_worksheet_cells(
      '30000000-0000-4000-8000-0000000000b1'::uuid,
      jsonb_build_array(jsonb_build_object(
        'category_id', 'c0000000-0000-4000-8000-0000000000ac',
        'activity_id', 'a0100000-0000-4000-8000-0000000000ac',
        'budget_hours', 1
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'WORKSHEET_PRACTICE_REQUIRED' THEN v_ok := true;
    ELSE RAISE EXCEPTION 'TEST FAIL — expected WORKSHEET_PRACTICE_REQUIRED (RPC, unresolved practica code), got %', SQLERRM;
    END IF;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST FAIL — a non-empty payload on an unresolved-practica-code worksheet unexpectedly succeeded (RPC)'; END IF;
  RAISE NOTICE 'PASS — a non-empty payload on a worksheet whose engagement practica code has no matching practicas row raises WORKSHEET_PRACTICE_REQUIRED (RPC)';

  RAISE NOTICE 'WORKSHEET ACTIVITY PRACTICE SCOPE: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
