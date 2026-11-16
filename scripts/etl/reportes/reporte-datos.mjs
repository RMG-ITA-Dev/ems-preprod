// Datos de los reportes de verificación Legacy ↔ EMS (solo OT de cliente). Funciones puras: no abren conexiones ni escriben archivos.
// Diccionario de columnas aprobado el 16/11/2026: bugs/ETL/reportes/diccionario_reportes_legacy_ems.md
// Los importes se calculan con enteros escalados (BigInt) y con la aritmética compartida del ETL (paymentArtifacts, expensePayload, addBusinessDays).
import { isMigrableExecution, riskLevelFromLegacy } from "../fase3-input.mjs";
import { aliasProfile, decimalUnits, expensePayload, formatUnits, paymentArtifacts } from "../fase3-transform.mjs";

export const HOURS_CUTOFF = "2026-10-30"; // D39: solo horas aprobadas con día trabajado hasta el viernes 30/10/2026.
export const OVERDUE_REFERENCE = "2026-11-06"; // Decisión de Marcelo (16/11/2026): fecha fija, la del respaldo.
export const OFFICIAL_EXCHANGE_RATE = 6.96;
export const LATE_CREATION_DAYS = 60; // obs_plan_pagos §2: fecha anterior a la creación de la OT por más de 60 días.

// 07_OT-encargo §2.3 y §3: práctica por departamento legacy y sociedad derivada de la práctica (el Legacy no guarda sociedad por OT).
const PRACTICE_BY_DEPARTMENT = Object.freeze({ 1: "Auditoría", 2: "Compliance", 3: "Tax & Advisory" });
const SOCIETY_BY_DEPARTMENT = Object.freeze({ 1: "Ruizmier Pelaez", 2: "Ruizmier Jauregui", 3: "Ruizmier Jauregui" });

const text = (value) => String(value ?? "").trim();
const POW = (exponent) => 10n ** BigInt(exponent);
const roundHalfUp = (numerator, denominator) => (numerator * 2n + denominator) / (2n * denominator);
const ceilDivide = (numerator, denominator) => (numerator + denominator - 1n) / denominator;
const money = (units) => Number(formatUnits(units, 2));
const daysBetween = (later, earlier) => Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86400000);
const addOneYear = (iso) => { const date = new Date(`${iso}T00:00:00Z`); date.setUTCFullYear(date.getUTCFullYear() + 1); return date.toISOString().slice(0, 10); };
export const formatDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const groupBy = (rows, keyOf) => { const groups = new Map(); for (const row of rows) { const key = keyOf(row); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); } return groups; };

function staffNameByProfile(staffRows) {
  const names = new Map();
  for (const row of staffRows) {
    const name = `${text(row.first_name)} ${text(row.last_name)}`.trim();
    for (const id of text(row.legacy_profile_ids).split(/[|;,\s]+/).filter(Boolean)) names.set(id, name);
  }
  return names;
}

// Honorario estándar y horas presupuestadas de una OT (08_matriz y D32). Estándar en USD = Σ horas × tarifa presupuestada.
// En una OT en BOB, la tarifa de cada línea se pasa a BOB al TC de la OT, hacia arriba al centavo (D29), y luego se multiplica por las horas.
// El ETL promedia las tarifas por categoría EMS: el estándar de una OT en BOB puede diferir de este en menos de BOB 12 (fase3-transform.mjs:149).
function budgetFigures(planRows, { bob, exchangeRateUnits }) {
  let hours = 0n; let standardUsd = 0n; let standardOt = 0n;
  for (const row of planRows) {
    const lineHours = decimalUnits(row.legacy_budget_hours, 4);
    if (lineHours <= 0n) continue;
    const rate = decimalUnits(row.legacy_budget_rate, 6);
    hours += lineHours;
    standardUsd += lineHours * rate; // escala 10
    standardOt += bob ? lineHours * ceilDivide(rate * exchangeRateUnits, POW(6)) : 0n; // escala 6 (tarifa en centavos × horas)
  }
  const standardUsdCents = roundHalfUp(standardUsd, POW(8));
  return { hoursUnits: hours, standardUsdCents, standardOtCents: bob ? roundHalfUp(standardOt, POW(4)) : standardUsdCents };
}

// Banderas de fecha de una OT (obs_plan_pagos §2): orden roto, anterior a la creación de la OT por más de 60 días y misma fecha que otra cuota.
// «Posible causa» es una inferencia: se suma un año a esa cuota y se comprueba que el plan y la creación de la OT queden coherentes.
export function dateFlags(billable, createdIso) {
  const flags = new Map();
  billable.forEach((row, index) => {
    const date = text(row.legacy_invoice_date); const reasons = []; const kinds = [];
    const previous = index > 0 ? billable[index - 1] : null;
    if (previous && date < text(previous.legacy_invoice_date)) { reasons.push(`Fecha anterior a la de la cuota ${text(previous.legacy_installment_number)} (${formatDate(text(previous.legacy_invoice_date))})`); kinds.push("orden"); }
    const daysBefore = createdIso ? daysBetween(createdIso, date) : 0;
    if (daysBefore > LATE_CREATION_DAYS) { reasons.push(`Anterior a la creación de la OT por ${daysBefore} días`); kinds.push("creacion"); }
    if (billable.some((other, otherIndex) => otherIndex !== index && text(other.legacy_invoice_date) === date)) { reasons.push("Misma fecha que otra cuota del plan"); kinds.push("misma"); }
    if (!reasons.length) return;
    const candidate = addOneYear(date);
    const coherent = billable.every((other, otherIndex) => otherIndex === index || (otherIndex < index ? text(other.legacy_invoice_date) <= candidate : candidate <= text(other.legacy_invoice_date)))
      && (!createdIso || daysBetween(createdIso, candidate) <= LATE_CREATION_DAYS);
    flags.set(text(row.legacy_installment_number), { reason: reasons.join("; "), kinds, cause: coherent ? `Posible año equivocado (¿${candidate.slice(0, 4)}?)` : "Revisar con el gerente" });
  });
  return flags;
}

/**
 * @param {object} source
 * @param {object[]} source.clientEngagements filas de alcance_*_OT_clientes.csv
 * @param {object[]} source.planHours filas de *_OT_planificacion_horas.csv
 * @param {object[]} source.expenses filas de *_OT_planificacion_gastos.csv
 * @param {object[]} source.payments filas de *_OT_plan_pagos.csv
 * @param {object[]} source.executions filas de *_horas_ejecutadas.csv
 * @param {object[]} source.clients filas de 02_clientes.csv
 * @param {object[]} source.staff filas de 03_staff.csv
 * @param {object[]} source.services filas de 06_servicios_equivalencias.csv
 * @param {string[]} [source.toleranceCots] COT con tolerancia aprobada del plan (manifiesto; D18)
 */
export function buildReportData(source, { overdueReference = OVERDUE_REFERENCE, hoursCutoff = HOURS_CUTOFF } = {}) {
  const staffNames = staffNameByProfile(source.staff);
  const clientNames = new Map(source.clients.map((row) => [text(row.source_ref), text(row.client_legal_name)]));
  const serviceNames = new Map(source.services.map((row) => [text(row.legacy_service_id), text(row.ems_service_name)]));
  const planByCot = groupBy(source.planHours, (row) => text(row.legacy_cot));
  const expensesByCot = groupBy(source.expenses, (row) => text(row.legacy_cot));
  const paymentsByCot = groupBy(source.payments, (row) => text(row.legacy_cot));
  const hoursByCot = new Map();
  for (const row of source.executions) {
    if (!isMigrableExecution(row) || text(row.legacy_worked_at).slice(0, 10) > hoursCutoff) continue;
    hoursByCot.set(text(row.legacy_cot), (hoursByCot.get(text(row.legacy_cot)) ?? 0n) + decimalUnits(row.legacy_hours, 2));
  }
  const person = (profile) => staffNames.get(aliasProfile(profile)) ?? "";

  const ot = []; const cuotas = [];
  for (const engagement of source.clientEngagements) {
    const cot = text(engagement.legacy_cot); const department = Number(text(engagement.legacy_department_id));
    const bob = text(engagement.legacy_currency_raw) === "0";
    if (!bob && text(engagement.legacy_currency_raw) !== "1") throw new Error(`moneda legacy inválida: ${cot}`);
    const exchangeRateUnits = decimalUnits(engagement.legacy_exchange_rate, 2);
    const figures = budgetFigures(planByCot.get(cot) ?? [], { bob, exchangeRateUnits });
    const presupuestadoCents = decimalUnits(engagement.legacy_fee_with_tax, 2); // presupuestoHoras (nombre engañoso del CSV)
    const expensesCents = (expensesByCot.get(cot) ?? []).filter((row) => decimalUnits(row.legacy_amount_usd, 2) > 0n)
      .reduce((sum, row) => sum + decimalUnits(expensePayload({ ...row }).amount, 2), 0n);
    const totalText = text(engagement[bob ? "legacy_fee_bob" : "legacy_fee_usd"]); // contrato legacy-agreed-total-v1
    if (!totalText) throw new Error(`total original ausente: ${cot}`);
    const executedUnits = hoursByCot.get(cot) ?? 0n;
    const budgetHours = Number(figures.hoursUnits) / 1e4; const executedHours = Number(executedUnits) / 100;
    ot.push({
      cot, gestion: Number(text(engagement.gestion)), cliente: clientNames.get(`legacy:${text(engagement.legacy_client_id)}`) ?? "",
      servicio: serviceNames.get(text(engagement.legacy_service_id)) ?? "", practica: PRACTICE_BY_DEPARTMENT[department] ?? "", sociedad: SOCIETY_BY_DEPARTMENT[department] ?? "",
      socio: person(engagement.legacy_partner_profile_id), gerente: person(engagement.legacy_manager_profile_id), finVigencia: text(engagement.ems_end_date),
      moneda: bob ? "BOB" : "USD", tc: Number(text(engagement.legacy_exchange_rate)),
      presupuestadoUsd: money(presupuestadoCents), gastos: money(expensesCents), totalAcordado: money(decimalUnits(totalText, 2)),
      estandarUsd: money(figures.standardUsdCents), estandarMoneda: money(figures.standardOtCents),
      realizacion: figures.standardUsdCents > 0n ? Number(presupuestadoCents) / Number(figures.standardUsdCents) : null,
      horasPresupuestadas: budgetHours, horasEjecutadas: executedHours, usoHoras: budgetHours > 0 ? executedHours / budgetHours : null,
      nivelRiesgo: riskLevelFromLegacy(engagement.legacy_risk_code, cot),
      ceacNumero: text(engagement.legacy_ceac_number), ceacFecha: text(engagement.legacy_ceac_approved_date), sanNumero: text(engagement.legacy_san_request_id), sanFecha: text(engagement.legacy_san_approved_date),
    });

    const rows = paymentsByCot.get(cot) ?? [];
    if (!rows.length) continue;
    const artifact = paymentArtifacts(rows, formatUnits(decimalUnits(totalText, 2)), { toleranceCots: source.toleranceCots ?? [] });
    const billable = artifact.installments; // ya ordenadas por número de cuota
    const flags = dateFlags(billable, text(engagement.legacy_created_date).slice(0, 10));
    const common = { cot, cliente: ot.at(-1).cliente, gerente: ot.at(-1).gerente, moneda: ot.at(-1).moneda };
    const tcDifferent = Number(text(engagement.legacy_exchange_rate)) !== OFFICIAL_EXCHANGE_RATE;
    for (const row of billable) {
      const number = text(row.legacy_installment_number); const flag = flags.get(number); const paymentDate = row.payment_due_date;
      cuotas.push({
        ...common, numero: Number(number), tipo: row.invoiced ? "Cuota facturada (por texto)" : "Cuota", porcentaje: Number(text(row.legacy_percentage)),
        fechaFactura: text(row.legacy_invoice_date), monto: Number(row.amount), tcPlan: bob ? null : Number(text(row.legacy_exchange_rate)),
        fechaPago: paymentDate, vencida: paymentDate <= overdueReference, textoLegacy: row.invoiced ? text(row.legacy_detail) : "",
        fechaAtipica: flag?.reason ?? "", kinds: flag?.kinds ?? [], posibleCausa: flag?.cause ?? "", facturadaPorTexto: row.invoiced === true, tcDistinto: tcDifferent,
      });
    }
    for (const row of artifact.notes) {
      cuotas.push({
        ...common, numero: Number(text(row.legacy_installment_number)), tipo: "Nota «no facturar»", porcentaje: Number(text(row.legacy_percentage)), fechaFactura: text(row.legacy_invoice_date),
        monto: null, tcPlan: null, fechaPago: null, vencida: null, textoLegacy: text(row.legacy_detail), fechaAtipica: "", kinds: [], posibleCausa: "", facturadaPorTexto: false, tcDistinto: tcDifferent,
      });
    }
  }
  cuotas.sort((a, b) => (a.cot === b.cot ? a.numero - b.numero : a.cot.localeCompare(b.cot)));
  return { ot, cuotas, observaciones: buildObservations(ot, cuotas) };
}

// Resumen para Contabilidad (reemplaza a obs_plan_pagos.md): cuatro observaciones con sus conteos y la tabla de vencidas por gerente.
export function buildObservations(ot, cuotas) {
  const real = cuotas.filter((row) => row.monto !== null);
  const count = (rows) => ({ cuotas: rows.length, ot: new Set(rows.map((row) => row.cot)).size });
  const withKind = (kind) => real.filter((row) => row.kinds.includes(kind));
  const overdue = real.filter((row) => row.vencida);
  const byOt = groupBy(real, (row) => row.cot);
  const allOverdueCots = new Set([...byOt].filter(([, rows]) => rows.every((row) => row.vencida)).map(([cot]) => cot));
  const managerOt = groupBy(ot, (row) => row.gerente || "(sin gerente)");
  const porGerente = [...managerOt].map(([gerente, list]) => {
    const cots = new Set(list.map((row) => row.cot));
    return { gerente, ot: list.length, vencidas: overdue.filter((row) => cots.has(row.cot)).length, otTodasVencidas: [...cots].filter((cot) => allOverdueCots.has(cot)).length };
  }).sort((a, b) => b.vencidas - a.vencidas || a.gerente.localeCompare(b.gerente));
  return {
    cuotasTotales: real.length, notas: count(cuotas.filter((row) => row.monto === null)),
    fechasAtipicas: { ...count(real.filter((row) => row.kinds.length)), ordenRoto: count(withKind("orden")), anteriorCreacion: count(withKind("creacion")), mismaFecha: count(withKind("misma")) },
    facturadas: count(real.filter((row) => row.facturadaPorTexto)),
    vencidas: { ...count(overdue), otTodasVencidas: allOverdueCots.size },
    tcDistinto: { ot: ot.filter((row) => row.tc !== OFFICIAL_EXCHANGE_RATE).length, menoresAlOficial: ot.filter((row) => row.tc < OFFICIAL_EXCHANGE_RATE).map((row) => row.cot) },
    porGerente,
  };
}
