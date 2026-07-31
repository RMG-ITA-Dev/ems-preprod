# Fase 2 del Scheduler — Runbook del día D (Ruta C contra el Supabase oficial de prueba)

> Complementa `docs/plans/scheduler-fase-2-esquema-canonico.md` (el esquema resultante) y
> `docs/scheduler/fase_2/scheduler-fase-2-rutas-locales.md` (los pasos ya validados localmente contra
> Docker). Este documento es el runbook para cuando Q7 (project refs de `EMS_Dev_Supabase/`) se
> resuelva y haya que correr la verificación oficial — la única que falta del criterio de aceptación
> central de `plan_v2.md`.
>
> 🔴 **Todos los pasos de este runbook los ejecuta el operador humano, manualmente, en
> `../EMS_Dev_Supabase/`** — nunca un agente, y nunca desde `aurora-engage-pro`. Ver "División de
> repositorios y responsabilidades de ejecución" en `bugs/scheduler/fase_2/plan_v2.md`.

## 0. Por qué Ruta C es la que importa para el día D

`EMS_Dev_Supabase/` (el Supabase de prueba oficial) no tiene ningún historial de migraciones
trackeado — `supabase_migrations.schema_migrations` no existe ahí; todo lo que hoy tiene ese proyecto
se aplicó a mano por SQL Editor, calcado del `development` real. Es decir: **el estado de ese proyecto
hoy es, estructuralmente, el escenario de Ruta C** (el scheduler no existe todavía; cuando se aplique,
va a aterrizar sobre un `development` ya completo, no al revés). Por eso Ruta C — no A ni B — es la que
más se parece a lo que va a pasar de verdad, y la que primero hay que confirmar que converge.

## 1. Pre-requisitos

- [ ] Q7 resuelto: project ref de `EMS_Dev_Supabase/` confirmado, y el operador autorizado con acceso.
- [ ] `git pull` en `EMS_Dev_Supabase/` con el contenido final de `dev-scheduler` (139 históricas + C1-C4,
      sin los 5 pares de versión duplicada — ya renombrados, ver Q0 abajo).
- [ ] Confirmar que `supabase/config.toml` de `EMS_Dev_Supabase/` apunta al project ref de prueba,
      **nunca** `ugqxfnrxvksiltwxzist` (ese es Lovable, el administrador real).
- [ ] Backup/snapshot del proyecto de prueba antes de empezar, si el operador lo considera necesario
      (es un ambiente de prueba, pero igual conviene poder volver atrás).

## 2. Q0 — resultado del preflight (ya resuelto, no repetir el experimento)

El preflight de versiones de migración duplicadas **ya se corrió** con el CLI real (2026-07-28/29,
`EMS_Dev_Local`) y confirmó que `supabase db push --include-all` aborta con
`duplicate key value violates unique constraint "schema_migrations_pkey"` en cuanto encuentra el
segundo archivo de un par con el mismo timestamp de 14 dígitos — comportamiento determinístico de
Postgres (PK de `schema_migrations`), no depende del proyecto ni del ambiente. El remedio elegido y ya
aplicado en el repo: renombrar los 5 archivos "perdedores" a timestamps únicos adyacentes, sin tocar el
contenido SQL (verificado byte a byte). **No hace falta repetir este preflight contra
`EMS_Dev_Supabase/`** — el mismo mecanismo de Postgres aplica igual; lo único que sí hay que confirmar
ahí es que los 5 renames llegaron con el `git pull` (`ls supabase/migrations/ | sed -E
's/^([0-9]{14})_.*/\1/' | sort | uniq -d` debe salir vacío).

## 3. Q8 — comportamiento out-of-order de "Apply pending migrations" de Lovable (sigue abierto)

Lovable expone un botón "Apply pending migrations" que aplica, contra el proyecto real, cualquier
migración presente en el repo que `schema_migrations` todavía no tenga registrada. Dos preguntas
concretas que este runbook **no puede responder desde el repo** (Lovable no es scriptable desde acá):

1. **¿Aplica los archivos en orden de timestamp, como el CLI, o en algún otro orden (p. ej. orden de
   creación/descubrimiento)?** Si difiere del CLI, la ejecución real podría no reproducir exactamente
   la secuencia que Ruta A/B/C ya validaron.
2. **¿Qué hace ante los 5 pares de versión duplicada, si por algún motivo alguno de los "ganadores"
   originales ya estuviera aplicado en `EMS_Dev_Supabase/` de una corrida manual anterior?** El CLI
   aborta duro (§2); Lovable podría comportarse distinto (silencioso, parcial, o igual de duro).

**Mitigación para el día D:** no usar el botón de Lovable para la corrida de verificación — usar el CLI
real (`supabase db push --include-all`) contra `EMS_Dev_Supabase/`, exactamente como se hizo en
`EMS_Dev_Local` para Rutas A/B/C (ver `docs/scheduler/fase_2/scheduler-fase-2-rutas-locales.md`). El
CLI es determinístico y ya está caracterizado. Dejar el botón de Lovable únicamente para la sincronización
final hacia el Lovable administrador (fuera del alcance de Fase 2 — ver "Out of Scope" en `plan_v2.md`),
momento en el que ya no debería haber pendientes que aplicar de una sola vez si el CLI ya convergió el
ambiente de prueba primero.

## 4. Pasos (mismo procedimiento validado en `EMS_Dev_Local`, ver §3/§4 de `scheduler-fase-2-rutas-locales.md`)

1. **Pre-flight de datos** (sección "Verification Steps" §1 de `plan_v2.md`) — sólo lectura, antes de
   cualquier push. Confirmar 0 filas huérfanas / fuera de rango en `engagement_assignments`,
   `categories`, `staff`.
2. **Sanear `schema_migrations` si hace falta** (§2 de `plan_v2.md`) — `supabase migration list
   --linked` contra el project ref de prueba; `migration repair` sólo si faltan de verdad las 59 de
   `development` (no debería, dado el estado real del proyecto — ver §0).
3. **Aplicar con el CLI real, `--include-all`** — el equivalente de Ruta C contra este proyecto es,
   en la práctica, un solo `supabase db push --include-all` (el proyecto ya tiene el `development`
   real aplicado a mano; lo único pendiente es el scheduler completo: 8 históricas + C1-C4). A
   diferencia del ensayo local (que sí necesitó el split en 2 etapas para forzar la condición
   out-of-order desde cero — ver `scheduler-fase-2-verificacion.md`, sección "Ruta C"), acá el
   out-of-order **ya existe de hecho**: el scheduler es lo nuevo que llega después. Confirmar con
   `supabase migration list --linked` que las 59 de `development` ya estaban, y que sólo las 8 +
   4 del scheduler quedan pendientes antes del push.
4. **Verificar convergencia**: `supabase migration list --linked` sin divergencias;
   `supabase db push --dry-run --include-all` → 0 pendientes.
5. **Fingerprint y comparación contra Ruta A** (capturado en `EMS_Dev_Local`, commiteado en
   `supabase/tests/fixtures/route-fingerprints/ruta_a_*`): repetir
   `supabase/tests/local/capture-route-fingerprint.sh` contra `EMS_Dev_Supabase/` (ajustando `DB_URL`
   a la connection string del proyecto de prueba) y diffear contra `ruta_a_*`. Si diverge en algo
   más que `vw_staffing_alerts` (que en este proyecto puede no seguir el mismo camino que en el
   ensayo sintético local, dado que ya tiene datos reales), investigar antes de continuar — no asumir
   que es "ruido esperado" sin confirmarlo línea por línea.
6. **Pruebas y tipos** (`plan_v2.md` §5): `npm run test:rls` (corre igual contra Postgres desechable,
   no contra este proyecto); `supabase gen types typescript --project-id <REF_PRUEBA> --schema public
   > src/integrations/supabase/types.ts`; `npm run build && npx vitest run && npx tsc --noEmit`.
7. **Confirmar que no hubo mutación** fuera de lo esperado: `supabase/config.toml` sin cambios, el
   Lovable del administrador sin tocar, `main` sin tocar.

## 5. Qué hacer si algo diverge

- **Diverge sólo en `vw_staffing_alerts`** (grants/`security_invoker`): revisar si esta vista existe y
  en qué forma en `EMS_Dev_Supabase/` antes de aplicar — puede que el proyecto real ya la tenga en su
  forma correcta de antes (aplicada a mano), en cuyo caso C1 debería ser un no-op ahí. Confirmar con
  una consulta de catálogo antes de asumir que el push la va a corregir.
- **Diverge en policies/grants de `wo_staffing_requirements`/`engagement_assignments`**: comparar
  contra la Matriz RLS canónica de `docs/plans/scheduler-fase-2-esquema-canonico.md` — si el diff no
  coincide con nada documentado ahí, es una regresión real, no una diferencia esperada de ambiente.
- **El CLI aborta en un par de versión duplicada**: no debería pasar (§2) — si pasa, alguno de los 5
  renames no llegó con el `git pull`; verificar antes de intentar ningún remedio manual.
- **Cualquier otra divergencia inesperada**: no forzar. Documentar el hallazgo (en
  `docs/scheduler/fase_2/scheduler-fase-2-verificacion.md`, no en un archivo nuevo) y decidir con el
  responsable de Fase 2 antes de seguir — el mismo criterio que se siguió con los 3 bugs reales
  encontrados en C1 durante esta fase.

## 6. Después de una corrida exitosa

1. Commitear el fingerprint de la corrida oficial (`ruta_oficial_*` o similar) en
   `supabase/tests/fixtures/route-fingerprints/`, junto a `ruta_a`/`ruta_b`/`ruta_c` locales, como
   evidencia de que la verificación oficial cerró.
2. Actualizar la fila de Q7 en `bugs/scheduler/fase_2/plan_v2.md` a 🟢 resuelto.
3. Recién ahí, Fase 2 puede darse por cerrada de punta a punta — todo lo demás (pruebas SQL, CI,
   este runbook, el esquema canónico) ya estaba listo esperando este paso.
