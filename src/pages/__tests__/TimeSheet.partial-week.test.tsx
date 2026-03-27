import { describe, it, expect, vi } from "vitest";
import { render as customRender } from "@/test/utils";
import { screen } from "@testing-library/react";

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

// Auto-mock all hooks
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } }, user: { id: "user-1" } })
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/timesheet" }) };
});

// BUG 0306-74: hire_date is today (the last workable day of the current week) — only 1 workable day
// We use a dynamic date so the test works regardless of when it runs
const today = new Date();
const todayISO = today.toISOString().slice(0, 10);

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1", hire_date: todayISO }, isLoading: false })
}));

// 8h logged on that single workable day — meets the prorated minimum (8h)
vi.mock("@/hooks/useTimesheetWeek", () => ({
  useTimesheetWeek: () => ({
    period: { period_id: "p1", is_period_locked: false },
    entries: [{ hours_logged: 8, engagement_id: "eng-1", activity_id: "act-1" }],
    engagements: [{ engagement_id: "eng-1", activity_required: true }],
    activities: [],
    isLoading: false
  })
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
    useUnsubmitTimesheet: () => ({ mutate: vi.fn() }),
    useCopyPreviousWeek: () => ({ mutate: vi.fn() }),
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

vi.mock("@/hooks/useTimesheetApprovals", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useTimesheetApprovals: () => ({ data: [] }),
    usePeriodLineApprovals: () => ({ data: [] }),
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

describe("TimeSheet partial week hire date (BUG 0306-74)", () => {
  it("does NOT show min alert when partial week hours meet effective minimum", () => {
    customRender(<TimeSheet />);
    expect(screen.queryByText(/weeklyMinNotMet/)).not.toBeInTheDocument();
  });
});
