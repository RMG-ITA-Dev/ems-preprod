import { describe, expect, it } from "vitest";
import { EXECUTION_HEADERS, Fase3InputError, assertExecutionTotals, isMigrableExecution } from "../fase3-input.mjs";
import { SnapshotManifestError, loadSnapshotManifest, validateManifestShape } from "../snapshot-manifest.mjs";

// A-06 / D39 (12/11/2026): las horas aprobadas que migran se anclan en el manifiesto (f3.hours); el corte es el viernes 30/10/2026.
const FINAL = "TimeControlDB_20261106_1600"; const OLD = "TimeControlDB_20261023_1200";
const row = (id: number, cot: string, profile: number, day: string, hours = 8, extra: Record<string, string> = {}): Record<string, string> => ({
  ...Object.fromEntries(EXECUTION_HEADERS.map((header: string) => [header, ""])),
  legacy_execution_id: String(id), legacy_cot: cot, legacy_profile_id: String(profile), legacy_worked_at: day, legacy_hours: String(hours),
  legacy_pending_approval: "0", approval_evidence_count: "1", approved_evidence_count: "1", disposition: "migrable_aprobada", ...extra,
});
// 3 OT, 2 personas, 4 filas, 24,5 h, último día 30/10/2026
const rows = [row(1, "2026.11.001", 10, "2026-10-26"), row(2, "2026.11.001", 11, "2026-10-27", 5.5), row(3, "2026.11.002", 10, "2026-10-29"), row(4, "2026.21.003", 11, "2026-10-30", 0.5 + 2.5 + 0)];
const hours = { rows: 4, total: "24.5", persons: 2, engagements: 3, lastWorkedDay: "2026-10-30" };

describe("horas ancladas en el manifiesto (A-06)", () => {
  it("el manifiesto del 06/11 declara las horas que migran y el corte del 30/10/2026", () => {
    const manifest = loadSnapshotManifest(FINAL);
    expect(manifest.f3.hours).toEqual({ rows: 18799, total: "65470", persons: 146, engagements: 132, lastWorkedDay: "2026-10-30" });
    expect(manifest.f3.hours.lastWorkedDay! < "2026-11-02").toBe(true); // la primera semana de noviembre no entra
  });

  it("el manifiesto del 23/10 no trae horas: el control no aplica (los journals anteriores siguen válidos)", () => {
    expect(loadSnapshotManifest(OLD).f3.hours).toBeUndefined();
    expect(() => assertExecutionTotals(rows, undefined, "test")).not.toThrow();
  });

  it("acepta las horas que cuadran, ignora las no aprobadas y no cuenta dos veces la misma persona u OT", () => {
    expect(() => assertExecutionTotals(rows, hours, "test")).not.toThrow();
    const withRejected = [...rows, row(5, "2026.21.009", 99, "2026-10-28", 8, { approved_evidence_count: "0", disposition: "excluida_no_aprobada" })];
    expect(withRejected.filter(isMigrableExecution)).toHaveLength(4);
    expect(() => assertExecutionTotals(withRejected, hours, "test")).not.toThrow();
  });

  it("un CSV de horas incompleto (por ejemplo, sin una OT) NO pasa aunque coincida consigo mismo", () => {
    const missingOt = rows.filter((r) => r.legacy_cot !== "2026.21.003");
    expect(() => assertExecutionTotals(missingOt, hours, "local")).toThrow(Fase3InputError);
    expect(() => assertExecutionTotals(missingOt, hours, "local")).toThrow(/rows: 3 de 4.*engagements: 2 de 3/);
    expect(() => assertExecutionTotals(rows.slice(0, 2), hours, "test")).toThrow(/total: 13.5 h de 24.5 h/);
  });

  it("rechaza una hora posterior al corte (la primera semana de noviembre no migra)", () => {
    const late = [...rows.slice(0, 3), row(4, "2026.21.003", 11, "2026-11-02", 3)];
    expect(() => assertExecutionTotals(late, hours, "test")).toThrow(/posterior al corte 2026-10-30/);
  });

  it("un valor sin declarar se aplica como los demás controles: en local se omite y en Test y producción bloquea", () => {
    const sinDeclarar = { rows: null, total: null, persons: null, engagements: null, lastWorkedDay: null };
    expect(() => assertExecutionTotals(rows, sinDeclarar, "local")).not.toThrow();
    expect(() => assertExecutionTotals(rows, sinDeclarar, "test")).toThrow(SnapshotManifestError);
    expect(() => assertExecutionTotals(rows, { ...hours, total: null }, "production")).toThrow(/f3\.hours\.total sin declarar/);
  });

  it("la forma del manifiesto valida f3.hours cuando existe", () => {
    const raw = JSON.parse(JSON.stringify(loadSnapshotManifest(FINAL)));
    expect(() => validateManifestShape(raw, FINAL)).not.toThrow();
    expect(() => validateManifestShape({ ...raw, f3: { ...raw.f3, hours: { ...raw.f3.hours, rows: -1 } } }, FINAL)).toThrow(/f3\.hours inválido/);
    expect(() => validateManifestShape({ ...raw, f3: { ...raw.f3, hours: { ...raw.f3.hours, lastWorkedDay: "02/11/2026" } } }, FINAL)).toThrow(/f3\.hours inválido/);
    expect(() => validateManifestShape({ ...raw, f3: { ...raw.f3, hours: { ...raw.f3.hours, total: "mucho" } } }, FINAL)).toThrow(/f3\.hours inválido/);
  });
});
