#!/usr/bin/env bash
# RLS/RPC/schema assertion harness against a SCRATCH PostgreSQL (PR #222 finding 3: the
# suite must be executed by automation, not just documented). Connection comes from the
# standard PG* env vars; the script creates and drops its own database, so point it ONLY
# at a disposable server (CI service container or a local scratch cluster — never the
# live project).
#
# Safety (PR #222 adversarial verification P2): the database name is validated BEFORE any
# command runs — it must be `ems_rls_test` or start with `ems_rls_test_`, lowercase
# [a-z0-9_] only — and all create/drop calls go through createdb/dropdb with `--` argument
# separation, never interpolated SQL. `--self-test` exercises the validator against
# hostile names without touching any database.
#
# Migración cero (bugs/migracion_cero/plan_v2.md §2.5.b): reescrito para aplicar el set
# consolidado UNA VEZ sobre la base scratch (00-shim-auth.sql + cero_01..cero_06 — cero_07
# no aplica aquí, agrega triggers/policies sobre auth.users/storage.objects que este
# Postgres liso no tiene, y ninguna suite los necesita) y correr las suites de aserciones
# existentes sobre el estado final. Se retiran las 4 lanes anteriores (rollout histórico,
# drift, failure-path, shim de servicio del Scheduler Fase 2): probaban la mecánica de un
# historial de migraciones puntuales que ya no existe — el estado que verificaban ahora es
# simplemente el estado final del set consolidado, cubierto por estas mismas suites.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DB="${RLS_TEST_DB:-ems_rls_test}"

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

OUT=""
cleanup() {
  dropdb --if-exists -- "$DB" >/dev/null 2>&1 || true
  [[ -n "$OUT" ]] && rm -f "$OUT" 2>/dev/null || true
}
trap cleanup EXIT

dropdb --if-exists -- "$DB"
createdb -- "$DB"

run() {
  echo "── $1"
  psql -v ON_ERROR_STOP=1 -d "$DB" -f "${REPO_ROOT}/$1"
}

run supabase/tests/local/00-shim-auth.sql
run supabase/migrations/20251204000001_cero_01_extensions_enums.sql
run supabase/migrations/20251204000002_cero_02_functions_tables_views.sql
run supabase/migrations/20251204000003_cero_03_constraints_indexes.sql
run supabase/migrations/20251204000004_cero_04_triggers_fks.sql
run supabase/migrations/20251204000005_cero_05_rls_policies.sql
run supabase/migrations/20251204000006_cero_06_grants.sql

# Catálogo RBAC (authorization_roles/permissions/role_permissions): dato real de producción,
# copiado verbatim de la migración histórica 20260724010000_authz_fase2_seed.sql (23 roles/84
# permisos/737 concesiones) — ninguna migración _cero_* lo siembra (es dato, no esquema) y el
# seed de Fase 4 del plan tampoco lo cubre todavía (hallazgo documentado en
# docs/migraciones/legado-consolidacion.md). Varias suites de aserciones dependen de
# has_permission()/has_firmwide_assignment_visibility(), que leen este catálogo — sin él, esas
# suites no pueden ejercitar nada real. Se aplica una sola vez, fuera de la transacción de cada
# suite, para que todas lo compartan sin re-sembrarlo. Debe cargarse ANTES de cualquier
# migración incremental que inserte en authorization_role_permissions (0817-180 más abajo): esa
# tabla tiene FK a authorization_permissions, que este fixture es quien siembra en el harness —
# en producción esa fila ya existe de antes (hallazgo real de CI, 2026-08-27).
run supabase/tests/local/40-fixture-rbac-catalog.sql

run supabase/migrations/20260826162100_0817-180_enforce_engagement_profile_scope.sql
run supabase/migrations/20260826221706_0817-180_grant_hr_engagement_work_order.sql

# 0825-183: primera migración incremental posterior al set consolidado —
# endurece enforce_worksheet_cell_practice_scope/batch_upsert_worksheet_cells.
# El paso de limpieza de históricos es un no-op aquí (no hay datos aún en este
# punto del bootstrap); lo que importa para el harness es el CREATE OR REPLACE
# de ambas funciones, ejercitado por rpc-worksheet-activity-practice-scope.sql.
run supabase/migrations/20260825120000_0825-183_worksheet_activity_practice_scope.sql

# 0828-186: RPC list_loggable_engagements() -- selectores de carga de horas (Hoja de
# Tiempo/Tracker/Carga Manual) muestran todos los encargos elegibles sin filtrar por
# asignación. Ejercitado por rls-0828-186-loggable-engagements-rpc.sql.
run supabase/migrations/20260831013000_0828-186_list_loggable_engagements_rpc.sql

# 0828-186 (review Iteración 4): RPC list_own_timer_engagement_labels() -- respaldo de
# Tracker History (useTimerEntries) cuando el embed normal `engagement:engagements(...)` cae
# a null por RLS de asignación, incluyendo encargos que dejaron de ser cargables después de
# registrada la hora. Ejercitado por rls-0828-186-own-timer-engagement-labels.sql.
run supabase/migrations/20260831020000_0828-186_list_own_timer_engagement_labels_rpc.sql

# 0817-179: retiro del estado 9 Congelado -- backfill 9 -> NULL, CHECK de
# engagement_state_override narrowed a 1..8, y CREATE OR REPLACE de
# authorize_engagement_state_override() / engagement_accepts_assignment_writes() sin el 9.
# Ejercitado por schema-convergence-assertions.sql (verifica que un override 9 sea rechazado
# con check_violation) y por rls-0828-186-loggable-engagements-rpc.sql.
run supabase/migrations/20260902120000_0817-179_retire_frozen_engagement_state.sql

# 0828-185: RPC list_portfolio_engagements() -- Encargos/EngagementEdit/ClientEngagementsTable
# muestran solo lo creado por el usuario (mas los buckets firm/own_society/own_management por
# role_key), en vez de cualquier encargo donde figure como partner/manager/sqr/encargado.
# Ejercitado por rpc-0828-185-engagement-portfolio.sql.
run supabase/migrations/20260902163000_0828-185_engagement_portfolio_visibility_rpc.sql

# 0828-185: society_id NOT NULL + indice, CHECK manager_id <> especialista, y
# ROLE_KEY_TO_GROUPS multi-valor (get_engagement_team_candidates/enforce_engagement_creator_team).
# Ejercitado por rpc-0828-185-engagement-portfolio.sql, rpc-engagement-team-candidates.sql,
# trigger-engagement-creator-team.sql y schema-convergence-assertions.sql.
run supabase/migrations/20260902163500_0828-185_engagement_team_and_society_integrity.sql

# 0820-182: categories.default_role_key (rol que una categoría SUGIERE), su CHECK anti-admin,
# la firma nueva de create/update_category_for_practice, y el RPC SECURITY DEFINER
# sync_user_role_from_category. Ejercitado por rpc-0820-182-sync-user-role-from-category.sql.
run supabase/migrations/20260825000000_category_default_role_key.sql

# 0820-182: restaura authorization_roles.legacy_app_role (la consolidación dejó el UPDATE
# fuera del seed, y sin el espejo admin_set_user_role_key devuelve ROLE_NOT_MAPPED para TODO
# rol) + el backfill de categories.default_role_key, que depende de ese mapeo. Va DESPUÉS de
# 20260825000000 por timestamp, igual que en producción.
# Ejercitado por rpc-0820-182-sync-user-role-from-category.sql.
run supabase/migrations/20260825000100_authz_restore_legacy_app_role_mapping.sql

# 0722-156 (Fase 1): tabla exchange_rate_history + seed EXCHANGE_RATE_API_URL. Sin
# pg_cron/pg_net (scheduling diferido a un cron externo en Railway — ver plan_v2.md
# Amendment 2026-09-04 parte 2). Ejercitado por rls-exchange-rate-history.sql.
run supabase/migrations/20260905070913_0722-156_add_exchange_rate_history.sql

# 0722-156b (Fase 2): TC fijo/variable por cuota en el plan de pagos de OT --
# wo_payment_plan.exchange_rate_mode + wo_payment_installments.invoice_exchange_rate/
# payment_exchange_rate, con freeze por trigger basado en status/approval_status
# persistidos (BEFORE INSERT OR UPDATE, incl. el guard de transición legal de status) +
# sync_wo_payment_installments() (delete de huérfanos + upsert del batch de cuotas en una
# sola transacción, con validación de que las cuotas recibidas pertenezcan al plan_id
# declarado). Consolidado en un solo archivo (revisiones posteriores de la misma Fase 2 se
# editan aquí mismo, no en migraciones nuevas, mientras nada de esto se haya aplicado a un
# Supabase real). Ejercitado por trigger-0722-156b-payment-exchange-rates.sql.
run supabase/migrations/20260905172820_0722-156b_add_payment_exchange_rates.sql

# 0722-156b (review iteración 6 #1): trg_wo_payment_plan_guard_exchange_rate solo corría
# BEFORE UPDATE -- un INSERT directo podía crear un plan de pagos nuevo con TC/modo
# arbitrario para una OT ya aprobada, sin pasar por ninguna validación. Ejercitado por
# trigger-0722-156b-payment-exchange-rates.sql (sección agregada al final).
run supabase/migrations/20260908150000_0722-156b_plan_insert_guard.sql

# society/practicas(code=1): staff.society_id/practica_id y categories.practica_id son NOT NULL
# reales; varias suites (rpc-engagement-team-candidates.sql explícitamente lo exige con su
# propio guard) asumen que el catálogo mínimo de práctica/sociedad ya existe, como pasaría en
# un ambiente con el seed real de Fase 4 aplicado. Sembrado una sola vez, fuera de la
# transacción de cada suite (cada una hace BEGIN/ROLLBACK y perdería filas insertadas dentro).
psql -v ON_ERROR_STOP=1 -d "$DB" -c "
INSERT INTO public.society (society_id, name) VALUES
  ('50c00000-0000-4000-8000-000000000000', 'Harness Test Society')
ON CONFLICT DO NOTHING;
INSERT INTO public.practicas (practica_id, name, code, abbreviation) VALUES
  ('5e000000-0000-4000-8000-000000000000', 'Harness Test Practice (Auditoria)', 1, 'AUD')
ON CONFLICT (code) DO NOTHING;
"

echo "── set consolidado + catálogo RBAC + práctica/sociedad base aplicados; corriendo suites de aserciones"

assert_suite() {
  local file="$1" marker="$2"
  rm -f "$OUT"
  OUT="$(mktemp)"
  psql -v ON_ERROR_STOP=1 -d "$DB" -f "${REPO_ROOT}/${file}" 2>&1 | tee "${OUT}"
  grep -q "$marker" "${OUT}" || {
    echo "FAIL: ${file} did not reach its final PASS marker ('${marker}')" >&2
    exit 1
  }
}

assert_suite supabase/tests/rls-engagement-assignments-d5.sql 'D5 RLS: ALL CHECKS PASSED'
assert_suite supabase/tests/rls-timesheet-authorization-phase5.sql 'P5 TIMESHEET AUTHZ: ALL CHECKS PASSED'
assert_suite supabase/tests/rls-wo-staffing-requirements.sql 'WO STAFFING RLS: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-engagement-team-candidates.sql 'ENGAGEMENT_TEAM_CANDIDATES RPC: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-save-engagement-assignments.sql 'SAVE_ENGAGEMENT_ASSIGNMENTS RPC: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-save-wo-staffing.sql 'SAVE_WO_STAFFING RPC: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-worksheet-activity-practice-scope.sql 'WORKSHEET ACTIVITY PRACTICE SCOPE: ALL CHECKS PASSED'
assert_suite supabase/tests/schema-convergence-assertions.sql 'SCHEMA CONVERGENCE: ALL CHECKS PASSED'
assert_suite supabase/tests/trigger-engagement-creator-team.sql 'TRIGGER ENGAGEMENT CREATOR TEAM: ALL CHECKS PASSED'
assert_suite supabase/tests/trigger-engagement-profile-scope.sql 'PROFILE SCOPE: ALL CHECKS PASSED'
assert_suite supabase/tests/rls-0828-186-loggable-engagements-rpc.sql 'LOGGABLE ENGAGEMENTS RPC: ALL CHECKS PASSED'
assert_suite supabase/tests/rls-0828-186-own-timer-engagement-labels.sql 'OWN TIMER ENGAGEMENT LABELS RPC: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-0828-185-engagement-portfolio.sql 'PORTFOLIO ENGAGEMENTS RPC: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-0820-182-sync-user-role-from-category.sql 'SYNC USER ROLE FROM CATEGORY: ALL CHECKS PASSED'
assert_suite supabase/tests/rls-exchange-rate-history.sql 'EXCHANGE RATE HISTORY RLS: ALL CHECKS PASSED'
assert_suite supabase/tests/trigger-0722-156b-payment-exchange-rates.sql 'PAYMENT EXCHANGE RATES TRIGGERS: ALL CHECKS PASSED'

echo "OK: set consolidado (cero_01..cero_06) + migraciones 0825-183, 0817-180, 0828-186, 0828-185, 0817-179, 0820-182, 0722-156 y 0722-156b aplicadas sobre base scratch; las 16 suites de RLS/RPC/schema-convergence/trigger pasaron"
