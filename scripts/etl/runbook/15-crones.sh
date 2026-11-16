#!/usr/bin/env bash
# Paso 15 — Pausa VERIFICADA de los crones de notificaciones (D24): después del reset (10) y antes de F1/F2/F3.
#   bash scripts/etl/runbook/15-crones.sh --env test|local [--run-id 0001] [--dry-run]
# Los crones `notif-*` (envío y recordatorios por correo, campana) NO deben correr durante la migración: la carga masiva dispara correos
# reales y, al reactivarlos, saldrían recordatorios por las cuotas vencidas. Los correos saldrán por Railway DESPUÉS de la migración.
# El paso pausa los que estén activos (previa frase), verifica que ninguno quede activo y NO los reactiva: la reactivación es posterior
# a la migración y decisión del operador. Sin pg_cron (local sin extensión) no hay nada que pausar y el paso lo informa.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
RB_NEED_AUTH=0
rb_init "$@"
rb_confirm_window

has_cron="$(rb_scalar "select count(*) from pg_extension where extname = 'pg_cron'")"
if [[ "$has_cron" == "0" ]]; then
  [[ "$ENV_NAME" == "local" ]] || rb_die "pg_cron no está instalado en ${ENV_NAME}: no se puede verificar la pausa de los crones"
  rb_warn "pg_cron no está instalado en local: no hay crones que pausar"
  exit 0
fi

rb_info "1. Crones de notificaciones (cron.job, jobname notif-%)"
rb_psql -F ' | ' -c "select jobname, schedule, active from cron.job where jobname like 'notif-%' order by jobname" >&2
total="$(rb_scalar "select count(*) from cron.job where jobname like 'notif-%'")"
active="$(rb_scalar "select count(*) from cron.job where jobname like 'notif-%' and active")"
[[ "$total" =~ ^[0-9]+$ && "$total" -gt 0 ]] || { [[ "$ENV_NAME" == "local" ]] && { rb_warn "no hay crones notif-% definidos en local"; exit 0; } || rb_die "no hay crones notif-% en ${ENV_NAME}: ¿se aplicaron las migraciones de notificaciones?"; }

if [[ "$active" != "0" ]]; then
  rb_confirm "PAUSAR CRONES" "Se pausarán ${active} de ${total} crones notif-% de ${ENV_NAME} (active=false). No se reactivan en este runbook."
  if [[ "$DRY_RUN" == "1" ]]; then rb_info "DRY-RUN: cron.alter_job(active := false) sobre ${active} crones"
  else rb_psql -q -c "select cron.alter_job(jobid, active := false) from cron.job where jobname like 'notif-%' and active" >/dev/null; fi
fi

if [[ "$DRY_RUN" != "1" ]]; then
  still="$(rb_scalar "select count(*) from cron.job where jobname like 'notif-%' and active")"
  [[ "$still" == "0" ]] || rb_die "quedan ${still} crones notif-% activos: no se puede continuar con la carga"
  rb_pass "los ${total} crones notif-% están pausados (active=false) en ${ENV_NAME}"
fi
rb_warn "Reactivar los crones y los correos (Railway) es posterior a la migración; antes, avise a Contabilidad por el recordatorio de cuotas vencidas."
