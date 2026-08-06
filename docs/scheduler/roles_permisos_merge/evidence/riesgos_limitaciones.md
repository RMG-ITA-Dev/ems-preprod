# Convergencia dev-scheduler + feat/roles-permisos — riesgos y limitaciones (2026-08-06)

> Consolidado de lo ejecutado en R-APP en esta sesión vs. lo que queda pendiente de R-LOCAL/R-INT
> con autorización del operador. Plan completo: `bugs/scheduler/plan_merge_sche_rolper.md`.

## Ejecutado en R-APP (esta sesión)

| Gate | Resultado |
|---|---|
| G0 | ✅ SHAs, conteos y merge trial confirmados idénticos al plan — nada se movió |
| G0b/G0c | ✅ Baselines medidos: `development` 180 tsc / 0 vitest fallos hoy (141 archivos, 1628 tests); `feat/roles-permisos` 201 tsc |
| G1 | ⛔ Diferido — requiere R-LOCAL con autorización (diff de RLS/grants con `psql -At -F'\|'`) |
| G2 | ✅ Merge commiteado (`9d90cfb2`). 3 conflictos resueltos, 14 archivos auto-mergeados revisados semánticamente (7 con test real, 92/92 verdes), 174 migraciones, `uniq -d` vacío, hash de los 5 renames idéntico byte a byte, 0 markers, 0 `staff(*)` |
| G3a | ✅ Migración `20260806000000_grant_staff_is_schedulable.sql` |
| G3b | ✅ Las 4 capas de acceso del Scheduler migradas de `user_roles.role` a `role_key` (sidebar, drawer, `scheduler-data`, `scheduler-gaps`), allowlist único en `schedulerAccess.ts`. Corregido en commit de seguimiento `232f306` — el commit de merge había perdido `supabase/functions/*/handler.ts` por un pathspec de `git add` demasiado estrecho |
| G4a | ✅ Conteos hardcodeados del workflow de integridad actualizados (143→174, 63→94) |
| G4 (resto) | ⛔ Diferido — Ruta A/C y `test:rls` requieren R-LOCAL con autorización |
| G5/G6 | ⛔ Diferido — requieren Dev 2.0 (R-INT), project ref y autorización del operador |
| G7 | ⛔ Diferido — regeneración de tipos requiere R-INT |
| G8 (lint/tsc/build/verify:vendor) | ✅ Todo verde. Ver desglose abajo |
| G8 (vitest) | ✅ **188/188 archivos, 2483/2483 tests, 0 fallos.** Ver desglose abajo |
| G9 | ⛔ Fuera de alcance de esta sesión — regresión en browser, requiere operador |
| G10 | ✅ Este documento + 4 runbooks actualizados + `deuda-esquema-scheduler-v1.md` nuevo |

## G8 — detalle

- **lint**: 0 errores, 2 warnings preexistentes (idénticos a los 3 baselines).
- **tsc**: 204 errores. **0 regresiones reales** — verificado archivo+código contra el máximo de
  las 3 baselines (`development` 180, `dev-scheduler` 183, `feat/roles-permisos` 201): cada
  combinación (archivo, código TS) del merge ya existía en alguna baseline con igual o mayor
  conteo. El aumento de 183→204 es enteramente la deuda propia de `feat/roles-permisos` heredada
  por el merge, no daño nuevo. Ratchet subido a `BASELINE=204` en `test.yml` (commit `acaa27ab`
  para el conteo del workflow, ratchet de `test.yml` en el siguiente commit de docs).
- **build**: exitoso, 1m50s. Bundle principal 1,038.71 kB / gzip 304.80 kB (vs. 1,032.13 kB / gzip
  303.03 kB de Fase 7 — incremento esperado por el código de `feat/roles-permisos`). Los 4 chunks
  del Scheduler aislados y con gzip < 10 kB cada uno (`SchedulerL1` 3.52 kB, `SchedulerStaff` 4.54
  kB, `SchedulerGaps` 6.85 kB, `SchedulerL2` 8.06 kB).
- **verify:vendor**: PASS, las 3 capas.
- **vitest**: **188/188 archivos, 2483/2483 tests, 0 fallos.** Primera corrida completa dio 27
  fallos en 2 archivos (ver hallazgo abajo); corregidos, la segunda corrida completa quedó 100%
  verde. Ver `vitest_merge.txt` en este mismo directorio (segunda corrida, la que cuenta).

## Riesgos aceptados / hallazgos durante la ejecución

🔴 **El primer intento de `git add -A` con pathspec (`-- src/ supabase/migrations/ .github/`)
excluyó `supabase/functions/`** — el commit de merge (`9d90cfb2`) quedó con las Edge Functions
todavía leyendo `user_roles.role` (enum legacy) mientras sus tests ya esperaban `role_key`.
Detectado por una discrepancia en `git status` antes de cerrar la sesión (no por un fallo de test —
la corrida de `vitest` en curso usaba el working tree, no el commit, así que no lo habría
mostrado). Corregido en un commit de seguimiento (`232f306`). **Lección para la próxima sesión de
merge:** verificar `git diff --stat <rama-base> HEAD` sobre el árbol completo después de cualquier
commit con pathspec, no confiar en que el pathspec cubrió todo lo tocado.

🔴 **27 fallos reales en la primera corrida completa de `vitest`**, en 2 archivos:
`WorkOrderEdit.staffing.test.tsx` (17) y `EngagementForm.assignments.test.tsx` (10) — ambos
dev-scheduler-only (Fase 4/5 del Scheduler, no existen en `feat/roles-permisos`). Causa: los dos
mockeaban `useUserRole`, pero tras el merge `WorkOrderEdit.tsx`/`EngagementForm.tsx` usan
`useAuthorization` (que llama `useAuth()` internamente) para el gate de escritura — sin mock,
`useAuth()` revienta por faltar el `AuthProvider`. Los demás archivos que renderizan esas mismas
páginas (los que también existen en `feat/roles-permisos`) ya mockeaban `useAuthorization`
correctamente — el merge los heredó bien; el problema era exclusivo de las 2 suites que solo
existían en `dev-scheduler`. Corregido en `15bad48` (`can: () => true` preserva el comportamiento
previo, sin gate por permiso; `roleKey` admin/no-admin reproduce el toggle `isAdmin` original).
**Lección:** al mergear una rama que rescribe la fuente de autorización de un componente, revisar
TODOS los tests que renderizan ese componente, no solo los que el diff de 3-way marca como
modificados por ambos lados — un test exclusivo de una sola rama puede quedar con un mock obsoleto
sin que ningún conflicto lo señale.

## Qué falta para el PR (fuera de esta sesión)

Ver `bugs/scheduler/plan_merge_sche_rolper.md` §7 (G1, G4b-f, G5, G6, G7, G9) y §11 (criterio de
cierre completo). Todo lo que sigue requiere R-LOCAL o R-INT con autorización explícita del
operador — regla del proyecto, nunca Supabase/migraciones desde R-APP.
