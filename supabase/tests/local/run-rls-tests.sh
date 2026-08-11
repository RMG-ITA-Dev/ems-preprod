#!/usr/bin/env bash
# D5 RLS migration + per-role leakage suite against a SCRATCH PostgreSQL
# (PR #222 finding 3: the suite must be executed by automation, not just
# documented). Connection comes from the standard PG* env vars; the
# script creates and drops its own database, so point it ONLY at a
# disposable server (CI service container or a local scratch cluster —
# never the live project).
#
# Safety (PR #222 adversarial verification P2): the database name is
# validated BEFORE any command runs — it must be `ems_rls_test` or
# start with `ems_rls_test_`, lowercase [a-z0-9_] only — and all
# create/drop calls go through createdb/dropdb with `--` argument
# separation, never interpolated SQL. `--self-test` exercises the
# validator against hostile names without touching any database.
#
# Two lanes:
#
# Lane 1 (world P — pending history). Mirrors the live rollout exactly:
#   shim (Supabase-alike) → Phase 3 migration → scheduler-v2 views +
#   baseline data (leak reproduced) → D5 migration (twice: idempotency)
#   → timesheet shim → Phase 5 migration (twice: idempotency)
#   → corrective backfill migration 20260720120000 (twice: idempotency)
#   → D5 leakage suite → Phase 5 timesheet-authz suite (both
#   fixture-scoped, always roll back).
# The D5 suite deliberately runs AFTER the Phase 5 shim + migration have
# applied — that ordering IS the I-P5-3 regression guard: a green D5 run
# over a database that already contains Phase 5 proves Phase 5 perturbed
# nothing on the D5 surface. The corrective migration runs after ALL of
# them (it carries the latest timestamp), so the same green suites prove
# its re-asserted policies/helpers perturb neither surface.
#
# Lane 2 (world D — drifted history; PR #230 adversarial review P1). A
# second scratch database where Phase 3/D5 are "recorded applied but
# never executed": shim → scheduler-v2 era table WITHOUT category_id +
# legacy permissive RLS (leak reproduced) → corrective migration alone
# (repairs structure + installs the D5 matrix) → scheduler-v2 views +
# baseline data → corrective migration re-run (idempotency + view
# hardening over the now-present views) → out-of-order Phase 3 re-apply
# (the operator remediation for a drifted history; its guarded RLS
# section must NOT resurrect the permissive policies) → the SAME D5
# leakage suite. A green lane 2 proves the corrective migration
# converges a drifted database to the same secure end state (identical
# constraints, policies, triggers, ACLs, and view options; world D
# additionally retains the deliberately-kept legacy
# idx_assignments_staff_dates, per Phase 3's cleanup-PR note) with no
# earlier migration re-run, and that a later Phase 3 re-run cannot undo
# it.
#
# Lane 3 (failure paths — the corrective migration's loud aborts must
# stay loud, actionable, and safe). Case A: a NULL-category assignment
# under a SINGLE-TRANSACTION apply must abort with the documented
# message and roll back completely (no column, no policy changes).
# Case B: an end_date < start_date row under a STATEMENT-BY-STATEMENT
# (autocommit) apply must abort at the date pre-flight, leaving a
# partial state that a data fix + re-run fully converges. A green lane
# 3 pins both pre-flights and both apply modes; a future edit that
# weakens or reorders them fails CI.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DB="${RLS_TEST_DB:-ems_rls_test}"
DRIFT_DB="${DB}_drift"
FAIL_DB="${DB}_failpath"
SCHEDULER_DB="${DB}_scheduler"

validate_db_name() {
  local name="$1"
  case "$name" in
    ems_rls_test | ems_rls_test_*) ;;
    *)
      echo "FATAL: RLS_TEST_DB must be 'ems_rls_test' or start with 'ems_rls_test_' (got: '${name}')" >&2
      return 1
      ;;
  esac
  if ! [[ "$name" =~ ^[a-z0-9_]{1,63}$ ]]; then
    echo "FATAL: RLS_TEST_DB may contain only lowercase [a-z0-9_], max 63 chars (got: '${name}')" >&2
    return 1
  fi
}

if [[ "${1:-}" == "--self-test" ]]; then
  fail=0
  # First group: rejected by the case-glob arm (no valid prefix).
  # Second group (ems_rls_test_<metachar>): PASSES the glob and is
  # rejectable ONLY by the regex — this exercises the regex rejection
  # arm, so a future weakening/removal of the regex fails the self-test.
  for bad in '' 'postgres' 'template1' 'ems_prod' 'main' \
             'ems_rls_test; DROP DATABASE postgres' 'ems_rls_test;x' \
             'Ems_Rls_Test' 'ems_rls_testX' 'xems_rls_test' \
             'ems_rls_test-ci' 'ems_rls_test ' \
             'ems_rls_test_;x' 'ems_rls_test_$(id)' 'ems_rls_test_a;b' \
             'ems_rls_test_ci ' 'ems_rls_test_CI' 'ems_rls_test_a.b'; do
    if validate_db_name "$bad" 2>/dev/null; then
      echo "SELF-TEST FAIL: unsafe name accepted: '${bad}'" >&2
      fail=1
    fi
  done
  for good in 'ems_rls_test' 'ems_rls_test_ci' 'ems_rls_test_2026'; do
    if ! validate_db_name "$good" 2>/dev/null; then
      echo "SELF-TEST FAIL: safe name rejected: '${good}'" >&2
      fail=1
    fi
  done
  [[ "$fail" -eq 0 ]] || exit 1
  echo "OK: db-name validator self-test passed (18 hostile names rejected — incl. 6 glob-passing regex-only cases, 3 safe names accepted)"
  exit 0
fi

validate_db_name "$DB"
validate_db_name "$DRIFT_DB"
validate_db_name "$FAIL_DB"
validate_db_name "$SCHEDULER_DB"

OUT=""
cleanup() {
  dropdb --if-exists -- "$DB" >/dev/null 2>&1 || true
  dropdb --if-exists -- "$DRIFT_DB" >/dev/null 2>&1 || true
  dropdb --if-exists -- "$FAIL_DB" >/dev/null 2>&1 || true
  dropdb --if-exists -- "$SCHEDULER_DB" >/dev/null 2>&1 || true
  [[ -n "$OUT" ]] && rm -f "$OUT" 2>/dev/null || true
}
trap cleanup EXIT

dropdb --if-exists -- "$DB"
createdb -- "$DB"

run() {
  echo "── $1"
  psql -v ON_ERROR_STOP=1 -d "$DB" -f "${REPO_ROOT}/$1"
}

run supabase/tests/local/00-shim-supabase.sql
run supabase/migrations/20260716120000_engagement_assignments_phase3.sql
run supabase/tests/local/10-shim-scheduler-v2-views.sql
run supabase/migrations/20260717233000_engagement_assignments_d5_rls.sql
echo "── D5 migration re-run (idempotency)"
psql -v ON_ERROR_STOP=1 -d "$DB" \
  -f "${REPO_ROOT}/supabase/migrations/20260717233000_engagement_assignments_d5_rls.sql"

run supabase/tests/local/20-shim-timesheet.sql
run supabase/migrations/20260718120000_scheduler_phase5_timesheet_authorization.sql
echo "── Phase 5 migration re-run (idempotency)"
psql -v ON_ERROR_STOP=1 -d "$DB" \
  -f "${REPO_ROOT}/supabase/migrations/20260718120000_scheduler_phase5_timesheet_authorization.sql"

run supabase/migrations/20260720120000_engagement_assignments_category_id_backfill.sql
echo "── Corrective backfill migration re-run (idempotency)"
psql -v ON_ERROR_STOP=1 -d "$DB" \
  -f "${REPO_ROOT}/supabase/migrations/20260720120000_engagement_assignments_category_id_backfill.sql"

OUT="$(mktemp)"
psql -v ON_ERROR_STOP=1 -d "$DB" \
  -f "${REPO_ROOT}/supabase/tests/rls-engagement-assignments-d5.sql" 2>&1 | tee "${OUT}"
grep -q 'D5 RLS: ALL CHECKS PASSED' "${OUT}" || {
  echo 'FAIL: leakage suite did not reach its final PASS marker' >&2
  exit 1
}

rm -f "$OUT"
OUT="$(mktemp)"
psql -v ON_ERROR_STOP=1 -d "$DB" \
  -f "${REPO_ROOT}/supabase/tests/rls-timesheet-authorization-phase5.sql" 2>&1 | tee "${OUT}"
grep -q 'P5 TIMESHEET AUTHZ: ALL CHECKS PASSED' "${OUT}" \
  || { echo 'FAIL: Phase 5 timesheet-authz suite did not reach its final PASS marker' >&2; exit 1; }

# ── Lane 2: world-D drift repair (PR #230 adversarial review P1) ──────
run_drift() {
  echo "── [drift] $1"
  psql -v ON_ERROR_STOP=1 -d "$DRIFT_DB" -f "${REPO_ROOT}/$1"
}

dropdb --if-exists -- "$DRIFT_DB"
createdb -- "$DRIFT_DB"

run_drift supabase/tests/local/00-shim-supabase.sql
run_drift supabase/tests/local/05-shim-v2-drift-table.sql
run_drift supabase/migrations/20260720120000_engagement_assignments_category_id_backfill.sql
run_drift supabase/tests/local/10-shim-scheduler-v2-views.sql
echo "── [drift] corrective migration re-run (idempotency + view hardening)"
psql -v ON_ERROR_STOP=1 -d "$DRIFT_DB" \
  -f "${REPO_ROOT}/supabase/migrations/20260720120000_engagement_assignments_category_id_backfill.sql"

# Backfill correctness in the drift world: every pre-existing row (incl.
# the soft-deleted one) must now carry the category of its staff member.
psql -v ON_ERROR_STOP=1 -d "$DRIFT_DB" <<'SQL'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.engagement_assignments ea
    JOIN public.staff s ON s.staff_id = ea.staff_id
   WHERE ea.category_id IS DISTINCT FROM s.category_id;
  IF n <> 0 THEN
    RAISE EXCEPTION 'DRIFT FAIL: % assignment row(s) not backfilled from staff.category_id', n;
  END IF;
  RAISE NOTICE 'PASS — [drift] all assignment rows backfilled from staff.category_id';
END $$;
SQL

# Out-of-order Phase 3 re-apply (PR #230 adversarial verification P2):
# the natural operator remediation for "history says applied, effects
# absent" re-runs Phase 3 AFTER the corrective migration. Its guarded
# RLS section must skip the pre-D5 permissive policies; the D5 suite
# below would also catch the leak behaviorally, but assert the policy
# set explicitly so the failure names the exact regression.
echo "── [drift] out-of-order Phase 3 re-apply (must NOT resurrect permissive RLS)"
psql -v ON_ERROR_STOP=1 -d "$DRIFT_DB" \
  -f "${REPO_ROOT}/supabase/migrations/20260716120000_engagement_assignments_phase3.sql"
psql -v ON_ERROR_STOP=1 -d "$DRIFT_DB" <<'SQL'
DO $$
DECLARE
  stray text;
  n int;
BEGIN
  SELECT string_agg(policyname, ', ') INTO stray FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'engagement_assignments'
     AND policyname NOT IN ('ea_admin_manage', 'ea_select_firmwide', 'ea_select_lead',
                            'ea_select_assigned', 'ea_team_insert', 'ea_team_update',
                            'ea_team_delete');
  IF stray IS NOT NULL THEN
    RAISE EXCEPTION 'DRIFT FAIL: out-of-order Phase 3 re-apply resurrected non-canonical policy(ies): %', stray;
  END IF;
  -- Positive direction too: all 7 canonical policies must still exist
  -- (a Phase 3 edit that DROPPED a canonical policy would otherwise
  -- pass the stray check above).
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'engagement_assignments'
     AND policyname IN ('ea_admin_manage', 'ea_select_firmwide', 'ea_select_lead',
                        'ea_select_assigned', 'ea_team_insert', 'ea_team_update',
                        'ea_team_delete');
  IF n <> 7 THEN
    RAISE EXCEPTION 'DRIFT FAIL: out-of-order Phase 3 re-apply left only % of the 7 canonical policies', n;
  END IF;
  RAISE NOTICE 'PASS — [drift] out-of-order Phase 3 re-apply left the D5 matrix intact (all 7 canonical, no strays)';
END $$;
SQL

rm -f "$OUT"
OUT="$(mktemp)"
psql -v ON_ERROR_STOP=1 -d "$DRIFT_DB" \
  -f "${REPO_ROOT}/supabase/tests/rls-engagement-assignments-d5.sql" 2>&1 | tee "${OUT}"
grep -q 'D5 RLS: ALL CHECKS PASSED' "${OUT}" || {
  echo 'FAIL: [drift] leakage suite did not reach its final PASS marker' >&2
  exit 1
}

# ── Lane 3: loud-abort failure paths ──────────────────────────────────
CORRECTIVE="${REPO_ROOT}/supabase/migrations/20260720120000_engagement_assignments_category_id_backfill.sql"

dropdb --if-exists -- "$FAIL_DB"
createdb -- "$FAIL_DB"
echo "── [failpath] shims + drift fixture"
psql -v ON_ERROR_STOP=1 -q -d "$FAIL_DB" -f "${REPO_ROOT}/supabase/tests/local/00-shim-supabase.sql" >/dev/null
psql -v ON_ERROR_STOP=1 -q -d "$FAIL_DB" -f "${REPO_ROOT}/supabase/tests/local/05-shim-v2-drift-table.sql" >/dev/null

echo "── [failpath] case A: NULL-category row, single-transaction apply must abort + roll back completely"
psql -v ON_ERROR_STOP=1 -q -d "$FAIL_DB" <<'SQL'
INSERT INTO public.staff (staff_id, first_name, last_name, category_id)
VALUES ('f5000000-0000-4000-8000-000000000001', 'Fail', 'NoCategory', NULL);
INSERT INTO public.engagement_assignments (engagement_id, staff_id, start_date, end_date)
VALUES ('de000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', '2026-01-01', '2026-06-30');
SQL
rm -f "$OUT"
OUT="$(mktemp)"
if psql -v ON_ERROR_STOP=1 -1 -d "$FAIL_DB" -f "$CORRECTIVE" > "$OUT" 2>&1; then
  echo 'FAIL: [failpath] NULL-category apply unexpectedly succeeded' >&2
  exit 1
fi
grep -q 'Cannot enforce engagement_assignments.category_id NOT NULL' "$OUT" || {
  echo 'FAIL: [failpath] NULL-category abort did not raise the documented message' >&2
  cat "$OUT" >&2
  exit 1
}
psql -v ON_ERROR_STOP=1 -d "$FAIL_DB" <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'engagement_assignments'
       AND column_name = 'category_id'
  ) THEN
    RAISE EXCEPTION 'FAILPATH FAIL: single-transaction abort did not roll back the category_id column';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'engagement_assignments'
       AND policyname = 'ea_select_firmwide'
  ) THEN
    RAISE EXCEPTION 'FAILPATH FAIL: single-transaction abort did not roll back the RLS replacement';
  END IF;
  RAISE NOTICE 'PASS — [failpath] NULL-category abort was loud and rolled back completely';
END $$;
SQL

echo "── [failpath] case B: bad-dates row, statement-by-statement apply must abort at the date pre-flight; data fix + re-run must converge"
psql -v ON_ERROR_STOP=1 -q -d "$FAIL_DB" <<'SQL'
UPDATE public.staff SET category_id = 'd0000000-0000-4000-8000-000000000001'
 WHERE staff_id = 'f5000000-0000-4000-8000-000000000001';
INSERT INTO public.engagement_assignments (assignment_id, engagement_id, staff_id, start_date, end_date)
VALUES ('fa000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', '2026-06-30', '2026-01-01');
SQL
rm -f "$OUT"
OUT="$(mktemp)"
if psql -v ON_ERROR_STOP=1 -d "$FAIL_DB" -f "$CORRECTIVE" > "$OUT" 2>&1; then
  echo 'FAIL: [failpath] bad-dates apply unexpectedly succeeded' >&2
  exit 1
fi
grep -q 'Cannot add engagement_assignments date CHECK' "$OUT" || {
  echo 'FAIL: [failpath] bad-dates abort did not raise the documented message' >&2
  cat "$OUT" >&2
  exit 1
}
# Ordering property (PR #230 adversarial verification): the RLS repair
# is sequenced BEFORE every data-dependent abort point, so even this
# halted statement-by-statement apply must already have replaced the
# legacy permissive policies with the D5 matrix.
psql -v ON_ERROR_STOP=1 -d "$FAIL_DB" <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'engagement_assignments'
       AND policyname IN ('Authenticated can read assignments', 'Leadership manages assignments',
                          'ea_select', 'ea_team_manage')
  ) THEN
    RAISE EXCEPTION 'FAILPATH FAIL: data abort left legacy permissive policies active (RLS repair must precede data-dependent aborts)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'engagement_assignments'
       AND policyname = 'ea_select_firmwide'
  ) THEN
    RAISE EXCEPTION 'FAILPATH FAIL: data abort halted the apply before the D5 matrix was installed';
  END IF;
  RAISE NOTICE 'PASS — [failpath] leak already closed when the data abort halted the apply';
END $$;
SQL
psql -v ON_ERROR_STOP=1 -q -d "$FAIL_DB" -c \
  "UPDATE public.engagement_assignments SET end_date = '2026-12-31' WHERE assignment_id = 'fa000000-0000-4000-8000-000000000001';"
rm -f "$OUT"
OUT="$(mktemp)"
psql -v ON_ERROR_STOP=1 -d "$FAIL_DB" -f "$CORRECTIVE" > "$OUT" 2>&1 || {
  echo 'FAIL: [failpath] convergence re-run after data fix did not succeed' >&2
  cat "$OUT" >&2
  exit 1
}
grep -q 'engagement_assignments converged' "$OUT" || {
  echo 'FAIL: [failpath] convergence re-run did not reach the post-flight PASS notice' >&2
  cat "$OUT" >&2
  exit 1
}
echo "PASS — [failpath] both pre-flights loud; partial state converged on re-run"

echo "OK: lane 1 (Phase 3 → D5 → Phase 5 → corrective, all idempotent), lane 2 (drift repair by corrective alone + out-of-order Phase 3 re-apply), and lane 3 (loud-abort failure paths, both apply modes) all verified; all leakage/authz checks passed"

# ── Lane 4: Fase 2 del Scheduler — C1-C4 convergence (bugs/scheduler/fase_2/plan_v2.md) ──
# Service-scoped world: 00-shim + 30-shim-service-scope (services, categories.service_id,
# engagements.practica/responsible-personnel columns, work_orders, skills, staff_skills) +
# the D5/corrective migrations already exercised by lane 1 + the 4 historical scheduler
# migrations that create/RLS wo_staffing_requirements/wo_staffing_requirement_skills +
# C1-C4 themselves, then the 3 new suites + the schema-convergence assertions. Deliberately
# skips 20260718120000 (Phase 5 timesheet) and its shim: that migration only adds one
# function unrelated to staffing/engagement_assignments schema/RLS, so it cannot change any
# state this lane asserts on — see supabase/tests/local/30-shim-service-scope.sql's header
# for why this lane exists as a fast CI-friendly companion to the real Docker-based Rutas
# A/B/C (bugs/scheduler/fase_2/plan_v2.md's canonical gate, already closed against Supabase
# CLI real — this lane does not replace it).
run_scheduler() {
  echo "── [scheduler] $1"
  psql -v ON_ERROR_STOP=1 -d "$SCHEDULER_DB" -f "${REPO_ROOT}/$1"
}

dropdb --if-exists -- "$SCHEDULER_DB"
createdb -- "$SCHEDULER_DB"

run_scheduler supabase/tests/local/00-shim-supabase.sql
run_scheduler supabase/tests/local/30-shim-service-scope.sql
run_scheduler supabase/migrations/20260716120000_engagement_assignments_phase3.sql
run_scheduler supabase/migrations/20260717233000_engagement_assignments_d5_rls.sql
run_scheduler supabase/migrations/20260720120000_engagement_assignments_category_id_backfill.sql
run_scheduler supabase/migrations/20260506120000_wo_staffing_requirements.sql
run_scheduler supabase/migrations/20260719044642_ee740102-8b5c-4d4b-b8ee-1571ec25840b.sql
run_scheduler supabase/migrations/20260720194555_4106bdc5-1314-4e04-8a1b-49375f8d87e5.sql
run_scheduler supabase/migrations/20260720194653_61b4d8eb-86a8-495e-a572-5eeab91ebdb2.sql
run_scheduler supabase/migrations/20260727100000_scheduler_fase2_rls_grants.sql
run_scheduler supabase/migrations/20260727110000_scheduler_fase2_convergencia_esquema.sql
run_scheduler supabase/migrations/20260727120000_scheduler_fase2_rpc_save_wo_staffing.sql
run_scheduler supabase/migrations/20260727130000_scheduler_fase2_rpc_save_engagement_assignments.sql

rm -f "$OUT"
OUT="$(mktemp)"
psql -v ON_ERROR_STOP=1 -d "$SCHEDULER_DB" \
  -f "${REPO_ROOT}/supabase/tests/rls-wo-staffing-requirements.sql" 2>&1 | tee "${OUT}"
grep -q 'WO STAFFING RLS: ALL CHECKS PASSED' "${OUT}" \
  || { echo 'FAIL: [scheduler] wo_staffing_requirements RLS suite did not reach its final PASS marker' >&2; exit 1; }

rm -f "$OUT"
OUT="$(mktemp)"
psql -v ON_ERROR_STOP=1 -d "$SCHEDULER_DB" \
  -f "${REPO_ROOT}/supabase/tests/rpc-save-wo-staffing.sql" 2>&1 | tee "${OUT}"
grep -q 'SAVE_WO_STAFFING RPC: ALL CHECKS PASSED' "${OUT}" \
  || { echo 'FAIL: [scheduler] save_wo_staffing RPC suite did not reach its final PASS marker' >&2; exit 1; }

rm -f "$OUT"
OUT="$(mktemp)"
psql -v ON_ERROR_STOP=1 -d "$SCHEDULER_DB" \
  -f "${REPO_ROOT}/supabase/tests/rpc-save-engagement-assignments.sql" 2>&1 | tee "${OUT}"
grep -q 'SAVE_ENGAGEMENT_ASSIGNMENTS RPC: ALL CHECKS PASSED' "${OUT}" \
  || { echo 'FAIL: [scheduler] save_engagement_assignments RPC suite did not reach its final PASS marker' >&2; exit 1; }

rm -f "$OUT"
OUT="$(mktemp)"
psql -v ON_ERROR_STOP=1 -d "$SCHEDULER_DB" \
  -f "${REPO_ROOT}/supabase/tests/schema-convergence-assertions.sql" 2>&1 | tee "${OUT}"
grep -q 'SCHEMA CONVERGENCE: ALL CHECKS PASSED' "${OUT}" \
  || { echo 'FAIL: [scheduler] schema-convergence-assertions did not reach its final PASS marker' >&2; exit 1; }

echo "OK: lane 4 (Fase 2 del Scheduler — C1-C4 applied over the service-scoped shim; RLS matrix, both RPCs, and schema-convergence assertions all verified)"
