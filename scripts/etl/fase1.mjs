#!/usr/bin/env node
// Consola específica ETL fase 1 (bugs/ETL/carga/fase1/plan_v2.md §3–§4).
//
//   node scripts/etl/fase1.mjs preflight  --config <archivo>
//   node scripts/etl/fase1.mjs initialize --config <archivo>
//   node scripts/etl/fase1.mjs verify     --config <archivo>
//
// Alcance de fase 1: crear el administrador genérico (ficha + cuenta Auth + enlace + rol admin) y
// materializar el calendario de 28 feriados. NO carga clientes ni contactos y NO valida ciclos de
// relaciones: eso es del cargador de fase 2.
//
// Credenciales (nunca en la configuración, el journal ni los reportes), por entorno:
//   PGHOST PGPORT PGUSER PGPASSWORD [PGDATABASE]   conexión SQL (psql); remoto = pooler, postgres.<ref>
//   SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY    Auth Admin API y login de comprobación
//   ADMIN_TEMP_PASSWORD                            contraseña temporal del administrador
//   ETL_F1_STATE_DIR                               ruta absoluta del journal, fuera de Git
//   ETL_F1_SIGNUP_CLOSED=1                         declara cerrados Bootstrap y register-user (initialize)
//   ETL_F1_WINDOW_CONFIRMED=<ref>                  ventana exclusiva confirmada (solo test/production)
//
// Códigos de salida: 0 correcto · 1 error · 2 BLOQUEADO · 3 RECONCILIACION_REQUERIDA.

import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_DEFAULTS,
  EXPECTED_HOLIDAYS,
  Fase1Error,
  REPO_ROOT,
  connectionGuardProblems,
  createDbAdapter,
  loadMigrationInventory,
  makeRedactor,
} from "./fase1-db.mjs";

export { Fase1Error } from "./fase1-db.mjs";

export const STATES = [
  "PENDIENTE",
  "PREFLIGHT_VALIDADO",
  "STAFF_CONFIRMADO",
  "AUTH_CONFIRMADO",
  "ENLACE_Y_ROL_CONFIRMADOS",
  "CALENDARIO_CONFIRMADO",
  "VERIFICADO",
];

const stateIndex = (state) => STATES.indexOf(state);

// ---------------------------------------------------------------------------------------------
// Configuración

const ALLOWED_TOP = ["environment", "expectedProjectRef", "supabaseUrl", "installationId", "admin"];
const ALLOWED_ADMIN = ["email", "firstName", "lastName", "shortName", "idNumber", "hireDate", "city", "societyName", "practiceCode", "categoryName"];
const SECRET_KEY_PATTERN = /pass|secret|token|key|credential/i;

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function collectSecretKeys(value, prefix = "") {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) => [
    ...(SECRET_KEY_PATTERN.test(key) ? [`${prefix}${key}`] : []),
    ...collectSecretKeys(inner, `${prefix}${key}.`),
  ]);
}

export function parseConfig(raw) {
  const problems = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Fase1Error("CONFIG", "la configuración debe ser un objeto JSON");

  for (const key of collectSecretKeys(raw)) problems.push(`'${key}' parece una credencial: las credenciales llegan por entorno, no por configuración`);
  for (const key of Object.keys(raw)) if (!ALLOWED_TOP.includes(key)) problems.push(`clave desconocida: ${key}`);
  const admin = raw.admin;
  if (!admin || typeof admin !== "object") problems.push("falta el bloque admin");
  else for (const key of Object.keys(admin)) if (!ALLOWED_ADMIN.includes(key)) problems.push(`clave desconocida: admin.${key}`);

  const str = (value, label, max = 255) => {
    if (typeof value !== "string" || value.trim() === "" || value.length > max) problems.push(`${label} debe ser texto no vacío de hasta ${max} caracteres`);
  };
  if (!["local", "test", "production"].includes(raw.environment)) problems.push("environment debe ser local | test | production");
  str(raw.expectedProjectRef, "expectedProjectRef", 40);
  str(raw.supabaseUrl, "supabaseUrl", 200);
  if (typeof raw.installationId !== "string" || !/^[A-Za-z0-9._-]{8,64}$/.test(raw.installationId)) {
    problems.push("installationId debe tener 8-64 caracteres [A-Za-z0-9._-]");
  }
  if (admin && typeof admin === "object") {
    if (typeof admin.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin.email)) problems.push("admin.email inválido");
    str(admin.firstName, "admin.firstName", 100);
    str(admin.lastName, "admin.lastName", 100);
    str(admin.shortName, "admin.shortName", 50);
    str(admin.idNumber, "admin.idNumber", 50);
    str(admin.societyName, "admin.societyName", 100);
    str(admin.practiceCode, "admin.practiceCode", 10);
    str(admin.categoryName, "admin.categoryName", 50);
    if (!["La Paz", "Santa Cruz"].includes(admin.city)) problems.push("admin.city debe ser 'La Paz' o 'Santa Cruz'");
    if (typeof admin.hireDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(admin.hireDate) || Number.isNaN(Date.parse(admin.hireDate))) {
      problems.push("admin.hireDate debe ser YYYY-MM-DD válido");
    }
  }
  if (problems.length) throw new Fase1Error("CONFIG", `configuración inválida: ${problems.join("; ")}`);

  const normalized = {
    environment: raw.environment,
    expectedProjectRef: raw.expectedProjectRef,
    supabaseUrl: raw.supabaseUrl.replace(/\/+$/, ""),
    installationId: raw.installationId,
    admin: { ...admin, email: admin.email.trim().toLowerCase() },
  };
  return { ...normalized, configHash: sha256(stableStringify(normalized)) };
}

export function loadConfig(file) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Fase1Error("CONFIG", `no se pudo leer la configuración ${file}: ${error.message}`);
  }
  return parseConfig(raw);
}

export function resolveStateDir(env, repoRoot = REPO_ROOT) {
  const dir = env.ETL_F1_STATE_DIR;
  if (!dir) throw new Fase1Error("CONFIG", "falta ETL_F1_STATE_DIR (ruta absoluta del journal, fuera de Git)");
  if (!path.isAbsolute(dir)) throw new Fase1Error("CONFIG", "ETL_F1_STATE_DIR debe ser una ruta absoluta");
  const rel = path.relative(repoRoot, path.resolve(dir));
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
    throw new Fase1Error("CONFIG", "ETL_F1_STATE_DIR no puede estar dentro del repositorio (el journal va fuera de Git)");
  }
  return path.resolve(dir);
}

// ---------------------------------------------------------------------------------------------
// Journal durable y bloqueo

export const journalPathFor = (stateDir, installationId) => path.join(stateDir, `fase1-${installationId}.journal.json`);
export const lockPathFor = (stateDir, installationId) => path.join(stateDir, `fase1-${installationId}.lock`);

function journalChecksum(journal) {
  const { checksum: _omit, ...rest } = journal;
  return sha256(JSON.stringify(rest));
}

export function readJournal(file) {
  if (!existsSync(file)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Fase1Error("BLOQUEADO", `journal ilegible o truncado (${path.basename(file)}): se conserva como evidencia y bloquea la reanudación`);
  }
  if (!parsed || typeof parsed !== "object" || parsed.checksum !== journalChecksum(parsed)) {
    throw new Fase1Error("BLOQUEADO", `journal inconsistente (checksum) en ${path.basename(file)}: bloquea la reanudación`);
  }
  if (!STATES.includes(parsed.state)) throw new Fase1Error("BLOQUEADO", `journal con estado desconocido '${parsed.state}'`);
  return parsed;
}

// Checkpoint atómico: archivo temporal, sincronización y reemplazo.
export function writeJournal(file, journal) {
  const body = { ...journal };
  delete body.checksum;
  body.updatedAt = new Date().toISOString();
  const text = JSON.stringify({ ...body, checksum: journalChecksum(body) }, null, 2);
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = openSync(tmp, "w", 0o600);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
  try {
    const dirFd = openSync(path.dirname(file), "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {
    // Windows no permite abrir directorios para fsync; el reemplazo ya es atómico.
  }
  return { ...body, checksum: journalChecksum(body) };
}

/** Bloqueo de creación exclusiva: impide dos ejecuciones sobre el mismo journal en la misma máquina. */
export function acquireLock(stateDir, installationId) {
  mkdirSync(stateDir, { recursive: true });
  const file = lockPathFor(stateDir, installationId);
  let fd;
  try {
    fd = openSync(file, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Fase1Error("BLOQUEADO", `ya hay otra ejecución (bloqueo ${path.basename(file)}). Si no existe ningún proceso activo, verifique y elimine el archivo manualmente`);
    }
    throw error;
  }
  try {
    writeSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), at: new Date().toISOString() }));
  } finally {
    closeSync(fd);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      unlinkSync(file);
    } catch {
      // ya retirado
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Adaptador de Auth (Admin API vía SDK; login por HTTP)

export function createAuthAdapter({ url, serviceKey, anonKey, fetchImpl = globalThis.fetch, client, timeoutMs = 30_000, pageSize = 1000 }) {
  const timedFetch = (input, init = {}) => fetchImpl(input, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
  const admin =
    client ??
    createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: timedFetch },
    });

  return {
    /** Inventario completo y paginado de Auth. */
    async listAllUsers() {
      const all = [];
      for (let page = 1; page <= 1000; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: pageSize });
        if (error) throw new Fase1Error("AUTH", `no se pudo inventariar Auth: ${error.message}`);
        const users = data?.users ?? [];
        all.push(...users);
        if (users.length < pageSize) return all;
      }
      throw new Fase1Error("AUTH", "el inventario de Auth excede el límite de páginas");
    },

    async createUser(attrs) {
      try {
        const { data, error } = await admin.auth.admin.createUser(attrs);
        if (error) {
          const status = Number(error.status);
          return { ok: false, uncertain: !(status >= 400 && status < 500), message: error.message };
        }
        return { ok: true, user: data.user };
      } catch (error) {
        return { ok: false, uncertain: true, message: error?.message ?? String(error) };
      }
    },

    async login(email, password) {
      try {
        const response = await timedFetch(`${url}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.access_token) return { ok: false, status: response.status };
        return { ok: true, accessToken: body.access_token, userId: body.user?.id ?? null };
      } catch (error) {
        return { ok: false, status: 0, message: error?.message };
      }
    },

    async myStaffId(accessToken) {
      const response = await timedFetch(`${url}/rest/v1/rpc/get_my_staff_id`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) return null;
      const body = await response.json().catch(() => null);
      return typeof body === "string" ? body : null;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Contexto

export function createContext({ config, env = process.env, stateDir, db, auth, log, migrations, now } = {}) {
  const redact = makeRedactor(env);
  const lines = log ?? ((line) => console.log(redact(line)));
  return {
    config,
    env,
    stateDir,
    journalFile: stateDir ? journalPathFor(stateDir, config.installationId) : null,
    db: db ?? createDbAdapter({ env }),
    auth: auth ?? null,
    migrations: migrations ?? loadMigrationInventory(),
    now: now ?? (() => new Date().toISOString()),
    log: (line) => lines(redact(line)),
    redact,
    journal: null,
  };
}

function authFor(ctx, { loginOnly = false } = {}) {
  if (ctx.auth) return ctx.auth;
  const { SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_ANON_KEY: anonKey } = ctx.env;
  if (!anonKey || (!loginOnly && !serviceKey)) {
    throw new Fase1Error("CONFIG", loginOnly ? "falta SUPABASE_ANON_KEY en el entorno" : "faltan SUPABASE_SERVICE_ROLE_KEY y SUPABASE_ANON_KEY en el entorno");
  }
  // loginOnly: solo se usa login()/myStaffId(); no se crea el cliente con la service role.
  const adapter = createAuthAdapter({ url: ctx.config.supabaseUrl, serviceKey, anonKey, ...(loginOnly ? { client: {} } : {}) });
  if (!loginOnly) ctx.auth = adapter;
  return adapter;
}

function staffSpec(ctx) {
  const a = ctx.config.admin;
  return {
    staffId: ctx.journal.staffId,
    email: a.email,
    firstName: a.firstName,
    lastName: a.lastName,
    shortName: a.shortName,
    idNumber: a.idNumber,
    hireDate: a.hireDate,
    city: a.city,
    societyName: a.societyName,
    practiceCode: a.practiceCode,
    categoryName: a.categoryName,
    weeklyCapacityHours: ADMIN_DEFAULTS.weeklyCapacityHours,
    targetUtilizationPercent: ADMIN_DEFAULTS.targetUtilizationPercent,
  };
}

export function staffMismatches(row, spec) {
  const diffs = [];
  const check = (field, actual, expected) => {
    if (actual !== expected) diffs.push(field);
  };
  check("email", row.email, spec.email);
  check("first_name", row.first_name, spec.firstName);
  check("last_name", row.last_name, spec.lastName);
  check("short_name", row.short_name, spec.shortName);
  check("id_number", row.id_number, spec.idNumber);
  check("hire_date", row.hire_date, spec.hireDate);
  check("city", row.city, spec.city);
  check("society_name", row.society_name, spec.societyName);
  check("practice_code", row.practice_code, spec.practiceCode);
  check("category_name", row.category_name, spec.categoryName);
  check("is_schedulable", row.is_schedulable, false);
  check("deleted", row.deleted, false);
  check("weekly_capacity_hours", Number(row.weekly_capacity_hours), spec.weeklyCapacityHours);
  check("target_utilization_percent", Number(row.target_utilization_percent), spec.targetUtilizationPercent);
  return diffs;
}

// ---------------------------------------------------------------------------------------------
// Journal: operaciones sobre el contexto

function checkpoint(ctx, patch) {
  ctx.journal = writeJournal(ctx.journalFile, { ...ctx.journal, ...patch });
}

function addEvent(ctx, event, detail) {
  const entry = { at: ctx.now(), event, ...(detail ? { detail: ctx.redact(typeof detail === "string" ? detail : JSON.stringify(detail)) } : {}) };
  checkpoint(ctx, { events: [...ctx.journal.events, entry] });
}

function advance(ctx, state, extra = {}) {
  if (stateIndex(state) > stateIndex(ctx.journal.state)) checkpoint(ctx, { state, ...extra });
  else if (Object.keys(extra).length) checkpoint(ctx, extra);
}

function setIntent(ctx, name, status, extra = {}) {
  checkpoint(ctx, { intents: { ...ctx.journal.intents, [name]: { status, at: ctx.now(), ...extra } } });
}

const blockedNoWrite = (message, evidence) => Object.assign(new Fase1Error("BLOQUEADO", message, evidence), { transient: true });

async function guarded(ctx, step, fn) {
  try {
    return await fn();
  } catch (error) {
    const flag = (name, reason, evidence) => {
      if (!ctx.journal) return;
      checkpoint(ctx, { flag: name, flagReason: ctx.redact(reason), ...(evidence ? { evidence } : {}) });
    };
    if (error instanceof Fase1Error) {
      if (error.code === "BLOQUEADO" && !error.transient) flag("BLOQUEADO", error.message, error.evidence);
      if (error.code === "SQL_INCIERTO" || error.code === "AUTH_INCIERTO") {
        flag("RECONCILIACION_REQUERIDA", error.message);
        throw new Fase1Error("RECONCILIACION", error.message);
      }
      throw error;
    }
    flag("RECONCILIACION_REQUERIDA", `error inesperado en ${step}: ${error?.message ?? error}`);
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Preflight

function checkEnvForInitialize(ctx) {
  const { env, config } = ctx;
  const problems = [];
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]) if (!env[name]) problems.push(`falta ${name}`);
  if (!env.ADMIN_TEMP_PASSWORD || env.ADMIN_TEMP_PASSWORD.length < 12) problems.push("ADMIN_TEMP_PASSWORD debe tener al menos 12 caracteres");
  if (env.ETL_F1_SIGNUP_CLOSED !== "1") problems.push("falta la declaración explícita ETL_F1_SIGNUP_CLOSED=1 (Bootstrap y register-user no disponibles durante la ventana)");
  if (config.environment !== "local" && env.ETL_F1_WINDOW_CONFIRMED !== config.expectedProjectRef) {
    problems.push(`falta la confirmación de ventana exclusiva ETL_F1_WINDOW_CONFIRMED=${config.expectedProjectRef}`);
  }
  if (problems.length) throw new Fase1Error("CONFIG", `no se puede inicializar: ${problems.join("; ")}`);
}

export async function runPreflight(ctx, { strictClean = true } = {}) {
  const checks = [];
  const add = (name, ok, detail = "", level = "fail") => checks.push({ name, ok, detail, level: ok ? "pass" : level });

  const problems = connectionGuardProblems(ctx.config, ctx.env);
  add("entorno, URL, referencia y conexión SQL coherentes", problems.length === 0, problems.join("; "));
  if (problems.length) return { ok: false, checks };

  let info;
  try {
    info = await ctx.db.ping();
    add("conexión SQL", true, `${info.current_user}@${info.database}`);
  } catch (error) {
    add("conexión SQL", false, error.message);
    return { ok: false, checks };
  }

  const fn = await ctx.db.checkHolidayFunction();
  add(
    "función public.seed_initial_holidays ejecutable por la conexión propietaria",
    Boolean(fn.exists && fn.owner_usable && fn.can_execute),
    fn.exists ? `owner_usable=${fn.owner_usable} can_execute=${fn.can_execute}` : "la función no existe (¿migraciones sin aplicar?)",
  );

  const ledger = await ctx.db.ledgerVersions();
  if (ledger === null) {
    add("ledger de migraciones", true, "sin supabase_migrations (base scratch): se registra solo el inventario del repositorio", "warn");
  } else {
    const repoVersions = ctx.migrations.files.map((f) => f.version);
    const missing = repoVersions.filter((v) => !ledger.includes(v));
    const extra = ledger.filter((v) => !repoVersions.includes(v));
    add("migraciones aplicadas = archivos del repositorio", missing.length === 0 && extra.length === 0, `repositorio=${repoVersions.length} ledger=${ledger.length} faltan=${missing.length} sobran=${extra.length}`);
  }

  const catalog = await ctx.db.catalogCheck(ctx.config.admin);
  add("sociedad, práctica y categoría del administrador resuelven en el catálogo", catalog.society === 1 && catalog.practice === 1 && catalog.category === 1, JSON.stringify(catalog));

  const pre = await ctx.db.preconditions();
  const dirty = Object.entries(pre).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${k}=${n}`);
  let owned = false;
  if (ctx.journalFile && existsSync(ctx.journalFile)) {
    try {
      owned = readJournal(ctx.journalFile) !== null;
    } catch {
      owned = false;
    }
  }
  if (dirty.length === 0) add("estado previo limpio (preinit)", true, "cero cuentas, fichas, roles, clientes, operaciones y feriados");
  else if (owned) add("estado previo", true, `instalación con journal propio (${dirty.join(", ")})`, "warn");
  else add("estado previo limpio (preinit)", !strictClean, `existen datos sin journal propio: ${dirty.join(", ")}`);

  return { ok: checks.every((c) => c.ok), checks };
}

function printChecks(ctx, checks) {
  for (const c of checks) ctx.log(`${c.ok ? (c.level === "warn" ? "WARN" : "PASS") : "FAIL"} — ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
}

export async function preflight(ctx) {
  const result = await runPreflight(ctx);
  printChecks(ctx, result.checks);
  ctx.log(result.ok ? "ETL F1 PREFLIGHT: OK" : "ETL F1 PREFLIGHT: FALLÓ");
  return result;
}

// ---------------------------------------------------------------------------------------------
// Verificación del estado persistido

export async function verifyPersisted(ctx, { staffId, authUserId }) {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok, detail, level: ok ? "pass" : "fail" });
  const spec = { ...staffSpec({ ...ctx, journal: { staffId } }) };

  const row = await ctx.db.readStaff(staffId);
  if (!row) add("ficha de administrador presente", false, staffId);
  else {
    const diffs = staffMismatches(row, spec);
    add("ficha de administrador con el contenido esperado (40/85, no programable)", diffs.length === 0, diffs.join(", "));
  }

  const link = await ctx.db.readLinkState(staffId);
  add("una sola ficha y una sola cuenta Auth", Number(link.staff_count) === 1 && link.auth_users.length === 1, `staff=${link.staff_count} auth=${link.auth_users.length}`);
  add("ficha enlazada a la cuenta Auth", Boolean(authUserId) && link.staff_auth_user_id === authUserId && link.auth_users[0]?.id === authUserId, "");
  const roleOk = link.roles.length === 1 && link.roles[0].user_id === authUserId && link.roles[0].role === "admin" && link.roles[0].role_key === "admin";
  add("único rol inicial admin/admin", roleOk, `roles=${link.roles.length}`);

  const holidays = await ctx.db.holidaysSummary(staffId);
  add(`${EXPECTED_HOLIDAYS} feriados con autoría del administrador`, Number(holidays.total) === EXPECTED_HOLIDAYS && Number(holidays.by_admin) === EXPECTED_HOLIDAYS, `total=${holidays.total} propios=${holidays.by_admin}`);

  const counts = await ctx.db.countsForVerify();
  add("cero clientes y cero operaciones", [counts.clients, counts.engagements, counts.work_orders].every((n) => Number(n) === 0), `clientes=${counts.clients} encargos=${counts.engagements} OT=${counts.work_orders}`);
  ctx.log(`INFO — cola de correo: notification_emails=${counts.notification_emails} pendientes=${counts.notification_emails_pending} · notifications=${counts.notifications} (concilie antes de habilitar MAIL_ENABLED)`);
  return checks;
}

// ---------------------------------------------------------------------------------------------
// Inicialización

function openJournal(ctx) {
  const existing = readJournal(ctx.journalFile);
  const { config, migrations } = ctx;
  if (!existing) return null;
  const contradictions = [];
  if (existing.installationId !== config.installationId) contradictions.push("installationId");
  if (existing.environment !== config.environment) contradictions.push("environment");
  if (existing.projectRef !== config.expectedProjectRef) contradictions.push("expectedProjectRef");
  if (existing.configHash !== config.configHash) contradictions.push("configuración (hash)");
  if (existing.migrations?.inventoryHash !== migrations.inventoryHash) contradictions.push("inventario de migraciones (hash)");
  if (contradictions.length) {
    throw new Fase1Error("BLOQUEADO", `el journal contradice la ejecución actual: ${contradictions.join(", ")}`, { journal: path.basename(ctx.journalFile) });
  }
  if (existing.flag === "BLOQUEADO") {
    throw new Fase1Error("BLOQUEADO", `journal bloqueado: ${existing.flagReason ?? "sin motivo registrado"}. Revise la evidencia antes de reanudar`);
  }
  return existing;
}

function newJournal(ctx) {
  const { config, migrations } = ctx;
  return {
    schemaVersion: 1,
    installationId: config.installationId,
    environment: config.environment,
    projectRef: config.expectedProjectRef,
    configHash: config.configHash,
    createdAt: ctx.now(),
    state: "PENDIENTE",
    flag: null,
    flagReason: null,
    correlation: randomUUID(),
    staffId: randomUUID(),
    authUserId: null,
    migrations: { count: migrations.count, inventoryHash: migrations.inventoryHash, files: migrations.files.map(({ name, sha256: hash }) => ({ name, sha256: hash })) },
    intents: {},
    events: [],
    evidence: null,
  };
}

async function ensureStaff(ctx) {
  const spec = staffSpec(ctx);
  let row = await ctx.db.readStaff(spec.staffId);
  const pending = ctx.journal.intents.staff?.status === "pending";

  if (!row) {
    if (stateIndex(ctx.journal.state) >= stateIndex("STAFF_CONFIRMADO")) {
      throw new Fase1Error("BLOQUEADO", "la ficha propia confirmada ya no existe", { staffId: spec.staffId });
    }
    const pre = await ctx.db.preconditions();
    const foreign = Object.entries(pre).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${k}=${n}`);
    if (foreign.length) throw blockedNoWrite(`existen datos ajenos a esta instalación (${foreign.join(", ")}); no se crea ninguna identidad nueva`, pre);
    setIntent(ctx, "staff", "pending", { staffId: spec.staffId });
    await ctx.db.insertStaff(spec);
    row = await ctx.db.readStaff(spec.staffId);
    if (!row) throw new Fase1Error("SQL_INCIERTO", "la ficha no aparece tras el INSERT");
    addEvent(ctx, "staff_creada", { staffId: spec.staffId });
  } else if (pending) {
    addEvent(ctx, "staff_recuperada", { staffId: spec.staffId });
  }

  const diffs = staffMismatches(row, spec);
  if (diffs.length) throw new Fase1Error("BLOQUEADO", `la ficha propia tiene contenido distinto del esperado (${diffs.join(", ")})`, { staffId: spec.staffId, diffs });
  setIntent(ctx, "staff", "confirmed", { staffId: spec.staffId });
  advance(ctx, "STAFF_CONFIRMADO");
  return row;
}

const correlationOf = (user) => user?.user_metadata?.etl_f1?.correlation ?? null;

async function ensureAuth(ctx) {
  const auth = authFor(ctx);
  const { email } = ctx.config.admin;
  const users = await auth.listAllUsers();
  const sameEmail = users.filter((u) => String(u.email ?? "").toLowerCase() === email);
  const ours = users.filter((u) => correlationOf(u) === ctx.journal.correlation);

  if (ours.length > 1) throw new Fase1Error("BLOQUEADO", "varias cuentas de Auth con la correlación de esta instalación", { ids: ours.map((u) => u.id) });
  if (ours.length === 1) {
    const [user] = ours;
    if (String(user.email ?? "").toLowerCase() !== email) throw new Fase1Error("BLOQUEADO", "la cuenta con nuestra correlación tiene otro correo", { id: user.id });
    if (ctx.journal.authUserId && ctx.journal.authUserId !== user.id) throw new Fase1Error("BLOQUEADO", "el journal apunta a otra cuenta de Auth", { id: user.id });
    if (ctx.journal.intents.auth?.status === "pending") addEvent(ctx, "auth_recuperada", { id: user.id });
    setIntent(ctx, "auth", "confirmed", { userId: user.id });
    advance(ctx, "AUTH_CONFIRMADO", { authUserId: user.id });
    return user.id;
  }
  if (sameEmail.length) {
    // Una cuenta con el mismo correo pero sin nuestra correlación NO se adopta.
    throw new Fase1Error("BLOQUEADO", "existe una cuenta de Auth con el correo del administrador que no pertenece a esta instalación; no se adopta", { ids: sameEmail.map((u) => u.id) });
  }
  if (ctx.journal.authUserId) throw new Fase1Error("BLOQUEADO", "la cuenta de Auth confirmada en el journal ya no existe", { id: ctx.journal.authUserId });
  if (users.length) throw blockedNoWrite(`existen ${users.length} cuenta(s) de Auth ajenas a esta instalación; no se crea ninguna identidad nueva`);

  setIntent(ctx, "auth", "pending", { correlation: ctx.journal.correlation });
  const created = await auth.createUser({
    email,
    password: ctx.env.ADMIN_TEMP_PASSWORD,
    email_confirm: true,
    user_metadata: { etl_f1: { installation_id: ctx.config.installationId, correlation: ctx.journal.correlation, purpose: "administrador-inicial" } },
  });
  if (!created.ok) {
    if (created.uncertain) throw new Fase1Error("AUTH_INCIERTO", `resultado incierto al crear la cuenta de Auth: ${created.message}`);
    throw new Fase1Error("AUTH", `Auth rechazó la creación de la cuenta: ${created.message}`);
  }
  addEvent(ctx, "auth_creada", { id: created.user.id });
  setIntent(ctx, "auth", "confirmed", { userId: created.user.id });
  advance(ctx, "AUTH_CONFIRMADO", { authUserId: created.user.id });
  return created.user.id;
}

async function ensureLinkAndRole(ctx) {
  const authUserId = ctx.journal.authUserId;
  const link = await ctx.db.readLinkState(ctx.journal.staffId);
  const problems = [];
  if (link.staff_auth_user_id !== authUserId) problems.push("la ficha no quedó enlazada a la cuenta Auth");
  if (link.auth_users.length !== 1 || link.auth_users[0]?.id !== authUserId) problems.push("Auth contiene cuentas distintas de la propia");
  const roles = link.roles;
  if (roles.length !== 1 || roles[0].user_id !== authUserId || roles[0].role !== "admin" || roles[0].role_key !== "admin") {
    problems.push(`roles inesperados (${roles.map((r) => `${r.role}/${r.role_key}`).join(", ") || "ninguno"}): no se promueve ni reasigna`);
  }
  if (problems.length) throw new Fase1Error("BLOQUEADO", problems.join("; "), link);
  advance(ctx, "ENLACE_Y_ROL_CONFIRMADOS");
}

async function ensureCalendar(ctx) {
  const staffId = ctx.journal.staffId;
  const before = await ctx.db.holidaysSummary(staffId);
  setIntent(ctx, "calendar", "pending");
  const n = await ctx.db.seedHolidays(staffId);
  if (n !== EXPECTED_HOLIDAYS) throw new Fase1Error("BLOQUEADO", `seed_initial_holidays devolvió ${n}, se esperaban ${EXPECTED_HOLIDAYS}`, { returned: n });
  const after = await ctx.db.holidaysSummary(staffId);
  if (Number(after.total) !== EXPECTED_HOLIDAYS || Number(after.by_admin) !== EXPECTED_HOLIDAYS) {
    throw new Fase1Error("BLOQUEADO", `el calendario no quedó completo (total=${after.total}, propios=${after.by_admin})`, after);
  }
  if (Number(before.total) === EXPECTED_HOLIDAYS && before.fingerprint !== after.fingerprint) {
    throw new Fase1Error("BLOQUEADO", "el calendario completo fue modificado por una repetición", { before: before.fingerprint, after: after.fingerprint });
  }
  setIntent(ctx, "calendar", "confirmed");
  advance(ctx, "CALENDARIO_CONFIRMADO");
  return Number(before.total) === EXPECTED_HOLIDAYS ? "sin_cambios" : "materializado";
}

async function ensureLogin(ctx) {
  const auth = authFor(ctx);
  const { email } = ctx.config.admin;
  const login = await auth.login(email, ctx.env.ADMIN_TEMP_PASSWORD);
  if (!login.ok) throw new Fase1Error("LOGIN", `el login de comprobación falló (HTTP ${login.status ?? "?"})`);
  if (login.userId !== ctx.journal.authUserId) throw new Fase1Error("BLOQUEADO", "el login devolvió una cuenta distinta de la registrada", { userId: login.userId });
  const staffId = await auth.myStaffId(login.accessToken);
  if (staffId !== ctx.journal.staffId) throw new Fase1Error("LOGIN", `get_my_staff_id() devolvió '${staffId ?? "null"}' en vez de la ficha propia`);
}

export async function initialize(ctx) {
  mkdirSync(ctx.stateDir, { recursive: true });
  const release = acquireLock(ctx.stateDir, ctx.config.installationId);
  try {
    return await initializeLocked(ctx);
  } finally {
    release();
  }
}

async function initializeLocked(ctx) {
  const problems = connectionGuardProblems(ctx.config, ctx.env);
  if (problems.length) throw new Fase1Error("GUARD", `combinación de entorno rechazada: ${problems.join("; ")}`);
  checkEnvForInitialize(ctx);

  ctx.journal = openJournal(ctx);
  const preflightResult = await runPreflight(ctx, { strictClean: !ctx.journal });
  printChecks(ctx, preflightResult.checks);
  if (!preflightResult.ok) throw blockedNoWrite("el preflight falló; no se escribió nada");

  if (!ctx.journal) {
    ctx.journal = writeJournal(ctx.journalFile, newJournal(ctx));
    ctx.log(`journal creado (${path.basename(ctx.journalFile)}); ficha ${ctx.journal.staffId}`);
  }
  advance(ctx, "PREFLIGHT_VALIDADO");
  if (ctx.journal.flag === "RECONCILIACION_REQUERIDA") {
    addEvent(ctx, "reconciliacion_iniciada", ctx.journal.flagReason);
    ctx.log(`reconciliando antes de continuar: ${ctx.journal.flagReason}`);
  }

  const repetition = ctx.journal.state === "VERIFICADO";
  const snapshotBefore = repetition ? await ctx.db.snapshot() : null;
  const created = [];

  await guarded(ctx, "ficha", async () => {
    const had = ctx.journal.state;
    await ensureStaff(ctx);
    if (stateIndex(had) < stateIndex("STAFF_CONFIRMADO")) created.push("ficha");
  });
  ctx.log(`PASS — ficha ${ctx.journal.staffId} confirmada`);

  await guarded(ctx, "auth", async () => {
    const had = ctx.journal.state;
    await ensureAuth(ctx);
    if (stateIndex(had) < stateIndex("AUTH_CONFIRMADO")) created.push("cuenta Auth");
  });
  ctx.log(`PASS — cuenta Auth ${ctx.journal.authUserId} confirmada`);

  await guarded(ctx, "enlace y rol", () => ensureLinkAndRole(ctx));
  ctx.log("PASS — enlace ficha↔Auth y único rol admin/admin confirmados");

  const calendar = await guarded(ctx, "calendario", () => ensureCalendar(ctx));
  ctx.log(`PASS — calendario de ${EXPECTED_HOLIDAYS} feriados (${calendar})`);

  await guarded(ctx, "login", () => ensureLogin(ctx));
  ctx.log("PASS — login de comprobación resuelve get_my_staff_id() a la ficha propia");

  const checks = await verifyPersisted(ctx, { staffId: ctx.journal.staffId, authUserId: ctx.journal.authUserId });
  printChecks(ctx, checks);
  if (!checks.every((c) => c.ok)) {
    await guarded(ctx, "verificación final", async () => {
      throw new Fase1Error("BLOQUEADO", "la verificación del estado persistido falló", { checks });
    });
  }

  if (repetition) {
    const snapshotAfter = await ctx.db.snapshot();
    const changed = Object.keys(snapshotBefore).filter((k) => String(snapshotBefore[k]) !== String(snapshotAfter[k]));
    if (changed.length) {
      await guarded(ctx, "repetición", async () => {
        throw new Fase1Error("BLOQUEADO", `la segunda inicialización modificó datos (${changed.join(", ")})`, { before: snapshotBefore, after: snapshotAfter });
      });
    }
    ctx.log("PASS — segunda inicialización sin escrituras de negocio");
  }

  advance(ctx, "VERIFICADO", { flag: null, flagReason: null });
  ctx.log("ETL F1 INITIALIZE: VERIFICADO");
  return { state: ctx.journal.state, staffId: ctx.journal.staffId, authUserId: ctx.journal.authUserId, created, calendar, repetition };
}

// ---------------------------------------------------------------------------------------------
// verify

export async function verify(ctx, { skipLogin = false } = {}) {
  const problems = connectionGuardProblems(ctx.config, ctx.env);
  if (problems.length) throw new Fase1Error("GUARD", `combinación de entorno rechazada: ${problems.join("; ")}`);

  let journal = null;
  if (ctx.journalFile && existsSync(ctx.journalFile)) {
    journal = readJournal(ctx.journalFile);
    if (journal.installationId !== ctx.config.installationId) throw new Fase1Error("BLOQUEADO", "el journal pertenece a otra instalación");
  }

  let staffId = journal?.staffId ?? null;
  if (!staffId) {
    const ids = await ctx.db.findStaffByEmail(ctx.config.admin.email);
    if (ids.length !== 1) throw new Fase1Error("VERIFICACION", `se esperaba exactamente una ficha para ${ctx.config.admin.email}, hay ${ids.length}`);
    staffId = ids[0];
  }
  const link = await ctx.db.readLinkState(staffId);
  const authUserId = journal?.authUserId ?? link.staff_auth_user_id;

  const checks = await verifyPersisted(ctx, { staffId, authUserId });
  if (journal) checks.push({ name: "journal en estado VERIFICADO", ok: journal.state === "VERIFICADO" && !journal.flag, detail: `${journal.state}${journal.flag ? ` · ${journal.flag}` : ""}`, level: journal.state === "VERIFICADO" && !journal.flag ? "pass" : "fail" });

  if (!skipLogin && ctx.env.SUPABASE_ANON_KEY && ctx.env.ADMIN_TEMP_PASSWORD) {
    const auth = authFor(ctx, { loginOnly: true });
    const login = await auth.login(ctx.config.admin.email, ctx.env.ADMIN_TEMP_PASSWORD);
    const resolved = login.ok ? await auth.myStaffId(login.accessToken) : null;
    checks.push({ name: "login y get_my_staff_id()", ok: resolved === staffId, detail: login.ok ? "" : `HTTP ${login.status}`, level: resolved === staffId ? "pass" : "fail" });
  } else {
    ctx.log("WARN — login omitido (faltan SUPABASE_ANON_KEY / ADMIN_TEMP_PASSWORD o se pidió --skip-login)");
  }
  printChecks(ctx, checks);
  const ok = checks.every((c) => c.ok);
  ctx.log(ok ? "ETL F1 VERIFY: ALL CHECKS PASSED" : "ETL F1 VERIFY: FALLÓ");
  return { ok, checks };
}

// ---------------------------------------------------------------------------------------------
// CLI

const EXIT = { ok: 0, error: 1, BLOQUEADO: 2, RECONCILIACION: 3 };

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = { skipLogin: false, config: null };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--config") flags.config = rest[(i += 1)];
    else if (rest[i] === "--skip-login") flags.skipLogin = true;
    else throw new Fase1Error("CONFIG", `argumento desconocido: ${rest[i]}`);
  }
  return { command, ...flags };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const redact = makeRedactor(env);
  try {
    const { command, config: configFile, skipLogin } = parseArgs(argv);
    if (!["preflight", "initialize", "verify"].includes(command) || !configFile) {
      throw new Fase1Error("CONFIG", "uso: node scripts/etl/fase1.mjs <preflight|initialize|verify> --config <archivo> [--skip-login]");
    }
    const config = loadConfig(configFile);
    const stateDir = command === "initialize" || env.ETL_F1_STATE_DIR ? resolveStateDir(env) : null;
    const ctx = createContext({ config, env, stateDir });
    ctx.log(`consola ETL fase 1 · ${command} · ${config.environment} (${config.expectedProjectRef}) · instalación ${config.installationId}`);

    if (command === "preflight") return (await preflight(ctx)).ok ? EXIT.ok : EXIT.error;
    if (command === "verify") return (await verify(ctx, { skipLogin })).ok ? EXIT.ok : EXIT.error;
    await initialize(ctx);
    return EXIT.ok;
  } catch (error) {
    const message = redact(error?.message ?? String(error));
    console.error(`ERROR${error?.code ? ` [${error.code}]` : ""}: ${message}`);
    if (error?.evidence) console.error(`evidencia: ${redact(JSON.stringify(error.evidence))}`);
    return EXIT[error?.code] ?? EXIT.error;
  }
}

const sameFile = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && sameFile(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  process.exitCode = await main();
}
