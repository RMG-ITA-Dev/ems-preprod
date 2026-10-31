// Reconciliación F3 contra el legacy (solo lectura, Fase 4 §7). Los totales esperados salen de los seis CSV con
// aritmética entera escalada; los reales, de consultas agregadas a la base. El journal solo aporta identidades
// (qué UUID corresponde a qué COT), nunca un valor esperado: así una carga no se valida contra su propia salida.
import { isMigrableExecution } from "./fase3-input.mjs";
import { decimalUnits, formatUnits } from "./fase3-transform.mjs";

const text = (value) => String(value ?? "").trim();
const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0n);
const day = (value) => text(value).slice(0, 10);
const bump = (map, key, units) => map.set(key, (map.get(key) ?? 0n) + units);
// Importe (centavos) x TC (centésimas) → centavos redondeados half-up, como pide plan_v2 §3 («redondea a centavos»).
export const BOB_ROUNDING = (amountUnits, rateUnits) => (amountUnits * rateUnits + 50n) / 100n;

// Horas históricas fuera de alcance: feriado aplicable por oficina del staff (documento 10 §2.8). Las oficinas 0 (Firmwide) aplican a todos.
export function holidayApplies({ date, officeOfStaff, holidaysByDate }) {
  const offices = holidaysByDate.get(day(date)) ?? [];
  return offices.includes(0) || (officeOfStaff != null && offices.includes(officeOfStaff));
}

export function legacyExpectations({ inputs, staffByLegacyProfile, officeByStaffId, holidaysByDate, scaleFactor = 1n }) {
  const clientCots = inputs.clientEngagements.map((row) => text(row.legacy_cot));
  // L3: horas presupuestadas por origen de planificación.
  const planHours = sum(inputs.planHours, (row) => decimalUnits(row.legacy_budget_hours));
  // L5: gastos positivos; USD conserva el importe, BOB multiplica por el TC legacy de la fila y redondea a centavos.
  const positives = inputs.expenses.filter((row) => decimalUnits(row.legacy_amount_usd) > 0n);
  const emsExpenseUnits = (row) => (text(row.legacy_currency_raw) === "1" ? decimalUnits(row.legacy_amount_usd) : BOB_ROUNDING(decimalUnits(row.legacy_amount_usd), decimalUnits(row.legacy_exchange_rate)));
  const expenseByCot = new Map(); for (const row of positives) bump(expenseByCot, text(row.legacy_cot), emsExpenseUnits(row));
  // L6: cuotas facturables y notas; el honorario con IVA es único por COT en el extracto de pagos.
  const isNote = (row) => ["nota_plan_confirmada", "plan_note"].includes(text(row.proposed_disposition));
  const billable = inputs.payments.filter((row) => !isNote(row)); const notes = inputs.payments.filter(isNote);
  const feeByCot = new Map(); for (const row of inputs.payments) feeByCot.set(text(row.legacy_cot), decimalUnits(row.legacy_fee_with_tax));
  const plansCount = new Set(inputs.payments.map((row) => text(row.legacy_cot))).size;
  // L7: horas ejecutadas aprobadas, menos las de feriado aplicable (se contabilizan aparte, no se pierden).
  const migrable = inputs.executions.filter(isMigrableExecution);
  const excluded = []; const kept = [];
  for (const row of migrable) {
    const staffId = staffByLegacyProfile.get(text(row.legacy_profile_id));
    (holidayApplies({ date: row.legacy_worked_at, officeOfStaff: staffId ? officeByStaffId.get(staffId) : null, holidaysByDate }) ? excluded : kept).push(row);
  }
  const hoursByCot = new Map(), hoursByStaff = new Map();
  for (const row of kept) { const units = decimalUnits(row.legacy_hours); bump(hoursByCot, text(row.legacy_cot), units); const staffId = staffByLegacyProfile.get(text(row.legacy_profile_id)); if (staffId) bump(hoursByStaff, staffId, units); }
  const unmappedProfiles = [...new Set(kept.filter((row) => !staffByLegacyProfile.has(text(row.legacy_profile_id))).map((row) => text(row.legacy_profile_id)))];
  return {
    clientEngagements: BigInt(clientCots.length), administrativeEngagements: BigInt(inputs.administrativeEngagements.length), planHoursUnits: planHours,
    expensesPositive: BigInt(positives.length), expensesZeroOmitted: BigInt(inputs.expenses.length - positives.length), expensesSourceUsd: sum(positives, (row) => decimalUnits(row.legacy_amount_usd)), expensesEmsUnits: sum(positives, emsExpenseUnits), expenseByCot,
    plans: BigInt(plansCount), installments: BigInt(billable.length), notes: BigInt(notes.length), feeByCot,
    executionsMigrable: BigInt(migrable.length), executionsMigrableHours: sum(migrable, (row) => decimalUnits(row.legacy_hours)),
    holidayExcludedRows: BigInt(excluded.length), holidayExcludedHours: sum(excluded, (row) => decimalUnits(row.legacy_hours)), holidayDates: [...new Set(excluded.map((row) => day(row.legacy_worked_at)))].sort(),
    expectedHoursUnits: sum(kept, (row) => decimalUnits(row.legacy_hours)), hoursByCot, hoursByStaff, unmappedProfiles, scaleFactor,
  };
}

const eq = (id, label, expected, actual, note = "") => ({ id, label, expected: String(expected), actual: String(actual), ok: String(expected) === String(actual), note });
const units = (value) => { if (value == null) return "∅"; try { return formatUnits(decimalUnits(String(value))); } catch { return String(value); } };
const mapDiff = (expected, actual, format = (v) => formatUnits(v)) => {
  const diffs = []; for (const key of new Set([...expected.keys(), ...actual.keys()])) { const e = expected.get(key) ?? 0n, a = actual.get(key) ?? 0n; if (e !== a) diffs.push(`${key}: esperado ${format(e)} / real ${format(a)}`); } return diffs;
};

// `actual` es el resultado de db.legacySnapshot(); los mapas llegan como pares [llave, texto decimal].
export function compareLegacyControls(expected, actual) {
  const rows = [];
  const toMap = (pairs) => new Map((pairs ?? []).map(([key, value]) => [key, decimalUnits(String(value))]));
  rows.push(eq("L1a", "encargos cliente en la base (por identidad del journal)", expected.clientEngagements, actual.clientEngagements));
  rows.push(eq("L1b", "encargos administrativos en la base", expected.administrativeEngagements, actual.administrativeEngagements));
  rows.push(eq("L3", "horas presupuestadas en matrices", formatUnits(expected.planHoursUnits), units(actual.matrixHours)));
  rows.push(eq("L5a", "gastos positivos cargados", expected.expensesPositive, actual.expensesCount));
  rows.push(eq("L5b", "importe de gastos cargado (USD + BOB convertido)", formatUnits(expected.expensesEmsUnits), units(actual.expensesAmount)));
  const expenseDiffs = mapDiff(expected.expenseByCot, toMap(actual.expenseByWo.map(([wo, amount]) => [actual.cotByWo[wo], amount])));
  rows.push({ id: "L5c", label: "gastos por COT", expected: "iguales", actual: expenseDiffs.length ? expenseDiffs.slice(0, 5).join(" | ") : "iguales", ok: !expenseDiffs.length, note: "" });
  rows.push(eq("L6a", "planes de pago", expected.plans, actual.plans)); rows.push(eq("L6b", "cuotas facturables", expected.installments, actual.installments)); rows.push(eq("L6c", "notas de plan activas", expected.notes, actual.notes));
  const feeDiffs = mapDiff(expected.feeByCot, toMap(actual.installmentSumByWo.map(([wo, amount]) => [actual.cotByWo[wo], amount])));
  rows.push({ id: "L6d", label: "suma de cuotas por COT = honorario c/IVA legacy", expected: "iguales", actual: feeDiffs.length ? feeDiffs.slice(0, 5).join(" | ") : "iguales", ok: !feeDiffs.length, note: "" });
  rows.push(eq("L7a", "horas ejecutadas cargadas = fuente aprobada - feriados aplicables", formatUnits(expected.expectedHoursUnits), units(actual.hoursTotal), `fuente aprobada ${formatUnits(expected.executionsMigrableHours)} h; feriados ${expected.holidayExcludedRows} filas / ${formatUnits(expected.holidayExcludedHours)} h en ${expected.holidayDates.join(", ")}`));
  const cotDiffs = mapDiff(expected.hoursByCot, toMap(actual.hoursByEngagement.map(([engagement, hours]) => [actual.cotByEngagement[engagement], hours])));
  rows.push({ id: "L7b", label: "horas por COT", expected: "iguales", actual: cotDiffs.length ? cotDiffs.slice(0, 5).join(" | ") : "iguales", ok: !cotDiffs.length, note: "" });
  const staffDiffs = mapDiff(expected.hoursByStaff, toMap(actual.hoursByStaff));
  rows.push({ id: "L7c", label: "horas por persona (ficha F2)", expected: "iguales", actual: staffDiffs.length ? staffDiffs.slice(0, 5).join(" | ") : "iguales", ok: !staffDiffs.length, note: expected.unmappedProfiles.length ? `perfiles sin ficha: ${expected.unmappedProfiles.join(",")}` : "" });
  rows.push(eq("L7d", "horas cargadas en un feriado aplicable", 0, actual.holidayEntries));
  rows.push(eq("L8a", "períodos de timesheet creados", 0, actual.periods)); rows.push(eq("L8b", "líneas de aprobación creadas", 0, actual.lineApprovals));
  rows.push(eq("L8c", "horas históricas con período o forecast", 0, actual.historicWithPeriodOrForecast));
  rows.push(eq("L8d", "correos del lote enviados (status sent)", 0, actual.emailsSent));
  rows.push(eq("L8e", "correos del lote aún reclamables (pending/sending)", 0, actual.emailsClaimable));
  return { ok: rows.every((row) => row.ok), rows };
}
