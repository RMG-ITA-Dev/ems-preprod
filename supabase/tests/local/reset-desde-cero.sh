#!/usr/bin/env bash
# Reset-desde-cero: reconstruye CUALQUIER proyecto Supabase (el que se le indique) desde
# volumen vacío, aplicando el set consolidado + seed de la migración cero
# (bugs/migracion_cero/plan_v2.md, Fase 7). Genérico a propósito — el mismo script sirve
# para "Test" hoy, o para cualquier ambiente nuevo que se levante después.
#
# Fase 1 ETL (bugs/ETL/carga/fase1/plan_v2.md §5): este script SOLO RECONSTRUYE y verifica en modo
# `preinit` (catálogos y configuración definitivos; cero clientes, staff, cuentas de usuario, roles
# y feriados). NO inicializa ni declara operativo el ambiente: el primer administrador
# (admin@ruizmier.com) y el calendario los crea después la consola específica
# `scripts/etl/fase1.mjs initialize`, un paso aparte con su propia autorización. El tratamiento de
# las cuentas de Auth de ensayo de un reset previo se controla fuera de este script (un reset de
# base no elimina por sí solo las cuentas de Auth): ver docs/migraciones/reset-desde-cero.md.
#
# NUNCA lee el CONTENIDO de un .env* con este script mismo ni lo imprime: solo hace `source`
# del archivo indicado (en un subproceso) y verifica por NOMBRE que las variables necesarias
# existan; los valores viajan directo del entorno a los comandos (`supabase`/`psql`/`curl`),
# nunca a través de un `echo`.
#
# Uso:
#   supabase/tests/local/reset-desde-cero.sh --project-ref <REF> --env-file <ruta-al-.env>
#
# Ejemplo (Test):
#   supabase/tests/local/reset-desde-cero.sh \
#     --project-ref slkqdcwwvmjtcbakajib \
#     --env-file .env.migracion.local
#
# Variables esperadas en el .env indicado (solo las "públicas" — las que el frontend ya
# expone, seguras de tener en un archivo): URL del proyecto y anon/publishable key. Se
# aceptan varios alias — el primero que exista gana; ninguno es leído acá, solo comprobado
# que EXISTA:
#   API REST/Auth del proyecto: SUPABASE_URL | API_URL | VITE_SUPABASE_URL
#   anon/publishable key      : SUPABASE_ANON_KEY | ANON_KEY | SUPABASE_PUBLISHABLE_KEY | VITE_SUPABASE_PUBLISHABLE_KEY
#
# La credencial FUERTE (conexión a Postgres con password, por el pooler) nunca se lee de un
# archivo: si ya está exportada en el entorno se usa tal cual (nunca impresa); si no, el script la
# pide por prompt interactivo con eco apagado (no queda en el historial de la shell ni en ningún
# archivo). Nunca la pegués en el chat de un agente ni la guardes en un .env trackeado — si alguna
# vez termina en un lugar así, rotala desde el dashboard de Supabase (Settings → Database) en
# cuanto puedas. La service_role/secret key YA NO se pide acá: la necesita la consola de
# inicialización (scripts/etl/fase1.mjs), que es un paso aparte.
#   Conexión Postgres directa : SUPABASE_DB_URL | DB_URL
#
# Requiere: Supabase CLI (versión pineada en supabase/tests/fixtures/route-fingerprints/
# VERSIONS.md), psql, curl. Corre DESDE la raíz de un checkout que tenga el set consolidado
# en supabase/migrations/ (14 archivos: cero_01..cero_07 esquema + cero_10..cero_16 seed).
#
# SEGURIDAD: este script hace `supabase db reset --linked` — DESTRUYE todos los datos del
# proyecto al que esté linkeado en ese momento. Pide confirmación interactiva escribiendo el
# project-ref exacto antes de tocar nada. Nunca correrlo con `yes |` ni en un pipe no
# interactivo salvo que se sepa exactamente lo que se está haciendo.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PROJECT_REF=""
ENV_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-ref) PROJECT_REF="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    *) echo "FATAL: argumento desconocido: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$PROJECT_REF" || -z "$ENV_FILE" ]]; then
  echo "Uso: $0 --project-ref <REF> --env-file <ruta-al-.env>" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: no existe el archivo de env indicado: $ENV_FILE" >&2
  exit 1
fi
if ! [[ "$PROJECT_REF" =~ ^[a-z0-9]{20}$ ]]; then
  echo "FATAL: PROJECT_REF no tiene la forma esperada de un ref de Supabase (20 caracteres alfanuméricos en minúscula): '${PROJECT_REF}'" >&2
  exit 1
fi

# --- 1. Cargar el .env indicado (sin imprimir nada de su contenido) -----------------------
# Limpiar antes los alias "públicos" (URL/anon key) y los alias de las credenciales fuertes:
# si esta misma shell corrió el script antes contra OTRO proyecto, esos nombres pueden seguir
# exportados con el valor viejo y taparían lo que este $ENV_FILE define bajo un alias distinto
# (hallazgo de review de PR #310 — resolve_alias() de más abajo siempre mira primero el nombre
# canónico). SUPABASE_DB_URL y SUPABASE_SERVICE_ROLE_KEY (los 2 nombres canónicos de las
# credenciales fuertes) se dejan intactos a propósito: pinearlos pre-exportados antes de invocar
# el script sigue siendo válido (ver cabecera), y quedan validados contra PROJECT_REF más abajo.
#
# Los ALIAS de las credenciales fuertes (DB_URL, SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY) son un
# caso aparte: la cabecera promete que esas 2 credenciales "nunca se leen de un archivo", pero
# si el operador las pre-exportó bajo esos alias (válido) y el $ENV_FILE también los define
# (nunca debería, pero source no distingue), source pisaría el pre-export con el del archivo.
# Se guardan acá para restaurarlos después del source y así descartar lo que el archivo haya
# puesto bajo esos nombres, sin perder un pre-export legítimo (hallazgo de review de PR #310).
_pre_DB_URL="${DB_URL:-}"
_pre_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-}"
_pre_SUPABASE_SECRET_KEY="${SUPABASE_SECRET_KEY:-}"
# PROJECT_REF/ENV_FILE son variables de CONTROL del script, ya parseadas de los argumentos de
# línea de comandos y validadas (línea ~67) antes de llegar acá — no del .env. Si el archivo
# indicado por --env-file también define alguna de las dos por casualidad (p.ej. alguien guarda
# "PROJECT_REF=..." en su .env de conveniencia, un nombre muy natural dado que es literal el
# nombre del flag), `source` la pisaría, y todo lo que sigue (validaciones, `supabase link`, el
# prompt de confirmación, el reset destructivo) usaría el valor del archivo en vez del que el
# operador tipeó y que ya pasó la validación de formato (hallazgo de review de PR #310) — sin
# ninguna señal visible de que el cambio ocurrió, porque el propio prompt de confirmación solo
# muestra el valor ya pisado. Se capturan acá y se restauran después del source.
_cli_PROJECT_REF="$PROJECT_REF"
_cli_ENV_FILE="$ENV_FILE"
unset SUPABASE_URL API_URL VITE_SUPABASE_URL
unset SUPABASE_ANON_KEY ANON_KEY SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_PUBLISHABLE_KEY
unset DB_URL SERVICE_ROLE_KEY SUPABASE_SECRET_KEY
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
PROJECT_REF="$_cli_PROJECT_REF"
ENV_FILE="$_cli_ENV_FILE"
unset _cli_PROJECT_REF _cli_ENV_FILE

# El $ENV_FILE pudo haber definido DB_URL/SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY — se descartan
# sin usarlos (las 2 credenciales fuertes nunca vienen del archivo, sea por su nombre canónico
# o por alias) y se restaura el pre-export del operador, si existía.
unset DB_URL SERVICE_ROLE_KEY SUPABASE_SECRET_KEY
[[ -n "$_pre_DB_URL" ]] && export DB_URL="$_pre_DB_URL"
[[ -n "$_pre_SERVICE_ROLE_KEY" ]] && export SERVICE_ROLE_KEY="$_pre_SERVICE_ROLE_KEY"
[[ -n "$_pre_SUPABASE_SECRET_KEY" ]] && export SUPABASE_SECRET_KEY="$_pre_SUPABASE_SECRET_KEY"
unset _pre_DB_URL _pre_SERVICE_ROLE_KEY _pre_SUPABASE_SECRET_KEY

resolve_alias() {
  # Copia la primera variable no vacía de la lista de alias a la variable canónica, sin
  # imprimir ningún valor. Devuelve 1 si ninguna existe.
  local canonical="$1"; shift
  local alias_name value
  for alias_name in "$@"; do
    value="${!alias_name:-}"
    if [[ -n "$value" ]]; then
      export "$canonical=$value"
      return 0
    fi
  done
  return 1
}

prompt_secret() {
  # Si la variable canónica ya está en el entorno (exportada antes de llamar al script), la
  # usa tal cual. Si no, la pide por prompt con eco apagado — nunca queda en un archivo ni
  # en el historial de la shell, y este script nunca la imprime.
  local canonical="$1" label="$2"
  local value="${!canonical:-}"
  if [[ -n "$value" ]]; then
    return 0
  fi
  read -r -s -p "${label}: " value
  echo "" >&2
  if [[ -z "$value" ]]; then
    echo "FATAL: ${canonical} vacío — no se puede continuar sin esa credencial." >&2
    return 1
  fi
  export "$canonical=$value"
}

missing=0
resolve_alias SUPABASE_URL SUPABASE_URL API_URL VITE_SUPABASE_URL || { echo "FATAL: falta SUPABASE_URL (o alias API_URL/VITE_SUPABASE_URL) en $ENV_FILE" >&2; missing=1; }
resolve_alias SUPABASE_ANON_KEY SUPABASE_ANON_KEY ANON_KEY SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_PUBLISHABLE_KEY || { echo "FATAL: falta SUPABASE_ANON_KEY (o alias ANON_KEY/SUPABASE_PUBLISHABLE_KEY) en $ENV_FILE" >&2; missing=1; }
[[ "$missing" -eq 0 ]] || exit 1

resolve_alias SUPABASE_DB_URL SUPABASE_DB_URL DB_URL || true
echo ""
echo "La credencial fuerte NUNCA se lee de un archivo — si no está ya exportada se pide ahora,"
echo "sin eco en pantalla (dashboard de Supabase, Settings → Database, 'Session pooler' para la"
echo "connection string):"
prompt_secret SUPABASE_DB_URL "Connection string de Postgres (Session pooler)" || exit 1

# Verificación no-secreta: el project-ref debe aparecer en la URL de conexión (substring),
# sin imprimir la URL completa (que contiene el password). SUPABASE_URL se valida igual —
# es la que usa la consola (scripts/etl/fase1.mjs) para la Admin API; sin este chequeo, un valor
# heredado de otro proyecto en la misma shell pasaría inadvertido (review de PR #310).
if [[ "$SUPABASE_DB_URL" != *"$PROJECT_REF"* ]]; then
  echo "FATAL: SUPABASE_DB_URL de '$ENV_FILE' no contiene el project-ref '$PROJECT_REF' — ¿archivo de env equivocado?" >&2
  exit 1
fi
if [[ "$SUPABASE_URL" != *"$PROJECT_REF"* ]]; then
  echo "FATAL: SUPABASE_URL ('$SUPABASE_URL') no contiene el project-ref '$PROJECT_REF' — ¿variable heredada de otro proyecto en esta misma shell?" >&2
  exit 1
fi
echo "PASS — SUPABASE_DB_URL y SUPABASE_URL de '$ENV_FILE' referencian el project-ref esperado."

# --- 2. Linkear al proyecto y verificar que sea el correcto ------------------------------
# La CLI escribe el ref linkeado en uno de dos formatos según versión/estado: texto plano en
# supabase/.temp/project-ref, o JSON en supabase/.temp/linked-project.json. Los scripts de
# Ruta C (ya eliminados) chequeaban ambos, texto plano primero — este debe hacer lo mismo:
# mirar solo el JSON aborta el reset después de un link exitoso si la CLI usa el otro formato
# (review de PR #310, confirmado contra docs/migraciones/HANDOFF-ruta-c.md).
current_linked_ref() {
  if [[ -f supabase/.temp/project-ref ]]; then
    tr -d '[:space:]' < supabase/.temp/project-ref
  elif [[ -f supabase/.temp/linked-project.json ]]; then
    sed -n 's/.*"ref"[[:space:]]*:[[:space:]]*"\([a-z0-9]*\)".*/\1/p' supabase/.temp/linked-project.json
  fi
}

if [[ "$(current_linked_ref)" == "$PROJECT_REF" ]]; then
  echo "PASS — ya está linkeado a ${PROJECT_REF}."
else
  echo "── supabase link --project-ref ${PROJECT_REF}"
  supabase link --project-ref "$PROJECT_REF"
  [[ "$(current_linked_ref)" == "$PROJECT_REF" ]] || {
    echo "FATAL: tras 'supabase link', ningún archivo en supabase/.temp/ referencia ${PROJECT_REF}." >&2
    exit 1
  }
fi

# --- 3. Confirmación interactiva explícita (nunca se salta) ------------------------------
echo ""
echo "⚠️  Vas a BORRAR TODO el contenido del proyecto Supabase '${PROJECT_REF}' y reconstruirlo"
echo "    desde cero con el set consolidado de ${REPO_ROOT}/supabase/migrations/."
echo "    Esto es IRREVERSIBLE. Escribí exactamente el project-ref para confirmar:"
read -r -p "> " CONFIRM
if [[ "$CONFIRM" != "$PROJECT_REF" ]]; then
  echo "Confirmación no coincide — abortando sin tocar nada." >&2
  exit 1
fi

# --- 4. Reset destructivo -----------------------------------------------------------------
# Nota (hallazgo real, 2026-08-23/24 contra Test): si el proyecto tiene un historial de
# migraciones previo y ajeno al set consolidado, "db reset --linked" puede fallar a mitad de
# camino con "relation ... already exists" — deja objetos standalone (p.ej. secuencias no
# OWNED BY ninguna tabla) que su lógica de reversión no sabe limpiar. Ver
# docs/migraciones/reset-desde-cero.md, sección "Hallazgo real", para el diagnóstico y fix
# manual (DROP del objeto suelto + `supabase db push --include-all --linked` en vez de un
# segundo reset). Este script no lo auto-repara — un DROP automático de "lo que sobre" es
# demasiado peligroso para hacer a ciegas.
echo "── supabase db reset --linked"
if ! supabase db reset --linked; then
  echo "" >&2
  echo "FATAL: 'supabase db reset --linked' falló. Si el error es 'relation ... already" >&2
  echo "exists', es el hallazgo conocido de historial previo divergente — ver" >&2
  echo "docs/migraciones/reset-desde-cero.md ('Hallazgo real') para el diagnóstico y fix" >&2
  echo "manual antes de reintentar. No reintentar 'db reset' a ciegas." >&2
  exit 1
fi

# --- 5. Verificar convergencia -------------------------------------------------------------
echo "── supabase migration list --linked"
supabase migration list --linked
echo "── supabase db push --dry-run --include-all --linked"
supabase db push --dry-run --include-all --linked

# --- 6. Verificación de datos en modo preinit (verify-seed.sql) ----------------------------
# preinit: catálogos/configuración definitivos y cero clientes, staff, cuentas, roles y feriados.
# La verificación del estado inicializado (administrador + 28 feriados) es de la consola.
echo "── verify-seed.sql (etl_f1_mode=preinit) contra ${PROJECT_REF}"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -v etl_f1_mode=preinit -f "${REPO_ROOT}/supabase/tests/local/verify-seed.sql"

# --- 7. Inicialización: PENDIENTE ----------------------------------------------------------
# Ya no se llama automáticamente al verificador de Auth ni se espera una cuenta fija: la cuenta de
# administrador no existe hasta que corra la consola específica, con su propia autorización.
echo ""
echo "RESET-DESDE-CERO: proyecto '${PROJECT_REF}' reconstruido y verificado en modo preinit."
echo "INICIALIZACIÓN PENDIENTE: el ambiente NO está operativo hasta ejecutar la consola específica"
echo "(node scripts/etl/fase1.mjs preflight / initialize / verify) con su autorización propia —"
echo "ver scripts/etl/README.md y docs/migraciones/reset-desde-cero.md §5."
