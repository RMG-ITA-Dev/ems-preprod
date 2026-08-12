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
# El ref debe estar en el HOST (db.<ref>.supabase.co) o el USUARIO (postgres.<ref>),
# NO un substring en cualquier parte (un ref en el password apuntando a otra base pasaría).
if [[ "$DB_URL" != *"db.${EXPECTED_REF}.supabase.co"* && "$DB_URL" != *"postgres.${EXPECTED_REF}"* ]]; then
  echo "ERROR: SUPABASE_DB_URL no apunta al host/usuario de Test ($EXPECTED_REF)." >&2
  echo "       El ref debe estar en el host (db.<ref>.supabase.co) o el usuario (postgres.<ref>)." >&2
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
  echo "== Aplicando parche de categorías (§1.1) =="
  psql "$DB_URL" -v ON_ERROR_STOP=1 -c "$PATCH_CATEGORIES"

  echo "== 2/3: supabase db push --include-all --linked (se espera que se detenga en 20260224065539) =="
  if supabase db push --include-all --linked; then
    echo "AVISO: db push completó sin detenerse en 065539 — verificar por qué (¿admin/Junior"
    echo "       ya estaban resueltos de antes?)."
  else
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
