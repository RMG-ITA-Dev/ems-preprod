#!/usr/bin/env bash
# Orquestador del runbook ETL F1 → F3: encadena los pasos, con una pausa escrita entre cada uno.
#   bash scripts/etl/runbook/run.sh --env test|local [--run-id 0001] [--from 00] [--to 50] [--dry-run] [--yes-local]
#
#   00 pre-vuelo (solo lectura)     10 reset desde cero (DESTRUCTIVO)     11 recuperación §6.1 (solo si el 10 cayó)
#   20 fase 1                       30 fase 2                              35 paso manual de las 8 bajas
#   15 pausa verificada de crones notif-% (D24, justo después del 10)
#   40 fase 3 por bloques           50 conciliación legacy + segunda pasada
#
# Cada paso se puede ejecutar solo (`bash scripts/etl/runbook/30-f2.sh --env test`). Credenciales: cada paso las
# pide sin eco si no están ya exportadas en ESTA terminal; exporte una vez (SUPABASE_DB_URL, SUPABASE_SERVICE_ROLE_KEY,
# ADMIN_TEMP_PASSWORD) para no repetirlas. Nunca por el chat ni en archivos.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_NAME="test"; FROM="00"; TO="50"; PASS_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV_NAME="$2"; PASS_ARGS+=("$1" "$2"); shift 2 ;;
    --from) FROM="$2"; shift 2 ;;
    --to) TO="$2"; shift 2 ;;
    *) PASS_ARGS+=("$1"); shift ;;
  esac
done
[[ "$ENV_NAME" == "test" || "$ENV_NAME" == "local" ]] || { echo "FATAL: --env debe ser local o test" >&2; exit 1; }
steps=(00-preflight 10-reset 15-crones 20-f1 30-f2 35-bajas 40-f3 50-reconcile)
for step in "${steps[@]}"; do
  n="${step%%-*}"
  [[ "$n" < "$FROM" || "$n" > "$TO" ]] && continue
  echo "" >&2; echo "════════ PASO ${step} (${ENV_NAME}) ════════" >&2
  if [[ "$ENV_NAME" == "test" && "$n" != "00" ]]; then
    printf 'Escriba SIGUE para ejecutar el paso %s (cualquier otra cosa detiene la corrida)\n> ' "$step" >&2
    read -r ok; [[ "$ok" == "SIGUE" ]] || { echo "Corrida detenida antes del paso ${step}." >&2; exit 1; }
  fi
  bash "$HERE/${step}.sh" "${PASS_ARGS[@]}" || { echo "FATAL: el paso ${step} falló; la corrida se detiene (los pasos son reanudables: corrija y repita desde --from ${n})." >&2; exit 1; }
done
echo "" >&2; echo "RUNBOOK completo (${FROM}..${TO}) en ${ENV_NAME}." >&2
