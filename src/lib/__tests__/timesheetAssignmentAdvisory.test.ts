import { describe, it, expect } from "vitest";
import {
  isDateInAnyWindow,
  countUnauthorizedEntries,
  type AssignmentWindow,
  type SegmentsByEngagement,
} from "../timesheetAssignmentAdvisory";

describe("isDateInAnyWindow", () => {
  const windows: AssignmentWindow[] = [
    { start_date: "2026-01-05", end_date: "2026-01-09" },
    { start_date: "2026-01-19", end_date: "2026-01-23" },
  ];

  it("returns true when the date falls strictly inside a window", () => {
    expect(isDateInAnyWindow(windows, "2026-01-07")).toBe(true);
  });

  it("start_date is inclusive", () => {
    expect(isDateInAnyWindow(windows, "2026-01-05")).toBe(true);
  });

  it("end_date is inclusive", () => {
    expect(isDateInAnyWindow(windows, "2026-01-09")).toBe(true);
  });

  it("a date before every window is not covered", () => {
    expect(isDateInAnyWindow(windows, "2026-01-01")).toBe(false);
  });

  it("a date after every window is not covered", () => {
    expect(isDateInAnyWindow(windows, "2026-01-31")).toBe(false);
  });

  it("a gap between two windows of the same engagement is not covered", () => {
    expect(isDateInAnyWindow(windows, "2026-01-12")).toBe(false);
  });

  it("checks across multiple windows", () => {
    expect(isDateInAnyWindow(windows, "2026-01-21")).toBe(true);
  });

  it("adjacent (back-to-back) windows: the boundary day of each is covered", () => {
    const adjacent: AssignmentWindow[] = [
      { start_date: "2026-02-01", end_date: "2026-02-05" },
      { start_date: "2026-02-06", end_date: "2026-02-10" },
    ];
    expect(isDateInAnyWindow(adjacent, "2026-02-05")).toBe(true);
    expect(isDateInAnyWindow(adjacent, "2026-02-06")).toBe(true);
  });

  it("an empty windows array covers nothing", () => {
    expect(isDateInAnyWindow([], "2026-01-07")).toBe(false);
  });

  it("undefined windows (engagement absent from an authoritative map) covers nothing", () => {
    expect(isDateInAnyWindow(undefined, "2026-01-07")).toBe(false);
  });
});

describe("countUnauthorizedEntries", () => {
  const entry = (
    engagement_id: string,
    date_worked: string,
    hours_logged: number,
  ) => ({ engagement_id, date_worked, hours_logged });

  it("a null map (data unavailable) never counts anything — fail-open", () => {
    expect(
      countUnauthorizedEntries([entry("eng-1", "2026-01-07", 8)], null),
    ).toBe(0);
  });

  it("an undefined map (not yet queried) never counts anything — fail-open", () => {
    expect(
      countUnauthorizedEntries([entry("eng-1", "2026-01-07", 8)], undefined),
    ).toBe(0);
  });

  it("an authoritative map: covered entries do not count", () => {
    const map: SegmentsByEngagement = new Map([
      ["eng-1", [{ start_date: "2026-01-05", end_date: "2026-01-09" }]],
    ]);
    expect(countUnauthorizedEntries([entry("eng-1", "2026-01-07", 8)], map)).toBe(0);
  });

  it("an authoritative map: entries outside every window count", () => {
    const map: SegmentsByEngagement = new Map([
      ["eng-1", [{ start_date: "2026-01-05", end_date: "2026-01-09" }]],
    ]);
    expect(countUnauthorizedEntries([entry("eng-1", "2026-01-15", 8)], map)).toBe(1);
  });

  it("an authoritative map: an engagement absent from the map counts", () => {
    const map: SegmentsByEngagement = new Map();
    expect(countUnauthorizedEntries([entry("eng-missing", "2026-01-07", 8)], map)).toBe(1);
  });

  it("a valid empty map is authoritative — every positive-hour entry counts", () => {
    const map: SegmentsByEngagement = new Map();
    expect(
      countUnauthorizedEntries(
        [entry("eng-1", "2026-01-07", 8), entry("eng-2", "2026-01-08", 4)],
        map,
      ),
    ).toBe(2);
  });

  it("zero-hour entries never count", () => {
    const map: SegmentsByEngagement = new Map();
    expect(countUnauthorizedEntries([entry("eng-1", "2026-01-07", 0)], map)).toBe(0);
  });

  it("negative-hour entries never count", () => {
    const map: SegmentsByEngagement = new Map();
    expect(countUnauthorizedEntries([entry("eng-1", "2026-01-07", -1)], map)).toBe(0);
  });

  it("counts across multiple engagements independently", () => {
    const map: SegmentsByEngagement = new Map([
      ["eng-1", [{ start_date: "2026-01-05", end_date: "2026-01-09" }]],
    ]);
    const entries = [
      entry("eng-1", "2026-01-07", 8),  // covered
      entry("eng-1", "2026-01-20", 4),  // not covered
      entry("eng-2", "2026-01-07", 6),  // engagement absent -> not covered
    ];
    expect(countUnauthorizedEntries(entries, map)).toBe(2);
  });
});

describe("module invariants", () => {
  it("never constructs a Date from a civil date string (BUG 0220-59)", async () => {
    const source = await import("../timesheetAssignmentAdvisory.ts?raw");
    expect((source as unknown as { default: string }).default).not.toMatch(/new Date/);
  });
});
