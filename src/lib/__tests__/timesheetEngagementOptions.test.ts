import { describe, it, expect } from "vitest";
import { sortEngagements } from "../timesheetEngagementOptions";
import type { ApprovedEngagement } from "@/hooks/useTimesheetWeek";

function eng(
  id: string,
  code: string | null,
  name: string,
  clientName: string | null
): ApprovedEngagement {
  return {
    engagement_id: id,
    engagement_code: code,
    engagement_name: name,
    activity_required: false,
    work_order_required: false,
    is_internal: false,
    practica: null,
    funcion: null,
    start_date: null,
    end_date: null,
    client: clientName ? { client_id: id, client_legal_name: clientName } : null,
  };
}

describe("sortEngagements (BUG 0220-57)", () => {
  it("sorts by client_legal_name A-Z when clients differ", () => {
    const input = [
      eng("2", "B-001", "Beta", "Zebra Corp"),
      eng("1", "A-001", "Alpha", "Alpha Inc"),
    ];
    const result = sortEngagements(input);
    expect(result[0].engagement_id).toBe("1");
    expect(result[1].engagement_id).toBe("2");
  });

  it("sorts by engagement_code within the same client", () => {
    const input = [
      eng("2", "C-002", "Charlie", "Same Client"),
      eng("1", "A-001", "Alpha", "Same Client"),
      eng("3", "B-001", "Beta", "Same Client"),
    ];
    const result = sortEngagements(input);
    expect(result.map((e) => e.engagement_id)).toEqual(["1", "3", "2"]);
  });

  it("places null-client engagements before named-client engagements", () => {
    const input = [
      eng("2", "B-001", "Named", "ACME Corp"),
      eng("1", "A-001", "Internal", null),
    ];
    const result = sortEngagements(input);
    expect(result[0].engagement_id).toBe("1");
    expect(result[1].engagement_id).toBe("2");
  });

  it("falls back to engagement_name when engagement_code is null", () => {
    const input = [
      eng("2", null, "Zeta Project", "Same Client"),
      eng("1", null, "Alpha Project", "Same Client"),
    ];
    const result = sortEngagements(input);
    expect(result[0].engagement_id).toBe("1");
    expect(result[1].engagement_id).toBe("2");
  });

  it("does not mutate the original array", () => {
    const input = [
      eng("2", "B-001", "Beta", "Zebra Corp"),
      eng("1", "A-001", "Alpha", "Alpha Inc"),
    ];
    const original = [...input];
    sortEngagements(input);
    expect(input[0].engagement_id).toBe(original[0].engagement_id);
    expect(input[1].engagement_id).toBe(original[1].engagement_id);
  });
});
