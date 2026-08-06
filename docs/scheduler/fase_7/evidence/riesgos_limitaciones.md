# G10 — Riesgos, limitaciones aceptadas, habilitación y rollback

> Consolidado para el PR final `dev-scheduler-fase_7 → development`. Fuente: gates G0–G9 de esta
> sesión (`scheduler-fase-7-verificacion.md`), más las decisiones explícitas del operador
> registradas ahí. No repite el detalle completo de cada gate — enlaza a la evidencia real.

## Baseline de calidad técnica

- **`tsc`: 183 errores preexistentes**, sin cambios respecto al baseline de `development`
  (desglose por código/archivo en `evidence/tsc_postA-H.txt`). Ratchet en
  `.github/workflows/test.yml` (`BASELINE=183`) evita que crezca. **`tsc → 0` es gate del merge
  conjunto con `feat/roles-permisos`, no de Fase 7** (decisión del operador, OQ6) — ver
  `scheduler-fase-7-lovable-convergencia-runbook.md`.
- **Bug de zona horaria de payment-plan (`dayOffset()`): corregido en esta sesión** (no queda como
  riesgo abierto) — ver el detalle en `scheduler-fase-7-verificacion.md` §2.
- **2 warnings de ESLint aceptados**, preexistentes, sin relación con el Scheduler
  (`react-refresh/only-export-components` en `GanttCanvas.tsx`/`MatchDot.tsx`).

## Seguridad y plataforma

- **Sin CSP en ninguna rama** (verificado, no solo asumido) y **divergencia de orígenes externos**
  heredada de `development` (Google Fonts CDN, `cdn.gpteng.co`, imagen OG de Lovable) — riesgo
  aceptado, no mitigado en esta fase. El sustituto de CI para el Scheduler está acotado a
  `src/components/scheduler/**`.
- **Gap de `AbortSignal`** en `invokeSchedulerData`/`invokeSchedulerGaps` — diferido a propósito
  (forwardearlo sin manejar `AbortError` produciría un toast espurio en cada cambio de rango). Ya
  implementado donde importaba (`useStaffAssignmentSegments.ts`, `useEmsData.ts`).
- **`--hermetic` no disponible en Windows** (limitación de plataforma) — `hermetic-rebuild` y
  `browser-contract` diferidos, comandos manuales documentados; el manifiesto sha256 de
  `verify.mjs` ya hace imposible que el vendor cambie sin fallar el gate estático.

## Feature flag

- **Flag `VITE_SCHEDULER_ENABLED` con default OFF** — tabla de habilitación por ambiente y los 7
  chokepoints en `scheduler-fase-7-habilitacion-y-rollback.md`. **Los 7 chokepoints verificados en
  vivo contra "Test" con flag OFF: 7/7 sin fallas** (`evidence/flag_off_verification.md`).
- **Gap de test unitario de la tabla de rutas de `App.tsx`** — aceptado (el router se construye a
  nivel de módulo; testearlo exigiría `vi.resetModules()` + import dinámico del grafo completo).

## "Test" no es un ambiente limpio (hallazgo mayor de G5)

🔴 Contiene contenido de `feat/roles-permisos` (confirmado) más 3 tablas de origen no identificado
(`engagement_staffing_requirements`, `resource_planning_audit_log`, `staff_unavailability`).
Invalida la premisa de la decisión OQ1. Re-etiquetado como evidencia para el merge conjunto, no
como G5/G6 cerrados en aislamiento. **Por esta razón no se generaron/commitearon fingerprints
`ruta_oficial_*`** — hacerlo implicaría presentar el estado mixto de "Test" como si fuera la
línea base limpia de Ruta C, lo cual sería falso. El diff real que sí se capturó
(`evidence/test_rls_policy_divergence.txt`) documenta la divergencia como hallazgo, no como
fingerprint de referencia. Detalle completo: `scheduler-fase-2-runbook-ruta-c.md` §0.1 y
`scheduler-fase-7-verificacion.md` §5.

- **1 fila en `engagements` con `end_date < start_date`** en "Test" — dispara el fail-closed de
  `scheduler-gaps`; documentado, no corregido (fuera de alcance arreglar datos ajenos).

## G8 — Regresión funcional: alcance cerrado vs. diferido

**Cerrado, con evidencia real:**
- §14 `development` (flag ON): 15/16 Timesheets, 9/9 estados de Engagement, todos los spot-checks
  — `evidence/regression_development.md`.
- §15 Scheduler (flag ON): confirmado OK por el operador (sin archivo detallado fila-por-fila; ver
  nota de alcance abajo).
- Flag OFF, 7 chokepoints: 7/7 — `evidence/flag_off_verification.md`.
- §12 bundle/chunks: SVAR aislado a un chunk, 0 en el bundle inicial, sin sourcemaps, chequeo de
  Network por rutas no-Scheduler confirmado — `evidence/bundle_chunks_g12.txt`.
- G9 responsive/a11y/i18n visual: 20/20 capturas, §17 completo, aislamiento de CSS —
  `evidence/responsive_a11y_g9.md`.

**Diferido, por decisión explícita del operador (no fabricado, no cerrado):**
- **§13 red/consultas** — tabla de DevTools por página y las 3 aserciones derivadas (sin N+1,
  filtrado de fechas en backend, sin descarga firmwide) quedaron sin completar
  (`evidence/network_requests.md`, con el checklist listo para retomar).
- **§4 escenarios de autenticación** (17 filas, `evidence/auth_scenarios.md`) — checklist armado,
  no ejecutado contra "Test" en esta sesión.
- **Hallazgo sin verificar**: al cargar `/scheduler` con el usuario "Neil G" apareció el mensaje
  genérico `scheduler.errors.unavailable`. No se confirmó el status code real (403 esperado por
  falta de `canView`, vs. un problema real de la función recién desplegada en G7). Ver
  `evidence/network_requests.md`, sección "Hallazgo abierto".
- **Nota de alcance §15**: se cerró por confirmación directa del operador ("todo OK, probado"),
  sin el detalle fila-por-fila que sí se capturó para §14 — más liviano que el resto de la
  evidencia de este documento, señalado aquí para que el revisor lo sepa.

## Bug nuevo encontrado durante G8 (no bloqueante, no es de Fase 7)

- **"Semana de seis días" no operativo** en Timesheets, detectado durante el recorrido de las 16
  filas obligatorias de §14. Ningún archivo de Fase 7 toca esa lógica. Decisión del operador: no
  bloquea el cierre de G8, se archiva como issue nuevo e independiente. Queda abierto confirmar el
  alcance exacto (cálculo de límites vs. UI de grilla) y si es preexistente en `development`.

## Otros riesgos preexistentes documentados sin cambios

- Ausencia de harness de concurrencia de dos sesiones para `save_engagement_assignments` —
  cubierto por `EAS_OVERLAP` + `FOR UPDATE`; verificación manual de dos pestañas queda pendiente
  (requiere browser, no se ejecutó en esta sesión — degradar a spot-check futuro si no se prioriza).
- Escenario Ruta B de los 5 renames de convergencia: mecanismo sintético de G3c no ejecutable
  contra el estado actual del repo; riesgo sustantivo ya cubierto por la corrida real de Fase 2 —
  `scheduler-fase-2-rutas-locales.md` §6.1.
- **39 tarballs / ~11 MB** commiteados en `tools/vendor/svar-gantt/tarballs/` — decisión de
  reducirlos pendiente a futuro (OQ8).
- Los row counts y latencias de §13 (si se completa) serán sintéticos, no representativos de
  producción — declaración a incluir en el PR.

## Trabajo posterior — convergencia con `feat/roles-permisos`

No es parte del cierre de Fase 7. Ver `scheduler-fase-7-lovable-convergencia-runbook.md`:
- `tsc → 0` real, diferido al merge conjunto.
- G6 (regeneración de tipos) diferido — no corresponde regenerar tipos "limpios" desde un proyecto
  ("Test") que ya no lo está.
- El hallazgo de G5 (contenido mixto en "Test") pasa a ser evidencia de entrada para ese merge, no
  un blocker de Fase 7.

## Plan de habilitación y rollback

Ver `scheduler-fase-7-habilitacion-y-rollback.md` — tabla de habilitación por ambiente, orden de
activación, y rollback funcional (quitar la env var, sin rollback de base de datos).
