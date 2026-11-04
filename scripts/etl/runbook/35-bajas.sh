#!/usr/bin/env bash
# Paso 35 — Paso manual posterior a F2: las 8 fichas con baja pasan a inactivas (145 activas / 8 inactivas).
#   bash scripts/etl/runbook/35-bajas.sh --env test|local [--run-id 0001] [--dry-run]
# Procedimiento de bugs/ETL/carga/fase2/cambios_manuales.md (opción A, SQL), automatizado y con control:
#   · los 8 staff_id esperados salen del journal de F2 (sourceInactive=true), no de una regla de fecha;
#   · deben coincidir EXACTAMENTE con las fichas con baja anterior al corte (23/10/2026);
#   · una sola transacción con control de conteo; no se toca termination_date, Auth ni roles.
# OJO: el `verify` de la consola F2 NO detecta «APLICADO» (devuelve siempre PENDIENTE_CAMBIO_MANUAL); por eso
# la verificación de este paso es SQL. No vuelva a ejecutar `fase2 load` después de este paso.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
RB_NEED_AUTH=0
rb_init "$@"
rb_confirm_window
CUT="2026-10-23"
J2="$STATE_BASE_POSIX/f2/fase2-f2-${ENV_NAME}-${RUN_ID}.journal.json"
[[ -f "$J2" ]] || rb_die "no existe el journal de F2 ($J2): ejecute antes el paso 30"

rb_info "1. Fichas esperadas según el journal de F2"
expected="$(JOURNAL="$(rb_win_path "$J2")" node -e '
  const j = JSON.parse(require("fs").readFileSync(process.env.JOURNAL, "utf8"));
  const ids = Object.values(j.staff ?? {}).filter((s) => s.sourceInactive === true).map((s) => s.staffId).sort();
  process.stdout.write(ids.join(","));
')"
n_expected="$(printf '%s' "$expected" | tr ',' '\n' | grep -c . || true)"
[[ "$n_expected" == "8" ]] || rb_die "el journal marca $n_expected fichas con baja (se esperaban 8)"

rb_info "2. Contraste con la base (solo lectura; sin nombres ni correos)"
in_db="$(rb_scalar "select coalesce(string_agg(staff_id::text, ',' order by staff_id::text), '') from public.staff where deleted_at is null and termination_date is not null and termination_date < date '${CUT}' and lower(trim(email)) <> 'admin@ruizmier.com'")"
[[ "$in_db" == "$expected" ]] || rb_die "las fichas con baja anterior al corte NO coinciden con las del journal: detenga el paso y revise con Marcelo"
rb_psql -F ' | ' -c "select to_char(termination_date,'DD/MM/YYYY') as baja, is_active, auth_user_id is not null as tiene_cuenta from public.staff where staff_id = any(string_to_array('${expected}', ',')::uuid[]) order by termination_date" >&2
sin_cuenta="$(rb_scalar "select count(*) from public.staff where staff_id = any(string_to_array('${expected}', ',')::uuid[]) and auth_user_id is null")"
[[ "$sin_cuenta" == "0" ]] || rb_die "$sin_cuenta de las 8 fichas no tienen cuenta enlazada"
rb_pass "las 8 fichas coinciden con el journal y todas tienen cuenta"

already="$(rb_scalar "select count(*) from public.staff where staff_id = any(string_to_array('${expected}', ',')::uuid[]) and not is_active")"
if [[ "$already" == "8" ]]; then rb_pass "las 8 ya están inactivas: nada que aplicar"
else
  [[ "$already" == "0" ]] || rb_die "estado mixto: $already de 8 ya inactivas; revise a mano"
  rb_confirm "APLICAR 8 BAJAS" "Se marcarán inactivas (is_active=false) 8 fichas de ${ENV_NAME}, conservando su termination_date."
  if [[ "$DRY_RUN" == "1" ]]; then rb_info "DRY-RUN: UPDATE staff SET is_active=false sobre las 8 fichas"
  else
    rb_psql -q -v ids="$expected" <<'SQL'
BEGIN;
SELECT set_config('ems.etl_ids', :'ids', true) \gset
DO $$
DECLARE v_count integer;
BEGIN
  UPDATE public.staff
     SET is_active = false, updated_at = now()
   WHERE staff_id = ANY (string_to_array(current_setting('ems.etl_ids'), ',')::uuid[])
     AND deleted_at IS NULL AND is_active = true AND termination_date IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 8 THEN RAISE EXCEPTION 'ETL_F2_MANUAL: se esperaban 8 fichas, se afectarían %', v_count; END IF;
END $$;
COMMIT;
SQL
  fi
fi

rb_info "3. Verificación (SQL): 145 activas · 8 inactivas con baja · 145 programables"
if [[ "$DRY_RUN" != "1" ]]; then
  counts="$(rb_scalar "select count(*) filter (where is_active) || '|' || count(*) filter (where not is_active) || '|' || count(*) filter (where not is_active and termination_date < date '${CUT}') || '|' || count(*) filter (where is_schedulable) from public.staff where deleted_at is null and lower(trim(email)) <> 'admin@ruizmier.com'")"
  [[ "$counts" == "145|8|8|145" ]] || rb_die "conteos activas|inactivas|inactivas con baja|programables = $counts (se esperaba 145|8|8|145)"
  rb_pass "145 activas · 8 inactivas con baja · 145 programables"
  inactive_ids="$(rb_scalar "select coalesce(string_agg(staff_id::text, ',' order by staff_id::text), '') from public.staff where deleted_at is null and not is_active")"
  [[ "$inactive_ids" == "$expected" ]] || rb_die "las inactivas no son exactamente las 8 del journal"
  rb_pass "las inactivas son exactamente las 8 del journal"
fi
rb_etl 2 verify
rb_pass "PASO MANUAL DE BAJAS aplicado en ${ENV_NAME}. Registre fecha, ejecutor y resultado en el reporte (sin datos personales)"
