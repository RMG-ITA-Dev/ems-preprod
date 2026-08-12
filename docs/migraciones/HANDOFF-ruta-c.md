# Handoff — Reconstrucción de "Test" por Ruta C

Camino **alterno** para aplicar las migraciones: en vez de correrlas en orden cronológico (Ruta A),
aterrizan **primero las 80 de la base** (`sruizmier-scheduler-v3`) y luego las **97 restantes** encima
(= 177). Deja "Test" (`slkqdcwwvmjtcbakajib`) usable, igual que el camino directo.

**Destructivo** — solo contra Test. Requiere backup verificado.

Scripts: `supabase/tests/local/route-c-stage1.sh` y `route-c-post-reset.sh`.

---

## 1. Antes de correr: variables de entorno

Requisitos: `supabase login`; `psql` en el PATH (`scoop install postgresql`); Git Bash real.

En **la misma ventana** de PowerShell:

```powershell
$env:PGCLIENTENCODING          = "UTF8"
$env:SUPABASE_DB_URL           = "postgresql://postgres.slkqdcwwvmjtcbakajib:<PWD>@aws-1-us-west-1.pooler.supabase.com:5432/postgres"
$env:FRONTEND_URL              = "http://10.101.9.135"            # origen del navegador (con :puerto si aplica)
$env:SEED_ADMIN_EMAIL          = "tu-correo@ruizmier.com"          # debe pasar validación de dominio
$env:SEED_ADMIN_PASSWORD       = "una-clave-segura"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key de Test>"      # Settings → API Keys
```

> **Session pooler** (`...pooler.supabase.com:5432`), no el host directo. El `service_role key` es
> sensible: no commitear ni pegar en chats.

---

## 2. Pasos

**A) Worktree de la base + scripts + link**
```powershell
git fetch origin sruizmier-scheduler-v3
git worktree add ..\ems-route-c-scratch origin/sruizmier-scheduler-v3
Set-Location ..\ems-route-c-scratch
(Get-ChildItem supabase\migrations -Filter *.sql).Count            # 80

$main = "..\ems"
New-Item -ItemType Directory -Force supabase\tests\local, supabase\tests\fixtures | Out-Null
Copy-Item "$main\supabase\tests\local\route-c-stage1.sh"            supabase\tests\local\
Copy-Item "$main\supabase\tests\local\route-c-post-reset.sh"        supabase\tests\local\
Copy-Item "$main\supabase\tests\local\post-reset-grants-rls.sql"    supabase\tests\local\
Copy-Item "$main\supabase\tests\fixtures\route-c-synthetic-seed.sql" supabase\tests\fixtures\
supabase link --project-ref slkqdcwwvmjtcbakajib
Get-Content supabase\.temp\project-ref                             # slkqdcwwvmjtcbakajib
```

**B) Etapa 1 — las 80 (base)**
```powershell
& "C:\Program Files\Git\bin\bash.exe" supabase/tests/local/route-c-stage1.sh
```
`db reset --linked` → confirmar `Yes`. **2 paradas esperadas** (fail-fast que exigen datos que ninguna
migración crea; el script inyecta el parche y sigue):

| # | Parada en | Parche |
|---|---|---|
| 1 | `20260224065512` (categorías en español) | `PATCH_CATEGORIES` |
| 2 | `20260224065539` (admin + `default_app_role`) | `PATCH_ADMIN` |

Una parada en cualquier otro timestamp = hallazgo nuevo → detenerse y reportar. Al final: **80** aplicadas.

**C) Datos sintéticos** (para que los backfills de la etapa 2 corran sobre datos)
```powershell
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase\tests\fixtures\route-c-synthetic-seed.sql
```

**D) Etapa 2 — las 97 restantes encima**
```powershell
$main = "..\ems"
Get-ChildItem supabase\migrations -Filter *.sql | ForEach-Object Name | Sort-Object > $env:TEMP\c_80.txt
Get-ChildItem "$main\supabase\migrations" -Filter *.sql | ForEach-Object Name | Sort-Object > $env:TEMP\merge_177.txt
$c80 = Get-Content $env:TEMP\c_80.txt
$restantes = Get-Content $env:TEMP\merge_177.txt | Where-Object { $c80 -notcontains $_ }
$restantes.Count                                                  # 97
$restantes | ForEach-Object { Copy-Item "$main\supabase\migrations\$_" supabase\migrations\ }
(Get-ChildItem supabase\migrations -Filter *.sql).Count           # 177
Get-ChildItem supabase\migrations -Filter *.sql | ForEach-Object { $_.Name.Substring(0,14) } |
  Group-Object | Where-Object Count -gt 1                          # vacío (si no, algo se copió mal)

supabase db push --include-all --linked                           # aplica las 97; no debería parar
```

**E) Verificar**
```powershell
supabase migration list --linked                                  # 177 aplicadas
supabase db push --dry-run --include-all --linked                 # "Remote database is up to date"
```

**F) Post-reset (deja Test usable)**
```powershell
& "C:\Program Files\Git\bin\bash.exe" supabase/tests/local/route-c-post-reset.sh
```
Grants/RLS + secreto FRONTEND_URL + deploy de edge functions + admin usable. Login con
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

**G) Limpieza**
```powershell
Set-Location ..\ems
git worktree remove --force ..\ems-route-c-scratch
```

> Nota: el deploy de funciones corre desde el worktree (scheduler-v3, 7 funciones). Si querés Test con
> las funciones en versión final, redesplegá desde el repo principal: `supabase functions deploy`.
