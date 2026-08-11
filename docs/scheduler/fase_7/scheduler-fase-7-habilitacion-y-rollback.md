# Fase 7 — Habilitación segura del Scheduler y plan de rollback funcional

> Cierra §18 del issue (`bugs/scheduler/fase_7/issue_fase_7.md`) y los entregables "Plan de
> habilitación" / "Plan de rollback funcional". Fuente de diseño: `bugs/scheduler/fase_7/plan_v2.md`
> §B (bloque de código) y su tabla de Regression Risks.

## 1. Mecanismo

`VITE_SCHEDULER_ENABLED` (`src/lib/schedulerFeature.ts`, función `isSchedulerEnabled()`) — **fail
closed**: solo el literal exacto `"true"` habilita. Ausente, vacío, `"1"`, `"TRUE"`, `"yes"` o
cualquier otro valor deja el Scheduler deshabilitado.

Es una función, no una constante de módulo — así `vi.stubEnv` (tests) y cualquier mecanismo de
entorno en runtime pueden cambiar el valor sin depender de cuándo se evaluó el import. El
anti-patrón a evitar es `src/lib/logger.ts:8` (`const isDev = import.meta.env.DEV` a nivel de
módulo).

**El flag no es un mecanismo de autorización.** Con el flag en `true`, los chequeos de rol
(`src/lib/schedulerAccess.ts`) y el 403 del servidor (RLS + Edge Functions) siguen siendo los que
deciden qué ve cada usuario. El flag solo decide si el módulo existe en absoluto en el build que
corre el usuario.

## 2. Tabla de habilitación por ambiente

| Ambiente | Cómo se habilita | Notas |
|---|---|---|
| Local del operador y R-INT (ambientes que administramos nosotros) | `.env.local` con `VITE_SCHEDULER_ENABLED=true` | Gitignored (`*.local`); Vite le da precedencia sobre `.env` — cero cambios en archivos trackeados |
| Ambiente construido por Lovable | El mecanismo de variables de entorno propio de Lovable | **Nunca** commiteando el `.env` trackeado — ese archivo lo regenera Lovable y es máquina-generado (contiene duplicados con/sin prefijo `VITE_`) |
| Fallback, solo si Lovable no ofreciera variables de entorno | Una línea en el `.env` trackeado, aceptada como **frágil a propósito** | Si Lovable regenera el archivo, la variable desaparece y el flag cae a `false` — el modo de falla de la regeneración es **fail-closed** (deshabilita, nunca habilita) |

No se adoptó la variante asíncrona de `global_settings` (precedente: `Auth.tsx` lee
`ALLOWED_EMAIL_DOMAIN` así) — costaría el gate **sincrónico** de rutas de `App.tsx` y forzaría
gating por página con estados intermedios, por cero ganancia sobre una env var.

## 3. Los 7 chokepoints (para que un revisor verifique que nada es alcanzable en flag-off)

| # | Archivo | Qué gatea |
|---|---|---|
| 1 | `src/App.tsx` (spread condicional de las 4 rutas) | Las 4 rutas del Scheduler no se registran en el router; deep links/bookmarks caen en `*` → `NotFound` |
| 2 | `src/components/layout/AppSidebar.tsx` | `canSeeSchedulerPlanning`/`canSeeSchedulerGaps` compuestos con el flag |
| 3 | `src/components/layout/MobileMoreDrawer.tsx` | Idéntico al #2, para el drawer móvil |
| 4 | `src/components/forms/EngagementForm.tsx` | Toda la sección de Staff Assignments (ambas ramas del ternario, no solo la card) |
| 5 | `src/components/forms/WorkOrderForm.tsx` | Toda la sección de Staffing Requirements (ambas ramas) |
| 6 | `src/pages/WorkOrderEdit.tsx` | `validateStaffing(...)` y el guardado de staffing en `persistNonRiskChanges` — acompañante obligatorio de #5, evita bloquear el guardado de la OT por filas persistidas invisibles |
| 7 | `src/hooks/scheduler/useStaffAssignmentSegments.ts` | `enabled:` de la query — sin esto, la RPC del advisory se intentaría en cada carga de `/timesheet` y `/timesheet/approvals/:id` |

**Deliberadamente NO se gatean**: las 4 páginas del Scheduler (`SchedulerL1/L2/Gaps/Staff.tsx`) ni
`src/lib/schedulerAccess.ts`. Son inalcanzables por el chokepoint #1, y gatearlas también
renderizaría un estado **engañoso** (L1 mapea `!canView` a "Unavailable", Gaps/Staff a
"access-denied" — ninguno de esos textos significa "feature apagada").

## 4. Checklist pre-habilitación

Antes de poner `VITE_SCHEDULER_ENABLED=true` en cualquier ambiente:

- [ ] Confirmar qué Supabase usa ese ambiente y que tiene el esquema canónico (Rutas A/B/C
      convergidas, diff de esquema vacío).
- [ ] Confirmar que `scheduler-data` y `scheduler-gaps` están desplegadas ahí (nunca en Lovable
      hasta la fase de convergencia).
- [ ] Confirmar variables de entorno de Supabase (`VITE_SUPABASE_URL`,
      `VITE_SUPABASE_PUBLISHABLE_KEY`) correctas para ese ambiente.
- [ ] Confirmar que las rutas del Scheduler no queden visibles en un ambiente sin backend
      compatible (repetir el chequeo de la sección 3 con el flag OFF ahí).

## 5. Orden de activación

1. Migrar la base de datos del ambiente objetivo (Rutas A/B/C ya convergidas y verificadas en otro
   lado; nunca `migration repair` en Lovable).
2. Verificar el contrato canónico y la matriz RLS contra ese ambiente.
3. Desplegar únicamente `scheduler-data` y `scheduler-gaps` ahí.
4. Smoke test (login, `/scheduler`, una escritura autorizada, una escritura rechazada).
5. Solo entonces, habilitar `VITE_SCHEDULER_ENABLED` en el frontend de ese ambiente.

## 6. Rollback funcional

**Quitar la variable de entorno** (o ponerla en cualquier valor distinto de `"true"`). Efecto
inmediato: los 7 chokepoints vuelven a su estado apagado — rutas inalcanzables, nav ausente,
secciones de staffing ocultas, advisory RPC sin invocar.

**Las migraciones son forward-only.** No hay rollback de base de datos — ni destructivo ni de
esquema — como parte de este procedimiento. Deshabilitar el Scheduler es puramente un cambio de
configuración del frontend; el esquema, los datos y las Edge Functions permanecen intactos y listos
para una re-habilitación posterior.

## 7. Riesgos y limitaciones aceptados

- El fallback de `.env` trackeado (sección 2) es intencionalmente frágil — documentado, no un bug.
- El flag se lee vía `import.meta.env`, evaluado en build time por Vite: cambiar la variable
  requiere un rebuild/redeploy del frontend, no toma efecto en un bundle ya servido sin recargar
  desde el origen que lo reconstruyó.
- Ningún chequeo automatizado cubre la tabla completa de rutas de `App.tsx` (ver
  `scheduler-fase-7-verificacion.md`, "Limitaciones conocidas") — la cobertura real es sobre el
  predicado del flag y la navegación, no sobre el árbol de rutas completo.
