import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFase3DbAdapter } from "../fase3-db.mjs";

describe("ETL fase 3: adaptador SQL", () => {
  it("no puede ejecutar una unidad sin actor técnico", async () => {
    const db = createFase3DbAdapter({ env: {} }); await expect(db.executeBlock({ block: "matrices", payload: {}, technicalAdminId: "" })).rejects.toThrow(/actor técnico/);
  });
  it("no permite sincronizar una matriz sin los dos identificadores", async () => {
    const db = createFase3DbAdapter({ env: {} });
    await expect(db.syncWorksheetToWorkOrder({ technicalAdminId: "actor", worksheetId: "", woId: "ot" })).rejects.toThrow(/sincronización F3 inválida/);
    await expect(db.findWorkOrderSync({ worksheetId: "matriz", woId: "" })).rejects.toThrow(/relectura de sincronización F3 inválida/);
  });
  it("no puede insertar o releer un lote de gastos vacío", async () => {
    const db = createFase3DbAdapter({ env: {} });
    await expect(db.createExpenses({ technicalAdminId: "actor", expenses: [] })).rejects.toThrow(/gastos F3 inválidos/);
    await expect(db.findExpenseMatches({ expenses: [] })).rejects.toThrow(/relectura de gastos F3 inválida/);
  });
  it("exige identificadores reservados antes de mutar o releer pagos", async () => {
    const db = createFase3DbAdapter({ env: {} });
    await expect(db.createPayments({ technicalAdminId: "actor", payment: { woId: "wo", installments: [] } })).rejects.toThrow(/pagos F3 inválidos/);
    await expect(db.findPaymentMatches({ payment: { woId: "wo", planId: "plan", installments: [] } })).rejects.toThrow(/relectura de pagos F3 inválida/);
  });
  // P-02 (fase3/plan_v2 §3): un plan BOB toma el DEFAULT efectivo del esquema; no hay migración que relaje NOT NULL.
  it("el plan BOB toma el DEFAULT del TC y sus cuotas heredan ese TC, sin escribir NULL", () => {
    const source = readFileSync(new URL("../fase3-db.mjs", import.meta.url), "utf8");
    const planInserts = source.match(/INSERT INTO public\.wo_payment_plan[^\n]*/g) ?? [];
    expect(planInserts).toHaveLength(2);
    for (const sql of planInserts) {
      expect(sql).toContain("public.latest_exchange_rate()");
      expect(sql).toContain("COALESCE(NULLIF(");
      expect(sql).toMatch(/'fijo'\)/);
      expect(sql).toContain("RETURNING plan_id,exchange_rate");
    }
    const installmentInserts = source.match(/INSERT INTO public\.wo_payment_installments[\s\S]*?RETURNING installment_id/g) ?? [];
    expect(installmentInserts).toHaveLength(2);
    for (const sql of installmentInserts) expect(sql).toMatch(/COALESCE\(NULLIF\([a-z]+->>'invoiceExchangeRate',''\)::numeric,(plan|p2)\.exchange_rate\)/);
    expect(source).not.toMatch(/ALTER COLUMN exchange_rate/);
  });
});
