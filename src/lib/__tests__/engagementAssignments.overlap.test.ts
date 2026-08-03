// Fase 5 — findStaffSegmentOverlap: la Card, el Sheet y el commit de drag rechazan un draft cuyo
// rango de fechas intersecta otro segmento ACTIVO del mismo staff en el engagement (el objetivo
// del scheduler permite varios segmentos por (engagement, staff) solo si no se solapan).

import { describe, expect, it } from "vitest";
import { findStaffSegmentOverlap } from "../engagementAssignments";

const seg = (
  assignment_id: string,
  staff_id: string,
  start_date: string,
  end_date: string
) => ({ assignment_id, staff_id, start_date, end_date });

const EXISTING = [
  seg("a1", "staff-1", "2026-01-01", "2026-03-31"),
  seg("a2", "staff-1", "2026-06-01", "2026-08-31"),
  seg("b1", "staff-2", "2026-01-01", "2026-12-31"),
];

describe("findStaffSegmentOverlap", () => {
  it("detects a straddling overlap with the same staff member", () => {
    expect(
      findStaffSegmentOverlap(
        seg("new", "staff-1", "2026-03-01", "2026-04-30"),
        EXISTING
      )
    ).toBe("a1");
  });

  it("detects containment and exact-match overlaps", () => {
    expect(
      findStaffSegmentOverlap(seg("new", "staff-1", "2026-06-10", "2026-06-20"), EXISTING)
    ).toBe("a2");
    expect(
      findStaffSegmentOverlap(seg("new", "staff-1", "2026-01-01", "2026-03-31"), EXISTING)
    ).toBe("a1");
  });

  it("shared boundary day counts as overlap (dates are inclusive)", () => {
    expect(
      findStaffSegmentOverlap(seg("new", "staff-1", "2026-03-31", "2026-05-01"), EXISTING)
    ).toBe("a1");
  });

  it("a clean gap between segments is allowed (re-engagement)", () => {
    expect(
      findStaffSegmentOverlap(seg("new", "staff-1", "2026-04-01", "2026-05-31"), EXISTING)
    ).toBeNull();
  });

  it("other staff members' segments never conflict", () => {
    expect(
      findStaffSegmentOverlap(seg("new", "staff-3", "2026-01-01", "2026-12-31"), EXISTING)
    ).toBeNull();
  });

  it("skips the draft's own persisted row (editing in place)", () => {
    expect(
      findStaffSegmentOverlap(seg("a1", "staff-1", "2026-01-15", "2026-03-15"), EXISTING)
    ).toBeNull();
  });

  it("a deleted row (absent from `existing`) never conflicts", () => {
    expect(
      findStaffSegmentOverlap(
        seg("new", "staff-1", "2026-01-01", "2026-03-31"),
        EXISTING.filter((r) => r.assignment_id !== "a1")
      )
    ).toBeNull();
  });

  it("incomplete drafts are not judged (field validation handles them)", () => {
    expect(findStaffSegmentOverlap(seg("new", "", "2026-01-01", "2026-12-31"), EXISTING)).toBeNull();
    expect(findStaffSegmentOverlap(seg("new", "staff-1", "", "2026-12-31"), EXISTING)).toBeNull();
    expect(findStaffSegmentOverlap(seg("new", "staff-1", "2026-01-01", ""), EXISTING)).toBeNull();
  });
});
