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
| `ETL_F1_WINDOW_CONFIRMED=<ref>` | Solo `test`/`production`: ventana exclusiva de altas confirmada |

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
  `ETL_F3_WINDOW_CONFIRMED` (ventana exclusiva). `preflight` comprueba además que `technicalAdminId` sea el
  administrador bootstrap de F1 (ficha enlazada, rol `admin/admin`). Un journal pertenece a un único ref.

Producción, Dev 2.0 y Lovable siguen rechazados, sin bandera para saltarse la guarda. `ETL_F3_STATE_DIR` es
absoluto y externo al repositorio. La consola no ejecuta migraciones. Un plan de pago BOB toma el DEFAULT
efectivo de `wo_payment_plan.exchange_rate` (P-02), que queda registrado en R4 y no es un TC legacy.

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
corresponde a cada COT. Controla conjuntos, horas presupuestadas, gastos, honorarios y cuotas por COT, horas
por COT y por persona (descontados los feriados aplicables) y que no existan períodos, aprobaciones ni correos
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
```

La configuración F2 es privada y contiene rutas absolutas de los seis CSV; use
`fase2.config.example.json` solo como plantilla. `ETL_F2_STATE_DIR` debe ser absoluto, estar fuera
del repositorio incluso tras resolver enlaces, y conservarse como respaldo privado. El journal no
guarda nombres, NIT, correos, claves ni tokens: solo huellas, UUID y estados.
