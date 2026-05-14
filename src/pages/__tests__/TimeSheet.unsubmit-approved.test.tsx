import React from "react";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render as baseRender } from "@/test/utils";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { getWeekMonday } from "@/lib/timesheetUtils";

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

// vi.hoisted runs before vi.mock factories, so refs is accessible inside the factory.
const refs = vi.hoisted(() => ({
  realGetWeekMonday: undefined as ((date: Date) => Date) | undefined,
  unsubmitMutate: vi.fn(),
}));

// Partially mock timesheetUtils so getWeekMonday is a vi.fn() we can override per-test.
// All other exports remain real. Calls to getWeekMonday from INSIDE timesheetUtils
// (e.g. from getWeekInfo) use the internal module binding and are not affected.
vi.mock("@/lib/timesheetUtils", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  refs.realGetWeekMonday = actual.getWeekMonday as (date: Date) => Date;
  return {
    ...actual,
    getWeekMonday: vi.fn(),
  };
});

// ThemeProvider calls localStorage.getItem and exports useTheme — both unavailable/broken
// in jsdom. Replace the whole module so neither ThemeProvider nor ThemeToggle throws.
vi.mock("@/components/theme/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

// --- Hook mocks ---

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } }, user: { id: "user-1" } }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/timesheet" }) };
});

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({
    staffRecord: { staff_id: "staff-1", hire_date: "2020-01-01" },
    isLoading: false,
  }),
}));

// Period is submitted, not locked. Both line approvals are fully approved.
vi.mock("@/hooks/useTimesheetWeek", () => ({
  useTimesheetWeek: () => ({
    period: {
      period_id: "p1",
      submitted_at: "2026-05-14T10:00:00Z",
      is_period_locked: false,
      week_start_date: "2026-05-11",
    },
    entries: [{ hours_logged: 8, engagement_id: "eng-1", activity_id: "act-1" }],
    engagements: [{ engagement_id: "eng-1", activity_required: false }],
    activities: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useTimesheetApprovals", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    usePeriodLineApprovals: () => ({
      data: [
        { approval_id: "a1", status: "approved", engagement_id: "eng-1", period_id: "p1" },
        { approval_id: "a2", status: "approved", engagement_id: "eng-2", period_id: "p1" },
      ],
    }),
  };
});

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

vi.mock("@/hooks/useTimesheetPolicies", () => ({
  useTimesheetPolicies: () => ({ canEdit: true, canSubmit: true, canUnsubmit: true, isLocked: false }),
}));

vi.mock("@/hooks/useWeekStatuses", () => ({
  useWeekStatuses: () => ({ data: [] }),
}));

vi.mock("@/hooks/useHolidays", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
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

// refs.unsubmitMutate is updated in beforeEach so each test gets a fresh spy.
vi.mock("@/hooks/useTimesheetMutations", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useSubmitTimesheet: () => ({ mutate: vi.fn(), isPending: false }),
    useUnsubmitTimesheet: () => ({ mutate: refs.unsubmitMutate, isPending: false }),
    useCopyPreviousWeek: () => ({ mutate: vi.fn(), isPending: false }),
    useCopyToCurrentWeek: () => ({ mutate: vi.fn(), isPending: false }),
    useUpsertTimeEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteTimeEntry: () => ({ mutateAsync: vi.fn() }),
    useDeleteRowEntries: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdatePeriodTotalHours: () => ({ mutateAsync: vi.fn() }),
  };
});

// Lazy import after all mocks are hoisted
import TimeSheet from "../TimeSheet";

// Freeze time at 2026-05-14 (Wednesday) so getWeekMonday(new Date()) = 2026-05-11 (Monday).
// Only fake Date to leave localStorage and other Web APIs intact.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-14T12:00:00"));
});

afterAll(() => {
  vi.useRealTimers();
});

describe("TimeSheet unsubmit-approved (BUG 0508-105)", () => {
  beforeEach(() => {
    refs.unsubmitMutate = vi.fn();
    vi.clearAllMocks();
    // Restore real getWeekMonday for UA1 and UA3.
    // UA2 overrides this before rendering.
    vi.mocked(getWeekMonday).mockImplementation(
      (date: Date) => refs.realGetWeekMonday!(date),
    );
  });

  // UA1: Partner submitted this week -> banner AND "Retirar Envio" button both visible
  it("UA1: shows Retirar Envio when fully approved and current week", () => {
    renderWithRouter(<TimeSheet />);
    expect(screen.getByText("timesheet.unsubmit")).toBeInTheDocument();
  });

  // UA2: Period belongs to a PAST week -> canUnsubmit is false -> button hidden.
  // Technique: make getWeekMonday return the past Monday (May 4) for the useState
  // initializer (first call), and the current Monday (May 11) for the isCurrentWeek
  // useMemo comparison (all subsequent calls).
  // Calls inside timesheetUtils itself (e.g. getWeekInfo) are unaffected because
  // they use the module's internal binding, not the exported mock.
  it("UA2: hides Retirar Envio when fully approved but past week", () => {
    vi.mocked(getWeekMonday)
      .mockReturnValueOnce(new Date("2026-05-04T00:00:00")) // useState init -> past week
      .mockReturnValue(new Date("2026-05-11T00:00:00")); // subsequent calls -> current week

    renderWithRouter(<TimeSheet />);
    expect(screen.queryByText("timesheet.unsubmit")).not.toBeInTheDocument();
  });

  // UA3: Clicking the button calls unsubmitTimesheet.mutate with the correct periodId
  it("UA3: clicking Retirar Envio calls mutate with { periodId: 'p1' }", async () => {
    renderWithRouter(<TimeSheet />);
    const user = userEvent.setup();
    await user.click(screen.getByText("timesheet.unsubmit"));
    expect(refs.unsubmitMutate).toHaveBeenCalledWith({ periodId: "p1" });
  });
});
