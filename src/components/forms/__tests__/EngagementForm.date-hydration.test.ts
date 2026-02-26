/**
 * BUG 0220-59: Engagement form date hydration must not shift dates.
 */
import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";

// Mirrors EngagementForm lines 163-164
function hydrateDate(dbValue: string | null): Date | undefined {
  return dbValue ? parseDateLocal(dbValue) : undefined;
}

describe("EngagementForm date hydration (BUG 0220-59)", () => {
  it("hydrates start_date 2026-02-20 as Feb 20", () => {
    const d = hydrateDate("2026-02-20")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(20);
  });

  it("hydrates end_date 2026-09-30 as Sep 30", () => {
    const d = hydrateDate("2026-09-30")!;
    expect(d.getDate()).toBe(30);
    expect(d.getMonth()).toBe(8);
  });

  it("returns undefined for null", () => {
    expect(hydrateDate(null)).toBeUndefined();
  });

  it("round-trip: hydrate then format back equals original", () => {
    const original = "2026-02-20";
    expect(format(hydrateDate(original)!, "yyyy-MM-dd")).toBe(original);
  });

  it("repeated edit/save cycles produce no cumulative drift", () => {
    let dateStr = "2026-02-20";
    for (let i = 0; i < 5; i++) {
      dateStr = format(hydrateDate(dateStr)!, "yyyy-MM-dd");
    }
    expect(dateStr).toBe("2026-02-20");
  });
});
