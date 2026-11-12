import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTACT_CRITERIA, EXPECTED, Fase2InputError, HEADERS, contactIdentityKey, duplicateContacts, validateContacts } from "../fase2-input.mjs";
import { parseConfig as parseF2Config, reservedClientMatches } from "../fase2.mjs";
import { parseConfig as parseF3Config } from "../fase3.mjs";
import { SnapshotManifestError, assertEndDateCounts, declared, loadSnapshotManifest, matchesDeclared, resolveEndDate, validateManifestShape } from "../snapshot-manifest.mjs";

const OLD = "TimeControlDB_20261023_1200"; const FINAL = "TimeControlDB_20261106_1600";
const abs = (...parts: string[]) => path.resolve(path.sep, "private", ...parts);
const f2Raw = (snapshot: string, environment = "local", extra: object = {}): any => ({
  schemaVersion: 1, environment, expectedProjectRef: environment === "local" ? "local" : "slkqdcwwvmjtcbakajib", supabaseUrl: environment === "local" ? "http://127.0.0.1:54321" : "https://slkqdcwwvmjtcbakajib.supabase.co",
  installationId: "f2-manifiesto-0001", bootstrapAdminEmail: "admin@ruizmier.com", snapshot,
  inputs: Object.fromEntries(["clients", "contacts", "staff", "users", "rates", "services"].map((name) => [name, abs(`${name}.csv`)])), ...extra,
});
const f3Raw = (snapshot: string, environment = "local"): any => ({
  schemaVersion: 1, environment, expectedProjectRef: environment === "local" ? "local" : "slkqdcwwvmjtcbakajib", supabaseUrl: environment === "local" ? "http://127.0.0.1:54321" : "https://slkqdcwwvmjtcbakajib.supabase.co",
  installationId: "f3-manifiesto-0001", snapshot, technicalAdminId: "00000000-0000-4000-8000-000000000000",
  inputs: Object.fromEntries(["clientEngagements", "planHours", "expenses", "payments", "administrativeEngagements", "executions"].map((name) => [name, abs(`${name}.csv`)])),
  f2StateDir: abs("f2"), f2ServicesFile: abs("services.csv"), f2ClientsFile: abs("clients.csv"),
});

describe("manifiesto por snapshot", () => {
  it("el manifiesto del 23/10 reproduce EXACTAMENTE los valores fijos de antes (regresión)", () => {
    const m = loadSnapshotManifest(OLD);
    expect(m.f2).toEqual(EXPECTED);
    expect(m.f3).toMatchObject({ clientEngagements: 124, administrativeEngagements: 10, selectorProfiles: 138, matrices: 124, workOrders: 124, engagementsTotal: 134, risks: 124 });
    expect(m.f3.expenses).toEqual({ positive: 75, zero: 545, totalUnits: "9207900" });
    expect(m.f3.payments).toEqual({ plans: 124, rows: 281, billable: 277, notes: 4 });
    expect(m.planNotes).toEqual(["2026.22.002|13", "2026.22.003|13", "2026.22.005|13", "2026.22.007|13"]);
    expect(m.f3.endDates.byYear).toEqual({ "2026": "2026-11-15", "2027": "2027-09-30" });
    expect(m.f3.endDates.counts).toEqual({ "2026-11-15": 109, "2027-09-30": 15 });
    expect(m.preflight.executionDeadline).toBe("2026-11-15"); expect(m.dates.staffCut).toBe("2026-10-23");
    expect(m.invoicedInstallments).toEqual([]); expect(m.toleranceCots).toEqual([]);
  });

  it("el manifiesto del 06/11 declara las cifras definitivas de la guía y del CSV v3 (solo quedan null los controles que ya no aplican)", () => {
    const m = loadSnapshotManifest(FINAL);
    expect(m.f2).toMatchObject({ clients: 269, staff: 167, users: 167, rates: 15, services: 46, activeStaff: 151, inactiveStaff: 16 });
    expect(m.f2.contacts).toBe(347); expect(m.f2.schedulableStaff).toBe(159);
    expect(m.bak).toEqual({ file: "DB_EMS_V1_6NOV26_1600_FINAL.bak", sha256: "ff8f5d4f1c41333111347beeceaa9a7fb80ec3e77d101e1c77af1062cb8291a9", takenAt: "2026-11-06T16:03" });
    expect(m.f3.selectorProfiles).toBeNull(); expect(m.dates.adminWindowFrom).toBeNull(); expect(m.dates.adminWindowTo).toBeNull(); // sin selector ni ventana de horas administrativas (D1, D36)
    expect(m.f3).toMatchObject({ clientEngagements: 155, administrativeEngagements: 107, matrices: 155, workOrders: 155, engagementsTotal: 262, risks: 155 });
    expect(m.f3.engagementsTotal).toBe(m.f3.clientEngagements! + m.f3.administrativeEngagements!);
    expect(m.f3.riskLevels).toEqual({ Bajo: 137, Moderado: 18, Alto: 0 }); expect(m.f3.expenses).toEqual({ positive: 85, zero: 690, totalUnits: 9595900 });
    expect(m.f3.payments).toEqual({ plans: 155, rows: 428, billable: 414, notes: 14 }); expect(m.f3.payments.billable! + m.f3.payments.notes!).toBe(m.f3.payments.rows);
    expect(m.planNotes).toHaveLength(14); expect(m.invoicedInstallments).toHaveLength(27); expect(m.toleranceCots).toEqual(["2024.22.002"]);
    expect(m.f3.endDates.allowed).toEqual(["2026-11-30", "2027-09-30"]); expect(m.f3.endDates.counts).toEqual({ "2026-11-30": 45, "2027-09-30": 110 });
    expect(Object.values(m.f3.endDates.counts!).reduce((a: number, b: number) => a + b, 0)).toBe(m.f3.clientEngagements);
    expect(m.dates).toMatchObject({ staffCut: "2026-11-06", fy2026End: "2026-11-30" }); expect(m.preflight.executionDeadline).toBe("2026-11-30");
    // Las cuotas facturadas no pueden ser notas del plan.
    expect(m.invoicedInstallments.some((key: string) => m.planNotes.includes(key))).toBe(false);
  });

  it("calcula el sha256 del archivo y lo congela", () => {
    const m = loadSnapshotManifest(FINAL);
    expect(m.sha256).toMatch(/^[a-f0-9]{64}$/); expect(loadSnapshotManifest(FINAL).sha256).toBe(m.sha256); expect(loadSnapshotManifest(OLD).sha256).not.toBe(m.sha256);
    expect(Object.isFrozen(m)).toBe(true); expect(Object.isFrozen(m.f3.payments)).toBe(true);
  });

  it("sin manifiesto, con nombre inválido o con forma incorrecta la configuración no es válida", () => {
    expect(() => loadSnapshotManifest("TimeControlDB_20990101_0000")).toThrow(/sin manifiesto aprobado/);
    expect(() => loadSnapshotManifest("../secretos")).toThrow(/nombre de snapshot inválido/);
    const dir = mkdtempSync(path.join(os.tmpdir(), "etl-manifest-"));
    writeFileSync(path.join(dir, "X.json"), "{no es json");
    expect(() => loadSnapshotManifest("X", { dir })).toThrow(/JSON inválido/);
    writeFileSync(path.join(dir, "Y.json"), JSON.stringify({ snapshot: "OTRO" }));
    expect(() => loadSnapshotManifest("Y", { dir })).toThrow(/no coincide con el nombre/);
    const ok = JSON.parse(JSON.stringify(loadSnapshotManifest(FINAL)));
    expect(() => validateManifestShape({ ...ok, f2: { ...ok.f2, clients: "269" } }, FINAL)).toThrow(/f2.clients/);
    expect(() => validateManifestShape({ ...ok, planNotes: ["2026.22.002"] }, FINAL)).toThrow(/planNotes/);
    expect(() => validateManifestShape({ ...ok, toleranceCots: ["x"] }, FINAL)).toThrow(/toleranceCots/);
    expect(() => validateManifestShape({ ...ok, f3: { ...ok.f3, endDates: { ...ok.f3.endDates, counts: { "2030-01-01": 1 } } } }, FINAL)).toThrow(/endDates.counts/);
  });

  it("null = sin declarar: en local no se aplica el control; fuera de local bloquea", () => {
    expect(declared("local", null, "f2.contacts")).toBeNull(); expect(declared("local", 7, "x")).toBe(7);
    expect(() => declared("test", null, "f2.contacts")).toThrow(SnapshotManifestError); expect(() => declared("production", undefined, "x")).toThrow(/sin declarar/);
    expect(matchesDeclared("local", null, 5, "x")).toBe(true); expect(matchesDeclared("test", 5, 5, "x")).toBe(true); expect(matchesDeclared("test", 5, 6, "x")).toBe(false);
  });

  it("el fin de vigencia sale del CSV y debe estar permitido; los conteos 45/110 se comprueban", () => {
    const { endDates } = loadSnapshotManifest(FINAL).f3;
    expect(resolveEndDate({ legacy_cot: "a", gestion: "2026", ems_end_date: "2026-11-30" }, endDates)).toBe("2026-11-30");
    expect(() => resolveEndDate({ legacy_cot: "a", gestion: "2026", ems_end_date: "2026-11-15" }, endDates)).toThrow(/no permitido/);
    expect(() => resolveEndDate({ legacy_cot: "a", gestion: "2026", ems_end_date: "" }, endDates)).toThrow(/no resuelto/);
    const ok = [...Array(45).fill("2026-11-30"), ...Array(110).fill("2027-09-30")];
    expect(() => assertEndDateCounts(ok, endDates, "test")).not.toThrow();
    expect(() => assertEndDateCounts([...Array(46).fill("2026-11-30"), ...Array(109).fill("2027-09-30")], endDates, "test")).toThrow(/fuera del manifiesto/);
    expect(() => assertEndDateCounts(ok.slice(1), endDates, "local")).toThrow(/fuera del manifiesto/);
    expect(() => assertEndDateCounts(["2026-11-15"], { ...endDates, counts: null }, "test")).toThrow(/sin declarar/);
    expect(() => assertEndDateCounts(["2026-11-15"], { ...endDates, counts: null }, "local")).not.toThrow();
  });
});

describe("configuración F2 y F3 con manifiesto", () => {
  it("F2 y F3 cargan el manifiesto de su snapshot y exponen su sha256 sin cambiar el configHash", () => {
    const f2 = parseF2Config(f2Raw(OLD)); expect(f2.manifest.snapshot).toBe(OLD); expect(f2.expectations).toEqual(EXPECTED);
    const f3 = parseF3Config(f3Raw(OLD)); expect(f3.manifest.sha256).toBe(f2.manifest.sha256);
    // El manifiesto no entra en el configHash: el mismo raw con otro snapshot sí cambia, pero los journals anteriores siguen leyéndose.
    expect(parseF2Config(f2Raw(OLD)).configHash).toBe(f2.configHash);
    expect(() => parseF2Config(f2Raw("TimeControlDB_20990101_0000"))).toThrow(/sin manifiesto/);
    expect(() => parseF3Config(f3Raw("TimeControlDB_20990101_0000"))).toThrow(/sin manifiesto/);
  });

  it("F2 con el snapshot del 06/11: el manifiesto declara todas las cifras (local y Test las aceptan) y Test no permite alterarlas", () => {
    const local = parseF2Config(f2Raw(FINAL)); expect(local.expectations).toMatchObject({ staff: 167, users: 167, inactiveStaff: 16, contacts: 347, schedulableStaff: 159 });
    const filled = parseF2Config(f2Raw(FINAL, "local", { expectations: { contacts: 365, schedulableStaff: 150 } })); expect(filled.expectations).toMatchObject({ contacts: 365, schedulableStaff: 150 }); // local puede probar otras cifras
    expect(() => parseF2Config(f2Raw(FINAL, "test"))).not.toThrow();
    expect(() => parseF2Config(f2Raw(FINAL, "test", { expectations: { contacts: 365 } }))).toThrow(/alterar expectations/);
  });

  it("F3 con el snapshot del 06/11 admite local y expone las cifras de 155 OT y 262 encargos", () => {
    const f3 = parseF3Config(f3Raw(FINAL)); expect(f3.manifest.f3.clientEngagements).toBe(155); expect(f3.manifest.f3.engagementsTotal).toBe(262);
  });
});

describe("contactos F2 (D23/D25): varios por cliente, solo el nombre es obligatorio", () => {
  const clients = [{ source_ref: "legacy:1" }, { source_ref: "legacy:2" }];
  const contact = (ref: string, name: string, email = "", phone = "") => ({ client_source_ref: ref, contact_type: "general", full_name: name, email, phone, is_active: "true", source_cot: "x", source_created_at: "2026-01-01" });
  const opts = { expected: { ...EXPECTED, contacts: null }, enforceExpected: true };

  it("acepta varios contactos distintos por cliente, celdas vacías y «Línea corporativa»", () => {
    const rows = [contact("legacy:1", "Ana Pérez", "ana@ejemplo.com", "70000001"), contact("legacy:1", "Luis Soliz", "", "70000002"), contact("legacy:1", "Línea corporativa", "", "22223333"), contact("legacy:2", "Solo Nombre")];
    expect(validateContacts(rows, clients, opts)).toHaveLength(4);
    expect(HEADERS.contacts).not.toContain("contact_role");
  });

  it("rechaza nombre vacío, espacios sobrantes, huérfanos, tipos distintos de general y el mismo contacto repetido en un cliente", () => {
    expect(() => validateContacts([contact("legacy:1", "")], clients, opts)).toThrow(/nombre es obligatorio/);
    expect(() => validateContacts([contact("legacy:1", " Ana")], clients, opts)).toThrow(/espacios sobrantes/);
    expect(() => validateContacts([contact("legacy:1", "Ana", "", " ")], clients, opts)).toThrow(/espacios sobrantes/);
    expect(() => validateContacts([contact("legacy:9", "Ana")], clients, opts)).toThrow(/huérfano/);
    expect(() => validateContacts([{ ...contact("legacy:1", "Ana"), contact_type: "cobranza" }], clients, opts)).toThrow(/inválida/);
    expect(() => validateContacts([contact("legacy:1", "Ana Pérez"), contact("legacy:1", "ANA PEREZ.")], clients, opts)).toThrow(/repetido/);
    // El mismo nombre en otro cliente es otro contacto.
    expect(() => validateContacts([contact("legacy:1", "Ana Pérez"), contact("legacy:2", "Ana Pérez")], clients, opts)).not.toThrow();
  });

  it("«Línea corporativa» exige teléfono o correo; sin ninguno de los dos no se crea", () => {
    expect(() => validateContacts([contact("legacy:1", "Línea corporativa")], clients, opts)).toThrow(/sin teléfono ni correo/);
    expect(() => validateContacts([contact("legacy:1", "Línea corporativa", "info@ejemplo.com")], clients, opts)).not.toThrow();
  });

  it("un cliente reservado coincide con sus N contactos en cualquier orden y con las celdas vacías como NULL", () => {
    const row: any = { source_ref: "legacy:1", client_legal_name: "Cliente", tax_id: "1" };
    const persisted = (contacts: object[]) => ({ client_legal_name: "Cliente", tax_id: "1", parent_client_id: null, industry_id: null, is_active: true, contacts });
    const a = { full_name: "Ana", email: "a@x.com", phone: null }; const b = { full_name: "Línea corporativa", email: null, phone: "222" };
    const csv = [{ full_name: "Línea corporativa", email: "", phone: "222" }, { full_name: "Ana", email: "a@x.com", phone: "" }];
    expect(reservedClientMatches(persisted([a, b]), row, csv, null, null)).toBe(true);
    expect(reservedClientMatches(persisted([a]), row, csv, null, null)).toBe(false);
    expect(reservedClientMatches(persisted([a, { ...b, phone: "999" }]), row, csv, null, null)).toBe(false);
    expect(reservedClientMatches(persisted([]), row, [], null, null)).toBe(true);
  });

  it("el conteo esperado se aplica solo si está declarado", () => {
    const rows = [contact("legacy:1", "Ana"), contact("legacy:2", "Luis")];
    expect(() => validateContacts(rows, clients, { expected: { ...EXPECTED, contacts: 2 }, enforceExpected: true })).not.toThrow();
    expect(() => validateContacts(rows, clients, { expected: { ...EXPECTED, contacts: 3 }, enforceExpected: true })).toThrow(Fase2InputError);
    expect(() => validateContacts(rows, clients, opts)).not.toThrow();
  });

  it("criterio «email-first» (parametrizable): por correo válido; sin correo, por nombre salvo que ya esté en un contacto con correo", () => {
    expect(CONTACT_CRITERIA).toEqual(["name", "email-first", "channel"]);
    const same = [contact("legacy:1", "Ana Pérez", "ana@x.com"), contact("legacy:1", "A. Pérez", "ANA@x.com")];
    // Por nombre son dos personas; por correo, una.
    expect(duplicateContacts(same, "name")).toHaveLength(0); expect(duplicateContacts(same, "email-first")).toHaveLength(1);
    // Sin correo: el mismo nombre que un contacto con correo del cliente es ese contacto; otro nombre sin correo es un contacto distinto.
    const noMail = [contact("legacy:1", "Ana Pérez", "ana@x.com"), contact("legacy:1", "ANA PEREZ", "", "70000001"), contact("legacy:1", "Luis Soliz", "", "70000002")];
    expect(duplicateContacts(noMail, "name")).toHaveLength(1); expect(duplicateContacts(noMail, "email-first")).toHaveLength(1);
    expect(duplicateContacts(noMail, "email-first")[0].reason).toMatch(/ya está en un contacto con correo/);
    // Dos sin correo con el mismo nombre se repiten; el mismo correo en otro cliente no.
    expect(duplicateContacts([contact("legacy:1", "Luis", "", "1"), contact("legacy:1", "luis", "", "2")], "email-first")).toHaveLength(1);
    expect(duplicateContacts([contact("legacy:1", "Ana", "a@x.com"), contact("legacy:2", "Ana", "a@x.com")], "email-first")).toHaveLength(0);
    expect(() => duplicateContacts(same, "otro")).toThrow(/criterio de contacto distinto desconocido/);
    // El validador acepta el criterio como opción; por defecto es «channel» (D23, cerrado el 11/11/2026).
    expect(() => validateContacts(same, clients, { ...opts, contactCriterion: "name" })).not.toThrow();
    expect(() => validateContacts(same, clients, opts)).toThrow(/criterio channel/);
    expect(() => validateContacts(same, clients, { ...opts, contactCriterion: "email-first" })).toThrow(/criterio email-first/);
  });

  it("criterio «channel» (VIGENTE, D23 cerrado 11/11): el contacto es el canal; un correo con varios nombres es uno; un nombre con varios canales son varios", () => {
    // Un correo con tres grafías del nombre = UN contacto (los otros dos se rechazan como repetidos).
    const grafias = [contact("legacy:26", "Luis Roberto Pérez Arrázola", "roberto.perez@t.com"), contact("legacy:26", "Perez Roberto", "roberto.perez@t.com"), contact("legacy:26", "Roberto PEREZ", "ROBERTO.PEREZ@t.com")];
    expect(duplicateContacts(grafias, "channel")).toHaveLength(2);
    // Un nombre con dos correos (o dos teléfonos) = un contacto por cada canal, con el mismo nombre.
    expect(duplicateContacts([contact("legacy:8", "Miluska Villafuerte", "m_v@c.com"), contact("legacy:8", "Miluska Villafuerte", "v@c.com")], "channel")).toHaveLength(0);
    expect(duplicateContacts([contact("legacy:9", "Ana Almendras", "", "78888687"), contact("legacy:9", "Ana Almendras", "", "70000000")], "channel")).toHaveLength(0);
    // Un teléfono que ya viaja en un contacto con correo del mismo cliente no es otro contacto; uno distinto, sí.
    const conTel = [contact("legacy:1", "Ana Pérez", "ana@x.com", "70000001"), contact("legacy:1", "Ana Pérez", "", "70000001"), contact("legacy:1", "Ana Pérez", "", "70000009")];
    expect(duplicateContacts(conTel, "channel")).toHaveLength(1);
    // Una fila solo con nombre no es contacto si ese nombre ya está en un contacto con correo o teléfono; otro nombre, sí.
    const soloNombre = [contact("legacy:1", "Ana Pérez", "ana@x.com"), contact("legacy:1", "ANA PEREZ"), contact("legacy:1", "Luis Soliz")];
    expect(duplicateContacts(soloNombre, "channel")).toHaveLength(1);
    expect(duplicateContacts([contact("legacy:1", "Luis"), contact("legacy:2", "Luis")], "channel")).toHaveLength(0);
  });

  it("el criterio de «contacto distinto» es una función aislada: nombre sin acentos, signos ni mayúsculas", () => {
    expect(contactIdentityKey("  José  Ñandú, S.R.L. ")).toBe("jose nandu s r l"); expect(contactIdentityKey("ANA PEREZ.")).toBe(contactIdentityKey("Ana Pérez")); expect(contactIdentityKey("")).toBe("");
  });
});
