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
2. Pide por prompt oculto las **2 credenciales secretas** (connection string, service_role
   key) — salvo que ya estén exportadas en tu shell.
3. Verificación no-secreta: que el project-ref aparezca dentro del connection string (evita
   apuntar por error a otro ambiente).
4. `supabase link --project-ref <REF>` si todavía no está linkeado a ese proyecto.
5. **Confirmación interactiva obligatoria**: tenés que escribir el project-ref exacto para
   que el script continúe. No hay flag para saltarla.
6. `supabase db reset --linked` — borra todo y reaplica las 14 migraciones.
7. Verifica convergencia (`migration list --linked`, `db push --dry-run --linked`).
8. Corre `verify-seed.sql` contra la base real (23 chequeos: conteos, ADM/is_system,
   `ADM_ACTIVITY_ID`, 61/61 `default_app_role`, feriados vs generador, cero datos demo,
   bootstrap completo, cron jobs `finalize-stale-timers`/`finalize-engagements` activos).
9. Corre `verify-auth-bootstrap.sh` (Admin API → login por password → `get_my_staff_id()` →
   1 fila admin) — el gate real del INSERT en `auth.users`/`auth.identities`. **Este paso fija
   por Admin API una contraseña temporal de patrón conocido en la cuenta admin real** (ver
   advertencia en §5) — se acepta esa exposición a cambio de probar el login real contra el
   ambiente real, no solo el esquema. Se mitiga fijando una contraseña real inmediatamente
   después (§5), paso que ya era obligatorio.

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
   esto, si faltan las públicas te dice cuáles, y te pide las 2 secretas por prompt oculto
   (pegá y Enter, sin ver nada en pantalla — es lo esperado, no un error).
2. El check/creación del link.
3. La advertencia destructiva, terminando en `Escribí exactamente el project-ref para
   confirmar:` — tipeá el ref exacto (ej. `slkqdcwwvmjtcbakajib`) y Enter. Cualquier otra
   cosa aborta sin tocar nada.
4. `supabase db reset --linked` — vas a ver "Applying migration..." × 14.
5. `migration list --linked` + `db push --dry-run` → debería decir 0 pendientes.
6. `verify-seed.sql` → 22 líneas `NOTICE: PASS — ...` terminando en
   `VERIFY-SEED: ALL CHECKS PASSED`. (Los acentos/ñ pueden verse como `â?"`/`A-` en Windows —
   es solo encoding del cliente `psql`, cosmético, ver §6.)
7. `verify-auth-bootstrap.sh` → termina en `VERIFY-AUTH-BOOTSTRAP: ALL CHECKS PASSED`.
8. `RESET-DESDE-CERO: proyecto '<ref>' reconstruido y verificado end-to-end.`

Si algo falla, pegá el error completo a quien te esté ayudando — no reintentes por tu cuenta
si falla a mitad del `db reset` (ver troubleshooting, §6).

## 5. Después del script: activar al admin y probar la app — PASO NO OPCIONAL

**Advertencia (fuga aceptada y ya mitigada por este mismo paso):** el seed (`cero_14`) inserta
al admin con una contraseña aleatoria e inutilizable — hasta ahí, nadie la conoce. Pero el
paso 9 del script (`verify-auth-bootstrap.sh`, §3) la **sobreescribe** con una contraseña
temporal de patrón conocido (`verify-bootstrap-<epoch>-<pid>!Aa1`) para probar el login real
contra el ambiente real. Al terminar el script, la cuenta admin **ya no tiene** la contraseña
inutilizable del seed — tiene esa temporal, reconstruible por cualquiera que sepa
aproximadamente cuándo corrió el script. Esto es un compromiso aceptado (el mismo camino que
recorre un usuario real, no solo el esquema), y su mitigación es este paso: no es una
recomendación, es **obligatorio ejecutarlo inmediatamente** después de que el script termine —
mientras no se haga, el ambiente recién reseteado tiene un admin con contraseña conocida activa.

**a) Fijar la contraseña real** (necesita la service_role/secret key otra vez — Settings → API):

```bash
read -s -p "service_role/secret key: " SUPABASE_SERVICE_ROLE_KEY
export SUPABASE_SERVICE_ROLE_KEY

curl -s -X PUT "https://<REF>.supabase.co/auth/v1/admin/users/c32c03fd-ddfb-4ae2-9176-664982d4621e" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password": "<elegí una contraseña real, la vas a usar para loguearte>"}'
```

Una respuesta con el JSON del usuario (email, id, `updated_at` reciente) confirma que
funcionó. `c32c03fd-ddfb-4ae2-9176-664982d4621e` es el UUID fijo del admin del seed —
siempre el mismo en cualquier ambiente reseteado con este set (está declarado en
`supabase/migrations/*_cero_14_seed_admin_bootstrap.sql`).

**b) Levantar la app apuntada a este proyecto:**

En la raíz de `aurora-engage-pro-908f8234` (rama `refactor/bd-migracion-cero`), creá/editá
`.env.local` (gitignored, nunca se commitea):

```
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<la publishable/anon key — no la secreta>
```

Después:

```bash
npm run dev
```

**c) Login:** correo `neilgraneros@ruizmier.com`, la contraseña que fijaste en (a). Si te da
`400 Bad Request` en `/auth/v1/token`, es la contraseña equivocada (no la del connection
string, no una que hayas probado "al boleo" — la que realmente pusiste en el curl de (a)).

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

- [ ] **Activar al admin del seed** (§5 de este documento) — hecho vía Admin API, contraseña
      real fijada.
- [ ] Login con ese admin en la app apuntada al proyecto reseteado; verificar que
      `get_my_staff_id()` resuelve (ya lo probó el script, pero confirmarlo desde la UI real).
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
