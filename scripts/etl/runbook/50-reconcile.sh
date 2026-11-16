#!/usr/bin/env bash
# Paso 50 — Conciliación contra el legacy y segunda pasada sin cambios (SOLO LECTURA + relecturas idempotentes).
#   bash scripts/etl/runbook/50-reconcile.sh --env test|local [--run-id 0001] [--skip-second-pass] [--dry-run]
#  1. `fase3 reconcile-legacy` (L1–L8): lo cargado frente a los seis CSV legacy; BLOQUEADO ante cualquier diferencia.
#  2. Segunda pasada de F3: se repite cada `load` y no debe cambiar NINGUNA fila (huella md5 de las tablas del lote
#     antes y después, incluida la cola de correo). La segunda pasada de F2 ya corrió en el paso 30 (antes de las
#     bajas): no se repite aquí porque no está probado `fase2 load` después del paso manual.
#  3. Resumen para el reporte: conteos, horas por práctica, correos por estado (sin datos personales).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
RB_NEED_AUTH=0
rb_init "$@"
rb_confirm_window
SKIP_SECOND=0; RECORD_FP=0; for a in "${RB_EXTRA_ARGS[@]:-}"; do [[ "$a" == "--skip-second-pass" ]] && SKIP_SECOND=1; [[ "$a" == "--record-fingerprint-baseline" ]] && RECORD_FP=1; done
[[ "$RECORD_FP" != "1" || "$ENV_NAME" == "local" ]] || rb_die "--record-fingerprint-baseline solo se admite con --env local: el baseline es la referencia del ensayo local y Test no puede reemplazarla"
# Protección de L9 (12/11/2026, revisión independiente): el baseline por defecto es de una versión anterior (v2) y nunca se sobrescribe. Registrar exige una ruta explícita y nueva.
FP_DEFAULT="$REPO_ROOT/bugs/ETL/carga/fase4/fingerprint-baseline.json"
if [[ "$RECORD_FP" == "1" ]]; then
  [[ -n "${ETL_BASELINE_FINGERPRINT:-}" ]] || rb_die "--record-fingerprint-baseline exige una ruta explícita en ETL_BASELINE_FINGERPRINT (por ejemplo .../fingerprint-baseline-0611.json): nunca escribe sobre el baseline por defecto, que es de la versión anterior"
  [[ "$ETL_BASELINE_FINGERPRINT" != "$FP_DEFAULT" ]] || rb_die "ETL_BASELINE_FINGERPRINT apunta al baseline por defecto (versión anterior): elija una ruta nueva"
  [[ ! -e "$ETL_BASELINE_FINGERPRINT" ]] || rb_die "el baseline L9 destino ya existe ($(basename "$ETL_BASELINE_FINGERPRINT")): no se sobrescribe; elija una ruta nueva o archive el existente a mano"
fi
[[ -f "$(rb_config_path 3)" ]] || rb_die "falta la configuración F3 de esta corrida: ejecute antes el paso 40"

fingerprint() {
  rb_scalar "select md5(concat_ws('|',
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.clients t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.client_contacts t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.staff t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.user_roles t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.engagements t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.activity_worksheets t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.activity_worksheet_cells t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.work_orders t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.wo_budget_lines t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.wo_expense_budget t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.wo_payment_plan t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.wo_payment_installments t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.wo_installment_notes t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.time_entries t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.timesheet_periods t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.timesheet_line_approvals t),
    (select md5(coalesce(string_agg(t::text,'|' order by t::text),'')) from public.notification_emails t),
    (select count(*) from auth.users)::text))"
}

rb_info "1. Conciliación contra el legacy (L1–L8)"
rb_etl 3 reconcile-legacy

if [[ "$SKIP_SECOND" == "0" ]]; then
  rb_info "2. Segunda pasada de F3 (cada carga repetible debe ser un no-op)"
  # Medido en E1 (31/10): con la carga completa, estas siete operaciones terminan en exit 0 sin cambiar ninguna fila.
  # NO se repiten tres, porque fallan cerrado (exit 1, también sin escribir nada: huella igual) por diseño de la consola:
  #   · matrices          «falta o cambió evidencia persistida»: la sincronización posterior modifica las hojas;
  #   · work-orders crear «OT ambigua»: ya no están en Draft (ajuste, aprobación, notas);
  #   · payments          «no es seguro reparar la precondición de ajuste»: las OT ya están aprobadas.
  # Su idempotencia queda acreditada por la huella y por reconcile-legacy, no repitiéndolas.
  before="$(fingerprint)"; echo "huella antes:   $before" >&2
  rb_etl_mut 3 load --block client-engagements
  rb_etl_mut 3 load --block administrative-engagements
  for op in sync-work-orders expenses risks invoices contain-emails; do rb_etl_mut 3 load --block work-orders --operation "$op"; done
  rb_etl_mut 3 load --block hours --operation hours
  after="$(fingerprint)"; echo "huella después: $after" >&2
  [[ "$before" == "$after" ]] || rb_die "la segunda pasada MODIFICÓ filas del lote (las huellas difieren): no es un no-op. Revise antes de continuar"
  rb_pass "segunda pasada de F3: cero escrituras (huella idéntica)"
  rb_etl 3 reconcile-legacy
fi

rb_info "2b. Huella L9 por clave natural (comparable entre ambientes)"
rb_etl 3 fingerprint
FP_NOW="$STATE_BASE_POSIX/f3/fase3-f3-${ENV_NAME}-${RUN_ID}.fingerprint.json"
FP_BASE="${ETL_BASELINE_FINGERPRINT:-$FP_DEFAULT}"   # bugs/ está en .gitignore; sin datos personales
if [[ "$RECORD_FP" == "1" ]]; then mkdir -p "$(dirname "$FP_BASE")"; [[ ! -e "$FP_BASE" ]] || rb_die "el baseline L9 destino apareció durante la corrida: no se sobrescribe"; cp -n "$FP_NOW" "$FP_BASE"; rb_pass "baseline L9 guardado en $(basename "$FP_BASE")"
elif [[ -f "$FP_BASE" ]]; then
  base_env="$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).environment))' "$(rb_win_path "$FP_BASE")")"
  [[ "$base_env" == "local" ]] || rb_die "el baseline L9 no es de un ensayo local (environment=${base_env}): no se compara contra él"
  l9_code=0; node scripts/etl/fase3.mjs compare-fingerprints --a "$(rb_win_path "$FP_BASE")" --b "$(rb_win_path "$FP_NOW")" || l9_code=$?
  case "$l9_code" in
    0) rb_pass "L9: huella idéntica al baseline" ;;
    4) rb_die "L9: baseline INCOMPATIBLE ($(basename "$FP_BASE")): es de otra versión de los datos o no declara su snapshot. No se compara ni se omite: indique con ETL_BASELINE_FINGERPRINT el baseline de este snapshot o regístrelo (--record-fingerprint-baseline, con orden de Marcelo)" ;;
    *) rb_die "L9: la huella de ${ENV_NAME} difiere del baseline: cada diferencia se explica o se corrige, no se acepta por defecto" ;;
  esac
else
  [[ "$ENV_NAME" == "test" ]] && rb_die "L9 es requisito de E7: falta el baseline del ensayo local ($(basename "$FP_BASE"))"
  rb_warn "L9 NO SE COMPARÓ: no existe el baseline ${FP_BASE}. Se registra más tarde con --record-fingerprint-baseline y ETL_BASELINE_FINGERPRINT=<ruta nueva> (solo local y con orden de Marcelo); hasta entonces L9 queda pendiente, no aprobada"
fi

rb_info "3. Resumen para el reporte (sin datos personales)"
rb_counts
echo "── horas por práctica (ejecutadas)" >&2
rb_psql -F ' | ' -c "select p.abbreviation, sum(te.hours_logged) from public.time_entries te join public.engagements e on e.engagement_id=te.engagement_id join public.practicas p on p.code=e.practica where te.is_forecast=false and (te.period_id is null or te.period_id in (select tp.period_id from public.timesheet_periods tp where tp.import_batch is not null)) group by 1 order by 1" >&2   # R403-07: contrato anterior (sin período) o D41 (período importado)
echo "── cola de correo por estado y motivo" >&2
rb_psql -F ' | ' -c "select status, coalesce(last_error,'-') as motivo, count(*) from public.notification_emails group by 1,2 order by 1,2" >&2
echo "── TC efectivo de los planes BOB (P-02, no es TC legacy)" >&2
rb_psql -F ' | ' -c "select w.currency, p.exchange_rate_mode, p.exchange_rate, count(*) from public.wo_payment_plan p join public.work_orders w on w.wo_id=p.wo_id group by 1,2,3 order by 1,2,3" >&2
rb_pass "CONCILIACIÓN COMPLETA en ${ENV_NAME}. Reportes en ${STATE_BASE_POSIX}/f3 (legacy-reconciliation.json) y f2 (report)"
