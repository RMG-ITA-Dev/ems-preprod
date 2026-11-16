#!/usr/bin/env bash
# Paso 00 — Pre-vuelo (SOLO LECTURA): no escribe en ninguna base. Es la compuerta E3 del plan de Fase 4.
#   bash scripts/etl/runbook/00-preflight.sh --env test|local [--run-id 0001] [--record-baseline]
# --record-baseline guarda los SHA-256 de los CSV (ensayo local); en Test se comparan contra ese baseline.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
RB_NEED_AUTH=0          # solo lectura: no hacen falta service_role ni la contraseña del administrador
rb_init "$@"
BASELINE="${INPUTS_BASELINE:-$REPO_ROOT/bugs/ETL/carga/fase4/inputs.sha256}"     # INPUTS_BASELINE: huellas de otra versión de CSV (v3: inputs-v3.sha256); bugs/ está en .gitignore: nunca se versiona
fail=0

rb_info "1. Repositorio"
branch="$(git rev-parse --abbrev-ref HEAD)"; [[ "$branch" == "feat/ETL" ]] && rb_pass "rama feat/ETL" || { rb_warn "rama actual: $branch (se esperaba feat/ETL)"; fail=1; }
tracked_dirty="$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
if [[ "$tracked_dirty" == "0" ]]; then rb_pass "sin cambios sin commit en archivos versionados"; else rb_warn "$tracked_dirty archivos versionados con cambios sin commit"; [[ "$ENV_NAME" == "test" ]] && fail=1; fi
head="$(git rev-parse HEAD)"; remote="$(git rev-parse --verify -q "origin/${branch}" || true)"
if [[ -n "$remote" && "$remote" == "$head" ]]; then rb_pass "HEAD ${head:0:8} == origin/${branch}"; else rb_warn "HEAD ${head:0:8} no coincide con origin/${branch} (Test ejecuta un commit subido y con CI en verde)"; [[ "$ENV_NAME" == "test" ]] && fail=1; fi
migs="$(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
if [[ "$migs" == "$EXPECTED_MIGRATIONS" ]]; then rb_pass "$migs migraciones en el árbol"; else rb_warn "$migs migraciones (se esperaban $EXPECTED_MIGRATIONS: la Fase 4 no crea archivos de migración nuevos; AVISE a Marcelo)"; fail=1; fi
untracked_mig="$(git ls-files --others --exclude-standard supabase/migrations | wc -l | tr -d ' ')"
[[ "$untracked_mig" == "0" ]] && rb_pass "ninguna migración sin versionar" || { rb_warn "$untracked_mig migraciones sin versionar"; fail=1; }

rb_info "2. Coherencia del destino"
if [[ "$ENV_NAME" == "test" ]]; then
  refs=()
  if [[ -f supabase/.temp/project-ref ]]; then refs+=("$(tr -d '[:space:]' < supabase/.temp/project-ref)")
  elif [[ -f supabase/.temp/linked-project.json ]]; then refs+=("$(sed -n 's/.*"ref"[[:space:]]*:[[:space:]]*"\([a-z0-9]*\)".*/\1/p' supabase/.temp/linked-project.json)"); fi
  refs+=("$(sed -n 's/.*test:[[:space:]]*"\([a-z0-9]*\)".*/\1/p' scripts/etl/fase1-db.mjs | head -1)")
  grep -q "$TEST_REF" "$ETL_TEST_ENV_FILE" && refs+=("$TEST_REF")
  [[ -f scripts/etl/test.config.json ]] && refs+=("$(node -e 'console.log(JSON.parse(require("fs").readFileSync("scripts/etl/test.config.json","utf8")).expectedProjectRef)')")
  for r in "${refs[@]}"; do [[ "$r" == "$TEST_REF" ]] || { rb_warn "ref distinto de Test en un archivo de configuración: $r"; fail=1; }; done
  [[ "$fail" == "0" ]] && rb_pass "el ref de Test coincide en ${#refs[@]} sitios"
  # El Session pooler autentica a `postgres.<ref>` (PGUSER) pero dentro de la base el rol efectivo es `postgres`.
  who="$(rb_scalar "select current_user")"
  if [[ "${PGUSER:-}" == "postgres.${TEST_REF}" && "$who" == "postgres" ]]; then rb_pass "conexión por el pooler como ${PGUSER} (rol efectivo ${who})"; else rb_warn "PGUSER=${PGUSER:-} current_user=${who} (se esperaba postgres.${TEST_REF} / postgres)"; fail=1; fi
else
  rb_pass "destino local (Docker): $(rb_scalar "select current_setting('server_version')")"
fi

rb_info "3. Estado actual del destino (solo lectura)"
ledger="$(rb_scalar "select count(*) from supabase_migrations.schema_migrations" 2>/dev/null || echo "n/d")"
echo "ledger de migraciones: ${ledger} (tras el reset debe ser ${EXPECTED_MIGRATIONS})" >&2
rb_counts

rb_info "4. Entradas privadas (huellas SHA-256)"
mapfile -t files < <(PF_F2="${BASE_F2_CONFIG:-scripts/etl/fase2.local.config.json}" PF_F3="${BASE_F3_CONFIG:-scripts/etl/fase3.local.config.json}" node -e '
  const fs = require("fs");
  const out = [];
  for (const f of [process.env.PF_F2, process.env.PF_F3]) { try { const c = JSON.parse(fs.readFileSync(f, "utf8")); out.push(...Object.values(c.inputs)); if (c.f2ServicesFile) out.push(c.f2ServicesFile); if (c.f2ClientsFile) out.push(c.f2ClientsFile); } catch (e) { console.error("falta " + f); process.exit(1); } }
  console.log([...new Set(out)].sort().join("\n"));
') || rb_die "no se pudieron leer las configuraciones base locales (rutas de los CSV)"
current="$(mktemp)"; : > "$current"
for f in "${files[@]}"; do [[ -f "$f" ]] || { rb_warn "no existe $f"; fail=1; continue; }; printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$(basename "$f")" >> "$current"; done
sort -o "$current" "$current"
if [[ " ${RB_EXTRA_ARGS[*]:-} " == *" --record-baseline "* ]]; then mkdir -p "$(dirname "$BASELINE")"; cp "$current" "$BASELINE"; rb_pass "baseline de ${#files[@]} huellas guardado en $(basename "$BASELINE")"
elif [[ -f "$BASELINE" ]]; then if diff -q <(sort "$BASELINE") "$current" >/dev/null; then rb_pass "las ${#files[@]} huellas coinciden con el baseline del ensayo"; else rb_warn "las huellas difieren del baseline (cambió algún CSV)"; diff <(sort "$BASELINE") "$current" >&2 || true; fail=1; fi
else rb_warn "no hay baseline: ejecute primero el ensayo local con --record-baseline"; [[ "$ENV_NAME" == "test" ]] && fail=1; fi
rm -f "$current"

rb_info "5. Validación offline de F2 y F3 (sin base de datos)"
rb_write_config 2
rb_etl 2 validate
# F3 exige el actor técnico real; para validar offline basta un UUID de marcador (no se escribe nada).
TECH_ADMIN_ID="00000000-0000-4000-8000-000000000001" rb_write_config 3
rb_etl 3 validate
rm -f "$(rb_config_path 3)"   # se regenera con el actor técnico verdadero en el paso 40

# Fecha límite de ejecución: la declara el manifiesto del snapshot (al 06/11/2026: 30/11/2026, fin de vigencia de las 45 OT terminadas).
DEADLINE_ISO="$(rb_manifest preflight.executionDeadline)"
if [[ "$DEADLINE_ISO" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  DEADLINE_TXT="${DEADLINE_ISO:8:2}/${DEADLINE_ISO:5:2}/${DEADLINE_ISO:0:4}"
  if [[ "$(date +%F)" > "$DEADLINE_ISO" ]]; then
    if [[ "$ENV_NAME" == "local" ]]; then rb_warn "hoy supera la fecha límite del manifiesto (${DEADLINE_TXT}): en local no bloquea"; else { rb_warn "hoy supera la fecha límite de ejecución del manifiesto (${DEADLINE_TXT}): las OT con fin de vigencia en esa fecha quedarían bloqueadas"; fail=1; }; fi
  else rb_pass "fecha de ejecución dentro del límite del manifiesto (<= ${DEADLINE_TXT})"; fi
else
  DEADLINE_TXT="(sin declarar en el manifiesto)"
  [[ "$ENV_NAME" == "local" ]] && rb_warn "el manifiesto no declara preflight.executionDeadline" || { rb_warn "el manifiesto no declara preflight.executionDeadline (obligatorio fuera de local)"; fail=1; }
fi

rb_info "6. Confirmaciones humanas pendientes (no verificables desde el repositorio)"
cat >&2 <<EOF
   [ ] Respaldo de Test restaurable.            [ ] MAIL_ENABLED=false en Test.
   [ ] Registro público cerrado.                [ ] Ventana exclusiva de altas.
   [ ] Fecha de ejecución <= ${DEADLINE_TXT} (manifiesto del snapshot; fin de vigencia de las OT terminadas).
   [ ] El front que se despliegue en Test trae tax_id.
   [ ] Crones de notificaciones pausados (paso 15) y correos por Railway solo DESPUÉS de la migración (D24).
EOF
[[ "$fail" == "0" ]] && { rb_pass "PRE-VUELO COMPLETO: sin hallazgos"; exit 0; } || rb_die "PRE-VUELO CON HALLAZGOS: corríjalos antes de escribir en ${ENV_NAME}"
