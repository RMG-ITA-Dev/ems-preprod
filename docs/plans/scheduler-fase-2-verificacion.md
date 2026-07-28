# Fase 2 — Verificación (ejecución parcial, 2026-07-27)

> Fuente: `bugs/scheduler/fase_2/issue_fase_2.md` + `bugs/scheduler/fase_2/plan_v2.md`.
> Rama: `dev-scheduler` (por decisión explícita del operador — no se creó `scheduler/phase-2-*`).
> Alcance de esta sesión: **solo la parte de Plan v2 que no depende de Q0** (preflight bloqueante de
> versiones de migración duplicadas). Las 4 migraciones de convergencia (C1–C4) **no se escribieron**.

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

## Próximo paso para el operador

1. Ejecutar el preflight de Q0 en `../EMS_Dev_Supabase/` (los 5 pares de versión duplicada) y reportar
   el resultado.
2. Resolver Q7 (project refs de integración/efímeros + operador autorizado).
3. Con Q0 documentado, retomar Plan v2 desde C1 (RLS y grants canónicos).
