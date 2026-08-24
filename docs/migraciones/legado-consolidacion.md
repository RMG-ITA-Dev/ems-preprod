# Legado de la consolidación — migración cero

> Documento vivo, iniciado en Fase 1 (PR-1) y completado en Fase 2 (PR-2) de
> `bugs/migracion_cero/plan_v2.md`. Registra todo lo que el set consolidado de
> `supabase/migrations/*_cero_*.sql` no puede expresar por sí solo — la evidencia de que
> nada se perdió al reemplazar las 184 migraciones originales por el set consolidado.

## -1. HALLAZGO CRÍTICO — catálogo RBAC ausente del alcance de seed de Fase 4

**Resuelto por el operador (2026-08-23): SÍ se agrega a Fase 4** como
`cero_13_seed_authorization_rbac.sql`, con el mismo contenido íntegro que
`20260724010000_authz_fase2_seed.sql` (igual al fixture ya usado en el harness de CI,
`supabase/tests/local/40-fixture-rbac-catalog.sql`). **Escrito (PR-4,
`supabase/migrations/20251204001004_cero_13_seed_authorization_rbac.sql`)** — el hallazgo
original queda documentado abajo tal como se descubrió.
**Reordenado (2026-08-23, primer replay [EXEC]):** originalmente escrito como el último seed
(`cero_16`), pero `handle_new_user()` inserta `user_roles.role_key='admin'` con FK a
`authorization_roles.role_key` — sin el catálogo RBAC ya poblado, el INSERT en `auth.users` del
bootstrap admin revienta esa FK. El catálogo RBAC pasó a `cero_13` (antes del bootstrap, ahora
`cero_14`); holidays y global_settings corrieron un número: `cero_15`/`cero_16`.

El catálogo de autorización
(`authorization_roles` — 23 roles, `authorization_permissions` — 84 permisos,
`authorization_role_permissions` — 737 concesiones) fue sembrado en el historial original
como **datos**, en la migración `20260724010000_authz_fase2_seed.sql` (más el backfill de
`user_roles.role_key`). Es correcto que la migración cero no lo haya arrastrado como
migración de esquema — es dato, no DDL, igual que cualquier otro seed — pero **`plan_v2.md`
§4.2 tampoco lo incluye en la lista de archivos de seed de Fase 4** (`cero_10`..`cero_15`).

Sin este catálogo poblado, en cualquier ambiente reseteado desde el set consolidado:
`has_permission()`, `has_firmwide_assignment_visibility()`, `get_timesheet_approvers()` y
`get_engagement_team_candidates()` quedan **permanentemente rotas** (el catálogo de
permisos está vacío, ninguna concesión existe). Esto se descubrió recién al ejercitar el
harness RLS reescrito (§2.5.b) contra el esquema real completo — el harness anterior nunca
lo necesitó porque sus shims mínimos no llegaban a esa profundidad.

**Mitigación aplicada solo para el harness de CI** (no para Fase 4): se copió el contenido
íntegro de `20260724010000_authz_fase2_seed.sql` a
`supabase/tests/local/40-fixture-rbac-catalog.sql`, y `run-rls-tests.sh` lo aplica una sola
vez antes de correr las suites de aserciones. **Esto no sustituye la decisión pendiente**:
Fase 4 necesita su propio archivo de seed para este catálogo (p.ej.
`cero_16_seed_authorization_rbac.sql`), con el mismo contenido u otro que el operador
confirme, antes de poder considerar completo el reset de Test.

## 0. Hallazgos de autoría durante el armado del set consolidado (Fase 2.1)

- **`SET check_function_bodies = false;` / `SET row_security = off;`**: pg_dump los antepone a
  todo dump de esquema; sin ellos, funciones `LANGUAGE sql` que referencian otra función creada
  más adelante en el mismo archivo (p.ej. `can_approve_wo_risk()` → `is_admin()`, orden real de
  `dump_full_baseline.sql`) fallan con `function ... does not exist` al aplicar. Se agregan al
  inicio de cada archivo `_cero_*` que crea objetos.
- **`ALTER DEFAULT PRIVILEGES ... IN SCHEMA public` (6 sentencias, roles `postgres` y
  `supabase_admin`)**: presentes en `dump_full_baseline.sql` pero NO creadas por ninguna de las
  184 migraciones — son parte del bootstrap de plataforma del esquema `public` (igual que el
  esquema mismo). Aplicarlas como el rol `postgres` que corre las migraciones falla con
  `permission denied to change default privileges` para las de `FOR ROLE supabase_admin`. Se
  eliminaron de `cero_06_grants.sql`; no hacen falta porque ya existen antes de que corra
  cualquier migración de la app.
- **`ALTER DEFAULT PRIVILEGES ... IN SCHEMA cron`**: a diferencia del caso anterior, esta SÍ es
  delta real (ausente del stack vanilla sin migraciones, presente tras el replay de las 184) —
  la instala automáticamente Postgres/Supabase como efecto colateral de
  `CREATE EXTENSION pg_cron` (`cero_01`). No requiere ninguna sentencia explícita propia; se
  reproduce sola en cualquier replay que incluya esa extensión.
- **Metodología de separación auth/storage (§2.1-b)**: se capturó un dump "vanilla" de
  auth/storage/realtime/cron/extensions sobre un stack con CERO migraciones de la app
  (`bugs/migracion_cero/autoria/vanilla_platform_no_migrations.sql`) y se comparó contra el mismo
  recorte tomado del stack baseline_184
  (`bugs/migracion_cero/autoria/baseline184_platform_schemas.sql`). El diff
  (`bugs/migracion_cero/autoria/auth-storage-delta.diff`, 115 líneas) es exactamente lo que pasó a
  `cero_07_auth_storage.sql`: 3 triggers sobre `auth.users`, 7 policies sobre `storage.objects`, y
  el ALTER DEFAULT PRIVILEGES de `cron` ya explicado (sin acción). Sin este diff dirigido, una
  extracción ingenua del dump completo habría intentado recrear infraestructura de plataforma que
  ya existe antes de cualquier migración (tablas core de `auth.*`/`storage.*`, `realtime.*`,
  funciones de `extensions.*`).

## 1. Operaciones sobre datos no capturables por dump (`DISABLE TRIGGER`)

Verificado por grep sobre el árbol pre-borrado de 184 migraciones (`git show 0ca06e3c`): exactamente
2 archivos, ambos backfills puntuales sobre datos operativos que no existen en una base nueva.

1. `20260218023625_ee35a838-e97e-4356-8de2-7d4986d8d114.sql` (Bug 0213-31) deshabilita
   `trg_validate_timer_duration` en `timer_entries` y `trg_protect_approved_time_entries` en
   `time_entries` para capar entradas de más de 8h ya cargadas, sin que los triggers de validación
   bloqueen el UPDATE de corrección; las reactiva al final. No aplica a una base nueva: no hay
   filas de `time_entries`/`timer_entries` que corregir (el seed de Fase 4 no siembra ninguna).
2. `20260813120000_0714-155_add_firma_to_engagements.sql` deshabilita
   `update_engagements_updated_at` en `engagements` mientras corre un backfill de `society_id`
   (encargos cuyo cliente es la propia sociedad autofacturándose) y un default histórico, para que
   el backfill no pise el `updated_at` real de cada fila. No aplica a una base nueva: el propio DO
   block detecta `engagements` vacía y sale sin hacer nada (mismo criterio que el seed sin datos
   demo).

Ninguna de las dos deja lógica de negocio permanente: son operaciones de una sola vez sobre datos
preexistentes en Dev 2.0, ya ejecutadas ahí. El set consolidado no las reproduce.

## 2. Validaciones fail-fast (`DO $$ ... RAISE EXCEPTION`)

Enumeradas filtrando bloques `DO $$` reales de excepciones dentro de cuerpos de función (que solo
se disparan en runtime, no al aplicar la migración): 11 archivos sobre el árbol pre-borrado.

| Migración | Invariante que valida | Vigencia en el set consolidado |
|---|---|---|
| `20260217233439` | La fila ADM existe antes del upsert self-healing | No aplica — la migración entera (upsert self-healing de ADM) no pasa al set (informe §5); ADM se siembra una sola vez con `is_system=true` en Fase 4 |
| `20260224065444` | Idempotencia de una migración de backup vía `migration_run_log` | No aplica — mecanismo de rollout de un historial que ya no existe |
| `20260224065512` | Existen las categorías en español esperadas (Socio/Gerente/...) | Resuelto por diseño: el seed de Fase 4 las siembra directamente (gap 1 de §3.2 del informe, cerrado) |
| `20260224065539` | Sin roles duplicados por usuario; existe al menos un admin; ninguna categoría con `default_app_role` NULL | Duplicados: los impide la PK/UNIQUE de `user_roles`. Admin: lo garantiza el trigger `handle_new_user` sobre el bootstrap (§4.2.1 del plan). `default_app_role` NULL: la columna es nullable en el esquema (sin `NOT NULL`) — este fail-fast era una validación puntual de un momento del historial, no una invariante estructural permanente. Pero el seed de Fase 4 sí termina satisfaciéndolo en la práctica: el operador cerró el mapeo por nombre de categoría (`practicas.md`, columna "Rol por Defecto") para las 61 filas — 61/61 con rol, cero NULL |
| `20260716120000`, `20260720120000`, `20260720194653` (3 variantes del mismo guard) | `engagement_assignments.category_id` sin NULLs antes de aplicar NOT NULL | Estructural: la columna ya nace NOT NULL en el set consolidado; sin datos preexistentes no hay NULLs que backfillear |
| `20260727110000` | El default de `engagement_assignments.status` no derivó de 'PROPOSED' | Detector de drift entre migraciones, no un invariante de negocio permanente — el default final queda fijo directamente en el CREATE TABLE consolidado |
| `20260818120000` | `activity_codes.service_id` sin NULLs antes de aplicar NOT NULL | Superado por el diseño `is_system` (plan §2.2.1): la constraint final ya no es un NOT NULL simple, es `CHECK (is_system OR service_id IS NOT NULL)` — permite exactamente la única fila que antes hubiera hecho fallar este guard (ADM) |

Ningún invariante de negocio permanente se perdió: los que sobreviven ya están expresados como
NOT NULL/CHECK/UNIQUE en el esquema final, o quedaron resueltos por decisiones de diseño ya
documentadas en el informe y el plan.

## 3. Cadena del incidente ADM

Resumen de §5 del informe de consolidación, con la semántica nueva de `is_system` ya aplicada:

1. `20251204045534` (seed original) siembra 8 códigos de actividad legacy sin `service_id`
   (PLN, FLD, REV, DOC, ADM, MTG, TRV, TRN — la columna no existía todavía).
2. `20260217233439` crea `enforce_activity_default()` y un upsert self-healing de ADM que asume
   unicidad global de `activity_code`.
3. `20260629000000` agrega `service_id`/`entity_type` a `activity_codes` y las 4 RPCs de ABM con
   el esquema ordinal `{ABREV}-A{n}`.
4. `20260818120000` backfillea los 8 códigos legacy a Auditoría y aplica `service_id NOT NULL`
   (el guard fail-fast de la tabla de §2 de este documento).
5. `20260820120000` agrega guards por regex a las 4 RPCs para no tocar los 8 códigos legacy.
6. `purge_auditoria_legacy_activities.sql` (2026-08-17, ejecutado en Dev 2.0, fuera del árbol de
   migraciones) borra 17 filas — los 14 códigos `NNN-XXX` cargados a mano más ADM más 2 `AUD-AX`
   inactivos — sin saber que `global_settings.ADM_ACTIVITY_ID` seguía apuntando a la fila ADM.
   Incidente: el setting queda huérfano, sin ninguna protección estructural que lo hubiera evitado.

Rediseño aplicado en la consolidación (plan §2.2): ADM deja de ser un código de actividad
"colgado" de una práctica por convención — pasa a ser explícitamente
`is_system = true, service_id = NULL`, con un CHECK que hace estructuralmente imposible que
cualquier otra fila comparta esa combinación por accidente, y las 4 RPCs de ABM ya no pueden
tocarla (el JOIN con `services` que usan nunca matchea `service_id IS NULL`). El seed de Fase 4 la
siembra una única vez; ningún flujo de limpieza de catálogo por práctica puede volver a borrarla
sin querer, porque no pertenece a ninguna práctica que se pueda limpiar.

## 4. Drift positivo capturado de Dev 2.0 (ausente de las 184 migraciones)

`staff.target_utilization_percent numeric NOT NULL DEFAULT 85` — evidencia completa en
`bugs/migracion_cero/autoria/staff-capacidad-utilizacion.md` (gitignored) y hunk aceptado en
`docs/migraciones/DIFF-INTENCIONAL-consolidacion.md` §1. Existe en Dev 2.0 real y en `types.ts`,
pero ninguna de las 184 migraciones la crea — el replay local nunca pudo capturarla porque nunca
estuvo en el historial de migraciones, solo se cargó directamente en Dev 2.0 en algún momento no
versionado. Se incorpora explícitamente en `cero_02_functions_tables_views.sql` como diferencia
intencional de consolidación, no como dato inventado.

## 4bis. `global_settings` — reconciliación fila por fila (plan §2.4, punto de captura §0.5.2)

Reconciliación ejecutada sobre el stack local baseline: 20 filas reales vs. las 14 documentadas en
`datos_maestros.md` (detalle completo en `bugs/migracion_cero/autoria/global-settings-reconciliation.md`,
gitignored). Las 14 coinciden exactamente.

**Lista cerrada de las 6 claves extra — decisión del operador (2026-08-23)**, tras verificar por
grep qué consume cada una en `src/`/`supabase/functions/`:

| Clave | Valor | Consumidor real | Decisión |
|---|---|---|---|
| `AUTH_MAX_FAILED_ATTEMPTS` | `5` | `record_failed_login()` (con fallback a 5) | **Se siembra** |
| `TS_WORK_DAYS` | `5` | `useTimesheetPolicies.ts` (con fallback) | **Se siembra** |
| `TS_AUTO_SAVE_SECONDS` | `3` | `useTimesheetPolicies.ts` (con fallback) | **Se siembra** |
| `DAILY_LIMIT` | `10` | Ninguno — duplica `DAILY_MAX=10`, ya sembrada | **Se descarta** (legacy) |
| `WEEKLY_LIMIT` | `50` | Ninguno — duplica `WEEKLY_MAX=50`, ya sembrada | **Se descarta** (legacy) |
| `reporting_periods` | JSON (calendario + fiscal Bolivia) | Ninguno | **Se descarta** (legacy) |

Las 3 que se siembran ya tienen fallback hardcodeado en el código si la clave faltara; se siembran
igual para que la configuración quede explícita en vez de depender de un default implícito, igual
criterio que el resto de las claves documentadas.

**Corrección (hallazgo de review de PR #310, 2026-08-24):** esta reconciliación se hizo contra el
replay local de las 184 migraciones + preseed (§1.6.c), no contra Dev 2.0 real — igual que
`staff.target_utilization_percent` (§4), hay estado que solo existe en un ambiente real y nunca
quedó versionado en ninguna migración ni en el preseed. `LANGUAGE` y `ALLOW_WEEKEND_TRACKING` son
exactamente ese caso: no aparecían en las 20 filas de este documento porque tampoco existían en el
replay local, pero `Settings.handleSaveSettings` (`src/pages/Settings.tsx`) las escribe siempre
con una mutación `update`-only (`useUpdateGlobalSetting`) — sin la fila, cualquier guardado de
Configuración fallaba en cuanto llegaba a la primera de las dos, silenciosamente (el `catch` de
`handleSaveSettings` traga el error). Se agregan a la lista cerrada con el mismo default que ya
usa el código como fallback (`LANGUAGE='en'`, `ALLOW_WEEKEND_TRACKING='false'`).
`cero_16_seed_global_settings.sql` (Fase 4) usa esta tabla como lista final — 14 claves de
`datos_maestros.md` + las 3 de arriba + estas 2 = **19 claves sembradas**.

## 4ter. Reescritura del harness RLS (plan §2.5.b) — drift de seguridad encontrado y corregido

Las 4 lanes anteriores (rollout histórico, drift, failure-path, shim de servicio del
Scheduler Fase 2) se retiraron; el harness ahora aplica el set consolidado UNA vez
(`00-shim-auth.sql` + `cero_01`..`cero_06`, más el catálogo RBAC de §-1) sobre una base
scratch y corre las 8 suites de aserciones existentes (`rls-*.sql`, `rpc-*.sql`,
`schema-convergence-assertions.sql`, `trigger-engagement-creator-team.sql`). Es la primera
vez que estas suites corren contra el esquema real completo — antes usaban shims mínimos
que nunca llegaban a ejercitar ciertas políticas. Eso destapó dos discrepancias reales entre
lo que los tests asumían y el sistema actual, ambas corregidas actualizando las aserciones
(nunca el esquema) tras confirmar contra las políticas/funciones reales:

- **`rls-engagement-assignments-d5.sql`** — la persona "Sofia" (senior, `manager_id`
  estructural de un encargo sin asignación) se diseñó para probar que la adjacencia
  estructural sin rol no otorga acceso (PR #222 finding 2). Una política posterior real,
  `ea_select_responsible` / `is_engagement_responsible()`, sí le concede acceso legítimo por
  ser personal responsable (una de 6 columnas: manager_id/partner_id/sqr_id/encargado_id/
  specialist_it_id/specialist_tax_id) — ya no es una brecha, es una concesión nombrada y
  acotada, cubierta además por `schema-convergence-assertions.sql` (G7). Se actualizó la
  aserción de Sofia a "ve exactamente su encargo responsable, nada más", y el escenario de
  escalación original se reconstruyó con Ximena (sin ningún vínculo con el encargo) para
  seguir probando el vector real que finding-2 cerraba.
- **`vw_staffing_alerts`** — el mismo archivo asumía denegación dura a `authenticated`
  (PR #222 finding 1). Una migración posterior restauró el grant a `authenticated` con
  `security_invoker=true` (ya verificado explícitamente por `schema-convergence-assertions.sql`),
  dejando que el filtrado ocurra por las RLS del caller en vez de por ausencia de grant. Se
  actualizó la aserción para esa vista específica; `anon` sigue denegado sin cambios.
- **`get_timesheet_approvers()`** ya no lee `categories.can_approve_timesheets` (el diseño
  que `rls-timesheet-authorization-phase5.sql` asumía) — resuelve vía el catálogo RBAC real
  (`authorization_role_permissions.permission_key = 'timesheet_approval.approve'`). La
  persona "Pola" (aprobadora estructural con rol legacy 'staff') se ajustó para reflejar la
  distinción real entre el enum legacy `role` (la strandea de `has_role()`) y `role_key`
  (de donde cuelga la concesión real). La persona "Lidia" ("líder descalificado") pasó a
  `role_key = NULL` — con el catálogo real, todo `role_key='manager'` tiene el permiso sin
  distinción de categoría, así que la única forma de reproducir "rol manager pero
  descalificado" es no tener `role_key` resuelto (estado real, contemplado por el propio
  backfill de `20260724010000`).
- **`role_key = 'staff'` no existe en el catálogo real** — el enum legacy `role='staff'`
  mapea a `role_key='assistant'` (backfill de `20260724010000`). Los fixtures que
  necesitaban un persona "sin privilegios especiales" se ajustaron a `role_key='assistant'`
  donde importaba (o se dejó `NULL` donde la ausencia de concesión era el punto, como
  Lidia).

Ninguno de estos cambios tocó una política, función o grant del esquema — son correcciones
a aserciones de test que habían quedado desactualizadas frente a decisiones de diseño
posteriores al momento en que se escribieron, nunca antes detectadas porque el harness
anterior no las ejercitaba.

## 5. Nota de estructura de archivos (ajuste de corte, plan §2.1)

El plan ilustraba 8 archivos (extensiones/enums, funciones auxiliares, tablas, vistas,
funciones/triggers, RLS, grants, auth/storage). El corte real terminó en 7, porque pg_dump
interfolia funciones y tablas por dependencia real — ejemplo: `create_engagement_with_code()`
referencia la tabla `engagements` creada poco antes, pero `activity_codes` (tabla) se crea mucho
después de esa misma función en el mismo dump. Separar "funciones" de "tablas" en archivos
distintos habría roto ese orden topológico sin reordenar todo a mano — exactamente el modo de
fallar que el informe (§2) advertía evitar releyendo migraciones en vez de confiar en pg_dump. El
plan mismo autoriza este ajuste ("el corte exacto entre archivos puede ajustarse si una
dependencia lo exige"). Estructura final:

- `cero_01_extensions_enums.sql` — extensión `pg_cron` + enum types + la secuencia
  `fund_request_number_seq`.
- `cero_02_functions_tables_views.sql` — funciones, tablas y vistas interfoliadas en el orden real
  de pg_dump (incluye los 5 cambios deliberados de §2.2 del plan).
- `cero_03_constraints_indexes.sql` — constraints (PK/UNIQUE/CHECK) + índices + la regla `_RETURN`
  de `work_order_summary`.
- `cero_04_triggers_fks.sql` — triggers + foreign keys.
- `cero_05_rls_policies.sql` — ENABLE ROW LEVEL SECURITY + policies.
- `cero_06_grants.sql` — grants de tabla/columna/rutina, incluida la corrección de privilegios
  heredados del bootstrap de plataforma (`DIFF-INTENCIONAL-consolidacion.md` §3).
- `cero_07_auth_storage.sql` — estado neto de auth.*/storage.* (triggers sobre `auth.users`,
  policies de `storage.objects`, filas de `storage.buckets`).
