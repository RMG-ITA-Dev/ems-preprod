// Integración de la consola ETL fase 1 contra SQL + Auth LOCALES reales (plan_v2.md §9, T05/T06).
//
// Opt-in: se omite salvo ETL_F1_INTEGRATION=1. Precondiciones (ver scripts/etl/README.md):
//   · stack local recién replicado (`supabase start`), en modo PREINIT: cero cuentas, fichas, roles,
//     clientes, operaciones y feriados. La suite inicializa al administrador ficticio, así que NO debe
//     correrse después de una inicialización manual que invalide esas precondiciones.
//   · variables: PGHOST=127.0.0.1 PGPORT PGUSER PGPASSWORD, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//     ADMIN_TEMP_PASSWORD y, opcionales, ETL_F1_SUPABASE_URL (por defecto http://127.0.0.1:54321),
//     ETL_F1_STATE_DIR (por defecto un directorio temporal) y ETL_F1_INSTALLATION_ID (por defecto el
//     del ejemplo; el CI lo cambia en la segunda instalación para probar una generación nueva).
//
// Los escenarios están ENCADENADOS sobre una sola base (no hay reset entre ellos): ejecutor duplicado
// → interrupción tras la ficha → tras Auth → tras el calendario → cierre → repetición → verify.
// Las interrupciones se simulan envolviendo los adaptadores REALES (el efecto ocurre y se lanza el error
// antes del checkpoint), sin ganchos de fallo dentro de la consola.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAuthAdapter, createContext, initialize, journalPathFor, parseConfig, readJournal, verify } from "../fase1.mjs";
import { connectionGuardProblems, createDbAdapter, LOOPBACK_HOSTS } from "../fase1-db.mjs";

const enabled = process.env.ETL_F1_INTEGRATION === "1";
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const baseConfig = () => JSON.parse(fs.readFileSync(path.resolve(HERE, "..", "fase1.config.example.json"), "utf8"));

describe("rechazo de destinos no loopback", () => {
  it("environment=local no admite un host remoto ni un URL remoto", () => {
    const config = parseConfig(baseConfig());
    expect(connectionGuardProblems(config, { PGHOST: "aws-0-us-west-2.pooler.supabase.com" }).join(" ")).toMatch(/loopback/);
    const remoteUrl = parseConfig({ ...baseConfig(), supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co" });
    expect(connectionGuardProblems(remoteUrl, { PGHOST: "127.0.0.1" }).join(" ")).toMatch(/supabaseUrl/);
  });
});

describe.skipIf(!enabled)("integración local (ETL_F1_INTEGRATION=1)", () => {
  const env: Record<string, string | undefined> = { ...process.env, ETL_F1_SIGNUP_CLOSED: "1" };
  const url = env.ETL_F1_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const stateDir = env.ETL_F1_STATE_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "etl-f1-int-"));
  fs.mkdirSync(stateDir, { recursive: true });
  env.ETL_F1_STATE_DIR = stateDir;
  const config = parseConfig({ ...baseConfig(), supabaseUrl: url, installationId: env.ETL_F1_INSTALLATION_ID ?? baseConfig().installationId });
  const journalFile = journalPathFor(stateDir, config.installationId);

  const realDb = () => createDbAdapter({ env: env as any });
  const realAuth = () => createAuthAdapter({ url, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, anonKey: env.SUPABASE_ANON_KEY });
  const quiet = () => {};
  const mk = (over: any = {}) => createContext({ config, env: env as any, stateDir, db: realDb(), auth: realAuth(), log: quiet, ...over });

  // Ejecuta el método real y luego "cae" antes de que la consola registre el checkpoint.
  const crashAfter = (adapter: any, method: string) => ({
    ...adapter,
    [method]: async (...args: any[]) => {
      await adapter[method](...args);
      throw new Error(`crash:${method}`);
    },
  });

  it("precondiciones: destino loopback y base en modo preinit", async () => {
    expect(LOOPBACK_HOSTS.has(String(env.PGHOST))).toBe(true);
    expect(connectionGuardProblems(config, env as any)).toEqual([]);
    for (const name of ["ADMIN_TEMP_PASSWORD", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "PGUSER"]) expect(env[name], `falta ${name}`).toBeTruthy();
    const pre = await realDb().preconditions();
    expect(Object.values(pre).map(Number)).toEqual(Object.values(pre).map(() => 0));
  });

  it("dos ejecutores simultáneos: solo uno escribe (bloqueo) y el otro se rechaza", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slowDb = { ...realDb(), ping: async () => (await gate, realDb().ping()) };
    const first = initialize(mk({ db: crashAfter(slowDb, "insertStaff") })); // retenido en el preflight
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(initialize(mk())).rejects.toMatchObject({ code: "BLOQUEADO" });
    release();
    await expect(first).rejects.toThrow("crash:insertStaff"); // T06: interrupción tras la ficha
    expect(Number((await realDb().preconditions()).staff)).toBe(1);
  });

  it("interrupción tras Auth: se reanuda con la misma ficha y se recupera la cuenta por correlación", async () => {
    const journalBefore = readJournal(journalFile);
    await expect(initialize(mk({ auth: crashAfter(realAuth(), "createUser") }))).rejects.toThrow("crash:createUser");
    const users = await realAuth().listAllUsers();
    expect(users).toHaveLength(1);
    expect(readJournal(journalFile).staffId).toBe(journalBefore.staffId);
  });

  it("interrupción tras el calendario: se completa sin duplicar identidades", async () => {
    await expect(initialize(mk({ db: crashAfter(realDb(), "seedHolidays") }))).rejects.toThrow("crash:seedHolidays");
    const journal = readJournal(journalFile);
    const summary = await realDb().holidaysSummary(journal.staffId);
    expect(Number(summary.total)).toBe(28);
    expect((await realAuth().listAllUsers()).length).toBe(1);
  });

  it("cierre: ficha, enlace, único rol admin/admin, 28 feriados y login", async () => {
    const result = await initialize(mk());
    expect(result.state).toBe("VERIFICADO");
    const db = realDb();
    const link = await db.readLinkState(result.staffId);
    expect(link.staff_auth_user_id).toBe(result.authUserId);
    expect(link.roles).toEqual([{ user_id: result.authUserId, role: "admin", role_key: "admin" }]);
    const holidays = await db.holidaysSummary(result.staffId);
    expect(Number(holidays.total)).toBe(28);
    expect(Number(holidays.by_admin)).toBe(28);
    const staff = await db.readStaff(result.staffId);
    expect(staff).toMatchObject({ is_schedulable: false, weekly_capacity_hours: "40", target_utilization_percent: "85" });
  });

  it("segunda inicialización: mismas identidades y cero escrituras de negocio", async () => {
    const before = readJournal(journalFile);
    const snapshot = await realDb().snapshot();
    const again = await initialize(mk());
    expect(again.repetition).toBe(true);
    expect(again.staffId).toBe(before.staffId);
    expect(again.authUserId).toBe(before.authUserId);
    expect(await realDb().snapshot()).toEqual(snapshot);
    expect((await realAuth().listAllUsers()).length).toBe(1);
  });

  it("verify pasa de extremo a extremo", async () => {
    expect((await verify(mk())).ok).toBe(true);
  });

  it("una instalación distinta (otro journal) ve datos ajenos y no crea identidades", async () => {
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "etl-f1-int-b-"));
    const other = parseConfig({ ...baseConfig(), supabaseUrl: url, installationId: `${config.installationId}-otra` });
    const ctx = createContext({ config: other, env: { ...env, ETL_F1_STATE_DIR: otherDir } as any, stateDir: otherDir, db: realDb(), auth: realAuth(), log: quiet });
    await expect(initialize(ctx)).rejects.toMatchObject({ code: "BLOQUEADO" });
    expect((await realAuth().listAllUsers()).length).toBe(1);
    expect(Number((await realDb().preconditions()).staff)).toBe(1);
  });
});
