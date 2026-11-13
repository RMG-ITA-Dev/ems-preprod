// ETL F3 · D41 Parte I: prueba de humo del ADAPTADOR SQL contra el esquema real de la base scratch del harness (la lanza supabase/tests/etl-f3-d41-adapter.sql con `\!`).
// Ejercita las consultas nuevas con datos reales confirmados: historySnapshot, createHistoricTimesheets, hourSnapshot, legacySnapshot (historia, sumas, avisos y gastos por moneda) y
// fingerprintSnapshot (períodos y líneas por clave natural). Termina con código 0 solo si todo coincide. Conecta por las variables PG* del entorno (PGDATABASE la fija el suite).
import { createFase3DbAdapter } from "../../../scripts/etl/fase3-db.mjs";
import { buildHistoryBlueprint, historyPayload } from "../../../scripts/etl/fase3-history.mjs";
import { buildFingerprint } from "../../../scripts/etl/fase3-fingerprint.mjs";

const fail = (message) => { console.error(`FAIL (adaptador D41): ${message}`); process.exit(1); };
const check = (condition, message) => { if (!condition) fail(message); };
const BATCH = "legacy:TimeControlDB_20261106_1600:d41";
const S1 = "5e410000-0000-4000-8000-000000000001"; const S2 = "5e410000-0000-4000-8000-000000000002"; const ENG = "7e410000-0000-4000-8000-000000000001";
const DUMMY = "0e410000-0000-4000-8000-0000000000ff"; const COT = "D41-COT";

const db = createFase3DbAdapter({ env: process.env });
const catalog = await db.engagementCatalog();
const staff = new Map((catalog.staff ?? []).map((row) => [row.id, row]));
check(staff.has(S1) && "active" in staff.get(S1) && "terminationDate" in staff.get(S1), "engagementCatalog debe traer active y terminationDate de cada ficha");
const activities = new Map((await db.matrixCatalog()).activities.map((row) => [row.code, row.id]));
check(activities.has("D41-A") && activities.has("D41-B"), "faltan las actividades del fixture");

const entry = (n, staffId, date, hours, exec, code) => ({ sourceKey: `${exec}:${code}:1`, timeId: `00000000-0000-4000-8000-00000000000${n}`.replace(/^00000000/, "ce410000"), dateWorked: date, hours, staffId, engagementId: ENG, activityId: activities.get(code), etlSplitIndex: 1, isForecast: false, periodId: null, sourceAllocations: [{ legacy_execution_id: exec, hours }] });
const entries = [entry(1, S1, "2026-06-04", "8", "e1", "D41-A"), entry(2, S1, "2026-06-05", "2", "e2", "D41-A"), entry(3, S1, "2026-06-04", "3", "e3", "D41-B"), entry(4, S2, "2026-06-04", "4.5", "e4", "D41-A")];
const approvals = new Map([["e1", { legacy_approver_profile_id: "8", legacy_approved_at: "2026-06-12 18:30:00" }], ["e2", { legacy_approver_profile_id: "8", legacy_approved_at: "2026-06-12 18:30:00" }], ["e3", { legacy_approver_profile_id: "", legacy_approved_at: "" }], ["e4", { legacy_approver_profile_id: "7", legacy_approved_at: "2026-06-11 09:30:00" }]]);
const bp = buildHistoryBlueprint({ entries, approvalByExecution: approvals, staffByLegacyProfile: new Map([["7", S1], ["8", S2]]), staffInfo: new Map([[S1, { active: true }], [S2, { active: true }]]) });
check(bp.periods.length === 2 && bp.lines.length === 3, "el blueprint del fixture debe dar 2 períodos y 3 líneas");
const periodIds = bp.periods.map((p) => p.periodId); const approvalIds = bp.lines.map((l) => l.approvalId);

const before = await db.historySnapshot({ periodIds, approvalIds, batch: BATCH });
check(before.periods.length === 0 && before.lines.length === 0 && Number(before.batchForeign) === 0 && Number(before.periodsTotal) === 0 && Number(before.linesTotal) === 0, "antes de importar no debe haber períodos ni líneas");

const created = await db.createHistoricTimesheets({ batch: BATCH, ...historyPayload({ periods: bp.periods, entries: bp.entries, lines: bp.lines }) });
check(created.periods === 2 && created.entries === 4 && created.lines === 3 && created.batch === BATCH, `createHistoricTimesheets devolvió ${JSON.stringify(created)}`);

const after = await db.historySnapshot({ periodIds, approvalIds, batch: BATCH });
check(after.periods.length === 2 && after.periods.every((p) => p.locked === true && p.submitted === true && p.imported === true && p.batch === BATCH), "los 2 períodos deben estar cerrados, enviados y con el lote");
const week = after.periods.find((p) => p.staffId === S1);
check(week && String(week.weekStart).slice(0, 10) === "2026-06-01" && Number(week.totalHours) === 13, "la semana parcial de S1 (lunes 01/06) debe sumar 13 h");
check(after.lines.length === 3 && after.lines.every((l) => l.status === "approved"), "las 3 líneas deben estar approved");
check(after.lines.filter((l) => l.approvedBy === null && l.approvedAt === null).length === 1, "la línea sin evidencia queda con aprobador y fecha NULL");
check(Number(after.periodsTotal) === 2 && Number(after.linesTotal) === 3 && Number(after.batchForeign) === 0, "totales del destino");
const hours = await db.hourSnapshot({ entries: bp.entries });
check(hours.entries.length === 4 && hours.entries.every((e) => e.periodId && e.isForecast === false), "las 4 entradas quedan vinculadas a su período");

const snap = await db.legacySnapshot({ engagementIds: [ENG], adminEngagementIds: [DUMMY], worksheetIds: [DUMMY], woIds: [DUMMY], batch: BATCH });
check(snap.historyBatch === BATCH, "legacySnapshot debe devolver el lote");
check(snap.histPeriods.length === 2 && snap.histPeriods.every((r) => r[5] === true && r[6] === true && r[7] === BATCH && r[8] === true), "histPeriods: 2 períodos cerrados con procedencia");
check(snap.histLines.length === 3 && snap.histLines.every((r) => r[4] === "approved"), "histLines: 3 líneas approved");
check(snap.histLines.some((r) => r[5] === S2 && r[6] === "2026-06-12T22:30:00"), "la fecha de la línea se devuelve en UTC (18:30 de La Paz = 22:30Z)");
check(snap.histLineHours.length === 3 && snap.histLineHours.some((r) => r[3] === "D41-A" && Number(r[4]) === 10), "histLineHours: la línea A de S1 suma 10 h");
check(snap.histEntries.total === 4 && snap.histEntries.withoutPeriod === 0 && snap.histEntries.wrongPeriod === 0 && snap.histEntries.forecast === 0, `histEntries ${JSON.stringify(snap.histEntries)}`);
check(Number(snap.periodTotalMismatch) === 0 && Number(snap.timesheetNotifications) === 0 && Number(snap.timesheetEmails) === 0, "sin diferencias de total ni avisos/correos de timesheet");
check(Array.isArray(snap.expensesByCurrency), "expensesByCurrency debe ser un arreglo (vacío sin gastos)");
check(Number(snap.entriesCount) === 4, "entriesCount");

const fp = await db.fingerprintSnapshot({ engagements: [{ sourceKey: COT, engagementId: ENG, kind: "client" }], expectedCount: 1 });
check(fp.periods.length === 2 && fp.periods.every(([key]) => /^[0-9a-f]{32}\|2026-06-01$/.test(key)), "huella L9: 2 períodos por clave natural persona|lunes");
check(fp.lines.length === 3 && fp.lines.every(([key]) => /^[0-9a-f]{32}\|2026-06-01\|D41-COT\|D41-[AB]$/.test(key)), "huella L9: 3 líneas por clave natural persona|lunes|COT|actividad");
const fingerprint = buildFingerprint({ environment: "local", projectRef: "local", installationId: "f3-smoke", snapshot: fp, source: { snapshot: "S_d41", origin: "S", contract: "D41", manifestSha256: "x" } });
check(fingerprint.sets.periods.count === 2 && fingerprint.sets.lines.count === 3, "buildFingerprint recoge los dos conjuntos nuevos");
const again = await db.fingerprintSnapshot({ engagements: [{ sourceKey: COT, engagementId: ENG, kind: "client" }], expectedCount: 1 });
check(JSON.stringify(again.periods) === JSON.stringify(fp.periods) && JSON.stringify(again.lines) === JSON.stringify(fp.lines), "la huella es estable entre dos lecturas");

// repetir la importación del mismo lote debe rechazarse y no cambiar nada
let repeated = null; try { await db.createHistoricTimesheets({ batch: BATCH, ...historyPayload({ periods: bp.periods, entries: bp.entries, lines: bp.lines }) }); } catch (error) { repeated = error; }
check(repeated, "repetir el lote debe fallar");
check((await db.historySnapshot({ periodIds, approvalIds, batch: BATCH })).periods.length === 2, "tras el rechazo siguen exactamente los 2 períodos");
console.log("ADAPTADOR D41: consultas nuevas verificadas contra el esquema real");
