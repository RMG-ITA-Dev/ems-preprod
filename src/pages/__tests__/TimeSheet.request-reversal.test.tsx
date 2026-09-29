import React from "react";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render as baseRender } from "@/test/utils";
import { screen, within } from "@testing-library/react";
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
  requestReversalMutate: vi.fn(),
  unsubmitMutate: vi.fn(),
  roleKey: "partner" as string | null,
  // UA1-style default: both lines approved. RR6 overrides to a partial approval.
  lineApprovals: [
    { approval_id: "a1", status: "approved", engagement_id: "eng-1", period_id: "p1" },
    { approval_id: "a2", status: "approved", engagement_id: "eng-2", period_id: "p1" },
  ] as Array<{ approval_id: string; status: string; engagement_id: string; period_id: string }>,
  isPeriodLocked: false,
}));

vi.mock("@/lib/timesheetUtils", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  refs.realGetWeekMonday = actual.getWeekMonday as (date: Date) => Date;
  return {
    ...actual,
    getWeekMonday: vi.fn(),
  };
});

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, scope: () => null, isLoading: false, roleKey: refs.roleKey }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } }, user: { id: "user-1" } }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({
    role: "partner",
    isPartner: true,
    isAdmin: false, isDirector: false, isManager: false, isSenior: false,
    isSemisenior: false, isStaff: false, isViewer: false, isSQR: false,
    isSpecialistIT: false, isSpecialistTAX: false,
    isLoading: false, hasError: false, error: null, isRoleMissing: false,
  }),
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

vi.mock("@/hooks/useTimesheetWeek", () => ({
  useTimesheetWeek: () => ({
    period: {
      period_id: "p1",
      submitted_at: "2026-05-14T10:00:00Z",
      is_period_locked: refs.isPeriodLocked,
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
    usePeriodLineApprovals: () => ({ data: refs.lineApprovals }),
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

vi.mock("@/components/theme/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

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

vi.mock("@/hooks/useTimesheetReversals", () => ({
  useRequestTimesheetReversal: () => ({ mutate: refs.requestReversalMutate, isPending: false }),
}));

// Lazy import after all mocks are hoisted
import TimeSheet from "../TimeSheet";

// Freeze time at 2026-05-14 (Wednesday) so getWeekMonday(new Date()) = 2026-05-11 (Monday).
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-14T12:00:00"));
});

afterAll(() => {
  vi.useRealTimers();
});

function setPastWeek() {
  vi.mocked(getWeekMonday)
    .mockReturnValueOnce(new Date("2026-05-04T00:00:00")) // useState init -> past week
    .mockReturnValue(new Date("2026-05-11T00:00:00")); // subsequent calls -> current week
}

describe("TimeSheet request-reversal (BUG 0923-209)", () => {
  beforeEach(() => {
    refs.requestReversalMutate = vi.fn();
    refs.unsubmitMutate = vi.fn();
    refs.roleKey = "partner";
    refs.isPeriodLocked = false;
    refs.lineApprovals = [
      { approval_id: "a1", status: "approved", engagement_id: "eng-1", period_id: "p1" },
      { approval_id: "a2", status: "approved", engagement_id: "eng-2", period_id: "p1" },
    ];
    vi.clearAllMocks();
    vi.mocked(getWeekMonday).mockImplementation(
      (date: Date) => refs.realGetWeekMonday!(date),
    );
  });

  // RR1: partner, aprobada, semana pasada -> Solicitar reversión presente, Unsubmit ausente.
  it("RR1: shows requestReversal (and hides unsubmit) for partner, fully approved, past week", () => {
    setPastWeek();
    renderWithRouter(<TimeSheet />);
    expect(screen.getByText("timesheet.requestReversal")).toBeInTheDocument();
    expect(screen.queryByText("timesheet.unsubmit")).not.toBeInTheDocument();
  });

  // RR2: director, aprobada, semana actual -> Solicitar reversión presente (director nunca
  // puede "Retirar Envío" a sí mismo, iteración 6 de review.md).
  it("RR2: shows requestReversal for director, fully approved, current week", () => {
    refs.roleKey = "director";
    renderWithRouter(<TimeSheet />);
    expect(screen.getByText("timesheet.requestReversal")).toBeInTheDocument();
  });

  // RR3: partner, aprobada, semana actual -> exclusión mutua: sólo "Retirar Envío".
  it("RR3: hides requestReversal for partner, fully approved, current week", () => {
    renderWithRouter(<TimeSheet />);
    expect(screen.getByText("timesheet.unsubmit")).toBeInTheDocument();
    expect(screen.queryByText("timesheet.requestReversal")).not.toBeInTheDocument();
  });

  // RR4/RR5: diálogo -- razón vacía deshabilita confirmar; razón escrita llama mutate.
  it("RR4: disables confirm with an empty or whitespace-only reason", async () => {
    setPastWeek();
    renderWithRouter(<TimeSheet />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    await user.click(screen.getByText("timesheet.requestReversal"));

    const dialog = screen.getByRole("dialog");
    const confirmButton = within(dialog).getByRole("button", { name: "timesheet.requestReversal" });
    expect(confirmButton).toBeDisabled();

    const textarea = within(dialog).getByPlaceholderText("approval.notesPlaceholder");
    await user.type(textarea, "   ");
    expect(confirmButton).toBeDisabled();
  });

  it("RR5: confirms with the trimmed reason and calls mutate with scope week", async () => {
    setPastWeek();
    renderWithRouter(<TimeSheet />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    await user.click(screen.getByText("timesheet.requestReversal"));

    const dialog = screen.getByRole("dialog");
    const textarea = within(dialog).getByPlaceholderText("approval.notesPlaceholder");
    await user.type(textarea, "  necesito corregir horas  ");

    const confirmButton = within(dialog).getByRole("button", { name: "timesheet.requestReversal" });
    expect(confirmButton).not.toBeDisabled();
    await user.click(confirmButton);

    expect(refs.requestReversalMutate).toHaveBeenCalledWith(
      { periodId: "p1", scope: "week", engagementId: null, reason: "necesito corregir horas" },
      expect.anything(),
    );
  });

  // RR6: período parcialmente aprobado, semana pasada -> ningún botón de reversión.
  it("RR6: hides requestReversal when the period is only partially approved", () => {
    setPastWeek();
    refs.lineApprovals = [
      { approval_id: "a1", status: "approved", engagement_id: "eng-1", period_id: "p1" },
      { approval_id: "a2", status: "pending", engagement_id: "eng-2", period_id: "p1" },
    ];
    renderWithRouter(<TimeSheet />);
    expect(screen.queryByText("timesheet.requestReversal")).not.toBeInTheDocument();
  });

  // RR7: is_period_locked = true -> ningún botón, ni Unsubmit ni Solicitar reversión.
  it("RR7: hides both buttons when the period is locked", () => {
    refs.isPeriodLocked = true;
    renderWithRouter(<TimeSheet />);
    expect(screen.queryByText("timesheet.unsubmit")).not.toBeInTheDocument();
    expect(screen.queryByText("timesheet.requestReversal")).not.toBeInTheDocument();
  });
});
