# Manual de cierre — convergencia dev-scheduler + feat/roles-permisos

> Para el operador. Todo lo que se podía hacer desde R-APP (sin Supabase, sin autorización especial)
> ya está hecho y commiteado en `merge/dev-scheduler-roles-permisos` (pusheada a `origin`). Esto es
> el resto: pasos que requieren R-LOCAL, R-INT, o un browser — nunca se ejecutan desde R-APP.
>
> Plan completo con el detalle de cada gate: `bugs/scheduler/plan_merge_sche_rolper.md` §7/§11.
> Este documento es la versión "seguí estos pasos en orden", sin la justificación completa de cada
> decisión — para eso, el plan.

## Ya hecho (no repetir)

- Rama `merge/dev-scheduler-roles-permisos` pusheada a `origin`, 8 commits sobre `dev-scheduler`
  (`git log --first-parent --oneline origin/dev-scheduler..HEAD`).
- G0, G2, G3, G4a (conteos), G8 (lint/tsc/build/vitest/verify:vendor) — todos verdes, evidencia en
  `docs/scheduler/roles_permisos_merge/evidence/`.
- **G4b/c/d — CERRADOS.** CI disparada vía `gh workflow run "Scheduler Integrity — Fase 2" --ref
  merge/dev-scheduler-roles-permisos` (run `31092667024`; el trigger automático de `push` no se
  disparó solo — algo a revisar en la configuración del repo si vuelve a pasar, pero el dispatch
  manual funcionó). Corrió contra Postgres aislado en el runner, no contra el stack compartido de
  R-LOCAL — seguro, no hizo falta Docker local. Resultado real (no solo "job verde"):
  - `rls-migration-tests`: **6/6 "ALL CHECKS PASSED"** (D5 RLS, P5 Timesheet Authz, WO Staffing RLS,
    ambas RPCs, SCHEMA CONVERGENCE) — cierra **G4c**.
  - `route-parity`: Ruta A 174/174 aplicadas, 0 pendientes; Ruta C 174/174, 0 pendientes; gate final
    **"Route parity gate passed: Ruta A = Ruta C (schema, RLS policies, grants)."** — cierra **G4b**
    y **G4d**.
  Evidencia completa en `evidence/ci_route_parity_merge.txt` y `evidence/g4_ci_summary.txt`.
  **No hace falta repetir estos 2 pasos** — arrancá directo por G1 (abajo) y G4e.
- 3 issues de seguimiento abiertos: #275 (bug "semana de seis días", independiente), #276 (subfase
  catálogo `scheduler.*`), #277 (subfase `tsc → 0`).
- `docs/operations.md` actualizado a 174 migraciones.

## Paso 1 — R-LOCAL: G1 (diff de RLS/grants rama por rama)

G4b/c/d ya cerraron por CI (ver arriba) — no hace falta Docker local para eso. Lo que sigue es **G1**,
que la CI no cubre porque compara Ruta A vs Ruta C del estado ya combinado, no `dev-scheduler` contra
`feat/roles-permisos` por separado:

1. Correr el diff de políticas/grants entre `dev-scheduler` y `feat/roles-permisos` en
   `EMS_Dev_Local` (Docker):

   ```bash
   # Base 1: tip de dev-scheduler
   git checkout origin/dev-scheduler
   supabase db reset --local
   psql "$DB_URL" -X -v ON_ERROR_STOP=1 -At -F'|' -o dev_scheduler_policies.txt -c "
   SELECT schemaname, tablename, policyname, permissive,
          array_to_string(roles, ','), cmd, coalesce(qual, ''), coalesce(with_check, '')
   FROM pg_policies WHERE schemaname = 'public'
   ORDER BY schemaname, tablename, policyname, cmd;"
   psql "$DB_URL" -X -v ON_ERROR_STOP=1 -At -F'|' -o dev_scheduler_grants.txt -c "
   WITH grants AS (
     SELECT 'table'::text AS kind, grantee, table_name AS object_name, ''::text AS subobject, privilege_type
     FROM information_schema.role_table_grants WHERE table_schema = 'public'
     UNION ALL
     SELECT 'column', grantee, table_name, column_name, privilege_type
     FROM information_schema.column_privileges WHERE table_schema = 'public'
     UNION ALL
     SELECT 'routine', grantee, routine_name, specific_name, privilege_type
     FROM information_schema.routine_privileges WHERE routine_schema = 'public'
   )
   SELECT kind, grantee, object_name, subobject, privilege_type FROM grants
   ORDER BY kind, object_name, subobject, grantee, privilege_type;"

   # Base 2: tip de feat/roles-permisos (renombrar los 5 pares Q0 ANTES del reset,
   # o el db reset aborta por PK duplicada -- no tocar el SQL, solo el nombre de archivo)
   git checkout origin/feat/roles-permisos
   # (renombrar los 5 archivos a los nombres canónicos de dev-scheduler, ver plan §2.1 tabla)
   supabase db reset --local
   # repetir las 2 capturas de arriba con sufijo _roles_permisos

   diff -u dev_scheduler_policies.txt roles_permisos_policies.txt
   diff -u dev_scheduler_grants.txt   roles_permisos_grants.txt
   ```

   🔴 **`-At -F'|'` es obligatorio** — el formato default de `psql` da falsos positivos.
   🔴 Usar Postgres aislado/descartable, **nunca** el stack compartido de `EMS_Dev_Local` si tiene
   24h+ de uptime con Realtime activo — crasheó 2 veces en Fase 7.

   **Qué esperar:** 0 cambios en `engagement_assignments`, `wo_staffing_requirements`,
   `wo_staffing_requirement_skills`; `is_admin()`/`has_role()`/`is_engagement_team_member()` sin
   redefinir; `revoke select on staff` visible del lado de roles. Cualquier otra cosa, clasificarla
   como intencional de roles / del Scheduler / PII / drift no explicado — no cerrar sin clasificar.

2. **G4e — matriz RLS.** Reconciliar la matriz de 18 filas de Fase 7 contra el modelo
   `has_permission()`, y agregar los 23 `role_key` (con los 12 de H3 —`risk_partner`,
   `it_security_manager`, `risk_supervisor`, `accounting_manager`, `hr_manager`, `ita_manager`,
   `tax_manager`, `accounting_analyst`, `collections_analyst`, `hr_analyst`, `ita_senior`,
   `tax_senior`— en negativo). Esto es análisis manual sobre las políticas ya capturadas en el paso
   2, no un comando nuevo.

## Paso 2 — R-INT: preparar y desplegar en Dev 2.0

📍 Repo: `EMS_Dev_Supabase` (o el que tengas apuntado a Dev 2.0). **Vos me pasás el project ref /
connection string de Dev 2.0 si querés que yo revise algo puntual** — nunca lo escribo en un archivo
trackeado. Avisale al responsable de `feat/roles-permisos` antes de tocar nada — el proyecto es
compartido en vivo.

1. **Inventario, solo lectura primero:**
   ```bash
   supabase migration list --db-url "$INT_DB_URL"
   supabase db push --dry-run --include-all --db-url "$INT_DB_URL"
   ```
   Dev 2.0 es un estado mixto aplicado a mano — no asumas que el ledger está sano. Tabla de decisión
   según lo que veas (ver plan §5, G5.1).

2. **Capturar los objetos de Scheduler v1 ya presentes** (`engagement_staffing_requirements`,
   `resource_planning_audit_log`, `staff_unavailability`, sus 4 funciones, y las 8 columnas fantasma
   de `staff`/`engagements` — inventario completo en `docs/scheduler/deuda-esquema-scheduler-v1.md`).
   Esto **es** la lista de exclusión para el diff del paso 4 — no se toca, no se borra.

3. **Preflight de datos:** buscar filas en `engagements` con `end_date < start_date` — disparan el
   fail-closed de `scheduler-gaps`. Corregir o documentar antes de seguir.

4. **Deploy, en este orden exacto (invertirlo deja la app en 403 firmwide):**
   1. Frontend primero (esta rama ya tiene el código correcto).
   2. Verificar `/engagements`, Work Orders y Timesheets **sin 403**.
   3. Aplicar las migraciones pendientes (roles + PII + el grant de `is_schedulable`) — confirmar
      con `comm -13`, no a ojo.
   4. Recapturar policies/grants (mismo formato del Paso 1) y diffear contra `ruta_a`, con la lista
      de exclusión del punto 2 aplicada. Cualquier diff fuera de esa lista se investiga antes de
      seguir.
   5. Desplegar Edge Functions — **las 3 que cambiaron**, no solo las 2 del Scheduler:
      `scheduler-data`, `scheduler-gaps` (ambas migradas a `role_key` en esta rama) y
      `dashboard-data` (modificada por `feat/roles-permisos`, commit `c0653c33` — agrega el gate de
      permisos de `index.ts:114-147`). `assign-user-role` está byte-idéntica a `development`
      (verificado: `git diff origin/development...HEAD -- supabase/functions/assign-user-role` da 0
      líneas) — **no** requiere redeploy.
   6. Probes: sin JWT → 401; `role_key` sin acceso (ej. `hr_manager`) → 403; `role_key` permitido →
      200. Repetir para `scheduler-data` y `scheduler-gaps`. Para `dashboard-data`, agregar un probe
      de humo del gate de autorización (`index.ts:114-147`) con un rol sin permiso de dashboard.
   7. **Recién ahí**, `VITE_SCHEDULER_ENABLED=true`.

   Rollback funcional: apagar el flag. Nunca revertir migraciones. Si PII rompe algo,
   `grant select on public.staff to authenticated;` temporal con tu aprobación explícita, mientras
   se corrige el consumidor — no dejarlo así de forma permanente.

## Paso 3 — R-INT → R-APP: regenerar tipos

```bash
supabase gen types typescript --project-id "$INT_PROJECT_REF" --schema public \
  > src/integrations/supabase/types.ts
```

- Generar dos veces, comparar hash — si difiere, el esquema no está estable, no seguir.
- El conteo de `tsc` debe **bajar** respecto a 204 (esperado ~−30). Si sube o no se mueve, algo salió
  mal en la regeneración.
- `types.ts` va a seguir traendo los objetos de Scheduler v1 (H6) — es esperado, no los edites a mano
  para sacarlos.
- Bajar `BASELINE` en `.github/workflows/test.yml` **en el mismo commit** que la regeneración.
- Retirar los `as never` de `useStaffFull()`, `StaffForm.tsx:366` (`staff_id_number_conflict`), y la
  fachada `segmentsClient` de `useStaffAssignmentSegments.ts` si las RPCs ya quedaron tipadas.
- Correr `npm run lint && npx tsc --noEmit && npx vitest run && npm run build` una vez más después
  de este cambio — avisame si algo rompe y lo reviso.

## Paso 4 — Browser: regresión (G9)

Con Dev 2.0 desplegado y el flag ON, por orden de riesgo:

1. **Encargos → tarjeta de asignaciones de personal** (fuera del flag) — prueba de que el grant de
   `is_schedulable` funcionó. Sin esto: 403.
2. **Personal (`/staff`)** — lista, formulario, chequeo de `id_number` duplicado.
3. **Matriz de roles del Scheduler** — el punto de mayor riesgo. Probar con `admin` (ve todo),
   `manager` (solo sus encargos como lead), `senior` (solo asignado), y **al menos 2 de los 12
   filtrados** (ej. `accounting_analyst`, `hr_manager`) confirmando que **no** ven el link ni
   reciben datos.
4. Timesheets (16 filas), Work Orders (staffing + gate conviviendo), Engagements, Scheduler flag
   ON/OFF, Fondos, Auth (alta de usuario, `role_key`).
5. Cerrar el hallazgo abierto de Fase 7: `/scheduler` con "Neil G" mostraba
   `scheduler.errors.unavailable` — confirmar el status code real en DevTools ahora que el gate usa
   `role_key`; puede ser un 403 legítimo.

## Paso 5 — El PR

Solo cuando los pasos 1–4 estén verdes:

```bash
gh pr create --base development --head merge/dev-scheduler-roles-permisos \
  --title "Convergencia: dev-scheduler + feat/roles-permisos" \
  --body "Ver bugs/scheduler/plan_merge_sche_rolper.md y docs/scheduler/roles_permisos_merge/evidence/ para el detalle completo. Gates G0-G9 verificados, ver riesgos_limitaciones.md."
```

**Sin auto-merge.** Avisame cuando esté abierto si querés que revise algo puntual del diff antes de
que alguien más lo apruebe.
