# Fase 2 del Scheduler — Esquema canónico

> Fuente: `bugs/scheduler/fase_2/plan_v2.md` (plan de referencia, gitignored — sólo local) +
> `docs/scheduler/fase_2/scheduler-fase-2-verificacion.md` (evidencia de ejecución). Este documento
> es la referencia **final** del esquema, la matriz de autorización y el contrato de las 2 RPC del
> Scheduler, después de C1-C4. No repite el proceso de investigación (hallazgos G1-G10, bugs
> encontrados en vivo) — eso vive en `scheduler-fase-2-verificacion.md`; acá sólo el resultado.

## 1. Tablas propias del Scheduler

| Tabla | Origen | Notas |
|---|---|---|
| `wo_staffing_requirements` | `20260506120000` (histórica) | `wo_id` → `work_orders`, `category_id` → `categories`, `staff_count` 1-999. `UNIQUE(wo_id, category_id)` |
| `wo_staffing_requirement_skills` | `20260506120000` (histórica) | `requirement_id` → `wo_staffing_requirements`, `skill_id` → `skills`, `min_proficiency_level` ∈ {Beginner, Intermediate, Advanced}. `UNIQUE(requirement_id, skill_id)` |
| `engagement_assignments` | `20260716120000` Phase 3 + `20260717233000` D5 + `20260720120000`/`20260720194653` corrective (histórica) | `category_id` NOT NULL (backfillado desde `staff.category_id`), soft-delete (`deleted_at`), `status` default `'PROPOSED'` |

Columnas de convergencia agregadas por C2:

| Tabla | Columna | Tipo | Default |
|---|---|---|---|
| `staff` | `is_schedulable` | boolean NOT NULL | `true` |

## 2. Helpers de autorización

| Helper | Origen | Semántica |
|---|---|---|
| `get_my_staff_id()` | compartido, `20260107032620` | `staff_id` del `auth.uid()` actual |
| `is_admin()` | compartido | rol `admin` |
| `has_role(uuid, app_role)` | compartido | rol exacto |
| `is_engagement_team_member(uuid)` | compartido | `manager_id` o `partner_id` del engagement |
| `has_firmwide_assignment_visibility()` | D5, `20260717233000` | rol ∈ {admin, partner, director} |
| `has_assignment_on_engagement(uuid)` | D5 | tiene una fila propia, no borrada, en `engagement_assignments` de ese engagement |
| `can_read_engagement_assignments(uuid)` | D5 | disyunción exacta de las 3 políticas SELECT de `engagement_assignments` (firmwide / manager+team / senior+assignment) — invariante que Phase 5 depende de no romper |
| **`is_engagement_responsible(uuid)`** | **C1** | `get_my_staff_id()` ∈ {`manager_id`, `partner_id`, `sqr_id`, `encargado_id`, `specialist_it_id`, `specialist_tax_id`} del engagement |
| **`engagement_accepts_assignment_writes(uuid)`** | **C2** | `engagement_state_override NOT IN (6,7,9)` (o `true` si el override es NULL o el engagement no existe) — 6 Cancelado, 7 Finalizado, 9 Congelado son los únicos estados terminales; 1-5/8 son derivados de la OT y siempre aceptan escritura |
| **`resolve_wo_engagement_id(uuid)`** | **C1** | `work_orders.engagement_id` dado un `wo_id` — nunca inline en una política (ver nota abajo) |
| **`resolve_wo_req_skill_engagement_id(uuid)`** | **C1** | igual, resolviendo el join de 2 saltos `wo_staffing_requirement_skills → wo_staffing_requirements → work_orders` dado un `requirement_id` |

> 🔴 **Regla de diseño, no opcional:** cualquier política RLS que necesite resolver un dato estructural
> a través de OTRA tabla (p. ej. "¿qué engagement es este work order?") debe hacerlo vía un helper
> `SECURITY DEFINER`, nunca con una subconsulta escrita directo en el `USING`/`WITH CHECK`. Una
> subconsulta inline corre con los permisos del rol que consulta — sujeta a la RLS de esa OTRA tabla,
> no a la de la tabla que la política protege. `resolve_wo_engagement_id`/
> `resolve_wo_req_skill_engagement_id` existen porque la primera versión de C1 violaba esta regla:
> funcionaba en cualquier entorno donde `work_orders` no tuviera RLS restrictiva (el shim de pruebas, y
> aparentemente Ruta A/B/C contra Docker), pero se rompía en un Supabase real donde otra rama
> (`feat/roles-permisos`, Fase 4) ya había reescrito la RLS de `work_orders` con un modelo que no conoce
> "responsable". Ver `scheduler-fase-2-verificacion.md`, sección "Ejecución en Dev 2.0".

## 3. Matriz RLS canónica

Firmwide = admin, partner, director (`has_firmwide_assignment_visibility`). Responsable = manager_id, partner_id,
sqr_id, encargado_id, specialist_it_id, specialist_tax_id (`is_engagement_responsible`, nuevo en C1).

| Rol | SELECT `engagement_assignments` | Escritura `engagement_assignments` | SELECT `wo_staffing_requirements`* |
|---|---|---|---|
| admin | todo | todo | todo |
| partner / director | todo (firmwide) | si responsable | todo |
| manager | si `is_engagement_team_member` | si responsable | si autorizado en ese engagement |
| senior | si tiene asignación propia | no | si tiene asignación |
| sqr / specialist_it / specialist_tax | **vía `is_engagement_responsible`** | **si responsable** | si responsable |
| semisenior / staff / viewer | ninguno | no | ninguno |
| anon | denegado | denegado | denegado |
| service_role | bypassa RLS por diseño; EXECUTE revocado en los 4 helpers/RPC nuevos | — | — |

`*wo_staffing_requirements`/`wo_staffing_requirement_skills` — política canónica (C1, cierra G2, las 2
`USING (true)` históricas):

- **SELECT**: `is_admin() OR has_firmwide_assignment_visibility() OR is_engagement_team_member(engagement_id) OR is_engagement_responsible(engagement_id) OR has_assignment_on_engagement(engagement_id)`
- **INSERT/UPDATE/DELETE** (explícitas, no `FOR ALL`): `is_admin() OR is_engagement_team_member(engagement_id) OR is_engagement_responsible(engagement_id)` — nótese que `has_assignment_on_engagement` da SELECT pero **no** escritura; es una asimetría deliberada, verificada en `supabase/tests/rls-wo-staffing-requirements.sql`.

`wo_staffing_requirement_skills` resuelve el `engagement_id` con un join de 2 saltos
(`requirement_id → wo_staffing_requirements → work_orders → engagement_id`); misma matriz.

### `engagement_assignments` — políticas D5 + extensión C1 §3b

- **SELECT**: `ea_select_firmwide` (firmwide) OR `ea_select_lead` (rol manager + team member) OR
  `ea_select_assigned` (rol senior + asignación propia) OR **`ea_select_responsible`** (nueva en C1,
  vía `is_engagement_responsible`, sin gate de rol — es un hecho estructural)
- **INSERT/UPDATE/DELETE**: `(is_engagement_team_member(engagement_id) OR is_engagement_responsible(engagement_id))
  AND (can_read_engagement_assignments(engagement_id) OR is_engagement_responsible(engagement_id))`

> 🟢 El segundo conjunto (`OR is_engagement_responsible(...)`) fue un fix encontrado y aplicado en
> vivo el 2026-07-30, escribiendo `rls-wo-staffing-requirements.sql`: la primera versión de C1 dejaba
> el `AND can_read_engagement_assignments(...)` sin tocar, y ese helper no conoce
> `is_engagement_responsible` — la extensión de escritura para sqr/encargado/specialist_it/
> specialist_tax era código muerto. Detalle completo en
> `docs/scheduler/fase_2/scheduler-fase-2-verificacion.md`.

## 4. Triggers de service-scope (backstop, C2)

Calcados de `enforce_worksheet_cell_service_scope` (`20260719000000`): `RETURN NEW` si
`engagements.practica IS NULL` (engagement legado sin servicio, sin scope); `RAISE EXCEPTION` si la
categoría no pertenece al servicio del engagement.

| Trigger | Tabla | Resuelve el engagement vía |
|---|---|---|
| `trg_enforce_wo_staffing_service_scope` | `wo_staffing_requirements` | `work_orders.engagement_id` |
| `trg_enforce_assignment_service_scope` | `engagement_assignments` | columna propia `engagement_id` |

Defensa en profundidad: las 2 RPC (§5) validan la misma regla explícitamente antes de escribir; los
triggers son el backstop para cualquier escritura DML directa que la RLS permita (issue §8 exige que
el DML directo siga funcionando, no sólo las RPC).

## 5. Contrato de las 2 RPC

Ambas `SECURITY DEFINER`, `EXECUTE` revocado de PUBLIC/anon/service_role, concedido sólo a
`authenticated`. Ambas validan **todo** el payload antes de escribir ninguna fila (todo-o-nada).

### `save_wo_staffing(p_wo_id uuid, p_requirements jsonb) RETURNS jsonb`

Autorización: `is_admin() OR is_engagement_team_member(engagement_id) OR is_engagement_responsible(engagement_id)`.
Sólo el Work Order en estado `Draft` es editable (`Pending_Approval`/`Approved`/`Rejected` bloqueados —
espeja `WorkOrderEdit.tsx`). Contrato de estado completo: cualquier categoría/skill persistida que NO
aparezca en el payload se borra.

| Token | Condición |
|---|---|
| `WOS_WO_NOT_FOUND` | `p_wo_id` no existe |
| `WOS_DENIED` | caller sin autorización (`ERRCODE = insufficient_privilege`) |
| `WOS_WO_LOCKED` | `approval_status <> 'Draft'` |
| `WOS_REQUIREMENT_DUPLICATE` | `category_id` repetido en el payload |
| `WOS_SKILL_DUPLICATE` | `skill_id` repetido dentro de una misma categoría |
| `WOS_STAFF_COUNT_RANGE` | `staff_count` fuera de `[1, 999]` |
| `WOS_PROFICIENCY_INVALID` | `min_proficiency_level` fuera de `{Beginner, Intermediate, Advanced}` |
| `WOS_CATEGORY_FOREIGN_SERVICE` | la categoría no pertenece al servicio del engagement (omitido si `practica IS NULL`) |

### `save_engagement_assignments(p_engagement_id uuid, p_upserts jsonb, p_deleted_ids uuid[]) RETURNS jsonb`

Autorización: `is_admin() OR is_engagement_responsible(engagement_id)` (incluye manager/partner por
construcción de `is_engagement_responsible`). Diff explícito — el borrado nunca se infiere de la
ausencia; `p_deleted_ids` es soft-delete (`deleted_at = now()`). `status` nunca se escribe (gobierna el
DEFAULT `'PROPOSED'` de la BD); `created_by` tampoco.

| Token | Condición |
|---|---|
| `EAS_ENGAGEMENT_NOT_FOUND` | `p_engagement_id` no existe |
| `EAS_DENIED` | caller sin autorización (`ERRCODE = insufficient_privilege`) |
| `EAS_ENGAGEMENT_LOCKED` | `engagement_state_override ∈ {6,7,9}` |
| `EAS_MISSING_FIELD` | falta un campo obligatorio en una fila del payload |
| `EAS_DATE_RANGE` | `end_date < start_date` (mismo día es válido) |
| `EAS_ENGAGEMENT_RANGE` | el segmento cae fuera del rango inclusivo del engagement (Fase 5 O4; sin cota si el engagement no tiene fechas) |
| `EAS_HOURS_RANGE` | `hours_per_week` fuera de `(0, 80]` |
| `EAS_ALLOCATION_RANGE` | `allocation_percent` fuera de `(0, 100]` |
| `EAS_CATEGORY_FOREIGN_SERVICE` | la categoría no pertenece al servicio del engagement |
| `EAS_STAFF_INELIGIBLE` | staff inactivo/no-schedulable en un insert nuevo o al reasignar la fila a un staff distinto del histórico (Fase 5 O7); una fila que conserva su staff_id histórico está exenta |
| `EAS_OVERLAP` | dos asignaciones del mismo staff en el mismo engagement con rango de fechas superpuesto (inclusivo), contra lo ya persistido o dentro del propio payload |

*(11 tokens en total — corregido en Fase 7 tras verificar contra la migración; el contrato previo listaba 9.)*

Overlap: verificado **después** de aplicar soft-delete → update → insert, sobre el estado final
persistido — si dispara, revierte toda la transacción (incluidas las filas que sí eran válidas).

## 6. Evidencia de convergencia (gate de paridad)

Criterio de aceptación central de `plan_v2.md`: el esquema resultante debe ser idéntico sin importar
el orden de instalación (Ruta A: todo en orden cronológico; Ruta B: `development` completo primero,
scheduler después, fuera de orden; Ruta C: scheduler primero, `development` después — el escenario
real de cómo llegó a producción).

| Comparación | Resultado | Evidencia |
|---|---|---|
| Ruta A ↔ Ruta B (pre-convergencia) | Idénticas (schema/catálogo/policies/grants), descontando ruido de `pg_dump` | `scheduler-fase-2-verificacion.md`, "Ruta B recapturada" |
| Ruta A ↔ Ruta C (pre-convergencia) | Diverge únicamente en `vw_staffing_alerts` (G1, esperado — la vista de `development` queda sin `security_invoker` y con grants abiertos cuando se crea después de las históricas del scheduler) | `scheduler-fase-2-verificacion.md`, "Ruta C — corrida completa" |
| Ruta A ↔ Ruta C (post-C1-C4) | **Idénticas** — el fix de C1 (`security_invoker` + revoke de `anon`/`authenticated` en `vw_staffing_alerts`) cierra la única divergencia | `scheduler-fase-2-verificacion.md`, "C1-C4 — escritas, corregidas en vivo..." |

Todo lo anterior se corrió con el CLI real de Supabase contra Docker local (`EMS_Dev_Local`), no
contra el Supabase de prueba oficial (bloqueado por Q7, ver `plan_v2.md`). Las 4 pruebas SQL nuevas
(`rls-wo-staffing-requirements.sql`, `rpc-save-wo-staffing.sql`, `rpc-save-engagement-assignments.sql`,
`schema-convergence-assertions.sql`) verifican la matriz de este documento de forma automatizada,
corriendo contra un shim rápido (`supabase/tests/local/30-shim-service-scope.sql`) en
`supabase/tests/local/run-rls-tests.sh` (Lane 4) y en CI
(`.github/workflows/scheduler-fase2-integrity.yml`).

## 7. Fuera de alcance de Fase 2 (decisiones diferidas)

- Revocar DML directo (RPC-only) — Q3 de `plan_v2.md`, queda como endurecimiento de una fase posterior.
- `engagement_assignments.status` por defecto `PROPOSED` vs `CONFIRMED` — Q1, decisión de negocio.
- Bounds de `hours_per_week` alineados al issue `(0,80]` vs el drift del cliente (`>= 1`) — Q6.
- Reescribir las Edge Functions del scheduler (status `'active'` hardcodeado) — Fase 3.
