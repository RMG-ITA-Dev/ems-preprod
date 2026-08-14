#!/usr/bin/env bash
# Ruta C — ETAPA 1: reset + parches de pre-seed + aplicar la BASE (sruizmier-scheduler-v3,
# 80 migraciones). Es la variante de Ruta C de preseed-development-gaps-linked.sh, PERO
# SIN el post-reset: la etapa 1 es INTERMEDIA (todavía faltan las 97 de la etapa 2), así
# que NO corre grants/RLS, secreto, funciones ni admin. Eso va al FINAL de Ruta C, con
# route-c-post-reset.sh (después de la etapa 2).
#
# Correr DESDE el worktree de sruizmier-scheduler-v3, ya enlazado a Test.
# Flujo completo: docs/migraciones/RUNBOOK-ruta-c.md
#
# ⚠️ DESTRUCTIVO: `supabase db reset --linked` VACÍA Test y reaplica. Backup antes.
set -euo pipefail

EXPECTED_REF="slkqdcwwvmjtcbakajib"
export PGCLIENTENCODING=UTF8

# --- Guardián: SUPABASE_DB_URL + proyecto enlazado deben ser Test (aborta si no) ---
DB_URL="${SUPABASE_DB_URL:-}"
if [[ -z "$DB_URL" ]]; then
  echo "ERROR: SUPABASE_DB_URL no está seteado." >&2
  exit 1
fi
# Verificar que el URL apunte al proyecto Test, exigiendo AMBOS componentes que lo
# identifican según el tipo de conexión (no basta con uno):
#   - directo: host == db.<ref>.supabase.co
#   - pooler:  usuario == postgres.<ref>  Y  host termina en .pooler.supabase.com
# Así un host ajeno con el usuario correcto (o viceversa) se rechaza.
_dburl_rest="${DB_URL#*://}"
_dburl_user="${_dburl_rest%%@*}"; _dburl_user="${_dburl_user%%:*}"
_dburl_host="${_dburl_rest#*@}";  _dburl_host="${_dburl_host%%[:/?]*}"
if [[ "$_dburl_host" == "db.${EXPECTED_REF}.supabase.co" ]] \
   || { [[ "$_dburl_user" == "postgres.${EXPECTED_REF}" ]] && [[ "$_dburl_host" == *.pooler.supabase.com ]]; }; then
  : # OK — Test (conexión directa o pooler del proyecto)
else
  echo "ERROR: SUPABASE_DB_URL no apunta a Test ($EXPECTED_REF)." >&2
  echo "       host='${_dburl_host}' user='${_dburl_user}'." >&2
  exit 1
fi
LINKED_REF=""
if [[ -f supabase/.temp/project-ref ]]; then
  LINKED_REF="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
elif [[ -f supabase/.temp/linked-project.json ]]; then
  LINKED_REF="$(sed -n 's/.*"ref"[[:space:]]*:[[:space:]]*"\([a-z0-9]*\)".*/\1/p' supabase/.temp/linked-project.json)"
fi
if [[ "$LINKED_REF" != "$EXPECTED_REF" ]]; then
  echo "ERROR: no se pudo verificar que el proyecto enlazado sea Test ($EXPECTED_REF)." >&2
  echo "       Ref detectado: '${LINKED_REF:-<ninguno>}'. Corre 'supabase link --project-ref $EXPECTED_REF' primero." >&2
  exit 1
fi

# Parches de pre-seed (idénticos a Ruta A — validados).
PATCH_CATEGORIES=$(cat <<'SQL'
UPDATE categories SET category_name = 'Socio'     WHERE category_name = 'Partner';
UPDATE categories SET category_name = 'Gerente'   WHERE category_name = 'Manager';
UPDATE categories SET category_name = 'Asistente' WHERE category_name = 'Staff';
INSERT INTO categories (category_name, display_order) VALUES
  ('Director', 3), ('Supervisor', 4), ('Semi-Senior', 6)
ON CONFLICT (category_name) DO NOTHING;
SQL
)

PATCH_ADMIN=$(cat <<'SQL'
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                         email_confirmed_at, created_at, updated_at,
                         raw_app_meta_data, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'preseed-admin@ruizmier.com', 'x',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
UPDATE user_roles SET role = 'admin'
  WHERE user_id = '00000000-0000-4000-8000-000000000001';
UPDATE categories SET default_app_role = 'staff'
  WHERE category_name = 'Junior' AND default_app_role IS NULL;
SQL
)

echo "== 1/3: supabase db reset --linked (se espera que se detenga en 20260224065512) =="
if supabase db reset --linked; then
  echo "AVISO: db reset completó sin detenerse en 065512 — se omiten los parches de pre-seed."
else
  # Guard: confirmá que el reset falló POR el gap de 065512 (faltan categorías) y no
  # por otra causa (red, otra migración rota, credenciales). 065512 hace fail-fast si
  # falta alguna de estas 10 categorías; si ya están las 10, el fallo es OTRO → abortá
  # mostrando el error real en vez de parchear a ciegas una BD a medio migrar.
  # (si la tabla ni existe, ON_ERROR_STOP + set -e cortan acá con el error real de psql).
  _missing_cats="$(psql "$DB_URL" -tA -v ON_ERROR_STOP=1 -c "
    select count(*) from (values
      ('Socio'),('SQR'),('Director'),('Gerente'),('Supervisor'),
      ('Senior'),('Semi-Senior'),('Asistente'),('Especialista IT'),('Especialista TAX')
    ) e(name)
    where not exists (select 1 from categories c where c.category_name = e.name)")"
  if [[ "$_missing_cats" == "0" ]]; then
    echo "ERROR: db reset falló, pero las 10 categorías esperadas ya están completas —" >&2
    echo "       no es el gap de 065512. Revisá el error real del reset; no se parchea." >&2
    exit 1
  fi
  echo "== Aplicando parche de categorías (§1.1) =="
  psql "$DB_URL" -v ON_ERROR_STOP=1 -c "$PATCH_CATEGORIES"

  echo "== 2/3: supabase db push --include-all --linked (se espera que se detenga en 20260224065539) =="
  if supabase db push --include-all --linked; then
    echo "AVISO: db push completó sin detenerse en 065539 — verificar por qué (¿admin/Junior"
    echo "       ya estaban resueltos de antes?)."
  else
    # Guard: confirmá que el push falló POR el gap de 065539 y no por otra causa. 065539
    # hace fail-fast si no hay admin O si alguna categoría tiene default_app_role NULL
    # (las dos cosas que arregla PATCH_ADMIN). Si ninguna se cumple, el fallo es OTRO →
    # abortá mostrando el error real en vez de parchear a ciegas.
    _gap539="$(psql "$DB_URL" -tA -v ON_ERROR_STOP=1 -c "
      select case when
        (select count(*) from user_roles where role = 'admin') = 0
        or exists (select 1 from categories where default_app_role is null)
      then 1 else 0 end")"
    if [[ "$_gap539" == "0" ]]; then
      echo "ERROR: db push falló, pero ya hay admin y ninguna categoría con default_app_role" >&2
      echo "       NULL — no es el gap de 065539. Revisá el error real del push; no se parchea." >&2
      exit 1
    fi
    echo "== Aplicando parche de admin + Junior (§1.2) =="
    psql "$DB_URL" -v ON_ERROR_STOP=1 -c "$PATCH_ADMIN"

    echo "== 3/3: supabase db push --include-all --linked (debe completar la BASE sin más bloqueos) =="
    supabase db push --include-all --linked
  fi
fi

echo "== Verificación de la ETAPA 1 =="
supabase migration list --linked                    # las 80 de la base
supabase db push --dry-run --include-all --linked    # 0 pendientes (respecto a los 80 files)
echo ""
echo "== ETAPA 1 completa. Sigue: datos sintéticos + ETAPA 2 (copiar las 97 + push) =="
echo "   y al final route-c-post-reset.sh. Ver docs/migraciones/RUNBOOK-ruta-c.md."
