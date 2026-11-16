import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { acceptBlock, assertF2AuxiliaryFile, assertInputsUnchangedSinceProgress, assertPaymentCurrency, assertTarget, createContext, exitCodeFor, load, assertF2Origin, loadF2Maps, lockInstallation, parseConfig, STATES } from "../fase3.mjs";
import { writeJournal } from "../fase1.mjs";
import { journalPathFor } from "../fase2.mjs";
import { fileURLToPath } from "node:url";

const TEST_REF = "slkqdcwwvmjtcbakajib";
// Ruta absoluta válida en cualquier plataforma (el CI corre en Linux; «C:\…» no es absoluta allí).
const abs = (...parts: string[]) => path.resolve(path.sep, "private", ...parts);

const config = { schemaVersion: 1, environment: "local", expectedProjectRef: "local", supabaseUrl: "http://127.0.0.1:54321", installationId: "f3-ensayo-local-0001", snapshot: "TimeControlDB_20261023_1200", technicalAdminId: "00000000-0000-4000-8000-000000000001", f2StateDir: abs("f2"), f2ServicesFile: abs("services.csv"), f2ClientsFile: abs("clients.csv"), inputs: Object.fromEntries(["clientEngagements", "planHours", "expenses", "payments", "administrativeEngagements", "executions"].map((name) => [name, abs("x.csv")])) };
const LOCAL_F3 = { environment: "local", manifest: { snapshot: "TimeControlDB_20261106_1600" } };
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
    const env = { PGHOST: "aws-1-us-west-1.pooler.supabase.com", PGUSER: `postgres.${TEST_REF}`, ETL_F3_WINDOW_CONFIRMED: TEST_REF };
    expect(() => assertTarget(test, env)).not.toThrow();
    expect(() => assertTarget(test, { ...env, ETL_F3_WINDOW_CONFIRMED: "" })).toThrow(/ETL_F3_WINDOW_CONFIRMED/);
    // Una confirmación sobrante de otro ambiente (o una etiqueta libre) no autoriza escrituras en este proyecto.
    expect(() => assertTarget(test, { ...env, ETL_F3_WINDOW_CONFIRMED: "local" })).toThrow(/ETL_F3_WINDOW_CONFIRMED/);
    expect(() => assertTarget(test, { ...env, ETL_F3_WINDOW_CONFIRMED: "ventana-31-10" })).toThrow(/ETL_F3_WINDOW_CONFIRMED/);
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
  it("con progreso no reanuda un journal creado con otra configuración; sin progreso adopta la vigente (pre-vuelo con administrador de marcador)", () => {
    const stateDir = mkdtempSync(path.join(os.tmpdir(), "etl-f3-"));
    const marker = parseConfig({ ...config, technicalAdminId: "00000000-0000-4000-8000-000000000001" });
    const real = parseConfig({ ...config, technicalAdminId: "11111111-1111-4111-8111-111111111111" });
    expect(real.configHash).not.toBe(marker.configHash);
    // Pre-vuelo: valida con el marcador y deja el journal sin unidades ni bloques.
    const pre = createContext({ config: marker, stateDir, db: {} }); writeFileSync(pre.journalFile, JSON.stringify(pre.journal));
    expect(() => createContext({ config: marker, stateDir, db: {} })).not.toThrow();
    // Paso 40: administrador real. No hay progreso, así que el journal adopta la configuración vigente.
    const load = createContext({ config: real, stateDir, db: {} });
    expect(load.journal.configHash).toBe(real.configHash);
    // Con una unidad escrita, otra configuración ya no se reanuda.
    load.journal.units["client-engagements"] = { state: "CONFIRMADA" }; writeFileSync(load.journalFile, JSON.stringify(load.journal));
    expect(() => createContext({ config: real, stateDir, db: {} })).not.toThrow();
    expect(() => createContext({ config: marker, stateDir, db: {} })).toThrow(/otra configuración/);
  });
  it("los CSV no pueden cambiar una vez que hay unidades o bloques escritos, pero sí antes", () => {
    const before = { a: "1" }; const after = { a: "2" };
    expect(() => assertInputsUnchangedSinceProgress({ inputs: before, units: {}, blocks: {} }, after)).not.toThrow();
    expect(() => assertInputsUnchangedSinceProgress({ units: { "client-engagements": {} }, blocks: {} }, after)).not.toThrow(); // sin huella previa
    expect(() => assertInputsUnchangedSinceProgress({ inputs: before, units: { "client-engagements": { state: "CONFIRMADA" } }, blocks: {} }, before)).not.toThrow();
    expect(() => assertInputsUnchangedSinceProgress({ inputs: before, units: { "client-engagements": { state: "CONFIRMADA" } }, blocks: {} }, after)).toThrow(/cambió la huella/);
    expect(() => assertInputsUnchangedSinceProgress({ inputs: before, units: {}, blocks: { hours: { acceptedAt: "x" } } }, after)).toThrow(/cambió la huella/);
  });
  it("devuelve los mismos códigos de salida que F1 y F2 (2 bloqueado, 3 reconciliación requerida, 1 el resto)", () => {
    expect(exitCodeFor({ code: "BLOQUEADO" })).toBe(2); expect(exitCodeFor({ code: "RECONCILIACION_REQUERIDA" })).toBe(3);
    expect(exitCodeFor({ code: "CONFIG" })).toBe(1); expect(exitCodeFor(new Error("x"))).toBe(1);
    // Una escritura de resultado incierto (SQL o Auth) también exige reconciliar.
    expect(exitCodeFor({ code: "SQL_INCIERTO" })).toBe(3); expect(exitCodeFor({ code: "AUTH_INCIERTO" })).toBe(3);
  });
  it("F3 solo toma los mapeos del journal de F2 si su checksum es íntegro y su estado es VERIFICADO", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "etl-f3-f2journal-"));
    const file = journalPathFor(dir, "f2-ensayo-0001");
    writeJournal(file, { version: 1, installationId: "f2-ensayo-0001", projectRef: "local", state: "VERIFICADO", inputs: {}, clients: { "C-1": { clientId: "uuid-cliente-1" } }, staff: { "P-1": { staffId: "uuid-staff-1" } } });
    expect(loadF2Maps(dir, LOCAL_F3)).toMatchObject({ clients: { "C-1": { id: "uuid-cliente-1" } }, staff: { "P-1": "uuid-staff-1" } });
    // Journal que sigue siendo JSON válido pero fue alterado después de escribirse: el checksum ya no coincide.
    writeFileSync(file, readFileSync(file, "utf8").replace("uuid-cliente-1", "uuid-otro-cliente"));
    expect(() => loadF2Maps(dir, LOCAL_F3)).toThrow(/checksum/);
    // Íntegro pero sin verificar.
    writeJournal(file, { version: 1, installationId: "f2-ensayo-0001", projectRef: "local", state: "CLIENTES_CONFIRMADOS", inputs: {}, clients: {}, staff: {} });
    expect(() => loadF2Maps(dir, LOCAL_F3)).toThrow(/VERIFICADO/);
  });
  it("R403-11: F3 solo acepta un journal F2 del mismo respaldo legacy de origen (las variantes D41 comparten origen)", () => {
    const f3 = (environment: string, snapshot: string, database?: string) => ({ environment, manifest: { snapshot, ...(database ? { origin: { database } } : {}) } });
    const BASE = "TimeControlDB_20261106_1600";
    // F2 con el manifiesto base o con cualquier variante D41 del mismo respaldo: coincide con F3 (lt01 = F2 _d41 + F3 _legacy_total_v1).
    expect(() => assertF2Origin(BASE, f3("test", BASE + "_d41_legacy_total_v1", BASE))).not.toThrow();
    expect(() => assertF2Origin(BASE, f3("test", BASE))).not.toThrow();
    // Otro respaldo: bloquea, nombrando ambos orígenes.
    expect(() => assertF2Origin("TimeControlDB_20261023_1200", f3("test", BASE + "_d41", BASE))).toThrow(/TimeControlDB_20261023_1200.*TimeControlDB_20261106_1600/);
    expect(() => assertF2Origin("TimeControlDB_20261023_1200", f3("local", BASE))).toThrow(/mismo respaldo/);
    // Journal anterior al campo: se acepta en local; fuera de local se rehace F2.
    expect(() => assertF2Origin(undefined, f3("local", BASE))).not.toThrow();
    expect(() => assertF2Origin(undefined, f3("test", BASE))).toThrow(/snapshotOrigin/);
  });
  it("R403-11: loadF2Maps bloquea un journal F2 de otro respaldo y entrega el origen cuando coincide", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "etl-f3-f2origin-"));
    const file = journalPathFor(dir, "f2-ensayo-0002");
    writeJournal(file, { version: 1, installationId: "f2-ensayo-0002", projectRef: "local", state: "VERIFICADO", snapshotOrigin: "TimeControlDB_20261023_1200", inputs: {}, clients: {}, staff: {} });
    expect(() => loadF2Maps(dir, LOCAL_F3)).toThrow(/mismo respaldo/);
    writeJournal(file, { version: 1, installationId: "f2-ensayo-0002", projectRef: "local", state: "VERIFICADO", snapshotOrigin: LOCAL_F3.manifest.snapshot, inputs: {}, clients: {}, staff: {} });
    expect(loadF2Maps(dir, LOCAL_F3).snapshotOrigin).toBe(LOCAL_F3.manifest.snapshot);
  });
  it("el ejemplo de configuración de F3 trae todas las claves que parseConfig exige", () => {
    const example = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fase3.config.example.json"), "utf8"));
    // Las rutas de ejemplo son de Windows (no absolutas en Linux): se sustituyen por rutas absolutas válidas en cualquier plataforma.
    const portable = JSON.parse(JSON.stringify(example), (_key, value) => typeof value === "string" && value.startsWith("C:\\ruta") ? abs(path.basename(value.replaceAll("\\", "/"))) : value);
    expect(() => parseConfig(portable)).not.toThrow();
  });
  it("rechaza un plan cuyas cuotas no tienen la moneda del encargo, o monedas mezcladas", () => {
    const row = (installment: string, currency: string) => ({ legacy_cot: "2026.11.001", legacy_installment_number: installment, legacy_currency_raw: currency });
    expect(() => assertPaymentCurrency([row("1", "0   "), row("2", "0")], "0", "2026.11.001")).not.toThrow(); // el legacy trae espacios
    expect(() => assertPaymentCurrency([row("1", "1"), row("2", "1")], "0", "2026.11.001")).toThrow(/distinta de la del encargo/); // BOB con cuotas USD
    expect(() => assertPaymentCurrency([row("1", "0"), row("2", "1")], "0", "2026.11.001")).toThrow(/distinta de la del encargo/); // mezcladas
    expect(() => assertPaymentCurrency([row("1", "0")], "1", "2026.11.001")).toThrow(/2026\.11\.001/);
  });
  it("F3 solo usa los archivos auxiliares de F2 si coinciden con la huella que F2 verificó", () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "etl-f3-aux-")), "servicios.csv");
    writeFileSync(file, "legacy_service_id,ems_service_name,equivalence_basis\n1,Auditoría,x\n");
    const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
    const f2 = { inputs: { services: { sha256: sha, rows: 1 } } };
    expect(() => assertF2AuxiliaryFile(file, f2, "services")).not.toThrow();
    writeFileSync(file, "legacy_service_id,ems_service_name,equivalence_basis\n1,Otro servicio,x\n"); // sobrescrito en el lugar
    expect(() => assertF2AuxiliaryFile(file, f2, "services")).toThrow(/difiere del que verificó F2/);
    expect(() => assertF2AuxiliaryFile(file, { inputs: {} }, "services")).toThrow(/no registra la huella/);
    expect(() => assertF2AuxiliaryFile(file, { inputs: { services: { sha256: "xyz" } } }, "services")).toThrow(/no registra la huella/);
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
