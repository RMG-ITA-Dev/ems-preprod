#!/usr/bin/env bash
# Paso 20 — Fase 1: administrador genérico (admin@ruizmier.com) + 28 feriados.
#   bash scripts/etl/runbook/20-f1.sh --env test|local [--run-id 0001] [--dry-run]
# Requiere el destino en estado preinit (paso 10). Es reanudable: cada comando de la consola usa su journal.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
rb_init "$@"
rb_confirm_window
rb_write_config 1

rb_etl 1 preflight
rb_etl_mut 1 initialize
rb_etl 1 verify

rb_info "Verificadores SQL y de Auth"
if [[ "$DRY_RUN" != "1" ]]; then
  rb_psql -v etl_f1_mode=initialized -v etl_f1_admin_email=admin@ruizmier.com -f "$REPO_ROOT/supabase/tests/local/verify-seed.sql" >&2
  rb_pass "verify-seed (initialized)"
  SUPABASE_URL="$SUPABASE_URL" SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" DB_URL="${DB_URL:-}" ADMIN_TEMP_PASSWORD="$ADMIN_TEMP_PASSWORD" \
    bash "$REPO_ROOT/supabase/tests/local/verify-auth-bootstrap.sh" >&2
  rb_pass "verify-auth-bootstrap (login real y get_my_staff_id)"
fi

rb_info "Idempotencia: una segunda initialize no debe cambiar nada (no se comprobó en Test el 28/10)"
before="$(rb_scalar "select count(*)||'/'||(select count(*) from auth.users)||'/'||(select count(*) from public.holidays)||'/'||(select count(*) from public.notification_emails) from public.staff")"
rb_etl_mut 1 initialize
after="$(rb_scalar "select count(*)||'/'||(select count(*) from auth.users)||'/'||(select count(*) from public.holidays)||'/'||(select count(*) from public.notification_emails) from public.staff")"
[[ "$before" == "$after" ]] || rb_die "la segunda initialize cambió los conteos (staff/auth/feriados/correos): $before → $after"
rb_pass "segunda initialize sin cambios ($after)"
rb_counts
rb_pass "FASE 1 completa y verificada en ${ENV_NAME}"
