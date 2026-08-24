# Handoff — Reset y reconstrucción de "Test" desde cero

> **OBSOLETO (migración cero, Fase 3 — 2026-08-23).** Este procedimiento depende de
> `preseed-development-gaps-linked.sh` y del historial de 184 migraciones, ambos eliminados por
> `bugs/migracion_cero/plan_v2.md` (PR-2, §2.5.c). El set consolidado + renombrado
> (`supabase/migrations/*_cero_*.sql`) aplica limpio sobre una base vacía sin parches de pre-seed —
> el reset real de Test es la Fase 7 del plan, documentada en
> `docs/migraciones/reset-desde-cero.md` una vez ejecutada. Se conserva este archivo solo como
> referencia histórica del procedimiento anterior; no seguirlo contra ningún ambiente.

Script (histórico, ya no existe en el árbol): `supabase/tests/local/preseed-development-gaps-linked.sh`

Vacía el proyecto Supabase **"Test"** (`slkqdcwwvmjtcbakajib`) y lo reconstruye desde cero: aplica
todas las migraciones con los parches de pre-seed, restaura grants + RLS, despliega las edge functions
y deja un admin logueable. **Destructivo** — solo corre contra Test.

---

## 1. Antes de correr: variables de entorno

Requisitos: `supabase login` + `supabase link --project-ref slkqdcwwvmjtcbakajib`; `psql` en el PATH
(`scoop install postgresql`).

En **la misma ventana** de PowerShell, setear (las `SEED_ADMIN_*` y `FRONTEND_URL` son opcionales pero
recomendadas — sin ellas no se crea el admin usable ni el secreto de CORS):

```powershell
$env:PGCLIENTENCODING          = "UTF8"
$env:SUPABASE_DB_URL           = "postgresql://postgres.slkqdcwwvmjtcbakajib:<PWD>@aws-1-us-west-1.pooler.supabase.com:5432/postgres"
$env:FRONTEND_URL              = "http://10.101.9.135"            # origen del navegador (con :puerto si aplica)
$env:SEED_ADMIN_EMAIL          = "tu-correo@ruizmier.com"          # debe pasar validación de dominio
$env:SEED_ADMIN_PASSWORD       = "una-clave-segura"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key de Test>"      # Settings → API Keys (service_role o la 'secret key' sb_secret_...)
```

> **Usar el Session pooler** (`...pooler.supabase.com:5432`), no el host directo (`db.<ref>...` no
> resuelve). El `service_role key` es sensible: no commitear ni pegar en chats.

Correr con la ruta real de Git Bash (nunca `bash` pelado):

```powershell
& "C:\Program Files\Git\bin\bash.exe" supabase/tests/local/preseed-development-gaps-linked.sh
```

`supabase db reset --linked` pedirá confirmación → responder `y`.

---

## 2. Fases y paradas

El script corre en este orden. **Las 3 paradas son esperadas** — son fail-fast que exigen datos que
ninguna migración crea, y el script inyecta el parche y continúa:

| # | Parada en | Motivo | Parche |
|---|---|---|---|
| 1 | `20260224065512` | exige categorías en español (Socio, Gerente, …) | `PATCH_CATEGORIES` |
| 2 | `20260224065539` | exige ≥1 admin + ninguna categoría con `default_app_role` NULL | `PATCH_ADMIN` |
| 3 | — | completa el resto de las migraciones | — |

**Una parada en cualquier otro timestamp = hallazgo nuevo:** detenerse y reportar, no parchear a ojo.

Luego (sin paradas): verificación (`migration list` + `db push --dry-run` = 0 pendientes) →
**grants + RLS** (`post-reset-grants-rls.sql`) → secreto `FRONTEND_URL` → **deploy de las edge
functions** → **admin usable** (Admin API + ficha en `staff` + promoción).

Al terminar: login con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

---

## 3. Hallazgos

- **RLS drift (`20260115000154`).** El replay desde cero deja 18 tablas con RLS apagado (esa migración
  lo desactiva y ninguna posterior lo reactiva). El script lo corrige vía `post-reset-grants-rls.sql`,
  pero **falta la migración de reconciliación en la rama** para que producción quede segura al aplicar
  migraciones.

- **Semillas a actualizar.** `supabase/migrations/20251204045534_cf82aa30-…sql` y
  `supabase/tests/fixtures/route-c-synthetic-seed.sql` contienen datos semilla (categorías en **inglés**
  `Partner`/`Manager`/`Staff` + staff demo `@firm.com`). Actualizar `20251204045534` para sembrar las
  categorías directamente en español eliminaría la necesidad de `PATCH_CATEGORIES`.
