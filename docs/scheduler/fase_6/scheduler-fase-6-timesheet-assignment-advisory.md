# Scheduler Fase 6 — Advisory no bloqueante de asignaciones en Timesheets

> Fuente de verdad: `bugs/scheduler/fase_6/issue_fase_6.md` y `bugs/scheduler/fase_6/plan_v2.md`.
> Esta fase es casi enteramente frontend: la RPC `get_staff_assignment_segments` ya existía
> (Fase 2, `20260718120000_scheduler_phase5_timesheet_authorization.sql`) y no se modifica.

## Qué hace

Cuando un staff registra horas reales positivas en fechas no cubiertas por ninguna ventana de
`engagement_assignments`, la UI lo señala:

- Banner semanal en `TimeSheet.tsx` (visible también en semanas submitted/approved/locked).
- Tinte + icono + tooltip por celda en `TimesheetGrid.tsx` (también en celdas bloqueadas por
  otras reglas — nunca depende solo del color).
- Badge por Engagement + marca por día en `ApprovalTimesheetGrid.tsx` (modo read-only del
  aprobador).
- Toast informativo posterior a un submit exitoso con advertencias, en `useTimesheetMutations.ts`.
- Indicador mínimo y no técnico cuando los datos del advisory no están disponibles (ver
  "Comportamiento fail-open" abajo).

**Nada bloquea**: ni la edición, ni el autoguardado, ni el submit, ni approve/reject, ni los
permisos, ni los estados de aprobación. El contrato de `submit_timesheet_safe` (5 argumentos,
dos arrays paralelos `p_engagement_ids`/`p_activity_ids`) no cambia.

## Comportamiento fail-open

```
data === null       -> NO DISPONIBLE (RPC denegada / no desplegada / error / forma inesperada /
                        semana no canónica / span > 6 días) -> advisory OFF en todas las
                        superficies. unauthorizedCount = 0. Sin advertencias falsas.
data es un Map      -> AUTORITATIVO. Un Map vacío significa "sin ventanas esta semana" -> toda
                        hora real positiva se marca. Engagement ausente del Map también marca.
data === undefined  -> aún no se consultó (query deshabilitada o en vuelo).
```

`buildSegmentMap()` (`src/hooks/scheduler/useStaffAssignmentSegments.ts`) nunca devuelve un mapa
parcial: cualquier fila con forma inesperada, fecha imposible, UUID inválido o rango invertido
descarta el resultado completo y cae a `null`.

Una cancelación de fetch (`AbortSignal`) se relanza para que React Query la trate como
cancelación, nunca como `null` cacheado.

**Decisión de producto (issue Fase 6, Open Question 3):** a diferencia del silencio total
descrito originalmente en Plan v2 §9, se agregó un indicador visible mínimo y no técnico
(`timesheet.assignmentAdvisory.unavailable`) cuando `data === null`, sin exponer el motivo técnico
del fallo (denegado vs. no desplegado vs. error de red son indistinguibles para el usuario).

## Cache por usuario

Query key: `[SCHEDULER_TIMESHEET_AUTHZ_KEY, viewerId, staffId, weekStart, weekEnd]`.

El resultado de `get_staff_assignment_segments` depende del rol de quien consulta (self /
firmwide / approver / denegado). El `QueryClient` es de ámbito de módulo y sobrevive a un
sign-out in-SPA sin recargar la página, así que `viewerId` es obligatorio en la key — de lo
contrario un cambio de cuenta podría servir el mapa cacheado de la cuenta anterior.

`staleTime`: 5 minutos (300_000 ms). La invalidación no depende de un timer: se dispara por
prefijo de `SCHEDULER_TIMESHEET_AUTHZ_KEY` desde el punto único de escritura de assignments
(`useEngagementAssignmentMutations.ts`, `onSettled`, ya existente desde la Fase 5 — sin cambios
en esta fase).

## Cableado

| Pantalla | Staff consultado | `week_start` | `week_end` |
|---|---|---|---|
| `TimeSheet.tsx` | `staffRecord` (usuario logueado) | `weekInfo.weekDates[0]` — lunes canónico por construcción (`getWeekMonday`) | último día mostrado (5 o 6 días según `policies.workDays`) |
| `TimesheetApprovalDetail.tsx` | `timesheetData.period.staff_id` (staff **visto**, no el aprobador) | `period.week_start_date` tal cual viene de la BD, **sin normalizar** | derivado con `getWorkDays(parseDateLocal(week_start_date), workDays)` |

Ambas pantallas retienen la query (`weekEnd: policiesPending ? undefined : weekEndStr`) mientras
`useTimesheetPolicies()` está pendiente, para evitar una consulta con fin en viernes seguida de
otra con fin en sábado en la misma carga.

Si `period.week_start_date` no fuera lunes, la RPC lo rechaza (`ISODOW = 1`) y el advisory se
apaga — no se normaliza al lunes más cercano, para no consultar un período distinto al
almacenado.

## Cero cambios de backend

- Ninguna migración nueva. `get_staff_assignment_segments` ya está en
  `supabase/migrations/20260718120000_scheduler_phase5_timesheet_authorization.sql` (Fase 2).
- Ningún Edge Function participa; el cliente llama a la RPC de PostgREST directamente.
- `src/integrations/supabase/types.ts` no se modificó a mano — sigue sin declarar
  `get_staff_assignment_segments` ni la firma de 5 args de `submit_timesheet_safe` (artefacto de
  Lovable, se regenera fuera de este repo). `useStaffAssignmentSegments.ts` usa una fachada
  tipada local (`segmentsClient`), acotada al módulo, con un `TODO(types)` de borrado cuando
  `types.ts` se regenere.

## Cambio de comportamiento a validar: `is_forecast = false` en aprobaciones

`src/hooks/useTimesheetApprovals.ts` (`usePendingApprovalSummaries` y
`useStaffTimesheetForApproval`) ahora filtra `is_forecast = false` en sus lecturas de
`time_entries` — antes eran las únicas lecturas del app sin ese filtro. Efecto observable: si un
período tenía horas de forecast, `totalPendingHours` (resumen) y las horas mostradas en el grid
de aprobación **bajarán** para reflejar solo horas reales. Esto es una corrección de un bug
preexistente (desincronización con la RPC de segmentos, que ya excluía forecast), no una
regresión.

**Cómo verificarlo**: comparar, en un período con entradas `is_forecast = true`, el total
mostrado en `/timesheet/approvals` antes y después de esta fase para el mismo período.

## Verificación de tipos (`tsc`) — deuda preexistente, no introducida por esta fase

`npx tsc -p tsconfig.app.json --noEmit` falla con **183 errores** tanto en `dev-scheduler` (base)
como en `dev-scheduler-fase_6`. Se comparó el conteo exacto entre ambas ramas: es el mismo número
en las dos, y ninguno de los errores proviene de un archivo tocado por esta fase. La causa es
`src/integrations/supabase/types.ts` desactualizado (no declara `get_staff_assignment_segments` ni
la firma de 5 args de `submit_timesheet_safe`; ver "Cero cambios de backend" arriba) más otro deuda
de tipos preexistente y no relacionada (columnas de `timesheet_line_approvals`, fixtures de tests
de otras features, etc.).

**Acción diferida a propósito:** no se corrige aquí — `types.ts` es un artefacto de Lovable y se
regenera al integrar esta rama a `main` (ver Open Question 2 de `plan_v2.md`). Al hacer esa
integración, re-correr `npx tsc -p tsconfig.app.json --noEmit` y confirmar que el conteo baja
respecto a este baseline de 183; si `get_staff_assignment_segments` y la firma de 5 args aparecen
ya tipadas, borrar la fachada local (`segmentsClient` en `useStaffAssignmentSegments.ts`, marcada
con `TODO(types)`).

**Fase 7 — desglose medido de los 183 (reemplaza la nota anterior de "confirmar que el conteo
baja"):** la composición real no es "todo por `get_staff_assignment_segments`" —

- Solo **7** errores referencian la unión de nombres de RPC del contrato canónico.
- `get_staff_assignment_segments` en sí contribuye **cero**: la fachada `segmentsClient` (el
  `TODO(types)` de arriba) ya la enmascara por completo.
- **~35** son `TS2582`/`TS2304` — `describe`/`expect` sin import en suites de test legado, no
  relacionadas con el Scheduler.
- El grueso, **67×** `TS2322`, es deuda preexistente de varianza de genéricos en `Column<T>` del
  `DataTable` compartido, repartida entre `Settings.tsx` (28 de esos 67), `Staff.tsx`, `Clients.tsx`,
  `Engagements.tsx` y `FundRequests*.tsx` — ninguno tocado por el Scheduler.

Expectativa post-regeneración de tipos: **~183 → ~174**, no → 0. Llevarlo a 0 queda fuera del
alcance de cualquier fase individual del Scheduler — es gate del merge conjunto con
`feat/roles-permisos` (ver `docs/scheduler/fase_7/scheduler-fase-7-verificacion.md`). Fase 7 cierra
esto con un ratchet de línea base en CI (`BASELINE=183`, no puede crecer) en vez de silenciar el
check o exigir 0.

## Fuera de alcance

Ver `bugs/scheduler/fase_6/issue_fase_6.md` §"Fuera de alcance" y `plan_v2.md` §"Out of Scope".
En particular: no se creó ni modificó ninguna migración, no se tocó RLS, no se agregó
`usePageLeaveLock` a `TimeSheet.tsx` (no existía en `development` — "mantener protección de
salida" se interpretó como "no romper lo existente").
