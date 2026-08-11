# G8 — Regresión funcional de `development` contra "Test" (flag ON)

> Checklist de §14 del issue (`bugs/scheduler/fase_7/issue_fase_7.md`), priorizado por radio de
> impacto según `plan_v2.md` §G8: **Timesheets (obligatorio, 16 filas) > Engagements (obligatorio,
> máquina de 9 estados; resto spot-check) > Work Orders (spot-check) > Dashboard (spot-check) >
> Navegación (spot-check)**. Moneda (USD/BOB/USDT), planes de pago y riesgo/CEAC/SAN se degradan a
> spot-check — ninguna fase los tocó y ya están cubiertos por tests unitarios (línea base de G1).
>
> Ambiente: `.env.local` → proyecto "Test" (`slkqdcwwvmjtcbakajib`), `VITE_SCHEDULER_ENABLED=true`.
> Marcar `[x]` los que pasan, anotar debajo cualquier falla con pasos para reproducir.

## Timesheets — OBLIGATORIO, las 16 filas

- [x] Crear entradas.
- [x] Editar entradas.
- [x] Submit.
- [x] Unsubmit.
- [x] Aprobación por actividad.
- [x] Rechazo.
- [x] Límites diarios.
- [x] Límites semanales.
- [x] Forecast.
- [x] Actividades por servicio.
- [x] Contratación (entrada en la semana de alta de un staff).
- [x] Terminación (entrada en la semana de baja de un staff).
- [x] Feriados.
- [x] Feriados por oficina.
- [x] Semana de cinco días.
- [ ] Semana de seis días. — ⚠️ **no operativo**, ver nota abajo

**Resultado: 15/16 sin fallas.**

## Engagements — OBLIGATORIO: máquina de 9 estados

Recorrer las 9 transiciones de `engagements.status` / estado efectivo
(`src/lib/engagementStatus.ts`) y confirmar que cada una se refleja correctamente en la UI
(badge, filtros, y — si el engagement tiene asignaciones — el bucket de color en el Gantt del
Scheduler):

- [x] 1 Pendiente
- [x] 2 AprobadoSocio
- [x] 3 AprobadoRiesgos
- [x] 4 Aprobado
- [x] 5 AprobadoEmergencia
- [x] 6 Cancelado
- [x] 7 Finalizado
- [x] 8 Rechazado
- [x] 9 Congelado

**Resultado: 9/9 sin fallas.**

## Engagements — spot-check (resto)

- [x] Crear.
- [x] Editar.
- [x] Contrato / Servicio / Oficina / Práctica / Función / Gestión fiscal / Fecha de cierre / SQR
      (un pase rápido, no exhaustivo).
- [x] Encargado / Especialistas (los campos nuevos que gatea el Scheduler).
- [x] Protección de salida (dirty-state guard).

## Work Orders — spot-check

- [x] Crear / Editar.
- [x] Aprobación normal / dual, Rechazo, Reversión, Emergencia (un caso cada uno, no la matriz completa).
- [x] Protección de salida.
- [x] (Degradado) Planes de pago, Riesgo, CEAC, SAN, USD/BOB/USDT — no re-verificar, cubierto por tests.

## Dashboard — spot-check

- [x] Carga de tabs.
- [x] Cartera / Práctica / Staff Hours (un vistazo cada uno).
- [x] Filtros de estado efectivo (que reflejen el bucket de 9 estados de arriba).
- [x] Sin aumento inesperado de requests (Network tab, un vistazo).

## Navegación — spot-check

- [x] Sidebar desktop.
- [x] Navegación móvil.
- [x] Rutas protegidas.
- [x] Fund Requests.
- [x] Ausencia de Expenses.

**Resultado: todos los spot-checks sin fallas.**

## Fallas encontradas

- **"Semana de seis días" no operativo** en Timesheets, detectado durante el recorrido de las 16
  filas obligatorias. Decisión del operador: **no bloquea el cierre de G8** — se archiva como bug
  nuevo e independiente. Queda abierto confirmar el alcance exacto (¿falla el cálculo de límites,
  la UI de la grilla, o ambos?) y si es preexistente en `development` o específico de "Test" antes
  de abrir el issue correspondiente.
