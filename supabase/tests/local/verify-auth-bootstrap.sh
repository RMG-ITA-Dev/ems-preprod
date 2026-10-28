#!/usr/bin/env bash
# Smoke del administrador inicial de Auth (ETL fase 1, bugs/ETL/carga/fase1/plan_v2.md §3, §5).
#
# El administrador ya NO lo siembra cero_14 (retirado): lo crea la consola específica
# `scripts/etl/fase1.mjs initialize` por la Admin API de Auth. El replay + verify-seed.sql solo
# prueban que las filas existen; este script es el gate que prueba que GoTrue puede autenticar contra
# la cuenta creada y que el vínculo staff/user_roles funciona con el access_token real via PostgREST
# — exactamente el camino que un usuario real recorre.
#
# NO cambia contraseñas ni genera identidades: consume la identidad y la contraseña de ENSAYO que
# la consola ya fijó (por entorno, nunca por argumento ni archivo).
#
# Uso (DESPUÉS de `node scripts/etl/fase1.mjs initialize ...` sobre el stack local — nunca contra
# Test ni Lovable sin que esa ejecución remota esté autorizada aparte):
#   ADMIN_TEMP_PASSWORD='<la contraseña de ensayo>' supabase/tests/local/verify-auth-bootstrap.sh
#
# Variables:
#   ADMIN_TEMP_PASSWORD   (obligatoria) contraseña con la que la consola creó la cuenta
#   ADMIN_EMAIL           (opcional)    por defecto admin@ruizmier.com (administrador genérico)
#   SUPABASE_URL / SUPABASE_ANON_KEY / DB_URL   se descubren con `supabase status -o env` si no vienen
set -euo pipefail

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@ruizmier.com}"

if [[ -z "${ADMIN_TEMP_PASSWORD:-}" ]]; then
  echo "FATAL: falta ADMIN_TEMP_PASSWORD (la contraseña de ensayo con que la consola creó a ${ADMIN_EMAIL})." >&2
  exit 1
fi

# --- 1. Credenciales del stack local -----------------------------------------------------
if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_ANON_KEY:-}" || -z "${DB_URL:-}" ]]; then
  STATUS_ENV="$(supabase status -o env 2>/dev/null || true)"
  [[ -n "$STATUS_ENV" ]] && eval "$STATUS_ENV"
fi
SUPABASE_URL="${SUPABASE_URL:-${API_URL:-http://127.0.0.1:54321}}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${ANON_KEY:-}}"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

if [[ -z "$SUPABASE_ANON_KEY" ]]; then
  echo "FATAL: no se pudo resolver SUPABASE_ANON_KEY (ni por env ni por 'supabase status -o env')" >&2
  exit 1
fi

json_field() {
  # Extrae "field":"value" de un JSON plano de un solo nivel (sin jq: no está garantizado en
  # todos los runners/entornos locales de Windows Git Bash).
  local json="$1" field="$2"
  printf '%s' "$json" | grep -o "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E "s/.*:\s*\"([^\"]*)\"/\1/"
}

# --- 2. Login por password --------------------------------------------------------------
echo "── POST /auth/v1/token?grant_type=password (${ADMIN_EMAIL})"
TOKEN_RESP="$(curl -sS -w '\n%{http_code}' -X POST \
  "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${ADMIN_EMAIL}\", \"password\": \"${ADMIN_TEMP_PASSWORD}\"}")"
TOKEN_HTTP_CODE="$(printf '%s' "$TOKEN_RESP" | tail -1)"
TOKEN_BODY="$(printf '%s' "$TOKEN_RESP" | sed '$d')"
if [[ "$TOKEN_HTTP_CODE" != "200" ]]; then
  echo "FAIL — login por password falló (HTTP ${TOKEN_HTTP_CODE}): ${TOKEN_BODY}" >&2
  echo "       400: contraseña distinta de la que fijó la consola, o la cuenta no existe (¿corrió 'initialize'?)." >&2
  echo "       500: GoTrue reventando al escanear una fila de auth.* mal formada." >&2
  exit 1
fi
ACCESS_TOKEN="$(json_field "$TOKEN_BODY" access_token)"
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "FAIL — la respuesta de login no traía access_token: ${TOKEN_BODY}" >&2
  exit 1
fi
echo "PASS — login por password devuelve sesión (access_token presente)"

# --- 3. Identidad de la sesión (GET /auth/v1/user: el primer "id" es el del usuario) ------
USER_RESP="$(curl -sS -w '\n%{http_code}' \
  "${SUPABASE_URL}/auth/v1/user" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
USER_HTTP_CODE="$(printf '%s' "$USER_RESP" | tail -1)"
USER_BODY="$(printf '%s' "$USER_RESP" | sed '$d')"
if [[ "$USER_HTTP_CODE" != "200" ]]; then
  echo "FAIL — GET /auth/v1/user falló (HTTP ${USER_HTTP_CODE}): ${USER_BODY}" >&2
  exit 1
fi
AUTH_USER_ID="$(json_field "$USER_BODY" id)"
if ! [[ "$AUTH_USER_ID" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "FAIL — no se pudo extraer el id del usuario autenticado: ${USER_BODY}" >&2
  exit 1
fi
echo "PASS — la sesión corresponde al usuario de auth.users ${AUTH_USER_ID}"

# --- 4. get_my_staff_id() via PostgREST con el access_token real -------------------------
echo "── POST /rest/v1/rpc/get_my_staff_id (con el access_token del administrador)"
STAFF_RESP="$(curl -sS -w '\n%{http_code}' -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/get_my_staff_id" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}')"
STAFF_HTTP_CODE="$(printf '%s' "$STAFF_RESP" | tail -1)"
STAFF_BODY="$(printf '%s' "$STAFF_RESP" | sed '$d')"
if [[ "$STAFF_HTTP_CODE" != "200" ]]; then
  echo "FAIL — get_my_staff_id() vía PostgREST falló (HTTP ${STAFF_HTTP_CODE}): ${STAFF_BODY}" >&2
  exit 1
fi
STAFF_ID="$(printf '%s' "$STAFF_BODY" | tr -d '"[:space:]')"
if [[ -z "$STAFF_ID" || "$STAFF_ID" == "null" ]]; then
  echo "FAIL — get_my_staff_id() devolvió vacío/null: ${STAFF_BODY}" >&2
  echo "       Indica que staff.auth_user_id del administrador no quedó vinculado al usuario de auth.users." >&2
  exit 1
fi
echo "PASS — get_my_staff_id() resuelve al staff_id del administrador (${STAFF_ID}) usando el access_token real"

# --- 5. Enlace y rol por psql (no por la API): exactamente 1 admin y es esta cuenta -------
echo "── psql: enlace ficha↔Auth y user_roles"
# Los parámetros van por -v y el SQL por stdin (-f -): psql no interpola :'var' dentro de -c en todas las versiones.
LINKED="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -t -A \
  -v staff_id="$STAFF_ID" -v auth_id="$AUTH_USER_ID" -f - <<< \
  "SELECT count(*) FROM public.staff WHERE staff_id = :'staff_id'::uuid AND auth_user_id = :'auth_id'::uuid;")"
if [[ "$LINKED" != "1" ]]; then
  echo "FAIL — la ficha ${STAFF_ID} no está enlazada a la cuenta ${AUTH_USER_ID}" >&2
  exit 1
fi
echo "PASS — staff.auth_user_id enlaza la ficha con la cuenta autenticada"

ADMIN_COUNT="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -t -A -c \
  "SELECT count(*) FROM public.user_roles WHERE role_key = 'admin';")"
if [[ "$ADMIN_COUNT" != "1" ]]; then
  echo "FAIL — user_roles: esperada exactamente 1 fila role_key='admin', encontrado ${ADMIN_COUNT}" >&2
  exit 1
fi
OWN_ROLE="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -t -A -v auth_id="$AUTH_USER_ID" -f - <<< \
  "SELECT role::text || '/' || role_key FROM public.user_roles WHERE user_id = :'auth_id'::uuid;")"
if [[ "$OWN_ROLE" != "admin/admin" ]]; then
  echo "FAIL — el rol de ${AUTH_USER_ID} es '${OWN_ROLE}', se esperaba 'admin/admin'" >&2
  exit 1
fi
echo "PASS — user_roles: exactamente 1 fila admin y es la del administrador (admin/admin)"

echo "VERIFY-AUTH-BOOTSTRAP: ALL CHECKS PASSED"
