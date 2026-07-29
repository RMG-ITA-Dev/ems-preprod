# Fase 2 — Verificación (ejecución parcial, 2026-07-27 — actualizado 2026-07-29)

> Fuente: `bugs/scheduler/fase_2/issue_fase_2.md` + `bugs/scheduler/fase_2/plan_v2.md`.
> Rama: `dev-scheduler` (por decisión explícita del operador — no se creó `scheduler/phase-2-*`).
> Alcance de la sesión del 2026-07-27: **solo la parte de Plan v2 que no depende de Q0** (preflight
> bloqueante de versiones de migración duplicadas). Las 4 migraciones de convergencia (C1–C4) **no se
> escribieron**. El 2026-07-28 se intentó el preflight de Q0 localmente (§ "Ruta B — intento de
> catch-up local"); ver esa sección para el resultado y sus matices.
>
> **Estado al 2026-07-29: Q0 resuelto (renombrado) y Ruta B cerrada con evidencia oficial del CLI real**
> — ver secciones "Q0 — RESUELTO por renombrado" y "Ruta B — cierre con el CLI real" más abajo. Sigue
> pendiente: los gaps de `development` (ítem 1 de "Próximo paso"), Q7, y Rutas A/C.

## Por qué el alcance es parcial

Plan v2 declara, en dos lugares, que Q0 bloquea la escritura de la convergencia:

- *"Preflight bloqueante (antes de escribir cualquier convergencia): ... No proceder a pushes de
  entorno hasta documentar el resultado (→ Q0)."*
- Synthesis notes: *"Q0 (bloqueante): ... Bloquea el criterio de aceptación central; debe resolverse
  antes de escribir la convergencia."*

Ese preflight requiere ejecutar el runner oficial de Supabase contra un proyecto real para probar si
los 5 pares de migraciones con el mismo timestamp de 14 dígitos se aplican y registran de forma
determinista. Por diseño de este repo (`aurora-engage-pro`), ningún agente ejecuta Supabase CLI aquí
— esas pruebas corren en `../EMS_Dev_Supabase/`, manualmente, por el operador humano. Por lo tanto Q0
no puede resolverse desde esta sesión, y C1–C4 quedan diferidas hasta que el operador reporte el
resultado del preflight.

También sigue sin resolver **Q7** (project refs del Supabase de integración y de los efímeros A/C) —
sin esto, ningún paso de la sección "Verification Steps" de Plan v2 puede ejecutarse de todas formas.

## Hecho en esta sesión

### 1. Las 8 migraciones históricas del scheduler, incorporadas sin modificar

Copiadas byte-a-byte desde `origin/sruizmier-scheduler-v3` a `supabase/migrations/` en este repo.
Verificación de blob (equivalente al paso 0 de Verification Steps, que sí es una operación local de
git, no de Supabase):

| Archivo | Blob SHA (origen == destino) |
|---|---|
| `20260506120000_wo_staffing_requirements.sql` | `386a3187e056265128b411569b7d3852c031db4c` |
| `20260716120000_engagement_assignments_phase3.sql` | `7315488b67757c48032eab2becb3d0fd910e0fb2` |
| `20260717233000_engagement_assignments_d5_rls.sql` | `9cb2ac3f640a7a99ed4739839e1f7da81d174322` |
| `20260718120000_scheduler_phase5_timesheet_authorization.sql` | `b595445c1bad4ebeb717d5cd685b257c6f2751fb` |
| `20260719044642_ee740102-8b5c-4d4b-b8ee-1571ec25840b.sql` | `852a7b9f0cce7fc88132598706813de5bb261055` |
| `20260720120000_engagement_assignments_category_id_backfill.sql` | `cc79f50ae56555a06cb6ea67116e4eeeb9a42d2c` |
| `20260720194555_4106bdc5-1314-4e04-8a1b-49375f8d87e5.sql` (solo comentarios) | `c69aa39fc9762335edec05f924e1851601e6e5d8` |
| `20260720194653_61b4d8eb-86a8-495e-a572-5eeab91ebdb2.sql` | `b51ce07881ae03d6bc52a757537574e060530211` |

Migraciones totales en `supabase/migrations/` tras la incorporación: **139** (131 de `development` + 8
del scheduler) — coincide con la cifra que Plan v2 usa para la Ruta A.

**Discrepancia encontrada y resuelta:** la sección "Files to Change" de Plan v2 lista **9** archivos
históricos, agregando `20260506120001_wo_staffing_requirements_rls.sql`. Ese archivo **no existe** en
`origin/sruizmier-scheduler-v3` (confirmado con `git ls-tree -r origin/sruizmier-scheduler-v3 --
supabase/migrations`). El resto del documento — el encabezado ("8, desde sruizmier-scheduler-v3"),
`issue_fase_2.md`, y las referencias numeradas de los hallazgos G1/G2/G8 (p. ej. "migraciones #1/#5",
"#3/#6/#8") — son internamente consistentes solo bajo un esquema de **8** archivos. Se trató como un
error de transcripción de Plan v2 y se usó la lista de 8 (idéntica a `issue_fase_2.md`); no se inventó
ni se creó el noveno archivo.

### 2. Infraestructura de pruebas SQL portada (sin re-base a service-scoping)

Portados sin modificar desde `origin/sruizmier-scheduler-v3` (hashes de blob verificados idénticos):

- `supabase/tests/local/00-shim-supabase.sql`
- `supabase/tests/local/05-shim-v2-drift-table.sql`
- `supabase/tests/local/10-shim-scheduler-v2-views.sql`
- `supabase/tests/local/20-shim-timesheet.sql`
- `supabase/tests/local/run-rls-tests.sh`
- `supabase/tests/rls-engagement-assignments-d5.sql`
- `supabase/tests/rls-timesheet-authorization-phase5.sql`

**Por qué sin re-base:** G9 de Plan v2 pide re-basar el harness a service-scoping (`categories.service_id`,
`engagements.practica`) porque, sin eso, ninguna prueba de service-scope es válida y el harness no
detecta G1 (la regresión de `vw_staffing_alerts`). Pero ni el harness ni los dos suites portados
referencian `service_id`/`practica`/`services` (confirmado por grep) — solo ejercitan las 8 migraciones
históricas, que tampoco las tocan. El motivo real del re-base (probar los triggers de service-scope y
el `GRANT` restaurado de `vw_staffing_alerts`) vive en C1/C2, diferidas. Re-basar ahora sería trabajo
prematuro sobre una convergencia que aún no existe. `30-shim-service-scope.sql` (nuevo, por Plan v2)
**no se creó** por la misma razón.

Este harness corre contra un PostgreSQL local desechable (`createdb`/`psql`/`dropdb`), **nunca** contra
Supabase — no viola la restricción de no ejecutar Supabase/migraciones en este repo.

### 3. `package.json`

Se agregó el script `"test:rls": "bash supabase/tests/local/run-rls-tests.sh"`.

### 4. `docs/operations.md` (G10, diferido de Fase 1)

- Edge Functions: `6` → `7` (faltaba `secure-signin` en el inventario; agregado con su propósito).
- Migraciones: `"67+"` → `139` (cifra real tras incorporar las 8 del scheduler).
- Regla de mantenimiento: `"cuando agregues una sexta edge function"` → genérico (ya no aplica un
  umbral fijo).

## No hecho (diferido, con motivo)

| Ítem de Plan v2 | Motivo del diferimiento |
|---|---|
| C1–C4 (migraciones de convergencia) | Bloqueadas por Q0 (preflight de versiones duplicadas, requiere runner oficial en `EMS_Dev_Supabase/`) |
| `30-shim-service-scope.sql` | Depende de los triggers de service-scope de C2 |
| `rls-wo-staffing-requirements.sql` | Depende de las políticas canónicas de C1 (reemplazo de `USING (true)`) |
| `rpc-save-wo-staffing.sql`, `rpc-save-engagement-assignments.sql` | Prueban RPC que crean C3/C4 |
| `schema-convergence-assertions.sql` | Prueba `is_schedulable`, defaults, etc. de C2 |
| `fixtures/route-c-synthetic-seed.sql`, `migrations/scheduler-fase2-route-manifest.txt`, `run-scheduler-fase2-routes.sh` | Ejercitan las Rutas A/B/C completas, que requieren proyectos Supabase reales (Q7) |
| `.github/workflows/scheduler-integrity.yml` | Referenciaría los archivos de prueba de arriba, aún inexistentes |
| `docs/plans/scheduler-fase-2-esquema-canonico.md`, `docs/plans/scheduler-fase-2-runbook-ruta-c.md` | Documentan el esquema canónico y evidencia de rutas que todavía no se ejecutaron |
| `src/integrations/supabase/types.ts` | Se regenera desde el Supabase de integración vía CLI — explícitamente fuera del alcance de este repo |
| Preflight de versiones duplicadas (Q0), sanear `schema_migrations` (issue §1), Rutas A/B/C, gate de paridad | Todo esto se ejecuta en `../EMS_Dev_Supabase/`, por el operador humano, con el runner oficial |

## Evidencia de verificación local (esta sesión)

Ejecutado localmente contra un PostgreSQL 18 desechable (`localhost:5432`, roles/DB creados y
destruidos por el propio script — no es Supabase, no usa credenciales de Lovable):

```
$ npm run test:rls
...
OK: db-name validator self-test passed (18 hostile names rejected — incl. 6 glob-passing regex-only cases, 3 safe names accepted)
...
D5 RLS: ALL CHECKS PASSED (rolled back)
P5 TIMESHEET AUTHZ: ALL CHECKS PASSED (rolled back)
OK: lane 1 (Phase 3 → D5 → Phase 5 → corrective, all idempotent), lane 2 (drift repair by corrective
alone + out-of-order Phase 3 re-apply), and lane 3 (loud-abort failure paths, both apply modes) all
verified; all leakage/authz checks passed
```
Exit code: `0`.

Esto confirma que las 8 migraciones históricas, tal como quedaron incorporadas en este repo, son
idempotentes, no rompen ante out-of-order re-apply, y sus abortos por datos son ruidosos y
transaccionalmente limpios — pero **no** es evidencia de las Rutas A/B/C de Plan v2 (esas corren
contra Supabase real/reconstruido, con `development` de por medio, en `EMS_Dev_Supabase/`).

## Ruta B — intento de catch-up local (2026-07-28)

> Fuente: `docs/scheduler/fase_2/scheduler-fase-2-rutas-locales.md` §2. Ejecutado por el operador contra el stack
> Docker local (`127.0.0.1:54322`), con Claude Code asistiendo en diagnóstico. Confirmado con el
> operador de antemano: el stack es descartable, sin datos que preservar.

### Drift previo al catch-up (resuelto)

Antes de poder correr `supabase db push --include-all --local`, el CLI rechazó el push por 4 versiones
en `supabase_migrations.schema_migrations` sin archivo correspondiente en `supabase/migrations/`:
`20260131000000`, `20260224065530`, `20260224065545`, `20260514000000`. Inspeccionadas por su columna
`statements` (SQL real ejecutado, no asumido):

- `20260131000000` (`fix_category_names_spanish`) y las dos `local_dev_*` (`20260224065530`,
  `20260224065545`): parches DML puros, explícitamente comentados como "local dev only" / "never
  captured as a migration" — nunca fueron archivos de este repo. Cero DDL; los dos `local_dev_*` se
  cancelan entre sí (insertan y borran el mismo admin placeholder). No afectan un fingerprint
  schema-only.
- `20260514000000` (`unsubmit_timesheet_safe`): versión vieja de la función que hoy vive en
  `20260527000000_unsubmit_timesheet_safe.sql` con lógica más nueva (chequeo de partner, `COALESCE`,
  `DELETE` en vez de `UPDATE`). Como el archivo actual usa `CREATE OR REPLACE FUNCTION`, reparar el
  bookkeeping y dejar que el archivo actual la sobrescriba no deja contaminación.

Reparado con `supabase migration repair --status reverted 20260131000000 20260224065530 20260224065545
20260514000000 --local` (72 filas resultantes). Sin este paso, `db push --include-all --local` fallaba
directo con "Remote migration versions not found in local migrations directory".

### Resultado del catch-up: Q0 responde (con un matiz importante, verificado de forma independiente)

Con el bookkeeping saneado, `db push --include-all --local` aplicó 3 migraciones más
(`20260506120000_wo_staffing_requirements`, `20260520000000_fix_0511_109_110_...`,
`20260521000000_add_account_lockout_policy` → 75 filas) y **abortó** en el primer par de versión
duplicada (`20260521000000_create_vw_staffing_alerts.sql`, el segundo archivo con ese timestamp):

```
ERROR: duplicate key value violates unique constraint "schema_migrations_pkey" (SQLSTATE 23505)
Key (version)=(20260521000000) already exists.
At statement: 3
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES($1, $2, $3)
```

Este error de llave primaria duplicada **es el hallazgo central y se sostiene por sí solo**: es un
hecho de base de datos (`version` es la PK de `schema_migrations`) independiente de cualquier otro
estado del stack, y confirma que `db push --include-all` **aborta por completo** al toparse con un
segundo archivo que comparte versión con uno ya registrado, en vez de continuar o ignorar el par.

**Corrección tras verificación independiente (Claude Code, mismo stack, mismo puerto `54322`):** el
reporte original atribuía la existencia de `public.vw_staffing_alerts` en la DB a que el `DROP VIEW` /
`CREATE OR REPLACE VIEW` / `GRANT` de *este* intento sí habían corrido y commiteado antes de fallar en
el INSERT de tracking. Verificado directamente, eso **no cuadra**:

- La vista desplegada incluye la columna `seen_at` y un `LEFT JOIN` a `public.staff_alert_seen` — eso
  es contenido de `20260521000001_add_alert_seen_tracking.sql` (versión **posterior**, fuera del par
  duplicado), no de `20260521000000_create_vw_staffing_alerts.sql` (que define la vista **sin**
  `seen_at`, verificado leyendo el archivo completo).
- La tabla `public.staff_alert_seen` (que solo crea `20260521000001`) ya existe.
- Pero `schema_migrations` no tiene ninguna fila para `20260521000001` — según el registro, ese archivo
  nunca se aplicó.

Si el push realmente se detuvo en el par `20260521000000`, `20260521000001` (que va después) no debería
haberse alcanzado — y sin embargo sus efectos ya están presentes. La explicación más plausible es que
**este stack en particular ya tenía `vw_staffing_alerts` (en su forma final) y `staff_alert_seen` desde
antes de este intento** — aplicados de forma ad-hoc/sin tracking en algún momento anterior (consistente
con que el operador ya "tenía las configuraciones" en este sandbox antes de esta sesión) — y no que el
segundo archivo del par los haya creado ahora. Es decir: **este stack específico tiene contaminación
previa no rastreada**, lo que enturbia la lectura de *ese* detalle puntual sin invalidar el hallazgo
central de la llave duplicada.

Es plausible que el mismo error de PK se repita en los otros 4 pares (`20260527000000`,
`20260626000000`, `20260702000000`, `20260703000000`) — no confirmado todavía, porque el push nunca
llegó tan lejos.

### Estado actual del stack (sin tocar más, a la espera de decisión)

- `schema_migrations`: 75 filas, la más alta `20260521000000` (`add_account_lockout_policy`).
- El resto del catch-up (~60 migraciones + los otros 4 pares Q0) no se intentó.
- Por decisión explícita del operador: no se hizo bookkeeping manual del par ni se renombraron archivos
  todavía — se documenta el hallazgo aquí para decidir el remedio a nivel de Plan v2 antes de reintentar
  cualquier ruta.

### Recomendación antes de fijar el remedio de Q0

Dado que este stack tiene contaminación previa no rastreada (arriba), conviene repetir el mismo intento
de catch-up sobre un stack recién reseteado (`supabase db reset` desde cero, sin historia previa) para
obtener una señal limpia de qué produce *cada* archivo de los 5 pares — el error de PK en sí no
depende de la contaminación y debería repetirse igual, pero conviene confirmarlo sin el ruido de este
sandbox específico antes de decidir el remedio operativo definitivo.

## Ruta B — replay limpio desde cero, contenido (2026-07-28, continuación)

> Stack recién reseteado (`supabase db reset`) desde `development` (131 archivos, sin nada del
> scheduler), luego checkout a `dev-scheduler` (139) y aplicación de los 8 restantes. Método:
> `psql -f <archivo>` secuencial por archivo + `INSERT ... ON CONFLICT DO NOTHING` propio en
> `supabase_migrations.schema_migrations` — **no** es el mecanismo real del CLI (ver limitación
> metodológica más abajo). Objetivo: aislar si hay incompatibilidades de **contenido** en el historial
> combinado, sobre un stack sin la contaminación previa notada en la sección anterior.

### Dos hallazgos nuevos en `development` solo (independientes del scheduler y de Q0)

Un `supabase db reset` limpio sobre `development` (131 archivos) **no completa** sin intervención.
Encontrados y parcheados solo en este sandbox (no se tocó el repo):

1. **Rename inglés→español de categorías nunca capturado.** La primera migración
   (`20251204045534`) siembra categorías en inglés (`Partner`, `Manager`, `Senior`, `Staff`,
   `Junior`). Una migración de febrero (`20260224065512`) da por hecho que ya existen en español
   (`Socio`, `SQR`, `Director`, `Gerente`, `Supervisor`, `Senior`, `Semi-Senior`, `Asistente`,
   `Especialista IT`, `Especialista TAX`) — con un fail-fast `RAISE EXCEPTION` si falta alguna.
   `Director`, `Supervisor` y `Semi-Senior` **no existen bajo ningún nombre**: son categorías nuevas
   creadas a mano en el `development` real, nunca migradas. No existe `supabase/seed.sql` que
   compense esto.
2. **Assertion de post-migración no reproducible desde vacío.** `20260224065539` exige
   `count(*) FROM user_roles WHERE role='admin' >= 1` — imposible en una base recién creada (cero
   usuarios reales todavía). El resto de esa migración (chequeo de `migration_run_log`) sí es
   reproducible: la migración anterior (`20260224065444`) crea esa tabla y se auto-registra de forma
   legítima y idempotente (no requiere intervención manual, a diferencia de lo que se pensó al
   principio).

Ambos se parchearon solo en el sandbox (rename de categorías + 3 inserts + un `auth.users`/`user_roles`
admin de relleno) únicamente para poder seguir el replay. **Estructuralmente reales** — bloquean la
Ruta A para `development` por sí solo, sin ninguna relación con el scheduler.

### Resto de `development` (131) y las 8 del scheduler — corregido tras verificación a nivel de objeto

Con esos dos parches, el resto de `development` — incluidos los 5 pares de versión duplicada
(`20260521000000`, `20260527000000`, `20260626000000`, `20260702000000`, `20260703000000`) — corrió
**sin ningún otro error de SQL**. Luego, sobre ese mismo estado, las 8 migraciones del scheduler
también corrieron sin errores. Verificado: `wo_staffing_requirements`, `wo_staffing_requirement_skills`
y `engagement_assignments` existen, y las políticas `wo_staffing_req_select` /
`wo_staffing_req_skills_select` tienen `qual = true` — confirma G2 de `plan_v2.md` empíricamente
(lectura firmwide para cualquier autenticado, tal cual documentado).

> **Corrección importante (repetición del mismo ejercicio, verificación adicional a nivel de
> objeto):** "sin ningún otro error de SQL" **no es lo mismo que "sin huecos de contenido"** — y en
> este caso no lo eran. El `INSERT ... ON CONFLICT DO NOTHING` de bookkeeping filtraba por
> **versión**, no por archivo. En una pareja Q0, en cuanto el primer archivo del par queda trackeado
> bajo esa versión, el `ON CONFLICT` hace que el **segundo archivo se salte en silencio, sin correr
> su DDL** — no arroja ningún error (por eso "sin ningún otro error de SQL" es verdad), pero tampoco
> aplica su contenido. De los 5 pares, 3 dejan un hueco real así (los otros 2 no importan porque una
> migración posterior recrea el mismo objeto completo de cero):
>
> | Archivo saltado | Consecuencia si no se corrige |
> |---|---|
> | `wo_payment_plan.sql` (`20260626000000`) | Faltan `wo_payment_plan` / `wo_payment_installments` |
> | `service_scoped_categories.sql` (`20260702000000`) | Falta `categories.service_id` |
> | `service_scoped_categories_fixes.sql` (`20260703000000`) | Faltan los 4 endurecimientos de las RPC de categorías |
>
> Confirmado con un error real y reproducible: sin `categories.service_id`,
> `20260719000000_0714_154_worksheet_service_scope.sql` (ya parte de las 8 del scheduler) falla con
> `ERROR: column c.service_id does not exist`. Verificado también por `information_schema` antes/después
> del fix (columna ausente → presente). El fix fue trackear por **nombre de archivo**
> (`public._manual_replay_applied`, PK = filename) en vez de por versión — con eso, ambos archivos de
> cada pareja corren igual (solo uno queda registrado en `supabase_migrations.schema_migrations`,
> igual que documenta §2.a arriba para el CLI real). Repetido así de punta a punta: **139/139
> archivos aplicados**, `schema_migrations` con **134 filas** (139 − 5, una por pareja Q0 — esperado),
> y los 3 objetos antes faltantes ahora presentes.
>
> **Dos gotchas de herramienta encontrados en el camino** (no de contenido de las migraciones):
> - **Encoding:** `psql` en Windows toma el codepage de la consola (`WIN1252`) en vez de UTF-8 por
>   default; `20260610170000_fre_validate_transition_harden.sql` (comentarios en español con tildes)
>   rompía con `character with byte sequence 0x8d in encoding "WIN1252" has no equivalent in encoding
>   "UTF8"`. Fix: `$env:PGCLIENTENCODING = "UTF8"` antes de conectar.
> - **Variable de PowerShell "pegada":** `$var = (psql ...).Trim()` revienta cuando la consulta no
>   encuentra fila (sin salida que capturar) — y en vez de vaciar `$var`, PowerShell **conserva el
>   valor de la vuelta anterior**. Si no se resetea `$var = ""` al inicio de cada iteración de un
>   loop, un solo `"1"` exitoso queda pegado para siempre y el loop se saltea en silencio todo lo que
>   sigue. Aplica a cualquier script similar que use este patrón.
>
> Esta corrección **no invalida** la conclusión de la sección anterior de que el contenido de los 5
> pares no tiene incompatibilidades *entre sí* — sigue siendo cierto. Lo que corrige es la
> afirmación de que "aplicó todo limpio" sin matices: 3 de los 5 archivos "perdedores" nunca corrieron
> en este replay hasta que se cambió el método de tracking, y eso es exactamente la motivación del
> "Remedio candidato (c)" de la sección siguiente.

### Limitación metodológica — esto NO reabre Q0

Este replay usó `INSERT ... ON CONFLICT DO NOTHING` para el bookkeeping de `schema_migrations`, a
propósito más permisivo que el CLI real (que hace un `INSERT` estricto sin `ON CONFLICT`, porque
`version` es PK). Por eso los 5 pares "pasaron" aquí sin el error de llave duplicada que sí reportó el
intento anterior con `supabase db push --include-all --local`. Esto **no contradice** ese hallazgo: la
violación de PK es un hecho determinístico de Postgres/CLI, no depende del contenido de los archivos —
va a repetirse igual en el CLI real para los 5 pares, sin necesidad de probarlos uno por uno.

**Corregido más arriba:** "no hay más sorpresas de contenido esperando debajo" resultó incompleto —
sí las había (los 3 huecos reales), y salieron precisamente por lo permisivo del `ON CONFLICT DO
NOTHING` filtrando por versión en vez de por archivo. Con el tracking corregido (por nombre de
archivo), la afirmación que sí se sostiene es la más acotada: **el contenido SQL de los 5 pares, una
vez que ambos archivos de cada uno corren, no tiene incompatibilidades entre sí ni con el resto** —
confirmado ahora a nivel de objeto (139/139, ver arriba), no solo por ausencia de errores.

## Q0 — RESUELTO por renombrado (2026-07-29)

Se descartaron (a) bookkeeping manual y (c) recovery-migrations+reintento (`draft-migrations/`, ahora
**obsoleto** — ver nota ahí) a favor de (b), verificado como seguro antes de ejecutar:

**Verificación previa (por qué renombrar es seguro acá):**

- Los 10 archivos de los 5 pares existen **exclusivamente en `development`** — confirmado con
  `git cat-file -e` contra `origin/main`, `origin/development` y `sruizmier-scheduler-v3`: ninguno está
  en `main` ni en `sruizmier-scheduler-v3`. `main` no es una línea divergente — está 151 commits de
  migraciones detrás de `development` y 0 commits propios, es decir, simplemente no ha llegado hasta
  ahí todavía.
- Lovable (el proyecto real) sincroniza únicamente desde `main` — nunca vio, ni por CLI ni por nombre,
  ninguno de estos 10 archivos.
- Confirmado por el operador contra `EMS_Dev_Supabase` (entorno de pruebas, acceso directo): el esquema
  `supabase_migrations` **no existe en absoluto** ahí (`relation "supabase_migrations.schema_migrations"
  does not exist`) — el CLI nunca se usó para trackear nada en ese entorno. Todo el contenido de
  `development` posterior al punto en que se dejó de migrar `main` se aplicó a mano por SQL Editor. Es
  decir: **ningún nombre de archivo está registrado en ningún lado**, ni localmente ni en el entorno de
  pruebas ni en Lovable.
- Regla aplicada (confirmada por el operador): renombrar es seguro porque el nombre no está registrado
  en ningún lado; **el contenido SQL no se modificó en absoluto** (verificado con `git hash-object`
  antes/después de cada rename — idéntico byte a byte).

**Los 5 renames** (todos en `dev-scheduler`, vía `git mv`, contenido sin cambios):

| Original | Nuevo |
|---|---|
| `20260521000000_create_vw_staffing_alerts.sql` | `20260521000002_create_vw_staffing_alerts.sql` |
| `20260527000000_unsubmit_timesheet_safe.sql` | `20260527000001_unsubmit_timesheet_safe.sql` |
| `20260626000000_wo_payment_plan.sql` | `20260626000001_wo_payment_plan.sql` |
| `20260702000000_service_scoped_categories.sql` | `20260702000002_service_scoped_categories.sql` |
| `20260703000000_service_scoped_categories_fixes.sql` | `20260703000001_service_scoped_categories_fixes.sql` |

El archivo "ganador" de cada par conserva su timestamp original sin tocar. Verificado tras el rename:
`ls supabase/migrations/ | sed -E 's/^([0-9]{14})_.*/\1/' | sort | uniq -d` → **vacío** (cero duplicados
en las 139). Con esto, `supabase db push --include-all`/`supabase db reset` deberían completar de
punta a punta sin abortar en ningún par, sin `migration repair`, sin reintentos, sin migraciones de
recuperación — el archivo original corre directo en su nueva posición única.

**Nota operativa (incidente durante la ejecución, sin consecuencias):** los renames se aplicaron por
error una primera vez estando parado en `fix/0723-169` (rama de un ticket no relacionado) en vez de
`dev-scheduler` — detectado antes de commitear nada (conteo de 131 vs. 139 migraciones no cuadraba),
revertido por completo con `git restore --source=HEAD` (confirmado `git status` limpio en
`fix/0723-169`), y repetido correctamente en `dev-scheduler`.

## Ruta B — cierre con el CLI real (2026-07-29, `EMS_Dev_Local`)

Catch-up completo, esta vez con evidencia oficial (CLI real, no el replay manual de las secciones
anteriores):

- **Secuencia:** reset limpio → los 3 parches de sandbox conocidos (rename de categorías §1.1, admin +
  `Junior` §1.2) aplicados en los puntos donde el push los encuentra → `supabase db push --include-all`
  completó **las 139 migraciones sin ningún bloqueo de duplicados**. Confirma en los hechos que el
  renombrado de Q0 (arriba) funciona con el mecanismo real, no solo en teoría.
- **Limpieza atada:** los 3 archivos de la candidata (c) (`draft-migrations/`, ya marcada obsoleta acá)
  habían quedado copiados en `supabase/migrations/` de una sesión anterior en ese entorno — borrados y
  su bookkeeping revertido con `supabase migration repair --status reverted`, ya redundantes tras el
  renombrado.
- **Verificación de cierre:** `supabase migration list` → 139/139 sin divergencias;
  `db push --dry-run --include-all` → "up to date". **Cumple el criterio de aceptación central de
  Plan v2 para Ruta B.**
- **`test:rls`:** sigue pendiente — bloqueado por infraestructura (sin Postgres nativo en `:5432` en
  esa máquina), no por contenido. Ya se validó en otra máquina (ver sección "Evidencia de verificación
  local" arriba).
- **Fingerprint capturado** (4 archivos: `ruta_b_schema.sql`, `ruta_b_catalog.txt`,
  `ruta_b_catalog_policies.txt`, `ruta_b_catalog_grants.txt`), en la raíz de `EMS_Dev_Local`, sin
  commitear — queda ahí como evidencia para diffear contra Ruta A/C cuando existan.

Con esto, **Ruta B está cerrada**. Lo único que sigue abierto de Fase 2 es el ítem 1 de abajo
(gaps de `development`, sin relación con el scheduler) y Q7.

## Próximo paso para el operador

1. Decidir cómo resolver los gaps de `development` (rename de categorías + las 2 assertions de
   `20260224065539` — admin y `default_app_role` de `Junior`) — no son parte del alcance de Fase 2 del
   scheduler, pero bloquean cualquier Ruta A/C real para `development` por sí solo. **Ojo:** un
   `supabase/seed.sql` **no sirve** para esto — se ejecuta después de todas las migraciones, y el
   bloqueo ocurre a mitad de la secuencia. La única vía viable es un paso de siembra que corra *antes*
   del push/reset, scripteado como parte del runner de pruebas (no como migración ni como SQL manual
   improvisado cada vez) — ver el patrón de dos pasos (reset → parche → push → parche → push) ya
   validado en `EMS_Dev_Local`.
2. Resolver Q7 (project refs de integración/efímeros + operador autorizado) — sigue pendiente.
3. Con (1) y Q7 resueltos, correr Rutas A y C (§3/§4 de `scheduler-fase-2-rutas-locales.md`) y comparar
   los 3 fingerprints — gate de paridad de Plan v2.
4. Recién ahí, retomar Plan v2 desde C1 (RLS y grants canónicos).
