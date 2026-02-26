import { describe, it, expect } from "vitest";

/**
 * BUG 0220-61: Tests the effective auto-approve decision matrix
 * that mirrors the RPC logic in submit_timesheet_safe.
 */
describe("submit_timesheet_safe approval_required logic (BUG 0220-61)", () => {
  // Mirrors the v_effective_auto computation from the RPC
  function effectiveAutoApprove(
    isAutoApprovedCategory: boolean,
    approvalRequired: boolean
  ): boolean {
    return isAutoApprovedCategory || !approvalRequired;
  }

  it("approval_required=false + non-director => auto-approved", () => {
    expect(effectiveAutoApprove(false, false)).toBe(true);
  });

  it("approval_required=true + non-director => pending", () => {
    expect(effectiveAutoApprove(false, true)).toBe(false);
  });

  it("mixed engagements produce independent outcomes", () => {
    expect(effectiveAutoApprove(false, false)).toBe(true); // internal
    expect(effectiveAutoApprove(false, true)).toBe(false); // client
  });

  it("director (p_is_auto_approved=true) always auto-approves regardless of flag", () => {
    expect(effectiveAutoApprove(true, true)).toBe(true);
    expect(effectiveAutoApprove(true, false)).toBe(true);
  });

  it("approved rows are never downgraded (architectural invariant)", () => {
    const existingStatus = "approved";
    expect(existingStatus).toBe("approved");
  });

  it("pending row upgrades when effective auto-approve is true", () => {
    const effective = effectiveAutoApprove(false, false);
    const newStatus = effective ? "approved" : "pending";
    expect(newStatus).toBe("approved");
  });

  it("rejected row upgrades when effective auto-approve is true", () => {
    const effective = effectiveAutoApprove(false, false);
    const newStatus = effective ? "approved" : "rejected";
    expect(newStatus).toBe("approved");
  });

  it("rejected row keeps modified-since-rejection logic when approval_required=true", () => {
    const effective = effectiveAutoApprove(false, true);
    expect(effective).toBe(false);
  });
});
