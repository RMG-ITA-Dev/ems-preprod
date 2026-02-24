import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock modules
const mockNavigate = vi.fn();
const mockAllowNextNavigation = vi.fn();
const mockBlocker = { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() };

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: mockBlocker, allowNextNavigation: mockAllowNextNavigation, isDirty: false }),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { email: "test@test.com" }, session: {} }) }));
vi.mock("@/hooks/useCurrentStaff", () => ({ useCurrentStaff: () => ({ staffRecord: null, isLoading: true }) }));
vi.mock("@/hooks/useTimesheetPolicies", () => ({ useTimesheetPolicies: () => ({ data: null }) }));
vi.mock("@/hooks/useTimesheetWeek", () => ({ useTimesheetWeek: () => ({ period: null, entries: [], engagements: [], activities: [], isLoading: true, isError: false, error: null }) }));
vi.mock("@/hooks/useHolidays", () => ({ useHolidaysForWeek: () => new Map(), useHolidayEngagementId: () => null }));
vi.mock("@/hooks/useAdminActivity", () => ({ useAdminActivityId: () => null }));
vi.mock("@/hooks/useTimesheetApprovals", () => ({ usePeriodLineApprovals: () => ({ data: [] }) }));
vi.mock("@/hooks/useTimesheetMutations", () => ({ useSubmitTimesheet: () => ({ mutate: vi.fn(), isPending: false }), useUnsubmitTimesheet: () => ({ mutate: vi.fn(), isPending: false }), useCopyPreviousWeek: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/useEmsData", () => ({ useGlobalSettings: () => ({ data: [] }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, focusMode }: any) => <div data-testid="app-layout" data-focus-mode={focusMode}>{children}</div>,
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => <div data-testid="leave-page-dialog" />,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

import TimeSheet from "../TimeSheet";

describe("TimeSheet focus-lock", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TF1: renders focusMode in loading branch", () => {
    render(<TimeSheet />);
    expect(screen.getByTestId("app-layout").dataset.focusMode).toBe("true");
  });

  it("TF2: renders Back button in loading branch", () => {
    render(<TimeSheet />);
    expect(screen.getByText("common.back")).toBeInTheDocument();
  });

  it("TF3: Back button calls allowNextNavigation before navigate", async () => {
    render(<TimeSheet />);
    const user = userEvent.setup();
    await user.click(screen.getByText("common.back"));
    expect(mockAllowNextNavigation).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalled();
    const allowOrder = mockAllowNextNavigation.mock.invocationCallOrder[0];
    const navOrder = mockNavigate.mock.invocationCallOrder[0];
    expect(allowOrder).toBeLessThan(navOrder);
  });

  it("TF4: LeavePageDialog renders", () => {
    render(<TimeSheet />);
    expect(screen.getByTestId("leave-page-dialog")).toBeInTheDocument();
  });
});
