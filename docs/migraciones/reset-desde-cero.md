# Reset desde cero — runbook genérico

> Reemplaza `docs/migraciones/HANDOFF-reset-test.md` y `docs/migraciones/HANDOFF-ruta-c.md`
> (ambos marcados obsoletos). Procedimiento de `bugs/migracion_cero/plan_v2.md` Fase 7,
> generalizado: sirve para reconstruir **cualquier** proyecto Supabase desde volumen vacío
> con el set consolidado + seed de la migración cero — no es específico de "Test".

## Qué hace

`supabase/tests/local/reset-desde-cero.sh` automatiza:

1. Carga las credenciales del proyecto objetivo desde un archivo `.env` que le indiques
   (nunca lee ni imprime su contenido — solo verifica por *nombre* que las variables
   necesarias existan, y que `SUPABASE_DB_URL` contenga el project-ref esperado).
2. `supabase link --project-ref <REF>` si todavía no está linkeado a ese proyecto.
3. **Confirmación interactiva obligatoria**: tenés que escribir el project-ref exacto para
   que el script continúe. No hay flag para saltarla.
4. `supabase db reset --linked` — borra todo y reaplica las 14 migraciones de
   `supabase/migrations/` (7 esquema `cero_01..07` + 7 seed `cero_10..16`).
5. Verifica convergencia (`migration list --linked`, `db push --dry-run --linked`).
6. Corre `verify-seed.sql` contra la base real (conteos, ADM/is_system, `ADM_ACTIVITY_ID`,
   61/61 `default_app_role`, feriados vs generador, cero datos demo, bootstrap completo).
7. Corre `verify-auth-bootstrap.sh` (Admin API → login por password → `get_my_staff_id()` →
   1 fila admin) — el gate real del INSERT en `auth.users`/`auth.identities`, que escribe
   directo sobre esquema gestionado por GoTrue.

Si cualquier paso falla, el script se detiene ahí (`set -euo pipefail`) — no sigue a ciegas.

## Uso

```bash
# Desde la raíz de un checkout con el set consolidado en supabase/migrations/:
supabase/tests/local/reset-desde-cero.sh \
  --project-ref <REF-de-20-caracteres> \
  --env-file <ruta-al-.env-de-ese-proyecto>
```

El `.env` indicado solo necesita las variables **públicas** (las que el frontend ya expone,
seguras de tener en un archivo trackeado) — el script acepta varios alias:

| Variable | Alias aceptado | Para qué |
|---|---|---|
| `SUPABASE_URL` | `API_URL` \| `VITE_SUPABASE_URL` | endpoint REST/Auth del proyecto |
| `SUPABASE_ANON_KEY` | `ANON_KEY` \| `SUPABASE_PUBLISHABLE_KEY` \| `VITE_SUPABASE_PUBLISHABLE_KEY` | login por password en `verify-auth-bootstrap.sh` |

Las **2 credenciales fuertes** — connection string de Postgres con password, y la
service_role/secret key — **nunca se leen de un archivo**. Si ya están exportadas en la
shell donde corrés el script (`SUPABASE_DB_URL`/`DB_URL` y
`SUPABASE_SERVICE_ROLE_KEY`/`SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY`) se usan tal cual; si
no, el script las pide por prompt interactivo con **eco apagado** (no se ven en pantalla, no
quedan en el historial de la shell, no se escriben en ningún archivo). Sacalas del
dashboard de Supabase → Settings → Database (connection string, modo "Session pooler") /
Settings → API (service_role o "secret key" `sb_secret_...`).

**Nunca las pegues en un chat con un agente ni las guardes en un `.env` trackeado.** Si
alguna vez terminan expuestas así, rotalas desde el dashboard en cuanto puedas — no hace
falta detener lo que estés haciendo, pero no las dejes así.

## Dónde corre

**Nunca desde este repo (`aurora-engage-pro-908f8234`)** — sus credenciales locales apuntan a
Lovable. Corre desde `../EMS_Dev_Supabase/` (o cualquier checkout con Supabase CLI + `psql` +
`curl` disponibles), con el mismo set de `supabase/migrations/` sincronizado desde este repo.

## Ejecución real contra "Test" (`slkqdcwwvmjtcbakajib`, org `avbzlerfwattjodoobik`)

Ejecutado el 2026-08-23/24 desde `../EMS_Dev_Supabase/` con `.env.migracion.local` como
`--env-file`. **Resultado final: verde** — 14/14 migraciones, `verify-seed.sql` (22/22
checks) y `verify-auth-bootstrap.sh` (Admin API → login → `get_my_staff_id()` → 1 fila
admin) pasaron contra la base real. Hubo un incidente en el camino, documentado abajo
porque se va a repetir con cualquier proyecto que tenga historial previo divergente.

### Hallazgo real: `supabase db reset --linked` puede dejar objetos sueltos

A diferencia de `supabase db reset --local` (que recrea el contenedor Docker entero — vacío
garantizado), `db reset --linked` contra un proyecto remoto funciona revirtiendo
("`down`") lo que la tabla `supabase_migrations.schema_migrations` del remoto tenía
registrado como aplicado, y después reaplicando (`up`) el set local. Test tenía un
historial previo **completamente divergente** del set consolidado (datos de antes de la
migración cero). El primer intento reventó así:

```
ERROR: relation "fund_request_number_seq" already exists (SQLSTATE 42P07)
At statement: 7 -- CREATE SEQUENCE public.fund_request_number_seq ...
```

Diagnóstico (sin tocar nada más, solo lectura):

```sql
-- schema_migrations quedó en 0 filas: el "down" sí corrió y limpió casi todo
select version from supabase_migrations.schema_migrations order by version;  -- (0 rows)

-- pero quedó UN objeto suelto en public — una secuencia standalone (no OWNED BY ninguna
-- tabla), que el "down" no sabe revertir porque no está atada a un DROP TABLE ... CASCADE
select n.nspname, c.relname, c.relkind from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' order by 1, 2;
--  public | fund_request_number_seq | S
```

Fix aplicado (una sola vez, porque a partir de este reset Test queda en el historial
consolidado — un reset futuro de Test ya no debería divergir así):

```bash
psql "<connection string>" -c "DROP SEQUENCE public.fund_request_number_seq;"
supabase db push --include-all --linked   # push hacia adelante, no reset — evita el "down"
supabase migration list --linked           # confirmar 14/14, Local == Remote
```

**Lección para el script/runbook**: si `db reset --linked` falla con `already exists` en
un proyecto con historial previo ajeno al set consolidado, no reintentar `db reset`
directamente — diagnosticar qué quedó en `public` (la consulta de arriba), limpiarlo a
mano, y usar `supabase db push --include-all --linked` (que solo aplica hacia adelante,
sin invocar la lógica de "down") en vez de un segundo `db reset`.

### Nota de encoding

`verify-seed.sql` corrido contra un proyecto remoto puede mostrar los acentos/ñ como
`â?"`/`A-`/`A±` en la salida de `psql` en Windows — es solo el cliente `psql` sin
`PGCLIENTENCODING=UTF8` seteado, cosmético, no afecta el resultado (`PASS`/`FAIL` se lee
igual). Setear `PGCLIENTENCODING=UTF8` antes si molesta.

## Checklist manual post-reset (plan §7.3 — no lo hace el script, es criterio humano)

- [ ] **Activar al admin del seed**: Authentication → usuario `neilgraneros@ruizmier.com` →
      Reset password (o enviar recovery). Fallback: Auth Admin API
      (`PUT /auth/v1/admin/users/{id}`, mismo endpoint que usa `verify-auth-bootstrap.sh`).
      **No** crear un admin sustituto, **no** insertar en `user_roles` a mano.
- [ ] Login con ese admin en la app apuntada al proyecto reseteado; verificar que
      `get_my_staff_id()` resuelve (ya lo probó el script, pero confirmarlo desde la UI real).
- [ ] `HOLIDAY_ENGAGEMENT_ID` vacío por diseño — completar a mano cuando exista el encargo de
      feriados/no facturable.
- [ ] Alta de un equipo/asignación de prueba con `skills` vacío — debe funcionar.
- [ ] Personal mínimo para el smoke de encargo (Socio + Gerente reales, ver plan §7.3) —
      datos temporales de ese ambiente, nunca parte del seed.
- [ ] Smoke de catálogos visibles, cliente + encargo + hoja de tiempo básica.
- [ ] Smoke de feriados vs generador: "Generar feriados nacionales" 2026 debe responder
      "ya existen" (no-op).
- [ ] Smoke de Storage: subir un comprobante de gasto y un contrato de encargo.

## Reutilización futura

Cualquier ambiente Supabase nuevo (staging adicional, un segundo Test, etc.) se reconstruye
con el mismo script — solo cambian `--project-ref` y `--env-file`. No hace falta escribir un
procedimiento nuevo por ambiente.
