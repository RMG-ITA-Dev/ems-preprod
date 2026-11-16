import { describe, expect, it } from "vitest";
import { ADMINISTRATIVE_HEADERS, EXECUTION_HEADERS, EXPENSE_HEADERS, PAYMENT_HEADERS, assertRiskLevelCounts, isInvoicedInstallment, isPlanNote, riskLevelFromLegacy, validateExecutions, validateExpenses, validateInputs, validatePayments, validateExecutionStarts } from "../fase3-input.mjs";
import { ENGAGEMENT_HEADERS, PLAN_HEADERS } from "../fase3-matrix.mjs";

const row = (headers: string[], values: Record<string, string>) => Object.fromEntries(headers.map((header) => [header, values[header] ?? ""]));
const client = (cot = "2026.11.001", risk = "1") => row(ENGAGEMENT_HEADERS, { legacy_cot: cot, gestion: "2026", legacy_client_id: "62", legacy_approval_status: "1", legacy_risk_code: risk });
const admin = () => row(ADMINISTRATIVE_HEADERS, { legacy_cot: "ADM-1", legacy_fiscal_year: "2027", legacy_active_flag: "1", legacy_internal_client_id: "62", legacy_partner_profile_id: "68", legacy_approver_profile_id: "94", legacy_engagement_name: "Administrativo" });
const plan = () => row(PLAN_HEADERS, { legacy_plan_hours_id: "p1", legacy_cot: "2026.11.001", legacy_budget_hours: "1", legacy_category_id: "1", legacy_specialty_id: "2" });

describe("ETL fase 3: contratos de entrada", () => {
  it("rechaza COT cliente excluido y duplicidades", () => {
    expect(() => validateInputs({ clientEngagements: [client("2026.11.108")], administrativeEngagements: [admin()], planHours: [], expenses: [], payments: [], executions: [] })).toThrow(/excluido/);
    expect(() => validateInputs({ clientEngagements: [client(), client()], administrativeEngagements: [admin()], planHours: [], expenses: [], payments: [], executions: [] })).toThrow(/duplicada/);
  });
  it("traduce el código de riesgo legacy (1 Bajo, 2 Moderado, 3 Alto, confirmado por TI el 06/11/2026) y rechaza cualquier otro", () => {
    expect(riskLevelFromLegacy("1")).toBe("Bajo"); expect(riskLevelFromLegacy("2")).toBe("Moderado"); expect(riskLevelFromLegacy("3")).toBe("Alto");
    expect(riskLevelFromLegacy(" 2 ")).toBe("Moderado"); // el legacy trae espacios
    for (const bad of ["", "0", "4", "10", "12", "-1", "1.5", "Bajo", null, undefined]) expect(() => riskLevelFromLegacy(bad as any, "2026.11.001")).toThrow(/riesgo legacy no reconocido/);
    expect(() => riskLevelFromLegacy("9", "2026.11.001")).toThrow(/2026\.11\.001/);
  });
  it("la validación offline de los encargos cliente falla en `validate` ante un código de riesgo no reconocido", () => {
    const inputs = (risk: string) => ({ clientEngagements: [client("2026.11.001", risk)], administrativeEngagements: [admin()], planHours: [], expenses: [], payments: [], executions: [] });
    expect(() => validateInputs(inputs("0"))).toThrow(/riesgo legacy no reconocido/);
    expect(() => validateInputs(inputs(""))).toThrow(/riesgo legacy no reconocido/);
  });
  it("las notas y las cuotas facturadas salen de la disposición de la fila y deben coincidir con la lista explícita del manifiesto", () => {
    const cot = "2026.22.003";
    const pay = (n: string, disposition: string) => row(PAYMENT_HEADERS, { legacy_plan_payment_id: `p${n}`, legacy_cot: cot, legacy_installment_number: n, legacy_percentage: "4", legacy_invoice_date: "2026-01-01", proposed_disposition: disposition });
    const payments = [pay("1", "cuota_facturada"), pay("2", "cuota_facturable"), pay("13", "nota_plan_confirmada")];
    expect(isPlanNote(payments[2])).toBe(true); expect(isPlanNote(payments[1])).toBe(false); expect(isInvoicedInstallment(payments[0])).toBe(true); expect(isInvoicedInstallment(payments[1])).toBe(false);
    const manifest = { snapshot: "m", planNotes: [`${cot}|13`], invoicedInstallments: [`${cot}|1`] };
    expect(() => validatePayments(payments, new Set([cot]), { manifest })).not.toThrow();
    // Una nota o una cuota facturada que el manifiesto no declara (o que falta) bloquea: no se detecta por texto.
    expect(() => validatePayments(payments, new Set([cot]), { manifest: { ...manifest, planNotes: [] } })).toThrow(/notas del plan no coinciden/);
    expect(() => validatePayments(payments, new Set([cot]), { manifest: { ...manifest, invoicedInstallments: [`${cot}|2`] } })).toThrow(/cuotas facturadas no coinciden/);
    expect(() => validatePayments([{ ...payments[0], proposed_disposition: "inventada" }], new Set([cot]))).toThrow(/contradice/);
  });
  it("el reparto de niveles de riesgo se compara con el manifiesto solo si está declarado", () => {
    const levels = [...Array(137).fill("Bajo"), ...Array(18).fill("Moderado")];
    expect(() => assertRiskLevelCounts(levels, { Bajo: 137, Moderado: 18, Alto: 0 })).not.toThrow();
    expect(() => assertRiskLevelCounts(levels, { Bajo: 136, Moderado: 19, Alto: 0 })).toThrow(/Bajo: 137 de 136; Moderado: 18 de 19/);
    expect(() => assertRiskLevelCounts([...levels, "Alto"], { Bajo: 137, Moderado: 18 })).toThrow(/Alto: 1 de 0/);
    expect(() => assertRiskLevelCounts(levels, null)).not.toThrow();
    expect(() => assertRiskLevelCounts(["Crítico"], { Bajo: 1 })).toThrow(/desconocido/);
  });
  it("administrativas: sin selector, con año 2027 y con socio y aprobador obligatorios; clientes de gestión 2024 a 2027", () => {
    expect(() => validateInputs({ clientEngagements: [client()], administrativeEngagements: [admin()], planHours: [], expenses: [], payments: [], executions: [] })).not.toThrow();
    expect(() => validateInputs({ clientEngagements: [client()], administrativeEngagements: [{ ...admin(), legacy_approver_profile_id: "" }], planHours: [], expenses: [], payments: [], executions: [] })).toThrow(/incompleto/);
    expect(() => validateInputs({ clientEngagements: [client()], administrativeEngagements: [{ ...admin(), legacy_fiscal_year: "2026" }], planHours: [], expenses: [], payments: [], executions: [] })).toThrow(/fuera de alcance/);
    for (const year of ["2024", "2025"]) expect(() => validateInputs({ clientEngagements: [{ ...client(`${year}.22.007`), gestion: year }], administrativeEngagements: [admin()], planHours: [], expenses: [], payments: [], executions: [] })).not.toThrow();
    expect(() => validateInputs({ clientEngagements: [{ ...client("2023.11.001"), gestion: "2023" }], administrativeEngagements: [admin()], planHours: [], expenses: [], payments: [], executions: [] })).toThrow(/fuera de alcance/);
  });
  // R403-04: el fin de vigencia y su reparto se validan offline (antes del reset), con la misma resolución que usa F3 al armar los encargos.
  it("validate offline comprueba ems_end_date y su reparto con el manifiesto, y conserva el fin por gestión de los manifiestos anteriores", () => {
    const withEnd = (cot: string, end: string) => ({ ...client(cot), ems_end_date: end });
    const inputs = (rows: any[]) => ({ clientEngagements: rows, administrativeEngagements: [admin()], planHours: [], expenses: [], payments: [], executions: [] });
    const manifest = (endDates: any) => ({ snapshot: "m", planNotes: [], invoicedInstallments: [], f3: { clientEngagements: 2, administrativeEngagements: 1, endDates } });
    const dates = { allowed: ["2026-11-30", "2027-09-30"], byYear: null, counts: { "2026-11-30": 1, "2027-09-30": 1 } };
    const run = (rows: any[], endDates: any, environment = "test") => validateInputs(inputs(rows), { enforceExpected: true, manifest: manifest(endDates), environment });
    const ok = [withEnd("2026.11.001", "2026-11-30"), withEnd("2026.11.002", "2027-09-30")];
    expect(() => run(ok, dates)).not.toThrow();
    expect(() => run([withEnd("2026.11.001", ""), ok[1]], dates)).toThrow(/no resuelto/);
    expect(() => run([withEnd("2026.11.001", "2026-11-15"), ok[1]], dates)).toThrow(/no permitido/);
    expect(() => run([ok[0], withEnd("2026.11.002", "2026-11-30")], dates)).toThrow(/fines de vigencia fuera del manifiesto/);
    // Sin reparto declarado: en local no se compara (pero una fecha irresoluble sigue bloqueando); fuera de local, bloquea.
    expect(() => run(ok, { ...dates, counts: null }, "local")).not.toThrow();
    expect(() => run(ok, { ...dates, counts: null }, "test")).toThrow(/sin declarar/);
    // Manifiesto anterior: fin por gestión cuando el CSV no trae ems_end_date, y manifiestos sin endDates no se ven afectados.
    expect(() => run([withEnd("2026.11.001", ""), withEnd("2026.11.002", "")], { allowed: ["2027-09-30"], byYear: { "2026": "2027-09-30" }, counts: { "2027-09-30": 2 } })).not.toThrow();
    expect(() => run(ok, undefined)).not.toThrow();
  });
  it("el alcance esperado sale del manifiesto: se aplica si está declarado, no en local si es null y bloquea fuera de local", () => {
    const inputs = { clientEngagements: [client()], administrativeEngagements: [admin()], planHours: [], expenses: [], payments: [], executions: [] };
    const manifest = (clients: number | null, admins: number | null) => ({ snapshot: "m", planNotes: [], invoicedInstallments: [], f3: { clientEngagements: clients, administrativeEngagements: admins } });
    expect(() => validateInputs(inputs, { enforceExpected: true, manifest: manifest(1, 1), environment: "test" })).not.toThrow();
    expect(() => validateInputs(inputs, { enforceExpected: true, manifest: manifest(2, 1), environment: "test" })).toThrow(/exige 2 COT cliente/);
    expect(() => validateInputs(inputs, { enforceExpected: true, manifest: manifest(null, 1), environment: "local" })).not.toThrow();
    expect(() => validateInputs(inputs, { enforceExpected: true, manifest: manifest(null, 1), environment: "test" })).toThrow(/sin declarar/);
    expect(() => validateInputs(inputs, { enforceExpected: true })).toThrow(/exige el manifiesto/);
  });
  it("incluye aprobadas no enviadas y excluye evidencia no aprobada", () => {
    const approved = row(EXECUTION_HEADERS, { legacy_execution_id: "e1", legacy_cot: "2026.11.001", legacy_worked_at: "2026-01-03", legacy_registered_at: "2026-01-05 10:00:00", legacy_hours: "4", approval_evidence_count: "1", approved_evidence_count: "1", legacy_pending_approval: "0", legacy_sent: "0", disposition: "migrable_aprobada" });
    expect(() => validateExecutions([approved], new Set([approved.legacy_cot]))).not.toThrow();
    expect(() => validateExecutions([{ ...approved, legacy_execution_id: "e2", approved_evidence_count: "0", disposition: "migrable" }], new Set([approved.legacy_cot]))).toThrow(/contradice/);
  });
  it("exige el día trabajado (AAAA-MM-DD): una marca de registro con hora se rechaza", () => {
    const approved = row(EXECUTION_HEADERS, { legacy_execution_id: "e1", legacy_cot: "2026.11.001", legacy_worked_at: "2026-01-03", legacy_hours: "4", approval_evidence_count: "1", approved_evidence_count: "1", legacy_pending_approval: "0", legacy_sent: "0", disposition: "migrable_aprobada" });
    expect(() => validateExecutions([{ ...approved, legacy_worked_at: "2026-01-03 10:15:00" }], new Set([approved.legacy_cot]))).toThrow(/día trabajado inválido/);
    expect(() => validateExecutions([{ ...approved, legacy_worked_at: "" }], new Set([approved.legacy_cot]))).toThrow(/día trabajado inválido/);
  });
  it("ninguna hora puede ser anterior al inicio de su encargo; el mismo día sí", () => {
    const exec = (worked: string, extra = {}) => row(EXECUTION_HEADERS, { legacy_execution_id: "e1", legacy_cot: "2026.21.098", legacy_worked_at: worked, legacy_hours: "4", approval_evidence_count: "1", approved_evidence_count: "1", legacy_pending_approval: "0", disposition: "migrable_aprobada", ...extra });
    const engagements = [{ legacy_cot: "2026.21.098", ems_start_date: "2026-03-23" }];
    expect(() => validateExecutionStarts([exec("2026-03-23")], engagements)).not.toThrow();
    expect(() => validateExecutionStarts([exec("2026-03-22")], engagements)).toThrow(/anterior al inicio del encargo 2026\.21\.098/);
    // una hora no aprobada no obliga a mover el inicio
    expect(() => validateExecutionStarts([exec("2026-03-01", { approved_evidence_count: "0", disposition: "excluida_no_aprobada" })], engagements)).not.toThrow();
  });
  it("bloquea gastos BOB sin TC y conserva cero como disposición", () => {
    const expense = row(EXPENSE_HEADERS, { legacy_expense_budget_id: "g1", legacy_cot: "2026.11.001", legacy_currency_raw: "0", legacy_exchange_rate: "0", legacy_amount_usd: "1", disposition: "migrable" });
    expect(() => validateExpenses([expense], new Set([expense.legacy_cot]))).toThrow(/TC BOB/);
  });
});
