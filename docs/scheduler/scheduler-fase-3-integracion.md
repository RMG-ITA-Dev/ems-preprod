# Fase 3 — Integración del núcleo del Scheduler (consultivo)

> Documento de ejecución. Fuente de alcance: `bugs/scheduler/fase_3/issue_fase_3.md`. Plan autoritativo:
> `bugs/scheduler/fase_3/plan_v2.md`. Este documento registra las decisiones de adaptación tomadas durante
> la implementación y el contrato de handoff hacia la Fase 5.

## 1. Adaptación del estado efectivo (reemplazo de `status='active'`)

El Scheduler original (`sruizmier-scheduler-v3`) modela el estado del engagement con un enum legacy de 4
valores (`active/pending/completed/cancelled`) y lo consulta directamente contra la columna
`engagements.status`. `development` usa una máquina de 9 estados efectivos
(`src/lib/engagementStatus.ts`, FEAT 0602-135): `override_manual ?? estado_derivado_de_la_OT`.

**Solución implementada:** cada Edge Function del Scheduler (`scheduler-data`, `scheduler-gaps`) incluye una
copia byte-sincronizada del cálculo de estado efectivo
(`supabase/functions/{scheduler-data,scheduler-gaps}/engagementState.ts`), que replica exactamente
`deriveEngagementState`/`effectiveEngagementState` de `development`. El Work Order gobernante se resuelve
vía la vista RLS-safe **`engagement_wo_state`** (`SELECT engagement_id, approval_status, approved_at,
risk_status FROM work_orders`; `work_orders.engagement_id` es `UNIQUE`, así que no hay ambigüedad de "más
reciente" — ver `supabase/migrations/20251204045534_...sql:99` y
`supabase/migrations/20260714000000_estado_encargo_0602-135.sql:313-317`).

**Contrato de datos:**
- `status` — string legacy del engagement (`engagements.status`), conservado solo para diagnóstico. En el
  timeline de staff, `status` es el estado del **assignment**, no del engagement.
- `engagement_status` — **estado efectivo numérico 1-9** (`EngagementState`), fuente de verdad. `null` si no
  puede derivarse con seguridad.

**Representación en cliente:** los chips reusan `engagementStateI18nKey`/`engagementStateBadgeClass` de
`development` (`src/lib/engagementStatus.ts`) — los 9 estados se distinguen exactamente, incluido
`AprobadoEmergencia(5)` y `Congelado(9)`. El color de barra del Gantt se bucketiza vía
`engagementTaskType(state)` en `src/lib/schedulerGantt.ts`:

| Estados | Bucket de barra | ¿Activo (utilización/gaps)? |
|---|---|---|
| 4 Aprobado, 5 AprobadoEmergencia | `ems-status-active` | **sí** |
| 1 Pendiente, 2 AprobadoSocio, 3 AprobadoRiesgos | `ems-status-pending` | no |
| 7 Finalizado | `ems-status-completed` | no |
| 6 Cancelado, 8 Rechazado | `ems-status-cancelled` | no |
| 9 Congelado | `ems-status-frozen` (nuevo) | no |
| desconocido/null | `ems-neutral` | no |

`STATUS_FILTERS` del cliente/servidor se extendió de 5 a 6 valores (`active/pending/completed/cancelled/
frozen/all`) — filtra por bucket, nunca por la columna legacy.

**`scheduler-gaps`:** las dos ocurrencias hardcodeadas de `.eq("status","active")`
(`handler.ts:892` y `:1272` en la referencia) se reemplazaron por: leer candidatos (paginado) → resolver
estado efectivo vía `engagement_wo_state` → filtrar bucket `"active"` (∈ {4,5}) → **recién entonces**
ordenar/agregar (filtrar-antes-de-limitar, Plan v2 §1).

## 2. Categorías por servicio

`development` mantiene `useCategories(serviceId?)` service-scoped (`src/hooks/useEmsData.ts:301-314`); no
se adoptó la variante global que introdujo `scheduler-v3`. En L2 y Gaps se resuelve el servicio del
engagement vía `services.code === engagement.practica` (patrón `WorksheetEdit.tsx:103-113`);
`practica IS NULL` se trata como "sin scope" (todas las categorías), coherente con la Fase 2 (Q5).
`scheduler-gaps` agrupa por `service_id + category_id` (nunca por nombre) y cada fila del payload incluye
`serviceId`, `serviceName`, `displayOrder` para que categorías homónimas de servicios distintos nunca se
mezclen en la UI (`BenchTable`, `SkillShortageTable`, `CategoryGapChart`).

## 3. L2 — modo consultivo (Decisión #1 del operador)

`SchedulerL2` y `L2StaffGantt` se portaron en variante **de solo lectura**: sin drag/resize, sin menú
Edit/Delete, sin atajo de teclado `n`, sin `AssignmentSheet`, sin bloqueo de salida de página
(`usePageLeaveLock`/`LeavePageDialog`). Se retiró también `allAssignments` (solo necesario para validar
overlaps al escribir). `canWrite` se sigue calculando con el mismo mirror puro
(`canWriteEngagementAssignments`, `src/lib/schedulerAssignmentAuthz.ts`) únicamente para fines
informativos — en esta fase la nota "solo lectura" se muestra siempre, para todos los roles.

### Contrato de handoff a Fase 5

Fase 5 deberá:
1. Portar `src/lib/engagementAssignments.ts` (validadores `validateAssignmentDrafts`,
   `findStaffSegmentOverlap`) y `src/hooks/mutations/useEngagementAssignmentMutations.ts`
   (`useSaveEngagementAssignments(engagementId) → { saveAssignments, isSaving }`), que consume la RPC
   **`save_engagement_assignments(p_engagement_id uuid, p_upserts jsonb, p_deleted_ids uuid[])`** ya
   aprobada y aplicada en Fase 2 (`supabase/migrations/20260727130000_scheduler_fase2_rpc_save_engagement_assignments.sql`).
   Contrato de errores: `EAS_DENIED`, `EAS_ENGAGEMENT_NOT_FOUND`, `EAS_ENGAGEMENT_LOCKED`,
   `EAS_CATEGORY_FOREIGN_SERVICE`, `EAS_DATE_RANGE`, `EAS_HOURS_RANGE` (`>0 AND <=80`),
   `EAS_ALLOCATION_RANGE` (`>0 AND <=100`), `EAS_OVERLAP`, `EAS_MISSING_FIELD`.
2. Portar `AssignmentSheet.tsx` con las props documentadas en la referencia:
   `{ engagement, open, onOpenChange, row, canWrite, requirements, staffOptions, assignments,
   onDirtyChange?, onSaved? }`.
3. Reactivar en `L2StaffGantt.tsx`: `onBarCommit` (drag/resize), el menú "Edit"/"Delete", y cablear
   `canWrite` (ya calculado en `SchedulerL2.tsx`, actualmente marcado `void canWrite` con un comentario que
   apunta a este documento) a los controles de escritura reales.
4. Reactivar en `SchedulerL2.tsx`: el botón "+ Agregar staff", el atajo de teclado `n`, `usePageLeaveLock` +
   `LeavePageDialog`, y la invalidación de `SCHEDULER_L1_KEY`/`SCHEDULER_STAFF_LOAD_KEY` tras guardar.
5. Agregar las claves i18n de escritura (`engagement.assignments.{title,addRow,staff,startDate,endDate,
   hoursPerWeek,allocationPct,notes,selectStaff,selectCategory,remove,readOnly,errors.*}`,
   `scheduler.l2.addStaff`, `scheduler.errors.{overlap,partialSave}`, `scheduler.assignmentSheet.*`) — no
   incluidas en el bloque de Fase 3 por no tener consumidor todavía.

## 4. CI del Scheduler — diferido a Fase 7 (Decisión #3 del operador)

Se portó el vendor SVAR + el guard de ESLint (`no-restricted-imports` + `ignores` acotados). **No** se portó
`.github/workflows/scheduler-integrity.yml` ni sus jobs pesados (`hermetic-rebuild` en Docker
`--network none`, `browser-contract` con Chromium headless). La reproducibilidad offline del vendor se
verificó localmente con `node tools/vendor/svar-gantt/verify.mjs` (los tres niveles — orígenes prohibidos,
allowlist de capacidades, integridad de la cadena de suministro — pasan). El rebuild determinista
(`rebuild-offline.mjs --hermetic`) requiere Linux/Docker y queda para Fase 7, igual que el fixture de
navegador (`tools/scheduler-fixture/assert-offline.mjs`, que requiere Playwright).

Al portar el workflow en Fase 7: renombrar a `scheduler-fase3-integrity.yml` (o consolidar) para evitar
colisión de ruta con `scheduler-fase2-integrity.yml` — GitHub identifica un workflow por su ruta de
archivo, no por rama.

## 5. Nota sobre `.gitattributes` (fix no listado en el plan)

Al portar el bundle SVAR vía `git checkout` en Windows, `core.autocrlf=true` corrompía los archivos de
texto del vendor (LF→CRLF), rompiendo los hashes de integridad que `verify.mjs` valida. Se re-extrajeron
los archivos byte-exactos vía `git show` y se agregó un `.gitattributes` acotado exclusivamente a
`src/components/scheduler/vendor/svar-gantt/**`, `tools/vendor/svar-gantt/**` y
`tools/scheduler-fixture/**` (`-text`), para que cualquier otro contribuidor en Windows no vuelva a
corromper el bundle en un futuro checkout. No afecta el manejo de fin de línea de ningún otro archivo del
repositorio.

## 6. Migraciones

**Ninguna migración nueva en esta fase.** El contrato de lectura ya existe desde Fase 2
(hasta `supabase/migrations/20260727130000_...sql`). El piso de timestamp citado en el prompt original
(`20260720194653`) estaba desactualizado; el real, verificado en el working tree, es `20260727130000`.
