// D41 Parte I (13/11/2026): horas históricas APROBADAS dentro de EMS. Funciones puras (sin base de datos ni archivos): semana fiscal canónica, zona horaria de las fechas legacy y el
// blueprint de períodos cerrados, líneas nativas `approved` y vínculo de cada entrada con su período. El cargador (fase3.mjs) y la conciliación (fase3-reconcile.mjs) usan las mismas
// funciones, de modo que lo esperado se calcula desde los CSV y los mapas de F2, nunca desde el destino.
import { randomUUID } from "node:crypto";
import { decimalUnits, formatUnits, aliasProfile } from "./fase3-transform.mjs";

export const IMPORT_TIME_ZONE = "America/La_Paz";
const IMPORT_UTC_OFFSET = "-04:00"; // Bolivia no tiene horario de verano: America/La_Paz es UTC-4 todo el año.
const FISCAL_YEAR_START_MONTH = 9; // octubre (0-indexado), como src/lib/fiscalCalculations.ts
const DAY_MS = 86400000;
const text = (value) => String(value ?? "").trim();

const utc = (iso) => { const [y, m, d] = text(iso).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (date) => date.toISOString().slice(0, 10);

/** Lunes (YYYY-MM-DD) de la semana de una fecha (semana lunes a domingo). */
export function mondayOf(dateText) { const date = utc(dateText); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); return iso(date); }

// ── Semana fiscal: puerto EXACTO de getFiscalWeekNumber / getFiscalWeekOneMonday / getFiscalYearForDate (src/lib/fiscalCalculations.ts), con aritmética UTC. Una prueba de paridad
// compara esta función con la de TypeScript para todos los lunes de 2020 a 2030. NO es la numeración del legacy (Semanas.nroSemana).
const fiscalYearForDate = (date) => (date.getUTCMonth() >= FISCAL_YEAR_START_MONTH ? date.getUTCFullYear() + 1 : date.getUTCFullYear());
function fiscalWeekOneMonday(fiscalYear) {
  let anchor = new Date(Date.UTC(fiscalYear - 1, FISCAL_YEAR_START_MONTH, 1)); // 1 de octubre
  const dow = anchor.getUTCDay();
  if (dow === 6) anchor = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 3)); else if (dow === 0) anchor = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 2));
  anchor.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
  return anchor;
}
export function fiscalWeekNumber(dateText) {
  const date = utc(dateText); let fiscalYear = fiscalYearForDate(date);
  const inputMonday = utc(mondayOf(dateText));
  if (inputMonday.getTime() >= fiscalWeekOneMonday(fiscalYear + 1).getTime()) fiscalYear += 1;
  let daysDiff = Math.round((inputMonday.getTime() - fiscalWeekOneMonday(fiscalYear).getTime()) / DAY_MS);
  if (daysDiff < 0) daysDiff = Math.round((inputMonday.getTime() - fiscalWeekOneMonday(fiscalYear - 1).getTime()) / DAY_MS);
  return Math.floor(daysDiff / 7) + 1;
}
/** `year` del período, como lo guarda la aplicación (useTimesheetWeek / useTimesheetImport): el año CALENDARIO del lunes, no el fiscal. */
export const periodYear = (mondayText) => Number(text(mondayText).slice(0, 4));

/** Datetime del legacy (YYYY-MM-DD HH:MM:SS, sin zona) interpretado como America/La_Paz. Devuelve null si está vacío; el valor original no se altera en el CSV. */
export function legacyDatetimeToIso(value) {
  const v = text(value); if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) throw new Error(`fecha de aprobación legacy inválida: ${v}`);
  return `${v.replace(" ", "T")}${IMPORT_UTC_OFFSET}`;
}

/**
 * Blueprint D41.
 *  entries: entradas finales de EMS (consolidateResolvedHours): { timeId?, dateWorked, hours, staffId, engagementId, activityId, sourceAllocations: [{ legacy_execution_id, hours }] }
 *  approvalByExecution: Map legacy_execution_id → { legacy_approver_profile_id, legacy_approved_at }
 *  staffByLegacyProfile: Map perfil legacy → staffId (F2); el perfil 89 se absorbe en el 62
 *  reserved: { periods: Map(clave → periodId), lines: Map(clave → approvalId) } identidades ya reservadas en el journal (se conservan)
 *  engagementApprover: Map engagementId → staffId que EMS asignaría (coalesce(manager, partner)); staffInfo: Map staffId → { active, terminationDate } (ambos solo para la evidencia)
 * Salida: { periods, lines, entries (con periodKey), evidence }. Un aprobador o una fecha ausentes quedan NULL (no se atribuyen a nadie); una línea con más de un aprobador bloquea.
 */
export function buildHistoryBlueprint({ entries, approvalByExecution, staffByLegacyProfile, reserved = {}, engagementApprover = new Map(), staffInfo = new Map(), newId = randomUUID }) {
  const periodMap = new Map(); const lineMap = new Map(); const linked = [];
  for (const entry of entries) {
    const weekStart = mondayOf(entry.dateWorked); const periodKey = `${entry.staffId}|${weekStart}`;
    let period = periodMap.get(periodKey);
    if (!period) { period = { key: periodKey, periodId: reserved.periods?.get(periodKey) ?? newId(), staffId: entry.staffId, weekStart, weekNumber: fiscalWeekNumber(weekStart), year: periodYear(weekStart), units: 0n, entries: 0 }; periodMap.set(periodKey, period); }
    period.units += decimalUnits(entry.hours); period.entries += 1;
    const lineKey = `${periodKey}|${entry.engagementId}|${entry.activityId}`;
    let line = lineMap.get(lineKey);
    if (!line) { line = { key: lineKey, periodKey, engagementId: entry.engagementId, activityId: entry.activityId, approvers: new Set(), approvedAtLegacy: [], lastWorkedDay: entry.dateWorked, units: 0n, entries: 0 }; lineMap.set(lineKey, line); }
    line.units += decimalUnits(entry.hours); line.entries += 1; if (entry.dateWorked > line.lastWorkedDay) line.lastWorkedDay = entry.dateWorked;
    for (const allocation of entry.sourceAllocations ?? []) {
      const approval = approvalByExecution.get(text(allocation.legacy_execution_id));
      if (!approval) throw new Error(`hora sin aprobación en el archivo lateral: ${allocation.legacy_execution_id}`);
      line.approvers.add(text(approval.legacy_approver_profile_id)); line.approvedAtLegacy.push(text(approval.legacy_approved_at));
    }
    linked.push({ ...entry, periodKey, periodId: period.periodId });
  }
  const evidence = { periods: periodMap.size, lines: lineMap.size, entries: linked.length, hours: formatUnits([...periodMap.values()].reduce((s, p) => s + p.units, 0n)), approversDistinct: new Set(), selfApproved: 0, approverWithoutStaff: 0, approvalsWithoutApprover: 0, approvalsWithoutDate: 0, linesWithMultipleApprovalDays: 0, linesWithMultipleApprovalTimestamps: 0, approvedBeforeLastWorkedDay: 0, approverInactiveLines: 0, approverInactivePeople: new Set(), approvedAfterApproverTermination: 0, approverDiffersFromEmsApprover: 0 };
  const lines = [...lineMap.values()].sort((a, b) => a.key.localeCompare(b.key)).map((line) => {
    const approvers = [...line.approvers].filter(Boolean); if (approvers.length > 1) throw new Error(`línea con más de un aprobador legacy (${approvers.join(",")}): ${line.key}`);
    const profile = approvers[0] ?? null; if (!profile) evidence.approvalsWithoutApprover += 1;
    const dates = [...new Set(line.approvedAtLegacy.filter(Boolean))].sort(); if (!dates.length) evidence.approvalsWithoutDate += 1; if (dates.length > 1) evidence.linesWithMultipleApprovalTimestamps += 1; if (new Set(dates.map((d) => d.slice(0, 10))).size > 1) evidence.linesWithMultipleApprovalDays += 1;
    const latest = dates.at(-1) ?? null; // varias fechas del mismo aprobador: la más reciente
    const approvedBy = profile ? (staffByLegacyProfile.get(aliasProfile(profile)) ?? null) : null;
    if (profile && !approvedBy) evidence.approverWithoutStaff += 1;
    if (approvedBy) {
      evidence.approversDistinct.add(approvedBy);
      const period = periodMap.get(line.periodKey); if (approvedBy === period.staffId) evidence.selfApproved += 1;
      const info = staffInfo.get(approvedBy); if (info && info.active === false) { evidence.approverInactiveLines += 1; evidence.approverInactivePeople.add(approvedBy); }
      if (info?.terminationDate && latest && latest.slice(0, 10) > String(info.terminationDate).slice(0, 10)) evidence.approvedAfterApproverTermination += 1;
      const expectedApprover = engagementApprover.get(line.engagementId); if (expectedApprover && expectedApprover !== approvedBy) evidence.approverDiffersFromEmsApprover += 1;
    }
    if (latest && latest.slice(0, 10) < line.lastWorkedDay) evidence.approvedBeforeLastWorkedDay += 1;
    return { key: line.key, periodKey: line.periodKey, approvalId: reserved.lines?.get(line.key) ?? newId(), periodId: periodMap.get(line.periodKey).periodId, engagementId: line.engagementId, activityId: line.activityId, approvedBy, approvedAtLegacy: latest, approvedAt: legacyDatetimeToIso(latest), hours: formatUnits(line.units), entries: line.entries, legacyApproverProfile: profile };
  });
  const periods = [...periodMap.values()].sort((a, b) => a.key.localeCompare(b.key)).map((p) => ({ key: p.key, periodId: p.periodId, staffId: p.staffId, weekStart: p.weekStart, weekNumber: p.weekNumber, year: p.year, totalHours: formatUnits(p.units), entries: p.entries }));
  const summary = { ...evidence, approversDistinct: evidence.approversDistinct.size, approverInactivePeople: evidence.approverInactivePeople.size };
  return { periods, lines, entries: linked, evidence: summary };
}

/** Mapas execution→aprobación desde las filas del archivo lateral. */
export function approvalsByExecution(rows) { return new Map(rows.map((row) => [text(row.legacy_execution_id), { legacy_approver_profile_id: text(row.legacy_approver_profile_id), legacy_approved_at: text(row.legacy_approved_at) }])); }

/** Payload de public.import_historic_timesheets (sin datos personales): períodos, entradas vinculadas y líneas aprobadas. */
export function historyPayload({ periods, entries, lines }) {
  return {
    periods: periods.map((p) => ({ periodId: p.periodId, staffId: p.staffId, weekStart: p.weekStart, weekNumber: p.weekNumber, year: p.year, totalHours: p.totalHours })),
    entries: entries.map((e) => ({ timeId: e.timeId, dateWorked: e.dateWorked, hours: e.hours, staffId: e.staffId, engagementId: e.engagementId, activityId: e.activityId, etlSplitIndex: e.etlSplitIndex ?? 1, periodId: e.periodId })),
    lines: lines.map((l) => ({ approvalId: l.approvalId, periodId: l.periodId, engagementId: l.engagementId, activityId: l.activityId, approvedBy: l.approvedBy, approvedAt: l.approvedAt })),
  };
}
