# G8 — §15 Regresión funcional del Scheduler (flag ON, contra "Test")

> Fuente: §15 del issue (`bugs/scheduler/fase_7/issue_fase_7.md`) — Scheduler L1, L2, Staff, Gaps,
> Work Order Staffing, Engagement Assignments, Timesheet Advisory.

## Resultado

Confirmado por el operador ("todo OK") durante la sesión interactiva de G8, en el mismo recorrido
de browser donde se cerraron `regression_development.md`, `flag_off_verification.md` y
`responsive_a11y_g9.md` contra "Test" (`slkqdcwwvmjtcbakajib`), 2026-08-06.

**Nota de alcance**: a diferencia de `regression_development.md` (§14), este bloque no se registró
fila por fila de las secciones de §15 (Scheduler L1/L2/Staff/Gaps/WO Staffing/Engagement
Assignments/Timesheet Advisory) — se cierra con la confirmación directa del operador, más liviana
que el resto de la evidencia de esta fase. Señalado explícitamente en
`evidence/riesgos_limitaciones.md` para que el revisor lo sepa antes del PR.

Único hallazgo relacionado detectado durante el recorrido de browser de esta sesión: el mensaje
`scheduler.errors.unavailable` al cargar `/scheduler` con el usuario "Neil G" — registrado y sin
verificar en `evidence/network_requests.md` ("Hallazgo abierto"), no descartado como falso
positivo ni confirmado como bug.
