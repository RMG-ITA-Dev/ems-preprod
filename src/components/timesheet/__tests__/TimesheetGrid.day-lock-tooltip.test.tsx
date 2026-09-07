import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimesheetGrid } from "../TimesheetGrid";
import type { ApprovedEngagement, ActivityCode, TimeEntry } from "@/hooks/useTimesheetWeek";

// t returns key as value so tooltip text is assertable
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/timesheetUtils", () => ({
  toISODateString: (d: Date) => d.toISOString().split("T")[0],
  getDayName: () => "Mon",
  formatDayMonth: () => "20/04",
}));

vi.mock("@/hooks/useTimesheetMutations", () => ({
  useUpsertTimeEntry: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
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
  practica: null,
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

describe("TimesheetGrid day lock tooltip (BUG 0423-98)", () => {
  it("DL-1: hire-date lock shows dayNotEnabledForEntry tooltip", () => {
    render(<TimesheetGrid {...baseProps} lockedDaysBeforeHire={new Set([0])} />);
    expect(screen.getByText("timesheet.dayNotEnabledForEntry")).toBeInTheDocument();
  });

  it("DL-2: termination-date lock shows dayNotEnabledForEntry tooltip", () => {
    render(<TimesheetGrid {...baseProps} lockedDaysAfterTermination={new Set([4])} />);
    expect(screen.getByText("timesheet.dayNotEnabledForEntry")).toBeInTheDocument();
  });

  it("DL-3: unlocked cell has no contract-lock tooltip", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        lockedDaysBeforeHire={new Set()}
        lockedDaysAfterTermination={new Set()}
      />
    );
    expect(screen.queryByText("timesheet.dayNotEnabledForEntry")).not.toBeInTheDocument();
  });

  it("DL-4: engagement-range tooltip is unaffected; dayNotEnabledForEntry not shown", () => {
    const engWithEndDate: ApprovedEngagement = {
      ...ENGAGEMENT,
      end_date: "2026-04-18", // before all week dates → isOutOfEngagementRange fires first
    };
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry()]}
        engagements={[engWithEndDate]}
        lockedDaysBeforeHire={new Set()}
        lockedDaysAfterTermination={new Set()}
      />
    );
    expect(screen.getAllByText("timesheet.cellOutsideEngagementDates").length).toBeGreaterThan(0);
    expect(screen.queryByText("timesheet.dayNotEnabledForEntry")).not.toBeInTheDocument();
  });
});
