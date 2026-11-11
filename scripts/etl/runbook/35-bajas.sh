#!/usr/bin/env bash
# Paso 35 — Paso manual posterior a F2: las fichas con baja pasan a inactivas.
#   bash scripts/etl/runbook/35-bajas.sh --env test|local [--run-id 0001] [--dry-run]
# Las cifras (corte de bajas, activas, inactivas, programables) salen del manifiesto del snapshot
# (scripts/etl/snapshots/<base>.json); al 06/11/2026: corte 2026-11-06, 167 fichas = 151 activas + 16 inactivas.
# Procedimiento de bugs/ETL/carga/fase2/cambios_manuales.md (opción A, SQL), automatizado y con control:
#   · los staff_id esperados salen del journal de F2 (sourceInactive=true), no de una regla de fecha;
#   · deben coincidir EXACTAMENTE con las fichas con baja anterior al corte del manifiesto;
#   · una sola transacción con control de conteo; no se toca termination_date, Auth ni roles.
# OJO: el `verify` de la consola F2 NO detecta «APLICADO» (devuelve siempre PENDIENTE_CAMBIO_MANUAL); por eso
# la verificación de este paso es SQL. No vuelva a ejecutar `fase2 load` después de este paso.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
RB_NEED_AUTH=0
rb_init "$@"
rb_confirm_window
CUT="$(rb_manifest_required dates.staffCut)"
N_INACTIVE="$(rb_manifest_required f2.inactiveStaff)"
N_ACTIVE="$(rb_manifest_required f2.activeStaff)"
N_SCHEDULABLE="$(rb_manifest f2.schedulableStaff)"   # puede estar sin declarar (null) en local: entonces no se compara
[[ "$CUT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || rb_die "el manifiesto no declara dates.staffCut (AAAA-MM-DD)"
[[ "$N_INACTIVE" =~ ^[0-9]+$ && "$N_ACTIVE" =~ ^[0-9]+$ ]] || rb_die "el manifiesto no declara f2.activeStaff y f2.inactiveStaff"
J2="$STATE_BASE_POSIX/f2/fase2-f2-${ENV_NAME}-${RUN_ID}.journal.json"
[[ -f "$J2" ]] || rb_die "no existe el journal de F2 ($J2): ejecute antes el paso 30"

rb_info "1. Fichas esperadas según el journal de F2 (corte ${CUT})"
expected="$(JOURNAL="$(rb_win_path "$J2")" node -e '
  const j = JSON.parse(require("fs").readFileSync(process.env.JOURNAL, "utf8"));
  const ids = Object.values(j.staff ?? {}).filter((s) => s.sourceInactive === true).map((s) => s.staffId).sort();
  process.stdout.write(ids.join(","));
')"
n_expected="$(printf '%s' "$expected" | tr ',' '\n' | grep -c . || true)"
[[ "$n_expected" == "$N_INACTIVE" ]] || rb_die "el journal marca $n_expected fichas con baja (el manifiesto declara $N_INACTIVE)"

rb_info "2. Contraste con la base (solo lectura; sin nombres ni correos)"
in_db="$(rb_scalar "select coalesce(string_agg(staff_id::text, ',' order by staff_id::text), '') from public.staff where deleted_at is null and termination_date is not null and termination_date < date '${CUT}' and lower(trim(email)) <> 'admin@ruizmier.com'")"
[[ "$in_db" == "$expected" ]] || rb_die "las fichas con baja anterior al corte NO coinciden con las del journal: detenga el paso y revise con Marcelo"
rb_psql -F ' | ' -c "select to_char(termination_date,'DD/MM/YYYY') as baja, is_active, auth_user_id is not null as tiene_cuenta from public.staff where staff_id = any(string_to_array('${expected}', ',')::uuid[]) order by termination_date" >&2
sin_cuenta="$(rb_scalar "select count(*) from public.staff where staff_id = any(string_to_array('${expected}', ',')::uuid[]) and auth_user_id is null")"
[[ "$sin_cuenta" == "0" ]] || rb_die "$sin_cuenta de las $N_INACTIVE fichas no tienen cuenta enlazada"
rb_pass "las $N_INACTIVE fichas coinciden con el journal y todas tienen cuenta"

already="$(rb_scalar "select count(*) from public.staff where staff_id = any(string_to_array('${expected}', ',')::uuid[]) and not is_active")"
if [[ "$already" == "$N_INACTIVE" ]]; then rb_pass "las $N_INACTIVE ya están inactivas: nada que aplicar"
else
  [[ "$already" == "0" ]] || rb_die "estado mixto: $already de $N_INACTIVE ya inactivas; revise a mano"
  rb_confirm "APLICAR ${N_INACTIVE} BAJAS" "Se marcarán inactivas (is_active=false) ${N_INACTIVE} fichas de ${ENV_NAME}, conservando su termination_date."
  if [[ "$DRY_RUN" == "1" ]]; then rb_info "DRY-RUN: UPDATE staff SET is_active=false sobre las ${N_INACTIVE} fichas"
  else
    rb_psql -q -v ids="$expected" -v n="$N_INACTIVE" <<'SQL'
BEGIN;
SELECT set_config('ems.etl_ids', :'ids', true) \gset
SELECT set_config('ems.etl_n', :'n', true) \gset
DO $$
DECLARE v_count integer;
BEGIN
  UPDATE public.staff
     SET is_active = false, updated_at = now()
   WHERE staff_id = ANY (string_to_array(current_setting('ems.etl_ids'), ',')::uuid[])
     AND deleted_at IS NULL AND is_active = true AND termination_date IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> current_setting('ems.etl_n')::integer THEN RAISE EXCEPTION 'ETL_F2_MANUAL: se esperaban % fichas, se afectarían %', current_setting('ems.etl_n'), v_count; END IF;
END $$;
COMMIT;
SQL
  fi
fi

rb_info "3. Verificación (SQL): ${N_ACTIVE} activas · ${N_INACTIVE} inactivas con baja${N_SCHEDULABLE:+ · ${N_SCHEDULABLE} programables}"
if [[ "$DRY_RUN" != "1" ]]; then
  counts="$(rb_scalar "select count(*) filter (where is_active) || '|' || count(*) filter (where not is_active) || '|' || count(*) filter (where not is_active and termination_date < date '${CUT}') || '|' || count(*) filter (where is_schedulable) from public.staff where deleted_at is null and lower(trim(email)) <> 'admin@ruizmier.com'")"
  IFS='|' read -r c_active c_inactive c_inactive_baja c_sched <<< "$counts"
  [[ "$c_active" == "$N_ACTIVE" && "$c_inactive" == "$N_INACTIVE" && "$c_inactive_baja" == "$N_INACTIVE" ]] || rb_die "conteos activas|inactivas|inactivas con baja|programables = $counts (se esperaba ${N_ACTIVE}|${N_INACTIVE}|${N_INACTIVE}|${N_SCHEDULABLE:-sin declarar})"
  [[ -z "$N_SCHEDULABLE" || "$c_sched" == "$N_SCHEDULABLE" ]] || rb_die "programables = $c_sched (el manifiesto declara $N_SCHEDULABLE)"
  rb_pass "${N_ACTIVE} activas · ${N_INACTIVE} inactivas con baja${N_SCHEDULABLE:+ · ${N_SCHEDULABLE} programables}"
  inactive_ids="$(rb_scalar "select coalesce(string_agg(staff_id::text, ',' order by staff_id::text), '') from public.staff where deleted_at is null and not is_active")"
  [[ "$inactive_ids" == "$expected" ]] || rb_die "las inactivas no son exactamente las ${N_INACTIVE} del journal"
  rb_pass "las inactivas son exactamente las ${N_INACTIVE} del journal"
fi
rb_etl 2 verify
rb_pass "PASO MANUAL DE BAJAS aplicado en ${ENV_NAME}. Registre fecha, ejecutor y resultado en el reporte (sin datos personales)"
