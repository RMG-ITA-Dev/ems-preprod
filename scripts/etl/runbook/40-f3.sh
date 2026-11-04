#!/usr/bin/env bash
# Paso 40 — Fase 3 por bloques: 124 encargos cliente, 10 administrativos, 124 matrices, 124 OT (gastos, plan de
# pagos y notas, riesgo/aprobación) y 1.384 entradas de horas (24.968,00 h).
#   bash scripts/etl/runbook/40-f3.sh --env test|local [--run-id 0001] [--from <bloque>] [--dry-run] [--yes-local]
# Bloques: client-engagements administrative-engagements matrices work-orders hours
# Cada bloque se verifica y su aceptación la escribe Marcelo (acta con el hash del bloque): sin aceptación el
# siguiente no corre (la consola lo bloquea). En local, --yes-local acepta sin pausa (solo ensayo E1).
# Reanudable: vuelva a ejecutarlo; los bloques ya confirmados no se reescriben (no-op por journal y relectura).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
RB_NEED_AUTH=0
rb_init "$@"
rb_confirm_window

FROM="client-engagements"
i=0; while [[ $i -lt ${#RB_EXTRA_ARGS[@]} ]]; do
  if [[ "${RB_EXTRA_ARGS[$i]}" == "--from" ]]; then FROM="${RB_EXTRA_ARGS[$((i+1))]}"; i=$((i+2)); else rb_die "argumento desconocido: ${RB_EXTRA_ARGS[$i]}"; fi
done
BLOCKS=(client-engagements administrative-engagements matrices work-orders hours)
[[ " ${BLOCKS[*]} " == *" $FROM "* ]] || rb_die "--from debe ser uno de: ${BLOCKS[*]}"
started=0; run_block() { [[ "$started" == "1" || "$1" == "$FROM" ]] && { started=1; return 0; } || return 1; }

JOURNAL3="$STATE_BASE_POSIX/f3/fase3-f3-${ENV_NAME}-${RUN_ID}.journal.json"

rb_info "Precondiciones de F3 (SQL, solo lectura)"
f2j="$STATE_BASE_POSIX/f2/fase2-f2-${ENV_NAME}-${RUN_ID}.journal.json"
[[ -f "$f2j" ]] || rb_die "no existe el journal de F2 de esta corrida ($f2j)"
[[ "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).state)' "$(rb_win_path "$f2j")")" == "VERIFICADO" ]] || rb_die "el journal de F2 no está VERIFICADO"
inactive="$(rb_scalar "select count(*) from public.staff where deleted_at is null and not is_active")"
[[ "$inactive" == "8" ]] || rb_die "F3 exige el paso manual de bajas aplicado (8 inactivas); hay $inactive. Ejecute 35-bajas.sh"
TECH_ADMIN_ID="$(rb_scalar "select s.auth_user_id from public.staff s join public.user_roles ur on ur.user_id = s.auth_user_id where lower(s.email) = 'admin@ruizmier.com' and ur.role = 'admin' and ur.role_key = 'admin'")"
[[ "$TECH_ADMIN_ID" =~ ^[0-9a-f-]{36}$ ]] || rb_die "no se resolvió un único administrador bootstrap (admin/admin) como actor técnico"
export TECH_ADMIN_ID
rb_pass "F2 verificada, 8 bajas aplicadas y actor técnico resuelto"
rb_write_config 3

rb_etl 3 validate
rb_etl 3 preflight

# Hash de aceptación del bloque: el de su carga confirmada en el journal (identifica exactamente lo cargado).
block_hash() {
  JOURNAL="$(rb_win_path "$JOURNAL3")" BLOCK="$1" node -e '
    const j = JSON.parse(require("fs").readFileSync(process.env.JOURNAL, "utf8")); const u = j.units?.[process.env.BLOCK] ?? {};
    // La unidad de horas no guarda hash propio: la consola deja el de las horas cargadas (hourHash) en la unidad work-orders.
    const wo = j.units?.["work-orders"] ?? {};
    const h = u.expectedHash || u.matrixHash || u.workOrderHash || u.inputHash || (process.env.BLOCK === "hours" ? wo.hourHash : "") || "";
    if (!/^[a-f0-9]{64}$/i.test(h)) { console.error("sin hash de bloque"); process.exit(1); } process.stdout.write(h);'
}
accept_block() {
  local block="$1"
  if [[ "$DRY_RUN" == "1" ]]; then rb_info "DRY-RUN: verify y aceptación de $block"; return 0; fi
  rb_etl 3 verify --block "$block"
  rb_counts
  local hash; hash="$(block_hash "$block")"
  rb_confirm "ACEPTO ${block}" "Acta de aceptación del bloque ${block} (hash ${hash:0:16}…): revisó los conteos de arriba y el resultado de verify."
  rb_etl 3 accept --block "$block" --evidence-hash "$hash"
}

# Reanudación por marcas del journal: la consola solo es no-op para lo que aún no terminó. Repetir la creación de OT
# cuando ya pasaron los pagos o el riesgo se lee como «OT ambigua» (la OT ya no está en Draft): por diseño, esas
# operaciones se saltan si su marca de «completada» ya existe. Un paso interrumpido SIN marca sí se repite: la consola
# lo recupera por relectura.
done_mark() {   # done_mark '<expresión JS sobre j, wo>'
  [[ -f "$JOURNAL3" ]] || return 1
  JOURNAL="$(rb_win_path "$JOURNAL3")" EXPR="$1" node -e '
    const j = JSON.parse(require("fs").readFileSync(process.env.JOURNAL, "utf8")); const wo = j.units?.["work-orders"] ?? {};
    process.exit(new Function("j", "wo", "return Boolean(" + process.env.EXPR + ")")(j, wo) ? 0 : 1);'
}
step() {        # step <descripción> <expresión de «ya hecho»> <comando…>
  local label="$1" mark="$2"; shift 2
  if done_mark "$mark"; then rb_pass "ya completado, se omite: $label"; else rb_etl_mut "$@"; fi
}
engagement_block() {  # create + verify + acta; si el bloque ya está aceptado no se repite
  local block="$1"
  if done_mark "j.blocks?.['$block']?.acceptedAt"; then rb_pass "bloque $block ya aceptado, se omite"; return 0; fi
  rb_etl_mut 3 load --block "$block"; accept_block "$block"
}

if run_block client-engagements;         then engagement_block client-engagements; fi
if run_block administrative-engagements; then engagement_block administrative-engagements; fi
if run_block matrices;                   then engagement_block matrices; fi
if run_block work-orders; then
  if done_mark "j.blocks?.['work-orders']?.acceptedAt"; then rb_pass "bloque work-orders ya aceptado, se omite"
  else
    step "124 OT en Draft"                      "wo.state === 'CONFIRMADA'"  3 load --block work-orders
    step "sincronización OT↔matriz"             "wo.syncCompletedAt"         3 load --block work-orders --operation sync-work-orders
    step "75 presupuestos de gasto"             "wo.expensesCompletedAt"     3 load --block work-orders --operation expenses
    step "124 planes, 277 cuotas, 4 notas (BOB: TC por DEFAULT, P-02)" "wo.paymentsCompletedAt" 3 load --block work-orders --operation payments
    step "riesgo y aprobación Approved/Approved" "wo.risksCompletedAt"       3 load --block work-orders --operation risks
    step "contención de correos propios"        "wo.emailsContainedAt"       3 load --block work-orders --operation contain-emails
    accept_block work-orders
  fi
fi
if run_block hours; then
  step "horas (25.226,00 h)"                    "j.units?.hours?.state === 'CONFIRMADA'"  3 load --block hours --operation hours
  rb_etl_mut 3 load --block work-orders --operation contain-emails   # idempotente: cierra también lo que generen las horas
  # Como en los bloques anteriores: verify + acta humana (ACEPTO hours) antes de dar F3 por cargada. Se omite si ya está aceptado.
  if done_mark "j.blocks?.hours?.acceptedAt"; then rb_pass "bloque hours ya aceptado, se omite"; else accept_block hours; fi
fi
rb_etl 3 report
rb_counts
rb_pass "FASE 3 cargada y verificada en ${ENV_NAME}. Siga con 50-reconcile.sh (conciliación contra el legacy y segunda pasada)"
