# Fase 7 — Protocolo de verificación, evidencia y limitaciones conocidas

> Fuente: `bugs/scheduler/fase_7/plan_v2.md`, sección "Verification Steps" (10 gates G0–G10).
> Este documento registra el protocolo **tal como se ejecutó** en esta sesión de implementación
> (rama `dev-scheduler-fase_7`, base `dev-scheduler`), qué corrió en R-APP (este repo) y qué queda
> pendiente de R-LOCAL/R-INT o de un browser real — nunca se fabrica un resultado que no se midió.

## Alcance de esta ejecución

Regla vigente del proyecto: **jamás correr Supabase/migraciones desde R-APP**
(`aurora-engage-pro-908f8234`) — se respetó en todo momento. G0–G2 corrieron en R-APP; G3/G4 corrieron
con autorización explícita del operador contra **R-LOCAL** (`EMS_Dev_Local`, Docker), en una sesión de
pair-debugging que además encontró y corrigió 4 bugs preexistentes de la CI (ver §3). G5–G9 siguen
siendo del operador humano (R-INT, "Test", o requieren browser real) — no se simularon.

| Gate | Estado |
|---|---|
| G0 — Higiene de rama y alcance | ✅ Ejecutado (R-APP), ver §1 |
| G0.5 — Sync de repos hermanos | ✅ `EMS_Dev_Local` sincronizado con `git pull` durante la sesión |
| G1 — Línea base en `development` | ⏳ Parcial — el baseline de `tsc`/lint/vitest se conoce de sesiones previas (183/0-errores-2-warnings/verde); no se re-capturó con worktree en esta sesión |
| G2 — Calidad frontend | ✅ Ejecutado (R-APP), ver §2 |
| G3a — Ruta A↔C vía CI | ✅ **Verde de punta a punta** (primera vez desde el 30 de julio) tras 4 fixes de CI, ver §3 |
| G3b — Ruta A local | ✅ 143/143 migraciones, 0 pendientes, fingerprint capturado y commiteado en `EMS_Dev_Local` |
| G3c — Escenario de renames (Ruta B) | ✅ Resuelto — el mecanismo sintético del plan no es ejecutable (ver detalle en §3); el riesgo sustantivo ya estaba probado por la corrida real de Fase 2 ("Ruta B — cierre con el CLI real") |
| G4 — SQL/RLS/RPC + matriz §10 | ✅ Ejecutado contra un Postgres 16 aislado y descartable en R-LOCAL — **6/6 marcadores "ALL CHECKS PASSED"**, incluye los 3 fixtures nuevos del bloque H |
| G5 — Ruta C oficial contra "Test" | 🟡 **Re-etiquetado, no cerrado en aislamiento** — el ledger quedó reparado (143/143, 0 pendientes) con autorización explícita del operador, pero "Test" resultó tener contenido de `feat/roles-permisos` + 3 tablas de origen desconocido. Ver el hallazgo completo en `scheduler-fase-2-runbook-ruta-c.md` §0.1 y §5 abajo — la evidencia de hoy alimenta el merge conjunto, no un G5 aislado |
| G6 — Regenerar y verificar tipos | ⏳ Diferido — no tiene sentido regenerar tipos "limpios de dev-scheduler" desde un proyecto que ya no lo está; se retoma en el merge conjunto |
| G7 — Deploy de Edge Functions | ⏳ Pendiente (R-INT, solo operador humano) |
| G8 — Regresión funcional (browser) | ⏳ Pendiente (browser real contra R-INT) |
| G9 — Responsive/a11y/i18n visual | ⏳ Pendiente (browser real) |
| G10 — Evidencia/docs/CI/review/PR | 🟡 Parcial — docs, CI y evidencia de G3/G4 ya escritas; falta lo que depende de G5–G9 |

## §1. G0 — Higiene de rama y alcance (ejecutado, R-APP)

```
git status --porcelain              # cambios de esta sesión, ninguno ajeno
git rev-list --count development..HEAD   # 34
git rev-list --count HEAD..development   # 0
ls supabase/migrations | sed -E 's/^([0-9]{14})_.*/\1/' | sort | uniq -d   # vacío
ls supabase/migrations | wc -l            # 143
```

- **Marcadores de conflicto**: `git grep -n -E '^(<{7}|={7}|>{7})( |$)' -- src/ supabase/ docs/ .github/` → vacío.
- **`supabaseUntyped`**: único hit en el diff es el comentario que documenta que ese símbolo no existe (`useWorkOrderStaffingMutations.ts`).
- **Secretos**: `rg -inE "service_role|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]{10,}|lovable"` sobre el diff → solo menciones legítimas de la palabra "lovable" en prosa/documentación; cero tokens/keys reales. El preconnect preexistente a `ugqxfnrxvksiltwxzist` en `index.html` no aparece en el diff de esta sesión.
- **`coverage/`/`dist/` en el diff**: vacío. **Commits `wip`/`temp`/`fixup`**: ninguno (sin commits — esta sesión no commiteó nada, por instrucción explícita del operador).
- **Los 10 archivos que deben permanecer eliminados** (`.claude/scheduled_tasks.lock`, `ExpenseLogForm.tsx`, etc.): confirmados ausentes.
- **Referencias a Expenses fuera de `fund-requests`**: `rg "ExpenseLogForm|useExpenseLogMutations|ExpenseNew|ExpenseEdit|pages/Expenses" src` excluyendo `fund-request`/`FundRequestExpenses` → vacío.
- **`git diff --check`** con el pathspec acotado (excluye `LICENSES/`, fingerprints, vendor SVAR, tarballs): limpio tras corregir los 3 hits reales de `supabase/tests/local/20-shim-timesheet.sql` (G18).

## §2. G2 — Calidad frontend (ejecutado, R-APP)

| Comando | Resultado |
|---|---|
| `npm run lint` | **0 errores, 2 warnings** — idénticos al baseline preexistente (`GanttCanvas.tsx:81`, `MatchDot.tsx:22`, `react-refresh/only-export-components`) |
| `npx tsc -p tsconfig.app.json --noEmit` | **183 errores** — total sin cambios respecto al baseline; verificado archivo por archivo que ningún archivo tocado por esta fase introdujo un error nuevo (el único archivo tocado que aparece en el log, `src/hooks/useAuth.tsx`, tiene exactamente el mismo error preexistente de siempre, en una línea que esta fase no tocó — `reset_login_attempts` sin tipar en `types.ts`) |
| `npx vitest run` (suite completa) | **185/188 archivos, 2437/2442 tests en verde.** 5 fallos, los 5 en `src/lib/__tests__/workOrderPaymentPlan.test.ts` (4) y `src/components/forms/__tests__/WorkOrderPaymentPlanSection.test.tsx` (1) — ninguno de esos dos archivos aparece en el diff de esta sesión (`git diff --name-only development...HEAD`), y la firma del fallo (`isAlertDue`/`detectOverdue` comparando contra `new Date()`) coincide con el bug de zona horaria de payment-plan ya documentado en `bugs/scheduler/fase_5/review.md` (M6) — preexistente, no una regresión de Fase 7 |
| `npm run build` | ✅ Exitoso en 1m 1s. Chunks Scheduler: `SchedulerL1` 9.67 kB, `SchedulerL2` 30.92 kB, `SchedulerStaff` 13.27 kB, `SchedulerGaps` 23.50 kB (gzip todos < 10 kB); bundle principal `index-*.js` 1,032.13 kB / gzip 303.03 kB, con el mismo warning preexistente de Vite de 500 kB |
| `npm run verify:vendor` | ✅ PASS — las 3 capas (orígenes prohibidos, capability allowlist, integridad de la cadena de suministro/sha256) |

**Caveat de G1 (regla 2, por-set):** esta sesión no capturó un worktree de `development` para
confirmar que el set exacto de 5 fallos es idéntico allí — solo se confirmó que (a) los 2 archivos
afectados no fueron tocados por el diff de esta rama y (b) la firma del fallo coincide con el bug ya
documentado en una fase anterior. Queda pendiente que el operador (o G1 con worktree) confirme la
igualdad de sets exacta antes del PR final.

Los 9 archivos de test nuevos/actualizados de esta fase (`sessionRecovery.test.tsx`,
`SessionCacheGuard.test.tsx`, `schedulerFeature.test.ts`, `AppSidebar.schedulerFlag.test.tsx`,
`Auth.i18n.test.tsx`, `useAuth.test.tsx`, `i18n.parity.test.ts`, `i18n.auth.test.ts`,
`i18n.terminology.test.ts`) se corrieron aislados primero (96 casos, 96 verdes tras dos
correcciones — ver abajo) antes de lanzar la suite completa, para aislar cualquier fallo propio de
esta fase del ruido de una corrida de 180+ archivos.

**Dos fallos encontrados y corregidos durante esta verificación** (no defectos del plan, defectos
de los tests nuevos):

1. `AppSidebar.schedulerFlag.test.tsx` — `window.matchMedia is not a function`: jsdom no lo
   implementa y `useMobile.tsx` (usado por `SidebarProvider`) lo llama. Corregido agregando el
   mock estándar ya usado en otros tests del repo (`Settings.services.test.tsx` y otros).
2. `Auth.i18n.test.tsx` — `getByText("auth.signUp")` ambiguo: el mock `t = (k) => k` hace que el
   botón de toggle de modo y el link "¿no tienes cuenta?" compartan el mismo texto visible en modo
   sign-in. Corregido usando `getAllByText(...)[0]` (el toggle es el primero en el DOM).
3. `sessionRecovery.test.tsx` — `Cannot access 'getUser' before initialization`: `vi.mock()` se
   hoistea por encima de `const getUser = vi.fn()`, violando el patrón documentado de Vitest.
   Corregido con `vi.hoisted()`.

## §3. G3/G4 — Rutas de BD y RLS (ejecutado con autorización del operador, R-LOCAL vía CI + Docker)

Sesión de pair-debugging en vivo (2026-08-06) con el operador, usando `gh` autenticado en la misma
máquina para disparar y leer `scheduler-fase2-integrity.yml`, y Docker local (`EMS_Dev_Local`) para
Ruta A y el harness de RLS. Cuatro bugs preexistentes de CI encontrados y corregidos en el camino,
ninguno causado por el código de esta fase:

| # | Bug | Síntoma | Fix |
|---|---|---|---|
| 1 | `supabase start` auto-aplica migraciones en un volumen Docker recién creado (siempre el caso en CI), antes de que el preseed pueda cachear el fallo esperado de categorías | `ERROR: Expected category "Socio" not found` matando el job entero | Ocultar `supabase/migrations/` durante el `start`, restaurar antes del preseed |
| 2 | `staff.is_active`/`is_schedulable` nunca existieron en el shim de `00-shim-supabase.sql` | `column "is_active" does not exist` dentro de `save_engagement_assignments()` | Agregadas ambas columnas (`NOT NULL DEFAULT true`) |
| 3 | El runner de Ubuntu trae `pg_dump` 16.x; el servidor local de Supabase es 17.6 | `pg_dump: error: aborting because of server version mismatch` | Instalar `postgresql-client-17` del repo oficial de PGDG |
| 4 | El filtro de `\restrict`/`\unrestrict` de pg_dump era posicional (`tail`/`head`); pg_dump 17 antepone 3 líneas de header que la posición asumida no saltaba | Falso positivo: "Ruta A and Ruta C schema fingerprints diverge" con el único diff siendo esos 2 tokens | Filtro por contenido (`grep -vE '^\\(un)?restrict '`) en vez de posición |

**Resultado: `scheduler-fase2-integrity.yml` corre verde de punta a punta** (`rls-migration-tests` 28s,
`route-parity` 3m52s, incluido el gate de paridad Ruta A↔C) — primera vez desde el 30 de julio,
confirmado comparando contra el historial de runs previos en `dev-scheduler`/fase_5/fase_6 (todos con
la misma falla, en el mismo punto exacto, precediendo a esta fase).

**G3b — Ruta A local:** `EMS_Dev_Local`, 143/143 migraciones, `db push --dry-run --include-all` con 0
pendientes, fingerprint capturado y commiteado (reemplaza al obsoleto).

**G3c — escenario de renames:** el `UPDATE` sintético del plan no es ejecutable contra el estado actual
del repo (ver detalle y la corrección de fondo en
`docs/scheduler/fase_2/scheduler-fase-2-rutas-locales.md` §6.1) — cada timestamp "viejo" de los 5 pares
ya está ocupado por otro archivo real y vigente, no por el renombrado. El riesgo sustantivo que G3c
quería medir ya estaba probado por la corrida real de Fase 2 ("Ruta B — cierre con el CLI real",
139/139 sin bloqueos de duplicados) — no hacía falta reinventar la medición.

**G4 — harness de RLS (4 lanes):** primer intento contra el stack de Supabase compartido de
`EMS_Dev_Local` (corriendo 24h+, con Realtime/replicación lógica activa) — **crasheó el servidor 2
veces, en el mismo punto exacto**, con recuperación automática de Postgres y sin pérdida de datos.
No relacionado con el código de esta fase. Resuelto corriendo el harness contra un Postgres 16
aislado y descartable (mismo enfoque que usa la CI), sin tocar el stack compartido del operador.
Resultado: **6/6 marcadores "ALL CHECKS PASSED"** (lanes 1-3 + lane 4, ambas RPCs, matriz RLS completa
incluidos los 3 fixtures nuevos del bloque H — Encargado, Especialista IT, usuario sin staff).

## §5. G5 — Ruta C oficial contra "Test" (re-etiquetado, no cerrado en aislamiento)

Ejecutado con autorización explícita del operador, en vivo, contra el proyecto real "Test"
(`slkqdcwwvmjtcbakajib`). Detalle completo del hallazgo en
`docs/scheduler/fase_2/scheduler-fase-2-runbook-ruta-c.md` §0.1 — resumen aquí:

**G5.1 (preflight de datos, solo lectura):** limpio salvo **1 fila** en `engagements` con
`end_date < start_date` — el mismo caso que dispara el fail-closed de `scheduler-gaps` (G7). Anotado
como limitación conocida (ver más abajo), no bloqueante para el repair.

**G5.2/G5.3 (estado del ledger y repair):** `supabase_migrations.schema_migrations` no existía (igual
que en Fase 2 — todo aplicado a mano). El esquema del scheduler ya estaba presente completo (`save_engagement_assignments`, `wo_staffing_requirements`, `encargado_id`/`specialist_it_id`/`specialist_tax_id`,
etc.). Se corrió `migration repair --status applied` sobre los 143 nombres de `dev-scheduler-fase_7`
(vía `--db-url`, sin usar `--linked` para no arriesgar el `config.toml` de `EMS_Dev_Supabase`, que
todavía declara el `project_id` de Lovable). Verificado después: `migration list` sin divergencias,
`db push --dry-run --include-all` → "Remote database is up to date" (0 pendientes).

**El gate de paridad (fingerprint "Test" vs `ruta_a`) reveló que "Test" no es el ambiente limpio que
la decisión OQ1 asumía.** El diff de esquema completo (`--schema-only`) mostró mucho ruido esperado de
plataforma (extensiones `pg_net`/`pg_graphql`, schemas `_realtime`/`supabase_functions` — difieren
entre el stack Docker local y un proyecto cloud real, nada que ver con nuestro esquema). Pero el diff
de **políticas RLS y grants, acotado a `public` y recapturado en formato sin alinear** (el formato
tabular default de `psql` reformatea el ancho de columna completo ante cualquier cambio de contenido,
dando falsos positivos con `diff` línea a línea) mostró divergencia **estructural real**:

- Funciones de permisos de `feat/roles-permisos` activas y en uso: `can_manage_skills()`,
  `can_view_personnel()`, `can_manage_holidays()`, `has_permission()` — confirmado que existen en las
  migraciones de esa rama.
- Políticas reemplazadas en `categories`, `expense_types`, `global_settings`, `holidays`, `industries`,
  `skills`, `staff`, `user_roles` con esa lógica granular, no los `is_admin()` simples de
  `dev-scheduler`.
- **3 tablas de origen no identificado** (buscado en `dev-scheduler-fase_7` y `feat/roles-permisos`,
  ninguna las tiene): `engagement_staffing_requirements`, `resource_planning_audit_log`,
  `staff_unavailability`.
- Drift adicional sin relación aparente con roles-permisos (`fund_request_work_orders.fr_wo_select`,
  `fund_requests.fr_select_manager`).

El operador confirmó no tener registro de haber aplicado `feat/roles-permisos` (ni nada más) en
"Test". **Decisión del operador:** no investigar más ni revertir nada — el `migration repair` ya
corrido es inofensivo y se deja. Se re-etiqueta el alcance: "Test" se trata de ahora en más como un
preview de facto del estado combinado, y la evidencia de hoy pasa a alimentar el merge conjunto
(`scheduler-fase-7-lovable-convergencia-runbook.md`) en vez de cerrar un G5 aislado. Si en el futuro se
necesita un ambiente realmente limpio de un solo branch, hace falta un proyecto Supabase nuevo.

**G6 (regenerar tipos) queda diferido** por la misma razón — no corresponde generar "los tipos de
`dev-scheduler` limpios" desde un proyecto que ya no lo está.

## Baseline de `tsc` — desglose (dueño: Fase 7, ver también el ratchet en `.github/workflows/test.yml`)

De los 183 errores preexistentes:

- **7** referencian directamente la unión de nombres de RPC del contrato canónico del Scheduler.
- **0** provienen de `get_staff_assignment_segments` en sí — la fachada `segmentsClient` en
  `useStaffAssignmentSegments.ts` (marcada `TODO(types)`) lo enmascara por completo.
- **~35** son `TS2582`/`TS2304` (`describe`/`expect` sin import) en suites de test legacy, sin
  relación con el Scheduler.
- El grueso, **67×** `TS2322`, es deuda preexistente de varianza de genéricos `Column<T>` del
  `DataTable` compartido, repartida entre `Settings.tsx`, `Staff.tsx`, `Clients.tsx`,
  `Engagements.tsx` y `FundRequests*.tsx`.

**Contrato del ratchet** (`.github/workflows/test.yml`, paso "TypeScript baseline ratchet"):
`BASELINE=183`, el conteo no puede crecer. Quien regenere `types.ts` (G6, fuera de esta sesión)
debe bajar `BASELINE` en el mismo commit — si no, el ratchet permitiría regresiones silenciosas
hasta 183. **`tsc` en 0 es gate del merge conjunto con `feat/roles-permisos`, no de Fase 7**
(decisión del operador, OQ6) — ver `scheduler-fase-7-lovable-convergencia-runbook.md`.

## Limitaciones conocidas y riesgos aceptados (para el PR)

- 🔴 **"Test" ya no es un ambiente limpio de un solo branch** — tiene contenido de
  `feat/roles-permisos` (confirmado) más 3 tablas de origen no identificado
  (`engagement_staffing_requirements`, `resource_planning_audit_log`, `staff_unavailability`). Origen
  desconocido incluso para el operador. Decisión: no investigar más ni revertir; re-etiquetado como
  evidencia para el merge conjunto, no como cierre aislado de G5/G6. Ver §5 arriba y
  `scheduler-fase-2-runbook-ruta-c.md` §0.1 para el detalle completo. **Esto invalida la premisa de la
  decisión OQ1** ("Test" se eligió sobre "Dev 2.0" precisamente por creerse libre de
  `feat/roles-permisos`) — cualquier trabajo futuro que necesite un ambiente aislado de un solo branch
  requiere un proyecto Supabase nuevo.
- **1 fila en `engagements` con `end_date < start_date`** en "Test" (detectada en el preflight de
  G5.1) — dispara el fail-closed de `scheduler-gaps`; documentado, no corregido (fuera de alcance
  arreglar datos de producción/prueba ajenos desde esta fase).
- **Inventario de workflows**: solo existen `test.yml` y `scheduler-fase2-integrity.yml`; no se creó
  `scheduler-integrity.yml` ni `scheduler-fase3-integrity.yml` (ese path ya lo usa un workflow
  distinto en `sruizmier-scheduler-v3` — colisionaría al converger).
- **2 warnings de ESLint aceptados**, preexistentes, sin relación con el Scheduler
  (`react-refresh/only-export-components` en `GanttCanvas.tsx`/`MatchDot.tsx`).
- **Ausencia total de CSP** en cualquier rama, y **divergencia de orígenes externos** heredada de
  `development` (Google Fonts CDN, `cdn.gpteng.co`, imagen OG de Lovable) — documentado como riesgo
  aceptado, no mitigado en esta fase. `tools/verify-external-origins.mjs` no existe en este repo; el
  sustituto de CI está acotado a `src/components/scheduler/**`.
- **Gap de `AbortSignal`** en `invokeSchedulerData`/`invokeSchedulerGaps` (`schedulerData.ts`,
  `schedulerGapsData.ts`): verificado que ninguno forwardea el `signal` de `queryFn`. Diferido a
  propósito — forwardearlo sin manejar `AbortError` cruzaría el `catch {}` que mapea todo throw a
  `SchedulerUnavailableError`, produciendo un toast espurio en cada cambio de rango de fechas. El
  abort SÍ existe donde ya se implementó (`useStaffAssignmentSegments.ts`, `useEmsData.ts`).
- **`--hermetic` no disponible en Windows** (`tools/vendor/svar-gantt/rebuild-offline.mjs` requiere
  `unshare -rn` de Linux) — limitación de plataforma, no del código.
- **`hermetic-rebuild` y `browser-contract` diferidos**, con sus comandos manuales documentados; el
  manifiesto sha256 de `verify.mjs` ya hace imposible que el vendor cambie sin fallar el gate
  estático.
- **El flag por defecto es OFF**; la tabla de habilitación por ambiente y el gap de test unitario de
  la tabla de rutas de `App.tsx` (aceptado — el router se construye a nivel de módulo, testearlo
  exigiría `vi.resetModules()` + import dinámico del grafo completo) están en
  `scheduler-fase-7-habilitacion-y-rollback.md`.
- **39 tarballs / ~11 MB commiteados** en `tools/vendor/svar-gantt/tarballs/` — se conservan por
  garantizar el rebuild offline; decisión de reducirlos queda pendiente a futuro (OQ8).
- **Los números de red/latencia de §13 (cuando se midan en G8) son sintéticos** — row counts del
  ambiente de integración, no representativos de latencia de producción.
- **Sin harness de concurrencia de dos sesiones** para `save_engagement_assignments` — cubierto por
  `EAS_OVERLAP` (rollback del payload completo, `rpc-save-engagement-assignments.sql`) + el
  `FOR UPDATE` documentado en la migración; la fila "Concurrencia" de §15 se cierra con una
  observación manual de dos pestañas durante G8 (pendiente, browser real).
- **Escenario Ruta B de los 5 renames de convergencia**: el mecanismo sintético de G3c no es
  ejecutable contra el estado actual del repo (cada timestamp viejo está ocupado por otro archivo
  real); el riesgo sustantivo ya estaba cubierto por la corrida real de Fase 2 — ver
  `docs/scheduler/fase_2/scheduler-fase-2-rutas-locales.md` §6.1 para el detalle completo.

## Índice de evidencia

`bugs/` está gitignored (`.gitignore` contiene `bugs/*`) → toda la evidencia durable vive bajo
`docs/scheduler/fase_7/evidence/`. Inventario esperado (algunos archivos solo se producen al
ejecutar G3–G9 contra R-LOCAL/R-INT, fuera de esta sesión):

```
docs/scheduler/fase_7/evidence/
  git_scope.txt                      G0 — este documento, §1
  lint.txt                           G2 — 0 errores, 2 warnings
  tsc_postA-H.txt                    G2 — 183, desglose por código/archivo
  vitest_final.txt                   G2 — 188/188 archivos, 2461/2461 tests
  build_chunks.txt                   G2 — build exitoso, chunks del Scheduler medidos
  vendor_verify.txt                  G2 — verify.mjs, 3 capas PASS
  ci_route_parity.txt                G3a — ✅ verde de punta a punta (run 31067557732), incluye los 4 bugs de CI encontrados/corregidos
  route_parity_3way.txt              G3 — no aplica: el gate A↔C de la propia CI ya es la comparación real (fingerprint fresco commiteado en EMS_Dev_Local)
  rename_hazard_push.txt             G3c — resuelto sin este archivo; ver §3 y scheduler-fase-2-rutas-locales.md §6.1 (mecanismo sintético no ejecutable, riesgo ya cubierto por evidencia de Fase 2)
  test_rls.txt                       G4 — ✅ 6/6 "ALL CHECKS PASSED" contra Postgres 16 aislado, ver §3
  test_rls_policy_divergence.txt     G5 — ✅ diff real (formato sin alinear) que reveló el hallazgo de §5: feat/roles-permisos + 3 tablas no identificadas en "Test"
  migration_list_int.txt             G5 — ✅ repair de 143 nombres + migration list + dry-run, "up to date"
  types_diff.txt                     G6 — diferido (ver §5, no aplica regenerar tipos "limpios" desde un proyecto que ya no lo está)
  edge_functions_int.txt             G7 — pendiente (R-INT)
  rls_matrix_18.md                   G4 — cubierto por test_rls.txt (14/18 preexistentes + 3 nuevos del bloque H; PostgREST/vistas/RPC transversales a todas las filas)
  auth_scenarios.md                  G8 — pendiente (browser)
  network_requests.md                G8 — pendiente (browser)
  regression_development.md          G8 — pendiente (browser)
  regression_scheduler.md            G8 — pendiente (browser)
  flag_off_verification.md           G8 — pendiente (browser)
  responsive/                        G9 — pendiente (browser)
  riesgos_limitaciones.md            consolida los riesgos de esta sección
```
