import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED, Fase2InputError, HEADERS, detectCycles, parseCsv, resolveIndustryRef, topoOrder, validateClients, validateRates, validateRoleAssignment, validateServices } from "../fase2-input.mjs";
import { writeJournal } from "../fase1.mjs";
import { createContext, journalPathFor, parseConfig, probeAccess, report, requireWindow, reservedClientMatches } from "../fase2.mjs";

const header = (name: keyof typeof HEADERS) => HEADERS[name].join(",");
const client = (ref: string, parent = "", relation = "") => `${ref},Cliente ${ref},,001,entidad,${parent},${relation},nacional,nit_propio,Industria,Dirección,true,`;

describe("ETL fase 2: entrada offline", () => {
  it("declara el alcance ampliado de F2 aprobado por el operador", () => {
    expect(EXPECTED).toMatchObject({ staff: 153, users: 153, activeStaff: 145, inactiveStaff: 8, schedulableStaff: 145 });
  });

  it("admite sólo los roles especiales aprobados para cada perfil", () => {
    const staff: any = { staff_source_ref: "legacy:112", category_name: "Asistente" };
    expect(() => validateRoleAssignment(staff, { expected_role_key: "risk_supervisor", expected_legacy_role: "manager" }, "assistant")).not.toThrow();
    expect(() => validateRoleAssignment(staff, { expected_role_key: "risk_partner", expected_legacy_role: "partner" }, "assistant")).toThrow(/enmienda/);
    expect(() => validateRoleAssignment({ staff_source_ref: "legacy:999", category_name: "Asistente" }, { expected_role_key: "risk_supervisor", expected_legacy_role: "manager" }, "assistant")).toThrow(/categoría/);
  });

  it("rechaza texto con doble codificación UTF-8 y acepta los acentos correctos", () => {
    const ok = `${header("clients")}\r\nlegacy:58,"COMPAÑIA DE SEGUROS, Médico",,001,empresa,,,nacional,nit_propio,Industria,"Av. 6 de Agosto N° 2678",true,`;
    expect(() => parseCsv(ok, HEADERS.clients, "clientes")).not.toThrow();
    for (const bad of ["COMPAÃ‘IA", "MÃ©dico", "NÂ° 2678"]) {
      const text = ok.replace("COMPAÑIA DE SEGUROS, Médico", bad);
      expect(() => parseCsv(text, HEADERS.clients, "clientes")).toThrow(/doble codificación UTF-8 en 1 línea\(s\) \(primera: 2\)/);
    }
  });

  it("acepta BOM, RFC4180 y conserva un NIT con cero inicial", () => {
    const rows = parseCsv(`\uFEFF${header("clients")}\r\nlegacy:89,"Nombre, S.A.",,001,empresa,,,nacional,nit_propio,Industria,"una\nlínea",true,`, HEADERS.clients, "clientes");
    expect(rows[0].tax_id).toBe("001");
    expect(rows[0].address).toBe("una\nlínea");
  });

  it("bloquea encabezados alterados, exclusiones y ciclos", () => {
    expect(() => parseCsv("a,b\n1,2", HEADERS.clients)).toThrow(Fase2InputError);
    expect(() => validateClients([client("legacy:1").split(",").reduce((row: any, value, i) => ({ ...row, [HEADERS.clients[i]]: value }), {})], { enforceExpected: false })).toThrow(/excluida/);
    expect(() => detectCycles([{ source_ref: "a", parent_ref: "b" }, { source_ref: "b", parent_ref: "a" }] as any)).toThrow(/ciclo/);
  });

  it("bloquea tipos y relaciones que el esquema no admite", () => {
    const row = client("legacy:89").split(",").reduce((out: any, value, i) => ({ ...out, [HEADERS.clients[i]]: value }), {});
    expect(() => validateClients([{ ...row, client_type: "empresa" }], { enforceExpected: false })).toThrow(/tipo o relación/);
    expect(() => validateClients([row, { ...row, source_ref: "NEW-RJ", parent_ref: "legacy:89", parent_relationship: "subsidiaria" }], { enforceExpected: false })).toThrow(/tipo o relación/);
  });

  it("ordena padres antes que hijos a cualquier profundidad", () => {
    const rows = [
      { source_ref: "c", parent_ref: "b" },
      { source_ref: "a", parent_ref: "" },
      { source_ref: "b", parent_ref: "a" },
    ] as any;
    expect(topoOrder(rows).map((row) => row.source_ref)).toEqual(["a", "b", "c"]);
  });

  it("resuelve referencias de industria numeradas y el alias 28", () => {
    const industries = [{ industry_id: "regular", industry_name: "Financial Services-Banking" }, { industry_id: "misc", industry_name: "Misceláneo" }];
    expect(resolveIndustryRef("24: Financial Services-Banking", industries).industry_id).toBe("regular");
    expect(resolveIndustryRef("28: Miscellaneous-Miscellaneous", industries).industry_id).toBe("misc");
    expect(() => resolveIndustryRef("99: Desconocida", industries)).toThrow(/no resuelta/);
  });

  it("rechaza secretos y expectations alteradas fuera de local", () => {
    const base: any = {
      schemaVersion: 1, environment: "test", expectedProjectRef: "slkqdcwwvmjtcbakajib",
      supabaseUrl: "https://slkqdcwwvmjtcbakajib.supabase.co", installationId: "f2-ensayo-test-0001",
      bootstrapAdminEmail: "admin@ruizmier.com", snapshot: "TimeControlDB_20261023_1200",
      inputs: Object.fromEntries(["clients", "contacts", "staff", "users", "rates", "services"].map((name) => [name, path.resolve(path.sep, "tmp", "x.csv")])),
      expectations: { clients: 1 }, apiKey: "never",
    };
    expect(() => parseConfig(base)).toThrow(/desconocida|credenciales/);
    delete base.apiKey;
    expect(() => parseConfig(base)).toThrow(/alterar expectations/);
  });

  it("no reanuda un journal de la misma instalación creado con otra configuración", () => {
    const stateDir = mkdtempSync(path.join(os.tmpdir(), "etl-f2-"));
    const raw = (clients: string): any => ({
      schemaVersion: 1, environment: "local", expectedProjectRef: "local", supabaseUrl: "http://127.0.0.1:54321", installationId: "f2-ensayo-local-0001",
      bootstrapAdminEmail: "admin@ruizmier.com", snapshot: "TimeControlDB_20261023_1200",
      inputs: Object.fromEntries(["clients", "contacts", "staff", "users", "rates", "services"].map((name) => [name, path.resolve(path.sep, "tmp", name === "clients" ? clients : "x.csv")])),
    });
    const config = parseConfig(raw("a.csv")); const other = parseConfig(raw("b.csv"));
    expect(other.configHash).not.toBe(config.configHash);
    const journal = { version: 1, installationId: config.installationId, projectRef: config.expectedProjectRef, configHash: config.configHash, state: "VALIDADO", inputs: {}, clients: {}, staff: {} };
    writeJournal(journalPathFor(stateDir, config.installationId), journal);
    expect(() => report(createContext({ config, stateDir, db: {} } as any))).not.toThrow(/configHash/);
    // Sin clientes ni fichas cargados la configuración nueva se adopta (el pre-vuelo y la carga pueden diferir).
    expect(() => report(createContext({ config: other, stateDir, db: {} } as any))).not.toThrow(/otra configuración/);
    // Con una ficha ya cargada, otra configuración no se reanuda.
    writeJournal(journalPathFor(stateDir, config.installationId), { ...journal, staff: { "P-1": { state: "confirmado" } } });
    expect(() => report(createContext({ config: other, stateDir, db: {} } as any))).toThrow(/otra configuración/);
    // Un journal anterior a este campo no lo trae y se acepta.
    writeJournal(journalPathFor(stateDir, config.installationId), { version: 1, installationId: config.installationId, projectRef: config.expectedProjectRef, state: "VALIDADO", inputs: {} });
    expect(() => report(createContext({ config: other, stateDir, db: {} } as any))).not.toThrow(/otra configuración/);
  });

  it("exige que la confirmación de ventana sea la del ref del proyecto", () => {
    const ctx = (value: string | undefined) => ({ config: { expectedProjectRef: "slkqdcwwvmjtcbakajib" }, env: value === undefined ? {} : { ETL_F2_WINDOW_CONFIRMED: value } }) as any;
    expect(() => requireWindow(ctx("slkqdcwwvmjtcbakajib"))).not.toThrow();
    expect(() => requireWindow(ctx(undefined))).toThrow(/ETL_F2_WINDOW_CONFIRMED/);
    expect(() => requireWindow(ctx("local"))).toThrow(/ETL_F2_WINDOW_CONFIRMED/);
    expect(() => requireWindow(ctx("ventana-31-10"))).toThrow(/ETL_F2_WINDOW_CONFIRMED/);
  });

  it("valida el contenido de las tarifas y de las equivalencias de servicios", () => {
    const rate = (p: string, c: string, v = "1") => ({ practica_abbreviation: p, category_name: c, rate_high_usd: v, rate_low_usd: v, rate_high_bob: v, rate_low_bob: v, source_rule: "x" });
    expect(() => validateRates([rate("AUD", "Socio"), rate("AUD", "SQR")], { expected: { ...EXPECTED, rates: 2 } })).not.toThrow();
    expect(() => validateRates([], { expected: EXPECTED })).toThrow(/se esperaban 15/); // solo encabezado
    expect(() => validateRates([rate("AUD", "Socio"), rate("AUD", "Socio")], { expected: { ...EXPECTED, rates: 2 } })).toThrow(/duplicada/);
    expect(() => validateRates([rate("AUD", "Socio", "abc")], { expected: { ...EXPECTED, rates: 1 } })).toThrow(/no numérico/);
    expect(() => validateRates([rate("", "Socio")], { expected: { ...EXPECTED, rates: 1 } })).toThrow(/vacía/);
    const svc = (id: string, name = "Auditoría") => ({ legacy_service_id: id, ems_service_name: name, equivalence_basis: "x" });
    expect(() => validateServices([svc("1"), svc("2")], { expected: { ...EXPECTED, services: 2 } })).not.toThrow();
    expect(() => validateServices([], { expected: EXPECTED })).toThrow(/se esperaban 46/);
    expect(() => validateServices([svc("1"), svc("1")], { expected: { ...EXPECTED, services: 2 } })).toThrow(/duplicado/);
    expect(() => validateServices([svc("1", "")], { expected: { ...EXPECTED, services: 1 } })).toThrow(/vacío/);
  });

  it("reconcilia una unidad cliente reservada sólo cuando coincide exactamente", () => {
    const row: any = { client_legal_name: "Cliente", tax_id: "123", industry_ref: "", parent_ref: "" };
    expect(reservedClientMatches({ client_legal_name: "Cliente", tax_id: "123", parent_client_id: null, industry_id: null, is_active: true, contacts: [] }, row, null, null, null)).toBe(true);
    expect(reservedClientMatches({ client_legal_name: "Ajeno", tax_id: "123", parent_client_id: null, industry_id: null, is_active: true, contacts: [] }, row, null, null, null)).toBe(false);
  });

});

describe("ETL fase 2: sondeo de acceso (plan §4.5)", () => {
  const entry = { state: "enlace_rol_confirmado", authUserId: "auth-1", staffId: "staff-1", sourceInactive: false };
  const newCtx = (auth: any) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "etl-f2-probe-"));
    return { stateDir: dir, journalFile: path.join(dir, "fase2-f2-prueba.journal.json"), config: {}, env: {}, auth, log: () => {}, journal: { installationId: "f2-prueba", state: "PREFLIGHT_VALIDADO", staff: { "legacy:1": entry }, probes: {} } };
  };
  const authWith = (login: any, myStaffId: string | null) => { const calls: any[] = []; return { calls, updateUserById: async (_id: string, attrs: any) => { calls.push(["update", attrs.password]); return { ok: true, user: { email: "p@ruizmier.com" } }; }, login: async (email: string, password: string) => { calls.push(["login", email, password]); return login; }, myStaffId: async () => myStaffId }; };

  it("prueba login y get_my_staff_id() con la clave temporal antes de rotarla, y cierra la sonda", async () => {
    const auth = authWith({ ok: true, accessToken: "t", userId: "auth-1" }, "staff-1"); const ctx: any = newCtx(auth);
    await expect(probeAccess(ctx, "legacy:1")).resolves.toMatchObject({ ok: true, state: "cerrada" });
    expect(auth.calls.map((c: any[]) => c[0])).toEqual(["update", "login", "update"]);
    expect(auth.calls[1][1]).toBe("p@ruizmier.com");
    expect(auth.calls[1][2]).toBe(auth.calls[0][1]);
    expect(auth.calls[2][1]).not.toBe(auth.calls[0][1]);
    expect(ctx.journal.probes["legacy:1"].state).toBe("cerrada");
  });

  it.each([
    ["el login falla", { ok: false, status: 400 }, "staff-1", /login de sondeo falló/],
    ["el login devuelve otra cuenta", { ok: true, accessToken: "t", userId: "otra" }, "staff-1", /cuenta distinta/],
    ["get_my_staff_id() no es la ficha propia", { ok: true, accessToken: "t", userId: "auth-1" }, null, /get_my_staff_id\(\) devolvió/],
  ])("si %s, rota igual la clave, deja la sonda fallida y no reporta éxito", async (_name, login, staffId, message) => {
    const auth = authWith(login, staffId as string | null); const ctx: any = newCtx(auth);
    await expect(probeAccess(ctx, "legacy:1")).rejects.toThrow(message as RegExp);
    expect(auth.calls.filter((c: any[]) => c[0] === "update")).toHaveLength(2);
    expect(ctx.journal.probes["legacy:1"].state).toBe("acceso_fallido");
  });
});
