import { describe, expect, it } from "vitest";
import { BOB_ROUNDING, compareLegacyControls, holidayApplies, legacyExpectations } from "../fase3-reconcile.mjs";

// Departamento 1 (AUD) y categoría 9 (Asistente: una sola entrada); con categoría 3 (Gerente) la hora se reparte 30/70 en dos entradas.
const exec = (id: string, cot: string, profile: string, date: string, hours: string, category = "9") => ({ legacy_execution_id: id, legacy_cot: cot, legacy_profile_id: profile, legacy_department_id: "1", legacy_category_id: category, legacy_specialty_id: "", legacy_sqr_profile_id: "", legacy_worked_at: date, legacy_hours: hours, approval_evidence_count: "1", approved_evidence_count: "1", legacy_pending_approval: "0", disposition: "migrable_aprobada" });
const inputs = {
  clientEngagements: [{ legacy_cot: "C1", legacy_risk_code: "1" }, { legacy_cot: "C2", legacy_risk_code: "2" }],
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
  it("el gasto BOB se redondea hacia arriba a centavos (centavos x centésimas)", () => {
    expect(BOB_ROUNDING(1010n, 696n)).toBe(7030n);
    expect(BOB_ROUNDING(1n, 50n)).toBe(1n);
    expect(BOB_ROUNDING(1n, 49n)).toBe(1n); // hacia arriba (D29)
    expect(BOB_ROUNDING(100n, 100n)).toBe(100n); // exacto: no sube
  });
  it("calcula esperados independientes: todas las horas (el feriado se contabiliza aparte), gastos positivos y suma de cuotas", () => {
    const expected = legacyExpectations(base);
    expect(expected.planHoursUnits).toBe(1450n);
    expect(expected.expensesPositive).toBe(2n); expect(expected.expensesZeroOmitted).toBe(1n);
    expect(expected.expensesEmsUnits).toBe(10025n + 7030n);
    expect(expected.installments).toBe(2n); expect(expected.notes).toBe(1n); expect(expected.plans).toBe(2n);
    expect(expected.holidayKeptRows).toBe(1n); expect(expected.holidayKeptHours).toBe(800n);
    expect(expected.expectedHoursUnits).toBe(800n + 800n + 450n);
    expect(expected.hoursByCot.get("C1")).toBe(1600n); expect(expected.hoursByStaff.get("staff-7")).toBe(1600n); expect(expected.hoursByStaff.get("staff-8")).toBe(450n);
  });
  const actualFor = (expected: ReturnType<typeof legacyExpectations>) => ({
    clientEngagements: 2, administrativeEngagements: 1, matrixHours: "14.50", expensesCount: 2, expensesAmount: "170.55",
    expenseByWo: [["wo1", "100.25"], ["wo2", "70.30"]], plans: 2, installments: 2, installmentsInvoiced: 0, installmentsPending: 2, notes: 1, installmentSumByWo: [["wo1", "1000"], ["wo2", "500.50"]], riskLevelByWo: [["wo1", "Bajo"], ["wo2", "Moderado"]],
    hoursTotal: "20.50", hoursByEngagement: [["e1", "16"], ["e2", "4.5"]], hoursByStaff: [["staff-7", "16"], ["staff-8", "4.5"]],
    entriesCount: 3, holidayEntries: 1, holidayHours: "8", periods: 0, lineApprovals: 0, historicWithPeriodOrForecast: 0, emailsSent: 0, emailsClaimable: 0,
    cotByWo: { wo1: "C1", wo2: "C2" }, cotByEngagement: { e1: "C1", e2: "C2" }, _expected: expected,
  });
  it("concilia cuando la base coincide y marca la diferencia exacta cuando no", () => {
    const expected = legacyExpectations(base);
    expect(compareLegacyControls(expected, actualFor(expected)).ok).toBe(true);
    const drifted = { ...actualFor(expected), hoursByStaff: [["staff-7", "16"], ["staff-8", "5.5"]], installmentSumByWo: [["wo1", "1000"], ["wo2", "500.49"]], periods: 1 };
    const result = compareLegacyControls(expected, drifted);
    expect(result.ok).toBe(false);
    expect(result.rows.filter((row) => !row.ok).map((row) => row.id).sort()).toEqual(["L6d", "L7c", "L8a"]);
  });
  it("L4 compara el nivel de riesgo cargado con el traducido del código legacy y falla ante una diferencia o un nulo", () => {
    const expected = legacyExpectations(base);
    expect([...expected.riskLevelByCot]).toEqual([["C1", "Bajo"], ["C2", "Moderado"]]);
    const swapped = compareLegacyControls(expected, { ...actualFor(expected), riskLevelByWo: [["wo1", "Alto"], ["wo2", "Moderado"]] });
    expect(swapped.rows.filter((row) => !row.ok).map((row) => row.id)).toEqual(["L4"]);
    expect(swapped.rows.find((row) => row.id === "L4")?.actual).toContain("C1: esperado Bajo / real Alto");
    // Como quedaron las OT de la primera carga: nivel nulo (el SQL lo devuelve como "(nulo)").
    const nulls = compareLegacyControls(expected, { ...actualFor(expected), riskLevelByWo: [["wo1", "(nulo)"], ["wo2", "(nulo)"]] });
    expect(nulls.rows.filter((row) => !row.ok).map((row) => row.id)).toEqual(["L4"]);
    // Falta una OT con nivel.
    const missing = compareLegacyControls(expected, { ...actualFor(expected), riskLevelByWo: [["wo1", "Bajo"]] });
    expect(missing.rows.filter((row) => !row.ok).map((row) => row.id)).toEqual(["L4"]);
  });
  // Revisión independiente (12/11/2026): las horas se comparan en L7a–L7d; L7e y L7f comparan el NÚMERO de entradas, que no es el de filas fuente.
  it("el número de controles es 24: los 22 anteriores más L7e (entradas) y L7f (entradas en feriado)", () => {
    const expected = legacyExpectations(base);
    const { rows } = compareLegacyControls(expected, actualFor(expected));
    expect(rows).toHaveLength(24);
    expect(rows.map((row) => row.id)).toEqual(["L1a", "L1b", "L3", "L4", "L5a", "L5b", "L5c", "L6a", "L6b", "L6c", "L6e", "L6f", "L6d", "L7a", "L7b", "L7c", "L7d", "L7e", "L7f", "L8a", "L8b", "L8c", "L8d", "L8e"]);
  });
  it("las entradas esperadas son una por persona, OT, actividad y día, y Gerente y Supervisor se reparten 30/70 en dos", () => {
    const expected = legacyExpectations(base);
    expect(expected.expectedEntries).toBe(3n); expect(expected.expectedHolidayEntries).toBe(1n);
    // El mismo día y la misma persona en dos filas de la misma OT y actividad se fusionan en una entrada; un Gerente genera dos (planificación 30 % y ejecución 70 %).
    const withManager = { ...base, inputs: { ...inputs, executions: [...inputs.executions, exec("e4", "C2", "8", "2026-06-05", "10", "3"), exec("e5", "C1", "7", "2026-06-04", "2")] } };
    const bigger = legacyExpectations(withManager);
    expect(bigger.expectedEntries).toBe(3n + 2n); // e4 → 2 entradas; e5 se fusiona con e1 (misma persona, OT, actividad y día)
    expect(bigger.expectedHolidayEntries).toBe(1n + 0n); // el 05/06 aplica solo a la oficina 1; staff-8 es de la oficina 2
    expect(bigger.expectedHoursUnits).toBe(800n + 800n + 450n + 1000n + 200n);
  });
  it("L7e y L7f fallan si faltan entradas, aunque las horas sumen lo mismo", () => {
    const expected = legacyExpectations(base);
    const fewer = compareLegacyControls(expected, { ...actualFor(expected), entriesCount: 2 });
    expect(fewer.rows.filter((row) => !row.ok).map((row) => row.id)).toEqual(["L7e"]);
    const noHoliday = compareLegacyControls(expected, { ...actualFor(expected), holidayEntries: 0 });
    expect(noHoliday.rows.filter((row) => !row.ok).map((row) => row.id)).toEqual(["L7f"]);
  });
  it("L7d falla si las horas de feriado de la fuente no quedaron cargadas", () => {
    const expected = legacyExpectations(base);
    const result = compareLegacyControls(expected, { ...actualFor(expected), holidayHours: "0" });
    expect(result.rows.filter((row) => !row.ok).map((row) => row.id)).toEqual(["L7d"]);
  });
});
