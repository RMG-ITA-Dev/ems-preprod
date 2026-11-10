import { describe, it, expect } from "vitest";
import {
  computeAssignmentDiff,
  validateAssignmentDrafts,
  resolveStaffLabel,
  findForeignCategoryKeys,
  findOutOfEngagementRangeKeys,
  rpcRowToDraft,
  buildTeamAssignmentDrafts,
  TEAM_ROLE_FIELDS,
  HOURS_PER_WEEK_MAX,
  ALLOCATION_PERCENT_MAX,
  type AssignmentDraft,
  type PersistedAssignment,
  type RpcAssignmentRow,
} from "@/lib/engagementAssignments";

function draft(overrides: Partial<AssignmentDraft> = {}): AssignmentDraft {
  return {
    key: "key-1",
    staff_id: "staff-1",
    category_id: "cat-1",
    start_date: "2026-01-01",
    end_date: "2026-06-30",
    hours_per_week: 40,
    allocation_percent: 100,
    notes: "",
    ...overrides,
  };
}

function persisted(overrides: Partial<PersistedAssignment> = {}): PersistedAssignment {
  return {
    assignment_id: "a-1",
    staff_id: "staff-1",
    category_id: "cat-1",
    start_date: "2026-01-01",
    end_date: "2026-06-30",
    hours_per_week: 40,
    allocation_percent: 100,
    notes: null,
    ...overrides,
  };
}

describe("computeAssignmentDiff — deletions are explicit only", () => {
  it("REGRESSION: a row added concurrently by another user is NOT deleted", () => {
    const rowA = persisted({ assignment_id: "a-1" });
    const rowB = persisted({ assignment_id: "b-concurrent", staff_id: "staff-2" });
    const diff = computeAssignmentDiff({
      current: [draft({ key: "a-1", assignment_id: "a-1", notes: "edited" })],
      original: [rowA, rowB],
      deletedIds: [],
    });
    expect(diff.toSoftDelete).toEqual([]);
    expect(diff.toUpdate.map((d) => d.assignment_id)).toEqual(["a-1"]);
  });

  it("soft-deletes exactly the explicitly removed ids", () => {
    const diff = computeAssignmentDiff({
      current: [],
      original: [persisted({ assignment_id: "a-1" })],
      deletedIds: ["a-1"],
    });
    expect(diff.toSoftDelete).toEqual(["a-1"]);
  });

  it("keeps an explicitly deleted id even when it already vanished from the server snapshot (retry idempotence)", () => {
    const diff = computeAssignmentDiff({
      current: [],
      original: [],
      deletedIds: ["a-1"],
    });
    expect(diff.toSoftDelete).toEqual(["a-1"]);
  });

  it("never deletes an id that is still present in the grid", () => {
    const diff = computeAssignmentDiff({
      current: [draft({ key: "a-1", assignment_id: "a-1" })],
      original: [persisted({ assignment_id: "a-1" })],
      deletedIds: ["a-1"], // contradictory input — presence in grid wins
    });
    expect(diff.toSoftDelete).toEqual([]);
  });

  it("dedupes repeated deleted ids", () => {
    const diff = computeAssignmentDiff({
      current: [],
      original: [persisted({ assignment_id: "a-1" })],
      deletedIds: ["a-1", "a-1"],
    });
    expect(diff.toSoftDelete).toEqual(["a-1"]);
  });
});

describe("computeAssignmentDiff — updates and inserts", () => {
  it("updates only persisted drafts whose fields changed", () => {
    const unchanged = draft({ key: "a-1", assignment_id: "a-1" });
    const changed = draft({
      key: "a-2",
      assignment_id: "a-2",
      staff_id: "staff-2",
      hours_per_week: 20,
    });
    const diff = computeAssignmentDiff({
      current: [unchanged, changed],
      original: [
        persisted({ assignment_id: "a-1" }),
        persisted({ assignment_id: "a-2", staff_id: "staff-2", hours_per_week: 40 }),
      ],
      deletedIds: [],
    });
    expect(diff.toUpdate.map((d) => d.assignment_id)).toEqual(["a-2"]);
    expect(diff.toInsert).toEqual([]);
  });

  it("treats notes '' and null as equal (no spurious update)", () => {
    const diff = computeAssignmentDiff({
      current: [draft({ key: "a-1", assignment_id: "a-1", notes: "" })],
      original: [persisted({ assignment_id: "a-1", notes: null })],
      deletedIds: [],
    });
    expect(diff.toUpdate).toEqual([]);
  });

  it("skips a persisted draft whose server row vanished instead of re-writing it", () => {
    const diff = computeAssignmentDiff({
      current: [draft({ key: "a-1", assignment_id: "a-1", notes: "edited" })],
      original: [],
      deletedIds: [],
    });
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toInsert).toEqual([]);
  });

  it("classifies drafts without assignment_id as inserts, carrying the client-generated key", () => {
    const newDraft = draft({ key: "local-uuid", assignment_id: undefined });
    const diff = computeAssignmentDiff({
      current: [newDraft],
      original: [],
      deletedIds: [],
    });
    expect(diff.toInsert).toEqual([newDraft]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toSoftDelete).toEqual([]);
  });
});

describe("validateAssignmentDrafts", () => {
  it("flags rows missing staff, category, or dates", () => {
    const result = validateAssignmentDrafts([
      draft({ key: "k1", staff_id: "" }),
      draft({ key: "k2", category_id: "" }),
      draft({ key: "k3", start_date: "" }),
      draft({ key: "k4" }),
    ]);
    expect(result.missing).toEqual(new Set(["k1", "k2", "k3"]));
    expect(result.valid).toBe(false);
  });

  it("flags end date before start date", () => {
    const result = validateAssignmentDrafts([
      draft({ key: "k1", start_date: "2026-06-30", end_date: "2026-01-01" }),
    ]);
    expect(result.badDates).toEqual(new Set(["k1"]));
    expect(result.valid).toBe(false);
  });

  it("flags hours/allocation outside the DB-accepted bounds", () => {
    const result = validateAssignmentDrafts([
      draft({ key: "k0", hours_per_week: 0 }),
      draft({ key: "k81", hours_per_week: 81 }),
      draft({ key: "a0", allocation_percent: 0 }),
      draft({ key: "a101", allocation_percent: 101 }),
    ]);
    expect(result.badNumbers).toEqual(new Set(["k0", "k81", "a0", "a101"]));
    expect(result.valid).toBe(false);
  });

  it("boundary: rejects exactly 0, accepts a small decimal just above 0 and the inclusive max", () => {
    const result = validateAssignmentDrafts([
      draft({ key: "zero", hours_per_week: 0, allocation_percent: 0 }),
      draft({ key: "decimal", hours_per_week: 0.5, allocation_percent: 0.5 }),
      draft({ key: "max", hours_per_week: HOURS_PER_WEEK_MAX, allocation_percent: ALLOCATION_PERCENT_MAX }),
    ]);
    expect(result.badNumbers).toEqual(new Set(["zero"]));
    expect(result.badNumbers.has("decimal")).toBe(false);
    expect(result.badNumbers.has("max")).toBe(false);
  });

  it("passes a fully valid set", () => {
    const result = validateAssignmentDrafts([draft()]);
    expect(result.valid).toBe(true);
    expect(result.missing.size).toBe(0);
    expect(result.badDates.size).toBe(0);
    expect(result.badNumbers.size).toBe(0);
  });
});

describe("resolveStaffLabel — inactive assigned staff still render", () => {
  const active = new Map([["staff-1", "Ana Alvarez"]]);
  const persistedNames = new Map([
    ["staff-1", "Ana Alvarez"],
    ["staff-gone", "Bruno Baptista"],
  ]);

  it("prefers the active option list", () => {
    expect(resolveStaffLabel("staff-1", active, persistedNames)).toBe("Ana Alvarez");
  });

  it("REGRESSION: falls back to the persisted row's name for deactivated staff", () => {
    expect(resolveStaffLabel("staff-gone", active, persistedNames)).toBe(
      "Bruno Baptista"
    );
  });

  it("returns undefined for an empty selection", () => {
    expect(resolveStaffLabel("", active, persistedNames)).toBeUndefined();
  });

  it("returns undefined for an id unknown to both sources", () => {
    expect(resolveStaffLabel("ghost", active, persistedNames)).toBeUndefined();
  });
});

describe("findForeignCategoryKeys — historical category outside the engagement's service", () => {
  const validIds = new Set(["cat-aud-1", "cat-aud-2"]);

  it("flags a persisted row whose category is outside the valid set", () => {
    const keys = findForeignCategoryKeys(
      [draft({ key: "k1", category_id: "cat-tax-1" }), draft({ key: "k2", category_id: "cat-aud-1" })],
      validIds,
      true
    );
    expect(keys).toEqual(new Set(["k1"]));
  });

  it("does not flag anything while categories are not resolved yet, even if the set happens to be empty", () => {
    const keys = findForeignCategoryKeys(
      [draft({ key: "k1", category_id: "cat-tax-1" })],
      new Set(),
      false
    );
    expect(keys.size).toBe(0);
  });

  it("REGRESSION (review #10): DOES flag once resolved, even if the resolved service has zero categories", () => {
    const keys = findForeignCategoryKeys(
      [draft({ key: "k1", category_id: "cat-tax-1" })],
      new Set(),
      true
    );
    expect(keys).toEqual(new Set(["k1"]));
  });

  it("does not flag a row without a category yet (handled by validateAssignmentDrafts)", () => {
    const keys = findForeignCategoryKeys([draft({ key: "k1", category_id: "" })], validIds, true);
    expect(keys.size).toBe(0);
  });
});

describe("findOutOfEngagementRangeKeys — assignment dates vs the Engagement's own range (O4)", () => {
  it("flags a draft that starts before the engagement's start_date", () => {
    const keys = findOutOfEngagementRangeKeys(
      [draft({ key: "k1", start_date: "2025-12-01", end_date: "2026-01-15" })],
      "2026-01-01",
      "2026-06-30"
    );
    expect(keys).toEqual(new Set(["k1"]));
  });

  it("flags a draft that ends after the engagement's end_date", () => {
    const keys = findOutOfEngagementRangeKeys(
      [draft({ key: "k1", start_date: "2026-06-01", end_date: "2026-07-15" })],
      "2026-01-01",
      "2026-06-30"
    );
    expect(keys).toEqual(new Set(["k1"]));
  });

  it("does not flag a draft on the inclusive boundary", () => {
    const keys = findOutOfEngagementRangeKeys(
      [draft({ key: "k1", start_date: "2026-01-01", end_date: "2026-06-30" })],
      "2026-01-01",
      "2026-06-30"
    );
    expect(keys.size).toBe(0);
  });

  it("does not flag anything when the Engagement has no dates (legacy)", () => {
    const keys = findOutOfEngagementRangeKeys(
      [draft({ key: "k1", start_date: "2020-01-01", end_date: "2099-12-31" })],
      null,
      null
    );
    expect(keys.size).toBe(0);
  });

  it("REGRESSION (review #S2): a start_date-only Engagement still flags a draft that starts too early", () => {
    const keys = findOutOfEngagementRangeKeys(
      [draft({ key: "k1", start_date: "2025-12-01", end_date: "2026-01-15" })],
      "2026-01-01",
      null
    );
    expect(keys).toEqual(new Set(["k1"]));
  });

  it("REGRESSION (review #S2): a start_date-only Engagement does not flag a draft within/after it", () => {
    const keys = findOutOfEngagementRangeKeys(
      [draft({ key: "k1", start_date: "2026-01-01", end_date: "2099-12-31" })],
      "2026-01-01",
      null
    );
    expect(keys.size).toBe(0);
  });

  it("REGRESSION (review #S2): an end_date-only Engagement still flags a draft that ends too late", () => {
    const keys = findOutOfEngagementRangeKeys(
      [draft({ key: "k1", start_date: "2026-06-01", end_date: "2026-07-15" })],
      null,
      "2026-06-30"
    );
    expect(keys).toEqual(new Set(["k1"]));
  });

  it("REGRESSION (review #S2): an end_date-only Engagement does not flag a draft within/before it", () => {
    const keys = findOutOfEngagementRangeKeys(
      [draft({ key: "k1", start_date: "2020-01-01", end_date: "2026-06-30" })],
      null,
      "2026-06-30"
    );
    expect(keys.size).toBe(0);
  });
});

describe("rpcRowToDraft — adopts the RPC's authoritative row as a draft/baseline", () => {
  it("maps every field, coercing numeric strings and null notes", () => {
    const row: RpcAssignmentRow = {
      assignment_id: "a-1",
      staff_id: "staff-1",
      category_id: "cat-1",
      start_date: "2026-01-01",
      end_date: "2026-06-30",
      hours_per_week: "30" as unknown as number,
      allocation_percent: "75" as unknown as number,
      status: "PROPOSED",
      notes: null,
    };
    expect(rpcRowToDraft(row)).toEqual({
      key: "a-1",
      assignment_id: "a-1",
      staff_id: "staff-1",
      category_id: "cat-1",
      start_date: "2026-01-01",
      end_date: "2026-06-30",
      hours_per_week: 30,
      allocation_percent: 75,
      notes: "",
    });
  });
});

describe("buildTeamAssignmentDrafts (FEAT 0923-203)", () => {
  const ACTIVE = new Map([
    ["s-partner", { is_schedulable: true, category_id: "cat-aud" }],
    ["s-manager", { is_schedulable: true, category_id: "cat-aud" }],
    ["s-encargado", { is_schedulable: true, category_id: "cat-aud" }],
    ["s-foreign", { is_schedulable: true, category_id: "cat-tax" }],
    ["s-nocat", { is_schedulable: true, category_id: null }],
    ["s-notsched", { is_schedulable: false, category_id: "cat-aud" }],
  ]);
  const VALID = new Set(["cat-aud"]);

  function keys() {
    let n = 0;
    return () => `k-${++n}`;
  }

  function build(teamStaffIds: Array<string | null | undefined>, existing: string[] = []) {
    return buildTeamAssignmentDrafts({
      teamStaffIds,
      existingStaffIds: new Set(existing),
      activeStaffById: ACTIVE,
      validCategoryIds: VALID,
      newKey: keys(),
    });
  }

  it("covers the six Equipo slots in a fixed order", () => {
    expect(TEAM_ROLE_FIELDS).toEqual([
      "partner_id",
      "manager_id",
      "encargado_id",
      "sqr_id",
      "specialist_it_id",
      "specialist_tax_id",
    ]);
  });

  it("builds one row per member, in slot order, preloading ONLY staff + category", () => {
    const { drafts, skippedStaffIds } = build(["s-partner", "s-manager", "s-encargado"]);
    expect(skippedStaffIds).toEqual([]);
    expect(drafts.map((d) => d.staff_id)).toEqual(["s-partner", "s-manager", "s-encargado"]);
    expect(drafts[0]).toEqual({
      key: "k-1",
      staff_id: "s-partner",
      category_id: "cat-aud",
      start_date: "",
      end_date: "",
      hours_per_week: 0,
      allocation_percent: 0,
      notes: "",
    });
    expect(drafts.every((d) => d.assignment_id === undefined)).toBe(true);
    expect(new Set(drafts.map((d) => d.key)).size).toBe(3);
  });

  it("generated rows cannot be saved untouched (dates, hours and allocation are required)", () => {
    const { drafts } = build(["s-partner"]);
    const result = validateAssignmentDrafts(drafts);
    expect(result.valid).toBe(false);
    expect(result.missing.has("k-1")).toBe(true);
    const withDates = drafts.map((d) => ({ ...d, start_date: "2026-01-01", end_date: "2026-02-01" }));
    expect(validateAssignmentDrafts(withDates).badNumbers.has("k-1")).toBe(true);
  });

  it("ignores empty slots (No Aplica)", () => {
    const { drafts } = build([null, "s-manager", undefined, "", null, null]);
    expect(drafts.map((d) => d.staff_id)).toEqual(["s-manager"]);
  });

  it("a person holding two roles yields a single row", () => {
    const { drafts } = build(["s-partner", "s-manager", "s-manager"]);
    expect(drafts.map((d) => d.staff_id)).toEqual(["s-partner", "s-manager"]);
  });

  it("never repeats staff already present in the grid", () => {
    const { drafts } = build(["s-partner", "s-manager"], ["s-partner"]);
    expect(drafts.map((d) => d.staff_id)).toEqual(["s-manager"]);
  });

  it("skips non-schedulable or inactive members (once each) instead of creating a row", () => {
    const { drafts, skippedStaffIds } = build(["s-notsched", "s-gone", "s-notsched", "s-manager"]);
    expect(drafts.map((d) => d.staff_id)).toEqual(["s-manager"]);
    expect(skippedStaffIds).toEqual(["s-notsched", "s-gone"]);
  });

  it("keeps the staff category only when it belongs to the engagement service", () => {
    const { drafts } = build(["s-foreign", "s-nocat"]);
    expect(drafts.map((d) => d.category_id)).toEqual(["", ""]);
  });
});
