import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render as baseRender } from "@/test/utils";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

function renderWithRouter(ui: React.ReactElement) {
  return baseRender(<MemoryRouter>{ui}</MemoryRouter>);
}

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

const mockUseTimesheetWeek = vi.hoisted(() => vi.fn());
const mockUseStaffAssignmentSegments = vi.hoisted(() => vi.fn());
const mockUseTimesheetPolicies = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } }, user: { id: "user-1" } }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/timesheet" }) };
});

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1", hire_date: "2020-01-01" }, isLoading: false }),
}));

vi.mock("@/hooks/useTimesheetWeek", () => ({
  useTimesheetWeek: mockUseTimesheetWeek,
}));

vi.mock("@/hooks/scheduler/useStaffAssignmentSegments", () => ({
  useStaffAssignmentSegments: mockUseStaffAssignmentSegments,
}));

vi.mock("@/hooks/useEmsData", () => ({
  useGlobalSettings: () => ({
    data: [
      { setting_key: "DAILY_MIN", setting_value: "8" },
      { setting_key: "DAILY_MAX", setting_value: "8" },
      { setting_key: "WEEKLY_MIN", setting_value: "40" },
      { setting_key: "WEEKLY_MAX", setting_value: "40" },
    ],
  }),
}));

const mockSubmitMutate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useTimesheetMutations", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useSubmitTimesheet: () => ({ mutate: mockSubmitMutate, isPending: false }),
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
  useTimesheetPolicies: mockUseTimesheetPolicies,
}));

vi.mock("@/hooks/useWeekStatuses", () => ({
  useWeekStatuses: () => ({ data: [] }),
}));

vi.mock("@/hooks/useTimesheetApprovals", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useTimesheetApprovals: () => ({ data: [] }),
    usePeriodLineApprovals: () => ({ data: [] }),
  };
});

vi.mock("@/hooks/useHolidays", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useHolidays: () => ({ data: [] }),
    useHolidaysForWeek: () => new Map(),
    useHolidayEngagementId: () => null,
  };
});

vi.mock("@/hooks/useAdminActivity", () => ({ useAdminActivityId: () => null }));
vi.mock("@/hooks/useInactivityTimeout", () => ({ useInactivityTimeout: () => {} }));
vi.mock("@/hooks/usePageLeaveLock", () => ({ usePageLeaveLock: () => {} }));

import TimeSheet from "../TimeSheet";

// Mon 2025-05-19 .. Fri 2025-05-23, 8/8/8/8/8 = 40h, no daily/weekly violations.
const VALID_WEEK = {
  period: { period_id: "p1", is_period_locked: false },
  entries: [
    { hours_logged: 8, date_worked: "2025-05-19", engagement_id: "eng-1", activity_id: "act-1" },
    { hours_logged: 8, date_worked: "2025-05-20", engagement_id: "eng-1", activity_id: "act-1" },
    { hours_logged: 8, date_worked: "2025-05-21", engagement_id: "eng-1", activity_id: "act-1" },
    { hours_logged: 8, date_worked: "2025-05-22", engagement_id: "eng-1", activity_id: "act-1" },
    { hours_logged: 8, date_worked: "2025-05-23", engagement_id: "eng-1", activity_id: "act-1" },
  ],
  engagements: [{ engagement_id: "eng-1", engagement_name: "Eng A", activity_required: true }],
  activities: [],
  isLoading: false,
};

const SUBMITTED_WEEK = {
  ...VALID_WEEK,
  period: { period_id: "p1", is_period_locked: false, submitted_at: "2025-05-24T00:00:00Z" },
};

const DAILY_INVALID_WEEK = {
  ...VALID_WEEK,
  entries: [
    { hours_logged: 10, date_worked: "2025-05-19", engagement_id: "eng-1", activity_id: "act-1" },
    { hours_logged: 8, date_worked: "2025-05-20", engagement_id: "eng-1", activity_id: "act-1" },
    { hours_logged: 8, date_worked: "2025-05-21", engagement_id: "eng-1", activity_id: "act-1" },
    { hours_logged: 8, date_worked: "2025-05-22", engagement_id: "eng-1", activity_id: "act-1" },
    { hours_logged: 6, date_worked: "2025-05-23", engagement_id: "eng-1", activity_id: "act-1" },
  ],
};

describe("TimeSheet assignment advisory (Fase 6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 4, 21)); // Wed 2025-05-21 -> currentWeekStart = Mon 2025-05-19
    mockUseTimesheetWeek.mockReturnValue(VALID_WEEK);
    mockUseTimesheetPolicies.mockReturnValue({ data: { workDays: 5 }, isPending: false });
    mockUseStaffAssignmentSegments.mockReturnValue({ data: null, isSuccess: true, isError: false });
    mockSubmitMutate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes the canonical Monday and the last displayed day (Friday, 5-day week) to the segments hook, once per staff/week", () => {
    renderWithRouter(<TimeSheet />);
    expect(mockUseStaffAssignmentSegments).toHaveBeenCalledWith("staff-1", "2025-05-19", "2025-05-23");
    // Called exactly once during this render pass (not once per cell/engagement).
    expect(mockUseStaffAssignmentSegments).toHaveBeenCalledTimes(1);
  });

  it("passes a Saturday week-end when workDays=6", () => {
    mockUseTimesheetPolicies.mockReturnValue({ data: { workDays: 6 }, isPending: false });
    renderWithRouter(<TimeSheet />);
    expect(mockUseStaffAssignmentSegments).toHaveBeenCalledWith("staff-1", "2025-05-19", "2025-05-24");
  });

  it("retains the query (undefined weekEnd) while policies are pending, to avoid a Friday-then-Saturday double query", () => {
    mockUseTimesheetPolicies.mockReturnValue({ data: undefined, isPending: true });
    renderWithRouter(<TimeSheet />);
    expect(mockUseStaffAssignmentSegments).toHaveBeenCalledWith("staff-1", "2025-05-19", undefined);
  });

  it("shows the weekly advisory banner when unauthorizedCount > 0 on an editable week", () => {
    mockUseStaffAssignmentSegments.mockReturnValue({
      data: new Map(), // authoritative empty map -> every positive-hour entry is unauthorized
      isSuccess: true,
      isError: false,
    });
    renderWithRouter(<TimeSheet />);
    expect(screen.getByText("timesheet.assignmentAdvisory.banner")).toBeInTheDocument();
  });

  it("keeps showing the banner on a submitted/locked week", () => {
    mockUseTimesheetWeek.mockReturnValue(SUBMITTED_WEEK);
    mockUseStaffAssignmentSegments.mockReturnValue({ data: new Map(), isSuccess: true, isError: false });
    renderWithRouter(<TimeSheet />);
    expect(screen.getByText("timesheet.assignmentAdvisory.banner")).toBeInTheDocument();
  });

  it("data unavailable (null map) never shows the advisory banner", () => {
    mockUseStaffAssignmentSegments.mockReturnValue({ data: null, isSuccess: true, isError: false });
    renderWithRouter(<TimeSheet />);
    expect(screen.queryByText("timesheet.assignmentAdvisory.banner")).not.toBeInTheDocument();
    // The minimal "unavailable" indicator shows instead.
    expect(screen.getByText("timesheet.assignmentAdvisory.unavailable")).toBeInTheDocument();
  });

  it("no banner when every logged hour is covered by a window", () => {
    mockUseStaffAssignmentSegments.mockReturnValue({
      data: new Map([["eng-1", [{ start_date: "2025-05-19", end_date: "2025-05-23" }]]]),
      isSuccess: true,
      isError: false,
    });
    renderWithRouter(<TimeSheet />);
    expect(screen.queryByText("timesheet.assignmentAdvisory.banner")).not.toBeInTheDocument();
    expect(screen.queryByText("timesheet.assignmentAdvisory.unavailable")).not.toBeInTheDocument();
  });

  it("the advisory never disables Submit on an otherwise-valid week", () => {
    mockUseStaffAssignmentSegments.mockReturnValue({ data: new Map(), isSuccess: true, isError: false });
    renderWithRouter(<TimeSheet />);
    expect(screen.getByText("timesheet.assignmentAdvisory.banner")).toBeInTheDocument();
    expect(screen.getByText("timesheet.submitWeek")).toBeInTheDocument();
  });

  it("advisory banner + daily-limit violation: both banners render, Submit is hidden only because of the daily limit", () => {
    mockUseTimesheetWeek.mockReturnValue(DAILY_INVALID_WEEK);
    mockUseStaffAssignmentSegments.mockReturnValue({ data: new Map(), isSuccess: true, isError: false });
    renderWithRouter(<TimeSheet />);
    expect(screen.getByText("timesheet.assignmentAdvisory.banner")).toBeInTheDocument();
    expect(screen.getByText(/dailyLimitSubmitBlocked/)).toBeInTheDocument();
    expect(screen.queryByText("timesheet.submitWeek")).not.toBeInTheDocument();
  });
});
