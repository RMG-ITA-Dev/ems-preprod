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

  it("rechaza PK/COT duplicados y fracciones presupuestarias no representables", () => {
    const engagement = { legacy_cot: "A", legacy_department_id: "1", legacy_it_specialist_profile_id: "", legacy_tax_specialist_profile_id: "" };
    const plan = { legacy_plan_hours_id: "1", legacy_cot: "A", legacy_category_id: "1", legacy_specialty_id: "2", legacy_budget_hours: "0.0001" };
    expect(() => buildMatrixArtifacts({ engagements: [engagement, engagement], planRows: [] })).toThrow(/duplicado/);
    expect(() => buildMatrixArtifacts({ engagements: [engagement], planRows: [plan] })).toThrow(/fracción/);
    expect(() => buildMatrixArtifacts({ engagements: [engagement], planRows: [{ ...plan, legacy_budget_hours: "1" }, { ...plan, legacy_budget_hours: "1", legacy_plan_hours_id: "1" }] })).toThrow(/duplicada/);
  });
});
