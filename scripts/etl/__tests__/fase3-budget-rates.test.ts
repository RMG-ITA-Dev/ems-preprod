import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncWorkOrders } from "../fase3.mjs";
import { budgetRatesByWorkOrder } from "../fase3-transform.mjs";
import { createFase3DbAdapter } from "../fase3-db.mjs";

// Opción A (D32): tarifa del presupuesto = tarifa legacy × TC, hacia arriba (D29); promedio ponderado por horas cuando varias filas convergen en una categoría.
const engagement = (cot: string, currency: string, rate: string) => ({ legacy_cot: cot, legacy_currency_raw: currency, legacy_exchange_rate: rate });
const plan = (id: string, rate: string) => ({ legacy_plan_hours_id: id, legacy_budget_rate: rate });
const contribution = (id: string, cot: string, category: string, hours: string, practice = "AUD") => ({ legacy_plan_hours_id: id, legacy_cot: cot, practica_abbreviation: practice, target_category_name: category, allocated_budget_hours: hours });

describe("ETL fase 3: tarifas de presupuesto de la opción A", () => {
  it("OT en BOB: tarifa legacy × TC (ejemplo de 2026.11.159: Socio 200 × 6,96 = 1.392)", () => {
    const result = budgetRatesByWorkOrder({ engagements: [engagement("2026.11.159", "0", "6.96")], planRows: [plan("1", "200"), plan("2", "100")], contributions: [contribution("1", "2026.11.159", "Socio", "10"), contribution("2", "2026.11.159", "Asistente", "40")] });
    expect(result.get("2026.11.159")).toEqual([{ practice: "AUD", categoryName: "Asistente", rate: "696" }, { practice: "AUD", categoryName: "Socio", rate: "1392" }]);
  });

  it("OT en USD: no convierte, aunque traiga un TC fijo para facturar", () => {
    const result = budgetRatesByWorkOrder({ engagements: [engagement("2026.21.160", "1", "12")], planRows: [plan("1", "135")], contributions: [contribution("1", "2026.21.160", "Gerente", "8")] });
    expect(result.get("2026.21.160")).toEqual([{ practice: "AUD", categoryName: "Gerente", rate: "135" }]);
  });

  it("redondea HACIA ARRIBA al centavo (D29) con un TC de dos decimales", () => {
    // 15,5 × 6,33 = 98,115 → 98,12 (el redondeo al más cercano en media-hacia-par daría 98,11 o 98,12 según la implementación; aquí es siempre hacia arriba)
    const result = budgetRatesByWorkOrder({ engagements: [engagement("A", "0", "6.33")], planRows: [plan("1", "15.5")], contributions: [contribution("1", "A", "Senior", "3")] });
    expect(result.get("A")).toEqual([{ practice: "AUD", categoryName: "Senior", rate: "98.12" }]);
  });

  it("promedia ponderado por horas cuando varias filas legacy convergen en la categoría, hacia arriba", () => {
    // (3 h × 100 + 1 h × 120) / 4 h = 105 → × 6,96 = 730,8; aportes con reparto 50/50 de Socio no cambian el promedio
    const result = budgetRatesByWorkOrder({ engagements: [engagement("B", "0", "6.96")], planRows: [plan("1", "100"), plan("2", "120")], contributions: [contribution("1", "B", "Socio", "3"), contribution("2", "B", "Socio", "1")] });
    expect(result.get("B")).toEqual([{ practice: "AUD", categoryName: "Socio", rate: "730.8" }]);
    // (1 h × 100 + 2 h × 101) / 3 h = 100,6666… × 1 (USD) = 100,67 hacia arriba
    const usd = budgetRatesByWorkOrder({ engagements: [engagement("C", "1", "")], planRows: [plan("1", "100"), plan("2", "101")], contributions: [contribution("1", "C", "Socio", "1"), contribution("2", "C", "Socio", "2")] });
    expect(usd.get("C")).toEqual([{ practice: "AUD", categoryName: "Socio", rate: "100.67" }]);
  });

  it("separa categorías homónimas de prácticas distintas y OT distintas", () => {
    const result = budgetRatesByWorkOrder({ engagements: [engagement("A", "1", ""), engagement("B", "1", "")], planRows: [plan("1", "10"), plan("2", "20"), plan("3", "30")], contributions: [contribution("1", "A", "Socio", "1", "AUD"), contribution("2", "A", "Socio", "1", "TAX"), contribution("3", "B", "Socio", "1", "AUD")] });
    expect(result.get("A")).toEqual([{ practice: "AUD", categoryName: "Socio", rate: "10" }, { practice: "TAX", categoryName: "Socio", rate: "20" }]);
    expect(result.get("B")).toEqual([{ practice: "AUD", categoryName: "Socio", rate: "30" }]);
  });

  it("rechaza tarifa o TC inválidos, moneda desconocida y filas sin origen", () => {
    const base = { engagements: [engagement("A", "0", "6.96")], planRows: [plan("1", "200")], contributions: [contribution("1", "A", "Socio", "1")] };
    expect(() => budgetRatesByWorkOrder({ ...base, planRows: [plan("1", "0")] })).toThrow(/no positivas/);
    expect(() => budgetRatesByWorkOrder({ ...base, planRows: [plan("1", "1.0000001")] })).toThrow(/precisión/);
    expect(() => budgetRatesByWorkOrder({ ...base, engagements: [engagement("A", "0", "0")] })).toThrow(/TC BOB/);
    expect(() => budgetRatesByWorkOrder({ ...base, engagements: [engagement("A", "2", "6.96")] })).toThrow(/moneda legacy/);
    expect(() => budgetRatesByWorkOrder({ ...base, planRows: [] })).toThrow(/sin fila legacy/);
    expect(() => budgetRatesByWorkOrder({ ...base, engagements: [engagement("A", "0", "6.965")] })).toThrow(/precisión/);
  });

  it("rechaza una tarifa que no cabe en numeric(10,2)", () => {
    expect(() => budgetRatesByWorkOrder({ engagements: [engagement("A", "1", "")], planRows: [plan("1", "100000000")], contributions: [contribution("1", "A", "Socio", "1")] })).toThrow(/fuera de rango/);
  });
});

describe("ETL fase 3: adaptador de tarifas de presupuesto", () => {
  const db = createFase3DbAdapter({ env: {} } as any);
  it("rechaza tarifas mal formadas antes de tocar la base", async () => {
    await expect(db.applyBudgetRates({ technicalAdminId: "a", woId: "w", rates: [] })).rejects.toThrow(/tarifas de presupuesto F3 inválidas/);
    await expect(db.applyBudgetRates({ technicalAdminId: "a", woId: "w", rates: [{ categoryId: "c", rate: "1.234" }] })).rejects.toThrow(/tarifas de presupuesto F3 inválidas/);
    await expect(db.applyBudgetRates({ technicalAdminId: "", woId: "w", rates: [{ categoryId: "c", rate: "1" }] })).rejects.toThrow(/tarifas de presupuesto F3 inválidas/);
    await expect(db.findWorkOrderSync({ worksheetId: "m", woId: "w", rates: [{ categoryId: "c", rate: "x" }] })).rejects.toThrow(/tarifas de presupuesto F3 inválidas/);
    await expect(db.findWorkOrderSync({ worksheetId: "m", woId: "w", rates: [] })).rejects.toThrow(/tarifas de presupuesto F3 inválidas/);
  });
});

// Base falsa: una OT con una línea de presupuesto por categoría; `sync` deja las tarifas de catálogo y `apply` las reemplaza.
const RATES = new Map([["2026.11.159", [{ categoryId: "cat-1", rate: "1392" }, { categoryId: "cat-2", rate: "696" }]]]);
const ctxFor = (db: any): any => ({ db, journalFile: path.join(mkdtempSync(path.join(os.tmpdir(), "f3-rates-")), "journal.json"), journal: { units: {} }, config: { environment: "test", technicalAdminId: "admin", manifest: { f3: { workOrders: 1 } } } });
const unitFor = (extra: object = {}): any => ({ state: "CONFIRMADA", workOrders: [{ sourceKey: "2026.11.159", worksheetId: "ws1", woId: "wo1", state: "CONFIRMADA", ...extra }] });
function fakeDb(initial: { synced: boolean; ratesApplied: boolean }) {
  const calls: string[] = []; const state = { ...initial };
  return {
    state, calls,
    async findWorkOrderSync({ rates }: any) {
      const base = state.synced ? { linked: 1, matrixCategories: 2, budgetCategories: 2, matrixHours: 40, budgetHours: 40, differences: 0 } : { linked: 0, matrixCategories: 2, budgetCategories: 0, matrixHours: 40, budgetHours: 0, differences: 2 };
      return { ...base, rateMismatches: rates && state.synced && !state.ratesApplied ? 2 : 0 };
    },
    async syncWorksheetToWorkOrder() { calls.push("sync"); state.synced = true; return { synced: true }; },
    async applyBudgetRates({ rates }: any) { calls.push("apply"); state.ratesApplied = true; return { updated: rates.length, expected: rates.length }; },
  };
}

describe("ETL fase 3: sincronización con tarifas legacy (D32)", () => {
  it("sincroniza una sola vez, aplica las tarifas y confirma; la segunda corrida no escribe", async () => {
    const db = fakeDb({ synced: false, ratesApplied: false }); const unit = unitFor(); const ctx = ctxFor(db);
    const first = await syncWorkOrders(ctx, unit, RATES);
    expect(db.calls).toEqual(["sync", "apply"]); expect(first).toMatchObject({ workOrders: 1, ratesApplied: 1, budgetLines: 2 }); expect(unit.workOrders[0]).toMatchObject({ syncState: "CONFIRMADA", rateState: "CONFIRMADA" });
    const second = await syncWorkOrders(ctx, unit, RATES);
    expect(db.calls).toEqual(["sync", "apply"]); expect(second).toMatchObject({ ratesApplied: 0 });
  });

  it("si la corrida se cayó entre la sincronización y las tarifas, sólo aplica las tarifas (volver a sincronizar las borraría)", async () => {
    const db = fakeDb({ synced: true, ratesApplied: false }); const ctx = ctxFor(db); const unit = unitFor();
    await syncWorkOrders(ctx, unit, RATES);
    expect(db.calls).toEqual(["apply"]);
  });

  it("bloquea si las tarifas ya confirmadas aparecen alteradas, o si no se aplican todas", async () => {
    const altered = fakeDb({ synced: true, ratesApplied: false });
    await expect(syncWorkOrders(ctxFor(altered), unitFor({ rateState: "CONFIRMADA" }), RATES)).rejects.toThrow(/confirmadas ausentes o alteradas/);
    expect(altered.calls).toEqual([]);
    const short = fakeDb({ synced: true, ratesApplied: false }); short.applyBudgetRates = async () => ({ updated: 1, expected: 2 });
    await expect(syncWorkOrders(ctxFor(short), unitFor(), RATES)).rejects.toThrow(/no aplicadas/);
  });

  it("exige las tarifas de todas las OT y que no cambien respecto de la intención durable", async () => {
    await expect(syncWorkOrders(ctxFor(fakeDb({ synced: false, ratesApplied: false })), unitFor(), undefined as any)).rejects.toThrow(/requiere las tarifas/);
    await expect(syncWorkOrders(ctxFor(fakeDb({ synced: false, ratesApplied: false })), unitFor(), new Map())).rejects.toThrow(/requiere las tarifas/);
    const db = fakeDb({ synced: false, ratesApplied: false }); const ctx = ctxFor(db); const unit = unitFor();
    await syncWorkOrders(ctx, unit, RATES);
    await expect(syncWorkOrders(ctx, unit, new Map([["2026.11.159", [{ categoryId: "cat-1", rate: "1393" }, { categoryId: "cat-2", rate: "696" }]]]))).rejects.toThrow(/cambiaron las tarifas/);
  });
});
