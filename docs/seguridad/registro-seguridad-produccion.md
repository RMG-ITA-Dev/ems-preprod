# Registro de seguridad — validación RLS en la instancia controlada de Supabase

**Fecha de ejecución:** 16/10/2026  
**Proyecto validado:** `xcdcxtduotwgwmhxvsiz`  
**Propósito:** dejar evidencia reproducible de la reconstrucción, la verificación y la validación funcional de Row Level Security (RLS) antes de ejecutar la campaña k6.  
**Clasificación del entorno:** instancia recién habilitada y dedicada a EMS para estas pruebas. Aunque el panel de Supabase muestra la rama `main` como `PRODUCTION`, este registro no presupone que contenga datos operativos.

## Veredicto

**APROBADO para la campaña k6 en lo relativo a RLS de PostgreSQL y Data API.**

La base se reconstruyó desde las migraciones versionadas, el catálogo/seed pasó su verificación, la comprobación estructural B6 pasó y se validaron lecturas y escrituras con cuentas autenticadas reales. No se encontró acceso anónimo indebido, acceso entre ámbitos no autorizado ni una escritura transversal aceptada por RLS.

El alcance de este veredicto es la autorización en PostgreSQL/Supabase Data API. No sustituye una prueba end-to-end independiente de cada Edge Function, la UI, secretos, correo, Storage o configuración de red.

## Reglas de operación y manejo de secretos

- No se incluyeron contraseñas, claves `anon`, claves `service_role`, tokens de sesión ni cadenas de conexión completas en este documento ni en archivos versionados.
- La conexión administrativa se comprobó con una contraseña leída de forma interactiva y las variables de sesión `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGSSLMODE=require` y `PGPASSWORD`.
- Las credenciales de las 17 cuentas sintéticas se guardaron localmente en archivos `*.local` ignorados por Git. Nunca se copiaron al repositorio ni al registro.
- Al terminar una sesión de PowerShell que tenga la clave temporal, se puede limpiar con:

```powershell
Remove-Item Env:PGPASSWORD
```

## Preparación y reconstrucción

### 1. Comprobación de conexión

Se confirmó conectividad al pooler del proyecto con una consulta inocua:

```powershell
psql -X -v ON_ERROR_STOP=1 -c "select current_database(), current_user, version();"
```

Resultado: conexión a `postgres` como `postgres`, sobre PostgreSQL 17.6.

### 2. Aplicación de migraciones

Se revisó primero el plan con `supabase db push --dry-run` y luego se aplicaron todas las migraciones contra el proyecto explícitamente indicado por la URL de conexión. El plan contenía la consolidación inicial, los seeds y las migraciones incrementales de seguridad hasta B6, incluido:

- `20261009120000_rls_carril_b.sql`
- `20261012120000` a `20261012190000` (B2, B3a–B3d)
- `20261013120000` a `20261013170000` (B3e, B4, B4b, B5 y B6)

La verificación posterior encontró **59 filas** en el ledger de migraciones, por lo que la aplicación y el historial remoto quedaron alineados.

### 3. Verificación estructural B6

Comando ejecutado:

```powershell
psql -X -v ON_ERROR_STOP=1 -f bugs/seguridad/carril-b/b6_verificacion.sql
```

Resultado: `B6 VERIFICACION: ALL CHECKS PASSED`.

Controles confirmados por la propia suite:

- RLS activo en las **49 tablas** de `public`; solo **7 tablas internas** no tienen políticas y están cerradas intencionalmente a la API.
- `anon` solo puede leer las claves públicas de `global_settings`; no puede ejecutar funciones por `anon` ni por `PUBLIC`.
- `authenticated` no conserva `TRUNCATE` ni privilegios excesivos; la PII de `staff` queda cerrada y `service_role` conserva el bloqueo de cuentas.
- Todas las funciones de `public` fijan `search_path`.
- Las tres vistas del dueño están en la lista controlada, con barrera/invoker cuando corresponde y solo `SELECT` para `authenticated`.
- Funciones, trigger de firma y políticas del Carril B presentes.
- Privilegios de B1 y B3p presentes.
- **187 políticas** en `public`.
- Existe el `UNIQUE` sobre `staff.auth_user_id`.

### 4. Verificación del seed

Comando ejecutado:

```powershell
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/local/verify-seed.sql
```

Resultado: `VERIFY-SEED: ALL CHECKS PASSED`.

Entre otros controles, quedaron verificados: 2 sociedades, 10 industrias, 5 tipos de gasto, 8 prácticas, 61 categorías, 25 actividades, 29 servicios, 28 feriados, 23 roles, 86 permisos, 775 concesiones, 27 claves globales, el usuario bootstrap y sus enlaces Auth/`staff`/`user_roles`, además de los jobs `finalize-stale-timers` y `finalize-engagements`.

## Cuentas y fixtures sintéticos de RLS

Se emplearon exclusivamente correos sintéticos con prefijo `rls-xcdc-20261016-` y dominio `@ruizmier.com`. Se crearon y enlazaron **17 cuentas Auth** y sus fichas de `staff`, una por cada rol que debía probarse:

`admin`, `assistant`, `semisenior`, `senior`, `manager`, `accounting_manager`, `partner`, `collections_analyst`, `accounting_analyst`, `risk_supervisor`, `risk_partner`, `senior_partner`, `director`, `sqr`, `hr_manager`, `hr_analyst` e `it_security_manager`.

Secuencia ejecutada:

```powershell
psql -X -v ON_ERROR_STOP=1 -f .\scripts\rls-target-xcdc-fixture-staff.sql
node .\scripts\rls-target-xcdc-accounts.mjs crear
psql -X -v ON_ERROR_STOP=1 -f .\scripts\rls-target-xcdc-promote-admin.sql
node .\scripts\rls-target-xcdc-accounts.mjs roles
```

Resultados:

- 17 fichas sintéticas creadas inicialmente sin `auth_user_id`.
- 17 cuentas Auth creadas y sus credenciales locales preparadas.
- 17 enlaces `staff`↔Auth verificados.
- La cuenta `ADMIN` se promovió para poder invocar la RPC real de asignación de roles.
- Los 16 roles restantes se asignaron mediante `admin_set_user_role_key`, no por una edición manual de tabla.

Después se alinearon las 17 fichas a práctica 1, que es la única que contiene categorías para todos los roles cubiertos:

```powershell
psql -X -v ON_ERROR_STOP=1 -f .\scripts\rls-target-xcdc-align-staff.sql
```

Resultado: `UPDATE 17` y validación de práctica consistente.

Para tener datos con alcance verificable se agregaron fixtures de negocio, horas y presupuesto:

```powershell
psql -X -v ON_ERROR_STOP=1 -f .\scripts\rls-target-xcdc-fixture-business.sql
psql -X -v ON_ERROR_STOP=1 -f .\scripts\rls-target-xcdc-fixture-hours.sql
psql -X -v ON_ERROR_STOP=1 -f .\scripts\rls-target-xcdc-fixture-budgets.sql
```

Estado persistente intencional de los fixtures:

| Grupo | Contenido sintético |
|---|---|
| Negocio | 3 clientes, 3 encargos, 3 órdenes de trabajo y 4 asignaciones |
| Horas | 3 `time_entries`, 2 `timesheet_periods` no enviados, 3 líneas de aprobación y 1 timer |
| Presupuesto | 2 hojas de actividad, 2 celdas, 2 líneas de presupuesto y 2 gastos presupuestados |

Los fixtures usan UUID, nombres y correos trazables con el prefijo `RLS-XCDC`/`rls-xcdc-20261016-`. No se deben borrar mientras se los necesite para k6 o para futuras regresiones. Su limpieza es una operación separada y deliberada.

### Incidencias controladas durante los fixtures

1. El primer intento del fixture de horas usó el código `RLS-XCDC-HRS`; la columna admite máximo 10 caracteres. PostgreSQL abortó la transacción antes de cualquier `COMMIT`. Se corrigió a `RLSHRS` y la segunda ejecución pasó.
2. El primer intento de la prueba transaccional de escritura intentó insertar una celda de hoja con una combinación ya existente de hoja/categoría/actividad. La restricción única abortó la transacción y no persistió nada. Se cambió el caso por una actualización de la celda existente y la segunda ejecución pasó por completo.

Ambas incidencias son fallos de diseño del fixture, no fallos de RLS ni cambios persistentes en la base.

## Regresión de lectura por Data API

El runner autentica cada cuenta real y consulta sin recuperar valores de negocio. Cada celda del reporte expresa filas recibidas/personas distintas o el código HTTP/PostgREST cuando el acceso fue rechazado.

Variables de protección requeridas antes de apuntar el runner al proyecto controlado:

```powershell
$env:RLS_REG_ALLOW_TARGET = 'xcdcxtduotwgwmhxvsiz'
```

Ejecuciones realizadas:

| Etiqueta | Objetivo | Evidencia generada |
|---|---|---|
| `baseline-staff-auth` | Verificar enlaces Auth y el estado sin datos de negocio | `regresion_xcdcxtduotwgwmhxvsiz_baseline-staff-auth_2026-10-16-21-18.{md,csv}` |
| `business-scope` | Verificar clientes, encargos, OT y vistas bajo alcance de rol | `regresion_xcdcxtduotwgwmhxvsiz_business-scope_2026-10-16-22-24.{md,csv}` |
| `hours-scope` | Verificar horas, períodos, líneas y timers | `regresion_xcdcxtduotwgwmhxvsiz_hours-scope_2026-10-16-22-35.{md,csv}` |
| `full-read-scope` | Regresión final con los 23 objetos y todos los fixtures | `regresion_xcdcxtduotwgwmhxvsiz_full-read-scope_2026-10-16-22-41.{md,csv}` |

Ubicación local de las evidencias: `C:\Users\MarceloOvando\Documents\EMS-RLS-Evidencias\carril-b\`. Es una carpeta de evidencias operativas, fuera de Git y sin valores de filas.

Comando de la regresión final:

```powershell
$env:RLS_REG_ALLOW_TARGET = 'xcdcxtduotwgwmhxvsiz'
$env:RLS_REG_ETIQUETA = 'full-read-scope'
node .\scripts\rls-regresion-por-rol.mjs
```

### Resultado de lectura final

La matriz final cubrió **23 objetos × (17 cuentas + anónimo)** y todas las autenticaciones terminaron correctamente.

| Área | Resultado confirmado |
|---|---|
| Anónimo | `401` en los objetos protegidos; únicamente 3 claves públicas de `global_settings` devuelven filas. |
| Tablas internas | `user_roles_backup_0220_56_20260224` y `migration_run_log` devolvieron `403` para toda sesión autenticada y anónima. |
| Catálogos | Los usuarios autenticados leen 26 actividades (incluye `RLSHRS`), 61 categorías, 5 tipos de gasto, 10 industrias y 27 claves globales; anónimo sigue limitado. |
| Staff y directorios | 18 fichas accesibles para las sesiones autenticadas conforme a la política vigente; anónimo bloqueado. |
| Clientes y encargos | La cantidad depende de la asignación/responsabilidad del fixture: por ejemplo, gerencia/socio ven su encargo; los roles de alcance institucional ven los tres; perfiles sin alcance directo reciben 0. |
| Horas | Admin y `senior_partner` ven el conjunto habilitado; gerencia, socio y encargado ven las horas de sus encargos; cada colaborador ve solo sus horas. El único timer lo ven su dueño y admin. |
| Presupuestos | `assistant`, `semisenior` y `senior` no leen presupuestos; responsables del encargo y roles con alcance institucional ven solo lo permitido. Las 2 celdas de hoja siguen cerradas para los perfiles sin `worksheet.read`. |
| Vistas | `engagement_wo_state`, `fund_request_selectable_work_orders` y `work_order_summary` devolvieron únicamente los resultados compatibles con su contrato y el alcance RLS. |

Observación documental, sin brecha: B3b resume que el gerente ve las celdas de su encargo, pero las políticas también permiten resultados a socio, SQR o encargado cuando figuran en el encabezado del encargo y poseen el permiso aplicable. La matriz reprodujo esa regla; no reveló filas fuera de los alcances definidos.

## Prueba de escrituras RLS con rollback

Se ejecutó una prueba SQL que asume el rol de base `authenticated`, cambia el `sub` de JWT hacia cada cuenta sintética y siempre termina en `ROLLBACK`:

```powershell
psql -X -v ON_ERROR_STOP=1 -f .\scripts\rls-target-xcdc-write-rollback.sql
```

El resultado final fue:

```text
PASS write 1: SEMISENIOR administra su hora y no modifica hora ajena
PASS write 2: timer solo modificable por su dueño
PASS write 3: GERENTE administra presupuesto y hoja de su encargo
PASS write 4: ASISTENTE no puede insertar presupuesto
PASS write 5: GERENTE_CONTA no modifica el presupuesto de otro encargo
PASS write 6: ANALISTA_CONT no modifica período ajeno
PASS write 7: ADMIN conserva modificación de hora ajena
RLS WRITE ROLLBACK: ALL CHECKS PASSED; no se persistió ninguna mutación
```

Los siete casos verifican tanto facultades positivas como intentos transversales rechazados. El `ROLLBACK` quedó confirmado por `psql`; esta fase no dejó modificaciones de horas, timers, presupuestos, celdas o períodos.

## Archivos de soporte creados para la campaña

- `scripts/rls-target-xcdc-fixture-staff.sql`
- `scripts/rls-target-xcdc-accounts.mjs`
- `scripts/rls-target-xcdc-promote-admin.sql`
- `scripts/rls-target-xcdc-align-staff.sql`
- `scripts/rls-target-xcdc-fixture-business.sql`
- `scripts/rls-target-xcdc-fixture-hours.sql`
- `scripts/rls-target-xcdc-fixture-budgets.sql`
- `scripts/rls-target-xcdc-write-rollback.sql`
- `scripts/rls-regresion-por-rol.mjs` (protección explícita añadida para permitir el ref `xcdcxtduotwgwmhxvsiz` solo mediante `RLS_REG_ALLOW_TARGET`)

## Codificación de consola

Algunos avisos de `psql` se mostraron con secuencias como `perÃ­odos` o `mutaciÃ³n`. Fue un problema de codificación de la consola de Windows, no de datos ni de SQL. Para sesiones futuras de PowerShell:

```powershell
chcp 65001
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [Console]::OutputEncoding
```

## Decisión operativa posterior

No queda una prueba RLS de base de datos pendiente para este objetivo. Se puede continuar con la campaña k6 sobre la instancia Small usando estos fixtures y cuentas sintéticas.

Antes de tratar la instancia como un entorno operativo real, deben hacerse por separado los smoke tests de las Edge Functions que se desplieguen, la configuración de secretos/correo/Auth y las pruebas funcionales de UI. No se deben interpretar estas validaciones RLS como autorización para omitir esos controles.
