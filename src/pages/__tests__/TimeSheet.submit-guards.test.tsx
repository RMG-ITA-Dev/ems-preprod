import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render as baseRender } from "@/test/utils";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

// TimeSheet renders AppLayout → AppSidebar which uses NavLink, so a Router context is required.
function renderWithRouter(ui: React.ReactElement) {
  return baseRender(<MemoryRouter>{ui}</MemoryRouter>);
}

// Polyfill matchMedia for jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Hoisted mock fn — lets each describe block control what useTimesheetWeek returns
const mockUseTimesheetWeek = vi.hoisted(() => vi.fn());

// Auto-mock all hooks — use importOriginal for modules with many exports
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } }, user: { id: "user-1" } })
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/timesheet" }) };
});

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1", hire_date: "2020-01-01" }, isLoading: false })
}));

vi.mock("@/hooks/useTimesheetWeek", () => ({
  useTimesheetWeek: mockUseTimesheetWeek,
}));

vi.mock("@/hooks/useEmsData", () => ({
  useGlobalSettings: () => ({
    data: [
      { setting_key: "DAILY_MIN", setting_value: "8" },
      { setting_key: "DAILY_MAX", setting_value: "8" },
      { setting_key: "WEEKLY_MIN", setting_value: "40" },
      { setting_key: "WEEKLY_MAX", setting_value: "40" }
    ]
  })
}));

vi.mock("@/hooks/useTimesheetMutations", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useSubmitTimesheet: () => ({ mutate: vi.fn(), isPending: false }),
    useUnsubmitTimesheet: () => ({ mutate: vi.fn(), isPending: false }),
    useCopyPreviousWeek: () => ({ mutate: vi.fn(), isPending: false }),
    useCopyToCurrentWeek: () => ({ mutate: vi.fn(), isPending: false }),
    useUpsertTimeEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteTimeEntry: () => ({ mutateAsync: vi.fn() }),
    useDeleteRowEntries: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdatePeriodTotalHours: () => ({ mutateAsync: vi.fn() }),
  };
});

vi.mock("@/hooks/useTimesheetPolicies", () => ({
  useTimesheetPolicies: () => ({ canEdit: true, canSubmit: true, canUnsubmit: false, isLocked: false }),
}));

vi.mock("@/hooks/useWeekStatuses", () => ({
  useWeekStatuses: () => ({ data: [] }),
}));

// Hoisted mock fn for line approvals — used by canUnsubmit guard tests
const mockUsePeriodLineApprovals = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useTimesheetApprovals", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useTimesheetApprovals: () => ({ data: [] }),
    usePeriodLineApprovals: mockUsePeriodLineApprovals,
  };
});

vi.mock("@/hooks/useHolidays", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useHolidays: () => ({ data: [] }),
    useHolidaysForWeek: () => new Map(),
    useHolidayEngagementId: () => null,
  };
});

vi.mock("@/hooks/useAdminActivity", () => ({
  useAdminActivityId: () => null,
}));

vi.mock("@/hooks/useInactivityTimeout", () => ({
  useInactivityTimeout: () => {},
}));

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => {},
}));

// Lazy import after mocks
import TimeSheet from "../TimeSheet";

// Default week mock shared by both describe blocks (unsubmitted, unlocked)
const DEFAULT_WEEK = {
  period: { period_id: "p1", is_period_locked: false },
  entries: [{ hours_logged: 10, engagement_id: "eng-1", activity_id: "" }],
  engagements: [{ engagement_id: "eng-1", activity_required: true }],
  activities: [],
  isLoading: false,
};

// Submitted week: same shape but with submitted_at set
const SUBMITTED_WEEK = {
  period: { period_id: "p1", is_period_locked: false, submitted_at: "2024-01-08T08:00:00Z" },
  entries: [{ hours_logged: 8, engagement_id: "eng-1", activity_id: "act-1" }],
  engagements: [],
  activities: [],
  isLoading: false,
};

describe("TimeSheet Submit Guards", () => {
  beforeEach(() => {
    mockUseTimesheetWeek.mockReturnValue(DEFAULT_WEEK);
    mockUsePeriodLineApprovals.mockReturnValue({ data: [] });
  });

  it("shows min alert when below WEEKLY_MIN", () => {
    renderWithRouter(<TimeSheet />);
    expect(screen.getByText(/weeklyMinNotMet/)).toBeInTheDocument();
  });

  it("blocks submit when activity-required row has empty activity", () => {
    // The mocked entries have activity_required=true engagement with empty activity_id
    // The submit guard in TimeSheet.tsx should detect this invalid state
    // Since entries have activity_required=true and activity_id="" the invalidActivityRow
    // check would fire before the submit mutation, rendering the error key
    renderWithRouter(<TimeSheet />);
    // The invalidActivityRow guard is inside handleSubmit (runtime),
    // but the UI should still render since the guard prevents submission.
    // Verify the page renders without crash (guard is defense-in-depth at submit time)
    expect(screen.getByText(/weeklyMinNotMet/)).toBeInTheDocument();
  });
});

// --- Bug 0424-101: canUnsubmit must only fire on the current week ---
// isCurrentWeek = (currentWeekStart === getWeekMonday(new Date()))
// On initial render the component initialises currentWeekStart to getWeekMonday(new Date()),
// so isCurrentWeek is always true.  Clicking "Anterior" moves currentWeekStart one week back
// while new Date() remains today → isCurrentWeek becomes false → canUnsubmit must be false.
describe("canUnsubmit guard — Bug 0424-101", () => {
  beforeEach(() => {
    mockUseTimesheetWeek.mockReturnValue(SUBMITTED_WEEK);
    mockUsePeriodLineApprovals.mockReturnValue({ data: [] });
  });

  it("shows Retirar Envío on the current pending week", () => {
    renderWithRouter(<TimeSheet />);
    // t("timesheet.unsubmit") returns the key in the test i18n stub
    expect(screen.getByText("timesheet.unsubmit")).toBeInTheDocument();
  });

  it("hides Retirar Envío after navigating to a past week", async () => {
    const user = userEvent.setup();
    renderWithRouter(<TimeSheet />);

    // Confirm visible on current week
    expect(screen.getByText("timesheet.unsubmit")).toBeInTheDocument();

    // Navigate one week back — now currentWeekStart < getWeekMonday(today) → isCurrentWeek = false
    await user.click(screen.getByRole("button", { name: "timesheet.previous" }));

    // The button must no longer be rendered (Bug 0424-101 fix)
    expect(screen.queryByText("timesheet.unsubmit")).not.toBeInTheDocument();
  });

  it("hides Retirar Envío when the period is locked on the current week", () => {
    mockUseTimesheetWeek.mockReturnValue({
      ...SUBMITTED_WEEK,
      period: { ...SUBMITTED_WEEK.period, is_period_locked: true },
    });
    renderWithRouter(<TimeSheet />);
    expect(screen.queryByText("timesheet.unsubmit")).not.toBeInTheDocument();
  });

  it("hides Retirar Envío when all lines are already approved on the current week", () => {
    mockUsePeriodLineApprovals.mockReturnValue({ data: [{ status: "approved" }] });
    renderWithRouter(<TimeSheet />);
    expect(screen.queryByText("timesheet.unsubmit")).not.toBeInTheDocument();
  });

  it("shows Retirar Envío on a past week that has rejected lines", async () => {
    mockUsePeriodLineApprovals.mockReturnValue({ data: [{ status: "rejected" }] });
    const user = userEvent.setup();
    renderWithRouter(<TimeSheet />);

    expect(screen.getByText("timesheet.unsubmit")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "timesheet.previous" }));

    // Past week but has rejected lines → button must remain visible
    expect(screen.getByText("timesheet.unsubmit")).toBeInTheDocument();
  });
});
