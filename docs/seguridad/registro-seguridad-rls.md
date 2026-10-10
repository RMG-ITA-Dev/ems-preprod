# Registro de seguridad de EMS 2.0 — acceso a la API de Supabase (RLS)

**Última actualización:** 09/10/2026
**Estado:** en curso. La exposición a visitantes sin cuenta está cerrada (Carril A). El Carril B, que
restringe lo que hace cada empleado con sesión, avanzó en B0 (medición por rol) y B1 (validación en tres
funciones y permisos de riesgos); sigue abierta la lectura de más por la API (B2 a B6).
**Responsable de la remediación:** Marcelo Ovando (operador), con asistencia de Claude Code y Codex.
**Alcance:** base de datos y API de Supabase de EMS 2.0 en los ambientes Test (`slkqdcwwvmjtcbakajib`),
Dev 2.0 (`oapgycqovzqsucliwbpu`) y producción (`xcdcxtduotwgwmhxvsiz`, vacía). Lovable
(`ugqxfnrxvksiltwxzist`) está fuera de uso.

Este documento resume en un solo lugar las fallas encontradas desde el 28/09/2026 (Parte I) y las
soluciones aplicadas hasta hoy (Parte II). El informe técnico completo, con la evidencia por consulta,
vive fuera de git (`bugs/seguridad/barrido_report.md` y la carpeta privada de evidencias del operador),
porque contiene inventarios de un ambiente vivo. Los identificadores `BAR-0xx` son los de ese informe.

> Las fallas que siguen abiertas se describen por su mecanismo, sin peticiones listas para ejecutar.

---

## Resumen

- **Qué estaba roto.** 18 tablas de `public` no tenían Row Level Security (RLS) encendido, aunque 15 de
  ellas tenían políticas escritas, y además concedían todos los privilegios a `anon` (cualquier visitante)
  y a `authenticated` (cualquier empleado con sesión). Varias funciones `SECURITY DEFINER` escribían datos
  sin comprobar quién las llamaba.
- **Qué permitía.** Sin cuenta: leer y modificar encargos, clientes, horas y el documento de identidad del
  personal. Con cualquier cuenta: ver los datos de toda la firma, aprobarse la propia hoja de horas y
  reescribir el presupuesto de una OT ajena.
- **Qué está arreglado (01–08/10/2026).** El visitante sin cuenta ya no lee, no escribe ni ejecuta nada
  más que tres claves de configuración del login. Está en las migraciones, protegido por CI y aplicado y
  verificado en Test y Dev 2.0. Producción nacerá así.
- **Qué está arreglado en el Carril B (09/10/2026).** Un empleado ya no puede aprobarse su propia hoja,
  enviar la de otro, cambiar la configuración de horas de la firma ni reescribir el presupuesto de una OT
  ajena (BAR-009, 014 y 015). Los dos roles de riesgo ven todas las OT y pueden aprobar o rechazar riesgos.
  Probado en Dev 2.0; falta la compuerta de CI y registrarlo con `db push`.
- **Qué falta.** Restringir lo que cada rol con sesión puede **leer** y escribir directo en las tablas (B2 a
  B6). Hasta entonces, un empleado cualquiera sigue pudiendo ver de más por la API: tarifas, clientes,
  encargos, horas ajenas y el mapa de roles.

---

## Cómo se descubrió: desde el F12

### El punto de partida (28/09/2026)

1. Se abrió el sitio en una ventana de incógnito, sin iniciar sesión, con las herramientas de desarrollo
   del navegador (F12) en la pestaña **Network**, filtrando **Fetch/XHR**.
2. Al cargar la pantalla de login apareció una petición de la propia aplicación:
   `GET /rest/v1/global_settings?select=*` contra Supabase, con respuesta `200 OK`.
3. Esa petición muestra todo lo necesario para hablar con la API: la URL del proyecto y la clave pública
   (`anon` / *publishable*) en las cabeceras.
4. Con esa URL y esa clave, un cliente HTTP (Postman) repitió la lectura sin sesión: `200 OK`.
5. Con la misma clave se envió un `PATCH` inocuo a un encargo de prueba: `204 No Content`. No fue un
   `401` ni un `403`: la base aceptó una modificación de un visitante anónimo.

### Por qué esto no es un fallo del navegador ni de la clave

- La clave `anon` **es pública por diseño**. Cualquier aplicación de Supabase la entrega al navegador,
  porque el frontend la necesita para funcionar. Esconderla no protege nada.
- Los nombres de tablas tampoco son secretos: se ven en el tráfico de red al navegar cualquier pantalla y
  en el JavaScript que descarga el sitio.
- **La única frontera real está en la base de datos**: RLS encendido con políticas correctas, y privilegios
  mínimos (`GRANT`/`REVOKE`) por rol. Lo que la base concede, la API lo entrega a quien lo pida.

### Lo mismo vale para un empleado con sesión

Al iniciar sesión, el F12 muestra además el token del usuario (`Authorization: Bearer …`). Con ese token
y Postman, un empleado puede pedir cualquier tabla o llamar cualquier función que su rol tenga concedida,
**aunque la pantalla no se la muestre**. Ocultar un dato en la interfaz no es un control de acceso. Así se
comprobaron BAR-013, BAR-015 y BAR-009 (ver Parte I).

---

## Cronología

| Fecha | Hecho |
|---|---|
| 28/09/2026 | Incidente: lectura y `PATCH` anónimos en Test desde la pantalla de login. Informe y plan de barrido. |
| 30/09/2026 | Barrido de catálogo sobre una base local reconstruida desde las migraciones: BAR-001 a BAR-012. |
| 01/10/2026 | **Carril A** en el repositorio: `user_roles`, su respaldo y `assign_user_role_atomic`. Checks 11 y 12 en CI. |
| 02/10/2026 | **A.4** (escritura anónima) y **A.5** (lectura anónima y RPC). Retiro de los arneses de prueba desplegados. Primera evidencia con sesión: BAR-013 a BAR-017. Checks 13 a 16. |
| 05/10/2026 | Test reconstruido desde las 44 migraciones, con datos del respaldo. El operador verificó los bloques A/B/C, la escalera de privilegios en Postman y el cambio de rol con auditoría. |
| 07/10/2026 | Security Advisor de Test: las 34 alertas críticas coinciden con la lista conocida. BAR-018. |
| 08/10/2026 | Dev 2.0: bloque único de A.5 aplicado y verificado. Arneses retirados de Dev 2.0. BAR-015 y BAR-009 reproducidos con una cuenta de asistente. |
| 09/10/2026 | Dev 2.0: se detecta que faltaban los bloques del Carril A y de A.4; se aplican y verifican. Dev 2.0 al día con las 44 migraciones y su ledger reparado. Foto «antes» del Carril B con la regresión por rol. |
| 09/10/2026 | **Carril B, B1** en Dev 2.0: validación del llamador en tres funciones, `timesheet.self_approve` sembrado y permisos de los roles de riesgo. Los ataques de BAR-015 y BAR-009 repetidos con la misma cuenta de asistente: rechazados. Flujos normales probados en la app. |

---

## Parte I — Fallas identificadas

### Severidades

Se califica por consecuencia, no por quién ataca (plan de barrido, §7):

| Severidad | Condición |
|---|---|
| Crítica | Alguien puede cambiar quién tiene qué privilegio, o leer PII crítica; o `anon` puede modificar datos de negocio |
| Alta | `anon` lee datos personales, comerciales o configuración interna; o `authenticated` escribe fuera de su rol |
| Media | `authenticated` lee fuera de su rol, o un catálogo interno queda expuesto sin justificación |
| Baja | Endurecimiento o documentación pendiente, sin acceso efectivo demostrado |

### Tabla resumen

| ID | Fecha | Falla | Severidad | Estado al 09/10/2026 |
|---|---|---|---|---|
| BAR-001 | 30/09 | `user_roles` sin RLS y escribible: cualquier sesión podía cambiar su propio rol | Crítica | Escritura cerrada para todos; lectura de `anon` cerrada; empleados aún leen el mapa completo |
| BAR-002 | 30/09 | 16 tablas de negocio sin RLS con escritura anónima | Crítica | Cerrado para `anon`; abierto para empleados |
| BAR-003 | 30/09 | `anon` leía `staff` entero, incluido el documento de identidad | Crítica | **Cerrado** |
| BAR-004 | 30/09 | Copia histórica del mapa de roles expuesta | Alta | **Cerrado** (falta decidir si se borra) |
| BAR-005 | 30/09 | Recuentos base del plan inexactos | Baja | Documental |
| BAR-006 | 30/09 | Catálogo final distinto de los recuentos del plan | Baja | Documental |
| BAR-007 | 30/09 | `assign_user_role_atomic` sin validar al llamador (admin si el mapa está vacío) | Crítica | **Cerrado** |
| BAR-008 | 30/09 | `finalize_due_engagements` ejecutable por cualquiera | Media | **Cerrado** |
| BAR-009 | 30/09 | `sync_worksheet_to_wo_budget` reescribe el presupuesto de cualquier OT | Crítica | Cerrado para `anon` (Carril A) y para empleados (Carril B, B1): probado en Dev 2.0; pendiente CI y `db push` |
| BAR-010 | 30/09 | Vistas `SECURITY DEFINER` que esquivan los permisos de la tabla | Crítica | Cerrado para `anon`; abierto para empleados |
| BAR-011 | 30/09 | El entorno de pruebas local no replica todos los privilegios de Supabase | Baja | Limitación conocida |
| BAR-012 | 30/09 | El bootstrap del harness omite Auth, Storage y seeds | Baja | Limitación conocida |
| BAR-013 | 02/10 | Cualquier empleado lee los datos de toda la firma por la API | Alta | Abierto (la escritura de `global_settings` sí se cerró) |
| BAR-014 | 02/10 | `update_timesheet_minmax_settings` cambia la configuración de horas sin validar | Crítica | Cerrado para `anon` (Carril A) y para empleados (Carril B, B1): probado en Dev 2.0; pendiente CI y `db push` |
| BAR-015 | 02/10 | `submit_timesheet_safe` deja que el llamador se autoapruebe la hoja | Crítica | Cerrado para `anon` (Carril A) y para empleados (Carril B, B1): probado en Dev 2.0; pendiente CI y `db push` |
| BAR-016 | 02/10 | Política de `holidays` sin `TO`: regía también para `anon` | Baja | **Cerrado** |
| BAR-017 | 02/10 | `anon` conserva `TRUNCATE` en ~24 tablas con RLS | Media | Abierto; decisión pendiente |
| BAR-018 | 07/10 | 12 funciones sin `search_path` fijo | Baja | Abierto |

Conteo: 8 críticas, 2 altas, 2 medias y 6 bajas. Ninguna está cerrada formalmente: el cierre exige la
regresión por rol y la verificación de paridad en producción.

### Detalle por falla

**BAR-001 — `user_roles` escribible por la API (Crítica).**
*Mecanismo:* `has_role()` decide los privilegios leyendo `user_roles`, que no tenía RLS y concedía todo a
`anon` y `authenticated`. Un `PATCH` a la fila propia cambiaba el rol sin pasar por `admin_set_user_role`,
que sí tiene controles y escribe en la bitácora `user_lifecycle_audit_log`. Además, un visitante sin
cuenta podía leer quién es administrador.
*Cómo se comprobó:* por catálogo en la base local (30/09); en Test, el operador intentó escalar su propio
rol desde Postman («escalera»), sin éxito tras el arreglo (05/10).

**BAR-002 — 16 tablas de negocio sin RLS (Crítica).**
`activity_codes`, `activity_worksheet_cells`, `categories`, `clients`, `engagements`, `expense_types`,
`global_settings`, `industries`, `migration_run_log`, `staff`, `time_entries`, `timer_entries`,
`timesheet_line_approvals`, `timesheet_periods`, `wo_budget_lines`, `wo_expense_budget`.
*Mecanismo:* RLS apagado y `GRANT ALL` a `anon`. Es el `PATCH` del incidente.
*Cómo se comprobó:* el `PATCH` anónimo del 28/09 (204) y, tras el arreglo, el mismo `PATCH` rechazado (02/10).

**BAR-003 — documento de identidad legible sin cuenta (Crítica).**
*Mecanismo:* a los empleados se les ocultaron a propósito tres columnas de `staff` (`id_number`,
`aud_reg_number`, `target_utilization_percent`), pero `anon` tenía `SELECT` de la tabla entera. Un visitante
leía justo lo que se había escondido a los usuarios internos.

**BAR-004 — respaldo del mapa de roles (Alta).** `user_roles_backup_0220_56_20260224`: copia histórica,
sin RLS y sin consumidores, legible y modificable por la API.

**BAR-005 y BAR-006 — recuentos (Baja).** El plan contaba 41 «tablas» (eran 36 tablas y 5 vistas) y 30
tablas con RLS (eran 31). Sin impacto de seguridad; corrige la línea base.

**BAR-007 — `assign_user_role_atomic` (Crítica, condicionada).** Sin validar al llamador; si `user_roles`
está vacío, asigna `admin` al identificador recibido. Peligroso en la ventana de arranque de un ambiente
nuevo. Su único consumidor legítimo es una Edge Function con `service_role`.

**BAR-008 — `finalize_due_engagements` (Media).** Cualquiera podía anticipar el cierre diario de encargos
vencidos. Sin consumidores: la ejecuta un job interno.

**BAR-009 — reescritura del presupuesto de una OT ajena (Crítica, abierta para empleados).**
*Mecanismo:* la función solo comprueba que la OT exista. Vincula la hoja indicada a esa OT, **borra todas
sus líneas de presupuesto** y las reinserta desde la hoja. No valida quién llama ni que la hoja y la OT
sean del mismo encargo.
*Cómo se comprobó (08/10, Dev 2.0, datos de prueba):* con una cuenta de asistente sin asignación al encargo,
una sola llamada por la API reescribió el presupuesto de una OT **aprobada**: cambiaron las categorías y el
subtotal pasó de 17.200 a 20.250 BOB. Además, una hoja de otro encargo quedó vinculada a esa OT. Respuesta:
`204`, sin rastro. Se revirtió y se verificó el 09/10.
*Arreglo (09/10, B1):* la hoja y la OT tienen que ser del mismo encargo, y quien llama necesita
`work_order.create` o `work_order.update` con su alcance (o ser admin). La misma llamada responde ahora
`400 WORKSHEET_WO_ENGAGEMENT_MISMATCH` y la OT queda intacta; el gerente sigue pudiendo resincronizar.

**BAR-010 — vistas que esquivan permisos (Crítica).** `clients_directory`, `staff_directory`,
`engagement_wo_state` y `fund_request_selectable_work_orders` son vistas `SECURITY DEFINER`, propiedad de
`postgres`: la lectura y la escritura se autorizan contra el dueño, no contra quien consulta. Revocar la
tabla base no bastaba. `clients_directory` expone contacto, correo, teléfono y dirección de clientes.

**BAR-011 y BAR-012 — fidelidad del entorno de pruebas (Baja).** El harness local no replica los
privilegios por defecto de Supabase ni instala Auth y Storage. Por eso cada arreglo se verificó además en
un ambiente real.

**BAR-013 — cualquier empleado ve los datos de toda la firma (Alta).**
*Cómo se comprobó (02/10, Test):* con sesiones reales de cinco roles (asistente, senior, gerente, gerente de
contabilidad y socio), por la API. Los cinco reciben **lo mismo** en las tablas sin RLS: tarifas de las 61
categorías, los 55 clientes con su identificador fiscal, los 112 encargos, las horas de otras personas y el
mapa completo de roles. En las tablas con RLS, cada uno recibe solo lo suyo, lo que confirma el diseño a
seguir. Las tarifas de `categories` no se resuelven solo con RLS (filtra filas, no columnas).

**BAR-014 — configuración de horas sin control (Crítica).** `update_timesheet_minmax_settings` cambia para
toda la firma los mínimos y máximos de horas y los días laborables, sin comprobar al llamador. Corre como
`postgres`, así que ni los permisos de tabla ni la RLS la alcanzan.
*Arreglo (09/10, B1):* exige `global_settings.update` (hoy, solo admin), la misma regla que la escritura de
la tabla. El admin sigue guardando la configuración desde la app.

**BAR-015 — autoaprobación de la hoja de horas (Crítica, abierta para empleados).**
*Mecanismo:* la función recibe el `staff_id` como parámetro y no lo compara con el usuario de la sesión, y
la decisión de autoaprobar la manda el propio llamador. Agravante: el permiso `timesheet.self_approve`, que
debería decidir quién se autoaprueba, **no existe en el seed**; por la aplicación nadie se autoaprueba, y
toda autoaprobación es por esta vía.
*Cómo se comprobó (08/10, Dev 2.0):* un asistente envió su propia hoja pidiendo la autoaprobación y obtuvo
`200`. La mayor parte del tiempo se fue en configurar Postman (cabecera `apikey`, URL, arreglos
alineados), no en el ataque.
*Arreglo (09/10, B1):* con sesión, solo se envía la hoja propia, y la autoaprobación la decide el servidor
con `timesheet.self_approve`, ahora sembrado para admin, senior_partner, director, partner y risk_partner.
El resto pasa por Aprobaciones, gerentes incluidos. El parámetro del llamador se acepta por compatibilidad
y se ignora. Repetida la misma petición: `200` pero las líneas quedan pendientes; con la hoja de otra
persona: `400 NOT_OWNER`.

**BAR-016 — `holidays` legible sin cuenta (Baja).** La política se creó sin `TO`, así que regía para
`PUBLIC`, que incluye a `anon`. El dato es público; lo que fallaba era el control.

**BAR-017 — `TRUNCATE` residual (Media).** ~24 tablas con RLS conservan `TRUNCATE` para `anon`. RLS no
gobierna `TRUNCATE`. No hay vía demostrada (la API REST no expone esa operación), pero el privilegio no
debería existir.

**BAR-018 — `search_path` no fijo (Baja).** 12 funciones `SECURITY INVOKER` marcadas por el Security
Advisor. No elevan privilegios por sí mismas; queda listar todas y confirmar que ninguna definidora está
en el mismo caso.

### Otros hallazgos (sin código BAR)

| Fecha | Hallazgo | Estado |
|---|---|---|
| 02/10 | Funciones de prueba `test-minmax-settings` y `test-resubmission-state` desplegadas: llamaban funciones de negocio con `service_role`, alcanzables con la clave pública | Retiradas de Test (02/10) y de Dev 2.0 (08/10) |
| 01/10 | `cero_14` guarda en git el documento de identidad real del admin inicial | Abierto; se analiza aparte |
| 07/10 | *Leaked Password Protection* del Advisor desactivada; requiere el plan Pro | En el checklist del cutover a producción |
| 07/10 | Alertas de rendimiento del Advisor (evaluación de `auth.uid()` por fila, políticas permisivas múltiples, índice duplicado) | Fuera del alcance de seguridad; se miden en las pruebas de carga |
| — | Hipótesis: el bloqueo de cuentas de `secure-signin` podría esquivarse llamando directo al endpoint de tokens de Auth | **No verificada**; pendiente antes del cutover |
| 09/10 | Dev 2.0 no tenía aplicada la migración `0923-209` (reversión de hojas): «Revertir» fallaba en la app porque el frontend llamaba a una función que la base no tenía. Su ledger solo registraba las 14 migraciones cero | Aplicada y verificada; ledger reparado (44 de 44). Desde ahora, migraciones a Dev 2.0 con `db push` |
| 09/10 | Los dos roles de riesgo (`risk_supervisor`, `risk_partner`) tenían permiso para aprobar riesgos pero no podían ver ninguna OT (fallo del seed de permisos, no del Carril A) | Resuelto en B1: `work_order.read` con alcance de departamento (en la práctica, todas las OT) |
| 09/10 | El socio de riesgos ve el botón «Retirar de Aprobación» en una OT donde no es el socio del encargo; su permiso para eso es solo en encargos asignados | **Por verificar** si la base lo rechaza; si no, la validación de alcance falta en el servidor |

---

## Parte II — Soluciones implementadas

Todo el arreglo vive **dentro de las migraciones**, para que una base vacía nazca sana. Los `GRANT` del
volcado original no se editan: se revocan con `REVOKE` explícitos al final de `cero_06`, porque el
privilegio lo concede la plataforma al crear el objeto y solo un `REVOKE` lo limpia. Las políticas y el
flag de RLS se editan en sitio en `cero_05`. Rama `fix/rls-carril-a`, PR #362 hacia `development`.

| Fecha | Solución | Commits | Cierra |
|---|---|---|---|
| 01/10 | **Carril A.** `user_roles` sin escritura para `anon` ni `authenticated` (lectura conservada para el login); el respaldo sin acceso; `assign_user_role_atomic` solo para `service_role` | `a9b2fbc5`, `5a76f386` | BAR-001 (escritura), BAR-004, BAR-007 |
| 01/10 | **Compuerta de CI.** Check 11 (privilegios de `user_roles`) y check 12: toda tabla de `public` debe tener RLS salvo una lista de excepciones que solo puede encoger | `a9b2fbc5` | Evita que reaparezca la causa raíz: nada verificaba RLS |
| 02/10 | **A.4.** `anon` sin escritura en las 16 tablas y en 5 vistas (las vistas aparte, porque esquivaban el `REVOKE` de la tabla). Check 13 | `53a82a8d`, `497acb46` | BAR-002 y BAR-010 (escritura anónima) |
| 02/10 | **Arneses.** Se elimina `test-minmax-settings` y `test-resubmission-state` queda sin desplegar | `394db021` | Funciones de prueba expuestas |
| 02/10 | **A.5a.** `anon` sin lectura en las 16 tablas, `user_roles` y las 5 vistas; 4 funciones sin `EXECUTE` para `anon` (`finalize_due_engagements` también para empleados) | `b6461bee` | BAR-003, BAR-008, lectura de BAR-001/002/010, BAR-014/015 para `anon` |
| 02/10 | **A.5b.** RLS en `global_settings` con una política para `anon` limitada a `LANGUAGE`, `COMPACT_FONT` y `ALLOWED_EMAIL_DOMAIN`; al encenderla rigen las políticas de escritura que ya existían (solo admin); `holidays` pasa a `TO authenticated` | `b6461bee` | Configuración interna visible sin cuenta, escritura de configuración por empleados, BAR-016 |
| 02/10 | **Frontend.** `SessionCacheGuard` invalida `global_settings` al iniciar sesión; sin esto, durante un minuto el impuesto caía al 13 % por defecto | `b6461bee` | Efecto secundario de A.5b |
| 02/10 | **CI.** Checks 14 a 16, probados rompiendo a propósito cada protección; fixtures del replay re-aceptados | `b6461bee`, `da1832d8` | Guardias de A.5 |
| 05/10 | **Test** reconstruido desde las 44 migraciones y verificado por el operador | — | Paridad del repo con un ambiente real |
| 08/10 | **Dev 2.0**, bloque único de A.5 (`DIFF-INTENCIONAL-consolidacion.md` §6.5), porque su ledger ya tenía las migraciones cero y `db push` no las repite. Verificado por catálogo y desde fuera con `anon`. Arneses retirados | `51fdfe94` (documentación) | Lectura anónima en Dev 2.0 |
| 09/10 | **Dev 2.0**, bloques de §6.3 (Carril A) y §6.4 (A.4). **Faltaban:** el 08/10 se había verificado solo el de A.5, y el `PATCH` anónimo de prueba fallaba por falta de lectura, no de escritura. Hasta el 09/10, cualquier empleado podía cambiar su propio rol y un visitante podía insertar filas. Verificado por catálogo y con la regresión por rol. Sin señales de abuso: 2 admins, los esperados | — | Escalada de rol y escritura anónima en Dev 2.0 |

Producción (`xcdcxtduotwgwmhxvsiz`) está vacía y recibirá las migraciones ya corregidas, así que nace con
todo lo anterior.

### Carril B — empleados con sesión (desde el 09/10/2026)

Rama `fix/rls-carril-b`, desde `development` (que ya tiene el Carril A). Se prueba en Dev 2.0; Test está
congelado por las pruebas de carga.

**Cambio de mecanismo.** El Carril A editó las migraciones cero en sitio, y por eso cada ambiente ya migrado
necesitó «bloques únicos» aplicados a mano, que es justo donde falló Dev 2.0. Con el ledger de Dev 2.0
reparado, el Carril B va en **un solo archivo de migración nuevo**, idempotente
(`supabase/migrations/20261009120000_rls_carril_b.sql`): cualquier ambiente lo recibe con `db push`, y cada
etapa se suma al mismo archivo. Primero se aplica a mano en Dev 2.0 para probar; cuando pasa, se registra
con `db push`.

| Fecha | Etapa | Qué se hizo | Cierra |
|---|---|---|---|
| 09/10 | **B0. Medición** | Script de regresión de lectura por rol (`scripts/rls-regresion-por-rol.mjs`): inicia sesión con una cuenta por rol (11 roles más `anon`) y mide, por la API real y solo leyendo, qué recibe cada uno en las 17 tablas sin RLS, `global_settings` y las 5 vistas. La diferencia entre la corrida «antes» y «después» de cada etapa muestra su efecto, incluidos los fallos silenciosos (una lectura que pasa de N filas a 0 sin error). Su primera corrida detectó los bloques del Carril A que le faltaban a Dev 2.0 | Medir sin depender de la pantalla |
| 09/10 | **B1. Funciones y permisos** | `submit_timesheet_safe`: solo la hoja propia y la autoaprobación según el permiso. `sync_worksheet_to_wo_budget`: misma OT y hoja del mismo encargo, y permiso de OT con alcance. `update_timesheet_minmax_settings`: solo `global_settings.update`. Las llamadas sin sesión (migraciones, servidor) siguen funcionando; `anon` queda bloqueado aunque recupere el permiso de ejecución. Permisos: `timesheet.self_approve` creado y asignado; `risk_partner` recibe lo que le faltaba de `partner` y deja de crear y editar hojas; `risk_supervisor` puede ver OT y encargos | BAR-009, BAR-014, BAR-015 (empleados); roles de riesgo sin acceso a las OT |

**Decisiones del operador para el Carril B (08 y 09/10).** Cada uno envía solo su hoja, sin delegación por
ahora. Se autoaprueban admin, senior_partner, director, partner y risk_partner; los demás, gerentes
incluidos, pasan por Aprobaciones. En la matriz de permisos solo cambian los dos roles de riesgo. Los
roles de riesgo ven todas las OT porque son quienes aprueban los riesgos.

### Cómo se verificó

- **CI:** suites RLS (`npm run test:rls`), tests unitarios (`npm test`) y el replay del esquema consolidado.
- **Desde fuera, con la clave `anon`:** `GET global_settings` devuelve 3 filas; `GET engagements` responde
  `401`/`42501`; el `PATCH` del incidente es rechazado.
- **Con sesión (operador, Test y Dev 2.0):** checklist A/B/C, login, cambio de rol por el flujo de
  administración (que sigue escribiendo la bitácora) y la escalera de intentos de escalar el propio rol.
- **Regresión por rol (Carril B, B0):** foto «antes» en Dev 2.0 con 11 roles: los 11 reciben exactamente lo
  mismo en las 17 tablas sin RLS (BAR-013 reproducido) y los dos roles de riesgo no veían ninguna OT.
- **B1 en Dev 2.0 (09/10):** por catálogo (las 3 funciones con la validación, permisos de ejecución sin
  cambios, permisos nuevos asignados); repitiendo con Postman los ataques de BAR-015 y BAR-009, ahora
  rechazados; y en la app: el asistente envía y queda pendiente, el socio se autoaprueba, el gerente
  resincroniza su OT, el admin guarda la configuración y los dos roles de riesgo abren las OT y aprueban o
  rechazan riesgos.
- **Security Advisor de Test (07/10):** las 34 alertas críticas son exactamente las 17 tablas de la lista
  de excepciones del CI y las 4 vistas de BAR-010. No apareció nada desconocido.

---

## Esfuerzo y tiempo

### Del lado del atacante

| Escenario | Conocimiento y herramientas | Tiempo |
|---|---|---|
| Primera lectura sin cuenta (incidente) | Navegador, F12 y Postman; nivel básico | ~5 minutos |
| Modificar un registro sin cuenta (incidente) | Ídem | ~15–20 minutos |
| Empleado: autoaprobarse o reescribir una OT (BAR-015, BAR-009) | Su propia cuenta, el token visible en F12 y Postman | Una sesión de Postman; casi todo el tiempo fue configurar la herramienta |

Ninguno requiere contraseñas ajenas, inyección SQL ni acceso al panel de Supabase.

### Del lado de la remediación

No se registraron horas por persona: las cifras son de calendario, de commits y de las estimaciones del plan.

| Tramo | Calendario | Trabajo |
|---|---|---|
| Incidente, plan y barrido | 28/09 – 30/09 (3 días) | Informe, plan en 3 revisiones, base local reconstruida, 11 consultas de catálogo |
| Carril A, A.4 y A.5 en el repositorio | 01/10 – 02/10 (2 días) | 9 commits; 6 checks de CI; 3 re-aceptaciones de fixtures |
| Aplicación y verificación en ambientes | 05/10 – 08/10 | Reset de Test con restauración de datos; Advisor; bloques únicos en Dev 2.0; reproducciones |
| Carril B, B0 y B1 | 09/10 (1 día) | Dev 2.0 puesto al día (migración faltante, ledger, bloques del Carril A); script de regresión; migración del Carril B; pruebas de ataque y de flujo |
| **Total hasta hoy** | **28/09 – 09/10 (12 días de calendario)** | Exposición anónima cerrada; en el Carril B, cerradas las escrituras por función |

Estimación del plan para lo que falta (Carril B): **3 a 8 días** de implementación y pruebas, más 1 a 2
días para la matriz de acceso por rol. Es un piso: no incluye el ajuste de pantallas que hoy dependen de
leer todo, que probablemente domine el cronograma.

---

## Pendiente

1. **Carril B (lo importante).**
   - **B1, cierre:** tests de la etapa en el harness de CI, re-aceptar los fixtures del replay y registrar la
     migración en Dev 2.0 con `db push`. Regresión «después» de B1.
   - **B2:** RLS de lectura de `user_roles` (cada uno ve su rol; el admin, todos).
   - **B3:** políticas por rol en las 15 tablas con políticas nunca aplicadas, grupo por grupo; tarifas de
     `categories` por columna, vista o RPC; necesita el borrador de la matriz de visibilidad por rol.
   - **B4:** las 4 vistas `SECURITY DEFINER`.
   - **B5:** `TRUNCATE` residual de `anon` (BAR-017) e inventario de `search_path` (BAR-018).
   - **B6:** cierre: reconstrucción de un ambiente desde cero, regresión final y Security Advisor.
   - **Por verificar:** si la base rechaza «Retirar de Aprobación» del socio de riesgos fuera de sus encargos.
2. **Antes del cutover a producción:** activar *Leaked Password Protection*; verificar la hipótesis de
   `secure-signin`; decidir sobre el documento de identidad en `cero_14`; consulta de paridad tras el
   primer `db push`.
3. **Operación:** rotar la contraseña de la base de Test, que se compartió por un canal no seguro durante
   el procedimiento (datos ficticios).

---

## Glosario breve

- **`anon`:** el rol con que la API atiende a quien no inició sesión. Usa la clave pública.
- **`authenticated`:** el rol de cualquier usuario con sesión, sea cual sea su cargo en la aplicación.
- **`service_role`:** el rol del servidor (Edge Functions). No está sujeto a RLS; su clave nunca va al navegador.
- **RLS (Row Level Security):** reglas de Postgres que deciden, fila por fila, qué puede leer o escribir
  cada usuario. Si está apagado, mandan solo los privilegios de la tabla.
- **`SECURITY DEFINER`:** una función que corre con los permisos de su dueño (`postgres`), no con los de
  quien la llama. Si no valida al llamador por dentro, salta cualquier RLS.
- **Bloque único:** SQL idempotente que aplica a un ambiente ya migrado lo que las migraciones editadas en
  sitio no le van a volver a aplicar.

## Referencias en el repositorio

- `supabase/migrations/20251204000005_cero_05_rls_policies.sql` y `20251204000006_cero_06_grants.sql`
- `supabase/tests/schema-convergence-assertions.sql` (checks 11 a 16)
- `docs/migraciones/DIFF-INTENCIONAL-consolidacion.md` §6.3 a §6.5 (bloques únicos, verificación y reversión)
- `docs/operations.md` (estado de las Edge Functions por proyecto)
- `supabase/migrations/20261009120000_rls_carril_b.sql` (Carril B; cada etapa se agrega a este archivo)
- `scripts/rls-regresion-por-rol.mjs` (regresión de lectura por rol; solo Dev 2.0, solo lectura)
