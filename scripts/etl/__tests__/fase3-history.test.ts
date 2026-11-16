import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFiscalWeekNumber } from "../../../src/lib/fiscalCalculations";
import { loadHistoricHours } from "../fase3.mjs";
import { APPROVAL_HEADERS, Fase3InputError, assertHistoryAnchors, historyContract, validateExecutionApprovals } from "../fase3-input.mjs";
import { approvalsByExecution, buildHistoryBlueprint, fiscalWeekNumber, historyPayload, legacyDatetimeToIso, mondayOf, periodYear } from "../fase3-history.mjs";
import { SnapshotManifestError, loadSnapshotManifest, manifestContract, manifestOrigin, validateManifestShape } from "../snapshot-manifest.mjs";

// D41 Parte I (13/11/2026): horas históricas aprobadas dentro de EMS (períodos cerrados, entradas vinculadas, líneas approved con aprobador/fecha reales).
const BATCH = "legacy:TimeControlDB_20261106_1600:d41";

describe("D41: semana fiscal canónica y zona horaria", () => {
  it("la semana fiscal del ETL es idéntica a getFiscalWeekNumber de EMS para todos los lunes de 2020 a 2030 (el año del período es el del lunes)", () => {
    const monday = new Date(Date.UTC(2020, 0, 6)); let checked = 0;
    while (monday.getUTCFullYear() < 2031) {
      const iso = monday.toISOString().slice(0, 10); const [y, m, d] = iso.split("-").map(Number);
      expect(fiscalWeekNumber(iso), iso).toBe(getFiscalWeekNumber(new Date(y, m - 1, d)));
      expect(periodYear(iso)).toBe(y); expect(mondayOf(iso)).toBe(iso); checked += 1;
      monday.setUTCDate(monday.getUTCDate() + 7);
    }
    expect(checked).toBeGreaterThan(540);
    // fines de semana y días intermedios caen en el lunes de su semana
    expect(mondayOf("2026-06-04")).toBe("2026-06-01"); expect(mondayOf("2026-06-07")).toBe("2026-06-01"); expect(mondayOf("2026-06-08")).toBe("2026-06-08");
    // semana de cambio de año fiscal: el lunes 28/09/2026 abre el FY2027 (1 de octubre de 2026 es jueves)
    expect(fiscalWeekNumber("2026-09-28")).toBe(1); expect(fiscalWeekNumber("2026-09-21")).toBe(52);
  });
  it("interpreta el datetime del legacy como America/La_Paz (UTC-4) sin alterar el valor original; vacío = null; un formato raro bloquea", () => {
    expect(legacyDatetimeToIso("2026-05-19 11:11:12")).toBe("2026-05-19T11:11:12-04:00");
    expect(Date.parse(legacyDatetimeToIso("2026-05-19 11:11:12")!)).toBe(Date.parse("2026-05-19T15:11:12Z"));
    expect(legacyDatetimeToIso("")).toBeNull(); expect(legacyDatetimeToIso(null)).toBeNull();
    expect(() => legacyDatetimeToIso("19/05/2026 11:11")).toThrow(/inválida/);
  });
});

// Fixture: S1 (perfil 7) trabaja jueves y viernes en C1 (10 h en la semana: semana PARCIAL); S2 (perfil 8, ya de baja) 4,5 h. Aprueba S2 las de S1 y S1 las de S2.
const staffByLegacyProfile = new Map([["7", "S1"], ["8", "S2"]]);
const entry = (id: string, staffId: string, date: string, hours: string, exec: string, activityId = "AUD-A3", engagementId = "E1") => ({ sourceKey: `${exec}:${activityId}:1`, timeId: `t-${id}`, dateWorked: date, hours, staffId, engagementId, activityId, etlSplitIndex: 1, isForecast: false, periodId: null, sourceAllocations: [{ legacy_execution_id: exec, hours }] });
const entries = [entry("1", "S1", "2026-06-04", "8", "e1"), entry("2", "S1", "2026-06-05", "2", "e2"), entry("3", "S2", "2026-06-04", "4.5", "e3")];
const approvalRows = [
  { legacy_approval_id: "1", legacy_execution_id: "e1", legacy_approver_profile_id: "8", legacy_approved_at: "2026-06-10 10:00:00" },
  { legacy_approval_id: "2", legacy_execution_id: "e2", legacy_approver_profile_id: "8", legacy_approved_at: "2026-06-12 18:30:00" },
  { legacy_approval_id: "3", legacy_execution_id: "e3", legacy_approver_profile_id: "7", legacy_approved_at: "2026-06-11 09:30:00" },
];
const build = (overrides: Record<string, unknown> = {}) => buildHistoryBlueprint({ entries, approvalByExecution: approvalsByExecution(approvalRows), staffByLegacyProfile, ...overrides });

describe("D41: blueprint de períodos y líneas aprobadas", () => {
  it("una semana PARCIAL de 10 h queda como un período con esas 10 h (no se completan ni se piden 40) y una línea aprobada", () => {
    const bp = build();
    expect(bp.periods).toHaveLength(2); expect(bp.lines).toHaveLength(2); expect(bp.entries).toHaveLength(3);
    const p1 = bp.periods.find((p: { staffId: string }) => p.staffId === "S1")!;
    expect(p1).toMatchObject({ weekStart: "2026-06-01", totalHours: "10", entries: 2, weekNumber: getFiscalWeekNumber(new Date(2026, 5, 1)), year: 2026 });
    expect(bp.lines.find((l: { periodId: string }) => l.periodId === p1.periodId)).toMatchObject({ hours: "10", entries: 2, activityId: "AUD-A3" });
    expect(bp.entries.every((e: { periodId: string | null }) => e.periodId)).toBe(true);
    expect(bp.evidence).toMatchObject({ periods: 2, lines: 2, entries: 3, hours: "14.5" });
  });
  it("aprobador y fecha reales: perfil → ficha de F2, fecha en La Paz y, con varias fechas del mismo aprobador, la más reciente; los casos atípicos quedan documentados", () => {
    const staffInfo = new Map([["S1", { active: true, terminationDate: null }], ["S2", { active: false, terminationDate: "2026-06-01" }]]);
    const engagementApprover = new Map([["E1", "S1"]]); // EMS asignaría a S1: el aprobador real (S2) difiere y se conserva igual
    const bp = build({ staffInfo, engagementApprover });
    const line = bp.lines.find((l: { periodKey: string }) => l.periodKey.startsWith("S1|"))!;
    expect(line).toMatchObject({ approvedBy: "S2", approvedAtLegacy: "2026-06-12 18:30:00", approvedAt: "2026-06-12T18:30:00-04:00", legacyApproverProfile: "8" });
    expect(bp.evidence).toMatchObject({ approversDistinct: 2, linesWithMultipleApprovalDays: 1, linesWithMultipleApprovalTimestamps: 1, approverInactiveLines: 1, approverInactivePeople: 1, approvedAfterApproverTermination: 1, approverDiffersFromEmsApprover: 1, selfApproved: 0, approverWithoutStaff: 0, approvalsWithoutApprover: 0, approvalsWithoutDate: 0 });
    // autoaprobación y aprobación anterior al último día trabajado se cuentan, no se corrigen
    const self = build({ approvalByExecution: approvalsByExecution([{ ...approvalRows[0], legacy_approver_profile_id: "7", legacy_approved_at: "2026-06-04 06:00:00" }, { ...approvalRows[1], legacy_approver_profile_id: "7", legacy_approved_at: "2026-06-04 07:00:00" }, approvalRows[2]]) });
    expect(self.evidence).toMatchObject({ selfApproved: 1, approvedBeforeLastWorkedDay: 1 });
  });
  it("sin evidencia NO se atribuye a nadie: aprobador o fecha vacíos quedan NULL (nunca el administrador); un perfil sin ficha EMS queda NULL y se cuenta; más de un aprobador bloquea", () => {
    const blank = build({ approvalByExecution: approvalsByExecution(approvalRows.map((r) => ({ ...r, legacy_approver_profile_id: "", legacy_approved_at: "" }))) });
    expect(blank.lines.every((l: { approvedBy: unknown; approvedAt: unknown }) => l.approvedBy === null && l.approvedAt === null)).toBe(true);
    expect(blank.evidence).toMatchObject({ approvalsWithoutApprover: 2, approvalsWithoutDate: 2 });
    const unmapped = build({ approvalByExecution: approvalsByExecution(approvalRows.map((r) => ({ ...r, legacy_approver_profile_id: "999" }))) });
    expect(unmapped.lines.every((l: { approvedBy: unknown }) => l.approvedBy === null)).toBe(true); expect(unmapped.evidence.approverWithoutStaff).toBe(2);
    expect(() => build({ approvalByExecution: approvalsByExecution([approvalRows[0], { ...approvalRows[1], legacy_approver_profile_id: "7" }, approvalRows[2]]) })).toThrow(/más de un aprobador/);
    expect(() => build({ approvalByExecution: approvalsByExecution([approvalRows[0], approvalRows[1]]) })).toThrow(/sin aprobación/);
    expect(JSON.stringify(blank)).not.toMatch(/admin/i);
  });
  it("el perfil 89 se absorbe en el 62 y las identidades reservadas se conservan entre cálculos", () => {
    const withAlias = build({ staffByLegacyProfile: new Map([["7", "S1"], ["8", "S2"], ["62", "S2"]]), approvalByExecution: approvalsByExecution(approvalRows.map((r) => (r.legacy_approver_profile_id === "8" ? { ...r, legacy_approver_profile_id: "89" } : r))) });
    expect(withAlias.lines.find((l: { periodKey: string }) => l.periodKey.startsWith("S1|")).approvedBy).toBe("S2");
    const first = build(); const reserved = { periods: new Map(first.periods.map((p: { key: string; periodId: string }) => [p.key, p.periodId])), lines: new Map(first.lines.map((l: { key: string; approvalId: string }) => [l.key, l.approvalId])) };
    const second = build({ reserved });
    expect(second.periods.map((p: { periodId: string }) => p.periodId)).toEqual(first.periods.map((p: { periodId: string }) => p.periodId));
    expect(second.lines.map((l: { approvalId: string }) => l.approvalId)).toEqual(first.lines.map((l: { approvalId: string }) => l.approvalId));
  });
  it("el payload de la función no lleva datos personales y trae el vínculo de cada entrada", () => {
    const payload = historyPayload(build());
    expect(payload.periods[0]).toEqual(expect.objectContaining({ weekStart: expect.any(String), weekNumber: expect.any(Number), year: 2026, totalHours: expect.any(String) }));
    expect(payload.entries.every((e: { periodId: string }) => typeof e.periodId === "string")).toBe(true);
    expect(payload.lines.every((l: { approvedAt: string | null }) => l.approvedAt === null || l.approvedAt.endsWith("-04:00"))).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/@|legacy_/);
  });
});

describe("D41: archivo lateral de aprobaciones (unicidad y cobertura)", () => {
  const executions = [["e1", "1"], ["e2", "2"], ["e3", "3"]].map(([id, approval]) => ({ legacy_execution_id: id, legacy_approval_id: approval, approval_evidence_count: "1", approved_evidence_count: "1", legacy_pending_approval: "0", disposition: "migrable_aprobada" }));
  it("cabeceras y cobertura 1:1 con las horas aprobadas que migran", () => {
    expect(APPROVAL_HEADERS).toEqual(["legacy_approval_id", "legacy_execution_id", "legacy_approver_profile_id", "legacy_approved_at"]);
    expect(() => validateExecutionApprovals(approvalRows, executions)).not.toThrow();
    expect(() => validateExecutionApprovals([...approvalRows, { ...approvalRows[0] }], executions)).toThrow(/repetidos/);
    expect(() => validateExecutionApprovals(approvalRows.slice(0, 2), executions)).toThrow(Fase3InputError);
    expect(() => validateExecutionApprovals(approvalRows.slice(0, 2), executions)).toThrow(/sin aprobación 3/);
    expect(() => validateExecutionApprovals([...approvalRows, { legacy_approval_id: "9", legacy_execution_id: "x", legacy_approver_profile_id: "7", legacy_approved_at: "2026-01-01 00:00:00" }], executions)).toThrow(/trae 4 aprobaciones para 3/);
    expect(() => validateExecutionApprovals([{ ...approvalRows[0], legacy_execution_id: "otra" }, approvalRows[1], approvalRows[2]], executions)).toThrow(/idEjecucionHoras distinto/);
    expect(() => validateExecutionApprovals([{ ...approvalRows[0], legacy_approved_at: "10/06/2026" }, approvalRows[1], approvalRows[2]], executions)).toThrow(/fecha inválida/);
  });
  it("un aprobador o una fecha vacíos NO bloquean (quedan NULL): la ausencia de evidencia se conserva, no se rellena", () => {
    expect(() => validateExecutionApprovals(approvalRows.map((r) => ({ ...r, legacy_approver_profile_id: "", legacy_approved_at: "" })), executions)).not.toThrow();
  });
});

describe("D41: manifiesto variante y anclajes", () => {
  const VARIANT = "TimeControlDB_20261106_1600_d41"; const CURRENT = "TimeControlDB_20261106_1600"; const OLD = "TimeControlDB_20261023_1200";
  it("distingue respaldo de origen, identificador del manifiesto y contrato; el manifiesto actual y el del 23/10 no cambian", () => {
    const d41 = loadSnapshotManifest(VARIANT); const current = loadSnapshotManifest(CURRENT); const old = loadSnapshotManifest(OLD);
    expect(d41.snapshot).toBe(VARIANT); expect(manifestOrigin(d41)).toBe(CURRENT); expect(manifestContract(d41)).toBe("D41");
    expect(manifestOrigin(current)).toBe(CURRENT); expect(manifestContract(current)).toBe("legacy"); expect(manifestContract(old)).toBe("legacy"); expect(manifestOrigin(old)).toBe(OLD);
    expect(d41.bak).toEqual(current.bak); // el respaldo físico es el mismo
    expect(d41.f3.hours).toMatchObject({ contract: "D41", rows: 18799, entries: 21229, history: { batch: BATCH, timeZone: "America/La_Paz", periods: 2736, lines: 8507, entriesLinked: 21229, approvals: { rows: 18799 } } });
    expect(historyContract(d41)).toEqual(d41.f3.hours.history); expect(historyContract(current)).toBeNull(); expect(historyContract(old)).toBeNull();
    // fuera de f3.hours y origin, el variante es idéntico al actual (mismas cifras de F2 y F3)
    expect({ ...d41.f3, hours: undefined }).toEqual({ ...current.f3, hours: undefined }); expect(d41.f2).toEqual(current.f2); expect(d41.dates).toEqual(current.dates);
  });
  it("la forma valida contract/history y origin, y rechaza lo mal formado", () => {
    const raw = JSON.parse(JSON.stringify(loadSnapshotManifest(VARIANT)));
    expect(() => validateManifestShape(raw, VARIANT)).not.toThrow();
    const bad = (hours: Record<string, unknown>) => () => validateManifestShape({ ...raw, f3: { ...raw.f3, hours: { ...raw.f3.hours, ...hours } } }, VARIANT);
    expect(bad({ contract: "D42" })).toThrow(/f3\.hours inválido/);
    expect(bad({ history: undefined })).toThrow(/f3\.hours inválido/);
    expect(bad({ history: { ...raw.f3.hours.history, batch: "legacy:X" } })).toThrow(/f3\.hours inválido/);
    expect(bad({ history: { ...raw.f3.hours.history, timeZone: "UTC" } })).toThrow(/f3\.hours inválido/);
    expect(bad({ history: { ...raw.f3.hours.history, approvals: { rows: 1, sha256: "no" } } })).toThrow(/f3\.hours inválido/);
    expect(() => validateManifestShape({ ...raw, origin: { database: "con espacio" } }, VARIANT)).toThrow(/origin\.database/);
    // sin contract no puede haber history
    expect(() => validateManifestShape({ ...raw, f3: { ...raw.f3, hours: { ...raw.f3.hours, contract: undefined } } }, VARIANT)).toThrow(/f3\.hours inválido/);
  });
  it("assertHistoryAnchors: períodos, líneas, entradas vinculadas y filas del archivo; null = sin declarar (local omite; Test y producción bloquean)", () => {
    const history = loadSnapshotManifest(VARIANT).f3.hours.history; const ok = { periods: 2736, lines: 8507, entriesLinked: 21229, approvals: 18799 };
    expect(() => assertHistoryAnchors(ok, history, "test")).not.toThrow();
    expect(() => assertHistoryAnchors({ ...ok, lines: 8506 }, history, "test")).toThrow(/lines: 8506 de 8507/);
    expect(() => assertHistoryAnchors({ ...ok, periods: 1, entriesLinked: 2 }, history, "local")).toThrow(Fase3InputError);
    expect(() => assertHistoryAnchors(ok, undefined, "test")).not.toThrow();
    const sinDeclarar = { ...history, periods: null }; expect(() => assertHistoryAnchors(ok, sinDeclarar, "local")).not.toThrow(); expect(() => assertHistoryAnchors(ok, sinDeclarar, "test")).toThrow(SnapshotManifestError);
  });
});

// ── Cargador con recuperación (base falsa en memoria) ────────────────────────────────────────────────────────────────────────────
describe("D41: cargador de horas aprobadas (loadHistoricHours)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "f3-d41-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const manifest = { snapshot: "TimeControlDB_20261106_1600_d41", f3: { hours: { contract: "D41", history: { batch: BATCH, timeZone: "America/La_Paz", periods: 2, lines: 2, entriesLinked: 3, approvals: { rows: 3, sha256: null } } } } };
  const makeDb = () => {
    const store = { entries: new Map<string, any>(), periods: new Map<string, any>(), lines: new Map<string, any>(), extraPeriods: 0, foreign: 0 };
    const db = {
      hourSnapshot: vi.fn(async ({ entries: rows }: { entries: { timeId: string }[] }) => ({ entries: rows.filter((r) => store.entries.has(r.timeId)).map((r) => store.entries.get(r.timeId)) })),
      historySnapshot: vi.fn(async ({ periodIds, approvalIds }: { periodIds: string[]; approvalIds: string[] }) => ({ periods: periodIds.filter((id) => store.periods.has(id)).map((id) => store.periods.get(id)), lines: approvalIds.filter((id) => store.lines.has(id)).map((id) => store.lines.get(id)), batchForeign: store.foreign, periodsTotal: store.periods.size + store.extraPeriods, linesTotal: store.lines.size })),
      createHistoricTimesheets: vi.fn(async ({ batch, periods, entries: rows, lines }: any) => {
        for (const p of periods) store.periods.set(p.periodId, { ...p, locked: true, submitted: true, batch, imported: true });
        for (const e of rows) store.entries.set(e.timeId, { ...e, hours: e.hours, etlSplitIndex: 1, isForecast: false });
        for (const l of lines) store.lines.set(l.approvalId, { ...l, status: "approved" });
        return { periods: periods.length, entries: rows.length, lines: lines.length, batch };
      }),
    };
    return { db, store };
  };
  const makeCtx = (db: unknown, journal: Record<string, any> = { units: {} }) => ({ config: { environment: "local", manifest }, journalFile: path.join(dir, "journal.json"), journal, db }) as any;
  const inputs = { clientEngagements: [{ legacy_cot: "C1", legacy_manager_profile_id: "8", legacy_partner_profile_id: "7" }], executionApprovals: approvalRows };
  const shared = () => ({ f2: { staff: { "legacy:7": "S1", "legacy:8": "S2" } }, engagements: new Map([["C1", "E1"]]), staffCatalog: { staff: [{ id: "S1", active: true, terminationDate: null }, { id: "S2", active: false, terminationDate: "2026-06-01" }] }, blueprint: entries.map((e) => ({ ...e })), holidayKept: [] as unknown[] });
  const run = (ctx: any, unit: any = ctx.journal.units["work-orders"] ?? (ctx.journal.units["work-orders"] = {})) => loadHistoricHours(ctx, inputs, unit, shared());

  it("crea períodos cerrados, entradas vinculadas y líneas aprobadas en UNA llamada, reserva las identidades y documenta la evidencia", async () => {
    const { db } = makeDb(); const ctx = makeCtx(db);
    const result = await run(ctx);
    expect(result).toMatchObject({ recovered: false, entries: 3, periods: 2, lines: 2, batch: BATCH });
    expect(db.createHistoricTimesheets).toHaveBeenCalledTimes(1);
    const payload = db.createHistoricTimesheets.mock.calls[0][0];
    expect(payload.batch).toBe(BATCH); expect(payload.periods).toHaveLength(2); expect(payload.entries).toHaveLength(3); expect(payload.lines).toHaveLength(2);
    expect(payload.entries.every((e: { periodId: string }) => payload.periods.some((p: { periodId: string }) => p.periodId === e.periodId))).toBe(true);
    const unit = ctx.journal.units["work-orders"];
    expect(unit.historyPeriods).toHaveLength(2); expect(unit.historyLines).toHaveLength(2); expect(unit.historyBatch).toBe(BATCH); expect(unit.hours).toHaveLength(3);
    expect(unit.historyEvidence).toMatchObject({ periods: 2, lines: 2, approverInactiveLines: 1, approvedAfterApproverTermination: 1, linesWithMultipleApprovalDays: 1 });
  });
  it("repetición y reanudación: con todo ya cargado y exacto no escribe nada (recovered), y conserva los UUID", async () => {
    const { db } = makeDb(); const ctx = makeCtx(db);
    await run(ctx); const ids = JSON.stringify(ctx.journal.units["work-orders"].historyPeriods);
    const again = await run(ctx); expect(again).toMatchObject({ recovered: true, entries: 3, periods: 2, lines: 2 });
    expect(db.createHistoricTimesheets).toHaveBeenCalledTimes(1); expect(JSON.stringify(ctx.journal.units["work-orders"].historyPeriods)).toBe(ids);
    // reanudar con un journal recargado del disco (otra ejecución) da el mismo resultado
    const reloaded = makeCtx(db, JSON.parse(JSON.stringify(ctx.journal))); expect(await run(reloaded)).toMatchObject({ recovered: true });
  });
  it("estado parcial o divergente: se detiene con RECONCILIACION_REQUERIDA y no vuelve a escribir", async () => {
    const { db, store } = makeDb(); const ctx = makeCtx(db); await run(ctx);
    const line = store.lines.values().next().value; line.status = "pending"; // una línea cambió
    await expect(run(ctx)).rejects.toMatchObject({ code: "RECONCILIACION_REQUERIDA" });
    store.lines.clear(); await expect(run(ctx)).rejects.toMatchObject({ code: "RECONCILIACION_REQUERIDA" }); // quedan períodos y entradas sin sus líneas
    expect(db.createHistoricTimesheets).toHaveBeenCalledTimes(1);
  });
  it("un destino con períodos o aprobaciones ajenos al lote bloquea antes de escribir; períodos ajenos con el mismo lote no se adoptan", async () => {
    const a = makeDb(); a.store.extraPeriods = 3; await expect(run(makeCtx(a.db))).rejects.toMatchObject({ code: "BLOQUEADO" }); expect(a.db.createHistoricTimesheets).not.toHaveBeenCalled();
    const b = makeDb(); b.store.foreign = 1; await expect(run(makeCtx(b.db))).rejects.toMatchObject({ code: "RECONCILIACION_REQUERIDA" }); expect(b.db.createHistoricTimesheets).not.toHaveBeenCalled();
  });
  it("si la relectura posterior no coincide con lo escrito, falla cerrado", async () => {
    const { db } = makeDb(); db.createHistoricTimesheets.mockImplementationOnce(async ({ periods, entries: rows, lines }: any) => ({ periods: periods.length, entries: rows.length - 1, lines: lines.length }));
    await expect(run(makeCtx(db))).rejects.toMatchObject({ code: "RECONCILIACION_REQUERIDA" });
  });
  it("si cambia el conjunto permitido: sin efectos se reserva de nuevo conservando los UUID de lo que no cambió; con efectos bloquea", async () => {
    const { db, store } = makeDb(); const ctx = makeCtx(db);
    // 1) primera reserva sin escribir (la base falla al crear)
    db.createHistoricTimesheets.mockRejectedValueOnce(Object.assign(new Error("caída"), { code: "SQL" }));
    await expect(run(ctx)).rejects.toThrow("caída"); const unit = ctx.journal.units["work-orders"]; const periodIds = JSON.stringify(unit.historyPeriods.map((p: { key: string; periodId: string }) => [p.key, p.periodId]));
    unit.hourHash = "otro-hash"; // simula que el conjunto permitido cambió desde la intención durable
    await run(ctx); expect(JSON.stringify(unit.historyPeriods.map((p: { key: string; periodId: string }) => [p.key, p.periodId]))).toBe(periodIds); expect(store.periods.size).toBe(2);
    // 2) con efectos ya escritos, un cambio del conjunto exige reconciliación
    unit.hourHash = "otro-hash-mas"; await expect(run(ctx)).rejects.toMatchObject({ code: "RECONCILIACION_REQUERIDA" });
  });
  it("el manifiesto declara 2 períodos / 2 líneas / 3 entradas: si la historia calculada no coincide, bloquea antes de escribir", async () => {
    const { db } = makeDb(); const ctx = makeCtx(db); ctx.config.manifest = { ...manifest, f3: { hours: { ...manifest.f3.hours, history: { ...manifest.f3.hours.history, periods: 3 } } } };
    await expect(run(ctx)).rejects.toThrow(/historia aprobada fuera del manifiesto/); expect(db.createHistoricTimesheets).not.toHaveBeenCalled();
  });
});
