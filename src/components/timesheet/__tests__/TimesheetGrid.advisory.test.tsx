import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TimesheetGrid } from "../TimesheetGrid";
import type { AssignmentWindow, SegmentsByEngagement } from "@/lib/timesheetAssignmentAdvisory";
import type { ApprovedEngagement, ActivityCode, TimeEntry } from "@/hooks/useTimesheetWeek";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/timesheetUtils", () => ({
  toISODateString: (d: Date) => d.toISOString().split("T")[0],
  getDayName: () => "Mon",
  formatDayMonth: () => "20/04",
}));

const upsertMutate = vi.fn();
vi.mock("@/hooks/useTimesheetMutations", () => ({
  useUpsertTimeEntry: () => ({ mutate: upsertMutate, mutateAsync: vi.fn(), isPending: false }),
  useDeleteRowEntries: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEntryActivity: () => ({ mutate: vi.fn() }),
}));

// Always-visible tooltip mock avoids jsdom pointer-event mechanics for Radix
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../TimesheetEngagementCombobox", () => ({
  TimesheetEngagementCombobox: () => <div data-testid="engagement-combobox" />,
}));

vi.mock("@/lib/timesheetActivityRules", () => ({
  normalizeActivityForEngagement: ({ currentActivityId }: { currentActivityId: string }) => ({
    nextActivityId: currentActivityId,
    wasCleared: false,
  }),
}));

vi.mock("@/lib/timesheetEngagementOptions", () => ({
  sortEngagements: (arr: unknown[]) => arr,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const WEEK_DATES = [
  new Date("2026-04-20"),
  new Date("2026-04-21"),
  new Date("2026-04-22"),
  new Date("2026-04-23"),
  new Date("2026-04-24"),
];

const ENGAGEMENT: ApprovedEngagement = {
  engagement_id: "eng-1",
  engagement_code: "E001",
  engagement_name: "Test Engagement",
  activity_required: true,
  work_order_required: false,
  is_internal: false,
  // 0827-184 review#15: funcion=1 requires a matching practica for the fixture's activity
  // to be considered valid (filterActivitiesForEngagement) — practica=null would make the
  // grid's fail-closed activity-validity guard disable every cell, which isn't what these
  // advisory tests are about.
  practica: 1,
  funcion: 1,
  start_date: null,
  end_date: null,
  client: null,
};

const ACTIVITY: ActivityCode = {
  activity_id: "act-1",
  activity_code: "A01",
  description: "Activity 1",
  is_active: true,
  is_system: false,
  service: { code: 1 },
};

const makeEntry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  time_id: "t1",
  staff_id: "staff-1",
  engagement_id: "eng-1",
  activity_id: "act-1",
  date_worked: "2026-04-20",
  hours_logged: 8,
  description: null,
  period_id: "period-1",
  is_forecast: false,
  ...overrides,
});

const windowsFor = (engagementId: string, windows: AssignmentWindow[]): SegmentsByEngagement =>
  new Map([[engagementId, windows]]);

const baseProps = {
  weekDates: WEEK_DATES,
  entries: [] as TimeEntry[],
  engagements: [ENGAGEMENT],
  activities: [ACTIVITY],
  staffId: "staff-1",
  periodId: "period-1",
  isLocked: false,
  autoSaveSeconds: 0,
  lang: "en",
  lineApprovals: [],
};

describe("TimesheetGrid assignment advisory (Fase 6)", () => {
  it("marks a cell with positive hours not covered by any window, and keeps it editable", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ hours_logged: 8 })]}
        assignmentWindows={windowsFor("eng-1", [{ start_date: "2026-05-01", end_date: "2026-05-05" }])}
      />
    );
    expect(screen.getByLabelText("timesheet.assignmentAdvisory.cellAriaLabel")).toBeInTheDocument();
    const input = screen.getByDisplayValue("8");
    expect(input).not.toBeDisabled();
  });

  it("does not mark a cell covered by a window", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ hours_logged: 8 })]}
        assignmentWindows={windowsFor("eng-1", [{ start_date: "2026-04-20", end_date: "2026-04-24" }])}
      />
    );
    expect(screen.queryByLabelText("timesheet.assignmentAdvisory.cellAriaLabel")).not.toBeInTheDocument();
  });

  it("assignmentWindows === undefined (data unavailable) never marks anything", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ hours_logged: 8 })]}
        assignmentWindows={undefined}
      />
    );
    expect(screen.queryByLabelText("timesheet.assignmentAdvisory.cellAriaLabel")).not.toBeInTheDocument();
  });

  it("a valid empty map is authoritative — marks every cell with positive hours", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ hours_logged: 8 })]}
        assignmentWindows={new Map()}
      />
    );
    expect(screen.getByLabelText("timesheet.assignmentAdvisory.cellAriaLabel")).toBeInTheDocument();
  });

  it("zero-hour cells are never marked, even with an authoritative empty map", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ hours_logged: 0 })]}
        assignmentWindows={new Map()}
      />
    );
    expect(screen.queryByLabelText("timesheet.assignmentAdvisory.cellAriaLabel")).not.toBeInTheDocument();
  });

  it("a forecast entry with positive hours is still marked — TimesheetGrid has no is_forecast branch of its own", () => {
    // Corrected during review (Fase 6, iteration 1): the previous version passed entries={[]}
    // and asserted "no mark", which passed vacuously no matter how forecast was handled.
    // `initialRows` (TimesheetGrid.tsx) does `row.hours[dateStr] = entry.hours_logged` and drops
    // `is_forecast` entirely — this component has no way to know an entry was forecast. The real
    // guarantee lives upstream: useTimesheetWeek.ts already filters `.eq("is_forecast", false)`
    // before entries ever reach this component (Plan v2 Gap Analysis). This test documents that
    // boundary instead of asserting something TimesheetGrid cannot actually enforce.
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ is_forecast: true, hours_logged: 8 })]}
        assignmentWindows={new Map()}
      />
    );
    expect(screen.getByLabelText("timesheet.assignmentAdvisory.cellAriaLabel")).toBeInTheDocument();
  });

  it("control positive: an engagement out of range is disabled and its own tooltip suppresses the advisory mark", () => {
    const engOutOfRange: ApprovedEngagement = { ...ENGAGEMENT, end_date: "2026-04-18" };
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ hours_logged: 8 })]}
        engagements={[engOutOfRange]}
        assignmentWindows={new Map()}
      />
    );
    expect(screen.getAllByText("timesheet.cellOutsideEngagementDates").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("timesheet.assignmentAdvisory.cellAriaLabel")).not.toBeInTheDocument();
  });

  it("a locked (submitted/approved) week still shows the mark — never color-only", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ hours_logged: 8 })]}
        isLocked={true}
        assignmentWindows={new Map()}
      />
    );
    const marker = screen.getByLabelText("timesheet.assignmentAdvisory.cellAriaLabel");
    expect(marker).toBeInTheDocument();
    const input = screen.getByDisplayValue("8");
    expect(input).toBeDisabled();
  });

  it("hire-date lock suppresses the advisory mark (its own tooltip branch takes precedence)", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ hours_logged: 8 })]}
        lockedDaysBeforeHire={new Set([0])}
        assignmentWindows={new Map()}
      />
    );
    expect(screen.getByText("timesheet.dayNotEnabledForEntry")).toBeInTheDocument();
    expect(screen.queryByLabelText("timesheet.assignmentAdvisory.cellAriaLabel")).not.toBeInTheDocument();
  });

  it("termination-date lock suppresses the advisory mark", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ hours_logged: 8, date_worked: "2026-04-24" })]}
        lockedDaysAfterTermination={new Set([4])}
        assignmentWindows={new Map()}
      />
    );
    expect(screen.getByText("timesheet.dayNotEnabledForEntry")).toBeInTheDocument();
    expect(screen.queryByLabelText("timesheet.assignmentAdvisory.cellAriaLabel")).not.toBeInTheDocument();
  });

  it("editing an unmarked-then-marked cell still calls the upsert mutation (advisory never blocks saving)", async () => {
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ hours_logged: 8 })]}
        assignmentWindows={new Map()}
        autoSaveSeconds={0}
      />
    );
    const input = screen.getByDisplayValue("8") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5" } });
    await waitFor(() => expect(upsertMutate).toHaveBeenCalled());
  });

  it("renders the marker as a focusable sibling of the input, not wrapping it (no remount on mark)", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ hours_logged: 8 })]}
        assignmentWindows={new Map()}
      />
    );
    const input = screen.getByDisplayValue("8");
    const marker = screen.getByLabelText("timesheet.assignmentAdvisory.cellAriaLabel");
    expect(marker.contains(input)).toBe(false);
    expect(input.contains(marker)).toBe(false);
    expect(marker.tagName).toBe("BUTTON");
  });
});
