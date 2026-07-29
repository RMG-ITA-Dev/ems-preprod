#!/usr/bin/env bash
# Wraps `supabase db reset` + `supabase db push --include-all` with the two known,
# development-only pre-seed patches needed for any from-scratch install (Rutas A y C):
#
#   1. 20260224065512 — fail-fast que exige categorías en español (Socio, Gerente,
#      Asistente, Director, Supervisor, Semi-Senior) que ninguna migración crea; solo
#      existen en el `development` real porque alguien las agregó a mano.
#   2. 20260224065539 — exige un usuario admin (imposible en una base vacía, el bootstrap
#      real pasa por el edge function assign-user-role tras el primer signup) y que
#      ninguna categoría tenga default_app_role NULL (Junior queda sin cubrir por M2).
#
# Ninguno de los dos puede resolverse con una migración nueva (solo pueden ir al final del
# historial, y estos bloqueos ocurren mucho antes cronológicamente) ni con
# supabase/seed.sql (corre después de TODAS las migraciones, ya es tarde). La única vía es
# intercalar estos parches durante el propio push/reset — ver
# docs/scheduler/fase_2/scheduler-fase-2-rutas-locales.md §1.1/§1.2/§6.
#
# Ruta B NO necesita este script — parte de un ambiente que ya tiene development aplicado
# de verdad, donde ambos gaps ya están resueltos desde antes.
#
# Uso: correr desde la raíz del repo, con `supabase start` ya levantado, apuntando SOLO al
# stack local. Nunca contra Supabase real (no acepta --linked ni project ref).
set -euo pipefail

export PGCLIENTENCODING=UTF8
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

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

echo "== 1/3: supabase db reset (se espera que se detenga en 20260224065512) =="
if supabase db reset; then
  echo "AVISO: db reset completó sin detenerse en 065512 — el gap de categorías ya no está,"
  echo "verificar por qué antes de asumir que el pre-seed sigue haciendo falta."
  supabase migration list --local
  supabase db push --dry-run --include-all --local
  exit 0
fi

echo "== Aplicando parche de categorías (§1.1) =="
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "$PATCH_CATEGORIES"

echo "== 2/3: supabase db push --include-all --local (se espera que se detenga en 20260224065539) =="
if supabase db push --include-all --local; then
  echo "AVISO: db push completó sin detenerse en 065539 — verificar por qué (¿admin/Junior"
  echo "ya estaban resueltos de antes?)."
else
  echo "== Aplicando parche de admin + Junior (§1.2) =="
  psql "$DB_URL" -v ON_ERROR_STOP=1 -c "$PATCH_ADMIN"

  echo "== 3/3: supabase db push --include-all --local (debe completar el resto sin más bloqueos) =="
  supabase db push --include-all --local
fi

echo "== Verificación final =="
supabase migration list --local
supabase db push --dry-run --include-all --local
