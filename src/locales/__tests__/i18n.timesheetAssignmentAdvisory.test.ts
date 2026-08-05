import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

// Fase 6 (bugs/scheduler/fase_6): 8 keys under timesheet.assignmentAdvisory —
// banner, cellTooltip, cellAriaLabel, badge, submittedWithWarnings (4 pluralized forms
// count as 2 keys: banner and submittedWithWarnings), plus unavailable.
const EXPECTED_KEYS = [
  "cellTooltip",
  "cellAriaLabel",
  "badge",
  "unavailable",
] as const;
const PLURALIZED_KEYS = ["banner", "submittedWithWarnings"] as const;

describe("i18n timesheet assignment advisory keys (Fase 6)", () => {
  it("EN and ES both define the assignmentAdvisory block", () => {
    expect((en as any).timesheet.assignmentAdvisory).toBeTruthy();
    expect((es as any).timesheet.assignmentAdvisory).toBeTruthy();
  });

  it.each(EXPECTED_KEYS)("EN and ES both resolve assignmentAdvisory.%s", (key) => {
    expect((en as any).timesheet.assignmentAdvisory[key]).toBeTruthy();
    expect((es as any).timesheet.assignmentAdvisory[key]).toBeTruthy();
  });

  it.each(PLURALIZED_KEYS)("EN and ES both provide _one and _other forms for %s", (base) => {
    expect((en as any).timesheet.assignmentAdvisory[`${base}_one`]).toBeTruthy();
    expect((en as any).timesheet.assignmentAdvisory[`${base}_other`]).toBeTruthy();
    expect((es as any).timesheet.assignmentAdvisory[`${base}_one`]).toBeTruthy();
    expect((es as any).timesheet.assignmentAdvisory[`${base}_other`]).toBeTruthy();
  });

  it("cellAriaLabel is non-empty in both languages", () => {
    expect((en as any).timesheet.assignmentAdvisory.cellAriaLabel.trim().length).toBeGreaterThan(0);
    expect((es as any).timesheet.assignmentAdvisory.cellAriaLabel.trim().length).toBeGreaterThan(0);
  });

  it("no value in the block reads as a permissions error (\"unauthorized\" / \"no autorizado\")", () => {
    const allValues = [
      ...Object.values((en as any).timesheet.assignmentAdvisory),
      ...Object.values((es as any).timesheet.assignmentAdvisory),
    ] as string[];
    for (const value of allValues) {
      expect(value.toLowerCase()).not.toContain("unauthorized");
      expect(value.toLowerCase()).not.toContain("no autorizado");
    }
  });

  it("submitPairMismatch exists in both languages (submit-time error mapping)", () => {
    expect((en as any).timesheet.submitPairMismatch).toBeTruthy();
    expect((es as any).timesheet.submitPairMismatch).toBeTruthy();
  });

  it("both locale files remain valid JSON with matching key sets for the block", () => {
    const enKeys = Object.keys((en as any).timesheet.assignmentAdvisory).sort();
    const esKeys = Object.keys((es as any).timesheet.assignmentAdvisory).sort();
    expect(enKeys).toEqual(esKeys);
  });
});
