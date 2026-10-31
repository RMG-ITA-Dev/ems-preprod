import { describe, expect, it } from "vitest";
import { EXPECTED, Fase2InputError, HEADERS, detectCycles, parseCsv, resolveIndustryRef, topoOrder, validateClients, validateRoleAssignment } from "../fase2-input.mjs";
import { parseConfig, reservedClientMatches } from "../fase2.mjs";

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
      inputs: Object.fromEntries(["clients", "contacts", "staff", "users", "rates", "services"].map((name) => [name, "C:\\tmp\\x.csv"])),
      expectations: { clients: 1 }, apiKey: "never",
    };
    expect(() => parseConfig(base)).toThrow(/desconocida|credenciales/);
    delete base.apiKey;
    expect(() => parseConfig(base)).toThrow(/alterar expectations/);
  });

  it("reconcilia una unidad cliente reservada sólo cuando coincide exactamente", () => {
    const row: any = { client_legal_name: "Cliente", tax_id: "123", industry_ref: "", parent_ref: "" };
    expect(reservedClientMatches({ client_legal_name: "Cliente", tax_id: "123", parent_client_id: null, industry_id: null, is_active: true, contacts: [] }, row, null, null, null)).toBe(true);
    expect(reservedClientMatches({ client_legal_name: "Ajeno", tax_id: "123", parent_client_id: null, industry_id: null, is_active: true, contacts: [] }, row, null, null, null)).toBe(false);
  });

});
