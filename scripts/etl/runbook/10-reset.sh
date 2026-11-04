#!/usr/bin/env bash
# Paso 10 — Reset desde cero del destino (DESTRUCTIVO: borra todo, incluidas las cuentas de Auth).
#   bash scripts/etl/runbook/10-reset.sh --env test|local [--run-id 0001] [--dry-run]
#
# test : usa supabase/tests/local/reset-desde-cero.sh (pide escribir el ref; hace `db reset --linked`, borra
#        auth.users y verifica en modo preinit). Si cae en el hallazgo §6.1 (historial previo divergente,
#        «relation fund_request_number_seq already exists») NO reintenta: use 11-recover-reset.sh.
# local: `supabase db reset --local` y verify-seed preinit. Los journals externos se conservan.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
RB_NEED_AUTH=0
rb_init "$@"

if [[ "$ENV_NAME" == "local" ]]; then
  rb_confirm "RESET LOCAL" "Se reconstruirá el stack local desde cero (se pierde el estado del ensayo anterior; los journals en $STATE_BASE_POSIX no se tocan)."
  rb_mut supabase db reset --local
  [[ "$DRY_RUN" == "1" ]] || rb_psql -v etl_f1_mode=preinit -f "$REPO_ROOT/supabase/tests/local/verify-seed.sql" >&2
  rb_pass "RESET LOCAL: preinit verificado"
  exit 0
fi

rb_confirm_window
[[ -z "$(ls -A "$ETL_F1_STATE_DIR" 2>/dev/null)" ]] || rb_warn "el directorio de estado F1 ya tiene journals de esta corrida ($RUN_ID); use otro --run-id si es una instalación nueva"
export SUPABASE_URL SUPABASE_DB_URL
rb_info "Reset de Test (${PROJECT_REF}). El script pedirá escribir el ref una vez más."
set +e
rb_mut bash "$REPO_ROOT/supabase/tests/local/reset-desde-cero.sh" --project-ref "$PROJECT_REF" --env-file "$ETL_TEST_ENV_FILE"
code=$?
set -e
if [[ "$code" != "0" ]]; then
  cat >&2 <<EOF

El reset terminó con código ${code}. Si el error fue «relation "fund_request_number_seq" already exists (42P07)»
es el hallazgo conocido §6.1 de la Fase 1 (historial previo divergente): NO repita «db reset».
Continúe con:   bash scripts/etl/runbook/11-recover-reset.sh --env test --run-id ${RUN_ID}
EOF
  exit "$code"
fi
rb_counts
rb_pass "RESET TEST completo: preinit verificado"
