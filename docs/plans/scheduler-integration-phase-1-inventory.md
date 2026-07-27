# Fase 1 — Inventario de integración del Scheduler

> Entregable versionado de la Fase 1 (`bugs/scheduler/fase_1/issue_fase_1.md` + `plan_v2.md`). Generado y verificado en vivo el 2026-07-24 sobre el repositorio real (no simulado). Ubicado en `docs/plans/` porque `bugs/` está excluido de Git (`.gitignore:27`; confirmado con `git check-ignore` / `git ls-files bugs/scheduler/` sin resultados).

## 1. Estado de ramas

| Rama | Commit | Notas |
|---|---|---|
| `development` (local) | `cee7348` | Coincide con `origin/development` |
| `origin/development` | `cee7348` | Sincronizado (`git fetch --prune origin` ejecutado) |
| `dev-scheduler` | `cee7348` | Creada desde `development`/`origin/development`; **idéntica** (`git diff origin/development dev-scheduler` vacío); sin commits de `sruizmier-scheduler-v3` (`git log development..dev-scheduler` vacío) |
| `sruizmier-scheduler-v3` | `c1cb303` | Implementación de referencia, solo lectura |

No existía ninguna `dev-scheduler` remota previa que pudiera sobrescribirse. La rama de integración ya estaba creada y verificada como punto de partida limpio; no se requirió ninguna acción de escritura adicional en Git durante esta fase.

## 2. Divergencia de commits

- Ancestro común (`merge-base`): `caa9bec` — 2026-05-13, *"docs: introduce docs/operations.md as single source of truth"*.
- Snapshot histórico del issue: `development` +420 / `sruizmier-scheduler-v3` +151.
- Recalculado hoy (2026-07-24): `development` **+425** / `sruizmier-scheduler-v3` **+151** (sin cambio).
- Interpretación: `development` es una rama viva que sigue avanzando; el resto de las cifras estructurales se mantienen estables.

## 3. Inventario de archivos vs. ancestro común

| | Agregados | Modificados | Eliminados |
|---|---|---|---|
| `sruizmier-scheduler-v3` | 170 | 40 | 1 |
| `development` | 169 (drift de 1 vs. snapshot del issue: 168) | 111 | 10 |

## 4. Delta de migraciones

- Exclusivas de `sruizmier-scheduler-v3`: **8**
- Exclusivas de `development`: **59**
- Conflictos de contenido entre ambas (archivos `M` compartidos bajo `supabase/migrations`): **0** — las migraciones base (pre-merge-base) son byte-idénticas en ambas ramas.
- Estado de Lovable: atrasado, sin las 59 migraciones de `development`; equivale al estado de `sruizmier-scheduler-v3` (base + 8 del scheduler).

### Piso de timestamp para futuras migraciones de convergencia

- La migración más reciente real en `development`/`dev-scheduler` es **`20260719000000_0714_154_worksheet_service_scope.sql`**.
- El timestamp `20260720194653` citado en el manual del operador (`bugs/scheduler/operator_manual_scheduler.md`) **pertenece exclusivamente a `sruizmier-scheduler-v3`** (confirmado: no existe en `development` ni en `dev-scheduler`). No debe usarse como piso.
- Regla para fases futuras: cualquier migración de convergencia debe calcular su propio piso contra la punta real de `supabase/migrations/` en `dev-scheduler` en el momento de crearla, no asumir un valor fijo de este documento.
- Nota informativa: `20260506120000_wo_staffing_requirements.sql` (una de las 8 exclusivas del scheduler) tiene timestamp anterior al branch point (13-may); está backdated. No requiere acción, solo evitar confusión de orden cronológico.

## 5. Los 27 archivos compartidos (tocados por ambas ramas desde el ancestro común)

Verificado de forma **autoritativa** con `git merge-tree --write-tree --name-only development sruizmier-scheduler-v3` (merge de 3 vías real; exit 1 = hay conflictos). Resultado: **16 conflictos de contenido reales**, coincidiendo exactamente con la lista del issue.

### 5.1 — 16 archivos en conflicto real (requieren resolución manual en su fase responsable)

| Archivo | Fase responsable |
|---|---|
| `docs/operations.md` | Fase 1–2 (temprano) — fuente de verdad de todos los tools |
| `.gitignore` | Fase 7 (tooling) |
| `eslint.config.js` | Fase 7 (tooling) |
| `src/components/dashboard/tabs/CarteraTab.tsx` | Conservar desde development (Fase 3 review) |
| `src/components/forms/EngagementForm.tsx` | Fases 3 y 5 (hotspot) |
| `src/components/forms/WorkOrderForm.tsx` | Fase 4 (hotspot) |
| `src/pages/WorkOrderEdit.tsx` | Fase 4 |
| `src/components/layout/AppSidebar.tsx` | Fase 3 (navegación) |
| `src/components/layout/MobileMoreDrawer.tsx` | Fase 3 (navegación) |
| `src/components/timesheet/ApprovalTimesheetGrid.tsx` | Fase 6 |
| `src/components/timesheet/TimesheetGrid.tsx` | Fase 6 |
| `src/pages/TimeSheet.tsx` | Fase 6 |
| `src/hooks/useTimesheetApprovals.ts` | Fase 6 |
| `src/hooks/mutations/index.ts` | Compartido (barrel export — coordinación) |
| `src/locales/en.json` | Compartido (todas las fases) |
| `src/locales/es.json` | Compartido (todas las fases) |

### 5.2 — 9 archivos auto-combinables (Git los resuelve solo; requieren igualmente revisión semántica por fase)

Confirmados con `Auto-merging …` sin línea `CONFLICT` posterior:

- `src/App.tsx`
- `src/components/data-table/DataTable.tsx`
- `src/hooks/useAuth.tsx`
- `src/pages/Auth.tsx`
- `src/hooks/useEmsData.ts`
- `src/hooks/useTimesheetMutations.ts`
- `src/components/dashboard/__tests__/StaffHoursDetailDialog.test.tsx`
- `src/components/timesheet/__tests__/ApprovalTimesheetGrid.test.tsx`
- `src/hooks/__tests__/useAuth.test.tsx`

### 5.3 — 1 archivo generado, nunca se mergea a mano

`src/integrations/supabase/types.ts` — el merge lo resuelve limpio (confirmado también byte-idéntico entre `origin/development` y `dev-scheduler`), pero la regla operativa se mantiene: se regenera vía Lovable, no se edita ni mergea manualmente.

### 5.4 — 1 archivo delete/delete concorde

`.claude/scheduled_tasks.lock` — ambas ramas lo eliminaron (`D`/`D` confirmado); ni siquiera aparece en la lista de conflictos del merge-tree.

**Total: 16 + 9 + 1 + 1 = 27**, coincidiendo con la distribución que fija el issue.

## 6. Hallazgos adicionales verificados

- **`public.skills`**: definida en `20260412073936_869e1ad3-...sql`, parte de las 72 migraciones base (pre-merge-base) → clasificar como "Conservar desde development", no es tabla nueva del scheduler.
- **`vw_staffing_alerts`** (vista existente en `development`) y **`wo_staffing_requirements`** (tabla nueva del scheduler, columnas reales `wo_id` / `category_id`) son conceptos distintos y no deben confundirse al auditar "staffing".
- **`docs/plans/scheduler-phase-2-staffing-requirements.md`** (líneas 31–75) usa nombres de columna obsoletos (`work_order_id` / `staff_category`) que **no coinciden** con la migración real de referencia (`wo_id` / `category_id`, verificado en `sruizmier-scheduler-v3:supabase/migrations/20260506120000_wo_staffing_requirements.sql`). No debe usarse como sustituto del contrato canónico de Fase 2.
- **`src/integrations/supabase/types.ts`** en `development`: el tipo `engagement_assignments` **no tiene `category_id`**; sí lo tiene la referencia del scheduler. Contexto relevante para Fases 2/5, no se resuelve en Fase 1.
- **Edge Functions**: `docs/operations.md` (líneas 52–65) documenta **6** Edge Functions, pero `development` tiene **7** reales (falta `secure-signin` en la tabla — drift preexistente, no causado por el scheduler). Combinadas con las 2 nuevas del scheduler (`scheduler-data`, `scheduler-gaps`), el total futuro es **9**. Este documento **no fue editado** en esta fase (ver decisión en §8); se deja registrado para que Fase 2 lo corrija.
- **`EngagementForm.servicesCatalog.test.tsx`**: la suite es lenta (~148s de punta a punta, con el costo concentrado en `collect`/`environment` de Vitest, no en las aserciones) pero **pasa completa** (11/11). Preexistente, no atribuible al scheduler, no se optimiza en esta fase.

## 7. Matriz de clasificación por bloque funcional

| Bloque | Clasificación | Fase |
|---|---|---|
| Esquema, migraciones, RLS, RPC del scheduler | Revisar en fase de base de datos | Fase 2 |
| Páginas, rutas, Gantt, navegación, Edge Functions del scheduler | Adaptar / Portar según archivo | Fase 3 |
| Staffing Requirements de Work Orders (`wo_staffing_requirements`) | Adaptar (esquema válido, falta suite de tests) | Fase 4 |
| Engagement Assignments (`category_id` en tipos) | Adaptar | Fase 5 |
| Advisory de Timesheets | Reimplementar sobre la base actual de `development` | Fase 6 |
| `CarteraTab.tsx` | Conservar desde development | Fase 3 (review) |
| `App.tsx` (Fund Requests, sin Expenses) | Conservar desde development | Fase 3 (review, auto-combinable) |
| `.gitignore`, `eslint.config.js` | Revisar en estabilización | Fase 7 |
| `docs/operations.md` | Revisar en fase de base de datos (resolución temprana) | Fase 1–2 |
| Archivos del módulo Expenses (eliminados por development) | Descartar / no restaurar | Todas |
| `types.ts` | Conservar desde development (regenerar vía Lovable) | N/A |

Detalle semántico adicional por archivo: ver `bugs/scheduler/Informe_scheduler.md` (no se reescribe ni duplica aquí).

## 8. Decisión: `docs/operations.md`

Se marca para **resolución temprana** (Fase 1–2) por ser la fuente de verdad que leen `CLAUDE.md`, `AGENTS.md` y `.lovable/instructions.md`. **No se edita dentro de esta Fase 1** — el issue pide que quede "marcado para resolución temprana", no corregido en esta fase, y Fase 1 no lista ninguna edición de documentación entre sus entregables. Se recomienda que sea el primer paso de Fase 2: agregar `secure-signin` a la tabla de Edge Functions y enlazar el flujo de `dev-scheduler`, sin copiar la variante del scheduler ni declarar `scheduler-data` / `scheduler-gaps` todavía (eso pertenece a Fase 3, cuando esas funciones se incorporen realmente).

## 9. Mapa de tests existentes en la referencia, por fase responsable

- **Fase 2**: `supabase/tests/rls-engagement-assignments-d5.sql`, `supabase/tests/rls-timesheet-authorization-phase5.sql`, `supabase/tests/local/{00-shim-supabase,05-shim-v2-drift-table,10-shim-scheduler-v2-views,20-shim-timesheet}.sql`, `run-rls-tests.sh`.
- **Fase 3**: `src/test/edge-functions/{schedulerDataHandler,scheduler-gaps.handler}.test.ts`, `src/components/scheduler/**/__tests__/*`, `src/hooks/scheduler/__tests__/{schedulerDataErrors,useSchedulerGaps,useSchedulerStaffTimeline}.test.*`, `src/pages/__tests__/Scheduler*.test.tsx`.
- **Fase 4**: **hueco detectado** — la referencia no trae suite dedicada para el guardado de staffing. A crear en Fase 4 (no en esta fase): `src/hooks/mutations/__tests__/useWorkOrderStaffingMutations.test.tsx`, `src/pages/__tests__/WorkOrderEdit.staffing-requirements.test.tsx`.
- **Fase 5**: `useEngagementAssignmentMutations.timeline.test.tsx`, `engagementAssignments*.test.ts`, `schedulerAssignmentAuthz.test.ts`, `staffingMatch.test.ts`.
- **Fase 6**: `TimesheetGrid.advisory.test.tsx`, `useTimesheetMutations.submitAdvisory.test.tsx`, `useStaffAssignmentSegments.test.ts`, `timesheetAssignmentAdvisory.test.ts`, `TimeSheet.banner.test.tsx`, `TimesheetApprovalDetail.weekRange.test.tsx`.
- **Fase 7**: `sessionRecovery.test.tsx`, adaptación de `src/hooks/__tests__/useAuth.test.tsx`.

## 10. Archivos que deben permanecer eliminados (verificado ausentes en `dev-scheduler`)

Confirmado con `git cat-file -e dev-scheduler:<path>` (todos ausentes, ninguno restaurado):

- `.claude/scheduled_tasks.lock`
- `.claude/settings.local.json`
- `src/components/forms/ExpenseLogForm.tsx`
- `src/hooks/useExpenseLogMutations.ts`
- `src/pages/Expenses.tsx`
- `src/pages/ExpenseNew.tsx`
- `src/pages/ExpenseEdit.tsx`
- `src/pages/__tests__/Expenses.engagement-filter.test.tsx`
- `src/components/layout/__tests__/AppHeader.sidebar-trigger.test.tsx`
- `src/components/layout/__tests__/AppLayout.sidebar-focus-mode.test.tsx`
- Otros tests y archivos asociados exclusivamente al módulo Expenses eliminado (no enumerados individualmente; cubiertos por la regla general "no restaurar archivos eliminados por development").

## 11. Estrategia de ramas y revisión (operador único)

- Proceso a cargo de un único operador (Marcelo); no hay segundo desarrollador.
- Cada fase parte de `dev-scheduler`; los PRs de cada fase tienen como destino `dev-scheduler` (trazabilidad e historial revisable por fase).
- Revisión por PR apoyada en segunda opinión automatizada (Codex/Claude) para Engagements, Work Orders, Timesheets y RLS.
- Hotspots multi-fase: `EngagementForm.tsx` (Fases 3 y 5) y `WorkOrderForm.tsx` (Fase 4) deben secuenciarse — un único momento de merge por archivo, sin ramas paralelas abiertas sobre el mismo archivo al mismo tiempo.
- Disciplina i18n: cada fase agrega sus claves de `en.json`/`es.json` en bloque propio; reconciliación de locales como paso explícito antes de cada merge a `dev-scheduler`.

## 12. Supabase de integración

- El Supabase de integración debe **espejar el estado real de Lovable** (base + 8 migraciones del scheduler), no partir de un build limpio, para validar el camino incremental del día D (aplicar solo las 59 migraciones pendientes de `development` sobre datos reales).
- El Supabase donde se ejecutó SQL manualmente previamente es un sandbox funcional, no una prueba válida del historial de migraciones.
- No se identificó en esta fase un project ID de Supabase de integración distinto al de Lovable (`ugqxfnrxvksiltwxzist`) — pendiente de que el operador lo confirme o indique que aún no existe.
- No se ejecutaron migraciones ni se modificó ningún ambiente Supabase durante esta fase.

## 13. Preguntas abiertas para el operador

1. ¿Confirmar que `docs/operations.md` se corrige recién al abrir Fase 2 (recomendado) y no antes?
2. ¿Dónde vivirá el contrato canónico de Fase 2 (esquema/RLS/RPC) cuando se redacte? `bugs/scheduler/fase_2/` está vacío hoy.
3. Identificar o confirmar el project ID del Supabase de integración (distinto del de Lovable) que espejará el estado real.
4. ¿La numeración `faseX` en nombres de migraciones de convergencia sigue la numeración de este Epic (`scheduler_faseN`) o alguna numeración histórica del scheduler? No aplica todavía (ninguna migración se crea en Fase 1).

## 14. Verificación ejecutada (evidencia)

Todos los comandos de `Verification Steps` de `plan_v2.md` se ejecutaron contra el repositorio real el 2026-07-24:

- `git fetch --prune origin` — ejecutado, sin cambios relevantes para `development`/`dev-scheduler`.
- `git rev-parse development origin/development` — idénticos (`cee7348`).
- `git branch -a | grep -i dev-scheduler` — solo la rama local esperada.
- `git merge-base development sruizmier-scheduler-v3` → `caa9bec` (2026-05-13).
- `git rev-list --count` — 425 (development) / 151 (scheduler) desde el merge-base.
- `git diff --name-status <merge-base> <rama>` — 170/40/1 (scheduler), 169/111/10 (development).
- `git diff --name-status <merge-base> <rama> -- supabase/migrations` — 8 (scheduler) / 59 (development), 0 `M` en ambas.
- `comm -12` sobre ambos diffs — 27 archivos compartidos, lista confirmada.
- `git merge-tree --write-tree --name-only development sruizmier-scheduler-v3` — 16 conflictos reales, exit 1, lista idéntica a la del issue.
- `git diff origin/development dev-scheduler` — vacío.
- `git diff --name-only origin/development..dev-scheduler -- src supabase/migrations supabase/functions` — vacío.
- `git cat-file -e dev-scheduler:<path>` para los 10 archivos protegidos — todos ausentes (OK).
- `git diff origin/development:src/integrations/supabase/types.ts dev-scheduler:src/integrations/supabase/types.ts` — sin diferencias.

No se ejecutó ningún comando de escritura sobre Git más allá de la verificación (la rama `dev-scheduler` ya existía, creada limpia desde `development`/`origin/development`, sin commits del scheduler). No se aplicó SQL. No se modificó ningún ambiente Supabase.
