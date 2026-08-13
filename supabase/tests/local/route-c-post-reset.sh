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
# Verificar que el URL apunte al proyecto Test, exigiendo AMBOS componentes que lo
# identifican según el tipo de conexión (no basta con uno):
#   - directo: host == db.<ref>.supabase.co
#   - pooler:  usuario == postgres.<ref>  Y  host termina en .pooler.supabase.com
_dburl_rest="${DB_URL#*://}"
_dburl_user="${_dburl_rest%%@*}"; _dburl_user="${_dburl_user%%:*}"
_dburl_host="${_dburl_rest#*@}";  _dburl_host="${_dburl_host%%[:/?]*}"
if [[ "$_dburl_host" == "db.${EXPECTED_REF}.supabase.co" ]] \
   || { [[ "$_dburl_user" == "postgres.${EXPECTED_REF}" ]] && [[ "$_dburl_host" == *.pooler.supabase.com ]]; }; then
  : # OK — Test (conexión directa o pooler del proyecto)
else
  echo "ERROR: SUPABASE_DB_URL no apunta a Test ($EXPECTED_REF)." >&2; exit 1
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
# GoTrue normaliza el email a minúsculas al crear el usuario; lo igualamos acá para que
# la creación, la ficha de staff y los matches por email (recuperación/promoción)
# coincidan aunque SEED_ADMIN_EMAIL venga con mayúsculas.
SEED_ADMIN_EMAIL="$(printf '%s' "${SEED_ADMIN_EMAIL:-}" | tr '[:upper:]' '[:lower:]')"
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-}"
SB_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

# Escapa un valor para incrustarlo seguro en JSON (backslash y comillas dobles).
json_escape() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; printf '%s' "$s"; }

if [[ -n "$SEED_ADMIN_EMAIL" && -n "$SEED_ADMIN_PASSWORD" && -n "$SB_SERVICE_KEY" ]]; then
  SB_URL="https://${EXPECTED_REF}.supabase.co"
  echo "== Creando admin usable vía Admin API: $SEED_ADMIN_EMAIL =="
  # Rechazar caracteres de control (tab/newline/CR/…): json_escape no los escapa y
  # romperían el JSON → el Admin API rechazaría y no se crearía el admin.
  if [[ "${SEED_ADMIN_EMAIL}${SEED_ADMIN_PASSWORD}" == *[$'\x01'-$'\x1f']* ]]; then
    echo "ERROR: SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD contienen caracteres de control; quítalos." >&2
    exit 1
  fi
  admin_payload="{\"email\":\"$(json_escape "$SEED_ADMIN_EMAIL")\",\"password\":\"$(json_escape "$SEED_ADMIN_PASSWORD")\",\"email_confirm\":true}"
  # Crear el usuario, TOLERANTE a "ya existe" (rerun tras un fallo posterior): no se
  # usa --fail-with-body; se captura el HTTP code y, si no es 2xx, se verifica en la
  # BD si el usuario ya está → se continúa (los pasos de staff/rol son idempotentes).
  _resp="$(curl -sS -w '\n%{http_code}' -X POST "$SB_URL/auth/v1/admin/users" \
    -H "apikey: $SB_SERVICE_KEY" \
    -H "Authorization: Bearer $SB_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "$admin_payload")"
  _http_code="${_resp##*$'\n'}"
  if [[ "$_http_code" == 2* ]]; then
    echo "  usuario creado (HTTP $_http_code)."
  elif psql "$DB_URL" -tA -v email="$SEED_ADMIN_EMAIL" -c "select 1 from auth.users where email = :'email'" | grep -q 1; then
    echo "  el usuario ya existía (HTTP $_http_code) — se continúa (staff/rol son idempotentes)."
  else
    echo "ERROR: el Admin API falló (HTTP $_http_code) y el usuario no existe:" >&2
    echo "${_resp%$'\n'*}" >&2
    exit 1
  fi
  echo "== Vinculando ficha de staff + promoviendo a admin =="
  psql "$DB_URL" -v ON_ERROR_STOP=1 -v email="$SEED_ADMIN_EMAIL" <<'SQL'
insert into public.staff (first_name, last_name, email, category_id, is_active)
select 'Seed', 'Admin', :'email',
       (select category_id from public.categories order by display_order limit 1), true
where not exists (select 1 from public.staff where lower(trim(email)) = lower(trim(:'email')));

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
