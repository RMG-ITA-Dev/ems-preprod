// Consola ETL fase 2. Nunca ejecuta migraciones ni usa rutas de Auth que envían correo.
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthAdapter, acquireLock, createContext as createFase1Context, Fase1Error, readJournal, sha256, writeJournal } from "./fase1.mjs";
import { FORBIDDEN_REFS, KNOWN_REFS, REPO_ROOT, connectionGuardProblems, makeRedactor } from "./fase1-db.mjs";
import { EXPECTED, Fase2InputError, loadInputs, normalizeEmail, resolveIndustryRef, rowSourceHash, validateRoleAssignment } from "./fase2-input.mjs";
import { createFase2DbAdapter } from "./fase2-db.mjs";

export const STATES = ["PENDIENTE", "VALIDADO", "PREFLIGHT_VALIDADO", "CLIENTES_CONFIRMADOS", "STAFF_CONFIRMADO", "CUENTAS_CONFIRMADAS", "ENLACE_Y_ROL_CONFIRMADOS", "VERIFICADO"];
export const EXIT = Object.freeze({ ok: 0, error: 1, BLOQUEADO: 2, RECONCILIACION: 3, RECONCILIACION_REQUERIDA: 3 });
const TOP = ["schemaVersion", "environment", "expectedProjectRef", "supabaseUrl", "installationId", "bootstrapAdminEmail", "snapshot", "inputs", "expectations"];
const INPUT_NAMES = ["clients", "contacts", "staff", "users", "rates", "services"];
const secretKey = /pass|secret|token|key|credential/i;
const sameFile = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);

function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function bad(message) { throw new Fase1Error("CONFIG", message); }
export function parseConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("la configuración debe ser un objeto JSON");
  const unknown = Object.keys(raw).filter((key) => !TOP.includes(key)); if (unknown.length) bad(`clave desconocida: ${unknown.join(", ")}`);
  const scan = (value, prefix = "") => Object.entries(value ?? {}).flatMap(([key, inner]) => [ ...(secretKey.test(key) ? [`${prefix}${key}`] : []), ...(inner && typeof inner === "object" ? scan(inner, `${prefix}${key}.`) : []) ]);
  const secrets = scan(raw); if (secrets.length) bad(`la configuración no puede contener credenciales: ${secrets.join(", ")}`);
  if (raw.schemaVersion !== 1 || !["local", "test", "production"].includes(raw.environment)) bad("schemaVersion=1 y environment local|test|production son obligatorios");
  if (typeof raw.expectedProjectRef !== "string" || typeof raw.supabaseUrl !== "string" || !/^f2-[A-Za-z0-9._-]{5,61}$/.test(raw.installationId ?? "")) bad("ref, URL o installationId inválidos");
  if (normalizeEmail(raw.bootstrapAdminEmail) !== "admin@ruizmier.com" || raw.snapshot !== "TimeControlDB_20261023_1200") bad("bootstrapAdminEmail o snapshot no aprobados");
  if (!raw.inputs || typeof raw.inputs !== "object" || INPUT_NAMES.some((name) => typeof raw.inputs[name] !== "string" || !path.isAbsolute(raw.inputs[name]))) bad("inputs debe contener seis rutas absolutas");
  if (raw.environment !== "local" && raw.expectations && stable({ ...EXPECTED, ...raw.expectations }) !== stable(EXPECTED)) {
    bad("test y production no permiten alterar expectations");
  }
  const expectations = { ...EXPECTED, ...(raw.environment === "local" ? raw.expectations : {}) };
  const normalized = { ...raw, supabaseUrl: raw.supabaseUrl.replace(/\/+$/, ""), bootstrapAdminEmail: normalizeEmail(raw.bootstrapAdminEmail), expectations };
  return { ...normalized, configHash: sha256(stable(normalized)) };
}
export function loadConfig(file) { try { return parseConfig(JSON.parse(readFileSync(file, "utf8"))); } catch (error) { if (error instanceof Fase1Error) throw error; throw new Fase1Error("CONFIG", `no se pudo leer configuración: ${error.message}`); } }
export function resolveStateDir(env, repoRoot = REPO_ROOT) {
  const value = env.ETL_F2_STATE_DIR; if (!value || !path.isAbsolute(value)) bad("ETL_F2_STATE_DIR debe ser una ruta absoluta");
  mkdirSync(value, { recursive: true }); const resolved = realpathSync(value); const root = realpathSync(repoRoot); const relative = path.relative(root, resolved);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) bad("ETL_F2_STATE_DIR no puede estar dentro del repositorio, ni por enlace");
  return resolved;
}
export const journalPathFor = (dir, id) => path.join(dir, `fase2-${id}.journal.json`);
function checkpoint(ctx, patch) { ctx.journal = writeJournal(ctx.journalFile, { ...ctx.journal, ...patch }); return ctx.journal; }
function journalFor(ctx, inputs) { return { version: 1, installationId: ctx.config.installationId, environment: ctx.config.environment, projectRef: ctx.config.expectedProjectRef, configHash: ctx.config.configHash, codeRevision: process.env.GITHUB_SHA ?? "local", state: "PENDIENTE", inputs: inputs.fingerprints, clients: {}, staff: {}, probes: {}, createdAt: new Date().toISOString() }; }
export function createContext({ config, env = process.env, stateDir, db, auth, log } = {}) {
  const base = createFase1Context({ config, env, stateDir, db: db ?? createFase2DbAdapter({ env }), auth, log });
  return { ...base, journalFile: stateDir ? journalPathFor(stateDir, config.installationId) : null, input: null };
}
function authFor(ctx) { if (ctx.auth) return ctx.auth; const { SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_ANON_KEY: anonKey } = ctx.env; if (!serviceKey || !anonKey) throw new Fase1Error("CONFIG", "faltan SUPABASE_SERVICE_ROLE_KEY y SUPABASE_ANON_KEY"); ctx.auth = createAuthAdapter({ url: ctx.config.supabaseUrl, serviceKey, anonKey }); return ctx.auth; }
// La confirmación debe nombrar el proyecto destino (como F1): un valor sobrante de otro ambiente no autoriza escrituras.
export function requireWindow(ctx) { if (ctx.env.ETL_F2_WINDOW_CONFIRMED !== ctx.config.expectedProjectRef) throw new Fase1Error("CONFIG", `falta ETL_F2_WINDOW_CONFIRMED=${ctx.config.expectedProjectRef} (ventana exclusiva)`); }
function ensureJournal(ctx) { const existing = readJournal(ctx.journalFile, { states: STATES }); if (existing && (existing.installationId !== ctx.config.installationId || existing.projectRef !== ctx.config.expectedProjectRef)) throw new Fase1Error("BLOQUEADO", "journal de otra instalación o proyecto");
  // Misma instalación con otra configuración: con clientes o fichas ya cargados, reanudar mezclaría resultados que esa configuración
  // no produjo. Sin progreso el journal adopta la configuración vigente. Un journal anterior a este campo no lo trae y se acepta.
  if (existing && existing.configHash !== undefined && existing.configHash !== ctx.config.configHash) {
    if (Object.keys(existing.clients ?? {}).length > 0 || Object.keys(existing.staff ?? {}).length > 0) throw new Fase1Error("BLOQUEADO", "el journal F2 se creó con otra configuración (configHash): use un installationId nuevo");
    existing.configHash = ctx.config.configHash;
  }
  return existing; }

export async function cmdValidate(ctx) {
  const input = loadInputs(ctx.config.inputs, { expected: ctx.config.expectations, enforceExpected: true });
  const existing = ctx.stateDir ? ensureJournal(ctx) : null;
  if (existing && stable(existing.inputs) !== stable(input.fingerprints)) throw new Fase1Error("BLOQUEADO", "cambió la huella de los CSV desde la ejecución anterior");
  ctx.input = input; if (ctx.stateDir) { ctx.journal = existing ?? journalFor(ctx, input); checkpoint(ctx, { state: "VALIDADO", inputs: input.fingerprints }); }
  return { ok: true, input };
}

function catalogMaps(catalogs) {
  return { industry: new Map((catalogs.industries ?? []).map((x) => [x.industry_name, x.industry_id])), society: new Map((catalogs.societies ?? []).map((x) => [x.name, x.society_id])), category: new Map((catalogs.categories ?? []).map((x) => [`${x.practica_abbreviation}|${x.category_name}`, x])) };
}
export async function runPreflight(ctx) {
  const problems = connectionGuardProblems(ctx.config, ctx.env); if (problems.length) throw new Fase1Error("BLOQUEADO", problems.join("; "));
  requireWindow(ctx); const input = ctx.input ?? (await cmdValidate(ctx)).input; const state = await ctx.db.readTargetState(); const catalogs = await ctx.db.readCatalogs();
  const bootstrap = state.bootstrap ?? []; if (bootstrap.length < 1 || !bootstrap.some((x) => normalizeEmail(x.email) === ctx.config.bootstrapAdminEmail && x.role === "admin" && x.role_key === "admin")) throw new Fase1Error("BLOQUEADO", "bootstrap admin/admin de fase 1 ausente");
  const maps = catalogMaps(catalogs); for (const client of input.clients) if (client.industry_ref) { try { resolveIndustryRef(client.industry_ref, catalogs.industries ?? []); } catch (error) { throw new Fase1Error("BLOQUEADO", error.message); } } for (const row of input.staff) { const category = maps.category.get(`${row.practica_abbreviation}|${row.category_name}`); if (!maps.society.has(row.society_name) || !category || !category.default_role_key) throw new Fase1Error("BLOQUEADO", `catálogo no resuelto para ${row.staff_source_ref}`); const user = input.users.find((x) => x.staff_source_ref === row.staff_source_ref); try { validateRoleAssignment(row, user, category.default_role_key); } catch (error) { throw new Fase1Error("BLOQUEADO", error.message); } }
  if (ctx.stateDir) { ctx.journal = ctx.journal ?? ensureJournal(ctx) ?? journalFor(ctx, input); checkpoint(ctx, { state: "PREFLIGHT_VALIDADO" }); }
  return { ok: true, input, state, catalogs, maps };
}
function securePassword() { return randomBytes(32).toString("base64url"); }
function sourceInactive(staff) { return staff.is_active === "false"; }
function findContact(input, ref) { return input.contacts.find((row) => row.client_source_ref === ref) ?? null; }
export function reservedClientMatches(persisted, client, contact, parentClientId, industryId) {
  if (!persisted || persisted.client_legal_name !== client.client_legal_name || persisted.tax_id !== client.tax_id || persisted.parent_client_id !== parentClientId || persisted.industry_id !== industryId || Boolean(persisted.is_active) !== true) return false;
  if (!contact) return persisted.contacts?.length === 0;
  return persisted.contacts?.length === 1 && persisted.contacts[0].full_name === contact.full_name && persisted.contacts[0].email === contact.email && persisted.contacts[0].phone === contact.phone;
}

export async function load(ctx) {
  const release = acquireLock(ctx.stateDir, ctx.config.installationId, { prefix: "fase2" });
  try {
    const pre = await runPreflight(ctx); const { input, maps } = pre; const journal = ctx.journal;
    const clientIds = new Map(Object.entries(journal.clients).map(([ref, item]) => [ref, item.clientId]));
    for (const client of input.clients) {
      const existingEntry = journal.clients[client.source_ref];
      if (existingEntry?.state === "confirmado") continue;
      const clientId = clientIds.get(client.source_ref) ?? randomUUID(); const parentClientId = client.parent_ref ? clientIds.get(client.parent_ref) : null;
      if (client.parent_ref && !parentClientId) throw new Fase1Error("BLOQUEADO", `cliente padre sin confirmar ${client.parent_ref}`);
      let industryId = null; if (client.industry_ref) { try { industryId = resolveIndustryRef(client.industry_ref, pre.catalogs.industries ?? []).industry_id; } catch (error) { throw new Fase1Error("BLOQUEADO", error.message); } }
      const contact = findContact(input, client.source_ref);
      if (existingEntry?.state === "reservado") {
        const persisted = await ctx.db.readClientUnit(clientId);
        if (persisted) {
          if (!reservedClientMatches(persisted, client, contact, parentClientId, industryId)) throw new Fase1Error("BLOQUEADO", `cliente reservado no coincide con el destino: ${client.source_ref}`);
          clientIds.set(client.source_ref, clientId); checkpoint(ctx, { clients: { ...ctx.journal.clients, [client.source_ref]: { ...existingEntry, state: "confirmado" } } }); continue;
        }
      }
      checkpoint(ctx, { clients: { ...ctx.journal.clients, [client.source_ref]: { clientId, state: "reservado", sourceHash: rowSourceHash(client) } } });
      await ctx.db.insertClientUnit({ client, contact, clientId, parentClientId, industryId });
      clientIds.set(client.source_ref, clientId); checkpoint(ctx, { clients: { ...ctx.journal.clients, [client.source_ref]: { ...ctx.journal.clients[client.source_ref], state: "confirmado" } } });
    }
    checkpoint(ctx, { state: "CLIENTES_CONFIRMADOS" });
    const bootstrap = pre.state.bootstrap.find((x) => normalizeEmail(x.email) === ctx.config.bootstrapAdminEmail); let authUsers;
    for (const staff of input.staff) {
      const user = input.users.find((x) => x.staff_source_ref === staff.staff_source_ref); const category = maps.category.get(`${staff.practica_abbreviation}|${staff.category_name}`); const staffId = ctx.journal.staff[staff.staff_source_ref]?.staffId ?? randomUUID();
      if (ctx.journal.staff[staff.staff_source_ref]?.state === "enlace_rol_confirmado") continue;
      if (!ctx.journal.staff[staff.staff_source_ref]?.state) checkpoint(ctx, { staff: { ...ctx.journal.staff, [staff.staff_source_ref]: { staffId, state: "reservado", sourceHash: rowSourceHash(staff), sourceInactive: sourceInactive(staff), expectedRoleKey: user.expected_role_key } } });
      if (ctx.journal.staff[staff.staff_source_ref].state === "reservado") { await ctx.db.insertStaff({ staff, staffId, societyId: maps.society.get(staff.society_name), practicaId: category.practica_id, categoryId: category.category_id }); checkpoint(ctx, { staff: { ...ctx.journal.staff, [staff.staff_source_ref]: { ...ctx.journal.staff[staff.staff_source_ref], state: "staff_confirmado" } } }); }
      let entry = ctx.journal.staff[staff.staff_source_ref]; let authUserId = entry.authUserId;
      if (!authUserId) {
        const auth = authFor(ctx); authUsers ??= await auth.listAllUsers(); const email = normalizeEmail(user.email); const mine = authUsers.filter((x) => normalizeEmail(x.email) === email);
        const correlation = entry.correlation ?? randomUUID(); const adopted = mine.find((x) => x.app_metadata?.etl_f2?.installation_id === ctx.config.installationId && x.app_metadata?.etl_f2?.correlation === correlation);
        if (mine.length && !adopted) throw new Fase1Error("BLOQUEADO", `correo Auth existente sin correlación para ${staff.staff_source_ref}`);
        if (adopted) authUserId = adopted.id;
        else { checkpoint(ctx, { staff: { ...ctx.journal.staff, [staff.staff_source_ref]: { ...entry, correlation, state: "auth_intentado" } } }); const created = await auth.createUser({ email, password: securePassword(), email_confirm: true, app_metadata: { etl_f2: { installation_id: ctx.config.installationId, staff_ref_hash: sha256(staff.staff_source_ref), correlation } } }); if (!created.ok) throw new Fase1Error(created.uncertain ? "RECONCILIACION" : "BLOQUEADO", `alta Auth fallida: ${created.message}`); authUserId = created.user.id; authUsers.push(created.user); }
        checkpoint(ctx, { staff: { ...ctx.journal.staff, [staff.staff_source_ref]: { ...ctx.journal.staff[staff.staff_source_ref], authUserId, state: "auth_confirmado" } } });
      }
      const persisted = await ctx.db.linkAndRole({ staffId, authUserId, expectedRoleKey: user.expected_role_key, expectedLegacyRole: user.expected_legacy_role, bootstrapUserId: bootstrap.auth_user_id, installationId: ctx.config.installationId });
      if (persisted.auth_user_id !== authUserId || persisted.role_key !== user.expected_role_key || persisted.role !== user.expected_legacy_role) throw new Fase1Error("BLOQUEADO", `enlace/rol no persistido para ${staff.staff_source_ref}`);
      checkpoint(ctx, { staff: { ...ctx.journal.staff, [staff.staff_source_ref]: { ...ctx.journal.staff[staff.staff_source_ref], authUserId, state: "enlace_rol_confirmado" } } });
    }
    checkpoint(ctx, { state: "ENLACE_Y_ROL_CONFIRMADOS" }); return verify(ctx);
  } finally { release(); }
}
export async function verify(ctx) {
  const journal = ctx.journal ?? ensureJournal(ctx); if (!journal) throw new Fase1Error("BLOQUEADO", "verify requiere el journal de fase 2"); ctx.journal = journal; const phase3 = await ctx.db.countPhase3Tables(); if (Object.values(phase3).some((value) => Number(value) !== 0)) throw new Fase1Error("BLOQUEADO", "CA14: hay datos de fase 3");
  const states = Object.values(journal.staff); if (states.length !== ctx.config.expectations.staff || states.some((entry) => entry.state !== "enlace_rol_confirmado")) throw new Fase1Error("BLOQUEADO", `journal no confirma las ${ctx.config.expectations.staff} fichas/cuentas/roles`);
  const persisted = await ctx.db.readStaffByIds(states.map((entry) => entry.staffId)); if (persisted.length !== states.length || persisted.some((row) => !row.auth_user_id || !row.role_key || !row.role)) throw new Fase1Error("BLOQUEADO", "el destino no confirma fichas/cuentas/roles del journal");
  if (Object.values(journal.probes ?? {}).some((probe) => probe.state !== "cerrada")) throw new Fase1Error("BLOQUEADO", "hay una sonda de acceso abierta o con acceso fallido");
  checkpoint(ctx, { state: "VERIFICADO" }); return { ok: true, staffActivityState: "PENDIENTE_CAMBIO_MANUAL", phase3 };
}
export function report(ctx) { const journal = ctx.journal ?? ensureJournal(ctx); if (!journal) throw new Fase1Error("BLOQUEADO", "report requiere journal"); const date = new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz" }).format(new Date()); const report = { fecha: date, installationId: journal.installationId, projectRef: journal.projectRef, R1: journal.inputs, R2: { state: journal.state }, R3: { clients: Object.keys(journal.clients).length, staff: Object.keys(journal.staff).length }, R4: "sin PII ni secretos", R5: "PENDIENTE_CAMBIO_MANUAL" }; const file = path.join(ctx.stateDir, `fase2-${ctx.config.installationId}.report.json`); writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); return { ok: true, file }; }
export async function probeAccess(ctx, staffRef, { manual = false } = {}) {
  const journal = ctx.journal ?? ensureJournal(ctx); ctx.journal = journal; const entry = journal?.staff?.[staffRef];
  if (!entry || entry.state !== "enlace_rol_confirmado" || entry.sourceInactive) throw new Fase1Error("BLOQUEADO", "la sonda solo admite fichas activas con enlace y rol confirmados");
  checkpoint(ctx, { probes: { ...ctx.journal.probes, [staffRef]: { state: "rotacion_pendiente", at: new Date().toISOString() } } });
  const password = manual ? ctx.env.ETL_F2_PROBE_PASSWORD : securePassword(); if (manual && !password) throw new Fase1Error("CONFIG", "--manual requiere ETL_F2_PROBE_PASSWORD");
  const updated = await authFor(ctx).updateUserById(entry.authUserId, { password }); if (!updated.ok) throw new Fase1Error(updated.uncertain ? "RECONCILIACION" : "BLOQUEADO", "no se pudo fijar la contraseña de sondeo");
  if (manual) return { ok: true, state: "rotacion_pendiente" };
  // Plan §4.5: antes de rotar se prueba el acceso real: login con la clave temporal y get_my_staff_id() = ficha propia.
  const auth = authFor(ctx); let failure = null;
  const login = await auth.login(updated.user?.email, password);
  if (!login.ok) failure = `el login de sondeo falló (HTTP ${login.status ?? "?"})`;
  else if (login.userId !== entry.authUserId) failure = "el login de sondeo devolvió una cuenta distinta de la registrada";
  else { const staffId = await auth.myStaffId(login.accessToken); if (staffId !== entry.staffId) failure = `get_my_staff_id() devolvió '${staffId ?? "null"}' en vez de la ficha propia`; }
  // La clave temporal se rota siempre (no queda ninguna cuenta con una clave conocida); si el acceso falló la sonda queda abierta.
  const rotated = await auth.updateUserById(entry.authUserId, { password: securePassword() }); if (!rotated.ok) throw new Fase1Error("RECONCILIACION", "no se pudo rotar la contraseña de sondeo");
  if (failure) { checkpoint(ctx, { probes: { ...ctx.journal.probes, [staffRef]: { state: "acceso_fallido", at: new Date().toISOString() } } }); throw new Fase1Error("LOGIN", failure); }
  checkpoint(ctx, { probes: { ...ctx.journal.probes, [staffRef]: { state: "cerrada", at: new Date().toISOString() } } }); return { ok: true, state: "cerrada" };
}
export async function probeClose(ctx, staffRef) { ctx.journal = ctx.journal ?? ensureJournal(ctx); const entry = ctx.journal?.staff?.[staffRef]; if (!entry) throw new Fase1Error("BLOQUEADO", "ficha de sonda desconocida"); const result = await authFor(ctx).updateUserById(entry.authUserId, { password: securePassword() }); if (!result.ok) throw new Fase1Error("RECONCILIACION", "no se pudo cerrar la sonda"); checkpoint(ctx, { probes: { ...ctx.journal.probes, [staffRef]: { state: "cerrada", at: new Date().toISOString() } } }); return { ok: true, state: "cerrada" }; }
function parseArgs(argv) { const [command, ...rest] = argv; const flags = {}; for (let i = 0; i < rest.length; i += 1) { const value = rest[i]; if (value === "--config") flags.config = rest[++i]; else if (value === "--staff-ref") flags.staffRef = rest[++i]; else if (value === "--manual") flags.manual = true; else bad(`argumento desconocido: ${value}`); } return { command, ...flags }; }
export async function main(argv = process.argv.slice(2), env = process.env) { const redact = makeRedactor(env, ["ETL_F2_PROBE_PASSWORD"]); try { const args = parseArgs(argv); if (!args.config || !["validate", "preflight", "load", "verify", "report", "probe-access", "probe-close"].includes(args.command)) bad("uso: fase2 <validate|preflight|load|verify|report|probe-access|probe-close> --config <archivo>"); const config = loadConfig(args.config); const stateDir = resolveStateDir(env); const ctx = createContext({ config, env, stateDir, log: (line) => console.log(redact(line)) }); if (args.command === "validate") await cmdValidate(ctx); else if (args.command === "preflight") await runPreflight(ctx); else if (args.command === "load") await load(ctx); else if (args.command === "verify") await verify(ctx); else if (args.command === "report") report(ctx); else if (!args.staffRef) bad("probe requiere --staff-ref"); else if (args.command === "probe-access") await probeAccess(ctx, args.staffRef, { manual: Boolean(args.manual) }); else await probeClose(ctx, args.staffRef); return EXIT.ok; } catch (error) { console.error(`ERROR${error?.code ? ` [${error.code}]` : ""}: ${redact(error?.message ?? error)}`); return EXIT[error?.code] ?? EXIT.error; } }
if (process.argv[1] && sameFile(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) process.exitCode = await main();
