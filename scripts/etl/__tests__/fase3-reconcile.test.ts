import { describe, expect, it } from "vitest";
import { BOB_ROUNDING, compareLegacyControls, holidayApplies, legacyExpectations } from "../fase3-reconcile.mjs";

const exec = (id: string, cot: string, profile: string, date: string, hours: string) => ({ legacy_execution_id: id, legacy_cot: cot, legacy_profile_id: profile, legacy_worked_at: date, legacy_hours: hours, approval_evidence_count: "1", approved_evidence_count: "1", legacy_pending_approval: "0", disposition: "migrable_aprobada" });
const inputs = {
  clientEngagements: [{ legacy_cot: "C1" }, { legacy_cot: "C2" }],
  administrativeEngagements: [{ legacy_cot: "A1" }],
  planHours: [{ legacy_budget_hours: "10.5" }, { legacy_budget_hours: "4" }],
  expenses: [
    { legacy_cot: "C1", legacy_currency_raw: "1", legacy_exchange_rate: "", legacy_amount_usd: "100.25" },
    { legacy_cot: "C2", legacy_currency_raw: "0", legacy_exchange_rate: "6.96", legacy_amount_usd: "10.10" },
    { legacy_cot: "C2", legacy_currency_raw: "0", legacy_exchange_rate: "6.96", legacy_amount_usd: "0" },
  ],
  payments: [
    { legacy_cot: "C1", proposed_disposition: "cuota_facturable", legacy_fee_with_tax: "1000" },
    { legacy_cot: "C1", proposed_disposition: "nota_plan_confirmada", legacy_fee_with_tax: "1000" },
    { legacy_cot: "C2", proposed_disposition: "cuota_facturable", legacy_fee_with_tax: "500.50" },
  ],
  executions: [exec("e1", "C1", "7", "2026-06-04", "8"), exec("e2", "C1", "7", "2026-06-05", "8"), exec("e3", "C2", "8", "2026-06-04", "4.5")],
};
const base = { inputs, staffByLegacyProfile: new Map([["7", "staff-7"], ["8", "staff-8"]]), officeByStaffId: new Map([["staff-7", 1], ["staff-8", 2]]), holidaysByDate: new Map([["2026-06-05", [1]]]) };

describe("ETL fase 3: reconciliación contra el legacy", () => {
  it("el feriado aplica por oficina del staff y las oficinas 0 aplican a todos", () => {
    const holidaysByDate = new Map([["2026-06-05", [1]], ["2026-01-01", [0]]]);
    expect(holidayApplies({ date: "2026-06-05", officeOfStaff: 1, holidaysByDate })).toBe(true);
    expect(holidayApplies({ date: "2026-06-05", officeOfStaff: 2, holidaysByDate })).toBe(false);
    expect(holidayApplies({ date: "2026-01-01T00:00:00", officeOfStaff: 2, holidaysByDate })).toBe(true);
  });
  it("el gasto BOB se redondea half-up a centavos (centavos x centésimas)", () => {
    expect(BOB_ROUNDING(1010n, 696n)).toBe(7030n);
    expect(BOB_ROUNDING(1n, 50n)).toBe(1n);
    expect(BOB_ROUNDING(1n, 49n)).toBe(0n);
  });
  it("calcula esperados independientes: horas menos feriado, gastos positivos y suma de cuotas", () => {
    const expected = legacyExpectations(base);
    expect(expected.planHoursUnits).toBe(1450n);
    expect(expected.expensesPositive).toBe(2n); expect(expected.expensesZeroOmitted).toBe(1n);
    expect(expected.expensesEmsUnits).toBe(10025n + 7030n);
    expect(expected.installments).toBe(2n); expect(expected.notes).toBe(1n); expect(expected.plans).toBe(2n);
    expect(expected.holidayExcludedRows).toBe(1n); expect(expected.holidayExcludedHours).toBe(800n);
    expect(expected.expectedHoursUnits).toBe(800n + 450n);
    expect(expected.hoursByCot.get("C1")).toBe(800n); expect(expected.hoursByStaff.get("staff-8")).toBe(450n);
  });
  const actualFor = (expected: ReturnType<typeof legacyExpectations>) => ({
    clientEngagements: 2, administrativeEngagements: 1, matrixHours: "14.50", expensesCount: 2, expensesAmount: "170.55",
    expenseByWo: [["wo1", "100.25"], ["wo2", "70.30"]], plans: 2, installments: 2, notes: 1, installmentSumByWo: [["wo1", "1000"], ["wo2", "500.50"]],
    hoursTotal: "12.50", hoursByEngagement: [["e1", "8"], ["e2", "4.5"]], hoursByStaff: [["staff-7", "8"], ["staff-8", "4.5"]],
    holidayEntries: 0, periods: 0, lineApprovals: 0, historicWithPeriodOrForecast: 0, emailsSent: 0, emailsClaimable: 0,
    cotByWo: { wo1: "C1", wo2: "C2" }, cotByEngagement: { e1: "C1", e2: "C2" }, _expected: expected,
  });
  it("concilia cuando la base coincide y marca la diferencia exacta cuando no", () => {
    const expected = legacyExpectations(base);
    expect(compareLegacyControls(expected, actualFor(expected)).ok).toBe(true);
    const drifted = { ...actualFor(expected), hoursByStaff: [["staff-7", "8"], ["staff-8", "5.5"]], installmentSumByWo: [["wo1", "1000"], ["wo2", "500.49"]], periods: 1 };
    const result = compareLegacyControls(expected, drifted);
    expect(result.ok).toBe(false);
    expect(result.rows.filter((row) => !row.ok).map((row) => row.id).sort()).toEqual(["L6d", "L7c", "L8a"]);
  });
});
