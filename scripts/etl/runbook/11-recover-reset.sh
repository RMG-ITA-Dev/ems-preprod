#!/usr/bin/env bash
# Paso 11 — Recuperación guiada del hallazgo §6.1 tras un reset de Test que abortó (SOLO TEST).
#   bash scripts/etl/runbook/11-recover-reset.sh --env test [--run-id 0001] [--dry-run]
#
# Reproduce, con comprobaciones, lo que se hizo a mano el 28/10: el `db reset --linked` cae en `cero_01` con
# «relation "fund_request_number_seq" already exists» porque el proyecto tenía un historial previo y esa
# secuencia suelta sobrevive. El script:
#   1. Diagnostica (solo lectura). Si lo que sobrevive NO es exactamente esa secuencia, se detiene.
#   2. Con su confirmación escrita, hace DROP de esa única secuencia.
#   3. `supabase db push --include-all --linked` (no un segundo reset).
#   4. Borra las cuentas de Auth (el paso 4b del reset, que no llegó a correr) y verifica que queden en cero.
#   5. Verifica convergencia del ledger y `verify-seed` en modo preinit.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
RB_NEED_AUTH=0
rb_init "$@"
[[ "$ENV_NAME" == "test" ]] || rb_die "la recuperación §6.1 solo aplica a Test"
rb_confirm_window

rb_info "1. Diagnóstico (solo lectura)"
ledger_table="$(rb_scalar "select coalesce(to_regclass('supabase_migrations.schema_migrations')::text,'')")"
ledger_rows=0; [[ -n "$ledger_table" ]] && ledger_rows="$(rb_scalar "select count(*) from supabase_migrations.schema_migrations")"
leftovers="$(rb_scalar "select coalesce(string_agg(c.relname || ':' || c.relkind::text, ',' order by c.relname), '') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m','S','p','f')")"
types_left="$(rb_scalar "select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype in ('e','d')")"
funcs_left="$(rb_scalar "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')")"
auth_users="$(rb_scalar "select count(*) from auth.users")"
printf 'ledger=%s filas · objetos en public=[%s] · enums/dominios=%s · funciones sueltas=%s · auth.users=%s\n' "$ledger_rows" "$leftovers" "$types_left" "$funcs_left" "$auth_users" >&2

if [[ "$leftovers" == "fund_request_number_seq:S" && "$ledger_rows" == "0" && "$types_left" == "0" && "$funcs_left" == "0" ]]; then
  rb_pass "el diagnóstico coincide exactamente con el hallazgo §6.1"
  rb_confirm "DROP fund_request_number_seq" "Se eliminará únicamente la secuencia suelta public.fund_request_number_seq de Test (${PROJECT_REF})."
  rb_mut rb_psql -c "DROP SEQUENCE public.fund_request_number_seq"
elif [[ -z "$leftovers" && "$ledger_rows" == "0" && "$types_left" == "0" && "$funcs_left" == "0" ]]; then
  rb_pass "no sobrevive ningún objeto: se continúa directamente con el push"
else
  rb_die "el estado de Test NO es el del hallazgo §6.1 (sobreviven otros objetos o hay ledger). No se hace ningún DROP automático: revise con Marcelo."
fi

rb_info "2. Aplicar las migraciones al destino explícito"
linked="$( [[ -f supabase/.temp/project-ref ]] && tr -d '[:space:]' < supabase/.temp/project-ref || sed -n 's/.*"ref"[[:space:]]*:[[:space:]]*"\([a-z0-9]*\)".*/\1/p' supabase/.temp/linked-project.json 2>/dev/null )"
[[ "$linked" == "$PROJECT_REF" ]] || { rb_warn "el vínculo actual es '$linked': se vincula a Test"; rb_mut supabase link --project-ref "$PROJECT_REF"; }
if [[ "$DRY_RUN" != "1" ]]; then
  linked="$( [[ -f supabase/.temp/project-ref ]] && tr -d '[:space:]' < supabase/.temp/project-ref || sed -n 's/.*"ref"[[:space:]]*:[[:space:]]*"\([a-z0-9]*\)".*/\1/p' supabase/.temp/linked-project.json )"
  [[ "$linked" == "$PROJECT_REF" ]] || rb_die "el vínculo sigue sin apuntar a Test"
fi
rb_mut env SUPABASE_DB_PASSWORD="$PGPASSWORD" supabase db push --include-all --linked

rb_info "3. Cuentas de Auth: paso 4b del reset, que no llegó a ejecutarse"
if [[ "$DRY_RUN" != "1" ]]; then
  rb_psql -q <<'SQL'
DELETE FROM auth.users;
DO $$ BEGIN IF to_regclass('auth.audit_log_entries') IS NOT NULL THEN EXECUTE 'DELETE FROM auth.audit_log_entries'; END IF; END $$;
SQL
  left="$(rb_scalar "select (select count(*) from auth.users)+(select count(*) from auth.identities)+(select count(*) from auth.sessions)+(select count(*) from auth.refresh_tokens)")"
  [[ "$left" == "0" ]] || rb_die "quedan $left filas de Auth tras el borrado"
  rb_pass "cuentas de Auth en cero (users, identities, sessions, refresh_tokens)"
fi

rb_info "4. Convergencia y verificación preinit"
rb_mut env SUPABASE_DB_PASSWORD="$PGPASSWORD" supabase db push --dry-run --include-all --linked
if [[ "$DRY_RUN" != "1" ]]; then
  ledger="$(rb_scalar "select count(*) from supabase_migrations.schema_migrations")"
  [[ "$ledger" == "$EXPECTED_MIGRATIONS" ]] || rb_die "ledger de ${ledger} migraciones (se esperaban ${EXPECTED_MIGRATIONS})"
  rb_pass "ledger = ${ledger} migraciones"
  rb_psql -v etl_f1_mode=preinit -f "$REPO_ROOT/supabase/tests/local/verify-seed.sql" >&2
fi
rb_pass "RECUPERACIÓN §6.1 completa: Test reconstruido y verificado en modo preinit"
