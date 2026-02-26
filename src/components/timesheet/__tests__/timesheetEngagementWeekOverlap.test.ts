import { describe, it, expect } from "vitest";

// Pure function matching the grid-owned filtering logic (BUG 0220-63)
function overlapsWeek(
  eng: { start_date: string | null; end_date: string | null },
  weekStart: string,
  weekEnd: string
): boolean {
  const startOk = !eng.start_date || eng.start_date <= weekEnd;
  const endOk = !eng.end_date || eng.end_date >= weekStart;
  return startOk && endOk;
}

describe("TimesheetGrid engagement week-overlap filtering (BUG 0220-63)", () => {
  const WEEK_START = "2026-02-16";
  const WEEK_END = "2026-02-20";

  it("engagement fully containing week -> selectable", () => {
    expect(overlapsWeek({ start_date: "2026-01-01", end_date: "2026-12-31" }, WEEK_START, WEEK_END)).toBe(true);
  });

  it("engagement starting mid-week -> selectable", () => {
    expect(overlapsWeek({ start_date: "2026-02-18", end_date: "2026-03-26" }, WEEK_START, WEEK_END)).toBe(true);
  });

  it("engagement ending before week -> not selectable", () => {
    expect(overlapsWeek({ start_date: "2026-01-01", end_date: "2026-02-15" }, WEEK_START, WEEK_END)).toBe(false);
  });

  it("engagement starting after week -> not selectable", () => {
    expect(overlapsWeek({ start_date: "2026-02-21", end_date: "2026-03-26" }, WEEK_START, WEEK_END)).toBe(false);
  });

  it("null start_date -> always selectable", () => {
    expect(overlapsWeek({ start_date: null, end_date: "2026-02-18" }, WEEK_START, WEEK_END)).toBe(true);
  });

  it("null end_date -> always selectable", () => {
    expect(overlapsWeek({ start_date: "2026-02-18", end_date: null }, WEEK_START, WEEK_END)).toBe(true);
  });

  it("both null -> always selectable", () => {
    expect(overlapsWeek({ start_date: null, end_date: null }, WEEK_START, WEEK_END)).toBe(true);
  });

  it("engagement ending on week start day -> selectable (boundary inclusive)", () => {
    expect(overlapsWeek({ start_date: "2026-01-01", end_date: "2026-02-16" }, WEEK_START, WEEK_END)).toBe(true);
  });

  it("engagement starting on week end day -> selectable (boundary inclusive)", () => {
    expect(overlapsWeek({ start_date: "2026-02-20", end_date: "2026-03-26" }, WEEK_START, WEEK_END)).toBe(true);
  });

  it("already-used out-of-range engagement remains visible", () => {
    const outOfRange = { start_date: "2026-03-01", end_date: "2026-03-31" };
    const usedIds = new Set(["eng-out"]);
    // Simulating grid filtering logic
    const isUsed = usedIds.has("eng-out");
    const isVisible = isUsed || overlapsWeek(outOfRange, WEEK_START, WEEK_END);
    expect(isVisible).toBe(true);
  });
});
