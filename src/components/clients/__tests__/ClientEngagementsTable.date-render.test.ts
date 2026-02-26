/**
 * BUG 0220-59: ClientEngagementsTable date rendering must not shift dates.
 */
import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";

// Mirrors ClientEngagementsTable.tsx line 167-170
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return format(parseDateLocal(dateStr), "dd/MM/yyyy");
}

describe("ClientEngagementsTable formatDate (BUG 0220-59)", () => {
  it("formats 2026-02-20 as 20/02/2026", () => {
    expect(formatDate("2026-02-20")).toBe("20/02/2026");
  });

  it("formats null as dash", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("handles month-end 2026-02-28", () => {
    expect(formatDate("2026-02-28")).toBe("28/02/2026");
  });

  it("handles year-start 2026-01-01", () => {
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });
});
