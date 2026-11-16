import { describe, expect, it } from "vitest";
import { invoiceBlueprint, loadInvoices } from "../fase3.mjs";

// D19/D20/D21: las cuotas «ya fue facturado» nacen Pendientes, la OT se aprueba y recién entonces pasan a Facturada.
const installment = (n: number, invoiced: boolean) => ({ sourceKey: `p${n}`, installmentNumber: n, installmentId: `i-${n}`, agreedInvoiceDate: `2024-0${n}-15`, agreedPaymentDate: `2024-0${n + 1}-26`, invoiced });
const unit = (extra: object = {}) => ({ risksCompletedAt: "x", paymentsCompletedAt: "y", payments: [{ woId: "wo1", installments: [installment(1, true), installment(2, true), installment(3, false)] }, { woId: "wo2", installments: [installment(4, false)] }], ...extra });
const ctx = (db: any, declared = 2): any => ({ config: { environment: "test", technicalAdminId: "admin", manifest: { invoicedInstallments: Array.from({ length: declared }, (_, i) => `2024.22.00${i + 1}|1`) } }, db });
const row = (n: number, status: string, dated = true) => ({ installmentId: `i-${n}`, status, invoiceDate: dated ? `2024-0${n}-15` : null, dueDate: dated ? `2024-0${n + 1}-26` : null });

describe("ETL fase 3: cuotas facturadas (D19)", () => {
  it("arma el lote solo con las cuotas marcadas, con factura = fecha acordada y cobro = factura + 30 días hábiles", () => {
    expect(invoiceBlueprint(unit())).toEqual([
      { sourceKey: "p1", woId: "wo1", installmentId: "i-1", installmentNumber: 1, invoiceDate: "2024-01-15", dueDate: "2024-02-26" },
      { sourceKey: "p2", woId: "wo1", installmentId: "i-2", installmentNumber: 2, invoiceDate: "2024-02-15", dueDate: "2024-03-26" },
    ]);
    expect(invoiceBlueprint({ payments: [] })).toEqual([]); expect(invoiceBlueprint(undefined)).toEqual([]);
  });

  it("exige OT aprobada y pagos confirmados antes de facturar", async () => {
    await expect(loadInvoices(ctx({}), unit({ risksCompletedAt: undefined }))).rejects.toThrow(/aprobación de las OT/);
    await expect(loadInvoices(ctx({}), unit({ paymentsCompletedAt: undefined }))).rejects.toThrow(/pagos/);
  });

  it("bloquea si el journal no tiene exactamente las cuotas que declara el manifiesto", async () => {
    await expect(loadInvoices(ctx({}, 27), unit())).rejects.toThrow(/el manifiesto declara 27/);
  });

  it("pasa las cuotas Pendientes a Facturada una sola vez y verifica el resultado", async () => {
    const calls: string[] = []; let state = "Pending";
    const db = {
      async findInvoicedInstallments() { return { installments: [row(1, state, state === "Invoiced"), row(2, state, state === "Invoiced")] }; },
      async invoiceInstallments({ technicalAdminId, invoices }: any) { calls.push(`${technicalAdminId}:${invoices.length}`); state = "Invoiced"; return { invoiced: invoices.length }; },
    };
    expect(await loadInvoices(ctx(db), unit())).toEqual({ recovered: false, invoiced: 2 }); expect(calls).toEqual(["admin:2"]);
    // Segunda ejecución: ya están facturadas, no vuelve a escribir.
    expect(await loadInvoices(ctx(db), unit())).toEqual({ recovered: true, invoiced: 2 }); expect(calls).toHaveLength(1);
  });

  it("no es conciliable si el destino quedó parcial, con otras fechas o la escritura no cuadra", async () => {
    const partial = { async findInvoicedInstallments() { return { installments: [row(1, "Invoiced"), row(2, "Completed")] }; }, async invoiceInstallments() { throw new Error("no debe escribir"); } };
    await expect(loadInvoices(ctx(partial), unit())).rejects.toThrow(/parcial o divergente/);
    const missing = { async findInvoicedInstallments() { return { installments: [row(1, "Pending", false)] }; }, async invoiceInstallments() { throw new Error("no debe escribir"); } };
    await expect(loadInvoices(ctx(missing), unit())).rejects.toThrow(/parcial o divergente/);
    const short = { async findInvoicedInstallments() { return { installments: [row(1, "Pending", false), row(2, "Pending", false)] }; }, async invoiceInstallments() { return { invoiced: 1 }; } };
    await expect(loadInvoices(ctx(short), unit())).rejects.toThrow(/escritura no conciliable/);
  });

  it("sin cuotas facturadas (manifiesto del 23/10) no hace nada", async () => {
    expect(await loadInvoices(ctx({}, 0), { risksCompletedAt: "x", paymentsCompletedAt: "y", payments: [{ woId: "w", installments: [installment(1, false)] }] })).toEqual({ recovered: false, invoiced: 0 });
  });
});
