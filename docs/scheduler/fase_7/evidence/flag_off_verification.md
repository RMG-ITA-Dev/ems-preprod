# G8 — Verificación con `VITE_SCHEDULER_ENABLED=false` (7 chokepoints)

> Fuente: `scheduler-fase-7-habilitacion-y-rollback.md` §3. Con el flag OFF, ninguno de estos 7
> puntos debe dejar nada del Scheduler alcanzable. Ambiente: mismo "Test", mismo build, solo
> cambia la env var (`.env.local`, restart del dev server para que Vite la releea).

| # | Chokepoint | Qué revisar en el browser | Resultado |
|---|---|---|---|
| 1 | `src/App.tsx` (rutas) | Ir directo a `/scheduler`, `/scheduler/staff`, `/scheduler/gaps` y a la ruta de Staffing (deep link/URL manual, no por nav) → debe caer en `NotFound`, no en la página del Scheduler | [x] `/scheduler` → 404 "¡Página no encontrada!" confirmado |
| 2 | `AppSidebar.tsx` | Sidebar desktop: no debe aparecer ninguna entrada de navegación al Scheduler | [x] Sidebar sin entradas de Scheduler confirmado |
| 3 | `MobileMoreDrawer.tsx` | Mismo chequeo en el drawer de navegación móvil | [x] |
| 4 | `EngagementForm.tsx` | Editar un Engagement existente: no debe aparecer la sección de Staff Assignments (ni la card, ni el placeholder) | [x] |
| 5 | `WorkOrderForm.tsx` | Crear/editar una Work Order: no debe aparecer la sección de Staffing Requirements (ni la card, ni el placeholder deshabilitado) | [x] |
| 6 | `WorkOrderEdit.tsx` | Guardar una Work Order sin la sección de staffing visible: el guardado debe completar normalmente, sin validaciones ni escrituras fantasma de staffing | [x] |
| 7 | `useStaffAssignmentSegments.ts` | Abrir `/timesheet` y `/timesheet/approvals/:id`: en DevTools → Network, confirmar que **no** se dispara la RPC `get_staff_assignment_segments` (el advisory de Fase 6) | [x] |

## Resultado

**7/7 chokepoints confirmados, sin fallas.** Con el flag OFF, el Scheduler es completamente
inalcanzable (rutas, nav desktop/móvil, secciones de staffing en Engagements/Work Orders,
guardado de Work Orders sin efectos fantasma, advisory RPC sin invocar en Timesheet). Verificado
contra "Test" (`slkqdcwwvmjtcbakajib`), 2026-08-06.
