// Acceso SQL de la consola ETL fase 1 (bugs/ETL/carga/fase1/plan_v2.md §3, §6).
//
// Todo el SQL pasa por `psql` invocado con execFile, SIN shell: las credenciales viajan en variables
// PG* del entorno (nunca en argv), los parámetros por variables `-v` citadas con :'nombre', y cada
// unidad de escritura corre en UNA transacción (`-1`) que toma pg_advisory_xact_lock y relee sus
// precondiciones. Es el mismo patrón de los scripts k6 contra el pooler (usuario postgres.<ref>).
// No se usa bloqueo de sesión: ni el pooler ni invocaciones separadas de psql lo sostienen.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");

export const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
export const ADMIN_DEFAULTS = Object.freeze({ weeklyCapacityHours: 40, targetUtilizationPercent: 85 });
export const EXPECTED_HOLIDAYS = 28;

/**
 * Tablas que deben estar VACÍAS en una instalación nueva (y seguir vacías tras inicializar): las mismas que
 * comprueba verify-seed.sql. La consola no carga clientes ni operaciones; cualquier fila ahí es un dato ajeno.
 */
export const CLEAN_TABLES = Object.freeze(["clients", "client_contacts", "engagements", "work_orders", "time_entries", "skills"]);

/**
 * Calendario esperado, como "fecha|oficina|nombre". Es la MISMA lista literal que declara
 * public.seed_initial_holidays (cero_02) y que verifica verify-seed.sql: la prueba
 * "el calendario esperado coincide con cero_02" impide que se desalineen. `verify` la usa para
 * comparar el contenido real (no solo el conteo y la autoría): un feriado con fecha, oficina o nombre
 * distintos no pasa aunque sigan existiendo 28 filas.
 */
export const EXPECTED_CALENDAR = Object.freeze([
  "2026-01-01|0|Año Nuevo",
  "2026-01-22|0|Día del Estado Plurinacional",
  "2026-02-16|0|Lunes de Carnaval",
  "2026-02-17|0|Martes de Carnaval",
  "2026-04-03|0|Viernes Santo",
  "2026-05-01|0|Día del Trabajo",
  "2026-06-04|0|Corpus Christi",
  "2026-06-22|0|Año Nuevo Andino Amazónico",
  "2026-07-16|1|Aniversario del Departamento de La Paz",
  "2026-08-06|0|Día de la Independencia",
  "2026-09-24|2|Aniversario del Departamento de Santa Cruz",
  "2026-11-02|0|Día de los Difuntos",
  "2026-12-25|0|Navidad",
  "2026-06-05|0|Puente (Adicional)",
  "2026-08-07|0|Puente (Adicional)",
  "2027-01-01|0|Año Nuevo",
  "2027-01-22|0|Día del Estado Plurinacional",
  "2027-02-08|0|Lunes de Carnaval",
  "2027-02-09|0|Martes de Carnaval",
  "2027-03-26|0|Viernes Santo",
  "2027-05-01|0|Día del Trabajo",
  "2027-05-27|0|Corpus Christi",
  "2027-06-21|0|Año Nuevo Andino Amazónico",
  "2027-07-16|1|Aniversario del Departamento de La Paz",
  "2027-08-06|0|Día de la Independencia",
  "2027-09-24|2|Aniversario del Departamento de Santa Cruz",
  "2027-11-02|0|Día de los Difuntos",
  "2027-12-25|0|Navidad",
]);

/** MD5 (UTF-8) de cada entrada: lo que se envía a SQL, que calcula md5() sobre su propio texto UTF-8. */
export const EXPECTED_CALENDAR_MD5 = Object.freeze(
  EXPECTED_CALENDAR.map((entry) => createHash("md5").update(entry, "utf8").digest("hex")),
);

// Refs reales (decisiones.md §4.16). Un ambiente declarado no puede apuntar al ref de otro, y el
// proyecto Lovable queda fuera de uso.
export const KNOWN_REFS = Object.freeze({
  test: "slkqdcwwvmjtcbakajib",
  production: "xcdcxtduotwgwmhxvsiz",
});
export const FORBIDDEN_REFS = Object.freeze(["ugqxfnrxvksiltwxzist"]);

const ADVISORY_LOCK_KEY = "ems:etl:fase1";
const SQL_TIMEOUT_MS = 60_000;
const SECRET_ENV_NAMES = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "ADMIN_TEMP_PASSWORD"];

// code: CONFIG | GUARD | BLOQUEADO | RECONCILIACION | SQL | AUTH | LOGIN | VERIFICACION
export class Fase1Error extends Error {
  constructor(code, message, evidence) {
    super(message);
    this.name = "Fase1Error";
    this.code = code;
    this.evidence = evidence;
  }
}

export function makeRedactor(env, extraNames = []) {
  const secrets = [...SECRET_ENV_NAMES, "PGPASSWORD", ...extraNames]
    .map((name) => env[name])
    .filter((value) => typeof value === "string" && value.length >= 6);
  return (text) => {
    let out = String(text ?? "");
    for (const secret of secrets) out = out.split(secret).join("***");
    return out;
  };
}

// ---------------------------------------------------------------------------------------------
// Guarda de conexión

export function isLoopbackUrl(value) {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname.replace(/^\[|\]$/g, ""));
  } catch {
    return false;
  }
}

/** Devuelve la lista de problemas (vacía = combinación coherente). No toca la red. */
export function connectionGuardProblems(config, env) {
  const problems = [];
  const host = env.PGHOST ?? "";
  const user = env.PGUSER ?? "";
  const { environment, expectedProjectRef: ref, supabaseUrl } = config;

  if (FORBIDDEN_REFS.includes(ref)) problems.push(`el ref ${ref} (Lovable) está fuera de uso`);

  if (environment === "local") {
    if (!LOOPBACK_HOSTS.has(host)) problems.push(`environment=local exige PGHOST loopback (127.0.0.1/localhost/::1), no '${host || "(vacío)"}'`);
    if (!isLoopbackUrl(supabaseUrl)) problems.push(`environment=local exige supabaseUrl loopback, no '${supabaseUrl}'`);
    if (ref !== "local") problems.push(`environment=local exige expectedProjectRef='local', no '${ref}'`);
    return problems;
  }

  // test | production: siempre remoto, por el pooler y con el usuario postgres.<ref>.
  if (!/^[a-z0-9]{20}$/.test(ref)) problems.push("expectedProjectRef debe ser un ref de 20 caracteres alfanuméricos en minúscula");
  if (KNOWN_REFS[environment] && ref !== KNOWN_REFS[environment]) {
    problems.push(`environment=${environment} esperaba el ref ${KNOWN_REFS[environment]}, no ${ref}`);
  }
  const other = environment === "test" ? KNOWN_REFS.production : KNOWN_REFS.test;
  if (ref === other) problems.push(`el ref ${ref} pertenece al otro ambiente`);
  if (user !== `postgres.${ref}`) problems.push(`PGUSER debe ser postgres.${ref}, no '${user || "(vacío)"}'`);
  if (!/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)) problems.push(`PGHOST debe ser el pooler (*.pooler.supabase.com), no '${host || "(vacío)"}'`);
  if (supabaseUrl !== `https://${ref}.supabase.co`) problems.push(`supabaseUrl debe ser https://${ref}.supabase.co, no '${supabaseUrl}'`);
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Runner de psql

function psqlEnv(env) {
  const out = { ...env };
  // psql no necesita (ni debe heredar) las credenciales de Auth.
  for (const name of SECRET_ENV_NAMES) delete out[name];
  out.PGCLIENTENCODING = "UTF8";
  out.PGAPPNAME = "ems-etl-fase1";
  out.PGCONNECT_TIMEOUT = out.PGCONNECT_TIMEOUT ?? "10";
  out.PGDATABASE = out.PGDATABASE ?? "postgres";
  return out;
}

/**
 * Ejecuta `sql` por stdin con `psql -X -q -t -A -v ON_ERROR_STOP=1 [-1] -v k=v ... -f -`.
 * No lanza: devuelve { ok, stdout, stderr, code, signal, killed, spawnError }.
 */
export function runPsql(sql, vars = {}, options = {}) {
  const { env = process.env, singleTransaction = false, timeoutMs = SQL_TIMEOUT_MS, execFileImpl = execFile, extraSecretNames = [] } = options;
  const psqlBin = env.ETL_F1_PSQL || "psql";
  const args = ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"];
  if (singleTransaction) args.push("-1");
  for (const [name, value] of Object.entries(vars)) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Fase1Error("SQL", `nombre de variable psql inválido: ${name}`);
    args.push("-v", `${name}=${String(value)}`);
  }
  args.push("-f", "-");

  return new Promise((resolve) => {
    const child = execFileImpl(
      psqlBin,
      args,
      { env: (() => {
          const clean = psqlEnv(env);
          for (const name of extraSecretNames) delete clean[name];
          return clean;
        })(), timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (!error) return resolve({ ok: true, stdout: stdout ?? "", stderr: stderr ?? "", code: 0, signal: null, killed: false, spawnError: false });
        resolve({
          ok: false,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          code: typeof error.code === "number" ? error.code : null,
          signal: error.signal ?? null,
          killed: Boolean(error.killed),
          spawnError: error.code === "ENOENT",
        });
      },
    );
    child.stdin.end(sql);
  });
}

/**
 * kind: 'blocked'  → el SQL rechazó el estado (ETL_F1_*): bloquea, nada se escribió
 *       'tool'     → psql no existe: nada se escribió
 *       'uncertain'→ cualquier otro fallo de una ESCRITURA: el resultado no se conoce, se reconcilia leyendo
 */
export function classifySqlFailure(result) {
  const stderr = result.stderr ?? "";
  const marker = stderr.match(/(ETL_F1_(FOREIGN|CONFLICT|CATALOG)|HOLIDAYS_(ACTOR_INVALID|CATALOG_INVALID|CONFLICT|INCOMPLETE))[^\n]*/);
  if (marker) return { kind: "blocked", reason: marker[0].trim() };
  // La función de feriados aborta toda la llamada ante un feriado contradictorio (plan §6).
  if (/holiday|feriado/i.test(stderr) && /contradict|conflict|distint|mismatch|inconsisten/i.test(stderr)) {
    return { kind: "blocked", reason: stderr.split("\n").find((line) => /holiday|feriado/i.test(line))?.trim() ?? "feriado contradictorio" };
  }
  if (result.spawnError) return { kind: "tool", reason: "no se encontró el ejecutable psql (instale el cliente o defina ETL_F1_PSQL)" };
  return { kind: "uncertain", reason: stderr.trim().split("\n")[0] || `psql terminó con código ${result.code ?? result.signal ?? "desconocido"}` };
}

function lastNonEmptyLine(text) {
  const lines = String(text).split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

// ---------------------------------------------------------------------------------------------
// Inventario de migraciones del repositorio

export function loadMigrationInventory(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      version: name.split("_")[0],
      // Finales de línea normalizados: el hash no debe depender de autocrlf entre máquinas ni CI.
      sha256: createHash("sha256").update(readFileSync(path.join(dir, name), "utf8").replace(/\r\n/g, "\n")).digest("hex"),
    }));
  const inventoryHash = createHash("sha256").update(files.map((f) => `${f.name}:${f.sha256}`).join("\n")).digest("hex");
  return { count: files.length, inventoryHash, files };
}

// ---------------------------------------------------------------------------------------------
// Adaptador SQL

const TABLE_ALLOWLIST = new Set([
  "auth.users",
  "public.staff",
  "public.user_roles",
  "public.clients",
  "public.client_contacts",
  "public.engagements",
  "public.work_orders",
  "public.time_entries",
  "public.skills",
  "public.holidays",
  "public.notifications",
  "public.notification_emails",
]);

// Conteo tolerante a que la tabla no exista (query_to_xml evalúa el SQL en tiempo de ejecución).
function countExpr(table) {
  if (!TABLE_ALLOWLIST.has(table)) throw new Fase1Error("SQL", `tabla fuera de la lista permitida: ${table}`);
  return `CASE WHEN to_regclass('${table}') IS NULL THEN NULL ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ${table}', false, true, '')))[1]::text::bigint END`;
}

const LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended(:'lock_key', 0));";

export function createDbAdapter({ env = process.env, execFileImpl } = {}) {
  const run = (sql, vars = {}, options = {}) => runPsql(sql, vars, { env, execFileImpl, ...options });

  async function queryJson(sql, vars = {}) {
    const result = await run(sql, vars);
    if (!result.ok) {
      const failure = classifySqlFailure(result);
      throw new Fase1Error("SQL", `lectura SQL fallida: ${failure.reason}`);
    }
    const line = lastNonEmptyLine(result.stdout);
    try {
      return JSON.parse(line);
    } catch {
      throw new Fase1Error("SQL", "la lectura SQL no devolvió JSON interpretable");
    }
  }

  // Escritura: éxito → { stdout }; rechazo del SQL → BLOQUEADO; resto → SQL_INCIERTO (se reconcilia).
  async function write(sql, vars) {
    const result = await run(sql, { lock_key: ADVISORY_LOCK_KEY, ...vars }, { singleTransaction: true });
    if (result.ok) return result.stdout;
    const failure = classifySqlFailure(result);
    if (failure.kind === "blocked") throw new Fase1Error("BLOQUEADO", failure.reason);
    if (failure.kind === "tool") throw new Fase1Error("SQL", failure.reason);
    throw new Fase1Error("SQL_INCIERTO", `resultado SQL incierto: ${failure.reason}`);
  }

  return {
    async ping() {
      return queryJson(`SELECT json_build_object('current_user', current_user, 'database', current_database(), 'server_version_num', current_setting('server_version_num')::int)::text;`);
    },

    /** La función de feriados solo la ejecuta el propietario (plan §6): se comprueba antes de escribir. */
    async checkHolidayFunction() {
      return queryJson(`
        SELECT COALESCE((
          SELECT json_build_object(
                   'exists', true,
                   'owner_usable', pg_has_role(current_user, p.proowner, 'USAGE'),
                   'can_execute', has_function_privilege(current_user, p.oid, 'EXECUTE'),
                   'returns', pg_get_function_result(p.oid))
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'seed_initial_holidays'
        ), json_build_object('exists', false))::text;`);
    },

    async ledgerVersions() {
      const present = await queryJson(`SELECT json_build_object('present', to_regclass('supabase_migrations.schema_migrations') IS NOT NULL)::text;`);
      if (!present.present) return null;
      const out = await queryJson(`SELECT COALESCE(json_agg(version ORDER BY version), '[]'::json)::text FROM supabase_migrations.schema_migrations;`);
      return out;
    },

    async preconditions() {
      return queryJson(`
        SELECT json_build_object(
          'auth_users', ${countExpr("auth.users")},
          'staff', ${countExpr("public.staff")},
          'user_roles', ${countExpr("public.user_roles")},
          'clients', ${countExpr("public.clients")},
          'client_contacts', ${countExpr("public.client_contacts")},
          'engagements', ${countExpr("public.engagements")},
          'work_orders', ${countExpr("public.work_orders")},
          'time_entries', ${countExpr("public.time_entries")},
          'skills', ${countExpr("public.skills")},
          'holidays', ${countExpr("public.holidays")})::text;`);
    },

    async catalogCheck(admin) {
      return queryJson(
        `SELECT json_build_object(
           'society', (SELECT count(*) FROM public.society WHERE name = :'society_name'),
           'practice', (SELECT count(*) FROM public.practicas WHERE abbreviation = :'practice_code'),
           'category', (SELECT count(*) FROM public.categories c JOIN public.practicas p ON p.practica_id = c.practica_id
                         WHERE p.abbreviation = :'practice_code' AND c.category_name = :'category_name'))::text;`,
        { society_name: admin.societyName, practice_code: admin.practiceCode, category_name: admin.categoryName },
      );
    },

    async readStaff(staffId) {
      return queryJson(
        `SELECT COALESCE((SELECT row_to_json(r) FROM (
           SELECT s.staff_id, s.auth_user_id, lower(s.email) AS email, s.first_name, s.last_name, s.short_name, s.id_number,
                  to_char(s.hire_date, 'YYYY-MM-DD') AS hire_date, s.city, s.is_active, s.is_schedulable,
                  (s.deleted_at IS NOT NULL) AS deleted,
                  s.weekly_capacity_hours::text AS weekly_capacity_hours,
                  s.target_utilization_percent::text AS target_utilization_percent,
                  so.name AS society_name, p.abbreviation AS practice_code, c.category_name
             FROM public.staff s
             JOIN public.society so ON so.society_id = s.society_id
             JOIN public.practicas p ON p.practica_id = s.practica_id
             JOIN public.categories c ON c.category_id = s.category_id
            WHERE s.staff_id = :'staff_id'::uuid) r), 'null'::json)::text;`,
        { staff_id: staffId },
      );
    },

    /**
     * Inserta la ficha propia. Dentro de la transacción: bloqueo, y relectura de precondiciones
     * (ficha propia ya presente con el contenido esperado → sin cambios; estado ajeno → ETL_F1_FOREIGN).
     */
    async insertStaff(spec) {
      await write(
        `${LOCK_SQL}
         SELECT set_config('etl.staff_id', :'staff_id', true), set_config('etl.email', :'email', true);
         DO $etl$
         BEGIN
           IF EXISTS (SELECT 1 FROM public.staff WHERE staff_id = current_setting('etl.staff_id')::uuid) THEN
             IF NOT EXISTS (SELECT 1 FROM public.staff WHERE staff_id = current_setting('etl.staff_id')::uuid
                              AND lower(email) = current_setting('etl.email') AND deleted_at IS NULL) THEN
               RAISE EXCEPTION 'ETL_F1_CONFLICT: la ficha propia existe con contenido distinto';
             END IF;
             RETURN;
           END IF;
           IF EXISTS (SELECT 1 FROM public.staff) OR EXISTS (SELECT 1 FROM auth.users) OR EXISTS (SELECT 1 FROM public.user_roles) THEN
             RAISE EXCEPTION 'ETL_F1_FOREIGN: existen cuentas, fichas o roles ajenos a esta instalación';
           END IF;
         END
         $etl$;
         INSERT INTO public.staff (staff_id, first_name, last_name, email, short_name, id_number, hire_date, city,
                                   society_id, practica_id, category_id, is_active, is_schedulable,
                                   weekly_capacity_hours, target_utilization_percent)
         SELECT :'staff_id'::uuid, :'first_name', :'last_name', :'email', :'short_name', :'id_number', :'hire_date'::date, :'city',
                so.society_id, p.practica_id, c.category_id, true, false,
                :'weekly_capacity_hours'::numeric, :'target_utilization_percent'::numeric
           FROM public.society so
           JOIN public.practicas p ON p.abbreviation = :'practice_code'
           JOIN public.categories c ON c.practica_id = p.practica_id AND c.category_name = :'category_name'
          WHERE so.name = :'society_name'
            AND NOT EXISTS (SELECT 1 FROM public.staff WHERE staff_id = :'staff_id'::uuid);
         DO $etl$
         BEGIN
           IF NOT EXISTS (SELECT 1 FROM public.staff WHERE staff_id = current_setting('etl.staff_id')::uuid) THEN
             RAISE EXCEPTION 'ETL_F1_CATALOG: sociedad, práctica o categoría no resueltas en el catálogo';
           END IF;
         END
         $etl$;`,
        {
          staff_id: spec.staffId,
          first_name: spec.firstName,
          last_name: spec.lastName,
          email: spec.email,
          short_name: spec.shortName,
          id_number: spec.idNumber,
          hire_date: spec.hireDate,
          city: spec.city,
          society_name: spec.societyName,
          practice_code: spec.practiceCode,
          category_name: spec.categoryName,
          weekly_capacity_hours: spec.weeklyCapacityHours,
          target_utilization_percent: spec.targetUtilizationPercent,
        },
      );
    },

    async readLinkState(staffId) {
      return queryJson(
        `SELECT json_build_object(
           'staff_auth_user_id', (SELECT auth_user_id FROM public.staff WHERE staff_id = :'staff_id'::uuid),
           'staff_count', (SELECT count(*) FROM public.staff),
           'auth_users', COALESCE((SELECT json_agg(json_build_object('id', id, 'email', lower(email))) FROM auth.users), '[]'::json),
           'roles', COALESCE((SELECT json_agg(json_build_object('user_id', user_id, 'role', role::text, 'role_key', role_key)) FROM public.user_roles), '[]'::json))::text;`,
        { staff_id: staffId },
      );
    },

    /** Llama a la función propietaria de feriados; devuelve el entero que ella reporta. */
    async seedHolidays(staffId) {
      const stdout = await write(`${LOCK_SQL}\nSELECT public.seed_initial_holidays(:'staff_id'::uuid);`, { staff_id: staffId });
      const n = Number.parseInt(lastNonEmptyLine(stdout), 10);
      if (!Number.isInteger(n)) throw new Fase1Error("SQL_INCIERTO", "seed_initial_holidays no devolvió un entero");
      return n;
    },

    async holidaysSummary(staffId) {
      return queryJson(
        `SELECT json_build_object(
           'total', count(*),
           'by_admin', count(*) FILTER (WHERE created_by = :'staff_id'::uuid),
           -- filas cuyo (fecha|oficina|nombre) es exactamente uno de los 28 esperados; se comparan por MD5
           'matching', count(*) FILTER (WHERE md5(holiday_date::text || '|' || oficina::text || '|' || holiday_name)
                                               = ANY (string_to_array(:'expected', '~'))),
           'fingerprint', COALESCE(md5(string_agg(holiday_date::text || '|' || holiday_name || '|' || oficina::text || '|' || created_by::text, ';'
                                                   ORDER BY holiday_date, oficina)), ''))::text
           FROM public.holidays;`,
        // Se envían los MD5 (texto ASCII), no los nombres: en Windows psql recibe mal los acentos de una
        // variable -v («Año», «Día») por la codificación de la línea de comandos. Separador "~".
        { staff_id: staffId, expected: EXPECTED_CALENDAR_MD5.join("~") },
      );
    },

    /** Huella de los datos de negocio que la consola NO debe tocar en una segunda pasada. */
    async snapshot() {
      return queryJson(`
        SELECT json_build_object(
          'staff_md5', COALESCE((SELECT md5(string_agg(t::text, ';' ORDER BY t.staff_id)) FROM public.staff t), ''),
          'roles_md5', COALESCE((SELECT md5(string_agg(t::text, ';' ORDER BY t.user_id)) FROM public.user_roles t), ''),
          'holidays_md5', COALESCE((SELECT md5(string_agg(t::text, ';' ORDER BY t.holiday_date, t.oficina)) FROM public.holidays t), ''),
          'auth_users', ${countExpr("auth.users")},
          'clients', ${countExpr("public.clients")},
          'client_contacts', ${countExpr("public.client_contacts")},
          'engagements', ${countExpr("public.engagements")},
          'work_orders', ${countExpr("public.work_orders")},
          'time_entries', ${countExpr("public.time_entries")},
          'skills', ${countExpr("public.skills")},
          'notifications', ${countExpr("public.notifications")},
          'notification_emails', ${countExpr("public.notification_emails")})::text;`);
    },

    async countsForVerify() {
      return queryJson(`
        SELECT json_build_object(
          'staff', ${countExpr("public.staff")},
          'auth_users', ${countExpr("auth.users")},
          'user_roles', ${countExpr("public.user_roles")},
          'clients', ${countExpr("public.clients")},
          'client_contacts', ${countExpr("public.client_contacts")},
          'engagements', ${countExpr("public.engagements")},
          'work_orders', ${countExpr("public.work_orders")},
          'time_entries', ${countExpr("public.time_entries")},
          'skills', ${countExpr("public.skills")},
          'notifications', ${countExpr("public.notifications")},
          'notification_emails', ${countExpr("public.notification_emails")},
          'notification_emails_pending', CASE WHEN to_regclass('public.notification_emails') IS NULL THEN NULL
             ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.notification_emails WHERE status = ''pending''', false, true, '')))[1]::text::bigint END)::text;`);
    },

    async findStaffByEmail(email) {
      return queryJson(
        `SELECT COALESCE(json_agg(staff_id), '[]'::json)::text FROM public.staff WHERE lower(email) = :'email' AND deleted_at IS NULL;`,
        { email },
      );
    },
  };
}
