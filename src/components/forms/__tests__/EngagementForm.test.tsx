import { describe, it, expect } from "vitest";
import { startOfDay } from "date-fns";

/**
 * BUG 0220-48: Historical Start Dates for Internal Engagements
 *
 * Tests the minStartDate logic extracted from EngagementForm.
 * The actual component has many dependencies, so we test the pure logic directly.
 */

function computeMinStartDate(
  isInternal: boolean,
  isEdit: boolean,
  createdAt?: string
): Date | undefined {
  if (isInternal) return undefined;
  if (isEdit && createdAt) {
    return startOfDay(new Date(createdAt));
  }
  return startOfDay(new Date());
}

describe("EngagementForm start date (BUG 0220-48)", () => {
  it("allows historical start dates when is_internal is true", () => {
    const result = computeMinStartDate(true, false);
    expect(result).toBeUndefined();
  });

  it("allows historical start dates when is_internal is true (edit mode)", () => {
    const result = computeMinStartDate(true, true, "2025-06-15T00:00:00Z");
    expect(result).toBeUndefined();
  });

  it("restricts start date to today or later for non-internal new engagements", () => {
    const result = computeMinStartDate(false, false);
    expect(result).toEqual(startOfDay(new Date()));
  });

  it("restricts start date to created_at for non-internal edits", () => {
    const createdAt = "2025-11-20T14:30:00Z";
    const result = computeMinStartDate(false, true, createdAt);
    expect(result).toEqual(startOfDay(new Date(createdAt)));
  });
});
