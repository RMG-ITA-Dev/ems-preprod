import { describe, expect, it } from "vitest";
import { addBusinessDays, adjustedFee, buildAdministrativeEngagementPayloads, buildClientEngagementPayloads, consolidateExecutions, consolidateResolvedHours, decimalUnits, executionContributions, expensePayload, feeWithTax, paymentArtifacts, seasonForIndustry } from "../fase3-transform.mjs";

describe("ETL fase 3: transformaciones", () => {
  it("mantiene 30/70 como residuo y consolida sin período/forecast", () => {
    const rows = [{ legacy_execution_id: "1", legacy_cot: "C", legacy_profile_id: "S", legacy_sqr_profile_id: "", legacy_department_id: "1", legacy_category_id: "3", legacy_specialty_id: "2", legacy_hours: "1.01", legacy_worked_at: "2026-01-01" }];
    const result = executionContributions(rows[0]); expect(result.map((item) => item.hours)).toEqual(["0.3", "0.71"]);
    const consolidated = consolidateExecutions(rows); expect(consolidated).toEqual(expect.arrayContaining([expect.objectContaining({ hours: "0.3", period_id: null, is_forecast: false }), expect.objectContaining({ hours: "0.71", period_id: null, is_forecast: false })]));
  });
  it("parte técnicamente una celda que excede 99,99 sin perder la trazabilidad de la PK", () => {
    const base = { legacy_cot: "C", legacy_profile_id: "S", legacy_sqr_profile_id: "", legacy_department_id: "1", legacy_category_id: "9", legacy_specialty_id: "2", legacy_worked_at: "2026-01-01" };
    const result = consolidateExecutions([{ ...base, legacy_execution_id: "1", legacy_hours: "80" }, { ...base, legacy_execution_id: "2", legacy_hours: "30" }]);
    expect(result).toHaveLength(2);
    expect(result.map((row) => row.hours)).toEqual(["99.99", "10.01"]);
    expect(result.map((row) => row.source_allocations)).toEqual([
      [{ legacy_execution_id: "1", hours: "80" }, { legacy_execution_id: "2", hours: "19.99" }],
      [{ legacy_execution_id: "2", hours: "10.01" }],
    ]);
    expect(result.every((row) => decimalUnits(row.hours) <= 9999n && row.period_id === null && row.is_forecast === false)).toBe(true);
  });
  it("prioriza SQR, bloquea colisión especialista y aplica especialidad histórica", () => {
    const base = { legacy_execution_id: "1", legacy_cot: "C", legacy_profile_id: "S", legacy_sqr_profile_id: "S", legacy_department_id: "3", legacy_category_id: "1", legacy_specialty_id: "2", legacy_hours: "2", legacy_worked_at: "2026-01-01" };
    expect(executionContributions(base)[0].activity_code).toBe("TAX-A1");
    expect(() => executionContributions({ ...base, legacy_department_id: "1", legacy_specialty_id: "1" })).toThrow(/colisión/);
  });
  it("calcula temporadas, honorario y calendario sin flotantes acumulados", () => {
    expect(seasonForIndustry(10)).toBe("Low"); expect(seasonForIndustry(11)).toBe("High"); expect(decimalUnits("2.0000")).toBe(200n); expect(adjustedFee("10", "12.34")).toBe("2.34"); expect(feeWithTax("87")).toBe("100");
    // Lunes a viernes, sin feriados: el 25/12 (feriado) cuenta como día laborable y el fin de semana se salta.
    expect(addBusinessDays("2026-12-24", 1)).toBe("2026-12-25"); expect(addBusinessDays("2026-12-25", 1)).toBe("2026-12-28");
  });
  it("convierte gastos BOB con su TC legacy y conserva USD", () => {
    expect(expensePayload({ legacy_expense_budget_id: "g-bob", legacy_currency_raw: "0", legacy_exchange_rate: "6.96", legacy_amount_usd: "100", legacy_expense_type_id: "2" })).toMatchObject({ currency: "BOB", amount: "696", expense_type: "Viaje" });
    expect(expensePayload({ legacy_expense_budget_id: "g-usd", legacy_currency_raw: " 1 ", legacy_exchange_rate: "", legacy_amount_usd: "100.25", legacy_expense_type_id: "4" })).toMatchObject({ currency: "USD", amount: "100.25", expense_type: "Reproducción" });
  });
  it("sólo ajusta el último porcentaje y nunca absorbe una nota", () => {
    const rows = [{ legacy_cot: "2026.11.001", legacy_installment_number: "1", legacy_percentage: "50", legacy_invoice_date: "2026-01-01", legacy_currency_raw: "0" }, { legacy_cot: "2026.11.001", legacy_installment_number: "2", legacy_percentage: "50", legacy_invoice_date: "2026-02-01", legacy_currency_raw: "0" }];
    const result = paymentArtifacts(rows, "100"); expect(result.installments.map((row) => row.amount)).toEqual(["50", "50"]); expect(result.notes).toHaveLength(0);
  });
  it("aplica F3-Q08 a toda OT, conserva seis decimales y cuadra el último importe", () => {
    const rows = Array.from({ length: 13 }, (_, index) => ({ legacy_cot: "2026.22.007", legacy_installment_number: String(index + 1), legacy_percentage: index === 12 ? "4.000000" : "8.333000", legacy_invoice_date: "2026-01-01", legacy_currency_raw: "0", proposed_disposition: index === 12 ? "nota_plan_confirmada" : "cuota_facturable" }));
    const result = paymentArtifacts(rows, "5783.91");
    expect(result.installments).toHaveLength(12);
    expect(result.installments.at(-1)).toMatchObject({ percentage: "8.337", amount: "482.24" });
    expect(result.installments.reduce((sum, row) => sum + Number(row.amount), 0)).toBeCloseTo(5783.91, 2);
  });
  it("preserva snapshots BOB/USD y usa exactamente treinta días laborables (lunes a viernes, sin feriados)", () => {
    const bob = paymentArtifacts([{ legacy_cot: "C", legacy_installment_number: "1", legacy_percentage: "100.000000", legacy_invoice_date: "2026-12-24", legacy_currency_raw: "0" }], "100");
    const usd = paymentArtifacts([{ legacy_cot: "U", legacy_installment_number: "1", legacy_percentage: "100.000000", legacy_invoice_date: "2026-01-01", legacy_currency_raw: "1" }], "100");
    expect(bob.installments[0]).toMatchObject({ percentage: "100", exchange_rate_mode: null, payment_days: 30, payment_due_date: "2027-02-04" });
    expect(usd.installments[0]).toMatchObject({ exchange_rate_mode: "fijo", amount: "100" });
  });
  it("construye encargos cliente y administrativos sólo con los cruces aprobados", () => {
    const maps = {
      clients: { "legacy:9": { id: "client", name: "Cliente Legal" }, "NEW-RP": { id: "internal", name: "Ruizmier Pelaez S.R.L." } },
      services: { "17": { id: "service", name: "Auditoría" } }, staff: { "legacy:1": "partner", "legacy:2": "manager" },
      societies: { Pelaez: "rp", Jauregui: "rj" }, internalClientId: "internal", officeByStaffId: { partner: 2 },
    };
    const [client] = buildClientEngagementPayloads([{ legacy_cot: "2026.21.098", gestion: "2026", legacy_department_id: "1", legacy_client_id: "9", legacy_service_id: "17", legacy_partner_profile_id: "1", legacy_manager_profile_id: "2", legacy_sqr_profile_id: "", legacy_manager_in_charge_profile_id: "", legacy_it_specialist_profile_id: "", legacy_tax_specialist_profile_id: "", legacy_city_id: "1", ems_start_date: "2026-03-29" }], maps);
    expect(client).toMatchObject({ name: "Cliente Legal - FY 2026 - Auditoría", startDate: "2026-03-29", endDate: "2026-11-15", societyId: "rp", practice: 1, function: 1 });
    const [admin] = buildAdministrativeEngagementPayloads([{ legacy_cot: "2027.10.101", legacy_engagement_name: "  Administrativo  ", legacy_partner_profile_id: "1", legacy_created_date: "2026-10-01" }], maps);
    expect(admin).toMatchObject({ name: "Administrativo", clientId: "internal", partnerId: "partner", managerId: null, encargadoId: null, office: 2, practice: 0, function: 0, societyId: "rp" });
  });
  it("reconsolida perfiles legacy equivalentes en la clave única EMS", () => {
    const common = { engagementId: "e", activityId: "a", dateWorked: "2026-06-01", isForecast: false, periodId: null };
    const result = consolidateResolvedHours([{ ...common, sourceKey: "1", staffId: "s", hours: "80", sourceAllocations: [{ legacy_execution_id: "1", hours: "80" }] }, { ...common, sourceKey: "2", staffId: "s", hours: "30", sourceAllocations: [{ legacy_execution_id: "2", hours: "30" }] }]);
    expect(result.map((row) => row.hours)).toEqual(["99.99", "10.01"]);
    expect(result.every((row) => row.sourceKey.startsWith("resolved:s|e|a|2026-06-01|false:"))).toBe(true);
  });
});

describe("ETL fase 3: redondeo de gastos BOB", () => {
  const bob = (amount: string) => expensePayload({ legacy_expense_budget_id: "g-bob", legacy_currency_raw: "0", legacy_exchange_rate: "6.96", legacy_amount_usd: amount, legacy_expense_type_id: "2" });
  it("redondea half-up a centavos, igual que la conciliación (BOB_ROUNDING), sin truncar", () => {
    expect(bob("10.10")).toMatchObject({ amount: "70.3" }); // 70,296 → 70,30 (truncar daba 70,29)
    expect(bob("10.01")).toMatchObject({ amount: "69.67" }); // 69,6696 → 69,67 (truncar daba 69,66)
    expect(bob("100")).toMatchObject({ amount: "696" });
  });
});
