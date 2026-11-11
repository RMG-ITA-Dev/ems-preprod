#!/usr/bin/env bash
# Biblioteca común del runbook ETL F1 → F3 (bugs/ETL/carga/fase4/plan_v1.md §6). Se carga con `source`.
#
# Un mismo juego de pasos sirve para dos destinos y ninguno más:
#   --env local   ensayo E1 en el stack local de Supabase (Docker); credenciales de `supabase status`.
#   --env test    Supabase Test (ref fijo en este archivo); credenciales SOLO por prompt sin eco.
# Producción no existe aquí: su ref está vetado y la consola F3 la rechaza.
#
# Reglas (lecciones de la sesión de deploy del 28/10): usar Git Bash (el `bash` de PowerShell puede ser el de
# WSL), una sola terminal para toda la sesión, ninguna credencial en argv, en archivos ni en el chat, y
# `psql` siempre en sesión por el pooler (puerto 5432).
set -euo pipefail

RB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$RB_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

TEST_REF="slkqdcwwvmjtcbakajib"                       # = KNOWN_REFS.test en scripts/etl/fase1-db.mjs
VETOED_REFS=("xcdcxtduotwgwmhxvsiz" "ugqxfnrxvksiltwxzist")   # producción y Lovable
EXPECTED_MIGRATIONS=61
ENV_NAME="${ENV_NAME:-test}"
RUN_ID="${RUN_ID:-0001}"
DRY_RUN="${DRY_RUN:-0}"
ASSUME_LOCAL_YES="${ASSUME_LOCAL_YES:-0}"             # solo local: acepta bloques sin pausa (ensayo E1)
RB_NEED_AUTH="${RB_NEED_AUTH:-1}"                     # 0 en pasos de solo lectura: no pide service_role ni la contraseña del admin

rb_info() { printf '\n── %s\n' "$*" >&2; }
rb_pass() { printf 'PASS — %s\n' "$*" >&2; }
rb_warn() { printf 'AVISO — %s\n' "$*" >&2; }
rb_die()  { printf 'FATAL: %s\n' "$*" >&2; exit 1; }

rb_parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env) ENV_NAME="$2"; shift 2 ;;
      --run-id) RUN_ID="$2"; shift 2 ;;
      --dry-run) DRY_RUN=1; shift ;;
      --yes-local) ASSUME_LOCAL_YES=1; shift ;;
      *) RB_EXTRA_ARGS+=("$1"); shift ;;
    esac
  done
  [[ "$ENV_NAME" == "local" || "$ENV_NAME" == "test" ]] || rb_die "--env debe ser local o test (no hay destino de producción en este runbook)"
  [[ "$RUN_ID" =~ ^[A-Za-z0-9]{2,12}$ ]] || rb_die "--run-id inválido (2 a 12 caracteres alfanuméricos)"
  [[ "$ASSUME_LOCAL_YES" == "0" || "$ENV_NAME" == "local" ]] || rb_die "--yes-local solo existe para el ensayo local: en Test cada bloque lo acepta Marcelo"
}
RB_EXTRA_ARGS=()

rb_require_tools() {
  [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* || "$(uname -s)" == Linux* || "$(uname -s)" == Darwin* ]] || rb_die "shell no reconocida"
  if [[ "$(uname -r)" == *[Mm]icrosoft* ]]; then rb_die "esto es WSL: abra Git Bash (C:\\Program Files\\Git\\bin\\bash.exe)"; fi
  command -v node >/dev/null || rb_die "falta node en el PATH"
  command -v psql >/dev/null || rb_die "falta psql en el PATH (scoop: C:\\Users\\<usuario>\\scoop\\apps\\postgresql\\current\\bin)"
  command -v supabase >/dev/null || rb_die "falta la CLI de Supabase en el PATH"
}

rb_win_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

# Ejecuta una orden que ESCRIBE. Con --dry-run solo la muestra.
rb_mut() {
  if [[ "$DRY_RUN" == "1" ]]; then
    local shown=() a
    for a in "$@"; do
      case "$a" in *PASSWORD=*|*KEY=*|*SECRET=*|*_URL=*) shown+=("${a%%=*}=<oculto>") ;; *) shown+=("$a") ;; esac
    done
    printf 'DRY-RUN: %q ' "${shown[@]}" >&2; printf '\n' >&2; return 0
  fi
  "$@"
}

# Confirmación con frase exacta: nunca se salta en Test.
rb_confirm() {
  local phrase="$1" prompt="$2" answer
  if [[ "$ENV_NAME" == "local" && "$ASSUME_LOCAL_YES" == "1" ]]; then return 0; fi
  printf '%s\n  Escriba exactamente: %s\n> ' "$prompt" "$phrase" >&2
  read -r answer
  [[ "$answer" == "$phrase" ]] || rb_die "confirmación distinta de «$phrase»: no se hizo nada"
}

rb_prompt_secret() {
  local name="$1" label="$2" value="${!1:-}"
  if [[ -z "$value" ]]; then
    read -r -s -p "${label}: " value; echo "" >&2
    [[ -n "$value" ]] || rb_die "${name} vacío"
    export "$name=$value"
  fi
}

# --- Entorno ----------------------------------------------------------------------------------
rb_setup_env() {
  rb_require_tools
  STATE_BASE_POSIX="${ETL_STATE_BASE:-/c/ems-etl-state}/${ENV_NAME}-${RUN_ID}"
  mkdir -p "$STATE_BASE_POSIX"/{f1,f2,f3,logs}
  local resolved; resolved="$(cd "$STATE_BASE_POSIX" && pwd -P)"
  case "$resolved" in "$REPO_ROOT"*) rb_die "el directorio de estado no puede estar dentro del repositorio" ;; esac
  export ETL_F1_STATE_DIR="$(rb_win_path "$STATE_BASE_POSIX/f1")" ETL_F2_STATE_DIR="$(rb_win_path "$STATE_BASE_POSIX/f2")" ETL_F3_STATE_DIR="$(rb_win_path "$STATE_BASE_POSIX/f3")"
  LOG_DIR="$STATE_BASE_POSIX/logs"
  export PGCLIENTENCODING=UTF8 PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"

  if [[ "$ENV_NAME" == "local" ]]; then
    PROJECT_REF="local"
    local status; status="$(supabase status -o env 2>/dev/null || true)"
    [[ -n "$status" ]] || rb_die "el stack local no está levantado (supabase start)"
    # shellcheck disable=SC1090
    eval "$status"
    # El contenedor Kong de este stack publica la API en 55321, no en el 54321 que anuncia el status.
    SUPABASE_URL="${LOCAL_API_URL:-$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("scripts/etl/fase1.local.config.json","utf8")).supabaseUrl)}catch{console.log("http://127.0.0.1:55321")}')}"
    export SUPABASE_URL SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" DB_URL
    export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres
    export ETL_F1_SIGNUP_CLOSED=1 ETL_F1_WINDOW_CONFIRMED=local ETL_F2_WINDOW_CONFIRMED=local ETL_F3_WINDOW_CONFIRMED=local
  else
    PROJECT_REF="$TEST_REF"
    for vetoed in "${VETOED_REFS[@]}"; do [[ "$PROJECT_REF" != "$vetoed" ]] || rb_die "ref vetado: $vetoed"; done
    export SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
    # Claves PÚBLICAS (las que el front ya expone): se leen del .env de Test sin imprimirlas.
    local envfile="${ETL_TEST_ENV_FILE:-$REPO_ROOT/.env.test.local}"
    [[ -f "$envfile" ]] || rb_die "falta $envfile (URL y anon key públicas de Test)"
    SUPABASE_ANON_KEY="$(set -a; . "$envfile" >/dev/null 2>&1; printf '%s' "${SUPABASE_ANON_KEY:-${ANON_KEY:-${SUPABASE_PUBLISHABLE_KEY:-${VITE_SUPABASE_PUBLISHABLE_KEY:-}}}}")"
    [[ -n "$SUPABASE_ANON_KEY" ]] || rb_die "no se encontró la anon key pública en $envfile"
    export SUPABASE_ANON_KEY ETL_TEST_ENV_FILE="$envfile"
    # Credenciales fuertes: SOLO por prompt sin eco (o ya exportadas en esta misma sesión).
    echo "Credenciales de Test: se piden sin eco y no se guardan en ningún archivo." >&2
    rb_prompt_secret SUPABASE_DB_URL "Connection string de Postgres (Session pooler, puerto 5432)"
    rb_parse_db_url
    export DB_URL="$SUPABASE_DB_URL"
    [[ "$RB_NEED_AUTH" == "1" ]] && rb_prompt_secret SUPABASE_SERVICE_ROLE_KEY "service_role key de Test"
  fi
  if [[ "$RB_NEED_AUTH" == "1" ]]; then
    rb_prompt_secret ADMIN_TEMP_PASSWORD "Contraseña temporal del administrador (≥ 12 caracteres)"
    [[ "${#ADMIN_TEMP_PASSWORD}" -ge 12 ]] || rb_die "ADMIN_TEMP_PASSWORD debe tener al menos 12 caracteres"
  fi
  export SUPABASE_DB_URL="${SUPABASE_DB_URL:-}"
}

# Deriva PG* de la connection string sin imprimir nada y valida host/usuario/puerto contra el ref de Test.
rb_parse_db_url() {
  local exports
  exports="$(node -e '
    const u = new URL(process.env.SUPABASE_DB_URL); const q = (s) => "\x27" + String(s).replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
    process.stdout.write(`export PGHOST=${q(u.hostname)} PGPORT=${q(u.port || 5432)} PGUSER=${q(decodeURIComponent(u.username))} PGPASSWORD=${q(decodeURIComponent(u.password))} PGDATABASE=${q(u.pathname.replace(/^\//, "") || "postgres")}`);
  ' 2>/dev/null)" || rb_die "SUPABASE_DB_URL no es una URL de conexión válida"
  eval "$exports"
  [[ "$SUPABASE_DB_URL" == *"$PROJECT_REF"* ]] || rb_die "la connection string no contiene el ref de Test ($PROJECT_REF): ¿otro proyecto?"
  [[ "$PGUSER" == "postgres.${PROJECT_REF}" ]] || rb_die "PGUSER debe ser postgres.${PROJECT_REF}"
  [[ "$PGHOST" =~ ^[a-z0-9-]+\.pooler\.supabase\.com$ ]] || rb_die "PGHOST debe ser el pooler (*.pooler.supabase.com)"
  [[ "$PGPORT" == "5432" ]] || rb_die "use el Session pooler (puerto 5432): el modo transacción (6543) no sostiene los locks ni la sesión de las consolas"
}

# Declaraciones de ventana: en Test las hace Marcelo, escribiendo el ref.
rb_confirm_window() {
  [[ "$ENV_NAME" == "test" ]] || return 0
  rb_confirm "VENTANA ${PROJECT_REF}" "Ventana exclusiva en Test (nadie más escribe), registro público cerrado, MAIL_ENABLED=false y respaldo de Test restaurable confirmados."
  export ETL_F1_SIGNUP_CLOSED=1 ETL_F1_WINDOW_CONFIRMED="$PROJECT_REF" ETL_F2_WINDOW_CONFIRMED="$PROJECT_REF" ETL_F3_WINDOW_CONFIRMED="$PROJECT_REF"
}

# --- Configuraciones privadas (ignoradas por Git: scripts/etl/*.config.json) ---------------------
# Se generan desde las configuraciones locales de ensayo (que traen las rutas privadas de los CSV).
# F3 se genera más tarde (necesita el actor técnico, que existe solo tras F1).
rb_config_path() { printf '%s/scripts/etl/fase%s.%s-%s.config.json' "$REPO_ROOT" "$1" "$ENV_NAME" "$RUN_ID"; }

# --- Manifiesto del snapshot (scripts/etl/snapshots/<base>.json) -------------------------------
# Las cifras y fechas que dependen del respaldo legacy (corte de bajas, activas/inactivas, conteos de F3, fecha límite) salen del manifiesto
# del snapshot de la configuración base, no de constantes del runbook. rb_manifest <ruta.con.puntos> imprime el valor; null/ausente → vacío.
# rb_manifest_required exige un valor fuera de local (un control sin declarar bloquea en Test y producción).
rb_manifest() {
  BASE="${BASE_F2_CONFIG:-scripts/etl/fase2.local.config.json}" KEYPATH="$1" node -e '
    const fs = require("fs"); const e = process.env;
    const snapshot = JSON.parse(fs.readFileSync(e.BASE, "utf8")).snapshot;
    if (!/^[A-Za-z0-9_]+$/.test(snapshot ?? "")) { console.error("snapshot inválido en la configuración base"); process.exit(1); }
    let value = JSON.parse(fs.readFileSync("scripts/etl/snapshots/" + snapshot + ".json", "utf8"));
    for (const part of e.KEYPATH.split(".")) value = value?.[part];
    process.stdout.write(value === null || value === undefined ? "" : (typeof value === "object" ? JSON.stringify(value) : String(value)));
  ' || rb_die "no se pudo leer $1 del manifiesto del snapshot (¿existe scripts/etl/snapshots/<base>.json?)"
}
rb_manifest_required() { local v; v="$(rb_manifest "$1")"; [[ -n "$v" || "$ENV_NAME" == "local" ]] || rb_die "el manifiesto no declara $1 (obligatorio fuera de local)"; printf '%s' "$v"; }

rb_write_config() {
  local phase="$1" out; out="$(rb_config_path "$phase")"
  BASE_F1="${BASE_F1_CONFIG:-scripts/etl/fase1.local.config.json}" BASE_F2="${BASE_F2_CONFIG:-scripts/etl/fase2.local.config.json}" BASE_F3="${BASE_F3_CONFIG:-scripts/etl/fase3.local.config.json}" \
  PHASE="$phase" OUT="$out" ENVN="$ENV_NAME" REF="$PROJECT_REF" URL="$SUPABASE_URL" RID="$RUN_ID" F2STATE="$ETL_F2_STATE_DIR" TECH_ADMIN="${TECH_ADMIN_ID:-}" node -e '
    const fs = require("fs"); const e = process.env;
    const base = JSON.parse(fs.readFileSync(e["BASE_F" + e.PHASE], "utf8"));
    base.environment = e.ENVN; base.expectedProjectRef = e.REF; base.supabaseUrl = e.URL; base.installationId = `f${e.PHASE}-${e.ENVN}-${e.RID}`;
    if (e.ENVN !== "local") delete base.expectations;                 // en Test las cifras esperadas no se pueden alterar
    if (e.PHASE === "3") { if (!/^[0-9a-f-]{36}$/i.test(e.TECH_ADMIN)) { console.error("actor técnico no resuelto"); process.exit(1); } base.technicalAdminId = e.TECH_ADMIN; base.f2StateDir = e.F2STATE; }
    fs.writeFileSync(e.OUT, JSON.stringify(base, null, 2) + "\n", "utf8");
  ' || rb_die "no se pudo generar $out (¿existe la configuración base local de la fase $phase?)"
  rb_pass "configuración F${phase} privada: $(basename "$out")"
}

# --- Ejecución de consolas y SQL --------------------------------------------------------------
# rb_etl <fase> <comando> [args…]  → node scripts/etl/faseN.mjs <comando> --config <privada> …  (con registro en logs/)
rb_etl() {
  local phase="$1" cmd="$2"; shift 2
  local log="$LOG_DIR/f${phase}-${cmd}-$(date +%Y%m%d-%H%M%S).log" code=0
  rb_info "fase${phase} ${cmd} $*"
  set +e
  node "scripts/etl/fase${phase}.mjs" "$cmd" --config "$(rb_config_path "$phase")" "$@" 2>&1 | tee "$log"
  code="${PIPESTATUS[0]}"
  set -e
  case "$code" in
    0) rb_pass "fase${phase} ${cmd}" ;;
    2) rb_die "fase${phase} ${cmd}: BLOQUEADO (exit 2). Revise ${log}; no se reintenta a ciegas." ;;
    3) rb_die "fase${phase} ${cmd}: RECONCILIACION_REQUERIDA (exit 3). Revise ${log} y use reconcile; nada se escribe sin resolver." ;;
    *) rb_die "fase${phase} ${cmd}: error (exit ${code}). Revise ${log}." ;;
  esac
}
rb_etl_mut() { if [[ "$DRY_RUN" == "1" ]]; then rb_info "DRY-RUN fase$1 $2 ${*:3}"; else rb_etl "$@"; fi; }

rb_psql() { psql -X -At -v ON_ERROR_STOP=1 "$@"; }
rb_scalar() { rb_psql -c "$1"; }

# Resumen de conteos sin datos personales.
rb_counts() {
  rb_psql -F ' | ' -c "select 'clientes', count(*) from public.clients union all select 'contactos', count(*) from public.client_contacts union all select 'staff', count(*) from public.staff union all select 'auth.users', count(*) from auth.users union all select 'encargos', count(*) from public.engagements union all select 'matrices', count(*) from public.activity_worksheets union all select 'ordenes_trabajo', count(*) from public.work_orders union all select 'planes_pago', count(*) from public.wo_payment_plan union all select 'cuotas', count(*) from public.wo_payment_installments union all select 'gastos_presupuestados', count(*) from public.wo_expense_budget union all select 'time_entries', count(*) from public.time_entries union all select 'periodos', count(*) from public.timesheet_periods union all select 'aprobaciones_linea', count(*) from public.timesheet_line_approvals union all select 'correos_pendientes', count(*) from public.notification_emails where status in ('pending','sending') union all select 'correos_enviados', count(*) from public.notification_emails where status='sent'" >&2
}

rb_init() { rb_parse_args "$@"; rb_setup_env; rb_info "destino: ${ENV_NAME} (${PROJECT_REF}) · corrida ${RUN_ID} · estado en ${STATE_BASE_POSIX}"; [[ "$DRY_RUN" == "1" ]] && rb_warn "DRY-RUN: no se escribe nada" || true; }
