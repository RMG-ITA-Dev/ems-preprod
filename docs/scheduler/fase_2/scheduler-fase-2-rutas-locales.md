# Rutas de migración A/B/C — ejecución local (Docker), Fase 2 Scheduler

> Complementa `docs/scheduler/fase_2/scheduler-fase-2-verificacion.md`. Guía paso a paso para correr las
> Rutas A/B/C de `bugs/scheduler/fase_2/plan_v2.md` **localmente, contra Docker**, sin tocar Lovable ni
> `../EMS_Dev_Supabase/`. Pensado para ejecutarse en un repo clon con Supabase local levantado
> (`supabase start`), p. ej. `EMS_Dev_Local/`.
>
> Actualizado 2026-07-28: la Ruta B ya se corrió en modo diagnóstico (§2 tiene el resultado real, no
> solo el plan). Rutas A y C siguen sin ejecutarse.
>
> Actualizado 2026-07-29: **Q0 quedó resuelto** — se renombraron los 5 archivos "perdedores" a
> timestamps únicos (ver `scheduler-fase-2-verificacion.md`, sección "Q0 — RESUELTO por renombrado").
> Las secciones de abajo que hablan de Q0 como pendiente quedan como registro histórico de cómo se
> llegó a esa decisión; el estado actual es: **sin más bloqueo de Q0** en ninguna de las 3 rutas.
>
> Actualizado 2026-07-29 (más tarde, en `EMS_Dev_Local`): **Ruta B cerrada con el CLI real** — 139/139
> migraciones, `migration list` sin divergencias, `db push --dry-run --include-all` "up to date". Los 3
> archivos de la candidata (c) que habían quedado copiados de la sesión anterior se borraron y su
> bookkeeping se revirtió (`migration repair --status reverted`) — ya redundantes. Fingerprint
> capturado, sin commitear. Detalle en `scheduler-fase-2-verificacion.md`, sección "Ruta B — cierre con
> el CLI real". Rutas A y C siguen sin ejecutarse; §1.1/§1.2 (gaps de `development`) siguen pendientes
> y son lo único que falta para correrlas.

## 0. Estado verificado del entorno

- **Supabase CLI** `2.100.1` (hay actualización a `2.110.0` disponible, no aplicada). **Docker**
  `29.4.1`, daemon corriendo.
- **Stack local**, atado al `project_id` de `supabase/config.toml` (`ugqxfnrxvksiltwxzist` — solo el
  identificador de config local heredado de Lovable; este stack nunca toca el proyecto real). DB en
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio en `:54323`.
- **`feat/roles-permisos`** (revisado en `origin/feat/roles-permisos`): 3 commits sobre el mismo punto
  de partida que `dev-scheduler` (`faa3d6b`). Solo migraciones nuevas —
  `20260724000000_authz_fase1_catalog.sql`, `20260724010000_authz_fase2_seed.sql`,
  `20260724020000_authz_fase2_engine.sql` — 100% aditivas: crean `authorization_roles` /
  `authorization_permissions` / `authorization_role_permissions`, agregan `user_roles.role_key`
  (nullable, backfill desde el enum `role` existente), y las funciones `current_role_key()`,
  `has_permission()`, `permission_scope()`, `get_my_authorization_context()`. **No tocan**
  `has_role()`, `is_admin()`, el enum `app_role`, ni ninguna política RLS existente — el propio
  comentario de la migración dice que la reescritura de RLS para consumir este motor es su "Fase 4",
  todavía no hecha. Sin cambios en `src/**` todavía. Sin colisión de timestamp con los 5 pares de Q0
  ni con el piso de convergencia propuesto (`>20260720194653`, `20260724... < 20260727...`).

## 1. Convención operativa para las 3 rutas

- Un solo stack Docker local (mismo `project_id` ⇒ mismos nombres de contenedor). No se puede tener
  A/B/C vivas simultáneamente sin darle a cada una un `project_id` distinto — complejidad extra sin
  necesidad real.
- El gate de paridad de Plan v2 solo exige que el **fingerprint de esquema** post-convergencia sea
  idéntico entre rutas — no bases vivas en paralelo. Por ruta: **reset → aplicar → capturar
  fingerprint → comparar al final.**
- Ninguna ruta toca Lovable ni las credenciales de `EMS_Dev_Supabase/` — todo corre contra
  `127.0.0.1:54322` con las claves default locales (no son secretos reales, son las que genera
  `supabase start` en cualquier máquina).
- Fingerprint sugerido por ruta (afinar la forma exacta al llegar a C1, donde Plan v2 pide ACLs/
  owners/policies, no solo un dump textual): `pg_dump --schema-only` + un query de catálogo
  (`pg_policies`, `information_schema.role_table_grants`, `pg_proc` con su definición) volcado a un
  archivo por ruta, para diff.
- **Dos bloqueos conocidos, presentes en TODAS las rutas** porque viven dentro de las 131 migraciones
  de `development` (no son del scheduler): ver §1.1 y §1.2. Cualquier remedio que se decida para ellos
  aplica igual a Ruta A, B y C.

### 1.1. Bloqueo — rename de categorías nunca capturado

La primera migración de `development` (`20251204045534`) siembra categorías en **inglés** (`Partner`,
`Manager`, `Senior`, `Staff`, `Junior`). Una migración de febrero (`20260224065512`) da por hecho que
ya existen en **español** (`Socio`, `SQR`, `Director`, `Gerente`, `Supervisor`, `Senior`,
`Semi-Senior`, `Asistente`, `Especialista IT`, `Especialista TAX`), con un fail-fast
`RAISE EXCEPTION 'Expected category "%" not found'` si falta alguna. `Director`, `Supervisor` y
`Semi-Senior` **no existen bajo ningún nombre** — son categorías creadas a mano en el `development`
real, nunca migradas. No existe `supabase/seed.sql` que compense esto. **Bloquea cualquier reset limpio
de `development` (y por tanto de las 3 rutas) en `20260224065512`.**

Parche para continuar (solo en el sandbox local, no toca el repo — hasta que se decida el fix
definitivo, ver §6):

```sql
UPDATE categories SET category_name = 'Socio'     WHERE category_name = 'Partner';
UPDATE categories SET category_name = 'Gerente'   WHERE category_name = 'Manager';
UPDATE categories SET category_name = 'Asistente' WHERE category_name = 'Staff';
INSERT INTO categories (category_name, display_order) VALUES
  ('Director', 3), ('Supervisor', 4), ('Semi-Senior', 6);
```

### 1.2. Bloqueo — assertion de admin no reproducible desde vacío

La migración siguiente (`20260224065539`) exige `SELECT count(*) FROM user_roles WHERE role='admin'`
`>= 1` — imposible en una base recién creada (cero usuarios reales todavía; el bootstrap real de admin
pasa por el edge function `assign-user-role` en el primer signup, que ocurre después de que la app ya
está arriba, no durante el replay de migraciones). El resto de esa migración (chequeo de
`migration_run_log`) **sí es reproducible** — la migración anterior (`20260224065444`) crea esa tabla
y se auto-registra de forma legítima e idempotente, no hace falta intervención ahí.

Parche para continuar (solo sandbox):

```sql
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                         email_confirmed_at, created_at, updated_at,
                         raw_app_meta_data, raw_user_meta_data)
VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'diagnostic-admin@ruizmier.com', 'x',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb);
-- un trigger crea automáticamente la fila en user_roles (rol por defecto); promoverla:
UPDATE user_roles SET role = 'admin'
  WHERE user_id = '00000000-0000-4000-8000-000000000001';
```

(El email debe terminar en `@ruizmier.com` — hay un trigger `validate_email_domain()` que rechaza
otros dominios.)

**Tercera assertion en la misma migración, encontrada en la corrida del 2026-07-28 (no documentada
hasta ahora):** la misma `20260224065539` también exige que ninguna categoría tenga
`default_app_role IS NULL`. `M2` (migración previa) backfillea las 10 categorías esperadas pero deja
`Junior` sin cubrir. Parche (sandbox):

```sql
UPDATE categories SET default_app_role = 'staff'
  WHERE category_name = 'Junior' AND default_app_role IS NULL;
```

## 2. Ruta B — resultado real (2026-07-28)

Corrida en dos modos distintos; **no confundir uno con otro**:

### 2.a Con el CLI oficial (`supabase db push --include-all --local`) — el que importa para el AC

Sobre un stack que ya tenía `development` parcialmente aplicado, el catch-up avanzó 3 migraciones y
**abortó** en el primer par de versión duplicada (`20260521000000`, segundo archivo
`create_vw_staffing_alerts.sql`):

```
ERROR: duplicate key value violates unique constraint "schema_migrations_pkey" (SQLSTATE 23505)
Key (version)=(20260521000000) already exists.
At statement: 3
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES($1, $2, $3)
```

Esto **es el hallazgo real de Q0**: `version` es la PK de `schema_migrations`, el CLI hace un
`INSERT` estricto (sin `ON CONFLICT`) al final de cada archivo — así que **los 5 pares fallarán igual,
siempre**, es mecánica determinística de Postgres, no hace falta probarlos uno por uno con el CLI real.
**Q0 quedó resuelto el 2026-07-29 renombrando los 5 archivos "perdedores"** (ver
`scheduler-fase-2-verificacion.md` y §6 más abajo) — este hallazgo queda como el diagnóstico que llevó
a esa decisión.

### 2.b Replay manual (`psql` secuencial + tracking propio) — solo para aislar problemas de contenido

Con un stack recién reseteado desde `development` solo (131 archivos, sin nada del scheduler), aplicando
archivo por archivo con `psql -f` y registrando el tracking a mano:

1. Falló en `20260224065512` (§1.1). Parcheado en sandbox → continuó.
2. Falló en `20260224065539` (§1.2 + la tercera assertion de `Junior`). Parcheado en sandbox → continuó.
3. **El resto de `development` (131) corrió sin errores de SQL, incluidos los 5 pares de Q0** — pero
   "sin errores" **no es lo mismo que "sin huecos"** (ver corrección abajo).
4. Luego, checkout a `dev-scheduler` (139 archivos) y aplicación de los 8 restantes del scheduler:
   sin errores nuevos.
5. Verificado: `wo_staffing_requirements`, `wo_staffing_requirement_skills`, `engagement_assignments`
   existen; las políticas `wo_staffing_req_select` / `wo_staffing_req_skills_select` tienen
   `qual = true` — confirma G2 de `plan_v2.md` en vivo (lectura firmwide para cualquier autenticado).

**Corrección (bug real en el tracking, no en el contenido):** un primer intento trackeaba por
**versión** (`INSERT ... ON CONFLICT (version) DO NOTHING`) — en una pareja Q0, en cuanto el primer
archivo queda registrado bajo esa versión, el `ON CONFLICT` hace que el **segundo se salte en
silencio, sin correr su DDL**, sin ningún error. De los 5 pares, 3 dejan un hueco real así
(`wo_payment_plan.sql`, `service_scoped_categories.sql`, `service_scoped_categories_fixes.sql` — los
otros 2 no importan porque un archivo posterior recrea el mismo objeto completo de cero). Confirmado
con un error reproducible: sin `categories.service_id` (que trae `service_scoped_categories.sql`),
`20260719000000_0714_154_worksheet_service_scope.sql` falla con `column c.service_id does not exist`.

**Procedimiento corregido, reproducible desde cero:**

1. Aislar una base limpia sin migraciones propias (mover `supabase/migrations/` afuera, `db reset
   --local --no-seed`, restaurar la carpeta) — evita que el reset intente el CLI oficial y choque con
   Q0 de entrada.
2. Crear una tabla de tracking propia **por nombre de archivo**, no por versión:
   `CREATE TABLE public._manual_replay_applied (filename text PRIMARY KEY)` — así ambos archivos de
   cada pareja Q0 corren igual (el `schema_migrations` real sigue teniendo solo una fila por pareja,
   consistente con lo que hace el CLI oficial).
3. Loop por archivo, en orden, saltando lo ya trackeado (por `filename`), transaccional por archivo
   (`psql -v ON_ERROR_STOP=1 -1 -f <archivo>`), aplicando los parches de §1.1/§1.2 cuando el loop se
   detenga ahí.
4. **Dos gotchas de herramienta, no de contenido:**
   - `psql` en Windows toma el codepage de la consola (`WIN1252`) en vez de UTF-8 por default — fija
     `$env:PGCLIENTENCODING = "UTF8"` antes de conectar, o falla con `character with byte sequence
     0x8d in encoding "WIN1252"` en archivos con tildes.
   - En PowerShell, `$var = (comando).Trim()` revienta y **no vacía `$var`** cuando el comando no
     imprime nada (0 filas) — conserva el valor de la vuelta anterior del loop. Sin resetear
     `$var = ""` al inicio de cada iteración, un solo `"1"` exitoso queda pegado para siempre y el
     loop se saltea en silencio todo lo que sigue, sin ningún `Applying...` ni error visible más allá
     del ruido cosmético de PowerShell.
5. Resultado verificado de punta a punta: **139/139 archivos**, `supabase_migrations.schema_migrations`
   con **134 filas** (139 − 5, una por pareja Q0 — esperado), y los 3 objetos antes faltantes
   confirmados presentes (`wo_payment_plan`, `categories.service_id`, las 2 RPC con su versión "fix").

**Conclusión de Ruta B hoy:** con los tres parches de §1.1/§1.2 (incluida la assertion de `Junior`) y
el tracking corregido por archivo, el contenido combinado (139 migraciones) no tiene más sorpresas —
confirmado a nivel de objeto, no solo por ausencia de errores. **Q0 ya está resuelto** (2026-07-29,
renombrado — ver `scheduler-fase-2-verificacion.md`); lo único que falta para el AC real de Plan v2 es
repetir el catch-up con el CLI real (no el replay manual de este documento) sobre las 139 migraciones
ya sin duplicados. `bugs/scheduler/fase_2/draft-migrations/` quedó **obsoleto** — el remedio elegido
fue renombrar, no reaplicar contenido en migraciones nuevas.

### Pasos para reproducir/continuar desde cero

1. Confirmar que no hay datos en el stack que quieras conservar (sandbox local, pero confirmar antes).
2. `supabase db reset` (139 migraciones, ya sin timestamps duplicados desde el 2026-07-29).
3. Aplicar migraciones con el CLI real — vas a topar con §1.1/§1.2 (parchear como se indica ahí);
   **Q0 ya no debería aparecer** (verificar: `ls supabase/migrations/ | sed -E 's/^([0-9]{14})_.*/\1/'
   | sort | uniq -d` debe salir vacío).
4. `supabase migration list` + `supabase db push --dry-run --include-all` deben dar 0 pendientes.
5. Harness RLS ya portado (`npm run test:rls`): usa su propia `createdb`/`dropdb` efímera, no
   interfiere con este stack; ya se verificó que pasa (ver `scheduler-fase-2-verificacion.md`).
6. Capturar fingerprint de Ruta B (aclarar "B sin C1-C4", pre-convergencia).
7. Documentar en `scheduler-fase-2-verificacion.md` (no crear otro archivo).

## 3. Ruta C — al cerrar Fase 7 (base + 8 del scheduler, luego las 59 de `development`)

Necesita un punto de partida **distinto** (sin las 59 de `development`) — no se logra reseteando el
mismo folder de migraciones de este repo. Usar un git worktree desechable.

⚠️ **Corrección de timing (2026-07-29):** §1.1/§1.2 **ya están en los 72 base de `main`/
`sruizmier-scheduler-v3`** (verificado con `git cat-file -e` — ambas migraciones son de febrero 2026,
antes del último commit de `main` en abril). Van a aparecer en el **paso 2** (el reset inicial de 80
migraciones), no recién en el paso 4 como se pensaba antes. Q0 ya no debería aparecer en ningún punto
(resuelto por renombrado, ver §6) — confirmar igual con el chequeo de duplicados.

1. ```bash
   git worktree add ../ems-route-c-scratch origin/sruizmier-scheduler-v3
   ```
   (de solo lectura; no se commitea nada ahí; se borra al terminar).
2. Desde `../ems-route-c-scratch`, resetear el **mismo** stack Docker (mismo `project_id` ⇒ mismos
   contenedores, aunque se invoque desde otro directorio) usando su propia carpeta
   `supabase/migrations/` (72 base + 8 scheduler = 80, sin las 59 de `development`). Usar el script de
   pre-seed en vez de `supabase db reset` solo — acá es donde va a toparse con §1.1/§1.2:
   ```bash
   bash supabase/tests/local/preseed-development-gaps.sh
   supabase migration list        # 80 aplicadas
   ```
3. *(Pedido explícito de Plan v2 para Ruta C)* Sembrar datos sintéticos representativos antes del
   paso 4, para ejercitar backfills/`NOT NULL`/conversión de estados sobre datos "reales-equivalentes".
4. Traer las 59 de `development` que faltan: copiar (no commitear) esos 59 archivos desde
   `dev-scheduler` a `../ems-route-c-scratch/supabase/migrations/`, luego:
   ```bash
   supabase db push --include-all
   ```
   §1.1/§1.2 ya deberían estar resueltos desde el paso 2 — este push no debería toparse con ningún
   bloqueo nuevo de ese tipo. Registrar el comportamiento de las migraciones destructivas/de datos
   mencionadas en Plan v2 (`drop_expense_logs`, `service_scoped_categories`, `estado_encargo_0602-135`)
   sobre los datos sintéticos del paso 3.
5. Confirmar convergencia:
   ```bash
   supabase migration list                    # 139 aplicadas
   supabase db push --dry-run --include-all   # 0 pendientes
   ```
6. Aplicar las migraciones de convergencia (C1-C4, ya escritas para entonces).
7. Capturar fingerprint de Ruta C.
8. Limpiar: `git worktree remove ../ems-route-c-scratch`.

## 4. Ruta A — al cerrar Fase 7 (instalación limpia completa)

También topa con §1.1/§1.2 (son parte de las 131 de `development` que Ruta A también replaya). Q0 ya
resuelto por renombrado — no debería aparecer.

1. Reset total del stack desde este repo (`dev-scheduler`, con las 139 + C1-C4 ya integradas), usando
   el script de pre-seed en vez de `supabase db reset` solo:
   ```bash
   bash supabase/tests/local/preseed-development-gaps.sh
   supabase migration list                    # 139+4 aplicadas, orden cronológico puro
   supabase db push --dry-run --include-all   # 0 pendientes
   ```
2. Capturar fingerprint de Ruta A (`bash supabase/tests/local/capture-route-fingerprint.sh ruta_a`).
3. Comparar los 3 fingerprints (A/B/C) → diff vacío = gate de paridad cumplido = esquema canónico
   confirmado (criterio de aceptación central de Fase 2).

## 5. `feat/roles-permisos` — dónde encaja

- Se puede mergear a `development` en cualquier momento sin afectar los timestamps ni el contenido
  de las migraciones del scheduler **hoy**. Si se mergea antes de correr Ruta B/C, sus 3 migraciones
  simplemente se suman al lote de `development` que cada ruta aplica.
- **Antes de escribir C1** (RLS canónica del scheduler), volver a revisar el estado de esa rama por si
  ya avanzó a su "Fase 3/4" (RLS real consumiendo `has_permission()`) — eso sería un frente de drift
  nuevo sobre los mismos helpers que C1 toca (mismo tipo de riesgo que G7, pero por reemplazo total
  del modelo de autorización en vez de solo cobertura incompleta).
- Si en algún punto esa iniciativa reescribe RLS de tablas que el scheduler también gobierna
  (`engagement_assignments`, `wo_staffing_requirements`), ahí sí se necesita coordinación explícita
  entre ambas iniciativas — no es automatizable con un simple chequeo de timestamps.

## 6. Decisiones — resueltas / con script listo

1. **Q0 — RESUELTO el 2026-07-29 por renombrado.** Se descartaron (a) bookkeeping manual (no escala,
   viola "ningún SQL manual" en instalaciones limpias futuras) y (c) recovery-migrations + reintento
   (`bugs/scheduler/fase_2/draft-migrations/`, ahora **obsoleto**). Se eligió (b) renombrar los 5
   archivos "perdedores" a timestamps únicos adyacentes, verificado seguro antes de ejecutar:
   - Los 10 archivos de los 5 pares son **exclusivos de `development`** (no están en `main` ni en
     `sruizmier-scheduler-v3`, confirmado con `git cat-file -e` contra las 3 ramas).
   - `main` no es una línea divergente, solo está detrás (0 commits propios de migraciones frente a
     `development`) — y Lovable sincroniza únicamente desde `main`, así que nunca vio estos archivos.
   - Confirmado por el operador contra `EMS_Dev_Supabase` (acceso directo): el esquema
     `supabase_migrations` **no existe en absoluto** ahí — el CLI nunca trackeó nada; todo se aplicó a
     mano por SQL Editor. Ningún nombre de archivo está registrado en ningún lado.
   - El contenido SQL **no se tocó** — verificado con `git hash-object` antes/después de cada rename
     (idéntico byte a byte). Solo cambió el nombre del archivo.
   Detalle completo, tabla de renames y la nota sobre el incidente de rama (detectado y revertido sin
   consecuencias) en `scheduler-fase-2-verificacion.md`, sección "Q0 — RESUELTO por renombrado".
2. **§1.1/§1.2 — RESUELTO con script (2026-07-29):**
   `supabase/tests/local/preseed-development-gaps.sh`. Un `supabase/seed.sql` **no funciona** para
   esto (corre después de todas las migraciones, y ambos bloqueos ocurren a mitad de la secuencia,
   antes de que `seed.sql` llegue a correr nunca), y una migración nueva tampoco (solo pueden ir al
   final del historial, mucho después cronológicamente de donde ocurren estos bloqueos). El script
   envuelve la secuencia ya validada a mano en `EMS_Dev_Local`: `db reset` (se detiene esperado en
   `20260224065512`) → parche de categorías → `db push --include-all` (se detiene esperado en
   `20260224065539`) → parche de admin + `Junior` → `db push --include-all` (completa el resto).
   Confirmado que ambos bloqueos ya están en los 72 base de `main` (no solo en las 59 de
   `development`) — el script aplica igual sin importar desde cuál de las 3 rutas se invoque. Ruta B
   **no** lo necesita (parte de un ambiente que ya tiene esto resuelto de verdad).

Ninguno de estos dos bloqueos es parte del alcance original de Fase 2 del scheduler (son de
`development`, preexistentes) — pero bloqueaban completar cualquiera de las 3 rutas con el CLI oficial
desde cero, que es lo que el criterio de aceptación central de Plan v2 exige. Con Q0 y estos dos
resueltos, lo único que falta para correr Rutas A y C es Q7 (project refs).
