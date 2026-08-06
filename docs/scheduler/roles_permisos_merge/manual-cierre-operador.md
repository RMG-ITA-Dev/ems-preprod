# Manual de cierre — convergencia dev-scheduler + feat/roles-permisos

> Para el operador. Todo lo que se podía hacer desde R-APP (sin Supabase, sin autorización especial)
> ya está hecho y commiteado en `merge/dev-scheduler-roles-permisos` (pusheada a `origin`). Esto es
> el resto: pasos que requieren R-LOCAL, R-INT, o un browser — nunca se ejecutan desde R-APP.
>
> Plan completo con el detalle de cada gate: `bugs/scheduler/plan_merge_sche_rolper.md` §7/§11.
> Este documento es la versión "seguí estos pasos en orden", sin la justificación completa de cada
> decisión — para eso, el plan.

## Ya hecho (no repetir)

- Rama `merge/dev-scheduler-roles-permisos` pusheada a `origin`, 6 commits sobre `dev-scheduler`.
- G0, G2, G3, G4a (conteos), G8 (lint/tsc/build/vitest/verify:vendor) — todos verdes, evidencia en
  `docs/scheduler/roles_permisos_merge/evidence/`.
- CI disparada sobre la rama vía `gh workflow run "Scheduler Integrity — Fase 2" --ref
  merge/dev-scheduler-roles-permisos` (el trigger automático de `push` no se disparó solo — algo a
  revisar en la configuración del repo si vuelve a pasar, pero el dispatch manual funciona). Cubre
  G4b (Ruta A), G4c (`test:rls`, 4 lanes) y G4d (paridad A↔C) — corre contra Postgres aislado en el
  runner, no contra el stack compartido de R-LOCAL, así que es seguro y no requiere el Docker local.
  Resultado: ver `gh run view --log <run-id>` o la pestaña Actions de GitHub. Si dio verde, **G4b/c/d
  quedan cerrados sin que tengas que tocar Docker local** — confirmalo antes de re-ejecutarlos a mano.
- 3 issues de seguimiento abiertos: #275 (bug "semana de seis días", independiente), #276 (subfase
  catálogo `scheduler.*`), #277 (subfase `tsc → 0`).
- `docs/operations.md` actualizado a 174 migraciones.

## Paso 1 — R-LOCAL: confirmar CI y correr G1 (diff de RLS/grants)

1. Revisar el resultado de la corrida de CI disparada (link en el resumen de esta sesión, o
   `gh run list --branch merge/dev-scheduler-roles-permisos`). Si **route-parity** o
   **rls-migration-tests** dieron rojo, parar acá y avisar — no sigas a Dev 2.0 con eso sin resolver.

2. Si necesitás repetir algo a mano en `EMS_Dev_Local` (Docker), o correr el diff de políticas/grants
   entre `dev-scheduler` y `feat/roles-permisos` (G1, que la CI no cubre porque compara contra el
   estado combinado, no rama por rama):

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

3. **G4e — matriz RLS.** Reconciliar la matriz de 18 filas de Fase 7 contra el modelo
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
   5. Desplegar Edge Functions — **las 4 que cambiaron**, no solo las 2 del Scheduler:
      `scheduler-data`, `scheduler-gaps` (ambas migradas a `role_key` en esta rama) y
      `assign-user-role` (modificada por `feat/roles-permisos`, commit `c0653c33`).
   6. Probes: sin JWT → 401; `role_key` sin acceso (ej. `hr_manager`) → 403; `role_key` permitido →
      200. Repetir para `scheduler-data` y `scheduler-gaps`.
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
