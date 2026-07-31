import { describe, it, expect } from "vitest";
import {
  canWriteEngagementAssignments,
  type AssignmentWriteAuthzInput,
} from "@/lib/schedulerAssignmentAuthz";

const base: AssignmentWriteAuthzInput = {
  isAdmin: false,
  isPartner: false,
  isDirector: false,
  isManager: false,
  isSenior: false,
  isStructuralLead: false,
  hasOwnAssignment: false,
};

const input = (o: Partial<AssignmentWriteAuthzInput>) => ({ ...base, ...o });

describe("canWriteEngagementAssignments (D5 write matrix, client mirror)", () => {
  it("admin can write regardless of structural membership", () => {
    expect(canWriteEngagementAssignments(input({ isAdmin: true }))).toBe(true);
    expect(
      canWriteEngagementAssignments(
        input({ isAdmin: true, isStructuralLead: false })
      )
    ).toBe(true);
  });

  it("structural partner lead can write", () => {
    expect(
      canWriteEngagementAssignments(
        input({ isPartner: true, isStructuralLead: true })
      )
    ).toBe(true);
  });

  it("structural director lead can write", () => {
    expect(
      canWriteEngagementAssignments(
        input({ isDirector: true, isStructuralLead: true })
      )
    ).toBe(true);
  });

  it("structural manager lead can write", () => {
    expect(
      canWriteEngagementAssignments(
        input({ isManager: true, isStructuralLead: true })
      )
    ).toBe(true);
  });

  it("structural senior lead WITH an own assignment can write (In-Charge Senior)", () => {
    expect(
      canWriteEngagementAssignments(
        input({ isSenior: true, isStructuralLead: true, hasOwnAssignment: true })
      )
    ).toBe(true);
  });

  it("structural senior lead WITHOUT an assignment cannot write (anti-escalation)", () => {
    expect(
      canWriteEngagementAssignments(
        input({
          isSenior: true,
          isStructuralLead: true,
          hasOwnAssignment: false,
        })
      )
    ).toBe(false);
  });

  it("assigned senior who is NOT a structural lead cannot write", () => {
    expect(
      canWriteEngagementAssignments(
        input({
          isSenior: true,
          isStructuralLead: false,
          hasOwnAssignment: true,
        })
      )
    ).toBe(false);
  });

  it("partner/director/manager who is NOT a structural lead cannot write", () => {
    expect(
      canWriteEngagementAssignments(input({ isPartner: true }))
    ).toBe(false);
    expect(
      canWriteEngagementAssignments(input({ isDirector: true }))
    ).toBe(false);
    expect(
      canWriteEngagementAssignments(input({ isManager: true }))
    ).toBe(false);
  });

  it("structural semisenior/other lead cannot write (role outside the D5 matrix)", () => {
    // no role flag set, but structurally a lead
    expect(
      canWriteEngagementAssignments(input({ isStructuralLead: true }))
    ).toBe(false);
  });

  it("no role / no staff record (role-fetch failure default) cannot write", () => {
    expect(canWriteEngagementAssignments(base)).toBe(false);
  });
});
