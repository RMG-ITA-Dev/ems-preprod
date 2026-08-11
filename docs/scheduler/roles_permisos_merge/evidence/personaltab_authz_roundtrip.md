# PersonalTab.tsx — evidencia de round-trip (checklist de `AGENTS.md`)

`src/components/dashboard/tabs/PersonalTab.tsx` cae bajo `src/components/dashboard/`, así que el
merge dispara el "Dashboard PR Perf Checklist" de `AGENTS.md` §"Dashboard PR Perf Checklist".
Cambio relevante: línea 47 reemplaza el hook de rol anterior por `const { can } = useAuthorization();`,
consumido en la línea 231 (`canApprove = can("timesheet_approval.approve")`).

## Por qué no se midió en vivo

Este repo (R-APP) apunta al Supabase de Lovable
(`VITE_SUPABASE_URL=https://ugqxfnrxvksiltwxzist.supabase.co`, ver `.env`) — el mismo que produce
`docs/operations.md`. La regla del proyecto es no ejecutar ni probar contra ese backend desde
R-APP (ver también §6 del plan de convergencia: R-APP es solo git/npm/vitest/tsc/eslint/build).
Por eso esta evidencia es análisis estático del código, no una captura de DevTools Network en
vivo — igual que el resto de las verificaciones de este merge que requieren un backend real quedan
diferidas a R-LOCAL/R-INT con autorización explícita.

## Análisis

`useAuthorization()` (`src/hooks/useAuthorization.ts:53-79`) es un `useQuery` con:

```ts
queryKey: ["authz_context", user?.id]
staleTime: 5 * 60 * 1000
```

La **misma** `queryKey` ya la dispara `src/components/layout/AppSidebar.tsx:50`
(`const { can, roleKey } = useAuthorization();`). `AppSidebar` es parte del shell de la app: se
monta junto con **cualquier** página, incluido el Dashboard, antes o al mismo tiempo que
`PersonalTab`. React Query deduplica y cachea por `queryKey` — con `staleTime` de 5 minutos, dos
componentes que piden la misma key dentro de esa ventana comparten una sola llamada de red
(la primera fetchea, la segunda lee de caché).

Consecuencia: `PersonalTab` **no agrega un round-trip nuevo** al invocar `useAuthorization()`. La
llamada al RPC `get_my_authorization_context()` ya ocurre por el shell de navegación,
independientemente de qué tab del Dashboard esté activo.

## Resultado respecto al checklist

- **Ítem 1 (round-trip evidence):** no se agregó ninguna queryFn nueva a `PersonalTab` — se
  reutiliza un hook y una `queryKey` ya activos a nivel de shell. El conteo de "Personal full tab
  load (6 queryFns)" en `docs/performance/dashboard-performance-budget.md:26` no cambia: las 6
  queryFns propias de la tab (entradas semanales, mensuales, etc.) siguen siendo las mismas: la
  llamada de `useAuthorization` no es una de esas 6, es infraestructura de autorización compartida
  a nivel de aplicación, igual que `useCurrentStaff()` (línea 45 del mismo archivo).
- **No se requiere actualizar `dashboard-performance-budget.md`** — no hay presupuesto nuevo que
  fijar porque no hay round-trip nuevo que atribuirle a esta tab.
- Queda pendiente, si se quiere cerrar con evidencia empírica (no solo análisis estático), una
  captura real de DevTools Network en R-INT/Dev 2.0 durante G9 (regresión funcional en browser) —
  mismo entorno donde ya está previsto probar la matriz de roles del Scheduler.
