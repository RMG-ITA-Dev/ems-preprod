# Fase 7 — Runbook preliminar: reindex de Lovable y convergencia con `feat/roles-permisos`

> Cierra el entregable "Runbook preliminar para la futura convergencia de Lovable" y la sección
> "Reindex de Lovable" del issue. Fuente: `bugs/scheduler/fase_7/plan_v2.md` ("Reindex de Lovable"
> y "Deferred to the Joint Merge").

## 1. Reindex de Lovable (post-merge, si el preview no se construye)

Este PR introduce archivos nuevos importados desde archivos existentes (`sessionRecovery.ts`,
`SessionCacheGuard.tsx`, `schedulerFeature.ts`, etc.). Después de integrar en una rama conectada con
Lovable:

1. Verificar si el preview se construye normalmente.
2. Si aparece `"Preview has not been built yet"` o `/_sandbox/dev-server → 404`: seguir este
   runbook.
3. Usar un **commit vacío** únicamente como trigger de rebuild (`git commit --allow-empty -m
   "chore: trigger Lovable rebuild"`).
4. Esperar aproximadamente 30 segundos.
5. Reintentar como máximo **dos veces**.
6. **No** añadir cambios defensivos a la configuración de Vite o TypeScript para "resolver" un
   problema de índice — no es un problema del código.
7. Si persiste después de los 2 reintentos, tratarlo como un problema de la plataforma Lovable, no
   del repositorio, y escalarlo como tal.

## 2. Decisiones que afectan el día D de convergencia con Lovable

- **OQ2 — los 5 renames de convergencia de Fase 2 correrán con sus nombres nuevos.** No están
  ejecutados en el destino real (ni en Lovable ni en el proyecto "Test"), así que el escenario de
  colisión de PK duplicada que motivó el rename **no se materializa ahí** — solo era un riesgo real
  para una base construida directamente desde el ledger de `development` (ver §6.1 de
  `scheduler-fase-2-rutas-locales.md`, escenario medido en G3c).
- **OQ3 — regla de inmutabilidad de migraciones.** El contenido de ninguna migración se toca, en
  ninguna rama. Los nombres de las migraciones que corresponden a `development` sí pueden tocarse
  (los 5 renames ya aplicados son decisión aprobada). Las migraciones de `main` y de
  `scheduler-v3` son intocables por completo, contenido y nombre.
- `migration repair` contra el proyecto de integración ("Test") está en alcance de las fases del
  Scheduler; contra el Supabase de Lovable del administrador sigue **explícitamente fuera de
  alcance** hasta la fase de convergencia definitiva.

## 3. Convergencia con `feat/roles-permisos` (decisiones OQ5/OQ6 del operador)

**Nada de esto se ejecuta en Fase 7.** Se documenta aquí para que no se pierda, y se ejecuta en el
merge conjunto `dev-scheduler` + `feat/roles-permisos` → `development`.

**Regla de prioridad (OQ5):** las migraciones **nuevas** que creó `feat/roles-permisos` se
respetan; en las **anteriores**, manda `dev-scheduler` — eliminar o renombrar esos archivos del
lado de `feat/roles-permisos` para que no haya colisión, y adecuar el código del Scheduler a los
permisos y roles que esa rama trae.

### Tareas concretas, en orden

1. **Resolver las 5 colisiones de timestamp.** `feat/roles-permisos` todavía carga los 5 pares
   duplicados sin renombrar (el rename solo se aplicó en `dev-scheduler`). Verificar con `uniq -d`
   sobre el tip de esa rama. Nuestros nombres mandan → eliminar o renombrar los duplicados del lado
   de `feat/roles-permisos`, **antes** de cualquier `db reset`/`db push --include-all` contra su
   base de nube (si no, se repite el error de PK duplicada ya documentado en
   `docs/scheduler/fase_2/scheduler-fase-2-rutas-locales.md` §5).
2. **Re-verificar el piso de timestamps de C1–C4** contra el tip de `feat/roles-permisos` en ese
   momento, no solo contra `development`.
3. **Adecuar los consumidores al hardening de PII de `staff`.**
   `feat/roles-permisos` incluye `20260730080000_harden_staff_pii_columns.sql`, que revoca el
   `SELECT` de tabla en `public.staff` para `authenticated` y lo reemplaza por `SELECT` de 17
   columnas (`id_number`/`aud_reg_number` quedan solo accesibles vía `get_staff_full()`, gated por
   `has_permission('staff.read')`). Consecuencia: **cualquier** `staff!fk(*)` o `staff:staff(*)` da
   **403 para todos, admin incluido** — es privilegio de columna, no RLS. Reemplazar los `(*)` por
   listas explícitas de columnas (sin `id_number`/`aud_reg_number`) en:
   - `src/hooks/useEmsData.ts` (`useEngagements`, y el spot de `staff:staff(*)`)
   - `src/hooks/useApprovedEngagements.ts`
   - `src/hooks/useManualEntryEngagements.ts`

   Verificar los números de línea exactos en el momento de ejecutar (relevados sobre
   `dev-scheduler-fase_5`, pueden haber cambiado). El cambio debe aterrizar **antes** de aplicar esa
   migración sobre `development`. Esto es un problema del lado consumidor (`SELECT *`), no de la
   migración de PII, que es correcta.
4. **`tsc` en 0 (OQ6).** Los ~183 errores actuales son deuda ajena en su mayoría (67× `TS2322` de
   varianza de `Column<T>`; ~35 `TS2582`/`TS2304` de globals de vitest faltantes en tests legacy —
   desglose completo en `scheduler-fase-7-verificacion.md` §"Baseline de tsc"). Al llegar a 0
   en el merge conjunto, **eliminar el ratchet de `test.yml` y reemplazarlo por un gate duro**
   (`npm run typecheck` sin tolerancia).
5. **Re-correr G0 y G3 completos** después del merge conjunto: chequeo de timestamps duplicados,
   fingerprints de las 3 rutas y el gate de paridad de esquema. Los fingerprints commiteados en
   Fase 7 quedan invalidados si `feat/roles-permisos` altera el esquema.
6. **Re-verificar la matriz RLS** con las políticas y permisos que trae `feat/roles-permisos`, y
   reconciliar la matriz de 18 filas de Fase 7 con su modelo de `has_permission()`.

### Por qué esto queda fuera de Fase 7

Por decisión explícita del operador: el alcance de Fase 7 es únicamente lo que ya vive en
`dev-scheduler`. La convergencia con `feat/roles-permisos` es trabajo del merge conjunto hacia
`development`, no de esta fase — pero sin este registro, el conocimiento reunido durante el diseño
de Fase 7 (los 3 archivos consumidores exactos, la regla de prioridad, el orden de las 6 tareas) se
perdería.

### Estado real de ejecución (merge conjunto, 2026-08-06)

Plan completo y evidencia en `bugs/scheduler/plan_merge_sche_rolper.md` (gitignored). Las 6 tareas
de arriba, tal como se ejecutaron de verdad:

1. **Resolver las 5 colisiones de timestamp — no hizo falta tocar nada a mano.** El `git merge`
   real (`git merge-tree --write-tree` en dry-run, confirmado en la ejecución) resuelve los 5 pares
   solo: en la base común los 5 archivos existían con su nombre viejo, `dev-scheduler` los renombró
   (delete + add) y `feat/roles-permisos` no los tocó — git resuelve delete-vs-sin-cambios sin
   conflicto. Verificado con hash de contenido (`git hash-object`) idéntico byte a byte entre el
   merge-base y el resultado del merge para los 5 archivos.
2. **Piso de timestamps de C1–C4** — sin colisión por construcción: el árbol mergeado queda
   `20260724… (authz 1–7) → 20260727100000–130000 (C1–C4) → 20260729…–20260731030000 (authz
   8–resto) → 20260806000000 (grant nuevo, ver tarea 3)`.
3. **Hardening de PII — ya estaba hecho**, en el commit tip de `feat/roles-permisos` (`6855c639`,
   2026-08-04): los 21 embeds `staff!fk(*)`/`staff:staff(*)` en exactamente los 3 archivos
   listados arriba ya están reemplazados por listas explícitas de columnas. **Hallazgo nuevo, no
   cubierto por esta tarea:** el grant de 17 columnas no incluye `staff.is_schedulable`, que el
   Scheduler sí selecciona (`useActiveStaffWithSkills`) — 403 garantizado en Encargos y Scheduler
   L2. Cerrado con una migración nueva, aditiva:
   `supabase/migrations/20260806000000_grant_staff_is_schedulable.sql`.
4. **`tsc` en 0 — no se exigió** (decisión del operador, revisando OQ6): medido que 102 de los 183
   errores originales (56%) son deuda ajena — 48 de varianza de `Column<T>` del DataTable
   compartido y 35 de globals de Vitest faltantes — que ninguna de las dos ramas mueve. El gate real
   fue "cero errores nuevos atribuibles a `dev-scheduler` o a `feat/roles-permisos`", verificado
   contra baselines medidos por separado de cada rama. El ratchet de `test.yml` se conserva, no se
   reemplaza por gate duro; `tsc → 0` queda como sub-fase futura.
5. **Re-correr G0/G3** — hecho en R-APP (higiene, `uniq -d`, marcadores de conflicto); las rutas de
   BD (Ruta A/C, `test:rls`) requieren R-LOCAL con autorización del operador y no se ejecutaron
   desde esta sesión (regla del proyecto: nunca Supabase/migraciones desde R-APP).
6. **Matriz RLS / `has_permission()`** — el gate de rol del Scheduler se resolvió sin tocar el
   catálogo de permisos: en vez de reescribir las 4 capas de acceso (sidebar, drawer, `scheduler-data`,
   `scheduler-gaps`) para usar `has_permission()`, se cambió la **fuente del rol** de
   `user_roles.role` (enum legacy, espejado desde `role_key` y que colapsaba 23 roles en 11 —
   filtraba 12 role_key de más hacia el Scheduler) a `user_roles.role_key` directamente, con un
   único allowlist en `src/lib/schedulerAccess.ts`. Sin migraciones nuevas de catálogo. La matriz de
   18 filas de Fase 7 se reconcilia por separado (ver evidencia del merge).
