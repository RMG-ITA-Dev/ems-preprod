#!/usr/bin/env bash
# Ruta C — DIFF de fingerprints (gate de paridad A vs C).
# Compara 2 fingerprints de ruta (schema/catalog/policies/grants).
# Uso:  route-c-diff-fingerprints.sh <prefijoA> <prefijoB>
#   p. ej.  route-c-diff-fingerprints.sh ruta_a_test ruta_c_test
#
# Ignora las líneas \restrict/\unrestrict del schema.sql (pg_dump 18 les mete un
# token aleatorio en cada corrida, así que difieren aunque el esquema sea idéntico).
# NO usa `set -e`: corre los 4 diffs aunque alguno tenga diferencias.
set -uo pipefail

A="${1:?Uso: $0 <prefijoA> <prefijoB> (p. ej. ruta_a_test ruta_c_test)}"
B="${2:?Uso: $0 <prefijoA> <prefijoB> (p. ej. ruta_a_test ruta_c_test)}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/tests/fixtures/route-fingerprints"

rc=0

echo "=== ${A} vs ${B}: schema.sql (ignorando \\restrict/\\unrestrict) ==="
if diff <(grep -vE '^\\(un)?restrict ' "$DIR/${A}_schema.sql") \
        <(grep -vE '^\\(un)?restrict ' "$DIR/${B}_schema.sql"); then
  echo "  ✅ idéntico"
else
  echo "  ❌ hay diferencias (arriba)"; rc=1
fi

for f in catalog catalog_policies catalog_grants; do
  echo "=== ${A} vs ${B}: ${f}.txt ==="
  if diff "$DIR/${A}_${f}.txt" "$DIR/${B}_${f}.txt"; then
    echo "  ✅ idéntico"
  else
    echo "  ❌ hay diferencias (arriba)"; rc=1
  fi
done

echo ""
if [[ $rc -eq 0 ]]; then
  echo "RESULTADO: los 4 fingerprints son idénticos → las rutas CONVERGEN. ✅"
else
  echo "RESULTADO: hay diferencias → clasificar (ruido / antecedente / regresión) antes de aceptar."
fi
exit $rc
