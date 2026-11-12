// Reconciliación F3 contra el legacy (solo lectura, Fase 4 §7). Los totales esperados salen de los seis CSV con
// aritmética entera escalada; los reales, de consultas agregadas a la base. El journal solo aporta identidades
// (qué UUID corresponde a qué COT), nunca un valor esperado: así una carga no se valida contra su propia salida.
import { isMigrableExecution, riskLevelFromLegacy } from "./fase3-input.mjs";
import { consolidateExecutions, consolidateResolvedHours, decimalUnits, formatUnits } from "./fase3-transform.mjs";

const text = (value) => String(value ?? "").trim();
const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0n);
const day = (value) => text(value).slice(0, 10);
const bump = (map, key, units) => map.set(key, (map.get(key) ?? 0n) + units);
// Importe (centavos) x TC (centésimas) → centavos redondeados HACIA ARRIBA (D29, 11/11/2026; antes half-up, plan_v2 §3).
export const BOB_ROUNDING = (amountUnits, rateUnits) => (amountUnits * rateUnits + 99n) / 100n;

// Feriado aplicable por oficina del staff (documento 10 §2.8): esas horas se cargan como excepción histórica, pero se contabilizan aparte. Las oficinas 0 (Firmwide) aplican a todos.
export function holidayApplies({ date, officeOfStaff, holidaysByDate }) {
  const offices = holidaysByDate.get(day(date)) ?? [];
  return offices.includes(0) || (officeOfStaff != null && offices.includes(officeOfStaff));
}

// Entradas de horas que EMS debe tener (una por persona, OT, actividad y día): se derivan de las filas aprobadas con las mismas funciones del cargador (reparto 30/70 de Gerente y
// Supervisor, partición de 99,99 h y fusión de perfiles que resuelven a una misma ficha), así que no dependen de lo que haya en la base. `entries` ≠ filas fuente: 18.799 filas → 21.229 entradas.
export function hourEntryExpectations({ migrable, staffByLegacyProfile, officeByStaffId, holidaysByDate }) {
  const cells = consolidateExecutions(migrable);
  const resolved = consolidateResolvedHours(cells.map((cell) => ({ sourceKey: `${cell.legacy_execution_id}:${cell.activity_code}:${cell.split_index}`, dateWorked: cell.date_worked, hours: cell.hours, staffId: staffByLegacyProfile.get(text(cell.legacy_profile_id)) ?? `sin-ficha:${text(cell.legacy_profile_id)}`, engagementId: cell.legacy_cot, activityId: cell.activity_code, isForecast: false, sourceAllocations: cell.source_allocations })));
  const holiday = resolved.filter((entry) => holidayApplies({ date: entry.dateWorked, officeOfStaff: officeByStaffId.get(entry.staffId), holidaysByDate }));
  return { entries: BigInt(resolved.length), holidayEntries: BigInt(holiday.length) };
}

export function legacyExpectations({ inputs, staffByLegacyProfile, officeByStaffId, holidaysByDate, scaleFactor = 1n }) {
  const clientCots = inputs.clientEngagements.map((row) => text(row.legacy_cot));
  // L4: nivel de riesgo de cada OT, traducido del código legacy (1 Bajo, 2 Moderado, 3 Alto; enmienda F3-Q12).
  const riskLevelByCot = new Map(inputs.clientEngagements.map((row) => [text(row.legacy_cot), riskLevelFromLegacy(row.legacy_risk_code, text(row.legacy_cot))]));
  // L3: horas presupuestadas por origen de planificación.
  const planHours = sum(inputs.planHours, (row) => decimalUnits(row.legacy_budget_hours));
  // L5: gastos positivos; USD conserva el importe, BOB multiplica por el TC legacy de la fila y redondea a centavos.
  const positives = inputs.expenses.filter((row) => decimalUnits(row.legacy_amount_usd) > 0n);
  const emsExpenseUnits = (row) => (text(row.legacy_currency_raw) === "1" ? decimalUnits(row.legacy_amount_usd) : BOB_ROUNDING(decimalUnits(row.legacy_amount_usd), decimalUnits(row.legacy_exchange_rate)));
  const expenseByCot = new Map(); for (const row of positives) bump(expenseByCot, text(row.legacy_cot), emsExpenseUnits(row));
  // L6: cuotas facturables y notas; el honorario con IVA es único por COT en el extracto de pagos.
  const isNote = (row) => ["nota_plan_confirmada", "plan_note"].includes(text(row.proposed_disposition));
  const billable = inputs.payments.filter((row) => !isNote(row)); const notes = inputs.payments.filter(isNote);
  const invoicedRows = inputs.payments.filter((row) => ["cuota_facturada", "invoiced"].includes(text(row.proposed_disposition)));
  const feeByCot = new Map(); for (const row of inputs.payments) feeByCot.set(text(row.legacy_cot), decimalUnits(row.legacy_fee_with_tax));
  const plansCount = new Set(inputs.payments.map((row) => text(row.legacy_cot))).size;
  // L7: horas ejecutadas aprobadas; todas se cargan. Las de feriado aplicable se contabilizan aparte (L7d).
  const migrable = inputs.executions.filter(isMigrableExecution);
  const holiday = []; const kept = [];
  for (const row of migrable) {
    const staffId = staffByLegacyProfile.get(text(row.legacy_profile_id));
    if (holidayApplies({ date: row.legacy_worked_at, officeOfStaff: staffId ? officeByStaffId.get(staffId) : null, holidaysByDate })) holiday.push(row);
    kept.push(row);
  }
  const hoursByCot = new Map(), hoursByStaff = new Map();
  for (const row of kept) { const units = decimalUnits(row.legacy_hours); bump(hoursByCot, text(row.legacy_cot), units); const staffId = staffByLegacyProfile.get(text(row.legacy_profile_id)); if (staffId) bump(hoursByStaff, staffId, units); }
  const entryExpectations = hourEntryExpectations({ migrable, staffByLegacyProfile, officeByStaffId, holidaysByDate });
  const unmappedProfiles = [...new Set(kept.filter((row) => !staffByLegacyProfile.has(text(row.legacy_profile_id))).map((row) => text(row.legacy_profile_id)))];
  return {
    riskLevelByCot, clientEngagements: BigInt(clientCots.length), administrativeEngagements: BigInt(inputs.administrativeEngagements.length), planHoursUnits: planHours,
    expensesPositive: BigInt(positives.length), expensesZeroOmitted: BigInt(inputs.expenses.length - positives.length), expensesSourceUsd: sum(positives, (row) => decimalUnits(row.legacy_amount_usd)), expensesEmsUnits: sum(positives, emsExpenseUnits), expenseByCot,
    plans: BigInt(plansCount), installments: BigInt(billable.length), installmentsInvoiced: BigInt(invoicedRows.length), notes: BigInt(notes.length), feeByCot,
    executionsMigrable: BigInt(migrable.length), executionsMigrableHours: sum(migrable, (row) => decimalUnits(row.legacy_hours)),
    holidayKeptRows: BigInt(holiday.length), holidayKeptHours: sum(holiday, (row) => decimalUnits(row.legacy_hours)), holidayDates: [...new Set(holiday.map((row) => day(row.legacy_worked_at)))].sort(),
    expectedEntries: entryExpectations.entries, expectedHolidayEntries: entryExpectations.holidayEntries,
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
  // L4: el nivel de riesgo de cada OT cargada es el que traduce su código legacy (por COT; nulo en la base cuenta como diferencia).
  const riskActual = new Map((actual.riskLevelByWo ?? []).map(([wo, level]) => [actual.cotByWo[wo], level]));
  const riskDiffs = [...expected.riskLevelByCot].filter(([cot, level]) => riskActual.get(cot) !== level).map(([cot, level]) => `${cot}: esperado ${level} / real ${riskActual.get(cot) ?? "∅"}`);
  if (riskActual.size !== expected.riskLevelByCot.size) riskDiffs.push(`OT con nivel: esperadas ${expected.riskLevelByCot.size} / reales ${riskActual.size}`);
  const riskCounts = (map) => [...map.values()].reduce((acc, level) => ({ ...acc, [level]: (acc[level] ?? 0) + 1 }), {});
  rows.push({ id: "L4", label: "nivel de riesgo de la OT (1 Bajo, 2 Moderado, 3 Alto)", expected: "iguales", actual: riskDiffs.length ? riskDiffs.slice(0, 5).join(" | ") : "iguales", ok: !riskDiffs.length, note: `fuente ${JSON.stringify(riskCounts(expected.riskLevelByCot))}` });
  rows.push(eq("L5a", "gastos positivos cargados", expected.expensesPositive, actual.expensesCount));
  rows.push(eq("L5b", "importe de gastos cargado (USD + BOB convertido)", formatUnits(expected.expensesEmsUnits), units(actual.expensesAmount)));
  const expenseDiffs = mapDiff(expected.expenseByCot, toMap(actual.expenseByWo.map(([wo, amount]) => [actual.cotByWo[wo], amount])));
  rows.push({ id: "L5c", label: "gastos por COT", expected: "iguales", actual: expenseDiffs.length ? expenseDiffs.slice(0, 5).join(" | ") : "iguales", ok: !expenseDiffs.length, note: "" });
  rows.push(eq("L6a", "planes de pago", expected.plans, actual.plans)); rows.push(eq("L6b", "cuotas facturables", expected.installments, actual.installments)); rows.push(eq("L6c", "notas de plan activas", expected.notes, actual.notes));
  // D19/D20/D21: las cuotas «ya fue facturado» quedan Facturadas (con las dos fechas de cobranza) y las demás Pendientes.
  rows.push(eq("L6e", "cuotas facturadas (D19) con sus fechas de cobranza", expected.installmentsInvoiced, actual.installmentsInvoiced)); rows.push(eq("L6f", "cuotas pendientes", expected.installments - expected.installmentsInvoiced, actual.installmentsPending));
  const feeDiffs = mapDiff(expected.feeByCot, toMap(actual.installmentSumByWo.map(([wo, amount]) => [actual.cotByWo[wo], amount])));
  rows.push({ id: "L6d", label: "suma de cuotas por COT = honorario c/IVA legacy", expected: "iguales", actual: feeDiffs.length ? feeDiffs.slice(0, 5).join(" | ") : "iguales", ok: !feeDiffs.length, note: "" });
  rows.push(eq("L7a", "horas ejecutadas cargadas = fuente aprobada", formatUnits(expected.expectedHoursUnits), units(actual.hoursTotal), `fuente aprobada ${formatUnits(expected.executionsMigrableHours)} h; de ellas, en feriado aplicable ${expected.holidayKeptRows} filas / ${formatUnits(expected.holidayKeptHours)} h en ${expected.holidayDates.join(", ")}`));
  const cotDiffs = mapDiff(expected.hoursByCot, toMap(actual.hoursByEngagement.map(([engagement, hours]) => [actual.cotByEngagement[engagement], hours])));
  rows.push({ id: "L7b", label: "horas por COT", expected: "iguales", actual: cotDiffs.length ? cotDiffs.slice(0, 5).join(" | ") : "iguales", ok: !cotDiffs.length, note: "" });
  const staffDiffs = mapDiff(expected.hoursByStaff, toMap(actual.hoursByStaff));
  rows.push({ id: "L7c", label: "horas por persona (ficha F2)", expected: "iguales", actual: staffDiffs.length ? staffDiffs.slice(0, 5).join(" | ") : "iguales", ok: !staffDiffs.length, note: expected.unmappedProfiles.length ? `perfiles sin ficha: ${expected.unmappedProfiles.join(",")}` : "" });
  rows.push(eq("L7d", "horas cargadas en feriado aplicable = las de la fuente (carga histórica exceptuada)", formatUnits(expected.holidayKeptHours), units(actual.holidayHours)));
  // L7e/L7f (12/11/2026, revisión independiente): L7a–L7d comparan horas; estos dos comparan el NÚMERO de entradas, que no es el de filas fuente (Gerente y Supervisor se reparten 30/70).
  rows.push(eq("L7e", "entradas de horas cargadas (por persona, OT, actividad y día)", expected.expectedEntries, actual.entriesCount, `de ${expected.executionsMigrable} filas aprobadas; Gerente y Supervisor se reparten 30/70`));
  rows.push(eq("L7f", "entradas cargadas en feriado aplicable", expected.expectedHolidayEntries, actual.holidayEntries, `de ${expected.holidayKeptRows} filas fuente; calendario de EMS vigente (2026-2027)`));
  rows.push(eq("L8a", "períodos de timesheet creados", 0, actual.periods)); rows.push(eq("L8b", "líneas de aprobación creadas", 0, actual.lineApprovals));
  rows.push(eq("L8c", "horas históricas con período o forecast", 0, actual.historicWithPeriodOrForecast));
  rows.push(eq("L8d", "correos del lote enviados (status sent)", 0, actual.emailsSent));
  rows.push(eq("L8e", "correos del lote aún reclamables (pending/sending)", 0, actual.emailsClaimable));
  return { ok: rows.every((row) => row.ok), rows };
}
