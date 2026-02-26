/**
 * BUG 0220-59: Engagements list date rendering must not shift dates.
 */
import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";

// Mirrors Engagements.tsx lines 72, 82
function renderDate(dbDate: string | null): string {
  return dbDate ? format(parseDateLocal(dbDate), "dd/MM/yyyy") : "-";
}

describe("Engagements list date rendering (BUG 0220-59)", () => {
  it("renders 2026-02-20 as 20/02/2026", () => {
    expect(renderDate("2026-02-20")).toBe("20/02/2026");
  });

  it("renders 2026-09-30 as 30/09/2026", () => {
    expect(renderDate("2026-09-30")).toBe("30/09/2026");
  });

  it("renders null as dash", () => {
    expect(renderDate(null)).toBe("-");
  });

  it("handles month boundary 2026-01-01", () => {
    expect(renderDate("2026-01-01")).toBe("01/01/2026");
  });

  it("handles year boundary 2025-12-31", () => {
    expect(renderDate("2025-12-31")).toBe("31/12/2025");
  });
});
