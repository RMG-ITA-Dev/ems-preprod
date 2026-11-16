import { describe, expect, it } from "vitest";
import { preparePaymentBlueprint } from "../fase3.mjs";
import { legacyTargetAdjustment } from "../fase3-transform.mjs";

const make = (currency = "1") => {
  const cot = "2026.11.001";
  const source = { legacy_cot: cot, legacy_currency_raw: currency, legacy_exchange_rate: currency === "1" ? "1" : "2", legacy_fee_with_tax: "84" };
  const rows = ["50", "50"].map((percentage, i) => ({ legacy_cot: cot, legacy_plan_payment_id: String(i + 1), legacy_installment_number: String(i + 1), legacy_percentage: percentage, legacy_invoice_date: "2026-01-01", legacy_currency_raw: currency, legacy_exchange_rate: source.legacy_exchange_rate, legacy_fee_with_tax: currency === "1" ? "100" : "200", proposed_disposition: "cuota_facturable" }));
  const inputs = { clientEngagements: [source], payments: rows, expenses: [{ legacy_cot: cot, legacy_amount_usd: "16", legacy_currency_raw: currency, legacy_exchange_rate: source.legacy_exchange_rate }] };
  const ctx = { config: { environment: "local", manifest: { f3: { workOrders: 1, payments: { plans: 1, rows: 2, billable: 2, notes: 0 }, financialContract: "fee-plus-budgeted-expenses-v1" }, toleranceCots: [] } }, journal: { units: { "work-orders": { workOrders: [{ sourceKey: cot, woId: "wo", currency: currency === "1" ? "USD" : "BOB", state: "CONFIRMADA", syncState: "CONFIRMADA", rateState: "CONFIRMADA" }] } } }, db: { paymentFinancials: async () => ({ financials: [{ sourceKey: cot, woId: "wo", currency: currency === "1" ? "USD" : "BOB", standardFee: currency === "1" ? "84" : "168", adjustmentAmount: "0", expenses: currency === "1" ? "16" : "32" }] }) } };
  return { ctx, inputs };
};
describe("contrato financiero de pagos", () => {
  it.each(["1", "0"])("incluye gastos, conserva el ajuste y reparte el total en moneda %s", async (currency) => {
    const { ctx, inputs } = make(currency);
    const [plan] = await preparePaymentBlueprint(ctx, inputs);
    expect(plan.adjustmentAmount).toBe("0.00");
    expect(plan.feeWithTax).toBe(currency === "1" ? "119.05" : "238.10");
    expect(plan.installments.map((i) => i.amount)).toEqual(currency === "1" ? ["59.53", "59.52"] : ["119.05", "119.05"]);
  });
  it("bloquea una cuota facturada con gastos para no alterar hechos históricos", async () => {
    const { ctx, inputs } = make(); inputs.payments[0].proposed_disposition = "cuota_facturada";
    await expect(preparePaymentBlueprint(ctx, inputs)).rejects.toThrow(/cuota facturada con gastos/);
  });
  it("rechaza gastos persistidos distintos de la fuente", async () => {
    const { ctx, inputs } = make(); inputs.expenses[0].legacy_amount_usd = "17";
    await expect(preparePaymentBlueprint(ctx, inputs)).rejects.toThrow(/gastos persistidos no coinciden/);
  });
});

describe("contrato de total acordado legacy", () => {
  it("calcula el ajuste exacto del caso 2026.11.159", () => {
    expect(legacyTargetAdjustment("301689", "400408.80", "6960")).toEqual({ target: "301689", adjusted: "246458.76", adjustment: "-153950.04" });
  });
  it.each(["1", "0"])("prepara objetivo y cuotas en moneda %s", async (currency) => {
    const { ctx, inputs } = make(currency);
    ctx.config.manifest.f3.financialContract = "legacy-agreed-total-v1";
    Object.assign(inputs.clientEngagements[0], { legacy_fee_usd: "125", legacy_fee_bob: "250" });
    const [plan] = await preparePaymentBlueprint(ctx, inputs);
    expect(plan.adjustmentAmount).toBe(currency === "1" ? "5.00" : "10.00");
    expect(plan.feeWithTax).toBe(currency === "1" ? "125.00" : "250.00");
    expect(plan.installments.map((i) => i.amount)).toEqual(currency === "1" ? ["62.5", "62.5"] : ["125", "125"]);
  });
  it("bloquea precisión no representable y total ausente", async () => {
    expect(() => legacyTargetAdjustment("100.01", "84", "0")).toThrow(/precisión/);
    const { ctx, inputs } = make(); ctx.config.manifest.f3.financialContract = "legacy-agreed-total-v1";
    await expect(preparePaymentBlueprint(ctx, inputs)).rejects.toThrow(/total original.*ausente/);
  });
  it("mantiene fecha y marca facturada de la fuente al repartir el nuevo total", async () => {
    const { ctx, inputs } = make(); ctx.config.manifest.f3.financialContract = "legacy-agreed-total-v1";
    Object.assign(inputs.clientEngagements[0], { legacy_fee_usd: "125" });
    inputs.expenses[0].legacy_amount_usd = "0";
    inputs.payments[0].proposed_disposition = "cuota_facturada";
    ctx.db.paymentFinancials = async () => ({ financials: [{ sourceKey: "2026.11.001", woId: "wo", currency: "USD", standardFee: "84", adjustmentAmount: "0", expenses: "0" }] });
    const [plan] = await preparePaymentBlueprint(ctx, inputs);
    expect(plan.installments[0]).toMatchObject({ invoiced: true, agreedInvoiceDate: "2026-01-01", amount: "62.5" });
  });
});
