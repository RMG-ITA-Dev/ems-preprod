import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// This file tests the ConsolidationDialog export flow integration.
// Due to the complexity of mocking the full TrackerList, we test the
// ConsolidationDialog component directly with controlled props.

import { ConsolidationDialog } from "@/components/tracker/ConsolidationDialog";
import type { PreflightAnalysis } from "@/lib/timerExportUtils";
import type { TimerEntry } from "@/hooks/useTimerEntries";

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "tracker.consolidation.conflictTitle": "Unselected matching entries found",
        "tracker.consolidation.title": "Entry Consolidation",
        "tracker.consolidation.conflictDescription": "Partial export not allowed",
        "tracker.consolidation.description": "Entries will be combined",
        "tracker.consolidation.noPartialPush": "Choose how to proceed",
        "tracker.consolidation.includeAll": "Include All Matching",
        "tracker.consolidation.excludeConflicting": "Exclude Conflicting Groups",
        "tracker.consolidation.cancel": "Cancel",
        "tracker.consolidation.proceed": "Proceed",
        "tracker.consolidation.date": "Date",
        "tracker.consolidation.engagement": "Engagement",
        "tracker.consolidation.activity": "Activity",
        "tracker.consolidation.selected": "Selected",
        "tracker.consolidation.unselected": "Not Selected",
        "tracker.consolidation.groupHeader": "Entries to consolidate",
        "tracker.consolidation.reason": "Combined to avoid duplicates",
        "tracker.hours": "Hours",
        "tracker.consolidation.dataChanged": "Data changed",
        "tracker.consolidation.emptyAfterExclude": "Nothing to export",
        "tracker.consolidation.excludedToast": "Excluded",
      };
      return map[key] || key;
    },
  }),
}));

function makeEntry(id: string, engId: string, actId: string, date: string): TimerEntry {
  return {
    timer_id: id,
    staff_id: "s1",
    engagement_id: engId,
    activity_id: actId,
    description: null,
    started_at: `${date}T08:00:00Z`,
    ended_at: `${date}T09:00:00Z`,
    duration_minutes: 60,
    is_imported: false,
    imported_to_time_id: null,
    has_explicit_times: true,
    created_at: `${date}T08:00:00Z`,
    engagement: { engagement_name: "Eng", engagement_code: "ENG-01" },
    activity: { activity_code: "ACT-01", description: "Act" },
  };
}

function makeConflictAnalysis(): PreflightAnalysis {
  const t1 = makeEntry("t1", "e1", "a1", "2026-02-20");
  const t2 = makeEntry("t2", "e1", "a1", "2026-02-20");
  const t3 = makeEntry("t3", "e1", "a1", "2026-02-20");

  return {
    groups: new Map([["e1|a1|2026-02-20", {
      key: "e1|a1|2026-02-20",
      engagementId: "e1",
      engagementCode: "ENG-01",
      engagementName: "Eng",
      activityId: "a1",
      activityCode: "ACT-01",
      dateWorked: "2026-02-20",
      entries: [t1, t2, t3],
      totalMinutes: 180,
    }]]),
    conflicts: [{
      key: "e1|a1|2026-02-20",
      engagementCode: "ENG-01",
      activityCode: "ACT-01",
      dateWorked: "2026-02-20",
      selectedEntries: [t1, t2],
      selectedMinutes: 120,
      unselectedEntries: [t3],
      unselectedMinutes: 60,
    }],
    hasConsolidation: true,
    hasConflicts: true,
    preview: {
      mergedGroups: [{ key: "e1|a1|2026-02-20", engagementCode: "ENG-01", activityCode: "ACT-01", dateWorked: "2026-02-20", entryCount: 3, totalMinutes: 180 }],
      resultingRowCount: 1,
      totalEntries: 3,
      totalHours: 3,
    },
    eligibleIds: new Set(["t1", "t2", "t3"]),
    selectedIdsSnapshot: new Set(["t1", "t2"]),
  };
}

function makeInfoAnalysis(): PreflightAnalysis {
  const t1 = makeEntry("t1", "e1", "a1", "2026-02-20");
  const t2 = makeEntry("t2", "e1", "a1", "2026-02-20");

  return {
    groups: new Map([["e1|a1|2026-02-20", {
      key: "e1|a1|2026-02-20",
      engagementId: "e1",
      engagementCode: "ENG-01",
      engagementName: "Eng",
      activityId: "a1",
      activityCode: "ACT-01",
      dateWorked: "2026-02-20",
      entries: [t1, t2],
      totalMinutes: 120,
    }]]),
    conflicts: [],
    hasConsolidation: true,
    hasConflicts: false,
    preview: {
      mergedGroups: [{ key: "e1|a1|2026-02-20", engagementCode: "ENG-01", activityCode: "ACT-01", dateWorked: "2026-02-20", entryCount: 2, totalMinutes: 120 }],
      resultingRowCount: 1,
      totalEntries: 2,
      totalHours: 2,
    },
    eligibleIds: new Set(["t1", "t2"]),
    selectedIdsSnapshot: new Set(["t1", "t2"]),
  };
}

describe("ConsolidationDialog - Conflict Mode", () => {
  // F1
  it("shows conflict dialog with 3 action buttons", () => {
    const analysis = makeConflictAnalysis();
    render(
      <ConsolidationDialog
        open={true}
        analysis={analysis}
        onIncludeAllMatching={vi.fn()}
        onExcludeConflicting={vi.fn()}
        onProceed={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("Unselected matching entries found")).toBeInTheDocument();
    expect(screen.getByText("Include All Matching")).toBeInTheDocument();
    expect(screen.getByText("Exclude Conflicting Groups")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  // F2
  it("calls onIncludeAllMatching when button clicked", async () => {
    const onInclude = vi.fn();
    const analysis = makeConflictAnalysis();
    render(
      <ConsolidationDialog
        open={true}
        analysis={analysis}
        onIncludeAllMatching={onInclude}
        onExcludeConflicting={vi.fn()}
        onProceed={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByText("Include All Matching"));
    expect(onInclude).toHaveBeenCalledTimes(1);
  });

  // F3
  it("calls onExcludeConflicting when button clicked", async () => {
    const onExclude = vi.fn();
    const analysis = makeConflictAnalysis();
    render(
      <ConsolidationDialog
        open={true}
        analysis={analysis}
        onIncludeAllMatching={vi.fn()}
        onExcludeConflicting={onExclude}
        onProceed={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByText("Exclude Conflicting Groups"));
    expect(onExclude).toHaveBeenCalledTimes(1);
  });

  // F4
  it("calls onCancel when cancel clicked", async () => {
    const onCancel = vi.fn();
    const analysis = makeConflictAnalysis();
    render(
      <ConsolidationDialog
        open={true}
        analysis={analysis}
        onIncludeAllMatching={vi.fn()}
        onExcludeConflicting={vi.fn()}
        onProceed={vi.fn()}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("ConsolidationDialog - Info Mode", () => {
  // F5
  it("shows info dialog with Proceed and Cancel buttons (no conflict buttons)", () => {
    const analysis = makeInfoAnalysis();
    render(
      <ConsolidationDialog
        open={true}
        analysis={analysis}
        onIncludeAllMatching={vi.fn()}
        onExcludeConflicting={vi.fn()}
        onProceed={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("Entry Consolidation")).toBeInTheDocument();
    expect(screen.getByText("Proceed")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.queryByText("Include All Matching")).not.toBeInTheDocument();
    expect(screen.queryByText("Exclude Conflicting Groups")).not.toBeInTheDocument();
  });
});

describe("ConsolidationDialog - Stale Refresh", () => {
  // F6
  it("highlights changed conflict rows when previousAnalysis differs", () => {
    const analysis = makeConflictAnalysis();
    // previous had no conflicts (simulating change)
    const previous: PreflightAnalysis = {
      ...analysis,
      conflicts: [],
      hasConflicts: false,
    };

    render(
      <ConsolidationDialog
        open={true}
        analysis={analysis}
        previousAnalysis={previous}
        onIncludeAllMatching={vi.fn()}
        onExcludeConflicting={vi.fn()}
        onProceed={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // The conflict row should have the highlight animation class
    const rows = screen.getAllByRole("row");
    // First row is header, second is conflict data row
    const dataRow = rows[rows.length - 1];
    expect(dataRow.className).toContain("animate-pulse");
  });
});
