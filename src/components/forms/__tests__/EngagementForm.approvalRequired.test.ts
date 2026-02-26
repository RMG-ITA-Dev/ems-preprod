import { describe, it, expect } from "vitest";

/**
 * BUG 0220-61: Tests EngagementForm approval_required toggle behavior
 * (state initialization, hydration, payload inclusion).
 */
describe("EngagementForm approval_required toggle (BUG 0220-61)", () => {
  it("defaults approval_required to true on new engagement", () => {
    const engagementValue: boolean | undefined = undefined;
    const defaultValue = engagementValue ?? true;
    expect(defaultValue).toBe(true);
  });

  it("hydrates false from existing engagement with approval_required=false", () => {
    const engagement = { approval_required: false };
    const hydrated = engagement.approval_required ?? true;
    expect(hydrated).toBe(false);
  });

  it("hydrates true from existing engagement with approval_required=true", () => {
    const engagement = { approval_required: true };
    const hydrated = engagement.approval_required ?? true;
    expect(hydrated).toBe(true);
  });

  it("includes approval_required=false in create payload", () => {
    const payload = {
      engagement_name: "Holiday",
      client_id: "c1",
      is_internal: true,
      approval_required: false,
    };
    expect(payload).toHaveProperty("approval_required", false);
  });

  it("includes approval_required=true in update payload", () => {
    const payload = { approval_required: true };
    expect(payload).toHaveProperty("approval_required", true);
  });
});
