#!/usr/bin/env bash
# Ruta C — POST-RESET (paso final): restaura grants + RLS, setea el secreto
# FRONTEND_URL, despliega las edge functions y crea el admin usable + su ficha
# de staff. Se corre UNA vez, tras la etapa 2 (las 177 ya aplicadas) — deja Test
# usable, igual que quedó tras Ruta A (Opción B). NO es parte de la convergencia.
#
# Correr DESDE el worktree de Ruta C, enlazado a Test. Ver RUNBOOK-ruta-c.md.
#
# Variables (todas opcionales salvo SUPABASE_DB_URL):
#   SUPABASE_DB_URL           (obligatoria) cadena psql a Test (Session pooler)
#   FRONTEND_URL              secreto CORS de dashboard/scheduler
#   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SUPABASE_SERVICE_ROLE_KEY  admin usable
set -euo pipefail

EXPECTED_REF="slkqdcwwvmjtcbakajib"
export PGCLIENTENCODING=UTF8

# --- Guardián: SUPABASE_DB_URL y el proyecto enlazado deben ser Test ---
DB_URL="${SUPABASE_DB_URL:-}"
if [[ -z "$DB_URL" ]]; then
  echo "ERROR: SUPABASE_DB_URL no está seteado." >&2; exit 1
fi
# El ref debe estar en el HOST (db.<ref>.supabase.co) o el USUARIO (postgres.<ref>),
# NO un substring en cualquier parte (un ref en el password apuntando a otra base pasaría).
if [[ "$DB_URL" != *"db.${EXPECTED_REF}.supabase.co"* && "$DB_URL" != *"postgres.${EXPECTED_REF}"* ]]; then
  echo "ERROR: SUPABASE_DB_URL no apunta al host/usuario de Test ($EXPECTED_REF)." >&2; exit 1
fi
LINKED_REF=""
if [[ -f supabase/.temp/project-ref ]]; then
  LINKED_REF="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
elif [[ -f supabase/.temp/linked-project.json ]]; then
  LINKED_REF="$(sed -n 's/.*"ref"[[:space:]]*:[[:space:]]*"\([a-z0-9]*\)".*/\1/p' supabase/.temp/linked-project.json)"
fi
if [[ "$LINKED_REF" != "$EXPECTED_REF" ]]; then
  echo "ERROR: proyecto enlazado ('${LINKED_REF:-<ninguno>}') != Test ($EXPECTED_REF)." >&2; exit 1
fi

# 1) Grants + RLS (el reset pierde los grants a anon/authenticated y deja RLS off).
echo "== Restaurando grants + activando RLS (post-reset) =="
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/local/post-reset-grants-rls.sql

# 2) Secreto FRONTEND_URL (CORS de dashboard-data / scheduler-data / scheduler-gaps).
FRONTEND_URL="${FRONTEND_URL:-}"
if [[ -n "$FRONTEND_URL" ]]; then
  echo "== Seteando secreto FRONTEND_URL=$FRONTEND_URL =="
  supabase secrets set FRONTEND_URL="$FRONTEND_URL"
else
  echo "AVISO: FRONTEND_URL no seteada — se salta el secreto (dashboard/scheduler fallarán CORS)."
fi

# 3) Edge functions (NO vuelven con las migraciones).
echo "== Desplegando las edge functions al proyecto enlazado (Test) =="
supabase functions deploy

# 4) Admin usable + ficha de staff + promoción (opcional, por env).
SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-}"
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-}"
SB_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

# Escapa un valor para incrustarlo seguro en JSON (backslash y comillas dobles).
json_escape() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; printf '%s' "$s"; }

if [[ -n "$SEED_ADMIN_EMAIL" && -n "$SEED_ADMIN_PASSWORD" && -n "$SB_SERVICE_KEY" ]]; then
  SB_URL="https://${EXPECTED_REF}.supabase.co"
  echo "== Creando admin usable vía Admin API: $SEED_ADMIN_EMAIL =="
  # email/password escapados; --fail-with-body aborta (set -e) si el Admin API
  # responde HTTP >= 400 (usuario duplicado, credenciales inválidas, etc.).
  admin_payload="{\"email\":\"$(json_escape "$SEED_ADMIN_EMAIL")\",\"password\":\"$(json_escape "$SEED_ADMIN_PASSWORD")\",\"email_confirm\":true}"
  curl -sS --fail-with-body -X POST "$SB_URL/auth/v1/admin/users" \
    -H "apikey: $SB_SERVICE_KEY" \
    -H "Authorization: Bearer $SB_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "$admin_payload"
  echo ""
  echo "== Vinculando ficha de staff + promoviendo a admin =="
  psql "$DB_URL" -v ON_ERROR_STOP=1 -v email="$SEED_ADMIN_EMAIL" <<'SQL'
insert into public.staff (first_name, last_name, email, category_id, is_active)
select 'Seed', 'Admin', :'email',
       (select category_id from public.categories order by display_order limit 1), true
where not exists (select 1 from public.staff where email = :'email');

update public.user_roles
set role = 'admin', role_key = 'admin'
where user_id = (select id from auth.users where email = :'email');

-- Verificar que el admin quedó realmente configurado; si no, abortar (no salir "ok").
select set_config('seed.admin_email', :'email', false);
do $$
begin
  if not exists (
    select 1 from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    where u.email = current_setting('seed.admin_email') and ur.role_key = 'admin'
  ) then
    raise exception 'Admin % no quedó configurado (usuario o rol ausente).', current_setting('seed.admin_email');
  end if;
end $$;
SQL
else
  echo "AVISO: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SUPABASE_SERVICE_ROLE_KEY no"
  echo "       seteadas — no se crea admin usable (el preseed-admin no sirve para login)."
fi
