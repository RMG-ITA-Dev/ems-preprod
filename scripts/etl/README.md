# Consola ETL fase 1

Consola específica (Node + `psql`) que deja una instalación nueva de EMS 2.0 lista para la carga de
fase 2. **Alcance de fase 1:** crea el administrador genérico (ficha de `staff`, cuenta de Auth,
enlace y rol `admin/admin`) y materializa el calendario de 28 feriados. **No** carga clientes,
contactos ni personas, y **no** valida ciclos de relaciones: eso es del cargador de fase 2.

Plan de referencia: `bugs/ETL/carga/fase1/plan_v2.md` (§3 consola, §4 flujo, §6 calendario).

## Comandos

```bash
node scripts/etl/fase1.mjs preflight  --config <archivo>   # solo lectura: guarda de conexión y estado previo
node scripts/etl/fase1.mjs initialize --config <archivo>   # crea administrador y calendario, con journal
node scripts/etl/fase1.mjs verify     --config <archivo> [--skip-login]   # relee el estado persistido
```

Códigos de salida: `0` correcto · `1` error · `2` BLOQUEADO · `3` RECONCILIACION_REQUERIDA.

`verify` no solo cuenta los feriados: compara los 28 contra el calendario esperado (`EXPECTED_CALENDAR` en `fase1-db.mjs`: fecha, oficina y nombre, la misma lista de `cero_15` y `verify-seed.sql`). Un feriado alterado sin cambiar el conteo hace fallar la verificación. A SQL se envían los MD5 de cada entrada y no los nombres: en Windows `psql` recibe mal los acentos de una variable `-v` («Año», «Día»). Si el calendario cambia, hay que actualizar `cero_15`, `verify-seed.sql` y `EXPECTED_CALENDAR`; una prueba comprueba que la consola y la migración coincidan.

`scripts/etl/fase1.config.example.json` es una configuración **ficticia y local**. Para Test o
producción se crea una copia privada `scripts/etl/<nombre>.config.json` (ignorada por Git) con
`environment`, `expectedProjectRef` y `supabaseUrl` del ambiente. Nunca se versionan identidades
reales ni credenciales: la consola rechaza claves que parecen credenciales dentro del archivo.

## Administrador genérico

La cuenta es **genérica** (`admin@ruizmier.com`, `Admin EMS`, `short_name` `adminems`), no forma parte de
las 138 fichas/cuentas migradas, y sirve para entrar al sistema tras migrar. Su ficha: sociedad
`Ruizmier Pelaez S.R.L.`, práctica `AUD`, categoría `Socio` (la FK compuesta
`staff(practica_id, category_id)` exige que la categoría pertenezca a la práctica; ADM no tiene
categorías), ciudad La Paz, documento y fecha de ingreso ficticios, `weekly_capacity_hours = 40`,
`target_utilization_percent = 85` e **`is_schedulable = false`**. La conciliación de fase 2 debe
identificarla y excluirla. La cuenta se elimina en el reset de producción.

## Credenciales (solo por entorno)

| Variable | Uso |
|---|---|
| `PGHOST` `PGPORT` `PGUSER` `PGPASSWORD` `[PGDATABASE]` | Conexión SQL. Remoto = pooler de Supabase, usuario `postgres.<ref>` |
| `SUPABASE_SERVICE_ROLE_KEY` | Auth Admin API (crear la cuenta, inventariar Auth) |
| `SUPABASE_ANON_KEY` | Login de comprobación y `get_my_staff_id()` |
| `ADMIN_TEMP_PASSWORD` | Contraseña temporal del administrador (≥ 12 caracteres) |
| `ETL_F1_STATE_DIR` | Ruta **absoluta**, fuera del repositorio, del journal |
| `ETL_F1_SIGNUP_CLOSED=1` | Declaración explícita de que Bootstrap y `register-user` no están disponibles |
| `ETL_F1_WINDOW_CONFIRMED=<ref>` | Solo `test`/`production`: ventana exclusiva de altas confirmada. F2 y F3 exigen `ETL_F2_WINDOW_CONFIRMED=<ref>` y `ETL_F3_WINDOW_CONFIRMED=<ref>` con el mismo valor (el runbook las exporta) |

Contraseñas, tokens y claves nunca aparecen en la configuración versionada, el journal ni los
reportes: todo mensaje pasa por un redactor. El SQL va por `psql` con `execFile` sin shell, con las
variables `PG*` en el entorno (nunca en argv), parámetros por `-v` citados con `:'nombre'` y cada
escritura en una única transacción (`-1`).

## Guarda de conexión

Antes de cualquier escritura la consola contrasta entorno, URL, referencia y conexión SQL y rechaza
combinaciones ambiguas o mezcladas:

- `local`: `PGHOST` y `supabaseUrl` deben ser loopback y el ref debe ser `local`.
- `test` / `production`: `PGHOST` debe ser `*.pooler.supabase.com`, `PGUSER` debe ser
  `postgres.<expectedProjectRef>`, `supabaseUrl` debe ser `https://<ref>.supabase.co`, el ref debe
  corresponder al ambiente declarado y el proyecto Lovable queda excluido.
- El preflight comprueba además que la conexión puede ejecutar `public.seed_initial_holidays` como
  propietaria (la función se revoca de `service_role`, `anon` y `authenticated`).

## Journal, estados y recuperación

El estado durable vive en `ETL_F1_STATE_DIR/fase1-<installationId>.journal.json`, con intención
previa al efecto (UUID de ficha reservado y correlación de la cuenta), hash de configuración y de
las migraciones, estados y eventos. Cada checkpoint se escribe por archivo temporal, sincronización
y reemplazo atómico; un journal ilegible, con checksum alterado o de otra instalación **bloquea**.

```text
PENDIENTE → PREFLIGHT_VALIDADO → STAFF_CONFIRMADO → AUTH_CONFIRMADO
          → ENLACE_Y_ROL_CONFIRMADOS → CALENDARIO_CONFIRMADO → VERIFICADO
resultado incierto → RECONCILIACION_REQUERIDA        identidad/hash/configuración contradictoria → BLOQUEADO
```

| Situación | Comportamiento |
|---|---|
| Ficha confirmada; Auth ausente | Recupera la ficha propia y continúa con Auth |
| Auth creado; respuesta perdida | Inventario de Auth con paginación completa y recuperación por correlación |
| Commit SQL sin checkpoint | Consulta UUID y contenido antes de reconstruir el checkpoint |
| Cuenta con el mismo correo sin nuestra correlación | **No se adopta**: bloquea |
| Enlace o rol inesperado | Bloquea y conserva evidencia en el journal; no promueve ni reasigna |
| Calendario parcial | La función inserta solo faltantes compatibles |
| Feriado contradictorio | Falla sin sobrescribir y bloquea |
| Segunda inicialización | Mismas identidades; cero altas o modificaciones de negocio (se compara una huella antes y después) |

No hay ninguna orden automática de rollback destructivo ni se borran cuentas o fichas por timeout.
Un `BLOQUEADO` persistido exige revisar la evidencia antes de reanudar.

**Exclusión de ejecuciones simultáneas** (sin bloqueo de sesión: el pooler y las invocaciones
separadas de `psql` no lo sostienen): un archivo de bloqueo de creación exclusiva en
`ETL_F1_STATE_DIR` impide dos ejecuciones en la misma máquina (si no hay ningún proceso activo,
verifique y elimine el `.lock` a mano), y cada transacción toma `pg_advisory_xact_lock` y relee sus
precondiciones, lo que cubre a un ejecutor en otra máquina. Ninguna transacción SQL permanece
abierta mientras se espera a Auth.

El bloqueo **no** serializa `register-user`, Bootstrap ni operadores externos: el registro público
debe estar cerrado durante la inicialización y, en remoto, hace falta una ventana exclusiva de altas.

## Correos

El login de comprobación y los triggers de alta pueden generar sesiones, auditoría de autenticación
y notificaciones encoladas. En el ensayo se trabaja con `MAIL_ENABLED=false` (sin entrega por Graph).
`initialize` y `verify` informan `notification_emails` y los pendientes: concílielos antes de habilitar
cualquier envío.

## Pruebas

```bash
npx vitest run scripts/etl/__tests__/fase1.test.ts          # unitarias, sin red ni psql

# Integración (opt-in) — SOLO contra el stack local, recién replicado y en modo preinit:
supabase start
eval "$(supabase status -o env)"
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" SUPABASE_ANON_KEY="$ANON_KEY"
export ADMIN_TEMP_PASSWORD='<contraseña de ensayo ≥ 12 caracteres>'
ETL_F1_INTEGRATION=1 npx vitest run scripts/etl/__tests__/fase1.integration.test.ts
```

La integración inicializa al administrador ficticio y recorre los escenarios previstos
(ejecutor duplicado, interrupciones tras ficha, Auth y calendario, repetición, `verify`); no debe
ejecutarse después de una inicialización manual que invalide sus precondiciones, y rechaza destinos
no loopback.

## Ejecución remota futura (Test / producción)

Fuera del alcance de fase 1 y no autorizada por este documento. Requiere, antes de escribir:
identidad y estado efectivos del ambiente verificados, responsables, ventana exclusiva de altas,
credenciales, respaldo y tratamiento de las cuentas Auth de ensayo, y una autorización de ejecución
propia (Test primero; producción tras las tres fases). Producción se reconstruye con un reset total y
reaplicación de las migraciones, con configuración y mapas propios por proyecto.

## Consola ETL fase 3

Fase 3 prepara y carga por bloques los encargos, matrices, OTs y horas aprobadas definidos en
`bugs/ETL/carga/fase3/plan_v2.md`. Admite dos destinos y ninguno más (`bugs/ETL/carga/fase4/plan_v1.md`):

- `environment=local`: `expectedProjectRef=local`, `supabaseUrl` loopback y `PGHOST` loopback.
- `environment=test`: el ref queda fijo en el código (`KNOWN_REFS.test`), `supabaseUrl` debe ser
  `https://<ref>.supabase.co`, `PGHOST` el pooler (`*.pooler.supabase.com`), `PGUSER=postgres.<ref>` y
  `ETL_F3_WINDOW_CONFIRMED=<ref>` (ventana exclusiva; igual al ref del proyecto, como en F1 y F2). `preflight` comprueba además que `technicalAdminId` sea el
  administrador bootstrap de F1 (ficha enlazada, rol `admin/admin`). Un journal pertenece a un único ref.

Producción, Dev 2.0 y Lovable siguen rechazados, sin bandera para saltarse la guarda. `ETL_F3_STATE_DIR` es
absoluto y externo al repositorio. La consola no ejecuta migraciones. Un plan de pago BOB toma el DEFAULT
efectivo de `wo_payment_plan.exchange_rate` (P-02), que queda registrado en R4 y no es un TC legacy.
El nivel de riesgo de cada OT se traduce del código legacy `legacy_risk_code` (1 → Bajo, 2 → Moderado, 3 → Alto,
confirmado por TI con la interfaz del legacy); cualquier otro valor, nulo o vacío bloquea ya en `validate`, y
`reconcile-legacy` lo verifica por COT (control L4). El código original se conserva en `risk_notes`.

```bash
node scripts/etl/fase3.mjs validate --config scripts/etl/fase3.local.config.json
node scripts/etl/fase3.mjs preflight --config scripts/etl/fase3.local.config.json
node scripts/etl/fase3.mjs load --config scripts/etl/fase3.local.config.json --block client-engagements
node scripts/etl/fase3.mjs verify --config scripts/etl/fase3.local.config.json --block client-engagements
node scripts/etl/fase3.mjs report --config scripts/etl/fase3.local.config.json
```

Los bloques son `client-engagements`, `administrative-engagements`, `matrices`, `work-orders` y
`hours`. Antes de un bloque dependiente debe existir un acta externa con hash de aceptación del
anterior. Ante resultado incierto se usa `reconcile --resolution <archivo>`: no vuelve a ejecutar
una RPC mutante a ciegas. `rollback-plan` sólo enumera candidatos propios para revisión; nunca borra
datos automáticamente. `fase3.config.example.json` es ficticio y no contiene credenciales.

`reconcile-legacy` (solo lectura) concilia lo cargado contra los seis CSV legacy: los totales esperados se
recalculan desde los CSV y los reales salen de consultas agregadas; el journal solo aporta qué UUID
corresponde a cada COT. Controla conjuntos, horas presupuestadas, nivel de riesgo, gastos, honorarios y cuotas por COT, horas
por COT y por persona (descontados los feriados aplicables), el número de entradas cargadas (L7e) y las entradas en feriado (L7f), y que no existan períodos, aprobaciones ni correos
enviados. Escribe `fase3-<installationId>.legacy-reconciliation.json` (conteos y sumas, sin PII) y termina en
`BLOQUEADO` ante cualquier diferencia. El `verify` de la consola solo inventaría períodos, aprobaciones y cola de
correo; la conciliación de contenido es este comando.

La validación es offline y usa los seis CSV privados, aritmética decimal exacta, la matriz de
contribuciones y el journal externo. La carga local y `npm run test:rls` requieren un stack local
separado; no se ejecutan contra un proyecto remoto.

## Consola ETL fase 2

Fase 2 carga clientes, contactos y fichas/cuentas desde CSV privados después de que Fase 1 haya
quedado verificada. No aplica migraciones, no cambia RLS y no ejecuta contra un Supabase remoto sin
una orden independiente del operador. Usa Admin API únicamente para inventario, altas y rotación de
contraseña; nunca invita usuarios ni envía enlaces de correo.

```bash
node scripts/etl/fase2.mjs validate     --config <archivo>
node scripts/etl/fase2.mjs preflight    --config <archivo>
node scripts/etl/fase2.mjs load         --config <archivo>
node scripts/etl/fase2.mjs verify       --config <archivo>
node scripts/etl/fase2.mjs report       --config <archivo>
node scripts/etl/fase2.mjs probe-access --config <archivo> --staff-ref <ref> [--manual]
node scripts/etl/fase2.mjs probe-close  --config <archivo> --staff-ref <ref>
# D40: contiene (status=failed, last_error=ETL_F2_NO_DELIVERY) los correos auth.role.changed pendientes de las fichas y cuentas creadas por F2. Idempotente; exige el journal completo.
node scripts/etl/fase2.mjs contain-emails --config <archivo>
```

La configuración F2 es privada y contiene rutas absolutas de los seis CSV; use
`fase2.config.example.json` solo como plantilla. `ETL_F2_STATE_DIR` debe ser absoluto, estar fuera
del repositorio incluso tras resolver enlaces, y conservarse como respaldo privado. El journal no
guarda nombres, NIT, correos, claves ni tokens: solo huellas, UUID y estados.

## Manifiesto por snapshot (cifras de control del respaldo legacy)

Las cifras y fechas que dependen del respaldo legacy que se carga **ya no son constantes del código**: viven en
`scripts/etl/snapshots/<nombre_de_la_base>.json` (versionado, sin secretos) y las carga `snapshot-manifest.mjs`
(`loadSnapshotManifest`). Hay uno por respaldo aprobado: `TimeControlDB_20261023_1200` (reproduce exactamente los valores
anteriores, para regresión) y `TimeControlDB_20261106_1600` (el respaldo final del 06/11/2026). Sin manifiesto, la configuración
no es válida (`CONFIG`).

- **Contenido:** fechas (`staffCut`, `fy2026End`, …), `f2` (clientes, contactos, fichas, usuarios, activas/inactivas…), `f3`
  (encargos, matrices, OT, gastos, pagos, niveles de riesgo, fines de vigencia con su conteo), `planNotes` (las notas del plan por
  lista explícita `COT|cuota`, nunca por texto), `invoicedInstallments` (cuotas «ya fue facturado», D19), `toleranceCots`
  (planes con tolerancia aprobada, D18) y `preflight.executionDeadline`.
- **`null` = sin declarar:** en `local` el control no se aplica (F2 lo puede completar con `expectations`); en Test y producción
  **bloquea**. Al 06/11 quedan `null`: `f2.contacts` (depende del criterio de «contacto distinto»), `f2.schedulableStaff` y
  `f3.expenses.totalUnits` (salen del CSV v3) y `bak.file`/`bak.sha256`.
- **Journal:** el `sha256` del manifiesto se guarda en el journal al crearlo (`snapshotManifestSha256`) y, al reanudar, debe
  coincidir. **No** entra en `configHash`, así los journals anteriores siguen leyéndose.
- **Runbook:** `lib.sh` lee el manifiesto con `rb_manifest <ruta>` / `rb_manifest_required <ruta>` (corte de bajas, conteos, fecha límite).

## Reglas de carga que dependen de decisiones del operador (10 y 11/11/2026)

| Tema | Regla en el código |
|---|---|
| Nombre del encargo | `{cliente} - {servicio} - {COT legacy}` (`fase3-transform.mjs`) |
| Fin de vigencia | columna `ems_end_date` del CSV, solo los valores `endDates.allowed` del manifiesto y con el reparto de `endDates.counts` (45 y 110 al 06/11) |
| Años fiscales | 2024 a 2027 (las 22 OT de gestión anterior con horas desde el 01/01/2026) |
| Administrativas | todas las activas de 2027; socio = `partner_id`, gerente = aprobador legacy (`manager_id`); sociedad y cliente interno (`NEW-RP`/`NEW-RJ`) según el socio; el perfil 89 se absorbe en el 62 |
| Honorario de una OT en BOB | `presupuestoHoras × TC de la OT`, redondeo hacia arriba (D26/D29); gastos igual |
| Impuesto | 16 %: `taxRate` 0,16 y honorario con impuesto = ajustado ÷ 0,84 (D28) |
| Plan de pagos | notas por lista del manifiesto; tolerancia de 100,03 % solo para `toleranceCots`; las cuotas con disposición `cuota_facturada` nacen Pendientes y, con la OT aprobada, pasan a Facturada (`--operation invoices`, D19/D20/D21; conciliación L6e/L6f; la huella L9 incluye las fechas de cobranza) |
| Contactos | varios por cliente, solo el nombre obligatorio, celda vacía = NULL, «Línea corporativa» con el teléfono del cliente; el cargo no se carga. El criterio de «contacto distinto» es `duplicateContacts(rows, criterion)`: `name` (vigente) o `email-first` (probable), parametrizable con `contactCriterion` |
| SAN | la regla (SAN, salvo 0 o < 4 dígitos → Sentinel; «-1» en los de 5 dígitos; SAN de 8 dígitos tal cual) se aplica en la consulta del CSV v3, no en el código |
