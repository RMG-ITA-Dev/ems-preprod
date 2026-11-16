import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildReportData, dateFlags } from "../reportes/reporte-datos.mjs";
import { writeWorkbook } from "../reportes/reporte-libro.mjs";

// Fixture mínimo: una OT en BOB (TC 6,96) y una en USD, con horas, gastos, plan de pagos y una fila «no facturar».
const base = {
  legacy_client_id: "30", legacy_department_id: "1", legacy_service_id: "BE2100", legacy_partner_profile_id: "10", legacy_manager_profile_id: "89", ems_end_date: "2027-09-30",
  legacy_risk_code: "2", legacy_ceac_number: "4229", legacy_ceac_approved_date: "2026-05-29", legacy_san_request_id: "1391", legacy_san_approved_date: "2026-05-08", legacy_created_date: "2026-01-01", gestion: "2026",
};
const clientEngagements = [
  { ...base, legacy_cot: "2026.11.001", legacy_currency_raw: "0", legacy_exchange_rate: "6.96", legacy_fee_with_tax: "10000", legacy_fee_usd: "13095.24", legacy_fee_bob: "91100" },
  { ...base, legacy_cot: "2026.22.002", legacy_department_id: "2", legacy_currency_raw: "1", legacy_exchange_rate: "6.96", legacy_fee_with_tax: "5000", legacy_fee_usd: "7000", legacy_fee_bob: "48720" },
];
const planHours = [
  { legacy_cot: "2026.11.001", legacy_budget_hours: "100", legacy_budget_rate: "100" },
  { legacy_cot: "2026.11.001", legacy_budget_hours: "50", legacy_budget_rate: "200" },
  { legacy_cot: "2026.11.001", legacy_budget_hours: "0", legacy_budget_rate: "999" },
  { legacy_cot: "2026.22.002", legacy_budget_hours: "40", legacy_budget_rate: "250" },
];
const expenses = [
  { legacy_expense_budget_id: "1", legacy_cot: "2026.11.001", legacy_currency_raw: "0", legacy_exchange_rate: "6.96", legacy_expense_type_id: "2", legacy_amount_usd: "1000" },
  { legacy_expense_budget_id: "2", legacy_cot: "2026.11.001", legacy_currency_raw: "0", legacy_exchange_rate: "6.96", legacy_expense_type_id: "3", legacy_amount_usd: "0" },
];
const execution = (hours: string, day: string, extra = {}) => ({ legacy_cot: "2026.11.001", legacy_hours: hours, legacy_worked_at: day, approval_evidence_count: "1", approved_evidence_count: "1", legacy_pending_approval: "0", disposition: "migrable_aprobada", ...extra });
const executions = [execution("8", "2026-10-29"), execution("8", "2026-10-30"), execution("8", "2026-11-02"), execution("5", "2026-10-28", { approved_evidence_count: "0", disposition: "no_migrable" })];
const payment = (cot: string, id: string, number: string, percentage: string, date: string, currency: string, extra = {}) => ({ legacy_plan_payment_id: id, legacy_cot: cot, legacy_installment_number: number, legacy_detail: "", legacy_percentage: percentage, legacy_invoice_date: date, legacy_currency_raw: currency, legacy_exchange_rate: "6.96", proposed_disposition: "cuota_facturable", ...extra });
const payments = [
  payment("2026.11.001", "1", "1", "50", "2026-01-15", "0"), payment("2026.11.001", "2", "2", "50", "2026-02-15", "0"),
  payment("2026.11.001", "3", "3", "2", "2026-03-15", "0", { legacy_detail: "Ajuste (no facturar)", proposed_disposition: "nota_plan_confirmada" }),
  payment("2026.22.002", "4", "1", "100", "2025-11-20", "1", { legacy_detail: "Factura (ya fue facturado)", proposed_disposition: "cuota_facturada" }),
];
const source = {
  clientEngagements, planHours, expenses, payments, executions, toleranceCots: [],
  clients: [{ source_ref: "legacy:30", client_legal_name: "Cliente de Prueba S.A." }],
  staff: [{ legacy_profile_ids: "10", first_name: "Ana", last_name: "Socia" }, { legacy_profile_ids: "62", first_name: "Luis", last_name: "Gerente" }],
  services: [{ legacy_service_id: "BE2100", ems_service_name: "Servicio de Prueba" }],
};

describe("reportes Legacy ↔ EMS: datos", () => {
  const { ot, cuotas, observaciones } = buildReportData(source, { overdueReference: "2026-03-01" });
  const bob = ot.find((row) => row.cot === "2026.11.001"); const usd = ot.find((row) => row.cot === "2026.22.002");

  it("resuelve cliente, servicio, práctica, sociedad y responsables (el perfil 89 se absorbe en el 62)", () => {
    expect(bob).toMatchObject({ cliente: "Cliente de Prueba S.A.", servicio: "Servicio de Prueba", practica: "Auditoría", sociedad: "Ruizmier Pelaez", socio: "Ana Socia", gerente: "Luis Gerente", nivelRiesgo: "Moderado" });
    expect(usd).toMatchObject({ practica: "Compliance", sociedad: "Ruizmier Jauregui" });
  });

  it("el total de referencia es honorariosBs en OT BOB y honorariosSus en OT USD", () => {
    expect(bob).toMatchObject({ moneda: "BOB", totalAcordado: 91100, presupuestadoUsd: 10000 });
    expect(usd).toMatchObject({ moneda: "USD", totalAcordado: 7000 });
  });

  it("calcula el estándar, la realización y los gastos en la moneda de la OT", () => {
    expect(bob.estandarUsd).toBe(20000); // 100 × 100 + 50 × 200; la línea sin horas no cuenta
    expect(bob.estandarMoneda).toBe(139200); // por línea: 100 × 696 + 50 × 1392
    expect(bob.realizacion).toBeCloseTo(0.5, 10); // 10.000 ÷ 20.000
    expect(bob.gastos).toBe(6960); // 1.000 USD × 6,96; la fila en cero no cuenta
    expect(usd).toMatchObject({ estandarUsd: 10000, estandarMoneda: 10000, gastos: 0 });
  });

  it("suma solo horas aprobadas con día trabajado hasta el corte", () => {
    expect(bob.horasPresupuestadas).toBe(150);
    expect(bob.horasEjecutadas).toBe(16); // excluye la posterior al 30/10 y la no aprobada
    expect(bob.usoHoras).toBeCloseTo(16 / 150, 10);
    expect(usd.horasEjecutadas).toBe(0);
  });

  it("las cuotas suman exactamente el total acordado y las notas no llevan monto", () => {
    const rows = cuotas.filter((row) => row.cot === "2026.11.001");
    const billable = rows.filter((row) => row.monto !== null);
    expect(billable.map((row) => row.monto)).toEqual([45550, 45550]);
    expect(Math.round(billable.reduce((sum, row) => sum + row.monto, 0) * 100)).toBe(9110000);
    expect(rows.at(-1)).toMatchObject({ tipo: "Nota «no facturar»", monto: null, textoLegacy: "Ajuste (no facturar)" });
    expect(billable[0].tcPlan).toBeNull(); // BOB: el plan no lleva TC
    expect(cuotas.find((row) => row.cot === "2026.22.002")).toMatchObject({ tipo: "Cuota facturada (por texto)", facturadaPorTexto: true, tcPlan: 6.96, monto: 7000 });
  });

  it("calcula la fecha de pago (30 días hábiles) y la bandera «vencida» con la fecha fija recibida", () => {
    const [first, second] = cuotas.filter((row) => row.cot === "2026.11.001" && row.monto !== null);
    expect(first.fechaPago).toBe("2026-02-26"); expect(first.vencida).toBe(true);
    expect(second.fechaPago).toBe("2026-03-27"); expect(second.vencida).toBe(false);
  });

  it("resume las observaciones para Contabilidad", () => {
    expect(observaciones).toMatchObject({ cuotasTotales: 3, notas: { cuotas: 1, ot: 1 }, facturadas: { cuotas: 1, ot: 1 }, vencidas: { cuotas: 2, ot: 2, otTodasVencidas: 1 } });
    expect(observaciones.fechasAtipicas.cuotas).toBe(0);
    expect(observaciones.porGerente.find((row) => row.gerente === "Luis Gerente")).toMatchObject({ ot: 2, vencidas: 2, otTodasVencidas: 1 });
  });
});

describe("reportes Legacy ↔ EMS: banderas de fecha", () => {
  const row = (number: string, date: string) => ({ legacy_installment_number: number, legacy_invoice_date: date });

  it("marca orden roto, anterior a la creación por más de 60 días y misma fecha, con su posible causa", () => {
    const broken = dateFlags([row("1", "2026-07-14"), row("2", "2026-03-10"), row("3", "2027-06-30")], "2026-08-28");
    expect(broken.get("1")).toBeUndefined(); // 45 días antes de la creación: dentro de los 60 días
    expect(broken.get("2")).toMatchObject({ kinds: ["orden", "creacion"], cause: "Posible año equivocado (¿2027?)", reason: expect.stringContaining("anterior a la de la cuota 1 (14/07/2026)") });
    expect(broken.get("3")).toBeUndefined();
    const sameDate = dateFlags([row("1", "2026-09-30"), row("2", "2026-09-30")], "2026-08-28");
    expect(sameDate.get("1")).toMatchObject({ kinds: ["misma"], cause: "Revisar con el gerente" }); // sumarle un año rompería el orden con la cuota 2
    expect(sameDate.get("2")).toMatchObject({ kinds: ["misma"], cause: "Posible año equivocado (¿2027?)" });
    const noFix = dateFlags([row("1", "2026-07-14"), row("2", "2026-03-10"), row("3", "2026-09-30")], "2026-08-28");
    expect(noFix.get("2")).toMatchObject({ cause: "Revisar con el gerente" }); // con un año más quedaría después de la cuota 3
  });

  it("un plan coherente no genera banderas", () => {
    expect(dateFlags([row("1", "2026-02-01"), row("2", "2026-03-01")], "2026-01-15").size).toBe(0);
  });
});

describe("reportes Legacy ↔ EMS: libro xlsx", () => {
  it("escribe las cuatro hojas con filtros, encabezados congelados y fórmulas de diferencia", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reporte-libro-"));
    try {
      const data = buildReportData(source, { overdueReference: "2026-03-01" });
      const path = join(dir, "libro.xlsx");
      await writeWorkbook(data, { generatedAt: "2026-11-16", overdueReference: "2026-03-01", hoursCutoff: "2026-10-30", files: ["a.csv"] }, path);
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(path);
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Léame", "OT", "Cuotas", "Observaciones"]);
      const otSheet = workbook.getWorksheet("OT")!;
      expect(otSheet.rowCount).toBe(2 + 2); expect(otSheet.autoFilter).toBeTruthy(); expect(otSheet.views[0]).toMatchObject({ state: "frozen", ySplit: 2 });
      const headers = otSheet.getRow(2).values as string[];
      const totalColumn = headers.indexOf("Total acordado original (moneda OT)"); const deltaColumn = headers.indexOf("Δ Total (EMS − Legacy)");
      expect(otSheet.getCell(3, totalColumn).value).toBe(91100);
      expect((otSheet.getCell(3, deltaColumn).value as { formula: string }).formula).toContain("IF(");
      expect(workbook.getWorksheet("Cuotas")!.rowCount).toBe(1 + 4);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
