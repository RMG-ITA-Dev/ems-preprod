import { describe, it, expect } from "vitest";
import { getWeekDisplayInfo } from "@/lib/timesheetWeekDisplay";
import { getFiscalWeekNumber } from "@/lib/fiscalCalculations";
import { parseDateLocal } from "@/lib/timesheetUtils";

describe("getWeekDisplayInfo", () => {
  // 1. Bug reproduction: 2026-03-02 must be Week 23, FY2026
  it("returns week 23, fiscal year 2026 for 2026-03-02 (bug case)", () => {
    const result = getWeekDisplayInfo("2026-03-02");
    expect(result.isValid).toBe(true);
    expect(result.weekNumber).toBe(23);
    expect(result.fiscalYear).toBe(2026);
  });

  // 2. Fiscal boundary: FY2026 Week 1 Monday
  it("returns week 1, fiscal year 2026 for 2025-09-29", () => {
    const result = getWeekDisplayInfo("2025-09-29");
    expect(result.isValid).toBe(true);
    expect(result.weekNumber).toBe(1);
    expect(result.fiscalYear).toBe(2026);
  });

  // 3. Oct-Dec fiscal year divergence
  it("returns fiscal year 2026 (not 2025) for 2025-10-06", () => {
    const result = getWeekDisplayInfo("2025-10-06");
    expect(result.isValid).toBe(true);
    expect(result.fiscalYear).toBe(2026);
  });

  // 4. Cross-year Sep boundary
  it("returns correct fiscal year for 2026-09-28", () => {
    const result = getWeekDisplayInfo("2026-09-28");
    expect(result.isValid).toBe(true);
    // Sep 28 2026 is a Monday; Oct 1 2026 is Thursday so FY2027 Week 1 Monday = Sep 28 2026
    expect(result.fiscalYear).toBe(2027);
  });

  // 5-8. Invalid inputs
  it("returns isValid=false for null", () => {
    expect(getWeekDisplayInfo(null)).toEqual({ weekNumber: 0, fiscalYear: 0, isValid: false });
  });

  it("returns isValid=false for undefined", () => {
    expect(getWeekDisplayInfo(undefined)).toEqual({ weekNumber: 0, fiscalYear: 0, isValid: false });
  });

  it("returns isValid=false for empty string", () => {
    expect(getWeekDisplayInfo("")).toEqual({ weekNumber: 0, fiscalYear: 0, isValid: false });
  });

  it("returns isValid=false for malformed date", () => {
    expect(getWeekDisplayInfo("not-a-date")).toEqual({ weekNumber: 0, fiscalYear: 0, isValid: false });
  });

  // 9. Parity checks against canonical algorithm
  it.each(["2026-03-02", "2025-09-29", "2026-01-05", "2025-12-01"])(
    "parity: helper weekNumber matches getFiscalWeekNumber for %s",
    (dateStr) => {
      const helper = getWeekDisplayInfo(dateStr);
      const direct = getFiscalWeekNumber(parseDateLocal(dateStr));
      expect(helper.weekNumber).toBe(direct);
    }
  );
});
