# Fase 2 — Verificación (ejecución parcial, 2026-07-27 — actualizado 2026-07-30, C1-C4 cerradas + pruebas SQL nuevas)

> Fuente: `bugs/scheduler/fase_2/issue_fase_2.md` + `bugs/scheduler/fase_2/plan_v2.md`.
> Rama: `dev-scheduler` (por decisión explícita del operador — no se creó `scheduler/phase-2-*`).
> Alcance de la sesión del 2026-07-27: **solo la parte de Plan v2 que no depende de Q0** (preflight
> bloqueante de versiones de migración duplicadas). Las 4 migraciones de convergencia (C1–C4) **no se
> escribieron**. El 2026-07-28 se intentó el preflight de Q0 localmente (§ "Ruta B — intento de
> catch-up local"); ver esa sección para el resultado y sus matices.
>
> **Estado al 2026-07-30 (actualizado, tras escribir y verificar C1-C4): Q0 resuelto, los dos gaps de
> `development` resueltos, las 3 rutas corridas con el CLI real, y C1-C4 (RLS canónica, convergencia de
> esquema, RPCs `save_wo_staffing`/`save_engagement_assignments`) escritas, aplicadas y verificadas en
> Ruta A y Ruta C — el gate de paridad queda cerrado POST-convergencia** (antes solo pre-convergencia).
> Ver secciones "Q0 — RESUELTO por renombrado", "Ruta B — cierre con el CLI real", "Ruta B recapturada —
> paridad A↔B confirmada", "Ruta C — corrida completa con datos sintéticos" y, más abajo, "C1-C4 — escritas,
> corregidas en vivo y gate de paridad cerrado post-convergencia" y, más abajo, "Pruebas SQL nuevas
> dependientes de C1-C4 — escritas y verificadas" (las 4 pruebas que dependían de C1-C4 ya están escritas,
> corridas con el CLI real localmente, y encontraron un tercer bug real en C1 — ya corregido). Sigue
> pendiente: Q7 (verificación oficial contra Supabase real, en paralelo, no bloquea lo local) y CI/docs
> finales (ahora sí desbloqueados).

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
> - **Redirección de PowerShell corrompe la salida de binarios nativos** (encontrado 2026-07-29,
>   capturando el fingerprint de Ruta B en `EMS_Dev_Local`): `pg_dump ... > archivo.sql` o
>   `psql ... -c "..." > archivo.txt` producen un archivo en UTF-16 con cabecera `�` y texto espaciado
>   con bytes nulos — la redirección `>`/`>>` de PowerShell reinterpreta/re-codifica el stdout de un
>   proceso nativo en vez de volcarlo tal cual. Fix: usar el flag de salida propio de la herramienta en
>   vez de la redirección del shell — `pg_dump ... -f archivo.sql` y `psql ... -o archivo.txt -c "..."`
>   escriben UTF-8 directo a disco sin pasar por el pipeline de PowerShell. `psql -o` sobreescribe (no
>   concatena) en cada invocación — para varias consultas en un solo fingerprint, usar un archivo por
>   consulta en vez de intentar acumular con `-o`.
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

## Gaps de `development` — RESUELTOS con script de pre-seed (2026-07-29)

`supabase/tests/local/preseed-development-gaps.sh` — envuelve la secuencia validada a mano en
`EMS_Dev_Local` (reset → parche de categorías → push → parche de admin/`Junior` → push) en un solo
comando. Confirmado que ambos bloqueos (`20260224065512`, `20260224065539`) ya están en los 72 base de
`main`, no solo en las 59 de `development` — el script funciona igual para Ruta A y Ruta C. Ruta B no
lo necesita (ya resuelto de verdad en el ambiente real). Detalle en
`scheduler-fase-2-rutas-locales.md` §6.

**Validado con el CLI real, en esta misma máquina, dos veces desde cero:** primer intento reveló dos
bugs (`supabase db push`/`migration list` necesitan `--local` para no pedir un proyecto vinculado; el
patrón de columna `default_app_role` solo existe después de que `20260224065512` reaplica con éxito —
corregidos ambos en el script). Segundo intento, limpio de punta a punta: se detuvo exactamente en
`20260224065512` ("Expected category \"Socio\" not found"), aplicó el parche de categorías, se detuvo
exactamente en `20260224065539` ("ASSERTION: No admin users"), aplicó el parche de admin/`Junior`, y
completó — `supabase migration list --local` con las 139 sincronizadas y
`supabase db push --dry-run --include-all --local` → "Remote database is up to date." Reproducible:
mismo resultado en ambas corridas.

## Ruta A — primera corrida y diff contra Ruta B (2026-07-29, `EMS_Dev_Local`)

`bash supabase/tests/local/preseed-development-gaps.sh` sobre un stack recién reseteado: se detuvo
exactamente en `20260224065512` y `20260224065539` (mismo comportamiento que la validación del script
de arriba), sin ningún bloqueo nuevo. Cierre confirmado: `supabase migration list --local` → 139/139,
sin ninguna fila con la columna "remoto" vacía; `supabase db push --dry-run --include-all --local` →
"Remote database is up to date." Fingerprint capturado con
`capture-route-fingerprint.sh ruta_a`.

**Diff contra el fingerprint de Ruta B ya commiteado** (`git show HEAD:.../ruta_b_*`):

- `ruta_a_catalog_policies.txt` vs `ruta_b_catalog_policies.txt`: **diff vacío** — 216 policies
  idénticas.
- `ruta_a_catalog_grants.txt` vs `ruta_b_catalog_grants.txt`: **diff vacío** — 1251 grants idénticos.
- `ruta_a_catalog.txt` vs `ruta_b_catalog.txt`: 1 línea distinta — tamaño físico de la tabla
  `categories` (`8192 bytes` en A vs `40 kB` en B). No es una diferencia de esquema, es bloat de
  páginas por el historial de DML distinto de cada stack (B pasó por más ciclos de parche/reset en
  esta sesión) — no afecta al gate de paridad, que es sobre estructura, no sobre tamaño físico.
- `ruta_a_schema.sql` vs `ruta_b_schema.sql`: **no vacío**, pero con dos capas de ruido a descontar
  antes de mirar el contenido real:
  1. La primera y última línea (`\restrict`/`\unrestrict`) — token aleatorio de `pg_dump 18`, ver nota
     en `capture-route-fingerprint.sh`.
  2. Line endings mixtos (`file` reporta "CRLF, LF line terminators" en ambos archivos) — probablemente
     de cuando `ruta_b_schema.sql` pasó por `git add`/commit (con normalización de línea) mientras
     `ruta_a_schema.sql` es un archivo nuevo sin tocar por git todavía. Esto por sí solo generaba 5
     bloques de diff falsos (uno por cada una de las 5 funciones RPC de categorías) — confirmado
     comparando los mismos rangos de línea normalizados (`sed 's/\r$//'`): esos 5 bloques desaparecen
     por completo, contenido byte-idéntico.

  **Con ambas capas de ruido descontadas, queda exactamente 1 línea real distinta:** la vista
  `public.fund_request_selectable_work_orders` en Ruta B le falta la cláusula
  `AND public.engagement_allows_hours_or_requests(e.engagement_id)` que sí trae
  `20260714000000_estado_encargo_0602-135.sql` (la migración más reciente que toca esa vista,
  cronológicamente después de las otras 3 que también la tocan — debería ganar en ambas rutas).

  **Root cause identificado, no es un problema real de paridad A↔B:** el fingerprint de Ruta B ya
  commiteado (`bf5cb8c`) se capturó sobre un stack que, en una sesión anterior de esta misma
  conversación, tuvo los 3 archivos de recuperación candidata (c) (`draft-migrations/`,
  `20260727050000_q0_recover_wo_payment_plan.sql` entre ellos) presentes en `supabase/migrations/`
  durante un `db reset`, antes de que se identificaran como obsoletos y se borraran. Ese archivo
  reproduce el contenido *original* de `wo_payment_plan.sql` — incluida una versión **anterior**
  (pre-0602-135, sin la cláusula) de `fund_request_selectable_work_orders` — pero con timestamp
  `20260727050000`, **posterior** a `20260714000000`. Al correr durante ese reset, su
  `DROP VIEW IF EXISTS` + `CREATE OR REPLACE VIEW` pisó la versión más nueva. Cuando después se borró
  el archivo y se revirtió su bookkeeping (`supabase migration repair --status reverted`), **eso solo
  corrige la tabla de tracking — no deshace el DDL ya ejecutado.** El efecto sobre la vista quedó
  grabado en esa base, y es exactamente lo que capturó el fingerprint de Ruta B commiteado.

  **Conclusión:** no era una discrepancia real entre Ruta A y Ruta B con el flujo actual (script de
  pre-seed + 139 migraciones + rename de Q0) — era un artefacto de cuándo se capturó el fingerprint de
  Ruta B (antes de que se terminara de limpiar la contaminación de la sesión anterior).

### Ruta B recapturada — paridad A↔B confirmada (2026-07-29)

Recapturado el fingerprint de Ruta B desde un reset limpio (script de pre-seed, sin ningún archivo de
`draft-migrations/` presente). Diff final contra Ruta A, **verificado de forma independiente en este
repo** (no solo relayado):

```
$ diff ruta_a_schema.sql ruta_b_schema.sql
5c5 / 13529c13529   ← solo \restrict/\unrestrict (token aleatorio de sesión de pg_dump 18, ruido conocido)
$ diff ruta_a_catalog.txt ruta_a_catalog_policies.txt ruta_a_catalog_grants.txt  (vs. ruta_b_*)
(vacío en los 3)
```

**Ruta A y Ruta B son idénticas** (schema, catálogo, policies y grants) descontando el ruido de
`pg_dump`. Confirma `fund_request_selectable_work_orders` con la cláusula correcta de
`estado_encargo_0602-135` en ambas rutas. **Gate de paridad de Plan v2 cumplido entre A y B**
(pre-convergencia — falta repetir con C1-C4 cuando existan, y agregar Ruta C).

## Ruta C — corrida completa con datos sintéticos y CLI real (2026-07-30, worktree `../ems-route-c-scratch`)

Ejecutada siguiendo §3 de `scheduler-fase-2-rutas-locales.md`, con Claude Code operando el worktree
paso a paso (el operador ejecutó cada comando; Claude Code preparó los scripts/seed y verificó los
resultados) — mismo patrón que Ruta B.

1. **Worktree:** `git worktree add ../ems-route-c-scratch origin/sruizmier-scheduler-v3` (detached HEAD
   en `c1cb303`) — 80 migraciones (72 base + 8 scheduler), confirmado por conteo y por diff de nombres
   contra las 139 de `dev-scheduler`. Los scripts de Fase 2 (`preseed-development-gaps.sh`,
   `capture-route-fingerprint.sh`) no existen en `sruizmier-scheduler-v3` — se copiaron manualmente al
   worktree antes de correr nada.
2. **`preseed-development-gaps.sh` sobre las 80:** se detuvo exactamente en `20260224065512` y
   `20260224065539` (los mismos 2 bloqueos de siempre, ya presentes en los 72 base — confirmado antes
   en §3 de `rutas-locales.md`), aplicó los 2 parches conocidos, y cerró con `supabase migration list`
   → 80/80 y `db push --dry-run --include-all --local` → "up to date".
3. **Datos sintéticos (`supabase/tests/fixtures/route-c-synthetic-seed.sql`, nuevo):** pedido explícito
   de Plan v2 para Ruta C, antes ausente (marcado "aún inexistente" en la sesión anterior). Puebla,
   sobre la semilla base ya existente (`staff`, `clients`, `engagements`, `work_orders` de
   `20251204045534`), las tablas propias del scheduler: 2 `skills`, 2 `staff_skills`, 2
   `wo_staffing_requirements` + 2 `wo_staffing_requirement_skills` (sobre el work order base
   `MSC-2024-AUD`), y 4 `engagement_assignments` repartidas entre los 2 engagements base. Usa
   identificadores estables (email, `engagement_code`) en vez de UUIDs hardcodeados, ya que las FKs se
   generan en el insert de la semilla base. Dos bugs de autoría corregidos en el camino (ambos de forma
   del SQL, no de datos): `CROSS JOIN LATERAL` debe preceder a cualquier JOIN que referencie su alias
   (Postgres no permite adelante-referencias entre JOINs); `skills.category` no es texto libre — una
   migración posterior (`20260412140000`) la restringe a un code-set fijo
   (`framework`/`industry`/`tool`/`language`/`certification`/`other`). Verificado con
   `service_scoped_categories.sql`/`_fixes.sql` (backfill incondicional de `categories.service_id`,
   sin depender de los datos del scheduler) que el seed no arriesgaba romper esa migración.
4. **Copiar las 59 de `development` + `db push --include-all --local`:** las 59 (identificadas por diff
   exacto de nombres entre las 80 del worktree y las 139 de `dev-scheduler`) se aplicaron **sin ningún
   bloqueo nuevo** — incluidas `service_scoped_categories.sql` y `worksheet_service_scope.sql`, que son
   justo las que tocan las tablas donde se sembraron los datos sintéticos.
5. **Convergencia:** `supabase migration list --local` → 139/139 con Local = Remote en todas las filas;
   `db push --dry-run --include-all --local` → "up to date".
6. **Fingerprint:** `capture-route-fingerprint.sh ruta_c`, copiado (sin commitear) a
   `supabase/tests/fixtures/route-fingerprints/` junto a los de A y B.

### Diff Ruta C vs Ruta A/B — confirma G1 en vivo, en las 3 rutas reales

- `catalog_policies.txt`: diff vacío contra A y contra B — 216 policies idénticas.
- `catalog.txt`: solo diferencias de tamaño físico (`8192 bytes` vs `16 kB` en 4 tablas) — bloat
  esperado por los datos del seed sintético, no una diferencia de esquema.
- `catalog_grants.txt`: **1 diferencia real** — Ruta C tiene 14 filas de más: `vw_staffing_alerts` con
  todos los privilegios (`SELECT/INSERT/UPDATE/DELETE/REFERENCES/TRIGGER/TRUNCATE`) concedidos a `anon`
  y a `authenticated` (1261 filas vs 1247 en A/B).
- `schema.sql`: descontando el ruido conocido (`\restrict`/`\unrestrict` de `pg_dump`, y las particiones
  diarias `realtime.messages_2026_MM_DD` que Supabase Realtime rota automáticamente por fecha —
  irrelevante al esquema, solo refleja que Ruta C se capturó un día después de Ruta A), **una sola línea
  real distinta:**
  ```
  Ruta C:  CREATE VIEW public.vw_staffing_alerts AS
  Ruta A:  CREATE VIEW public.vw_staffing_alerts WITH (security_invoker='true') AS
  ```

**Es exactamente G1 de `plan_v2.md`, confirmado empíricamente por primera vez en las 3 rutas reales**
(antes solo A↔B). Causa: en C las 8 migraciones del scheduler corren *antes* de que `vw_staffing_alerts`
exista (development aún no se aplicó), así que el paso que hace
`ALTER VIEW ... SET (security_invoker = true)` se saltea (`to_regclass` da NULL, ver
`20260720194555`/`20260720194653` sección B); cuando development crea la vista después, nadie vuelve a
poner `security_invoker`. Resultado: en C la vista queda sin `security_invoker` y con grants abiertos a
`anon` — un bypass de RLS más serio que el simple GRANT que ya documentaba G1 originalmente.

**Hallazgo nuevo para cuando se escriba C1:** el borrador de C1 en `plan_v2.md` solo dice "restaurar el
`GRANT SELECT ... TO authenticated`" — pero esta corrida muestra que C1 también necesita reafirmar
`ALTER VIEW public.vw_staffing_alerts SET (security_invoker = true)` y revocar el acceso de `anon`, o
Ruta C seguiría divergiendo después de C1. A incorporar al alcance de C1 cuando se escriba.

**Gate de paridad de Plan v2 cumplido pre-convergencia en las 3 rutas: A = B, y C diverge únicamente en
el punto que G1 ya predecía** (nada inesperado).

## C1-C4 — escritas, corregidas en vivo, y gate de paridad cerrado post-convergencia (2026-07-30)

Las 4 migraciones de convergencia se escribieron siguiendo `plan_v2.md` §"Proposed Implementation",
incorporando el hallazgo de `security_invoker`/`anon` de la sección anterior:

- `20260727100000_scheduler_fase2_rls_grants.sql` (C1) — `vw_staffing_alerts` (grant + security_invoker
  + revoke anon/authenticated), `is_engagement_responsible(uuid)`, RLS canónica de
  `wo_staffing_requirements`/`wo_staffing_requirement_skills` (reemplaza los 2 `USING(true)`), extensión
  de escritura de `engagement_assignments` con `is_engagement_responsible`, grants mínimos.
- `20260727110000_scheduler_fase2_convergencia_esquema.sql` (C2) — `staff.is_schedulable`, sonda de
  default de `status`, `engagement_accepts_assignment_writes(uuid)`, triggers de service-scope
  (`enforce_wo_staffing_service_scope`/`enforce_assignment_service_scope`), pre-flight de categorías
  cruzadas, `copy_categories_between_services` extendida a 6 referrers.
- `20260727120000_scheduler_fase2_rpc_save_wo_staffing.sql` (C3) — RPC completa, 8 tokens de error.
- `20260727130000_scheduler_fase2_rpc_save_engagement_assignments.sql` (C4) — RPC completa, 9 tokens de
  error, overlap check post-escritura.

Commit inicial: `77e5ef2 feat(scheduler-fase2): Escribir C1-C4...`.

### Verificación — Ruta A (primera corrida real de C1-C4)

`preseed-development-gaps.sh` sobre las 143 migraciones (`dev-scheduler` ya con C1-C4 integradas)
corrió de punta a punta **sin ningún error** — primera vez que estas 4 migraciones se ejecutaban.
Confirmado por contenido en el fingerprint recapturado: `enforce_assignment_service_scope`,
`enforce_wo_staffing_service_scope`, `engagement_accepts_assignment_writes`, `is_engagement_responsible`,
`save_wo_staffing`, `save_engagement_assignments`, `staff.is_schedulable`, `vw_staffing_alerts WITH
(security_invoker='true')`, y las políticas `wo_staffing_req_*`/`ea_team_*` con la matriz canónica
completa — todos presentes y correctos.

### Verificación — Ruta C (worktree nuevo, 80 → seed sintético → 63 = 59 + C1-C4 → 143)

Mismo procedimiento de siempre (§3 de `scheduler-fase-2-rutas-locales.md`), con el diff de 59→63
recalculado en vivo (`comm -13` entre el worktree de 80 y `dev-scheduler` de 143). Las 63 corrieron sin
error. Diff del fingerprint contra Ruta A **encontró 2 bugs reales en C1**, ambos corregidos en el
archivo (no en un parche aparte — C1 nunca corrió contra nada persistente todavía):

1. **`authenticated` con privilegios de más en `vw_staffing_alerts`** (`DELETE/INSERT/REFERENCES/
   TRIGGER/TRUNCATE/UPDATE`, no solo `SELECT`) — mismo mecanismo que G1 original, ahora sobre
   `authenticated` en vez de `anon`: en Ruta C, la migración histórica que revocaba ese exceso corre
   *antes* de que la vista exista, así que nunca se revoca. Fix: `REVOKE ALL ... FROM authenticated`
   explícito antes del `GRANT SELECT` en C1, para que el resultado final no dependa del orden de
   creación de la vista en cada ruta.
2. **C1 no era idempotente** — a las políticas nuevas `wo_staffing_req_insert/update/delete` y
   `wo_staffing_req_skills_insert/update/delete` les faltaba el `DROP POLICY IF EXISTS` previo (sí lo
   tenían `_select` y las de `engagement_assignments`). No afectaba una corrida limpia desde cero (por
   eso Ruta A y el primer intento de Ruta C pasaron), pero rompía el re-aplicar C1 solo (necesario para
   probar el fix #1 sin resetear todo el stack). Fix: agregado el `DROP POLICY IF EXISTS` que faltaba en
   las 6 políticas.

Tras ambos fixes, re-verificado aplicando C1 corregida directo (es idempotente: `DO $$`, `CREATE OR
REPLACE`, `DROP POLICY IF EXISTS`) sin resetear el stack, y recapturando el fingerprint:

```
catalog_grants.txt:   diff vacío
catalog_policies.txt: diff vacío
schema.sql:           solo \restrict/\unrestrict de pg_dump (ruido conocido)
catalog.txt:          solo bloat de tamaño físico por el seed sintético (no estructural)
```

**Ruta A = Ruta C, post-C1-C4, completo.** Con Ruta B ya probada ≡ Ruta A pre-convergencia (y dado que
C1-C4 siempre corren al final, después de las 139 históricas, en cualquiera de las 3 rutas — no hay
mecanismo por el que B pueda divergir de A ahora que no divergiera antes), el gate de paridad de
`plan_v2.md` queda **cerrado post-convergencia en las 3 rutas: criterio de aceptación central de Fase 2
cumplido.**

## Pruebas SQL nuevas dependientes de C1-C4 — escritas y verificadas (2026-07-30)

Las 4 pruebas que `plan_v2.md` dejaba bloqueadas hasta que C1-C4 existieran ("Files to Change" del plan)
se escribieron y se corrieron de punta a punta con `psql` real contra el mismo PostgreSQL 18 desechable
local que ya usa `npm run test:rls` (no Supabase, no Docker — mecanismo ya establecido y documentado en
"Evidencia de verificación local" más arriba en este mismo archivo).

**Shim nuevo (`supabase/tests/local/30-shim-service-scope.sql`):** el shim existente
(`00-shim-supabase.sql`) modela un mundo pre-service-scoping (sin `services`, sin
`categories.service_id`, sin `engagements.practica` — ver G9 de `plan_v2.md`), pero C1-C4 dependen de
todo eso. El shim nuevo agrega, en forma final (sin replayar el historial de `development`, misma
convención que el shim original): tabla `services` + seed de 5 filas, `categories.service_id`,
`engagements.practica` + las 4 columnas de personal responsable (`sqr_id`/`encargado_id`/
`specialist_it_id`/`specialist_tax_id`) + `engagement_state_override`, tabla `work_orders`
(con `approval_status`), y `skills`/`staff_skills`. Verificado en vivo que el resto de la cadena
(las 4 migraciones históricas del scheduler que tocan `wo_staffing_requirements`/D5/corrective + C1-C4)
aplica sin ningún error sobre este shim extendido.

**Lane 4 nueva en `run-rls-tests.sh`:** `00-shim` → `30-shim-service-scope` → Phase 3 → D5 → corrective
backfill → las 4 históricas de `wo_staffing_requirements` (`20260506120000`, `20260719044642`,
`20260720194555`, `20260720194653`) → C1 → C2 → C3 → C4 → las 4 pruebas nuevas. Deliberadamente
**omite** Phase 5 (`20260718120000`, timesheet) y su shim: esa migración solo agrega una función
sin relación con staffing/`engagement_assignments`, así que no puede cambiar nada que esta lane
verifique — se documenta la omisión en el propio script. `vw_staffing_alerts` no existe en este shim
(esa vista la crea una migración de `development` que esta lane no replaya) — la aserción de
`security_invoker`/grants correspondiente queda con `SKIP` explícito; esa parte de G1 ya está
verificada de verdad contra el stack Docker real en la sección "Ruta C" de este documento.

**Resultado:** las 4 lanes (1-3 preexistentes + la 4 nueva) pasan de punta a punta,
`bash supabase/tests/local/run-rls-tests.sh` exit code 0.

### Bug real de C1 encontrado escribiendo `rls-wo-staffing-requirements.sql`, corregido en vivo

Al diseñar el fixture para probar que sqr/encargado/specialist_it/specialist_tax pueden escribir sus
propias asignaciones (extensión de C1 §3b), se encontró que **la extensión nunca se activaba**: las
políticas `ea_team_insert/update/delete` exigen `AND can_read_engagement_assignments(engagement_id)`,
y ese helper (de D5, `20260717233000`) no conoce `is_engagement_responsible` en absoluto — solo
reconoce admin/partner/director firmwide, manager+team_member, o senior+assignment propia. Confirmado
en vivo contra el stack de prueba: un staff con `role='sqr'` y `sqr_id` del engagement obtenía
`is_engagement_responsible() = true` pero `can_read_engagement_assignments() = false`, y el INSERT
fallaba con `insufficient_privilege`. Además, la Matriz RLS canónica del propio `plan_v2.md` exige
explícitamente una política SELECT directa vía `is_engagement_responsible` para esos 4 roles, que
nunca se había escrito.

**Fix** (propuesto con diff exacto, aprobado por el operador antes de aplicar — sección 3b de
`20260727100000_scheduler_fase2_rls_grants.sql`):
1. Nueva política `ea_select_responsible` (`FOR SELECT ... USING (is_engagement_responsible(engagement_id))`).
2. Los 3 `AND can_read_engagement_assignments(engagement_id)` de escritura pasan a
   `AND (can_read_engagement_assignments(engagement_id) OR is_engagement_responsible(engagement_id))`.

Deliberadamente **no se tocó** `can_read_engagement_assignments()` en sí — sigue siendo exactamente la
disyunción de las 3 políticas de lectura de D5, invariante del que depende el comentario de Phase 5
(`20260718120000`: "can_read_engagement_assignments remains the exact disjunction... and is not called
here at all"). Reverificado en vivo tras el fix: el mismo staff `sqr` ahora lee y escribe su propia
asignación en el engagement donde es responsable, y sigue denegado en un engagement ajeno. Este es el
**tercer bug real** encontrado en C1 en esta fase (los otros dos: `vw_staffing_alerts`/`authenticated` e
idempotencia, ver sección "C1-C4 — escritas, corregidas en vivo..." más arriba) — ninguno afectaba una
corrida limpia desde cero salvo en el caso específico que cada prueba fue diseñada para ejercitar.

## Ejecución en Dev 2.0 (Supabase real, `development` + `feat/roles-permisos`) — 2026-07-30

Tras verificar localmente (shim + Postgres desechable), el operador aplicó las 8 históricas + C1-C4 +
las 4 pruebas SQL nuevas a mano, por SQL Editor, contra **"Dev 2.0"** — un tercer proyecto Supabase en
la nube (distinto de Lovable y de `EMS_Dev_Supabase`/"Test"), compartido en vivo con el compañero
responsable de `feat/roles-permisos`, que ya tiene `development` + esas 17 migraciones aplicadas. Esta
corrida encontró **4 diferencias reales entre el shim local y el Lovable/`development` real** — ninguna
relacionada con Q0/versiones duplicadas, todas del tipo que G6/G8 de `plan_v2.md` ya anticipaban
("fantasmas" de esquema real no capturados por ninguna migración replayable).

### 1-3. Tres columnas con forma distinta a la asumida por el shim — fixtures corregidos

| # | Columna | Diferencia real vs. shim | Fix |
|---|---|---|---|
| 1 | `engagement_assignments.status` | Lovable la creó `character varying`, no `text` (la migración `20260716120000` declara `TEXT`, pero su `CREATE TABLE IF NOT EXISTS` no-opeó porque la tabla ya existía) — mismo valor de default, tipo distinto, y la sonda de C2 comparaba el literal completo incl. el cast | Sonda de C2 y de `schema-convergence-assertions.sql` comparan solo `split_part(v_default, '::', 1)`, ignorando el tipo |
| 2 | `engagements.fecha_cierre` | `NOT NULL` sin `DEFAULT` (`20260702000000`) — el shim no tenía la columna en absoluto | Columna agregada a `30-shim-service-scope.sql`; los 4 archivos de prueba la agregan explícita a cada `INSERT INTO engagements` |
| 3 | `work_orders.currency` / `season_mode` | `NOT NULL` **sin** `DEFAULT` (`20251204045534`) — el shim tenía `DEFAULT 'BOB'`/`DEFAULT 'High'` por comodidad, enmascarando el problema | Quitado el `DEFAULT` del shim (para que coincida exacto con lo real); los 2 archivos que insertan `work_orders` los agregan explícitos |

Además, `staff.auth_user_id` tiene un FK real a `auth.users` en Lovable/`development` (el shim no tiene
`auth.users` en absoluto) — los 4 archivos de prueba ahora insertan filas de `auth.users` guardadas con
`IF to_regclass('auth.users') IS NOT NULL`, y los `INSERT INTO user_roles` pasaron a
`ON CONFLICT (user_id) DO UPDATE` porque el trigger real `on_auth_user_created`
(`20251204051043`) auto-crea una fila `user_roles` con rol `'staff'` por cada usuario nuevo.
Los 4 fixes se reverificaron localmente simulando cada constraint real por separado (y las 3 juntas)
antes de pedirle al operador que reintentara — cero corridas "a ciegas" contra Dev 2.0.

### 4. Bug real de C1: la RLS de `wo_staffing_requirements` dependía de la RLS de `work_orders`

Al correr `rls-wo-staffing-requirements.sql` en Dev 2.0 (ya con los 3 fixes de arriba), Sam (`sqr_id`
de E1, sin ningún otro rol calificante) no veía R1 — la aserción "sqr Sam: expected to see R1" falló
con 0 filas, algo que nunca había fallado en ninguna simulación local.

**Causa raíz:** las políticas de C1 resolvían el `engagement_id` de un work order con una subconsulta
escrita **directo dentro del `USING`/`WITH CHECK`** de cada política:
`(SELECT wo.engagement_id FROM public.work_orders wo WHERE wo.wo_id = ...)`. Esa subconsulta corre con
los permisos del rol que consulta (Sam) — sujeta a la **RLS propia de `work_orders`**, no a la de
`wo_staffing_requirements`. El shim local nunca tuvo RLS en `work_orders` (tabla sin `ENABLE ROW LEVEL
SECURITY`), así que el bug era invisible ahí. En Dev 2.0, la **Fase 4 de `feat/roles-permisos`** ya
reescribió la RLS de `work_orders` con su propio modelo de permisos (`has_permission()`/
`current_role_key()`), que no reconoce "responsable vía sqr_id/encargado_id/specialist_it_id/
specialist_tax_id" — exactamente la superficie de coordinación que
`scheduler-fase-2-rutas-locales.md` §5 marcaba como "ya no hipotética" cuando se revisó esa rama. Sam
no podía leer su propia fila de `work_orders`, la subconsulta devolvía `NULL`, e
`is_engagement_responsible(NULL)` daba `false`.

**Fix** (sección 2b de `20260727100000_scheduler_fase2_rls_grants.sql`): 2 funciones nuevas
`SECURITY DEFINER` — `resolve_wo_engagement_id(uuid)` y `resolve_wo_req_skill_engagement_id(uuid)` (para
el join de 2 saltos de `wo_staffing_requirement_skills`) — que reemplazan **todas** las subconsultas
inline contra `work_orders` en las 8 políticas de C1 (select/insert/update/delete × las 2 tablas). Mismo
patrón que `is_engagement_team_member`/`is_engagement_responsible`/`has_assignment_on_engagement`:
la pregunta estructural "¿qué engagement es este work order?" no debe depender de si el caller puede
leer `work_orders` directamente, ni de qué RLS tenga esa tabla en cada rama/entorno.

**Verificación del fix:** además de la corrida local completa (4 lanes, exit 0), se simuló el escenario
exacto — `work_orders` con RLS habilitada y una política que solo permite `is_admin()` (el mismo
resultado práctico que la Fase 4 de `feat/roles-permisos` produce para un `sqr` puro) — y se confirmó
que, con el fix, Sam vuelve a ver y escribir R1 correctamente. Sin el fix, esa misma simulación
reproduce el fallo exacto reportado desde Dev 2.0.

Este es el **cuarto bug real** encontrado en C1 en esta fase (los 3 anteriores: `vw_staffing_alerts`/
`authenticated`, idempotencia, y la extensión §3b de responsables — ver secciones previas). Ninguno de
los 4 afectaba una corrida limpia desde cero en el shim local; los 4 solo aparecieron corriendo contra
un esquema/entorno más fiel a la realidad (Ruta C con datos sintéticos, o directamente Dev 2.0) —
confirma que valió la pena escribir las pruebas y correrlas en más de un entorno antes de dar C1-C4 por
definitivamente cerradas.

## Próximo paso para el operador

1. Commitear: los 4 fixes de C1 (`authenticated`/idempotencia, la extensión de §3b, y el nuevo §2b —
   `resolve_wo_engagement_id`/`resolve_wo_req_skill_engagement_id`), las 4 pruebas SQL nuevas (con los
   fixes de fixture para `auth.users`/`fecha_cierre`/`work_orders`), el shim `30-shim-service-scope.sql`,
   y la Lane 4 de `run-rls-tests.sh` — todo pendiente de commit/push.
2. `git pull` en `EMS_Dev_Local` para traer los fixes, y actualizar ahí el fingerprint de Ruta A
   commiteado (el que se recapturó localmente durante esta verificación, con C1-C4 ya integradas) — el
   fix de §2b agrega 2 funciones nuevas (cambia el fingerprint de catálogo: 2 filas más en `pg_proc`/ACLs
   de funciones); el de §3b solo agrega una política y amplía un `AND` a `OR` — recapturar para tener
   evidencia actualizada de ambos.
3. Limpiar el worktree `../ems-route-c-scratch`.
4. Resolver Q7 (project refs de integración/efímeros + operador autorizado) — sigue pendiente para la
   verificación oficial contra Supabase real, en paralelo, sin bloquear lo local.
5. Con las pruebas SQL ya escritas y verificadas, seguir con CI (`.github/workflows/scheduler-integrity.yml`)
   y la documentación final (`docs/plans/scheduler-fase-2-esquema-canonico.md`,
   `docs/plans/scheduler-fase-2-runbook-ruta-c.md`), ambos ya desbloqueados.
