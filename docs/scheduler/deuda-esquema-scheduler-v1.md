# Deuda de esquema — Scheduler v1 (prototipo de abril, nunca revertido)

> Origen resuelto durante la convergencia `dev-scheduler` + `feat/roles-permisos`
> (`bugs/scheduler/plan_merge_sche_rolper.md`, H6). Decisión del operador (2026-08-06):
> **se documenta, no se adopta al ledger de migraciones y no se borra del Supabase real.**

## Qué es

Tres tablas, cuatro funciones y ocho columnas que existen en el Supabase real (Lovable, "Dev
2.0", y "Test") pero que **ninguna migración del ledger actual crea**. `types.ts` las trae porque
se genera desde el esquema real, no desde el replay de migraciones — por eso aparecen incluso en
ramas que nunca las tocaron.

## Origen (resuelto)

**Commit `1f07bc5b`**, "Add scheduler schema migrations", 2026-04-05, autor `gpt-engineer-app[bot]`
(Lovable). Presente en dos ramas remotas: `origin/sruizmier-scheduler-v1` (**canónica** — el
prototipo v1 del Scheduler) y `origin/claude/debug-fixes-ievxB`. Dos migraciones:

- `20260405090808_d32b3954-441f-4d2d-949f-2901e9224cad.sql` — "Scheduler Stage 1 — Schema
  Foundations": crea las 3 tablas (ver abajo), sus 17 políticas RLS, y las 8 columnas fantasma.
- `20260405092805_d06b27cb-a98f-4ee4-a709-65256999b28e.sql` — las 4 funciones (ver abajo).

Ninguna de las dos migraciones está en `main`, `development`, `dev-scheduler`,
`sruizmier-scheduler-v3` ni `feat/roles-permisos` — la rama `sruizmier-scheduler-v1` nunca se
mergeó. Pero el prototipo **sí se aplicó al Supabase real vía Lovable** en su momento, y nunca se
revirtió ahí.

## Inventario

### Tablas

| Tabla | Nota |
|---|---|
| `staff_unavailability` | Ausencias/indisponibilidad de personal |
| `engagement_staffing_requirements` | Requerimientos de staffing por encargo — **versión v1**, reemplazada conceptualmente por `wo_staffing_requirements` (Fase 2 del Scheduler actual, por Orden de Trabajo, no por Encargo) |
| `resource_planning_audit_log` | Auditoría de cambios de planificación de recursos |

`engagement_assignments` (la tabla que sí usa el Scheduler actual) **no es la misma** que la que
crea `1f07bc5b` — esa versión v1 quedó reemplazada por completo por
`20260716120000_engagement_assignments_phase3.sql` en `dev-scheduler`. No hay conflicto de nombre
porque la v1 nunca llegó al ledger.

### Funciones

| Función | Nota |
|---|---|
| `fn_effective_weekly_capacity()` | — |
| `fn_staff_weekly_assigned_hours()` | — |
| `seed_staffing_requirements_from_budget()` | — |
| `fn_scheduler_audit_trigger()` | Trigger de auditoría para `resource_planning_audit_log` |

### Columnas fantasma

| Tabla | Columna | Nota |
|---|---|---|
| `staff` | `is_schedulable` | La única que el Scheduler **actual** también usa (`useActiveStaffWithSkills`, `StaffAssignmentsCard`, `SchedulerL2`). Recreada con `ADD COLUMN IF NOT EXISTS` por `20260727110000_scheduler_fase2_convergencia_esquema.sql` (C2), precisamente porque ya existía. Ver `20260806000000_grant_staff_is_schedulable.sql` — el grant de PII que le faltaba tras el merge con `feat/roles-permisos` |
| `staff` | `target_utilization_percent` | Sin consumidor conocido en el código actual |
| `staff` | `skills` (texto libre) | Sin consumidor conocido — reemplazada conceptualmente por `staff_skills` (tabla relacional) |
| `engagements` | `priority_level` | Sin consumidor conocido |
| `engagements` | `total_budgeted_hours` | Sin consumidor conocido |
| `engagements` | `is_recurring` | Sin consumidor conocido |
| `engagements` | `prior_year_engagement_id` | Sin consumidor conocido |
| `engagements` | `staffing_notes` | Sin consumidor conocido |

## Por qué importa

1. **Explica el bug #2 de CI de Fase 7** (`docs/scheduler/fase_7/scheduler-fase-7-verificacion.md`
   §3): `staff.is_schedulable`/`is_active` no existían en el shim local de pruebas
   (`00-shim-supabase.sql`), y el comentario de C2 ("columna fantasma: ninguna migración la crea,
   pero `types.ts` ya la trae") nunca tuvo explicación hasta ahora.
2. **Ningún gate de paridad de fingerprint contra un proyecto cloud real puede dar limpio** sin
   excluir explícitamente estos objetos — Ruta A (replay puro de migraciones) nunca los va a
   producir. Cualquier diff de políticas/grants/esquema contra "Test" o "Dev 2.0" debe descontarlos
   primero.
3. Explica por qué "Test" parecía un ambiente "contaminado" en Fase 7 (ver
   `docs/scheduler/fase_2/scheduler-fase-2-runbook-ruta-c.md` §0.1) — no era un misterio de
   despliegue, era esto.

## Lista de exclusión (para todo diff de fingerprint futuro)

Al comparar el esquema de Ruta A contra cualquier proyecto Supabase real (Lovable, "Dev 2.0",
"Test"), descontar antes de investigar cualquier diferencia:

```
-- tablas
public.staff_unavailability
public.engagement_staffing_requirements
public.resource_planning_audit_log

-- funciones
public.fn_effective_weekly_capacity
public.fn_staff_weekly_assigned_hours
public.seed_staffing_requirements_from_budget
public.fn_scheduler_audit_trigger

-- columnas
public.staff.target_utilization_percent
public.staff.skills
public.engagements.priority_level
public.engagements.total_budgeted_hours
public.engagements.is_recurring
public.engagements.prior_year_engagement_id
public.engagements.staffing_notes
```

(`staff.is_schedulable` **no** va en esta lista de "ruido a ignorar" — es una columna que el
Scheduler actual sí usa y sí necesita en el esquema canónico; no se excluye del diff, se adopta de
facto por la migración C2.)

## Decisión del operador (2026-08-06)

- **No se adopta al ledger** — no se escribe una migración declarativa que las cree "oficialmente".
- **No se borran** del Supabase real — ni de "Dev 2.0" ni de "Test" ni de Lovable.
- **Se documentan** (este archivo) para que la próxima persona que corra un gate de paridad no
  pierda tiempo re-investigando el origen.

## Abierto (no bloqueante)

El **mecanismo** por el que el prototipo llegó a "Test" y a "Dev 2.0" — más allá de Lovable — sigue
sin explicación. El operador confirmó no tener registro de haberlo aplicado ahí directamente. No
bloquea ningún gate; se deja como curiosidad histórica.

También sigue sin explicación el drift de `fund_request_work_orders.fr_wo_select` y
`fund_requests.fr_select_manager`, detectado en el mismo relevamiento de Fase 7 — no aparece en
ninguna rama remota buscada (~130 ramas). No relacionado con Scheduler v1.
