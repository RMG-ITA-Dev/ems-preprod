# Reset desde cero — manual para desarrolladores

> Reemplaza `docs/migraciones/HANDOFF-reset-test.md` y `docs/migraciones/HANDOFF-ruta-c.md`
> (ambos marcados obsoletos). Procedimiento de `bugs/migracion_cero/plan_v2.md` Fase 7,
> generalizado: sirve para reconstruir **cualquier** proyecto Supabase desde volumen vacío
> con el set consolidado + seed de la migración cero — no es específico de "Test". Este
> documento está escrito para que cualquier desarrollador del equipo pueda ejecutar el
> proceso sin haber vivido la migración cero — incluye de dónde sacar cada credencial que
> se pide, no solo el nombre de la variable.

## 0. Qué es esto y cuándo se usa

El "set consolidado" es el conjunto final de 14 migraciones que reemplazó las 184
históricas (`supabase/migrations/`: 7 de esquema `cero_01..07` + 7 de seed `cero_10..16`,
sin datos demo, con catálogo maestro real). Este runbook reconstruye **cualquier** proyecto
Supabase desde volumen vacío aplicando ese set — típicamente para:

- Resetear el ambiente "Test" cuando queda en un estado inconsistente.
- Levantar un ambiente nuevo (staging, un segundo Test, etc.) desde cero.
- Verificar que el set consolidado sigue aplicando limpio (regresión).

**Es destructivo** — borra todo el contenido del proyecto al que apunte. Nunca corre contra
Lovable ni Dev 2.0 sin que alguien lo decida explícitamente en el momento.

## 1. Antes de empezar: elegí la rama correcta

El código del frontend que sabe hablar con el esquema nuevo (`practicas`/`servicios` en vez
de `services`/`taxonomies`) solo existe en la rama **`refactor/bd-migracion-cero`** del repo
`aurora-engage-pro-908f8234` (o lo que sea que se haya mergeado a `development`/`main` para
cuando leas esto — confirmá con `git log` si no estás seguro). Si corrés la app desde
`main`, `development`, o cualquier rama que no tenga el rename aplicado, contra un proyecto
ya reseteado con el set consolidado, la app se rompe (busca tablas/columnas con los nombres
viejos que ya no existen).

```bash
git branch --show-current   # tiene que decir refactor/bd-migracion-cero (o su sucesora)
```

**No confundas este repo con `../EMS_Dev_Supabase/`** (u otro checkout usado solo como
harness de Docker/Supabase CLI) — puede estar en una rama vieja sin el rename. Ese checkout
es scratch space para correr `supabase`/`psql`, no para levantar la app.

## 2. Credenciales necesarias y de dónde sacarlas

Todo sale del dashboard de Supabase (`supabase.com/dashboard`), proyecto objetivo → **Settings**.

| Necesitás esto | Dónde lo sacás | Cómo se ve | ¿Es secreto? |
|---|---|---|---|
| **Project ref** | La URL del proyecto en el dashboard, o Settings → General → "Reference ID" | 20 caracteres alfanuméricos en minúscula, ej. `slkqdcwwvmjtcbakajib` | No |
| **Project URL** (`SUPABASE_URL` / `VITE_SUPABASE_URL`) | Settings → API → "Project URL" | `https://<ref>.supabase.co` | No |
| **Publishable / anon key** (`SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`) | Settings → API → sección de API Keys, la que dice "publishable" (formato nuevo, `sb_publishable_...`) o "anon" (formato viejo, JWT largo `eyJ...`) | — | No — pensada para ir en el cliente/frontend |
| **Connection string de Postgres** (`SUPABASE_DB_URL`) | Settings → Database → "Connection string" → pestaña **"Session pooler"** (no "Direct connection") | `postgresql://postgres.<ref>:<password>@aws-<region>.pooler.supabase.com:5432/postgres` | **SÍ — tiene la contraseña de la base adentro** |
| **service_role / secret key** | Settings → API → sección de API Keys, la que dice "service_role" (JWT viejo) o "secret" (formato nuevo, `sb_secret_...`) | — | **SÍ — es la llave maestra del proyecto** |
| **Contraseña de Postgres a secas** | Si no la tenés a mano: Settings → Database → "Reset database password" (esto la rota — la vieja deja de funcionar) | — | **SÍ** |

### Regla de oro con las 2 credenciales secretas (connection string y service_role/secret key)

- **Nunca las pegues en un chat con un agente/IA, en un issue, en Slack, ni las guardes en
  un archivo que se commitee.** Si en algún momento se filtran ahí (pasó durante la
  migración cero — dos veces), **rotalas de inmediato** desde el dashboard
  (Settings → Database → Reset database password / Settings → API → regenerar la key) —
  no importa si "no pasó nada", una vez expuestas se consideran comprometidas.
- El script (`reset-desde-cero.sh`) las pide por un prompt con **eco apagado** (no se ven en
  pantalla al pegarlas) — es normal no ver nada mientras escribís/pegás.
- Si un comando o script te pide una de estas por un prompt visible o para escribirla en un
  archivo, pará y preguntá — no es el flujo correcto.

## 3. Qué hace `reset-desde-cero.sh`

`supabase/tests/local/reset-desde-cero.sh` automatiza:

1. Carga las credenciales **públicas** del proyecto objetivo desde un archivo `.env` que le
   indiques (nunca lee ni imprime su contenido — solo verifica por *nombre* que las
   variables existan).
2. Pide por prompt oculto el **connection string** de Postgres (Session pooler) — salvo que ya
   esté exportado en tu shell. La service_role/secret key ya no se pide acá: la necesita la
   consola de inicialización (§5).
3. Verificación no-secreta: que el project-ref aparezca dentro del connection string (evita
   apuntar por error a otro ambiente).
4. `supabase link --project-ref <REF>` si todavía no está linkeado a ese proyecto.
5. **Confirmación interactiva obligatoria**: tenés que escribir el project-ref exacto para
   que el script continúe. No hay flag para saltarla.
6. `supabase db reset --linked` — borra todo y reaplica las 14 migraciones.
7. Verifica convergencia (`migration list --linked`, `db push --dry-run --linked`).
8. Corre `verify-seed.sql` en modo **`preinit`** (`-v etl_f1_mode=preinit`) contra la base real:
   catálogos y configuración definitivos (industrias, gastos, prácticas/categorías, RBAC, ajustes,
   `ADM_ACTIVITY_ID`, `default_app_role`/`default_role_key`, cron jobs) y **cero** clientes, staff,
   cuentas de usuario, roles y feriados.
9. **No inicializa.** Informa «INICIALIZACIÓN PENDIENTE» y termina: ya no existe una cuenta fija
   en el seed (`cero_14` quedó como no-op) ni se llama automáticamente a
   `verify-auth-bootstrap.sh`. El primer administrador y el calendario los crea la consola
   específica (§5), con su propia autorización. Este script reconstruye; no declara operativo el
   ambiente.

Si cualquier paso falla, el script se detiene ahí (`set -euo pipefail`) — no sigue a ciegas.

**Dónde corre:** nunca desde `aurora-engage-pro-908f8234` (sus credenciales locales apuntan
a Lovable) — desde `../EMS_Dev_Supabase/` o cualquier checkout con Supabase CLI + `psql` +
`curl`, con `supabase/migrations/` sincronizado desde este repo.

## 4. Paso a paso

```bash
cd ../EMS_Dev_Supabase   # o el checkout que uses como harness

supabase/tests/local/reset-desde-cero.sh \
  --project-ref <REF-de-20-caracteres> \
  --env-file <ruta-al-.env-con-las-credenciales-públicas>
```

El `.env` indicado (por ejemplo `.env.migracion.local`) solo necesita las 2 variables
públicas de la tabla de arriba (acepta varios nombres, ver el header del script para la
lista completa de alias).

Vas a ver, en orden:

1. `PASS — SUPABASE_DB_URL de '<archivo>' referencia el project-ref esperado.` — antes de
   esto, si faltan las públicas te dice cuáles, y te pide el connection string por prompt oculto
   (pegá y Enter, sin ver nada en pantalla — es lo esperado, no un error).
2. El check/creación del link.
3. La advertencia destructiva, terminando en `Escribí exactamente el project-ref para
   confirmar:` — tipeá el ref exacto (ej. `slkqdcwwvmjtcbakajib`) y Enter. Cualquier otra
   cosa aborta sin tocar nada.
4. `supabase db reset --linked` — vas a ver "Applying migration..." × 14.
5. `migration list --linked` + `db push --dry-run` → debería decir 0 pendientes.
6. `verify-seed.sql` en modo preinit → líneas `NOTICE: PASS — ...` terminando en
   `VERIFY-SEED: ALL CHECKS PASSED`. (Los acentos/ñ pueden verse como `â?"`/`A-` en Windows —
   es solo encoding del cliente `psql`, cosmético, ver §6.)
7. `RESET-DESDE-CERO: proyecto '<ref>' reconstruido y verificado en modo preinit.`, seguido de
   `INICIALIZACIÓN PENDIENTE`: el ambiente todavía **no** es operativo (§5).

Si algo falla, pegá el error completo a quien te esté ayudando — no reintentes por tu cuenta
si falla a mitad del `db reset` (ver troubleshooting, §6).

## 5. Después del script: inicializar con la consola — PASO APARTE

`reset-desde-cero.sh` deja el ambiente **sin cuentas**: no hay administrador, ni ficha de personal,
ni feriados (`cero_14` es un no-op y `cero_15` solo declara la función `seed_initial_holidays`).
El primer administrador — la cuenta **genérica** `admin@ruizmier.com` (`Admin EMS`, categoría
Socio de Auditoría, `is_schedulable = false`) — y los 28 feriados los crea la consola específica de
fase 1 (`scripts/etl/README.md`). Es un paso **separado y con su propia autorización**: reconstruir
no autoriza inicializar, y la inicialización remota no la autoriza este documento.

Antes de ejecutarla (resumen; el detalle está en el README de la consola):

- El registro público (Bootstrap y `register-user`) debe estar **cerrado**: el único alta es el
  administrador por consola. `handle_new_user` convierte en admin al primer usuario que se registre.
- Variables de entorno, nunca en archivos versionados ni en el chat: `PG*` (pooler, usuario
  `postgres.<ref>`), `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ADMIN_TEMP_PASSWORD`,
  `ETL_F1_STATE_DIR` (ruta absoluta fuera del repositorio), `ETL_F1_SIGNUP_CLOSED=1` y
  `ETL_F1_WINDOW_CONFIRMED=<ref>`.
- Correo: `MAIL_ENABLED=false` en el ensayo; concilie la cola `notification_emails` antes de
  habilitar cualquier envío.
- Un reset de base **no** elimina por sí solo las cuentas de Auth de ensayo: controle y trate
  `auth.users` por separado antes de reinicializar (la consola se niega a trabajar sobre cuentas
  ajenas a su journal).

```bash
node scripts/etl/fase1.mjs preflight  --config <configuración privada>
node scripts/etl/fase1.mjs initialize --config <configuración privada>
node scripts/etl/fase1.mjs verify     --config <configuración privada>
```

La contraseña de `admin@ruizmier.com` es la temporal `ADMIN_TEMP_PASSWORD` con la que la consola crea
la cuenta; es una cuenta de acceso inicial que **se elimina en el reset de producción**. No la pegue en
chats ni la guarde en archivos versionados.

**Levantar la app apuntada a este proyecto:** en la raíz de `aurora-engage-pro-908f8234`, cree/edite
`.env.local` (gitignored, nunca se commitea):

```
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<la publishable/anon key — no la secreta>
```

Después `npm run dev` y login con `admin@ruizmier.com` y la contraseña temporal. Si da `400 Bad
Request` en `/auth/v1/token`, es la contraseña equivocada (no la del connection string).

## 6. Troubleshooting (hallazgos reales de la ejecución contra "Test")

### 6.1 `supabase db reset --linked` deja objetos sueltos

A diferencia de `supabase db reset --local` (que recrea el contenedor Docker entero — vacío
garantizado), `db reset --linked` contra un proyecto remoto funciona revirtiendo
("`down`") lo que la tabla `supabase_migrations.schema_migrations` del remoto tenía
registrado como aplicado, y después reaplicando (`up`) el set local. Si el proyecto tenía
un historial previo **completamente divergente** del set consolidado (como Test, que
todavía tenía datos de antes de la migración cero), puede fallar así:

```
ERROR: relation "fund_request_number_seq" already exists (SQLSTATE 42P07)
At statement: 7 -- CREATE SEQUENCE public.fund_request_number_seq ...
```

Diagnóstico (solo lectura, no toca nada):

```sql
-- ¿el historial de migraciones quedó en 0? (el "down" corrió y limpió casi todo)
select version from supabase_migrations.schema_migrations order by version;

-- ¿qué quedó realmente en public? (\dt de psql NO muestra secuencias/tipos, solo tablas —
-- por eso hay que consultar pg_class directo)
select n.nspname, c.relname, c.relkind from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' order by 1, 2;
```

En el incidente real, `schema_migrations` quedó en 0 filas, pero sobrevivió una secuencia
standalone (`fund_request_number_seq`, no `OWNED BY` ninguna tabla) — el "down" solo sabe
revertir lo que cuelga de un `DROP TABLE ... CASCADE`.

**Fix:** no reintentar `db reset --linked` a ciegas. Borrar a mano lo que sobrevivió y
aplicar hacia adelante (sin invocar la lógica de "down"):

```bash
psql "<connection string>" -c "DROP SEQUENCE public.fund_request_number_seq;"
supabase db push --include-all --linked
supabase migration list --linked   # confirmar 14/14, Local == Remote
```

Un reset *futuro* del mismo proyecto (ya en el historial consolidado) no debería divergir
así — este problema es específico de la primera vez que se resetea un proyecto con
historial viejo.

### 6.2 Encoding raro en la salida de `psql` (Windows)

`â?"`, `A-`, `A±` en vez de acentos/ñ en la salida de `verify-seed.sql` — es solo el cliente
`psql` sin `PGCLIENTENCODING=UTF8`. Cosmético, no afecta el resultado (`PASS`/`FAIL` se lee
igual). Setealo antes si molesta: `export PGCLIENTENCODING=UTF8`.

### 6.3 "Pegué la credencial y no pasó nada" / prompt vacío

Los prompts ocultos (`read -s -p "..."`) necesitan que **pegues antes de apretar Enter**.
Si apretás Enter sin pegar, la variable queda vacía y el paso que la usa falla más
adelante (a veces con un error que no menciona la variable en absoluto — p.ej. `psql`
intentando conectarse a `localhost` en vez del proyecto real, porque cayó al default local).
Para confirmar que el paste funcionó sin exponer el valor:

```bash
echo "largo capturado: ${#NOMBRE_DE_LA_VARIABLE}"
```

Un connection string real da ~90-120; una service_role key da un número grande también
(nunca 0, nunca ~40 como una URL corta pegada por error).

### 6.4 "Le pegué la URL pública en vez del connection string"

Si el "largo capturado" da algo como 40-45, probablemente pegaste
`https://<ref>.supabase.co` (la Project URL) en el campo del connection string por error —
son cosas distintas (ver tabla de §2). El connection string empieza con `postgresql://` y
tiene la contraseña adentro.

### 6.5 La app no arranca / da error de tablas inexistentes

Estás en la rama equivocada del frontend (ver §1) — o el `.env.local` apunta a un proyecto
que todavía no fue reseteado con el set consolidado.

## 7. Checklist manual post-reset (plan §7.3 — no lo hace el script, es criterio humano)

- [ ] **Inicialización pendiente resuelta** (§5): consola `preflight` / `initialize` / `verify`
      ejecutada con su autorización propia; sin ella el ambiente NO es operativo.
- [ ] Login con `admin@ruizmier.com` en la app apuntada al proyecto reseteado; verificar que
      `get_my_staff_id()` resuelve (ya lo probó la consola, pero confirmarlo desde la UI real).
- [ ] `HOLIDAY_ENGAGEMENT_ID` vacío por diseño — completar a mano cuando exista el encargo de
      feriados/no facturable.
- [ ] Alta de un equipo/asignación de prueba con `skills` vacío — debe funcionar.
- [ ] Personal mínimo para el smoke de encargo (Socio + Gerente reales, ver plan §7.3) —
      datos temporales de ese ambiente, nunca parte del seed.
- [ ] Smoke de catálogos visibles, cliente + encargo + hoja de tiempo básica.
- [ ] Smoke de feriados vs generador: "Generar feriados nacionales" 2026 debe responder
      "ya existen" (no-op).
- [ ] Smoke de Storage: subir un comprobante de gasto y un contrato de encargo.

## 8. Reutilización futura

Cualquier ambiente Supabase nuevo (staging adicional, un segundo Test, etc.) se reconstruye
con el mismo script — solo cambian `--project-ref` y `--env-file`, y las credenciales que se
sacan del dashboard de ESE proyecto (§2). No hace falta escribir un procedimiento nuevo por
ambiente.

## 9. Registro de ejecuciones reales

| Fecha | Proyecto | Resultado |
|---|---|---|
| 2026-08-23/24 | Test (`slkqdcwwvmjtcbakajib`) | Verde — 14/14 migraciones, 22/22 checks de `verify-seed.sql`, `verify-auth-bootstrap.sh` OK. Incidente del sequence suelto (§6.1) diagnosticado y resuelto en el camino. Admin activado con contraseña real. |
