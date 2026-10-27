# Plan de optimización de los cuellos de botella de EMS (hallados en la campaña k6)

**Estado:** BORRADOR COMPLETO (27/10/2026; incorpora el cierre de la campaña en xcdc), pendiente de la revisión final de Opus. **Para quién:** quien corrige el producto (frontend, Edge Functions y base de datos). **Para qué sirve:** convertir cada cuello de botella medido en una corrección concreta, con su evidencia, el impacto esperado, el esfuerzo, el riesgo y **cómo comprobar que funcionó**. Documento hermano (los límites y la guía de diagnóstico): `docs/performance/small-capacidad-y-limites.md`.
**Marcas:** **VERIFICADO** (medido o leído en el código), **INFERIDO**, **NO CONFIRMADO**, **VERIFICAR**. El esfuerzo y el riesgo son **estimaciones del ejecutor (INFERIDAS)**, no compromisos.
**Contexto:** las primeras semanas se opera en **Small** y se mide. Estas optimizaciones **no dependen de subir a Medium**; varias evitan pagarlo (el cómputo de mayor tamaño no resuelve el Scheduler, el tope de filas, W01 ni el login: ver `small-capacidad-y-limites.md` §10).
**Evidencia cruda:** `bugs/tests/k6/produccion/` (no versionada): `hallazgos_rendimiento.md` (H-x), `informe_etapa9.md`, `etapa8/informe_etapa8.md`.

---

## 1. Resumen y orden recomendado

| # | Optimización | Cuello de botella | Impacto esperado (evidencia) | Esfuerzo | Cuándo |
|---|---|---|---|---|---|
| **O-1** | **Paginar o agregar en el servidor las respuestas de 1.000 filas** | Datos truncados sin error (H-4-02) | Corrección de datos (la firma ve 1.000 de 3.869 en aprobaciones); reduce además el peso de respuesta | M | **Antes de salir (obligatoria)** |
| **O-2** | **Fijar la región `us-west-2`** de `scheduler-data`, `scheduler-gaps` y `secure-signin` | Latencia 3–4× mayor por servirse desde `sa-east-1` (H-4-01, H-4-03) | **Medido:** Scheduler 15,8 → 3,9 s (H01) y 19,9 → 5,7 s (H05); login 2,17 → 0,72 s (≈ 3×) | S | **Antes de salir** |
| **O-3** | **Alarmas automáticas** de memoria, swap, 57014 y 5xx | La regla manual falló dos veces en la campaña (R8-3, H-9-05) | No mejora el rendimiento; **evita no enterarse** | S–M | **Antes de salir** (`vigilancia-produccion-small.md`) |
| **O-4** | **Optimizar `portfolio_overview`** para el alcance de firma | 3,6–5,4 s por llamada; 57014 si se abre muy seguido (H-3-08, H-8-02) | **No medido** (requiere análisis del plan de ejecución, §O-4) | M–L | Tras la salida, con datos reales |
| **O-5** | **Reducir el peso de W01, C02 y E01** (acotar columnas y paginar) | Respuestas de 7,6 / 2,9 / 2,4 MB; recepción de hasta 58 s (H-4-05, H-5-01) | Menos transferencia y memoria; mejora medible con k6 (`http_req_receiving`) | M | Junto con O-1 |
| **O-6** | **Scheduler, corrección B** (menos lecturas en serie; registrar el error) | Gaps > 8 s con la base tranquila (H-5-02, H-5-04) | **No medido**; ahorra ≥ 1 viaje por lectura (INFERIDO) | M | Tras la salida |
| **O-7** | **Cachear en el frontend lo casi estático** | ~41 % de las peticiones son 6 rutas de datos casi fijos | Menos tráfico y carga; **a confirmar** si el frontend ya las cachea | S–M | Tras la salida |
| **O-8** | **`ANALYZE` tras cargar datos reales** y medir | Estadísticas viejas (H-9-17: una consulta tardó 16,6 s) | Planes de ejecución correctos desde el primer día | S | **Al cargar los datos reales** |
| **O-9** | **Seguridad (no es rendimiento, pero se halló)**: H-7-01 y H-7-02 | Políticas de períodos sin `WITH CHECK`; `unsubmit_timesheet_safe` con rol legacy | Cierra riesgos de integridad | M | Tras la salida (o antes si el equipo de seguridad lo exige) |
| **O-10** | **Reponer los 8 crones de `pg_cron`/Railway** (o su equivalente externo) | Siguen inactivos desde el 18/10 por decisión del operador (H-9-22): sin ellos no se cierran timers colgados ni salen avisos y recordatorios | No es rendimiento: **evita una falla funcional silenciosa** | S | **Antes de salir** (lo opera Railway) |
| **O-11** | **Endurecer el runner de regresión RLS** (`scripts/rls-regresion-por-rol.mjs`): reintento por celda, «SIN DATO» y `exit ≠ 0` si falta algo | Con red intermitente terminó con exit 0 teniendo 8 roles sin sesión (H-9-21) | Regresiones fiables tras cada cambio de RLS (O-9) | S | Antes de cambiar políticas |

**Antes de salir (la semana próxima):** O-1, O-2, O-3, O-8 y O-10. **Después**, con las mediciones de las primeras semanas: O-4, O-5, O-6, O-7 por orden de impacto.

---

## 2. Detalle por optimización

### O-1. Paginar o agregar en el servidor las respuestas de 1.000 filas
- **Síntoma (VERIFICADO):** respuestas de exactamente 1.000 filas en `A02` (horas de períodos pendientes de la firma: 1.000 de 3.869), `C02` (engagements: 1.000 de 1.015), `W01` (work_orders: 1.000 de 1.003) y `C03` (engagement_wo_state: 1.000 de 1.003). Es el tope `max_rows` de la API (INFERIDO). **Datos incompletos sin ningún error.**
- **Dónde:** `src/hooks/useTimesheetApprovals.ts:170-178` (`time_entries … .in("period_id", periodIds)` sin `.range()`/`.limit()`); las demás pantallas listadas (C02, W01, C03) en sus hooks (VERIFICAR el archivo exacto con `grep` en `src/`).
- **Propuesta:** (a) para aprobaciones, **agregar en el servidor** con una RPC que devuelva solo los totales por línea/período (lo que la pantalla muestra) en vez de traer todas las horas; (b) para listados, **paginar con `.range()`** (o keyset) y cargar por páginas; (c) en las RPC, devolver `count` para que la interfaz sepa cuántas filas hay.
- **Impacto esperado:** corrige el truncado; reduce bytes por respuesta (ver O-5). Tras corregirlo, **las cifras de k6 de esas rutas cambian** (se midieron con respuesta truncada y eran **optimistas**: H-4-02).
- **Riesgo:** cambia el contrato de datos de la pantalla de aprobaciones: probar con roles de firma (admin, senior_partner) y gerentes; revisar las RLS.
- **Cómo verificar:** con una cuenta de firma, `A02` devuelve las 3.869 filas (o el agregado equivalente) y ya no hay respuestas de exactamente 1.000; repetir una medición corta con k6 (`etapa9` con la firma) y comparar `http_req_receiving` y bytes.

### O-2. Fijar la región `us-west-2` de las Edge Functions
- **Síntoma (VERIFICADO):** las funciones se sirven por defecto desde `sa-east-1` (desde Bolivia) con la base en `us-west-2`. **Medido (12 llamadas):** H01 15,8 → 3,9 s y H05 19,9 → 5,7 s al fijar `x-region: us-west-2` (≈ 3,5–4×); login `secure-signin` p50 **2.173 → 719 ms** (n = 30 por brazo; confirmado en el servidor: ejecución 676 ms frente a 1.426–2.064 ms). Con la región fija desaparece también la lentitud del primer minuto de un pico (≈ 1,7×, INFERIDO: arranque en frío).
- **Dónde:** `src/hooks/scheduler/schedulerData.ts:208` y `src/hooks/scheduler/schedulerGapsData.ts:399` (`supabase.functions.invoke("scheduler-data"|"scheduler-gaps", { body })`) y `src/hooks/useAuth.tsx:88` (`secure-signin`).
- **Propuesta:** pasar la región en cada `invoke` (la campaña la fijó con el encabezado `x-region: us-west-2`; `@supabase/supabase-js` 2.86 admite una opción `region` en `functions.invoke`: **VERIFICAR** el nombre exacto en su tipo `FunctionInvokeOptions`).
- **Advertencia de Supabase (decisión del operador, 22/10):** **una región fija NO se redirige sola si esa región cae.** Hay que decidir qué pasa si `us-west-2` falla (por ejemplo, reintentar sin región como respaldo en el cliente).
- **Riesgo:** bajo; cambio de una opción en tres llamadas. Cubrirlo con las pruebas existentes (`useAuth.test.tsx:222` ya verifica la llamada a `secure-signin`; ajustar la expectativa).
- **Cómo verificar:** repetir la comparación pareada de F2A (30 SIN y 30 CON, patrón ABBA) o, más simple, medir en producción el tiempo de ejecución por región en Edge Functions (Observability): debe verse el tráfico solo en `us-west-2`.

### O-3. Alarmas automáticas
- **Por qué:** en la campaña, el criterio manual «detén k6 si la memoria pasa de X» se incumplió dos veces; una regla que depende de una persona no es fiable.
- **Qué:** alarma sobre memoria comprometida (≥ 2,5 GB sostenida, ≥ 2,7 GB crítica), swap (> 50 MB y > 300 MB), 57014 y 5xx en el API Gateway, conexiones y consultas activas largas. Umbrales, fuentes y acciones: `docs/performance/vigilancia-produccion-small.md` §3.
- **VERIFICAR:** qué ofrece el plan de Supabase (métricas exportables, drenaje de logs) antes de montar la alarma; si no hay alarma nativa, un script programado que consulte la base (conexiones, consultas largas) y el panel/API de métricas (memoria y swap).
- **Cómo verificar:** provocar cada alarma una vez en un ambiente de prueba y confirmar que llega el aviso.

### O-4. Optimizar `portfolio_overview` para el alcance de firma
- **Síntoma (VERIFICADO):** admin 3,6–4,2 s por llamada con un usuario, 4,0–5,4 s bajo carga (máx. 8,2 s a 25 req/s); manager, partner y director: 0,2–0,5 s. **Crece linealmente con los encargos visibles (~3,5 ms por encargo):** 1.015 sembrados (la firma los ve todos) frente a 71–89 del alcance «asignado». Es una RPC de ~900 líneas útiles (`evidencia/e3_61_portfolio_overview.txt`). **No es RLS** (la corrección D1 no la tocó).
- **Qué se sabe del daño:** causó el 57014 final de S (a 4/min) y de A2/C (a 170 usuarios); a ritmo realista (0,4/min) no falló en S2 ni S3.
- **Quién la sufre:** 5 admins y 2 senior_partner en las pruebas; en el sistema real, 1 senior_partner y ≤ 2 admins. **Es la ruta más cara, pero pocas personas la abren.**
- **Propuesta (hipótesis; hay que medirlas, no aplicarlas a ciegas):**
  1. **Analizar el plan** con `EXPLAIN (ANALYZE, BUFFERS)` como admin (mismo método de la Etapa 3: `BEGIN READ ONLY`, `SET LOCAL ROLE authenticated` + claims) para ver qué parte del cuerpo consume el tiempo (INFERIDO: cálculo por encargo en bucle, subconsultas repetidas, agregaciones por encargo).
  2. Reescribir en **forma de conjunto** (un agregado por todos los encargos en vez de uno por encargo) o **precalcular** lo que cambia poco (vista materializada o tabla de resumen refrescada por evento o por horario).
  3. **Cachear en el cliente** (React Query con `staleTime` de minutos) si el dato no necesita ser exacto al segundo, y **no recalcularlo** en cada visita.
  4. Si hace falta, **limitar el alcance** de la pantalla (por oficina, por estado o paginado) para quien ve todo.
- **Impacto esperado:** **NO MEDIDO.** Hasta no ver el plan no se puede prometer un número. Con 609 OT reales (legacy) se estimaba ≈ 2 s sin optimizar (INFERIDO).
- **Riesgo:** medio-alto (es lógica de negocio con ~900 líneas); cubrir con comparación de resultados antes/después sobre los mismos datos.
- **Cómo verificar:** misma consulta, mismos datos: **resultados idénticos** y p95 de `D02` bajo 2 s con el alcance de firma; repetir la fase de firma de S2/S3 (ritmo 0,4/min) y la comparación con la línea base (4,0–5,4 s).

### O-5. Reducir el peso de W01, C02 y E01
- **Síntoma (VERIFICADO):** `W01` (listado de OT con embeds): 7.659.122 B por respuesta (1.000 filas); `C02` 2.861.782 B; `E01` 2.378.741 B. En la campaña, `W01` esperó ~1,3 s pero **tardó hasta 58,5 s en descargar** en ~8 % de las llamadas de la firma (H-5-01), y falló a los 60 s (timeout de k6) en las P2 nocturnas del 26/10.
- **Propuesta:** (a) **acotar las columnas** que la pantalla realmente usa (`select` explícito en vez de `*` y embeds anidados); (b) **paginar** (O-1); (c) evitar traer el listado completo cuando la pantalla muestra una parte; (d) valorar compresión del lado del cliente/gateway (**VERIFICAR** si la API ya comprime).
- **Impacto esperado:** menos bytes por respuesta (proporcional al recorte) y menos tiempo de descarga y memoria en la base y en el navegador; medible con k6 (`http_req_receiving` y bytes).
- **Cómo verificar:** bytes de la respuesta antes y después; `W01` p95 de descarga < 1 s en la medición de la firma.

### O-6. Scheduler, corrección B
- **Síntoma (VERIFICADO):** con la región correcta, 5,8–7,7 s de p95 con 128–170 usuarios; las 4 llamadas de la pantalla Gaps (`H04–H07`) superaron 8 s bajo carga **con la base tranquila** (14–24 conexiones, 0 esperas): el tiempo está en la función, no en una consulta lenta.
- **Dónde (VERIFICADO leyendo el código):** `supabase/functions/scheduler-gaps/handler.ts`:
  - `pagedSelect` (l. 256-273 y el comentario de la l. 250) pagina por keyset y **termina solo en una página vacía** (l. 268): una tabla de 1.015 filas cuesta 3 viajes, una de 5.997 cuesta 7; hasta una lectura de menos de 1.000 filas hace 2.
  - `chunkedIn` trocea los `IN` de a 100 (`IN_CHUNK_SIZE`, l. 173) **en serie**.
  - `mapReadError` (l. 319-326) convierte cualquier error de lectura en un 500 `query_failed` **sin registrar `error.code` ni `error.message`**; `index.ts` solo registra la identidad (l. 126) y los errores no manejados (l. 176): un 500 no es atribuible desde los logs.
- **Propuesta:** (a) terminar en la primera página corta o contar filas (ahorra ≥ 1 viaje por lectura; INFERIDO), (b) **paralelizar** los trozos de `IN` y las lecturas independientes, (c) **registrar** `code`, `message` y `what` en `mapReadError` antes de mapear, (d) evitar recalcular lo mismo en cada llamada (H01 devolvió ~287 KB con 500 filas truncadas, INFERIDO como candidato a reducir).
- **Impacto esperado:** **NO MEDIDO**; reducir los viajes de la función baja su tiempo casi proporcionalmente (la base cuesta ~1,5 ms por lectura).
- **Riesgo:** medio (cambia la forma de leer en funciones críticas del Scheduler); cubrir con las pruebas de la función.
- **Cómo verificar:** Scheduler CON región, 4 llamadas de Gaps en paralelo: p95 bajo 6 s con 128 usuarios (hoy 5,8–7,7 s) y sin llamadas > 8 s.

### O-7. Cachear en el frontend lo casi estático
- **Síntoma (VERIFICADO en la captura de S3 del API Gateway, 49.490 solicitudes):** seis rutas concentran ~41 % de las peticiones y devuelven datos que casi no cambian: `global_settings` (3.482), `list_loggable_engagements` (3.381), `activity_codes` ×2 (3.317 y 3.309), `get_week_statuses` (3.310) y `holidays` (3.310).
- **Qué hay que confirmar primero (NO CONFIRMADO):** si el frontend ya las cachea o si el modelo de k6 (que reproduce las llamadas por pantalla) las repite por cada carga de pantalla. Revisar `src/` (React Query: `staleTime`, `gcTime`) y el inventario `bugs/tests/k6/inventario-lecturas-frontend.md`.
- **Propuesta:** `staleTime` de minutos (u horas para `holidays` y `activity_codes`) y compartir la caché entre pantallas; invalidar al cambiar el dato.
- **Impacto esperado:** menos peticiones y menos carga sobre la API y la base (hasta ~40 % de las peticiones si no estaban cacheadas; **INFERIDO**).
- **Cómo verificar:** conteo de peticiones por ruta en el API Gateway antes y después, con la misma actividad.

### O-8. `ANALYZE` y medición con datos reales
- **Síntoma (VERIFICADO):** la consulta de selección de cuentas del lanzador de k6 llegó a tardar **16,6 s** en producción con estadísticas viejas (plan con `rows=1` en casi todos los CTE; H-9-17).
- **Propuesta:** `ANALYZE` justo después de cargar los datos reales, y repetirlo tras cada carga masiva; verificar que el autovacuum/auto-analyze funcione. **Dato del cierre (27/10, VERIFICADO):** tras deshacer la siembra el autoanalyze actualizó solo las tablas grandes en minutos, y los catálogos pequeños (sin ninguna estadística) se analizaron a mano (49 tablas de `public`, sin riesgo de datos); ya no es una condición pendiente de la campaña, pero **hay que repetirlo tras la carga real** (H-9-24).
- **Impacto esperado:** planes de ejecución correctos desde el primer día (la forma de los datos reales no está probada: ver `small-capacidad-y-limites.md` §7).
- **Cómo verificar:** `pg_stat_user_tables.last_analyze`; medición corta de solo lectura de `portfolio_overview`, W01 y aprobaciones con datos reales frente a la línea base.

### O-9. Seguridad (no es rendimiento, pero se halló en la campaña)
- **H-7-01 (INFERIDO por lectura de la política; en la Etapa 7 una sonda confirmó el caso del aprobador):** la política `Staff can update own unlocked periods` (`timesheet_periods`) no limita columnas ni tiene `WITH CHECK`: se puede cambiar con `PATCH` directo `submitted_at`, `is_period_locked` o `total_hours` del propio período y saltarse `submit_timesheet_safe`. Una sonda reveló que **un aprobador puede sobrescribir cualquier columna del período de un subordinado**.
- **H-7-02 (INFERIDO):** `unsubmit_timesheet_safe` decide por la columna legacy `user_roles.role` en vez de `role_key`.
- **Propuesta:** `WITH CHECK` y restricción de columnas (o mover la escritura a RPC); usar `role_key`. Ver `docs/seguridad/registro-seguridad-produccion.md`.
- **Riesgo:** medio; cambia políticas RLS: repetir la regresión RLS por rol.

---

## 3. Cómo medir si una optimización funcionó

1. **Antes:** guardar la línea base con la misma carga (por ejemplo, el escalón de 43 usuarios de S3: livianas p95 430 ms; o la fase de firma de S2/S3) y, si es posible, medir con k6 la ruta concreta.
2. **Después:** repetir la medición con **los mismos datos y el mismo ritmo**. Comparar `http_req_waiting` (servidor) y `http_req_receiving` (descarga) por separado: una mejora de la consulta baja la espera; una mejora del peso baja la descarga.
3. **Resultados idénticos:** toda optimización de lógica (O-4, O-6) debe devolver exactamente los mismos datos; comparar antes y después.
4. **No mezclar variables:** cambiar una cosa por vez, como en la campaña (S → S2 → S3 cambiaron una sola variable).
5. **Registrar** el resultado en `hallazgos_rendimiento.md` (estado `corregido y verificado`).

## 4. Riesgos transversales

- **Cambios de contrato** (O-1, O-5): afectan pantallas; probar con roles de firma y gerentes.
- **Región fija** (O-2): sin respaldo automático; decidir el fallback.
- **La forma de los datos reales** puede cambiar qué es lo caro: tras cargar los datos reales, **re-medir antes de optimizar a ciegas** (por eso O-4 y O-6 van después de la salida).
- **Todo lo que toca RLS** exige repetir la regresión RLS por rol.

## 5. Validar los cambios: la prueba breve posterior (propuesta del operador, 27/10; NO preparada)
**Punto de partida (VERIFICADO el 27/10):** xcdc quedó con 5 clientes, 3 encargos, 3 OT y 3 horas; las cuentas k6, el libro mayor y la siembra ya no existen. **Con ese volumen ninguna de las optimizaciones es medible** (O-1 sin 1.000 filas que paginar, O-4 sin ~1.000 encargos). Hay tres caminos, de menor a mayor costo; elegir uno es decisión del operador:
1. **Regresión RLS y humo con los fixtures** (ya existen; solo lectura): comprueba que los cambios no rompieron permisos ni contratos, no el rendimiento.
2. **Medir con los datos reales ya cargados** (O-8): una medición corta de solo lectura de `portfolio_overview`, W01, C02 y aprobaciones frente a la línea base de la campaña; es la prueba más representativa y no necesita cuentas k6.
3. **Reconstruir un mínimo de k6** (INFERIDO como factible, no probado): reinstalar el esquema de siembra desde `siembra_k6/00_install.sql`, crear pocas cuentas (esto requiere la secret key `k6-campana`, que sigue viva hasta el paso 11) y sembrar un volumen reducido, con ensayo, frase y limpieza propios; se mediría un escalón corto (p. ej. 43 usuarios) comparable con S3. **Costo:** repite parte del trabajo de la campaña, escribe en producción y exige limpiar otra vez; por eso conviene hacerlo solo si los caminos 1 y 2 no bastan.
**Qué comparar en cualquiera de ellos:** `http_req_waiting` y `http_req_receiving` por separado, mismos datos y mismo ritmo (§3), y los mismos resultados antes y después para O-4 y O-6.
**Si se va a hacer el camino 3, no ejecutar el paso 11 ni el 6b del cierre antes** (rotar la contraseña y borrar la key obliga a rehacer las credenciales).
