#!/usr/bin/env bash
# Pre-descarga, UNA POR UNA y con reintentos por imagen, las imágenes que `supabase start` necesita,
# para que el CLI las encuentre ya locales y no las baje en paralelo.
#
# Por qué (2026-10-27): `supabase start` baja ~13 imágenes a la vez desde ghcr.io y el registro responde
# `toomanyrequests` (límite por IP, compartida entre los runners de GitHub). Reintentar `supabase start`
# entero repite las 13 descargas en paralelo y no converge. Aquí cada imagen se reintenta sola, con
# espera creciente; si ghcr.io no la entrega, se baja de public.ecr.aws y se re-etiqueta con el nombre de
# ghcr.io que el CLI espera (el CLI solo baja lo que no tiene local).
#
# Es BEST-EFFORT y nunca falla el job: la lista sale de `supabase services` (versiones fijadas por el CLI),
# que no incluye kong/mailpit/vector/imgproxy (y de la que se omite supavisor, que start no baja); esas, y cualquier imagen que no se pudo bajar aquí, las baja
# `supabase start` con su propio reintento. Uso: bash ci-pull-supabase-images.sh   (DRY_RUN=1 solo imprime)
set -uo pipefail

REGISTRY="${SUPABASE_INTERNAL_IMAGE_REGISTRY:-ghcr.io}"
FALLBACK_REGISTRY="public.ecr.aws"
ATTEMPTS="${PULL_ATTEMPTS:-6}"
BACKOFF="${PULL_BACKOFF_SECONDS:-20}"

pull_one() {
  local src="$1" attempt
  for attempt in $(seq 1 "$ATTEMPTS"); do
    if [[ -n "${DRY_RUN:-}" ]]; then echo "DRY: docker pull $src"; return 0; fi
    if out=$(docker pull "$src" 2>&1); then return 0; fi
    echo "::notice::$src: intento $attempt/$ATTEMPTS falló ($(echo "$out" | tail -n1 | cut -c1-120))"
    sleep $((attempt * BACKOFF))
  done
  return 1
}

# `ghcr.io/supabase/<imagen>:<tag>` es el nombre que usa el CLI; postgrest/postgrest también vive bajo supabase/.
images=$(supabase services -o json 2>/dev/null | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try { for (const x of JSON.parse(s)) if (x.name && x.local && !x.name.endsWith("/supavisor")) console.log(x.name.split("/").pop() + " " + x.local); } catch (e) {}
  });') || images=""

if [[ -z "$images" ]]; then
  echo "::warning::no se pudo listar las imágenes con 'supabase services'; supabase start las bajará por su cuenta"
  exit 0
fi

# Orden estable: primero postgres (la más grande), para que su descarga no compita con el resto.
pulled=0; missed=0
while read -r name tag; do
  [[ -z "$name" ]] && continue
  primary="$REGISTRY/supabase/$name:$tag"
  if pull_one "$primary"; then pulled=$((pulled + 1)); continue; fi
  fallback="$FALLBACK_REGISTRY/supabase/$name:$tag"
  echo "::warning::$primary no se pudo bajar de $REGISTRY; se intenta $fallback"
  if pull_one "$fallback"; then
    [[ -n "${DRY_RUN:-}" ]] || docker tag "$fallback" "$primary"
    pulled=$((pulled + 1))
  else
    missed=$((missed + 1))
    echo "::warning::$name:$tag no se pudo pre-descargar; lo intentará supabase start"
  fi
done < <(printf '%s\n' "$images" | grep '^postgres ' ; printf '%s\n' "$images" | grep -v '^postgres ')

echo "pre-descarga: $pulled imágenes listas, $missed pendientes para supabase start"
exit 0
