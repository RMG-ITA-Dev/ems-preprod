# Fase 7 — Protocolo de verificación, evidencia y limitaciones conocidas

> Fuente: `bugs/scheduler/fase_7/plan_v2.md`, sección "Verification Steps" (10 gates G0–G10).
> Este documento registra el protocolo **tal como se ejecutó** en esta sesión de implementación
> (rama `dev-scheduler-fase_7`, base `dev-scheduler`), qué corrió en R-APP (este repo) y qué queda
> pendiente de R-LOCAL/R-INT o de un browser real — nunca se fabrica un resultado que no se midió.

## Alcance de esta ejecución

Regla vigente del proyecto: **jamás correr Supabase/migraciones desde R-APP**
(`aurora-engage-pro-908f8234`). Esta sesión implementó los bloques de código/documentación A–I del
plan e ejecutó los gates que son puramente locales a R-APP (G0, G1 parcial, G2). G3–G9 requieren
R-LOCAL (`EMS_Dev_Local`), R-INT (`../EMS_Dev_Supabase`, proyecto "Test") o un browser real contra
esos ambientes — quedan documentados como pendientes de ejecución por el operador, no simulados.

| Gate | Estado en esta sesión |
|---|---|
| G0 — Higiene de rama y alcance | ✅ Ejecutado, ver §1 |
| G0.5 — Sync de repos hermanos | ⏳ Pendiente (R-LOCAL, R-INT) |
| G1 — Línea base en `development` | ⏳ Parcial — el baseline de `tsc`/lint/vitest se conoce de sesiones previas (183/0-errores-2-warnings/verde); no se re-capturó con worktree en esta sesión |
| G2 — Calidad frontend | ✅ Ejecutado, ver §2 |
| G3 — Rutas de BD A/B/C | ⏳ Pendiente (CI + R-LOCAL) |
| G4 — SQL/RLS/RPC + matriz §10 | ⏳ Pendiente (R-LOCAL) — el fixture nuevo del bloque H está escrito y listo para correr ahí |
| G5 — Ruta C oficial contra "Test" | ⏳ Pendiente (R-INT, solo operador humano) |
| G6 — Regenerar y verificar tipos | ⏳ Pendiente (depende de G5; `types.ts` no fue tocado) |
| G7 — Deploy de Edge Functions | ⏳ Pendiente (R-INT, solo operador humano) |
| G8 — Regresión funcional (browser) | ⏳ Pendiente (browser real contra R-INT) |
| G9 — Responsive/a11y/i18n visual | ⏳ Pendiente (browser real) |
| G10 — Evidencia/docs/CI/review/PR | 🟡 Parcial — docs y CI de esta fase están escritos; falta el resto de la evidencia que depende de G3–G9 |

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
- **Escenario Ruta B de los 5 renames de convergencia**: medido en G3c, pendiente de ejecución en
  R-LOCAL — ver `docs/scheduler/fase_2/scheduler-fase-2-rutas-locales.md` §6.1.

## Índice de evidencia

`bugs/` está gitignored (`.gitignore` contiene `bugs/*`) → toda la evidencia durable vive bajo
`docs/scheduler/fase_7/evidence/`. Inventario esperado (algunos archivos solo se producen al
ejecutar G3–G9 contra R-LOCAL/R-INT, fuera de esta sesión):

```
docs/scheduler/fase_7/evidence/
  git_scope.txt                      G0 — este documento, §1
  lint.txt                           G2 — 0 errores, 2 warnings
  tsc_postA-H.txt                    G2 — 183, desglose por código/archivo
  vitest_final.txt                   G2 — pendiente al cierre de esta sesión
  build_chunks.txt                   G2 — pendiente
  vendor_verify.txt                  G2 — pendiente
  ci_route_parity.txt                G3a — pendiente (CI)
  route_parity_3way.txt              G3 — pendiente (R-LOCAL)
  rename_hazard_push.txt             G3c — pendiente (R-LOCAL)
  test_rls.txt                       G4 — pendiente (R-LOCAL); fixtures ya escritos (bloque H)
  dev2_staff_column_privileges.txt   G5.0 — pendiente (R-INT)
  migration_list_int.txt             G5 — pendiente (R-INT)
  types_diff.txt                     G6 — pendiente (depende de G5)
  edge_functions_int.txt             G7 — pendiente (R-INT)
  rls_matrix_18.md                   G4 — pendiente
  auth_scenarios.md                  G8 — pendiente (browser)
  network_requests.md                G8 — pendiente (browser)
  regression_development.md          G8 — pendiente (browser)
  regression_scheduler.md            G8 — pendiente (browser)
  flag_off_verification.md           G8 — pendiente (browser)
  responsive/                        G9 — pendiente (browser)
  riesgos_limitaciones.md            consolida los riesgos de esta sección
```
