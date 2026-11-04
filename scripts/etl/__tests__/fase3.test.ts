import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { acceptBlock, assertInputsUnchangedSinceProgress, assertTarget, createContext, load, lockInstallation, parseConfig, STATES } from "../fase3.mjs";

const TEST_REF = "slkqdcwwvmjtcbakajib";
// Ruta absoluta válida en cualquier plataforma (el CI corre en Linux; «C:\…» no es absoluta allí).
const abs = (...parts: string[]) => path.resolve(path.sep, "private", ...parts);

const config = { schemaVersion: 1, environment: "local", expectedProjectRef: "local", supabaseUrl: "http://127.0.0.1:54321", installationId: "f3-ensayo-local-0001", snapshot: "TimeControlDB_20261023_1200", technicalAdminId: "00000000-0000-4000-8000-000000000001", f2StateDir: abs("f2"), f2ServicesFile: abs("services.csv"), f2ClientsFile: abs("clients.csv"), inputs: Object.fromEntries(["clientEngagements", "planHours", "expenses", "payments", "administrativeEngagements", "executions"].map((name) => [name, abs("x.csv")])) };
describe("ETL fase 3: consola y guardas", () => {
  it("admite únicamente destino local loopback y estados ordenados", () => { expect(parseConfig(config).expectedProjectRef).toBe("local"); expect(STATES.indexOf("VALIDADO")).toBeLessThan(STATES.indexOf("PREFLIGHT_VALIDADO")); });
  it("rechaza endpoints remotos con local, secretos y ambientes no habilitados", () => {
    expect(() => parseConfig({ ...config, environment: "production" })).toThrow(/local\|test/);
    expect(() => parseConfig({ ...config, supabaseUrl: "https://x.supabase.co" })).toThrow(/loopback/);
    expect(() => parseConfig({ ...config, password: "no" })).toThrow(/desconocidas/);
  });
  it("habilita Test sólo con su ref y su URL exactos; nunca con el ref de producción ni de Lovable", () => {
    const test = { ...config, environment: "test", expectedProjectRef: TEST_REF, supabaseUrl: `https://${TEST_REF}.supabase.co`, installationId: "f3-test-0001" };
    expect(parseConfig(test).expectedProjectRef).toBe(TEST_REF);
    expect(() => parseConfig({ ...test, expectedProjectRef: "local" })).toThrow(/exige el ref/);
    expect(() => parseConfig({ ...test, expectedProjectRef: "xcdcxtduotwgwmhxvsiz", supabaseUrl: "https://xcdcxtduotwgwmhxvsiz.supabase.co" })).toThrow(/exige el ref/);
    expect(() => parseConfig({ ...test, expectedProjectRef: "ugqxfnrxvksiltwxzist", supabaseUrl: "https://ugqxfnrxvksiltwxzist.supabase.co" })).toThrow(/exige el ref/);
    expect(() => parseConfig({ ...test, supabaseUrl: "http://127.0.0.1:54321" })).toThrow(/exige supabaseUrl/);
    expect(() => parseConfig({ ...test, supabaseUrl: `https://${TEST_REF}.supabase.co.evil.test` })).toThrow(/exige supabaseUrl/);
  });
  it("la guarda de destino exige pooler, usuario postgres.<ref> y ventana confirmada en Test, y loopback en local", () => {
    const test = parseConfig({ ...config, environment: "test", expectedProjectRef: TEST_REF, supabaseUrl: `https://${TEST_REF}.supabase.co`, installationId: "f3-test-0001" });
    const env = { PGHOST: "aws-1-us-west-1.pooler.supabase.com", PGUSER: `postgres.${TEST_REF}`, ETL_F3_WINDOW_CONFIRMED: "ventana-31-10" };
    expect(() => assertTarget(test, env)).not.toThrow();
    expect(() => assertTarget(test, { ...env, ETL_F3_WINDOW_CONFIRMED: "" })).toThrow(/ETL_F3_WINDOW_CONFIRMED/);
    expect(() => assertTarget(test, { ...env, PGHOST: "127.0.0.1" })).toThrow(/pooler/);
    expect(() => assertTarget(test, { ...env, PGUSER: "postgres.xcdcxtduotwgwmhxvsiz" })).toThrow(/PGUSER/);
    expect(() => assertTarget(parseConfig(config), { PGHOST: "127.0.0.1" })).not.toThrow();
    expect(() => assertTarget(parseConfig(config), { PGHOST: "aws-1-us-west-1.pooler.supabase.com" })).toThrow(/loopback/);
  });
  it("un journal creado para local no se reutiliza contra Test", () => {
    const stateDir = mkdtempSync(path.join(os.tmpdir(), "etl-f3-"));
    const local = createContext({ config: parseConfig(config), stateDir, db: {} }); writeFileSync(local.journalFile, JSON.stringify(local.journal));
    const test = parseConfig({ ...config, environment: "test", expectedProjectRef: TEST_REF, supabaseUrl: `https://${TEST_REF}.supabase.co` });
    expect(() => createContext({ config: test, stateDir, db: {} })).toThrow(/otra instalación o proyecto/);
  });
  it("no reanuda un journal de la misma instalación creado con otra configuración", () => {
    const stateDir = mkdtempSync(path.join(os.tmpdir(), "etl-f3-"));
    const first = createContext({ config: parseConfig(config), stateDir, db: {} }); writeFileSync(first.journalFile, JSON.stringify(first.journal));
    expect(() => createContext({ config: parseConfig(config), stateDir, db: {} })).not.toThrow();
    const other = parseConfig({ ...config, technicalAdminId: "11111111-1111-4111-8111-111111111111" });
    expect(other.configHash).not.toBe(first.config.configHash);
    expect(() => createContext({ config: other, stateDir, db: {} })).toThrow(/otra configuración/);
  });
  it("los CSV no pueden cambiar una vez que hay unidades o bloques escritos, pero sí antes", () => {
    const before = { a: "1" }; const after = { a: "2" };
    expect(() => assertInputsUnchangedSinceProgress({ inputs: before, units: {}, blocks: {} }, after)).not.toThrow();
    expect(() => assertInputsUnchangedSinceProgress({ units: { "client-engagements": {} }, blocks: {} }, after)).not.toThrow(); // sin huella previa
    expect(() => assertInputsUnchangedSinceProgress({ inputs: before, units: { "client-engagements": { state: "CONFIRMADA" } }, blocks: {} }, before)).not.toThrow();
    expect(() => assertInputsUnchangedSinceProgress({ inputs: before, units: { "client-engagements": { state: "CONFIRMADA" } }, blocks: {} }, after)).toThrow(/cambió la huella/);
    expect(() => assertInputsUnchangedSinceProgress({ inputs: before, units: {}, blocks: { hours: { acceptedAt: "x" } } }, after)).toThrow(/cambió la huella/);
  });
  it("no permite aceptar un bloque sin unidad confirmada", () => {
    const ctx = createContext({ config: parseConfig(config), stateDir: mkdtempSync(path.join(os.tmpdir(), "etl-f3-")), db: {} });
    expect(() => acceptBlock(ctx, "client-engagements", "a".repeat(64))).toThrow(/sin unidad confirmada/);
    ctx.journal.units["client-engagements"] = { state: "CONFIRMADA" };
    acceptBlock(ctx, "client-engagements", "a".repeat(64));
    expect(ctx.journal.blocks["client-engagements"].evidenceHash).toBe("a".repeat(64));
  });
});

describe("ETL fase 3: horas y bloqueo de instalación", () => {
  const newCtx = () => createContext({ config: parseConfig(config), stateDir: mkdtempSync(path.join(os.tmpdir(), "etl-f3-")), db: {} });

  it("el bloque hours rechaza la operación create: no registra un éxito sin insertar horas", async () => {
    const ctx = newCtx(); ctx.journal.blocks["work-orders"] = { acceptedAt: "2026-11-01T00:00:00.000Z" };
    await expect(load(ctx, "hours")).rejects.toThrow(/--operation hours/);
    expect(ctx.journal.units.hours).toBeUndefined();
  });

  it("dos comandos que escriben sobre la misma instalación no pueden correr a la vez", () => {
    const ctx = newCtx();
    const release = lockInstallation(ctx, "load");
    expect(() => lockInstallation(ctx, "accept")).toThrow(/otra ejecución/);
    release();
    const again = lockInstallation(ctx, "load"); again();
  });

  it("los comandos de solo lectura no toman el bloqueo", () => {
    const ctx = newCtx();
    const release = lockInstallation(ctx, "load");
    for (const command of ["validate", "report", "fingerprint", "reconcile-legacy"]) expect(() => lockInstallation(ctx, command)()).not.toThrow();
    release();
  });
});
