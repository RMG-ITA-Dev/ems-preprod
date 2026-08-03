import { describe, it, expect } from "vitest";
import {
  canWriteEngagementAssignments,
  type AssignmentWriteAuthzInput,
} from "@/lib/schedulerAssignmentAuthz";

const RESPONSIBLE_IDS = [
  "manager-1",
  "partner-1",
  "sqr-1",
  "encargado-1",
  "specialist-it-1",
  "specialist-tax-1",
];

const base: AssignmentWriteAuthzInput = {
  isAdmin: false,
  myStaffId: null,
  responsibleStaffIds: RESPONSIBLE_IDS,
};

const input = (o: Partial<AssignmentWriteAuthzInput>) => ({ ...base, ...o });

describe("canWriteEngagementAssignments (is_engagement_responsible mirror, Fase 5)", () => {
  it("admin can write regardless of responsibility", () => {
    expect(canWriteEngagementAssignments(input({ isAdmin: true, myStaffId: null }))).toBe(true);
    expect(
      canWriteEngagementAssignments(
        input({ isAdmin: true, myStaffId: "bystander", responsibleStaffIds: [] })
      )
    ).toBe(true);
  });

  it.each([
    ["manager_id", "manager-1"],
    ["partner_id", "partner-1"],
    ["sqr_id", "sqr-1"],
    ["encargado_id", "encargado-1"],
    ["specialist_it_id", "specialist-it-1"],
    ["specialist_tax_id", "specialist-tax-1"],
  ])("staff matching %s can write", (_field, staffId) => {
    expect(canWriteEngagementAssignments(input({ myStaffId: staffId }))).toBe(true);
  });

  it("REGRESSION: a senior with an own assignment but no responsible column cannot write (D5 anti-escalation, Fase 5 Decisión #2)", () => {
    expect(
      canWriteEngagementAssignments(
        input({ myStaffId: "senior-with-assignment", responsibleStaffIds: RESPONSIBLE_IDS })
      )
    ).toBe(false);
  });

  it("a bystander staff member (not in any of the 6 columns) cannot write", () => {
    expect(canWriteEngagementAssignments(input({ myStaffId: "bystander-1" }))).toBe(false);
  });

  it("myStaffId null/undefined cannot write, even if somehow listed", () => {
    expect(canWriteEngagementAssignments(input({ myStaffId: null }))).toBe(false);
    expect(canWriteEngagementAssignments(input({ myStaffId: undefined }))).toBe(false);
  });

  it("tolerates null/undefined entries in responsibleStaffIds (unassigned columns)", () => {
    expect(
      canWriteEngagementAssignments(
        input({ myStaffId: "manager-1", responsibleStaffIds: [null, undefined, "manager-1"] })
      )
    ).toBe(true);
  });
});
