# Límites de negocio hardcodeados fuera de `global_settings`

> Inventario solicitado por el operador (2026-08-23) durante la migración cero, al confirmar los
> valores de `TS_WORK_DAYS=5`/`DAILY_MIN=DAILY_MAX=8`/`WEEKLY_MIN=40`. Es **solo documentación** —
> ninguno de estos puntos se toca como parte de la migración cero; quedan acá como candidatos para
> un esfuerzo futuro de externalizarlos a `global_settings`. Ninguno bloquea Fases 1-7 del plan.

`global_settings` ya externaliza correctamente `DAILY_MIN`/`DAILY_MAX`/`WEEKLY_MIN`/`WEEKLY_MAX`
(vía `useTimesheetPolicies.ts`), `TS_WORK_DAYS`/`TS_AUTO_SAVE_SECONDS`/`TS_MONTH_END_RULE`/
`TS_EMPLOYEE_RETRO_DAYS`/`TS_MAX_BACKLOG_WEEKS`, y `AUTH_MAX_FAILED_ATTEMPTS`/
`AUTH_LOCKOUT_MINUTES`. Los siguientes puntos son **literales independientes** que duplican esos
conceptos sin leer la tabla — un cambio futuro en Settings no los movería.

## Límite de 8h / 480min en timers (4 lugares independientes)

El mismo umbral de "una jornada = 8 horas / 480 minutos" está repetido en 4 sitios de
`supabase/migrations/20251204000002_cero_02_functions_tables_views.sql`, ninguno lee
`DAILY_MAX` de `global_settings`:

| Función | Línea aprox. | Qué hace |
|---|---|---|
| `validate_timer_entry_duration()` (trigger) | ~5522 | Rechaza un timer que exceda 8h / 480 min |
| `finalize_all_stale_timers()` | ~1811 | Cierra timers abandonados hace >8h, fijando `duration_minutes = 480` |
| `finalize_my_stale_timers()` | ~1866 | Misma lógica, alcance "mis timers" |
| `stop_timer(...)` (clamp del `ended_at`) | ~4833 | `LEAST(p_ended_at, v_started_at + interval '8 hours')` |

Si el negocio alguna vez necesita una jornada máxima distinta de 8h, hoy habría que tocar los 4
lugares a mano y coordinarlo con `DAILY_MAX` (que ya es configurable en Settings pero no está
conectado a esta validación).

## Semana laboral de 5 días (Mon-Fri), hardcodeada en paralelo a `TS_WORK_DAYS`

`TS_WORK_DAYS` (ya en `global_settings`, consumida por `useTimesheetPolicies.ts`) coexiste con
varios `= 5` hardcodeados como default de parámetro, y con una SQL que asume Mon-Fri sin leer la
tabla:

- `src/lib/timesheetUtils.ts` — `getWorkDays(weekStartDate, workDays: number = 5)` y
  `getMonthEndInWeek(weekStartDate, workDays: number = 5)`.
- `src/hooks/useTimesheetWeek.ts` — `useTimesheetWeek(weekStartDate, workDays: number = 5)`.
- `src/components/timesheet/ApprovalTimesheetGrid.tsx` — prop `workDays = 5`.
- `validate_submission_has_entries()` (trigger SQL, ~línea 5500) —
  `te.date_worked <= NEW.week_start_date + 4  -- Monday through Friday inclusive`: si `TS_WORK_DAYS`
  cambiara a un valor distinto de 5, esta validación de envío de timesheet seguiría exigiendo
  exactamente Lun-Vie.

En la práctica estos `= 5` son el fallback correcto **hoy** (coincide con el valor real de
`TS_WORK_DAYS`), pero son defaults independientes, no lecturas de la tabla — quedarían
desincronizados si alguien cambia `TS_WORK_DAYS` en Settings sin tocar código.

## Otros límites de negocio sin setting asociado

| Ubicación | Valor | Qué representa |
|---|---|---|
| `src/pages/TrackerRecord.tsx:26` | `MAX_SECONDS = 28800` (8h) | Auto-stop del cronómetro corriendo en cliente — mismo concepto que el límite de 8h de timers, tercer lugar independiente |
| `src/components/timesheet/TimesheetGrid.tsx:102-105` | `dailyMin=8, dailyMax=8, weeklyMin=40, weeklyMax=40` | Defaults de props del grid — deberían venir siempre de `useTimesheetPolicies`, no como fallback hardcodeado en la firma del componente |
| `src/hooks/useTimesheetMutations.ts:582` | `retroDays ?? 30` | Fallback de `TS_EMPLOYEE_RETRO_DAYS` (la clave real vale 30 hoy — coincide, pero es un segundo lugar que hay que mantener sincronizado) |
| `src/hooks/useTimesheetMutations.ts:680` | `settingsMap.get("DAILY_MIN")?.trim() || "8"` | Fallback de `DAILY_MIN` al autocompletar horas de feriado — igual: coincide hoy, es redundante |
| `src/lib/validation.ts:89-90` | `.max(1000, ...)` | Tope de horas por línea de time entry — nunca tuvo setting propio, valor arbitrario de guardarraíl |
| `get_staff_assignment_segments(...)` SQL, ~línea 2864 | `(p_week_end - p_week_start) > 6` | Tope de "una semana de timesheet" (7 días) para el rango de segmentos de asignación — no lee `TS_WORK_DAYS` ni ninguna clave |
| Upsert de `engagement_assignments`, ~línea 4336 | `v_hours <= 0 OR v_hours > 80` (`EAS_HOURS_RANGE`) | Tope de horas semanales por asignación a un encargo — sin relación con `WEEKLY_MAX` (40/50) ya configurado |

## No incluidos (ya están correctamente externalizados)

`v_lockout`/`v_reset := interval '15 minutes'` en `record_failed_login()`/`reset_login_attempts()`
son *fallbacks documentados* que solo se usan si `global_settings` no tiene
`AUTH_LOCKOUT_MINUTES` — no son el caso que este documento cubre (ver
`accountLockoutPolicySql.test.ts`).
