import { describe, it, expect } from "vitest";
import {
  buildExportGroups,
  detectSplitSelectionConflicts,
  resolveFinalExportSet,
  buildConsolidationPreview,
  analysisEquals,
  type PreflightAnalysis,
  type ExportGroup,
} from "@/lib/timerExportUtils";
import type { TimerEntry } from "@/hooks/useTimerEntries";

function makeEntry(overrides: Partial<TimerEntry> & { timer_id: string; engagement_id: string; activity_id: string; started_at: string }): TimerEntry {
  return {
    staff_id: "staff-1",
    description: null,
    ended_at: "2026-02-20T18:00:00Z",
    duration_minutes: 60,
    is_imported: false,
    imported_to_time_id: null,
    has_explicit_times: true,
    created_at: "2026-02-20T08:00:00Z",
    engagement: { engagement_name: "Test Eng", engagement_code: "ENG-01" },
    activity: { activity_code: "ACT-01", description: "Test Activity" },
    ...overrides,
  };
}

describe("buildExportGroups", () => {
  // U1
  it("groups entries by (date, engagement, activity)", () => {
    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z" }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T10:00:00Z" }),
      makeEntry({ timer_id: "t3", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T14:00:00Z" }),
    ];
    const groups = buildExportGroups(entries);
    expect(groups.size).toBe(1);
    const group = Array.from(groups.values())[0];
    expect(group.entries).toHaveLength(3);
  });

  // U2
  it("different dates produce different groups", () => {
    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z" }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-21T08:00:00Z" }),
    ];
    const groups = buildExportGroups(entries);
    expect(groups.size).toBe(2);
  });

  // U3
  it("different activities produce different groups", () => {
    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z" }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a2", started_at: "2026-02-20T08:00:00Z",
        activity: { activity_code: "ACT-02", description: "Other" } }),
    ];
    const groups = buildExportGroups(entries);
    expect(groups.size).toBe(2);
  });

  // U11
  it("excludes running entries (ended_at=null)", () => {
    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z", ended_at: null }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T10:00:00Z" }),
    ];
    const groups = buildExportGroups(entries);
    expect(groups.size).toBe(1);
    expect(Array.from(groups.values())[0].entries).toHaveLength(1);
  });

  // U12
  it("excludes imported entries", () => {
    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z", is_imported: true }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T10:00:00Z" }),
    ];
    const groups = buildExportGroups(entries);
    const group = Array.from(groups.values())[0];
    expect(group.entries).toHaveLength(1);
    expect(group.entries[0].timer_id).toBe("t2");
  });

  // U13
  it("returns groups in deterministic order", () => {
    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e2", activity_id: "a1", started_at: "2026-02-21T08:00:00Z",
        engagement: { engagement_name: "Eng B", engagement_code: "ENG-B" } }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z",
        engagement: { engagement_name: "Eng A", engagement_code: "ENG-A" } }),
    ];
    const groups = buildExportGroups(entries);
    const keys = Array.from(groups.keys());
    // ENG-A on 02-20 should come before ENG-B on 02-21
    expect(keys[0]).toContain("e1");
    expect(keys[1]).toContain("e2");
  });
});

describe("detectSplitSelectionConflicts", () => {
  // U4
  it("detects split-group conflict", () => {
    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z" }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T10:00:00Z" }),
      makeEntry({ timer_id: "t3", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T14:00:00Z" }),
    ];
    const groups = buildExportGroups(entries);
    const selected = new Set(["t1", "t2"]);
    const conflicts = detectSplitSelectionConflicts(groups, selected);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].selectedEntries).toHaveLength(2);
    expect(conflicts[0].unselectedEntries).toHaveLength(1);
  });

  // U5
  it("no conflict when all in group selected", () => {
    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z" }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T10:00:00Z" }),
    ];
    const groups = buildExportGroups(entries);
    const selected = new Set(["t1", "t2"]);
    const conflicts = detectSplitSelectionConflicts(groups, selected);
    expect(conflicts).toHaveLength(0);
  });

  // U6
  it("no conflict when single-entry group", () => {
    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z" }),
    ];
    const groups = buildExportGroups(entries);
    const selected = new Set(["t1"]);
    const conflicts = detectSplitSelectionConflicts(groups, selected);
    expect(conflicts).toHaveLength(0);
  });
});

describe("resolveFinalExportSet", () => {
  const allEligible = [
    makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z" }),
    makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T10:00:00Z" }),
    makeEntry({ timer_id: "t3", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T14:00:00Z" }),
    makeEntry({ timer_id: "t4", engagement_id: "e2", activity_id: "a2", started_at: "2026-02-20T08:00:00Z",
      engagement: { engagement_name: "Other", engagement_code: "ENG-02" },
      activity: { activity_code: "ACT-02", description: "Other" } }),
  ];

  const groups = buildExportGroups(allEligible);
  const selectedIds = new Set(["t1", "t2", "t4"]);
  const conflicts = detectSplitSelectionConflicts(groups, selectedIds);

  // U7
  it("include_all_matching expands final set", () => {
    const resolved = resolveFinalExportSet(allEligible, selectedIds, conflicts, "include_all_matching");
    const ids = resolved.map(e => e.timer_id).sort();
    expect(ids).toContain("t3"); // unselected from conflict group
    expect(ids).toHaveLength(4);
  });

  // U8
  it("exclude_conflicting_groups drops all conflicted entries", () => {
    const resolved = resolveFinalExportSet(allEligible, selectedIds, conflicts, "exclude_conflicting_groups");
    const ids = resolved.map(e => e.timer_id);
    // t1, t2 are in conflicted group (has t3 unselected) -> dropped
    // t4 is non-conflicted -> kept
    expect(ids).toEqual(["t4"]);
    // Atomicity: no subset of conflicted group survives
    expect(ids).not.toContain("t1");
    expect(ids).not.toContain("t2");
    expect(ids).not.toContain("t3");
  });

  // U9
  it("cancel returns empty array", () => {
    const resolved = resolveFinalExportSet(allEligible, selectedIds, conflicts, "cancel");
    expect(resolved).toEqual([]);
  });
});

describe("buildConsolidationPreview", () => {
  // U10
  it("computes correct preview", () => {
    const entries = [
      makeEntry({ timer_id: "t1", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T08:00:00Z", duration_minutes: 60 }),
      makeEntry({ timer_id: "t2", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T10:00:00Z", duration_minutes: 120 }),
      makeEntry({ timer_id: "t3", engagement_id: "e1", activity_id: "a1", started_at: "2026-02-20T14:00:00Z", duration_minutes: 30 }),
      makeEntry({ timer_id: "t4", engagement_id: "e2", activity_id: "a2", started_at: "2026-02-20T08:00:00Z", duration_minutes: 90,
        engagement: { engagement_name: "Other", engagement_code: "ENG-02" },
        activity: { activity_code: "ACT-02", description: "Other" } }),
      makeEntry({ timer_id: "t5", engagement_id: "e2", activity_id: "a2", started_at: "2026-02-20T10:00:00Z", duration_minutes: 45,
        engagement: { engagement_name: "Other", engagement_code: "ENG-02" },
        activity: { activity_code: "ACT-02", description: "Other" } }),
    ];
    const groups = buildExportGroups(entries);
    const finalIds = new Set(["t1", "t2", "t3", "t4", "t5"]);
    const preview = buildConsolidationPreview(groups, finalIds);
    expect(preview.mergedGroups).toHaveLength(2);
    expect(preview.resultingRowCount).toBe(2);
    expect(preview.totalEntries).toBe(5);
  });
});

describe("analysisEquals", () => {
  // U14
  it("detects equality and drift", () => {
    const base: PreflightAnalysis = {
      groups: new Map(),
      conflicts: [],
      hasConsolidation: false,
      hasConflicts: false,
      preview: { mergedGroups: [], resultingRowCount: 0, totalEntries: 0, totalHours: 0 },
      eligibleIds: new Set(["t1", "t2"]),
      selectedIdsSnapshot: new Set(["t1"]),
    };

    // Same = true
    const same: PreflightAnalysis = { ...base, eligibleIds: new Set(["t1", "t2"]), selectedIdsSnapshot: new Set(["t1"]) };
    expect(analysisEquals(base, same)).toBe(true);

    // Changed eligible = false
    const changedEligible: PreflightAnalysis = { ...base, eligibleIds: new Set(["t1", "t2", "t3"]), selectedIdsSnapshot: new Set(["t1"]) };
    expect(analysisEquals(base, changedEligible)).toBe(false);

    // Changed selected = false
    const changedSelected: PreflightAnalysis = { ...base, eligibleIds: new Set(["t1", "t2"]), selectedIdsSnapshot: new Set(["t1", "t2"]) };
    expect(analysisEquals(base, changedSelected)).toBe(false);
  });
});
