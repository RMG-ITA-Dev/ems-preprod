// Contratos de entrada para ETL Fase 3. Este módulo no abre conexiones ni escribe datos.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ENGAGEMENT_HEADERS, PLAN_HEADERS } from "./fase3-matrix.mjs";
import { parseCsv } from "./fase2-input.mjs";
import { declared as declaredCount } from "./snapshot-manifest.mjs";

export const EXPENSE_HEADERS = ["legacy_expense_budget_id", "legacy_cot", "legacy_currency_raw", "legacy_exchange_rate", "legacy_expense_type_id", "legacy_amount_usd", "disposition"];
export const PAYMENT_HEADERS = ["legacy_plan_payment_id", "legacy_cot", "legacy_installment_number", "legacy_detail", "legacy_percentage", "legacy_invoice_date", "legacy_currency_raw", "legacy_exchange_rate", "legacy_fee_with_tax", "proposed_disposition"];
export const ADMINISTRATIVE_HEADERS = ["legacy_cot", "legacy_fiscal_year", "legacy_sequence", "legacy_internal_client_id", "legacy_engagement_name", "legacy_partner_profile_id", "legacy_approver_profile_id", "legacy_created_date", "legacy_closing_date", "legacy_active_flag", "legacy_creator_profile_id", "legacy_comments", "legacy_evidence_rows", "legacy_evidence_hours", "selector_profile_count", "total_administrative_engagements"];
export const EXECUTION_HEADERS = ["legacy_execution_id", "legacy_approval_id", "legacy_cot", "legacy_profile_id", "legacy_sqr_profile_id", "legacy_department_id", "legacy_fiscal_year", "legacy_worked_at", "legacy_registered_at", "legacy_day", "legacy_week", "legacy_hours", "legacy_category_id", "legacy_specialty_id", "legacy_sent", "legacy_pending_approval", "legacy_recovery_count", "legacy_last_recovery_at", "legacy_engagement_created_date", "approval_evidence_count", "approved_evidence_count", "disposition"];

export const INPUT_HEADERS = Object.freeze({
  clientEngagements: ENGAGEMENT_HEADERS,
  planHours: PLAN_HEADERS,
  expenses: EXPENSE_HEADERS,
  payments: PAYMENT_HEADERS,
  administrativeEngagements: ADMINISTRATIVE_HEADERS,
  executions: EXECUTION_HEADERS,
});
export const CLIENT_EXCLUSION = "2026.11.108";

export class Fase3InputError extends Error {
  constructor(message, code = "BLOQUEADO") { super(message); this.code = code; }
}

const text = (value) => String(value ?? "").trim();
const key = (...values) => values.map(text).join("|");
const number = (value, label) => {
  if (!/^-?\d+(?:\.\d+)?$/.test(text(value))) throw new Fase3InputError(`${label} no es decimal válido`);
  return Number(value);
};
const unique = (rows, makeKey, label) => {
  const seen = new Set();
  for (const row of rows) { const value = makeKey(row); if (!value || seen.has(value)) throw new Fase3InputError(`${label} duplicada o vacía: ${value || "(vacía)"}`); seen.add(value); }
};
const bool01 = (value, label) => {
  if (!["0", "1", "true", "false"].includes(text(value).toLowerCase())) throw new Fase3InputError(`${label} inválido`);
  return ["1", "true"].includes(text(value).toLowerCase());
};

export function fingerprint(rows) {
  const content = rows.map((row) => Object.keys(row).sort().map((name) => `${name}=${row[name] ?? ""}`).join("\u001f")).join("\n");
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function readInput(file, name) {
  const headers = INPUT_HEADERS[name];
  if (!headers) throw new Fase3InputError(`entrada F3 desconocida: ${name}`, "CONFIG");
  return parseCsv(readFileSync(file, "utf8"), headers, name);
}

// Nivel de riesgo de la OT (enmienda F3-Q12, 06/11/2026): el legacy guarda OrdenTrabajoCliente.riesgo como entero y TI confirmó con su
// interfaz que 1 = Bajo, 2 = Moderado y 3 = Alto (los tres valores que admite work_orders_risk_level_check). Cualquier otro valor,
// nulo o vacío bloquea la carga: no se infiere.
export const RISK_LEVEL_BY_LEGACY_CODE = Object.freeze({ 1: "Bajo", 2: "Moderado", 3: "Alto" });
export function riskLevelFromLegacy(code, cot = "") {
  const key = text(code);
  const level = /^[123]$/.test(key) ? RISK_LEVEL_BY_LEGACY_CODE[key] : undefined;
  if (!level) throw new Fase3InputError(`riesgo legacy no reconocido (COT ${cot || "?"}): '${key}'`);
  return level;
}

// El reparto de niveles de riesgo (137 Bajo y 18 Moderado al 06/11) lo declara el manifiesto; null = sin declarar (no se aplica).
export function assertRiskLevelCounts(levels, declared) {
  if (!declared) return;
  const actual = { Bajo: 0, Moderado: 0, Alto: 0 }; for (const level of levels) { if (!(level in actual)) throw new Fase3InputError(`nivel de riesgo desconocido: ${level}`); actual[level] += 1; }
  const diffs = Object.keys(actual).filter((level) => actual[level] !== (declared[level] ?? 0)).map((level) => `${level}: ${actual[level]} de ${declared[level] ?? 0}`);
  if (diffs.length) throw new Fase3InputError(`niveles de riesgo distintos de los del manifiesto (${diffs.join("; ")})`);
}

export function validateClientEngagements(rows) {
  unique(rows, (row) => row.legacy_cot, "COT cliente");
  for (const row of rows) {
    if (text(row.legacy_cot) === CLIENT_EXCLUSION || text(row.legacy_client_id) === "65") throw new Fase3InputError(`COT/cliente excluido en alcance cliente: ${row.legacy_cot}`);
    // Gestiones 2024 a 2027 (D16: las OT de gestión anterior con horas aprobadas desde el 01/01/2026 entran; EMS admite años fiscales 2020 a 2100).
    if (!["2024", "2025", "2026", "2027"].includes(text(row.gestion)) || !["1", "2"].includes(text(row.legacy_approval_status))) throw new Fase3InputError(`encargo cliente fuera de alcance: ${row.legacy_cot}`);
    riskLevelFromLegacy(row.legacy_risk_code, row.legacy_cot);
  }
  return rows;
}

export function validateAdministrativeEngagements(rows) {
  unique(rows, (row) => row.legacy_cot, "COT administrativo");
  for (const row of rows) {
    // D12/D22 (10/11/2026): todas las administrativas activas de gestión 2027, sin selector de personal; el total sale del manifiesto.
    if (text(row.legacy_fiscal_year) !== "2027" || !bool01(row.legacy_active_flag, "active_flag")) throw new Fase3InputError(`administrativo fuera de alcance: ${row.legacy_cot}`);
    // El equipo administrativo es socio + gerente (el aprobador del legacy): ambos son obligatorios.
    if (!text(row.legacy_internal_client_id) || !text(row.legacy_partner_profile_id) || !text(row.legacy_approver_profile_id) || !text(row.legacy_engagement_name)) throw new Fase3InputError(`administrativo incompleto: ${row.legacy_cot}`);
  }
  return rows;
}

export function validatePlanHours(rows, clientCots) {
  unique(rows, (row) => row.legacy_plan_hours_id, "PK planificación");
  for (const row of rows) {
    if (!clientCots.has(row.legacy_cot)) throw new Fase3InputError(`planificación sin COT cliente: ${row.legacy_plan_hours_id}`);
    if (number(row.legacy_budget_hours, `horas ${row.legacy_plan_hours_id}`) < 0) throw new Fase3InputError(`horas negativas: ${row.legacy_plan_hours_id}`);
  }
  return rows;
}

export function validateExpenses(rows, clientCots) {
  unique(rows, (row) => row.legacy_expense_budget_id, "PK gasto");
  for (const row of rows) {
    const amount = number(row.legacy_amount_usd, `importe gasto ${row.legacy_expense_budget_id}`);
    if (!clientCots.has(row.legacy_cot) || amount < 0 || !["0", "1"].includes(text(row.legacy_currency_raw))) throw new Fase3InputError(`gasto inválido: ${row.legacy_expense_budget_id}`);
    const expected = amount === 0 ? "omitida_cero" : "migrable";
    if (text(row.disposition) !== expected) throw new Fase3InputError(`disposición de gasto contradice fuente: ${row.legacy_expense_budget_id}`);
    if (amount > 0 && text(row.legacy_currency_raw) === "0" && number(row.legacy_exchange_rate, "TC gasto") <= 0) throw new Fase3InputError(`TC BOB ausente: ${row.legacy_expense_budget_id}`);
  }
  return rows;
}

// Disposiciones de una fila del plan de pagos (columna proposed_disposition del CSV):
//   nota_plan_confirmada | plan_note   → nota del plan («no facturar»); no es una cuota.
//   cuota_facturable | installment      → cuota que nace Pendiente.
//   cuota_facturada | invoiced          → cuota cuyo detalle legacy dice que ya fue facturada (D19/D20): se carga Facturada (no Cobrada).
// El conjunto de notas y de cuotas facturadas lo declara el manifiesto del snapshot (lista explícita COT|cuota, nunca por texto: R-09).
const NOTE_DISPOSITIONS = ["nota_plan_confirmada", "plan_note"]; const INSTALLMENT_DISPOSITIONS = ["cuota_facturable", "installment"]; const INVOICED_DISPOSITIONS = ["cuota_facturada", "invoiced"];
export const paymentKey = (row) => key(row.legacy_cot, row.legacy_installment_number);
export function isPlanNote(row) { return NOTE_DISPOSITIONS.includes(text(row.proposed_disposition)); }
export function isInvoicedInstallment(row) { return INVOICED_DISPOSITIONS.includes(text(row.proposed_disposition)); }
const paymentDispositionKnown = (row) => [...NOTE_DISPOSITIONS, ...INSTALLMENT_DISPOSITIONS, ...INVOICED_DISPOSITIONS].includes(text(row.proposed_disposition));
const sameSet = (actual, expected) => actual.size === expected.size && [...actual].every((item) => expected.has(item));
const diffText = (actual, expected) => `faltan [${[...expected].filter((item) => !actual.has(item)).join(", ")}] y sobran [${[...actual].filter((item) => !expected.has(item)).join(", ")}]`;
export function validatePayments(rows, clientCots, { manifest = null } = {}) {
  unique(rows, (row) => row.legacy_plan_payment_id, "PK pago"); unique(rows, paymentKey, "COT/cuota");
  for (const row of rows) {
    if (!clientCots.has(row.legacy_cot) || number(row.legacy_percentage, "porcentaje") < 0 || !text(row.legacy_invoice_date)) throw new Fase3InputError(`pago inválido: ${row.legacy_plan_payment_id}`);
    if (!paymentDispositionKnown(row)) throw new Fase3InputError(`disposición de pago contradice fuente: ${row.legacy_plan_payment_id}`);
  }
  if (manifest) {
    const notes = new Set(rows.filter(isPlanNote).map(paymentKey)); const expectedNotes = new Set(manifest.planNotes);
    if (!sameSet(notes, expectedNotes)) throw new Fase3InputError(`las notas del plan no coinciden con el manifiesto ${manifest.snapshot}: ${diffText(notes, expectedNotes)}`);
    const invoiced = new Set(rows.filter(isInvoicedInstallment).map(paymentKey)); const expectedInvoiced = new Set(manifest.invoicedInstallments);
    if (!sameSet(invoiced, expectedInvoiced)) throw new Fase3InputError(`las cuotas facturadas no coinciden con el manifiesto ${manifest.snapshot}: ${diffText(invoiced, expectedInvoiced)}`);
  }
  return rows;
}

export function approvedExecution(row) { return text(row.approval_evidence_count) === "1" && text(row.approved_evidence_count) === "1" && text(row.legacy_pending_approval) === "0"; }
export function isMigrableExecution(row) { return approvedExecution(row) && ["migrable_aprobada", "migrable"].includes(text(row.disposition)); }
export function validateExecutions(rows, clientCots) {
  unique(rows, (row) => row.legacy_execution_id, "PK ejecución");
  for (const row of rows) {
    if (!clientCots.has(row.legacy_cot) || number(row.legacy_hours, `horas ejecución ${row.legacy_execution_id}`) <= 0) throw new Fase3InputError(`ejecución inválida: ${row.legacy_execution_id}`);
    // legacy_worked_at es el día trabajado (Semanas); la fecha de registro viaja aparte en legacy_registered_at.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(row.legacy_worked_at))) throw new Fase3InputError(`día trabajado inválido (se espera AAAA-MM-DD, no la fecha de registro): ${row.legacy_execution_id}`);
    const matches = approvedExecution(row) ? isMigrableExecution(row) : text(row.disposition) === "excluida_no_aprobada";
    if (!matches) throw new Fase3InputError(`disposición de ejecución contradice evidencia: ${row.legacy_execution_id}`);
  }
  return rows;
}

// Ninguna hora puede ser anterior al inicio de su encargo: el inicio es la menor fecha entre la creación y la primera hora trabajada.
export function validateExecutionStarts(executions, clientEngagements) {
  const start = new Map(clientEngagements.map((row) => [row.legacy_cot, text(row.ems_start_date).slice(0, 10)]));
  for (const row of executions.filter(isMigrableExecution)) {
    const first = start.get(row.legacy_cot);
    if (first && text(row.legacy_worked_at) < first) throw new Fase3InputError(`hora anterior al inicio del encargo ${row.legacy_cot}: ${text(row.legacy_worked_at)} < ${first} (ejecución ${row.legacy_execution_id})`);
  }
  return executions;
}

export function validateInputs(inputs, { enforceExpected = false, manifest = null, environment = "local" } = {}) {
  const clientEngagements = validateClientEngagements(inputs.clientEngagements);
  const clientCots = new Set(clientEngagements.map((row) => row.legacy_cot));
  validateAdministrativeEngagements(inputs.administrativeEngagements);
  validatePlanHours(inputs.planHours, clientCots); validateExpenses(inputs.expenses, clientCots); validatePayments(inputs.payments, clientCots, { manifest }); validateExecutions(inputs.executions, clientCots); validateExecutionStarts(inputs.executions, clientEngagements);
  if (enforceExpected) {
    if (!manifest) throw new Fase3InputError("enforceExpected exige el manifiesto del snapshot", "CONFIG");
    // null = sin declarar: en local no se aplica; en Test y producción bloquea (declared lanza).
    const wantClient = declaredCount(environment, manifest.f3.clientEngagements, "f3.clientEngagements"); const wantAdmin = declaredCount(environment, manifest.f3.administrativeEngagements, "f3.administrativeEngagements");
    if ((wantClient !== null && clientEngagements.length !== wantClient) || (wantAdmin !== null && inputs.administrativeEngagements.length !== wantAdmin)) throw new Fase3InputError(`el alcance F3 exige ${wantClient} COT cliente y ${wantAdmin} administrativos (manifiesto ${manifest.snapshot})`);
  }
  return Object.freeze({ ...inputs, fingerprints: Object.fromEntries(Object.entries(inputs).map(([name, rows]) => [name, fingerprint(rows)])), clientCots });
}
