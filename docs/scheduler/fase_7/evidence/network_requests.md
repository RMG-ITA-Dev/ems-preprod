# G8 — §13 Red y consultas (residual, requiere flag ON)

> 7 de 14 aserciones de §13 ya están cubiertas por tests unitarios (query keys, abort signal,
> invalidaciones post-write, cambio de usuario sin reutilizar datos, Timesheet sin consultar
> assignments por celda — citar, no re-verificar). Esto es el residuo: una tabla de DevTools y 3
> aserciones derivadas. Requiere `VITE_SCHEDULER_ENABLED=true` — volver a levantar el server con
> esa env antes de este bloque.

## Tabla de DevTools (Network, filtro Fetch/XHR)

| Página | # requests | Endpoints | Transferido | Request más lento |
|---|---|---|---|---|
| Scheduler L1 (`/scheduler`) | | | | |
| Scheduler L2 (`/scheduler/staff/:id` o vista de asignación) | | | | |
| Scheduler Staff | | | | |
| Scheduler Gaps | | | | |
| Timesheet (`/timesheet`) | | | | |

## Aserciones derivadas

- [ ] **Sin N+1**: repetir la carga de L1/Gaps con un rango de fechas 4× más ancho → el **conteo**
      de requests debe quedar constante (el payload puede crecer, la cantidad de llamadas no).
- [ ] **Filtrado de fechas en backend**: el rango de fechas debe viajar en la URL/body de la
      request, y el row count de la respuesta debe cambiar according al rango.
- [ ] **Sin descarga firmwide**: el tamaño de la respuesta escala con el rango filtrado, no con el
      volumen total de la firma (probar con un usuario/vista acotada vs. una amplia).

## Extra (opcional, gratis)

- [ ] Correr en dev y revisar la consola por líneas `[perf] Slow query` de
      `src/lib/queryPerfLogger.ts` (avisa sobre queries > 500 ms con su query key).

## Declaración de cierre (agregar tal cual al PR)

> Los row counts del proyecto de integración ("Test") son sintéticos y las latencias absolutas no
> son representativas de producción.

## Hallazgo abierto (sin verificar)

Al cargar `/scheduler` (flag ON, usuario "Neil G", "Test") se vio el mensaje genérico
`scheduler.errors.unavailable` ("El servicio del Planificador aún no está disponible. Contacte a
su administrador."). Ese texto es el catch-all de `SchedulerL1.tsx`/`schedulerData.ts` para
**cualquier** throw de la llamada a `scheduler-data` (red, 401, 403, 500 — todos caen en el mismo
mensaje). No se confirmó el status code real en Network antes de seguir con otros puntos.
**Pendiente**: abrir DevTools → Network, recargar `/scheduler`, y revisar el status/body de la
request a `scheduler-data` para saber si es un 403 esperado (Neil G sin `canView`) o un bug real
de la función recién desplegada (G7).

## Resultado

(pendiente de completar)
