# Infraestructura de producción de EMS (Supabase Small): qué tenemos, cuánto aguanta y qué vigilar

**Estado:** VERSIÓN FINAL, 27/10/2026. Revisada por Opus (`bugs/tests/k6/produccion/revision_opus.md`, entrada del 27/10 11:51), con sus correcciones aplicadas. La configuración de la §2 se leyó en producción ese mismo día, con consultas de solo lectura. Las cifras de carga vienen de la campaña k6 sobre producción (Etapas 3–9, 20–26/10/2026). La campaña se cerró en xcdc el 27/10 (§13).
**Para quién:** el equipo técnico y quien decida el cómputo.
**Para qué sirve:**
1. Describir la infraestructura que hay hoy (§2).
2. Mostrar con evidencia hasta dónde aguanta la instancia **Small** y dónde están sus límites (§5–§7).
3. Si aparecen problemas de rendimiento en producción, ubicarlos, compararlos con lo medido y decidir (§8–§10).
4. Listar lo que falta antes de la salida (§14).

**Marcas:**
- **VERIFICADO:** medido, o leído en código, SQL, capturas, logs o la documentación oficial de Supabase.
- **INFERIDO:** deducido, no medido.
- **NO CONFIRMADO.**
- **VERIFICAR:** dato que hay que confirmar en el panel o en la factura.

**Evidencia cruda:** `bugs/tests/k6/produccion/`. No se versiona; se cita por nombre.
**Documentos hermanos:** `docs/performance/vigilancia-produccion-small.md` (alarmas y criterio para Medium) y `docs/performance/plan-optimizacion-cuellos-de-botella.md` (cómo corregir lo que aquí se describe).

---

## 1. Resumen (una página)

**Veredicto técnico (VERIFICADO + INFERIDO):** con la mezcla de uso esperada, **Small sostuvo 128 usuarios simultáneos durante 60 min y 170 durante 18 min**, sin errores de la base (0 × 57014 y 0 × 5xx de la base). **El primer recurso que se acerca a su límite es la memoria**, no la CPU, el disco ni las conexiones. Se sale en Small con vigilancia.

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿Qué tenemos? | Supabase **Small** (2 GB de RAM y CPU compartida) en `us-west-2`, con PostgreSQL 17.6, PostgREST 14.5, el pooler Supavisor, 13 Edge Functions en el repositorio y el frontend en Railway | §2 |
| ¿Cuánto cuesta el cómputo? | Small **~US$15/mes** (US$0,0206/h); con el crédito de cómputo de US$10/mes del plan Pro, **~US$5 netos**. Medium ~US$60/mes (~US$50 netos) | §2.2, §10 |
| ¿Aguanta ~140 usuarios (lo esperado)? | **Sí, entre dos puntos medidos:** 128 usuarios durante 60 min y 170 durante 18 min. 140 no se midió directamente | S2 (§5.5) y S3 (§5.6) |
| ¿Aguanta 170 con la firma a ritmo realista? | **Sí, durante 18 min.** No se probó una meseta larga a 170, y la memoria aún subía al final | S3 |
| ¿Qué lo rompió en las pruebas? | `portfolio_overview` de admin y senior_partner **abierta 4 veces por minuto**, un ritmo irreal: 57014 a los 29,6 min, con memoria de 2,6 GB y swap subiendo | S (§5.7); A2 y C de la Etapa 8 |
| ¿Cuál es el cuello de botella? | La **memoria** (pico de 2,42 GB sobre 2,89 GB de capacidad plena) y el **costo de `portfolio_overview`** para quien ve todos los encargos | §6.1 y §6.2 |
| ¿Subir a Medium lo resuelve todo? | **No.** Medium duplica la RAM con la **misma clase de CPU compartida**: da margen de memoria, no menor latencia. No arregla la región del Scheduler, el tope de 1.000 filas ni el peso de W01 | §10 |
| ¿Qué no se probó? | Datos reales, ráfagas, correo y crones en vivo, una segunda pasada en otra franja y un soak largo a 170 | §7 |

**Decisión vigente (operador, 26/10/2026):** las primeras semanas se usa **Small** y se mide con datos reales. Medium se evalúa solo con el criterio de la §10.

**Riesgo aceptado (operador, 26/10/2026):** se omitió la Pasada 2 (una sola pasada por condición). Está firmado en el informe de la Etapa 9, §17.

---

## 2. La infraestructura actual (VERIFICADO el 27/10/2026)

### 2.1 Componentes

| Componente | Qué es | Fuente |
|---|---|---|
| Proyecto de producción | Supabase `xcdcxtduotwgwmhxvsiz` (xcdc) | campaña |
| Región de la base | `us-west-2` | campaña |
| Frontend | React 18 + Vite + TypeScript, **alojado en Railway** (modelo decidido el 11/09/2026; Lovable quedó fuera). **VERIFICAR** el servicio de Railway activo y su dominio | `docs/operations.md` §Deployment |
| API de datos | PostgREST **14.5**, que aplica la RLS por usuario | `pg_stat_activity` |
| Pooler de conexiones | **Supavisor**, delante de PostgreSQL | `pg_stat_activity` |
| Autenticación | Supabase Auth; el login pasa por la Edge Function `secure-signin` | código y campaña |
| Edge Functions (en el repositorio, 13) | `assign-user-role`, `auth-email-hook`, `dashboard-data`, `exchange-rate-sync`, `manage-auth-user`, `register-user`, `request-password-reset`, `scheduler-data`, `scheduler-gaps`, `secure-signin`, `send-notification-emails`, `test-resubmission-state`, `unlock-account`. **`dashboard-data` no está desplegada en xcdc** (VERIFICADO por la guarda de k6). **VERIFICAR** en el panel qué versión de cada función está desplegada | `supabase/functions/` |
| Región de las Edge Functions | Por defecto, desde Bolivia se sirven desde `sa-east-1`, lejos de la base: hace a `scheduler-*` y a `secure-signin` 3–4× más lentas que con `x-region: us-west-2` | H-4-01, H-4-03 |
| Correo | Microsoft Graph, vía `send-notification-emails`, que vacía `notification_emails`. Hoy está **apagado** (el cron `notif-email-drain` está inactivo) | `docs/operations.md`, §2.4 |
| Tipo de cambio | Microservicio TC Ruizmier (Railway) más `exchange-rate-sync` | `docs/operations.md` |
| Almacenamiento (Storage) | 2 buckets, 0 objetos | SQL |

### 2.2 Cómputo: Small comparado con los tamaños vecinos

Los datos vienen de la documentación oficial de Supabase («Compute and Disk» y «Manage Compute usage»), consultada el 27/10/2026.

| Tamaño | Precio de lista | Neto con el crédito de US$10/mes | CPU | Memoria | Conexiones directas máx. | Clientes del pooler máx. | Disco base (rendimiento / IOPS) |
|---|---|---|---|---|---|---|---|
| Micro | ~US$10/mes | ~US$0 | compartida | 1 GB | 60 | 200 | 11 MB/s / 500 |
| **Small (el actual)** | **~US$15/mes (US$0,0206/h)** | **~US$5** | **compartida** | **2 GB** | **90** | **400** | **22 MB/s / 1.000** |
| Medium | ~US$60/mes (US$0,0822/h) | ~US$50 | compartida | 4 GB | 120 | 600 | 39 MB/s / 2.000 |
| Large | ~US$110/mes (US$0,1517/h) | ~US$100 | 2 vCPU dedicadas | 8 GB | 160 | 800 | 79 MB/s / 3.600 |

**Cómo se factura y se cambia el tamaño:**
- El cómputo se factura **por hora**.
- Cambiar de tamaño suele aplicarse con **menos de 2 minutos de interrupción** (según Supabase; puede tardar más).
- El crédito de cómputo (US$10/mes, no acumulable) aplica a los planes de pago. **VERIFICAR** en la factura el plan de la organización y la cifra real; el operador citó «de 10 a 50», que coincide con el neto de Medium.
- El disco por defecto (gp3) da 3.000 IOPS y 125 MB/s. El efectivo es el menor entre ese límite y el del tamaño de cómputo, con ráfagas sobre la base mientras dure el presupuesto de E/S.

**Lo que muestra el panel de xcdc (VERIFICADO en capturas):**
- «Total RAM» 1,89 GB;
- «capacidad plena» de memoria comprometida **2,89 GB**;
- umbral de advertencia del panel **1,94 GB** («50 % de la RAM + 1 GiB»; H-6-03).

### 2.3 Configuración de PostgreSQL (`pg_settings` y `pg_roles`, solo lectura)

| Parámetro | Valor | Qué significa para nosotros |
|---|---|---|
| Versión | **PostgreSQL 17.6** (x86_64) | — |
| `max_connections` | **90** | En la campaña se usaron hasta 24 |
| `shared_buffers` | **512 MB** | Caché propia de Postgres. La base entera (61 MB hoy, 121 MB con la siembra) cabe en ella |
| `effective_cache_size` | 1,5 GB | Lo que el planificador supone de caché total |
| `work_mem` | **5 MB** por operación | Los ordenamientos y hashes grandes, como `portfolio_overview`, pueden usar disco temporal si lo superan (INFERIDO; ver O-4) |
| `maintenance_work_mem` | 128 MB | — |
| Trabajadores | `max_worker_processes` 6; paralelos 2 (1 por consulta) | Poco paralelismo: una consulta pesada usa casi un solo núcleo |
| `random_page_cost` | 1,1 | Ajustado para SSD |
| `statement_timeout` | global 120 s; **`authenticated` 8 s**, **`anon` 3 s**; `authenticator` 8 s con `lock_timeout` 8 s | Toda consulta de un usuario que pase de 8 s devuelve **57014** |
| `idle_in_transaction_session_timeout` | 0 (desactivado) | Una transacción abierta y olvidada no se corta sola |
| `wal_level` | `logical` | — |
| `track_functions` | `none` | La campaña lo había puesto en `all` y se revirtió el 27/10 |
| `autovacuum` | activado | Actualizó solo las estadísticas de las tablas grandes tras el cierre |
| Extensiones | `pg_cron` 1.6.4, `pg_net` 0.20.4, `pg_stat_statements` 1.11, `pgcrypto`, `supabase_vault` 0.3.1, `uuid-ossp` | — |
| Bibliotecas precargadas | `pg_stat_statements`, `pgaudit`, `pg_cron`, `pg_net`, `auto_explain`, `supabase_vault`, entre otras | — |
| Último reinicio de Postgres | 27/10/2026 01:46 UTC (21:46 del 26/10 en La Paz; el que hizo el operador antes de P2) | `pg_postmaster_start_time()` |

### 2.4 Base de datos y seguridad (esquema `public`)

| Dato | Valor |
|---|---|
| Tablas | **49**, todas con RLS activa |
| Políticas RLS | **187**. Línea base: md5 `7a666e9764d80d5fb55811a4e23a72de` (nombre, comando, `qual`, `with_check` y roles), para comparar antes de cargar los datos reales |
| Vistas / funciones / triggers / índices | 10 / 229 / 87 / 144 |
| Tamaño | **61 MB** en total (tablas de `public`: 42 MB) |
| Usuarios | 18: 17 cuentas de prueba RLS (`rls-xcdc-20261016-*`) más 1 administrador real. Ver §14, punto 1 |
| Datos de negocio | Solo los de las cuentas de prueba: 5 clientes, 3 encargos, 3 OT, 3 horas, 2 períodos, 3 líneas de aprobación, 2 + 2 de presupuesto y 4 asignaciones. **Los datos reales aún no se cargaron** |

**Crones (`pg_cron`), 12 en total:**

| Estado | Crones |
|---|---|
| **Activos (4)** | `finalize-engagements` (04:30 UTC), `notif-purge-daily` (05:30), `notif-email-purge-daily` (05:35), `auth-email-throttle-purge-daily` (05:40) |
| **Inactivos (8)** | `finalize-stale-timers` (cada 15 min), `notif-email-drain` (cada 5 min), `notif-engagement-daily` y `notif-wo-daily` (12:00), `notif-reminder-timesheet-daily` (13:00, L–V), y los recordatorios semanales de aprobación, fondos y cuotas (lunes 13:10–13:30) |

Los 8 inactivos estaban activos el 18/10. Siguen apagados por decisión del operador, porque el correo y los crones se operarán de forma externa (Railway y Graph). Ver H-9-22 y §14.

---

## 3. Cómo se probó (y por qué se puede confiar, con límites)

- **Generador:** k6 desde una PC en Bolivia contra producción. Modelo **cerrado**: 1 usuario virtual = 1 persona con 1 cuenta, una sesión por usuario y renovación de JWT real.
- **Mezcla:**
  - lecturas y pantallas de cada rol: tiempo medio entre pantallas T = 52 s, objetivo de 25 req/s con 170 usuarios;
  - carga de horas, timers, envíos, aprobaciones y presupuesto;
  - **intentos indebidos** contra la RLS: 100 % rechazados, 0 aceptados en toda la campaña;
  - la **firma** (admin y senior_partner) con sus rutas pesadas.
- **Fases:**
  - Etapa 3: costo SQL de la RLS;
  - Etapa 4: línea base;
  - Etapa 5: lecturas a 25–30 req/s;
  - Etapa 6: logins;
  - Etapa 7: escrituras;
  - Etapa 8: mezcla a 128 y 170 usuarios;
  - Etapa 9: soak de 128 × 60 min, diagnóstico D9, S2 y S3.

  La Pasada 2 (repetir en otra franja) **se omitió** por decisión del operador.
- **Observación de la base:** `pg_stat_activity` cada 10 s, más capturas de Observability del panel tomadas a mano por el operador cada ~5 min (**no las mide k6**).
- **Límites de la medición:**
  - una sola pasada por condición;
  - una sola PC generadora (en dos intentos nocturnos de P2, la red de la casa del operador degradó la medición; §6.8);
  - datos sintéticos;
  - solo la práctica 1 (Auditoría) y una sociedad.

---

## 4. Referencias de latencia en buen estado

Medidas en S3 (26/10), escalón de 43 usuarios, desde la PC y con buena red:
- **lecturas livianas y pesadas:** p50 244 ms, p95 433 ms;
- **espera del servidor:** p50 243 ms, p95 416 ms;
- **descarga:** ≈ 0;
- **escrituras:** p95 ≈ 0,3 s.

Sirven de línea base para decidir si «algo está lento» (§8).

---

## 5. Evidencia por capacidad

### 5.1 Etapa 3 — Costo SQL de la RLS (usuario único, 270 consultas)
- Las políticas por fila en cascada daban 1–4 s con un usuario, y hasta 8,2 s en los peores casos.
- La corrección D1 (15 funciones de conjunto, aplicada en xcdc el 20/10) bajó consultas de 3–4 s a 3 ms, y 28 celdas que daban HTTP 500 pasaron a 200.
- **Queda `portfolio_overview`**, que no es un problema de RLS.

### 5.2 Etapa 5 — Lecturas hasta 170 usuarios
- Latencias: PASAN a 25 req/s (livianas p95 419 ms; REST logrado 24,7 y 29,1 req/s).
- Memoria comprometida: cruzó el umbral de advertencia (1,94 GB), con picos de **2,2–2,3 GB**.
- Swap ≤ 33 MB; CPU de la base hasta ~49 %.

### 5.3 Etapa 6 — Logins
- **458 logins, 0 fallos, 0 × 429:** 170 en 60 s (p95 2,5 s) y 220 en 60 s (p95 2,3 s).
- El primer minuto del pico es ≈ 1,7× más lento.
- Con la región fija en `us-west-2`, el login baja de 2,17 s a 0,72 s (p50, ritmo bajo; H-4-03).

### 5.4 Etapa 7 — Escrituras
- La RLS rechazó el 100 % de los intentos indebidos.
- Escrituras p95 ≈ 400 ms.
- La base casi no se movió: CPU ≤ 11 %, memoria comprometida 1,51–1,55 GB.

### 5.5 S2 — 128 usuarios durante 60 min, firma a ritmo realista (la prueba central)
- **Sin aborto:** 0 × 57014 y 0 × 5xx de la base. Hubo 2 `BOOT_ERROR` de Edge Functions, absorbidos por el reintento.
- 133 renovaciones de JWT sin fallo (máx. 41 por 5 min); 88.579 iteraciones.
- p95 por tercio de la meseta (128 / 128b / 128c):

  | | 1.er tercio | 2.º tercio | 3.er tercio |
  |---|---|---|---|
  | Livianas | 414 ms | 400 ms | 426 ms |
  | Pesadas | 2.074 ms | 1.953 ms | 2.204 ms |
  | Dashboard | 559 ms | 511 ms | 587 ms |
  | Escrituras | 321 ms | 279 ms | 297 ms |

  → **degradación del 3.er tercio ≤ 1,06×.**
- `portfolio_overview` de la firma: p95 de servidor 4,1–4,5 s, ninguna falla.
- Memoria comprometida 1,9–2,42 GB; **swap ≈ 0**.
- Scheduler CON p95 5,8–7,7 s (REVISAR, conocido).

### 5.6 S3 — 170 usuarios, meseta de 18 min, firma a ritmo realista
- **Sin aborto:** 0 × 57014 y 0 × 5xx; 178 sondas rechazadas.
- p95 por escalón:

  | | 43 | 85 | 128 | 170 |
  |---|---|---|---|---|
  | Livianas | 430 ms | 425 ms | 407 ms | 417 ms |
  | Pesadas | 1.252 ms | 1.899 ms | 2.083 ms | 2.142 ms |
  | Escrituras | 339 ms | 311 ms | 288 ms | 311 ms |

- `portfolio_overview` de la firma: n = 7, máx. 5,15 s, todas con 200.
- Memoria 1,34 → ~2,0 GB (escalón de 128) → **2,26 GB en vivo y ≈ 2,35 GB en la gráfica**; swap 0; CPU de la base 9–23 %.
- **Reservas:**
  - la memoria subía 0,2–0,3 GB en los últimos 10 min de la meseta: con solo 18 min no se puede separar el «patrón de S2» (sube y baja) de un crecimiento que habría seguido;
  - 7 llamadas a `portfolio_overview` son una muestra chica: con 0 fallos, la cota de fallo por llamada sigue siendo de hasta ~40 %. No prueba que la RPC tenga margen a 170.

### 5.7 Lo que falló: S (firma a 4 por minuto) y la Etapa 8 a 170
- **S:** cortada a los 29,6 min por un 57014 final de `portfolio_overview` (8,3 s, con el reintento incluido); memoria 2,6 GB con swap subiendo; p95 de la firma 6,7 s ya con 85 usuarios.
- **Etapa 8:** con 170 usuarios, `portfolio_overview` cruza el `statement_timeout` (A2: 57014 en 4 de 31 llamadas; C, solo lecturas: 3 × 57014 que el reintento absorbió). La memoria entró en advertencia (2,31 GB) ya con 85 usuarios.
- **Lectura (INFERIDA, con alta probabilidad):** la firma a 4/min es un ritmo irreal (la abren ~7 personas pocas veces por hora). La comparación de A2 con S3 cambia una sola variable de carga (la firma a 4/min frente a 0,4/min, con 170 usuarios): con 0,4/min no hubo 57014. Es una sola corrida por condición.

### 5.8 D9 — Solo lecturas, 128 usuarios, 20 min de meseta
- Sin aborto, 0 × 57014; memoria 1,9–2,11 GB, swap 0.
- Comparada con S2, atribuye ~0,3 GB a escrituras y renovaciones (INFERIDO: D9 también duró menos).

---

## 6. Límites conocidos: mecanismo, síntoma esperado en producción y umbral

### 6.1 Memoria (el primer recurso que se acerca al límite)
- **Evidencia:**
  - pico de 2,42 GB (S2) y ≈ 2,35 GB (S3) sobre 2,89 GB de capacidad plena (advertencia a 1,94 GB);
  - S llegó a 2,6 GB con swap subiendo antes de fallar;
  - la memoria **usada** fue ≤ ~1,85 GB; el resto es caché;
  - CPU (≤ ~49 %), disco, E/S y conexiones (≤ 24 de 90) no se acercaron a un límite.
- **Qué la mueve (INFERIDO):** la concurrencia (conexiones y procesos), las respuestas grandes y la firma abriendo `portfolio_overview` demasiado seguido. El volumen de datos no: la base es de 61–121 MB y cabe en los 512 MB de `shared_buffers`.
- **Síntoma en producción:** memoria comprometida ≥ 2,5 GB sostenida y swap > 50 MB. Si se sobrepasan los 2,89 GB, es posible un reinicio por falta de memoria (INFERIDO).
- **Caída sin explicar:** en S2 (14:35) la memoria bajó de 2,4 a 1,9 GB junto con un escalón de swap. Causa NO CONFIRMADA.

### 6.2 `portfolio_overview` (Dashboard Cartera) para quien ve todos los encargos
- **Evidencia:**
  - admin: 3,6–4,2 s por llamada con 1 usuario; 4,0–5,4 s bajo carga; máx. 8,2 s a 25 req/s;
  - manager, partner y director: 0,2–0,5 s;
  - crece **linealmente con los encargos visibles (~3,5 ms por encargo)**: la siembra tenía 1.015 encargos.
- **Volumen real:** el legacy tiene 609 OT (`OrdenTrabajoCliente`). **Si cada OT del legacy equivale a un encargo** (en la siembra la relación fue ~1:1; INFERIDO, no comprobado con el ETL), el costo inicial sería menor que el medido. Pero los encargos se acumulan con el tiempo: **hay que medirlo con los datos reales** (O-8).
- **Quién la sufre:** pocas personas. En la matriz de cuentas hay 5 admins y 2 senior_partner; en el sistema real se esperan 1 senior_partner y ≤ 2 admins (dato del informe de la campaña; VERIFICAR con la lista de usuarios real).
- **Síntoma en producción:** 57014 (HTTP 500 con código 57014) si varias de esas personas la abren a la vez o muy seguido; la «cartera» va lenta solo para ese rol.

### 6.3 Scheduler (Edge Functions `scheduler-data` y `scheduler-gaps`)
- **Evidencia:**
  - servido desde `sa-east-1` (el valor por defecto desde Bolivia): H01 15,8 s y H05 19,9 s;
  - con `x-region: us-west-2`: 3,9 s y 5,7 s (≈ 3,5–4× menos);
  - con la región correcta y 128–170 usuarios: p95 de 5,8–7,7 s (REVISAR en todas las pruebas);
  - la pantalla Gaps (4 llamadas en paralelo) superó los 8 s bajo carga **con la base tranquila**: las lecturas son en serie dentro de la función.
- **Síntoma en producción:** la pantalla del Scheduler tarda de 5 a 25 s, según la región y la carga.

### 6.4 Tope de 1.000 filas de la API (problema de corrección, no de rendimiento)
- **Evidencia:** `A02` (horas de períodos pendientes de la firma) devolvió 1.000 de 3.869; `C02` 1.000 de 1.015; `W01` y `C03` 1.000 de 1.003. Código sin paginar: `src/hooks/useTimesheetApprovals.ts:173-175`.
- **Síntoma en producción:** **datos incompletos sin ningún error** (listas truncadas).

### 6.5 Respuestas muy grandes (W01 7,6 MB, C02 2,9 MB, E01 2,4 MB)
- **Evidencia:** `W01` espera p50 ~1,3 s, pero su descarga llegó a **58,5 s** en ~8 % de las llamadas de la firma (Etapa 5, H-5-01).
- Los timeouts de W01 en las P2 nocturnas del 26/10 **no cuentan como evidencia de W01**: esa noche la causa fue la red (§6.8).
- **Síntoma en producción:** una pantalla pesada «se queda cargando» decenas de segundos y falla a los 60 s, sobre todo con redes lentas.

### 6.6 Login (`secure-signin`)
- **Evidencia:** servido desde `sa-east-1`, p50 de 2,2 s a ritmo bajo, y ≈ 1,7× más lento el primer minuto de un pico; con la región fija, 0,72 s.
- **Auth no puso límites** hasta 220 logins en 60 s (0 × 429). La razón por la que no rigió el cubo de 150 por 5 min está NO DETERMINADA.

### 6.7 Renovación de JWT a escala
- S2: 133 renovaciones, 0 fallos, p95 280 ms, máx. 41 por ventana de 5 min (límite del plan de pruebas: 100; límite de Supabase: 150 por 5 min por IP).

### 6.8 La red del cliente puede parecer un problema de la base
- **Evidencia:** en el 2.º intento nocturno de P2 (escalón de 43 usuarios, desde la red de la casa del operador):
  - espera del servidor p50 433 / p95 2.230 ms, frente a 243 / 416 ms en S3;
  - **descarga** p95 3.560 ms, frente a 12 ms;
  - la base estaba ociosa.

  Lectura (INFERIDA): la vía HTTPS entre la PC y la API estaba degradada.
- **Cómo distinguirlo:** separar la **espera (TTFB)** de la **descarga** (en el navegador: pestaña Network → Timing; en k6: `http_req_waiting` y `http_req_receiving`). Si la base está tranquila (§8) y lo lento es la descarga, no es capacidad de la base.

---

## 7. Lo que NO se probó (y por tanto no está garantizado)

1. **Datos reales.** El volumen sembrado no es el real:
   - **horas:** 95.715 frente a 138.546 del legacy (el real tiene ~45 % más);
   - **OT:** 1.003 frente a 609 (la prueba tuvo más);
   - **personas activas:** 211 frente a ~133.

   La forma de los datos reales (encargos gigantes, concentración de horas) no se reprodujo, y **ninguna ruta se midió con datos reales**. Ver `vigilancia-produccion-small.md` §7b.
2. **Una segunda pasada** de cada condición, en otra franja u otro día. En Test los colapsos fueron intermitentes, y aquí cada condición se probó una vez (riesgo aceptado, §1).
3. **140 usuarios directamente** (se midió 128 × 60 min y 170 × 18 min) y **un soak largo a 170**.
4. **Ráfagas** (todos entrando el lunes a primera hora, cierres de semana o de mes) y **más de 170 usuarios** (la fase exploratoria de 190/215 no corrió).
5. **Correo y crones en vivo** (Microsoft Graph y Railway): suman carga a la misma base y no se probaron.
6. **Otras prácticas, especialistas IT/Tax y otras sociedades:** solo se probó la práctica 1 (Auditoría) y una sociedad.
7. **El comportamiento del navegador real** (caché, pestañas abiertas, red móvil): el modelo reproduce las llamadas del frontend, no al navegador.
8. **Medium:** nunca se midió (§10).

---

## 8. Guía de diagnóstico: «tenemos un problema de rendimiento en producción»

Primero, **qué mirar en 5 minutos** (Observability → Database, y logs del API Gateway):

| Síntoma | Qué comprobar | Cómo leerlo con este documento | Acción |
|---|---|---|---|
| Todo lento para todos | Memoria comprometida, swap y CPU de la base | Memoria ≥ 2,5 GB sostenida o swap > 50 MB → §6.1. Si la base está tranquila y lo lento es la **descarga** → §6.8 (red) | §6.1: aplicar el criterio de Medium (§10). §6.8: probar desde otra red |
| «Cartera» o dashboard de firma lento o con error 500 | Logs de la API: ¿hay 57014 en `portfolio_overview`? | §6.2: coincide con el límite conocido | Pedir que no la abran muchas veces; ver O-4 en `plan-optimizacion…` |
| El Scheduler tarda 5–25 s | ¿Se invoca con `x-region: us-west-2`? | §6.3: sin región cuesta 3–4× más | Fijar la región (O-2) |
| Listas a las que «les faltan filas», sin error | ¿Respuestas de exactamente 1.000 filas? | §6.4 | Paginar (O-1): es corrección de datos |
| Una pantalla se queda cargando y falla a los 60 s | ¿Respuesta de varios MB (W01, C02, E01)? ¿Red lenta? | §6.5 y §6.8 | Paginar o acotar columnas (O-5) |
| Login lento al inicio del día | ¿`secure-signin` sin región? ¿Es el primer minuto del pico? | §6.6 | Fijar la región (O-2) |
| Errores 429 | Logs de Auth: logins y renovaciones por 5 min desde una IP | §6.6 y §6.7: el límite documentado de Supabase es de 150 por 5 min por IP, pero no se alcanzó en las pruebas | Escalonar; si se repite, consultar a Supabase |
| Timers que no se cierran o recordatorios que no llegan | ¿Los crones de §2.4 están activos (o su equivalente en Railway)? | §2.4 y H-9-22: no es un problema de rendimiento | Reponer los crones |

**Consultas de solo lectura** para ver el estado de la base:

```sql
select state, count(*) from pg_stat_activity group by state order by 2 desc;                       -- conexiones (en la campaña, hasta 24 de 90)
select pid, now() - query_start as duracion, left(query, 100) as consulta
  from pg_stat_activity where state = 'active' and pid <> pg_backend_pid() order by 2 desc limit 10;  -- consultas activas largas (el límite es 8 s)
select jobname, active from cron.job order by active desc, jobname;                                 -- crones activos
```

**Valores de referencia (§4 y §5):**

| Ruta | Valor medido (p95 salvo que se indique) |
|---|---|
| Lecturas livianas | ~0,4 s |
| Lecturas pesadas | ~2 s |
| Dashboard | ~0,5 s |
| Escrituras | ~0,3 s |
| `portfolio_overview` de la firma | 3,5–5,4 s |
| Scheduler CON (con región) | 5,8–7,7 s |
| Login (p50) | ~2,2 s sin región; ~0,7 s con región |

Si lo observado está dentro de esos rangos, **es el comportamiento medido, no una regresión**. Si es mucho peor (≥ ~2×), tratarlo como aviso (`vigilancia-produccion-small.md` §3).

---

## 9. Recomendaciones (resumen)

1. **Salir en Small con vigilancia:** alarmas de memoria, swap, 57014 y 5xx (`vigilancia-produccion-small.md`).
2. **Antes de salir:** la lista de la §14.
3. **Con los datos reales cargados:** `ANALYZE` y una medición corta, de solo lectura, de las rutas pesadas antes de abrir a todos (§7). Comparar también la huella de las políticas RLS con la línea base de la §2.4.
4. **Primeras semanas, Small y medir.** Registrar a diario:
   - el pico de memoria comprometida (valor y hora);
   - el swap;
   - los 57014 y los 5xx;
   - la latencia de `portfolio_overview`;
   - la cola de correos pendientes.

   Con 2–3 semanas de datos reales se decide si Small basta, **con números propios y no con los de las pruebas** (§10.3).
5. **Subir a Medium** solo con el criterio de la §10; no por el Scheduler, el tope de filas ni el peso de W01.
6. **Repetir una prueba de carga** (idealmente S2/S3, de día y con buena red) si cambian el volumen, la mezcla o el cómputo. Las cuentas k6 y la siembra ya no existen: habría que reconstruirlas (§13).

---

## 10. ¿Medium? Qué esperar según las pruebas

**Qué cambia frente a Small** (documentación oficial de Supabase, §2.2):
- **RAM ×2** (2 → 4 GB);
- **la misma clase de CPU compartida**;
- conexiones directas 90 → 120 y clientes del pooler 400 → 600;
- disco base 22 → 39 MB/s y 1.000 → 2.000 IOPS.

**Costo:** de ~US$15 a ~US$60 al mes de lista (**4×**). Netos del crédito de US$10, de ~US$5 a ~US$50 (VERIFICAR en la factura). Se factura por hora, y el cambio de tamaño supone una interrupción breve (normalmente menos de 2 min).

**Qué resolvería y qué no.** Medium **nunca se midió**; el análisis se basa en lo que limitó a Small en las pruebas.

| Problema observado | ¿Lo resuelve Medium? | Razón |
|---|---|---|
| Margen de memoria (pico de 2,4 GB sobre 2,89 GB; 2,6 GB con swap fue lo que precedió al fallo de S) | **Sí: es su valor** | Duplica la RAM, y la memoria fue el primer recurso en acercarse al límite |
| Latencia de `portfolio_overview` (3,6–5,4 s; 57014 si se abre muy seguido) | **Probablemente no** (INFERIDO) | Es costo de consulta, y Medium tiene la misma clase de CPU compartida. Puede ayudar indirectamente: menos presión de memoria bajo carga |
| Scheduler lento (5,8–7,7 s con región; 12–25 s sin ella) | **No** | Es la región y las lecturas en serie dentro de la función (código) |
| Listas truncadas a 1.000 filas | **No** | Configuración de la API y código sin paginar |
| W01 de 7,6 MB, lento de descargar | **No** | Es el peso de la respuesta y la ruta de red |
| Login lento (2,2 s sin región) | **No** | Es la región de la función |
| CPU, disco, E/S y conexiones | No hacen falta | Nunca se acercaron al límite (CPU ≤ ~49 %; conexiones ≤ 24 de 90) |

**Cuánto mejoraría:** **no hay dato medido.** La mejora esperada es en **margen de memoria**, no en latencia. Para cuantificarla haría falta una corrida de S2 o S3 sobre Medium. Al facturarse por hora, el cómputo de una prueba de unas horas costaría centavos; el costo real es rehacer las cuentas y la siembra de prueba. No hace falta para decidir.

**Cuándo optar por Medium.** El criterio se acordó de antemano (`vigilancia-produccion-small.md` §4). Basta cualquiera de estos casos, confirmado en dos días distintos:
- memoria comprometida ≥ 2,6 GB sostenida 10 min, dos veces;
- swap > 100 MB y subiendo;
- un 57014 de `portfolio_overview` con el uso normal de la firma;
- un reinicio de la base por falta de memoria;
- CPU > 80 % durante 3 min, con regularidad.

**No** subir solo por el Scheduler lento, por los 400/403 esperados ni por un pico aislado. **Antes de pagar Medium**, descartar lo que Medium no arregla: región del Scheduler, paginación y peso de W01 (`plan-optimizacion…`, O-1 a O-5).

### 10.3 Qué se mide en las primeras semanas para decidir (con datos reales)

| Qué | Dónde | Frecuencia | Para decidir |
|---|---|---|---|
| Pico de memoria comprometida y su hora | Observability → Database | Diario (cada hora los primeros días) | ¿Pasa de 2,5–2,6 GB? ¿Hay tendencia creciente? |
| Swap | Observability → Database | Diario | > 50 MB: aviso; > 100 MB y subiendo: Medium |
| 57014 y 5xx | Logs del API Gateway y de Postgres | Diario | Cualquier 57014 de `portfolio_overview` con uso normal → criterio de Medium |
| Latencia de `portfolio_overview`, W01 y aprobaciones con datos reales | Medición corta de solo lectura | Al cargar los datos y luego semanal | Desvío ≥ ~2× respecto a la §8 |
| Conexiones y consultas largas | `pg_stat_activity` | Diario | > 60 de 90: aviso |
| Efecto de los trabajos externos (Railway, Graph) | Memoria y CPU antes y después de cada puesta en marcha | Al activar cada uno | ¿Suben la memoria? |

**Al final del primer mes:** revisar los registros y decidir si se sigue en Small, se sube a Medium o se ajustan los umbrales.

---

## 11. Reservas abiertas

- la cifra exacta del swap en S2;
- la causa de los 2 `BOOT_ERROR` de Edge Functions en S2;
- la causa de la caída de memoria de S2 (14:35);
- la pendiente de memoria en los últimos 10 min de S3;
- el Scheduler en REVISAR en todas las pruebas;
- la Pasada 2 omitida (excepción firmada por el operador);
- **el volumen y la forma de los datos reales**, incluida la equivalencia entre las OT del legacy y los encargos de EMS (§6.2).

---

## 12. Índice de evidencia (en `bugs/tests/k6/produccion/`)

| Qué | Archivo |
|---|---|
| Registro vivo de hallazgos (H-3 a H-9) | `hallazgos_rendimiento.md` |
| Informe de las Etapas 0–7 | `informe_etapas_1_a_7_20261024.md` |
| Informe de la Etapa 8 (mixta) | `etapa8/informe_etapa8.md` |
| Informe de la Etapa 9 (S, D9, S2, S3, P2, excepción y cierre) | `etapa9/informe_etapa9.md` |
| Análisis de S2, S3 y P2 (2.º intento) | `evidencia/etapa9_20261026-133151_analisis.md`, `…164824_analisis.md`, `…221946_analisis.md` |
| Revisiones de Opus | `revision_opus.md` |
| Registro de seguridad de producción | `docs/seguridad/registro-seguridad-produccion.md` |
| Plan y ejecución del cierre de la campaña (27/10) | `cierre_campana.md`, `etapa9/informe_etapa9.md` §18, `evidencia/cierre_*` |
| Bitácora completa | `bitacora.md` |

---

## 13. Estado de xcdc tras el cierre de la campaña (27/10/2026)

**VERIFICADO el 27/10 con lecturas de solo lectura (y de nuevo por Opus ese mismo día):**
- ya no existen las 220 cuentas k6, el libro mayor ni el esquema de la siembra;
- la base quedó con 18 usuarios y los datos de prueba de la §2.4, **61 MB**, 0 sesiones, 0 correos en cola y 96 avisos del 16/10;
- estadísticas al día (`ANALYZE` de las 49 tablas de `public`) y `track_functions` revertido;
- la **regresión de seguridad por rol (RLS) está intacta:** 371 de 414 celdas idénticas a las del 20/10; las otras 43 solo dejaron de truncarse; ningún rol cambió lo que ve;
- la huella de las cuentas de prueba (`27F73553…`) es idéntica a la de antes de la campaña.

**Para quien opere o diagnostique:**
- **Los 8 crones inactivos** (§2.4) no están corriendo. Si no se reponen (en Railway o reactivándolos), no se cierran los timers colgados ni salen los avisos de recordatorio. No hay que confundirlo con un fallo de rendimiento (H-9-22).
- **Crear usuarios notifica a los administradores:** al crear las 220 cuentas k6 se generaron 713 avisos a administradores. En cualquier alta masiva, hay que esperar avisos y correos (H-9-20).
- **La regresión RLS desde una PC con red intermitente puede dar celdas sin dato:** conciliar varias corridas antes de concluir (H-9-21).
- **Una nueva prueba de carga** exige reconstruir las cuentas k6, el esquema de la siembra y una siembra reducida, con su propia limpieza. Para validar optimizaciones, lo recomendado es medir con los datos reales y repetir la regresión RLS (`plan-optimizacion…` §5).

---

## 14. Lista de comprobación antes de la salida

| # | Qué | Por qué | Quién | Estado (27/10) |
|---|---|---|---|---|
| 1 | **Decidir qué se hace con las 17 cuentas de prueba RLS** y sus datos (3 clientes, 3 encargos…): borrarlas, o conservarlas con las contraseñas rotadas, guardadas cifradas y las de alto privilegio desactivadas entre regresiones | Hoy siguen en producción, y sus contraseñas están en texto plano en un archivo local (`.env.rls-target-xcdc-cuentas.local`). Incluyen ADMIN y SENIOR_PARTNER, que verán **todos** los datos reales | Operador | **Pendiente** |
| 2 | **Rotar la contraseña de Postgres y borrar la secret key `k6-campana`** (la publishable key no se toca); después, borrar los archivos locales de conexión (paso 6b) | Credenciales de la campaña | Operador y ejecutor | **Pendiente** (cierre, pasos 11 y 6b) |
| 3 | **Reponer los 8 crones** (Railway o `pg_cron`), con un responsable y una fecha | Sin ellos no se cierran timers ni salen recordatorios | Responsable de Railway | **Pendiente** |
| 4 | **Activar el correo** de forma deliberada: vault y `MAIL_ENABLED`, una prueba a una dirección propia y después el drain | Hoy está apagado a propósito | Responsable de Graph | **Pendiente** |
| 5 | **Paginar las respuestas de 1.000 filas** (O-1) | Es corrección de datos | Producto | Pendiente |
| 6 | **Fijar la región `us-west-2`** del Scheduler y de `secure-signin` (O-2) | 3–4× más rápido | Producto | Pendiente |
| 7 | **Alarmas automáticas** (O-3) | La regla manual falló dos veces | Operador | Pendiente |
| 8 | **Corregir H-7-01**, o firmarlo como riesgo aceptado: un usuario puede modificar su período de horas sin pasar por el envío, y un aprobador puede sobrescribir los de sus subordinados | Integridad de las horas facturables | Producto y seguridad | Pendiente |
| 9 | **Al cargar los datos reales:** `ANALYZE`, comparar la huella de las políticas RLS con la de la §2.4 y hacer una medición corta de las rutas pesadas | Lo medido es con datos sintéticos | Quien haga el ETL | Pendiente |
| 10 | **Definir cuánto tiempo se guarda el `pg_dump`** del 26/10 y dónde | Es la única copia de la auditoría de prueba borrada; contiene datos de cuentas | Operador | Pendiente |
