import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// TimeSheet decide el retiro de una hoja aprobada por can('timesheet.self_approve')
// (antes: isPartner || isAdmin del enum legacy). Sin este mock, useAuthorization
// corre de verdad y cae fail-closed.
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => false, scope: () => null, isLoading: false }),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { email: "test@test.com" }, session: {} }) }));
vi.mock("@/hooks/useCurrentStaff", () => ({ useCurrentStaff: () => ({ staffRecord: null, isLoading: true }) }));
vi.mock("@/hooks/useTimesheetPolicies", () => ({ useTimesheetPolicies: () => ({ data: null }) }));
vi.mock("@/hooks/useTimesheetWeek", () => ({ useTimesheetWeek: () => ({ period: null, entries: [], engagements: [], activities: [], isLoading: true, isError: false, error: null }) }));
vi.mock("@/hooks/useHolidays", () => ({ useHolidaysForWeek: () => new Map(), useHolidayEngagementId: () => null }));
vi.mock("@/hooks/useAdminActivity", () => ({ useAdminActivityId: () => null }));
vi.mock("@/hooks/useTimesheetApprovals", () => ({ usePeriodLineApprovals: () => ({ data: [] }) }));
vi.mock("@/hooks/useTimesheetMutations", () => ({
  useSubmitTimesheet: () => ({ mutate: vi.fn(), isPending: false }),
  useUnsubmitTimesheet: () => ({ mutate: vi.fn(), isPending: false }),
  useCopyPreviousWeek: () => ({ mutate: vi.fn(), isPending: false }),
  useCopyToCurrentWeek: () => ({ mutate: vi.fn(), isPending: false }), // <--- ensures the hook exists
  useUpsertTimeEntry: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTimeEntry: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRowEntries: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateEntryActivity: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePeriodTotalHours: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useEmsData", () => ({ useGlobalSettings: () => ({ data: [] }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, focusMode }: any) => <div data-testid="app-layout" data-focus-mode={focusMode}>{children}</div>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

import TimeSheet from "../TimeSheet";

describe("TimeSheet focus-mode", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("TF1: renders focusMode in loading branch", () => {
    render(<TimeSheet />);
    expect(screen.getByTestId("app-layout").dataset.focusMode).toBe("true");
  });

  it("TF2: renders Back button in loading branch", () => {
    render(<TimeSheet />);
    expect(screen.getByText("common.back")).toBeInTheDocument();
  });

  it("TF3: Back button navigates on click", async () => {
    render(<TimeSheet />);
    const user = userEvent.setup();
    await user.click(screen.getByText("common.back"));
    expect(mockNavigate).toHaveBeenCalled();
  });
});
