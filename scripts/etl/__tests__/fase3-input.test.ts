import { describe, expect, it } from "vitest";
import { ADMINISTRATIVE_HEADERS, EXECUTION_HEADERS, EXPENSE_HEADERS, PAYMENT_HEADERS, PLAN_NOTE_KEYS, validateExecutions, validateExpenses, validateInputs, validatePayments } from "../fase3-input.mjs";
import { ENGAGEMENT_HEADERS, PLAN_HEADERS } from "../fase3-matrix.mjs";

const row = (headers: string[], values: Record<string, string>) => Object.fromEntries(headers.map((header) => [header, values[header] ?? ""]));
const client = (cot = "2026.11.001") => row(ENGAGEMENT_HEADERS, { legacy_cot: cot, gestion: "2026", legacy_client_id: "62", legacy_approval_status: "1" });
const admin = () => row(ADMINISTRATIVE_HEADERS, { legacy_cot: "ADM-1", legacy_fiscal_year: "2027", legacy_active_flag: "1", selector_profile_count: "138", total_administrative_engagements: "10", legacy_internal_client_id: "62", legacy_partner_profile_id: "68", legacy_engagement_name: "Administrativo" });
const plan = () => row(PLAN_HEADERS, { legacy_plan_hours_id: "p1", legacy_cot: "2026.11.001", legacy_budget_hours: "1", legacy_category_id: "1", legacy_specialty_id: "2" });

describe("ETL fase 3: contratos de entrada", () => {
  it("rechaza COT cliente excluido y duplicidades", () => {
    expect(() => validateInputs({ clientEngagements: [client("2026.11.108")], administrativeEngagements: [admin()], planHours: [], expenses: [], payments: [], executions: [] })).toThrow(/excluido/);
    expect(() => validateInputs({ clientEngagements: [client(), client()], administrativeEngagements: [admin()], planHours: [], expenses: [], payments: [], executions: [] })).toThrow(/duplicada/);
  });
  it("deriva las cuatro notas exclusivamente por COT/cuota", () => {
    const cot = "2026.22.003"; const payments = [row(PAYMENT_HEADERS, { legacy_plan_payment_id: "x", legacy_cot: cot, legacy_installment_number: "13", legacy_percentage: "4", legacy_invoice_date: "2026-01-01", proposed_disposition: "nota_plan_confirmada" })];
    expect(PLAN_NOTE_KEYS.has(`${cot}|13`)).toBe(true); expect(() => validatePayments(payments, new Set([cot]))).not.toThrow();
    expect(() => validatePayments([{ ...payments[0], proposed_disposition: "cuota_facturable" }], new Set([cot]))).toThrow(/contradice/);
  });
  it("incluye aprobadas no enviadas y excluye evidencia no aprobada", () => {
    const approved = row(EXECUTION_HEADERS, { legacy_execution_id: "e1", legacy_cot: "2026.11.001", legacy_hours: "4", approval_evidence_count: "1", approved_evidence_count: "1", legacy_pending_approval: "0", legacy_sent: "0", disposition: "migrable_aprobada" });
    expect(() => validateExecutions([approved], new Set([approved.legacy_cot]))).not.toThrow();
    expect(() => validateExecutions([{ ...approved, legacy_execution_id: "e2", approved_evidence_count: "0", disposition: "migrable" }], new Set([approved.legacy_cot]))).toThrow(/contradice/);
  });
  it("bloquea gastos BOB sin TC y conserva cero como disposición", () => {
    const expense = row(EXPENSE_HEADERS, { legacy_expense_budget_id: "g1", legacy_cot: "2026.11.001", legacy_currency_raw: "0", legacy_exchange_rate: "0", legacy_amount_usd: "1", disposition: "migrable" });
    expect(() => validateExpenses([expense], new Set([expense.legacy_cot]))).toThrow(/TC BOB/);
  });
});
