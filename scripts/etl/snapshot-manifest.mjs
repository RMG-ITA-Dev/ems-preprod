// Manifiesto por snapshot: concentra las cifras y fechas que dependen del respaldo legacy que se carga (y de las decisiones
// del operador sobre él). Antes estaban repartidas como constantes en F2, F3 y el runbook; cambiar de respaldo exigía tocar el código.
//
// Archivo: scripts/etl/snapshots/<nombre_de_la_base>.json (versionado, sin secretos).
// Un valor `null` significa «sin declarar»: en `local` el control no se aplica (F2 lo puede completar con `expectations`);
// en Test y producción BLOQUEA (declared()). El sha256 del archivo se guarda en el journal al crearlo y, al reanudar, debe coincidir.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class SnapshotManifestError extends Error {
  constructor(message) { super(message); this.name = "SnapshotManifestError"; this.code = "CONFIG"; }
}

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "snapshots");
const NAME = /^[A-Za-z0-9_]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const F2_KEYS = ["clients", "contacts", "staff", "users", "rates", "services", "activeStaff", "inactiveStaff", "schedulableStaff"];
const F3_COUNT_KEYS = ["clientEngagements", "administrativeEngagements", "selectorProfiles", "matrices", "workOrders", "engagementsTotal", "risks"];
const DATE_KEYS = ["staffCut", "recentHire", "fy2026End", "fy2027End", "adminWindowFrom", "adminWindowTo"];
const COT_KEY = /^\d{4}\.\d{2}\.\d{3}\|\d+$/;
const COT = /^\d{4}\.\d{2}\.\d{3}$/;

const isCount = (value) => value === null || (Number.isInteger(value) && value >= 0);
const isDate = (value) => value === null || (typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)));
const fail = (name, message) => { throw new SnapshotManifestError(`manifiesto ${name}: ${message}`); };
const isDecimalOrNull = (value) => value === null || /^\d+(\.\d+)?$/.test(String(value));
// f3.hours.entries y f3.hours.holiday (12/11/2026, revisión independiente): entradas EMS que producen las horas aprobadas (una por actividad: Gerente y Supervisor se reparten
// 30/70) y lo que cae en feriados del calendario de EMS vigente (2026-2027; 2024 y 2025 no existen en él). Opcionales: manifiestos anteriores no los traen (= no aplica);
// un valor null se trata como los demás controles (en local no se aplica; en Test y producción bloquea).
// D41 Parte I (13/11/2026): contrato de horas históricas APROBADAS dentro de EMS. `f3.hours.contract = "D41"` + `history` { batch, timeZone, periods, lines, entriesLinked, approvals: { rows, sha256 } }.
// Sin contract (manifiestos anteriores) el cargador deja las horas con período NULL, como antes. Un valor null se trata como los demás controles.
const BATCH = /^legacy:[A-Za-z0-9_]+:d41$/;
const historyShapeOk = (hours) => {
  if (hours.contract === undefined) return hours.history === undefined;
  if (hours.contract !== "D41") return false;
  const h = hours.history; if (!h || typeof h !== "object" || Array.isArray(h)) return false;
  return typeof h.batch === "string" && BATCH.test(h.batch) && h.timeZone === "America/La_Paz" && isCount(h.periods) && isCount(h.lines) && isCount(h.entriesLinked)
    && !!h.approvals && typeof h.approvals === "object" && isCount(h.approvals.rows) && (h.approvals.sha256 === null || /^[a-f0-9]{64}$/.test(String(h.approvals.sha256)));
};
const hoursEntriesShapeOk = (hours) => historyShapeOk(hours) && (hours.entries === undefined || isCount(hours.entries))
  && (hours.holiday === undefined || (hours.holiday && typeof hours.holiday === "object" && !Array.isArray(hours.holiday) && isCount(hours.holiday.rows) && isCount(hours.holiday.entries) && isDecimalOrNull(hours.holiday.hours)));

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const inner of Object.values(value)) deepFreeze(inner); }
  return value;
}

/** Comprueba la forma del manifiesto (no sus valores de negocio). Lanza SnapshotManifestError. */
export function validateManifestShape(raw, name) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(name, "debe ser un objeto JSON");
  if (raw.snapshot !== name) fail(name, `el campo snapshot (${raw.snapshot}) no coincide con el nombre del archivo`);
  // `snapshot` es el identificador del MANIFIESTO (nombre del archivo); `origin.database` es el respaldo legacy del que salen los datos. Un manifiesto variante (p. ej. el contrato D41)
  // lleva su propio snapshot y declara su origen; sin `origin` el origen es el propio snapshot.
  if (raw.origin !== undefined && (!raw.origin || typeof raw.origin !== "object" || !NAME.test(String(raw.origin.database ?? "")))) fail(name, "origin.database debe ser el nombre del respaldo legacy");
  for (const key of ["dates", "f2", "f3", "bak"]) if (!raw[key] || typeof raw[key] !== "object") fail(name, `falta la sección ${key}`);
  for (const key of DATE_KEYS) if (!(key in raw.dates) || !isDate(raw.dates[key])) fail(name, `dates.${key} debe existir (AAAA-MM-DD o null)`);
  for (const key of F2_KEYS) if (!(key in raw.f2) || !isCount(raw.f2[key])) fail(name, `f2.${key} debe existir (entero o null)`);
  for (const key of F3_COUNT_KEYS) if (!(key in raw.f3) || !isCount(raw.f3[key])) fail(name, `f3.${key} debe existir (entero o null)`);
  const { expenses, payments, endDates, riskLevels, hours } = raw.f3;
  // f3.hours (opcional; manifiestos anteriores al 06/11 no lo traen): ancla de las horas aprobadas que migran. Cada valor es null (sin declarar) o su cifra.
  if (hours !== undefined && (!hours || typeof hours !== "object" || !isCount(hours.rows) || !isCount(hours.persons) || !isCount(hours.engagements) || !(hours.total === null || /^\d+(\.\d+)?$/.test(String(hours.total))) || !(hours.lastWorkedDay === null || (typeof hours.lastWorkedDay === "string" && ISO_DATE.test(hours.lastWorkedDay)))
    || !hoursEntriesShapeOk(hours))) fail(name, "f3.hours inválido (rows, total, persons, engagements, lastWorkedDay y, si existen, entries y holiday.{rows,entries,hours})");
  if (!expenses || !isCount(expenses.positive) || !isCount(expenses.zero) || !(expenses.totalUnits === null || /^\d+$/.test(String(expenses.totalUnits)))) fail(name, "f3.expenses inválido");
  if (!payments || !["plans", "rows", "billable", "notes"].every((key) => isCount(payments[key]))) fail(name, "f3.payments inválido");
  if (!endDates || !Array.isArray(endDates.allowed) || !endDates.allowed.length || !endDates.allowed.every((d) => ISO_DATE.test(d))) fail(name, "f3.endDates.allowed debe listar fechas AAAA-MM-DD");
  if (endDates.counts !== null && (typeof endDates.counts !== "object" || Object.keys(endDates.counts).some((d) => !endDates.allowed.includes(d) || !isCount(endDates.counts[d])))) fail(name, "f3.endDates.counts debe usar solo fechas permitidas");
  if (endDates.byYear !== null && (typeof endDates.byYear !== "object" || Object.values(endDates.byYear).some((d) => !endDates.allowed.includes(d)))) fail(name, "f3.endDates.byYear debe usar solo fechas permitidas");
  if (riskLevels !== null && (typeof riskLevels !== "object" || Object.keys(riskLevels).some((level) => !["Bajo", "Moderado", "Alto"].includes(level) || !isCount(riskLevels[level])))) fail(name, "f3.riskLevels inválido");
  for (const key of ["planNotes", "invoicedInstallments"]) if (!Array.isArray(raw[key]) || !raw[key].every((item) => COT_KEY.test(item)) || new Set(raw[key]).size !== raw[key].length) fail(name, `${key} debe ser una lista sin repetidos de «COT|cuota»`);
  if (!Array.isArray(raw.toleranceCots) || !raw.toleranceCots.every((cot) => COT.test(cot))) fail(name, "toleranceCots debe ser una lista de COT");
  if (!raw.preflight || !(raw.preflight.executionDeadline === null || ISO_DATE.test(raw.preflight.executionDeadline))) fail(name, "preflight.executionDeadline inválido");
  return raw;
}

/** Carga scripts/etl/snapshots/<dbName>.json. Sin archivo, la configuración no es válida: no hay valores por defecto. */
export function loadSnapshotManifest(dbName, { dir = DIR } = {}) {
  if (typeof dbName !== "string" || !NAME.test(dbName)) throw new SnapshotManifestError("nombre de snapshot inválido");
  const file = path.join(dir, `${dbName}.json`);
  if (!existsSync(file)) throw new SnapshotManifestError(`snapshot sin manifiesto aprobado: falta ${path.join("scripts", "etl", "snapshots", `${dbName}.json`)}`);
  const text = readFileSync(file, "utf8");
  let raw; try { raw = JSON.parse(text); } catch (error) { throw new SnapshotManifestError(`manifiesto ${dbName}: JSON inválido (${error.message})`); }
  validateManifestShape(raw, dbName);
  return deepFreeze({ ...raw, sha256: createHash("sha256").update(text).digest("hex") });
}

/**
 * Valor declarado de un control. null/undefined = sin declarar: en `local` devuelve null (el llamador omite el control);
 * en Test y producción bloquea, porque una carga real no puede correr sin sus cifras de control.
 */
export function declared(environment, value, label) {
  if (value !== null && value !== undefined) return value;
  if (environment === "local") return null;
  throw new SnapshotManifestError(`manifiesto: ${label} sin declarar (obligatorio fuera de local)`);
}

/** Compara solo si el control está declarado. Devuelve true cuando cuadra o no aplica. */
export const matchesDeclared = (environment, expected, actual, label) => { const value = declared(environment, expected, label); return value === null || value === actual; };

/** Los encargos cliente deben repartirse en los fines de vigencia que declara el manifiesto (45 con 2026-11-30 y 110 con 2027-09-30 al 06/11). */
export function assertEndDateCounts(endDatesUsed, endDates, environment) {
  const counts = declared(environment, endDates?.counts, "f3.endDates.counts");
  if (counts === null) return;
  const actual = {}; for (const date of endDatesUsed) actual[date] = (actual[date] ?? 0) + 1;
  const diffs = endDates.allowed.filter((date) => (actual[date] ?? 0) !== (counts[date] ?? 0)).map((date) => `${date}: ${actual[date] ?? 0} de ${counts[date] ?? 0}`);
  if (diffs.length || endDatesUsed.length !== Object.values(counts).reduce((sum, value) => sum + value, 0)) throw new SnapshotManifestError(`fines de vigencia fuera del manifiesto (${diffs.join("; ") || "total distinto"})`);
}

/** Fin de vigencia de un encargo cliente: la columna ems_end_date del CSV; si falta, el manifiesto puede dar uno por gestión. */
export function resolveEndDate(row, endDates) {
  const fromCsv = String(row.ems_end_date ?? "").trim().slice(0, 10);
  const value = fromCsv || endDates?.byYear?.[String(row.gestion)] || "";
  if (!value) throw new SnapshotManifestError(`fin de vigencia no resuelto para ${row.legacy_cot ?? "(sin COT)"}: el CSV no trae ems_end_date y el manifiesto no declara fin por gestión`);
  if (!endDates?.allowed?.includes(value)) throw new SnapshotManifestError(`fin de vigencia no permitido para ${row.legacy_cot ?? "(sin COT)"}: ${value} (permitidos: ${endDates?.allowed?.join(", ")})`);
  return value;
}

/** Respaldo legacy del que salen los datos del manifiesto (un manifiesto variante lo declara en `origin.database`; sin él, es el propio snapshot). */
export const manifestOrigin = (manifest) => manifest?.origin?.database ?? manifest?.snapshot ?? null;
/** Contrato de las horas: "D41" (períodos cerrados con líneas aprobadas) o "legacy" (períodos NULL, manifiestos anteriores). */
export const manifestContract = (manifest) => manifest?.f3?.hours?.contract ?? "legacy";
