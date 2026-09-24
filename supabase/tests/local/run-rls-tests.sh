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
# Safety (review.md dash_encargo iteración 1, SF-04): the db-name check alone does not stop
# a misconfigured PGHOST from pointing this script's dropdb/createdb at a real server — this
# repo's own rule is that no migration/suite from here ever touches a real Supabase project
# (Lovable/Dev 2.0/Test; those live in ../EMS_Dev_Supabase/). PGHOST is validated to be a
# loopback address (or unset, i.e. the local Unix socket) BEFORE anything destructive runs.
# This is defense in depth on top of the db-name check, not a replacement for it.
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

# review.md dash_encargo iteración 1, SF-04: rejects any PGHOST that is not a loopback
# address. Unset (the default local Unix socket) and the standard loopback spellings pass;
# anything else — a hostname, a remote IP, a real Supabase pooler — is refused before dropdb/
# createdb ever run.
validate_server() {
  local host="${PGHOST:-}"
  case "$host" in
    "" | "localhost" | "127.0.0.1" | "::1") ;;
    *)
      echo "FATAL: PGHOST ('${host}') is not a loopback address — refusing to run dropdb/createdb against it. This harness must only ever touch a disposable local Postgres; point PGHOST at localhost/127.0.0.1 (or unset it) — never at Lovable/Dev 2.0/Test." >&2
      return 1
      ;;
  esac
}

if [[ "${1:-}" == "--self-test" ]]; then
  fail=0
  for bad_host in 'db.supabase.co' 'aws-0-us-east-1.pooler.supabase.com' '10.0.0.5' 'production-db'; do
    if PGHOST="$bad_host" validate_server 2>/dev/null; then
      echo "SELF-TEST FAIL: unsafe PGHOST accepted: '${bad_host}'" >&2
      fail=1
    fi
  done
  for good_host in '' 'localhost' '127.0.0.1' '::1'; do
    if ! PGHOST="$good_host" validate_server 2>/dev/null; then
      echo "SELF-TEST FAIL: safe PGHOST rejected: '${good_host}'" >&2
      fail=1
    fi
  done
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
  echo "OK: db-name + server validators self-test passed (18 hostile names + 4 hostile hosts rejected, 3 safe names + 4 safe hosts accepted)"
  exit 0
fi

validate_db_name "$DB"
validate_server

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

# 0722-156b (review iteración 6 #1 / iteración 8 #2 / iteración 9 #3 / iteración 12 #2 /
# iteración 13 / iteración 14 #1): además del modelo de autorización del TC inicial
# (solo el gerente del encargo o admin, con el token EXCHANGE_RATE_FORBIDDEN), agrega
# trg_wo_payment_plan_sync_fixed_installments (AFTER UPDATE) -- cambiar el TC del plan
# en modo Fijo no forzaba que las cuotas Pending ya guardadas lo siguieran; ahora se
# re-sincronizan en cascada, en la misma transacción, sin depender de una 2da llamada
# separada desde el frontend.
# trg_wo_payment_plan_guard_exchange_rate solo corría BEFORE UPDATE -- un INSERT directo
# podía crear un plan de pagos nuevo con TC/modo arbitrario para una OT ya aprobada o en
# revisión, sin pasar por ninguna validación. Consolidada acá también la corrección de
# sync_wo_payment_installments (validaba que un installment_id existente perteneciera a
# p_plan_id, pero nunca que p_plan_id perteneciera realmente a p_wo_id -- RLS autoriza por
# plan_id, no por la columna wo_id de la fila) -- vivía en un archivo aparte
# (20260908160000) hasta que se fusionó acá el 2026-09-08 porque ninguna de las 2 se había
# aplicado nunca a un Supabase real. También agrega el branch TG_OP = 'DELETE' (faltaba
# por completo -- un DELETE directo del plan, con todas sus cuotas todavía Pending,
# borraba en cascada el plan de una OT ya Aprobada sin ningún chequeo) y el trigger pasa
# a BEFORE INSERT OR UPDATE OR DELETE. Ejercitado por
# trigger-0722-156b-payment-exchange-rates.sql (secciones agregadas al final).
run supabase/migrations/20260908150000_0722-156b_plan_insert_guard.sql

# 0722-156b (review iteración 12 #1 / iteración 13 / iteración 14 #2): en modo fijo, el
# chequeo de coincidencia con el TC del plan solo se evaluaba en UPDATE, nunca en un
# INSERT real de cuota -- corregido. También agrega el rol collections_analyst/admin
# exigido para capturar TC por cuota en modo Variable (token EXCHANGE_RATE_FORBIDDEN).
# Ejercitado por trigger-0722-156b-payment-exchange-rates.sql (secciones agregadas al
# final).
run supabase/migrations/20260910090000_0722-156b_fixed_mode_rate_guard.sql

# 0722-156b (review iteración 15/16, greptile + codex): senior_partner/partner nunca
# debieron tener work_order.create -- el seed cero_13 ya se corrigió para una
# instalación nueva, pero un ambiente donde ese seed ya corrió antes de la corrección
# conserva esas 2 filas. DELETE forward-only, no depende de un paso manual por ambiente.
run supabase/migrations/20260910100000_0722-156b_revoke_wo_create_partner_senior_partner.sql

# Notificaciones: un archivo por CAPA, y en este orden.
#   01 catalogo     tablas, notify_staff() como porton unico, los contadores,
#                   get_my_notifications(), la bandeja de salida de correos, el drenaje,
#                   la vista legacy con seen_at, RLS y grants.
#   02 seed         archivo generado desde la matriz de notificaciones. Va segundo por la FK
#                   a notification_types (y a authorization_roles, de cero_13).
#   03 disparadores los emisores de los modulos con triggers: Fondos, Ordenes de Trabajo,
#                   Encargos, Tiempos (timesheets/aprobaciones/tracker), Cuentas/Auth
#                   (cuentas, personal y competencias), Clientes y Hojas de Trabajo, mas los
#                   recordatorios periodicos. Sin los tipos sembrados, notify_staff los
#                   descarta en silencio, asi que va despues del seed.
# Ejercitado por rpc-notificaciones-fase1.sql y rpc-notificaciones-correos.sql.
run supabase/migrations/20260911100000_notificaciones_01_catalogo.sql
run supabase/migrations/20260911100100_notificaciones_02_seed.sql
run supabase/migrations/20260911100200_notificaciones_03_disparadores.sql

# Fix del numerador de solicitudes de fondos (lpad truncando). NO es de notificaciones: se
# encontro probando ese flujo y vive aparte para poder revertirse por separado.
run supabase/migrations/20260911100500_fund_request_number_lpad.sql

# Fecha local en get_week_statuses/get_my_pending_hours. Tampoco es de notificaciones: CURRENT_DATE
# se evaluaba en UTC y adelantaba el dia a partir de las 20:00 en Bolivia. Recrea las dos funciones
# de cero_02 con CREATE OR REPLACE, asi que tiene que correr DESPUES de el.
run supabase/migrations/20260911100600_fecha_local_current_date.sql

# Throttle de los correos de cuenta. Desde que los correos de cuenta salen por Microsoft
# Graph, GoTrue ya no cuenta ninguno, y este es el freno que lo reemplaza para el formulario
# publico de "olvide mi contrasena".
run supabase/migrations/20260911110000_0601-130_throttle_correo_auth.sql

# dash_socio: prerrequisito de TC (wo_payment_plan.exchange_rate NOT NULL DEFAULT
# latest_exchange_rate(), con backfill y CHECK > 0), permiso dashboard.partner.read (6
# concesiones: senior_partner/admin/partner/director/sqr/risk_partner -- comentario
# corregido en review.md iteracion 2/SF-03, admin y risk_partner ya estaban incluidos en
# el SQL desde las correcciones del operador del 2026-09-16, este comentario habia quedado
# desactualizado), effective_engagement_state() (espejo SQL de src/lib/engagementStatus.ts)
# y los RPC partner_overview()/partner_overview_engagements() del tablero Socio. Ejercitado
# por rpc-dash-socio-partner-overview.sql.
run supabase/migrations/20260915130000_dash_socio_partner_overview.sql

# dash_cartera: rediseño de la pestaña Cartera -- tabla portfolio_events (bitácora
# append-only de partner_id/manager_id, sin backfill), trigger log_engagement_assignment_
# change() y el RPC portfolio_overview() (5 KPI + 5 filas de bloques, un round-trip).
# Dependencia dura: usa effective_engagement_state()/latest_exchange_rate() de la migración
# dash_socio de arriba -- por eso corre inmediatamente después. Ejercitado por
# rpc-dash-cartera-portfolio-overview.sql.
run supabase/migrations/20260917160000_dash_cartera_portfolio_overview.sql

# dash_encargo: rediseño de la pestaña Encargo -- can_read_engagement_dashboard() (única
# materialización del alcance por rol de decisiones.md §2), list_dashboard_engagements()
# (selector, filtrado a funcion=1/Cliente) y engagement_overview() (payload completo: 4 KPI,
# consumo de presupuesto, desglose Categoría->Actividad, equipo responsable, staffing con 9
# semanas precargadas, gastos normalizados a BOB, cola de aprobación por persona).
# Dependencia dura: usa latest_exchange_rate() de la migración dash_socio de arriba.
# Ejercitado por rpc-dash-encargo-engagement-overview.sql.
run supabase/migrations/20260918120000_dash_encargo_engagement_overview.sql

# dash_personal: rediseño de la pestaña Personal -- un único RPC personal_overview() (payload
# operativo e histórico: semana actual + 3 siguientes, carga por encargo/función, 12 semanas
# de cumplimiento de timesheets, fondos/gastos separados por moneda de fuente, próximos
# vencimientos). No agrega ningún permiso nuevo (dashboard.personal.read ya está concedido a
# los 22 role_key reales desde cero_13) ni ninguna policy de RLS -- filtra explícitamente por
# staff_id = get_my_staff_id() en cada CTE. Ejercitado por rpc-dash-personal-overview.sql.
run supabase/migrations/20260921140000_dash_personal_overview.sql

# 0722-160: las dos sociedades reales deben existir antes de aplicar la migración,
# pues sus clientes internos se siembran y validan contra este catálogo.
#
# Los UUID llevan el sufijo 0160 a propósito: ...0001 ya lo ocupa 'D5 Test Society', que
# rls-engagement-assignments-d5.sql inserta dentro de su propia transacción. Como este seed
# corre antes y fuera de ella, el UUID compartido reventaba esa suite —y con ella el harness
# entero— con `duplicate key value violates unique constraint "society_pkey"`. La migración
# empareja cliente y sociedad por NOMBRE, así que el UUID es libre.
psql -v ON_ERROR_STOP=1 -d "$DB" -c "
INSERT INTO public.society (society_id, name) VALUES
  ('50c00000-0000-4000-8000-000000000160', 'Ruizmier Pelaez S.R.L.'),
  ('50c00000-0000-4000-8000-000000000161', 'Ruizmier Jauregui S.R.L.')
ON CONFLICT DO NOTHING;
"
run supabase/migrations/20260918120000_0722_160_administrative_engagements.sql

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
assert_suite supabase/tests/rpc-notificaciones-fase1.sql 'NOTIFICACIONES FASE 1: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-notificaciones-correos.sql 'NOTIFICACIONES CORREOS: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-throttle-correo-auth.sql 'THROTTLE CORREO AUTH: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-fecha-local.sql 'FECHA LOCAL: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-dash-socio-partner-overview.sql 'PARTNER OVERVIEW RPC: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-dash-cartera-portfolio-overview.sql 'CARTERA OVERVIEW RPC: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-dash-encargo-engagement-overview.sql 'ENGAGEMENT OVERVIEW RPC: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-dash-personal-overview.sql 'PERSONAL OVERVIEW RPC: ALL CHECKS PASSED'
assert_suite supabase/tests/rpc-0722-160-administrative-engagements.sql 'ADMINISTRATIVE ENGAGEMENTS: ALL CHECKS PASSED'

echo "OK: set consolidado (cero_01..cero_06) + migraciones incrementales, 0722-160 y notificaciones/correos aplicadas sobre base scratch; las 21 suites de RLS/RPC/schema-convergence/trigger pasaron"
