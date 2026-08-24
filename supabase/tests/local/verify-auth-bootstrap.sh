#!/usr/bin/env bash
# Smoke automatizado del bootstrap de Auth (plan §4.3.4ter, bugs/migracion_cero/plan_v2.md).
#
# cero_13_seed_admin_bootstrap.sql inserta directamente en auth.users/auth.identities —
# esquema gestionado por GoTrue, que puede cambiar de forma no documentada entre versiones.
# El replay + capture-route-fingerprint.sh solo prueban que las filas existen con las columnas
# que el archivo declaró; NO prueban que GoTrue pueda autenticar contra esas filas (un NULL en
# la columna equivocada, o una identity mal formada, puede pasar el fingerprint y romper el
# login real). Este script es el gate que sí lo prueba: usa la Auth Admin API para fijar una
# contraseña temporal, hace login por password, y verifica el vínculo staff/user_roles con el
# access_token real via PostgREST — exactamente el camino que un usuario real recorre.
#
# Uso:
#   supabase/tests/local/verify-auth-bootstrap.sh
# (correr en [EXEC] o en el job `consolidated-replay` del CI, DESPUÉS de que el set consolidado
# renombrado + los 7 seeds de Fase 4 ya estén aplicados sobre el stack local — nunca contra Test
# ni Lovable.)
#
# Descubre las credenciales del stack local automáticamente vía `supabase status -o env`
# (misma fuente que usa cualquier cliente que hable con el stack local) salvo que ya vengan
# seteadas en el entorno — útil para pinear manualmente en un debug puntual.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BOOTSTRAP_EMAIL="neilgraneros@ruizmier.com"
BOOTSTRAP_AUTH_ID="c32c03fd-ddfb-4ae2-9176-664982d4621e"
TEMP_PASSWORD="verify-bootstrap-$(date +%s)-$$!Aa1"

# --- 1. Credenciales del stack local -----------------------------------------------------
if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" || -z "${SUPABASE_ANON_KEY:-}" || -z "${DB_URL:-}" ]]; then
  STATUS_ENV="$(supabase status -o env 2>/dev/null || true)"
  [[ -n "$STATUS_ENV" ]] && eval "$STATUS_ENV"
fi
SUPABASE_URL="${SUPABASE_URL:-${API_URL:-http://127.0.0.1:54321}}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_ROLE_KEY:-}}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${ANON_KEY:-}}"
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

if [[ -z "$SUPABASE_SERVICE_ROLE_KEY" || -z "$SUPABASE_ANON_KEY" ]]; then
  echo "FATAL: no se pudieron resolver SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY (ni por env ni por 'supabase status -o env')" >&2
  exit 1
fi

json_field() {
  # Extrae "field":"value" de un JSON plano de un solo nivel (sin jq: no está garantizado en
  # todos los runners/entornos locales de Windows Git Bash).
  local json="$1" field="$2"
  printf '%s' "$json" | grep -o "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E "s/.*:\s*\"([^\"]*)\"/\1/"
}

# --- 2. Fijar contraseña temporal via Auth Admin API (service_role) ----------------------
echo "── PUT /auth/v1/admin/users/${BOOTSTRAP_AUTH_ID} (set password temporal)"
ADMIN_RESP="$(curl -sS -w '\n%{http_code}' -X PUT \
  "${SUPABASE_URL}/auth/v1/admin/users/${BOOTSTRAP_AUTH_ID}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"password\": \"${TEMP_PASSWORD}\"}")"
ADMIN_HTTP_CODE="$(printf '%s' "$ADMIN_RESP" | tail -1)"
ADMIN_BODY="$(printf '%s' "$ADMIN_RESP" | sed '$d')"
if [[ "$ADMIN_HTTP_CODE" != "200" ]]; then
  echo "FAIL — Admin API no pudo fijar la contraseña (HTTP ${ADMIN_HTTP_CODE}): ${ADMIN_BODY}" >&2
  echo "       Típicamente indica que el INSERT de cero_13 dejó una columna text de GoTrue en NULL en vez de ''." >&2
  exit 1
fi
echo "PASS — contraseña temporal fijada por Admin API (HTTP 200)"

# --- 3. Login por password --------------------------------------------------------------
echo "── POST /auth/v1/token?grant_type=password"
TOKEN_RESP="$(curl -sS -w '\n%{http_code}' -X POST \
  "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${BOOTSTRAP_EMAIL}\", \"password\": \"${TEMP_PASSWORD}\"}")"
TOKEN_HTTP_CODE="$(printf '%s' "$TOKEN_RESP" | tail -1)"
TOKEN_BODY="$(printf '%s' "$TOKEN_RESP" | sed '$d')"
if [[ "$TOKEN_HTTP_CODE" != "200" ]]; then
  echo "FAIL — login por password falló (HTTP ${TOKEN_HTTP_CODE}): ${TOKEN_BODY}" >&2
  echo "       Un 500 acá típicamente es GoTrue reventando al escanear un NULL en una columna text del bootstrap." >&2
  exit 1
fi
ACCESS_TOKEN="$(json_field "$TOKEN_BODY" access_token)"
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "FAIL — la respuesta de login no traía access_token: ${TOKEN_BODY}" >&2
  exit 1
fi
echo "PASS — login por password devuelve sesión (access_token presente)"

# --- 4. get_my_staff_id() via PostgREST con el access_token real -------------------------
echo "── POST /rest/v1/rpc/get_my_staff_id (con el access_token del bootstrap)"
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
  echo "       Indica que staff.auth_user_id del bootstrap no quedó vinculado al usuario de auth.users." >&2
  exit 1
fi
echo "PASS — get_my_staff_id() resuelve al staff_id del bootstrap (${STAFF_ID}) usando el access_token real"

# --- 5. Exactamente 1 fila admin en user_roles (por psql, no por la API) -----------------
echo "── psql: user_roles con role_key='admin'"
ADMIN_COUNT="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -t -A -c \
  "SELECT count(*) FROM public.user_roles WHERE role_key = 'admin';")"
if [[ "$ADMIN_COUNT" != "1" ]]; then
  echo "FAIL — user_roles: esperada exactamente 1 fila role_key='admin', encontrado ${ADMIN_COUNT}" >&2
  exit 1
fi
echo "PASS — user_roles: exactamente 1 fila role_key='admin'"

echo "VERIFY-AUTH-BOOTSTRAP: ALL CHECKS PASSED"
