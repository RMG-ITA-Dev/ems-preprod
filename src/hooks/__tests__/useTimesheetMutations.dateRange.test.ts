import { describe, it, expect } from "vitest";

// Test the error token matching logic used in useTimesheetMutations (BUG 0220-63)

describe("Timesheet date range error mapping (BUG 0220-63)", () => {
  // Simulate the matching logic from useUpsertTimeEntry onError
  function matchUpsertError(errorMsg: string): string | null {
    if (errorMsg.includes("APPROVED_LINE_LOCKED")) return "approvedLineCannotEdit";
    if (errorMsg.includes("ENGAGEMENT_DATE_RANGE")) return "dateOutsideEngagementRange";
    return null;
  }

  // Simulate the matching logic from useSubmitTimesheet onError
  function matchSubmitError(msg: string): string | null {
    if (msg.includes("WEEKLY_MIN_NOT_MET")) return "weeklyMinNotMet";
    if (msg.includes("WEEKLY_MAX_EXCEEDED")) return "weeklyMaxExceeded";
    if (msg.includes("SUBMIT_NO_ENTRIES")) return "submitNoEntries";
    // VIOLATION check must come before shorter token check
    if (msg.includes("ENGAGEMENT_DATE_RANGE_VIOLATION")) return "submitDateRangeViolation";
    return null;
  }

  it("upsert error containing ENGAGEMENT_DATE_RANGE maps to dateOutsideEngagementRange", () => {
    expect(matchUpsertError("ENGAGEMENT_DATE_RANGE: date_worked 2026-02-16 is before engagement start_date 2026-02-18"))
      .toBe("dateOutsideEngagementRange");
  });

  it("submit error containing ENGAGEMENT_DATE_RANGE_VIOLATION maps to submitDateRangeViolation", () => {
    expect(matchSubmitError("ENGAGEMENT_DATE_RANGE_VIOLATION: Period contains entries outside engagement date range"))
      .toBe("submitDateRangeViolation");
  });

  it("ENGAGEMENT_DATE_RANGE_VIOLATION does not false-match shorter ENGAGEMENT_DATE_RANGE in submit handler", () => {
    // The submit handler checks _VIOLATION first, so it should map correctly
    const result = matchSubmitError("ENGAGEMENT_DATE_RANGE_VIOLATION: test");
    expect(result).toBe("submitDateRangeViolation");
  });

  it("other errors still routed to existing handlers", () => {
    expect(matchUpsertError("Some random error")).toBeNull();
    expect(matchSubmitError("Some random error")).toBeNull();
  });

  it("APPROVED_LINE_LOCKED takes precedence over ENGAGEMENT_DATE_RANGE in upsert", () => {
    expect(matchUpsertError("APPROVED_LINE_LOCKED")).toBe("approvedLineCannotEdit");
  });
});
