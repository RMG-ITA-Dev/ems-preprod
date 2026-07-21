import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import React from "react";
import { render as baseRender } from "@/test/utils";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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

// ThemeProvider calls localStorage.getItem inside vi.useFakeTimers({ toFake: ["Date"] }),
// which breaks localStorage in jsdom. Replace the whole module (same fix as unsubmit-approved test).
vi.mock("@/components/theme/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

// vi.hoisted so refs are accessible inside vi.mock factories.
// Mutations happen in beforeEach/test bodies so each render sees fresh values.
const refs = vi.hoisted(() => ({
  holidayMap: new Map<string, string>([
    ["2026-06-04", "Corpus Christi"],
    ["2026-06-05", "Holiday 2"],
  ]),
  holidayEngagementId: "hol-eng-1" as string | null,
  submittedAt: null as string | null,
  entries: [{ hours_logged: 8, engagement_id: "eng-1", activity_id: "act-1" }] as
    { hours_logged: number; engagement_id: string; activity_id: string }[],
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

// refs.submittedAt and refs.holidayMap are read at hook-call time (render), not factory-setup time.
vi.mock("@/hooks/useTimesheetWeek", () => ({
  useTimesheetWeek: () => ({
    period: {
      period_id: "p1",
      is_period_locked: false,
      submitted_at: refs.submittedAt,
    },
    entries: refs.entries,
    engagements: [{ engagement_id: "eng-1", activity_required: true }],
    activities: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
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

vi.mock("@/hooks/useTimesheetApprovals", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useTimesheetApprovals: () => ({ data: [] }),
    usePeriodLineApprovals: () => ({ data: [] }),
  };
});

// refs.holidayMap and refs.holidayEngagementId are read at hook-call time.
vi.mock("@/hooks/useHolidays", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useHolidaysForWeek: () => refs.holidayMap,
    useHolidayEngagementId: () => refs.holidayEngagementId,
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

// Lazy import after all mocks are hoisted
import TimeSheet from "../TimeSheet";

// Freeze time at 2026-05-14 (Wednesday) so getWeekMonday(new Date()) = 2026-05-11 (Monday).
// This ensures isCurrentWeek=true → isWithinEditableWindow=true for all tests.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-14T12:00:00"));
});

afterAll(() => {
  vi.useRealTimers();
});

describe("TimeSheet holiday week hint (0513-112)", () => {
  beforeEach(() => {
    // Reset to HH1 baseline before each test
    refs.holidayMap = new Map([
      ["2026-06-04", "Corpus Christi"],
      ["2026-06-05", "Holiday 2"],
    ]);
    refs.holidayEngagementId = "hol-eng-1";
    refs.submittedAt = null;
    refs.entries = [{ hours_logged: 8, engagement_id: "eng-1", activity_id: "act-1" }];
  });

  // HH1: week has holidays, engagement configured, sheet editable → hint visible
  it("HH1: shows holidayWeekHint when week has holidays and engagement is configured", () => {
    renderWithRouter(<TimeSheet />);
    expect(screen.getByText(/holidayWeekHint/)).toBeInTheDocument();
  });

  // HH2: engagement not configured (null) → hint hidden
  it("HH2: hides holidayWeekHint when holidayEngagementId is null", () => {
    refs.holidayEngagementId = null;
    renderWithRouter(<TimeSheet />);
    expect(screen.queryByText(/holidayWeekHint/)).not.toBeInTheDocument();
  });

  // HH3: no holidays in the week → hint hidden
  it("HH3: hides holidayWeekHint when the week has no holidays", () => {
    refs.holidayMap = new Map();
    renderWithRouter(<TimeSheet />);
    expect(screen.queryByText(/holidayWeekHint/)).not.toBeInTheDocument();
  });

  // HH4: period already submitted → hint hidden
  it("HH4: hides holidayWeekHint when the period is already submitted", () => {
    refs.submittedAt = "2026-05-14T10:00:00Z";
    renderWithRouter(<TimeSheet />);
    expect(screen.queryByText(/holidayWeekHint/)).not.toBeInTheDocument();
  });

  // HH5 (BUG 0526-122): useHolidaysForWeek already filters by staff office before
  // TimeSheet ever sees the map, so a holiday exclusive to another office is
  // equivalent — from TimeSheet's perspective — to "no holidays this week".
  it("HH5: hides holidayWeekHint when the week's only holiday belongs to another office (already filtered out upstream)", () => {
    refs.holidayMap = new Map(); // useHolidaysForWeek would have excluded the other office's holiday
    renderWithRouter(<TimeSheet />);
    expect(screen.queryByText(/holidayWeekHint/)).not.toBeInTheDocument();
  });

  // HH6 (BUG 0526-122): a brand-new week with zero saved entries must still show
  // the hint — this is precisely when the user needs the proactive warning,
  // before they've logged any hours for the holiday engagement.
  it("HH6: shows holidayWeekHint on a blank week with no saved entries yet", () => {
    refs.entries = [];
    renderWithRouter(<TimeSheet />);
    expect(screen.getByText(/holidayWeekHint/)).toBeInTheDocument();
  });
});
