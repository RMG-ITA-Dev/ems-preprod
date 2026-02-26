import { describe, it, expect } from "vitest";

// Pure function matching the per-cell lock logic (BUG 0220-63)
function isCellOutOfRange(
  dateStr: string,
  startDate: string | null,
  endDate: string | null
): boolean {
  if (startDate && dateStr < startDate) return true;
  if (endDate && dateStr > endDate) return true;
  return false;
}

describe("TimesheetGrid cell engagement date lock (BUG 0220-63)", () => {
  it("date before start_date -> locked", () => {
    expect(isCellOutOfRange("2026-02-16", "2026-02-18", "2026-03-26")).toBe(true);
  });

  it("date after end_date -> locked", () => {
    expect(isCellOutOfRange("2026-03-27", "2026-02-18", "2026-03-26")).toBe(true);
  });

  it("date within range -> unlocked", () => {
    expect(isCellOutOfRange("2026-02-20", "2026-02-18", "2026-03-26")).toBe(false);
  });

  it("null start_date -> never locked from start side", () => {
    expect(isCellOutOfRange("2020-01-01", null, "2026-03-26")).toBe(false);
  });

  it("null end_date -> never locked from end side", () => {
    expect(isCellOutOfRange("2030-12-31", "2026-02-18", null)).toBe(false);
  });

  it("both null -> never locked", () => {
    expect(isCellOutOfRange("2026-02-20", null, null)).toBe(false);
  });

  it("date equals start_date -> unlocked (boundary inclusive)", () => {
    expect(isCellOutOfRange("2026-02-18", "2026-02-18", "2026-03-26")).toBe(false);
  });

  it("date equals end_date -> unlocked (boundary inclusive)", () => {
    expect(isCellOutOfRange("2026-03-26", "2026-02-18", "2026-03-26")).toBe(false);
  });
});
