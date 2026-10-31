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
    const h = u.expectedHash || u.matrixHash || u.workOrderHash || u.inputHash || "";
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

if run_block client-engagements;         then rb_etl_mut 3 load --block client-engagements; accept_block client-engagements; fi
if run_block administrative-engagements; then rb_etl_mut 3 load --block administrative-engagements; accept_block administrative-engagements; fi
if run_block matrices;                   then rb_etl_mut 3 load --block matrices; accept_block matrices; fi
if run_block work-orders; then
  rb_etl_mut 3 load --block work-orders                                          # 124 OT en Draft
  rb_etl_mut 3 load --block work-orders --operation sync-work-orders             # sincroniza cada OT con su matriz (una vez)
  rb_etl_mut 3 load --block work-orders --operation expenses                     # 75 presupuestos de gasto positivos
  rb_etl_mut 3 load --block work-orders --operation payments                     # 124 planes, 277 cuotas, 4 notas (BOB: TC por DEFAULT, P-02)
  rb_etl_mut 3 load --block work-orders --operation risks                        # riesgo y aprobación Approved/Approved
  rb_etl_mut 3 load --block work-orders --operation contain-emails               # correos propios → failed (ETL_F3_NO_DELIVERY)
  accept_block work-orders
fi
if run_block hours; then
  rb_etl_mut 3 load --block hours --operation hours
  rb_etl_mut 3 load --block work-orders --operation contain-emails               # idempotente: cierra también lo que generen las horas
  rb_etl 3 verify --block hours
fi
rb_etl 3 report
rb_counts
rb_pass "FASE 3 cargada y verificada en ${ENV_NAME}. Siga con 50-reconcile.sh (conciliación contra el legacy y segunda pasada)"
