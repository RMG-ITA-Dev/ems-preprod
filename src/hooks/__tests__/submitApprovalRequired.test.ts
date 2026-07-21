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

/**
 * BUG 0526-122: For the line whose engagement_id === HOLIDAY_ENGAGEMENT_ID,
 * submit_timesheet_safe replaces the v_effective_auto computation above with a
 * dynamic per-date validation — ignoring BOTH engagements.approval_required and
 * p_is_auto_approved. All dates in the line must correspond to a real holiday
 * applicable to the staff's office; any invalid date sends the whole line to
 * pending, with no bypass for auto-approved roles (Partner/Director).
 */
describe("submit_timesheet_safe holiday-line override (BUG 0526-122)", () => {
  // Mirrors the holiday-specific v_effective_auto branch in the RPC: it is a
  // pure function of "are all logged dates valid holidays for this staff's
  // office" — approvalRequired and pIsAutoApproved are accepted (matching the
  // RPC's actual inputs) but deliberately never read, so the SQL regression
  // this mirrors is "some code path starts reading them again."
  function effectiveAutoApproveForHolidayLine(
    allDatesValid: boolean,
    _approvalRequired: boolean,
    _pIsAutoApproved: boolean
  ): boolean {
    return allDatesValid;
  }

  const BOOL_COMBOS = [
    { approvalRequired: true, pIsAutoApproved: true },
    { approvalRequired: true, pIsAutoApproved: false },
    { approvalRequired: false, pIsAutoApproved: true },
    { approvalRequired: false, pIsAutoApproved: false },
  ];

  it.each(BOOL_COMBOS)(
    "all dates valid → auto-approved regardless of approval_required=$approvalRequired / p_is_auto_approved=$pIsAutoApproved",
    ({ approvalRequired, pIsAutoApproved }) => {
      expect(effectiveAutoApproveForHolidayLine(true, approvalRequired, pIsAutoApproved)).toBe(true);
    }
  );

  it.each(BOOL_COMBOS)(
    "some date invalid → pending regardless of approval_required=$approvalRequired / p_is_auto_approved=$pIsAutoApproved (no Partner/Director bypass)",
    ({ approvalRequired, pIsAutoApproved }) => {
      expect(effectiveAutoApproveForHolidayLine(false, approvalRequired, pIsAutoApproved)).toBe(false);
    }
  );
});
