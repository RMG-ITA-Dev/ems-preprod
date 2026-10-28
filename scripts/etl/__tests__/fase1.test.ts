// Pruebas unitarias de la consola ETL fase 1 (plan_v2.md §9, T01 y los casos de T06 que aplican
// a administrador + calendario). Adaptadores simulados: no tocan red, psql ni Supabase.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Fase1Error,
  STATES,
  acquireLock,
  createAuthAdapter,
  createContext,
  initialize,
  journalPathFor,
  loadConfig,
  parseConfig,
  preflight,
  readJournal,
  resolveStateDir,
  verify,
  writeJournal,
} from "../fase1.mjs";
import {
  EXPECTED_CALENDAR,
  EXPECTED_CALENDAR_MD5,
  classifySqlFailure,
  connectionGuardProblems,
  loadMigrationInventory,
  makeRedactor,
  runPsql,
} from "../fase1-db.mjs";

const PASSWORD = "Temp-Passw0rd-ensayo!";
const SERVICE_KEY = "service-role-key-super-secreta";
const ANON_KEY = "anon-key-publicable-123";
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const EXAMPLE_CONFIG = path.resolve(HERE, "..", "fase1.config.example.json");

/** Fila del calendario esperado (índice 0..27), con el mismo contenido que public.seed_initial_holidays. */
const calendarRow = (i: number, createdBy: string) => {
  const [holiday_date, oficina, ...name] = EXPECTED_CALENDAR[i].split("|");
  return { holiday_date, oficina: Number(oficina), holiday_name: name.join("|"), created_by: createdBy };
};
const calendarKey = (h: any) => `${h.holiday_date}|${h.oficina}|${h.holiday_name}`;

const baseConfig = () => JSON.parse(fs.readFileSync(EXAMPLE_CONFIG, "utf8"));
const INVENTORY = {
  count: 2,
  inventoryHash: "hash-inventario-1",
  files: [
    { name: "20251204000001_cero_01.sql", version: "20251204000001", sha256: "a".repeat(64) },
    { name: "20251204000002_cero_02.sql", version: "20251204000002", sha256: "b".repeat(64) },
  ],
};

// ---------------------------------------------------------------------------------------------
// Mundo simulado: Postgres + Auth con los triggers relevantes (enlace por correo, primer rol = admin).

function makeWorld() {
  return { staff: null as any, authUsers: [] as any[], roles: [] as any[], holidays: [] as any[], clients: 0, writes: 0, holidayConflict: false };
}

function makeHooks() {
  return { crashAfter: null as string | null, lostResponse: false, loginFails: false, createCalls: 0, seedCalls: 0 };
}

function makeDb(world: any, hooks: any) {
  const afterEffect = (name: string) => {
    if (hooks.crashAfter === name) {
      hooks.crashAfter = null;
      throw new Error(`crash:${name}`);
    }
  };
  return {
    async ping() {
      return { current_user: "postgres", database: "postgres", server_version_num: 170000 };
    },
    async checkHolidayFunction() {
      return { exists: true, owner_usable: true, can_execute: true, returns: "integer" };
    },
    async ledgerVersions() {
      return null;
    },
    async preconditions() {
      return { auth_users: world.authUsers.length, staff: world.staff ? 1 : 0, user_roles: world.roles.length, clients: world.clients, engagements: 0, work_orders: 0, holidays: world.holidays.length };
    },
    async catalogCheck() {
      return { society: 1, practice: 1, category: 1 };
    },
    async readStaff(id: string) {
      return world.staff && world.staff.staff_id === id ? { ...world.staff } : null;
    },
    async insertStaff(spec: any) {
      if (world.staff && world.staff.staff_id === spec.staffId) return;
      if (world.staff || world.authUsers.length || world.roles.length) throw new Fase1Error("BLOQUEADO", "ETL_F1_FOREIGN: existen cuentas, fichas o roles ajenos");
      world.staff = {
        staff_id: spec.staffId,
        auth_user_id: null,
        email: spec.email,
        first_name: spec.firstName,
        last_name: spec.lastName,
        short_name: spec.shortName,
        id_number: spec.idNumber,
        hire_date: spec.hireDate,
        city: spec.city,
        is_active: true,
        is_schedulable: false,
        deleted: false,
        weekly_capacity_hours: String(spec.weeklyCapacityHours),
        target_utilization_percent: String(spec.targetUtilizationPercent),
        society_name: spec.societyName,
        practice_code: spec.practiceCode,
        category_name: spec.categoryName,
      };
      world.writes += 1;
      afterEffect("insertStaff");
    },
    async readLinkState() {
      return {
        staff_auth_user_id: world.staff?.auth_user_id ?? null,
        staff_count: world.staff ? 1 : 0,
        auth_users: world.authUsers.map((u: any) => ({ id: u.id, email: String(u.email).toLowerCase() })),
        roles: world.roles.map((r: any) => ({ ...r })),
      };
    },
    async seedHolidays() {
      hooks.seedCalls += 1;
      if (world.holidayConflict) throw new Fase1Error("BLOQUEADO", "feriado contradictorio: no se sobrescribe");
      if (world.holidays.length === 0) {
        for (let i = 0; i < 28; i += 1) world.holidays.push(calendarRow(i, world.staff.staff_id));
        world.writes += 1;
      }
      afterEffect("seedHolidays");
      return 28;
    },
    async holidaysSummary(staffId: string) {
      const expected = new Set(EXPECTED_CALENDAR);
      return {
        total: world.holidays.length,
        by_admin: world.holidays.filter((h: any) => h.created_by === staffId).length,
        matching: world.holidays.filter((h: any) => expected.has(calendarKey(h))).length,
        fingerprint: JSON.stringify(world.holidays),
      };
    },
    async snapshot() {
      return {
        staff_md5: JSON.stringify(world.staff),
        roles_md5: JSON.stringify(world.roles),
        holidays_md5: JSON.stringify(world.holidays),
        auth_users: world.authUsers.length,
        clients: world.clients,
        engagements: 0,
        work_orders: 0,
        notifications: 0,
        notification_emails: 0,
      };
    },
    async countsForVerify() {
      return { staff: world.staff ? 1 : 0, auth_users: world.authUsers.length, user_roles: world.roles.length, clients: world.clients, engagements: 0, work_orders: 0, notifications: 0, notification_emails: 0, notification_emails_pending: 0 };
    },
    async findStaffByEmail(email: string) {
      return world.staff && world.staff.email === email ? [world.staff.staff_id] : [];
    },
  };
}

function makeAuth(world: any, hooks: any) {
  return {
    async listAllUsers() {
      return world.authUsers.map((u: any) => ({ ...u }));
    },
    async createUser(attrs: any) {
      hooks.createCalls += 1;
      const user = { id: randomUUID(), email: attrs.email, user_metadata: attrs.user_metadata };
      world.authUsers.push(user);
      world.writes += 1;
      // Triggers de Auth: enlace por correo y primer usuario = admin.
      if (world.staff && !world.staff.auth_user_id && world.staff.email === attrs.email) world.staff.auth_user_id = user.id;
      const first = world.roles.length === 0;
      world.roles.push({ user_id: user.id, role: first ? "admin" : "staff", role_key: first ? "admin" : "assistant" });
      if (hooks.lostResponse) {
        hooks.lostResponse = false;
        return { ok: false, uncertain: true, message: "timeout" };
      }
      if (hooks.crashAfter === "createUser") {
        hooks.crashAfter = null;
        throw new Error("crash:createUser");
      }
      return { ok: true, user };
    },
    async login(email: string) {
      const user = world.authUsers.find((u: any) => u.email === email);
      if (hooks.loginFails || !user) return { ok: false, status: 400 };
      return { ok: true, accessToken: "token", userId: user.id };
    },
    async myStaffId() {
      return world.staff?.auth_user_id ? world.staff.staff_id : null;
    },
  };
}

let tmpDirs: string[] = [];
function setup(configOverride: any = null) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-f1-"));
  tmpDirs.push(stateDir);
  const world = makeWorld();
  const hooks = makeHooks();
  const logs: string[] = [];
  const env: Record<string, string> = {
    PGHOST: "127.0.0.1",
    PGUSER: "postgres",
    PGPASSWORD: "postgres-pass-123",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    SUPABASE_ANON_KEY: ANON_KEY,
    ADMIN_TEMP_PASSWORD: PASSWORD,
    ETL_F1_SIGNUP_CLOSED: "1",
    ETL_F1_STATE_DIR: stateDir,
  };
  const config = parseConfig(configOverride ?? baseConfig());
  const mk = (over: any = {}) =>
    createContext({ config, env, stateDir, db: makeDb(world, hooks), auth: makeAuth(world, hooks), log: (l: string) => logs.push(l), migrations: INVENTORY, ...over });
  return { stateDir, world, hooks, logs, env, config, mk };
}

beforeEach(() => {
  tmpDirs = [];
});
afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------

describe("configuración y guarda de conexión", () => {
  it("acepta el ejemplo ficticio versionado y lo normaliza", () => {
    const config = loadConfig(EXAMPLE_CONFIG);
    expect(config.environment).toBe("local");
    expect(config.admin.email).toBe("admin@ruizmier.com");
    expect(config.admin.categoryName).toBe("Socio");
    expect(config.configHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rechaza claves que parecen credenciales, claves desconocidas y valores inválidos", () => {
    expect(() => parseConfig({ ...baseConfig(), serviceRoleKey: "x" })).toThrow(/credencial/);
    expect(() => parseConfig({ ...baseConfig(), admin: { ...baseConfig().admin, password: "x" } })).toThrow(/credencial/);
    expect(() => parseConfig({ ...baseConfig(), admin: { ...baseConfig().admin, personRef: "x" } })).toThrow(/personRef/);
    expect(() => parseConfig({ ...baseConfig(), admin: { ...baseConfig().admin, city: "Cochabamba" } })).toThrow(/city/);
    expect(() => parseConfig({ ...baseConfig(), environment: "staging" })).toThrow(/environment/);
  });

  it("local exige loopback; una configuración mezclada se rechaza", () => {
    const local = parseConfig(baseConfig());
    expect(connectionGuardProblems(local, { PGHOST: "127.0.0.1" })).toEqual([]);
    expect(connectionGuardProblems(local, { PGHOST: "aws-0-us-west-2.pooler.supabase.com" }).join(" ")).toMatch(/loopback/);
    const mixed = parseConfig({ ...baseConfig(), supabaseUrl: "https://slkqdcwwvmjtcbakajib.supabase.co" });
    expect(connectionGuardProblems(mixed, { PGHOST: "127.0.0.1" }).join(" ")).toMatch(/supabaseUrl/);
  });

  it("test/production exigen pooler, usuario postgres.<ref> y el ref de su ambiente", () => {
    const test = parseConfig({ ...baseConfig(), environment: "test", expectedProjectRef: "slkqdcwwvmjtcbakajib", supabaseUrl: "https://slkqdcwwvmjtcbakajib.supabase.co" });
    const okEnv = { PGHOST: "aws-0-us-west-2.pooler.supabase.com", PGUSER: "postgres.slkqdcwwvmjtcbakajib" };
    expect(connectionGuardProblems(test, okEnv)).toEqual([]);
    expect(connectionGuardProblems(test, { ...okEnv, PGUSER: "postgres.xcdcxtduotwgwmhxvsiz" }).join(" ")).toMatch(/PGUSER/);
    expect(connectionGuardProblems(test, { ...okEnv, PGHOST: "db.slkqdcwwvmjtcbakajib.supabase.co" }).join(" ")).toMatch(/pooler/);
    const crossed = parseConfig({ ...baseConfig(), environment: "test", expectedProjectRef: "xcdcxtduotwgwmhxvsiz", supabaseUrl: "https://xcdcxtduotwgwmhxvsiz.supabase.co" });
    expect(connectionGuardProblems(crossed, { PGHOST: okEnv.PGHOST, PGUSER: "postgres.xcdcxtduotwgwmhxvsiz" }).join(" ")).toMatch(/otro ambiente|esperaba el ref/);
    const lovable = parseConfig({ ...baseConfig(), environment: "production", expectedProjectRef: "ugqxfnrxvksiltwxzist", supabaseUrl: "https://ugqxfnrxvksiltwxzist.supabase.co" });
    expect(connectionGuardProblems(lovable, { PGHOST: okEnv.PGHOST, PGUSER: "postgres.ugqxfnrxvksiltwxzist" }).join(" ")).toMatch(/Lovable/);
  });

  it("el directorio de estado debe ser absoluto y estar fuera del repositorio", () => {
    expect(() => resolveStateDir({ ETL_F1_STATE_DIR: "relativo/estado" })).toThrow(/absoluta/);
    expect(() => resolveStateDir({ ETL_F1_STATE_DIR: path.resolve(HERE, "..", "estado") })).toThrow(/dentro del repositorio/);
    expect(() => resolveStateDir({})).toThrow(/ETL_F1_STATE_DIR/);
    expect(resolveStateDir({ ETL_F1_STATE_DIR: os.tmpdir() })).toBe(path.resolve(os.tmpdir()));
  });

  it("initialize exige la declaración de registro cerrado y, en remoto, la ventana confirmada", async () => {
    const t = setup();
    delete (t.env as any).ETL_F1_SIGNUP_CLOSED;
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "CONFIG" });
    expect(t.world.staff).toBeNull();
    expect(t.world.writes).toBe(0);
  });
});

describe("inventario y journal", () => {
  it("el inventario real del repositorio se calcula de forma determinista", () => {
    const a = loadMigrationInventory();
    const b = loadMigrationInventory();
    expect(a.inventoryHash).toBe(b.inventoryHash);
    expect(a.files).toHaveLength(a.count);
    expect(a.files.every((f: any) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
    expect(a.files.map((f: any) => f.name)).toEqual([...a.files.map((f: any) => f.name)].sort());
  });

  it("registra versión, inventario de migraciones y hashes en el journal", async () => {
    const t = setup();
    await initialize(t.mk());
    const journal = readJournal(journalPathFor(t.stateDir, t.config.installationId));
    expect(journal.migrations.inventoryHash).toBe(INVENTORY.inventoryHash);
    expect(journal.migrations.files).toHaveLength(2);
    expect(journal.configHash).toBe(t.config.configHash);
  });

  it("un journal truncado, con checksum alterado o de otra instalación bloquea la reanudación", async () => {
    const t = setup();
    await initialize(t.mk());
    const file = journalPathFor(t.stateDir, t.config.installationId);
    const original = fs.readFileSync(file, "utf8");

    fs.writeFileSync(file, original.slice(0, 40));
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "BLOQUEADO" });

    expect(original).toContain('"state": "VERIFICADO"');
    fs.writeFileSync(file, original.replace('"state": "VERIFICADO"', '"state": "PENDIENTE"'));
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "BLOQUEADO" });

    // Journal íntegro pero de otra instalación (mismo archivo, otro installationId).
    const other = JSON.parse(original);
    other.installationId = "f1-otra-instalacion-9";
    delete other.checksum;
    fs.writeFileSync(file, JSON.stringify(writeJournalInMemory(other)));
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "BLOQUEADO" });
    expect(t.world.writes).toBe(3); // ficha + Auth + calendario de la primera pasada; nada más
  });

  it("un conflicto de hash de configuración o de inventario de migraciones bloquea", async () => {
    const t = setup();
    await initialize(t.mk());
    const changed = parseConfig({ ...baseConfig(), admin: { ...baseConfig().admin, firstName: "Otro" } });
    await expect(initialize(t.mk({ config: changed }))).rejects.toMatchObject({ code: "BLOQUEADO", message: expect.stringMatching(/configuración/) });
    await expect(initialize(t.mk({ migrations: { ...INVENTORY, inventoryHash: "otro" } }))).rejects.toMatchObject({ code: "BLOQUEADO", message: expect.stringMatching(/inventario/) });
  });

  it("ni el journal ni los registros contienen contraseñas ni claves", async () => {
    const t = setup();
    await initialize(t.mk());
    const text = fs.readFileSync(journalPathFor(t.stateDir, t.config.installationId), "utf8");
    for (const secret of [PASSWORD, SERVICE_KEY, ANON_KEY, "postgres-pass-123"]) {
      expect(text).not.toContain(secret);
      expect(t.logs.join("\n")).not.toContain(secret);
    }
  });

  it("el checkpoint se escribe por archivo temporal y reemplazo (sin temporales residuales)", async () => {
    const t = setup();
    await initialize(t.mk());
    expect(fs.readdirSync(t.stateDir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });
});

// Reproduce el formato de writeJournal sobre un objeto en memoria (checksum incluido).
function writeJournalInMemory(journal: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-f1-mem-"));
  tmpDirs.push(dir);
  const file = path.join(dir, "j.json");
  writeJournal(file, journal);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

describe("inicialización feliz y repetición", () => {
  it("recorre los estados hasta VERIFICADO con una ficha, una cuenta, un rol admin/admin y 28 feriados", async () => {
    const t = setup();
    const result = await initialize(t.mk());
    expect(result.state).toBe("VERIFICADO");
    expect(STATES.indexOf(result.state)).toBe(STATES.length - 1);
    expect(t.world.staff.is_schedulable).toBe(false);
    expect(t.world.staff.weekly_capacity_hours).toBe("40");
    expect(t.world.staff.target_utilization_percent).toBe("85");
    expect(t.world.staff.auth_user_id).toBe(result.authUserId);
    expect(t.world.roles).toEqual([{ user_id: result.authUserId, role: "admin", role_key: "admin" }]);
    expect(t.world.holidays).toHaveLength(28);
    expect(t.logs.join("\n")).toContain("ETL F1 INITIALIZE: VERIFICADO");
  });

  it("la segunda inicialización conserva las mismas identidades y no escribe datos de negocio", async () => {
    const t = setup();
    const first = await initialize(t.mk());
    const writes = t.world.writes;
    const second = await initialize(t.mk());
    expect(second.staffId).toBe(first.staffId);
    expect(second.authUserId).toBe(first.authUserId);
    expect(second.repetition).toBe(true);
    expect(t.world.writes).toBe(writes);
    expect(t.hooks.createCalls).toBe(1);
    expect(t.world.authUsers).toHaveLength(1);
  });

  it("preflight informa el estado limpio y falla ante datos ajenos sin journal propio", async () => {
    const t = setup();
    expect((await preflight(t.mk())).ok).toBe(true);
    t.world.clients = 3;
    expect((await preflight(t.mk())).ok).toBe(false);
  });
});

describe("casos de ambigüedad: ninguno genera una identidad nueva", () => {
  it("cuenta ajena previa: no se crea nada y el journal no se bloquea", async () => {
    const t = setup();
    t.world.authUsers.push({ id: randomUUID(), email: "otra@ruizmier.com", user_metadata: {} });
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "BLOQUEADO" });
    expect(t.world.staff).toBeNull();
    expect(t.world.writes).toBe(0);
    expect(t.hooks.createCalls).toBe(0);
  });

  it("una cuenta con el mismo correo y sin nuestra correlación NO se adopta", async () => {
    const t = setup();
    t.hooks.crashAfter = "insertStaff";
    await expect(initialize(t.mk())).rejects.toThrow("crash:insertStaff");
    t.world.authUsers.push({ id: randomUUID(), email: "admin@ruizmier.com", user_metadata: {} });
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "BLOQUEADO", message: expect.stringMatching(/no se adopta/) });
    expect(t.hooks.createCalls).toBe(0);
    expect(t.world.authUsers).toHaveLength(1);
    const journal = readJournal(journalPathFor(t.stateDir, t.config.installationId));
    expect(journal.flag).toBe("BLOQUEADO");
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "BLOQUEADO", message: expect.stringMatching(/journal bloqueado/) });
  });

  it("respuesta de Auth perdida: RECONCILIACION_REQUERIDA y recuperación por correlación sin duplicar", async () => {
    const t = setup();
    t.hooks.lostResponse = true;
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "RECONCILIACION" });
    expect(readJournal(journalPathFor(t.stateDir, t.config.installationId)).flag).toBe("RECONCILIACION_REQUERIDA");
    const result = await initialize(t.mk());
    expect(result.state).toBe("VERIFICADO");
    expect(t.hooks.createCalls).toBe(1);
    expect(t.world.authUsers).toHaveLength(1);
    const journal = readJournal(journalPathFor(t.stateDir, t.config.installationId));
    expect(journal.flag).toBeNull();
    expect(journal.events.map((e: any) => e.event)).toContain("auth_recuperada");
  });

  it("commit SQL sin checkpoint: se recupera la ficha por UUID y contenido sin reinsertar", async () => {
    const t = setup();
    t.hooks.crashAfter = "insertStaff";
    await expect(initialize(t.mk())).rejects.toThrow("crash:insertStaff");
    const staffId = t.world.staff.staff_id;
    const result = await initialize(t.mk());
    expect(result.staffId).toBe(staffId);
    expect(t.world.staff.staff_id).toBe(staffId);
    const journal = readJournal(journalPathFor(t.stateDir, t.config.installationId));
    expect(journal.events.map((e: any) => e.event)).toContain("staff_recuperada");
  });

  it("conflicto de hash: una ficha propia con contenido distinto bloquea", async () => {
    const t = setup();
    t.hooks.crashAfter = "insertStaff";
    await expect(initialize(t.mk())).rejects.toThrow("crash:insertStaff");
    t.world.staff.first_name = "Alterado";
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "BLOQUEADO", message: expect.stringMatching(/contenido distinto/) });
    expect(t.world.authUsers).toHaveLength(0);
  });

  it("segundo ejecutor en la misma máquina: el bloqueo de creación exclusiva lo rechaza", async () => {
    const t = setup();
    const release = acquireLock(t.stateDir, t.config.installationId);
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "BLOQUEADO", message: expect.stringMatching(/otra ejecución/) });
    expect(t.world.writes).toBe(0);
    release();
    await expect(initialize(t.mk())).resolves.toMatchObject({ state: "VERIFICADO" });
  });

  it("segundo ejecutor en otra máquina (otro journal): ve datos ajenos y no crea identidades", async () => {
    const t = setup();
    await initialize(t.mk());
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-f1-b-"));
    tmpDirs.push(otherDir);
    const writes = t.world.writes;
    await expect(initialize(t.mk({ stateDir: otherDir, journalFile: path.join(otherDir, "x.json") }))).rejects.toMatchObject({ code: "BLOQUEADO" });
    expect(t.world.writes).toBe(writes);
    expect(t.world.authUsers).toHaveLength(1);
  });

  it("enlace o rol inesperado: bloquea y conserva la evidencia sin promover ni reasignar", async () => {
    const t = setup();
    t.hooks.crashAfter = "createUser";
    await expect(initialize(t.mk())).rejects.toThrow("crash:createUser");
    t.world.roles.push({ user_id: randomUUID(), role: "staff", role_key: "assistant" }); // rol ajeno inesperado
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "BLOQUEADO", evidence: expect.any(Object) });
    expect(t.world.roles[0].role).toBe("admin");
    expect(readJournal(journalPathFor(t.stateDir, t.config.installationId)).evidence).toBeTruthy();
  });
});

describe("interrupciones (T06): administrador y calendario", () => {
  it("interrupción tras Auth creado: se recupera la misma cuenta", async () => {
    const t = setup();
    t.hooks.crashAfter = "createUser";
    await expect(initialize(t.mk())).rejects.toThrow("crash:createUser");
    const authId = t.world.authUsers[0].id;
    const result = await initialize(t.mk());
    expect(result.authUserId).toBe(authId);
    expect(t.hooks.createCalls).toBe(1);
  });

  it("calendario parcialmente materializado: se completa sin duplicar y sin modificar", async () => {
    const t = setup();
    t.hooks.crashAfter = "seedCalendar";
    // Simula la función propietaria que insertó parte del calendario antes de la interrupción.
    const db = makeDb(t.world, t.hooks);
    const original = db.seedHolidays;
    let calls = 0;
    db.seedHolidays = async () => {
      calls += 1;
      if (calls === 1) {
        for (let i = 0; i < 10; i += 1) t.world.holidays.push(calendarRow(i, t.world.staff.staff_id));
        throw new Error("crash:seedCalendar");
      }
      // Segunda llamada: inserta solo faltantes compatibles.
      for (let i = t.world.holidays.length; i < 28; i += 1) t.world.holidays.push(calendarRow(i, t.world.staff.staff_id));
      return 28;
    };
    void original;
    await expect(initialize(t.mk({ db }))).rejects.toThrow("crash:seedCalendar");
    expect(t.world.holidays).toHaveLength(10);
    await expect(initialize(t.mk({ db }))).resolves.toMatchObject({ state: "VERIFICADO" });
    expect(t.world.holidays).toHaveLength(28);
    expect(new Set(t.world.holidays.map((h: any) => h.holiday_date)).size).toBe(28);
  });

  it("feriado contradictorio: falla sin sobrescribir y bloquea", async () => {
    const t = setup();
    t.world.holidayConflict = true;
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "BLOQUEADO" });
    expect(t.world.holidays).toHaveLength(0);
    expect(readJournal(journalPathFor(t.stateDir, t.config.installationId)).flag).toBe("BLOQUEADO");
  });

  it("un login de comprobación fallido no declara éxito: el estado queda en CALENDARIO_CONFIRMADO", async () => {
    const t = setup();
    t.hooks.loginFails = true;
    await expect(initialize(t.mk())).rejects.toMatchObject({ code: "LOGIN" });
    expect(readJournal(journalPathFor(t.stateDir, t.config.installationId)).state).toBe("CALENDARIO_CONFIRMADO");
  });
});

describe("verify", () => {
  it("pasa tras una inicialización correcta y falla si aparece un rol extra", async () => {
    const t = setup();
    await initialize(t.mk());
    const ok = await verify(t.mk());
    expect(ok.ok).toBe(true);
    expect(t.logs.join("\n")).toContain("ETL F1 VERIFY: ALL CHECKS PASSED");
    t.world.roles.push({ user_id: randomUUID(), role: "admin", role_key: "admin" });
    expect((await verify(t.mk())).ok).toBe(false);
  });

  it.each([
    ["nombre", (h: any) => ({ ...h, holiday_name: "Nombre alterado" })],
    ["fecha", (h: any) => ({ ...h, holiday_date: "2030-05-05" })],
    ["oficina", (h: any) => ({ ...h, oficina: (h.oficina + 1) % 3 })],
  ])("falla si un feriado cambia de %s aunque sigan siendo 28 con la autoría correcta", async (_campo, alter) => {
    const t = setup();
    await initialize(t.mk());
    expect((await verify(t.mk())).ok).toBe(true);
    t.world.holidays[5] = alter(t.world.holidays[5]);
    expect(t.world.holidays).toHaveLength(28);
    t.logs.length = 0;
    expect((await verify(t.mk())).ok).toBe(false);
    expect(t.logs.join("\n")).toContain("coinciden con el calendario esperado");
  });

  it("initialize se bloquea si el calendario materializado no coincide con el esperado", async () => {
    const t = setup();
    const db = t.mk().db;
    db.seedHolidays = async () => {
      for (let i = 0; i < 28; i += 1) t.world.holidays.push({ ...calendarRow(i, t.world.staff.staff_id), holiday_name: i === 3 ? "Otro nombre" : calendarRow(i, "x").holiday_name });
      return 28;
    };
    await expect(initialize(t.mk({ db }))).rejects.toMatchObject({ code: "BLOQUEADO" });
  });

  it("sin journal, localiza la ficha por correo", async () => {
    const t = setup();
    await initialize(t.mk());
    fs.rmSync(journalPathFor(t.stateDir, t.config.installationId));
    expect((await verify(t.mk({ journalFile: null }))).ok).toBe(true);
  });
});

describe("calendario esperado", () => {
  it("coincide con el catálogo literal de la migración cero_15 (consola y migración no se desalinean)", () => {
    const sql = fs.readFileSync(path.resolve(HERE, "..", "..", "..", "supabase", "migrations", "20251204001006_cero_15_seed_holidays.sql"), "utf-8");
    const rows = [...sql.matchAll(/^\s*\('(\d{4}-\d{2}-\d{2})',\s*'([^']+)',\s*(\d)\)/gm)].map((m) => `${m[1]}|${m[3]}|${m[2]}`);
    expect(rows).toHaveLength(28);
    expect([...EXPECTED_CALENDAR].sort()).toEqual([...rows].sort());
  });

  it("envía a SQL solo hashes ASCII (los acentos de una variable -v se corrompen en Windows)", () => {
    expect(EXPECTED_CALENDAR_MD5).toHaveLength(28);
    for (const h of EXPECTED_CALENDAR_MD5) expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(new Set(EXPECTED_CALENDAR_MD5).size).toBe(28);
  });
});

describe("adaptador de Auth", () => {
  it("inventaría Auth con paginación completa", async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.com` }));
    const pages: number[] = [];
    const client = {
      auth: {
        admin: {
          async listUsers({ page, perPage }: any) {
            pages.push(page);
            return { data: { users: all.slice((page - 1) * perPage, page * perPage) }, error: null };
          },
        },
      },
    };
    const adapter = createAuthAdapter({ url: "http://127.0.0.1:54321", anonKey: "a", client, pageSize: 2 });
    expect(await adapter.listAllUsers()).toHaveLength(5);
    expect(pages).toEqual([1, 2, 3]);
  });

  it("distingue un rechazo definitivo (4xx) de un resultado incierto (red, 5xx, excepción)", async () => {
    const make = (impl: any) => createAuthAdapter({ url: "http://127.0.0.1:54321", anonKey: "a", client: { auth: { admin: { createUser: impl } } } });
    expect(await make(async () => ({ data: null, error: { status: 422, message: "email_exists" } })).createUser({})).toMatchObject({ ok: false, uncertain: false });
    expect(await make(async () => ({ data: null, error: { status: 502, message: "bad gateway" } })).createUser({})).toMatchObject({ ok: false, uncertain: true });
    expect(await make(async () => ({ data: null, error: { message: "fetch failed" } })).createUser({})).toMatchObject({ ok: false, uncertain: true });
    expect(
      await make(async () => {
        throw new Error("timeout");
      }).createUser({}),
    ).toMatchObject({ ok: false, uncertain: true });
    expect(await make(async () => ({ data: { user: { id: "x" } }, error: null })).createUser({})).toMatchObject({ ok: true });
  });
});

describe("psql: sin shell, credenciales por entorno y transacción única", () => {
  function fakeExec(captured: any, result: { error?: any; stdout?: string; stderr?: string } = {}) {
    return (bin: string, args: string[], options: any, callback: any) => {
      captured.bin = bin;
      captured.args = args;
      captured.options = options;
      const child = { stdin: { end: (sql: string) => (captured.stdin = sql) } };
      queueMicrotask(() => callback(result.error ?? null, result.stdout ?? "", result.stderr ?? ""));
      return child;
    };
  }

  it("invoca execFile con argumentos (no cadena de shell), -v parametrizado y -1", async () => {
    const captured: any = {};
    const env = { PATH: "/bin", PGHOST: "127.0.0.1", PGPASSWORD: "pw", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, ADMIN_TEMP_PASSWORD: PASSWORD, SUPABASE_ANON_KEY: ANON_KEY };
    const result = await runPsql("SELECT :'x';", { x: "valor; DROP TABLE staff" }, { env, singleTransaction: true, execFileImpl: fakeExec(captured, { stdout: "ok" }) });
    expect(result.ok).toBe(true);
    expect(captured.bin).toBe("psql");
    expect(captured.args).toEqual(["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-1", "-v", "x=valor; DROP TABLE staff", "-f", "-"]);
    expect(captured.options.shell).toBeUndefined();
    expect(captured.stdin).toBe("SELECT :'x';");
    expect(captured.options.env.PGPASSWORD).toBe("pw");
    expect(captured.options.env.PGDATABASE).toBe("postgres");
    for (const secret of ["SUPABASE_SERVICE_ROLE_KEY", "ADMIN_TEMP_PASSWORD", "SUPABASE_ANON_KEY"]) expect(captured.options.env[secret]).toBeUndefined();
    expect(captured.args.join(" ")).not.toContain("pw");
  });

  it("rechaza nombres de variable inválidos", () => {
    expect(() => runPsql("SELECT 1", { "x;y": "1" }, { env: {}, execFileImpl: fakeExec({}) })).toThrow(/variable psql/);
  });

  it("clasifica fallos: bloqueo del SQL, herramienta ausente e incertidumbre", () => {
    expect(classifySqlFailure({ stderr: "ERROR:  ETL_F1_FOREIGN: existen cuentas ajenas" })).toMatchObject({ kind: "blocked" });
    expect(classifySqlFailure({ stderr: "ERROR:  el feriado 2026-01-01 es contradictorio con el catálogo" })).toMatchObject({ kind: "blocked" });
    expect(classifySqlFailure({ spawnError: true, stderr: "" })).toMatchObject({ kind: "tool" });
    expect(classifySqlFailure({ stderr: "server closed the connection unexpectedly", code: 2 })).toMatchObject({ kind: "uncertain" });
  });

  it("el redactor enmascara contraseñas y claves", () => {
    const redact = makeRedactor({ PGPASSWORD: "postgres-pass-123", ADMIN_TEMP_PASSWORD: PASSWORD, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY });
    expect(redact(`fallo con ${PASSWORD} y ${SERVICE_KEY} y postgres-pass-123`)).toBe("fallo con *** y *** y ***");
  });
});
