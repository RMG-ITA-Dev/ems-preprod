#!/usr/bin/env bash
# Variante --linked de preseed-development-gaps.sh para correr Ruta A contra el
# mirror REAL (Supabase Cloud), NO el stack local. Mismos parches (validados),
# apuntando al proyecto enlazado con `supabase link`.
#
# Diferencias vs el script local (solo estas):
#   - supabase db reset / push        -> --linked
#   - SUPABASE_DB_URL es OBLIGATORIO  (sin default local); aborta si falta.
#   - Guardián al inicio: el ref del proyecto enlazado y el de SUPABASE_DB_URL
#     deben ser slkqdcwwvmjtcbakajib; aborta si no.
#   - Los bloques PATCH_CATEGORIES y PATCH_ADMIN se copian sin tocar una coma.
#
# Requisitos previos:
#   - `supabase login` + `supabase link --project-ref slkqdcwwvmjtcbakajib` hechos.
#   - `export SUPABASE_DB_URL="postgresql://.../postgres"` del mirror (mismo ref).
#
# ⚠️ DESTRUCTIVO: `supabase db reset --linked` VACÍA el mirror y reaplica todo.
#    Tener un backup verificado antes de correrlo.
#
# Uso (Windows): correr con la ruta REAL de Git Bash, nunca el `bash` de PowerShell
#   (que resuelve al relay roto de WSL):
#     & "C:\Program Files\Git\bin\bash.exe" supabase/tests/local/preseed-development-gaps-linked.sh
set -euo pipefail

EXPECTED_REF="slkqdcwwvmjtcbakajib"

export PGCLIENTENCODING=UTF8

# --- Guardián: SUPABASE_DB_URL obligatorio y del proyecto correcto ---
DB_URL="${SUPABASE_DB_URL:-}"
if [[ -z "$DB_URL" ]]; then
  echo "ERROR: SUPABASE_DB_URL no está seteado. Exporta la cadena de conexión del mirror." >&2
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
# Verificar que el proyecto ENLAZADO del CLI sea Test — ABORTA si no se puede
# confirmar. El destructivo `db reset --linked` usa ESE proyecto (no SUPABASE_DB_URL),
# así que sin esta verificación podría resetear la base equivocada (hay 3 refs en
# juego, uno es Lovable producción). Soporta ambos formatos de estado del CLI.
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
  # NO salir acá: el reset completó (el gap de categorías ya no existe, p. ej. si
  # se actualizó la semilla) → se OMITEN los parches, pero la reconstrucción de
  # abajo (grants/RLS, secreto, funciones, admin) DEBE correr igual.
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

    echo "== 3/3: supabase db push --include-all --linked (debe completar el resto sin más bloqueos) =="
    supabase db push --include-all --linked
  fi
fi

echo "== Verificación final =="
supabase migration list --linked
supabase db push --dry-run --include-all --linked

# =====================================================================
# Post-reset: restaurar grants de Supabase + activar RLS.
# El reset pierde los grants a anon/authenticated (→ "permission denied for
# table user_roles" al loguear) y deja RLS apagado en 18 tablas. Ver el .sql.
# =====================================================================
echo "== Restaurando grants + activando RLS (post-reset) =="
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/local/post-reset-grants-rls.sql

# =====================================================================
# Secreto FRONTEND_URL (CORS de dashboard-data / scheduler-data / scheduler-gaps).
# Se toma de la variable de entorno FRONTEND_URL, igual que SUPABASE_DB_URL.
# Debe ser el ORIGEN exacto desde donde el navegador carga la app (scheme+host+
# puerto), p. ej.  export FRONTEND_URL="http://10.101.9.135"  (o con :puerto).
# Si no está seteada, se SALTA: el login funciona sin ella; solo dashboard y
# scheduler la necesitan en runtime.
# =====================================================================
FRONTEND_URL="${FRONTEND_URL:-}"
if [[ -n "$FRONTEND_URL" ]]; then
  echo "== Seteando secreto FRONTEND_URL=$FRONTEND_URL =="
  supabase secrets set FRONTEND_URL="$FRONTEND_URL"
else
  echo "AVISO: FRONTEND_URL no seteada — se salta el secreto. dashboard/scheduler"
  echo "       fallarán CORS hasta que lo setees: export FRONTEND_URL=\"http://<ip>:<puerto>\""
fi

# =====================================================================
# Redespliegue de edge functions (NO vuelven con las migraciones).
# Es el paso G4.6 del plan de verificación; se automatiza acá por conveniencia
# tras el reset. Deploya al proyecto ENLAZADO (Test) — mismo guardián de ref.
# RECORDATORIO: dashboard-data / scheduler-data / scheduler-gaps además
# necesitan el secreto FRONTEND_URL en runtime (el deploy funciona sin él, pero
# fallan al ejecutarse):  supabase secrets set FRONTEND_URL="https://<app-url>"
# Si solo querés el replay puro (sin desplegar), comentá las 2 líneas de abajo.
# =====================================================================
echo "== Desplegando las edge functions al proyecto enlazado (Test) =="
supabase functions deploy

# =====================================================================
# Admin de prueba USABLE y vinculado a staff (opcional, por env).
# A diferencia del preseed-admin (throwaway, password 'x'), este queda con
# password real Y ficha en public.staff → listo para loguear tras el reset,
# sin crearlo a mano en el Dashboard cada vez.
#
# Crea el usuario por la Admin API de GoTrue (hashea el password y arma la
# identity correctamente — más confiable que insertarlo a mano en auth.*),
# luego le crea la ficha en public.staff (el trigger la vincula) y lo promueve.
#
# Se salta si falta cualquiera de las 3 variables:
#   export SEED_ADMIN_EMAIL="neilgraneros@ruizmier.com"
#   export SEED_ADMIN_PASSWORD="una-clave-segura"
#   export SUPABASE_SERVICE_ROLE_KEY="<service_role key de Test>"  # Dashboard → API keys
# El email debe pasar validate_email_domain (dominio permitido).
# =====================================================================
SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-}"
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-}"
SB_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

# Escapa un valor para incrustarlo seguro en JSON (backslash y comillas dobles).
json_escape() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; printf '%s' "$s"; }

if [[ -n "$SEED_ADMIN_EMAIL" && -n "$SEED_ADMIN_PASSWORD" && -n "$SB_SERVICE_KEY" ]]; then
  SB_URL="https://${EXPECTED_REF}.supabase.co"
  echo "== Creando admin usable vía Admin API: $SEED_ADMIN_EMAIL =="
  # email/password escapados para no romper el JSON con caracteres especiales;
  # --fail-with-body hace que curl aborte (set -e) si el Admin API responde
  # HTTP >= 400 (usuario duplicado, credenciales inválidas, etc.).
  # Rechazar caracteres de control (tab/newline/CR/…): json_escape no los escapa y
  # romperían el JSON → el Admin API rechazaría y no se crearía el admin.
  if [[ "${SEED_ADMIN_EMAIL}${SEED_ADMIN_PASSWORD}" == *[$'\x01'-$'\x1f']* ]]; then
    echo "ERROR: SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD contienen caracteres de control; quítalos." >&2
    exit 1
  fi
  admin_payload="{\"email\":\"$(json_escape "$SEED_ADMIN_EMAIL")\",\"password\":\"$(json_escape "$SEED_ADMIN_PASSWORD")\",\"email_confirm\":true}"
  curl -sS --fail-with-body -X POST "$SB_URL/auth/v1/admin/users" \
    -H "apikey: $SB_SERVICE_KEY" \
    -H "Authorization: Bearer $SB_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "$admin_payload"
  echo ""
  echo "== Vinculando ficha de staff + promoviendo a admin =="
  psql "$DB_URL" -v ON_ERROR_STOP=1 -v email="$SEED_ADMIN_EMAIL" <<'SQL'
insert into public.staff (first_name, last_name, email, category_id, is_active)
select 'Seed', 'Admin', :'email',
       (select category_id from public.categories order by display_order limit 1), true
where not exists (select 1 from public.staff where email = :'email');

update public.user_roles
set role = 'admin', role_key = 'admin'
where user_id = (select id from auth.users where email = :'email');

-- Verificar que el admin quedó realmente configurado; si no, abortar (no salir "ok").
select set_config('seed.admin_email', :'email', false);
do $$
begin
  if not exists (
    select 1 from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    where u.email = current_setting('seed.admin_email') and ur.role_key = 'admin'
  ) then
    raise exception 'Admin % no quedó configurado (usuario o rol ausente).', current_setting('seed.admin_email');
  end if;
end $$;
SQL
else
  echo "AVISO: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SUPABASE_SERVICE_ROLE_KEY no"
  echo "       seteadas — no se crea admin usable (el preseed-admin no sirve para login)."
fi
