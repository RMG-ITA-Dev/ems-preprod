import { describe, expect, it } from "vitest";
import { buildMatrixArtifacts } from "../fase3-matrix.mjs";

describe("ETL fase 3: matriz lógica", () => {
  it("divide, especializa y consolida sin perder horas", () => {
    const engagements = [
      { legacy_cot: "A", legacy_department_id: "1", legacy_it_specialist_profile_id: "77", legacy_tax_specialist_profile_id: "" },
      { legacy_cot: "C", legacy_department_id: "2", legacy_it_specialist_profile_id: "", legacy_tax_specialist_profile_id: "" },
    ];
    const planRows = [
      { legacy_plan_hours_id: "1", legacy_cot: "A", legacy_category_id: "1", legacy_specialty_id: "2", legacy_budget_hours: "100" },
      { legacy_plan_hours_id: "2", legacy_cot: "A", legacy_category_id: "3", legacy_specialty_id: "1", legacy_budget_hours: "20" },
      { legacy_plan_hours_id: "3", legacy_cot: "C", legacy_category_id: "5", legacy_specialty_id: "3", legacy_budget_hours: "30" },
      { legacy_plan_hours_id: "4", legacy_cot: "C", legacy_category_id: "9", legacy_specialty_id: "2", legacy_budget_hours: "0" },
    ];
    const result = buildMatrixArtifacts({ engagements, planRows });
    expect(result).toMatchObject({ sourceTotal: "150", cellTotal: "150" });
    expect(result.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ legacy_plan_hours_id: "1", target_activity_code: "AUD-A2", allocated_budget_hours: "50" }),
      expect.objectContaining({ legacy_plan_hours_id: "1", target_activity_code: "AUD-A4", allocated_budget_hours: "50" }),
      expect.objectContaining({ legacy_plan_hours_id: "2", target_category_name: "Gerente - Especialista ITA", target_activity_code: "AUD-A5", allocated_budget_hours: "20" }),
      expect.objectContaining({ legacy_plan_hours_id: "3", target_activity_code: "COM-A2", allocated_budget_hours: "30" }),
    ]));
    expect(result.dispositions).toEqual(expect.arrayContaining([expect.objectContaining({ legacy_plan_hours_id: "4", disposition: "omitida_cero" })]));
  });

  it("D35: en Auditoría toda fila ITA/Tax va a la categoría de especialista de su nivel, aunque la OT no tenga especialista asignado", () => {
    const engagements = [
      { legacy_cot: "A", legacy_department_id: "1", legacy_it_specialist_profile_id: "", legacy_tax_specialist_profile_id: "" },
      { legacy_cot: "T", legacy_department_id: "3", legacy_it_specialist_profile_id: "", legacy_tax_specialist_profile_id: "" },
    ];
    const row = (id: string, cot: string, category: string, specialty: string) => ({ legacy_plan_hours_id: id, legacy_cot: cot, legacy_category_id: category, legacy_specialty_id: specialty, legacy_budget_hours: "4" });
    const planRows = [
      row("1", "A", "3", "1"), row("2", "A", "4", "3"), row("3", "A", "13", "3"), row("4", "A", "5", "1"), row("5", "A", "16", "3"), row("6", "A", "9", "1"),
      row("7", "A", "1", "1"), row("8", "A", "2", "3"), row("9", "A", "13", "2"), row("10", "A", "16", "2"), row("11", "T", "5", "3"),
    ];
    const result = buildMatrixArtifacts({ engagements, planRows });
    const target = (id: string) => result.contributions.filter((c: { legacy_plan_hours_id: string }) => c.legacy_plan_hours_id === id).map((c: { target_category_name: string; target_activity_code: string; allocated_budget_hours: string }) => `${c.target_category_name}@${c.target_activity_code}:${c.allocated_budget_hours}`);
    expect(target("1")).toEqual(["Gerente - Especialista ITA@AUD-A5:4"]);
    expect(target("2")).toEqual(["Gerente - Especialista Tax@AUD-A6:4"]);
    expect(target("3")).toEqual(["Gerente - Especialista Tax@AUD-A6:4"]); // Supervisor + Tax: antes caía en «Supervisor» general
    expect(target("4")).toEqual(["Senior - Especialista ITA@AUD-A5:4"]);
    expect(target("5")).toEqual(["Asistente - Especialista Tax@AUD-A6:4"]); // Semi Senior (tarifa 18): antes iba a «Senior - Especialista»
    expect(target("6")).toEqual(["Asistente - Especialista ITA@AUD-A5:4"]);
    // Socio y Director no tienen categoría de especialista; la especialidad general no cambia; fuera de Auditoría la especialidad no cuenta.
    expect(target("7")).toEqual(["Socio@AUD-A2:2", "Socio@AUD-A4:2"]);
    expect(target("8")).toEqual(["Director@AUD-A2:2", "Director@AUD-A4:2"]);
    expect(target("9")).toEqual(["Supervisor@AUD-A2:1", "Supervisor@AUD-A3:2", "Supervisor@AUD-A4:1"]);
    expect(target("10")).toEqual(["Semi-Senior@AUD-A3:4"]);
    expect(target("11")).toEqual(["Senior@TAX-A2:4"]);
    expect(result.sourceTotal).toBe(result.cellTotal);
  });

  it("rechaza PK/COT duplicados y fracciones presupuestarias no representables", () => {
    const engagement = { legacy_cot: "A", legacy_department_id: "1", legacy_it_specialist_profile_id: "", legacy_tax_specialist_profile_id: "" };
    const plan = { legacy_plan_hours_id: "1", legacy_cot: "A", legacy_category_id: "1", legacy_specialty_id: "2", legacy_budget_hours: "0.0001" };
    expect(() => buildMatrixArtifacts({ engagements: [engagement, engagement], planRows: [] })).toThrow(/duplicado/);
    expect(() => buildMatrixArtifacts({ engagements: [engagement], planRows: [plan] })).toThrow(/fracción/);
    expect(() => buildMatrixArtifacts({ engagements: [engagement], planRows: [{ ...plan, legacy_budget_hours: "1" }, { ...plan, legacy_budget_hours: "1", legacy_plan_hours_id: "1" }] })).toThrow(/duplicada/);
  });

  it("rechaza ANTES de escribir una celda que la base (numeric 10,2) redondearía", () => {
    const engagement = { legacy_cot: "A", legacy_department_id: "1", legacy_it_specialist_profile_id: "", legacy_tax_specialist_profile_id: "" };
    // Gerente (categoría 3) reparte 25 % / 50 % / 25 %: 1,25 h da 0,3125 / 0,625 / 0,3125, que no caben en 2 decimales.
    const gerente = { legacy_plan_hours_id: "1", legacy_cot: "A", legacy_category_id: "3", legacy_specialty_id: "2", legacy_budget_hours: "1.25" };
    expect(() => buildMatrixArtifacts({ engagements: [engagement], planRows: [gerente] })).toThrow(/más de 2 decimales/);
    // 1,28 h da 0,32 / 0,64 / 0,32: cabe exacto y la suma se conserva.
    const ok = buildMatrixArtifacts({ engagements: [engagement], planRows: [{ ...gerente, legacy_budget_hours: "1.28" }] });
    expect(ok.cells.map((c: { budget_hours: string }) => c.budget_hours).sort()).toEqual(["0.32", "0.32", "0.64"].sort());
    expect(ok).toMatchObject({ sourceTotal: "1.28", cellTotal: "1.28" });
  });
});
