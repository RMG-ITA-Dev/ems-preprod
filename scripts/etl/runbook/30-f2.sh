#!/usr/bin/env bash
# Paso 30 — Fase 2: clientes, contactos y fichas/cuentas/roles (+ bootstrap). Las cifras esperadas salen del manifiesto del snapshot
# (scripts/etl/snapshots/<base>.json): al 06/11/2026, 269 clientes y 167 fichas.
#   bash scripts/etl/runbook/30-f2.sh --env test|local [--run-id 0001] [--probe legacy:N ...] [--dry-run]
# Contiene los correos auth.role.changed de las fichas creadas (D40) y verifica que no quede ninguno pendiente.
# Reanudable: si el canal remoto se interrumpe, vuelva a ejecutarlo; `load` retoma desde el journal.
# --probe legacy:N (repetible): sondeo de acceso de 2–3 cuentas activas de prácticas distintas (rota la clave al terminar).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
rb_init "$@"
rb_confirm_window
rb_write_config 2

probes=(); i=0
while [[ $i -lt ${#RB_EXTRA_ARGS[@]} ]]; do
  if [[ "${RB_EXTRA_ARGS[$i]}" == "--probe" ]]; then probes+=("${RB_EXTRA_ARGS[$((i+1))]}"); i=$((i+2)); else rb_die "argumento desconocido: ${RB_EXTRA_ARGS[$i]}"; fi
done

rb_etl 2 validate
rb_etl 2 preflight
rb_etl_mut 2 load

# D40 (A-03): los roles que asigna F2 encolan correos auth.role.changed (a la persona y a Seguridad TI). Se marcan no entregables (ETL_F2_NO_DELIVERY) antes de seguir; el dren de
# correos sigue pausado (15-crones) y MAIL_ENABLED=false: esto solo evita que salgan cuando alguien reactive el dren. Idempotente.
rb_info "Contención de correos auth.role.changed de F2"
rb_etl_mut 2 contain-emails
if [[ "$DRY_RUN" != "1" ]]; then
  pend="$(rb_scalar "select count(*) from public.notification_emails where type_key = 'auth.role.changed' and status = 'pending'")"
  [[ "$pend" == "0" ]] || rb_die "quedan $pend correos auth.role.changed pendientes tras la contención de F2: no se continúa (el dren no debe reactivarse con pendientes)"
  rb_pass "correos auth.role.changed: 0 pendientes (los de F2 quedaron como ETL_F2_NO_DELIVERY)"
fi

rb_etl 2 verify          # esperado: PENDIENTE_CAMBIO_MANUAL (todas activas; las bajas del manifiesto se aplican en el paso 35)
rb_etl 2 report

rb_info "Idempotencia: una segunda load no debe escribir nada"
before="$(rb_scalar "select (select count(*) from public.clients)||'/'||(select count(*) from public.client_contacts)||'/'||(select count(*) from public.staff)||'/'||(select count(*) from auth.users)||'/'||(select count(*) from public.user_roles)")"
rb_etl_mut 2 load
after="$(rb_scalar "select (select count(*) from public.clients)||'/'||(select count(*) from public.client_contacts)||'/'||(select count(*) from public.staff)||'/'||(select count(*) from auth.users)||'/'||(select count(*) from public.user_roles)")"
[[ "$before" == "$after" ]] || rb_die "la segunda load cambió los conteos: $before → $after"
rb_pass "segunda load sin cambios ($after)"
rb_etl 2 verify

for ref in "${probes[@]}"; do rb_etl_mut 2 probe-access --staff-ref "$ref"; done
[[ ${#probes[@]} -gt 0 ]] || rb_warn "sin sondeos de acceso (use --probe legacy:N para 2–3 cuentas activas); F2 no queda aceptada sin ellos según el plan"

# El plan exige F3 vacío al cerrar F2 (F2-CA14).
f3="$(rb_scalar "select (select count(*) from public.engagements)+(select count(*) from public.work_orders)+(select count(*) from public.time_entries)+(select count(*) from public.skills)")"
[[ "$f3" == "0" ]] || rb_die "F2-CA14: hay $f3 filas de fase 3 (encargos/OT/horas/skills) antes de cargar F3"
rb_counts
rb_pass "FASE 2 completa en ${ENV_NAME}. Siga con 35-bajas.sh (paso manual de las bajas del manifiesto) ANTES de F3"
